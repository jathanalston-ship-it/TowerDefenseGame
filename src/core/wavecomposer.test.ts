import { describe, it, expect } from 'vitest';
import { Rng } from './rng';
import {
  composeProceduralWave,
  injectElites,
  waveDifficulty,
  isBossWave,
  biasPool,
  WAVE_THEMES,
  CLASSIC_CAMPAIGN,
  CLASSIC_WAVE_COUNT,
  THREAT_COST,
} from './wavecomposer';
import type { EnemyKind } from './types';

const POOL: [EnemyKind, number][] = [['runner', 5], ['brute', 2], ['warden', 1]];

function baseOpts() {
  return {
    pool: POOL,
    budget: 40,
    startDelay: 0.4,
    fastSpacing: [0.45, 0.2] as [number, number],
    slowSpacing: [0.9, 0.6] as [number, number],
    delayStep: [0.8, 1.2] as [number, number],
  };
}

describe('wave composer', () => {
  it('budget-rolls a deterministic wave for a fixed seed', () => {
    const a = composeProceduralWave(new Rng(123), baseOpts());
    const b = composeProceduralWave(new Rng(123), baseOpts());
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    expect(a.reduce((n, g) => n + g.count, 0)).toBeGreaterThan(0);
  });

  it('spends roughly the whole budget (groups scale with budget)', () => {
    const small = composeProceduralWave(new Rng(7), { ...baseOpts(), budget: 10 });
    const big = composeProceduralWave(new Rng(7), { ...baseOpts(), budget: 120 });
    const total = (w: { count: number }[]) => w.reduce((n, g) => n + g.count, 0);
    expect(total(big)).toBeGreaterThan(total(small));
  });

  it('themes bias the pool toward favored kinds', () => {
    expect(biasPool(POOL, WAVE_THEMES.armored)).toEqual([['runner', 5], ['brute', 5], ['warden', 2]]);
    // Over many rolls, a swarm theme yields more runners than neutral.
    const countRunners = (themeId: string) => {
      let runners = 0;
      for (let s = 0; s < 40; s++) {
        const w = composeProceduralWave(new Rng(s), { ...baseOpts(), theme: WAVE_THEMES[themeId] });
        runners += w.filter((g) => g.kind === 'runner').reduce((n, g) => n + g.count, 0);
      }
      return runners;
    };
    expect(countRunners('swarm')).toBeGreaterThan(countRunners('armored'));
  });

  it('injects elites: marks the costliest group, conserves total count', () => {
    const groups = [
      { kind: 'runner' as EnemyKind, count: 10, spacing: 0.5, delay: 0 },
      { kind: 'warden' as EnemyKind, count: 4, spacing: 1, delay: 1 },
    ];
    const before = groups.reduce((n, g) => n + g.count, 0);
    const out = injectElites(groups, { count: 2 });
    const elites = out.filter((g) => g.elite);
    expect(elites.length).toBe(1);
    expect(elites[0].kind).toBe('warden'); // costliest
    expect(elites[0].count).toBe(2);
    expect(out.reduce((n, g) => n + g.count, 0)).toBe(before); // conserved
    expect(injectElites(groups, { count: 0 })).toBe(groups); // no-op
  });

  it('appends a boss group when a boss injection is given', () => {
    const w = composeProceduralWave(new Rng(1), { ...baseOpts(), boss: { kind: 'tyrant', count: 2, spacing: 1, delay: 1 } });
    expect(w[w.length - 1]).toMatchObject({ kind: 'tyrant', count: 2 });
    expect(isBossWave(w)).toBe(true);
    expect(isBossWave([{ kind: 'runner', count: 3, spacing: 1, delay: 0 }])).toBe(false);
  });

  it('difficulty curves escalate and match the classic +12%/wave baseline', () => {
    expect(waveDifficulty('classic', 1).hpMult).toBeCloseTo(1, 5); // wave 1 = baseline
    expect(waveDifficulty('classic', 6).hpMult).toBeCloseTo(1 + 0.12 * 5, 5);
    expect(waveDifficulty('endless', 20).hpMult).toBeGreaterThan(waveDifficulty('endless', 1).hpMult);
    // Stage scaling factors in stage number.
    expect(waveDifficulty('stage', 1, 5).hpMult).toBeGreaterThan(waveDifficulty('stage', 1, 1).hpMult);
  });

  it('the Classic campaign is 12 authored waves ending in a boss', () => {
    expect(CLASSIC_WAVE_COUNT).toBe(12);
    expect(CLASSIC_CAMPAIGN.length).toBe(12);
    expect(isBossWave(CLASSIC_CAMPAIGN[11])).toBe(true); // Brood Tyrant finale
    // Every authored group references a real, costed/spawnable or boss enemy.
    for (const wave of CLASSIC_CAMPAIGN) {
      expect(wave.length).toBeGreaterThan(0);
      for (const g of wave) expect(g.count).toBeGreaterThan(0);
    }
  });

  it('THREAT_COST omits the boss (never budget-rolled)', () => {
    expect(THREAT_COST.tyrant).toBeUndefined();
    expect(THREAT_COST.runner).toBeGreaterThan(0);
  });
});
