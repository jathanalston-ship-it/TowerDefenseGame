// INIT CUTSCENE CINEMATICS (docs/GAME-FEEL.md §intro) — six procedural set-pieces painted onto a
// full-screen canvas behind the cold-open copy, in the game's own visual DNA: a deep-crust listening
// post whose scope floods with contacts, the crust splitting as the game's REAL swarm climbs out of it
// (render/enemyForms — the film's cast is the battlefield's roster), veins taking a steel truss whole,
// the breathing Hive Core, the Hive ANSWERING (real towers erupt along the line, the swarm breaks on it
// and streams home as biomass), and the organism looming behind the title. Everything is deterministic
// (hash-driven, zero Math.random at draw time) and time-animated; static geometry (strata, seams,
// climbers, truss, vein trees, the line) is cached per canvas size so a frame only pays for motion.
// Render-only — no sim, no save. Loaded with the film's own chunk (App lazy-loads ui/InitCutscene).

import { ENEMY_ACCENT, ENEMY_BODY, ENEMY_VARIANT, rgba } from './theme';
import { applyFilmCamera, driftK, drawFilmForeground, filmFx, resolveFilmFx } from './filmDirection';
import type { FilmFx, FilmScene } from './filmDirection';
import { drawEnemyBody } from './enemyForms';
import type { BodyOpts } from './enemyForms';
import { drawTowerForm } from './towerForms';
import { ENEMY_DEFS, TOWER_DEFS } from '../core/config';
import type { CutsceneCamera } from '../core/cutscenes';
import type { EnemyKind, TowerKind } from '../core/types';

export type IntroVisual = 'signal' | 'descent' | 'veins' | 'core' | 'answer' | 'title';

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

/** THE CAST — the film shows the game's REAL roster, drawn by the battlefield's own painters
 *  (render/enemyForms.ts, render/towerForms.ts), so the first thing a player sees is what they will
 *  fight and what they will grow. Data rows: a new face is one entry. */
const SWARM_CAST: readonly EnemyKind[] = ['runner', 'rusher', 'husk', 'scuttler', 'flyer', 'brute'];
const APEX_CAST: EnemyKind = 'apex'; // the appetite itself — the giant that rises past the lens, and the last thing the line breaks
const DEFENDER_CAST: readonly TowerKind[] = ['needle', 'spitfang', 'obelisk', 'maw', 'coil', 'mortar'];
/** The cavern's shadow tone the distant swarm sinks into (depth by colour, not by fog passes). */
const ABYSS: readonly [number, number, number] = [20, 6, 12];

const sinkCache = new Map<string, string>();
/** A cast colour mixed toward the abyss by `k` (0..1) — memoized (cast × depth = a handful of keys). */
function sink(hex: string, k: number): string {
  const key = hex + k;
  const hit = sinkCache.get(key);
  if (hit) return hit;
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw;
  const n = parseInt(full, 16);
  const mix = (v: number, a: number): string => Math.round(v + (a - v) * k).toString(16).padStart(2, '0');
  const out = `#${mix((n >> 16) & 255, ABYSS[0])}${mix((n >> 8) & 255, ABYSS[1])}${mix(n & 255, ABYSS[2])}`;
  sinkCache.set(key, out);
  return out;
}

const castOpts: BodyOpts = { seed: 0, phase: 0, rim: 'rgba(6, 8, 14, 0.55)' }; // reused every draw — no per-frame allocation
/** One cast creature at (x,y), radius r, turned by `heading` (0 = the battlefield's own pose, walking
 *  down the lane; π = climbing up the frame). `walk` 0..1 drives its gait; `emerge` < 1 plays its
 *  archetype's BIRTH intro. save/restore keeps the drawers' own alpha writes off the film's dissolve. */
function drawCreature(
  ctx: Ctx, kind: EnemyKind, x: number, y: number, r: number, t: number, phase: number,
  heading: number, walk: number, color: string, emerge = 1,
): void {
  castOpts.seed = ENEMY_VARIANT[kind];
  castOpts.accent = ENEMY_ACCENT[kind];
  castOpts.phase = phase;
  castOpts.flying = ENEMY_DEFS[kind].behavior?.flying === true;
  castOpts.vx = 0;
  castOpts.vy = walk * 2.2;
  castOpts.emerge = emerge;
  castOpts.flinch = 0;
  ctx.save();
  ctx.translate(x, y);
  if (heading) ctx.rotate(heading);
  drawEnemyBody(ctx, ENEMY_BODY[kind], 0, 0, r, color, t, castOpts);
  ctx.restore();
}
/** A cubic ease-out with overshoot — a defender bursting out of the ground. */
const backOut = (x: number): number => {
  const k = Math.min(1, Math.max(0, x)) - 1;
  return 1 + k * k * (2.6 * k + 1.6);
};

// ── Static geometry caches (rebuilt only when the canvas size bucket changes) ──
interface SceneCache {
  key: string;
  strata: { y: number; pts: number[]; shade: number }[];
  /** SWARM: glowing seams split up through the crust (flat x,y pairs, bottom → top). */
  fissures: { pts: number[]; top: number }[];
  /** SWARM: the cast climbing out of the seams — lane 0 far … 2 near (drawn in that order). */
  climbers: { lane: number; kind: EnemyKind; x0: number; y0: number; delay: number; speed: number; jit: number; phase: number; r: number }[];
  /** TAKE: the doomed truss — columns, bay beams and X-braces; `die` = the takeover level that buckles it. */
  truss: { x1: number; y1: number; x2: number; y2: number; w: number; near: boolean; die: number }[];
  veins: { x1: number; y1: number; x2: number; y2: number; cx: number; cy: number; w: number; at: number; tip: boolean }[];
  /** ANSWER: the defenders erupting along the line, and the swarm they break. */
  defenders: { kind: TowerKind; x: number; y: number; r: number; erupt: number }[];
  raiders: { kind: EnemyKind; x: number; spawn: number; speed: number; killY: number; die: number; r: number; phase: number; shooter: number }[];
  /** TITLE: the looming organism's radial veins. */
  trunks: { a: number; len: number; bend: number; w: number; ph: number }[];
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
  const m = Math.min(w, h);
  const fs = Math.max(m, Math.max(w, h) * 0.55); // cast scale: a tall phone frame still gets readable creatures
  // Cavern strata — five jagged silhouette bands, darker as they descend.
  const strata: SceneCache['strata'] = [];
  for (let s = 0; s < 5; s++) {
    const pts: number[] = [];
    const base = h * (0.42 + s * 0.13);
    for (let i = 0; i <= 24; i++) pts.push(base + (h01(s * 31 + i) - 0.5) * h * 0.075 * (1 + s * 0.28));
    strata.push({ y: base, pts, shade: s });
  }
  // SWARM — seams splitting up through the crust; the cast climbs out of them.
  const fissures: SceneCache['fissures'] = [];
  const nf = w < 600 ? 3 : 5;
  for (let i = 0; i < nf; i++) {
    const top = h * (0.5 + h01(i * 2.7) * 0.14);
    let x = w * (0.08 + (0.84 * (i + 0.5)) / nf + (h01(i * 4.1) - 0.5) * 0.08);
    const pts: number[] = [];
    for (let k = 0; k <= 9; k++) {
      pts.push(x, h * 1.02 - ((h * 1.02 - top) * k) / 9);
      x += (k % 2 ? 1 : -1) * (0.3 + h01(i * 13.3 + k)) * w * 0.016; // a jagged zigzag, not a smooth worm
    }
    fissures.push({ pts, top });
  }
  const climbers: SceneCache['climbers'] = [];
  const lanes = [
    { n: w < 600 ? 34 : 46, from: 0.9, span: 6.0, speed: [0.05, 0.03], r: [0.008, 0.004] }, // far: a distant tide
    { n: w < 600 ? 18 : 22, from: 1.1, span: 5.8, speed: [0.08, 0.04], r: [0.017, 0.006] }, // mid
    { n: w < 600 ? 5 : 7, from: 2.8, span: 4.4, speed: [0.12, 0.06], r: [0.028, 0.01] }, // near: the faces
  ];
  lanes.forEach((L, lane) => {
    for (let i = 0; i < L.n; i++) {
      const s = lane * 97 + i;
      const kind = SWARM_CAST[Math.floor(h01(s * 1.9) * SWARM_CAST.length)];
      const f = fissures[Math.floor(h01(s * 2.3) * nf)];
      const k = Math.min(8, Math.floor(1 + h01(s * 3.7) * 6)); // emerge low on the seam
      const fly = ENEMY_DEFS[kind].behavior?.flying === true ? 1.5 : 1;
      climbers.push({
        lane, kind, x0: f.pts[k * 2], y0: f.pts[k * 2 + 1],
        delay: L.from + (i / L.n) * L.span + h01(s * 8.7) * 0.4,
        speed: (L.speed[0] + h01(s * 4.9) * L.speed[1]) * fly,
        jit: h01(s * 5.3) - 0.5, phase: h01(s * 6.1) * TAU,
        r: fs * (L.r[0] + h01(s * 7.9) * L.r[1]) * (kind === 'brute' ? 1.35 : 1),
      });
    }
  });
  // TAKE — a real truss (columns, bay beams, X-braces) in two depths, buckling as the veins reach it.
  const truss: SceneCache['truss'] = [];
  for (const near of [false, true]) {
    const cols = near ? 6 : 5;
    const top = h * (near ? 0.1 : 0.2);
    const bot = h * (near ? 0.94 : 0.84);
    const xs: number[] = [];
    for (let i = 0; i < cols; i++) {
      xs.push(w * ((near ? 0.06 : 0.14) + ((near ? 0.88 : 0.72) * i) / (cols - 1) + (h01(i * 11.3 + (near ? 0 : 50)) - 0.5) * 0.04));
    }
    const die = (y: number, s: number): number => 0.18 + (1 - y / h) * 0.6 + h01(s) * 0.16; // low steel goes first
    const wCol = near ? 5 : 2.6;
    for (let i = 0; i < cols; i++) truss.push({ x1: xs[i], y1: top, x2: xs[i] + (h01(i * 13.7) - 0.5) * w * 0.02, y2: bot, w: wCol, near, die: die(h * 0.5, i * 3.1 + (near ? 0 : 9)) });
    const levels = near ? [0.24, 0.42, 0.6, 0.78] : [0.3, 0.5, 0.7];
    for (let b = 0; b < cols - 1; b++) {
      for (let l = 0; l < levels.length; l++) {
        const s = b * 7.1 + l * 3.3 + (near ? 0 : 40);
        if (h01(s) < 0.28) continue; // a missing beam — the frame reads as built, not as graph paper
        const y = h * levels[l];
        truss.push({ x1: xs[b], y1: y, x2: xs[b + 1], y2: y + (h01(s * 1.7) - 0.5) * h * 0.02, w: wCol * 0.6, near, die: die(y, s) });
        if (l < levels.length - 1 && h01(s * 2.9) > 0.55) {
          const y2 = h * levels[l + 1];
          truss.push({ x1: xs[b], y1: y, x2: xs[b + 1], y2, w: wCol * 0.4, near, die: die((y + y2) / 2, s * 3.3) });
          truss.push({ x1: xs[b + 1], y1: y, x2: xs[b], y2, w: wCol * 0.4, near, die: die((y + y2) / 2, s * 4.7) });
        }
      }
    }
  }
  // The vein takeover — eight roots (both lower corners, both flanks, the floor, the ceiling); growth
  // order normalised so the whole lattice is taken by the end of the scene's hold.
  const veins: SceneCache['veins'] = [];
  growVein(veins, -w * 0.02, h * 0.86, -0.5, w * 0.1, 9, 0, 5.1, 7);
  growVein(veins, w * 1.02, h * 0.78, Math.PI + 0.4, w * 0.09, 8, 0.06, 11.7, 7);
  growVein(veins, w * 0.35, h * 1.04, -Math.PI / 2 + 0.25, h * 0.1, 7, 0.12, 23.3, 6);
  growVein(veins, w * 0.72, h * 1.04, -Math.PI / 2 - 0.3, h * 0.09, 7, 0.2, 31.9, 6);
  growVein(veins, -w * 0.02, h * 0.3, 0.25, w * 0.08, 6, 0.3, 41.3, 6);
  growVein(veins, w * 0.6, -h * 0.03, Math.PI / 2 + 0.35, h * 0.09, 6, 0.38, 53.7, 6);
  growVein(veins, w * 1.02, h * 0.1, Math.PI * 0.78, w * 0.085, 7, 0.24, 61.1, 7);
  growVein(veins, w * 1.02, h * 0.46, Math.PI + 0.05, w * 0.08, 6, 0.44, 71.9, 6);
  let maxAt = 0;
  for (const v of veins) maxAt = Math.max(maxAt, v.at);
  for (const v of veins) v.at = (v.at / maxAt) * 0.86;
  // ANSWER — the defenders along the line (centre-out eruption order) and the swarm they break.
  const nd = Math.max(3, Math.min(6, Math.round(w / 220)));
  const tr = Math.max(13, Math.min(32, m * 0.042));
  const defenders: SceneCache['defenders'] = [];
  for (let j = 0; j < nd; j++) {
    const x = w * (0.14 + (0.72 * (j + 0.5)) / nd);
    defenders.push({ kind: DEFENDER_CAST[j % DEFENDER_CAST.length], x, y: h * 0.72, r: tr, erupt: 0 });
  }
  [...defenders].sort((p, q) => Math.abs(p.x - w / 2) - Math.abs(q.x - w / 2)).forEach((d, rank) => { d.erupt = 0.85 + rank * 0.3; });
  const raiders: SceneCache['raiders'] = [];
  const nr = Math.max(16, Math.min(34, Math.round(w / 40)));
  // The kill band sits BELOW the copy's upper band: lower on a short (phone-landscape) or tall-narrow frame.
  const killTop = h < 520 ? 0.36 : w < 600 ? 0.3 : 0.22;
  const killSpan = h < 520 ? 0.16 : 0.26;
  for (let i = 0; i < nr; i++) {
    const kind = SWARM_CAST[Math.floor(h01(i * 2.2 + 0.5) * SWARM_CAST.length)];
    const fly = ENEMY_DEFS[kind].behavior?.flying === true ? 1.25 : 1;
    const x = w * (0.08 + h01(i * 3.3) * 0.84);
    const spawn = 2.0 + (i / nr) * 4.6 + h01(i * 5.1) * 0.35;
    const speed = h * (0.13 + h01(i * 7.3) * 0.08) * fly;
    const killY = h * (killTop + h01(i * 9.7) * killSpan);
    let shooter = 0;
    for (let j = 1; j < nd; j++) if (Math.abs(defenders[j].x - x) < Math.abs(defenders[shooter].x - x)) shooter = j;
    raiders.push({
      kind, x, spawn, speed, killY, die: spawn + (killY + h * 0.06) / speed, phase: h01(i * 6.6) * TAU, shooter,
      r: fs * (0.02 + h01(i * 4.4) * 0.012) * (kind === 'brute' ? 1.4 : 1),
    });
  }
  // TITLE — the looming organism's radial veins.
  const trunks: SceneCache['trunks'] = [];
  for (let i = 0; i < 16; i++) {
    trunks.push({ a: ((i + h01(i * 3.7) * 0.6) / 16) * TAU, len: Math.max(w, h) * (0.55 + h01(i * 2.3) * 0.2), bend: (h01(i * 5.3) - 0.5) * 0.9, w: 1 + h01(i * 2.1) * 1.8, ph: h01(i * 8.9) });
  }
  // Title spores — two parallax layers of drifting motes.
  const spores: SceneCache['spores'] = [];
  for (let i = 0; i < 120; i++) spores.push({ x: h01(i * 2.9) * w, y: h01(i * 4.7) * h, z: 0.35 + h01(i * 8.3) * 0.65, drift: h01(i * 12.1) * TAU });
  cache = { key, strata, fissures, climbers, truss, veins, defenders, raiders, trunks, spores };
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
  // THE FLOOD — the last pings resolve the whole scope into contacts: the swarm, before we see it.
  const flood = ease((t - 5.2) / 2.2);
  if (flood > 0) {
    const n = Math.floor(flood * 150);
    for (let i = 0; i < n; i++) {
      const fa = h01(i * 13.1) * TAU;
      const fr = R * (0.1 + Math.sqrt(h01(i * 5.9)) * 0.88);
      const on = 0.35 + 0.5 * h01(i * 2.3 + Math.floor(t * 8));
      ctx.fillStyle = rgba(RED, on * Math.min(1, flood * 2));
      ctx.fillRect(cx + Math.cos(fa) * fr - 1.5, cy + Math.sin(fa) * fr - 1.5, 3, 3);
    }
  }
  // The CONTACT COUNT — climbing by orders of magnitude as the pings land.
  const count = Math.floor(3 * Math.pow(10, Math.max(0, t - 1.4) * 0.62 + fx.surge * 0.04));
  ctx.save();
  ctx.font = `700 ${Math.round(Math.max(10, Math.min(14, w * 0.011)))}px monospace`;
  ctx.textAlign = 'right';
  ctx.fillStyle = rgba(count > 99 ? RED : CYAN, 0.85);
  ctx.fillText(`CONTACTS ${count.toLocaleString('en-US')}`, w * 0.965, h * 0.255);
  ctx.restore();
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

// ── Scene 2 · SWARM — the crust splits and the game's own swarm climbs out of it ──
function drawDescent(ctx: Ctx, w: number, h: number, t: number, fx: FilmFx): void {
  const c = buildCache(w, h);
  const m = Math.min(w, h);
  const rise = ease(t / 4.5) * h * 0.05 + fx.surge * h * 0.012; // slow dolly upward — the crust lurches on every rumble
  // Abyssal glow under everything — the appetite's light, RISING through the scene.
  const swell = ease(t / 7);
  const g = ctx.createRadialGradient(w / 2, h * (1.15 - swell * 0.2), h * 0.1, w / 2, h * (1.05 - swell * 0.2), h * (0.95 + swell * 0.2));
  g.addColorStop(0, rgba(RED, 0.65 + fx.beat * 0.3));
  g.addColorStop(0.5, rgba(RED, 0.22));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Strata silhouettes — the crust being chewed through — with an ember horizon rim.
  for (const st of c.strata) {
    const dy = rise * (1 + st.shade * 0.35);
    ctx.strokeStyle = rgba(EMBER, 0.16 - st.shade * 0.02);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < st.pts.length; i++) {
      const px = (i / (st.pts.length - 1)) * w;
      if (i === 0) ctx.moveTo(px, st.pts[i] + dy);
      else ctx.lineTo(px, st.pts[i] + dy);
    }
    ctx.stroke();
    ctx.fillStyle = `rgba(${7 + st.shade * 2}, ${4 + st.shade}, ${10 + st.shade * 2}, ${0.6 + st.shade * 0.1})`;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < st.pts.length; i++) ctx.lineTo((i / (st.pts.length - 1)) * w, st.pts[i] + dy);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
  // The SEAMS — light escaping up through the rock. They climb as the scene runs and flare on the beat.
  const climb = Math.min(1, 0.35 + ease(t / 3.2) * 0.65);
  const flare = 0.55 + ease(t / 5) * 0.35 + fx.beat * 0.4;
  const dy = rise * 1.6;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  for (let pass = 0; pass < 2; pass++) {
    for (const f of c.fissures) {
      const n = Math.max(2, Math.ceil((f.pts.length / 2) * climb));
      ctx.strokeStyle = pass === 0 ? rgba(EMBER, 0.2 * flare) : rgba(GOLD, 0.7 * flare);
      ctx.lineWidth = pass === 0 ? m * 0.013 * (0.6 + flare * 0.5) : Math.max(1, m * 0.0024);
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        if (k === 0) ctx.moveTo(f.pts[0], f.pts[1] + dy);
        else ctx.lineTo(f.pts[k * 2], f.pts[k * 2 + 1] + dy);
      }
      ctx.stroke();
    }
  }
  // THE SWARM — the game's real creatures birthing out of the seams and climbing the frame, far to
  // near. Depth reads by colour (far ones sink into the abyss tone), size and pace.
  const SINK = [0.8, 0.64, 0.5];
  for (const cl of c.climbers) {
    const age = t - cl.delay;
    if (age <= 0) continue;
    const p = age * cl.speed;
    const y = cl.y0 + dy - p * h;
    if (y < -cl.r * 3) continue;
    const x = cl.x0 + cl.jit * p * w * 0.35 + Math.sin(t * 1.7 + cl.phase) * cl.r * 0.5;
    const sway = Math.cos(t * 1.7 + cl.phase) * 0.18 + cl.jit * 0.5;
    drawCreature(ctx, cl.kind, x, y, cl.r, t, cl.phase, Math.PI + sway, 1, sink(ENEMY_DEFS[cl.kind].color, SINK[cl.lane]), Math.min(1, age / 0.55));
  }
  // THE APPETITE — on the rumble the apex rises past the lens: a silhouette backlit by the abyss.
  const up = ease((t - 3.5) / 1.8);
  if (up > 0) {
    const ar = Math.max(m, Math.max(w, h) * 0.55) * 0.3; // the cast scale (a tall phone frame keeps the giant giant)
    const ax = w * (w < 600 ? 0.5 : 0.7);
    const ay = h + ar * 1.25 - up * ar * 1.05 + Math.sin(t * 1.3) * ar * 0.03;
    const halo = ctx.createRadialGradient(ax, ay, ar * 0.5, ax, ay, ar * 1.7);
    halo.addColorStop(0, rgba(RED, 0.4 * up));
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(ax - ar * 1.7, ay - ar * 1.7, ar * 3.4, ar * 3.4);
    drawCreature(ctx, APEX_CAST, ax, ay, ar, t * 0.6, 1.3, Math.PI, 0.4, sink(ENEMY_DEFS[APEX_CAST].color, 0.62));
    const tint = ctx.createRadialGradient(ax, ay, 0, ax, ay, ar * 1.2); // sink it in the abyss's blood light
    tint.addColorStop(0, '#7a2232');
    tint.addColorStop(0.7, '#a03a4a');
    tint.addColorStop(1, '#ffffff'); // multiply by white = untouched: no hard edge
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = tint;
    ctx.fillRect(ax - ar * 1.2, ay - ar * 1.2, ar * 2.4, ar * 2.4);
    ctx.restore();
    ctx.strokeStyle = rgba(EMBER, 0.45 * up); // rim light off the abyss
    ctx.lineWidth = m * 0.006;
    ctx.beginPath();
    ctx.arc(ax, ay, ar * 0.92, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
  }
  // Embers drifting up in the red light.
  for (let i = 0; i < 40; i++) {
    const y = h - ((h01(i * 5.3) * h + t * (14 + h01(i) * 20)) % h);
    ctx.fillStyle = rgba(EMBER, 0.25 * h01(i * 2.1));
    ctx.fillRect(h01(i * 3.7) * w, y, 1.5, 1.5);
  }
  vignette(ctx, w, h, 0.62);
  grain(ctx, w, h, t, 0.04);
}

// ── Scene 3 · TAKE — steel consumed by the living lattice, all the way ──
function drawVeins(ctx: Ctx, w: number, h: number, t: number, fx: FilmFx): void {
  const c = buildCache(w, h);
  const spread = Math.min(1, ease(t / 6.6) + fx.surge * 0.04); // 0..1 takeover — whole by the end of the hold; it LUNGES on every beat
  // The doomed truss — far frame first (thin, dim), then the near one. Each member BUCKLES (sags,
  // dims, shudders on the snap) once the takeover passes its `die` level.
  ctx.lineCap = 'round';
  for (let i = 0; i < c.truss.length; i++) {
    const gd = c.truss[i];
    const dying = Math.min(1, Math.max(0, (spread - gd.die) / 0.25));
    const jolt = fx.beat * dying * Math.sin(i * 2.3) * (gd.near ? 7 : 3); // steel shudders as the snap lands
    const sag = dying * dying * (gd.near ? 18 : 9) * (0.6 + h01(i * 3.9) * 0.8);
    const base = gd.near ? 0.42 : 0.22;
    ctx.strokeStyle = rgba(STEEL, Math.max(gd.near ? 0.1 : 0.06, base - dying * base * 0.7));
    ctx.lineWidth = gd.w;
    ctx.beginPath();
    ctx.moveTo(gd.x1 + jolt, gd.y1);
    ctx.quadraticCurveTo((gd.x1 + gd.x2) / 2 + jolt, (gd.y1 + gd.y2) / 2 + sag, gd.x2 + jolt, gd.y2 + sag * 0.4);
    ctx.stroke();
    if (dying > 0.35) { // taken steel: the infection runs along the member
      ctx.strokeStyle = rgba(VIRAL, (dying - 0.35) * (gd.near ? 0.5 : 0.3));
      ctx.lineWidth = Math.max(1, gd.w * 0.35);
      ctx.stroke();
    }
    if (gd.near) {
      ctx.fillStyle = rgba(STEEL, Math.max(0.1, 0.5 - dying * 0.4)); // rivets
      for (let r = 0.15; r < 1; r += 0.24) ctx.fillRect(gd.x1 + (gd.x2 - gd.x1) * r - 1, gd.y1 + (gd.y2 - gd.y1) * r - 1 + sag * 0.8, 2, 2);
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
      ctx.fillStyle = rgba(VIOLET, 0.3 + Math.max(0, spread - 0.85) * 3);
      ctx.beginPath();
      ctx.arc(v.x2, v.y2, (5.5 + Math.max(0, spread - 0.85) * 26) * bloom, 0, TAU);
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
  const cy = h * (h < 520 ? 0.28 : 0.52); // a short (phone-landscape) stage lifts the core so its copy keeps the lower band
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

// ── Scene 5 · ANSWER — the Hive grows teeth: defenders erupt, the swarm breaks, the Core feeds ──
// The game's own picture, staged: the Core at the bottom, the line above it, the swarm pouring down
// the lane. Every kill is choreographed off the clock (cache `raiders[].die`), so a frame is pure in t.
const ANSWER = {
  shotS: 0.2, // a tracer's flight before its kill
  feedS: 1.15, // a kill's biomass flight down to the Core
  motes: 4, // biomass motes per kill
  apex: { spawn: 4.6, die: 7.4, fromY: -0.1, toY: 0.44, dx: 0.12, volleyS: 1.1 }, // the last arrival — every tower turns on it; off-centre (dx·w) on wide frames so it never sits on the copy
};
function drawAnswer(ctx: Ctx, w: number, h: number, t: number, fx: FilmFx): void {
  const c = buildCache(w, h);
  const m = Math.min(w, h);
  const cx = w / 2;
  const cy = h * 0.97;
  const lineY = h * 0.58;
  // Fed — the Core swells on every mote that lands (and on the apex's whole body).
  let fed = 0;
  for (const rd of c.raiders) {
    const land = rd.die + ANSWER.feedS;
    if (t >= land) fed += Math.exp(-(t - land) * 3.5);
  }
  const apexLand = ANSWER.apex.die + ANSWER.feedS;
  if (t >= apexLand) fed += 3 * Math.exp(-(t - apexLand) * 1.6);
  fed = Math.min(2.5, fed);
  // The swarm's dark sky above, the Core's light from below.
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.6);
  sky.addColorStop(0, rgba(RED, 0.12));
  sky.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h * 0.6);
  const CR = m * 0.13 * (1 + fed * 0.05 + fx.beat * 0.04);
  const glow = ctx.createRadialGradient(cx, cy, CR * 0.3, cx, cy, Math.max(w, h) * (0.55 + fed * 0.06));
  glow.addColorStop(0, rgba(GOLD, 0.34 + fed * 0.1 + fx.beat * 0.1));
  glow.addColorStop(0.4, rgba(EMBER, 0.1 + fed * 0.03));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  // The line the Hive holds — a faint dashed membrane that flashes as kills land on it.
  let flash = 0;
  for (const rd of c.raiders) if (t >= rd.die && t < rd.die + 0.4) flash = Math.max(flash, 1 - (t - rd.die) / 0.4);
  ctx.setLineDash([10, 9]);
  ctx.strokeStyle = rgba(RED, 0.16 + flash * 0.2);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, lineY);
  ctx.lineTo(w, lineY);
  ctx.stroke();
  ctx.setLineDash([]);
  // Tendrils — the Core reaching out to each defender's footing before it erupts.
  ctx.lineCap = 'round';
  for (const d of c.defenders) {
    const reach = ease((t - (d.erupt - 0.75)) / 0.75);
    if (reach <= 0) continue;
    const kx = d.x * 0.55 + cx * 0.45;
    const ky = d.y + (cy - d.y) * 0.75;
    const ex = kx + (d.x - kx) * reach;
    const ey = ky + (d.y + d.r * 0.7 - ky) * reach;
    ctx.strokeStyle = rgba(EMBER, 0.32 + fed * 0.08);
    ctx.lineWidth = Math.max(2, d.r * 0.32);
    ctx.beginPath();
    ctx.moveTo(cx, cy - CR * 0.5);
    ctx.quadraticCurveTo(kx, ky, ex, ey);
    ctx.stroke();
    ctx.strokeStyle = rgba(GOLD, 0.3);
    ctx.lineWidth = Math.max(1, d.r * 0.08);
    ctx.stroke();
  }
  // The Hive Core — membranes + the molten nucleus, breathing on its double-thump.
  const cyc = t % 1.9;
  const beat = Math.max(Math.exp(-cyc * 9) * 0.5, Math.exp(-Math.max(0, cyc - 0.28) * 9) * 0.34);
  for (let k = 3; k >= 1; k--) {
    ctx.fillStyle = rgba(EMBER, 0.06 + k * 0.025 + beat * 0.04);
    ctx.beginPath();
    ctx.arc(cx, cy, CR * (0.7 + k * 0.28) * (1 + beat * 0.08), Math.PI, TAU);
    ctx.fill();
  }
  const ng = ctx.createRadialGradient(cx, cy - CR * 0.2, 2, cx, cy, CR);
  ng.addColorStop(0, 'rgba(255,246,214,0.95)');
  ng.addColorStop(0.5, rgba(GOLD, 0.85));
  ng.addColorStop(1, rgba(EMBER, 0.4));
  ctx.fillStyle = ng;
  ctx.beginPath();
  ctx.arc(cx, cy, CR * (0.66 + beat * 0.1), Math.PI, TAU);
  ctx.fill();
  // The defenders: a seam glows under each, then it ERUPTS (back-out pop, a ring, clods thrown).
  const fire = answerFire(c, t);
  for (let j = 0; j < c.defenders.length; j++) {
    const d = c.defenders[j];
    const pre = (t - (d.erupt - 0.4)) / 0.4;
    if (pre <= 0) continue;
    if (t < d.erupt) {
      ctx.fillStyle = rgba(GOLD, 0.5 * pre);
      ctx.beginPath();
      ctx.ellipse(d.x, d.y + d.r * 0.7, d.r * 0.9 * pre, d.r * 0.22 * pre, 0, 0, TAU);
      ctx.fill();
      continue;
    }
    const k = (t - d.erupt) / 0.5;
    if (k < 1) {
      ctx.strokeStyle = rgba(GOLD, 0.7 * (1 - k));
      ctx.lineWidth = 2 + (1 - k) * 4;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y + d.r * 0.6, d.r * (1 + k * 2.4), d.r * (0.3 + k * 0.7), 0, 0, TAU);
      ctx.stroke();
    }
    const tc = t - d.erupt;
    if (tc < 0.9) {
      for (let q = 0; q < 7; q++) { // clods: ballistic, deterministic
        const vx = (h01(j * 9.1 + q) - 0.5) * d.r * 7;
        const vy = d.r * (5 + h01(j * 4.3 + q) * 5);
        ctx.fillStyle = rgba(q % 2 ? EMBER : '60, 30, 36', 0.85 * (1 - tc / 0.9));
        ctx.fillRect(d.x + vx * tc - 1.5, d.y + d.r * 0.5 - vy * tc + d.r * 12 * tc * tc - 1.5, 3, 3);
      }
    }
    const s = backOut(k * 1.1);
    drawTowerForm(ctx, d.kind, d.x, d.y, d.r * s, TOWER_DEFS[d.kind].color, t, fire[j], 1 + Math.sin(t * 2 + j) * 0.02);
  }
  // The swarm pours down the lane — fading in out of the dark — and dies on the line.
  for (const rd of c.raiders) {
    if (t < rd.spawn || t > rd.die + 0.32) continue;
    if (t < rd.die) {
      const y = -h * 0.06 + (t - rd.spawn) * rd.speed;
      const x = rd.x + Math.sin(t * 2.1 + rd.phase) * rd.r * 0.4;
      drawCreature(ctx, rd.kind, x, y, rd.r, t, rd.phase, 0, 1, ENEMY_DEFS[rd.kind].color);
      // the shot that kills it — a tracer from the nearest defender, landing on the death frame
      const ts = (t - (rd.die - ANSWER.shotS)) / ANSWER.shotS;
      if (ts > 0) answerTracer(ctx, c.defenders[rd.shooter], x, y, ts);
    } else {
      answerBurst(ctx, rd.x, rd.killY, rd.r, (t - rd.die) / 0.32, ENEMY_DEFS[rd.kind].color);
    }
  }
  // The apex — the last thing down the lane. Every defender turns on it; it breaks; the Core drinks it.
  const A = ANSWER.apex;
  const apx = cx + (w >= 600 ? A.dx * w : 0);
  if (t >= A.spawn && t < A.die + 0.5) {
    const ar = Math.max(m, Math.max(w, h) * 0.55) * 0.085;
    const ay = h * (A.fromY + (A.toY - A.fromY) * ease((Math.min(t, A.die) - A.spawn) / (A.die - A.spawn)));
    if (t < A.die) {
      drawCreature(ctx, APEX_CAST, apx, ay, ar, t, 0.7, 0, 0.7, sink(ENEMY_DEFS[APEX_CAST].color, 0.35));
      const v = (t - (A.die - A.volleyS)) / A.volleyS;
      if (v > 0) {
        for (const d of c.defenders) answerTracer(ctx, d, apx + Math.sin(d.x) * ar * 0.4, ay, (v * 4 + h01(d.x)) % 1);
      }
    } else {
      answerBurst(ctx, apx, ay, ar * 1.3, (t - A.die) / 0.5, ENEMY_DEFS[APEX_CAST].color);
    }
  }
  // The swarm arrives out of the dark: a falling shroud over the top of the lane.
  const shroud = ctx.createLinearGradient(0, 0, 0, h * 0.2);
  shroud.addColorStop(0, 'rgba(3,5,9,0.96)');
  shroud.addColorStop(1, 'rgba(3,5,9,0)');
  ctx.fillStyle = shroud;
  ctx.fillRect(0, 0, w, h * 0.2);
  // Biomass — every kill streams home to the Core in gold motes.
  for (const rd of c.raiders) answerFeed(ctx, rd.x, rd.killY, cx, cy - CR * 0.4, t - rd.die, ANSWER.motes, rd.phase);
  answerFeed(ctx, apx, h * A.toY, cx, cy - CR * 0.4, t - A.die, 14, 2.1);
  vignette(ctx, w, h, 0.6);
  grain(ctx, w, h, t, 0.035);
}
const answerFireBuf: number[] = [];
/** Each defender's muzzle pulse (0..1) from the shots it has fired — reused buffer, no allocation. */
function answerFire(c: SceneCache, t: number): number[] {
  answerFireBuf.length = c.defenders.length;
  answerFireBuf.fill(0);
  for (const rd of c.raiders) {
    const since = t - (rd.die - ANSWER.shotS);
    if (since >= 0 && since < 0.5) answerFireBuf[rd.shooter] = Math.max(answerFireBuf[rd.shooter], Math.exp(-since * 9));
  }
  const v = t - (ANSWER.apex.die - ANSWER.apex.volleyS);
  if (v >= 0 && t < ANSWER.apex.die) for (let j = 0; j < answerFireBuf.length; j++) answerFireBuf[j] = Math.max(answerFireBuf[j], 0.6 + 0.4 * Math.abs(Math.sin(t * 22 + j)));
  return answerFireBuf;
}
/** A defender's shot: a bright head flying muzzle → target over k 0..1, a fading trail behind it. */
function answerTracer(ctx: Ctx, d: SceneCache['defenders'][number], tx: number, ty: number, k: number): void {
  const mx = d.x;
  const my = d.y - d.r * 0.85;
  const hx = mx + (tx - mx) * k;
  const hy = my + (ty - my) * k;
  const tk = Math.max(0, k - 0.35);
  const col = TOWER_DEFS[d.kind].color;
  const ga = ctx.globalAlpha;
  ctx.strokeStyle = col;
  ctx.globalAlpha = ga * 0.55;
  ctx.lineWidth = Math.max(1.5, d.r * 0.12);
  ctx.beginPath();
  ctx.moveTo(mx + (tx - mx) * tk, my + (ty - my) * tk);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.globalAlpha = ga;
  ctx.fillStyle = 'rgba(255,250,235,0.95)';
  ctx.beginPath();
  ctx.arc(hx, hy, Math.max(1.6, d.r * 0.11), 0, TAU);
  ctx.fill();
}
/** A kill, k 0..1 over ~0.3 s: a hot flash, a tight ring and shards in the creature's colour. */
function answerBurst(ctx: Ctx, x: number, y: number, r: number, k: number, color: string): void {
  if (k >= 1) return;
  const a = ctx.globalAlpha;
  const f = 1 - k;
  ctx.globalAlpha = a * f * 0.8;
  ctx.fillStyle = 'rgba(255,244,220,1)';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.85 * f, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = a * f * f;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5 + f * 3;
  ctx.beginPath();
  ctx.arc(x, y, r * (0.5 + ease(k) * 1.1), 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = a * f;
  ctx.fillStyle = color;
  for (let q = 0; q < 6; q++) {
    const ang = (q / 6) * TAU + r;
    const d = r * (0.3 + ease(k) * 1.5);
    ctx.fillRect(x + Math.cos(ang) * d - 2, y + Math.sin(ang) * d - 2, 4, 4);
  }
  ctx.globalAlpha = a;
}
/** A kill's biomass: `n` gold motes curving from the kill to the Core over ANSWER.feedS (`since` = s after the kill). */
function answerFeed(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, since: number, n: number, seed: number): void {
  if (since < 0 || since > ANSWER.feedS + 0.1) return;
  for (let q = 0; q < n; q++) {
    const k = Math.min(1, Math.max(0, (since - q * 0.05) / ANSWER.feedS));
    if (k <= 0 || k >= 1) continue;
    const e = k * k; // gathering speed as it falls home
    const bow = (h01(seed * 7.3 + q) - 0.5) * 0.6 * Math.abs(x1 - x0 + 60);
    const x = x0 + (x1 - x0) * e + Math.sin(k * Math.PI) * bow;
    const y = y0 + (y1 - y0) * e;
    ctx.fillStyle = rgba(GOLD, 0.22);
    ctx.beginPath();
    ctx.arc(x, y, 5 + (1 - k) * 2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgba(GOLD, 0.9 - k * 0.3);
    ctx.beginPath();
    ctx.arc(x, y, 2.2 + (1 - k) * 1.4, 0, TAU);
    ctx.fill();
  }
}

// ── Scene 6 · TITLE — the organism you now are, looming behind the wordmark ──
function drawTitle(ctx: Ctx, w: number, h: number, t: number, fx: FilmFx): void {
  const c = buildCache(w, h);
  const cx = w / 2;
  const cy = h * 0.44;
  const R = Math.min(w, h) * 0.44;
  // A slow double-thump (the Core's cadence, slowed to rest) + the wordmark's swell on its beat.
  const cyc = t % 2.4;
  const hb = Math.max(Math.exp(-cyc * 7) * 0.6, Math.exp(-Math.max(0, cyc - 0.3) * 7) * 0.4);
  const breathe = 1 + Math.sin(t * 0.7) * 0.03 + hb * 0.04 + fx.beat * 0.06;
  const ng = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.2 * breathe);
  ng.addColorStop(0, rgba(VIOLET, 0.2 + hb * 0.06));
  ng.addColorStop(0.5, rgba(RED, 0.07));
  ng.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ng;
  ctx.fillRect(0, 0, w, h);
  // Its veins — radial trunks reaching to the frame edges, a pulse travelling out along each.
  ctx.lineCap = 'round';
  for (const tr of c.trunks) {
    const x0 = cx + Math.cos(tr.a) * R * 0.5 * breathe;
    const y0 = cy + Math.sin(tr.a) * R * 0.5 * breathe;
    const x2 = cx + Math.cos(tr.a) * tr.len;
    const y2 = cy + Math.sin(tr.a) * tr.len;
    const qx = cx + Math.cos(tr.a + tr.bend) * tr.len * 0.55;
    const qy = cy + Math.sin(tr.a + tr.bend) * tr.len * 0.55;
    ctx.strokeStyle = rgba(VIOLET, 0.1 + hb * 0.04);
    ctx.lineWidth = tr.w;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(qx, qy, x2, y2);
    ctx.stroke();
    const u = (t * 0.32 + tr.ph) % 1;
    const iu = 1 - u;
    ctx.fillStyle = rgba(u < 0.5 ? RED : VIOLET, 0.55 * iu);
    ctx.beginPath();
    ctx.arc(iu * iu * x0 + 2 * iu * u * qx + u * u * x2, iu * iu * y0 + 2 * iu * u * qy + u * u * y2, 1.4 + tr.w * 0.6, 0, TAU);
    ctx.fill();
  }
  // Its membranes — four wobbling shells, breathing.
  for (let k = 0; k < 4; k++) {
    const mr = R * (0.5 + k * 0.17) * breathe;
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * TAU;
      const wob = 1 + Math.sin(a * (3 + k) + t * (0.9 - k * 0.12) + k) * 0.035;
      const px = cx + Math.cos(a) * mr * wob;
      const py = cy + Math.sin(a) * mr * wob * 0.92;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = rgba(k % 2 ? RED : VIOLET, 0.018);
    ctx.fill();
    ctx.strokeStyle = rgba(k % 2 ? RED : VIOLET, 0.07 + (3 - k) * 0.03 + hb * 0.05);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  // The wordmark lands: one shockwave out of the organism on the title beat.
  if (fx.age < 2) {
    const k = fx.age / 2;
    ctx.strokeStyle = rgba(VIOLET, 0.4 * (1 - k) * (1 - k));
    ctx.lineWidth = 1.5 + (1 - k) * 4;
    ctx.beginPath();
    ctx.arc(cx, cy, R * (0.4 + ease(k) * 1.4), 0, TAU);
    ctx.stroke();
  }
  // Motes being GATHERED — the hive drawing everything in.
  for (let i = 0; i < 36; i++) {
    const age = 1 - ((t * (0.12 + h01(i) * 0.1) + h01(i * 7.7)) % 1);
    const a = h01(i * 3.1) * TAU + age * 1.8;
    const d = R * (0.35 + age * 1.6);
    ctx.fillStyle = rgba(i % 3 ? VIOLET : CYAN, 0.45 * (1 - age) * Math.min(1, age * 4));
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.9, 1.5, 0, TAU);
    ctx.fill();
  }
  // Spore field — two parallax layers, drifting up-right, twinkling.
  for (const s of c.spores) {
    const x = (s.x + t * 6 * s.z) % w;
    const y = ((s.y - t * 3.4 * s.z - fx.surge * 24 * s.z) % h + h) % h; // the title swell lifts the spore field
    const tw = 0.5 + 0.5 * Math.sin(t * (0.8 + s.z) + s.drift);
    ctx.fillStyle = rgba(s.z > 0.7 ? CYAN : VIOLET, (0.08 + 0.24 * tw) * s.z);
    ctx.beginPath();
    ctx.arc(x, y, 0.8 + s.z * 1.3, 0, TAU);
    ctx.fill();
  }
  vignette(ctx, w, h, 0.66);
  grain(ctx, w, h, t, 0.03);
}

const PAINTERS: Record<IntroVisual, (ctx: Ctx, w: number, h: number, t: number, fx: FilmFx) => void> = {
  signal: drawSignal, descent: drawDescent, veins: drawVeins, core: drawCore, answer: drawAnswer, title: drawTitle,
};

/** Slow per-scene CAMERA DRIFT (a Ken Burns push/pan, docs/CUTSCENES.md §direction) — subtle by the
 *  owner's call (2–3 % across the scene's hold): the radar pushes in, the descent falls, the takeover
 *  drifts sideways, the core leans close, the title recedes. A scene row's `camera` overrides. */
const DRIFT: Record<IntroVisual, CutsceneCamera> = {
  signal: { zoom: 0.028, dx: 0, dy: 0.006 },
  descent: { zoom: 0.022, dx: 0, dy: -0.014 },
  veins: { zoom: 0.025, dx: 0.012, dy: 0 },
  core: { zoom: 0.03, dx: 0, dy: 0.004 },
  answer: { zoom: 0.022, dx: 0, dy: 0.008 },
  title: { zoom: -0.025, dx: 0, dy: 0 },
};
/** The particulate foreground's tint per world (each scene's own light). */
const FOREGROUND: Record<IntroVisual, string> = { signal: CYAN, descent: EMBER, veins: VIRAL, core: GOLD, answer: GOLD, title: VIOLET };

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
  // descent: the seams lit, the swarm climbing, the apex risen · veins: the takeover near-whole ·
  // answer: the line built, every tower on the apex, kills streaming home · title: after its shockwave
  signal: 6.4, descent: 6.2, veins: 6.0, core: 0.95, answer: 7.0, title: 3.2,
};
