// The ANSWER ROSTER (docs/TOWERS.md §answers) — three organs, each the designed answer to a role the
// board could not express, all composed from existing verbs (zero new sim code):
//   • Gristle Warren (Vital 'field' barracks) — musters body-blocking THRALLS that hold the lane;
//     fliers and burrowers pass them by (the standing body-block rule);
//   • Tick Battery (Viral 'infest' seeder) — one volley seeds Infection in THREE distinct hosts, at
//     the first long reach a Viral organ has had;
//   • Keening Quill (Resonant 'homing' armor-breaker) — rings Resonance into its mark at the cast and
//     the impact SHEARS it: a true burst + an armor-break window every tower exploits.
// Golden safety rides the usual invariant: all three are double-gated (unlockStage + unlockShards),
// so no fresh/golden roster ever fields them.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { MINION_DEFS, REACTIONS, SIM_DT, TOWER_DEFS } from './config';
import { towerSlots, nucleusPoint } from './map';
import { defaultSave } from '../save/saveStore';
import { isTowerUnlocked, towerShardGateMet } from '../state/meta';
import type { EnemyKind, MetaModifiers, TowerKind } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const ALL_TOWERS = Object.keys(TOWER_DEFS) as TowerKind[];
const rearSlots = [...towerSlots].sort(
  (a, b) =>
    Math.hypot(a.x - nucleusPoint.x, a.y - nucleusPoint.y) -
    Math.hypot(b.x - nucleusPoint.x, b.y - nucleusPoint.y),
);

/** A god-mode board with the full roster unlocked and `kinds` rooted on the rear pads (first kind
 *  on the rearmost viable pad). Returns the game + the first tower's pad. */
function boot(kinds: TowerKind[], seed = 7): { g: Game; at: { x: number; y: number } } {
  const g = new Game(seed, NO_META, undefined, 'ravager', undefined, { unlocked: ALL_TOWERS });
  g.god = true;
  g.debugAddBiomass(9000);
  let at: { x: number; y: number } | null = null;
  for (const k of kinds) {
    for (const s of rearSlots) if (g.placeTower(k, s.x, s.y)) { at ??= s; break; }
  }
  if (!at) throw new Error(`no pad accepted ${kinds.join('+')}`);
  return { g, at };
}

/** Park every hero in the far corner — isolation tests must see only the towers' work. */
function parkHero(g: Game): void {
  for (const h of g.heroes) { h.x = 30; h.y = 30; }
}

/** Run `secs` with `kind` pinned `dist` px up-lane of `at` (a 4-wide grid); returns the HP removed. */
function pinnedDamage(g: Game, at: { x: number; y: number }, kind: EnemyKind, n: number, secs: number, dist = 150): number {
  g.startWave();
  g.debugSpawn(kind, n);
  const pack = g.enemies.filter((e) => e.kind === kind);
  const hp0 = pack.reduce((a, e) => a + e.maxHp, 0);
  for (let i = 0; i < Math.ceil(secs / SIM_DT); i++) {
    let j = 0;
    for (const e of pack) if (e.alive) { e.x = at.x + ((j % 4) - 1.5) * 22; e.y = at.y - dist + Math.floor(j / 4) * 22; j++; }
    parkHero(g);
    g.advance(SIM_DT);
  }
  return hp0 - pack.reduce((a, e) => a + (e.alive ? Math.max(0, e.hp) : 0), 0);
}

describe('double gates (locked AND stage-gated — the progression droughts filled)', () => {
  it.each([
    ['warren', 6, 110],
    ['tick', 10, 180],
    ['quill', 28, 460],
  ] as const)('%s: locked fresh; shards gated behind stage %i; costs %i shards', (kind, stage, shards) => {
    const fresh = defaultSave();
    expect(TOWER_DEFS[kind].unlockShards).toBe(shards);
    expect(TOWER_DEFS[kind].unlockStage).toBe(stage);
    expect(isTowerUnlocked(fresh, kind)).toBe(false);
    expect(towerShardGateMet(fresh, kind)).toBe(false);
    const deep = defaultSave();
    deep.campaign.cleared.standard = stage;
    expect(towerShardGateMet(deep, kind)).toBe(true);
    expect(isTowerUnlocked(deep, kind)).toBe(false); // the shards must still be earned
  });
});

describe('Gristle Warren — the barracks', () => {
  it('musters a Gristle Thrall only while a threat is inside its reach', () => {
    const { g, at } = boot(['warren']);
    parkHero(g);
    for (let i = 0; i < Math.ceil(6 / SIM_DT); i++) g.advance(SIM_DT); // an empty lane: no muster
    expect(g.minions.length).toBe(0);
    g.startWave();
    g.debugSpawn('brute', 1);
    const e = g.enemies.find((x) => x.kind === 'brute')!;
    for (let i = 0; i < Math.ceil(1 / SIM_DT) && g.minions.length === 0; i++) {
      e.x = at.x; e.y = at.y - 150; // inside the 230 px muster reach
      parkHero(g);
      g.advance(SIM_DT);
    }
    expect(g.minions.some((m) => m.kind === 'gristle')).toBe(true);
    expect(g.minions[0].maxHp).toBe(MINION_DEFS.gristle.hp);
  });

  it('a thrall HOLDS a ground enemy, but a flier passes over the wall', () => {
    const { g, at } = boot(['warren']);
    g.startWave();
    g.debugSpawn('brute', 1);
    g.debugSpawn('blightmoth', 1);
    const brute = g.enemies.find((x) => x.kind === 'brute')!;
    const moth = g.enemies.find((x) => x.kind === 'blightmoth')!;
    for (let i = 0; i < Math.ceil(1 / SIM_DT) && g.minions.length === 0; i++) {
      brute.x = at.x; brute.y = at.y - 150;
      moth.x = at.x + 200; moth.y = 300;
      parkHero(g);
      g.advance(SIM_DT);
    }
    const thrall = g.minions[0];
    expect(thrall).toBeDefined();
    const by0 = brute.y;
    for (let i = 0; i < 30; i++) {
      thrall.x = brute.x; thrall.y = brute.y; // hold the wall in contact with the brute
      parkHero(g);
      g.advance(SIM_DT);
    }
    expect(brute.y).toBe(by0); // held — it never advanced past the wall
    expect(thrall.hp).toBeLessThan(thrall.maxHp); // …and it chewed the wall instead
    const my0 = moth.y;
    for (let i = 0; i < 30; i++) {
      thrall.x = moth.x; thrall.y = moth.y; // the same wall, in contact with the moth
      parkHero(g);
      g.advance(SIM_DT);
    }
    expect(moth.y).not.toBe(my0); // the flier drifts on — the body-block rule ignores it
  });
});

describe('Tick Battery — patient zero', () => {
  it('one volley seeds Infection in THREE distinct hosts (the Nest drills one)', () => {
    const { g, at } = boot(['tick']);
    g.startWave();
    g.debugSpawn('tank', 5);
    const pack = g.enemies.filter((e) => e.kind === 'tank');
    let infected = 0;
    for (let i = 0; i < Math.ceil(2.4 / SIM_DT) && infected < 3; i++) {
      pack.forEach((e, j) => { e.x = at.x - 120 + j * 60; e.y = at.y - 360; }); // far up-lane — the long reach
      parkHero(g);
      g.advance(SIM_DT);
      infected = pack.filter((e) => e.infection > 0).length;
    }
    expect(infected).toBe(3);
  });

  it('control: a Parasite Nest volley infects ONE host', () => {
    const { g, at } = boot(['parasite']);
    g.startWave();
    g.debugSpawn('tank', 5);
    const pack = g.enemies.filter((e) => e.kind === 'tank');
    for (let i = 0; i < Math.ceil(1.2 / SIM_DT); i++) {
      pack.forEach((e, j) => { e.x = at.x - 120 + j * 60; e.y = at.y - 220; });
      parkHero(g);
      g.advance(SIM_DT);
    }
    expect(pack.filter((e) => e.infection > 0).length).toBe(1);
  });
});

describe('Keening Quill — the armor-breaker', () => {
  it('the Chitin Scuttler shrugs off chip — until the Quill SHEARS it', () => {
    // 18 plate: a Spitfang round (12) lands for the 1-damage floor until Fracture shreds it down.
    const spit = boot(['spitfang']);
    const chip = pinnedDamage(spit.g, spit.at, 'scuttler', 1, 4, 300);
    const { g, at } = boot(['quill']);
    const sheared = pinnedDamage(g, at, 'scuttler', 1, 4, 300);
    expect(sheared).toBeGreaterThan(2 * REACTIONS.resoBurst); // at least two true-damage shears landed
    expect(sheared).toBeGreaterThan(2 * chip);
  });

  it("the shear's armor break lets a PARTNER's chip bite through (board-wide value)", () => {
    const solo = boot(['needle']);
    pinnedDamage(solo.g, solo.at, 'scuttler', 2, 6, 300);
    const paired = boot(['needle', 'quill']);
    pinnedDamage(paired.g, paired.at, 'scuttler', 2, 6, 300);
    const needleSolo = solo.g.getMasteryAccrual().needle.damage;
    const needlePaired = paired.g.getMasteryAccrual().needle.damage;
    expect(needlePaired).toBeGreaterThan(needleSolo * 1.5);
  });
});

describe('balance — each answer sits inside its cost band (controlled pinned-pack probe)', () => {
  // Damage per second per 100 Biomass of tower cost vs a 4-Brute pack (armor 8) over 10 s — the same
  // probe that tuned them (docs/TOWERS.md §answers). Bands are the class/cost neighbours' envelope.
  const perCost = (k: TowerKind): number => {
    const { g, at } = boot([k]);
    return (pinnedDamage(g, at, 'brute', 4, 10) / 10) * (100 / TOWER_DEFS[k].cost);
  };
  it('Tick Battery: at or below the Miasma Lung, above the Parasite Nest (a reach organ, not a crowd melter)', () => {
    const tick = perCost('tick');
    expect(tick).toBeLessThanOrEqual(perCost('lung'));
    expect(tick).toBeGreaterThan(perCost('parasite'));
  });
  it('Keening Quill: a utility gun — solo output no richer than the Spitfang autocannon', () => {
    expect(perCost('quill')).toBeLessThanOrEqual(perCost('spitfang'));
  });
});
