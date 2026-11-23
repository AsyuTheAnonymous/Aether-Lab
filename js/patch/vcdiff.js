/*
 * Aether Lab — xdelta / VCDIFF (RFC 3284) decoder
 * Handles what xdelta3 and Delta Patcher produce by default: source
 * windows, the default code table, the xdelta3 application header and the
 * per-window Adler-32 checksum. Patches built with secondary compression
 * (xdelta3 -S djw / lzma / fgk) are detected and reported clearly.
 */
(function (VF) {
  'use strict';

  const { Reader } = VF.bytes;
  const { PatchError } = VF.patch;

  const VCD_DECOMPRESS = 0x01;
  const VCD_CODETABLE = 0x02;
  const VCD_APPHEADER = 0x04;
  const VCD_SOURCE = 0x01;
  const VCD_TARGET = 0x02;
  const VCD_ADLER32 = 0x04;
  const NOOP = 0, ADD = 1, RUN = 2, COPY = 3;
  const SECONDARY = { 1: 'DJW', 2: 'LZMA', 16: 'FGK' };

  /** RFC 3284 §5.6 default instruction code table. */
  const TABLE = (function () {
    const t = [];
    const e = (t1, s1, m1, t2, s2, m2) => t.push([t1, s1, m1, t2 || NOOP, s2 || 0, m2 || 0]);
    e(RUN, 0, 0);
    e(ADD, 0, 0);
    for (let s = 1; s <= 17; s++) e(ADD, s, 0);
    for (let m = 0; m < 9; m++) {
      e(COPY, 0, m);
      for (let s = 4; s <= 18; s++) e(COPY, s, m);
    }
    for (let m = 0; m < 6; m++) for (let a = 1; a <= 4; a++) for (let c = 4; c <= 6; c++) e(ADD, a, 0, COPY, c, m);
    for (let m = 6; m < 9; m++) for (let a = 1; a <= 4; a++) e(ADD, a, 0, COPY, 4, m);
    for (let m = 0; m < 9; m++) e(COPY, 4, m, ADD, 1, 0);
    if (t.length !== 256) throw new Error('VCDIFF code table build error');
    return t;
  })();

  function varint(buf, cur) {
    let v = 0;
    for (let i = 0; i < 9; i++) {
      if (cur.p >= buf.length) throw new PatchError('xdelta patch is truncated or corrupt');
      const b = buf[cur.p++];
      v = v * 128 + (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
    throw new PatchError('xdelta patch has an invalid number encoding');
  }

  function readHeader(u8) {
    if (u8.length < 5 || u8[0] !== 0xd6 || u8[1] !== 0xc3 || u8[2] !== 0xc4) throw new PatchError('Not an xdelta/VCDIFF patch');
    const r = new Reader(u8, 4);
    const ind = r.byte();
    const cur = { p: 5 };
    let secondary = null;
    let appHeader = '';
    if (ind & VCD_DECOMPRESS) {
      secondary = u8[cur.p++];
    }
    if (ind & VCD_CODETABLE) throw new PatchError('This xdelta patch uses a custom code table, which isn’t supported.', 'unsupported');
    if (ind & VCD_APPHEADER) {
      const len = varint(u8, cur);
      appHeader = VF.bytes.printable(u8, cur.p, len);
      cur.p += len;
    }
    return { secondary, appHeader, bodyStart: cur.p };
  }

  /** Output that grows by windows; also supports reads for VCD_TARGET. */
  class Chunks {
    constructor() {
      this.parts = [];
      this.size = 0;
    }
    push(u8) {
      this.parts.push(u8);
      this.size += u8.length;
    }
    slice(pos, len) {
      const out = new Uint8Array(len);
      let base = 0;
      let o = 0;
      for (const p of this.parts) {
        if (o >= len) break;
        const end = base + p.length;
        if (end > pos + o) {
          const from = pos + o - base;
          const take = Math.min(p.length - from, len - o);
          out.set(p.subarray(from, from + take), o);
          o += take;
        }
        base = end;
      }
      if (o < len) throw new PatchError('xdelta target window points past the decoded output');
      return out;
    }
    join() {
      return VF.bytes.concat(this.parts);
    }
  }

  function apply(rom, u8, opts) {
    const h = readHeader(u8);
    const force = opts && opts.ignoreChecksums;
    const checks = [];
    const out = new Chunks();
    const cur = { p: h.bodyStart };
    let windows = 0;
    let badAdler = 0;
    let sawAdler = false;
    let sourceUsedEnd = 0;

    while (cur.p < u8.length) {
      const winInd = u8[cur.p++];
      let segLen = 0;
      let seg = null;
      if (winInd & (VCD_SOURCE | VCD_TARGET)) {
        segLen = varint(u8, cur);
        const segPos = varint(u8, cur);
        if (winInd & VCD_SOURCE) {
          if (segPos + segLen > rom.length) {
            throw new PatchError('This xdelta patch reads past the end of your ROM (needs at least ' + VF.bytes.formatSize(segPos + segLen) + '). Wrong source file?', 'source-size');
          }
          seg = rom.subarray(segPos, segPos + segLen);
          sourceUsedEnd = Math.max(sourceUsedEnd, segPos + segLen);
        } else {
          seg = out.slice(segPos, segLen);
        }
      }
      varint(u8, cur); // length of the delta encoding (not needed)
      const winLen = varint(u8, cur);
      const deltaInd = u8[cur.p++];
      const dataLen = varint(u8, cur);
      const instLen = varint(u8, cur);
      const addrLen = varint(u8, cur);
      let adler = null;
      if (winInd & VCD_ADLER32) {
        adler = ((u8[cur.p] << 24) | (u8[cur.p + 1] << 16) | (u8[cur.p + 2] << 8) | u8[cur.p + 3]) >>> 0;
        cur.p += 4;
        sawAdler = true;
      }
      if (deltaInd) {
        const name = SECONDARY[h.secondary] || 'secondary';
        throw new PatchError('This xdelta patch was made with ' + name + ' secondary compression, which browsers can’t decode here. Ask for a patch made with “xdelta3 -S none”, or apply it with xdelta3 / Delta Patcher on a PC.', 'unsupported');
      }
      if (cur.p + dataLen + instLen + addrLen > u8.length) throw new PatchError('xdelta patch is truncated');
      const data = u8.subarray(cur.p, cur.p + dataLen);
      cur.p += dataLen;
      const inst = u8.subarray(cur.p, cur.p + instLen);
      cur.p += instLen;
      const addr = u8.subarray(cur.p, cur.p + addrLen);
      cur.p += addrLen;

      const win = new Uint8Array(winLen);
      const near = [0, 0, 0, 0];
      let nextSlot = 0;
      const same = new Int32Array(3 * 256);
      const dc = { p: 0 };
      const ic = { p: 0 };
      const ac = { p: 0 };
      let t = 0;

      const decodeAddr = (here, mode) => {
        let a;
        if (mode === 0) a = varint(addr, ac);
        else if (mode === 1) a = here - varint(addr, ac);
        else if (mode < 6) a = near[mode - 2] + varint(addr, ac);
        else {
          if (ac.p >= addr.length) throw new PatchError('xdelta address section is truncated');
          a = same[(mode - 6) * 256 + addr[ac.p++]];
        }
        near[nextSlot] = a;
        nextSlot = (nextSlot + 1) & 3;
        same[a % 768] = a;
        return a;
      };

      while (ic.p < inst.length) {
        const entry = TABLE[inst[ic.p++]];
        for (let half = 0; half < 2; half++) {
          const type = entry[half * 3];
          if (type === NOOP) continue;
          let size = entry[half * 3 + 1];
          if (size === 0) size = varint(inst, ic);
          if (t + size > winLen) throw new PatchError('xdelta instruction overflows its window — corrupt patch');
          if (type === ADD) {
            if (dc.p + size > data.length) throw new PatchError('xdelta data section is truncated');
            win.set(data.subarray(dc.p, dc.p + size), t);
            dc.p += size;
            t += size;
          } else if (type === RUN) {
            win.fill(data[dc.p++], t, t + size);
            t += size;
          } else {
            const a = decodeAddr(segLen + t, entry[half * 3 + 2]);
            if (a + size <= segLen) {
              win.set(seg.subarray(a, a + size), t);
              t += size;
            } else if (a >= segLen && a - segLen + size <= t) {
              win.copyWithin(t, a - segLen, a - segLen + size);
              t += size;
            } else {
              for (let k = 0; k < size; k++) {
                const idx = a + k;
                win[t++] = idx < segLen ? seg[idx] : win[idx - segLen];
              }
            }
          }
        }
      }
      if (t !== winLen) throw new PatchError('xdelta window decoded to the wrong size — corrupt patch');
      if (adler !== null && VF.hash.adler32(win, 0, winLen) !== adler) badAdler++;
      out.push(win);
      windows++;
    }

    if (sawAdler) {
      checks.push({ label: 'Window checksums', ok: badAdler === 0, detail: badAdler ? badAdler + ' of ' + windows + ' windows failed Adler-32' : windows + ' window(s) verified (Adler-32)' });
      if (badAdler && !force) {
        throw new PatchError('xdelta checksum failed — the output doesn’t match what the patch author produced. This almost always means the wrong source ROM/ISO.', 'source-crc');
      }
    } else {
      checks.push({ label: 'Window checksums', ok: true, detail: 'Patch has no checksums (made with -n)' });
    }
    if (h.appHeader) checks.push({ label: 'Made from', ok: true, detail: h.appHeader });
    return { output: out.join(), checks };
  }

  VF.patch.register({
    id: 'xdelta',
    name: 'xdelta (VCDIFF)',
    ext: 'xdelta',
    detect: (u8) => u8.length > 4 && u8[0] === 0xd6 && u8[1] === 0xc3 && u8[2] === 0xc4,
    inspect(u8) {
      const h = readHeader(u8);
      const rows = [['Format', 'xdelta3 / VCDIFF']];
      if (h.appHeader) rows.push(['Source / target names', h.appHeader]);
      if (h.secondary !== null) rows.push(['Secondary compression', (SECONDARY[h.secondary] || 'id ' + h.secondary) + ' (declared)']);
      rows.push(['Checksums', 'Per-window Adler-32 (checked while patching)']);
      return { rows };
    },
    apply,
  });
})((globalThis.VF = globalThis.VF || {}));
