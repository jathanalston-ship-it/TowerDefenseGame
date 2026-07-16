// MASTERY EVOLUTION meta pipeline (docs/MASTERY.md §evolution track): claims bank every good
// through its REAL lane in one atomic persist, the prestige loop re-arms without ever touching
// mastery level, and the v44 sanitizer holds tampered claim state to the loop window.

import { describe, expect, it } from 'vitest';
import { meta, masteryLevel } from './meta';
import { defaultSave, serializeExport } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';
import { masteryEvolutionTrack, trackLevelFromXp } from '../core/masteryEvolution';
import { MASTERY } from '../core/config';

/** XP that lands AT (or just past) mastery level `n` — walked through the real curve so
 *  per-level rounding can never leave the fixture one level short. */
function xpForLevel(n: number): number {
  let xp = 0;
  let step = MASTERY.baseReq;
  while (masteryLevel(xp) < n) { xp += step; step *= 1.05; }
  return xp;
}

function seed(over: Partial<SaveData> = {}): void {
  const base = defaultSave();
  const imported = meta.importText(serializeExport({ ...base, ...over } as SaveData));
  expect(imported.ok).toBe(true);
}

describe('claims (one atomic persist through the real lanes)', () => {
  it('claims every reached node once, banks shards on the unit, and never double-pays', () => {
    seed({ towerMasteryXp: { ...defaultSave().towerMasteryXp, needle: xpForLevel(23) } });
    const st0 = meta.masteryEvolutionState('tower', 'needle');
    expect(st0).toEqual({ claimedUpTo: 0, prestige: 0, xpAt: 0 });
    // Debut-loop invariant: the helix's meter and the mastery bar agree exactly.
    expect(trackLevelFromXp(xpForLevel(23), 0)).toBe(masteryLevel(xpForLevel(23)));
    const shards0 = meta.get().towerShards.needle ?? 0;
    const claimed = meta.claimMasteryEvolution('tower', 'needle');
    const track = masteryEvolutionTrack('tower', 'needle', 0);
    const due = track.nodes.filter((n) => n.level <= 23);
    expect(claimed).toBe(due.length); // every reached node paid
    const expectShards = due.flatMap((n) => n.grants).filter((g) => g.kind === 'unitShards')
      .reduce((a, g) => a + ('amount' in g ? g.amount : 0), 0);
    expect((meta.get().towerShards.needle ?? 0) - shards0).toBe(expectShards);
    expect(meta.masteryEvolutionState('tower', 'needle').claimedUpTo).toBe(23);
    expect(meta.claimMasteryEvolution('tower', 'needle')).toBe(0); // idempotent — nothing re-pays
  });

  it('non-shard lanes land where they live (cores/essence/mats/containers/no P1 ichor)', () => {
    seed({ towerMasteryXp: { ...defaultSave().towerMasteryXp, mortar: xpForLevel(100) } });
    const s0 = meta.get();
    meta.claimMasteryEvolution('tower', 'mortar');
    const s1 = meta.get();
    const grants = masteryEvolutionTrack('tower', 'mortar', 0).nodes.flatMap((n) => n.grants);
    const sum = (k: string): number => grants.filter((g) => g.kind === k).reduce((a, g) => a + ('amount' in g ? g.amount : 0), 0);
    expect(s1.shards - s0.shards).toBe(sum('genomeCores'));
    expect(s1.geneEssence - s0.geneEssence).toBe(sum('geneEssence'));
    expect(s1.mats.scrap - s0.mats.scrap).toBe(sum('scrap'));
    expect(s1.ichor - s0.ichor).toBe(0); // P1 never pays Ichor
    const containers = grants.filter((g) => g.kind === 'container').length;
    expect(s1.pendingContainers.length - s0.pendingContainers.length).toBe(containers);
  });
});

describe('the prestige loop (mastery level NEVER decreases)', () => {
  it('evolving auto-claims, re-arms the loop, and the next pool is shard-free', () => {
    seed({ heroMasteryXp: { ...defaultSave().heroMasteryXp, ravager: xpForLevel(100) } });
    expect(meta.prestigeMasteryEvolution('hero', 'ravager')).toBe(true);
    const st = meta.masteryEvolutionState('hero', 'ravager');
    const xp = meta.get().heroMasteryXp.ravager ?? 0;
    // The XP watermark stamps at the evolution (docs/MASTERY.md §pacing) — loop 2 is metered
    // from here; the mastery level itself never regressed (it lives on its own curve).
    expect(st).toEqual({ claimedUpTo: 0, prestige: 1, xpAt: xp });
    expect(masteryLevel(xp)).toBeGreaterThanOrEqual(100);
    expect(trackLevelFromXp(xp - st.xpAt, st.prestige)).toBe(0);
    // The new pool never pays hero shards again.
    const grants = masteryEvolutionTrack('hero', 'ravager', 1).nodes.flatMap((n) => n.grants);
    expect(grants.some((g) => g.kind === 'unitShards')).toBe(false);
    // …and an un-completed loop refuses to evolve.
    expect(meta.prestigeMasteryEvolution('hero', 'ravager')).toBe(false);
  });
});

describe('Power Score reflection (docs/POWER-SCORE.md §coverage)', () => {
  it('every completed loop raises account Power; an empty record reads exactly like v43', () => {
    seed();
    const base = meta.power().score;
    const oneLoop = meta.previewPower((s) => ({
      ...s, masteryEvolution: { 'tower:needle': { claimedUpTo: 0, prestige: 1, xpAt: 0 } },
    })).score;
    const fiveLoops = meta.previewPower((s) => ({
      ...s, masteryEvolution: {
        'tower:needle': { claimedUpTo: 0, prestige: 2, xpAt: 0 },
        'hero:ravager': { claimedUpTo: 0, prestige: 3, xpAt: 0 },
      },
    })).score;
    expect(oneLoop).toBeGreaterThan(base); // the preview announces the EVOLVE before it happens
    expect(fiveLoops).toBeGreaterThan(oneLoop); // …and deeper loops keep paying
    expect(meta.previewPower((s) => ({ ...s, masteryEvolution: {} })).score).toBe(base); // neutral at zero
  });
});

describe('v44 sanitizer (tamper holds to the loop window)', () => {
  it('clamps forged claim state instead of crashing or over-paying', () => {
    const base = defaultSave();
    const forged = {
      ...base,
      masteryEvolution: { 'tower:needle': { claimedUpTo: 9999, prestige: -3, xpAt: -42 }, junk: 'nope' },
    } as unknown as SaveData;
    expect(meta.importText(serializeExport(forged)).ok).toBe(true); // sanitize folds it in
    const st = meta.get().masteryEvolution['tower:needle'];
    expect(st.claimedUpTo).toBe(100); // clamped into the loop window
    expect(st.prestige).toBe(0); // negatives floor to 0
    expect(st.xpAt).toBe(0); // a negative watermark floors to the debut loop
  });
});
