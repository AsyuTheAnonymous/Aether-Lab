/* The auto-fix engine: finds the ROM variant a checksummed patch wants. */
'use strict';

const { loadVF, assert, makeRom, mutate } = require('./lib');
const VF = loadVF();

function snesPair() {
  const body = makeRom(1 << 20, 21);
  body.set(new TextEncoder().encode('AETHER LAB TEST ROM  '), 0x7fc0);
  body[0x7fd5] = 0x20;
  body[0x7fd7] = 0x0a;
  body[0x7ffd] = 0x80;
  return { body, hacked: mutate(body, 22, ['edits']) };
}

module.exports = {
  'BPS made for a headerless SNES ROM applies to a headered one'() {
    const { body, hacked } = snesPair();
    const patch = VF.engine.createPatch(body, hacked, 'bps').data;
    const r = VF.engine.applyPatch(VF.rom.addSnesHeader(body), 'Game.smc', patch, 'My Hack v1.2.bps', {});
    assert.bytes(r.output, hacked);
    assert.equal(r.transform, 'removed 512-byte header');
    assert.equal(r.outputName, 'My Hack v1.2.sfc');
  },

  'BPS made for .z64 applies to a .v64 dump'() {
    const z = makeRom(0x400000, 23);
    z.set([0x80, 0x37, 0x12, 0x40], 0);
    const hacked = mutate(z, 24, ['edits']);
    const patch = VF.engine.createPatch(z, hacked, 'bps').data;
    const r = VF.engine.applyPatch(VF.n64.fromZ64(z, 'v64'), 'game.v64', patch, 'hack.bps', {});
    assert.bytes(r.output, hacked);
    assert.equal(r.outputName, 'hack.z64');
  },

  'checksum repair option fixes the output'() {
    const { body, hacked } = snesPair();
    const patch = VF.engine.createPatch(body, hacked, 'ups').data;
    const r = VF.engine.applyPatch(body, 'Game.sfc', patch, 'hack.ups', { fixChecksums: true });
    assert.ok(r.checksumReport.every((c) => c.ok), JSON.stringify(r.checksumReport));
  },

  'wrong ROM is rejected unless forced'() {
    const { body, hacked } = snesPair();
    const patch = VF.engine.createPatch(body, hacked, 'bps').data;
    const wrong = body.slice();
    wrong[1234] ^= 1;
    const e = assert.throws(() => VF.engine.applyPatch(wrong, 'x.sfc', patch, 'h.bps', {}), 'source-crc');
    assert.ok(/CRC32/.test(e.message));
    const forced = VF.engine.applyPatch(wrong, 'x.sfc', patch, 'h.bps', { ignoreChecksums: true });
    assert.equal(forced.output.length, hacked.length);
  },

  'createPatch refuses identical files'() {
    const a = makeRom(1024, 25);
    assert.throws(() => VF.engine.createPatch(a, a.slice(), 'bps'));
  },
};
