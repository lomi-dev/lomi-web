# Homepage newsletter

The homepage uses a compact centered invitation: headline and description
above the signup form. It shares the Features section's chalk canvas and
Geist typography, with the same lime background and dark text as Download
lomi. Narrow layouts stack the copy and controls. There is no decorative
email symbol, preview gallery or query-driven variant.

`NewsletterSection.astro` owns the composition. Copy and form feedback come
from the existing CMS fields. `NewsletterSignup.astro` and its per-instance
controller are shared with Remote and Mobile App. Submission retains native
email validation, a pending guard, strict accepted-response handling, errors,
retry and cancellation on disconnect. An accepted signup shows a check in the
submit button. Editing the address clears the accepted state.

The form has an explicit label and live feedback. Reduced motion disables
button transitions. Without JavaScript the section stays readable and the
form explains how to enable it.
An unconfigured endpoint retains the existing unavailable state.

Validation against a running preview:

- `bun run verify:newsletter-section`: responsive layout, section order,
  retired roadmap/preview controls, shared navigation, no-JavaScript reading,
  and accessibility. Set `VERIFY_BROWSER=webkit` for WebKit.
- `bun run verify:newsletter`: request contract, accepted/error/pending states,
  retries and the shared Remote/Mobile App forms. Requests use test fixtures.
- `bun run verify:backdrop`: section colors and page-edge behavior.
