// The REACTION TRIO (docs/TOWERS.md §reactionTrio) — three organs whose identities live in the
// status/reaction matrix, all composed from existing ability verbs (zero new sim code):
//   • Miasma Lung (Viral 'field')   — the ZONE infector: every breath coats the WHOLE pack with
//     Infection (the Nest drills one host; the Lung poisons the crowd);
//   • Chitin Bell (Resonant 'field') — the mass reaction PRIMER: each toll slams everything in
//     reach and leaves Resonance ringing, so any co-present status combusts (Shear/Melt/Rupture);
//   • Acid Lancet (Caustic 'homing') — the EXECUTIONER: one colossal harpoon per draw into the
//     FATTEST body, a melting Corrosion wound, and an artillery deadzone at its feet.
// Golden safety rides the usual invariant: all three are double-gated (unlockStage + unlockShards),
// so no fresh/golden roster ever fields them.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT, TOWER_DEFS } from './config';
import { towerSlots, nucleusPoint } from './map';
import { defaultSave } from '../save/saveStore';
import { isTowerUnlocked, towerShardGateMet } from '../state/meta';
import type { Enemy, MetaModifiers, TowerKind } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const ALL_TOWERS = Object.keys(TOWER_DEFS) as TowerKind[];
// Field towers guard the last stretch — prefer the pad nearest the Hive Core (the polyp pattern).
const rearSlots = [...towerSlots].sort(
  (a, b) =>
    Math.hypot(a.x - nucleusPoint.x, a.y - nucleusPoint.y) -
    Math.hypot(b.x - nucleusPoint.x, b.y - nucleusPoint.y),
);

/** Boot a god-mode board with the full roster unlocked and `kind` rooted on the first viable rear
 *  pad. Returns the game + the pad it grew on (tests pin enemies relative to it). */
function boot(kind: TowerKind, seed = 7): { g: Game; at: { x: number; y: number } } {
  const g = new Game(seed, NO_META, undefined, 'ravager', undefined, { unlocked: ALL_TOWERS });
  g.god = true;
  g.debugAddBiomass(4000);
  for (const s of rearSlots) if (g.placeTower(kind, s.x, s.y)) return { g, at: s };
  throw new Error(`no pad accepted the ${kind}`);
}

/** Pin every live enemy at (x, y) — the swarm stands exactly where the test needs it. */
function pinAll(g: Game, x: number, y: number): void {
  for (const e of g.enemies) if (e.alive) { e.x = x; e.y = y; }
}

/** Park the hero in the far corner — damage-isolation tests must see ONLY the tower's work
 *  (a diving Ravager one-shotting the pinned target is the classic contamination). */
function parkHero(g: Game): void {
  for (const h of g.heroes) { h.x = 30; h.y = 30; }
}

describe('double gates (docs/TOWERS.md §expansion — all three locked AND stage-gated)', () => {
  it.each([
    ['lung', 18, 240],
    ['bell', 24, 380],
    ['lancet', 34, 560],
  ] as const)('%s: locked fresh; shards gated behind stage %i; costs %i shards', (kind, stage, shards) => {
    const fresh = defaultSave();
    expect(TOWER_DEFS[kind].unlockShards).toBe(shards);
    expect(TOWER_DEFS[kind].unlockStage).toBe(stage);
    expect(isTowerUnlocked(fresh, kind)).toBe(false);
    expect(towerShardGateMet(fresh, kind)).toBe(false); // the stage gate holds the shard rollers shut
    const deep = defaultSave();
    deep.campaign.cleared.standard = stage;
    expect(towerShardGateMet(deep, kind)).toBe(true); // gate cleared ⇒ the grind may begin
    expect(isTowerUnlocked(deep, kind)).toBe(false); // …but the shards must still be earned
  });
});

describe('Miasma Lung — the zone infector', () => {
  it('one breath coats the WHOLE pack with Infection (the Nest drills one; the Lung poisons the crowd)', () => {
    const { g, at } = boot('lung');
    g.startWave();
    g.debugSpawn('tank', 4);
    // Stand the pack in the fog bank and let one breath cycle (fireInterval 1.5s).
    for (let i = 0; i < Math.ceil(2 / SIM_DT); i++) {
      pinAll(g, at.x + 80, at.y - 60);
      g.advance(SIM_DT);
    }
    const pack = g.enemies.filter((e) => e.alive);
    expect(pack.length).toBeGreaterThan(1);
    for (const e of pack) expect(e.infection, `enemy ${e.id} left the fog clean`).toBeGreaterThan(0);
  });

  it('control: the same seed without the Lung produces no Infection', () => {
    const g = new Game(7, NO_META, undefined, 'ravager', undefined, { unlocked: ALL_TOWERS });
    g.god = true;
    g.startWave();
    g.debugSpawn('tank', 4);
    for (let i = 0; i < Math.ceil(2 / SIM_DT); i++) g.advance(SIM_DT);
    for (const e of g.enemies) expect(e.infection).toBe(0);
  });
});

describe('Chitin Bell — the mass reaction primer', () => {
  it('the toll slams everything in reach and leaves Resonance ringing in the bodies', () => {
    const { g, at } = boot('bell');
    g.startWave();
    g.debugSpawn('tank', 3);
    for (let i = 0; i < Math.ceil(3 / SIM_DT); i++) {
      pinAll(g, at.x + 70, at.y - 60);
      g.advance(SIM_DT);
    }
    for (const e of g.enemies.filter((x) => x.alive)) {
      expect(e.hp).toBeLessThan(e.maxHp); // the slam wounds the crowd, not one target
      // Resonance was APPLIED each toll — anything still carrying it (or freshly consumed by a
      // reaction) proves the coat; the explicit combustion is pinned below.
    }
    expect(g.getMasteryAccrual().bell.damage).toBeGreaterThan(0);
  });

  it('PRIMES the shatter family: a fractured body combusts (SHEAR) on the very next toll', () => {
    const { g, at } = boot('bell');
    g.startWave();
    g.debugSpawn('tank', 1);
    const e: Enemy = g.enemies[0];
    e.fracture = 3; // a Kinetic partner's work (needle/spitfang stacks)
    let reacted = false;
    for (let i = 0; i < Math.ceil(3 / SIM_DT) && !reacted; i++) {
      pinAll(g, at.x + 70, at.y - 60);
      g.advance(SIM_DT);
      // resonantshear consumes BOTH fuels the moment the toll's react pass sees them co-present.
      if (e.fracture === 0 && e.resonance === 0 && e.hp < e.maxHp) reacted = true;
    }
    expect(reacted).toBe(true);
  });
});

describe('Acid Lancet — the executioner harpoon', () => {
  it('culls the FATTEST body and melts a Corrosion wound open; the chaff is beneath it', () => {
    const { g, at } = boot('lancet');
    g.startWave();
    g.debugSpawn('tank', 1); // the monster
    g.debugSpawn('runner', 3); // the chaff
    const tank = g.enemies.find((e) => e.kind === 'tank')!;
    const runners = g.enemies.filter((e) => e.kind === 'runner');
    // Stand the pack together in the engagement band (past the deadzone, inside range).
    let sawWound = false; // Corrosion is SECONDS (2s) — sample while it's live, not after it lapses
    for (let i = 0; i < Math.ceil(2.5 / SIM_DT); i++) {
      pinAll(g, at.x, at.y - 300);
      parkHero(g);
      g.advance(SIM_DT);
      if (tank.corrosion > 0) sawWound = true;
    }
    expect(tank.hp).toBeLessThan(tank.maxHp); // the draw took the monster
    expect(sawWound).toBe(true); // …and left the wound melting
    for (const r of runners) expect(r.hp).toBe(r.maxHp); // one draw, one victim — chaff untouched
  });

  it('DEADZONE: a body inside the harpoon\'s minimum draw cannot be taken', () => {
    const { g, at } = boot('lancet');
    expect(TOWER_DEFS.lancet.minRange).toBe(120);
    g.startWave();
    g.debugSpawn('tank', 1);
    const e = g.enemies[0];
    for (let i = 0; i < Math.ceil(6 / SIM_DT); i++) { // well past the 4.5s draw cadence
      pinAll(g, at.x + 60, at.y); // 60px — inside the 120px deadzone
      parkHero(g); // isolation: only the lancet may touch it
      g.advance(SIM_DT);
    }
    expect(e.hp).toBe(e.maxHp); // never targeted: the last line belongs to the brawlers
  });
});

describe('determinism', () => {
  it('a board fielding all three is byte-stable for a fixed seed', () => {
    const run = (): string => {
      const g = new Game(42, NO_META, undefined, 'ravager', undefined, { unlocked: ALL_TOWERS });
      g.god = true;
      g.debugAddBiomass(6000);
      const wanted: TowerKind[] = ['lung', 'bell', 'lancet'];
      for (const kind of wanted) {
        let ok = false;
        for (const s of rearSlots) if (g.placeTower(kind, s.x, s.y)) { ok = true; break; }
        if (!ok) throw new Error(`no pad for ${kind}`);
      }
      g.startWave();
      g.debugSpawn('tank', 4);
      for (let i = 0; i < 60 * 25; i++) g.advance(SIM_DT);
      const acc = g.getMasteryAccrual();
      return `${g.enemies.map((e) => `${e.x.toFixed(1)},${e.y.toFixed(1)},${e.hp.toFixed(1)}`).join('|')}#${Math.round(acc.lung.damage)}/${Math.round(acc.bell.damage)}/${Math.round(acc.lancet.damage)}`;
    };
    expect(run()).toBe(run());
  });
});

// The death-spread reach belongs to the tower whose plague it is: a Miasma Lung's coat leaps by the
// LUNG's spread upgrades (Adaptation/mastery), the Nest's by the Nest's — not always the Nest's.
describe('Infection death-spread follows the infecting tower', () => {
  function spreadReaches(owner: TowerKind): boolean {
    const tp = Object.fromEntries(ALL_TOWERS.map((k) => [k, { damageMult: 1, fireRateMult: 1 }])) as unknown as ConstructorParameters<typeof Game>[2] & Record<string, { infectionSpreadMult?: number }>;
    tp.lung = { ...tp.lung, infectionSpreadMult: 3 }; // a Lung with heavy spread picks; the Nest has none
    const g = new Game(11, NO_META, tp, 'ravager', undefined, { unlocked: ALL_TOWERS });
    g.god = true;
    g.startWave();
    for (let i = 0; i < 2000 && g.enemies.filter((e) => e.alive).length < 2; i++) g.advance(SIM_DT);
    const [a, b] = g.enemies.filter((e) => e.alive) as Enemy[];
    a.x = 300; a.y = 300;
    b.x = 450; b.y = 300; // 150 px: beyond the base 72 px reach, inside the Lung's ×3
    b.infection = 0;
    a.infection = 3;
    a.infectedBy = owner;
    a.hp = 0;
    g.advance(SIM_DT);
    return b.infection > 0;
  }

  it("a Lung's plague leaps by the Lung's spread upgrades", () => {
    expect(spreadReaches('lung')).toBe(true);
  });

  it("a Nest's plague keeps the Nest's (base) reach", () => {
    expect(spreadReaches('parasite')).toBe(false);
  });
  it('a real Lung breath claims the plague it lays', () => {
    const { g, at } = boot('lung');
    g.startWave();
    g.debugSpawn('tank', 3);
    for (let i = 0; i < Math.ceil(2 / SIM_DT); i++) { pinAll(g, at.x + 80, at.y - 60); g.advance(SIM_DT); }
    const coated = g.enemies.filter((e) => e.alive && e.infection > 0);
    expect(coated.length).toBeGreaterThan(0);
    for (const e of coated) expect(e.infectedBy).toBe('lung');
  });
});
