// BATCH G "the grind" — the between-run loop contracts (docs/ONE-MORE-RUN.md §eta ·
// GENOME-RANK.md §peak · EQUIPMENT.md §codex · DAILY-LOGIN.md §income · COSMETICS.md §claim-all ·
// EVOLUTION-HQ.md §rebuild · PROGRESSION-SYSTEMS.md §ladders):
//   • the income ledger measures earning (never spending) and goal ETAs are honest;
//   • the Gear Codex credit is permanent (salvage never un-discovers);
//   • the Genome Rank's Power axis reads the PEAK (a Molt never demotes);
//   • ladders keep achievements coming without touching the authored ratio or Power;
//   • the Bio-Cache income line scales with income and freezes at the claim;
//   • claim-all binds commons only; the Genome rebuild preview IS the outcome.

import { beforeEach, describe, expect, it } from 'vitest';
import { defaultIncome, defaultLifetimeStats, defaultSave, serializeExport } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';
import { collectionContextOf, gearDiscovered, meta, towerStarCost, heroStarCost } from './meta';
import type { RunResult } from './meta';
import { HERO_ORDER, STAR, TOWER_ORDER } from '../core/config';
import type { RunStats, TowerKind } from '../core/types';
import { collectionView } from '../core/collection';
import { Rng } from '../core/rng';
import { ALL_ITEMS, rollItem } from '../core/equipment';
import { INCOME, coresPerMinute, etaLabel, heroWealth, incomePerRun, isOneMoreRun, runsToGain, runsToStage, tickIncome, towerWealth } from './income';
import { nextGoals } from './nextGoal';
import { ACHIEVEMENTS, AUTHORED_ACHIEVEMENTS, LADDER_FAMILIES, checkAchievements, ladderGoals, ladderThresholds } from './achievements';
import { genomeRating } from '../core/genomeRank';
import { LOGIN, loginIncomeCores, streakMult } from '../core/loginStreak';
import { wardrobeRegistry } from '../core/wardrobe';
import { genomeRebuildPlan } from './evolutionHQ';
import { bestPurchase } from './bestPurchase';
import { powerBreakdown } from './profile';
import { resetSecurity, setSecurityEnabled } from '../security/actionGuard';

function runResult(wave: number, kills: number): RunResult {
  const zero = { kills: 0, damage: 0, activeTime: 0 };
  const mastery = TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['mastery'];
  const heroMastery = HERO_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['heroMastery'];
  const stats: RunStats = {
    kills, wave, won: true, biomassEarned: 0, damageDealt: 0, integrityLost: 0,
    killsByEnemy: defaultLifetimeStats().killsByEnemy,
    towerBuilds: TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: 0 }), {}) as RunStats['towerBuilds'],
    cardIds: [], heroId: HERO_ORDER[0],
  };
  return { wave, kills, won: true, durationSec: wave * 30, mastery, heroMastery, stats };
}

function seed(over: Partial<SaveData> = {}): void {
  expect(meta.importText(serializeExport({ ...defaultSave(), ...over })).ok).toBe(true);
}

beforeEach(() => {
  resetSecurity();
  setSecurityEnabled(false); // these tests drive many actions back-to-back
});

describe('income ledger (docs/ONE-MORE-RUN.md §eta)', () => {
  it('first observation records the baseline + a lifetime prior; later settles fold deltas', () => {
    const a = tickIncome(defaultIncome(), { cores: 100, stage: 4 }, 4);
    expect(a.runs).toBe(0);
    expect(a.last).toEqual({ cores: 100, stage: 4 });
    expect(a.rate).toEqual({ cores: 25, stage: 1 }); // lifetime average prior
    const b = tickIncome(a, { cores: 160, stage: 4, kills: 9 }, 5);
    expect(b.runs).toBe(1);
    const w = 1 / (1 + INCOME.priorRuns);
    expect(b.rate.cores).toBeCloseTo(25 * (1 - w) + 60 * w, 9);
    expect(b.rate.stage).toBeCloseTo(1 - w, 9); // a 0-gain run pulls the pace down
    expect(b.rate.kills).toBeUndefined(); // a NEW meter only baselines
    expect(b.last.kills).toBe(9);
  });

  it('never reads a drop (reset / import / spend) as negative income', () => {
    const a = tickIncome({ runs: 3, last: { cores: 500 }, rate: { cores: 40 } }, { cores: 10 });
    expect(a.rate.cores).toBeLessThan(40);
    expect(a.rate.cores).toBeGreaterThanOrEqual(0);
  });

  it('unit WEALTH is unchanged by spending — buying a star moves shards into the ladder', () => {
    const k = TOWER_ORDER[0];
    const h = HERO_ORDER[0];
    seed({
      campaign: { cleared: { standard: 40 }, bestTime: {} },
      towerShards: { ...defaultSave().towerShards, [k]: 5000 },
      heroShards: { ...defaultSave().heroShards, [h]: 500 },
    });
    const t0 = towerWealth(meta.get(), k);
    const h0 = heroWealth(meta.get(), h);
    expect(meta.buyStar(k)).toBe(true);
    expect(meta.buyStar(k)).toBe(true);
    expect(meta.buyHeroStar(h)).toBe(true);
    expect(towerWealth(meta.get(), k)).toBe(t0); // closed form == meta.towerStarCost
    expect(heroWealth(meta.get(), h)).toBe(h0); // closed form == meta.heroStarCost
    expect(towerStarCost(0) + towerStarCost(1)).toBe(t0 - meta.get().towerShards[k]);
    expect(heroStarCost(0)).toBe(h0 - meta.get().heroShards[h]);
  });

  it('finishRun ticks the ledger: run-only Cores and run length feed coresPerMinute', () => {
    meta.reset();
    const first = meta.finishRun(runResult(10, 200));
    expect(meta.get().income.runs).toBe(0); // baseline settle (the first run's pay seeds the sample)
    expect(meta.get().income.rate.runCores).toBe(first.reward.shardsEarned);
    const out = meta.finishRun(runResult(10, 200));
    expect(meta.get().income.runs).toBe(1);
    const w = 1 / (1 + INCOME.priorRuns);
    // the RUN's own pay only — achievement/level-up Cores granted by the settle never count
    expect(incomePerRun(meta.get(), 'runCores')).toBeCloseTo(first.reward.shardsEarned * (1 - w) + out.reward.shardsEarned * w, 6);
    expect(incomePerRun(meta.get(), 'playSec')).toBeCloseTo(300, 6);
    expect(coresPerMinute(meta.get())).toBeGreaterThan(0);
  });

  it('ETA math: runsToGain at the live rate, ∞ without income, stage = clears (+ farm when short)', () => {
    const s = { ...defaultSave(), income: { runs: 5, last: {}, rate: { cores: 100, stage: 0.5, lnPower: 0 } } };
    expect(runsToGain(s, 'cores', 0)).toBe(0);
    expect(runsToGain(s, 'cores', 250)).toBe(3);
    expect(runsToGain(defaultSave(), 'cores', 10)).toBe(Infinity);
    expect(runsToStage({ ...s, campaign: { cleared: { standard: 10 }, bestTime: {} } }, 8)).toBe(0);
    // at a wall the observed stage pace (0.5/run) answers: 4 stages ≈ 8 runs …
    expect(runsToStage({ ...s, campaign: { cleared: { standard: 10 }, bestTime: {} } }, 14, 1)).toBe(8);
    // … while live Power that already meets the stage makes each remaining stage one run
    expect(runsToStage({ ...s, campaign: { cleared: { standard: 10 }, bestTime: {} } }, 14, 1e15)).toBe(4);
    expect(etaLabel(0)).toBe('ready now');
    expect(etaLabel(1)).toBe('next run');
    expect(etaLabel(14)).toBe('~14 runs');
    expect(etaLabel(Infinity)).toBe('a long road');
    expect(etaLabel(INCOME.etaCap)).toBe(`~${INCOME.etaCap} runs`);
    expect(etaLabel(INCOME.etaCap + 1)).toBe('a long road'); // no 3-digit run counts on the board
    expect(isOneMoreRun(2)).toBe(true);
    expect(isOneMoreRun(3)).toBe(false);
  });
});

describe('honest goals (docs/ONE-MORE-RUN.md §eta)', () => {
  it('ranks by ETA, not raw progress — a 90 % bar 40 runs away loses to a 20 % bar due next run', () => {
    const k = TOWER_ORDER[0];
    const s: SaveData = {
      ...defaultSave(),
      campaign: { cleared: { standard: 80 }, bestTime: {} },
      genomeRank: { celebrated: 1, peakPower: 1e12 }, // Power never the gate here
      towerShards: { ...defaultSave().towerShards, [k]: Math.floor(towerStarCost(0) * 0.2) },
      income: { runs: 20, last: {}, rate: { [`strain:${k}`]: towerStarCost(0), stage: 0.25, lnPower: 0 } },
    };
    const goals = nextGoals(s, 20);
    for (let i = 1; i < goals.length; i++) expect(goals[i - 1].etaRuns).toBeLessThanOrEqual(goals[i].etaRuns);
    const evo = goals.find((g) => g.id === `evo:tower:${k}`)!;
    expect(evo.etaRuns).toBe(1);
    expect(evo.eta).toBe('next run');
    const slot = goals.find((g) => g.kind === 'campaign-gate' && g.id.startsWith('slot:'));
    if (slot) expect(slot.etaRuns).toBeGreaterThan(2); // a stage gate at 0.25 stages/run is NOT "one more run"
  });

  it('the Molt goal rides the cell mint once the stage gate is met (never vanishes)', () => {
    const s: SaveData = {
      ...defaultSave(),
      campaign: { cleared: { standard: 80 }, bestTime: {} },
      prestige: { ...defaultSave().prestige, molts: 19, cycleShards: 4000 },
      income: { runs: 20, last: {}, rate: { cores: 700 } },
    };
    const molt = nextGoals(s, 30).find((g) => g.kind === 'prestige')!;
    expect(molt.id).toBe('prestige:20'); // one goal per Molt
    expect(molt).toBeTruthy();
    expect(molt.remaining).toMatch(/Genome Cores to mint/);
    expect(molt.progress).toBeCloseTo(4000 / 6400, 2);
    expect(molt.etaRuns).toBe(Math.ceil((6400 - 4000) / 700));
  });

  it('surfaces exactly ONE achievement-ladder goal (never a flood)', () => {
    const s: SaveData = {
      ...defaultSave(),
      campaign: { cleared: { standard: 80 }, bestTime: {} },
      totalRuns: 300, // the Profile wing (the ladder goal's destination) is revealed
      lifetimeShards: 90_000,
      stats: { ...defaultLifetimeStats(), lifetimeKills: 140_000 },
      income: { runs: 20, last: {}, rate: { cores: 700, kills: 900 } },
    };
    expect(nextGoals(s, 99).filter((g) => g.kind === 'achievement').length).toBe(1);
  });

  it('a ladder rung far out never joins the board — an early account sees no ladder goal (INCOME.ladderGoalRuns)', () => {
    const s: SaveData = {
      ...defaultSave(),
      campaign: { cleared: { standard: 2 }, bestTime: {} },
      totalRuns: 300, // the Profile wing is open, so only the distance gate can hold the ladder back
      stats: { ...defaultLifetimeStats(), lifetimeKills: 2_000 },
      income: { runs: 20, last: {}, rate: { kills: 300, bestWave: 0 } },
    };
    expect(nextGoals(s, 99).some((g) => g.id.startsWith('ladder:'))).toBe(false);
  });
});

describe('permanent Gear Codex credit (docs/EQUIPMENT.md §codex)', () => {
  it('salvaging the last copy keeps the discovery, the Collection % and the codex power', () => {
    const r = new Rng(11);
    const item = rollItem(() => r.next(), ALL_ITEMS[0], 'common', 5, 'Genetic Vault');
    seed({ equipment: { inventory: [item], loadouts: {} } });
    const before = collectionView(collectionContextOf(meta.get()));
    expect(gearDiscovered(meta.get()).has(item.defId)).toBe(true);
    expect(meta.salvageItem(item.uid)).toBe(true);
    expect(meta.get().equipment.inventory.length).toBe(0);
    expect(meta.get().equipment.discovered).toContain(item.defId); // the ledger never shrinks
    const after = collectionView(collectionContextOf(meta.get()));
    expect(after.discovered).toBe(before.discovered);
    expect(after.power).toBe(before.power);
    expect(meta.genomeSnapshot().gearRatio).toBeGreaterThan(0);
  });

  it('every path into the inventory credits the ledger (the persist chokepoint)', () => {
    meta.reset();
    const r = new Rng(3);
    const item = rollItem(() => r.next(), ALL_ITEMS[2], 'rare', 5, 'Genetic Vault');
    const s = meta.get();
    // a raw grant through import (the store's only write path) — still folded
    seed({ ...s, equipment: { inventory: [item], loadouts: {} } });
    expect(meta.get().equipment.discovered).toEqual([item.defId]);
  });
});

describe('Genome Rank reads the PEAK Power (docs/GENOME-RANK.md §peak)', () => {
  it('the snapshot takes max(peak, live) and the poll banks the live score', () => {
    seed({ genomeRank: { celebrated: 1, peakPower: 0 } });
    const live = meta.power().score;
    meta.pollGenomePromotions();
    expect(meta.get().genomeRank.peakPower).toBeCloseTo(live, 6);
    // a Molt-like trough: the stored peak is far above the live score
    seed({ genomeRank: { celebrated: 1, peakPower: live * 50 } });
    expect(meta.genomeSnapshot().powerScore).toBeCloseTo(live * 50, 6);
    const rated = genomeRating(meta.genomeSnapshot());
    meta.pollGenomePromotions();
    expect(meta.get().genomeRank.peakPower).toBeCloseTo(live * 50, 6); // never lowered
    expect(genomeRating(meta.genomeSnapshot())).toBe(rated);
  });

  it('a Molt banks the pre-Molt Power as the peak — the rating never drops through it', () => {
    meta.reset();
    seed({
      campaign: { cleared: { standard: 20 }, bestTime: {} },
      shards: 50_000,
      upgrades: { dmg: 10, rate: 10 },
      prestige: { ...defaultSave().prestige, cycleShards: 40_000 },
    });
    const ratingBefore = genomeRating(meta.genomeSnapshot());
    const powerBefore = meta.power().score;
    expect(meta.molt()).toBe(true);
    expect(meta.get().genomeRank.peakPower).toBeGreaterThanOrEqual(powerBefore - 1e-6);
    expect(genomeRating(meta.genomeSnapshot())).toBeGreaterThanOrEqual(ratingBefore);
  });
});

describe('achievement ladders (docs/PROGRESSION-SYSTEMS.md §ladders)', () => {
  it('every family is finite, strictly geometric-increasing, uniquely named and pays Cores', () => {
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    expect(ids.size).toBe(ACHIEVEMENTS.length);
    for (const f of LADDER_FAMILIES) {
      const th = ladderThresholds(f);
      expect(th.length).toBe(f.tiers);
      for (let i = 1; i < th.length; i++) expect(th[i]).toBeGreaterThan(th[i - 1]);
      const rows = ACHIEVEMENTS.filter((a) => a.ladder?.family === f.id);
      expect(rows.length).toBe(f.tiers);
      for (const r of rows) expect(r.reward ?? 0).toBeGreaterThan(0);
    }
  });

  it('a fresh save unlocks NO ladder rung; crossing a threshold unlocks exactly the rungs passed', () => {
    expect(checkAchievements({ save: defaultSave() }).some((a) => a.ladder)).toBe(false);
    const f = LADDER_FAMILIES.find((x) => x.meter === 'kills')!;
    const th = ladderThresholds(f);
    const s = { ...defaultSave(), stats: { ...defaultLifetimeStats(), lifetimeKills: th[2] } };
    const got = checkAchievements({ save: s }).filter((a) => a.ladder?.family === f.id).map((a) => a.ladder!.tier);
    expect(got).toEqual([1, 2, 3]);
    const next = ladderGoals(s).find((g) => g.family === f.id)!;
    expect(next.need).toBe(th[3] - th[2]);
  });

  it('ladders stay out of the authored totals — the Genome Rank ratio is unchanged by rungs', () => {
    const f = LADDER_FAMILIES[0];
    const a = { ...defaultSave(), achievements: [AUTHORED_ACHIEVEMENTS[0].id] };
    seed(a);
    const r1 = meta.genomeSnapshot().achievementRatio;
    seed({ ...a, achievements: [AUTHORED_ACHIEVEMENTS[0].id, `ladder_${f.id}_1`, `ladder_${f.id}_2`] });
    expect(meta.genomeSnapshot().achievementRatio).toBe(r1);
    expect(r1).toBeCloseTo(1 / AUTHORED_ACHIEVEMENTS.length, 9);
  });
});

describe('Bio-Cache income line (docs/DAILY-LOGIN.md §income)', () => {
  const DAY0 = Date.UTC(2026, 5, 10, 12, 0, 0);
  it('is minutes of the live income × the streak — and 0 before any run', () => {
    expect(loginIncomeCores(0, 1)).toBe(0);
    expect(loginIncomeCores(40, 1)).toBe(40 * LOGIN.incomeMinutes);
    expect(loginIncomeCores(40, 30)).toBe(Math.round((40 * LOGIN.incomeMinutes * streakMult(30)) / 5) * 5);
    // capped at LOGIN.incomeRunCap runs of Core pay (short early runs can't make it several runs' worth)
    expect(loginIncomeCores(40, 1, 100)).toBe(100 * LOGIN.incomeRunCap);
  });

  it('the claim pays the previewed line and freezes it for the post-claim view', () => {
    seed({ income: { runs: 10, last: {}, rate: { runCores: 2400, playSec: 1800 } } }); // 80 Cores/min, 2,400/run
    const pre = meta.loginView(DAY0);
    expect(pre.incomeCores).toBe(loginIncomeCores(80, 1, 2400));
    expect(pre.incomeCores).toBe(80 * LOGIN.incomeMinutes); // 15 min (1,200) < one run (2,400)
    const shards0 = meta.get().shards;
    const receipt = meta.claimLogin(DAY0)!;
    expect(receipt.lines.some((l) => l.label.includes(`${LOGIN.incomeMinutes} min of your income`))).toBe(true);
    expect(meta.get().login.incomeCores).toBe(pre.incomeCores);
    expect(meta.get().shards - shards0).toBeGreaterThanOrEqual(pre.incomeCores);
    // income moves after the claim — the claimed day still shows what was PAID
    seed({ ...meta.get(), income: { runs: 11, last: {}, rate: { runCores: 9000, playSec: 600 } } });
    const post = meta.loginView(DAY0);
    expect(post.claimable).toBe(false);
    expect(post.incomeCores).toBe(pre.incomeCores);
    expect(post.valueCores).toBe(pre.valueCores);
  });
});

describe('Specimen Cabinet claim-all (docs/COSMETICS.md §claim-all)', () => {
  it('binds one instance per COMMON id; rares and duplicates stay in the vault', () => {
    const owned = new Set(defaultSave().wardrobe.owned);
    const commons = wardrobeRegistry.all().filter((d) => d.rarity === 'common' && !owned.has(d.id)).slice(0, 2);
    const rare = wardrobeRegistry.all().find((d) => d.rarity !== 'common' && !owned.has(d.id))!;
    expect(commons.length).toBe(2);
    const inst = (id: string, n: number) => ({ uid: `ci_test_${id}_${n}`, item: id, at: 1000 + n, src: 'Grant' });
    const inventory = [inst(commons[0].id, 1), inst(commons[0].id, 2), inst(commons[1].id, 3), inst(rare.id, 4)];
    seed({ wardrobe: { ...defaultSave().wardrobe, inventory } });
    const res = meta.claimAllCosmetics(['common'])!;
    expect(res.ids.sort()).toEqual(commons.map((d) => d.id).sort());
    const w = meta.get().wardrobe;
    for (const d of commons) expect(w.owned).toContain(d.id);
    expect(w.owned).not.toContain(rare.id);
    expect(w.inventory.map((i) => i.item).sort()).toEqual([commons[0].id, rare.id].sort()); // the dupe + the rare remain
    expect(meta.claimAllCosmetics(['common'])!.ids).toEqual([]); // nothing left to batch
    expect(meta.get().timeline.filter((t) => t.label.startsWith('Assimilated')).length).toBe(1); // one line per batch
  });
});

describe('one-tap Genome rebuild (docs/EVOLUTION-HQ.md §rebuild)', () => {
  it('spends along Best Value and the plan preview IS the applied outcome', () => {
    seed({ campaign: { cleared: { standard: 30 }, bestTime: {} }, shards: 3000, prestige: { ...defaultSave().prestige, molts: 1, lifetimeCells: 12 } });
    const plan = genomeRebuildPlan(meta.get());
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.cores).toBeLessThanOrEqual(3000);
    expect(plan.powerAfter).toBeGreaterThan(plan.powerBefore);
    expect(meta.applyGenomeRebuild(plan.steps)).toBe(true);
    // the plan's Cores are spent (an Account-XP level-up from the per-level XP may pay some back)
    expect(meta.get().shards).toBeGreaterThanOrEqual(3000 - plan.cores);
    expect(meta.get().shards).toBeLessThan(3000);
    expect(powerBreakdown(meta.get()).score).toBeCloseTo(plan.powerAfter, 6);
    for (const r of plan.rows) expect(meta.get().upgrades[r.id]).toBe(r.to);
  });

  it('its first pick IS the Best Value strip\'s best affordable buy (same ranking, cheap scorer)', () => {
    seed({ campaign: { cleared: { standard: 30 }, bestTime: {} }, shards: 3000, prestige: { ...defaultSave().prestige, molts: 1, lifetimeCells: 12 } });
    const plan = genomeRebuildPlan(meta.get());
    const best = bestPurchase(meta.get(), 'evolution').bestAffordable!;
    expect(plan.steps[0].id).toBe(best.id);
    expect(plan.steps[0].cost).toBe(best.cost);
  });

  it('refuses a stale plan wholesale (nothing spent)', () => {
    seed({ campaign: { cleared: { standard: 30 }, bestTime: {} }, shards: 3000, prestige: { ...defaultSave().prestige, molts: 1 } });
    const plan = genomeRebuildPlan(meta.get());
    seed({ ...meta.get(), shards: 10 }); // the treasury moved under the dialog
    expect(meta.applyGenomeRebuild(plan.steps)).toBe(false);
    expect(meta.get().shards).toBe(10);
  });
});

void STAR;
void ({} as TowerKind);
