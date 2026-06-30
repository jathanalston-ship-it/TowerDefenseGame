// Biome framework invariants (docs/BIOMES.md): registration, the NEUTRAL identity contract
// (golden-safety), deterministic Infinite rotation, pure time-based hazard pulses, threat-balanced
// stat mods (no spikes), and a Game-level check that biome modifiers actually reach the sim.

import { describe, it, expect } from 'vitest';
import {
  BIOMES, NEUTRAL_BIOME, BIOME_PERIOD, biomeById, biomeForDepth, hazardActive, categoryOf,
} from './biomes';
import { generateStage } from './campaign';
import { Game } from './game';
import { ENEMY_DEFS, SIM_DT } from './config';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

describe('biome framework', () => {
  it('registers all biomes with unique ids + a CombatClass-keyed tower map', () => {
    expect(BIOMES.length).toBeGreaterThanOrEqual(6);
    const ids = new Set(BIOMES.map((b) => b.id));
    expect(ids.size).toBe(BIOMES.length); // no duplicates
    for (const b of BIOMES) expect(biomeById(b.id)).toBe(b);
  });

  it('NEUTRAL_BIOME is the identity (the Stage-mode / golden-safety contract)', () => {
    const m = NEUTRAL_BIOME.mods;
    expect(m.enemyHpMult).toBe(1);
    expect(m.enemySpeedMult).toBe(1);
    expect(m.enemyDamageMult).toBe(1);
    expect(m.enemyArmorBonus).toBe(0);
    expect(m.enemyRegenFrac).toBe(0);
    expect(m.bountyMult).toBe(1);
    expect(m.towerFireRateMult).toBe(1);
    expect(m.heroDamageMult).toBe(1);
    expect(m.heroCooldownMult).toBe(1);
    expect(Object.keys(m.towerClassMult).length).toBe(0);
    expect(m.signature.length).toBe(0);
    expect(m.eliteMult).toBe(1);
    expect(m.hazard.period).toBe(0); // no pulse
    expect(hazardActive(NEUTRAL_BIOME, 999)).toBe(false); // never fires at any time
    expect(biomeById('does-not-exist')).toBe(NEUTRAL_BIOME); // unknown id never throws into the sim
  });

  it('every biome is MECHANICAL — touches multiple systems, never cosmetic', () => {
    for (const b of BIOMES) {
      const m = b.mods;
      const enemyTouched = m.enemyHpMult !== 1 || m.enemySpeedMult !== 1 || m.enemyDamageMult !== 1 || m.enemyArmorBonus !== 0 || m.enemyRegenFrac !== 0;
      const towerTouched = Object.keys(m.towerClassMult).length > 0 || m.towerFireRateMult !== 1;
      const heroTouched = m.heroDamageMult !== 1 || m.heroCooldownMult !== 1;
      const rosterTouched = Object.keys(m.bias).length > 0 || m.signature.length > 0;
      const hazardOrEcon = m.hazard.period > 0 || m.bountyMult !== 1 || m.eliteMult !== 1;
      const systems = [enemyTouched, towerTouched, heroTouched, rosterTouched, hazardOrEcon].filter(Boolean).length;
      expect(systems, `${b.id} should modify multiple systems`).toBeGreaterThanOrEqual(3);
      expect(Object.keys(m.bossChassisBias).length, `${b.id} should flavour its boss`).toBeGreaterThan(0);
    }
  });

  it('stat mods are threat-balanced + moderate — no spikes (BIOMES.md §1.2)', () => {
    for (const b of BIOMES) {
      const m = b.mods;
      // Moderate bounds so a biome reshapes encounters without becoming a difficulty spike.
      expect(m.enemyHpMult).toBeGreaterThanOrEqual(0.8);
      expect(m.enemyHpMult).toBeLessThanOrEqual(1.2);
      expect(m.enemySpeedMult).toBeGreaterThanOrEqual(0.8);
      expect(m.enemySpeedMult).toBeLessThanOrEqual(1.2);
      expect(m.enemyDamageMult).toBeLessThanOrEqual(1.15);
      // Tower class shifts stay build-shifting, not build-breaking.
      for (const v of Object.values(m.towerClassMult)) {
        expect(v).toBeGreaterThanOrEqual(0.85);
        expect(v).toBeLessThanOrEqual(1.2);
      }
      // A faster biome is frailer; a tankier biome is slower (the offsetting pairing).
      if (m.enemySpeedMult > 1.05) expect(m.enemyHpMult).toBeLessThanOrEqual(1);
      if (m.enemyHpMult > 1.05) expect(m.enemySpeedMult).toBeLessThanOrEqual(1);
    }
  });

  it('rotates biomes deterministically by depth (Infinite mode)', () => {
    expect(biomeForDepth(1).id).toBe(BIOMES[0].id);
    expect(biomeForDepth(BIOME_PERIOD).id).toBe(BIOMES[0].id); // still in the first biome
    expect(biomeForDepth(BIOME_PERIOD + 1).id).toBe(BIOMES[1].id); // rolled to the next
    // wraps forever
    const wrap = BIOME_PERIOD * BIOMES.length;
    expect(biomeForDepth(wrap + 1).id).toBe(BIOMES[0].id);
    for (let d = 1; d <= 40; d++) expect(biomeForDepth(d)).toBe(biomeForDepth(d)); // pure
  });

  it('hazard pulse is a pure function of sim time', () => {
    const ashen = biomeById('ashen'); // has a periodic hazard
    const h = ashen.mods.hazard;
    expect(h.period).toBeGreaterThan(0);
    expect(hazardActive(ashen, 0)).toBe(true); // fires at the start of each period
    expect(hazardActive(ashen, h.duration - 0.01)).toBe(true);
    expect(hazardActive(ashen, h.duration + 0.01)).toBe(false); // off after the window
    expect(hazardActive(ashen, h.period)).toBe(true); // next period
  });

  it('categoryOf classifies by stats (special → heavy → fast → swarm)', () => {
    expect(categoryOf(ENEMY_DEFS.runner)).toBe('swarm');
    expect(categoryOf(ENEMY_DEFS.colossus)).toBe('heavy'); // a big armored body
    expect(categoryOf(ENEMY_DEFS.knitter)).toBe('special'); // a trait-bearing strain
  });

  it('biome modifiers reach the sim — campaign enemies carry their biome armour + speed', () => {
    // Frostbound Reach (stage 11, the armoured biome's region): +5 armour, ×0.86 speed. Drive a campaign Game and inspect spawns.
    const stage = generateStage(11, 'standard');
    expect(stage.biome.mods.enemyArmorBonus).toBeGreaterThan(0); // guard: the test stage is the armoured biome
    const game = new Game(777, NO_META, undefined, undefined, undefined, { mode: 'campaign', stage });
    game.startWave();
    for (let i = 0; i < 150 && game.enemies.length === 0; i++) game.advance(SIM_DT); // let the first group spawn
    const mob = game.enemies.filter((e) => e.boss === null); // bosses set armour themselves
    expect(mob.length).toBeGreaterThan(0);
    const bonus = stage.biome.mods.enemyArmorBonus;
    const speedMult = stage.enemySpeedMult * stage.biome.mods.enemySpeedMult;
    for (const e of mob) {
      expect(e.baseArmor).toBeCloseTo(ENEMY_DEFS[e.kind].armor + bonus, 6);
      expect(e.speed).toBeCloseTo(ENEMY_DEFS[e.kind].speed * speedMult, 6);
    }
  });
});
