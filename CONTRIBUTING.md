# Contributing to Aether Lab

Thanks for helping. Bug reports, new patch formats, console support, RetroArch core presets, docs fixes and design polish are all welcome.

## Ground rules

These keep the project legal, private and easy to work on. Pull requests that break one of them can't be merged.

1. **No game data, ever.** Don't put ROMs, disc images, BIOS files, `prod.keys`, title keys or firmware in issues, pull requests or test fixtures. Tests generate their own fake ROMs from seeds (see [docs/testing.md](docs/testing.md)). When reporting a problem, give the system, size and CRC32 shown in the page instead.
2. **No network requests.** Everything runs on the user's device. The Content Security Policy (`connect-src 'none'`) enforces this, so don't loosen it, and don't add CDNs, analytics, web fonts from other hosts or "check for updates" calls.
3. **No dependencies and no build step.** The app is plain HTML, CSS and JavaScript that works from `file://`. Tests use only Node's standard library.
4. **CSS and JS in their own files.** No inline `<style>`, `<script>` or `style="…"` attributes (the CSP blocks them anyway).
5. **User data only through `textContent`.** File names, ROM titles and patch metadata are untrusted. Use `VF.ui.el()`, never `innerHTML`, for anything that came from a file.
6. **Responsive and accessible.** Every change has to work at phone, tablet and desktop widths, by keyboard, and with reduced motion on.

## Getting set up

You need Git and Node.js 20 or newer. Node is only for the tests and the optional server.

```bash
git clone https://github.com/AsyuTheAnonymous/Aether-Lab.git
cd Aether-Lab
npm start        # http://localhost:3000, or just open index.html
npm test
```

There's nothing to install. If you'd rather not use a terminal, you can edit in the browser with GitHub's web editor (press `.` on the repo page) and let CI run the tests on your pull request.

## Making a change

1. **Open an issue first** for anything bigger than a bug fix, so we can agree on the approach before you put time in.
2. **Fork and branch.** Work on a branch named for the change, like `fix/ips-truncation` or `feat/bdf-format`. Pull requests go to `main`, and nobody pushes to `main` directly.
3. **Keep it focused.** One feature or fix per pull request. Leave formatting-only churn out of feature PRs.
4. **Add tests** for new formats, consoles and behaviour. For a patch format, include a fixture made by the format's reference tool (see [docs/testing.md](docs/testing.md#fixtures)).
5. **Update the docs** that your change affects: README tables, the station guides, and the [CHANGELOG](CHANGELOG.md) under *Unreleased*.
6. **Open the pull request** and fill in the template. CI must be green.

### Where things go

[docs/architecture.md](docs/architecture.md) explains the module layout. It has step-by-step sections for adding a patch format, a console or a RetroArch core. In short:

| You want to… | Touch |
| --- | --- |
| Support a new patch format | `js/patch/<format>.js`, `index.html` script list, `tests/lib.js` script list, tests, README |
| Detect a new console or fix a checksum | `js/rom/consoles.js`, `tests/rom.test.js` |
| Add a RetroArch core preset | `js/nsp/cores.js` |
| Change the forwarder NSP | `js/nsp/*.js`, [docs/nsp-format.md](docs/nsp-format.md), `tests/nsp.test.js` |
| Change the look | `css/style.css`, `js/ui/fx.js`; follow [docs/design.md](docs/design.md) |

## Code style

- Classic scripts wrapped in `(function (VF) { 'use strict'; … })(globalThis.VF = globalThis.VF || {});`. No ES modules (they don't load from `file://`).
- Two-space indent, single quotes, semicolons, `const`/`let`.
- Byte work goes through `Uint8Array`, `DataView`, `VF.bytes.Reader` and `VF.bytes.Writer`. Never mutate an input buffer; return a new one.
- Errors the user will read are `VF.patch.PatchError` with a plain-English message that says what to do next.
- Comment the *why*, especially where a format or tool has a quirk you're reproducing on purpose.

## Commit messages

Use a short summary line in the imperative ("Add BDF patch support", "Fix PPF3 undo data on BIN images"), then a blank line and any detail. Reference issues with `Fixes #12`.

## Reporting bugs

Use the **Bug report** template. Helpful details are the station, browser, system, ROM size and CRC32, patch format and source, and the exact message on screen. For forwarders, include your Atmosphère version and the verification list from the result panel.

Security problems go through private reporting instead. See [SECURITY.md](SECURITY.md).

## Licence

By contributing, you agree that your contributions are released under the project's [MIT License](LICENSE). If you add third-party material, it needs a compatible licence and an entry in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md) in all project spaces.
