import { describe, it, expect } from 'vitest';
import { addProgress, defaultLootQueue, lootMeterView, sanitizeLootQueue } from './lootQueue';
import { LOOT_QUEUE_DEPTH, costOf, emptyPity, isLootRarity } from './loot';

describe('defaultLootQueue', () => {
  it('is deterministic and pre-fills the queue to depth with valid rarities', () => {
    const a = defaultLootQueue();
    const b = defaultLootQueue();
    expect(a).toEqual(b); // stable → defaultSave stays comparable in round-trip tests
    expect(a.queue.length).toBe(LOOT_QUEUE_DEPTH);
    expect(a.queue.every(isLootRarity)).toBe(true);
    expect(a.progress).toBe(0);
  });
});

describe('addProgress', () => {
  it('accumulates without awarding below the front cost', () => {
    const q = defaultLootQueue();
    const cost = costOf(q.queue[0]);
    const r = addProgress(q, cost - 1, () => 0);
    expect(r.awarded).toEqual([]);
    expect(r.state.progress).toBe(cost - 1);
    expect(r.state.queue).toEqual(q.queue); // unchanged
  });

  it('awards the front box and slides the PRE-DETERMINED next forward', () => {
    const q = defaultLootQueue();
    const front = q.queue[0];
    const predeterminedNext = q.queue[1];
    const r = addProgress(q, costOf(front), () => 0);
    expect(r.awarded).toEqual([front]);
    expect(r.state.queue[0]).toBe(predeterminedNext); // the next box was already decided
    expect(r.state.queue.length).toBe(LOOT_QUEUE_DEPTH); // a fresh tail was rolled
    expect(r.state.progress).toBe(0);
  });

  it('carries overflow progress into the next box', () => {
    const q = defaultLootQueue();
    const front = q.queue[0];
    const r = addProgress(q, costOf(front) + 5, () => 0);
    expect(r.awarded).toEqual([front]);
    expect(r.state.progress).toBe(5);
  });

  it('awards multiple boxes from one large bank, conserving points', () => {
    const q = defaultLootQueue();
    const bank = 100000;
    const r = addProgress(q, bank, () => 0);
    expect(r.awarded.length).toBeGreaterThan(1);
    const spent = r.awarded.reduce((s, id) => s + costOf(id), 0);
    expect(spent + r.state.progress).toBe(q.progress + bank); // nothing created or lost
  });

  it('advances pity as boxes open (commons never satisfy higher tiers)', () => {
    const q = { progress: 0, queue: ['common', 'common'], pity: emptyPity() };
    const r = addProgress(q, costOf('common') * 5, () => 0); // rng 0 → commons (pity not yet met)
    expect(r.awarded).toEqual(['common', 'common', 'common', 'common', 'common']);
    expect(r.state.pity.epic).toBe(5);
    expect(r.state.pity.legendary).toBe(5);
  });
});

describe('lootMeterView (the live HUD meter)', () => {
  const sixCommons = () => ({ progress: 0, queue: ['common', 'common', 'common', 'common', 'common', 'common'], pity: emptyPity() });

  it('fills the current box, then CYCLES to the next once it completes (never caps)', () => {
    const q = sixCommons();
    const c = costOf('common');
    const below = lootMeterView(q, c - 1);
    expect(below.completed).toBe(0);
    expect(below.pct).toBeCloseTo((c - 1) / c);
    const past = lootMeterView(q, c + 5);
    expect(past.completed).toBe(1); // advanced — the meter reset to the next box
    expect(past.filled).toBe(5); // carrying the overflow into it
    expect(past.pct).toBeCloseTo(5 / c);
  });

  it('matches the boxes the run-end addProgress will award (same points)', () => {
    const q = sixCommons();
    const pts = 250; // two commons (200) + 50 carry
    const view = lootMeterView(q, pts);
    const award = addProgress(q, pts, () => 0);
    expect(view.completed).toBe(award.awarded.length);
    expect(view.completed).toBe(2);
    expect(view.filled).toBe(award.state.progress);
  });

  it('never maxes out — a deep run keeps completing boxes past the queue', () => {
    const q = defaultLootQueue();
    const a = lootMeterView(q, 5000);
    const b = lootMeterView(q, 50000);
    expect(b.completed).toBeGreaterThan(a.completed); // keeps cycling, not stuck at the queue end
    expect(b.pct).toBeLessThanOrEqual(1);
  });
});

describe('sanitizeLootQueue', () => {
  it('fills a fresh queue from junk input', () => {
    for (const junk of [null, undefined, 42, 'x', []]) {
      expect(sanitizeLootQueue(junk).queue.length).toBeGreaterThanOrEqual(LOOT_QUEUE_DEPTH);
    }
  });

  it('drops unknown rarities, keeps valid order, re-pads to depth', () => {
    const s = sanitizeLootQueue({ progress: 10, queue: ['rare', 'bogus', 'epic'], pity: {} });
    expect(s.queue.every(isLootRarity)).toBe(true);
    expect(s.queue[0]).toBe('rare');
    expect(s.queue.length).toBeGreaterThanOrEqual(LOOT_QUEUE_DEPTH);
    expect(s.progress).toBe(10);
  });

  it('clamps bad progress and rebuilds pity to the canonical tiers only', () => {
    const s = sanitizeLootQueue({ progress: -5, queue: ['common'], pity: { epic: 3, bogus: 9 } });
    expect(s.progress).toBe(0);
    expect(s.pity.epic).toBe(3);
    expect('bogus' in s.pity).toBe(false);
  });
});
