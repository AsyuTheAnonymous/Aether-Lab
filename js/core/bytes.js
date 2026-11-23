/*
 * Aether Lab — byte helpers
 * Small, dependency-free helpers shared by every module.
 * Every file in this project attaches itself to one global namespace (VF)
 * so the app also works when opened straight from disk (file://).
 */
(function (VF) {
  'use strict';

  const B = (VF.bytes = {});
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  /** Always hand back a Uint8Array view, whatever we were given. */
  B.u8 = function (x) {
    if (x instanceof Uint8Array) return x;
    if (x instanceof ArrayBuffer) return new Uint8Array(x);
    if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    throw new TypeError('Expected binary data');
  };

  B.concat = function (parts) {
    let total = 0;
    for (const p of parts) total += p.length;
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  };

  B.utf8 = (s) => enc.encode(s);
  B.text = (u8) => dec.decode(u8);

  /** Read a NUL-terminated / padded ASCII string. */
  B.ascii = function (u8, off, len) {
    let s = '';
    for (let i = 0; i < len; i++) {
      const c = u8[off + i];
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  };

  /** Printable-only version (for ROM headers that contain junk bytes). */
  B.printable = function (u8, off, len) {
    let s = '';
    for (let i = 0; i < len; i++) {
      const c = u8[off + i];
      if (c === 0) break;
      s += c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : ' ';
    }
    return s.trim();
  };

  B.hex = function (u8) {
    let s = '';
    for (let i = 0; i < u8.length; i++) s += u8[i].toString(16).padStart(2, '0');
    return s;
  };

  B.fromHex = function (str) {
    const clean = str.replace(/[^0-9a-fA-F]/g, '');
    if (clean.length % 2) throw new Error('Hex string has an odd length');
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
    return out;
  };

  B.hex32 = (n) => (n >>> 0).toString(16).padStart(8, '0');

  B.equal = function (a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };

  B.align = (n, a) => Math.ceil(n / a) * a;

  B.isZero = function (u8) {
    for (let i = 0; i < u8.length; i++) if (u8[i] !== 0) return false;
    return true;
  };

  B.formatSize = function (n) {
    if (n < 1024) return n + ' B';
    const units = ['KB', 'MB', 'GB'];
    let v = n;
    let u = -1;
    do {
      v /= 1024;
      u++;
    } while (v >= 1024 && u < units.length - 1);
    return v.toFixed(v < 10 ? 2 : 1) + ' ' + units[u];
  };

  /**
   * Growable write buffer used by the patch creators and NSP builder.
   */
  class Writer {
    constructor(initial) {
      this.buf = new Uint8Array(initial || 0x10000);
      this.pos = 0;
    }
    ensure(n) {
      if (this.pos + n <= this.buf.length) return;
      let size = this.buf.length * 2;
      while (size < this.pos + n) size *= 2;
      const next = new Uint8Array(size);
      next.set(this.buf.subarray(0, this.pos));
      this.buf = next;
    }
    u8(v) {
      this.ensure(1);
      this.buf[this.pos++] = v & 0xff;
    }
    u16le(v) {
      this.u8(v);
      this.u8(v >>> 8);
    }
    u16be(v) {
      this.u8(v >>> 8);
      this.u8(v);
    }
    u24be(v) {
      this.u8(v >>> 16);
      this.u8(v >>> 8);
      this.u8(v);
    }
    u32le(v) {
      this.u16le(v & 0xffff);
      this.u16le(v >>> 16);
    }
    u32be(v) {
      this.u16be(v >>> 16);
      this.u16be(v & 0xffff);
    }
    bytes(arr) {
      this.ensure(arr.length);
      this.buf.set(arr, this.pos);
      this.pos += arr.length;
    }
    ascii(s) {
      for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i));
    }
    /** Variable-length integer used by BPS and UPS. */
    vlv(n) {
      // Numbers here may exceed 2^32, so stay in float math.
      for (;;) {
        const x = n % 128;
        n = Math.floor(n / 128);
        if (n === 0) {
          this.u8(0x80 | x);
          break;
        }
        this.u8(x);
        n--;
      }
    }
    result() {
      return this.buf.slice(0, this.pos);
    }
  }
  B.Writer = Writer;

  /**
   * Sequential reader with bounds checking so a corrupt patch throws a clear
   * error instead of silently producing garbage.
   */
  class Reader {
    constructor(u8, offset) {
      this.u8 = u8;
      this.pos = offset || 0;
    }
    get eof() {
      return this.pos >= this.u8.length;
    }
    need(n) {
      if (this.pos + n > this.u8.length) throw new Error('Patch file ended unexpectedly (truncated or corrupt)');
    }
    byte() {
      this.need(1);
      return this.u8[this.pos++];
    }
    u16le() {
      this.need(2);
      const v = this.u8[this.pos] | (this.u8[this.pos + 1] << 8);
      this.pos += 2;
      return v;
    }
    u16be() {
      this.need(2);
      const v = (this.u8[this.pos] << 8) | this.u8[this.pos + 1];
      this.pos += 2;
      return v;
    }
    u24be() {
      this.need(3);
      const v = (this.u8[this.pos] << 16) | (this.u8[this.pos + 1] << 8) | this.u8[this.pos + 2];
      this.pos += 3;
      return v;
    }
    u32le() {
      this.need(4);
      const p = this.pos;
      const v = (this.u8[p] | (this.u8[p + 1] << 8) | (this.u8[p + 2] << 16) | (this.u8[p + 3] << 24)) >>> 0;
      this.pos += 4;
      return v;
    }
    u32be() {
      this.need(4);
      const p = this.pos;
      const v = ((this.u8[p] << 24) | (this.u8[p + 1] << 16) | (this.u8[p + 2] << 8) | this.u8[p + 3]) >>> 0;
      this.pos += 4;
      return v;
    }
    u64le() {
      const lo = this.u32le();
      const hi = this.u32le();
      return hi * 0x100000000 + lo;
    }
    bytes(n) {
      this.need(n);
      const out = this.u8.subarray(this.pos, this.pos + n);
      this.pos += n;
      return out;
    }
    ascii(n) {
      const b = this.bytes(n);
      return B.ascii(b, 0, n);
    }
    /** BPS/UPS variable-length integer. */
    vlv() {
      let data = 0;
      let shift = 1;
      for (;;) {
        const x = this.byte();
        data += (x & 0x7f) * shift;
        if (x & 0x80) break;
        shift *= 128;
        data += shift;
        if (shift > 2 ** 53) throw new Error('Corrupt variable-length number in patch');
      }
      return data;
    }
  }
  B.Reader = Reader;
})((globalThis.VF = globalThis.VF || {}));
