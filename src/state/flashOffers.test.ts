// FLASH OFFERS (docs/PREMIUM-STORE.md §flash) — catalog contracts (cheap, one-time, HONEST sale
// anchors, pack-grade value), the season first-purchase pair, trigger evaluation, the first-sight
// status machine, and the popup cadence rules (eligibility floor, one-at-a-time, cooldown drain).

import { describe, it, expect } from 'vitest';
import {
  FLASH, flashExpiresAt, flashPopupCandidate, flashSalePct, flashStatus, flashTriggerLabel,
  flashTriggerMet,
} from './flashOffers';
import {
  FLASH_OFFERS, PREMIUM, SEASON_PASS_FIRST_OFFER, SEASON_PASS_OFFER, offerAvailable,
  offerValueIchor, offerValueMultiple, premiumRegistry, seasonOfferFor,
} from '../core/premium';
import { xpToReach } from '../core/battlePass';
import { defaultSave } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';

const HOUR = 3_600_000;

/** A save past the popup eligibility floor, with optional milestone mutations. */
function eligible(mut: (s: SaveData) => void = () => {}): SaveData {
  const s = defaultSave();
  s.totalRuns = FLASH.minRuns;
  s.campaign.cleared = { normal: FLASH.minStage };
  mut(s);
  return s;
}

describe('flash catalog contracts', () => {
  it('registry validates; every flash SKU is cheap, one-time, and carries a real sale anchor', () => {
    expect(premiumRegistry.validate()).toEqual([]);
    expect(FLASH_OFFERS.length).toBeGreaterThanOrEqual(4);
    for (const o of FLASH_OFFERS) {
      expect(o.limit, o.id).toBe(1);
      expect(o.priceUsd, o.id).toBeLessThanOrEqual(5);
      expect(o.flash, o.id).toBeDefined();
      expect(o.listUsd ?? 0, o.id).toBeGreaterThan(o.priceUsd);
    }
  });

  it('HONESTY: the struck list price never exceeds the goods’ real à-la-carte worth', () => {
    for (const o of [...FLASH_OFFERS, SEASON_PASS_FIRST_OFFER]) {
      if (o.listUsd === undefined) continue;
      expect(o.listUsd, o.id).toBeLessThanOrEqual(offerValueIchor(o) / PREMIUM.ichorPerUsd + 1e-9);
    }
  });

  it('value stays in the pack window (≥×1.4 worthwhile, ≤×3.0 no skip); the discount is real', () => {
    for (const o of FLASH_OFFERS) {
      const mult = offerValueMultiple(o);
      expect(mult, `${o.id} ×${mult.toFixed(2)}`).toBeGreaterThanOrEqual(1.4);
      expect(mult, `${o.id} ×${mult.toFixed(2)}`).toBeLessThanOrEqual(3.0);
      expect(flashSalePct(o), o.id).toBeGreaterThanOrEqual(40); // a flash sale is a real discount
      expect(flashTriggerLabel(o.flash!.trigger).length).toBeGreaterThan(0);
    }
  });
});

describe('season pair — the first purchase is always the sale', () => {
  it('a fresh ledger sees $4.99; ANY prior season purchase flips to the standard $9.99 SKU', () => {
    expect(seasonOfferFor({}).id).toBe('bp_premium_first');
    expect(seasonOfferFor({ bp_premium_first: 1 }).id).toBe('bp_premium');
    expect(seasonOfferFor({ bp_premium: 1 }).id).toBe('bp_premium'); // full-price veterans aren't first-timers
    expect(SEASON_PASS_FIRST_OFFER.priceUsd).toBeCloseTo(4.99, 2);
    expect(SEASON_PASS_OFFER.priceUsd).toBeCloseTo(9.99, 2);
  });

  it('offerAvailable shows exactly ONE season door per ledger state', () => {
    expect(offerAvailable(SEASON_PASS_FIRST_OFFER, '2026-07-07', {})).toBe(true);
    expect(offerAvailable(SEASON_PASS_OFFER, '2026-07-07', {})).toBe(false); // the sale IS the door
    expect(offerAvailable(SEASON_PASS_FIRST_OFFER, '2026-07-07', { bp_premium_first: 1 })).toBe(false);
    expect(offerAvailable(SEASON_PASS_OFFER, '2026-07-07', { bp_premium_first: 1 })).toBe(true);
  });
});

describe('triggers + the first-sight status machine', () => {
  it('each trigger kind evaluates against its save source', () => {
    const s = defaultSave();
    expect(flashTriggerMet(s, { kind: 'megas', count: 1 })).toBe(false);
    s.megaProgress.slain = ['alpha'];
    expect(flashTriggerMet(s, { kind: 'megas', count: 1 })).toBe(true);
    expect(flashTriggerMet(s, { kind: 'stage', stage: 12 })).toBe(false);
    s.campaign.cleared = { normal: 12 };
    expect(flashTriggerMet(s, { kind: 'stage', stage: 12 })).toBe(true);
    expect(flashTriggerMet(s, { kind: 'passLevel', level: 5 })).toBe(false);
    s.battlePass.xp = xpToReach(5);
    expect(flashTriggerMet(s, { kind: 'passLevel', level: 5 })).toBe(true);
    expect(flashTriggerMet(s, { kind: 'molts', count: 1 })).toBe(false);
    s.prestige.molts = 1;
    expect(flashTriggerMet(s, { kind: 'molts', count: 1 })).toBe(true);
  });

  it('locked → ready → live → expired; a purchase reads owned from any point', () => {
    const offer = FLASH_OFFERS[0]; // first_hunt: megas ≥ 1
    const now = 1_000_000;
    const s = eligible();
    expect(flashStatus(offer, s, now)).toBe('locked');
    s.megaProgress.slain = ['alpha'];
    expect(flashStatus(offer, s, now)).toBe('ready');
    s.premium.flash[offer.id] = { shownAt: now };
    expect(flashStatus(offer, s, now)).toBe('live');
    expect(flashExpiresAt(offer, s.premium.flash[offer.id])).toBe(now + offer.flash!.hours * HOUR);
    expect(flashStatus(offer, s, now + offer.flash!.hours * HOUR + 1)).toBe('expired');
    s.premium.purchases[offer.id] = 1;
    expect(flashStatus(offer, s, now)).toBe('owned');
  });
});

describe('popup cadence — quiet by default, one at a time', () => {
  it('holds below the eligibility floor even with a trigger met', () => {
    const s = defaultSave();
    s.megaProgress.slain = ['alpha']; // trigger met…
    expect(flashPopupCandidate(s, 1_000_000)).toBeNull(); // …but the game hasn't proven itself yet
  });

  it('pops the first ready offer; a live window suppresses others; the cooldown drains a backlog one at a time', () => {
    const now = Date.UTC(2026, 6, 7, 10); // a real clock — a fresh ledger (lastFlashShownAt 0) is long past cooldown
    const s = eligible((x) => {
      x.megaProgress.slain = ['alpha'];
      x.campaign.cleared = { normal: 12 }; // arms first_hunt AND deep_roots
    });
    expect(flashPopupCandidate(s, now)?.id).toBe('flash_first_hunt'); // one candidate, catalog order
    s.premium.flash.flash_first_hunt = { shownAt: now };
    s.premium.lastFlashShownAt = now;
    expect(flashPopupCandidate(s, now + 1)).toBeNull(); // live window + cooldown both hold
    expect(flashPopupCandidate(s, now + FLASH.popupCooldownMs - 1)).toBeNull(); // cooldown binds
    const later = now + Math.max(FLASH.popupCooldownMs, 48 * HOUR) + HOUR; // first window burned + cooldown passed
    expect(flashPopupCandidate(s, later)?.id).toBe('flash_deep_roots'); // the backlog drains
  });
});
