# NSP format notes

How Aether Lab assembles a forwarder NSP. The layout intentionally matches what [hacBrewPack](https://github.com/The-4n/hacBrewPack) produces with

```
--titleid <id> --nologo --plaintext --nopatchnacplogo
```

because that's what NTON, nsp-forwarder, sphaira-era tools and countless installed forwarders already use. Where hacBrewPack has quirks (extra padding blocks), they're reproduced on purpose. All integers are little-endian unless noted. Code references are in `js/nsp/`.

## The pieces

```
Forwarder [01XXXXXXXXXXX000].nsp        PFS0 container
├── <id>.nca        Program NCA  (content type 0)
│   ├── section 0   ExeFS  — PFS0 { main, main.npdm }       HierarchicalSha256, 0x10000 blocks
│   └── section 1   RomFS  — { nextArgv, nextNroPath }     IVFC, 6 levels, 0x4000 blocks
├── <id>.nca        Control NCA  (content type 2)
│   └── section 0   RomFS  — { control.nacp, icon_AmericanEnglish.dat }
└── <id>.cnmt.nca   Meta NCA     (content type 1)
    └── section 0   PFS0   — { Application_<tid>.cnmt }     HierarchicalSha256, 0x1000 blocks
```

Each NCA's file name is the first 16 bytes of its SHA-256, in hex. Installers find content by that ID.

## PFS0 (`fs.js` → `buildPfs0`)

| Offset | Size | Field |
| --- | --- | --- |
| 0x00 | 4 | `PFS0` |
| 0x04 | 4 | file count |
| 0x08 | 4 | string table size (padded to 0x20) |
| 0x0C | 4 | reserved |
| 0x10 | 0x18 × n | entries: data offset (u64), size (u64), name offset (u32), reserved |
| … | | string table (NUL-terminated names), then file data back to back |

## HierarchicalSha256 (`pfs0HashLayer`)

A PFS0 section is `[hash table][padding][PFS0]`. The table holds the SHA-256 of every block of the PFS0 (the last block is hashed at its real length) and is padded up to 0x200 — hacBrewPack always adds padding, a full 0x200 when already aligned. The master hash in the FS header is SHA-256 of the table itself.

## RomFS (`buildRomfs`)

Forwarders only need a flat root directory:

| Offset | Content |
| --- | --- |
| 0x000 | 0x50-byte header: offsets and sizes of the tables below (u64 each), file data offset = 0x200 |
| 0x200 | file data, each file aligned to 0x10 |
| aligned to 4 | directory hash table (3 buckets) · directory table (root, 0x18 bytes) · file hash table · file table (0x20 + name, padded to 4) |

Files are sorted byte-wise. Bucket = `hash % count`, where the hash starts at `parent ^ 123456789` and folds in each name byte with a 5-bit rotate.

## IVFC (`ivfcLayer`)

Level 6 is the RomFS itself (padded to 0x4000). Levels 5 → 1 each hold the SHA-256 of every 0x4000-byte block of the level below, padded to 0x4000 (again, a whole extra block when already aligned — hacBrewPack behaviour). Level offsets are cumulative and the FS header's master hash is SHA-256 of level 1. Level 6's recorded size is the real RomFS size; levels 1–5 record their padded size.

## NCA header (`nca.js`)

0xC00 bytes, encrypted with **AES-128-XTS** using `header_key` (32 bytes: data key + tweak key) in 0x200-byte sectors. The tweak is the sector number **big-endian** — Nintendo's twist on standard XTS.

| Offset | Size | Field | Value used |
| --- | --- | --- | --- |
| 0x000 | 0x100 | Signature 1 (fixed key) | zero — only Nintendo can make this |
| 0x100 | 0x100 | Signature 2 (NPDM key) | RSA-2048-PSS over 0x200–0x3FF (program NCA only) |
| 0x200 | 4 | Magic | `NCA3` |
| 0x204 | 1 | Distribution | 0 (download) |
| 0x205 | 1 | Content type | 0 program · 1 meta · 2 control |
| 0x206 | 1 | Key generation (old) | 0 |
| 0x207 | 1 | Key area index | 0 (application) |
| 0x208 | 8 | NCA size | |
| 0x210 | 8 | Title ID | |
| 0x21C | 4 | SDK version | `0x000C1100` |
| 0x220 | 1 | Key generation | 0 |
| 0x240 | 0x10 × 4 | Section table | start/end in 0x200 units, flag byte = 1 |
| 0x280 | 0x20 × 4 | FS header hashes | SHA-256 of each FS header |
| 0x300 | 0x40 | Key area | slot 2 = `04 × 16`, ECB-encrypted with `key_area_key_application_00` when available |
| 0x400 | 0x200 × 4 | FS headers | version 2, FS type, hash type, encryption type **1 (none)**, then the hash superblock |

### Why only `header_key` is needed

Sections are stored **plaintext** (encryption type 1). The key area is still filled in for form's sake, but nothing reads it. That's the trick that lets on-console generators work without full keys, and it's why Aether Lab only insists on `header_key`.

### Signature 2

Each build generates a fresh RSA-2048 key pair with WebCrypto. The public modulus is written into `main.npdm` at **ACID + 0x100**, and the program NCA header (0x200–0x3FF, after the key area is final) is signed with RSA-PSS, SHA-256, 32-byte salt. Signature 1 can't be valid without Nintendo's private key, which is why sigpatches are required.

## NPDM (`meta.js` → `patchNpdm`)

The template `main.npdm` gets two changes, the same two hacBrewPack makes: the program ID at **ACI0 + 0x10** becomes the title ID, and the ACID public key is replaced (see above).

## NACP (`buildNacp`)

0x4000 bytes. Defaults follow switch-tools' `nacptool` as used by switch-nsp-forwarder: title and publisher in the first 12 language slots, supported-language flags `0xBFF`, rating table, save-data sizes, `LogoType 2` / `LogoHandling 1` (no logo section). The title ID goes into PresenceGroupId, SaveDataOwnerId, all eight LocalCommunicationIds, and `+0x1000` into AddOnContentBaseId. StartupUserAccount is 0 unless "ask for a user profile" is on.

## CNMT (`buildCnmt`)

| Offset | Content |
| --- | --- |
| 0x00 | title ID (u64), version (u32), type `0x80` (Application), extended header size 0x10, content count 2, meta count 0 |
| 0x20 | extended header: patch title ID = title ID + 0x800, required system version 0 |
| 0x30 | content records, 0x38 each: SHA-256 (0x20), content ID (0x10 = first half of the hash), size (6 bytes), type (1 program, 3 control), ID offset |
| end | 0x20-byte digest (zero) |

## Launch target (program RomFS)

| File | Content |
| --- | --- |
| `nextNroPath` | `sdmc:/retroarch/cores/snes9x_libretro_libnx.nro` |
| `nextArgv` | `sdmc:/retroarch/cores/snes9x_libretro_libnx.nro "sdmc:/roms/snes/My Hack.sfc"` |

The forwarder ExeFS reads both and chain-loads the NRO with that argument string.

## Verification

`VF.forwarder.verify()` re-parses the finished NSP: decrypts every NCA header, checks magic, size, title ID, FS-header hashes, master hashes, the NCA-ID ↔ SHA-256 relationship, the CNMT records and signature 2. The test suite does the same with an independent reader. During development the output was also parsed with [nsz](https://github.com/nicoboss/nsz) using throwaway keys, and every hash and the signature were re-checked with Python's hashlib and `cryptography`.
