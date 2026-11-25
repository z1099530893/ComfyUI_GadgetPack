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
      `#gadgetpack-monitors-root .gadgetpack-monitor .gadgetpack-content {height: ${this.height}px; width: ${this.width}px;}` +
      `#gadgetpack-monitors-root .gadgetpack-clean-btn {height: ${this.height}px;}`;
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

function notify(summary, detail, severity = "success") {
  try {
    app.extensionManager.toast.add({ severity, summary, detail, life: 3000 });
  } catch (e) {
    console.log(`[GadgetPack] ${summary}${detail ? ` - ${detail}` : ""}`);
  }
}

function confirmDialog({ title, message, confirmText = "确定", cancelText = "取消" }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "gadgetpack-modal-overlay";

    const card = document.createElement("div");
    card.className = "gadgetpack-modal";

    const heading = document.createElement("div");
    heading.className = "gadgetpack-modal-title";
    heading.textContent = title;

    const body = document.createElement("div");
    body.className = "gadgetpack-modal-message";
    body.textContent = message;

    const footer = document.createElement("div");
    footer.className = "gadgetpack-modal-footer";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "gadgetpack-modal-btn";
    cancelBtn.textContent = cancelText;

    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.className = "gadgetpack-modal-btn gadgetpack-modal-btn-primary";
    okBtn.textContent = confirmText;

    footer.append(cancelBtn, okBtn);
    card.append(heading, body, footer);
    overlay.append(card);
    document.body.append(overlay);
    okBtn.focus();

    const close = (result) => {
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      resolve(result);
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(false);
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }
    };

    cancelBtn.addEventListener("click", () => close(false));
    okBtn.addEventListener("click", () => close(true));
    document.addEventListener("keydown", onKey, true);
  });
}

function freedText(data) {
  const parts = [];
  if (typeof data.vram_freed === "number") parts.push(`显存 ${formatBytes(data.vram_freed)}`);
  if (typeof data.ram_freed === "number") parts.push(`内存 ${formatBytes(data.ram_freed)}`);
  return parts.length ? `已释放 ${parts.join(" / ")}` : "已卸载模型并清空缓存";
}

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

    // 清理前确认
    app.ui.settings.addSetting({
      id: "GadgetPack.ConfirmCleanup",
      name: "清理前确认",
      category: ["GadgetPack", `${prefix} 配置`, "confirm"],
      type: "boolean",
      defaultValue: false,
      tooltip: "点击监控条右侧的清理按钮时先弹出确认框，防止误触",
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

    // 一键清理按钮（监控条最右端）
    const cleanBtn = document.createElement("button");
    cleanBtn.type = "button";
    cleanBtn.className = "gadgetpack-clean-btn";
    cleanBtn.style.order = "999";
    cleanBtn.textContent = "🧹";
    cleanBtn.title = "清理内存显存";
    bar.root.append(cleanBtn);

    let running = false;
    let queued = 0;

    const syncCleanBtn = () => {
      const busy = running || queued > 0;
      cleanBtn.disabled = busy;
      cleanBtn.title = busy ? "工作流运行中，暂不可用" : "清理内存显存";
    };

    api.addEventListener("status", (event) => {
      queued = event?.detail?.exec_info?.queue_remaining ?? 0;
      syncCleanBtn();
    });
    api.addEventListener("execution_start", () => {
      running = true;
      syncCleanBtn();
    });
    for (const name of ["execution_success", "execution_error", "execution_interrupted"]) {
      api.addEventListener(name, () => {
        running = false;
        syncCleanBtn();
      });
    }

    cleanBtn.addEventListener("click", async () => {
      if (cleanBtn.disabled) return;

      if (await setting("GadgetPack.ConfirmCleanup", false)) {
        const ok = await confirmDialog({
          title: "清理内存显存",
          message: "将卸载所有已加载的模型，并清空显存与内存缓存，确定继续吗？",
          confirmText: "立即清理",
          cancelText: "取消",
        });
        if (!ok) return;
      }

      cleanBtn.disabled = true;
      cleanBtn.classList.add("is-cleaning");
      cleanBtn.textContent = "⏳";

      try {
        const resp = await api.fetchApi("/gadgetpack/cleanup", {
          method: "POST",
          cache: "no-store",
        });
        const data = await resp.json().catch(() => ({}));

        if (resp.status === 409) {
          notify("清理已取消", data.message || "工作流运行中", "warn");
        } else if (!resp.ok) {
          notify("清理失败", data.error || resp.statusText, "error");
        } else {
          notify("已清理内存显存", freedText(data));
        }
      } catch (e) {
        notify("清理失败", String(e), "error");
      } finally {
        cleanBtn.textContent = "🧹";
        cleanBtn.classList.remove("is-cleaning");
        syncCleanBtn();
      }
    });

    syncCleanBtn();

    api.addEventListener(
      "gadgetpack.monitor",
      (event) => {
        if (event?.detail) bar.updateDisplay(event.detail);
      },
      false,
    );
  },
});
