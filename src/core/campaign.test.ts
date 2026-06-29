// Campaign generator invariants (CAMPAIGN.md): determinism, smooth/monotonic scaling (no spikes),
// stage-gated + biome-biased roster, valid generated waves, and a stage-scaled boss finale.

import { describe, it, expect } from 'vitest';
import { generateStage, BIOMES } from './campaign';

describe('campaign generator', () => {
  it('is deterministic in (stage, difficulty) — same inputs ⇒ identical stage', () => {
    for (const [n, d] of [[1, 'standard'], [7, 'standard'], [20, 'hardened'], [3, 'brutal']] as const) {
      const a = generateStage(n, d);
      const b = generateStage(n, d);
      expect(a.waveCount).toBe(b.waveCount);
      expect(a.biome.id).toBe(b.biome.id);
      expect(a.boss.id).toBe(b.boss.id);
      expect(a.scaling.enemyHealthMult).toBe(b.scaling.enemyHealthMult);
      expect(a.enemySpeedMult).toBe(b.enemySpeedMult);
      expect(a.enemyPool).toEqual(b.enemyPool);
      expect(JSON.stringify(a.waves)).toBe(JSON.stringify(b.waves)); // wave composition is reproducible
    }
  });

  it('stage 1 / standard sits at the baseline (no scaling)', () => {
    const s = generateStage(1, 'standard');
    expect(s.scaling.enemyHealthMult).toBeCloseTo(1, 6);
    expect(s.scaling.enemyDamageMult).toBeCloseTo(1, 6);
    expect(s.enemySpeedMult).toBeCloseTo(1, 6);
    expect(s.rewardMult).toBeCloseTo(1, 6);
  });

  it('scales SMOOTHLY across stages — monotonic, no spikes', () => {
    let prevHp = 0, prevDmg = 0, prevReward = 0;
    for (let n = 1; n <= 60; n++) {
      const s = generateStage(n, 'standard');
      expect(s.scaling.enemyHealthMult).toBeGreaterThan(prevHp - 1e-9); // monotonic ↑
      expect(s.scaling.enemyDamageMult).toBeGreaterThan(prevDmg - 1e-9);
      expect(s.rewardMult).toBeGreaterThan(prevReward - 1e-9);
      if (n > 1) expect(s.scaling.enemyHealthMult / prevHp).toBeLessThan(1.1); // gentle step — never a spike
      expect(s.enemySpeedMult).toBeLessThanOrEqual(1.6 + 1e-9); // capped so fast enemies stay fair
      prevHp = s.scaling.enemyHealthMult; prevDmg = s.scaling.enemyDamageMult; prevReward = s.rewardMult;
    }
  });

  it('elite frequency + wave count rise gently with stage, within bounds', () => {
    const a = generateStage(2, 'standard');
    const b = generateStage(40, 'standard');
    expect(b.eliteFrequency).toBeGreaterThan(a.eliteFrequency);
    expect(b.eliteFrequency).toBeLessThanOrEqual(0.45 + 1e-9); // capped
    expect(a.waveCount).toBeGreaterThanOrEqual(6);
    expect(b.waveCount).toBeLessThanOrEqual(14);
    expect(b.waveCount).toBeGreaterThanOrEqual(a.waveCount);
  });

  it('gates the roster by stage and never spawns the boss-visual kind', () => {
    const early = generateStage(1, 'standard').enemyPool;
    const late = generateStage(40, 'standard').enemyPool;
    expect(early.length).toBeGreaterThan(0);
    expect(late.length).toBeGreaterThanOrEqual(early.length); // the roster widens with depth
    expect(early).not.toContain('colossus'); // a 1100-HP heavy can't appear in stage 1
    expect(late).toContain('colossus');
    expect(early).not.toContain('tyrant'); // reserved as the framework-boss render
    expect(late).not.toContain('tyrant');
  });

  it('produces valid waves drawn from the pool + a stage-scaled boss finale', () => {
    const s = generateStage(12, 'standard');
    expect(s.waveCount).toBe(s.waves.length);
    for (const wave of s.waves) {
      expect(wave.length).toBeGreaterThan(0);
      for (const g of wave) {
        expect(g.count).toBeGreaterThan(0);
        expect(s.enemyPool).toContain(g.kind);
      }
    }
    expect(s.boss.id).toMatch(/^proc_/);
    // boss difficulty scales with the stage (the assembler's tier)
    expect(generateStage(30, 'standard').boss.hpMult).toBeGreaterThan(generateStage(2, 'standard').boss.hpMult);
  });

  it('difficulty variants raise the whole curve', () => {
    const std = generateStage(10, 'standard');
    const hard = generateStage(10, 'hardened');
    expect(hard.scaling.enemyHealthMult).toBeGreaterThan(std.scaling.enemyHealthMult);
    expect(hard.rewardMult).toBeGreaterThan(std.rewardMult);
  });

  it('rotates biomes deterministically by stage number', () => {
    for (let n = 1; n <= BIOMES.length * 2 + 1; n++) {
      expect(generateStage(n, 'standard').biome.id).toBe(BIOMES[(n - 1) % BIOMES.length].id);
    }
  });
});
