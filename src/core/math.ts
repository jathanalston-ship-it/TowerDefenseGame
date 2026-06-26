// Tiny vector / scalar helpers used by the simulation. Pure, no dependencies.

export interface Vec2 {
  x: number;
  y: number;
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Move (x,y) toward (tx,ty) by at most `maxStep`. Returns the new position. */
export function moveToward(
  x: number,
  y: number,
  tx: number,
  ty: number,
  maxStep: number,
): Vec2 {
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d <= maxStep || d === 0) return { x: tx, y: ty };
  const k = maxStep / d;
  return { x: x + dx * k, y: y + dy * k };
}
