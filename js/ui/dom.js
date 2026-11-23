/*
 * Aether Lab — DOM helpers
 * Everything user-supplied (file names, ROM titles, patch metadata) is
 * inserted with textContent, never innerHTML, so a booby-trapped file name
 * can't inject markup or script.
 */
(function (VF) {
  'use strict';

  const ui = (VF.ui = {});

  ui.$ = (sel, root) => (root || document).querySelector(sel);
  ui.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /** el('div', { class: 'x', onclick: fn }, 'text', childNode, [more]) */
  ui.el = function (tag, attrs) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'text') node.textContent = v;
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    for (let i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  };
  function append(node, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) child.forEach((c) => append(node, c));
    else if (child instanceof Node) node.appendChild(child);
    else node.appendChild(document.createTextNode(String(child)));
  }
  const el = ui.el;

  ui.clear = (node) => {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  };

  ui.kv = function (rows, hashKeys) {
    const dl = el('dl', { class: 'kv' });
    for (const [k, v] of rows) {
      dl.appendChild(el('dt', null, k));
      dl.appendChild(el('dd', { class: hashKeys && hashKeys.includes(k) ? 'mono-hash' : null }, v instanceof Node ? v : String(v)));
    }
    return dl;
  };

  ui.chip = (text, kind) => el('span', { class: 'chip chip--' + (kind || 'info') }, text);

  /** list of { label, ok (true/false/null), detail } */
  ui.checks = function (items) {
    const ul = el('ul', { class: 'checks' });
    for (const c of items) {
      const kind = c.kind || (c.ok === true ? 'ok' : c.ok === false ? 'bad' : 'warn');
      ul.appendChild(el('li', { class: kind }, el('span', null, el('b', null, c.label), c.detail ? el('small', null, c.detail) : null)));
    }
    return ul;
  };

  ui.readFile = function (file) {
    if (file.arrayBuffer) return file.arrayBuffer().then((b) => new Uint8Array(b));
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(new Uint8Array(r.result));
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(file);
    });
  };

  ui.readText = function (file) {
    if (file.text) return file.text();
    return ui.readFile(file).then((u8) => new TextDecoder().decode(u8));
  };

  /** Minimal "stored" (uncompressed) ZIP — used only by the claude.ai preview. */
  ui.zipStore = function (files) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const crc = VF.hash.crc32(f.data);
      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true); // UTF-8 names
      lv.setUint32(14, crc, true);
      lv.setUint32(18, f.data.length, true);
      lv.setUint32(22, f.data.length, true);
      lv.setUint16(26, name.length, true);
      local.set(name, 30);
      const cd = new Uint8Array(46 + name.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, f.data.length, true);
      cv.setUint32(24, f.data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      cd.set(name, 46);
      parts.push(local, f.data);
      central.push(cd);
      offset += local.length + f.data.length;
    }
    const cdSize = central.reduce((n, c) => n + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [end]), { type: 'application/zip' });
  };

  /**
   * Inside the claude.ai preview, pages can't start downloads themselves;
   * the host's "downloads" capability saves files instead (zip-wrapped,
   * since ROM/NSP extensions aren't on its list). On a normal web host
   * window.claude doesn't exist and this path is never taken.
   */
  async function hostSave(u8, name) {
    const saver = await globalThis.claude.use('downloads');
    if (!saver) return false;
    try {
      await saver.save({ filename: name.replace(/\.[^.]+$/, '') + '.zip', data: ui.zipStore([{ name, data: u8 }]) });
    } catch (e) {
      if (e && e.code !== 'declined') ui.toast('Save failed: ' + (e.message || e.code), 'bad');
    }
    return true;
  }

  ui.download = function (u8, name, mime) {
    const host = globalThis.claude;
    if (host && typeof host.use === 'function') {
      hostSave(u8, name).then((handled) => {
        if (!handled) anchorDownload(u8, name, mime);
      });
      return;
    }
    anchorDownload(u8, name, mime);
  };

  function anchorDownload(u8, name, mime) {
    const blob = new Blob([u8], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: name, class: 'visually-hidden' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  let toastTimer = null;
  ui.toast = function (msg, kind) {
    const t = ui.$('#toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast' + (kind === 'bad' ? ' toast--bad' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), kind === 'bad' ? 7000 : 3500);
  };

  ui.busy = function (btn, on, label) {
    btn.disabled = !!on;
    btn.classList.toggle('is-busy', !!on);
    if (label) btn.querySelector('span').textContent = label;
  };

  /** Let the browser paint before a long synchronous job. */
  ui.nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));

  /**
   * Wire a <label class="drop"> containing an <input type=file>:
   * click / keyboard / drag-and-drop all end in onFile(File).
   */
  ui.bindDrop = function (label, input, onFile) {
    const handle = (file) => {
      if (!file) return;
      label.classList.add('is-loaded');
      const main = label.querySelector('.drop__main');
      const sub = label.querySelector('.drop__sub');
      if (main) main.textContent = file.name;
      if (sub) sub.textContent = VF.bytes.formatSize(file.size) + ' · click to replace';
      label.classList.add('is-reading');
      Promise.resolve()
        .then(() => onFile(file))
        .catch(() => {})
        .then(() => setTimeout(() => label.classList.remove('is-reading'), 500));
    };
    input.addEventListener('change', () => {
      handle(input.files && input.files[0]);
      input.value = '';
    });
    ['dragenter', 'dragover'].forEach((ev) =>
      label.addEventListener(ev, (e) => {
        e.preventDefault();
        label.classList.add('is-over');
      })
    );
    ['dragleave', 'drop'].forEach((ev) => label.addEventListener(ev, () => label.classList.remove('is-over')));
    label.addEventListener('drop', (e) => {
      e.preventDefault();
      handle(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
    });
  };

  /** A <dl> of CRC32/MD5/SHA-1 that fills in as hashing progresses. */
  ui.hashPanel = function (u8, onDone) {
    const wrap = el('div');
    const bar = el('div', { class: 'bar' }, el('i'));
    const rows = el('div');
    rows.appendChild(ui.kv([['Hashing', 'working…']]));
    wrap.append(rows, bar);
    VF.hash
      .fingerprint(u8, (p) => (bar.firstChild.style.width = Math.round(p * 100) + '%'))
      .then((h) => {
        bar.remove();
        ui.clear(rows).appendChild(ui.kv([['CRC32', h.crc32], ['MD5', h.md5], ['SHA-1', h.sha1]], ['CRC32', 'MD5', 'SHA-1']));
        if (onDone) onDone(h);
      });
    return wrap;
  };

  /** Strip extension and No-Intro style tags: "Game (USA) [!].sfc" → "Game" */
  ui.cleanTitle = function (name) {
    return String(name || '')
      .replace(/\.[^.]+$/, '')
      .replace(/\s*[([][^)\]]*[)\]]/g, '')
      .replace(/[_]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  };
})((globalThis.VF = globalThis.VF || {}));
