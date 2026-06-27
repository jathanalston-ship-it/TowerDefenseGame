import { describe, it, expect } from 'vitest';
import { collectionView, unlockedRewards, collectionBonusEffects, COLLECTION_REWARDS } from './collection';
import type { CollectionContext } from './collection';
import { defaultLifetimeStats } from '../save/saveStore';
import { ENEMY_KINDS, TOWER_ORDER, HERO_IDS, enemyRegistry, towerRegistry, heroRegistry, chestRegistry } from './config';
import { cardRegistry } from './cards';
import { ALL_ITEMS } from './equipment';
import { validateEffects } from './validate';

const freshCtx = (): CollectionContext => ({ stats: defaultLifetimeStats(), ownedDefIds: new Set(), bestWave: 0 });

function fullCtx(): CollectionContext {
  const stats = defaultLifetimeStats();
  for (const k of ENEMY_KINDS) stats.killsByEnemy[k] = 10_000;
  for (const k of TOWER_ORDER) stats.towerUsage[k] = 10_000;
  for (const id of HERO_IDS) stats.heroUsage[id] = 10_000;
  stats.uniqueCards = cardRegistry.ids();
  return { stats, ownedDefIds: new Set(ALL_ITEMS.map((i) => i.id)), bestWave: 99 };
}

describe('collection layer', () => {
  it('enumerates straight from the registries (scales with content)', () => {
    const v = collectionView(freshCtx());
    const expectedTotal = enemyRegistry.size + towerRegistry.size + heroRegistry.size + cardRegistry.size + ALL_ITEMS.length + chestRegistry.size;
    expect(v.total).toBe(expectedTotal);
    expect(v.categories.map((c) => c.id)).toEqual(['enemies', 'towers', 'heroes', 'cards', 'equipment', 'chests']);
  });

  it('a fresh save unlocks no completion bonuses — so a new run is golden-safe', () => {
    const v = collectionView(freshCtx());
    expect(collectionBonusEffects(v)).toEqual([]);
    expect(v.pct).toBeLessThan(0.1);
    expect(unlockedRewards(v).filter((r) => r.kind === 'bonus')).toEqual([]);
  });

  it('full discovery completes every category and unlocks the Completionist + bonuses', () => {
    const v = collectionView(fullCtx());
    expect(v.discovered).toBe(v.total);
    expect(v.categories.every((c) => c.complete)).toBe(true);
    const ids = unlockedRewards(v).map((r) => r.id);
    expect(ids).toContain('title_completionist');
    expect(ids).toContain('bonus_completionist');
    expect(collectionBonusEffects(v).length).toBeGreaterThan(0);
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

  it('every completion-bonus reward references valid run-modifier fields', () => {
    for (const r of COLLECTION_REWARDS) {
      if (r.kind === 'bonus' && r.effects) expect(validateEffects(r.effects, `reward '${r.id}'`)).toEqual([]);
    }
  });
});
