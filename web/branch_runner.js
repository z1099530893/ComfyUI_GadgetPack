import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const EXTENSION_NAME = "Branch_Runner";
const MENU_LABEL = "\u6267\u884c\u8be5\u7ec4";

let lastCanvasMouseEvent = null;
let activeBranchRun = null;

function getCurrentGraph(canvas) {
  return canvas?.getCurrentGraph?.() || app.graph;
}

function getEventCanvasPos(event) {
  if (!event) {
    return null;
  }

  if (Number.isFinite(event.canvasX) && Number.isFinite(event.canvasY)) {
    return [event.canvasX, event.canvasY];
  }

  const canvas = app.canvas;
  if (!canvas) {
    return null;
  }

  const rect = canvas.canvas?.getBoundingClientRect?.();
  const ds = canvas.ds;
  if (!rect || !ds) {
    return null;
  }

  const x = (event.clientX - rect.left) / ds.scale - ds.offset[0];
  const y = (event.clientY - rect.top) / ds.scale - ds.offset[1];
  return [x, y];
}

function isPointInRect(x, y, rect) {
  return x >= rect[0] && y >= rect[1] && x <= rect[0] + rect[2] && y <= rect[1] + rect[3];
}

function getNodeBounds(node) {
  const width = node?.flags?.collapsed
    ? node._collapsed_width || LiteGraph.NODE_COLLAPSED_WIDTH || node.size?.[0] || 0
    : node?.size?.[0] || 0;
  const height = node?.flags?.collapsed
    ? LiteGraph.NODE_TITLE_HEIGHT || 30
    : node?.size?.[1] || 0;
  return [node.pos[0], node.pos[1], width, height];
}

function getGroupAtCanvasPos(graph, x, y) {
  const group = graph?.getGroupOnPos?.(x, y);
  if (group) {
    return group;
  }

  const groups = graph?._groups || graph?.groups || [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const candidate = groups[i];
    if (candidate?.pos && candidate?.size && isPointInRect(x, y, [
      candidate.pos[0],
      candidate.pos[1],
      candidate.size[0],
      candidate.size[1],
    ])) {
      return candidate;
    }
  }

  return null;
}

function getGroupNodes(group, graph) {
  if (!group) {
    return [];
  }

  if (group._children) {
    return Array.from(group._children).filter((item) => item instanceof LGraphNode);
  }

  const groupRect = [
    group.pos?.[0] ?? group._pos?.[0] ?? 0,
    group.pos?.[1] ?? group._pos?.[1] ?? 0,
    group.size?.[0] ?? group._size?.[0] ?? 0,
    group.size?.[1] ?? group._size?.[1] ?? 0,
  ];

  return (graph?._nodes || graph?.nodes || []).filter((node) => {
    const centerX = node.pos[0] + (node.size?.[0] || 0) / 2;
    const centerY = node.pos[1] + (node.size?.[1] || 0) / 2;
    return isPointInRect(centerX, centerY, groupRect);
  });
}

function isOverAnyNode(graph, x, y) {
  return (graph?._nodes || graph?.nodes || []).some((node) => isPointInRect(x, y, getNodeBounds(node)));
}

function isExecutableOutputNode(node) {
  return node?.mode !== LiteGraph.NEVER && node?.constructor?.nodeData?.output_node;
}

function getBranchContext(canvas) {
  const pos = getEventCanvasPos(lastCanvasMouseEvent);
  const graph = getCurrentGraph(canvas);

  if (!pos || !graph || isOverAnyNode(graph, pos[0], pos[1])) {
    return null;
  }

  const group = getGroupAtCanvasPos(graph, pos[0], pos[1]);
  if (!group) {
    return null;
  }

  const nodes = getGroupNodes(group, graph);
  const outputNodes = nodes.filter(isExecutableOutputNode);

  return {
    group,
    nodes,
    outputNodes,
    nodeIds: new Set(nodes.map((node) => String(node.id))),
  };
}

function nodeIdMatchesBranch(promptNodeId, branchNodeIds) {
  const id = String(promptNodeId);
  if (branchNodeIds.has(id)) {
    return true;
  }

  const localId = id.split(":").pop();
  return branchNodeIds.has(localId);
}

function filterPromptToBranch(prompt, branchRun) {
  if (!prompt?.output || !branchRun?.nodeIds?.size) {
    return prompt;
  }

  const oldOutput = prompt.output;
  const branchOutput = {};

  function addNodeAndInputs(nodeId) {
    const nodeData = oldOutput[nodeId];
    if (!nodeData || branchOutput[nodeId]) {
      return;
    }

    branchOutput[nodeId] = nodeData;

    for (const inputValue of Object.values(nodeData.inputs || {})) {
      if (Array.isArray(inputValue) && inputValue.length > 0) {
        addNodeAndInputs(String(inputValue[0]));
      }
    }
  }

  for (const nodeId of Object.keys(oldOutput)) {
    if (nodeIdMatchesBranch(nodeId, branchRun.nodeIds)) {
      addNodeAndInputs(nodeId);
    }
  }

  prompt.output = branchOutput;
  return prompt;
}

async function runBranch(context) {
  if (!context?.outputNodes?.length) {
    alert("\u8be5\u7ec4\u5185\u6ca1\u6709\u53ef\u6267\u884c\u7684\u8f93\u51fa\u8282\u70b9\u3002");
    return;
  }

  activeBranchRun = {
    groupTitle: context.group?.title || context.group?._title || "",
    nodeIds: context.nodeIds,
  };

  try {
    await app.queuePrompt(0);
  } catch (error) {
    console.error("[ComfyUI_Branch Runner] Failed to run group.", error);
    throw error;
  } finally {
    activeBranchRun = null;
  }
}

function addBranchMenuItem(options, canvas) {
  const context = getBranchContext(canvas);
  if (!context) {
    return;
  }

  options.unshift(
    {
      content: MENU_LABEL,
      className: "comfyui-branch-runner-menu-item",
      disabled: !context.outputNodes.length,
      callback: () => runBranch(context),
    },
    null,
  );
}

app.registerExtension({
  name: EXTENSION_NAME,
  async setup() {
    console.info(`[${EXTENSION_NAME}] installed`);

    const adjustMouseEvent = LGraphCanvas.prototype.adjustMouseEvent;
    LGraphCanvas.prototype.adjustMouseEvent = function (...args) {
      const result = adjustMouseEvent?.apply(this, args);
      lastCanvasMouseEvent = args[0];
      return result;
    };

    const getCanvasMenuOptions = LGraphCanvas.prototype.getCanvasMenuOptions;
    LGraphCanvas.prototype.getCanvasMenuOptions = function (...args) {
      const options = getCanvasMenuOptions.apply(this, args);
      addBranchMenuItem(options, this);
      return options;
    };

    const queuePrompt = api.queuePrompt;
    api.queuePrompt = async function (index, prompt, ...args) {
      if (activeBranchRun) {
        filterPromptToBranch(prompt, activeBranchRun);
      }
      return queuePrompt.apply(this, [index, prompt, ...args]);
    };
  },
});
