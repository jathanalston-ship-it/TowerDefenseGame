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

import { WIDTH, HEIGHT, nucleusPoint } from '../core/map';
import { hexRgb, rgba } from './theme';
import { themedMegaColor } from './wardrobeFx';
import { viewFeel } from './feel';
import type { RenderState } from '../core/game';
import { MEGA, megaBossDef } from '../core/megaboss';
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

/** §dormancy burrow factor (smoothstepped): 0 surfaced → 1 buried. Death overrides — a
 *  collapsing organism never recedes mid-ceremony. */
function burrowOf(v: MegaView): number {
  if (v.deathT > 0) return 0;
  const b = Math.min(1, Math.max(0, v.burrow));
  return b * b * (3 - 2 * b);
}

/** §dormancy buried pose: the mass is gone — a low breathing ridge-line remains, soil seams
 *  leaking its glow, with a slow periodic tremor ("the tremor between waves is its patience
 *  running out"). Draws UNDER the receding body so the transition crossfades naturally. */
function drawBurrowMound(ctx: Ctx, v: MegaView, now: number, bur: number): void {
  const body = hexRgb(themedMegaColor(v.palette.body));
  const glo = hexRgb(themedMegaColor(v.palette.glow));
  const acc = hexRgb(themedMegaColor(v.palette.accent));
  const breathe = 1 + Math.sin(now * 0.55) * 0.06; // slow, buried breathing
  const yb = 40 + 12 * breathe;
  ctx.save();
  ctx.globalAlpha = bur;
  ctx.fillStyle = rgba(body, 0.55);
  ctx.beginPath();
  ctx.moveTo(-90, -40);
  ctx.lineTo(-90, yb);
  const lobes = 7;
  for (let i = 0; i <= lobes; i++) {
    const x = -90 + ((WIDTH + 180) / lobes) * i;
    const y = yb + Math.sin(i * 2.3 + now * 0.25) * 6 * breathe;
    const px = -90 + ((WIDTH + 180) / lobes) * (i - 0.5);
    ctx.quadraticCurveTo(px, y + 14, x, y);
  }
  ctx.lineTo(WIDTH + 90, -40);
  ctx.closePath();
  ctx.fill();
  // Soil seams: cracks where its light leaks through — buried, not gone.
  for (let i = 0; i < 4; i++) {
    const sx = WIDTH * (0.16 + i * 0.22) + Math.sin(i * 5.1) * 30;
    const p = pulse(now, 3.2 + i * 0.7, 0.2, 0.8);
    glow(ctx, sx, yb - 4, 24 + p * 14, rgba(glo, 0.08 + p * 0.09));
  }
  // Per-motif dormant signature (§dormancy identity): the SAME anatomy drawMotif animates
  // awake, in a sleeping register — so seven buried megas never read as one grey mound.
  drawDormantMotif(ctx, v, now, yb, body, glo, acc);
  // The tremor: a brief ground-line shiver every few seconds.
  const trem = Math.max(0, Math.sin(now * 0.9)) ** 12;
  if (trem > 0.01) {
    ctx.strokeStyle = rgba(glo, 0.3 * trem);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-90, yb + 9 + trem * 3);
    ctx.lineTo(WIDTH + 90, yb + 9 - trem * 3);
    ctx.stroke();
  }
  ctx.restore();
}

/** The buried pose's identity layer — one quiet signature per motif, echoing the awake
 *  anatomy (drawMotif) so the mound is unmistakably THIS organism. Runs inside
 *  drawBurrowMound's save block (globalAlpha already carries the burrow fade); everything
 *  here is slow and small: an organism asleep, not a fight. A new motif earns a case here
 *  alongside its drawMotif case — or falls back to the plain mound until it does. */
function drawDormantMotif(ctx: Ctx, v: MegaView, now: number, yb: number, body: string, glo: string, acc: string): void {
  const cx = WIDTH * 0.5;
  switch (v.motif) {
    case 'maw': {
      // Tusk TIPS breach the soil along the mound — the jaw at rest just under the surface,
      // grinding sideways almost imperceptibly.
      const grind = Math.sin(now * 0.22) * 3;
      ctx.fillStyle = rgba(acc, 0.75);
      for (let i = 0; i < 7; i++) {
        const x = WIDTH * (0.14 + 0.12 * i) + Math.sin(i * 2.6) * 8 + grind;
        const h = 8 + (i % 3) * 4;
        const y = yb + 2 + Math.sin(i * 2.1) * 3;
        ctx.beginPath();
        ctx.moveTo(x - 4, y);
        ctx.quadraticCurveTo(x, y - h * 0.5, x + (i % 2 === 0 ? 2 : -2), y - h);
        ctx.lineTo(x + 4, y);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'choir': {
      // Distant spire tips above the ridge, each wearing a tiny bell glint — the cathedral
      // sleeps but the hour still tolls, faintly.
      for (let i = 0; i < 3; i++) {
        const sx = WIDTH * (0.22 + 0.28 * i);
        const h = 26 + (i % 2) * 12;
        ctx.strokeStyle = rgba(body, 0.75);
        ctx.lineWidth = 3 - i * 0.5;
        ctx.beginPath();
        ctx.moveTo(sx, yb + 4);
        ctx.lineTo(sx + Math.sin(i * 2.1) * 3, yb - h);
        ctx.stroke();
        const toll = 0.35 + 0.3 * Math.sin(now * 0.8 + i * 2.1);
        drawDot(ctx, sx + Math.sin(i * 2.1) * 3, yb - h - 3, 2.4, rgba(glo, toll));
      }
      break;
    }
    case 'shepherd': {
      // One pale crook crests the mound, bone chimes hanging still-but-for-the-wind.
      const rx = cx + WIDTH * 0.18;
      ctx.strokeStyle = rgba(acc, 0.7);
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(rx, yb + 6);
      ctx.quadraticCurveTo(rx + 5, yb - 34, rx + 26, yb - 40);
      ctx.quadraticCurveTo(rx + 45, yb - 43, rx + 40, yb - 26);
      ctx.stroke();
      const sway = Math.sin(now * 0.5) * 4;
      ctx.strokeStyle = rgba(acc, 0.45);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(rx + 38, yb - 27);
      ctx.lineTo(rx + 38 + sway, yb - 6);
      ctx.stroke();
      for (let b = 1; b <= 2; b++) drawDot(ctx, rx + 38 + sway * (b / 2), yb - 27 + b * 10, 2, rgba(acc, 0.75));
      break;
    }
    case 'tide': {
      // The medusa bell rides LOW over the mound, translucent, streamer tips trailing into
      // the soil — and a slow tide-ring breathes outward on its own unhurried clock.
      ctx.fillStyle = rgba(glo, 0.07);
      ctx.beginPath();
      ctx.ellipse(cx, yb - 6, WIDTH * 0.18, 20, 0, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = rgba(glo, 0.3);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(cx, yb - 6, WIDTH * 0.18, 20, 0, Math.PI, 0);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const sx = cx + (i - 1) * WIDTH * 0.1;
        const drift = Math.sin(now * 0.35 + i * 1.7) * 8;
        ctx.strokeStyle = rgba(glo, 0.22);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(sx, yb - 6);
        ctx.quadraticCurveTo(sx + drift, yb + 4, sx + drift * 0.5, yb + 12);
        ctx.stroke();
      }
      const tide = (now * 0.18) % 1;
      ctx.strokeStyle = rgba(glo, (1 - tide) * 0.18);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(cx, yb - 4, WIDTH * (0.06 + tide * 0.3), 6 + tide * 14, 0, Math.PI, 0);
      ctx.stroke();
      break;
    }
    case 'tithe': {
      // Gilded scale-plates half-sunk along the mound line, and one golden bead sinking
      // into a seam — the ledger never fully closes.
      ctx.fillStyle = rgba(acc, 0.6);
      for (let i = 0; i < 6; i++) {
        const x = WIDTH * (0.2 + 0.12 * i);
        const y = yb + 1 + Math.sin(i * 1.9) * 3;
        ctx.beginPath();
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x + 5, y);
        ctx.lineTo(x, y + 3);
        ctx.lineTo(x - 5, y);
        ctx.closePath();
        ctx.fill();
      }
      const f = (now * 0.22) % 1;
      drawDot(ctx, WIDTH * 0.38, yb - 14 + f * 16, 2, rgba(glo, (1 - f) * 0.6));
      break;
    }
    case 'gorge': {
      // A half-buried gullet bulge still swallowing on a slow cycle, pale tooth-tips beside
      // it — the larder is DOWN there, and the meal continues.
      const gulp = Math.max(0, Math.sin(now * 0.3)) ** 3;
      ctx.fillStyle = rgba(body, 0.8);
      ctx.beginPath();
      ctx.ellipse(cx + Math.sin(now * 0.3) * 10, yb - 4 - gulp * 5, 26 + gulp * 8, 10 + gulp * 4, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = rgba('230, 224, 210', 0.7);
      for (let i = 0; i < 5; i++) {
        const tx = cx - 44 + 88 * (i / 4) + (i % 2 === 0 ? -34 : 34);
        ctx.beginPath();
        ctx.moveTo(tx - 3, yb + 2);
        ctx.lineTo(tx, yb - 5 - (i % 2) * 2);
        ctx.lineTo(tx + 3, yb + 2);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'myriad': {
      // Three lesser eyes at the soil line, lids heavy — one drifts open now and then to
      // study the field, then closes. It remembers even in its sleep.
      for (let i = 0; i < 3; i++) {
        const ex = WIDTH * (0.24 + 0.26 * i);
        const watch = Math.max(0, Math.sin(now * 0.28 + i * 2.6)) ** 6; // rare slow opens
        const open = 0.15 + watch * 0.85;
        const r = 4.5 + (i % 2);
        ctx.fillStyle = rgba('12, 8, 10', 0.8);
        ctx.beginPath();
        ctx.ellipse(ex, yb - 2, r * 1.5, r * open, 0, 0, TAU);
        ctx.fill();
        drawDot(ctx, ex, yb - 2, r * 0.5 * open, rgba(glo, 0.5 + watch * 0.4));
      }
      break;
    }
  }
}

// ── Render-side one-shots (module state, render-only): the CAST flash fires the frame a
//    telegraph resolves into its strike, and each weak point's RUPTURE burst fires on its
//    open→destroyed edge. One mega exists at a time, so plain module scope is safe — and
//    stale entries simply draw nothing on the next encounter.
let lastTele = false;
let lastTeleKind: string | null = null; // what was winding up — a resolved CATACLYSM flashes harder
let castFlashT = -10; // renderer-now when the last telegraph resolved
let castFlashBig = false; // the resolved cast was a cataclysm
let staggerEase = 0; // smoothed 0..1 slump into/out of the STAGGERED posture (cosmetic lerp)
const wpPrevState = new Map<number, MegaWeakPoint['state']>(); // spec → last-frame state
const wpRuptureT = new Map<number, number>(); // spec → renderer-now of the rupture
let prevLashWf = 0; // last-frame HIVE LASH windup (completion edge → strike afterimage)
let lashFlashT = -10; // renderer-now of the last landed lash

// ── The body (under entities) ────────────────────────────────────────────────
export function drawMegaBody(ctx: Ctx, v: MegaView, now: number): void {
  // Wardrobe Mega Boss variant (docs/COSMETICS.md §wardrobe): re-veins the palette; the
  // silhouette/behavior presentation is untouched (identity preserved, dress swapped).
  const body = hexRgb(themedMegaColor(v.palette.body));
  const glo = hexRgb(themedMegaColor(v.palette.glow));
  const acc = hexRgb(themedMegaColor(v.palette.accent));
  const tier = v.visualTier;
  const collapse = collapseOf(v);
  const dead = collapse > 0;
  // STAGGER slump (§stagger): the whole mass drops and hangs while toppled — a smoothed
  // render-side ease so the fall and the recovery both read as weight, not a snap.
  staggerEase += ((v.staggered && !dead ? 1 : 0) - staggerEase) * 0.07;
  if (staggerEase < 0.005) staggerEase = 0;
  // Breathing: a slow whole-mass swell; guttering/erratic through the death sequence.
  const breathe = dead ? 1 + Math.sin(now * 14) * 0.01 * (1 - collapse) : 1 + Math.sin(now * 0.9) * (0.018 + tier * 0.004);
  const sag = collapse * 60 + staggerEase * 26; // the mass slumps as it dies (and when TOPPLED)
  const baseY = (v.anchorY + 90) * breathe + sag; // the ridge's lower edge center line
  // §dormancy: between waves the whole mass RECEDES up into the ridge (burrow 0→1) while the
  // mound below crossfades in; fully buried draws only the mound (cheap, and reads "waiting").
  const bur = burrowOf(v);
  if (bur > 0) drawBurrowMound(ctx, v, now, bur);
  if (bur >= 0.999) return;
  const alpha = (dead ? 1 - collapse * 0.55 : 1) * (1 - bur);

  ctx.save();
  ctx.globalAlpha = alpha;
  if (bur > 0) ctx.translate(0, -bur * (v.anchorY + 200)); // sink behind the ridge line

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

  // Per-def ANATOMY MOTIF (§visual overhaul): the silhouette suite that keeps seven megas from
  // reading as palette swaps — jaws, bells, crooks, streamers, scales, gullets, extra eyes.
  drawMotif(ctx, v, now, baseY, breathe, alpha, body, glo, acc);

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
    // LONE SIEGE (docs/MEGA-BOSS.md §lone siege): the mass DRAPES — long feeler curtains sink
    // toward the build rows (the descended body the raid chips at), swaying hungrily. Body-chip
    // tracers terminate on this hanging flesh, and the whole silhouette says it is HERE now.
    if (v.siege !== null) {
      ctx.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const h = Math.abs(Math.sin(i * 91.3 + 7.7) * 10403.9) % 1;
        const sx = (0.14 + h * 0.72) * WIDTH;
        const len = 300 + h * 260 + Math.sin(now * 0.5 + i * 1.9) * 24;
        const sway = Math.sin(now * 0.7 + i * 2.3) * (18 + h * 14);
        ctx.strokeStyle = rgba(body, 0.75 * alpha);
        ctx.lineWidth = 5 + h * 4;
        ctx.beginPath();
        ctx.moveTo(sx, baseY - 8);
        ctx.bezierCurveTo(sx - sway * 0.4, baseY + len * 0.4, sx + sway, baseY + len * 0.75, sx + sway * 0.5, baseY + len);
        ctx.stroke();
        glow(ctx, sx + sway * 0.5, baseY + len, 7, rgba(glo, 0.3 * alpha)); // the feeler tip the raid bites at
      }
      ctx.lineCap = 'butt';
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

  // THE EYE — tracking iris; blinks; dilates and locks bright during a telegraph; rolls back
  // and half-lids while the organism is TOPPLED.
  const eyeX = WIDTH * 0.5 + Math.sin(now * 0.23) * 40;
  const eyeY = v.anchorY + 26 + Math.sin(now * 0.31) * 8 + sag;
  const blink = dead ? collapse : Math.max(0, Math.sin(now * 0.47) > 0.985 ? 1 : 0);
  const eyeOpen = (1 - blink * 0.9) * (1 - staggerEase * 0.65);
  const tele = v.telegraph;
  // The windup just resolved — the strike lands NOW. A vanished telegraph with stun on it was
  // an eye INTERRUPT or a stagger (the player's wins) — those edges must not flash like a cast.
  if (lastTele && !tele && !dead && v.stunned <= 0) { castFlashT = now; castFlashBig = lastTeleKind === 'cataclysm'; }
  lastTele = !!tele && !dead;
  if (tele) lastTeleKind = tele.kind;
  const irisR = (7 + (tele ? 4 * tele.frac : 0)) * eyeOpen;
  ctx.fillStyle = rgba('12, 8, 10', alpha * 0.9);
  ctx.beginPath();
  ctx.ellipse(eyeX, eyeY, 26, 15 * eyeOpen, 0, 0, TAU);
  ctx.fill();
  const lookX = tele ? 0 : Math.sin(now * 0.6) * 9;
  const lookY = (tele ? 4 : Math.cos(now * 0.43) * 4) - staggerEase * 7; // rolled back while toppled
  glow(ctx, eyeX + lookX, eyeY + lookY, irisR * 2.4, rgba(glo, (tele ? 0.9 : 0.55) * eyeOpen * alpha));
  ctx.fillStyle = rgba(glo, alpha * eyeOpen);
  ctx.beginPath();
  ctx.arc(eyeX + lookX, eyeY + lookY, irisR, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rgba('8, 4, 6', alpha * eyeOpen);
  ctx.beginPath();
  ctx.arc(eyeX + lookX, eyeY + lookY, irisR * 0.45, 0, TAU);
  ctx.fill();

  // THE MAW — center underside; cycles open; gapes during a telegraph; slack in death and
  // hanging slack-jawed while TOPPLED (drool strands below).
  const mawX = WIDTH * 0.5;
  const mawY = baseY + 6;
  let gape = dead ? 0.9 : tele ? 0.45 + 0.45 * tele.frac : 0.18 + pulse(now, 3.4) * 0.16;
  if (staggerEase > 0) gape = Math.max(gape, staggerEase * 0.8);
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

  // Toppled drool — the slack jaw weeps while the raid pours damage in.
  if (staggerEase > 0.3 && !dead) {
    ctx.strokeStyle = rgba(glo, 0.35 * staggerEase);
    ctx.lineWidth = 1.4;
    for (let i = -1; i <= 1; i += 2) {
      const dx0 = mawX + i * 22;
      ctx.beginPath();
      ctx.moveTo(dx0, mawY + 20 * gape);
      ctx.quadraticCurveTo(dx0 + i * 3, mawY + 44, dx0 + Math.sin(now * 1.8 + i) * 4, mawY + 58 + Math.sin(now * 2.6) * 5);
      ctx.stroke();
    }
  }
  // Telegraph GATHER: motes of power stream INTO the gaping maw across the windup — the
  // counterplay window is legible from body language alone, before any UI timer. A CATACLYSM
  // gathers HARDER: more motes, hotter color, and a white-hot core swelling in the throat.
  const cata = tele !== null && tele.kind === 'cataclysm';
  if (tele && !dead) {
    const n = cata ? 22 : 12;
    const hot = cata ? hexRgb('#ff6a5a') : glo;
    for (let i = 0; i < n; i++) {
      const h = Math.abs(Math.sin(i * 91.7 + 7.3) * 10000) % 1;
      const f = (now * ((cata ? 1.3 : 0.9) + h * 0.7) + h) % 1; // 0 = born far out → 1 = swallowed
      const a2 = h * TAU + i * 0.7;
      const d = (46 + h * 110) * (1 - f);
      ctx.fillStyle = rgba(hot, (0.2 + 0.6 * f) * tele.frac * alpha);
      ctx.beginPath();
      ctx.arc(mawX + Math.cos(a2) * d, mawY + Math.sin(a2) * d * 0.5, 1.2 + h * 1.8, 0, TAU);
      ctx.fill();
    }
    if (cata) {
      const f = tele.frac;
      glow(ctx, mawX, mawY, 30 + 60 * f, rgba(glo, 0.35 + 0.3 * f));
      ctx.fillStyle = `rgba(255, 246, 230, ${0.25 + 0.6 * f})`;
      ctx.beginPath();
      ctx.ellipse(mawX, mawY, 10 + 26 * f, (10 + 26 * f) * 0.55, 0, 0, TAU);
      ctx.fill();
    }
  }
  // CAST shock: the frame the telegraph resolves, a ground-plane ring slams out of the maw —
  // a resolved CATACLYSM slams a far bigger one (the finale you failed to interrupt).
  const castAge = now - castFlashT;
  if (castAge >= 0 && castAge < 0.5 && !dead) {
    const f = castAge / 0.5;
    const R = castFlashBig ? 1.7 : 1;
    ctx.strokeStyle = rgba(glo, (1 - f) * 0.7 * alpha);
    ctx.lineWidth = 1 + (1 - f) * (castFlashBig ? 5 : 3);
    ctx.beginPath();
    ctx.ellipse(mawX, mawY, (24 + f * 170) * R, (24 + f * 170) * R * 0.42, 0, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,250,240,${(1 - f) * 0.5})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(mawX, mawY, (12 + f * 120) * R, (12 + f * 120) * R * 0.42, 0, 0, TAU);
    ctx.stroke();
  }

  // Exposure flood (heart window): the whole mass runs hot — commit NOW.
  if (v.exposed && !dead) {
    ctx.fillStyle = rgba(glo, 0.1 + pulse(now, 0.5) * 0.08);
    ctx.fillRect(-90, -40, WIDTH + 180, baseY + 40);
  }
  // Stagger flood: the toppled mass runs GOLD — the raid's damage window, painted on the body.
  if (staggerEase > 0.05 && !dead) {
    ctx.fillStyle = rgba('255, 210, 77', (0.05 + pulse(now, 0.6) * 0.03) * staggerEase);
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

// ── Per-def anatomy motifs (§visual overhaul) ────────────────────────────────
/** The silhouette suite keyed by MegaBossDef.motif — one small procedural anatomy layer per
 *  identity, drawn over the front ridge. Deterministic in `now`; a new mega picks a motif in
 *  its def (or earns a new case here) and the rest of its presentation stays free. */
function drawMotif(
  ctx: Ctx,
  v: MegaView,
  now: number,
  baseY: number,
  breathe: number,
  alpha: number,
  body: string,
  glo: string,
  acc: string,
): void {
  const cx = WIDTH * 0.5;
  switch (v.motif) {
    case 'maw': {
      // A second rank of tusks along the lobe line — the ridge IS a jaw.
      ctx.fillStyle = rgba(acc, alpha * 0.85);
      for (let i = 0; i < 7; i++) {
        const x = WIDTH * (0.14 + 0.12 * i) + Math.sin(i * 2.6) * 8;
        const h = (14 + (i % 3) * 8) * breathe;
        const y = baseY - 4 + Math.sin(i * 2.1 + now * 0.45) * 6;
        ctx.beginPath();
        ctx.moveTo(x - 5, y);
        ctx.quadraticCurveTo(x, y + h * 0.4, x + (i % 2 === 0 ? 3 : -3), y + h);
        ctx.lineTo(x + 5, y);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'choir': {
      // Hanging bell-organs on cords, swinging out of phase — the song made anatomy.
      for (let i = 0; i < 4; i++) {
        const bx = WIDTH * (0.2 + 0.2 * i);
        const sway = Math.sin(now * 0.7 + i * 1.9) * 10;
        const by = baseY + 26 + (i % 2) * 10;
        ctx.strokeStyle = rgba(body, alpha * 0.8);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx, baseY - 8);
        ctx.quadraticCurveTo(bx + sway * 0.4, baseY + 8, bx + sway, by);
        ctx.stroke();
        ctx.fillStyle = rgba(body, alpha * 0.9);
        ctx.beginPath();
        ctx.arc(bx + sway, by, 9, Math.PI, 0);
        ctx.lineTo(bx + sway + 9, by + 7);
        ctx.lineTo(bx + sway - 9, by + 7);
        ctx.closePath();
        ctx.fill();
        drawDot(ctx, bx + sway + Math.sin(now * 2.2 + i) * 3, by + 8, 2, rgba(glo, alpha * (0.5 + 0.3 * Math.sin(now * 2.2 + i)))); // the clapper tolls
      }
      break;
    }
    case 'shepherd': {
      // Two bone crooks cresting the ridge + chime strands that sway with the flock's walk.
      ctx.strokeStyle = rgba(acc, alpha * 0.75);
      ctx.lineWidth = 4;
      for (let s = -1; s <= 1; s += 2) {
        const rx = cx + s * WIDTH * 0.24;
        ctx.beginPath();
        ctx.moveTo(rx, baseY - 10);
        ctx.quadraticCurveTo(rx + s * 6, v.anchorY - 26, rx + s * 30, v.anchorY - 34);
        ctx.quadraticCurveTo(rx + s * 52, v.anchorY - 38, rx + s * 46, v.anchorY - 16);
        ctx.stroke();
      }
      for (let i = 0; i < 3; i++) {
        const bx = WIDTH * (0.3 + 0.2 * i);
        const sway = Math.sin(now * 0.9 + i * 2.2) * 7;
        ctx.strokeStyle = rgba(acc, alpha * 0.5);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(bx, baseY - 6);
        ctx.lineTo(bx + sway, baseY + 24);
        ctx.stroke();
        for (let b = 1; b <= 2; b++) drawDot(ctx, bx + sway * (b / 2), baseY - 6 + b * 12, 2.2, rgba(acc, alpha * 0.8)); // bone chimes
      }
      break;
    }
    case 'tide': {
      // A translucent medusa bell over the anchor + streamers drifting on a current.
      ctx.fillStyle = rgba(glo, alpha * 0.1);
      ctx.beginPath();
      ctx.ellipse(cx, v.anchorY - 10, WIDTH * 0.3, 46 * breathe, 0, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = rgba(glo, alpha * 0.35);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(cx, v.anchorY - 10, WIDTH * 0.3, 46 * breathe, 0, Math.PI, 0);
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const sx = WIDTH * (0.25 + 0.17 * i);
        const drift = Math.sin(now * 0.5 + i * 1.7) * 18;
        ctx.strokeStyle = rgba(glo, alpha * 0.28);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(sx, baseY - 12);
        ctx.bezierCurveTo(sx + drift, baseY + 30, sx - drift * 0.6, baseY + 62, sx + drift * 1.4, baseY + 92);
        ctx.stroke();
      }
      break;
    }
    case 'tithe': {
      // Gilded scale-plates along the ridge + a slow rain of golden beads — wealth as armor.
      ctx.fillStyle = rgba(acc, alpha * 0.7);
      for (let i = 0; i < 9; i++) {
        const x = WIDTH * (0.1 + 0.1 * i);
        const y = baseY - 20 + Math.sin(i * 1.9 + now * 0.4) * 5;
        ctx.beginPath();
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x + 6, y);
        ctx.lineTo(x, y + 6);
        ctx.lineTo(x - 6, y);
        ctx.closePath();
        ctx.fill();
      }
      for (let i = 0; i < 3; i++) {
        const h = Math.abs(Math.sin(i * 57.3 + 11.1) * 7919) % 1;
        const f = (now * (0.25 + h * 0.2) + h) % 1;
        drawDot(ctx, WIDTH * (0.22 + h * 0.56), baseY + f * 90, 2, rgba(glo, alpha * (1 - f) * 0.7));
      }
      break;
    }
    case 'gorge': {
      // A stacked SECOND jaw beneath the maw + a gullet bulge that swallows on a slow cycle.
      const gulp = Math.max(0, Math.sin(now * 0.55)) ** 3; // the swallow travels
      ctx.fillStyle = rgba(body, alpha * 0.9);
      ctx.beginPath();
      ctx.ellipse(cx, baseY + 34, 46, 14, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba('230, 224, 210', alpha * 0.8);
      for (let i = 0; i < 7; i++) {
        const tx = cx - 38 + (76 / 6) * i;
        ctx.beginPath();
        ctx.moveTo(tx - 3, baseY + 28);
        ctx.lineTo(tx, baseY + 36 + (i % 2) * 3);
        ctx.lineTo(tx + 3, baseY + 28);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = rgba(body, alpha * 0.85);
      ctx.beginPath();
      ctx.ellipse(cx + Math.sin(now * 0.55) * 20, baseY - 34 - gulp * 10, 34 + gulp * 12, 18 + gulp * 8, 0, 0, TAU);
      ctx.fill(); // the gullet bulge — something is always going down
      break;
    }
    case 'myriad': {
      // A scatter of lesser eyes across the ridge — all tracking, blinking out of sync — over
      // faint mirror-facet streaks. It is looking at everything you own.
      ctx.strokeStyle = rgba(acc, alpha * 0.16);
      ctx.lineWidth = 10;
      for (let i = 0; i < 3; i++) {
        const fx = WIDTH * (0.2 + 0.28 * i);
        ctx.beginPath();
        ctx.moveTo(fx - 26, baseY - 66);
        ctx.lineTo(fx + 26, baseY - 18);
        ctx.stroke();
      }
      for (let i = 0; i < 7; i++) {
        const h = Math.abs(Math.sin(i * 37.7 + 5.3) * 6151) % 1;
        const ex = WIDTH * (0.12 + 0.76 * h);
        const ey = baseY - 26 - (Math.abs(Math.sin(i * 71.3) * 911) % 1) * 42;
        const open = Math.sin(now * (0.6 + h * 0.5) + i * 2.4) > -0.75 ? 1 : 0.15; // independent blinks
        const r = 4 + h * 3.5;
        ctx.fillStyle = rgba('12, 8, 10', alpha * 0.85);
        ctx.beginPath();
        ctx.ellipse(ex, ey, r * 1.5, r * open, 0, 0, TAU);
        ctx.fill();
        drawDot(ctx, ex + Math.sin(now * 0.6) * r * 0.5, ey, r * 0.55 * open, rgba(glo, alpha * 0.9));
      }
      break;
    }
  }
}

function drawDot(ctx: Ctx, x: number, y: number, r: number, style: string): void {
  ctx.fillStyle = style;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, TAU);
  ctx.fill();
}

// ── Weak-point organs (over enemies) ─────────────────────────────────────────
export function drawMegaOrgans(ctx: Ctx, v: MegaView, now: number): void {
  const glo = hexRgb(v.palette.glow);
  const body = hexRgb(v.palette.body);
  const collapse = collapseOf(v);
  if (collapse >= 1) return;
  // §dormancy: organs (and the siege arm) retract with the receding mass — fully buried
  // draws nothing; partial burrow rides the same upward slide + fade as the body.
  const bur = burrowOf(v);
  if (bur >= 0.999) return;
  ctx.save();
  if (bur > 0) {
    ctx.translate(0, -bur * (v.anchorY + 200));
    ctx.globalAlpha = 1 - bur;
  }
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
      // STAGGERED urgency: windows are frozen — every open organ burns gold, begging for it.
      if (v.staggered) {
        ctx.strokeStyle = rgba('255, 210, 77', 0.45 + pulse(now, 0.3) * 0.4);
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(ox, oy, ringR + 6, 0, TAU);
        ctx.stroke();
      }
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

  // ── LONE SIEGE — the reaching arm (docs/MEGA-BOSS.md §lone siege) ──
  // While the organism sieges, a lash arm hangs coiled beneath the maw; across a HIVE LASH
  // windup it EXTENDS toward the Nucleus with a rising charge (the interrupt read), and the
  // frame a windup completes it snaps through as a strike afterimage. Interrupted windups
  // (the charge dropping mid-way) simply retract — no strike.
  if (v.siege !== null) {
    const wf = v.siege.windupFrac;
    if (prevLashWf > 0.93 && wf === 0) lashFlashT = now; // completion edge — the strike frame
    prevLashWf = wf;
    const flash = Math.max(0, 1 - (now - lashFlashT) / 0.24);
    const x0 = WIDTH / 2;
    const y0 = rootY + 12;
    const nx = nucleusPoint.x;
    const ny = nucleusPoint.y - 26;
    if (wf > 0 || flash > 0) {
      const ext = flash > 0 ? 1 : 0.12 + 0.78 * wf; // holds just short of the Core until it lands
      const tx = x0 + (nx - x0) * ext;
      const ty = y0 + (ny - y0) * ext;
      const midX = (x0 + tx) / 2 + Math.sin(now * 7) * 18 * wf * (1 - flash);
      const midY = (y0 + ty) / 2 - 30;
      const w = 7 + wf * 5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(body, 0.9);
      ctx.lineWidth = w + flash * 3;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(midX, midY, tx, ty);
      ctx.stroke();
      ctx.strokeStyle = rgba(glo, 0.35 + wf * 0.5 + flash * 0.4);
      ctx.lineWidth = Math.max(1.6, w * 0.4);
      ctx.stroke();
      ctx.lineCap = 'butt';
      // The claw tip: a charge bulb burning hotter as the strike closes in.
      glow(ctx, tx, ty, 10 + wf * 16 + flash * 18, rgba(glo, 0.45 + wf * 0.4 + flash * 0.4));
      // Imminent warning: the Nucleus itself rings once the windup passes 70%.
      if (wf > 0.7) {
        ctx.strokeStyle = rgba('255, 93, 115', ((wf - 0.7) / 0.3) * (0.45 + pulse(now, 0.24, 0, 0.3)));
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(nucleusPoint.x, nucleusPoint.y, 30 + pulse(now, 0.24) * 6, 0, TAU);
        ctx.stroke();
      }
    } else {
      // Between windups: the arm coils under the maw, writhing — the threat never leaves.
      ctx.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1;
        const sway = Math.sin(now * 1.4 + i * 2.1) * 7;
        ctx.strokeStyle = rgba(body, 0.8);
        ctx.lineWidth = 6 - i * 2;
        ctx.beginPath();
        ctx.moveTo(x0 + side * 10, y0 - 6);
        ctx.quadraticCurveTo(x0 + side * (22 + sway), y0 + 22, x0 + side * (10 + sway * 0.6), y0 + 44 + Math.sin(now * 1.1 + i) * 5);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      glow(ctx, x0, y0 + 18, 12, rgba(glo, 0.2 + pulse(now, 1.6, 0, 0.15)));
    }
  }
  ctx.restore(); // §dormancy wrapper
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
    const a = Math.min(1, Math.max(0, s.life / 0.14));
    const c = hexRgb(s.color);
    // A soft energy sheath under a hot core — raid fire reads as ARTILLERY, not a hairline.
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(c, 0.22 * a);
    ctx.lineWidth = 7 * a;
    ctx.beginPath();
    ctx.moveTo(s.x0, s.y0);
    ctx.lineTo(s.x1, s.y1);
    ctx.stroke();
    ctx.strokeStyle = rgba(c, 0.85 * a);
    ctx.lineWidth = 2.6 * a;
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * a})`;
    ctx.lineWidth = a;
    ctx.stroke();
    ctx.lineCap = 'butt';
    // Impact tick at the far end — the hit visibly LANDS on the organ / body / Nucleus.
    ctx.fillStyle = rgba(c, 0.7 * a);
    ctx.beginPath();
    ctx.arc(s.x1, s.y1, 2.5 + 2 * a, 0, TAU);
    ctx.fill();
  }
}

// ── Screen-space presence (over everything) ──────────────────────────────────
export function drawMegaVignette(ctx: Ctx, v: MegaView, now: number): void {
  const glo = hexRgb(v.palette.glow);
  const collapse = collapseOf(v);
  // §dormancy: the buried organism's presence leaves the frame with it — only a faint
  // residue of the tint remains (the mound's seams carry "still here" on the field itself).
  const bur = burrowOf(v);
  // Ambient dread: an edge tint that deepens with phase, floods on exposure, guts in death.
  let a = 0.045 + v.phase * 0.02 + (v.exposed ? 0.05 : 0) + (v.telegraph ? v.telegraph.frac * 0.03 : 0);
  if (collapse > 0) a = 0.12 * (1 - collapse) + collapse * 0.05;
  a *= 1 - bur * 0.8;
  const g = ctx.createRadialGradient(WIDTH / 2, HEIGHT * 0.45, HEIGHT * 0.3, WIDTH / 2, HEIGHT * 0.45, HEIGHT * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, rgba(glo, Math.min(0.2, a)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // Telegraph warning band: the top of the frame — where the organism lives — heats up
  // across the windup, hammering "look UP now" without blocking the field. A CATACLYSM
  // windup burns RED, twice as deep, twice as fast — the one you cannot ignore.
  if (v.telegraph && collapse === 0 && bur < 0.5) { // a frozen mid-windup telegraph must not burn while buried
    const cata = v.telegraph.kind === 'cataclysm';
    const f = v.telegraph.frac;
    const col = cata ? hexRgb('#ff5d73') : glo;
    const depth = cata ? 0.2 : 0.14;
    const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT * depth);
    bg.addColorStop(0, rgba(col, (0.14 * f + pulse(now, cata ? 0.2 : 0.36, 0, 0.05 * f)) * (cata ? 1.8 : 1)));
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT * depth);
  }
  // Staggered: a thin gold edge-light frames the burst window (the field says NOW too).
  if (v.staggered && collapse === 0 && bur < 0.5) {
    ctx.strokeStyle = rgba('255, 210, 77', 0.25 + pulse(now, 0.5) * 0.2);
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, WIDTH - 3, HEIGHT - 3);
  }
  // Death flash: one white gasp at the moment of collapse, then the light drains.
  if (collapse > 0 && collapse < 0.18 && viewFeel.flashes) { // full-screen flash — Settings → Flashes / reduced motion
    ctx.fillStyle = `rgba(255, 250, 240, ${(0.18 - collapse) * 2.2})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  // A slow heartbeat of the whole frame while the organism lives (subliminal presence).
  // Buried, it beats slower and fainter — patience, not pressure.
  if (collapse === 0) {
    ctx.fillStyle = rgba(glo, pulse(now, bur >= 0.5 ? 4.6 : 2.8, 0, 0.02 * (1 - bur * 0.6)));
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
}

// ── POSE — one mega WITHOUT a live Game (docs/CUTSCENES.md §mega premieres) ──────────────────
// The premiere films paint the ACTUAL organism through this exact painter (drawMegaBody +
// drawMegaOrgans), posed from a few scalars instead of a sim snapshot. Board-space: the caller
// owns the transform. One cached rig per def (view + weak points + palette steps), mutated per
// frame — no per-frame allocation, and the live raid's own render state is never touched.

/** A film's hold on one mega. Every field 0..1. */
export interface MegaPose {
  reveal: number; // 0 = silhouette (the palette drowned in shadow) → 1 = full colour
  ignite: number; // the weak points open, in spec order, across 0 → 1
  gather: number; // the maw's windup — the eye dilates, power streams into the throat
  fall: number; // the death collapse — organs ruptured, the mass slumps and fades
  flare: number; // a beat's hit-flash on every open organ
}

/** The pose's look — data, not literals in the drawing path. */
export const MEGA_POSE = {
  silhouette: '#06080c', // the tone the palette resolves FROM during the reveal
  glowFloor: 0.3, // the eye/vein glow already shows this much in silhouette (a shape that WATCHES)
  steps: 16, // cached palette steps across the reveal (no per-frame colour math)
  descend: 0.34, // organs hang this fraction of their raid descent (the film frames body + organs)
  flareHit: 0.16, // hit-flash seconds a full beat flare maps to (drawOrgan glows min(0.7, hit × 4))
} as const;

interface PoseRig { view: MegaView; palettes: MegaView['palette'][]; tele: { kind: string; frac: number } }
const poseRigs = new Map<string, PoseRig>();

function lerpHex(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  let out = '#';
  for (const sh of [16, 8, 0]) {
    const ca = (pa >> sh) & 255;
    out += Math.round(ca + (((pb >> sh) & 255) - ca) * k).toString(16).padStart(2, '0');
  }
  return out;
}

function poseRig(defId: string): PoseRig | null {
  const hit = poseRigs.get(defId);
  if (hit) return hit;
  const def = megaBossDef(defId);
  if (!def) return null;
  const { silhouette: sil, glowFloor, steps } = MEGA_POSE;
  const palettes: MegaView['palette'][] = [];
  for (let i = 0; i < steps; i++) {
    const k = i / (steps - 1);
    palettes.push({ body: lerpHex(sil, def.palette.body, k), glow: lerpHex(sil, def.palette.glow, glowFloor + (1 - glowFloor) * k), accent: lerpHex(sil, def.palette.accent, k) });
  }
  const rootY = MEGA.anchorY + 84; // drawMegaOrgans' stalk root
  const last = def.phases.length - 1;
  const view: MegaView = {
    defId: def.id, name: def.name, title: def.title, palette: palettes[steps - 1], motif: def.motif, bodyFrac: def.bodyFrac,
    anchorY: MEGA.anchorY, hp: 1, maxHp: 1, phase: last, phases: def.phases.length,
    visualTier: def.phases[last].visualTier ?? last, // the premiere shows its final, most mutated form
    telegraph: null, stunned: 0, stagger: 0, staggered: false, exposed: false, deathT: 0, burrow: 0,
    weakPoints: def.weakPoints.map((s, i): MegaWeakPoint => ({
      spec: -1 - i, // negative: never collides with a live raid organ's render one-shots
      kind: s.kind, x: s.x * WIDTH, y: rootY + (s.y - rootY) * MEGA_POSE.descend,
      hp: 0, maxHp: 1, // hp 0: the raid's HP arc draws nothing (a film has no health bars)
      armor: 0, state: 'closed', window: 0, regrow: 0, emergeT: 0, hitFlash: 0,
    })),
    effects: [], siege: null,
  };
  const rig = { view, palettes, tele: { kind: 'pose', frac: 0 } };
  poseRigs.set(defId, rig);
  return rig;
}

const c01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Paint one mega, posed, in BOARD space at `now` (seconds). False when the def is unknown. */
export function drawMegaPose(ctx: Ctx, defId: string, pose: MegaPose, now: number): boolean {
  const rig = poseRig(defId);
  if (!rig) return false;
  const v = rig.view;
  const fall = c01(pose.fall);
  v.palette = rig.palettes[Math.round(c01(pose.reveal) * (MEGA_POSE.steps - 1))];
  v.deathT = fall > 0 ? Math.max(0.02, 3.5 * (1 - fall)) : 0; // collapseOf reads deathT 3.5 → 0
  const n = v.weakPoints.length;
  for (let i = 0; i < n; i++) {
    const wp = v.weakPoints[i];
    const o = c01(c01(pose.ignite) * (n + 1) - i);
    wp.state = fall > 0 ? 'destroyed' : o > 0 ? 'open' : 'closed';
    wp.emergeT = o;
    wp.hitFlash = c01(pose.flare) * MEGA_POSE.flareHit;
    // a replayed film runs its clock from 0 again — forget a rupture stamped in its future
    const rt = wpRuptureT.get(wp.spec);
    if (rt !== undefined && rt > now) wpRuptureT.delete(wp.spec);
  }
  rig.tele.frac = c01(pose.gather);
  v.telegraph = rig.tele.frac > 0 && fall === 0 ? rig.tele : null;
  // The raid's render one-shots (stagger slump, cast flash) are module state: park them, so a
  // pose neither edits the live raid's nor inherits a slump or a flash from it.
  const sStagger = staggerEase;
  const sTele = lastTele;
  const sKind = lastTeleKind;
  const sCast = castFlashT;
  const sBig = castFlashBig;
  staggerEase = 0;
  lastTele = false;
  castFlashT = -10;
  drawMegaBody(ctx, v, now);
  drawMegaOrgans(ctx, v, now);
  staggerEase = sStagger;
  lastTele = sTele;
  lastTeleKind = sKind;
  castFlashT = sCast;
  castFlashBig = sBig;
  return true;
}
