// LiveOps calendar — pure, deterministic, ×1 outside windows.
import { describe, expect, it } from 'vitest';
import { activeEvents, daysToWeekend, liveopsMods, spotlightOf, weekIndex } from './liveops';

const SAT = new Date(Date.UTC(2026, 0, 3, 12)); // Sat
const TUE = new Date(Date.UTC(2026, 0, 6, 12)); // Tue (the pinned test clock's day)
const SUN = new Date(Date.UTC(2026, 0, 4, 12));

describe('liveops calendar', () => {
  it('weekend surge is live Sat+Sun UTC and off midweek', () => {
    expect(activeEvents(SAT).some((e) => e.id === 'weekend_surge')).toBe(true);
    expect(activeEvents(SUN).some((e) => e.id === 'weekend_surge')).toBe(true);
    expect(activeEvents(TUE).some((e) => e.id === 'weekend_surge')).toBe(false);
  });
  it('exactly one weekly spotlight is always live, rotating by week', () => {
    for (const d of [SAT, TUE, new Date(Date.UTC(2026, 5, 17))]) {
      const spots = activeEvents(d).filter((e) => e.id.endsWith('_week'));
      expect(spots.length).toBe(1);
    }
    const w = weekIndex(TUE);
    const nextWeek = new Date(TUE.getTime() + 7 * 86_400_000);
    expect(weekIndex(nextWeek)).toBe(w + 1);
    expect(spotlightOf(nextWeek)).not.toBe(spotlightOf(TUE));
  });
  it('mods fold to ×1 baselines outside their windows', () => {
    const tue = liveopsMods(TUE);
    expect(tue.dailyCoreMult).toBe(1);
    const sat = liveopsMods(SAT);
    expect(sat.dailyCoreMult).toBe(1.5);
    // whichever spotlight is live, the other lanes stay ×1
    const lanes = [sat.rushShardMult, sat.endlessShardMult, sat.campaignShardMult];
    expect(lanes.filter((x) => x === 1).length).toBe(2);
  });
  it('daysToWeekend counts down and hits 0 on the weekend', () => {
    expect(daysToWeekend(SAT)).toBe(0);
    expect(daysToWeekend(TUE)).toBe(4);
  });
});
