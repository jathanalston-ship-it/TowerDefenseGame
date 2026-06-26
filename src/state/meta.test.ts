import { describe, it, expect } from 'vitest';
import { meta } from './meta';
import { lootMeterSize } from '../core/config';
import type { RunResult } from '../core/game';

function result(over: Partial<RunResult>): RunResult {
  return {
    mode: 'classic', won: false, wave: 1, kills: 0, stageNumber: 0,
    rewardMultiplier: 1, objectiveDone: false, objectiveBonus: 0, score: 0,
    biome: null, enemiesSeen: [], cardsSeen: [], ...over,
  };
}

describe('reward economy', () => {
  it('pays each mode in its OWN currencies toward different sinks', () => {
    meta.reset();
    const start = meta.get();

    // Stage → Shards + Components; clearing advances the path.
    const stage = meta.recordRun(result({ mode: 'stage', won: true, wave: 9, kills: 120, stageNumber: 3, rewardMultiplier: 1.2, objectiveDone: true, objectiveBonus: 0.5 }));
    expect(stage.shards).toBeGreaterThan(0);
    expect(stage.components).toBeGreaterThan(0);
    expect(stage.essence).toBe(0);
    expect(stage.catalyst).toBe(0);
    expect(meta.get().shards).toBe(start.shards + stage.shards);
    expect(meta.get().components).toBe(start.components + stage.components);
    expect(meta.get().bestStage).toBe(3);
    expect(meta.get().stagesCleared).toBe(1);

    // Endless → Essence + Catalyst (prestige) + leaderboard; no Shards.
    const endless = meta.recordRun(result({ mode: 'endless', wave: 25, kills: 300, score: 99999 }));
    expect(endless.essence).toBeGreaterThan(0);
    expect(endless.catalyst).toBe(2); // floor(25 / 10)
    expect(endless.shards).toBe(0);
    expect(meta.get().essence).toBeGreaterThan(0);
    expect(meta.get().bestEndlessScore).toBe(99999);
    expect(meta.get().lifetimeShards).toBe(start.lifetimeShards + stage.shards); // endless adds none
    meta.reset();
  });

  it('buyUpgrade spends the upgrade\'s own currency', () => {
    meta.reset();
    meta.debugAddShards(10000); // tops up shards + essence + components
    const before = meta.get();
    expect(meta.buyUpgrade('lethality')).toBe(true); // Shards
    expect(meta.get().shards).toBeLessThan(before.shards);
    expect(meta.get().essence).toBe(before.essence); // untouched

    const e0 = meta.get().essence;
    expect(meta.buyUpgrade('overclock')).toBe(true); // Essence
    expect(meta.get().essence).toBeLessThan(e0);
    meta.reset();
  });

  it('cannot buy without the right currency', () => {
    meta.reset();
    expect(meta.get().essence).toBe(0);
    expect(meta.buyUpgrade('overclock')).toBe(false); // no essence
    meta.reset();
  });

  it('Catalyst earned in Endless is spendable on the Prestige track (no dead currency)', () => {
    meta.reset();
    // Deep Endless run mints Catalyst (floor(wave/10)).
    const endless = meta.recordRun(result({ mode: 'endless', wave: 40, kills: 500, score: 50000 }));
    expect(endless.catalyst).toBe(4);
    expect(meta.get().catalyst).toBe(4);

    const before = meta.get();
    expect(meta.buyUpgrade('viral_apex')).toBe(true); // Prestige node, costs Catalyst
    expect(meta.get().catalyst).toBeLessThan(before.catalyst);
    expect(meta.get().shards).toBe(before.shards); // other currencies untouched
    meta.reset();
  });
});

describe('codex & achievements (motivation layer)', () => {
  it('folds run discoveries into the permanent codex (deduped union)', () => {
    meta.reset();
    meta.recordRun(result({ mode: 'stage', won: true, stageNumber: 1, biome: 'marsh', enemiesSeen: ['runner', 'brute'], cardsSeen: ['sharpened_needles'] }));
    let s = meta.get();
    expect(s.codex.enemies.sort()).toEqual(['brute', 'runner']);
    expect(s.codex.biomes).toEqual(['marsh']);
    expect(s.codex.cards).toEqual(['sharpened_needles']);

    // A second run unions new sightings without duplicating old ones.
    meta.recordRun(result({ mode: 'endless', wave: 5, biome: 'marsh', enemiesSeen: ['runner', 'rusher'], cardsSeen: ['sharpened_needles', 'rapid_glands'] }));
    s = meta.get();
    expect(s.codex.enemies.sort()).toEqual(['brute', 'runner', 'rusher']);
    expect(s.codex.biomes).toEqual(['marsh']); // not duplicated
    expect(s.codex.cards.sort()).toEqual(['rapid_glands', 'sharpened_needles']);
    expect(s.cardsSeen).toBe(2); // legacy count stays in sync
    meta.reset();
  });

  it('unlocks achievements + a title, reporting only the NEW ones for this run', () => {
    meta.reset();
    // First finished run → "First Assimilation"; clearing all 12 classic waves → "Extraction" (+ title).
    const r = meta.recordRun(result({ mode: 'classic', won: true, wave: 12, kills: 50 }));
    expect(r.newAchievements).toContain('First Assimilation');
    expect(r.newAchievements).toContain('Extraction');
    expect(r.newTitle).toBe('Defender');
    expect(meta.get().title).toBe('Defender');
    expect(meta.get().achievements).toContain('extraction');

    // A second, lesser run unlocks nothing new (idempotent — no repeats).
    const r2 = meta.recordRun(result({ mode: 'classic', won: false, wave: 3 }));
    expect(r2.newAchievements).toEqual([]);
    expect(r2.newTitle).toBeNull();
    meta.reset();
  });
});

describe('persistent loot meter', () => {
  it('fills, awards a box with rollover, and never loses progress', () => {
    meta.reset();
    const size = lootMeterSize(0);
    expect(meta.get().lootMeter).toBe(0);
    expect(meta.get().lootBoxes).toBe(0);

    // Partial fill — no box yet.
    expect(meta.addLootProgress(size - 10)).toBe(0);
    expect(meta.get().lootMeter).toBe(size - 10);
    expect(meta.get().lootBoxes).toBe(0);

    // Cross the threshold → one box, overflow rolls into the next meter (no loss).
    const awarded = meta.addLootProgress(30); // total 20 past the line
    expect(awarded).toBe(1);
    expect(meta.get().lootBoxes).toBe(1);
    expect(meta.get().lootBoxesLifetime).toBe(1);
    expect(meta.get().lootMeter).toBe(20); // overflow preserved
    meta.reset();
  });

  it('awards multiple boxes for a large grant', () => {
    meta.reset();
    const size = lootMeterSize(0);
    const awarded = meta.addLootProgress(size * 3 + 5);
    expect(awarded).toBe(3);
    expect(meta.get().lootBoxes).toBe(3);
    expect(meta.get().lootMeter).toBe(5);
    meta.reset();
  });

  it('persists across runs/modes — recordRun never clears the meter', () => {
    meta.reset();
    meta.addLootProgress(50);
    const before = meta.get().lootMeter;
    meta.recordRun(result({ mode: 'endless', wave: 12, kills: 80 }));
    meta.recordRun(result({ mode: 'stage', won: true, stageNumber: 2 }));
    expect(meta.get().lootMeter).toBe(before); // untouched by runs
    meta.reset();
  });
});
