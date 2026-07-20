// Battle Pass meta pipeline (docs/BATTLEPASS.md): claims (tracks/gates/taste levels),
// purchases (Ichor premium + level buys + the store SKU door), the ad-lane day cap,
// XP grants + level-ups, permanents-once with repeat replacements, the Perennial stack,
// rollover auto-claim, the max-window tamper rule, and the effects/econ folds.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { meta } from './meta';
import { BP, levelOf, seasonForWindow, seasonTracks, xpToReach } from '../core/battlePass';

const T0 = BP.epochMs + 5; // window 0, Crimson Bloom

// Deep meta chains (achievement/run XP grants) default `now` to the wall clock; once the real
// date leaves window 0, an unpinned Date.now() inside a claim chain rolls the season over
// MID-TEST and resets the claim record. Pin Date to T0 so the suite is hermetic on any day.
beforeEach(() => {
  vi.useFakeTimers({ now: T0, toFake: ['Date'] });
  meta.reset();
});
afterEach(() => vi.useRealTimers());

describe('XP & levels', () => {
  it('grants XP, detects level-ups, caps at 100', () => {
    expect(meta.grantPassXp('test', 100, T0)).toBeNull(); // no level crossed
    expect(meta.grantPassXp('test', 250, T0)).toEqual({ from: 0, to: 1 });
    meta.grantPassXp('test', 10_000_000, T0);
    expect(meta.get().battlePass.xp).toBe(xpToReach(BP.levels));
    expect(meta.grantPassXp('test', 10, T0)).toBeNull(); // saturated
  });

  it('level buys spend Ichor and land exactly one level', () => {
    meta.grantIchor('test', 100);
    expect(meta.buyPassLevel(T0)).toBe(true);
    expect(levelOf(meta.get().battlePass.xp).level).toBe(1);
    expect(meta.get().ichor).toBe(100 - 15);
  });

  it('the ad lane advances one level per UTC day, then refuses', () => {
    expect(meta.adAdvancePass(T0)).toBe(true);
    expect(levelOf(meta.get().battlePass.xp).level).toBe(1);
    expect(meta.adAdvancePass(T0)).toBe(false); // day cap
    expect(meta.adAdvancePass(T0 + 86_400_000)).toBe(true); // next day re-arms
  });
});

describe('claims', () => {
  it('free claims need the level; premium needs Premium — except the taste levels 1/50/99', () => {
    expect(meta.claimPassLevel('free', 1, T0)).toBeNull(); // level not reached
    meta.grantPassXp('test', xpToReach(2), T0);
    expect(meta.claimPassLevel('free', 1, T0)).not.toBeNull();
    expect(meta.claimPassLevel('free', 1, T0)).toBeNull(); // once per level
    expect(meta.claimPassLevel('premium', 2, T0)).toBeNull(); // gated
    expect(meta.claimPassLevel('premium', 1, T0)).not.toBeNull(); // the taste level
  });

  it('buyPassPremium spends Ichor once and opens the premium track', () => {
    meta.grantIchor('test', BP.premiumIchor + 10);
    expect(meta.buyPassPremium(T0)).toBe(true);
    expect(meta.get().battlePass.premium).toBe(true);
    expect(meta.get().ichor).toBe(10);
    expect(meta.buyPassPremium(T0)).toBe(false); // already owned this season
    meta.grantPassXp('test', xpToReach(3), T0);
    expect(meta.claimPassLevel('premium', 2, T0)).not.toBeNull();
  });

  it('the store Season Pass SKU lands on the same flag', () => {
    const offer = { id: 'bp_premium_test', kind: 'season' as const, name: 'x', tagline: 'x', priceUsd: 9.99, accent: '', art: '', grants: [{ grant: 'battlePassPremium' as const }] };
    const { next } = meta.interpretGrants(meta.get(), offer);
    expect(next.battlePass.premium).toBe(true);
  });

  it('claimAllPass drains every earned level on both tracks', () => {
    meta.grantIchor('test', BP.premiumIchor);
    meta.buyPassPremium(T0);
    meta.grantPassXp('test', xpToReach(10), T0);
    const lines = meta.claimAllPass(T0);
    expect(lines.length).toBeGreaterThan(10);
    const bp = meta.get().battlePass;
    expect(bp.claimedFree).toHaveLength(10);
    expect(bp.claimedPremium).toHaveLength(10);
    expect(meta.battlePass(T0).claimableFree).toHaveLength(0);
  });
});

describe('permanents, stacks & repeats', () => {
  it('a passive lands once EVER; the same level on a repeat rotation pays the replacement', () => {
    const season = seasonForWindow(0);
    const level = season.freePassiveLevels[0]; // s1 free passive slot
    meta.grantPassXp('test', xpToReach(level), T0);
    expect(meta.claimPassLevel('free', level, T0)).not.toBeNull();
    const owned = [...meta.get().battlePass.permanents];
    expect(owned).toHaveLength(1);
    // Two windows later the SAME season returns (ring of 2).
    const t2 = T0 + BP.rotationMs * 2;
    meta.pollBattlePass(t2);
    expect(meta.get().battlePass.window).toBe(2);
    meta.grantPassXp('test', xpToReach(level), t2);
    const before = meta.get();
    const lines = meta.claimPassLevel('free', level, t2)!;
    const after = meta.get();
    expect(after.battlePass.permanents).toEqual(owned); // never re-granted
    expect(lines.some((l) => l.icon === '⟳')).toBe(true); // the replacement line
    expect(after.ichor - before.ichor).toBe(BP.repeatReplacement.ichor);
    expect(after.shards - before.shards).toBe(BP.repeatReplacement.cores);
  });

  it('the level-100 stack repeats forever and counts completions', () => {
    meta.grantPassXp('test', xpToReach(100), T0);
    meta.claimPassLevel('free', 100, T0);
    expect(meta.get().battlePass.stacks).toBe(1);
    expect(meta.get().battlePass.completions.s1).toBe(1);
    const t2 = T0 + BP.rotationMs * 2;
    meta.pollBattlePass(t2);
    meta.grantPassXp('test', xpToReach(100), t2);
    meta.claimPassLevel('free', 100, t2);
    expect(meta.get().battlePass.stacks).toBe(2);
    expect(meta.get().battlePass.completions.s1).toBe(2);
  });

  it('permanents + stacks fold into run effects; a fresh save folds NOTHING (golden-safe)', () => {
    expect(meta.battlePassRunEffects()).toHaveLength(0);
    meta.grantPassXp('test', xpToReach(100), T0);
    meta.claimAllPass(T0);
    const fx = meta.battlePassRunEffects();
    expect(fx.length).toBeGreaterThanOrEqual(3); // free effect-passives + the stack
    for (const e of fx) expect(e.op).toBe('mul');
  });
});

describe('rollover & tamper', () => {
  it('rollover AUTO-CLAIMS earned unclaimed levels (mail), then resets the record', () => {
    meta.grantPassXp('test', xpToReach(5), T0);
    const before = meta.get();
    meta.pollBattlePass(T0 + BP.rotationMs);
    const after = meta.get();
    expect(after.battlePass.window).toBe(1);
    expect(after.battlePass.xp).toBe(0);
    expect(after.battlePass.claimedFree).toHaveLength(0);
    // The 5 earned free levels paid out on the way (currency moved).
    expect(after.shards + after.geneEssence + after.ichor + after.pendingContainers.length)
      .toBeGreaterThan(before.shards + before.geneEssence + before.ichor + before.pendingContainers.length);
  });

  it('a rolled-back clock cannot forge a fresh season (max-window rule)', () => {
    const t1 = T0 + BP.rotationMs;
    meta.pollBattlePass(t1);
    expect(meta.get().battlePass.window).toBe(1);
    meta.pollBattlePass(T0); // clock rolled back
    expect(meta.get().battlePass.window).toBe(1);
  });

  it('premium does NOT carry across seasons', () => {
    meta.grantIchor('test', BP.premiumIchor);
    meta.buyPassPremium(T0);
    meta.pollBattlePass(T0 + BP.rotationMs);
    expect(meta.get().battlePass.premium).toBe(false);
  });
});

describe('the view', () => {
  it('battlePass(now) is a pure read: season, countdown, claimables, taste levels', () => {
    meta.grantPassXp('test', xpToReach(2), T0);
    const v = meta.battlePass(T0);
    expect(v.season.id).toBe('s1');
    expect(v.endsInMs).toBeGreaterThan(0);
    expect(v.claimableFree).toEqual([1, 2]);
    expect(v.claimablePremium).toEqual([1]); // the taste level only (no premium)
    expect(v.tracks).toBe(seasonTracks('s1')); // cached table identity
    expect(v.levelPrice).toBe(15);
  });
});
