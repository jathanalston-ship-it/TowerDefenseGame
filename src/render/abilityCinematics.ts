// ABILITY CINEMATICS (docs/HERO-CINEMATICS.md) — every hero cast stages a procedural set-piece
// PERFORMANCE: the Cinderwyrm's breath is a dragon sweeping the lane, the Fovea's stare is an
// eye opening and lancing, the Vitriol's cataclysm is a shell salvo arcing in. The sim publishes
// one-shot CastEvents (RenderState.castEvents — the DeathEvent pattern) and delays each zone
// payload by the def's impactDelay, so the blow LANDS the moment the performance strikes.
//
// Everything here is presentation-only and driven by SIM time (rs.time): pause freezes the
// performance, game speed keeps it in sync with its own impact. The layer obeys the renderer's
// calm covenant — no screen shake, no full-field flashes, alpha-capped bodies and rings — and
// under reduced motion (Settings → Motion / the OS, via viewFeel.motion) the travel theater is
// skipped but the TELEGRAPH stays: the zone + a progress sweep say where and when it lands, and a
// still contact ring marks the landing (information is never motion-gated).
//
// WHERE + WHEN + LAND speak the shared telegraph language (render/telegraphs.ts): the zone rim and
// a closing lock (friendly — no hostile reticle notches), a LANDING SHADOW that gathers under
// anything arriving from the air, and one clean CONTACT FRAME the instant the payload lands (an
// ult's frame is heavier; the hot core obeys Settings → Flashes).
//
// Vocabulary (config.ts HeroCinematicDef): an ACTOR (the puppet — one per hero identity, painted
// here) rides a MOTION (the trajectory — shared pose math below). A new hero picks an existing
// actor + motion in its data row, or adds one painter to ACTOR_PAINTERS; no framework change.

import type { CastEvent, RenderState } from '../core/game';
import type { CinematicActor, CinematicMotion } from '../core/config';
import { easeOutCubic, glowDisc, ring, shapePath } from './vfx';
import { viewFeel } from './feel';
import { drawLandingImpact, drawLandingLock } from './telegraphs';

/** The cast read's tunables (docs/HERO-CINEMATICS.md §telegraph) — data, not drawing-path literals. */
export const CAST_TELL = {
  shadowAlpha: 0.32, // the landing shadow's darkest (at the landing)
  shadowFrom: 0.25, // the shadow's starting size (× zone radius) — it gathers as the blow falls
  shadowTo: 0.6, // … and its size at the landing
  ultRim: 1.0, // the contact frame's reach (× zone radius) for an ULT …
  skillRim: 0.85, // … and for a kit skill (a lighter frame — the ult stays the power moment)
  ultCalm: 0.62, // friendly reads stay under the hostile ones (calm covenant): an ult's lock/frame …
  skillCalm: 0.45, // … and an auto-cast skill's (skills fire often — they whisper)
} as const;

/** Motions that ARRIVE from somewhere (their actor is in flight) — a shadow gathers where they land. */
const AIRBORNE: Partial<Record<CinematicMotion, true>> = { lunge: true, swoop: true, dive: true, lob: true };

function hash01(n: number): number { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function clamp01(x: number): number { return x < 0 ? 0 : x > 1 ? 1 : x; }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

/** How long a performance lingers after its payload lands (the exit/dissolve beat). */
const LINGER: Partial<Record<CinematicMotion, number>> = { swoop: 0.7, dive: 0.5 };
const LINGER_DEFAULT = 0.45;
/** Instant casts (impactDelay 0) play a fixed-length flourish instead of a travel window. */
const FLOURISH_T = 0.55;

/** Everything a painter needs for one frame of one performance. */
export interface PerfCtx {
  ev: CastEvent;
  t: number; // seconds since the cast (sim time)
  T: number; // the travel window (ev.delay; FLOURISH_T for instant casts)
  u: number; // clamp01(t / T) — 1 the moment the payload lands
  pose: Pose; // where the MOTION says the body is right now
  tSim: number; // rs.time — ambient pulses (wing flaps, orbit spin)
}
export interface Pose {
  x: number;
  y: number;
  angle: number; // heading along the motion (radians); 0 = +x
  alpha: number; // motion-owned visibility (blink fade-in, exit dissolve)
}

// ── Motion pose math — where the body is at time t. Multi-element actors (barrage, murder)
//    use the pose as their anchor and lay their own elements around it. ─────────────────────

/** The off-field entry/exit reach of a swoop (px beyond the strike zone on each side). */
function swoopReach(ev: CastEvent): number {
  return Math.max(240, ev.radius * 2.2);
}

export function computePose(motion: CinematicMotion, ev: CastEvent, t: number, T: number): Pose {
  const u = clamp01(T > 0 ? t / T : 1);
  const dx = ev.x - ev.fromX;
  const dy = ev.y - ev.fromY;
  const d = Math.hypot(dx, dy);
  const nx = d > 1 ? dx / d : 0; // degenerate cast-on-self: fall back to down-lane
  const ny = d > 1 ? dy / d : 1;
  switch (motion) {
    case 'lunge': {
      const e = easeOutCubic(u);
      const hop = Math.min(60, Math.max(20, d * 0.25));
      return { x: lerp(ev.fromX, ev.x, e), y: lerp(ev.fromY, ev.y, e) - Math.sin(Math.PI * u) * hop, angle: Math.atan2(dy, dx), alpha: 1 };
    }
    case 'swoop': {
      // Symmetric fly-through: enters `reach` px before the zone, passes the zone EXACTLY at
      // t = T (the landing), and keeps flying out through the linger window.
      const reach = swoopReach(ev);
      const w = T > 0 ? t / (2 * T) : 0.5; // 0.5 ⇔ over the target
      const alt = 54 * (0.12 + 0.88 * Math.abs(Math.cos(Math.PI * clamp01(w)))); // skims lowest at the strike
      return { x: ev.x + nx * reach * (w * 2 - 1), y: ev.y + ny * reach * (w * 2 - 1) - alt, angle: Math.atan2(ny, nx), alpha: 1 };
    }
    case 'dive': {
      const e = u * u; // accelerating fall
      const sx = ev.x + 26;
      const sy = ev.y - 250;
      return { x: lerp(sx, ev.x, e), y: lerp(sy, ev.y, e), angle: Math.atan2(ev.y - sy, ev.x - sx), alpha: 1 };
    }
    case 'lob': {
      const e = u;
      const arcH = Math.min(120, Math.max(40, d * 0.3));
      return { x: lerp(ev.fromX, ev.x, e), y: lerp(ev.fromY, ev.y, e) - Math.sin(Math.PI * u) * arcH, angle: Math.atan2(dy, dx), alpha: 1 };
    }
    case 'rise': {
      const e = easeOutCubic(u);
      return { x: ev.x, y: ev.y + (1 - e) * 46, angle: -Math.PI / 2, alpha: e };
    }
    case 'expand':
      return { x: ev.x, y: ev.y, angle: 0, alpha: easeOutCubic(u) };
    case 'converge':
      return { x: ev.x, y: ev.y, angle: 0, alpha: easeOutCubic(u) };
    case 'beam':
      return { x: ev.fromX, y: ev.fromY, angle: Math.atan2(dy, dx), alpha: 1 };
    case 'blink':
      return { x: ev.x, y: ev.y, angle: Math.atan2(dy, dx), alpha: easeOutCubic(u) };
    case 'self':
      return { x: ev.x, y: ev.y, angle: 0, alpha: 1 };
  }
}

// ── Actor painters — the puppets. Each paints the hero's manifestation at p.pose with the
//    event's fork-resolved color. Alpha-capped; bodies scale off the zone radius. ────────────

function rgbaOf(hex: string, a: number): string {
  const n = parseInt(hex.length === 4 ? hex.slice(1).split('').map((c) => c + c).join('') : hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Post-landing dissolve for actors that die AT the zone (everything but the fly-through). */
function landedFade(p: PerfCtx): number {
  if (p.t <= p.T) return 1;
  const linger = LINGER[p.ev.motion] ?? LINGER_DEFAULT;
  return Math.max(0, 1 - (p.t - p.T) / linger);
}

function paintBeast(ctx: CanvasRenderingContext2D, p: PerfCtx): void {
  const { pose, ev } = p;
  const fade = landedFade(p) * pose.alpha;
  if (fade <= 0.01) return;
  const s = Math.max(14, ev.radius * 0.22);
  const stretch = p.t < p.T ? 1 + 0.35 * Math.sin(Math.PI * p.u) : 1; // mid-leap elongation
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.angle);
  ctx.globalAlpha = 0.8 * fade;
  // speed streaks behind the pounce
  ctx.strokeStyle = rgbaOf(ev.color, 0.4);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-s * stretch - i * 6, (i - 1) * s * 0.35);
    ctx.lineTo(-s * stretch - i * 6 - s * 0.8, (i - 1) * s * 0.35);
    ctx.stroke();
  }
  // body — a lunging mass with a wedge head and raked fore-claws
  ctx.fillStyle = rgbaOf(ev.color, 0.85);
  ctx.beginPath();
  ctx.ellipse(0, 0, s * stretch, s * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath(); // head wedge
  ctx.moveTo(s * stretch * 0.7, -s * 0.32);
  ctx.lineTo(s * stretch * 1.35, 0);
  ctx.lineTo(s * stretch * 0.7, s * 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 2; i++) { // claw rakes
    ctx.beginPath();
    ctx.arc(s * stretch * (0.9 + i * 0.18), s * 0.3, s * 0.34, -0.9, 0.7);
    ctx.stroke();
  }
  ctx.restore();
}

function paintBloomheart(ctx: CanvasRenderingContext2D, p: PerfCtx): void {
  const { pose, ev } = p;
  const fade = landedFade(p) * pose.alpha;
  if (fade <= 0.01) return;
  const r = Math.max(18, ev.radius * (0.3 + 0.5 * p.u));
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.globalAlpha = 0.7 * fade;
  glowDisc(ctx, 0, 0, r * 0.5, rgbaOf(ev.color, 0.3));
  ctx.fillStyle = rgbaOf(ev.color, 0.5);
  const petals = 6;
  for (let i = 0; i < petals; i++) { // unfurling petals
    const a = (Math.PI * 2 / petals) * i + p.tSim * 0.4;
    const pr = r * (0.55 + 0.45 * p.u);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(Math.cos(a - 0.35) * pr, Math.sin(a - 0.35) * pr, Math.cos(a) * pr * 1.1, Math.sin(a) * pr * 1.1);
    ctx.quadraticCurveTo(Math.cos(a + 0.35) * pr, Math.sin(a + 0.35) * pr, 0, 0);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintPsion(ctx: CanvasRenderingContext2D, p: PerfCtx): void {
  const { pose, ev } = p;
  const fade = landedFade(p) * pose.alpha;
  if (fade <= 0.01) return;
  const r = Math.max(20, ev.radius * (0.35 + 0.65 * p.u));
  ctx.save();
  ctx.globalAlpha = 0.75 * fade;
  for (let i = 0; i < 3; i++) { // rotating synapse rings
    const rr = r * (0.4 + i * 0.3);
    const spin = p.tSim * (1.2 - i * 0.35) * (i % 2 ? -1 : 1);
    ctx.setLineDash([rr * 0.5, rr * 0.32]);
    ctx.lineDashOffset = spin * rr;
    ring(ctx, pose.x, pose.y, rr, rgbaOf(ev.color, 0.5 - i * 0.1), 1.6);
    ctx.setLineDash([]);
  }
  for (let i = 0; i < 6; i++) { // firing nodes
    const a = (Math.PI * 2 / 6) * i + p.tSim * 0.8;
    const nr = r * (0.4 + 0.3 * hash01(p.ev.seq * 7 + i));
    ctx.fillStyle = `rgba(255,255,255,${0.5 * fade})`;
    ctx.beginPath();
    ctx.arc(pose.x + Math.cos(a) * nr, pose.y + Math.sin(a) * nr, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paintBarrage(ctx: CanvasRenderingContext2D, p: PerfCtx): void {
  const { ev } = p;
  // Three staggered shells riding the same lob arc with per-shell jitter; each dies on landing.
  ctx.save();
  for (let k = 0; k < 3; k++) {
    const uk = clamp01((p.t / p.T) * 1.18 - k * 0.14);
    if (uk <= 0 || uk >= 1) continue;
    const jx = (hash01(ev.seq * 13 + k) - 0.5) * ev.radius * 0.7;
    const jy = (hash01(ev.seq * 29 + k) - 0.5) * ev.radius * 0.5;
    const x = lerp(ev.fromX, ev.x + jx, uk);
    const arcH = Math.min(120, Math.max(46, Math.hypot(ev.x - ev.fromX, ev.y - ev.fromY) * 0.3));
    const y = lerp(ev.fromY, ev.y + jy, uk) - Math.sin(Math.PI * uk) * arcH;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = rgbaOf(ev.color, 0.9);
    ctx.beginPath();
    ctx.ellipse(x, y, 4.5, 3.2, Math.PI * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgbaOf(ev.color, 0.35); // drip trail
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 4);
    ctx.lineTo(x - 14, y - 12);
    ctx.stroke();
  }
  ctx.restore();
}

function paintWraith(ctx: CanvasRenderingContext2D, p: PerfCtx): void {
  const { pose, ev } = p;
  const fade = landedFade(p) * pose.alpha;
  if (fade <= 0.01) return;
  const s = Math.max(13, ev.radius * 0.18);
  ctx.save();
  if (ev.motion === 'blink' && p.u < 0.5) { // the departing afterimage
    ctx.globalAlpha = (0.5 - p.u) * 0.8;
    ctx.fillStyle = rgbaOf(ev.color, 0.4);
    shapePath(ctx, 'shroud', ev.fromX, ev.fromY, s);
    ctx.fill();
  }
  ctx.globalAlpha = 0.8 * fade;
  ctx.fillStyle = rgbaOf(ev.color, 0.7);
  shapePath(ctx, 'shroud', pose.x, pose.y, s * (1.25 - 0.25 * p.u)); // settles as it materializes
  ctx.fill();
  ctx.strokeStyle = rgbaOf(ev.color, 0.5); // trailing tatters
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const a = pose.angle + Math.PI + (i - 1) * 0.5;
    ctx.beginPath();
    ctx.moveTo(pose.x + Math.cos(a) * s * 0.7, pose.y + Math.sin(a) * s * 0.7);
    ctx.quadraticCurveTo(
      pose.x + Math.cos(a) * s * 1.5, pose.y + Math.sin(a) * s * 1.5 + Math.sin(p.tSim * 6 + i) * 3,
      pose.x + Math.cos(a) * s * 2.1, pose.y + Math.sin(a) * s * 2.1,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function paintBellwave(ctx: CanvasRenderingContext2D, p: PerfCtx): void {
  const { pose, ev } = p;
  const fade = landedFade(p) * pose.alpha;
  if (fade <= 0.01) return;
  const s = Math.max(16, ev.radius * 0.2);
  const drop = p.t < p.T ? (1 - easeOutCubic(p.u)) * 40 : 0; // the bell descends to the slam
  ctx.save();
  ctx.globalAlpha = 0.85 * fade;
  ctx.fillStyle = rgbaOf(ev.color, 0.85);
  shapePath(ctx, 'bell', pose.x, pose.y - drop, s);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; // clapper
  ctx.beginPath();
  ctx.arc(pose.x, pose.y - drop + s * 0.62, s * 0.14, 0, Math.PI * 2);
  ctx.fill();
  // resonance arcs widen with the toll
  for (let i = 0; i < 3; i++) {
    const rr = ev.radius * (0.3 + 0.28 * i) * (0.4 + 0.6 * p.u);
    ring(ctx, pose.x, pose.y, rr, rgbaOf(ev.color, (0.34 - i * 0.09) * fade), 1.5, [6, 8]);
  }
  ctx.restore();
}

function paintSerpent(ctx: CanvasRenderingContext2D, p: PerfCtx): void {
  const { pose, ev } = p;
  // The dragon: an undulating segment chain with flapping wing membranes and an ember wake.
  // Rides its motion through the whole linger (the fly-through exit) — no landed fade.
  const alpha = pose.alpha;
  if (alpha <= 0.01) return;
  const s = Math.max(15, ev.radius * 0.2); // head scale
  const dirX = Math.cos(pose.angle);
  const dirY = Math.sin(pose.angle);
  const perpX = -dirY;
  const perpY = dirX;
  ctx.save();
  ctx.globalAlpha = 0.9 * alpha;
  // body chain (tail → head so the head paints on top)
  for (let i = 6; i >= 0; i--) {
    const back = i * s * 0.62;
    const sway = Math.sin(p.tSim * 8 - i * 0.85) * s * 0.28 * (i > 0 ? 1 : 0);
    const bx = pose.x - dirX * back + perpX * sway;
    const by = pose.y - dirY * back + perpY * sway;
    const br = s * (i === 0 ? 0.58 : 0.5 - i * 0.05);
    ctx.fillStyle = i === 0 ? rgbaOf(ev.color, 0.95) : rgbaOf(ev.color, 0.75 - i * 0.06);
    ctx.beginPath();
    ctx.arc(bx, by, Math.max(2, br), 0, Math.PI * 2);
    ctx.fill();
    if (i === 2) { // wing root segment — two flapping membranes
      const flap = Math.sin(p.tSim * 10) * 0.55;
      for (const side of [-1, 1]) {
        ctx.fillStyle = rgbaOf(ev.color, 0.42);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(
          bx + perpX * side * s * 1.7, by + perpY * side * s * 1.7 - s * (0.9 + flap * side * 0.001) - flap * s * 0.6,
          bx - dirX * s * 1.3 + perpX * side * s * 2.3, by - dirY * s * 1.3 + perpY * side * s * 2.3 - flap * s * 0.5,
        );
        ctx.quadraticCurveTo(bx - dirX * s * 0.9 + perpX * side * s * 0.9, by - dirY * s * 0.9 + perpY * side * s * 0.9, bx - dirX * s * 0.5, by - dirY * s * 0.5);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  // head: jaw wedge + swept horns
  ctx.fillStyle = rgbaOf(ev.color, 0.95);
  ctx.beginPath();
  ctx.moveTo(pose.x + dirX * s * 1.15, pose.y + dirY * s * 1.15);
  ctx.lineTo(pose.x + perpX * s * 0.4, pose.y + perpY * s * 0.4);
  ctx.lineTo(pose.x - perpX * s * 0.4, pose.y - perpY * s * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.5;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(pose.x + perpX * side * s * 0.3, pose.y + perpY * side * s * 0.3);
    ctx.quadraticCurveTo(
      pose.x - dirX * s * 0.5 + perpX * side * s * 0.8, pose.y - dirY * s * 0.5 + perpY * side * s * 0.8,
      pose.x - dirX * s * 0.9 + perpX * side * s * 0.7, pose.y - dirY * s * 0.9 + perpY * side * s * 0.7,
    );
    ctx.stroke();
  }
  // ember wake while it's over the zone
  if (p.u > 0.25) {
    for (let i = 0; i < 5; i++) {
      const h = hash01(ev.seq * 17 + i + Math.floor(p.tSim * 10));
      ctx.fillStyle = rgbaOf(ev.color, 0.35 * alpha);
      ctx.beginPath();
      ctx.arc(pose.x - dirX * s * (1.5 + h * 3), pose.y - dirY * s * (1.5 + h * 3) + (h - 0.5) * s, 1.2 + h * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function paintTide(ctx: CanvasRenderingContext2D, p: PerfCtx): void {
  const { pose, ev } = p;
  const fade = landedFade(p) * pose.alpha;
  if (fade <= 0.01) return;
  const w = Math.max(26, ev.radius * (0.5 + 0.4 * p.u));
  const h = Math.max(14, ev.radius * 0.34) * (0.4 + 0.6 * p.u);
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.globalAlpha = 0.72 * fade;
  ctx.fillStyle = rgbaOf(ev.color, 0.55);
  ctx.beginPath(); // the cresting wall, curling forward at the top
  ctx.moveTo(-w, 0);
  ctx.quadraticCurveTo(-w * 0.7, -h * 1.15, 0, -h);
  ctx.quadraticCurveTo(w * 0.55, -h * 0.9, w * 0.4, -h * 0.35);
  ctx.quadraticCurveTo(w * 0.75, -h * 0.5, w, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; // crest foam
  for (let i = 0; i < 6; i++) {
    const fx = -w * 0.8 + (i / 5) * w * 1.5;
    const fy = -h * (0.85 + 0.15 * Math.sin(p.tSim * 5 + i * 2));
    ctx.beginPath();
    ctx.arc(fx, fy, 1.6 + hash01(ev.seq + i) * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paintMurder(ctx: CanvasRenderingContext2D, p: PerfCtx): void {
  const { ev } = p;
  const fade = landedFade(p);
  if (fade <= 0.01) return;
  // A converging swarm: each fly spirals in from its own ring bearing; after the landing the
  // survivors buzz the zone through the linger.
  const inR = ev.radius * (1.7 - 1.4 * easeOutCubic(p.u));
  ctx.save();
  ctx.globalAlpha = 0.85 * fade;
  for (let i = 0; i < 12; i++) {
    const h = hash01(ev.seq * 31 + i * 7);
    const a = h * Math.PI * 2 + p.tSim * (1.5 + h) * (i % 2 ? 1 : -1);
    const rr = Math.max(ev.radius * 0.18, inR * (0.7 + h * 0.6));
    const x = ev.x + Math.cos(a) * rr;
    const y = ev.y + Math.sin(a) * rr + Math.sin(p.tSim * 9 + i) * 2.5;
    ctx.fillStyle = rgbaOf(ev.color, 0.75);
    ctx.beginPath();
    ctx.ellipse(x, y, 2.2, 1.4, a, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; // wing blur
    ctx.beginPath();
    ctx.ellipse(x - Math.cos(a) * 1.5, y - Math.sin(a) * 1.5, 1.4, 0.8, a + 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paintGaze(ctx: CanvasRenderingContext2D, p: PerfCtx): void {
  const { pose, ev } = p;
  const fade = landedFade(p) * pose.alpha;
  if (fade <= 0.01) return;
  const s = Math.max(13, ev.radius * 0.24);
  const open = clamp01(p.u / 0.35); // the eye opens first…
  const fire = clamp01((p.u - 0.35) / 0.65); // …then the lance travels
  ctx.save();
  ctx.globalAlpha = 0.85 * fade;
  // the oculus at the caster's stance — a vesica that widens as it opens
  ctx.fillStyle = rgbaOf(ev.color, 0.3 + 0.4 * open);
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.scale(Math.max(0.12, open), 1);
  shapePath(ctx, 'lens', 0, 0, s);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = `rgba(255,255,255,${(0.35 + 0.45 * open) * fade})`; // iris
  ctx.beginPath();
  ctx.arc(pose.x, pose.y, s * 0.22 * (0.5 + 0.5 * open), 0, Math.PI * 2);
  ctx.fill();
  if (fire > 0) { // the lance: base → traveling head, afterglow behind it
    const hx = lerp(pose.x, ev.x, fire);
    const hy = lerp(pose.y, ev.y, fire);
    const grad = ctx.createLinearGradient(pose.x, pose.y, hx, hy);
    grad.addColorStop(0, rgbaOf(ev.color, 0.12));
    grad.addColorStop(1, rgbaOf(ev.color, 0.7));
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pose.x, pose.y);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    glowDisc(ctx, hx, hy, 9, rgbaOf(ev.color, 0.5 * fade));
  }
  ctx.restore();
}

/** The one place an actor name maps to its painter — a new hero's puppet is one entry. */
export const ACTOR_PAINTERS: Record<CinematicActor, (ctx: CanvasRenderingContext2D, p: PerfCtx) => void> = {
  beast: paintBeast,
  bloomheart: paintBloomheart,
  psion: paintPsion,
  barrage: paintBarrage,
  wraith: paintWraith,
  bellwave: paintBellwave,
  serpent: paintSerpent,
  tide: paintTide,
  murder: paintMurder,
  gaze: paintGaze,
};

// ── The performance list — seq-ingested casts playing out against sim time ──────────────────

interface Performance { ev: CastEvent; T: number; end: number; } // end = at + T + linger

let lastSeq = -1;
let perfs: Performance[] = [];
let lastSimTime = -1;
let stallMs = 0;
let lastWallMs = 0;

/** Seq-ingest the frame's casts (each stages exactly once); resets when a new run restarts seq. */
export function ingestCasts(rs: RenderState): void {
  const evs = rs.castEvents;
  if (evs.length > 0) {
    const bufMax = evs[evs.length - 1].seq; // append-order ⇒ last is the max
    if (bufMax < lastSeq) { lastSeq = -1; perfs = []; } // a new run restarted the sequence
    for (const ev of evs) {
      if (ev.seq <= lastSeq) continue;
      const isFlourish = ev.delay <= 0;
      const T = isFlourish ? FLOURISH_T : ev.delay;
      const linger = isFlourish ? 0 : (LINGER[ev.motion] ?? LINGER_DEFAULT);
      perfs.push({ ev, T, end: ev.at + T + linger });
    }
    lastSeq = Math.max(lastSeq, bufMax);
  }
  // Sim-clock stall watch (settle beat / pause): performances run on sim time, so a frozen clock
  // would hold a dragon mid-air indefinitely — after ~0.9s of wall-clock stall, release them.
  const now = Date.now();
  if (rs.time === lastSimTime && perfs.length > 0) {
    stallMs += lastWallMs > 0 ? now - lastWallMs : 0;
    if (stallMs > 900) perfs = [];
  } else {
    stallMs = 0;
  }
  lastSimTime = rs.time;
  lastWallMs = now;
  if (perfs.length > 0) { // expire in place (no per-frame array)
    let w = 0;
    for (let i = 0; i < perfs.length; i++) if (rs.time < perfs[i].end) perfs[w++] = perfs[i];
    perfs.length = w;
  }
}

/** Draw every live performance. Call once per frame, over the entities and under the HUD text.
 *  Reduced motion: the travel theater is skipped, the telegraph + a still contact ring stay. */
export function drawAbilityCinematics(ctx: CanvasRenderingContext2D, rs: RenderState): void {
  ingestCasts(rs);
  if (perfs.length === 0) return;
  const motion = viewFeel.motion > 0;
  for (const perf of perfs) {
    const ev = perf.ev;
    const t = rs.time - ev.at;
    if (t < 0) continue;
    const T = perf.T;
    const u = clamp01(t / T);
    const isFlourish = ev.delay <= 0;
    // Anticipation — WHERE + WHEN while the payload is inbound (never for flourishes): the zone and
    // a friendly lock closing onto it the instant it lands, a shadow gathering under an airborne blow.
    if (!isFlourish && t < T) {
      if (motion && AIRBORNE[ev.motion]) {
        ctx.fillStyle = 'rgb(4,4,8)';
        ctx.globalAlpha = CAST_TELL.shadowAlpha * u;
        ctx.beginPath();
        const sr = ev.radius * (CAST_TELL.shadowFrom + (CAST_TELL.shadowTo - CAST_TELL.shadowFrom) * u);
        ctx.ellipse(ev.x, ev.y, sr, sr * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      drawLandingLock(ctx, ev.x, ev.y, ev.radius, u, ev.color, rs.time, false, ev.slot === 'ult' ? CAST_TELL.ultCalm : CAST_TELL.skillCalm);
    }
    if (motion) {
      // The actor's travel/flourish. Flourishes fade on a bell curve; travelers own their fades.
      const pose = computePose(ev.motion, ev, t, T);
      if (isFlourish) pose.alpha *= Math.sin(Math.PI * clamp01(t / FLOURISH_T));
      ACTOR_PAINTERS[ev.actor](ctx, { ev, t, T, u, pose, tSim: rs.time });
    }
    // CONTACT FRAME — the payload lands: a rim snap (+ Flashes-gated hot core) inside the zone, then
    // a short afterglow. An ult's frame is heavier; skills stay the lighter beat.
    if (!isFlourish && t >= T) {
      const ult = ev.slot === 'ult';
      drawLandingImpact(ctx, ev.x, ev.y, ev.radius * (ult ? CAST_TELL.ultRim : CAST_TELL.skillRim), t - T, ev.color, ult, ult ? 1 : CAST_TELL.skillCalm * 1.6);
      const k = clamp01((t - T) / 0.3);
      if (k < 1 && motion) glowDisc(ctx, ev.x, ev.y, ev.radius * 0.5 * (1 - k * 0.4), rgbaOf(ev.color, 0.14 * (1 - k)));
    }
  }
}

/** Test hook — how many performances are live (the ingest/expiry contract is pinned on it). */
export function __perfCount(): number {
  return perfs.length;
}

/** Test hook — drop all module state (each vitest file shares the module instance). */
export function __resetCinematicsForTests(): void {
  lastSeq = -1;
  perfs = [];
  lastSimTime = -1;
  stallMs = 0;
  lastWallMs = 0;
}
