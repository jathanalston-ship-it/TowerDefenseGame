// Player Profile read-model (docs/PROFILE.md) — the registry yields renderable stats for a
// FRESH account (no dead panels, no crashes on zeros) and for a seeded veteran; frames unlock
// on their real conditions; the power breakdown attribution is consistent (shares sum to the
// gained total); the registry is OPEN (a future system can register a provider and appear).

import { describe, it, expect } from 'vitest';
import {
  PROFILE_SECTION_TITLES,
  achievementShowcase,
  fmtDuration,
  playerBanner,
  powerBreakdown,
  profileRegistry,
  profileSection,
} from './profile';
import type { ProfileSectionId } from './profile';
import { defaultSave } from '../save/saveStore';
import { TOWER_ORDER } from '../core/config';
import { POWER_BASE } from '../core/power';

const SECTIONS = Object.keys(PROFILE_SECTION_TITLES) as ProfileSectionId[];

describe('profile registry (the no-hardcoded-stat-lists architecture)', () => {
  it('every section yields renderable stats on a FRESH account — zero dead panels', () => {
    const s = defaultSave();
    for (const id of SECTIONS) {
      const stats = profileSection(s, id);
      expect(stats.length).toBeGreaterThan(0);
      for (const st of stats) {
        expect(st.label.length).toBeGreaterThan(0);
        expect(typeof st.value).toBe('string');
        expect(st.value.length).toBeGreaterThan(0); // '—' for not-yet-tracked, never empty
      }
    }
  });

  it('is OPEN: a future system registers a provider and its stats appear in place', () => {
    profileRegistry.register({
      id: 'test-future-system', section: 'analytics', order: 999,
      stats: () => [{ id: 'x', label: 'Future Stat', value: '42' }],
    });
    const stats = profileSection(defaultSave(), 'analytics');
    expect(stats[stats.length - 1]).toMatchObject({ label: 'Future Stat', value: '42' });
  });

  it('veteran ledgers surface: playtime, averages, doctrine preference, draft counts', () => {
    const s = defaultSave();
    s.totalRuns = 10;
    s.stats = { ...s.stats, playtimeSec: 7200, longestRunSec: 1800, waveSum: 220, doctrineRuns: { titan: 6, frenzy: 2 }, cardDrafts: { sharpened_needles: 12 } };
    const inf = profileSection(s, 'infinite');
    expect(inf.find((x) => x.id === 'avg-wave')?.value).toBe('22');
    expect(inf.find((x) => x.id === 'avg-run')?.value).toBe(fmtDuration(720));
    const analytics = profileSection(s, 'analytics');
    expect(analytics.find((x) => x.id === 'top-doctrine')?.value).toBe('Titan Protocol');
  });
});

describe('banner + frames', () => {
  it('fresh banner: defaults, dashes for unstamped clocks, only the base frame unlocked', () => {
    const b = playerBanner(defaultSave());
    expect(b.name).toBe('OVERMIND');
    expect(b.playtime).toBe('—');
    expect(b.accountAge).toBe('—');
    expect(b.frame.id).toBe('membrane');
    expect(b.frames.filter((f) => f.isUnlocked).map((f) => f.id)).toEqual(['membrane']);
  });

  it('frames unlock on their real conditions and a locked selection falls back', () => {
    const s = defaultSave();
    s.prestige = { ...s.prestige, molts: 1 };
    s.bestWave = 120;
    s.profileFrame = 'abyssal';
    const b = playerBanner(s);
    expect(b.frames.find((f) => f.id === 'molted')?.isUnlocked).toBe(true);
    expect(b.frame.id).toBe('abyssal'); // unlocked + selected
    const locked = playerBanner({ ...s, bestWave: 0 }); // selection no longer unlocked
    expect(locked.frame.id).toBe('membrane'); // falls back to the default
  });

  it('fmtDuration speaks human scales', () => {
    expect(fmtDuration(90)).toBe('2m');
    expect(fmtDuration(3900)).toBe('1h 5m');
    expect(fmtDuration(90000)).toBe('1d 1h');
  });
});

describe('power breakdown attribution', () => {
  it('slices cover the real buckets and shares sum to the gained total', () => {
    const s = defaultSave();
    for (const k of TOWER_ORDER) s.towerStars[k] = 3;
    s.towerMasteryXp = { ...s.towerMasteryXp };
    for (const k of TOWER_ORDER) s.towerMasteryXp[k] = 100000;
    const pb = powerBreakdown(s);
    expect(pb.base).toBe(POWER_BASE);
    expect(pb.slices.map((x) => x.id).sort()).toEqual(['collection', 'equipment', 'heroes', 'meta', 'mulligans', 'towers']);
    const sum = pb.slices.reduce((a, x) => a + x.share, 0);
    expect(Math.abs(sum - (pb.score - pb.base))).toBeLessThanOrEqual(pb.slices.length); // rounding only
    expect(pb.slices.find((x) => x.id === 'towers')!.share).toBeGreaterThan(0);
  });

  it('a fresh account attributes zero everywhere (score = base)', () => {
    const pb = powerBreakdown(defaultSave());
    expect(pb.score).toBe(POWER_BASE);
    for (const sl of pb.slices) expect(sl.share).toBe(0);
  });
});

describe('achievements showcase', () => {
  it('is calm on a fresh account and fills as achievements land (insertion order = recency)', () => {
    const fresh = achievementShowcase(defaultSave());
    expect(fresh.count).toBe(0);
    expect(fresh.recent).toBeNull();
    expect(fresh.goal).not.toBeNull(); // always something to chase
    const s = defaultSave();
    s.achievements = ['extract', 'first_run']; // insertion order: first_run unlocked LAST
    const sc = achievementShowcase(s);
    expect(sc.count).toBe(2);
    expect(sc.recent?.id).toBe('first_run');
    expect(sc.rarest?.id).toBe('extract'); // highest-reward unlocked (50 vs 10)
  });
});
