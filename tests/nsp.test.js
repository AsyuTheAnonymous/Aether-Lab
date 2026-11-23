/*
 * NSP forwarder builder, using throwaway random keys (real keys are never
 * needed or stored). Re-reads the output with an independent parser below.
 */
'use strict';

const crypto = require('crypto');
const { loadVF, assert } = require('./lib');
const VF = loadVF();
const H = VF.bytes.hex;

/** A self-consistent fake prod.keys (random master key + sources). */
function fakeKeys() {
  const r = (n) => crypto.randomBytes(n).toString('hex');
  const k = { master_key_00: r(16), aes_kek_generation_source: r(16), aes_key_generation_source: r(16), header_kek_source: r(16), header_key_source: r(32), key_area_key_application_source: r(16) };
  const x = VF.bytes.fromHex;
  const kek = VF.keys.generateKek(x(k.header_kek_source), x(k.master_key_00), x(k.aes_kek_generation_source), x(k.aes_key_generation_source));
  const headerKey = VF.aes.ecbDecrypt(kek, x(k.header_key_source));
  return Object.entries(k).map(([a, b]) => a + ' = ' + b).join('\n') + '\nheader_key = ' + H(headerKey) + '\n';
}

/** Minimal independent PFS0 reader. */
function readPfs0(u8) {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  assert.equal(VF.bytes.ascii(u8, 0, 4), 'PFS0');
  const n = v.getUint32(4, true);
  const strSize = v.getUint32(8, true);
  const data = 0x10 + n * 0x18 + strSize;
  const files = {};
  for (let i = 0; i < n; i++) {
    const e = 0x10 + i * 0x18;
    const off = Number(v.getBigUint64(e, true));
    const size = Number(v.getBigUint64(e + 8, true));
    const name = VF.bytes.ascii(u8, 0x10 + n * 0x18 + v.getUint32(e + 0x10, true), 255);
    files[name] = u8.subarray(data + off, data + off + size);
  }
  return files;
}

module.exports = {
  'prod.keys: header_key is cross-checked against master_key_00'() {
    const text = fakeKeys();
    const k = VF.keys.load(text);
    assert.equal(k.headerKey.length, 32);
    assert.ok(k.status[0].detail.includes('cross-checked'));
    const broken = text.replace(/header_key = ([0-9a-f])/, (m, c) => 'header_key = ' + (c === '0' ? '1' : '0'));
    assert.throws(() => VF.keys.load(broken));
    assert.throws(() => VF.keys.load('nothing useful here'));
  },

  'title IDs: deterministic formula, validation'() {
    const nro = 'sdmc:/retroarch/cores/snes9x_libretro_libnx.nro';
    const argv = VF.forwarder.argvFor(nro, 'sdmc:/roms/snes/Test.sfc');
    const id = VF.forwarder.deterministicTitleId(nro, argv);
    assert.equal(id, VF.forwarder.deterministicTitleId(nro, argv), 'stable');
    assert.ok(id >= 0x0100000000000000n && id <= 0x01ffffffffffffffn && (id & 0xfffn) === 0n);
    assert.throws(() => VF.forwarder.parseTitleId('0100000000001001'));
    assert.throws(() => VF.forwarder.parseTitleId('0500000000000000'));
    assert.equal(VF.forwarder.parseTitleId('0100ABCDEF012000'), 0x0100abcdef012000n);
  },

  'paths: normalised to sdmc:/ and quotes refused'() {
    assert.equal(VF.forwarder.normalizePath('/roms/snes/a b.sfc'), 'sdmc:/roms/snes/a b.sfc');
    assert.equal(VF.forwarder.normalizePath('E:\\roms\\x.sfc'), 'sdmc:/roms/x.sfc');
    assert.equal(VF.forwarder.normalizePath('sdmc://switch//app.nro'), 'sdmc:/switch/app.nro');
    assert.throws(() => VF.forwarder.normalizePath('/roms/"bad".sfc'));
  },

  async 'builds a RetroArch forwarder that verifies end to end'() {
    const keys = VF.keys.load(fakeKeys());
    const nroPath = VF.cores.corePath('snes9x');
    const romPath = '/roms/snes/Test Hack.sfc';
    const titleId = VF.forwarder.deterministicTitleId(nroPath, VF.forwarder.argvFor(nroPath, VF.forwarder.normalizePath(romPath)));
    const icon = new Uint8Array(4000).fill(7);
    const out = await VF.forwarder.build({ keys, title: 'Test Hack', publisher: 'Tester', version: '1.0', titleId, nroPath, romPath, icon });
    assert.ok(out.report.ok, JSON.stringify(out.report.checks));
    assert.ok(out.signed, 'signature #2 present');

    // independent re-read: NSP → 3 NCAs whose names are their SHA-256 prefixes
    const files = readPfs0(out.nsp);
    const names = Object.keys(files);
    assert.equal(names.length, 3);
    for (const [name, data] of Object.entries(files)) {
      assert.equal(H(VF.hash.sha256(data)).slice(0, 32), name.split('.')[0], 'NCA id = hash prefix');
      const hdr = VF.aes.xtsDecrypt(keys.headerKey, data.subarray(0, 0xc00), 0, 0x200);
      assert.equal(VF.bytes.ascii(hdr, 0x200, 4), 'NCA3');
      assert.equal(new DataView(hdr.buffer).getBigUint64(0x210, true), titleId);
    }

    // program NCA romfs carries the launch target
    const prog = Object.entries(files).find(([n, d]) => VF.aes.xtsDecrypt(keys.headerKey, d.subarray(0, 0xc00), 0, 0x200)[0x205] === 0)[1];
    const text = new TextDecoder().decode(prog);
    assert.ok(text.includes('sdmc:/retroarch/cores/snes9x_libretro_libnx.nro "sdmc:/roms/snes/Test Hack.sfc"'), 'nextArgv present');
  },

  async 'builds a homebrew .nro forwarder without an icon'() {
    const keys = VF.keys.load(fakeKeys());
    const out = await VF.forwarder.build({ keys, title: 'App', publisher: 'Dev', titleId: 0x0100123456789000n, nroPath: 'switch/app/app.nro' });
    assert.ok(out.report.ok);
    assert.equal(out.argv, 'sdmc:/switch/app/app.nro');
    assert.equal(out.fileName, 'App [0100123456789000].nsp');
  },

  'forwarder template passes its integrity check'() {
    const t = VF.forwarderTemplate;
    assert.equal(H(VF.hash.sha256(t.main())), t.mainSha256);
    assert.equal(H(VF.hash.sha256(t.npdm())), t.npdmSha256);
  },
};
