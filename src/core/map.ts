// Open vertical battlefield arena. Enemies spawn along the TOP edge and flow
// toward the BOTTOM edge (the defensive line) via a flow field that routes around
// obstacles — there is no predetermined path. Towers may only be placed on the
// predefined slots in the bottom defensive region. Pure (no DOM); deterministic.

import type { Vec2 } from './math';
import { DEFENSE, FINAL_DEFENSE, OBSTACLES } from './config';

export const CELL = 40;
export const COLS = 18;
export const ROWS = 24;
export const WIDTH = COLS * CELL; // 720
export const HEIGHT = ROWS * CELL; // 960

/** Top row of the bottom defensive region (the player holds this line). */
export const DEFENSE_TOP_ROW = Math.floor(ROWS * (1 - DEFENSE.fraction)); // 18
export const DEFENSE_TOP_Y = DEFENSE_TOP_ROW * CELL; // 720

/** Top of the Final Defense Zone — the red last-stand band nearest the Hive Core. A
 * point at or below this Y is inside the zone (full width). See docs/RANGE.md §4. */
export const FINAL_DEFENSE_TOP_ROW = Math.floor(ROWS * (1 - FINAL_DEFENSE.fraction)); // 20
export const FINAL_DEFENSE_TOP_Y = FINAL_DEFENSE_TOP_ROW * CELL; // 800
/** Is a point inside the Final Defense Zone (the bottom band by the core)? */
export function inFinalDefenseZone(y: number): boolean {
  return y >= FINAL_DEFENSE_TOP_Y;
}

/** The base ("Nucleus") — the player's core, bottom-center on the defensive line. */
export const nucleusPoint: Vec2 = { x: WIDTH / 2, y: HEIGHT - CELL / 2 };

function key(col: number, row: number): number {
  return row * COLS + col;
}
export function center(col: number, row: number): Vec2 {
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}
function inBounds(col: number, row: number): boolean {
  return col >= 0 && col < COLS && row >= 0 && row < ROWS;
}
function colOf(px: number): number {
  return Math.min(COLS - 1, Math.max(0, Math.floor(px / CELL)));
}
function rowOf(py: number): number {
  return Math.min(ROWS - 1, Math.max(0, Math.floor(py / CELL)));
}

// ── Obstacles ────────────────────────────────────────────────────────────────
const obstacleSet = new Set<number>();
for (const b of OBSTACLES) {
  for (let r = b.row; r < b.row + b.h; r++) {
    for (let c = b.col; c < b.col + b.w; c++) {
      if (inBounds(c, r)) obstacleSet.add(key(c, r));
    }
  }
}
export function isObstacle(col: number, row: number): boolean {
  return obstacleSet.has(key(col, row));
}
/** Obstacle cells (centers) for rendering. */
export const obstacleCells: { col: number; row: number; x: number; y: number }[] = [];
for (const b of OBSTACLES) {
  for (let r = b.row; r < b.row + b.h; r++) {
    for (let c = b.col; c < b.col + b.w; c++) {
      if (!inBounds(c, r)) continue;
      const ctr = center(c, r);
      obstacleCells.push({ col: c, row: r, x: ctr.x, y: ctr.y });
    }
  }
}

// ── Flow field (multi-source Dijkstra from the bottom edge) ───────────────────
// distField[k] = path cost to the nearest bottom-edge cell; flowField[k] = unit
// direction toward the goal. Rebuildable with extra blocked cells to support
// future destructible obstacles / blocking structures; towers do NOT block
// (keeps a path to the line always solvable).
const N = COLS * ROWS;
let distField = new Float64Array(N);
let flowField: Vec2[] = [];

const NEI: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

export function rebuildFlowField(extraBlocked?: ReadonlySet<number>): void {
  const blocked = (c: number, r: number): boolean =>
    obstacleSet.has(key(c, r)) || (extraBlocked ? extraBlocked.has(key(c, r)) : false);

  distField = new Float64Array(N).fill(Infinity);
  const visited = new Uint8Array(N);
  // Sources: passable cells on the bottom row (the goal line), distance 0.
  for (let c = 0; c < COLS; c++) {
    if (!blocked(c, ROWS - 1)) distField[key(c, ROWS - 1)] = 0;
  }
  // O(V^2) Dijkstra — tiny grid (432 cells), computed once / on change.
  for (let iter = 0; iter < N; iter++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < N; i++) {
      if (!visited[i] && distField[i] < best) {
        best = distField[i];
        u = i;
      }
    }
    if (u < 0) break;
    visited[u] = 1;
    const uc = u % COLS;
    const ur = (u / COLS) | 0;
    for (const [dc, dr, w] of NEI) {
      const nc = uc + dc;
      const nr = ur + dr;
      if (!inBounds(nc, nr) || blocked(nc, nr)) continue;
      // No diagonal corner-cutting between two obstacles.
      if (dc !== 0 && dr !== 0 && blocked(uc + dc, ur) && blocked(uc, ur + dr)) continue;
      const nk = key(nc, nr);
      const nd = best + w;
      if (nd < distField[nk]) distField[nk] = nd;
    }
  }
  // Per-cell flow vectors (toward the lowest-distance reachable neighbour).
  flowField = new Array(N);
  for (let i = 0; i < N; i++) {
    const c = i % COLS;
    const r = (i / COLS) | 0;
    if (blocked(c, r) || !isFinite(distField[i])) {
      flowField[i] = { x: 0, y: 1 }; // fallback: head straight down
      continue;
    }
    let bc = c;
    let br = r;
    let bd = distField[i];
    for (const [dc, dr] of NEI) {
      const nc = c + dc;
      const nr = r + dr;
      if (!inBounds(nc, nr) || blocked(nc, nr)) continue;
      if (dc !== 0 && dr !== 0 && blocked(c + dc, r) && blocked(c, r + dr)) continue;
      const d = distField[key(nc, nr)];
      if (d < bd) {
        bd = d;
        bc = nc;
        br = nr;
      }
    }
    if (bc === c && br === r) {
      flowField[i] = { x: 0, y: 1 };
      continue;
    }
    const vx = bc - c;
    const vy = br - r;
    const len = Math.hypot(vx, vy) || 1;
    flowField[i] = { x: vx / len, y: vy / len };
  }
}
rebuildFlowField();

/** Unit direction an enemy at (px,py) should travel to reach the line. */
export function flowDirAt(px: number, py: number): Vec2 {
  return flowField[key(colOf(px), rowOf(py))] ?? { x: 0, y: 1 };
}
/** Path cost from (px,py) to the line — lower = closer to breaking through. */
export function goalDistanceAt(px: number, py: number): number {
  const d = distField[key(colOf(px), rowOf(py))];
  return isFinite(d) ? d : Number.MAX_SAFE_INTEGER;
}

// ── Spawn / goal ──────────────────────────────────────────────────────────────
/** A spawn position along the top edge for t in [0,1) (off the side walls). */
export function topSpawn(t: number): Vec2 {
  const margin = CELL;
  return { x: margin + t * (WIDTH - 2 * margin), y: CELL * 0.5 };
}
export const REACH_Y = HEIGHT - CELL * 0.5;
/** Has an enemy crossed the bottom edge (breached the line)? */
export function reachedBottom(py: number): boolean {
  return py >= REACH_Y;
}

// ── Tower slots (predefined placement nodes) ─────────────────────────────────
export interface TowerSlot {
  index: number;
  col: number;
  row: number;
  x: number; // center px
  y: number;
}

// The 27 tower emplacements: a 9-wide × 3-deep lattice in the defensive region. The nine
// columns are spaced 80px apart and SYMMETRIC around the Hive Core (x=360) — four left, a
// centre, four right — so placement never favours a side. The three rows sit just above the
// core (the bottom row clears it). Slots are emitted in CENTRE-OUT unlock order: the column
// nearest the core first, then expanding outward in mirror pairs, bottom row first — so any
// "available count" (SLOTS.initialUnlocked → permanent → temporary) is left-right balanced.
// Index = unlock priority: 0–14 are the centre five columns (initial 15), 15–20 the next ring
// (permanent, up to 21), 21–26 the outer edges (temporary, run-only). See docs/SLOTS.md.
function buildSlots(): TowerSlot[] {
  const xs = [40, 120, 200, 280, 360, 440, 520, 600, 680]; // symmetric around the core (x=360)
  const rows = [DEFENSE_TOP_ROW, DEFENSE_TOP_ROW + 2, DEFENSE_TOP_ROW + 4]; // 18, 20, 22 — bottom row clears the core (row 23)
  const center = 4; // index of x=360 in `xs`
  const cells: { x: number; row: number; ci: number; ri: number }[] = [];
  for (let ri = 0; ri < rows.length; ri++) {
    for (let ci = 0; ci < xs.length; ci++) cells.push({ x: xs[ci], row: rows[ri], ci, ri });
  }
  cells.sort((a, b) => {
    const da = Math.abs(a.ci - center);
    const db = Math.abs(b.ci - center);
    if (da !== db) return da - db; // closer to the core unlocks first (centre-out)
    const ra = rows.length - 1 - a.ri;
    const rb = rows.length - 1 - b.ri;
    if (ra !== rb) return ra - rb; // within a ring, the row nearest the core first
    return (a.ci < center ? 0 : 1) - (b.ci < center ? 0 : 1); // left before right (mirror pairs adjacent)
  });
  return cells.map((c, index) => ({ index, col: colOf(c.x), row: c.row, x: c.x, y: c.row * CELL + CELL / 2 }));
}
export const towerSlots: TowerSlot[] = buildSlots();

/** How close a click must land to a slot's pad to select it (px). The pads sit on the
 * symmetric 80px lattice; a generous, pad-sized radius keeps the tap target comfortable
 * (> 44px touch target) without ever reaching a neighbouring slot. */
export const SLOT_HIT_RADIUS = CELL * 0.7; // 28px

/** The tower slot a click selects: the NEAREST pad within `SLOT_HIT_RADIUS`, or null. Snapping
 * to the pad centre — rather than flooring (px,py) to a grid cell — keeps the clickable target
 * CENTERED on each visual pad and mirror-symmetric about the Hive Core. (Pads straddle the cell
 * grid, so cell-flooring biased every hit half a cell to the right and killed each pad's left
 * half; nearest-pad removes that offset.) */
export function slotAt(px: number, py: number): TowerSlot | null {
  let best: TowerSlot | null = null;
  let bestD2 = SLOT_HIT_RADIUS * SLOT_HIT_RADIUS;
  for (const s of towerSlots) {
    const dx = px - s.x;
    const dy = py - s.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = s;
    }
  }
  return best;
}
