# Editing the website in Payload

Open `/admin` on the CMS host and choose **Website**. The public API still uses
the `landing` global, so existing content and version history stay together.
Use **Save draft** while editing and **Publish** when the changes are ready.
Publishing never replaces other content with the checked-in seed.

## Where to edit

| Tab | Editable content |
| --- | --- |
| Navigation | Top-level links, Product groups and their links, mobile labels, GitHub labels, main action and its destination |
| Footer | Invitation, link groups, GitHub action, social destinations and icons, legal links, copyright, Cookie settings and accessibility labels |
| Site settings | Homepage SEO, brand name, logo, favicon, social image, language, color palette, GitHub destination, skip link and cookie dialog copy |
| Homepage | Hero copy/actions/media, feature cards and media, roadmap milestones/tasks/statuses, newsletter copy and form feedback, section order and visibility |
| Page content | Download, Remote, Devlog and Cookies: SEO, copy, links, images, controls, feedback and visibility settings |

Homepage **Layout** rows can be dragged to change section order. Toggle
**Enabled** to hide a section, or remove its row. Each section can appear once.
Links to disabled homepage sections are omitted from the shared navigation,
Product menu, footer and hero actions. Section links in the shared header
return to the homepage when followed from a subpage. Empty Product groups and
social lists can be removed without reappearing on the next save.

Feature rows control both cards and their detail dialog. Their order also
controls dialog navigation. Roadmap rows control milestones, and each task's
status controls its progress indicator. A task without an explicit status
inherits Completed from an Available milestone, or Not started otherwise.

The removed workflow, principles, FAQ and old download sections are hidden in
the editor. Their stored content is retained for compatibility and history;
they are not available as Layout rows.

## Images and video

Upload files in **Media library**, or select/upload a file in a media field.
Supported originals are PNG, JPEG, WebP, AVIF, GIF, MP4 and WebM, up to 50 MiB
per file. Files are served from the CMS, so its media directory must remain
available after deployments. The collection is public to read; uploading,
editing and deleting require an administrator.

Hero **Media mode** selects one image, an inline YouTube player, or an uploaded
video. **Poster** supplies the image and the YouTube loading state. **Video URL**
accepts an HTTPS YouTube watch, share or embed URL. The player still requires
the visitor's external-media permission; changing content does not bypass it.
An uploaded video uses native playback controls and does not require YouTube.
If the selected media is empty, the existing local placeholder is used.

Each feature can have an image and an uploaded video. With both selected, the
video is shown and the image is its poster. **Alt** overrides the file's
alternative text; when empty, the file description or feature title is used.
Hero and subpage images use their contextual alternative-text fields. Empty
image fields keep the existing local assets. Changing the uploaded logo
replaces the header and footer wordmark; the original logo animation applies
only to the built-in wordmark.

## Labels, templates and links

Text fields accept plain text, not executable HTML. Template tokens are replaced
by the interface; keep a token when its changing value should remain visible:

- `{platform}`, `{package}`, `{tag}` in download and installation labels.
- `{title}` in feature controls.
- `{phase}`, `{completed}`, `{total}` in roadmap labels.
- `{year}` in footer copyright.
- `{embedding}` and `{privacy}` in Cookies paragraphs insert the configured
  information links.

Links support HTTPS, email addresses using `mailto:`, homepage anchors and the
existing website routes `/`, `/download/`, `/remote/`, `/devlog/`, `/cookies/`.
Use a full route such as `/cookies/#preferences` for a subpage section. Theme
colors use six-digit hex values, for example `#c8ff3d`.

Download package names and descriptions can be changed, but platform IDs,
release verification and the GitHub release source remain in code. Editable
Remote and AUR commands are displayed and copied as text; the website never
executes them. Newsletter endpoint credentials, deployment settings and consent
storage behavior remain in environment/configuration code.

## Making published changes visible

Astro produces a static site. Set `CMS_URL` to the CMS origin in the website's
build environment, then rebuild and redeploy after publishing:

```sh
CMS_URL=https://cms.example.com bun run build
```

Deploy the generated `dist/` directory through the existing hosting workflow.
There is no automatic publishing webhook or draft preview in this change.
Without `CMS_URL`, builds intentionally use the local seed and shared defaults.
With `CMS_URL`, a failed request, draft response or invalid published document
fails the build instead of quietly deploying fallback copy.

See [CMS setup and migrations](../cms/README.md) before upgrading an existing
production CMS. Back up its database and media directory, apply the checked-in
migrations, then start the updated CMS. Running the seed again never overwrites
existing published content or drafts.

## Verification

```sh
bun run test:content
bun run verify:cms-content
bun run --cwd cms check
bun run --cwd cms test
```

The browser verifier builds against an isolated published-content fixture,
checks authored changes across all five routes, and cleans up its temporary
output. The CMS integration suite separately uses disposable SQLite databases
and upload directories to check real migrations, publishing, draft isolation,
media persistence, validation and safe updates. Neither suite edits the real
CMS database.
