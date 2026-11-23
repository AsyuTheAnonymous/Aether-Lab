/*
 * Aether Lab — UPS
 * "UPS1", vlv source size, vlv target size, then XOR runs addressed by
 * relative skips, then source/target/patch CRC32 footer.
 * UPS is reversible: feed it the patched ROM and you get the original back.
 */
(function (VF) {
  'use strict';

  const { Reader, Writer } = VF.bytes;
  const { PatchError, startsWith } = VF.patch;
  const crc32 = VF.hash.crc32;

  function parse(u8) {
    if (!startsWith(u8, 'UPS1')) throw new PatchError('Not a UPS patch');
    if (u8.length < 18) throw new PatchError('UPS patch is too small to be valid');
    const r = new Reader(u8, 4);
    const sourceSize = r.vlv();
    const targetSize = r.vlv();
    const bodyStart = r.pos;
    const f = new Reader(u8, u8.length - 12);
    return {
      sourceSize,
      targetSize,
      bodyStart,
      sourceCrc: f.u32le(),
      targetCrc: f.u32le(),
      patchCrc: f.u32le(),
      actualPatchCrc: crc32(u8, 0, u8.length - 4),
    };
  }

  function inspect(u8) {
    const p = parse(u8);
    return {
      rows: [
        ['Format', 'UPS'],
        ['Source size', VF.bytes.formatSize(p.sourceSize)],
        ['Target size', VF.bytes.formatSize(p.targetSize)],
        ['Source CRC32', VF.bytes.hex32(p.sourceCrc)],
        ['Target CRC32', VF.bytes.hex32(p.targetCrc)],
        ['Patch integrity', p.actualPatchCrc === p.patchCrc ? 'OK' : 'DAMAGED'],
      ],
      expectedSourceCrc: p.sourceCrc,
      expectedSourceSize: p.sourceSize,
    };
  }

  function apply(rom, u8, opts) {
    const p = parse(u8);
    const checks = [];
    checks.push({ label: 'Patch integrity', ok: p.actualPatchCrc === p.patchCrc, detail: 'CRC32 ' + VF.bytes.hex32(p.actualPatchCrc) });
    const inCrc = crc32(rom);
    let outSize;
    let expectOut;
    let direction = 'forward';
    if (inCrc === p.sourceCrc) {
      outSize = p.targetSize;
      expectOut = p.targetCrc;
      checks.push({ label: 'Source ROM', ok: true, detail: 'CRC32 ' + VF.bytes.hex32(inCrc) + ' matches' });
    } else if (inCrc === p.targetCrc) {
      outSize = p.sourceSize;
      expectOut = p.sourceCrc;
      direction = 'reverse';
      checks.push({ label: 'Source ROM', ok: true, detail: 'This is the already-patched ROM — un-patching it' });
    } else {
      if (!(opts && opts.ignoreChecksums)) {
        throw new PatchError('Wrong source ROM. This UPS expects CRC32 ' + VF.bytes.hex32(p.sourceCrc) + ' but your ROM is ' + VF.bytes.hex32(inCrc) + '.', 'source-crc');
      }
      outSize = rom.length === p.sourceSize ? p.targetSize : p.sourceSize;
      expectOut = p.targetCrc;
      checks.push({ label: 'Source ROM', ok: false, detail: 'CRC32 mismatch (forced)' });
    }

    const out = new Uint8Array(outSize);
    out.set(rom.subarray(0, Math.min(rom.length, outSize)));
    const r = new Reader(u8, p.bodyStart);
    const end = u8.length - 12;
    let pos = 0;
    while (r.pos < end) {
      pos += r.vlv();
      for (;;) {
        if (r.pos >= end) throw new PatchError('UPS patch body is corrupt');
        const x = r.u8[r.pos++];
        if (x === 0) {
          pos++;
          break;
        }
        if (pos < outSize) out[pos] = (pos < rom.length ? rom[pos] : 0) ^ x;
        pos++;
      }
    }
    const outCrc = crc32(out);
    checks.push({ label: 'Output ROM', ok: outCrc === expectOut, detail: 'CRC32 ' + VF.bytes.hex32(outCrc) + (outCrc === expectOut ? ' matches' : ' ≠ expected ' + VF.bytes.hex32(expectOut)) });
    return { output: out, checks, direction };
  }

  function create(src, tgt) {
    const w = new Writer(0x10000);
    w.ascii('UPS1');
    w.vlv(src.length);
    w.vlv(tgt.length);
    const max = Math.max(src.length, tgt.length);
    const at = (a, i) => (i < a.length ? a[i] : 0);
    let relative = 0;
    let i = 0;
    while (i < max) {
      let x = at(src, i);
      let y = at(tgt, i);
      if (x === y) {
        i++;
        continue;
      }
      w.vlv(i - relative);
      while (i < max && x !== y) {
        w.u8(x ^ y);
        i++;
        x = at(src, i);
        y = at(tgt, i);
      }
      w.u8(0);
      i++;
      relative = i;
    }
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
    id: 'ups',
    name: 'UPS',
    ext: 'ups',
    blurb: 'Checksummed and reversible. Popular for GBA hacks.',
    detect: (u8) => startsWith(u8, 'UPS1'),
    inspect,
    apply,
    create,
  });
})((globalThis.VF = globalThis.VF || {}));
