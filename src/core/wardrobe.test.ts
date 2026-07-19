// Wardrobe framework (docs/COSMETICS.md §wardrobe): catalog integrity, payload contracts,
// source resolution (every referenced achievement/collection/milestone target is REAL),
// the auto-unlock evaluator, and the milestone table's item references.

import { describe, expect, it } from 'vitest';
import {
  boutiqueItems, cosmeticAvailability, cosmeticBadges, cosmeticBonus, cosmeticCensus,
  cosmeticEra, cosmeticFamily, cosmeticLore, cosmeticMarket, earnedAutoItems,
  effectiveWardrobeBonuses, isAutoSource, newCosmeticUid, seasonItems,
  setCosmeticCensusProvider, sourceLabel, starterItems,
  WARDROBE_BONUS_BY_RARITY, WARDROBE_BONUS_LANES, WARDROBE_KINDS, WARDROBE_LANE_CAP,
  WARDROBE_MILESTONES, wardrobeItem, wardrobeItemsOf, wardrobeProblems, wardrobeRegistry,
} from './wardrobe';
import type { WardrobeItemDef, WardrobeUnlockCtx } from './wardrobe';
import { achievementById } from '../state/achievements';
import { SEASONS } from './battlePass';

const freshCtx = (): WardrobeUnlockCtx => ({
  campaignStage: 0, bestDepth: 0, dailyClears: 0, lifetimeLogins: 0, rushBossKills: 0, rouletteSpores: 0,
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
    for (const lane of ['starter', 'campaign', 'infinite', 'daily', 'rush', 'roulette', 'achievement', 'collection', 'shop', 'battlepass', 'milestone', 'event', 'quest'] as const) {
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

  it('shop/battlepass/milestone/event/quest lanes NEVER auto-unlock', () => {
    const maxed: WardrobeUnlockCtx = {
      campaignStage: 999, bestDepth: 999, dailyClears: 999, lifetimeLogins: 9999, rushBossKills: 9999, rouletteSpores: 9999,
      achievements: new Set(wardrobeRegistry.all().flatMap((d) => (d.source.kind === 'achievement' ? [d.source.id] : []))),
      collectionRanks: { }, overallRank: 6,
    };
    for (const d of earnedAutoItems(maxed)) {
      expect(['shop', 'battlepass', 'milestone', 'event', 'quest', 'starter', 'login-drop']).not.toContain(d.source.kind);
    }
  });
});

describe('two-state ownership & claim bonuses (v53 — docs/COSMETICS.md §claiming/§bonuses)', () => {
  it('the catalog laws hold (wardrobeProblems clean)', () => {
    expect(wardrobeProblems()).toEqual([]);
  });

  it('starters carry NO bonus (POWER_BASE + golden law); every other item pays its rarity', () => {
    for (const d of wardrobeRegistry.all()) {
      const b = cosmeticBonus(d);
      if (d.source.kind === 'starter') expect(b, d.id).toBeNull();
      else {
        expect(b, d.id).not.toBeNull();
        expect(b!.value).toBeGreaterThan(0);
        expect(b!.value).toBeLessThanOrEqual(WARDROBE_BONUS_BY_RARITY.legendary);
      }
    }
  });

  it('a starters-only claimed set folds to ZERO in every lane (fresh account neutral)', () => {
    const eff = effectiveWardrobeBonuses(starterItems().map((d) => d.id));
    for (const lane of WARDROBE_BONUS_LANES) expect(eff[lane]).toBe(0);
  });

  it('lanes saturate: monotonic, early claims near-full value, full catalog under the cap', () => {
    const all = wardrobeRegistry.all().map((d) => d.id);
    const eff = effectiveWardrobeBonuses(all);
    for (const lane of WARDROBE_BONUS_LANES) {
      expect(eff[lane]).toBeGreaterThan(0); // every lane is populated by the kind mapping
      expect(eff[lane]).toBeLessThan(WARDROBE_LANE_CAP); // asymptote never reached
    }
    // The FIRST claim in a lane pays nearly its nominal value (saturation bites late).
    const epic = wardrobeRegistry.all().find((d) => d.source.kind !== 'starter' && d.rarity === 'epic')!;
    const single = effectiveWardrobeBonuses([epic.id]);
    const nominal = WARDROBE_BONUS_BY_RARITY.epic;
    expect(single[cosmeticBonus(epic)!.lane]).toBeGreaterThan(nominal * 0.9);
    // Monotonic: claiming one more item strictly raises its lane.
    const without = effectiveWardrobeBonuses(all.filter((id) => id !== epic.id));
    expect(eff[cosmeticBonus(epic)!.lane]).toBeGreaterThan(without[cosmeticBonus(epic)!.lane]);
  });

  it('every item resolves a collection family; event exclusives shelve together', () => {
    for (const d of wardrobeRegistry.all()) expect(cosmeticFamily(d).length).toBeGreaterThan(0);
    for (const d of wardrobeRegistry.all().filter((x) => x.source.kind === 'event')) {
      expect(cosmeticFamily(d)).toBe('Event Exclusives');
    }
  });

  it('instance uids are ci_-prefixed and unique across a burst', () => {
    const uids = Array.from({ length: 200 }, () => newCosmeticUid());
    expect(new Set(uids).size).toBe(200);
    for (const u of uids) expect(u.startsWith('ci_')).toBe(true);
  });
});

describe('provenance & collector prestige (docs/COSMETICS.md §provenance)', () => {
  it('every item resolves an era, an availability, and at least one badge', () => {
    for (const d of wardrobeRegistry.all()) {
      const era = cosmeticEra(d);
      expect(era.id.length).toBeGreaterThan(0);
      expect(era.year).toBeGreaterThanOrEqual(2026);
      expect(['available', 'limited', 'retired', 'reissued']).toContain(cosmeticAvailability(d));
      // Genesis catalog ⇒ everything carries First Edition at minimum.
      expect(cosmeticBadges(d).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('badges derive truthfully from the source lanes', () => {
    const byId = (d: WardrobeItemDef) => cosmeticBadges(d).map((b) => b.id);
    for (const d of wardrobeRegistry.all()) {
      const ids = byId(d);
      expect(ids.includes('founder')).toBe(d.source.kind === 'starter');
      expect(ids.includes('eventExclusive')).toBe(d.source.kind === 'event');
      expect(ids.includes('seasonVault')).toBe(d.source.kind === 'battlepass');
      expect(ids.includes('contractSeal')).toBe(d.source.kind === 'quest');
      expect(ids.includes('firstEdition')).toBe(true); // one era so far — all first printings
      // No derivation mints the membership badges — they join only via overrides (empty now).
      for (const m of ['anniversary', 'communityChallenge', 'tournamentExclusive', 'developerReward']) {
        expect(ids, `${d.id} minted membership badge ${m}`).not.toContain(m);
      }
    }
  });

  it('legacy emerges with time, never at birth', () => {
    const d = wardrobeRegistry.all()[0];
    const birthYear = Date.UTC(cosmeticEra(d).year, 6, 1);
    expect(cosmeticBadges(d, birthYear).map((b) => b.id)).not.toContain('legacy');
    const threeYearsOn = Date.UTC(cosmeticEra(d).year + 3, 6, 1);
    expect(cosmeticBadges(d, threeYearsOn).map((b) => b.id)).toContain('legacy');
  });

  it('time-boxed sources read limited; the curated archives stay concise', () => {
    for (const d of wardrobeRegistry.all()) {
      if (['event', 'battlepass', 'login-drop', 'quest'].includes(d.source.kind)) {
        expect(cosmeticAvailability(d)).toBe('limited');
      }
      const lore = cosmeticLore(d);
      if (lore) expect(lore.length).toBeLessThanOrEqual(400);
    }
    // Every event-shop signature carries an archive entry (the museum's headliners).
    for (const d of wardrobeRegistry.all().filter((x) => x.source.kind === 'event')) {
      expect(cosmeticLore(d), `${d.id} needs a Hive Archives entry`).not.toBeNull();
    }
  });

  it('census/market providers are honest seams — null before the Auction House, live after', () => {
    expect(cosmeticCensus('wd_anything')).toBeNull();
    expect(cosmeticMarket('wd_anything')).toBeNull();
    setCosmeticCensusProvider((id) => (id === 'wd_x' ? { introduced: 10, claimed: 4, tradable: 5, bound: 4, asOf: 1 } : null));
    expect(cosmeticCensus('wd_x')?.claimed).toBe(4);
    setCosmeticCensusProvider(() => null); // restore the pre-launch default for other tests
  });
});
