// Hero Evolution — sim integration (docs/HERO-EVOLUTION.md). Purchases spend Biomass, apply to EVERY
// active hero at once, are inherited by heroes fielded later, and never leak into a fresh run.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { HERO_EVO, HERO_EVO_BY_ID, HERO_EVO_CATEGORIES, heroEvoCost } from './heroEvolution';
import { SIM_DT } from './config';
import type { CardEffect } from './cards';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

function richGame(roster?: string[]): Game {
  const g = new Game(1, NO_META, undefined, 'ravager', undefined, roster ? { heroRoster: roster as never } : {});
  g.biomass = 100000; // plenty to buy freely
  return g;
}

describe('hero evolution — purchasing', () => {
  it('deducts the exact Biomass cost and increments the level', () => {
    const g = richGame();
    const before = g.biomass;
    const cost = heroEvoCost(HERO_EVO_BY_ID.damage, 0, 0);
    expect(g.buyHeroEvolution('damage')).toBe(true);
    expect(g.biomass).toBe(before - cost);
    expect(g.getSnapshot().heroEvo.levels.damage).toBe(1);
    expect(g.getSnapshot().heroEvo.totalOwned).toBe(1);
  });

  it('rejects an unaffordable buy, an unknown id, and a maxed category', () => {
    const g = richGame();
    g.biomass = 0;
    expect(g.buyHeroEvolution('damage')).toBe(false); // broke
    expect(g.getSnapshot().heroEvo.totalOwned).toBe(0);
    g.biomass = 100000;
    expect(g.buyHeroEvolution('nonsense')).toBe(false); // unknown
    for (let i = 0; i < HERO_EVO.maxLevel; i++) expect(g.buyHeroEvolution('armor')).toBe(true);
    expect(g.getSnapshot().heroEvo.levels.armor).toBe(HERO_EVO.maxLevel);
    expect(g.buyHeroEvolution('armor')).toBe(false); // maxed
  });

  it('deepening the same category costs more each time (per-level + global ramp)', () => {
    const g = richGame();
    const b0 = g.biomass; g.buyHeroEvolution('damage'); const spent1 = b0 - g.biomass;
    const b1 = g.biomass; g.buyHeroEvolution('damage'); const spent2 = b1 - g.biomass;
    expect(spent2).toBeGreaterThan(spent1);
  });

  it('any purchase raises OTHER categories\' costs (the global ramp)', () => {
    const g = richGame();
    const armorBefore = heroEvoCost(HERO_EVO_BY_ID.armor, 0, 0);
    g.buyHeroEvolution('damage'); // totalOwned → 1
    expect(heroEvoCost(HERO_EVO_BY_ID.armor, 0, g.getSnapshot().heroEvo.totalOwned)).toBeGreaterThan(armorBefore);
  });
});

describe('hero evolution — applies to ALL heroes + inheritance', () => {
  it('Vitality grows maxHp for every active hero and heals by the delta', () => {
    const g = richGame(['ravager', 'shepherd']);
    expect(g.heroes.length).toBe(2);
    const base = g.heroes.map((h) => h.maxHp);
    expect(g.buyHeroEvolution('health')).toBe(true);
    g.heroes.forEach((h, i) => {
      expect(h.maxHp).toBeGreaterThan(base[i]); // every hero grew
      expect(h.hp).toBe(h.maxHp); // healed by the delta (was full)
    });
  });

  it('a hero fielded AFTER purchases inherits the full max-HP evolution', () => {
    const g = richGame(); // single Ravager
    for (let i = 0; i < 4; i++) g.buyHeroEvolution('health'); // +32% maxHp
    const evolvedRavagerMax = g.heroes[0].maxHp;
    expect(g.fieldHero('shepherd')).toBe(true);
    const shepherd = g.heroes.find((h) => h.kind === 'shepherd')!;
    // Shepherd's base maxHp (300) scaled by the SAME +32% the Ravager already has.
    expect(shepherd.maxHp).toBeGreaterThan(300);
    expect(shepherd.maxHp / 300).toBeCloseTo(evolvedRavagerMax / 230, 5); // identical evolution factor
    expect(g.fieldHero('shepherd')).toBe(false); // already fielded
  });
});

describe('hero evolution — Power + run isolation', () => {
  it('exposes purchases as effects that raise Power (temporary bucket)', () => {
    const g = richGame();
    expect(g.heroEvoEffects()).toHaveLength(0);
    g.buyHeroEvolution('damage');
    g.buyHeroEvolution('critchance');
    const effects = g.heroEvoEffects();
    expect(effects.length).toBe(2);
    expect(effects.every((e) => e.op === 'mul' || e.op === 'add')).toBe(true);
  });

  it('is RUN-ONLY — a fresh Game starts with no evolution (never saved)', () => {
    const g1 = richGame();
    for (let i = 0; i < 5; i++) g1.buyHeroEvolution('damage');
    expect(g1.getSnapshot().heroEvo.totalOwned).toBe(5);
    const g2 = new Game(1, NO_META); // a new run
    expect(g2.getSnapshot().heroEvo.totalOwned).toBe(0);
    expect(g2.getSnapshot().heroEvo.levels.damage ?? 0).toBe(0);
  });

  it('does not perturb the sim when nothing is bought (advances cleanly)', () => {
    const g = new Game(2, NO_META);
    g.startWave();
    for (let i = 0; i < 120; i++) g.advance(SIM_DT);
    expect(g.getSnapshot().heroEvo.totalOwned).toBe(0); // no phantom purchases
  });
});

describe('hero evolution — equipment interaction + stress', () => {
  it('STACKS with equipment — gear and Evolution fold the SAME field, not overwrite', () => {
    const gear: Partial<Record<string, CardEffect[]>> = { ravager: [{ op: 'mul', field: 'heroDamageMult', value: 2 }] };
    const g = new Game(1, NO_META, undefined, 'ravager', undefined, { heroEquip: gear as never });
    g.biomass = 100000;
    g.selectHero('ravager');
    const gearedDamage = g.getSnapshot().selectedHero!.damage; // base × gear ×2
    expect(g.buyHeroEvolution('damage')).toBe(true); // + Evolution ×1.1
    const gearedPlusEvo = g.getSnapshot().selectedHero!.damage;
    expect(gearedPlusEvo).toBeGreaterThan(gearedDamage); // both applied, not just gear
  });

  it('reflects live in the hero view (bigger HP, faster attacks, more damage)', () => {
    const g = richGame();
    g.selectHero('ravager');
    const a = g.getSnapshot().selectedHero!;
    g.buyHeroEvolution('health');
    g.buyHeroEvolution('attackspeed');
    g.buyHeroEvolution('damage');
    const b = g.getSnapshot().selectedHero!;
    expect(b.maxHp).toBeGreaterThan(a.maxHp);
    expect(b.attackSpeed).toBeGreaterThan(a.attackSpeed);
    expect(b.damage).toBeGreaterThan(a.damage);
  });

  it('stress: hammering every axis never goes negative or exceeds the level cap', () => {
    const g = richGame(['ravager', 'shepherd', 'overseer']);
    let bought = 0;
    for (let round = 0; round < 200; round++) {
      for (const c of HERO_EVO_CATEGORIES) if (g.buyHeroEvolution(c.id)) bought++;
    }
    expect(bought).toBeGreaterThan(0);
    expect(g.biomass).toBeGreaterThanOrEqual(0);
    for (const c of HERO_EVO_CATEGORIES) {
      expect(g.getSnapshot().heroEvo.levels[c.id] ?? 0).toBeLessThanOrEqual(HERO_EVO.maxLevel);
    }
    expect(g.getSnapshot().heroEvo.totalOwned).toBeLessThanOrEqual(HERO_EVO_CATEGORIES.length * HERO_EVO.maxLevel);
  });
});
