// INIT CUTSCENE CINEMATICS (docs/GAME-FEEL.md §intro) — five procedural set-pieces
// painted onto a full-screen canvas behind the cold-open copy. Replaces the old
// CSS-gradient staging with the game's own visual DNA: a deep-crust listening post,
// the swarm boiling up a cavern, veins consuming steel, the breathing Hive Core,
// and the title atmosphere. Everything is deterministic (hash-driven, zero
// Math.random at draw time), time-animated, and cheap (≤ a few hundred ops per
// frame); static geometry (strata, vein trees, girders) is lazily cached per
// canvas size so a frame only pays for motion. Render-only — no sim, no save.

import { rgba } from './theme';
import { applyFilmCamera, driftK, drawFilmForeground, filmFx, resolveFilmFx } from './filmDirection';
import type { FilmFx, FilmScene } from './filmDirection';
import type { CutsceneCamera } from '../core/cutscenes';

export type IntroVisual = 'signal' | 'descent' | 'veins' | 'core' | 'title';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

/** Deterministic 0..1 hash — the intro's only "randomness" (replays identically). */
const h01 = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const ease = (x: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

// Palette (the game's hues, tuned dark for cinema).
const CYAN = '122, 209, 255';
const RED = '255, 93, 115';
const EMBER = '255, 122, 71';
const VIRAL = '182, 232, 74';
const STEEL = '110, 132, 158';
const GOLD = '255, 210, 77';
const VIOLET = '201, 139, 255';

// ── Static geometry caches (rebuilt only when the canvas size bucket changes) ──
interface SceneCache {
  key: string;
  strata: { y: number; pts: number[]; shade: number }[];
  cracks: { x: number; w: number; top: number }[];
  swarm: { x: number; lane: number; speed: number; size: number; wob: number }[];
  girders: { x1: number; y1: number; x2: number; y2: number; w: number }[];
  veins: { x1: number; y1: number; x2: number; y2: number; cx: number; cy: number; w: number; at: number; tip: boolean }[];
  spores: { x: number; y: number; z: number; drift: number }[];
}
let cache: SceneCache | null = null;

/** Grow a recursive vein tree from an edge anchor — flattened into draw segments with a
 *  reveal time `at` (0..1), so the takeover visibly CREEPS across the frame. */
function growVein(
  out: SceneCache['veins'], x: number, y: number, ang: number, len: number, w: number, at: number, seed: number, depth: number,
): void {
  if (depth <= 0 || w < 0.6) return;
  const bend = (h01(seed) - 0.5) * 1.4;
  const x2 = x + Math.cos(ang + bend * 0.4) * len;
  const y2 = y + Math.sin(ang + bend * 0.4) * len;
  const cx = x + Math.cos(ang + bend) * len * 0.55;
  const cy = y + Math.sin(ang + bend) * len * 0.55;
  const tip = depth === 1;
  out.push({ x1: x, y1: y, x2, y2, cx, cy, w, at, tip });
  const branches = h01(seed * 1.7) > 0.4 ? 2 : 1;
  for (let b = 0; b < branches; b++) {
    growVein(out, x2, y2, ang + bend * 0.5 + (b - 0.5) * (0.5 + h01(seed + b) * 0.7), len * (0.74 + h01(seed * 2.3 + b) * 0.12), w * 0.72, at + 0.09 + h01(seed + 9 + b) * 0.05, seed * 3.1 + b * 17.7, depth - 1);
  }
}

function buildCache(w: number, h: number): SceneCache {
  const key = `${Math.round(w / 40)}x${Math.round(h / 40)}`;
  if (cache && cache.key === key) return cache;
  // Cavern strata — five jagged silhouette bands, darker as they descend.
  const strata: SceneCache['strata'] = [];
  for (let s = 0; s < 5; s++) {
    const pts: number[] = [];
    const base = h * (0.42 + s * 0.13);
    for (let i = 0; i <= 24; i++) pts.push(base + (h01(s * 31 + i) - 0.5) * h * 0.075 * (1 + s * 0.28));
    strata.push({ y: base, pts, shade: s });
  }
  // Glowing floor cracks the swarm pours through.
  const cracks: SceneCache['cracks'] = [];
  for (let i = 0; i < 7; i++) cracks.push({ x: w * (0.06 + h01(i * 7.3) * 0.88), w: 6 + h01(i * 3.1) * 26, top: h * (0.62 + h01(i * 5.7) * 0.22) });
  // The swarm — 230 risers in three parallax lanes.
  const swarm: SceneCache['swarm'] = [];
  for (let i = 0; i < 230; i++) {
    swarm.push({ x: h01(i * 1.31) * w, lane: i % 3, speed: 0.16 + h01(i * 2.7) * 0.5, size: 1.1 + h01(i * 4.3) * 2.4, wob: h01(i * 6.1) * TAU });
  }
  // Steel superstructure — a doomed lattice of girders.
  const girders: SceneCache['girders'] = [];
  for (let i = 0; i < 6; i++) {
    const gx = w * (0.12 + i * 0.15 + (h01(i * 11.3) - 0.5) * 0.05);
    girders.push({ x1: gx, y1: h * 0.16, x2: gx + (h01(i * 13.7) - 0.5) * w * 0.06, y2: h * 0.9, w: 3 + h01(i * 3.3) * 3 });
  }
  for (let i = 0; i < 5; i++) {
    const gy = h * (0.2 + i * 0.15);
    girders.push({ x1: w * 0.06, y1: gy, x2: w * 0.94, y2: gy + (h01(i * 17.9) - 0.5) * h * 0.05, w: 2 + h01(i * 5.1) * 2.5 });
  }
  // The vein takeover — trees rooted at the lower corners + mid-left edge.
  const veins: SceneCache['veins'] = [];
  growVein(veins, -w * 0.02, h * 0.86, -0.5, w * 0.1, 9, 0, 5.1, 7);
  growVein(veins, w * 1.02, h * 0.78, Math.PI + 0.4, w * 0.09, 8, 0.06, 11.7, 7);
  growVein(veins, w * 0.35, h * 1.04, -Math.PI / 2 + 0.25, h * 0.1, 7, 0.12, 23.3, 6);
  // Title spores — two parallax layers of drifting motes.
  const spores: SceneCache['spores'] = [];
  for (let i = 0; i < 120; i++) spores.push({ x: h01(i * 2.9) * w, y: h01(i * 4.7) * h, z: 0.35 + h01(i * 8.3) * 0.65, drift: h01(i * 12.1) * TAU });
  cache = { key, strata, cracks, swarm, girders, veins, spores };
  return cache;
}

// ── Shared cinema layers ──
function vignette(ctx: Ctx, w: number, h: number, strength: number): void {
  const g = ctx.createRadialGradient(w / 2, h * 0.46, Math.min(w, h) * 0.28, w / 2, h * 0.5, Math.max(w, h) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
function grain(ctx: Ctx, w: number, h: number, t: number, alpha: number): void {
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  const frame = Math.floor(t * 12); // 12fps grain — reads as film, costs nothing
  for (let i = 0; i < 70; i++) {
    ctx.fillRect(h01(i * 3.7 + frame) * w, h01(i * 9.1 + frame * 2) * h, 1, 1);
  }
}

// ── Scene 1 · SIGNAL — the deep-crust listening post reacquires the feed ──
function drawSignal(ctx: Ctx, w: number, h: number, t: number, fx: FilmFx): void {
  const cx = w / 2;
  const cy = h * 0.58;
  const R = Math.min(w, h) * 0.34;
  // MID LAYER on the score: every ping throws a contact ring out of the dish.
  if (fx.age < 1.4) {
    const k = fx.age / 1.4;
    ctx.strokeStyle = rgba(CYAN, 0.55 * (1 - k));
    ctx.lineWidth = 2.5 * (1 - k) + 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, R * (0.08 + k * 1.05), 0, TAU);
    ctx.stroke();
  }
  // Range rings + cardinal ticks — the dish's field of view.
  ctx.lineWidth = 1;
  for (let r = 1; r <= 3; r++) {
    ctx.strokeStyle = rgba(CYAN, 0.1 + 0.03 * r);
    ctx.beginPath();
    ctx.arc(cx, cy, (R * r) / 3, 0, TAU);
    ctx.stroke();
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    ctx.strokeStyle = rgba(CYAN, i % 6 === 0 ? 0.3 : 0.12);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R * 0.97, cy + Math.sin(a) * R * 0.97);
    ctx.lineTo(cx + Math.cos(a) * R * (i % 6 === 0 ? 1.06 : 1.02), cy + Math.sin(a) * R * (i % 6 === 0 ? 1.06 : 1.02));
    ctx.stroke();
  }
  // The sweep — a conic wedge dragging a phosphor tail.
  const sweep = t * 1.1;
  // the phosphor fill behind the beam — a wide fading wake the whole dish lights under
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = rgba(CYAN, 0.2 * (1 - i / 6) * (1 + fx.beat * 0.5));
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, sweep - (i + 1) * 0.16, sweep - i * 0.16);
    ctx.closePath();
    ctx.fill();
  }
  for (let i = 0; i < 20; i++) {
    const a = sweep - i * 0.035;
    ctx.strokeStyle = rgba(CYAN, 0.5 * (1 - i / 20));
    ctx.lineWidth = 2 - i * 0.08;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.stroke();
  }
  // Contact blips — lit when the sweep passes, decaying after. They MULTIPLY over time.
  const blips = 4 + Math.floor(Math.min(14, t * 1.4 + fx.surge * 1.6)); // each ping resolves more contacts
  for (let i = 0; i < blips; i++) {
    const ba = h01(i * 7.7) * TAU;
    const br = R * (0.25 + h01(i * 3.9) * 0.7);
    const since = (sweep - ba) % TAU;
    const glow = Math.min(1, Math.max(0, 1 - (since < 0 ? since + TAU : since) * 0.5) + fx.beat * 0.45);
    if (glow <= 0.02) continue;
    const bx = cx + Math.cos(ba) * br;
    const by = cy + Math.sin(ba) * br;
    ctx.fillStyle = rgba(RED, 0.85 * glow);
    ctx.beginPath();
    ctx.arc(bx, by, 2.4 + glow * 2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(RED, 0.35 * glow);
    ctx.beginPath();
    ctx.arc(bx, by, 6 + (1 - glow) * 10, 0, TAU);
    ctx.stroke();
  }
  // The waveform strip — flatline for a beat, then the signal ERUPTS.
  const wy = h * 0.16;
  const erupt = ease((t - 1.1) / 1.4) * (1 + fx.beat * 0.6);
  ctx.strokeStyle = rgba(CYAN, 0.75);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 4) {
    const ph = x * 0.045 - t * 6;
    const chaos = Math.sin(ph) * 0.55 + Math.sin(ph * 2.7 + 1.3) * 0.3 + Math.sin(ph * 6.1) * 0.15;
    const y = wy + chaos * h * 0.045 * erupt + Math.sin(x * 0.01 + t) * 1.2;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = rgba(CYAN, 0.08);
  ctx.fillRect(0, wy - h * 0.055, w, h * 0.11);
  // Telemetry columns — flickering hex readouts at the edges.
  ctx.font = '9px monospace';
  for (let i = 0; i < 12; i++) {
    const on = h01(i * 3.1 + Math.floor(t * 7)) > 0.35;
    ctx.fillStyle = rgba(CYAN, on ? 0.4 : 0.12);
    ctx.fillText((h01(i * 9.3 + Math.floor(t * 4)) * 0xffff | 0).toString(16).padStart(4, '0').toUpperCase(), w * 0.03, h * 0.3 + i * 13);
    ctx.fillText((h01(i * 5.7 + Math.floor(t * 5)) * 0xffff | 0).toString(16).padStart(4, '0').toUpperCase(), w * 0.91, h * 0.3 + i * 13);
  }
  // Scanlines + a glitch tear timed off the eruption.
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  if (erupt > 0 && h01(Math.floor(t * 9)) > 0.72) {
    const ty = h01(Math.floor(t * 9) * 3.3) * h;
    ctx.drawImage(ctx.canvas, 0, ty, w, 14, (h01(Math.floor(t * 9) * 7.1) - 0.5) * 30, ty, w, 14);
  }
  vignette(ctx, w, h, 0.78);
  grain(ctx, w, h, t, 0.05);
}

// ── Scene 2 · DESCENT — the swarm boils up from below ──
function drawDescent(ctx: Ctx, w: number, h: number, t: number, fx: FilmFx): void {
  const c = buildCache(w, h);
  const rise = ease(t / 4.5) * h * 0.05 + fx.surge * h * 0.012; // slow dolly upward — the crust lurches on every rumble
  // Abyssal glow under everything — the appetite's light, RISING through the scene.
  const swell = ease(t / 7);
  const g = ctx.createRadialGradient(w / 2, h * (1.15 - swell * 0.2), h * 0.1, w / 2, h * (1.05 - swell * 0.2), h * (0.95 + swell * 0.2));
  g.addColorStop(0, rgba(RED, 0.65 + fx.beat * 0.3));
  g.addColorStop(0.5, rgba(RED, 0.22));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Strata silhouettes — the crust being chewed through — with an ember horizon rim
  // above each band so the rock reads against the dark.
  for (const st of c.strata) {
    ctx.strokeStyle = rgba(EMBER, 0.16 - st.shade * 0.02);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < st.pts.length; i++) {
      const px = (i / (st.pts.length - 1)) * w;
      const py = st.pts[i] + rise * (1 + st.shade * 0.35);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.fillStyle = `rgba(${7 + st.shade * 2}, ${4 + st.shade}, ${10 + st.shade * 2}, ${0.6 + st.shade * 0.1})`;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < st.pts.length; i++) ctx.lineTo((i / (st.pts.length - 1)) * w, st.pts[i] + rise * (1 + st.shade * 0.35));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
  // Floor cracks — widening, ember-lit, OVER the rock (the light escaping).
  const widen = 1 + ease(t / 5) * 1.6 + fx.beat * 0.9; // the cracks flare open on the beat
  for (const k of c.cracks) {
    const cg = ctx.createLinearGradient(0, k.top, 0, h);
    cg.addColorStop(0, 'rgba(0,0,0,0)');
    cg.addColorStop(1, rgba(EMBER, 0.7));
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(k.x - (k.w * widen) / 2, h);
    ctx.lineTo(k.x - k.w * 0.12, k.top + rise * 2);
    ctx.lineTo(k.x + k.w * 0.12, k.top + rise * 2);
    ctx.lineTo(k.x + (k.w * widen) / 2, h);
    ctx.closePath();
    ctx.fill();
  }
  // The swarm — IN FRONT of the rock face: ember-lit low, dark red climbing high,
  // banking with their jitter. Three parallax lanes.
  for (const sw of c.swarm) {
    const lane = 0.5 + sw.lane * 0.25; // depth: far lanes slower + dimmer
    const climb = (t * sw.speed * lane * 0.2 + fx.surge * 0.07 * lane + h01(sw.x) * 1.2) % 1.25; // the swarm SURGES on the score
    const y = h * 1.1 - climb * h * 1.15;
    if (y < -10) continue;
    const x = sw.x + Math.sin(t * (1.1 + sw.wob) + sw.wob * 5) * 14 * lane;
    const vx = Math.cos(t * (1.1 + sw.wob) + sw.wob * 5) * 0.4;
    const ang = Math.atan2(-sw.speed, vx);
    const heat = Math.min(1, Math.max(0, (y - h * 0.25) / (h * 0.6))); // 1 low → 0 high
    const alpha = (0.35 + lane * 0.5) * Math.min(1, (h * 1.05 - y) / (h * 0.15));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = rgba(RED, alpha * (0.35 + heat * 0.6));
    ctx.beginPath();
    ctx.ellipse(0, 0, sw.size * lane, sw.size * 2.1 * lane, 0, 0, TAU);
    ctx.fill();
    // ember belly-light on the low fliers — lit from the abyss beneath
    if (heat > 0.35) {
      ctx.fillStyle = rgba(EMBER, alpha * heat * 0.5);
      ctx.beginPath();
      ctx.ellipse(0, sw.size * 0.9 * lane, sw.size * 0.7 * lane, sw.size * 1.1 * lane, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
  // Dust motes drifting in the red light.
  for (let i = 0; i < 40; i++) {
    const y = (h01(i * 5.3) * h + t * (4 + h01(i) * 8)) % h;
    ctx.fillStyle = rgba(EMBER, 0.2 * h01(i * 2.1));
    ctx.fillRect(h01(i * 3.7) * w, y, 1.5, 1.5);
  }
  vignette(ctx, w, h, 0.62);
  grain(ctx, w, h, t, 0.04);
}

// ── Scene 3 · VEINS — steel consumed by the living lattice ──
function drawVeins(ctx: Ctx, w: number, h: number, t: number, fx: FilmFx): void {
  const c = buildCache(w, h);
  const spread = Math.min(1, ease(t / 5.2) * 0.75 + fx.surge * 0.06); // 0..1 takeover — it LUNGES on every beat
  // The doomed superstructure — cool steel, flickering worklights.
  ctx.lineCap = 'round';
  for (let i = 0; i < c.girders.length; i++) {
    const gd = c.girders[i];
    const dying = Math.max(0, spread * 1.4 - h01(i * 7.7) * 0.5);
    const jolt = fx.beat * dying * Math.sin(i * 2.3) * 7; // steel shudders as the snap lands
    ctx.strokeStyle = rgba(STEEL, Math.max(0.12, 0.4 - dying * 0.3));
    ctx.lineWidth = gd.w;
    ctx.beginPath();
    ctx.moveTo(gd.x1 + jolt, gd.y1);
    ctx.lineTo(gd.x2 + jolt, gd.y2);
    ctx.stroke();
    // rivets
    ctx.fillStyle = rgba(STEEL, Math.max(0.1, 0.5 - dying * 0.4));
    for (let r = 0.15; r < 1; r += 0.24) {
      ctx.fillRect(gd.x1 + (gd.x2 - gd.x1) * r - 1, gd.y1 + (gd.y2 - gd.y1) * r - 1, 2, 2);
    }
  }
  // A worklight that browns out as the veins reach it.
  const flick = h01(Math.floor(t * 11)) > spread * 0.9 ? 1 : 0.35;
  const lg = ctx.createRadialGradient(w * 0.5, h * 0.12, 4, w * 0.5, h * 0.12, h * 0.5);
  lg.addColorStop(0, rgba(CYAN, 0.22 * flick * (1 - spread * 0.85))); // the takeover puts the light OUT
  lg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, w, h);
  // The takeover — vein segments reveal in growth order, pulsing as they thicken.
  const pulse = 1 + Math.sin(t * 2.6) * 0.12 + fx.beat * 0.35;
  for (const v of c.veins) {
    const reveal = ease((spread - v.at) / 0.12);
    if (reveal <= 0) continue;
    ctx.strokeStyle = rgba(VIRAL, (0.28 + 0.4 * reveal) * (v.tip ? 1 : 0.85));
    ctx.lineWidth = v.w * reveal * pulse;
    ctx.beginPath();
    ctx.moveTo(v.x1, v.y1);
    // partial growth: trim the segment to the reveal fraction
    const qx = v.cx + (v.x2 - v.cx) * reveal;
    const qy = v.cy + (v.y2 - v.cy) * reveal;
    ctx.quadraticCurveTo(v.cx, v.cy, qx, qy);
    ctx.stroke();
    // tips bloom into pods once fully grown
    if (v.tip && reveal >= 1) {
      const bloom = 1 + Math.sin(t * 3.1 + v.x2) * 0.18;
      ctx.fillStyle = rgba(VIRAL, 0.75);
      ctx.beginPath();
      ctx.arc(v.x2, v.y2, 2.6 * bloom, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba(VIOLET, 0.3);
      ctx.beginPath();
      ctx.arc(v.x2, v.y2, 5.5 * bloom, 0, TAU);
      ctx.fill();
    }
  }
  // Infection light pooling where the veins run thickest.
  // It floods outward as the takeover spreads — the scene's light changes hands.
  const ig = ctx.createRadialGradient(w * 0.25, h * 0.85, 10, w * 0.3, h * 0.85, w * (0.4 + spread * 0.4));
  ig.addColorStop(0, rgba(VIRAL, (0.26 + fx.beat * 0.12) * spread));
  ig.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ig;
  ctx.fillRect(0, 0, w, h);
  vignette(ctx, w, h, 0.72);
  grain(ctx, w, h, t, 0.04);
}

// ── Scene 4 · CORE — the Hive Core breathes, refusing to be eaten ──
function drawCore(ctx: Ctx, w: number, h: number, t: number, fx: FilmFx): void {
  const cx = w / 2;
  const cy = h * 0.52;
  const grow = ease(t / 8); // "the last thing still growing back" — the core swells through the scene
  const R = Math.min(w, h) * 0.16 * (1 + grow * 0.14);
  // Double-thump heartbeat (the game's own cadence).
  const cyc = t % 1.9;
  const beat = Math.max(Math.exp(-cyc * 9) * 0.5, Math.exp(-Math.max(0, cyc - 0.28) * 9) * 0.34);
  const r = R * (1 + beat * 0.25 + fx.beat * 0.07);
  // Chamber glow — warming as the core regrows.
  const bg = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, Math.max(w, h) * (0.5 + grow * 0.15));
  bg.addColorStop(0, rgba(GOLD, 0.16 + grow * 0.14 + beat * 0.18 + fx.beat * 0.12));
  bg.addColorStop(0.35, rgba(EMBER, 0.05 + grow * 0.06));
  bg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  // Roots anchoring the core into the dark below.
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * 0.5 + (i - 3) * 0.32 + Math.sin(t * 0.5 + i) * 0.04;
    ctx.strokeStyle = rgba(EMBER, 0.3 - i * 0.02);
    ctx.lineWidth = 4 - i * 0.35;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8);
    ctx.quadraticCurveTo(
      cx + Math.cos(a) * r * 2.1 + Math.sin(i * 3.1) * 26, cy + Math.sin(a) * r * 1.9,
      cx + Math.cos(a) * r * (3 + h01(i) * 1.6), Math.min(h + 8, cy + Math.sin(a) * r * (3.1 + h01(i * 2.3))),
    );
    ctx.stroke();
  }
  // Emitted pulse rings — one per heartbeat, expanding + fading.
  for (let k = 0; k < 3; k++) {
    const age = ((t + k * 0.633) % 1.9) / 1.9;
    ctx.strokeStyle = rgba(GOLD, 0.34 * (1 - age));
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, r * (1.15 + age * 2.6), 0, TAU);
    ctx.stroke();
  }
  // MID LAYER on the score: each heart/bloom beat throws one wide shockwave of light outward.
  if (fx.age < 1.6) {
    const k = fx.age / 1.6;
    ctx.strokeStyle = rgba(GOLD, 0.42 * (1 - k) * (1 - k));
    ctx.lineWidth = 2 + (1 - k) * 5;
    ctx.beginPath();
    ctx.arc(cx, cy, r * (1 + k * 4.4), 0, TAU);
    ctx.stroke();
  }
  // Membranes — three wobbling organic shells.
  for (let m = 3; m >= 1; m--) {
    const mr = r * (0.66 + m * 0.3);
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * TAU;
      const wob = 1 + Math.sin(a * (2 + m) + t * (1.4 - m * 0.2)) * 0.05;
      const px = cx + Math.cos(a) * mr * wob;
      const py = cy + Math.sin(a) * mr * wob;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = rgba(EMBER, 0.05 + m * 0.02 + beat * 0.03);
    ctx.fill();
    ctx.strokeStyle = rgba(GOLD, 0.14 + beat * 0.1);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // The nucleus itself — molten center + drifting organelles.
  const ng = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.25, 2, cx, cy, r);
  ng.addColorStop(0, 'rgba(255,246,214,0.95)');
  ng.addColorStop(0.45, rgba(GOLD, 0.85));
  ng.addColorStop(1, rgba(EMBER, 0.55));
  ctx.fillStyle = ng;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.62, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    const a = t * (0.5 + h01(i) * 0.4) + i * (TAU / 6);
    ctx.fillStyle = 'rgba(255,250,230,0.5)';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r * 0.36, cy + Math.sin(a) * r * 0.36 * 0.8, 2.2 + h01(i * 3.3) * 1.6, 0, TAU);
    ctx.fill();
  }
  // Motes being GATHERED — spiraling home (regrowth, not decay).
  for (let i = 0; i < 26; i++) {
    const age = 1 - ((t * (0.22 + h01(i) * 0.16) + h01(i * 7.7)) % 1);
    const a = h01(i * 3.1) * TAU + age * 2.4;
    const d = r * (0.9 + age * 3.4);
    ctx.fillStyle = rgba(GOLD, 0.5 * (1 - age));
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.85, 1.6, 0, TAU);
    ctx.fill();
  }
  vignette(ctx, w, h, 0.74);
  grain(ctx, w, h, t, 0.035);
}

// ── Scene 5 · TITLE — atmosphere behind the wordmark ──
function drawTitle(ctx: Ctx, w: number, h: number, t: number, fx: FilmFx): void {
  const c = buildCache(w, h);
  // A vast, dim nucleus looming behind the title.
  const cx = w / 2;
  const cy = h * 0.4;
  const R = Math.min(w, h) * 0.42;
  const breathe = 1 + Math.sin(t * 0.7) * 0.05 + fx.beat * 0.08; // the wordmark's swell lands in the nucleus
  const ng = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * breathe);
  ng.addColorStop(0, rgba(VIOLET, 0.14));
  ng.addColorStop(0.55, rgba(RED, 0.06));
  ng.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ng;
  ctx.fillRect(0, 0, w, h);
  // Aurora bands sweeping slowly — the title gradient cast as light.
  for (let b = 0; b < 3; b++) {
    const bx = w * ((t * 0.024 + b * 0.33) % 1.3 - 0.15);
    const hue = b === 0 ? RED : b === 1 ? VIOLET : CYAN;
    const ag = ctx.createLinearGradient(bx - w * 0.16, 0, bx + w * 0.16, 0);
    ag.addColorStop(0, 'rgba(0,0,0,0)');
    ag.addColorStop(0.5, rgba(hue, 0.08 + fx.beat * 0.05));
    ag.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ag;
    ctx.fillRect(bx - w * 0.16, 0, w * 0.32, h);
  }
  // Spore field — two parallax layers, drifting up-right, twinkling.
  for (const s of c.spores) {
    const x = (s.x + t * 6 * s.z) % w;
    const y = ((s.y - t * 3.4 * s.z - fx.surge * 24 * s.z) % h + h) % h; // the title swell lifts the spore field
    const tw = 0.5 + 0.5 * Math.sin(t * (0.8 + s.z) + s.drift);
    ctx.fillStyle = rgba(s.z > 0.7 ? CYAN : VIOLET, (0.1 + 0.3 * tw) * s.z);
    ctx.beginPath();
    ctx.arc(x, y, 0.8 + s.z * 1.3, 0, TAU);
    ctx.fill();
  }
  vignette(ctx, w, h, 0.66);
  grain(ctx, w, h, t, 0.03);
}

const PAINTERS: Record<IntroVisual, (ctx: Ctx, w: number, h: number, t: number, fx: FilmFx) => void> = {
  signal: drawSignal, descent: drawDescent, veins: drawVeins, core: drawCore, title: drawTitle,
};

/** Slow per-scene CAMERA DRIFT (a Ken Burns push/pan, docs/CUTSCENES.md §direction) — subtle by the
 *  owner's call (2–3 % across the scene's hold): the radar pushes in, the descent falls, the takeover
 *  drifts sideways, the core leans close, the title recedes. A scene row's `camera` overrides. */
const DRIFT: Record<IntroVisual, CutsceneCamera> = {
  signal: { zoom: 0.028, dx: 0, dy: 0.006 },
  descent: { zoom: 0.022, dx: 0, dy: -0.014 },
  veins: { zoom: 0.025, dx: 0.012, dy: 0 },
  core: { zoom: 0.03, dx: 0, dy: 0.004 },
  title: { zoom: -0.025, dx: 0, dy: 0 },
};
/** The particulate foreground's tint per world (each scene's own light). */
const FOREGROUND: Record<IntroVisual, string> = { signal: CYAN, descent: EMBER, veins: VIRAL, core: GOLD, title: VIOLET };

/** One scene under its camera: drift + punch, the painter (its mid layer rides the beats), then the
 *  parallaxed particulate foreground. */
function paintScene(ctx: Ctx, w: number, h: number, visual: IntroVisual, t: number, scene: FilmScene | null, motion: number, flashes: boolean): void {
  const fx = resolveFilmFx(filmFx, scene, t, motion, flashes);
  const cam = scene?.camera ?? DRIFT[visual];
  const k = driftK(scene, t, motion);
  ctx.save();
  applyFilmCamera(ctx, w, h, cam, k, fx.punch);
  PAINTERS[visual](ctx, w, h, t, fx);
  ctx.restore();
  drawFilmForeground(ctx, w, h, t, FOREGROUND[visual], cam, k, fx.punch);
}

/** Paint one cinematic frame: the current scene (under its camera), with the PREVIOUS scene
 *  cross-fading out over its first `fade` (0..1). Fills the full canvas each call (opaque base).
 *  `scene` / `prevScene` carry the film direction (beats, camera, punch — defaults when null);
 *  `motion` 0 is reduced motion: no drift, no punch, no flashes. */
export function drawIntroFrame(
  ctx: Ctx, w: number, h: number,
  visual: IntroVisual, t: number,
  prev: IntroVisual | null, prevT: number, fade: number,
  scene: FilmScene | null = null, prevScene: FilmScene | null = null, motion = 1, flashes = true,
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#030509';
  ctx.fillRect(0, 0, w, h);
  if (prev && fade < 1) {
    ctx.globalAlpha = 1;
    paintScene(ctx, w, h, prev, prevT, prevScene, motion, flashes);
    ctx.fillStyle = `rgba(3,5,9,${ease(fade)})`; // dip the outgoing scene toward black
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = ease(fade);
    paintScene(ctx, w, h, visual, t, scene, motion, flashes);
    ctx.globalAlpha = 1;
  } else {
    paintScene(ctx, w, h, visual, t, scene, motion, flashes);
  }
}

/** THE DESCENT (docs/GAME-FEEL.md §intro→tutorial) — the transition OUT of the film: the camera dives
 *  from the title's looming nucleus down a living tunnel and blooms white-gold into the game. Painted
 *  over the last title frame; `t` runs 0..1 across the dive. Render-only, deterministic. */
export function drawDiveTransition(ctx: Ctx, w: number, h: number, t: number): void {
  const k = Math.min(1, Math.max(0, t));
  const cx = w / 2;
  const cy = h * 0.46;
  const speed = ease(k); // accelerate into the fall
  // The tunnel: concentric membrane rings rushing PAST the camera (born small, flying outward).
  ctx.save();
  for (let i = 0; i < 14; i++) {
    const ring = ((i / 14) + speed * 2.2) % 1; // 0 far → 1 at the lens
    const rr = Math.pow(ring, 2.6) * Math.max(w, h) * 0.95 + 2;
    const alpha = Math.min(0.5, ring * 0.55) * Math.min(1, k * 5);
    ctx.strokeStyle = rgba(i % 3 === 0 ? GOLD : i % 3 === 1 ? EMBER : RED, alpha);
    ctx.lineWidth = 1 + ring * 7;
    ctx.beginPath();
    for (let a = 0; a <= 30; a++) {
      const ang = (a / 30) * TAU;
      const wob = 1 + Math.sin(ang * 5 + i * 2.2 + k * 9) * 0.05;
      const px = cx + Math.cos(ang) * rr * wob;
      const py = cy + Math.sin(ang) * rr * wob * 0.92;
      if (a === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }
  // Speed streaks converging on the destination.
  for (let i = 0; i < 26; i++) {
    const ang = h01(i * 7.7) * TAU;
    const d0 = (h01(i * 3.1) + speed * 1.6) % 1;
    const r1 = Math.pow(d0, 2.2) * Math.max(w, h) * 0.8;
    const r2 = r1 + 30 + speed * 90;
    ctx.strokeStyle = rgba(GOLD, Math.min(0.5, d0 * 0.5) * Math.min(1, k * 4));
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1 * 0.92);
    ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2 * 0.92);
    ctx.stroke();
  }
  ctx.restore();
  // The landing bloom: the last third whites out gold → the next screen fades in from it.
  const bloom = ease((k - 0.62) / 0.38);
  if (bloom > 0) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * (0.2 + bloom * 0.9));
    g.addColorStop(0, `rgba(255,246,214,${bloom})`);
    g.addColorStop(0.6, `rgba(255,210,77,${bloom * 0.85})`);
    g.addColorStop(1, `rgba(255,122,71,${bloom * 0.5})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

/** The still each scene shows under prefers-reduced-motion — a hand-picked beauty frame. */
export const REDUCED_FRAME_T: Record<IntroVisual, number> = {
  signal: 2.6, descent: 3.2, veins: 5.6, core: 0.95, title: 2.2, // veins: the beat-lunged takeover is whole by ~5.5s
};
