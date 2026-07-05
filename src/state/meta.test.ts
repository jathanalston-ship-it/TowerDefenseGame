import { describe, it, expect } from 'vitest';
import { defaultLifetimeStats, defaultSave, serializeExport } from '../save/saveStore';
import { meta, metaModifiers, upgradeCost, nextUpgradeCost, genomeRunEffects } from './meta';
import type { RunResult } from './meta';
import { CAMPAIGN_REWARDS, HERO_ORDER, META_UPGRADES, TOWER_ORDER } from '../core/config';
import { stageWaveCount } from '../core/campaign';
import { costOf, isLootRarity } from '../core/loot';
import type { RunStats } from '../core/types';
import { defaultPrestige } from '../core/prestige';
import { gameEvents } from '../core/events';

/** Minimal finished-run payload (zeroed mastery/stats) — enough to drive finishRun's loot
 * banking without standing up a full Game. */
function runResult(wave: number, kills: number): RunResult {
  const zero = { kills: 0, damage: 0, activeTime: 0 };
  const mastery = TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['mastery'];
  const heroMastery = HERO_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['heroMastery'];
  const stats: RunStats = {
    kills,
    wave,
    won: true,
    biomassEarned: 0,
    damageDealt: 0,
    killsByEnemy: defaultLifetimeStats().killsByEnemy,
    towerBuilds: TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: 0 }), {}) as RunStats['towerBuilds'],
    cardIds: [],
    heroId: HERO_ORDER[0],
  };
  return { wave, kills, won: true, mastery, heroMastery, stats };
}

describe('metaModifiers (data-driven upgrades)', () => {
  it('is identity with no upgrades', () => {
    expect(metaModifiers(defaultSave())).toEqual({
      towerDamageMult: 1,
      biomassMult: 1,
      heroDamageMult: 1,
      integrityBonus: 0,
      bonusSlots: 0,
    });
  });

  it('applies an upgrade per its declared data', () => {
    const m = metaModifiers({ ...defaultSave(), upgrades: { lethality: 3 } });
    expect(m.towerDamageMult).toBeCloseTo(1.24, 10); // 1 + 0.08*3
    expect(m.biomassMult).toBe(1);
  });

  it('folds every upgrade generically from config (no hardcoded ids)', () => {
    const upgrades: Record<string, number> = {};
    for (const u of META_UPGRADES) upgrades[u.id] = 1;
    const m = metaModifiers({ ...defaultSave(), upgrades }) as unknown as Record<string, number>;
    // Derive each stat's identity (base) from the no-upgrade modifiers, so the check stays
    // generic across multiplier stats (base 1) and flat stats like integrityBonus/bonusSlots (0).
    const identity = metaModifiers(defaultSave()) as unknown as Record<string, number>;
    // A stat may be shared by several upgrades (e.g. Lethal Spores + Runaway Lethality), so the
    // fold contract is the SUM of every declared per-level contribution (level 1 ⇒ 1 unit each,
    // linear and √level alike).
    const expected: Record<string, number> = {};
    for (const u of META_UPGRADES) {
      if (!u.effect) continue; // `run`-seam upgrades fold via genomeRunEffects, not MetaModifiers
      expected[u.effect.stat] = (expected[u.effect.stat] ?? 0) + u.effect.perLevel;
    }
    for (const [stat, add] of Object.entries(expected)) {
      expect(m[stat]).toBeCloseTo(identity[stat] + add, 10);
    }
  });

  it('genome run-effect upgrades: empty for a fresh save; scaled CardEffects when owned', () => {
    expect(genomeRunEffects(defaultSave())).toEqual([]); // golden-safe
    const save = { ...defaultSave(), upgrades: { enhanced_genetics: 3, expanded_biomass: 2, lethality: 5 } };
    const eff = genomeRunEffects(save);
    // run-seam upgrades emit scaled effects …
    expect(eff).toContainEqual({ op: 'mul', field: 'heroMaxHpMult', value: 1 + 0.07 * 3 });
    expect(eff).toContainEqual({ op: 'add', field: 'startBiomassBonus', value: 15 * 2 });
    // … but the legacy MetaModifiers-seam upgrade (lethality) does NOT.
    expect(eff.some((e) => 'field' in e && e.field === 'towerDamageMult')).toBe(false);
  });

  it('ascendant deeper levers fold into metaModifiers (Potency damage, Vitality integrity)', () => {
    const save = { ...defaultSave(), prestige: { ...defaultPrestige(), nodes: { potency: 4, vitality: 2 } } };
    const m = metaModifiers(save);
    const base = metaModifiers(defaultSave());
    expect(m.towerDamageMult).toBeCloseTo(base.towerDamageMult * (1 + 0.05 * 4), 10);
    expect(m.heroDamageMult).toBeCloseTo(base.heroDamageMult * (1 + 0.05 * 4), 10);
    expect(m.integrityBonus).toBeGreaterThan(base.integrityBonus); // Vitality raised permanent Integrity
  });

  it('upgradeCost grows geometrically', () => {
    const def = META_UPGRADES[0];
    expect(upgradeCost(def, 0)).toBe(def.baseCost);
    expect(upgradeCost(def, 2)).toBe(Math.round(def.baseCost * def.costMult ** 2));
  });

  it('folds the prestige P-bucket into tower + hero damage (×1 at zero cells)', () => {
    expect(metaModifiers(defaultSave()).towerDamageMult).toBe(1); // fresh = identity (golden-safe)
    const ascended = metaModifiers({ ...defaultSave(), prestige: { ...defaultPrestige(), lifetimeCells: 100 } });
    expect(ascended.towerDamageMult).toBeCloseTo(2.0, 10); // ×(1 + 0.1·√100)
    expect(ascended.heroDamageMult).toBeCloseTo(2.0, 10);
  });

  it('Runaway (uncapped) upgrades fold at √level through BOTH seams and never hit a cap', () => {
    const eff = META_UPGRADES.find((u) => u.infinite === true && u.effect?.stat === 'towerDamageMult')!;
    const m = metaModifiers({ ...defaultSave(), upgrades: { [eff.id]: 16 } });
    expect(m.towerDamageMult).toBeCloseTo(1 + eff.effect!.perLevel * 4, 10); // √16 units
    const run = META_UPGRADES.find((u) => u.infinite === true && u.run?.op === 'add')!;
    const effects = genomeRunEffects({ ...defaultSave(), upgrades: { [run.id]: 25 } });
    expect(effects).toContainEqual({ op: 'add', field: run.run!.field, value: run.run!.perLevel * 5 }); // √25
    // no cap gate: deep in the sink there is ALWAYS a next cost, and it still moves Power
    expect(nextUpgradeCost({ ...defaultSave(), upgrades: { [eff.id]: 500 } }, eff)).not.toBeNull();
    meta.reset();
    const p100 = meta.previewPower((s) => ({ ...s, upgrades: { ...s.upgrades, [eff.id]: 100 } })).score;
    const p101 = meta.previewPower((s) => ({ ...s, upgrades: { ...s.upgrades, [eff.id]: 101 } })).score;
    expect(p101).toBeGreaterThan(p100); // diminishing, never zero — the "slight but real" contract
  });
});

describe('prestige MOLT (the ascension loop)', () => {
  it('mints cells, raises the multiplier, and resets the engine — keeping trophies', () => {
    // Seed a save mid-cycle (banked shards + core upgrades + a maxed tower star to keep). Campaign
    // Stage 10 is cleared so the first Molt's campaign gate (PROGRESSION.md) is satisfied.
    const seeded = {
      ...defaultSave(),
      shards: 500,
      upgrades: { lethality: 3 },
      towerStars: { ...defaultSave().towerStars, needle: 5 },
      campaign: { cleared: { standard: 10 }, bestTime: {} },
      prestige: { ...defaultPrestige(), cycleShards: 10000 },
    };
    const imported = meta.importText(serializeExport(seeded));
    expect(imported.ok).toBe(true);

    const before = meta.prestigeView();
    expect(before.canMolt).toBe(true);
    expect(before.gain).toBe(15); // 1.5·√(10000/100)

    expect(meta.molt()).toBe(true);

    const after = meta.prestigeView();
    expect(after.lifetimeCells).toBe(15);
    expect(after.cells).toBe(15);
    expect(after.molts).toBe(1);
    expect(after.cycleShards).toBe(0); // cycle reset
    expect(after.mult).toBeCloseTo(1 + 0.1 * Math.sqrt(15), 10);

    const save = meta.get();
    expect(save.shards).toBe(0); // engine reset …
    expect(save.upgrades).toEqual({}); // …
    expect(save.towerStars.needle).toBe(5); // … but the star trophy is kept

    expect(meta.molt()).toBe(false); // nothing left to mint this cycle
  });

  it('gates the first Molt behind Campaign Stage 10 — mint alone is not enough', () => {
    // Mint is ready (cycleShards), but NO campaign cleared → Prestige is locked.
    meta.importText(serializeExport({ ...defaultSave(), prestige: { ...defaultPrestige(), cycleShards: 10000 } }));
    let v = meta.prestigeView();
    expect(v.shardsReady).toBe(true); // the cores would mint
    expect(v.campaignMet).toBe(false); // but the campaign gate isn't met
    expect(v.canMolt).toBe(false);
    expect(v.campaignReq).toBe(10);
    expect(meta.molt()).toBe(false); // refused

    // Clear Campaign Stage 10 → the gate opens and the Molt succeeds.
    meta.importText(serializeExport({ ...defaultSave(), campaign: { cleared: { standard: 10 }, bestTime: {} }, prestige: { ...defaultPrestige(), cycleShards: 10000 } }));
    v = meta.prestigeView();
    expect(v.campaignMet).toBe(true);
    expect(v.canMolt).toBe(true);
    expect(meta.molt()).toBe(true);
    // The NEXT Molt now requires MORE campaign depth than the first (compounding gate).
    expect(meta.prestigeView().campaignReq).toBeGreaterThan(10);
  });
});

describe('ascendant tree (spending cells)', () => {
  it('buys nodes, folds their bonuses, and keeps them across a Molt', () => {
    const seeded = { ...defaultSave(), campaign: { cleared: { standard: 10 }, bestTime: {} }, prestige: { ...defaultPrestige(), cells: 20, cycleShards: 10000, nodes: {} } };
    expect(meta.importText(serializeExport(seeded)).ok).toBe(true);

    expect(meta.buyAscendantNode('greed')).toBe(true);
    expect(meta.ascendantNodes().nodes.find((n) => n.id === 'greed')!.level).toBe(1);
    expect(meta.ascendantNodes().cells).toBeLessThan(20); // cells were spent

    expect(meta.buyAscendantNode('metabolism')).toBe(true);
    expect(metaModifiers(meta.get()).biomassMult).toBeCloseTo(1.1, 10); // node folds into the run

    const before = meta.ascendantNodes();
    expect(meta.molt()).toBe(true);
    const after = meta.ascendantNodes();
    expect(after.nodes.find((n) => n.id === 'greed')!.level).toBe(1); // tree persists across Molt
    expect(after.cells).toBeGreaterThan(before.cells); // … and the Molt minted more cells
  });

  it('Ascendant Resonance compounds the Molt yield', () => {
    meta.importText(serializeExport({ ...defaultSave(), prestige: { ...defaultPrestige(), cycleShards: 10000 } }));
    const plain = meta.prestigeView().gain;
    meta.importText(serializeExport({ ...defaultSave(), prestige: { ...defaultPrestige(), cycleShards: 10000, nodes: { resonance: 5 } } }));
    expect(meta.prestigeView().gain).toBeGreaterThan(plain);
  });

  it('rejects an unaffordable or unknown node', () => {
    meta.importText(serializeExport({ ...defaultSave(), prestige: { ...defaultPrestige(), cells: 0 } }));
    expect(meta.buyAscendantNode('greed')).toBe(false); // no cells
    expect(meta.buyAscendantNode('nope')).toBe(false); // unknown id
  });
});

describe('power score (account-power index)', () => {
  it('is ×1.0 on a fresh account and rises with permanent buckets', () => {
    expect(meta.importText(serializeExport(defaultSave())).ok).toBe(true);
    expect(meta.powerScore().score).toBeCloseTo(1.0, 10); // fresh = baseline

    const ascended = { ...defaultSave(), prestige: { ...defaultPrestige(), lifetimeCells: 100 } };
    expect(meta.importText(serializeExport(ascended)).ok).toBe(true);
    expect(meta.powerScore().meta).toBeCloseTo(2.0, 6); // prestige P bucket folds through metaModifiers
    expect(meta.powerScore().score).toBeGreaterThan(1.9);
  });
});

describe('loot queue integration (the finishRun banking seam)', () => {
  it('banking loot points stockpiles containers; cracking them grants shards, queue stays valid', () => {
    meta.reset(); // known clean state (a fresh, pre-determined queue)
    const before = meta.get();
    const towerBefore = TOWER_ORDER.reduce((s, k) => s + before.towerShards[k], 0);
    const heroBefore = Object.values(before.heroShards).reduce((a, b) => a + b, 0);

    const out = meta.debugAddLootPoints(5000); // ≫ any front box cost → banks ≥ 1 container
    expect(out.banked.length).toBeGreaterThan(0);
    expect(meta.pendingContainers().length).toBe(out.banked.length); // banked UNOPENED — no shards yet

    // Cracking the containers is what grants the shards.
    while (meta.openContainer()) { /* open them all */ }
    const after = meta.get();
    const towerAfter = TOWER_ORDER.reduce((s, k) => s + after.towerShards[k], 0);
    const heroAfter = Object.values(after.heroShards).reduce((a, b) => a + b, 0);
    expect(towerAfter - towerBefore + (heroAfter - heroBefore)).toBeGreaterThan(0);
    // the queue stays full + valid after awarding (next box always pre-determined)
    expect(after.lootQueue.queue.length).toBeGreaterThanOrEqual(2);
    expect(after.lootQueue.queue.every(isLootRarity)).toBe(true);
  });
});

/** Total per-tower + per-hero star Shards banked in a save (what cracking a container grants). */
function totalShards(save: ReturnType<typeof meta.get>): number {
  const t = TOWER_ORDER.reduce((s, k) => s + (save.towerShards[k] ?? 0), 0);
  const h = Object.values(save.heroShards).reduce((s, n) => s + n, 0);
  return t + h;
}

describe('deferred loot banking (containers bank unopened; cracked in the Vault)', () => {
  it('banks loot LIVE mid-run into the pending stockpile (unopened) and conserves every point', () => {
    meta.reset(); // fresh queue, progress 0, no prestige → lootGainMult = 1 (integer points)

    // Drive the run forward in steps the way the HUD loop does — each sync banks only the delta.
    let liveBanked = 0;
    liveBanked += meta.syncRunLoot(10, 200).length; // 10·14 + 200 = 340 pts
    liveBanked += meta.syncRunLoot(20, 500).length; // 20·14 + 500 = 780 pts (delta 440)
    expect(liveBanked).toBeGreaterThan(0); // containers actually completed mid-run …
    expect(meta.pendingContainers().length).toBe(liveBanked); // … and banked UNOPENED into the Vault

    const out = meta.finishRun(runResult(30, 1000)); // 30·14 + 1000 = 1420 pts total
    const fullPoints = 30 * 14 + 1000;

    // Every container banked this run (live + final) carried into the stockpile exactly once …
    expect(out.loot.banked.length).toBeGreaterThanOrEqual(liveBanked);
    expect(meta.pendingContainers().length).toBe(out.loot.banked.length);
    // … and the loot points are conserved: container costs + leftover progress == the full earn.
    const spent = out.loot.banked.reduce((s, c) => s + (c.kind === 'loot' ? costOf(c.rarity) : 0), 0);
    expect(spent + out.loot.queue.progress).toBe(fullPoints);
    expect(out.loot.queue.queue.every(isLootRarity)).toBe(true); // queue still valid afterward
  });

  it('emits lootContainerEarned once per container completed on the live meter (drives the fill toast)', () => {
    meta.reset();
    const earned: string[] = [];
    const off = gameEvents.on('lootContainerEarned', ({ rarity }) => earned.push(rarity));
    const awarded = [...meta.syncRunLoot(10, 200), ...meta.syncRunLoot(20, 500)];
    off();
    expect(earned.length).toBeGreaterThan(0); // containers completed → toast events fired
    expect(earned).toEqual(awarded); // exactly one event per awarded container, in order
    meta.finishRun(runResult(30, 1000)); // settle the live-bank cycle so module state is clean for the next test
  });

  it('a run that never syncs still banks the full amount at finishRun (unopened)', () => {
    meta.reset();
    const out = meta.finishRun(runResult(12, 300)); // 12·14 + 300 = 468 pts
    const spent = out.loot.banked.reduce((s, c) => s + (c.kind === 'loot' ? costOf(c.rarity) : 0), 0);
    expect(spent + out.loot.queue.progress).toBe(12 * 14 + 300);
    expect(meta.pendingContainers().length).toBe(out.loot.banked.length);
  });

  it('re-arms across runs: a new run banks its own full amount instead of under-counting', () => {
    meta.reset();
    meta.syncRunLoot(40, 2000); // a big first run banks a lot live …
    meta.finishRun(runResult(40, 2000)); // … and settles, resetting the live cycle
    const startProgress = meta.get().lootQueue.progress; // the queue carries over (never resets)

    meta.syncRunLoot(5, 50); // 5·14 + 50 = 120 pts
    const out = meta.finishRun(runResult(8, 100)); // 8·14 + 100 = 212 pts THIS run
    const spent = out.loot.banked.reduce((s, c) => s + (c.kind === 'loot' ? costOf(c.rarity) : 0), 0);
    expect(spent + out.loot.queue.progress).toBe(startProgress + 8 * 14 + 100);
  });

  it('cracking a pending container applies its reward and shrinks the stockpile', () => {
    meta.reset();
    meta.debugAddLootPoints(5000); // bank several containers unopened
    const before = meta.pendingContainers().length;
    expect(before).toBeGreaterThan(0);

    const shardsBefore = totalShards(meta.get());
    const award = meta.openContainer();
    expect(award).not.toBeNull();
    expect(meta.pendingContainers().length).toBe(before - 1); // exactly one cracked
    expect(totalShards(meta.get())).toBeGreaterThanOrEqual(shardsBefore); // its reward folded in

    while (meta.openContainer()) { /* crack the rest */ }
    expect(meta.pendingContainers().length).toBe(0);
    expect(meta.openContainer()).toBeNull(); // empty stockpile → nothing to open
  });

  it('the run-end cache banks unopened too — finishRun grants no cache rewards until it is cracked', () => {
    meta.reset();
    const reward = (s: ReturnType<typeof meta.get>): number =>
      totalShards(s) + s.mats.mutagen + s.mats.scrap + s.mats.catalyst + s.equipment.inventory.length;
    const before = reward(meta.get());

    const out = meta.finishRun(runResult(12, 300));
    // Exactly one run cache is banked (alongside any loot boxes), and it is NOT opened at run end.
    expect(out.loot.banked.filter((c) => c.kind === 'cache').length).toBe(1);
    expect(meta.pendingContainers().some((c) => c.kind === 'cache')).toBe(true);
    expect(reward(meta.get())).toBe(before); // no shards/materials/gear granted yet

    // Cracking everything (loot boxes + the cache) is what finally grants the rewards.
    while (meta.openContainer()) { /* open them all */ }
    expect(reward(meta.get())).toBeGreaterThan(before);
    expect(meta.pendingContainers().length).toBe(0);
  });
});

describe('run-end achievements (surfaced inline on Results, not toasted)', () => {
  it('finishRun returns the milestones unlocked this run as full defs', () => {
    meta.reset();
    const out = meta.finishRun(runResult(12, 300)); // a fresh first extraction (won, wave 12, 300 kills)
    const ids = out.achievements.map((a) => a.id);
    // One winning first run trips several milestones at once — Results lists them inline.
    expect(ids).toEqual(expect.arrayContaining(['first_run', 'extract', 'wave5', 'centurion']));
    // Full defs (name/desc) so Results renders without a second lookup, and the persisted save agrees.
    for (const a of out.achievements) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.desc.length).toBeGreaterThan(0);
      expect(meta.get().achievements).toContain(a.id);
    }
  });

  it('does not re-surface already-unlocked milestones on a later run', () => {
    meta.reset();
    meta.finishRun(runResult(12, 300)); // unlocks the first-extraction milestones
    const again = meta.finishRun(runResult(6, 50)).achievements.map((a) => a.id);
    expect(again).not.toContain('first_run'); // already earned → not reported again
    expect(again).not.toContain('extract');
  });
});

describe('failed frontier attempt consolation (BALANCE_REPORT push-futility amendment)', () => {
  const cleared5 = () => ({ ...defaultSave(), campaign: { cleared: { standard: 5 }, bestTime: {} } });

  it('pays partial field data on a lost FRONTIER attempt, scaled by depth survived', () => {
    // Two identical lost campaign runs; only the frontier flag differs ⇒ the delta IS the bonus.
    meta.importText(serializeExport(cleared5()));
    const below = meta.finishRun({ ...runResult(4, 40), campaignStage: 3, won: false, difficulty: 'standard' });
    meta.importText(serializeExport(cleared5()));
    const frontier = meta.finishRun({ ...runResult(4, 40), campaignStage: 6, won: false, difficulty: 'standard' });
    const expected = Math.round(
      CAMPAIGN_REWARDS.attemptFrac *
        (CAMPAIGN_REWARDS.firstClearCore + CAMPAIGN_REWARDS.firstClearCorePerStage * 6) *
        Math.min(1, 4 / stageWaveCount(6)),
    );
    expect(expected).toBeGreaterThan(0);
    expect(frontier.reward.shardsEarned - below.reward.shardsEarned).toBe(expected);
  });

  it('never pays on a WON run (the full first-clear supersedes it)', () => {
    meta.importText(serializeExport(cleared5()));
    const won = meta.finishRun({ ...runResult(7, 80), campaignStage: 6, won: true, difficulty: 'standard' });
    // A won frontier run pays the FULL first-clear (≥ base 25 + 4×6), not the fraction.
    expect(won.reward.shardsEarned).toBeGreaterThanOrEqual(CAMPAIGN_REWARDS.firstClearCore + CAMPAIGN_REWARDS.firstClearCorePerStage * 6);
  });
});

describe('tower synthesis (docs/TOWERS.md §expansion unlock gate)', () => {
  it('claims a dormant tower with its own shards; stars/favorite gates open with it', () => {
    meta.reset();
    expect(meta.isTowerUnlocked('maw')).toBe(false);
    expect(meta.unlockedTowers()).not.toContain('maw');
    // gates while dormant: no stars, no conveyor favorite, no claim without shards
    expect(meta.buyStar('maw')).toBe(false);
    meta.setFavoriteTower('maw');
    expect(meta.get().favoriteTower).toBe('needle');
    expect(meta.unlockTower('maw')).toBe(false); // 0 / 80 banked
    // bank the synthesis cost (importText = the test-side save injector) and claim it
    const banked = { ...meta.get(), towerShards: { ...meta.get().towerShards, maw: 80 } };
    meta.importText(serializeExport(banked));
    expect(meta.unlockTower('maw')).toBe(true);
    expect(meta.isTowerUnlocked('maw')).toBe(true);
    expect(meta.get().towerShards.maw).toBe(0); // the claim SPENT the shards
    expect(meta.unlockTower('maw')).toBe(false); // idempotent
    // everything opens: roster, favorite, stars (with fresh shards)
    expect(meta.unlockedTowers()).toContain('maw');
    meta.setFavoriteTower('maw');
    expect(meta.get().favoriteTower).toBe('maw');
    const starred = { ...meta.get(), towerShards: { ...meta.get().towerShards, maw: 10 } };
    meta.importText(serializeExport(starred));
    expect(meta.buyStar('maw')).toBe(true);
    meta.reset(); // leave a clean store for the rest of the suite
  });
});
