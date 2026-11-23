/*
 * Aether Lab — APS
 * Two unrelated formats share the name:
 *   APS10 — N64 patches (cart ID + CRC check, plain and RLE records)
 *   APS1  — GBA patches (64 KB XOR blocks, each with source/target CRC16)
 */
(function (VF) {
  'use strict';

  const { Reader } = VF.bytes;
  const { PatchError, startsWith } = VF.patch;
  const crc16 = VF.hash.crc16ccitt;

  /* ---------------- APS (N64) ---------------- */
  function parseN64(u8) {
    const r = new Reader(u8, 5);
    const headerType = r.byte();
    const encoding = r.byte();
    const description = VF.bytes.printable(u8, 7, 50);
    r.pos = 57;
    let n64 = null;
    if (headerType === 1) {
      n64 = { originalFormat: r.byte(), cartId: r.ascii(3), crc: r.bytes(8).slice() };
      r.bytes(5);
    }
    const outputSize = r.u32le();
    const records = [];
    while (!r.eof) {
      const offset = r.u32le();
      const len = r.byte();
      if (len === 0) records.push({ offset, rle: true, value: r.byte(), length: r.byte() });
      else records.push({ offset, rle: false, data: r.bytes(len) });
    }
    return { headerType, encoding, description, n64, outputSize, records };
  }

  VF.patch.register({
    id: 'aps-n64',
    name: 'APS (N64)',
    ext: 'aps',
    detect: (u8) => startsWith(u8, 'APS10'),
    inspect(u8) {
      const p = parseN64(u8);
      const rows = [
        ['Format', 'APS (N64)'],
        ['Description', p.description || '—'],
        ['Records', String(p.records.length)],
        ['Output size', VF.bytes.formatSize(p.outputSize)],
      ];
      if (p.n64) {
        rows.push(['Expected cart ID', p.n64.cartId]);
        rows.push(['Expected header CRC', VF.bytes.hex(p.n64.crc).toUpperCase()]);
        rows.push(['ROM byte order', p.n64.originalFormat === 0 ? '.v64 (byte-swapped)' : '.z64 (big-endian)']);
      }
      return { rows, n64Order: p.n64 ? (p.n64.originalFormat === 0 ? 'v64' : 'z64') : null };
    },
    apply(rom, u8, opts) {
      const p = parseN64(u8);
      const checks = [];
      if (p.n64) {
        const cart = VF.bytes.ascii(rom, 0x3c, 3);
        const crc = rom.subarray(0x10, 0x18);
        const ok = cart === p.n64.cartId && VF.bytes.equal(crc, p.n64.crc);
        checks.push({ label: 'N64 header', ok, detail: ok ? 'cart ' + cart + ' / CRC match' : 'expected ' + p.n64.cartId + ' ' + VF.bytes.hex(p.n64.crc).toUpperCase() + ', got ' + cart + ' ' + VF.bytes.hex(crc).toUpperCase() });
        if (!ok && !(opts && opts.ignoreChecksums)) {
          throw new PatchError('This APS patch was made for a different N64 ROM (cart ' + p.n64.cartId + '). Check region/revision and byte order.', 'source-crc');
        }
      }
      const out = new Uint8Array(p.outputSize);
      out.set(rom.subarray(0, Math.min(rom.length, p.outputSize)));
      for (const rec of p.records) {
        if (rec.rle) out.fill(rec.value, rec.offset, Math.min(p.outputSize, rec.offset + rec.length));
        else out.set(rec.data.subarray(0, Math.max(0, Math.min(rec.data.length, p.outputSize - rec.offset))), rec.offset);
      }
      checks.push({ label: 'Records', ok: true, detail: p.records.length + ' applied' });
      return { output: out, checks };
    },
  });

  /* ---------------- APS (GBA) ---------------- */
  const BLOCK = 0x10000;

  /** Block CRC16; a short final block is accepted hashed either as-is or zero-padded. */
  function blockMatches(data, offset, expected) {
    const part = data.subarray(offset, offset + BLOCK);
    if (crc16(part, 0, part.length) === expected) return true;
    if (part.length === BLOCK) return false;
    const padded = new Uint8Array(BLOCK);
    padded.set(part);
    return crc16(padded, 0, BLOCK) === expected;
  }

  function parseGba(u8) {
    if ((u8.length - 12) % (8 + BLOCK) !== 0) throw new PatchError('APS (GBA) patch has an unexpected size — it may be truncated');
    const r = new Reader(u8, 4);
    const sourceSize = r.u32le();
    const targetSize = r.u32le();
    const records = [];
    while (!r.eof) records.push({ offset: r.u32le(), srcCrc: r.u16le(), tgtCrc: r.u16le(), xor: r.bytes(BLOCK) });
    return { sourceSize, targetSize, records };
  }

  VF.patch.register({
    id: 'aps-gba',
    name: 'APS (GBA)',
    ext: 'aps',
    detect: (u8) => startsWith(u8, 'APS1') && !startsWith(u8, 'APS10'),
    inspect(u8) {
      const p = parseGba(u8);
      return {
        rows: [
          ['Format', 'APS (GBA)'],
          ['Source size', VF.bytes.formatSize(p.sourceSize)],
          ['Target size', VF.bytes.formatSize(p.targetSize)],
          ['64 KB blocks', String(p.records.length)],
        ],
        expectedSourceSize: p.sourceSize,
      };
    },
    apply(rom, u8, opts) {
      const p = parseGba(u8);
      const force = opts && opts.ignoreChecksums;
      const checks = [];
      const sizeOk = rom.length === p.sourceSize;
      checks.push({ label: 'Source size', ok: sizeOk, detail: sizeOk ? 'matches' : 'expected ' + p.sourceSize + ', got ' + rom.length });
      let badBlocks = 0;
      for (const rec of p.records) if (!blockMatches(rom, rec.offset, rec.srcCrc)) badBlocks++;
      checks.push({ label: 'Source blocks', ok: badBlocks === 0, detail: badBlocks ? badBlocks + ' block(s) differ from the expected ROM' : 'all match' });
      if ((!sizeOk || badBlocks) && !force) throw new PatchError('Wrong source ROM for this APS (GBA) patch — ' + (sizeOk ? badBlocks + ' block(s) don’t match.' : 'size is different.'), 'source-crc');

      const out = new Uint8Array(p.targetSize);
      out.set(rom.subarray(0, Math.min(rom.length, p.targetSize)));
      let badOut = 0;
      for (const rec of p.records) {
        for (let j = 0; j < BLOCK && rec.offset + j < p.targetSize; j++) {
          const s = rec.offset + j < rom.length ? rom[rec.offset + j] : 0;
          out[rec.offset + j] = s ^ rec.xor[j];
        }
        if (!blockMatches(out, rec.offset, rec.tgtCrc)) badOut++;
      }
      checks.push({ label: 'Output blocks', ok: badOut === 0, detail: badOut ? badOut + ' block(s) failed' : 'all match' });
      return { output: out, checks };
    },
  });
})((globalThis.VF = globalThis.VF || {}));
