/*
 * Aether Lab — NACP / NPDM / CNMT / NRO metadata
 *  NACP: the title name, publisher, version and IDs shown on HOME
 *  NPDM: the forwarder's process metadata (we set its program ID)
 *  CNMT: the content list that tells the installer what's in the NSP
 *  NRO:  read title/author/icon from a homebrew .nro's ASET section
 */
(function (VF) {
  'use strict';

  const B = VF.bytes;

  /* ---------------- NACP ---------------- */
  function putString(u8, off, max, str, label) {
    const bytes = B.utf8(str);
    if (bytes.length >= max) throw new Error(label + ' is too long (max ' + (max - 1) + ' bytes)');
    u8.fill(0, off, off + max);
    u8.set(bytes, off);
  }

  /**
   * Defaults follow switch-tools' nacptool (as used by the proven
   * nsp-forwarder generators): rating table, save sizes, logo flags.
   */
  function buildNacp(o) {
    const u8 = new Uint8Array(0x4000);
    const v = new DataView(u8.buffer);
    v.setUint32(0x3024, 0x100, true);
    v.setUint32(0x302c, 0xbff, true); // supported languages
    v.setUint32(0x3034, 0x10000, true);
    u8.set([0x0c, 0xff, 0xff, 0x0a, 0xff, 0x0c, 0x0c, 0x0c, 0x0c, 0x0c, 0x0d, 0x0d, 0xff, 0xff, 0xff, 0xff,
      0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff], 0x3040);
    v.setUint32(0x3080, 0x3e00000, true);
    v.setUint32(0x3088, 0x180000, true);
    v.setUint32(0x30f0, 0x102, true); // LogoType 2, LogoHandling 1 (no logo section)

    for (let i = 0; i < 12; i++) {
      putString(u8, i * 0x300, 0x200, o.title, 'Title');
      putString(u8, i * 0x300 + 0x200, 0x100, o.publisher, 'Publisher');
    }
    putString(u8, 0x3060, 0x10, o.version || '1.0.0', 'Version');
    u8[0x3025] = o.profileSelect ? 1 : 0; // StartupUserAccount
    const id = o.titleId;
    v.setBigUint64(0x3038, id, true); // PresenceGroupId
    v.setBigUint64(0x3070, id + 0x1000n, true); // AddOnContentBaseId
    v.setBigUint64(0x3078, id, true); // SaveDataOwnerId
    for (let x = 0; x < 8; x++) v.setBigUint64(0x30b0 + x * 8, id, true); // LocalCommunicationId
    return u8;
  }

  /* ---------------- NPDM ---------------- */
  function patchNpdm(template, titleId, modulus) {
    const u8 = template.slice();
    const v = new DataView(u8.buffer);
    if (B.ascii(u8, 0, 4) !== 'META') throw new Error('Forwarder template main.npdm is invalid');
    const aci0 = v.getUint32(0x70, true);
    const acid = v.getUint32(0x78, true);
    if (B.ascii(u8, aci0, 4) !== 'ACI0' || B.ascii(u8, acid + 0x200, 4) !== 'ACID') throw new Error('Forwarder template main.npdm is damaged');
    v.setBigUint64(aci0 + 0x10, titleId, true);
    if (modulus) {
      if (modulus.length !== 0x100) throw new Error('RSA modulus must be 256 bytes');
      u8.set(modulus, acid + 0x100);
    }
    return u8;
  }

  /* ---------------- CNMT ---------------- */
  /** records: [{ hash (32 bytes), size, type }]  type 1 = Program, 3 = Control */
  function buildCnmt(titleId, records) {
    const u8 = new Uint8Array(0x20 + 0x10 + records.length * 0x38 + 0x20);
    const v = new DataView(u8.buffer);
    v.setBigUint64(0, titleId, true);
    v.setUint32(8, 0, true); // version
    u8[0x0c] = 0x80; // Application
    v.setUint16(0x0e, 0x10, true); // extended header size
    v.setUint16(0x10, records.length, true);
    v.setUint16(0x12, 0, true);
    v.setBigUint64(0x20, titleId + 0x800n, true); // patch (update) title ID
    records.forEach((r, i) => {
      const o = 0x30 + i * 0x38;
      u8.set(r.hash, o);
      u8.set(r.hash.subarray(0, 16), o + 0x20);
      let s = r.size;
      for (let k = 0; k < 6; k++) {
        u8[o + 0x30 + k] = s % 256;
        s = Math.floor(s / 256);
      }
      u8[o + 0x36] = r.type;
      u8[o + 0x37] = 0;
    });
    return u8;
  }

  /* ---------------- NRO (homebrew) ---------------- */
  /** Pull name/author/version/icon from a homebrew .nro, if it has an ASET. */
  function readNro(u8) {
    if (u8.length < 0x80 || B.ascii(u8, 0x10, 4) !== 'NRO0') throw new Error('That isn’t a homebrew .nro file');
    const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const size = v.getUint32(0x18, true);
    const info = { size };
    if (size + 0x38 <= u8.length && B.ascii(u8, size, 4) === 'ASET') {
      const sec = (i) => {
        const off = Number(v.getBigUint64(size + 8 + i * 16, true));
        const len = Number(v.getBigUint64(size + 16 + i * 16, true));
        return len && size + off + len <= u8.length ? u8.subarray(size + off, size + off + len) : null;
      };
      info.icon = sec(0);
      const nacp = sec(1);
      if (nacp && nacp.length >= 0x3070) {
        for (let i = 0; i < 16; i++) {
          const name = VF.bytes.text(nacp.subarray(i * 0x300, i * 0x300 + 0x200)).replace(/\0[\s\S]*$/, '');
          if (name) {
            info.title = name;
            info.publisher = VF.bytes.text(nacp.subarray(i * 0x300 + 0x200, i * 0x300 + 0x300)).replace(/\0[\s\S]*$/, '');
            break;
          }
        }
        info.version = B.ascii(nacp, 0x3060, 0x10);
      }
    }
    return info;
  }

  VF.switchmeta = { buildNacp, patchNpdm, buildCnmt, readNro };
})((globalThis.VF = globalThis.VF || {}));
