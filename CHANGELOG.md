# Changelog

Notable changes to Aether Lab are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Patcher edition**: Patch, Create, Analyze and the Codex without the Switch forwarder. `tools/build-patcher.js` builds it, and a workflow publishes it to the `patcher-site` branch on every push to `main`.
- Favicons, home-screen icons and `manifest.webmanifest`, plus a social preview image (`docs/social-preview.jpg`).
- `.nojekyll`, so GitHub Pages can serve the full edition straight from `main`.
- Deployment guides for both editions, including switching an existing Hostinger site to the patcher edition.

### Changed (design)

- **Premium polish: chrome and light.**
  - Station headlines are set whole in the logo's chrome.
  - Input panels get a machined chrome edge lit like the crystal, settings sit back as a quieter surface, and results are lit by their status, with an icon.
  - The primary button is polished chrome.
- **Plainer, calmer interface.**
  - Labels are sentence case in the interface font.
  - Panels say what goes in them, with a one-line hint, in place of jargon tags (Sample α, Reagent β, Parameters).
  - The tabs lose their numbers; the forwarder keeps numbered steps because its order matters.
  - Middle-dot strings are rewritten as sentences.
- Ambient loops (flowing gradients, spinning edges, floating icons, the pinging dot, the hover laser) are gone. The crystal is the one thing that moves on its own.
- A scrim appears behind the tab bar once it sticks, so content doesn't show around it.
- Data tables have hairline rows, and check icons are outlined.

### Fixed

- Boot screen: the logo showed a black box behind it and sat off-centre inside the spinning rings. It's now cut out onto a transparent background and centred, with a soft CSS glow.

### Changed

- **New logo and brand.**
  - The palette is re-sampled from the logo: cyan through azure, violet and magenta.
  - The header lockup now matches the logo: chrome AETHER over a spaced LAB.
  - The boot screen shows the full logo.
  - The background crystal and the forwarder-icon crystal are redrawn as the logo's two-tone crystal with its orbit ring.
  - Status colours (ok, warn, bad) stay separate from the brand spectrum.
- Screenshots updated.
- Stations are numbered from the tabs on the page, so either edition counts 01, 02, 03… without gaps.
- Key-related text no longer names or explains a specific key-dumping tool. It just asks for the `prod.keys` from your own console.

## [1.0.0] — 2026-11-23

The first public release.

### Added

- **Patch station**
  - Applies IPS, IPS32, EBP, BPS, UPS, xdelta/VCDIFF (including multi-window patches), PPF v1–3 and APS (N64 and GBA).
  - Checks the source ROM, and auto-fixes copier headers, iNES/FDS/Atari/Lynx/PCE headers, N64 byte order and SMD interleave.
  - Optional header-checksum repair afterwards.
- **Create station**
  - Builds BPS (with metadata), UPS and IPS patches.
  - Every patch is test-applied before it can be downloaded.
- **Forwarder station**
  - Builds NSP forwarders on the device for RetroArch ROMs or any `.nro`, using the user's own `prod.keys` (only `header_key` is required).
  - Generated holographic icons, or a custom image.
  - Deterministic title IDs (sphaira scheme), or random or custom ones.
  - RSA-PSS NCA signature #2 with a per-build key.
  - Self-verification of every header, hash and record after the build.
- **Analyze station**
  - Identifies 20+ systems.
  - CRC32, MD5 and SHA-1 hashes.
  - Header checksum check and repair for GB/GBC, GBA, SNES, Mega Drive, N64 (all CICs) and NDS.
  - Header strip/add and N64 byte-order conversion.
- **Codex**: a built-in troubleshooting guide.
- The holographic "Aether Lab" interface:
  - glass panels over an aurora and prism-crystal background
  - scan and burst effects
  - a one-time boot sequence
  - full reduced-motion support and a lightweight mobile mode
- A zero-dependency test suite that includes patches made by xdelta3, python-bps and RomPatcher.js. CI runs it on Node 20 and 22.
- An optional zero-dependency static server (`npm start`) and security headers for Apache/LiteSpeed (`.htaccess`) and Netlify/Cloudflare (`_headers`).
- Documentation: getting started and deployment, a guide for each station, architecture, NSP format notes, the design system, testing, contributing and security.

[Unreleased]: https://github.com/AsyuTheAnonymous/Aether-Lab/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/AsyuTheAnonymous/Aether-Lab/releases/tag/v1.0.0
