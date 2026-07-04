import { app } from "/scripts/app.js";

const EXTENSION_NAME = "ComfyUI_Group_DoubleClickBypass";
const EXTENSION_VERSION = "0.5.0";
const ENABLED_STORAGE_KEY = "ComfyUI_GadgetPack.GroupDoubleClickBypass.enabled";
const BYPASS_MODE = 4;
const GROUP_TITLE_HEIGHT = 26;
const DOUBLE_CLICK_MS = 450;
const DOUBLE_CLICK_PX = 8;

let installed = false;
let menuInstalled = false;
let enabled = localStorage.getItem(ENABLED_STORAGE_KEY) !== "false";
let lastClick = null;
let ignoreNextDblClick = false;

function setEnabled(value) {
  enabled = value;
  localStorage.setItem(ENABLED_STORAGE_KEY, enabled ? "true" : "false");
  console.info(`[${EXTENSION_NAME}] ${enabled ? "enabled" : "disabled"}`);
}

function pointInRect(point, pos, size) {
  return (
    point[0] >= pos[0] &&
    point[1] >= pos[1] &&
    point[0] <= pos[0] + size[0] &&
    point[1] <= pos[1] + size[1]
  );
}

function getEventGraphPosition(canvas, event) {
  const rect = canvas.canvas.getBoundingClientRect();
  const scale = canvas.ds?.scale ?? 1;
  const offset = canvas.ds?.offset ?? [0, 0];
  return [
    (event.clientX - rect.left) / scale - offset[0],
    (event.clientY - rect.top) / scale - offset[1],
  ];
}

function getGraph(canvas) {
  return canvas?.graph ?? app.graph;
}

function getNodes(graph) {
  if (Array.isArray(graph?._nodes)) return graph._nodes;
  if (Array.isArray(graph?.nodes)) return graph.nodes;
  return [];
}

function getGroupsAtPoint(graph, point) {
  const groups = Array.isArray(graph?.groups) ? graph.groups : [];
  return groups
    .filter((group) => pointInRect(point, group.pos, group.size))
    .sort((a, b) => a.size[0] * a.size[1] - b.size[0] * b.size[1]);
}

function isPointOnGroupTitle(group, point) {
  return point[1] <= group.pos[1] + GROUP_TITLE_HEIGHT;
}

function isPointOnNode(nodes, point) {
  return nodes.some((node) => {
    if (typeof node.isPointInside === "function") {
      return node.isPointInside(point[0], point[1]);
    }

    const pos = node.pos ?? [0, 0];
    const size = node.size ?? [0, 0];
    return pointInRect(point, pos, size);
  });
}

function getNodesInGroup(nodes, group) {
  return nodes.filter((node) => {
    const pos = node.pos ?? [0, 0];
    const size = node.size ?? [0, 0];
    return (
      pos[0] >= group.pos[0] &&
      pos[1] >= group.pos[1] + GROUP_TITLE_HEIGHT &&
      pos[0] + size[0] <= group.pos[0] + group.size[0] &&
      pos[1] + size[1] <= group.pos[1] + group.size[1]
    );
  });
}

function setNodeBypass(node, bypass) {
  if (bypass) {
    if (node.mode !== BYPASS_MODE) {
      node._groupDoubleClickPreviousMode = node.mode ?? 0;
      node.mode = BYPASS_MODE;
    }
    return;
  }

  if (node.mode === BYPASS_MODE) {
    node.mode = node._groupDoubleClickPreviousMode ?? 0;
    delete node._groupDoubleClickPreviousMode;
  }
}

function markGraphChanged(canvas, graph) {
  canvas.setDirty?.(true, true);
  canvas.setDirtyCanvas?.(true, true);
  canvas.draw?.(true, true);
  graph.change?.();
}

function toggleGroupBypass(canvas, graph, group) {
  const nodes = getNodesInGroup(getNodes(graph), group);
  if (!nodes.length) return false;

  const shouldBypass = nodes.some((node) => node.mode !== BYPASS_MODE);
  for (const node of nodes) {
    setNodeBypass(node, shouldBypass);
  }

  markGraphChanged(canvas, graph);
  console.info(
    `[${EXTENSION_NAME}] ${shouldBypass ? "bypassed" : "unbypassed"} ${nodes.length} nodes in group "${group.title ?? "Group"}"`
  );
  return true;
}

function isEditableTarget(target) {
  return !!target?.closest?.("input, textarea, button, select, [contenteditable='true']");
}

function isInsideCanvas(canvas, event) {
  const rect = canvas.canvas.getBoundingClientRect();
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
}

function findTargetGroup(canvas, event) {
  const graph = getGraph(canvas);
  const point = getEventGraphPosition(canvas, event);
  const nodes = getNodes(graph);
  const group = getGroupsAtPoint(graph, point).find((candidate) => !isPointOnGroupTitle(candidate, point));

  if (!group || isPointOnNode(nodes, point)) {
    return null;
  }

  return { graph, group };
}

function consumeEvent(event) {
  event.preventDefault?.();
  event.stopImmediatePropagation?.();
  event.stopPropagation?.();
}

function tryToggleFromEvent(event) {
  if (!enabled) return false;
  if (event.button !== 0 || isEditableTarget(event.target)) return false;

  const canvas = app.canvas;
  if (!canvas?.canvas || !isInsideCanvas(canvas, event)) return false;

  const target = findTargetGroup(canvas, event);
  if (!target) return false;

  if (!toggleGroupBypass(canvas, target.graph, target.group)) return false;

  consumeEvent(event);
  return true;
}

function isRepeatedClick(event) {
  if (!lastClick) return false;
  const dt = event.timeStamp - lastClick.timeStamp;
  const dx = event.clientX - lastClick.clientX;
  const dy = event.clientY - lastClick.clientY;
  return dt >= 0 && dt <= DOUBLE_CLICK_MS && Math.hypot(dx, dy) <= DOUBLE_CLICK_PX;
}

function rememberClick(event) {
  lastClick = {
    clientX: event.clientX,
    clientY: event.clientY,
    timeStamp: event.timeStamp,
  };
}

function onPointerDown(event) {
  if (event.button !== 0) return;

  if (isRepeatedClick(event) && tryToggleFromEvent(event)) {
    ignoreNextDblClick = true;
    lastClick = null;
    return;
  }

  rememberClick(event);
}

function onDoubleClick(event) {
  if (ignoreNextDblClick) {
    ignoreNextDblClick = false;
    consumeEvent(event);
    return;
  }

  tryToggleFromEvent(event);
}

function install() {
  if (installed) return;
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("dblclick", onDoubleClick, true);
  installed = true;
  console.info(`[${EXTENSION_NAME}] installed v${EXTENSION_VERSION}, ${enabled ? "enabled" : "disabled"}`);
}

function getMenuItem() {
  const color = enabled ? "#8a8a8a" : "#ffffff";
  return {
    content: `<span style="color:${color}">组双击绕过</span>`,
    callback: () => setEnabled(!enabled),
  };
}

function installCanvasMenuToggle() {
  if (menuInstalled) return;

  const LGraphCanvas = window.LGraphCanvas ?? window.LiteGraph?.LGraphCanvas;
  const original = LGraphCanvas?.prototype?.getCanvasMenuOptions;
  if (typeof original !== "function") return;

  LGraphCanvas.prototype.getCanvasMenuOptions = function (...args) {
    const options = original.apply(this, args) ?? [];
    options.push(null, getMenuItem());
    return options;
  };

  menuInstalled = true;
}

app.registerExtension({
  name: EXTENSION_NAME,
  getCanvasMenuOptions() {
    return [getMenuItem()];
  },
  setup() {
    install();
    installCanvasMenuToggle();
  },
});
