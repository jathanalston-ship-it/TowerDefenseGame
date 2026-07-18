// WARDROBE DRESSING (docs/COSMETICS.md §wardrobe) — the ONE function that applies every
// equipped Wardrobe payload to its consumer: root data-attributes (index.css keys off them),
// the audio cue families, the music re-voicings, and the renderer kit. Hub calls it on every
// equip change; GameView re-asserts it at run start. Idempotent, cheap, and a fresh save
// clears everything back to the classic dress.

import { equippedWardrobe } from '../state/meta';
import type { SaveData } from '../save/saveStore';
import { audio } from '../audio/sound';
import { music } from '../audio/music';
import { setWardrobeKit } from '../render/wardrobeFx';
import { themeOwner } from '../core/liveEvents';

export function applyWardrobeDressing(save: SaveData): void {
  const w = equippedWardrobe(save);
  const root = document.documentElement;
  const ev = themeOwner(Date.now()).def; // the live-event theme owner dresses the hub too (LIVE-EVENTS.md §4)

  // Interface shells — data attributes for the CSS variants (absent attr = classic shell).
  const attr = (name: string, css?: string): void => {
    if (css) root.setAttribute(name, css);
    else root.removeAttribute(name);
  };
  attr('data-uitheme', w.uiTheme?.css);
  attr('data-hudtheme', w.hudTheme?.css);
  attr('data-cardframe', w.cardFrame?.css);
  attr('data-loottheme', w.lootTheme?.css);
  attr('data-roulettetheme', w.rouletteTheme?.css);
  attr('data-cursor', w.cursorTheme?.css);
  attr('data-victory', w.victoryScreen?.css);
  attr('data-defeat', w.defeatScreen?.css);
  attr('data-stageintro', w.stageIntro?.css);
  root.style.setProperty('--wd-ui', w.uiTheme?.accent ?? '');
  root.style.setProperty('--wd-hud', w.hudTheme?.accent ?? '');
  root.style.setProperty('--wd-wave', w.waveTheme?.accent ?? '');
  root.style.setProperty('--wd-select', w.heroSelectFx?.accent ?? '');

  // Live-event hub mutation — data-event carries the owner's CSS token; the accent vars feed
  // generic ambient rules (index.css), so a NEW event themes the hub with zero CSS authoring.
  attr('data-event', ev.visuals?.hubMutation ?? ev.id);
  root.style.setProperty('--event-accent', ev.theme.accent);
  root.style.setProperty('--event-glow', ev.theme.glow);
  root.style.setProperty('--event-bg', ev.theme.bg);

  // Audio packs — global cue-family variants (per-unit Phenotype variants still win).
  audio.setWardrobeCues({
    tower: w.towerAudio?.cue,
    enemy: w.enemyAudio?.cue,
    notif: w.notifSound?.cue === 'default' ? undefined : w.notifSound?.cue,
    hero: w.heroVoice?.cue,
    wave: w.waveTheme?.cue === 'default' ? undefined : w.waveTheme?.cue,
  });

  // Music packs — re-voice the idle song / the war drums (crossfades live if playing).
  const transform = (p?: { rootShift?: number; bpmMult?: number; brightness?: number }): { rootShift: number; bpmMult: number; brightness: number } | undefined =>
    p && p.rootShift !== undefined && p.bpmMult !== undefined && p.brightness !== undefined
      ? { rootShift: p.rootShift, bpmMult: p.bpmMult, brightness: p.brightness }
      : undefined;
  // The event's menu re-voicing (the SeasonDef.music seam) composes WITH an equipped pack:
  // shifts add, tempo multiplies, brightness averages — either alone passes through unchanged.
  const menuBase = transform(w.musicPack);
  const evMusic = ev.audio?.music;
  const menu = menuBase && evMusic
    ? { rootShift: menuBase.rootShift + evMusic.rootShift, bpmMult: menuBase.bpmMult * evMusic.bpmMult, brightness: (menuBase.brightness + evMusic.brightness) / 2 }
    : evMusic ?? menuBase;
  music.setWardrobe({ menu, combat: transform(w.combatMusic) });

  // The renderer kit — nucleus/battlefield/trail/FX/reskins (module state; runs read it).
  setWardrobeKit({
    nucleusSkin: w.nucleusSkin,
    battlefieldTheme: w.battlefieldTheme,
    projectileTrail: w.projectileTrail,
    towerFx: w.towerFx,
    placementFx: w.placementFx,
    heroFx: w.heroFx,
    enemyTheme: w.enemyTheme,
    bossTheme: w.bossTheme,
    megaTheme: w.megaTheme,
  });
}
