import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ComfyWidgets } from "../../scripts/widgets.js";

const NODE_TYPE = "GadgetPack Image Comparer";
const NODE_TITLE = "图像对比器";
const NODE_CATEGORY = "ComfyUI_GadgetPack/图像";
const NODE_PYTHON_MODULE = "custom_nodes.ComfyUI_GadgetPack";
const PLUGIN_ID = "ComfyUI_GadgetPack";
const MODE_PROPERTY = "comparer_mode";
const LEGACY_MODE_PROPERTY = "对比模式";
const MODE_SLIDE = "Slide";
const MODE_CLICK = "Click";
const DEFAULT_LABEL_COLOR = "白色";
const LABEL_COLORS = {
    白色: "#ffffff",
    黑色: "#111111",
    黄色: "#ffd84d",
    红色: "#ff4d4f",
    青色: "#38d5ff",
    绿色: "#45d96f",
    蓝色: "#4da3ff",
    紫色: "#c084fc",
};

const INPUT_LABELS = {
    image_a: "图像 A",
    label_a: "标签 A",
    image_b: "图像 B",
    label_b: "标签 B",
    output_image: "输出图像",
    label_color: "标签颜色",
};

const NODE_OVERRIDES = new Map();
const originalRegisterNodeType = LiteGraph.registerNodeType;
LiteGraph.registerNodeType = function (nodeId, baseClass) {
    return originalRegisterNodeType.call(
        LiteGraph,
        nodeId,
        NODE_OVERRIDES.get(baseClass) || baseClass
    );
};

function currentMode(node) {
    const mode =
        node.properties?.[MODE_PROPERTY] ??
        node.properties?.[LEGACY_MODE_PROPERTY];
    return mode === MODE_CLICK || mode === "点击" ? MODE_CLICK : MODE_SLIDE;
}

function ensureProperties(node) {
    node.properties ||= {};
    node.properties.aux_id = undefined;
    node.properties["Node name for S&R"] = NODE_TYPE;
    node.properties[MODE_PROPERTY] = currentMode(node);
    delete node.properties.ver;
    delete node.properties[LEGACY_MODE_PROPERTY];
    delete node.properties.connections_layout;
}

function imageDataToUrl(data) {
    return api.apiURL(
        `/view?filename=${encodeURIComponent(data.filename)}` +
        `&type=${encodeURIComponent(data.type)}` +
        `&subfolder=${encodeURIComponent(data.subfolder || "")}` +
        app.getPreviewFormatParam() +
        app.getRandParam()
    );
}

async function invokeNodeCreatedExtensions(node) {
    const blocked = ["Comfy.WidgetInputs", "efficiency.widgethider"];
    await Promise.all(
        (app.extensions || []).map(async (extension) => {
            if (
                typeof extension?.nodeCreated !== "function" ||
                blocked.some((name) =>
                    extension.name?.toLowerCase().startsWith(name.toLowerCase())
                )
            ) {
                return;
            }
            try {
                await extension.nodeCreated(node, app);
            } catch (error) {
                console.error(
                    `图像对比器无法应用扩展 ${extension.name || "未知"}`,
                    error
                );
            }
        })
    );
}

class ImageComparerNode extends LGraphNode {
    constructor(title = NODE_TITLE) {
        super(title);
        this.comfyClass = NODE_TYPE;
        this.nickname = NODE_TYPE;
        this.serialize_widgets = true;
        this.imageIndex = 0;
        this.imgs = [];
        this.isPointerDown = false;
        this.isPointerOver = false;
        this.pointerOverPos = [0, 0];
        this.comparerWidget = null;
        ensureProperties(this);
        this.setupFromServerNodeData();
        void invokeNodeCreatedExtensions(this).finally(() => {
            ensureProperties(this);
            this.setDirtyCanvas(true, false);
        });
    }

    setupFromServerNodeData() {
        const nodeData = this.constructor.nodeData;
        if (!nodeData) {
            throw new Error("缺少图像对比器节点定义");
        }

        const inputs = {
            ...(nodeData.input?.required || {}),
            ...(nodeData.input?.optional || {}),
        };
        for (const [name, inputData] of Object.entries(inputs)) {
            const type = inputData[0];
            const isCombo = Array.isArray(type);
            const widgetFactory =
                (isCombo ? ComfyWidgets.COMBO : null) ||
                ComfyWidgets[`${type}:${name}`] ||
                ComfyWidgets[type];
            if (widgetFactory && !inputData[1]?.forceInput) {
                const config = widgetFactory(this, name, inputData, app) || {};
                if (config.widget && INPUT_LABELS[name]) {
                    config.widget.label = INPUT_LABELS[name];
                }
            } else {
                const input = this.addInput(name, isCombo ? "COMBO" : type);
                if (input && INPUT_LABELS[name]) {
                    input.label = INPUT_LABELS[name];
                }
            }
        }

        for (const [index, outputData] of (nodeData.output || []).entries()) {
            const outputType = Array.isArray(outputData) ? "COMBO" : outputData;
            const outputName = nodeData.output_name?.[index] || outputType;
            const output = this.addOutput(outputName, outputType, {
                shape: nodeData.output_is_list?.[index]
                    ? LiteGraph.GRID_SHAPE
                    : LiteGraph.CIRCLE_SHAPE,
            });
            if (output) {
                output.label = "图像";
            }
        }

        const size = this.computeSize();
        size[0] = Math.max(1, size[0] * 1.5);
        size[1] = Math.max(1, size[1]);
        this.size = size;
    }

    configure(info) {
        let data = info;
        const values = info.widgets_values;
        if (
            values?.length === 1 &&
            (Array.isArray(values[0]) || values[0]?.images)
        ) {
            data = {
                ...info,
                widgets_values: ["", "", "图像 A", DEFAULT_LABEL_COLOR, values[0]],
            };
        } else if (
            values?.length === 3 &&
            (Array.isArray(values[2]) || values[2]?.images)
        ) {
            data = {
                ...info,
                widgets_values: [
                    values[0],
                    values[1],
                    "图像 A",
                    DEFAULT_LABEL_COLOR,
                    values[2],
                ],
            };
        } else if (
            values?.length === 4 &&
            (Array.isArray(values[3]) || values[3]?.images)
        ) {
            data = {
                ...info,
                widgets_values: [
                    values[0],
                    values[1],
                    values[2] || "图像 A",
                    DEFAULT_LABEL_COLOR,
                    values[3],
                ],
            };
        }
        super.configure(data);
        ensureProperties(this);
    }

    onNodeCreated() {
        this.comparerWidget = this.addCustomWidget(
            new ImageComparerWidget("图像对比", this)
        );
        this.setSize(this.computeSize());
        this.setDirtyCanvas(true, true);
    }

    onExecuted(output) {
        if ("images" in output) {
            this.comparerWidget.value = {
                images: (output.images || []).map((data, index) => ({
                    name: index === 0 ? "A" : "B",
                    selected: true,
                    url: imageDataToUrl(data),
                })),
            };
            return;
        }

        const aImages = output.a_images || [];
        const bImages = output.b_images || [];
        const images = [];
        const multiple = aImages.length + bImages.length > 2;

        aImages.forEach((data, index) => {
            images.push({
                name: aImages.length > 1 || multiple ? `A${index + 1}` : "A",
                selected: index === 0,
                url: imageDataToUrl(data),
            });
        });
        bImages.forEach((data, index) => {
            images.push({
                name: bImages.length > 1 || multiple ? `B${index + 1}` : "B",
                selected: index === 0,
                url: imageDataToUrl(data),
            });
        });

        this.comparerWidget.value = { images };
    }

    onSerialize(serialized) {
        super.onSerialize?.(serialized);
        for (const [index] of (serialized.widgets_values || []).entries()) {
            if (this.widgets[index]?.name === "图像对比") {
                serialized.widgets_values[index] =
                    this.widgets[index].value.images.map((item) => {
                        const value = { ...item };
                        delete value.img;
                        return value;
                    });
            }
        }
    }

    onMouseEnter(event) {
        super.onMouseEnter?.(event);
        this.setIsPointerDown(Boolean(app.canvas.pointer_is_down));
        this.isPointerOver = true;
    }

    onMouseLeave(event) {
        super.onMouseLeave?.(event);
        this.setIsPointerDown(false);
        this.isPointerOver = false;
    }

    onMouseMove(event, pos, canvas) {
        super.onMouseMove?.(event, pos, canvas);
        this.pointerOverPos = [...pos];
        this.updateImageIndex(pos);
        this.setDirtyCanvas(true, false);
    }

    updateImageIndex(pos) {
        if (pos?.length) {
            this.imageIndex = pos[0] > this.size[0] / 2 ? 1 : 0;
        }
    }

    setIsPointerDown(down = this.isPointerDown) {
        const isDown = down && Boolean(app.canvas.pointer_is_down);
        if (this.isPointerDown !== isDown) {
            this.isPointerDown = isDown;
            this.setDirtyCanvas(true, false);
        }
        if (this.isPointerDown) {
            requestAnimationFrame(() => this.setIsPointerDown());
        }
    }

    onMouseDown(event, pos, canvas) {
        super.onMouseDown?.(event, pos, canvas);
        this.updateImageIndex(pos);
        this.setIsPointerDown(true);
        return false;
    }

    getExtraMenuOptions(canvas, options) {
        if (super.getExtraMenuOptions) {
            super.getExtraMenuOptions(canvas, options);
        } else {
            this.constructor.nodeType?.prototype?.getExtraMenuOptions?.call(
                this,
                canvas,
                options
            );
        }

        for (let index = options.length - 1; index >= 0; index--) {
            const content = String(options[index]?.content || "").replace(/\s/g, "");
            if (content === "OpeninMaskEditor|ImageCanvas") {
                options.splice(index, 1);
            }
        }

        const hasNodeHelp = options.some((option) => {
            const content = String(option?.content || "")
                .replace(/\s/g, "")
                .toLowerCase();
            return content === "节点帮助" || content === "nodehelp";
        });
        if (!hasNodeHelp) {
            if (options.length && options.at(-1) !== null) {
                options.push(null);
            }
            options.push({
                content: "节点帮助",
                callback: () => this.showChineseHelp(),
            });
        }
        return [];
    }

    showChineseHelp() {
        app.ui?.dialog?.show(`
            <div class="image-comparer-help">
                <style>
                    .image-comparer-help {
                        width: 100%;
                        max-width: 820px;
                        color: #dfe3e8 !important;
                        font-family: system-ui, "Microsoft YaHei", sans-serif;
                        font-size: 14px;
                        line-height: 1.5;
                        letter-spacing: 0;
                        padding: 14px 4px 4px;
                    }
                    .image-comparer-help * {
                        box-sizing: border-box;
                        letter-spacing: 0;
                    }
                    .image-comparer-help h2 {
                        color: #f8fafc !important;
                        font-size: 22px;
                        line-height: 1.3;
                        margin: 0 0 6px;
                    }
                    .image-comparer-help .help-summary {
                        color: #aeb6c2 !important;
                        margin: 0;
                    }
                    .image-comparer-help .help-section {
                        border-top: 1px solid #3a4049;
                        margin-top: 8px;
                        padding-top: 10px;
                    }
                    .image-comparer-help h3 {
                        color: #f1f5f9 !important;
                        font-size: 15px;
                        line-height: 1.4;
                        margin: 0 0 8px;
                    }
                    .image-comparer-help .help-row {
                        display: grid;
                        grid-template-columns: 118px minmax(0, 1fr);
                        gap: 14px;
                        padding: 5px 0;
                    }
                    .image-comparer-help .help-term {
                        color: #7dd3fc !important;
                        font-weight: 600;
                    }
                    .image-comparer-help .help-detail,
                    .image-comparer-help .help-note {
                        color: #dfe3e8 !important;
                        min-width: 0;
                    }
                    .image-comparer-help .help-note {
                        background: #23272e;
                        border-left: 3px solid #64748b;
                        margin: 2px 0 6px;
                        padding: 6px 10px;
                    }
                    .image-comparer-help code {
                        background: #252b33;
                        border: 1px solid #3f4752;
                        border-radius: 4px;
                        color: #c4b5fd !important;
                        font-family: Consolas, monospace;
                        font-size: 0.92em;
                        padding: 1px 5px;
                    }
                    @media (max-width: 640px) {
                        .image-comparer-help {
                            max-width: none;
                        }
                        .image-comparer-help .help-row {
                            grid-template-columns: 1fr;
                            gap: 2px;
                        }
                    }
                </style>

                <h2>图像对比器</h2>
                <p class="help-summary">将两张图像叠加显示，用滑动分割线进行对比。</p>

                <section class="help-section">
                    <h3>基本功能</h3>
                    <div class="help-row">
                        <div class="help-term">图像 A、图像 B</div>
                        <div class="help-detail">两张图像都必须连接，缺少任意一张时节点不会运行。</div>
                    </div>
                    <div class="help-row">
                        <div class="help-term">标签文字</div>
                        <div class="help-detail">标签 A 显示在图像 A 左上角，标签 B 显示在图像 B 右上角，不会写入保存的原图。</div>
                    </div>
                    <div class="help-row">
                        <div class="help-term">标签颜色</div>
                        <div class="help-detail">通过 <code>标签颜色</code> 下拉框同时调整标签 A 和标签 B 的显示颜色。</div>
                    </div>
                    <div class="help-row">
                        <div class="help-term">滑动对比</div>
                        <div class="help-detail">移动鼠标，用分割线对比图像；分割线左侧显示图像 A，右侧显示图像 B。</div>
                    </div>
                    <div class="help-row">
                        <div class="help-term">输出图像</div>
                        <div class="help-detail">通过 <code>输出图像</code> 下拉框选择输出原始图像 A 或原始图像 B。</div>
                    </div>
                    <div class="help-row">
                        <div class="help-term">点击对比</div>
                        <div class="help-detail">按住鼠标显示图像 B，松开显示图像 A。</div>
                    </div>
                    <div class="help-row">
                        <div class="help-term">属性</div>
                        <div class="help-detail">在属性或属性面板中通过 <code>comparer_mode</code> 切换 <code>Slide</code>、<code>Click</code> 模式。</div>
                    </div>
                    <div class="help-row">
                        <div class="help-term">批次选择</div>
                        <div class="help-detail">点击 <code>A1</code>、<code>A2</code>、<code>B1</code>、<code>B2</code> 等标签选择对比图像，但是只有当输入的图像数量 ≥ 2 的时候才会被触发。</div>
                    </div>
                </section>

                <section class="help-section">
                    <h3>图像菜单</h3>
                    <div class="help-note">节点成功运行并载入预览后，右键菜单才会显示可用的图像操作。</div>
                    <div class="help-row">
                        <div class="help-term">选择图像</div>
                        <div class="help-detail">在节点左半部分右键，对应当前选中的图像 A；在右半部分右键，对应当前选中的图像 B。</div>
                    </div>
                    <div class="help-row">
                        <div class="help-term">打开图像</div>
                        <div class="help-detail">在新页面中打开对应的原始预览图。</div>
                    </div>
                    <div class="help-row">
                        <div class="help-term">复制图像</div>
                        <div class="help-detail">将对应的原始预览图复制到系统剪贴板；是否出现取决于浏览器的剪贴板支持和权限。</div>
                    </div>
                    <div class="help-row">
                        <div class="help-term">保存</div>
                        <div class="help-detail">下载对应的原始预览图。</div>
                    </div>
                    <div class="help-row">
                        <div class="help-term">批次输入</div>
                        <div class="help-detail">菜单作用于通过 <code>A1</code>、<code>A2</code>、<code>B1</code>、<code>B2</code> 等标签选中的当前图像。</div>
                    </div>
                    <div class="help-row">
                        <div class="help-term">原图说明</div>
                        <div class="help-detail">打开、复制和保存的图像都不包含说明文字、分割线或另一张图像。</div>
                    </div>
                </section>
            </div>
        `);
        const helpElement = app.ui?.dialog?.element?.querySelector(".image-comparer-help");
        const textElement = app.ui?.dialog?.textElement;
        if (helpElement && textElement?.contains(helpElement)) {
            textElement.style.margin = "0";
            textElement.style.padding = "0";
        }
        const closeButton = app.ui?.dialog?.element?.querySelector("button");
        if (closeButton?.textContent?.trim() === "Close") {
            closeButton.textContent = "关闭";
        }
    }
}

ImageComparerNode.title = NODE_TITLE;
ImageComparerNode.type = NODE_TYPE;
ImageComparerNode.comfyClass = NODE_TYPE;
ImageComparerNode[`@${MODE_PROPERTY}`] = {
    type: "combo",
    values: [MODE_SLIDE, MODE_CLICK],
};

class ImageComparerWidget {
    constructor(name, node) {
        this.name = name;
        this.node = node;
        this.type = "custom";
        this.options = {};
        this.hitAreas = [];
        this.selected = [];
        this._value = { images: [] };
    }

    set value(value) {
        let images;
        if (Array.isArray(value)) {
            images = value.map((item, index) => {
                if (!item || typeof item === "string") {
                    return {
                        url: item,
                        name: index === 0 ? "A" : "B",
                        selected: true,
                    };
                }
                return item;
            });
        } else {
            images = value?.images || [];
        }

        if (images.length > 2) {
            const hasAAndB =
                images.some((item) => item.name.startsWith("A")) &&
                images.some((item) => item.name.startsWith("B"));
            if (!hasAAndB) {
                images = [images[0], images[1]];
            }
        }

        let selected = images.filter((item) => item.selected);
        if (!selected.length && images.length) {
            images[0].selected = true;
        }
        selected = images.filter((item) => item.selected);
        if (selected.length === 1 && images.length > 1) {
            images.find((item) => !item.selected).selected = true;
        }

        this._value.images = images;
        this.setSelected(images.filter((item) => item.selected));
    }

    get value() {
        return this._value;
    }

    setSelected(selected) {
        this._value.images.forEach((item) => {
            item.selected = false;
        });
        this.node.imgs.length = 0;

        for (const item of selected) {
            if (!item.img) {
                item.img = new Image();
                item.img.onload = () => this.node.setDirtyCanvas(true, false);
                item.img.src = item.url;
            }
            item.selected = true;
            this.node.imgs.push(item.img);
        }

        this.selected = selected;
        this.node.setDirtyCanvas(true, false);
    }

    draw(ctx, node, width, y) {
        this.hitAreas = [];

        if (this.value.images.length > 2) {
            ctx.save();
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            ctx.font = "14px Arial";

            const labels = [];
            const spacing = 5;
            let totalWidth = 0;
            for (const image of this.value.images) {
                const labelWidth = ctx.measureText(image.name).width;
                labels.push({ image, width: labelWidth });
                totalWidth += labelWidth + spacing;
            }

            let x = (node.size[0] - (totalWidth - spacing)) / 2;
            for (const label of labels) {
                ctx.fillStyle = label.image.selected
                    ? "rgba(180, 180, 180, 1)"
                    : "rgba(180, 180, 180, 0.5)";
                ctx.fillText(label.image.name, x, y);
                this.hitAreas.push({
                    bounds: [x, y, label.width, 14],
                    image: label.image,
                });
                x += label.width + spacing;
            }

            ctx.restore();
            y += 20;
        }

        const imageA = this.selected[0];
        const imageB = this.selected[1];
        if (currentMode(node) === MODE_CLICK) {
            const showB = node.isPointerDown;
            const image = showB ? imageB : imageA;
            this.drawImage(ctx, image, y);
            this.drawLabel(
                ctx,
                image,
                y,
                this.widgetText(showB ? "label_b" : "label_a"),
                showB ? "right" : "left"
            );
            return;
        }

        this.drawImage(ctx, imageA, y);
        this.drawLabel(ctx, imageA, y, this.widgetText("label_a"), "left");
        if (node.isPointerOver) {
            const cropX = node.pointerOverPos[0];
            this.drawImage(ctx, imageB, y, cropX, "right");

            const bounds = this.imageBounds(imageB, y);
            if (bounds) {
                const revealX = Math.max(bounds.x, Math.min(cropX, bounds.x + bounds.width));
                const revealWidth = bounds.x + bounds.width - revealX;
                ctx.save();
                ctx.beginPath();
                ctx.rect(revealX, bounds.y, revealWidth, bounds.height);
                ctx.clip();
                this.drawLabel(
                    ctx,
                    imageB,
                    y,
                    this.widgetText("label_b"),
                    "right"
                );
                ctx.restore();
            }

            this.drawDivider(ctx, imageB, y, cropX);
        }
    }

    drawLabel(ctx, image, y, text, align) {
        const bounds = this.imageBounds(image, y);
        if (!bounds || !text) return;

        const padding = 12;
        const maxWidth = Math.max(1, bounds.width / 2 - padding * 2);
        const textY = bounds.y + padding;
        ctx.save();
        ctx.font = "bold 16px Arial";
        ctx.textBaseline = "top";
        const color = this.labelColor();
        ctx.fillStyle = color;
        ctx.shadowColor = color === LABEL_COLORS.黑色
            ? "rgba(255, 255, 255, 0.9)"
            : "rgba(0, 0, 0, 0.9)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.textAlign = align;
        ctx.fillText(
            this.fitText(ctx, text, maxWidth),
            align === "right"
                ? bounds.x + bounds.width - padding
                : bounds.x + padding,
            textY
        );
        ctx.restore();
    }

    drawDivider(ctx, image, y, cropX) {
        const bounds = this.imageBounds(image, y);
        if (!bounds || cropX < bounds.x || cropX > bounds.x + bounds.width) {
            return;
        }
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cropX, bounds.y);
        ctx.lineTo(cropX, bounds.y + bounds.height);
        ctx.globalCompositeOperation = "difference";
        ctx.strokeStyle = "rgba(255, 255, 255, 1)";
        ctx.stroke();
        ctx.restore();
    }

    widgetText(name) {
        return String(
            this.node.widgets?.find((widget) => widget.name === name)?.value || ""
        );
    }

    labelColor() {
        return LABEL_COLORS[this.widgetText("label_color")] || LABEL_COLORS[DEFAULT_LABEL_COLOR];
    }

    fitText(ctx, text, maxWidth) {
        if (ctx.measureText(text).width <= maxWidth) return text;
        let value = text;
        while (value.length && ctx.measureText(`${value}…`).width > maxWidth) {
            value = value.slice(0, -1);
        }
        return value ? `${value}…` : "";
    }

    imageBounds(image, y) {
        if (!image?.img?.naturalWidth || !image?.img?.naturalHeight) {
            return null;
        }
        const [nodeWidth, nodeHeight] = this.node.size;
        const height = nodeHeight - y;
        if (nodeWidth <= 0 || height <= 0) {
            return null;
        }
        const imageAspect = image.img.naturalWidth / image.img.naturalHeight;
        const widgetAspect = nodeWidth / height;
        const width = imageAspect > widgetAspect
            ? nodeWidth
            : height * imageAspect;
        const targetHeight = imageAspect > widgetAspect
            ? nodeWidth / imageAspect
            : height;
        return {
            x: (nodeWidth - width) / 2,
            y: y + (height - targetHeight) / 2,
            width,
            height: targetHeight,
        };
    }

    drawImage(ctx, image, y, cropX, side = "left") {
        const bounds = this.imageBounds(image, y);
        if (!bounds) {
            return;
        }

        const destWidth = cropX == null
            ? bounds.width
            : side === "right"
                ? bounds.x + bounds.width - Math.max(bounds.x, Math.min(cropX, bounds.x + bounds.width))
                : Math.min(bounds.width, Math.max(0, cropX - bounds.x));
        if (destWidth <= 0) {
            return;
        }
        const sourceWidth = image.img.naturalWidth * destWidth / bounds.width;
        const sourceX = side === "right" && cropX != null
            ? image.img.naturalWidth - sourceWidth
            : 0;
        const destX = side === "right" && cropX != null
            ? bounds.x + bounds.width - destWidth
            : bounds.x;

        ctx.save();
        ctx.beginPath();
        const compositeOperation = ctx.globalCompositeOperation;
        if (cropX != null) {
            ctx.rect(destX, bounds.y, destWidth, bounds.height);
            ctx.clip();
        }
        ctx.drawImage(
            image.img,
            sourceX,
            0,
            sourceWidth,
            image.img.naturalHeight,
            destX,
            bounds.y,
            destWidth,
            bounds.height
        );

        ctx.globalCompositeOperation = compositeOperation;
        ctx.restore();
    }

    mouse(event, pos) {
        if (event.type !== "pointerdown") {
            return false;
        }

        const hit = this.hitAreas.find(({ bounds }) => {
            const [x, y, width, height] = bounds;
            return (
                pos[0] >= x &&
                pos[0] <= x + width &&
                pos[1] >= y &&
                pos[1] <= y + height
            );
        });
        if (!hit) {
            return false;
        }

        const selected = [...this.selected];
        if (hit.image.name.startsWith("A")) {
            selected[0] = hit.image;
        } else if (hit.image.name.startsWith("B")) {
            selected[1] = hit.image;
        }
        this.setSelected(selected.filter(Boolean));
        return true;
    }

    computeSize(width) {
        return [width, 20];
    }

    serializeValue() {
        return {
            images: this._value.images.map((item) => {
                const value = { ...item };
                delete value.img;
                return value;
            }),
        };
    }
}

app.registerExtension({
    name: "ComfyUI_GadgetPack.ImageComparer",
    async addCustomNodeDefs(defs) {
        if (defs[NODE_TYPE]) {
            defs[NODE_TYPE].category = NODE_CATEGORY;
            defs[NODE_TYPE].python_module = NODE_PYTHON_MODULE;
        }
    },
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) {
            return;
        }

        nodeData.category = NODE_CATEGORY;
        nodeData.python_module = NODE_PYTHON_MODULE;
        nodeType.category = NODE_CATEGORY;
        nodeType.python_module = NODE_PYTHON_MODULE;
        ImageComparerNode.nodeType = nodeType;
        ImageComparerNode.nodeData = nodeData;
        ImageComparerNode.category = NODE_CATEGORY;
        NODE_OVERRIDES.set(nodeType, ImageComparerNode);
    },
});


