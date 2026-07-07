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
    kills, wave: 10, won: true, biomassEarned: 0, damageDealt: 0, integrityLost: 0,
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
    meta.equip('ravager', def.slot, item.uid);

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

describe('per-hero equipment — independent loadouts (HEROES.md)', () => {
  const [h1, h2] = HERO_ORDER;

  it('each hero keeps its own loadout; equipping one never overwrites another', () => {
    meta.reset();
    meta.grantItem({ uid: 'wa', defId: 'w_quill', rarity: 'epic', affixes: [] });
    meta.grantItem({ uid: 'wb', defId: 'w_coil', rarity: 'epic', affixes: [] });
    meta.equip(h1, 'weapon', 'wa');
    meta.equip(h2, 'weapon', 'wb');
    expect(meta.loadoutOf(h1).weapon).toBe('wa');
    expect(meta.loadoutOf(h2).weapon).toBe('wb'); // h2's equip did not clobber h1
    meta.equip(h1, 'weapon', null); // clearing h1 leaves h2 intact
    expect(meta.loadoutOf(h1).weapon).toBeNull();
    expect(meta.loadoutOf(h2).weapon).toBe('wb');
  });

  it('a single physical item moves off whichever hero wears it (single instance)', () => {
    meta.reset();
    meta.grantItem({ uid: 'shared', defId: 'w_quill', rarity: 'epic', affixes: [] });
    meta.equip(h1, 'weapon', 'shared');
    meta.equip(h2, 'weapon', 'shared'); // steal it onto h2
    expect(meta.loadoutOf(h1).weapon).toBeNull(); // pulled off h1
    expect(meta.loadoutOf(h2).weapon).toBe('shared');
  });

  it('heroRosterEquip carries a geared fielded hero’s effects (per-hero, folds into the run)', () => {
    meta.reset();
    const hero = meta.selectedHero(); // slot-1 is always fielded
    expect(meta.heroRosterEquip()[hero] ?? []).toHaveLength(0); // no gear ⇒ no effects (golden-safe)
    meta.grantItem({ uid: 'g', defId: 'w_quill', rarity: 'epic', affixes: [] });
    meta.equip(hero, 'weapon', 'g');
    expect((meta.heroRosterEquip()[hero] ?? []).length).toBeGreaterThan(0); // geared ⇒ per-hero effects present
  });
});
