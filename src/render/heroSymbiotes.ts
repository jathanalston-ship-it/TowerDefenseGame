// Hero SYMBIOTE visual evolution (docs/HERO-SYMBIOTES.md §visuals) — the grafted organism made
// visible. Each ACTIVE symbiote slot mutates its host another STAGE (armor scutes → feeler whips →
// the apex graft), every active organ's motif shimmers as living in-combat FX, and a RESONANT
// (fully evolved) hero wears the crown ring. A FOURTH consumer of the data-driven organ vocabulary
// in towerEvolution.ts (PART_DRAWERS) — a new hero is one data row, no new draw code.
//
// Stage rows are chosen to EXTEND each hero's silhouette and stay DISTINCT from its star-anatomy
// rows (heroEvolution.ts): stars grow the hero's own organs; symbiotes read as grafted PASSENGERS
// (plating, tendrils, pods) wrapped around them. Pure presentation: reads a per-hero summary the
// UI layer resolves from the save (stage/motifs/resonance), never the sim — a fresh account has
// stage 0 everywhere and draws NOTHING here (golden look unchanged).

import type { EvoPart, PartCtx } from './towerEvolution';
import { PART_DRAWERS } from './towerEvolution';
import { glowDisc, ring, pulse } from './vfx';
import { hexRgb, rgba } from './theme';
import type { HeroKind } from '../core/types';
import type { SymbioteMutation } from '../core/heroSymbiote';

/** The renderer-facing summary of one hero's symbiotes (GameView resolves it from meta once per
 *  save change; the draw loop never touches core resolve logic). */
export interface HeroSymbioteRender {
  stage: number; // active slots 0..3 — the host's mutation stage
  fx: SymbioteMutation[]; // active organ motifs (shimmer intensity = count)
  resonant: boolean; // all three slots active — wears the crown
}

/** Per-hero stage rows — stages[i] grows when slot i+1 is ACTIVE (cumulative; `per` counts keep
 *  swelling as later stages arrive). Guarded by heroSymbiotes.test: every hero, three stages. */
export const HERO_SYMBIOTE_VISUALS: Record<HeroKind, { stages: EvoPart[][] }> = {
  // Ravager — the predator is ARMORED by its passenger: scutes → venom barbs → hunting whips.
  ravager: { stages: [
    [{ at: 1, kind: 'armor', count: 3, per: 1 }],
    [{ at: 2, kind: 'barbs', count: 4, per: 1 }],
    [{ at: 3, kind: 'tendrils', count: 3 }, { at: 3, kind: 'pods', count: 2 }],
  ] },
  // Shepherd — the caretaker is WRAPPED: plating → contagion-halos of care → feeler whips.
  shepherd: { stages: [
    [{ at: 1, kind: 'armor', count: 3, per: 1 }],
    [{ at: 2, kind: 'ripples' }],
    [{ at: 3, kind: 'tendrils', count: 4 }],
  ] },
  // Overseer — the mind hosts a SECOND mind: feelers → egg-pods of thought → a deep presence ring.
  overseer: { stages: [
    [{ at: 1, kind: 'tendrils', count: 3, per: 1 }],
    [{ at: 2, kind: 'pods', count: 3 }],
    [{ at: 3, kind: 'ripples' }, { at: 3, kind: 'halo' }],
  ] },
  // Vitriol — the siege engine grows a refinery: plating → feeder whips → budding shell-pods.
  vitriol: { stages: [
    [{ at: 1, kind: 'armor', count: 3, per: 1 }],
    [{ at: 2, kind: 'tendrils', count: 3 }],
    [{ at: 3, kind: 'pods', count: 3, per: 1 }],
  ] },
  // Revenant — the wraith's graft phases WITH it: venom barbs → contagion rings → feeler whips.
  revenant: { stages: [
    [{ at: 1, kind: 'barbs', count: 3, per: 1 }],
    [{ at: 2, kind: 'ripples' }],
    [{ at: 3, kind: 'tendrils', count: 4 }],
  ] },
  // Knell — the bell is RE-CAST: resonant rings → ossified plating → chime pods.
  knell: { stages: [
    [{ at: 1, kind: 'ripples' }],
    [{ at: 2, kind: 'armor', count: 3, per: 1 }],
    [{ at: 3, kind: 'pods', count: 3 }],
  ] },
  // Cinderwyrm — the sky-furnace is SHOD: wing plating → trailing feelers → stormfire arcs.
  wyrm: { stages: [
    [{ at: 1, kind: 'armor', count: 3, per: 1 }],
    [{ at: 2, kind: 'tendrils', count: 3 }],
    [{ at: 3, kind: 'arcs', count: 2, per: 1 }],
  ] },
};

/** The minimal hero shape the composer needs (mirrors heroEvolution.ts). */
interface HeroLike {
  kind: HeroKind;
  x: number;
  y: number;
}

/** Compose the symbiote layer over the hero's body: stage organs (cumulative, swelling with later
 *  stages), a living motif shimmer per active organ, and the resonance crown. Stage 0 draws
 *  nothing (fresh look unchanged); a downed hero is muted (skipped). */
export function drawHeroSymbiotes(
  ctx: CanvasRenderingContext2D,
  h: HeroLike,
  view: HeroSymbioteRender | undefined,
  r: number,
  now: number,
  baseColor: string,
  down: boolean,
): void {
  if (!view || down || view.stage <= 0) return;
  const def = HERO_SYMBIOTE_VISUALS[h.kind];
  if (!def) return;
  const id = 3 + (h.kind.length % 5); // stable per-kind phase offset (independent of the star layer's)
  const c = hexRgb(baseColor);
  const stage = Math.min(def.stages.length, view.stage);

  // ── Stage organs — the grafted anatomy (PART_DRAWERS vocabulary) ─────────────────────────────
  const pc: PartCtx = { ctx, x: h.x, y: h.y, id, r: r * 1.06, now, tier: stage, above: 0, color: baseColor, fired: 0, part: def.stages[0][0] };
  for (let s = 0; s < stage; s++) {
    for (const part of def.stages[s]) {
      pc.part = part;
      pc.above = stage - part.at; // earlier grafts keep swelling as later slots awaken
      pc.color = part.color ?? baseColor;
      PART_DRAWERS[part.kind](pc);
    }
  }

  // ── Living motif shimmer — every active organ is a small pulsing symbiont light ─────────────
  const motes = Math.min(9, view.fx.length);
  for (let i = 0; i < motes; i++) {
    const ang = now * 0.9 + (i * Math.PI * 2) / Math.max(1, motes) + id;
    const orbit = r * (1.55 + 0.12 * Math.sin(now * 1.7 + i * 1.3));
    glowDisc(ctx, h.x + Math.cos(ang) * orbit, h.y + Math.sin(ang) * orbit, 1.5 + 0.2 * stage, rgba(c, pulse(now + i, 2.4, 0.3, 0.55)));
  }

  // ── Resonance crown — the fully evolved organism visibly sings ──────────────────────────────
  if (view.resonant) {
    ring(ctx, h.x, h.y, r * (1.9 + pulse(now + id, 1.6, 0, 0.18)), rgba(c, pulse(now + id, 1.6, 0.25, 0.5)), 1.6);
    ring(ctx, h.x, h.y, r * 2.25, rgba(c, 0.16), 1);
  }
}
