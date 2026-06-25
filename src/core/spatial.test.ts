import { describe, it, expect } from 'vitest';
import { SpatialGrid } from './spatial';

interface P {
  x: number;
  y: number;
  id: number;
}

describe('SpatialGrid', () => {
  it('queryInto returns a candidate set covering every in-radius item', () => {
    const g = new SpatialGrid<P>(400, 400, 50);
    const items: P[] = [];
    let id = 0;
    for (let x = 25; x < 400; x += 50) {
      for (let y = 25; y < 400; y += 50) {
        const p = { x, y, id: id++ };
        items.push(p);
        g.insert(p);
      }
    }
    const out: P[] = [];
    g.queryInto(175, 175, 30, out);
    const truth = items.filter((p) => Math.hypot(p.x - 175, p.y - 175) <= 30);
    expect(truth.length).toBeGreaterThan(0);
    for (const t of truth) expect(out).toContain(t); // candidates are a superset of in-range
  });

  it('forNeighbors visits nearby cells but not distant ones', () => {
    const g = new SpatialGrid<P>(200, 200, 40);
    const a = { x: 50, y: 50, id: 1 };
    const b = { x: 55, y: 52, id: 2 };
    const c = { x: 185, y: 185, id: 3 };
    g.insert(a);
    g.insert(b);
    g.insert(c);
    const seen = new Set<number>();
    g.forNeighbors(50, 50, 20, (p) => seen.add(p.id));
    expect(seen.has(1)).toBe(true);
    expect(seen.has(2)).toBe(true);
    expect(seen.has(3)).toBe(false);
  });

  it('clear empties every cell', () => {
    const g = new SpatialGrid<P>(100, 100, 25);
    g.insert({ x: 10, y: 10, id: 0 });
    g.clear();
    const out: P[] = [];
    g.queryInto(10, 10, 50, out);
    expect(out.length).toBe(0);
  });

  it('clamps queries at the arena edges without throwing', () => {
    const g = new SpatialGrid<P>(100, 100, 25);
    const corner = { x: 2, y: 2, id: 7 };
    g.insert(corner);
    const out: P[] = [];
    g.queryInto(-50, -50, 40, out); // off the top-left
    expect(out).toContain(corner);
  });
});
