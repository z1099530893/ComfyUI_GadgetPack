import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ComfyButtonGroup } from "../../scripts/ui/components/buttonGroup.js";
import { addStylesheet } from "../../scripts/utils.js";

addStylesheet("extensions/ComfyUI_GadgetPack/monitor.css");

const Colors = {
  CPU: "#0AA015",
  RAM: "#07630D",
  DISK: "#730F92",
  GPU: "#0C86F4",
  VRAM: "#176EC7",
  TEMP_START: "#00ff00",
  TEMP_END: "#ff0000",
};

function formatBytes(bytes) {
  if (!bytes || bytes < 0) return "0 Bytes";
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

class MonitorBar {
  constructor() {
    this.rate = 0.5;
    this.width = 60;
    this.height = 30;
    this.monitors = [];
    this.maxVRAM = {};
    this.root = null;
    this.styleSheet = document.createElement("style");
    this.styleSheet.id = "gadgetpack-monitors-size";
    this.styleSheet.type = "text/css";
    document.head.appendChild(this.styleSheet);
  }

  attach(buttonGroupElement) {
    this.root = buttonGroupElement;
    this.root.id = "gadgetpack-monitors-root";
    this.root.classList.add("gadgetpack-monitors-container");
  }

  addMonitor(opts) {
    if (!this.root) return null;

    const element = document.createElement("div");
    element.classList.add("gadgetpack-monitor");
    const textEl = document.createElement("div");
    textEl.classList.add("gadgetpack-text");
    textEl.textContent = opts.label;
    const content = document.createElement("div");
    content.classList.add("gadgetpack-content");
    const slider = document.createElement("div");
    slider.classList.add("gadgetpack-slider");
    slider.style.backgroundColor = opts.color;
    const labelEl = document.createElement("div");
    labelEl.classList.add("gadgetpack-label");
    labelEl.textContent = "0%";

    content.append(slider);
    content.append(labelEl);
    element.append(textEl);
    element.append(content);
    this.root.append(element);

    const monitor = { ...opts, element, textEl, slider, labelEl, order: this.monitors.length };
    this.monitors.push(monitor);
    this.applyOrder();
    this.applySize();
    this.applyRate();
    return monitor;
  }

  applyOrder() {
    this.monitors.forEach((m, index) => {
      m.element.style.order = `${index}`;
    });
  }

  applySize() {
    this.styleSheet.innerText =
      `#gadgetpack-monitors-root .gadgetpack-monitor .gadgetpack-content {height: ${this.height}px; width: ${this.width}px;}`;
  }

  applyRate() {
    this.monitors.forEach((m) => {
      m.slider.style.transition = `width ${Number(this.rate).toFixed(1)}s`;
    });
  }

  show(monitor, visible) {
    if (monitor?.element) monitor.element.style.display = visible ? "flex" : "none";
  }

  updateMonitor(monitor, percent, used, total) {
    if (!monitor || percent === undefined || percent === null || percent < 0) return;

    let postfix = "";
    if (used !== undefined && total !== undefined && total > 0) {
      const index = monitor.gpuIndex ?? 0;
      if (!this.maxVRAM[index] || this.maxVRAM[index] > total) this.maxVRAM[index] = 0;
      if (used > this.maxVRAM[index]) this.maxVRAM[index] = used;
      postfix = ` - ${formatBytes(used)} / ${formatBytes(total)} Max: ${formatBytes(this.maxVRAM[index])}`;
    }

    const prefix = monitor.title ? `${monitor.title} - ` : "";
    const floor = Math.floor(percent);
    monitor.element.title = `${prefix}${floor}${monitor.symbol}${postfix}`;
    monitor.labelEl.textContent = `${floor}${monitor.symbol}`;
    monitor.slider.style.width = `${floor}%`;

    if (monitor.colorFinal) {
      monitor.slider.style.backgroundColor =
        `color-mix(in srgb, ${monitor.colorFinal} ${Math.min(Math.max(floor, 0), 100)}%, ${monitor.color})`;
    }
  }

  updateDisplay(data) {
    if (!data) return;

    for (const m of this.monitors) {
      switch (m.kind) {
        case "cpu":
          this.updateMonitor(m, data.cpu_utilization);
          break;
        case "ram":
          this.updateMonitor(m, data.ram_used_percent, data.ram_used, data.ram_total);
          break;
        case "hdd":
          this.updateMonitor(m, data.hdd_used_percent, data.hdd_used, data.hdd_total);
          break;
        case "gpu": {
          const gpu = data.gpus?.[m.gpuIndex];
          if (gpu) this.updateMonitor(m, gpu.gpu_utilization);
          break;
        }
        case "vram": {
          const gpu = data.gpus?.[m.gpuIndex];
          if (gpu) this.updateMonitor(m, gpu.vram_used_percent, gpu.vram_used, gpu.vram_total);
          break;
        }
        case "temp": {
          const gpu = data.gpus?.[m.gpuIndex];
          if (gpu) this.updateMonitor(m, gpu.gpu_temperature);
          break;
        }
      }
    }
  }
}

const bar = new MonitorBar();

async function fetchData(what) {
  const resp = await api.fetchApi(`/gadgetpack/monitor/${what}`, { method: "GET", cache: "no-store" });
  if (resp.status !== 200) throw new Error(resp.statusText);
  return await resp.json();
}

async function patchServer(data) {
  const resp = await api.fetchApi("/gadgetpack/monitor", {
    method: "PATCH",
    body: JSON.stringify(data),
    cache: "no-store",
  });
  if (resp.status !== 200) throw new Error(resp.statusText);
}

async function patchServerGPU(index, data) {
  const resp = await api.fetchApi(`/gadgetpack/monitor/GPU/${index}`, {
    method: "PATCH",
    body: JSON.stringify(data),
    cache: "no-store",
  });
  if (resp.status !== 200) throw new Error(resp.statusText);
}

async function setting(id, def) {
  try {
    const value = await app.extensionManager.setting.get(id);
    return value === undefined ? def : value;
  } catch {
    return def;
  }
}

const monitorSettings = {};

app.registerExtension({
  name: "GadgetPack.monitor",
  async setup() {
    const prefix = "🪛";

    // 刷新率
    app.ui.settings.addSetting({
      id: "GadgetPack.RefreshRate",
      name: "每秒刷新次数",
      category: ["GadgetPack", `${prefix} 配置`, "refresh"],
      tooltip: "监控刷新间隔（秒），0 表示停止刷新",
      type: "slider",
      attrs: { min: 0, max: 2, step: 0.25 },
      defaultValue: 0.5,
      onChange: async (value) => {
        const rate = parseFloat(value);
        if (isNaN(rate)) return;
        try {
          await patchServer({ rate });
        } catch (e) {
          console.error(e);
        }
        bar.rate = rate;
        bar.applyRate();
        if (rate === 0) {
          bar.updateDisplay({
            cpu_utilization: 0,
            ram_total: 0,
            ram_used: 0,
            ram_used_percent: 0,
            hdd_total: 0,
            hdd_used: 0,
            hdd_used_percent: 0,
            gpus: [{ gpu_utilization: 0, gpu_temperature: 0, vram_total: 0, vram_used: 0, vram_used_percent: 0 }],
          });
        }
      },
    });

    // 宽度
    app.ui.settings.addSetting({
      id: "GadgetPack.MonitorWidth",
      name: "像素宽度",
      category: ["GadgetPack", `${prefix} 配置`, "width"],
      type: "slider",
      attrs: { min: 60, max: 100, step: 1 },
      defaultValue: 60,
      onChange: (value) => {
        const width = parseInt(value);
        if (isNaN(width)) return;
        bar.width = width;
        bar.applySize();
      },
    });

    // 高度
    app.ui.settings.addSetting({
      id: "GadgetPack.MonitorHeight",
      name: "像素高度",
      category: ["GadgetPack", `${prefix} 配置`, "height"],
      type: "slider",
      attrs: { min: 16, max: 50, step: 1 },
      defaultValue: 30,
      onChange: (value) => {
        const height = parseInt(value);
        if (isNaN(height)) return;
        bar.height = height;
        bar.applySize();
      },
    });

    // CPU
    app.ui.settings.addSetting({
      id: "GadgetPack.ShowCpu",
      name: "CPU 使用率",
      category: ["GadgetPack", `${prefix} 硬件`, "Cpu"],
      type: "boolean",
      label: "CPU",
      symbol: "%",
      defaultValue: true,
      onChange: async (value) => {
        try {
          await patchServer({ switchCPU: value });
        } catch (e) {
          console.error(e);
        }
        bar.show(monitorSettings["GadgetPack.ShowCpu"], value);
      },
    });

    // RAM
    app.ui.settings.addSetting({
      id: "GadgetPack.ShowRam",
      name: "内存使用",
      category: ["GadgetPack", `${prefix} 硬件`, "Ram"],
      type: "boolean",
      label: "RAM",
      symbol: "%",
      defaultValue: true,
      onChange: async (value) => {
        try {
          await patchServer({ switchRAM: value });
        } catch (e) {
          console.error(e);
        }
        bar.show(monitorSettings["GadgetPack.ShowRam"], value);
      },
    });

    // HDD 开关
    app.ui.settings.addSetting({
      id: "GadgetPack.ShowHdd",
      name: "显示硬盘占用",
      category: ["GadgetPack", `${prefix} 硬盘`, "Show"],
      type: "boolean",
      label: "HDD",
      symbol: "%",
      defaultValue: true,
      onChange: async (value) => {
        try {
          await patchServer({ switchHDD: value });
        } catch (e) {
          console.error(e);
        }
        bar.show(monitorSettings["GadgetPack.ShowHdd"], value);
      },
    });

    // 分区选择
    let hdds = [];
    try {
      hdds = await fetchData("HDD");
    } catch (e) {
      console.error(e);
    }
    app.ui.settings.addSetting({
      id: "GadgetPack.WhichHdd",
      name: "显示的磁盘分区",
      category: ["GadgetPack", `${prefix} 硬盘`, "Which"],
      type: "combo",
      defaultValue: hdds[0] ?? "/",
      options: hdds,
      onChange: async (value) => {
        try {
          await patchServer({ whichHDD: value });
        } catch (e) {
          console.error(e);
        }
      },
    });

    // 顶栏容器
    const buttonGroup = new ComfyButtonGroup();
    app.menu?.settingsGroup.element.before(buttonGroup.element);
    bar.attach(buttonGroup.element);

    bar.rate = parseFloat(await setting("GadgetPack.RefreshRate", 0.5));
    bar.width = parseInt(await setting("GadgetPack.MonitorWidth", 60));
    bar.height = parseInt(await setting("GadgetPack.MonitorHeight", 30));

    // CPU / RAM / HDD
    monitorSettings["GadgetPack.ShowCpu"] = bar.addMonitor({
      kind: "cpu",
      label: "CPU",
      symbol: "%",
      color: Colors.CPU,
      title: "",
    });
    monitorSettings["GadgetPack.ShowRam"] = bar.addMonitor({
      kind: "ram",
      label: "RAM",
      symbol: "%",
      color: Colors.RAM,
      title: "",
    });

    // GPU
    let gpus = [];
    try {
      gpus = await fetchData("GPU");
    } catch (e) {
      console.error(e);
    }

    const moreThanOne = gpus.length > 1;
    gpus.forEach(({ name, index }) => {
      const gpuLabel = moreThanOne ? `GPU ${index}` : "GPU";
      const vramLabel = moreThanOne ? `VRAM ${index}` : "VRAM";
      const tempLabel = moreThanOne ? `Temp ${index}` : "Temp";
      const title = `${index}: ${name}`;

      app.ui.settings.addSetting({
        id: `GadgetPack.ShowGpuUsage${index}`,
        name: `GPU ${index} 使用率`,
        category: ["GadgetPack", `${prefix} 显示 GPU [${index}] ${name}`, "Usage"],
        type: "boolean",
        defaultValue: true,
        onChange: async (value) => {
          try {
            await patchServerGPU(index, { utilization: value });
          } catch (e) {
            console.error(e);
          }
          bar.show(monitorSettings[`GadgetPack.ShowGpuUsage${index}`], value);
        },
      });
      monitorSettings[`GadgetPack.ShowGpuUsage${index}`] = bar.addMonitor({
        kind: "gpu",
        gpuIndex: index,
        label: gpuLabel,
        symbol: "%",
        color: Colors.GPU,
        title,
      });

      app.ui.settings.addSetting({
        id: `GadgetPack.ShowGpuVram${index}`,
        name: `GPU ${index} 显存`,
        category: ["GadgetPack", `${prefix} 显示 GPU [${index}] ${name}`, "VRAM"],
        type: "boolean",
        defaultValue: true,
        onChange: async (value) => {
          try {
            await patchServerGPU(index, { vram: value });
          } catch (e) {
            console.error(e);
          }
          bar.show(monitorSettings[`GadgetPack.ShowGpuVram${index}`], value);
        },
      });
      monitorSettings[`GadgetPack.ShowGpuVram${index}`] = bar.addMonitor({
        kind: "vram",
        gpuIndex: index,
        label: vramLabel,
        symbol: "%",
        color: Colors.VRAM,
        title,
      });

      app.ui.settings.addSetting({
        id: `GadgetPack.ShowGpuTemperature${index}`,
        name: `GPU ${index} 温度`,
        category: ["GadgetPack", `${prefix} 显示 GPU [${index}] ${name}`, "Temperature"],
        type: "boolean",
        defaultValue: true,
        onChange: async (value) => {
          try {
            await patchServerGPU(index, { temperature: value });
          } catch (e) {
            console.error(e);
          }
          bar.show(monitorSettings[`GadgetPack.ShowGpuTemperature${index}`], value);
        },
      });
      monitorSettings[`GadgetPack.ShowGpuTemperature${index}`] = bar.addMonitor({
        kind: "temp",
        gpuIndex: index,
        label: tempLabel,
        symbol: "°",
        color: Colors.TEMP_START,
        colorFinal: Colors.TEMP_END,
        title,
      });
    });

    // HDD 放在最后
    monitorSettings["GadgetPack.ShowHdd"] = bar.addMonitor({
      kind: "hdd",
      label: "HDD",
      symbol: "%",
      color: Colors.DISK,
      title: "",
    });

    // 应用初始显示状态
    for (const key of [
      "GadgetPack.ShowCpu",
      "GadgetPack.ShowRam",
      "GadgetPack.ShowHdd",
      ...gpus.map((g) => `GadgetPack.ShowGpuUsage${g.index}`),
      ...gpus.map((g) => `GadgetPack.ShowGpuVram${g.index}`),
      ...gpus.map((g) => `GadgetPack.ShowGpuTemperature${g.index}`),
    ]) {
      bar.show(monitorSettings[key], await setting(key, true));
    }

    bar.applyOrder();
    bar.applySize();
    bar.applyRate();

    api.addEventListener(
      "gadgetpack.monitor",
      (event) => {
        if (event?.detail) bar.updateDisplay(event.detail);
      },
      false,
    );
  },
});
