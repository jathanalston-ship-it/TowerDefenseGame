// LiveOps calendar — pure, deterministic, ×1 outside windows.
import { describe, expect, it } from 'vitest';
import {
  LIVE_EVENTS, activeEvents, daysToWeekend, eventBoosts, liveWindows, liveopsMods,
  nextWindow, spotlightOf, untilText, upcomingWindows, weekIndex, windowEnd,
} from './liveops';

const SAT = new Date(Date.UTC(2026, 0, 3, 12)); // Sat (also Harvest Moon: Jan 3rd)
const TUE = new Date(Date.UTC(2026, 0, 6, 12)); // Tue (the pinned test clock's day)
const SUN = new Date(Date.UTC(2026, 0, 4, 12));
const WED = new Date(Date.UTC(2026, 0, 7, 9)); // Wed (Mutation Wednesday)
const BLOOM_WED = new Date(Date.UTC(2026, 2, 25, 12)); // Wed inside the Mar 21–27 Bloom Cycle
const byId = (id: string) => LIVE_EVENTS.find((e) => e.id === id)!;

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

  it('the pinned test Tuesday stays spotlight-only (no new window may cover it)', () => {
    // The module clock pins to Tue 2026-01-06 under vitest so gameplay tests never see a live
    // bonus. Every calendar addition must keep that day clean of everything but the rotation.
    expect(activeEvents(TUE).length).toBe(1);
    expect(activeEvents(TUE)[0].id.endsWith('_week')).toBe(true);
  });

  it('the new windows: Mutation Wednesday, Harvest Moon (1st–3rd), quarterly Bloom Cycle', () => {
    expect(activeEvents(WED).some((e) => e.id === 'mutation_day')).toBe(true);
    expect(activeEvents(TUE).some((e) => e.id === 'mutation_day')).toBe(false);
    expect(activeEvents(SAT).some((e) => e.id === 'harvest_moon')).toBe(true); // Jan 3rd
    expect(activeEvents(new Date(Date.UTC(2026, 0, 4, 12))).some((e) => e.id === 'harvest_moon')).toBe(false); // Jan 4th
    expect(activeEvents(BLOOM_WED).some((e) => e.id === 'bloom_cycle')).toBe(true); // Mar 25
    expect(activeEvents(new Date(Date.UTC(2026, 3, 25, 12))).some((e) => e.id === 'bloom_cycle')).toBe(false); // Apr 25
  });

  it('the new lanes fold ×1 baseline and STACK multiplicatively across overlapping windows', () => {
    expect(liveopsMods(TUE).essenceMult).toBe(1);
    expect(liveopsMods(TUE).materialsMult).toBe(1);
    expect(liveopsMods(WED).essenceMult).toBe(1.5); // Mutation Wednesday alone
    expect(liveopsMods(SAT).materialsMult).toBe(1.5); // Harvest Moon (the 3rd)
    expect(liveopsMods(BLOOM_WED).essenceMult).toBeCloseTo(1.5 * 1.25, 10); // Mutation × Bloom — the festival
    expect(liveopsMods(BLOOM_WED).campaignShardMult).toBeGreaterThanOrEqual(1.1); // Bloom's core lanes are live
  });

  it('something is live EVERY day of the year (the spotlight guarantees a never-empty console)', () => {
    for (let day = 0; day < 365; day++) {
      const d = new Date(Date.UTC(2026, 0, 1, 12) + day * 86_400_000);
      expect(activeEvents(d).length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('schedule engine (window edges + the forecast)', () => {
  it('windowEnd finds the UTC-midnight edge of a live window', () => {
    expect(windowEnd(byId('weekend_surge'), SAT).getTime()).toBe(Date.UTC(2026, 0, 5)); // Mon 00:00
    expect(windowEnd(byId('mutation_day'), WED).getTime()).toBe(Date.UTC(2026, 0, 8)); // Thu 00:00
  });

  it('nextWindow forecasts the NEXT rise (skipping any current window) with its full span', () => {
    const mut = nextWindow(byId('mutation_day'), TUE)!;
    expect(mut.startsAt.getTime()).toBe(Date.UTC(2026, 0, 7)); // Wed 00:00
    expect(mut.endsAt.getTime()).toBe(Date.UTC(2026, 0, 8));
    const wk = nextWindow(byId('weekend_surge'), SAT)!; // asked DURING a weekend → the next one
    expect(wk.startsAt.getTime()).toBe(Date.UTC(2026, 0, 10)); // next Sat 00:00
    // Quarterly Bloom is ~74 days from the pinned Tuesday — beyond the default horizon.
    expect(nextWindow(byId('bloom_cycle'), TUE)).toBeNull();
  });

  it('liveWindows carries an endsAt for everything active; upcomingWindows excludes it, sorted soonest-first', () => {
    const live = liveWindows(TUE);
    expect(live.length).toBe(1); // the spotlight
    expect(live[0].endsAt.getTime()).toBeGreaterThan(TUE.getTime());
    const up = upcomingWindows(TUE);
    expect(up.some((w) => w.def.id === live[0].def.id)).toBe(false); // live ≠ upcoming
    expect(up[0].def.id).toBe('mutation_day'); // Wed 00:00 is the soonest rise from Tuesday
    for (let i = 1; i < up.length; i++) {
      expect(up[i].startsAt.getTime()).toBeGreaterThanOrEqual(up[i - 1].startsAt.getTime());
    }
    for (const w of up) expect(w.startsAt.getTime()).toBeGreaterThan(TUE.getTime());
  });

  it('untilText renders compact hour-resolution countdowns', () => {
    const base = new Date(Date.UTC(2026, 0, 6));
    expect(untilText(base, new Date(Date.UTC(2026, 0, 6, 0, 30)))).toBe('<1h');
    expect(untilText(base, new Date(Date.UTC(2026, 0, 6, 3)))).toBe('3h');
    expect(untilText(base, new Date(Date.UTC(2026, 0, 8)))).toBe('2d');
    expect(untilText(base, new Date(Date.UTC(2026, 0, 8, 14)))).toBe('2d 14h');
  });

  it('eventBoosts derives display rows from the mods bag (new lanes surface with zero UI work)', () => {
    expect(eventBoosts(byId('weekend_surge'))).toEqual([{ label: 'Daily Cores', mult: 1.5 }]);
    expect(eventBoosts(byId('mutation_day'))).toEqual([{ label: 'Gene Essence', mult: 1.5 }]);
    expect(eventBoosts(byId('bloom_cycle')).length).toBe(5); // four core lanes + essence
  });
});
