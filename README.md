# lomi web

Launch landing page for Lomi, a terminal ADE for coding agents. Work lives on
`feat/launch-landing`; this task does not deploy the site or change `main`.
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

- A white hero with centered copy, pill actions, and one wide
  product preview over an interactive field of terminal characters.
- A fixed navigation bar at the viewport's top edge: Product opens a three-column dropdown,
  followed by Roadmap, Newsletter, Devlog, and Docs. Mobile Product uses a Back drill-in.
- A `/devlog/` video archive with a featured latest episode, thumbnail cards
  linking to YouTube, and an empty state until the first real episode is published.
- A site-wide consent banner and Cookie settings, with optional YouTube media
  blocked until permission and a `/cookies/` information page. See
  [consent behavior and verification](docs/cookies.md).
- An inline video player aligned with the feature gallery, with custom
  controls and the app screenshot as its poster before external media loads.
- An asymmetric feature gallery with six animated GIFs captured from the
  genuine Lomi UI, static WebP posters, and a
  native media dialog, including feature navigation, keyboard support, and
  readable fallbacks.
- A dark horizontal roadmap with a lime axis, alternating milestones, and
  native scroll progress. Small windows and reduced motion use a vertical list.
- A current screenshot of the Lomi app in the hero, with project files, an
  editor and terminal panes. Feature cards/dialogs show matching animated
  captures from the app; Download has its own workspace overview, while
  Devlog and Remote use a centered Lomi wordmark. Uploaded CMS media replaces
  the hero screenshot.
- A newsletter invitation above the footer, with a paper signup card in a lime
  envelope and a direct Newsletter link in desktop and mobile navigation.
- A lime footer that fills exactly one viewport in both dimensions.
- A dedicated `/download/` page linked from the hero, navigation, and footer.
- A dedicated `/remote/` page, linked in Product, with a centered installation
  command, copy control and a combined macOS/Linux choice alongside Windows.
  The selector shares the command box; a product preview follows it.
  It follows the Download
  page's visual system; native system choices also work without JavaScript. See
  [Remote content boundaries and verification](docs/remote.md).

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
elastic overscroll in every direction: white for the hero, chalk for the main
canvas and Devlog, dark for the roadmap, and lime for the footer. Physical top
and bottom boundaries take their first/last section color.
Updates run on input and section crossings; no idle animation is needed. The
body keeps its own chalk surface. Without JavaScript, the homepage canvas stays
lime and Devlog stays light. Native bounce and scroll chaining remain enabled
outside the homepage's custom top pull.
Firefox exposes one solid canvas color, so mixed sections share the midpoint
section's edge color. The native OS trackpad gesture still needs manual QA.
Run `bun run verify:backdrop` (or prefix `VERIFY_BROWSER=firefox`) for section,
edge pixel, navigation, viewport, and fallback regression checks.

At the homepage's top edge, upward wheel input or a one-finger downward drag
reveals additional rows of the same animated hero background. A fixed 144px
reserve avoids resizing or restarting the canvas; the pull has resistance,
stops at 72px and returns continuously as gesture input fades. A critically
damped spring keeps ordinary wheel gestures around 25px without a long hold
at the edge or a jump when changing direction. Ordinary page scrolling and the
footer keep their native behavior. Menus, dialogs, controls, nested scrolling,
zoom and reduced motion bypass the effect, as do CMS layouts whose hero is
disabled or placed after another section. Run `bun run verify:hero-pull`
(also with `VERIFY_BROWSER=firefox`) for input ownership, rendered background,
spring, layout, fallback and interruption checks. Trackpad feel and hardware
touch gestures still need manual verification.

Footer social profiles, labels and icons are configured in Payload under
**Website → Footer → Socials**.

The roadmap is explicitly a draft, with no invented release dates. Product copy
comes from the desktop application's README. The hero currently uses local
placeholder images; replace them with approved product captures before launch.
The retired workflow, principles, FAQ, and download section content
remains in Payload for future use but does not render on the landing page.
Navigation omits links to retired sections and sends old download anchors to
the dedicated download page. See [roadmap behavior and verification](docs/roadmap.md).

The [design analysis](docs/design-analysis.md) documents all six reference sites,
Appllama, Coda, the four articles about generic AI content, and the decisions
behind this layout.

See [feature gallery behavior and verification](docs/feature-gallery.md) for
placeholder media, Payload editing, responsive layout, and dialog controls.

## Hero background and motion

The hero uses static HTML for its centered content and a single local product
placeholder aligned with the feature gallery, without React hydration or
CLI icon cards.
The inline player occupies the same surface; there is no separate phone,
hover-following controls, or hero video dialog. The archived React Bits TiltedCard
source and agent marks remain available locally.

The background is an authored Canvas 2D interpretation of React Bits Shape Waves:
small `> _ $ / ~ | { } +` characters evolve in broad bands. Moving the mouse
leaves a green ripple that changes nearby characters, spreads, and fades. It
respects reduced-motion preferences and stops rendering offscreen or in a hidden tab.
A static SVG field appears without JavaScript or Canvas 2D. No WebGPU dependency is needed.
See [background implementation](docs/shape-waves.md) for its rendering limits.

The React Bits registry is configured in `components.json`. Project-local Codex
MCP settings live in `.codex/config.toml`; open this repository as the project and
reload the client to discover the shadcn server. Registry lookup and an MCP
initialization handshake were verified. See [integration and licenses](docs/react-bits.md).

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
live page. Configured CMS failures, incomplete content, or drafts fail the build
instead of silently deploying stale copy. There is no automatic publish hook or
authenticated draft preview.

Local SQLite hosting requires one CMS instance, a persistent writable database
and a persistent media directory configured with `MEDIA_UPLOAD_DIR`.
The static site's host cannot execute Payload. See the CMS README for migrations,
backups, environment configuration, and production build commands. No CMS host or
deployment provider is configured by this task.

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
- `src/components/Roadmap.astro`: CMS-driven timeline and responsive layout.
- `src/components/roadmap-timeline.ts`: native scroll progress and stage navigation.
- `src/pages/devlog.astro` and `src/components/DevlogCard.astro`: the Devlog archive.
- `content/load-devlogs.ts`: published, paginated Devlog collection fetch.
- `cms/src/collections/Devlogs.ts`: episode drafts, thumbnails and publication.
- `src/pages/download.astro`: the dedicated installer and package page.
- `src/components/Header.astro`: Product groups, responsive disclosure, and routing.
- `src/styles/global.css`: responsive layout and brand tokens.
- `src/components/`: navigation, footer, features, original clouds, forms, icons.
- `src/components/WorkspaceDeck.astro`: the hero's single product frame.
- `src/components/HeroVideo.astro`: inline YouTube controls and playback lifecycle.
- `src/data/site.ts`: fixed product/repository destinations.
- `src/layouts/Layout.astro`: metadata and local fonts.

Payload's **Website** editor covers navigation and Product groups, footer and
socials, branding and colors, SEO, homepage layout, media, features, roadmap,
newsletter and cookie messages, plus all four subpages. Images and videos can
be uploaded through the Media library. Built-in assets remain fallbacks.
See [the editing guide](docs/cms-editing.md) for field locations, templates,
media modes, publishing and the settings intentionally kept in code.
See [Devlog publishing](docs/devlog.md) to add the first episode.

## Video and download behavior

The hero uses one inline video surface aligned with the feature gallery.
An integrated control strip provides play/pause/replay, elapsed time, seeking,
mute/volume and fullscreen for both YouTube and uploaded MP4/WebM. Controls float
inside the lower part of the video over a subtle gradient, and fade away after
two seconds of inactivity. Pointer movement brings them back; keyboard focus
and active slider adjustments keep them visible. The local
poster remains until the first playback frame, with a loading spinner while
the player starts. All player labels are editable in Payload.

YouTube loads automatically when a valid external-media preference is already
saved. Otherwise clicking the poster opens the existing Cookie settings;
no YouTube request is made before permission. Revoking permission destroys the player, restores the
local poster and invalidates pending callbacks. If the API cannot load, the
poster links to YouTube. Without JavaScript the image also links directly
to YouTube. Uploaded files retain native controls without JavaScript. Playback
errors expose a retry action while the poster link remains usable.

The official IFrame API mutes the player before any automatic playback. It
starts once more than half the preview is visible, pauses when it leaves view
or the tab is hidden, and leaves subsequent playback to the visitor. Reduced
motion disables automatic playback and spinner motion. Replace the temporary
video URL in **Website → Homepage → Hero** before launch. Use `http://localhost:4322` for
local playback if YouTube rejects a numeric loopback referrer.

See [custom player behavior and verification](docs/hero-player.md).

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

Review all copy, roadmap priorities, release readiness, and the screenshot.
Add any approved legal/privacy content appropriate to the final site. Configure
the real public origin, CMS storage/secret, and newsletter backend; connect a
deployment rebuild hook if desired. Then deploy the Astro `dist/` output when
ready. Nothing is published automatically from this branch.

The site uses local Geist and JetBrains Mono fonts, a white opening composition,
and Lomi's Lime accent. The page ships no hydrated React islands; the JSX
components render static HTML and native elements provide interaction. YouTube is embedded only after
external-media permission, including a remembered valid preference. There are no site trackers, runtime Iconify
calls, or external font requests. Asset provenance is
recorded in [docs/assets.md](docs/assets.md).
