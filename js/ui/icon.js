/*
 * Aether Lab — HOME-menu icon builder (Prism, Hologram, Aurora styles)
 * Draws a 256×256 icon (generated, or from your own image) and exports a
 * baseline JPEG under 128 KB — larger icons show up as "?" on HOME.
 */
(function (VF) {
  'use strict';

  const SIZE = 256;
  const MAX_BYTES = 0x20000;

  function wrapLines(ctx, text, maxWidth, maxLines) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width <= maxWidth || !line) line = test;
      else {
        lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      kept[maxLines - 1] = kept[maxLines - 1].replace(/\s*\S*$/, '') + '…';
      return kept;
    }
    return lines;
  }

  function fitTitle(ctx, title, family) {
    for (let size = 40; size >= 16; size -= 2) {
      ctx.font = '800 ' + size + 'px ' + family;
      const lines = wrapLines(ctx, title, 212, 3);
      const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
      if (widest <= 216 && !lines[lines.length - 1].endsWith('…')) return { size, lines };
    }
    ctx.font = '800 16px ' + family;
    return { size: 16, lines: wrapLines(ctx, title, 212, 4) };
  }

  const SPEC = ['#5ef2ff', '#8fb4ff', '#c49bff', '#ff8fd8', '#ffd29a', '#8affc8'];

  function seeded(str) {
    let seed = 0;
    for (const ch of str) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    return () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
  }

  /** The lab's crystal mark, drawn as facets. */
  function crystal(ctx, cx, cy, r, alpha) {
    const top = [cx, cy - r];
    const right = [cx + r * 0.8, cy - r * 0.1];
    const bottom = [cx, cy + r];
    const left = [cx - r * 0.8, cy - r * 0.1];
    const mid = [cx - r * 0.15, cy + r * 0.1];
    const facets = [
      [top, left, mid, '#5ef2ff'],
      [top, mid, right, '#ff8fd8'],
      [left, mid, bottom, '#8affc8'],
      [mid, right, bottom, '#ffd29a'],
    ];
    ctx.save();
    ctx.globalAlpha = alpha;
    for (const [a, b, c, col] of facets) {
      const g = ctx.createLinearGradient(a[0], a[1], c[0], c[1]);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(255,255,255,0.15)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(top[0], top[1]);
    ctx.lineTo(right[0], right[1]);
    ctx.lineTo(bottom[0], bottom[1]);
    ctx.lineTo(left[0], left[1]);
    ctx.closePath();
    ctx.moveTo(left[0], left[1]);
    ctx.lineTo(mid[0], mid[1]);
    ctx.lineTo(right[0], right[1]);
    ctx.moveTo(top[0], top[1]);
    ctx.lineTo(mid[0], mid[1]);
    ctx.lineTo(bottom[0], bottom[1]);
    ctx.stroke();
    ctx.restore();
  }

  /** Draw a generated icon onto the canvas. */
  function generate(canvas, opts) {
    const ctx = canvas.getContext('2d');
    const title = (opts.title || 'Forwarder').toUpperCase();
    const system = (opts.system || '').toUpperCase();
    const style = opts.style || 'prism';
    const display = "'Unbounded', 'Segoe UI', sans-serif";
    const mono = "'JetBrains Mono', monospace";
    const rnd = seeded(title + style);
    ctx.save();
    ctx.clearRect(0, 0, SIZE, SIZE);

    if (style === 'hologram') {
      ctx.fillStyle = '#07061a';
      ctx.fillRect(0, 0, SIZE, SIZE);
      // holographic foil sweep
      const foil = ctx.createLinearGradient(0, 0, SIZE, SIZE);
      SPEC.concat(SPEC[0]).forEach((c, i, arr) => foil.addColorStop(i / (arr.length - 1), c));
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = foil;
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.globalAlpha = 1;
      const shade = ctx.createRadialGradient(128, 120, 20, 128, 128, 190);
      shade.addColorStop(0, 'rgba(7,6,26,0.35)');
      shade.addColorStop(1, 'rgba(7,6,26,0.92)');
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (let y = 0; y < SIZE; y += 3) ctx.fillRect(0, y, SIZE, 1);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      for (let i = -SIZE; i < SIZE; i += 22) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + SIZE, SIZE);
        ctx.stroke();
      }
    } else if (style === 'aurora') {
      ctx.fillStyle = '#05040d';
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const g = ctx.createLinearGradient(0, 0, SIZE, 0);
        g.addColorStop(0, SPEC[(i + 0) % 6]);
        g.addColorStop(0.5, SPEC[(i + 2) % 6]);
        g.addColorStop(1, SPEC[(i + 4) % 6]);
        ctx.fillStyle = g;
        ctx.globalAlpha = 0.28;
        const base = 30 + i * 52;
        const ph = rnd() * 6;
        ctx.beginPath();
        ctx.moveTo(0, base);
        for (let x = 0; x <= SIZE; x += 8) ctx.lineTo(x, base + Math.sin(x / 40 + ph) * 18);
        for (let x = SIZE; x >= 0; x -= 8) ctx.lineTo(x, base + 34 + Math.sin(x / 34 + ph * 1.3) * 14);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    } else {
      // prism: deep ink with refracted light fanning from a crystal
      ctx.fillStyle = '#07061a';
      ctx.fillRect(0, 0, SIZE, SIZE);
      const halo = ctx.createRadialGradient(128, 56, 4, 128, 56, 220);
      halo.addColorStop(0, 'rgba(196,155,255,0.55)');
      halo.addColorStop(1, 'rgba(196,155,255,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.globalCompositeOperation = 'lighter';
      SPEC.forEach((c, i) => {
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(128, 60);
        ctx.lineTo(-40 + i * 62, SIZE + 10);
        ctx.lineTo(10 + i * 62, SIZE + 10);
        ctx.closePath();
        ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // light motes
    for (let i = 0; i < 28; i++) {
      const x = rnd() * SIZE;
      const y = rnd() * SIZE;
      const r = rnd() < 0.2 ? 1.6 : 0.9;
      ctx.globalAlpha = 0.25 + rnd() * 0.6;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    crystal(ctx, 128, 58, 30, 0.95);

    // title
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const fit = fitTitle(ctx, title, display);
    ctx.font = '800 ' + fit.size + 'px ' + display;
    const lh = fit.size * 1.08;
    const blockH = lh * fit.lines.length;
    let y = 152 - blockH / 2 + fit.size * 0.78;
    const tg = ctx.createLinearGradient(30, 0, 226, 0);
    tg.addColorStop(0, '#ffffff');
    tg.addColorStop(0.5, '#efe6ff');
    tg.addColorStop(1, '#ffffff');
    ctx.shadowColor = 'rgba(196,155,255,0.9)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = tg;
    for (const line of fit.lines) {
      ctx.fillText(line, 128, y);
      y += lh;
    }
    ctx.shadowBlur = 0;

    // system badge
    if (system) {
      ctx.font = '700 12px ' + mono;
      const label = system.length > 26 ? system.slice(0, 25) + '…' : system;
      const w = Math.min(224, ctx.measureText(label).width + 26);
      const x0 = 128 - w / 2;
      const bg = ctx.createLinearGradient(x0, 0, x0 + w, 0);
      bg.addColorStop(0, 'rgba(94,242,255,0.9)');
      bg.addColorStop(0.5, 'rgba(196,155,255,0.9)');
      bg.addColorStop(1, 'rgba(255,143,216,0.9)');
      ctx.fillStyle = 'rgba(7,6,26,0.78)';
      roundRect(ctx, x0, 214, w, 24, 12);
      ctx.fill();
      ctx.strokeStyle = bg;
      ctx.lineWidth = 1.5;
      roundRect(ctx, x0, 214, w, 24, 12);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, 128, 230.5);
    }
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Draw a user image (boxart etc.), cropped to fill or letterboxed to fit. */
  function drawImage(canvas, img, fit) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#060914';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const sw = img.naturalWidth || img.width;
    const sh = img.naturalHeight || img.height;
    const scale = fit === 'contain' ? Math.min(SIZE / sw, SIZE / sh) : Math.max(SIZE / sw, SIZE / sh);
    const w = sw * scale;
    const h = sh * scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('That image couldn’t be read. Try a PNG or JPEG.'));
      };
      img.src = url;
    });
  }

  function loadBytes(u8) {
    return loadImage(new Blob([u8], { type: 'image/jpeg' }));
  }

  /** Export as JPEG, stepping quality down until it fits under 128 KB. */
  async function toJpeg(canvas) {
    for (let q = 0.94; q > 0.3; q -= 0.06) {
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', q));
      if (blob && blob.size < MAX_BYTES) return new Uint8Array(await blob.arrayBuffer());
    }
    throw new Error('Couldn’t get the icon under 128 KB');
  }

  VF.icon = { generate, drawImage, loadImage, loadBytes, toJpeg, SIZE };
})((globalThis.VF = globalThis.VF || {}));
