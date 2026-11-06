// ASSIMILATION VFX (docs/ENEMIES.md §8.2) — the satisfying enemy DEATH system. Fed by the sim's
// one-shot `DeathEvent` buffer (seq-ingested so each death fires exactly once, decoupled from draw
// rate), it explodes an enemy into colour-CODED pieces that go to organized destinations:
//
//   • VISCERA gibs  — burst out (harder on overkill/crit) + settle as fading floor decals ("stay in place")
//   • JUICE spray   — OCCASIONAL translucent bio-juice droplets (chance ∝ overkill), arc + splat
//   • BIOMASS motes — fly INTO the biomass anchor (arena top, beneath the HUD readout), ORBIT,
//                     and are CONSUMED — a debounced "+N" float shows the real bounty absorbed
//   • XP shards     — home into the KILLING tower/hero, orbit it, and THROB it on consumption
//   • ASSIM chunks  — fly INTO the container anchor beneath the meter; "◈N" counts the units
//   Homing chunks NEVER fade mid-flight (failsafe lives only) — every chunk visibly arrives.
//
// Piece COUNTS scale with the enemy's relative value (bounty) + overkill, so a fat elite showers more
// than chaff. Cosmetic + render-only (never read by the sim ⇒ golden-safe); pooled + capped for perf.

import type { DeathEvent, RenderState } from '../core/game';
import { TOWER_DEFS, HERO_DEFS } from '../core/config';
import { WIDTH } from '../core/map';
import { rgba } from './theme'; // memoized colour strings (perf — docs/RENDER-PIPELINE.md §6)

type Ctx = CanvasRenderingContext2D;

// ── colour helpers (memoized — palette is per-kind, a handful of keys) ──────────────────────────
const shadeCache = new Map<string, string>();
function shade(hex: string, f: number): string {
  const key = hex + f;
  const hit = shadeCache.get(key); if (hit) return hit;
  const h = hex.replace('#', ''); const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { const k = 1 + f; r *= k; g *= k; b *= k; }
  const out = `${Math.round(r)},${Math.round(g)},${Math.round(b)}`; shadeCache.set(key, out); return out; // "r,g,b" for rgba()
}

const BIOMASS_COL = '182,232,74'; // the biomass green
const ASSIM_COL = '201,139,255'; // the bio-container violet
// Coalescing DESTINATIONS — inside the visible arena at its top edge, aimed at the REAL HUD
// meters. The defaults approximate the portrait layout (meters directly above the full-width
// canvas); GameView calibrates per layout by projecting the actual biomass/loot DOM cells into
// board space (setGoreAnchors) — on desktop's centered, letterboxed canvas the streams land at
// the arena edge NEAREST each readout instead of a fixed fraction that matches no layout.
// ON-SCREEN by design: a chunk must visibly ARRIVE, orbit, and be consumed — never exit the
// canvas and die (it physically can't reach a DOM meter outside the board).
const DEFAULT_BIOMASS_TARGET = { x: WIDTH * 0.8, y: 14 };
const DEFAULT_ASSIM_TARGET = { x: WIDTH * 0.52, y: 14 };
let BIOMASS_TARGET = { ...DEFAULT_BIOMASS_TARGET };
let ASSIM_TARGET = { ...DEFAULT_ASSIM_TARGET };

/** Calibrate the HUD-bound stream destinations (BOARD coordinates). Points are clamped into
 *  the arena's top band; null/omitted restores a stream's portrait-tuned default. */
export function setGoreAnchors(a: { biomass?: { x: number; y: number } | null; assim?: { x: number; y: number } | null }): void {
  const clamp = (p: { x: number; y: number }): { x: number; y: number } => ({
    x: Math.max(24, Math.min(WIDTH - 24, p.x)),
    y: Math.max(12, Math.min(90, p.y)),
  });
  BIOMASS_TARGET = a.biomass ? clamp(a.biomass) : { ...DEFAULT_BIOMASS_TARGET };
  ASSIM_TARGET = a.assim ? clamp(a.assim) : { ...DEFAULT_ASSIM_TARGET };
}
const GORE_REF_BOUNTY = 12; // a mid-tier bounty ⇒ relScale ≈ 1
const CAP = 520; // total live pieces (perf ceiling)
const HOMING_FAILSAFE = 4; // seconds — a homing chunk may cross the whole board; life is a leak-guard, NOT a fade
const ORBIT_SECONDS = 0.42; // the coalescing circle before consumption
const ORBIT_RATE = 9; // rad/s around the destination

// A flying piece: `hx/hy` set ⇒ it HOMES to that target (coalescer); else it's a ballistic gib/drop.
interface Piece {
  x: number; y: number; vx: number; vy: number; size: number; rgb: string; alpha: number;
  life: number; maxLife: number;
  hx: number; hy: number; homing: boolean; key: string; // key = entity to throb on arrival ('' = HUD region)
  grav: number; drag: number; kind: 'gib' | 'drop' | 'mote' | 'shard' | 'assim';
  /** Coalescing theater: 0 = still flying; > 0 = orbiting the destination (seconds left). */
  orbT: number; orbA: number; orbR: number;
  /** What this chunk is WORTH at its destination (real biomass for motes; assimilation units
   *  for container chunks; 0 = no number, the throb is the feedback). Summed into ONE floating
   *  "+N" per destination on consumption — the value the chunks represent, made legible. */
  value: number; dest: string;
}
interface Decal { x: number; y: number; size: number; rgb: string; life: number; maxLife: number; sx: number }
interface Floater { x: number; y: number; text: string; rgb: string; life: number; maxLife: number }
interface Flash { x: number; y: number; rgb: string; life: number; maxLife: number }

const pieces: Piece[] = [];
const decals: Decal[] = [];
const floaters: Floater[] = [];
const flashes: Flash[] = [];
// Per-destination value accumulator: consumes within a short window merge into ONE "+N" float
// (a pack wipe reads as a single fat number, not confetti spam).
const pending = new Map<string, { sum: number; x: number; y: number; rgb: string; hold: number; prefix: string }>();
const throb = new Map<string, number>(); // entity key → 0..1 feed pulse (decays)
let lastSeq = -1;
let lastT = 0;

function push(p: Piece): void { if (pieces.length < CAP) pieces.push(p); }

/** Book a consumed chunk's value; the float fires once the arrival stream pauses. */
function bookValue(p: Piece): void {
  if (p.value <= 0 || !p.dest) return;
  const cur = pending.get(p.dest);
  if (cur) { cur.sum += p.value; cur.hold = 0.28; }
  else pending.set(p.dest, { sum: p.value, x: p.hx, y: p.hy, rgb: p.rgb, hold: 0.28, prefix: p.kind === 'assim' ? '◈' : '+' });
}

/** The tower/hero that gets the XP shards (nearest instance of the credited kind, else nearest hero). */
function killerTarget(ev: DeathEvent, rs: RenderState): { x: number; y: number; key: string; rgb: string } | null {
  if (ev.killerKind) {
    let best: RenderState['towers'][number] | null = null, bd = Infinity;
    for (const tw of rs.towers) {
      if (tw.kind !== ev.killerKind) continue;
      const dx = tw.x - ev.x, dy = tw.y - ev.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = tw; }
    }
    if (best) return { x: best.x, y: best.y, key: `t${best.id}`, rgb: shade(TOWER_DEFS[ev.killerKind].color, 0) };
  }
  let bh: RenderState['heroes'][number] | null = null, bd = Infinity;
  for (const h of rs.heroes) {
    if (h.down) continue;
    const dx = h.x - ev.x, dy = h.y - ev.y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; bh = h; }
  }
  if (bh) return { x: bh.x, y: bh.y, key: `h${bh.kind}`, rgb: shade(HERO_DEFS[bh.kind].color, 0) };
  return null;
}

function spawnBurst(ev: DeathEvent, rs: RenderState): void {
  const ok = Math.max(0, Math.min(1.5, ev.overkill));
  const rel = Math.max(0.4, Math.min(3, ev.bounty / GORE_REF_BOUNTY));
  const burst = 60 + ok * 150; // overkill throws pieces harder
  const rand = () => Math.random();
  const ring = (i: number, n: number, spd: number) => { const a = (i / n) * Math.PI * 2 + rand() * 0.6; return { vx: Math.cos(a) * spd * (0.6 + rand() * 0.8), vy: Math.sin(a) * spd * (0.6 + rand() * 0.8) - 20 }; };

  // VISCERA gibs — burst + settle as decals. Count ∝ overkill (a crit/overkill shatters it more).
  const gibs = 3 + Math.round(ok * 4);
  const gibRgb = shade(ev.color, -0.3);
  for (let i = 0; i < gibs; i++) {
    const v = ring(i, gibs, burst * 0.9);
    push({ x: ev.x, y: ev.y, vx: v.vx, vy: v.vy, size: 2.2 + rand() * 2.4 + ok * 1.5, rgb: gibRgb, alpha: 1,
      life: 0.45 + rand() * 0.25, maxLife: 0.7, hx: 0, hy: 0, homing: false, key: '', grav: 360, drag: 0.9, kind: 'gib',
      orbT: 0, orbA: 0, orbR: 0, value: 0, dest: '' });
  }

  // JUICE spray — OCCASIONAL (chance ∝ overkill): fine translucent bio-juice droplets that arc + splat.
  if (rand() < 0.22 + ok * 0.4) {
    const drops = 6 + Math.round(ok * 10);
    const juice = shade(ev.color, 0.25);
    for (let i = 0; i < drops; i++) {
      const v = ring(i, drops, burst * (0.7 + rand() * 0.9));
      push({ x: ev.x, y: ev.y, vx: v.vx, vy: v.vy - 30, size: 1 + rand() * 1.8, rgb: juice, alpha: 0.6,
        life: 0.35 + rand() * 0.3, maxLife: 0.65, hx: 0, hy: 0, homing: false, key: '', grav: 520, drag: 0.98, kind: 'drop',
        orbT: 0, orbA: 0, orbR: 0, value: 0, dest: '' });
    }
  }

  // BIOMASS motes — fly INTO the biomass anchor, orbit, and are consumed. Each carries an even
  // split of the kill's REAL bounty, so the destination float shows the true biomass gained.
  const motes = 2 + Math.round(rel * 3);
  for (let i = 0; i < motes; i++) {
    const v = ring(i, motes, burst * 0.5);
    push({ x: ev.x, y: ev.y, vx: v.vx, vy: v.vy, size: 2.6 + rand() * 2, rgb: BIOMASS_COL, alpha: 1,
      life: HOMING_FAILSAFE, maxLife: HOMING_FAILSAFE, hx: BIOMASS_TARGET.x, hy: BIOMASS_TARGET.y, homing: true, key: '', grav: 0, drag: 0.96, kind: 'mote',
      orbT: 0, orbA: 0, orbR: 0, value: ev.bounty / motes, dest: 'biomass' });
  }

  // XP shards — home into the killing tower/hero, orbit it, and feed it (the throb IS the
  // consumption feedback; no invented number — the sim owns XP truth).
  const target = killerTarget(ev, rs);
  if (target) {
    const shards = 2 + Math.round(rel * 2);
    for (let i = 0; i < shards; i++) {
      const v = ring(i, shards, burst * 0.55);
      push({ x: ev.x, y: ev.y, vx: v.vx, vy: v.vy, size: 2.8 + rand() * 1.8, rgb: target.rgb, alpha: 1,
        life: HOMING_FAILSAFE, maxLife: HOMING_FAILSAFE, hx: target.x, hy: target.y, homing: true, key: target.key, grav: 0, drag: 0.95, kind: 'shard',
        orbT: 0, orbA: 0, orbR: 0, value: 0, dest: '' });
    }
  }

  // ASSIM chunks — fly INTO the container anchor beneath the meter, orbit, and are consumed;
  // the float counts the assimilation units absorbed (each chunk = one unit).
  const assim = 1 + Math.round(rel * 1.5);
  for (let i = 0; i < assim; i++) {
    const v = ring(i, assim, burst * 0.5);
    push({ x: ev.x, y: ev.y, vx: v.vx, vy: v.vy, size: 2.6 + rand() * 1.8, rgb: ASSIM_COL, alpha: 1,
      life: HOMING_FAILSAFE, maxLife: HOMING_FAILSAFE, hx: ASSIM_TARGET.x, hy: ASSIM_TARGET.y, homing: true, key: '', grav: 0, drag: 0.96, kind: 'assim',
      orbT: 0, orbA: 0, orbR: 0, value: 1, dest: 'assim' });
  }
}

/** Seq-ingest the frame's death events (each fires once); resets cleanly when a new run restarts seq. */
export function ingestDeaths(rs: RenderState): void {
  const evs = rs.deathEvents;
  if (evs.length === 0) return;
  const bufMax = evs[evs.length - 1].seq; // append-order ⇒ last is the max
  if (bufMax < lastSeq) { lastSeq = -1; pieces.length = 0; decals.length = 0; floaters.length = 0; flashes.length = 0; pending.clear(); throb.clear(); } // a new run restarted the sequence
  for (const ev of evs) if (ev.seq > lastSeq) spawnBurst(ev, rs);
  lastSeq = bufMax;
}

/** Advance the pieces + decals + throbs by the sim-time delta (paused ⇒ frozen, like everything else). */
export function updateGore(t: number): void {
  const dt = Math.max(0, Math.min(0.05, t - lastT));
  lastT = t;
  if (dt === 0) return;
  for (let i = pieces.length - 1; i >= 0; i--) {
    const p = pieces[i];
    p.life -= dt;
    if (p.homing) {
      if (p.orbT > 0) {
        // COALESCE: circle the destination, spiraling in — then be CONSUMED (flash + value).
        p.orbT -= dt;
        p.orbA += ORBIT_RATE * dt;
        p.orbR = Math.max(2, p.orbR - dt * 34);
        p.x = p.hx + Math.cos(p.orbA) * p.orbR;
        p.y = p.hy + Math.sin(p.orbA) * p.orbR * 0.7; // slight ellipse — reads as a vortex, not a clock
        if (p.orbT <= 0) {
          if (p.key) throb.set(p.key, Math.min(1, (throb.get(p.key) ?? 0) + 0.4));
          bookValue(p);
          if (flashes.length < 24) flashes.push({ x: p.hx, y: p.hy, rgb: p.rgb, life: 0.32, maxLife: 0.32 });
          pieces.splice(i, 1);
        }
        continue;
      }
      // FLY: spring toward the destination — life is only a leak-guard, a chunk NEVER fades
      // mid-flight (the old 1s lives deleted distant kills' chunks in transit).
      const dx = p.hx - p.x, dy = p.hy - p.y, d2 = dx * dx + dy * dy;
      if (p.life <= 0) { if (p.key) throb.set(p.key, Math.min(1, (throb.get(p.key) ?? 0) + 0.4)); bookValue(p); pieces.splice(i, 1); continue; }
      if (d2 < 676) { // arrival (26px): enter the coalescing orbit
        p.orbT = ORBIT_SECONDS + Math.random() * 0.14;
        p.orbA = Math.atan2(p.y - p.hy, p.x - p.hx);
        p.orbR = Math.min(24, Math.max(10, Math.sqrt(d2)));
        continue;
      }
      const inv = 1 / Math.sqrt(d2);
      p.vx = (p.vx + dx * inv * 900 * dt) * p.drag;
      p.vy = (p.vy + dy * inv * 900 * dt) * p.drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
    } else {
      p.vy += p.grav * dt; p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0) {
        if (p.kind === 'gib' && decals.length < 130) { // a gib settles into a fading floor stain
          decals.push({ x: p.x, y: p.y, size: p.size * 1.3, rgb: p.rgb, life: 1.6 + Math.random() * 1.2, maxLife: 2.8, sx: 0.8 + Math.random() * 0.5 });
        } else if (p.kind === 'drop' && decals.length < 130 && Math.random() < 0.5) { // an occasional wet splat
          decals.push({ x: p.x, y: p.y, size: p.size * 1.6, rgb: p.rgb, life: 1.2, maxLife: 1.6, sx: 1.2 + Math.random() * 0.6 });
        }
        pieces.splice(i, 1);
      }
    }
  }
  for (let i = decals.length - 1; i >= 0; i--) { decals[i].life -= dt; if (decals[i].life <= 0) decals.splice(i, 1); }
  for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].life -= dt; if (flashes[i].life <= 0) flashes.splice(i, 1); }
  for (let i = floaters.length - 1; i >= 0; i--) { floaters[i].life -= dt; if (floaters[i].life <= 0) floaters.splice(i, 1); }
  // Debounced value floats: when a destination's arrival stream pauses, ONE fat "+N" rises.
  for (const [k, v] of pending) {
    v.hold -= dt;
    if (v.hold > 0) continue;
    if (floaters.length < 12) {
      const n = Math.max(1, Math.round(v.sum));
      floaters.push({ x: v.x, y: v.y + 14, text: `${v.prefix}${n}`, rgb: v.rgb, life: 1.15, maxLife: 1.15 });
    }
    pending.delete(k);
  }
  for (const [k, v] of throb) { const nv = v - dt * 2.6; if (nv <= 0.01) throb.delete(k); else throb.set(k, nv); }
}

/** How hard an entity is THROBBING from just-fed XP (0..1). The renderer scales the tower/hero by it. */
export function goreThrob(key: string): number { return throb.get(key) ?? 0; }

/** Floor layer: settled viscera + juice stains, UNDER the living bodies (drawn on the arena floor). */
export function drawGoreFloor(ctx: Ctx): void {
  for (const d of decals) {
    const a = Math.min(0.5, (d.life / d.maxLife) * 0.5);
    ctx.fillStyle = rgba(d.rgb, a);
    ctx.beginPath();
    ctx.ellipse(d.x, d.y, d.size * d.sx, d.size * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Above layer: the flying pieces (gibs, juice, coalescing streams), consumption flashes and
 *  value floats, OVER the bodies. Homing chunks stay FULLY LIT for the whole flight; only the
 *  orbit shrinks them as they're absorbed. */
export function drawGorePieces(ctx: Ctx): void {
  for (const p of pieces) {
    const lf = p.life / p.maxLife;
    let a: number; let sz: number;
    if (p.homing) {
      a = p.alpha; // never fades in transit — arrival consumes it, nothing else
      sz = p.orbT > 0 ? p.size * Math.max(0.35, p.orbT / ORBIT_SECONDS) : p.size;
      // a soft halo while orbiting — the vortex glows as it condenses
      if (p.orbT > 0) {
        ctx.fillStyle = rgba(p.rgb, a * 0.22);
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz * 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      // the comet trail sells the "streaming in"
      ctx.strokeStyle = rgba(p.rgb, a * 0.5);
      ctx.lineWidth = sz * 1.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
      ctx.stroke();
    } else {
      a = p.alpha * Math.min(1, lf * 2); // ballistic gibs/drops still fade out
      sz = p.size;
    }
    ctx.fillStyle = rgba(p.rgb, a);
    ctx.beginPath();
    ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineCap = 'butt';
  // Consumption flashes — a quick ring pop where a chunk was absorbed.
  for (const f of flashes) {
    const k = 1 - f.life / f.maxLife;
    ctx.strokeStyle = rgba(f.rgb, (1 - k) * 0.8);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 4 + k * 20, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Value floats — the number the chunks represented, rising off the destination.
  for (const fl of floaters) {
    const k = 1 - fl.life / fl.maxLife; // 0 → 1 over the float's life
    const a = fl.life < 0.35 ? fl.life / 0.35 : 1;
    const y = fl.y + 6 - k * 30;
    ctx.font = "800 13px 'Exo 2', system-ui, sans-serif";
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(6,10,14,${a * 0.85})`;
    ctx.strokeText(fl.text, fl.x, y);
    ctx.fillStyle = rgba(fl.rgb, a);
    ctx.fillText(fl.text, fl.x, y);
  }
  ctx.textAlign = 'start';
}
