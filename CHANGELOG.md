# Changelog

Notable changes to Aether Lab are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
