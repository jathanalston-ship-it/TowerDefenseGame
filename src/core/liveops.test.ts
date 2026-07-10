// LiveOps calendar — pure, deterministic, ×1 outside windows.
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_ORDER, LIVE_EVENTS, activeEvents, daysToWeekend, eventBoosts, liveWindows, liveopsMods,
  nextWindow, spotlightOf, untilText, upcomingWindows, weekIndex, windowEnd,
} from './liveops';

const SAT = new Date(Date.UTC(2026, 0, 3, 12)); // Sat (also Harvest Moon: Jan 3rd)
const SUN = new Date(Date.UTC(2026, 0, 4, 12));
const WED = new Date(Date.UTC(2026, 0, 7, 9)); // Wed (Mutation Wednesday)
const MON = new Date(Date.UTC(2026, 0, 19, 12)); // the pinned test clock's day (depth spotlight)
const FRI = new Date(Date.UTC(2026, 0, 16, 12)); // Fri (Prime Hunt)
const THU = new Date(Date.UTC(2026, 0, 15, 12)); // Thu (Spore Tide)
const BLOOM_WED = new Date(Date.UTC(2026, 2, 25, 12)); // Wed inside the Mar 21–27 Bloom Cycle
const byId = (id: string) => LIVE_EVENTS.find((e) => e.id === id)!;

describe('liveops calendar', () => {
  it('weekend surge is live Sat+Sun UTC and off midweek', () => {
    expect(activeEvents(SAT).some((e) => e.id === 'weekend_surge')).toBe(true);
    expect(activeEvents(SUN).some((e) => e.id === 'weekend_surge')).toBe(true);
    expect(activeEvents(MON).some((e) => e.id === 'weekend_surge')).toBe(false);
  });
  it('exactly one weekly spotlight is always live, rotating by week (4-way, apex included)', () => {
    for (const d of [SAT, MON, new Date(Date.UTC(2026, 5, 17))]) {
      const spots = activeEvents(d).filter((e) => e.id.endsWith('_week'));
      expect(spots.length).toBe(1);
    }
    const w = weekIndex(MON);
    const nextWeek = new Date(MON.getTime() + 7 * 86_400_000);
    expect(weekIndex(nextWeek)).toBe(w + 1);
    expect(spotlightOf(nextWeek)).not.toBe(spotlightOf(MON));
    // the rotation covers all four slots across four consecutive weeks
    const slots = new Set([0, 1, 2, 3].map((k) => spotlightOf(new Date(MON.getTime() + k * 7 * 86_400_000))));
    expect(slots.size).toBe(4);
  });
  it('mods fold to ×1 baselines outside their windows', () => {
    const mon = liveopsMods(MON);
    expect(mon.dailyCoreMult).toBe(1);
    const sat = liveopsMods(SAT);
    expect(sat.dailyCoreMult).toBe(1.5);
  });
  it('daysToWeekend counts down and hits 0 on the weekend', () => {
    expect(daysToWeekend(SAT)).toBe(0);
    expect(daysToWeekend(MON)).toBe(5);
  });

  it('the pinned test Monday stays spotlight-only, and the spotlight is DEPTH (endless lane)', () => {
    // The module clock pins to Mon 2026-01-19 under vitest so gameplay tests never see a live
    // bonus on a lane they read. Every calendar addition must keep this Monday to that one
    // spotlight — and that spotlight must be 'depth', whose only lane (endless cores) a
    // stage-mode gameplay run never consumes.
    expect(activeEvents(MON).length).toBe(1);
    expect(activeEvents(MON)[0].id).toBe('depth_week');
    const m = liveopsMods(MON);
    // Every lane a stage/campaign/daily/mega gameplay run reads is ×1 on the pinned clock.
    expect(m.dailyCoreMult).toBe(1);
    expect(m.rushShardMult).toBe(1);
    expect(m.campaignShardMult).toBe(1);
    expect(m.essenceMult).toBe(1);
    expect(m.materialsMult).toBe(1);
    expect(m.megaIchorMult).toBe(1);
    expect(m.lootMult).toBe(1);
    expect(m.endlessShardMult).toBe(1.25); // depth's lane — the ONLY non-neutral one, endless-only
  });

  it('the recurring surge/hunt beats fire on their days', () => {
    expect(activeEvents(WED).some((e) => e.id === 'mutation_day')).toBe(true);
    expect(activeEvents(THU).some((e) => e.id === 'spore_tide')).toBe(true); // Thu
    expect(activeEvents(FRI).some((e) => e.id === 'prime_hunt')).toBe(true); // Fri
    expect(activeEvents(MON).some((e) => e.id === 'spore_tide')).toBe(false); // Mon is clean
    expect(activeEvents(MON).some((e) => e.id === 'prime_hunt')).toBe(false);
  });

  it('the monthly + quarterly peaks: Harvest Moon (1–3), Reclamation (11–13), Bloom Cycle', () => {
    expect(activeEvents(SAT).some((e) => e.id === 'harvest_moon')).toBe(true); // Jan 3rd
    expect(activeEvents(new Date(Date.UTC(2026, 0, 4, 12))).some((e) => e.id === 'harvest_moon')).toBe(false); // Jan 4th
    expect(activeEvents(new Date(Date.UTC(2026, 0, 12, 12))).some((e) => e.id === 'reclamation')).toBe(true); // Jan 12
    expect(activeEvents(BLOOM_WED).some((e) => e.id === 'bloom_cycle')).toBe(true); // Mar 25
    expect(activeEvents(new Date(Date.UTC(2026, 3, 25, 12))).some((e) => e.id === 'bloom_cycle')).toBe(false); // Apr 25
  });

  it('the lanes fold ×1 baseline and STACK multiplicatively across overlapping windows', () => {
    expect(liveopsMods(MON).essenceMult).toBe(1);
    expect(liveopsMods(MON).materialsMult).toBe(1);
    expect(liveopsMods(WED).essenceMult).toBe(1.5); // Mutation Wednesday alone
    expect(liveopsMods(SAT).materialsMult).toBe(1.5); // Harvest Moon (the 3rd)
    expect(liveopsMods(FRI).megaIchorMult).toBe(1.5); // Prime Hunt (Fri)
    expect(liveopsMods(BLOOM_WED).essenceMult).toBeCloseTo(1.5 * 1.25, 10); // Mutation × Bloom — the festival
    expect(liveopsMods(BLOOM_WED).campaignShardMult).toBeGreaterThanOrEqual(1.1); // Bloom's core lanes are live
  });

  it('every event declares a category the console can group by', () => {
    for (const e of LIVE_EVENTS) expect(CATEGORY_ORDER[e.category]).toBeGreaterThanOrEqual(0);
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
    const mut = nextWindow(byId('mutation_day'), MON)!;
    expect(mut.startsAt.getTime()).toBe(Date.UTC(2026, 0, 21)); // next Wed 00:00 after Mon the 19th
    expect(mut.endsAt.getTime()).toBe(Date.UTC(2026, 0, 22));
    const wk = nextWindow(byId('weekend_surge'), SAT)!; // asked DURING a weekend → the next one
    expect(wk.startsAt.getTime()).toBe(Date.UTC(2026, 0, 10)); // next Sat 00:00
    // Quarterly Bloom is ~60+ days from the pinned Monday — beyond the default horizon.
    expect(nextWindow(byId('bloom_cycle'), MON)).toBeNull();
  });

  it('liveWindows carries an endsAt for everything active; upcomingWindows excludes it, sorted soonest-first', () => {
    const live = liveWindows(MON);
    expect(live.length).toBe(1); // the spotlight
    expect(live[0].endsAt.getTime()).toBeGreaterThan(MON.getTime());
    const up = upcomingWindows(MON);
    expect(up.some((w) => w.def.id === live[0].def.id)).toBe(false); // live ≠ upcoming
    // The soonest rise from Monday is Tuesday's Spore Tide (00:00).
    expect(up[0].def.id).toBe('spore_tide');
    expect(up[0].startsAt.getTime()).toBe(Date.UTC(2026, 0, 20));
    for (let i = 1; i < up.length; i++) {
      expect(up[i].startsAt.getTime()).toBeGreaterThanOrEqual(up[i - 1].startsAt.getTime());
    }
    for (const w of up) expect(w.startsAt.getTime()).toBeGreaterThan(MON.getTime());
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
    expect(eventBoosts(byId('prime_hunt'))).toEqual([{ label: 'Mega Ichor', mult: 1.5 }]);
    expect(eventBoosts(byId('bloom_cycle')).length).toBe(6); // four core lanes + essence + mega ichor
  });
});
