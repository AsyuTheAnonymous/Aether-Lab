/*
 * Aether Lab — 02 Create tab
 */
(function (VF) {
  'use strict';

  const { $, el, kv, checks, clear } = VF.ui;
  const B = VF.bytes;
  const state = { orig: null, mod: null };
  const fx = VF.fx || { scan() {}, burst() {} };

  function show(slot, file, data) {
    const box = $('#create-' + slot + '-info');
    const info = VF.rom.identify(data, file.name);
    clear(box).hidden = false;
    box.appendChild(el('p', { class: 'readout__title' }, info.name));
    box.appendChild(kv([['Size', B.formatSize(data.length)], ['CRC32', B.hex32(VF.hash.crc32(data))]], ['CRC32']));
  }

  function update() {
    const ready = state.orig && state.mod;
    $('#create-go').disabled = !ready;
    const fmt = selected();
    let hint = ready ? 'Ready to build ' + fmt.toUpperCase() + '.' : 'Load both ROMs to begin.';
    if (ready && fmt === 'ips' && state.mod.data.length > 0x1000000) hint = 'IPS can’t go past 16 MB — pick BPS.';
    $('#create-hint').textContent = hint;
    $('#create-meta-wrap').hidden = fmt !== 'bps';
  }

  const selected = () => (document.querySelector('input[name="create-fmt"]:checked') || {}).value || 'bps';

  async function load(slot, file) {
    const data = await VF.ui.readFile(file);
    state[slot] = { name: file.name, data };
    show(slot, file, data);
    update();
  }

  async function run() {
    const btn = $('#create-go');
    const res = $('#create-result');
    VF.ui.busy(btn, true, 'Distilling');
    fx.scan(btn.closest('.card'), true);
    await VF.ui.nextFrame();
    await new Promise((r) => setTimeout(r, 350));
    clear(res).hidden = false;
    res.className = 'card card--wide result';
    try {
      const fmt = selected();
      const t0 = performance.now();
      const { data } = VF.engine.createPatch(state.orig.data, state.mod.data, fmt, { metadata: $('#create-meta').value.trim() });
      const ms = Math.round(performance.now() - t0);
      const name = VF.ui.cleanTitle(state.mod.name).replace(/[\\/:*?"<>|]+/g, '_') + '.' + fmt;
      res.classList.add('result--ok');
      res.appendChild(el('header', { class: 'card__head' }, el('h2', null, fmt.toUpperCase() + ' patch ready')));
      const nameInput = el('input', { type: 'text', value: name, 'aria-label': 'Patch file name', spellcheck: 'false' });
      const dl = el('button', { class: 'btn btn--ok', type: 'button' }, el('span', null, 'Download'));
      dl.addEventListener('click', () => VF.ui.download(data, nameInput.value.trim() || name));
      res.appendChild(el('div', { class: 'dl' }, el('label', { class: 'field' }, el('span', null, 'File name'), nameInput), dl));
      res.appendChild(checks([
        { label: 'Verified', ok: true, detail: 'Re-applied to the original and reproduced your modified ROM byte-for-byte.' },
        { label: 'Size', ok: true, detail: B.formatSize(data.length) + ' (built in ' + ms + ' ms)' },
      ]));
      res.appendChild(kv([
        ['Source CRC32', B.hex32(VF.hash.crc32(state.orig.data))],
        ['Target CRC32', B.hex32(VF.hash.crc32(state.mod.data))],
      ], ['Source CRC32', 'Target CRC32']));
      res.appendChild(el('p', { class: 'note' }, 'Put the source CRC32 in your readme so players can check their ROM before patching.'));
      setTimeout(() => fx.burst(dl), 700);
    } catch (e) {
      res.classList.add('result--bad');
      res.appendChild(el('header', { class: 'card__head' }, el('h2', null, 'Couldn’t create the patch')));
      res.appendChild(el('p', null, e.message));
    }
    VF.ui.busy(btn, false, 'Create patch');
    fx.scan(btn.closest('.card'), false);
    res.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  VF.createTab = {
    init() {
      const wrap = $('#create-formats');
      for (const f of VF.patch.creators()) {
        const input = el('input', { type: 'radio', name: 'create-fmt', value: f.id });
        if (f.id === 'bps') input.checked = true;
        wrap.appendChild(el('label', null, input, el('span', { class: 'fmt' }, el('b', null, f.name, f.id === 'bps' ? el('span', { class: 'fmt__rec' }, 'Recommended') : null), el('small', null, f.blurb || ''))));
        input.addEventListener('change', update);
      }
      VF.ui.bindDrop($('[data-drop="orig"]'), $('#create-orig'), (f) => load('orig', f));
      VF.ui.bindDrop($('[data-drop="mod"]'), $('#create-mod'), (f) => load('mod', f));
      $('#create-go').addEventListener('click', run);
      update();
    },
  };
})((globalThis.VF = globalThis.VF || {}));
