// ASSIMILATION VFX (docs/ENEMIES.md §8.2) — the satisfying enemy DEATH system. Fed by the sim's
// one-shot `DeathEvent` buffer (seq-ingested so each death fires exactly once, decoupled from draw
// rate), it explodes an enemy into colour-CODED pieces that go to organized destinations:
//
//   • VISCERA gibs  — burst out (harder on overkill/crit) + settle as fading floor decals ("stay in place")
//   • JUICE spray   — OCCASIONAL translucent bio-juice droplets (chance ∝ overkill), arc + splat
//   • BIOMASS motes — coalesce UP toward the biomass HUD readout (green)
//   • XP shards     — home into the KILLING tower/hero and THROB it (its own colour)
//   • ASSIM chunks  — coalesce toward the bio-container meter (violet)
//
// Piece COUNTS scale with the enemy's relative value (bounty) + overkill, so a fat elite showers more
// than chaff. Cosmetic + render-only (never read by the sim ⇒ golden-safe); pooled + capped for perf.

import type { DeathEvent, RenderState } from '../core/game';
import { TOWER_DEFS, HERO_DEFS } from '../core/config';
import { WIDTH } from '../core/map';

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
const BIOMASS_TARGET = { x: WIDTH * 0.8, y: -16 }; // up toward the top-right biomass readout
const ASSIM_TARGET = { x: WIDTH * 0.52, y: -16 }; // up toward the container meter
const GORE_REF_BOUNTY = 12; // a mid-tier bounty ⇒ relScale ≈ 1
const CAP = 520; // total live pieces (perf ceiling)

// A flying piece: `hx/hy` set ⇒ it HOMES to that target (coalescer); else it's a ballistic gib/drop.
interface Piece {
  x: number; y: number; vx: number; vy: number; size: number; rgb: string; alpha: number;
  life: number; maxLife: number;
  hx: number; hy: number; homing: boolean; key: string; // key = entity to throb on arrival ('' = HUD region)
  grav: number; drag: number; kind: 'gib' | 'drop' | 'mote' | 'shard' | 'assim';
}
interface Decal { x: number; y: number; size: number; rgb: string; life: number; maxLife: number; sx: number }

const pieces: Piece[] = [];
const decals: Decal[] = [];
const throb = new Map<string, number>(); // entity key → 0..1 feed pulse (decays)
let lastSeq = -1;
let lastT = 0;

function push(p: Piece): void { if (pieces.length < CAP) pieces.push(p); }

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
      life: 0.45 + rand() * 0.25, maxLife: 0.7, hx: 0, hy: 0, homing: false, key: '', grav: 360, drag: 0.9, kind: 'gib' });
  }

  // JUICE spray — OCCASIONAL (chance ∝ overkill): fine translucent bio-juice droplets that arc + splat.
  if (rand() < 0.22 + ok * 0.4) {
    const drops = 6 + Math.round(ok * 10);
    const juice = shade(ev.color, 0.25);
    for (let i = 0; i < drops; i++) {
      const v = ring(i, drops, burst * (0.7 + rand() * 0.9));
      push({ x: ev.x, y: ev.y, vx: v.vx, vy: v.vy - 30, size: 1 + rand() * 1.8, rgb: juice, alpha: 0.6,
        life: 0.35 + rand() * 0.3, maxLife: 0.65, hx: 0, hy: 0, homing: false, key: '', grav: 520, drag: 0.98, kind: 'drop' });
    }
  }

  // BIOMASS motes — coalesce up toward the biomass readout. Count ∝ relative value.
  const motes = 2 + Math.round(rel * 3);
  for (let i = 0; i < motes; i++) {
    const v = ring(i, motes, burst * 0.5);
    push({ x: ev.x, y: ev.y, vx: v.vx, vy: v.vy, size: 2 + rand() * 1.6, rgb: BIOMASS_COL, alpha: 0.95,
      life: 0.9 + rand() * 0.4, maxLife: 1.3, hx: BIOMASS_TARGET.x, hy: BIOMASS_TARGET.y, homing: true, key: '', grav: 0, drag: 0.96, kind: 'mote' });
  }

  // XP shards — home into the killing tower/hero and throb it. Count ∝ relative value.
  const target = killerTarget(ev, rs);
  if (target) {
    const shards = 2 + Math.round(rel * 2);
    for (let i = 0; i < shards; i++) {
      const v = ring(i, shards, burst * 0.55);
      push({ x: ev.x, y: ev.y, vx: v.vx, vy: v.vy, size: 2.2 + rand() * 1.4, rgb: target.rgb, alpha: 0.95,
        life: 1.0 + rand() * 0.4, maxLife: 1.4, hx: target.x, hy: target.y, homing: true, key: target.key, grav: 0, drag: 0.95, kind: 'shard' });
    }
  }

  // ASSIM chunks — coalesce toward the bio-container meter. Count ∝ relative value (lighter stream).
  const assim = 1 + Math.round(rel * 1.5);
  for (let i = 0; i < assim; i++) {
    const v = ring(i, assim, burst * 0.5);
    push({ x: ev.x, y: ev.y, vx: v.vx, vy: v.vy, size: 2 + rand() * 1.4, rgb: ASSIM_COL, alpha: 0.9,
      life: 1.1 + rand() * 0.4, maxLife: 1.5, hx: ASSIM_TARGET.x, hy: ASSIM_TARGET.y, homing: true, key: '', grav: 0, drag: 0.96, kind: 'assim' });
  }
}

/** Seq-ingest the frame's death events (each fires once); resets cleanly when a new run restarts seq. */
export function ingestDeaths(rs: RenderState): void {
  const evs = rs.deathEvents;
  if (evs.length === 0) return;
  const bufMax = evs[evs.length - 1].seq; // append-order ⇒ last is the max
  if (bufMax < lastSeq) { lastSeq = -1; pieces.length = 0; decals.length = 0; throb.clear(); } // a new run restarted the sequence
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
      // spring toward the target: accelerate in, drag, and SNAP when close (feeds the meter/entity)
      const dx = p.hx - p.x, dy = p.hy - p.y, d2 = dx * dx + dy * dy;
      if (d2 < 196 || p.life <= 0) { if (p.key) throb.set(p.key, Math.min(1, (throb.get(p.key) ?? 0) + 0.4)); pieces.splice(i, 1); continue; }
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
  for (const [k, v] of throb) { const nv = v - dt * 2.6; if (nv <= 0.01) throb.delete(k); else throb.set(k, nv); }
}

/** How hard an entity is THROBBING from just-fed XP (0..1). The renderer scales the tower/hero by it. */
export function goreThrob(key: string): number { return throb.get(key) ?? 0; }

/** Floor layer: settled viscera + juice stains, UNDER the living bodies (drawn on the arena floor). */
export function drawGoreFloor(ctx: Ctx): void {
  for (const d of decals) {
    const a = Math.min(0.5, (d.life / d.maxLife) * 0.5);
    ctx.fillStyle = `rgba(${d.rgb},${a})`;
    ctx.beginPath();
    ctx.ellipse(d.x, d.y, d.size * d.sx, d.size * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Above layer: the flying pieces (gibs, juice, coalescing streams), OVER the bodies. */
export function drawGorePieces(ctx: Ctx): void {
  for (const p of pieces) {
    const lf = p.life / p.maxLife;
    const a = p.alpha * Math.min(1, lf * 2); // fade over the last stretch
    const sz = p.homing ? p.size * Math.max(0.45, lf) : p.size; // coalescers shrink as they're absorbed
    if (p.homing) { // a short comet trail behind the head sells the "streaming in"
      ctx.strokeStyle = `rgba(${p.rgb},${a * 0.45})`;
      ctx.lineWidth = sz * 1.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(${p.rgb},${a})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineCap = 'butt';
}
