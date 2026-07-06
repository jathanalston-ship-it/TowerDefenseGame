// Permanent (meta) progression: shards, capped upgrades, and run records.
// Persisted through SaveStore; exposed to React as a reactive store. Also fronts
// the save-management surface (export/import/backup) and debug seeding.

import { createStore } from './store';
import { applyDevReset } from './devReset';
import {
  SaveStore,
  defaultSave,
  parseImport,
  pushTimeline,
  serializeExport,
} from '../save/saveStore';
import type { BackupMeta, ImportResult, SaveData } from '../save/saveStore';
import { highestCampaignStage } from '../save/derive';
import { downloadText, readTextFile } from '../save/saveFile';
import { TOWER_DEFS, CAMPAIGN_REWARDS, CHESTS, ECON, EQUIP_DROP_CHANCE, HERO_DEFS, HERO_ORDER, HERO_SLOTS, INFINITE_REWARD_QUALIFY_FRAC, MASTERY, META_UPGRADES, RUN_CHEST, RUSH, STAR, TOWER_ORDER, campaignStarCap, chestForWave, endlessLootTaper, endlessTaper, upgradeEffectUnits } from '../core/config';
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
import { rollMaterialDrop } from '../core/materialDrop';
import type { ChestResult, PendingContainer } from './lootbox';
import { LOOT_EARN, costOf, rarityRegistry } from '../core/loot';
import { addProgress } from '../core/lootQueue';
import type { LootQueueState } from '../core/lootQueue';
import { resolveStarKit } from '../core/stars';
import { masteryPerksUpTo, masteryRewardsBetween } from '../core/mastery';
import { PRESTIGE, canMolt, cellsForCycle, prestigeMult, prestigeStageReq } from '../core/prestige';
import { ASCENDANT_NODES, ascendantBonuses, ascendantCost, nextAscendantCost } from '../core/ascendant';
import { accumulateStats } from './stats';
import { DEVICE_PREF_KEYS } from './prefs';
import { announcePower } from './powerEvents';
import { achievementById, checkAchievements, rewardFor } from './achievements';
import type { AchievementDef, RunSummary } from './achievements';
import { ALL_ITEMS, EQUIP_SLOTS, emptyLoadout, itemDef, loadoutEffects, rollItem, rollItemDrop, rollItemForPower } from '../core/equipment';
import type { EquipSlot, Loadout, OwnedItem } from '../core/equipment';
import { ICHOR, ichorForAchievement, ichorForBossRecord, ichorForDepthRecord, marketWindow, nextRushIchorAt, rollIchorDrop, rollRushVaultRarity, rollStock, vaultsForBossRecord } from '../core/market';
import type { MarketSlot } from '../core/market';
import {
  canAfford, enhance, opAvailable, randomizeAffix, reforge, reforgeCost, reroll, salvageValue, spend, toggleAffixLock, upgrade,
} from '../core/reforge';
import type { ReforgeOp } from '../core/reforge';
import { gameEvents } from '../core/events';
import type { CardEffect } from '../core/cards';
import { cardRegistry } from '../core/cards';
import { HERO_SLOT_POWER, composePower, effectsPower, geomean, itemRarityPower, metaExtrasPower } from '../core/power';
import { geneCollectionPowerMult, geneLevel, geneLevelCapForStage, geneMaxLevel } from '../core/geneCards';
import type { GeneSave } from '../core/geneCards';
import { essenceForDuplicates, essenceUpgradeCost, rollEssenceDrop } from '../core/geneEssence';
import { GENE_LOADOUT_SLOTS } from '../core/geneLoadout';
import { ADAPT_RESPEC, ANTIGEN, adaptationEffect, adaptNodesFor, adaptPointsEarned, adaptVisualTier, antigenEarned, canPickAdapt, respecCost } from '../core/adaptation';
import type { AdaptNode } from '../core/adaptation';
import type { PowerParts, PowerScore } from '../core/power';
import { lootBias } from '../core/progressionLoot';
import { resolveDifficulty } from '../core/difficulty';
import { doctrineEconomy, economyFor, lootQualityTier, modeCoreMult, modeLootMult, modeMasteryMult } from '../core/difficultyDirector';
import { coreShardIncome, lootPointIncome } from '../core/economyDirector';
import { predictBossRush, predictCampaign, predictInfinite, calibrate } from '../core/predict';
import type { RouletteReward } from './bioRoulette';
import type { Prediction } from '../core/predict';
import { unlockedMechanics, pendingAnnouncements } from './mechanics';
import type { MechanicDef } from './mechanics';
import type { TutorialProgress } from '../core/tutorial';
import { collectionView, unlockedRewards, collectionBonusEffects, collectionEconomyBonuses, collectionRankUps, rankSnapshot } from '../core/collection';
import type { CollectionContext, CollectionReward, CollectionView, CollectionRankUp, CollectionCategoryId } from '../core/collection';
import { BIOMES } from '../core/biomes';
import { BIOME_REGION, stageWaveCount } from '../core/campaign';
import { bossDef } from '../core/boss';

/** Biome ids the account has reached in Campaign, derived from campaign depth (biomes occupy
 *  contiguous BIOME_REGION-stage bands that rotate through BIOMES). No new save field. */
function biomesSeenOf(save: SaveData): Set<string> {
  const seen = new Set<string>();
  const deepest = highestCampaignStage(save);
  if (deepest < 1) return seen;
  const n = BIOMES.length;
  const maxRegion = Math.floor((deepest - 1) / BIOME_REGION);
  for (let r = 0; r <= maxRegion && seen.size < n; r++) seen.add(BIOMES[r % n].id);
  return seen;
}

/** Build the collection codex context from a save (read-only derivation). */
export function collectionContextOf(save: SaveData): CollectionContext {
  return {
    stats: save.stats,
    ownedDefIds: new Set(save.equipment.inventory.map((i) => i.defId)),
    bestWave: save.bestWave,
    bossesSlain: new Set(save.bossesSlain),
    biomesSeen: biomesSeenOf(save),
    geneLevels: Object.fromEntries(Object.entries(save.genes).map(([id, g]) => [id, g.level])),
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

// Splice Market stock seed (docs/MARKET.md): derived from the profile's createdAt stamp so
// defaultSave() stays deterministic (no rolled field) while every real profile still gets its
// own stock stream. 0 (pre-first-settle) is a valid seed.
const marketSeedOf = (s: SaveData): number => (s.createdAt || 0) >>> 0;

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

// Collection rank celebration — SESSION baseline (not persisted): the per-category rank + the
// collection Power multiplier at the last poll. meta.pollCollectionRankUps() diffs against these so
// a promotion is celebrated once per session (the Codex screen polls on open). Seeded at load so the
// first poll reports growth since the app started, never retroactively for already-earned ranks.
const _collBaseline = collectionView(collectionContextOf(store.get()));
let lastCollectionRanks: Partial<Record<CollectionCategoryId, number>> = rankSnapshot(_collBaseline);
let lastCollectionMult = _collBaseline.power;

/**
 * Permanent multipliers derived from upgrade levels (folded into a run at start).
 * Data-driven: each upgrade declares its target stat + per-level value (config),
 * so adding an upgrade needs no change here. Multiplier stats base at 1, flat at 0.
 */
export function metaModifiers(save: SaveData): MetaModifiers {
  const m: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
  for (const u of META_UPGRADES) {
    const level = save.upgrades[u.id] ?? 0;
    // `run`-seam upgrades fold via genomeRunEffects; Runaway upgrades fold at √level (units)
    if (level > 0 && u.effect) m[u.effect.stat] += u.effect.perLevel * upgradeEffectUnits(u, level);
  }
  // Prestige (P bucket): a permanent, compounding global damage multiplier from lifetime
  // Ascendant Cells. ×1 at 0 cells, so a fresh / un-prestiged account is byte-identical.
  const pm = prestigeMult(save.prestige.lifetimeCells);
  m.towerDamageMult *= pm;
  m.heroDamageMult *= pm;
  // Ascendant Tree: bought nodes raise permanent biomass income + a global damage bucket + core HP
  // (all ×1 / +0 with no nodes ⇒ golden-safe).
  const ab = ascendantBonuses(save.prestige.nodes);
  m.biomassMult *= ab.biomassMult;
  m.towerDamageMult *= ab.damageMult;
  m.heroDamageMult *= ab.damageMult;
  m.integrityBonus += ECON.baseIntegrity * (ab.integrityMult - 1); // Ascendant Vitality: permanent max Integrity
  return m;
}

/** Genome Core upgrades that fold through the RUN-EFFECT seam (docs/GENOME-CORE.md) → CardEffects
 *  threaded into a run like gear/collection. Empty for a fresh save (all levels 0) ⇒ golden-safe. */
export function genomeRunEffects(save: SaveData): CardEffect[] {
  const out: CardEffect[] = [];
  for (const u of META_UPGRADES) {
    if (!u.run) continue;
    const level = save.upgrades[u.id] ?? 0;
    if (level <= 0) continue;
    const units = upgradeEffectUnits(u, level); // linear for capped, √level for Runaway
    if (u.run.op === 'mul') out.push({ op: 'mul', field: u.run.field, value: 1 + u.run.perLevel * units });
    else out.push({ op: 'add', field: u.run.field, value: u.run.perLevel * units });
  }
  return out;
}

/** A hero's equipped loadout — PER-HERO (HEROES.md hero slots). Empty when the hero has no gear. */
export function loadoutOf(save: SaveData, kind: HeroKind): Loadout {
  return save.equipment.loadouts[kind] ?? emptyLoadout();
}

/** Equipment's Power contribution: the PRODUCT of every hero's equipped-loadout power (offense
 * effects × each piece's rarity/affix index), so gearing more heroes raises account power and a
 * single-loadout (migrated) save reads identically. 1 with no gear. */
function equipmentPower(save: SaveData): number {
  const inv = save.equipment.inventory;
  let mult = 1;
  for (const kind of HERO_ORDER) {
    const loadout = save.equipment.loadouts[kind];
    if (!loadout) continue;
    mult *= effectsPower(loadoutEffects(inv, loadout));
    for (const slot of EQUIP_SLOTS) {
      const uid = loadout[slot];
      const it = uid ? inv.find((i) => i.uid === uid) : undefined;
      if (it) mult *= itemRarityPower(it.rarity, it.affixes.length);
    }
  }
  return mult;
}

/** The account Power contributors folded from the save (docs/POWER-SCORE.md). `temporary`
 * carries in-run buffs (gene cards / branches); it is 1 for the at-rest account view. Prestige
 * is already inside metaModifiers.towerDamageMult (the P bucket), so it counts via `meta`. */
export function accountPowerParts(save: SaveData, temporary = 1): PowerParts {
  const mm = metaModifiers(save);
  const tp = towerProgress(save);
  const hp = heroProgress(save);
  // Prestige + Ascendant global damage is captured ONCE via mm.towerDamageMult; pass the UPGRADE-only
  // hero multiple to metaExtrasPower so Apex Genome / Rich Biomass / Reinforced Nucleus / Hive
  // Emplacements all move Power without double-counting prestige (POWER-SCORE.md coverage guarantee).
  const globalDmg = prestigeMult(save.prestige.lifetimeCells) * ascendantBonuses(save.prestige.nodes).damageMult;
  const metaExtras = metaExtrasPower({
    heroDamageUpgradeMult: globalDmg > 0 ? mm.heroDamageMult / globalDmg : 1,
    biomassMult: mm.biomassMult,
    integrityMult: 1 + mm.integrityBonus / ECON.baseIntegrity,
    bonusSlots: mm.bonusSlots,
  });
  // Collection completion bonuses are permanent account strength → their offense folds into `meta`.
  const collectionMult = effectsPower(collectionBonusEffects(collectionView(collectionContextOf(save))));
  // Unlocked hero slots beyond the first are account strength (a fielded extra champion) — the
  // hero-slot twin of the tower bonusSlots fold (POWER-AUDIT.md).
  const heroSlotMult = 1 + HERO_SLOT_POWER * Math.max(0, heroSlotsUnlocked(save) - 1);
  return {
    // Every PERMANENT strength source lands in `meta`: upgrades (tower-dmg proxy × genome run-effects ×
    // the hero/biomass/integrity/slot axes), prestige/ascendant, and collection bonuses — so ANY
    // upgrade raises Power. Towers/heroes/equipment/temporary are the other buckets.
    // Permanent gene-card upgrades are account strength → they fold into `meta` via the scale-safe
    // gene collection multiplier (1 until Task 4 authors upgrade levels; docs/GENE-EVOLUTION.md).
    meta: mm.towerDamageMult * effectsPower(genomeRunEffects(save)) * metaExtras * collectionMult * geneCollectionPowerMult(save.genes) * heroSlotMult,
    towers: geomean(TOWER_ORDER.map((k) => tp[k].damageMult)),
    heroes: geomean(HERO_ORDER.map((k) => hp[k].damageMult)),
    equipment: equipmentPower(save),
    // Codex completion across categories (1 on a fresh account ⇒ POWER_BASE preserved).
    collection: collectionView(collectionContextOf(save)).power,
    temporary,
  };
}

/** UTC day key (ISO date) — the Boss Rush free-daily-entry ledger (docs/BOSS-RUSH.md §stamina). */
function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Up to two soft guidance lines for the prediction panel — surfaces the weakest lever without ever
 *  dictating a move (docs/PREDICTION.md). Priority order; capped at two so it never overwhelms. */
function predictionRecommendations(save: SaveData, mode: 'campaign' | 'infinite' | 'bossRush', estimate: number): string[] {
  const out: string[] = [];
  const cleared = highestCampaignStage(save);
  const maxTowerStars = Math.max(0, ...TOWER_ORDER.map((k) => save.towerStars[k] ?? 0));
  const gear = equipmentPower(save);
  const molts = save.prestige?.molts ?? 0;
  if (mode === 'campaign' && cleared < estimate - 2) out.push('Campaign progression recommended — you can push several stages deeper.');
  if (maxTowerStars === 0) out.push('Tower Stars will significantly improve success — buy one in the Tower Lab.');
  if (gear <= 1.01) out.push('Equipment quality is below expected — gear up a hero in the Armory.');
  if (molts === 0 && cleared >= 10) out.push('Consider Prestiging for a permanent, compounding power multiplier.');
  return out.slice(0, 2);
}

/** Progression-aware loot bias (docs/LOOT-PROGRESSION.md): catch-up weights derived from how the
 * account's power compares to what its campaign/wave depth expects. All 1 (a no-op) for an on-par
 * or fresh account, so it never perturbs a baseline roll. */
function lootBiasFor(save: SaveData, difficultyId?: string): Record<string, number> {
  const campaignStage = highestCampaignStage(save);
  // Loot-quality axis: harder difficulties tilt the catch-up bias richer, scaled continuously by
  // the difficulty's lootQualityMult; the Ascendant Fortune node adds a permanent account-wide tilt
  // on top (×1 without it). standard + no node ⇒ 0 tier ⇒ no tilt, golden-safe.
  const fortune = ascendantBonuses(save.prestige.nodes).lootQualityMult;
  // Armory collection tilts loot quality richer as it fills (+0 on a fresh account).
  const codexLoot = collectionEconomyBonuses(collectionView(collectionContextOf(save))).lootQualityTier;
  const tier = lootQualityTier({ difficultyLootQualityMult: economyFor(difficultyId).lootQualityMult, fortuneMult: fortune, codexTier: codexLoot });
  return lootBias({
    idsAscending: rarityRegistry.ids(), // registration order is ascending rarity value
    campaignStage,
    bestWave: save.bestWave,
    actualPowerMult: composePower(accountPowerParts(save)).mult,
    difficultyTier: tier,
  });
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

/** Raw mastery-XP signal for one unit's run accrual — THE formula (docs/MASTERY.md).
 * Shared by finishRun (banking) and the live in-run projection (Hud/Inspector), so the
 * number the player watches during a run is byte-equal to the number that banks. */
export function masteryXpRaw(c: { kills: number; damage: number; activeTime: number }): number {
  return c.kills * MASTERY.xpPerKill + c.damage * MASTERY.xpPerDamage + c.activeTime * MASTERY.xpPerActiveSecond;
}

/** The run-constant mastery-XP multipliers for a run setup (mode + difficulty + save state).
 * Snapshot once at run start for the live projection; finishRun derives the same product. */
export function masteryXpMults(
  save: SaveData,
  mode: { endless?: boolean; campaign?: boolean; bossRush?: boolean },
  difficulty: string | undefined,
): { tower: number; hero: number } {
  const asc = ascendantBonuses(save.prestige.nodes);
  const cb = collectionEconomyBonuses(collectionView(collectionContextOf(save)));
  const econDiff = economyFor(difficulty);
  const modeMult = modeMasteryMult({ endless: !!mode.endless, campaign: !!mode.campaign, bossRush: !!mode.bossRush });
  const base = modeMult * econDiff.xpMult * asc.masteryXpMult;
  return { tower: base * cb.towerXpMult, hero: base * cb.heroXpMult };
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

/** Tower-Shard cost to buy the (stars→stars+1) star — the PRIMARY long grind. Smooth doubling
 * exponential (base × 2^s): ★1=10 … ★10=5,120 (cumulative 10,230). See docs/SHARD-ECONOMY.md. */
export function towerStarCost(stars: number): number {
  return Math.round(STAR.towerBaseCost * Math.pow(STAR.towerCostMult, stars));
}

/** Hero-Shard cost to buy the (stars→stars+1) star — a shorter, gentler ★5 ladder fed by the
 * rarer Hero-Shard drops (base 8 × 1.8^s): ★1=8 … ★5=84 (cumulative 179). */
export function heroStarCost(stars: number): number {
  return Math.round(STAR.heroBaseCost * Math.pow(STAR.heroCostMult, stars));
}

export function nextStarCost(save: SaveData, kind: TowerKind): number | null {
  const stars = save.towerStars[kind] ?? 0;
  if (stars >= STAR.maxTowerStars) return null;
  return towerStarCost(stars); // cost ladder only; the Campaign Evolution Cap is enforced in buyStar
}

// Canonical implementation lives in save/derive.ts (cycle-free — mechanics/read-models import it
// there); re-exported here so meta stays the one-stop progression API for existing callers.
export { highestCampaignStage };

/** The current Tower-Star EVOLUTION CAP from Campaign progress (config.EVOLUTION_CAPS). A star may
 *  not be bought beyond this until the matching Campaign milestone is cleared — Shards are the
 *  fuel, Campaign is the permission. */
export function evolutionStarCap(save: SaveData): number {
  return campaignStarCap(highestCampaignStage(save));
}

// ── Hero Slot progression (HEROES.md) — pure derivations over the save ───────────────────────────

/** How many hero slots are unlocked (1..HERO_SLOTS.length). Slots unlock strictly IN ORDER; each
 *  checks its Campaign + Prestige gate (config.HERO_SLOTS). Pure — run start, the Hero Lab, and the
 *  slot notification all read this. Always ≥1 (a fresh account fields one hero ⇒ golden-safe). */
export function heroSlotsUnlocked(save: SaveData): number {
  const stage = highestCampaignStage(save); // highest Campaign stage cleared (any difficulty)
  let n = 0;
  for (const def of HERO_SLOTS) {
    if (stage >= def.campaignStage) n++;
    else break; // a locked slot gates every later one (ordered milestones)
  }
  return Math.max(1, n);
}

// ── Hero Collection ownership (docs/HEROES.md) — WHICH heroes the account owns ────────────────────
// Orthogonal to hero SLOTS (how many you field): a hero must be OWNED to be selectable, and slots
// gate how many owned heroes deploy at once. Starters (no unlockShards) are always owned.

/** Whether the account owns `kind`. Starters (HeroDef without an unlockShards gate) are always
 *  owned; a locked hero is owned once it appears in `save.heroUnlocked` (claimed with Hero Shards). */
export function isHeroUnlocked(save: SaveData, kind: HeroKind): boolean {
  const cost = HERO_DEFS[kind]?.unlockShards ?? 0;
  if (cost <= 0) return true; // starter
  return (save.heroUnlocked ?? []).includes(kind);
}

/** Whether the account owns tower `kind` (docs/TOWERS.md §expansion). Starters (TowerDef without
 *  an unlockShards gate — the launch five) are always owned; a gated tower is owned once claimed
 *  with its own Tower Shards. Owned kinds ride the Biomorph Conveyor + favorite pool. */
export function isTowerUnlocked(save: SaveData, kind: TowerKind): boolean {
  const cost = TOWER_DEFS[kind]?.unlockShards ?? 0;
  if (cost <= 0) return true; // starter
  return (save.towerUnlocked ?? []).includes(kind);
}

/** The heroes fielded next run — the saved loadout clamped to unlocked slots + DISTINCT + OWNED
 *  kinds. Always ≥1 (falls back to the selected hero, or the first owned hero). A locked hero can
 *  never be fielded even if a stale loadout entry names it. */
export function fieldedLoadout(save: SaveData): HeroKind[] {
  const unlocked = heroSlotsUnlocked(save);
  const out: HeroKind[] = [];
  const seen = new Set<HeroKind>();
  for (const k of save.heroLoadout ?? []) {
    if (out.length >= unlocked) break;
    if (!seen.has(k) && isHeroUnlocked(save, k)) { out.push(k); seen.add(k); }
  }
  if (out.length === 0) {
    out.push(isHeroUnlocked(save, save.selectedHero) ? save.selectedHero : (HERO_ORDER.find((k) => isHeroUnlocked(save, k)) ?? save.selectedHero));
  }
  return out;
}

export interface HeroCollectionEntry {
  kind: HeroKind;
  name: string;
  color: string;
  unlocked: boolean;
  isStarter: boolean;
  cost: number; // Hero Shards to unlock (0 for starters / already-owned)
  shards: number; // Hero Shards banked toward this hero
  progress: number; // 0..1 toward the unlock threshold (1 when owned)
  canUnlock: boolean; // locked AND enough shards banked to claim now
}

/** The Hero Collection roster view: every hero with ownership + unlock progress ("42 / 100"), so
 *  a locked hero reads as a concrete, visible goal. Pure over the save; future-proof (reads the
 *  registry order, so a new hero just appears). */
export function heroCollection(save: SaveData): HeroCollectionEntry[] {
  return HERO_ORDER.map((kind) => {
    const def = HERO_DEFS[kind];
    const cost = def.unlockShards ?? 0;
    const isStarter = cost <= 0;
    const unlocked = isHeroUnlocked(save, kind);
    const shards = save.heroShards[kind] ?? 0;
    return {
      kind, name: def.name, color: def.color, unlocked, isStarter, cost, shards,
      progress: unlocked ? 1 : cost > 0 ? Math.min(1, shards / cost) : 1,
      canUnlock: !unlocked && shards >= cost,
    };
  });
}

export interface HeroSlotView {
  slot: number;
  name: string;
  unlocked: boolean;
  kind: HeroKind | null; // the hero assigned to this slot (null when locked / unassigned)
  hint: string; // unlock requirement (locked) — anticipation copy
  blurb: string; // what fielding this slot grants
  progress: number; // 0..1 toward unlocking (1 when unlocked)
  campaignStage: number; // current highest Campaign stage cleared (for "18 / 25" copy)
  campaignReq: number; // Campaign stage that unlocks this slot (0 = from the start)
}

/** Per-slot view for the Hero Lab: unlocked slots show their fielded hero; LOCKED slots show the
 *  Campaign unlock condition + progress ("Campaign 18 / 25"), so the "next hero slot" reads as a
 *  concrete, visible long-horizon goal. */
export function heroSlotView(save: SaveData): HeroSlotView[] {
  const unlocked = heroSlotsUnlocked(save);
  const loadout = fieldedLoadout(save);
  const stage = highestCampaignStage(save);
  return HERO_SLOTS.map((def) => {
    const isUnlocked = def.slot <= unlocked;
    return {
      slot: def.slot,
      name: def.name,
      unlocked: isUnlocked,
      kind: isUnlocked ? (loadout[def.slot - 1] ?? null) : null,
      hint: def.hint,
      blurb: def.blurb,
      progress: isUnlocked ? 1 : def.campaignStage > 0 ? Math.min(1, stage / def.campaignStage) : 1,
      campaignStage: stage,
      campaignReq: def.campaignStage,
    };
  });
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
    // Adaptation (docs/PROGRESSION-REDESIGN §2) — the player's SPENT antigen-point picks fold into
    // the SAME kit. Empty picks ⇒ a neutral effect ⇒ byte-identical to before (golden-safe).
    const adapt = adaptationEffect(save.adaptation?.[`tower:${k}`] ?? []);
    kit.projectileMutators.push(...adapt.projectileMutators);
    kit.extraProjectiles += adapt.extraProjectiles;
    kit.splashMult *= adapt.splashMult;
    rangeMult *= adapt.rangeMult;
    fireRateBonus *= adapt.fireRateMult;
    infectionSpreadMult *= adapt.infectionSpreadMult;
    out[k] = {
      damageMult: (1 + STAR.damagePerStar * stars) * (1 + MASTERY.damagePerLevel * mLvl) * adapt.damageMult,
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

/** Hero-shard cost of the next star — the separate, gentler Hero ladder (★5). */
export function nextHeroStarCost(save: SaveData, kind: HeroKind): number | null {
  const stars = save.heroStars[kind] ?? 0;
  if (stars >= STAR.maxStars) return null;
  return heroStarCost(stars);
}

/** Fold stars + mastery + equipment into per-hero run multipliers. Stars add damage
 * and shave ability cooldown; mastery adds (infinite) damage. Identity for a fresh save. */
export function heroProgress(save: SaveData): HeroProgress {
  const out = {} as HeroProgress;
  for (const k of HERO_ORDER) {
    const stars = save.heroStars[k] ?? 0;
    const mLvl = masteryLevel(save.heroMasteryXp[k] ?? 0);
    const equip = heroEquipment(save, k);
    const adapt = adaptationEffect(save.adaptation?.[`hero:${k}`] ?? []); // golden-safe: empty ⇒ ×1
    out[k] = {
      damageMult: (1 + STAR.damagePerStar * stars) * (1 + MASTERY.damagePerLevel * mLvl) * equip.damageMult * adapt.heroDamageMult,
      cooldownMult: (1 / (1 + STAR.fireRatePerStar * stars)) * equip.cooldownMult * adapt.heroCooldownMult,
    };
  }
  return out;
}

// ── Adaptation (docs/PROGRESSION-REDESIGN §2) — mastery-as-a-decision read-model + spends ──────────

export interface AdaptView {
  subject: 'tower' | 'hero';
  unit: string;
  pointsEarned: number; // multi-source Antigen (mastery ranks + campaign + containers + achievements)
  pointsSpent: number;
  pointsAvailable: number;
  chosen: string[];
  campaignStage: number; // the account's deepest cleared stage (drives node gates)
  visualTier: number; // the unit's battlefield visual stage (keystones raise it, 0..3)
  respec: { cost: number; gated: boolean; stageReq: number }; // priced, campaign-gated identity change
  sources: { mastery: number; campaign: number; containers: number; achievements: number }; // budget provenance
  nodes: { node: AdaptNode; chosen: boolean; canPick: boolean }[];
}

/** The Adaptation tree for a unit: its nodes (chosen / pickable / gated) + the Antigen budget
 *  with its provenance (docs/ADAPTATION.md — every source slow or capped). */
export function adaptationView(save: SaveData, subject: 'tower' | 'hero', unit: string): AdaptView {
  const key = `${subject}:${unit}`;
  const chosen = save.adaptation?.[key] ?? [];
  const level = subject === 'tower'
    ? masteryLevel(save.towerMasteryXp[unit as TowerKind] ?? 0)
    : masteryLevel(save.heroMasteryXp[unit as HeroKind] ?? 0);
  const stage = highestCampaignStage(save);
  const sources = {
    mastery: adaptPointsEarned(level),
    campaign: Math.floor(stage / ANTIGEN.stagePer),
    containers: Math.min(ANTIGEN.containerCap, save.antigen),
    achievements: Math.min(ANTIGEN.achievementCap, Math.floor(save.achievements.length / ANTIGEN.achievementsPer)),
  };
  const pointsEarned = antigenEarned({ masteryLevel: level, campaignStage: stage, containerAntigen: save.antigen, achievementCount: save.achievements.length });
  return {
    subject, unit, pointsEarned, pointsSpent: chosen.length,
    pointsAvailable: Math.max(0, pointsEarned - chosen.length),
    chosen: [...chosen],
    campaignStage: stage,
    visualTier: adaptVisualTier(chosen),
    respec: { cost: respecCost(chosen.length), gated: stage < ADAPT_RESPEC.stageGate, stageReq: ADAPT_RESPEC.stageGate },
    sources,
    nodes: adaptNodesFor(subject, unit, chosen).map((node) => ({ node, chosen: chosen.includes(node.id), canPick: canPickAdapt(node.id, chosen, stage) })),
  };
}

export interface RunResult {
  wave: number; // = Depth in endless
  kills: number;
  won: boolean;
  mastery: MasteryCounts; // per-tower usage accrued in the run (from Game.getMasteryAccrual)
  heroMastery: HeroMasteryCounts; // per-hero usage (from Game.getHeroMasteryAccrual)
  stats: RunStats; // raw run statistics (from Game.getRunStats) — folded into lifetime stats
  endless?: boolean; // Endless (AI Director) mode run
  bossRush?: boolean; // Boss Rush gauntlet run (docs/BOSS-RUSH.md) — rewards key off stats.bossKills
  // ── Campaign (procedural progression) — set by App for a 'campaign' run ──
  campaignStage?: number; // the stage number played (winning it unlocks the next)
  difficulty?: string; // the difficulty variant id (the per-difficulty campaign track)
  rewardMult?: number; // stage reward multiplier → scales end-of-run shards + loot quality
  durationSec?: number; // run length (sim seconds) — drives the campaign fastest-clear ledger
  doctrine?: string; // the run's doctrine — protocols pay run-end rewards (docs/MODE-IDENTITY.md §doctrines)
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
  // Campaign milestone raised the Evolution Cap this run (docs/EVOLUTION-CAP.md) → the dramatic
  // Evolution Unlock sequence (docs/TOWER-CODEX.md §2). Absent on a normal run. `stage` = the
  // campaign stage just cleared that pushed the cap from oldCap → newCap.
  evolutionUnlock?: { oldCap: number; newCap: number; stage: number };
  // Campaign milestone unlocked a new HERO SLOT this run (HEROES.md) → the cinematic Hero Slot
  // Unlock sequence. Absent on a normal run. `slot` = the newly-opened slot (2 or 3).
  heroSlotUnlock?: { slot: number; name: string; blurb: string; stage: number; powerScore: number };
  // Reward eligibility (docs/MODE-IDENTITY.md): present when the run FAILED to qualify for its reward
  // cache — a lost Campaign stage, or an Infinite run shorter than qualifyWave (50% of the prior
  // personal best). No cache/loot was banked; Results shows the reason. Absent on a qualifying run.
  rewardBlocked?: { reason: 'campaign-loss' | 'infinite-short' | 'rush-short'; qualifyWave: number };
  // Boss Rush lifetime-record bands (docs/BOSS-RUSH.md §ichor): this run's band payouts + the
  // updated record and the next Ichor milestone — the Results progress line. Absent off-rush.
  rushProgress?: { bossKills: number; bestBoss: number; nextIchorAt: number; ichor: number; vaults: number; newRecordBosses: number };
}

/** The one-time Combat Tutorial completion payout, for the reward reveal (docs/TUTORIAL.md). */
export interface TutorialRewardSummary {
  cores: number; // Genome Cores
  towerShards: number; // per-tower shard grant
  heroShards: number; // shard grant for the selected hero
  containerRarity: string; // the guaranteed Tutorial Bio-Container's rarity
  itemName: string; // the basic Hero Equipment piece granted
  achievement: string | null; // achievement unlocked ('Assimilation Protocol'), or null if already had it
  powerBefore: number;
  powerAfter: number; // the visible Power Score increase
}

/** Roll each awarded loot-queue box's reward table, fold the shards into the running
 * totals, and collect the per-box awards for the Results reveal. Mutates the records. */
function openLootBoxes(
  awarded: string[],
  towerShards: Record<TowerKind, number>,
  heroShards: Record<string, number>,
  heroPool?: readonly string[],
): LootBoxAward[] {
  const out: LootBoxAward[] = [];
  for (const rarity of awarded) {
    const def = rarityRegistry.get(rarity);
    if (!def) continue;
    const box = rollLoot(def, Math.random, heroPool);
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
    const powerBefore = meta.power().score;
    persist({
      ...save,
      shards: save.shards - cost,
      upgrades: { ...save.upgrades, [id]: level + 1 },
    });
    announcePower(`${def.name} L${level + 1} — Genome Upgrade`, powerBefore, meta.power().score);
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
    canMolt: boolean; // BOTH gates met (shards would mint ≥ minCells AND campaign depth reached)
    shardsReady: boolean; // the mint gate alone (enough Genome Cores banked this cycle)
    campaignStage: number; // current highest Campaign stage cleared
    campaignReq: number; // Campaign stage required to unlock the NEXT Molt
    campaignMet: boolean; // the campaign gate is satisfied
    campaignProgress: number; // 0..1 toward the campaign requirement
  } {
    const save = store.get();
    const s = save.prestige;
    const stage = highestCampaignStage(save);
    const req = prestigeStageReq(s.molts);
    const campaignMet = stage >= req;
    const shardsReady = canMolt(s.cycleShards);
    return {
      cells: s.cells,
      lifetimeCells: s.lifetimeCells,
      molts: s.molts,
      cycleShards: s.cycleShards,
      mult: prestigeMult(s.lifetimeCells),
      gain: moltGain(save), // includes the Ascendant Resonance compounding
      canMolt: shardsReady && campaignMet, // Prestige needs the mint AND the campaign gate
      shardsReady,
      campaignStage: stage,
      campaignReq: req,
      campaignMet,
      campaignProgress: req > 0 ? Math.min(1, stage / req) : 1,
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
    const powerBefore = meta.power().score;
    persist({
      ...save,
      prestige: { ...save.prestige, cells: save.prestige.cells - cost, nodes: { ...save.prestige.nodes, [id]: level + 1 } },
    });
    // Some Ascendant nodes are pure economy (loot/shard gain) — real value, not scored strength.
    announcePower(`${def.name} L${level + 1} — Ascendant Tree`, powerBefore, meta.power().score, false);
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
    if (highestCampaignStage(save) < prestigeStageReq(save.prestige.molts)) return false; // campaign gate (PROGRESSION.md)
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
      timeline: pushTimeline(save.timeline, '◬', `MOLT ${save.prestige.molts + 1} — ${gain} Ascendant Cells`), // profile milestone
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
    const cb = collectionEconomyBonuses(collectionView(collectionContextOf(save))); // codex economy bonuses (neutral on a fresh save)
    const rewardMult = result.rewardMult ?? 1; // campaign per-stage reward/loot scalar (1 otherwise)
    // Difficulty ECONOMY scalars (docs/DIFFICULTY.md). standard ⇒ identity (golden-safe). Campaign
    // already folds difficulty.rewardMult into result.rewardMult, so the currency reward scalar is
    // applied only to endless here (endlessRewardMult); the OTHER axes (XP, container rate) apply
    // universally as distinct levers.
    const econDiff = economyFor(result.difficulty);
    // Infinite core reward = the difficulty scalar × the Ascendant Infinity bonus (×1 without it).
    const endlessRewardMult = result.endless ? econDiff.rewardMult * asc.endlessBonusMult : 1;

    // Mode reward identity (docs/MODE-IDENTITY.md): Campaign pays the account currency (most on a
    // FIRST clear) + first-clear bonuses; Infinite pays the loot meter + a mastery bonus; Stage (the
    // legacy quick-run) stays neutral (×1) so the golden/meta tests don't move.
    const campDiff = result.difficulty ?? 'standard';
    const prevCleared = save.campaign.cleared[campDiff] ?? 0;
    const isRush = !!result.bossRush;
    const isCampaign = result.campaignStage != null && !result.endless && !isRush;
    const stageNo = result.campaignStage ?? 0;
    const firstClear = isCampaign && result.won && stageNo > prevCleared;
    const coreMult = modeCoreMult({ endless: !!result.endless, campaign: isCampaign, firstClear, bossRush: isRush });
    const lootMult = modeLootMult({ endless: !!result.endless, campaign: isCampaign, bossRush: isRush });
    // Infinite depth-camping taper (docs/MODE-IDENTITY.md §anti-grind): a DEEP endless run's Mastery
    // XP is scaled by the per-wave taper at its FINAL wave, so deep camps stop multiplying XP
    // linearly. Identity for non-endless and for endless runs ≤ ENDLESS_TAPER.startWave.
    const masteryTaper = result.endless ? endlessTaper(result.wave) : 1;
    const xpMultsRaw = masteryXpMults(save, { endless: result.endless, campaign: isCampaign, bossRush: isRush }, result.difficulty);
    const xpMults = { tower: xpMultsRaw.tower * masteryTaper, hero: xpMultsRaw.hero * masteryTaper };
    // One-time discovery payout on a brand-new stage clear (+ a milestone kicker every Nth stage).
    const firstClearBonus = firstClear
      ? Math.round(
          (CAMPAIGN_REWARDS.firstClearCore + CAMPAIGN_REWARDS.firstClearCorePerStage * stageNo +
            (stageNo % CAMPAIGN_REWARDS.milestoneEvery === 0 ? CAMPAIGN_REWARDS.milestoneCore : 0)) * cb.campaignRewardMult, // Biomes codex: +Campaign Rewards
        )
      : 0;
    // Failed FRONTIER attempt → partial "field data" consolation (BALANCE_REPORT push-futility):
    // attemptFrac of the stage's first-clear value, scaled by how deep the attempt survived.
    // Frontier-only (stage > cleared) so sub-wall stages can't be farmed, and the payout is
    // superseded by the full first-clear the moment the stage falls.
    const attemptBonus = isCampaign && !result.won && stageNo > prevCleared
      ? Math.round(
          CAMPAIGN_REWARDS.attemptFrac *
            (CAMPAIGN_REWARDS.firstClearCore + CAMPAIGN_REWARDS.firstClearCorePerStage * stageNo) *
            Math.min(1, result.wave / stageWaveCount(stageNo)),
        )
      : 0;
    // Boss Rush pays per boss DEFEATED (docs/BOSS-RUSH.md): wave N fields N bosses, so both
    // lanes scale ~N² with depth — slaying is the mode's payout, not surviving. Difficulty's
    // economy scalar rides both; prestige core gain rides the currency lane.
    const bossKills = result.stats.bossKills ?? 0;
    const rushCoreBonus = isRush ? Math.round(RUSH.corePerBoss * bossKills * econDiff.rewardMult * asc.coreGainMult) : 0;
    // Lifetime-record bands (docs/BOSS-RUSH.md §ichor): Ichor per NEW 5-band of the single-run
    // boss record, a weighted-common Bio-Container per NEW 10-band. Record-keyed — matching your
    // best pays nothing, so the lane can't be farmed. (The Ichor folds in below with the faucets.)
    const rushRecordBroken = isRush && bossKills > save.rushBestBoss;
    const rushIchor = rushRecordBroken ? ichorForBossRecord(save.rushBestBoss, bossKills) : 0;
    const rushVaultBank: PendingContainer[] = [];
    if (rushRecordBroken) {
      const vaults = vaultsForBossRecord(save.rushBestBoss, bossKills);
      for (let i = 0; i < vaults; i++) rushVaultBank.push({ kind: 'loot', rarity: rollRushVaultRarity(Math.random) });
    }
    const rushLootBonus = isRush ? Math.round(RUSH.lootPerBoss * bossKills * econDiff.containerRateMult * asc.lootGainMult) : 0;

    // 1. global shards + run records
    // Doctrine protocols (docs/MODE-IDENTITY.md §doctrines): run-end reward warps (director policy).
    const docEcon = doctrineEconomy(result.doctrine);
    const doctrineEssence = docEcon.essenceFor(result.wave);
    // Genome Cores ride the economy framework's composition (docs/ECONOMY_FORMULAS.md) — the
    // same factor chain, one owner, with an explainable trace.
    const shardsEarned = Math.floor(coreShardIncome({
      wave: result.wave,
      kills: result.kills,
      prestigeShardGainMult: asc.shardGainMult,
      prestigeCoreGainMult: asc.coreGainMult,
      stageRewardMult: rewardMult,
      endlessRewardMult,
      modeCoreMult: coreMult,
      doctrineRewardMult: docEcon.rewardMult,
    }).total()) + firstClearBonus + attemptBonus + rushCoreBonus;
    // Boss Rush keeps its OWN depth record (rush waves are dense, short numbers — folding them
    // into the Infinite record would warp that mode's qualify gate + prediction floor).
    const newBest = isRush ? result.wave > save.rushBestWave : result.wave > save.bestWave;

    // 2. mastery: counts → XP, tracking the level delta per kind for the UI
    const towerMasteryXp = { ...save.towerMasteryXp };
    const towerKills = { ...save.towerKills }; // lifetime per-tower kills (Tower Lab "Lifetime Kills")
    const mastery = {} as Record<TowerKind, MasteryDelta>;
    for (const k of TOWER_ORDER) {
      const c = result.mastery[k];
      const gained = Math.round(masteryXpRaw(c) * xpMults.tower); // Towers codex: +Tower XP rides xpMults
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
      const gained = Math.round(masteryXpRaw(c) * xpMults.hero); // Heroes codex: +Hero XP rides xpMults
      const fromLevel = masteryLevel(save.heroMasteryXp[k] ?? 0);
      heroMasteryXp[k] = (save.heroMasteryXp[k] ?? 0) + gained;
      heroMastery[k] = { xpGained: gained, fromLevel, toLevel: masteryLevel(heroMasteryXp[k]) };
    }

    // ── Reward eligibility (docs/MODE-IDENTITY.md). A run must EARN its bio-container cache. The old
    //    behavior banked a guaranteed run cache regardless of outcome, so a Start-Run → instant-Quit
    //    loop farmed caches. Campaign banks the cache ONLY on a win. Infinite must reach at least
    //    INFINITE_REWARD_QUALIFY_FRAC of the PRIOR personal best (save.bestWave, pre-run); below that
    //    it banks NO cache and NO loot ("exploit") containers — INCLUDING any banked LIVE this run —
    //    and Results shows why. The neutral quick-run is unchanged (golden/meta-test safe). Centralized
    //    here so every mode inherits it. ──
    const infiniteQualifyWave = result.endless
      ? Math.floor(save.bestWave * INFINITE_REWARD_QUALIFY_FRAC)
      : isRush
        ? Math.floor(save.rushBestWave * INFINITE_REWARD_QUALIFY_FRAC) // Boss Rush inherits the same anti-farm rule, keyed to ITS record
        : 0;
    const cacheEligible = result.endless || isRush ? result.wave >= infiniteQualifyWave : isCampaign ? result.won : true;
    // Infinite also forfeits its loot when short; campaign/quick keep loot earned by progress (only the
    // cache is gated for them). rewardBlocked drives the Results "why you got nothing" message.
    const lootEligible = result.endless || isRush ? cacheEligible : true;
    const rewardBlocked: RunOutcome['rewardBlocked'] = cacheEligible
      ? undefined
      : { reason: result.endless ? 'infinite-short' : isRush ? 'rush-short' : 'campaign-loss', qualifyWave: infiniteQualifyWave };

    // 4. Loot: the run-end cache AND every loot-queue container this run completed bank
    //    UNOPENED into the Genetic Vault — nothing opens at run end. Rewards (tower/hero
    //    Shards, crafting materials, equipment) apply only when the player cracks each one
    //    open in the Vault (meta.openContainer). The live syncRunLoot calls already banked
    //    their containers into save.pendingContainers; here we add the run-end remainder + the
    //    guaranteed run cache. A run that never synced has runLootBanked = 0 → it banks its full
    //    points here.
    const lootPoints = Math.floor(lootPointIncome({
      wave: result.wave,
      kills: result.kills,
      prestigeLootGainMult: asc.lootGainMult,
      stageRewardMult: rewardMult,
      modeLootMult: lootMult,
      containerRateMult: econDiff.containerRateMult,
      bossLootMult: cb.bossLootMult, // Bosses codex: +Boss Loot
      // Infinite depth-camping taper (docs/MODE-IDENTITY.md §anti-grind) — same curve as the live
      // meter, keyed on result.wave so run-end and live banking agree. Identity for non-endless.
      endlessTaperMult: result.endless ? endlessLootTaper(result.wave) : 1,
    }).total()) + rushLootBonus;
    const lootAdv = lootEligible
      ? addProgress(save.lootQueue, Math.max(0, lootPoints - runLootBanked), Math.random, lootBiasFor(save, result.difficulty))
      : { state: save.lootQueue, awarded: [] as string[] }; // unqualified: no run-end loot, meter frozen (no RNG spent)
    const queueRemainder: PendingContainer[] = lootAdv.awarded.map((rarity) => ({ kind: 'loot', rarity }));
    const runCache: PendingContainer = { kind: 'cache', chestId: chestForWave(result.wave) };
    // First-clear "Stage Cache": a one-time bonus container per never-cleared campaign stage, scaled
    // by the stage number so deeper first clears drop a richer cache.
    const stageCache: PendingContainer[] = firstClear ? [{ kind: 'cache', chestId: chestForWave(stageNo) }] : [];
    const cacheBank: PendingContainer[] = cacheEligible ? [runCache, ...stageCache] : [];
    const newlyBanked: PendingContainer[] = [...queueRemainder, ...cacheBank, ...rushVaultBank];
    // An unqualified Infinite run rolls back the containers it banked LIVE this run (syncRunLoot) —
    // the "no exploit rewards" rule. Reference-identity filter mirrors abandonRun. Other runs keep them.
    const forfeitLive = !lootEligible && runContainersBanked.length > 0;
    const forfeited = forfeitLive ? new Set<PendingContainer>(runContainersBanked) : null;
    const pendingBase: PendingContainer[] = forfeited ? save.pendingContainers.filter((c) => !forfeited.has(c)) : save.pendingContainers;
    const bankedThisRun: PendingContainer[] = [...(forfeitLive ? [] : runContainersBanked), ...newlyBanked];

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
    const fieldedLoad = loadoutOf(save, fielded); // the slot-1 hero's own gear (per-hero)
    for (const slot of EQUIP_SLOTS) {
      const uid = fieldedLoad[slot];
      const it = uid ? save.equipment.inventory.find((i) => i.uid === uid) : null;
      if (it) fieldedEquip[it.defId] = (fieldedEquip[it.defId] ?? 0) + 1;
    }
    heroFavEquip[fielded] = fieldedEquip;

    // Campaign: clearing a stage permanently unlocks the next (highest CLEARED per difficulty id).
    let nextCampaign = save.campaign;
    if (result.campaignStage && result.won) {
      const cleared = { ...save.campaign.cleared, [campDiff]: Math.max(save.campaign.cleared[campDiff] ?? 0, result.campaignStage) };
      // Fastest-clear ledger (schema v21): a WIN with a duration folds min(previous, this run).
      let bestTime = save.campaign.bestTime;
      if (result.durationSec && result.durationSec > 0) {
        const track = { ...(bestTime[campDiff] ?? {}) };
        const key = String(result.campaignStage);
        track[key] = Math.min(track[key] ?? Infinity, Math.round(result.durationSec));
        bestTime = { ...bestTime, [campDiff]: track };
      }
      nextCampaign = { cleared, bestTime };
    }
    // Evolution Cap: did clearing this stage raise the account-wide Star Cap (config.EVOLUTION_CAPS)?
    // If so, drive the dramatic Evolution Unlock sequence (docs/TOWER-CODEX.md §2).
    const oldCap = evolutionStarCap(save);
    const newCap = evolutionStarCap({ ...save, campaign: nextCampaign });
    const evolutionUnlock = result.won && result.campaignStage && newCap > oldCap
      ? { oldCap, newCap, stage: result.campaignStage }
      : null;
    // Hero Slot: did clearing this stage cross a Hero-Slot campaign gate (config.HERO_SLOTS)? If so,
    // drive the cinematic Hero Slot Unlock sequence — one of the account's biggest milestones (HEROES.md).
    const oldSlots = heroSlotsUnlocked(save);
    const newSlots = heroSlotsUnlocked({ ...save, campaign: nextCampaign });
    const slotDef = newSlots > oldSlots ? HERO_SLOTS[newSlots - 1] : null;
    const heroSlotUnlock = slotDef && result.won && result.campaignStage
      ? { slot: slotDef.slot, name: slotDef.name, blurb: slotDef.blurb, stage: result.campaignStage,
          powerScore: composePower(accountPowerParts({ ...save, campaign: nextCampaign })).score }
      : null;

    // Prediction calibration (docs/PREDICTION.md): fold this run's ACTUAL depth into the mode's
    // estimator so future predictions quietly get more accurate. Only campaign/infinite runs calibrate.
    const predMode: 'campaign' | 'infinite' | 'bossRush' | null = isRush ? 'bossRush' : result.endless ? 'infinite' : (result.campaignStage != null ? 'campaign' : null);
    const prediction = predMode
      ? { ...save.prediction, [predMode]: calibrate(save.prediction[predMode], predMode === 'campaign' ? (result.campaignStage ?? 0) : result.wave, composePower(accountPowerParts(save)).mult) }
      : save.prediction;

    // Player Profile (docs/PROFILE.md): stamp the account clock on the FIRST settle and record
    // the run's milestone moments on the timeline (new-best depth bands, every 10th stage).
    let timeline = save.createdAt === 0 ? pushTimeline(save.timeline, '◈', 'Specimen line established') : save.timeline;
    if (!isRush && newBest && Math.floor(result.wave / 25) > Math.floor(save.bestWave / 25)) {
      timeline = pushTimeline(timeline, '∞', `Infinite record — Depth ${result.wave}`);
    }
    if (isRush && newBest && Math.floor(result.wave / 5) > Math.floor(save.rushBestWave / 5)) {
      timeline = pushTimeline(timeline, '☠', `Boss Rush record — Wave ${result.wave}`);
    }
    if (firstClear && stageNo % 10 === 0) timeline = pushTimeline(timeline, '◆', `Reached Campaign Stage ${stageNo}`);

    // ── Ichor faucets (docs/MARKET.md §ichor) — both un-farmable by construction: the campaign
    //    milestone pays on FIRST clear of every 5th stage only; the Infinite trickle is keyed to
    //    NEW bands of the best-wave RECORD (a replayed depth pays nothing). ──
    let ichorGain = 0;
    if (firstClear && stageNo % ICHOR.campaignEvery === 0) {
      ichorGain += ICHOR.campaignAmount;
      timeline = pushTimeline(timeline, '◆', `Ichor bleed — Stage ${stageNo} milestone`);
    }
    if (result.endless && newBest) ichorGain += ichorForDepthRecord(save.bestWave, result.wave);
    if (rushIchor > 0) {
      ichorGain += rushIchor;
      timeline = pushTimeline(timeline, '◆', `Ichor bleed — ${bossKills}-boss gauntlet record`);
    }

    persist({
      ...save,
      prediction,
      createdAt: save.createdAt || Date.now(),
      timeline,
      shards: save.shards + shardsEarned,
      lifetimeShards: save.lifetimeShards + shardsEarned,
      ichor: save.ichor + ichorGain,
      lifetimeIchor: save.lifetimeIchor + ichorGain,
      bestWave: isRush ? save.bestWave : Math.max(save.bestWave, result.wave),
      rushBestWave: isRush ? Math.max(save.rushBestWave, result.wave) : save.rushBestWave,
      rushBestBoss: isRush ? Math.max(save.rushBestBoss, bossKills) : save.rushBestBoss,
      totalRuns: save.totalRuns + 1,
      towerMasteryXp,
      towerKills,
      heroMasteryXp,
      heroKills,
      heroFavEquip,
      stats: accumulateStats(save.stats, result.stats, result.mastery, { durationSec: result.durationSec, doctrine: result.doctrine, bossRush: isRush }),
      geneEssence: save.geneEssence + doctrineEssence, // Corrupted Genome pays essence per wave (0 otherwise)
      lootQueue: lootAdv.state,
      pendingContainers: [...pendingBase, ...newlyBanked], // bank the run-end remainder + cache (unopened); an unqualified Infinite run rolled its live loot back out of pendingBase
      unlockedTitles,
      unlockedLore,
      // Prestige: this run's Shards count toward the current Molt cycle's mint metric.
      prestige: { ...save.prestige, cycleShards: save.prestige.cycleShards + shardsEarned },
      campaign: nextCampaign,
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
      ...(evolutionUnlock ? { evolutionUnlock } : {}),
      ...(heroSlotUnlock ? { heroSlotUnlock } : {}),
      ...(rewardBlocked ? { rewardBlocked } : {}),
      ...(isRush
        ? { rushProgress: {
            bossKills,
            bestBoss: Math.max(save.rushBestBoss, bossKills),
            nextIchorAt: nextRushIchorAt(Math.max(save.rushBestBoss, bossKills)),
            ichor: rushIchor,
            vaults: rushVaultBank.length,
            newRecordBosses: Math.max(0, bossKills - save.rushBestBoss), // Bio-Roulette's record spore lane
          } }
        : {}),
    };
  },

  /** Equip (or clear, id=null) a mastery title for the player profile. No-op if the title
   * isn't unlocked (defensive — the UI only offers unlocked ones). */
  equipTitle(id: string | null): void {
    const save = store.get();
    if (id !== null && !save.unlockedTitles.includes(id)) return;
    persist({ ...save, equippedTitle: id });
  },

  /** Rename the specimen line (Player Profile banner). Trimmed, 1–24 chars; junk is a no-op. */
  setProfileName(name: string): void {
    const trimmed = name.trim().slice(0, 24);
    if (trimmed.length === 0) return;
    persist({ ...store.get(), profileName: trimmed });
  },

  /** Select an unlockable profile banner frame (docs/PROFILE.md). The UI only offers unlocked
   * frames; unknown ids are tolerated (render falls back to the default frame styling). */
  setProfileFrame(id: string): void {
    persist({ ...store.get(), profileFrame: id });
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
  syncRunLoot(wave: number, kills: number, endless = false): string[] {
    const save = store.get();
    const asc = ascendantBonuses(save.prestige.nodes);
    // Infinite depth-camping taper (docs/MODE-IDENTITY.md §anti-grind): endless runs bank the meter
    // scaled by the AVERAGE per-wave taper — identity (×1) through ENDLESS_TAPER.startWave, then
    // falling toward its floor — so per-wave banking shrinks the deeper you camp and depth-camping
    // can't out-earn re-running. Non-endless callers pass 1 ⇒ byte-identical (the conservation test
    // + every other mode are unchanged). Monotonic: the delta guard below is a high-water mark.
    const taper = endless ? endlessLootTaper(wave) : 1;
    const total = Math.floor(Math.max(0, wave * LOOT_EARN.pointsPerWave + kills * LOOT_EARN.pointsPerKill) * taper * asc.lootGainMult);
    if (total < runLootBanked) { runLootBanked = 0; runContainersBanked = []; } // a new run began → fresh cycle
    const delta = total - runLootBanked;
    // Self-heal (docs/LOOTBOX.md §meter): a save loaded with progress ≥ the front's cost is OWED
    // that box — award it even with zero new points, so the meter can never sit pinned at full.
    const owed = save.lootQueue.progress >= costOf(save.lootQueue.queue[0] ?? 'common');
    if (delta <= 0 && !owed) return [];
    runLootBanked = total;
    const adv = addProgress(save.lootQueue, Math.max(0, delta), Math.random, lootBiasFor(save));
    if (adv.awarded.length === 0) {
      store.set({ ...save, lootQueue: adv.state }); // pure progress: advance the meter, skip the disk write
      return [];
    }
    // A container completed — bank it UNOPENED. It waits in the Genetic Vault until the
    // player cracks it open (meta.openContainer), so no rewards are applied here.
    const entries: PendingContainer[] = adv.awarded.map((rarity) => ({ kind: 'loot', rarity }));
    runContainersBanked = [...runContainersBanked, ...entries];
    persist({ ...save, lootQueue: adv.state, pendingContainers: [...save.pendingContainers, ...entries] });
    // Fire the loot-fill toast (queued in the HUD) for each container just completed. Gated on a
    // listener so a headless/sim caller does zero extra work.
    if (gameEvents.hasListeners('lootContainerEarned')) {
      let banked = save.pendingContainers.length;
      for (const rarity of adv.awarded) gameEvents.emit('lootContainerEarned', { rarity, banked: ++banked, next: adv.state.queue[0] ?? 'common' });
    }
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
    // Bias hero-shard pulls toward still-LOCKED heroes so their "42 / 100" unlock bar fills visibly
    // (empty ⇒ every hero owned ⇒ shards distribute normally for stars).
    const lockedPool = HERO_ORDER.filter((k) => !isHeroUnlocked(save, k));
    let mats = save.mats;
    let chest: ChestResult;
    let label: string;
    let color: string;
    if (c.kind === 'cache') {
      const def = CHESTS[c.chestId] ?? CHESTS[RUN_CHEST];
      chest = rollChest(def, Math.random, lockedPool);
      for (const k of TOWER_ORDER) towerShards[k] += chest.towerShards[k] ?? 0;
      for (const id of Object.keys(chest.heroShards)) heroShards[id] = (heroShards[id] ?? 0) + chest.heroShards[id];
      mats = {
        mutagen: save.mats.mutagen + chest.materials.mutagen,
        scrap: save.mats.scrap + chest.materials.scrap,
        catalyst: save.mats.catalyst + chest.materials.catalyst,
      };
      label = def?.name ?? 'Reward Cache';
      color = 'var(--gold)';
    } else if (rarityRegistry.has(c.rarity)) {
      const [award] = openLootBoxes([c.rarity], towerShards, heroShards, lockedPool);
      chest = award.chest;
      const def = rarityRegistry.get(c.rarity);
      label = `${def?.name ?? c.rarity} Container`;
      color = def?.color ?? 'var(--r-common)';
    } else { // junk id from a tampered save → discard, no reward
      persist({ ...save, pendingContainers: rest });
      return null;
    }
    // Unified equipment drop (docs/EQUIPMENT.md): ~50% chance per container, AT MOST ONE item, rarity
    // scaled to the account Power Score (early Common → late Legendary/Exotic; no run-depth spikes).
    // Folded into the reveal (chest.items/equipment) + inventory here so BOTH container kinds award
    // gear identically — equipment no longer drops per-roll from the chest pools.
    const power = composePower(accountPowerParts(save)).score;
    if (Math.random() < EQUIP_DROP_CHANCE) {
      const item = rollItemForPower(Math.random, power);
      // FIRST DISCOVERY (docs/LOOTBOX.md §opening-flow): the def isn't in the inventory yet —
      // the collection's own "discovered" definition. Each open persists before the next, so
      // the second copy in a multi-open batch is correctly NOT new.
      const isNew = !save.equipment.inventory.some((i) => i.defId === item.defId);
      chest.items.push({ type: 'equipment', rarity: item.rarity, item, isNew });
      chest.equipment.push(item);
    }
    // Secondary crafting-material drop (docs/EQUIPMENT.md §Materials): low chance, small stacks, a
    // pity-protected RARE catalyst — scaled by Power + campaign progress + this container's rarity.
    // Applied to BOTH container kinds so every Vault container can feed crafting (equipment stays
    // primary). Folded into the reveal + save; matPity persists the guarantee across containers.
    const { drop, pity } = rollMaterialDrop({
      containerRarity: chest.topRarity, power, campaignStage: highestCampaignStage(save), pity: save.matPity, rng: Math.random,
    });
    if (drop) {
      chest.items.push({ type: 'material', rarity: drop.rarity, mat: drop.mat, amount: drop.amount });
      chest.materials[drop.mat] += drop.amount;
      mats = { ...mats, [drop.mat]: mats[drop.mat] + drop.amount };
    }
    // ── Gene Essence — duplicate conversion (docs/GENE-EVOLUTION.md §Economy). A tower/hero at MAX
    //    Star progression can't spend more shards, so the shards GRANTED by this open (diffed from the
    //    pre-open save, so it's path-agnostic + un-farmable) convert to Gene Essence, scaled by the
    //    container's rarity, instead of piling up dead. The excess is reverted from the shard totals so
    //    it never accumulates, and shown immediately on the reveal (a `geneEssence` event item). ──
    // The container's TRUE rarity: a loot box IS its box rarity (its pulls all read 'common'); a run
    // cache reads its best pull. Feeds both the conversion rate and the bonus-drop scaling below.
    const containerRarity = c.kind === 'loot' ? c.rarity : chest.topRarity;
    let essenceGained = 0;
    let towerDupes = 0;
    for (const k of TOWER_ORDER) {
      const granted = (towerShards[k] ?? 0) - (save.towerShards[k] ?? 0);
      if (granted > 0 && (save.towerStars[k] ?? 0) >= STAR.maxTowerStars) {
        towerShards[k] = save.towerShards[k] ?? 0; // maxed → don't accumulate; convert instead
        towerDupes += granted;
      }
    }
    let heroDupes = 0;
    for (const id of Object.keys(heroShards)) {
      const granted = (heroShards[id] ?? 0) - (save.heroShards[id] ?? 0);
      // Only UNLOCKED, max-Star heroes convert — a locked hero keeps its shards toward unlocking.
      if (granted > 0 && isHeroUnlocked(save, id as HeroKind) && (save.heroStars[id as HeroKind] ?? 0) >= STAR.maxStars) {
        heroShards[id] = save.heroShards[id] ?? 0;
        heroDupes += granted;
      }
    }
    const rName = rarityRegistry.get(containerRarity)?.name ?? containerRarity;
    if (towerDupes > 0) {
      const amt = essenceForDuplicates(containerRarity, towerDupes);
      essenceGained += amt;
      chest.items.push({ type: 'event', rarity: chest.topRarity, currency: 'geneEssence', amount: amt, note: `Duplicate ${rName} Tower` });
    }
    if (heroDupes > 0) {
      const amt = essenceForDuplicates(containerRarity, heroDupes);
      essenceGained += amt;
      chest.items.push({ type: 'event', rarity: chest.topRarity, currency: 'geneEssence', amount: amt, note: `Duplicate ${rName} Hero` });
    }
    // ── Gene Essence — bonus container drop (Task 3): a rare, small, purely-ADDITIVE roll (never
    //    replaces a guaranteed reward), scaled by the container's rarity + slightly by Campaign
    //    progress and Power Score. Duplicate conversion above stays the dominant source (simulated
    //    in docs/GENE-EVOLUTION.md §Economy). ──
    const essenceDrop = rollEssenceDrop({ containerRarity, power, campaignStage: highestCampaignStage(save), rng: Math.random });
    if (essenceDrop > 0) {
      essenceGained += essenceDrop;
      chest.items.push({ type: 'event', rarity: chest.topRarity, currency: 'geneEssence', amount: essenceDrop, note: 'Essence Trace' });
    }
    // ── Antigen Trace (docs/ADAPTATION.md §sources): a legendary-or-better container carries
    //    one Antigen — HARD-CAPPED lifetime (ANTIGEN.containerCap), so containers season the
    //    budget but can never be farmed for it. Shown on the reveal as an event item.
    let antigen = save.antigen;
    if ((containerRarity === 'legendary' || containerRarity === 'mythic') && antigen < ANTIGEN.containerCap) {
      antigen += 1;
      chest.items.push({ type: 'event', rarity: chest.topRarity, currency: 'antigen', amount: 1, note: 'Antigen Trace' });
    }
    // ── Ichor bleed (docs/MARKET.md §gamble): an independent, pity-less roll per container —
    //    the luck engine. Its EV sits deliberately UNDER the cheapest market container price
    //    (marketEconomy.test pins it), so a lucky streak briefly self-funds more openings but
    //    always dies out. Rendered at epic emphasis so the reveal's jackpot plumbing fires.
    const premiumBox = containerRarity === 'epic' || containerRarity === 'legendary' || containerRarity === 'exotic' || containerRarity === 'mythic';
    const ichorBleed = rollIchorDrop(Math.random, premiumBox);
    if (ichorBleed > 0) {
      chest.items.push({ type: 'event', rarity: 'epic', currency: 'ichor', amount: ichorBleed, note: 'Ichor Bleed' });
    }
    persist({
      ...save, towerShards, heroShards, mats, matPity: pity, antigen,
      geneEssence: save.geneEssence + essenceGained,
      ichor: save.ichor + ichorBleed,
      lifetimeIchor: save.lifetimeIchor + ichorBleed,
      equipment: { ...save.equipment, inventory: [...save.equipment.inventory, ...chest.equipment] },
      pendingContainers: rest,
    });
    return { chest, label, color };
  },

  /** Unlock any newly-satisfied achievements; persist + return the new ids (for toasts). */
  evaluateAchievements(run?: RunSummary): string[] {
    const save = store.get();
    const newly = checkAchievements({ save, run });
    if (newly.length === 0) return [];
    const reward = rewardFor(newly); // Shards granted for the unlock(s)
    // Ichor faucet (docs/MARKET.md §ichor): every achievement bleeds a little premium
    // currency, tiered by its core reward — achievements fire once, so this can't re-pay.
    const ichorReward = newly.reduce((n, a) => n + ichorForAchievement(a.reward ?? 0), 0);
    let timeline = save.timeline;
    for (const a of newly) timeline = pushTimeline(timeline, '✦', `Achievement — ${a.name}`); // profile milestones
    persist({
      ...save,
      shards: save.shards + reward,
      lifetimeShards: save.lifetimeShards + reward,
      ichor: save.ichor + ichorReward,
      lifetimeIchor: save.lifetimeIchor + ichorReward,
      achievements: [...(save.achievements ?? []), ...newly.map((a) => a.id)],
      timeline,
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

  /** The Adaptation tree for a unit (nodes + spendable Antigen Points). */
  adaptation(subject: 'tower' | 'hero', unit: string): AdaptView {
    return adaptationView(store.get(), subject, unit);
  },
  /** Spend one Antigen Point on an adaptation node — if a point is free AND the node is pickable
   *  (tier ladder + campaign gate + no exclusive sibling owned). Takes effect on the next run. */
  spendAdaptation(subject: 'tower' | 'hero', unit: string, nodeId: string): boolean {
    const save = store.get();
    const key = `${subject}:${unit}`;
    const chosen = save.adaptation?.[key] ?? [];
    const view = adaptationView(save, subject, unit);
    if (view.pointsAvailable <= 0 || !canPickAdapt(nodeId, chosen, view.campaignStage)) return false;
    const powerBefore = meta.power().score;
    persist({ ...save, adaptation: { ...save.adaptation, [key]: [...chosen, nodeId] } });
    // expectGain false: BEHAVIORAL picks (pierce/range/rate) deliberately rewrite conduct, not
    // the damage index — legitimate no-gain (the lab inspector says so up front). Damage picks
    // still toast their gain.
    announcePower('Adaptation unlocked', powerBefore, meta.power().score, false);
    return true;
  },
  /** Refund every adaptation pick for a unit. Identity changes are allowed but PRICED
   *  (Genome Cores per pick) and campaign-gated (docs/ADAPTATION.md §respec). */
  respecAdaptation(subject: 'tower' | 'hero', unit: string): boolean {
    const save = store.get();
    const key = `${subject}:${unit}`;
    const picks = save.adaptation?.[key]?.length ?? 0;
    if (picks === 0) return false;
    if (highestCampaignStage(save) < ADAPT_RESPEC.stageGate) return false;
    const cost = respecCost(picks);
    if (save.shards < cost) return false;
    const next = { ...save.adaptation };
    delete next[key];
    persist({ ...save, shards: save.shards - cost, adaptation: next });
    return true;
  },

  /** Per-hero run multipliers from the current save (passed into a new Game). */
  heroProgress(): HeroProgress {
    return heroProgress(store.get());
  },

  /** Power Score (PROGRESSION.md §1.4): ONE legible number for total account power — the
   * product of the permanent damage buckets (meta upgrades × prestige × stars × mastery,
   * roster-averaged). ×1.0 on a fresh account; the §3F inflation gauge. */
  powerScore(): { score: number; meta: number; towers: number; heroes: number } {
    const p = accountPowerParts(store.get());
    // Back-compat: `.score` stays the account DAMAGE multiple (meta × towers × heroes) used by
    // the recommended-power readiness checks — equipment/temporary live in the universal index.
    return { score: p.meta * p.towers * p.heroes, meta: p.meta, towers: p.towers, heroes: p.heroes };
  },

  /** Universal Power Score (docs/POWER-SCORE.md) — the integer feedback index folding meta,
   * prestige, tower/hero Stars + Mastery, and Equipment. A fresh account reads POWER_BASE. */
  power(): PowerScore {
    return composePower(accountPowerParts(store.get()));
  },

  /** Power Score WITH in-run temporary buffs (gene cards + branch grants as CardEffect[]) — for
   * the HUD and gene-draft "new power" preview. Outside a run pass nothing ⇒ equals power(). */
  powerWith(temporaryEffects: readonly CardEffect[] = []): PowerScore {
    return composePower(accountPowerParts(store.get(), effectsPower(temporaryEffects)));
  },

  /** Power Score for a HYPOTHETICAL save — pass a pure mutator returning the post-upgrade save
   * (never persisted). Drives the "current → new (+diff)" upgrade previews. */
  previewPower(mutate: (s: SaveData) => SaveData): PowerScore {
    return composePower(accountPowerParts(mutate(store.get())));
  },

  // ── Gene Cards — permanent progression (docs/GENE-EVOLUTION.md) ──────────────
  /** The raw permanent gene map (card id → state). Read-only view of save.genes. */
  genes(): GeneSave {
    return store.get().genes;
  },
  /** Permanent gene LEVELS (card id → level) for a run boot — passed to the Game so drafted cards
   *  apply at the player's level. Sparse (only leveled cards); empty ⇒ base effects (golden path). */
  geneLevels(): Record<string, number> {
    const out: Record<string, number> = {};
    const g = store.get().genes;
    for (const id in g) { const lvl = geneLevel(g, id); if (lvl > 0) out[id] = lvl; }
    return out;
  },
  // ── Starting Gene Loadout (docs/GENE-EVOLUTION.md §Loadouts) ──────────────────
  /** Unlocked loadout slot count (1..GENE_LOADOUT_MAX; slot 1 is always owned). */
  geneSlots(): number {
    return store.get().geneSlots;
  },
  /** The full 5-slot loadout (equipped card id or null per slot; slots ≥ geneSlots are locked). */
  geneLoadout(): (string | null)[] {
    return store.get().geneLoadout;
  },
  /** The card ids that AUTO-ACTIVATE at run boot: the equipped, OWNED cards in unlocked slots.
   *  Passed to the Game as RunOptions.startingGenes; empty ⇒ nothing applied (golden path). */
  startingGenes(): string[] {
    const s = store.get();
    const owned = new Set(s.stats?.uniqueCards ?? []);
    const out: string[] = [];
    for (let i = 0; i < s.geneSlots; i++) {
      const id = s.geneLoadout[i];
      if (id && owned.has(id) && cardRegistry.has(id) && !out.includes(id)) out.push(id);
    }
    return out;
  },
  /** Equip a card into an UNLOCKED slot (null clears it). Guarded: the slot must be unlocked, the
   *  card registered + OWNED, and not already equipped in another slot (no duplicates). */
  setGeneSlot(index: number, id: string | null): boolean {
    const s = store.get();
    if (index < 0 || index >= s.geneSlots) return false;
    if (id !== null) {
      if (!cardRegistry.has(id)) return false;
      if (!(s.stats?.uniqueCards ?? []).includes(id)) return false; // must be discovered
      if (s.geneLoadout.some((v, i) => v === id && i !== index)) return false; // one slot per card
    }
    const geneLoadout = s.geneLoadout.slice();
    geneLoadout[index] = id;
    persist({ ...s, geneLoadout });
    return true;
  },
  /** Swap two UNLOCKED slots (the rearrange gesture). */
  swapGeneSlots(a: number, b: number): void {
    const s = store.get();
    if (a < 0 || b < 0 || a >= s.geneSlots || b >= s.geneSlots || a === b) return;
    const geneLoadout = s.geneLoadout.slice();
    [geneLoadout[a], geneLoadout[b]] = [geneLoadout[b], geneLoadout[a]];
    persist({ ...s, geneLoadout });
  },
  /** Buy the NEXT loadout slot. Dual-gated (the spec): Campaign progression AND Genome Cores. */
  buyGeneSlot(): boolean {
    const s = store.get();
    const next = GENE_LOADOUT_SLOTS[s.geneSlots]; // the first still-locked slot (0-indexed)
    if (!next) return false; // all five owned
    if (highestCampaignStage(s) < next.campaignStage) return false;
    if (s.shards < next.coreCost) return false;
    persist({ ...s, shards: s.shards - next.coreCost, geneSlots: s.geneSlots + 1 });
    return true;
  },

  /** Toggle the ★ favorite on a gene card (sorts ahead in the Archive). */
  toggleGeneFavorite(id: string): void {
    const s = store.get();
    if (!cardRegistry.has(id)) return;
    const prev = s.genes[id];
    persist({ ...s, genes: { ...s.genes, [id]: { ...(prev ?? { level: 0 }), favorite: !prev?.favorite } } });
  },
  /** Toggle the 📌 pin on a gene card (always FIRST in the Archive, before favorites). */
  toggleGenePin(id: string): void {
    const s = store.get();
    if (!cardRegistry.has(id)) return;
    const prev = s.genes[id];
    persist({ ...s, genes: { ...s.genes, [id]: { ...(prev ?? { level: 0 }), pinned: !prev?.pinned } } });
  },

  /** Buy the next permanent level of a gene card (the Archive's upgrade button). Guarded: the card
   *  must be registered + OWNED (drafted at least once), below its authored ceiling AND the global
   *  campaign-gate ceiling, and the Gene Essence cost must be covered. Stamps `upgradedAt` (drives
   *  "recently improved"). Returns success; a refusal never charges. */
  upgradeGene(id: string): boolean {
    const save = store.get();
    const def = cardRegistry.get(id);
    if (!def) return false;
    if (!(save.stats?.uniqueCards ?? []).includes(id)) return false; // must be discovered first
    const level = geneLevel(save.genes, id);
    if (level >= geneMaxLevel(def)) return false; // authored ceiling
    const next = level + 1;
    if (next > geneLevelCapForStage(highestCampaignStage(save))) return false; // campaign gate
    const cost = essenceUpgradeCost(def.rarity, next);
    if (save.geneEssence < cost) return false;
    const prev = save.genes[id];
    const powerBefore = meta.power().score;
    persist({
      ...save,
      geneEssence: save.geneEssence - cost,
      genes: { ...save.genes, [id]: { ...prev, level: next, upgradedAt: Date.now() } },
    });
    announcePower(`${def.name} — Gene Level ${next}`, powerBefore, meta.power().score);
    return true;
  },

  /** Progress prediction (docs/PREDICTION.md) — an intelligent, self-calibrating ESTIMATE (never a
   *  guarantee) of how far the account can expect to reach in a mode, + 1–2 guidance recommendations.
   *  `difficultyId` is the mode's currently selected difficulty (harder ⇒ lower reach). */
  predict(mode: 'campaign' | 'infinite' | 'bossRush', difficultyId?: string): { p: Prediction; recommendations: string[] } {
    const save = store.get();
    const powerMult = composePower(accountPowerParts(save)).mult;
    const diffMult = resolveDifficulty(difficultyId).enemyHealthMult;
    const p = mode === 'campaign'
      ? predictCampaign(powerMult, highestCampaignStage(save), diffMult, save.prediction.campaign)
      : mode === 'bossRush'
        ? predictBossRush(powerMult, save.rushBestWave, diffMult, save.prediction.bossRush)
        : predictInfinite(powerMult, save.bestWave, diffMult, save.prediction.infinite);
    return { p, recommendations: predictionRecommendations(save, mode, p.estimate) };
  },

  /** Record the estimate shown at run START so the next finishRun can calibrate against the actual
   *  result. Called by the Play screens when a run launches. Quietly improves future predictions. */
  notePredictionBaseline(mode: 'campaign' | 'infinite' | 'bossRush', difficultyId?: string): void {
    const save = store.get();
    const est = this.predict(mode, difficultyId).p.estimate;
    persist({ ...save, prediction: { ...save.prediction, [mode]: { ...save.prediction[mode], lastEstimate: est } } });
  },

  /** The Biomorph Conveyor's FAVORITE tower (docs/STRAIN.md §conveyor) — always deployable. */
  favoriteTower(): TowerKind {
    return store.get().favoriteTower;
  },

  /** Choose the conveyor favorite (Tower Lab). */
  setFavoriteTower(kind: TowerKind): void {
    if (!isTowerUnlocked(store.get(), kind)) return; // a locked tower can't anchor the conveyor
    persist({ ...store.get(), favoriteTower: kind });
  },

  /** Owned tower kinds, in roster order — the run roster (belt + favorite + placement). */
  unlockedTowers(): TowerKind[] {
    const save = store.get();
    return TOWER_ORDER.filter((k) => isTowerUnlocked(save, k));
  },

  /** Whether the account owns tower `kind` (starters always; gated kinds once claimed). */
  isTowerUnlocked(kind: TowerKind): boolean {
    return isTowerUnlocked(store.get(), kind);
  },

  /** Claim a locked tower once enough of ITS Tower Shards are banked: spends the unlock cost,
   *  marks it owned, and returns true — it immediately joins the Biomorph Conveyor pool and can
   *  be starred / set as the favorite. False if already owned or unaffordable. */
  unlockTower(kind: TowerKind): boolean {
    const save = store.get();
    if (isTowerUnlocked(save, kind)) return false;
    const cost = TOWER_DEFS[kind].unlockShards ?? 0;
    if ((save.towerShards[kind] ?? 0) < cost) return false;
    persist({
      ...save,
      towerShards: { ...save.towerShards, [kind]: (save.towerShards[kind] ?? 0) - cost },
      towerUnlocked: [...(save.towerUnlocked ?? []), kind],
      timeline: pushTimeline(save.timeline, '◈', `Synthesized ${TOWER_DEFS[kind].name}`), // profile milestone
    });
    return true;
  },

  /** The slot-1 hero the next run fields (back-compat; = fieldedLoadout()[0]). */
  selectedHero(): HeroKind {
    return fieldedLoadout(store.get())[0];
  },

  /** Choose the slot-1 hero (back-compat wrapper over setHeroInSlot). */
  setSelectedHero(kind: HeroKind): void {
    meta.setHeroInSlot(1, kind);
  },

  /** The heroes the next run fields — the saved loadout clamped to unlocked slots (≥1). */
  fieldedLoadout(): HeroKind[] {
    return fieldedLoadout(store.get());
  },

  /** How many hero slots are unlocked right now (1..HERO_SLOTS.length). */
  heroSlotsUnlocked(): number {
    return heroSlotsUnlocked(store.get());
  },

  /** Per-slot view for the Hero Lab (fielded hero, or unlock condition + progress). */
  heroSlots(): HeroSlotView[] {
    return heroSlotView(store.get());
  },

  /** Assign `kind` to slot `slot` (1-based). Enforces UNLOCKED + a distinct roster: if `kind`
   *  already occupies another slot, the two swap. No-op when the slot is locked. */
  setHeroInSlot(slot: number, kind: HeroKind): void {
    const save = store.get();
    const unlocked = heroSlotsUnlocked(save);
    if (slot < 1 || slot > unlocked) return;
    if (!isHeroUnlocked(save, kind)) return; // can't field a hero the account doesn't own
    const loadout = fieldedLoadout(save).slice();
    // Fill any not-yet-assigned lower slots with distinct heroes so a higher slot can be set.
    while (loadout.length < slot) loadout.push(HERO_ORDER.find((k) => !loadout.includes(k)) ?? loadout[0]);
    const prev = loadout[slot - 1];
    const other = loadout.indexOf(kind);
    if (other >= 0 && other !== slot - 1) loadout[other] = prev; // swap to keep the roster distinct
    loadout[slot - 1] = kind;
    persist({ ...save, heroLoadout: loadout, selectedHero: loadout[0] });
  },

  /** Whether the account owns `kind` (starters always; locked heroes once claimed). */
  isHeroUnlocked(kind: HeroKind): boolean {
    return isHeroUnlocked(store.get(), kind);
  },

  /** The Hero Collection roster: every hero with ownership + unlock progress ("42 / 100"). */
  heroCollection(): HeroCollectionEntry[] {
    return heroCollection(store.get());
  },

  /** Claim a locked hero once enough Hero Shards are banked: spends its unlock cost, marks it owned,
   *  and returns true. False if already owned or unaffordable. The claimed hero is immediately
   *  selectable (setHeroInSlot no longer rejects it). */
  unlockHero(kind: HeroKind): boolean {
    const save = store.get();
    if (isHeroUnlocked(save, kind)) return false;
    const cost = HERO_DEFS[kind].unlockShards ?? 0;
    if ((save.heroShards[kind] ?? 0) < cost) return false;
    persist({
      ...save,
      heroShards: { ...save.heroShards, [kind]: (save.heroShards[kind] ?? 0) - cost },
      heroUnlocked: [...(save.heroUnlocked ?? []), kind],
      timeline: pushTimeline(save.timeline, '☣', `Released ${HERO_DEFS[kind].name}`), // profile milestone
    });
    return true;
  },

  /** Spend hero shards to add a star to `kind`. Returns false if unaffordable/maxed. */
  buyHeroStar(kind: HeroKind): boolean {
    const save = store.get();
    const stars = save.heroStars[kind] ?? 0;
    if (stars >= STAR.maxStars) return false;
    const cost = heroStarCost(stars);
    if ((save.heroShards[kind] ?? 0) < cost) return false;
    const powerBefore = meta.power().score;
    persist({
      ...save,
      heroShards: { ...save.heroShards, [kind]: (save.heroShards[kind] ?? 0) - cost },
      heroStars: { ...save.heroStars, [kind]: stars + 1 },
    });
    announcePower(`${HERO_DEFS[kind].name} — Evolution ◈${stars + 1}`, powerBefore, meta.power().score);
    return true;
  },

  /** The current Tower-Star EVOLUTION CAP from Campaign progress (docs/EVOLUTION-CAP.md). A tower
   *  may not be evolved past this until the matching Campaign milestone is cleared. */
  evolutionCap(): number {
    return evolutionStarCap(store.get());
  },

  /** Spend tower shards to add a star to `kind`. Returns false if unaffordable, maxed, OR gated by
   *  the Campaign Evolution Cap (Shards are the fuel, Campaign is the permission). */
  buyStar(kind: TowerKind): boolean {
    const save = store.get();
    if (!isTowerUnlocked(save, kind)) return false; // locked: shards bank toward the unlock
    const stars = save.towerStars[kind] ?? 0;
    if (stars >= STAR.maxTowerStars) return false;
    if (stars >= evolutionStarCap(save)) return false; // Campaign Evolution Cap not yet unlocked
    const cost = towerStarCost(stars);
    if ((save.towerShards[kind] ?? 0) < cost) return false;
    const powerBefore = meta.power().score;
    persist({
      ...save,
      towerShards: { ...save.towerShards, [kind]: (save.towerShards[kind] ?? 0) - cost },
      towerStars: { ...save.towerStars, [kind]: stars + 1 },
    });
    announcePower(`${TOWER_DEFS[kind].name} — Evolution ◈${stars + 1}`, powerBefore, meta.power().score);
    this.evaluateAchievements(); // first_star / star3
    return true;
  },

  // ── Hero equipment ────────────────────────────────────────────────────────

  /** A hero's equipped loadout (empty if none). PER-HERO (HEROES.md hero slots). */
  loadoutOf(kind: HeroKind): Loadout {
    return loadoutOf(store.get(), kind);
  },

  /** CardEffects from ONE hero's equipped loadout — folded into that hero at run start. */
  loadoutEffectsFor(kind: HeroKind): CardEffect[] {
    const save = store.get();
    return loadoutEffects(save.equipment.inventory, loadoutOf(save, kind));
  },

  /** Per-hero equipment effects for the fielded roster (App threads this into the run so each
   *  hero's gear affects only that hero — gear never overwrites another hero's loadout). */
  heroRosterEquip(): Partial<Record<HeroKind, CardEffect[]>> {
    const save = store.get();
    const out: Partial<Record<HeroKind, CardEffect[]>> = {};
    for (const kind of fieldedLoadout(save)) out[kind] = loadoutEffects(save.equipment.inventory, loadoutOf(save, kind));
    return out;
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

  /** Codex category rank promotions since the last poll, plus the account Power gained from the
   *  collection growing in between (drives the Codex rank-up celebration + Power popup). SESSION-
   *  diffed: each promotion fires once per session. Advances the baseline on every call. */
  pollCollectionRankUps(): { rankUps: CollectionRankUp[]; powerGain: number } {
    const v = collectionView(collectionContextOf(store.get()));
    const { rankUps, snapshot } = collectionRankUps(v, lastCollectionRanks);
    // Power gained since the last poll attributable to the collection part rising (holds other
    // contributors at their current value): score × (1 − oldCollMult / newCollMult).
    const score = composePower(accountPowerParts(store.get())).score;
    const powerGain = v.power > 0 ? Math.max(0, Math.round(score * (1 - lastCollectionMult / v.power))) : 0;
    lastCollectionRanks = snapshot;
    lastCollectionMult = v.power;
    // Ichor faucet (docs/MARKET.md §ichor): each rank promotion bleeds premium currency. The
    // session baseline seeds from the CURRENT save at load, so a reload can never re-pay an
    // already-earned rank (a rank-up in a session where the Codex is never opened is simply
    // celebrated — and paid — on the next promotion poll).
    if (rankUps.length > 0) {
      const s2 = store.get();
      const gain = rankUps.length * ICHOR.collectionRank;
      persist({
        ...s2,
        ichor: s2.ichor + gain,
        lifetimeIchor: s2.lifetimeIchor + gain,
        timeline: pushTimeline(s2.timeline, '◆', `Ichor bleed — Collection rank up (+${gain})`),
      });
    }
    return { rankUps, powerGain };
  },

  /** Run-start effects from unlocked completion BONUSES — folded into a run like gear.
   * Empty for a fresh save, so a new player's run is byte-identical (golden-safe). */
  collectionRunEffects(): CardEffect[] {
    return collectionBonusEffects(this.collection());
  },

  /** Run-start effects from owned Genome Core upgrades that use the run-effect seam
   * (docs/GENOME-CORE.md). Empty for a fresh save ⇒ golden-safe. */
  genomeRunEffects(): CardEffect[] {
    return genomeRunEffects(store.get());
  },

  // ── Splice Market (docs/MARKET.md) — the refreshing store + the Ichor premium seams ────────

  /** External Ichor grant seam (starter vial, future store/analytics — every source is tagged).
   *  In-run faucets (finishRun / achievements / rank-ups / container bleeds) fold Ichor into
   *  their own persists; this is the seam for everything else. */
  grantIchor(source: string, n: number): void {
    const amt = Math.max(0, Math.floor(n));
    if (amt <= 0) return;
    const save = store.get();
    persist({
      ...save,
      ichor: save.ichor + amt,
      lifetimeIchor: save.lifetimeIchor + amt,
      timeline: amt >= 10 ? pushTimeline(save.timeline, '◆', `Ichor acquired — ${source}`) : save.timeline,
    });
  },

  /** Boss Rush stamina, lazily regenerated (docs/BOSS-RUSH.md §stamina) — a pure read.
   *  +1 per RUSH.staminaRegenSec up to staminaMax; grants may sit above it (overflow pauses
   *  regen). `nextInMs` = time to the next point (0 at/above the ceiling). */
  rushStamina(now = Date.now()): { value: number; nextInMs: number; freeAvailable: boolean } {
    const s = store.get().rushStamina;
    const regenMs = RUSH.staminaRegenSec * 1000;
    const base = s.updatedAt > 0 ? s.updatedAt : now;
    const elapsed = Math.max(0, now - base);
    const value = s.value >= RUSH.staminaMax ? s.value : Math.min(RUSH.staminaMax, s.value + Math.floor(elapsed / regenMs));
    return {
      value,
      nextInMs: value >= RUSH.staminaMax ? 0 : regenMs - (elapsed % regenMs),
      freeAvailable: s.freeDay < dayKey(now), // ISO keys compare lexically; a forged future key self-heals by waiting
    };
  },

  /** Pay a gauntlet entry: the FIRST of each day is free; afterwards RUSH.staminaCost. False
   *  (and no mutation) when stamina is short. Materializes the lazy regen on every spend. */
  spendRushEntry(now = Date.now()): { ok: boolean; free: boolean } {
    const save = store.get();
    const { value, freeAvailable } = this.rushStamina(now);
    const regenMs = RUSH.staminaRegenSec * 1000;
    const base = save.rushStamina.updatedAt > 0 ? save.rushStamina.updatedAt : now;
    // Advance updatedAt by the WHOLE points consumed (the fractional remainder keeps ticking);
    // at/above the ceiling regen was paused, so the next point starts counting from now.
    const materializedAt = value >= RUSH.staminaMax ? now : base + Math.floor(Math.max(0, now - base) / regenMs) * regenMs;
    if (freeAvailable) {
      persist({ ...save, rushStamina: { value, updatedAt: materializedAt, freeDay: dayKey(now) } });
      return { ok: true, free: true };
    }
    if (value < RUSH.staminaCost) return { ok: false, free: false };
    persist({ ...save, rushStamina: { ...save.rushStamina, value: value - RUSH.staminaCost, updatedAt: materializedAt } });
    return { ok: true, free: false };
  },

  /** One-click Bio-Roulette collection (docs/BOSS-RUSH.md §roulette): fold every landed pod
   *  into the account in a single persist, advance the lifetime spore ledger, then re-poll
   *  achievements (the roulette ladder unlocks + toasts through the normal channel). */
  grantRouletteRewards(rewards: RouletteReward[], spores: number): void {
    const save = store.get();
    let next: SaveData = {
      ...save,
      stats: { ...save.stats, rouletteSpores: save.stats.rouletteSpores + Math.max(0, Math.floor(spores)) },
      timeline: pushTimeline(save.timeline, '✺', `Bio-Roulette — ${spores} spore${spores === 1 ? '' : 's'} absorbed`),
    };
    for (const r of rewards) {
      switch (r.kind) {
        case 'cores':
          next = { ...next, shards: next.shards + r.qty, lifetimeShards: next.lifetimeShards + r.qty };
          break;
        case 'ichor':
          next = { ...next, ichor: next.ichor + r.qty, lifetimeIchor: next.lifetimeIchor + r.qty };
          break;
        case 'towerShards':
          next = { ...next, towerShards: { ...next.towerShards, [r.tower]: (next.towerShards[r.tower] ?? 0) + r.qty } };
          break;
        case 'heroShards':
          next = { ...next, heroShards: { ...next.heroShards, [r.hero]: (next.heroShards[r.hero] ?? 0) + r.qty } };
          break;
        case 'scrap':
          next = { ...next, mats: { ...next.mats, scrap: next.mats.scrap + r.qty } };
          break;
        case 'geneEssence':
          next = { ...next, geneEssence: next.geneEssence + r.qty };
          break;
        case 'equipment': {
          const def = ALL_ITEMS[Math.floor(Math.random() * ALL_ITEMS.length)];
          const item = rollItem(Math.random, def, r.rarity, undefined, 'Bio-Roulette');
          next = { ...next, equipment: { ...next.equipment, inventory: [...next.equipment.inventory, item] } };
          break;
        }
        case 'container':
          next = { ...next, pendingContainers: [...next.pendingContainers, { kind: 'loot', rarity: r.rarity }] };
          break;
      }
    }
    persist(next);
    this.evaluateAchievements();
  },

  /** Grant stamina (market packs, future daily rewards) — overflow-capped, regen state kept. */
  grantRushStamina(n: number, now = Date.now()): void {
    const amt = Math.max(0, Math.floor(n));
    if (amt <= 0) return;
    const save = store.get();
    const { value } = this.rushStamina(now);
    const regenMs = RUSH.staminaRegenSec * 1000;
    const base = save.rushStamina.updatedAt > 0 ? save.rushStamina.updatedAt : now;
    const materializedAt = value >= RUSH.staminaMax ? now : base + Math.floor(Math.max(0, now - base) / regenMs) * regenMs;
    persist({
      ...save,
      rushStamina: { ...save.rushStamina, value: Math.min(RUSH.staminaOverflowMax, value + amt), updatedAt: materializedAt },
    });
  },

  /** Guarded Ichor spend — false (and no mutation) when unaffordable. */
  spendIchor(n: number): boolean {
    const amt = Math.max(0, Math.floor(n));
    const save = store.get();
    if (amt <= 0 || save.ichor < amt) return false;
    persist({ ...save, ichor: save.ichor - amt });
    return true;
  },

  /** The market's effective window + deterministic stock + this window's purchase record.
   *  Window = max(clock window, recorded window): rewinding the clock re-shows the SAME
   *  recorded stock with its purchases intact (nothing becomes re-buyable); rolling it
   *  forward is equivalent to waiting. Stock is a pure function of (profile, window, owned
   *  roster) — reloading mid-window shows identical slots. */
  marketState(now = Date.now()): { window: number; stock: MarketSlot[]; bought: string[] } {
    const save = store.get();
    const window = Math.max(marketWindow(now), save.market.window);
    const stock = rollStock(marketSeedOf(save), window, {
      towers: TOWER_ORDER.filter((k) => isTowerUnlocked(save, k)),
      heroes: save.heroUnlocked,
    });
    return { window, stock, bought: save.market.window === window ? save.market.bought : [] };
  },

  /** Call when the Splice Market screen mounts: pays the ONE-TIME starter vial (everyone can
   *  afford their first premium container) and stamps the seen-window (clears the nav badge). */
  openMarket(now = Date.now()): void {
    const save = store.get();
    const window = Math.max(marketWindow(now), save.market.window);
    const starterDue = !save.market.starter;
    if (!starterDue && save.market.seenWindow === window && save.market.window === window) return;
    const bought = save.market.window === window ? save.market.bought : [];
    persist({
      ...save,
      ichor: save.ichor + (starterDue ? ICHOR.starterVial : 0),
      lifetimeIchor: save.lifetimeIchor + (starterDue ? ICHOR.starterVial : 0),
      market: { window, bought, seenWindow: window, starter: true },
      timeline: starterDue ? pushTimeline(save.timeline, '◆', 'Splice Market opened — a starter vial of Ichor') : save.timeline,
    });
  },

  /** Buy one stock slot by id. False (no mutation) when: the id isn't in the CURRENT window's
   *  stock (stale click across a refresh), already bought, unaffordable in its currency, or a
   *  container buy would overflow the pending queue. All effects land in ONE persist. */
  buyMarketSlot(slotId: string, now = Date.now()): boolean {
    const save = store.get();
    const window = Math.max(marketWindow(now), save.market.window);
    const bought = save.market.window === window ? save.market.bought : [];
    if (bought.includes(slotId)) return false;
    const stock = rollStock(marketSeedOf(save), window, {
      towers: TOWER_ORDER.filter((k) => isTowerUnlocked(save, k)),
      heroes: save.heroUnlocked,
    });
    const slot = stock.find((s) => s.id === slotId);
    if (!slot) return false;
    if (slot.pay === 'cores' ? save.shards < slot.price : save.ichor < slot.price) return false;
    if (slot.item.good === 'container' && save.pendingContainers.length >= 999) return false; // queue cap (save sanitizer's bound)
    let next: SaveData = {
      ...save,
      shards: slot.pay === 'cores' ? save.shards - slot.price : save.shards,
      ichor: slot.pay === 'ichor' ? save.ichor - slot.price : save.ichor,
      market: { ...save.market, window, bought: [...bought, slotId], seenWindow: window },
    };
    const it = slot.item;
    switch (it.good) {
      case 'towerShards':
        next = { ...next, towerShards: { ...next.towerShards, [it.kind]: (next.towerShards[it.kind] ?? 0) + it.qty } };
        break;
      case 'heroShards':
        next = { ...next, heroShards: { ...next.heroShards, [it.hero]: (next.heroShards[it.hero] ?? 0) + it.qty } };
        break;
      case 'scrap':
        next = { ...next, mats: { ...next.mats, scrap: next.mats.scrap + it.qty } };
        break;
      case 'geneEssence':
        next = { ...next, geneEssence: next.geneEssence + it.qty };
        break;
      case 'equipment': {
        // The SLOT (rarity + price) is deterministic per window; the concrete piece rolls at
        // purchase like every other equipment grant (meta layer, Math.random).
        const def = ALL_ITEMS[Math.floor(Math.random() * ALL_ITEMS.length)];
        const item = rollItem(Math.random, def, it.equipRarity, undefined, 'Splice Market');
        next = { ...next, equipment: { ...next.equipment, inventory: [...next.equipment.inventory, item] } };
        break;
      }
      case 'container': {
        const def = rarityRegistry.get(it.rarity);
        next = {
          ...next,
          pendingContainers: [...next.pendingContainers, { kind: 'loot', rarity: it.rarity }],
          timeline: pushTimeline(next.timeline, '◈', `Splice Market — ${def?.name ?? it.rarity} Bio-Container acquired`),
        };
        break;
      }
      case 'stamina': {
        // Materialize the lazy regen, then add the pack (overflow-capped) — docs/BOSS-RUSH.md §stamina.
        const regenMs = RUSH.staminaRegenSec * 1000;
        const base = next.rushStamina.updatedAt > 0 ? next.rushStamina.updatedAt : now;
        const elapsed = Math.max(0, now - base);
        const cur = next.rushStamina.value >= RUSH.staminaMax
          ? next.rushStamina.value
          : Math.min(RUSH.staminaMax, next.rushStamina.value + Math.floor(elapsed / regenMs));
        const materializedAt = cur >= RUSH.staminaMax ? now : base + Math.floor(elapsed / regenMs) * regenMs;
        next = { ...next, rushStamina: { ...next.rushStamina, value: Math.min(RUSH.staminaOverflowMax, cur + it.qty), updatedAt: materializedAt } };
        break;
      }
    }
    persist(next);
    return true;
  },

  /** Equip (or clear, uid=null) an owned item into `hero`'s `slot`. PER-HERO: gear never overwrites
   *  another hero's loadout. Single physical item — if `uid` is worn by ANY hero it is unequipped
   *  there first (so equipping is always a legal move). */
  equip(hero: HeroKind, slot: EquipSlot, uid: string | null): void {
    const save = store.get();
    const loadouts: Partial<Record<HeroKind, Loadout>> = {};
    for (const k of Object.keys(save.equipment.loadouts) as HeroKind[]) loadouts[k] = { ...save.equipment.loadouts[k]! };
    if (uid) { // pull the item off whichever hero currently wears it (single instance)
      for (const k of Object.keys(loadouts) as HeroKind[]) {
        for (const s of EQUIP_SLOTS) if (loadouts[k]![s] === uid) loadouts[k]![s] = null;
      }
    }
    loadouts[hero] = { ...(loadouts[hero] ?? emptyLoadout()), [slot]: uid };
    const powerBefore = meta.power().score;
    persist({ ...save, equipment: { ...save.equipment, loadouts } });
    if (uid) {
      const it = save.equipment.inventory.find((i) => i.uid === uid);
      announcePower(`Equipped ${it ? itemDef(it.defId)?.name ?? 'item' : 'item'}`, powerBefore, meta.power().score, false);
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

  /** Apply a whole-item Reforge operation (Enhance / Reroll / Reforge / Upgrade), spending its
   *  material cost. No-ops (Upgrade at cap, Enhance with nothing to raise) don't charge. */
  reforgeOp(uid: string, op: ReforgeOp): boolean {
    const save = store.get();
    const inv = save.equipment.inventory;
    const idx = inv.findIndex((i) => i.uid === uid);
    if (idx < 0) return false;
    const item = inv[idx];
    if (!opAvailable(op, item)) return false; // e.g. Upgrade at cap, or Reforge with every affix locked
    const cost = reforgeCost(op, item);
    if (!canAfford(save.mats, cost)) return false;
    let next: OwnedItem | null;
    const label = { enhance: 'Enhanced', reroll: 'Rerolled tiers', reforge: 'Reforged affixes', upgrade: 'Raised rarity' }[op as 'enhance' | 'reroll' | 'reforge' | 'upgrade'];
    switch (op) {
      case 'enhance': next = enhance(Math.random, item); break;
      case 'reroll': next = reroll(Math.random, item); break;
      case 'reforge': next = reforge(Math.random, item); break;
      case 'upgrade': next = upgrade(Math.random, item); break;
      default: return false; // lock / randomize / salvage have dedicated methods
    }
    if (!next || next === item) return false; // invalid or no-op → don't charge
    next = { ...next, history: [...(item.history ?? []), label] }; // mod log for the Details screen
    const inventory = inv.slice();
    inventory[idx] = next;
    const powerBefore = meta.power().score;
    persist({ ...save, equipment: { ...save.equipment, inventory }, mats: spend(save.mats, cost) });
    // Rerolls/reforges can sidegrade (and unequipped items don't move the account score) — only a
    // real gain announces; no warning otherwise.
    announcePower(`${itemDef(item.defId)?.name ?? 'Item'} — ${label}`, powerBefore, meta.power().score, false);
    return true;
  },

  /** Randomize ONE affix's type (targeted swap), spending its cost. */
  randomizeItemAffix(uid: string, affixIndex: number): boolean {
    const save = store.get();
    const inv = save.equipment.inventory;
    const idx = inv.findIndex((i) => i.uid === uid);
    if (idx < 0) return false;
    const item = inv[idx];
    const cost = reforgeCost('randomize', item);
    if (!canAfford(save.mats, cost)) return false;
    const next = randomizeAffix(Math.random, item, affixIndex);
    if (next === item) return false;
    const inventory = inv.slice();
    inventory[idx] = next;
    persist({ ...save, equipment: { ...save.equipment, inventory }, mats: spend(save.mats, cost) });
    return true;
  },

  /** Toggle the per-affix lock (free) — protects an affix from Reroll / Reforge / Randomize. */
  lockItemAffix(uid: string, affixIndex: number): void {
    const save = store.get();
    const inventory = save.equipment.inventory.map((i) => (i.uid === uid ? toggleAffixLock(i, affixIndex) : i));
    persist({ ...save, equipment: { ...save.equipment, inventory } });
  },

  /** Whether an item is worn by any hero right now (equipped items must be UNEQUIPPED before salvage). */
  isItemEquipped(uid: string): boolean {
    const loadouts = store.get().equipment.loadouts;
    for (const k of Object.keys(loadouts) as HeroKind[]) {
      const l = loadouts[k]; if (l && EQUIP_SLOTS.some((s) => l[s] === uid)) return true;
    }
    return false;
  },

  /** Dismantle an item into crafting feedstock. Guarded (docs/EQUIPMENT.md §safeguards): favorites and
   *  locked items are protected, and an EQUIPPED item must be unequipped first — the UI never offers
   *  salvage in those states, so a `false` here is the defensive backstop. The item + its material
   *  refund are stashed in `lastSalvage` so the dismantle is UNDOABLE until the next salvage. */
  salvageItem(uid: string): boolean {
    const save = store.get();
    const item = save.equipment.inventory.find((i) => i.uid === uid);
    if (!item || item.locked || item.favorite || this.isItemEquipped(uid)) return false;
    const refund = salvageValue(item);
    persist({
      ...save,
      equipment: { ...save.equipment, inventory: save.equipment.inventory.filter((i) => i.uid !== uid) },
      mats: { mutagen: save.mats.mutagen + refund.mutagen, scrap: save.mats.scrap + refund.scrap, catalyst: save.mats.catalyst + refund.catalyst },
      lastSalvage: { item, refund }, // stash for Undo
    });
    return true;
  },

  /** Undo the most recent salvage: restore the item and reclaim the materials it refunded (floored at
   *  0). One-deep — the buffer holds only the last salvage; clears after undoing. Returns success. */
  undoSalvage(): boolean {
    const save = store.get();
    const ls = save.lastSalvage;
    if (!ls) return false;
    persist({
      ...save,
      equipment: { ...save.equipment, inventory: [...save.equipment.inventory, ls.item] },
      mats: {
        mutagen: Math.max(0, save.mats.mutagen - ls.refund.mutagen),
        scrap: Math.max(0, save.mats.scrap - ls.refund.scrap),
        catalyst: Math.max(0, save.mats.catalyst - ls.refund.catalyst),
      },
      lastSalvage: null,
    });
    return true;
  },

  /** Pure guard (docs/EQUIPMENT.md §safeguards): may this owned item be salvaged? False for a
   *  missing, LOCKED, FAVORITE, or currently-EQUIPPED item — the same rule salvageItem enforces,
   *  exposed so the Armory's Quick-Salvage can render protected cards as visually inert. */
  canSalvage(uid: string): boolean {
    const item = store.get().equipment.inventory.find((i) => i.uid === uid);
    return !!item && !item.locked && !item.favorite && !this.isItemEquipped(uid);
  },

  /** The material refund an item WOULD yield (pre-confirm display); null if it's already gone. */
  salvageValueOf(uid: string): { mutagen: number; scrap: number; catalyst: number } | null {
    const item = store.get().equipment.inventory.find((i) => i.uid === uid);
    return item ? salvageValue(item) : null;
  },

  /** Aggregate the yield of salvaging every SALVAGEABLE uid in `uids` (protected ones excluded) —
   *  the "Salvage All (N) · +X scrap" preview the Armory shows BEFORE the player confirms. */
  salvagePreview(uids: string[]): { count: number; refund: { mutagen: number; scrap: number; catalyst: number } } {
    const inv = store.get().equipment.inventory;
    const refund = { mutagen: 0, scrap: 0, catalyst: 0 };
    let count = 0;
    for (const uid of uids) {
      if (!this.canSalvage(uid)) continue;
      const item = inv.find((i) => i.uid === uid);
      if (!item) continue;
      const r = salvageValue(item);
      refund.mutagen += r.mutagen; refund.scrap += r.scrap; refund.catalyst += r.catalyst;
      count++;
    }
    return { count, refund };
  },

  /** Batch-dismantle in ONE write (docs/EQUIPMENT.md §safeguards): protected items are skipped
   *  defensively. The one-deep Undo buffer holds the LAST item of the batch — undo restores that
   *  one (the Armory's confirm copy says so). Returns the count salvaged + the aggregate refund. */
  salvageItems(uids: string[]): { count: number; refund: { mutagen: number; scrap: number; catalyst: number } } {
    const save = store.get();
    const gone: OwnedItem[] = [];
    for (const uid of uids) {
      if (!this.canSalvage(uid)) continue;
      const item = save.equipment.inventory.find((i) => i.uid === uid);
      if (item) gone.push(item);
    }
    const refund = { mutagen: 0, scrap: 0, catalyst: 0 };
    if (gone.length === 0) return { count: 0, refund };
    for (const item of gone) { const r = salvageValue(item); refund.mutagen += r.mutagen; refund.scrap += r.scrap; refund.catalyst += r.catalyst; }
    const goneSet = new Set(gone.map((i) => i.uid));
    const last = gone[gone.length - 1];
    persist({
      ...save,
      equipment: { ...save.equipment, inventory: save.equipment.inventory.filter((i) => !goneSet.has(i.uid)) },
      mats: { mutagen: save.mats.mutagen + refund.mutagen, scrap: save.mats.scrap + refund.scrap, catalyst: save.mats.catalyst + refund.catalyst },
      lastSalvage: { item: last, refund: salvageValue(last) }, // one-deep undo → the batch's last item
    });
    return { count: gone.length, refund };
  },

  /** Mark an item as inspected (opening its Details) — clears its "NEW" card badge. Idempotent. */
  markItemSeen(uid: string): void {
    const save = store.get();
    if (save.equipment.inventory.find((i) => i.uid === uid)?.seen) return; // already seen → no write
    const inventory = save.equipment.inventory.map((i) => (i.uid === uid ? { ...i, seen: true } : i));
    persist({ ...save, equipment: { ...save.equipment, inventory } });
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
  // ── Tutorial (docs/TUTORIAL.md) — permanent completion + resumable progress ──
  tutorialState(): SaveData['tutorial'] {
    return store.get().tutorial;
  },
  isTutorialDone(id: string): boolean {
    return store.get().tutorial.completed.includes(id);
  },
  /** First-time detection: the combat tutorial isn't done AND the save is brand-new (no runs), so a
   * migrated existing player is never force-tutorialized — only a fresh save or an Account Reset. */
  shouldAutoTutorial(): boolean {
    const s = store.get();
    return !s.tutorial.completed.includes('combat') && s.totalRuns === 0;
  },
  /** Persist resumable tutorial progress (pass null to clear it). */
  saveTutorialProgress(progress: TutorialProgress | null): void {
    const s = store.get();
    persist({ ...s, tutorial: { ...s.tutorial, progress } });
  },
  /** Mark a tutorial permanently complete + clear its progress. Idempotent. */
  completeTutorial(id: string): void {
    const s = store.get();
    const completed = s.tutorial.completed.includes(id) ? s.tutorial.completed : [...s.tutorial.completed, id];
    persist({ ...s, tutorial: { ...s.tutorial, completed, progress: null } });
  },
  /** Grant a tutorial's ONE-TIME completion rewards (idempotent — a replay from Settings never
   *  re-grants). Returns the reward summary for the reveal, or null if already paid out. */
  grantTutorialRewards(id: string): TutorialRewardSummary | null {
    const save = store.get();
    if (save.tutorial.rewarded.includes(id)) return null; // already paid — replays never duplicate
    const powerBefore = composePower(accountPowerParts(save)).score;
    const CORES = 150, TSHARD = 15, HSHARD = 20;
    const hero = save.selectedHero;
    const towerShards = { ...save.towerShards };
    for (const k of TOWER_ORDER) towerShards[k] = (towerShards[k] ?? 0) + TSHARD; // a little of every tower currency
    const heroShards = { ...save.heroShards, [hero]: (save.heroShards[hero] ?? 0) + HSHARD };
    const container: PendingContainer = { kind: 'loot', rarity: 'rare' }; // the guaranteed Tutorial Bio-Container
    const item: OwnedItem = { uid: `tut-${Date.now().toString(36)}`, defId: 'w_quill', rarity: 'rare', affixes: [] };
    persist({
      ...save,
      shards: save.shards + CORES,
      lifetimeShards: save.lifetimeShards + CORES,
      towerShards,
      heroShards,
      pendingContainers: [...save.pendingContainers, container],
      equipment: { ...save.equipment, inventory: [...save.equipment.inventory, item] },
      tutorial: { ...save.tutorial, rewarded: [...save.tutorial.rewarded, id] },
    });
    const unlocked = this.evaluateAchievements(); // grants tutorial_complete (completeTutorial ran first)
    return {
      cores: CORES, towerShards: TSHARD, heroShards: HSHARD, containerRarity: 'rare',
      itemName: itemDef('w_quill')?.name ?? 'Weapon',
      achievement: unlocked.includes('tutorial_complete') ? 'Assimilation Protocol' : null,
      powerBefore, powerAfter: composePower(accountPowerParts(store.get())).score,
    };
  },

  /** Grant a mid-lesson MILESTONE reward (docs/TUTORIAL.md) — small, one-time per account,
   *  keyed "tutorialId:checkpointId" so replays never re-grant. Returns what was granted, or null. */
  grantTutorialMilestone(tutorialId: string, checkpointId: string, m: { cores?: number; essence?: number }): { cores: number; essence: number } | null {
    const s = store.get();
    const key = `${tutorialId}:${checkpointId}`;
    if (s.tutorial.milestones.includes(key)) return null;
    const cores = Math.max(0, Math.floor(m.cores ?? 0));
    const essence = Math.max(0, Math.floor(m.essence ?? 0));
    persist({
      ...s,
      shards: s.shards + cores,
      lifetimeShards: s.lifetimeShards + cores,
      geneEssence: s.geneEssence + essence,
      tutorial: { ...s.tutorial, milestones: [...s.tutorial.milestones, key] },
    });
    return { cores, essence };
  },

  // ── Help wiki + What's New (docs/HELP.md) ──────────────────────────────────
  /** The unlocked mechanics for the living Help wiki (locked ones stay hidden). */
  helpMechanics(): MechanicDef[] {
    return unlockedMechanics(store.get());
  },
  /** Mechanics unlocked but not yet announced — drives the "What's New?" queue. */
  whatsNew(): MechanicDef[] {
    return pendingAnnouncements(store.get());
  },
  /** Archive announced mechanics into Help (so they never re-announce, but stay browsable). */
  archiveMechanics(ids: string[]): void {
    const s = store.get();
    const seen = Array.from(new Set([...s.help.seen, ...ids]));
    persist({ ...s, help: { ...s.help, seen } });
  },
  /** One-time prime (App boot): silently archive everything ALREADY unlocked so an existing save
   *  doesn't flood with What's New on first load. A brand-new account primes empty ⇒ it discovers
   *  each mechanic as it unlocks. */
  primeHelp(): void {
    const s = store.get();
    if (s.help.primed) return;
    const seen = Array.from(new Set([...s.help.seen, ...unlockedMechanics(s).filter((m) => !m.core).map((m) => m.id)]));
    persist({ ...s, help: { ...s.help, seen, primed: true } });
  },
  /** First-launch HUD Tour gate: run once, only after the Combat Tutorial, on a fresh account. */
  shouldHudTour(): boolean {
    const s = store.get();
    return !s.help.hudTour && s.tutorial.completed.includes('combat');
  },
  /** Mark the HUD Tour done and (on a genuine FINISH — not a skip) grant its one-time Tutorial
   *  Bio-Container (idempotent — reuses the tutorial reward ledger so it never double-grants).
   *  Returns the reward summary, or null. */
  completeHudTour(grant = true): TutorialRewardSummary | null {
    const s = store.get();
    if (s.help.hudTour) return null;
    persist({ ...s, help: { ...s.help, hudTour: true } });
    const reward = grant ? this.grantTutorialRewards('hudtour') : null;
    // Onboarding (the Combat Tutorial + this HUD Tour) just introduced the foundational systems —
    // and its rewards unlock several at once (shards → Tower Stars, gear → Equipment, a Bio-Container,
    // Genome Cores). Archive everything unlocked so far so the What's New queue doesn't cascade for
    // systems the player was just shown. Genuine PLAY-driven unlocks later (Prestige at Stage 10,
    // new biomes, bosses …) are not yet unlocked here, so they still announce when the player earns them.
    const after = store.get();
    const seen = Array.from(new Set([...after.help.seen, ...unlockedMechanics(after).filter((m) => !m.core).map((m) => m.id)]));
    persist({ ...after, help: { ...after.help, seen } });
    return reward;
  },

  reset(): void {
    saveStore.backup();
    persist(defaultSave());
  },

  /** Developer Reset (docs/DEV-RESET.md) — wipe a specific save SCOPE (or everything). Always
   *  persists a valid, complete, current-version save (re-checksummed by SaveStore.save), so no
   *  orphaned references or version drift. 'everything' also clears backups + preference keys. */
  devReset(id: string): void {
    if (id === 'everything') {
      saveStore.wipeAll(); // remove the main save, all backups, and the index (no recovery — factory-fresh)
      // Clear known preference/flag keys (not a blind clear — never touches unrelated keys).
      // DEVICE_PREF_KEYS is the one registry every device pref must join (state/prefs.ts).
      for (const key of DEVICE_PREF_KEYS) {
        try { localStorage.removeItem(key); } catch { /* private mode / no DOM */ }
      }
      persist(defaultSave());
      return;
    }
    saveStore.backup(); // every other scope is recoverable from the pre-reset backup
    persist(applyDevReset(store.get(), id));
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

  /** Set the highest cleared Campaign stage for a difficulty track — drives the Evolution Cap
   *  (lets the debug panel + tests exercise the cap gating without playing the ladder). */
  debugSetCampaignStage(stage: number, difficulty = 'standard'): void {
    const save = store.get();
    persist({ ...save, campaign: { ...save.campaign, cleared: { ...save.campaign.cleared, [difficulty]: Math.max(0, Math.floor(stage)) } } });
  },

  /** Fully evolve every tower (★max) and unlock the Evolution Cap — to inspect the late-game
   *  visual evolution (lab portraits + battlefield) without the full grind. */
  debugMaxEvolution(): void {
    const save = store.get();
    const towerStars = { ...save.towerStars };
    for (const k of TOWER_ORDER) towerStars[k] = STAR.maxTowerStars;
    persist({ ...save, towerStars, campaign: { ...save.campaign, cleared: { ...save.campaign.cleared, standard: 300 } } });
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
    if (gameEvents.hasListeners('lootContainerEarned')) {
      let banked = save.pendingContainers.length;
      for (const rarity of adv.awarded) gameEvents.emit('lootContainerEarned', { rarity, banked: ++banked, next: adv.state.queue[0] ?? 'common' }); // same fill toast as live play
    }
    return { queue: adv.state, banked: entries };
  },
};
