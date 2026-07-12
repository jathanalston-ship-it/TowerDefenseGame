// Power history (docs/POWER-SCORE.md §history) — daily ledger folds, weekly delta, bounds,
// and the legacy-save path (missing powerLog loads as []).

import { describe, expect, it } from 'vitest';
import { powerSeries, utcDay, weeklyPowerDelta, withPowerLogged } from './powerLog';
import { POWER_LOG_CAP, defaultSave } from '../save/saveStore';

const DAY = 86_400_000;

describe('powerLog', () => {
  it('one entry per UTC day — last write wins, identical write is a no-op (same object)', () => {
    const t0 = Date.UTC(2026, 6, 10, 9, 0, 0);
    let s = withPowerLogged(defaultSave(), 1000, t0);
    expect(s.powerLog).toEqual([{ day: '2026-07-10', score: 1000 }]);
    const same = withPowerLogged(s, 1000, t0 + 3_600_000);
    expect(same).toBe(s); // callers skip the persist
    s = withPowerLogged(s, 1042, t0 + 7_200_000);
    expect(s.powerLog).toEqual([{ day: '2026-07-10', score: 1042 }]);
    s = withPowerLogged(s, 1100, t0 + DAY);
    expect(s.powerLog).toHaveLength(2);
    expect(s.powerLog[1]).toEqual({ day: '2026-07-11', score: 1100 });
  });

  it('stays bounded at POWER_LOG_CAP (oldest entries fall off)', () => {
    const t0 = Date.UTC(2026, 0, 1);
    let s = defaultSave();
    for (let i = 0; i < POWER_LOG_CAP + 20; i++) s = withPowerLogged(s, 1000 + i, t0 + i * DAY);
    expect(s.powerLog).toHaveLength(POWER_LOG_CAP);
    expect(s.powerLog[s.powerLog.length - 1].score).toBe(1000 + POWER_LOG_CAP + 19);
  });

  it('weekly delta: current vs the newest entry ≥7d old; honest fallbacks', () => {
    const now = Date.UTC(2026, 6, 12, 12, 0, 0);
    let s = defaultSave();
    expect(weeklyPowerDelta(s, 1500, now)).toBeNull(); // no history at all
    s = withPowerLogged(s, 1500, now);
    expect(weeklyPowerDelta(s, 1500, now)).toBeNull(); // only today — no trend yet
    s = defaultSave();
    s = withPowerLogged(s, 1000, now - 10 * DAY);
    s = withPowerLogged(s, 1200, now - 7 * DAY);
    s = withPowerLogged(s, 1400, now - 2 * DAY);
    s = withPowerLogged(s, 1500, now);
    expect(weeklyPowerDelta(s, 1500, now)).toBe(300); // baseline = the −7d entry, not −10d or −2d
    // Shorter history: falls back to the oldest prior day ("since we started counting").
    let s2 = defaultSave();
    s2 = withPowerLogged(s2, 1450, now - 3 * DAY);
    s2 = withPowerLogged(s2, 1500, now);
    expect(weeklyPowerDelta(s2, 1500, now)).toBe(50);
  });

  it('powerSeries returns the newest N ascending; legacy saves load powerLog as []', () => {
    const t0 = Date.UTC(2026, 5, 1);
    let s = defaultSave();
    for (let i = 0; i < 40; i++) s = withPowerLogged(s, 1000 + i * 3, t0 + i * DAY);
    const series = powerSeries(s, 30);
    expect(series).toHaveLength(30);
    expect(series[0].day < series[29].day).toBe(true);
    expect(defaultSave().powerLog).toEqual([]);
    expect(utcDay(Date.UTC(2026, 6, 12, 23, 59))).toBe('2026-07-12');
  });
});
