/*
 * Aether Lab — 01 Patch tab
 */
(function (VF) {
  'use strict';

  const { $, el, kv, chip, checks, clear } = VF.ui;
  const B = VF.bytes;

  const state = { rom: null, patch: null, romHashes: null };
  const fx = VF.fx || { scan() {}, burst() {} };

  function romCard(info, name, u8) {
    const box = $('#patch-rom-info');
    clear(box).hidden = false;
    box.appendChild(el('p', { class: 'readout__title' }, el('span', null, info.name), chip(info.id === 'unknown' ? 'Generic' : 'Detected', info.id === 'unknown' ? 'warn' : 'ok')));
    box.appendChild(kv(info.rows));
    box.appendChild(VF.ui.hashPanel(u8, (h) => {
      state.romHashes = h;
      $('#patch-expect').hidden = false;
      compareExpected();
      refreshMatch();
    }));
    if (info.checksums.length) {
      box.appendChild(checks(info.checksums.map((c) => Object.assign({ label: c.label }, c.check(u8)))));
    }
    if (info.notes.length) box.appendChild(el('ul', { class: 'notes' }, info.notes.map((n) => el('li', null, n))));
  }

  function compareExpected() {
    const input = $('#patch-expect-input').value.trim().toLowerCase().replace(/^0x/, '').replace(/\s+/g, '');
    const out = $('#patch-expect-result');
    clear(out);
    if (!input || !state.romHashes) return;
    const h = state.romHashes;
    const hit = [['CRC32', h.crc32], ['MD5', h.md5], ['SHA-1', h.sha1]].find(([, v]) => v === input);
    if (hit) out.appendChild(chip('Match — ' + hit[0] + ' is identical', 'ok'));
    else if ([8, 32, 40].includes(input.length)) out.appendChild(chip('No match — this is a different dump', 'bad'));
    else out.appendChild(chip('Paste an 8, 32 or 40 character hash', 'warn'));
  }

  function patchCard(fmt, meta) {
    const box = $('#patch-file-info');
    clear(box).hidden = false;
    box.appendChild(el('p', { class: 'readout__title' }, el('span', null, fmt.name + ' patch'), chip('Valid', 'ok')));
    box.appendChild(kv(meta.rows));
    box.appendChild(el('div', { id: 'patch-match' }));
    refreshMatch();
  }

  /** Tell the user up-front whether this ROM is the one the patch wants. */
  function refreshMatch() {
    const slot = $('#patch-match');
    if (!slot || !state.patch || !state.rom) return;
    clear(slot);
    const want = state.patch.meta.expectedSourceCrc;
    if (want === undefined) {
      slot.appendChild(checks([{ label: 'Source check', ok: null, kind: 'info', detail: state.patch.fmt.id === 'xdelta' ? 'xdelta verifies while it patches.' : 'This format can’t confirm the ROM in advance.' }]));
      return;
    }
    if (!state.romHashes) return;
    const have = parseInt(state.romHashes.crc32, 16) >>> 0;
    if (have === want) {
      slot.appendChild(checks([{ label: 'Source ROM matches', ok: true, detail: 'CRC32 ' + B.hex32(want) }]));
      return;
    }
    const variant = VF.rom.variants(state.rom.data, state.rom.info).find((v) => VF.hash.crc32(v.data) === want);
    if (variant) {
      slot.appendChild(checks([{ label: 'Matches after a quick fix', ok: null, detail: 'Auto-fix will use your ROM ' + variant.label + '.' }]));
    } else {
      slot.appendChild(checks([{ label: 'Source ROM doesn’t match', ok: false, detail: 'Patch wants CRC32 ' + B.hex32(want) + '; yours is ' + state.romHashes.crc32 + '. Different region, revision, or a bad dump.' }]));
    }
  }

  function updateButton() {
    const ready = state.rom && state.patch;
    $('#patch-go').disabled = !ready;
    $('#patch-hint').textContent = ready ? 'Ready. ' + state.patch.fmt.name + ' → ' + state.rom.info.name : !state.rom ? 'Load a ROM to begin.' : 'Now load the patch.';
  }

  async function onRom(file) {
    try {
      const data = await VF.ui.readFile(file);
      const info = VF.rom.identify(data, file.name);
      state.rom = { name: file.name, data, info };
      state.romHashes = null;
      romCard(info, file.name, data);
      $('#opt-remove').disabled = !(info.header && info.header.removable && info.header.size);
      $('#opt-add').disabled = !(info.id === 'snes' && info.header && info.header.size === 0);
    } catch (e) {
      VF.ui.toast('Couldn’t read that file: ' + e.message, 'bad');
    }
    updateButton();
  }

  async function onPatch(file) {
    const box = $('#patch-file-info');
    try {
      const data = await VF.ui.readFile(file);
      const fmt = VF.patch.detect(data);
      if (!fmt) throw new VF.patch.PatchError('Not a patch format I recognise. If it’s a .zip or .7z, extract it first.');
      const meta = fmt.inspect(data);
      state.patch = { name: file.name, data, fmt, meta };
      patchCard(fmt, meta);
    } catch (e) {
      state.patch = null;
      clear(box).hidden = false;
      box.appendChild(checks([{ label: 'Can’t use this file', ok: false, detail: e.message }]));
    }
    updateButton();
  }

  async function run() {
    const btn = $('#patch-go');
    const res = $('#patch-result');
    VF.ui.busy(btn, true, 'Transmuting');
    fx.scan(btn.closest('.card'), true);
    await VF.ui.nextFrame();
    await new Promise((r) => setTimeout(r, 350)); // let the scan read as a scan
    clear(res).hidden = false;
    res.className = 'card card--wide result';
    try {
      const r = VF.engine.applyPatch(state.rom.data, state.rom.name, state.patch.data, state.patch.name, {
        autoFix: $('#opt-autofix').checked,
        fixChecksums: $('#opt-fixsum').checked,
        removeHeader: $('#opt-remove').checked,
        addHeader: $('#opt-add').checked,
        ignoreChecksums: $('#opt-force').checked,
      });
      const allOk = r.checks.every((c) => c.ok !== false);
      res.classList.add(allOk ? 'result--ok' : 'result--bad');
      res.appendChild(el('header', { class: 'card__head' }, el('h2', null, allOk ? 'Patched successfully' : 'Patched with warnings')));
      const nameInput = el('input', { type: 'text', value: r.outputName, 'aria-label': 'Output file name', spellcheck: 'false' });
      const dlBtn = el('button', { class: 'btn btn--ok', type: 'button' }, el('span', null, 'Download'));
      dlBtn.addEventListener('click', () => VF.ui.download(r.output, nameInput.value.trim() || r.outputName));
      res.appendChild(el('div', { class: 'dl' }, el('label', { class: 'field' }, el('span', null, 'File name'), nameInput), dlBtn));

      const list = r.checks.slice();
      r.log.forEach((l) => list.push({ label: l, ok: null, kind: 'info' }));
      r.checksumReport.forEach((c) => list.push({ label: c.label, ok: c.ok === null ? null : c.ok, detail: c.detail, kind: c.ok === null ? 'warn' : null }));
      res.appendChild(checks(list));
      res.appendChild(kv([['System', r.outputInfo.name], ['Size', B.formatSize(r.output.length)]]));
      res.appendChild(VF.ui.hashPanel(r.output));

      // Only in the full edition: the patcher edition ships without the forwarder.
      if (VF.forge && $('#panel-forge')) {
        const forgeBtn = el('button', { class: 'btn btn--ghost', type: 'button' }, 'Make a Switch forwarder for this hack');
        forgeBtn.addEventListener('click', () => {
          VF.forge.prefill({ title: VF.ui.cleanTitle(state.patch.name), romName: nameInput.value.trim() || r.outputName, romId: r.outputInfo.id });
          VF.app.show('forge');
        });
        res.appendChild(el('div', { class: 'actions' }, forgeBtn));
      }
      VF.ui.toast('Patched — ' + r.outputName);
      if (allOk) setTimeout(() => fx.burst(dlBtn), 700);
    } catch (e) {
      res.classList.add('result--bad');
      res.appendChild(el('header', { class: 'card__head' }, el('h2', null, 'Patch not applied')));
      res.appendChild(el('p', null, e.message));
      if (e.code === 'source-crc' || e.code === 'source-size' || e.code === 'block' || e.code === 'size') {
        res.appendChild(el('ul', { class: 'notes' },
          el('li', null, 'Compare your ROM against the checksum in the hack’s readme (Slot A).'),
          el('li', null, 'No-Intro / Redump verified dumps are what most hacks are built against.')));
      }
      if (!(e instanceof VF.patch.PatchError)) console.error(e);
    }
    VF.ui.busy(btn, false, 'Apply patch');
    fx.scan(btn.closest('.card'), false);
    res.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  VF.patchTab = {
    init() {
      VF.ui.bindDrop($('[data-drop="rom"]'), $('#patch-rom'), onRom);
      VF.ui.bindDrop($('[data-drop="patch"]'), $('#patch-file'), onPatch);
      $('#patch-go').addEventListener('click', run);
      $('#patch-expect-input').addEventListener('input', compareExpected);
      $('#opt-remove').addEventListener('change', () => { if ($('#opt-remove').checked) $('#opt-add').checked = false; });
      $('#opt-add').addEventListener('change', () => { if ($('#opt-add').checked) $('#opt-remove').checked = false; });
    },
  };
})((globalThis.VF = globalThis.VF || {}));
