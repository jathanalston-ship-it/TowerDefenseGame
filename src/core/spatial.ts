// Uniform spatial hash grid for fast proximity queries (ARCHITECTURE.md §7.4).
// Turns "enemies near X" from O(n) per query into ~O(local), which is what lets
// targeting / separation / splash / contact scale to hundreds of entities.
//
// Cells are reused across ticks (cleared, not reallocated) to avoid GC churn.
// Deterministic: items are visited in (cell, insertion) order.

export interface HasPos {
  x: number;
  y: number;
}

export class SpatialGrid<T extends HasPos> {
  private readonly cols: number;
  private readonly rows: number;
  private readonly cellSize: number;
  private readonly cells: T[][];

  constructor(width: number, height: number, cellSize: number) {
    this.cellSize = cellSize;
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    this.cells = new Array(this.cols * this.rows);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
  }

  /** Empty every cell (keeps the backing arrays for reuse). */
  clear(): void {
    for (let i = 0; i < this.cells.length; i++) this.cells[i].length = 0;
  }

  private cellIndex(x: number, y: number): number {
    let cx = (x / this.cellSize) | 0;
    let cy = (y / this.cellSize) | 0;
    if (cx < 0) cx = 0;
    else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0;
    else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }

  insert(item: T): void {
    this.cells[this.cellIndex(item.x, item.y)].push(item);
  }

  /**
   * Fill `out` (cleared first) with every item whose cell overlaps the box. Closure-
   * free — use this on hot per-entity paths (e.g. separation) to avoid GC churn.
   */
  queryInto(x: number, y: number, radius: number, out: T[]): void {
    out.length = 0;
    const cs = this.cellSize;
    let cx0 = ((x - radius) / cs) | 0;
    let cx1 = ((x + radius) / cs) | 0;
    let cy0 = ((y - radius) / cs) | 0;
    let cy1 = ((y + radius) / cs) | 0;
    if (cx0 < 0) cx0 = 0;
    if (cy0 < 0) cy0 = 0;
    if (cx1 >= this.cols) cx1 = this.cols - 1;
    if (cy1 >= this.rows) cy1 = this.rows - 1;
    for (let cy = cy0; cy <= cy1; cy++) {
      const rowBase = cy * this.cols;
      for (let cx = cx0; cx <= cx1; cx++) {
        const cell = this.cells[rowBase + cx];
        for (let i = 0; i < cell.length; i++) out.push(cell[i]);
      }
    }
  }

  /**
   * Visit every item whose cell overlaps the (x,y,radius) box. The callback must
   * still do the precise distance test — this only narrows the candidate set.
   */
  forNeighbors(x: number, y: number, radius: number, cb: (item: T) => void): void {
    const cs = this.cellSize;
    let cx0 = ((x - radius) / cs) | 0;
    let cx1 = ((x + radius) / cs) | 0;
    let cy0 = ((y - radius) / cs) | 0;
    let cy1 = ((y + radius) / cs) | 0;
    if (cx0 < 0) cx0 = 0;
    if (cy0 < 0) cy0 = 0;
    if (cx1 >= this.cols) cx1 = this.cols - 1;
    if (cy1 >= this.rows) cy1 = this.rows - 1;
    for (let cy = cy0; cy <= cy1; cy++) {
      const rowBase = cy * this.cols;
      for (let cx = cx0; cx <= cx1; cx++) {
        const cell = this.cells[rowBase + cx];
        for (let i = 0; i < cell.length; i++) cb(cell[i]);
      }
    }
  }
}
