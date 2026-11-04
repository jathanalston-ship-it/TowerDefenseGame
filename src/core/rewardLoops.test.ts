// rewardLoops — pins the reward architecture's laws (docs/REWARD-ARCHITECTURE.md):
// no source dead-ends in its own loop, every loop pays at multiple timescales, every
// loop is cross-fed, and the full five-loop chain exists from ANY starting loop. The
// registry rows must also stay honest against the real hub (valid nav keys) and cover
// the initiative's mandated surface.

import { describe, expect, it } from 'vitest';
import {
  LOOPS, REWARD_SOURCES, fullLoopChain, loopGraph, loopOfNav, rewardLoopProblems, sourcesInLoop,
} from './rewardLoops';
import { CAMPAIGN_REWARDS, campaignSurveyBonus } from './config';
import { hostOf, navGroups, type NavKey } from '../ui/navModel';

describe('the architecture laws', () => {
  it('registry is structurally clean (the machine-enforced laws all hold)', () => {
    expect(rewardLoopProblems()).toEqual([]);
  });

  it('every source feeds beyond itself and the graph reaches everywhere', () => {
    for (const s of REWARD_SOURCES) expect(s.feeds.some((f) => f !== s.loop), s.id).toBe(true);
    const g = loopGraph();
    for (const from of LOOPS) {
      // BFS: every loop reaches every other loop through feeds.
      const seen = new Set([from]);
      const q = [from];
      while (q.length) for (const n of g[q.shift()!]) if (!seen.has(n)) { seen.add(n); q.push(n); }
      expect([...seen].sort(), `reachability from ${from}`).toEqual([...LOOPS].sort());
    }
  });

  it('the spec chain exists: a Boss-Rush-shaped session can visit all five loops', () => {
    for (const start of LOOPS) {
      const chain = fullLoopChain(start);
      expect(chain, `chain from ${start}`).not.toBeNull();
      expect(new Set(chain!).size).toBe(LOOPS.length);
    }
  });

  it('every nav key in the registry is a real hub screen (a folded tab resolves to its host)', () => {
    const known = new Set<string>(navGroups().flatMap((grp) => grp.items.map((i) => i.key)));
    for (const s of REWARD_SOURCES) expect(known.has(hostOf(s.nav as NavKey)), `${s.id} → nav '${s.nav}'`).toBe(true);
  });

  it('loopOfNav classifies claim/upgrade screens and leaves chrome unclassified', () => {
    expect(loopOfNav('vault')).toBe('reward');
    expect(loopOfNav('towers')).toBe('upgrade');
    expect(loopOfNav('season')).toBe('progression');
    expect(loopOfNav('collection')).toBe('collection');
    expect(loopOfNav('auction')).toBe('economy');
    expect(loopOfNav('settings')).toBeNull();
  });

  it('covers the initiative surface: the mandated systems all appear', () => {
    const ids = new Set(REWARD_SOURCES.map((s) => s.id));
    for (const required of ['battle_pass', 'mastery_tracks', 'genome_rank', 'quests', 'daily_login',
      'vault_containers', 'bio_roulette', 'run_cache', 'run_bossrush', 'run_arena', 'idle_harvest',
      'tower_stars', 'hero_stars', 'gene_upgrades', 'equipment_forge', 'mulligan_grafts', 'hive_organs',
      'collections_ranks', 'wardrobe', 'achievements', 'splice_market', 'ichor_exchange', 'auction_house']) {
      expect(ids.has(required), required).toBe(true);
    }
    expect(REWARD_SOURCES.length).toBeGreaterThanOrEqual(35);
    // Frequency > quantity: most of the map must pay at sub-weekly cadence.
    const fast = REWARD_SOURCES.filter((s) => ['perRun', 'daily', 'passive', 'onDemand'].includes(s.cadence));
    expect(fast.length / REWARD_SOURCES.length).toBeGreaterThan(0.6);
  });

  it('each loop is genuinely populated', () => {
    for (const loop of LOOPS) expect(sourcesInLoop(loop).length, loop).toBeGreaterThanOrEqual(2);
  });
});

describe('value-neutral drips (Reward Frequency > Reward Quantity — the neutrality contract)', () => {
  it('the Sector Survey drip totals EXACTLY the old milestone lump over any window', () => {
    // Old model: +milestoneCore on every milestoneEvery-th stage. New model: an even
    // per-stage drip. Any consecutive milestoneEvery-stage window must pay the same total.
    for (let start = 1; start <= 40; start++) {
      let total = 0;
      for (let s = start; s < start + CAMPAIGN_REWARDS.milestoneEvery; s++) total += campaignSurveyBonus(s);
      expect(total).toBeCloseTo(CAMPAIGN_REWARDS.milestoneCore, 9);
    }
    // The drip stays integral so first-clear payouts never show fractional cores.
    expect(Number.isInteger(campaignSurveyBonus(1))).toBe(true);
    // The LANDMARK cadence stays every-5th (map landmarks + authored finales are untouched).
    expect(CAMPAIGN_REWARDS.milestoneEvery).toBe(5);
  });
});
