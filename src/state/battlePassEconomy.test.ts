// Battle Pass economy simulations (docs/BATTLEPASS.md §economy) — player archetypes walked
// through a full 14-day season with the REAL XP formula and curve. Pins the pacing promises:
// free players stay respected, heavy players finish with room to spare, premium is worth it,
// skipping with money is expensive, and no lane trivializes the season.

import { describe, expect, it } from 'vitest';
import { BP, levelBuyPrice, levelOf, xpToReach } from '../core/battlePass';

/** The meta finishRun formula (state/meta.ts) — mirrored so a drift breaks THIS test. */
function runXp(r: { kills: number; wave: number; bosses: number; megas: number; won: boolean; stage: number; dailyClear: boolean; contracts: number }): number {
  return Math.round(
    r.kills * 0.5 + r.wave * 8 + r.bosses * 25 + r.megas * 80
    + (r.won ? 120 : 30) + r.stage * 3 + (r.dailyClear ? 200 : 0) + r.contracts * 150,
  );
}

const CASUAL_RUN = { kills: 350, wave: 24, bosses: 2, megas: 0, won: true, stage: 12, dailyClear: false, contracts: 0 };
const MID_RUN = { kills: 550, wave: 32, bosses: 3, megas: 0, won: true, stage: 20, dailyClear: false, contracts: 0 };
const HEAVY_RUN = { kills: 700, wave: 38, bosses: 4, megas: 1, won: true, stage: 28, dailyClear: false, contracts: 0 };

describe('archetype pacing over one 14-day season', () => {
  it('CASUAL FREE (2 wins + the daily, most days) lands mid-track — respected, not finished', () => {
    let xp = 0;
    for (let day = 0; day < 14; day++) {
      xp += runXp(CASUAL_RUN) + runXp(CASUAL_RUN);
      if (day % 7 !== 6) xp += runXp({ ...CASUAL_RUN, dailyClear: true }); // misses one daily a week
      if (day % 3 === 0) xp += 150; // the odd achievement
    }
    const level = levelOf(xp).level;
    expect(level).toBeGreaterThanOrEqual(45);
    expect(level).toBeLessThanOrEqual(75);
  });

  it('HEAVY (8 runs/day + daily + extras) completes with days to spare — never a second job', () => {
    let xp = 0;
    let daysToFinish = 14;
    for (let day = 0; day < 14; day++) {
      for (let i = 0; i < 8; i++) xp += runXp(HEAVY_RUN);
      xp += runXp({ ...HEAVY_RUN, dailyClear: true }) + 300; // daily + achievements/expeditions/roulette trickle
      if (xp >= xpToReach(BP.levels) && daysToFinish === 14) daysToFinish = day + 1;
    }
    expect(daysToFinish).toBeLessThanOrEqual(11);
    expect(daysToFinish).toBeGreaterThanOrEqual(6); // and never trivial
  });

  it('MID PREMIUM (3 wins/day) clears or nearly clears; a few level buys close any gap', () => {
    let xp = 0;
    for (let day = 0; day < 14; day++) {
      xp += runXp(MID_RUN) * 3 + runXp({ ...MID_RUN, dailyClear: true });
      xp += day % 2 === 0 ? 150 : 40; // achievements + expedition trickle
    }
    const level = levelOf(xp).level;
    expect(level).toBeGreaterThanOrEqual(80); // the crown is in sight…
    expect(BP.levels - level).toBeLessThanOrEqual(20); // …never more than a stretch away
    // Closing the gap with Ichor stays a mild splurge, not a second pass purchase — and
    // rollover mail means an unfinished track still pays out everything actually earned.
    let topUp = 0;
    for (let l = level; l < BP.levels; l++) topUp += levelBuyPrice(l);
    expect(topUp).toBeLessThan(BP.premiumIchor * 2.5);
  });

  it('LOW SPENDER: the daily ad lane alone contributes a bounded 14 levels', () => {
    expect(14 * BP.adLevelsPerDay).toBeLessThanOrEqual(14);
  });

  it('HIGH SPENDER: buying the whole track costs ~10× the pass — skipping is a luxury, not a win', () => {
    let all = 0;
    for (let l = 0; l < BP.levels; l++) all += levelBuyPrice(l);
    expect(all).toBeGreaterThan(2_000);
    expect(all).toBeLessThan(3_500); // and not absurd — a determined whale CAN finish day one
  });
});
