// Splice Market ECONOMY contracts (docs/MARKET.md) — the promises that make the Ichor loop
// safe to ship: the container gamble's EV sits under water, lucky chains die by design, the
// faucets front-load then dry up, cores only flow INTO the market, Power ignores Ichor, and
// the purchase path + clock-tamper rule + starter vial behave end-to-end.

import { describe, it, expect } from 'vitest';
import { Rng } from '../core/rng';
import { ICHOR, MARKET, ichorForDepthRecord, rollIchorDrop } from '../core/market';
import { meta } from './meta';
import { marketView } from './spliceMarket';
import { defaultSave, serializeExport } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';

const CHEAPEST = MARKET.containerPrice.common;

/** Seed the live meta store with an arbitrary save (the meta.test import idiom). */
function seed(mut: (s: SaveData) => void): SaveData {
  meta.reset();
  const s = defaultSave();
  s.createdAt = 1_700_000_000_000; // a real profile stamp → a real market seed
  mut(s);
  expect(meta.importText(serializeExport(s)).ok).toBe(true);
  return meta.get();
}

describe('the gamble is UNDER water (docs/MARKET.md §gamble)', () => {
  it('EV of ichor per opened container ≤ 15% of the cheapest market container', () => {
    const evHit = ICHOR.dropTable.reduce((s, [amt, p]) => s + amt * p, 0);
    const ev = ICHOR.dropChance * evHit;
    expect(ev / CHEAPEST).toBeLessThanOrEqual(0.15);
    // even the premium-box rate stays far below self-funding
    expect((ICHOR.dropChancePremium * evHit) / CHEAPEST).toBeLessThanOrEqual(0.18);
    // only the tail-end jackpot exceeds one container's price — the "perpetuate a little" beat
    const above = ICHOR.dropTable.filter(([amt]) => amt > CHEAPEST);
    expect(above.length).toBe(1);
  });

  it('Monte Carlo: a 3-container bank stretches, but chains DIE (median ≤3, ≥6 <3%, ≥9 <0.1%)', () => {
    const rng = new Rng(0xfeed);
    const TRIALS = 100_000;
    const counts: number[] = [];
    let ge6 = 0;
    let ge9 = 0;
    let max = 0;
    for (let t = 0; t < TRIALS; t++) {
      let ichor = CHEAPEST * 3; // the lucky start: three containers banked
      let boxes = 0;
      while (ichor >= CHEAPEST && boxes < 50) {
        ichor -= CHEAPEST;
        boxes++;
        ichor += rollIchorDrop(() => rng.next(), false);
      }
      counts.push(boxes);
      if (boxes >= 6) ge6++;
      if (boxes >= 9) ge9++;
      if (boxes > max) max = boxes;
    }
    counts.sort((a, b) => a - b);
    expect(counts[Math.floor(TRIALS / 2)]).toBeLessThanOrEqual(3); // median
    expect(ge6 / TRIALS).toBeLessThan(0.03);
    expect(ge9 / TRIALS).toBeLessThan(0.001);
    expect(max).toBeLessThan(14); // even the luckiest observed run starves
  });
});

describe('faucets front-load, then dry up', () => {
  it('an early account affords 2–3 containers from milestones alone; repeats pay nothing', () => {
    // starter vial + two campaign milestones + four collection ranks (authored amounts)
    const early = ICHOR.starterVial + 2 * ICHOR.campaignAmount + 4 * ICHOR.collectionRank;
    expect(Math.floor(early / CHEAPEST)).toBeGreaterThanOrEqual(2);
    // the ONLY repeatable source is depth-record bands — and a non-record run pays zero
    expect(ichorForDepthRecord(40, 40)).toBe(0);
    expect(ichorForDepthRecord(40, 38)).toBe(0);
  });
});

describe('meta integration — purchases, tamper rule, starter vial, no inflation', () => {
  it('openMarket pays the starter vial exactly once and stamps the seen window', () => {
    seed(() => undefined);
    const now = Date.now();
    meta.openMarket(now);
    expect(meta.get().ichor).toBe(ICHOR.starterVial);
    meta.openMarket(now); // idempotent
    expect(meta.get().ichor).toBe(ICHOR.starterVial);
    expect(meta.get().lifetimeIchor).toBe(ICHOR.starterVial);
    expect(meta.get().market.starter).toBe(true);
    expect(meta.get().market.seenWindow).toBeGreaterThan(0);
  });

  it('buys resolve against the CURRENT window: goods land, SOLD sticks, stale/duplicate/poor fail', () => {
    seed((s) => {
      s.shards = 10_000;
      s.ichor = 1_000;
    });
    const now = Date.now();
    const { stock } = meta.marketState(now);
    const coreSlot = stock.find((s) => s.pay === 'cores' && s.item.good === 'towerShards')!;
    const kind = (coreSlot.item as { kind: string }).kind as never;
    const before = meta.get();
    expect(meta.buyMarketSlot(coreSlot.id, now)).toBe(true);
    const after = meta.get();
    expect(after.shards).toBe(before.shards - coreSlot.price);
    expect(after.towerShards[kind]).toBe((before.towerShards[kind] ?? 0) + (coreSlot.item as { qty: number }).qty);
    expect(meta.buyMarketSlot(coreSlot.id, now)).toBe(false); // already SOLD
    expect(meta.buyMarketSlot('999999:0', now)).toBe(false); // stale/foreign id
    // a container buy lands in the Vault's pending queue
    const container = stock.find((s) => s.item.good === 'container')!;
    const qBefore = meta.get().pendingContainers.length;
    expect(meta.buyMarketSlot(container.id, now)).toBe(true);
    expect(meta.get().pendingContainers.length).toBe(qBefore + 1);
    expect(meta.get().ichor).toBe(1_000 - container.price);
    // draining the wallet blocks the next premium buy
    const drained = meta.get();
    const otherPremium = stock.find((s) => s.pay === 'ichor' && !drained.market.bought.includes(s.id))!;
    seedIchor(0);
    expect(meta.buyMarketSlot(otherPremium.id, now)).toBe(false);
    function seedIchor(n: number): void {
      // spend everything through the guarded seam (no direct store pokes)
      const cur = meta.get().ichor;
      if (cur > n) expect(meta.spendIchor(cur - n)).toBe(true);
    }
  });

  it('clock-tamper: rewinding re-shows the SAME recorded window with purchases intact', () => {
    seed((s) => {
      s.shards = 10_000;
    });
    const now = Date.now();
    const { stock } = meta.marketState(now);
    const slot = stock.find((s) => s.pay === 'cores')!;
    expect(meta.buyMarketSlot(slot.id, now)).toBe(true);
    const recorded = meta.get().market.window;
    const past = now - MARKET.refreshMs * 10; // wind the clock back 10 windows
    const rewound = meta.marketState(past);
    expect(rewound.window).toBe(recorded); // max-window rule: no time travel
    expect(rewound.bought).toContain(slot.id); // nothing becomes re-buyable
    expect(meta.buyMarketSlot(slot.id, past)).toBe(false);
  });

  it('cores only flow INTO the market — no slot ever grants Genome Cores', () => {
    const save = seed((s) => {
      s.shards = 100_000;
    });
    for (let w = 0; w < 50; w++) {
      const v = marketView({ ...save, market: { ...save.market, window: 0 } }, w * MARKET.refreshMs + 1);
      for (const s of v.slots) expect(s.item.good).not.toBe('genomeCores' as never);
    }
  });

  it('Ichor never touches the Power Score', () => {
    seed(() => undefined);
    const p0 = meta.previewPower((s) => ({ ...s, ichor: 0 })).score;
    const p1 = meta.previewPower((s) => ({ ...s, ichor: 10_000, lifetimeIchor: 10_000 })).score;
    expect(p1).toBe(p0);
  });

  it('save fields round-trip through export/import (ichor, lifetime, market record)', () => {
    seed((s) => {
      s.ichor = 123;
      s.lifetimeIchor = 456;
      s.market = { window: 7, bought: ['7:1'], seenWindow: 7, starter: true };
    });
    const out = meta.get();
    expect(out.ichor).toBe(123);
    expect(out.lifetimeIchor).toBe(456);
    expect(out.market).toEqual({ window: 7, bought: ['7:1'], seenWindow: 7, starter: true });
  });
});
