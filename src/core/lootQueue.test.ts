import { describe, it, expect } from 'vitest';
import { addProgress, defaultLootQueue, sanitizeLootQueue } from './lootQueue';
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

describe('meter invariants (the HUD bar is a pure read of this state — docs/LOOTBOX.md §meter)', () => {
  // Deterministic RNG so the sweep is stable across runs.
  function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it('stress: thousands of randomized fills never leave the front box full-or-over', () => {
    const rng = mulberry32(0xbeef);
    let st = defaultLootQueue();
    let banked = 0;
    let spent = 0;
    for (let i = 0; i < 5000; i++) {
      const pts = Math.floor(rng() * 220); // mixes no-ops, partial fills, single + multi awards
      const r = addProgress(st, pts, rng);
      banked += pts;
      spent += r.awarded.reduce((s, id) => s + costOf(id), 0);
      st = r.state;
      // The invariant the meter renders from: progress strictly below the front's cost.
      expect(st.progress).toBeGreaterThanOrEqual(0);
      expect(st.progress).toBeLessThan(costOf(st.queue[0]));
      expect(st.queue.length).toBe(LOOT_QUEUE_DEPTH);
    }
    expect(spent + st.progress).toBe(banked); // conservation across the whole sweep
  });

  it('self-heals an owed state: 0 new points still award a front at/over its cost', () => {
    // Only reachable via legacy/hand-edited saves — meta.syncRunLoot calls this with 0 delta
    // when it detects progress ≥ cost, so a loaded save can never sit pinned at full.
    const base = defaultLootQueue();
    const owed = { ...base, progress: costOf(base.queue[0]) + 25 };
    const r = addProgress(owed, 0, () => 0);
    expect(r.awarded).toEqual([base.queue[0]]);
    expect(r.state.progress).toBe(25);
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
