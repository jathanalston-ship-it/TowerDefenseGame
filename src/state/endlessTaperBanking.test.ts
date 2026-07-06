// Infinite depth-camping taper — banking integration (docs/MODE-IDENTITY.md §anti-grind).
// Proves the taper is WIRED through the real meta layer: live loot banking (syncRunLoot) and
// run-end Mastery XP (finishRun) both diminish deep in ENDLESS only, the meter stays monotonic
// (never rolls back), and every non-endless / shallow path is byte-identical (taper = ×1).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { meta } from './meta';
import type { RunResult } from './meta';
import { HERO_ORDER, TOWER_ORDER, endlessTaper } from '../core/config';
import { Rng } from '../core/rng';
import { defaultLifetimeStats } from '../save/saveStore';
import type { RunStats } from '../core/types';

/** Deterministic loot rolls: pin Math.random to the repo PRNG so container counts are reproducible. */
function seedRandom(seed: number): () => void {
  const rng = new Rng(seed);
  const spy = vi.spyOn(Math, 'random').mockImplementation(() => rng.next());
  return () => spy.mockRestore();
}

/** Bank a full endless/flat run wave-by-wave; return containers gained + assert monotonic meter. */
function bankRun(endless: boolean, maxWave: number, killsPerWave: number): number {
  const before = meta.pendingContainers().length;
  let prev = before;
  for (let w = 1; w <= maxWave; w++) {
    meta.syncRunLoot(w, w * killsPerWave, endless);
    const now = meta.pendingContainers().length;
    expect(now).toBeGreaterThanOrEqual(prev); // meter NEVER rolls back (monotonic banking)
    prev = now;
  }
  return meta.pendingContainers().length - before;
}

function endlessResult(wave: number, towerKills: number): RunResult {
  const zero = { kills: 0, damage: 0, activeTime: 0 };
  const mastery = TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['mastery'];
  mastery[TOWER_ORDER[0]] = { kills: towerKills, damage: 5000, activeTime: 300 }; // real accrual to bank
  const heroMastery = HERO_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['heroMastery'];
  const stats: RunStats = {
    kills: towerKills, wave, won: false, biomassEarned: 0, damageDealt: 5000, integrityLost: 0,
    killsByEnemy: defaultLifetimeStats().killsByEnemy,
    towerBuilds: TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: 0 }), {}) as RunStats['towerBuilds'],
    cardIds: [], heroId: HERO_ORDER[0],
  };
  return { wave, kills: towerKills, won: false, endless: true, mastery, heroMastery, stats };
}

describe('endless taper — live loot banking (syncRunLoot)', () => {
  afterEach(() => meta.reset());

  // Each compared run starts from a FRESH meter (reset) with an identical RNG stream (same seed), so
  // the only variable is the taper. (The loot queue persists across runs, so a shared-state sequence
  // would confound the container counts.)
  function freshRun(seed: number, endless: boolean, maxWave: number, killsPerWave: number): number {
    meta.reset();
    const restore = seedRandom(seed);
    try { return bankRun(endless, maxWave, killsPerWave); } finally { restore(); }
  }

  it('a DEEP endless run banks fewer containers than the same flat run (taper wired in)', () => {
    const flat = freshRun(0x10c, false, 70, 50); // non-endless: no taper (baseline)
    const endless = freshRun(0x10c, true, 70, 50); // endless: depth-camping taper bites past startWave
    expect(endless).toBeLessThan(flat); // deep camping banks visibly LESS meter
  });

  it('is byte-identical for SHALLOW endless (≤ startWave) and for non-endless', () => {
    // Wave 25 sits under ENDLESS_TAPER.startWave, so the endless flag must change nothing there.
    const flat = freshRun(0x2ea, false, 25, 40);
    const shallowEndless = freshRun(0x2ea, true, 25, 40); // identical points ⇒ identical container count
    expect(shallowEndless).toBe(flat);
  });

  it('within a wave, banking is monotonic as kills climb (no negative delta)', () => {
    const restore = seedRandom(0x3c0);
    try {
      meta.reset();
      let prev = 0;
      for (let k = 0; k <= 4000; k += 200) {
        meta.syncRunLoot(60, k, true); // fixed deep wave, rising kills
        const now = meta.pendingContainers().length;
        expect(now).toBeGreaterThanOrEqual(prev);
        prev = now;
      }
    } finally { restore(); }
  });
});

describe('endless taper — run-end Mastery XP (finishRun)', () => {
  afterEach(() => meta.reset());

  it('a deep endless run banks LESS Mastery XP than a shallow one for the SAME accrual', () => {
    const restore = seedRandom(0x4b0);
    try {
      meta.reset();
      const shallow = meta.finishRun(endlessResult(30, 400)).mastery[TOWER_ORDER[0]].xpGained; // taper = 1
      meta.reset();
      const deep = meta.finishRun(endlessResult(50, 400)).mastery[TOWER_ORDER[0]].xpGained; // taper < 1
      expect(deep).toBeLessThan(shallow);
      expect(deep / shallow).toBeCloseTo(endlessTaper(50), 2); // exactly the per-wave taper at the final wave
    } finally { restore(); }
  });
});
