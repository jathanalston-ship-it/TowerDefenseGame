// Reaction matrix — the build-diversity multiplier. Two co-present statuses combust into a
// distinct burst effect, so "which two statuses do I pair" becomes a real build axis. This
// generalizes the original Shred (Fracture + Corrosion) to all SIX unordered pairings of the
// four statuses (Fracture, Corrosion, Infection, Disruption). Pure data + readiness predicates;
// the Game owns the side-effects (it runs the matching reaction in maybeReact).
//
// Golden-safety: the matrix is checked in a FIXED priority order with Shred first, and Shred's
// predicate/numbers are unchanged — so a run that only ever produces Fracture + Corrosion (no
// Parasite/Obelisk, i.e. the golden run) only ever fires Shred, exactly as before. Every other
// reaction needs Infection or Disruption to be present, which that run never creates.

import type { Enemy } from './types';

export type ReactionId = 'shred' | 'virulence' | 'detonate' | 'putrefy' | 'dissolve' | 'plaguebloom';

export interface ReactionDef {
  id: ReactionId;
  name: string; // floating-text label
  color: string; // float + particle tint
  blurb: string; // codex / tooltip text
  /** True when this pair is co-present on the enemy (evaluated in array order). */
  ready: (e: Enemy) => boolean;
}

// Fixed priority order. Shred is first ⇒ the Fracture+Corrosion path is identical to the
// historical maybeShred. The live status fields are: fracture (stacks), corrosion (seconds),
// infection (stacks), disrupt (seconds).
export const REACTION_DEFS: ReactionDef[] = [
  { id: 'shred', name: 'SHRED', color: '#fff066', blurb: 'Fracture + Corrosion → a true-damage burst and an armor break.', ready: (e) => e.fracture >= 1 && e.corrosion > 0 },
  { id: 'virulence', name: 'VIRULENCE', color: '#e24dff', blurb: 'Fracture + Infection → the wounds feed the plague (surge + ramp).', ready: (e) => e.fracture >= 1 && e.infection > 0 },
  { id: 'detonate', name: 'DETONATE', color: '#9aa6ff', blurb: 'Fracture + Disruption → the destabilized shell detonates.', ready: (e) => e.fracture >= 1 && e.disrupt > 0 },
  { id: 'putrefy', name: 'PUTREFY', color: '#b6e84a', blurb: 'Corrosion + Infection → acid rot accelerates the plague.', ready: (e) => e.corrosion > 0 && e.infection > 0 },
  { id: 'dissolve', name: 'DISSOLVE', color: '#7fe9ff', blurb: 'Corrosion + Disruption → armor melts entirely.', ready: (e) => e.corrosion > 0 && e.disrupt > 0 },
  { id: 'plaguebloom', name: 'BLOOM', color: '#d98cff', blurb: 'Infection + Disruption → the plague blooms and leaps to the pack.', ready: (e) => e.infection > 0 && e.disrupt > 0 },
];

const BY_ID = new Map(REACTION_DEFS.map((r) => [r.id, r] as const));
export function reactionDef(id: ReactionId): ReactionDef | undefined {
  return BY_ID.get(id);
}

/** The highest-priority reaction currently ready on `e`, or null. Shred wins ties, so the
 * Fracture+Corrosion case is bit-for-bit the old behavior. */
export function pendingReaction(e: Enemy): ReactionDef | null {
  for (const r of REACTION_DEFS) if (r.ready(e)) return r;
  return null;
}
