// COMBAT FX — the DAMAGE LANGUAGE (docs/COMBAT-VISUAL-STANDARDS.md §damage-language).
//
// Every hit speaks ONE visual language. The striker's COMBAT CLASS (core/combatClass.ts — the
// game's six damage types: Kinetic · Caustic · Viral · Neural · Vital · Resonant) picks the FORM of
// everything its attack draws — the projectile silhouette, the muzzle flash, the field pulse, the
// impact burst on the struck body, the splash blast and the kill pop. The striker's own COLOR (its
// tower def color / equipped Phenotype glow / hero weapon) tints it. Form says WHAT kind of damage;
// color says WHO. A new tower or hero inherits its whole combat read from its `combatClass` — no
// per-tower art, no switch ladders over kinds (the six-row DAMAGE_STYLE table is the only data).
//
// RENDER-ONLY: reads RenderState snapshots, never mutates the sim, no rng (hash-keyed variation),
// fixed pools (zero allocation on the steady path — colors are fixed strings + globalAlpha, glows
// are cached sprites), sim-time keyed (the view-only hit-stop freezes bursts with the field).
// Settings → Motion (viewFeel.motion 0): bursts hold a static size and fade instead of sweeping.
// Settings → Flashes (viewFeel.flashes false): no additive hot cores / white pops.

import type { RenderState } from '../core/game';
import type { CombatClass, HeroKind, TowerKind } from '../core/types';
import { HERO_DEFS, TOWER_DEFS } from '../core/config';
import { viewFeel } from './feel';
import type { ShapeKind } from './vfx';
import { glowDisc, shapePath } from './vfx';
import { organismOf } from './organism';

type Ctx = CanvasRenderingContext2D;

/** Projectile silhouette per damage type. */
export type ShotForm = 'dart' | 'glob' | 'spore' | 'bolt' | 'orb' | 'pulse';
/** Burst shape per damage type — impacts, muzzle flashes, splash blasts and kill pops share it. */
export type BurstForm = 'star' | 'splat' | 'puff' | 'crackle' | 'bloom' | 'ripple';

export interface DamageStyle {
  shot: ShotForm;
  burst: BurstForm;
  /** Shot head radius (px) before power scaling. */
  head: number;
  /** Shot trail length (px) before power scaling. */
  trail: number;
  /** Organic head wobble amplitude (0 = rigid). */
  wobble: number;
  /** Per-body hit burst reach (px) and life (s). */
  hitR: number;
  hitSec: number;
  /** Field-pulse ring dash ([] = solid) and a second trailing wavefront. */
  fieldDash: readonly number[];
  fieldEcho: boolean;
}

/** THE damage language — one row per combat class. Distinct shot + burst forms are test-pinned
 *  (combatFx.test.ts): two damage types must never read alike. */
export const DAMAGE_STYLE: Readonly<Record<CombatClass, DamageStyle>> = {
  // impact — a hard slug with a white-hot tip; hits throw sharp radial streaks
  Kinetic: { shot: 'dart', burst: 'star', head: 2.3, trail: 17, wobble: 0, hitR: 15, hitSec: 0.2, fieldDash: [], fieldEcho: false },
  // dissolution — a heavy wobbling glob shedding drips; hits splat a ring + thrown droplets
  Caustic: { shot: 'glob', burst: 'splat', head: 3.3, trail: 12, wobble: 0.14, hitR: 14, hitSec: 0.3, fieldDash: [], fieldEcho: false },
  // infection — a spore nucleus with orbiting motes on a weaving tendril; hits puff spores
  Viral: { shot: 'spore', burst: 'puff', head: 2.8, trail: 13, wobble: 0.22, hitR: 13, hitSec: 0.34, fieldDash: [2, 5], fieldEcho: false },
  // control — a faceted bolt on a zig-zag crackle; hits snap a jagged arc ring
  Neural: { shot: 'bolt', burst: 'crackle', head: 2.7, trail: 15, wobble: 0, hitR: 14, hitSec: 0.22, fieldDash: [6, 5], fieldEcho: false },
  // sustain — a soft pulsing orb trailing beads; hits bloom a soft disc
  Vital: { shot: 'orb', burst: 'bloom', head: 3.2, trail: 11, wobble: 0.1, hitR: 13, hitSec: 0.3, fieldDash: [], fieldEcho: false },
  // amplification — a ringed packet leaving wavefronts; hits ripple twin rings
  Resonant: { shot: 'pulse', burst: 'ripple', head: 2.5, trail: 12, wobble: 0, hitR: 16, hitSec: 0.28, fieldDash: [], fieldEcho: true },
};

/** Pacing + budgets (presentation only — nothing here is game balance). */
export const COMBAT_FX = {
  pool: 128, // live bursts (hits + blasts + kill pops + nothing else) — fixed, never grows
  hitGap: 0.12, // per-body hit-burst throttle (s) — a machine-gunned body doesn't strobe
  blastSec: 0.34, // splash blast life (s)
  killSec: 0.26, // kill pop life (s)
  killR: 13, // kill pop reach (px) at overkill 0 …
  killOverkillR: 9, // … + this per unit of overkill (capped at 1.5) — a crushing kill pops bigger
  muzzleSec: 0.13, // muzzle flash life after a fire edge (s)
  fieldSec: 0.42, // field-pulse wavefront travel time (s)
  fieldAlpha: 0.26, // field-pulse ring peak alpha — informative, never loud
  splashTrack: 48, // in-flight splash shells tracked for their detonation
  neutral: '#e8f4ff', // unattributed hits (hero strikes, environment)
} as const;

const TAU = Math.PI * 2;

// ── class / color resolution (data-driven: TowerDef.combatClass / HeroDef.combatClass) ──────────

/** The damage type a tower deals. */
export function towerClass(kind: TowerKind | null | undefined): CombatClass | null {
  return kind ? TOWER_DEFS[kind]?.combatClass ?? null : null;
}

/** The damage type of a shot: the firing tower's class, else the casting hero's. */
export function shotClass(sourceKind: TowerKind | null | undefined, hero?: HeroKind): CombatClass | null {
  if (hero) return HERO_DEFS[hero]?.combatClass ?? null;
  return towerClass(sourceKind);
}

/** The striker's base tint for a shot (callers layer Phenotype / weapon tints over it). */
export function shotColor(sourceKind: TowerKind | null | undefined, hero?: HeroKind): string {
  if (hero) return HERO_DEFS[hero]?.color ?? COMBAT_FX.neutral;
  return sourceKind ? TOWER_DEFS[sourceKind]?.color ?? COMBAT_FX.neutral : COMBAT_FX.neutral;
}

// Hot tints: the striker color pulled ~55% toward white — the flash a body takes when struck.
const hotCache = new Map<string, string>();
export function hotTint(hex: string): string {
  const hit = hotCache.get(hex);
  if (hit) return hit;
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  const mix = (v: number): number => Math.round(v + (255 - v) * 0.55);
  const out = Number.isFinite(n) ? `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})` : '#ffffff';
  hotCache.set(hex, out);
  return out;
}

// ── cached glow sprites (one radial gradient per color, ever — drawn with globalAlpha) ──────────
const glowCache = new Map<string, HTMLCanvasElement | null>();
const GLOW_PX = 48;
function glowSprite(color: string): HTMLCanvasElement | null {
  const hit = glowCache.get(color);
  if (hit !== undefined) return hit;
  let c: HTMLCanvasElement | null = null;
  if (typeof document !== 'undefined' && glowCache.size < 96) {
    c = document.createElement('canvas');
    c.width = GLOW_PX; c.height = GLOW_PX;
    const g = c.getContext('2d');
    try {
      if (!g) throw new Error('no 2d context');
      const grad = g.createRadialGradient(GLOW_PX / 2, GLOW_PX / 2, 1, GLOW_PX / 2, GLOW_PX / 2, GLOW_PX / 2);
      grad.addColorStop(0, color);
      grad.addColorStop(0.45, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 1;
      g.fillStyle = grad;
      g.fillRect(0, 0, GLOW_PX, GLOW_PX);
      // fade the plateau so the sprite reads as a soft light, not a disc
      g.globalCompositeOperation = 'destination-in';
      const fade = g.createRadialGradient(GLOW_PX / 2, GLOW_PX / 2, 0, GLOW_PX / 2, GLOW_PX / 2, GLOW_PX / 2);
      fade.addColorStop(0, 'rgba(0,0,0,1)');
      fade.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = fade;
      g.fillRect(0, 0, GLOW_PX, GLOW_PX);
    } catch {
      c = null; // no context, or an unparsable tint (addColorStop throws) — the plain soft disc fallback
    }
  }
  glowCache.set(color, c);
  return c;
}

/** A soft glow at (x,y) of radius r — a cached sprite (no gradient allocation per call). */
function glow(ctx: Ctx, x: number, y: number, r: number, color: string, alpha: number): void {
  if (r <= 0.5 || alpha <= 0.01) return;
  const s = glowSprite(color);
  ctx.globalAlpha = alpha;
  if (s) ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
  else { ctx.fillStyle = color; ctx.globalAlpha = alpha * 0.4; ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, TAU); ctx.fill(); }
}

function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function dot(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r > 0.3 ? r : 0.3, 0, TAU);
  ctx.fill();
}

// ── SHOTS ─────────────────────────────────────────────────────────────────────────────────────

/** Draw a projectile in its damage language. (x,y) = head, (ux,uy) = unit heading, `size` = the
 *  power scale (1 = a 12-damage shot; capped ×1.4 by the caller), `color` = the striker's tint.
 *  `trail` false ⇒ the caller already drew a (cosmetic wardrobe) trail — head only. */
export function drawDamageShot(ctx: Ctx, cls: CombatClass, x: number, y: number, ux: number, uy: number, size: number, color: string, now: number, id: number, trail = true): void {
  const st = DAMAGE_STYLE[cls];
  const h = st.head * size;
  const L = st.trail * (0.7 + 0.3 * size);
  const nx = -uy; // trail normal
  const ny = ux;
  const a0 = ctx.globalAlpha; // the caller's fade (target-less fizzle) multiplies everything
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  switch (st.shot) {
    case 'dart': { // Kinetic: a hard slug on a tight streak, white-hot tip
      if (trail) {
        ctx.globalAlpha = a0 * 0.22; ctx.lineWidth = h * 2.2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * L * 0.75, y - uy * L * 0.75); ctx.stroke();
        ctx.globalAlpha = a0 * 0.8; ctx.lineWidth = h * 0.85;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * L, y - uy * L); ctx.stroke();
      }
      glow(ctx, x, y, h * 2.4, color, a0 * 0.4);
      ctx.globalAlpha = a0;
      ctx.beginPath(); ctx.ellipse(x, y, h * 1.75, h * 0.72, Math.atan2(uy, ux), 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.globalAlpha = a0 * 0.95;
      dot(ctx, x + ux * h * 0.75, y + uy * h * 0.75, h * 0.48);
      break;
    }
    case 'glob': { // Caustic: a heavy wobbling glob shedding sagging drips
      if (trail) {
        for (let i = 1; i <= 3; i++) {
          const d = (L * i) / 3.2;
          ctx.globalAlpha = a0 * (0.6 - i * 0.14);
          dot(ctx, x - ux * d + nx * Math.sin(i * 2.3 + id) * 1.2, y - uy * d + i * i * 0.8, h * (0.78 - 0.16 * i));
        }
      }
      glow(ctx, x, y, h * 2.5, color, a0 * 0.42);
      const w = 1 + st.wobble * Math.sin(now * 9 + id);
      ctx.globalAlpha = a0;
      ctx.beginPath(); ctx.ellipse(x, y, h * w, h * (2 - w), 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.globalAlpha = a0 * 0.7;
      dot(ctx, x - h * 0.32, y - h * 0.32, h * 0.34);
      break;
    }
    case 'spore': { // Viral: a nucleus with orbiting motes on a weaving tendril
      if (trail) {
        ctx.globalAlpha = a0 * 0.55; ctx.lineWidth = Math.max(1, h * 0.55);
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let i = 1; i <= 5; i++) {
          const f = i / 5;
          const off = Math.sin(i * 1.5 + now * 11 + id) * h * 1.1 * f;
          ctx.lineTo(x - ux * L * f + nx * off, y - uy * L * f + ny * off);
        }
        ctx.stroke();
      }
      glow(ctx, x, y, h * 2.4, color, a0 * 0.38);
      ctx.globalAlpha = a0;
      dot(ctx, x, y, h * (1 + st.wobble * Math.sin(now * 8 + id)));
      ctx.globalAlpha = a0 * 0.9;
      for (let i = 0; i < 3; i++) {
        const a = now * 7 + id + i * 2.094;
        dot(ctx, x + Math.cos(a) * h * 1.65, y + Math.sin(a) * h * 1.65, h * 0.36);
      }
      break;
    }
    case 'bolt': { // Neural: a faceted bolt dragging a zig-zag crackle
      if (trail) {
        const flip = (Math.floor(now * 24) + id) % 2 === 0 ? 1 : -1;
        ctx.globalAlpha = a0 * 0.8; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let i = 1; i <= 4; i++) {
          const f = i / 4;
          const off = (i % 2 === 0 ? -1 : 1) * flip * h * 1.15 * (1 - f * 0.4);
          ctx.lineTo(x - ux * L * f + nx * off, y - uy * L * f + ny * off);
        }
        ctx.stroke();
      }
      glow(ctx, x, y, h * 2.5, color, a0 * 0.45);
      ctx.globalAlpha = a0;
      ctx.beginPath();
      ctx.moveTo(x + ux * h * 1.7, y + uy * h * 1.7);
      ctx.lineTo(x + nx * h * 0.9, y + ny * h * 0.9);
      ctx.lineTo(x - ux * h * 1.1, y - uy * h * 1.1);
      ctx.lineTo(x - nx * h * 0.9, y - ny * h * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.globalAlpha = a0 * 0.85;
      dot(ctx, x, y, h * 0.38);
      break;
    }
    case 'orb': { // Vital: a soft pulsing orb trailing beads
      if (trail) {
        for (let i = 1; i <= 3; i++) {
          ctx.globalAlpha = a0 * (0.5 - i * 0.12);
          dot(ctx, x - (ux * L * i) / 3, y - (uy * L * i) / 3, h * (0.62 - 0.12 * i));
        }
      }
      glow(ctx, x, y, h * 3.1, color, a0 * 0.5);
      ctx.globalAlpha = a0;
      dot(ctx, x, y, h * (1 + 0.15 * Math.sin(now * 10 + id)));
      ctx.fillStyle = '#ffffff'; ctx.globalAlpha = a0 * 0.8;
      dot(ctx, x, y, h * 0.45);
      break;
    }
    case 'pulse': { // Resonant: a ringed packet leaving wavefronts behind it
      if (trail) {
        const back = Math.atan2(-uy, -ux);
        ctx.lineWidth = 1.2;
        for (let j = 0; j < 2; j++) {
          ctx.globalAlpha = a0 * (0.62 - j * 0.26);
          const rr = h * (2.2 + j * 1.9) + ((now * 30 + id) % 3) * 0.6 * j;
          ctx.beginPath(); ctx.arc(x - ux * h * 0.6, y - uy * h * 0.6, rr, back - 0.75, back + 0.75); ctx.stroke();
        }
      }
      glow(ctx, x, y, h * 2.4, color, a0 * 0.4);
      ctx.globalAlpha = a0;
      dot(ctx, x, y, h);
      ctx.globalAlpha = a0 * 0.8; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, h * 1.75, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.globalAlpha = a0 * 0.85;
      dot(ctx, x, y, h * 0.42);
      break;
    }
  }
  ctx.lineCap = 'butt';
  ctx.globalAlpha = a0;
}

// ── BURSTS (impact / muzzle / blast / kill pop — one painter, the class's burst form) ──────────

/** Paint one burst of `form` at (x,y): reach R, age k (0 → 1), `seed` for stable variation.
 *  Leaves globalAlpha at 1. Static under reduced motion (holds 85% reach, fades only). */
export function drawBurst(ctx: Ctx, form: BurstForm, x: number, y: number, R: number, k: number, color: string, seed: number, hot = true): void {
  const fade = 1 - k;
  const grow = viewFeel.motion > 0 ? 1 - (1 - k) * (1 - k) : 0.85;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  switch (form) {
    case 'star': { // sharp radial streaks
      ctx.globalAlpha = fade * 0.9; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let j = 0; j < 5; j++) {
        const a = hash01(seed + j * 17) * 0.9 + (j * TAU) / 5;
        const d0 = R * (0.12 + 0.45 * grow);
        const d1 = d0 + R * 0.5 * fade + 1.5;
        ctx.moveTo(x + Math.cos(a) * d0, y + Math.sin(a) * d0);
        ctx.lineTo(x + Math.cos(a) * d1, y + Math.sin(a) * d1);
      }
      ctx.stroke();
      ctx.lineCap = 'butt';
      break;
    }
    case 'splat': { // a wet ring + droplets thrown out and falling
      ctx.globalAlpha = fade * 0.75; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(x, y, R * (0.3 + 0.6 * grow), 0, TAU); ctx.stroke();
      ctx.globalAlpha = fade * 0.9;
      for (let j = 0; j < 4; j++) {
        const a = hash01(seed + j * 13) * TAU;
        const d = R * (0.3 + 0.75 * grow);
        dot(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d + R * 0.45 * k * k, 1.9 * (1 - 0.45 * k));
      }
      break;
    }
    case 'puff': { // a spore cloud drifting out
      ctx.globalAlpha = fade * 0.18;
      dot(ctx, x, y, R * (0.3 + 0.45 * grow));
      ctx.globalAlpha = fade * 0.75;
      for (let j = 0; j < 6; j++) {
        const a = hash01(seed + j * 11) * TAU;
        const d = R * (0.2 + 0.7 * grow) * (0.6 + 0.5 * hash01(seed * 3 + j));
        dot(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d - 4 * k, 1.2 + 1.5 * grow);
      }
      break;
    }
    case 'crackle': { // a jagged arc ring — frame-quantized flicker
      const q = Math.floor(k * 7);
      const rad = R * (0.4 + 0.55 * grow);
      ctx.globalAlpha = fade * 0.9; ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let j = 0; j <= 7; j++) {
        const a = (j / 7) * TAU + hash01(seed) * TAU;
        const rr = rad * (0.75 + 0.5 * hash01(seed + j * 7 + q * 31));
        if (j === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.stroke();
      if (hot && viewFeel.flashes) {
        ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = fade * 0.55; ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      break;
    }
    case 'bloom': { // a soft filled disc opening
      ctx.globalAlpha = fade * 0.28;
      dot(ctx, x, y, R * (0.35 + 0.6 * grow));
      ctx.globalAlpha = fade * 0.6; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(x, y, R * (0.35 + 0.6 * grow), 0, TAU); ctx.stroke();
      break;
    }
    case 'ripple': { // twin concentric wavefronts
      ctx.globalAlpha = fade * 0.85; ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.arc(x, y, R * (0.28 + 0.72 * grow), 0, TAU); ctx.stroke();
      ctx.globalAlpha = fade * 0.45; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.arc(x, y, R * (0.12 + 0.5 * grow), 0, TAU); ctx.stroke();
      break;
    }
  }
  // the hot core: a white pop on the first beat of every burst (Flashes setting gates it)
  if (hot && viewFeel.flashes && k < 0.3) {
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = (1 - k / 0.3) * 0.85;
    dot(ctx, x, y, R * 0.2 * (1 - k * 1.5) + 1);
  }
  ctx.globalAlpha = 1;
}

// ── the burst pool (fixed; claim → draw → reap, no allocation) ───────────────────────────────────

const KIND_HIT = 0;
const KIND_BLAST = 1;
const KIND_KILL = 2;

interface Burst { live: boolean; kind: number; form: BurstForm; x: number; y: number; r: number; color: string; t0: number; life: number; seed: number }
const pool: Burst[] = Array.from({ length: COMBAT_FX.pool }, () => ({ live: false, kind: KIND_HIT, form: 'star' as BurstForm, x: 0, y: 0, r: 0, color: '#fff', t0: 0, life: 1, seed: 0 }));
let liveCount = 0;

/** A free slot, or (when `force`) the oldest live one; null when full and not forced. */
function claim(force: boolean): Burst | null {
  let oldest: Burst | null = null;
  for (const b of pool) {
    if (!b.live) return b;
    if (force && b.kind === KIND_HIT && (oldest === null || b.t0 < oldest.t0)) oldest = b;
  }
  return oldest; // hits are the cheapest to recycle; a full pool of blasts/kills just drops
}

function arm(b: Burst, kind: number, form: BurstForm, x: number, y: number, r: number, color: string, t: number, life: number, seed: number): void {
  if (!b.live) liveCount++;
  b.live = true; b.kind = kind; b.form = form; b.x = x; b.y = y; b.r = r; b.color = color; b.t0 = t; b.life = life; b.seed = seed;
}

/** A landed hit on a body of drawn radius `bodyR`: the striker's class burst in the striker's color,
 *  reaching past the silhouette (the renderer's hit-flash rising edge feeds this — throttled per body). */
export function pushHitBurst(x: number, y: number, bodyR: number, by: TowerKind | null, t: number, seed: number): void {
  const b = claim(false);
  if (!b) return;
  const cls = towerClass(by);
  const st = cls ? DAMAGE_STYLE[cls] : DAMAGE_STYLE.Kinetic;
  arm(b, KIND_HIT, st.burst, x, y, st.hitR + bodyR * 0.75, by ? TOWER_DEFS[by].color : COMBAT_FX.neutral, t, st.hitSec, seed);
}

/** A splash shell detonated: a blast at its TRUE radius (the AoE reads as the area it hit). */
export function pushSplashBlast(x: number, y: number, radius: number, by: TowerKind | null, color: string, t: number, seed: number): void {
  const b = claim(true);
  if (!b) return;
  const cls = towerClass(by);
  arm(b, KIND_BLAST, cls ? DAMAGE_STYLE[cls].burst : 'splat', x, y, Math.max(12, radius), color, t, COMBAT_FX.blastSec, seed);
}

/** A kill: the killer's class pop at the body, bigger on overkill. */
export function pushKillPop(x: number, y: number, by: TowerKind | null, fallback: string, overkill: number, t: number, seed: number): void {
  const b = claim(true);
  if (!b) return;
  const cls = towerClass(by);
  const r = COMBAT_FX.killR + COMBAT_FX.killOverkillR * Math.max(0, Math.min(1.5, overkill));
  arm(b, KIND_KILL, cls ? DAMAGE_STYLE[cls].burst : 'star', x, y, r, by ? TOWER_DEFS[by].color : fallback, t, COMBAT_FX.killSec, seed);
}

/** Live bursts (tests/diagnostics). */
export function liveBursts(): number {
  return liveCount;
}

export function clearCombatFx(): void {
  for (const b of pool) b.live = false;
  liveCount = 0;
  splashN = 0;
  lastKillSeq = -1;
}

// ── per-frame ingest: splash detonations (render-side, from the projectile list) + kills ──────────

// In-flight splash shells: a shell that leaves the list without fading DETONATED at its target
// point (the sim lobs to (tx,ty) and bursts on arrival) — so the blast needs no sim event.
interface Shell { id: number; x: number; y: number; r: number; kind: TowerKind | null; color: string; seen: number; fading: boolean }
const shells: Shell[] = Array.from({ length: COMBAT_FX.splashTrack }, () => ({ id: -1, x: 0, y: 0, r: 0, kind: null, color: '#fff', seen: 0, fading: false }));
let splashN = 0;
let frameNo = 0;
let lastKillSeq = -1;
let lastT = -1;
let fieldRange: Partial<Record<TowerKind, number>> = {}; // the sim's effective-range table (read-only reference)

/** Once per frame (after the projectiles are known, before drawCombatBursts): detect splash
 *  detonations, ingest kills, and cache the effective field ranges for the field pulses. */
export function updateCombatFx(rs: RenderState, t: number, detail: boolean): void {
  frameNo++;
  if (t < lastT - 1) clearCombatFx(); // a new run restarted the clock
  lastT = t;
  fieldRange = rs.effectiveRanges ?? fieldRange;
  // splash shells
  for (const p of rs.projectiles) {
    if (p.behavior !== 'splash' || p.splash <= 0) continue;
    let s: Shell | null = null;
    for (let i = 0; i < splashN; i++) if (shells[i].id === p.id) { s = shells[i]; break; }
    if (!s) {
      if (splashN >= shells.length) continue;
      s = shells[splashN++];
      s.id = p.id;
    }
    s.x = p.tx; s.y = p.ty; s.r = p.splash; s.kind = p.sourceKind; s.seen = frameNo;
    s.fading = p.fade !== undefined && p.fade < 1;
    s.color = p.sourceKind ? TOWER_DEFS[p.sourceKind].color : COMBAT_FX.neutral;
  }
  for (let i = splashN - 1; i >= 0; i--) {
    const s = shells[i];
    if (s.seen === frameNo) continue;
    if (!s.fading) pushSplashBlast(s.x, s.y, s.r, s.kind, s.color, t, s.id);
    // swap-remove (the slot object is reused — no allocation)
    const last = shells[splashN - 1];
    shells[i] = last;
    shells[splashN - 1] = s;
    s.id = -1;
    splashN--;
  }
  // kills (the sim's one-shot death buffer, seq-ingested like render/gore.ts)
  const evs = rs.deathEvents;
  if (evs.length > 0) {
    const maxSeq = evs[evs.length - 1].seq;
    if (maxSeq < lastKillSeq) lastKillSeq = -1; // new run
    if (detail) {
      let i = evs.length - 1;
      while (i > 0 && evs[i - 1].seq > lastKillSeq) i--;
      for (; i < evs.length; i++) {
        const ev = evs[i];
        if (ev.seq > lastKillSeq) pushKillPop(ev.x, ev.y, ev.killerKind, ev.color, ev.overkill, t, ev.seq * 7);
      }
    }
    lastKillSeq = maxSeq;
  }
}

/** Draw + reap every live burst (over the bodies). */
export function drawCombatBursts(ctx: Ctx, t: number): void {
  if (liveCount === 0) return;
  for (const b of pool) {
    if (!b.live) continue;
    const k = (t - b.t0) / b.life;
    if (k >= 1 || k < 0) { b.live = false; liveCount--; continue; }
    if (b.kind === KIND_BLAST) {
      // the AoE: a hot fill inside the true radius (Flashes) + the rim snapping out to it
      const grow = viewFeel.motion > 0 ? 1 - (1 - k) * (1 - k) * (1 - k) : 1;
      if (viewFeel.flashes && k < 0.5) {
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, b.x, b.y, b.r * (0.55 + 0.45 * grow), b.color, 0.5 * (1 - k * 2));
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = 0.85 * (1 - k);
      ctx.lineWidth = 1.5 + 2.5 * (1 - k);
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.25 + 0.75 * grow), 0, TAU); ctx.stroke();
      drawBurst(ctx, b.form, b.x, b.y, b.r * 0.55, k, b.color, b.seed, false);
      continue;
    }
    drawBurst(ctx, b.form, b.x, b.y, b.r, k, b.color, b.seed, true);
  }
  ctx.globalAlpha = 1;
}

// ── HIT FLASH (on the struck body) ───────────────────────────────────────────────────────────────

/** The struck body lights up in its striker's hot tint (additive — the creature stays readable
 *  under the flash instead of being painted over by a white disc), plus a class-colored rim.
 *  `k` = flash strength 0..1 (the sim's 0.09 s hitFlash, normalized). */
export function drawHitFlash(ctx: Ctx, shape: ShapeKind, x: number, y: number, r: number, k: number, by: TowerKind | null): void {
  if (k <= 0.01) return;
  const base = by ? TOWER_DEFS[by].color : COMBAT_FX.neutral;
  ctx.fillStyle = base;
  if (viewFeel.flashes) { // additive: the body BRIGHTENS toward the striker's hue (anatomy stays visible)
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 * k;
  } else ctx.globalAlpha = 0.28 * k;
  shapePath(ctx, shape, x, y, r);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = hotTint(base); // a hot rim snaps around the silhouette
  ctx.lineWidth = 1.8;
  ctx.globalAlpha = 0.9 * k;
  shapePath(ctx, shape, x, y, r + 1.5);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// ── MUZZLE FLASH + FIELD PULSE (the tower's attack, at the tower) ────────────────────────────────

interface Muzzle { lastCd: number; at: number; seen: number }
const muzzles = new Map<number, Muzzle>();
let muzzleReap = 0;

/** The tower's attack read, drawn by drawTower's ONE hook: shooters flash their class burst at the
 *  muzzle, aimed where the organism layer says the tower is looking; FIELD towers send one faint
 *  class wavefront out to their true reach (the AoE you just got hit by is visible); everything
 *  else (support / summon / trap / beam) keeps the soft recoil glow. */
export function drawMuzzleFlash(ctx: Ctx, tw: RenderState['towers'][number], r: number, now: number, fresh: number, color: string): void {
  const def = TOWER_DEFS[tw.kind];
  const f = def.firing;
  if (f !== 'homing' && f !== 'splash' && f !== 'infest' && f !== 'arc' && f !== 'field') {
    // the historical recoil glow, unchanged (a branched tower's grows with tier — TOWER-BRANCHES.md §9)
    if (fresh > 0.01) glowDisc(ctx, tw.x, tw.y - r * 0.8, r * (0.7 + fresh + tw.tier * 0.08), color);
    return;
  }
  // fire-edge detection (cooldown JUMPS up when the tower acts) — per-tower state, created once
  let m = muzzles.get(tw.id);
  if (!m) { m = { lastCd: tw.cooldown, at: -1e9, seen: 0 }; muzzles.set(tw.id, m); }
  if (def.fireInterval > 0 && tw.cooldown > m.lastCd + def.fireInterval * 0.4) m.at = now;
  m.lastCd = tw.cooldown;
  m.seen = frameNo;
  if (++muzzleReap > 600) { // occasional sweep of sold/lost towers (rare, not per frame)
    muzzleReap = 0;
    for (const [id, s] of muzzles) if (frameNo - s.seen > 120) muzzles.delete(id);
  }
  const age = now - m.at;
  const cls = def.combatClass;
  const st = DAMAGE_STYLE[cls];
  if (f === 'field') {
    if (age < 0 || age >= COMBAT_FX.fieldSec) return;
    const k = age / COMBAT_FX.fieldSec;
    const reach = fieldRange[tw.kind] ?? def.range;
    const rad = viewFeel.motion > 0 ? r + (reach - r) * (1 - (1 - k) * (1 - k)) : reach;
    ctx.strokeStyle = color;
    ctx.globalAlpha = COMBAT_FX.fieldAlpha * (1 - k);
    ctx.lineWidth = 1.5;
    if (st.fieldDash.length) ctx.setLineDash(st.fieldDash as number[]);
    ctx.beginPath(); ctx.arc(tw.x, tw.y, rad, 0, TAU); ctx.stroke();
    if (st.fieldEcho) {
      ctx.globalAlpha = COMBAT_FX.fieldAlpha * 0.5 * (1 - k);
      ctx.beginPath(); ctx.arc(tw.x, tw.y, rad * 0.82, 0, TAU); ctx.stroke();
    }
    if (st.fieldDash.length) ctx.setLineDash(NO_DASH);
    drawBurst(ctx, st.burst, tw.x, tw.y - r * 0.2, r * 1.3, k, color, tw.id * 13, false);
    return;
  }
  if (age < 0 || age >= COMBAT_FX.muzzleSec) return;
  const k = age / COMBAT_FX.muzzleSec;
  const aim = organismOf(tw.id)?.threatAngle ?? -Math.PI / 2;
  const mx = tw.x + Math.cos(aim) * r * 1.2;
  const my = tw.y + Math.sin(aim) * r * 1.2;
  if (viewFeel.flashes) {
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, mx, my, r * (0.9 + tw.tier * 0.08) * (1.2 - k * 0.4), color, 0.85 * (1 - k));
    ctx.globalCompositeOperation = 'source-over';
  }
  drawBurst(ctx, st.burst, mx, my, r * (0.75 + tw.tier * 0.06), k, color, tw.id * 7 + Math.floor(m.at * 10), true);
}
const NO_DASH: number[] = [];
