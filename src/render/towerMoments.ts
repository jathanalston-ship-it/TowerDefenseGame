// TOWER MOMENTS (docs/GAME-FEEL.md §board growth) — the beats that make the board's growth land:
//
//   • DEPLOY — a placed organism LANDS: it pops past full size and settles, a shock ring + a dust ring
//     run out along the ground plane, soil/spore flecks kick outward, and the build pad flares in the
//     tower's hue (the hive accepting it) before fading. ~0.8 s, keyed off the sim's `bornAt`.
//   • EVOLVE — a branch tier / strain level / merge MOLTS the organism: expanding rings (more of them
//     the deeper the organism has evolved), shed chitin shards, a white pop, and — at an apex (tier V
//     or Strain V, or any ≥5-step organism) — a column of light rising off it, readable across the
//     board. Keyed off `mutatedAt`; magnitude = tier + (strain − 1), so the moment ESCALATES.
//
// Everything is derived from `(now − bornAt | mutatedAt, tier, strain, id, colour)` — no per-tower
// state, nothing stored, no sim reads (goldens untouched). Data, not code: every knob is in
// TOWER_MOMENTS; nothing is per-kind, so tower #100 gets the same beats.
// Reduced motion keeps the INFORMATION (the pad glow, a static halo) and drops the motion (no pop,
// no expanding rings, no flying shards, no light column); the Flashes setting gates the white pop.

import { hexRgb } from './theme';
import { viewFeel } from './feel';
import { easeOutCubic, glowDisc } from './vfx';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

export const TOWER_MOMENTS = {
  deploy: {
    dur: 0.8, // s — the whole landing beat
    popSec: 0.55, // the size overshoot window (rides on top of the 0.35 s grow-in)
    popAmp: 0.24, // peak overshoot ≈ +11% once multiplied through the grow-in
    impactSec: 0.18, impactAlpha: 0.55, // the touch-down bloom at the base (Flashes setting)
    ringFrom: 0.8, ringTo: 3.2, ringSquash: 0.5, ringAlpha: 0.95, ringW: 3, // × body r · ground-plane ellipse
    dustAlpha: 0.5, // the darker trailing dust ring (contrast on bright ground)
    flecks: 10, fleckReach: 2.8, fleckLift: 10, fleckSize: 2.4, fleckSec: 0.6,
    socketSec: 1.1, socketR: 1.9, socketAlpha: 0.42, // the pad flare under the body
  },
  evolve: {
    baseSec: 0.55, perLevel: 0.06, // duration grows with the organism's depth (0.61 s → 1.09 s)
    ringEvery: 2, maxRings: 4, ringStagger: 0.09, ringTo: 2.4, ringPerLevel: 0.2, // +1 ring per 2 levels (1..4 rings)
    popSec: 0.5, popAlpha: 0.5, // the white pop (Flashes setting)
    shards: 5, shardsPerLevel: 1, shardReach: 2.4, shardSize: 3.6, // shed chitin
    apexLevel: 5, columnH: 10, columnW: 1.1, columnAlpha: 0.55, // the light column at an apex step
    haloR: 1.8, // reduced-motion static halo (× r)
  },
} as const;

const rgbCache = new Map<string, string>();
const solidCache = new Map<string, string>();
function rgbOf(color: string): string {
  let v = rgbCache.get(color);
  if (v === undefined) { v = color.startsWith('#') ? hexRgb(color) : '255, 255, 255'; rgbCache.set(color, v); }
  return v;
}
/** `rgb(r, g, b)` for a hex colour — cached, so the beats allocate no style strings per frame. */
function solidOf(color: string): string {
  let v = solidCache.get(color);
  if (v === undefined) { v = `rgb(${rgbOf(color)})`; solidCache.set(color, v); }
  return v;
}
/** The colour lifted 40 % toward white — strokes that must read on ANY ground (dark biome or bright flesh). */
const lightCache = new Map<string, string>();
function lightOf(color: string): string {
  let v = lightCache.get(color);
  if (v === undefined) {
    const c = rgbOf(color).split(',').map((n) => Math.round(Number(n) + (255 - Number(n)) * 0.4));
    v = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    lightCache.set(color, v);
  }
  return v;
}
function h01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ── Deploy ───────────────────────────────────────────────────────────────────────────────────────
/** Size multiplier for a freshly placed organism: a damped overshoot that settles to exactly 1.
 *  Identity outside the window and under reduced motion. */
export function deployPop(age: number): number {
  const D = TOWER_MOMENTS.deploy;
  if (viewFeel.motion === 0 || age <= 0 || age >= D.popSec) return 1;
  const k = age / D.popSec;
  return 1 + D.popAmp * Math.sin(Math.PI * k) * (1 - k);
}

/** The landing's GROUND-PLANE beat (pad flare, shock + dust rings, kicked flecks) — call between the
 *  tower's ground shadow and its body. No-op outside the window. */
export function drawDeployGround(ctx: Ctx, x: number, y: number, r: number, age: number, color: string, id: number): void {
  const D = TOWER_MOMENTS.deploy;
  if (age < 0 || age >= Math.max(D.dur, D.socketSec)) return;
  const rgb = rgbOf(color);
  // The pad flare — the hive accepting the organism (kept under reduced motion: it's the information).
  if (age < D.socketSec) {
    const f = 1 - age / D.socketSec;
    glowDisc(ctx, x, y + r * 0.2, r * D.socketR, `rgba(${rgb}, ${(D.socketAlpha * f * f).toFixed(3)})`);
  }
  if (viewFeel.flashes && age < D.impactSec) { // touch-down bloom at the base
    glowDisc(ctx, x, y + r * 0.3, r * 1.7, `rgba(255, 246, 230, ${(D.impactAlpha * (1 - age / D.impactSec)).toFixed(3)})`);
  }
  if (viewFeel.motion === 0 || age >= D.dur) return;
  const k = age / D.dur;
  const e = easeOutCubic(k);
  const rr = r * (D.ringFrom + (D.ringTo - D.ringFrom) * e);
  ctx.save();
  ctx.lineWidth = D.ringW * (1 - k) + 0.6;
  // dust (dark, a beat behind) then the bright shock — both on the ground plane
  ctx.globalAlpha = D.dustAlpha * (1 - k);
  ctx.strokeStyle = 'rgb(0,0,0)';
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.45, rr * 0.86, rr * 0.86 * D.ringSquash, 0, 0, TAU); ctx.stroke();
  ctx.globalAlpha = D.ringAlpha * (1 - k) * (1 - k);
  ctx.strokeStyle = lightOf(color);
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.45, rr, rr * D.ringSquash, 0, 0, TAU); ctx.stroke();
  // flecks kicked outward along the ground, arcing up and dropping back
  if (age < D.fleckSec) {
    const fk = age / D.fleckSec;
    const fe = easeOutCubic(fk);
    ctx.globalAlpha = 0.9 * (1 - fk);
    ctx.fillStyle = lightOf(color);
    for (let i = 0; i < D.flecks; i++) {
      const h = h01(id * 31 + i * 7);
      const a = id * 1.7 + (i / D.flecks) * TAU + (h - 0.5) * 0.5;
      const d = r * (0.6 + D.fleckReach * fe * (0.65 + 0.5 * h));
      const lift = D.fleckLift * Math.sin(Math.PI * fk) * (0.6 + h);
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * d, y + r * 0.45 + Math.sin(a) * d * D.ringSquash - lift, D.fleckSize * (1 - fk * 0.5) * (0.7 + h * 0.6), 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ── Evolve ───────────────────────────────────────────────────────────────────────────────────────
/** How deep the organism has evolved this run: branch tier + strain steps above I (0..9). */
export function evolveLevel(tier: number, strain: number): number {
  return Math.max(0, tier) + Math.max(0, strain - 1);
}
export function evolveDuration(level: number): number {
  const E = TOWER_MOMENTS.evolve;
  return E.baseSec + E.perLevel * Math.max(1, level);
}
export function evolveRings(level: number): number {
  const E = TOWER_MOMENTS.evolve;
  return Math.min(E.maxRings, 1 + Math.floor(Math.max(0, level - 1) / E.ringEvery));
}

/** The MOLT beat over the body. `apex` = this step reached tier V / Strain V. No-op outside the window. */
export function drawEvolveBeat(ctx: Ctx, x: number, y: number, r: number, age: number, level: number, apex: boolean, color: string, id: number): void {
  const E = TOWER_MOMENTS.evolve;
  const dur = evolveDuration(level);
  if (age < 0 || age >= dur) return;
  const rgb = rgbOf(color);
  const k = age / dur;
  ctx.save();
  if (viewFeel.flashes && age < E.popSec) { // the white pop (an impact bloom — off under Flashes)
    const f = 1 - age / E.popSec;
    glowDisc(ctx, x, y, r * (1.3 + f * 1.4), `rgba(255, 255, 255, ${(E.popAlpha * f).toFixed(3)})`);
  }
  if (viewFeel.motion === 0) { // reduced motion: a static halo that fades — the "it evolved" read, no motion
    ctx.globalAlpha = 0.75 * (1 - k);
    ctx.strokeStyle = solidOf(color);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r * E.haloR, 0, TAU); ctx.stroke();
    ctx.restore();
    return;
  }
  // expanding rings — one more for every few levels of depth
  ctx.strokeStyle = lightOf(color);
  const rings = evolveRings(level);
  const reach = E.ringTo + E.ringPerLevel * level;
  for (let i = 0; i < rings; i++) {
    const t0 = i * E.ringStagger;
    if (age < t0) continue;
    const ki = (age - t0) / (dur - t0);
    ctx.globalAlpha = 0.7 * (1 - ki);
    ctx.lineWidth = 1 + (1 - ki) * (2.5 - i * 0.5);
    ctx.beginPath(); ctx.arc(x, y, r * (1.1 + easeOutCubic(ki) * reach), 0, TAU); ctx.stroke();
  }
  // shed chitin — the old shell flung off as the new organism swells
  const n = E.shards + E.shardsPerLevel * level;
  const e = easeOutCubic(k);
  ctx.fillStyle = lightOf(color);
  ctx.strokeStyle = 'rgba(6, 8, 12, 0.7)';
  ctx.lineWidth = 0.8;
  ctx.globalAlpha = 0.95 * (1 - k * k);
  for (let i = 0; i < n; i++) {
    const h = h01(id * 17 + i * 13 + level);
    const a = id * 2.39 + (i / n) * TAU + (h - 0.5) * 0.6;
    const d = r * (0.7 + E.shardReach * e * (0.7 + 0.6 * h));
    const sx = x + Math.cos(a) * d, sy = y + Math.sin(a) * d;
    const rot = a + k * 6 * (h - 0.5);
    const sz = E.shardSize * (0.7 + h * 0.6);
    const c = Math.cos(rot), s = Math.sin(rot);
    ctx.beginPath();
    ctx.moveTo(sx + c * sz, sy + s * sz);
    ctx.lineTo(sx - c * sz * 0.6 - s * sz * 0.55, sy - s * sz * 0.6 + c * sz * 0.55);
    ctx.lineTo(sx - c * sz * 0.6 + s * sz * 0.55, sy - s * sz * 0.6 - c * sz * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // the apex column — a shaft of the organism's light rising off it, readable across the board
  if (apex || level >= E.apexLevel) {
    const f = (1 - k) ** 1.5;
    const H = r * E.columnH * (0.6 + 0.4 * e);
    const w = r * E.columnW * (1 - 0.4 * k);
    const g = ctx.createLinearGradient(x, y, x, y - H);
    g.addColorStop(0, `rgba(255, 255, 255, ${(E.columnAlpha * f).toFixed(3)})`);
    g.addColorStop(0.35, `rgba(${rgb}, ${(E.columnAlpha * 0.8 * f).toFixed(3)})`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.lineTo(x - w * 0.25, y - H);
    ctx.lineTo(x + w * 0.25, y - H);
    ctx.lineTo(x + w, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
