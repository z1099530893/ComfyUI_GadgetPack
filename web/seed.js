import { app } from "../../scripts/app.js";

const MAX_SEED_NUM = 1125899906842624;
const SEED_NODE = "GadgetPack Random Seed";
const SEED_WIDGET_NAMES = ["seed_num", "seed", "noise_seed"];
const CONTROL_WIDGET_NAMES = ["control_before_generate", "control_after_generate"];
const CONTROL_LABELS = {
  fixed: "固定",
  increment: "递增",
  decrement: "递减",
  randomize: "随机",
};

function findSeedWidget(node) {
  return node?.widgets?.find((w) => SEED_WIDGET_NAMES.includes(w.name));
}

function findControlWidget(node) {
  return node?.widgets?.find((w) => CONTROL_WIDGET_NAMES.includes(w.name));
}

app.registerExtension({
  name: "GadgetPack.seed",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== SEED_NODE) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      onNodeCreated?.apply(this, arguments);

      const randomSeedButton = this.addWidget(
        "button",
        "🎲 手动随机种子",
        null,
        () => {
          const control = findControlWidget(this);
          const seed = findSeedWidget(this);
          if (control && control.value !== "fixed") control.value = "fixed";
          if (seed) seed.value = Math.floor(Math.random() * MAX_SEED_NUM);
          app.queuePrompt(0, 1);
        },
        { serialize: false },
      );

      const seedWidget = findSeedWidget(this);
      const controlWidget = findControlWidget(this);
      if (controlWidget) {
        // 下拉值保持英文以兼容核心的生成后控制逻辑，仅显示为中文
        controlWidget.options = controlWidget.options ?? {};
        controlWidget.options.getOptionLabel = (value) => CONTROL_LABELS[value] ?? value;
      }
      if (seedWidget) {
        seedWidget.linkedWidgets = [randomSeedButton, controlWidget].filter(Boolean);
      }
    };

    const onAdded = nodeType.prototype.onAdded;
    nodeType.prototype.onAdded = async function () {
      onAdded?.apply(this, arguments);
      const seedWidget = findSeedWidget(this);
      const controlWidget = findControlWidget(this);
      setTimeout(() => {
        if (controlWidget?.name === "control_before_generate" && seedWidget?.value === 0) {
          seedWidget.value = Math.floor(Math.random() * MAX_SEED_NUM);
        }
      }, 1);
    };
  },
});
