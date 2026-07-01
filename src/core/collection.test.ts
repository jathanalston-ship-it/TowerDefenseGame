import { describe, it, expect } from 'vitest';
import { collectionView, unlockedRewards, collectionBonusEffects, collectionEconomyBonuses, rankOf, COLLECTION_REWARDS } from './collection';
import type { CollectionContext } from './collection';
import { defaultLifetimeStats } from '../save/saveStore';
import { ENEMY_KINDS, TOWER_ORDER, HERO_IDS, enemyRegistry, towerRegistry, heroRegistry, chestRegistry } from './config';
import { cardRegistry } from './cards';
import { ALL_ITEMS } from './equipment';
import { CHASSIS } from './boss';
import { BIOMES } from './biomes';
import { validateEffects } from './validate';

const freshCtx = (): CollectionContext => ({ stats: defaultLifetimeStats(), ownedDefIds: new Set(), bestWave: 0, bossesSlain: new Set(), biomesSeen: new Set() });

function fullCtx(): CollectionContext {
  const stats = defaultLifetimeStats();
  for (const k of ENEMY_KINDS) stats.killsByEnemy[k] = 10_000;
  for (const k of TOWER_ORDER) stats.towerUsage[k] = 10_000;
  for (const id of HERO_IDS) stats.heroUsage[id] = 10_000;
  stats.uniqueCards = cardRegistry.ids();
  return { stats, ownedDefIds: new Set(ALL_ITEMS.map((i) => i.id)), bestWave: 99, bossesSlain: new Set(Object.keys(CHASSIS)), biomesSeen: new Set(BIOMES.map((b) => b.id)) };
}

describe('collection layer', () => {
  it('enumerates straight from the registries (scales with content)', () => {
    const v = collectionView(freshCtx());
    const expectedTotal = enemyRegistry.size + Object.keys(CHASSIS).length + towerRegistry.size + heroRegistry.size + cardRegistry.size + ALL_ITEMS.length + BIOMES.length + chestRegistry.size;
    expect(v.total).toBe(expectedTotal);
    expect(v.categories.map((c) => c.id)).toEqual(['enemies', 'bosses', 'towers', 'heroes', 'cards', 'equipment', 'biomes', 'chests']);
  });

  it('a fresh save is golden-safe — no bonus effects, neutral economy, Power exactly 1', () => {
    const v = collectionView(freshCtx());
    expect(collectionBonusEffects(v)).toEqual([]);
    expect(v.pct).toBeLessThan(0.1);
    expect(v.power).toBeCloseTo(1, 9); // POWER_BASE invariant: a fresh account's collection part is 1
    const econ = collectionEconomyBonuses(v);
    expect(econ).toEqual({ towerXpMult: 1, heroXpMult: 1, bossLootMult: 1, campaignRewardMult: 1, lootQualityTier: 0 });
  });

  it('full discovery completes every category, unlocks the Completionist, and raises Power + economy', () => {
    const v = collectionView(fullCtx());
    expect(v.discovered).toBe(v.total);
    expect(v.categories.every((c) => c.complete)).toBe(true);
    expect(unlockedRewards(v).map((r) => r.id)).toContain('title_completionist');
    expect(collectionBonusEffects(v).length).toBeGreaterThan(0);
    expect(v.power).toBeGreaterThan(1); // discovering everything strictly improves the account
    expect(v.rank).toBe('Ascendant');
    const econ = collectionEconomyBonuses(v);
    expect(econ.towerXpMult).toBeGreaterThan(1);
    expect(econ.campaignRewardMult).toBeGreaterThan(1);
    expect(econ.lootQualityTier).toBeGreaterThan(0);
  });

  it('discovery tiers rise with usage (mastery ladder)', () => {
    const ctx = freshCtx();
    ctx.stats.killsByEnemy.runner = 1; // just slain
    const lo = collectionView(ctx).categories.find((c) => c.id === 'enemies')!.entries.find((e) => e.id === 'runner')!;
    ctx.stats.killsByEnemy.runner = 10_000; // mastered
    const hi = collectionView(ctx).categories.find((c) => c.id === 'enemies')!.entries.find((e) => e.id === 'runner')!;
    expect(lo.tier).toBe(1);
    expect(hi.tier).toBe(hi.maxTier);
  });

  it('card entries surface the permanent Gene level in the LABEL only (completion untouched)', () => {
    const ctx = freshCtx();
    const id = cardRegistry.ids()[0];
    ctx.stats.uniqueCards = [id];
    const plain = collectionView(ctx).categories.find((c) => c.id === 'cards')!;
    ctx.geneLevels = { [id]: 2 };
    const leveled = collectionView(ctx).categories.find((c) => c.id === 'cards')!;
    expect(plain.entries.find((e) => e.id === id)!.tierLabel).toBe('Collected');
    expect(leveled.entries.find((e) => e.id === id)!.tierLabel).toBe('Gene Level 2');
    expect(leveled.completion).toBe(plain.completion); // label enrichment can't move collection Power
  });

  it('rank rises with completion (Bronze at first discovery → Ascendant at 100%)', () => {
    expect(rankOf(0).name).toBe('Unranked');
    expect(rankOf(0.001).name).toBe('Bronze');
    expect(rankOf(0.5).name).toBe('Gold');
    expect(rankOf(1).name).toBe('Ascendant');
    // Every bonus-bearing category is Unranked on a fresh save (only the auto-earned starter cache
    // is discovered), so no mechanical bonus is active for a new player.
    expect(collectionView(freshCtx()).categories.find((c) => c.id === 'enemies')!.rank).toBe('Unranked');
  });

  it('collection bonus effects reference valid run-modifier fields', () => {
    // The mechanical bonuses fold into a run like gear, so their fields must be real sim knobs.
    expect(validateEffects(collectionBonusEffects(collectionView(fullCtx())), 'collection bonuses')).toEqual([]);
  });

  it('completion rewards are identity-only (no dangling effects field)', () => {
    for (const r of COLLECTION_REWARDS) expect(r).not.toHaveProperty('effects');
  });
});
