#!/usr/bin/env node
/*
 * Aether Lab test runner — no dependencies.
 *   npm test               run everything
 *   npm test -- patch      only files whose name contains "patch"
 * Each *.test.js exports an object of { 'test name': async () => {} }.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const filter = process.argv[2] || '';
const files = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith('.test.js') && f.includes(filter))
  .sort();

(async () => {
  let passed = 0;
  let failed = 0;
  const started = Date.now();
  for (const file of files) {
    const suite = require(path.join(__dirname, file));
    console.log('\n' + file);
    for (const [name, fn] of Object.entries(suite)) {
      const t0 = Date.now();
      try {
        await fn();
        passed++;
        console.log('  ✓ ' + name + ' \x1b[2m(' + (Date.now() - t0) + ' ms)\x1b[0m');
      } catch (e) {
        failed++;
        console.log('  ✗ ' + name);
        console.log('      ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e));
      }
    }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed (' + ((Date.now() - started) / 1000).toFixed(1) + ' s)');
  process.exit(failed ? 1 : 0);
})();
