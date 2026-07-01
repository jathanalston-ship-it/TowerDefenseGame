// The EXTENDED difficulty framework (docs/DIFFICULTY.md): every preset carries both threat and
// economy scalars, `standard` is full identity (golden-safe), and both curves rise monotonically
// easy→hard so a harder track is always a genuine risk/reward trade.

import { describe, it, expect } from 'vitest';
import { DIFFICULTIES, DIFFICULTY_IDS, STANDARD, resolveDifficulty } from './difficulty';

const THREAT = ['enemyHealthMult', 'enemyDamageMult', 'enemySpeedMult', 'spawnRateMult', 'eliteChanceMult', 'bossFrequencyMult'] as const;
const ECON = ['rewardMult', 'xpMult', 'lootQualityMult', 'containerRateMult', 'equipQualityMult', 'powerTargetMult'] as const;

describe('extended difficulty', () => {
  it('standard is full identity across ALL levers (golden-safe)', () => {
    for (const k of [...THREAT, ...ECON]) expect(STANDARD[k]).toBe(1);
  });

  it('every preset defines every lever as a positive finite number', () => {
    for (const id of DIFFICULTY_IDS) {
      const d = DIFFICULTIES[id];
      for (const k of [...THREAT, ...ECON]) {
        expect(Number.isFinite(d[k])).toBe(true);
        expect(d[k]).toBeGreaterThan(0);
      }
    }
  });

  it('pickers are ordered easy → hard', () => {
    expect(DIFFICULTY_IDS).toEqual(['relaxed', 'standard', 'hardened', 'brutal', 'nightmare']);
  });

  it('threat AND economy both rise monotonically across the ordered tiers', () => {
    for (const k of [...THREAT, ...ECON]) {
      for (let i = 1; i < DIFFICULTY_IDS.length; i++) {
        const lo = DIFFICULTIES[DIFFICULTY_IDS[i - 1]][k];
        const hi = DIFFICULTIES[DIFFICULTY_IDS[i]][k];
        expect(hi).toBeGreaterThan(lo); // harder is always both tougher and richer
      }
    }
  });

  it('resolveDifficulty falls back to identity for unknown/omitted ids', () => {
    expect(resolveDifficulty(undefined).id).toBe('standard');
    expect(resolveDifficulty('does-not-exist').id).toBe('standard');
    expect(resolveDifficulty('brutal').lootQualityMult).toBe(DIFFICULTIES.brutal.lootQualityMult);
  });
});
