// RUN IDENTITY (docs/RUN-IDENTITY.md) — the layer that makes every Campaign/Endless run memorable.
// A pure, seed-derived RUN PLAN schedules discrete per-wave EVENTS (corrupted waves, invasions,
// surprise bosses, resource booms, …) and an optional run-wide ANOMALY (the headline identity —
// "the Blood Moon run"). Effects are expressed through knobs the sim already has, so the Game
// applies a plan with a tiny transform (see game.ts `applyRunEvent`). No sim/DOM imports here.
//
// Determinism: generated from a DEDICATED rng stream (never Game.rng), so the base run is
// unperturbed — events LAYER ON. Golden-safe: the plan is EMPTY in Stage mode (the golden path).
// Extensible: a new beat is one RUN_EVENTS row; a new run-wide flavour is one RUN_ANOMALIES row.

import { Rng } from './rng';
import type { EnemyKind } from './types';
import type { RunMode } from './game';

/** The declarative mechanical payload of an event — every field maps to an existing sim knob. */
export interface WaveEffect {
  hpMult?: number; // enemies tankier this wave
  bountyMult?: number; // biomass-per-kill (resource beats skew rewarding)
  eliteAll?: boolean; // promote EVERY group to elite (Elite Invasion)
  eliteChance?: number; // per-group elite promotion chance (0..1)
  countMult?: number; // inflate spawn counts (Swarm); <1 thins them (Dead Calm)
  injectKind?: EnemyKind; // add a group of a specific (usually out-of-biome) kind (Rare Invasion)
  injectCount?: number;
  boss?: 'mini' | 'major'; // spawn an ambush boss (the Game scales the tier from its depth/stage)
}

export type RunEventKind =
  | 'corrupted' | 'eliteInvasion' | 'rareInvasion' | 'evolution'
  | 'resourceBoom' | 'miniBoss' | 'unexpectedBoss' | 'swarm';

/** A single per-wave beat. `weight` drives selection; lower weight ⇒ rarer ⇒ more headline-worthy. */
export interface RunEventDef {
  id: string;
  name: string; // telegraph title
  desc: string; // telegraph line
  kind: RunEventKind;
  weight: number;
  minWave: number; // earliest wave (1-based) it may appear
  modes?: RunMode[]; // default: campaign + endless
  effect: WaveEffect;
  needsInvasionKind?: boolean; // rareInvasion: the kind is chosen at plan time (out-of-biome)
}

/** A run-wide flavour: its `everyWave` effect folds mildly into EVERY wave — the run's identity. */
export interface RunAnomalyDef {
  id: string;
  name: string;
  tagline: string; // "the Blood Moon run" (Results / recap)
  desc: string;
  weight: number;
  everyWave: WaveEffect;
}

const DEFAULT_MODES: RunMode[] = ['campaign', 'endless'];

// ── Catalog: per-wave events (spans the brief's categories) ───────────────────
export const RUN_EVENTS: RunEventDef[] = [
  { id: 'corrupted', name: 'Corrupted Wave', kind: 'corrupted', weight: 10, minWave: 3,
    desc: 'The swarm festers with corruption — tougher, but it pays out richer.',
    effect: { hpMult: 1.35, bountyMult: 1.4, eliteChance: 0.25 } },
  { id: 'elite_invasion', name: 'Elite Invasion', kind: 'eliteInvasion', weight: 6, minWave: 4,
    desc: 'An elite vanguard breaks through — every pack is elite.',
    effect: { eliteAll: true, bountyMult: 1.25 } },
  { id: 'rare_invasion', name: 'Rare Invasion', kind: 'rareInvasion', weight: 8, minWave: 3,
    desc: 'A species far from its range floods the field.',
    effect: { injectCount: 8, bountyMult: 1.2 }, needsInvasionKind: true },
  { id: 'evolution', name: 'Evolution Wave', kind: 'evolution', weight: 8, minWave: 5,
    desc: 'The swarm adapts mid-run — hardened and aggressive.',
    effect: { hpMult: 1.3, eliteChance: 0.4 } },
  { id: 'resource_boom', name: 'Resource Boom', kind: 'resourceBoom', weight: 9, minWave: 2,
    desc: 'A biomass bloom — every kill pays double.',
    effect: { bountyMult: 2.0 } },
  { id: 'mini_boss', name: 'Mini-Boss Ambush', kind: 'miniBoss', weight: 6, minWave: 4,
    desc: 'A champion organism anchors the wave.',
    effect: { boss: 'mini', bountyMult: 1.15 } },
  { id: 'unexpected_boss', name: 'Unexpected Boss', kind: 'unexpectedBoss', weight: 4, minWave: 6,
    desc: 'Something ancient stirs — a boss you did not expect.',
    effect: { boss: 'major', bountyMult: 1.3 } },
  { id: 'swarm', name: 'Endless Swarm', kind: 'swarm', weight: 8, minWave: 3,
    desc: 'The horde swells — overwhelming numbers.',
    effect: { countMult: 1.7 } },
];

// ── Catalog: run-wide anomalies (the headline identity) ───────────────────────
export const RUN_ANOMALIES: RunAnomalyDef[] = [
  { id: 'blood_moon', name: 'Blood Moon', tagline: 'the Blood Moon run', weight: 10,
    desc: 'Elites prowl every wave — a bloody, high-reward run.', everyWave: { eliteChance: 0.25, bountyMult: 1.1 } },
  { id: 'gold_rush', name: 'Gold Rush', tagline: 'the Gold Rush run', weight: 10,
    desc: 'Biomass flows freely all run long.', everyWave: { bountyMult: 1.5 } },
  { id: 'the_swarm', name: 'The Swarm', tagline: 'the Swarm run', weight: 8,
    desc: 'Endless numbers — every wave is a horde.', everyWave: { countMult: 1.3 } },
  { id: 'ancient_awakening', name: 'Ancient Awakening', tagline: 'the Awakening run', weight: 7,
    desc: 'The deep stirs — everything is tougher, and richer.', everyWave: { hpMult: 1.15, bountyMult: 1.2 } },
  { id: 'feral_surge', name: 'Feral Surge', tagline: 'the Feral run', weight: 8,
    desc: 'The swarm is frenzied — hardened packs, prowling elites.', everyWave: { hpMult: 1.1, eliteChance: 0.15 } },
  { id: 'dead_calm', name: 'Dead Calm', tagline: 'the Dead Calm run', weight: 6,
    desc: 'An eerie quiet — sparse waves, but each foe is hardened.', everyWave: { hpMult: 1.2, countMult: 0.8, bountyMult: 1.15 } },
];

// ── The plan ──────────────────────────────────────────────────────────────────
export interface PlannedEvent {
  wave: number;
  def: RunEventDef;
  injectKind?: EnemyKind; // resolved out-of-biome kind for rareInvasion
}
export interface RunPlan {
  anomaly: RunAnomalyDef | null;
  events: PlannedEvent[]; // sorted ascending by wave; at most one per wave
  byWave: Map<number, PlannedEvent>;
  headline: string; // the run's one-line identity (anomaly, else the rarest event, else '')
}

export interface RunPlanCtx {
  mode: RunMode;
  waveCount: number; // campaign stage wave count, or an endless horizon
  reserveFinale?: boolean; // campaign: leave the last wave (boss) alone
  biomeSignature?: readonly EnemyKind[]; // kinds native to the biome (excluded from Rare Invasion)
  invasionPool?: readonly EnemyKind[]; // candidate invasion kinds (typically all enemy kinds)
}

const EMPTY_PLAN: RunPlan = { anomaly: null, events: [], byWave: new Map(), headline: '' };

// Tunables (first pass — memorable, not punishing).
const RUN_EVENT_SALT = 0x52554e21; // 'RUN!' — a dedicated stream, decoupled from Game.rng
const ANOMALY_CHANCE = 0.5; // ~half of runs carry a headline anomaly
const EVENT_BASE_CHANCE = 0.14; // per candidate wave, ramps slightly with depth
const EVENT_COOLDOWN = 2; // waves skipped after an event (keeps each an EVENT, not noise)

function weightedPickDef<T extends { weight: number }>(rng: Rng, defs: readonly T[]): T {
  return rng.pickWeighted(defs.map((d) => [d, d.weight] as const));
}

/** Pure, deterministic run plan (docs/RUN-IDENTITY.md). Empty in Stage mode ⇒ golden-safe. */
export function generateRunPlan(seed: number, ctx: RunPlanCtx): RunPlan {
  const waveCount = Math.floor(ctx.waveCount);
  if (ctx.mode === 'stage' || waveCount < 2) return EMPTY_PLAN;
  const rng = new Rng((seed ^ RUN_EVENT_SALT) >>> 0);
  const lastSchedulable = ctx.reserveFinale ? waveCount - 1 : waveCount;

  // 1. Anomaly — the run's headline identity (present on ~half of runs).
  const anomaly = rng.chance(ANOMALY_CHANCE) ? weightedPickDef(rng, RUN_ANOMALIES) : null;

  // 2. Per-wave events — budgeted + cooldown-spaced so each stays a memorable EVENT.
  const signature = new Set(ctx.biomeSignature ?? []);
  const invasionCandidates = (ctx.invasionPool ?? []).filter((k) => !signature.has(k));
  const maxEvents = Math.max(1, Math.round(waveCount / 4));
  const events: PlannedEvent[] = [];
  const byWave = new Map<number, PlannedEvent>();
  let cooldown = 0;
  for (let wave = 2; wave <= lastSchedulable && events.length < maxEvents; wave++) {
    if (cooldown > 0) { cooldown--; continue; }
    const p = EVENT_BASE_CHANCE + Math.min(0.12, wave * 0.006);
    if (!rng.chance(p)) continue;
    const eligible = RUN_EVENTS.filter((e) =>
      wave >= e.minWave
      && (e.modes ?? DEFAULT_MODES).includes(ctx.mode)
      && (!e.needsInvasionKind || invasionCandidates.length > 0));
    if (eligible.length === 0) continue;
    const def = weightedPickDef(rng, eligible);
    const planned: PlannedEvent = { wave, def };
    if (def.needsInvasionKind) planned.injectKind = rng.pick(invasionCandidates);
    events.push(planned);
    byWave.set(wave, planned);
    cooldown = EVENT_COOLDOWN;
  }

  // The headline is the ANOMALY only — the true run-wide identity. Per-wave events stay SURPRISES
  // (revealed by their telegraph banner when they fire), so an anomaly-less run has no spoiler chip.
  return { anomaly, events, byWave, headline: anomaly ? anomaly.name : '' };
}

function mergeEffect(into: WaveEffect, from: WaveEffect): void {
  if (from.hpMult) into.hpMult = (into.hpMult ?? 1) * from.hpMult;
  if (from.bountyMult) into.bountyMult = (into.bountyMult ?? 1) * from.bountyMult;
  if (from.countMult) into.countMult = (into.countMult ?? 1) * from.countMult;
  if (from.eliteAll) into.eliteAll = true;
  if (from.eliteChance) into.eliteChance = Math.max(into.eliteChance ?? 0, from.eliteChance);
  if (from.injectKind) { into.injectKind = from.injectKind; into.injectCount = from.injectCount ?? into.injectCount; }
  if (from.boss) into.boss = into.boss === 'major' || from.boss === 'major' ? 'major' : 'mini';
}

/** The merged effect for a wave: its scheduled event (if any) + the run-wide anomaly. */
export function planForWave(plan: RunPlan, wave: number): { event: PlannedEvent | null; effect: WaveEffect } {
  const event = plan.byWave.get(wave) ?? null;
  const effect: WaveEffect = {};
  if (event) mergeEffect(effect, { ...event.def.effect, injectKind: event.injectKind });
  if (plan.anomaly) mergeEffect(effect, plan.anomaly.everyWave);
  return { event, effect };
}
