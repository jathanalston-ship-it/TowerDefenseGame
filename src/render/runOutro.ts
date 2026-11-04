// RUN OUTRO FX — docs/SIGNATURE-MOMENTS.md §2 "Victory carries into Results".
//
// The run has ended; this is pure presentation (nothing here is read by the sim — goldens stay
// byte-identical). GameView drives it from its outro clock (wall-clock `now`, never sim time):
//   runOutro.begin(won, now, rs, canvas) → runOutro.frame(ctx, now) each frame → runOutro.holdMs(won)
//   → runOutro.capture() at the hand-off (the Results backdrop) → runOutro.end() on unmount.
//
//   • VICTORY — the Living Battlefield's terraform washes outward from the Hive Core to the board
//     edges. It reuses the SAME bake (livingBattlefield.bakeAssimilatedBoard: the board as it looks
//     fully assimilated), revealed by a growing clip under the entities (renderer hook
//     drawVictoryWash), tinted the biome accent, with a soft wavefront riding its edge.
//   • DEFEAT — its own grammar: the board drains of colour and cracks spread from the breach point
//     (the Core's surface facing the attacker nearest it), painted over the finished frame.
//   • HAND-OFF — the last beat eases the board into Results' look (CSS: blur + dim, see index.css
//     §S2), then one small JPEG snapshot + the board's on-screen rect go to Results through App's
//     last-run state, which drops it when Results goes (no object URLs, nothing retained here).
//   • Reduced motion (viewFeel.motion = 0): no wash / spreading — the end state is shown at once
//     (fully washed, or drained + cracked), same text; the backdrop still lands.
//
// Per-frame cost is two clipped drawImage blits + three arc strokes (victory) or one blend fill + one
// clipped blit (defeat); every colour string is resolved at begin() — zero per-frame allocation.

import type { RenderState } from '../core/game';
import { HEIGHT, WIDTH, nucleusPoint } from '../core/map';
import { HIVE } from '../core/config';
import { viewFeel } from './feel';
import { bakeAssimilatedBoard, getAssimilationDebug, isLivingBattlefieldEnabled, resolveAccent } from './livingBattlefield';
import type { Bake } from './livingBattlefield';
import { isDebugEnabled } from '../debug/debug';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

// ── Tunables (the owner's taste calls — one table) ──────────────────────────────────────────────
// The Results backdrop's blur + brightness live beside the CSS that applies them (index.css §S2:
// --rb-blur 8px, --rb-dim 0.4), shared by the in-run settle beat and Results.
export interface OutroTable {
  /** Battlefield linger before Results (ms). VICTORY is shorter now the wash carries the moment. */
  holdMs: { won: number; lost: number; reduced: number };
  wash: {
    ms: number; // Hive Core → farthest board corner
    /** 'biome' = the biome accent · 'tier' = the Assimilation tier accent · or a literal '#rrggbb'. */
    tint: string;
    tintAlpha: number; // accent laid over the assimilated ground
    groundAlpha: number; // the bake's flesh layer
    glowAlpha: number; // its vein/glint layer
    pulse: number; // 0..1 heartbeat depth on the glow once the board is the hive's (full motion only)
    front: { width: number; alpha: number }[]; // the wavefront: layered strokes, outer → core (px, 0..1)
  };
  defeat: {
    ms: number; // cracks reach full length
    drainMs: number; // colour drains out (faster than the cracks)
    desaturate: number; // 0..1 colour removed
    darken: number; // 0..1 extra dim
    colour: string; // the Nucleus's light bleeding through the fissures
    fissures: number; // main cracks fanned from the breach
    fan: number; // half-angle of the fan (rad), aimed at the board centre
    step: [number, number]; // segment length range (px)
    jitter: number; // heading wobble per segment (rad)
    branch: number; // chance a segment forks (depth ≤ 2)
    width: number; // fissure width at the breach (px)
  };
  /** Snapshot for the Results backdrop: scale of the 720×960 board + JPEG quality. It is shown
   *  blurred, so a third of the board's resolution is indistinguishable and ~20 KB. */
  snapshot: { scale: number; quality: number };
  /** The last beat of the hold eases the live board into Results' blur/dim (ms; full motion only). */
  settleMs: number;
}

export const OUTRO: OutroTable = {
  holdMs: { won: 2400, lost: 3400, reduced: 1200 },
  wash: {
    ms: 1400,
    tint: 'biome',
    tintAlpha: 0.1,
    groundAlpha: 0.9,
    glowAlpha: 0.8,
    pulse: 0.35,
    front: [{ width: 70, alpha: 0.08 }, { width: 30, alpha: 0.16 }, { width: 11, alpha: 0.36 }, { width: 3.5, alpha: 0.9 }],
  },
  defeat: {
    ms: 1500,
    drainMs: 900,
    desaturate: 0.88,
    darken: 0.2,
    colour: '#ff5d73',
    fissures: 7,
    fan: 1.75,
    step: [16, 32],
    jitter: 0.55,
    branch: 0.11,
    width: 5,
  },
  snapshot: { scale: 0.34, quality: 0.8 },
  settleMs: 350,
};

/** What Results needs to paint the run's last frame behind itself. `rect` is the board's on-screen
 *  box at capture, as fractions of the viewport (`aspect` = its width/height then) — Results lays the
 *  board back exactly there while the viewport keeps that shape, else contain-fits it. */
export interface RunBackdropImage {
  src: string;
  rect: { x: number; y: number; w: number; h: number };
  aspect: number;
}

// ── Pure helpers (derive*) ──────────────────────────────────────────────────────────────────────
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 2.4);
const smooth = (t: number): number => t * t * (3 - 2 * t);
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Farthest board corner from a point — the radius a wave needs to cover the whole board. */
export function reachFrom(x: number, y: number): number {
  return Math.max(Math.hypot(x, y), Math.hypot(WIDTH - x, y), Math.hypot(x, HEIGHT - y), Math.hypot(WIDTH - x, HEIGHT - y));
}

/** The breach point: the Hive Core's surface facing the attacker nearest it (the bite the run died
 *  to); the Core's centre when nothing is left standing. */
export function breachPoint(rs: Pick<RenderState, 'enemies'>): { x: number; y: number } {
  let best = Infinity, bx = 0, by = 0;
  for (const e of rs.enemies) {
    const d = Math.hypot(e.x - nucleusPoint.x, e.y - nucleusPoint.y);
    if (d < best) { best = d; bx = e.x; by = e.y; }
  }
  if (!Number.isFinite(best) || best < 1) return { x: nucleusPoint.x, y: nucleusPoint.y };
  const r = Math.min(HIVE.coreRadius, best);
  return { x: nucleusPoint.x + ((bx - nucleusPoint.x) / best) * r, y: nucleusPoint.y + ((by - nucleusPoint.y) / best) * r };
}

/** Crack geometry from a breach point: flat [x0, y0, x1, y1, width] runs. Deterministic per origin
 *  (a seeded hash walk, never Math.random) — the same death cracks the same way, and tests can pin it. */
export function deriveCracks(ox: number, oy: number, reach: number, d = OUTRO.defeat): number[] {
  let seed = ((Math.round(ox) * 73856093) ^ (Math.round(oy) * 19349663) ^ 0x2545f491) >>> 0;
  const rnd = (): number => { // mulberry32
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: number[] = [];
  const walk = (x: number, y: number, ang: number, len: number, w: number, depth: number): void => {
    const heading = ang;
    let travelled = 0;
    while (travelled < len) {
      const step = d.step[0] + rnd() * (d.step[1] - d.step[0]);
      ang += (rnd() - 0.5) * d.jitter + (heading - ang) * 0.3; // wander, but keep the fissure's line
      const nx = x + Math.cos(ang) * step, ny = y + Math.sin(ang) * step;
      const ww = 0.6 + w * (1 - travelled / len);
      out.push(x, y, nx, ny, ww);
      if (depth < 2 && rnd() < d.branch) {
        walk(nx, ny, ang + (rnd() < 0.5 ? -1 : 1) * (0.45 + rnd() * 0.5), (len - travelled) * (0.3 + rnd() * 0.35), ww * 0.7, depth + 1);
      }
      x = nx; y = ny; travelled += step;
      if (x < -24 || x > WIDTH + 24 || y < -24 || y > HEIGHT + 24) break;
    }
  };
  const aim = Math.atan2(HEIGHT / 2 - oy, WIDTH / 2 - ox); // fan toward the board, not off its edge
  for (let i = 0; i < d.fissures; i++) {
    const f = d.fissures > 1 ? i / (d.fissures - 1) : 0.5;
    const ang = aim - d.fan + f * d.fan * 2 + (rnd() - 0.5) * 0.25;
    walk(ox, oy, ang, reach * (0.5 + rnd() * 0.45), d.width * (0.75 + rnd() * 0.5), 0);
  }
  return out;
}

function hexOf(c: [number, number, number]): string {
  const h = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}

// ── Module state (one live outro at a time — GameView owns it) ───────────────────────────────────
const st = {
  active: false,
  won: false,
  startedAt: 0,
  t: 0, // 0..1 wash / crack progress
  now: 0, // the outro clock's latest wall-clock ms (drives the glow heartbeat)
  settled: false,
  canvas: null as HTMLCanvasElement | null, // the live board this outro belongs to (spectate never matches)
  root: null as HTMLElement | null, // GameView's .game root — carries data-outro for the CSS beats
  ox: 0,
  oy: 0,
  reach: 0,
  wash: null as Bake | null,
  tint: '#ffffff',
  front: [] as string[], // wavefront stroke colours, resolved once
  cracks: null as HTMLCanvasElement | null,
  costMs: 0, // dev probe: summed ms spent in frame() + drawVictoryWash()
  costFrames: 0,
};

/** VICTORY tint source → an accent string livingBattlefield.resolveAccent understands. */
function washAccent(rs: RenderState): string {
  const src = OUTRO.wash.tint;
  if (src === 'tier') { const a = getAssimilationDebug(); return a ? hexOf(a.tierColor) : rs.biome.accent; }
  if (src === 'biome') return rs.biome.accent;
  return src;
}

function bakeCracks(ox: number, oy: number, reach: number): HTMLCanvasElement {
  // ≤ 1.5× the sim resolution: crisp enough under the glow, ≤ ~6 MB transient even on a 3× phone.
  const s = Math.min(1.5, Math.max(1, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1));
  const c = document.createElement('canvas');
  c.width = Math.round(WIDTH * s);
  c.height = Math.round(HEIGHT * s);
  const g = c.getContext('2d')!;
  g.scale(s, s);
  const segs = deriveCracks(ox, oy, reach);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // the wound at the breach
  const wound = g.createRadialGradient(ox, oy, 0, ox, oy, 46);
  wound.addColorStop(0, 'rgba(255, 93, 115, 0.55)');
  wound.addColorStop(1, 'rgba(255, 93, 115, 0)');
  g.fillStyle = wound;
  g.fillRect(ox - 46, oy - 46, 92, 92);
  g.strokeStyle = 'rgba(5, 2, 5, 0.9)'; // the split ground
  for (let i = 0; i < segs.length; i += 5) {
    g.lineWidth = segs[i + 4] + 2.2;
    g.beginPath(); g.moveTo(segs[i], segs[i + 1]); g.lineTo(segs[i + 2], segs[i + 3]); g.stroke();
  }
  g.strokeStyle = OUTRO.defeat.colour; // the Nucleus's light bleeding through
  g.shadowColor = OUTRO.defeat.colour;
  g.shadowBlur = 7;
  for (let i = 0; i < segs.length; i += 5) {
    g.lineWidth = Math.max(0.6, segs[i + 4] * 0.42);
    g.beginPath(); g.moveTo(segs[i], segs[i + 1]); g.lineTo(segs[i + 2], segs[i + 3]); g.stroke();
  }
  return c;
}

function begin(won: boolean, now: number, rs: RenderState, canvas: HTMLCanvasElement | null): void {
  end();
  st.active = true;
  st.won = won;
  st.startedAt = now;
  st.t = 0;
  st.settled = false;
  st.canvas = canvas;
  const o = won ? nucleusPoint : breachPoint(rs);
  st.ox = o.x;
  st.oy = o.y;
  st.reach = reachFrom(o.x, o.y);
  if (typeof document === 'undefined' || !canvas) return; // headless: the clock still runs
  st.root = canvas.closest('.game');
  if (st.root) {
    st.root.dataset.outro = won ? 'won' : 'lost';
    // The run-end veil spotlights the BOARD's rect (not the viewport centre) so the wash / cracks stay in view.
    const r = canvas.getBoundingClientRect();
    st.root.style.setProperty('--outro-x', `${r.left}px`);
    st.root.style.setProperty('--outro-y', `${r.top}px`);
    st.root.style.setProperty('--outro-w', `${r.width}px`);
    st.root.style.setProperty('--outro-h', `${r.height}px`);
    st.root.style.setProperty('--outro-settle', `${OUTRO.settleMs}ms`);
  }
  if (won) {
    const a = getAssimilationDebug();
    const accent = washAccent(rs);
    st.wash = a && isLivingBattlefieldEnabled() ? bakeAssimilatedBoard(a, rs.biome.id, accent) : null;
    const col = resolveAccent(accent) ?? [255, 210, 77];
    st.tint = hexOf(col);
    const hot = [col[0] + (255 - col[0]) * 0.55, col[1] + (255 - col[1]) * 0.55, col[2] + (255 - col[2]) * 0.55];
    st.front = OUTRO.wash.front.map((f, i, all) => {
      const c = i === all.length - 1 ? hot : col;
      return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${f.alpha})`;
    });
  } else {
    st.cracks = bakeCracks(st.ox, st.oy, st.reach);
  }
}

/** Per-frame: advance the outro clock, paint the DEFEAT overlay over the finished frame (GameView
 *  calls it inside the camera transform, after the board), and arm the settle beat. The victory
 *  wash itself is painted under the entities by drawVictoryWash (renderer hook) from st.t. */
function frame(ctx: Ctx, now: number): void {
  if (!st.active) return;
  const t0 = performance.now();
  const elapsed = Math.max(0, now - st.startedAt);
  const motion = viewFeel.motion > 0;
  st.now = now;
  st.t = motion ? clamp01(elapsed / (st.won ? OUTRO.wash.ms : OUTRO.defeat.ms)) : 1;
  if (!st.won) {
    const d = OUTRO.defeat;
    const drain = motion ? smooth(clamp01(elapsed / d.drainMs)) : 1;
    ctx.save();
    ctx.globalCompositeOperation = 'saturation'; // grey source ⇒ the board keeps hue + light, loses colour
    ctx.globalAlpha = d.desaturate * drain;
    ctx.fillStyle = '#808080';
    ctx.fillRect(-32, -32, WIDTH + 64, HEIGHT + 64); // covers the shake margin
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = d.darken * drain;
    ctx.fillStyle = '#000';
    ctx.fillRect(-32, -32, WIDTH + 64, HEIGHT + 64);
    if (st.cracks) {
      const r = st.reach * easeOut(st.t);
      if (r > 1) {
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(st.ox, st.oy, r, 0, TAU);
        ctx.clip();
        ctx.drawImage(st.cracks, 0, 0, WIDTH, HEIGHT);
      }
    }
    ctx.restore();
  }
  // The settle beat: the last OUTRO.settleMs of the hold ease the board into Results' blur/dim.
  if (motion && !st.settled && st.root && elapsed >= holdMs(st.won) - OUTRO.settleMs) {
    st.settled = true;
    st.root.dataset.outro = 'settle';
  }
  st.costMs += performance.now() - t0;
  st.costFrames++;
}

/** Renderer hook (drawGame, right after the Living Battlefield, UNDER the entities): the victory
 *  wash. A no-op outside a victory outro, and on any canvas but the live board (replay theater). */
export function drawVictoryWash(ctx: Ctx): void {
  if (!st.active || !st.won || !st.wash || ctx.canvas !== st.canvas) return;
  const t0 = performance.now();
  const w = OUTRO.wash;
  const r = st.reach * easeOut(st.t);
  if (r > 1) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(st.ox, st.oy, r, 0, TAU);
    ctx.clip();
    ctx.globalAlpha = w.groundAlpha;
    ctx.drawImage(st.wash.base, 0, 0);
    // the network the wash laid down beats as one organism (the terraform's own ~1.15 s heartbeat)
    const beat = viewFeel.motion > 0 ? Math.pow(Math.max(0, Math.sin(((st.now / 1150) % 1) * Math.PI)), 3) : 0;
    ctx.globalAlpha = w.glowAlpha * (1 - w.pulse + w.pulse * beat);
    ctx.drawImage(st.wash.glow, 0, 0);
    ctx.globalAlpha = w.tintAlpha;
    ctx.fillStyle = st.tint;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();
    if (st.t < 1) { // the wavefront rides the clip edge (hides it), fading as it leaves the board
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1 - st.t * st.t;
      for (let i = 0; i < w.front.length; i++) {
        ctx.strokeStyle = st.front[i];
        ctx.lineWidth = w.front[i].width;
        ctx.beginPath();
        ctx.arc(st.ox, st.oy, r, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  st.costMs += performance.now() - t0;
}

/** How long the outro holds before Results (ms) — reduced motion keeps a short static beat. */
function holdMs(won: boolean): number {
  if (viewFeel.motion <= 0) return OUTRO.holdMs.reduced;
  return won ? OUTRO.holdMs.won : OUTRO.holdMs.lost;
}

/** The hand-off: snapshot the live board (one small JPEG) + its on-screen rect for Results, then
 *  release everything. Undefined headless / if the canvas can't be read — Results keeps today's look. */
function capture(): RunBackdropImage | undefined {
  const c = st.canvas;
  let out: RunBackdropImage | undefined;
  if (st.active && c && typeof document !== 'undefined') {
    try {
      const snap = document.createElement('canvas');
      snap.width = Math.round(WIDTH * OUTRO.snapshot.scale);
      snap.height = Math.round(HEIGHT * OUTRO.snapshot.scale);
      snap.getContext('2d')!.drawImage(c, 0, 0, snap.width, snap.height);
      const src = snap.toDataURL('image/jpeg', OUTRO.snapshot.quality);
      snap.width = 0; // drop the backing store now, not at GC
      const vw = window.innerWidth || 1, vh = window.innerHeight || 1;
      const r = c.getBoundingClientRect();
      out = { src, rect: { x: r.left / vw, y: r.top / vh, w: r.width / vw, h: r.height / vh }, aspect: vw / vh };
    } catch {
      out = undefined; // a tainted / lost canvas — Results simply keeps its dark room
    }
  }
  end();
  return out;
}

/** Release the outro (bakes, DOM marks). Safe to call any time; GameView calls it on unmount. */
function end(): void {
  if (st.root) {
    delete st.root.dataset.outro;
    for (const k of ['--outro-x', '--outro-y', '--outro-w', '--outro-h', '--outro-settle']) st.root.style.removeProperty(k);
  }
  st.active = false;
  st.canvas = null;
  st.root = null;
  st.wash = null;
  st.cracks = null;
  st.t = 0;
}

/** Dev probe (perf measurement): ms added per outro frame so far. */
function cost(): { frames: number; msPerFrame: number } {
  return { frames: st.costFrames, msPerFrame: st.costFrames ? st.costMs / st.costFrames : 0 };
}

/** Live progress (tests / dev overlay). */
function progress(): { active: boolean; won: boolean; t: number; settled: boolean; origin: { x: number; y: number } } {
  return { active: st.active, won: st.won, t: st.t, settled: st.settled, origin: { x: st.ox, y: st.oy } };
}

export const runOutro = { begin, frame, holdMs, capture, end, cost, progress };

// Debug-gated handle (the same opt-in as window.__game) so headless probes can measure the cost.
if (isDebugEnabled()) (globalThis as { __runOutro?: typeof runOutro }).__runOutro = runOutro;
