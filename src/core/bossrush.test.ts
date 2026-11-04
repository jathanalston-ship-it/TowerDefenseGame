// Boss Rush (docs/BOSS-RUSH.md): wave N deploys N procedural bosses in a staggered siege column,
// screened by a THINNED director escort; Gene Cards draft every 2nd cleared wave; the run never
// "wins" — it only ends when the Nucleus falls. These pin the mode's sim contracts.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { RUSH, SIM_DT, rushStrength } from './config';
import { towerSlots } from './map';
import type { MetaModifiers, TowerKind } from './types';

// Tanky Nucleus so survival never confounds a CONTRACT test — we assert what the mode DOES,
// not whether the autopilot can hold the line (that's the balance probe's job).
const TANKY_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 100_000, bonusSlots: 0 };
const KINDS: TowerKind[] = ['needle', 'mortar', 'reactor'];

function rushGame(seed = 7): Game {
  return new Game(seed, TANKY_META, undefined, undefined, undefined, { mode: 'bossRush' });
}

function placeAll(g: Game): void {
  for (let i = 0; i < towerSlots.length; i++) g.placeTower(KINDS[i % KINDS.length], towerSlots[i].x, towerSlots[i].y);
}

/** Advance until the predicate holds (or the sim-seconds budget runs out). */
function until(g: Game, pred: () => boolean, seconds = 600): boolean {
  let t = 0;
  while (!pred() && t < seconds) {
    g.advance(SIM_DT);
    t += SIM_DT;
  }
  return pred();
}

/** Play waves 1..untilWave, recording drafts + every distinct boss entity per wave. */
function playRush(seed: number, untilWave: number) {
  const g = rushGame(seed);
  const drafts: number[] = [];
  const bossesByWave = new Map<number, number>();
  const defIds: string[] = [];
  const seen = new Set<number>();
  let guard = 0;
  while (g.phase !== 'lost' && guard++ < 900_000) {
    if (g.phase === 'draft') {
      drafts.push(g.waveIndex);
      g.chooseCard(g.getSnapshot().draft![0].id);
      continue;
    }
    if (g.phase === 'prep') {
      if (g.waveIndex >= untilWave) break;
      placeAll(g);
      g.startWave();
    }
    g.advance(SIM_DT);
    for (const e of g.enemies) {
      if (e.boss !== null && !seen.has(e.id)) {
        seen.add(e.id);
        defIds.push(e.boss.defId);
        bossesByWave.set(g.waveIndex, (bossesByWave.get(g.waveIndex) ?? 0) + 1);
      }
    }
  }
  return { g, drafts, bossesByWave, defIds };
}

describe('Boss Rush mode (docs/BOSS-RUSH.md)', () => {
  it('wave N deploys exactly N bosses; ids never collide; drafts land every 2nd wave', () => {
    const { g, drafts, bossesByWave, defIds } = playRush(7, 4);
    expect(g.phase).not.toBe('lost'); // tanky harness survived — the contracts below are meaningful
    expect(bossesByWave.get(1)).toBe(1);
    expect(bossesByWave.get(2)).toBe(2);
    expect(bossesByWave.get(3)).toBe(3);
    expect(bossesByWave.get(4)).toBe(4);
    // Concurrent same-chassis bosses must resolve their OWN defs (uniquified ids).
    expect(new Set(defIds).size).toBe(defIds.length);
    // Fixed cadence: a Gene Card after waves 2 and 4 — never 1 or 3.
    expect(drafts).toEqual([2, 4]);
    // Every deployed boss died to clear the wave → the run stat booked at least the 10 spawned
    // (splitter bosses can add more; each split IS a boss death).
    expect(g.getRunStats().bossKills).toBeGreaterThanOrEqual(10);
    expect(g.getRunStats().wave).toBe(4);
  });

  it('staggers a wave\'s bosses instead of dropping one simultaneous wall', () => {
    const g = rushGame(11);
    placeAll(g);
    g.startWave(); // wave 1 (1 boss) — clear it
    expect(until(g, () => g.phase === 'prep' || g.phase === 'draft')).toBe(true);
    if (g.phase === 'draft') g.chooseCard(g.getSnapshot().draft![0].id);
    g.startWave(); // wave 2 (2 bosses)
    g.advance(SIM_DT); // first boss deploys immediately …
    expect(g.enemies.filter((e) => e.boss !== null).length).toBe(1);
    const t0 = g.time;
    expect(until(g, () => g.enemies.filter((e) => e.boss !== null).length >= 2, 10)).toBe(true);
    // … the second arrives on the configured stagger, not the same tick.
    expect(g.time - t0).toBeGreaterThanOrEqual(RUSH.bossStagger - 2 * SIM_DT);
  });

  it("never 'wins' — the settle gate keeps the gauntlet going past any wave count", () => {
    // Drive the gate at its seam: endWave decides won/draft/prep after the settle beat.
    const rush = rushGame(3);
    (rush as unknown as { waveIndex: number }).waveIndex = 99; // far beyond any stage's totalWaves
    (rush as unknown as { endWave: () => void }).endWave();
    expect(rush.phase).toBe('prep'); // straight back to build — no stage-clear

    const stage = new Game(3, TANKY_META, undefined, undefined, undefined, { mode: 'stage' });
    (stage as unknown as { waveIndex: number }).waveIndex = 99;
    (stage as unknown as { endWave: () => void }).endWave();
    expect(stage.phase).toBe('won'); // …while the same gate DOES clear a finite mode
  });

  it('hides the scripted wave preview and flags the HUD', () => {
    const g = rushGame();
    expect(g.getNextWavePreview()).toBeNull();
    const hud = g.getSnapshot();
    expect(hud.bossRush).toBe(true);
    expect(hud.endless).toBe(false);
    // The anticipation rail dreads the next siege line + names the next Gene Card wave.
    expect(hud.anticipation.some((a) => a.includes('1 boss at wave 1'))).toBe(true);
    expect(hud.anticipation.some((a) => a.includes('Gene Card at wave 2'))).toBe(true);
  });

  it('stage and endless runs never touch the rush path (no pending bosses, no rush stats)', () => {
    const g = new Game(7, TANKY_META, undefined, undefined, undefined, { mode: 'stage' });
    placeAll(g);
    g.startWave();
    expect(until(g, () => g.phase === 'prep' || g.phase === 'draft', 300)).toBe(true);
    expect(g.getRunStats().bossKills).toBe(0);
    expect(g.getSnapshot().bossRush).toBe(false);
  });
});

// THE WALL (docs/BOSS-RUSH.md §wall, 2026-11): a geometric column past geoFromWave, sized to the
// account's Power, and a column that doesn't wait for a board that can't keep pace.
describe('Boss Rush — the wall', () => {
  it('the column strength eases in, climbs linearly, then grows geometrically (uncapped)', () => {
    expect(rushStrength(1)).toBeCloseTo(RUSH.strengthBase, 9);
    expect(rushStrength(4)).toBeCloseTo(1, 9); // ×1 at wave 4 (the probe-tuned anchor)
    for (let n = 2; n <= 30; n++) expect(rushStrength(n)).toBeGreaterThan(rushStrength(n - 1));
    const g = RUSH.geoFromWave;
    expect(rushStrength(g + 1) / rushStrength(g)).toBeCloseTo(RUSH.geoGrowth, 9);
    expect(rushStrength(g + 6) / rushStrength(g + 5)).toBeCloseTo(RUSH.geoGrowth, 9);
  });

  it('boss HP is sized to the account: ×1 through the opening duels, ×(P/ref)^exp from powerRampTo', () => {
    const bossHpAt = (rushPower: number | undefined, depth: number): number => {
      const g = new Game(5, TANKY_META, undefined, undefined, undefined, { mode: 'bossRush', ...(rushPower !== undefined ? { rushPower } : {}) });
      (g as unknown as { waveIndex: number }).waveIndex = depth - 1;
      g.startWave();
      g.advance(SIM_DT); // the column's first boss deploys immediately
      return g.enemies.find((e) => e.boss !== null)!.maxHp;
    };
    const strong = RUSH.powerRef * 16;
    expect(bossHpAt(strong, 1)).toBeCloseTo(bossHpAt(undefined, 1), 6); // the warm-up is never sized
    expect(bossHpAt(RUSH.powerRef, RUSH.powerRampTo)).toBeCloseTo(bossHpAt(undefined, RUSH.powerRampTo), 6); // omitted ⇒ the reference
    expect(bossHpAt(strong, RUSH.powerRampTo) / bossHpAt(undefined, RUSH.powerRampTo)).toBeCloseTo(Math.pow(16, RUSH.powerExp), 4);
    // Every other mode ignores rushPower.
    const stage = new Game(5, TANKY_META, undefined, undefined, undefined, { mode: 'stage', rushPower: strong });
    expect((stage as unknown as { rushHpScale: number }).rushHpScale).toBe(1);
  });

  it("the column doesn't wait: past its grace window the next column marches in on top — no prep, nothing dropped", () => {
    const g = rushGame(9);
    g.startWave(); // wave 1: one boss, no board to kill it
    expect((g as unknown as { rushColumnDue: number }).rushColumnDue).toBeCloseTo(g.time + RUSH.columnGraceSec, 6); // 1 boss ⇒ no stagger span
    g.advance(SIM_DT);
    expect(g.enemies.some((e) => e.alive && e.boss !== null)).toBe(true);
    expect(until(g, () => g.waveIndex === 2 || g.phase !== 'wave', RUSH.columnGraceSec + 2)).toBe(true);
    expect(g.waveIndex).toBe(2); // the board never cleared wave 1 — the next column came anyway
    expect(g.phase).toBe('wave'); // straight on top — no prep, no draft between
    expect(g.getSnapshot().anticipation.some((a) => a.includes('marches in'))).toBe(true);
    // Wave 2's two bosses arrive on the stagger beside whatever still stands.
    let deployed = 0;
    const seen = new Set<number>(g.enemies.filter((e) => e.boss !== null).map((e) => e.id));
    until(g, () => {
      for (const e of g.enemies) if (e.boss !== null && !seen.has(e.id)) { seen.add(e.id); deployed++; }
      return deployed >= 2;
    }, RUSH.bossStagger * 2 + 1);
    expect(deployed).toBeGreaterThanOrEqual(2);
  });
});
