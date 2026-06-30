// Tower portrait — a LIVING, evolving emblem for the Tower Lab. Reuses the battlefield vfx
// primitives so it reads as the same organism, and visibly grows with star level (more orbiting
// organs, a spike crown, ascension rings) — a maxed tower looks unmistakably more evolved than a
// fresh one. Pure presentation: a self-contained canvas, no sim/renderer coupling. Honors
// prefers-reduced-motion (draws a single static frame).

import { useEffect, useRef } from 'react';
import { drawShape, glowDisc, pulse, ring, spikeCrown } from '../render/vfx';
import { hexRgb, rgba } from '../render/theme';
import { drawBranchPortrait, evolutionGrowth } from '../render/towerEvolution';

function drawPortrait(
  ctx: CanvasRenderingContext2D, w: number, h: number, color: string, stars: number, t: number,
  branchId?: string | null, tier?: number,
): void {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.17;
  const c = hexRgb(color);
  // BRANCH preview mode (Codex): render the branch's evolved silhouette instead of star orbs.
  const branchMode = !!branchId && (tier ?? 0) > 0;

  // Ambient glow — deepens with the "evolution amount" (stars, or branch tier).
  const evo = branchMode ? (tier as number) : stars;
  glowDisc(ctx, cx, cy, r * (1.9 + evo * 0.16), rgba(c, 0.1 + evo * 0.012));

  if (!branchMode) {
    if (stars >= 1) ring(ctx, cx, cy, r * (2.0 + stars * 0.1), rgba(c, pulse(t, 2.6, 0.18, 0.5)), 1.4);
    // Orbiting organ nodes — one per star (capped), pulsing like living cells.
    const nodes = Math.min(stars, 8);
    for (let i = 0; i < nodes; i++) {
      const ang = t * 0.55 + (i * Math.PI * 2) / nodes;
      const orbit = r * (1.7 + (i % 2) * 0.28);
      const pul = pulse(t + i * 0.7, 2.6, 0.6, 1.1);
      const px = cx + Math.cos(ang) * orbit;
      const py = cy + Math.sin(ang) * orbit;
      glowDisc(ctx, px, py, r * 0.34 * pul, rgba(c, 0.5));
      drawShape(ctx, 'circle', px, py, r * 0.15, rgba(c, 0.95));
    }
    // A spike crown blooms once the tower is fully evolved (★5+).
    if (stars >= 5) spikeCrown(ctx, cx, cy, r * 1.2, r * (0.45 + stars * 0.04), 6 + Math.floor(stars / 2), rgba(c, 0.8), t * 0.4);
  }

  // The beating core body (branch mode swells it with tier, matching the in-game growth).
  const bodyR = r * (branchMode ? evolutionGrowth(branchId!, tier as number) : 1);
  const beat = pulse(t, 1.6, 0.92, 1.08);
  glowDisc(ctx, cx, cy, bodyR * 1.25 * beat, rgba(c, 0.22));
  drawShape(ctx, 'circle', cx, cy, bodyR * beat, rgba(c, 0.85));
  drawShape(ctx, 'circle', cx - bodyR * 0.26, cy - bodyR * 0.26, bodyR * 0.42 * beat, 'rgba(255,255,255,0.45)');

  if (branchMode) {
    // The branch's evolved organs (data-driven; previews any tier without ownership).
    drawBranchPortrait(ctx, branchId!, tier as number, cx, cy, r * 0.92, t);
  } else {
    // Ascension rings — the ★7 / ★10 power tiers radiate.
    if (stars >= 7) ring(ctx, cx, cy, r * (2.6 + pulse(t, 3, 0, 0.6) * 0.8), rgba(c, 0.3), 1.6);
    if (stars >= 10) ring(ctx, cx, cy, r * 3.2, rgba(c, pulse(t, 2, 0.12, 0.42)), 2.2);
  }
}

export function TowerPortrait({
  color, stars, size = 132, branchId = null, tier = 0,
}: { color: string; stars: number; size?: number; branchId?: string | null; tier?: number }): JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { drawPortrait(ctx, size, size, color, stars, 0, branchId, tier); return; }
    let raf = 0;
    const start = performance.now();
    const frame = (nowMs: number): void => {
      drawPortrait(ctx, size, size, color, stars, (nowMs - start) / 1000, branchId, tier);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [color, stars, size, branchId, tier]);
  return <canvas ref={ref} className="tl-portrait-canvas" style={{ width: size, height: size }} aria-hidden />;
}
