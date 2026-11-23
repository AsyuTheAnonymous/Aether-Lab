/*
 * Aether Lab — NCA3 builder
 * Builds Program / Control / Meta NCAs the way hacBrewPack does with
 * --plaintext --nologo: sections stay unencrypted (so only header_key is
 * needed), the 0xC00-byte header is AES-XTS encrypted with header_key.
 */
(function (VF) {
  'use strict';

  const B = VF.bytes;
  const FS = VF.switchfs;
  const SDK_VERSION = 0x000c1100;
  const CONTENT = { program: 0, meta: 1, control: 2 };

  /**
   * sections: [{ type: 'pfs0', layer } | { type: 'romfs', layer }]
   * keys: { headerKey, keyAreaKeyApp0 }
   * sign: optional async (Uint8Array 0x200) => Uint8Array 0x100  (NCA sig #2)
   */
  async function build({ contentType, titleId, sections, keys, sign }) {
    const header = new Uint8Array(0xc00);
    const hv = new DataView(header.buffer);
    const parts = [];
    let offset = 0xc00;

    sections.forEach((s, i) => {
      const start = offset;
      parts.push(s.layer.section);
      offset += s.layer.section.length;
      if (offset % 0x200) {
        const pad = 0x200 - (offset % 0x200);
        parts.push(new Uint8Array(pad));
        offset += pad;
      }
      // section table entry
      FS.le32(hv, 0x240 + i * 0x10, start / 0x200);
      FS.le32(hv, 0x244 + i * 0x10, offset / 0x200);
      header[0x248 + i * 0x10] = 1;

      // FS header
      const fh = 0x400 + i * 0x200;
      FS.le32(hv, fh, 2); // version (u16) — upper bytes stay 0 for the next fields set below
      header[fh + 2] = s.type === 'pfs0' ? 1 : 0; // fs type
      header[fh + 3] = s.type === 'pfs0' ? 2 : 3; // hash type
      header[fh + 4] = 1; // encryption: none (plaintext)
      if (s.type === 'pfs0') {
        const L = s.layer;
        header.set(L.masterHash, fh + 0x08);
        FS.le32(hv, fh + 0x28, L.blockSize);
        FS.le32(hv, fh + 0x2c, 2);
        FS.le64(hv, fh + 0x30, 0);
        FS.le64(hv, fh + 0x38, L.tableSize);
        FS.le64(hv, fh + 0x40, L.pfs0Offset);
        FS.le64(hv, fh + 0x48, L.pfs0Size);
      } else {
        const L = s.layer;
        header.set(B.utf8('IVFC'), fh + 0x08);
        FS.le32(hv, fh + 0x0c, 0x20000);
        FS.le32(hv, fh + 0x10, 0x20);
        FS.le32(hv, fh + 0x14, 7);
        for (let j = 0; j < 6; j++) {
          const lo = fh + 0x18 + j * 0x18;
          FS.le64(hv, lo, L.offsets[j]);
          FS.le64(hv, lo + 8, L.sizes[j]);
          FS.le32(hv, lo + 0x10, 0x0e); // log2(0x4000)
        }
        header.set(L.masterHash, fh + 0xc8);
      }
      header.set(VF.hash.sha256(header.subarray(fh, fh + 0x200)), 0x280 + i * 0x20);
    });

    header.set(B.utf8('NCA3'), 0x200);
    header[0x204] = 0; // distribution: download
    header[0x205] = CONTENT[contentType];
    header[0x206] = 0; // key generation (old) — master key 0
    header[0x207] = 0; // key area: application
    FS.le64(hv, 0x208, offset); // total NCA size
    hv.setBigUint64(0x210, titleId, true);
    FS.le32(hv, 0x21c, SDK_VERSION);
    header[0x220] = 0; // key generation

    // Key area: slot 2 is the (unused, since plaintext) section key.
    const keyArea = new Uint8Array(0x40);
    keyArea.fill(4, 0x20, 0x30);
    header.set(keys.keyAreaKeyApp0 ? VF.aes.ecbEncrypt(keys.keyAreaKeyApp0, keyArea) : keyArea, 0x300);

    if (sign) header.set(await sign(header.slice(0x200, 0x400)), 0x100);

    const encHeader = VF.aes.xtsEncrypt(keys.headerKey, header, 0, 0x200);
    const nca = B.concat([encHeader].concat(parts));
    const hash = VF.hash.sha256(nca);
    return { data: nca, hash, id: B.hex(hash.subarray(0, 16)), size: nca.length };
  }

  /** Decrypt + sanity-check an NCA header (used to self-verify output). */
  function inspect(nca, headerKey) {
    const h = VF.aes.xtsDecrypt(headerKey, nca.subarray(0, 0xc00), 0, 0x200);
    const v = new DataView(h.buffer);
    const magic = B.ascii(h, 0x200, 4);
    const size = v.getUint32(0x208, true) + v.getUint32(0x20c, true) * 0x100000000;
    const sections = [];
    for (let i = 0; i < 4; i++) {
      const s = v.getUint32(0x240 + i * 0x10, true);
      const e = v.getUint32(0x244 + i * 0x10, true);
      if (!e) continue;
      const fh = h.subarray(0x400 + i * 0x200, 0x600 + i * 0x200);
      const hashOk = B.equal(VF.hash.sha256(fh), h.subarray(0x280 + i * 0x20, 0x2a0 + i * 0x20));
      sections.push({ start: s * 0x200, end: e * 0x200, hashOk, fsType: fh[2], cryptType: fh[4] });
    }
    return { magic, size, titleId: v.getBigUint64(0x210, true), contentType: h[0x205], sections, header: h };
  }

  VF.nca = { build, inspect };
})((globalThis.VF = globalThis.VF || {}));
