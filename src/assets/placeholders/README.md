Archived image placeholders from [Placehold](https://placehold.co/):

- `workspace.png`: 1600 × 1000.
- `mobile.png`: 430 × 932, from the previous two-device hero.
- `detail.png`: 660 × 600, from the earlier feature gallery.

The website no longer renders these numbered images. Current fallbacks use
`src/components/MediaPlaceholder.astro`: a pale frame, thin border and 16px
corners. The hero and Download use a current app screenshot. Features and
dialogs use six genuine animated UI captures and matching static posters.
Devlog and Remote use a centered faint Lomi wordmark, or the uploaded CMS
brand logo.

The built-in wordmark, archived workspace outline, and generic native video
poster are local SVGs in `public/placeholders/` and make no external requests.
Real uploaded media takes precedence over the fallbacks.

```sh
bun run build
bun run verify:placeholders
```
