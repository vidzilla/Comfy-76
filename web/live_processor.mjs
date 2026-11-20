const dbToGain = (db) => Math.pow(10, db / 20);

const step = (seconds) =>
    -Math.expm1(-1 / (sampleRate * seconds));

class Comfy76Live extends AudioWorkletProcessor {
    constructor({ processorOptions }) {
        super();

        this.dc = new Float64Array(processorOptions.channels);

        this.gr = 0;
        this.memory = 0;
        this.peak = 0;

        this.dcStep =
            -Math.expm1(-2 * Math.PI * 5 / sampleRate);

        this.memoryStep = step(0.18);
        this.knobStep = step(0.005);

        // Monitor headroom only. Does not affect offline output.
        this.monitorGain = dbToGain(-12);

        this.setControls(processorOptions.settings);

        this.drive = this.driveTarget;
        this.makeup = this.makeupTarget;
        this.wet = this.wetTarget;

        this.port.onmessage = ({ data }) => {
            this.setControls(data);
        };
    }

    setControls(p) {
        const attack =
            800e-6 * Math.pow(0.025, (p.attack - 1) / 6);

        const release =
            1.1 * Math.pow(0.05 / 1.1, (p.release - 1) / 6);

        this.aa = step(
            attack * p.ratio * (p.all ? 1.5 : 1)
        );

        this.ar = step(release * p.ratio);

        this.threshold = p.all ? -21 : -18;
        this.knee = p.all ? 3 : 1;
        this.ratioMinusOne = p.ratio - 1;

        this.driveTarget = dbToGain(p.inputDb);
        this.makeupTarget = dbToGain(p.outputDb);
        this.wetTarget = p.dry ? 0 : 1;
    }

    process(inputs, outputs) {
        const input = inputs[0];
        const output = outputs[0];

        if (!input?.length || !output?.length) {
            return true;
        }

        const scale = 0.080;
        const k = 30;
        const a0 = 1 + 2 * k * 0.020;

        const halfKnee = 0.5 * this.knee;
        const knobStep = this.knobStep;

        let gr = this.gr;
        let memory = this.memory;
        let peak = this.peak;

        let drive = this.drive;
        let makeup = this.makeup;
        let wet = this.wet;

        for (let n = 0; n < output[0].length; n++) {
            // Smooth gain and A/B changes to reduce clicks.
            drive += knobStep * (this.driveTarget - drive);
            makeup += knobStep * (this.makeupTarget - makeup);
            wet += knobStep * (this.wetTarget - wet);

            let over =
                20 * Math.log10(Math.max(peak, 1e-12))
                - this.threshold;

            if (over <= -halfKnee) {
                over = 0;
            } else if (over < halfKnee) {
                const d = over + halfKnee;
                over = d * d / (2 * this.knee);
            }

            const target = Math.min(
                36,
                this.ratioMinusOne * over
            );

            memory += this.memoryStep * (gr - memory);

            const rate = target > gr
                ? this.aa
                : this.ar / (1 + memory / 18);

            gr += rate * (target - gr);

            const a = a0 * dbToGain(gr);
            const u = (a - 1) / (2 * k);
            const pinch = k * u * u;

            peak = 0;

            for (let c = 0; c < output.length; c++) {
                const dry = input[c]?.[n] ?? 0;
                const v = dry * drive * scale;

                const vd = v >= u + pinch
                    ? v - pinch
                    : 2 * v / (
                        a + Math.sqrt(
                            Math.max(0, a * a - 4 * k * v)
                        )
                    );

                let signal = vd * (a0 / scale);

                this.dc[c] +=
                    this.dcStep * (signal - this.dc[c]);

                signal -= this.dc[c];

                peak = Math.max(peak, Math.abs(signal));

                const mixed =
                    dry + wet * (signal * makeup - dry);

                const monitor = mixed * this.monitorGain;

                // Clip guard for browser monitoring only.
                output[c][n] = Math.max(
                    -1,
                    Math.min(1, monitor)
                );
            }
        }

        this.gr = gr;
        this.memory = memory;
        this.peak = peak;

        this.drive = drive;
        this.makeup = makeup;
        this.wet = wet;

        return true;
    }
}

registerProcessor("comfy-76-live", Comfy76Live);
