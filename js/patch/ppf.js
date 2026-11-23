/*
 * Aether Lab — PPF (PlayStation Patch Format) v1 / v2 / v3
 * Used for PS1 (and some PS2) disc image hacks. Applies straight to the
 * .bin / .iso. PPF2/3 can carry a 1 KB "block check" copied from the
 * original disc so we can warn when the image doesn't match.
 */
(function (VF) {
  'use strict';

  const { Reader } = VF.bytes;
  const { PatchError, startsWith } = VF.patch;

  /** Byte-level search (text decoding would shift offsets on binary data). */
  function lastIndexOfAscii(u8, str, from) {
    outer: for (let i = u8.length - str.length; i >= from; i--) {
      for (let j = 0; j < str.length; j++) if (u8[i + j] !== str.charCodeAt(j)) continue outer;
      return i;
    }
    return -1;
  }

  function parse(u8) {
    if (!startsWith(u8, 'PPF')) throw new PatchError('Not a PPF patch');
    const verStr = String.fromCharCode(u8[3], u8[4]);
    const version = { '10': 1, '20': 2, '30': 3 }[verStr];
    if (!version || u8[5] !== version - 1) throw new PatchError('Unknown PPF version "' + verStr + '"');
    const description = VF.bytes.printable(u8, 6, 50);
    const r = new Reader(u8, 56);
    let imageType = 0;
    let blockCheck = null;
    let undo = false;
    let inputSize = null;
    if (version === 3) {
      imageType = r.byte();
      const hasBlock = r.byte();
      undo = r.byte() === 1;
      r.byte();
      if (hasBlock) blockCheck = r.bytes(1024);
    } else if (version === 2) {
      inputSize = r.u32le();
      blockCheck = r.bytes(1024);
    }

    // file_id.diz trailer: find where the records stop.
    let end = u8.length;
    let diz = null;
    const beginAt = lastIndexOfAscii(u8, '@BEGIN_FILE_ID.DIZ', Math.max(r.pos, u8.length - 4200));
    if (beginAt >= 0) {
      end = beginAt;
      const stop = lastIndexOfAscii(u8, '@END_FILE_ID.DIZ', beginAt);
      diz = VF.bytes.printable(u8, beginAt + 18, (stop > 0 ? stop : u8.length) - beginAt - 18);
    }

    const records = [];
    while (r.pos < end) {
      const offset = version === 3 ? r.u64le() : r.u32le();
      const len = r.byte();
      const data = r.bytes(len);
      if (undo) r.bytes(len);
      records.push({ offset, data });
    }
    return { version, description, imageType, blockCheck, undo, inputSize, records, diz };
  }

  function inspect(u8) {
    const p = parse(u8);
    const rows = [
      ['Format', 'PPF v' + p.version],
      ['Description', p.description || '—'],
      ['Records', String(p.records.length)],
    ];
    if (p.version === 3) rows.push(['Image type', p.imageType === 1 ? 'GI (PrimoDVD)' : 'BIN / ISO']);
    if (p.inputSize !== null) rows.push(['Expected image size', VF.bytes.formatSize(p.inputSize)]);
    rows.push(['Block check', p.blockCheck ? 'Yes' : 'No']);
    if (p.undo) rows.push(['Undo data', 'Included']);
    if (p.diz) rows.push(['FILE_ID.DIZ', p.diz.slice(0, 400)]);
    return { rows };
  }

  function apply(rom, u8, opts) {
    const p = parse(u8);
    const checks = [];
    const force = opts && opts.ignoreChecksums;
    if (p.inputSize !== null) {
      const ok = rom.length === p.inputSize;
      checks.push({ label: 'Image size', ok, detail: ok ? 'matches' : 'expected ' + p.inputSize + ' bytes, got ' + rom.length });
      if (!ok && !force) throw new PatchError('This PPF expects a disc image of exactly ' + p.inputSize + ' bytes, but yours is ' + rom.length + '. Make sure you’re using the same dump (bin vs iso matters).', 'size');
    }
    if (p.blockCheck) {
      const at = p.version === 3 && p.imageType === 1 ? 0x80a0 : 0x9320;
      const actual = rom.subarray(at, at + 1024);
      const ok = actual.length === 1024 && VF.bytes.equal(actual, p.blockCheck);
      checks.push({ label: 'Disc block check', ok, detail: ok ? 'matches the original disc' : 'does not match' });
      if (!ok && !force) throw new PatchError('Disc block check failed — this image isn’t the one the PPF was made for (different region/revision, or a .iso where a .bin was expected).', 'block');
    }
    let size = rom.length;
    for (const rec of p.records) size = Math.max(size, rec.offset + rec.data.length);
    const out = new Uint8Array(size);
    out.set(rom);
    for (const rec of p.records) out.set(rec.data, rec.offset);
    checks.push({ label: 'Records', ok: true, detail: p.records.length + ' applied' });
    return { output: out, checks };
  }

  VF.patch.register({
    id: 'ppf',
    name: 'PPF',
    ext: 'ppf',
    detect: (u8) => startsWith(u8, 'PPF') && (startsWith(u8.subarray(3), '10') || startsWith(u8.subarray(3), '20') || startsWith(u8.subarray(3), '30')),
    inspect,
    apply,
  });
})((globalThis.VF = globalThis.VF || {}));
