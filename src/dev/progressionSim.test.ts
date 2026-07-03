// Progression simulator — CI guardrails (small matrix; the full hour-band report comes from
// scripts/sim-progression.ts → docs/PROGRESSION_REPORT.md). Two tiers:
//   • detector units — the problem detectors fire on synthetic pathological traces;
//   • a LIVE mini-simulation over the real meta layer — structural facts that must hold at
//     any tuning: progression happens, the loop alternates, and no dead zones / wall stalls /
//     sink explosions appear in the early game.
// Pacing judgments (how FAST is right) are deliberately NOT asserted — that's design's call,
// made on the generated report (docs/PROGRESSION-LOOP.md §time).

import { describe, it, expect, afterAll, vi } from 'vitest';
import { detectProblems, simulateAccount } from './progressionSim';
import type { SimCheckpoint } from './progressionSim';
import { meta } from '../state/meta';
import { Rng } from '../core/rng';

function cp(p: Partial<SimCheckpoint> & { hours: number }): SimCheckpoint {
  return { power: 1000, stage: 1, bestWave: 5, molts: 0, runs: 1, farmRuns: 0, readiness: 1, unspentShards: 0, unlocks: 0, failedPushes: 0, ...p };
}

describe('problem detectors (synthetic traces)', () => {
  it('flags dead progression: farming that moves no power', () => {
    const f = detectProblems([
      cp({ hours: 10, power: 5000, farmRuns: 0 }),
      cp({ hours: 50, power: 5010, farmRuns: 40 }), // 40 farm runs, +0.2% power
    ]);
    expect(f.deadProgression).toEqual(['10h→50h']);
  });

  it('flags a wall stall: same frontier, readiness flat, farming the whole band', () => {
    const f = detectProblems([
      cp({ hours: 10, stage: 30, readiness: 0.8, farmRuns: 0, power: 5000 }),
      cp({ hours: 50, stage: 30, readiness: 0.8, farmRuns: 40, power: 6000 }),
    ]);
    expect(f.wallStall).toEqual(['10h→50h']);
  });

  it('flags power spikes and sink exhaustion', () => {
    const f = detectProblems([
      cp({ hours: 10, power: 1000, unspentShards: 8000 }),
      cp({ hours: 50, power: 9000, unspentShards: 20000 }), // ×9 jump + shards doubling with nothing to buy
    ]);
    expect(f.powerSpike).toEqual(['10h→50h']);
    expect(f.sinkExhaustion).toEqual(['10h→50h']);
  });
});

describe('live mini-simulation (real meta layer)', () => {
  afterAll(() => meta.reset()); // leave a clean account for whatever runs next

  it('the loop functions: progression moves, both phases occur, no structural pathologies', () => {
    // The meta loot layer rolls unseeded Math.random, so an unlucky account occasionally
    // tripped a detector and flaked CI. Pin it to the repo's seeded PRNG: CI asserts ONE
    // reproducible account; luck-variance exploration belongs to `npm run sim:report`.
    const lootRng = new Rng(0x51ce);
    const rnd = vi.spyOn(Math, 'random').mockImplementation(() => lootRng.next());
    try {
    const trace = simulateAccount(0xc0ffee, [5, 15, 30]);
    const last = trace.checkpoints[trace.checkpoints.length - 1];
    expect(trace.checkpoints.length).toBe(3);
    expect(last.stage).toBeGreaterThan(3); // campaign advances
    expect(last.bestWave).toBeGreaterThan(5); // infinite record advances
    expect(last.farmRuns).toBeGreaterThan(0); // the wall formed and was farmed …
    expect(last.runs - last.farmRuns).toBeGreaterThan(0); // … and campaign was pushed
    expect(last.power).toBeGreaterThan(trace.checkpoints[0].power); // power compounds
    // Structural non-negotiables (the player-experience contract):
    expect(trace.flags.deadProgression).toEqual([]);
    expect(trace.flags.wallStall).toEqual([]);
    expect(trace.flags.sinkExhaustion).toEqual([]);
    // PACING ENVELOPE (BALANCE_ARCHITECTURE.md §5 — tuned 2026-07, WORLD-model-relative):
    // coarse CI-scale bounds so a future content/economy change that re-opens the molt
    // spiral, freezes the prestige gate, or softens the requirement curve trips loudly.
    const early = trace.checkpoints[0]; // ~5h
    expect(early.molts).toBeLessThanOrEqual(6); // the pre-tune spiral produced 15+ here
    expect(last.molts).toBeGreaterThanOrEqual(2); // …but the milestone gate must not freeze early
    expect(last.molts).toBeLessThanOrEqual(30);
    expect(last.stage).toBeLessThanOrEqual(130); // the requirement curve still bites at CI scale
    } finally {
      rnd.mockRestore();
    }
  }, 60_000);
});
