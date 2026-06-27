// Golden characterization test — pins exact outcomes for fixed seeds so that
// refactors / optimizations / cleanup PRESERVE GAMEPLAY EXACTLY. If a change is
// meant to alter behavior, these values must be updated deliberately (and that
// change reviewed); an accidental drift fails here.

import { describe, it, expect } from 'vitest';
import { autoplay } from './sim.testutil';

// Re-pinned deliberately for the TOWER RANGE PHILOSOPHY redesign (docs/RANGE.md): each
// tower class now owns a distinct vertical engagement band (full-map artillery / long-range
// marksman / wide control field / medium skirmisher / short support), with cost & DPS
// rebalanced so long reach is paid back with low damage. Towers now engage the whole lane,
// so kills land earlier and more integrity survives — every seed still wins at wave 12.
// Any FURTHER drift from here is unintended.
const GOLDEN: Record<number, { wave: number; kills: number; integrity: number; biomass: number; phase: string }> = {
  1: { wave: 12, kills: 193, integrity: 178, biomass: 7024, phase: 'won' },
  7: { wave: 12, kills: 194, integrity: 182, biomass: 7549, phase: 'won' },
  42: { wave: 12, kills: 192, integrity: 129, biomass: 9007, phase: 'won' },
  777: { wave: 12, kills: 192, integrity: 129, biomass: 7987, phase: 'won' },
  2024: { wave: 12, kills: 196, integrity: 145, biomass: 12488, phase: 'won' },
  12345: { wave: 12, kills: 191, integrity: 215, biomass: 5764, phase: 'won' },
};

describe('golden outcomes (gameplay must not drift)', () => {
  for (const [seedStr, expected] of Object.entries(GOLDEN)) {
    it(`seed ${seedStr}`, () => {
      const o = autoplay(Number(seedStr));
      expect({ wave: o.wave, kills: o.kills, integrity: o.integrity, biomass: o.biomass, phase: o.phase }).toEqual(expected);
    });
  }
});
