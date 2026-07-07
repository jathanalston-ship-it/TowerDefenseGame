// Daily Run — the sim integration (docs/DAILY-RUN.md): a daily-mode Game boots deterministically,
// each modifier's effect actually lands (isolated via RunOptions.daily ids), the 3-tower Conveyor
// pool gates placement, the seeded boss roster spawns on its wave, and the neutral path (no daily
// opts) reads identically — the golden-safety contract.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { generateDaily } from './daily';
import { DAILY, ENEMY_DEFS, SIM_DT, TOWER_ORDER } from './config';
import { NEUTRAL_EFFECTS, combinedEffects } from './dailyModifiers';
import type { MetaModifiers, TowerKind } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const KEY = '2026-07-07';

/** A daily-mode Game booted from the real day plan (the App's exact construction). */
function dailyGame(modifierIds?: string[]): Game {
  const plan = generateDaily(KEY);
  return new Game(plan.seed, NO_META, undefined, 'ravager', undefined, {
    mode: 'daily',
    stage: plan.stage,
    daily: { modifierIds: modifierIds ?? plan.modifierIds },
    unlocked: [...new Set(plan.towerPool)],
    favorite: plan.towerPool[0],
  });
}

describe('daily sim — boot + worldwide determinism', () => {
  it('boots from the day plan and plays deterministically (same key ⇒ same outcome)', () => {
    const run = (): number => {
      const g = dailyGame();
      g.startWave();
      for (let i = 0; i < 300; i++) g.advance(SIM_DT);
      return g.kills * 1000 + Math.round(g.integrity) + Math.round(g.biomass);
    };
    expect(run()).toBe(run()); // the whole run derives from the day seed
  });

  it('the 3-tower Conveyor pool gates placement (a non-pool kind is refused)', () => {
    const plan = generateDaily(KEY);
    const g = dailyGame();
    const pool = new Set(plan.towerPool);
    const outside = TOWER_ORDER.find((k) => !pool.has(k));
    if (!outside) return; // (theoretically possible if the pool rolled every kind — then nothing to assert)
    // Any placement attempt with an off-pool kind must be refused by the roster gate.
    expect(g.placeTower(outside as TowerKind, 360, 700)).toBe(false);
  });

  it('spawns the seeded mid-boss roster on its scheduled wave', () => {
    const plan = generateDaily(KEY);
    // Re-anchor the day's first mid-boss onto wave 1 (data-only override) so the assertion is cheap.
    const [w7] = DAILY.bossWaves;
    const midBoss = plan.stage.bossWaves![w7]!;
    const stage = { ...plan.stage, bossWaves: { 1: midBoss } };
    const g = new Game(plan.seed, NO_META, undefined, 'ravager', undefined, { mode: 'daily', stage, daily: { modifierIds: [] } });
    g.startWave();
    for (let i = 0; i < 20; i++) g.advance(SIM_DT);
    expect(g.getRenderState().enemies.some((e) => e.boss !== null)).toBe(true); // the roster boss is on the field
  });
});

describe('daily sim — each modifier lands (isolated ids)', () => {
  it('Ironhide adds flat enemy armor; Overrun speeds the swarm (at spawn)', () => {
    const g = new Game(7, NO_META, undefined, 'ravager', undefined, { mode: 'daily', daily: { modifierIds: ['ironhide', 'overrun'] } });
    g.debugSpawn('runner', 1);
    const e = g.getRenderState().enemies[0];
    expect(e.baseArmor).toBeCloseTo(ENEMY_DEFS.runner.armor + DAILY.mod.enemyArmorAdd, 5);
    expect(e.speed).toBeCloseTo(ENEMY_DEFS.runner.speed * DAILY.mod.enemySpeedMult, 5);
    // …and WITHOUT the modifiers the same spawn reads base stats (the neutral contract).
    const g0 = new Game(7, NO_META, undefined, 'ravager', undefined, { mode: 'daily', daily: { modifierIds: [] } });
    g0.debugSpawn('runner', 1);
    expect(g0.getRenderState().enemies[0].baseArmor).toBeCloseTo(ENEMY_DEFS.runner.armor, 5);
    expect(g0.getRenderState().enemies[0].speed).toBeCloseTo(ENEMY_DEFS.runner.speed, 5);
  });

  it('Regeneration knits the Hive during combat; Blood Frenzy bleeds the hero', () => {
    const g = new Game(7, NO_META, undefined, 'ravager', undefined, { mode: 'daily', daily: { modifierIds: ['regeneration', 'blood_frenzy'] } });
    g.startWave();
    g.integrity = Math.round(g.integrity / 2); // wound the Hive so regen is observable
    const hurt = g.integrity;
    const heroHp0 = g.getRenderState().heroes[0].hp;
    for (let i = 0; i < 120; i++) g.advance(SIM_DT); // ~2s of combat
    expect(g.integrity).toBeGreaterThan(hurt); // +1%/s max-integrity regen
    expect(g.getRenderState().heroes[0].hp).toBeLessThan(heroHp0); // −2%/s max-HP drain
  });

  it('Infestation promotes elites off the DEDICATED stream (base spawns untouched without it)', () => {
    const g = new Game(7, NO_META, undefined, 'ravager', undefined, { mode: 'daily', daily: { modifierIds: ['infestation'] } });
    g.debugSpawn('runner', 200);
    const elites = g.getRenderState().enemies.filter((e) => e.elite).length;
    expect(elites).toBeGreaterThan(0); // ~12% of 200
    const g0 = new Game(7, NO_META, undefined, 'ravager', undefined, { mode: 'daily', daily: { modifierIds: [] } });
    g0.debugSpawn('runner', 200);
    expect(g0.getRenderState().enemies.filter((e) => e.elite).length).toBe(0);
  });

  it('the neutral daily resolution is NEUTRAL_EFFECTS (nothing folds without ids)', () => {
    expect(combinedEffects([])).toEqual(NEUTRAL_EFFECTS); // the contract the golden suite rides on
  });
});
