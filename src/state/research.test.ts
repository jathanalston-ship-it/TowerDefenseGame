// FIELD RESEARCH contract (docs/RESEARCH.md): daily caps + UTC rollover, progression
// scaling, one-run boost consumption, the once-daily emergency choice, and the
// design-law guardrails — the lane must stay a SMALL accelerator (never optimal
// progression, never a premium replacement) and a fresh save must be byte-identical
// (golden safety rides the neutral defaults).

import { beforeEach, describe, expect, it } from 'vitest';
import { meta, metaModifiers } from './meta';
import type { RunResult } from './meta';
import type { RunStats } from '../core/types';
import { defaultLifetimeStats } from '../save/saveStore';
import { HERO_ORDER, MODE_UNLOCKS, TOWER_ORDER } from '../core/config';
import { EMERGENCY_PICKS, RESEARCH, RESEARCH_REWARDS, researchRegistry, researchScale } from '../core/research';
import { PREMIUM } from '../core/premium';

const DAY = new Date('2026-07-08T10:00:00Z');
const NEXT_DAY = new Date('2026-07-09T10:00:00Z');

describe('registry + design law', () => {
  it('every reward validates; ichor never exceeds 3 per claim at ANY scale', () => {
    expect(researchRegistry.validate()).toEqual([]);
    for (const d of RESEARCH_REWARDS) {
      if (!d.grants) continue;
      for (const scale of [1, RESEARCH.scaleMax]) {
        for (const g of d.grants(scale)) {
          if (g.grant === 'ichor') expect(g.qty).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  it('a maxed research day never rivals the store: daily ichor ≤ 5 (≈ $0.20 at the base rate)', () => {
    // Worst case: 2× ichor_trace (its own cap) + the emergency ichor pick.
    const daily = RESEARCH.ichorDailyCap * 1 + 3;
    expect(daily).toBeLessThanOrEqual(5);
    expect(daily / PREMIUM.ichorPerUsd).toBeLessThan(0.25); // supplements, never replaces
  });

  it('boost multipliers stay small (accelerator, never a power spike)', () => {
    for (const d of RESEARCH_REWARDS) {
      for (const v of Object.values(d.boost ?? {})) expect(v).toBeLessThanOrEqual(1.25);
    }
  });

  it('scaling is clamped and monotone in progression', () => {
    expect(researchScale({ stage: 0, molts: 0, collectionFrac: 0 })).toBe(1);
    const mid = researchScale({ stage: 30, molts: 1, collectionFrac: 0.3 });
    const deep = researchScale({ stage: 60, molts: 4, collectionFrac: 0.9 });
    expect(mid).toBeGreaterThan(1);
    expect(deep).toBeGreaterThanOrEqual(mid);
    expect(researchScale({ stage: 999, molts: 99, collectionFrac: 1 })).toBe(RESEARCH.scaleMax);
  });
});

describe('claims — caps, rollover, ledgers', () => {
  beforeEach(() => meta.reset());

  it('grants through the store interpreter and books the day ledger', () => {
    const before = meta.get().shards;
    const r = meta.claimResearch('core_sample', undefined, DAY);
    expect(r).not.toBeNull();
    expect(meta.get().shards).toBeGreaterThan(before);
    expect(meta.get().research.claims.core_sample).toBe(1);
    expect(meta.get().research.lifetime.claims.core_sample).toBe(1);
  });

  it('enforces the sample pool (5/day) across rewards and the ichor sub-cap (2/day)', () => {
    expect(meta.claimResearch('ichor_trace', undefined, DAY)).not.toBeNull();
    expect(meta.claimResearch('ichor_trace', undefined, DAY)).not.toBeNull();
    expect(meta.claimResearch('ichor_trace', undefined, DAY)).toBeNull(); // its own cap
    expect(meta.get().ichor).toBe(2);
    expect(meta.claimResearch('core_sample', undefined, DAY)).not.toBeNull();
    expect(meta.claimResearch('mat_harvest', undefined, DAY)).not.toBeNull();
    expect(meta.claimResearch('essence_extract', undefined, DAY)).not.toBeNull();
    // Pool of 5 spent (2 ichor + 3 others) — every further sample refuses.
    expect(meta.claimResearch('core_sample', undefined, DAY)).toBeNull();
    expect(meta.claimResearch('essence_extract', undefined, DAY)).toBeNull();
  });

  it('rolls over at UTC midnight — a new day is a fresh board', () => {
    for (let i = 0; i < 5; i++) meta.claimResearch(['core_sample', 'mat_harvest', 'essence_extract', 'ichor_trace', 'ichor_trace'][i], undefined, DAY);
    expect(meta.claimResearch('core_sample', undefined, DAY)).toBeNull(); // spent
    expect(meta.claimResearch('core_sample', undefined, NEXT_DAY)).not.toBeNull(); // fresh day
    expect(meta.get().research.day).toBe('2026-07-09');
    expect(meta.get().research.claims.core_sample).toBe(1); // counters reset with the day
  });

  it('sample payouts scale with progression; ichor stays FLAT', () => {
    const r1 = meta.claimResearch('core_sample', undefined, DAY);
    const base = meta.get().shards;
    meta.reset();
    const s = meta.get();
    // Deep account: campaign 60 (scale rises), same claim.
    meta.importText(JSON.stringify({ schemaVersion: 24, data: { ...s, campaign: { ...s.campaign, cleared: { standard: 60 } } } }));
    const r2 = meta.claimResearch('core_sample', undefined, DAY);
    expect(r1 && r2).toBeTruthy();
    expect(meta.get().shards).toBeGreaterThan(base);
    // Ichor: identical at any depth.
    expect(meta.claimResearch('ichor_trace', undefined, DAY)).not.toBeNull();
    expect(meta.get().ichor).toBe(1);
  });

  it('the stamina infusion is gated behind Boss Rush and capped once/day', () => {
    expect(meta.claimResearch('stamina_infusion', undefined, DAY)).toBeNull(); // fresh account: gated
    const s = meta.get();
    meta.importText(JSON.stringify({ schemaVersion: 24, data: { ...s, campaign: { ...s.campaign, cleared: { standard: MODE_UNLOCKS.bossRush } } } }));
    expect(meta.claimResearch('stamina_infusion', undefined, DAY)).not.toBeNull();
    expect(meta.claimResearch('stamina_infusion', undefined, DAY)).toBeNull(); // once a day
  });
});

describe('boosts — armed once, consumed by exactly one finished run', () => {
  beforeEach(() => meta.reset());

  it('arms on claim, folds into modifiers, and ONE finished run consumes it', () => {
    expect(metaModifiers(meta.get()).biomassMult).toBe(1);
    expect(meta.claimResearch('nutrient_wash', undefined, DAY)).not.toBeNull();
    expect(meta.claimResearch('specimen_bounty', undefined, DAY)).not.toBeNull();
    expect(meta.get().research.pendingBoosts).toEqual(['nutrient_wash', 'specimen_bounty']);
    expect(metaModifiers(meta.get()).biomassMult).toBeCloseTo(1.05, 10);
    // Two identical runs, boosted vs not: the boosted one pays more cores, then the arm clears.
    const boosted = meta.finishRun(mkRun(10, 120));
    expect(meta.get().research.pendingBoosts).toEqual([]); // consumed by THIS finish
    expect(metaModifiers(meta.get()).biomassMult).toBe(1); // biomass lever released too
    const plain = meta.finishRun(mkRun(10, 120));
    expect(boosted.reward.shardsEarned).toBeGreaterThan(plain.reward.shardsEarned); // ×1.1 cores landed
  });

  it('boost pool: 2/day', () => {
    expect(meta.claimResearch('mastery_focus', undefined, DAY)).not.toBeNull();
    expect(meta.claimResearch('apex_observation', undefined, DAY)).not.toBeNull();
    expect(meta.claimResearch('specimen_bounty', undefined, DAY)).toBeNull(); // pool spent
  });
});

describe('emergency protocol — once daily, the player chooses', () => {
  beforeEach(() => meta.reset());

  it('each pick pays its promise and the day allows exactly one', () => {
    const r = meta.claimResearch('emergency_protocol', 'ichor', DAY);
    expect(r).not.toBeNull();
    expect(meta.get().ichor).toBe(3);
    expect(meta.claimResearch('emergency_protocol', 'cores', DAY)).toBeNull(); // once a day
    expect(meta.claimResearch('emergency_protocol', 'container', NEXT_DAY)).not.toBeNull();
    expect(meta.get().pendingContainers.length).toBe(1);
  });

  it('the boost pick arms Mastery Focus without touching the boost pool cap', () => {
    meta.claimResearch('mastery_focus', undefined, DAY);
    meta.claimResearch('apex_observation', undefined, DAY); // boost pool now spent
    const r = meta.claimResearch('emergency_protocol', 'boost', DAY); // emergency pool is separate
    expect(r).not.toBeNull();
    expect(meta.get().research.pendingBoosts).toContain('mastery_focus');
  });

  it('every advertised pick is real', () => {
    expect(EMERGENCY_PICKS.map((p) => p.pick).sort()).toEqual(['boost', 'container', 'cores', 'ichor']);
  });
});

function mkRun(wave: number, kills: number): RunResult {
  const zero = { kills: 0, damage: 0, activeTime: 0 };
  const mastery = TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['mastery'];
  const heroMastery = HERO_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['heroMastery'];
  const stats: RunStats = {
    kills, wave, won: true, biomassEarned: 0, damageDealt: 0, integrityLost: 0,
    killsByEnemy: defaultLifetimeStats().killsByEnemy,
    towerBuilds: TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: 0 }), {}) as RunStats['towerBuilds'],
    cardIds: [], heroId: HERO_ORDER[0],
  };
  return { wave, kills, won: true, mastery, heroMastery, stats };
}
