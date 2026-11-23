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
| `--c1` … `--c6` | cyan, periwinkle, lavender, pink, peach, mint | The spectrum: every gradient, glow and highlight is drawn from these six |
| `--spectrum`, `--spectrum-conic` | gradients built from `--c1…--c6` | Foil buttons, card edges, wordmark |
| `--ok`, `--bad`, `--warn` | mint, rose, peach | Check results — always paired with an icon or word, never colour alone |
| `--display`, `--ui`, `--mono` | Unbounded, Space Grotesk, JetBrains Mono | Headings/wordmark, interface, data (hashes, offsets, IDs) |
| `--r-lg`, `--r-md`, `--r-sm` | 24 / 14 / 10 px | Card, control, chip radii |
| `--gap` | `clamp(14px, 2.4vw, 24px)` | Fluid spacing |
| `--ease` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Every transition |

The fonts are self-hosted WOFF2 files (Latin subset) under the SIL Open Font License. Their licences are in `licenses/`. Don't swap them for a font CDN, because the content security policy blocks other hosts by design.

## Layers

From back to front:

| Layer | Element | z-index | Notes |
| --- | --- | --- | --- |
| Background | `html` background | — | On `html`, not `body`, so the negative-z canvases show through a transparent body |
| Aurora | `canvas#aurora` | −3 | Six soft ribbons drawn on a tiny canvas and scaled up; blurred with `ctx.filter`, or a CSS blur where unsupported |
| Field | `canvas#field` | −2 | The rotating prism crystal and drifting motes; follows the pointer slightly |
| Glow | `#glow` | −1 | Soft spotlight that follows the pointer (fine pointers only) |
| Content | stations, cards | auto | Frosted glass via `backdrop-filter` |
| Sparks | `canvas#sparks` | 90 | Overlay for success bursts, so shards fly over cards |
| Boot | `#boot` | 100 | One-time start-up sequence |

## Signature effects

- **Glass cards.** These use `backdrop-filter: blur(22px) saturate(160%)` over the canvases. `.card::before` draws the spectrum edge as a masked ring (`mask-composite: exclude`, and `-webkit-mask-composite: xor` for WebKit). `.card::after` is the moving sheen.
- **Spinning edges.** `@property --angle` registers an animatable angle, which `--spectrum-conic` uses, so a border can rotate without JavaScript.
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

## Naming

The theme vocabulary is used consistently across the interface:

| UI word | Meaning |
| --- | --- |
| Specimen α | The ROM you load |
| Reagent β | The patch file |
| Sample α / β | Original and modified ROM in the Create station |
| Variant | A shape of the same ROM that auto-fix may try (headered, byte-swapped…) |
| Station | One of the five tabs |

## Changing the look

- Keep the six-colour spectrum. New accents should be mixes of existing tokens, not new hues.
- New effects belong in `fx.js` behind `VF.fx`, and must be optional: the controllers fall back to no-ops.
- No inline `style="…"` attributes or `<style>` blocks, because the CSP forbids them. Setting `element.style.x` from JS is fine.
- Check that reduced motion and the ≤ 560 px layout still hold up.
