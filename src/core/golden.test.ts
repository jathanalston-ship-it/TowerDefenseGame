// Golden characterization test — pins exact outcomes for fixed seeds so that
// refactors / optimizations / cleanup PRESERVE GAMEPLAY EXACTLY. If a change is
// meant to alter behavior, these values must be updated deliberately (and that
// change reviewed); an accidental drift fails here.

import { describe, it, expect } from 'vitest';
import { autoplay } from './sim.testutil';

// Re-pinned deliberately for the COMBAT→BUILD SETTLE (config.SETTLE): after a wave's last enemy
// dies the battlefield now winds DOWN for a beat — in-flight projectiles coast out and FADE,
// particles/floats dissipate — before the draft/build. The settle PAUSES the sim (clock,
// buff/minion timers, and all combat frozen), so the only outcome change is at the wave
// BOUNDARY: leftover shots resolve at wave-end instead of freezing and bleeding into the next
// wave (a lingering mortar no longer lands among the next wave's spawns). Net: **kills and
// integrity are UNCHANGED for every seed** — only end-of-run biomass shifts ~1% from the
// boundary-economy timing. Every seed still WINS at wave 12. Any FURTHER drift is unintended.
//
// Re-pinned 2026-07 for the CONVEYOR ANTI-FARM model (docs/STRAIN.md §conveyor): the belt now
// opens with a FREE instant gift organism and STARTS new growth only during waves (an in-flight
// organism still finishes in prep). Autoplay never deploys from the belt, so the drift is pure
// recycler-drip timing: **wave/kills/integrity are UNCHANGED on every seed (196 kills, wave-12
// win, same integrity)** — only end-of-run biomass moved. Any FURTHER drift is unintended.
//
// Re-pinned for the CARRION BLOOM gene card (a new Epic economy card in the draft pool). Autoplay
// drafts every wave, so a larger pool shifts which economy card is picked in a couple of seeds —
// and Carrion Bloom's +biomass / on-kill biomass raises the leftover biomass. Autoplay places a
// fixed 3 towers/prep regardless of biomass, so the extra income is never spent: **wave/kills/
// integrity are UNCHANGED on every seed (196 kills, wave-12 win, same integrity)** — only end-of-run
// biomass moved on seeds 7 & 12345. Any FURTHER drift is unintended.
//
// (Prior baselines: TOWER EXPANSION card pool; BIOMORPH CONVEYOR; HIVE SIEGE re-model;
// PREDICTIVE MORTAR LEAD; SETTLE; SLOTS; GENE CARDS.)
const GOLDEN: Record<number, { wave: number; kills: number; integrity: number; biomass: number; phase: string }> = {
  1: { wave: 12, kills: 196, integrity: 227, biomass: 7991, phase: 'won' },
  7: { wave: 12, kills: 196, integrity: 97, biomass: 8179, phase: 'won' },
  42: { wave: 12, kills: 196, integrity: 97, biomass: 10083, phase: 'won' },
  777: { wave: 12, kills: 196, integrity: 91, biomass: 7943, phase: 'won' },
  2024: { wave: 12, kills: 196, integrity: 170, biomass: 8759, phase: 'won' },
  12345: { wave: 12, kills: 196, integrity: 139, biomass: 10044, phase: 'won' },
};

describe('golden outcomes (gameplay must not drift)', () => {
  for (const [seedStr, expected] of Object.entries(GOLDEN)) {
    it(`seed ${seedStr}`, () => {
      const o = autoplay(Number(seedStr));
      expect({ wave: o.wave, kills: o.kills, integrity: o.integrity, biomass: o.biomass, phase: o.phase }).toEqual(expected);
    });
  }
});
