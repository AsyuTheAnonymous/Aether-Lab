/*
 * Aether Lab — 04 ROM Lab tab
 */
(function (VF) {
  'use strict';

  const { $, el, kv, chip, checks, clear } = VF.ui;

  let current = null;

  function base(name) {
    return name.replace(/\.[^.]+$/, '');
  }

  function op(label, fn) {
    const b = el('button', { class: 'btn btn--ghost', type: 'button' }, label);
    b.addEventListener('click', () => {
      try {
        const { data, name } = fn();
        VF.ui.download(data, name);
        VF.ui.toast('Saved ' + name);
      } catch (e) {
        VF.ui.toast(e.message, 'bad');
      }
    });
    return b;
  }

  async function onRom(file) {
    const data = await VF.ui.readFile(file);
    const info = VF.rom.identify(data, file.name);
    current = { name: file.name, data, info };
    const box = clear($('#lab-info'));
    box.hidden = false;
    box.appendChild(el('p', { class: 'readout__title' }, el('span', null, info.name), chip(info.id === 'unknown' ? 'Generic' : info.id.toUpperCase(), info.id === 'unknown' ? 'warn' : 'ok')));
    box.appendChild(kv(info.rows));
    box.appendChild(VF.ui.hashPanel(data));
    const results = info.checksums.map((c) => Object.assign({ label: c.label, id: c.id }, c.check(data)));
    if (results.length) box.appendChild(checks(results));
    if (info.notes.length) box.appendChild(el('ul', { class: 'notes' }, info.notes.map((n) => el('li', null, n))));

    const ops = clear($('#lab-ops'));
    ops.hidden = false;
    const e = VF.rom.ext(file.name);
    if (info.header && info.header.size && info.header.removable) {
      const newExt = info.header.kind === 'smd' ? 'md' : info.header.kind === 'snes' ? 'sfc' : e;
      ops.appendChild(op(info.header.kind === 'smd' ? 'Convert SMD → BIN' : 'Remove ' + info.header.size + '-byte header', () => ({ data: VF.rom.removeHeader(data, info), name: base(file.name) + ' (headerless).' + newExt })));
    }
    if (info.id === 'snes' && info.header && info.header.size === 0) {
      ops.appendChild(op('Add 512-byte copier header', () => ({ data: VF.rom.addSnesHeader(data), name: base(file.name) + '.smc' })));
    }
    if (info.id === 'n64') {
      const order = VF.n64.order(data);
      for (const o of ['z64', 'v64', 'n64']) {
        if (o === order) continue;
        ops.appendChild(op('Convert to .' + o, () => ({ data: VF.n64.fromZ64(VF.n64.toZ64(data), o), name: base(file.name) + '.' + o })));
      }
    }
    const broken = info.checksums.filter((c, i) => results[i].ok === false);
    if (broken.length) {
      ops.appendChild(op('Repair ' + broken.length + ' checksum' + (broken.length > 1 ? 's' : ''), () => {
        let d = data;
        for (const c of broken) d = c.fix(d);
        return { data: d, name: base(file.name) + ' (fixed).' + (e || 'bin') };
      }));
    }
    if (!ops.childNodes.length) ops.appendChild(el('p', { class: 'hint' }, 'Nothing to convert — this ROM is already in its standard form.'));
  }

  VF.labTab = {
    init() {
      VF.ui.bindDrop($('[data-drop="lab"]'), $('#lab-rom'), (f) => onRom(f).catch((e) => VF.ui.toast(e.message, 'bad')));
    },
  };
})((globalThis.VF = globalThis.VF || {}));
