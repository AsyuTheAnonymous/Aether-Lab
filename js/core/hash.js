/*
 * Aether Lab — checksums and hashes
 * CRC32, CRC16, Adler-32, MD5, SHA-1, SHA-256 in plain JS so they work
 * offline, synchronously, and on any page (no secure-context requirement).
 * Each hasher is incremental: create(), update(bytes), digest().
 */
(function (VF) {
  'use strict';

  const H = (VF.hash = {});

  /* ---------------- CRC32 (IEEE, reflected 0xEDB88320) ---------------- */
  const CRC_TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    CRC_TABLE[n] = c >>> 0;
  }

  H.crc32 = function (u8, start, end, seed) {
    let crc = seed === undefined ? 0xffffffff : ~seed >>> 0;
    const s = start || 0;
    const e = end === undefined ? u8.length : end;
    for (let i = s; i < e; i++) crc = CRC_TABLE[(crc ^ u8[i]) & 0xff] ^ (crc >>> 8);
    return ~crc >>> 0;
  };

  H.Crc32 = class {
    constructor() {
      this.c = 0xffffffff;
    }
    update(u8) {
      let crc = this.c;
      for (let i = 0; i < u8.length; i++) crc = CRC_TABLE[(crc ^ u8[i]) & 0xff] ^ (crc >>> 8);
      this.c = crc;
    }
    digest() {
      return ~this.c >>> 0;
    }
  };

  /* ---------------- CRC16 variants ---------------- */
  /** CRC16/CCITT-FALSE — used by APS (GBA) block checks. */
  H.crc16ccitt = function (u8, off, len) {
    let crc = 0xffff;
    for (let i = off; i < off + len; i++) {
      crc ^= u8[i] << 8;
      for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc;
  };

  /** CRC16/MODBUS (reflected 0xA001) — used by the Nintendo DS header. */
  H.crc16modbus = function (u8, off, len) {
    let crc = 0xffff;
    for (let i = off; i < off + len; i++) {
      crc ^= u8[i];
      for (let j = 0; j < 8; j++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
    return crc & 0xffff;
  };

  /* ---------------- Adler-32 (xdelta3 window checksum) ---------------- */
  H.adler32 = function (u8, off, len) {
    let a = 1;
    let b = 0;
    const end = off + len;
    let i = off;
    while (i < end) {
      const chunkEnd = Math.min(i + 3800, end); // stay below overflow before modulo
      for (; i < chunkEnd; i++) {
        a += u8[i];
        b += a;
      }
      a %= 65521;
      b %= 65521;
    }
    return ((b << 16) | a) >>> 0;
  };

  /* ---------------- shared block-hash plumbing ---------------- */
  class BlockHasher {
    constructor() {
      this.block = new Uint8Array(64);
      this.blockLen = 0;
      this.total = 0;
    }
    update(u8) {
      let i = 0;
      const n = u8.length;
      this.total += n;
      if (this.blockLen) {
        while (this.blockLen < 64 && i < n) this.block[this.blockLen++] = u8[i++];
        if (this.blockLen === 64) {
          this.compress(this.block, 0);
          this.blockLen = 0;
        }
      }
      for (; i + 64 <= n; i += 64) this.compress(u8, i);
      while (i < n) this.block[this.blockLen++] = u8[i++];
    }
    pad(bigEndianLength) {
      const bits = this.total * 8;
      const tail = new Uint8Array(this.blockLen < 56 ? 64 : 128);
      tail.set(this.block.subarray(0, this.blockLen));
      tail[this.blockLen] = 0x80;
      const L = tail.length;
      const hi = Math.floor(bits / 0x100000000);
      const lo = bits >>> 0;
      if (bigEndianLength) {
        tail[L - 8] = hi >>> 24; tail[L - 7] = hi >>> 16; tail[L - 6] = hi >>> 8; tail[L - 5] = hi;
        tail[L - 4] = lo >>> 24; tail[L - 3] = lo >>> 16; tail[L - 2] = lo >>> 8; tail[L - 1] = lo;
      } else {
        tail[L - 8] = lo; tail[L - 7] = lo >>> 8; tail[L - 6] = lo >>> 16; tail[L - 5] = lo >>> 24;
        tail[L - 4] = hi; tail[L - 3] = hi >>> 8; tail[L - 2] = hi >>> 16; tail[L - 1] = hi >>> 24;
      }
      for (let o = 0; o < L; o += 64) this.compress(tail, o);
    }
  }

  /* ---------------- MD5 ---------------- */
  const MD5_K = new Int32Array(64);
  for (let i = 0; i < 64; i++) MD5_K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) | 0;
  const MD5_S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];

  H.Md5 = class extends BlockHasher {
    constructor() {
      super();
      this.h = new Int32Array([0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476]);
      this.w = new Int32Array(16);
    }
    compress(u8, o) {
      const w = this.w;
      for (let i = 0; i < 16; i++) {
        const p = o + i * 4;
        w[i] = u8[p] | (u8[p + 1] << 8) | (u8[p + 2] << 16) | (u8[p + 3] << 24);
      }
      let a = this.h[0], b = this.h[1], c = this.h[2], d = this.h[3];
      for (let i = 0; i < 64; i++) {
        let f, g;
        if (i < 16) { f = (b & c) | (~b & d); g = i; }
        else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) & 15; }
        else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) & 15; }
        else { f = c ^ (b | ~d); g = (7 * i) & 15; }
        const tmp = d;
        d = c;
        c = b;
        const x = (a + f + MD5_K[i] + w[g]) | 0;
        b = (b + ((x << MD5_S[i]) | (x >>> (32 - MD5_S[i])))) | 0;
        a = tmp;
      }
      this.h[0] = (this.h[0] + a) | 0;
      this.h[1] = (this.h[1] + b) | 0;
      this.h[2] = (this.h[2] + c) | 0;
      this.h[3] = (this.h[3] + d) | 0;
    }
    digest() {
      this.pad(false);
      const out = new Uint8Array(16);
      for (let i = 0; i < 4; i++) {
        const v = this.h[i];
        out[i * 4] = v; out[i * 4 + 1] = v >>> 8; out[i * 4 + 2] = v >>> 16; out[i * 4 + 3] = v >>> 24;
      }
      return out;
    }
  };

  /* ---------------- SHA-1 ---------------- */
  H.Sha1 = class extends BlockHasher {
    constructor() {
      super();
      this.h = new Int32Array([0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476, 0xc3d2e1f0 | 0]);
      this.w = new Int32Array(80);
    }
    compress(u8, o) {
      const w = this.w;
      for (let i = 0; i < 16; i++) {
        const p = o + i * 4;
        w[i] = (u8[p] << 24) | (u8[p + 1] << 16) | (u8[p + 2] << 8) | u8[p + 3];
      }
      for (let i = 16; i < 80; i++) {
        const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
        w[i] = (x << 1) | (x >>> 31);
      }
      let a = this.h[0], b = this.h[1], c = this.h[2], d = this.h[3], e = this.h[4];
      for (let i = 0; i < 80; i++) {
        let f, k;
        if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
        else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
        else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc | 0; }
        else { f = b ^ c ^ d; k = 0xca62c1d6 | 0; }
        const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) | 0;
        e = d;
        d = c;
        c = (b << 30) | (b >>> 2);
        b = a;
        a = t;
      }
      this.h[0] = (this.h[0] + a) | 0;
      this.h[1] = (this.h[1] + b) | 0;
      this.h[2] = (this.h[2] + c) | 0;
      this.h[3] = (this.h[3] + d) | 0;
      this.h[4] = (this.h[4] + e) | 0;
    }
    digest() {
      this.pad(true);
      const out = new Uint8Array(20);
      for (let i = 0; i < 5; i++) {
        const v = this.h[i];
        out[i * 4] = v >>> 24; out[i * 4 + 1] = v >>> 16; out[i * 4 + 2] = v >>> 8; out[i * 4 + 3] = v;
      }
      return out;
    }
  };

  /* ---------------- SHA-256 ---------------- */
  const K256 = new Int32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  H.Sha256 = class extends BlockHasher {
    constructor() {
      super();
      this.h = new Int32Array([0x6a09e667, 0xbb67ae85 | 0, 0x3c6ef372, 0xa54ff53a | 0, 0x510e527f, 0x9b05688c | 0, 0x1f83d9ab, 0x5be0cd19]);
      this.w = new Int32Array(64);
    }
    compress(u8, o) {
      const w = this.w;
      for (let i = 0; i < 16; i++) {
        const p = o + i * 4;
        w[i] = (u8[p] << 24) | (u8[p + 1] << 16) | (u8[p + 2] << 8) | u8[p + 3];
      }
      for (let i = 16; i < 64; i++) {
        const x = w[i - 15];
        const y = w[i - 2];
        const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let a = this.h[0], b = this.h[1], c = this.h[2], d = this.h[3];
      let e = this.h[4], f = this.h[5], g = this.h[6], h = this.h[7];
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K256[i] + w[i]) | 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h = g; g = f; f = e;
        e = (d + t1) | 0;
        d = c; c = b; b = a;
        a = (t1 + t2) | 0;
      }
      this.h[0] = (this.h[0] + a) | 0; this.h[1] = (this.h[1] + b) | 0;
      this.h[2] = (this.h[2] + c) | 0; this.h[3] = (this.h[3] + d) | 0;
      this.h[4] = (this.h[4] + e) | 0; this.h[5] = (this.h[5] + f) | 0;
      this.h[6] = (this.h[6] + g) | 0; this.h[7] = (this.h[7] + h) | 0;
    }
    digest() {
      this.pad(true);
      const out = new Uint8Array(32);
      for (let i = 0; i < 8; i++) {
        const v = this.h[i];
        out[i * 4] = v >>> 24; out[i * 4 + 1] = v >>> 16; out[i * 4 + 2] = v >>> 8; out[i * 4 + 3] = v;
      }
      return out;
    }
  };

  H.sha256 = function (u8) {
    const s = new H.Sha256();
    s.update(u8);
    return s.digest();
  };

  /**
   * Hash a whole file without freezing the page: works through it in
   * chunks and yields to the browser between them.
   * Returns { crc32, md5, sha1 } as lowercase hex strings.
   */
  H.fingerprint = async function (u8, onProgress) {
    const crc = new H.Crc32();
    const md5 = new H.Md5();
    const sha1 = new H.Sha1();
    const CHUNK = 4 * 1024 * 1024;
    for (let o = 0; o < u8.length; o += CHUNK) {
      const part = u8.subarray(o, Math.min(o + CHUNK, u8.length));
      crc.update(part);
      md5.update(part);
      sha1.update(part);
      if (onProgress) onProgress(Math.min(1, (o + CHUNK) / u8.length));
      await new Promise((r) => setTimeout(r, 0));
    }
    return {
      crc32: VF.bytes.hex32(crc.digest()),
      md5: VF.bytes.hex(md5.digest()),
      sha1: VF.bytes.hex(sha1.digest()),
    };
  };
})((globalThis.VF = globalThis.VF || {}));
