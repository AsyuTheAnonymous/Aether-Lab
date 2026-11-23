/* Console detection, header handling and checksum repair. */
'use strict';

const { loadVF, assert, makeRom } = require('./lib');
const VF = loadVF();

function synthGb(cgb) {
  const d = makeRom(0x8000, 3);
  d.set([0xce, 0xed, 0x66, 0x66], 0x104);
  d.set(new TextEncoder().encode('HOMEBREWTEST'), 0x134);
  d[0x143] = cgb ? 0xc0 : 0x00;
  return d;
}

function checkAndRepair(rom, name, label) {
  const info = VF.rom.identify(rom, name);
  const c = info.checksums.find((x) => x.label === label);
  assert.ok(c, label + ' available');
  const fixed = c.fix(rom);
  assert.equal(c.check(fixed).ok, true, label + ' valid after repair');
  return { info, fixed, c };
}

module.exports = {
  'Game Boy: detects CGB flag, repairs header + global checksum'() {
    const { info, fixed } = checkAndRepair(synthGb(true), 'x.gbc', 'GB header checksum');
    assert.equal(info.id, 'gbc');
    const g = info.checksums.find((x) => x.label === 'GB global checksum');
    assert.equal(g.check(fixed).ok, true);
  },

  'GBA: repairs the header complement'() {
    const d = makeRom(0x10000, 4);
    d.set([0x24, 0xff, 0xae, 0x51], 4);
    d[0xb2] = 0x96;
    const { info } = checkAndRepair(d, 'x.gba', 'GBA header complement');
    assert.equal(info.id, 'gba');
  },

  'Nintendo DS: repairs the header CRC16'() {
    const d = makeRom(0x4000, 5);
    d.set([0x24, 0xff, 0xae, 0x51], 0xc0);
    const { info } = checkAndRepair(d, 'x.nds', 'NDS header CRC16');
    assert.equal(info.id, 'nds');
  },

  'Mega Drive: repairs the checksum; SMD de-interleaves back to BIN'() {
    const d = makeRom(0x20000, 6);
    d.set(new TextEncoder().encode('SEGA GENESIS    '), 0x100);
    const { info, fixed } = checkAndRepair(d, 'x.md', 'Mega Drive checksum');
    assert.equal(info.id, 'md');
    // build an SMD (512-byte header + interleaved 16 KB blocks) from the fixed BIN
    const smd = new Uint8Array(512 + fixed.length);
    smd[1] = 3;
    smd[8] = 0xaa;
    smd[9] = 0xbb;
    for (let b = 0; b < fixed.length; b += 0x4000) {
      for (let i = 0; i < 0x2000; i++) {
        smd[512 + b + i] = fixed[b + i * 2 + 1];
        smd[512 + b + 0x2000 + i] = fixed[b + i * 2];
      }
    }
    const smdInfo = VF.rom.identify(smd, 'x.smd');
    assert.equal(smdInfo.header.kind, 'smd');
    assert.bytes(VF.rom.removeHeader(smd, smdInfo), fixed);
  },

  'SNES: finds the LoROM header behind a copier header; mirrored checksum'() {
    const body = makeRom(3 * 1024 * 1024, 7); // 3 MB: needs mirroring
    body.set(new TextEncoder().encode('AETHER LAB TEST ROM  '), 0x7fc0);
    body[0x7fd5] = 0x20;
    body[0x7fd7] = 0x0c;
    body[0x7ffd] = 0x80;
    const rom = VF.rom.addSnesHeader(body);
    const { info, fixed } = checkAndRepair(rom, 'x.smc', 'SNES internal checksum');
    assert.equal(info.id, 'snes');
    assert.equal(info.header.size, 512);
    assert.ok(info.rows.some(([k, v]) => k === 'Mapping' && /LoROM/.test(v)));
    // the checksum must not depend on what was stored in the checksum bytes
    const again = fixed.slice();
    again.fill(0, 512 + 0x7fdc, 512 + 0x7fe0);
    assert.equal(VF.rom.snesChecksum(again.subarray(512), 0x7fc0), VF.rom.snesChecksum(fixed.subarray(512), 0x7fc0));
  },

  'N64: byte-order conversions round-trip'() {
    const z = makeRom(0x200000, 8);
    z.set([0x80, 0x37, 0x12, 0x40], 0);
    for (const order of ['v64', 'n64']) {
      const other = VF.n64.fromZ64(z, order);
      assert.equal(VF.n64.order(other), order);
      assert.bytes(VF.n64.toZ64(other), z);
    }
  },

  'N64: boot CRC snapshot for every CIC variant'() {
    // Validated against chksum64-signed homebrew ROMs (CIC 6102) during
    // development; these snapshots guard the other variants from regressions.
    const z = makeRom(0x101000, 64);
    z.set([0x80, 0x37, 0x12, 0x40], 0);
    const expect = { 6102: ['b18793d2', '587637ea'], 6103: ['bafe69a0', '96803112'], 6105: ['8f6ae5ec', 'a58911f7'], 6106: ['f7ff6264', 'c9a9e10e'] };
    for (const [cic, [a, b]] of Object.entries(expect)) {
      const r = VF.n64.calcCrc(z, Number(cic));
      assert.equal(VF.bytes.hex32(r.crc1) + ' ' + VF.bytes.hex32(r.crc2), a + ' ' + b, 'CIC ' + cic);
    }
  },

  'NES: iNES header parsed and removable'() {
    const d = new Uint8Array(16 + 32768 + 8192);
    d.set([0x4e, 0x45, 0x53, 0x1a, 2, 1, 0x11, 0], 0);
    const info = VF.rom.identify(d, 'x.nes');
    assert.equal(info.id, 'nes');
    assert.ok(info.rows.some(([k, v]) => k === 'Mapper' && v === '1'));
    assert.equal(VF.rom.removeHeader(d, info).length, 32768 + 8192);
  },
};
