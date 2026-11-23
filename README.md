# Aether Lab

Holographic ROM patch lab and Switch forwarder forge. It's a static site (HTML/CSS/JS only, no server code) and everything runs in the visitor's browser. The page's security policy (`connect-src 'none'`) blocks every network request, so ROMs, patches and `prod.keys` can't leave the device.

## What it does

| Tab | Purpose |
| --- | --- |
| **01 Patch** | Applies IPS / IPS32 / EBP, BPS, UPS, xdelta (VCDIFF), PPF v1–3, APS (N64 + GBA). Auto-fixes SNES copier headers, iNES/A78/LNX headers, SMD interleave and N64 byte order. It checks source/target checksums and can repair header checksums (GB/GBC, GBA, SNES, Mega Drive, N64 CRC, NDS). |
| **02 Create** | Builds BPS, UPS or IPS patches from an original and a modified ROM. It test-applies every patch before offering the download. |
| **03 Forwarder** | Builds installable NSP forwarders (Goldleaf, DBI, Tinfoil, sphaira…) that launch a RetroArch core with a ROM, or any homebrew `.nro`. Uses the visitor's own `prod.keys` (only `header_key` is needed). |
| **04 Analyze** | Identifies a ROM and shows its hashes. Can strip or add headers, convert N64 byte order and repair checksums. |
| **05 Codex** | Short troubleshooting guide. |

## Folder layout

```
index.html
css/        fonts.css, style.css   ← colours, spectrum and radii are variables in :root
fonts/      self-hosted woff2 (no Google requests)
images/     logo.svg (also the favicon)
js/core/    bytes + hashes (CRC32, MD5, SHA-1, SHA-256, Adler-32)
js/patch/   one file per patch format + engine.js (auto-fix logic)
js/rom/     console detection, headers, checksum repair, N64 CRC
js/nsp/     AES, prod.keys parsing, PFS0/RomFS/IVFC, NCA, NACP/NPDM/CNMT, forwarder builder
js/ui/      one file per tab, DOM/icon helpers, fx.js (all the visual effects)
js/app.js   tab routing
licenses/   ISC notice for the forwarder ExeFS, OFL for the fonts (Unbounded, Space Grotesk, JetBrains Mono)
.htaccess   security headers for Hostinger
```

The scripts are plain `<script>` files that share one global, `VF`, rather than ES modules. That way the site also works if you just double-click `index.html` locally.

## How the look is built

| Effect | Technique | Where |
| --- | --- | --- |
| Aurora behind everything | Four wavy ribbons drawn on a canvas about 1/5 of the screen size, softened with a canvas blur, then stretched full-screen. Tiny canvas means it's cheap to redraw | `fx.js` → `drawAurora` |
| Floating crystal + light motes | A 3D icosahedron rotated and projected in plain JS, plus pre-rendered glow sprites (one per spectrum colour) stamped with `drawImage` | `fx.js` → `drawCrystal`, `drawField` |
| Spectrum edge on every panel | A `conic-gradient` on `::before`, masked to a 1px ring. The angle is a registered `@property --angle`, so CSS can animate it — it spins on hover | `style.css` → `.card::before` |
| Light that follows the cursor | JS writes the pointer position into `--mx` / `--my`; a radial gradient in `::after` reads them | `.card::after` + `fx.js` |
| 3D tilt on drop zones and the icon tile | Same trick with `--tx` / `--ty` fed into `perspective() rotateX() rotateY()` | `.drop`, `.holo-tile` |
| Foil buttons | Spectrum gradient at 300% width slowly sliding, plus a white sheen that sweeps on hover | `.btn--primary` |
| Prism-shard bursts on success | A separate canvas above the interface, only drawn while shards exist | `fx.burst()` |
| Boot sequence | Once per browser session (sessionStorage), click/any key skips | `fx.boot()` |

Performance guards: everything pauses when the tab is hidden, phones skip the live glass blur, and the canvases stay at 1.25× pixel density or lower. If someone's OS asks for reduced motion, every animation is switched off and the background is drawn once as a still frame.

## Deploying on Hostinger (browser only)

1. On GitHub, create a repo in the Silvea Technologies org, then **Add file → Upload files** and drag in the *contents* of this folder (keep the folder structure).
2. Commit to a branch, check it, then merge to `main` when you're ready to go live.
3. In hPanel, connect the repo to the domain or subdomain (for example `patcher.silvea.tech`). The site root is the repo root.
4. Turn on **Force HTTPS** for that domain in hPanel. The forge's signing step uses the browser's WebCrypto, which needs HTTPS (or a local file).

`.htaccess` starts with a dot, so GitHub's uploader may hide it in the file picker. You can still drag it in, or create it with **Add file → Create new file** and paste its contents.

## Forwarder notes

- The NSP structure mirrors hacBrewPack with `--plaintext --nologo --nopatchnacplogo --titleid`, which is what NTON, nsp-forwarder and similar tools ship.
- Each build generates a fresh RSA key for NCA signature #2 and writes its modulus into `main.npdm`. Installing still needs Atmosphère with current sigpatches.
- "Auto" title IDs use sphaira's formula, `SHA-256(nroPath + argv)`, so rebuilding the same forwarder updates the installed one instead of adding a duplicate.
- To update the forwarder ExeFS later, regenerate `js/nsp/template.js` with the new `main` / `main.npdm` and their SHA-256 values. Every build checks those hashes first.

## Limits

- Everything happens in memory, so about 2 GB is the practical maximum file size.
- xdelta patches made with secondary compression (`-S lzma/djw/fgk`) are detected and explained, but not decoded.
- RUP, BDF/BSDiff and PMSR patches are recognised but not supported.
