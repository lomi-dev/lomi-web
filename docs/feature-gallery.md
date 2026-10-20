# Feature gallery

The gallery uses the existing `features` group in Payload: heading, accent,
description, and 1–12 feature items. Titles, descriptions, and short detail
labels are rendered at build time. The website-editor migration adds image,
video and alternative-text fields to each feature, plus editable dialog labels.

The first preview occupies two rows beside two smaller previews; the remaining
features fill the lower grid. Tablet and phone layouts reduce the columns.
One or two published features use a simpler layout without empty lead cells.

Unconfigured previews show six local, animated workspace illustrations in the
same pale palette as the hero. **Preview scene** selects terminals, panels,
editing, browser previews, Git or coding agents independently of item order.
Each eight-second loop demonstrates one part of the workflow. These are
code-native SVG/CSS scenes, so they stay sharp in both cards and the dialog.
Select images or short uploaded videos directly in Payload to replace them.
When both are selected, the image becomes the video's poster. Feature
alternative text overrides the media-library description; an empty override falls back to the
file's description or the feature title. See [the editing guide](cms-editing.md).

**Pause previews** stops all simulated previews; the dialog has the same control.
**Features → Controls** provides editable pause/resume labels. Scenes pause
outside the viewport, in a background tab, behind another dialog and on hidden
slides. Pausing preserves their current frame. Reduced motion and no JavaScript
show static illustrations. Uploaded videos keep their existing playback behavior.
No external media service, animation dependency or GIF download is required.

With JavaScript, selecting a preview opens a white native dialog. Desktop
places the media beside a panel containing the title, description, and
navigation; narrow windows stack the media above the text. Previous/next
controls, dots, and arrow keys select another feature. Native video controls
keep their own keyboard shortcuts. Hidden videos pause when navigating or
closing, and card previews pause when the modal opens. The description scrolls
independently while navigation and the close button stay visible. Escape or a
backdrop click closes the dialog and restores focus to the original preview.
Resizing keeps that preview reachable.

The opening motion connects the selected thumbnail to the enlarged media.
Navigation moves the entire feature slide, including its media, description,
counter, arrows, dots, and divider, as one unit in the chosen direction. The
dialog frame and close button stay fixed. One live navigation is moved into
the selected slide, preserving its controls and keyboard focus; the outgoing
slide carries an inert snapshot of its previous navigation state and preview
frame, without restarting the simulation during the swipe.
Repeated input completes the current slide and proceeds directly to the latest
requested feature,
without restarting the motion or building a queue of intermediate slides.
Outgoing slide copies are inert, excluded from accessibility, and removed
when the transition finishes.

Reduced motion uses short fades. Changing the motion preference or resizing
during a transition settles on the latest requested feature. Closing the
dialog removes temporary layers and prevents stale transitions after reopening.

Without JavaScript or native dialog support, every description stays visible
below its preview and the links jump to the matching text.

Run the preview lifecycle checks against the built site. The script starts and
closes its own temporary static server when no verification URL is supplied:

```sh
bun run build
bun run verify:feature-previews
```
