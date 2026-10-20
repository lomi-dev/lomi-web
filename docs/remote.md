# Remote installation page

`/remote/` follows the light `/download/` layout: the same Geist type scale,
opening spacing and shell, with a centered command bar and copy button. A native
two-option selector (`macOS / Linux` and `Windows`) sits in the upper-right of
the same bordered box, before the command in reading and keyboard order. The
header pairs `Install Lomi Remote CLI` with compact, underlined system choices;
it wraps the choices onto a second row on narrow screens. An
authentic lomi desktop capture follows the installer, using the same pale stage
as Download. The shared Product menu labels this destination `Remote`; the default
footer also links to it. Homepage destinations resolve to `/#…`.

## Commands and availability

The project owner supplied these exact commands on 2026-10-20:

```sh
curl -fsSL https://lomi.dev/download/remote | bash
```

```powershell
Invoke-RestMethod "https://lomi.dev/download/remote.ps1" | Invoke-Expression
```

`src/data/remote.ts` holds the command text. macOS and Linux share the Unix
command; Windows uses PowerShell. The website displays and copies the command
without the decorative `$`/`PS` prompt. It does not fetch or execute the script.
The scripts are published separately from the static website. Both URLs returned
HTTP 404 during a read-only header check on 2026-10-20; the owner was told.
No installer script, Remote release, architecture guarantee or public source
repository is fabricated by this task.

The host's development status is grounded in
`../lomi-remote/crates/lomiremote/README.md` and
`../lomi-remote/docs/implementation/progress.md`. This page does not advertise
completed remote transport, client integration, File/Git services, production
E2EE or reboot recovery.

## Interaction

Native radio inputs switch between the shared macOS/Linux command and Windows
PowerShell command with CSS `:has()`. JavaScript adds a
synchronous platform hint, preserving browser-restored manual choices. Keyboard
arrow keys work natively. The code stays on one line and scrolls horizontally
inside a keyboard-accessible region; the separate 44px copy button stays visible
on narrow screens. Command text remains selectable without JavaScript, and the
unavailable copy button is disabled with manual-copy instructions.

Copy success is announced only after the Clipboard API resolves. Failure selects
the exact command for manual copying and announces what happened. A pending copy
cannot put a success/error message onto a different selected system. Changing
systems clears feedback and resets horizontal scrolling. Decorative prompts,
icons and shell prefixes never enter the clipboard text. No new React island or
animation dependency is introduced.
Pending copies use an ARIA disabled state and a shared request guard, preserving
keyboard focus in Firefox while preventing overlapping clipboard writes.

The existing page backdrop matches the white page and lime footer. The homepage
also realigns an incoming section hash once after initial scripts and font
measurements settle, so cross-page newsletter links land correctly in Firefox.
User input cancels that adjustment; history traversals retain native restoration.

## Verification

After building, run against the static preview on port 4322:

```sh
bun run build
bun run verify:remote
VERIFY_BROWSER=firefox bun run verify:remote
bun run verify
```

The Remote verifier checks route metadata, both exact commands,
automatic and manual system selection, keyboard navigation, clipboard success,
denial/unavailable fallbacks, stale responses, six viewport widths, horizontal
command reading, the selector's placement inside the command box, the responsive
image, no-JavaScript behavior, accessibility and reduced motion.
It verifies shared navigation and footer links and asserts that the browser never
requests either installer script. Screenshots and axe results go to `artifacts/`.
