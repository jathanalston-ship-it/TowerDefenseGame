// REFORGE WHEEL painter (docs/MULLIGANS.md §reforge) — the bio-horror spinner. A fleshy
// IRIS of rarity-tinted wedges (one per wheel mod) around a pulsing pupil, read by a bone
// pointer at 12 o'clock. Pure painter: the overlay component owns the spin easing and
// passes the current angle; this draws one frame. Organic wobble rides `t` so the organ
// breathes even while the wheel rests. Deterministic — no RNG in here.

import { REFORGE_MODS, REFORGE_RARITY } from '../core/mulliganReforge';

export const WHEEL_SEGMENTS = REFORGE_MODS.length;
const TAU = Math.PI * 2;

/** The wheel angle (radians) that centers segment `i` under the top pointer. */
export function angleForSegment(i: number): number {
  const seg = TAU / WHEEL_SEGMENTS;
  return -Math.PI / 2 - (i + 0.5) * seg;
}

export function drawReforgeWheel(
  ctx: CanvasRenderingContext2D,
  size: number,
  angle: number,
  t: number,
  highlight = -1,
): void {
  const c = size / 2;
  const R = size * 0.44;
  const seg = TAU / WHEEL_SEGMENTS;
  ctx.clearRect(0, 0, size, size);

  // Backing membrane — a dark vitreous disc with a slow breathing rim.
  const breathe = 1 + 0.012 * Math.sin(t * 1.7);
  ctx.beginPath();
  ctx.arc(c, c, R * 1.08 * breathe, 0, TAU);
  ctx.fillStyle = 'rgba(6,10,14,0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,107,139,0.25)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // The iris: one organic wedge per wheel mod, tinted by rarity; edges wobble like tissue.
  for (let i = 0; i < WHEEL_SEGMENTS; i++) {
    const mod = REFORGE_MODS[i];
    const color = REFORGE_RARITY[mod.rarity].color;
    const a0 = angle + i * seg;
    const a1 = a0 + seg;
    const wob = 1 + 0.02 * Math.sin(t * 2.3 + i * 1.7);
    const rOut = R * wob;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a0) * R * 0.34, c + Math.sin(a0) * R * 0.34);
    ctx.arc(c, c, rOut, a0, a1);
    ctx.arc(c, c, R * 0.34, a1, a0, true);
    ctx.closePath();
    const lit = i === highlight;
    ctx.fillStyle = lit ? color : `${color}44`;
    ctx.fill();
    ctx.strokeStyle = lit ? '#fff' : 'rgba(10,16,22,0.9)';
    ctx.lineWidth = lit ? 2.5 : 1.5;
    ctx.stroke();
    // A vein from hub to rim per membrane wall — the organic read.
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a0) * R * 0.36, c + Math.sin(a0) * R * 0.36);
    ctx.quadraticCurveTo(
      c + Math.cos(a0 + 0.04) * R * 0.7, c + Math.sin(a0 + 0.04) * R * 0.7,
      c + Math.cos(a0) * rOut, c + Math.sin(a0) * rOut,
    );
    ctx.strokeStyle = 'rgba(255,107,139,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // The pupil: a wet central orb, pulsing; a ring of teeth around it.
  const pr = R * 0.3 * (1 + 0.04 * Math.sin(t * 3.1));
  const grad = ctx.createRadialGradient(c - pr * 0.25, c - pr * 0.3, pr * 0.1, c, c, pr);
  grad.addColorStop(0, '#3a1622');
  grad.addColorStop(0.7, '#160a12');
  grad.addColorStop(1, '#0a060a');
  ctx.beginPath();
  ctx.arc(c, c, pr, 0, TAU);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,107,139,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  for (let i = 0; i < 9; i++) {
    const a = angle * 0.4 + (i / 9) * TAU;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * pr, c + Math.sin(a) * pr);
    ctx.lineTo(c + Math.cos(a) * pr * 1.22, c + Math.sin(a) * pr * 1.22);
    ctx.strokeStyle = 'rgba(230,238,246,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // The bone pointer at 12 o'clock — fixed; the iris turns beneath it.
  ctx.beginPath();
  ctx.moveTo(c - size * 0.03, c - R * 1.12);
  ctx.lineTo(c + size * 0.03, c - R * 1.12);
  ctx.lineTo(c, c - R * 0.86);
  ctx.closePath();
  ctx.fillStyle = '#e6eef6';
  ctx.fill();
  ctx.strokeStyle = 'rgba(10,16,22,0.9)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
