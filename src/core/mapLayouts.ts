// ARENA LAYOUTS (docs/MAP-LAYOUTS.md) — the battlefield's obstacle geometry as DATA. One row per
// layout: an id, a name, impassable grid rects, and (optionally) the spans of the top edge the
// swarm spawns from. The grid, the defensive region and the tower-slot lattice are FIXED
// (map.ts) — a layout only re-routes the approach above the line.
//
// Ownership: each Game resolves ONE layout at construction (RunOptions.layout pin → the stage's
// layout → the mode default) and owns that layout's NavField; Infinite rotates it as biomes
// rotate. Fields are immutable once built, so they are cached per id and safely shared between
// concurrent Games (tests, Arena, spectate) — no mutable map state ever crosses a Game.
//
// Invariants (layoutProblems — the registry validator, run at dev boot + in the suite):
//   • every rect is in-bounds and sits in the open field: below the spawn band, above the
//     defensive region (so no obstacle can ever touch the defensive/final-defense zones or a slot);
//   • every passable field cell — every top spawn column included — has a path to the line
//     (no sealed pockets);
//   • spawn spans are ordered, non-overlapping fractions of the top edge.
//
// Pure data + math: no sim, no DOM. The DEFAULT layout is config OBSTACLES (the classic arena):
// golden autoplay, the tutorial, Quick Skirmish and every pinned run stay on it byte-identically.

import { OBSTACLES } from './config';
import { BIOME_PERIOD } from './biomes';
import { COLS, DEFENSE_TOP_ROW, NavField, defaultNavField, topSpawn, towerSlots } from './map';
import type { ObstacleRect } from './map';
import type { Vec2 } from './math';
import { Registry } from './registry';
import type { Rng } from './rng';

/** The routing idea a layout expresses (docs/MAP-LAYOUTS.md §shapes). */
export type LayoutShape = 'scattered' | 'chokepoint' | 'split' | 'open' | 'funnel' | 'maze';

export interface MapLayoutDef {
  id: string;
  name: string;
  /** One line: how the layout routes the swarm (stage previews + docs). */
  blurb: string;
  shape: LayoutShape;
  obstacles: readonly ObstacleRect[];
  /** Spans of the top edge the swarm spawns from, as [lo, hi] fractions of the spawnable width.
   *  Omitted ⇒ the full edge (map.ts topSpawn, byte-identical). */
  spawnSpans?: readonly (readonly [number, number])[];
  /** Biome ids this layout is native to — weighted up when a stage/day of that biome rolls. */
  biomes?: readonly string[];
  /** Earliest campaign stage this layout may roll on. Default 1. Flank funnels / pincers wait for
   *  stage 11: they deliver the swarm to the OUTER emplacements a young account has not unlocked,
   *  so a centre-lattice board covers them worst. */
  minStage?: number;
}

/** Rows 0..SPAWN_CLEAR_ROWS-1 stay open: enemies (and bosses) spawn there, never inside a wall. */
export const SPAWN_CLEAR_ROWS = 2;
/** The default layout — config OBSTACLES, the arena the tutorial teaches on. */
export const DEFAULT_LAYOUT_ID = 'classic';
/** Biome-native layouts weigh this × in a biome-flavored roll (others weigh 1). */
const NATIVE_WEIGHT = 3;

// ── The authored layouts (append-only: ids are stable references) ──────────────────────────────
// Grid: 18 cols × 24 rows; obstacles live in rows SPAWN_CLEAR_ROWS..DEFENSE_TOP_ROW-1 (2..17).
export const MAP_LAYOUTS: MapLayoutDef[] = [
  {
    id: DEFAULT_LAYOUT_ID, name: 'The Outcrops', shape: 'scattered', biomes: ['verdant'],
    blurb: 'Scattered chitin outcrops nudge the swarm off its straight line.',
    obstacles: OBSTACLES,
  },
  {
    id: 'gullet', name: 'The Gullet', shape: 'chokepoint', biomes: ['carapace', 'ossuary'],
    blurb: 'A membrane wall spans the field — one central gap feeds the whole swarm through.',
    obstacles: [
      { col: 3, row: 4, w: 2, h: 2 }, { col: 13, row: 4, w: 2, h: 2 },
      { col: 0, row: 9, w: 7, h: 2 }, { col: 11, row: 9, w: 7, h: 2 },
    ],
  },
  {
    id: 'twin_lanes', name: 'Twin Lanes', shape: 'split', biomes: ['frostbound', 'neural'],
    blurb: 'A spine of bone splits the field — each half squeezes through its own gate.',
    obstacles: [
      { col: 8, row: 3, w: 2, h: 13 },
      { col: 0, row: 8, w: 3, h: 2 }, { col: 6, row: 8, w: 2, h: 2 },
      { col: 10, row: 8, w: 2, h: 2 }, { col: 15, row: 8, w: 3, h: 2 },
    ],
  },
  {
    id: 'open_maw', name: 'The Open Maw', shape: 'open', biomes: ['tempest', 'verdant'],
    blurb: 'Almost no cover — the swarm descends in one wide, unbroken front.',
    obstacles: [{ col: 4, row: 7, w: 1, h: 1 }, { col: 13, row: 7, w: 1, h: 1 }],
  },
  {
    id: 'coil', name: 'The Coil', shape: 'maze', biomes: ['necrotic', 'umbral'],
    blurb: 'Staggered baffles wind the swarm side to side — a long road under fire.',
    obstacles: [
      { col: 0, row: 5, w: 12, h: 2 }, { col: 6, row: 10, w: 12, h: 2 }, { col: 0, row: 15, w: 12, h: 2 },
    ],
  },
  {
    id: 'crossroads', name: 'The Crossroads', shape: 'split', biomes: ['neural', 'carapace'], minStage: 6,
    blurb: 'Four plateaus carve three lanes and a cross-cut — the swarm splits and re-merges.',
    obstacles: [
      { col: 2, row: 4, w: 5, h: 4 }, { col: 11, row: 4, w: 5, h: 4 },
      { col: 2, row: 11, w: 5, h: 4 }, { col: 11, row: 11, w: 5, h: 4 },
    ],
  },
  {
    id: 'ribcage', name: 'The Ribcage', shape: 'chokepoint', biomes: ['ossuary', 'necrotic'],
    blurb: 'Ribs reach in from both walls — a long central corridor channels the swarm.',
    obstacles: [
      { col: 0, row: 4, w: 6, h: 1 }, { col: 12, row: 4, w: 6, h: 1 },
      { col: 0, row: 8, w: 5, h: 1 }, { col: 13, row: 8, w: 5, h: 1 },
      { col: 0, row: 12, w: 6, h: 1 }, { col: 12, row: 12, w: 6, h: 1 },
      { col: 0, row: 16, w: 4, h: 1 }, { col: 14, row: 16, w: 4, h: 1 },
    ],
  },
  {
    id: 'flank_sluices', name: 'Flank Sluices', shape: 'funnel', biomes: ['molten', 'ashen'], minStage: 11,
    blurb: 'A central plateau dams the field — the swarm pours down both flank channels.',
    obstacles: [{ col: 3, row: 6, w: 12, h: 4 }, { col: 7, row: 13, w: 4, h: 2 }],
  },
  {
    id: 'delta', name: 'The Delta', shape: 'funnel', biomes: ['frostbound', 'tempest'], minStage: 11,
    blurb: 'A chevron ridge splits the swarm and sheds it toward the outer flanks.',
    obstacles: [
      { col: 8, row: 5, w: 2, h: 2 },
      { col: 6, row: 7, w: 2, h: 2 }, { col: 10, row: 7, w: 2, h: 2 },
      { col: 4, row: 9, w: 2, h: 2 }, { col: 12, row: 9, w: 2, h: 2 },
      { col: 2, row: 11, w: 2, h: 2 }, { col: 14, row: 11, w: 2, h: 2 },
    ],
  },
  {
    id: 'breach', name: 'The Breach', shape: 'scattered', biomes: ['ashen', 'molten'], minStage: 6,
    blurb: 'The swarm bursts from one central breach, then fans across a field of spurs.',
    spawnSpans: [[0.35, 0.65]],
    obstacles: [
      { col: 5, row: 6, w: 2, h: 2 }, { col: 11, row: 6, w: 2, h: 2 },
      { col: 8, row: 10, w: 2, h: 3 },
      { col: 3, row: 13, w: 3, h: 1 }, { col: 12, row: 13, w: 3, h: 1 },
    ],
  },
  {
    id: 'twin_gates', name: 'Twin Gates', shape: 'split', biomes: ['umbral', 'tempest'], minStage: 11,
    blurb: 'Two flank gates spill the swarm down both walls — a pincer on the line.',
    spawnSpans: [[0, 0.22], [0.78, 1]],
    obstacles: [
      { col: 6, row: 3, w: 6, h: 3 },
      { col: 3, row: 11, w: 3, h: 2 }, { col: 12, row: 11, w: 3, h: 2 },
    ],
  },
  {
    id: 'spore_forest', name: 'Spore Forest', shape: 'scattered', biomes: ['verdant', 'necrotic'],
    blurb: 'A forest of spore pillars breaks the swarm into restless, weaving streams.',
    obstacles: [
      { col: 2, row: 4, w: 1, h: 1 }, { col: 6, row: 4, w: 1, h: 1 }, { col: 11, row: 4, w: 1, h: 1 }, { col: 15, row: 4, w: 1, h: 1 },
      { col: 4, row: 7, w: 1, h: 1 }, { col: 8, row: 7, w: 2, h: 1 }, { col: 13, row: 7, w: 1, h: 1 },
      { col: 2, row: 10, w: 1, h: 1 }, { col: 6, row: 10, w: 1, h: 1 }, { col: 11, row: 10, w: 1, h: 1 }, { col: 15, row: 10, w: 1, h: 1 },
      { col: 4, row: 13, w: 1, h: 1 }, { col: 8, row: 13, w: 2, h: 1 }, { col: 13, row: 13, w: 1, h: 1 },
      { col: 2, row: 16, w: 1, h: 1 }, { col: 6, row: 16, w: 1, h: 1 }, { col: 11, row: 16, w: 1, h: 1 }, { col: 15, row: 16, w: 1, h: 1 },
    ],
  },
  {
    id: 'broken_wall', name: 'The Broken Wall', shape: 'chokepoint', biomes: ['carapace', 'molten'], minStage: 11,
    blurb: 'A ruined wall leaves one gap on the far flank — the swarm cuts back across the field.',
    obstacles: [
      { col: 0, row: 10, w: 13, h: 2 },
      { col: 14, row: 5, w: 4, h: 1 },
      { col: 4, row: 14, w: 2, h: 2 },
    ],
  },
];

// ── Validator ────────────────────────────────────────────────────────────────────────────────

/** Every invariant a layout must hold (empty = valid). Builds a throwaway NavField. */
export function layoutProblems(d: MapLayoutDef): string[] {
  const errs: string[] = [];
  if (!d.id || !d.name) errs.push('a layout needs an id and a name');
  for (const r of d.obstacles) {
    const tag = `rect {col:${r.col},row:${r.row},w:${r.w},h:${r.h}}`;
    if (!(r.w >= 1 && r.h >= 1 && Number.isInteger(r.w) && Number.isInteger(r.h) && Number.isInteger(r.col) && Number.isInteger(r.row))) errs.push(`${tag} must be a positive integer rect`);
    if (r.col < 0 || r.col + r.w > COLS) errs.push(`${tag} leaves the arena horizontally`);
    if (r.row < SPAWN_CLEAR_ROWS) errs.push(`${tag} intrudes into the spawn band (rows < ${SPAWN_CLEAR_ROWS})`);
    if (r.row + r.h > DEFENSE_TOP_ROW) errs.push(`${tag} intrudes into the defensive region (rows ≥ ${DEFENSE_TOP_ROW})`);
  }
  const field = new NavField(d.obstacles);
  for (const s of towerSlots) if (field.isObstacle(s.col, s.row)) errs.push(`blocks tower slot ${s.index}`);
  // Every passable cell above the line reaches it (this covers every top spawn column too).
  for (let row = 0; row < DEFENSE_TOP_ROW; row++) {
    for (let col = 0; col < COLS; col++) {
      if (field.isObstacle(col, row)) continue;
      if (!isFinite(field.cellDistance(col, row))) {
        errs.push(row === 0 ? `top spawn column ${col} has no path to the line` : `sealed pocket at (${col},${row}) — no path to the line`);
      }
    }
  }
  if (d.spawnSpans) {
    if (d.spawnSpans.length === 0) errs.push('spawnSpans, when given, needs at least one span');
    let prev = 0;
    for (const [lo, hi] of d.spawnSpans) {
      if (!(lo >= prev && hi > lo && hi <= 1)) errs.push(`spawn span [${lo}, ${hi}] must be ordered, non-overlapping and inside [0, 1]`);
      prev = hi;
    }
  }
  if (d.minStage !== undefined && !(Number.isInteger(d.minStage) && d.minStage >= 1)) errs.push('minStage must be an integer ≥ 1');
  return errs;
}

export const layoutRegistry = new Registry<MapLayoutDef>('layout', { idOf: (d) => d.id, validate: layoutProblems });
layoutRegistry.registerAll(MAP_LAYOUTS);

/** A layout by id; unknown ids fall back to the default (a stale/foreign id never breaks a run). */
export function layoutById(id: string | undefined): MapLayoutDef {
  return (id !== undefined ? layoutRegistry.get(id) : undefined) ?? layoutRegistry.require(DEFAULT_LAYOUT_ID);
}

// ── Navigation fields (cached per id — immutable once built, so sharing is safe) ─────────────
const fieldCache = new Map<string, NavField>();
/** The NavField for a layout id. The default layout resolves to map.ts's module field itself,
 *  so the golden path reads the exact same object it always did. */
export function navFieldFor(id: string | undefined): NavField {
  const def = layoutById(id);
  if (def.id === DEFAULT_LAYOUT_ID) return defaultNavField();
  let f = fieldCache.get(def.id);
  if (!f) {
    f = new NavField(def.obstacles, { solidWalls: true });
    fieldCache.set(def.id, f);
  }
  return f;
}

/** A spawn point along the top edge for t in [0,1) under a layout's spawn spans. No spans ⇒
 *  map.ts topSpawn(t) exactly (golden-safe); spans remap t proportionally across their total
 *  length (one rng draw either way — the run's rng stream is unchanged by a layout). */
export function layoutSpawn(def: MapLayoutDef, t: number): Vec2 {
  const spans = def.spawnSpans;
  if (!spans || spans.length === 0) return topSpawn(t);
  let total = 0;
  for (const [lo, hi] of spans) total += hi - lo;
  let u = t * total;
  for (const [lo, hi] of spans) {
    const len = hi - lo;
    if (u < len) return topSpawn(lo + u);
    u -= len;
  }
  const last = spans[spans.length - 1];
  return topSpawn(last[1] - 1e-6);
}

// ── Selection policy (docs/MAP-LAYOUTS.md §selection) ─────────────────────────────────────────

/** Layouts eligible for a roll at `stage` (minStage-gated), in registry order. */
export function layoutPool(stage: number): MapLayoutDef[] {
  return layoutRegistry.active().filter((d) => (d.minStage ?? 1) <= stage);
}

/** Biome-flavored weighted pick from the pool at `stage`, never `exclude` (the previous pick).
 *  One rng draw. Deterministic in (rng state, stage, biomeId, exclude). */
export function pickLayoutId(rng: Rng, stage: number, biomeId: string, exclude?: string): string {
  const pool = layoutPool(stage).filter((d) => d.id !== exclude);
  if (pool.length === 0) return DEFAULT_LAYOUT_ID;
  const weights = pool.map((d) => (d.biomes?.includes(biomeId) ? NATIVE_WEIGHT : 1));
  let total = 0;
  for (const w of weights) total += w;
  let u = rng.next() * total;
  for (let i = 0; i < pool.length; i++) {
    u -= weights[i];
    if (u < 0) return pool[i].id;
  }
  return pool[pool.length - 1].id;
}

/** Infinite's rotation: each biome period (5 depths, biomes.ts BIOME_PERIOD) fields the next
 *  layout in registry order — period 0 is the classic arena, so the opening depths (and the
 *  Arena's first waves) are unchanged. Consecutive periods never repeat (≥ 2 layouts). */
export function layoutIdForDepth(depth: number): string {
  const all = layoutRegistry.active();
  const p = Math.floor(Math.max(0, depth - 1) / BIOME_PERIOD);
  return all[p % all.length].id;
}
