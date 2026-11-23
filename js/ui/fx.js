/*
 * Aether Lab — effects engine
 *  · aurora:   ribbons of spectrum light, drawn on a tiny canvas and
 *              stretched full-screen (the upscale is the blur — cheap)
 *  · field:    drifting light motes + a slowly turning wireframe crystal,
 *              plus prism-shard bursts when something succeeds
 *  · pointer:  cursor glow, sheen on cards, gentle 3D tilt on drop zones
 *  · boot:     the start-up sequence (once per session)
 * Everything stops when the tab is hidden and collapses to a single still
 * frame for people who ask their OS for reduced motion.
 */
(function (VF) {
  'use strict';

  const fx = (VF.fx = {});
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(pointer: fine)').matches;
  const small = () => window.innerWidth < 640;
  const SPEC = [
    [94, 242, 255],
    [143, 180, 255],
    [196, 155, 255],
    [255, 143, 216],
    [255, 210, 154],
    [138, 255, 200],
  ];
  // deeper, more saturated cousins of the UI spectrum for the aurora (so no CSS filter is needed)
  const VIVID = [
    [0, 224, 255],
    [96, 128, 255],
    [168, 96, 255],
    [255, 72, 196],
    [255, 176, 96],
    [40, 255, 170],
  ];
  const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(Math.round);
  const specAt = (p, pal) => {
    const P = pal || SPEC;
    const x = (((p % 1) + 1) % 1) * P.length;
    const i = Math.floor(x);
    return mix(P[i], P[(i + 1) % P.length], x - i);
  };

  const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 3, nx: 0, ny: 0 };

  /* ================= aurora ================= */
  const aurora = { el: null, ctx: null, w: 0, h: 0, blur: 'none' };

  function sizeAurora() {
    const scale = small() ? 0.22 : 0.18;
    aurora.w = Math.max(60, Math.ceil(window.innerWidth * scale));
    aurora.h = Math.max(60, Math.ceil(window.innerHeight * scale));
    aurora.el.width = aurora.w;
    aurora.el.height = aurora.h;
  }

  function drawAurora(t) {
    const { ctx, w, h } = aurora;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#06050f';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.filter = aurora.blur;
    const ribbons = 4;
    for (let i = 0; i < ribbons; i++) {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      for (let s = 0; s <= 4; s++) g.addColorStop(s / 4, rgba(specAt(t * 0.015 + i * 0.21 + s * 0.18, VIVID), 1));
      ctx.fillStyle = g;
      ctx.globalAlpha = i === 0 ? 0.36 : 0.24;
      const base = h * (0.12 + i * 0.21) + pointer.ny * h * 0.03 * (i + 1);
      const top = [];
      const bot = [];
      const step = Math.max(2, w / 48);
      for (let x = -step; x <= w + step; x += step) {
        const u = x / w;
        const y =
          base +
          Math.sin(u * Math.PI * 2 * (0.7 + i * 0.25) + t * (0.18 + i * 0.05) + i * 1.7) * h * 0.09 +
          Math.sin(u * Math.PI * 2 * 1.9 - t * (0.11 + i * 0.03)) * h * 0.04;
        const thick = h * (0.07 + 0.05 * Math.sin(u * Math.PI * 3 + t * 0.35 + i * 2.1) + 0.03 * i);
        top.push([x, y]);
        bot.push([x, y + Math.max(h * 0.02, thick)]);
      }
      ctx.beginPath();
      ctx.moveTo(top[0][0], top[0][1]);
      for (const p of top) ctx.lineTo(p[0], p[1]);
      for (let k = bot.length - 1; k >= 0; k--) ctx.lineTo(bot[k][0], bot[k][1]);
      ctx.closePath();
      ctx.fill();
      // soft curtain above each ribbon
      ctx.globalAlpha *= 0.35;
      ctx.beginPath();
      ctx.moveTo(top[0][0], top[0][1]);
      for (const p of top) ctx.lineTo(p[0], p[1] - h * 0.12);
      for (let k = top.length - 1; k >= 0; k--) ctx.lineTo(top[k][0], top[k][1]);
      ctx.closePath();
      ctx.fill();
    }
    // vignette
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const v = ctx.createRadialGradient(w / 2, h * 0.4, Math.min(w, h) * 0.2, w / 2, h * 0.5, Math.max(w, h) * 0.8);
    v.addColorStop(0, 'rgba(6,5,15,0)');
    v.addColorStop(1, 'rgba(6,5,15,0.6)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  /* ================= field: motes, crystal, shards ================= */
  const field = { el: null, ctx: null, w: 0, h: 0, dpr: 1, motes: [], shards: [], sprites: [] };

  function makeSprites() {
    field.sprites = SPEC.map((c) => {
      const s = document.createElement('canvas');
      s.width = s.height = 48;
      const g = s.getContext('2d');
      const r = g.createRadialGradient(24, 24, 0, 24, 24, 24);
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(0.18, rgba(c, 0.9));
      r.addColorStop(0.5, rgba(c, 0.18));
      r.addColorStop(1, rgba(c, 0));
      g.fillStyle = r;
      g.fillRect(0, 0, 48, 48);
      return s;
    });
  }

  function sizeField() {
    field.dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    field.w = window.innerWidth;
    field.h = window.innerHeight;
    field.el.width = Math.round(field.w * field.dpr);
    field.el.height = Math.round(field.h * field.dpr);
    field.ctx.setTransform(field.dpr, 0, 0, field.dpr, 0, 0);
    const want = Math.round(Math.min(110, Math.max(28, (field.w * field.h) / 15000)));
    while (field.motes.length < want) field.motes.push(newMote(true));
    field.motes.length = want;
  }

  function newMote(anywhere) {
    return {
      x: Math.random() * field.w,
      y: anywhere ? Math.random() * field.h : field.h + 20,
      z: 0.3 + Math.random() * 0.9, // depth: size, speed, parallax
      c: (Math.random() * SPEC.length) | 0,
      p: Math.random() * Math.PI * 2,
      drift: (Math.random() - 0.5) * 0.25,
    };
  }

  // icosahedron
  const PHI = (1 + Math.sqrt(5)) / 2;
  const ICO_V = [
    [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
    [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
    [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
  ].map((v) => v.map((n) => n / Math.sqrt(1 + PHI * PHI)));
  const ICO_E = [];
  for (let a = 0; a < 12; a++) {
    for (let b = a + 1; b < 12; b++) {
      const d = Math.hypot(ICO_V[a][0] - ICO_V[b][0], ICO_V[a][1] - ICO_V[b][1], ICO_V[a][2] - ICO_V[b][2]);
      if (d < 1.1) ICO_E.push([a, b]);
    }
  }

  function drawCrystal(ctx, t) {
    const mobile = small();
    const size = mobile ? Math.min(field.w * 0.22, 96) : Math.min(field.w, field.h) * 0.2;
    const cx = (mobile ? field.w * 0.82 : field.w * 0.84) + pointer.nx * 14;
    const cy = (mobile ? 150 : field.h * 0.26) - window.scrollY * 0.12 + pointer.ny * 10;
    if (cy < -size * 2) return;
    const ay = t * 0.22 + pointer.nx * 0.4;
    const ax = t * 0.13 + pointer.ny * 0.3;
    const pts = ICO_V.map(([x, y, z]) => {
      let x1 = x * Math.cos(ay) + z * Math.sin(ay);
      let z1 = -x * Math.sin(ay) + z * Math.cos(ay);
      let y1 = y * Math.cos(ax) - z1 * Math.sin(ax);
      const z2 = y * Math.sin(ax) + z1 * Math.cos(ax);
      const persp = 2.6 / (2.6 + z2);
      return [cx + x1 * size * persp, cy + y1 * size * persp, z2];
    });
    ctx.globalCompositeOperation = 'lighter';
    // inner glow
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 1.6);
    glow.addColorStop(0, rgba(specAt(t * 0.03), 0.16));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - size * 1.6, cy - size * 1.6, size * 3.2, size * 3.2);
    ctx.lineWidth = mobile ? 0.8 : 1;
    for (const [a, b] of ICO_E) {
      const pa = pts[a];
      const pb = pts[b];
      const depth = (pa[2] + pb[2]) / 2; // -1 (front) .. 1 (back)
      const g = ctx.createLinearGradient(pa[0], pa[1], pb[0], pb[1]);
      g.addColorStop(0, rgba(specAt(t * 0.02 + a / 12), 0.55 - depth * 0.3));
      g.addColorStop(1, rgba(specAt(t * 0.02 + b / 12), 0.55 - depth * 0.3));
      ctx.strokeStyle = g;
      ctx.beginPath();
      ctx.moveTo(pa[0], pa[1]);
      ctx.lineTo(pb[0], pb[1]);
      ctx.stroke();
    }
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const s = (mobile ? 10 : 14) * (1.2 - p[2] * 0.5);
      ctx.globalAlpha = 0.8 - p[2] * 0.4;
      ctx.drawImage(field.sprites[i % SPEC.length], p[0] - s / 2, p[1] - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  function drawField(t, dt) {
    const ctx = field.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, field.w, field.h);
    drawCrystal(ctx, t);
    ctx.globalCompositeOperation = 'lighter';
    for (const m of field.motes) {
      m.y -= (6 + 16 * m.z) * dt;
      m.x += (m.drift + Math.sin(t * 0.3 + m.p) * 0.15) * dt * 10;
      if (m.y < -20) Object.assign(m, newMote(false));
      const tw = 0.45 + 0.55 * Math.sin(t * (0.8 + m.z) + m.p);
      const s = (4 + 10 * m.z) * (0.7 + 0.3 * tw);
      ctx.globalAlpha = 0.2 + 0.55 * tw * m.z;
      ctx.drawImage(field.sprites[m.c], m.x + pointer.nx * 18 * m.z - s / 2, m.y + pointer.ny * 12 * m.z - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  /* sparks: success bursts, drawn above the interface */
  const sparks = { el: null, ctx: null, dirty: false };
  function sizeSparks() {
    sparks.el.width = Math.round(field.w * field.dpr);
    sparks.el.height = Math.round(field.h * field.dpr);
    sparks.ctx.setTransform(field.dpr, 0, 0, field.dpr, 0, 0);
  }
  function drawSparks(dt) {
    if (!field.shards.length && !sparks.dirty) return;
    const ctx = sparks.ctx;
    ctx.clearRect(0, 0, field.w, field.h);
    sparks.dirty = field.shards.length > 0;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = field.shards.length - 1; i >= 0; i--) {
      const s = field.shards[i];
      s.life -= dt;
      if (s.life <= 0) {
        field.shards.splice(i, 1);
        continue;
      }
      s.vy += 320 * dt;
      s.vx *= 0.985;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.spin * dt;
      const a = Math.min(1, s.life / 0.6);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.globalAlpha = a;
      ctx.fillStyle = rgba(SPEC[s.c], 1);
      ctx.beginPath();
      ctx.moveTo(0, -s.size);
      ctx.lineTo(s.size * 0.45, 0);
      ctx.lineTo(0, s.size);
      ctx.lineTo(-s.size * 0.45, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      if (s.sparkle) ctx.drawImage(field.sprites[s.c], s.x - 9, s.y - 9, 18, 18);
    }
    ctx.globalAlpha = 1;
  }

  /* ================= loop ================= */
  let last = 0;
  let acc = 0;
  let running = false;
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    const t = now / 1000;
    acc += dt;
    if (acc > (small() ? 1 / 20 : 1 / 30)) {
      drawAurora(t);
      acc = 0;
    }
    drawField(t, dt);
    drawSparks(dt);
    requestAnimationFrame(frame);
  }
  function start() {
    if (running || reduce) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
  }
  function still() {
    drawAurora(12);
    drawField(12, 0);
  }

  /* ================= pointer ================= */
  let pendingMove = null;
  let moveQueued = false;
  function onMove(e) {
    pendingMove = e;
    if (moveQueued) return;
    moveQueued = true;
    requestAnimationFrame(() => {
      moveQueued = false;
      applyMove();
    });
  }
  function applyMove() {
    const e = pendingMove;
    if (!e) return;
    pendingMove = null;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.nx = e.clientX / window.innerWidth - 0.5;
    pointer.ny = e.clientY / window.innerHeight - 0.5;
    const glow = document.getElementById('glow');
    if (glow) glow.style.transform = 'translate3d(' + e.clientX + 'px,' + e.clientY + 'px,0)';
    document.body.classList.add('has-pointer');
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const card = target.closest('.card');
    if (card) {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%');
      card.style.setProperty('--my', ((e.clientY - r.top) / r.height) * 100 + '%');
    }
    const tilt = target.closest('.drop, .holo-tile');
    if (tilt) {
      const r = tilt.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      const amt = tilt.classList.contains('holo-tile') ? 14 : 5;
      tilt.style.setProperty('--ty', (px * amt).toFixed(2) + 'deg');
      tilt.style.setProperty('--tx', (-py * amt).toFixed(2) + 'deg');
      if (tilt.classList.contains('holo-tile')) {
        tilt.style.setProperty('--fx', (50 + px * 100).toFixed(1) + '%');
        tilt.style.setProperty('--fy', (50 + py * 100).toFixed(1) + '%');
      }
      if (fx._tilted && fx._tilted !== tilt) resetTilt(fx._tilted);
      fx._tilted = tilt;
    } else if (fx._tilted) {
      resetTilt(fx._tilted);
      fx._tilted = null;
    }
  }
  function resetTilt(el) {
    el.style.setProperty('--tx', '0deg');
    el.style.setProperty('--ty', '0deg');
  }

  /* ================= public API ================= */
  fx.moveInk = function (tab) {
    const ink = document.getElementById('tab-ink');
    if (!ink || !tab) return;
    ink.style.width = tab.offsetWidth + 'px';
    ink.style.transform = 'translateX(' + tab.offsetLeft + 'px)';
    const track = tab.parentElement;
    if (track && (tab.offsetLeft < track.scrollLeft || tab.offsetLeft + tab.offsetWidth > track.scrollLeft + track.clientWidth)) {
      track.scrollTo({ left: tab.offsetLeft - 20, behavior: reduce ? 'auto' : 'smooth' });
    }
  };

  /** Laser sweep across a card while something heavy runs. */
  fx.scan = function (card, on) {
    if (!card) return;
    let bar = card.querySelector(':scope > .card__scan');
    if (on) {
      if (!bar) {
        bar = document.createElement('span');
        bar.className = 'card__scan';
        bar.setAttribute('aria-hidden', 'true');
        card.appendChild(bar);
      }
      card.classList.add('is-scanning', 'is-live');
    } else {
      card.classList.remove('is-scanning', 'is-live');
      if (bar) bar.remove();
    }
  };

  /** Burst of prism shards from an element (success moments). */
  fx.burst = function (el, count) {
    if (reduce || !el) return;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const n = count || (small() ? 34 : 60);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 160 + Math.random() * 380;
      field.shards.push({
        x: x + (Math.random() - 0.5) * r.width * 0.6,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 260,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 12,
        size: 3 + Math.random() * 6,
        c: (Math.random() * SPEC.length) | 0,
        life: 1 + Math.random() * 0.9,
        sparkle: Math.random() < 0.35,
      });
    }
  };

  /** Start-up sequence: once per browser session, skippable. */
  fx.boot = function () {
    const body = document.body;
    let seen = false;
    try {
      seen = sessionStorage.getItem('aether-booted') === '1';
      sessionStorage.setItem('aether-booted', '1');
    } catch (e) {
      seen = false;
    }
    if (reduce || seen) {
      body.classList.remove('is-booting');
      return;
    }
    const log = document.getElementById('boot-log');
    const bar = document.querySelector('.boot__bar i');
    const lines = ['Calibrating prism array', 'Loading reagents · IPS BPS UPS xdelta PPF APS', 'Indexing 20+ console signatures', 'Sealing lab · network disabled', 'Lab online'];
    let i = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      body.classList.remove('is-booting');
      window.removeEventListener('keydown', finish);
      document.getElementById('boot').removeEventListener('click', finish);
    };
    window.addEventListener('keydown', finish);
    document.getElementById('boot').addEventListener('click', finish);
    const tick = () => {
      if (done) return;
      if (log.lastElementChild) log.lastElementChild.classList.add('ok');
      if (i < lines.length) {
        const li = document.createElement('li');
        li.textContent = lines[i];
        log.appendChild(li);
        i++;
        bar.style.width = Math.round((i / lines.length) * 100) + '%';
        setTimeout(tick, 280);
      } else setTimeout(finish, 320);
    };
    setTimeout(tick, 250);
  };

  fx.init = function () {
    aurora.el = document.getElementById('aurora');
    field.el = document.getElementById('field');
    if (!aurora.el || !field.el) return;
    aurora.ctx = aurora.el.getContext('2d');
    // Soften the ribbons: canvas filters are cheap on the tiny canvas; where
    // they aren't supported (older Safari) blur the element with CSS instead.
    if (typeof aurora.ctx.filter === 'string') aurora.blur = 'blur(5px)';
    else {
      aurora.blur = 'none';
      aurora.el.style.filter = 'blur(26px)';
    }
    field.ctx = field.el.getContext('2d');
    sparks.el = document.getElementById('sparks');
    sparks.ctx = sparks.el.getContext('2d');
    makeSprites();
    sizeAurora();
    sizeField();
    sizeSparks();
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        sizeAurora();
        sizeField();
        sizeSparks();
        if (reduce) still();
        const sel = document.querySelector('.tab[aria-selected="true"]');
        fx.moveInk(sel);
      }, 120);
    });
    if (reduce) {
      still();
      return;
    }
    if (fine) window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    start();
  };
})((globalThis.VF = globalThis.VF || {}));
