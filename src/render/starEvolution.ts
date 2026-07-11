// Tower STAR visual evolution (docs/TOWER-VISUAL-EVOLUTION.md) — the PERMANENT per-tower
// progression made visible on the battlefield. As a tower gains Stars it enters a new
// "generation" (~every two stars) and visibly MUTATES: new identity organs grow and the body
// swells, so a ★9 organism reads as far more evolved than a ★1 — without ever losing the tower's
// identity (each set is chosen to EXTEND its silhouette, never mask it).
//
// This is a SECOND consumer of the data-driven organ vocabulary in towerEvolution.ts (the first
// is in-run branch tiers). It reuses the same EvoPart kinds + PART_DRAWERS, so adding a tower's
// evolution is one data row and a brand-new tower needs no draw code (CLAUDE.md "generalize,
// don't hardcode"). Pure presentation: reads only a tower's kind/position + its star count; never
// touches the sim, so the golden tests (which never render) are unaffected and a 0-star tower
// draws nothing here (the fresh-account look is byte-identical).

import type { EvoPart, PartCtx } from './towerEvolution';
import { PART_DRAWERS } from './towerEvolution';
import type { TowerKind } from '../core/types';

/** A tower's star evolution: organs (each with the star it first appears at) + a body-growth knob. */
export interface StarEvolution {
  growth: number; // body silhouette scale ADDED per star (gentle; ★10 ≈ 1 + 10·growth)
  parts: EvoPart[]; // organs; `at` = the STAR the organ appears (1/3/5/7/9 — the generations)
}

// The launch roster (docs/TOWER-VISUAL-EVOLUTION.md §4). Generations at ★1/3/5/7/9; each tower's
// organs are picked from the shared vocabulary to read as ITS species — Needle grows spines + a
// firing spire, Reactor beats as a heart, Obelisk crowns a psionic glyph, etc. `color: undefined`
// ⇒ the organ takes the tower's class hue (passed in by the renderer), preserving identity.
export const STAR_EVOLUTION: Record<TowerKind, StarEvolution> = {
  // Needle Spitter (Kinetic) — precision spire → barbed overkill.
  needle: {
    growth: 0.02,
    parts: [
      { at: 1, kind: 'halo' },
      { at: 3, kind: 'barbs', count: 5 }, // venom spines / glowing veins
      { at: 5, kind: 'barrel' }, // a longer firing spire
      { at: 7, kind: 'spikes', count: 6 }, // barbed carapace
      { at: 9, kind: 'nova' }, // ultimate organism
    ],
  },
  // Bone Mortar (Caustic) — drum → siege battery.
  mortar: {
    growth: 0.022,
    parts: [
      { at: 1, kind: 'halo' },
      { at: 3, kind: 'biomass', count: 3 }, // bubbling acid sacs
      { at: 5, kind: 'barrels', count: 3 }, // a fanned battery
      { at: 7, kind: 'armor', count: 5 }, // carapace plating
      { at: 9, kind: 'nova' },
    ],
  },
  // Flesh Reactor (Vital) — heart-orb → living engine.
  reactor: {
    growth: 0.024,
    parts: [
      { at: 1, kind: 'heart' }, // a beating organ + veins
      { at: 3, kind: 'organs', count: 3 }, // vital nodes
      { at: 5, kind: 'biomass', count: 4 }, // engorged sacs
      { at: 7, kind: 'tendrils', count: 4 }, // overcharge tendrils
      { at: 9, kind: 'nova' },
    ],
  },
  // Parasite Nest (Viral) — egg cluster → pandemic brood.
  parasite: {
    growth: 0.02,
    parts: [
      { at: 1, kind: 'halo' },
      { at: 3, kind: 'pods', count: 3 }, // budding egg-pods
      { at: 5, kind: 'biomass', count: 4 }, // spore blisters
      { at: 7, kind: 'ripples', count: 2 }, // contagion waves
      { at: 9, kind: 'nova' },
    ],
  },
  // Neural Obelisk (Neural) — obelisk + glyph → psionic tyrant.
  obelisk: {
    growth: 0.018,
    parts: [
      { at: 1, kind: 'glyphRing' },
      { at: 3, kind: 'organs', count: 3 }, // psionic nodes
      { at: 5, kind: 'crown', count: 6 }, // a crown of spikes
      { at: 7, kind: 'arcs', count: 3 }, // neural lightning
      { at: 9, kind: 'nova' },
    ],
  },
  // Carrion Maw (Kinetic) — snapping mouth → apex devourer.
  maw: {
    growth: 0.024, // the hungriest silhouette in the game — it visibly fattens
    parts: [
      { at: 1, kind: 'fangs', count: 4 }, // snapping mandibles
      { at: 3, kind: 'limbs', count: 3 }, // dragging feeder limbs
      { at: 5, kind: 'armor', count: 4 }, // scarred jaw plates
      { at: 7, kind: 'spikes', count: 6 }, // a bristling gullet
      { at: 9, kind: 'nova' },
    ],
  },
  // Amber Chrysalis (Caustic) — resin bud → living reliquary.
  chrysalis: {
    growth: 0.018,
    parts: [
      { at: 1, kind: 'halo' }, // the amber sheen
      { at: 3, kind: 'biomass', count: 3 }, // welling resin sacs
      { at: 5, kind: 'armor', count: 5 }, // crystalline facets
      { at: 7, kind: 'pods', count: 3 }, // encased trophies
      { at: 9, kind: 'nova' },
    ],
  },
  // Wailing Effigy (Neural) — gaunt totem → chorus of dread.
  effigy: {
    growth: 0.016, // it grows the least — its presence is the aura, not the body
    parts: [
      { at: 1, kind: 'halo' },
      { at: 3, kind: 'tendrils', count: 3 }, // mourning shrouds
      { at: 5, kind: 'glyphRing' }, // the wailing sigils
      { at: 7, kind: 'ripples', count: 2 }, // dread waves
      { at: 9, kind: 'nova' },
    ],
  },
  // Marrow Siphon (Vital) — ocular drain-pod → engorged gorging organism. It visibly SWELLS as it
  // drinks (the hungriest Vital silhouette), growing feeder tendrils and a beating fed heart.
  siphon: {
    growth: 0.024,
    parts: [
      { at: 1, kind: 'heart' }, // the draining gullet-sac beats behind the eye
      { at: 3, kind: 'tendrils', count: 3 }, // feeder proboscides reaching out
      { at: 5, kind: 'organs', count: 3 }, // swollen vein-nodes, engorged with siphoned marrow
      { at: 7, kind: 'ripples', count: 2 }, // the siphon pulse radiating from the socket
      { at: 9, kind: 'nova' },
    ],
  },
  // Blight Sower (Caustic) — swollen seed-pod → armed blight garden. It ripens visibly: budding
  // nodules, a thorned husk, a full clutch of spore sacs, then a germination corona.
  sower: {
    growth: 0.022, // stays under the ~1.25× ★10 silhouette cap (starEvolution.test)
    parts: [
      { at: 1, kind: 'organs', count: 2 }, // seed nodules budding off the pod
      { at: 3, kind: 'barbs', count: 4 }, // thorned husk — the pod arms itself
      { at: 5, kind: 'biomass', count: 4 }, // a full clutch of ripening spore sacs
      { at: 7, kind: 'ripples', count: 2 }, // germination pulse rolling off the husk
      { at: 9, kind: 'nova' }, // the garden apex — a permanent bloom corona
    ],
  },
  // Synapse Spire (Neural) — antenna → storm pylon: glyphs, charge nodes, a lengthening spire.
  spire: {
    growth: 0.02,
    parts: [
      { at: 1, kind: 'glyphRing' }, // synaptic sigils orbit the tip
      { at: 3, kind: 'organs', count: 3 }, // charge ganglia
      { at: 5, kind: 'barrel' }, // the spire LENGTHENS
      { at: 7, kind: 'ripples', count: 2 }, // standing static field
      { at: 9, kind: 'nova' }, // the storm pylon apex
    ],
  },
  // Undertow Polyp (Kinetic) — mouth → maelstrom: tendrils, rings, the churn deepens.
  polyp: {
    growth: 0.022,
    parts: [
      { at: 1, kind: 'ripples', count: 1 }, // the first drag ring
      { at: 3, kind: 'tendrils', count: 3 }, // anchor roots
      { at: 5, kind: 'ripples', count: 2 }, // the churn deepens
      { at: 7, kind: 'organs', count: 3 }, // swallowed mass
      { at: 9, kind: 'nova' }, // the maelstrom apex
    ],
  },
  // Resonance Coil (Resonant) — focusing lens → resonance singularity.
  coil: {
    growth: 0.019,
    parts: [
      { at: 1, kind: 'glyphRing' }, // a focusing lens ring
      { at: 3, kind: 'organs', count: 3 }, // resonance nodes
      { at: 5, kind: 'barrel' }, // a lengthening emitter spire
      { at: 7, kind: 'arcs', count: 3 }, // resonant discharge
      { at: 9, kind: 'nova' }, // singularity
    ],
  },
  // Spitfang Turret (Kinetic) — autocannon → barbed overkill battery. It fans out more barrels and
  // bristles with spent-round spines as it masters its dependable single-target trade.
  spitfang: {
    growth: 0.022,
    parts: [
      { at: 1, kind: 'halo' }, // the muzzle-flash corona
      { at: 3, kind: 'barbs', count: 5 }, // spent-round spines / heat vanes
      { at: 5, kind: 'barrels', count: 4 }, // the rotary barrel bank widens
      { at: 7, kind: 'spikes', count: 6 }, // a barbed recoil carapace
      { at: 9, kind: 'nova' }, // the apex gunbeast
    ],
  },
  // Rift Anchor (Neural) — void seed → collapsed singularity. Presence over bulk: it grows the
  // least, but its glyphs, mass-nodes and event-horizon lightning intensify into a crowned well.
  rift: {
    growth: 0.018, // the densest silhouette — a singularity, not a sprawl
    parts: [
      { at: 1, kind: 'glyphRing' }, // the containment sigils
      { at: 3, kind: 'organs', count: 3 }, // condensed mass-nodes orbiting the well
      { at: 5, kind: 'arcs', count: 3 }, // event-horizon lightning
      { at: 7, kind: 'crown', count: 6 }, // a crown of collapse spikes
      { at: 9, kind: 'nova' }, // total collapse — the apex void
    ],
  },
  // Wyrmwing Glaive (Kinetic) — launch ring → apex blade-forge: edges, then a fanned blade rack.
  glaive: {
    growth: 0.022,
    parts: [
      { at: 1, kind: 'halo' }, // the launch-ring shimmer
      { at: 3, kind: 'barbs', count: 4 }, // honed wing-edges bud from the ring
      { at: 5, kind: 'barrels', count: 3 }, // a fanned rack of spare blades
      { at: 7, kind: 'spikes', count: 6 }, // a swept, bladed carapace
      { at: 9, kind: 'nova' }, // the apex forge
    ],
  },
  // Drake Roost (Vital) — warm clutch → wyrmmother nest: eggs, feeder limbs, a horned crown.
  roost: {
    growth: 0.024, // the nest fattens with its brood
    parts: [
      { at: 1, kind: 'heart' }, // the warm incubating core
      { at: 3, kind: 'pods', count: 3 }, // budding drake eggs
      { at: 5, kind: 'limbs', count: 3 }, // brood-tending feeder limbs
      { at: 7, kind: 'crown', count: 5 }, // a horned wyrmmother crest
      { at: 9, kind: 'nova' }, // the apex nest
    ],
  },
};

/** Body-silhouette scale from STARS (the "larger / prestige silhouette" read). Identity (1) at
 *  ★0, gentle per star so the body never outgrows its build pad (★10 ≈ 1.2×). Multiplies with the
 *  branch-tier growth, which is separate. */
export function starEvolutionGrowth(kind: TowerKind, stars: number): number {
  if (stars <= 0) return 1;
  const evo = STAR_EVOLUTION[kind];
  return 1 + (evo ? evo.growth : 0.02) * stars;
}

/** The minimal tower shape the star composer needs (a subset of the render tower). */
interface StarTower {
  kind: TowerKind;
  x: number;
  y: number;
  id: number;
}

/** Compose a tower's star-evolved organs over its (already growth-scaled) body: every organ whose
 *  appearance star ≤ the tower's stars, drawn via the shared PART_DRAWERS. Organ SIZE is driven by
 *  a moderated intensity `vis = ceil(stars/2)` (∈ 1..5 — the range the drawers were tuned for, so
 *  ★10 never blows up); WHICH organs appear is gated by the raw star. `fired` is the firing-recoil
 *  [0..1]. A 0-star tower (or an unmapped future kind) draws nothing. */
export function drawStarEvolution(
  ctx: CanvasRenderingContext2D,
  tw: StarTower,
  stars: number,
  r: number,
  now: number,
  baseColor: string,
  fired: number,
): void {
  if (stars <= 0) return;
  const evo = STAR_EVOLUTION[tw.kind];
  if (!evo) return;
  const vis = Math.min(5, Math.ceil(stars / 2)); // ★1-2→1, 3-4→2, 5-6→3, 7-8→4, 9-10→5
  const pc: PartCtx = { ctx, x: tw.x, y: tw.y, id: tw.id, r, now, tier: vis, above: 0, color: baseColor, fired, part: evo.parts[0] };
  for (const part of evo.parts) {
    if (part.at > stars) continue;
    pc.part = part;
    pc.above = 0; // star organs use a fixed count per generation (no count growth → no ★10 clutter)
    pc.color = part.color ?? baseColor;
    PART_DRAWERS[part.kind](pc);
  }
}
