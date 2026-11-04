// Guards the content-registry framework: self-registration + stable order, lookup,
// validation, alias-based save compatibility, modding (open registration), and the
// derived core lists that replaced the old hardcoded order arrays.

import { describe, it, expect } from 'vitest';
import { Registry, CONTENT_VERSION } from './registry';
import {
  TOWER_ORDER,
  HERO_ORDER,
  ENEMY_KINDS,
  towerRegistry,
  enemyRegistry,
  heroRegistry,
} from './config';
import { validateAllContent } from './validate';

interface Thing {
  id: string;
  n: number;
}

describe('Registry framework', () => {
  it('registers in order and looks up by id', () => {
    const r = new Registry<Thing>('thing', { idOf: (t) => t.id });
    r.register({ id: 'a', n: 1 });
    r.register({ id: 'b', n: 2 });
    expect(r.ids()).toEqual(['a', 'b']); // registration order
    expect(r.get('b')?.n).toBe(2);
    expect(r.has('a')).toBe(true);
    expect(r.has('zzz')).toBe(false);
    expect(r.size).toBe(2);
  });

  it('rejects duplicate ids', () => {
    const r = new Registry<Thing>('thing', { idOf: (t) => t.id });
    r.register({ id: 'a', n: 1 });
    expect(() => r.register({ id: 'a', n: 9 })).toThrow(/duplicate/);
  });

  it('runs a per-def validator with prefixed messages', () => {
    const r = new Registry<Thing>('thing', { idOf: (t) => t.id, validate: (t) => (t.n > 0 ? [] : ['n must be > 0']) });
    r.register({ id: 'ok', n: 5 });
    r.register({ id: 'bad', n: 0 });
    expect(r.validate()).toEqual(["thing 'bad': n must be > 0"]);
  });

  it('resolves aliases for save compatibility, and hides deprecated from active()', () => {
    const r = new Registry<Thing>('thing', { idOf: (t) => t.id });
    r.register({ id: 'new_name', n: 1 });
    r.register({ id: 'old_relic', n: 2 }, { deprecated: true });
    r.alias('legacy_name', 'new_name'); // a renamed id from an old save
    expect(r.resolve('legacy_name')).toBe('new_name');
    expect(r.get('legacy_name')?.n).toBe(1);
    expect(r.resolve('gone')).toBeUndefined(); // unknown id → caller degrades gracefully
    expect(r.active().map((t) => t.id)).toEqual(['new_name']); // deprecated excluded from rolls
  });

  it('supports runtime modding via open registration with a source tag', () => {
    const r = new Registry<Thing>('thing', { idOf: (t) => t.id });
    r.register({ id: 'core_a', n: 1 });
    r.register({ id: 'mod:cool', n: 7 }, { source: 'mod' });
    expect(r.metaOf('mod:cool')?.source).toBe('mod');
    expect(r.metaOf('core_a')?.source).toBe('core');
    expect(r.ids()).toContain('mod:cool');
  });

  it('exposes a content version for migrations', () => {
    expect(CONTENT_VERSION).toBeGreaterThanOrEqual(1);
  });
});

describe('core content is registry-derived (no hardcoded lists)', () => {
  it('derives the tower/hero/enemy iteration lists from their registries', () => {
    expect(TOWER_ORDER).toEqual(towerRegistry.ids());
    expect(HERO_ORDER).toEqual(heroRegistry.ids());
    expect(ENEMY_KINDS).toEqual(enemyRegistry.ids());
    // launch five + expansion three + Coil/Siphon/Sower + Spire/Polyp + Spitfang/Rift +
    // Glaive/Roost (the draconic pair) + Lung/Bell/Lancet (the reaction trio: second Viral,
    // second Resonant, the Caustic executioner) = twenty towers; TEN heroes — the launch trio +
    // Vitriol/Revenant/Knell (one per combat class) + the Cinderwyrm (the flying second Caustic)
    // + the Riptide (water-form zone controller, second Kinetic) + the Carrion (charnel
    // necromancer, second Vital) + the Fovea (executioner lance, second Neural). The answer roster
    // (Warren/Tick/Quill — docs/TOWERS.md §answers) and the Myceliarch (the Viral gatekeeper)
    // bring it to twenty-five towers (incl. the two arena crowns) and twelve heroes.
    expect(towerRegistry.size).toBe(25);
    expect(heroRegistry.size).toBe(12);
  });

  it('shipped content passes registry-driven validation', () => {
    expect(validateAllContent()).toEqual([]);
  });
});
