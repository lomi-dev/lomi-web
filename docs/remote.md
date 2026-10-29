# Remote launch page

The separate [Remote installation endpoints](remote-installation.md) document
the generated `/remote/install.sh` and `/remote/install.ps1` scripts and their
release inputs. Their availability does not alter the launch page below.

`/remote/` presents Lomi Remote as an upcoming product. It keeps the original
centered layout on a white canvas: opening, disabled platform badges, a wide
static terminal render and a compact launch newsletter below the preview. There
are no install commands, clipboard controls,
operating-system selectors or active Remote download links.

macOS, Windows and Linux are target platforms, not available release packages.
Their buttons are natively disabled and accompanied by Coming soon text.
The product is not publicly available. The page does not claim a working cloud
connection, production login, qualified sharing or a completed security rollout.

## CLI illustration

The default preview is a static 1920×1200 WebP with a light terminal interface
on the same original Tahoe wallpaper used by Features. The window occupies
80% of the 8:5 stage and sits at its 48% vertical center, matching the feature
composition. It has no titlebar, extra window border, caption or animation.
Astro serves responsive AVIF/WebP variants with descriptive sample-data alt text.

The rendered interface follows the current dashboard in
`../lomi-remote/crates/lomiremote/src/ui.rs` and the checked-in 80×24 test
snapshot. Its Workspaces and Local host panels use fictional workspace names.
Host/workspace identifiers, connection status and sharing detail rows are
omitted from the artwork. It does not depict a public release.

`media/remote/cli-light.html` is the editable HTML/CSS render source. Run
`bun run render:remote-preview` to capture it locally with Playwright and export
`src/assets/product/remote/cli-light.webp`. The renderer checks the wallpaper,
window dimensions, absent titlebar/caption and lack of animations. Its PNG
review artifact is saved in ignored `artifacts/remote-render/`. No host or
terminal command is executed. The website renders only the resulting image,
with no CLI interaction controller, video, GIF or autoplay.

An explicitly uploaded CMS image still overrides the default artwork, and
`showScreenshot` controls preview visibility. Hiding artwork leaves the copy
and newsletter available.

## Newsletter

`#remote-newsletter` reuses `NewsletterSignup.astro` and the existing
`PUBLIC_NEWSLETTER_ENDPOINT`. It sends only `{ email }`, with credentials
omitted, and accepts only HTTP 202 with `{ "accepted": true }` as success.
The page specializes its submit and accepted wording for Remote launch news.
Its optional newsletter note is omitted on this page, including the matching
input description reference. Other signup instances retain their default note.
Rate-limit, pending, unavailable, retry and no-JavaScript behavior remain shared.

The form follows the CMS homepage newsletter visibility setting. When that
section is disabled, the Remote form is omitted as well. Without an endpoint
or JavaScript, controls remain disabled and explain the reason.

Subscriptions join the existing newsletter list. Launch announcements can be
sent through that service; this page does not add a release-triggered mail
automation or a separate waitlist backend.

## CMS compatibility

`remoteLaunchContent` replaces only the exact old installation title,
description and SEO defaults in older published documents. Authored metadata,
media, empty description arrays and visibility choices remain intact.

The former installer fields remain in the CMS schema for existing database
documents. They are unused by the launch page and are never rendered or
executed. This change requires no CMS database migration. The old installer
controller and its client-side clipboard code have been removed.
