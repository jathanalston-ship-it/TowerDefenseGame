// Golden characterization test — pins exact outcomes for fixed seeds so that
// refactors / optimizations / cleanup PRESERVE GAMEPLAY EXACTLY. If a change is
// meant to alter behavior, these values must be updated deliberately (and that
// change reviewed); an accidental drift fails here.

import { describe, it, expect } from 'vitest';
import { autoplay } from './sim.testutil';

const GOLDEN: Record<number, { wave: number; kills: number; integrity: number; biomass: number; phase: string }> = {
  1: { wave: 12, kills: 224, integrity: 150, biomass: 8875, phase: 'won' },
  7: { wave: 12, kills: 226, integrity: 113, biomass: 9664, phase: 'won' },
  42: { wave: 12, kills: 226, integrity: 68, biomass: 11392, phase: 'won' },
  777: { wave: 12, kills: 223, integrity: 146, biomass: 9180, phase: 'won' },
  2024: { wave: 12, kills: 230, integrity: 129, biomass: 11233, phase: 'won' },
  12345: { wave: 12, kills: 222, integrity: 52, biomass: 10356, phase: 'won' },
};

describe('golden outcomes (gameplay must not drift)', () => {
  for (const [seedStr, expected] of Object.entries(GOLDEN)) {
    it(`seed ${seedStr}`, () => {
      const o = autoplay(Number(seedStr));
      expect({ wave: o.wave, kills: o.kills, integrity: o.integrity, biomass: o.biomass, phase: o.phase }).toEqual(expected);
    });
  }
});
