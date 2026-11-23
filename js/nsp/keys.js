/*
 * Aether Lab — prod.keys parsing
 * Reads the prod.keys file from the user's own console.
 * Nothing here ever leaves the page: no network calls, no storage.
 * Only header_key is strictly required (forwarders use plaintext sections).
 */
(function (VF) {
  'use strict';

  const B = VF.bytes;

  function parse(text) {
    const map = {};
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/[;#].*$/, '').trim();
      const m = line.match(/^([a-z0-9_]+)\s*[=:]\s*([0-9a-f]+)$/i);
      if (m) map[m[1].toLowerCase()] = m[2];
    }
    return map;
  }

  function hexKey(map, name, len) {
    const v = map[name];
    if (!v) return null;
    if (v.length !== len * 2) throw new Error(name + ' should be ' + len * 2 + ' hex digits but has ' + v.length);
    return B.fromHex(v);
  }

  /** Same derivation as hactool's generate_kek(). */
  function generateKek(src, masterKey, kekSeed, keySeed) {
    const kek = VF.aes.ecbDecrypt(masterKey, kekSeed);
    const srcKek = VF.aes.ecbDecrypt(kek, src);
    return keySeed ? VF.aes.ecbDecrypt(srcKek, keySeed) : srcKek;
  }

  /**
   * Returns { headerKey, keyAreaKeyApp0, status: [{label, ok, detail}], count }
   * Throws if no usable header_key is present.
   */
  function load(text) {
    const map = parse(text);
    const count = Object.keys(map).length;
    if (!count) throw new Error('That file has no keys in it. Load the prod.keys file from your own console.');
    const status = [];
    let headerKey = hexKey(map, 'header_key', 32);
    let keyAreaKeyApp0 = hexKey(map, 'key_area_key_application_00', 16);

    const mk0 = hexKey(map, 'master_key_00', 16);
    const kekGen = hexKey(map, 'aes_kek_generation_source', 16);
    const keyGen = hexKey(map, 'aes_key_generation_source', 16);
    const hdrKekSrc = hexKey(map, 'header_kek_source', 16);
    const hdrKeySrc = hexKey(map, 'header_key_source', 32);
    const kaekSrc = hexKey(map, 'key_area_key_application_source', 16);

    if (mk0 && kekGen && keyGen && hdrKekSrc && hdrKeySrc) {
      const headerKek = generateKek(hdrKekSrc, mk0, kekGen, keyGen);
      const derived = VF.aes.ecbDecrypt(headerKek, hdrKeySrc);
      if (headerKey) {
        const ok = B.equal(derived, headerKey);
        status.push({ label: 'header_key', ok, detail: ok ? 'present and cross-checked against master_key_00' : 'does NOT match what master_key_00 derives — this keys file is damaged' });
        if (!ok) throw new Error('Your prod.keys is inconsistent (header_key doesn’t match master_key_00). Get a fresh copy of your console’s keys.');
      } else {
        headerKey = derived;
        status.push({ label: 'header_key', ok: true, detail: 'derived from master_key_00' });
      }
      if (!keyAreaKeyApp0 && kaekSrc) {
        keyAreaKeyApp0 = generateKek(kaekSrc, mk0, kekGen, keyGen);
      }
    } else if (headerKey) {
      status.push({ label: 'header_key', ok: true, detail: 'present (no master_key_00 to cross-check)' });
    }
    if (!headerKey) throw new Error('header_key is missing from this file. Get a fresh, complete copy of your console’s keys.');
    if (B.isZero(headerKey)) throw new Error('header_key is all zeros — that isn’t a real key file.');

    status.push({
      label: 'key_area_key_application_00',
      ok: true,
      detail: keyAreaKeyApp0 ? 'present' : 'missing (fine — forwarders don’t encrypt their contents)',
    });
    const masters = Object.keys(map).filter((k) => /^master_key_[0-9a-f]{2}$/.test(k)).sort();
    if (masters.length) status.push({ label: 'Newest master key', ok: true, detail: masters[masters.length - 1] + ' (' + masters.length + ' total)' });
    return { headerKey, keyAreaKeyApp0, status, count };
  }

  VF.keys = { load, parse, generateKek };
})((globalThis.VF = globalThis.VF || {}));
