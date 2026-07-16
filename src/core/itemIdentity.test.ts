// Item identity + trading prep (docs/TRADING-PREP.md) — the Auction House backend contracts:
//   • stamps are idempotent (origin is immutable) and keys round-trip;
//   • the reconcile self-heal: owned-but-unstamped gains `legacy`, dead equipment prunes,
//     account-level stamps persist, force-bound refs re-bind on every pass;
//   • ownership history is capped; transfers count;
//   • trade eligibility: every block axis fires (bound/guest/campaign/age/cap/equipped) and a
//     clean context trades; listing math (fee/tax/bid steps/bounds) is exact;
//   • fraud heuristics: rapid mule chains, price outliers, self-dealing pairs and circular
//     item paths all flag — and an honest history stays silent.

import { describe, expect, it } from 'vitest';
import {
  ITEM_IDENTITY, bindItem, globalItemId, itemProvenance, parseRefKey, recordTransfer,
  reconcileProvenance, refKey, sanitizeProvenanceLedger, stampAcquisition,
} from './itemIdentity';
import type { ProvenanceLedger, TradableRef } from './itemIdentity';
import {
  FRAUD, TRADE, auditTradeEvents, listingFee, minNextBid, priceInBounds, saleTax,
  sellerProceeds, tradeBlockLabel, tradeEligibility,
} from './trading';
import type { TradeContext, TradeEvent } from './trading';

const eq = (id: string): TradableRef => ({ cat: 'equipment', id });
const cos = (id: string): TradableRef => ({ cat: 'cosmetic', id });
const gene = (id: string): TradableRef => ({ cat: 'geneCard', id });

const ctx = (over: Partial<TradeContext> = {}): TradeContext => ({
  campaignStage: 20, accountAgeDays: 30, listedToday: 0, guest: false, ...over,
});

describe('identity keys + stamps', () => {
  it('refKey round-trips through parseRefKey for every category', () => {
    for (const ref of [eq('it_abc'), cos('skin_x'), gene('card_y')]) {
      expect(parseRefKey(refKey(ref))).toEqual(ref);
    }
    expect(parseRefKey('junk')).toBeNull();
    expect(parseRefKey('weird:')).toBeNull();
  });

  it('stamping is idempotent — origin is immutable', () => {
    const ledger: ProvenanceLedger = {};
    const first = stampAcquisition(ledger, eq('u1'), 'Genetic Vault', 1000, 2);
    const again = stampAcquisition(ledger, eq('u1'), 'Splice Market', 9999, 5);
    expect(again).toBe(first);
    expect(itemProvenance(ledger, eq('u1'))).toMatchObject({ source: 'Genetic Vault', at: 1000, season: 2, transfers: 0 });
  });

  it('bindItem is one-way (soul-binding has no unbind)', () => {
    const ledger: ProvenanceLedger = {};
    stampAcquisition(ledger, gene('g1'), 'arena-pass', 1, 1);
    bindItem(ledger, gene('g1'));
    expect(itemProvenance(ledger, gene('g1'))!.bound).toBe(true);
    bindItem(ledger, gene('missing')); // unknown ref: a silent no-op, never a throw
  });

  it('transfers count and history caps at ITEM_IDENTITY.historyCap', () => {
    const ledger: ProvenanceLedger = {};
    stampAcquisition(ledger, cos('skin'), 'arena-pass', 5, 1);
    for (let i = 0; i < ITEM_IDENTITY.historyCap + 4; i++) recordTransfer(ledger, cos('skin'), `p${i}`);
    const stamp = itemProvenance(ledger, cos('skin'))!;
    expect(stamp.transfers).toBe(ITEM_IDENTITY.historyCap + 4);
    expect(stamp.history).toHaveLength(ITEM_IDENTITY.historyCap);
    expect(stamp.history[stamp.history.length - 1]).toBe(`p${ITEM_IDENTITY.historyCap + 3}`);
  });

  it('globalItemId namespaces by owner (the server-assigned uniqueness seam)', () => {
    expect(globalItemId('alice', eq('u1'))).not.toBe(globalItemId('bob', eq('u1')));
  });
});

describe('the reconcile self-heal', () => {
  it('backfills legacy stamps, prunes dead equipment, keeps account-level stamps, re-binds forced refs', () => {
    const ledger: ProvenanceLedger = {};
    stampAcquisition(ledger, eq('dead'), 'Genetic Vault', 10, 1);
    stampAcquisition(ledger, cos('kept'), 'arena-pass', 10, 1);
    const bound = refKey(cos('exclusive'));
    reconcileProvenance(ledger, {
      equipmentUids: ['live1', 'live2'],
      cosmeticIds: ['kept', 'exclusive'],
      geneCardIds: ['g1'],
      forceBoundKeys: new Set([bound]),
    });
    expect(itemProvenance(ledger, eq('live1'))).toMatchObject({ source: 'legacy', at: 0 });
    expect(itemProvenance(ledger, eq('dead'))).toBeNull(); // pruned with the instance
    expect(itemProvenance(ledger, cos('kept'))!.source).toBe('arena-pass'); // untouched
    expect(itemProvenance(ledger, gene('g1'))).not.toBeNull();
    expect(itemProvenance(ledger, cos('exclusive'))!.bound).toBe(true); // re-bound every pass
  });

  it('sanitizeProvenanceLedger drops junk and caps fields', () => {
    const out = sanitizeProvenanceLedger({
      'eq:ok': { source: 'x'.repeat(99), at: -5, season: 2.9, bound: 1, transfers: 'no', history: ['a', 3, 'b'] },
      'nonsense': { source: 'y' },
      'eq:null': null,
    });
    expect(Object.keys(out)).toEqual(['eq:ok']);
    expect(out['eq:ok']).toMatchObject({ at: 0, season: 2, bound: false, transfers: 0, history: ['a', 'b'] });
    expect(out['eq:ok'].source).toHaveLength(40);
  });
});

describe('trade eligibility', () => {
  it('a clean context trades; every block axis fires', () => {
    const stamp = stampAcquisition({}, eq('u'), 'Genetic Vault', 1, 1);
    expect(tradeEligibility(eq('u'), stamp, ctx()).ok).toBe(true);
    expect(tradeEligibility(eq('u'), { ...stamp, bound: true }, ctx()).blocks).toContain('bound');
    expect(tradeEligibility(eq('u'), stamp, ctx({ guest: true })).blocks).toContain('guest');
    expect(tradeEligibility(eq('u'), stamp, ctx({ campaignStage: TRADE.minCampaignStage - 1 })).blocks).toContain('campaign');
    expect(tradeEligibility(eq('u'), stamp, ctx({ accountAgeDays: 0 })).blocks).toContain('accountAge');
    expect(tradeEligibility(eq('u'), stamp, ctx({ listedToday: TRADE.maxListingsPerDay })).blocks).toContain('listingCap');
    expect(tradeEligibility(eq('u'), stamp, ctx({ equipped: true })).blocks).toContain('equipped');
    expect(tradeEligibility({ cat: 'towerShard' as never, id: 'x' }, stamp, ctx()).blocks).toContain('category');
  });

  it('every block has human copy', () => {
    for (const b of ['bound', 'guest', 'campaign', 'accountAge', 'listingCap', 'equipped', 'category'] as const) {
      expect(tradeBlockLabel(b).length).toBeGreaterThan(8);
    }
  });

  it('listing math is exact and bounded', () => {
    expect(listingFee(100)).toBe(5);
    expect(listingFee(1)).toBe(TRADE.listingFeeMin);
    expect(saleTax(100)).toBe(10);
    expect(sellerProceeds(100)).toBe(90);
    expect(minNextBid(100)).toBe(105);
    expect(minNextBid(1)).toBe(2); // min +1 step
    expect(priceInBounds(TRADE.minPrice)).toBe(true);
    expect(priceInBounds(TRADE.minPrice - 1)).toBe(false);
    expect(priceInBounds(TRADE.maxPrice + 1)).toBe(false);
    expect(priceInBounds(10.5)).toBe(false);
  });
});

describe('fraud heuristics', () => {
  const ev = (over: Partial<TradeEvent>): TradeEvent => ({
    at: 0, itemKey: 'eq:u', fromId: 'a', toId: 'b', price: 100, medianPrice: 100, ...over,
  });

  it('an honest history stays silent', () => {
    const events = [
      ev({ at: 0, fromId: 'a', toId: 'b' }),
      ev({ at: 86_400_000 * 2, itemKey: 'eq:v', fromId: 'c', toId: 'd', price: 120 }),
    ];
    expect(auditTradeEvents(events)).toEqual([]);
  });

  it('flags rapid mule chains of the same item', () => {
    const events = Array.from({ length: FRAUD.rapidHops }, (_, i) =>
      ev({ at: i * 60_000, fromId: `p${i}`, toId: `p${i + 1}` }));
    expect(auditTradeEvents(events).some((s) => s.kind === 'rapidTransfer')).toBe(true);
  });

  it('flags price outliers in both directions', () => {
    expect(auditTradeEvents([ev({ price: 100 * FRAUD.outlierMult + 1 })]).some((s) => s.kind === 'priceOutlier')).toBe(true);
    expect(auditTradeEvents([ev({ price: Math.floor(100 / FRAUD.outlierMult) - 1 })]).some((s) => s.kind === 'priceOutlier')).toBe(true);
  });

  it('flags self-dealing pairs and circular item paths', () => {
    const day = 86_400_000;
    const pair = Array.from({ length: FRAUD.pairTrades }, (_, i) =>
      ev({ at: i * day * 2, itemKey: `eq:i${i}`, fromId: i % 2 ? 'a' : 'b', toId: i % 2 ? 'b' : 'a' }));
    expect(auditTradeEvents(pair).some((s) => s.kind === 'selfDealing')).toBe(true);
    const circle = [
      ev({ at: 0, fromId: 'a', toId: 'b' }),
      ev({ at: day * 2, fromId: 'b', toId: 'a' }), // the item returns to a previous owner
    ];
    expect(auditTradeEvents(circle).some((s) => s.kind === 'circular')).toBe(true);
  });
});
