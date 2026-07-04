// STRAIN framework (docs/STRAIN.md) — the in-run tower evolution layer, Strain I → V.
// Strain is RUN-ONLY state on the tower instance (like branch tier) whose levels grant
// UNIQUE-VERB mechanics (docs/STRAIN.md §identity): things no Gene Card, Branch tier, Star,
// Mastery rank, or Equipment affix can grant. The hook vocabulary below is that contract in
// types — there are deliberately NO multiplier fields; the executor implements each verb once
// and the ladders (per-tower Strain II–V defs) are pure data.
//
// Golden safety: a Strain I tower resolves to the EMPTY kit and consumes zero rng, so every
// pre-strain run (including autoplay) is byte-identical by construction.

import type { TowerKind } from './types';
import type { CardEffect } from './cards';
import { Registry } from './registry';

export type StrainLevel = 1 | 2 | 3 | 4 | 5;

/** The unique-verb vocabulary (docs/STRAIN.md §framework). Every field is a MECHANIC, never a
 *  stat line; new ladder verbs (PROMPT-2 scope) are added here and implemented ONCE in the sim. */
export interface StrainHooks {
  /** Secondary firing organ: chance for a cast to REPEAT once (deterministic sim roll). */
  twinCastChance?: number;
  /** Positional shells FRAGMENT on impact into sub-munitions around the crater. */
  fragmentOnImpact?: { count: number; damageFrac: number; radius: number };
  /** Homing shots that KILL leap to another victim (kill-chaining — distinct from pierce,
   *  which passes through regardless). Once per shot. */
  ricochetOnKill?: { range: number; damageFrac: number };
  /** Blast STAGGER: enemies caught in a splash impact are knocked back up-lane (px) — even
   *  off the Hive crust. No other system grants displacement. */
  impactKnockback?: number;
  /** Hits leave VENOM MARKS; at `threshold` marks they DETONATE for burstFrac × hit damage. */
  venomMark?: { threshold: number; burstFrac: number };
  /** Rhythmic FRENZY: for `duration`s every `period`s, the twin-cast proc is GUARANTEED. */
  frenzyWindow?: { period: number; duration: number };
  /** Fragments inherit the concussive stagger (composes fragmentOnImpact + impactKnockback). */
  fragmentsKnockback?: boolean;
  /** Every shell launches a slower ECHO shell behind it — a delayed second detonation. */
  echoShell?: { speedFrac: number; damageFrac: number };
  /** ADRENAL JOLT: overcharged towers open every wave with their cooldowns reset. */
  waveStartReset?: boolean;
  /** Biomass SURGE: a flat burst the moment each wave starts (per evolved reactor). */
  waveSurge?: number;
  /** Overcharge LINKS through chains of adjacent reactors (topology, not a radius stat). */
  reactorLink?: boolean;
  /** The organism BIRTHS a friendly unit on a cadence (MINION_DEFS key). */
  births?: { unit: string; count: number; interval: number };
  /** Infected enemies BURST a slowing spore cloud on death (framework `slow`). */
  infectionDeathBurst?: { radius: number; seconds: number };
  /** On an infected death, the plague LEAPS its stacks to ONE distant host (past native spread). */
  infectionLeap?: { range: number; stacks: number };
  /** At full infection the host is SEIZED once — the parasite takes the body (framework `stun`). */
  infectionSeize?: { stunSeconds: number };
  /** The control field applies STATIC CHARGE stacks/sec; the discharge verbs read them. */
  staticCharge?: { perSec: number };
  /** At `threshold` charge stacks the host DISCHARGES: damage arcs to nearby enemies. */
  chargeArc?: { threshold: number; damage: number; radius: number };
  /** Discharges also STUN the arc victims (seconds — framework `stun`). */
  chargeStun?: number;
  /** Each discharge FORKS to this many extra victims. */
  arcForks?: number;
}

export interface StrainDef {
  id: string; // `${tower}:${level}`
  tower: TowerKind;
  level: Exclude<StrainLevel, 1>; // Strain I is the unmutated baseline — no def
  name: string; // the mutation's name (shown in the ceremony + inspector)
  desc: string; // player-facing: what NEW behavior appeared
  hooks: StrainHooks;
}

export const strainRegistry = new Registry<StrainDef>('strain', {
  idOf: (d) => d.id,
  validate: (d) => {
    const errs: string[] = [];
    if (d.level < 2 || d.level > 5) errs.push('level must be 2..5');
    if (Object.keys(d.hooks).length === 0) errs.push('a strain level MUST grant a mechanic (empty hooks)');
    if (!d.name || !d.desc) errs.push('name/desc required (ceremony + inspector surfaces)');
    return errs;
  },
});

/** Framework reference ladders (PROMPT-1 proof; the full five-tower ladders are PROMPT-2 —
 *  docs/STRAIN.md §identity table). Registered here so the executor paths are exercised. */
strainRegistry.register({
  id: 'needle:2', tower: 'needle', level: 2, name: 'Secondary Spinneret',
  desc: 'A second firing organ buds beside the first — casts occasionally TWIN-FIRE.',
  hooks: { twinCastChance: 0.25 },
});
strainRegistry.register({
  id: 'needle:3', tower: 'needle', level: 3, name: 'Hungering Barbs',
  desc: 'Needles that KILL leap to another victim — the barb is not done feeding.',
  hooks: { ricochetOnKill: { range: 140, damageFrac: 0.6 } },
});
strainRegistry.register({
  id: 'needle:4', tower: 'needle', level: 4, name: 'Venom Ducts',
  desc: 'Needles leave VENOM MARKS — the third mark DETONATES inside the host.',
  hooks: { venomMark: { threshold: 3, burstFrac: 1.6 } },
});
strainRegistry.register({
  id: 'needle:5', tower: 'needle', level: 5, name: 'Apex Spinneret',
  desc: 'The organ enters rhythmic FRENZY — windows where every cast twin-fires.',
  hooks: { frenzyWindow: { period: 7, duration: 2.2 } },
});
strainRegistry.register({
  id: 'mortar:2', tower: 'mortar', level: 2, name: 'Concussive Marrow',
  desc: 'Shells STAGGER — the blast hurls enemies back up-lane, even off the Hive itself.',
  hooks: { impactKnockback: 34 },
});
strainRegistry.register({
  id: 'mortar:3', tower: 'mortar', level: 3, name: 'Calcified Clusters',
  desc: 'Shells FRAGMENT on impact — bone shrapnel bursts around the crater.',
  hooks: { fragmentOnImpact: { count: 3, damageFrac: 0.35, radius: 42 } },
});

strainRegistry.register({
  id: 'mortar:4', tower: 'mortar', level: 4, name: 'Shockbone Lattice',
  desc: 'The shrapnel itself STAGGERS — every fragment hurls its victims up-lane.',
  hooks: { fragmentsKnockback: true },
});
strainRegistry.register({
  id: 'mortar:5', tower: 'mortar', level: 5, name: 'Echoing Howitzer',
  desc: 'Every shell is chased by a slower ECHO — the crater detonates twice.',
  hooks: { echoShell: { speedFrac: 0.55, damageFrac: 0.6 } },
});

// ── Flesh Reactor: timing, topology and life — the support organ becomes an organism ──
strainRegistry.register({
  id: 'reactor:2', tower: 'reactor', level: 2, name: 'Adrenal Glands',
  desc: 'ADRENAL JOLT — overcharged towers open every wave with their cooldowns reset.',
  hooks: { waveStartReset: true },
});
strainRegistry.register({
  id: 'reactor:3', tower: 'reactor', level: 3, name: 'Glut Sacs',
  desc: 'A biomass SURGE erupts the moment each wave begins.',
  hooks: { waveSurge: 18 },
});
strainRegistry.register({
  id: 'reactor:4', tower: 'reactor', level: 4, name: 'Synaptic Weave',
  desc: 'Reactors LINK — overcharge flows through chains of adjacent reactors.',
  hooks: { reactorLink: true },
});
strainRegistry.register({
  id: 'reactor:5', tower: 'reactor', level: 5, name: 'Womb of the Colony',
  desc: 'The reactor BIRTHS a harvester organism that hunts alongside your towers.',
  hooks: { births: { unit: 'harvester', count: 1, interval: 9 } },
});
// ── Parasite Nest: the plague itself evolves ──
strainRegistry.register({
  id: 'parasite:2', tower: 'parasite', level: 2, name: 'Spore Bloat',
  desc: 'Infected enemies BURST on death — a spore cloud that slows everything near.',
  hooks: { infectionDeathBurst: { radius: 70, seconds: 1.6 } },
});
strainRegistry.register({
  id: 'parasite:3', tower: 'parasite', level: 3, name: 'Leaping Broodworm',
  desc: 'When a host dies the plague LEAPS — full stacks carry to a distant new body.',
  hooks: { infectionLeap: { range: 220, stacks: 4 } },
});
strainRegistry.register({
  id: 'parasite:4', tower: 'parasite', level: 4, name: 'Neural Infestation',
  desc: 'At full infection the parasite SEIZES the host — the body stops obeying.',
  hooks: { infectionSeize: { stunSeconds: 1.1 } },
});
strainRegistry.register({
  id: 'parasite:5', tower: 'parasite', level: 5, name: 'Brood Nest',
  desc: 'The nest becomes a BROOD — waves of broodlings pour out to hunt.',
  hooks: { births: { unit: 'broodling', count: 3, interval: 11 } },
});
// ── Neural Obelisk: static charge → discharge → stun → fork ──
strainRegistry.register({
  id: 'obelisk:2', tower: 'obelisk', level: 2, name: 'Static Ganglia',
  desc: 'The control field CHARGES everything inside it — stack by stack.',
  hooks: { staticCharge: { perSec: 1.4 } },
});
strainRegistry.register({
  id: 'obelisk:3', tower: 'obelisk', level: 3, name: 'Arc Synapse',
  desc: 'Charged enemies DISCHARGE — lightning arcs into their neighbors.',
  hooks: { chargeArc: { threshold: 6, damage: 26, radius: 120 } },
});
strainRegistry.register({
  id: 'obelisk:4', tower: 'obelisk', level: 4, name: 'Overload Cortex',
  desc: 'Discharges OVERLOAD the nervous system — arc victims are stunned.',
  hooks: { chargeStun: 0.8 },
});
strainRegistry.register({
  id: 'obelisk:5', tower: 'obelisk', level: 5, name: 'Storm Crown',
  desc: 'The lightning permanently FORKS — every discharge splits to new victims.',
  hooks: { arcForks: 2 },
});

const EMPTY_HOOKS: StrainHooks = {};

/** Fold levels 2..`level` for a tower kind into one cumulative hook set (evolutions build on
 *  the body — Strain IV includes II+III). Strain 1 / unknown ⇒ the shared EMPTY kit. */
export function resolveStrain(kind: TowerKind, level: number): StrainHooks {
  if (level <= 1) return EMPTY_HOOKS;
  let out: StrainHooks | null = null;
  for (let l = 2; l <= Math.min(5, level); l++) {
    const d = strainRegistry.get(`${kind}:${l}`);
    if (!d) continue;
    out ??= {};
    if (d.hooks.twinCastChance !== undefined) out.twinCastChance = d.hooks.twinCastChance;
    if (d.hooks.fragmentOnImpact !== undefined) out.fragmentOnImpact = d.hooks.fragmentOnImpact;
    if (d.hooks.ricochetOnKill !== undefined) out.ricochetOnKill = d.hooks.ricochetOnKill;
    if (d.hooks.impactKnockback !== undefined) out.impactKnockback = d.hooks.impactKnockback;
    if (d.hooks.venomMark !== undefined) out.venomMark = d.hooks.venomMark;
    if (d.hooks.frenzyWindow !== undefined) out.frenzyWindow = d.hooks.frenzyWindow;
    if (d.hooks.fragmentsKnockback !== undefined) out.fragmentsKnockback = d.hooks.fragmentsKnockback;
    if (d.hooks.echoShell !== undefined) out.echoShell = d.hooks.echoShell;
    if (d.hooks.waveStartReset !== undefined) out.waveStartReset = d.hooks.waveStartReset;
    if (d.hooks.waveSurge !== undefined) out.waveSurge = d.hooks.waveSurge;
    if (d.hooks.reactorLink !== undefined) out.reactorLink = d.hooks.reactorLink;
    if (d.hooks.births !== undefined) out.births = d.hooks.births;
    if (d.hooks.infectionDeathBurst !== undefined) out.infectionDeathBurst = d.hooks.infectionDeathBurst;
    if (d.hooks.infectionLeap !== undefined) out.infectionLeap = d.hooks.infectionLeap;
    if (d.hooks.infectionSeize !== undefined) out.infectionSeize = d.hooks.infectionSeize;
    if (d.hooks.staticCharge !== undefined) out.staticCharge = d.hooks.staticCharge;
    if (d.hooks.chargeArc !== undefined) out.chargeArc = d.hooks.chargeArc;
    if (d.hooks.chargeStun !== undefined) out.chargeStun = d.hooks.chargeStun;
    if (d.hooks.arcForks !== undefined) out.arcForks = d.hooks.arcForks;
  }
  return out ?? EMPTY_HOOKS;
}

/** The ladder authored for a tower kind (inspection/UI; [] until its PROMPT-2 defs land). */
export function strainsFor(kind: TowerKind): StrainDef[] {
  const out: StrainDef[] = [];
  for (let l = 2; l <= 5; l++) {
    const d = strainRegistry.get(`${kind}:${l}`);
    if (d) out.push(d);
  }
  return out;
}

/** Power contribution per strain level above I (docs/STRAIN.md §power) — the scoring VEHICLE,
 *  mirroring branchPowerEffects: consumed only by the Power fold, never applied to the sim. */
export const STRAIN_LEVEL_POWER = 0.05;

export function strainPowerEffects(totalLevelsAboveOne: number): CardEffect[] {
  if (totalLevelsAboveOne <= 0) return [];
  return [{ op: 'mul', field: 'towerDamageMult', value: 1 + STRAIN_LEVEL_POWER * totalLevelsAboveOne }];
}
