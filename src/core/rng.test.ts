import { describe, it, expect } from 'vitest';
import { Rng } from './rng';

describe('Rng', () => {
  it('is deterministic for a given seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 16 }, () => a.next());
    const seqB = Array.from({ length: 16 }, () => b.next());
    expect(seqB).toEqual(seqA);
  });

  it('produces different streams for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it('int() stays within [0, max)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 2000; i++) {
      const v = r.int(5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
    }
  });

  it('pickWeighted() roughly honors weights', () => {
    const r = new Rng(9);
    let a = 0;
    let b = 0;
    for (let i = 0; i < 4000; i++) {
      if (r.pickWeighted([['a', 9] as const, ['b', 1] as const]) === 'a') a++;
      else b++;
    }
    expect(a).toBeGreaterThan(b * 3); // ~9:1
  });
});
