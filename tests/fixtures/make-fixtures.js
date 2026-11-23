#!/usr/bin/env node
/*
 * Regenerates the cross-implementation patch fixtures in this folder.
 * NOT run by `npm test` — the fixtures are committed. You only need this
 * if you want to rebuild them. Requirements:
 *   pip install xdelta3 python-bps
 *   npm install --no-save rom-patcher@3.1.0-b
 * The source/target ROMs are generated from seeds (tests/lib.js), so the
 * repo never contains ROM data — only the small patches made from it.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { makeRom, mutate } = require('../lib');
const { crc32 } = require('zlib');

const HERE = __dirname;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-fx-'));

const cases = [
  { file: 'xdelta3-adler32.xdelta', tool: 'xdelta3 (python binding, ADLER32 flag)', size: 49152, seed: 11, tseed: 12, kinds: ['edits', 'insert', 'grow'] },
  { file: 'xdelta3-nochecksum.xdelta', tool: 'xdelta3 (python binding, no flags)', size: 32768, seed: 21, tseed: 22, kinds: ['edits', 'runs'] },
  { file: 'python-bps.bps', tool: 'python-bps 5 (diff_bytearrays, blocksize 64)', size: 40960, seed: 31, tseed: 32, kinds: ['edits', 'insert'] },
  { file: 'rompatcher.ips', tool: 'RomPatcher.js 3.1.0-b', size: 32768, seed: 41, tseed: 42, kinds: ['edits', 'runs', 'grow'] },
  { file: 'rompatcher.ups', tool: 'RomPatcher.js 3.1.0-b', size: 32768, seed: 51, tseed: 52, kinds: ['edits', 'shrink'] },
  { file: 'rompatcher.ppf', tool: 'RomPatcher.js 3.1.0-b (PPF3)', size: 32768, seed: 61, tseed: 62, kinds: ['edits'] },
  { file: 'rompatcher-n64.aps', tool: 'RomPatcher.js 3.1.0-b (APS N64 mode)', size: 32768, seed: 71, tseed: 72, kinds: ['edits', 'runs'], n64: true },
];

const manifest = [];
for (const c of cases) {
  const src = makeRom(c.size, c.seed);
  if (c.n64) src.set([0x80, 0x37, 0x12, 0x40], 0);
  const tgt = mutate(src, c.tseed, c.kinds);
  const s = path.join(tmp, 'src.bin');
  const t = path.join(tmp, 'tgt.bin');
  const out = path.join(HERE, c.file);
  fs.writeFileSync(s, src);
  fs.writeFileSync(t, tgt);
  if (c.file.endsWith('.xdelta')) {
    const flags = c.file.includes('adler') ? 'xdelta3.Flags.ADLER32' : '0';
    execFileSync('python3', ['-c', `import xdelta3;open(${JSON.stringify(out)},'wb').write(xdelta3.encode(open(${JSON.stringify(s)},'rb').read(),open(${JSON.stringify(t)},'rb').read(),${flags}))`]);
  } else if (c.file.startsWith('python-bps')) {
    execFileSync('python3', ['-c', `import time,io;time.clock=time.perf_counter
import bps.diff,bps.io
ops=bps.diff.diff_bytearrays(64,open(${JSON.stringify(s)},'rb').read(),open(${JSON.stringify(t)},'rb').read())
b=io.BytesIO();bps.io.write_bps(ops,b);open(${JSON.stringify(out)},'wb').write(b.getvalue())`]);
  } else {
    const RomPatcher = require('rom-patcher/rom-patcher-js/RomPatcher');
    const bin = (u8, name) => {
      const f = new BinFile(new Uint8Array(u8).slice().buffer);
      f.fileName = name;
      return f;
    };
    const fmt = path.extname(c.file).slice(1);
    const patch = RomPatcher.createPatch(bin(src, 'o.bin'), bin(tgt, 'm.bin'), fmt).export('x');
    fs.writeFileSync(out, Buffer.from(patch._u8array));
  }
  manifest.push({ file: c.file, tool: c.tool, source: { size: c.size, seed: c.seed, n64: !!c.n64 }, target: { seed: c.tseed, kinds: c.kinds, size: tgt.length, crc32: crc32(tgt).toString(16).padStart(8, '0') } });
  console.log('wrote', c.file, fs.statSync(out).size, 'bytes');
}
fs.writeFileSync(path.join(HERE, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.rmSync(tmp, { recursive: true, force: true });
