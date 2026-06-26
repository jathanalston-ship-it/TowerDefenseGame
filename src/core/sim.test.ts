// Headless sim verification — the deterministic core runs with no DOM/React.
// Doubles as a tiny balance smoke test (ARCHITECTURE.md §17). Exact-outcome
// pinning lives in golden.test.ts; this asserts the looser invariants.

import { describe, it, expect } from 'vitest';
import { autoplay } from './sim.testutil';

describe('simulation', () => {
  it('spawns, kills, and progresses through waves', () => {
    const o = autoplay(12345);
    expect(o.kills).toBeGreaterThan(0);
    expect(o.wave).toBeGreaterThanOrEqual(3);
    expect(['won', 'lost']).toContain(o.phase);
  });

  it('triggers the Shred reaction when Fracture meets Corrosion', () => {
    expect(autoplay(777).sawShred).toBe(true);
  });

  it('is fully deterministic for a fixed seed + strategy', () => {
    expect(autoplay(2024)).toEqual(autoplay(2024));
  });
});
