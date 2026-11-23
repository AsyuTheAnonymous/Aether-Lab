# Third-party notices

Aether Lab's own code is under the [MIT License](LICENSE). The components below are included in the repository and keep their own licences.

## Included

### Forwarder ExeFS: nx-hbloader (ISC)

`js/nsp/template.js` embeds the compiled `main` and `main.npdm` of nx-hbloader with the Forwarder-Mod patches (switchbrew, natinusala, Skywalker25), as distributed by [TooTallNate/switch-nsp-forwarder](https://github.com/TooTallNate/switch-nsp-forwarder) v0.0.8. That program runs on the console when an installed forwarder is launched.

- Source: <https://github.com/switchbrew/nx-hbloader>
- Copyright 2017–2018 nx-hbloader Authors
- Licence: ISC. Full text in [licenses/nx-hbloader-ISC.txt](licenses/nx-hbloader-ISC.txt)

### Fonts (SIL Open Font License 1.1)

The files in `fonts/` are the Latin-subset WOFF2 builds of these fonts:

| Font | Copyright | Licence text |
| --- | --- | --- |
| [Unbounded](https://github.com/googlefonts/unbounded) | 2022 The Unbounded Project Authors | [licenses/LICENSE-Unbounded.txt](licenses/LICENSE-Unbounded.txt) |
| [Space Grotesk](https://github.com/floriankarsten/space-grotesk) | 2020 The Space Grotesk Project Authors | [licenses/LICENSE-SpaceGrotesk.txt](licenses/LICENSE-SpaceGrotesk.txt) |
| [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) | 2020 The JetBrains Mono Project Authors | [licenses/LICENSE-JetBrainsMono.txt](licenses/LICENSE-JetBrainsMono.txt) |

### Test fixtures

The small patch files in `tests/fixtures/` were made from **generated** data (no game data) using the tools below. They're only used to check that Aether Lab reads other tools' output correctly.

- [xdelta3](https://github.com/jmacd/xdelta) (Apache 2.0), through the Python binding
- [python-bps](https://pypi.org/project/python-bps/) (WTFPL)
- [RomPatcher.js](https://github.com/marcrobledo/RomPatcher.js) by Marc Robledo (MIT)

## References (no code copied)

Aether Lab's implementations were written from specifications and documentation. These projects defined the formats or the behaviour it matches, and they deserve the credit:

- **BPS and UPS**: byuu/Near's format specifications
- **VCDIFF**: [RFC 3284](https://www.rfc-editor.org/rfc/rfc3284); xdelta3's application-header conventions
- **PPF**: Icarus/Paradox's PPF3 documentation
- **APS**: the APS N64 (APS10) and APS GBA (APS1) format documentation
- **N64 boot CRC**: Parasyte's `n64crc` algorithm
- **NSP layout**: [hacBrewPack](https://github.com/The-4n/hacBrewPack) by The-4n, whose plaintext-forwarder output is reproduced including its padding quirks
- **Forwarder metadata defaults**: switch-tools' `nacptool` (switchbrew) and TooTallNate/switch-nsp-forwarder
- **Deterministic title IDs**: [sphaira](https://github.com/ITotalJustice/sphaira) by ITotalJustice
- **Switch file formats**: the [Switchbrew wiki](https://switchbrew.org/wiki/Main_Page)

Nintendo Switch, Game Boy, Nintendo 64, Super Nintendo and Nintendo DS are trademarks of Nintendo. Mega Drive is a trademark of Sega, and PlayStation is a trademark of Sony Interactive Entertainment. Aether Lab isn't affiliated with or endorsed by any of them.
