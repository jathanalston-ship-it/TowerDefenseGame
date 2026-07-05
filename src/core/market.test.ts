// Splice Market core contracts (docs/MARKET.md): the stock is DETERMINISTIC per
// (profile seed, window, roster), always exactly MARKET.slots slots, never stocks locked
// content, prices follow the authored formulas, and the distribution knobs (second
// container, rarity weights, ichor drop) land where they're tuned.

import { describe, it, expect } from 'vitest';
import { Rng } from './rng';
import {
  ICHOR, MARKET, ichorForAchievement, ichorForDepthRecord, marketWindow, msToNextWindow,
  rollIchorDrop, rollStock,
} from './market';
import type { MarketRoster } from './market';

const ROSTER: MarketRoster = { towers: ['needle', 'mortar'], heroes: ['ravager'] };

describe('market windows', () => {
  it('window math: floor(now / refreshMs); countdown is the complement', () => {
    expect(marketWindow(0)).toBe(0);
    expect(marketWindow(MARKET.refreshMs - 1)).toBe(0);
    expect(marketWindow(MARKET.refreshMs)).toBe(1);
    expect(msToNextWindow(MARKET.refreshMs * 7 + 1000)).toBe(MARKET.refreshMs - 1000);
  });
});

describe('rollStock — deterministic, complete, roster-gated', () => {
  it('same (seed, window, roster) ⇒ byte-identical stock; other windows differ', () => {
    const a = rollStock(1234, 42, ROSTER);
    const b = rollStock(1234, 42, ROSTER);
    expect(b).toEqual(a);
    const anyDiff = Array.from({ length: 10 }, (_, w) => rollStock(1234, 100 + w, ROSTER))
      .some((s) => JSON.stringify(s) !== JSON.stringify(a));
    expect(anyDiff).toBe(true);
  });

  it('always exactly MARKET.slots slots with stable per-window ids', () => {
    for (let w = 0; w < 200; w++) {
      const stock = rollStock(77, w, ROSTER);
      expect(stock.length).toBe(MARKET.slots);
      stock.forEach((s, i) => expect(s.id).toBe(`${w}:${i}`));
    }
  });

  it('4 core-priced slots; the rest pay ichor; at least one container; integer prices ≥ 1', () => {
    for (let w = 0; w < 300; w++) {
      const stock = rollStock(5, w, ROSTER);
      expect(stock.filter((s) => s.pay === 'cores').length).toBe(4);
      expect(stock.filter((s) => s.item.good === 'container').length).toBeGreaterThanOrEqual(1);
      for (const s of stock) {
        expect(Number.isInteger(s.price)).toBe(true);
        expect(s.price).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('never stocks outside the owned roster (locked kinds cannot appear)', () => {
    for (let w = 0; w < 400; w++) {
      for (const s of rollStock(9, w, ROSTER)) {
        if (s.item.good === 'towerShards') expect(ROSTER.towers).toContain(s.item.kind);
        if (s.item.good === 'heroShards') expect(ROSTER.heroes).toContain(s.item.hero);
      }
    }
  });

  it('price formulas hold (core tower samples = 8 × qty; containers use the price table)', () => {
    for (let w = 0; w < 120; w++) {
      for (const s of rollStock(3, w, ROSTER)) {
        if (s.pay === 'cores' && s.item.good === 'towerShards') expect(s.price).toBe(8 * s.item.qty);
        if (s.item.good === 'container') expect(s.price).toBe(MARKET.containerPrice[s.item.rarity]);
        if (s.item.good === 'equipment') expect(s.price).toBe(MARKET.equipPrice[s.item.equipRarity]);
      }
    }
  });

  it('the second-container rate and rarity weights land where they are tuned', () => {
    let doubles = 0;
    const byRarity: Record<string, number> = {};
    const WINDOWS = 6000;
    for (let w = 0; w < WINDOWS; w++) {
      const cs = rollStock(11, w, ROSTER).filter((s) => s.item.good === 'container');
      if (cs.length === 2) doubles++;
      for (const c of cs) {
        const r = (c.item as { rarity: string }).rarity;
        byRarity[r] = (byRarity[r] ?? 0) + 1;
      }
    }
    expect(doubles / WINDOWS).toBeGreaterThan(0.21);
    expect(doubles / WINDOWS).toBeLessThan(0.29);
    const total = Object.values(byRarity).reduce((a, b) => a + b, 0);
    expect(byRarity.common / total).toBeGreaterThan(0.36); // 42% ± tolerance
    expect(byRarity.common / total).toBeLessThan(0.48);
    expect((byRarity.exotic ?? 0) / total).toBeLessThan(0.045); // 2% stays rare
  });

  it('tiny rosters (one tower, one hero) still fill every slot without crashing', () => {
    const stock = rollStock(1, 5, { towers: ['needle'], heroes: ['ravager'] });
    expect(stock.length).toBe(MARKET.slots);
  });
});

describe('the Ichor economy tables', () => {
  it('achievement tiers map by core-reward size', () => {
    expect(ichorForAchievement(0)).toBe(ICHOR.achievementSmall);
    expect(ichorForAchievement(20)).toBe(ICHOR.achievementSmall);
    expect(ichorForAchievement(40)).toBe(ICHOR.achievementMid);
    expect(ichorForAchievement(75)).toBe(ICHOR.achievementBig);
  });

  it('depth-record bands pay ONLY new bands (a replayed depth pays nothing)', () => {
    expect(ichorForDepthRecord(0, 12)).toBe(2 * ICHOR.infinitePerBand); // bands 5 + 10
    expect(ichorForDepthRecord(12, 14)).toBe(0); // no new band
    expect(ichorForDepthRecord(14, 25)).toBe(3 * ICHOR.infinitePerBand); // 15, 20, 25
    expect(ichorForDepthRecord(25, 25)).toBe(0); // an equal run is not a record
  });

  it('rollIchorDrop: tuned hit-rate, table-only amounts', () => {
    const rng = new Rng(424242);
    let hits = 0;
    const amounts = new Set<number>();
    const N = 200_000;
    for (let i = 0; i < N; i++) {
      const d = rollIchorDrop(() => rng.next(), false);
      if (d > 0) {
        hits++;
        amounts.add(d);
      }
    }
    expect(hits / N).toBeGreaterThan(ICHOR.dropChance - 0.01);
    expect(hits / N).toBeLessThan(ICHOR.dropChance + 0.01);
    const legal = new Set<number>(ICHOR.dropTable.map(([a]) => a));
    for (const a of amounts) expect(legal.has(a)).toBe(true);
  });
});
