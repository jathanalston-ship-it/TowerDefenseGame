// Open vertical battlefield arena. Enemies spawn along the TOP edge and flow
// toward the BOTTOM edge (the defensive line) via a flow field that routes around
// obstacles — there is no predetermined path. Towers may only be placed on the
// predefined slots in the bottom defensive region. Pure (no DOM); deterministic.
//
// The arena is DATA-DRIVEN: obstacles, tower-slot pattern and spawn zones are
// loaded via loadArena() so each procedurally-generated Stage gets its own layout.
// The dimensions (CELL/COLS/ROWS) and the goal (bottom line) are fixed. Classic
// mode loads CLASSIC_LAYOUT, which reproduces the original hand-authored arena.

import type { Vec2 } from './math';
import { DEFENSE, OBSTACLES, SLOTS } from './config';
import type { ArenaLayout, SlotPattern, SpawnZone } from './stage';

export const CELL = 40;
export const COLS = 18;
export const ROWS = 24;
export const WIDTH = COLS * CELL; // 720
export const HEIGHT = ROWS * CELL; // 960

/** Top row of the bottom defensive region (the player holds this line). */
export const DEFENSE_TOP_ROW = Math.floor(ROWS * (1 - DEFENSE.fraction)); // 18
export const DEFENSE_TOP_Y = DEFENSE_TOP_ROW * CELL; // 720

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

// ── Obstacles (loaded per-arena via loadArena) ────────────────────────────────
let obstacleSet = new Set<number>();
export function isObstacle(col: number, row: number): boolean {
  return obstacleSet.has(key(col, row));
}
/** Obstacle cells (centers) for rendering — rebuilt by loadArena (live binding). */
export let obstacleCells: { col: number; row: number; x: number; y: number }[] = [];

function buildObstacles(rects: ReadonlyArray<{ col: number; row: number; w: number; h: number }>): void {
  obstacleSet = new Set<number>();
  obstacleCells = [];
  for (const b of rects) {
    for (let r = b.row; r < b.row + b.h; r++) {
      for (let c = b.col; c < b.col + b.w; c++) {
        if (!inBounds(c, r)) continue;
        obstacleSet.add(key(c, r));
        const ctr = center(c, r);
        obstacleCells.push({ col: c, row: r, x: ctr.x, y: ctr.y });
      }
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
let spawnZones: SpawnZone[] = [{ x0: CELL, x1: WIDTH - CELL }];
/** Active top-edge spawn segments (for the renderer to draw the membrane). */
export function spawnSegments(): readonly SpawnZone[] {
  return spawnZones;
}
/** A spawn position distributed across the active spawn zones for t in [0,1). */
export function topSpawn(t: number): Vec2 {
  const total = spawnZones.reduce((s, z) => s + (z.x1 - z.x0), 0) || 1;
  let d = t * total;
  for (const z of spawnZones) {
    const w = z.x1 - z.x0;
    if (d <= w) return { x: z.x0 + d, y: CELL * 0.5 };
    d -= w;
  }
  const last = spawnZones[spawnZones.length - 1];
  return { x: last.x1, y: CELL * 0.5 };
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
  gi: number; // lattice column index (for neighbour/adjacency tests)
  gj: number; // lattice row index
  x: number; // center px
  y: number;
}

/** Whether a lattice cell is kept for a given slot pattern (lattice indices `gi`). */
function slotInPattern(pattern: SlotPattern, gi: number, col: number): boolean {
  switch (pattern) {
    case 'sparse': return gi % 2 === 0; // every other lattice column
    case 'clustered': return col >= 5 && col <= COLS - 5; // central band only
    case 'flanks': return col <= 3 || col >= COLS - 3; // outer thirds only
    default: return true; // 'lattice' — the full grid
  }
}

function buildSlots(pattern: SlotPattern): TowerSlot[] {
  const out: TowerSlot[] = [];
  let gj = 0;
  for (let row = DEFENSE_TOP_ROW + SLOTS.rowOffset; row < ROWS; row += SLOTS.rowStep, gj++) {
    let gi = 0;
    for (let col = SLOTS.colStart; col < COLS; col += SLOTS.colStep, gi++) {
      if (isObstacle(col, row)) continue;
      const ctr = center(col, row);
      // Keep the base's cell clear.
      if (Math.abs(ctr.x - nucleusPoint.x) < CELL * 0.75 && Math.abs(ctr.y - nucleusPoint.y) < CELL * 0.75) {
        continue;
      }
      if (!slotInPattern(pattern, gi, col)) continue;
      out.push({ index: out.length, col, row, gi, gj, x: ctr.x, y: ctr.y });
    }
  }
  return out;
}
/** Tower-slot lattice for the current arena — rebuilt by loadArena (live binding). */
export let towerSlots: TowerSlot[] = [];

/** The slot occupying the cell at (px,py), or null. */
export function slotAt(px: number, py: number): TowerSlot | null {
  const col = colOf(px);
  const row = rowOf(py);
  for (const s of towerSlots) if (s.col === col && s.row === row) return s;
  return null;
}

/** Neighbouring slots on the lattice (used for reactor overcharge adjacency). */
export function slotsAdjacent(a: TowerSlot, b: TowerSlot): boolean {
  return Math.abs(a.gi - b.gi) + Math.abs(a.gj - b.gj) === 1;
}

// ── Arena loading ─────────────────────────────────────────────────────────────
/** The original hand-authored arena — Classic mode + the renderer's default. */
export const CLASSIC_LAYOUT: ArenaLayout = {
  obstacles: OBSTACLES.map((o) => ({ ...o })),
  spawnZones: [{ x0: CELL, x1: WIDTH - CELL }],
  slotPattern: 'lattice',
};

/** Swap in an arena layout: rebuild obstacles, spawn zones, slots and the flow
 *  field. One active arena at a time (one live Game). Deterministic per layout. */
export function loadArena(layout: ArenaLayout): void {
  buildObstacles(layout.obstacles);
  spawnZones = layout.spawnZones.length > 0 ? layout.spawnZones : [{ x0: CELL, x1: WIDTH - CELL }];
  towerSlots = buildSlots(layout.slotPattern);
  rebuildFlowField();
}

loadArena(CLASSIC_LAYOUT); // initialise the default arena at module load
