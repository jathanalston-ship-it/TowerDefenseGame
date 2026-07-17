// Arena core (docs/ARENA.md) — the ranked-ladder contracts:
//   • divisions cover the whole rating line, in order, and resolve correctly at every rating;
//   • the rating model: placements swing hard, wins always pay > 0 / losses < 0, streaks are
//     capped, upsets pay more than expected wins, decay only bites the top tiers after the
//     grace window and can never demote below the highest non-decaying threshold;
//   • seasons: 30-day UTC windows, soft reset pulls toward the base and keeps half the spread,
//     the roll archives history / re-arms placements / clears the pass — and is idempotent;
//   • matchmaking: brackets widen over the 20s window, the AI fallback fires exactly at its
//     end, opponents outside the live bracket are rejected;
//   • outcome resolution: nucleus-fall first, then the integrity → waves → damage ladder;
//   • claims: bounds validation rejects forgeries; rewards derive deterministically (wins pay
//     CONTAINERS + a Run Cache, losses pay standard resources only);
//   • rank benefits: the idle dividend is ×1 at division 0 (IEEE-identity — golden-safe),
//     diminishing, and hard-capped.

import { describe, expect, it } from 'vitest';
import {
  ARENA, ARENA_DIVISIONS, aiFallbackPower, arenaClaimProblem, arenaIdleCapBonusHours,
  arenaIdleDividend, arenaMatchRewards, arenaSeasonIndex, decayedRating, defaultArenaSave,
  divisionForRating, divisionIndex, expectedScore, matchSearchState, msToSeasonEnd,
  opponentInBracket, ratingDelta, resolveArenaOutcome, rolledArenaSave, seasonResetRating,
} from './arena';
import type { ArenaMatchClaim, ArenaSideResult } from './arena';

const side = (over: Partial<ArenaSideResult> = {}): ArenaSideResult => ({
  integrityFrac: 1, waveReached: 10, damageDealt: 1000, fellAtSec: null, ...over,
});

const claim = (over: Partial<ArenaMatchClaim> = {}): ArenaMatchClaim => ({
  matchId: 'm_0123456789abcdef', season: 1, outcome: 'win', vsAi: true,
  oppRating: 600, oppPower: 1200, durationSec: 180, waveReached: 9, power: 1300, ...over,
});

describe('divisions', () => {
  it('cover the rating line in ascending order from 0', () => {
    expect(ARENA_DIVISIONS[0].minRating).toBe(0);
    for (let i = 1; i < ARENA_DIVISIONS.length; i++) {
      expect(ARENA_DIVISIONS[i].minRating).toBeGreaterThan(ARENA_DIVISIONS[i - 1].minRating);
    }
  });

  it('resolve correctly at boundaries and beyond the top', () => {
    expect(divisionForRating(0).id).toBe('spore3');
    expect(divisionForRating(399).id).toBe('spore3');
    expect(divisionForRating(400).id).toBe('spore2');
    expect(divisionForRating(2800).id).toBe('apex1');
    expect(divisionForRating(99_999).id).toBe('apex1');
  });

  it('decay is confined to the top tiers (spore/larval never decay)', () => {
    for (const d of ARENA_DIVISIONS) {
      if (d.tier === 'spore' || d.tier === 'larval') expect(d.decays).toBe(false);
      else expect(d.decays).toBe(true);
    }
  });
});

describe('rating model', () => {
  it('a win always pays > 0, a loss always < 0 (fairness floor)', () => {
    for (const opp of [0, 500, 1500, 5000]) {
      expect(ratingDelta({ rating: 1000, oppRating: opp, won: true, placementsLeft: 0, streak: 0 })).toBeGreaterThan(0);
      expect(ratingDelta({ rating: 1000, oppRating: opp, won: false, placementsLeft: 0, streak: 0 })).toBeLessThan(0);
    }
  });

  it('placements swing harder than normal matches', () => {
    const placement = ratingDelta({ rating: 800, oppRating: 800, won: true, placementsLeft: 3, streak: 0 });
    const normal = ratingDelta({ rating: 800, oppRating: 800, won: true, placementsLeft: 0, streak: 0 });
    expect(placement).toBeGreaterThan(normal);
  });

  it('an upset (beating a stronger opponent) pays more than an expected win', () => {
    const upset = ratingDelta({ rating: 800, oppRating: 1200, won: true, placementsLeft: 0, streak: 0 });
    const expected = ratingDelta({ rating: 1200, oppRating: 800, won: true, placementsLeft: 0, streak: 0 });
    expect(upset).toBeGreaterThan(expected);
  });

  it('streak bonus caps at ARENA.streakCap', () => {
    const at = (streak: number): number => ratingDelta({ rating: 800, oppRating: 800, won: true, placementsLeft: 0, streak });
    expect(at(ARENA.streakCap + 10)).toBe(at(ARENA.streakCap));
    expect(at(2)).toBeGreaterThan(at(0));
  });

  it('expectedScore is symmetric and bounded', () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5, 6);
    expect(expectedScore(1400, 1000) + expectedScore(1000, 1400)).toBeCloseTo(1, 6);
  });
});

describe('decay', () => {
  const day = 86_400_000;
  it('does not bite inside the grace window or below the decaying tiers', () => {
    const now = 100 * day;
    expect(decayedRating(1900, now - ARENA.decayIdleDays * day, now)).toBe(1900); // exactly at grace
    expect(decayedRating(1200, now - 400 * day, now)).toBe(1200); // larval never decays
  });

  it('bleeds per idle day past grace, never below the highest non-decaying threshold', () => {
    const now = 5000 * day;
    const last = now - (ARENA.decayIdleDays + 10) * day;
    expect(decayedRating(2000, last, now)).toBe(2000 - 10 * ARENA.decayPerDay);
    expect(decayedRating(1810, now - 4000 * day, now)).toBe(1500); // the Larval I floor
  });
});

describe('seasons', () => {
  it('season index advances every 30 UTC days from the epoch', () => {
    expect(arenaSeasonIndex(ARENA.epochMs)).toBe(1);
    expect(arenaSeasonIndex(ARENA.epochMs + ARENA.seasonMs - 1)).toBe(1);
    expect(arenaSeasonIndex(ARENA.epochMs + ARENA.seasonMs)).toBe(2);
    expect(msToSeasonEnd(ARENA.epochMs)).toBe(ARENA.seasonMs);
  });

  it('soft reset pulls toward the base keeping half the spread', () => {
    expect(seasonResetRating(ARENA.resetBase)).toBe(ARENA.resetBase);
    expect(seasonResetRating(2600)).toBe(Math.round(ARENA.resetBase + (2600 - ARENA.resetBase) * ARENA.resetCarry));
    expect(seasonResetRating(0)).toBe(ARENA.resetBase * ARENA.resetCarry);
  });

  it('rolling a stale record archives the season, resets the pass, re-arms placements — idempotently', () => {
    let s = { ...defaultArenaSave(), season: 1, rating: 2000, wins: 12, losses: 4, passXp: 300, passPremium: true, passClaimedFree: [1, 2], streak: 3, placements: 0 };
    const rolled = rolledArenaSave(s, 3);
    expect(rolled.season).toBe(3);
    expect(rolled.rating).toBe(seasonResetRating(2000));
    expect(rolled.wins).toBe(0);
    expect(rolled.passXp).toBe(0);
    expect(rolled.passPremium).toBe(false);
    expect(rolled.passClaimedFree).toEqual([]);
    expect(rolled.placements).toBe(ARENA.placementMatches);
    expect(rolled.history).toHaveLength(1);
    expect(rolled.history[0]).toMatchObject({ season: 1, rating: 2000, wins: 12, losses: 4 });
    expect(rolledArenaSave(rolled, 3)).toBe(rolled); // idempotent for the current season
    // a never-played record rolls silently (no history row)
    s = rolledArenaSave(defaultArenaSave(), 5);
    expect(s.history).toHaveLength(0);
    expect(s.rating).toBe(0);
  });
});

describe('matchmaking', () => {
  it('brackets widen across the 20s window; the AI fallback fires at its end', () => {
    const early = matchSearchState(0, 1000);
    const late = matchSearchState(ARENA.searchSec, 1000);
    expect(early.powerHigh - early.powerLow).toBeLessThan(late.powerHigh - late.powerLow);
    expect(early.aiInSec).toBe(ARENA.searchSec);
    expect(late.aiInSec).toBe(0);
    expect(late.estimatedWaitSec).toBe(ARENA.searchSec);
  });

  it('rejects opponents outside the live bracket, admits them as it widens', () => {
    const power = 1000;
    const early = matchSearchState(0, power);
    const late = matchSearchState(ARENA.searchSec, power);
    expect(opponentInBracket(early, 1400)).toBe(false); // +40% — outside the ±15% start
    expect(opponentInBracket(late, 1400)).toBe(true); // inside the ±60% end
    expect(opponentInBracket(late, 5000)).toBe(false); // never obviously unfair
  });

  it('the OPT-OUT construct is hardened; the involuntary fallback fights at parity (§toggle)', () => {
    expect(aiFallbackPower(1000, false)).toBe(1000); // no human found ⇒ ×1, byte-unchanged
    expect(aiFallbackPower(1000, true)).toBe(Math.round(1000 * ARENA.aiOptOutPowerPremium));
    expect(ARENA.aiOptOutPowerPremium).toBeGreaterThan(1); // ducking humans is never the farm
    expect(ARENA.aiOnlySearchSec).toBeLessThan(ARENA.searchSec); // and never a pointless wait
  });
});

describe('outcome resolution (the mirror siege race)', () => {
  it('first nucleus to fall loses', () => {
    expect(resolveArenaOutcome(side(), side({ fellAtSec: 120 }))).toBe('win');
    expect(resolveArenaOutcome(side({ fellAtSec: 60 }), side({ fellAtSec: 120 }))).toBe('loss');
  });

  it('timer expiry resolves on integrity → waves → damage → draw', () => {
    expect(resolveArenaOutcome(side({ integrityFrac: 0.8 }), side({ integrityFrac: 0.5 }))).toBe('win');
    expect(resolveArenaOutcome(side({ waveReached: 12 }), side({ waveReached: 11 }))).toBe('win');
    expect(resolveArenaOutcome(side({ damageDealt: 500 }), side({ damageDealt: 900 }))).toBe('loss');
    expect(resolveArenaOutcome(side(), side())).toBe('draw');
  });
});

describe('claims + rewards (the shared anti-cheat surface)', () => {
  it('accepts a plausible claim and rejects each forgery axis', () => {
    expect(arenaClaimProblem(claim())).toBeNull();
    expect(arenaClaimProblem(claim({ matchId: 'x' }))).toBe('bad-match-id');
    expect(arenaClaimProblem(claim({ season: 0 }))).toBe('bad-season');
    expect(arenaClaimProblem(claim({ outcome: 'jackpot' as never }))).toBe('bad-outcome');
    expect(arenaClaimProblem(claim({ durationSec: 100_000 }))).toBe('bad-duration');
    expect(arenaClaimProblem(claim({ power: 1e12 }))).toBe('bad-power');
    expect(arenaClaimProblem(claim({ waveReached: 199, durationSec: 60 }))).toBe('implausible-pace');
  });

  it('wins pay containers + a Run Cache; losses pay standard resources only; draws pay cores', () => {
    const win = arenaMatchRewards('win', 4);
    expect(win.passXp).toBe(ARENA.winPassXp);
    expect(win.rewards.some((r) => r.kind === 'container')).toBe(true);
    expect(win.rewards.some((r) => r.kind === 'runCache')).toBe(true);
    const loss = arenaMatchRewards('loss', 4);
    expect(loss.passXp).toBe(0);
    expect(loss.rewards.some((r) => r.kind === 'container' || r.kind === 'runCache')).toBe(false);
    expect(loss.rewards.some((r) => r.kind === 'cores')).toBe(true);
    expect(loss.rewards.some((r) => r.kind === 'mats')).toBe(true);
    const draw = arenaMatchRewards('draw', 4);
    expect(draw.passXp).toBe(0);
    expect(draw.rewards).toEqual([{ kind: 'cores', qty: ARENA.drawCores }]);
  });

  it('win container rarity bands by division', () => {
    expect(arenaMatchRewards('win', 0).rewards[0]).toMatchObject({ kind: 'container', rarity: 'common' });
    expect(arenaMatchRewards('win', 4).rewards[0]).toMatchObject({ kind: 'container', rarity: 'rare' });
    expect(arenaMatchRewards('win', 9).rewards[0]).toMatchObject({ kind: 'container', rarity: 'epic' });
  });
});

describe('rank benefits (the idle dividend)', () => {
  it('division 0 is EXACTLY ×1 (IEEE-identity — a non-arena account is untouched)', () => {
    expect(arenaIdleDividend(0)).toBe(1);
    expect(arenaIdleCapBonusHours(0)).toBe(0);
  });

  it('diminishing and hard-capped — never runaway progression', () => {
    let prev = 1;
    let prevGain = Infinity;
    for (let d = 1; d < ARENA_DIVISIONS.length; d++) {
      const m = arenaIdleDividend(d);
      expect(m).toBeGreaterThan(prev - 1e-12);
      const gain = m - prev;
      expect(gain).toBeLessThanOrEqual(prevGain + 1e-12); // diminishing steps
      prev = m;
      prevGain = gain;
    }
    expect(arenaIdleDividend(9)).toBeLessThanOrEqual(1.15);
    expect(arenaIdleCapBonusHours(9)).toBeLessThanOrEqual(6);
  });

  it('divisionIndex matches the division table', () => {
    expect(divisionIndex(0)).toBe(0);
    expect(divisionIndex(2800)).toBe(ARENA_DIVISIONS.length - 1);
  });
});
