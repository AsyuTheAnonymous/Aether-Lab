/* Hashes and AES, checked against published vectors and Node's own crypto. */
'use strict';

const crypto = require('crypto');
const zlib = require('zlib');
const { loadVF, assert, rng } = require('./lib');
const VF = loadVF();
const hex = VF.bytes.hex;
const txt = (s) => new TextEncoder().encode(s);

function digest(Cls, data) {
  const h = new Cls();
  h.update(data);
  return hex(h.digest());
}

module.exports = {
  'CRC32 / MD5 / SHA-1 / SHA-256 published vectors'() {
    assert.equal(VF.hash.crc32(txt('123456789')).toString(16), 'cbf43926');
    assert.equal(digest(VF.hash.Md5, txt('abc')), '900150983cd24fb0d6963f7d28e17f72');
    assert.equal(digest(VF.hash.Sha1, txt('abc')), 'a9993e364706816aba3e25717850c26c9cd0d89d');
    assert.equal(hex(VF.hash.sha256(txt('abc'))), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    assert.equal(VF.hash.adler32(txt('Wikipedia'), 0, 9).toString(16), '11e60398');
    assert.equal(VF.hash.crc16ccitt(txt('123456789'), 0, 9).toString(16), '29b1', 'CRC-16/CCITT-FALSE');
    assert.equal(VF.hash.crc16modbus(txt('123456789'), 0, 9).toString(16), '4b37', 'CRC-16/MODBUS');
  },

  'hashes match Node crypto at block boundaries and in chunks'() {
    const r = rng(7);
    for (const n of [0, 1, 55, 56, 63, 64, 65, 127, 128, 1000, 70000]) {
      const data = new Uint8Array(n).map(() => (r() * 256) | 0);
      const ref = (a) => crypto.createHash(a).update(data).digest('hex');
      const md5 = new VF.hash.Md5();
      md5.update(data.subarray(0, n >> 1));
      md5.update(data.subarray(n >> 1));
      assert.equal(hex(md5.digest()), ref('md5'), 'md5 split ' + n);
      assert.equal(digest(VF.hash.Sha1, data), ref('sha1'), 'sha1 ' + n);
      assert.equal(hex(VF.hash.sha256(data)), ref('sha256'), 'sha256 ' + n);
      assert.equal(VF.hash.crc32(data), zlib.crc32(data), 'crc32 ' + n);
    }
  },

  'AES-128 FIPS-197 known answer'() {
    const key = VF.bytes.fromHex('000102030405060708090a0b0c0d0e0f');
    const pt = VF.bytes.fromHex('00112233445566778899aabbccddeeff');
    const ct = VF.aes.ecbEncrypt(key, pt);
    assert.equal(hex(ct), '69c4e0d86a7b0430d8cdb78070b4c55a');
    assert.bytes(VF.aes.ecbDecrypt(key, ct), pt);
  },

  'AES-XTS with Nintendo big-endian sector tweak matches OpenSSL'() {
    const r = rng(99);
    const rand = (n) => new Uint8Array(n).map(() => (r() * 256) | 0);
    for (let t = 0; t < 5; t++) {
      const key = rand(32);
      const data = rand(0xc00);
      const first = t * 1000;
      const parts = [];
      for (let s = 0; s < 6; s++) {
        const iv = Buffer.alloc(16);
        iv.writeUInt32BE(first + s, 12); // Nintendo: sector number big-endian
        const c = crypto.createCipheriv('aes-128-xts', Buffer.from(key), iv);
        parts.push(Buffer.concat([c.update(data.subarray(s * 0x200, (s + 1) * 0x200)), c.final()]));
      }
      const mine = VF.aes.xtsEncrypt(key, data, first, 0x200);
      assert.bytes(mine, Buffer.concat(parts), 'xts round ' + t);
      assert.bytes(VF.aes.xtsDecrypt(key, mine, first, 0x200), data, 'xts decrypt ' + t);
    }
  },
};
