// CARRION (Vital charnel) — the death-caste and its GRAVEBIND identity: enemies that die near
// it RISE as Risen Thralls that fight for the hive. Pins:
//   • the raise: a corpse falling in reach stands back up as a thrall carrying a fraction of
//     its own body (floored at the thrall MinionDef, deepened by the shared per-wave scaling);
//   • the discipline: one raise per cadence window, never past its own thrall cap, bosses stay
//     down, far corpses stay down;
//   • uniquely progression-gated on the corpse ledger (lifetimeKills) — the FIFTH milestone
//     lens, never Shards;
//   • golden-safe: the death-seam hook is null-gated on the fielded raiser — the default
//     Ravager autoplay run raises nothing.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { GRAVEBIND, HERO_DEFS, MINION_DEFS, SIM_DT } from './config';
import type { MetaModifiers } from './types';
import { defaultSave } from '../save/saveStore';
import { heroIdentity } from './heroIdentity';
import { isHeroUnlocked, meta } from '../state/meta';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

/** Pin an enemy onto the hero and execute it — the corpse falls exactly in the Carrion's reach. */
function executeAt(g: Game, x: number, y: number, n = 1): void {
  const es = g.enemies.filter((e) => e.alive).slice(0, n);
  for (const e of es) { e.x = x; e.y = y; e.hp = 0; }
}

describe('Carrion — the Gravebind (corpses rise as thralls)', () => {
  it('a corpse falling in reach RISES, carrying a fraction of its own body', () => {
    const g = new Game(5, NO_META, undefined, 'carrion');
    g.startWave();
    g.debugSpawn('brute', 1);
    const h = g.heroes[0];
    expect(h.kind).toBe('carrion');
    const brute = g.enemies[0];
    const corpseHp = brute.maxHp;
    expect(g.minions.length).toBe(0);
    executeAt(g, h.x, h.y);
    g.advance(SIM_DT); // the death seam runs — the body claws back up
    const thrall = g.minions.find((m) => m.kind === 'thrall');
    expect(thrall).toBeTruthy();
    // corpse-scaled: max(floor, corpse × hpFrac) × the per-wave deepening (wave 1 ⇒ ~×1.015)
    const id = heroIdentity('carrion');
    const depth = 1 + Math.min(id.scaling.cap, 1 * id.scaling.perStack);
    expect(thrall!.maxHp).toBeCloseTo(Math.max(MINION_DEFS.thrall.hp, corpseHp * GRAVEBIND.hpFrac) * depth, 6);
    expect(thrall!.x).toBeCloseTo(h.x, 5); // it rises WHERE it fell
  });

  it('discipline: one raise per cadence window, capped at its own thrall count, bosses stay down', () => {
    const g = new Game(5, NO_META, undefined, 'carrion');
    g.startWave();
    g.debugSpawn('brute', 8);
    const h = g.heroes[0];
    executeAt(g, h.x, h.y, 8); // a full swarm wipe on one tick …
    g.advance(SIM_DT);
    expect(g.minions.filter((m) => m.kind === 'thrall').length).toBe(1); // … raises exactly ONE (cadence)
    // Grind kills across cadence windows — the risen never exceed the Carrion's own cap.
    for (let round = 0; round < 8; round++) {
      g.debugSpawn('brute', 2);
      for (let i = 0; i < Math.ceil((GRAVEBIND.cadenceSec + 0.1) / SIM_DT); i++) {
        executeAt(g, h.x, h.y, 2);
        g.advance(SIM_DT);
      }
    }
    expect(g.minions.filter((m) => m.kind === 'thrall' && m.alive).length).toBeLessThanOrEqual(GRAVEBIND.maxThralls);
    // A boss corpse is a trophy, not a tool.
    g.debugSpawn('brute', 1);
    const boss = g.enemies.find((e) => e.alive)!;
    boss.boss = {} as unknown as NonNullable<typeof boss.boss>; // truthy boss runtime — a trophy, not a tool
    const before = g.minions.length;
    for (let i = 0; i < Math.ceil((GRAVEBIND.cadenceSec + 0.1) / SIM_DT); i++) g.advance(SIM_DT); // clear the cadence
    boss.x = h.x; boss.y = h.y; boss.hp = 0;
    g.advance(SIM_DT);
    expect(g.minions.length).toBe(before); // no rise
  });

  it('far corpses do not answer (the radius is the leash)', () => {
    const g = new Game(5, NO_META, undefined, 'carrion');
    g.startWave();
    g.debugSpawn('brute', 1);
    const h = g.heroes[0];
    executeAt(g, h.x + GRAVEBIND.radius + 120, h.y); // dies well out of reach
    g.advance(SIM_DT);
    expect(g.minions.filter((m) => m.kind === 'thrall').length).toBe(0);
  });

  it('golden control: the default Ravager run raises nothing from its kills', () => {
    const g = new Game(5, NO_META); // defaults to the Ravager
    g.startWave();
    g.debugSpawn('brute', 3);
    const h = g.heroes[0];
    executeAt(g, h.x, h.y, 3);
    for (let i = 0; i < 120; i++) g.advance(SIM_DT);
    expect(g.minions.filter((m) => m.kind === 'thrall').length).toBe(0);
  });
});

describe('Carrion — uniquely progression-gated (the corpse ledger)', () => {
  it('locked fresh; unlocks at 20,000 lifetime kills; the FIFTH distinct gate axis', () => {
    const fresh = defaultSave();
    expect(isHeroUnlocked(fresh, 'carrion')).toBe(false);
    expect(HERO_DEFS.carrion.unlock).toEqual({ kind: 'lifetimeKills', count: 20000, label: 'Slay 20,000 enemies (lifetime)' });
    expect(HERO_DEFS.carrion.unlockShards).toBeUndefined(); // never bought with Shards
    expect(isHeroUnlocked({ ...fresh, stats: { ...fresh.stats, lifetimeKills: 19999 } }, 'carrion')).toBe(false);
    expect(isHeroUnlocked({ ...fresh, stats: { ...fresh.stats, lifetimeKills: 20000 } }, 'carrion')).toBe(true);
  });

  it('can never be claimed with Hero Shards (milestone-only)', () => {
    meta.reset();
    expect(meta.unlockHero('carrion')).toBe(false);
  });
});
