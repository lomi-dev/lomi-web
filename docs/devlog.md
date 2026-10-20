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

## Validation

```sh
bun run test:devlog
bun run verify:devlog
bun run --cwd cms test
```

The isolated browser verifier builds empty and populated CMS fixtures without
changing the real database or `dist/`, checks normal and keyboard links with
and without JavaScript, and checks responsive layouts and accessibility. Its
episodes are test data only. CMS tests verify drafts, publication, access,
validation, uploads and migration preservation in temporary databases.
