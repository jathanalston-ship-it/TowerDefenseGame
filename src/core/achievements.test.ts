import { describe, it, expect } from 'vitest';
import {
  ACHIEVEMENTS,
  TOTAL_ENEMIES,
  TOTAL_BIOMES,
  TOTAL_CARDS,
  evaluateUnlocked,
  titleFor,
} from './achievements';
import type { AchievementStats } from './achievements';

function stats(over: Partial<AchievementStats> = {}): AchievementStats {
  return {
    totalRuns: 0, bestWave: 0, bestStage: 0, stagesCleared: 0,
    bestEndlessWave: 0, bestEndlessScore: 0, lifetimeShards: 0,
    enemiesSeen: 0, biomesSeen: 0, cardsSeen: 0, ...over,
  };
}

describe('achievements', () => {
  it('unlocks nothing for a fresh account', () => {
    expect(evaluateUnlocked(stats())).toEqual([]);
  });

  it('unlocks the right milestones as thresholds are crossed', () => {
    const got = new Set(evaluateUnlocked(stats({ totalRuns: 1, bestWave: 12, bestStage: 3, bestEndlessWave: 15 })));
    expect(got.has('first_run')).toBe(true);
    expect(got.has('extraction')).toBe(true); // bestWave >= 12
    expect(got.has('stage_breaker')).toBe(true); // bestStage >= 3
    expect(got.has('tide_holder')).toBe(true); // endless wave >= 15
    expect(got.has('pathfinder')).toBe(false); // stage 8 not reached
    expect(got.has('persistent')).toBe(false); // 25 runs not reached
  });

  it('"collect all" thresholds track the live content tables', () => {
    const partial = new Set(evaluateUnlocked(stats({ enemiesSeen: TOTAL_ENEMIES - 1, biomesSeen: TOTAL_BIOMES, cardsSeen: TOTAL_CARDS })));
    expect(partial.has('apex_naturalist')).toBe(false); // one strain short
    expect(partial.has('cartographer')).toBe(true); // all biomes
    expect(partial.has('geneticist')).toBe(true); // all cards

    const all = new Set(evaluateUnlocked(stats({ enemiesSeen: TOTAL_ENEMIES })));
    expect(all.has('apex_naturalist')).toBe(true);
  });

  it('titleFor returns the rarest unlocked title (later in order wins)', () => {
    expect(titleFor(new Set())).toBeNull();
    expect(titleFor(new Set(['extraction']))).toBe('Defender');
    // Two titled achievements unlocked → the later (rarer) one wins.
    const both = new Set(['extraction', 'apex_endless']);
    expect(titleFor(both)).toBe('the Endless');
  });

  it('every titled achievement has a unique, non-empty title', () => {
    const titles = ACHIEVEMENTS.filter((a) => a.title).map((a) => a.title!);
    expect(titles.length).toBeGreaterThan(0);
    expect(new Set(titles).size).toBe(titles.length); // unique
    expect(titles.every((t) => t.trim().length > 0)).toBe(true);
  });
});
