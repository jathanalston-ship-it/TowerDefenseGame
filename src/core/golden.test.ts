// Golden characterization test — pins exact outcomes for fixed seeds so that
// refactors / optimizations / cleanup PRESERVE GAMEPLAY EXACTLY. If a change is
// meant to alter behavior, these values must be updated deliberately (and that
// change reviewed); an accidental drift fails here.

import { describe, it, expect } from 'vitest';
import { autoplay } from './sim.testutil';

// Re-pinned deliberately for the combat-variety wave redesign (rusher/tank/flyer/
// burrower introduced across the 12 waves). The slice stays winnable by the naive
// autoplay strategy on every seed; the spread in surviving integrity reflects the
// new archetypes' varied pressure. Any FURTHER drift from here is unintended.
const GOLDEN: Record<number, { wave: number; kills: number; integrity: number; biomass: number; phase: string }> = {
  1: { wave: 12, kills: 186, integrity: 150, biomass: 9613, phase: 'won' },
  7: { wave: 12, kills: 188, integrity: 148, biomass: 9844, phase: 'won' },
  42: { wave: 12, kills: 187, integrity: 109, biomass: 11819, phase: 'won' },
  777: { wave: 12, kills: 184, integrity: 92, biomass: 11513, phase: 'won' },
  2024: { wave: 12, kills: 191, integrity: 125, biomass: 14837, phase: 'won' },
  12345: { wave: 12, kills: 184, integrity: 186, biomass: 8328, phase: 'won' },
};

describe('golden outcomes (gameplay must not drift)', () => {
  for (const [seedStr, expected] of Object.entries(GOLDEN)) {
    it(`seed ${seedStr}`, () => {
      const o = autoplay(Number(seedStr));
      expect({ wave: o.wave, kills: o.kills, integrity: o.integrity, biomass: o.biomass, phase: o.phase }).toEqual(expected);
    });
  }
});
