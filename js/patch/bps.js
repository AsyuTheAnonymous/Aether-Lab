/*
 * Aether Lab — BPS (beat patch system)
 * "BPS1", vlv source/target/metadata sizes, metadata, then actions:
 *   0 SourceRead  — copy from the source ROM at the same offset
 *   1 TargetRead  — literal bytes from the patch
 *   2 SourceCopy  — copy from anywhere in the source (relative pointer)
 *   3 TargetCopy  — copy from earlier output (relative pointer, may overlap)
 * Footer: source CRC32, target CRC32, patch CRC32.
 */
(function (VF) {
  'use strict';

  const { Reader, Writer } = VF.bytes;
  const { PatchError, startsWith } = VF.patch;
  const crc32 = VF.hash.crc32;

  function parse(u8) {
    if (!startsWith(u8, 'BPS1')) throw new PatchError('Not a BPS patch');
    if (u8.length < 19) throw new PatchError('BPS patch is too small to be valid');
    const r = new Reader(u8, 4);
    const sourceSize = r.vlv();
    const targetSize = r.vlv();
    const metaSize = r.vlv();
    const metadata = metaSize ? VF.bytes.text(r.bytes(metaSize)) : '';
    const bodyStart = r.pos;
    const f = new Reader(u8, u8.length - 12);
    return {
      sourceSize,
      targetSize,
      metadata,
      bodyStart,
      sourceCrc: f.u32le(),
      targetCrc: f.u32le(),
      patchCrc: f.u32le(),
      actualPatchCrc: crc32(u8, 0, u8.length - 4),
    };
  }

  function inspect(u8) {
    const p = parse(u8);
    const rows = [
      ['Format', 'BPS'],
      ['Source size', VF.bytes.formatSize(p.sourceSize)],
      ['Target size', VF.bytes.formatSize(p.targetSize)],
      ['Source CRC32', VF.bytes.hex32(p.sourceCrc)],
      ['Target CRC32', VF.bytes.hex32(p.targetCrc)],
      ['Patch integrity', p.actualPatchCrc === p.patchCrc ? 'OK' : 'DAMAGED'],
    ];
    if (p.metadata) rows.push(['Metadata', p.metadata.length > 300 ? p.metadata.slice(0, 300) + '…' : p.metadata]);
    return { rows, expectedSourceCrc: p.sourceCrc, expectedSourceSize: p.sourceSize };
  }

  function apply(rom, u8, opts) {
    const p = parse(u8);
    const checks = [];
    const force = opts && opts.ignoreChecksums;
    checks.push({ label: 'Patch integrity', ok: p.actualPatchCrc === p.patchCrc, detail: 'CRC32 ' + VF.bytes.hex32(p.actualPatchCrc) });
    if (p.actualPatchCrc !== p.patchCrc && !force) throw new PatchError('This BPS file is damaged (its own checksum doesn’t match). Re-download it.', 'patch-crc');

    const inCrc = crc32(rom);
    const srcOk = inCrc === p.sourceCrc;
    if (!srcOk && !force) {
      throw new PatchError('Wrong source ROM. This BPS expects CRC32 ' + VF.bytes.hex32(p.sourceCrc) + ' (' + VF.bytes.formatSize(p.sourceSize) + ') but your ROM is ' + VF.bytes.hex32(inCrc) + ' (' + VF.bytes.formatSize(rom.length) + ').', 'source-crc');
    }
    checks.push({ label: 'Source ROM', ok: srcOk, detail: 'CRC32 ' + VF.bytes.hex32(inCrc) + (srcOk ? ' matches' : ' (forced)') });

    const out = new Uint8Array(p.targetSize);
    const r = new Reader(u8, p.bodyStart);
    const end = u8.length - 12;
    let outOff = 0;
    let srcRel = 0;
    let tgtRel = 0;
    const tooLong = () => new PatchError('BPS patch writes past the end of the target — corrupt patch');
    while (r.pos < end) {
      const data = r.vlv();
      const cmd = data % 4;
      const len = Math.floor(data / 4) + 1;
      if (outOff + len > p.targetSize) throw tooLong();
      if (cmd === 0) {
        const avail = Math.max(0, Math.min(len, rom.length - outOff));
        if (avail) out.set(rom.subarray(outOff, outOff + avail), outOff);
        outOff += len;
      } else if (cmd === 1) {
        out.set(r.bytes(len), outOff);
        outOff += len;
      } else if (cmd === 2) {
        const d = r.vlv();
        srcRel += (d % 2 ? -1 : 1) * Math.floor(d / 2);
        if (srcRel < 0 || srcRel + len > rom.length) throw new PatchError('BPS SourceCopy points outside the source ROM — wrong ROM or corrupt patch');
        out.set(rom.subarray(srcRel, srcRel + len), outOff);
        srcRel += len;
        outOff += len;
      } else {
        const d = r.vlv();
        tgtRel += (d % 2 ? -1 : 1) * Math.floor(d / 2);
        if (tgtRel < 0 || tgtRel >= outOff) throw new PatchError('BPS TargetCopy points outside the output — corrupt patch');
        for (let k = 0; k < len; k++) out[outOff++] = out[tgtRel++];
      }
    }
    const outCrc = crc32(out);
    checks.push({ label: 'Output ROM', ok: outCrc === p.targetCrc, detail: 'CRC32 ' + VF.bytes.hex32(outCrc) + (outCrc === p.targetCrc ? ' matches' : ' ≠ expected ' + VF.bytes.hex32(p.targetCrc)) });
    return { output: out, checks };
  }

  /* ------------------------------------------------------------------ *
   * Creator: greedy single-pass encoder with hashed SourceCopy and
   * TargetCopy matching. Not as small as Flips' suffix-array mode, but
   * handles moved/inserted data far better than a purely linear diff.
   * ------------------------------------------------------------------ */
  const KEY = 8; // bytes per hash key
  const MIN_COPY = 7; // copies shorter than this cost more than literals

  function makeHasher(bits) {
    const shift = 32 - bits;
    return function (a, i) {
      const x = a[i] | (a[i + 1] << 8) | (a[i + 2] << 16) | (a[i + 3] << 24);
      const y = a[i + 4] | (a[i + 5] << 8) | (a[i + 6] << 16) | (a[i + 7] << 24);
      return (Math.imul(x, 0x9e3779b1) ^ Math.imul(y ^ (y >>> 15), 0x85ebca77)) >>> shift;
    };
  }

  function create(src, tgt, opts) {
    const w = new Writer(Math.max(0x10000, tgt.length >>> 4));
    w.ascii('BPS1');
    w.vlv(src.length);
    w.vlv(tgt.length);
    const meta = opts && opts.metadata ? VF.bytes.utf8(opts.metadata) : new Uint8Array(0);
    w.vlv(meta.length);
    w.bytes(meta);

    const bits = Math.max(16, Math.min(24, Math.ceil(Math.log2(Math.max(src.length, tgt.length, 1))) + 1));
    const hash = makeHasher(bits);
    const srcTable = new Int32Array(1 << bits).fill(-1);
    for (let i = src.length - KEY; i >= 0; i--) srcTable[hash(src, i)] = i; // keep earliest match
    const tgtTable = new Int32Array(1 << bits).fill(-1);
    let tgtIndexed = 0;

    const n = tgt.length;
    const common = Math.min(src.length, n);
    let outOff = 0;
    let srcRel = 0;
    let tgtRel = 0;
    let literalStart = -1;

    const flush = () => {
      if (literalStart < 0) return;
      const len = outOff - literalStart;
      w.vlv((len - 1) * 4 + 1);
      w.bytes(tgt.subarray(literalStart, outOff));
      literalStart = -1;
    };
    const indexUpTo = (limit) => {
      for (; tgtIndexed + KEY <= n && tgtIndexed < limit; tgtIndexed++) tgtTable[hash(tgt, tgtIndexed)] = tgtIndexed;
    };
    const relative = (delta) => (delta < 0 ? -delta * 2 + 1 : delta * 2);

    while (outOff < n) {
      // 1) same-offset match (SourceRead)
      let readLen = 0;
      while (outOff + readLen < common && src[outOff + readLen] === tgt[outOff + readLen]) readLen++;

      let srcPos = -1, srcLen = 0, tgtPos = -1, tgtLen = 0;
      if (outOff + KEY <= n) {
        const h = hash(tgt, outOff);
        const c = srcTable[h];
        if (c >= 0) {
          let k = 0;
          while (c + k < src.length && outOff + k < n && src[c + k] === tgt[outOff + k]) k++;
          if (k >= MIN_COPY) { srcPos = c; srcLen = k; }
        }
        indexUpTo(outOff);
        const t = tgtTable[h];
        if (t >= 0 && t < outOff) {
          let k = 0;
          while (outOff + k < n && tgt[t + k] === tgt[outOff + k]) k++;
          if (k >= MIN_COPY) { tgtPos = t; tgtLen = k; }
        }
      }
      // runs of one byte: copy from the previous output byte
      if (outOff > 0 && tgt[outOff - 1] === tgt[outOff]) {
        let k = 0;
        while (outOff + k < n && tgt[outOff + k] === tgt[outOff - 1]) k++;
        if (k > tgtLen) { tgtLen = k; tgtPos = outOff - 1; }
      }

      const best = Math.max(srcLen, tgtLen);
      if (readLen >= 4 && readLen + 4 >= best) {
        flush();
        w.vlv((readLen - 1) * 4 + 0);
        outOff += readLen;
      } else if (best >= MIN_COPY || (tgtLen >= 4 && tgtPos === outOff - 1)) {
        flush();
        if (srcLen >= tgtLen) {
          w.vlv((srcLen - 1) * 4 + 2);
          w.vlv(relative(srcPos - srcRel));
          srcRel = srcPos + srcLen;
          outOff += srcLen;
        } else {
          w.vlv((tgtLen - 1) * 4 + 3);
          w.vlv(relative(tgtPos - tgtRel));
          tgtRel = tgtPos + tgtLen;
          outOff += tgtLen;
        }
      } else {
        if (literalStart < 0) literalStart = outOff;
        outOff++;
      }
    }
    flush();
    w.u32le(crc32(src));
    w.u32le(crc32(tgt));
    const body = w.result();
    const out = new Uint8Array(body.length + 4);
    out.set(body);
    const c = crc32(body);
    out[body.length] = c;
    out[body.length + 1] = c >>> 8;
    out[body.length + 2] = c >>> 16;
    out[body.length + 3] = c >>> 24;
    return out;
  }

  VF.patch.register({
    id: 'bps',
    name: 'BPS',
    ext: 'bps',
    blurb: 'The modern default. Checksummed, any size, handles moved data.',
    detect: (u8) => startsWith(u8, 'BPS1'),
    inspect,
    apply,
    create,
  });
})((globalThis.VF = globalThis.VF || {}));
