// Hero identity framework invariants (docs/HERO-FRAMEWORK.md): every hero is a complete, distinct
// identity, the golden-safety contract holds (Ravager hooks are elite-scoped + 'aggressive'), and a
// Game constructs + runs for each hero without drift.

import { describe, it, expect } from 'vitest';
import { HERO_IDENTITIES, heroIdentity } from './heroIdentity';
import { HERO_ORDER } from './config';
import { Game } from './game';
import { SIM_DT } from './config';
import type { HeroKind, MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

describe('hero identity framework', () => {
  it('every hero has a complete, distinct identity', () => {
    for (const k of HERO_ORDER) {
      const id = heroIdentity(k);
      expect(id, `${k} has an identity`).toBeDefined();
      expect(id.role.length).toBeGreaterThan(10);
      expect(id.strengths.length).toBeGreaterThanOrEqual(2);
      expect(id.weaknesses.length).toBeGreaterThanOrEqual(2);
      for (const part of [id.passive, id.trait, id.scaling]) {
        expect(part.name.length).toBeGreaterThan(0);
        expect(part.desc.length).toBeGreaterThan(0);
      }
    }
    // The three lead heroes are mechanically DISTINCT (no shared passive/trait/scaling kind).
    const leads = ['ravager', 'shepherd', 'overseer'] as HeroKind[];
    expect(new Set(leads.map((k) => heroIdentity(k).passive.kind)).size).toBe(3);
    expect(new Set(leads.map((k) => heroIdentity(k).trait.kind)).size).toBe(3);
    expect(new Set(leads.map((k) => heroIdentity(k).scaling.kind)).size).toBe(3);
  });

  it('honours the golden-safety contract (HERO-FRAMEWORK.md §4)', () => {
    // The Ravager's mechanics MUST be elite-scoped + aggressive so the autoplay golden never drifts.
    expect(HERO_IDENTITIES.ravager.passive.kind).toBe('eliteDamage'); // fires only vs `elite` enemies
    expect(HERO_IDENTITIES.ravager.survival).toBe('aggressive'); // never retreats → dive AI unchanged
    // Shepherd/Overseer carry the fold-/field-based mechanics (never fielded by autoplay).
    expect(HERO_IDENTITIES.shepherd.passive.kind).toBe('towerAura');
    expect(HERO_IDENTITIES.overseer.passive.kind).toBe('vulnField');
    // Cautious/evasive heroes have a real retreat threshold; the Ravager does not.
    expect(HERO_IDENTITIES.shepherd.survival).not.toBe('aggressive');
    expect(HERO_IDENTITIES.overseer.survival).not.toBe('aggressive');
  });

  it('every hero constructs + runs a wave deterministically (wiring smoke)', () => {
    for (const k of HERO_ORDER) {
      const run = (): number => {
        const g = new Game(99, NO_META, undefined, k);
        g.startWave();
        for (let i = 0; i < 240; i++) g.advance(SIM_DT);
        return g.kills + Math.round(g.integrity);
      };
      const a = run();
      const b = run();
      expect(a, `${k} run is deterministic`).toBe(b); // same seed ⇒ same outcome
    }
  });
});
