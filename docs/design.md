# Design system

Aether Lab looks like a holographic research lab. You're looking through glass panels into a dark room, and prism light moves behind them. This page records the decisions behind that look, so changes keep it consistent and fast.

All styling lives in `css/style.css` (plus `css/fonts.css`), and all motion code in `js/ui/fx.js`. The app logic never depends on either.

## Tokens

Defined on `:root` in `css/style.css`.

| Token | Value | Use |
| --- | --- | --- |
| `--ink`, `--ink-2` | `#06050f`, `#0c0a20` | Page background (painted on `html`, see below) |
| `--glass`, `--glass-solid` | translucent / `#120f2c` | Card fill; the solid one is the no-blur fallback |
| `--edge`, `--edge-hi` | white at 10% / 22% | Hairlines, hover edges |
| `--text`, `--dim`, `--faint` | `#f3f1ff`, `#aeaad6`, `#716d9f` | Body, secondary, tertiary text |
| `--c1` … `--c6` | cyan `#3cf2ff`, azure `#2aa8ff`, indigo `#6f6bff`, violet `#9a4dff`, magenta `#d35bff`, orchid `#f08cff` | The spectrum, sampled from the logo: every gradient, glow and highlight is drawn from these six |
| `--chrome` | white → ice blue → lilac | The silver of the logo's AETHER wordmark |
| `--spectrum`, `--spectrum-conic` | gradients built from `--c1…--c6` | Boot bar and rings, the LAB rule lines |
| `--chrome-edge` | white at the top left → violet at the bottom right | The machined hairline around input panels, as if lit by the crystal |
| `--t-xs` … `--t-xl` | 13 / 14 / 16 / 18 / 20 px | Type scale for everything below the page headline |
| `--ok`, `--bad`, `--warn` | mint, rose, peach | Check results, always paired with an icon or word, never colour alone. They're deliberately outside the brand spectrum so a status never looks like decoration |
| `--display`, `--ui`, `--mono` | Unbounded, Space Grotesk, JetBrains Mono | Headings/wordmark, interface, data (hashes, offsets, IDs) |
| `--r-lg`, `--r-md`, `--r-sm` | 24 / 14 / 10 px | Card, control, chip radii |
| `--gap` | `clamp(14px, 2.4vw, 24px)` | Fluid spacing |
| `--ease` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Every transition |

The fonts are self-hosted WOFF2 files (Latin subset) under the SIL Open Font License. Their licences are in `licenses/`. Don't swap them for a font CDN, because the content security policy blocks other hosts by design.

## Brand assets

The logo is the source of the palette and the shapes. All files are in `images/`:

| File | Size | Used for |
| --- | --- | --- |
| `logo.webp` | 512 px | Boot screen, README. Cut out of its black square onto transparency, with the badge centred and made perfectly round, so it sits concentric with the boot rings on any background. The boot screen adds the outer glow with `drop-shadow` |
| `mark.webp` | 192 px | Header mark: the crystal and ring without the wordmark |
| `favicon-16.png`, `favicon-32.png` | 16 / 32 px | Browser tab, tightly cropped on the crystal so it reads at tiny sizes |
| `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` | 180 / 192 / 512 px | Home-screen icons (`manifest.webmanifest`) |

`docs/social-preview.jpg` (1280 × 640) is the repository's social card. Upload it under the repo's **Settings → General → Social preview**.

The header wordmark is live text, not an image: **AETHER** in `--chrome` over a spaced **LAB** between two rule lines, the same lockup as the logo. The background crystal (`fx.js`) and the forwarder icons' crystal (`icon.js`) are drawn in code to the same design: an elongated square bipyramid, cyan facets on the left and violet on the right, a tilted orbit ring passing in front of its lower half, and four-point flares.

## Layers

From back to front:

| Layer | Element | z-index | Notes |
| --- | --- | --- | --- |
| Background | `html` background | — | On `html`, not `body`, so the negative-z canvases show through a transparent body |
| Aurora | `canvas#aurora` | −3 | Six soft ribbons drawn on a tiny canvas and scaled up; blurred with `ctx.filter`, or a CSS blur where unsupported |
| Field | `canvas#field` | −2 | The logo's crystal (cyan left, violet right) turning inside its orbit ring, plus drifting motes; follows the pointer slightly |
| Glow | `#glow` | −1 | Soft spotlight that follows the pointer (fine pointers only) |
| Content | stations, cards | auto | Frosted glass via `backdrop-filter` |
| Sparks | `canvas#sparks` | 90 | Overlay for success bursts, so shards fly over cards |
| Boot | `#boot` | 100 | One-time start-up sequence |

## Signature effects

- **Chrome headline.** The station headline is the one loud voice: Unbounded 600 filled with `--chrome`, the same silver as the logo's wordmark, never a single coloured word.
- **Three surface levels.** Input panels (`.card`) are glass with `backdrop-filter: blur(22px)` and a machined edge drawn by `.card::before` as a masked ring (`mask-composite: exclude`, `-webkit-mask-composite: xor`). Settings (`.card--quiet`) sit back: no blur, a faint edge. Results (`.result`) are lit: a status-coloured edge, a soft glow and a status icon. Don't make every box the same.
- **Chrome button.** The primary action is polished chrome (`.btn--primary`) lit from above, with the crystal's light beneath it and a single pass of light on hover.
- **Tilt and highlight.** Drop zones and the icon tile lean toward the pointer through `--tx`/`--ty`; the icon's foil follows `--fx`/`--fy`; each card's highlight follows `--mx`/`--my`. `fx.js` writes these once per `requestAnimationFrame`, and only for fine pointers (mouse, trackpad).
- **Scan.** `VF.fx.scan(card, true)` sweeps a laser line across a card while a job runs.
- **Burst.** `VF.fx.burst(el)` throws prism shards from a button when a job succeeds.
- **Boot.** A short log-style start-up sequence that plays once per browser session (`sessionStorage`) and can be skipped with a click.

### The backdrop-root trap

`backdrop-filter` only blurs what's behind the nearest *Backdrop Root*. Any ancestor with `filter`, `opacity < 1`, `mask` or `mix-blend-mode` becomes one. That includes an entrance animation that ends on `filter: blur(0)` and holds it with `animation-fill-mode: both`. When that happens the glass turns clear and the crystal shows through sharply.

Entrance animations here therefore use `backwards` fill (`.panel-set > *`, `.readout`), so nothing is left applied once they finish. If the glass ever looks clear, check for a lingering filter on an ancestor first.

## Performance budget

The effects take about 1–2 ms of script per frame on a mid-range laptop. They stay there because of these rules:

- The device pixel ratio for the canvases is capped at 1.25, and the aurora draws at a fraction of screen size.
- Sprites (motes, shards) are pre-rendered once, then stamped with `drawImage`.
- All rendering stops on `visibilitychange` when the tab is hidden.
- Pointer events only record a position, and the actual style writes happen once per frame.
- At ≤ 560 px wide, cards drop `backdrop-filter` for an opaque gradient fill. Mobile GPUs pay the most for blur, and on small screens it's barely visible.

## Motion and accessibility

- `prefers-reduced-motion: reduce` turns off the boot sequence, the pointer glow, bursts, and every CSS animation and transition. The canvases draw a single still frame instead of animating.
- Every control is a real `<button>`, `<input>` or `<label>`, and focus rings stay visible (`:focus-visible`).
- Tabs use `role="tablist"`/`tab`/`tabpanel` with `aria-selected`.
- Check results always show an icon (✓, ✕, !) and a written label, never colour alone.
- Text contrast on glass stays at WCAG AA or better for body copy. `--faint` is only used for non-essential captions.

## Responsive rules

The layout is mobile-first, with breakpoints at 520, 640 and 880 px. Two-column grids (`.grid--2`, `.opts`, `.row2`, `.iconbay`) only split at those widths. Test every change at about 360 px (small phone), 768 px (tablet) and 1440 px (desktop), in portrait and landscape.

## Restraint

What keeps it premium is mostly what isn't there:

- **One moving object.** The crystal is the only thing that animates on its own (plus the one-time boot). Everything else moves only in answer to the user: a tab opening, a file dragged over, a job running (scan), a job finishing (burst).
- **Plain labels.** Sentence case in Space Grotesk. No tracked all-caps eyebrows, no jargon pills. Every panel says what goes in it, with a one-line hint underneath.
- **Numbers mean order.** Only the forwarder's steps are numbered, because their order matters. The tabs aren't.
- **Mono is for data.** JetBrains Mono only for hashes, offsets, paths, extensions and title IDs.
- **No middle-dot strings.** Lists of things are written as sentences or laid out as lists.

## Naming

| UI word | Meaning |
| --- | --- |
| Station | One of the tabs (Patch, Create, Forwarder, Analyze, Codex) |
| Variant | A shape of the same ROM that auto-fix may try (headered, byte-swapped…) |

## Changing the look

- Keep the six-colour spectrum. New accents should be mixes of existing tokens, not new hues.
- New effects belong in `fx.js` behind `VF.fx`, and must be optional: the controllers fall back to no-ops.
- No inline `style="…"` attributes or `<style>` blocks, because the CSP forbids them. Setting `element.style.x` from JS is fine.
- Check that reduced motion and the ≤ 560 px layout still hold up.
