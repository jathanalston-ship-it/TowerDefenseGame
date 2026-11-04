// STORY CUTSCENES (docs/CUTSCENES.md) — content contract + THE RULE:
//   ★ Every mega boss MUST ship with a defeat cutscene. A new MEGA_BOSS_DEFS id without a
//     matching 'mega' cutscene FAILS THIS SUITE (and therefore the build).
// Plus: authored quality gates (scenes/lines/beats/painters), the small-boost ceiling
// (passives stay ~1%-scale forever), derived unlocks, and the first-defeat premiere lane.

import { describe, expect, it } from 'vitest';
import { CUTSCENES, cutsceneDef, cutsceneEffects, cutsceneForMega } from './cutscenes';
import { MEGA_BOSS_DEFS } from './megaboss';
import { CUTSCENE_PAINTERS, CUTSCENE_REDUCED_T, cutsceneStillT } from '../render/cutsceneScenes';
import { isCutsceneUnlocked, unlockedCutsceneIds } from '../save/derive';
import { defaultSave } from '../save/saveStore';

// The film-language cue set (audio/sound.ts §cinematic) — beats may only speak it.
const ALLOWED_CUES = new Set(['cin_ping', 'cin_alarm', 'cin_rumble', 'cin_shriek', 'cin_creep', 'cin_snap', 'cin_heart', 'cin_bloom', 'cin_title', 'cin_cut', 'cin_dive']);

describe('THE RULE — every mega boss ships a defeat cutscene', () => {
  it('every MEGA_BOSS_DEFS id has a mega cutscene (add one in core/cutscenes.ts before shipping the boss)', () => {
    const missing = Object.keys(MEGA_BOSS_DEFS).filter((id) => !cutsceneForMega(id));
    expect(missing, `mega bosses WITHOUT a defeat cutscene: ${missing.join(', ')} — docs/CUTSCENES.md §rule`).toEqual([]);
  });

  it('every mega cutscene points at a REAL mega def (no orphaned films)', () => {
    for (const c of CUTSCENES.filter((x) => x.kind === 'mega')) {
      expect(c.unlock.kind).toBe('mega');
      if (c.unlock.kind === 'mega') {
        expect(MEGA_BOSS_DEFS[c.unlock.megaId], `${c.id} unlocks from unknown mega '${c.unlock.megaId}'`).toBeDefined();
        expect(c.id).toBe(`mega:${c.unlock.megaId}`); // the id convention the autoplay lane relies on
      }
    }
  });
});

describe('authored content quality', () => {
  it('ids are unique and namespaced; four or more STORY films exist beside the mega films', () => {
    expect(new Set(CUTSCENES.map((c) => c.id)).size).toBe(CUTSCENES.length);
    for (const c of CUTSCENES) expect(c.id.startsWith(`${c.kind}:`), `${c.id} must be namespaced '${c.kind}:'`).toBe(true);
    expect(CUTSCENES.filter((c) => c.kind === 'story').length).toBeGreaterThanOrEqual(4);
  });

  it('every film is a real film: ≥2 scenes, ≥4 copy lines, titled, hinted, and fully painted', () => {
    for (const c of CUTSCENES) {
      expect(c.title.length, `${c.id} title`).toBeGreaterThan(3);
      expect(c.subtitle.length, `${c.id} subtitle`).toBeGreaterThan(8);
      expect(c.unlockHint.length, `${c.id} unlockHint`).toBeGreaterThan(8);
      expect(c.scenes.length, `${c.id} scenes`).toBeGreaterThanOrEqual(2);
      const lines = c.scenes.reduce((n, s) => n + s.lines.length, 0);
      expect(lines, `${c.id} total lines`).toBeGreaterThanOrEqual(4);
      for (const s of c.scenes) {
        expect(CUTSCENE_PAINTERS[s.painter], `${c.id}/${s.id} painter '${s.painter}' has no renderer`).toBeDefined();
        expect(CUTSCENE_REDUCED_T[s.painter], `${c.id}/${s.id} painter '${s.painter}' has no reduced-motion still`).toBeDefined();
        expect(s.durMs, `${c.id}/${s.id} hold`).toBeGreaterThanOrEqual(3000);
        for (const b of s.beats) {
          expect(ALLOWED_CUES.has(b.cue), `${c.id}/${s.id} beat cue '${b.cue}' is not a cinematic cue`).toBe(true);
          expect(b.at * 1000, `${c.id}/${s.id} beat at ${b.at}s outlives the scene`).toBeLessThan(s.durMs);
        }
        for (const l of s.lines) expect(l.at * 1000, `${c.id}/${s.id} line at ${l.at}s outlives the scene`).toBeLessThan(s.durMs);
      }
    }
  });

  it('every unlock grants a SMALL passive — mul within ±2%, flat adds tiny and whitelisted', () => {
    const FLAT_OK: Record<string, number> = { startBiomassBonus: 20 }; // field → max flat value
    for (const c of CUTSCENES) {
      const e = c.boost.effect;
      expect(c.boost.label.length, `${c.id} boost label`).toBeGreaterThan(8);
      if (e.op === 'mul') {
        expect(e.value, `${c.id} boost too strong (docs/CUTSCENES.md §boosts)`).toBeGreaterThanOrEqual(0.98);
        expect(e.value, `${c.id} boost too strong`).toBeLessThanOrEqual(1.02);
        expect(e.value).not.toBe(1);
      } else if (e.op === 'add') {
        expect(FLAT_OK[e.field], `${c.id} flat boost field '${e.field}' is not whitelisted`).toBeDefined();
        expect(e.value).toBeGreaterThan(0);
        expect(e.value, `${c.id} flat boost too large`).toBeLessThanOrEqual(FLAT_OK[e.field]);
      } else {
        throw new Error(`${c.id}: boosts must be mul/add, got '${e.op}'`);
      }
    }
  });
});

describe('film direction (docs/CUTSCENES.md §direction) — premieres show their monster', () => {
  it('every Mega premiere opens on the ACTUAL mega, posed along a well-formed arc', () => {
    for (const c of CUTSCENES.filter((x) => x.kind === 'mega')) {
      const s = c.scenes[0];
      expect(s.painter, `${c.id} must open on its own mega (painter 'mega'), not a stand-in tableau`).toBe('mega');
      const arc = s.mega;
      expect(arc, `${c.id}/${s.id} needs a mega arc`).toBeDefined();
      if (!arc) continue;
      expect(arc.reveal).toBeGreaterThan(0);
      expect(arc.ignite).toBeGreaterThanOrEqual(0);
      if (arc.fall !== undefined) {
        expect(arc.fall, `${c.id}/${s.id}: the organs ignite before the fall`).toBeGreaterThan(arc.ignite);
        expect(arc.fall * 1000, `${c.id}/${s.id}: the fall lands inside the hold`).toBeLessThan(s.durMs);
        // reduced motion shows the organism IN FULL: revealed, before any fall
        expect(cutsceneStillT(s)).toBeLessThan(arc.fall);
      }
      expect(cutsceneStillT(s), `${c.id}/${s.id}: the reduced-motion still is past the silhouette`).toBeGreaterThanOrEqual(arc.reveal);
    }
  });

  it("the 'mega' painter only appears in mega films (a story film has no organism to pose)", () => {
    for (const c of CUTSCENES) {
      for (const s of c.scenes) {
        if (s.painter === 'mega') expect(c.kind, `${c.id}/${s.id}`).toBe('mega');
        if (s.mega) expect(s.painter, `${c.id}/${s.id}: a mega arc needs the 'mega' painter`).toBe('mega');
      }
    }
  });

  it('direction rows are well-formed: copy bands, punch ceiling, beats in clock order, ≥1 punch per film', () => {
    for (const c of CUTSCENES) {
      let impacts = 0;
      for (const s of c.scenes) {
        if (s.copyAt !== undefined) expect(['center', 'upper', 'lower']).toContain(s.copyAt);
        if (s.punch !== undefined) expect(s.punch, `${c.id}/${s.id} punch ≤ 6 %`).toBeLessThanOrEqual(0.06);
        if (s.camera) expect(Math.abs(s.camera.zoom), `${c.id}/${s.id} drift stays subtle`).toBeLessThanOrEqual(0.04);
        for (let i = 1; i < s.beats.length; i++) expect(s.beats[i].at, `${c.id}/${s.id} beats in clock order`).toBeGreaterThan(s.beats[i - 1].at);
        impacts += s.beats.filter((b) => b.impact).length;
      }
      expect(impacts, `${c.id} lands at least one camera punch`).toBeGreaterThan(0);
    }
  });
});

describe('derived unlocks (save/derive.isCutsceneUnlocked)', () => {
  it('a fresh save has NOTHING unlocked and ZERO passive effects (the golden guard)', () => {
    const s = defaultSave();
    expect(unlockedCutsceneIds(s)).toEqual([]);
    expect(cutsceneEffects(unlockedCutsceneIds(s))).toEqual([]);
  });

  it('mega films unlock from the slain ledger; story films from their milestones', () => {
    const s = defaultSave();
    s.megaProgress = { ...s.megaProgress, slain: ['voraxis'] };
    expect(isCutsceneUnlocked(s, cutsceneDef('mega:voraxis')!)).toBe(true);
    expect(isCutsceneUnlocked(s, cutsceneDef('mega:meridia')!)).toBe(false);

    s.campaign = { ...s.campaign, cleared: { standard: 3 } };
    expect(isCutsceneUnlocked(s, cutsceneDef('story:awakening')!)).toBe(true);
    expect(isCutsceneUnlocked(s, cutsceneDef('story:hollow-signal')!)).toBe(false);

    s.prestige = { ...s.prestige, molts: 1 };
    expect(isCutsceneUnlocked(s, cutsceneDef('story:first-molt')!)).toBe(true);

    s.bestWave = 40;
    expect(isCutsceneUnlocked(s, cutsceneDef('story:the-deep')!)).toBe(true);

    const fx = cutsceneEffects(unlockedCutsceneIds(s));
    expect(fx.length).toBe(4); // voraxis + awakening + first-molt + the-deep
  });

  it('story milestones are DISTINCT (every story film unlocks from a different door)', () => {
    const keys = CUTSCENES.filter((c) => c.kind === 'story').map((c) =>
      c.unlock.kind === 'stage' ? `stage:${c.unlock.stage}`
        : c.unlock.kind === 'quest' ? `quest:${c.unlock.questId}`
        : c.unlock.kind);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
