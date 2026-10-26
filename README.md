# lomi web

Launch landing page for Lomi, a terminal ADE for coding agents.
English copy follows the existing website and is a starting point for editing.

## Preview the website

```sh
bun install --frozen-lockfile
bun run dev
```

Open <http://localhost:4321>. Without `CMS_URL`, the site uses
[`content/landing.json`](content/landing.json), extended with shared editor and
subpage defaults. A running database or CMS is not
required to work on the layout.

The page includes:

- A light hero over cloud wallpaper, with left-aligned copy and a black
  laptop on a concrete plinth showing the Lomi workspace.
- A fixed navigation bar at the viewport's top edge: Product opens a three-column dropdown,
  followed by Newsletter, Devlog, and Docs. Mobile Product uses a Back drill-in.
- A `/devlog/` video archive with a featured latest episode, thumbnail cards
  linking to YouTube, and an empty state until the first real episode is published.
- A site-wide consent banner and Cookie settings, with optional YouTube media
  blocked until permission and a `/cookies/` information page. See
  [consent behavior and verification](docs/cookies.md).
- An asymmetric feature gallery with six short native Lomi MP4 demos,
  first-frame WebP posters, and a
  native media dialog, including feature navigation, keyboard support, and
  readable fallbacks.
- A CLI compatibility list immediately after Features, with 15 desktop
  integrations, locally bundled Iconify marks and a final “And more” item.
  See [the CLI catalog and scope](docs/cli-compatibility.md).
- A horizontal news and updates section before Newsletter. Four “Coming soon”
  cards appear until the first Devlogs are published; then the latest six
  recordings populate the section from the same CMS feed as `/devlog/`.
- A current screenshot of the Lomi app in the hero, with project files, an
  editor and terminal panes. Feature cards/dialogs show matching animated
  captures from the app; Download has its own workspace overview, while
  Devlog and Remote use a centered Lomi wordmark. Uploaded CMS media replaces
  the hero screenshot.
- A typographic newsletter invitation above the footer, with a compact
  centered form below the copy on the same chalk canvas as Features. The shared
  form handles pending, accepted and error states. See [newsletter layout and
  verification](docs/newsletter.md).
- A lime footer that fills exactly one viewport in both dimensions.
- A dedicated `/download/` page linked from the hero, navigation, and footer.
- A dedicated `/remote/` launch page, linked in Product, with a wide terminal
  render in light mode on Tahoe, gray unavailable macOS/Windows/Linux badges
  and a compact newsletter for release news. It retains a centered layout on
  a white canvas.
  See [Remote content boundaries and verification](docs/remote.md).
- A dedicated `/mobile-app/` page in the same light visual style, with real
  light/dark UI in phone mockups, gray unavailable store badges and a direct
  newsletter signup for launch news.
  Product starts with Features, followed by Remote and Mobile App; this also
  updates older published workspace menus. See [Mobile App page](docs/mobile-app.md).

The footer follows the current viewport height with `100dvh` (`100vh` fallback).
Its content scrolls inside the footer when a narrow or short window cannot fit
everything; the outer footer keeps its exact size and every link stays reachable.
The fixed header stays at the top on every page. Anchor offsets and the footer's
top spacing account for its 72px desktop or 64px mobile height.
The header is transparent over the hero and gains a softly blurred surface after
scrolling or opening a menu. Without JavaScript, compact direct navigation links
remain available at every width, without a disclosure covering the destination.

The footer's large dark wordmark uses the original SVG paths, rendered as
halftone dots. A mouse or pen gently parts the dots; clicking sends a ripple
through them. It initializes on entry, stops drawing when settled or offscreen,
and preserves touch scrolling. Reduced motion, unavailable Canvas 2D, and
JavaScript-disabled browsers show the original static SVG. Run
`bun run verify:footer` against the preview server for the focused layout,
keyboard, accessibility, motion, and fallback checks.

The document canvas follows the section at the viewport midpoint during native
elastic overscroll in every direction: light fog for the hero, chalk for the main
canvas, newsletter and Devlog, and lime for the footer. Physical top
and bottom boundaries take their first/last section color.
Updates run on input and section crossings; no idle animation is needed. The
body keeps its own chalk surface. Without JavaScript, the homepage canvas retains its light hero surface and
Devlog stays light. Native vertical bounce is contained on the homepage;
other pages keep native bounce and scroll chaining.
Firefox exposes one solid canvas color, so mixed sections share the midpoint
section's edge color. The native OS trackpad gesture still needs manual QA.
Run `bun run verify:backdrop` (or prefix `VERIFY_BROWSER=firefox`) for section,
edge pixel, navigation, viewport, and fallback regression checks.

Footer social profiles, labels and icons are configured in Payload under
**Website → Footer → Socials**.

Product copy comes from the desktop application's README. The hero uses the
selected light Lomi workspace capture as its local fallback; the CMS poster
can replace it. The retired roadmap, workflow, principles, FAQ and download
section content remains in Payload for compatibility and does not render on
the landing page. Navigation omits links to retired sections and sends old
download anchors to the dedicated download page. See [retired roadmap
compatibility](docs/roadmap.md).

The [design analysis](docs/design-analysis.md) documents all six reference sites,
Appllama, Coda, the four articles about generic AI content, and the decisions
behind this layout.

See [feature gallery behavior and verification](docs/feature-gallery.md) for
placeholder media, Payload editing, responsive layout, and dialog controls.

## Hero background and motion

The selected composition is the homepage's only hero. It renders cloud
wallpaper and the previous black laptop, with the Lomi workspace projected
into its display at build time. It uses static HTML, CSS, and SVG and works
without JavaScript. The agent dock has been removed.
There is no variant picker or query-driven gallery.
The hero fills the viewport with `100dvh` (`100vh` fallback), including the
fixed header. It adapts its layout, typography and laptop size to both window
dimensions. Long text and very short screens retain natural page scrolling.

See [hero composition and verification](docs/hero-scene.md) for its layout,
assets, CMS boundaries, and focused browser checks.

## Edit with Payload CMS

[`cms/`](cms/README.md) is a real, separate Payload 3 / Next.js application with
an admin panel, SQLite database, draft versions, and published content API. It
has its own dependencies and lockfile so Astro keeps its existing static build.

```sh
cd cms
bun install --frozen-lockfile
cp .env.example .env
# Set PAYLOAD_SECRET in .env to a long random value (openssl rand -hex 32).
bun run seed
bun run dev
```

Open <http://localhost:3001/admin>, create your administrator account, and edit
**Website**. The first seed publishes the checked-in content; later
seed commands preserve both published edits and drafts. No default account is
created. All CMS accounts are administrators; create the first account locally
before exposing the CMS publicly.

From the repository root, connect Astro to published CMS content:

```sh
CMS_URL=http://localhost:3001 bun run dev
# Or build the deployable static site:
CMS_URL=http://localhost:3001 SITE_URL=https://lomi.dev bun run build
bun run preview --port 4322
```

Set `CMS_URL` in `.env.local` to keep the connection enabled. The CMS URL is a
server-side content-fetch setting. Uploaded files are served by the CMS to
visitors, so its public media URLs must remain accessible. HTTP is allowed
only for localhost; a hosted CMS requires HTTPS.

Publishing in Payload requires rebuilding and redeploying Astro to update the
live page. Configure the CMS's optional durable rebuild queue to request this
automatically in Coolify; without it, redeploy the website manually. Configured
CMS failures, incomplete content, or drafts fail the build instead of silently
deploying stale copy. There is no authenticated draft preview.

Local SQLite hosting requires one CMS instance, a persistent writable database
and a persistent media directory configured with `MEDIA_UPLOAD_DIR`.
The static site's host cannot execute Payload. See the CMS README for migrations,
backups, environment configuration, and production build commands. The
[Coolify deployment guide](deploy/coolify.md) covers both Docker images,
administrator initialization, persistent storage, domains, and automatic rebuilds.

## Where to edit

- `content/landing.json`: initial copy for every main page section.
- `content/editor-defaults.ts` and `content/page-defaults.ts`: defaults for new
  shared settings, media controls and subpages.
- `content/landing-schema.ts`: shared build-time content contract.
- `content/links.ts`: link policy shared by Astro and Payload.
- `content/load-landing.ts`: optional published-content fetch during rendering.
- `cms/src/globals/Landing.ts`: matching editor fields and access rules.
- `src/pages/index.astro`: rendering of the CMS-authored section order.
- `src/components/FeatureGallery.astro`: feature previews and dialog layout.
- `src/components/feature-gallery.ts`: dialog navigation, motion, and focus.
- `src/components/CliCompatibility.astro` and `src/data/compatible-clis.ts`:
  the verified desktop CLI list, rendered directly after Features.
- `src/components/HomeUpdates.astro` and `src/components/updates-carousel.ts`:
  homepage Devlog cards, empty-state artwork and native carousel controls.
- `src/components/NewsletterSection.astro`: the final homepage newsletter composition.
- `src/components/NewsletterSignup.astro`: shared accessible signup markup and states.
- `src/components/newsletter-signup.ts`: per-instance form state and request lifecycle.
- `src/pages/devlog.astro` and `src/components/DevlogCard.astro`: the Devlog archive.
- `content/load-devlogs.ts`: published, paginated Devlog collection fetch.
- `cms/src/collections/Devlogs.ts`: episode drafts, thumbnails and publication.
- `src/pages/download.astro`: the dedicated installer and package page.
- `src/components/Header.astro`: Product groups, responsive disclosure, and routing.
- `src/styles/global.css`: responsive layout and brand tokens.
- `src/components/`: navigation, footer, features, original clouds, forms, icons.
- `src/components/Hero.astro` and `src/components/hero/`: the cloud hero and
  actions; `WorkspaceDeck.astro` and `src/lib/laptop-screen.ts` render its laptop.
- `src/components/HeroVideo.astro`: archived inline player and playback lifecycle.
- `src/data/site.ts`: fixed product/repository destinations.
- `src/layouts/Layout.astro`: metadata and local fonts.

Payload's **Website** editor covers navigation and Product groups, footer and
socials, branding and colors, SEO, homepage layout, media, features,
newsletter and cookie messages, plus all four subpages. Images and videos can
be uploaded through the Media library. Built-in assets remain fallbacks.
See [the editing guide](docs/cms-editing.md) for field locations, templates,
media modes, publishing and the settings intentionally kept in code.
See [Devlog publishing](docs/devlog.md) to add the first episode.

## Video and download behavior

The homepage hero uses a static product image. Its text, actions, and optional
poster come from the CMS. Archived video/player fields and `HeroVideo.astro`
remain available for older layouts, but do not render in the desktop hero.
Feature-gallery videos and their native media dialog retain their existing
behavior. See [feature gallery](docs/feature-gallery.md).

The hero, navigation, and legacy CMS download links lead to `/download/`. The
page shares the homepage's white canvas, Geist typography and lime action.
A complete download chooser groups the system, package and primary action
beside an editable product preview with the shared placeholder. Local Iconify Simple Icons
identify each system. The copyable Arch Linux command appears only when
Linux is selected and precedes the product image on small screens.
The page uses the latest stable primary GitHub release to offer the available seven
installer formats: macOS DMG for Apple silicon and Intel, Windows EXE and MSI,
and Linux AppImage, DEB, and RPM. Arch Linux uses `yay -S lomi-bin`. Version and
asset availability come from GitHub; unavailable packages stay unavailable. A
release-page fallback remains usable when release loading fails or JavaScript
is disabled. Release notes continue to link directly to GitHub. Arch users run
the displayed command in their own terminal; the website does not install software.

The newsletter renders above the footer. Its email field and submit button stay
disabled with an explicit unavailable message until `PUBLIC_NEWSLETTER_ENDPOINT`
is configured. Follow
[the auth service's setup](../auth-app/NEWSLETTER.md), including its operator
qualification and key rotation. The endpoint must be HTTPS and end
in exactly `/v1/newsletter/subscribe`, without credentials, a query, or fragment.
The existing backend subscribes immediately; there is no confirmation step.
The form shows success only for HTTP 202 with `{ "accepted": true }`. Pending
requests disable both controls; failures retain the email for a retry. A brief
postal stamp appears after acceptance, with reduced motion respected. Without
JavaScript, the form stays disabled and explains that JavaScript is required.
The browser sends only an email, without credentials or provider keys. Remove
the obsolete `PUBLIC_PLUNK_API_KEY` from build/host settings.

```sh
PUBLIC_NEWSLETTER_ENDPOINT=https://auth.example.com/v1/newsletter/subscribe bun run build
```

## Feature demonstration videos

Feature cards play recordings of the native Lomi window over the
original Tahoe wallpaper. The recording contains the application's actual
macOS titlebar. There is no additional window chrome drawn by the website.
Each clip has its own duration (8.4–11.4 seconds). Terminals, workspaces, and
browser previews keep a stationary camera; code, Git, and Chat use one gentle
zoom around the action and return to the full window before looping. Timing
and camera cues live in `media/feature-demos/cues.json`. The app window has no
added border, and preparation trims the thin captured macOS frame outline.

Keep capture inputs in the ignored `artifacts/feature-demos/raw/` folder. After
recording, prepare the native-window MP4s and first-frame WebP posters used by
Astro, then optionally render the full wallpaper compositions and GIF exports:

```sh
node scripts/prepare-feature-videos.mjs
node scripts/render-feature-demos.mjs --quality delivery
```

See [the composition documentation](media/feature-demos/README.md) for capture
input names and cue coordinates. Playback loads only visible previews and pauses
outside the viewport or behind the modal. There are no play/pause buttons in
the gallery. Reduced-motion preferences disable automatic playback and camera
movement. Without JavaScript, the native first-frame poster remains visible.

## Validation

```sh
bun run test:content
bun run test:devlog
bun run verify:devlog
bun run verify:placeholders
bun run verify:feature-previews
bun run verify:cms-content
bun run check
bun run build
bun run preview --port 4322
# In a second terminal:
PLAYWRIGHT_CHANNEL=chrome bun run verify
```

Browser verification covers seven viewport widths, short landscape, section
anchors, unique IDs, keyboard navigation, Product dropdown and mobile drill-in,
Devlog navigation with and without JavaScript, absence of retired sections,
all seven installer mappings, release failures, download navigation, no-JavaScript
fallbacks, the inline video lifecycle, reduced motion, and desktop/mobile/dialog
accessibility with axe. Hero checks cover the absence of CLI cards and React
islands, single-preview layout, live reduced motion,
actual background pixel changes and frozen states, canvas resizing, and static
fallback without JavaScript or Canvas 2D.
Footer dimensions, resizing, and keyboard access to every
link are checked at eight window sizes from 320 × 200 to 1920 × 1080, both with
and without JavaScript. The 640px check covers the available CSS width of a
1280px window at 200% zoom. Screenshots and
audit output are written to ignored `artifacts/`.

Run `bun run verify:newsletter` against the default preview to check the
unavailable state and a temporary configured development fixture. Signup
responses are mocked; no email is sent and backend settings stay unchanged.

The CMS has separate TypeScript and isolated SQLite integration tests:

```sh
bun run --cwd cms check
bun run --cwd cms test
```

## Before launch

Review all copy, release readiness, and the screenshot.
Add any approved legal/privacy content appropriate to the final site. Configure
the real public origin, CMS storage/secret, and newsletter backend; connect a
deployment rebuild hook if desired. Then deploy the Astro `dist/` output when
ready.

The site uses local Geist and JetBrains Mono fonts, a white opening composition,
and Lomi's Lime accent. The page ships no hydrated React islands; the JSX
components render static HTML and native elements provide interaction. YouTube is embedded only after
external-media permission, including a remembered valid preference. There are no site trackers, runtime Iconify
calls, or external font requests. Asset provenance is
recorded in [docs/assets.md](docs/assets.md).
