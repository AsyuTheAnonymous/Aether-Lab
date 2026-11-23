# Creating patches

1. **Baseline** — the clean ROM players will have.
2. **Variant** — your modified build.
3. Pick a format, optionally add BPS metadata, and **Create patch**.

Before the download button appears, the new patch is applied back to the baseline and must reproduce your variant byte for byte.

## Which format?

| Format | Pick it when | Limits |
| --- | --- | --- |
| **BPS** (recommended) | Almost always. Players get source/target checksums, so a wrong ROM is caught instead of producing a broken game. | — |
| **UPS** | A community expects UPS (some GBA scenes). | Checksummed; reversible. |
| **IPS** | A tool or emulator only reads IPS. | 16 MB max; no checksums; files at least as big as the change. |

## How the BPS encoder works

The encoder walks the target once and, at each position, picks the cheapest of:

- **SourceRead** — the same bytes are at the same offset in the original (by far the most common in hacks),
- **SourceCopy** — the bytes exist *somewhere* in the original (found through an 8-byte rolling hash table), which keeps patches small when data has moved,
- **TargetCopy** — the bytes repeat something already written (runs and repeated structures),
- **TargetRead** — literal new bytes.

It isn't as tight as Flips' suffix-array mode on worst-case inputs, but it handles inserted and moved data well and is fast enough for 32 MB ROMs in a browser tab.

## Tips for hack authors

- Put the **source CRC32** shown in the results in your readme — players can paste it into the Patch tab to check their dump.
- State whether the base ROM is **headered or headerless** (SNES) and its **byte order** (N64). Aether Lab handles both, but other patchers may not.
- BPS metadata is a good place for title, version and credits; it shows up when someone inspects the patch.
