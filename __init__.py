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
    CATEGORY = "ComfyUI_GadgetPack/Prompt"

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

WEB_DIRECTORY = "web"

NODE_CLASS_MAPPINGS = {
    "GadgetPack Prompt List": CR_Prompt_List,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "GadgetPack Prompt List": "Prompt List (提示词列表)",
}
