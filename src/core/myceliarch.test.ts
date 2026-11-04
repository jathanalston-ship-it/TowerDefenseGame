// MYCELIARCH (Viral gatekeeper — docs/HEROES.md §myceliarch) — the guard that KILLS at the gate. Pins:
//   • the chassis: the Shepherd's 'guard' brain reused (zero new sim code) — it holds the defense
//     zone and its PULSE is the weapon: real damage + a sticky Disruption stagger on what breaches;
//   • Sporefall: the cast seeds deep Infection in everything caught and mends the Hive;
//   • the identity: the Revenant's viralVuln passive on a second hero (the generic hook);
//   • the ★5/★8 forks resolve to their authored upgrades;
//   • milestone-gated (8,000 lifetime kills) — locked fresh, and never in the hero-Shard pool, so a
//     fresh account's hero-Shard drops are unchanged.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { HERO_DEFS, SIM_DT, resolveHeroKit } from './config';
import { DEFENSE_TOP_Y, nucleusPoint } from './map';
import type { MetaModifiers } from './types';
import { defaultSave } from '../save/saveStore';
import { heroIdentity } from './heroIdentity';
import { heroShardUnlockPool, isHeroUnlocked } from '../state/meta';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

describe('Myceliarch — the gatekeeper (Viral guard)', () => {
  it('holds the gate: its spore pulse wounds AND staggers what breaches the defense zone', () => {
    const g = new Game(5, NO_META, undefined, 'myceliarch');
    g.god = true;
    g.startWave();
    g.debugSpawn('brute', 1);
    const h = g.heroes[0];
    const e = g.enemies.find((x) => x.kind === 'brute')!;
    let staggered = false;
    for (let i = 0; i < Math.ceil(4 / SIM_DT); i++) {
      e.x = nucleusPoint.x; e.y = DEFENSE_TOP_Y + 40; // a leak pressing the gate
      g.advance(SIM_DT);
      if (e.disrupt > 0) staggered = true;
    }
    expect(h.y).toBeGreaterThanOrEqual(DEFENSE_TOP_Y - 40); // it never left the zone to hunt
    expect(e.hp).toBeLessThan(e.maxHp); // the pulse is real damage (the Shepherd's is a token)
    expect(staggered).toBe(true); // …with the Sticky Spores stagger
  });

  it('Sporefall seeds deep Infection in everything caught', () => {
    const g = new Game(5, NO_META, undefined, 'myceliarch');
    g.god = true;
    g.startWave();
    g.debugSpawn('tank', 3);
    const pack = g.enemies.filter((x) => x.kind === 'tank');
    const P = { x: nucleusPoint.x, y: DEFENSE_TOP_Y + 20 };
    const pin = (): void => pack.forEach((e, j) => { e.x = P.x - 40 + j * 40; e.y = P.y; });
    pin();
    g.armAbility();
    g.click(P.x, P.y);
    for (let i = 0; i < Math.ceil(0.6 / SIM_DT); i++) { pin(); g.advance(SIM_DT); } // past the 0.35 s landing
    for (const e of pack) expect(e.infection, `tank ${e.id} escaped the spore-fall`).toBeGreaterThanOrEqual(3);
  });

  it('wires the shared viralVuln identity (a second consumer of the Revenant hook)', () => {
    const id = heroIdentity('myceliarch');
    expect(id.passive.kind).toBe('viralVuln');
    expect(id.scaling.kind).toBe('virulence');
    expect(id.survival).toBe('cautious');
    expect(HERO_DEFS.myceliarch.behavior).toBe('guard'); // the Shepherd's brain, reused
    expect(HERO_DEFS.myceliarch.combatClass).toBe('Viral');
    expect(HERO_DEFS.myceliarch.pulseDamage).toBeGreaterThan(HERO_DEFS.shepherd.pulseDamage); // it KILLS at the gate
  });

  it('the ★5/★8 forks resolve to their authored upgrades', () => {
    const base = resolveHeroKit('myceliarch', 0);
    expect(base.ult.name).toBe('Sporefall');
    const rot = resolveHeroKit('myceliarch', 8, { '5': 'rotwarden', '8': 'deathcap' });
    const bloom = resolveHeroKit('myceliarch', 8, { '5': 'bloomwarden', '8': 'hyphalfortress' });
    expect(rot.skills[1].name).toBe('Deathcap');
    expect(rot.ult.infect).toBe((HERO_DEFS.myceliarch.ability.infect ?? 0) + 2);
    expect(bloom.skills[0].name).toBe('Hyphal Fortress');
    expect(bloom.ult.radius).toBeGreaterThan(rot.ult.radius);
  });

  it('milestone-gated: locked fresh, earned at 8,000 lifetime kills, never in the hero-Shard pool', () => {
    const fresh = defaultSave();
    expect(isHeroUnlocked(fresh, 'myceliarch')).toBe(false);
    expect(HERO_DEFS.myceliarch.unlock).toEqual({ kind: 'lifetimeKills', count: 8000, label: 'Slay 8,000 enemies (lifetime)' });
    expect(HERO_DEFS.myceliarch.unlockShards ?? 0).toBe(0);
    expect(heroShardUnlockPool(fresh)).not.toContain('myceliarch'); // fresh hero-Shard drops unchanged
    const vet = defaultSave();
    vet.stats.lifetimeKills = 8000;
    expect(isHeroUnlocked(vet, 'myceliarch')).toBe(true);
  });
});
