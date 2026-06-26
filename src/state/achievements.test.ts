import { describe, it, expect } from 'vitest';
import { defaultSave } from '../save/saveStore';
import { ACHIEVEMENTS, checkAchievements } from './achievements';

describe('achievements', () => {
  it('a brand-new save has nothing unlocked', () => {
    expect(checkAchievements({ save: defaultSave() })).toHaveLength(0);
  });

  it('save-state milestones fire (first_run)', () => {
    const ids = checkAchievements({ save: { ...defaultSave(), totalRuns: 1 } }).map((a) => a.id);
    expect(ids).toContain('first_run');
  });

  it('run-scoped milestones fire from the run summary (extract, centurion)', () => {
    const ids = checkAchievements({
      save: defaultSave(),
      run: { wave: 12, kills: 120, won: true },
    }).map((a) => a.id);
    expect(ids).toContain('extract');
    expect(ids).toContain('centurion');
  });

  it('does not re-offer an already-unlocked achievement', () => {
    const save = { ...defaultSave(), totalRuns: 1, achievements: ['first_run'] };
    const ids = checkAchievements({ save }).map((a) => a.id);
    expect(ids).not.toContain('first_run');
  });

  it('every achievement id is unique', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
