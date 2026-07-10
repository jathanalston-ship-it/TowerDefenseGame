import { describe, it, expect } from 'vitest';
import { collectionView, unlockedRewards, collectionBonusEffects, collectionEconomyBonuses, rankOf, COLLECTION_REWARDS } from './collection';
import type { CollectionContext } from './collection';
import { defaultLifetimeStats } from '../save/saveStore';
import { ENEMY_KINDS, TOWER_ORDER, HERO_IDS, enemyRegistry, towerRegistry, heroRegistry, chestRegistry } from './config';
import { cardRegistry } from './cards';
import { ALL_ITEMS } from './equipment';
import { CHASSIS } from './boss';
import { megaBossRegistry } from './megaboss';
import { BIOMES } from './biomes';
import { cosmeticRegistry } from './cosmetics';
import { wardrobeRegistry } from './wardrobe';
import { mulliganRegistry } from './mulligan';
import { validateEffects } from './validate';

const freshCtx = (): CollectionContext => ({ stats: defaultLifetimeStats(), ownedDefIds: new Set(), bestWave: 0, bossesSlain: new Set(), megaSlain: new Set(), megaPerfect: new Set(), megaSpeed: new Set(), biomesSeen: new Set(), cosmeticsOwned: new Set(), wardrobeOwned: new Set(), mulliganDex: {}, mulliganOrganisms: {} });

function fullCtx(): CollectionContext {
  const stats = defaultLifetimeStats();
  for (const k of ENEMY_KINDS) stats.killsByEnemy[k] = 10_000;
  for (const k of TOWER_ORDER) stats.towerUsage[k] = 10_000;
  for (const id of HERO_IDS) stats.heroUsage[id] = 10_000;
  stats.uniqueCards = cardRegistry.ids();
  const megaIds = new Set(megaBossRegistry.ids());
  return { stats, ownedDefIds: new Set(ALL_ITEMS.map((i) => i.id)), bestWave: 99, bossesSlain: new Set(Object.keys(CHASSIS)), megaSlain: megaIds, megaPerfect: megaIds, megaSpeed: megaIds, biomesSeen: new Set(BIOMES.map((b) => b.id)), cosmeticsOwned: new Set(cosmeticRegistry.ids()), wardrobeOwned: new Set(wardrobeRegistry.ids()), mulliganDex: Object.fromEntries(mulliganRegistry.ids().map((id) => [id, 'ascendant' as const])), mulliganOrganisms: Object.fromEntries(TOWER_ORDER.map((k) => [k, { active: true, locked: true }])) };
}

describe('collection layer', () => {
  it('enumerates straight from the registries (scales with content)', () => {
    const v = collectionView(freshCtx());
    const expectedTotal = enemyRegistry.size + Object.keys(CHASSIS).length + megaBossRegistry.size + towerRegistry.size + heroRegistry.size + cardRegistry.size + ALL_ITEMS.length + BIOMES.length + chestRegistry.size + cosmeticRegistry.size + wardrobeRegistry.size + mulliganRegistry.size + TOWER_ORDER.length;
    expect(v.total).toBe(expectedTotal);
    expect(v.categories.map((c) => c.id)).toEqual(['enemies', 'bosses', 'megaBosses', 'towers', 'heroes', 'cards', 'equipment', 'biomes', 'chests', 'towerSkins', 'heroSkins', 'wardrobeArena', 'wardrobeAudio', 'wardrobeInterface', 'wardrobeIdentity', 'mulligans', 'mulliganOrganisms']);
  });

  it('the codex enumerates the recent content (Coil/Siphon towers · Revenant/Vitriol heroes · Deep-Strain cards · Mega Bosses)', () => {
    const v = collectionView(freshCtx());
    const idsIn = (cat: string) => new Set(v.categories.find((c) => c.id === cat)!.entries.map((e) => e.id));
    const towers = idsIn('towers');
    expect(towers.has('coil')).toBe(true); // Resonance Coil
    expect(towers.has('siphon')).toBe(true); // Marrow Siphon
    const heroes = idsIn('heroes');
    expect(heroes.has('revenant')).toBe(true); // the phase-assassin
    expect(heroes.has('vitriol')).toBe(true); // the siege caste
    const cards = idsIn('cards');
    expect(cards.has('deep_overclock')).toBe(true); // a general Deep-Strain gene card
    expect(cards.has('gorging_instinct')).toBe(true); // a Marrow Siphon identity card
    expect(v.categories.find((c) => c.id === 'megaBosses')!.total).toBeGreaterThan(0); // Mega Bosses are a category
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
