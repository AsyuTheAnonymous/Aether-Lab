/*
 * Aether Lab — IPS / IPS32 / EBP
 * IPS:   "PATCH", records of [u24 offset][u16 size][data] or RLE, "EOF",
 *        optional u24 truncate size (Lunar IPS extension).
 * IPS32: same idea with u32 offsets and an "EEOF" terminator.
 * EBP:   EarthBound patches — plain IPS with a JSON blob after "EOF".
 * IPS has no checksums, so it can't tell you if you used the wrong ROM.
 */
(function (VF) {
  'use strict';

  const { Reader, Writer } = VF.bytes;
  const { PatchError, startsWith } = VF.patch;
  const EOF_MARK = 0x454f46; // "EOF"
  const MAX_IPS = 0xffffff;

  function parse(u8) {
    const is32 = startsWith(u8, 'IPS32');
    if (!is32 && !startsWith(u8, 'PATCH')) throw new PatchError('Not an IPS patch');
    const r = new Reader(u8, 5);
    const records = [];
    let truncate = null;
    let meta = null;
    let trailing = 0;
    let sawEof = false;
    while (!r.eof) {
      // Look for the terminator before reading it as an offset.
      if (!is32 && r.pos + 3 <= u8.length && u8[r.pos] === 0x45 && u8[r.pos + 1] === 0x4f && u8[r.pos + 2] === 0x46) {
        r.pos += 3;
        sawEof = true;
        break;
      }
      if (is32 && r.pos + 4 <= u8.length && startsWith(u8.subarray(r.pos), 'EEOF')) {
        r.pos += 4;
        sawEof = true;
        break;
      }
      const offset = is32 ? r.u32be() : r.u24be();
      const size = r.u16be();
      if (size === 0) {
        const runLength = r.u16be();
        const value = r.byte();
        records.push({ offset, rle: true, length: runLength, value });
      } else {
        records.push({ offset, rle: false, length: size, data: r.bytes(size) });
      }
    }
    if (!sawEof) throw new PatchError('IPS patch has no EOF marker — it is probably truncated');
    const rest = u8.length - r.pos;
    if (rest === 3 && !is32) truncate = r.u24be();
    else if (rest === 4 && is32) truncate = r.u32be();
    else if (rest > 0 && u8[r.pos] === 0x7b) {
      try {
        meta = JSON.parse(VF.bytes.text(u8.subarray(r.pos)));
      } catch (e) {
        meta = null;
        trailing = rest;
      }
    } else if (rest > 0) trailing = rest;
    return { is32, records, truncate, meta, trailing };
  }

  function inspect(u8) {
    const p = parse(u8);
    let maxEnd = 0;
    for (const rec of p.records) maxEnd = Math.max(maxEnd, rec.offset + rec.length);
    const rows = [
      ['Format', p.is32 ? 'IPS32' : p.meta ? 'EBP (IPS + metadata)' : 'IPS'],
      ['Records', String(p.records.length)],
      ['Writes up to', '0x' + maxEnd.toString(16).toUpperCase()],
    ];
    if (p.truncate !== null) rows.push(['Truncates ROM to', VF.bytes.formatSize(p.truncate)]);
    if (p.meta) {
      if (p.meta.title) rows.push(['Title', String(p.meta.title)]);
      if (p.meta.author) rows.push(['Author', String(p.meta.author)]);
      if (p.meta.description) rows.push(['Description', String(p.meta.description)]);
    }
    rows.push(['Checksums', 'None (IPS can’t verify your ROM)']);
    return { rows, expectedTargetSize: null };
  }

  function apply(rom, u8) {
    const p = parse(u8);
    let size = rom.length;
    for (const rec of p.records) size = Math.max(size, rec.offset + rec.length);
    if (p.truncate !== null) size = p.truncate;
    const out = new Uint8Array(size);
    out.set(rom.subarray(0, Math.min(rom.length, size)));
    for (const rec of p.records) {
      if (rec.offset >= size) continue;
      if (rec.rle) out.fill(rec.value, rec.offset, Math.min(size, rec.offset + rec.length));
      else out.set(rec.offset + rec.length <= size ? rec.data : rec.data.subarray(0, size - rec.offset), rec.offset);
    }
    const checks = [{ label: 'Patch structure', ok: true, detail: p.records.length + ' records applied' }];
    if (p.trailing) {
      checks.push({ label: 'Data after EOF', ok: false, detail: p.trailing + ' bytes after the EOF marker were ignored — the tool that made this patch may have written a record at offset 0x454F46' });
    }
    return { output: out, checks };
  }

  /**
   * Build an IPS. Small gaps of unchanged bytes are merged into a record
   * when that is cheaper than starting a new one, and long runs of one
   * byte become RLE records.
   */
  function create(src, tgt) {
    if (tgt.length > MAX_IPS + 1) throw new PatchError('IPS can’t address ROMs over 16 MB. Use BPS instead.');
    const w = new Writer(0x10000);
    w.ascii('PATCH');
    const n = tgt.length;
    const differs = (i) => i >= src.length || src[i] !== tgt[i];
    const runLength = (at, cap) => {
      let r = 1;
      while (at + r < n && r < cap && tgt[at + r] === tgt[at]) r++;
      return r;
    };
    let i = 0;
    while (i < n) {
      if (!differs(i)) {
        i++;
        continue;
      }
      let start = i;
      // A record at 0x454F46 would be read as "EOF" — start one byte early.
      // Re-writing that byte with its target value is harmless.
      if (start === EOF_MARK) start--;

      const run = runLength(start, 0xffff);
      if (run >= 9) {
        w.u24be(start);
        w.u16be(0); // size 0 = RLE record
        w.u16be(run);
        w.u8(tgt[start]);
        i = start + run;
        continue;
      }

      // Normal record: extend over differing bytes and bridge short equal
      // gaps (cheaper than the 5-byte header of a new record).
      let end = start;
      while (end < n && end - start < 0xffff) {
        if (differs(end)) {
          if (end > start && runLength(end, 9) >= 9) break; // let it become RLE
          end++;
          continue;
        }
        let gap = 0;
        while (end + gap < n && gap < 6 && !differs(end + gap)) gap++;
        if (gap < 6 && end + gap < n && end + gap - start < 0xffff) end += gap;
        else break;
      }
      w.u24be(start);
      w.u16be(end - start);
      w.bytes(tgt.subarray(start, end));
      i = end;
    }
    w.ascii('EOF');
    if (tgt.length < src.length) w.u24be(tgt.length);
    return w.result();
  }

  VF.patch.register({
    id: 'ips',
    name: 'IPS',
    ext: 'ips',
    blurb: 'Classic, tiny, no checksums. ROMs up to 16 MB.',
    detect: (u8) => startsWith(u8, 'PATCH') || startsWith(u8, 'IPS32'),
    inspect,
    apply,
    create,
  });
})((globalThis.VF = globalThis.VF || {}));
