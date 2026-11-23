/*
 * Aether Lab — patch engine
 * Glue between the UI and the format modules: identifies the patch and
 * ROM, fixes the usual header / byte-order mismatches automatically,
 * applies the patch, then reports and (optionally) repairs checksums.
 */
(function (VF) {
  'use strict';

  const { PatchError } = VF.patch;
  const B = VF.bytes;

  const RETRY_CODES = ['source-crc', 'source-size', 'block', 'size'];

  function baseName(name) {
    return (name || 'patched').replace(/\.[^.]+$/, '');
  }

  function outputName(romName, patchName, finalInfo, transform) {
    let e = VF.rom.ext(romName || '') || 'bin';
    if (transform && /z64/.test(transform)) e = 'z64';
    else if (transform && /v64/.test(transform)) e = 'v64';
    else if (transform && /\.n64/.test(transform)) e = 'n64';
    else if (transform && /SMD → BIN/.test(transform)) e = 'md';
    else if (finalInfo.id === 'snes' && e === 'smc' && transform && /removed/.test(transform)) e = 'sfc';
    const safe = baseName(patchName).replace(/[\\/:*?"<>|]+/g, '_').trim() || 'patched';
    return safe + '.' + e;
  }

  /**
   * opts: { removeHeader, addHeader, autoFix (default true),
   *         fixChecksums, ignoreChecksums }
   */
  function applyPatch(rom, romName, patch, patchName, opts) {
    opts = Object.assign({ autoFix: true }, opts || {});
    const log = [];
    const fmt = VF.patch.detect(patch);
    if (!fmt) throw new PatchError('That file isn’t a patch format I recognise (IPS, BPS, UPS, xdelta, PPF, APS). If it’s a .zip or .7z, extract it first.', 'format');

    const info = VF.rom.identify(rom, romName);
    const meta = fmt.inspect(patch);
    let working = rom;
    let transform = null;

    // Manual header controls win over auto-detection.
    if (opts.removeHeader && info.header && info.header.size) {
      working = VF.rom.removeHeader(rom, info);
      transform = info.header.kind === 'smd' ? 'converted SMD → BIN' : 'removed ' + info.header.size + '-byte header';
      log.push('Manual: ' + transform);
    } else if (opts.addHeader && info.id === 'snes' && info.header && info.header.size === 0) {
      working = VF.rom.addSnesHeader(rom);
      transform = 'added 512-byte copier header';
      log.push('Manual: ' + transform);
    }

    // Checksummed formats tell us the exact source they want: find it.
    if (opts.autoFix && !transform && meta.expectedSourceCrc !== undefined) {
      const have = VF.hash.crc32(working);
      if (have !== meta.expectedSourceCrc) {
        for (const v of VF.rom.variants(rom, info)) {
          if (VF.hash.crc32(v.data) === meta.expectedSourceCrc) {
            working = v.data;
            transform = v.label;
            log.push('Auto-fix: ' + v.label + ' — the patch’s source checksum now matches');
            break;
          }
        }
      }
    } else if (opts.autoFix && !transform && meta.n64Order && VF.n64.order(rom) && VF.n64.order(rom) !== meta.n64Order) {
      working = meta.n64Order === 'z64' ? VF.n64.toZ64(rom) : VF.n64.fromZ64(VF.n64.toZ64(rom), meta.n64Order);
      transform = 'converted to .' + meta.n64Order + ' byte order';
      log.push('Auto-fix: ' + transform + ' (what this APS patch expects)');
    } else if (opts.autoFix && !transform && meta.expectedSourceSize !== undefined && working.length !== meta.expectedSourceSize) {
      for (const v of VF.rom.variants(rom, info)) {
        if (v.data.length === meta.expectedSourceSize) {
          working = v.data;
          transform = v.label;
          log.push('Auto-fix: ' + v.label + ' — size now matches');
          break;
        }
      }
    }

    let result;
    try {
      result = fmt.apply(working, patch, { ignoreChecksums: false });
    } catch (err) {
      // Formats without an upfront checksum (xdelta, PPF) only find out
      // while patching — retry the header/byte-order variants.
      if (!(err instanceof PatchError) || !RETRY_CODES.includes(err.code) || !opts.autoFix || transform) {
        if (err instanceof PatchError && RETRY_CODES.includes(err.code) && opts.ignoreChecksums) {
          result = fmt.apply(working, patch, { ignoreChecksums: true });
          log.push('Checks ignored at your request — the output may not work.');
        } else throw err;
      } else {
        let lastErr = err;
        for (const v of VF.rom.variants(rom, info)) {
          try {
            result = fmt.apply(v.data, patch, { ignoreChecksums: false });
            working = v.data;
            transform = v.label;
            log.push('Auto-fix: ' + v.label + ' — the patch verified after this change');
            break;
          } catch (e2) {
            lastErr = e2;
          }
        }
        if (!result) {
          if (opts.ignoreChecksums) {
            result = fmt.apply(working, patch, { ignoreChecksums: true });
            log.push('Checks ignored at your request — the output may not work.');
          } else throw err.code === lastErr.code ? err : lastErr;
        }
      }
    }

    let output = result.output;
    const finalInfo = VF.rom.identify(output, romName);
    const checksumReport = [];
    for (const c of finalInfo.checksums) {
      const r = c.check(output);
      if (r.ok === false && opts.fixChecksums) {
        output = c.fix(output);
        const again = c.check(output);
        checksumReport.push({ label: c.label, ok: again.ok, detail: again.ok ? 'repaired' : again.detail, fixed: true });
        log.push('Repaired ' + c.label);
      } else {
        checksumReport.push({ label: c.label, ok: r.ok, detail: r.detail });
      }
    }

    return {
      format: fmt,
      patchInfo: meta,
      romInfo: info,
      outputInfo: finalInfo,
      output,
      outputName: outputName(romName, patchName, finalInfo, transform),
      checks: result.checks,
      checksumReport,
      transform,
      log,
    };
  }

  function createPatch(source, target, formatId, opts) {
    const fmt = VF.patch.byId(formatId);
    if (!fmt || !fmt.create) throw new PatchError('Can’t create ' + formatId + ' patches');
    if (B.equal(source, target)) throw new PatchError('The two files are identical — there’s nothing to patch.');
    const data = fmt.create(source, target, opts);
    // Prove the patch works before handing it over.
    const back = fmt.apply(source, data, {});
    if (!B.equal(back.output, target)) throw new PatchError('Internal check failed: the new patch didn’t reproduce the modified ROM. Please report this.');
    return { data, fmt };
  }

  VF.engine = { applyPatch, createPatch };
})((globalThis.VF = globalThis.VF || {}));
