import { describe, it, expect } from 'vitest';
import {
  MASTERY_RANK_EVERY,
  masteryRank,
  masteryRankTitle,
  masteryRewardsUpTo,
  masteryRewardsBetween,
  masteryRewardById,
  masteryPerksUpTo,
  masteryTrackRegistry,
} from './mastery';
import { towerProgress } from '../state/meta';
import { defaultSave } from '../save/saveStore';

describe('procedural ranks (infinite, zero-authoring)', () => {
  it('ranks every N levels; Unranked below the first', () => {
    expect(masteryRank(0)).toBe(0);
    expect(masteryRank(MASTERY_RANK_EVERY - 1)).toBe(0);
    expect(masteryRank(MASTERY_RANK_EVERY)).toBe(1);
    expect(masteryRankTitle(0)).toBe('Unranked');
    expect(masteryRankTitle(MASTERY_RANK_EVERY)).toBe('Initiate');
  });

  it('cycles names with a numeral past the authored list — genuinely infinite', () => {
    const a = masteryRankTitle(MASTERY_RANK_EVERY * 9); // 9th rank → wraps the 8-name list
    expect(a).toMatch(/ II$/); // second cycle carries a roman numeral
    const huge = masteryRankTitle(MASTERY_RANK_EVERY * 100);
    expect(huge.length).toBeGreaterThan(0); // never empty, however deep
  });
});

describe('reward queries', () => {
  it('masteryRewardsUpTo returns authored rewards at/below a level', () => {
    const at9 = masteryRewardsUpTo('tower', 'needle', 9);
    expect(at9.length).toBe(0); // first reward is at 10
    const at25 = masteryRewardsUpTo('tower', 'needle', 25);
    expect(at25.some((r) => r.kind === 'title')).toBe(true);
    expect(at25.some((r) => r.kind === 'lore')).toBe(true);
  });

  it('masteryRewardsBetween returns only rewards crossed by a level-up', () => {
    const crossed = masteryRewardsBetween('tower', 'needle', 10, 25); // (10,25] → the ★25 title
    expect(crossed.every((r) => r.at > 10 && r.at <= 25)).toBe(true);
    expect(crossed.some((r) => r.kind === 'title')).toBe(true);
    expect(masteryRewardsBetween('tower', 'needle', 25, 25)).toEqual([]); // no level change
  });

  it('reward ids resolve back to their definition (for display)', () => {
    const r = masteryRewardById('title.needle.virtuoso');
    expect(r?.name).toBe('Needle Virtuoso');
    expect(masteryRewardById('nope')).toBeUndefined();
  });
});

describe('mastery tracks', () => {
  it('pass their validators (ascending, with ids + names)', () => {
    expect(masteryTrackRegistry.validate()).toEqual([]);
  });

  it('cover all five towers and three heroes', () => {
    for (const u of ['needle', 'mortar', 'reactor', 'parasite', 'obelisk']) {
      expect(masteryTrackRegistry.has(`tower:${u}`)).toBe(true);
    }
    for (const u of ['ravager', 'shepherd', 'overseer']) {
      expect(masteryTrackRegistry.has(`hero:${u}`)).toBe(true);
    }
  });

  it('tower = craft, hero = bond: every track has at least one title and one lore', () => {
    for (const t of masteryTrackRegistry.all()) {
      expect(t.rewards.some((r) => r.kind === 'title')).toBe(true);
      expect(t.rewards.some((r) => r.kind === 'lore')).toBe(true);
    }
  });
});

describe('mastery perks (mechanic milestones, golden-safe)', () => {
  it('grants the needle a pierce perk at mastery 50, none below', () => {
    expect(masteryPerksUpTo('tower', 'needle', 49)).toEqual([]);
    expect(masteryPerksUpTo('tower', 'needle', 50).some((p) => p.projectileMutator === 'pierce1')).toBe(true);
  });

  it('the mortar perk widens splash', () => {
    expect(masteryPerksUpTo('tower', 'mortar', 50).some((p) => (p.splashMult ?? 0) > 1)).toBe(true);
  });

  it('folds a high-mastery perk into the tower run kit (towerProgress)', () => {
    const fresh = towerProgress(defaultSave());
    expect(fresh.needle.projectileMutators).toBeUndefined(); // fresh save = identity

    const veteran = towerProgress({ ...defaultSave(), towerMasteryXp: { ...defaultSave().towerMasteryXp, needle: 1e9 } });
    expect(veteran.needle.projectileMutators).toContain('pierce1');
  });
});
