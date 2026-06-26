import { describe, it, expect } from 'vitest';
import {
  DIFFICULTIES,
  DIFFICULTY_IDS,
  STANDARD,
  difficultyProblems,
  difficultyRegistry,
  resolveDifficulty,
} from './difficulty';

describe('universal difficulty framework', () => {
  it('standard is the identity (every scalar 1) — the golden invariant', () => {
    expect(STANDARD.enemyHealthMult).toBe(1);
    expect(STANDARD.enemyDamageMult).toBe(1);
    expect(STANDARD.spawnRateMult).toBe(1);
    expect(STANDARD.eliteChanceMult).toBe(1);
    expect(STANDARD.rewardMult).toBe(1);
    expect(STANDARD.bossFrequencyMult).toBe(1);
  });

  it('resolveDifficulty falls back to standard for missing/unknown ids', () => {
    expect(resolveDifficulty(undefined)).toBe(STANDARD);
    expect(resolveDifficulty('standard')).toBe(STANDARD);
    expect(resolveDifficulty('does-not-exist')).toBe(STANDARD);
    expect(resolveDifficulty('brutal')).toBe(DIFFICULTIES.brutal);
  });

  it('every registered difficulty has strictly positive, finite scalars', () => {
    for (const d of Object.values(DIFFICULTIES)) expect(difficultyProblems(d)).toEqual([]);
    expect(difficultyRegistry.validate()).toEqual([]);
  });

  it('presets escalate monotonically above standard (harder = bigger scalars)', () => {
    const order = ['relaxed', 'standard', 'hardened', 'brutal', 'nightmare'];
    for (let i = 1; i < order.length; i++) {
      const lo = DIFFICULTIES[order[i - 1]];
      const hi = DIFFICULTIES[order[i]];
      expect(hi.enemyHealthMult).toBeGreaterThanOrEqual(lo.enemyHealthMult);
      expect(hi.enemyDamageMult).toBeGreaterThanOrEqual(lo.enemyDamageMult);
    }
  });

  it('the registry exposes every difficulty id', () => {
    expect(DIFFICULTY_IDS).toContain('standard');
    expect(DIFFICULTY_IDS.length).toBe(Object.keys(DIFFICULTIES).length);
  });
});
