"""硬件资源采集：CPU / 内存 / 磁盘 / GPU（利用率、VRAM、温度）。"""

import asyncio
import os
import platform
import threading

import psutil
import server

try:
    import torch
except Exception:
    torch = None

try:
    import comfy.model_management
except Exception:
    comfy.model_management = None


def _log(msg):
    print(f"[GadgetPack] {msg}")


def get_drives_info():
    drives = []
    for partition in psutil.disk_partitions():
        drives.append(partition.mountpoint)
    return drives


class CGPUInfo:
    """仅负责 GPU 信息采集（pynvml）。异常时保持 -1，不中断监控。"""

    def __init__(self):
        self.pynvml = None
        self.pynvmlLoaded = False
        self.anygpuLoaded = False
        self.gpus = []
        self.gpusUtilization = []
        self.gpusVRAM = []
        self.gpusTemperature = []
        self.switchGPU = True
        self.switchVRAM = True
        self.switchTemperature = True
        self.cudaDevicesFound = 0
        self.cudaDevice = "cpu"

        try:
            import pynvml
            pynvml.nvmlInit()
            self.pynvml = pynvml
            self.pynvmlLoaded = True
            _log("pynvml (NVIDIA) 初始化成功")
        except Exception as e:
            _log(f"pynvml 初始化失败: {e}")

        try:
            if comfy.model_management is not None:
                self.torchDevice = comfy.model_management.get_torch_device_name(
                    comfy.model_management.get_torch_device()
                )
            else:
                self.torchDevice = "cpu"
        except Exception as e:
            _log(f"无法获取默认 torch 设备: {e}")
            self.torchDevice = "cpu"

        if self.pynvmlLoaded:
            try:
                self.cudaDevicesFound = self.pynvml.nvmlDeviceGetCount()
            except Exception as e:
                _log(f"无法获取 GPU 数量: {e}")
                self.cudaDevicesFound = 0

        if self.cudaDevicesFound > 0:
            for index in range(self.cudaDevicesFound):
                handle = self.pynvml.nvmlDeviceGetHandleByIndex(index)
                name = "Unknown GPU"
                try:
                    name = self.pynvml.nvmlDeviceGetName(handle)
                    try:
                        name = name.decode("utf-8", errors="ignore")
                    except AttributeError:
                        pass
                except Exception as e:
                    _log(f"无法获取 GPU 名称: {e}")
                self.gpus.append({"index": index, "name": name})
                self.gpusUtilization.append(True)
                self.gpusVRAM.append(True)
                self.gpusTemperature.append(True)
                _log(f"GPU {index}: {name}")
            self.anygpuLoaded = True
        else:
            _log("未检测到可用 GPU，GPU 监控关闭")

        self.cudaDevice = "cpu" if self.torchDevice == "cpu" else "cuda"

    def getInfo(self):
        return self.gpus

    def getStatus(self):
        gpus = []

        if self.cudaDevice == "cpu" or not self.anygpuLoaded:
            gpus.append(
                {
                    "gpu_utilization": -1,
                    "gpu_temperature": -1,
                    "vram_total": -1,
                    "vram_used": -1,
                    "vram_used_percent": -1,
                }
            )
            return {"device_type": "cpu", "gpus": gpus}

        for index in range(self.cudaDevicesFound):
            handle = self.pynvml.nvmlDeviceGetHandleByIndex(index)
            utilization = -1
            temperature = -1
            vramUsed = -1
            vramTotal = -1
            vramPercent = -1

            if self.switchGPU and self.gpusUtilization[index]:
                try:
                    utilization = self.pynvml.nvmlDeviceGetUtilizationRates(handle).gpu
                except Exception as e:
                    _log(f"读取 GPU 利用率失败，关闭该监控: {e}")
                    self.switchGPU = False

            if self.switchVRAM and self.gpusVRAM[index]:
                try:
                    memory = self.pynvml.nvmlDeviceGetMemoryInfo(handle)
                    vramUsed = memory.used
                    vramTotal = memory.total
                    if vramTotal:
                        vramPercent = vramUsed / vramTotal * 100
                except Exception as e:
                    _log(f"读取 VRAM 失败，关闭该监控: {e}")
                    self.switchVRAM = False

            if self.switchTemperature and self.gpusTemperature[index]:
                try:
                    temperature = self.pynvml.nvmlDeviceGetTemperature(
                        handle, self.pynvml.NVML_TEMPERATURE_GPU
                    )
                except Exception as e:
                    _log(f"读取 GPU 温度失败，关闭该监控: {e}")
                    self.switchTemperature = False

            gpus.append(
                {
                    "gpu_utilization": utilization,
                    "gpu_temperature": temperature,
                    "vram_total": vramTotal,
                    "vram_used": vramUsed,
                    "vram_used_percent": vramPercent,
                }
            )

        return {"device_type": self.cudaDevice, "gpus": gpus}


class CHardwareInfo:
    def __init__(
        self,
        switchCPU=True,
        switchGPU=True,
        switchHDD=True,
        switchRAM=True,
        switchVRAM=True,
    ):
        self.switchCPU = switchCPU
        self.switchHDD = switchHDD
        self.switchRAM = switchRAM
        self.whichHDD = (
            os.environ.get("SystemDrive", "C:") + "\\"
            if platform.system() == "Windows"
            else "/"
        )
        self.GPUInfo = CGPUInfo()
        self.switchGPU = switchGPU
        self.switchVRAM = switchVRAM

    @property
    def switchGPU(self):
        return self.GPUInfo.switchGPU

    @switchGPU.setter
    def switchGPU(self, value):
        self.GPUInfo.switchGPU = value

    @property
    def switchVRAM(self):
        return self.GPUInfo.switchVRAM

    @switchVRAM.setter
    def switchVRAM(self, value):
        self.GPUInfo.switchVRAM = value

    def getHDDsInfo(self):
        return get_drives_info()

    def getGPUInfo(self):
        return self.GPUInfo.getInfo()

    def getStatus(self):
        cpu = -1
        ramTotal = -1
        ramUsed = -1
        ramUsedPercent = -1
        hddTotal = -1
        hddUsed = -1
        hddUsedPercent = -1

        if self.switchCPU:
            cpu = psutil.cpu_percent()

        if self.switchRAM:
            ram = psutil.virtual_memory()
            ramTotal = ram.total
            ramUsed = ram.used
            ramUsedPercent = ram.percent

        if self.switchHDD:
            try:
                hdd = psutil.disk_usage(self.whichHDD)
                hddTotal = hdd.total
                hddUsed = hdd.used
                hddUsedPercent = hdd.percent
            except Exception as e:
                _log(f"读取磁盘 {self.whichHDD} 失败: {e}")

        gpuStatus = self.GPUInfo.getStatus()

        return {
            "cpu_utilization": cpu,
            "ram_total": ramTotal,
            "ram_used": ramUsed,
            "ram_used_percent": ramUsedPercent,
            "hdd_total": hddTotal,
            "hdd_used": hddUsed,
            "hdd_used_percent": hddUsedPercent,
            "device_type": gpuStatus["device_type"],
            "gpus": gpuStatus["gpus"],
        }


class CMonitor:
    monitorThread = None
    threadController = threading.Event()
    rate = 0
    hardwareInfo = None

    def __init__(self, rate=1, switchCPU=True, switchGPU=True, switchHDD=True,
                 switchRAM=True, switchVRAM=True):
        self.rate = rate
        self.hardwareInfo = CHardwareInfo(switchCPU, switchGPU, switchHDD, switchRAM, switchVRAM)
        self.startMonitor()

    async def send_message(self, data) -> None:
        server.PromptServer.instance.send_sync("gadgetpack.monitor", data)

    def startMonitorLoop(self):
        try:
            asyncio.run(self.MonitorLoop())
        except Exception as e:
            _log(f"监控线程退出: {e}")

    async def MonitorLoop(self):
        while self.rate > 0 and not self.threadController.is_set():
            try:
                data = self.hardwareInfo.getStatus()
                await self.send_message(data)
            except Exception as e:
                _log(f"采集硬件状态失败: {e}")
            await asyncio.sleep(max(self.rate, 0.1))

    def startMonitor(self):
        if self.monitorThread is not None:
            self.stopMonitor()
        elif self.rate == 0:
            return None

        self.threadController.clear()

        if self.monitorThread is None or not self.monitorThread.is_alive():
            self.monitorThread = threading.Thread(target=self.startMonitorLoop)
            self.monitorThread.daemon = True
            self.monitorThread.start()

    def stopMonitor(self):
        self.threadController.set()


cmonitor = CMonitor(1, True, True, True, True, True)


def get_usage_snapshot():
    """读取当前内存与显存占用（字节）；显存不可用时为 None。"""
    ram_used = None
    vram_used = None

    try:
        ram_used = psutil.virtual_memory().used
    except Exception as e:
        _log(f"读取内存占用失败: {e}")

    gpu = cmonitor.hardwareInfo.GPUInfo
    if gpu.pynvmlLoaded and gpu.anygpuLoaded:
        try:
            used = 0
            for index in range(gpu.cudaDevicesFound):
                handle = gpu.pynvml.nvmlDeviceGetHandleByIndex(index)
                used += gpu.pynvml.nvmlDeviceGetMemoryInfo(handle).used
            vram_used = used
        except Exception as e:
            _log(f"读取显存占用失败: {e}")

    return {"ram_used": ram_used, "vram_used": vram_used}
