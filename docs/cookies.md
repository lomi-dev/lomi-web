# Website consent

The cookie interface follows the existing white, ink and lime website palette.
`Layout.astro` includes one nonmodal card at the lower-right on every route.
Customize smoothly expands that same card into preferences; it does not open a
second window, trap focus or lock page scrolling. A visible rejection action is
available alongside customization and acceptance. Preferences
remain available through the Cookie settings link in both footer variants.
`/cookies/` explains the actual browser storage and third-party requests; it is
a technical notice, not a substitute for a complete operator privacy policy.

## Audited purposes

- Essential preference storage: local browser storage solely remembers consent
  or refusal. It is not an HTTP cookie and is not sent to the server.
- Optional external media: YouTube embeds and the official player API. Both stay
  unloaded until explicit permission. A local, labelled Allow action explains
  the provider before granting permission to load its player.
- No separate analytics or advertising tools are installed. Local assets,
  GitHub release lookups and submit-only newsletter requests are not assigned
  invented tracking categories. Newsletter signup remains a separate action.

The embed uses `youtube-nocookie.com`; the API still uses `youtube.com`.
[YouTube's privacy-enhanced mode](https://support.google.com/youtube/answer/171780?hl=en)
limits some personalisation and does not mean zero requests or processing.
The [official player API](https://developers.google.com/youtube/iframe_api_reference)
is consent-gated too. Revocation destroys the active player, cancels pending
initialisation and prevents stale callbacks from restarting it. Previously
sent data and storage on another origin cannot be undone by this website.

## State and retention

`src/lib/consent.ts` owns the browser-only state and notifications. The
`lomi.cookie-consent` localStorage record is:

```json
{ "version": 1, "externalMedia": false, "savedAt": 1792440000000 }
```

Only the current schema, boolean choice and valid past timestamp are accepted.
Malformed, expired or unknown-version records default to no optional media.
Both acceptance and refusal expire after **180 days**, including in long-lived
tabs. This duration is a product policy informed by
[CNIL's contextual six-month guidance](https://cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies/FAQ),
not a universal EU or Polish statutory duration. Bump the version when the
purposes, services or notice materially change. The
[EDPB consent guidance](https://www.edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines_202005_consent_en.pdf)
does not prescribe a single universal consent lifetime.

Storage denial or quota failure leaves the explicit choice in memory for the
current tab and displays a visible notice. No network request logs a consent
identifier or email. Changes in another tab, removal or clearing storage there,
and expiry revoke media promptly. A visit with JavaScript disabled never loads
the embedded player and retains the original outbound YouTube link.

## Integration

- `CookieConsent.astro` / `cookie-consent.ts`: compact/expanded card, draft
  preferences, reversible height animation, keyboard/focus restoration and
  storage-error feedback. Reduced motion, interrupted animations and viewport
  resizing return to the natural content height.
- `CookieSettingsLink.astro`: shared settings entry; without JavaScript it links
  to the information page.
- `HeroVideo.astro` and the retained `VideoDialog.astro`: check permission before
  media starts and guard asynchronous API/player callbacks. Both use the same
  consent state, including revocation.
- `lomi:consent-settings`: expands the preferences card. The store's
  `requestConsentSettings(trigger)` helper also carries a focus-return target.
- `lomi:consent-storage-error`: informs the UI that a choice only applies to this
  visit. The video flow also shows this notice within its native modal.

The initial banner does not take focus or block reading. Closing preferences
without saving leaves the prior decision intact. Optional controls start off.
This design follows the practical accept/reject, informed choice and withdrawal
principles in the
[EDPB cookie-banner taskforce report](https://www.edpb.europa.eu/system/files/2023-01/edpb_20230118_report_cookie_banner_taskforce_en.pdf).
