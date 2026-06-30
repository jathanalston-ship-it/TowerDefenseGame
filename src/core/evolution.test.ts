// Evolution Tier invariants (docs/TOWER-CODEX.md §1): the campaign-gated Star Cap + milestone
// detection, and the meta gate that enforces it on star purchases.

import { describe, it, expect } from 'vitest';
import {
  BASE_STAR_CAP, EVOLUTION_MILESTONES, evolutionStarCap, highestCampaignStage, milestoneCrossed,
} from './evolution';
import { STAR } from './config';
import { nextStarCost } from '../state/meta';
import { defaultSave } from '../save/saveStore';

describe('evolution tiers', () => {
  it('a fresh save sits at the base cap; milestones raise it; never past the absolute max', () => {
    expect(evolutionStarCap(0)).toBe(BASE_STAR_CAP);
    expect(evolutionStarCap(3)).toBe(BASE_STAR_CAP); // below the first milestone
    expect(evolutionStarCap(4)).toBe(7); // first milestone
    expect(evolutionStarCap(8)).toBe(8);
    expect(evolutionStarCap(16)).toBe(10);
    expect(evolutionStarCap(999)).toBe(STAR.maxTowerStars); // clamped
    // monotonic non-decreasing in stage
    let prev = 0;
    for (let s = 0; s <= 25; s++) { const c = evolutionStarCap(s); expect(c).toBeGreaterThanOrEqual(prev); prev = c; }
  });

  it('highestCampaignStage takes the best progress across difficulties', () => {
    expect(highestCampaignStage({})).toBe(0);
    expect(highestCampaignStage({ standard: 7, brutal: 3 })).toBe(7);
    expect(highestCampaignStage({ standard: 2, hardened: 12 })).toBe(12);
  });

  it('milestoneCrossed fires only on the wave that opens a new tier (highest crossed)', () => {
    expect(milestoneCrossed(0, 3)).toBeNull(); // no milestone in (0,3]
    expect(milestoneCrossed(3, 4)?.starCap).toBe(7); // crossed stage 4
    expect(milestoneCrossed(4, 4)).toBeNull(); // replay, no new ground
    expect(milestoneCrossed(7, 8)?.starCap).toBe(8);
    expect(milestoneCrossed(0, 20)?.starCap).toBe(10); // a big jump → the HIGHEST crossed milestone
    // every milestone is detectable exactly at its threshold
    for (const m of EVOLUTION_MILESTONES) expect(milestoneCrossed(m.stage - 1, m.stage)?.starCap).toBe(m.starCap);
  });
});

describe('star-cost gate', () => {
  it('caps purchasable stars at the campaign-unlocked Evolution Tier', () => {
    const save = defaultSave();
    save.towerStars.needle = BASE_STAR_CAP; // at the base cap with no campaign progress
    expect(nextStarCost(save, 'needle')).toBeNull(); // blocked — needs a campaign milestone

    save.campaign.cleared = { standard: 4 }; // clear the first milestone → cap ★7
    expect(nextStarCost(save, 'needle')).not.toBeNull(); // now buyable
    save.towerStars.needle = 7;
    expect(nextStarCost(save, 'needle')).toBeNull(); // capped again at the new tier

    save.campaign.cleared = { standard: 16 }; // all milestones → cap ★10
    save.towerStars.needle = 9;
    expect(nextStarCost(save, 'needle')).not.toBeNull();
    save.towerStars.needle = STAR.maxTowerStars;
    expect(nextStarCost(save, 'needle')).toBeNull(); // absolute max
  });

  it('never downgrades a legacy over-cap tower (gate is purchase-only)', () => {
    const save = defaultSave();
    save.towerStars.mortar = 10; // legacy ★10 with no campaign progress
    expect(save.towerStars.mortar).toBe(10); // kept
    expect(nextStarCost(save, 'mortar')).toBeNull(); // simply can't go higher
  });
});
