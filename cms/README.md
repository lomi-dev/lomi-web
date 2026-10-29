# Lomi content admin

A separate Payload CMS app for the complete website. The Astro site has its
own dependencies and build; run the following commands from `cms/` using Node
22.16+ (Node 22 LTS) and Bun. The CMS build also needs the shared
`../content/` schemas and defaults. Deploy from a checkout containing both
`cms/` and `content/`; the Turbopack root includes their common parent.

```sh
bun install --frozen-lockfile
cp .env.example .env
# Set PAYLOAD_SECRET in .env (openssl rand -hex 32 produces a suitable value).
bun run seed
bun run dev
```

Open <http://localhost:3001/admin> and create the first administrator using
Payload's first-user form. There are no default credentials. All CMS users are
administrators; after the first account exists, only signed-in administrators
can create or manage users. Finish account creation before exposing the service
to the public. The production Docker image instead initializes the administrator
from `CMS_ADMIN_EMAIL` and `CMS_ADMIN_PASSWORD` before listening. Its first start
fails without valid credentials; later starts preserve existing accounts.
Configure `NEXT_PUBLIC_SERVER_URL` with the CMS's HTTPS origin when hosting it.
See the [Coolify deployment guide](../deploy/coolify.md) for the complete setup.

The **Website** global keeps its existing `landing` API slug and version history.
Its unnamed tabs organize Navigation, Footer, Site settings, Homepage, and Page
content. Edit the homepage section order and visibility in Layout; each section
can appear once. Page content includes Download, Remote, Devlog, and Cookies.
Images, uploaded videos, YouTube URLs, theme colors, SEO, links, labels, and
accessibility text are editable. Upload a poster and choose the hero media mode
to display an image, a YouTube player, or an uploaded video. Hero → Player
includes the custom video player's controls, playback, mute, volume, seeking,
fullscreen, retry, and time labels. Keep `{current}` and `{duration}` in the
time label so the website can insert playback times.

Legacy unused fields are hidden, retained in storage, and optional. New optional
fields receive the shared website defaults when older documents are read. Saving
records a hidden editor version so intentionally empty new lists stay empty.
Existing text, media, published content, and drafts are never replaced by seeding.
Navigation and footer destinations accept HTTPS URLs, simple section anchors,
and supported local routes. Theme colors require six-digit hexadecimal values.
Save drafts while editing, then publish when ready. The CMS retains up to 20
versions. Public requests see only published content; authenticated administrators
can read drafts and history and update website content.

The **Media library** accepts PNG, JPEG, WebP, AVIF, GIF, MP4, and WebM originals
up to 50 MiB per file. SVG and executable formats are excluded. Image fields
filter to images; video fields filter to videos. Add meaningful alternative text
for informative images (decorative images can use an empty value). Contextual
alternative text on a page or feature overrides the library text; when empty,
the website uses the media library text. Media files
are public; only authenticated administrators can upload, edit, or delete them.
An image field left empty uses its built-in website asset where available.

The public REST endpoint is:

```text
http://localhost:3001/api/globals/landing?depth=1&draft=false
```

Set the Astro site's `CMS_URL` to the CMS origin to use this content during
its build. Set the optional runtime-only `SITE_REBUILD_URL` and
`SITE_REBUILD_TOKEN` to enable a durable Payload queue that requests a Coolify
website rebuild after publication. Draft saves do not trigger builds. The queue
runs once per minute and retries failed webhook calls; monitor the resulting
website deployment in Coolify. Without this integration, rebuild and redeploy
the site manually to show newly published content. There is no draft preview
route. The CMS is separate from the static site's host.

`bun run seed` manually imports and publishes the checked-in JSON only when no
landing content or draft versions exist. Repeating it never overwrites edits.
It does not create an account. The Docker container runs migrations,
`bun run bootstrap:admin`, this idempotent seed, and
`bun run recover:rebuilds` before starting Next.js. Recovery reclaims interrupted
rebuilds while the previous CMS instance is stopped.

```sh
bun run check          # TypeScript
bun run generate:types # Regenerate Payload types after schema changes
bun run build          # Generate the admin import map and build Next.js
bun run start          # Serve the production build on port 3001
```

`PAYLOAD_SECRET` is required for every CMS command, including build. Keep it
stable and private. Local SQLite defaults to `file:./data/payload.db` relative to
`cms/`; `data/` is ignored by Git. Hosting requires a persistent, writable volume
and a single CMS instance for this local database. Set `DATABASE_URL` to a
`file:` URL on that volume. Set `MEDIA_UPLOAD_DIR` to a persistent writable
directory (default
`./data/media` relative to `cms/`). Back up both the SQLite database and media
directory, and protect the secret. Uploads are original files with no generated
variants; no image processor is required. Do not use an ephemeral/serverless filesystem for production storage.

Payload's SQLite adapter applies the schema automatically in development.
Before changing an existing production schema, create and apply Payload database
migrations (`bunx payload migrate:create`, then `bunx payload migrate`). The
checked-in migrations include the initial schema, task statuses, complete website
fields, published and draft/version tables, and media relationships. Apply them
in order before production start. The additive hero player controls migration
adds optional labels to published content and version history; existing player
copy is preserved and missing labels use the shared defaults. Its rollback
removes only those new labels. The additive `20261020_160000_feature_previews`
migration adds optional pause/play labels for simulated feature previews to
published content and version history. Existing feature `icon` values now
appear as **Preview scene** choices; uploaded images and videos take priority.
The website migration preserves existing
edited fields; its rollback removes the new editor fields and media database
records, so back up first. Rollback does not remove uploaded files. Run
`NODE_ENV=production bunx payload migrate` with the production environment.
Do not use development schema push against a migrated production database.

No email transport is configured: Payload logs emails locally. Configure a
production email adapter before relying on password-reset email delivery.

Devlog episodes live in the separate **Devlogs** collection. It starts empty:
seeding website copy never creates sample episodes. Add a title, an HTTPS
YouTube watch/share/shorts/embed URL, and a publication date, then publish.
Incomplete work can be saved as a draft. Optional fields include a description
(up to 1000 characters), duration (`m:ss` or `h:mm:ss`), an uploaded image
thumbnail, and alternative text (up to 500 characters). Thumbnail selection
accepts only images from the Media library. Without an uploaded image, the
website uses its local placeholder; it never fetches YouTube thumbnails.
Publication dates determine newest-first ordering and display; future dates do
not schedule publication. Published episodes are public immediately.

Anonymous visitors can read published episodes only. Authenticated editors can
create, update, delete, read drafts, and inspect up to 20 versions per episode.
The published feed is available at `/api/devlogs?depth=1&draft=false`; its default
sort is `-publishedAt`. Website → Page content → Devlog page contains the page
heading, latest/archive/watch labels, and empty-state copy. Publish and rebuild
the Astro website to display episode or page-copy changes.

The additive `20261020_150000_devlogs` migration creates the episode and version
tables, locked-document relationship, and optional Devlog page-copy columns.
Existing website rows and version history are preserved. Its rollback removes
Devlog episodes and their history plus the new copy columns, while retaining
older website data and uploads. Back up before rolling back. Roll back this
migration before older website migrations, then reapply dependencies in order.
