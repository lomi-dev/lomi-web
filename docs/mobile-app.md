# Mobile App page

The `/mobile-app/` page describes Lomi Mobile as an in-development companion
for Lomi Remote, with iOS and Android as target platforms. It does not link to
store listings or imply that public distribution is available.

The preview uses three overlapping phone mockups inspired by the supplied
[SolaceUI reference](https://21st.dev/@solaceui/components/phone-mockups-1).
The frames are native Astro/CSS, with no embedded third-party demo, carousel
dependency or automatic motion. Hover movement runs only for a fine pointer
when reduced motion is off. Camera cutouts sit in their own inset above the UI.

The light and dark previews are copied unchanged from the mobile-app
repository's `artifacts/ui-refresh-20261024/home-light.png` and `home-dark.png`.
They are browser captures of the real `WorkspaceHome` component using fictional
workspace and task data, not device or simulator screenshots. The central
preview has descriptive alt text; repeated side devices are decorative. The
caption identifies the development preview.

The page copy is static in `src/data/mobile-app.ts`, following the site's
existing guide-page pattern. It is intentionally independent of CMS page
defaults and schemas.
Gray Google Play and App Store badges are native disabled buttons with visible
Coming soon labels. They have no download URLs or click handlers.

The launch newsletter is on this page at `#mobile-newsletter`. It reuses
`NewsletterSignup.astro` and the existing `PUBLIC_NEWSLETTER_ENDPOINT` contract;
only the mobile page's submit and success wording is specialized. It submits
the email to the existing newsletter list, not a separate store waitlist. Launch
announcements can be sent to that list through the existing newsletter service.
This page does not introduce a release-triggered mail automation.

The opening contains the title, description and disabled store badges. The
standalone development badge and introductory action links have been removed.
The inline signup follows the CMS layout and is omitted when the newsletter
section is disabled. Without an endpoint or JavaScript, the form stays disabled
with an explicit message.

Product navigation starts with Features, followed by Remote and Mobile App in
both desktop and mobile menus. `activeProductGroups` also updates legacy CMS
workspace groups, removing Overview and adding the mobile route without
overwriting intentionally empty menus or unrelated custom groups.

Run `bun run test:content` for link-policy and CMS navigation cases. After
`bun run build`, use `VERIFY_URL=http://127.0.0.1:4322 bun run verify:mobile-app`
against the preview server; set `VERIFY_BROWSER=webkit` for WebKit.
The newsletter verifier also checks this page with a configured fake endpoint,
including pending, accepted, rate-limited and failed requests. It intercepts
every request so tests never create a real subscription.
