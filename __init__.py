import gc

import comfy.model_management as mm
from nodes import PreviewImage, SaveImage

ANY = "*"


class CR_Prompt_List:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "前缀文本": ("STRING", {"multiline": False, "default": ""}),
                "多行正文文本": ("STRING", {"multiline": True, "default": "body_text"}),
                "后缀文本": ("STRING", {"multiline": False, "default": ""}),
                "起始索引": ("INT", {"default": 0, "min": 0, "max": 9999}),
                "最大行数": ("INT", {"default": 1000, "min": 1, "max": 9999}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("提示词列表", "正文列表", "功能介绍")
    OUTPUT_IS_LIST = (True, True, False)
    FUNCTION = "make_list"
    CATEGORY = "ComfyUI_GadgetPack/提示词"

    def make_list(self, 多行正文文本, 前缀文本="", 后缀文本="", 起始索引=0, 最大行数=9999, **kwargs):
        多行正文文本 = kwargs.get("multiline_text", 多行正文文本)
        前缀文本 = kwargs.get("prepend_text", 前缀文本)
        后缀文本 = kwargs.get("append_text", 后缀文本)
        起始索引 = kwargs.get("start_index", 起始索引)
        最大行数 = kwargs.get("max_rows", 最大行数)

        show_help = "将多行文本按行拆分为列表，可按起始索引和最大行数截取；输出会分别提供添加前后缀后的提示词列表，以及原始正文文本列表。"

        lines = 多行正文文本.split("\n")

        起始索引 = max(0, min(起始索引, len(lines) - 1))
        end_index = min(起始索引 + 最大行数, len(lines))

        selected_rows = lines[起始索引:end_index]
        prompt_list_out = [前缀文本 + line + 后缀文本 for line in selected_rows]
        body_list_out = selected_rows

        return (prompt_list_out, body_list_out, show_help)


class ImageComparer:
    """在 ComfyUI 画布中对比两张图像。"""

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    OUTPUT_NODE = True
    FUNCTION = "compare_images"
    CATEGORY = "ComfyUI_GadgetPack/图像"
    DESCRIPTION = "使用滑动分割线或按住切换的方式对比两张图像。"

    save_images = SaveImage.save_images

    def __init__(self):
        PreviewImage.__init__(self)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image_a": ("IMAGE",),
                "label_a": ("STRING", {"default": "", "multiline": False}),
                "image_b": ("IMAGE",),
                "label_b": ("STRING", {"default": "", "multiline": False}),
                "output_image": (["图像 A", "图像 B"], {"default": "图像 A"}),
                "label_color": (
                    ["白色", "黑色", "黄色", "红色", "青色", "绿色", "蓝色", "紫色"],
                    {"default": "白色"},
                ),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    def compare_images(
        self,
        image_a,
        label_a,
        image_b,
        label_b,
        output_image="图像 A",
        label_color="白色",
        filename_prefix="image_comparer.compare.",
        prompt=None,
        extra_pnginfo=None,
    ):
        result = {"ui": {"a_images": [], "b_images": []}}

        if len(image_a) > 0:
            result["ui"]["a_images"] = self.save_images(
                image_a, filename_prefix, prompt, extra_pnginfo
            )["ui"]["images"]

        if len(image_b) > 0:
            result["ui"]["b_images"] = self.save_images(
                image_b, filename_prefix, prompt, extra_pnginfo
            )["ui"]["images"]

        # Keep preview files text-free and pass through the selected original tensor.
        result["result"] = (image_b if output_image == "图像 B" else image_a,)
        return result


class GadgetPackMemoryCleaner:
    """按开关释放显存与内存；关闭时仅透传数据。"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "释放内存显存": (
                    "BOOLEAN",
                    {"default": True, "tooltip": "开启时卸载所有模型并释放显存/内存；关闭时仅透传任意数据"},
                ),
            },
            "optional": {
                "任意数据": (ANY, {"forceInput": True}),
            },
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("输出",)
    FUNCTION = "clean_memory"
    CATEGORY = "ComfyUI_GadgetPack/工具"
    DESCRIPTION = "卸载已加载的模型并释放显存与系统内存；关闭开关时原样透传输入。"

    @classmethod
    def IS_CHANGED(cls, 释放内存显存=True, **kwargs):
        # 开启时必须每次执行，避免被缓存跳过
        return float("NaN") if 释放内存显存 else ""

    def clean_memory(self, 释放内存显存, 任意数据=None):
        if 释放内存显存:
            mm.unload_all_models()
            gc.collect()
            mm.soft_empty_cache()
            print("[GadgetPack] 已释放显存与内存 (卸载模型 + GC + CUDA 缓存)")
        return (任意数据,)


MAX_SEED_NUM = 1125899906842624


class GadgetPackRandomSeed:
    """随机种：支持生成后递增/递减/随机。"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "seed": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": MAX_SEED_NUM,
                        "control_after_generate": True,
                    },
                ),
            },
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("seed",)
    FUNCTION = "doit"
    CATEGORY = "ComfyUI_GadgetPack/随机种"

    def doit(self, seed=0):
        return (seed,)


from . import routes  # noqa: E402,F401  注册监控条路由

WEB_DIRECTORY = "web"

NODE_CLASS_MAPPINGS = {
    "GadgetPack Prompt List": CR_Prompt_List,
    "GadgetPack Image Comparer": ImageComparer,
    "GadgetPack Memory Cleaner": GadgetPackMemoryCleaner,
    "GadgetPack Random Seed": GadgetPackRandomSeed,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "GadgetPack Prompt List": "Prompt List (提示词列表)",
    "GadgetPack Image Comparer": "图像对比器",
    "GadgetPack Memory Cleaner": "清理内存显存",
    "GadgetPack Random Seed": "随机种",
}
