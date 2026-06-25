// The one map for the vertical slice: a single winding path with buildable cells
// flanking it. Computed deterministically at module load. Pure (no DOM).

import type { Vec2 } from './math';

export const CELL = 40;
export const COLS = 24;
export const ROWS = 15;
export const WIDTH = COLS * CELL; // 960
export const HEIGHT = ROWS * CELL; // 600

interface GridCell {
  col: number;
  row: number;
}

// Path corners in grid coords. Axis-aligned segments between consecutive corners.
const CORNERS: GridCell[] = [
  { col: 0, row: 2 },
  { col: 9, row: 2 },
  { col: 9, row: 7 },
  { col: 3, row: 7 },
  { col: 3, row: 11 },
  { col: 17, row: 11 },
  { col: 17, row: 4 },
  { col: 21, row: 4 },
  { col: 21, row: 12 },
  { col: 23, row: 12 }, // Nucleus
];

function key(col: number, row: number): number {
  return row * COLS + col;
}

function buildPathCells(): GridCell[] {
  const cells: GridCell[] = [];
  const seen = new Set<number>();
  const push = (col: number, row: number) => {
    const k = key(col, row);
    if (!seen.has(k)) {
      seen.add(k);
      cells.push({ col, row });
    }
  };
  for (let i = 0; i < CORNERS.length - 1; i++) {
    const a = CORNERS[i];
    const b = CORNERS[i + 1];
    const dc = Math.sign(b.col - a.col);
    const dr = Math.sign(b.row - a.row);
    let c = a.col;
    let r = a.row;
    push(c, r);
    while (c !== b.col || r !== b.row) {
      c += dc;
      r += dr;
      push(c, r);
    }
  }
  return cells;
}

export const pathCells: GridCell[] = buildPathCells();
const pathSet = new Set<number>(pathCells.map((c) => key(c.col, c.row)));

export function center(col: number, row: number): Vec2 {
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

/** Pixel waypoints enemies follow, spawn (index 0) to Nucleus (last). */
export const pathPoints: Vec2[] = pathCells.map((c) => center(c.col, c.row));
export const spawnPoint: Vec2 = pathPoints[0];
export const nucleusPoint: Vec2 = pathPoints[pathPoints.length - 1];

export interface BuildCell {
  index: number;
  col: number;
  row: number;
  x: number; // center px
  y: number;
}

function buildBuildableCells(): BuildCell[] {
  const out: BuildCell[] = [];
  const seen = new Set<number>();
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const pc of pathCells) {
    for (const [dc, dr] of neighbors) {
      const col = pc.col + dc;
      const row = pc.row + dr;
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) continue;
      const k = key(col, row);
      if (pathSet.has(k) || seen.has(k)) continue;
      seen.add(k);
      const ctr = center(col, row);
      out.push({ index: out.length, col, row, x: ctr.x, y: ctr.y });
    }
  }
  return out;
}

export const buildCells: BuildCell[] = buildBuildableCells();
const buildCellByKey = new Map<number, BuildCell>();
for (const b of buildCells) buildCellByKey.set(key(b.col, b.row), b);

/** Buildable cell at a pixel position, or null if the click isn't on one. */
export function buildCellAt(px: number, py: number): BuildCell | null {
  const col = Math.floor(px / CELL);
  const row = Math.floor(py / CELL);
  return buildCellByKey.get(key(col, row)) ?? null;
}

/** Are two build cells orthogonally adjacent? (used for reactor overcharge) */
export function cellsAdjacent(a: BuildCell, b: BuildCell): boolean {
  const dc = Math.abs(a.col - b.col);
  const dr = Math.abs(a.row - b.row);
  return dc + dr === 1;
}
