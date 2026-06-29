import { describe, it, expect } from 'vitest';
import { meta } from './meta';
import type { RunResult } from './meta';
import { heroDetail } from './heroView';
import { heroLore } from '../core/heroLore';
import { HERO_DEFS, HERO_ORDER, TOWER_ORDER } from '../core/config';
import type { HeroDef } from '../core/config';
import { itemDef } from '../core/equipment';
import { defaultLifetimeStats } from '../save/saveStore';
import type { RunStats } from '../core/types';

/** A finished run where a specific hero scored `kills`, fielding that hero. */
function runWithHeroKills(hero: string, kills: number): RunResult {
  const zero = { kills: 0, damage: 0, activeTime: 0 };
  const mastery = TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['mastery'];
  const heroMastery = HERO_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['heroMastery'];
  heroMastery[hero as keyof typeof heroMastery] = { kills, damage: 0, activeTime: 0 };
  const stats: RunStats = {
    kills, wave: 10, won: true, biomassEarned: 0, damageDealt: 0,
    killsByEnemy: defaultLifetimeStats().killsByEnemy,
    towerBuilds: TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: 0 }), {}) as RunStats['towerBuilds'],
    cardIds: [], heroId: hero,
  };
  return { wave: 10, kills, won: true, mastery, heroMastery, stats };
}

describe('heroLore', () => {
  it('uses authored flavor for shipped heroes', () => {
    expect(heroLore(HERO_DEFS.ravager).title).toBe('The Apex Predator');
    expect(heroLore(HERO_DEFS.shepherd).specialization).toBe('Sustain Guardian');
  });

  it('derives sane defaults for an unauthored hero (future-proof for 30+)', () => {
    const fake = { kind: 'newcomer', name: 'Newcomer', combatClass: 'Kinetic', behavior: 'dive', ability: { blurb: 'Zap.' } } as unknown as HeroDef;
    const lore = heroLore(fake);
    expect(lore.title).toBe('Newcomer'); // falls back to the name
    expect(lore.roleLabel).toBe('Striker'); // dive → Striker
    expect(lore.specialization).toBe('Kinetic Striker'); // class + role
    expect(lore.tagline).toBe('Zap.'); // falls back to the ability blurb
  });
});

describe('heroDetail view-model', () => {
  it('reads a fresh hero with future unlocks queued', () => {
    meta.reset();
    const d = heroDetail(meta.get(), 'ravager');
    expect(d.fielded).toBe(true); // default fielded hero
    expect(d.stars).toBe(0);
    expect(d.kills).toBe(0);
    expect(d.runs).toBe(0);
    expect(d.favoriteEquip).toBeNull();
    expect(d.nextUnlocks.some((u) => u.kind === 'Star')).toBe(true);
    expect(d.nextUnlocks.some((u) => u.kind === 'Rank')).toBe(true);
  });
});

describe('finishRun → per-hero ownership stats', () => {
  it('banks the fielded hero’s kills, runs, and equipped gear', () => {
    meta.reset();
    meta.setSelectedHero('ravager');
    meta.debugGrantGear(1);
    const item = meta.get().equipment.inventory[0];
    const def = itemDef(item.defId)!;
    meta.equip(def.slot, item.uid);

    meta.finishRun(runWithHeroKills('ravager', 50));

    const d = heroDetail(meta.get(), 'ravager');
    expect(d.kills).toBe(50); // lifetime kills accrued
    expect(d.runs).toBe(1); // runs fielded
    expect(d.favoriteEquip).not.toBeNull(); // the equipped gear was logged
    expect(meta.get().heroFavEquip.ravager[item.defId]).toBeGreaterThanOrEqual(1);

    // A second run with this hero compounds the lifetime kills.
    meta.finishRun(runWithHeroKills('ravager', 25));
    expect(heroDetail(meta.get(), 'ravager').kills).toBe(75);
    expect(heroDetail(meta.get(), 'ravager').runs).toBe(2);
  });
});
