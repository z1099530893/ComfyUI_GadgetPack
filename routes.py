"""监控条设置与一键清理路由：/gadgetpack/monitor、/gadgetpack/cleanup。"""

import asyncio
import gc

import comfy.model_management as mm
from aiohttp import web

import server

from .hardware import cmonitor, get_usage_snapshot


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


def _server_busy():
    """队列中仍有运行或排队任务时视为忙碌。"""
    try:
        running, queued = server.PromptServer.instance.prompt_queue.get_current_queue_volatile()
        return bool(running) or bool(queued)
    except Exception as e:
        _log(f"读取队列状态失败: {e}")
        return False


def _freed(before, after):
    if before is None or after is None:
        return None
    return max(0, before - after)


@server.PromptServer.instance.routes.post("/gadgetpack/cleanup")
async def cleanup_memory(request):
    if _server_busy():
        return web.json_response(
            {"error": "busy", "message": "工作流运行中，已取消清理"}, status=409
        )

    before = get_usage_snapshot()

    try:
        mm.unload_all_models()
        mm.soft_empty_cache()
        gc.collect()
    except Exception as e:
        _log(f"清理内存显存失败: {e}")
        return web.json_response({"error": str(e)}, status=500)

    # 等待显存真正归还后再次采样
    await asyncio.sleep(0.2)
    after = get_usage_snapshot()

    result = {
        "vram_freed": _freed(before.get("vram_used"), after.get("vram_used")),
        "ram_freed": _freed(before.get("ram_used"), after.get("ram_used")),
    }
    _log(
        "已清理内存显存 (显存释放 {} / 内存释放 {})".format(
            result["vram_freed"], result["ram_freed"]
        )
    )
    return web.json_response(result)


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
