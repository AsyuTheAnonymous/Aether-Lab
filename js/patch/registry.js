/*
 * Aether Lab — patch format registry
 * Every format module registers itself here with:
 *   detect(patch)            -> true if the bytes look like this format
 *   inspect(patch)           -> { summary rows, expected sizes/CRCs }
 *   apply(rom, patch, opts)  -> { output, checks: [{label, ok, detail}] }
 *   create(source, target)   -> patch bytes (only formats that support it)
 */
(function (VF) {
  'use strict';

  class PatchError extends Error {
    constructor(message, code) {
      super(message);
      this.name = 'PatchError';
      this.code = code || 'patch';
    }
  }

  const formats = [];

  /** Magic numbers we recognise but do not apply, so we can explain why. */
  const UNSUPPORTED = [
    { magic: 'NINJA2', name: 'RUP (NINJA 2.0)' },
    { magic: 'BSDIFF40', name: 'BDF / BSDiff' },
    { magic: 'PMSR', name: 'Star Rod (PMSR)' },
    { magic: 'PAT\u001a', name: 'Proprietary PAT' },
  ];

  function startsWith(u8, str) {
    if (u8.length < str.length) return false;
    for (let i = 0; i < str.length; i++) if (u8[i] !== str.charCodeAt(i)) return false;
    return true;
  }

  VF.patch = {
    PatchError,
    formats,
    startsWith,
    register(fmt) {
      formats.push(fmt);
    },
    /** Identify a patch from its first bytes (never trust the extension). */
    detect(u8) {
      for (const f of formats) if (f.detect(u8)) return f;
      for (const u of UNSUPPORTED) {
        if (startsWith(u8, u.magic)) {
          throw new PatchError(u.name + ' patches are recognised but not supported yet. Use the tool the hack author recommends for this one.', 'unsupported');
        }
      }
      return null;
    },
    byId(id) {
      return formats.find((f) => f.id === id) || null;
    },
    creators() {
      return formats.filter((f) => typeof f.create === 'function');
    },
  };
})((globalThis.VF = globalThis.VF || {}));
