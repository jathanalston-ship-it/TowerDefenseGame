// Structural guards for the data-driven content tables. These don't test balance —
// they assert the *contracts* the CONTENT-GUIDE promises, so adding content the
// documented way can't silently break a record/key/alias invariant.

import { describe, it, expect } from 'vitest';
import {
  TOWER_DEFS, TOWER_ORDER, ENEMY_DEFS, HEROES, HERO, DEFAULT_HERO_ID, ALL_UPGRADES, BOSS_KINDS,
} from './config';
import { CARD_POOL } from './cards';
import { BIOMES, BIOME_IDS } from './biomes';

describe('content tables (data-driven contracts)', () => {
  it('every record entry key matches its own id/kind field', () => {
    for (const [k, d] of Object.entries(TOWER_DEFS)) expect(d.kind).toBe(k);
    for (const [k, d] of Object.entries(ENEMY_DEFS)) expect(d.kind).toBe(k);
    for (const [k, d] of Object.entries(HEROES)) expect(d.id).toBe(k);
  });

  it('TOWER_ORDER lists exactly the defined towers', () => {
    expect([...TOWER_ORDER].sort()).toEqual(Object.keys(TOWER_DEFS).sort());
  });

  it('HERO is aliased to the default roster entry (behavior-preserving)', () => {
    expect(HERO).toBe(HEROES[DEFAULT_HERO_ID]);
    expect(HERO.ability.name).toBe('Apex Leap'); // the Ravager, unchanged
  });

  it('the roster has multiple selectable heroes with complete, distinct kits', () => {
    const ids = Object.keys(HEROES);
    expect(ids.length).toBeGreaterThanOrEqual(2); // selection needs a real choice
    expect(new Set(ids).size).toBe(ids.length); // unique ids
    for (const h of Object.values(HEROES)) {
      expect(h.name.length).toBeGreaterThan(0);
      expect(h.role.length).toBeGreaterThan(0); // the picker tagline
      expect(h.maxHp).toBeGreaterThan(0);
      expect(h.ability.name.length).toBeGreaterThan(0);
    }
  });

  it('the launch boss roster carries isBoss + a complete BossProfile', () => {
    const bosses = Object.values(ENEMY_DEFS).filter((e) => e.isBoss);
    // 12 launch bosses, each flagged AND profiled (phases/abilities/weakness/silhouette).
    expect(bosses.length).toBe(12);
    expect([...bosses].map((e) => e.kind).sort()).toEqual([...BOSS_KINDS].sort());
    for (const b of bosses) {
      expect(b.role).toBe('boss');
      expect(b.boss).toBeTruthy();
      expect(b.boss!.phases.length).toBeGreaterThanOrEqual(2); // "multiple phases"
      expect(b.boss!.phases[0].at).toBe(1); // first phase active from full HP
      expect(b.boss!.silhouette.form.length).toBeGreaterThan(0); // a unique silhouette descriptor
      // every boss runs at least one ability across its phases (signature abilities)
      expect(b.boss!.phases.some((p) => p.abilities.length > 0)).toBe(true);
    }
  });

  it('splitter targets resolve to real enemies (no dangling references)', () => {
    for (const d of Object.values(ENEMY_DEFS)) {
      if (d.split) expect(ENEMY_DEFS[d.split.kind]).toBeTruthy();
    }
  });

  it('ids are unique across cards, upgrades, and biomes', () => {
    const cardIds = CARD_POOL.map((c) => c.id);
    expect(new Set(cardIds).size).toBe(cardIds.length);
    const upIds = ALL_UPGRADES.map((u) => u.id);
    expect(new Set(upIds).size).toBe(upIds.length);
    expect([...BIOME_IDS].sort()).toEqual(Object.keys(BIOMES).sort());
  });
});
