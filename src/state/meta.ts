// Permanent (meta) progression: shards, capped upgrades, and run records.
// Persisted through SaveStore; exposed to React as a reactive store. Also fronts
// the save-management surface (export/import/backup) and debug seeding.

import { createStore } from './store';
import {
  SaveStore,
  defaultSave,
  parseImport,
  serializeExport,
} from '../save/saveStore';
import type { BackupMeta, ImportResult, SaveData } from '../save/saveStore';
import { downloadText, readTextFile } from '../save/saveFile';
import { CHESTS, ECON, HERO_ORDER, MASTERY, META_UPGRADES, RUN_CHEST, STAR, TOWER_ORDER, chestForWave } from '../core/config';
import type { UpgradeDef } from '../core/config';
import type {
  HeroKind,
  HeroMasteryCounts,
  HeroMods,
  HeroProgress,
  MasteryCounts,
  MetaModifiers,
  RunStats,
  TowerKind,
  TowerProgress,
} from '../core/types';
import { rollChest, rollLoot } from './lootbox';
import type { ChestResult, PendingContainer } from './lootbox';
import { LOOT_EARN, rarityRegistry } from '../core/loot';
import { addProgress } from '../core/lootQueue';
import type { LootQueueState } from '../core/lootQueue';
import { resolveStarKit } from '../core/stars';
import { masteryPerksUpTo, masteryRewardsBetween } from '../core/mastery';
import { PRESTIGE, canMolt, cellsForCycle, prestigeMult } from '../core/prestige';
import { ASCENDANT_NODES, ascendantBonuses, ascendantCost, nextAscendantCost } from '../core/ascendant';
import { accumulateStats } from './stats';
import { achievementById, checkAchievements, rewardFor } from './achievements';
import type { AchievementDef, RunSummary } from './achievements';
import { RARITY_ORDER, loadoutEffects, rerollAffixes, rollItemDrop, transmute } from '../core/equipment';
import type { EquipSlot, OwnedItem } from '../core/equipment';
import { gameEvents } from '../core/events';
import type { CardEffect } from '../core/cards';
import { collectionView, unlockedRewards, collectionBonusEffects } from '../core/collection';
import type { CollectionContext, CollectionReward, CollectionView } from '../core/collection';
import { bossDef } from '../core/boss';

/** Build the collection codex context from a save (read-only derivation). */
export function collectionContextOf(save: SaveData): CollectionContext {
  return {
    stats: save.stats,
    ownedDefIds: new Set(save.equipment.inventory.map((i) => i.defId)),
    bestWave: save.bestWave,
    bossesSlain: new Set(save.bossesSlain),
  };
}

// Record each framework-boss kill into the lifetime collection (the Bestiary's boss codex),
// keyed by CHASSIS archetype — authored ids resolve via bossDef, procedural ids are
// `proc_<chassis>_<tl>`. Idempotent. Subscribing here also activates the (otherwise-gated)
// bossKilled emit in the sim, but only in the app — the golden/sim tests never import meta.
gameEvents.on('bossKilled', (e) => {
  const chassis = bossDef(e.defId)?.chassis ?? e.defId.split('_')[1] ?? e.defId;
  const save = store.get();
  if (save.bossesSlain.includes(chassis)) return;
  persist({ ...save, bossesSlain: [...save.bossesSlain, chassis] });
});

const saveStore = new SaveStore();
const store = createStore<SaveData>(saveStore.load());

function persist(next: SaveData): void {
  store.set(next);
  saveStore.save(next);
}

// Loot banked LIVE during the in-progress run (see meta.syncRunLoot). The HUD drives this as
// the run advances, so the meta queue rolls real boxes in real time — exact even for deep
// endless runs, not a run-end-only estimate. Reconciled at run end: finishRun banks only the
// REMAINDER and reveals every box opened this run, then resets the cycle. A snapshot reset (a
// new run starting back near 0) also re-arms it defensively.
let runLootBanked = 0; // loot points already banked this run via syncRunLoot
let runContainersBanked: PendingContainer[] = []; // loot-queue containers completed live this run (pending, unopened)

/**
 * Permanent multipliers derived from upgrade levels (folded into a run at start).
 * Data-driven: each upgrade declares its target stat + per-level value (config),
 * so adding an upgrade needs no change here. Multiplier stats base at 1, flat at 0.
 */
export function metaModifiers(save: SaveData): MetaModifiers {
  const m: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
  for (const u of META_UPGRADES) {
    const level = save.upgrades[u.id] ?? 0;
    if (level > 0) m[u.effect.stat] += u.effect.perLevel * level;
  }
  // Prestige (P bucket): a permanent, compounding global damage multiplier from lifetime
  // Ascendant Cells. ×1 at 0 cells, so a fresh / un-prestiged account is byte-identical.
  const pm = prestigeMult(save.prestige.lifetimeCells);
  m.towerDamageMult *= pm;
  m.heroDamageMult *= pm;
  // Ascendant Tree: a bought node can raise permanent biomass income (×1 with no nodes).
  m.biomassMult *= ascendantBonuses(save.prestige.nodes).biomassMult;
  return m;
}

/** Cells a Molt would mint now: the sqrt base × the Ascendant Resonance node's compounding. */
function moltGain(save: SaveData): number {
  return Math.floor(cellsForCycle(save.prestige.cycleShards) * ascendantBonuses(save.prestige.nodes).cellGainMult);
}

export function upgradeLevel(save: SaveData, id: string): number {
  return save.upgrades[id] ?? 0;
}

export function upgradeCost(def: UpgradeDef, level: number): number {
  return Math.round(def.baseCost * Math.pow(def.costMult, level));
}

export function nextUpgradeCost(save: SaveData, def: UpgradeDef): number | null {
  const level = upgradeLevel(save, def.id);
  if (level >= def.maxLevel) return null;
  return upgradeCost(def, level);
}

// ── Tower progression (stars + infinite mastery) — pure derivations ──────────

/** XP required to advance FROM `level` to `level+1` (geometric → ever-slower). */
export function masteryReq(level: number): number {
  return Math.round(MASTERY.baseReq * Math.pow(MASTERY.reqGrowth, level));
}

/** Resolve total lifetime XP into a level + progress toward the next (for the bar). */
export function masteryProgress(xp: number): { level: number; into: number; need: number } {
  let level = 0;
  let rem = Math.max(0, xp);
  // Bounded loop guard: mastery is conceptually infinite, but no real save reaches
  // this many levels — it just prevents a pathological spin on absurd input.
  while (level < 100000) {
    const need = masteryReq(level);
    if (rem < need) return { level, into: rem, need };
    rem -= need;
    level++;
  }
  return { level, into: 0, need: masteryReq(level) };
}

export function masteryLevel(xp: number): number {
  return masteryProgress(xp).level;
}

/** Tower-shard cost to buy the (stars→stars+1) star. */
export function starCost(stars: number): number {
  return Math.round(STAR.baseCost * Math.pow(STAR.costMult, stars));
}

export function nextStarCost(save: SaveData, kind: TowerKind): number | null {
  const stars = save.towerStars[kind] ?? 0;
  if (stars >= STAR.maxTowerStars) return null;
  return starCost(stars);
}

/** Fold stars + mastery into per-kind run config. Stars contribute the incidental S-bucket
 * stat (config.STAR) PLUS their evolution kit (targeting/projectiles/granted attacks,
 * resolved from the authored star path + the player's per-run fork picks). Identity for a
 * fresh save: 0 stars ⇒ empty kit ⇒ all kit fields undefined ⇒ a byte-identical run. */
export function towerProgress(save: SaveData): TowerProgress {
  const out = {} as TowerProgress;
  for (const k of TOWER_ORDER) {
    const stars = save.towerStars[k] ?? 0;
    const mLvl = masteryLevel(save.towerMasteryXp[k] ?? 0);
    const kit = resolveStarKit(k, stars, save.towerForks?.[k]);
    // Mastery milestone PERKS fold mechanics (not stats) into the same kit — pierce, wider
    // splash, identity-range axes (docs/RANGE.md §8) — at high mastery. None below their
    // threshold ⇒ a fresh save stays identity.
    let rangeMult = 1;
    let fireRateBonus = 1;
    let infectionSpreadMult = 1;
    for (const p of masteryPerksUpTo('tower', k, mLvl)) {
      if (p.projectileMutator) kit.projectileMutators.push(p.projectileMutator);
      if (p.extraProjectiles) kit.extraProjectiles += p.extraProjectiles;
      if (p.splashMult) kit.splashMult *= p.splashMult;
      if (p.rangeMult) rangeMult *= p.rangeMult;
      if (p.fireRateMult) fireRateBonus *= p.fireRateMult;
      if (p.infectionSpreadMult) infectionSpreadMult *= p.infectionSpreadMult;
    }
    out[k] = {
      damageMult: (1 + STAR.damagePerStar * stars) * (1 + MASTERY.damagePerLevel * mLvl),
      fireRateMult: (1 + STAR.fireRatePerStar * stars) * fireRateBonus,
      rangeMult: rangeMult !== 1 ? rangeMult : undefined,
      infectionSpreadMult: infectionSpreadMult !== 1 ? infectionSpreadMult : undefined,
      targeting: kit.targeting,
      extraProjectiles: kit.extraProjectiles || undefined,
      splashMult: kit.splashMult !== 1 ? kit.splashMult : undefined,
      projectileMutators: kit.projectileMutators.length ? kit.projectileMutators : undefined,
      extraAbilities: kit.extraAbilities.length ? kit.extraAbilities : undefined,
      reactorBiomassMult: kit.reactorBiomassMult !== 1 ? kit.reactorBiomassMult : undefined,
      reactorOverchargeBonus: kit.reactorOverchargeBonus !== 0 ? kit.reactorOverchargeBonus : undefined,
      cosmetics: kit.cosmetics.length ? kit.cosmetics : undefined,
    };
  }
  return out;
}

// ── Hero progression (mirrors towers: stars + infinite mastery + EQUIPMENT seam) ──

/** EQUIPMENT.md integration point. Equipment is designed but not yet built, so this
 * returns identity today; when items land, fold their per-hero modifiers in HERE and
 * they flow into a run through the same HeroMods path stars + mastery already use. */
export function heroEquipment(_save: SaveData, _kind: HeroKind): HeroMods {
  return { damageMult: 1, cooldownMult: 1 };
}

/** Hero-shard cost of the next star (reuses the tower star curve). */
export function nextHeroStarCost(save: SaveData, kind: HeroKind): number | null {
  const stars = save.heroStars[kind] ?? 0;
  if (stars >= STAR.maxStars) return null;
  return starCost(stars);
}

/** Fold stars + mastery + equipment into per-hero run multipliers. Stars add damage
 * and shave ability cooldown; mastery adds (infinite) damage. Identity for a fresh save. */
export function heroProgress(save: SaveData): HeroProgress {
  const out = {} as HeroProgress;
  for (const k of HERO_ORDER) {
    const stars = save.heroStars[k] ?? 0;
    const mLvl = masteryLevel(save.heroMasteryXp[k] ?? 0);
    const equip = heroEquipment(save, k);
    out[k] = {
      damageMult: (1 + STAR.damagePerStar * stars) * (1 + MASTERY.damagePerLevel * mLvl) * equip.damageMult,
      cooldownMult: (1 / (1 + STAR.fireRatePerStar * stars)) * equip.cooldownMult,
    };
  }
  return out;
}

export interface RunResult {
  wave: number; // = Depth in endless
  kills: number;
  won: boolean;
  mastery: MasteryCounts; // per-tower usage accrued in the run (from Game.getMasteryAccrual)
  heroMastery: HeroMasteryCounts; // per-hero usage (from Game.getHeroMasteryAccrual)
  stats: RunStats; // raw run statistics (from Game.getRunStats) — folded into lifetime stats
  endless?: boolean; // Endless (AI Director) mode run
}

export interface RunReward {
  shardsEarned: number;
  newBest: boolean;
}

export interface MasteryDelta {
  xpGained: number;
  fromLevel: number;
  toLevel: number;
}

/** One loot-queue box opened this run: its rarity + the rolled rewards (reuses the
 * chest reveal pipeline, with the rarity id riding along as chestId for styling). */
export interface LootBoxAward {
  rarity: string;
  chest: ChestResult;
}

/** The result of cracking one container open in the Vault — the rolled rewards plus a
 * display label + accent for the reveal ceremony (rarity name, or the cache's name). */
export interface CrackedContainer {
  chest: ChestResult;
  label: string;
  color: string;
}

/** Everything a finished run grants — the Results screen renders all of it. The run-end
 * cache and loot-queue boxes are NOT opened here: they bank into the Genetic Vault (loot.banked)
 * for the player to crack open manually. */
export interface RunOutcome {
  reward: RunReward;
  mastery: Record<TowerKind, MasteryDelta>;
  heroMastery: Record<HeroKind, MasteryDelta>;
  loot: { queue: LootQueueState; banked: PendingContainer[] }; // containers banked unopened this run (Vault)
  masteryUnlocks: { titles: string[]; lore: string[] }; // mastery identity earned this run (reward ids)
  achievements: AchievementDef[]; // milestones unlocked at run end — shown inline on Results, NOT toasted
}

/** Roll each awarded loot-queue box's reward table, fold the shards into the running
 * totals, and collect the per-box awards for the Results reveal. Mutates the records. */
function openLootBoxes(
  awarded: string[],
  towerShards: Record<TowerKind, number>,
  heroShards: Record<string, number>,
): LootBoxAward[] {
  const out: LootBoxAward[] = [];
  for (const rarity of awarded) {
    const def = rarityRegistry.get(rarity);
    if (!def) continue;
    const box = rollLoot(def);
    for (const k of TOWER_ORDER) towerShards[k] += box.towerShards[k] ?? 0;
    for (const id of Object.keys(box.heroShards)) heroShards[id] = (heroShards[id] ?? 0) + box.heroShards[id];
    out.push({ rarity, chest: box });
  }
  return out;
}

export const meta = {
  use: store.use,
  get: store.get,
  upgrades: META_UPGRADES,

  buyUpgrade(id: string): boolean {
    const save = store.get();
    const def = META_UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    const level = upgradeLevel(save, id);
    if (level >= def.maxLevel) return false;
    const cost = upgradeCost(def, level);
    if (save.shards < cost) return false;
    persist({
      ...save,
      shards: save.shards - cost,
      upgrades: { ...save.upgrades, [id]: level + 1 },
    });
    return true;
  },

  // ── Prestige (MOLT) ─────────────────────────────────────────────────────────

  /** A read-model for the Prestige UI: current P-bucket multiplier, balances, and the
   * cells a Molt would mint right now (the "when do I ascend?" decision). */
  prestigeView(): {
    cells: number;
    lifetimeCells: number;
    molts: number;
    cycleShards: number;
    mult: number;
    gain: number;
    canMolt: boolean;
  } {
    const save = store.get();
    const s = save.prestige;
    return {
      cells: s.cells,
      lifetimeCells: s.lifetimeCells,
      molts: s.molts,
      cycleShards: s.cycleShards,
      mult: prestigeMult(s.lifetimeCells),
      gain: moltGain(save), // includes the Ascendant Resonance compounding
      canMolt: canMolt(s.cycleShards),
    };
  },

  /** The Ascendant Tree as a UI list: each node's level, next cost (null = maxed), and
   * whether the current cell balance affords it. */
  ascendantNodes(): {
    cells: number;
    nodes: { id: string; name: string; desc: string; level: number; maxLevel: number; cost: number | null; affordable: boolean }[];
  } {
    const s = store.get().prestige;
    return {
      cells: s.cells,
      nodes: ASCENDANT_NODES.map((def) => {
        const level = s.nodes[def.id] ?? 0;
        const cost = nextAscendantCost(def, level);
        return { id: def.id, name: def.name, desc: def.desc, level, maxLevel: def.maxLevel, cost, affordable: cost !== null && s.cells >= cost };
      }),
    };
  },

  /** Spend Ascendant Cells to raise a tree node by one level. False if unknown/maxed/unaffordable. */
  buyAscendantNode(id: string): boolean {
    const save = store.get();
    const def = ASCENDANT_NODES.find((n) => n.id === id);
    if (!def) return false;
    const level = save.prestige.nodes[id] ?? 0;
    if (level >= def.maxLevel) return false;
    const cost = ascendantCost(def, level);
    if (save.prestige.cells < cost) return false;
    persist({
      ...save,
      prestige: { ...save.prestige, cells: save.prestige.cells - cost, nodes: { ...save.prestige.nodes, [id]: level + 1 } },
    });
    return true;
  },

  /**
   * MOLT: sacrifice the core-upgrade engine (banked Shards + meta-upgrade levels) to mint
   * Ascendant Cells, which permanently raise the global damage multiplier. Trophies (stars,
   * mastery, titles/lore, gear, tower/hero shards, loot queue) are KEPT. Returns false if a
   * Molt isn't worth offering yet (< minCells). Backs up first — it's destructive.
   */
  molt(): boolean {
    const save = store.get();
    const gain = moltGain(save);
    if (gain < PRESTIGE.molt.minCells) return false;
    saveStore.backup(); // ascensions are big + irreversible — keep a recoverable snapshot
    persist({
      ...save,
      shards: 0, // reset the engine: banked Shards …
      upgrades: {}, // … and the capped meta-upgrade levels
      prestige: {
        cells: save.prestige.cells + gain,
        lifetimeCells: save.prestige.lifetimeCells + gain,
        cycleShards: 0,
        molts: save.prestige.molts + 1,
        nodes: save.prestige.nodes, // the Ascendant Tree is permanent — kept across Molts
      },
    });
    return true;
  },

  /**
   * Settle a finished run in ONE atomic persist: bank global Shards + records,
   * convert per-kind usage into permanent mastery XP, and open the run-end chest
   * (granting tower/hero shards). Returns the full reward bundle for the Results UI.
   */
  /**
   * Abandon the current run and FORFEIT all of its rewards. We never call finishRun, so none of
   * its banking happens (no Genome Cores, mastery XP, hero kills, lifetime stats, run cache, prestige
   * cycle, or achievements). We also roll back the loot the run banked LIVE via syncRunLoot — the
   * completed containers are removed from the Vault and the cycle counters reset — so the player
   * truly walks away with nothing. (The seen-a-boss codex tick is a discovery record, not a reward,
   * and is left as-is.)
   */
  abandonRun(): void {
    const save = store.get();
    if (runContainersBanked.length > 0) {
      const drop = new Set<PendingContainer>(runContainersBanked);
      persist({ ...save, pendingContainers: save.pendingContainers.filter((c) => !drop.has(c)) });
    }
    runLootBanked = 0; // re-arm the live-bank cycle for the next run
    runContainersBanked = [];
  },

  finishRun(result: RunResult): RunOutcome {
    const save = store.get();
    const asc = ascendantBonuses(save.prestige.nodes); // permanent prestige-tree economy mults (×1 if none)

    // 1. global shards + run records
    const shardsEarned = Math.floor((result.wave * ECON.shardsPerWave + result.kills * ECON.shardsPerKill) * asc.shardGainMult);
    const newBest = result.wave > save.bestWave;

    // 2. mastery: counts → XP, tracking the level delta per kind for the UI
    const towerMasteryXp = { ...save.towerMasteryXp };
    const towerKills = { ...save.towerKills }; // lifetime per-tower kills (Tower Lab "Lifetime Kills")
    const mastery = {} as Record<TowerKind, MasteryDelta>;
    for (const k of TOWER_ORDER) {
      const c = result.mastery[k];
      const gained = Math.round(
        c.kills * MASTERY.xpPerKill + c.damage * MASTERY.xpPerDamage + c.activeTime * MASTERY.xpPerActiveSecond,
      );
      const fromLevel = masteryLevel(save.towerMasteryXp[k] ?? 0);
      towerMasteryXp[k] = (save.towerMasteryXp[k] ?? 0) + gained;
      towerKills[k] = (save.towerKills[k] ?? 0) + c.kills;
      mastery[k] = { xpGained: gained, fromLevel, toLevel: masteryLevel(towerMasteryXp[k]) };
    }

    // 3. hero mastery: same curve as towers, banked per-hero from run usage
    const heroMasteryXp = { ...save.heroMasteryXp };
    const heroMastery = {} as Record<HeroKind, MasteryDelta>;
    for (const k of HERO_ORDER) {
      const c = result.heroMastery[k];
      const gained = Math.round(
        c.kills * MASTERY.xpPerKill + c.damage * MASTERY.xpPerDamage + c.activeTime * MASTERY.xpPerActiveSecond,
      );
      const fromLevel = masteryLevel(save.heroMasteryXp[k] ?? 0);
      heroMasteryXp[k] = (save.heroMasteryXp[k] ?? 0) + gained;
      heroMastery[k] = { xpGained: gained, fromLevel, toLevel: masteryLevel(heroMasteryXp[k]) };
    }

    // 4. Loot: the run-end cache AND every loot-queue container this run completed bank
    //    UNOPENED into the Genetic Vault — nothing opens at run end. Rewards (tower/hero
    //    Shards, crafting materials, equipment) apply only when the player cracks each one
    //    open in the Vault (meta.openContainer). The live syncRunLoot calls already banked
    //    their containers into save.pendingContainers; here we add the run-end remainder + the
    //    guaranteed run cache. A run that never synced has runLootBanked = 0 → it banks its full
    //    points here.
    const lootPoints = Math.floor((result.wave * LOOT_EARN.pointsPerWave + result.kills * LOOT_EARN.pointsPerKill) * asc.lootGainMult);
    const lootAdv = addProgress(save.lootQueue, Math.max(0, lootPoints - runLootBanked));
    const queueRemainder: PendingContainer[] = lootAdv.awarded.map((rarity) => ({ kind: 'loot', rarity }));
    const runCache: PendingContainer = { kind: 'cache', chestId: chestForWave(result.wave) };
    const newlyBanked: PendingContainer[] = [...queueRemainder, runCache];
    const bankedThisRun: PendingContainer[] = [...runContainersBanked, ...newlyBanked];

    // 6. mastery identity: unlock any titles/lore crossed by this run's mastery level-ups.
    const newTitles: string[] = [];
    const newLore: string[] = [];
    for (const k of TOWER_ORDER) {
      for (const r of masteryRewardsBetween('tower', k, mastery[k].fromLevel, mastery[k].toLevel)) {
        (r.kind === 'title' ? newTitles : newLore).push(r.id);
      }
    }
    for (const k of HERO_ORDER) {
      for (const r of masteryRewardsBetween('hero', k, heroMastery[k].fromLevel, heroMastery[k].toLevel)) {
        (r.kind === 'title' ? newTitles : newLore).push(r.id);
      }
    }
    const unlockedTitles = newTitles.length ? Array.from(new Set([...save.unlockedTitles, ...newTitles])) : save.unlockedTitles;
    const unlockedLore = newLore.length ? Array.from(new Set([...save.unlockedLore, ...newLore])) : save.unlockedLore;

    // 7. Per-hero ownership stats: the FIELDED hero banks the kills it scored and the gear it
    //    ran with (drives the Hero Lab's lifetime kills + favorite equipment). Only slot 1
    //    fights, so only that hero accrues. Runs-per-hero already ride accumulateStats(heroUsage).
    const fielded = save.selectedHero;
    const heroKills = { ...save.heroKills, [fielded]: (save.heroKills[fielded] ?? 0) + (result.heroMastery[fielded]?.kills ?? 0) };
    const heroFavEquip = { ...save.heroFavEquip };
    const fieldedEquip = { ...(heroFavEquip[fielded] ?? {}) };
    for (const slot of ['weapon', 'armor', 'relic'] as const) {
      const uid = save.equipment.loadout[slot];
      const it = uid ? save.equipment.inventory.find((i) => i.uid === uid) : null;
      if (it) fieldedEquip[it.defId] = (fieldedEquip[it.defId] ?? 0) + 1;
    }
    heroFavEquip[fielded] = fieldedEquip;

    persist({
      ...save,
      shards: save.shards + shardsEarned,
      lifetimeShards: save.lifetimeShards + shardsEarned,
      bestWave: Math.max(save.bestWave, result.wave),
      totalRuns: save.totalRuns + 1,
      towerMasteryXp,
      towerKills,
      heroMasteryXp,
      heroKills,
      heroFavEquip,
      stats: accumulateStats(save.stats, result.stats),
      lootQueue: lootAdv.state,
      pendingContainers: [...save.pendingContainers, ...newlyBanked], // bank the run-end remainder + cache, unopened
      unlockedTitles,
      unlockedLore,
      // Prestige: this run's Shards count toward the current Molt cycle's mint metric.
      prestige: { ...save.prestige, cycleShards: save.prestige.cycleShards + shardsEarned },
    });
    runLootBanked = 0; // this run is settled — re-arm the live-bank cycle for the next run
    runContainersBanked = [];
    // Run-end milestones (extract, kills, mastery, …). The Results screen shows these inline AFTER
    // the reward sequence; the floating toaster is suppressed off-menu so nothing covers the stats.
    const unlockedAchievements = this.evaluateAchievements(result)
      .map(achievementById)
      .filter((d): d is AchievementDef => !!d);
    return {
      reward: { shardsEarned, newBest },
      mastery,
      heroMastery,
      loot: { queue: lootAdv.state, banked: bankedThisRun },
      masteryUnlocks: { titles: newTitles, lore: newLore },
      achievements: unlockedAchievements,
    };
  },

  /** Equip (or clear, id=null) a mastery title for the player profile. No-op if the title
   * isn't unlocked (defensive — the UI only offers unlocked ones). */
  equipTitle(id: string | null): void {
    const save = store.get();
    if (id !== null && !save.unlockedTitles.includes(id)) return;
    persist({ ...save, equippedTitle: id });
  },

  /**
   * Bank this run's loot points into the meta queue LIVE — called from the HUD as the run
   * progresses (wave/kills climb), so the meter advances in real time and deep/endless runs
   * roll the CORRECT boxes exactly, not a run-end-only estimate that caps at the first box.
   * Banks only the delta since the last call. Pure progress updates the store in-memory only
   * (HUD-live, no disk write every frame); completing a box rolls its rewards into the shard
   * totals immediately, persists, and remembers the box for the run-end reveal. A snapshot
   * reset (a new run back near 0) re-arms the cycle. Returns boxes opened by THIS call.
   */
  syncRunLoot(wave: number, kills: number): string[] {
    const save = store.get();
    const asc = ascendantBonuses(save.prestige.nodes);
    const total = Math.floor(Math.max(0, wave * LOOT_EARN.pointsPerWave + kills * LOOT_EARN.pointsPerKill) * asc.lootGainMult);
    if (total < runLootBanked) { runLootBanked = 0; runContainersBanked = []; } // a new run began → fresh cycle
    const delta = total - runLootBanked;
    if (delta <= 0) return [];
    runLootBanked = total;
    const adv = addProgress(save.lootQueue, delta);
    if (adv.awarded.length === 0) {
      store.set({ ...save, lootQueue: adv.state }); // pure progress: advance the meter, skip the disk write
      return [];
    }
    // A container completed — bank it UNOPENED. It waits in the Genetic Vault until the
    // player cracks it open (meta.openContainer), so no rewards are applied here.
    const entries: PendingContainer[] = adv.awarded.map((rarity) => ({ kind: 'loot', rarity }));
    runContainersBanked = [...runContainersBanked, ...entries];
    persist({ ...save, lootQueue: adv.state, pendingContainers: [...save.pendingContainers, ...entries] });
    return adv.awarded;
  },

  /** Current loot-queue state: the box the meter is filling, the pre-determined next
   * box(es), and pity counters. Read by the HUD meter. */
  lootQueue(): LootQueueState {
    return store.get().lootQueue;
  },

  /** The unopened bio-containers banked from runs (oldest first) — the Genetic Vault's
   * stockpile. The player cracks them open one at a time via openContainer(). */
  pendingContainers(): PendingContainer[] {
    return store.get().pendingContainers;
  },

  /** Crack open the oldest pending container, applying its reward and removing it from the
   * stockpile; returns the rolled chest + a display label/color for the reveal ceremony.
   * A loot box folds tower/hero Shards; a run cache also folds materials + adds equipment.
   * Null when nothing is pending (or a tampered entry can't be resolved → discarded). */
  openContainer(): CrackedContainer | null {
    const save = store.get();
    const [c, ...rest] = save.pendingContainers;
    if (!c) return null;
    const towerShards = { ...save.towerShards };
    const heroShards = { ...save.heroShards };
    if (c.kind === 'cache') {
      const def = CHESTS[c.chestId] ?? CHESTS[RUN_CHEST];
      const chest = rollChest(def);
      for (const k of TOWER_ORDER) towerShards[k] += chest.towerShards[k] ?? 0;
      for (const id of Object.keys(chest.heroShards)) heroShards[id] = (heroShards[id] ?? 0) + chest.heroShards[id];
      const mats = {
        mutagen: save.mats.mutagen + chest.materials.mutagen,
        scrap: save.mats.scrap + chest.materials.scrap,
        catalyst: save.mats.catalyst + chest.materials.catalyst,
      };
      persist({
        ...save, towerShards, heroShards, mats,
        equipment: { ...save.equipment, inventory: [...save.equipment.inventory, ...chest.equipment] },
        pendingContainers: rest,
      });
      return { chest, label: def?.name ?? 'Reward Cache', color: 'var(--gold)' };
    }
    if (!rarityRegistry.has(c.rarity)) { // junk id from a tampered save → discard, no reward
      persist({ ...save, pendingContainers: rest });
      return null;
    }
    const [award] = openLootBoxes([c.rarity], towerShards, heroShards);
    persist({ ...save, towerShards, heroShards, pendingContainers: rest });
    const def = rarityRegistry.get(c.rarity);
    return { chest: award.chest, label: `${def?.name ?? c.rarity} Container`, color: def?.color ?? 'var(--r-common)' };
  },

  /** Unlock any newly-satisfied achievements; persist + return the new ids (for toasts). */
  evaluateAchievements(run?: RunSummary): string[] {
    const save = store.get();
    const newly = checkAchievements({ save, run });
    if (newly.length === 0) return [];
    const reward = rewardFor(newly); // Shards granted for the unlock(s)
    persist({
      ...save,
      shards: save.shards + reward,
      lifetimeShards: save.lifetimeShards + reward,
      achievements: [...(save.achievements ?? []), ...newly.map((a) => a.id)],
    });
    return newly.map((a) => a.id);
  },

  /** Per-tower run multipliers from the current save (passed into a new Game). */
  towerProgress(): TowerProgress {
    return towerProgress(store.get());
  },

  /** Choose a star-fork option for a tower (keyed by the fork's star). Re-selectable any
   * time; takes effect on the next run (folded by towerProgress). */
  setTowerFork(kind: TowerKind, star: number, optionId: string): void {
    const save = store.get();
    const forKind = { ...(save.towerForks[kind] ?? {}), [String(star)]: optionId };
    persist({ ...save, towerForks: { ...save.towerForks, [kind]: forKind } });
  },

  /** Per-hero run multipliers from the current save (passed into a new Game). */
  heroProgress(): HeroProgress {
    return heroProgress(store.get());
  },

  /** Power Score (PROGRESSION.md §1.4): ONE legible number for total account power — the
   * product of the permanent damage buckets (meta upgrades × prestige × stars × mastery,
   * roster-averaged). ×1.0 on a fresh account; the §3F inflation gauge. */
  powerScore(): { score: number; meta: number; towers: number; heroes: number } {
    const save = store.get();
    const mm = metaModifiers(save); // meta upgrades × prestige P bucket
    const tp = towerProgress(save); // stars + mastery (towers)
    const hp = heroProgress(save); // stars + mastery (heroes)
    const geomean = (vals: number[]): number =>
      vals.length ? Math.exp(vals.reduce((s, v) => s + Math.log(v), 0) / vals.length) : 1;
    const towers = geomean(TOWER_ORDER.map((k) => tp[k].damageMult));
    const heroes = geomean(HERO_ORDER.map((k) => hp[k].damageMult));
    return { score: mm.towerDamageMult * towers * heroes, meta: mm.towerDamageMult, towers, heroes };
  },

  /** The hero the next run will field (slot 1). */
  selectedHero(): HeroKind {
    return store.get().selectedHero;
  },

  /** Choose which hero to field next run. */
  setSelectedHero(kind: HeroKind): void {
    persist({ ...store.get(), selectedHero: kind });
  },

  /** Spend hero shards to add a star to `kind`. Returns false if unaffordable/maxed. */
  buyHeroStar(kind: HeroKind): boolean {
    const save = store.get();
    const stars = save.heroStars[kind] ?? 0;
    if (stars >= STAR.maxStars) return false;
    const cost = starCost(stars);
    if ((save.heroShards[kind] ?? 0) < cost) return false;
    persist({
      ...save,
      heroShards: { ...save.heroShards, [kind]: (save.heroShards[kind] ?? 0) - cost },
      heroStars: { ...save.heroStars, [kind]: stars + 1 },
    });
    return true;
  },

  /** Spend tower shards to add a star to `kind`. Returns false if unaffordable/maxed. */
  buyStar(kind: TowerKind): boolean {
    const save = store.get();
    const stars = save.towerStars[kind] ?? 0;
    if (stars >= STAR.maxTowerStars) return false;
    const cost = starCost(stars);
    if ((save.towerShards[kind] ?? 0) < cost) return false;
    persist({
      ...save,
      towerShards: { ...save.towerShards, [kind]: (save.towerShards[kind] ?? 0) - cost },
      towerStars: { ...save.towerStars, [kind]: stars + 1 },
    });
    this.evaluateAchievements(); // first_star / star3
    return true;
  },

  // ── Hero equipment ────────────────────────────────────────────────────────

  /** CardEffects from the currently-equipped loadout — folded into a run at start. */
  loadoutEffects(): CardEffect[] {
    const { inventory, loadout } = store.get().equipment;
    return loadoutEffects(inventory, loadout);
  },

  // ── Collection (codex + completion rewards) ────────────────────────────────

  /** The full codex view, derived from the current save (read-only). */
  collection(): CollectionView {
    return collectionView(collectionContextOf(store.get()));
  },

  /** Completion rewards currently unlocked (titles, badges, portraits, themes, …). */
  collectionRewards(): CollectionReward[] {
    return unlockedRewards(this.collection());
  },

  /** Run-start effects from unlocked completion BONUSES — folded into a run like gear.
   * Empty for a fresh save, so a new player's run is byte-identical (golden-safe). */
  collectionRunEffects(): CardEffect[] {
    return collectionBonusEffects(this.collection());
  },

  /** Equip (or clear, uid=null) an owned item into a slot. */
  equip(slot: EquipSlot, uid: string | null): void {
    const save = store.get();
    persist({ ...save, equipment: { ...save.equipment, loadout: { ...save.equipment.loadout, [slot]: uid } } });
    if (uid) {
      const it = save.equipment.inventory.find((i) => i.uid === uid);
      if (it && gameEvents.hasListeners('equipmentEquipped')) {
        gameEvents.emit('equipmentEquipped', { slot, defId: it.defId, rarity: it.rarity });
      }
    }
  },

  grantItem(item: OwnedItem): void {
    const save = store.get();
    persist({ ...save, equipment: { ...save.equipment, inventory: [...save.equipment.inventory, item] } });
  },

  /** Toggle the collectible "favorite" pin on an owned item (sorts first; never auto-salvaged). */
  toggleFavorite(uid: string): void {
    const save = store.get();
    const inventory = save.equipment.inventory.map((i) => (i.uid === uid ? { ...i, favorite: !i.favorite } : i));
    persist({ ...save, equipment: { ...save.equipment, inventory } });
  },

  /** Toggle the "lock" on an owned item (protects it from salvage). */
  toggleLock(uid: string): void {
    const save = store.get();
    const inventory = save.equipment.inventory.map((i) => (i.uid === uid ? { ...i, locked: !i.locked } : i));
    persist({ ...save, equipment: { ...save.equipment, inventory } });
  },

  /** Reroll an item's unlocked affixes (spends 1 Mutagen). */
  rerollItem(uid: string): boolean {
    const save = store.get();
    if (save.mats.mutagen < 1) return false;
    const inv = save.equipment.inventory;
    const idx = inv.findIndex((i) => i.uid === uid);
    if (idx < 0) return false;
    const inventory = inv.slice();
    inventory[idx] = rerollAffixes(Math.random, inv[idx]);
    persist({ ...save, equipment: { ...save.equipment, inventory }, mats: { ...save.mats, mutagen: save.mats.mutagen - 1 } });
    return true;
  },

  /** Transmute an item up a rarity tier (spends 2 Catalysts) — adds an affix slot. */
  transmuteItem(uid: string): boolean {
    const save = store.get();
    if (save.mats.catalyst < 2) return false;
    const inv = save.equipment.inventory;
    const idx = inv.findIndex((i) => i.uid === uid);
    if (idx < 0) return false;
    const next = transmute(Math.random, inv[idx]);
    if (!next) return false;
    const inventory = inv.slice();
    inventory[idx] = next;
    persist({ ...save, equipment: { ...save.equipment, inventory }, mats: { ...save.mats, catalyst: save.mats.catalyst - 2 } });
    return true;
  },

  /** Dismantle an item into crafting feedstock (auto-unequips it). */
  salvageItem(uid: string): boolean {
    const save = store.get();
    const item = save.equipment.inventory.find((i) => i.uid === uid);
    if (!item || item.locked) return false; // locked items are protected from salvage
    const r = RARITY_ORDER.indexOf(item.rarity);
    const loadout = { ...save.equipment.loadout };
    for (const s of ['weapon', 'armor', 'relic'] as EquipSlot[]) if (loadout[s] === uid) loadout[s] = null;
    persist({
      ...save,
      equipment: { inventory: save.equipment.inventory.filter((i) => i.uid !== uid), loadout },
      mats: {
        mutagen: save.mats.mutagen + (r >= 3 ? 1 : 0),
        scrap: save.mats.scrap + 1 + r,
        catalyst: save.mats.catalyst + Math.max(0, r - 1),
      },
    });
    return true;
  },

  debugGrantGear(n = 3): void {
    const save = store.get();
    const items: OwnedItem[] = [];
    for (let i = 0; i < n; i++) items.push(rollItemDrop(Math.random, save.bestWave + 6));
    persist({
      ...save,
      equipment: { ...save.equipment, inventory: [...save.equipment.inventory, ...items] },
      mats: { mutagen: save.mats.mutagen + 5, scrap: save.mats.scrap + 12, catalyst: save.mats.catalyst + 6 },
    });
  },

  // ── Save management ──────────────────────────────────────────────────────

  exportToFile(): void {
    const date = new Date().toISOString().slice(0, 10);
    downloadText(`assimilate-save-${date}.json`, serializeExport(store.get()));
  },

  /** Validate + apply an imported save string. Backs up the current save first. */
  importText(text: string): ImportResult {
    const result = parseImport(text);
    if (!result.ok) return result;
    saveStore.backup(); // non-destructive: keep the pre-import state recoverable
    persist(result.data);
    return result;
  },

  async importFromFile(file: File): Promise<ImportResult> {
    try {
      return this.importText(await readTextFile(file));
    } catch {
      return { ok: false, error: 'Could not read the file.' };
    }
  },

  backupNow(): BackupMeta | null {
    return saveStore.backup();
  },

  listBackups(): BackupMeta[] {
    return saveStore.listBackups();
  },

  restoreBackup(id: string): boolean {
    const data = saveStore.restoreBackup(id);
    if (!data) return false;
    store.set(data);
    return true;
  },

  /** Wipe permanent progress — but back it up first so it's recoverable. */
  reset(): void {
    saveStore.backup();
    persist(defaultSave());
  },

  // ── Debug seeding (used by the debug panel; harmless no-ops otherwise) ────

  debugAddShards(n: number): void {
    const save = store.get();
    persist({ ...save, shards: Math.max(0, save.shards + n) });
  },

  debugSetUpgrade(id: string, level: number): void {
    const def = META_UPGRADES.find((u) => u.id === id);
    if (!def) return;
    const lvl = Math.max(0, Math.min(def.maxLevel, Math.floor(level)));
    persist({ ...store.get(), upgrades: { ...store.get().upgrades, [id]: lvl } });
  },

  debugMaxUpgrades(): void {
    const upgrades: Record<string, number> = {};
    for (const u of META_UPGRADES) upgrades[u.id] = u.maxLevel;
    persist({ ...store.get(), upgrades });
  },

  debugAddTowerShards(n: number): void {
    const save = store.get();
    const towerShards = { ...save.towerShards };
    for (const k of TOWER_ORDER) towerShards[k] = Math.max(0, (towerShards[k] ?? 0) + n);
    persist({ ...save, towerShards });
  },

  debugAddMasteryXp(n: number): void {
    const save = store.get();
    const towerMasteryXp = { ...save.towerMasteryXp };
    for (const k of TOWER_ORDER) towerMasteryXp[k] = Math.max(0, (towerMasteryXp[k] ?? 0) + n);
    persist({ ...save, towerMasteryXp });
  },

  debugAddHeroShards(n: number): void {
    const save = store.get();
    const heroShards = { ...save.heroShards };
    for (const k of HERO_ORDER) heroShards[k] = Math.max(0, (heroShards[k] ?? 0) + n);
    persist({ ...save, heroShards });
  },

  debugAddHeroMasteryXp(n: number): void {
    const save = store.get();
    const heroMasteryXp = { ...save.heroMasteryXp };
    for (const k of HERO_ORDER) heroMasteryXp[k] = Math.max(0, (heroMasteryXp[k] ?? 0) + n);
    persist({ ...save, heroMasteryXp });
  },

  /** Roll + grant a chest immediately (returns it so the panel can show a reveal). */
  debugOpenChest(chestId: string = RUN_CHEST): ChestResult {
    const chest = rollChest(CHESTS[chestId] ?? CHESTS[RUN_CHEST]);
    const save = store.get();
    const towerShards = { ...save.towerShards };
    for (const k of TOWER_ORDER) towerShards[k] += chest.towerShards[k] ?? 0;
    const heroShards = { ...save.heroShards };
    for (const id of Object.keys(chest.heroShards)) heroShards[id] = (heroShards[id] ?? 0) + chest.heroShards[id];
    const mats = {
      mutagen: save.mats.mutagen + chest.materials.mutagen,
      scrap: save.mats.scrap + chest.materials.scrap,
      catalyst: save.mats.catalyst + chest.materials.catalyst,
    };
    persist({
      ...save,
      towerShards,
      heroShards,
      mats,
      equipment: { ...save.equipment, inventory: [...save.equipment.inventory, ...chest.equipment] },
    });
    return chest;
  },

  /** Bank loot points directly (skips a run); completed containers bank UNOPENED into the Vault. */
  debugAddLootPoints(n: number): RunOutcome['loot'] {
    const save = store.get();
    const adv = addProgress(save.lootQueue, n);
    const entries: PendingContainer[] = adv.awarded.map((rarity) => ({ kind: 'loot', rarity }));
    persist({ ...save, lootQueue: adv.state, pendingContainers: [...save.pendingContainers, ...entries] });
    return { queue: adv.state, banked: entries };
  },
};
