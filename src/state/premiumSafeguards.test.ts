// Premium Store SAFEGUARDS (docs/PREMIUM-STORE.md §philosophy) — the enforcement that purchases
// accelerate but never replace gameplay: buying moves Power by ZERO until invested, money never
// mints prestige, never crosses the Campaign Evolution Cap, never grants legendary+ gear directly,
// and every limit (lifetime / once-per-day / rotation) binds. Runs the REAL purchase pipeline.

import { describe, it, expect } from 'vitest';
import { towerShardPool, meta } from './meta';
import { FLASH_OFFERS, ICHOR_BUNDLES, PERMANENT_PACKS, ROTATING_PACKS, todaysRotatingOffer } from '../core/premium';
import { RARITY_ORDER, itemDef } from '../core/equipment';
import { dailyKey } from '../core/daily';
import { defaultSave, serializeExport } from '../save/saveStore';

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
    const eligible = new Set(towerShardPool(s1));
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

describe('season pair + flash SKUs in the pipeline (docs/PREMIUM-STORE.md §flash, §season)', () => {
  it('the first-ever season purchase is the $4.99 sale; full price only opens after; owned premium blocks both doors', () => {
    meta.reset();
    expect(meta.purchaseOffer('bp_premium', NOW)).toBeNull(); // the sale IS the first-timer's door
    const r = meta.purchaseOffer('bp_premium_first', NOW);
    expect(r).not.toBeNull();
    expect(meta.get().premium.totalSpentUsd).toBeCloseTo(4.99, 2); // charged the SALE price
    expect(meta.get().battlePass.premium).toBe(true);
    // Premium already owned this window: neither door re-sells the same flag.
    expect(meta.purchaseOffer('bp_premium', NOW)).toBeNull();
    expect(meta.purchaseOffer('bp_premium_first', NOW)).toBeNull(); // also lifetime limit 1
  });

  it('a flash SKU refuses while locked/unseen, sells once inside its live window, then never again', () => {
    meta.reset();
    const offer = FLASH_OFFERS[0]; // first_hunt — trigger: first Mega Boss
    const nowMs = NOW.getTime();
    expect(meta.purchaseOffer(offer.id, NOW)).toBeNull(); // locked: trigger unmet
    // Seed the milestone through the normal import pipeline (sanitizer-legal).
    const seeded = { ...defaultSave(), megaProgress: { ...defaultSave().megaProgress, slain: ['alpha'] } };
    expect(meta.importText(serializeExport(seeded)).ok).toBe(true);
    expect(meta.purchaseOffer(offer.id, NOW)).toBeNull(); // ready but UNSEEN — countdown hasn't started
    meta.markFlashShown(offer.id, nowMs); // the popup fired
    expect(meta.get().premium.flash[offer.id]?.shownAt).toBe(nowMs);
    expect(meta.get().premium.lastFlashShownAt).toBe(nowMs);
    const r = meta.purchaseOffer(offer.id, NOW);
    expect(r).not.toBeNull();
    expect(r!.lines.length).toBeGreaterThan(0);
    expect(meta.get().premium.purchases[offer.id]).toBe(1);
    expect(meta.purchaseOffer(offer.id, NOW)).toBeNull(); // one-time, forever
  });

  it('an expired window refuses the sale (the countdown is real)', () => {
    meta.reset();
    const offer = FLASH_OFFERS[0];
    const seeded = { ...defaultSave(), megaProgress: { ...defaultSave().megaProgress, slain: ['alpha'] } };
    expect(meta.importText(serializeExport(seeded)).ok).toBe(true);
    const shownAt = NOW.getTime() - (offer.flash!.hours * 3_600_000 + 60_000); // burned an hour ago
    meta.markFlashShown(offer.id, shownAt);
    expect(meta.purchaseOffer(offer.id, NOW)).toBeNull();
  });

  it('dismissing a popup never re-pops it; the store sighting is idempotent', () => {
    meta.reset();
    const seeded = { ...defaultSave(), megaProgress: { ...defaultSave().megaProgress, slain: ['alpha'] } };
    expect(meta.importText(serializeExport(seeded)).ok).toBe(true);
    meta.markFlashShown('flash_first_hunt', NOW.getTime());
    meta.dismissFlashPopup('flash_first_hunt');
    expect(meta.get().premium.flash.flash_first_hunt?.dismissed).toBe(true);
    const anchor = meta.get().premium.flash.flash_first_hunt?.shownAt;
    meta.markFlashSeen(NOW.getTime() + 1000); // a later store visit must NOT re-anchor the window
    expect(meta.get().premium.flash.flash_first_hunt?.shownAt).toBe(anchor);
  });
});
