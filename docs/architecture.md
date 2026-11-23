# Architecture

Aether Lab is deliberately simple to work on: no framework, no bundler, no dependencies. Every script is a plain `<script>` that attaches itself to one global namespace, `VF`, and `index.html` loads them in dependency order. That's what lets the app run straight from `file://`, and the same files load unchanged into Node for the tests.

```js
(function (VF) {
  'use strict';
  // …module code…
  VF.something = { /* public API */ };
})((globalThis.VF = globalThis.VF || {}));
```

## Map

| Layer | Files | Responsibility | DOM? |
| --- | --- | --- | :---: |
| Core | `js/core/bytes.js`, `hash.js` | `Reader`/`Writer`, hex/size helpers; CRC32, CRC16 (CCITT + MODBUS), Adler-32, MD5, SHA-1, SHA-256 — all incremental, all pure JS | no |
| Patch formats | `js/patch/registry.js` + one file per format | Detect, inspect, apply, create | no |
| Consoles | `js/rom/consoles.js`, `n64.js` | Identify systems, headers, byte order, checksum check/repair, "variants" for auto-fix | no |
| Engine | `js/patch/engine.js` | Orchestrates a patch job: detect → auto-fix → apply → retry → checksum report | no |
| Switch | `js/nsp/*.js` | AES-ECB/XTS, `prod.keys`, PFS0/RomFS/IVFC, NCA, NACP/NPDM/CNMT, forwarder build + self-verification, RetroArch core presets, embedded ExeFS template | no |
| Interface | `js/ui/dom.js`, `icon.js`, `fx.js`, `*-tab.js`, `js/app.js` | DOM helpers, icon renderer, visual effects, one controller per station, tab routing | yes |

Everything above the interface layer is DOM-free and covered by `npm test`.

## Patch format contract

A format registers itself with `VF.patch.register({...})`:

```js
VF.patch.register({
  id: 'bps',                 // used by VF.patch.byId()
  name: 'BPS',
  ext: 'bps',
  blurb: 'Shown in the Create station',      // only for formats with create()
  detect(u8) { return true/false },          // magic bytes only — never the file name
  inspect(u8) {                              // shown under "Patch file"
    return {
      rows: [['Label', 'value'], …],
      expectedSourceCrc,   // optional: lets the engine pick a ROM variant up front
      expectedSourceSize,  // optional: same, by size
      n64Order,            // optional: 'z64' | 'v64' (APS N64)
    };
  },
  apply(rom, patch, { ignoreChecksums }) {   // must not mutate rom
    return { output: Uint8Array, checks: [{ label, ok: true|false|null, detail }] };
  },
  create(source, target, opts) { return Uint8Array }, // optional
});
```

Throw `VF.patch.PatchError(message, code)` for anything the user should read. These codes tell the engine to retry with header/byte-order variants: `source-crc`, `source-size`, `block`, `size`. `unsupported`, `patch-crc` and `format` are terminal.

### Adding a patch format

1. Create `js/patch/<name>.js` implementing the contract above. Use `VF.bytes.Reader` — it throws a clear "truncated or corrupt" error instead of reading past the end.
2. Add a `<script>` tag in `index.html` (before `js/patch/engine.js`) and the path to `CORE_SCRIPTS` in `tests/lib.js`.
3. Add tests: a round trip if you implement `create`, and — most valuable — a fixture made by the reference tool for that format (see [testing.md](testing.md)).
4. Add the extension to the patch drop zone's hint text and the README format table.

## Console contract

`VF.rom.identify(u8, fileName)` returns:

```js
{
  id: 'snes',                       // short id, also used to pick RetroArch presets
  name: 'Super Nintendo / Super Famicom',
  rows: [['Internal title', '…'], …],
  header: { kind: 'snes', size: 512, removable: true } | null,
  checksums: [{ id, label, check(u8) → { ok, detail }, fix(u8) → new Uint8Array }],
  notes: ['warnings shown to the user'],
}
```

`VF.rom.variants(u8, info)` lists alternative shapes of the same ROM (`{ label, data }`) that auto-fix may try. `fix()` must return a new array and leave its input untouched.

### Adding a console

1. Add a detection branch in `identify()` — prefer header magic over extensions, and order matters (more specific signatures first).
2. If it has a header checksum, add a `checksums` entry with `check` and `fix`, and a test in `tests/rom.test.js`.
3. If it has a removable header, set `header` and teach `removeHeader()` / `variants()` about it.
4. Add a RetroArch preset in `js/nsp/cores.js` if a Switch core exists.

### Adding a RetroArch core

`js/nsp/cores.js` has one entry per system: `{ id, name, folder, cores: ['first-is-default', …], exts }`. Core names are libretro core IDs; the file on the Switch is `<core>_libretro_libnx.nro`.

## The engine

`VF.engine.applyPatch(rom, romName, patch, patchName, options)`:

1. `detect()` the format, `identify()` the ROM, `inspect()` the patch.
2. Apply manual header options if set.
3. If the patch declares `expectedSourceCrc` / `expectedSourceSize` / `n64Order`, pick the matching ROM variant **before** patching.
4. `apply()`. If it throws a retryable `PatchError`, try each variant in turn.
5. Identify the output, run every header checksum, optionally repair.
6. Return output, an output file name, checks, the checksum report and a log of what auto-fix did.

`VF.engine.createPatch()` builds a patch and immediately re-applies it — a creator bug can't produce a download.

## Switch pipeline

`VF.forwarder.build()` → `VF.switchfs` (PFS0, RomFS, hash layers) → `VF.nca.build()` (header, XTS) → `VF.switchmeta` (NACP, NPDM, CNMT) → NSP → `VF.forwarder.verify()`. See [nsp-format.md](nsp-format.md).

## Interface and effects

Each station has one controller (`patch-tab.js`, `create-tab.js`, `forge-tab.js`, `lab-tab.js`) with an `init()` called by `app.js`. Controllers talk to the DOM through `VF.ui` helpers, and to the effects through a small optional API:

| `VF.fx` | Used for |
| --- | --- |
| `init()` / `boot()` | Start the background canvases; play the boot sequence once per session |
| `moveInk(tab)` | Slide the tab indicator |
| `scan(card, on)` | Laser sweep while a job runs |
| `burst(element)` | Prism-shard burst on success |

Controllers fall back to no-ops if `VF.fx` is missing, so the effects layer can be removed or replaced without touching app logic. Details in [design.md](design.md).

## Editions

The repository is the **full edition**. `tools/build-patcher.js` derives the **patcher edition** from it: the same app without the Switch forwarder station or its code. A workflow (`.github/workflows/patcher-edition.yml`) publishes the patcher edition to the `patcher-site` branch on every push to `main`. There's still only one codebase to change.

In `index.html`:

| Markup | Full edition | Patcher edition |
| --- | --- | --- |
| `<!-- edition:switch -->…<!-- /edition:switch -->` | shown as is | removed |
| `<!-- edition:patcher …html… -->` | an HTML comment (ignored) | un-commented |

Rules:

- Wrap anything Switch-only in `edition:switch` markers: tabs, panels, Codex cards, credits, `<script>` tags. Markers can't be nested. A block can span lines or sit inline within one line.
- The `edition:patcher` comment is for patcher-only replacements, like the page `<title>`. It has to span several lines, and the HTML inside it can't contain `--`.
- JavaScript that touches the forwarder from shared code has to check it exists first: `if (VF.forge && $('#panel-forge'))`. `js/app.js` reads the station list from the tabs and numbers them in order. The build renumbers them in the HTML too.
- Switch-only files are listed in `EXCLUDE` in the build script. New files under `js/nsp/` are excluded automatically.

`tests/edition.test.js` builds the patcher edition and fails if anything Switch-related is left in it, if any referenced file is missing, or if the markers are unbalanced.

## Security model

- **No network.** The CSP sets `connect-src 'none'` (in the page and again in `.htaccess` / `server.js` / `_headers`). Don't add fetches, CDNs, analytics or web fonts from other hosts.
- **No inline code.** `script-src 'self'` / `style-src 'self'` — keep CSS and JS in files. Setting `element.style.x` from JS is fine (that's CSSOM, not an inline style attribute).
- **No HTML injection.** User-controlled strings (file names, ROM titles, patch metadata) only ever reach the page through `textContent` via `VF.ui.el()`. Don't use `innerHTML` with data.
- **No persistence.** Nothing is written to storage except a `sessionStorage` flag that the boot animation has played. Keys and ROMs live in memory only.
- **Integrity.** The embedded forwarder ExeFS is checked against its SHA-256 before every build.

One environment-specific branch exists: inside the claude.ai artifact preview, pages can't start downloads themselves, so `VF.ui.download()` uses the host's `downloads` capability when `globalThis.claude` is present. On a normal web host that object doesn't exist and a standard download link is used.
