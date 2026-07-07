// Hero VISUAL evolution (docs/HERO-EVOLUTION.md §visuals) — heroes MUTATE with investment the
// same way towers do (src/render/towerEvolution.ts is the branch pattern; starEvolution.ts the
// permanent-star pattern). Two independent signals drive the look:
//   • PERMANENT stars (save.heroStars) set the hero's baseline ANATOMY tier (★0..★5): the body
//     swells and identity organs grow in — a ★5 hero reads as far more evolved than a ★0.
//   • IN-RUN Hero Evolution levels (the Hero Console purchases, run-wide) add BATTLE-DRESS: a
//     brightening aura ring + orbiting weapon-organs that grow with the run's investment.
//
// A THIRD consumer of the data-driven organ vocabulary in towerEvolution.ts (PART_DRAWERS) — so a
// new hero is one data row, no new draw code (CLAUDE.md "generalize, don't hardcode"). Each hero's
// organ SET is chosen to EXTEND its silhouette (ravager blades, shepherd heart, overseer glyphs),
// never homogenize it. Pure presentation: reads only a hero's kind/position + its star/evo counts,
// never the sim — heroes aren't part of the golden sim, and a ★0 / evo-0 hero draws nothing here,
// so the fresh-account look is unchanged.

import type { EvoPart, PartCtx } from './towerEvolution';
import { PART_DRAWERS } from './towerEvolution';
import { glowDisc, ring, pulse } from './vfx';
import { hexRgb, rgba } from './theme';
import type { HeroKind } from '../core/types';

/** A hero's star evolution: identity organs (each with the star it first appears at) + a body
 *  growth knob. `at` ∈ 1..5 (heroes cap at ★5). */
export interface HeroEvolution {
  growth: number; // body silhouette scale ADDED per star (★5 ≈ 1 + 5·growth)
  parts: EvoPart[];
}

// The roster — each hero grows a NEW organ at every star 1..5 (guarded by heroEvolution.test) plus
// earlier organs keep swelling. The organ CHOICE reads as the hero's class: Ravager = predatory
// blades, Shepherd = a living vital core, Overseer = psionic sigils. `color: undefined` ⇒ the organ
// takes the hero's class hue (passed in by the renderer), preserving identity.
export const HERO_EVOLUTION: Record<HeroKind, HeroEvolution> = {
  // Ravager (Kinetic diver) — the killing edge sharpens: fangs → barbs → limbs → a predator's crown.
  ravager: {
    growth: 0.05,
    parts: [
      { at: 1, kind: 'halo' },
      { at: 2, kind: 'fangs', count: 2, per: 1 }, // hungrier blades each star
      { at: 3, kind: 'spikes', count: 5 }, // barbed carapace
      { at: 4, kind: 'limbs', count: 2 }, // extra striking limbs
      { at: 5, kind: 'crown', count: 6 }, // apex predator
    ],
  },
  // Shepherd (Vital guardian) — a living aegis: a beating heart, vital nodes, tending limbs, a halo-crown.
  shepherd: {
    growth: 0.05,
    parts: [
      { at: 1, kind: 'heart' }, // a vital core + veins
      { at: 2, kind: 'organs', count: 3 }, // mending nodes
      { at: 3, kind: 'biomass', count: 3 }, // vital sacs
      { at: 4, kind: 'limbs', count: 3 }, // tending limbs
      { at: 5, kind: 'crown', count: 6 }, // the shepherd's halo-crown
    ],
  },
  // Overseer (Neural controller) — the mind ascends: glyph ring → nodes → arcs → crown → an ascendant nova.
  overseer: {
    growth: 0.042, // its power is presence, not mass — it grows the least
    parts: [
      { at: 1, kind: 'glyphRing' },
      { at: 2, kind: 'organs', count: 3 }, // psionic nodes
      { at: 3, kind: 'arcs', count: 2, per: 1 }, // neural lightning, wilder each star
      { at: 4, kind: 'crown', count: 6 }, // psionic crown
      { at: 5, kind: 'nova' }, // ascendant mind
    ],
  },
  // Vitriol (Caustic siege) — the corrosive engine accretes: ranging halo → glands → acid sacs → shell shards → a siege crown.
  vitriol: {
    growth: 0.05,
    parts: [
      { at: 1, kind: 'halo' }, // the bombardment envelope
      { at: 2, kind: 'organs', count: 3 }, // corrosive glands
      { at: 3, kind: 'biomass', count: 3 }, // acid sacs
      { at: 4, kind: 'spikes', count: 5 }, // spent shell casings / crust shards
      { at: 5, kind: 'crown', count: 6 }, // the siege caste's crown
    ],
  },
};

/** Stable per-kind phase offset so two heroes of different kinds don't pulse in lockstep. */
const KIND_PHASE: Record<HeroKind, number> = { ravager: 1, shepherd: 2, overseer: 3, vitriol: 4 };

/** Body-silhouette scale from permanent STARS (the "bigger, prestige hero" read). Identity (1) at
 *  ★0; gentle per star so the marker never dwarfs the field (★5 ≈ 1.2–1.25×). */
export function heroEvolutionGrowth(kind: HeroKind, stars: number): number {
  if (stars <= 0) return 1;
  const evo = HERO_EVOLUTION[kind];
  return 1 + (evo ? evo.growth : 0.05) * Math.min(5, stars);
}

/** The minimal hero shape the composer needs. */
interface HeroLike {
  kind: HeroKind;
  x: number;
  y: number;
}

/** Compose a hero's evolved silhouette over its (already growth-scaled) body:
 *  - IN-RUN evo (`evoLevel`, run-wide Hero Console total) grows the battle-dress: a brightening
 *    aura + orbiting weapon-organs whose size/intensity scale with the investment.
 *  - PERMANENT `stars` gate WHICH identity organs appear (1..5), drawn via the shared PART_DRAWERS;
 *    organ counts with a `per` swell as stars rise (monotone with investment).
 *  A ★0, evo-0 hero draws nothing here (fresh look unchanged); a downed hero is muted (skipped). */
export function drawHeroEvolution(
  ctx: CanvasRenderingContext2D,
  h: HeroLike,
  stars: number,
  evoLevel: number,
  r: number,
  now: number,
  baseColor: string,
  down: boolean,
): void {
  if (down) return;
  const id = KIND_PHASE[h.kind];
  const c = hexRgb(baseColor);

  // ── IN-RUN battle-dress (Hero Console evolution levels) ─────────────────────────────────────
  if (evoLevel > 0) {
    const intensity = Math.min(1, evoLevel / 8); // saturates so a maxed console isn't a supernova
    glowDisc(ctx, h.x, h.y, r * (1.5 + intensity * 0.9), rgba(c, 0.06 + intensity * 0.12));
    ring(ctx, h.x, h.y, r * (1.7 + intensity * 0.7), rgba(c, pulse(now + id, 2.2, 0.15, 0.35 + intensity * 0.28)), 1 + intensity * 1.4);
    const organs = Math.min(6, Math.ceil(evoLevel / 2)); // one weapon-organ per ~2 levels
    for (let i = 0; i < organs; i++) {
      const ang = now * 1.1 + (i * Math.PI * 2) / organs;
      const orbit = r * (1.85 + intensity * 0.45);
      glowDisc(ctx, h.x + Math.cos(ang) * orbit, h.y + Math.sin(ang) * orbit, 1.6 + intensity * 2.4, rgba(c, 0.55 + intensity * 0.3));
    }
  }

  // ── PERMANENT star anatomy (identity organs) ────────────────────────────────────────────────
  if (stars > 0) {
    const evo = HERO_EVOLUTION[h.kind];
    if (evo) {
      const vis = Math.min(5, stars);
      const pc: PartCtx = { ctx, x: h.x, y: h.y, id, r, now, tier: vis, above: 0, color: baseColor, fired: 0, part: evo.parts[0] };
      for (const part of evo.parts) {
        if (part.at > stars) continue;
        pc.part = part;
        pc.above = vis - part.at; // organs with a `per` count swell as stars rise
        pc.color = part.color ?? baseColor;
        PART_DRAWERS[part.kind](pc);
      }
    }
  }
}
