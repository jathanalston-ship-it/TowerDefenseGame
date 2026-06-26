// AI Director (STAGES.md §6 threat-budget + §9 elites + §13 anti-stagnation). It
// generates Endless waves dynamically — spending a depth-scaled threat budget on a
// rotating WAVE SHAPE (so two waves never feel the same), promoting elites at a rising
// rate, and timing minibosses + swarm events. Goal: fresh but FAIR. Pure given its rng
// (deterministic from the run seed); the Game executes what it emits. No DOM.
//
// Stage Mode keeps the authored WAVES (so the golden run is untouched); Endless Mode
// drives spawning entirely through this Director. Same enemy/boss data feeds both.

import { DIRECTOR } from './config';
import { STANDARD } from './difficulty';
import type { DifficultyDef } from './difficulty';
import type { EnemyKind } from './types';

export type WaveShape = 'swarm' | 'armored' | 'mixed' | 'rush' | 'elite' | 'boss';

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

// Each shape's roster (which archetypes it draws from) — the build-counter pressure.
const ROSTER: Record<Exclude<WaveShape, 'boss'>, EnemyKind[]> = {
  swarm: ['runner', 'runner', 'rusher'],
  armored: ['brute', 'tank', 'brute'],
  mixed: ['runner', 'brute', 'flyer', 'rusher'],
  rush: ['rusher', 'rusher', 'runner'],
  elite: ['brute', 'tank', 'flyer'],
};
const SHAPE_ROTATION: Exclude<WaveShape, 'boss'>[] = ['swarm', 'armored', 'mixed', 'rush', 'elite'];

type Rng = () => number;
const pick = <T>(rng: Rng, a: readonly T[]): T => a[Math.floor(rng() * a.length)];

export class Director {
  private lastShape: WaveShape | null = null;

  // The universal difficulty framework supplies the elite-chance and boss-frequency
  // scalars; at Standard (identity) the Director behaves exactly as before.
  constructor(private rng: Rng, private diff: DifficultyDef = STANDARD) {}

  /** Produce the next endless wave for a given depth (1-based). */
  next(depth: number): DirectorWave {
    const budget = DIRECTOR.baseBudget * Math.pow(1 + DIRECTOR.budgetGrowth, depth - 1);
    const eliteChance = Math.min(
      0.5,
      (DIRECTOR.eliteChanceBase + DIRECTOR.eliteChancePerDepth * depth) * this.diff.eliteChanceMult,
    );
    // Difficulty scales how often a (mini)boss caps a wave (>1 = more often).
    const bossEvery = Math.max(1, Math.round(DIRECTOR.bossEvery / this.diff.bossFrequencyMult));

    // Boss cadence: a procedural (mini)boss caps the wave, escorted by light chaff.
    if (depth % bossEvery === 0) {
      const escort = this.spend(budget * 0.4, 'mixed', eliteChance);
      this.lastShape = 'boss';
      return { depth, shape: 'boss', groups: escort, spawnBoss: true, swarmEvent: false, eliteChance };
    }

    // Anti-monotony: never repeat the previous shape (STAGES §13 wave-shape rotation).
    let shape: Exclude<WaveShape, 'boss'> = pick(this.rng, SHAPE_ROTATION);
    let guard = 0;
    while (shape === this.lastShape && guard++ < 8) shape = pick(this.rng, SHAPE_ROTATION);
    this.lastShape = shape;

    const swarmEvent = depth % DIRECTOR.swarmEvery === 0;
    const groups = this.spend(budget, shape, shape === 'elite' ? Math.max(eliteChance, 0.5) : eliteChance);
    return { depth, shape, groups, spawnBoss: false, swarmEvent, eliteChance };
  }

  /** Greedily spend a threat budget on a shape's roster into enemy groups. */
  private spend(budget: number, shape: Exclude<WaveShape, 'boss'>, eliteChance: number): DirectorGroup[] {
    const roster = ROSTER[shape];
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
