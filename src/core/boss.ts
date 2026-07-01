// Modular boss framework (STAGES.md §10). A boss is NOT an oversized normal enemy —
// it's a composition: a CHASSIS (body plan) + MECHANIC MODULES (telegraphed abilities:
// summons, shields, arena casts, enrage) + PHASES (HP-gated transitions) + MODIFIERS.
// All data, so a new boss is one BossDef entry; `assembleBoss` rolls them procedurally
// for infinite depth. The sim (game.ts) owns execution; this module owns the data +
// assembly + the pure helpers. No React/DOM, no Math.random — assembly takes an rng.

import type { EnemyKind } from './types';
import { Registry } from './registry';

export type BossChassis = 'bruiser' | 'artillery' | 'swarmlord' | 'controller' | 'juggernaut';

/** Telegraphed, counterable behaviors drawn from a shared pool (the heart of a boss). The first
 *  six are the original spine; `healer` / `carapace` / `splitter` are the Milestone-1 primitives
 *  (docs/BOSS-DESIGN §2) — each teaches one lesson (kill-priority / crack-the-armor / spread-damage). */
export type BossModuleKind =
  | 'spawner' // periodically births adds (counter: AoE / chaff clear)
  | 'enrager' // ramps speed/damage on a timer (counter: front-loaded damage)
  | 'shieldphase' // becomes invulnerable for a window (counter: burst timing)
  | 'channeler' // a cast that damages the Nucleus if it completes (counter: focus burst)
  | 'charger' // telegraphed dash toward the line (counter: peel / slow)
  | 'suppressor' // disables nearby towers for a window (counter: spread value)
  | 'healer' // pulses HP to itself + nearby adds (counter: KILL PRIORITY / burst it down)
  | 'carapace' // raises heavy bonus armor for a window (counter: Fracture → Shred cracks it)
  | 'splitter'; // on death, splits into smaller copies (counter: spread damage, don't overkill)

export interface BossModule {
  kind: BossModuleKind;
  cooldown: number; // seconds between activations
  amount?: number; // spawner: add count · channeler: Nucleus dmg · enrager: +frac · healer: HP/pulse · carapace: bonus armor · splitter: copies per split
  addKind?: EnemyKind; // spawner add archetype
  duration?: number; // shieldphase / channeler / carapace window length
  radius?: number; // suppressor / healer reach (px)
  generations?: number; // splitter: how many times a lineage may split before it stops (fair population cap)
}

export interface BossPhase {
  threshold: number; // enter when hp fraction ≤ this (the first phase is 1 = from full)
  modules: number[]; // indices into BossDef.modules active during this phase
  speedMult?: number; // phase modifier
  damageMult?: number;
}

export interface BossDef {
  id: string;
  name: string;
  chassis: BossChassis;
  hpMult: number; // × BOSS.baseHp
  radius: number;
  color: string;
  bounty: number;
  damage: number; // integrity damage if it reaches the line
  armor?: number; // base armor (defaults to the generic boss armor when absent) — a carapace boss shrugs off chip damage
  modules: BossModule[];
  phases: BossPhase[]; // ordered high→low threshold
  /** Elite-style modifiers applied to the whole encounter (scaled with TL). */
  modifiers: string[];
}

/** Chassis base profile — the "body plan" that biases stats before modules/phases. */
export const CHASSIS: Record<BossChassis, { hp: number; radius: number; speed: number; color: string }> = {
  bruiser: { hp: 1.0, radius: 30, speed: 34, color: '#ff5d73' },
  artillery: { hp: 0.8, radius: 28, speed: 26, color: '#b6e84a' },
  swarmlord: { hp: 0.9, radius: 32, speed: 30, color: '#d98cff' },
  controller: { hp: 0.85, radius: 28, speed: 30, color: '#6e7bff' },
  juggernaut: { hp: 1.4, radius: 36, speed: 22, color: '#5fd0c6' },
};

// ── Authored bosses (the designed band; same code path as procedural) ────────
export const BOSS_DEFS: Record<string, BossDef> = {
  progenitor: {
    id: 'progenitor',
    name: 'The Progenitor',
    chassis: 'swarmlord',
    hpMult: 1,
    radius: 32,
    color: '#d98cff',
    bounty: 220,
    damage: 50,
    modules: [
      { kind: 'spawner', cooldown: 5, amount: 4, addKind: 'runner' },
      { kind: 'enrager', cooldown: 9, amount: 1 },
      { kind: 'shieldphase', cooldown: 14, duration: 3 },
      { kind: 'channeler', cooldown: 16, duration: 3.5, amount: 18 },
    ],
    phases: [
      { threshold: 1, modules: [0, 1] }, // P1: summon + ramp
      { threshold: 0.6, modules: [0, 1, 2] }, // P2: + shield windows
      { threshold: 0.3, modules: [0, 2, 3], speedMult: 1.15 }, // P3: + Nucleus channel, faster
    ],
    modifiers: ['regenerator'],
  },

  // ── EA Milestone 1: the campaign Act-1 boss line (docs/BOSS-DESIGN §4). Each teaches ONE lesson;
  //    numbers are stage-pinned (they replace the procedural finale at their stage via CAMPAIGN_BOSSES).
  first_antibody: {
    id: 'first_antibody', name: 'The First Antibody', chassis: 'artillery',
    hpMult: 1.6, radius: 30, color: '#8fd0ff', bounty: 180, damage: 42, armor: 28, // shrugs off chip fire
    modules: [
      { kind: 'channeler', cooldown: 12, duration: 3.2, amount: 20 }, // telegraphed core-shot
      { kind: 'charger', cooldown: 10, duration: 1.4 },
    ],
    phases: [
      { threshold: 1, modules: [0] }, // P1: learn the channel — focus it down
      { threshold: 0.5, modules: [0, 1], speedMult: 1.12 }, // P2: + a dash to peel
    ],
    modifiers: [],
  },
  brood_cyst: {
    id: 'brood_cyst', name: 'Brood Cyst', chassis: 'swarmlord',
    hpMult: 2.4, radius: 32, color: '#d98cff', bounty: 220, damage: 46,
    modules: [
      { kind: 'spawner', cooldown: 5, amount: 4, addKind: 'runner' },
      { kind: 'spawner', cooldown: 8, amount: 3, addKind: 'rusher' },
      { kind: 'enrager', cooldown: 11, amount: 1 },
    ],
    phases: [
      { threshold: 1, modules: [0] }, // P1: a trickle of adds
      { threshold: 0.6, modules: [0, 1] }, // P2: two broods at once — single-target drowns
      { threshold: 0.3, modules: [0, 1, 2], speedMult: 1.1 }, // P3: + ramp
    ],
    modifiers: [],
  },
  the_mender: {
    id: 'the_mender', name: 'The Mender', chassis: 'controller',
    hpMult: 3.0, radius: 28, color: '#6effa8', bounty: 260, damage: 48,
    modules: [
      { kind: 'spawner', cooldown: 6, amount: 3, addKind: 'runner' },
      { kind: 'healer', cooldown: 4, amount: 150, radius: 170 }, // mends itself + the whole pack
    ],
    phases: [
      { threshold: 1, modules: [0, 1] }, // the aura is on from the start — out-heal it or kill it first
      { threshold: 0.5, modules: [0, 1], speedMult: 1.08 },
    ],
    modifiers: [],
  },
  chitin_colossus: {
    id: 'chitin_colossus', name: 'Chitin Colossus', chassis: 'juggernaut',
    hpMult: 4.2, radius: 36, color: '#c7b27a', bounty: 300, damage: 56, armor: 16,
    modules: [
      { kind: 'carapace', cooldown: 7, amount: 34, duration: 4 }, // hardens — crack it with Fracture → Shred
      { kind: 'charger', cooldown: 12, duration: 1.4 },
    ],
    phases: [
      { threshold: 1, modules: [0] }, // P1: the carapace lesson in isolation
      { threshold: 0.55, modules: [0, 1], speedMult: 1.06 },
    ],
    modifiers: [],
  },
  mitotic_horror: {
    id: 'mitotic_horror', name: 'Mitotic Horror', chassis: 'bruiser',
    hpMult: 4.0, radius: 34, color: '#ff8f5d', bounty: 320, damage: 52,
    modules: [
      { kind: 'splitter', cooldown: 999, amount: 2, generations: 2 }, // death-triggered (passive; not in any phase)
      { kind: 'spawner', cooldown: 7, amount: 3, addKind: 'rusher' },
    ],
    phases: [
      { threshold: 1, modules: [1] }, // P1: adds
      { threshold: 0.5, modules: [1], speedMult: 1.1 }, // P2: faster — but overkill wastes damage on the split
    ],
    modifiers: [],
  },
  purge_engine: {
    id: 'purge_engine', name: 'The Purge Engine', chassis: 'bruiser',
    hpMult: 7.0, radius: 38, color: '#ff5d73', bounty: 480, damage: 64, armor: 18,
    modules: [
      { kind: 'spawner', cooldown: 6, amount: 4, addKind: 'runner' }, // echoes Brood Cyst
      { kind: 'carapace', cooldown: 8, amount: 30, duration: 3.5 }, // echoes Chitin Colossus
      { kind: 'healer', cooldown: 6, amount: 160, radius: 150 }, // echoes The Mender
      { kind: 'enrager', cooldown: 10, amount: 1 },
      { kind: 'channeler', cooldown: 14, duration: 3.5, amount: 24 }, // echoes The First Antibody
    ],
    phases: [
      { threshold: 1, modules: [0] }, // P1: swarm
      { threshold: 0.66, modules: [0, 1, 2] }, // P2: armor + heal — the mid-fight adaptation
      { threshold: 0.33, modules: [0, 3, 4], speedMult: 1.15 }, // P3: enrage + Nucleus channel — the gauntlet
    ],
    modifiers: ['regenerator'],
  },
};

/** Campaign stage → authored boss id (docs/BOSS-DESIGN §4, Milestone 1). The generator replaces the
 *  procedural FINALE with the pinned boss at these stages; every other stage stays procedural. */
export const CAMPAIGN_BOSSES: Record<number, string> = {
  5: 'first_antibody', 10: 'brood_cyst', 15: 'the_mender', 20: 'chitin_colossus', 25: 'mitotic_horror', 30: 'purge_engine',
};

/** The authored boss pinned to a campaign stage, if any (else undefined ⇒ keep the procedural finale). */
export function campaignBossFor(stage: number): BossDef | undefined {
  const id = CAMPAIGN_BOSSES[stage];
  return id ? BOSS_DEFS[id] : undefined;
}

// Authored bosses self-register (procedural bosses from `assembleBoss` are ephemeral,
// so they aren't registered). Unifies bosses under the content-registry framework.
export const bossRegistry = new Registry<BossDef>('boss', {
  idOf: (d) => d.id,
  validate: bossProblems,
});

/** Content-validate a boss: positive HP, a real composition, and each module's own invariants
 *  (spawner needs a count, healer/carapace need an amount, splitter needs copies + generations). */
export function bossProblems(d: BossDef): string[] {
  const errs: string[] = [];
  if (d.hpMult <= 0) errs.push('hpMult must be > 0');
  if (d.modules.length === 0) errs.push('a boss needs at least one module');
  if (d.phases.length === 0 || d.phases[0].threshold !== 1) errs.push('phases must start at threshold 1 (from full HP)');
  for (const p of d.phases) for (const mi of p.modules) if (mi < 0 || mi >= d.modules.length) errs.push(`phase references out-of-range module ${mi}`);
  for (const m of d.modules) {
    if (m.cooldown <= 0) errs.push(`${m.kind} needs a positive cooldown`);
    if ((m.kind === 'spawner' || m.kind === 'healer' || m.kind === 'carapace' || m.kind === 'channeler' || m.kind === 'splitter') && !(m.amount && m.amount > 0)) errs.push(`${m.kind} needs a positive amount`);
    if (m.kind === 'healer' && !(m.radius && m.radius > 0)) errs.push('healer needs a radius');
    if (m.kind === 'splitter' && !(m.generations && m.generations > 0)) errs.push('splitter needs generations ≥ 1');
  }
  return errs;
}
bossRegistry.registerAll(Object.values(BOSS_DEFS));

const MODULE_POOL: BossModule[] = [
  { kind: 'spawner', cooldown: 5, amount: 4, addKind: 'runner' },
  { kind: 'spawner', cooldown: 7, amount: 3, addKind: 'rusher' },
  { kind: 'enrager', cooldown: 9, amount: 1 },
  { kind: 'shieldphase', cooldown: 13, duration: 3 },
  { kind: 'channeler', cooldown: 15, duration: 3.5, amount: 16 },
  { kind: 'charger', cooldown: 11, duration: 1.4 }, // telegraphed dash toward the line
  { kind: 'suppressor', cooldown: 12, duration: 4, radius: 130 }, // disables nearby towers
  { kind: 'healer', cooldown: 5, amount: 130, radius: 160 }, // pulses HP to itself + nearby adds
  { kind: 'carapace', cooldown: 8, amount: 30, duration: 3.5 }, // hardens for a window
];
const CHASSIS_KINDS: BossChassis[] = ['bruiser', 'artillery', 'swarmlord', 'controller', 'juggernaut'];
const MODIFIER_POOL = ['regenerator', 'bulwark', 'volatile', 'hastening'];

type Rng = () => number;
const pick = <T>(rng: Rng, a: readonly T[]): T => a[Math.floor(rng() * a.length)];

/** Weighted chassis pick (biome flavour). Empty/absent bias ⇒ a uniform pick over the same
 *  order as `pick(rng, CHASSIS_KINDS)` ⇒ byte-identical to the unbiased path (golden-safe). */
function pickChassis(rng: Rng, bias?: Partial<Record<BossChassis, number>>): BossChassis {
  if (!bias) return pick(rng, CHASSIS_KINDS);
  const weights = CHASSIS_KINDS.map((c) => bias[c] ?? 1);
  let total = 0;
  for (const w of weights) total += w;
  let u = rng() * total;
  for (let i = 0; i < CHASSIS_KINDS.length; i++) { u -= weights[i]; if (u < 0) return CHASSIS_KINDS[i]; }
  return CHASSIS_KINDS[CHASSIS_KINDS.length - 1];
}

/**
 * Procedurally assemble a boss for a given Threat Level. Module + phase + modifier
 * COUNT rise with TL (STAGES §10.2); constraints keep it fair (always ≥1 telegraph,
 * phases reset add-pressure). Deterministic from the rng. `chassisBias` (optional, from the
 * active biome) flavours the body plan; omitted ⇒ a uniform pick (unchanged behaviour).
 */
export function assembleBoss(rng: Rng, tl: number, chassisBias?: Partial<Record<BossChassis, number>>): BossDef {
  const chassis = pickChassis(rng, chassisBias);
  const base = CHASSIS[chassis];
  const moduleCount = Math.max(2, Math.min(4, 2 + Math.floor(tl / 8)));
  const phaseCount = Math.max(1, Math.min(3, 1 + Math.floor(tl / 6)));

  // unique modules
  const modules: BossModule[] = [];
  const usedKinds = new Set<BossModuleKind>();
  let guard = 0;
  while (modules.length < moduleCount && guard++ < 40) {
    const m = pick(rng, MODULE_POOL);
    if (usedKinds.has(m.kind) && m.kind !== 'spawner') continue;
    usedKinds.add(m.kind);
    modules.push({ ...m });
  }

  // phases split the HP bar; each adds a module so late phases are busier
  const phases: BossPhase[] = [];
  for (let p = 0; p < phaseCount; p++) {
    const threshold = p === 0 ? 1 : 1 - p / phaseCount;
    const active = modules.map((_, i) => i).slice(0, Math.min(modules.length, 1 + p + 1));
    phases.push({ threshold, modules: active, speedMult: 1 + p * 0.08 });
  }

  const modCount = Math.min(MODIFIER_POOL.length, Math.floor(tl / 10));
  const modifiers: string[] = [];
  for (let i = 0; i < modCount; i++) {
    const m = pick(rng, MODIFIER_POOL);
    if (!modifiers.includes(m)) modifiers.push(m);
  }

  return {
    id: `proc_${chassis}_${Math.floor(tl)}`,
    name: procName(rng, chassis),
    chassis,
    hpMult: base.hp * (1 + tl * 0.05),
    radius: base.radius,
    color: base.color,
    bounty: Math.round(180 * (1 + tl * 0.08)),
    damage: 45 + Math.floor(tl * 0.5),
    modules,
    phases,
    modifiers,
  };
}

const PREFIX = ['Brood', 'Carrion', 'Gut', 'Spore', 'Razor', 'Apex', 'Null', 'Viral'];
const TITLE: Record<BossChassis, string> = {
  bruiser: 'Tyrant',
  artillery: 'Bombard',
  swarmlord: 'Matriarch',
  controller: 'Overmind',
  juggernaut: 'Colossus',
};
function procName(rng: Rng, chassis: BossChassis): string {
  return `${pick(rng, PREFIX)} ${TITLE[chassis]}`;
}

export function bossDef(id: string): BossDef | undefined {
  return BOSS_DEFS[id];
}
