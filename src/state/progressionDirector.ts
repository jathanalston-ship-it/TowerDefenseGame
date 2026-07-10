// PROGRESSION DIRECTOR (docs/PROGRESSION-GATING.md §director) — the read-model that watches HOW
// the player is absorbing the game: which revealed surfaces they have actually opened, which they
// are ignoring, how much surface area they currently manage, and what the single best "next thing"
// is. Pure over SaveData (like nextGoal.ts); the WRITE side lives in meta (latchNewReveals /
// noteNavVisit) and the save's director ledgers.
//
// Consumers today: the Hub teaser rail + FeatureLocked briefings (via unlocks.ts directly), the
// 'reveal' Next-Goal kind (nextGoal.ts), the DebugPanel load readout, and the pacing tests. The
// advice surface is deliberately small and ranked — future systems (adaptive hints, session
// summaries, re-engagement nudges) consume the same queries rather than re-deriving exposure.

import type { SaveData } from '../save/saveStore';
import { FEATURES, cognitiveLoad, featureView, nextReveals, type CognitiveLoad, type FeatureView } from './unlocks';
import { unlockedMechanics } from './mechanics';

/** How many runs ago a feature revealed (Infinity = not revealed; 0 = this run). */
export function revealAge(save: SaveData, id: string): number {
  const at = save.director.revealed[id];
  return at === undefined ? Infinity : Math.max(0, save.totalRuns - at);
}

/** Revealed screens the player has NEVER opened despite ≥ `graceRuns` runs since the reveal —
 *  the "feature abandonment" signal. Measured from the LATCH stamp (the recorded reveal event):
 *  a surface whose condition holds but hasn't latched yet has no age to measure. */
export function ignoredReveals(save: SaveData, graceRuns = 3): FeatureView[] {
  return FEATURES
    .filter((f) => f.kind === 'screen' && f.condition.kind !== 'always')
    .filter((f) => {
      const age = revealAge(save, f.id);
      return Number.isFinite(age) && age >= graceRuns && (save.director.visits[f.id] ?? 0) === 0;
    })
    .map((f) => featureView(save, f.id));
}

export interface DirectorAdvice {
  kind: 'visit' | 'chase';
  nav: string; // where acting on it lives ('campaign' for chases)
  headline: string; // "Open the Genetic Vault" / "Unlock the Armory"
  detail: string; // one line of why / what remains
}

/** The director's ranked counsel: first un-visited reveals (teach what's already open), then the
 *  next locked reveal worth chasing. Small on purpose — one or two lines of guidance, never a
 *  quest log. */
export function directorAdvice(save: SaveData, limit = 3): DirectorAdvice[] {
  const out: DirectorAdvice[] = [];
  for (const v of ignoredReveals(save)) {
    out.push({ kind: 'visit', nav: v.def.id, headline: `Open the ${v.def.name}`, detail: v.def.blurb });
  }
  for (const v of nextReveals(save, 2)) {
    out.push({ kind: 'chase', nav: 'campaign', headline: `Unlock the ${v.def.name}`, detail: v.label || v.def.blurb });
  }
  return out.slice(0, limit);
}

/** Live cognitive-load estimate (screens/currencies/mechanics + band) — the DebugPanel readout
 *  and the pacing tests' fresh-account bound. */
export function loadEstimate(save: SaveData): CognitiveLoad {
  return cognitiveLoad(save, unlockedMechanics(save).length);
}
