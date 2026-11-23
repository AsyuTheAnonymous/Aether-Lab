/* The patcher edition (tools/build-patcher.js): no Switch code, nothing missing. */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { assert } = require('./lib');
const { build, transformHtml, localRefs, EXCLUDE } = require('../tools/build-patcher');

const ROOT = path.resolve(__dirname, '..');
const fullHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let built = null;
function patcher() {
  if (!built) built = build(fs.mkdtempSync(path.join(os.tmpdir(), 'aether-patcher-')));
  return built;
}

function scripts(html) {
  return [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
}

module.exports = {
  'full edition: markers are balanced and every referenced file exists'() {
    assert.equal(fullHtml.split('<!-- edition:switch -->').length, fullHtml.split('<!-- /edition:switch -->').length);
    const missing = localRefs(fullHtml).filter((r) => !fs.existsSync(path.join(ROOT, r)));
    assert.equal(missing.join(', '), '');
  },

  'patcher edition: no forwarder station, tab, scripts or credits'() {
    const { html } = patcher();
    for (const needle of ['id="tab-forge"', 'id="panel-forge"', 'js/nsp/', 'forge-tab.js', 'icon.js', 'nx-hbloader', 'edition:']) {
      assert.ok(!html.includes(needle), 'still contains ' + needle);
    }
    assert.ok(!/forwarder/i.test(html), 'mentions forwarders');
    assert.ok(html.includes('<title>Aether Lab — Holographic ROM Patcher</title>'), 'patcher title un-commented');
  },

  'patcher edition: four stations, in order'() {
    const { html } = patcher();
    const tabs = [...html.matchAll(/<button class="tab"[^>]*data-tab="(\w+)">([^<]+)</g)].map((m) => m[2]);
    assert.equal(tabs.join(', '), 'Patch, Create, Analyze, Codex');
  },

  'patcher edition: scripts are the full list minus the Switch ones, same order'() {
    const { html } = patcher();
    const expected = scripts(fullHtml).filter((s) => !EXCLUDE.some((x) => (x.endsWith('/') ? s.startsWith(x) : s === x)));
    assert.equal(scripts(html).join('\n'), expected.join('\n'));
  },

  'patcher edition: ships only site files, none of the Switch code'() {
    const { outDir } = patcher();
    const files = [];
    (function walk(dir, rel) {
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const r = rel ? rel + '/' + name : name;
        if (fs.statSync(p).isDirectory()) walk(p, r);
        else files.push(r);
      }
    })(outDir, '');
    assert.ok(files.includes('index.html') && files.includes('.htaccess') && files.includes('server.js'), 'site files present');
    assert.ok(!files.some((f) => f.startsWith('js/nsp/') || f.startsWith('tests/') || f.startsWith('docs/')), 'no Switch code, tests or docs');
    // Only the guarded call sites may mention the forwarder; nothing may use the Switch modules.
    for (const f of files.filter((x) => x.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(outDir, f), 'utf8');
      assert.ok(!/VF\.(forwarder|cores|icon|keys|aes|nca|switchfs|switchmeta|forwarderTemplate)\b/.test(src), f + ' uses a Switch module');
      if (/VF\.forge\b/.test(src)) assert.ok(src.includes("VF.forge && $('#panel-forge')"), f + ' calls the forwarder without checking it exists');
    }
  },

  'marker errors are caught'() {
    assert.throws(() => transformHtml('a <!-- edition:switch --> b'));
    assert.throws(() => transformHtml('a <!-- /edition:switch --> b'));
    assert.throws(() => transformHtml('<!-- edition:switch --><!-- edition:switch --><!-- /edition:switch -->'));
  },
};
