# NSP forwarders

A **forwarder** is a tiny installable title that shows up on the Switch HOME menu with its own name and icon. When you launch it, it immediately chain-loads something on your SD card:

- a **RetroArch core** with a ROM as its argument — the game boots straight in, no RetroArch menu, or
- any **homebrew `.nro`** — an emulator, a PC port, a tool.

Aether Lab builds the forwarder's `.nsp` in your browser. You then install it with Goldleaf (or DBI, Tinfoil, sphaira…).

## What you need

| | Why |
| --- | --- |
| A Switch running **Atmosphère** custom firmware | Forwarders are homebrew titles. |
| **Up-to-date signature patches** (sigpatches) for your firmware | Only Nintendo can sign titles the console trusts by default. Forwarders are signed with a throwaway key, and sigpatches let the console accept them. |
| **`prod.keys` from your own console** | Needed to encrypt the NSP's headers in the format the console expects. Refresh them after every system update. |
| **RetroArch** (for ROM forwarders) | Cores live at `sdmc:/retroarch/cores/<core>_libretro_libnx.nro`. |
| An installer: **Goldleaf**, DBI, Tinfoil or sphaira | To install the `.nsp`. |

Your keys are read into memory in the browser tab and nothing else: not uploaded (the page can't make network requests), not stored, gone when you close or reload the tab. Only `header_key` is strictly required. If your file also contains `master_key_00` and the key sources, the lab derives `header_key` from them and refuses an inconsistent file — a handy check that you've got a complete dump.

## Building one

**Step 1 — Your console keys.** Load `prod.keys`.

**Step 2 — What it launches.**

*RetroArch ROM*
- **System** and **Core** fill in the core path for you (`sdmc:/retroarch/cores/snes9x_libretro_libnx.nro` and so on). Choose **Custom path…** if your core has a different file name — check `/retroarch/cores/` with a file manager.
- **ROM path on SD** is where the ROM will live on the card, e.g. `sdmc:/roms/snes/My Hack.sfc`. **Pick the ROM file to fill in its name** reads only the file *name* — the ROM itself isn't needed here.

*Homebrew .nro*
- Optionally load the `.nro` itself: the lab reads its title, author, version and icon from the NRO's built-in metadata (ASET section).
- Enter the `.nro` path on the SD card, e.g. `sdmc:/switch/myapp/myapp.nro`, plus any launch arguments.

Paths can be typed as `sdmc:/…`, `/…`, or even pasted from a PC (`E:\roms\…`) — they're normalised. Quotes aren't allowed (they'd break the argument string).

**Step 3 — HOME menu details.** Title, publisher and version as they'll appear on HOME. Leave **Ask for a user profile at launch** off for RetroArch.

**Step 4 — Icon.** Use a generated icon (Prism, Hologram or Aurora styles, with the system as a badge) or your own image. Images are cropped to fill or fitted, and exported as a 256 × 256 baseline JPEG under 128 KB — larger icons show as "?" on HOME.

**Step 5 — Forge the NSP.** The summary shows exactly what will run. **Forge NSP** builds it in a second or two and then re-reads its own output (see below).

## Title IDs

Every installed title needs a unique 16-digit ID in the application range `0100000000000000`–`01FFFFFFFFFFFFFF`, ending in `000`.

| Mode | Behaviour |
| --- | --- |
| **Auto (stable)** — default | `SHA-256(nroPath + argv)` → `0x0100000000000000 | (first 8 bytes as little-endian u64 & 0x00FFFFFFFFFFF000)`. Identical to sphaira and switch-nsp-forwarder, so the same target always gets the same ID: rebuilding **updates** the installed forwarder rather than adding a second icon. |
| **Random** | A fresh ID each time you pick it. |
| **Manual** | Type your own; it's validated. |

## Installing with Goldleaf

1. Copy the `.nsp` to the SD card (or keep it on your PC and use Quark for USB installs).
2. Goldleaf → **Explore content** → **SD card** (or **Remote PC**) → select the `.nsp` → **Install** → choose SD card storage.
3. Make sure the ROM (or `.nro`) really is at the path you entered.
4. Launch it from HOME.

## What the lab checks before you download

After building, the NSP is read back the way an installer would:

- each NCA header decrypts with your `header_key` to a valid `NCA3` header with the right size and title ID,
- every section's header hash and master hash match,
- each NCA's file name is the first half of its SHA-256 (that's how installers find them),
- the content meta (CNMT) lists every NCA by hash, size and type,
- signature #2 on the program NCA verifies against the public key placed in `main.npdm`.

The full structure is described in [nsp-format.md](nsp-format.md).

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| *"The software was closed because an error occurred"* immediately | Sigpatches missing or out of date for your firmware / Atmosphère version. |
| Installer refuses the NSP | Keys from another console or an older firmware — refresh your console's `prod.keys`. |
| Black screen, then back to HOME | Core or ROM path wrong. Paths are case-sensitive. Check both in a file manager on the Switch. |
| RetroArch opens its menu instead of the game | The ROM path didn't resolve; check spelling and folder. |
| "?" icon | The image couldn't be decoded. Rebuild with a generated icon. |
| Two icons after rebuilding | You used Random/Manual IDs. Use Auto, or delete the old one in System Settings → Data Management. |

## Credits

The forwarder program inside every NSP is [nx-hbloader](https://github.com/switchbrew/nx-hbloader) with the Forwarder-Mod patches, as built by [TooTallNate/switch-nsp-forwarder](https://github.com/TooTallNate/switch-nsp-forwarder) (ISC licence). It reads `romfs:/nextNroPath` and `romfs:/nextArgv` and chain-loads that NRO.
