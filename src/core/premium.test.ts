// Premium Offer Registry invariants (docs/PREMIUM-STORE.md): the catalog is complete + valid, the
// bundle ladder rewards commitment monotonically, packs carry real value multiples WITHOUT being
// progression-skips, the daily rotation shows exactly one pack per UTC day, and availability
// honours limits/windows. Pure — the purchase pipeline is covered in state/premium tests.

import { describe, it, expect } from 'vitest';
import {
  CURRENCY_PATHS, GRANT_STAKE, ICHOR_BUNDLES, PERMANENT_PACKS, PREMIUM_OFFERS, RANDOM_SINKS, ROTATING_PACKS,
  activeEventOffers, currencyReachesChance, offerAvailable, offerHasRandomContent, offerReachesChance,
  offerValueIchor, offerValueMultiple, premiumRegistry, registerPremiumOffer, todaysRotatingOffer,
} from './premium';
import type { PremiumGrant, PremiumOfferDef, StakeCurrency } from './premium';
import { rollStock } from './market';
import { EXCHANGE_CURRENCIES, type ExchangeCurrency } from './ichorExchange';
import { BP, SEASONS, seasonTracks } from './battlePass';
import { reforgeCost } from './reforge';
import { reforgeCost as mulliganReforgeCost } from './mulliganReforge';

describe('catalog shape', () => {
  it('ships 6 ichor bundles, 2 permanent packs, 3 rotating packs — all registered + unique', () => {
    expect(ICHOR_BUNDLES.length).toBe(6);
    expect(PERMANENT_PACKS.length).toBe(2);
    expect(ROTATING_PACKS.length).toBe(3);
    const ids = PREMIUM_OFFERS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(premiumRegistry.get(id)).toBeDefined();
  });

  it('permanent packs are once-per-account; rotating packs are once-per-day', () => {
    for (const p of PERMANENT_PACKS) expect(p.limit).toBe(1);
    for (const p of ROTATING_PACKS) { expect(p.oncePerDay).toBe(true); expect(p.rotationIndex).toBeDefined(); }
  });
});

describe('ichor bundle ladder', () => {
  it('bonus % grows with commitment and the granted ichor matches base × (1 + bonus)', () => {
    let prevBonus = -1;
    let prevRate = 0;
    for (const b of ICHOR_BUNDLES) {
      expect(b.bonusPct).toBeGreaterThanOrEqual(prevBonus + (prevBonus < 0 ? 1 : 1)); // strictly rising
      prevBonus = b.bonusPct!;
      const granted = (b.grants[0] as { qty: number }).qty;
      expect(granted).toBe(Math.round(b.baseIchor! * (1 + b.bonusPct! / 100)));
      const rate = granted / b.priceUsd; // ichor per dollar strictly improves up the ladder
      expect(rate).toBeGreaterThanOrEqual(prevRate);
      prevRate = rate;
    }
    expect(ICHOR_BUNDLES[0].bonusPct).toBe(0); // the starter is the honest baseline
    expect(ICHOR_BUNDLES[5].bonusPct).toBe(60);
  });
});

describe('pack value — worthwhile, never a skip', () => {
  it('every pack beats par value (feels rewarding) but stays under 3× (no progression skip)', () => {
    for (const p of [...PERMANENT_PACKS, ...ROTATING_PACKS]) {
      const mult = offerValueMultiple(p);
      expect(mult, `${p.id} value ×${mult.toFixed(2)}`).toBeGreaterThanOrEqual(1.4); // clearly better than raw ichor
      expect(mult, `${p.id} value ×${mult.toFixed(2)}`).toBeLessThanOrEqual(3.0); // bounded — pacing survives
    }
  });

  it('SAFEGUARDS: no offer grants legendary/exotic equipment, exotic containers, or forbidden lanes', () => {
    for (const o of premiumRegistry.all()) {
      for (const g of o.grants) {
        if (g.grant === 'equipment') expect(['rare', 'epic']).toContain(g.rarity); // drop-luck stays sacred
        if (g.grant === 'container') expect(['common', 'rare', 'epic', 'legendary']).toContain(g.rarity); // exotic = market-only
        // The grant LANGUAGE itself has no campaign/prestige/evolution/hero-slot verbs — asserting
        // the union stays closed keeps future offers inside the safeguards by construction.
        // battlePassPremium unlocks a COSMETIC-first reward track (docs/BATTLEPASS.md §no-pay-to-win),
        // never direct power — its premium permanents are economy-only by type.
        expect(['ichor', 'cores', 'geneEssence', 'mats', 'towerShardsAll', 'heroShardsAll', 'container', 'runCache', 'equipment', 'rushStamina', 'battlePassPremium']).toContain(g.grant);
      }
    }
  });

  it('offerValueIchor prices a pure ichor bundle at exactly its granted ichor', () => {
    for (const b of ICHOR_BUNDLES) expect(offerValueIchor(b)).toBe((b.grants[0] as { qty: number }).qty);
  });
});

describe('daily rotation — one pack per UTC day', () => {
  it('is deterministic per key and cycles through ALL three packs across days', () => {
    expect(todaysRotatingOffer('2026-07-07').id).toBe(todaysRotatingOffer('2026-07-07').id);
    const seen = new Set<string>();
    for (let d = 1; d <= 21; d++) seen.add(todaysRotatingOffer(`2026-07-${String(d).padStart(2, '0')}`).id);
    expect(seen.size).toBe(3); // every pack appears within the window
  });

  it('offerAvailable: only today’s rotation is buyable, once per day; limits bind', () => {
    const key = '2026-07-07';
    const today = todaysRotatingOffer(key);
    const others = ROTATING_PACKS.filter((p) => p.id !== today.id);
    expect(offerAvailable(today, key, {})).toBe(true);
    for (const o of others) expect(offerAvailable(o, key, {})).toBe(false);
    expect(offerAvailable(today, key, {}, key)).toBe(false); // already bought today
    const perm = PERMANENT_PACKS[0];
    expect(offerAvailable(perm, key, {})).toBe(true);
    expect(offerAvailable(perm, key, { [perm.id]: 1 })).toBe(false); // lifetime limit
    expect(offerAvailable(ICHOR_BUNDLES[0], key, { [ICHOR_BUNDLES[0].id]: 99 })).toBe(true); // bundles unlimited
  });
});

describe('expandability — event offers are one data row', () => {
  it('a registered holiday offer activates ONLY inside its window (no engine change)', () => {
    const holiday: PremiumOfferDef = {
      id: 'evt_test_solstice', kind: 'event', name: 'Solstice Cache', tagline: 'test',
      priceUsd: 4.99, accent: 'gold', art: '❄', window: { from: '2026-12-20', to: '2026-12-27' },
      grants: [{ grant: 'ichor', qty: 200 }],
    };
    registerPremiumOffer(holiday);
    expect(activeEventOffers('2026-12-19').some((o) => o.id === holiday.id)).toBe(false);
    expect(activeEventOffers('2026-12-20').some((o) => o.id === holiday.id)).toBe(true);
    expect(activeEventOffers('2026-12-27').some((o) => o.id === holiday.id)).toBe(true);
    expect(activeEventOffers('2026-12-28').some((o) => o.id === holiday.id)).toBe(false);
    expect(offerAvailable(holiday, '2026-12-21', {})).toBe(true);
    expect(offerAvailable(holiday, '2026-11-01', {})).toBe(false);
  });
});

// ── Chance exposure — the restricted-region rule (docs/PREMIUM-STORE.md §paid-loot-boxes) ──
// Real money must never reach a random outcome in a restricted region, directly or through a
// currency it buys. The two tables in premium.ts carry that reasoning; these tests pin them to the
// LIVE code so a new random sink or currency path cannot slip past the rule.
describe('chance exposure — derived, and pinned to the live economy', () => {
  const goodStake = (good: string): StakeCurrency | 'random' => {
    switch (good) {
      case 'towerShards': return 'towerShards';
      case 'heroShards': return 'heroShards';
      case 'scrap': return 'mats';
      case 'geneEssence': return 'geneEssence';
      case 'stamina': return 'rushStamina';
      case 'container': case 'equipment': return 'random';
      default: throw new Error(`unclassified market good '${good}' — add it to goodStake + the premium.ts tables`);
    }
  };
  const payStake = (pay: string): StakeCurrency => (pay === 'cores' ? 'cores' : 'ichor');
  const hasPath = (from: StakeCurrency, to: StakeCurrency): boolean => CURRENCY_PATHS.some((p) => p.from === from && p.to === to);
  const hasSink = (pays: StakeCurrency): boolean => RANDOM_SINKS.some((r) => r.pays === pays);

  it('every grant kind is classified (exhaustive) and the reach verdicts match the economy', () => {
    const kinds: PremiumGrant['grant'][] = ['ichor', 'cores', 'geneEssence', 'mats', 'towerShardsAll', 'heroShardsAll', 'container', 'runCache', 'equipment', 'rushStamina', 'battlePassPremium'];
    expect(Object.keys(GRANT_STAKE).sort()).toEqual([...kinds].sort());
    for (const c of ['ichor', 'cores', 'geneEssence', 'mats', 'seasonPass'] as StakeCurrency[]) expect(currencyReachesChance(c), c).toBe(true);
    for (const c of ['towerShards', 'heroShards', 'rushStamina'] as StakeCurrency[]) expect(currencyReachesChance(c), c).toBe(false);
  });

  it('a pack of only deterministic progress stays sellable; Ichor and anything random do not', () => {
    const shardsOnly: PremiumOfferDef = { ...ICHOR_BUNDLES[0], id: 'fixture_shards', kind: 'permanent', grants: [{ grant: 'towerShardsAll', qtyEach: 10 }, { grant: 'heroShardsAll', qtyEach: 5 }] };
    expect(offerReachesChance(shardsOnly)).toBe(false);
    for (const o of ICHOR_BUNDLES) expect(offerReachesChance(o), o.id).toBe(true);
    for (const o of PREMIUM_OFFERS) if (offerHasRandomContent(o)) expect(offerReachesChance(o), o.id).toBe(true);
  });

  it('Splice Market: every random slot is paid in a currency with a sink row; every goods slot has a path row', () => {
    const roster = { towers: ['spitter', 'mortar'] as never[], heroes: ['ravager'] };
    for (let w = 0; w < 400; w++) {
      for (const slot of rollStock(12345, w, roster)) {
        const pay = payStake(slot.pay);
        const got = goodStake(slot.item.good);
        if (got === 'random') expect(RANDOM_SINKS.some((r) => r.pays === pay && r.id.startsWith('market.')), `${slot.item.good} for ${pay}`).toBe(true);
        else expect(hasPath(pay, got), `${pay} → ${got}`).toBe(true);
      }
    }
  });

  it('Ichor Exchange: every currency it yields has a path from Ichor', () => {
    const map: Record<ExchangeCurrency, StakeCurrency> = { genomeCores: 'cores', geneEssence: 'geneEssence', scrap: 'mats' };
    for (const c of EXCHANGE_CURRENCIES) expect(hasPath('ichor', map[c]), c).toBe(true);
  });

  it('Season Pass: random track rewards have a sink row, currency rewards a path row', () => {
    for (const season of SEASONS) {
      const premium = seasonTracks(season.id).premium.flat();
      if (premium.some((r) => r.kind === 'container' || r.kind === 'runCache')) expect(hasSink('seasonPass')).toBe(true);
      if (premium.some((r) => r.kind === 'ichor')) expect(hasPath('seasonPass', 'ichor')).toBe(true);
    }
    expect(BP.premiumIchor).toBeGreaterThan(0); // the Ichor door exists, so Ichor → seasonPass must too
    expect(hasPath('ichor', 'seasonPass')).toBe(true);
  });

  it('the meta random sinks named in the table are real (pay what the table says)', () => {
    expect(RANDOM_SINKS.map((r) => r.id).sort()).toEqual(['cosmetic.cultivate', 'equipment.reforge', 'market.container', 'market.equipment', 'mulligan.reforge', 'pass.track']);
    expect(Object.keys(reforgeCost('reroll', { uid: 'x', defId: 'x', rarity: 'common', ilvl: 1, affixes: [] } as never)).sort()).toEqual(['catalyst', 'mutagen', 'scrap']);
    expect(mulliganReforgeCost(0)).toBeGreaterThan(0); // the wheel has an Ichor price
  });
});
