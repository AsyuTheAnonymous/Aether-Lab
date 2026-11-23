/*
 * Patches made by OTHER tools (xdelta3, python-bps, RomPatcher.js) must
 * apply byte-for-byte. See fixtures/manifest.json for how each was made.
 */
'use strict';

const { loadVF, assert, makeRom, mutate, fixture } = require('./lib');
const manifest = require('./fixtures/manifest.json');
const VF = loadVF();

const tests = {};
for (const m of manifest) {
  tests[m.file + ' (' + m.tool + ')'] = () => {
    const src = makeRom(m.source.size, m.source.seed);
    if (m.source.n64) src.set([0x80, 0x37, 0x12, 0x40], 0);
    const tgt = mutate(src, m.target.seed, m.target.kinds);
    assert.equal(VF.bytes.hex32(VF.hash.crc32(tgt)), m.target.crc32, 'generated target matches manifest');
    const patch = fixture(m.file);
    const f = VF.patch.detect(patch);
    assert.ok(f, 'format detected');
    const r = f.apply(src, patch);
    assert.bytes(r.output, tgt);
  };
}

tests['xdelta Adler-32 catches a wrong source'] = () => {
  const m = manifest.find((x) => x.file === 'xdelta3-adler32.xdelta');
  const src = makeRom(m.source.size, m.source.seed);
  src[500] ^= 1;
  assert.throws(() => VF.patch.byId('xdelta').apply(src, fixture(m.file)), 'source-crc');
};

tests['xdelta secondary compression is reported, not mis-decoded'] = () => {
  const p = fixture('xdelta3-nochecksum.xdelta');
  // Rebuild the header with VCD_DECOMPRESS + LZMA id, then mark window 1's data section compressed.
  const ind = p[4];
  const out = VF.bytes.concat([p.subarray(0, 4), new Uint8Array([ind | 1, 2]), p.subarray(5)]);
  const cur = { p: 6 };
  const vi = () => {
    let v = 0;
    for (;;) {
      const b = out[cur.p++];
      v = v * 128 + (b & 127);
      if (!(b & 128)) return v;
    }
  };
  if (ind & 4) cur.p += vi();
  const win = out[cur.p++];
  if (win & 3) {
    vi();
    vi();
  }
  vi();
  vi();
  out[cur.p] = 1;
  const src = makeRom(32768, 21);
  const e = assert.throws(() => VF.patch.byId('xdelta').apply(src, out), 'unsupported');
  assert.ok(/LZMA/.test(e.message));
};

module.exports = tests;
