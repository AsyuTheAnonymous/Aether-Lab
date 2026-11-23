# Analyze

Drop any ROM or disc image to see:

- **System** — identified by header signatures first and extension second (see the README for the list).
- **Internal details** — title, game code, mapper, mapping mode, region, byte order, boot chip (N64 CIC) and so on, depending on the system.
- **Fingerprints** — CRC32, MD5 and SHA-1, computed in chunks so huge images don't freeze the page.
- **Header checksums** — each one checked, with what's stored versus what it should be.
- **Notes** — warnings such as "this ROM has a copier header" or "this is a compressed image".

Then save a converted copy:

| Action | When it's offered |
| --- | --- |
| Remove N-byte header | SNES copier header, iNES/fwNES, A78, LNX, PC Engine copier header |
| Convert SMD → BIN | Interleaved Mega Drive `.smd` |
| Add 512-byte copier header | Headerless SNES ROM |
| Convert to .z64 / .v64 / .n64 | Any N64 ROM |
| Repair N checksums | Any header checksum that doesn't match |

Your original file is never modified — every action downloads a new file.
