/*
 * Aether Lab — AES-128 (ECB + XTS with Nintendo's big-endian sector tweak)
 * Only ever used on tiny buffers (the 0xC00-byte NCA header and the
 * 0x40-byte key area), so a clear byte-oriented implementation is plenty.
 */
(function (VF) {
  'use strict';

  const SBOX = new Uint8Array(256);
  const INV = new Uint8Array(256);
  (function build() {
    // Generate the S-box from GF(2^8) inverses + affine transform.
    let p = 1, q = 1;
    do {
      p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
      q ^= q << 1;
      q ^= q << 2;
      q ^= q << 4;
      q &= 0xff;
      if (q & 0x80) q ^= 0x09;
      const x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4));
      SBOX[p] = (x ^ 0x63) & 0xff;
    } while (p !== 1);
    SBOX[0] = 0x63;
    for (let i = 0; i < 256; i++) INV[SBOX[i]] = i;
  })();

  const xt = (b) => ((b << 1) ^ (b & 0x80 ? 0x1b : 0)) & 0xff;
  const mul = (a, b) => {
    let r = 0;
    while (b) {
      if (b & 1) r ^= a;
      a = xt(a);
      b >>= 1;
    }
    return r;
  };

  function expandKey(key) {
    const w = new Uint8Array(176);
    w.set(key);
    let rcon = 1;
    for (let i = 16; i < 176; i += 4) {
      let t0 = w[i - 4], t1 = w[i - 3], t2 = w[i - 2], t3 = w[i - 1];
      if (i % 16 === 0) {
        const tmp = t0;
        t0 = SBOX[t1] ^ rcon;
        t1 = SBOX[t2];
        t2 = SBOX[t3];
        t3 = SBOX[tmp];
        rcon = xt(rcon);
      }
      w[i] = w[i - 16] ^ t0;
      w[i + 1] = w[i - 15] ^ t1;
      w[i + 2] = w[i - 14] ^ t2;
      w[i + 3] = w[i - 13] ^ t3;
    }
    return w;
  }

  class Aes128 {
    constructor(key) {
      if (key.length !== 16) throw new Error('AES-128 needs a 16-byte key');
      this.rk = expandKey(key);
    }
    encryptBlock(inp, out) {
      const s = new Uint8Array(16);
      const rk = this.rk;
      for (let i = 0; i < 16; i++) s[i] = inp[i] ^ rk[i];
      for (let round = 1; round <= 10; round++) {
        for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]];
        // ShiftRows (state is column-major)
        let t = s[1]; s[1] = s[5]; s[5] = s[9]; s[9] = s[13]; s[13] = t;
        t = s[2]; s[2] = s[10]; s[10] = t; t = s[6]; s[6] = s[14]; s[14] = t;
        t = s[15]; s[15] = s[11]; s[11] = s[7]; s[7] = s[3]; s[3] = t;
        if (round !== 10) {
          for (let c = 0; c < 16; c += 4) {
            const a0 = s[c], a1 = s[c + 1], a2 = s[c + 2], a3 = s[c + 3];
            const all = a0 ^ a1 ^ a2 ^ a3;
            s[c] ^= all ^ xt(a0 ^ a1);
            s[c + 1] ^= all ^ xt(a1 ^ a2);
            s[c + 2] ^= all ^ xt(a2 ^ a3);
            s[c + 3] ^= all ^ xt(a3 ^ a0);
          }
        }
        const o = round * 16;
        for (let i = 0; i < 16; i++) s[i] ^= rk[o + i];
      }
      out.set(s);
    }
    decryptBlock(inp, out) {
      const s = new Uint8Array(16);
      const rk = this.rk;
      for (let i = 0; i < 16; i++) s[i] = inp[i] ^ rk[160 + i];
      for (let round = 9; round >= 0; round--) {
        let t = s[13]; s[13] = s[9]; s[9] = s[5]; s[5] = s[1]; s[1] = t;
        t = s[2]; s[2] = s[10]; s[10] = t; t = s[6]; s[6] = s[14]; s[14] = t;
        t = s[3]; s[3] = s[7]; s[7] = s[11]; s[11] = s[15]; s[15] = t;
        for (let i = 0; i < 16; i++) s[i] = INV[s[i]];
        const o = round * 16;
        for (let i = 0; i < 16; i++) s[i] ^= rk[o + i];
        if (round !== 0) {
          for (let c = 0; c < 16; c += 4) {
            const a0 = s[c], a1 = s[c + 1], a2 = s[c + 2], a3 = s[c + 3];
            s[c] = mul(a0, 14) ^ mul(a1, 11) ^ mul(a2, 13) ^ mul(a3, 9);
            s[c + 1] = mul(a0, 9) ^ mul(a1, 14) ^ mul(a2, 11) ^ mul(a3, 13);
            s[c + 2] = mul(a0, 13) ^ mul(a1, 9) ^ mul(a2, 14) ^ mul(a3, 11);
            s[c + 3] = mul(a0, 11) ^ mul(a1, 13) ^ mul(a2, 9) ^ mul(a3, 14);
          }
        }
      }
      out.set(s);
    }
  }

  function ecb(key, data, decrypt) {
    if (data.length % 16) throw new Error('ECB data must be a multiple of 16 bytes');
    const aes = new Aes128(key);
    const out = new Uint8Array(data.length);
    const blk = new Uint8Array(16);
    for (let i = 0; i < data.length; i += 16) {
      if (decrypt) aes.decryptBlock(data.subarray(i, i + 16), blk);
      else aes.encryptBlock(data.subarray(i, i + 16), blk);
      out.set(blk, i);
    }
    return out;
  }

  /**
   * AES-128-XTS as used for NCA headers: 32-byte key (data key + tweak
   * key), tweak = sector number encoded BIG-endian (Nintendo quirk).
   */
  function xts(key32, data, sector, sectorSize, decrypt) {
    if (key32.length !== 32) throw new Error('XTS needs a 32-byte key');
    if (data.length % sectorSize) throw new Error('XTS data must be whole sectors');
    const k1 = new Aes128(key32.subarray(0, 16));
    const k2 = new Aes128(key32.subarray(16, 32));
    const out = new Uint8Array(data.length);
    const T = new Uint8Array(16);
    const x = new Uint8Array(16);
    const y = new Uint8Array(16);
    for (let base = 0; base < data.length; base += sectorSize, sector++) {
      const tw = new Uint8Array(16);
      let s = sector;
      for (let i = 15; i >= 8; i--) {
        tw[i] = s & 0xff;
        s = Math.floor(s / 256);
      }
      k2.encryptBlock(tw, T);
      for (let o = base; o < base + sectorSize; o += 16) {
        for (let i = 0; i < 16; i++) x[i] = data[o + i] ^ T[i];
        if (decrypt) k1.decryptBlock(x, y);
        else k1.encryptBlock(x, y);
        for (let i = 0; i < 16; i++) out[o + i] = y[i] ^ T[i];
        // T *= alpha in GF(2^128), little-endian byte order
        const carry = T[15] >> 7;
        for (let i = 15; i > 0; i--) T[i] = ((T[i] << 1) | (T[i - 1] >> 7)) & 0xff;
        T[0] = (T[0] << 1) & 0xff;
        if (carry) T[0] ^= 0x87;
      }
    }
    return out;
  }

  VF.aes = {
    Aes128,
    ecbEncrypt: (k, d) => ecb(k, d, false),
    ecbDecrypt: (k, d) => ecb(k, d, true),
    xtsEncrypt: (k, d, sector, size) => xts(k, d, sector || 0, size || 0x200, false),
    xtsDecrypt: (k, d, sector, size) => xts(k, d, sector || 0, size || 0x200, true),
  };
})((globalThis.VF = globalThis.VF || {}));
