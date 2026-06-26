import { describe, it, expect } from 'vitest';
import { Rng } from './rng';
import { assembleBoss, bossDef } from './boss';

const mk = (seed: number): (() => number) => {
  const r = new Rng(seed);
  return () => r.next();
};

describe('boss framework', () => {
  it('the authored Progenitor is a real composition (phases + modules)', () => {
    const d = bossDef('progenitor')!;
    expect(d.phases.length).toBeGreaterThanOrEqual(2);
    expect(d.modules.length).toBeGreaterThanOrEqual(3);
    expect(d.phases[0].threshold).toBe(1); // first phase from full HP
  });

  it('procedural assembly scales module + phase count with Threat Level', () => {
    const low = assembleBoss(mk(1), 2);
    const high = assembleBoss(mk(1), 40);
    expect(high.modules.length).toBeGreaterThanOrEqual(low.modules.length);
    expect(high.phases.length).toBeGreaterThanOrEqual(low.phases.length);
    expect(high.phases.length).toBeLessThanOrEqual(3); // capped (fairness)
  });

  it('every assembled boss has ≥2 modules and a from-full first phase (fair)', () => {
    for (const seed of [3, 7, 11, 42]) {
      const b = assembleBoss(mk(seed), 18);
      expect(b.modules.length).toBeGreaterThanOrEqual(2);
      expect(b.phases[0].threshold).toBe(1);
    }
  });

  it('assembly is deterministic from the rng seed', () => {
    expect(assembleBoss(mk(5), 20).name).toBe(assembleBoss(mk(5), 20).name);
  });
});
