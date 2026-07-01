// Run Identity invariants (docs/RUN-IDENTITY.md): the plan is pure + deterministic, EMPTY in Stage
// mode (golden-safe), varies across seeds, respects budget/cooldown/minWave, draws OUT-of-biome
// invasions, and merges the anomaly into every wave.

import { describe, it, expect } from 'vitest';
import { ENEMY_KINDS } from './config';
import type { EnemyKind } from './types';
import {
  RUN_ANOMALIES, RUN_EVENTS, generateRunPlan, planForWave,
} from './runEvents';
import type { RunPlanCtx } from './runEvents';

const POOL = ENEMY_KINDS as EnemyKind[];
const campaign = (over: Partial<RunPlanCtx> = {}): RunPlanCtx => ({ mode: 'campaign', waveCount: 12, reserveFinale: true, invasionPool: POOL, ...over });

describe('run plan — determinism + golden-safety', () => {
  it('is EMPTY in Stage mode (the golden path never drifts)', () => {
    const plan = generateRunPlan(12345, { mode: 'stage', waveCount: 12 });
    expect(plan.anomaly).toBeNull();
    expect(plan.events).toEqual([]);
    expect(plan.headline).toBe('');
  });

  it('is deterministic in (seed, ctx)', () => {
    const a = generateRunPlan(777, campaign());
    const b = generateRunPlan(777, campaign());
    expect(a.anomaly?.id).toBe(b.anomaly?.id);
    expect(a.events.map((e) => [e.wave, e.def.id, e.injectKind])).toEqual(b.events.map((e) => [e.wave, e.def.id, e.injectKind]));
    expect(a.headline).toBe(b.headline);
  });

  it('varies across seeds (runs get distinct fingerprints)', () => {
    const sigs = new Set<string>();
    for (let s = 1; s <= 60; s++) {
      const p = generateRunPlan(s, campaign());
      sigs.add(`${p.anomaly?.id ?? '-'}|${p.events.map((e) => `${e.wave}:${e.def.id}`).join(',')}`);
    }
    expect(sigs.size).toBeGreaterThan(30); // most of 60 seeds are unique run identities
  });
});

describe('run plan — budget, spacing, gating', () => {
  it('respects the per-run event budget and a no-back-to-back cooldown', () => {
    for (let s = 1; s <= 40; s++) {
      const p = generateRunPlan(s, campaign());
      expect(p.events.length).toBeLessThanOrEqual(Math.max(1, Math.round(12 / 4)));
      const waves = p.events.map((e) => e.wave).sort((a, b) => a - b);
      for (let i = 1; i < waves.length; i++) expect(waves[i] - waves[i - 1]).toBeGreaterThanOrEqual(2);
      for (const e of p.events) {
        expect(e.wave).toBeGreaterThanOrEqual(e.def.minWave); // minWave honoured
        expect(e.wave).toBeLessThanOrEqual(11); // reserveFinale ⇒ never the wave-12 boss wave
      }
    }
  });

  it('draws Rare Invasion kinds from OUTSIDE the biome signature', () => {
    const signature: EnemyKind[] = [POOL[0], POOL[1]];
    for (let s = 1; s <= 120; s++) {
      const p = generateRunPlan(s, campaign({ biomeSignature: signature }));
      for (const e of p.events) {
        if (e.def.needsInvasionKind) {
          expect(e.injectKind).toBeDefined();
          expect(signature).not.toContain(e.injectKind!); // genuinely out-of-range
          expect(POOL).toContain(e.injectKind!);
        }
      }
    }
  });

  it('gives roughly half of runs a headline anomaly (not all, not none)', () => {
    let withAnomaly = 0;
    const N = 200;
    for (let s = 1; s <= N; s++) if (generateRunPlan(s, campaign()).anomaly) withAnomaly++;
    expect(withAnomaly).toBeGreaterThan(N * 0.3);
    expect(withAnomaly).toBeLessThan(N * 0.7);
  });
});

describe('planForWave — anomaly folds into every wave', () => {
  it('merges an event with the run-wide anomaly (mults multiply, chances max)', () => {
    // Force a known shape by finding a seed with both an anomaly and at least one event.
    let plan = generateRunPlan(1, campaign());
    for (let s = 1; s <= 500 && !(plan.anomaly && plan.events.length); s++) plan = generateRunPlan(s, campaign());
    expect(plan.anomaly).not.toBeNull();
    expect(plan.events.length).toBeGreaterThan(0);
    const ev = plan.events[0];
    const merged = planForWave(plan, ev.wave).effect;
    // A wave with an event returns that event's identity plus the anomaly's fold.
    expect(planForWave(plan, ev.wave).event?.def.id).toBe(ev.def.id);
    // Bounty on an event wave is at least the event's own (anomaly can only raise it).
    if (ev.def.effect.bountyMult) expect(merged.bountyMult ?? 1).toBeGreaterThanOrEqual(ev.def.effect.bountyMult);
    // A plain wave still carries the anomaly's fold (identity felt all run).
    const plain = [...Array(12).keys()].map((w) => w + 1).find((w) => !plan.byWave.has(w))!;
    const plainEff = planForWave(plan, plain).effect;
    expect(planForWave(plan, plain).event).toBeNull();
    const a = plan.anomaly!.everyWave;
    if (a.bountyMult) expect(plainEff.bountyMult).toBeCloseTo(a.bountyMult, 5);
    if (a.eliteChance) expect(plainEff.eliteChance).toBeCloseTo(a.eliteChance, 5);
  });
});

describe('catalog integrity', () => {
  it('event + anomaly ids are unique and effects are non-trivial', () => {
    const ids = [...RUN_EVENTS.map((e) => e.id), ...RUN_ANOMALIES.map((a) => a.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of RUN_EVENTS) { expect(e.weight).toBeGreaterThan(0); expect(Object.keys(e.effect).length).toBeGreaterThan(0); }
    for (const a of RUN_ANOMALIES) expect(Object.keys(a.everyWave).length).toBeGreaterThan(0);
  });
});
