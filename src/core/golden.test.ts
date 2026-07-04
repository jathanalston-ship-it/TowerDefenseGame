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
// Re-pinned 2026-07 for HIVE SIEGE (docs/HIVE-SIEGE.md): enemies no longer despawn at a
// finish line — they converge on the Hive Core and ATTACK it until killed. Deliberate,
// design-changing re-pin: every seed now records kills = 196 (ALL spawned enemies die — the
// former leakers despawned uncredited), integrity outcomes shift (mostly UP: sustained chewing
// gives the defense time to respond where an instant breach burst didn't), and biomass shifts
// with the reclaimed bounties. Every seed still WINS at wave 12. Any FURTHER drift is unintended.
//
// (Prior baselines: PREDICTIVE MORTAR LEAD; COMBAT→BUILD SETTLE; TOWER-SLOT PROGRESSION; GENE CARDS.)
const GOLDEN: Record<number, { wave: number; kills: number; integrity: number; biomass: number; phase: string }> = {
  1: { wave: 12, kills: 196, integrity: 252, biomass: 8193, phase: 'won' },
  7: { wave: 12, kills: 196, integrity: 142, biomass: 8062, phase: 'won' },
  42: { wave: 12, kills: 196, integrity: 97, biomass: 8274, phase: 'won' },
  777: { wave: 12, kills: 196, integrity: 91, biomass: 6976, phase: 'won' },
  2024: { wave: 12, kills: 196, integrity: 170, biomass: 12078, phase: 'won' },
  12345: { wave: 12, kills: 196, integrity: 94, biomass: 7805, phase: 'won' },
};

describe('golden outcomes (gameplay must not drift)', () => {
  for (const [seedStr, expected] of Object.entries(GOLDEN)) {
    it(`seed ${seedStr}`, () => {
      const o = autoplay(Number(seedStr));
      expect({ wave: o.wave, kills: o.kills, integrity: o.integrity, biomass: o.biomass, phase: o.phase }).toEqual(expected);
    });
  }
});
