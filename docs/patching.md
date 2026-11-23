# Patching (Station 01)

1. **Sample α — ROM / disc image.** Drop or browse to the clean ROM. The lab identifies the system from its header, shows its internal details and computes CRC32, MD5 and SHA-1.
2. **Reagent β — Patch.** Drop the patch. The format is read from the file's first bytes (never the extension) and its details are shown. For checksummed formats you see straight away whether your ROM is the right one.
3. **Process settings.** The defaults are right for almost everything.
4. **Apply patch**, check the results list, then **Download**.

The output file is named after the patch (`My Hack v1.2.bps` → `My Hack v1.2.sfc`) and you can rename it before downloading.

## Formats

| Format | Typical use | What gets verified |
| --- | --- | --- |
| **BPS** | Modern hacks for any cartridge system | Source CRC32, target CRC32, patch CRC32 |
| **UPS** | GBA and older hacks | Source/target CRC32 — and it works in reverse |
| **IPS** | Classic hacks ≤ 16 MB | Nothing (the format has no checksums) |
| **IPS32 / EBP** | > 16 MB IPS variant / EarthBound-style IPS with JSON metadata | Nothing |
| **xdelta (VCDIFF)** | Disc images: PS1, PS2, GameCube, Wii, PSP | Adler-32 of every output window (if the author kept checksums on) |
| **PPF v1–3** | PS1 disc images | Image size (v2) and the 1 KB "block check" from the original disc (v2/v3) |
| **APS** | N64 (cart ID + header CRC) and GBA (per-64 KB CRC16) | As listed |

### xdelta and secondary compression

xdelta3 can optionally squeeze its output further with *secondary compression* (`-S lzma`, `djw` or `fgk`). Decoding that in a browser needs a full LZMA/Huffman implementation, so Aether Lab detects it and tells you instead of producing garbage. Most romhack xdelta patches don't use it. If yours does, ask the author for a `-S none` build or use xdelta3/Delta Patcher on a PC.

## Auto-fix: headers and byte order

Most "this patch doesn't work" reports come down to the ROM being in a slightly different shape than the one the patch was made from. With **Auto-fix** on (the default), the lab tries these variants of your ROM:

| System | Variant tried |
| --- | --- |
| SNES | remove the 512-byte copier header (`.smc` → `.sfc`), or add one |
| NES / FDS | remove the 16-byte iNES / fwNES header |
| N64 | convert between `.z64` (big-endian), `.v64` (byte-swapped) and `.n64` (word-swapped) |
| Mega Drive | de-interleave `.smd` into a plain `.bin` |
| Atari 7800 / Lynx / PC Engine | strip the 128 / 64 / 512-byte header |

For **BPS, UPS and APS (GBA)** the patch states the exact source it wants, so the variant is picked *before* patching by comparing CRC32 (or size). For **xdelta and PPF**, the lab only finds out while patching, so it retries each variant when a checksum fails. Whatever it changed is listed in the results ("Auto-fix: removed 512-byte header").

The manual switches **Remove header first** and **Add SNES copier header first** override auto-fix — useful for IPS patches, which can't tell you which shape they expect.

## Checksum repair

Some systems store a checksum in the ROM header. A hack that changes the ROM without updating it may refuse to boot on real hardware or make an emulator complain. **Repair header checksums after patching** recomputes them on the output:

| System | Field | Does hardware care? |
| --- | --- | --- |
| Game Boy / Color | Header checksum `0x14D` | Yes — the boot ROM refuses a bad one |
| Game Boy / Color | Global checksum `0x14E` | No (cosmetic) |
| Game Boy Advance | Complement `0xBD` | Yes |
| SNES | Internal checksum + complement | No, but emulators may warn |
| Mega Drive / Genesis | Checksum `0x18E` | Some games check it themselves |
| Nintendo 64 | Boot CRC1/CRC2 `0x10` | Yes — the CIC chip checks it |
| Nintendo DS | Header CRC16 `0x15E` | Yes on hardware / flashcarts |

Repairing changes the output's own CRC32, so it will no longer match the "target checksum" in a hack's readme — that's expected. The results show the patch's own verification first, then the repair.

## Checking against a readme

Hack readmes usually list the checksum of the ROM they need. Open **Compare with a checksum from the hack's readme** under Sample α and paste a CRC32, MD5 or SHA-1 — the lab tells you if your dump matches.

## Troubleshooting

| Message | Meaning and fix |
| --- | --- |
| *Wrong source ROM — expects CRC32 …* | Your ROM is a different dump: region, revision (v1.0/v1.1) or a bad dump. Compare against the readme checksum. No-Intro/Redump-verified dumps are what most hacks use. |
| *Matches after a quick fix* | Nothing to do — auto-fix will convert your ROM as described. |
| *xdelta checksum failed* | Same as wrong source, for xdelta. |
| *Disc block check failed* (PPF) | Different disc revision, or an `.iso` where the patch wants the raw `.bin` from your `.cue`. |
| *Data after EOF* (IPS) | The patch was made by a tool that wrote a record at offset `0x454F46`, which every standard IPS reader treats as the end. The output may be incomplete. |
| *…isn't a patch format I recognise* | Often a `.zip`/`.7z` — extract the patch first. |
| Patched fine but the game crashes | For IPS, try the opposite header setting. Otherwise the ROM is probably the wrong revision. |

**Force — ignore failed checks** applies the patch anyway. It exists for edge cases (deliberately modified bases); a failed check nearly always means a broken result.
