"""
Comfy 76
Live-preview and offline-rendering FET compressor for ComfyUI.

Uses a reduced nonlinear JFET feedback model inspired by Rev D.
Not a component-accurate circuit simulation.
"""

import math
import struct
import uuid
from functools import lru_cache
from pathlib import Path

import folder_paths
import numpy as np
import torch


def _process_block(
    x,
    y,
    state,
    sr,
    input_db,
    output_db,
    attack,
    release,
    ratio,
    all_buttons,
):
    # x/y: [channels, samples].
    # Preserve state between contiguous blocks.
    drive = 10.0 ** (input_db / 20.0)
    makeup = 10.0 ** (output_db / 20.0)

    ta = 800e-6 * 0.025 ** ((attack - 1.0) / 6.0)
    tr = 1.1 * (0.05 / 1.1) ** ((release - 1.0) / 6.0)

    threshold = -21.0 if all_buttons else -18.0
    knee = 3.0 if all_buttons else 1.0

    if all_buttons:
        ta *= 1.5

    aa = -math.expm1(-1.0 / (sr * ta * ratio))
    ar = -math.expm1(-1.0 / (sr * tr * ratio))
    am = -math.expm1(-1.0 / (sr * 0.18))
    dc = -math.expm1(-2.0 * math.pi * 5.0 / sr)

    # Effective model parameters, not measured device data.
    scale = 0.080
    u0 = 0.020
    k = 30.0
    a0 = 1.0 + 2.0 * k * u0

    gr = state[0]
    memory = state[1]
    peak = state[2]

    for n in range(x.shape[1]):
        over = 20.0 * math.log10(max(peak, 1e-12)) - threshold

        if over <= -0.5 * knee:
            over = 0.0
        elif over < 0.5 * knee:
            over = (over + 0.5 * knee) ** 2 / (2.0 * knee)

        target = min(36.0, (ratio - 1.0) * over)

        memory += am * (gr - memory)

        rate = aa if target > gr else ar / (1.0 + memory / 18.0)
        gr += rate * (target - gr)

        a = a0 * 10.0 ** (gr / 20.0)
        u = (a - 1.0) / (2.0 * k)
        pinch = k * u * u

        peak = 0.0

        for c in range(x.shape[0]):
            v = x[c, n] * drive * scale

            if v >= u + pinch:
                vd = v - pinch
            else:
                vd = 2.0 * v / (
                    a + math.sqrt(max(0.0, a * a - 4.0 * k * v))
                )

            signal = vd * (a0 / scale)

            state[3 + c] += dc * (signal - state[3 + c])
            signal -= state[3 + c]

            # Linked detector, before output gain.
            peak = max(peak, abs(signal))
            y[c, n] = signal * makeup

    state[0] = gr
    state[1] = memory
    state[2] = peak


@lru_cache(maxsize=1)
def _compiled():
    try:
        from numba import njit
    except ImportError as exc:
        raise RuntimeError(
            "Comfy 76 needs numba. Install requirements.txt using "
            "the Python environment that runs ComfyUI."
        ) from exc

    return njit(nogil=True)(_process_block)


def _float(default, low, high):
    return (
        "FLOAT",
        {
            "default": default,
            "min": low,
            "max": high,
            "step": 0.1,
        },
    )


def _write_live_source(dry, sr):
    # dry: [channels, frames].
    # Float WAV stores interleaved frames.
    channels, frames = dry.shape
    data_size = frames * channels * 4

    if data_size > 0xFFFFFFFF - 48:
        raise ValueError(
            "Comfy 76: source is too large for live-preview WAV."
        )

    samples = np.ascontiguousarray(dry.T, dtype="<f4")
    block_align = channels * 4

    filename = f"comfy_76_live_{uuid.uuid4().hex}.wav"
    temp = Path(folder_paths.get_temp_directory())
    temp.mkdir(parents=True, exist_ok=True)

    with (temp / filename).open("wb") as f:
        f.write(
            struct.pack(
                "<4sI4s",
                b"RIFF",
                48 + data_size,
                b"WAVE",
            )
        )
        f.write(
            struct.pack(
                "<4sIHHIIHH",
                b"fmt ",
                16,
                3,  # IEEE float
                channels,
                sr,
                sr * block_align,
                block_align,
                32,
            )
        )
        f.write(struct.pack("<4sII", b"fact", 4, frames))
        f.write(struct.pack("<4sI", b"data", data_size))
        f.write(memoryview(samples).cast("B"))

    return {
        "filename": filename,
        "subfolder": "",
        "type": "temp",
    }


class Comfy76:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "audio": ("AUDIO",),
                "input_db": _float(0.0, -24.0, 36.0),
                "output_db": _float(0.0, -36.0, 24.0),
                "attack": _float(4.0, 1.0, 7.0),
                "release": _float(4.0, 1.0, 7.0),
                "ratio": (
                    ["4", "8", "12", "20", "All (approx)"],
                ),
                "oversampling": (
                    ["4x", "2x", "1x", "8x"],
                ),
            }
        }

    RETURN_TYPES = ("AUDIO",)
    FUNCTION = "process"
    CATEGORY = "audio/effects"
    DESCRIPTION = (
        "Comfy 76 FET compressor. Queue once to load Live Preview, "
        "then adjust controls while it plays. Oversampling applies "
        "to the queued render, not the live monitor."
    )

    def process(
        self,
        audio,
        input_db,
        output_db,
        attack,
        release,
        ratio,
        oversampling,
    ):
        sr = int(audio["sample_rate"])

        waveform = audio["waveform"]
        if waveform.ndim != 3:
            raise ValueError(
                "Comfy 76 expects AUDIO shaped "
                "[batch, channels, samples]."
            )

        dry = (
            waveform.detach()
            .to(device="cpu", dtype=torch.float32)
            .contiguous()
            .numpy()
        )

        if sr <= 0:
            raise ValueError("Comfy 76: sample rate must be positive.")

        if dry.shape[0] == 0 or dry.shape[1] == 0:
            raise ValueError("Comfy 76: audio contains no clips or channels.")

        length = dry.shape[-1]

        if length == 0:
            return {
                "ui": {"comfy_76_source": []},
                "result": (audio,),
            }

        factor = int(oversampling[:-1])
        x = dry
        window = ("kaiser", 10.0)

        if factor > 1:
            try:
                from scipy.signal import resample_poly
            except ImportError as exc:
                raise RuntimeError(
                    "Comfy 76 needs scipy for oversampling. "
                    "Install requirements.txt or select 1x."
                ) from exc

            x = np.ascontiguousarray(
                resample_poly(
                    dry,
                    factor,
                    1,
                    axis=-1,
                    window=window,
                )
            )

        run = _compiled()
        all_buttons = ratio == "All (approx)"
        r = 16.0 if all_buttons else float(ratio)

        y = np.empty_like(x)

        for b in range(x.shape[0]):
            state = np.zeros(
                3 + x.shape[1],
                dtype=np.float64,
            )

            run(
                x[b],
                y[b],
                state,
                sr * factor,
                input_db,
                output_db,
                attack,
                release,
                r,
                all_buttons,
            )

        if factor > 1:
            y = resample_poly(
                y,
                1,
                factor,
                axis=-1,
                window=window,
            )

        rendered = {
            "waveform": torch.from_numpy(
                np.ascontiguousarray(y[..., :length])
            ),
            "sample_rate": sr,
        }

        # Live Preview uses the dry first clip of the batch.
        # All clips are processed in the offline AUDIO output.
        live_source = _write_live_source(dry[0], sr)

        return {
            "ui": {
                "comfy_76_source": [live_source],
            },
            "result": (rendered,),
        }


WEB_DIRECTORY = "./web"

NODE_CLASS_MAPPINGS = {
    "comfy_76": Comfy76,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "comfy_76": "Comfy 76",
}
