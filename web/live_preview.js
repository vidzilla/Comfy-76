import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const processorURL = new URL(
    "./live_processor.mjs",
    import.meta.url
).href;

const previews = new WeakMap();

function settingsFor(node, dry) {
    const value = (name, fallback) =>
        node.widgets?.find((widget) => widget.name === name)?.value
        ?? fallback;

    const ratio = String(value("ratio", "4"));
    const all = ratio === "All (approx)";

    return {
        inputDb: Number(value("input_db", 0)),
        outputDb: Number(value("output_db", 0)),
        attack: Number(value("attack", 4)),
        release: Number(value("release", 4)),
        ratio: all ? 16 : Number(ratio),
        all,
        dry,
    };
}

function redraw(node) {
    node.setDirtyCanvas?.(true, true);
}

function sendSettings(node, preview) {
    preview.session?.worklet?.port.postMessage(
        settingsFor(node, preview.dry)
    );
}

function stop(node, preview) {
    const session = preview.session;
    if (!session) return;

    preview.session = null;

    cancelAnimationFrame(session.raf);
    session.abort.abort();

    if (session.source) {
        try {
            session.source.stop();
        } catch {
            // Source may not have started yet.
        }

        session.source.disconnect();
    }

    session.worklet?.disconnect();
    session.worklet?.port.close();

    session.context.close().catch(() => {});

    preview.playButton.name = "Live Preview";
    redraw(node);
}

async function toggle(node, preview) {
    if (preview.session) {
        stop(node, preview);
        return;
    }

    if (!preview.file) {
        window.alert(
            "Comfy 76: queue the workflow once to load " +
            "the source audio for Live Preview."
        );
        return;
    }

    const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

    if (
        !AudioContextClass ||
        !window.AudioWorkletNode ||
        !window.isSecureContext
    ) {
        window.alert(
            "Comfy 76 Live Preview requires localhost or HTTPS."
        );
        return;
    }

    let session;

    try {
        const context = new AudioContextClass({
            latencyHint: "interactive",
        });

        session = {
            context,
            abort: new AbortController(),
            raf: 0,
            source: null,
            worklet: null,
        };

        preview.session = session;
        preview.playButton.name = "Cancel Live Preview";
        redraw(node);

        // Resume during the button-click gesture.
        await context.resume();

        if (preview.session !== session) return;

        const query = new URLSearchParams(preview.file);

        const response = await fetch(
            api.apiURL(`/view?${query.toString()}`),
            { signal: session.abort.signal }
        );

        if (!response.ok) {
            throw new Error(
                `Source audio could not load (HTTP ${response.status}).`
            );
        }

        const encoded = await response.arrayBuffer();

        if (preview.session !== session) return;

        const buffer = await context.decodeAudioData(encoded);

        if (preview.session !== session) return;

        await context.audioWorklet.addModule(processorURL);

        if (preview.session !== session) return;

        const channels = buffer.numberOfChannels;
        const initial = settingsFor(node, preview.dry);

        session.worklet = new AudioWorkletNode(
            context,
            "comfy-76-live",
            {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                channelCount: channels,
                channelCountMode: "explicit",
                channelInterpretation: "discrete",
                outputChannelCount: [channels],
                processorOptions: {
                    channels,
                    settings: initial,
                },
            }
        );

        session.worklet.onprocessorerror = () => {
            if (preview.session !== session) return;

            stop(node, preview);

            window.alert(
                "Comfy 76: the live processor stopped. " +
                "Check the browser console."
            );
        };

        session.source = context.createBufferSource();
        session.source.buffer = buffer;
        session.source.loop = true;

        session.source.connect(session.worklet);
        session.worklet.connect(context.destination);
        session.source.start();

        preview.playButton.name = "Stop Live Preview";
        redraw(node);

        let previous = JSON.stringify(initial);

        const update = () => {
            if (preview.session !== session) return;

            const settings = settingsFor(node, preview.dry);
            const key = JSON.stringify(settings);

            if (key !== previous) {
                session.worklet.port.postMessage(settings);
                previous = key;
            }

            session.raf = requestAnimationFrame(update);
        };

        session.raf = requestAnimationFrame(update);
    } catch (error) {
        // Ignore errors from an already cancelled session.
        if (session && preview.session !== session) return;

        stop(node, preview);

        console.error("[Comfy 76] Live Preview:", error);
        window.alert(`Comfy 76: ${error.message}`);
    }
}

app.registerExtension({
    name: "comfy_76.live_preview",

    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "comfy_76") return;

        const created = nodeType.prototype.onNodeCreated;
        const executed = nodeType.prototype.onExecuted;
        const removed = nodeType.prototype.onRemoved;

        nodeType.prototype.onNodeCreated = function (...args) {
            const result = created?.apply(this, args);

            const preview = {
                file: null,
                session: null,
                dry: false,
            };

            previews.set(this, preview);

            preview.playButton = this.addWidget(
                "button",
                "Live Preview",
                null,
                () => void toggle(this, preview),
                { serialize: false }
            );

            const abButton = this.addWidget(
                "button",
                "A/B: Wet",
                null,
                () => {
                    preview.dry = !preview.dry;

                    abButton.name = preview.dry
                        ? "A/B: Dry"
                        : "A/B: Wet";

                    sendSettings(this, preview);
                    redraw(this);
                },
                { serialize: false }
            );

            const size = this.computeSize();

            this.setSize([
                Math.max(this.size[0], size[0]),
                Math.max(this.size[1], size[1]),
            ]);

            return result;
        };

        nodeType.prototype.onExecuted = function (message, ...args) {
            const result = executed?.call(this, message, ...args);
            const preview = previews.get(this);

            if (
                preview &&
                Array.isArray(message?.comfy_76_source)
            ) {
                preview.file = message.comfy_76_source[0] ?? null;
            }

            return result;
        };

        nodeType.prototype.onRemoved = function (...args) {
            const preview = previews.get(this);

            if (preview) {
                stop(this, preview);
            }

            previews.delete(this);
            return removed?.apply(this, args);
        };
    },
});
