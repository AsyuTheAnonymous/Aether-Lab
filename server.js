#!/usr/bin/env node
/*
 * Aether Lab — tiny static server (no dependencies)
 *
 *   npm start            → http://localhost:3000
 *   PORT=8080 npm start  → custom port
 *
 * The site itself needs no server code: this file exists for local
 * development and for Node.js hosts (Hostinger Node.js web apps, Render,
 * Railway, a VPS…). It only serves the site's own folders and sends the
 * same security headers as .htaccess does on Apache/LiteSpeed.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Only these are part of the website. Docs, tests and repo files are not served.
const PUBLIC_DIRS = new Set(['css', 'js', 'fonts', 'images', 'licenses']);
const PUBLIC_FILES = new Set(['index.html', 'manifest.webmanifest', 'LICENSE']);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

/** Map a URL path to a file on disk, or null if it isn't part of the site. */
function resolve(urlPath) {
  let p;
  try {
    p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch (e) {
    return null;
  }
  if (p === '/' || p === '') p = '/index.html';
  const parts = p.split('/').filter(Boolean);
  if (!parts.length || parts.some((s) => s.startsWith('.') || s.includes('\\'))) return null;
  const allowed = parts.length === 1 ? PUBLIC_FILES.has(parts[0]) : PUBLIC_DIRS.has(parts[0]);
  if (!allowed) return null;
  const full = path.join(ROOT, ...parts);
  return full.startsWith(ROOT + path.sep) ? full : null;
}

function send(res, status, body, extra) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, SECURITY_HEADERS, extra || {}));
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
  const file = resolve(req.url || '/');
  if (!file) return send(res, 404, 'Not found');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, Object.assign({}, SECURITY_HEADERS, {
      'Content-Type': type,
      'Content-Length': st.size,
      // index.html always revalidates so new releases show up; assets cache for an hour
      'Cache-Control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
    }));
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log('Aether Lab running at http://localhost:' + PORT);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));

module.exports = { resolve };
