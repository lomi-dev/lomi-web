Archived image placeholders from [Placehold](https://placehold.co/):

- `workspace.png`: 1600 × 1000.
- `mobile.png`: 430 × 932, from the previous two-device hero.
- `detail.png`: 660 × 600, from the earlier feature gallery.

The website no longer renders these numbered images. Current fallbacks use
`src/components/MediaPlaceholder.astro`: a pale frame, thin border and 16px
corners. The hero variant outlines a Lomi workspace. Features and dialogs use
`FeatureSimulation.astro` for six animated workspace closeups. Download has a
dedicated workspace overview; Devlog and Remote use a centered faint Lomi
wordmark, or the uploaded CMS brand logo.

The workspace outline, built-in wordmark and native video posters are local,
code-native SVGs in `public/placeholders/` and make no external requests.
Real uploaded media takes precedence over placeholders.

```sh
bun run build
bun run verify:placeholders
```
