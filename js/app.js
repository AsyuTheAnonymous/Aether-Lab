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

  /** "Add to Home Screen" details. Only over HTTP(S): from file:// the browser refuses the manifest and logs an error. */
  function linkManifest() {
    if (!/^https?:$/.test(location.protocol) || $('link[rel="manifest"]')) return;
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = 'manifest.webmanifest';
    document.head.appendChild(link);
  }

  /** Darken the strip behind the tab bar once it sticks, so scrolled content doesn't show around it. */
  function watchStuck() {
    const bar = $('.tabs');
    if (!bar) return;
    let queued = false;
    const update = () => {
      queued = false;
      bar.classList.toggle('is-stuck', bar.getBoundingClientRect().top <= 0 && window.scrollY > 0);
    };
    window.addEventListener('scroll', () => {
      if (!queued) { queued = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  function init() {
    linkManifest();
    watchStuck();
    TABS = $$('.tab').map((tab) => tab.dataset.tab);
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
