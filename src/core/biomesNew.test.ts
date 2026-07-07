// Two new biomes (Molten Verge · Tempest Reach) — FLAWLESS integration across all four pillars.
// Campaign (region placement + a real in-sim spawn check), Infinite + Boss Rush (depth rotation —
// both select via biomeForDepth), and the Daily roll pool, plus each biome's mechanical IDENTITY
// (Molten is the first artillery-boss biome; Tempest is the only tower-rate-buff biome). The shared
// threat-balance/mechanical contract is enforced for ALL biomes by biomes.test.ts (loop-based, so
// it already covers these two); this file pins the new biomes' cross-mode wiring specifically.

import { describe, it, expect } from 'vitest';
import { BIOMES, BIOME_PERIOD, biomeById, biomeForDepth } from './biomes';
import { biomeForStage, BIOME_REGION, generateStage } from './campaign';
import { generateDaily } from './daily';
import { Game } from './game';
import { ENEMY_DEFS, SIM_DT } from './config';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const NEW = ['molten', 'tempest'] as const;

/** Drive a campaign Game until the first non-boss group spawns; return those mobs. */
function firstMobs(stage: ReturnType<typeof generateStage>): Game['enemies'] {
  const game = new Game(777, NO_META, undefined, undefined, undefined, { mode: 'campaign', stage });
  game.startWave();
  for (let i = 0; i < 240 && game.enemies.length === 0; i++) game.advance(SIM_DT);
  return game.enemies.filter((e) => e.boss === null);
}

describe('new biomes — registration + identity', () => {
  it('both are registered, resolvable, and appended as DEEP biomes (indices 6 & 7 of 10)', () => {
    expect(BIOMES.length).toBe(10); // molten+tempest, then the ossuary/umbral expansion
    for (const id of NEW) {
      expect(biomeById(id).id).toBe(id); // resolvable
      expect(BIOMES.some((b) => b.id === id)).toBe(true);
    }
    expect(BIOMES[6].id).toBe('molten');
    expect(BIOMES[7].id).toBe('tempest');
    expect(new Set(BIOMES.map((b) => b.id)).size).toBe(BIOMES.length); // still no duplicate ids
  });

  it('Molten Verge is the FIRST biome to field the (previously unused) artillery boss chassis', () => {
    expect(BIOMES.slice(0, 6).some((b) => (b.mods.bossChassisBias.artillery ?? 0) > 0)).toBe(false);
    expect(biomeById('molten').mods.bossChassisBias.artillery).toBeGreaterThan(0);
  });

  it('Tempest Reach is the ONLY biome that buffs global tower fire rate (a fresh niche)', () => {
    expect(biomeById('tempest').mods.towerFireRateMult).toBeGreaterThan(1);
    for (const b of BIOMES.filter((x) => x.id !== 'tempest')) expect(b.mods.towerFireRateMult).toBeLessThanOrEqual(1);
  });

  it('both carry a difficulty read-out for recommendedPower (never silently harder)', () => {
    expect(biomeById('molten').mods.difficulty).toBeGreaterThan(1);
    expect(biomeById('tempest').mods.difficulty).toBeGreaterThan(1);
  });
});

describe('Campaign pillar — deep biome regions + real in-sim reach', () => {
  it('places Molten in region 7 and Tempest in region 8 (contiguous bands)', () => {
    for (let s = 6 * BIOME_REGION + 1; s <= 7 * BIOME_REGION; s++) expect(biomeForStage(s).id).toBe('molten');
    for (let s = 7 * BIOME_REGION + 1; s <= 8 * BIOME_REGION; s++) expect(biomeForStage(s).id).toBe('tempest');
    // the generator and the map agree, and the world map wraps back after the new bands
    expect(generateStage(31, 'standard').biome.id).toBe('molten');
    expect(generateStage(36, 'standard').biome.id).toBe('tempest');
    // The Ossuary/Umbral expansion extends the world: regions 9 & 10, THEN the wrap.
    for (let st = 8 * BIOME_REGION + 1; st <= 9 * BIOME_REGION; st++) expect(biomeForStage(st).id).toBe('ossuary');
    for (let st = 9 * BIOME_REGION + 1; st <= 10 * BIOME_REGION; st++) expect(biomeForStage(st).id).toBe('umbral');
    expect(biomeForStage(10 * BIOME_REGION + 1).id).toBe('verdant'); // wraps
  });

  it('Molten enemies carry its armour (+4) and slow (×0.88) in a live campaign run', () => {
    const stage = generateStage(31, 'standard');
    expect(stage.biome.id).toBe('molten');
    const mob = firstMobs(stage);
    expect(mob.length).toBeGreaterThan(0);
    const speedMult = stage.enemySpeedMult * stage.biome.mods.enemySpeedMult;
    for (const e of mob) {
      expect(e.baseArmor).toBeCloseTo(ENEMY_DEFS[e.kind].armor + 4, 6);
      expect(e.speed).toBeCloseTo(ENEMY_DEFS[e.kind].speed * speedMult, 6);
    }
  });

  it('Tempest is active in-sim (enemies carry its +3 armour) and declares its tower-rate buff', () => {
    const stage = generateStage(36, 'standard');
    expect(stage.biome.id).toBe('tempest');
    expect(stage.biome.mods.towerFireRateMult).toBeGreaterThan(1); // the buff the fire hook reads
    const mob = firstMobs(stage);
    expect(mob.length).toBeGreaterThan(0);
    for (const e of mob) expect(e.baseArmor).toBeCloseTo(ENEMY_DEFS[e.kind].armor + 3, 6);
  });
});

describe('Infinite + Boss Rush pillars — depth rotation (both select via biomeForDepth)', () => {
  it('rotates the new biomes into depths 31–40, then wraps', () => {
    for (let d = 6 * BIOME_PERIOD + 1; d <= 7 * BIOME_PERIOD; d++) expect(biomeForDepth(d).id).toBe('molten');
    for (let d = 7 * BIOME_PERIOD + 1; d <= 8 * BIOME_PERIOD; d++) expect(biomeForDepth(d).id).toBe('tempest');
    for (let d = 8 * BIOME_PERIOD + 1; d <= 9 * BIOME_PERIOD; d++) expect(biomeForDepth(d).id).toBe('ossuary');
    for (let d = 9 * BIOME_PERIOD + 1; d <= 10 * BIOME_PERIOD; d++) expect(biomeForDepth(d).id).toBe('umbral');
    expect(biomeForDepth(10 * BIOME_PERIOD + 1).id).toBe('verdant'); // wraps forever
  });

  it('an endless run enters the rotation live and its biome mods reach spawned enemies', () => {
    // Prove the endless biome pipeline (enterBiome ∘ biomeForDepth ∘ activeBiome.mods) is wired: the
    // first biome is Verdant (hp ×0.9), so early spawns are visibly lighter than their base HP.
    const g = new Game(2024, NO_META, undefined, undefined, undefined, { mode: 'endless' });
    g.startWave();
    for (let i = 0; i < 240 && g.enemies.length === 0; i++) g.advance(SIM_DT);
    const mob = g.enemies.filter((e) => e.boss === null);
    expect(mob.length).toBeGreaterThan(0);
    expect(biomeForDepth(1).id).toBe('verdant');
    for (const e of mob) expect(e.maxHp).toBeCloseTo(ENEMY_DEFS[e.kind].hp * 0.9, 4); // Verdant ×0.9 reached the sim
  });
});

describe('Daily pillar — the roll pool includes the new biomes', () => {
  it('both new biomes are reachable across the daily roll (uniform over all 8)', () => {
    const seen = new Set<string>();
    // A fixed, deterministic sweep of day keys (generateDaily is pure per key) — with 8 biomes over
    // this many rolls, every biome appears (a miss would be astronomically unlikely AND stable).
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= 28; d++) {
        seen.add(generateDaily(`2027-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`).biomeId);
      }
    }
    for (const id of NEW) expect(seen.has(id)).toBe(true);
    expect(seen.size).toBe(BIOMES.length); // every biome is reachable in the Daily
  });
});
