// IMPACT FRAMES (docs/GAME-FEEL.md §boss kills, docs/HERO-CINEMATICS.md §impact) — the view's local
// punctuation for the moments that must LAND: a stage boss dying (a gold shock ring at the body) and
// a hero ultimate's payload striking (a bloom inside its zone + ONE grouped damage-total number).
// GameView pushes on the presentation events and draws once per frame inside the shaken camera, so
// the ring rides the same kick as the world. Wall-clock timed: the bloom keeps blooming through the
// view-only hit-stop (the classic frozen impact frame). Fixed pool, no per-frame allocation on the
// steady path; honors the Motion settings (render/feel.ts viewFeel).

import { DAMAGE_NUMBERS, viewFeel } from './feel';

type ImpactKind = 'ring' | 'bloom';

interface Impact {
  live: boolean;
  kind: ImpactKind;
  x: number;
  y: number;
  r: number; // ring reach / bloom zone radius (board px)
  color: string;
  total: string; // formatted grouped damage ('' = none)
  totalPx: number;
  at: number; // wall ms
}

const POOL_SIZE = 8;
const pool: Impact[] = Array.from({ length: POOL_SIZE }, () => ({ live: false, kind: 'ring' as ImpactKind, x: 0, y: 0, r: 0, color: '#fff', total: '', totalPx: 0, at: 0 }));

/** Lifetimes (ms) — the ring is a fast shock; the bloom flashes then lets the total read. */
const RING_MS = 650;
const BLOOM_MS = 380;
const TOTAL_MS = 1150;

// Pre-built fonts for the grouped total (whole px) — no string building per frame.
const TOTAL_FONTS: string[] = [];
for (let px = 0; px <= 48; px++) TOTAL_FONTS.push(`900 ${px}px 'Chakra Petch', 'Exo 2', system-ui, sans-serif`);

function claim(): Impact {
  let oldest = pool[0];
  for (const p of pool) {
    if (!p.live) return p;
    if (p.at < oldest.at) oldest = p;
  }
  return oldest; // pool full — recycle the oldest (these are rare, short-lived)
}

/** A shock ring at (x, y) — e.g. a boss falling. `reach` is the ring's final radius. */
export function pushImpactRing(x: number, y: number, reach: number, color: string, now: number): void {
  const p = claim();
  p.live = true; p.kind = 'ring'; p.x = x; p.y = y; p.r = reach; p.color = color; p.total = ''; p.at = now;
}

/** An ult's impact frame: a bloom filling its zone + the grouped damage total (0 = no number). */
export function pushImpactBloom(x: number, y: number, radius: number, color: string, damage: number, now: number): void {
  const p = claim();
  p.live = true; p.kind = 'bloom'; p.x = x; p.y = y; p.r = Math.max(36, radius); p.color = color; p.at = now;
  const dmg = Math.round(damage);
  p.total = dmg >= 1 ? dmg.toLocaleString('en-US') : '';
  // The total is a damage number too — same bounded log scale, one notch heavier (it's the sum).
  p.totalPx = Math.round(Math.min(DAMAGE_NUMBERS.maxPx + 8, DAMAGE_NUMBERS.minPx + 4 + DAMAGE_NUMBERS.perDecade * Math.log10(Math.max(1, dmg))));
}

export function clearImpacts(): void {
  for (const p of pool) p.live = false;
}

/** Draw every live impact (call inside the camera transform, after the world). */
export function drawImpacts(ctx: CanvasRenderingContext2D, now: number): void {
  for (const p of pool) {
    if (!p.live) continue;
    // Clamped: a push stamped with performance.now() mid-frame is LATER than this frame's rAF
    // timestamp — on a slow frame (> ~25 ms of work before the draw) the raw age went negative,
    // the ring's eased radius went negative, and arc() threw, killing the run loop.
    const age = Math.max(0, now - p.at);
    if (p.kind === 'ring') {
      if (age >= RING_MS) { p.live = false; continue; }
      const k = age / RING_MS; // 0 → 1
      const ease = 1 - (1 - k) * (1 - k) * (1 - k);
      // Reduced motion: the ring holds its size and simply fades (no expanding sweep).
      const rad = viewFeel.motion > 0 ? 14 + (p.r - 14) * ease : p.r * 0.6;
      ctx.save();
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = 0.85 * (1 - k);
      ctx.lineWidth = 2 + 6 * (1 - k);
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.4 * (1 - k);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      if (viewFeel.flashes && k < 0.3) { // a brief hot core — local, never full-field
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.35 * (1 - k / 0.3);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 22 + 30 * k, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      continue;
    }
    // bloom
    const life = p.total && viewFeel.numbers ? TOTAL_MS : BLOOM_MS;
    if (age >= life) { p.live = false; continue; }
    ctx.save();
    if (age < BLOOM_MS) {
      const k = age / BLOOM_MS;
      if (viewFeel.flashes) {
        // The bloom stays INSIDE the zone (calm covenant: no full-field flash) — a hot core
        // easing out to the rim, peaking on the first frames (the frozen impact frame).
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, 'rgba(255,255,255,0.85)');
        g.addColorStop(0.35, p.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55 * (1 - k) * (1 - k);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      // The zone's rim snaps once — the edge of what was hit.
      ctx.globalAlpha = 0.7 * (1 - k);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (viewFeel.motion > 0 ? 0.9 + 0.1 * k : 1), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (p.total && viewFeel.numbers) {
      // ONE grouped total above the zone centre (the hero stands on the centre): pops in, rises, fades.
      const k = age / TOTAL_MS;
      const pop = age < 110 && viewFeel.motion > 0 ? 1 + 0.45 * (1 - age / 110) : 1;
      const px = Math.min(48, Math.round(p.totalPx * pop));
      const y = p.y - Math.max(22, Math.min(46, p.r * 0.4)) - 6 - (viewFeel.motion > 0 ? 22 * k : 0);
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.font = TOTAL_FONTS[px];
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = DAMAGE_NUMBERS.outline + 1;
      ctx.strokeStyle = 'rgba(6,8,12,0.9)';
      ctx.strokeText(p.total, p.x, y);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(p.total, p.x, y);
    }
    ctx.restore();
  }
}
