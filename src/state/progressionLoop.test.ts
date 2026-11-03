// PROGRESSION LOOP — enforcement invariants (docs/PROGRESSION-LOOP.md). These pin the SHAPE
// of the macro-loop (Campaign → wall → farm Infinite → power → breakthrough → repeat) so a
// future balance/content change that breaks the loop breaks the build:
//   1. RESISTANCE — the requirement curve is geometric: every band costs more power.
//   2. WALL EXISTS — any fixed power stalls at a finite stage (you cannot out-run the curve).
//   3. NEVER IMPOSSIBLE — the stage-cap power CEILING (farm-funded, uncapped sources at the
//      caps that stage unlocks) clears the NEXT stage with margin across the content range.
//   4. INTERLOCK — no single lever suffices deep (mastery alone saturates): farming must
//      convert into multiple permanent systems, which is the loop's texture.
//   5. PRESTIGE RING — the long-range lever is unbounded (√lifetimeCells) and its gate is
//      CAMPAIGN depth, so the deep loop routes through Campaign again.
//   6. CANNOT SKIP CAMPAIGN — permanent-system caps are stage-gated and genuinely bite.
//   7. CANNOT SKIP INFINITE — the farm identity pays there (loot + mastery premiums, exploit gate).
//   8. The engine classifies the phases from those same curves.
// The TIME axis (how long each wall takes) is deliberately not pinned here — that is the
// progression simulator's domain (docs/PROGRESSION-LOOP.md §time).

import { describe, it, expect, vi } from 'vitest';
import { deployReadiness, loopAdvice, loopState, readinessBand } from './progressionLoop';
import { setLastFlawlessClearPref } from './prefs';
import { accountPowerParts } from './meta';
import { composePower } from '../core/power';
import { recommendedPowerScore } from '../core/campaign';
import { defaultSave } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';
import { HERO_ORDER, HERO_SLOTS, INFINITE_REWARD_QUALIFY_FRAC, META_UPGRADES, MODE_REWARDS, MODE_UNLOCKS, READINESS, STAR, TOWER_ORDER, campaignStarCap } from '../core/config';
import { GENE_LEVEL_GATES, geneLevelCapForStage } from '../core/geneCards';
import { cardRegistry } from '../core/cards';
import { prestigeMult, prestigeStageReq } from '../core/prestige';

function powerOf(save: SaveData): number {
  return composePower(accountPowerParts(save)).score;
}

/** Mastery-only farm power (the single-lever probe — saturates by design). */
function powerAtMastery(xp: number): number {
  const s = defaultSave();
  const towerMasteryXp = { ...s.towerMasteryXp };
  for (const k of TOWER_ORDER) towerMasteryXp[k] = xp;
  return powerOf({ ...s, towerMasteryXp });
}

/** The MODEST stage-cap ceiling: caps unlocked at `stage`, funded by uncapped farm income
 *  (loot → stars, essence → gene levels, shards → upgrades, XP → mastery). Deliberately
 *  conservative — no equipment, no prestige, upgrades at a mid band — so the invariant
 *  holds with slack, not by exhausting every lever. */
function ceilingAt(stage: number): number {
  const s = defaultSave();
  const starCap = Math.min(STAR.maxTowerStars, campaignStarCap(stage));
  for (const k of TOWER_ORDER) { s.towerStars[k] = starCap; s.towerMasteryXp[k] = 1e8; }
  for (const k of HERO_ORDER) { s.heroStars[k] = 5; s.heroMasteryXp[k] = 1e8; s.stats.heroUsage[k] = 1; }
  const geneCap = geneLevelCapForStage(stage);
  const genes: SaveData['genes'] = {};
  for (const c of cardRegistry.active()) genes[c.id] = { level: geneCap };
  for (const u of META_UPGRADES) s.upgrades[u.id] = 10;
  return powerOf({ ...s, genes, campaign: { ...s.campaign, cleared: { standard: stage } } });
}

describe('loop enforcement invariants', () => {
  it('1. RESISTANCE — the campaign requirement curve is geometric (no free ride)', () => {
    // 2026-07 re-anchor (docs/DIFFICULTY.md §curve): mega-hosting stages (every 10th) carry an
    // honest RAID premium, so the ladder is a rising curve with authored SPIKES — strictly
    // rising across wave stages, a spike up onto each mega stage, and rising over any decade.
    const isMega = (s: number): boolean => s >= 10 && s % 10 === 0;
    let prev = recommendedPowerScore(1);
    for (let s = 2; s <= 90; s++) {
      const cur = recommendedPowerScore(s);
      if (isMega(s)) expect(cur).toBeGreaterThan(prev); // the raid reads ABOVE the stage before it
      else if (!isMega(s - 1)) expect(cur).toBeGreaterThan(prev); // wave ladder: strictly rising
      else expect(cur).toBeGreaterThan(prev / 1.8); // post-mega: only the premium comes off — never a real dip
      prev = cur;
    }
    // The long-run curve dominates the sawtooth: every decade multiplies the bar (geometric).
    for (let s = 5; s <= 80; s++) {
      expect(recommendedPowerScore(s + 10)).toBeGreaterThan(recommendedPowerScore(s));
    }
    for (let s = 5; s <= 70; s += 10) {
      expect(recommendedPowerScore(s + 10) / recommendedPowerScore(s)).toBeGreaterThan(1.5);
    }
  });

  it('2. WALL EXISTS — any fixed power stalls at a finite stage', () => {
    for (const power of [1_000, 50_000, 2_000_000]) {
      let wall = -1;
      for (let s = 1; s <= 300; s++) {
        if (recommendedPowerScore(s) > power) { wall = s; break; }
      }
      expect(wall).toBeGreaterThan(0); // the curve always out-runs a static account
    }
  });

  it('3. NEVER IMPOSSIBLE — the stage-cap ceiling clears the next stage with margin', () => {
    for (const stage of [1, 10, 20, 30, 45, 60, 75, 90]) {
      const ceiling = ceilingAt(stage);
      const required = recommendedPowerScore(stage + 1);
      expect(ceiling).toBeGreaterThan(required * 1.5); // ≥ 50% slack, conservatively modeled
    }
  });

  it('4. INTERLOCK — no single lever suffices deep (mastery alone saturates)', () => {
    expect(powerAtMastery(1e7)).toBeGreaterThan(powerAtMastery(0)); // it always helps …
    expect(powerAtMastery(1e13)).toBeLessThan(recommendedPowerScore(60)); // … but can't carry alone
  });

  it('5. PRESTIGE RING — unbounded long-range lever, gated on Campaign depth', () => {
    expect(prestigeMult(100)).toBeGreaterThan(prestigeMult(0));
    expect(prestigeMult(1_000_000)).toBeGreaterThan(prestigeMult(10_000)); // √cells: no ceiling
    expect(prestigeStageReq(0)).toBeGreaterThan(0); // the FIRST molt already needs campaign depth
    expect(prestigeStageReq(5)).toBeGreaterThan(prestigeStageReq(0)); // and each molt needs more
  });

  it('6. CANNOT SKIP CAMPAIGN — permanent caps are stage-gated and bite', () => {
    expect(campaignStarCap(0)).toBeLessThan(campaignStarCap(50)); // tower evolutions gate on stages
    expect(geneLevelCapForStage(0)).toBeLessThan(geneLevelCapForStage(80)); // gene depth gates on stages
    expect(GENE_LEVEL_GATES.length).toBeGreaterThanOrEqual(3); // …across a spread of milestones
    expect(HERO_SLOTS.some((s) => s.campaignStage > 0)).toBe(true); // extra hero slots gate on stages
  });

  it('7. CANNOT SKIP INFINITE — the farm identity pays there', () => {
    expect(MODE_REWARDS.loot.endless).toBeGreaterThan(MODE_REWARDS.loot.campaign); // loot farm
    expect(MODE_REWARDS.mastery.endless).toBeGreaterThan(MODE_REWARDS.mastery.campaign); // mastery venue
    expect(INFINITE_REWARD_QUALIFY_FRAC).toBeGreaterThan(0); // exploit gate: short runs pay nothing
  });

  it('8. ENGINE — classifies farm vs advance from the same curves', () => {
    const fresh = defaultSave();
    const early = loopState(fresh);
    expect(early.frontierStage).toBe(1);
    expect(early.phase).toBe('advance-campaign'); // early campaign success: stage 1 is open
    expect(loopAdvice(early)).toContain('Stage 1');

    // Deep frontier + fresh power ⇒ the wall: farm Infinite.
    const walled = loopState({ ...fresh, campaign: { ...fresh.campaign, cleared: { standard: 30 } } });
    expect(walled.frontierStage).toBe(31);
    expect(walled.phase).toBe('farm-infinite');
    expect(walled.powerShort).toBeGreaterThan(0);
    expect(loopAdvice(walled)).toContain('Farm Infinite');

    // Farm depth rises with power (the frontier the farm advice points at).
    const strong = { ...fresh, towerMasteryXp: { ...fresh.towerMasteryXp } };
    for (const k of TOWER_ORDER) strong.towerMasteryXp[k] = 5_000_000;
    expect(loopState(strong).farmDepth).toBeGreaterThan(loopState(fresh).farmDepth);
  });
});

// Deploy readiness (docs/PROGRESSION-LOOP.md §readiness): ONE calm rule for every deploy surface.
describe('deploy readiness — calm inside tolerance, honest below it', () => {
  it('bands: ready at/above the recommendation, close inside READINESS.warnBelow, under below it', () => {
    expect(readinessBand(1050, 1050)).toBe('ready');
    expect(readinessBand(1028, 1050)).toBe('close'); // the playtest's "1,028 / 1,050" — no warning
    expect(readinessBand(Math.ceil(1000 * READINESS.warnBelow), 1000)).toBe('close');
    expect(readinessBand(Math.floor(1000 * READINESS.warnBelow) - 1, 1000)).toBe('under');
    expect(readinessBand(1125, 51039)).toBe('under'); // genuinely under-powered stays honest
  });

  it('never warns on the stage right after a flawless clear — and only that stage', () => {
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => { mem.set(k, v); },
      removeItem: (k: string) => { mem.delete(k); },
    });
    try {
      expect(deployReadiness(500, 1000, 2, 'standard')).toBe('under');
      setLastFlawlessClearPref({ diff: 'standard', stage: 1 });
      expect(deployReadiness(500, 1000, 2, 'standard')).toBe('close'); // directly after the flawless clear
      expect(deployReadiness(500, 1000, 3, 'standard')).toBe('under'); // a different stage
      expect(deployReadiness(500, 1000, 2, 'hardened')).toBe('under'); // a different track
      setLastFlawlessClearPref(null); // the next campaign settle ends the calm
      expect(deployReadiness(500, 1000, 2, 'standard')).toBe('under');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('loop advice never names a sealed mode and reads a near-miss as a push', () => {
    const fresh = defaultSave();
    const s1 = { ...fresh, campaign: { ...fresh.campaign, cleared: { standard: 1 } } };
    const ls = loopState(s1);
    expect(ls.infiniteOpen).toBe(false);
    const wall = { ...ls, phase: 'farm-infinite' as const, power: 100, requiredPower: 1000, powerShort: 900 };
    expect(loopAdvice(wall)).not.toContain('Farm Infinite'); // Infinite is sealed until Stage 3
    expect(loopAdvice(wall)).toContain(`Infinite opens at Stage ${MODE_UNLOCKS.infinite}`);
    const near = { ...wall, power: 980, powerShort: 20 };
    expect(loopAdvice(near)).toContain('within reach'); // inside tolerance: a push, not a wall
    expect(loopAdvice({ ...wall, infiniteOpen: true })).toContain('Farm Infinite');
  });
});
