# Roadmap timeline

The layout is inspired by [Hyperiux's Timeline on 21st.dev](https://21st.dev/@hyperiux/components/timeline):
a horizontal spine, alternating milestone stems, and a pinned scene that moves
with native vertical scrolling. Lomi uses its own Astro markup, CSS, and small
TypeScript controller. No GSAP, scroll interception, or React hydration is added.

The section keeps the authored phase order, milestone statuses, descriptions,
and task labels. Each task also supports an optional Payload status:
`completed`, `in-progress`, or `not-started`. Missing and null values preserve
the old content: tasks in an `available` milestone count as completed; tasks
in `next` or `later` milestones count as not started. No progress is invented.

Each milestone shows task rows and a native progress bar. Its percentage is
the rounded number of completed tasks divided by all tasks; work in progress
does not count as completed. A legend, different marker shapes, and accessible
task labels identify the three states. These are published development states,
not checkboxes for visitors to change. Task status changes are published through
Payload and appear after rebuilding the static site.

Apply the included Payload migration before deploying the changed CMS to an
existing production database; it adds nullable task statuses to published
content and its draft versions. See `cms/README.md` for the migration workflow.
The roadmap does not invent dates or turn proposals into release commitments.

At desktop sizes, the scene pins below the fixed navigation. A lime line draws
as the track moves and the next milestone's stem and copy appear. Buttons jump
to each stage using native smooth scrolling; the discussion link stays visible.

Small or short windows, reduced motion, unavailable IntersectionObserver, and
JavaScript-disabled browsers get a normal vertical timeline. Content is visible
in the server HTML. Long CMS copy that cannot fit above or below the spine also
uses the vertical layout. Resizing and live motion preferences recheck the fit;
keyboard focus moves to the matching visible milestone if its button disappears.

The controller schedules work on scroll, resize, visibility, and content changes.
It caches track geometry outside the scroll handler and has no idle render loop.

Validate against the built preview:

```sh
VERIFY_URL=http://localhost:4322 PLAYWRIGHT_CHANNEL=chrome node scripts/verify-roadmap.mjs
```
