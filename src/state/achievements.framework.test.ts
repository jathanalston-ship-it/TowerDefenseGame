import { describe, it, expect } from 'vitest';
import { defaultSave } from '../save/saveStore';
import type { LifetimeStats } from '../core/types';
import { achievementById, checkAchievements, rewardFor } from './achievements';

function saveWithStats(over: Partial<LifetimeStats>) {
  const s = defaultSave();
  return { ...s, stats: { ...s.stats, ...over } };
}

describe('achievement framework (hidden / progress / reward / stats integration)', () => {
  it('unlocks a statistics-driven achievement (exterminator at 1000 lifetime kills)', () => {
    const ids = checkAchievements({ save: saveWithStats({ lifetimeKills: 1000 }) }).map((a) => a.id);
    expect(ids).toContain('exterminator');
  });

  it('marks hidden achievements with a flag (concealed until earned)', () => {
    expect(achievementById('apex_slayer')?.hidden).toBe(true);
    expect(achievementById('first_run')?.hidden).toBeFalsy();
  });

  it('a hidden achievement still fires when its (stats) condition is met', () => {
    const base = defaultSave().stats.killsByEnemy;
    const ids = checkAchievements({ save: saveWithStats({ killsByEnemy: { ...base, tyrant: 1 } }) }).map((a) => a.id);
    expect(ids).toContain('apex_slayer');
  });

  it('exposes lifetime progress for trackable achievements', () => {
    const def = achievementById('exterminator');
    expect(def?.progress?.({ save: saveWithStats({ lifetimeKills: 250 }) })).toEqual({ cur: 250, max: 1000 });
  });

  it('sums Shard rewards across unlocked achievements', () => {
    const ext = achievementById('exterminator');
    const first = achievementById('first_run');
    expect(ext?.reward).toBe(60);
    expect(rewardFor([ext!, first!])).toBe(70);
  });
});
