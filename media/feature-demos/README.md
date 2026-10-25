# Lomi feature demo compositions

This folder contains the editable HyperFrames composition used to render the
six short Lomi feature demos. It layers the original Tahoe wallpaper behind a
recording of the real native app window, including the titlebar already in the
recording. The camera only scales and moves that recording; the composition
does not draw app controls, labels, or interface elements.

## Inputs

By default, `scripts/render-feature-demos.mjs` reads the prepared videos from
`src/assets/product/demos/`. It accepts `.mp4`, `.webm`, and `.mov` files named
`terminal`, `panels`, `code`, `expand`, `git`, and `spark`. Capture footage can
be selected with `--input-dir` when it has been retimed to the configured demo
duration. Per-feature output duration, source duration, focus, and camera timing
are in the tracked `cues.json`; configured values there override matching
capture-manifest values. A feature with `zoom: 1` uses a static camera and does
not need a focus point. Zoomed features use normalized focus coordinates, where
`(0, 0)` is top-left and `(1, 1)` is bottom-right.

```json
{
  "defaults": { "zoom": 1 },
  "demos": [
    {
      "name": "terminal",
      "source": "terminal.mp4",
      "duration": 8.4,
      "sourceDuration": 10,
      "focus": null,
      "zoom": 1
    }
  ]
}
```

`duration` is the prepared video and composition length. `sourceDuration` is the
native capture length before the root preparation step retimes it. Each input
video must match its configured `duration` within 0.1 seconds. The renderer
creates a temporary root-level composition for each feature so the wallpaper,
window recording, and composition all receive that feature's exact duration.
Those temporary files are removed after rendering. On zoomed features, the
camera scales around the focus point and returns to the opening framing before
the video ends.

## Render

From `lomi-web/`, run:

```sh
node scripts/render-feature-demos.mjs --only code --quality draft --no-gif
node scripts/render-feature-demos.mjs --quality delivery
```

The optional `--only` flag is intended for the first camera proof and review.
Final MP4s are written to `artifacts/feature-demos/rendered/`, first-frame
WebP posters to `artifacts/feature-demos/posters/`, and optional 960×600
looping GIFs to `artifacts/feature-demos/gif/`. The shared timing contract
and six feature keys live in [`cues.json`](./cues.json). The website uses the
raw native recordings with the same cue data; these full-frame composites are
separate downloadable and review exports.

The HyperFrames CLI is pinned in this project at version `0.8.193`. Use
Node.js 22 or newer. Rendering is local; the script does not call hosted
rendering or media-generation services.
