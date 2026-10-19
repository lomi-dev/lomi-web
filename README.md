# lomi web

Launch landing page outline for the Lomi desktop workspace. Work lives on
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

- Responsive navigation and an asymmetric hero with a cropped cloud window.
- A keyboard-accessible Build / Preview / Review selector with real app captures.
- A workflow sequence, dark tools manifest, and local/source/customization details.
- A roadmap ledger separating available features from proposed work.
- Native expandable FAQ, preview downloads, newsletter, and a full footer.

The roadmap is explicitly a draft, with no invented release dates. Product copy
comes from the desktop application's README. Feature/platform restrictions are
described in the FAQ. The screenshots are existing desktop README captures;
review them against the launch release before publishing.

The [design analysis](docs/design-analysis.md) documents all six reference sites,
the four articles about generic AI content, and the decisions behind this layout.

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
- `content/landing-schema.ts`: shared build-time content contract and safe links.
- `content/load-landing.ts`: optional published-content fetch during rendering.
- `cms/src/globals/Landing.ts`: matching editor fields and access rules.
- `src/pages/index.astro`: section order and composition.
- `src/styles/global.css`: responsive layout and brand tokens.
- `src/components/`: navigation, footer, features, original clouds, forms, icons.
- `src/components/WorkspaceDeck.astro`: real product screenshots and local view selection.
- `src/data/site.ts`: fixed product/repository destinations.
- `src/layouts/Layout.astro`: metadata and local fonts.

Navigation, headings, descriptions, features, roadmap entries, FAQ, download CTA,
newsletter introduction, footer links, and SEO copy can be edited in the CMS.
The screenshots and cloud image remain versioned local assets in this outline.
Form states, dialog instructions, and other functional labels live in components.

## Download and newsletter behavior

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
anchors, unique IDs, keyboard navigation, mobile menu, FAQ, newsletter states,
all seven installer mappings, release failures, dialog focus, no-JavaScript
fallbacks, workspace selection, reduced motion, and desktop/mobile/dialog
accessibility with axe. The 640px check covers the available CSS width of a
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

The site uses local Geist and JetBrains Mono fonts, the original cloud image,
and the Lomi v1.3 Chalk/Ink/Lime palette. It sends no React runtime, trackers,
third-party embeds, or external font requests. Cloud and screenshot provenance
is recorded in [docs/assets.md](docs/assets.md).
