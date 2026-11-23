/*
 * Aether Lab — app shell: tab routing and start-up
 *
 * The station list comes from the tabs in the page, so an edition built
 * without the forwarder (tools/build-patcher.js) needs no code changes here.
 */
(function (VF) {
  'use strict';

  const { $, $$ } = VF.ui;
  let TABS = [];

  /** Number the stations 01, 02… in the order their tabs appear. */
  function numberStations() {
    TABS.forEach((name, i) => {
      const no = String(i + 1).padStart(2, '0');
      const tabNo = $('#tab-' + name + ' .tab__no');
      const kicker = $('#panel-' + name + ' .station-no');
      if (tabNo) tabNo.textContent = no;
      if (kicker) kicker.textContent = no;
    });
  }

  function show(name, focus) {
    if (!TABS.includes(name)) name = 'patch';
    for (const t of TABS) {
      const tab = $('#tab-' + t);
      const panel = $('#panel-' + t);
      const on = t === name;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panel.hidden = !on;
    }
    if (VF.fx) VF.fx.moveInk($('#tab-' + name));
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    if (focus) $('#tab-' + name).focus();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function init() {
    TABS = $$('.tab').map((tab) => tab.dataset.tab);
    numberStations();
    $$('.tab').forEach((tab) => {
      tab.addEventListener('click', () => show(tab.dataset.tab));
      tab.addEventListener('keydown', (e) => {
        const i = TABS.indexOf(tab.dataset.tab);
        if (e.key === 'ArrowRight') show(TABS[(i + 1) % TABS.length], true);
        else if (e.key === 'ArrowLeft') show(TABS[(i + TABS.length - 1) % TABS.length], true);
        else return;
        e.preventDefault();
      });
    });
    $('.brand').addEventListener('click', (e) => {
      e.preventDefault();
      show('patch');
    });
    window.addEventListener('hashchange', () => show(location.hash.slice(1)));
    // Stop the browser from opening a file dropped outside a drop zone.
    ['dragover', 'drop'].forEach((ev) => window.addEventListener(ev, (e) => e.preventDefault()));

    if (VF.fx) {
      VF.fx.init();
      VF.fx.boot();
    }
    VF.patchTab.init();
    VF.createTab.init();
    if (VF.forge && $('#panel-forge')) VF.forge.init();
    VF.labTab.init();
    show(location.hash.slice(1) || 'patch');
    // fonts change tab widths — re-seat the sliding indicator once they load
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => VF.fx && VF.fx.moveInk($('.tab[aria-selected="true"]')));
  }

  VF.app = { show };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})((globalThis.VF = globalThis.VF || {}));
