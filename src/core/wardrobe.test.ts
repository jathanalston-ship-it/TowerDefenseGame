// Wardrobe framework (docs/COSMETICS.md §wardrobe): catalog integrity, payload contracts,
// source resolution (every referenced achievement/collection/milestone target is REAL),
// the auto-unlock evaluator, and the milestone table's item references.

import { describe, expect, it } from 'vitest';
import {
  boutiqueItems, earnedAutoItems, isAutoSource, seasonItems, sourceLabel, starterItems,
  WARDROBE_KINDS, WARDROBE_MILESTONES, wardrobeItem, wardrobeItemsOf, wardrobeRegistry,
} from './wardrobe';
import type { WardrobeUnlockCtx } from './wardrobe';
import { achievementById } from '../state/achievements';
import { SEASONS } from './battlePass';

const freshCtx = (): WardrobeUnlockCtx => ({
  campaignStage: 0, bestDepth: 0, dailyClears: 0, rushBossKills: 0, rouletteSpores: 0,
  achievements: new Set(), collectionRanks: {}, overallRank: 0,
});

describe('the catalog', () => {
  it('registers a meaningful launch catalog with every kind populated', () => {
    expect(wardrobeRegistry.size).toBeGreaterThanOrEqual(120);
    for (const k of WARDROBE_KINDS) {
      expect(wardrobeItemsOf(k.id).length, `kind ${k.id} has no items`).toBeGreaterThanOrEqual(2);
    }
  });

  it('every source lane is populated (the progression spread is real)', () => {
    const lanes = new Set(wardrobeRegistry.all().map((d) => d.source.kind));
    for (const lane of ['starter', 'campaign', 'infinite', 'daily', 'rush', 'roulette', 'achievement', 'collection', 'shop', 'battlepass', 'milestone', 'event'] as const) {
      expect(lanes.has(lane), `no item from lane ${lane}`).toBe(true);
    }
  });

  it('achievement sources reference REAL achievements', () => {
    for (const d of wardrobeRegistry.all()) {
      if (d.source.kind === 'achievement') {
        expect(achievementById(d.source.id), `${d.id} → unknown achievement ${d.source.id}`).toBeDefined();
      }
    }
  });

  it('battlepass sources reference REAL seasons + levels 1..100', () => {
    const seasonIds = new Set(SEASONS.map((s) => s.id));
    for (const d of wardrobeRegistry.all()) {
      if (d.source.kind === 'battlepass') {
        expect(seasonIds.has(d.source.season), `${d.id} → unknown season`).toBe(true);
        expect(d.source.level).toBeGreaterThanOrEqual(1);
        expect(d.source.level).toBeLessThanOrEqual(100);
      }
    }
    // Each pass ships a real premium haul + a seeded free lane.
    for (const s of SEASONS) {
      const items = seasonItems(s.id);
      expect(items.filter((d) => d.source.kind === 'battlepass' && d.source.track === 'premium').length).toBeGreaterThanOrEqual(12);
      expect(items.filter((d) => d.source.kind === 'battlepass' && d.source.track === 'free').length).toBeGreaterThanOrEqual(2);
    }
  });

  it('milestone rewards reference real items, sourced from the milestone lane', () => {
    for (const m of WARDROBE_MILESTONES) {
      for (const r of m.rewards) {
        if (r.kind === 'item') {
          const item = wardrobeItem(r.id);
          expect(item, `${m.id} → missing item ${r.id}`).toBeDefined();
          expect(item!.source.kind).toBe('milestone');
        }
      }
    }
  });

  it('starters exist and the boutique is priced', () => {
    expect(starterItems().length).toBeGreaterThanOrEqual(5);
    expect(boutiqueItems().length).toBeGreaterThanOrEqual(15);
    for (const d of boutiqueItems()) {
      expect(d.source.kind === 'shop' && d.source.ichor).toBeGreaterThanOrEqual(40);
    }
  });

  it('every item has a human source label', () => {
    for (const d of wardrobeRegistry.all()) expect(sourceLabel(d.source).length).toBeGreaterThan(3);
  });
});

describe('the auto-unlock evaluator', () => {
  it('a fresh context earns nothing; thresholds unlock their lanes', () => {
    expect(earnedAutoItems(freshCtx())).toHaveLength(0);
    const deep = { ...freshCtx(), campaignStage: 40, bestDepth: 50, dailyClears: 20, rushBossKills: 50, rouletteSpores: 50 };
    const earned = earnedAutoItems(deep);
    expect(earned.length).toBeGreaterThanOrEqual(15);
    for (const d of earned) expect(isAutoSource(d.source)).toBe(true);
    // Collection-gated items need ranks, not depth.
    expect(earned.some((d) => d.source.kind === 'collection')).toBe(false);
    const ranked = { ...deep, overallRank: 6, collectionRanks: { heroes: 3, towers: 3, bosses: 4, megaBosses: 2, cards: 4, chests: 4 } as WardrobeUnlockCtx['collectionRanks'] };
    expect(earnedAutoItems(ranked).some((d) => d.source.kind === 'collection')).toBe(true);
  });

  it('shop/battlepass/milestone/event lanes NEVER auto-unlock', () => {
    const maxed: WardrobeUnlockCtx = {
      campaignStage: 999, bestDepth: 999, dailyClears: 999, rushBossKills: 9999, rouletteSpores: 9999,
      achievements: new Set(wardrobeRegistry.all().flatMap((d) => (d.source.kind === 'achievement' ? [d.source.id] : []))),
      collectionRanks: { }, overallRank: 6,
    };
    for (const d of earnedAutoItems(maxed)) {
      expect(['shop', 'battlepass', 'milestone', 'event', 'starter']).not.toContain(d.source.kind);
    }
  });
});
