/*
 * Aether Lab — console detection, headers and checksum repair
 * Works out what system a ROM/disc image is for (by header first,
 * extension second), shows its internal info, and knows the header and
 * byte-order quirks that make patches fail.
 */
(function (VF) {
  'use strict';

  const B = VF.bytes;
  const ext = (name) => (name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
  const u16be = (u8, o) => (u8[o] << 8) | u8[o + 1];
  const u16le = (u8, o) => u8[o] | (u8[o + 1] << 8);
  const u32be = (u8, o) => ((u8[o] << 24) | (u8[o + 1] << 16) | (u8[o + 2] << 8) | u8[o + 3]) >>> 0;
  const isPow2 = (n) => n > 0 && (n & (n - 1)) === 0;
  const hex = (n, w) => '0x' + n.toString(16).toUpperCase().padStart(w || 4, '0');
  const matchAt = (u8, o, s) => {
    if (o + s.length > u8.length) return false;
    for (let i = 0; i < s.length; i++) if (u8[o + i] !== s.charCodeAt(i)) return false;
    return true;
  };

  /* ---------------- SNES ---------------- */
  function snesHeaderScore(u8, base) {
    if (base + 0x40 > u8.length) return { score: -99 };
    const chk = u16le(u8, base + 0x1e);
    const cmp = u16le(u8, base + 0x1c);
    const map = u8[base + 0x15];
    let score = 0;
    if (((chk + cmp) & 0xffff) === 0xffff) score += 4;
    if ((map & 0xe0) === 0x20) score += 2;
    if (u8[base + 0x17] >= 0x07 && u8[base + 0x17] <= 0x0d) score += 1; // ROM size
    if (u8[base + 0x19] <= 0x14) score += 1; // region
    const reset = u16le(u8, base + 0x3c);
    if (reset >= 0x8000) score += 2;
    let printable = 0;
    for (let i = 0; i < 21; i++) {
      const c = u8[base + i];
      if (c >= 0x20 && c < 0x7f) printable++;
    }
    if (printable >= 18) score += 2;
    return { score, chk, cmp, map };
  }

  function snesInfo(u8) {
    const hdr = u8.length % 1024 === 512 ? 512 : 0;
    const body = hdr ? u8.subarray(512) : u8;
    const cands = [
      { name: 'LoROM', base: 0x7fc0 },
      { name: 'HiROM', base: 0xffc0 },
      { name: 'ExHiROM', base: 0x40ffc0 },
    ].map((c) => Object.assign(c, snesHeaderScore(body, c.base)));
    cands.sort((a, b) => b.score - a.score);
    const best = cands[0];
    return { copierHeader: hdr, body, layout: best.score > 2 ? best : null };
  }

  /**
   * SNES checksum: byte sum, with the part past the largest power of two
   * mirrored up to fill it. The four checksum/complement bytes are counted
   * as FF FF 00 00 so the result doesn't depend on what's stored there.
   */
  function snesChecksum(body, hdr) {
    const size = body.length;
    let base = 1;
    while (base * 2 <= size) base *= 2;
    let sum = 0;
    for (let i = 0; i < base; i++) sum += body[i];
    let mirror = 1;
    if (size > base) {
      const rest = size - base;
      let restSum = 0;
      for (let i = base; i < size; i++) restSum += body[i];
      while (rest * mirror < base) mirror *= 2;
      sum += restSum * mirror;
    }
    if (hdr !== undefined) {
      const stored = body[hdr + 0x1c] + body[hdr + 0x1d] + body[hdr + 0x1e] + body[hdr + 0x1f];
      sum += (0x1fe - stored) * (hdr < base ? 1 : mirror);
    }
    return sum & 0xffff;
  }

  /* ---------------- Game Boy / GBA / DS ---------------- */
  function gbHeaderChecksum(u8) {
    let x = 0;
    for (let i = 0x134; i <= 0x14c; i++) x = (x - u8[i] - 1) & 0xff;
    return x;
  }
  function gbGlobalChecksum(u8) {
    let s = 0;
    for (let i = 0; i < u8.length; i++) if (i !== 0x14e && i !== 0x14f) s += u8[i];
    return s & 0xffff;
  }
  function gbaComplement(u8) {
    let c = 0;
    for (let i = 0xa0; i <= 0xbc; i++) c = (c - u8[i]) & 0xff;
    return (c - 0x19) & 0xff;
  }
  function mdChecksum(u8) {
    let s = 0;
    for (let i = 0x200; i + 1 < u8.length; i += 2) s = (s + ((u8[i] << 8) | u8[i + 1])) & 0xffff;
    if (u8.length & 1) s = (s + (u8[u8.length - 1] << 8)) & 0xffff;
    return s;
  }

  /* ---------------- disc images ---------------- */
  function isoInfo(u8) {
    // ISO9660 primary volume descriptor at sector 16
    if (matchAt(u8, 0x8001, 'CD001')) return { mode: 'ISO (2048-byte sectors)', pvd: 0x8000 };
    if (matchAt(u8, 0x9319, 'CD001')) return { mode: 'Raw BIN (2352-byte sectors)', pvd: 0x9318 };
    return null;
  }

  /**
   * Main entry: returns
   *   { id, name, rows: [[label, value]], header, checksums: [...], notes: [] }
   */
  function identify(u8, filename) {
    const e = ext(filename || '');
    const rows = [];
    const notes = [];
    const checksums = [];
    let id = 'unknown';
    let name = 'Unknown / generic binary';
    let header = null;

    const n64 = VF.n64.order(u8);
    if (n64) {
      id = 'n64';
      name = 'Nintendo 64';
      const z = n64 === 'z64' ? u8 : VF.n64.toZ64(u8.subarray(0, Math.min(u8.length, 0x201000)));
      rows.push(['Byte order', { z64: '.z64 big-endian (native)', v64: '.v64 byte-swapped', n64: '.n64 little-endian' }[n64]]);
      rows.push(['Internal title', B.printable(z, 0x20, 20) || '—']);
      rows.push(['Game code', B.printable(z, 0x3b, 4) + '  (rev ' + z[0x3f] + ')']);
      const cic = VF.n64.cic(z);
      rows.push(['Boot chip', cic ? 'CIC-NUS-' + cic : 'Unknown / custom IPL3']);
      if (n64 !== 'z64') notes.push('Most N64 patches target .z64 byte order. Aether Lab converts automatically when a checksummed patch needs it.');
      checksums.push({
        id: 'n64crc',
        label: 'N64 boot CRC',
        check(data) {
          const zz = VF.n64.order(data) === 'z64' ? data : VF.n64.toZ64(data);
          const calc = VF.n64.calcCrc(zz);
          if (!calc) return { ok: null, detail: 'Unknown CIC or ROM under 2 MB — can’t verify' };
          const hdr = VF.n64.headerCrc(zz);
          const ok = calc.crc1 === hdr.crc1 && calc.crc2 === hdr.crc2;
          return { ok, detail: ok ? 'valid (CIC ' + calc.cic + ')' : 'header ' + B.hex32(hdr.crc1) + ' ' + B.hex32(hdr.crc2) + ' ≠ computed ' + B.hex32(calc.crc1) + ' ' + B.hex32(calc.crc2) };
        },
        fix(data) {
          const order = VF.n64.order(data);
          const zz = order === 'z64' ? data : VF.n64.toZ64(data);
          if (!VF.n64.fixCrc(zz)) return data;
          return VF.n64.fromZ64(zz, order);
        },
      });
    } else if (matchAt(u8, 0, 'NES\u001a')) {
      id = 'nes';
      name = 'NES / Famicom';
      const nes2 = (u8[7] & 0x0c) === 0x08;
      const mapper = (u8[6] >> 4) | (u8[7] & 0xf0) | (nes2 ? (u8[8] & 0x0f) << 8 : 0);
      rows.push(['Header', nes2 ? 'NES 2.0 (16 bytes)' : 'iNES (16 bytes)']);
      rows.push(['PRG-ROM', u8[4] * 16 + ' KB']);
      rows.push(['CHR-ROM', u8[5] ? u8[5] * 8 + ' KB' : 'CHR-RAM']);
      rows.push(['Mapper', String(mapper)]);
      rows.push(['Mirroring', u8[6] & 8 ? 'Four-screen' : u8[6] & 1 ? 'Vertical' : 'Horizontal']);
      if (u8[6] & 2) rows.push(['Battery', 'Yes (SRAM)']);
      header = { kind: 'ines', size: 16, removable: true };
    } else if (matchAt(u8, 0, 'FDS\u001a')) {
      id = 'fds';
      name = 'Famicom Disk System';
      rows.push(['Header', 'fwNES (16 bytes)']);
      rows.push(['Disk sides', String(u8[4])]);
      header = { kind: 'fds', size: 16, removable: true };
    } else if (u8.length >= 0x150 && u8[0x104] === 0xce && u8[0x105] === 0xed && u8[0x106] === 0x66 && u8[0x107] === 0x66) {
      const cgb = u8[0x143];
      id = cgb === 0xc0 ? 'gbc' : cgb === 0x80 ? 'gbc' : 'gb';
      name = cgb === 0xc0 ? 'Game Boy Color (CGB only)' : cgb === 0x80 ? 'Game Boy Color (DMG compatible)' : u8[0x146] === 3 ? 'Game Boy (Super GB enhanced)' : 'Game Boy';
      rows.push(['Internal title', B.printable(u8, 0x134, cgb & 0x80 ? 15 : 16) || '—']);
      rows.push(['Cartridge type', hex(u8[0x147], 2)]);
      rows.push(['ROM size', (32 << u8[0x148]) + ' KB (header)']);
      checksums.push({
        id: 'gbhdr',
        label: 'GB header checksum',
        check: (d) => {
          const c = gbHeaderChecksum(d);
          return { ok: c === d[0x14d], detail: c === d[0x14d] ? 'valid' : 'stored ' + hex(d[0x14d], 2) + ', should be ' + hex(c, 2) + ' (real hardware refuses to boot)' };
        },
        fix: (d) => {
          const o = d.slice();
          o[0x14d] = gbHeaderChecksum(o);
          const g = gbGlobalChecksum(o);
          o[0x14e] = g >> 8;
          o[0x14f] = g & 0xff;
          return o;
        },
      });
      checksums.push({
        id: 'gbglobal',
        label: 'GB global checksum',
        check: (d) => {
          const g = gbGlobalChecksum(d);
          const s = u16be(d, 0x14e);
          return { ok: g === s, detail: g === s ? 'valid' : 'stored ' + hex(s) + ', computed ' + hex(g) + ' (cosmetic — hardware ignores it)' };
        },
        fix: (d) => {
          const o = d.slice();
          const g = gbGlobalChecksum(o);
          o[0x14e] = g >> 8;
          o[0x14f] = g & 0xff;
          return o;
        },
      });
    } else if (u8.length >= 0xc0 && u8[0xb2] === 0x96 && u8[0x04] === 0x24 && u8[0x05] === 0xff && u8[0x06] === 0xae) {
      id = 'gba';
      name = 'Game Boy Advance';
      rows.push(['Internal title', B.printable(u8, 0xa0, 12) || '—']);
      rows.push(['Game code', B.printable(u8, 0xac, 4) + '  (maker ' + B.printable(u8, 0xb0, 2) + ', rev ' + u8[0xbc] + ')']);
      checksums.push({
        id: 'gbacomp',
        label: 'GBA header complement',
        check: (d) => {
          const c = gbaComplement(d);
          return { ok: c === d[0xbd], detail: c === d[0xbd] ? 'valid' : 'stored ' + hex(d[0xbd], 2) + ', should be ' + hex(c, 2) + ' (real hardware refuses to boot)' };
        },
        fix: (d) => {
          const o = d.slice();
          o[0xbd] = gbaComplement(o);
          return o;
        },
      });
    } else if (u8.length >= 0x200 && u8[0xc0] === 0x24 && u8[0xc1] === 0xff && u8[0xc2] === 0xae && u8[0xc3] === 0x51) {
      id = 'nds';
      name = 'Nintendo DS';
      rows.push(['Internal title', B.printable(u8, 0, 12) || '—']);
      rows.push(['Game code', B.printable(u8, 0x0c, 4) + '  (maker ' + B.printable(u8, 0x10, 2) + ')']);
      rows.push(['Unit', u8[0x12] === 2 ? 'DS + DSi' : u8[0x12] === 3 ? 'DSi only' : 'DS']);
      checksums.push({
        id: 'ndshdr',
        label: 'NDS header CRC16',
        check: (d) => {
          const c = VF.hash.crc16modbus(d, 0, 0x15e);
          const s = u16le(d, 0x15e);
          return { ok: c === s, detail: c === s ? 'valid' : 'stored ' + hex(s) + ', should be ' + hex(c) };
        },
        fix: (d) => {
          const o = d.slice();
          const c = VF.hash.crc16modbus(o, 0, 0x15e);
          o[0x15e] = c & 0xff;
          o[0x15f] = c >> 8;
          return o;
        },
      });
    } else if (matchAt(u8, 0x100, 'NCSD')) {
      id = '3ds';
      name = 'Nintendo 3DS (CCI)';
      notes.push('3DS hacks are normally LayeredFS mods (romfs folders) rather than patches — check the hack’s instructions.');
    } else if (matchAt(u8, 0, 'SEGADISCSYSTEM') || matchAt(u8, 0x10, 'SEGADISCSYSTEM')) {
      id = 'segacd';
      name = 'Sega CD / Mega-CD';
      rows.push(['Image', matchAt(u8, 0, 'SEGA') ? 'ISO (2048-byte sectors)' : 'Raw BIN (2352-byte sectors)']);
      rows.push(['Title', B.printable(u8, (matchAt(u8, 0, 'SEGA') ? 0 : 0x10) + 0x150, 48) || '—']);
    } else if (matchAt(u8, 0, 'SEGA SEGASATURN') || matchAt(u8, 0x10, 'SEGA SEGASATURN')) {
      const o = matchAt(u8, 0, 'SEGA') ? 0 : 0x10;
      id = 'saturn';
      name = 'Sega Saturn';
      rows.push(['Product', B.printable(u8, o + 0x20, 10)]);
      rows.push(['Title', B.printable(u8, o + 0x60, 112) || '—']);
    } else if (matchAt(u8, 0x100, 'SEGA') || (u8.length > 0x4000 && u8.length % 0x4000 === 512 && u8[1] === 0x03 && u8[8] === 0xaa && u8[9] === 0xbb)) {
      const smd = u8.length % 0x4000 === 512 && u8[8] === 0xaa && u8[9] === 0xbb;
      const body = smd ? mdDeinterleave(u8) : u8;
      const is32x = matchAt(body, 0x100, 'SEGA 32X');
      id = is32x ? '32x' : 'md';
      name = is32x ? 'Sega 32X' : 'Sega Mega Drive / Genesis';
      if (smd) {
        rows.push(['Format', 'SMD (interleaved, 512-byte header)']);
        header = { kind: 'smd', size: 512, removable: true };
        notes.push('Patches are almost always made for plain .bin/.md. Use “Remove header” to de-interleave first.');
      }
      rows.push(['System', B.printable(body, 0x100, 16)]);
      rows.push(['Title', B.printable(body, 0x150, 48) || B.printable(body, 0x120, 48) || '—']);
      rows.push(['Serial', B.printable(body, 0x180, 14)]);
      rows.push(['Region', B.printable(body, 0x1f0, 3)]);
      if (!smd) {
        checksums.push({
          id: 'mdsum',
          label: 'Mega Drive checksum',
          check: (d) => {
            const c = mdChecksum(d);
            const s = u16be(d, 0x18e);
            return { ok: c === s, detail: c === s ? 'valid' : 'stored ' + hex(s) + ', computed ' + hex(c) + ' (some games refuse to run)' };
          },
          fix: (d) => {
            const o = d.slice();
            const c = mdChecksum(o);
            o[0x18e] = c >> 8;
            o[0x18f] = c & 0xff;
            return o;
          },
        });
      }
    } else if (['sms', 'gg', 'sg'].includes(e) || matchAt(u8, 0x7ff0, 'TMR SEGA')) {
      id = e === 'gg' ? 'gg' : 'sms';
      name = e === 'gg' ? 'Sega Game Gear' : 'Sega Master System';
    } else if (u8.length >= 0x1c + 4 && u32be(u8, 0x1c) === 0xc2339f3d) {
      id = 'gc';
      name = 'Nintendo GameCube';
      rows.push(['Game ID', B.printable(u8, 0, 6)]);
      rows.push(['Title', B.printable(u8, 0x20, 64)]);
      notes.push('GameCube hacks usually ship as xdelta. Make sure your dump is a plain .iso (not .rvz / .ciso).');
    } else if (u8.length >= 0x18 + 4 && u32be(u8, 0x18) === 0x5d1c9ea3) {
      id = 'wii';
      name = 'Nintendo Wii';
      rows.push(['Game ID', B.printable(u8, 0, 6)]);
      rows.push(['Title', B.printable(u8, 0x20, 64)]);
      notes.push('Wii hacks usually need a plain .iso (not .wbfs / .rvz). Many are Riivolution mods instead of patches.');
    } else if (isoInfo(u8)) {
      const info = isoInfo(u8);
      const sysId = B.printable(u8, info.pvd + 8, 32);
      const volId = B.printable(u8, info.pvd + 40, 32);
      id = /PSP GAME/i.test(sysId) ? 'psp' : /PLAYSTATION/i.test(sysId) ? 'psx' : 'disc';
      name = id === 'psp' ? 'PlayStation Portable (UMD image)' : id === 'psx' ? 'PlayStation / PlayStation 2 disc' : 'CD/DVD image';
      rows.push(['Image', info.mode]);
      rows.push(['System ID', sysId || '—']);
      rows.push(['Volume', volId || '—']);
      if (id === 'psx' && info.pvd === 0x8000 && u8.length < 900 * 1024 * 1024) notes.push('This is a 2048-byte .iso. Many PS1 PPF patches expect the raw .bin (2352-byte sectors) — use the .bin from your .cue if the patch complains.');
    } else if (matchAt(u8, 1, 'ATARI7800')) {
      id = 'a7800';
      name = 'Atari 7800';
      header = { kind: 'a78', size: 128, removable: true };
      rows.push(['Header', 'A78 (128 bytes)']);
    } else if (matchAt(u8, 0, 'LYNX')) {
      id = 'lynx';
      name = 'Atari Lynx';
      header = { kind: 'lnx', size: 64, removable: true };
      rows.push(['Header', 'LNX (64 bytes)']);
    } else if (['sfc', 'smc', 'swc', 'fig', 'bs', 'st'].includes(e) || snesInfo(u8).layout) {
      const s = snesInfo(u8);
      if (s.layout || ['sfc', 'smc', 'swc', 'fig'].includes(e)) {
        id = 'snes';
        name = 'Super Nintendo / Super Famicom';
        if (s.copierHeader) {
          rows.push(['Copier header', '512 bytes (SMC/SWC style)']);
          header = { kind: 'snes', size: 512, removable: true };
          notes.push('This ROM has a 512-byte copier header. Most modern hacks want it removed — Aether Lab tries both automatically for checksummed patches.');
        } else {
          header = { kind: 'snes', size: 0, addable: true };
        }
        if (s.layout) {
          const b = s.body;
          const base = s.layout.base;
          rows.push(['Internal title', B.printable(b, base, 21) || '—']);
          rows.push(['Mapping', s.layout.name + ((b[base + 0x15] & 0x10) ? ' / FastROM' : '')]);
          rows.push(['ROM size', (1 << b[base + 0x17]) + ' KB (header)']);
          rows.push(['Region code', hex(b[base + 0x19], 2)]);
          checksums.push({
            id: 'snessum',
            label: 'SNES internal checksum',
            check: (d) => {
              const info = snesInfo(d);
              if (!info.layout) return { ok: null, detail: 'header not found' };
              const bb = info.body;
              const o = info.layout.base;
              const stored = u16le(bb, o + 0x1e);
              const calc = snesChecksum(bb, o);
              const ok = stored === calc && ((stored + u16le(bb, o + 0x1c)) & 0xffff) === 0xffff;
              return { ok, detail: ok ? 'valid' : 'stored ' + hex(stored) + ', computed ' + hex(calc) + ' (cosmetic on hardware; emulators may warn)' };
            },
            fix: (d) => {
              const out = d.slice();
              const info = snesInfo(out);
              if (!info.layout) return out;
              const bb = info.body;
              const o = info.layout.base;
              const sum = snesChecksum(bb, o);
              bb[o + 0x1c] = ~sum & 0xff;
              bb[o + 0x1d] = (~sum >> 8) & 0xff;
              bb[o + 0x1e] = sum & 0xff;
              bb[o + 0x1f] = sum >> 8;
              return out;
            },
          });
        }
      }
    }

    if (id === 'unknown') {
      const byExt = {
        pce: 'PC Engine / TurboGrafx-16', ws: 'WonderSwan', wsc: 'WonderSwan Color', ngp: 'Neo Geo Pocket', ngc: 'Neo Geo Pocket Color',
        vb: 'Virtual Boy', a26: 'Atari 2600', col: 'ColecoVision', '32x': 'Sega 32X', md: 'Sega Mega Drive / Genesis', gen: 'Sega Mega Drive / Genesis',
        nsp: 'Nintendo Switch package', xci: 'Nintendo Switch cartridge image', cia: 'Nintendo 3DS installable', cso: 'Compressed ISO (CSO)', chd: 'MAME CHD',
        iso: 'Disc image', bin: 'Binary / disc image', img: 'Disc image', zip: 'ZIP archive', '7z': '7-Zip archive', rvz: 'Dolphin RVZ', wbfs: 'Wii WBFS',
      };
      if (byExt[e]) name = byExt[e];
      if (e === 'pce' && u8.length % 8192 === 512) {
        id = 'pce';
        header = { kind: 'pce', size: 512, removable: true };
        rows.push(['Header', '512-byte copier header']);
      }
      if (['zip', '7z', 'rar'].includes(e)) notes.push('This is an archive. Extract the ROM first — patches apply to the ROM inside, not the archive.');
      if (['cso', 'chd', 'rvz', 'wbfs', 'ciso'].includes(e)) notes.push('Compressed image. Convert back to a plain .iso/.bin before patching, then re-compress afterwards if you like.');
      if (['nsp', 'xci'].includes(e)) notes.push('Switch mods are installed through LayeredFS (atmosphere/contents/<title id>/romfs), not by patching the package.');
    }

    rows.unshift(['Size', B.formatSize(u8.length) + (isPow2(u8.length) ? '' : '  (' + u8.length.toLocaleString() + ' bytes)')]);
    return { id, name, rows, header, checksums, notes };
  }

  /* ---------------- header & layout transforms ---------------- */
  function mdDeinterleave(u8) {
    const body = u8.subarray(512);
    const out = new Uint8Array(body.length);
    for (let b = 0; b + 0x4000 <= body.length; b += 0x4000) {
      for (let i = 0; i < 0x2000; i++) {
        out[b + i * 2] = body[b + 0x2000 + i];
        out[b + i * 2 + 1] = body[b + i];
      }
    }
    return out;
  }

  function removeHeader(u8, info) {
    if (!info.header || !info.header.size) return u8;
    if (info.header.kind === 'smd') return mdDeinterleave(u8);
    return u8.slice(info.header.size);
  }

  function addSnesHeader(u8) {
    const h = new Uint8Array(512);
    const blocks = Math.floor(u8.length / 8192);
    h[0] = blocks & 0xff;
    h[1] = blocks >> 8;
    return B.concat([h, u8]);
  }

  /**
   * Alternative versions of a ROM to try when a checksummed patch says
   * "wrong source": header stripped/added, N64 byte order, SMD → BIN.
   */
  function variants(u8, info) {
    const list = [];
    if (info.header && info.header.size && info.header.removable) {
      list.push({ label: info.header.kind === 'smd' ? 'converted SMD → BIN' : 'removed ' + info.header.size + '-byte header', data: removeHeader(u8, info) });
    }
    if (info.id === 'snes' && info.header && info.header.size === 0) list.push({ label: 'added 512-byte copier header', data: addSnesHeader(u8) });
    if (info.id === 'n64') {
      const order = VF.n64.order(u8);
      const z = order === 'z64' ? u8 : VF.n64.toZ64(u8);
      if (order !== 'z64') list.push({ label: 'converted to .z64 byte order', data: z });
      if (order !== 'v64') list.push({ label: 'converted to .v64 byte order', data: VF.n64.fromZ64(z, 'v64') });
      if (order !== 'n64') list.push({ label: 'converted to .n64 byte order', data: VF.n64.fromZ64(z, 'n64') });
    }
    if (info.id === 'unknown' && u8.length % 1024 === 512) list.push({ label: 'removed 512-byte header', data: u8.slice(512) });
    return list;
  }

  VF.rom = { identify, removeHeader, addSnesHeader, variants, ext, snesChecksum };
})((globalThis.VF = globalThis.VF || {}));
