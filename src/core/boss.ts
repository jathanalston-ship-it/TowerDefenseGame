// Modular boss framework (STAGES.md §10). A boss is NOT an oversized normal enemy —
// it's a composition: a CHASSIS (body plan) + MECHANIC MODULES (telegraphed abilities:
// summons, shields, arena casts, enrage) + PHASES (HP-gated transitions) + MODIFIERS.
// All data, so a new boss is one BossDef entry; `assembleBoss` rolls them procedurally
// for infinite depth. The sim (game.ts) owns execution; this module owns the data +
// assembly + the pure helpers. No React/DOM, no Math.random — assembly takes an rng.

import type { EnemyKind } from './types';
import { Registry } from './registry';

export type BossChassis = 'bruiser' | 'artillery' | 'swarmlord' | 'controller' | 'juggernaut';

/** Telegraphed, counterable behaviors drawn from a shared pool (the heart of a boss). */
export type BossModuleKind =
  | 'spawner' // periodically births adds (counter: AoE / chaff clear)
  | 'enrager' // ramps speed/damage on a timer (counter: front-loaded damage)
  | 'shieldphase' // becomes invulnerable for a window (counter: burst timing)
  | 'channeler' // a cast that damages the Nucleus if it completes (counter: focus burst)
  | 'charger' // telegraphed dash toward the line (counter: peel / slow)
  | 'suppressor'; // disables nearby towers for a window (counter: spread value)

export interface BossModule {
  kind: BossModuleKind;
  cooldown: number; // seconds between activations
  amount?: number; // spawner: add count · channeler: Nucleus damage · enrager: +frac/stack
  addKind?: EnemyKind; // spawner add archetype
  duration?: number; // shieldphase / channeler cast length
  radius?: number; // suppressor reach (px)
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
};

// Authored bosses self-register (procedural bosses from `assembleBoss` are ephemeral,
// so they aren't registered). Unifies bosses under the content-registry framework.
export const bossRegistry = new Registry<BossDef>('boss', {
  idOf: (d) => d.id,
  validate: (d) => (d.hpMult > 0 ? [] : ['hpMult must be > 0']),
});
bossRegistry.registerAll(Object.values(BOSS_DEFS));

const MODULE_POOL: BossModule[] = [
  { kind: 'spawner', cooldown: 5, amount: 4, addKind: 'runner' },
  { kind: 'spawner', cooldown: 7, amount: 3, addKind: 'rusher' },
  { kind: 'enrager', cooldown: 9, amount: 1 },
  { kind: 'shieldphase', cooldown: 13, duration: 3 },
  { kind: 'channeler', cooldown: 15, duration: 3.5, amount: 16 },
  { kind: 'charger', cooldown: 11, duration: 1.4 }, // telegraphed dash toward the line
  { kind: 'suppressor', cooldown: 12, duration: 4, radius: 130 }, // disables nearby towers
];
const CHASSIS_KINDS: BossChassis[] = ['bruiser', 'artillery', 'swarmlord', 'controller', 'juggernaut'];
const MODIFIER_POOL = ['regenerator', 'bulwark', 'volatile', 'hastening'];

type Rng = () => number;
const pick = <T>(rng: Rng, a: readonly T[]): T => a[Math.floor(rng() * a.length)];

/**
 * Procedurally assemble a boss for a given Threat Level. Module + phase + modifier
 * COUNT rise with TL (STAGES §10.2); constraints keep it fair (always ≥1 telegraph,
 * phases reset add-pressure). Deterministic from the rng.
 */
export function assembleBoss(rng: Rng, tl: number): BossDef {
  const chassis = pick(rng, CHASSIS_KINDS);
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
