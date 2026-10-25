# Feature gallery

The gallery uses the existing `features` group in Payload: heading, accent,
and 1–12 feature items. Titles, item descriptions, and short detail labels
are rendered at build time; the old section description is no longer shown.
The website-editor migration adds image, video and alternative-text fields to
each feature, plus editable dialog labels.

The first preview occupies two rows beside two smaller previews; the remaining
features fill the lower grid. Tablet and phone layouts reduce the columns.
One or two published features use a simpler layout without empty lead cells.

When a feature has no uploaded media, its card and dialog show a composed
desktop composition built from a recording of the real native Lomi window.
The six captures match the **Preview scene** choices: terminals, workspaces,
file editing, browser previews, Git, and AI tools. The supplied Tahoe wallpaper
fills the scene, with the application window at 80% of its width. Each silent
MP4 shows the feature in use, with individual durations from 8.4 to 11.4 seconds.
Terminals, workspaces, and browser previews use a stationary camera. Code, Git,
and Chat each use one gentle zoom anchored to the action, returning to the full
window before the next loop. The actual native
titlebar and window controls are part of the recording; CSS supplies the shadow
and responsive placement, with no added border. Preparation trims the thin
native frame outline at the edge of the footage. The wallpaper stays stationary. Short, wide
dialog panes reduce the window width to keep the complete window visible.

`scripts/capture-feature-movies.mjs` builds an isolated copy of the neighboring
desktop checkout and records its macOS window. It uses a fresh app identity and
profile, temporary projects, a real local terminal and Git repository, and a
localhost page in the actual child WebView. Chat uses an isolated deterministic
provider fixture, with no paid provider calls. It does not drive the user's
running app or projects. Capture helpers are kept in
`scripts/feature-movies-capture/`; raw recordings and cue evidence are ignored
under `artifacts/feature-demos/raw/`. Prepare the web assets with
`node scripts/prepare-feature-videos.mjs`; the resulting MP4s and native
first-frame posters live in `src/assets/product/demos/`. Shared camera cues
are in `media/feature-demos/cues.json`. The wallpaper is the user's supplied
`tahoe-light.jpg`, copied
without modification; Astro generates the delivered WebP version.

macOS replaces the traffic lights with a purple indicator while recording a
window. Asset preparation restores only that small OS controls area from a
screenshot of the same native window taken immediately before recording.
The original movies and window screenshots are retained as capture evidence;
no application controls or titlebars are drawn or recreated.

All assets load locally and reserve their dimensions. Video sources are assigned
only when their preview is visible. Playback pauses offscreen, in hidden tabs,
or behind another dialog. The gallery and modal have no play/pause buttons.
Reduced motion uses a static poster; without JavaScript, the poster also
remains visible. Only the primary app image has
alternative text; the wallpaper and video are decorative. Uploading a feature
image or video replaces its render; with both selected, the image is the
video poster. Feature alternative text overrides the media-library description;
an empty override falls back to the file's description or the feature title.
See [the editing guide](cms-editing.md).

With JavaScript, selecting a preview opens a white native dialog. Desktop
places the media beside its title and description; narrow windows stack the
media above the text. Previous/next buttons sit halfway along the left and right
edges of the entire dialog. The bottom counter, dots, and navigation footer are
removed. Outer gutters keep the edge buttons fully visible and clickable on
small screens; a single-feature gallery hides them. Arrow keys and Home/End
also select features, while a hidden status region announces the selected title.
Native video controls
keep their own keyboard shortcuts. Hidden videos pause when navigating or
closing. The description scrolls independently while navigation and the close
button stay visible.
Escape or a backdrop click closes the dialog and restores focus to the original
preview. Resizing keeps that preview reachable.

The opening motion connects the selected thumbnail to the enlarged media.
Navigation moves the feature's media and description together in the chosen
direction. The dialog frame, edge arrows, and close button stay
fixed. The edge navigation lives outside the moving slides, preserving keyboard
focus. The outgoing slide carries an inert canvas snapshot of the current movie
frame. Repeated input completes the
current slide and proceeds directly to the latest requested feature, without
restarting the motion or building a queue of intermediate slides. Outgoing
slide copies are inert, excluded from accessibility, and removed when the
transition finishes.

Reduced motion uses short fades. Changing the motion preference or resizing
during a transition settles on the latest requested feature. Closing the
dialog removes temporary layers and prevents stale transitions after
reopening.

Without JavaScript or native dialog support, every description stays visible
below its preview and the links jump to the matching text.

Run the render checks against the built site. The script starts and
closes its own temporary static server when no verification URL is supplied:

```sh
bun run build
bun run verify:feature-previews
```

To export the six complete scenes as 1920 × 1200 PNGs, together with desktop
and mobile gallery previews, run `node scripts/export-feature-renders.mjs`
after building. Files are saved to `artifacts/feature-renders/`. The export
uses the site's actual composition, waits for all lazy images to decode,
and removes page chrome from the resulting images.

For full wallpaper compositions and looping GIF downloads, run
`node scripts/render-feature-demos.mjs --quality delivery` after capturing.
See [the editable HyperFrames project](../media/feature-demos/README.md).
