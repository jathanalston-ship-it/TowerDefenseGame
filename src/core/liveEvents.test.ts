// Live Event framework (docs/LIVE-EVENTS.md): registry integrity + the rotation, readability
// and anti-inflation laws — the build gate that keeps "adding an event = one row" true.

import { describe, expect, it } from 'vitest';
import { BP } from './battlePass';
import {
  EVENT_HORIZONS, LIVE_EVENTS_V2, TRACK_LEVELS, activeLiveEvents, eventForHorizon,
  eventTrack, horizonEndsAt, horizonWindow, liveEventProblems, themeOwner,
  windowMintBudget, MINT_BUDGET_PER_DAY,
} from './liveEvents';

const T0 = BP.epochMs + 3_600_000;
const DAY = 86_400_000;

describe('registry integrity', () => {
  it('holds every law (ids, modifiers, budgets, caps, rings, readability)', () => {
    expect(liveEventProblems()).toEqual([]);
  });
  it('every event carries a full identity (theme always; the recognition contract)', () => {
    for (const e of LIVE_EVENTS_V2) {
      expect(e.theme.accent.length, e.id).toBeGreaterThan(0);
      expect(e.theme.logo.length, e.id).toBeGreaterThan(0);
      expect(e.tagline.length, e.id).toBeGreaterThan(0);
    }
  });
});

describe('the three horizons', () => {
  it('rotate independently from the shared epoch and wrap forever', () => {
    expect(horizonWindow('short', T0)).toBe(0);
    expect(horizonWindow('short', T0 + 3 * DAY)).toBe(1);
    expect(horizonWindow('medium', T0 + 14 * DAY)).toBe(1);
    expect(horizonWindow('major', T0 + 91 * DAY)).toBe(1);
    // Ten years out the rings still resolve (unlimited windows).
    const far = T0 + 3650 * DAY;
    for (const h of ['short', 'medium', 'major'] as const) expect(eventForHorizon(h, far)).toBeDefined();
  });
  it('always exposes exactly three simultaneous events, major-first, with correct ends', () => {
    const active = activeLiveEvents(T0);
    expect(active).toHaveLength(3);
    expect(active.map((a) => a.def.horizon)).toEqual(['major', 'medium', 'short']);
    for (const a of active) expect(a.endsAt).toBe(horizonEndsAt(a.def.horizon, T0));
    expect(themeOwner(T0).def.horizon).toBe('major');
  });
  it('ring coverage is even — every event gets its windows across a super-cycle', () => {
    for (const h of ['short', 'medium', 'major'] as const) {
      const ring = LIVE_EVENTS_V2.filter((e) => e.horizon === h);
      const counts = new Map<string, number>();
      const windows = ring.length * 4;
      for (let w = 0; w < windows; w++) {
        const t = BP.epochMs + w * EVENT_HORIZONS[h].periodDays * DAY + 3_600_000;
        const id = eventForHorizon(h, t).id;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      for (const e of ring) expect(counts.get(e.id), `${h}/${e.id}`).toBe(4);
    }
  });
});

describe('duration-scaled reward tracks (miniature battle passes)', () => {
  it('every event with a currency fills its horizon ladder — every level pays, reachable, sorted', () => {
    for (const e of LIVE_EVENTS_V2) {
      if (!e.currency) continue;
      const full = eventTrack(e);
      const pool = (e.challenges ?? []).reduce((a, c) => a + c.tokens, 0);
      expect(full.length, e.id).toBeGreaterThanOrEqual(TRACK_LEVELS[e.horizon]);
      for (let i = 1; i < full.length; i++) expect(full[i].at, e.id).toBeGreaterThan(full[i - 1].at);
      for (const m of full) {
        expect(m.rewards.length, `${e.id}@${m.at}`).toBeGreaterThan(0);
        expect(m.at, `${e.id}@${m.at}`).toBeLessThanOrEqual(pool);
      }
    }
  });
  it('longer horizons carry longer, richer ladders (3d < 2w < 3m)', () => {
    expect(TRACK_LEVELS.short).toBeLessThan(TRACK_LEVELS.medium);
    expect(TRACK_LEVELS.medium).toBeLessThan(TRACK_LEVELS.major);
    const mintOf = (h: 'short' | 'medium' | 'major'): number =>
      Math.max(...LIVE_EVENTS_V2.filter((e) => e.horizon === h).map(windowMintBudget));
    expect(mintOf('major')).toBeGreaterThan(mintOf('medium'));
    expect(mintOf('medium')).toBeGreaterThan(mintOf('short'));
  });
  it('generated filler is consumable-only — repeats never duplicate a permanent unlock', () => {
    // The repeat contract: spine permanents substitute at claim (applyRewardList's owned →
    // compensation path); FILLER must therefore never mint cosmetic/passive/phenotype.
    for (const e of LIVE_EVENTS_V2) {
      const spineAts = new Set((e.track ?? []).map((m) => m.at));
      for (const m of eventTrack(e)) {
        if (spineAts.has(m.at)) continue;
        for (const r of m.rewards) {
          expect(['cosmetic', 'passive', 'phenotype', 'stack'], `${e.id}@${m.at}`).not.toContain(r.kind);
        }
      }
    }
  });
});

describe('the economy laws', () => {
  it('per-day mint budgets scale DOWN with duration (a surge never out-pays an epoch pro-rata)', () => {
    expect(MINT_BUDGET_PER_DAY.short).toBeGreaterThan(MINT_BUDGET_PER_DAY.medium);
    expect(MINT_BUDGET_PER_DAY.medium).toBeGreaterThan(MINT_BUDGET_PER_DAY.major);
  });
  it('every window mints a positive, bounded value', () => {
    for (const e of LIVE_EVENTS_V2) {
      const m = windowMintBudget(e);
      expect(m, e.id).toBeGreaterThan(0);
      expect(m, e.id).toBeLessThanOrEqual(MINT_BUDGET_PER_DAY[e.horizon] * EVENT_HORIZONS[e.horizon].periodDays);
    }
  });
});
