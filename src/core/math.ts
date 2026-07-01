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

/** Clamp to the unit interval — the progress-bar / fraction workhorse. */
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Sum a numeric record's values (missing/undefined entries count as 0). */
export function sumValues(obj: Record<string, number>): number {
  let n = 0;
  for (const k in obj) n += obj[k] ?? 0;
  return n;
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
