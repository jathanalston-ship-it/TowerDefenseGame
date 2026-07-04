// AI Director (STAGES.md §6 threat-budget + §9 elites + §13 anti-stagnation). It
// generates Endless waves dynamically — spending a depth-scaled threat budget on a
// rotating WAVE SHAPE (so two waves never feel the same), promoting elites at a rising
// rate, and timing minibosses + swarm events. Goal: fresh but FAIR. Pure given its rng
// (deterministic from the run seed); the Game executes what it emits. No DOM.
//
// Stage Mode keeps the authored WAVES (so the golden run is untouched); Endless Mode
// drives spawning entirely through this Director. Same enemy/boss data feeds both.

import { DIRECTOR, ENEMY_DEFS } from './config';
import { effectiveHp } from './campaign';
import { STANDARD } from './difficulty';
import type { DifficultyDef } from './difficulty';
import type { Biome } from './biomes';
import type { EnemyKind } from './types';

export type WaveShape = 'swarm' | 'armored' | 'mixed' | 'rush' | 'elite' | 'air' | 'siege' | 'horror' | 'boss';

export interface DirectorGroup {
  kind: EnemyKind;
  count: number;
  elite: boolean;
}
export interface DirectorWave {
  depth: number;
  shape: WaveShape;
  groups: DirectorGroup[];
  spawnBoss: boolean; // a procedural (mini)boss caps this wave
  swarmEvent: boolean; // a burst of extra chaff mid-wave
  eliteChance: number;
}

// Each shape's roster (which archetypes it draws from) — the build-counter pressure. The
// expanded roster pulls in the new roles so endless waves cycle through the full bestiary.
const ROSTER: Record<Exclude<WaveShape, 'boss'>, EnemyKind[]> = {
  swarm: ['runner', 'mite', 'larva', 'rusher'],
  armored: ['brute', 'tank', 'golem', 'warden', 'bulwark', 'colossus'],
  mixed: ['runner', 'brute', 'flyer', 'rusher', 'knitter', 'molerat', 'burrower'],
  rush: ['rusher', 'darter', 'lasher', 'runner', 'molerat'],
  elite: ['brute', 'tank', 'revenant', 'gargoyle', 'apex', 'dreadnought'],
  air: ['flyer', 'wisp', 'gargoyle'],
  siege: ['siegeworm', 'spitter', 'warden'],
  horror: ['broodmother', 'hivecaller', 'mender', 'cantor', 'bomber', 'popper'],
};
const SHAPE_ROTATION: Exclude<WaveShape, 'boss'>[] = ['swarm', 'armored', 'mixed', 'rush', 'elite', 'air', 'siege', 'horror'];
// Depth gate per shape (docs/HIVE-SIEGE.md §ranged/§balance): under siege combat a heavy the
// opening build can't kill doesn't leak once and vanish — it PARKS at the Core and chews. So
// the punishing shapes wait until the board can actually answer them (mirrors the campaign's
// staggered unlocks). Depth 1–2 is chaff; heavies from 6; the elite shape from 8.
const SHAPE_DEPTH: Record<Exclude<WaveShape, 'boss'>, number> = {
  swarm: 1, rush: 1, mixed: 3, air: 3, siege: 5, horror: 5, armored: 6, elite: 8,
};

type Rng = () => number;
const pick = <T>(rng: Rng, a: readonly T[]): T => a[Math.floor(rng() * a.length)];

export class Director {
  private lastShape: WaveShape | null = null;

  // The universal difficulty framework supplies the elite-chance and boss-frequency
  // scalars; at Standard (identity) the Director behaves exactly as before.
  constructor(private rng: Rng, private diff: DifficultyDef = STANDARD) {}

  /** Produce the next endless wave for a given depth (1-based). The active biome (Infinite mode,
   *  docs/BIOMES.md) scales elite frequency and injects its signature kinds into the roster;
   *  omitted ⇒ unchanged behaviour (the director test + any biome-less caller stay identical). */
  next(depth: number, biome?: Biome): DirectorWave {
    // Population saturates: the budget (→ enemy count) ramps early then CAPS, so past ~depth 18
    // the battlefield holds a max headcount and difficulty comes from HP/elites, not more bodies.
    const budget = Math.min(DIRECTOR.budgetCap, DIRECTOR.baseBudget * Math.pow(1 + DIRECTOR.budgetGrowth, depth - 1));
    const eliteMult = biome ? biome.mods.eliteMult : 1;
    const eliteChance = Math.min(
      0.5,
      (DIRECTOR.eliteChanceBase + DIRECTOR.eliteChancePerDepth * depth) * this.diff.eliteChanceMult * eliteMult,
    );
    // Difficulty scales how often a (mini)boss caps a wave (>1 = more often).
    const bossEvery = Math.max(1, Math.round(DIRECTOR.bossEvery / this.diff.bossFrequencyMult));

    // Boss cadence: a procedural (mini)boss caps the wave, escorted by light chaff.
    if (depth % bossEvery === 0) {
      const escort = this.spend(budget * 0.4, 'mixed', eliteChance, biome, depth);
      this.lastShape = 'boss';
      return { depth, shape: 'boss', groups: escort, spawnBoss: true, swarmEvent: false, eliteChance };
    }

    // Anti-monotony: never repeat the previous shape (STAGES §13 wave-shape rotation),
    // drawing only from the shapes this depth has unlocked (see SHAPE_DEPTH).
    const unlocked = SHAPE_ROTATION.filter((sh) => depth >= SHAPE_DEPTH[sh]);
    let shape: Exclude<WaveShape, 'boss'> = pick(this.rng, unlocked);
    let guard = 0;
    while (shape === this.lastShape && guard++ < 8) shape = pick(this.rng, unlocked);
    this.lastShape = shape;

    // Swarm events wait for a real board (docs/HIVE-SIEGE.md §balance): under siege combat a
    // chaff flood a young defense can't out-kill doesn't leak once — it stacks on the Core and
    // chews it down. From swarmMinDepth the flood is a fair "spike" test, not a scripted loss.
    const swarmEvent = depth >= DIRECTOR.swarmMinDepth && depth % DIRECTOR.swarmEvery === 0;
    const groups = this.spend(budget, shape, shape === 'elite' ? Math.max(eliteChance, 0.5) : eliteChance, biome, depth);
    return { depth, shape, groups, spawnBoss: false, swarmEvent, eliteChance };
  }

  /** Greedily spend a threat budget on a shape's roster into enemy groups. The biome's signature
   *  kinds are appended to the shape roster so biome-exclusive enemies surface in Infinite waves. */
  private spend(budget: number, shape: Exclude<WaveShape, 'boss'>, eliteChance: number, biome?: Biome, depth = 99): DirectorGroup[] {
    const sig = biome?.mods.signature ?? [];
    const base = sig.length > 0 ? [...ROSTER[shape], ...sig] : ROSTER[shape];
    // EHP depth gate (docs/HIVE-SIEGE.md §balance): under siege combat, a unit whose effective
    // HP (regen/armor/shields folded) out-tanks the current board's plausible DPS doesn't leak
    // once and vanish — it PARKS at the Core and chews forever (a fresh board literally cannot
    // out-damage a depth-3 knitter's regen). Units phase in as depth grows.
    const cap = DIRECTOR.ehpBase + DIRECTOR.ehpPerDepth * depth;
    const roster = base.filter((k) => effectiveHp(ENEMY_DEFS[k]) <= cap);
    if (roster.length === 0) roster.push('runner');
    const counts = new Map<EnemyKind, { n: number; elite: number }>();
    let remaining = budget;
    let guard = 0;
    while (remaining > 0 && guard++ < 400) {
      const kind = pick(this.rng, roster);
      const cost = DIRECTOR.cost[kind] ?? 2;
      const elite = this.rng() < eliteChance;
      const realCost = elite ? cost * DIRECTOR.eliteHpMult * 0.6 : cost; // elites cost more (fewer of them)
      if (realCost > remaining && counts.size > 0) break;
      remaining -= realCost;
      const e = counts.get(kind) ?? { n: 0, elite: 0 };
      e.n++;
      if (elite) e.elite++;
      counts.set(kind, e);
    }
    const groups: DirectorGroup[] = [];
    for (const [kind, { n, elite }] of counts) {
      if (n - elite > 0) groups.push({ kind, count: n - elite, elite: false });
      if (elite > 0) groups.push({ kind, count: elite, elite: true });
    }
    return groups;
  }
}
