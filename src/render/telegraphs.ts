// TELEGRAPHS (docs/BOSS-DESIGN.md §telegraphs, docs/GAME-FEEL.md §telegraphs) — ONE visual language
// for "WHERE it lands, WHEN it lands" across the big actors: framework bosses, the Mega's cataclysm
// and every hero cast speak it.
//
//   • WHERE — a dashed zone rim + a faint wash over the exact area the payload hits.
//   • WHEN  — a solid LOCK ring closing onto that rim; it touches the rim the frame the payload
//             lands (reduced motion: a progress sweep on the rim instead of the moving ring).
//   • LAND  — one contact frame: a rim snap + (Flashes-gated) hot core, then it is gone.
//
// Boss wind-ups are derived from the sim's REAL timing — `BossRuntime.moduleCd` is the seconds
// until each phase module fires — so every tell lands on the tick the sim acts; nothing here
// predicts or alters gameplay. Which module kinds tell, and how, is DATA (`BOSS_TELLS`, a total
// Record over BossModuleKind: a new module kind must decide its tell or the build fails). Bosses
// compose kinds, so 50 bosses need zero per-boss code.
//
// Render-only and golden-safe: reads RenderState (+ the sim's def map `rs.bossDefs`), keeps
// per-boss presentation bookkeeping keyed by enemy id, and never allocates per frame (pooled
// pulses, per-boss state allocated once at first sight, cached colour strings).

import type { RenderState } from '../core/game';
import type { BossDef, BossModuleKind } from '../core/boss';
import { BOSS } from '../core/config';
import { HEIGHT, WIDTH, nucleusPoint } from '../core/map';
import { bossColorOf } from './bossChassis';
import { viewFeel } from './feel';
import { hexRgb } from './theme';
import { themedBossColor } from './wardrobeFx';

type Ctx = CanvasRenderingContext2D;
type Enemy = RenderState['enemies'][number];

const TAU = Math.PI * 2;
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (x: number): number => 1 - (1 - x) * (1 - x) * (1 - x);
const easeInOut = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

// ── Tunables (data — never literals in the drawing path) ─────────────────────────────────────
export const TELL = {
  lockFrom: 1.75, // the WHEN ring starts at r × this and closes onto the zone rim at landing
  washMin: 0.04, // zone wash alpha at the start of a wind-up …
  washMax: 0.14, // … rising by this much to the landing
  rimMin: 0.42, // zone rim alpha floor (information never fades below readability)
  urgentAt: 0.8, // the last 20%: the rim burns brighter (static in reduced motion)
  impactSec: 0.38, // contact frame + rim snap duration
  flashSec: 0.09, // the hot core inside the contact frame (Settings → Flashes)
  phaseSec: 0.85, // a boss phase-shift burst
  phaseReach: 3.8, // × body radius the mutation shock travels
  washRef: 150, // px — zones wider than this thin their wash (a 260px drag zone must not fog the field)
  fieldReach: 360, // px a field-wide cry (warcry) visibly spreads
  channelLockR: 36, // px — the reticle ON the Hive Core while a core-shot channels
  strikeSec: 0.42, // a landed core-shot / cataclysm strike line
  shardCount: 10, // shell fragments shed by a phase shift
} as const;

// ── Colour cache: any '#hex' or 'r, g, b' token → one opaque CSS string; alpha rides globalAlpha
const css = new Map<string, string>();
/** A cached opaque CSS colour for a `#hex` or theme `'r, g, b'` token (alpha via globalAlpha). */
export function tellColor(c: string): string {
  let s = css.get(c);
  if (s === undefined) {
    s = c.charCodeAt(0) === 35 ? `rgb(${hexRgb(c)})` : `rgb(${c})`;
    css.set(c, s);
  }
  return s;
}
const WHITE = 'rgb(255,250,240)';
const DARK = 'rgb(8,6,10)';
const DASH_ZONE: number[] = [7, 6];
const DASH_LINE: number[] = [4, 7];
const NO_DASH: number[] = [];

function arc(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.5, r), 0, TAU);
}

/**
 * The shared WHERE + WHEN read. `k` is 0 → 1 across the wind-up (1 = the payload lands now).
 * `hostile` adds the inward reticle notches (enemy → player threat); friendly casts (hero) omit
 * them and pass `calm` < 1 (the hero calm covenant — a friendly read never shouts over the fight).
 * Leaves ctx.globalAlpha at 1 and the dash cleared.
 */
export function drawLandingLock(ctx: Ctx, x: number, y: number, r: number, k: number, color: string, now: number, hostile = true, calm = 1): void {
  const kk = clamp01(k);
  const col = tellColor(color);
  const motion = viewFeel.motion > 0;
  const urgent = kk >= TELL.urgentAt;
  // WHERE — the wash and the dashed rim of the exact zone.
  ctx.fillStyle = col;
  ctx.globalAlpha = (TELL.washMin + TELL.washMax * kk) * calm * Math.min(1, TELL.washRef / Math.max(1, r));
  arc(ctx, x, y, r);
  ctx.fill();
  ctx.strokeStyle = col;
  ctx.setLineDash(DASH_ZONE);
  ctx.lineDashOffset = motion ? -now * 16 : 0;
  ctx.globalAlpha = Math.min(1, TELL.rimMin + 0.4 * kk + (urgent ? 0.18 : 0)) * calm;
  ctx.lineWidth = urgent ? 2.4 : 1.6;
  arc(ctx, x, y, r);
  ctx.stroke();
  ctx.setLineDash(NO_DASH);
  ctx.lineDashOffset = 0;
  // WHEN — the lock closes onto the rim (or, without motion, a progress sweep fills the rim).
  if (motion) {
    const lr = r * (1 + (TELL.lockFrom - 1) * (1 - easeInOut(kk)));
    ctx.globalAlpha = (0.22 + 0.68 * kk) * calm;
    ctx.lineWidth = 1.4 + 2.2 * kk;
    arc(ctx, x, y, lr);
    ctx.stroke();
    if (hostile) {
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) { // reticle notches pointing in — "this is aimed HERE"
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        ctx.moveTo(x + c * lr, y + s * lr);
        ctx.lineTo(x + c * (lr + 9), y + s * (lr + 9));
      }
      ctx.stroke();
    }
  } else {
    ctx.globalAlpha = 0.9 * calm;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * kk);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/**
 * The shared LAND beat: a rim snap at the zone edge + (Settings → Flashes) a hot core for the
 * first ~90 ms. `age` seconds since landing; `big` for the heavyweight strikes (ult / cataclysm).
 * Reduced motion: the rim holds still and fades — the information (it landed, here) stays.
 */
export function drawLandingImpact(ctx: Ctx, x: number, y: number, r: number, age: number, color: string, big = false, calm = 1): void {
  const f = age / TELL.impactSec;
  if (f < 0 || f >= 1) return;
  const col = tellColor(color);
  const motion = viewFeel.motion > 0;
  ctx.strokeStyle = col;
  ctx.globalAlpha = (1 - f) * 0.85 * calm;
  ctx.lineWidth = motion ? 1 + (1 - f) * (big ? 6 : 3.5) : 3;
  arc(ctx, x, y, motion ? r * (0.82 + 0.3 * easeOut(f)) : r);
  ctx.stroke();
  if (motion) {
    ctx.globalAlpha = (1 - f) * 0.5 * calm;
    ctx.lineWidth = 1.2;
    arc(ctx, x, y, r * (0.45 + 0.75 * easeOut(f)));
    ctx.stroke();
  }
  if (viewFeel.flashes && age < TELL.flashSec) {
    const g = 1 - age / TELL.flashSec;
    ctx.fillStyle = WHITE;
    ctx.globalAlpha = (big ? 0.55 : 0.4) * g * calm;
    arc(ctx, x, y, r * (big ? 0.5 : 0.38) * (0.7 + 0.3 * g));
    ctx.fill();
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.35 * g * calm;
    arc(ctx, x, y, r * 0.85);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** A strike line (core-shot / cataclysm landing): a hot bolt from (x0,y0) into (x1,y1), fading over
 *  TELL.strikeSec. Reduced motion keeps a static fading line. */
export function drawStrikeLine(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, age: number, color: string, width: number): void {
  const f = age / TELL.strikeSec;
  if (f < 0 || f >= 1) return;
  ctx.lineCap = 'round';
  ctx.strokeStyle = tellColor(color);
  ctx.globalAlpha = (1 - f) * 0.75;
  ctx.lineWidth = width * (1 - f * 0.6);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = WHITE;
  ctx.globalAlpha = (1 - f) * (viewFeel.flashes ? 0.8 : 0.45);
  ctx.lineWidth = Math.max(1, width * 0.35 * (1 - f));
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
}

// ── Boss module tells (data) ───────────────────────────────────────────────────────────────────
/** How a module kind telegraphs: the SHAPE of its landing, its verb colour (matches the in-effect
 *  visual it becomes), the wind-up window shown before the sim fires it, its default reach (the
 *  sim's own `?? default` for that module), and when the cast will actually DO something (a tell
 *  only shows when the sim would act — e.g. a core-crush only grips while it is at the Hive). */
export interface BossTellDef {
  shape: 'zone' | 'lane' | 'self' | 'field' | 'pool' | 'well' | 'core';
  color: string;
  lead: number; // seconds of wind-up shown before the module fires
  radius?: number; // the sim's default reach for this module (m.radius ?? radius)
  armed?: (e: Enemy, rs: RenderState) => boolean; // absent ⇒ always acts when it fires
}

const armedChannel = (e: Enemy): boolean => (e.boss?.channel ?? 0) <= 0; // a live channel is never re-armed
const armedGrip = (e: Enemy): boolean => e.sieging && e.boss !== null && e.boss.grip <= 0 && e.boss.burrow <= 0;
const armedBurrow = (e: Enemy): boolean => !e.sieging && e.boss !== null && e.boss.burrow <= 0 && e.boss.grip <= 0;
const armedCharge = (e: Enemy): boolean => !e.sieging && e.boss !== null && e.boss.burrow <= 0;
const armedWell = (_e: Enemy, rs: RenderState): boolean => rs.nullWells.length < 2;
const armedSpend = (e: Enemy): boolean => e.hp > 1;

/** Every module kind decides its tell (null = no wind-up read: passive, phase-entry, or the module
 *  carries its own telegraph — mortarfall's reticles ARE the tell). Total ⇒ a new kind without a
 *  decision is a type error. */
export const BOSS_TELLS: Readonly<Record<BossModuleKind, BossTellDef | null>> = {
  spawner: null, // adds pour from the body — the adds themselves are the read
  enrager: null, // the blood rim thickens per stack (drawEnemy)
  splitter: null, // death-triggered
  rally: null, // phase-entry (rides the phase-shift burst)
  mortarfall: null, // its closing reticles are already the telegraph (renderer.ts)
  shieldphase: { shape: 'self', color: '#ffe9a0', lead: 0.9 },
  channeler: { shape: 'core', color: '#ff8a3d', lead: 1.2, armed: armedChannel },
  charger: { shape: 'lane', color: '#ffd24d', lead: 1.1, armed: armedCharge },
  suppressor: { shape: 'zone', color: '#ff5d73', lead: 1.4, radius: 120 },
  healer: { shape: 'zone', color: '#6effa8', lead: 1.2, radius: 160 },
  carapace: { shape: 'self', color: '#c8d0dc', lead: 0.9 },
  corecrush: { shape: 'self', color: '#ff4d6d', lead: 1.0, armed: armedGrip },
  burrower: { shape: 'self', color: '#b08a62', lead: 1.0, armed: armedBurrow },
  bulwark: { shape: 'self', color: '#7fd0ff', lead: 0.9 },
  corruptor: { shape: 'pool', color: '#b64dff', lead: 1.2, radius: 95 },
  gravitas: { shape: 'zone', color: '#8fb8ff', lead: 1.2, radius: 240 },
  dampener: { shape: 'zone', color: '#e0a3ff', lead: 1.2, radius: 150 },
  warcry: { shape: 'field', color: '#ff8a3d', lead: 1.0 },
  broodburst: { shape: 'self', color: '#d98cff', lead: 0.9, armed: armedSpend },
  nullwell: { shape: 'well', color: '#b48cff', lead: 1.0, radius: 80, armed: armedWell },
  unstoppable: { shape: 'self', color: '#5fd0c6', lead: 0.9 },
};

/** Where a module's payload lands (pure — mirrors the sim's own target pick at fire time). Writes
 *  into `out` (no allocation). Zone/self/field/lane land on the boss; a corruption pool lands on the
 *  nearest tower; a null well opens midway to the nearest tower; a core-shot lands on the Core. */
export function tellTarget(shape: BossTellDef['shape'], e: Enemy, rs: RenderState, out: { x: number; y: number }): void {
  if (shape === 'core') { out.x = nucleusPoint.x; out.y = nucleusPoint.y; return; }
  if (shape === 'pool' || shape === 'well') {
    let best = Infinity;
    let tx = e.x;
    let ty = shape === 'well' ? Math.min(HEIGHT - 60, e.y + 90) : e.y;
    for (const tw of rs.towers) {
      const dx = tw.x - e.x;
      const dy = tw.y - e.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) {
        best = d2;
        tx = shape === 'well' ? (e.x + tw.x) / 2 : tw.x;
        ty = shape === 'well' ? (e.y + tw.y) / 2 : tw.y;
      }
    }
    out.x = tx;
    out.y = ty;
    return;
  }
  out.x = e.x;
  out.y = e.y;
}

/** How far a charger's dash carries (px): the sim multiplies movement by BOSS.chargeSpeedMult for
 *  the dash window, so remaining reach = speed × mult × seconds left (slows shorten it in play). */
export function dashReach(speed: number, seconds: number): number {
  return Math.max(0, speed * BOSS.chargeSpeedMult * seconds);
}

// ── Per-boss presentation bookkeeping (allocated once per boss; reaped when it leaves) ─────────
interface BossFx {
  seen: number; // frame stamp
  prevCd: number[]; // last frame's moduleCd (fire-edge detection)
  armed: boolean[]; // whether each module's tell was armed last frame (only armed fires pulse)
  phase: number; // last seen phase index (phase-shift edge)
  chanTotal: number; // the live channel's full length (captured at its rising edge)
  prevChan: number;
  landT: number; // sim time the last core-shot landed (strike frame)
  landX: number;
  landY: number;
  hx: number; // smoothed heading (dash lanes follow where the body is going)
  hy: number;
  px: number;
  py: number;
}
const bossFx = new Map<number, BossFx>();
let frame = 0;

function fxOf(e: Enemy, def: BossDef): BossFx {
  let s = bossFx.get(e.id);
  if (s === undefined || s.prevCd.length !== def.modules.length) {
    s = {
      seen: frame, prevCd: e.boss!.moduleCd.slice(), armed: def.modules.map(() => false), phase: e.boss!.phase,
      chanTotal: 0, prevChan: e.boss!.channel, landT: -10, landX: e.x, landY: e.y, hx: 0, hy: 1, px: e.x, py: e.y,
    };
    bossFx.set(e.id, s);
  }
  return s;
}

// ── Pulse pool (release beats + phase shifts) — fixed size, recycled oldest-first ─────────────
const PulseKind = { Ring: 0, Field: 1, Phase: 2 } as const;
type PulseKind = (typeof PulseKind)[keyof typeof PulseKind];
interface Pulse { on: boolean; kind: PulseKind; x: number; y: number; r: number; t0: number; color: string }
const PULSES: Pulse[] = Array.from({ length: 24 }, () => ({ on: false, kind: PulseKind.Ring, x: 0, y: 0, r: 0, t0: 0, color: '#ffffff' }));
let pulseHead = 0;
function pushPulse(kind: PulseKind, x: number, y: number, r: number, t0: number, color: string): void {
  const p = PULSES[pulseHead];
  pulseHead = (pulseHead + 1) % PULSES.length;
  p.on = true; p.kind = kind; p.x = x; p.y = y; p.r = r; p.t0 = t0; p.color = color;
}

const scratch = { x: 0, y: 0 };

/**
 * Draw every live boss's wind-up tells, core-shot channel, dash lane, release beats and phase-shift
 * bursts. Call once per frame AFTER the enemy bodies (the tells read over them) and under the heroes
 * and floats. `bossR(e)` is the renderer's boss draw radius (one source for the body size).
 */
export function drawBossTells(ctx: Ctx, rs: RenderState, now: number, bossR: (e: Enemy) => number): void {
  frame++;
  const defs = rs.bossDefs;
  if (defs !== undefined && defs.size > 0) {
    for (const e of rs.enemies) {
      const b = e.boss;
      if (b === null || !e.alive) continue;
      const def = defs.get(b.defId);
      if (def === undefined) continue;
      const st = fxOf(e, def);
      st.seen = frame;
      const r = bossR(e);
      // heading (smoothed) — where a dash will carry it
      const vx = e.x - st.px;
      const vy = e.y - st.py;
      const v2 = vx * vx + vy * vy;
      if (v2 > 0.0004 && v2 < 400) {
        const inv = 1 / Math.sqrt(v2);
        st.hx += (vx * inv - st.hx) * 0.2;
        st.hy += (vy * inv - st.hy) * 0.2;
      }
      st.px = e.x;
      st.py = e.y;
      // PHASE SHIFT — the mutation lands with a shock + shed shell (the banner alone was missable).
      if (b.phase > st.phase) pushPulse(PulseKind.Phase, e.x, e.y, r, now, themedBossColor(bossColorOf(b.defId)));
      st.phase = b.phase;
      drawChannel(ctx, e, st, r, now);
      const phase = def.phases[b.phase];
      if (phase !== undefined) {
        for (const mi of phase.modules) {
          const m = def.modules[mi];
          const tell = BOSS_TELLS[m.kind];
          const cd = b.moduleCd[mi];
          if (!tell) { st.prevCd[mi] = cd; continue; } // no tell (or an unknown kind from an old/foreign def)
          // FIRE edge: the cooldown jumped back up — the module just acted this tick.
          if (st.armed[mi] && st.prevCd[mi] <= tell.lead && cd > st.prevCd[mi] + 0.3) release(tell, e, rs, r, m.radius ?? tell.radius ?? r * 2, now);
          st.prevCd[mi] = cd;
          const armed = tell.armed === undefined || tell.armed(e, rs);
          st.armed[mi] = armed && cd <= tell.lead + 0.05;
          if (!armed || cd > tell.lead || b.burrow > 0) continue;
          const k = 1 - Math.max(0, cd) / tell.lead;
          drawTell(ctx, tell, e, rs, r, m.radius ?? tell.radius ?? r * 2, k, now, m.duration);
        }
      }
      // The live dash: the remaining lane to where the charge ends.
      if (b.charge > 0 && armedCharge(e)) {
        const dur = chargeDuration(def);
        drawLane(ctx, e, st, r, dashReach(e.speed, b.charge), 1 - b.charge / dur, now, true);
      }
    }
  }
  drawPulses(ctx, now);
  if ((frame & 63) === 0) for (const [id, s] of bossFx) if (frame - s.seen > 120) bossFx.delete(id);
}

/** The def's dash window (the sim's `m.duration ?? 1.4`) — a plain loop, no per-frame closure. */
function chargeDuration(def: BossDef): number {
  for (const m of def.modules) if (m.kind === 'charger') return m.duration ?? 1.4;
  return 1.4;
}

function drawTell(ctx: Ctx, tell: BossTellDef, e: Enemy, rs: RenderState, r: number, reach: number, k: number, now: number, duration: number | undefined): void {
  switch (tell.shape) {
    case 'zone':
      drawLandingLock(ctx, e.x, e.y, reach, k, tell.color, now);
      break;
    case 'pool':
    case 'well':
      tellTarget(tell.shape, e, rs, scratch);
      drawLandingLock(ctx, scratch.x, scratch.y, reach, k, tell.color, now);
      drawAimLine(ctx, e.x, e.y, scratch.x, scratch.y, k, tell.color, 1.6);
      break;
    case 'self':
    case 'field':
      drawGather(ctx, e.x, e.y, r, k, tell.color, now);
      break;
    case 'lane':
      drawLane(ctx, e, bossFx.get(e.id)!, r, dashReach(e.speed, duration ?? 1.4), k, now, false);
      break;
    case 'core':
      // the core-shot is about to begin: a faint aim line and a lock already settling on the Core
      drawAimLine(ctx, e.x, e.y, nucleusPoint.x, nucleusPoint.y, k * 0.6, tell.color, 1.4);
      drawLandingLock(ctx, nucleusPoint.x, nucleusPoint.y, TELL.channelLockR, k * 0.35, tell.color, now);
      break;
  }
}

function release(tell: BossTellDef, e: Enemy, rs: RenderState, r: number, reach: number, now: number): void {
  switch (tell.shape) {
    case 'zone':
      pushPulse(PulseKind.Ring, e.x, e.y, reach, now, tell.color);
      break;
    case 'pool':
    case 'well':
      tellTarget(tell.shape, e, rs, scratch);
      pushPulse(PulseKind.Ring, scratch.x, scratch.y, reach, now, tell.color);
      break;
    case 'self':
      pushPulse(PulseKind.Ring, e.x, e.y, r * 1.5, now, tell.color);
      break;
    case 'field':
      pushPulse(PulseKind.Field, e.x, e.y, r, now, tell.color);
      break;
    default:
      break; // lane / core: the dash and the channel carry their own landing
  }
}

/** A dashed aim line from the caster to the landing point; solid fill creeps along it with k
 *  (k = 1 the moment it lands). Shared by boss pools/wells/core-shots and the Mega's cataclysm. */
export function drawAimLine(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, k: number, color: string, w: number): void {
  const col = tellColor(color);
  ctx.strokeStyle = DARK;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = w + 2.5;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke(); // dark under-stroke: reads over acid, gore and beams alike
  ctx.strokeStyle = col;
  ctx.globalAlpha = 0.28 + 0.12 * clamp01(k);
  ctx.lineWidth = w;
  ctx.setLineDash(DASH_LINE);
  ctx.stroke();
  ctx.setLineDash(NO_DASH);
  if (k > 0) { // the progress fill — reaches the target the moment it lands
    const kk = clamp01(k);
    const hx = x0 + (x1 - x0) * kk;
    const hy = y0 + (y1 - y0) * kk;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = w + 1.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.fillStyle = col; // the charge head — the thing travelling toward you
    ctx.globalAlpha = 0.5;
    arc(ctx, hx, hy, w * 2.6);
    ctx.fill();
    ctx.fillStyle = WHITE;
    ctx.globalAlpha = 0.85;
    arc(ctx, hx, hy, w * 1.1);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** A self-cast gathering INTO the body: a contracting ring + a building edge glow (reduced
 *  motion: a still ring with a progress sweep). */
function drawGather(ctx: Ctx, x: number, y: number, r: number, k: number, color: string, now: number): void {
  const kk = clamp01(k);
  const col = tellColor(color);
  ctx.strokeStyle = col;
  if (viewFeel.motion > 0) {
    ctx.globalAlpha = 0.25 + 0.6 * kk;
    ctx.lineWidth = 1.5 + 2 * kk;
    arc(ctx, x, y, r * (2.5 - 1.3 * easeInOut(kk)));
    ctx.stroke();
    ctx.globalAlpha = (0.15 + 0.35 * kk) * (0.75 + 0.25 * Math.sin(now * 14));
  } else {
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.3, -Math.PI / 2, -Math.PI / 2 + TAU * kk);
    ctx.stroke();
    ctx.globalAlpha = 0.15 + 0.35 * kk;
  }
  ctx.lineWidth = 4;
  arc(ctx, x, y, r * 1.12);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** The dash lane: a band from the body to where the charge ends + a landing lock at its end.
 *  Pre-dash (`live` false) it builds with k; during the dash it shows the remaining stretch. */
function drawLane(ctx: Ctx, e: Enemy, st: BossFx, r: number, reach: number, k: number, now: number, live: boolean): void {
  if (reach < 4) return;
  const hl = Math.hypot(st.hx, st.hy) || 1;
  const dx = st.hx / hl;
  const dy = st.hy / hl;
  let ex = e.x + dx * reach;
  let ey = e.y + dy * reach;
  ex = Math.max(12, Math.min(WIDTH - 12, ex));
  ey = Math.max(12, Math.min(HEIGHT - 30, ey));
  const kk = clamp01(k);
  const col = tellColor('#ffd24d');
  const w = r * 1.5;
  const px = -dy;
  const py = dx;
  // the band
  ctx.fillStyle = col;
  ctx.globalAlpha = (live ? 0.16 : 0.05 + 0.12 * kk);
  ctx.beginPath();
  ctx.moveTo(e.x + px * w * 0.5, e.y + py * w * 0.5);
  ctx.lineTo(ex + px * w * 0.5, ey + py * w * 0.5);
  ctx.lineTo(ex - px * w * 0.5, ey - py * w * 0.5);
  ctx.lineTo(e.x - px * w * 0.5, e.y - py * w * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = col;
  ctx.globalAlpha = live ? 0.7 : 0.35 + 0.45 * kk;
  ctx.lineWidth = 1.5;
  ctx.setLineDash(DASH_ZONE);
  ctx.lineDashOffset = viewFeel.motion > 0 ? -now * 40 : 0;
  ctx.stroke();
  ctx.setLineDash(NO_DASH);
  ctx.lineDashOffset = 0;
  // chevrons streaming down the lane (static, evenly spaced, in reduced motion)
  const len = Math.hypot(ex - e.x, ey - e.y);
  const n = Math.max(1, Math.min(5, Math.floor(len / 46)));
  const flow = viewFeel.motion > 0 ? (now * (live ? 2.4 : 1.2)) % 1 : 0;
  ctx.lineWidth = 2.5;
  ctx.globalAlpha = live ? 0.9 : 0.4 + 0.5 * kk;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const f = (i + flow) / n;
    const cx = e.x + (ex - e.x) * f;
    const cy = e.y + (ey - e.y) * f;
    const c = w * 0.32;
    ctx.moveTo(cx + px * c - dx * c * 0.6, cy + py * c - dy * c * 0.6);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx - px * c - dx * c * 0.6, cy - py * c - dy * c * 0.6);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  drawLandingLock(ctx, ex, ey, r * 0.95, kk, '#ffd24d', now);
}

/** The CORE-SHOT channel: a tether whose fill reaches the Core the moment the shot lands, a lock
 *  closing ON the Core, a gather on the caster — then a strike bolt + impact when it resolves. */
function drawChannel(ctx: Ctx, e: Enemy, st: BossFx, r: number, now: number): void {
  const b = e.boss!;
  const color = BOSS_TELLS.channeler!.color;
  if (b.channel > 0 && st.prevChan <= 0) st.chanTotal = b.channel; // rising edge: the cast's full length
  if (b.channel <= 0 && st.prevChan > 0) { st.landT = now; st.landX = e.x; st.landY = e.y; } // it LANDED (the caster lives)
  st.prevChan = b.channel;
  if (b.channel > 0) {
    const total = Math.max(st.chanTotal, b.channel, 0.001);
    const k = 1 - b.channel / total;
    drawAimLine(ctx, e.x, e.y, nucleusPoint.x, nucleusPoint.y, k, color, 2.6);
    drawLandingLock(ctx, nucleusPoint.x, nucleusPoint.y, TELL.channelLockR, k, color, now);
    drawGather(ctx, e.x, e.y, r, k, color, now);
  }
  const age = now - st.landT;
  if (age >= 0 && age < TELL.strikeSec) {
    drawStrikeLine(ctx, st.landX, st.landY, nucleusPoint.x, nucleusPoint.y, age, color, 7);
    drawLandingImpact(ctx, nucleusPoint.x, nucleusPoint.y, TELL.channelLockR, age, color, true);
  }
}

function drawPulses(ctx: Ctx, now: number): void {
  const motion = viewFeel.motion > 0;
  for (const p of PULSES) {
    if (!p.on) continue;
    const age = now - p.t0;
    const dur = p.kind === PulseKind.Phase ? TELL.phaseSec : p.kind === PulseKind.Field ? TELL.impactSec * 1.6 : TELL.impactSec;
    if (age < 0 || age >= dur) { p.on = false; continue; }
    const f = age / dur;
    const col = tellColor(p.color);
    if (p.kind === PulseKind.Ring) {
      drawLandingImpact(ctx, p.x, p.y, p.r, age, p.color);
      continue;
    }
    if (p.kind === PulseKind.Field) {
      // a cry that SPREADS: one wide shock across the field from the caster
      ctx.strokeStyle = col;
      ctx.globalAlpha = (1 - f) * 0.6;
      ctx.lineWidth = 1 + (1 - f) * 4;
      arc(ctx, p.x, p.y, motion ? p.r + (TELL.fieldReach - p.r) * easeOut(f) : TELL.fieldReach * 0.6);
      ctx.stroke();
      ctx.globalAlpha = 1;
      drawLandingImpact(ctx, p.x, p.y, p.r * 1.6, age, p.color, true);
      continue;
    }
    // PHASE SHIFT: mutation shock + shed shell fragments + a brief body flare
    const reach = p.r * (motion ? 1.1 + (TELL.phaseReach - 1.1) * easeOut(f) : 2.2);
    ctx.strokeStyle = col;
    ctx.globalAlpha = (1 - f) * 0.9;
    ctx.lineWidth = 2 + (1 - f) * 7;
    arc(ctx, p.x, p.y, reach);
    ctx.stroke();
    ctx.strokeStyle = WHITE;
    ctx.globalAlpha = (1 - f) * 0.6;
    ctx.lineWidth = 1.6;
    arc(ctx, p.x, p.y, reach * 0.84);
    ctx.stroke();
    if (motion) {
      ctx.fillStyle = col;
      ctx.globalAlpha = (1 - f) * 0.9;
      ctx.beginPath();
      for (let i = 0; i < TELL.shardCount; i++) {
        const a = (i / TELL.shardCount) * TAU + (i % 3) * 0.21;
        const d = p.r * (1 + (1.6 + (i % 4) * 0.35) * easeOut(f));
        const sx = p.x + Math.cos(a) * d;
        const sy = p.y + Math.sin(a) * d + f * f * 18; // shed shell falls away
        const s = 6.5 * (1 - f * 0.5);
        ctx.moveTo(sx + Math.cos(a) * s * 1.6, sy + Math.sin(a) * s * 1.6);
        ctx.lineTo(sx + Math.cos(a + 2.3) * s, sy + Math.sin(a + 2.3) * s);
        ctx.lineTo(sx + Math.cos(a - 2.3) * s, sy + Math.sin(a - 2.3) * s);
        ctx.closePath();
      }
      ctx.fill();
    }
    if (viewFeel.flashes && age < 0.14) {
      ctx.fillStyle = WHITE;
      ctx.globalAlpha = 0.45 * (1 - age / 0.14);
      arc(ctx, p.x, p.y, p.r * 1.2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/** Boss hit read (replaces the full-body white pop for bosses — under focus fire it re-triggered
 *  every frame and washed the chassis, its telegraphs and its phase anatomy into a white disc):
 *  a bright RIM glint that confirms the hit and leaves the body readable. */
export function drawBossHitRim(ctx: Ctx, x: number, y: number, r: number, flash: number): void {
  const a = Math.min(0.75, flash * 8);
  if (a <= 0.01) return;
  ctx.strokeStyle = WHITE;
  ctx.globalAlpha = a;
  ctx.lineWidth = 2.5;
  arc(ctx, x, y, r * 1.06);
  ctx.stroke();
  ctx.globalAlpha = a * 0.35;
  ctx.lineWidth = 5;
  arc(ctx, x, y, r * 1.14);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Test hook — drop module state (each vitest file shares the module instance). */
export function __resetTelegraphsForTests(): void {
  bossFx.clear();
  for (const p of PULSES) p.on = false;
  pulseHead = 0;
  frame = 0;
}

/** Test hook — live pulse count. */
export function __pulseCount(): number {
  let n = 0;
  for (const p of PULSES) if (p.on) n++;
  return n;
}
