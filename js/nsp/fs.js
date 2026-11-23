/*
 * Aether Lab — Switch filesystem containers
 * PFS0 (ExeFS, CNMT section, the NSP itself), RomFS, and the hash
 * layers NCAs wrap them in (HierarchicalSha256 for PFS0, IVFC for RomFS).
 * Layout decisions mirror hacBrewPack byte-for-byte, because that is what
 * console firmware and installers have been accepting for years.
 */
(function (VF) {
  'use strict';

  const B = VF.bytes;
  const sha256 = VF.hash.sha256;

  function le32(view, o, v) {
    view.setUint32(o, v >>> 0, true);
  }
  function le64(view, o, v) {
    view.setUint32(o, v % 0x100000000, true);
    view.setUint32(o + 4, Math.floor(v / 0x100000000), true);
  }

  /**
   * PFS0: header, file entries, string table (padded to 0x20), file data.
   * files: [{ name, data }] in the order they should appear.
   */
  function buildPfs0(files) {
    const names = files.map((f) => B.utf8(f.name));
    let strSize = names.reduce((n, s) => n + s.length + 1, 0);
    strSize = (strSize + 0x1f) & ~0x1f;
    const headerSize = 0x10 + files.length * 0x18 + strSize;
    const dataSize = files.reduce((n, f) => n + f.data.length, 0);
    const out = new Uint8Array(headerSize + dataSize);
    const v = new DataView(out.buffer);
    out.set(B.utf8('PFS0'), 0);
    le32(v, 4, files.length);
    le32(v, 8, strSize);
    let dataOff = 0;
    let strOff = 0;
    files.forEach((f, i) => {
      const e = 0x10 + i * 0x18;
      le64(v, e, dataOff);
      le64(v, e + 8, f.data.length);
      le32(v, e + 0x10, strOff);
      out.set(names[i], 0x10 + files.length * 0x18 + strOff);
      strOff += names[i].length + 1;
      out.set(f.data, headerSize + dataOff);
      dataOff += f.data.length;
    });
    return out;
  }

  /**
   * HierarchicalSha256 for a PFS0 section:
   * SHA-256 of each block (last block hashed at its real length), table
   * padded up to 0x200 (hacBrewPack always adds padding, even when aligned).
   */
  function pfs0HashLayer(pfs0, blockSize) {
    const count = Math.ceil(pfs0.length / blockSize);
    const tableSize = count * 0x20;
    const pad = 0x200 - (tableSize % 0x200);
    const pfs0Offset = tableSize + pad;
    const section = new Uint8Array(pfs0Offset + pfs0.length);
    for (let i = 0; i < count; i++) {
      section.set(sha256(pfs0.subarray(i * blockSize, Math.min(pfs0.length, (i + 1) * blockSize))), i * 0x20);
    }
    section.set(pfs0, pfs0Offset);
    const masterHash = sha256(section.subarray(0, tableSize));
    return { section, masterHash, tableSize, pfs0Offset, pfs0Size: pfs0.length, blockSize };
  }

  /* ---------------- RomFS ---------------- */
  const EMPTY = 0xffffffff;

  function pathHash(parent, nameBytes) {
    let h = (parent ^ 123456789) >>> 0;
    for (let i = 0; i < nameBytes.length; i++) {
      h = ((h >>> 5) | (h << 27)) >>> 0;
      h = (h ^ nameBytes[i]) >>> 0;
    }
    return h;
  }

  function hashTableCount(n) {
    if (n < 3) return 3;
    if (n < 19) return n | 1;
    let c = n;
    while (c % 2 === 0 || c % 3 === 0 || c % 5 === 0 || c % 7 === 0 || c % 11 === 0 || c % 13 === 0 || c % 17 === 0) c++;
    return c;
  }

  /** Byte-wise strcmp, matching the C ordering hacBrewPack uses. */
  function cmpBytes(a, b) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
  }

  /**
   * Flat RomFS (root directory only — all forwarder needs).
   * files: [{ name, data }]
   */
  function buildRomfs(files) {
    const list = files.map((f) => ({ name: B.utf8(f.name), data: f.data })).sort((a, b) => cmpBytes(a.name, b.name));
    const DATA_OFS = 0x200;
    let partition = 0;
    let entryOff = 0;
    for (const f of list) {
      partition = B.align(partition, 0x10);
      f.offset = partition;
      partition += f.data.length;
      f.entry = entryOff;
      entryOff += 0x20 + B.align(f.name.length, 4);
    }
    const fileTableSize = entryOff;
    const dirTableSize = 0x18;
    const dirHashCount = hashTableCount(1);
    const fileHashCount = hashTableCount(list.length);
    const dirHashOfs = B.align(partition + DATA_OFS, 4);
    const dirTableOfs = dirHashOfs + dirHashCount * 4;
    const fileHashOfs = dirTableOfs + dirTableSize;
    const fileTableOfs = fileHashOfs + fileHashCount * 4;
    const total = fileTableOfs + fileTableSize;

    const out = new Uint8Array(total);
    const v = new DataView(out.buffer);
    // header
    le64(v, 0x00, 0x50);
    le64(v, 0x08, dirHashOfs);
    le64(v, 0x10, dirHashCount * 4);
    le64(v, 0x18, dirTableOfs);
    le64(v, 0x20, dirTableSize);
    le64(v, 0x28, fileHashOfs);
    le64(v, 0x30, fileHashCount * 4);
    le64(v, 0x38, fileTableOfs);
    le64(v, 0x40, fileTableSize);
    le64(v, 0x48, DATA_OFS);
    for (const f of list) out.set(f.data, DATA_OFS + f.offset);

    const dirHash = new Uint32Array(dirHashCount).fill(EMPTY);
    const fileHash = new Uint32Array(fileHashCount).fill(EMPTY);

    // files
    list.forEach((f, i) => {
      const e = fileTableOfs + f.entry;
      le32(v, e, 0); // parent = root
      le32(v, e + 4, i + 1 < list.length ? list[i + 1].entry : EMPTY);
      le64(v, e + 8, f.offset);
      le64(v, e + 0x10, f.data.length);
      const bucket = pathHash(0, f.name) % fileHashCount;
      le32(v, e + 0x18, fileHash[bucket]);
      fileHash[bucket] = f.entry;
      le32(v, e + 0x1c, f.name.length);
      out.set(f.name, e + 0x20);
    });
    // root directory
    {
      const e = dirTableOfs;
      le32(v, e, 0);
      le32(v, e + 4, EMPTY);
      le32(v, e + 8, EMPTY);
      le32(v, e + 0xc, list.length ? list[0].entry : EMPTY);
      const bucket = pathHash(0, new Uint8Array(0)) % dirHashCount;
      le32(v, e + 0x10, dirHash[bucket]);
      dirHash[bucket] = 0;
      le32(v, e + 0x14, 0);
    }
    for (let i = 0; i < dirHashCount; i++) le32(v, dirHashOfs + i * 4, dirHash[i]);
    for (let i = 0; i < fileHashCount; i++) le32(v, fileHashOfs + i * 4, fileHash[i]);
    return out;
  }

  /**
   * IVFC (HierarchicalIntegrity) — 6 levels, 0x4000-byte blocks.
   * Level 6 is the RomFS; each level above holds SHA-256 of the level
   * below. Every level is padded to 0x4000 (hacBrewPack pads a whole extra
   * block when already aligned; replicated here on purpose).
   */
  const IVFC_BLOCK = 0x4000;
  function padTo(u8, block) {
    const padded = new Uint8Array(u8.length + (block - (u8.length % block)));
    padded.set(u8);
    return padded;
  }

  function ivfcLayer(romfs) {
    const levels = new Array(6);
    const sizes = new Array(6);
    sizes[5] = romfs.length; // real size, not padded
    levels[5] = padTo(romfs, IVFC_BLOCK);
    for (let i = 4; i >= 0; i--) {
      const src = levels[i + 1];
      const n = Math.ceil(src.length / IVFC_BLOCK);
      const hashes = new Uint8Array(n * 0x20);
      for (let b = 0; b < n; b++) hashes.set(sha256(src.subarray(b * IVFC_BLOCK, Math.min(src.length, (b + 1) * IVFC_BLOCK))), b * 0x20);
      levels[i] = padTo(hashes, IVFC_BLOCK);
      sizes[i] = levels[i].length;
    }
    const offsets = new Array(6);
    offsets[0] = 0;
    for (let i = 1; i < 6; i++) offsets[i] = offsets[i - 1] + sizes[i - 1];
    const masterHash = sha256(levels[0]);
    return { section: B.concat(levels), masterHash, offsets, sizes };
  }

  VF.switchfs = { buildPfs0, pfs0HashLayer, buildRomfs, ivfcLayer, pathHash, hashTableCount, le32, le64 };
})((globalThis.VF = globalThis.VF || {}));
