# Retired roadmap

The homepage no longer renders a roadmap. Its preview collection, assets,
controls and navigation links have been removed. Old `?roadmap=` queries do
not select or restore a section.

Existing CMS roadmap fields, task statuses, layout enum values and stored data
are retained for compatibility with published documents and version history.
The roadmap editor group is hidden, and its layout option is omitted from new
rows while remaining readable on existing rows. Even
an older document with an enabled roadmap row renders only active sections;
shared navigation filters both `#roadmap` and `/#roadmap` links.

Run `bun run test:content` for legacy-document and navigation checks, and
`bun run verify:newsletter-section` against the preview for public-page checks.
