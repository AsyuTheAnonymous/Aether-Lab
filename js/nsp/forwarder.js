/*
 * Aether Lab — NSP forwarder builder
 * Produces an installable NSP (for Goldleaf, DBI, Tinfoil, sphaira…) that
 * boots a homebrew NRO — or a RetroArch core with a ROM — straight from
 * the HOME menu. Same structure hacBrewPack produces with
 *   --titleid <id> --nologo --plaintext --nopatchnacplogo
 * which is what NTON, nsp-forwarder and sphaira-era tools ship today.
 *
 * Installing needs Atmosphère + signature patches (sigpatches), because
 * only Nintendo can make signatures the console trusts by default.
 */
(function (VF) {
  'use strict';

  const B = VF.bytes;
  const FS = VF.switchfs;
  const M = VF.switchmeta;

  /* ---------------- paths & argv ---------------- */
  function normalizePath(p) {
    let s = String(p || '').trim().replace(/\\/g, '/');
    if (!s) return '';
    if (/["\u0000-\u001f]/.test(s)) throw new Error('Paths can’t contain quotes or control characters: ' + s);
    s = s.replace(/^sdmc:\/*/i, '');
    s = s.replace(/^[a-z]:\//i, ''); // pasted from a PC drive letter
    s = s.replace(/^\/+/, '');
    return 'sdmc:/' + s.replace(/\/{2,}/g, '/');
  }

  function argvFor(nroPath, romPath, extra) {
    let argv = nroPath;
    if (romPath) argv += ' "' + romPath + '"';
    if (extra) argv += ' ' + extra.trim();
    return argv;
  }

  /* ---------------- title IDs ---------------- */
  /**
   * Deterministic ID, identical to sphaira / switch-nsp-forwarder:
   * SHA-256(nroPath + argv), low 8 bytes as u64 (little-endian),
   * 0x0100000000000000 | (h & 0x00FFFFFFFFFFF000).
   * Re-building the same forwarder updates it instead of duplicating it.
   */
  function deterministicTitleId(nroPath, argv) {
    const h = VF.hash.sha256(B.utf8(nroPath + argv));
    const v = new DataView(h.buffer).getBigUint64(0, true);
    return 0x0100000000000000n | (v & 0x00fffffffffff000n);
  }

  function randomTitleId() {
    const r = new Uint8Array(8);
    crypto.getRandomValues(r);
    const v = new DataView(r.buffer).getBigUint64(0, true);
    return 0x0100000000000000n | (v & 0x00fffffffffff000n);
  }

  function parseTitleId(str) {
    const s = String(str || '').trim().replace(/^0x/i, '');
    if (!/^[0-9a-fA-F]{16}$/.test(s)) throw new Error('Title ID must be exactly 16 hex digits');
    const v = BigInt('0x' + s);
    if (v < 0x0100000000000000n || v > 0x01ffffffffffffffn) throw new Error('Title ID must be in the application range 0100000000000000–01FFFFFFFFFFFFFF');
    if (v & 0xfffn) throw new Error('Title ID must end in 000 (the lower digits are reserved for updates and DLC)');
    return v;
  }

  const tidHex = (v) => v.toString(16).padStart(16, '0');

  /* ---------------- signing (NCA signature #2) ---------------- */
  async function makeSigner() {
    const subtle = globalThis.crypto && globalThis.crypto.subtle;
    if (!subtle) return null;
    const pair = await subtle.generateKey({ name: 'RSA-PSS', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    const jwk = await subtle.exportKey('jwk', pair.publicKey);
    const b64 = jwk.n.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    let modulus = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) modulus[i] = bin.charCodeAt(i);
    if (modulus.length > 256) modulus = modulus.subarray(modulus.length - 256);
    if (modulus.length < 256) {
      const m = new Uint8Array(256);
      m.set(modulus, 256 - modulus.length);
      modulus = m;
    }
    return {
      modulus,
      sign: async (data) => new Uint8Array(await subtle.sign({ name: 'RSA-PSS', saltLength: 32 }, pair.privateKey, data)),
      verify: async (sig, data) => subtle.verify({ name: 'RSA-PSS', saltLength: 32 }, pair.publicKey, sig, data),
    };
  }

  /* ---------------- build ---------------- */
  /**
   * opts: { keys, title, publisher, version, titleId (BigInt), nroPath,
   *         romPath?, extraArgs?, icon (JPEG bytes)?, profileSelect? }
   */
  async function build(opts, onStep) {
    const step = onStep || function () {};
    const tpl = VF.forwarderTemplate;
    const main = tpl.main();
    const npdmTpl = tpl.npdm();
    if (B.hex(VF.hash.sha256(main)) !== tpl.mainSha256 || B.hex(VF.hash.sha256(npdmTpl)) !== tpl.npdmSha256) {
      throw new Error('Forwarder template failed its integrity check — re-download Aether Lab.');
    }
    const title = (opts.title || '').trim();
    const publisher = (opts.publisher || '').trim() || 'Aether Lab';
    if (!title) throw new Error('Give the forwarder a title');
    const nroPath = normalizePath(opts.nroPath);
    if (!/\.nro$/i.test(nroPath)) throw new Error('The launch target must be a .nro file on the SD card');
    const romPath = opts.romPath ? normalizePath(opts.romPath) : '';
    const argv = argvFor(nroPath, romPath, opts.extraArgs);
    const titleId = opts.titleId;
    const keys = opts.keys;

    step('Generating signing key');
    const signer = await makeSigner();

    step('Building ExeFS');
    const npdm = M.patchNpdm(npdmTpl, titleId, signer ? signer.modulus : null);
    const exefs = FS.pfs0HashLayer(FS.buildPfs0([{ name: 'main', data: main }, { name: 'main.npdm', data: npdm }]), 0x10000);

    step('Building RomFS (launch target)');
    const romfs = FS.ivfcLayer(FS.buildRomfs([
      { name: 'nextArgv', data: B.utf8(argv) },
      { name: 'nextNroPath', data: B.utf8(nroPath) },
    ]));

    step('Packing Program NCA');
    const program = await VF.nca.build({
      contentType: 'program',
      titleId,
      keys,
      sign: signer ? signer.sign : null,
      sections: [{ type: 'pfs0', layer: exefs }, { type: 'romfs', layer: romfs }],
    });

    step('Packing Control NCA');
    const nacp = M.buildNacp({ title, publisher, version: opts.version, titleId, profileSelect: !!opts.profileSelect });
    const controlFiles = [{ name: 'control.nacp', data: nacp }];
    if (opts.icon) controlFiles.push({ name: 'icon_AmericanEnglish.dat', data: opts.icon });
    const control = await VF.nca.build({
      contentType: 'control',
      titleId,
      keys,
      sections: [{ type: 'romfs', layer: FS.ivfcLayer(FS.buildRomfs(controlFiles)) }],
    });

    step('Packing Meta NCA');
    const cnmt = M.buildCnmt(titleId, [
      { hash: program.hash, size: program.size, type: 1 },
      { hash: control.hash, size: control.size, type: 3 },
    ]);
    const meta = await VF.nca.build({
      contentType: 'meta',
      titleId,
      keys,
      sections: [{ type: 'pfs0', layer: FS.pfs0HashLayer(FS.buildPfs0([{ name: 'Application_' + tidHex(titleId) + '.cnmt', data: cnmt }]), 0x1000) }],
    });

    step('Writing NSP');
    const nsp = FS.buildPfs0([
      { name: program.id + '.nca', data: program.data },
      { name: control.id + '.nca', data: control.data },
      { name: meta.id + '.cnmt.nca', data: meta.data },
    ]);

    step('Verifying');
    const report = await verify(nsp, keys.headerKey, titleId, signer);
    const safeTitle = title.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80);
    return {
      nsp,
      fileName: safeTitle + ' [' + tidHex(titleId).toUpperCase() + '].nsp',
      titleId: tidHex(titleId).toUpperCase(),
      argv,
      nroPath,
      romPath,
      signed: !!signer,
      contents: [
        { kind: 'Program', id: program.id, size: program.size },
        { kind: 'Control', id: control.id, size: control.size },
        { kind: 'Meta', id: meta.id, size: meta.size },
      ],
      report,
    };
  }

  /**
   * Re-read what we just wrote: decrypt every NCA header, re-hash every
   * section and compare with the CNMT — the same checks an installer and
   * the console's filesystem make.
   */
  async function verify(nsp, headerKey, titleId, signer) {
    const checks = [];
    const v = new DataView(nsp.buffer, nsp.byteOffset, nsp.byteLength);
    const n = v.getUint32(4, true);
    const strSize = v.getUint32(8, true);
    const dataStart = 0x10 + n * 0x18 + strSize;
    const files = {};
    for (let i = 0; i < n; i++) {
      const e = 0x10 + i * 0x18;
      const off = v.getUint32(e, true);
      const size = v.getUint32(e + 8, true);
      const name = B.ascii(nsp, 0x10 + n * 0x18 + v.getUint32(e + 0x10, true), 64);
      files[name] = nsp.subarray(dataStart + off, dataStart + off + size);
    }
    let allOk = true;
    const add = (label, ok, detail) => {
      checks.push({ label, ok, detail });
      if (!ok) allOk = false;
    };
    let cnmtRecords = [];
    for (const [name, data] of Object.entries(files)) {
      const info = VF.nca.inspect(data, headerKey);
      const idOk = B.hex(VF.hash.sha256(data).subarray(0, 16)) === name.replace(/\..*$/, '');
      const ok = info.magic === 'NCA3' && info.size === data.length && info.titleId === titleId && info.sections.every((s) => s.hashOk) && idOk;
      add(name.endsWith('.cnmt.nca') ? 'Meta NCA' : ['Program NCA', 'Meta NCA', 'Control NCA'][info.contentType] || 'NCA', ok, ok ? 'header decrypts, hashes and ID match' : 'header/hash mismatch');
      // re-hash sections
      for (const s of info.sections) {
        const fh = info.header.subarray(0x400 + info.sections.indexOf(s) * 0x200);
        const sec = data.subarray(s.start, s.end);
        let good;
        if (s.fsType === 1) {
          const hv = new DataView(fh.buffer, fh.byteOffset);
          const tableSize = hv.getUint32(0x38, true);
          good = B.equal(VF.hash.sha256(sec.subarray(0, tableSize)), fh.subarray(0x08, 0x28));
          if (info.contentType === 1) {
            const pOff = hv.getUint32(0x40, true);
            const p = sec.subarray(pOff);
            const pv = new DataView(p.buffer, p.byteOffset);
            const hdr = 0x10 + pv.getUint32(4, true) * 0x18 + pv.getUint32(8, true);
            const cn = p.subarray(hdr, hdr + pv.getUint32(0x18, true));
            const cv = new DataView(cn.buffer, cn.byteOffset);
            const count = cv.getUint16(0x10, true);
            cnmtRecords = [];
            for (let k = 0; k < count; k++) cnmtRecords.push(B.hex(cn.subarray(0x30 + k * 0x38 + 0x20, 0x30 + k * 0x38 + 0x30)));
          }
        } else {
          good = B.equal(VF.hash.sha256(sec.subarray(0, 0x4000)), fh.subarray(0xc8, 0xe8));
        }
        if (!good) add('Section hash', false, name);
      }
      if (signer && info.contentType === 0) {
        const sigOk = await signer.verify(info.header.subarray(0x100, 0x200), info.header.subarray(0x200, 0x400));
        add('Program signature #2', sigOk, sigOk ? 'valid against the key in main.npdm' : 'INVALID');
      }
    }
    const listed = Object.keys(files).filter((f) => !f.endsWith('.cnmt.nca')).map((f) => f.replace(/\.nca$/, ''));
    const cnmtOk = cnmtRecords.length === listed.length && listed.every((id) => cnmtRecords.includes(id));
    add('Content meta', cnmtOk, cnmtOk ? 'CNMT lists every NCA by hash' : 'CNMT does not match the NCAs');
    return { ok: allOk, checks };
  }

  VF.forwarder = { build, verify, normalizePath, argvFor, deterministicTitleId, randomTitleId, parseTitleId, tidHex };
})((globalThis.VF = globalThis.VF || {}));
