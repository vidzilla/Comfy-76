![Comfy 76 FET Compressor Emulation custom node](assets/comfy-76-fet-compressor-emulation-custom-node.png)

Comfy-76
Comfy 76 brings FET-style compression inspired by the 1176 Rev D (blackface) to ComfyUI. Features live looping preview, real-time knob adjustments, dry/wet A/B, adjustable attack and release, selectable ratios, and up to 8x oversampled rendering. Dial in your sound without re-queuing, then render it directly into your audio workflow.

Comfy 76
A FET-style compressor for ComfyUI with live preview, real-time controls, and oversampled rendering.

Comfy 76 uses a reduced nonlinear JFET feedback model inspired by the classic 1176 Rev D (blackface) compressor. It aims for useful FET-style dynamics and coloration—not a component-accurate recreation of the original hardware.

Queue your source audio once, start Live Preview, and adjust the compressor while the clip loops. No need to re-queue for every knob change.

Features
Live Preview — Adjust the compressor while your source clip loops.
Dry/Wet A/B — Compare processed audio against the original.
Input and output gain — Drive the compression and level-match the result.
Attack and release — Familiar 1–7 controls, with higher settings responding faster.
Selectable ratios — 4, 8, 12, 20, and an approximate all-buttons mode.
Oversampled rendering — Choose 1×, 2×, 4×, or 8×.
Linked multichannel detection — Channels share the gain-reduction control.
Black-and-white styling — Optional appearance extension for supported ComfyUI frontends.
Installation
Place the files in your ComfyUI custom nodes directory:


text

Copy block


ComfyUI/
└── custom_nodes/
    └── comfy_76/
        ├── __init__.py
        ├── requirements.txt
        └── web/
            ├── live_preview.js
            ├── live_processor.mjs
            └── appearance.js
appearance.js provides the optional black-and-white styling.

Install Dependencies
Use the same Python environment that runs ComfyUI.

From the ComfyUI directory:


bash

Copy block


python -m pip install -r custom_nodes/comfy_76/requirements.txt
For Windows Portable, run this from the portable root directory:


powershell

Copy block


.\python_embeded\python.exe -m pip install -r .\ComfyUI\custom_nodes\comfy_76\requirements.txt
The additional Python dependencies are:


text

Copy block


numba
scipy
Restart ComfyUI and hard-refresh your browser.

Search for Comfy 76 in the node menu under audio/effects.

Quick Start
Connect:


text

Copy block


Load Audio → Comfy 76 → Preview Audio
Select your audio file.
Queue the workflow once and wait for processing to finish.
Click Live Preview on the Comfy 76 node.
Adjust Input, Output, Attack, Release, and Ratio while the clip loops.
Use A/B to compare dry and wet.
When you are happy with the settings, queue again to render them to the node’s AUDIO output.
To export, connect Comfy 76 to an audio-saving node.

Stop the separate Preview Audio player before starting Live Preview. Otherwise, both streams may play at the same time.

Controls
CONTROL	DESCRIPTION
Input dB	Gain before compression. Increase it to drive more compression and nonlinear coloration.
Output dB	Gain after compression. Use it to control output level and level-match the dry/wet comparison.
Attack	1 is slowest; 7 is fastest. Lower settings allow more transient energy through.
Release	1 is slowest; 7 is fastest. Higher settings recover more quickly between peaks.
Ratio	Select 4, 8, 12, 20, or All (approx). These are nominal model settings, not measured hardware specifications.
Oversampling	Processing-rate multiplier for queued renders. Does not affect Live Preview.
Live Preview	Starts a looping, browser-based preview of the loaded source. Click again to stop.
A/B: Wet / Dry	Switches the live monitor between processed and original audio. Does not bypass the queued render.
There is no threshold control. Increase Input dB to push the signal further above the model’s internal threshold, then adjust Output dB to compensate.

Suggested Starting Point
CONTROL	SETTING
Input	0 dB, then increase to taste
Output	Adjust to match the dry level
Attack	4
Release	4
Ratio	4
Oversampling	4×
Start at a comfortable listening volume, particularly when increasing input or output gain.

Live Preview and Rendered Output
Live Preview is for dialing in the sound. Queued rendering produces the audio passed to the rest of your workflow.

LIVE PREVIEW	QUEUED RENDER
Processing location	Browser audio thread	ComfyUI Python backend
Knob changes	Audible during playback	Applied on the next queue
Oversampling	1×	Selected setting
Monitor attenuation	−12 dB	None
Final clipping guard	Yes, after monitor attenuation	No
Batch handling	First clip only	Every clip
A/B button	Dry/wet comparison	No effect
Both use the same underlying compression model, but they are not sample-identical:

Live Preview runs at the browser audio context’s sample rate.
Live gain changes are smoothed to reduce clicks.
The live compressor preserves its state during playback and across loop boundaries.
Offline rendering starts with fresh state and can use oversampling.
The −12 dB monitor attenuation affects dry and wet playback equally. It does not change the rendered or saved audio.

Rendered output is not peak-limited. Reduce Output dB if your export clips.

Which Player Should I Use?
Load Audio player: Plays the original source file.
Preview Audio player: Plays the last queued render.
Comfy 76 Live Preview: Responds to knob changes while playing.
For real-time adjustment, use the button on Comfy 76 itself.

Changing the Source Clip
Live Preview uses the source provided by the most recent completed execution.

To load another clip:

Stop Live Preview.
Select the new file in Load Audio.
Queue the workflow.
Start Live Preview again.
Re-queuing does not replace a live loop that is already playing.

Oversampling
Oversampling increases the internal processing rate during offline rendering, helping reduce aliasing from the nonlinear model.

1×: Lowest processing cost; useful for quick checks.
2×: A lighter oversampled option.
4×: A practical starting point for final renders.
8×: Higher processing cost for additional oversampling.
Oversampling does not affect Live Preview.

Browser Requirements
Live Preview requires:

A browser supporting Web Audio and AudioWorklet
ComfyUI accessed through localhost or HTTPS
Browser permission to play audio
For local use, open:


text

Copy block


http://localhost:8188
Plain HTTP access through a remote machine’s IP address may prevent AudioWorklet from running.

Live Preview processes a loaded audio clip. It is not a microphone input, DAW insert, or system-audio processor.

How It Works
Comfy 76 combines:

A nonlinear JFET shunt model
Sample-by-sample feedback detection
Shared gain control across channels
Attack and release smoothing
A simple program-dependent release memory
Low-frequency DC removal
Optional oversampling for offline rendering
The DSP uses effective model parameters rather than a direct transcription of the original circuit’s component values.

Modeling Limitations
Comfy 76 does not fully reproduce:

Input and output transformers
Discrete signal preamplifier and line-amplifier stages
The original gain-control amplifier and detector circuitry
The original ratio pushbutton network
Component tolerances, noise, and hardware calibration
Original metering circuitry
All (approx) is an alternate compression voicing, not an exact simulation of the hardware’s all-buttons behavior.

Appearance
The optional appearance.js extension gives Comfy 76:

A black node body
A dark title bar and controls
White text and control markings
This targets canvas-rendered ComfyUI controls. Frontends using DOM/Vue-rendered controls may require additional styling.

The extension is intended to change Comfy 76 only, leaving other nodes unchanged.

Troubleshooting
Comfy 76 Does Not Appear
Confirm that __init__.py is inside custom_nodes/comfy_76/.
Make sure the filename is not __init__.py.txt.
Restart ComfyUI.
Check the startup terminal for import errors.
Install dependencies using the Python environment that runs ComfyUI.
Live Preview Buttons Are Missing
Confirm that WEB_DIRECTORY = "./web" is present in __init__.py.
Verify that the live-preview files are inside the web directory.
Keep the processor filename as live_processor.mjs.
Restart ComfyUI and hard-refresh the browser.
Check the browser console for JavaScript errors.
Live Preview Asks Me to Queue First
Connect Comfy 76 to Preview Audio or an audio-saving output node, queue the workflow, and wait for it to finish.

Knob Changes Do Not Affect What I Hear
Make sure you are using Live Preview on Comfy 76, not one of the separate audio players.

Also check that A/B is set to Wet.

Live Preview Will Not Start
Access ComfyUI through localhost or HTTPS.
Allow audio playback if the browser prompts you.
Check the browser console for errors.
If ComfyUI has restarted or its temporary files were cleared, queue the workflow again.
The Sound Is Distorted or Too Loud
Reduce Input dB or Output dB.

The live monitor has a final clipping guard, but excessive gain can still produce audible clipping. Offline output has no final clipping guard.

Live Preview Is Quieter Than the Export
This is expected. Live Preview has −12 dB of monitor attenuation. That attenuation is not applied to the queued render.

The First Render Takes Longer
Numba compiles the processing function on first use. Later executions can reuse the compiled function within the same running session.

Playback Stutters
Try a shorter clip, close other demanding browser tabs, and keep the ComfyUI tab active.

Live Preview performance depends on the browser, device, channel count, and other running workloads.

The Node Is Not Black with White Controls
Install web/appearance.js, restart ComfyUI, and hard-refresh the browser.

Styling support depends on the frontend and how its controls are rendered.

Temporary Files
Each completed execution writes a dry float-WAV file to ComfyUI’s temporary directory for browser preview.

Long clips use additional disk space and browser memory.
Live Preview loads the first clip of an audio batch.
The offline AUDIO output processes every clip in the batch.
Comfy 76 does not immediately delete preview files after playback; cleanup follows ComfyUI’s temporary-file handling.
Upgrading from the Earlier Node
This version uses:

ITEM	NAME
Folder	comfy_76
Registered node ID	comfy_76
Display name	Comfy 76
Remove the earlier comfy_1176 installation if you no longer need it.

Existing workflows referencing the old node must have their compressor replaced with Comfy 76.

References and Acknowledgments
The classic 1176 Rev D (blackface) compressor provides the hardware inspiration.

Hardware reference material includes M. Nats’ DIY 1176LN Rev D, Version 2 schematic and bill of materials, dated 30 April 2008. That document describes the hardware’s signal preamplifier, line amplifier, gain-reduction control amplifier, meter driver, power supply, and associated components.

Comfy 76 does not implement that schematic as a complete component-level simulation. Its JFET parameters, detector calibration, timing behavior, and all-buttons response are simplified DSP approximations.

Trademark Notice
Universal Audio and its product names and trademarks belong to their respective owners. References to the 1176 and Rev D hardware are used solely to identify the design inspiration.

Comfy 76 is an independent project and is not affiliated with, sponsored by, or endorsed by Universal Audio or M. Nats.
