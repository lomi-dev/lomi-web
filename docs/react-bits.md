# React Bits and agent marks

The CLI card scene is archived. The current hero uses real product captures
and the authored Shape Waves background; it does not import TiltedCard or
hydrate a React island. The source and licenses below remain versioned.

## Vendored TiltedCard

`src/components/react-bits/TiltedCard.tsx` and `TiltedCard.css` are unmodified
TypeScript/CSS sources fetched on October 19, 2026 from the official
[React Bits registry](https://reactbits.dev/r/TiltedCard-TS-CSS.json).
There are no additional package dependencies beyond the existing React setup.
The complete upstream [MIT + Commons Clause license](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md)
is preserved in `src/components/react-bits/LICENSE.txt`. It permits use in this
website, including commercial use, but restricts redistribution of components
as standalone products. Preserve that notice when updating the source.

The Astro React integration hydrates React islands. The source's `use client`
directive does not itself hydrate an Astro island; use an Astro client directive
on the importing React wrapper.

### TiltedCard API and behavior

The default export is `TiltedCard`. Named exports are `TiltedCardLayer`,
`TiltedCardProps`, and `TiltedCardLayerProps`. All card props are optional.

| Prop | Type / default | Behavior |
| --- | --- | --- |
| `imageSrc`, `altText` | strings; absent / `Tilted card image` | Optional image rendered within the front face. |
| `containerHeight`, `containerWidth` | number or string; `300px` / `100%` | Outer figure dimensions. Numbers become pixels. |
| `imageHeight`, `imageWidth` | number or string; `300px` / `300px` | Card body dimensions, including when rendering custom content without an image. |
| `children` | ReactNode | Custom front-face content, below the decorative glare layers. |
| `overlayContent`, `displayOverlayContent` | ReactNode / boolean `false` | Custom overlay content, rendered only when enabled. |
| `overlayDepth` | number; `30` | Overlay's translateZ depth in pixels. |
| `rotateAmplitude`, `scaleOnHover` | numbers; `12` / `1.05` | Maximum pointer tilt in degrees and hover scale. |
| `floating` | boolean; `false` | Automatic idle floating motion. A separate positioning wrapper can own CSS float motion. |
| `gyroscope` | boolean; `true` | Enables device-orientation behavior. Set false when only pointer depth is desired. |
| `intro`, `introDelay` | boolean `true` / number `0` | Entry motion and delay. Set intro false for immediate stable display. |
| `captionText`, `showTooltip` | string empty / boolean `true` | Optional pointer-following figcaption. Set showTooltip false when cards have permanent labels. |
| `radius`, `perspective` | number or string; `15` / `800` | Corner radius and perspective. |
| `smoothness`, `glare`, `shadow`, `parallax` | numbers; `0.6`, `0.5`, `0.5`, `1` | Motion smoothing and visual effects. |
| `axis`, `reverse`, `trackWindow` | `both`, `horizontal`, `vertical`; `both` / false / false | Tilt axis, direction, and window-wide tracking. |
| `className`, `style` | string / CSSProperties | Outer figure integration styling. |

Additional flip/interaction props are `backContent: ReactNode`, `flipOnClick`
(default true), controlled `flipped: boolean`, `onFlip: (flipped: boolean) => void`,
and `onClick: (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void`.
The component makes its figure keyboard focusable and gives it button semantics
only when flip behavior or onClick makes it interactive. Passive decorative
cards should not supply onClick or backContent.

`TiltedCardLayer` accepts `depth` (default 20), `className`, `style`, and `children`.
Its depth drives pointer parallax within the face.

For positioned agent cards use explicit matching container/body sizes,
`floating={false}`, `intro={false}`, `gyroscope={false}`,
`rotateAmplitude={10}`, `scaleOnHover={1.03}`, and `showTooltip={false}`.
Custom visible marks and labels can be passed in `overlayContent` with
`displayOverlayContent`; the overlay fills the card body. The consumer owns the
six active card positions and any CSS float animation, allowing room for central copy.

Server rendering produces the actual card content without requiring JavaScript.
Pointer depth begins after hydration. Intro uses an effect to initialize motion;
turning it off avoids the entry transition. Reduced motion and coarse pointer
preferences are sampled when the effect initializes. The engine cleans up its
listeners, observers, and animation frames. It requires modern matchMedia,
pointer events, requestAnimationFrame, CSS custom properties, and 3D transforms.
IntersectionObserver is required without an upstream fallback. CSS masks provide the decorative
edge highlight. Verify final card placement, pointer motion, and responsive
behavior in the consuming hero.

## Registry and MCP

`components.json` uses the existing Astro/Tailwind 4 stylesheet and the
`@react-bits` registry URL `https://reactbits.dev/r/{name}.json`.
For example, inspect a component without installing it:

```sh
npx -y shadcn@latest view @react-bits/TiltedCard-TS-CSS
```

`.codex/config.toml` configures the official shadcn MCP process through
`npx -y shadcn@latest mcp`, with this project's working directory and a 60-second
startup timeout. A new Codex client load is required to discover this project
configuration. This file does not add tools to an already-running client.
Neither configuration adds a runtime dependency to the website.

## Agent mark provenance

Six marks are active in the hero. Hermes is retained as an unused asset
with its original license, and is no longer rendered.

The seven base SVGs in `public/agents` were copied byte-for-byte from Lomi's
existing `src/cli-icons` assets. Their original download date is September 24,
2026; the source repository records byte verification on September 29, 2026.
The optional white Codex variant was fetched directly from Iconify on October
19, 2026. All marks are served locally, with no runtime Iconify request.

| Local filename | Iconify source | License |
| --- | --- | --- |
| `codex.svg` | [logos:codex](https://api.iconify.design/logos/codex.svg) | CC0 1.0 |
| `codex-dark.svg` | [logos:codex-dark](https://api.iconify.design/logos/codex-dark.svg) | CC0 1.0 |
| `claude-code.svg` | [logos:claude-code](https://api.iconify.design/logos/claude-code.svg) | CC0 1.0 |
| `opencode.svg` | [simple-icons:opencode](https://api.iconify.design/simple-icons/opencode.svg) | CC0 1.0 |
| `hermes.svg` | [thesvg:nousresearch-hermes](https://api.iconify.design/thesvg/nousresearch-hermes.svg) | MIT |
| `cursor.svg` | [logos:cursor-icon](https://api.iconify.design/logos/cursor-icon.svg) | CC0 1.0 |
| `grok.svg` | [logos:grok-icon](https://api.iconify.design/logos/grok-icon.svg) | CC0 1.0 |
| `antigravity.svg` | [logos:antigravity](https://api.iconify.design/logos/antigravity.svg) | CC0 1.0 |

The `logos` collection is [SVG Logos by Gil Barbara](https://github.com/gilbarbara/logos),
licensed [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), as recorded
by [Iconify collection metadata](https://api.iconify.design/collections?prefix=logos).
`simple-icons` is by [Simple Icons contributors](https://github.com/simple-icons/simple-icons),
also [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
Hermes is from [theSVG](https://github.com/glincker/thesvg), copyright (c) 2025
thesvg.org; its complete MIT notice is in `public/agents/LICENSE-thesvg-MIT.txt`.
Brand names and marks remain the property of their respective owners.

For a dark background, use a CSS mask with the original monochrome Codex,
OpenCode, Hermes, Cursor, and Grok files. Codex and Cursor have fixed dark fills,
Grok has an implicit black fill, and external images using `currentColor` do not
inherit the surrounding page color. The white `codex-dark.svg` is an alternative
for a regular image. Preserve the Claude Code and Antigravity brand colors when
rendering them as regular images.
