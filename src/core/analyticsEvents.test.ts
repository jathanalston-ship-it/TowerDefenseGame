// analyticsEvents — pins the unified event contract (docs/ANALYTICS.md §events): the
// registry stays coherent, validation rejects exactly the junk shapes, and the session
// folds keep hot signals O(1) — the performance contract the whole platform stands on.

import { describe, expect, it } from 'vitest';
import {
  AN_EVENTS, AN_EVENT_BY_KIND, AN_LIMITS, analyticsRegistryProblems, batchProblem, drainFlow,
  errorHash, eventProblem, foldFlow, fpsSample, fpsSummary, heatCell, newFpsAccumulator, waveBand,
} from './analyticsEvents';
import type { AnBatch, AnEvent } from './analyticsEvents';

const ev = (over: Partial<AnEvent>): AnEvent => ({ k: 'nav', at: 1_700_000_000_000, d: 'home', v: 120, ...over });

describe('registry — one row per event, fully coherent', () => {
  it('has no structural problems and covers the mandated surface', () => {
    expect(analyticsRegistryProblems()).toEqual([]);
    // The spec's headline lanes all exist (sessions, screens, runs, towers, heroes,
    // economy, perf, errors, money, experiments).
    for (const k of ['ses_start', 'ses_end', 'nav', 'heat', 'run_end', 'run_loss', 'tw_field', 'tw_win',
      'hero_pick', 'ability', 'cur_gain', 'cur_spend', 'box_open', 'idle_collect', 'fps', 'load',
      'err', 'buy', 'ad', 'ab_assign', 'tut', 'notif', 'quit_loc', 'power', 'rank', 'unlock']) {
      expect(AN_EVENT_BY_KIND[k], k).toBeDefined();
    }
    expect(AN_EVENTS.length).toBeGreaterThanOrEqual(30);
  });
});

describe('eventProblem — reject junk, accept the contract', () => {
  it('validates dims, values, extras per registry row', () => {
    expect(eventProblem(ev({}))).toBeNull();
    expect(eventProblem(ev({ k: 'nope' }))).toBe('unknown-kind');
    expect(eventProblem(ev({ d: 'Bad Dim!' }))).toBe('bad-dim');
    expect(eventProblem(ev({ k: 'ses_ping', d: 'x', v: undefined }))).toBe('unexpected-dim');
    expect(eventProblem(ev({ v: -1 }))).toBe('bad-value');
    expect(eventProblem(ev({ v: 3.5 }))).toBe('bad-value');
    expect(eventProblem({ k: 'ses_ping', at: 1 })).toBeNull();
    expect(eventProblem({ k: 'ses_ping', at: 1, v: 5 })).toBe('unexpected-value');
    // Extras only where declared, keys allowlisted, strings capped.
    expect(eventProblem({ k: 'nav', at: 1, d: 'home', v: 1, x: { a: 1 } })).toBe('unexpected-extras');
    expect(eventProblem({ k: 'err', at: 1, d: 'eabc', x: { msg: 'boom', stack: 'x' } })).toBeNull();
    expect(eventProblem({ k: 'err', at: 1, d: 'eabc', x: { nope: 'x' } })).toBe('unknown-extra');
    expect(eventProblem({ k: 'err', at: 1, d: 'eabc', x: { msg: 'x'.repeat(500) } })).toBe('extra-too-long');
    expect(eventProblem(ev({ sc: 'BAD SCREEN' }))).toBe('bad-screen');
  });

  it('batch envelope enforces counts and context shape', () => {
    const base: AnBatch = {
      playerId: 'p', session: 's'.repeat(12), platform: 'web', ver: '1.0.0', lang: 'en',
      power: 100, stage: 3, events: [ev({})],
    };
    expect(batchProblem(base)).toBeNull();
    expect(batchProblem({ ...base, events: [] })).toBe('empty');
    expect(batchProblem({ ...base, events: new Array(AN_LIMITS.batchEvents + 1).fill(ev({})) })).toBe('too-many-events');
    expect(batchProblem({ ...base, session: 'x' })).toBe('bad-session');
  });
});

describe('session folds — hot signals never leave raw', () => {
  it('heatCell buckets the plane into the fixed grid', () => {
    expect(heatCell(0, 0)).toBe(0);
    expect(heatCell(0.999, 0.999)).toBe(95);
    expect(heatCell(-1, 2)).toBe(84); // clamped into the grid
  });

  it('fps accumulator: O(1) buckets, sane summary, noise guard', () => {
    const acc = newFpsAccumulator();
    expect(fpsSummary(acc)).toBeNull(); // too few frames
    for (let i = 0; i < 1000; i++) fpsSample(acc, 1 / 60);
    for (let i = 0; i < 10; i++) fpsSample(acc, 1 / 10); // a few hitches
    fpsSample(acc, 5); // suspend gap — ignored
    const s = fpsSummary(acc)!;
    expect(s.avg10).toBeGreaterThan(550);
    expect(s.p01x10).toBeLessThanOrEqual(600);
    expect(s.p99x10).toBe(600);
  });

  it('currency folds sum per dimension and drain to few events', () => {
    const fold = new Map<string, number>();
    for (let i = 0; i < 500; i++) foldFlow(fold, 'cores:run', 10);
    foldFlow(fold, 'ichor:achievement', 3);
    foldFlow(fold, 'BAD DIM', 5); // dropped
    const events = drainFlow(fold, 'cur_gain', 1);
    expect(events).toHaveLength(2);
    expect(events.find((e) => e.d === 'cores:run')?.v).toBe(5_000);
    expect(fold.size).toBe(0);
    for (const e of events) expect(eventProblem(e)).toBeNull();
  });

  it('errorHash is stable and waveBand keeps loss dims bounded', () => {
    expect(errorHash('boom', 'at x')).toBe(errorHash('boom', 'at x'));
    expect(errorHash('boom', 'at x')).not.toBe(errorHash('boom', 'at y'));
    expect(waveBand(1)).toBe('w1-5');
    expect(waveBand(5)).toBe('w1-5');
    expect(waveBand(6)).toBe('w6-10');
    expect(waveBand(37)).toBe('w36-40');
  });
});
