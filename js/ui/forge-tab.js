/*
 * Aether Lab — 03 NSP Forge tab
 */
(function (VF) {
  'use strict';

  const { $, $$, el, kv, chip, checks, clear } = VF.ui;
  const B = VF.bytes;
  const FW = VF.forwarder;
  const fx = VF.fx || { scan() {}, burst() {} };

  const state = {
    keys: null,
    mode: 'retro',
    image: null, // user-supplied HTMLImageElement
    nroIcon: null,
    randomTid: null,
  };

  const mode = () => (document.querySelector('input[name="forge-mode"]:checked') || {}).value || 'retro';
  const fit = () => (document.querySelector('input[name="forge-fit"]:checked') || {}).value || 'cover';

  /* ---------------- keys ---------------- */
  async function onKeys(file) {
    const box = $('#forge-keys-info');
    clear(box).hidden = false;
    try {
      const text = await VF.ui.readText(file);
      state.keys = VF.keys.load(text);
      box.appendChild(el('p', { class: 'readout__title' }, el('span', null, 'Keys loaded'), chip(state.keys.count + ' entries', 'ok')));
      box.appendChild(checks(state.keys.status));
    } catch (e) {
      state.keys = null;
      box.appendChild(checks([{ label: 'Keys not usable', ok: false, detail: e.message }]));
    }
    refresh();
  }

  /* ---------------- target ---------------- */
  function fillSystems() {
    const sel = $('#forge-system');
    for (const s of VF.cores.SYSTEMS) sel.appendChild(el('option', { value: s.id }, s.name));
    sel.value = 'snes';
    fillCores();
  }

  function fillCores() {
    const sys = VF.cores.SYSTEMS.find((s) => s.id === $('#forge-system').value);
    const sel = clear($('#forge-core'));
    for (const c of sys.cores) sel.appendChild(el('option', { value: c }, c));
    sel.appendChild(el('option', { value: '__custom' }, 'Custom path…'));
    $('#forge-corepath').value = VF.cores.corePath(sys.cores[0]);
    $('#forge-corepath').readOnly = true;
    const rp = $('#forge-rompath');
    if (!rp.value || /^sdmc:\/roms\/[^/]+\/$/.test(rp.value) || rp.dataset.auto === '1') {
      const file = rp.dataset.file || '';
      rp.value = 'sdmc:/roms/' + sys.folder + '/' + file;
      rp.dataset.auto = '1';
    }
  }

  function onCore() {
    const v = $('#forge-core').value;
    const cp = $('#forge-corepath');
    if (v === '__custom') {
      cp.readOnly = false;
      cp.focus();
      cp.select();
    } else {
      cp.readOnly = true;
      cp.value = VF.cores.corePath(v);
    }
    refresh();
  }

  function onRomPick(file) {
    const rp = $('#forge-rompath');
    const e = VF.rom.ext(file.name);
    const sys = VF.cores.forExtension(e);
    if (sys && sys.id !== $('#forge-system').value) {
      $('#forge-system').value = sys.id;
    }
    rp.dataset.file = file.name;
    rp.dataset.auto = '1';
    rp.value = '';
    fillCores();
    if (!$('#forge-title').value) $('#forge-title').value = VF.ui.cleanTitle(file.name);
    refresh();
  }

  async function onNro(file) {
    try {
      const data = await VF.ui.readFile(file);
      const info = VF.switchmeta.readNro(data);
      if (info.title && !$('#forge-title').value) $('#forge-title').value = info.title;
      if (info.publisher && !$('#forge-publisher').value) $('#forge-publisher').value = info.publisher;
      if (info.version) $('#forge-version').value = info.version.slice(0, 15);
      if (!$('#forge-nropath').value) $('#forge-nropath').value = 'sdmc:/switch/' + file.name;
      if (info.icon) {
        state.image = await VF.icon.loadBytes(info.icon);
        drawIcon();
        VF.ui.toast('Read title and icon from ' + file.name);
      }
    } catch (e) {
      VF.ui.toast(e.message, 'bad');
    }
    refresh();
  }

  /* ---------------- derived values ---------------- */
  function target() {
    if (mode() === 'retro') {
      const nroPath = FW.normalizePath($('#forge-corepath').value);
      const romPath = $('#forge-rompath').value.trim() ? FW.normalizePath($('#forge-rompath').value) : '';
      return { nroPath, romPath, extra: '' };
    }
    return { nroPath: FW.normalizePath($('#forge-nropath').value), romPath: '', extra: $('#forge-args').value.trim() };
  }

  function titleId(t) {
    const m = $('#forge-tidmode').value;
    const input = $('#forge-tid');
    if (m === 'manual') {
      input.readOnly = false;
      return FW.parseTitleId(input.value);
    }
    input.readOnly = true;
    let id;
    if (m === 'random') {
      if (!state.randomTid) state.randomTid = FW.randomTitleId();
      id = state.randomTid;
    } else {
      id = FW.deterministicTitleId(t.nroPath, FW.argvFor(t.nroPath, t.romPath, t.extra));
    }
    input.value = FW.tidHex(id).toUpperCase();
    return id;
  }

  function systemLabel() {
    if (mode() !== 'retro') return 'Homebrew';
    const s = VF.cores.SYSTEMS.find((x) => x.id === $('#forge-system').value);
    return s ? s.name : '';
  }

  function drawIcon() {
    const c = $('#forge-icon');
    if (state.image) VF.icon.drawImage(c, state.image, fit());
    else VF.icon.generate(c, { title: $('#forge-title').value.trim() || 'Forwarder', system: systemLabel(), style: $('#forge-iconstyle').value });
  }

  /* ---------------- summary + button state ---------------- */
  function refresh() {
    state.mode = mode();
    $('#forge-retro').hidden = state.mode !== 'retro';
    $('#forge-nro').hidden = state.mode !== 'nro';
    const sum = clear($('#forge-summary'));
    const hint = $('#forge-hint');
    let problem = null;
    let t = null;
    let tid = null;
    try {
      t = target();
      if (!t.nroPath || !/\.nro$/i.test(t.nroPath)) problem = state.mode === 'retro' ? 'Choose a core.' : 'Enter the .nro path on your SD card.';
      else if (state.mode === 'retro' && (!t.romPath || /\/$/.test(t.romPath))) problem = 'Enter the ROM’s path on your SD card (include the file name).';
      tid = titleId(t);
    } catch (e) {
      problem = e.message;
    }
    if (!problem && !$('#forge-title').value.trim()) problem = 'Give it a title.';
    if (!state.keys) problem = 'Load your prod.keys (step 1).';

    if (t && t.nroPath) {
      const argv = FW.argvFor(t.nroPath, t.romPath, t.extra);
      sum.appendChild(kv([
        ['Launches', el('code', null, t.nroPath)],
        ['Arguments', el('code', null, argv)],
        ['Title ID', tid !== null ? FW.tidHex(tid).toUpperCase() : '—'],
        ['Installs as', ($('#forge-title').value.trim() || 'Untitled') + ', by ' + ($('#forge-publisher').value.trim() || 'Aether Lab')],
      ]));
    }
    $('#forge-go').disabled = !!problem;
    hint.textContent = problem || 'Ready. Builds in a second or two.';
    drawIcon();
  }

  /* ---------------- build ---------------- */
  async function run() {
    const btn = $('#forge-go');
    const res = $('#forge-result');
    VF.ui.busy(btn, true, 'Crystallizing');
    fx.scan(btn.closest('.card'), true);
    clear(res).hidden = false;
    res.className = 'card card--wide result';
    try {
      const t = target();
      const icon = await VF.icon.toJpeg($('#forge-icon'));
      const out = await FW.build(
        {
          keys: state.keys,
          title: $('#forge-title').value,
          publisher: $('#forge-publisher').value,
          version: $('#forge-version').value.trim() || '1.0.0',
          titleId: titleId(t),
          nroPath: t.nroPath,
          romPath: t.romPath,
          extraArgs: t.extra,
          icon,
          profileSelect: $('#forge-profile').checked,
        },
        (s) => ($('#forge-hint').textContent = s + '…')
      );
      res.classList.add(out.report.ok ? 'result--ok' : 'result--bad');
      res.appendChild(el('header', { class: 'card__head' }, el('h2', null, out.report.ok ? 'NSP ready to install' : 'Built, but verification failed')));
      const nameInput = el('input', { type: 'text', value: out.fileName, 'aria-label': 'NSP file name', spellcheck: 'false' });
      const dl = el('button', { class: 'btn btn--ok', type: 'button' }, el('span', null, 'Download NSP'));
      dl.addEventListener('click', () => {
        let n = nameInput.value.trim() || out.fileName;
        if (!/\.nsp$/i.test(n)) n += '.nsp';
        VF.ui.download(out.nsp, n);
      });
      res.appendChild(el('div', { class: 'dl' }, el('label', { class: 'field' }, el('span', null, 'File name'), nameInput), dl));
      res.appendChild(kv([
        ['Title ID', out.titleId],
        ['Size', B.formatSize(out.nsp.length)],
        ['Launches', el('code', null, out.argv)],
        ['Contents', out.contents.map((c) => c.kind + ' ' + c.id.slice(0, 8) + '…').join(', ')],
      ]));
      const list = out.report.checks.slice();
      if (!out.signed) list.push({ label: 'Signature #2', ok: null, detail: 'Skipped — open this page over HTTPS so the browser’s crypto is available.' });
      res.appendChild(checks(list));
      res.appendChild(el('ol', { class: 'steps' },
        el('li', null, 'Copy the .nsp to your SD card (or serve it to Goldleaf over USB with Quark).'),
        el('li', null, 'Goldleaf → Explore content → SD card → select the .nsp → Install → SD card.'),
        el('li', null, state.mode === 'retro' ? 'Make sure the ROM is at ' + out.romPath.replace(/^sdmc:/, '') + ' and the core NRO exists.' : 'Make sure ' + out.nroPath.replace(/^sdmc:/, '') + ' exists on the SD card.'),
        el('li', null, 'Needs Atmosphère with current sigpatches. If it closes with an error at launch, update your sigpatches.')));
      VF.ui.toast('Forged ' + out.fileName);
      if (out.report.ok) setTimeout(() => fx.burst(dl), 700);
    } catch (e) {
      res.classList.add('result--bad');
      res.appendChild(el('header', { class: 'card__head' }, el('h2', null, 'Forge failed')));
      res.appendChild(el('p', null, e.message));
      console.error(e);
    }
    VF.ui.busy(btn, false, 'Forge NSP');
    fx.scan(btn.closest('.card'), false);
    refresh();
    res.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  VF.forge = {
    init() {
      fillSystems();
      VF.ui.bindDrop($('[data-drop="keys"]'), $('#forge-keys'), onKeys);
      VF.ui.bindDrop($('[data-drop="nro"]'), $('#forge-nrofile'), onNro);
      $('#forge-rompick').addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        if (f) onRomPick(f);
        e.target.value = '';
      });
      $('#forge-iconfile').addEventListener('change', async (e) => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!f) return;
        try {
          state.image = await VF.icon.loadImage(f);
          drawIcon();
        } catch (err) {
          VF.ui.toast(err.message, 'bad');
        }
      });
      $('#forge-icon-reset').addEventListener('click', () => {
        state.image = null;
        drawIcon();
      });
      $('#forge-system').addEventListener('change', () => {
        fillCores();
        refresh();
      });
      $('#forge-core').addEventListener('change', onCore);
      $('#forge-rompath').addEventListener('input', () => ($('#forge-rompath').dataset.auto = '0'));
      $('#forge-tidmode').addEventListener('change', () => {
        if ($('#forge-tidmode').value === 'random') state.randomTid = FW.randomTitleId();
        refresh();
      });
      $$('#panel-forge input, #panel-forge select').forEach((n) => {
        if (n.type !== 'file') n.addEventListener('input', refresh);
        if (n.type === 'radio' || n.tagName === 'SELECT') n.addEventListener('change', refresh);
      });
      $('#forge-go').addEventListener('click', run);
      // fonts may arrive after first paint — redraw the generated icon
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawIcon);
      refresh();
    },

    /** Called from the Patch tab: "make a forwarder for this hack". */
    prefill({ title, romName, romId }) {
      const sys = VF.cores.forRomId(romId) || VF.cores.forExtension(VF.rom.ext(romName));
      document.querySelector('input[name="forge-mode"][value="retro"]').checked = true;
      if (sys) $('#forge-system').value = sys.id;
      const rp = $('#forge-rompath');
      rp.dataset.file = romName;
      rp.dataset.auto = '1';
      rp.value = '';
      fillCores();
      if (title) $('#forge-title').value = title;
      refresh();
    },
  };
})((globalThis.VF = globalThis.VF || {}));
