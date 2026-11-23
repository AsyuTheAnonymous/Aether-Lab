/* Patch formats: our creators ↔ our appliers, plus error handling. */
'use strict';

const { loadVF, assert, makeRom, mutate } = require('./lib');
const VF = loadVF();
const fmt = (id) => VF.patch.byId(id);

const CASES = [
  ['in-place edits', ['edits']],
  ['long runs', ['runs']],
  ['inserted block (data shifts)', ['insert']],
  ['grown ROM', ['edits', 'grow']],
  ['shrunk ROM', ['edits', 'shrink']],
  ['everything at once', ['edits', 'runs', 'insert', 'grow']],
];

const tests = {};
for (const id of ['ips', 'ups', 'bps']) {
  for (const [label, kinds] of CASES) {
    tests[id.toUpperCase() + ' round trip — ' + label] = () => {
      const src = makeRom(64 * 1024, 1 + kinds.length);
      const tgt = mutate(src, 100 + kinds.length, kinds);
      const patch = fmt(id).create(src, tgt);
      assert.equal(VF.patch.detect(patch), fmt(id), 'detect');
      const r = fmt(id).apply(src, patch);
      assert.bytes(r.output, tgt);
      assert.ok(r.checks.every((c) => c.ok !== false), 'all checks pass');
    };
  }
}

Object.assign(tests, {
  'IPS never writes a record at offset 0x454F46 ("EOF")'() {
    const src = makeRom(0x460000, 5);
    const tgt = src.slice();
    tgt[0x454f46] ^= 0xff;
    const patch = fmt('ips').create(src, tgt);
    assert.bytes(fmt('ips').apply(src, patch).output, tgt);
    for (let i = 5; i + 3 <= patch.length - 3; ) {
      const off = (patch[i] << 16) | (patch[i + 1] << 8) | patch[i + 2];
      assert.ok(off !== 0x454f46, 'record at EOF offset');
      const size = (patch[i + 3] << 8) | patch[i + 4];
      i += 5 + (size ? size : 3);
    }
  },

  'IPS refuses targets over 16 MB'() {
    const big = new Uint8Array(0x1000002);
    assert.throws(() => fmt('ips').create(big.subarray(0, 10), big));
  },

  'UPS works in reverse (patched ROM → original)'() {
    const src = makeRom(32768, 9);
    const tgt = mutate(src, 10, ['edits']);
    const patch = fmt('ups').create(src, tgt);
    const r = fmt('ups').apply(tgt, patch);
    assert.equal(r.direction, 'reverse');
    assert.bytes(r.output, src);
  },

  'BPS and UPS reject the wrong source ROM'() {
    const src = makeRom(32768, 11);
    const tgt = mutate(src, 12, ['edits']);
    const wrong = src.slice();
    wrong[100] ^= 1;
    for (const id of ['bps', 'ups']) assert.throws(() => fmt(id).apply(wrong, fmt(id).create(src, tgt)), 'source-crc', id);
  },

  'BPS detects a damaged patch file'() {
    const src = makeRom(32768, 13);
    const patch = fmt('bps').create(src, mutate(src, 14, ['edits']));
    patch[20] ^= 0x40;
    assert.throws(() => fmt('bps').apply(src, patch), 'patch-crc');
  },

  'BPS metadata is stored and shown'() {
    const src = makeRom(4096, 15);
    const patch = fmt('bps').create(src, mutate(src, 16, ['edits']), { metadata: 'My Hack v1.0 — by Ash' });
    const rows = fmt('bps').inspect(patch).rows;
    assert.ok(rows.some(([k, v]) => k === 'Metadata' && v === 'My Hack v1.0 — by Ash'));
  },

  'unsupported formats explain themselves'() {
    const e = assert.throws(() => VF.patch.detect(new TextEncoder().encode('NINJA2 something')), 'unsupported');
    assert.ok(/RUP/.test(e.message));
    assert.equal(VF.patch.detect(new Uint8Array([1, 2, 3, 4, 5, 6])), null);
  },
});

module.exports = tests;
