# ComfyUI_GadgetPack v0.1.0

`ComfyUI_GadgetPack` 是一个 ComfyUI 小工具合集插件，目前包含：

- `Prompt List (提示词列表)`：把多行文本拆分为提示词列表和正文列表。
- `ComfyUI_Group_DoubleClickBypass`：在组内空白处双击，切换该组内节点 bypass。

## Prompt List (提示词列表)

该节点移植自：https://github.com/Suzie1/ComfyUI_Comfyroll_CustomNodes
由于该大佬很久没有更新，我就移植过来了

在 ComfyUI 中搜索：

```text
Prompt List，中文搜索：提示词列表
```

或在分类中查找：

```text
ComfyUI_GadgetPack/Prompt
```

### 输入

- `前缀文本`：添加到每一行正文前方。
- `多行正文文本`：多行正文文本，每一行会作为一个条目处理。
- `后缀文本`：添加到每一行正文后方。
- `起始索引`：从第几行开始读取，索引从 `0` 开始。
- `最大行数`：最多读取多少行。

### 输出

- `提示词列表`：列表输出。每一项为 `前缀文本 + 当前行正文 + 后缀文本`。
- `正文列表`：列表输出。每一项为原始正文行。
- `功能介绍`：文本输出，说明该节点的用途。

### 行为

节点会把 `多行正文文本` 按换行拆分，然后按 `起始索引` 和 `最大行数` 截取指定范围。

示例：

```text
前缀文本: high quality,
多行正文文本:
cat
dog
后缀文本: , cinematic
```

`提示词列表` 输出：

```text
high quality,cat, cinematic
high quality,dog, cinematic
```

`正文列表` 输出：

```text
cat
dog
```

## ComfyUI_Group_DoubleClickBypass

这是一个前端画布功能，不是需要放入工作流的节点。

安装插件后，它会自动加载，并在画布右键菜单中添加：

```text
组双击绕过
```

菜单项颜色表示当前状态：

- 灰色：功能已开启。
- 亮色：功能已关闭。

点击 `组双击绕过` 可以开启或关闭该功能。

### 双击规则

- 双击组内空白处：切换该组内所有节点的 bypass。
- 再次双击组内空白处：取消 bypass，并尽量恢复节点之前的 mode。
- 双击组标题栏：保留 ComfyUI 原本的重命名组功能。
- 双击组外空白处：保留 ComfyUI 原本的节点搜索功能。
- 双击节点本体：不会触发整组 bypass。

## 安装

将整个文件夹放到 ComfyUI 的 `custom_nodes` 目录：

```text
ComfyUI/custom_nodes/ComfyUI_GadgetPack
```

目录结构：

```text
ComfyUI_GadgetPack/
├─ __init__.py
├─ README.md
└─ web/
   └─ group_double_click_bypass.js
```

然后重启 ComfyUI。

## 排查

如果找不到 `Prompt List (提示词列表)`：

1. 确认插件目录为 `ComfyUI/custom_nodes/ComfyUI_GadgetPack`。
2. 重启 ComfyUI。
3. 查看 ComfyUI 启动日志是否有 Python 报错。

如果 `组双击绕过` 没有出现或不生效：

1. 重启 ComfyUI。
2. 强制刷新浏览器页面。
3. 打开浏览器开发者工具 Console，查看是否有类似日志：

```text
[ComfyUI_Group_DoubleClickBypass] installed
```

如果能看到该日志，说明前端脚本已经加载。

## 说明

- `Prompt List (提示词列表)` 是 Python 节点，会出现在节点搜索中。
- `ComfyUI_Group_DoubleClickBypass` 是前端画布功能，不会出现在节点搜索中。
- 组双击开关状态保存在浏览器 `localStorage` 中。
- 当前组双击逻辑以节点完整位于组框内部为准。
