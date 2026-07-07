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
  | 'splitter' // on death, splits into smaller copies (counter: spread damage, don't overkill)
  // ── Siege behaviors (docs/BOSS-DESIGN.md §siege) — the encounter-defining tier ──
  | 'corecrush' // grabs the Nucleus and crushes it over time; EXPOSED while gripping (counter: burst the grip off)
  | 'burrower' // submerges (untargetable) and erupts beside the Hive (counter: keep a back line)
  | 'bulwark' // grows a biological shield with real HP (counter: sustained damage breaks it)
  | 'corruptor' // seeds a corruption pool that weakens towers inside (counter: value outside the pool)
  | 'gravitas' // drags heroes toward itself (counter: hero positioning / mobility)
  | 'dampener' // an aura that slows tower fire rate nearby (counter: spread, long-range value)
  | 'rally'; // PHASE-ENTRY reinforcements scaled by missing HP (counter: save AoE for the shift)

export interface BossModule {
  kind: BossModuleKind;
  cooldown: number; // seconds between activations
  amount?: number; // spawner/rally: add count · channeler: Nucleus dmg · enrager: +frac · healer: HP/pulse · carapace: bonus armor · splitter: copies · corecrush: Nucleus dmg/s · bulwark: shield HP · gravitas: pull px
  addKind?: EnemyKind; // spawner / rally add archetype
  duration?: number; // shieldphase / channeler / carapace / corecrush / burrower / corruptor / dampener window length
  radius?: number; // suppressor / healer / corruptor / gravitas / dampener reach (px)
  generations?: number; // splitter: how many times a lineage may split before it stops (fair population cap)
  frac?: number; // corruptor: tower damage LOST inside the pool · dampener: fire rate LOST in the aura
}

export interface BossPhase {
  threshold: number; // enter when hp fraction ≤ this (the first phase is 1 = from full)
  modules: number[]; // indices into BossDef.modules active during this phase
  speedMult?: number; // phase modifier
  damageMult?: number;
  /** Renderer mutation stage entered with this phase (extra limbs/armor/aura — docs/BOSS-DESIGN.md
   *  §phases). Defaults to the phase index, so every shift visibly mutates the boss. */
  visualTier?: number;
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
export const CHASSIS: Record<BossChassis, { hp: number; radius: number; speed: number; color: string; attack: { interval: number; windup: number } }> = {
  bruiser: { hp: 1.0, radius: 30, speed: 34, color: '#ff5d73', attack: { interval: 2.4, windup: 0.8 } },
  artillery: { hp: 0.8, radius: 28, speed: 26, color: '#b6e84a', attack: { interval: 3.0, windup: 1.0 } },
  swarmlord: { hp: 0.9, radius: 32, speed: 30, color: '#d98cff', attack: { interval: 2.0, windup: 0.7 } },
  controller: { hp: 0.85, radius: 28, speed: 30, color: '#6e7bff', attack: { interval: 2.6, windup: 0.9 } },
  juggernaut: { hp: 1.4, radius: 36, speed: 22, color: '#5fd0c6', attack: { interval: 3.2, windup: 1.1 } },
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
      { kind: 'bulwark', cooldown: 15, amount: 240 }, // a REAL bio-shield — sustained damage cracks it
      { kind: 'channeler', cooldown: 16, duration: 3.5, amount: 18 },
      { kind: 'rally', cooldown: 999, amount: 4, addKind: 'runner' }, // phase-entry brood bursts
    ],
    phases: [
      { threshold: 1, modules: [0, 1], visualTier: 0 }, // P1: summon + ramp
      { threshold: 0.7, modules: [0, 1, 2, 4], visualTier: 1 }, // P2: + bio-shield, rally on entry
      { threshold: 0.4, modules: [0, 2, 3, 4], speedMult: 1.12, visualTier: 2 }, // P3: + Nucleus channel
      { threshold: 0.15, modules: [0, 3, 4], speedMult: 1.25, damageMult: 1.2, visualTier: 3 }, // desperation
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
      { kind: 'dampener', cooldown: 9, duration: 5, radius: 160, frac: 0.3 }, // the purge field slows your guns
      { kind: 'channeler', cooldown: 14, duration: 3.5, amount: 24 }, // echoes The First Antibody
      { kind: 'corecrush', cooldown: 14, amount: 7, duration: 4 }, // the endgame: it GRABS the Nucleus
      { kind: 'rally', cooldown: 999, amount: 5, addKind: 'rusher' },
    ],
    phases: [
      { threshold: 1, modules: [0], visualTier: 0 }, // P1: swarm
      { threshold: 0.7, modules: [0, 1, 2, 6], visualTier: 1 }, // P2: armor + heal — the mid-fight adaptation
      { threshold: 0.4, modules: [0, 3, 4, 6], speedMult: 1.12, visualTier: 2 }, // P3: dampen field + channel
      { threshold: 0.15, modules: [0, 4, 5, 6], speedMult: 1.25, damageMult: 1.2, visualTier: 3 }, // desperation: CRUSH
    ],
    modifiers: ['regenerator'],
  },

  // ── EA Milestone 2: the Act-2 boss line (stages 35/40/45). Each composes SIEGE-tier primitives
  //    the Act-1 line only hinted at — positioning (gravitas/burrower), layered defenses
  //    (bulwark+carapace), and full tower-suppression siegecraft. Registered + pinned exactly like
  //    the Milestone-1 line: codex/collection/rush integration is automatic (chassis + registry). ──
  sunken_chorus: {
    id: 'sunken_chorus', name: 'The Sunken Chorus', chassis: 'controller',
    hpMult: 8.5, radius: 32, color: '#7ce8d5', bounty: 560, damage: 60,
    modules: [
      { kind: 'burrower', cooldown: 14, duration: 2.6 }, // vanishes — erupts beside the Hive
      { kind: 'gravitas', cooldown: 11, amount: 110, radius: 260 }, // drags your champions off their line
      { kind: 'healer', cooldown: 5, amount: 200, radius: 180 }, // the chorus knits the pack
      { kind: 'spawner', cooldown: 7, amount: 3, addKind: 'knitter' },
      { kind: 'rally', cooldown: 999, amount: 4, addKind: 'rusher' },
    ],
    phases: [
      { threshold: 1, modules: [2, 3], visualTier: 0 }, // P1: the mend — kill-priority lesson at scale
      { threshold: 0.65, modules: [0, 2, 3, 4], visualTier: 1 }, // P2: + the vanish (keep a back line)
      { threshold: 0.3, modules: [0, 1, 2, 4], speedMult: 1.18, damageMult: 1.15, visualTier: 2 }, // P3: drags YOUR heroes into the pit
    ],
    modifiers: ['regenerator'],
  },
  vault_of_teeth: {
    id: 'vault_of_teeth', name: 'Vault of Teeth', chassis: 'juggernaut',
    hpMult: 10, radius: 38, color: '#e8c47c', bounty: 640, damage: 70, armor: 26,
    modules: [
      { kind: 'bulwark', cooldown: 13, amount: 420 }, // a REAL bio-shield — sustain cracks it
      { kind: 'carapace', cooldown: 8, amount: 40, duration: 4.5 }, // …under it, hardened chitin
      { kind: 'corecrush', cooldown: 15, amount: 8, duration: 4.5 }, // the endgame grip — EXPOSED while crushing
      { kind: 'charger', cooldown: 12, duration: 1.5 },
      { kind: 'rally', cooldown: 999, amount: 5, addKind: 'brute' },
    ],
    phases: [
      { threshold: 1, modules: [0, 3], visualTier: 0 }, // P1: shield + dash
      { threshold: 0.6, modules: [0, 1, 4], visualTier: 1 }, // P2: LAYERED defense — Shred or stall
      { threshold: 0.25, modules: [1, 2, 4], speedMult: 1.15, damageMult: 1.25, visualTier: 2 }, // P3: it goes for the throat
    ],
    modifiers: ['bulwark'],
  },
  unmaker: {
    id: 'unmaker', name: 'The Unmaker', chassis: 'artillery',
    hpMult: 12, radius: 34, color: '#c98cff', bounty: 720, damage: 78, armor: 20,
    modules: [
      { kind: 'corruptor', cooldown: 12, duration: 7, radius: 110, frac: 0.4 }, // rots the ground your guns stand on
      { kind: 'dampener', cooldown: 9, duration: 6, radius: 180, frac: 0.35 }, // slows the survivors
      { kind: 'channeler', cooldown: 13, duration: 3.2, amount: 30 }, // and takes the Core apart
      { kind: 'suppressor', cooldown: 16, duration: 4, radius: 150 },
      { kind: 'spawner', cooldown: 8, amount: 3, addKind: 'warden' },
      { kind: 'rally', cooldown: 999, amount: 5, addKind: 'rusher' },
    ],
    phases: [
      { threshold: 1, modules: [1, 4], visualTier: 0 }, // P1: the dampen field
      { threshold: 0.7, modules: [0, 1, 4, 5], visualTier: 1 }, // P2: + ground corruption (reposition!)
      { threshold: 0.4, modules: [0, 2, 4, 5], speedMult: 1.1, visualTier: 2 }, // P3: + the core channel
      { threshold: 0.15, modules: [0, 2, 3, 5], speedMult: 1.22, damageMult: 1.2, visualTier: 3 }, // desperation: total suppression
    ],
    modifiers: ['regenerator', 'hastening'],
  },
};

/** Campaign stage → authored boss id (docs/BOSS-DESIGN §4, Milestone 1). The generator replaces the
 *  procedural FINALE with the pinned boss at these stages; every other stage stays procedural. */
export const CAMPAIGN_BOSSES: Record<number, string> = {
  5: 'first_antibody', 10: 'brood_cyst', 15: 'the_mender', 20: 'chitin_colossus', 25: 'mitotic_horror', 30: 'purge_engine',
  // Milestone 2 — the Act-2 siege line (positioning / layered defense / total suppression).
  35: 'sunken_chorus', 40: 'vault_of_teeth', 45: 'unmaker',
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
    if ((m.kind === 'spawner' || m.kind === 'healer' || m.kind === 'carapace' || m.kind === 'channeler' || m.kind === 'splitter' || m.kind === 'corecrush' || m.kind === 'bulwark' || m.kind === 'gravitas' || m.kind === 'rally') && !(m.amount && m.amount > 0)) errs.push(`${m.kind} needs a positive amount`);
    if ((m.kind === 'healer' || m.kind === 'corruptor' || m.kind === 'gravitas' || m.kind === 'dampener') && !(m.radius && m.radius > 0)) errs.push(`${m.kind} needs a radius`);
    if (m.kind === 'splitter' && !(m.generations && m.generations > 0)) errs.push('splitter needs generations ≥ 1');
    if ((m.kind === 'corruptor' || m.kind === 'dampener') && !(m.frac && m.frac > 0 && m.frac < 1)) errs.push(`${m.kind} needs a frac in (0,1)`);
    if ((m.kind === 'corecrush' || m.kind === 'burrower' || m.kind === 'corruptor' || m.kind === 'dampener') && !(m.duration && m.duration > 0)) errs.push(`${m.kind} needs a positive duration`);
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
  // ── Siege tier (docs/BOSS-DESIGN.md §siege) ──
  { kind: 'corecrush', cooldown: 14, amount: 6, duration: 4 }, // 6 Integrity/s while gripping — but EXPOSED
  { kind: 'burrower', cooldown: 16, duration: 2.4 }, // vanish → erupt beside the Hive
  { kind: 'bulwark', cooldown: 15, amount: 260 }, // a biological shield with real HP
  { kind: 'corruptor', cooldown: 13, duration: 6, radius: 95, frac: 0.35 }, // pool: towers inside hit 35% softer
  { kind: 'gravitas', cooldown: 12, amount: 90, radius: 240 }, // drag heroes 90px toward itself
  { kind: 'dampener', cooldown: 9, duration: 5, radius: 150, frac: 0.3 }, // nearby towers fire 30% slower
  { kind: 'rally', cooldown: 999, amount: 4, addKind: 'runner' }, // phase-ENTRY reinforcements (missing-HP scaled)
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
  const moduleCount = Math.max(2, Math.min(5, 2 + Math.floor(tl / 6)));
  const phaseCount = Math.max(1, Math.min(4, 1 + Math.floor(tl / 5)));

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

  // Phases split the HP bar on the canonical siege beats (docs/BOSS-DESIGN.md §phases:
  // 100–70 / 70–40 / 40–15 / 15–0); shorter fights use the same table truncated. Each phase
  // adds a module so late phases are busier, stamps a visual mutation tier, and the FINAL
  // phase of a full arc is the desperation beat (faster, harder-hitting).
  const THRESHOLDS: Record<number, number[]> = { 1: [1], 2: [1, 0.5], 3: [1, 0.6, 0.3], 4: [1, 0.7, 0.4, 0.15] };
  const cuts = THRESHOLDS[phaseCount];
  const phases: BossPhase[] = [];
  for (let p = 0; p < phaseCount; p++) {
    const desperation = phaseCount >= 3 && p === phaseCount - 1;
    const active = modules.map((_, i) => i).slice(0, Math.min(modules.length, 1 + p + 1));
    phases.push({
      threshold: cuts[p],
      modules: active,
      speedMult: desperation ? 1.25 : 1 + p * 0.08,
      ...(desperation ? { damageMult: 1.2 } : {}),
      visualTier: p,
    });
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
