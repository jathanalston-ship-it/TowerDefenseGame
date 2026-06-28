// Golden characterization test — pins exact outcomes for fixed seeds so that
// refactors / optimizations / cleanup PRESERVE GAMEPLAY EXACTLY. If a change is
// meant to alter behavior, these values must be updated deliberately (and that
// change reviewed); an accidental drift fails here.

import { describe, it, expect } from 'vitest';
import { autoplay } from './sim.testutil';

// Re-pinned deliberately for the TOWER-SLOT PROGRESSION rework (docs/SLOTS.md): the 27
// emplacements were re-gridded into a SYMMETRIC, centre-out lattice (so the build slots no
// longer favour one side), and a new "Reclaimed Node" gene card joined the draft pool. Autoplay
// builds on towerSlots[0..2] (now at new positions) and drafts card 0 each wave (the pool shift
// nudges which card it lands on), so these outcomes moved. Every seed still WINS at wave 12 (the
// rework didn't break beatability); the swing is just the dumb auto-strategy on the new layout.
// Any FURTHER drift from here is unintended.
//
// (Prior baseline traced to the GENE CARD EXPANSION, docs/CARDS.md → TOWER RANGE PHILOSOPHY redesign, docs/RANGE.md.)
const GOLDEN: Record<number, { wave: number; kills: number; integrity: number; biomass: number; phase: string }> = {
  1: { wave: 12, kills: 190, integrity: 261, biomass: 8177, phase: 'won' },
  7: { wave: 12, kills: 194, integrity: 137, biomass: 8200, phase: 'won' },
  42: { wave: 12, kills: 188, integrity: 68, biomass: 8338, phase: 'won' },
  777: { wave: 12, kills: 186, integrity: 60, biomass: 6892, phase: 'won' },
  2024: { wave: 12, kills: 196, integrity: 170, biomass: 12368, phase: 'won' },
  12345: { wave: 12, kills: 193, integrity: 88, biomass: 7467, phase: 'won' },
};

describe('golden outcomes (gameplay must not drift)', () => {
  for (const [seedStr, expected] of Object.entries(GOLDEN)) {
    it(`seed ${seedStr}`, () => {
      const o = autoplay(Number(seedStr));
      expect({ wave: o.wave, kills: o.kills, integrity: o.integrity, biomass: o.biomass, phase: o.phase }).toEqual(expected);
    });
  }
});
