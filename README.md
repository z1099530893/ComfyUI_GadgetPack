# ComfyUI_GadgetPack v0.1.3

`ComfyUI_GadgetPack` 是一个 ComfyUI 小工具合集插件，目前包含：

- `Prompt List (提示词列表)`：把多行文本拆分为提示词列表和正文列表。
- `ComfyUI_Group_DoubleClickBypass`：在组内空白处双击，切换该组内节点 bypass。
- `Branch_Runner`：在分组内空白处右键，执行该组及其必要上游依赖。
- `Image Comparer (图像对比器)`：用滑动分割线或按住切换的方式对比两张图像。
- `清理内存显存`：卸载模型并释放显存与系统内存。
- `随机种`：提供种子，支持固定/递增/递减/随机。
- `资源监控条`：顶栏显示 CPU、内存、GPU、VRAM、GPU 温度和磁盘占用。

## Prompt List (提示词列表)

该节点移植自：https://github.com/Suzie1/ComfyUI_Comfyroll_CustomNodes 
由于该大佬很久没有更新，我就移植过来了

在 ComfyUI 中搜索：

```text
Prompt List，中文搜索：提示词列表
```

或在分类中查找：

```text
ComfyUI_GadgetPack/提示词
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

## Branch_Runner

这是一个前端画布功能，不是需要放入工作流的节点。

安装插件后，在分组内空白处右键时，右键菜单顶部会显示：

```text
执行该组
```

点击 `执行该组` 后，本次队列会以该分组为执行目标，只执行该组内节点以及这些节点依赖的上游节点。

### 执行规则

- 只有右键点在分组内部、并且没有点到节点本体时才会显示 `执行该组`。
- 以当前分组内的可执行输出节点为执行目标。
- 会自动包含当前分组所需的上游依赖节点。
- 如果组外节点或其他分组给当前分组传入数据，这些必要依赖会一并参与本次执行。
- 与当前分组无依赖关系的其他节点不会参与本次执行。
- 插件只会临时过滤本次 prompt，不会永久修改工作流结构。
- 如果分组内没有可执行输出节点，菜单项会被禁用。

## Image Comparer (图像对比器)

该节点集成自独立插件 `image-comparer`，节点内部 ID 固定为：

```text
GadgetPack Image Comparer
```

中文显示名称为：

```text
图像对比器
```

在 ComfyUI 中搜索：

```text
图像对比器
GadgetPack Image Comparer
```

或在分类中查找：

```text
ComfyUI_GadgetPack/图像
```

### 功能

- 连接 `图像 A` 和 `图像 B` 后，可在节点预览区域对比两张图像。
- 默认 `Slide` 模式下，移动鼠标可通过滑动分割线对比图像。
- `Click` 模式下，按住鼠标显示图像 B，松开显示图像 A。
- 可通过 `标签 A`、`标签 B` 给两张图像添加画布预览标签。
- 可通过 `标签颜色` 调整标签颜色。
- 可通过 `输出图像` 选择节点输出原始图像 A 或原始图像 B。
- 预览标签、分割线和对比 UI 不会写入输出图像。

## 清理内存显存

- 节点 ID：`GadgetPack Memory Cleaner`，分类 `ComfyUI_GadgetPack/工具`。
- 开启开关时执行：卸载所有模型 + 垃圾回收 + 清空 CUDA 缓存。
- 关闭开关时仅原样透传输入数据。
- 可选输入 `任意数据`，输出同类型数据，方便串联在工作流任意位置。
- 该节点为自行实现，**无外部移植来源**。

## 随机种

该节点移植自：https://github.com/yolain/ComfyUI-Easy-Use

原节点为 Easy-Use 的 `easy seed`，本插件移植了节点定义、`生成后控制`（fixed / increment / decrement / randomize）以及前端 `🎲 手动随机种子` 交互，并按 GadgetPack 命名重写，可与原插件共存。

- 节点 ID：`GadgetPack Random Seed`，分类 `ComfyUI_GadgetPack/随机种`。
- 输入 `seed`，输出同值 `seed`。
- 自带“生成后控制”，可选固定 / 递增 / 递减 / 随机（显示为中文，底层值保持兼容）。
- 节点底部有 `🎲 手动随机种子` 按钮，点击后立即随机一次并执行队列。

## 资源监控条

该功能移植自：https://github.com/crystian/ComfyUI-Crystools

原插件通过 `pynvml` / `psutil` 采集硬件数据，并在 ComfyUI 顶栏渲染彩色监控条。本插件移植了采集逻辑与顶栏 UI 外观，重写为 `GadgetPack` 前缀（路由 `/gadgetpack/monitor`、事件 `gadgetpack.monitor`、设置分类 `GadgetPack`），因此可与 Crystools 同时安装而不冲突。

这是前端顶栏功能，不需要放入工作流。

- 在 ComfyUI 顶栏显示 CPU、内存、GPU、VRAM、GPU 温度、磁盘占用。
- 设置入口：`设置 → GadgetPack`（配置 / 硬件 / 硬盘 / 显示 GPU）。
- 可调整刷新频率、监控条宽高，以及各硬件项与磁盘分区的显示开关。
- 数据由后端 `hardware.py` 采集（psutil + pynvml），通过 `gadgetpack.monitor` 事件实时推送。

## 安装

将整个文件夹放到 ComfyUI 的 `custom_nodes` 目录：

```text
ComfyUI/custom_nodes/ComfyUI_GadgetPack
```

目录结构：

```text
ComfyUI_GadgetPack/
├─ __init__.py
├─ hardware.py
├─ routes.py
├─ README.md
└─ web/
   ├─ group_double_click_bypass.js
   ├─ branch_runner.js
   ├─ image_comparer.js
   ├─ monitor.js
   ├─ monitor.css
   └─ seed.js
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

如果 `执行该组` 没有出现：

1. 确认右键位置在组内空白处，不是在节点本体或组外。
2. 重启 ComfyUI。
3. 强制刷新浏览器页面。
4. 打开浏览器开发者工具 Console，查看是否有类似日志：

```text
[Branch_Runner] installed
```

如果找不到 `图像对比器`：

1. 确认插件目录为 `ComfyUI/custom_nodes/ComfyUI_GadgetPack`。
2. 重启 ComfyUI。
3. 在节点搜索中搜索 `图像对比器` 或 `GadgetPack Image Comparer`。
4. 查看 ComfyUI 启动日志是否有 Python 报错。

## 说明

- `Prompt List (提示词列表)` 是 Python 节点，会出现在节点搜索中。
- `Image Comparer (图像对比器)` 是 Python 节点，会出现在节点搜索中。
- `ComfyUI_Group_DoubleClickBypass` 是前端画布功能，不会出现在节点搜索中。
- `Branch_Runner` 是前端画布功能，不会出现在节点搜索中。
- 组双击开关状态保存在浏览器 `localStorage` 中。
- 当前组双击逻辑以节点完整位于组框内部为准。
- `Branch_Runner` 会临时过滤本次队列提交的 prompt，不会删除、移动、绕过或静音任何节点。
- `Image Comparer` 的前端 UI 由 `web/image_comparer.js` 提供。

## 移植来源

| 节点 / 功能 | 原始项目 | 说明 |
| --- | --- | --- |
| `Prompt List (提示词列表)` | https://github.com/Suzie1/ComfyUI_Comfyroll_CustomNodes | 原作者长期未更新，移植并汉化 |
| `随机种` | https://github.com/yolain/ComfyUI-Easy-Use | 移植 `easy seed` 节点及其前端交互 |
| `资源监控条` | https://github.com/crystian/ComfyUI-Crystools | 移植顶栏硬件监控（CPU / 内存 / GPU / VRAM / 温度 / 磁盘） |
| `Image Comparer (图像对比器)` | 独立插件 `image-comparer` | 集成进本插件 |
| `清理内存显存` | 无 | 自行实现 |
| `ComfyUI_Group_DoubleClickBypass` | 无 | 自行实现 |
| `Branch_Runner` | 无 | 自行实现 |

以上移植功能仅复用原项目的思路与实现细节，均按 GadgetPack 命名重写，不会与原插件产生冲突；版权归原项目作者所有。

## 更新记录

### v0.1.3

- 新增 `随机种` 节点（含 🎲 手动随机种子按钮与中文生成后控制）。
- 新增顶栏 `资源监控条`（CPU / 内存 / GPU / VRAM / GPU 温度 / 磁盘）。
- 新增 `清理内存显存` 节点。

### v0.1.2

- 新增 `Image Comparer (图像对比器)` 节点。
- 保留 `Prompt List (提示词列表)` 原有功能。
- 保留 `ComfyUI_Group_DoubleClickBypass` 原有功能。
- 保留 `Branch_Runner` 原有功能。

### v0.1.1

- 新增 `Branch_Runner` 前端画布功能。
- 在分组内空白处右键时，可通过 `执行该组` 只执行当前分组及必要上游依赖。
- 保留 `Prompt List (提示词列表)` 原有功能。
- 保留 `ComfyUI_Group_DoubleClickBypass` 原有功能。

### v0.1.0

- 新增 `Prompt List (提示词列表)`。
- 新增 `ComfyUI_Group_DoubleClickBypass` 前端画布功能。
