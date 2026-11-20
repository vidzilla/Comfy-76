import { app } from "../../scripts/app.js";

const COLORS = {
    title: "#080808",
    body: "#000000",
    outline: "#777777",
    text: "#ffffff",
};

function styleNode(node) {
    node.color = COLORS.title;
    node.bgcolor = COLORS.body;
    node.boxcolor = COLORS.outline;
    node.title_text_color = COLORS.text;

    // Supported by some frontend/widget versions.
    for (const widget of node.widgets ?? []) {
        widget.options ??= {};
        widget.options.text_color = COLORS.text;
    }

    node.setDirtyCanvas?.(true, true);
}

app.registerExtension({
    name: "comfy_76.appearance",

    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "comfy_76") return;

        const originalCreated = nodeType.prototype.onNodeCreated;
        const originalConfigure = nodeType.prototype.onConfigure;

        nodeType.prototype.onNodeCreated = function (...args) {
            const result = originalCreated?.apply(this, args);
            styleNode(this);
            return result;
        };

        nodeType.prototype.onConfigure = function (...args) {
            const result = originalConfigure?.apply(this, args);

            // Override any older color saved in the workflow.
            styleNode(this);
            return result;
        };
    },

    setup() {
        const canvas = app.canvas;
        const LiteGraph = globalThis.LiteGraph;

        if (!canvas || !LiteGraph) {
            console.warn(
                "[Comfy 76] Canvas color customization is not supported " +
                "by this frontend. Node background colors still apply."
            );
            return;
        }

        const originalDrawNode = canvas.drawNode;

        if (typeof originalDrawNode !== "function") return;

        // LiteGraph uses shared colors for canvas controls.
        // Override them only while drawing Comfy 76, then restore them.
        const palette = {
            NODE_TITLE_COLOR: "#ffffff",
            NODE_SELECTED_TITLE_COLOR: "#ffffff",
            NODE_TEXT_COLOR: "#ffffff",
            WIDGET_BGCOLOR: "#080808",
            WIDGET_OUTLINE_COLOR: "#666666",
            WIDGET_TEXT_COLOR: "#ffffff",
            WIDGET_SECONDARY_TEXT_COLOR: "#ffffff",
        };

        canvas.drawNode = function (node, ctx, ...args) {
            if (node?.type !== "comfy_76") {
                return originalDrawNode.call(this, node, ctx, ...args);
            }

            const previous = {};

            for (const key of Object.keys(palette)) {
                previous[key] = {
                    owned: Object.prototype.hasOwnProperty.call(
                        LiteGraph,
                        key
                    ),
                    value: LiteGraph[key],
                };
            }

            ctx.save();

            try {
                Object.assign(LiteGraph, palette);

                ctx.fillStyle = COLORS.text;
                ctx.strokeStyle = COLORS.text;

                return originalDrawNode.call(this, node, ctx, ...args);
            } finally {
                for (const key of Object.keys(palette)) {
                    if (previous[key].owned) {
                        LiteGraph[key] = previous[key].value;
                    } else {
                        delete LiteGraph[key];
                    }
                }

                ctx.restore();
            }
        };

        // Also style nodes already present when the extension starts.
        for (const node of app.graph?._nodes ?? []) {
            if (node.type === "comfy_76") {
                styleNode(node);
            }
        }
    },
});
