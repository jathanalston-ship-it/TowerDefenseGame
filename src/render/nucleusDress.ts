// NUCLEUS DRESS (docs/NUCLEUS.md §visuals) — the render kit that visibly MUTATES the in-run Hive
// Nucleus from the account's resolved Nucleus Mulligans. Module state set by GameView at run boot
// (the wardrobeFx pattern: account-side visuals never touch the sim), read by renderer.drawBase.
// Every active organ contributes its MUTATION motif; duplicates deepen the motif (count = growth
// stage); each COMPLETE class adaptation grows the apex CROWN. Null/empty ⇒ the classic organ —
// zero draw calls, zero cost (golden-visual parity).
//
// Deterministic from (t, motif index) only — no RNG, stable frame to frame, so the organism
// reads as ALIVE (pulsing, blinking, waving) without ever flickering.

import type { NucleusMutation } from '../core/nucleus';

export interface NucleusDressKit {
  mutations: NucleusMutation[]; // one entry per active organ (motif repeats deepen it)
  crowns: number; // complete class adaptations (the apex crest count)
}

let kit: NucleusDressKit | null = null;

/** Set by GameView at run boot (null on unmount / for daily + tutorial runs — account visuals
 *  stay out of the shared gauntlet and the clean sandbox, mirroring their sim-side gating). */
export function setNucleusDress(next: NucleusDressKit | null): void {
  kit = next && (next.mutations.length > 0 || next.crowns > 0) ? next : null;
}
export function nucleusDress(): NucleusDressKit | null {
  return kit;
}

const TAU = Math.PI * 2;

/** Count per motif (the growth stage each motif renders at). */
function motifCounts(k: NucleusDressKit): Partial<Record<NucleusMutation, number>> {
  const out: Partial<Record<NucleusMutation, number>> = {};
  for (const m of k.mutations) out[m] = (out[m] ?? 0) + 1;
  if (k.crowns > 0) out.crown = (out.crown ?? 0) + k.crowns;
  return out;
}

/** Draw the grown mutations around/over the Nucleus body. Called by renderer.drawBase AFTER the
 *  membrane body (growths sit on the flesh) and BEFORE the core highlight. (x,y) is the shuddering
 *  organ center, R its beat-scaled radius, beat the heartbeat scalar, t seconds. */
export function drawNucleusMutations(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, beat: number, t: number): void {
  if (kit) drawKit(ctx, kit, x, y, R, beat, t);
}

/** The kit-parameterized draw — the UI preview (NucleusChambers) renders the SAME motifs the run
 *  will, from any kit, without touching the live module state. */
export function drawKit(ctx: CanvasRenderingContext2D, k: NucleusDressKit, x: number, y: number, R: number, beat: number, t: number): void {
  if (k.mutations.length === 0 && k.crowns === 0) return;
  const counts = motifCounts(k);
  ctx.save();

  // VEINS — vascular webbing crawling outward; more organs ⇒ more strands, farther reach.
  const veins = counts.veins ?? 0;
  if (veins > 0) {
    const n = 3 + veins * 2;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.sin(t * 0.7 + i) * 0.05;
      const reach = R * (1.15 + 0.25 * veins) * (1 + 0.03 * Math.sin(t * 2 + i * 1.7));
      const midA = a + 0.3 * Math.sin(t * 1.1 + i * 2.3);
      ctx.strokeStyle = `rgba(122, 227, 168, ${0.28 + 0.06 * Math.sin(t * 2.4 + i)})`;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * R * 0.55, y + Math.sin(a) * R * 0.55);
      ctx.quadraticCurveTo(x + Math.cos(midA) * reach * 0.7, y + Math.sin(midA) * reach * 0.7, x + Math.cos(a) * reach, y + Math.sin(a) * reach);
      ctx.stroke();
    }
  }

  // PLATING — ossified armor arcs layered around the body; count = shell depth.
  const plating = counts.plating ?? 0;
  for (let ring = 0; ring < plating; ring++) {
    const rr = R * (0.72 + ring * 0.16);
    const segs = 5 + ring;
    ctx.strokeStyle = `rgba(226, 214, 194, ${0.5 - ring * 0.08})`;
    ctx.lineWidth = 2.6 - ring * 0.4;
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * TAU + ring * 0.4 + Math.sin(t * 0.4) * 0.04;
      ctx.beginPath();
      ctx.arc(x, y, rr, a0, a0 + (TAU / segs) * 0.62);
      ctx.stroke();
    }
  }

  // EYES — an ocelli ring that BLINKS (deterministic stagger); count = eyes.
  const eyes = counts.eyes ?? 0;
  if (eyes > 0) {
    const n = 2 + eyes * 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.35;
      const ex = x + Math.cos(a) * R * 0.92;
      const ey = y + Math.sin(a) * R * 0.92;
      const blink = Math.max(0.12, Math.abs(Math.sin(t * 0.9 + i * 2.1))); // 0.12 = lid never fully shut
      ctx.fillStyle = 'rgba(20, 14, 18, 0.85)';
      ctx.beginPath();
      ctx.ellipse(ex, ey, 2.6, 2.6 * blink, a, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 212, 77, ${0.75 * blink})`;
      ctx.beginPath();
      ctx.ellipse(ex, ey, 1.2, 1.2 * blink, a, 0, TAU);
      ctx.fill();
    }
  }

  // TENTACLES — slow waving feelers rooted on the rim; count = feelers per side.
  const tents = counts.tentacles ?? 0;
  if (tents > 0) {
    const n = 2 + tents * 2;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 1.1;
      const sway = Math.sin(t * 1.6 + i * 1.9) * 0.45;
      const len = R * (0.9 + 0.18 * tents);
      const bx = x + Math.cos(a) * R * 0.95;
      const by = y + Math.sin(a) * R * 0.95;
      ctx.strokeStyle = `rgba(255, 122, 144, ${0.4 + 0.1 * Math.sin(t * 2 + i)})`;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(
        bx + Math.cos(a + sway) * len * 0.6, by + Math.sin(a + sway) * len * 0.6,
        bx + Math.cos(a + sway * 1.6) * len, by + Math.sin(a + sway * 1.6) * len,
      );
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  // PULSE — a deep biomass throb halo breathing against the heartbeat; count = intensity.
  const pulseN = counts.pulse ?? 0;
  if (pulseN > 0) {
    const u = (t * 0.5) % 1;
    const rr = R * (1.05 + u * (0.5 + 0.2 * pulseN));
    ctx.strokeStyle = `rgba(182, 232, 74, ${0.3 * (1 - u) * Math.min(1, 0.5 + 0.25 * pulseN)})`;
    ctx.lineWidth = 2 + pulseN;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, TAU);
    ctx.stroke();
  }

  // SACS — budding symbiotic pods clinging to the lower rim; count = brood size.
  const sacs = counts.sacs ?? 0;
  if (sacs > 0) {
    const n = 1 + sacs * 2;
    for (let i = 0; i < n; i++) {
      const a = 0.5 + (i / n) * Math.PI; // lower hemisphere
      const grow = 1 + 0.12 * Math.sin(t * 1.3 + i * 2.7);
      const sx = x + Math.cos(a) * R * 0.85;
      const sy = y + Math.abs(Math.sin(a)) * R * 0.85;
      ctx.fillStyle = `rgba(201, 139, 255, ${0.42 + 0.08 * Math.sin(t + i)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, (2 + (i % 3)) * grow, 0, TAU);
      ctx.fill();
    }
  }

  // SPORES — drifting motes orbiting on lazy ellipses; count = cloud density.
  const spores = counts.spores ?? 0;
  if (spores > 0) {
    const n = 3 + spores * 3;
    for (let i = 0; i < n; i++) {
      const a = t * (0.25 + (i % 4) * 0.07) + i * 2.4;
      const rr = R * (1.2 + (i % 5) * 0.14);
      ctx.fillStyle = `rgba(154, 232, 130, ${0.3 + 0.15 * Math.sin(t * 2 + i * 3)})`;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8, 1.4, 0, TAU);
      ctx.fill();
    }
  }

  // CROWN — the apex crest: one spire per complete class adaptation, rising from the top rim.
  const crowns = counts.crown ?? 0;
  if (crowns > 0) {
    const n = Math.min(5, crowns + 1);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.38;
      const h = R * (0.55 + 0.1 * crowns) * (1 + 0.05 * Math.sin(t * 2.2 + i)) * beat;
      const bx = x + Math.cos(a) * R * 0.88;
      const by = y + Math.sin(a) * R * 0.88;
      const tx = x + Math.cos(a) * (R * 0.88 + h);
      const ty = y + Math.sin(a) * (R * 0.88 + h);
      ctx.strokeStyle = 'rgba(255, 210, 77, 0.8)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.fillStyle = `rgba(255, 232, 150, ${0.6 + 0.3 * Math.sin(t * 3 + i * 1.3)})`;
      ctx.beginPath();
      ctx.arc(tx, ty, 2, 0, TAU);
      ctx.fill();
    }
  }

  ctx.restore();
}
