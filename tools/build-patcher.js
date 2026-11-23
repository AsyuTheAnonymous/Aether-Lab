#!/usr/bin/env node
/*
 * Builds the Aether Lab "patcher edition": Patch, Create, Analyze and the
 * Codex, without the Switch forwarder station or any of its code.
 *
 *   node tools/build-patcher.js [outDir]      default: dist/patcher
 *
 * The repository itself is the full edition and needs no build. This
 * script only removes the Switch parts, for people who'd rather not host
 * the forwarder on a particular server (see docs/getting-started.md).
 *
 * In index.html:
 *   <!-- edition:switch -->…<!-- /edition:switch -->   removed
 *   <!-- edition:patcher …html… -->                      un-commented
 *
 * No dependencies: Node's standard library only.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/** Top-level files and folders the site needs. Everything else stays out. */
const INCLUDE = ['index.html', 'manifest.webmanifest', 'css', 'fonts', 'images', 'js', 'licenses', 'LICENSE', '.htaccess', '_headers', 'server.js'];

/** Switch-only files, relative to the repo root. Folders end with '/'. */
const EXCLUDE = ['js/nsp/', 'js/ui/forge-tab.js', 'js/ui/icon.js', 'licenses/nx-hbloader-ISC.txt'];

const OPEN = '<!-- edition:switch -->';
const CLOSE = '<!-- /edition:switch -->';

function isExcluded(rel) {
  const r = rel.split(path.sep).join('/');
  return EXCLUDE.some((x) => (x.endsWith('/') ? r.startsWith(x) : r === x));
}

/** Turn the full edition's index.html into the patcher edition's. */
function transformHtml(html) {
  let out = '';
  let pos = 0;
  for (;;) {
    const start = html.indexOf(OPEN, pos);
    if (start < 0) break;
    const end = html.indexOf(CLOSE, start + OPEN.length);
    if (end < 0) throw new Error('index.html: ' + OPEN + ' at offset ' + start + ' is never closed');
    const inner = html.slice(start + OPEN.length, end);
    if (inner.includes(OPEN)) throw new Error('index.html: edition markers must not be nested (offset ' + start + ')');
    out += html.slice(pos, start);
    pos = end + CLOSE.length;
    // Drop the line entirely when the block was the only thing on it.
    const lineStart = out.lastIndexOf('\n') + 1;
    if (/^[ \t]*$/.test(out.slice(lineStart)) && html[pos] === '\n') {
      out = out.slice(0, lineStart);
      pos++;
    }
  }
  out += html.slice(pos);
  if (out.includes(CLOSE)) throw new Error('index.html: ' + CLOSE + ' without a matching ' + OPEN);
  out = out.replace(/[ \t]*<!-- edition:patcher\n([\s\S]*?)\n[ \t]*-->/g, (_, body) => body);
  if (/edition:(switch|patcher)/.test(out)) throw new Error('index.html: an edition marker was left behind');
  return out;
}

/** Local files referenced by src="…" or href="…" (ignores URLs and #anchors). */
function localRefs(html) {
  const refs = new Set();
  for (const m of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    const v = m[1];
    if (/^(?:[a-z]+:|#|\/\/)/i.test(v)) continue;
    refs.add(v.split(/[?#]/)[0]);
  }
  return [...refs];
}

function copyTree(src, dest, rel) {
  const stat = fs.statSync(src);
  if (isExcluded(rel + (stat.isDirectory() ? '/' : ''))) return;
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src).sort()) {
      if (name === '.DS_Store' || name === 'Thumbs.db') continue;
      copyTree(path.join(src, name), path.join(dest, name), rel ? rel + '/' + name : name);
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function build(outDir) {
  outDir = path.resolve(outDir || path.join(ROOT, 'dist', 'patcher'));
  if (outDir === ROOT || !outDir.startsWith(ROOT + path.sep) && !outDir.startsWith(require('os').tmpdir())) {
    throw new Error('Refusing to build into ' + outDir + ' — use a folder inside the repo (e.g. dist/patcher) or the temp folder.');
  }
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  for (const name of INCLUDE) {
    if (name === 'index.html') continue;
    copyTree(path.join(ROOT, name), path.join(outDir, name), name);
  }

  const html = transformHtml(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  fs.writeFileSync(path.join(outDir, 'index.html'), html);

  // Minimal package.json so Node.js hosting can `npm start` the bundled server.
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const slim = {
    name: pkg.name + '-patcher',
    version: pkg.version,
    description: 'Aether Lab patcher edition (generated — edit the main branch instead)',
    private: true,
    license: pkg.license,
    scripts: { start: 'node server.js' },
    engines: pkg.engines,
  };
  fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(slim, null, 2) + '\n');

  fs.writeFileSync(
    path.join(outDir, 'README.md'),
    '# Aether Lab — patcher edition\n\n' +
      'This branch is **generated automatically** from `main` by `tools/build-patcher.js`. ' +
      'It contains the Patch, Create and Analyze stations and the Codex, without the Switch forwarder.\n\n' +
      "Don't edit it directly: changes are overwritten on the next push to `main`.\n\n" +
      'Source, docs and the full edition: https://github.com/AsyuTheAnonymous/Aether-Lab\n'
  );

  // Every file the page references must exist, and nothing Switch-only may remain.
  const missing = localRefs(html).filter((ref) => !fs.existsSync(path.join(outDir, ref)));
  if (missing.length) throw new Error('Patcher edition references missing files: ' + missing.join(', '));
  const leftovers = localRefs(html).filter((ref) => isExcluded(ref));
  if (leftovers.length) throw new Error('Patcher edition still references Switch files: ' + leftovers.join(', '));

  return { outDir, html };
}

module.exports = { build, transformHtml, localRefs, EXCLUDE };

if (require.main === module) {
  try {
    const { outDir } = build(process.argv[2]);
    console.log('Patcher edition built in ' + path.relative(process.cwd(), outDir || '.'));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
