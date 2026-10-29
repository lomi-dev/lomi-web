# Devlog publishing

`/devlog/` is a light video archive using the homepage's background, typeface,
spacing and thumbnail corners. A short introduction stays beside the archive
on desktop and moves above it on mobile. The latest episode has a wide
thumbnail with its caption below; earlier episodes use a two-column grid.
Cards open the corresponding video on YouTube. This page has no embedded
player, modal or YouTube API dependency.

The initial archive is empty. It displays the shared neutral media placeholder
with a decorative Lomi wordmark and a short message. The introduction links back to
Lomi. No example videos are seeded or presented as real episodes.

## Homepage updates

The homepage includes a horizontal “Lomi news & updates” section before the
newsletter. It uses the same published Devlogs feed as this archive, ordered
newest first and limited to six cards. Dates are formatted in the website's
language with a UTC timezone. Cards use uploaded thumbnails or the shared
local media fallback and open the canonical YouTube destination. “All devlogs”
links to the full archive. No YouTube player or thumbnail requests are added.

When the feed is empty, four passive “Coming soon” cards show sample topics
and local artwork. They are not dated, clickable articles or seeded CMS
records. Publishing the first episode replaces this whole empty-state set
with real cards at the next build. There is no separate homepage content list
to maintain. The existing Devlog publication and rebuild flow applies.

The rail supports touch, trackpad and keyboard scrolling without JavaScript.
JavaScript adds previous/next buttons only when the cards overflow, with
disabled states at each end. Reduced motion uses immediate scrolling. There
is no automatic movement. Section headings and empty-state topics live in
`HomeUpdates.astro`; the watch label reuses the Devlog page's CMS setting.
The section stays available when Newsletter is disabled, after the remaining
homepage sections.

## Add an episode

1. Open the Payload admin and choose **Devlogs → Create new**.
2. Enter a title, HTTPS YouTube URL and display date. Watch, share, shorts and
   embed links are accepted; the website produces a standard watch link.
3. Optionally add a description, duration (`8:42` or `1:08:42`), thumbnail and
   thumbnail alternative text. Choose an image from the Media library. A local
   placeholder appears when no image is selected; YouTube thumbnails are never
   fetched automatically.
4. Save incomplete work as a draft. Publish when ready. Only published
   episodes enter the public build; a subsequent private draft does not replace
   the published revision.
5. Rebuild with `CMS_URL` set and redeploy the generated `dist/` directory.

The display date determines archive order, not a scheduled release time.
Published episodes are available immediately to the public API. The website
loads collection pages at build time, newest first, including uploaded media
at depth 1. A failed request or invalid published record fails the build.

All page headings, descriptions, SEO, section labels, watch labels, footer
links and empty-state copy live under **Website → Page content → Devlog page**.
The old eyebrow, status and decorative slate fields are hidden in the editor;
their stored values remain intact but are no longer rendered.
Existing authored page text is kept during upgrades, including the previous
Work in progress heading if it was saved in the CMS. Replace that text in the
editor when switching to the archive. Shared branding and navigation use the
existing Website settings.

Without `CMS_URL`, local development intentionally shows the empty state.
To upgrade an existing CMS, back up its database and media and apply the new
`20261020_150000_devlogs` migration before building against its API.
