// MEGA BOSS presentation (docs/MEGA-BOSS.md §visuals) — the battlefield-scale organism. Pure
// Canvas 2D procedural drawing off RenderState.megaBoss (no sim reads, no allocation-heavy paths):
//   • drawMegaBody      — UNDER the entities: the ridge-spanning mass (beyond both screen edges),
//                          layered depth silhouettes, breathing, tentacles, the tracking eye, the
//                          maw, vein glow, phase mutations, the death collapse.
//   • drawMegaOrgans    — OVER the enemies: weak-point organs descending on fleshy stalks, with
//                          per-kind anatomy, vulnerability glow, HP arcs, hit flashes, scars.
//   • drawMegaShots     — raid-fire tracers (tower/hero → organ / body chip).
//   • drawMegaVignette  — the screen-space presence: an ambient tint that deepens per phase,
//                          floods on a heart exposure, and guts out through the death sequence.
// Everything keys off def palette + kind — a future Mega Boss gets a full presentation for free.

import { WIDTH, HEIGHT } from '../core/map';
import { hexRgb, rgba } from './theme';
import type { RenderState } from '../core/game';
import type { MegaWeakPoint } from '../core/megaboss';

type Ctx = CanvasRenderingContext2D;
type MegaView = NonNullable<RenderState['megaBoss']>;

const TAU = Math.PI * 2;

/** Sinusoidal pulse in [lo, hi] with period `period` (matches the renderer's local helper). */
function pulse(t: number, period: number, lo = 0, hi = 1): number {
  return lo + (hi - lo) * (0.5 + 0.5 * Math.sin((t / period) * TAU));
}

function glow(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1, r), 0, TAU);
  ctx.fill();
}

/** The death-collapse factor: 0 = alive, 1 = fully collapsed (deathT counts 3.5 → 0). */
function collapseOf(v: MegaView): number {
  return v.deathT > 0 ? Math.min(1, Math.max(0, 1 - v.deathT / 3.5)) : 0;
}

// ── Render-side one-shots (module state, render-only): the CAST flash fires the frame a
//    telegraph resolves into its strike, and each weak point's RUPTURE burst fires on its
//    open→destroyed edge. One mega exists at a time, so plain module scope is safe — and
//    stale entries simply draw nothing on the next encounter.
let lastTele = false;
let castFlashT = -10; // renderer-now when the last telegraph resolved
const wpPrevState = new Map<number, MegaWeakPoint['state']>(); // spec → last-frame state
const wpRuptureT = new Map<number, number>(); // spec → renderer-now of the rupture

// ── The body (under entities) ────────────────────────────────────────────────
export function drawMegaBody(ctx: Ctx, v: MegaView, now: number): void {
  const body = hexRgb(v.palette.body);
  const glo = hexRgb(v.palette.glow);
  const acc = hexRgb(v.palette.accent);
  const tier = v.visualTier;
  const collapse = collapseOf(v);
  const dead = collapse > 0;
  // Breathing: a slow whole-mass swell; guttering/erratic through the death sequence.
  const breathe = dead ? 1 + Math.sin(now * 14) * 0.01 * (1 - collapse) : 1 + Math.sin(now * 0.9) * (0.018 + tier * 0.004);
  const sag = collapse * 60; // the mass slumps as it dies
  const baseY = (v.anchorY + 90) * breathe + sag; // the ridge's lower edge center line
  const alpha = dead ? 1 - collapse * 0.55 : 1;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Depth layers, back → front: three ridge silhouettes, each an undulating closed shape spanning
  // beyond both screen edges — the battlefield exists BENEATH this thing.
  for (let layer = 2; layer >= 0; layer--) {
    const off = layer * 26; // higher layers sit deeper (further up + darker)
    const sway = Math.sin(now * 0.2 + layer * 1.7) * (3 - layer); // slow parallax drift
    const yb = baseY - off - layer * 8;
    const shade = 0.55 + (2 - layer) * 0.225; // front layer full color
    ctx.fillStyle = rgba(body, alpha * (0.5 + 0.5 * shade));
    ctx.beginPath();
    ctx.moveTo(-90, -40);
    ctx.lineTo(-90, yb - 30);
    // The undulating lower edge: overlapping muscle lobes.
    const lobes = 6 + tier;
    for (let i = 0; i <= lobes; i++) {
      const x = -90 + ((WIDTH + 180) / lobes) * i + sway;
      const drop = Math.sin(i * 2.1 + layer + now * (dead ? 2.4 : 0.45)) * (14 + tier * 3) * breathe;
      const y = yb + drop - (dead ? Math.sin(i * 3.1) * collapse * 26 : 0);
      const px = -90 + ((WIDTH + 180) / lobes) * (i - 0.5) + sway;
      ctx.quadraticCurveTo(px, y + 26 * breathe, x, y);
    }
    ctx.lineTo(WIDTH + 90, -40);
    ctx.closePath();
    ctx.fill();
  }

  // Carapace edge-light: the front lobe line wears a soft underglow + a lit chitin rim, so
  // the mass reads as ARMORED anatomy, not a flat stack of silhouettes. Same math as the
  // layer-0 fill above, so the rim rides the exact breathing edge.
  {
    const sway = Math.sin(now * 0.2) * 3;
    const lobes = 6 + tier;
    ctx.beginPath();
    for (let i = 0; i <= lobes; i++) {
      const x = -90 + ((WIDTH + 180) / lobes) * i + sway;
      const drop = Math.sin(i * 2.1 + now * (dead ? 2.4 : 0.45)) * (14 + tier * 3) * breathe;
      const y = baseY + drop - (dead ? Math.sin(i * 3.1) * collapse * 26 : 0);
      const px = -90 + ((WIDTH + 180) / lobes) * (i - 0.5) + sway;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.quadraticCurveTo(px, y + 26 * breathe, x, y);
    }
    ctx.strokeStyle = rgba(glo, alpha * (dead ? 0.08 : 0.14 + pulse(now, 2.4 - tier * 0.35, 0, 0.1)));
    ctx.lineWidth = 6;
    ctx.stroke(); // underglow first (same path, wider)
    ctx.strokeStyle = rgba(acc, alpha * (dead ? 0.22 : 0.45));
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  // Living emissions (beauty pass): spores sift down off the mass, and viscous ichor
  // strands hang + drip from the lobe line — the organism sheds onto the battlefield.
  if (!dead) {
    for (let i = 0; i < 9; i++) {
      const h = Math.abs(Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1;
      const f = (now * (0.12 + h * 0.1) + h) % 1;
      const sx = h * WIDTH + Math.sin(now * 0.5 + i) * 14;
      ctx.fillStyle = rgba(glo, (1 - f) * 0.28 * alpha);
      ctx.beginPath();
      ctx.arc(sx, baseY - 10 + f * 120, 1.2 + h * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = rgba(body, 0.5 * alpha);
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      const h = Math.abs(Math.sin(i * 61.7 + 43.3) * 24634.6345) % 1;
      const sx = (0.18 + h * 0.64) * WIDTH;
      const sag2 = (14 + h * 22) * (1 + Math.sin(now * 0.7 + i * 2.4) * 0.25);
      ctx.beginPath();
      ctx.moveTo(sx, baseY - 6);
      ctx.quadraticCurveTo(sx + 3, baseY + sag2 * 0.6, sx + Math.sin(now * 0.4 + i) * 4, baseY + sag2);
      ctx.stroke();
      const drip = (now * (0.3 + h * 0.25) + h) % 1;
      if (drip > 0.7) {
        ctx.fillStyle = rgba(body, (1 - (drip - 0.7) / 0.3) * 0.6 * alpha);
        ctx.beginPath();
        ctx.arc(sx, baseY + sag2 + ((drip - 0.7) / 0.3) * 46, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Vein network: glowing channels crawling the front ridge; pulse rate rises with phase.
  const veinPulse = pulse(now, dead ? 0.4 : 2.4 - tier * 0.35, 0.25, 0.7) * (dead ? 1 - collapse : 1);
  ctx.strokeStyle = rgba(glo, veinPulse * alpha * (v.exposed ? 1 : 0.55));
  ctx.lineWidth = v.exposed ? 2.4 : 1.5;
  for (let i = 0; i < 4 + tier; i++) {
    const x0 = (WIDTH / (4 + tier)) * i + 30;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.bezierCurveTo(x0 - 30, baseY * 0.35, x0 + 40, baseY * 0.65, x0 + Math.sin(i * 2.7) * 50, baseY - 8);
    ctx.stroke();
  }

  // Phase-mutation spines along the crest (one row per visual tier — every shift visibly mutates).
  for (let row = 0; row < tier; row++) {
    const n = 8 - row;
    ctx.fillStyle = rgba(acc, alpha * 0.8);
    for (let i = 0; i < n; i++) {
      const x = (WIDTH / n) * (i + 0.5) + Math.sin(now * 0.3 + i) * 4;
      const y = v.anchorY - 12 - row * 24 + Math.sin(now * 0.8 + i * 1.3) * 3;
      const h = (16 + row * 6) * breathe;
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x, y - h);
      ctx.lineTo(x + 6, y);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Tentacles: limbs descending from the underside, swaying; drooping when stunned / dying.
  const limbs = 4 + tier;
  const droop = v.stunned > 0 ? 0.3 : dead ? 0.15 : 1;
  ctx.strokeStyle = rgba(body, alpha * 0.95);
  ctx.lineCap = 'round';
  for (let i = 0; i < limbs; i++) {
    const rootX = (WIDTH / (limbs + 1)) * (i + 1) + Math.sin(i * 5.3) * 18;
    const rootY = baseY - 10;
    const phase = now * (0.7 + (i % 3) * 0.2) + i * 2.1;
    const swing = Math.sin(phase) * 26 * droop;
    const len = (70 + (i % 3) * 34) * breathe + (dead ? collapse * 40 : v.stunned > 0 ? 24 : 0);
    const tipX = rootX + swing;
    const tipY = rootY + len;
    for (let s = 0; s < 2; s++) {
      ctx.lineWidth = (9 - s * 4) * (1 - collapse * 0.4);
      ctx.strokeStyle = s === 0 ? rgba(body, alpha * 0.9) : rgba(acc, alpha * 0.5);
      ctx.beginPath();
      ctx.moveTo(rootX, rootY);
      ctx.bezierCurveTo(rootX - swing * 0.6, rootY + len * 0.4, tipX + swing * 0.4, rootY + len * 0.7, tipX, tipY);
      ctx.stroke();
    }
    // Tip drip: an occasional gleaming bead sliding off the limb.
    const drip = (now * 0.5 + i * 0.37) % 1;
    if (drip < 0.5 && !dead) glow(ctx, tipX, tipY + drip * 26, 3, rgba(glo, 0.5 * (1 - drip * 2)));
  }
  ctx.lineCap = 'butt';

  // THE EYE — tracking iris; blinks; dilates and locks bright during a telegraph.
  const eyeX = WIDTH * 0.5 + Math.sin(now * 0.23) * 40;
  const eyeY = v.anchorY + 26 + Math.sin(now * 0.31) * 8 + sag;
  const blink = dead ? collapse : Math.max(0, Math.sin(now * 0.47) > 0.985 ? 1 : 0);
  const eyeOpen = 1 - blink * 0.9;
  const tele = v.telegraph;
  // The windup just resolved — the strike lands NOW. A vanished telegraph with stun on it was
  // an eye INTERRUPT (the player's win), so that edge must not flash like a landed cast.
  if (lastTele && !tele && !dead && v.stunned <= 0) castFlashT = now;
  lastTele = !!tele && !dead;
  const irisR = (7 + (tele ? 4 * tele.frac : 0)) * eyeOpen;
  ctx.fillStyle = rgba('12, 8, 10', alpha * 0.9);
  ctx.beginPath();
  ctx.ellipse(eyeX, eyeY, 26, 15 * eyeOpen, 0, 0, TAU);
  ctx.fill();
  const lookX = tele ? 0 : Math.sin(now * 0.6) * 9;
  const lookY = tele ? 4 : Math.cos(now * 0.43) * 4;
  glow(ctx, eyeX + lookX, eyeY + lookY, irisR * 2.4, rgba(glo, (tele ? 0.9 : 0.55) * eyeOpen * alpha));
  ctx.fillStyle = rgba(glo, alpha * eyeOpen);
  ctx.beginPath();
  ctx.arc(eyeX + lookX, eyeY + lookY, irisR, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rgba('8, 4, 6', alpha * eyeOpen);
  ctx.beginPath();
  ctx.arc(eyeX + lookX, eyeY + lookY, irisR * 0.45, 0, TAU);
  ctx.fill();

  // THE MAW — center underside; cycles open; gapes during a telegraph; slack in death.
  const mawX = WIDTH * 0.5;
  const mawY = baseY + 6;
  const gape = dead ? 0.9 : tele ? 0.45 + 0.45 * tele.frac : 0.18 + pulse(now, 3.4) * 0.16;
  ctx.fillStyle = rgba('10, 5, 8', alpha * 0.95);
  ctx.beginPath();
  ctx.ellipse(mawX, mawY, 64, 30 * gape, 0, 0, TAU);
  ctx.fill();
  glow(ctx, mawX, mawY, 46 * gape, rgba(glo, 0.22 * gape * alpha));
  ctx.fillStyle = rgba('230, 224, 210', alpha * 0.85);
  const teeth = 9;
  for (let i = 0; i < teeth; i++) {
    const tx = mawX - 56 + (112 / (teeth - 1)) * i;
    const th = (7 + (i % 3) * 4) * gape;
    ctx.beginPath();
    ctx.moveTo(tx - 4, mawY - 26 * gape);
    ctx.lineTo(tx, mawY - 26 * gape + th);
    ctx.lineTo(tx + 4, mawY - 26 * gape);
    ctx.closePath();
    ctx.fill();
  }

  // Telegraph GATHER: motes of power stream INTO the gaping maw across the windup — the
  // counterplay window is legible from body language alone, before any UI timer.
  if (tele && !dead) {
    for (let i = 0; i < 12; i++) {
      const h = Math.abs(Math.sin(i * 91.7 + 7.3) * 10000) % 1;
      const f = (now * (0.9 + h * 0.7) + h) % 1; // 0 = born far out → 1 = swallowed
      const a2 = h * TAU + i * 0.7;
      const d = (46 + h * 110) * (1 - f);
      ctx.fillStyle = rgba(glo, (0.2 + 0.6 * f) * tele.frac * alpha);
      ctx.beginPath();
      ctx.arc(mawX + Math.cos(a2) * d, mawY + Math.sin(a2) * d * 0.5, 1.2 + h * 1.8, 0, TAU);
      ctx.fill();
    }
  }
  // CAST shock: the frame the telegraph resolves, a ground-plane ring slams out of the maw.
  const castAge = now - castFlashT;
  if (castAge >= 0 && castAge < 0.5 && !dead) {
    const f = castAge / 0.5;
    ctx.strokeStyle = rgba(glo, (1 - f) * 0.7 * alpha);
    ctx.lineWidth = 1 + (1 - f) * 3;
    ctx.beginPath();
    ctx.ellipse(mawX, mawY, 24 + f * 170, (24 + f * 170) * 0.42, 0, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,250,240,${(1 - f) * 0.5})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(mawX, mawY, 12 + f * 120, (12 + f * 120) * 0.42, 0, 0, TAU);
    ctx.stroke();
  }

  // Exposure flood (heart window): the whole mass runs hot — commit NOW.
  if (v.exposed && !dead) {
    ctx.fillStyle = rgba(glo, 0.1 + pulse(now, 0.5) * 0.08);
    ctx.fillRect(-90, -40, WIDTH + 180, baseY + 40);
  }
  // Stun arcs (eye interrupt): crackles over the crest while the rotation is frozen.
  if (v.stunned > 0 && !dead) {
    ctx.strokeStyle = rgba('255, 255, 255', 0.5 + pulse(now, 0.22) * 0.3);
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 5; i++) {
      const x = WIDTH * (0.2 + 0.15 * i) + Math.sin(now * 21 + i * 9) * 10;
      const y = v.anchorY + Math.sin(now * 17 + i * 5) * 16;
      ctx.beginPath();
      ctx.moveTo(x - 10, y);
      ctx.lineTo(x - 3, y - 7);
      ctx.lineTo(x + 3, y + 6);
      ctx.lineTo(x + 10, y - 4);
      ctx.stroke();
    }
  }

  // Dynamic shadow — the battlefield sits beneath the organism.
  const sh = ctx.createLinearGradient(0, baseY, 0, baseY + 130);
  sh.addColorStop(0, `rgba(0, 0, 0, ${0.34 * alpha * (1 - collapse * 0.6)})`);
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, baseY, WIDTH, 130);

  ctx.restore();
}

// ── Weak-point organs (over enemies) ─────────────────────────────────────────
export function drawMegaOrgans(ctx: Ctx, v: MegaView, now: number): void {
  const glo = hexRgb(v.palette.glow);
  const body = hexRgb(v.palette.body);
  const collapse = collapseOf(v);
  if (collapse >= 1) return;
  const rootY = v.anchorY + 84;
  for (const wp of v.weakPoints) {
    // Rupture edge-detect: the frame an organ dies, arm its one-shot burst (render-only).
    const prev = wpPrevState.get(wp.spec);
    if (prev !== undefined && prev !== 'destroyed' && wp.state === 'destroyed') wpRuptureT.set(wp.spec, now);
    wpPrevState.set(wp.spec, wp.state);
    if (wp.state === 'destroyed') {
      // The RUPTURE — one violent burst as it dies: a shock ring + ichor chunks arcing down.
      const rt = wpRuptureT.get(wp.spec);
      if (rt !== undefined && now - rt < 0.6) {
        const f = (now - rt) / 0.6;
        ctx.strokeStyle = rgba(glo, (1 - f) * 0.85);
        ctx.lineWidth = 0.5 + (1 - f) * 2.5;
        ctx.beginPath();
        ctx.arc(wp.x, wp.y, 10 + f * 55, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = rgba(body, (1 - f) * 0.9);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + wp.spec;
          const d = f * (30 + (i % 3) * 16);
          ctx.beginPath();
          ctx.arc(wp.x + Math.cos(a) * d, wp.y + Math.sin(a) * d * 0.7 + f * f * 40, 3.5 * (1 - f * 0.6), 0, TAU);
          ctx.fill();
        }
        glow(ctx, wp.x, wp.y, 30 * (1 - f), rgba(glo, (1 - f) * 0.5));
      }
      // The scar it leaves: a torn stump at the body line, flaps twitching, weeping ichor.
      glow(ctx, wp.x, rootY, 12, rgba(body, 0.5));
      ctx.fillStyle = rgba('20, 10, 12', 0.85);
      ctx.beginPath();
      ctx.arc(wp.x, rootY, 7, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba(body, 0.7);
      ctx.beginPath();
      ctx.moveTo(wp.x - 7, rootY);
      ctx.lineTo(wp.x - 3, rootY + 9 + Math.sin(now * 1.3 + wp.spec) * 1.5);
      ctx.lineTo(wp.x + 1, rootY + 2);
      ctx.lineTo(wp.x + 4, rootY + 7 + Math.cos(now * 1.1 + wp.spec) * 1.5);
      ctx.lineTo(wp.x + 7, rootY);
      ctx.closePath();
      ctx.fill();
      const weep = (now * 0.4 + wp.spec * 0.31) % 1;
      ctx.fillStyle = rgba(glo, (1 - weep) * 0.55);
      ctx.beginPath();
      ctx.arc(wp.x + Math.sin(wp.spec) * 2, rootY + 10 + weep * 42, 1.7, 0, TAU);
      ctx.fill();
      continue;
    }
    const closed = wp.state === 'closed';
    const descend = closed ? 0.18 : easeOut(wp.emergeT);
    const oy = rootY + (wp.y - rootY) * descend; // the organ's current position on its stalk
    const dim = closed ? 0.35 : 1;

    // The stalk: two fleshy strands + a lit vein feeding the organ.
    const swing = Math.sin(now * 0.8 + wp.spec * 2.3) * 7 * descend;
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(body, 0.85 * dim);
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(wp.x, rootY);
    ctx.bezierCurveTo(wp.x - swing, rootY + (oy - rootY) * 0.4, wp.x + swing, rootY + (oy - rootY) * 0.75, wp.x + swing * 0.4, oy);
    ctx.stroke();
    ctx.strokeStyle = rgba(glo, (0.25 + pulse(now, 1.1, 0, 0.35)) * dim);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineCap = 'butt';

    const ox = wp.x + swing * 0.4;
    // Raid-scale anatomy: organs draw at ×1.25 through a transform, so every per-kind
    // painter (and its beats/particles) inherits the presence without re-authoring.
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(1.25, 1.25);
    drawOrgan(ctx, wp, 0, 0, glo, body, now, dim);
    ctx.restore();

    if (!closed) {
      // Vulnerability ring — the battlefield itself says SHOOT THIS.
      const ringR = 31 + pulse(now, 0.9) * 5;
      ctx.strokeStyle = rgba(glo, 0.5 + pulse(now, 0.9) * 0.3);
      ctx.lineWidth = 1.6;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(ox, oy, ringR, now % TAU, (now % TAU) + TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      // HP arc: how close the rupture is.
      const frac = Math.max(0, wp.hp / wp.maxHp);
      ctx.strokeStyle = rgba('255, 255, 255', 0.75);
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(ox, oy, 25, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
      ctx.stroke();
      if (wp.hitFlash > 0) glow(ctx, ox, oy, 29, `rgba(255,255,255,${Math.min(0.7, wp.hitFlash * 4)})`);
    }
  }
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

/** Per-kind organ anatomy — procedural, palette-driven, ~15px scale. */
function drawOrgan(ctx: Ctx, wp: MegaWeakPoint, x: number, y: number, glo: string, body: string, now: number, dim: number): void {
  const beat = 1 + Math.sin(now * 4 + wp.spec) * 0.07;
  glow(ctx, x, y, 22 * dim, rgba(glo, 0.3 * dim));
  switch (wp.kind) {
    case 'eye': {
      ctx.fillStyle = rgba('14, 8, 10', 0.95 * dim);
      ctx.beginPath();
      ctx.ellipse(x, y, 15, 10, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba(glo, dim);
      ctx.beginPath();
      ctx.arc(x + Math.sin(now * 1.9) * 4, y, 5.5, 0, TAU);
      ctx.fill();
      break;
    }
    case 'heart': {
      ctx.fillStyle = rgba(body, 0.95 * dim);
      ctx.beginPath();
      ctx.arc(x - 5, y - 2, 9 * beat, 0, TAU);
      ctx.arc(x + 5, y - 2, 9 * beat, 0, TAU);
      ctx.arc(x, y + 7, 10 * beat, 0, TAU);
      ctx.fill();
      glow(ctx, x, y, 14 * beat, rgba(glo, 0.5 * dim));
      break;
    }
    case 'parasite_sac': {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + now * 0.4;
        ctx.fillStyle = rgba(body, (0.8 - i * 0.12) * dim);
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 7, y + Math.sin(a) * 6, 8 - i, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = rgba(glo, 0.5 * dim);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(x + Math.sin(i * 2.6 + now) * 8, y + Math.cos(i * 1.9 + now) * 6, 1.6, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'armored_growth': {
      const frac = wp.hp / wp.maxHp;
      ctx.fillStyle = rgba('160, 145, 105', 0.95 * dim);
      hexPath(ctx, x, y, 15);
      ctx.fill();
      ctx.strokeStyle = rgba('40, 30, 24', 0.9 * dim);
      ctx.lineWidth = 1.4;
      hexPath(ctx, x, y, 15);
      ctx.stroke();
      if (frac < 0.7) crack(ctx, x, y, 1, dim);
      if (frac < 0.4) crack(ctx, x, y, 2, dim);
      break;
    }
    case 'shield_generator': {
      ctx.strokeStyle = rgba(glo, 0.85 * dim);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 12, now, now + TAU * 0.7);
      ctx.stroke();
      ctx.fillStyle = rgba(body, 0.9 * dim);
      ctx.beginPath();
      ctx.arc(x, y, 6.5, 0, TAU);
      ctx.fill();
      break;
    }
    case 'nerve_bundle': {
      ctx.strokeStyle = rgba(glo, 0.7 * dim);
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + Math.sin(now + i) * 0.2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14);
        ctx.stroke();
      }
      ctx.fillStyle = rgba('235, 230, 240', 0.9 * dim);
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, TAU);
      ctx.fill();
      break;
    }
    case 'regen_organ': {
      ctx.strokeStyle = rgba(glo, 0.8 * dim);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let a = 0; a < TAU * 1.8; a += 0.25) {
        const r = 3 + a * 2.1;
        const px = x + Math.cos(a + now) * r;
        const py = y + Math.sin(a + now) * r * 0.8;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      break;
    }
    case 'spore_cluster': {
      ctx.fillStyle = rgba(body, 0.85 * dim);
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba(glo, 0.85 * dim);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + now * 0.6;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * (8 + Math.sin(now * 2 + i) * 2), y + Math.sin(a) * 7, 2.2, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'energy_core': {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(now * 1.2);
      ctx.fillStyle = rgba(glo, 0.9 * dim);
      ctx.fillRect(-9, -9, 18, 18);
      ctx.restore();
      glow(ctx, x, y, 12 * beat, rgba('255, 255, 255', 0.45 * dim));
      break;
    }
    case 'mutation_node': {
      ctx.fillStyle = rgba(body, 0.9 * dim);
      ctx.beginPath();
      ctx.moveTo(x, y - 13 * beat);
      ctx.lineTo(x + 12 * beat, y + 9 * beat);
      ctx.lineTo(x - 12 * beat, y + 9 * beat);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(glo, 0.85 * dim);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      break;
    }
  }
}

function hexPath(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU - Math.PI / 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function crack(ctx: Ctx, x: number, y: number, seed: number, dim: number): void {
  ctx.strokeStyle = rgba('20, 14, 10', 0.85 * dim);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - 8 + seed * 3, y - 9);
  ctx.lineTo(x - 2 + seed * 2, y - 1 + seed);
  ctx.lineTo(x + 5 - seed * 4, y + 8);
  ctx.stroke();
}

// ── Raid-fire tracers ────────────────────────────────────────────────────────
export function drawMegaShots(ctx: Ctx, rs: RenderState): void {
  for (const s of rs.megaShots) {
    const a = Math.max(0, s.life / 0.14);
    ctx.strokeStyle = rgba(hexRgb(s.color), 0.55 * a);
    ctx.lineWidth = 2.2 * a;
    ctx.beginPath();
    ctx.moveTo(s.x0, s.y0);
    ctx.lineTo(s.x1, s.y1);
    ctx.stroke();
  }
}

// ── Screen-space presence (over everything) ──────────────────────────────────
export function drawMegaVignette(ctx: Ctx, v: MegaView, now: number): void {
  const glo = hexRgb(v.palette.glow);
  const collapse = collapseOf(v);
  // Ambient dread: an edge tint that deepens with phase, floods on exposure, guts in death.
  let a = 0.045 + v.phase * 0.02 + (v.exposed ? 0.05 : 0) + (v.telegraph ? v.telegraph.frac * 0.03 : 0);
  if (collapse > 0) a = 0.12 * (1 - collapse) + collapse * 0.05;
  const g = ctx.createRadialGradient(WIDTH / 2, HEIGHT * 0.45, HEIGHT * 0.3, WIDTH / 2, HEIGHT * 0.45, HEIGHT * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, rgba(glo, Math.min(0.2, a)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // Telegraph warning band: the top of the frame — where the organism lives — heats up
  // across the windup, hammering "look UP now" without blocking the field.
  if (v.telegraph && collapse === 0) {
    const f = v.telegraph.frac;
    const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT * 0.14);
    bg.addColorStop(0, rgba(glo, 0.14 * f + pulse(now, 0.36, 0, 0.05 * f)));
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT * 0.14);
  }
  // Death flash: one white gasp at the moment of collapse, then the light drains.
  if (collapse > 0 && collapse < 0.18) {
    ctx.fillStyle = `rgba(255, 250, 240, ${(0.18 - collapse) * 2.2})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  // A slow heartbeat of the whole frame while the organism lives (subliminal presence).
  if (collapse === 0) {
    ctx.fillStyle = rgba(glo, pulse(now, 2.8, 0, 0.02));
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
}
