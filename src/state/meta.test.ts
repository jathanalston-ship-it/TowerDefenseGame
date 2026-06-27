import { describe, it, expect } from 'vitest';
import { meta } from './meta';
import { lootMeterSize, lootBoxRarity, masteryLevel, masteryXpForLevel, masteryDamageMult } from '../core/config';
import { defaultRunModifiers } from '../core/cards';
import type { RunResult } from '../core/game';

function result(over: Partial<RunResult>): RunResult {
  return {
    mode: 'classic', won: false, wave: 1, kills: 0, stageNumber: 0,
    rewardMultiplier: 1, objectiveDone: false, objectiveBonus: 0, score: 0,
    towersByKind: { needle: 1, mortar: 1, reactor: 1 }, apexUses: 0,
    biome: null, enemiesSeen: [], cardsSeen: [], ...over,
  };
}

describe('reward economy', () => {
  it('pays each mode in its OWN currencies toward different sinks', () => {
    meta.reset();
    const start = meta.get();

    // Stage → Shards + Components; clearing advances the path.
    const stage = meta.recordRun(result({ mode: 'stage', won: true, wave: 9, kills: 120, stageNumber: 3, rewardMultiplier: 1.2, objectiveDone: true, objectiveBonus: 0.5 }));
    expect(stage.shards).toBeGreaterThan(0);
    expect(stage.components).toBeGreaterThan(0);
    expect(stage.essence).toBe(0);
    expect(stage.catalyst).toBe(0);
    expect(meta.get().shards).toBe(start.shards + stage.shards);
    expect(meta.get().components).toBe(start.components + stage.components);
    expect(meta.get().bestStage).toBe(3);
    expect(meta.get().stagesCleared).toBe(1);

    // Endless → Essence + Catalyst (prestige) + leaderboard; no Shards.
    const endless = meta.recordRun(result({ mode: 'endless', wave: 25, kills: 300, score: 99999 }));
    expect(endless.essence).toBeGreaterThan(0);
    expect(endless.catalyst).toBe(2); // floor(25 / 10)
    expect(endless.shards).toBe(0);
    expect(meta.get().essence).toBeGreaterThan(0);
    expect(meta.get().bestEndlessScore).toBe(99999);
    expect(meta.get().lifetimeShards).toBe(start.lifetimeShards + stage.shards); // endless adds none
    meta.reset();
  });

  it('buyUpgrade spends the upgrade\'s own currency', () => {
    meta.reset();
    meta.debugAddShards(10000); // tops up shards + essence + components
    const before = meta.get();
    expect(meta.buyUpgrade('lethality')).toBe(true); // Shards
    expect(meta.get().shards).toBeLessThan(before.shards);
    expect(meta.get().essence).toBe(before.essence); // untouched

    const e0 = meta.get().essence;
    expect(meta.buyUpgrade('overclock')).toBe(true); // Essence
    expect(meta.get().essence).toBeLessThan(e0);
    meta.reset();
  });

  it('cannot buy without the right currency', () => {
    meta.reset();
    expect(meta.get().essence).toBe(0);
    expect(meta.buyUpgrade('overclock')).toBe(false); // no essence
    meta.reset();
  });

  it('Catalyst earned in Endless is spendable on the Prestige track (no dead currency)', () => {
    meta.reset();
    // Deep Endless run mints Catalyst (floor(wave/10)).
    const endless = meta.recordRun(result({ mode: 'endless', wave: 40, kills: 500, score: 50000 }));
    expect(endless.catalyst).toBe(4);
    expect(meta.get().catalyst).toBe(4);

    const before = meta.get();
    expect(meta.buyUpgrade('viral_apex')).toBe(true); // Prestige node, costs Catalyst
    expect(meta.get().catalyst).toBeLessThan(before.catalyst);
    expect(meta.get().shards).toBe(before.shards); // other currencies untouched
    meta.reset();
  });
});

describe('codex & achievements (motivation layer)', () => {
  it('folds run discoveries into the permanent codex (deduped union)', () => {
    meta.reset();
    meta.recordRun(result({ mode: 'stage', won: true, stageNumber: 1, biome: 'marsh', enemiesSeen: ['runner', 'brute'], cardsSeen: ['sharpened_needles'] }));
    let s = meta.get();
    expect(s.codex.enemies.sort()).toEqual(['brute', 'runner']);
    expect(s.codex.biomes).toEqual(['marsh']);
    expect(s.codex.cards).toEqual(['sharpened_needles']);

    // A second run unions new sightings without duplicating old ones.
    meta.recordRun(result({ mode: 'endless', wave: 5, biome: 'marsh', enemiesSeen: ['runner', 'rusher'], cardsSeen: ['sharpened_needles', 'rapid_glands'] }));
    s = meta.get();
    expect(s.codex.enemies.sort()).toEqual(['brute', 'runner', 'rusher']);
    expect(s.codex.biomes).toEqual(['marsh']); // not duplicated
    expect(s.codex.cards.sort()).toEqual(['rapid_glands', 'sharpened_needles']);
    expect(s.cardsSeen).toBe(2); // legacy count stays in sync
    meta.reset();
  });

  it('unlocks achievements + a title, reporting only the NEW ones for this run', () => {
    meta.reset();
    // First finished run → "First Assimilation"; clearing all 12 classic waves → "Extraction" (+ title).
    const r = meta.recordRun(result({ mode: 'classic', won: true, wave: 12, kills: 50 }));
    expect(r.newAchievements).toContain('First Assimilation');
    expect(r.newAchievements).toContain('Extraction');
    expect(r.newTitle).toBe('Defender');
    expect(meta.get().title).toBe('Defender');
    expect(meta.get().achievements).toContain('extraction');

    // A second, lesser run unlocks nothing new (idempotent — no repeats).
    const r2 = meta.recordRun(result({ mode: 'classic', won: false, wave: 3 }));
    expect(r2.newAchievements).toEqual([]);
    expect(r2.newTitle).toBeNull();
    meta.reset();
  });
});

describe('persistent loot meter', () => {
  it('fills, awards a box with rollover, and never loses progress', () => {
    meta.reset();
    const size = lootMeterSize(0);
    expect(meta.get().lootMeter).toBe(0);
    expect(meta.get().lootBoxes).toBe(0);

    // Partial fill — no box yet.
    expect(meta.addLootProgress(size - 10)).toBe(0);
    expect(meta.get().lootMeter).toBe(size - 10);
    expect(meta.get().lootBoxes).toBe(0);

    // Cross the threshold → one box, overflow rolls into the next meter (no loss).
    const awarded = meta.addLootProgress(30); // total 20 past the line
    expect(awarded).toBe(1);
    expect(meta.get().lootBoxes).toBe(1);
    expect(meta.get().lootBoxesLifetime).toBe(1);
    expect(meta.get().lootMeter).toBe(20); // overflow preserved
    meta.reset();
  });

  it('awards multiple boxes for a large grant', () => {
    meta.reset();
    const size = lootMeterSize(0);
    const awarded = meta.addLootProgress(size * 3 + 5);
    expect(awarded).toBe(3);
    expect(meta.get().lootBoxes).toBe(3);
    expect(meta.get().lootMeter).toBe(5);
    meta.reset();
  });

  it('persists across runs/modes — recordRun never clears the meter', () => {
    meta.reset();
    meta.addLootProgress(50);
    const before = meta.get().lootMeter;
    meta.recordRun(result({ mode: 'endless', wave: 12, kills: 80 }));
    meta.recordRun(result({ mode: 'stage', won: true, stageNumber: 2 }));
    expect(meta.get().lootMeter).toBe(before); // untouched by runs
    meta.reset();
  });
});

describe('loot boxes (rarity + opening)', () => {
  it('rarity is a deterministic, previewable cadence by earned index', () => {
    expect(lootBoxRarity(1)).toBe('common');
    expect(lootBoxRarity(5)).toBe('rare');
    expect(lootBoxRarity(10)).toBe('rare');
    expect(lootBoxRarity(25)).toBe('epic'); // epic takes precedence at multiples of 25
    expect(lootBoxRarity(50)).toBe('epic');
    expect(meta.nextLootRarity()).toBe('common'); // fresh account → box #1
  });

  it('opening a box grants a rarity-scaled cache and banks one fewer', () => {
    meta.reset();
    const size = lootMeterSize(0);
    meta.addLootProgress(size); // earn box #1 (common)
    expect(meta.get().lootBoxes).toBe(1);
    expect(meta.pendingLootRarity()).toBe('common');

    const shardsBefore = meta.get().shards;
    const reward = meta.openLootBox();
    expect(reward).not.toBeNull();
    expect(reward!.rarity).toBe('common');
    expect(reward!.shards).toBeGreaterThan(0); // common pays Shards
    expect(reward!.essence).toBe(0); // not at common
    expect(meta.get().lootBoxes).toBe(0); // box consumed
    expect(meta.get().shards).toBe(shardsBefore + reward!.shards); // currency granted
    expect(meta.openLootBox()).toBeNull(); // nothing left to open
    meta.reset();
  });

  it('opens banked boxes FIFO and a Rare box pays more than Common', () => {
    meta.reset();
    // Earn 5 boxes so box #5 is Rare; size grows by lifetime so add generously.
    for (let i = 0; i < 5; i++) meta.addLootProgress(lootMeterSize(meta.get().lootBoxesLifetime));
    expect(meta.get().lootBoxes).toBe(5);

    const opened = [] as string[];
    let rareShards = 0;
    let commonShards = 0;
    for (let i = 0; i < 5; i++) {
      const r = meta.openLootBox()!;
      opened.push(r.rarity);
      if (r.rarity === 'rare') rareShards = r.shards;
      if (r.rarity === 'common' && i === 0) commonShards = r.shards;
    }
    expect(opened).toEqual(['common', 'common', 'common', 'common', 'rare']); // #1..#5, FIFO
    expect(rareShards).toBeGreaterThan(commonShards); // rare cache is richer
    meta.reset();
  });

  it('loot boxes also pay Genome Shards (the loot → stars payoff)', () => {
    meta.reset();
    meta.addLootProgress(lootMeterSize(0));
    const before = meta.get().genomeShards;
    const reward = meta.openLootBox()!;
    expect(reward.genomeShards).toBeGreaterThan(0);
    expect(meta.get().genomeShards).toBe(before + reward.genomeShards);
    meta.reset();
  });
});

describe('tower stars (per-unit progression)', () => {
  it('buys stars with Genome Shards, increments the level, and caps at MAX', () => {
    meta.reset();
    expect(meta.starLevel('needle')).toBe(0);
    expect(meta.buyStar('needle')).toBe(false); // no shards yet

    for (let i = 0; i < 30; i++) meta.recordRun(result({ mode: 'endless', wave: 40 })); // trickle shards
    expect(meta.get().genomeShards).toBeGreaterThan(0);

    const cost = meta.nextStarCost('needle')!;
    const before = meta.get().genomeShards;
    expect(meta.buyStar('needle')).toBe(true);
    expect(meta.starLevel('needle')).toBe(1);
    expect(meta.get().genomeShards).toBe(before - cost);
    meta.reset();
  });

  it('debugGrantGenome funds Genome Shards (debug grant for the Star economy)', () => {
    meta.reset();
    expect(meta.get().genomeShards).toBe(0);
    meta.debugGrantGenome(500);
    expect(meta.get().genomeShards).toBe(500);
    expect(meta.buyStar('needle')).toBe(true); // granted shards are spendable on stars
    meta.reset();
  });

  it('runFold reflects owned stars (per-kind stats + the unlock applier)', () => {
    meta.reset();
    for (let i = 0; i < 40; i++) meta.recordRun(result({ mode: 'endless', wave: 50 }));
    expect(meta.buyStar('needle')).toBe(true); // ★1 (+damage)
    expect(meta.buyStar('needle')).toBe(true); // ★2 (+fire rate)
    expect(meta.buyStar('needle')).toBe(true); // ★3 (Ricochet → needleBounce)
    const data = meta.runFold();
    expect(data.stat.needle.damageMult).toBeGreaterThan(1); // stat steps applied
    const mods = defaultRunModifiers();
    data.apply(mods);
    expect(mods.needleBounce).toBe(1); // ★3 mechanic unlock set the run hook
    meta.reset();
  });
});

describe('hero gear', () => {
  it('drops gear at every rarity, with the right slot + affix count', () => {
    meta.reset();
    for (const rarity of ['common', 'rare', 'epic'] as const) {
      const item = meta.debugGrantGear(rarity)!;
      expect(item).not.toBeNull();
      expect(['weapon', 'armor', 'relic']).toContain(item.slot);
      expect(item.rarity).toBe(rarity);
      // Affix count tracks rarity (common 1 / rare 2 / epic 3); never repeats an affix.
      const expectCount = { common: 1, rare: 2, epic: 3 }[rarity];
      expect(item.affixes.length).toBe(expectCount);
      expect(new Set(item.affixes.map((a) => a.id)).size).toBe(item.affixes.length);
    }
    expect(meta.get().gear.length).toBe(3);
    meta.reset();
  });

  it('equip / unequip routes an item into its own slot', () => {
    meta.reset();
    const item = meta.debugGrantGear('epic')!;
    expect(meta.equipGear(item.id)).toBe(true);
    expect(meta.get().equipped[item.slot]).toBe(item.id);
    expect(meta.equipGear(item.id)).toBe(false); // already worn — no-op
    expect(meta.unequipSlot(item.slot)).toBe(true);
    expect(meta.get().equipped[item.slot]).toBeNull();
    expect(meta.unequipSlot(item.slot)).toBe(false); // already empty
    meta.reset();
  });

  it('equipped gear folds its affixes into the run via runFold', () => {
    meta.reset();
    // Grant until we get a weapon (its affixes all touch hero stats we can assert on).
    let weapon = meta.debugGrantGear('epic');
    for (let i = 0; i < 50 && weapon && weapon.slot !== 'weapon'; i++) weapon = meta.debugGrantGear('epic');
    while (weapon && weapon.slot !== 'weapon') weapon = meta.debugGrantGear('epic');
    expect(weapon!.slot).toBe('weapon');
    meta.equipGear(weapon!.id);

    const base = defaultRunModifiers();
    const folded = defaultRunModifiers();
    meta.runFold().apply(folded);
    // An epic weapon carries 3 affixes from {damage, attack speed, cooldown} — all
    // strictly improve their hooks, so at least one hero stat must differ from baseline.
    const changed =
      folded.heroDamageMult !== base.heroDamageMult ||
      folded.heroAttackRateMult !== base.heroAttackRateMult ||
      folded.heroCooldownMult !== base.heroCooldownMult;
    expect(changed).toBe(true);
    meta.reset();
  });

  it('dismantle refunds Genome Shards and unequips the item', () => {
    meta.reset();
    const item = meta.debugGrantGear('rare')!;
    meta.equipGear(item.id);
    const before = meta.get().genomeShards;
    const refund = meta.dismantleGear(item.id);
    expect(refund).toBe(meta.dismantleValue(item));
    expect(refund).toBeGreaterThan(0);
    expect(meta.get().genomeShards).toBe(before + refund);
    expect(meta.get().gear.find((g) => g.id === item.id)).toBeUndefined();
    expect(meta.get().equipped[item.slot]).toBeNull(); // worn item was cleared
    expect(meta.dismantleGear(item.id)).toBe(0); // gone — no double refund
    meta.reset();
  });

  it('a box can drop gear; opening never voids it', () => {
    meta.reset();
    // Bank a pile of boxes and open them; with rare/epic drop chances, gear must appear.
    meta.addLootProgress(1_000_000);
    let dropped = 0;
    let reward = meta.openLootBox();
    while (reward) {
      if (reward.gear) {
        dropped++;
        // Anything dropped is in the inventory (never silently lost).
        expect(meta.get().gear.some((g) => g.id === reward!.gear!.id)).toBe(true);
      }
      reward = meta.openLootBox();
    }
    expect(dropped).toBeGreaterThan(0);
    meta.reset();
  });
});

describe('infinite mastery', () => {
  it('levels are uncapped and monotonic in XP', () => {
    expect(masteryLevel(0)).toBe(0);
    const a = masteryLevel(10_000);
    const b = masteryLevel(1_000_000);
    const c = masteryLevel(1_000_000_000);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b); // no ceiling — always a higher level
    for (const L of [1, 5, 10, 50, 200]) expect(masteryLevel(masteryXpForLevel(L))).toBe(L); // round-trips
  });

  it('the damage curve is diminishing (logarithmic, never runs away)', () => {
    expect(masteryDamageMult(1000)).toBeGreaterThan(masteryDamageMult(100));
    expect(masteryDamageMult(100)).toBeGreaterThan(masteryDamageMult(10)); // always growing
    // The MARGINAL gain per level strictly shrinks (concave log) — diminishing returns.
    const step = (l: number): number => masteryDamageMult(l + 1) - masteryDamageMult(l);
    expect(step(10)).toBeGreaterThan(step(100));
    expect(step(100)).toBeGreaterThan(step(1000));
    expect(masteryDamageMult(1_000_000)).toBeLessThan(1.6); // bounded in practice
  });

  it('recordRun awards mastery XP to fielded towers + the hero', () => {
    meta.reset();
    meta.recordRun(result({ mode: 'classic', wave: 10, kills: 100, towersByKind: { needle: 3, mortar: 0, reactor: 1 }, apexUses: 4 }));
    const s = meta.get();
    expect(s.mastery.needle).toBeGreaterThan(0); // fielded → XP
    expect(s.mastery.reactor).toBeGreaterThan(0);
    expect(s.mastery.mortar ?? 0).toBe(0); // not fielded → none
    expect(s.mastery.hero).toBeGreaterThan(0); // hero always earns
    expect(s.mastery.needle).toBeGreaterThan(s.mastery.reactor); // leaning in (3 vs 1) earns more
    meta.reset();
  });

  it('mastery folds into the run via runFold (towers + hero)', () => {
    meta.reset();
    meta.debugGrantMastery('needle', 500_000); // many levels
    meta.debugGrantMastery('hero', 500_000);
    const fold = meta.runFold();
    expect(fold.stat.needle.damageMult).toBeGreaterThan(1); // tower mastery in the per-kind stat
    expect(fold.stat.mortar.damageMult).toBe(1); // an untouched unit is unchanged
    const mods = defaultRunModifiers();
    fold.apply(mods);
    expect(mods.heroDamageMult).toBeGreaterThan(1); // hero mastery in the run mods
    meta.reset();
  });

  it('a milestone (every 10 levels) adds a rate step, but the rate is capped', () => {
    meta.reset();
    meta.debugGrantMastery('needle', masteryXpForLevel(12)); // past level 10 → one milestone
    expect(meta.masteryProgress('needle').level).toBeGreaterThanOrEqual(10);
    const r1 = meta.runFold().stat.needle.fireRateMult;
    expect(r1).toBeGreaterThan(1);

    // A near-infinite level must NOT keep growing the rate (only the log damage does).
    meta.reset();
    meta.debugGrantMastery('needle', 1_000_000_000);
    const fold = meta.runFold().stat.needle;
    expect(fold.fireRateMult).toBeLessThanOrEqual(1.21); // capped (~+20%), never runs away
    expect(fold.damageMult).toBeGreaterThan(r1); // damage still scales with the huge level
    meta.reset();
  });
});
