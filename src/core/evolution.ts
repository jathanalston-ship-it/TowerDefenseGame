// Evolution Tiers (docs/TOWER-CODEX.md §1) — Campaign milestones permanently raise the tower
// Star Cap. Pure data + helpers (no DOM/sim/Math.random); the meta layer gates star purchases by
// the unlocked cap, and the UI shows the Evolution Unlock sequence when a milestone is crossed.
//
// A fresh save can reach BASE_STAR_CAP on shards alone (the ★1-5 evolution band + the first
// ascension step ★6); the transcendent tiers ★7-10 unlock through campaign progress.

import { STAR } from './config';

/** Star cap available with no campaign progress (★1-5 evolutions + the first ascension, ★6). */
export const BASE_STAR_CAP = 6;

export interface EvolutionMilestone {
  stage: number; // campaign stage that must be CLEARED to unlock this tier
  starCap: number; // the new tower star cap
  title: string; // the milestone's RPG-grade name (shown in the unlock sequence)
  blurb: string; // one line of flavour for the sequence
}

/** Campaign milestones → transcendent star tiers (ascending by stage). Tunable in one place. */
export const EVOLUTION_MILESTONES: readonly EvolutionMilestone[] = [
  { stage: 4, starCap: 7, title: 'Apex Genome', blurb: 'The strain breaches its ceiling — ascension begins.' },
  { stage: 8, starCap: 8, title: 'Transcendent Genome', blurb: 'Dormant helices awaken across the hive.' },
  { stage: 12, starCap: 9, title: 'Primordial Genome', blurb: 'Ancient mutation patterns resurface.' },
  { stage: 16, starCap: 10, title: 'Omega Genome', blurb: 'The final form is within reach.' },
];

/** Highest campaign stage cleared across ALL difficulties (best progress counts). */
export function highestCampaignStage(cleared: Record<string, number>): number {
  let hi = 0;
  for (const v of Object.values(cleared)) if (v > hi) hi = v;
  return hi;
}

/** The tower star cap unlocked by a given highest-cleared stage (never exceeds the absolute max). */
export function evolutionStarCap(highestStage: number): number {
  let cap = BASE_STAR_CAP;
  for (const m of EVOLUTION_MILESTONES) if (highestStage >= m.stage) cap = m.starCap;
  return Math.min(cap, STAR.maxTowerStars);
}

/** The milestone unlocked by clearing from `oldStage` to `newStage` (the highest newly-crossed),
 *  or null if no new tier opened. Drives the Evolution Unlock sequence on a campaign win. */
export function milestoneCrossed(oldStage: number, newStage: number): EvolutionMilestone | null {
  let crossed: EvolutionMilestone | null = null;
  for (const m of EVOLUTION_MILESTONES) {
    if (m.stage > oldStage && m.stage <= newStage) crossed = m; // take the highest one crossed
  }
  return crossed;
}
