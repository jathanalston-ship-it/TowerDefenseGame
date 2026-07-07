// Premium Store SAFEGUARDS (docs/PREMIUM-STORE.md §philosophy) — the enforcement that purchases
// accelerate but never replace gameplay: buying moves Power by ZERO until invested, money never
// mints prestige, never crosses the Campaign Evolution Cap, never grants legendary+ gear directly,
// and every limit (lifetime / once-per-day / rotation) binds. Runs the REAL purchase pipeline.

import { describe, it, expect } from 'vitest';
import { eligibleTowerShardPool, meta } from './meta';
import { ICHOR_BUNDLES, PERMANENT_PACKS, ROTATING_PACKS, todaysRotatingOffer } from '../core/premium';
import { RARITY_ORDER, itemDef } from '../core/equipment';
import { dailyKey } from '../core/daily';

const NOW = new Date('2026-07-07T12:00:00Z');
const KEY = dailyKey(NOW);

describe('purchase pipeline — grants land through the normal systems', () => {
  it('the Starter Mutation Pack delivers every line, once, and re-purchase is refused', () => {
    meta.reset();
    const s0 = meta.get();
    const receipt = meta.purchaseOffer('pack_starter_mutation', NOW);
    expect(receipt).not.toBeNull();
    expect(receipt!.sandbox).toBe(true); // no real charge exists until a provider is wired
    const s1 = meta.get();
    expect(s1.ichor - s0.ichor).toBe(120);
    // Gate-eligible towers get 15 each; a DEEP-gated tower (Marrow Siphon, docs/SIPHON.md §gate) stays
    // sealed on a fresh save — money accelerates toward gates, it never crosses one.
    const eligible = new Set(eligibleTowerShardPool(s1));
    for (const k of Object.keys(s1.towerShards)) {
      const kk = k as keyof typeof s1.towerShards;
      expect(s1.towerShards[kk] - (s0.towerShards[kk] ?? 0)).toBe(eligible.has(kk) ? 15 : 0);
    }
    for (const k of Object.keys(s1.heroShards)) expect(s1.heroShards[k as keyof typeof s1.heroShards] - (s0.heroShards[k as keyof typeof s0.heroShards] ?? 0)).toBe(20);
    expect(s1.pendingContainers.length - s0.pendingContainers.length).toBe(1); // the run cache
    expect(s1.equipment.inventory.length - s0.equipment.inventory.length).toBe(2); // 2 rare rolls
    expect(s1.premium.purchases.pack_starter_mutation).toBe(1);
    expect(s1.premium.totalSpentUsd).toBeCloseTo(4.99, 2);
    expect(meta.purchaseOffer('pack_starter_mutation', NOW)).toBeNull(); // lifetime limit 1
  });

  it('SAFEGUARD: a purchase moves Power Score by ZERO until the player invests it', () => {
    meta.reset();
    const before = meta.power().score;
    meta.purchaseOffer('pack_starter_mutation', NOW);
    meta.purchaseOffer('ichor_medium', NOW);
    expect(meta.power().score).toBe(before); // nothing auto-equips; shards still cost stars
    // …but the honest potential estimate is positive (the store shows "up to +N when invested").
    meta.reset();
    expect(meta.offerPowerPotential('pack_starter_mutation')).toBeGreaterThan(0);
    expect(meta.offerPowerPotential('ichor_medium')).toBe(0); // pure currency — no fake promise
  });

  it('SAFEGUARD: purchased Cores never feed the prestige Molt mint', () => {
    meta.reset();
    const cycle0 = meta.get().prestige.cycleShards;
    meta.purchaseOffer('pack_growth_accelerator', NOW); // grants 400 Cores
    expect(meta.get().shards).toBeGreaterThanOrEqual(400);
    expect(meta.get().prestige.cycleShards).toBe(cycle0); // money mints no Ascendant Cells
  });

  it('SAFEGUARD: granted equipment never exceeds EPIC; campaign/evolution state is untouched', () => {
    meta.reset();
    meta.purchaseOffer('pack_growth_accelerator', NOW);
    meta.purchaseOffer('pack_starter_mutation', NOW);
    const s = meta.get();
    const epicIdx = RARITY_ORDER.indexOf('epic');
    for (const it of s.equipment.inventory) {
      expect(itemDef(it.defId)).toBeDefined();
      expect(RARITY_ORDER.indexOf(it.rarity)).toBeLessThanOrEqual(epicIdx); // legendary+ = drop-luck only
    }
    expect(Object.values(s.campaign.cleared)).toEqual([]); // no stage cleared by money
    // Legendary CONTAINERS are allowed (they roll normal odds in the Vault) — the pack banked some.
    expect(s.pendingContainers.some((c) => c.kind === 'loot' && c.rarity === 'legendary')).toBe(true);
  });

  it('SAFEGUARD: the shard→star potential preview honours the Campaign Evolution Cap', () => {
    meta.reset(); // fresh save: cap is the base tier — a mountain of shards cannot cross it
    const potential = meta.offerPowerPotential('rot_tower_research');
    // The estimate is finite + bounded because stars stop at the cap, not at the shard budget.
    expect(potential).toBeGreaterThanOrEqual(0);
    expect(potential).toBeLessThan(400); // sanity ceiling — no cap-crossing preview
  });
});

describe('availability rules bind in the pipeline', () => {
  it('rotating: only today’s pack sells, once per day; ichor bundles repeat freely', () => {
    meta.reset();
    const today = todaysRotatingOffer(KEY);
    const other = ROTATING_PACKS.find((p) => p.id !== today.id)!;
    expect(meta.purchaseOffer(other.id, NOW)).toBeNull(); // not today's rotation
    expect(meta.purchaseOffer(today.id, NOW)).not.toBeNull();
    expect(meta.purchaseOffer(today.id, NOW)).toBeNull(); // once per day
    expect(meta.purchaseOffer('ichor_starter', NOW)).not.toBeNull();
    expect(meta.purchaseOffer('ichor_starter', NOW)).not.toBeNull(); // bundles unlimited
  });

  it('openStore stamps today (the nav badge clears); an unknown offer refuses safely', () => {
    meta.reset();
    expect(meta.get().premium.seenKey).toBe('');
    meta.openStore(NOW);
    expect(meta.get().premium.seenKey).toBe(KEY);
    expect(meta.purchaseOffer('not_a_real_offer', NOW)).toBeNull();
  });

  it('every shipped offer purchases cleanly on an eligible fresh save (no dead SKUs)', () => {
    for (const o of [...ICHOR_BUNDLES, ...PERMANENT_PACKS]) {
      meta.reset();
      const r = meta.purchaseOffer(o.id, NOW);
      expect(r, o.id).not.toBeNull();
      expect(r!.lines.length).toBeGreaterThan(0);
      expect(r!.valueIchor).toBeGreaterThan(0);
    }
    meta.reset();
    expect(meta.purchaseOffer(todaysRotatingOffer(KEY).id, NOW)).not.toBeNull();
  });
});
