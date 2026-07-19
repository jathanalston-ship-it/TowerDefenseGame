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
//
// Re-pinned 2026-07 for the EXPANSION BASE POOL (5 new ungated genes: Barbed Carapace, Concussive
// Rounds, Gestating Brood, Corroded Fangs, Tempered Instincts). The larger pool shifts which cards
// autoplay drafts per seed, moving end-of-run integrity + biomass (the new set includes hero-survival
// AND economy genes). **wave (12), kills (196), and the 'won' outcome are IDENTICAL on every seed** —
// the run structure is unchanged; only drafted-buff-dependent integrity/biomass moved. The 5 GATED
// expansion genes stay OUT of the default pool ⇒ no sim-logic change. Any FURTHER drift is unintended.
// Re-pinned 2026-07 for DRAFT RELEVANCE (docs/CARDS.md §draft relevance): gene drafts now offer
// tower-subject cards ONLY for kinds with a tower on the board (a card for an organism you aren't
// running was a dead pick). Autoplay fields a needle-heavy board, so the filtered pool skews its
// picks toward needle/global/economy genes — **wave (12), kills (196), and the 'won' outcome are
// IDENTICAL on every seed**; only drafted-buff-dependent integrity/biomass moved (the surviving
// picks lean harder on economy, hence the higher leftover biomass). Any FURTHER drift is unintended.
//
// Re-pinned 2026-07 for ENEMY GAITS (docs/ENEMIES.md §gaits): enemies now carry a per-kind
// LOCOMOTION pattern over the steering blend — duty-cycle speed pulses (lunges/skitters/pounces),
// coherent perpendicular weaves, flank entries. This is a DELIBERATE gameplay change (the roster
// finally MOVES differently per kind). Pulses are authored to average ×1 (guardrail-tested), so
// the run structure held exactly: **wave (12), kills (196), and the 'won' outcome are IDENTICAL
// on every seed** — only integrity/biomass moved (rhythm shifts kill timing at the margins; three
// seeds kept their integrity to the point). Any FURTHER drift is unintended.
// Re-pinned 2026-07 for TOWER IDLE POSTURES (docs/TOWER-IDLE.md): every tower now runs a
// SECONDARY BEHAVIOR while nothing is engageable — a DELIBERATE gameplay change for the whole
// roster ("a tower should never feel asleep"). Autoplay fields needle/mortar/reactor, so the
// drift comes from three behaviors: Spindle Tension (needle's charged opening volley), Ranged
// Solution (mortar's heavier plotted opener) and Systolic Reserve (the reactor mending the
// Hive between threats). The run structure held exactly: **wave (12), kills (196), and the
// 'won' outcome are IDENTICAL on every seed** — integrity only IMPROVED or held (openers land
// earlier kills, the reactor mends chip damage; seeds 42/777/12345 gained 9–12) and biomass
// moved a few percent from kill-timing shifts. The `disableIdle` block below pins the ENTIRE
// pre-idle baseline — the layer is proven cleanly gated, so any drift THERE is a real
// regression in untouched sim code. Any FURTHER drift here is unintended.
const GOLDEN: Record<number, { wave: number; kills: number; integrity: number; biomass: number; phase: string }> = {
  1: { wave: 12, kills: 196, integrity: 145, biomass: 10194, phase: 'won' },
  7: { wave: 12, kills: 196, integrity: 215, biomass: 9241, phase: 'won' },
  42: { wave: 12, kills: 196, integrity: 170, biomass: 8480, phase: 'won' },
  777: { wave: 12, kills: 196, integrity: 170, biomass: 9343, phase: 'won' },
  2024: { wave: 12, kills: 196, integrity: 100, biomass: 13477, phase: 'won' },
  12345: { wave: 12, kills: 196, integrity: 100, biomass: 9455, phase: 'won' },
};

/** The PRE-IDLE baseline (the pins as they stood before TOWER-IDLE.md), reproduced exactly
 *  under RunOptions.disableIdle — the isolation contract: the idle layer, switched off, is
 *  byte-invisible. If THIS block drifts, untouched sim code changed. */
const GOLDEN_LEGACY: Record<number, { wave: number; kills: number; integrity: number; biomass: number; phase: string }> = {
  1: { wave: 12, kills: 196, integrity: 145, biomass: 10131, phase: 'won' },
  7: { wave: 12, kills: 196, integrity: 212, biomass: 9291, phase: 'won' },
  42: { wave: 12, kills: 196, integrity: 161, biomass: 8514, phase: 'won' },
  777: { wave: 12, kills: 196, integrity: 158, biomass: 9360, phase: 'won' },
  2024: { wave: 12, kills: 196, integrity: 100, biomass: 12994, phase: 'won' },
  12345: { wave: 12, kills: 196, integrity: 94, biomass: 9349, phase: 'won' },
};

describe('golden outcomes (gameplay must not drift)', () => {
  for (const [seedStr, expected] of Object.entries(GOLDEN)) {
    it(`seed ${seedStr}`, () => {
      const o = autoplay(Number(seedStr));
      expect({ wave: o.wave, kills: o.kills, integrity: o.integrity, biomass: o.biomass, phase: o.phase }).toEqual(expected);
    });
  }
});

describe('golden isolation (disableIdle reproduces the pre-idle sim exactly)', () => {
  for (const [seedStr, expected] of Object.entries(GOLDEN_LEGACY)) {
    it(`seed ${seedStr} (legacy)`, () => {
      const o = autoplay(Number(seedStr), 600, { disableIdle: true });
      expect({ wave: o.wave, kills: o.kills, integrity: o.integrity, biomass: o.biomass, phase: o.phase }).toEqual(expected);
    });
  }
});
