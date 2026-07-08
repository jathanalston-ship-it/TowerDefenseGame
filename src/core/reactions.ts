// Reaction matrix — the build-diversity multiplier. Two co-present statuses combust into a
// distinct burst effect, so "which two statuses do I pair" becomes a real build axis. This
// generalizes the original Shred (Fracture + Corrosion) to all 15 unordered pairings of the
// SIX statuses: Fracture (Kinetic), Corrosion (Caustic), Infection (Viral), Disruption (Neural),
// Mark (Vital — Marrow Siphon) and Resonance (Resonant — Resonance Coil). Pure data + readiness
// predicates; the Game owns the side-effects (it runs the matching reaction in maybeReact).
//
// Golden-safety: the matrix is checked in a FIXED priority order with Shred first, and Shred's
// predicate/numbers are unchanged — so a run that only ever produces Fracture + Corrosion (no
// Parasite/Obelisk, i.e. the golden run) only ever fires Shred, exactly as before. Every other
// reaction needs Infection, Disruption, Mark or Resonance present — none of which that run creates
// (Mark/Resonance in particular require the gated Siphon/Coil, which autoplay never fields).

import type { Enemy } from './types';

export type ReactionId =
  | 'shred' | 'virulence' | 'detonate' | 'putrefy' | 'dissolve' | 'plaguebloom'
  // Vital (Mark) — harvest family · Resonant (Resonance) — shatter family · their synthesis
  | 'synthesis'
  | 'harvest' | 'ferment' | 'bloomrot' | 'synapticbloom'
  | 'resonantshear' | 'resonantmelt' | 'resonantrupture' | 'resonantovertone';

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
  // ── The two newest classes (all AFTER the original 6, so priority + golden are unchanged). ──
  // SYNTHESIS first among the new set: when BOTH new statuses are present it outranks either family.
  { id: 'synthesis', name: 'SYNTHESIS', color: '#eaf56a', blurb: 'Mark + Resonance → the harvest and the resonance synthesize: a heavy burst and a Biomass windfall.', ready: (e) => e.mark > 0 && e.resonance > 0 },
  // Vital (Mark) — HARVEST family: the marked body is rendered into a burst + Biomass for the hive.
  { id: 'harvest', name: 'HARVEST', color: '#7cff9b', blurb: 'Mark + Fracture → the marked, fractured body is harvested for Biomass.', ready: (e) => e.mark > 0 && e.fracture >= 1 },
  { id: 'ferment', name: 'FERMENT', color: '#b6e84a', blurb: 'Mark + Corrosion → the corroded mark ferments into Biomass.', ready: (e) => e.mark > 0 && e.corrosion > 0 },
  { id: 'bloomrot', name: 'BLOOM ROT', color: '#9be86a', blurb: 'Mark + Infection → the infected mark blooms — Biomass out of the rot.', ready: (e) => e.mark > 0 && e.infection > 0 },
  { id: 'synapticbloom', name: 'SYNAPTIC BLOOM', color: '#8cd8ff', blurb: 'Mark + Disruption → the disrupted mark is rendered down to feed the hive.', ready: (e) => e.mark > 0 && e.disrupt > 0 },
  // Resonant (Resonance) — SHATTER family: the beam's resonance shatters the co-present affliction.
  { id: 'resonantshear', name: 'SHEAR', color: '#ffc24d', blurb: 'Resonance + Fracture → the fractured shell shears apart (scales with Fracture).', ready: (e) => e.resonance > 0 && e.fracture >= 1 },
  { id: 'resonantmelt', name: 'MELT', color: '#ffd36a', blurb: 'Resonance + Corrosion → the resonance melts the corroded plating entirely.', ready: (e) => e.resonance > 0 && e.corrosion > 0 },
  { id: 'resonantrupture', name: 'RUPTURE', color: '#ff9ac6', blurb: 'Resonance + Infection → the plague ruptures on the resonant note (scales with Infection).', ready: (e) => e.resonance > 0 && e.infection > 0 },
  { id: 'resonantovertone', name: 'OVERTONE', color: '#b0c4ff', blurb: 'Resonance + Disruption → the destabilized shell rings itself apart.', ready: (e) => e.resonance > 0 && e.disrupt > 0 },
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
