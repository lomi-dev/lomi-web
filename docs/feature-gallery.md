# Feature gallery

The gallery uses the existing `features` group in Payload: heading, accent,
description, and 1–12 feature items. Titles, descriptions, and short detail
labels are rendered at build time. The website-editor migration adds image,
video and alternative-text fields to each feature, plus editable dialog labels.

The first preview occupies two rows beside two smaller previews; the remaining
features fill the lower grid. Tablet and phone layouts reduce the columns.
One or two published features use a simpler layout without empty lead cells.

When a feature has no uploaded media, its card and dialog show a local animated
GIF captured from the real Lomi React/Vite interface. The six captures match
the **Preview scene** choices: terminals, workspaces, file editing, browser
previews, Git, and AI tools. Each has a local WebP poster for initial loading,
reduced-motion preferences, and no-JavaScript browsers. The GIF is requested
only while its card or active dialog slide is visible. Uploading a feature
image or video replaces its capture; with both selected, the image is the
video poster. Feature alternative text overrides the media-library description;
an empty override falls back to the file's description or the feature title.
See [the editing guide](cms-editing.md).

Offscreen cards, hidden slides, cards behind the open dialog, background tabs,
and reduced-motion settings stop GIF playback. Reduced motion and no
JavaScript keep the static poster visible.

With JavaScript, selecting a preview opens a white native dialog. Desktop
places the media beside a panel containing the title, description, and
navigation; narrow windows stack the media above the text. Previous/next
controls, dots, and arrow keys select another feature. Native video controls
keep their own keyboard shortcuts. Hidden videos pause when navigating or
closing, and card previews suspend when the modal opens. The description
scrolls independently while navigation and the close button stay visible.
Escape or a backdrop click closes the dialog and restores focus to the original
preview. Resizing keeps that preview reachable.

The opening motion connects the selected thumbnail to the enlarged media.
Navigation moves the entire feature slide, including its media, description,
counter, arrows, dots, and divider, as one unit in the chosen direction. The
dialog frame and close button stay fixed. One live navigation is moved into
the selected slide, preserving its controls and keyboard focus; the outgoing
slide carries an inert static poster snapshot. Repeated input completes the
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

Run the preview lifecycle checks against the built site. The script starts and
closes its own temporary static server when no verification URL is supplied:

```sh
bun run build
bun run verify:feature-previews
```
