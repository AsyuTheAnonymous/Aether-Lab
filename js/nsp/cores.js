/*
 * Aether Lab — RetroArch (Switch / libnx) core presets
 * On Switch every core is its own NRO: sdmc:/retroarch/cores/<core>_libretro_libnx.nro
 * A ROM forwarder launches that NRO directly with the ROM path as its
 * argument, so the game boots straight in without the RetroArch menu.
 * Names follow libretro's core IDs; check your /retroarch/cores folder
 * if a core was renamed in a newer RetroArch release.
 */
(function (VF) {
  'use strict';

  const SYSTEMS = [
    { id: 'nes', name: 'NES / Famicom', folder: 'nes', cores: ['nestopia', 'fceumm', 'mesen', 'quicknes'], exts: ['nes', 'fds', 'unf'] },
    { id: 'snes', name: 'SNES / Super Famicom', folder: 'snes', cores: ['snes9x', 'snes9x2010', 'mesen-s', 'bsnes'], exts: ['sfc', 'smc', 'swc', 'fig'] },
    { id: 'gb', name: 'Game Boy / Color', folder: 'gb', cores: ['gambatte', 'sameboy', 'gearboy', 'mgba'], exts: ['gb', 'gbc', 'sgb'] },
    { id: 'gba', name: 'Game Boy Advance', folder: 'gba', cores: ['mgba', 'vba_next', 'vbam', 'gpsp'], exts: ['gba'] },
    { id: 'n64', name: 'Nintendo 64', folder: 'n64', cores: ['mupen64plus_next', 'parallel_n64'], exts: ['z64', 'n64', 'v64'] },
    { id: 'nds', name: 'Nintendo DS', folder: 'nds', cores: ['desmume', 'melonds'], exts: ['nds'] },
    { id: 'vb', name: 'Virtual Boy', folder: 'vb', cores: ['mednafen_vb'], exts: ['vb', 'vboy'] },
    { id: 'md', name: 'Mega Drive / Genesis', folder: 'md', cores: ['genesis_plus_gx', 'picodrive'], exts: ['md', 'gen', 'bin', 'smd'] },
    { id: 'segacd', name: 'Sega CD', folder: 'segacd', cores: ['genesis_plus_gx', 'picodrive'], exts: ['cue', 'chd', 'iso'] },
    { id: '32x', name: 'Sega 32X', folder: '32x', cores: ['picodrive'], exts: ['32x'] },
    { id: 'sms', name: 'Master System / Game Gear', folder: 'sms', cores: ['genesis_plus_gx', 'gearsystem', 'smsplus'], exts: ['sms', 'gg', 'sg'] },
    { id: 'saturn', name: 'Sega Saturn', folder: 'saturn', cores: ['yabasanshiro', 'yabause'], exts: ['cue', 'chd'] },
    { id: 'dc', name: 'Dreamcast', folder: 'dc', cores: ['flycast'], exts: ['gdi', 'chd', 'cdi'] },
    { id: 'psx', name: 'PlayStation', folder: 'psx', cores: ['pcsx_rearmed', 'swanstation', 'mednafen_psx'], exts: ['cue', 'chd', 'pbp', 'm3u'] },
    { id: 'psp', name: 'PlayStation Portable', folder: 'psp', cores: ['ppsspp'], exts: ['iso', 'cso', 'pbp'] },
    { id: 'pce', name: 'PC Engine / TurboGrafx', folder: 'pce', cores: ['mednafen_pce_fast', 'mednafen_supergrafx'], exts: ['pce', 'cue', 'chd'] },
    { id: 'arcade', name: 'Arcade (FBNeo / MAME)', folder: 'arcade', cores: ['fbneo', 'mame2003_plus'], exts: ['zip'] },
    { id: 'a2600', name: 'Atari 2600', folder: 'atari2600', cores: ['stella2014'], exts: ['a26', 'bin'] },
    { id: 'a7800', name: 'Atari 7800', folder: 'atari7800', cores: ['prosystem'], exts: ['a78'] },
    { id: 'lynx', name: 'Atari Lynx', folder: 'lynx', cores: ['handy'], exts: ['lnx'] },
    { id: 'ngp', name: 'Neo Geo Pocket', folder: 'ngp', cores: ['mednafen_ngp'], exts: ['ngp', 'ngc'] },
    { id: 'ws', name: 'WonderSwan', folder: 'wswan', cores: ['mednafen_wswan'], exts: ['ws', 'wsc'] },
    { id: 'dos', name: 'DOS', folder: 'dos', cores: ['dosbox_pure'], exts: ['zip', 'exe', 'dosz'] },
  ];

  /** Map a VF.rom.identify() id to a preset system. */
  const FROM_ROM = { gbc: 'gb', fds: 'nes', '32x': '32x', gg: 'sms', psx: 'psx', saturn: 'saturn', segacd: 'segacd' };

  VF.cores = {
    SYSTEMS,
    corePath: (core) => 'sdmc:/retroarch/cores/' + core + '_libretro_libnx.nro',
    forRomId(id) {
      const key = FROM_ROM[id] || id;
      return SYSTEMS.find((s) => s.id === key) || null;
    },
    forExtension(e) {
      return SYSTEMS.find((s) => s.exts.includes(e)) || null;
    },
  };
})((globalThis.VF = globalThis.VF || {}));
