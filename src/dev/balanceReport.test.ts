// The permanent simulation framework's CI pins (docs/SIMULATION-FRAMEWORK.md): the persona
// matrix runs live against the REAL meta layer and differentiates player types; the
// bottleneck detectors fire deterministically on synthetic traces; the report renders
// report-only language with every required field. Balance NUMBERS are pinned elsewhere
// (progressionSim.test.ts pacing envelope) — this file pins the INSTRUMENT.

import { describe, it, expect } from 'vitest';
import { detectBottlenecks, diagnose, renderReport, runMatrix } from './balanceReport';
import type { Bottleneck, PersonaRun } from './balanceReport';
import { PERSONAS, PERSONA_IDS } from './personas';
import type { SimCheckpoint } from './progressionSim';

function mkCp(p: Partial<SimCheckpoint> & { hours: number }): SimCheckpoint {
  return { power: 100, stage: 5, bestWave: 20, molts: 0, runs: 10, farmRuns: 5, readiness: 0.5, unspentShards: 100, unlocks: 10, failedPushes: 0, ...p };
}

function mkRun(personaId: string, cps: SimCheckpoint[][]): PersonaRun {
  return { persona: { ...PERSONAS.efficient, id: personaId, name: personaId }, traces: cps.map((c, i) => ({ seed: i, checkpoints: c, flags: { deadProgression: [], wallStall: [], powerSpike: [], sinkExhaustion: [] } })) };
}

describe('persona roster', () => {
  it('ships every spec persona; efficient is the loop-faithful baseline', () => {
    for (const id of ['fresh', 'average', 'efficient', 'unlucky', 'lucky', 'completionist', 'infinite', 'campaign', 'heroes', 'towers', 'equipment']) {
      expect(PERSONA_IDS).toContain(id);
    }
    const e = PERSONAS.efficient;
    expect([e.luck, e.spendSkip, e.farmAnyway, e.pushRisk]).toEqual([1, 0, 0, 0]);
  });
});

describe('live matrix (real meta layer, small bands)', () => {
  // STRUCTURAL facts only — the meta loot layer rolls stochastically, so pacing/power
  // comparisons belong to the generated report's multi-seed medians, never to CI.
  it('runs personas end-to-end: fresh caps its horizon; loop-faithful never fails a push; the dopamine ledger is monotonic', () => {
    const runs = runMatrix([10, 25], [1], [PERSONAS.efficient, PERSONAS.unlucky, PERSONAS.fresh]);
    const final = (id: string): SimCheckpoint => {
      const t = runs.find((r) => r.persona.id === id)!.traces[0];
      return t.checkpoints[t.checkpoints.length - 1];
    };
    expect(final('fresh').hours).toBe(10); // maxHours caps the fresh horizon
    expect(final('unlucky').hours).toBe(25); // unbounded personas run the full band
    expect(final('efficient').failedPushes).toBe(0); // loop-faithful never pushes under-ready
    for (const r of runs) {
      const cps = r.traces[0].checkpoints;
      expect(cps[0].unlocks).toBeGreaterThan(0); // acquisitions land in the first band
      expect(cps[0].power).toBeGreaterThan(0);
      for (let i = 1; i < cps.length; i++) expect(cps[i].unlocks).toBeGreaterThanOrEqual(cps[i - 1].unlocks);
    }
  }, 120_000);
});

describe('bottleneck detectors (synthetic traces — deterministic)', () => {
  it('fires wall-stall + currency-shortage on a stuck-and-broke band, ranked by score', () => {
    const a = mkCp({ hours: 10, stage: 8, readiness: 0.4, farmRuns: 5, unspentShards: 20, runs: 10 });
    const b = mkCp({ hours: 50, stage: 8, readiness: 0.4, farmRuns: 25, unspentShards: 10, runs: 40, power: 120, unlocks: 40 });
    const found = detectBottlenecks([mkRun('average', [[a, b], [a, b]])]);
    const kinds = found.map((x) => x.kind);
    expect(kinds).toContain('wall-stall');
    expect(kinds).toContain('currency-shortage');
    const wall = found.find((x) => x.kind === 'wall-stall')!;
    expect(wall.frequency).toBe(1); // both seeds hit it
    expect(wall.severity).toBe('critical');
    expect(found[0].score).toBeGreaterThanOrEqual(found[found.length - 1].score); // sorted
  });

  it('fires dopamine-gap when acquisitions collapse and push-futility on failed pushes', () => {
    const a = mkCp({ hours: 50, unlocks: 100, runs: 50, failedPushes: 0 });
    const b = mkCp({ hours: 150, unlocks: 110, runs: 90, failedPushes: 6, power: 900, stage: 9 });
    const kinds = detectBottlenecks([mkRun('campaign', [[a, b]])]).map((x) => x.kind);
    expect(kinds).toContain('dopamine-gap'); // 10 acquisitions / 100h < 0.5/h
    expect(kinds).toContain('push-futility');
  });

  it('stays silent on a healthy band', () => {
    const a = mkCp({ hours: 10, power: 100, stage: 6, unlocks: 30, readiness: 0.4 });
    const b = mkCp({ hours: 50, power: 400, stage: 14, unlocks: 90, readiness: 0.6, runs: 40, farmRuns: 20, unspentShards: 300 });
    expect(detectBottlenecks([mkRun('average', [[a, b]])])).toEqual([]);
  });

  it('power-spike is cohort-relative: only the seed leaping past its cohort median flags', () => {
    const mk = (p0: number, p1: number): SimCheckpoint[] => [
      mkCp({ hours: 150, power: p0, stage: 20, unlocks: 100, readiness: 0.5 }),
      mkCp({ hours: 400, power: p1, stage: 40, unlocks: 260, readiness: 0.6, runs: 300, farmRuns: 150, unspentShards: 200 }),
    ];
    // Whole cohort grows ×10 (the curve): silent — that IS the ramp, not a spike.
    expect(detectBottlenecks([mkRun('average', [mk(100, 1000), mk(100, 1000), mk(100, 1000)])])
      .filter((x) => x.kind === 'power-spike')).toEqual([]);
    // One seed leaps ×30 while the cohort medians ×3: the outlier flags.
    const found = detectBottlenecks([mkRun('average', [mk(100, 300), mk(100, 300), mk(100, 3000)])])
      .filter((x) => x.kind === 'power-spike');
    expect(found.length).toBe(1);
    expect(found[0].evidence).toContain('cohort median');
  });
});

describe('diagnosis + report rendering (report-only by construction)', () => {
  it('every bottleneck kind carries a full human-review diagnosis', () => {
    for (const kind of ['dead-zone', 'wall-stall', 'dopamine-gap', 'sink-exhaustion', 'currency-shortage', 'power-spike', 'grind-saturation', 'push-futility'] as const) {
      const d = diagnose(kind);
      expect(d.rootCause.length).toBeGreaterThan(20);
      expect(d.systems.length).toBeGreaterThan(5);
      expect(d.fixes.length).toBeGreaterThanOrEqual(2);
      expect(['Low', 'Medium', 'High']).toContain(d.difficulty);
    }
  });

  it('renders the report with methodology, personas, pacing, and top-20 cap', () => {
    const a = mkCp({ hours: 10, stage: 8, readiness: 0.4, farmRuns: 5, unspentShards: 20 });
    const b = mkCp({ hours: 50, stage: 8, readiness: 0.4, farmRuns: 25, unspentShards: 10, runs: 40, unlocks: 12 });
    const runs = [mkRun('average', [[a, b]])];
    const found: Bottleneck[] = detectBottlenecks(runs);
    const md = renderReport(runs, found, { bands: [10, 50], seeds: [1], generatedAt: 'test' });
    expect(md).toContain('Report-only');
    expect(md).toContain('## Top progression bottlenecks');
    expect(md).toContain('Estimated player frustration');
    expect(md).toContain('Estimated implementation difficulty');
    expect(md).toContain('## Methodology');
    expect((md.match(/^### \d+\./gm) ?? []).length).toBeLessThanOrEqual(20);
  });
});
