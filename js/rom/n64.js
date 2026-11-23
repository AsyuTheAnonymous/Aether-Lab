/*
 * Aether Lab — Nintendo 64 helpers
 * Byte order (.z64 big-endian / .v64 byte-swapped / .n64 word-swapped)
 * and the boot CRC that the CIC chip checks on real hardware.
 * The CRC algorithm follows Parasyte's n64crc.c.
 */
(function (VF) {
  'use strict';

  const N = (VF.n64 = {});

  /** Detect byte order from the first word of the header. */
  N.order = function (u8) {
    if (u8.length < 4) return null;
    const w = ((u8[0] << 24) | (u8[1] << 16) | (u8[2] << 8) | u8[3]) >>> 0;
    if (w === 0x80371240) return 'z64';
    if (w === 0x37804012) return 'v64';
    if (w === 0x40123780) return 'n64';
    return null;
  };

  /** Return a big-endian (.z64) copy of any N64 ROM. */
  N.toZ64 = function (u8) {
    const order = N.order(u8);
    const out = u8.slice();
    if (order === 'v64') {
      for (let i = 0; i + 1 < out.length; i += 2) {
        out[i] = u8[i + 1];
        out[i + 1] = u8[i];
      }
    } else if (order === 'n64') {
      for (let i = 0; i + 3 < out.length; i += 4) {
        out[i] = u8[i + 3];
        out[i + 1] = u8[i + 2];
        out[i + 2] = u8[i + 1];
        out[i + 3] = u8[i];
      }
    }
    return out;
  };

  /** Convert a .z64 buffer to the requested order. */
  N.fromZ64 = function (z, order) {
    if (order === 'z64') return z;
    const fake = z.slice();
    // swapping is its own inverse for both layouts
    if (order === 'v64') {
      for (let i = 0; i + 1 < fake.length; i += 2) {
        fake[i] = z[i + 1];
        fake[i + 1] = z[i];
      }
    } else if (order === 'n64') {
      for (let i = 0; i + 3 < fake.length; i += 4) {
        fake[i] = z[i + 3];
        fake[i + 1] = z[i + 2];
        fake[i + 2] = z[i + 1];
        fake[i + 3] = z[i];
      }
    }
    return fake;
  };

  const CIC = {
    0x6170a4a1: 6101,
    0x90bb6cb5: 6102,
    0x0b050ee0: 6103,
    0x98bc2c86: 6105,
    0xacc8580a: 6106,
  };
  const SEED = { 6101: 0xf8ca4ddc, 6102: 0xf8ca4ddc, 6103: 0xa3886759, 6105: 0xdf26f436, 6106: 0x1fea617a };
  const START = 0x1000;
  const LENGTH = 0x100000;

  /** Identify the CIC from the boot code (expects .z64 order). */
  N.cic = function (z) {
    if (z.length < 0x1000) return 0;
    return CIC[VF.hash.crc32(z, 0x40, 0x1000)] || 0;
  };

  const word = (z, i) => ((z[i] << 24) | (z[i + 1] << 16) | (z[i + 2] << 8) | z[i + 3]) >>> 0;

  /** Compute [crc1, crc2] or null if the CIC is unknown / ROM too small. */
  N.calcCrc = function (z) {
    const cic = N.cic(z);
    if (!cic || z.length < START + LENGTH) return null;
    const seed = SEED[cic];
    let t1 = seed, t2 = seed, t3 = seed, t4 = seed, t5 = seed, t6 = seed;
    for (let i = START; i < START + LENGTH; i += 4) {
      const d = word(z, i);
      const sum = (t6 + d) >>> 0;
      if (sum < t6) t4 = (t4 + 1) >>> 0;
      t6 = sum;
      t3 = (t3 ^ d) >>> 0;
      const s = d & 0x1f;
      const r = s ? ((d << s) | (d >>> (32 - s))) >>> 0 : d;
      t5 = (t5 + r) >>> 0;
      if (t2 > d) t2 = (t2 ^ r) >>> 0;
      else t2 = (t2 ^ t6 ^ d) >>> 0;
      if (cic === 6105) t1 = (t1 + (word(z, 0x40 + 0x0710 + (i & 0xff)) ^ d)) >>> 0;
      else t1 = (t1 + (t5 ^ d)) >>> 0;
    }
    let c1, c2;
    if (cic === 6103) {
      c1 = ((t6 ^ t4) + t3) >>> 0;
      c2 = ((t5 ^ t2) + t1) >>> 0;
    } else if (cic === 6106) {
      c1 = (Math.imul(t6, t4) + t3) >>> 0;
      c2 = (Math.imul(t5, t2) + t1) >>> 0;
    } else {
      c1 = (t6 ^ t4 ^ t3) >>> 0;
      c2 = (t5 ^ t2 ^ t1) >>> 0;
    }
    return { cic, crc1: c1, crc2: c2 };
  };

  N.headerCrc = (z) => ({ crc1: word(z, 0x10), crc2: word(z, 0x14) });

  /** Write freshly computed CRCs into a .z64 buffer (in place). */
  N.fixCrc = function (z) {
    const c = N.calcCrc(z);
    if (!c) return null;
    const put = (o, v) => {
      z[o] = v >>> 24; z[o + 1] = v >>> 16; z[o + 2] = v >>> 8; z[o + 3] = v;
    };
    put(0x10, c.crc1);
    put(0x14, c.crc2);
    return c;
  };
})((globalThis.VF = globalThis.VF || {}));
