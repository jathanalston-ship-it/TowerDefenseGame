// Campaign generator invariants (CAMPAIGN.md): determinism, smooth/monotonic scaling (no spikes),
// stage-gated + biome-biased roster, valid generated waves, and a stage-scaled boss finale.

import { describe, it, expect } from 'vitest';
import { generateStage, biomeForStage, BIOMES, BIOME_REGION } from './campaign';
import { campaignBossStrength, scaleBossStrength } from './difficultyDirector';
import { BOSS, CAMPAIGN_ONBOARDING } from './config';
import { BOSS_DEFS, campaignBossFor } from './boss';

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

// The onboarding finale (docs/CAMPAIGN.md §curve, docs/DIFFICULTY_DIRECTOR.md §onboarding): the
// first stages field a REDUCED boss whose kit channels the core-shot instead of out-healing an
// opening board — the fix for the fresh account's binary Stage-3 wall.
describe('campaign onboarding finale', () => {
  const full = CAMPAIGN_ONBOARDING.bossFullStage;

  it('strength ramps linearly from the floor to exactly ×1 at the full stage', () => {
    expect(campaignBossStrength(1)).toBeCloseTo(CAMPAIGN_ONBOARDING.bossStrengthFloor, 12);
    for (let st = 2; st < full; st++) expect(campaignBossStrength(st)).toBeGreaterThan(campaignBossStrength(st - 1));
    for (const st of [full, full + 1, 40, 400]) expect(campaignBossStrength(st)).toBe(1);
  });

  it('scaleBossStrength scales body + kit on a COPY, and is the identity at ×1', () => {
    const def = BOSS_DEFS.first_antibody;
    expect(scaleBossStrength(def, 1)).toBe(def);
    const half = scaleBossStrength(def, 0.5);
    expect(half).not.toBe(def);
    expect(half.hpMult).toBeCloseTo(def.hpMult * 0.5, 12);
    expect(half.damage).toBe(Math.round(def.damage * 0.5));
    expect(half.armor).toBe(Math.round((def.armor ?? BOSS.baseArmor) * 0.5));
    half.modules.forEach((m, i) => expect(m.amount).toBe(def.modules[i].amount === undefined ? undefined : Math.max(1, Math.round(def.modules[i].amount! * 0.5))));
    expect(BOSS_DEFS.first_antibody.hpMult).toBe(1.6); // the authored def never mutates
  });

  it('every onboarding finale is reduced, sustain-free, and channels the core-shot in every phase', () => {
    for (let st = 1; st < full; st++) {
      for (const d of ['standard', 'hardened', 'brutal']) {
        const boss = generateStage(st, d).boss;
        const kinds = boss.modules.map((m) => m.kind as string);
        for (const k of CAMPAIGN_ONBOARDING.sustainKinds) expect(kinds, `stage ${st}/${d}: ${kinds}`).not.toContain(k);
        const shot = boss.modules.findIndex((m) => m.kind === 'channeler');
        expect(shot, `stage ${st}/${d} has no core-shot`).toBeGreaterThanOrEqual(0);
        for (const p of boss.phases) expect(p.modules).toContain(shot);
        expect(boss.modules[shot].amount).toBe(Math.max(1, Math.round(CAMPAIGN_ONBOARDING.coreShot.amount * campaignBossStrength(st))));
        expect(boss.armor).toBe(Math.round(BOSS.baseArmor * campaignBossStrength(st)));
      }
    }
  });

  it('from the full stage on, finales are untouched (the authored milestone keeps its exact def)', () => {
    expect(generateStage(5).boss).toBe(campaignBossFor(5));
    for (const st of [6, 9, 23]) {
      const boss = generateStage(st).boss;
      expect(boss.armor).toBeUndefined(); // never stamped — the sim's BOSS.baseArmor default applies
    }
  });
});
