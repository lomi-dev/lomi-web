# Remote page

The separate [Remote installation endpoints](remote-installation.md) document
the generated `/remote/install.sh` and `/remote/install.ps1` scripts and their
release inputs.

`/remote/` presents Lomi Remote as a CLI host installed with one command. The
hero centres the real installers from `lomi-remote` (`src/data/remote.ts`):

- macOS and Linux: `curl -fsSL https://lomi.dev/remote/install.sh | sh`, with a
  copy button (clipboard, falling back to selecting the command).
- Windows: the PowerShell `install.ps1` command is shown without a copy button
  and marked coming soon, because Windows packages are not published yet.

The commands are code, not CMS fields; the old installer fields stay in the
schema for existing documents but are not rendered (their URLs were outdated).
Below the hero, real captures of Lomi on the desktop and of Lomi Mobile show
one workspace on two screens. An uploaded CMS image replaces the desktop
capture, and `showScreenshot` hides that section.

## Newsletter

`#remote-newsletter` reuses `NewsletterSignup.astro` and the existing
`PUBLIC_NEWSLETTER_ENDPOINT`. It sends only `{ email }`, with credentials
omitted, and accepts only HTTP 202 with `{ "accepted": true }` as success.
The page specializes its submit and accepted wording for Remote release news.
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
