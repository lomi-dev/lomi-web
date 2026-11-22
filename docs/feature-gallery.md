# Feature gallery

The gallery uses the existing `features` group in Payload: heading, accent,
and 1–12 feature items. Titles, item descriptions, and short detail labels
are rendered at build time; the old section description is no longer shown.
The website-editor migration adds image, video and alternative-text fields to
each feature. Of the dialog labels, only `chooseLabel` is still used (the tab
list's accessible name).

The section is a single stage. A vertical list of the features sits on the
left; the selected one shows its description beneath its title. Its recording
fills the stage on the right, large enough to read the interface. Visitors choose
a feature by clicking or with the arrow, Home and End keys; nothing advances on a
timer. Each recording restarts when its feature is chosen, and only the visible
one plays. Below 900 px the list becomes one horizontal row above the stage and
the description moves under the recording. The former card grid, the feature
dialog and `feature-gallery.ts` have been removed; the section description is
shown again beside the heading.

When a feature has no uploaded media, the stage shows a composed
desktop composition built from a recording of the real native Lomi window.
The six captures match the **Preview scene** choices: terminals, workspaces,
file editing, browser previews, Git, and AI chat. The supplied Tahoe wallpaper
fills the scene, with the application window at 80% of its width. Each silent
MP4 shows the feature in use, with individual durations from 8.8 to 17 seconds.
The terminal capture runs Claude Code and Codex side by side, the workspace
capture switches between workspaces in the Workspaces list, and the AI chat
capture asks Chat AI a question. Terminals, workspaces, browser previews, and
AI chat use a stationary camera. Code and Git each use one gentle zoom anchored
to the action, returning to the full window before the next loop. The actual native
titlebar and window controls are part of the recording; CSS supplies the shadow
and responsive placement, with no added border. Preparation trims the thin
native frame outline at the edge of the footage. The wallpaper stays stationary. On the stage the
window is widened to 90% of the frame so its interface stays readable.

The current MP4s and first-frame WebP posters are shipped in
`src/assets/product/demos/`. Shared camera cues are in
`media/feature-demos/cues.json`. The window sits on the brand's
Aurora Night (the `.aurora` class), drawn in CSS.

All assets load locally and reserve their dimensions. Video sources are assigned
only when their preview is visible. Playback pauses offscreen, in hidden tabs,
or behind a dialog. The section has no play/pause buttons.
Reduced motion uses a static poster; without JavaScript, the poster also
remains visible. Only the primary app image has
alternative text; the wallpaper and video are decorative. Uploading a feature
image or video replaces its render; with both selected, the image is the
video poster. Feature alternative text overrides the media-library description;
an empty override falls back to the file's description or the feature title.
See [the editing guide](cms-editing.md).
