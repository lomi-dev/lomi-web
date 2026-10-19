# lomi web

Launch landing page for Lomi, a terminal ADE for coding agents. Work lives on
`feat/launch-landing`; this task does not deploy the site or change `main`.
English copy follows the existing website and is a starting point for editing.

## Preview the outline

```sh
bun install --frozen-lockfile
bun run dev
```

Open <http://localhost:4321>. Without `CMS_URL`, the site uses
[`content/landing.json`](content/landing.json). A running database or CMS is not
required to work on the layout.

The page includes:

- A white hero with centered copy, pill actions, and overlapping real
  desktop captures over an interactive field of terminal characters.
- A floating glass navigation bar: Product opens a three-column dropdown,
  followed by Roadmap, Devlog, and Docs. Mobile Product uses a Back drill-in.
- A separate `/devlog/` page with a Work in progress placeholder.
- A real desktop capture starting in the hero, with a centered video control
  and an animated native YouTube dialog.
- A workflow sequence, dark tools manifest, and local/source/customization details.
- A three-column timeline separating available features from proposed work.
- Native expandable FAQ, preview downloads, newsletter, and a Lime footer that
  fills exactly one viewport in both dimensions.

The footer follows the current viewport height with `100dvh` (`100vh` fallback).
Its content scrolls inside the footer when a narrow or short window cannot fit
everything; the outer footer keeps its exact size and every link stays reachable.

The roadmap is explicitly a draft, with no invented release dates. Product copy
comes from the desktop application's README. Feature/platform restrictions are
described in the FAQ. The screenshots are existing desktop README captures;
review them against the launch release before publishing.

The [design analysis](docs/design-analysis.md) documents all six reference sites,
Appllama, Coda, the four articles about generic AI content, and the decisions
behind this layout.

## Hero background and motion

The hero uses static HTML for its centered content and layered screenshots,
without React hydration or CLI icon cards. The primary workbench capture and
source-control detail share a responsive grid; the smaller detail overlaps on
the right while leaving the video control and caption clear. The archived
React Bits TiltedCard source and agent marks remain available locally.

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
**Launch landing page**. The first seed publishes the checked-in outline; later
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
server-side build setting, never a browser-side API dependency. HTTP is allowed
only for localhost; a hosted CMS requires HTTPS.

Publishing in Payload requires rebuilding and redeploying Astro to update the
live page. Configured CMS failures, incomplete content, or drafts fail the build
instead of silently deploying stale copy. There is no automatic publish hook or
authenticated draft preview in this first outline.

Local SQLite hosting requires one CMS instance and a persistent writable disk.
The static site's host cannot execute Payload. See the CMS README for migrations,
backups, environment configuration, and production build commands. No CMS host or
deployment provider is configured by this task.

## Where to edit

- `content/landing.json`: initial copy for every main page section.
- `content/landing-schema.ts`: shared build-time content contract.
- `content/links.ts`: link policy shared by Astro and Payload.
- `content/load-landing.ts`: optional published-content fetch during rendering.
- `cms/src/globals/Landing.ts`: matching editor fields and access rules.
- `src/pages/index.astro`: section order and composition.
- `src/pages/devlog.astro`: the standalone Devlog placeholder.
- `src/components/Header.astro`: Product groups, responsive disclosure, and routing.
- `src/styles/global.css`: responsive layout and brand tokens.
- `src/components/`: navigation, footer, features, original clouds, forms, icons.
- `src/components/WorkspaceDeck.astro`: the hero's real product screenshot and video trigger.
- `src/components/VideoDialog.astro`: the YouTube dialog and playback lifecycle.
- `src/data/site.ts`: fixed product/repository destinations.
- `src/layouts/Layout.astro`: metadata and local fonts.

Navigation, headings, descriptions, features, roadmap entries, FAQ, download CTA,
newsletter introduction, footer links, and SEO copy can be edited in the CMS.
The screenshots and cloud image remain versioned local assets in this outline.
Product groups, the Devlog placeholder, form states, dialog instructions, and
other functional labels live in components. Navigation links and the download
label remain editable in Payload. Links allow HTTPS, section anchors, and the
local `/devlog/` route. On Devlog, section links return to the homepage.

## Video, download, and newsletter behavior

The hero shows a large workbench capture below its copy, with an overlapping
source-control detail. On mobile the primary image uses a closer crop. Scrolling
reveals the complete composition. Hovering or focusing it shows a play control in
the center of the complete image, with no position changes on scroll. Touch
devices show the control immediately.
The native video dialog loads YouTube only after activation and removes the
player as soon as closing starts. Its center-scale entrance and exit follow
Magic UI's `from-center` example, with a dimmed, blurred backdrop. Reduced
motion uses a short fade. The surface contains only the video, with no close
button. Backdrop clicks and Escape from the dialog dismiss it and restore focus
to the screenshot. Shift+Tab from the player returns to the dialog.

The official YouTube IFrame API loads only after activation. It mutes the player
before starting playback automatically; YouTube's native controls provide volume
adjustment. The same workbench image used in the hero remains visible during
loading. The first `PLAYING` event, followed by two animation frames, reveals the
player. This is the closest documented playback signal; the cross-origin embed
does not expose a first-painted-frame event. If autoplay is blocked, the player
reports an error, or loading times out, the native controls become available for
manual playback or YouTube's error message. Closing destroys the player and
invalidates pending callbacks so reopening starts with a fresh muted session.
Without JavaScript, the screenshot links to
the same video on YouTube. Replace the placeholder video ID in both components
before launch. Use `http://localhost:4322` for local video playback: YouTube
rejects the numeric `127.0.0.1` referrer in the tested browser.

Both hero and final CTA open the same native download dialog. It reads public
GitHub releases only when opened, offers available installers for macOS,
Windows, and Linux, and falls back to the release page on API/package failures.
Release links also work with JavaScript disabled. No package availability or
version is hardcoded into the landing copy.

Newsletter signup remains unavailable unless `PUBLIC_NEWSLETTER_ENDPOINT` is
configured. Follow [the auth service's setup](../auth-app/NEWSLETTER.md), including
its operator qualification and key rotation. The endpoint must be HTTPS and end
in exactly `/v1/newsletter/subscribe`, without credentials, a query, or fragment.
The existing backend subscribes immediately; there is no confirmation step.
The browser sends only an email, without credentials or provider keys. Remove
the obsolete `PUBLIC_PLUNK_API_KEY` from build/host settings.

```sh
PUBLIC_NEWSLETTER_ENDPOINT=https://auth.example.com/v1/newsletter/subscribe bun run build
```

## Validation

```sh
bun run test:content
bun run check
bun run build
bun run preview --port 4322
# In a second terminal:
PLAYWRIGHT_CHANNEL=chrome bun run verify
```

Browser verification covers seven viewport widths, short landscape, section
anchors, unique IDs, keyboard navigation, Product dropdown and mobile drill-in,
Devlog navigation with and without JavaScript, FAQ, newsletter states,
all seven installer mappings, release failures, dialog focus, no-JavaScript
fallbacks, the video dialog lifecycle, reduced motion, and desktop/mobile/dialog
accessibility with axe. Hero checks cover the absence of CLI cards and React
islands, layered image placement, live reduced motion,
actual background pixel changes and frozen states, canvas resizing, and static
fallback without JavaScript or Canvas 2D. Download focus
is checked across desktop/mobile resizes while the dialog is open.
Footer dimensions, resizing, and keyboard access to every
link are checked at eight window sizes from 320 × 200 to 1920 × 1080, both with
and without JavaScript. The 640px check covers the available CSS width of a
1280px window at 200% zoom. Screenshots and
audit output are written to ignored `artifacts/`.

To exercise configured signup without sending email, build with
`PUBLIC_NEWSLETTER_ENDPOINT=https://auth.example.test/v1/newsletter/subscribe`.
Verification intercepts that endpoint and blocks direct Plunk requests. Also
verify a build with the variable unset to check the unavailable state.

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
the visitor activates the video. There are no site trackers, runtime Iconify
calls, or external font requests. Asset provenance is
recorded in [docs/assets.md](docs/assets.md).
