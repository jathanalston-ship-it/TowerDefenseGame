// Reusable canvas draw + animation helpers for the battlefield renderer. Pure
// drawing primitives (no game logic, no state) so they compose into the renderer
// and stay easy to swap for production sprites/VFX later.

/** Smooth 0..1 oscillation mapped to [lo, hi]. The renderer's animation primitive. */
export function pulse(t: number, speed: number, lo: number, hi: number): number {
  return lo + (hi - lo) * (0.5 + 0.5 * Math.sin(t * speed));
}

export function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}

/** Append a rounded-rectangle path (does not fill/stroke). */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** A soft radial glow disc centered at (x,y). */
export function glowDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  const g = ctx.createRadialGradient(x, y, Math.max(1, r * 0.1), x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** A stroked ring (optionally dashed). */
export function ring(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  lineWidth = 1,
  dash?: [number, number],
): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  if (dash) ctx.setLineDash(dash);
  ctx.stroke();
  if (dash) ctx.setLineDash([]);
}

// ── Silhouette "sprites" (data-driven shapes — swap for art later) ───────────

export type ShapeKind = 'circle' | 'triangle' | 'square' | 'diamond' | 'hex';

/** Draw a filled placeholder silhouette of `r` radius centered at (x,y). */
export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: ShapeKind,
  x: number,
  y: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  switch (shape) {
    case 'circle':
      ctx.arc(x, y, r, 0, Math.PI * 2);
      break;
    case 'triangle':
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.92, y + r * 0.72);
      ctx.lineTo(x - r * 0.92, y + r * 0.72);
      ctx.closePath();
      break;
    case 'square': {
      const s = r * 0.86;
      ctx.rect(x - s, y - s, s * 2, s * 2);
      break;
    }
    case 'diamond':
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      break;
    case 'hex':
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
  }
  ctx.fill();
}

/** A clean rounded health pip above an entity. `colorFor` picks fill by fraction. */
export function healthBar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  topY: number,
  width: number,
  pct: number,
  back: string,
  border: string,
  fill: string,
): void {
  const h = 4;
  const x = cx - width / 2;
  roundRectPath(ctx, x, topY, width, h, 2);
  ctx.fillStyle = back;
  ctx.fill();
  if (pct > 0) {
    roundRectPath(ctx, x, topY, Math.max(2, width * pct), h, 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }
  roundRectPath(ctx, x + 0.5, topY + 0.5, width - 1, h - 1, 2);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.stroke();
}
