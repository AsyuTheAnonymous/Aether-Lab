# Testing

```bash
npm test            # everything
npm test -- nsp     # only test files whose name contains "nsp"
```

The tests need only Node.js 20 or newer. Nothing gets installed, because there are no dependencies. A full run takes a few seconds.

## How it works

The app's scripts are plain browser scripts that attach to a global `VF`. `tests/lib.js` loads the DOM-free ones (core, patch formats, consoles, engine, Switch) into a Node `vm` context in the same order as `index.html`. The tests therefore exercise exactly the code the browser runs, without a bundler or test framework.

`tests/run.js` is a tiny runner. Each `*.test.js` exports an object of `{ 'test name': fn }`, and async functions are awaited. The process exits non-zero if anything fails, which is what CI checks.

Helpers in `tests/lib.js`:

| Helper | Purpose |
| --- | --- |
| `loadVF()` | Fresh `VF` namespace with all core scripts loaded |
| `assert.ok / equal / bytes / throws(fn, code)` | `throws` can check a `PatchError` code; `bytes` reports the first differing offset |
| `makeRom(size, seed)` | Deterministic pseudo-random "ROM" — the repo never contains real ROM data |
| `mutate(src, seed, kinds)` | Deterministic edits: `edits`, `runs`, `insert`, `grow`, `shrink` |
| `fixture(name)` | Read a file from `tests/fixtures/` |

## What's covered

| File | Covers |
| --- | --- |
| `crypto.test.js` | CRC32/MD5/SHA-1/SHA-256 against published vectors and Node's `crypto` (including chunked input at block boundaries); AES-128 FIPS-197; AES-XTS with Nintendo's sector tweak against OpenSSL |
| `patch.test.js` | IPS/UPS/BPS round trips over six kinds of change; the IPS "EOF" offset; size limits; UPS in reverse; wrong-source and damaged-patch rejection; BPS metadata; clear errors for unsupported formats |
| `fixtures.test.js` | Patches made by **other tools** — xdelta3, python-bps, RomPatcher.js (IPS, UPS, PPF3, APS N64) — must apply byte-for-byte; xdelta Adler-32 catches a wrong source; secondary compression is reported, not mis-decoded |
| `rom.test.js` | GB, GBA, NDS, Mega Drive, SNES, N64 and NES detection plus checksum repair; SMD de-interleave; N64 byte orders; an N64 boot-CRC snapshot for every CIC |
| `engine.test.js` | Auto-fix: a patch made for a headerless SNES ROM applies to a headered one; `.z64` patches apply to `.v64`; checksum repair; forcing a mismatched ROM; refusing to create a patch from identical files |
| `nsp.test.js` | `prod.keys` cross-check; title-ID formula and validation; path normalisation; full RetroArch and plain-NRO forwarder builds re-read by an independent PFS0/NCA reader; template integrity |
| `edition.test.js` | The patcher edition: no forwarder tab, panel, scripts or credits; stations renumbered; every referenced file shipped; marker mistakes caught |

The interface (`js/ui/`, `js/app.js`) isn't unit-tested. Check it by hand using the list below.

## Fixtures

`tests/fixtures/` holds small patch files made by reference tools from **generated** data. `manifest.json` records the tool, seeds, mutation kinds and expected output CRC32 for each one. That's enough to regenerate the source and target ROMs in the test, so no ROM data ever lives in the repo.

To rebuild them (not needed for normal development):

```bash
pip install xdelta3 python-bps
npm install --no-save rom-patcher@3.1.0-b
node tests/fixtures/make-fixtures.js
```

When you add a patch format, add a fixture made by that format's reference tool. Fixtures are the tests that catch misreadings of a spec, which round-trip tests can't do.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request (except to the generated `patcher-site` branch), on Node 20 and 22:

1. `node --check` on every file in `js/`, to catch syntax errors in scripts the tests don't load.
2. `npm test`.
3. Building the patcher edition (`tools/build-patcher.js`), which also checks the result.
4. A smoke test that starts `server.js`, checks that the page and a script load, and checks that `package.json` returns 404.

## Manual checklist for UI changes

- [ ] Load over `npm start` **and** by opening `index.html` directly, with no console errors.
- [ ] Build the patcher edition (`node tools/build-patcher.js`) and open `dist/patcher/index.html`: four stations, no forwarder button after patching, no console errors.
- [ ] Patch: drop a ROM and a patch, apply, download. Try a wrong ROM, with and without "force".
- [ ] Create: make one patch in every format and re-apply each in the Patch station.
- [ ] Forwarder: build with throwaway or real keys; the verification list is all green.
- [ ] Analyze: run each repair and conversion that the loaded ROM offers.
- [ ] Phone width (~360 px), tablet, desktop; portrait and landscape.
- [ ] Reduced motion on (OS setting): no boot animation, no bursts, still background.
- [ ] Keyboard only: every control reachable, with a visible focus ring.
