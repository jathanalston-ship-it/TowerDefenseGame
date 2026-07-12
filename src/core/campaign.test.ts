// Campaign generator invariants (CAMPAIGN.md): determinism, smooth/monotonic scaling (no spikes),
// stage-gated + biome-biased roster, valid generated waves, and a stage-scaled boss finale.

import { describe, it, expect } from 'vitest';
import { generateStage, biomeForStage, BIOMES, BIOME_REGION } from './campaign';

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
    // 2026-07 re-anchor (docs/DIFFICULTY.md §curve): 5%/stage through stage 8, a deliberate
    // 20%/stage COMPENSATION BAND across stages 9–25 (the early economy outruns 5%), then
    // 5%/stage resumes from the elevated baseline. Each segment holds its own gentle-step
    // bound; the whole curve stays strictly monotonic with no discontinuities.
    let prevHp = 0, prevDmg = 0, prevReward = 0;
    for (let n = 1; n <= 60; n++) {
      const s = generateStage(n, 'standard');
      expect(s.scaling.enemyHealthMult).toBeGreaterThan(prevHp - 1e-9); // monotonic ↑
      expect(s.scaling.enemyDamageMult).toBeGreaterThan(prevDmg - 1e-9);
      expect(s.rewardMult).toBeGreaterThan(prevReward - 1e-9);
      if (n > 1) {
        const inBand = n > 8 && n <= 25; // the compensation band's steeper (still bounded) step
        expect(s.scaling.enemyHealthMult / prevHp).toBeLessThan(inBand ? 1.21 : 1.1); // never a spike
      }
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

  it('injects the authored Milestone-1 boss at its pinned stage, procedural elsewhere', () => {
    expect(generateStage(5, 'standard').boss.id).toBe('first_antibody'); // authored override
    expect(generateStage(25, 'standard').boss.id).toBe('mitotic_horror');
    expect(generateStage(11, 'standard').boss.id).toMatch(/^proc_/); // non-milestone ⇒ still procedural
  });

  it('difficulty variants raise the whole curve', () => {
    const std = generateStage(10, 'standard');
    const hard = generateStage(10, 'hardened');
    expect(hard.scaling.enemyHealthMult).toBeGreaterThan(std.scaling.enemyHealthMult);
    expect(hard.rewardMult).toBeGreaterThan(std.rewardMult);
  });

  it('groups biomes into contiguous REGIONS (a band per BIOME_REGION stages), cycling', () => {
    for (let n = 1; n <= BIOMES.length * BIOME_REGION + 3; n++) {
      const expected = BIOMES[Math.floor((n - 1) / BIOME_REGION) % BIOMES.length].id;
      expect(generateStage(n, 'standard').biome.id).toBe(expected); // generator + map agree
      expect(biomeForStage(n).id).toBe(expected);
    }
    // A region is contiguous: same biome across its band, a new one at the boundary.
    expect(biomeForStage(1).id).toBe(biomeForStage(BIOME_REGION).id);
    expect(biomeForStage(1).id).not.toBe(biomeForStage(BIOME_REGION + 1).id);
  });
});
