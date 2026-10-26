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
| Homepage | Hero copy/actions/media, feature cards and media, newsletter copy and form feedback, section order and visibility |
| Page content | Download, Remote, Devlog and Cookies: SEO, copy, links, images, controls, feedback and visibility settings |

Homepage **Layout** rows can be dragged to change section order. Toggle
**Enabled** to hide a section, or remove its row. Each section can appear once.
Links to disabled homepage sections are omitted from the shared navigation,
Product menu, footer and hero actions. Section links in the shared header
return to the homepage when followed from a subpage. Empty Product groups and
social lists can be removed without reappearing on the next save.

Feature rows control both cards and their detail dialog. Their order also
controls dialog navigation.

The CLI compatibility list follows Features and shares its visibility. Its
verified catalog and Iconify marks stay in code; they are not editable claims
in the CMS. See [CLI compatibility](cli-compatibility.md).

The removed roadmap, workflow, principles, FAQ and old download sections are
hidden in the editor. Their stored content is retained for compatibility and
history. Existing Roadmap layout rows remain readable but are ignored by the
public site; Roadmap cannot be selected for new layout rows. Links to the
retired section are filtered from public navigation even in older documents.

## Devlog episodes

Choose **Devlogs** in the CMS sidebar to add a video. Episodes are separate
documents with their own drafts and publication history. **Title**, **YouTube
URL** and **Published at** are required for publication. Description, duration,
uploaded thumbnail and thumbnail alternative text are optional. The display
date determines newest-first order; it does not schedule publication.

The newest published episode appears as a wide thumbnail with its title below.
Other published episodes form a two-column archive grid. The introduction
sits beside the videos on desktop and above them on mobile. Each card links
directly to its YouTube video.
Thumbnails come from the Media library or a local placeholder; visiting Devlog
does not request YouTube thumbnails or load an embedded player.

Page headings, labels, SEO and the empty state are in **Website → Page content
→ Devlog page**. Without published episodes the page shows a neutral thumbnail
space and a short message, without sample films. The old decorative slate and
eyebrow fields are hidden and their values retained. Existing authored page copy is preserved when upgrading;
change the previous Work in progress text in this group if it was already saved.
Publish the episode and rebuild the website to show it. See [the Devlog guide](devlog.md).

## Images and video

Upload files in **Media library**, or select/upload a file in a media field.
Supported originals are PNG, JPEG, WebP, AVIF, GIF, MP4 and WebM, up to 50 MiB
per file. Files are served from the CMS, so its media directory must remain
available after deployments. The collection is public to read; uploading,
editing and deleting require an administrator.

The active homepage hero is a static laptop composition. **Poster** accepts an
optional uploaded image that replaces the image projected into the laptop
screen. When empty, the screen uses the dark workspace capture at
`src/assets/product/workbench.png`; `src/assets/hero/laptop-concrete.png`
provides the laptop artwork. The hero **Title**, **Accent**, **Description**,
action labels and destinations, and **Preview alt** remain editable.

The retained hero **Media mode**, **Video**, **Video URL** and **Player** fields
are for archived layouts and do not affect the selected homepage hero. Changing
Media mode or uploading a video will not add a YouTube embed or player to the
current hero.
Feature cards and dialogs use Retina renders of the matching Lomi UI on the
supplied Tahoe wallpaper, with an enlarged detail, when
both media fields are empty. **Preview scene** selects which function to show
and stays with the feature when you reorder it. Uploaded images and videos
replace these renders.
Download shows the current Lomi app capture while its **Screenshot → Image**
field is empty. Selecting an image replaces the capture inside the same
showcase box. Devlog thumbnails and Remote use a pale placeholder with a
centered brand logo. The uploaded site logo replaces the built-in Lomi
wordmark there. Native video poster fallbacks use local SVGs until the
video's first frame is ready.

The legacy hero **Player** group retains labels for playback, replay, seeking,
volume, fullscreen and retry. Its time template supports `{current}` and
`{duration}`. The selected static homepage hero does not display these controls.

Each feature can have an image and an uploaded video. With both selected, the
video is shown and the image is its poster. **Alt** overrides the file's
alternative text; when empty, the file description or feature title is used.
The homepage **Preview alt** field supplies the accessible description for the
laptop and its projected workspace screen. Empty image fields keep the
existing local assets. Changing the uploaded logo replaces the header and
footer wordmark; the original logo animation applies only to the built-in
wordmark.

## Labels, templates and links

Text fields accept plain text, not executable HTML. Template tokens are replaced
by the interface; keep a token when its changing value should remain visible:

- `{platform}`, `{package}`, `{tag}` in download and installation labels.
- `{title}` in feature controls.
- `{year}` in footer copyright.
- `{embedding}` and `{privacy}` in Cookies paragraphs insert the configured
  information links.

Links support HTTPS, email addresses using `mailto:`, homepage anchors and the
existing website routes `/`, `/download/`, `/remote/`, `/mobile-app/`, `/devlog/`
and `/cookies/`.
Use a full route such as `/cookies/#preferences` for a subpage section. Theme
colors use six-digit hex values, for example `#c8ff3d`.

Download package names and descriptions can be changed, but platform IDs,
release verification and the GitHub release source remain in code. The editable
AUR command is displayed and copied as text; the website never executes it.
Legacy Remote installer fields remain for database compatibility but are unused
by the Remote launch page. That page displays a CLI dashboard and newsletter.
Newsletter endpoint credentials, deployment settings and consent
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
