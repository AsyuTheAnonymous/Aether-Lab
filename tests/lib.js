/*
 * Test helpers: load the browser scripts into Node, a tiny assertion
 * library, and deterministic test data (no real ROMs are ever needed).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/** Same load order as index.html, minus the browser-only UI files. */
const CORE_SCRIPTS = [
  'js/core/bytes.js',
  'js/core/hash.js',
  'js/patch/registry.js',
  'js/patch/bps.js',
  'js/patch/ips.js',
  'js/patch/ups.js',
  'js/patch/vcdiff.js',
  'js/patch/ppf.js',
  'js/patch/aps.js',
  'js/rom/n64.js',
  'js/rom/consoles.js',
  'js/patch/engine.js',
  'js/nsp/aes.js',
  'js/nsp/keys.js',
  'js/nsp/fs.js',
  'js/nsp/meta.js',
  'js/nsp/nca.js',
  'js/nsp/template.js',
  'js/nsp/cores.js',
  'js/nsp/forwarder.js',
];

function loadVF() {
  if (!globalThis.VF) {
    for (const f of CORE_SCRIPTS) vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
  }
  return globalThis.VF;
}

class AssertionError extends Error {}
const assert = {
  ok(cond, msg) {
    if (!cond) throw new AssertionError(msg || 'expected a truthy value');
  },
  equal(actual, expected, msg) {
    if (actual !== expected) throw new AssertionError((msg ? msg + ': ' : '') + 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  },
  bytes(actual, expected, msg) {
    const a = Buffer.from(actual);
    const b = Buffer.from(expected);
    if (a.length !== b.length || Buffer.compare(a, b) !== 0) {
      let i = 0;
      while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
      throw new AssertionError((msg ? msg + ': ' : '') + 'byte arrays differ (lengths ' + a.length + ' / ' + b.length + ', first difference at 0x' + i.toString(16) + ')');
    }
  },
  throws(fn, code, msg) {
    try {
      fn();
    } catch (e) {
      if (code && e.code !== code) throw new AssertionError((msg ? msg + ': ' : '') + 'expected error code ' + code + ', got ' + e.code + ' (' + e.message + ')');
      return e;
    }
    throw new AssertionError(msg || 'expected an error');
  },
};

/** Seeded PRNG (LCG) so every run sees identical data. */
function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
}

/** A pseudo-ROM: random bytes with some long runs, like real ROM padding. */
function makeRom(size, seed) {
  const r = rng(seed);
  const a = new Uint8Array(size);
  for (let i = 0; i < size; i++) a[i] = (r() * 256) | 0;
  for (let k = 0; k < 12; k++) {
    const at = (r() * size) | 0;
    a.fill(k % 2 ? 0xff : 0x00, at, Math.min(size, at + ((r() * size) >> 6)));
  }
  return a;
}

/** Derive a "hacked" version: in-place edits, runs, an insertion, growth. */
function mutate(src, seed, kinds) {
  const r = rng(seed);
  let t = src.slice();
  const n = src.length;
  if (kinds.includes('edits')) {
    for (let k = 0; k < 60; k++) {
      const at = (r() * n) | 0;
      const len = 1 + ((r() * 24) | 0);
      for (let j = 0; j < len && at + j < n; j++) t[at + j] = (r() * 256) | 0;
    }
  }
  if (kinds.includes('runs')) for (let k = 0; k < 6; k++) t.fill(0x42, (r() * n) | 0, ((r() * n) | 0) + 200);
  if (kinds.includes('insert')) {
    const at = n >> 2;
    const ins = makeRom(3000, seed + 1);
    t = Buffer.concat([t.subarray(0, at), ins, t.subarray(at)]);
  }
  if (kinds.includes('grow')) t = Buffer.concat([t, makeRom(5000, seed + 2)]);
  if (kinds.includes('shrink')) t = t.slice(0, n - 777);
  return new Uint8Array(t);
}

function fixture(name) {
  return new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', name)));
}

module.exports = { loadVF, assert, rng, makeRom, mutate, fixture, ROOT };
