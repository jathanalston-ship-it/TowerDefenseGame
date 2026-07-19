// STRAIN verb PROBES (docs/STRAIN.md §identity table) — the functional-review coverage the
// framework tests (strains.test.ts) leave open: every tower's Strain II–V verb actually FIRES
// and changes a combat outcome, plus the projectile-pool leak/cold-alloc regression the review
// surfaced. Assertions are COMPARATIVE where possible (the strained tower produces an effect the
// Strain-I baseline never does) so each probe attributes the change to the verb, not the map.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT } from './config';
import { towerSlots } from './map';
import type { EnemyKind, MetaModifiers, TowerKind } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

/** Inject a controlled pack so a trigger-dependent verb (venom detonation, arc-with-neighbour,
 *  freeze/fear spread) actually reaches its condition — a sparse Stage wave rarely does. */
const dbg = (g: Game): { debugSpawn: (k: EnemyKind, n: number) => void } => g as unknown as { debugSpawn: (k: EnemyKind, n: number) => void };

/** A funded board of `count` towers of one kind, all pinned to `strain`, caches refreshed. The
 *  strain field is a framework test seam (acquisition is the conveyor's job at runtime). */
function board(kind: TowerKind, strain: number, count = 1, seed = 7): Game {
  // Legacy sim (disableIdle): strain-verb choreography is pinned without idle openers
  // perturbing volley counts/rng — the idle layer is covered by towerIdle.test.ts.
  const g = new Game(seed, NO_META, undefined, undefined, undefined, { disableIdle: true });
  g.biomass = 1_000_000;
  let placed = 0;
  for (const s of towerSlots) {
    if (s.index >= g.unlockedSlots) continue;
    if (g.towers.some((t) => t.slot === s.index)) continue;
    if (g.placeTower(kind, s.x, s.y)) {
      placed++;
      if (placed >= count) break;
    }
  }
  for (const t of g.towers) t.strain = strain;
  (g as unknown as { recomputeTowerCaches: () => void }).recomputeTowerCaches();
  return g;
}

type Proj = {
  alive: boolean; behavior: string; sourceKind: string | null;
  fragment?: unknown; ricochet?: unknown; venom?: unknown; knockback?: number; fragKnockback?: number;
};
const projsOf = (g: Game): Proj[] => (g as unknown as { projectiles: Proj[] }).projectiles;

/** Total sim damage over `seconds` for a fresh board (deterministic per seed). */
function damageOver(kind: TowerKind, strain: number, count: number, seconds: number, seed = 7): number {
  const g = board(kind, strain, count, seed);
  g.startWave();
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) g.advance(SIM_DT);
  return g.getRunStats().damageDealt;
}

/** Did any enemy ever carry `statusId` (stacks > 0) over the run? */
function sawStatus(kind: TowerKind, strain: number, statusId: string, count: number, seconds: number, seed = 7): boolean {
  const g = board(kind, strain, count, seed);
  g.startWave();
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
    g.advance(SIM_DT);
    if (g.enemies.some((e) => e.statuses?.some((x) => x.id === statusId && x.stacks > 0))) return true;
  }
  return false;
}

/** Cumulative projectile spawns over `seconds` (rising-edge count of the live array). */
function shotsOver(kind: TowerKind, strain: number, count: number, seconds: number, seed = 7): number {
  const g = board(kind, strain, count, seed);
  g.startWave();
  let n = 0;
  let last = 0;
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
    g.advance(SIM_DT);
    const now = projsOf(g).length;
    if (now > last) n += now - last;
    last = now;
  }
  return n;
}

describe('Needle Spitter ladder (§identity)', () => {
  it('III Hungering Barbs: needle shots carry the kill-leap payload (base needles never do)', () => {
    const carriesRicochet = (strain: number): boolean => {
      const g = board('needle', strain, 3);
      g.startWave();
      for (let i = 0; i < Math.round(30 / SIM_DT); i++) {
        g.advance(SIM_DT);
        if (projsOf(g).some((p) => p.alive && p.ricochet !== undefined)) return true;
      }
      return false;
    };
    expect(carriesRicochet(3)).toBe(true);
    expect(carriesRicochet(1)).toBe(false);
  });

  it('IV Venom Ducts: shots brand hosts with venom marks that DETONATE at the threshold', () => {
    // the venom payload rides the shot (base needles never carry it)…
    const carriesVenom = (strain: number): boolean => {
      const g = board('needle', strain, 3);
      g.startWave();
      for (let i = 0; i < Math.round(20 / SIM_DT); i++) {
        g.advance(SIM_DT);
        if (projsOf(g).some((p) => p.alive && p.venom !== undefined)) return true;
      }
      return false;
    };
    expect(carriesVenom(4)).toBe(true);
    expect(carriesVenom(1)).toBe(false);
    // …and a single needle against a tanky pack lets marks reach the 3rd stack and DETONATE
    // (venom resets to 0 the instant it bursts, while the host survives). Base needles never mark.
    const detonates = (strain: number): boolean => {
      const g = board('needle', strain, 1);
      g.startWave();
      const prev = new Map<number, number>();
      for (let i = 0; i < Math.round(30 / SIM_DT); i++) {
        if (i % 20 === 0 && i < 80) dbg(g).debugSpawn('brute', 8);
        g.advance(SIM_DT);
        for (const e of g.enemies) {
          if ((prev.get(e.id) ?? 0) >= 2 && (e.venom ?? 0) === 0 && e.alive) return true;
          prev.set(e.id, e.venom ?? 0);
        }
      }
      return false;
    };
    expect(detonates(4)).toBe(true);
    expect(detonates(1)).toBe(false);
  });

  it('V Apex Spinneret: rhythmic frenzy fires far MORE volleys than the plain organ', () => {
    expect(shotsOver('needle', 5, 1, 20)).toBeGreaterThan(shotsOver('needle', 1, 1, 20) * 1.15);
  });
});

describe('Bone Mortar ladder (§identity)', () => {
  it('III Calcified Clusters: shells carry the fragment payload and deal more damage', () => {
    const carriesFragment = (strain: number): boolean => {
      const g = board('mortar', strain, 3);
      g.startWave();
      for (let i = 0; i < Math.round(25 / SIM_DT); i++) {
        g.advance(SIM_DT);
        if (projsOf(g).some((p) => p.alive && p.fragment !== undefined)) return true;
      }
      return false;
    };
    expect(carriesFragment(3)).toBe(true);
    expect(carriesFragment(1)).toBe(false);
    expect(damageOver('mortar', 3, 3, 25)).toBeGreaterThan(damageOver('mortar', 1, 3, 25));
  });

  it('IV Shockbone Lattice: fragments inherit the stagger (fragKnockback only past IV)', () => {
    const carriesFragKnock = (strain: number): boolean => {
      const g = board('mortar', strain, 3);
      g.startWave();
      for (let i = 0; i < Math.round(25 / SIM_DT); i++) {
        g.advance(SIM_DT);
        if (projsOf(g).some((p) => p.alive && p.fragKnockback !== undefined)) return true;
      }
      return false;
    };
    expect(carriesFragKnock(4)).toBe(true);
    expect(carriesFragKnock(3)).toBe(false); // III already has fragment+knockback, but not the fragment stagger
  });

  it('V Echoing Howitzer: every shell is chased by an echo — far more splash projectiles', () => {
    expect(shotsOver('mortar', 5, 2, 20)).toBeGreaterThan(shotsOver('mortar', 3, 2, 20) * 1.5);
  });
});

describe('Flesh Reactor ladder (§identity)', () => {
  it('III Glut Sacs: a biomass SURGE erupts the moment the wave starts', () => {
    const g = board('reactor', 3, 2);
    const before = g.biomass;
    g.startWave();
    expect(g.biomass).toBeGreaterThan(before); // the surge fired on wave start (base reactors don't)
    const plain = board('reactor', 1, 2);
    const b0 = plain.biomass;
    plain.startWave();
    expect(plain.biomass).toBe(b0);
  });

  it('V Womb of the Colony: the reactor BIRTHS a harvester organism', () => {
    const g = board('reactor', 5, 1);
    g.startWave();
    let sawHarvester = false;
    for (let i = 0; i < Math.round(14 / SIM_DT) && !sawHarvester; i++) {
      g.advance(SIM_DT);
      if (g.minions.some((m) => m.kind === 'harvester')) sawHarvester = true;
    }
    expect(sawHarvester).toBe(true);
  });
});

describe('Parasite Nest ladder (§identity)', () => {
  it('II Spore Bloat: infected deaths burst a SLOWING cloud (base plague never slows)', () => {
    expect(sawStatus('parasite', 2, 'slow', 4, 40)).toBe(true);
    expect(sawStatus('parasite', 1, 'slow', 4, 40)).toBe(false);
  });

  it('III Leaping Broodworm: the plague reaches MORE distinct hosts than native spread alone', () => {
    const distinctInfected = (strain: number): number => {
      const g = board('parasite', strain, 3);
      g.startWave();
      const ids = new Set<number>();
      for (let i = 0; i < Math.round(40 / SIM_DT); i++) {
        if (i % 20 === 0 && i < 120) dbg(g).debugSpawn('brute', 8);
        g.advance(SIM_DT);
        for (const e of g.enemies) if (e.infection > 0) ids.add(e.id);
      }
      return ids.size;
    };
    expect(distinctInfected(3)).toBeGreaterThan(distinctInfected(1));
  });
});

describe('Neural Obelisk ladder (§identity)', () => {
  it('III Arc Synapse: charged hosts DISCHARGE — arc damage the charge-only field never dealt', () => {
    expect(damageOver('obelisk', 3, 3, 40)).toBeGreaterThan(damageOver('obelisk', 2, 3, 40));
  });

  it('IV Overload Cortex: discharges STUN their victims (the charging field never stuns)', () => {
    // seed 42 packs the lane densely enough that discharges find arc neighbours to stun
    expect(sawStatus('obelisk', 4, 'stun', 5, 50, 42)).toBe(true);
    expect(sawStatus('obelisk', 2, 'stun', 5, 50, 42)).toBe(false);
  });

  it('V Storm Crown: forked discharges strike more victims — more total damage than un-forked', () => {
    expect(damageOver('obelisk', 5, 3, 40)).toBeGreaterThan(damageOver('obelisk', 3, 3, 40));
  });
});

describe('Carrion Maw ladder (§identity)', () => {
  it('II Gorging Gullet: kills FEED the maw — glut accumulates on the tower', () => {
    const g = board('maw', 2, 3);
    g.startWave();
    let sawGlut = false;
    for (let i = 0; i < Math.round(40 / SIM_DT) && !sawGlut; i++) {
      g.advance(SIM_DT);
      if (g.towers.some((t) => (t.glut ?? 0) > 0)) sawGlut = true;
    }
    expect(sawGlut).toBe(true);
    // base maws never gorge
    const plain = board('maw', 1, 3);
    plain.startWave();
    for (let i = 0; i < Math.round(40 / SIM_DT); i++) plain.advance(SIM_DT);
    expect(plain.towers.every((t) => (t.glut ?? 0) === 0)).toBe(true);
  });

  it('III Bone Vice: the bite GRIPS everything in the jaws (base maw never stuns)', () => {
    expect(sawStatus('maw', 3, 'stun', 3, 40)).toBe(true);
    expect(sawStatus('maw', 1, 'stun', 3, 40)).toBe(false);
  });

  it('IV Acid Reflux: the maw REGURGITATES bone volleys — projectiles from a melee brawler', () => {
    const firesVolley = (strain: number): boolean => {
      const g = board('maw', strain, 3);
      g.startWave();
      for (let i = 0; i < Math.round(40 / SIM_DT); i++) {
        g.advance(SIM_DT);
        if (projsOf(g).some((p) => p.alive && p.sourceKind === 'maw')) return true;
      }
      return false;
    };
    expect(firesVolley(4)).toBe(true);
    expect(firesVolley(1)).toBe(false); // the base bite is a fieldless cleave — zero projectiles
  });

  it('V Apex Devourer: a full-glut bite adds a wider second sweep (more damage than Strain I)', () => {
    const withApex = (): number => {
      const g = board('maw', 5, 3);
      for (const t of g.towers) t.glut = 8; // full glut — the apex sweep is armed
      g.startWave();
      for (let i = 0; i < Math.round(20 / SIM_DT); i++) g.advance(SIM_DT);
      return g.getRunStats().damageDealt;
    };
    expect(withApex()).toBeGreaterThan(damageOver('maw', 1, 3, 20));
  });
});

describe('Amber Chrysalis ladder (§identity)', () => {
  it('II Setting Resin: a broken casing SLICKS the ground (base chrysalis never slows)', () => {
    expect(sawStatus('chrysalis', 2, 'slow', 4, 45)).toBe(true);
    expect(sawStatus('chrysalis', 1, 'slow', 4, 45)).toBe(false);
  });

  it('III Splinter Shards: shattering casings wound nearby — more damage than the plain warden', () => {
    expect(damageOver('chrysalis', 3, 4, 45)).toBeGreaterThan(damageOver('chrysalis', 1, 4, 45));
  });

  it('IV Twin Cocoon: refusing preserved bodies locks MORE distinct victims (dense pack)', () => {
    const distinctFrozen = (strain: number): number => {
      const g = board('chrysalis', strain, 4);
      g.startWave();
      const ids = new Set<number>();
      for (let i = 0; i < Math.round(45 / SIM_DT); i++) {
        if (i % 20 === 0 && i < 120) dbg(g).debugSpawn('brute', 8);
        g.advance(SIM_DT);
        for (const e of g.enemies) if (e.statuses?.some((x) => x.id === 'freeze' && x.stacks > 0)) ids.add(e.id);
      }
      return ids.size;
    };
    expect(distinctFrozen(4)).toBeGreaterThan(distinctFrozen(1));
  });

  it('V Living Amber: encased victims are SIPHONED — more damage than Strain I', () => {
    expect(damageOver('chrysalis', 5, 4, 45)).toBeGreaterThan(damageOver('chrysalis', 1, 4, 45));
  });
});

describe('Wailing Effigy ladder (§identity)', () => {
  it('II Creeping Dread: fading panic CHILLS the body (base effigy fears but never slows)', () => {
    expect(sawStatus('effigy', 2, 'slow', 4, 45)).toBe(true);
    expect(sawStatus('effigy', 1, 'slow', 4, 45)).toBe(false);
  });

  it('III Contagious Panic: a feared death SPREADS its panic to a nearby un-feared mind', () => {
    // Feared enemies FLEE and rarely die feared, so drive the trigger directly: an off-field
    // effigy supplies the KIT (its strain sets effigyKit.fearContagion), two neighbours sit
    // un-feared, one dies WHILE feared. Only Strain III carries the spread.
    const spreads = (strain: number): boolean => {
      const g = board('effigy', strain, 1);
      const eff = g.towers[0];
      eff.x = -1000; eff.y = -1000; // park it off-field so it can't fear the probe pair itself
      g.startWave();
      dbg(g).debugSpawn('brute', 2);
      for (let i = 0; i < 3; i++) g.advance(SIM_DT); // let the pair settle (still adjacent)
      const pair = g.enemies.filter((e) => e.alive);
      if (pair.length < 2) return false;
      const [a, b] = pair;
      for (const e of [a, b]) if (e.statuses) e.statuses = e.statuses.filter((x) => x.id !== 'fear');
      g.applyEffect(a, 'fear');
      a.hp = 0; // a dies WHILE feared on the next tick
      const before = b.statuses?.some((x) => x.id === 'fear' && x.stacks > 0) ?? false;
      g.advance(SIM_DT); // deathSystem runs the contagion verb
      const after = b.statuses?.some((x) => x.id === 'fear' && x.stacks > 0) ?? false;
      return !a.alive && !before && after;
    };
    expect(spreads(3)).toBe(true);
    expect(spreads(1)).toBe(false); // Strain-I panic does not spread on death
  });

  it('IV Nightmare Feast: the pulse WOUNDS feared minds — more damage than the plain wail', () => {
    expect(damageOver('effigy', 4, 4, 45)).toBeGreaterThan(damageOver('effigy', 1, 4, 45));
  });

  it('V Death Knell: fading panic detonates a psychic BACKLASH — more damage than Strain I', () => {
    expect(damageOver('effigy', 5, 4, 45)).toBeGreaterThan(damageOver('effigy', 1, 4, 45));
  });
});

describe('projectile pool: STRAIN payloads never leak and never drop (review regression)', () => {
  it('a reused pooled shot does NOT inherit a prior strained cast’s venom (the leak)', () => {
    const g = new Game(7, NO_META, undefined, undefined, undefined, { disableIdle: true });
    const gg = g as unknown as {
      castVenom: { threshold: number; burstFrac: number } | null;
      spawnProjectile: (x: number, y: number, tx: number, ty: number, speed: number, targetId: number, damage: number, behavior: string, splash: number, sourceKind: string | null) => void;
      projectiles: { venom?: unknown; alive: boolean }[];
      releaseProjectile: (p: unknown) => void;
    };
    gg.castVenom = { threshold: 3, burstFrac: 1.6 };
    gg.spawnProjectile(100, 100, 200, 100, 300, -1, 10, 'homing', 0, 'needle');
    const strained = gg.projectiles[gg.projectiles.length - 1];
    expect(strained.venom).toBeDefined();
    strained.alive = false;
    gg.releaseProjectile(strained); // back into the pool, still carrying venom
    gg.castVenom = null; // a plain cast now pops the same object
    gg.spawnProjectile(100, 100, 200, 100, 300, -1, 10, 'homing', 0, 'needle');
    const reused = gg.projectiles[gg.projectiles.length - 1];
    expect(reused).toBe(strained); // proves the pooled object was recycled
    expect(reused.venom).toBeUndefined(); // …yet the venom was cleared, not leaked
  });

  it('a COLD-allocated shot (empty pool) still carries its strain payload (the drop)', () => {
    const g = new Game(7, NO_META, undefined, undefined, undefined, { disableIdle: true });
    const gg = g as unknown as {
      castFragment: { count: number; damageFrac: number; radius: number } | null;
      spawnProjectile: (x: number, y: number, tx: number, ty: number, speed: number, targetId: number, damage: number, behavior: string, splash: number, sourceKind: string | null) => void;
      projectiles: { fragment?: unknown }[];
      projPool: unknown[];
    };
    while (gg.projPool.length) gg.projPool.pop(); // force the cold path
    gg.castFragment = { count: 3, damageFrac: 0.35, radius: 42 };
    gg.spawnProjectile(100, 100, 200, 100, 300, -1, 10, 'splash', 30, 'mortar');
    const cold = gg.projectiles[gg.projectiles.length - 1];
    expect(cold.fragment).toBeDefined();
  });
});
