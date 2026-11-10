// Tower portrait — a LIVING, evolving emblem for the Tower Lab / Codex. Reuses the battlefield vfx
// so it reads as the same organism, and renders one of three forms:
//   • `kind` (default Lab card) → the SAME per-species star evolution the battlefield grows
//     (drawStarEvolution), so the lab + field show one organism at a given star generation;
//   • `branchId`+`tier` (Codex branch preview) → the branch's evolved silhouette (drawBranchPortrait);
//   • neither → a generic orbiting-organ emblem (fallback).
// Pure presentation: a self-contained canvas, no sim/renderer coupling. Honors reduced-motion.

import { useEffect, useRef } from 'react';
import { drawShape, glowDisc, pulse, ring, spikeCrown } from '../render/vfx';
import { hexRgb, rgba } from '../render/theme';
import { drawBranchPortrait, evolutionGrowth } from '../render/towerEvolution';
import { drawStarEvolution, starEvolutionGrowth } from '../render/starEvolution';
import type { TowerKind } from '../core/types';
import './TowerPortrait.css';

function drawPortrait(
  ctx: CanvasRenderingContext2D, w: number, h: number, color: string, stars: number, t: number,
  kind?: TowerKind, branchId?: string | null, tier?: number,
): void {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const c = hexRgb(color);
  const baseR = Math.min(w, h) * 0.17;
  // BRANCH preview mode (Codex): render the branch's evolved silhouette instead of the star organs.
  const branchMode = !!branchId && (tier ?? 0) > 0;
  // Body silhouette scale: branch tier (Codex) or star generation (battlefield visual evolution).
  const bodyR = baseR * (branchMode ? evolutionGrowth(branchId!, tier as number) : kind ? starEvolutionGrowth(kind, stars) : 1);
  const evo = branchMode ? (tier as number) : stars;

  // Ambient glow — deepens with the "evolution amount" (stars, or branch tier).
  glowDisc(ctx, cx, cy, baseR * (1.9 + evo * 0.16), rgba(c, 0.1 + evo * 0.012));

  // The beating core body.
  const beat = pulse(t, 1.6, 0.92, 1.08);
  glowDisc(ctx, cx, cy, bodyR * 1.25 * beat, rgba(c, 0.22));
  drawShape(ctx, 'circle', cx, cy, bodyR * beat, rgba(c, 0.85));
  drawShape(ctx, 'circle', cx - bodyR * 0.26, cy - bodyR * 0.26, bodyR * 0.42 * beat, 'rgba(255,255,255,0.45)');

  // Evolution organs, OVER the body.
  if (branchMode) {
    // The branch's evolved organs (data-driven; previews any tier without ownership).
    drawBranchPortrait(ctx, branchId!, tier as number, cx, cy, baseR * 0.92, t);
  } else if (kind) {
    // The SAME per-tower identity organs the battlefield grows (★1/3/5/7/9) — this species at this
    // generation, not a generic emblem.
    drawStarEvolution(ctx, { kind, x: cx, y: cy, id: 7 }, stars, baseR, t, color, 0);
  } else {
    // Generic fallback (no kind / branch): orbiting organ nodes + a ★5 spike crown.
    const nodes = Math.min(stars, 8);
    for (let i = 0; i < nodes; i++) {
      const ang = t * 0.55 + (i * Math.PI * 2) / nodes;
      const orbit = baseR * (1.7 + (i % 2) * 0.28);
      const pul = pulse(t + i * 0.7, 2.6, 0.6, 1.1);
      glowDisc(ctx, cx + Math.cos(ang) * orbit, cy + Math.sin(ang) * orbit, baseR * 0.34 * pul, rgba(c, 0.5));
      drawShape(ctx, 'circle', cx + Math.cos(ang) * orbit, cy + Math.sin(ang) * orbit, baseR * 0.15, rgba(c, 0.95));
    }
    if (stars >= 5) spikeCrown(ctx, cx, cy, baseR * 1.2, baseR * (0.45 + stars * 0.04), 6 + Math.floor(stars / 2), rgba(c, 0.8), t * 0.4);
  }

  // Ascension rings — the ★7 / ★10 power tiers radiate (on top of the organs).
  if (!branchMode && stars >= 7) ring(ctx, cx, cy, baseR * (2.6 + pulse(t, 3, 0, 0.6) * 0.8), rgba(c, 0.3), 1.6);
  if (!branchMode && stars >= 10) ring(ctx, cx, cy, baseR * 3.2, rgba(c, pulse(t, 2, 0.12, 0.42)), 2.2);
}

export function TowerPortrait({
  color, stars, size = 132, kind, branchId = null, tier = 0,
}: { color: string; stars: number; size?: number; kind?: TowerKind; branchId?: string | null; tier?: number }): JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let visible = true;
    let elapsed = 0;
    let previous: number | null = null;
    const frame = (nowMs: number): void => {
      if (previous !== null) elapsed += (nowMs - previous) / 1000;
      previous = nowMs;
      drawPortrait(ctx, size, size, color, stars, elapsed, kind, branchId, tier);
      raf = requestAnimationFrame(frame);
    };
    const sync = (): void => {
      cancelAnimationFrame(raf);
      previous = null; // resuming a scrolled-away portrait never jumps its animation clock
      if (motion?.matches) {
        drawPortrait(ctx, size, size, color, stars, 0, kind, branchId, tier);
      } else if (visible && !document.hidden) raf = requestAnimationFrame(frame);
    };
    // Always leave a complete portrait behind, even before its first visible animation frame.
    drawPortrait(ctx, size, size, color, stars, 0, kind, branchId, tier);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer?.observe(canvas);
    motion?.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      motion?.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [color, stars, size, kind, branchId, tier]);
  return <canvas ref={ref} className="tl-portrait-canvas" style={{ width: size, height: size }} aria-hidden />;
}
