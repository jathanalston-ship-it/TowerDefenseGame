// MARKET CONSTRUCTS — the pure policy (docs/CONSTRUCTS.md). Pins the roster's identity rules
// (unique, version-0 ids no real client can mint, 5–10 of them), and the economy contract every
// decision honours: sell AT the market (never a dump), buy AT OR BELOW value (never chase), never
// shop another construct / authority stock / itself, deposits bounded by earnings and the day's
// allowance, real-time pacing with a capped catch-up.

import { describe, expect, it } from 'vitest';
import {
  CONSTRUCT, CONSTRUCTS, constructAsk, constructBid, constructBuyNow, constructOf, constructWorth,
  depositAmount, isConstructId, marketDue, playSecondsFor, shoppable, wantsBuyNow, withdrawAmount,
} from './constructs';
import { FRAUD, TRADE } from './trading';
import type { TradeEvent } from './trading';
import { MANIPULATION, auditMarket } from './marketAuthority';

describe('constructs — the roster', () => {
  it('is 5–10 distinct accounts whose ids no real client can ever mint', () => {
    expect(CONSTRUCTS.length).toBeGreaterThanOrEqual(5);
    expect(CONSTRUCTS.length).toBeLessThanOrEqual(10);
    expect(new Set(CONSTRUCTS.map((c) => c.id)).size).toBe(CONSTRUCTS.length);
    expect(new Set(CONSTRUCTS.map((c) => c.name)).size).toBe(CONSTRUCTS.length);
    for (const c of CONSTRUCTS) {
      expect(c.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/); // the API's isPlayerId
      expect(c.id[14]).not.toBe('4'); // crypto.randomUUID is always version 4
      expect(isConstructId(c.id)).toBe(true);
      expect(constructOf(c.id)).toBe(c);
    }
    expect(isConstructId(crypto.randomUUID())).toBe(false);
    expect(isConstructId(null)).toBe(false);
  });
});

describe('constructs — the economy contract', () => {
  it('asks sit in a narrow band around the market price — never a dump, never absurd', () => {
    for (const c of CONSTRUCTS) {
      for (const roll of [0, 0.5, 0.999]) {
        const ask = constructAsk(200, c.style, roll);
        expect(ask).toBeGreaterThanOrEqual(200 * 0.9);
        expect(ask).toBeLessThanOrEqual(200 * 1.25 + 1);
      }
    }
    expect(constructAsk(1, 'clearer', 0)).toBe(TRADE.minPrice); // clamped to the market's bounds
    expect(constructAsk(1e9, 'collector', 1)).toBe(TRADE.maxPrice);
    expect(constructBuyNow(100, 0.99, 0)).toBeNull(); // past the buy-now share: a plain auction
    expect(constructBuyNow(100, 0, 0)).toBeGreaterThan(100);
  });

  it('pays at most ~value: worth ≤ 1.1× the market read; no read ⇒ no purchase', () => {
    for (const c of CONSTRUCTS) expect(constructWorth(1000, c.style)).toBeLessThanOrEqual(1100);
    expect(constructWorth(null, 'fair')).toBe(0);
    expect(wantsBuyNow(90, 100, 1000)).toBe(true);
    expect(wantsBuyNow(101, 100, 1000)).toBe(false); // over value
    expect(wantsBuyNow(90, 100, 100)).toBe(false); // over the per-purchase spend cap
    expect(constructBid(80, 100, 1000)).toBe(80);
    expect(constructBid(120, 100, 1000)).toBeNull(); // never escalates past value
  });

  it('never shops another construct, authority stock, its own listings, or a closed row', () => {
    const self = CONSTRUCTS[0].id;
    const player = crypto.randomUUID();
    expect(shoppable({ sellerId: player, authority: false, state: 'active' }, self)).toBe(true);
    expect(shoppable({ sellerId: CONSTRUCTS[1].id, authority: false, state: 'active' }, self)).toBe(false);
    expect(shoppable({ sellerId: '@authority', authority: true, state: 'active' }, self)).toBe(false);
    expect(shoppable({ sellerId: self, authority: false, state: 'active' }, self)).toBe(false);
    expect(shoppable({ sellerId: player, authority: false, state: 'sold' }, self)).toBe(false);
  });

  it('deposits only earned Ichor, up to the float and the day allowance; proceeds flow back', () => {
    expect(depositAmount(10_000, 0, 0)).toBe(CONSTRUCT.walletTarget);
    expect(depositAmount(50, 0, 0)).toBe(50); // only what the save holds
    expect(depositAmount(10_000, 0, CONSTRUCT.maxDepositPerDay)).toBe(0); // day allowance spent
    expect(depositAmount(10_000, CONSTRUCT.walletTarget, 0)).toBe(0); // float already full
    expect(withdrawAmount(CONSTRUCT.withdrawAbove)).toBe(0);
    expect(withdrawAmount(CONSTRUCT.withdrawAbove + 500)).toBe(CONSTRUCT.withdrawAbove + 500 - CONSTRUCT.walletTarget);
  });

  it('caps volume under a player and paces play in real time with a capped catch-up', () => {
    expect(CONSTRUCT.maxListingsPerDay).toBeLessThan(TRADE.maxListingsPerDay);
    expect(playSecondsFor(5 * 60_000)).toBe(300);
    expect(CONSTRUCT.listChance).toBeGreaterThan(0);
    expect(playSecondsFor(72 * 3_600_000)).toBe(CONSTRUCT.maxCatchUpSec);
    expect(playSecondsFor(-5)).toBe(0);
    const slot = CONSTRUCT.marketEveryMs;
    expect(marketDue(slot * 10 + 1, slot * 10 + 2)).toBe(false);
    expect(marketDue(slot * 10 + 1, slot * 11)).toBe(true);
  });
});

describe('constructs — the moderation feed stays clean', () => {
  const trade = (from: string, to: string, i: number): TradeEvent => ({ at: i * 60_000, itemKey: `gene:x#${from}${to}${i}`, fromId: from, toId: to, price: 40, medianPrice: 40 });
  it('a construct trading often with one player is not "self-dealing" — two players still are', () => {
    const player = crypto.randomUUID();
    const other = crypto.randomUUID();
    const n = FRAUD.pairTrades + 2;
    const withConstruct = Array.from({ length: n }, (_, i) => trade(CONSTRUCTS[0].id, player, i));
    expect(auditMarket(withConstruct, [], [], () => 40).filter((f) => f.kind === 'selfDealing')).toEqual([]);
    const twoPlayers = Array.from({ length: n }, (_, i) => trade(other, player, i));
    expect(auditMarket(twoPlayers, [], [], () => 40).some((f) => f.kind === 'selfDealing')).toBe(true);
  });

  it('never corners a family: its per-family cap sits under the monopoly shape', () => {
    expect(CONSTRUCT.maxPerFamily).toBeLessThan(MANIPULATION.monopolyMinListings * MANIPULATION.monopolyShare);
  });
});
