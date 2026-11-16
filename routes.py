"""监控条设置路由：/gadgetpack/monitor 系列。"""

from aiohttp import web

import server

from .hardware import cmonitor


def _log(msg):
    print(f"[GadgetPack] {msg}")


@server.PromptServer.instance.routes.patch("/gadgetpack/monitor")
async def update_settings(request):
    try:
        settings = await request.json()

        if "rate" in settings:
            rate = settings["rate"]
            if not isinstance(rate, (int, float)):
                raise Exception("rate 必须是数字")
            if cmonitor.rate == 0 and rate > 0:
                cmonitor.rate = rate
                cmonitor.startMonitor()
            else:
                cmonitor.rate = rate

        if "switchCPU" in settings:
            switchCPU = settings["switchCPU"]
            if not isinstance(switchCPU, bool):
                raise Exception("switchCPU 必须是布尔值")
            cmonitor.hardwareInfo.switchCPU = switchCPU

        if "switchHDD" in settings:
            switchHDD = settings["switchHDD"]
            if not isinstance(switchHDD, bool):
                raise Exception("switchHDD 必须是布尔值")
            cmonitor.hardwareInfo.switchHDD = switchHDD

        if "switchRAM" in settings:
            switchRAM = settings["switchRAM"]
            if not isinstance(switchRAM, bool):
                raise Exception("switchRAM 必须是布尔值")
            cmonitor.hardwareInfo.switchRAM = switchRAM

        if "whichHDD" in settings:
            whichHDD = settings["whichHDD"]
            if not isinstance(whichHDD, str):
                raise Exception("whichHDD 必须是字符串")
            cmonitor.hardwareInfo.whichHDD = whichHDD

        return web.Response(status=200)
    except Exception as e:
        _log(f"更新监控设置失败: {e}")
        return web.Response(status=400, text=str(e))


@server.PromptServer.instance.routes.post("/gadgetpack/monitor/switch")
async def monitor_switch(request):
    try:
        switch = await request.json()
        if "monitor" in switch:
            monitor = switch["monitor"]
            if not isinstance(monitor, bool):
                raise Exception("monitor 必须是布尔值")
            if monitor:
                cmonitor.startMonitor()
            else:
                cmonitor.stopMonitor()
        return web.Response(status=200)
    except Exception as e:
        _log(f"切换监控失败: {e}")
        return web.Response(status=400, text=str(e))


@server.PromptServer.instance.routes.get("/gadgetpack/monitor/HDD")
async def get_hdds(request):
    try:
        return web.json_response(cmonitor.hardwareInfo.getHDDsInfo())
    except Exception as e:
        _log(f"获取磁盘列表失败: {e}")
        return web.Response(status=400, text=str(e))


@server.PromptServer.instance.routes.get("/gadgetpack/monitor/GPU")
async def get_gpus(request):
    try:
        return web.json_response(cmonitor.hardwareInfo.getGPUInfo())
    except Exception as e:
        _log(f"获取 GPU 列表失败: {e}")
        return web.Response(status=400, text=str(e))


@server.PromptServer.instance.routes.patch("/gadgetpack/monitor/GPU/{index}")
async def update_gpu_settings(request):
    try:
        index = int(request.match_info["index"])
        settings = await request.json()

        if "utilization" in settings:
            if not isinstance(settings["utilization"], bool):
                raise Exception("utilization 必须是布尔值")
            cmonitor.hardwareInfo.GPUInfo.gpusUtilization[index] = settings["utilization"]

        if "vram" in settings:
            if not isinstance(settings["vram"], bool):
                raise Exception("vram 必须是布尔值")
            cmonitor.hardwareInfo.GPUInfo.gpusVRAM[index] = settings["vram"]

        if "temperature" in settings:
            if not isinstance(settings["temperature"], bool):
                raise Exception("temperature 必须是布尔值")
            cmonitor.hardwareInfo.GPUInfo.gpusTemperature[index] = settings["temperature"]

        return web.Response(status=200)
    except Exception as e:
        _log(f"更新 GPU 设置失败: {e}")
        return web.Response(status=400, text=str(e))
