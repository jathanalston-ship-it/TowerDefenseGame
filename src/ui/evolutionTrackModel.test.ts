// Evolution Track view model (docs/MASTERY.md §evolution track) — the state partition the
// helix panel renders: claimed/ready/upcoming split, the claim/EVOLVE signals the roster
// badges trust, and player-facing grant names (no internal kinds ever leak into the UI).

import { describe, expect, it } from 'vitest';
import { defaultSave } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';
import { evolutionGrantLabel, evolutionPanelModel, evolutionRosterSignal } from './evolutionTrackModel';
import { masteryLevel } from '../state/meta';
import { MASTERY } from '../core/config';

/** XP that lands AT mastery level `n` — walked through the real curve (rounding-proof). */
function xpForLevel(n: number): number {
  let xp = 0;
  let step = MASTERY.baseReq;
  while (masteryLevel(xp) < n) { xp += step; step *= 1.05; }
  return xp;
}

function saveAt(masteryLvl: number, over: Partial<SaveData> = {}): SaveData {
  const base = defaultSave();
  return { ...base, towerMasteryXp: { ...base.towerMasteryXp, needle: xpForLevel(masteryLvl) }, ...over };
}

describe('the helix panel model', () => {
  it('partitions nodes claimed/ready/upcoming and counts the claim signal exactly', () => {
    const save = saveAt(23, { masteryEvolution: { 'tower:needle': { claimedUpTo: 12, prestige: 0, xpAt: 0 } } });
    const m = evolutionPanelModel(save, 'tower', 'needle');
    expect(m.trackLevel).toBe(23);
    expect(m.completionPct).toBe(23);
    for (const n of m.nodes) {
      const want = n.level <= 12 ? 'claimed' : n.level <= 23 ? 'ready' : 'upcoming';
      expect(n.state, `node ${n.level}`).toBe(want);
      expect(n.label.length, `node ${n.level} states its goods`).toBeGreaterThan(0);
    }
    expect(m.claimable).toBe(m.nodes.filter((n) => n.state === 'ready').length);
    expect(m.claimable).toBeGreaterThan(0);
    const upcoming = m.nodes.find((n) => n.level > 23)!;
    expect(m.next).toEqual({ level: upcoming.level, toGo: upcoming.level - 23, major: upcoming.major, label: upcoming.label });
    expect(m.canPrestige).toBe(false);
    expect(m.shardFree).toBe(false);
  });

  it('flags a completed loop ready to EVOLVE; deep loops re-window without regressing', () => {
    const done = evolutionPanelModel(saveAt(100), 'tower', 'needle');
    expect(done.trackLevel).toBe(100);
    expect(done.completionPct).toBe(100);
    expect(done.next).toBeNull();
    expect(done.canPrestige).toBe(true);
    // Deep loop (docs/MASTERY.md §pacing): loop 2 is XP-metered from the prestige watermark.
    // Build the fixture on the REAL per-level walk (base req × the loop's ×1.25 effort).
    const xpAt = xpForLevel(100);
    let intoLoop2 = 0;
    for (let l = 0; l < 37; l++) intoLoop2 += Math.round(Math.round(MASTERY.baseReq * Math.pow(MASTERY.reqGrowth, l)) * 1.25);
    const base = defaultSave();
    const deepSave: SaveData = {
      ...base,
      towerMasteryXp: { ...base.towerMasteryXp, needle: xpAt + intoLoop2 + 1 },
      masteryEvolution: { 'tower:needle': { claimedUpTo: 0, prestige: 1, xpAt } },
    };
    const deep = evolutionPanelModel(deepSave, 'tower', 'needle');
    expect(deep.trackLevel).toBe(37);
    expect(deep.masteryLevel).toBeGreaterThanOrEqual(100); // the lifetime level NEVER re-windows
    expect(deep.shardFree).toBe(true);
    expect(deep.nodes.some((n) => n.label.includes('Strain Samples'))).toBe(false); // P2+ shard-free
  });

  it('roster signal mirrors the panel — badges and the Evolution sort can trust it', () => {
    const save = saveAt(23);
    const m = evolutionPanelModel(save, 'tower', 'needle');
    expect(evolutionRosterSignal(save, 'tower', 'needle')).toEqual({ claimable: m.claimable, ready: m.canPrestige });
  });
});

describe('grant labels (player-facing currency names)', () => {
  it('names every grant kind, with the unit-shard name keyed to the subject', () => {
    expect(evolutionGrantLabel({ kind: 'unitShards', amount: 5 }, 'tower')).toBe('+5 Strain Samples');
    expect(evolutionGrantLabel({ kind: 'unitShards', amount: 5 }, 'hero')).toBe('+5 Apex Genome');
    expect(evolutionGrantLabel({ kind: 'genomeCores', amount: 40 }, 'tower')).toBe('+40 Genome Cores');
    expect(evolutionGrantLabel({ kind: 'geneEssence', amount: 25 }, 'tower')).toBe('+25 Gene Essence');
    expect(evolutionGrantLabel({ kind: 'scrap', amount: 12 }, 'tower')).toBe('+12 Scrap');
    expect(evolutionGrantLabel({ kind: 'mutagen', amount: 6 }, 'tower')).toBe('+6 Mutagen');
    expect(evolutionGrantLabel({ kind: 'catalyst', amount: 2 }, 'tower')).toBe('+2 Catalyst');
    expect(evolutionGrantLabel({ kind: 'container', tier: 1 }, 'tower')).toBe('Bio Container (Rare)');
    expect(evolutionGrantLabel({ kind: 'container', tier: 3 }, 'tower')).toBe('Bio Container (Legendary)');
    expect(evolutionGrantLabel({ kind: 'ichor', amount: 1 }, 'tower')).toBe('+1 Ichor');
  });
});
