// Golden characterization test — pins exact outcomes for fixed seeds so that
// refactors / optimizations / cleanup PRESERVE GAMEPLAY EXACTLY. If a change is
// meant to alter behavior, these values must be updated deliberately (and that
// change reviewed); an accidental drift fails here.

import { describe, it, expect } from 'vitest';
import { autoplay } from './sim.testutil';

// Re-pinned deliberately for the GENE CARD EXPANSION (docs/CARDS.md): the draft pool grew
// 14 → 44 cards across four rarities (common/rare/epic/legendary), and `draftCards` now rolls
// a DATA-DRIVEN, depth-scaled rarity weight instead of a hardcoded rare chance. Autoplay drafts
// card 0 each wave, so the cards it lands on changed → these outcomes shifted. Every seed still
// WINS at wave 12 (the expansion didn't break beatability); the swing is just the dumb auto-
// strategy landing on different cards. Any FURTHER drift from here is unintended.
//
// (Prior baseline traced to the TOWER RANGE PHILOSOPHY redesign, docs/RANGE.md.)
const GOLDEN: Record<number, { wave: number; kills: number; integrity: number; biomass: number; phase: string }> = {
  1: { wave: 12, kills: 192, integrity: 269, biomass: 7590, phase: 'won' },
  7: { wave: 12, kills: 194, integrity: 137, biomass: 7457, phase: 'won' },
  42: { wave: 12, kills: 191, integrity: 80, biomass: 7126, phase: 'won' },
  777: { wave: 12, kills: 187, integrity: 64, biomass: 6345, phase: 'won' },
  2024: { wave: 12, kills: 196, integrity: 170, biomass: 10733, phase: 'won' },
  12345: { wave: 12, kills: 191, integrity: 80, biomass: 7258, phase: 'won' },
};

describe('golden outcomes (gameplay must not drift)', () => {
  for (const [seedStr, expected] of Object.entries(GOLDEN)) {
    it(`seed ${seedStr}`, () => {
      const o = autoplay(Number(seedStr));
      expect({ wave: o.wave, kills: o.kills, integrity: o.integrity, biomass: o.biomass, phase: o.phase }).toEqual(expected);
    });
  }
});
