// ARENA LAYOUTS (docs/MAP-LAYOUTS.md) — pins the registry invariants (every layout routable, out of
// the defensive region, off every slot), that the authored set genuinely changes routing, the
// deterministic selection policy (Campaign pins + biome-flavored rolls, the Daily's seeded roll,
// Infinite's biome-period rotation), and that a Game OWNS its layout (no leak between Games).

import { describe, expect, it } from 'vitest';
import { OBSTACLES, SIM_DT } from './config';
import { CELL, COLS, DEFENSE_TOP_ROW, ROWS, center, defaultNavField, flowDirAt, goalDistanceAt, topSpawn, towerSlots, WIDTH } from './map';
import type { NavField } from './map';
import {
  DEFAULT_LAYOUT_ID, MAP_LAYOUTS, SPAWN_CLEAR_ROWS, layoutById, layoutIdForDepth, layoutPool, layoutProblems,
  layoutRegistry, layoutSpawn, navFieldFor, pickLayoutId,
} from './mapLayouts';
import type { MapLayoutDef } from './mapLayouts';
import { CAMPAIGN_LAYOUT_PINS, biomeForStage, generateStage, layoutForStage } from './campaign';
import { generateDaily } from './daily';
import { BIOME_PERIOD } from './biomes';
import { Game } from './game';
import { validateAllContent } from './validate';
import { autoplay } from './sim.testutil';
import { Rng } from './rng';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

/** Where each top spawn column's flow line crosses into the defensive region — a layout's
 *  routing fingerprint (follows the flow field in 4px steps, exactly like an unhindered enemy). */
function entryColumns(field: NavField): number[] {
  const out: number[] = [];
  for (let c = 1; c < COLS - 1; c++) {
    let p = center(c, 0);
    for (let steps = 0; p.y < DEFENSE_TOP_ROW * CELL && steps < 4000; steps++) {
      const v = field.flowDirAt(p.x, p.y);
      p = { x: p.x + v.x * 4, y: p.y + v.y * 4 };
    }
    out.push(Math.floor(p.x / CELL));
  }
  return out;
}

const bad = (over: Partial<MapLayoutDef>): string[] => layoutProblems({ id: 'probe', name: 'Probe', blurb: '', shape: 'open', obstacles: [], ...over });

describe('layout registry invariants', () => {
  it('ships at least 8 authored layouts with unique ids', () => {
    expect(MAP_LAYOUTS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(MAP_LAYOUTS.map((d) => d.id)).size).toBe(MAP_LAYOUTS.length);
    expect(layoutRegistry.size).toBe(MAP_LAYOUTS.length);
  });

  it.each(MAP_LAYOUTS.map((d) => [d.id, d] as const))('%s is valid (routable, clear of the defense + slots + spawn band)', (_id, d) => {
    expect(layoutProblems(d)).toEqual([]);
    const field = navFieldFor(d.id);
    // Belt-and-braces on the brief's three invariants, independent of the validator:
    for (let col = 1; col < COLS - 1; col++) expect(isFinite(field.cellDistance(col, 0)), `top column ${col} reaches the line`).toBe(true);
    for (const o of field.cells) {
      expect(o.row).toBeGreaterThanOrEqual(SPAWN_CLEAR_ROWS);
      expect(o.row).toBeLessThan(DEFENSE_TOP_ROW); // never the defensive / final-defense region
    }
    for (const s of towerSlots) expect(field.isObstacle(s.col, s.row)).toBe(false);
  });

  it('the dev-boot content validator covers the layout registry', () => {
    expect(validateAllContent().filter((p) => p.startsWith('layout'))).toEqual([]);
  });

  it('every layout genuinely re-routes the swarm (a distinct entry fingerprint)', () => {
    const prints = MAP_LAYOUTS.map((d) => entryColumns(navFieldFor(d.id)).join(','));
    expect(new Set(prints).size).toBe(MAP_LAYOUTS.length);
  });

  it('the validator rejects every broken shape', () => {
    expect(bad({ obstacles: [{ col: 0, row: 8, w: COLS, h: 1 }] }).join()).toMatch(/no path to the line/); // a full-width wall
    expect(bad({ obstacles: [{ col: 4, row: DEFENSE_TOP_ROW - 1, w: 2, h: 2 }] }).join()).toMatch(/defensive region/);
    expect(bad({ obstacles: [{ col: 4, row: 20, w: 1, h: 1 }] }).join()).toMatch(/defensive region/);
    expect(bad({ obstacles: [{ col: 4, row: 1, w: 2, h: 2 }] }).join()).toMatch(/spawn band/);
    expect(bad({ obstacles: [{ col: COLS - 1, row: 6, w: 3, h: 1 }] }).join()).toMatch(/leaves the arena/);
    // A sealed pocket: a ring of walls around one open cell.
    const ring = [{ col: 5, row: 5, w: 3, h: 1 }, { col: 5, row: 7, w: 3, h: 1 }, { col: 5, row: 6, w: 1, h: 1 }, { col: 7, row: 6, w: 1, h: 1 }];
    expect(bad({ obstacles: ring }).join()).toMatch(/sealed pocket at \(6,6\)/);
    expect(bad({ spawnSpans: [[0.5, 0.4]] }).join()).toMatch(/spawn span/);
    expect(bad({ spawnSpans: [[0, 0.5], [0.4, 0.9]] }).join()).toMatch(/spawn span/);
    expect(bad({ minStage: 0 }).join()).toMatch(/minStage/);
    expect(bad({})).toEqual([]); // the empty field is legal
  });
});

describe('the default (classic) layout is the legacy arena, byte-for-byte', () => {
  it('is config OBSTACLES and resolves to the module field itself', () => {
    expect(layoutById(DEFAULT_LAYOUT_ID).obstacles).toBe(OBSTACLES);
    expect(navFieldFor(DEFAULT_LAYOUT_ID)).toBe(defaultNavField());
    expect(layoutById('no-such-layout').id).toBe(DEFAULT_LAYOUT_ID); // unknown ids degrade, never throw
  });

  it('the module-level flow helpers read the default field', () => {
    const f = defaultNavField();
    for (let r = 0; r < ROWS; r += 3) {
      for (let c = 0; c < COLS; c += 2) {
        const x = c * CELL + 7;
        const y = r * CELL + 31;
        expect(flowDirAt(x, y)).toBe(f.flowDirAt(x, y));
        expect(goalDistanceAt(x, y)).toBe(f.goalDistanceAt(x, y));
      }
    }
  });

  it('spawns without spans are exactly topSpawn; spans confine the edge', () => {
    const classic = layoutById(DEFAULT_LAYOUT_ID);
    for (const t of [0, 0.123, 0.5, 0.999]) expect(layoutSpawn(classic, t)).toEqual(topSpawn(t));
    const gated = MAP_LAYOUTS.filter((d) => d.spawnSpans);
    expect(gated.length).toBeGreaterThan(0);
    for (const d of gated) {
      const spans = d.spawnSpans!.map(([lo, hi]) => [topSpawn(lo).x, topSpawn(hi).x]);
      for (let i = 0; i < 50; i++) {
        const x = layoutSpawn(d, i / 50).x;
        expect(spans.some(([lo, hi]) => x >= lo - 1e-9 && x <= hi + 1e-9), `${d.id}: x=${x}`).toBe(true);
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(WIDTH);
      }
    }
  });
});

describe('solid walls (authored layouts) vs the legacy classic fallback', () => {
  it('a body inside an authored wall is steered OUT toward an adjacent open cell, never deeper', () => {
    for (const d of MAP_LAYOUTS) {
      if (d.id === DEFAULT_LAYOUT_ID) continue;
      const f = navFieldFor(d.id);
      for (const o of f.cells) {
        const v = f.flowDirAt(o.x, o.y);
        expect(Math.hypot(v.x, v.y), `${d.id} (${o.col},${o.row})`).toBeGreaterThan(1); // dominates the steering blend
        // One step along the escape lands on a cell no deeper in the wall (an open one at the rim).
        const nc = o.col + Math.round(v.x / Math.hypot(v.x, v.y));
        const nr = o.row + Math.round(v.y / Math.hypot(v.x, v.y));
        const rim = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].some(([dc, dr]) => !f.isObstacle(o.col + dc, o.row + dr));
        if (rim) expect(f.isObstacle(nc, nr), `${d.id} (${o.col},${o.row}) escapes into a wall`).toBe(false);
      }
    }
  });

  it('the classic field keeps the legacy straight-down fallback (golden path)', () => {
    const f = defaultNavField();
    for (const o of f.cells) expect(f.flowDirAt(o.x, o.y)).toEqual({ x: 0, y: 1 });
  });
});

describe('selection policy — deterministic, biome-flavored, never a back-to-back repeat', () => {
  it('Campaign: onboarding pins, then rolls that respect minStage and never repeat', () => {
    for (const [st, id] of Object.entries(CAMPAIGN_LAYOUT_PINS)) expect(layoutForStage(Number(st))).toBe(id);
    for (let st = 1; st <= 400; st++) {
      const id = layoutForStage(st);
      expect(layoutRegistry.has(id)).toBe(true);
      expect(layoutById(id).minStage ?? 1).toBeLessThanOrEqual(st);
      if (st > 1) expect(id, `stage ${st} repeats stage ${st - 1}`).not.toBe(layoutForStage(st - 1));
    }
    // Every layout eventually appears on the ladder (the pool is real, not a technicality).
    const seen = new Set(Array.from({ length: 400 }, (_, i) => layoutForStage(i + 1)));
    expect(seen.size).toBe(MAP_LAYOUTS.length);
  });

  it('Campaign: the stage carries its layout, identical across difficulties and calls', () => {
    for (const st of [1, 2, 3, 7, 19, 44]) {
      expect(generateStage(st).layout).toBe(layoutForStage(st));
      expect(generateStage(st, 'nightmare').layout).toBe(generateStage(st, 'standard').layout);
    }
  });

  it('biome-native layouts are weighted up in their biome', () => {
    let native = 0;
    let rolls = 0;
    for (let st = 6; st <= 400; st++) {
      const d = layoutById(layoutForStage(st));
      if (CAMPAIGN_LAYOUT_PINS[st]) continue;
      rolls++;
      if (d.biomes?.includes(biomeForStage(st).id)) native++;
    }
    // Uniform odds would land ~2 natives per biome over the pool; the ×3 weight must show.
    const uniform = MAP_LAYOUTS.reduce((n, d) => n + (d.biomes?.length ?? 0), 0) / 10 / layoutPool(400).length;
    expect(native / rolls).toBeGreaterThan(uniform * 1.5);
  });

  it('pickLayoutId: one draw, deterministic, honours the exclusion', () => {
    for (let s = 0; s < 40; s++) {
      const a = pickLayoutId(new Rng(s), 12, 'verdant', 'classic');
      expect(a).toBe(pickLayoutId(new Rng(s), 12, 'verdant', 'classic'));
      expect(a).not.toBe('classic');
    }
  });

  it('Daily: the day picks a stable, valid layout of its own', () => {
    const days = ['2026-01-01', '2026-03-15', '2026-07-04', '2026-11-03', '2027-02-28'];
    const ids = days.map((k) => generateDaily(k).stage.layout!);
    for (let i = 0; i < days.length; i++) {
      expect(layoutRegistry.has(ids[i])).toBe(true);
      expect(generateDaily(days[i]).stage.layout).toBe(ids[i]);
    }
  });

  it('Infinite: the classic arena opens, then each biome period brings the next layout', () => {
    expect(layoutIdForDepth(1)).toBe(DEFAULT_LAYOUT_ID);
    expect(layoutIdForDepth(BIOME_PERIOD)).toBe(DEFAULT_LAYOUT_ID);
    for (let d = 2; d <= 300; d++) {
      const same = Math.floor((d - 1) / BIOME_PERIOD) === Math.floor((d - 2) / BIOME_PERIOD);
      if (same) expect(layoutIdForDepth(d)).toBe(layoutIdForDepth(d - 1));
      else expect(layoutIdForDepth(d)).not.toBe(layoutIdForDepth(d - 1));
    }
  });
});

/** Drive a Game through its waves (auto-draft card 0) until `until` holds or it ends. */
function drive(g: Game, until: () => boolean, maxSec = 900): void {
  for (let t = 0; t < maxSec && !until() && g.phase !== 'won' && g.phase !== 'lost'; t += SIM_DT) {
    if (g.phase === 'draft') { g.chooseCard(g.getSnapshot().draft![0].id); continue; }
    if (g.phase === 'prep') {
      for (const s of towerSlots) if (g.towers.length < 6) g.placeTower('needle', s.x, s.y);
      g.startWave();
    }
    g.advance(SIM_DT);
  }
}

describe('the Game owns its layout', () => {
  it('resolves pin → stage → mode default, and surfaces it to the renderer', () => {
    expect(new Game(1, NO_META).getRenderState().layoutId).toBe(DEFAULT_LAYOUT_ID); // Skirmish / golden
    expect(new Game(1, NO_META, undefined, undefined, undefined, { mode: 'endless' }).getRenderState().layoutId).toBe(DEFAULT_LAYOUT_ID);
    const stage = generateStage(2);
    expect(new Game(1, NO_META, undefined, undefined, undefined, { mode: 'campaign', stage }).getRenderState().layoutId).toBe(stage.layout);
    expect(new Game(1, NO_META, undefined, undefined, undefined, { mode: 'campaign', stage, layout: 'coil' }).getRenderState().layoutId).toBe('coil');
    expect(new Game(1, NO_META, undefined, undefined, undefined, { mode: 'campaign', stage: { ...stage, layout: undefined } }).getRenderState().layoutId).toBe(DEFAULT_LAYOUT_ID);
  });

  it('Infinite re-lays the arena when the biome rotates; a pin holds it', () => {
    const STRONG: MetaModifiers = { ...NO_META, towerDamageMult: 20 }; // survive to the biome turn — the layout is under test, not the defense
    const g = new Game(5, STRONG, undefined, undefined, undefined, { mode: 'endless' });
    g.debugAddBiomass(4000);
    drive(g, () => g.waveIndex > BIOME_PERIOD && g.phase === 'wave');
    expect(g.waveIndex).toBe(BIOME_PERIOD + 1);
    expect(g.getRenderState().layoutId).toBe(layoutIdForDepth(BIOME_PERIOD + 1));
    expect(g.getRenderState().layoutId).not.toBe(DEFAULT_LAYOUT_ID);
    const pinned = new Game(5, STRONG, undefined, undefined, undefined, { mode: 'endless', layout: 'gullet' });
    pinned.debugAddBiomass(4000);
    drive(pinned, () => pinned.waveIndex > BIOME_PERIOD && pinned.phase === 'wave');
    expect(pinned.getRenderState().layoutId).toBe('gullet');
  });

  it('a layout changes the run (the flow field is really in use)', () => {
    const run = (layout: string): string => {
      const g = new Game(77, NO_META, undefined, undefined, undefined, { mode: 'campaign', stage: generateStage(4), layout });
      drive(g, () => g.waveIndex >= 2 && g.phase === 'wave' && g.time > 40, 300);
      return g.enemies.filter((e) => e.alive).map((e) => `${e.x.toFixed(2)},${e.y.toFixed(2)}`).join('|');
    };
    expect(run('coil')).not.toBe(run('classic'));
  });

  it('never leaks between Games: interleaving a re-laid run leaves a classic run byte-identical', () => {
    const alone = autoplay(42);
    // Interleave a golden-path game with a Coil campaign game, step for step, in one process.
    const other = new Game(9, NO_META, undefined, undefined, undefined, { mode: 'campaign', stage: generateStage(4), layout: 'coil' });
    const golden = new Game(42, NO_META);
    const KINDS = ['needle', 'mortar', 'reactor'] as const;
    for (let t = 0; t < 600 && golden.phase !== 'won' && golden.phase !== 'lost'; t += SIM_DT) {
      if (golden.phase === 'draft') { golden.chooseCard(golden.getSnapshot().draft![0].id); continue; }
      if (golden.phase === 'prep') {
        let placed = 0;
        for (let i = 0; i < towerSlots.length && placed < 3; i++) if (golden.placeTower(KINDS[i % 3], towerSlots[i].x, towerSlots[i].y)) placed++;
        golden.startWave();
      }
      golden.advance(SIM_DT);
      // the other Game advances on its own layout between every golden step
      if (other.phase === 'draft') other.chooseCard(other.getSnapshot().draft![0].id);
      else if (other.phase === 'prep') { other.placeTower('needle', towerSlots[0].x, towerSlots[0].y); other.startWave(); }
      if (other.phase !== 'won' && other.phase !== 'lost') other.advance(SIM_DT);
    }
    expect({ wave: golden.waveIndex, kills: golden.kills, integrity: Math.round(golden.integrity), biomass: Math.round(golden.biomass), phase: golden.phase })
      .toEqual({ wave: alone.wave, kills: alone.kills, integrity: alone.integrity, biomass: alone.biomass, phase: alone.phase });
    expect(other.getRenderState().layoutId).toBe('coil');
  });
});
