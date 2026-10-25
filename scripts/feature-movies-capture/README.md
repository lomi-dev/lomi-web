# Native feature movie capture

This helper records feature scenes from a real Lomi Tauri window. It copies the
current desktop source into a temporary directory, adds the capture hook there,
and creates disposable local workspaces and a Git repository for the scenes.
The browser and Chat AI scenes use local fixtures; they do not call paid
providers.

## Prerequisites

- macOS with Xcode command line tools and `swiftc`
- Node.js 22, pnpm, Rust/Cargo, and the desktop app build dependencies
- `ffmpeg` and `ffprobe` on the paths used by `capture-feature-movies.mjs`
- Screen Recording permission for the terminal or process running the script

## Capture all scenes

Run from `lomi-web`:

```sh
node scripts/capture-feature-movies.mjs
```

The script builds an isolated native app by default and writes native `.mov`
files, `.mp4` encodes, per-scene window stills, and cue JSON into
`artifacts/feature-demos/raw/`. It refuses to replace a non-empty output folder.

## Capture selected scenes

Set `LOMI_FEATURE_MOVIES_SCENES` to a comma-separated list from `terminal`,
`panels`, `code`, `expand`, `git`, and `spark`. Use a new output directory when
capturing only part of the set:

```sh
LOMI_FEATURE_MOVIES_SCENES=panels,git,spark \
LOMI_FEATURE_MOVIES_OUTPUT_DIR=/tmp/lomi-feature-movies/raw \
node scripts/capture-feature-movies.mjs
```

The generated cue files describe only the selected scenes. Merge them with the
other scene assets before using the output as a complete six-scene set.

## Reuse an isolated native build

Set `LOMI_FEATURE_MOVIES_SKIP_BUILD=1` and provide both the isolated source
directory and the Tauri identifier compiled into that binary:

```sh
LOMI_FEATURE_MOVIES_SOURCE_DIR=/private/tmp/lomi-feature-movies-source \
LOMI_FEATURE_MOVIES_IDENTIFIER=dev.lomi.desktop-smoke-feature-movies-example \
LOMI_FEATURE_MOVIES_SKIP_BUILD=1 \
node scripts/capture-feature-movies.mjs
```

The identifier must match the prebuilt app. A normal build uses a unique
identifier for each capture run.

## Output notes

`feature-demos.json` stores normalized camera focus and timing cues.
`feature-demos-cues.json` records native-window details and each action's
normalized target bounds. `capture-proof.json` records the capture mode and
local fixture configuration. macOS may replace the traffic-light area with its
screen-recording indicator during video capture; the MP4 pipeline restores
that small region from the same scene's real native-window still.
