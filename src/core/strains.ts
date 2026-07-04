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
  id: 'mortar:2', tower: 'mortar', level: 2, name: 'Concussive Marrow',
  desc: 'Shells STAGGER — the blast hurls enemies back up-lane, even off the Hive itself.',
  hooks: { impactKnockback: 34 },
});
strainRegistry.register({
  id: 'mortar:3', tower: 'mortar', level: 3, name: 'Calcified Clusters',
  desc: 'Shells FRAGMENT on impact — bone shrapnel bursts around the crater.',
  hooks: { fragmentOnImpact: { count: 3, damageFrac: 0.35, radius: 42 } },
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
