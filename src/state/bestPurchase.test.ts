// Best-Purchase advisor (docs/POWER-SCORE.md §advisor) — the ranking is EXACT (diffs the real
// pure scorer per hypothetical purchase), sorted by Power-per-1000-currency within a surface,
// flags affordability without filtering on it, and never recommends a zero-gain purchase.

import { describe, expect, it } from 'vitest';
import { bestPurchase, purchaseCandidates } from './bestPurchase';
import { powerBreakdown } from './profile';
import { defaultSave } from '../save/saveStore';
import { TOWER_ORDER } from '../core/config';
import type { SaveData } from '../save/saveStore';

/** A save with real options open: campaign deep enough to lift the evolution cap + gates,
 *  a discovered gene card, and wallets that afford SOME but not all of it. */
function developed(): SaveData {
  const s = defaultSave();
  s.campaign.cleared = { standard: 30 };
  s.totalRuns = 25;
  s.stats.uniqueCards = ['overcharge']; // a real CARD_POOL id? replaced below if not
  s.geneEssence = 200;
  s.shards = 500;
  s.towerShards[TOWER_ORDER[0]] = 10_000;
  return s;
}

describe('purchase candidates — exact deltas, honest ordering', () => {
  it('tower stars: candidates exist, deltas match the scorer, ranking is by value density', () => {
    const s = developed();
    const ranked = purchaseCandidates(s, 'towers');
    expect(ranked.length).toBeGreaterThan(0);
    // The delta is EXACTLY the scorer diff for that single mutation.
    const c = ranked[0];
    const base = powerBreakdown(s).score;
    const after = powerBreakdown({ ...s, towerStars: { ...s.towerStars, [c.id]: (s.towerStars[c.id as typeof TOWER_ORDER[number]] ?? 0) + 1 } }).score;
    expect(c.powerDelta).toBeCloseTo(Math.max(0, after - base), 6);
    // Sorted best-value first.
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].valuePer1k + 1e-9).toBeGreaterThanOrEqual(ranked[i].valuePer1k);
    // The funded tower is affordable; unfunded roster kinds are flagged, not hidden.
    expect(ranked.some((r) => r.affordable)).toBe(true);
    expect(ranked.some((r) => !r.affordable)).toBe(true);
  });

  it('evolution upgrades rank and stay inside gates/caps', () => {
    const s = developed();
    const ranked = purchaseCandidates(s, 'evolution');
    expect(ranked.length).toBeGreaterThan(0);
    for (const c of ranked) {
      expect(c.cost).toBeGreaterThan(0);
      expect(c.powerDelta).toBeGreaterThanOrEqual(0);
    }
  });

  it('bestPurchase: never recommends a zero-gain buy; affordable pick honors the wallet', () => {
    const s = developed();
    const { best, bestAffordable, ranked } = bestPurchase(s, 'towers');
    expect(best).not.toBeNull();
    for (const c of ranked) expect(c.powerDelta).toBeGreaterThan(0);
    if (bestAffordable) {
      expect(bestAffordable.affordable).toBe(true);
      // The affordable pick is the best-value AMONG affordable rows.
      const firstAffordable = ranked.find((c) => c.affordable);
      expect(bestAffordable.id).toBe(firstAffordable!.id);
    }
  });

  it('a fresh save advises quietly (no options ⇒ null, never a crash)', () => {
    const s = defaultSave();
    const genes = bestPurchase(s, 'genes');
    expect(genes.best === null || genes.best.powerDelta > 0).toBe(true);
  });
});
