// Ichor Exchange (docs/MARKET.md §exchange): 30-min windows, deterministic reserve-scaled
// lots, the sublinear anti-snowball volume curve (anchored to the design examples), the
// max-window clock-tamper rule, and the buy pipeline's grants/refusals.

import { describe, expect, it } from 'vitest';
import {
  EXCHANGE, EXCHANGE_CURRENCIES, exchangeWindow, msToExchangeRefresh, rollExchange,
} from '../core/ichorExchange';
import { meta } from './meta';

const T0 = 1_700_000_000_000;

describe('windows', () => {
  it('30-minute windows with an exact refresh countdown', () => {
    expect(exchangeWindow(T0 + EXCHANGE.refreshMs) - exchangeWindow(T0)).toBe(1);
    const ms = msToExchangeRefresh(T0);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(EXCHANGE.refreshMs);
    expect(exchangeWindow(T0 + ms)).toBe(exchangeWindow(T0) + 1);
  });
});

describe('the lot roll', () => {
  it('is deterministic per (window, reserve) and fresh across windows', () => {
    expect(rollExchange(100, 500)).toEqual(rollExchange(100, 500));
    const a = rollExchange(100, 500).map((o) => `${o.cost}:${o.qty}`).join('|');
    const b = rollExchange(101, 500).map((o) => `${o.cost}:${o.qty}`).join('|');
    expect(a).not.toBe(b);
  });

  it('offers two lots per currency — the bulk lot always costs more and pays more', () => {
    const offers = rollExchange(7, 300);
    expect(offers).toHaveLength(6);
    for (const c of EXCHANGE_CURRENCIES) {
      const [small, bulk] = offers.filter((o) => o.currency === c);
      expect(small.bulk).toBe(false);
      expect(bulk.bulk).toBe(true);
      expect(bulk.cost).toBeGreaterThan(small.cost);
      expect(bulk.qty).toBeGreaterThan(small.qty);
    }
  });

  it('anchors: a 10-Ichor pocket trades ~1→1 scrap and ~1→10 cores', () => {
    // Average across windows (jitter is ±15%) — the DESIGN anchors from docs/MARKET.md.
    let scrapCost = 0; let scrapQty = 0; let coreCost = 0; let coreQty = 0;
    for (let w = 0; w < 60; w++) {
      const offers = rollExchange(w, 10);
      const sc = offers.find((o) => o.currency === 'scrap' && !o.bulk)!;
      const co = offers.find((o) => o.currency === 'genomeCores' && !o.bulk)!;
      scrapCost += sc.cost; scrapQty += sc.qty; coreCost += co.cost; coreQty += co.qty;
    }
    expect(scrapCost / 60).toBeCloseTo(1, 1); // ≈1 Ichor
    expect(scrapQty / 60).toBeGreaterThan(0.9); // → ≈1 scrap
    expect(scrapQty / 60).toBeLessThan(1.6);
    expect(coreCost / 60).toBeCloseTo(1, 1);
    expect(coreQty / 60).toBeGreaterThan(8); // → ≈10 cores
    expect(coreQty / 60).toBeLessThan(12);
  });

  it('anchors: a 1000-Ichor reserve bulk-trades ≈250 Ichor → ≈50 scrap', () => {
    let cost = 0; let qty = 0;
    for (let w = 0; w < 60; w++) {
      const bulk = rollExchange(w, 1000).find((o) => o.currency === 'scrap' && o.bulk)!;
      cost += bulk.cost; qty += bulk.qty;
    }
    expect(cost / 60).toBeGreaterThan(200);
    expect(cost / 60).toBeLessThan(300);
    expect(qty / 60).toBeGreaterThan(40);
    expect(qty / 60).toBeLessThan(65);
  });

  it('the volume curve is SUBLINEAR — big trades pay a leaner per-Ichor rate', () => {
    let smallRate = 0; let bulkRate = 0;
    for (let w = 0; w < 80; w++) {
      const offers = rollExchange(w, 2000);
      const small = offers.find((o) => o.currency === 'geneEssence' && !o.bulk)!;
      const bulk = offers.find((o) => o.currency === 'geneEssence' && o.bulk)!;
      smallRate += small.qty / small.cost;
      bulkRate += bulk.qty / bulk.cost;
    }
    expect(bulkRate / 80).toBeLessThan(smallRate / 80); // anti-snowball holds even with the bulk sweetener
  });

  it('a broke account still gets minimum viable lots (cost 1–2, qty ≥ 1)', () => {
    for (const o of rollExchange(5, 0)) {
      expect(o.cost).toBeGreaterThanOrEqual(1);
      expect(o.cost).toBeLessThanOrEqual(3);
      expect(o.qty).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('meta pipeline', () => {
  it('polls the window forward (snapshotting the reserve), trades, refuses double-buys', () => {
    meta.reset();
    meta.grantIchor('test', 100);
    const now = 200 * EXCHANGE.refreshMs + 5; // a deterministic mid-window clock
    meta.pollIchorExchange(now);
    const rec = meta.get().ichorExchange;
    expect(rec.window).toBe(exchangeWindow(now));
    expect(rec.reserve).toBe(100);
    const view = meta.ichorExchangeView(now);
    const buyable = view.offers.find((o) => o.affordable)!;
    const before = meta.get();
    expect(meta.buyIchorOffer(buyable.index, now)).toBe(true);
    const after = meta.get();
    expect(before.ichor - after.ichor).toBe(buyable.cost);
    if (buyable.currency === 'genomeCores') expect(after.shards - before.shards).toBe(buyable.qty);
    else if (buyable.currency === 'geneEssence') expect(after.geneEssence - before.geneEssence).toBe(buyable.qty);
    else expect(after.mats.scrap - before.mats.scrap).toBe(buyable.qty);
    expect(meta.buyIchorOffer(buyable.index, now)).toBe(false); // one trade per lot per window
    expect(meta.ichorExchangeView(now).offers.find((o) => o.index === buyable.index)?.traded).toBe(true);
  });

  it('a spend mid-window never re-prices the board (reserve snapshot holds)', () => {
    meta.reset();
    meta.grantIchor('test', 400);
    const now = 300 * EXCHANGE.refreshMs + 5;
    meta.pollIchorExchange(now);
    const first = meta.ichorExchangeView(now).offers.map((o) => `${o.cost}:${o.qty}`).join('|');
    const cheap = meta.ichorExchangeView(now).offers.filter((o) => o.affordable).sort((a, b) => a.cost - b.cost)[0]!;
    expect(meta.buyIchorOffer(cheap.index, now)).toBe(true);
    const second = meta.ichorExchangeView(now).offers.map((o) => `${o.cost}:${o.qty}`).join('|');
    expect(second).toBe(first);
  });

  it('a new window re-rolls (fresh lots, trades cleared); a rolled-back clock cannot', () => {
    meta.reset();
    meta.grantIchor('test', 50);
    const now = 400 * EXCHANGE.refreshMs + 5;
    meta.pollIchorExchange(now);
    const buyable = meta.ichorExchangeView(now).offers.find((o) => o.affordable)!;
    expect(meta.buyIchorOffer(buyable.index, now)).toBe(true);
    const later = now + EXCHANGE.refreshMs;
    meta.pollIchorExchange(later);
    const rec = meta.get().ichorExchange;
    expect(rec.window).toBe(exchangeWindow(later));
    expect(rec.bought).toEqual([]);
    // Clock rolled BACK: the max-window rule keeps the newer record (no forged fresh lots).
    meta.pollIchorExchange(now);
    expect(meta.get().ichorExchange.window).toBe(exchangeWindow(later));
  });

  it('refuses unaffordable lots without mutating', () => {
    meta.reset(); // 0 ichor
    const now = 500 * EXCHANGE.refreshMs + 5;
    meta.pollIchorExchange(now);
    const before = meta.get();
    const offer = meta.ichorExchangeView(now).offers[0];
    expect(offer.affordable).toBe(false);
    expect(meta.buyIchorOffer(offer.index, now)).toBe(false);
    expect(meta.get()).toEqual(before);
  });
});
