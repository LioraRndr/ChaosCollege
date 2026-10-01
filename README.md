# CHAOS.COLLAGE

A standalone browser prototype for making dense Y2K / cyber-collage / Xerox-style static graphics.

## Run

On Windows, double-click **CHAOS.COLLAGE** on the desktop, or run `launch.bat` in this folder. That opens the editor in a Chrome/Edge app window.

You can also open `index.html` directly in a modern browser. No install, build step, video processing, or network connection is required. If the browser restricts local files, start a plain static server:

```bash
python -m http.server 8080
```

Then open `http://127.0.0.1:8080`. On macOS/Linux, `./serve.sh` runs the same command.

## Included in the prototype

- Image import and drag/drop
- Text, retro error windows, shapes, arrows, barcodes, tape, and confetti
- Move, resize, rotate, duplicate, reorder, visibility, opacity, and blend modes
- Deterministic repeater/scatter system with seed, step, fade, scale, and jitter controls
- Procedural 3D shatter layer with two forms — exploded shards or a coherent spiky solid — rendered to 2D in pure Canvas: perspective projection, depth-sorted glossy shards, banded Y2K shading, accent faces, wireframe, and radial spikes, all seed-driven
- Image effects: contrast, saturation, posterize, threshold, dither, halftone, pixelate, deterministic block glitch, RGB split, noise, and invert
- Static Datamosh Frame: local stuck-frame feedback, glued texture, stretched ribbons, and accumulated macroblock damage
- Four visual recipes
- Portrait, square, and landscape canvases
- 1x and 2x PNG export
- Undo/redo and keyboard nudging

## Static Datamosh Frame workflow

1. Select an image layer and open `IMAGE FX` in the Inspector.
2. Under `DATAMOSH FRAME`, click **套用卡帧拖坏** to start with a stuck-frame preset.
3. Keep `前一帧` on `自身 / 卡帧反馈` to make one image locally stick, stretch, and break down.
4. Adjust `感染率` for the damaged area, `拖拽距离` and `流向角` for the pull, `矢量块` for the block size, and `卡帧累积` for repeated damage. Zero infection or zero drag distance leaves the self-source image intact.
5. Optionally choose another image layer as `前一帧` to feed its texture into the damaged regions; the source layer may be hidden. Export the final still as PNG.

`Block glitch` remains a separate row-displacement/RGB-damage effect and can be combined with Datamosh Frame.

## Useful shortcuts

- `Ctrl/Cmd + Z`: undo
- `Ctrl/Cmd + Shift + Z`: redo
- `Ctrl/Cmd + D`: duplicate selected layer
- Arrow keys: nudge layer
- Shift + arrow keys: nudge by 10 pixels
- Delete/Backspace: delete selected layer

## Project documentation

Start with [`docs/README.md`](docs/README.md) for the project map, current handoff,
and local session history. Agent-specific working rules live in [`AGENTS.md`](AGENTS.md).
