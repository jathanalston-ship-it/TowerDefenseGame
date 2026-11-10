// Permanent (meta) progression: shards, capped upgrades, and run records.
// Persisted through SaveStore; exposed to React as a reactive store. Also fronts
// the save-management surface (export/import/backup) and debug seeding.

import { liveopsMods, liveopsNow } from '../core/liveops';
import { createStore } from './store';
import { applyDevReset } from './devReset';
import {
  SaveStore,
  defaultIncome,
  defaultSave,
  durableStorageLike,
  parseImport,
  pushTimeline,
  serializeExport,
  sessionStorageLike,
} from '../save/saveStore';
import type { BackupMeta, ImportResult, SaveData } from '../save/saveStore';
import { enterGuestMode, exitGuestMode, guestModeActive } from './guestMode';
import { coresPerMinute, coresPerRun, incomeMeters, tickIncome } from './income';
import { hasSlainMega, highestCampaignStage, isBossRushUnlocked, isCutsceneUnlocked, isDailyUnlocked, threatMaxFor, unlockedCutsceneIds } from '../save/derive';
import { CUTSCENES, cutsceneEffects, cutsceneForMega } from '../core/cutscenes';
import type { CutsceneDef } from '../core/cutscenes';
import { downloadText, readTextFile } from '../save/saveFile';
import { TOWER_DEFS, CAMPAIGN_REWARDS, campaignSurveyBonus, CHESTS, DAILY, ECON, ECONOMY_ADAPTIVE, EQUIP_DROP_CHANCE, HERO_DEFS, HERO_ORDER, HERO_SLOTS, IDLE, INFINITE_REWARD_QUALIFY_FRAC, MASTERY, META_UPGRADES, RUN_CHEST, RUSH, STAR, TOWER_ORDER, campaignStarCap, chestForWave, endlessLootTaper, endlessTaper, heroForkTiers, heroSkillCount, resolveHeroKit, upgradeEffectUnits } from '../core/config';
import { dailyKey, isPrevDayKey } from '../core/daily';
import { offerAvailable, offerValueIchor, premiumOfferById } from '../core/premium';
import { flashOverview, flashPopupCandidate, flashStatus } from './flashOffers';
import { EMERGENCY_PICKS, RESEARCH, activeResearchRewards, researchDayKey, researchRewardById, researchScale, specimenRarity } from '../core/research';
import type { EmergencyPick, ResearchBoost, ResearchCategory, ResearchRewardDef } from '../core/research';
import type { PremiumGrant, PremiumOfferDef } from '../core/premium';
import type { HeroForkTier, HeroUnlockReq, LootRarity, ResolvedHeroKit, UpgradeDef } from '../core/config';
import { primeCatalystCost, primeCost, primeMult } from '../core/prime';
import { IDLE_DROPS, IDLE_NODES, IDLE_NODE_BY_ID, eligibleIdleDrops, idleAccrual, idleGateLabel, idleNodeCost, idleNodeGate, idleSuggestion, mergeIdleReceiptLines, rollIdleHarvest, idleGrantValue } from '../core/idleHarvest';
import type { IdleAccrual, IdleGateContext, IdleGateReq, IdleGrant, IdleNodeDef, IdleReceiptLine } from '../core/idleHarvest';
import { Rng } from '../core/rng';
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
import { PRESTIGE, canMolt, cellsForCycle, imprintedUpgrades, moltImprint, prestigeMult, prestigeStageReq, shardsForCells } from '../core/prestige';
import { ASCENDANT_NODES, ascendantBonuses, ascendantCost, nextAscendantCost } from '../core/ascendant';
import { accumulateStats } from './stats';
import { DEVICE_PREF_KEYS } from './prefs';
import { announcePower, onPowerGain } from './powerEvents';
import { withPowerLogged } from './powerLog';
import { AUTHORED_ACHIEVEMENTS, achievementById, authoredEarned, checkAchievements, rewardFor } from './achievements';
import type { AchievementDef, RunSummary } from './achievements';
import { ALL_ITEMS, CAPPED_GRANT_ITEMS, EQUIP_SLOTS, accountDepth, emptyLoadout, itemDef, loadoutEffects, rollItem, rollItemDrop, rollItemForDepth, teamSetEffects } from '../core/equipment';
import type { EquipSlot, Loadout, OwnedItem } from '../core/equipment';
import { ICHOR, ichorForAchievement, ichorForBossRecord, ichorForDepthRecord, marketWindow, nextRushIchorAt, rollIchorDrop, rollRushVaultRarity, rollStock, vaultsForBossRecord } from '../core/market';
import type { MarketSlot } from '../core/market';
import {
  canAfford, enhance, opAvailable, randomizeAffix, reforge, reforgeCost, reroll, salvageValue, spend, toggleAffixLock, upgrade,
} from '../core/reforge';
import type { ReforgeOp } from '../core/reforge';
import { gameEvents } from '../core/events';
import { canPrestigeFromXp, masteryEvolutionPowerMult, masteryEvolutionTrack, trackLevelFromXp } from '../core/masteryEvolution';
import { rollGeneDiscovery } from '../core/geneDiscovery';
import type { EvolutionGrant, EvolutionSubject } from '../core/masteryEvolution';
import { rewardToast, eventsForPassRewards } from './rewardToast';
import type { RewardEvent } from './rewardToast';
type ToastEvents = Omit<RewardEvent, 'source'>[];
import type { CardDef, CardEffect, CardUnlock } from '../core/cards';
import { CARD_POOL, cardRegistry } from '../core/cards';
import { HERO_SLOT_POWER, composePower, effectsPower, geomean, itemRarityPower, metaExtrasPower } from '../core/power';
import { geneCollectionPowerMult, geneLevel, geneLevelCapForStage, geneMaxLevel } from '../core/geneCards';
import { transcendOptionsFor } from '../core/geneTranscend';
import type { GeneSave } from '../core/geneCards';
import { essenceForDuplicates, essenceTranscendCost, essenceUpgradeCost, rollEssenceDrop } from '../core/geneEssence';
import { GENE_LOADOUT_SLOTS } from '../core/geneLoadout';
import { ADAPT_RESPEC, ANTIGEN, adaptationEffect, adaptNodesFor, adaptPointsEarned, adaptVisualTier, antigenEarned, canPickAdapt, respecCost } from '../core/adaptation';
import type { AdaptNode } from '../core/adaptation';
import { DUP_TISSUE, MULLIGAN_GATE_MEGAS, MULLIGAN_RARITY, MULLIGAN_SLOTS, accountMulliganPower, adaptationOf, ascendCost, emptyMulligan, identityMulligan, isMaxLevel, isMulliganActive, makeSlot, modifierHost, mulliganRegistry, nextRarity, rarityAtLeast, reforgeSlotCount, resolveMulligan, rollRarity, seedFor, upgradeCost as mulliganUpgradeCost } from '../core/mulligan';
import {
  NUCLEUS_CHAMBERS, chamberAdaptation, isChamberActive, nucleusGateProgress, nucleusPower,
  nucleusRegistry, organChamber, organGrowCost, organLevelCap, organUpgradeCost, resolveNucleus,
} from '../core/nucleus';
import type { NucleusGateSnapshot, NucleusGateProgress, ResolvedNucleus, NucleusState } from '../core/nucleus';
import {
  SYMBIOTE_SLOTS, accountSymbiotePower, emptyHeroSymbiote, isSlotActive, resolveHeroSymbiote,
  resonanceOf, slotAdaptation, symbioteGateProgress, symbioteGraftCost, symbioteLevelCap,
  symbioteRegistry, symbioteSeat, symbioteUpgradeCost,
} from '../core/heroSymbiote';
import type { HeroSymbioteState, ResolvedHeroSymbiote, SymbioteGateProgress, SymbioteGateSnapshot } from '../core/heroSymbiote';
import { REFORGE_RARITY, reforgeCost as mulliganReforgeCost, reforgeModById, rollReforgeMod } from '../core/mulliganReforge';
import { exchangeWindow, msToExchangeRefresh, rollExchange } from '../core/ichorExchange';
import type { ExchangeOffer } from '../core/ichorExchange';
import type { MulliganReforgeMod } from '../core/mulliganReforge';
import type { MulliganRarity, MulliganState, ResolvedMulligan } from '../core/mulligan';
import type { PowerParts, PowerScore } from '../core/power';
import { lootBias } from '../core/progressionLoot';
import { resolveDifficulty } from '../core/difficulty';
import { doctrineEconomy, economyFor, lootQualityTier, modeCoreMult, modeLootMult, modeMasteryMult, threatEconomy } from '../core/difficultyDirector';
import { settleThreat } from '../core/threat';
import type { ThreatMode, ThreatOutcome } from '../core/threat';
import { doctrineRank } from '../core/doctrines';
import { FOUNDING_TITLES, sigilById } from '../core/identity';
import { adaptiveIncomeMult, coreShardIncome, lootPointIncome } from '../core/economyDirector';
import { predictBossRush, predictCampaign, predictInfinite, calibrate } from '../core/predict';
import type { RouletteReward } from './bioRoulette';
import type { Prediction } from '../core/predict';
import { unlockedMechanics, pacedAnnouncements } from './mechanics';
import type { MechanicDef } from './mechanics';
import { featureRevealed, unlatchedReveals } from './unlocks';
import { FIRST_LOOP_BY_ID, beatKey } from './firstLoop';
import { BOND, bondCost, classBondsPowerMult } from '../core/classBonds';
import type { BondLevels } from '../core/classBonds';
import type { CombatClass } from '../core/types';
import type { CoachBeatId } from './firstLoop';
import { ACCOUNT_XP, accountLevelReward, depthXpMult, levelFromXp, levelProgress, monthKey, nextMilestone, weekKey } from '../core/accountLevel';
import type { AccountLevelReward } from '../core/accountLevel';
import { genomeAdvice, genomeBreakdown, genomeRankReward, genomeRating, rankFromRating, rankName, romanNumeral } from '../core/genomeRank';
import type { GenomeAdvice, GenomeContribution, GenomeRankReward, GenomeRankView, GenomeSnapshot } from '../core/genomeRank';
import type { TutorialProgress } from '../core/tutorial';
import { collectionView, unlockedRewards, collectionBonusEffects, collectionEconomyBonuses, collectionRankUps, rankSnapshot } from '../core/collection';
import type { CollectionContext, CollectionEconomyBonuses, CollectionReward, CollectionView, CollectionRankUp, CollectionCategoryId } from '../core/collection';
import { cosmeticById, cosmeticRegistry, cultivatePool, nemesisPool, CULTIVATE_COST } from '../core/cosmetics';
import {
  cosmeticAvailability, cosmeticBadges, cosmeticBonus, cosmeticCensus, cosmeticEra, cosmeticFamily,
  cosmeticLore, cosmeticMarket, earnedAutoItems, effectiveWardrobeBonuses, newCosmeticUid, sourceLabel,
  WARDROBE_LANE_INFO, wardrobeItem, wardrobeItemsOf, wardrobeMilestone, WARDROBE_ITEMS, WARDROBE_KINDS, WARDROBE_MILESTONES,
} from '../core/wardrobe';
import type {
  CosmeticAvailability, CosmeticBadgeDef, CosmeticCensus, CosmeticEra, CosmeticMarketRecord,
  WardrobeItemDef, WardrobeKind, WardrobePayload, WardrobeUnlockCtx, WardrobeMilestone,
} from '../core/wardrobe';
import {
  BP, PASS_PASSIVES, levelBuyPrice, levelOf, msToPassEnd, passPassive, passWindow, rewardLabel, seasonForWindow, seasonTracks, xpToReach,
} from '../core/battlePass';
import type { PassReward, SeasonDef } from '../core/battlePass';
import {
  applyRatingFloor, arenaClaimProblem, arenaIdleCapBonusHours, arenaIdleDividend, arenaMatchRewards,
  arenaSeasonIndex, decayedRating, divisionForRating, divisionIndex, ratingDelta, rolledArenaSave,
  ARENA_DIVISIONS, ARENA_SETTLED_CAP,
} from '../core/arena';
import type { ArenaDivisionDef, ArenaMatchClaim, ArenaSave } from '../core/arena';
import { ARENA_PASS, arenaExclusiveLabel, arenaPassLevelOf, arenaPassTrack, arenaSeasonInfo } from '../core/arenaPass';
import type { ArenaExclusiveId, ArenaPassLevelRewards, ArenaSeasonInfo } from '../core/arenaPass';
import type { ArenaBootBundle } from '../core/arenaMatch';
import { bindItem, itemProvenance, parseRefKey, refKey, stampAcquisition } from '../core/itemIdentity';
import type { ProvenanceStamp } from '../core/itemIdentity';
import { cosmeticFamilyKey, equipmentFamilyKey, geneFamilyKey, marketFamily, mulliganFamilyKey } from '../core/marketCatalog';
import { LANE_VALUE, LOGIN, loginIncomeCores, loginTargetValue, milestoneContainer, rollLoginBundle, streakMult } from '../core/loginStreak';
import { PERFECT_WEEK, activeContracts, contractReport, contractSatisfied, contractWeekKey } from '../core/contracts';
import type { ContractRunFacts } from '../core/contracts';
import { MAIN_QUESTLINE, QUESTS, foldCredit, missionById, missionCredit, questById, questComplete, msToWeeklyRotation, weeklyQuestFor, weeklyWindow } from '../core/quests';
import { activeLiveEvents, eventTrack, liveEventLaneModsNow, rowLedgerKey, shopRowView } from '../core/liveEvents';
import { META_CATS, bumpCounter, metaTrack, rewardsFor, toPassRewards, trackView } from './metabolism';
import type { MissionDef, QuestDef, QuestMetaEvent, QuestRunFacts } from '../core/quests';
import { cutsceneDef } from '../core/cutscenes';
import { cutsceneBus } from './navBus';
import { DIRECTIVE_CAPSTONE, accrueDirectives, activeDirectives, capstoneState, directiveBoard, directiveWeekKey } from '../core/directives';
import type { DirectiveReward } from '../core/directives';
import { TROPHY_DEFS, trophyById, trophyOwned, trophySlots, vengeanceTrophyFor } from '../core/trophies';
import type { TrophyOwnCtx } from '../core/trophies';
import { deepenNemesis, nemesisTraits, vengeanceCores } from '../core/nemesis';
import { MAX_VOWS, VOWS, combinedVowWarp, vowArmCost, vowById, vowYieldProduct } from '../core/vows';
import { HIVE_ORGANS, apexDrainPlan, hiveCost, hiveOrganById, strainDrainPlan } from '../core/hiveOrgans';
import type { HiveCostLine, HiveOrganDef, RecipeKey } from '../core/hiveOrgans';
import { HIVE_SYNERGIES, ORGAN_COUPLINGS, hiveProductionBonus, mostProductiveOrgan, synergyLive } from '../core/hiveProduction';
import type { HiveProductionBonus, HiveSynergyDef } from '../core/hiveProduction';
import { labEra, labScore } from '../ui/homeBaseTiers'; // pure model (no DOM) — the hive's era prerequisite
import { sumValues } from '../core/math';
import type { VowDef } from '../core/vows';
import type { DoctrineWarp } from '../core/doctrines';
import { EXPEDITION_DEFS, expeditionById, expeditionMult, expeditionOutcome, expeditionSlotsFor, masteryBonus, rollRareFind, scaleReward, sumRewards } from '../core/expeditions';
import type { ExpeditionDef, ExpeditionOutcome, ExpeditionReward, RareFind } from '../core/expeditions';
import { ALL_SECTORS, CLAIMABLE_TIERS, HOTSPOT_FEED_MULT, INCURSION_BITE, REGIONS, SATURATED_AT, SECTOR_TIERS, TRIBUTE_MIN_TIERS, effectiveLevel, feedInfestation, hotspotSectorId, incursionSectorId, infestationEffects, isEntrenched, isValidInfestTarget, regionFraction, regionHeldTiers, regionOfSector, resolveFeedTarget, resolveIncursionBite, runInfestGain, tierHoldDays, tierOf, tierReward, tributeFor, zeroInDays } from '../core/infestation';
import type { SectorTier } from '../core/infestation';
import type { Release } from '../changelog/types';
import type { TrophyDef } from '../core/trophies';
import type { CosmeticDef, CosmeticTheme } from '../core/cosmetics';
import { BIOMES } from '../core/biomes';
import { BIOME_REGION, recommendedPowerScore, stageWaveCount } from '../core/campaign';
import { CHASSIS, bossDef } from '../core/boss';
import { MEGA, MEGA_HUNT, WEAK_POINT_DEFS, huntRank, huntRankAt, huntRankCores, huntWound, megaBossDef, megaBossIchor, megaExpectedKillSec, megaKillEfficiency } from '../core/megaboss';
import type { MegaKillStat } from '../core/types';
import { admitWrite, guardOk, noteClock, reportConflict, resetSecurity } from '../security/actionGuard';
import { initTabArbiter, stampWriter, tabIsStale } from '../security/tabArbiter';
import { isDebugEnabled } from '../debug/debug';

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
/** The equipped Phenotype themes, resolved for the renderer (GameView threads these into
 *  drawGame + the firing-cue variant map). Empty objects on a fresh save ⇒ default dress. */
export function equippedCosmeticThemes(save: SaveData): {
  towers: Partial<Record<TowerKind, CosmeticTheme>>;
  heroes: Partial<Record<HeroKind, CosmeticTheme>>;
} {
  const towers: Partial<Record<TowerKind, CosmeticTheme>> = {};
  const heroes: Partial<Record<HeroKind, CosmeticTheme>> = {};
  for (const [k, id] of Object.entries(save.cosmetics.towers)) {
    const def = id ? cosmeticById(id) : undefined;
    if (def) towers[k as TowerKind] = def.theme;
  }
  for (const [h, id] of Object.entries(save.cosmetics.heroes)) {
    const def = id ? cosmeticById(id) : undefined;
    if (def) heroes[h as HeroKind] = def.theme;
  }
  return { towers, heroes };
}

/** The equipped Wardrobe payloads by kind ({} on a fresh save ⇒ every consumer's classic look).
 *  UI roots (App/Hub) and the render kit read this; docs/COSMETICS.md §wardrobe. */
export function equippedWardrobe(save: SaveData): Partial<Record<WardrobeKind, WardrobePayload>> {
  const out: Partial<Record<WardrobeKind, WardrobePayload>> = {};
  for (const [kind, id] of Object.entries(save.wardrobe.equipped)) {
    const def = typeof id === 'string' ? wardrobeItem(id) : undefined;
    if (def) out[kind as WardrobeKind] = def.payload;
  }
  return out;
}

/** Battle Pass permanent passives (effect-bearing) + the Perennial stacks as run effects.
 *  Empty on a fresh save ⇒ byte-identical runs (golden-safe). */
function battlePassEffectsOf(save: SaveData): CardEffect[] {
  const out: CardEffect[] = [];
  for (const id of save.battlePass.permanents) {
    const p = passPassive(id);
    if (p?.effect) out.push({ op: 'mul', field: p.effect.field, value: p.effect.value } as CardEffect);
  }
  if (save.battlePass.stacks > 0) {
    out.push({ op: 'mul', field: 'biomassMult', value: 1 + BP.stackBiomassPerStack * save.battlePass.stacks } as CardEffect);
  }
  return out;
}

/** CLAIMED-cosmetic permanent bonuses as run effects (v53, docs/COSMETICS.md §bonuses) —
 *  the saturated per-lane fold expressed in the SAME CardEffect vocabulary as the Battle Pass
 *  permanents. Empty on a fresh save (starters carry no bonus) ⇒ golden-safe, POWER_BASE-safe. */
function wardrobeEffectsOf(save: SaveData): CardEffect[] {
  const eff = effectiveWardrobeBonuses(save.wardrobe.owned);
  const out: CardEffect[] = [];
  if (eff.towerDamage > 0) out.push({ op: 'mul', field: 'towerDamageMult', value: 1 + eff.towerDamage } as CardEffect);
  if (eff.heroDamage > 0) out.push({ op: 'mul', field: 'heroDamageMult', value: 1 + eff.heroDamage } as CardEffect);
  if (eff.biomass > 0) out.push({ op: 'mul', field: 'biomassMult', value: 1 + eff.biomass } as CardEffect);
  if (eff.fireRate > 0) out.push({ op: 'mul', field: 'towerFireRateMult', value: 1 + eff.fireRate } as CardEffect);
  return out;
}

/** Collection codex economy bonuses COMPOSED with the Battle Pass permanent econ passives —
 *  the one read every econ consumer (mastery XP, loot quality, run rewards) goes through.
 *  Neutral on a fresh save (docs/BATTLEPASS.md §permanents). v53 adds the claimed-cosmetic
 *  econ lanes (masteryXp → both XP mults, bossLoot, runReward) — same neutrality guarantee. */
function accountEconomyBonuses(save: SaveData): CollectionEconomyBonuses {
  const out = { ...collectionEconomyBonuses(collectionView(collectionContextOf(save))) };
  for (const id of save.battlePass.permanents) {
    const p = passPassive(id);
    if (!p?.econ) continue;
    if (p.econ.key === 'lootQualityTier') out.lootQualityTier += p.econ.value;
    else out[p.econ.key] *= 1 + p.econ.value;
  }
  const wb = effectiveWardrobeBonuses(save.wardrobe.owned);
  out.towerXpMult *= 1 + wb.masteryXp;
  out.heroXpMult *= 1 + wb.masteryXp;
  out.bossLootMult *= 1 + wb.bossLoot;
  out.campaignRewardMult *= 1 + wb.runReward;
  return out;
}

/** The Battle Pass screen's read-model (docs/BATTLEPASS.md §ui). */
export interface BattlePassView {
  season: SeasonDef;
  window: number;
  endsInMs: number;
  xp: number;
  level: number;
  into: number;
  need: number;
  totalXp: number;
  premium: boolean;
  tracks: ReturnType<typeof seasonTracks>;
  claimedFree: Set<number>;
  claimedPremium: Set<number>;
  claimableFree: number[];
  claimablePremium: number[];
  permanents: Set<string>;
  completions: number; // full clears of THIS season (repeat rotations)
  stacks: number;
  levelPrice: number | null; // Ichor to buy the next level (null at 100)
  adAvailable: boolean;
}

/** The Quest Board's read-model (docs/QUESTS.md §ui). */
export interface QuestsView {
  weekly: {
    quest: QuestDef;
    endsInMs: number;
    progress: Record<string, number>;
    claimed: Set<string>;
    completionClaimed: boolean;
    complete: boolean;
    finaleClaimable: boolean;
    completions: number; // lifetime finale claims of THIS quest def (repeat rotations)
    firstTime: boolean; // the finale's one-time unlocks (cutscene + cosmetic) still ungranted
  };
  main: {
    quest: QuestDef;
    state: 'done' | 'active' | 'locked';
    progress: Record<string, number>;
    claimed: Set<string>;
    complete: boolean;
    finaleClaimable: boolean;
    firstTime: boolean;
  }[];
  missionsDone: number; // lifetime missions completed (the codex count)
}

/** THE cosmetic delivery chokepoint (v53, docs/COSMETICS.md §claiming): EVERY acquisition
 *  lane lands an UNCLAIMED instance in the Specimen Vault — tradable, bonus-less, unequippable
 *  until the player CLAIMS it (meta.claimCosmetic). Stamps the instance's provenance (cos:uid),
 *  records the granted ledger (the once-per-source gate), and queues the arrival reveal on the
 *  FIRST copy only (duplicates are quiet trade goods). Null ⇒ unknown item (caller skips). */
function receiveCosmetic(draft: SaveData, id: string, src: string, now: number): { next: SaveData; first: boolean } | null {
  const def = wardrobeItem(id);
  if (!def) return null;
  const inst = { uid: newCosmeticUid(), item: id, at: now, src };
  const provenance = { ...draft.provenance };
  stampAcquisition(provenance, { cat: 'cosmetic', id: inst.uid }, src, now, arenaSeasonIndex(now));
  const first = !draft.wardrobe.granted.includes(id);
  return {
    first,
    next: {
      ...draft,
      provenance,
      wardrobe: {
        ...draft.wardrobe,
        inventory: [...draft.wardrobe.inventory, inst],
        granted: first ? [...draft.wardrobe.granted, id] : draft.wardrobe.granted,
        pendingReveal: first ? [...draft.wardrobe.pendingReveal, id] : draft.wardrobe.pendingReveal,
      },
    },
  };
}

/** MUSEUM READ-MODEL (docs/COSMETICS.md §provenance) — everything the Collector Panel shows
 *  for ONE cosmetic, joined in one call: the catalog def, its core provenance derivations
 *  (era / availability / badges / lore / family), YOUR relationship to it (claimed, copies
 *  held, the provenance stamp), family completion, and the network census/market seams —
 *  null until the Auction House feeds them (the UI shows an honest placeholder, never an
 *  invented number). Purely derived: nothing here is stored per item, so every future
 *  cosmetic gets a full museum page for free. */
export interface CollectorView {
  def: WardrobeItemDef;
  era: CosmeticEra;
  availability: CosmeticAvailability;
  badges: CosmeticBadgeDef[];
  lore: string | null; // Hive Archives entry (curated — most items have none)
  family: string; // collection shelf (cosmeticFamily — the AH browse taxonomy)
  familyClaimed: number; // catalog ids in this family bound to THIS account
  familyTotal: number; // catalog ids in this family
  claimed: boolean; // bound to this account (wardrobe.owned)
  copiesHeld: number; // unclaimed instances in the Vault (dupes included)
  /** The stamp shown as "your copy's" history: the BOUND copy's permanent stamp
   *  (cos:<itemId>) when claimed, else the newest held instance's (cos:<uid>),
   *  else null (never delivered — a catalog-only museum visit). */
  stamp: ProvenanceStamp | null;
  census: CosmeticCensus | null; // network copy counts (null pre-AH)
  market: CosmeticMarketRecord | null; // auction price history (null pre-AH)
}

/** Apply a PassReward list to a save draft (no persist, no claim ledgers) — THE reward
 *  interpreter, shared by Battle Pass levels and Quest claims (docs/QUESTS.md reuses the pass
 *  reward language). Repeat-safe: an already-owned permanent/phenotype pays the given
 *  replacement bundle instead (boosts never stack across rotations). Cosmetics are the v53
 *  exception: they ALWAYS deliver an unclaimed instance — duplicates are tradable stock for
 *  the future Auction House, never substituted away. `seasonForStack` credits 'stack'
 *  completions (Battle Pass only — quest rewards never author it). */
function applyRewardList(
  draft: SaveData,
  rewards: PassReward[],
  repl: { ichor: number; cores: number },
  seasonForStack: SeasonDef | null,
  provenanceSource = 'reward', // v47: acquisition stamp for granted tradables (docs/TRADING-PREP.md)
): { next: SaveData; lines: PremiumReceiptLine[]; stamina: number; events: ToastEvents } {
  let next = draft;
  // Provenance chokepoint (docs/TRADING-PREP.md §coverage): granted cosmetics stamp their REAL
  // source here; the load-time reconcile remains the backstop for every other path.
  const stampCosmetic = (id: string): void => {
    const provenance = { ...next.provenance };
    stampAcquisition(provenance, { cat: 'cosmetic', id }, provenanceSource, Date.now(), arenaSeasonIndex(Date.now()));
    next = { ...next, provenance };
  };
  const lines: PremiumReceiptLine[] = [];
  const events: ToastEvents = []; // structured toast facts (docs/NOTIFICATIONS.md §reward-toasts)
  let stamina = 0;
  const replacement = (label: string): void => {
    const { ichor, cores } = repl;
    next = {
      ...next,
      ichor: next.ichor + ichor, lifetimeIchor: next.lifetimeIchor + ichor,
      shards: next.shards + cores, lifetimeShards: next.lifetimeShards + cores,
    };
    lines.push({ icon: '⟳', label: `${label} (owned) → ${ichor} Ichor + ${cores} Cores` });
    events.push({ type: 'ichor', qty: ichor }, { type: 'genomeCores', qty: cores });
  };
  for (const r of rewards) {
    switch (r.kind) {
      case 'ichor':
        next = { ...next, ichor: next.ichor + r.qty, lifetimeIchor: next.lifetimeIchor + r.qty };
        lines.push({ icon: '◆', label: `${r.qty} Ichor` });
        events.push({ type: 'ichor', qty: r.qty });
        break;
      case 'cores':
        next = { ...next, shards: next.shards + r.qty, lifetimeShards: next.lifetimeShards + r.qty };
        lines.push({ icon: '⬡', label: `${r.qty} Genome Cores` });
        events.push({ type: 'genomeCores', qty: r.qty });
        break;
      case 'geneEssence':
        next = { ...next, geneEssence: next.geneEssence + r.qty };
        lines.push({ icon: '⌬', label: `${r.qty} Gene Essence` });
        events.push({ type: 'geneEssence', qty: r.qty });
        break;
      case 'hiveMats': // Chitin (docs/ECONOMY.md §localized) — the Front's Fringe lanes pay it
        next = { ...next, hiveMaterials: next.hiveMaterials + r.qty };
        lines.push({ icon: '⬣', label: `${r.qty} Chitin` });
        events.push({ type: 'hiveMaterials', qty: r.qty });
        break;
      case 'mats':
        next = { ...next, mats: { ...next.mats, mutagen: next.mats.mutagen + (r.mutagen ?? 0), scrap: next.mats.scrap + (r.scrap ?? 0), catalyst: next.mats.catalyst + (r.catalyst ?? 0) } };
        lines.push({ icon: '⚒', label: `Materials — ⊕${r.mutagen ?? 0} · ◳${r.scrap ?? 0} · ✷${r.catalyst ?? 0}` });
        if (r.mutagen) events.push({ type: 'mutagen', qty: r.mutagen });
        if (r.scrap) events.push({ type: 'scrap', qty: r.scrap });
        if (r.catalyst) events.push({ type: 'catalyst', qty: r.catalyst });
        break;
      case 'towerShardsAll': {
        // Direct lanes BANK since Prime Strains (docs/PRIME-STRAINS.md §economy): a max-Star
        // tower's shards are spendable again (the Prime ladder), so nothing converts here —
        // only CONTAINER opens still convert maxed duplicates (the deliberate player choice).
        const towerShards = { ...next.towerShards };
        for (const k of towerShardPool(next)) towerShards[k] = (towerShards[k] ?? 0) + r.qtyEach;
        next = { ...next, towerShards };
        lines.push({ icon: '✦', label: `${r.qtyEach} Strain Samples × every tower` });
        events.push({ type: 'towerShards', qty: r.qtyEach, name: 'every tower' });
        break;
      }
      case 'heroShardsAll': {
        const heroShards = { ...next.heroShards };
        for (const k of HERO_ORDER) heroShards[k] = (heroShards[k] ?? 0) + r.qtyEach;
        next = { ...next, heroShards };
        lines.push({ icon: '✦', label: `${r.qtyEach} Apex Genome × every hero` });
        events.push({ type: 'heroShards', qty: r.qtyEach, name: 'every hero' });
        break;
      }
      case 'container':
        next = { ...next, pendingContainers: [...next.pendingContainers, ...Array.from({ length: r.count }, () => ({ kind: 'loot' as const, rarity: r.rarity }))] };
        lines.push({ icon: '◈', label: `${r.count}× ${r.rarity} Bio-Container`, rarity: r.rarity });
        events.push({ type: 'container', qty: r.count, rarity: r.rarity });
        break;
      case 'runCache':
        next = { ...next, pendingContainers: [...next.pendingContainers, ...Array.from({ length: r.count }, () => ({ kind: 'cache' as const, chestId: RUN_CHEST }))] };
        lines.push({ icon: '⬢', label: `${r.count}× Run Cache` });
        events.push({ type: 'runCache', qty: r.count });
        break;
      case 'rushStamina':
        stamina += r.qty; // granted after the persist via the capped pipeline
        lines.push({ icon: '☠', label: `${r.qty} Rush Stamina` });
        events.push({ type: 'stamina', qty: r.qty });
        break;
      case 'bioSpores':
        next = { ...next, bioSpores: Math.min(999, next.bioSpores + r.qty) };
        lines.push({ icon: '✺', label: `${r.qty} Bio-Spore${r.qty === 1 ? '' : 's'} — Roulette ammo` });
        events.push({ type: 'bioSpores', qty: r.qty });
        break;
      case 'mulliganTissue':
        next = { ...next, mulliganTissue: next.mulliganTissue + r.qty };
        lines.push({ icon: '⊛', label: `${r.qty} Mulligan Tissue` });
        events.push({ type: 'mulliganTissue', qty: r.qty });
        break;
      case 'cosmetic': {
        const got = receiveCosmetic(next, r.id, provenanceSource, Date.now());
        if (!got) break;
        next = got.next;
        const def = wardrobeItem(r.id)!;
        lines.push({
          icon: '❖',
          label: got.first ? `${def.name} — in the Specimen Cabinet (claim to bind)` : `${def.name} — duplicate specimen (tradable)`,
          rarity: def.rarity,
        });
        events.push({ type: 'cosmetic', name: def.name });
        break;
      }
      case 'phenotype': {
        // First unowned phenotype of the family (deterministic — claims are replay-stable).
        const pool = cosmeticRegistry.all().filter((d) => d.id.startsWith(`pt_${r.family}_`) || d.id.startsWith(`ph_${r.family}_`));
        const grant = pool.find((d) => !next.cosmetics.owned.includes(d.id));
        if (!grant) { replacement(`${r.family} Phenotype`); break; }
        next = { ...next, cosmetics: { ...next.cosmetics, owned: [...next.cosmetics.owned, grant.id] } };
        stampCosmetic(grant.id);
        lines.push({ icon: '🧬', label: grant.name });
        events.push({ type: 'phenotype', name: grant.name });
        break;
      }
      case 'passive': {
        const def = passPassive(r.id);
        if (!def) break;
        if (next.battlePass.permanents.includes(r.id)) replacement(def.name);
        else {
          next = { ...next, battlePass: { ...next.battlePass, permanents: [...next.battlePass.permanents, r.id] } };
          lines.push({ icon: '♾', label: `${def.name} — permanent (${def.desc})` });
          events.push({ type: 'passive', name: def.name });
        }
        break;
      }
      case 'stack':
        if (!seasonForStack) break;
        next = {
          ...next,
          battlePass: {
            ...next.battlePass,
            stacks: next.battlePass.stacks + 1,
            completions: { ...next.battlePass.completions, [seasonForStack.id]: (next.battlePass.completions[seasonForStack.id] ?? 0) + 1 },
          },
        };
        lines.push({ icon: '❁', label: `Perennial Bloom ×${next.battlePass.stacks} — the season fully cleared` });
        events.push({ type: 'passStack', name: `Perennial Bloom ×${next.battlePass.stacks}` });
        break;
    }
  }
  return { next, lines, stamina, events };
}


/** Live-event challenge crediting (docs/LIVE-EVENTS.md §6): every creditQuests seam (runs,
 *  containers, expeditions, roulette, pass levels) also feeds the ACTIVE trio's challenges.
 *  Crossing a target banks its tokens once (wallet-capped); progress is per `eventId:window`
 *  so rotation retires it structurally. */
function creditEventChallenges(ev: { type: 'run'; facts: QuestRunFacts } | QuestMetaEvent, now: number): void {
  let le = store.get().liveEvents;
  let changed = false;
  for (const a of activeLiveEvents(now)) {
    const cur = a.def.currency;
    if (!cur || !a.def.challenges) continue;
    for (const ch of a.def.challenges) {
      const credit = missionCredit(ch.cond, ev);
      if (credit <= 0) continue;
      const prev = le.progress[a.key]?.[ch.id] ?? 0;
      if (prev >= ch.target) continue;
      const next = Math.min(ch.target, prev + credit);
      le = { ...le, progress: { ...le.progress, [a.key]: { ...(le.progress[a.key] ?? {}), [ch.id]: next } } };
      changed = true;
      if (next >= ch.target) {
        le = { ...le, tokens: { ...le.tokens, [a.key]: Math.min(cur.cap, (le.tokens[a.key] ?? 0) + ch.tokens) } };
        rewardToast.push({ type: 'eventTokens', qty: ch.tokens, name: cur.name, source: `${a.def.name} — ${ch.name}` });
      }
    }
  }
  if (changed) persist({ ...store.get(), liveEvents: le });
}

/** Pass XP a quest claim banks (docs/QUESTS.md §credit) — manual claims and rollover mail
 *  pay the SAME rates, so deferring a claim never costs season progress. */
const QUEST_PASS_XP = { mission: 40, finale: 150 } as const;

// ── Daily Bio-Cache read-models (docs/DAILY-LOGIN.md §ui) ─────────────────────
/** The home widget's read-model — everything the streak presentation shows. */
export interface LoginView {
  claimable: boolean;
  todayKey: string;
  streak: number; // as recorded (today's claim included once claimed)
  nextStreak: number; // the streak the NEXT claim will record
  lifetime: number;
  best: number;
  mult: number; // multiplier on today's cache (claimed or pending)
  target: number; // today's IV budget
  todayLines: { icon: string; label: string }[]; // today's bundle (identical pre/post claim)
  todayMilestone: 'rare' | 'epic' | 'legendary' | null;
  /** §income (v56): today's income-scaled Core line (live pre-claim, frozen once claimed). */
  incomeCores: number;
  /** Today's whole cache in Genome-Core terms (IV lanes at the exchange rate + the income line). */
  valueCores: number;
  tomorrow: { mult: number; target: number; milestone: 'rare' | 'epic' | 'legendary' | null; incomeCores: number; valueCores: number };
  msToReset: number; // to the next UTC midnight
}

/** What claimLogin hands the ceremony. */
export interface LoginReceipt {
  lines: PremiumReceiptLine[];
  streak: number;
  best: number;
  lifetime: number;
  mult: number;
  value: number;
  jackpot: boolean;
  milestone: 'rare' | 'epic' | 'legendary' | null;
}

/** Apply a quest FINALE to a draft (no persist): the repeatable reward list plus — FIRST
 *  completion only — the guaranteed story cutscene + exclusive cosmetic (the `once` ledger).
 *  Repeats substitute the QUESTS.repeatFinale bundle for the unlocks (docs/QUESTS.md §finale).
 *  Also settles the completion ledgers: questCompletions++, weekly.completionClaimed / the
 *  main-lane completions append (which opens the next chapter). */
function grantQuestFinale(draft: SaveData, quest: QuestDef): { next: SaveData; lines: PremiumReceiptLine[]; premiere: boolean; events: ToastEvents } {
  const res = applyRewardList(draft, quest.finaleRewards, QUESTS.repeatFinale, null);
  let next = res.next;
  const lines = [...res.lines];
  const events: ToastEvents = [...res.events];
  let premiere = false;
  const cutKey = `cutscene:${quest.id}`;
  const cosKey = `cosmetic:${quest.id}`;
  if (!next.quests.once.includes(cutKey)) {
    next = { ...next, quests: { ...next.quests, once: [...next.quests.once, cutKey] } };
    lines.push({ icon: '▣', label: `Memory unlocked — ${cutsceneDef(quest.finaleCutscene)?.title ?? quest.finaleCutscene}` });
    premiere = true;
  } else {
    // A repeat completion: the story unlocks stay unlocked, the currency substitution pays once.
    const { ichor, cores } = QUESTS.repeatFinale;
    next = {
      ...next,
      ichor: next.ichor + ichor, lifetimeIchor: next.lifetimeIchor + ichor,
      shards: next.shards + cores, lifetimeShards: next.lifetimeShards + cores,
    };
    lines.push({ icon: '⟳', label: `Story rewards (unlocked) → ${ichor} Ichor + ${cores} Cores` });
    events.push({ type: 'ichor', qty: ichor }, { type: 'genomeCores', qty: cores });
  }
  const item = wardrobeItem(quest.finaleCosmetic);
  if (item && !next.quests.once.includes(cosKey)) {
    next = { ...next, quests: { ...next.quests, once: [...next.quests.once, cosKey] } };
    const got = receiveCosmetic(next, item.id, `Quest — ${quest.name}`, Date.now());
    if (got) next = got.next;
    lines.push({ icon: '❖', label: `${item.name} — quest exclusive, in the Specimen Cabinet`, rarity: item.rarity });
    events.push({ type: 'cosmetic', name: item.name });
  }
  next = {
    ...next,
    quests: {
      ...next.quests,
      questCompletions: { ...next.quests.questCompletions, [quest.id]: (next.quests.questCompletions[quest.id] ?? 0) + 1 },
      ...(quest.lane === 'weekly'
        ? { weekly: { ...next.quests.weekly, completionClaimed: true } }
        : { main: { ...next.quests.main, completions: [...next.quests.main.completions, quest.id] } }),
    },
  };
  return { next, lines, premiere, events };
}

/** Apply ONE pass level's rewards to a save draft (no persist — callers batch + persist) and
 *  mark the level claimed on its track (docs/BATTLEPASS.md §permanents). */
function applyPassRewards(
  draft: SaveData,
  season: SeasonDef,
  rewards: PassReward[],
  track: 'free' | 'premium',
  level: number,
): { next: SaveData; lines: PremiumReceiptLine[]; stamina: number; events: ToastEvents } {
  const res = applyRewardList(draft, rewards, BP.repeatReplacement, season);
  const key = track === 'free' ? 'claimedFree' : 'claimedPremium';
  const next = { ...res.next, battlePass: { ...res.next.battlePass, [key]: [...res.next.battlePass[key], level] } };
  return { events: res.events, next, lines: res.lines, stamina: res.stamina };
}

/** Every equipment def EVER owned (v56 ledger ∪ the live inventory — a save built in a test or
 *  mid-migration without the ledger still credits what it holds). */
export function gearDiscovered(save: SaveData): Set<string> {
  const set = new Set(save.equipment.discovered ?? []);
  for (const it of save.equipment.inventory) set.add(it.defId);
  return set;
}

export function collectionContextOf(save: SaveData): CollectionContext {
  return {
    stats: save.stats,
    // v56: the PERMANENT Gear Codex credit (docs/EQUIPMENT.md §codex) — ever owned, not
    // currently held, so salvaging the last copy never un-discovers an entry.
    ownedDefIds: gearDiscovered(save),
    bestWave: save.bestWave,
    bossesSlain: new Set(save.bossesSlain),
    megaSlain: new Set(save.megaProgress.slain),
    megaPerfect: new Set(save.megaProgress.perfect),
    megaSpeed: new Set(save.megaProgress.speed),
    biomesSeen: biomesSeenOf(save),
    cosmeticsOwned: new Set(save.cosmetics.owned),
    wardrobeOwned: new Set(save.wardrobe.owned),
    mulliganDex: save.mulliganDex ?? {},
    mulliganOrganisms: Object.fromEntries(TOWER_ORDER.map((k) => {
      const st = save.mulligans[k];
      return [k, { active: isMulliganActive(st), locked: st?.locked === true }];
    })),
    questCompletions: save.quests.questCompletions,
    missionsDone: new Set(save.quests.missionsDone),
    lifetimeLogins: save.login.lifetime,
    bestLoginStreak: save.login.best,
    idleHarvests: save.idle.harvests,
    idleLifetimeHours: save.idle.lifetimeHours,
    idleBestHours: save.idle.bestHours,
    idleBlooms: save.idle.blooms,
    geneLevels: Object.fromEntries(Object.entries(save.genes).map(([id, g]) => [id, g.level])),
    genesDiscovered: new Set(save.genesDiscovered ?? []),
    evolutionPrestige: Object.fromEntries(Object.entries(save.masteryEvolution ?? {}).map(([k, st]) => [k, st.prestige])),
    nucleusGrown: Object.fromEntries(Object.entries(save.nucleus?.grown ?? {}).map(([id, g]) => [id, g.level])),
    nucleusAdapted: new Set(save.nucleus?.adapted ?? []),
    ...(() => {
      // Hero Symbiotes (docs/HERO-SYMBIOTES.md §collection): fold every host's grafts into the
      // lifetime codices — best species level across hosts, adaptation classes, resonances, and
      // the fully-evolved champions. Empty on a fresh save ⇒ all four codices read zero.
      const heroSymbioteGrown: Record<string, number> = {};
      const heroAdapted = new Set<string>();
      const heroResonated = new Set<string>();
      const heroEvolved = new Set<string>();
      for (const [kind, st] of Object.entries(save.heroSymbiotes ?? {})) {
        if (!st) continue;
        for (const [id, g] of Object.entries(st.grown)) {
          heroSymbioteGrown[id] = Math.max(heroSymbioteGrown[id] ?? 0, g.level);
        }
        for (const cls of st.adapted ?? []) heroAdapted.add(cls);
        for (const r of st.resonated ?? []) heroResonated.add(r);
        if (st.evolved) heroEvolved.add(kind);
      }
      return { heroSymbioteGrown, heroAdapted, heroResonated, heroEvolved };
    })(),
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
  // First kill of a NEW chassis (any mode) also banks one Bio-Spore — the Roulette's
  // assimilation lane (docs/BOSS-RUSH.md §roulette). Idempotent by the same guard above.
  persist({ ...save, bossesSlain: [...save.bossesSlain, chassis], bioSpores: Math.min(999, save.bioSpores + 1) });
  rewardToast.push({ type: 'bioSpores', qty: 1, source: 'New chassis assimilated' });
});

// NEMESIS revenge (docs/NEMESIS.md): killing YOUR nemesis pays tier-scaled blood-price cores,
// one unowned ABYSSAL phenotype, AND a permanent VENGEANCE trophy for that boss's chassis
// (the spoils of the personal hunt), then the hunt ends. Account-side only — the run is
// untouched. The chassis lands in save.vengeance, which unlocks the vengeance organ.
gameEvents.on('bossKilled', (e) => {
  const save = store.get();
  const nem = save.nemesis;
  if (!nem || nem.defId !== e.defId || !e.final) return; // a splitting nemesis is repaid when its LAST piece dies
  const cores = vengeanceCores(nem.slain);
  const pool = nemesisPool().filter((d) => !save.cosmetics.owned.includes(d.id));
  const grant = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;
  const chassis = bossDef(e.defId)?.chassis;
  const venge = trophyForChassis(chassis);
  const newVenge = chassis && !save.vengeance.includes(chassis);
  persist({
    ...save,
    shards: save.shards + cores,
    lifetimeShards: save.lifetimeShards + cores,
    nemesis: null,
    vengeance: newVenge ? [...save.vengeance, chassis!] : save.vengeance,
    timeline: pushTimeline(save.timeline, '☠', `Revenge — ${bossDef(e.defId)?.name ?? e.defId} repaid in kind (+${cores} Cores${grant ? ' · Abyssal phenotype' : ''}${newVenge && venge ? ` · ${venge.name} claimed` : ''})`),
    cosmetics: grant ? { ...save.cosmetics, owned: [...save.cosmetics.owned, grant.id] } : save.cosmetics,
  });
});

/** The vengeance organ granted for avenging a nemesis of `chassis` (undefined ⇒ unknown chassis). */
function trophyForChassis(chassis: string | undefined): { name: string } | undefined {
  return chassis ? vengeanceTrophyFor(chassis) : undefined;
}

/** Trophy ownership context — the three ledgers that decide what organs a save holds. */
function trophyCtx(s: SaveData): TrophyOwnCtx {
  return { bossesSlain: s.bossesSlain, megaSlain: s.megaProgress.slain, vengeance: s.vengeance };
}
/** How many trophy organs this save owns (drives the rack's slot count). */
function trophyOwnedCount(s: SaveData): number {
  const ctx = trophyCtx(s);
  return TROPHY_DEFS.reduce((n, d) => n + (trophyOwned(d, ctx) ? 1 : 0), 0);
}

/** The account's expected kill time + efficiency for one mega kill (docs/MEGA-BOSS.md §rewards).
 *  The expectation is content-anchored (tier → the campaign band hosting that tier) and POWER-
 *  adjusted, so raw Power RAISES the bar instead of trivially clearing it. */
function megaKillExpectation(save: SaveData, k: MegaKillStat): { expected: number; efficiency: number } {
  const power = composePower(accountPowerParts(save)).score;
  const rec = recommendedPowerScore(Math.max(1, Math.round(k.tier)) * MEGA.campaignEvery, 'standard');
  const expected = megaExpectedKillSec(k.tier, power, rec);
  return { expected, efficiency: megaKillEfficiency(expected, k.killSec) };
}

// First-defeat cutscenes queued by the megaKilled lane, drained into the NEXT finishRun's
// outcome (docs/CUTSCENES.md §autoplay) — Results dismisses into the film. Module state, not
// save state: the unlock itself derives from megaProgress.slain; this is only the "play it
// after THIS summary" signal.
let pendingMegaCutscenes: string[] = [];

// REPLAY PROTECTION (docs/SECURITY.md §replay): a RunResult settles EXACTLY once. The same
// object re-entering finishRun (a double game-over event, an effect re-fire, a navigation
// replay) returns the FIRST settle's outcome without touching the save again — duplicate
// run rewards are structurally impossible. WeakMap on object identity: two legitimate runs
// are two distinct result objects, and settled results are garbage-collected with the run.
const settledOutcomes = new WeakMap<RunResult, RunOutcome>();

// ── Account Level (docs/ACCOUNT-LEVEL.md) — the XP fold + level-up queue ────────────────────
// Level-ups earned OUTSIDE a run settle (buying stars, upgrading genes, molting …) queue here
// and are drained by the menu toaster, so a level-up is always visible wherever it happens.
let pendingAccountLevelUps: AccountLevelUp[] = [];

// ── Genome Rank (docs/GENOME-RANK.md) — promotions queue for the cinematic ─────────────────
// The rating is DERIVED; promotions are detected against the celebrated watermark by
// pollGenomePromotions (finishRun + the menu drain) and celebrated exactly once.
export interface GenomePromotion { index: number; name: string; numeral: string; reward: GenomeRankReward }
let pendingGenomePromotions: GenomePromotion[] = [];
// The What's New BEAT (docs/PROGRESSION-GATING.md §announcements): cards shown since the last finished run.
// Session memory, not save data — a reload simply opens a fresh beat (at most one extra pair of cards).
let announceBeat = { runs: -1, shown: 0 };

/** Fold gained Account XP onto a save DRAFT: lifetime + rolling week/month ledgers, then every
 *  crossed level's procedurally generated reward (cores/essence/shards/mats/ichor/containers/
 *  titles — through the same fields every other grant uses). Pure over the draft; the caller
 *  persists the returned save. Crossed level-ups also queue for the menu toaster.
 *  `periodGained` (default = `gained`) is what the WEEKLY / MONTHLY ledgers count — the run settle
 *  passes its XP BEFORE the depth multiplier (owner decision 2026-11-05: the period boards measure
 *  activity, not depth — docs/ACCOUNT-LEVEL.md §depth); lifetime XP + the level take the full value. */
function foldAccountXp(draft: SaveData, gained: number, now = Date.now(), periodGained = gained): { save: SaveData; delta: AccountXpDelta } {
  const g = Math.max(0, Math.round(gained));
  const pg = Math.max(0, Math.round(periodGained));
  const from = levelFromXp(draft.accountXp.xp);
  if (g === 0) return { save: draft, delta: { gained: 0, from, to: from, levelUps: [] } };
  const wk = weekKey(now);
  const mk = monthKey(now);
  const accountXp = {
    xp: draft.accountXp.xp + g,
    week: { key: wk, xp: (draft.accountXp.week.key === wk ? draft.accountXp.week.xp : 0) + pg },
    month: { key: mk, xp: (draft.accountXp.month.key === mk ? draft.accountXp.month.xp : 0) + pg },
  };
  const to = levelFromXp(accountXp.xp);
  let save: SaveData = { ...draft, accountXp };
  const levelUps: AccountLevelUp[] = [];
  for (let level = from + 1; level <= to; level++) {
    const reward = accountLevelReward(level);
    const towerKind = TOWER_ORDER[(level - 1) % TOWER_ORDER.length];
    const heroKind = HERO_ORDER[(level - 1) % HERO_ORDER.length];
    // Level-up shard grants BANK — even on a max-Star rotation target, shards now fuel the
    // Prime ladder (docs/PRIME-STRAINS.md §economy); only container opens convert duplicates.
    const towerShards = reward.towerShards > 0
      ? { ...save.towerShards, [towerKind]: (save.towerShards[towerKind] ?? 0) + reward.towerShards }
      : save.towerShards;
    const heroShards = reward.heroShards > 0
      ? { ...save.heroShards, [heroKind]: (save.heroShards[heroKind] ?? 0) + reward.heroShards }
      : save.heroShards;
    save = {
      ...save,
      shards: save.shards + reward.cores,
      lifetimeShards: save.lifetimeShards + reward.cores,
      geneEssence: save.geneEssence + reward.essence,
      ichor: save.ichor + reward.ichor,
      lifetimeIchor: save.lifetimeIchor + reward.ichor,
      towerShards,
      heroShards,
      mats: {
        mutagen: save.mats.mutagen + reward.mats.mutagen,
        scrap: save.mats.scrap + reward.mats.scrap,
        catalyst: save.mats.catalyst + reward.mats.catalyst,
      },
      pendingContainers: reward.containers.length > 0
        ? [...save.pendingContainers, ...reward.containers.map((chestId): PendingContainer => ({ kind: 'cache', chestId }))]
        : save.pendingContainers,
      unlockedTitles: reward.titleId && !save.unlockedTitles.includes(reward.titleId)
        ? [...save.unlockedTitles, reward.titleId]
        : save.unlockedTitles,
      timeline: reward.milestone ? pushTimeline(save.timeline, '⬆', `Account Level ${level} — milestone`) : save.timeline,
    };
    levelUps.push({ level, milestone: reward.milestone, reward });
  }
  pendingAccountLevelUps.push(...levelUps);
  return { save, delta: { gained: g, from, to, levelUps } };
}

// Mega Boss ledger (docs/MEGA-BOSS.md §collection) — recorded the moment it happens, mirroring the
// bossKilled pattern: kills / perfect / speed / fastest per def. Idempotent set-adds.
gameEvents.on('megaKilled', (e) => {
  const save = store.get();
  const mp = save.megaProgress;
  // FIRST defeat of this def → its story cutscene premieres after the run's reward summary.
  if (!mp.slain.includes(e.defId)) {
    const cs = cutsceneForMega(e.defId);
    if (cs && !pendingMegaCutscenes.includes(cs.id)) pendingMegaCutscenes.push(cs.id);
  }
  const { expected } = megaKillExpectation(save, e);
  const speed = e.killSec > 0 && e.killSec <= expected;
  const fastestSec = { ...mp.fastestSec };
  if (!(e.defId in fastestSec) || e.killSec < fastestSec[e.defId]) fastestSec[e.defId] = e.killSec;
  persist({
    ...save,
    megaProgress: {
      ...mp,
      slain: mp.slain.includes(e.defId) ? mp.slain : [...mp.slain, e.defId],
      perfect: e.perfect && !mp.perfect.includes(e.defId) ? [...mp.perfect, e.defId] : mp.perfect,
      speed: speed && !mp.speed.includes(e.defId) ? [...mp.speed, e.defId] : mp.speed,
      kills: mp.kills + 1,
      interrupts: mp.interrupts + e.interrupts,
      fastestSec,
    },
  });
});

// Weak-point telemetry (docs/MEGA-BOSS.md §weak-points): lifetime count + distinct kinds.
gameEvents.on('megaWeakPointDown', (e) => {
  const save = store.get();
  const mp = save.megaProgress;
  persist({
    ...save,
    megaProgress: {
      ...mp,
      weakPoints: mp.weakPoints + 1,
      wpKinds: mp.wpKinds.includes(e.kind) ? mp.wpKinds : [...mp.wpKinds, e.kind],
    },
  });
});

// Guest Mode (docs/ACCOUNTS.md §guest-mode): while the tryout flag is up the whole save
// lifecycle rides session-scoped storage — nothing durable exists until the player converts.
const saveStore = new SaveStore(guestModeActive() ? sessionStorageLike() : undefined);
const store = createStore<SaveData>(saveStore.load());
noteClock(); // boot clock high-water check (docs/SECURITY.md §offline) — no-op outside the browser

// Splice Market stock seed (docs/MARKET.md): derived from the profile's createdAt stamp so
// defaultSave() stays deterministic (no rolled field) while every real profile still gets its
// own stock stream. 0 (pre-first-settle) is a valid seed.
const marketSeedOf = (s: SaveData): number => (s.createdAt || 0) >>> 0;

// ── Game Action Security Layer chokepoint (docs/SECURITY.md §pipeline) ──
// EVERY persistent mutation — current and future — funnels through persist(), so flood
// control lives here once and new systems inherit it automatically. In-memory state is
// always exact (store.set is unconditional); only the DISK write coalesces under flood
// (button-mashing, scripted input, a buggy loop), with a trailing flush so the last
// state always lands. The clock high-water mark rides the same chokepoint.
let persistFlushTimer: ReturnType<typeof setTimeout> | null = null;

function persist(next: SaveData): void {
  next = withGearDiscoveries(next);
  store.set(next);
  noteClock();
  // Cross-tab arbitration (docs/SECURITY.md §tabs): once another tab owns the save, THIS
  // tab's disk writes stop — memory stays live for the session, the takeover banner says
  // reload. Writing anyway would clobber the owner and re-pay replayed claims.
  if (tabIsStale()) return;
  if (admitWrite()) {
    saveStore.save(next);
    stampWriter();
    return;
  }
  if (persistFlushTimer === null) {
    persistFlushTimer = setTimeout(() => {
      persistFlushTimer = null;
      if (tabIsStale()) return; // takeover raced the flush — the owner's disk state wins
      saveStore.save(store.get()); // trailing flush — the newest state wins
      stampWriter();
    }, 300);
  }
}

/** Publish an explicit replacement only after its storage transaction has succeeded. */
function publishSaveReplacement(next: SaveData): void {
  if (persistFlushTimer !== null) { clearTimeout(persistFlushTimer); persistFlushTimer = null; }
  noteClock();
  stampWriter();
  store.set(next);
}

/** v56 Gear Codex ledger (docs/EQUIPMENT.md §codex): every def that enters the inventory — by
 *  ANY path (containers, crafting, grants, trades, undo-salvage) — is folded into the permanent
 *  `equipment.discovered` set at this one chokepoint, so the credit can never be missed and never
 *  shrinks. Cheap: only runs when the inventory array actually changed (reference check). */
function withGearDiscoveries(next: SaveData): SaveData {
  const prev = store.get();
  if (next.equipment === prev.equipment || next.equipment.inventory === prev.equipment.inventory) {
    // Inventory untouched — keep the ledger (a rebuilt equipment object must not drop it).
    if (next.equipment.discovered === undefined && prev.equipment.discovered !== undefined) {
      return { ...next, equipment: { ...next.equipment, discovered: prev.equipment.discovered } };
    }
    return next;
  }
  const known = next.equipment.discovered ?? prev.equipment.discovered ?? [];
  const set = new Set(known);
  let added = false;
  for (const it of next.equipment.inventory) if (!set.has(it.defId)) { set.add(it.defId); added = true; }
  if (!added && next.equipment.discovered === known) return next;
  return { ...next, equipment: { ...next.equipment, discovered: added ? [...set] : known } };
}

/** One step of the post-Molt GENOME REBUILD (docs/EVOLUTION-HQ.md §rebuild): buy upgrade `id`
 *  from `level - 1` to `level` for `cost` Genome Cores. */
export interface GenomeRebuildStep { id: string; level: number; cost: number }

/** The save after buying `steps` in order — Cores spent, levels raised — or null when any step no
 *  longer matches the save (level/cost/gate/wallet drifted). PURE (no Account-XP fold: that is a
 *  side-effecting ceremony the apply adds, and it never moves Power). The planner's Power preview
 *  and meta.applyGenomeRebuild both run THIS builder, so the preview IS the outcome. */
export function genomeRebuildSave(save: SaveData, steps: readonly GenomeRebuildStep[]): SaveData | null {
  let shards = save.shards;
  const upgrades = { ...save.upgrades };
  for (const st of steps) {
    const def = META_UPGRADES.find((u) => u.id === st.id);
    if (!def || !upgradeUnlocked(save, def)) return null;
    const lvl = upgrades[st.id] ?? 0;
    if (lvl !== st.level - 1 || lvl >= def.maxLevel) return null;
    const cost = upgradeCost(def, lvl);
    if (cost !== st.cost || cost > shards) return null;
    shards -= cost;
    upgrades[st.id] = lvl + 1;
  }
  return { ...save, shards, upgrades };
}

/** The cosmetic BIND as a pure draft step (docs/COSMETICS.md §claiming) — shared by the single
 *  claim and claim-all so both bind identically: consume the instance, stamp + bind provenance,
 *  join the claimed set, log the timeline. null = unknown instance/def or an already-bound id. */
function claimCosmeticDraft(save: SaveData, uid: string, now: number, logTimeline = true): { next: SaveData; def: WardrobeItemDef; lines: PremiumReceiptLine[] } | null {
  const inst = save.wardrobe.inventory.find((i) => i.uid === uid);
  const def = inst ? wardrobeItem(inst.item) : undefined;
  if (!inst || !def) return null;
  if (save.wardrobe.owned.includes(inst.item)) return null; // already bound — the dupe stays tradable
  const provenance = { ...save.provenance };
  delete provenance[refKey({ cat: 'cosmetic', id: inst.uid })]; // the instance dies with the claim
  stampAcquisition(provenance, { cat: 'cosmetic', id: inst.item }, inst.src, inst.at || now, arenaSeasonIndex(now));
  bindItem(provenance, { cat: 'cosmetic', id: inst.item }); // irreversible: never tradable again
  const next: SaveData = {
    ...save,
    provenance,
    timeline: logTimeline ? pushTimeline(save.timeline, '❖', `Assimilated — ${def.name} bound to the genome`) : save.timeline,
    wardrobe: {
      ...save.wardrobe,
      inventory: save.wardrobe.inventory.filter((i) => i.uid !== uid),
      owned: [...save.wardrobe.owned, inst.item], // stays unseen → the Wardrobe's NEW badge
    },
  };
  const lines: PremiumReceiptLine[] = [{ icon: '❖', label: `${def.name} — permanently bound`, rarity: def.rarity }];
  const bonus = cosmeticBonus(def);
  if (bonus) {
    const info = WARDROBE_LANE_INFO[bonus.lane];
    lines.push({ icon: info.icon, label: `+${parseFloat((bonus.value * 100).toFixed(2))}% ${info.label} — forever` });
  }
  return { next, def, lines };
}

/** v56 Genome Rank PEAK Power (docs/GENOME-RANK.md §peak): raise `target`'s stored peak to the
 *  live Power of `from` (the same save, or the pre-Molt one). Monotone; returns `target`
 *  untouched (same reference) when the peak already covers it. */
function withPeakPower(target: SaveData, from: SaveData): SaveData {
  const live = composePower(accountPowerParts(from)).score;
  const peak = Math.max(target.genomeRank.peakPower ?? 0, from.genomeRank.peakPower ?? 0);
  if (live <= peak && (target.genomeRank.peakPower ?? 0) === peak) return target;
  return { ...target, genomeRank: { ...target.genomeRank, peakPower: Math.max(peak, live) } };
}

/** v56 income ledger tick (docs/ONE-MORE-RUN.md §eta): fold this settle's meter readings into the
 *  per-run moving average. The codex count is supplied here (it needs meta's collection context). */
function withIncome(settled: SaveData, before: SaveData): SaveData {
  const specimens = collectionView(collectionContextOf(settled)).discovered;
  // The run's OWN Core pay (the settle adds exactly shardsEarned to the Molt cycle) — a direct
  // sample, so achievement/rank/login grants never read as run income.
  const runCores = Math.max(0, settled.prestige.cycleShards - before.prestige.cycleShards);
  return { ...settled, income: tickIncome(before.income ?? defaultIncome(), incomeMeters(settled, { specimens }), settled.totalRuns, { runCores }) };
}

// Arm the cross-tab arbiter once at boot (window-gated inside; inert under Node). A takeover
// is surfaced through the security block feed — SecurityPulse renders it as a persistent
// "reload to continue" notice rather than a transient pulse.
initTabArbiter(() => reportConflict('save.tabConflict'));

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
  // Field Research boosts (docs/RESEARCH.md §boosts): an armed one-run biomass boost folds
  // here; finishRun consumes the arm, so exactly one FINISHED run benefits. ×1 when none.
  for (const id of save.research.pendingBoosts) {
    const b = researchRewardById(id)?.boost;
    if (b?.biomassMult) m.biomassMult *= b.biomassMult;
  }
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
  // Team SET bonuses (pooled across the FIELDED roster — the sets a run can actually activate, incl.
  // the 4-piece tier) fold in ONCE, mirroring how the sim applies them (game.foldHeroEquip).
  mult *= effectsPower(teamSetEffects(inv, fieldedLoadout(save).map((k) => loadoutOf(save, k))));
  return mult;
}

/** The account Power contributors folded from the save (docs/POWER-SCORE.md). `temporary`
 * carries in-run buffs (gene cards / branches); it is 1 for the at-rest account view. Prestige
 * is already inside metaModifiers.towerDamageMult (the P bucket), so it counts via `meta`. */
/** The Genome-UPGRADE-dependent factor of PowerParts.meta — the ONLY part of the account Power
 *  that reads save.upgrades: the tower-damage proxy (metaModifiers, which also carries the P
 *  bucket) × the genome run-effects × the hero/biomass/integrity/slot extras. accountPowerParts
 *  multiplies it in first (same evaluation order as before the extraction); the Evolution HQ
 *  rebuild planner scores many upgrade maps against ONE full parts computation with it
 *  (docs/EVOLUTION-HQ.md §rebuild). */
export function genomeUpgradeFactor(save: SaveData): number {
  const mm = metaModifiers(save);
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
  return mm.towerDamageMult * effectsPower(genomeRunEffects(save)) * metaExtras;
}

export function accountPowerParts(save: SaveData, temporary = 1): PowerParts {
  // Mulligan-EXCLUDED tower progress for the towers bucket: the Mulligan's Power is credited to its
  // own dedicated bucket below, never double-counted through the towers geomean (docs/MULLIGANS.md).
  const tp = towerProgress(save, false);
  const hp = heroProgress(save);
  // Collection completion bonuses are permanent account strength → their offense folds into `meta`.
  const collectionMult = effectsPower(collectionBonusEffects(collectionView(collectionContextOf(save))));
  // Battle Pass permanents + Perennial stacks are the same class of strength (docs/BATTLEPASS.md).
  const battlePassMult = effectsPower(battlePassEffectsOf(save));
  // Claimed-cosmetic permanent bonuses (v53, docs/COSMETICS.md §bonuses) — ×1 on a fresh save
  // (starters carry no bonus), so POWER_BASE holds and only CLAIMING moves the needle.
  const wardrobeMult = effectsPower(wardrobeEffectsOf(save));
  // Unlocked hero slots beyond the first are account strength (a fielded extra champion) — the
  // hero-slot twin of the tower bonusSlots fold (POWER-AUDIT.md).
  const heroSlotMult = 1 + HERO_SLOT_POWER * Math.max(0, heroSlotsUnlocked(save) - 1);
  // Completed Mastery Evolution loops (docs/MASTERY.md §evolution track) are the same class of
  // permanent strength — ×1 while nothing has prestiged, so v43 saves read identically.
  const evolutionMult = masteryEvolutionPowerMult(save.masteryEvolution);
  // Class Bond levels (v58, docs/CLASS-BONDS.md) — permanent strength like any upgrade; ×1 with none.
  const bondsMult = classBondsPowerMult(save.classBonds);
  return {
    // Every PERMANENT strength source lands in `meta`: upgrades (tower-dmg proxy × genome run-effects ×
    // the hero/biomass/integrity/slot axes), prestige/ascendant, and collection bonuses — so ANY
    // upgrade raises Power. Towers/heroes/equipment/temporary are the other buckets.
    // Permanent gene-card upgrades are account strength → they fold into `meta` via the scale-safe
    // gene collection multiplier (1 until Task 4 authors upgrade levels; docs/GENE-EVOLUTION.md).
    meta: genomeUpgradeFactor(save) * collectionMult * battlePassMult * wardrobeMult * geneCollectionPowerMult(save.genes) * heroSlotMult * evolutionMult * bondsMult,
    towers: geomean(TOWER_ORDER.map((k) => tp[k].damageMult)),
    heroes: geomean(HERO_ORDER.map((k) => hp[k].damageMult)),
    equipment: equipmentPower(save),
    // Codex completion across categories (1 on a fresh account ⇒ POWER_BASE preserved).
    collection: collectionView(collectionContextOf(save)).power,
    // Mulligan organisms (docs/MULLIGANS.md) — a dedicated, separately-inspectable bucket. Each
    // tower's Mulligan is 1 until all three slots are filled ⇒ 1 on a fresh account ⇒ POWER_BASE.
    // × the Nucleus's own organism (docs/NUCLEUS.md) and every hero's Symbiotes
    // (docs/HERO-SYMBIOTES.md) — same grafted-organism pillar, same bucket; each factor is
    // exactly 1 while nothing is complete, so a fresh account still reads POWER_BASE.
    mulligans: accountMulliganPower(TOWER_ORDER.map((k) => [save.mulligans?.[k], TOWER_DEFS[k].combatClass] as const)) * nucleusPower(save.nucleus)
      * accountSymbiotePower(HERO_ORDER.map((k) => save.heroSymbiotes?.[k])),
    temporary,
  };
}

/** UTC day key (ISO date) — the Boss Rush free-daily-entry ledger (docs/BOSS-RUSH.md §stamina). */
function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Up to two soft guidance lines for the prediction panel — surfaces the weakest lever without ever
 *  dictating a move (docs/PREDICTION.md). Priority order; capped at two so it never overwhelms.
 *  Each line carries the screen it names (`nav`) so the panel renders a "Go ▸" link. */
function predictionRecommendations(save: SaveData, mode: 'campaign' | 'infinite' | 'bossRush', estimate: number): { text: string; nav?: string }[] {
  const out: { text: string; nav?: string }[] = [];
  const cleared = highestCampaignStage(save);
  const maxTowerStars = Math.max(0, ...TOWER_ORDER.map((k) => save.towerStars[k] ?? 0));
  const gear = equipmentPower(save);
  const molts = save.prestige?.molts ?? 0;
  if (mode === 'campaign' && cleared < estimate - 2) out.push({ text: 'Campaign progression recommended — you can push several stages deeper.', nav: 'campaign' });
  // Lever advice only names a wing the player can actually open (never advise a sealed screen).
  if (maxTowerStars === 0 && featureRevealed(save, 'towers')) out.push({ text: 'Tower Stars will significantly improve success — buy one in the Tower Lab.', nav: 'towers' });
  if (gear <= 1.01 && featureRevealed(save, 'equipment')) out.push({ text: 'Equipment quality is below expected — gear up a hero in the Armory.', nav: 'equipment' });
  if (molts === 0 && cleared >= 10) out.push({ text: 'Consider Prestiging for a permanent, compounding power multiplier.', nav: 'evolution' });
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
  // Armory collection (+ Battle Pass quality permanents) tilt loot richer (+0 on a fresh account).
  const codexLoot = accountEconomyBonuses(save).lootQualityTier;
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
// Cell mint for the molt THIS save could commit right now: the cycle's square-root gain ×
// Ascendant Resonance × the armed MOLT VOW wager product (docs/VOWS.md — ×1 with none armed).
// Used by BOTH the preview (prestigeView) and the mint itself (molt), so what the dialog
// promises is exactly what the molt pays.
function moltGain(save: SaveData): number {
  return Math.floor(cellsForCycle(save.prestige.cycleShards) * ascendantBonuses(save.prestige.nodes).cellGainMult * vowYieldProduct(save.prestige.vows));
}

// The save a Molt minting `gain` cells leaves behind (before the account-XP/timeline bookkeeping):
// banked Cores → 0, Genome upgrades → the MOLT IMPRINT's kept levels, cells credited, cycle reset.
// ONE builder for the mint (molt) and its Power preview (moltPowerPreview) — preview == outcome.
function moltedSave(save: SaveData, gain: number): SaveData {
  return {
    ...save,
    shards: 0, // reset the engine: banked Shards …
    upgrades: imprintedUpgrades(save.upgrades, moltImprint(save.prestige.molts)), // … and all but the Imprint's share of every upgrade's levels
    prestige: {
      cells: save.prestige.cells + gain,
      lifetimeCells: save.prestige.lifetimeCells + gain,
      cycleShards: 0,
      molts: save.prestige.molts + 1,
      nodes: save.prestige.nodes, // the Ascendant Tree is permanent — kept across Molts
      vows: [], // vows SETTLE here — the wager paid into `gain`; arm costs are never refunded
    },
  };
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
  const cb = accountEconomyBonuses(save); // codex + Battle Pass permanents, one composed read
  const econDiff = economyFor(difficulty);
  const modeMult = modeMasteryMult({ endless: !!mode.endless, campaign: !!mode.campaign, bossRush: !!mode.bossRush });
  const base = modeMult * econDiff.xpMult * asc.masteryXpMult;
  return { tower: base * cb.towerXpMult, hero: base * cb.heroXpMult * asc.heroMasteryXpMult }; // Legacy: a hero-only lever on the shared base
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

/** Tower Shards a tower can still SPEND on its ladder: its unlock price while locked + every
 *  remaining ★ up to the top. A bank already at this level can never use another shard (★ tiers
 *  past the Campaign Evolution Cap wait on stages 120–300 — hundreds of hours deep), so container
 *  opens treat shards beyond it as duplicates (docs/SHARD-ECONOMY.md §7 surplus). 0 at ★max — the
 *  original "maxed → convert" rule is the special case. */
export function towerShardNeed(save: SaveData, kind: TowerKind): number {
  let need = isTowerUnlocked(save, kind) ? 0 : (TOWER_DEFS[kind]?.unlockShards ?? 0);
  for (let s = save.towerStars[kind] ?? 0; s < STAR.maxTowerStars; s++) need += towerStarCost(s);
  return need;
}

export function nextStarCost(save: SaveData, kind: TowerKind): number | null {
  const stars = save.towerStars[kind] ?? 0;
  if (stars >= STAR.maxTowerStars) return null;
  return towerStarCost(stars); // cost ladder only; the Campaign Evolution Cap is enforced in buyStar
}

/** The next PRIME level's price (docs/PRIME-STRAINS.md), or null while the ★ ladder is
 *  unfinished — Prime is the CONTINUATION of the star seam, never a bypass. */
export interface PrimeQuote { toLevel: number; shards: number; catalyst: number }
export function nextTowerPrimeCost(save: SaveData, kind: TowerKind): PrimeQuote | null {
  if ((save.towerStars[kind] ?? 0) < STAR.maxTowerStars) return null;
  const level = save.towerPrime?.[kind] ?? 0;
  return { toLevel: level + 1, shards: primeCost('tower', level), catalyst: primeCatalystCost(level + 1) };
}
export function nextHeroPrimeCost(save: SaveData, kind: HeroKind): PrimeQuote | null {
  if ((save.heroStars[kind] ?? 0) < STAR.maxStars) return null;
  const level = save.heroPrime?.[kind] ?? 0;
  return { toLevel: level + 1, shards: primeCost('hero', level), catalyst: primeCatalystCost(level + 1) };
}

/** Total PRIME levels across the account (profile / collection surface). */
export function totalPrimeLevels(save: SaveData): number {
  let n = 0;
  for (const k of TOWER_ORDER) n += save.towerPrime?.[k] ?? 0;
  for (const k of HERO_ORDER) n += save.heroPrime?.[k] ?? 0;
  return n;
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
  const def = HERO_DEFS[kind];
  // Milestone-gated hero (Vitriol): EARNED by a feat, not bought — owned the moment its
  // requirement is met (no Shard claim). The unique gate, distinct from the Shard heroes.
  if (def?.unlock) return heroMilestoneMet(save, def.unlock);
  const cost = def?.unlockShards ?? 0;
  if (cost <= 0) return true; // starter
  return (save.heroUnlocked ?? []).includes(kind);
}

/** Whether a hero's data-driven unlock milestone (HeroDef.unlock) is satisfied by the save. A
 *  new gate kind is one `case` here (+ one HeroUnlockReq variant in config) — future-proof. */
function heroMilestoneMet(save: SaveData, req: HeroUnlockReq): boolean {
  switch (req.kind) {
    // Vitriol — DISTINCT chassis assimilated (bossesSlain is chassis-keyed). Every campaign
    // stage spawns a framework boss, so a plain "any boss" check dies on stage 1 — breadth
    // across the enemy's war-forms is the real feat.
    case 'bossSlain': return save.bossesSlain.length >= req.count;
    case 'infiniteDepth': return save.bestWave >= req.wave; // Revenant — earned from the endless deep
    case 'molts': return save.prestige.molts >= req.count; // Knell — cast from the hive's first rebirth
    case 'megaSlain': return save.megaProgress.slain.length >= req.count; // Riptide — condensed from fallen leviathans (distinct defs)
    case 'lifetimeKills': return save.stats.lifetimeKills >= req.count; // Carrion — fed by the mountain of your dead
    case 'arena': return save.arena.exclusives.includes('hero:chimera'); // Chimera — the Pass level-100 crown IS the milestone (docs/ARENA.md §6)
  }
}

/** 0..1 progress toward a milestone gate (the Hero Hall's concrete-goal bar for earned heroes). */
function heroMilestoneProgress(save: SaveData, req: HeroUnlockReq): number {
  switch (req.kind) {
    case 'bossSlain': return Math.min(1, save.bossesSlain.length / req.count);
    case 'infiniteDepth': return Math.min(1, save.bestWave / req.wave);
    case 'molts': return Math.min(1, save.prestige.molts / req.count);
    case 'megaSlain': return Math.min(1, save.megaProgress.slain.length / req.count);
    case 'lifetimeKills': return Math.min(1, save.stats.lifetimeKills / req.count);
    case 'arena': return Math.min(1, arenaPassLevelOf(save.arena.passXp).level / ARENA_PASS.levels); // the season's climb toward the crown
  }
}

/** The heroes hero-Shard drops accumulate toward: still-LOCKED heroes that unlock WITH Shards, so
 *  their "42 / 100" bar fills visibly. MILESTONE heroes (Vitriol/Revenant — earned by a feat, never
 *  bought) are excluded — they can't spend unlock-shards, so pooling them would only starve the real
 *  Shard-unlock heroes. When this is empty (the unlock queue is drained), hero-Shard drops fall back
 *  to EVERY hero (HERO_IDS) and fund Stars — so a milestone hero earns Star shards like the rest. */
export function heroShardUnlockPool(save: SaveData): HeroKind[] {
  return HERO_ORDER.filter((k) => !isHeroUnlocked(save, k) && (HERO_DEFS[k].unlockShards ?? 0) > 0);
}

/** Whether the account owns tower `kind` (docs/TOWERS.md §expansion). Starters (TowerDef without
 *  an unlockShards gate — the launch five) are always owned; a gated tower is owned once claimed
 *  with its own Tower Shards. ARENA EXCLUSIVES are owned ONLY via the Pass crown's roster grant
 *  (never starters, despite having no shard price — docs/ARENA.md §6). */
export function isTowerUnlocked(save: SaveData, kind: TowerKind): boolean {
  if (TOWER_DEFS[kind]?.arenaExclusive) return (save.towerUnlocked ?? []).includes(kind);
  const cost = TOWER_DEFS[kind]?.unlockShards ?? 0;
  if (cost <= 0) return true; // starter
  return (save.towerUnlocked ?? []).includes(kind);
}

/** Whether a locked tower's progression GATE is cleared — i.e. its unlock shards may DROP. Towers with
 *  no `unlockStage` (maw/chrysalis/effigy) are always met; a deep-gated tower (Resonance Coil / Marrow
 *  Siphon) needs its campaign stage cleared first ("shards only start dropping once the gate is met").
 *  ARENA EXCLUSIVES never drop shards at all (docs/ARENA.md §6 — the Pass crown is the only path). */
export function towerShardGateMet(save: SaveData, kind: TowerKind): boolean {
  if (TOWER_DEFS[kind]?.arenaExclusive) return false;
  const stage = TOWER_DEFS[kind]?.unlockStage ?? 0;
  return stage <= 0 || highestCampaignStage(save) >= stage;
}

/** The tower kinds whose shards may drop from loot right now: everything whose campaign gate is met.
 *  Passed to the loot rollers so a gated tower's shards never leak before the player reaches its stage. */
/** Fold ONE Mastery Evolution grant into the save (docs/MASTERY.md §evolution track). Every
 *  good flows through its real lane — shards bank on the unit, containers queue for the
 *  Genetic Vault — so downstream systems (Prime, vault ceremonies, Power) see nothing new. */
function applyEvolutionGrant(save: SaveData, subject: EvolutionSubject, unit: string, g: EvolutionGrant): SaveData {
  switch (g.kind) {
    case 'unitShards':
      return subject === 'tower'
        ? { ...save, towerShards: { ...save.towerShards, [unit]: (save.towerShards[unit as TowerKind] ?? 0) + g.amount } }
        : { ...save, heroShards: { ...save.heroShards, [unit]: (save.heroShards[unit as HeroKind] ?? 0) + g.amount } };
    case 'genomeCores':
      return { ...save, shards: save.shards + g.amount, lifetimeShards: save.lifetimeShards + g.amount };
    case 'geneEssence':
      return { ...save, geneEssence: save.geneEssence + g.amount };
    case 'scrap':
      return { ...save, mats: { ...save.mats, scrap: save.mats.scrap + g.amount } };
    case 'mutagen':
      return { ...save, mats: { ...save.mats, mutagen: save.mats.mutagen + g.amount } };
    case 'catalyst':
      return { ...save, mats: { ...save.mats, catalyst: save.mats.catalyst + g.amount } };
    case 'container':
      return { ...save, pendingContainers: [...save.pendingContainers, { kind: 'loot', rarity: g.tier === 1 ? 'rare' : g.tier === 2 ? 'epic' : 'legendary' }] };
    case 'ichor':
      return { ...save, ichor: save.ichor + g.amount };
  }
}


/** Structured toast events for an Evolution Track claim (docs/NOTIFICATIONS.md §reward-toasts). */
function evolutionToastEvents(grants: EvolutionGrant[], unitName: string, subject: EvolutionSubject): ToastEvents {
  const sums = new Map<string, number>();
  let containers = 0;
  for (const g of grants) {
    if (g.kind === 'container') containers++;
    else sums.set(g.kind, (sums.get(g.kind) ?? 0) + g.amount);
  }
  const ev: ToastEvents = [];
  const typeFor: Record<string, string> = {
    unitShards: subject === 'tower' ? 'towerShards' : 'heroShards',
    genomeCores: 'genomeCores', geneEssence: 'geneEssence',
    scrap: 'scrap', mutagen: 'mutagen', catalyst: 'catalyst', ichor: 'ichor',
  };
  for (const [k, n] of sums) ev.push({ type: typeFor[k] ?? k, qty: n, ...(k === 'unitShards' ? { name: unitName } : {}) });
  if (containers > 0) ev.push({ type: 'container', qty: containers });
  return ev;
}

export function towerShardPool(save: SaveData): TowerKind[] {
  return TOWER_ORDER.filter((k) => towerShardGateMet(save, k));
}

// NOTE (docs/PRIME-STRAINS.md §economy): the direct-lane duplicate conversion that used to live
// here (settleDirectShardGrants — the pre-Prime "shard leak" fix) is RETIRED. A max-Star unit's
// shards are spendable again (the Prime ladder), so every non-container lane — level-ups,
// quest/season/pass claims, milestones, premium packs — now BANKS its grant. Container opens
// keep their richer rarity-scaled duplicate conversion: that is the deliberate tension — hold
// direct income for Prime, or crack containers and take the Essence.

/** Whether a gene card's progression gate is satisfied (ungated ⇒ always true). Drives which gated
 *  cards are injected into a run's draft pool (RunOptions.unlockedCardIds). */
export function cardUnlocked(save: SaveData, def: CardDef): boolean {
  return progressionUnlockMet(save, def.unlock);
}

/** THE shared progression-gate evaluator — gene cards AND Genome upgrades speak the same unlock
 *  vocabulary (CardUnlock), so a new gate kind lands here once and every gated surface gains it. */
export function progressionUnlockMet(save: SaveData, u: CardUnlock | undefined): boolean {
  if (!u) return true;
  switch (u.kind) {
    case 'campaignStage': return highestCampaignStage(save) >= u.stage;
    case 'bestWave': return save.bestWave >= u.wave;
    case 'towerUnlocked': return isTowerUnlocked(save, u.tower);
    case 'totalRuns': return save.totalRuns >= u.runs;
    case 'lifetimeKills': return save.stats.lifetimeKills >= u.kills;
    case 'bossesSlain': return save.bossesSlain.length >= u.bosses;
    case 'totalBiomass': return save.stats.totalBiomass >= u.biomass;
  }
}

/** Whether a Genome upgrade's progression gate is satisfied (ungated ⇒ always). Purchase-enforced
 *  in buyUpgrade; the Evolution HQ renders locked cards with their requirement. */
export function upgradeUnlocked(save: SaveData, def: UpgradeDef): boolean {
  return progressionUnlockMet(save, def.unlock);
}

/** The ids of GATED gene cards the account has unlocked — injected into a run so they can be drafted
 *  (ungated cards are always in the pool). Empty for a fresh account ⇒ the golden pool is unchanged. */
export function unlockedCardIds(save: SaveData): string[] {
  return CARD_POOL.filter((c) => c.unlock && cardUnlocked(save, c)).map((c) => c.id);
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
  cost: number; // Hero Shards to unlock (0 for starters / already-owned / milestone-gated)
  shards: number; // Hero Shards banked toward this hero
  progress: number; // 0..1 toward the unlock threshold (1 when owned)
  canUnlock: boolean; // locked AND enough shards banked to claim now (never for milestone heroes)
  requirement?: string; // milestone-gated heroes (Vitriol): the feat that unlocks it, not Shards
}

/** The Hero Collection roster view: every hero with ownership + unlock progress ("42 / 100"), so
 *  a locked hero reads as a concrete, visible goal. Pure over the save; future-proof (reads the
 *  registry order, so a new hero just appears). A milestone-gated hero (HeroDef.unlock) shows its
 *  `requirement` feat instead of a Shard bar and auto-unlocks — it can't be claimed with Shards. */
export function heroCollection(save: SaveData): HeroCollectionEntry[] {
  return HERO_ORDER.map((kind) => {
    const def = HERO_DEFS[kind];
    const milestone = def.unlock; // milestone-gated (Vitriol) — earned, not bought
    const cost = def.unlockShards ?? 0;
    const isStarter = !milestone && cost <= 0;
    const unlocked = isHeroUnlocked(save, kind);
    const shards = save.heroShards[kind] ?? 0;
    return {
      kind, name: def.name, color: def.color, unlocked, isStarter, cost, shards,
      progress: unlocked ? 1 : milestone ? heroMilestoneProgress(save, milestone) : cost > 0 ? Math.min(1, shards / cost) : 1,
      canUnlock: !unlocked && !milestone && shards >= cost, // milestone heroes auto-unlock (no claim)
      requirement: milestone?.label,
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
export function towerProgress(save: SaveData, includeMulligan = true, mulliganOverride?: Partial<Record<TowerKind, MulliganState>>): TowerProgress {
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
    // Mulligan (docs/MULLIGANS.md) — the grafted organism folds through the SAME channels. It is
    // identity unless all three slots are filled (isMulliganActive), so a fresh account stays
    // byte-identical (golden-safe). Excluded from the Power `towers` bucket (includeMulligan=false)
    // so its Power is attributed solely to the dedicated `mulligans` bucket — no double count.
    // `mulliganOverride` substitutes the account's organisms wholesale for THIS fold — the
    // Daily Run's seeded, dex-drawn assignment (docs/MULLIGANS.md §daily); absent = the save's own.
    const mull = includeMulligan ? resolveMulligan((mulliganOverride ?? save.mulligans)?.[k], TOWER_DEFS[k].combatClass) : identityMulligan();
    kit.projectileMutators.push(...mull.projectileMutators);
    kit.extraProjectiles += mull.extraProjectiles;
    kit.splashMult *= mull.splashMult;
    rangeMult *= mull.rangeMult;
    fireRateBonus *= mull.fireRateMult;
    out[k] = {
      // PRIME (docs/PRIME-STRAINS.md): ONE extra multiplier lane on the same star/mastery
      // pipeline — primeMult(0) === 1 exactly, so a save without Prime folds byte-identically.
      damageMult: (1 + STAR.damagePerStar * stars) * (1 + MASTERY.damagePerLevel * mLvl) * adapt.damageMult * mull.damageMult * primeMult(save.towerPrime?.[k] ?? 0),
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
      roostBroodBonus: kit.roostBroodBonus !== 0 ? kit.roostBroodBonus : undefined,
      roostTierBonus: kit.roostTierBonus !== 0 ? kit.roostTierBonus : undefined,
      roostRegenBonus: kit.roostRegenBonus !== 0 ? kit.roostRegenBonus : undefined,
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
    // Symbiote (docs/HERO-SYMBIOTES.md) — the grafted organism's merged BEHAVIOR kit rides the
    // same HeroMods path. Identity unless a slot is fully grafted (resolveHeroSymbiote), so a
    // fresh account attaches NO field and the sim stays byte-identical (golden-safe).
    const sym = resolveHeroSymbiote(save.heroSymbiotes?.[k]);
    out[k] = {
      // PRIME (docs/PRIME-STRAINS.md): the hero twin of the tower fold — ×1 at level 0.
      damageMult: (1 + STAR.damagePerStar * stars) * (1 + MASTERY.damagePerLevel * mLvl) * equip.damageMult * adapt.heroDamageMult * primeMult(save.heroPrime?.[k] ?? 0),
      cooldownMult: (1 / (1 + STAR.fireRatePerStar * stars)) * equip.cooldownMult * adapt.heroCooldownMult,
      skillCount: heroSkillCount(stars), // star-gated ability kit (★3 → 1 skill, ★7 → 2). 0 on a fresh save ⇒ golden-safe.
      symbiote: sym.kit ?? undefined,
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
  const pointsEarned = Math.floor(antigenEarned({ masteryLevel: level, campaignStage: stage, containerAntigen: save.antigen, achievementCount: save.achievements.length }) * ascendantBonuses(save.prestige.nodes).antigenGainMult); // × Ascendant Mutagenesis (×1 without it)
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
  threat?: number; // THREAT LADDER level (docs/THREAT.md) — set by App on Campaign replays / Infinite / Boss Rush; ignored elsewhere
  dailyReplay?: string; // daily runs: the recorded input log (docs/SECURITY-AUDIT.md R1) — persisted with the day's best
  // ── Daily Run (docs/DAILY-RUN.md) — set by App for a 'daily' run: the day's UTC key. Drives the
  //    daily ledger (best wave / completions / streak) + the once-per-day clear reward. ──
  dailyKey?: string;
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

/** The Infestation territory read-model (docs/INFESTATION.md) — everything the living
 * map renders: live levels, tiers, decay forecasts, passives, and the feed preview. */
export interface InfestationMapView {
  regions: { def: (typeof REGIONS)[number]; fraction: number; entrenched: boolean; bonusNow: string }[];
  sectors: Record<string, number>;
  sectorDetails: Record<string, {
    id: string; name: string; level: number; tier: SectorTier;
    zeroInDays: number | null; tierHoldDays: number | null; saturated: boolean;
  }>;
  target: string | null; // the pin as SAVED (sector id, region id, or null)
  feedsInto: string; // the SECTOR the next run will actually feed (pin resolved)
  completion: number; // 0..1 across the whole map
  saturatedCount: number;
  dormant: boolean; // nothing infested anywhere — the home board shows a teaser, not an empty map
}

/** THE FRONT read-model (docs/INFESTATION.md §front) — the war layer over the territory map:
 * today's hotspot + incursion, the claimable tier spoils and weekly tributes, and the deploy
 * flavor per region. The home strip renders a compression of this; the Front screen, all of it. */
export interface FrontView {
  hotspot: { id: string; name: string; regionName: string; mult: number };
  /** Today's attack on a held sector, or null while nothing ≥ Colony is held. */
  incursion: { id: string; name: string; defended: boolean; bite: number } | null;
  /** Sectors with unclaimed tier spoils (one card claims everything pending on the sector). */
  tierClaims: { id: string; name: string; regionId: string; tierName: string; rewards: PassReward[] }[];
  tributes: { regionId: string; name: string; heldTiers: number; claimable: boolean; rewards: PassReward[] }[];
  claimableCount: number; // tier cards + claimable tributes + an undefended live incursion
}

/** The result of cracking one container open in the Vault — the rolled rewards plus a
 * display label + accent for the reveal ceremony (rarity name, or the cache's name). */
export interface CrackedContainer {
  chest: ChestResult;
  label: string;
  color: string;
}

/** The Mega Hunt read on Results (docs/MEGA-BOSS.md §hunt). */
export interface MegaHuntOutcome {
  defId: string;
  name: string;
  hpTorn: number; // 0..1 share of the organism's max HP torn away (1 = slain)
  organs: number; // organs ruptured in that encounter
  wound: string | null; // MEGA_HUNT.wounds id reached (null = untouched)
  rank: number; // lifetime hunt rank after this run
  ranksGained: number; // ranks this run's ruptures crossed (each paid once)
  cores: number; // Genome Cores those ranks paid (already in reward.shardsEarned)
  lifetimeOrgans: number;
  nextRankAt: number; // lifetime organs the next rank needs
  nextRankCores: number; // what the next rank will pay at today's frontier (preview == outcome)
  dossier: { kind: string; name: string; note: string; known: boolean }[]; // the def's organ kinds
}

/** The Mega Hunt outcome for a run's mega encounter — pure over the post-run save. */
export function megaHuntOutcome(save: SaveData, read: NonNullable<RunStats['megaHunt']>, ranksGained: number, cores: number): MegaHuntOutcome {
  const def = megaBossDef(read.defId);
  const organsLife = save.megaProgress.weakPoints;
  const rank = huntRank(organsLife);
  const known = new Set(save.megaProgress.wpKinds);
  const kinds = [...new Set((def?.weakPoints ?? []).map((w) => w.kind))];
  const dossier = kinds.map((k) => {
    const wd = WEAK_POINT_DEFS[k];
    const seen = known.has(k) || rank >= MEGA_HUNT.dossierRank;
    return { kind: k, name: wd.name, note: seen ? wd.hudNote : '??? — rupture it to learn what it does', known: seen };
  });
  return {
    defId: read.defId, name: def?.name ?? read.defId, hpTorn: read.hpTorn, organs: read.organs,
    wound: huntWound(read.hpTorn, read.organs)?.id ?? null,
    rank, ranksGained, cores, lifetimeOrgans: organsLife, nextRankAt: huntRankAt(rank + 1),
    nextRankCores: huntRankCores(highestCampaignStage(save) + 1), dossier,
  };
}

/** Everything a finished run grants — the Results screen renders all of it. The run-end
 * cache and loot-queue boxes are NOT opened here: they bank into the Genetic Vault (loot.banked)
 * for the player to crack open manually. */
export interface RunOutcome {
  reward: RunReward;
  passXp: number; // Battle Pass XP this run banked (docs/BATTLEPASS.md §xp)
  passLevelUp?: { from: number; to: number }; // present when the run crossed ≥1 pass level
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
  // THE MEGA HUNT (docs/MEGA-BOSS.md §hunt): the run's last mega encounter — its wound (share of max
  // HP torn, organs, wound tier), the lifetime hunt rank this run's ruptures reached + the Cores its
  // crossed ranks paid, and the organ dossier (ruptured-ever kinds named). Absent when no mega fought.
  megaHunt?: MegaHuntOutcome;
  // Daily Run (docs/DAILY-RUN.md): this run's daily outcome — the once-per-day clear reward (0 on a
  // replay/loss) and the updated streak. Absent off-daily.
  dailyProgress?: { cores: number; streak: number; cleared: boolean };
  // Champion Contracts honoured by THIS run (docs/CONTRACTS.md) — cores already folded
  // into the reward; cosmetic = the granted Gilded phenotype id (null for core-only rows).
  contracts?: { id: string; name: string; cores: number; cosmetic: string | null }[];
  // Quest missions COMPLETED by this run's credit (docs/QUESTS.md §credit) — rewards claim
  // on the Quest Board; this names the movement. `quest` is the owning quest's display name.
  questMissions?: { id: string; name: string; quest: string }[];
  // Contract NEAR-MISSES (docs/CONTRACTS.md §near-miss): open board rows this run failed by
  // EXACTLY one constraint — the Results chase line ("so close: <what was missed>").
  contractNears?: { id: string; name: string; missed: string }[];
  // PERFECT WEEK (docs/CONTRACTS.md §perfect-week): this run swept the week's whole board —
  // bonus cores already folded into the reward.
  perfectWeek?: { cores: number };
  // Story cutscene premieres earned by THIS run — mega bosses first-defeated here
  // (docs/CUTSCENES.md §autoplay). The App plays them after the Results summary, in order.
  megaCutscenes?: string[];
  // Campaign "Flawless first-clear" bonus-cache status, for the Results notice. null on non-campaign
  // runs and campaign losses (the bonus doesn't apply). The bonus cache is granted only when
  // earned === true (firstClear AND noDamage); the other flags let the UI explain a miss.
  flawlessCache: { earned: boolean; firstClear: boolean; noDamage: boolean } | null;
  // THREAT LADDER (docs/THREAT.md): the run's level, its reward multiplier, whether it cleared the
  // mode's benchmark (and opened the next rung), and any milestone titles earned. Absent at Threat 0.
  threat?: ThreatOutcome;
  // Account Level (docs/ACCOUNT-LEVEL.md): this settle's Account-XP delta — total gained (run +
  // achievements), the before/after levels, and every level crossed with its procedural reward.
  accountXp: AccountXpDelta;
  // MOMENTUM (docs/ECONOMY_FORMULAS.md §5): the adaptive catch-up factor this settle applied
  // when the account was behind its frontier bar (>1 ⇒ Results shows the boost). The ahead-taper
  // side is deliberately NOT surfaced — it reads as natural pacing, and the factor trace stays
  // inspectable for debugging either way. Absent when the seam was off or ×1.
  momentum?: number;
}

/** One Account Level crossed during a settle, with its generated reward (docs/ACCOUNT-LEVEL.md).
 *  (Shard grants BANK even on max-Star units since Prime Strains — docs/PRIME-STRAINS.md §economy —
 *  so the old `essenceConverted` toast lane is retired.) */
export interface AccountLevelUp {
  level: number;
  milestone: boolean;
  reward: AccountLevelReward;
}
export interface AccountXpDelta {
  gained: number; from: number; to: number; levelUps: AccountLevelUp[];
  /** Run settles only: the Depth XP multiplier the play fold paid at (absent when ×1). */
  depthMult?: number;
}

/** One granted line on a premium receipt — the reveal ceremony renders these. */
export interface PremiumReceiptLine {
  icon: string;
  label: string;
  rarity?: string; // tint for container/equipment lines
}
/** What meta.purchaseOffer returns — everything the confirmation + reveal UI needs. */
export interface PremiumReceipt {
  offer: PremiumOfferDef;
  lines: PremiumReceiptLine[];
  valueIchor: number; // à-la-carte worth (docs/PREMIUM-STORE.md §value)
  powerPotential: number; // "up to +N Power when invested" (0 = pure economy offer)
  sandbox: boolean; // true until a real payment provider is wired at the checkout seam
}

/** The one-time Combat Tutorial completion payout, for the reward reveal (docs/TUTORIAL.md). */
export interface TutorialRewardSummary {
  cores: number; // Genome Cores
  towerShards: number; // per-tower shard grant
  heroShards: number; // shard grant for the selected hero
  containerRarity: string; // the guaranteed Tutorial Bio-Container's rarity
  containers: number; // how many Tutorial Bio-Containers landed (the graduation pays both ledgers)
  itemName: string; // the basic Hero Equipment piece granted
  items: number; // how many copies of it
  achievement: string | null; // achievement unlocked ('Assimilation Protocol'), or null if already had it
  powerBefore: number;
  powerAfter: number; // the visible Power Score increase
}

/** One onboarding ledger's payout (docs/TUTORIAL.md §graduation) — paid once per ledger id. */
const TUTORIAL_GRANT = { cores: 150, towerShards: 15, heroShards: 20, containerRarity: 'rare', itemDefId: 'w_quill' } as const;
/** The onboarding ledgers the ONE graduation reveal pays together: the Combat Tutorial's own
 *  grant + the one the Field Orientation used to pay at its finish (merged 2026-11 so a new
 *  player gets a single reward moment and a tour Skip can never forfeit anything). */
const ONBOARDING_LEDGERS = ['combat', 'hudtour'] as const;

/** Fold two ledger payouts into one reveal summary (counts add; Power spans both). */
function mergeTutorialRewards(a: TutorialRewardSummary, b: TutorialRewardSummary): TutorialRewardSummary {
  return {
    ...a,
    cores: a.cores + b.cores,
    towerShards: a.towerShards + b.towerShards,
    heroShards: a.heroShards + b.heroShards,
    containers: a.containers + b.containers,
    items: a.items + b.items,
    achievement: a.achievement ?? b.achievement,
    powerAfter: b.powerAfter,
  };
}

/** Roll each awarded loot-queue box's reward table, fold the shards into the running
 * totals, and collect the per-box awards for the Results reveal. Mutates the records. */
function openLootBoxes(
  awarded: string[],
  towerShards: Record<TowerKind, number>,
  heroShards: Record<string, number>,
  heroPool?: readonly string[],
  towerPool?: readonly TowerKind[],
): LootBoxAward[] {
  const out: LootBoxAward[] = [];
  for (const rarity of awarded) {
    const def = rarityRegistry.get(rarity);
    if (!def) continue;
    const box = rollLoot(def, Math.random, heroPool, towerPool);
    for (const k of TOWER_ORDER) towerShards[k] += box.towerShards[k] ?? 0;
    for (const id of Object.keys(box.heroShards)) heroShards[id] = (heroShards[id] ?? 0) + box.heroShards[id];
    out.push({ rarity, chest: box });
  }
  return out;
}

/** Client mirror of the server's leaderboard name rules — ONE truth for what survives. */
export function sanitizeCommanderName(v: string): string | null {
  const cleaned = v.replace(/[\u0000-\u001f<>&"'`\\]/g, '').trim().slice(0, 20);
  return cleaned.length >= 2 ? cleaned : null;
}

// ── Idle Harvest plumbing (docs/IDLE-HARVEST.md) — pure helpers meta's actions share ─────────

export type { IdleReceiptLine } from '../core/idleHarvest'; // display model lives beside the merge
export interface IdleHarvestReceipt {
  lines: IdleReceiptLine[];
  rawHours: number; effHours: number; capHours: number; full: boolean;
  bloom: boolean; xp: number; value: number; efficiencyPct: number;
  suggestion: ReturnType<typeof idleSuggestion>;
}
export interface IdleNodeView { def: IdleNodeDef; level: number; cost: number; gate: IdleGateReq | null; gateLabel: string | null; affordable: boolean }
export interface IdleHarvestView {
  accrual: IdleAccrual;
  collectable: boolean;
  nodes: IdleNodeView[];
  suggestion: ReturnType<typeof idleSuggestion>;
  drops: { id: string; name: string; icon: string; rare: boolean; minCampaign?: number; minGenomeRank?: number; eligible: boolean }[];
  ledger: SaveData['idle'];
  /** The Hive wallet (save.hiveMaterials) — organs are priced in CHITIN (docs/ECONOMY.md §localized). */
  chitin: number;
  /** GENOME RANK DIVIDEND (docs/IDLE-HARVEST.md §rank): the rank index feeding the rate and
   *  its bonus fraction (0 at rank I) — the screen shows the interlink, not just the total. */
  rankIndex: number;
  rankBonus: number;
  /** ARENA RANK DIVIDEND (docs/ARENA.md §8): the division's rate multiplier (×1 at Spore III)
   *  and storage-cap bonus hours — the second mastery-ladder feed, shown as its own chip. */
  arenaDividend: number;
  arenaCapBonusHours: number;
  /** HIVE STRUCTURE FEED (docs/HIVE-PRODUCTION.md): the built organism's production bundle
   *  (identity with nothing built), its live synergies, and the most productive organ —
   *  the stats panel shows the body feeding the harvest. */
  hive: HiveProductionBonus;
  synergies: { def: HiveSynergyDef; live: boolean }[];
  mostProductive: { name: string; line: string } | null;
}

/** Static display rows for the drop table (gates shown as "work toward it" copy). */
const IDLE_DROPS_VIEW = IDLE_DROPS.map((d) => ({ id: d.id, name: d.name, icon: d.icon, rare: d.rare === true, minCampaign: d.minCampaign, minGenomeRank: d.minGenomeRank }));

// ── Arena view models (docs/ARENA.md) ───────────────────────────────────────────
/** Everything the Arena screen renders: season identity, the live (decay-adjusted) ladder
 *  position, the pass track state, exclusives, and the rank benefits. Poll-free read. */
export interface ArenaHubView {
  season: ArenaSeasonInfo;
  rating: number;
  division: ArenaDivisionDef;
  divisionIndex: number;
  nextDivision: ArenaDivisionDef | null; // null at the top
  placementsLeft: number;
  wins: number;
  losses: number;
  streak: number;
  lifetimeWins: number;
  lifetimeLosses: number;
  peak: number;
  pass: {
    xp: number;
    level: number;
    into: number;
    need: number;
    premium: boolean;
    premiumPrice: number;
    track: ArenaPassLevelRewards[];
    claimedFree: Set<number>;
    claimedPremium: Set<number>;
    claimableFree: number[];
    claimablePremium: number[];
    exclusive: ArenaExclusiveId;
    exclusiveLabel: string;
    exclusiveOwned: boolean;
  };
  idle: { dividend: number; capBonusHours: number };
  history: ArenaSave['history'];
  power: number;
}

/** The settle receipt (Results-side): the verdict, the rating movement, and the paid lines. */
export interface ArenaSettleReceipt {
  outcome: 'win' | 'loss' | 'draw';
  delta: number;
  rating: number;
  division: string;
  promoted: boolean;
  demoted: boolean;
  placementsLeft: number;
  lines: PremiumReceiptLine[];
  passXp: number;
  passLevelUp: { from: number; to: number } | null;
}

/** The division ABOVE each index (promotion teaser); the top maps to null. */
const ARENA_DIVISIONS_NEXT: (ArenaDivisionDef | null)[] = ARENA_DIVISIONS.map((_, i) => ARENA_DIVISIONS[i + 1] ?? null);

/** Grant an arena-exclusive content piece (docs/ARENA.md §6): the FOREVER ledger entry plus
 *  the roster unlock (when the content def exists — the ledger is authoritative either way,
 *  so a claim before a content patch self-heals on the next roster read). Exclusives have NO
 *  other acquisition path: no unlockShards, no stage gate, no market, no containers. */
function grantArenaExclusive(save: SaveData, id: ArenaExclusiveId): SaveData {
  let next: SaveData = { ...save, arena: { ...save.arena, exclusives: [...save.arena.exclusives, id] } };
  if (id.startsWith('tower:')) {
    const kind = id.slice('tower:'.length) as TowerKind;
    if ((TOWER_ORDER as string[]).includes(kind) && !next.towerUnlocked.includes(kind)) {
      next = { ...next, towerUnlocked: [...next.towerUnlocked, kind] };
    }
  } else if (id.startsWith('hero:')) {
    const kind = id.slice('hero:'.length) as HeroKind;
    if ((HERO_ORDER as string[]).includes(kind) && !next.heroUnlocked.includes(kind)) {
      next = { ...next, heroUnlocked: [...next.heroUnlocked, kind] };
    }
  }
  return next;
}

export function fmtIdleHours(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  return h < 48 ? `${h.toFixed(1)}h` : `${Math.floor(h / 24)}d ${Math.round(h % 24)}h`;
}

/** The six progression lenses idle gates + drop eligibility read (docs/IDLE-HARVEST.md §gates). */
function idleGateContext(save: SaveData): IdleGateContext {
  return {
    stage: highestCampaignStage(save),
    genomeRankIndex: rankFromRating(genomeRating(meta.genomeSnapshot())).index,
    molts: save.prestige.molts,
    rushBest: save.rushBestBoss,
    collectionCompletion: collectionView(collectionContextOf(save)).completion,
    power: composePower(accountPowerParts(save)).score,
  };
}

/** Apply ONE registry grant to a draft save + push its receipt line. A future currency is one
 *  registry row (core) + one case here — the whole integration contract. */
function applyIdleGrant(next: SaveData, g: IdleGrant, rng: () => number, meta_: { icon: string; name: string; rare: boolean }, lines: IdleReceiptLine[]): SaveData {
  const push = (label: string): void => { lines.push({ icon: meta_.icon, label, rare: meta_.rare }); };
  const pushCur = (cur: string, qty: number, suffix?: string): void => {
    lines.push({ icon: meta_.icon, label: `${qty} ${cur}`, rare: meta_.rare, cur, qty, ...(suffix ? { suffix } : {}) });
  };
  switch (g.kind) {
    case 'cores':
      pushCur('genomeCores', g.qty);
      return { ...next, shards: next.shards + g.qty, lifetimeShards: next.lifetimeShards + g.qty };
    case 'mats':
      lines.push({ icon: '⚒', label: 'Materials', rare: meta_.rare, mats: { mutagen: g.mutagen, scrap: g.scrap, catalyst: g.catalyst } });
      return { ...next, mats: { mutagen: next.mats.mutagen + g.mutagen, scrap: next.mats.scrap + g.scrap, catalyst: next.mats.catalyst + g.catalyst } };
    case 'essence':
      pushCur('geneEssence', g.qty);
      return { ...next, geneEssence: next.geneEssence + g.qty };
    case 'hiveMats': // Chitin — the guaranteed Hive-Production lane (docs/ECONOMY.md §localized)
      pushCur('hiveMaterials', g.qty);
      return { ...next, hiveMaterials: next.hiveMaterials + g.qty };
    case 'tissue': // Mulligan Tissue traces beside the dupe-dissolve + graft-bleed faucets
      pushCur('mulliganTissue', g.qty);
      return { ...next, mulliganTissue: next.mulliganTissue + g.qty };
    case 'towerShards': {
      const towerShards = { ...next.towerShards };
      for (const k of towerShardPool(next)) towerShards[k] = (towerShards[k] ?? 0) + g.qtyEach;
      pushCur('towerShards', g.qtyEach, '× every tower');
      return { ...next, towerShards }; // banks even on max-Star lanes (Prime fuel — docs/PRIME-STRAINS.md)
    }
    case 'heroShards': {
      const heroShards = { ...next.heroShards };
      for (const k of HERO_ORDER) heroShards[k] = (heroShards[k] ?? 0) + g.qtyEach;
      pushCur('heroShards', g.qtyEach, '× every hero');
      return { ...next, heroShards };
    }
    case 'mulligan': {
      // The container lane's discovery contract (docs/MULLIGANS.md §loot): prefer an UNOWNED
      // piece; a fully-sequenced dex dissolves the pull into Gene Essence instead.
      const modIds = mulliganRegistry.ids();
      const unowned = modIds.filter((m) => !next.mulliganDex[m]);
      const rar = rollRarity(rng());
      if (unowned.length === 0) {
        // §localized: duplicate modifiers dissolve into MULLIGAN TISSUE (same unit price as the
        // Gene Essence they used to pay — a currency swap, not new value).
        push('Duplicate Modifier — 60 Mulligan Tissue');
        return { ...next, mulliganTissue: next.mulliganTissue + 60 };
      }
      const id = unowned[Math.floor(rng() * unowned.length)];
      push(`Modifier Sequenced — ${mulliganRegistry.get(id)?.name ?? id} (${MULLIGAN_RARITY[rar].label})`);
      return { ...next, mulliganDex: { ...next.mulliganDex, [id]: rar } };
    }
    case 'container':
      push(`${g.rarity} Bio-Container`);
      return { ...next, pendingContainers: [...next.pendingContainers, { kind: 'loot', rarity: g.rarity }] };
    case 'runCache':
      push('Run Cache');
      return { ...next, pendingContainers: [...next.pendingContainers, { kind: 'cache', chestId: RUN_CHEST }] };
    case 'ichor':
      pushCur('ichor', g.qty);
      return { ...next, ichor: next.ichor + g.qty, lifetimeIchor: next.lifetimeIchor + g.qty };
  }
}

/** One listable thing in the Auction House Sell tab (docs/AUCTION-HOUSE.md §client). */
export interface AuctionSellable {
  refKey: string;
  cat: 'equipment' | 'geneCard' | 'cosmetic' | 'mulliganPiece';
  name: string;
  familyKey: string;
  rarity: string;
  season: number;
  source: string;
  payload: Record<string, unknown>;
  blocks: ('bound' | 'equipped' | 'neverTrade' | 'slotted')[];
}

/** One earned pass level's claim, WITHOUT a guard — callers guard: meta.claimPassLevel per level
 *  (pass.claim), meta.claimAllPass once per batch (pass.claimAll). Module-level on purpose: the
 *  security registry test requires every mutator ON `meta` to carry its own guard. */
function claimPassLevelCore(track: 'free' | 'premium', level: number, now: number): PremiumReceiptLine[] | null {
  meta.pollBattlePass(now);
  const save = store.get();
  const bp = save.battlePass;
  if (level < 1 || level > BP.levels || level > levelOf(bp.xp).level) return null;
  const claimed = track === 'free' ? bp.claimedFree : bp.claimedPremium;
  if (claimed.includes(level)) return null;
  if (track === 'premium' && !bp.premium && !BP.freePremiumLevels.includes(level)) return null;
  const season = seasonForWindow(bp.window);
  const rewards = seasonTracks(season.id)[track][level - 1];
  const { next, lines, stamina, events } = applyPassRewards(save, season, rewards, track, level);
  persist({ ...next, metabolism: bumpCounter(next.metabolism, 'passClaimed') }); // Season Communion (docs/METABOLISM.md)
  if (stamina > 0) meta.grantRushStamina(stamina, now);
  meta.evaluateAchievements();
  rewardToast.pushMany(`Battle Pass — Level ${level}`, events);
  return lines;
}

export const meta = {
  use: store.use,
  get: store.get,
  subscribe: store.subscribe, // non-React consumers (auto cloud sync) watch save changes here
  upgrades: META_UPGRADES,

  buyUpgrade(id: string): boolean {
    if (!guardOk('progress.upgrade', id)) return false;
    const save = store.get();
    const def = META_UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    if (!upgradeUnlocked(save, def)) return false; // progression-gated (docs/EVOLUTION-HQ.md §gates)
    const level = upgradeLevel(save, id);
    if (level >= def.maxLevel) return false;
    const cost = upgradeCost(def, level);
    if (save.shards < cost) return false;
    const powerBefore = meta.power().score;
    persist(foldAccountXp({
      ...save,
      shards: save.shards - cost,
      upgrades: { ...save.upgrades, [id]: level + 1 },
    }, ACCOUNT_XP.acquisition).save); // every permanent acquisition advances the account (docs/ACCOUNT-LEVEL.md)
    announcePower(`${def.name} L${level + 1} — Genome Upgrade`, powerBefore, meta.power().score);
    return true;
  },

  /** CLASS BONDS (docs/CLASS-BONDS.md): the account's bond level per combat class (sparse; absent = 0). */
  bondLevels(): BondLevels {
    return store.get().classBonds;
  },
  /** Raise one class's bond a level with Genome Cores — the set bonus that class's fielded units wake
   *  in every run grows with it. Guarded like every permanent purchase; refused while the Class Bonds
   *  screen is sealed (banked Cores wait — the seal rule), at max level, or unaffordable. */
  upgradeBond(cls: CombatClass): boolean {
    if (!guardOk('progress.upgrade', `bond:${cls}`)) return false;
    const save = store.get();
    if (!featureRevealed(save, 'bonds')) return false;
    const level = save.classBonds[cls] ?? 0;
    if (level >= BOND.maxLevel) return false;
    const cost = bondCost(level);
    if (save.shards < cost) return false;
    const powerBefore = meta.power().score;
    persist(foldAccountXp({ ...save, shards: save.shards - cost, classBonds: { ...save.classBonds, [cls]: level + 1 } }, ACCOUNT_XP.acquisition).save);
    announcePower(`${cls} Bond L${level + 1}`, powerBefore, meta.power().score);
    return true;
  },

  /** ONE-TAP GENOME REBUILD (docs/EVOLUTION-HQ.md §rebuild) — apply a confirmed plan
   *  (state/evolutionHQ genomeRebuildPlan, the Best Value ranking) in ONE guarded persist. Refused
   *  (false, nothing spent) if the save drifted since the plan was shown — the UI re-plans. Pays
   *  the same Account XP per level as buyUpgrade and announces ONE Power change. */
  applyGenomeRebuild(steps: readonly GenomeRebuildStep[]): boolean {
    if (!guardOk('progress.rebuild')) return false;
    if (steps.length === 0) return false;
    const save = store.get();
    const next = genomeRebuildSave(save, steps);
    if (!next) return false;
    const powerBefore = meta.power().score;
    persist(foldAccountXp(next, steps.length * ACCOUNT_XP.acquisition).save);
    announcePower(`Genome rebuild — ${steps.length} level${steps.length === 1 ? '' : 's'}`, powerBefore, meta.power().score);
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
    // ── Decision support (docs/PROGRESSION-REDESIGN.md §molt-chamber) ──
    multAfter: number; // the global multiplier a Molt RIGHT NOW would leave you at
    nextCellNeed: number; // cycle Genome Cores at which the next raw cell mints
    nextCellProgress: number; // 0..1 between the current raw cell and the next
    mintProgress: number; // 0..1 toward the FIRST offerable mint (minCells) — the pre-ready bar
    spentCells: number; // lifetime cells invested into the Ascendant Tree
    upgradeLevels: number; // Genome-upgrade levels a Molt SHEDS (the manifest's number)
    upgradeLevelsKept: number; // Genome-upgrade levels the Molt Imprint keeps
    imprint: number; // the share of every upgrade's levels the next Molt keeps (0 on the first)
  } {
    const save = store.get();
    const s = save.prestige;
    const stage = highestCampaignStage(save);
    const req = prestigeStageReq(s.molts);
    const campaignMet = stage >= req;
    const shardsReady = canMolt(s.cycleShards);
    const gain = moltGain(save); // includes the Ascendant Resonance compounding
    const rawCells = cellsForCycle(s.cycleShards);
    const curFloor = shardsForCells(rawCells);
    const nextCellNeed = shardsForCells(rawCells + 1);
    const imprint = moltImprint(s.molts);
    const upgradeLevels = sumValues(save.upgrades);
    const upgradeLevelsKept = sumValues(imprintedUpgrades(save.upgrades, imprint));
    const spentCells = ASCENDANT_NODES.reduce((sum, def) => {
      let acc = 0;
      for (let l = 0; l < (s.nodes[def.id] ?? 0); l++) acc += ascendantCost(def, l);
      return sum + acc;
    }, 0);
    return {
      cells: s.cells,
      lifetimeCells: s.lifetimeCells,
      molts: s.molts,
      cycleShards: s.cycleShards,
      mult: prestigeMult(s.lifetimeCells),
      gain,
      canMolt: shardsReady && campaignMet, // Prestige needs the mint AND the campaign gate
      shardsReady,
      campaignStage: stage,
      campaignReq: req,
      campaignMet,
      campaignProgress: req > 0 ? Math.min(1, stage / req) : 1,
      multAfter: prestigeMult(s.lifetimeCells + gain),
      nextCellNeed,
      nextCellProgress: Math.max(0, Math.min(1, (s.cycleShards - curFloor) / Math.max(1, nextCellNeed - curFloor))),
      mintProgress: Math.max(0, Math.min(1, s.cycleShards / Math.max(1, shardsForCells(PRESTIGE.molt.minCells)))),
      spentCells,
      upgradeLevels: upgradeLevels - upgradeLevelsKept,
      upgradeLevelsKept,
      imprint,
    };
  },

  /** Power now vs right after a Molt committed now (the Imprint's kept levels + the new cells) —
   *  the Molt Chamber's "Power after" line. Built by the SAME moltedSave the mint uses, so the
   *  preview IS the outcome (pinned in prestigeView.test). */
  moltPowerPreview(): { before: number; after: number } {
    const save = store.get();
    return {
      before: composePower(accountPowerParts(save)).score,
      after: composePower(accountPowerParts(moltedSave(save, moltGain(save)))).score,
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
    if (!guardOk('progress.ascendant', id)) return false;
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
   * MOLT: sacrifice the core-upgrade engine (banked Shards + meta-upgrade levels, less the MOLT
   * IMPRINT's kept share) to mint Ascendant Cells, which permanently raise the global damage
   * multiplier. Trophies (stars, mastery, titles/lore, gear, tower/hero shards, loot queue) are
   * KEPT. Returns false if a
   * Molt isn't worth offering yet (< minCells). Backs up first — it's destructive.
   */
  molt(): boolean {
    if (!guardOk('prestige.molt')) return false;
    const save = store.get();
    const gain = moltGain(save);
    if (gain < PRESTIGE.molt.minCells) return false;
    if (highestCampaignStage(save) < prestigeStageReq(save.prestige.molts)) return false; // campaign gate (PROGRESSION.md)
    saveStore.backup(); // ascensions are big + irreversible — keep a recoverable snapshot
    persist(foldAccountXp({
      ...withPeakPower(moltedSave(save, gain), save), // v56: the pre-Molt Power is banked as the Genome Rank peak first
      timeline: pushTimeline(save.timeline, '◬', `MOLT ${save.prestige.molts + 1} — ${gain} Ascendant Cells${save.prestige.vows.length > 0 ? ` (×${vowYieldProduct(save.prestige.vows).toFixed(2)} vow wager honoured)` : ''}`), // profile milestone
    }, ACCOUNT_XP.molt).save); // a MOLT is a chapter of account history (docs/ACCOUNT-LEVEL.md)
    return true;
  },

  // ── MOLT VOWS (docs/VOWS.md) — the prestige wager: arm handicaps, multiply the next mint. ──
  /** The vow board for the Molt Chamber: every vow with armed state, the geometric cost of the
   *  NEXT arm, and the armed set's combined wager (warp product + cell multiplier). */
  vowsView(): {
    vows: { def: VowDef; armed: boolean }[];
    armed: VowDef[];
    slots: number;
    nextCost: number | null; // null = all slots armed
    yieldProduct: number; // combined cell-mint multiplier (×1 when none armed)
    combinedWarp: DoctrineWarp | undefined; // the composed handicap (display the REAL risk)
  } {
    const s = store.get();
    const armed = s.prestige.vows.map((id) => vowById(id)).filter((v): v is VowDef => !!v);
    return {
      vows: VOWS.map((def) => ({ def, armed: s.prestige.vows.includes(def.id) })),
      armed,
      slots: MAX_VOWS,
      nextCost: s.prestige.vows.length >= MAX_VOWS ? null : vowArmCost(s.prestige.vows.length),
      yieldProduct: vowYieldProduct(s.prestige.vows),
      combinedWarp: combinedVowWarp(s.prestige.vows),
    };
  },
  /** Arm a vow for the CURRENT cycle. Costs banked Genome Cores on the geometric curve —
   *  consumed NOW, never refunded (not by disarm, not by the Molt reset). Refuses unknown
   *  ids, duplicates, a full board, and insufficient Cores. */
  armVow(id: string): boolean {
    if (!guardOk('prestige.vow', id)) return false;
    const s = store.get();
    const def = vowById(id);
    if (!def || s.prestige.vows.includes(id) || s.prestige.vows.length >= MAX_VOWS) return false;
    const cost = vowArmCost(s.prestige.vows.length);
    if (s.shards < cost) return false;
    persist({
      ...s,
      shards: s.shards - cost, // the sink — spent Cores do NOT count toward the cycle mint again
      prestige: { ...s.prestige, vows: [...s.prestige.vows, id] },
      timeline: pushTimeline(s.timeline, '⛧', `Vow sworn — ${def.name} (−${cost} Cores)`),
    });
    return true;
  },
  /** Break an armed vow. The arm cost is FORFEIT (the UI double-confirms) — the handicap lifts
   *  from the next run, and the wager multiplier drops with it. */
  disarmVow(id: string): boolean {
    if (!guardOk('prestige.vow', id)) return false;
    const s = store.get();
    if (!s.prestige.vows.includes(id)) return false;
    persist({ ...s, prestige: { ...s.prestige, vows: s.prestige.vows.filter((v) => v !== id) } });
    return true;
  },

  // ── HIVE CONSTRUCTION (docs/HIVE-CONSTRUCTION.md) — build the laboratory's organs. ─────────
  /** The construction board: every organ with its era gate, built tier, the NEXT tier's traced
   *  cost, and per-currency affordability (the wallet snapshot the card chips render). */
  hiveView(): {
    era: 0 | 1 | 2 | 3;
    organs: {
      def: HiveOrganDef;
      built: number; // 0..def.tiers
      eraMet: boolean;
      next: { tier: number; lines: (HiveCostLine & { held: number; ok: boolean })[]; affordable: boolean } | null; // null = maxed
    }[];
    wallet: Record<RecipeKey, number>;
  } {
    const s = store.get();
    const era = labEra(labScore(s));
    const wallet: Record<RecipeKey, number> = {
      cores: s.shards,
      essence: s.geneEssence,
      strain: sumValues(s.towerShards),
      apex: sumValues(s.heroShards),
      mutagen: s.mats.mutagen,
      scrap: s.mats.scrap,
      catalyst: s.mats.catalyst,
    };
    return {
      era,
      organs: HIVE_ORGANS.map((def) => {
        const built = Math.min(s.hive.built[def.id] ?? 0, def.tiers);
        const eraMet = era >= def.era;
        if (built >= def.tiers) return { def, built, eraMet, next: null };
        const tier = built + 1;
        const lines = hiveCost(def, tier).map((l) => ({ ...l, held: wallet[l.key], ok: wallet[l.key] >= l.amount }));
        return { def, built, eraMet, next: { tier, lines, affordable: eraMet && lines.every((l) => l.ok) } };
      }),
      wallet,
    };
  },
  /** Build the NEXT tier of an organ — ONE atomic multi-currency spend (docs/SECURITY.md +
   *  economyDirector discipline: every charged line is verified against the live wallet, the
   *  per-kind Strain/Apex drains are planned richest-first, and only then does a single
   *  persist commit every deduction + the built tier + the timeline entry). */
  buildOrgan(id: string): boolean {
    if (!guardOk('hive.build', id)) return false;
    const s = store.get();
    const def = hiveOrganById(id);
    if (!def) return false;
    const built = Math.min(s.hive.built[id] ?? 0, def.tiers);
    if (built >= def.tiers) return false; // maxed
    if (labEra(labScore(s)) < def.era) return false; // era gate (homeBaseTiers prerequisite)
    const tier = built + 1;
    const lines = hiveCost(def, tier);
    const need = (k: RecipeKey): number => lines.find((l) => l.key === k)?.amount ?? 0;
    // Verify EVERY line first (atomicity: no partial spends, ever).
    if (s.shards < need('cores') || s.geneEssence < need('essence')) return false;
    if (s.mats.mutagen < need('mutagen') || s.mats.scrap < need('scrap') || s.mats.catalyst < need('catalyst')) return false;
    const strainPlanned = strainDrainPlan(s.towerShards, need('strain'));
    const apexPlanned = apexDrainPlan(s.heroShards, need('apex'));
    if (!strainPlanned || !apexPlanned) return false;
    const towerShards = { ...s.towerShards };
    for (const d of strainPlanned) towerShards[d.kind] -= d.take;
    const heroShards = { ...s.heroShards };
    for (const d of apexPlanned) heroShards[d.kind] -= d.take;
    persist({
      ...s,
      shards: s.shards - need('cores'),
      geneEssence: s.geneEssence - need('essence'),
      mats: { mutagen: s.mats.mutagen - need('mutagen'), scrap: s.mats.scrap - need('scrap'), catalyst: s.mats.catalyst - need('catalyst') },
      towerShards,
      heroShards,
      hive: { built: { ...s.hive.built, [id]: tier } },
      timeline: pushTimeline(s.timeline, def.icon, `Hive grown — ${def.name}${def.tiers > 1 ? ` ${['I', 'II', 'III'][tier - 1]}` : ''}`),
    });
    // The growth placard leads with the organ's PRODUCTION line (docs/HIVE-PRODUCTION.md):
    // building the body visibly grows the output — the merged loop's core beat. A newly
    // completed synergy announces its reveal as a second, rarer card.
    {
      const coupling = ORGAN_COUPLINGS.find((c) => c.organ === id);
      const ev: ToastEvents = [{
        type: 'organ',
        name: `${def.name}${def.tiers > 1 ? ` — Tier ${tier}` : ''}`,
        rarity: def.era >= 3 ? 'epic' : def.era >= 2 ? 'rare' : undefined,
        collection: coupling?.line,
      }];
      const built = { ...s.hive.built, [id]: tier };
      for (const syn of HIVE_SYNERGIES) {
        if ((syn.a === id || syn.b === id) && synergyLive(built, syn) && !synergyLive(s.hive.built, syn)) {
          ev.push({ type: 'organ', name: `Synergy revealed — ${syn.name}`, rarity: 'epic', collection: syn.note });
        }
      }
      rewardToast.pushMany('The Hive Grows', ev);
    }
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
    // Settle-once (docs/SECURITY.md §replay): an already-settled result replays its outcome.
    const replayed = settledOutcomes.get(result);
    if (replayed) return replayed;
    const save = store.get();
    const asc = ascendantBonuses(save.prestige.nodes); // permanent prestige-tree economy mults (×1 if none)
    const cb = accountEconomyBonuses(save); // codex + Battle Pass economy bonuses (neutral on a fresh save)
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
    // Field Research one-run boosts (docs/RESEARCH.md §boosts): armed multipliers apply to THIS
    // finishing run and the arms clear below — consumed exactly once. All ×1 with none armed.
    const researchBoost: Required<ResearchBoost> = { towerXpMult: 1, heroXpMult: 1, coresMult: 1, biomassMult: 1 };
    for (const id of save.research.pendingBoosts) {
      const b = researchRewardById(id)?.boost;
      if (!b) continue;
      researchBoost.towerXpMult *= b.towerXpMult ?? 1;
      researchBoost.heroXpMult *= b.heroXpMult ?? 1;
      researchBoost.coresMult *= b.coresMult ?? 1;
    }
    const xpMults = { tower: xpMultsRaw.tower * masteryTaper * researchBoost.towerXpMult, hero: xpMultsRaw.hero * masteryTaper * researchBoost.heroXpMult };
    // One-time discovery payout on a brand-new stage clear (+ the Sector Survey drip — the
    // old every-5th milestone lump paid evenly per stage, docs/REWARD-ARCHITECTURE.md).
    const firstClearBonus = firstClear
      ? Math.round(
          (CAMPAIGN_REWARDS.firstClearCore + CAMPAIGN_REWARDS.firstClearCorePerStage * stageNo +
            campaignSurveyBonus(stageNo)) * cb.campaignRewardMult, // Biomes codex: +Campaign Rewards
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
    const rushCoreBonus = isRush ? Math.round(RUSH.corePerBoss * bossKills * econDiff.rewardMult * asc.coreGainMult * asc.rushBonusMult) : 0;
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
    // THE MEGA HUNT (docs/MEGA-BOSS.md §hunt): the lifetime organ ledger was advanced LIVE by this
    // run's ruptures (megaWeakPointDown), so the ranks it crossed span (after − this run's organs) →
    // after. Each crossed rank pays its Core bounty ONCE — crossing semantics over a monotonic
    // counter, no claim ledger (no save field). A FAILED raid's ruptures count.
    const huntOrgansAfter = save.megaProgress.weakPoints;
    const huntRanksGained = huntRank(huntOrgansAfter) - huntRank(Math.max(0, huntOrgansAfter - (result.stats.weakPointsDestroyed ?? 0)));
    const huntCores = huntRanksGained > 0 ? huntRanksGained * huntRankCores(highestCampaignStage(save) + 1) : 0;

    // Daily Run (docs/DAILY-RUN.md §rewards): ledger + the ONCE-per-day clear reward. The clear pays
    // Genome Cores exactly once per UTC day (rewardedKey gate) with a capped consecutive-day streak
    // kicker; replays still record the day's deepest wave. No dailyKey ⇒ everything stays as-is.
    const dailyKey = result.dailyKey ?? null;
    const isDaily = dailyKey !== null;
    const dailyRewarded = isDaily && result.won && save.daily.rewardedKey !== dailyKey;
    const dailyStreak = dailyRewarded
      ? (isPrevDayKey(save.daily.rewardedKey, dailyKey) ? save.daily.streak + 1 : 1)
      : save.daily.streak;
    // LiveOps calendar (docs/LIVEOPS.md): scheduled windows fold ×1-baseline multipliers
    // into the mode-matched reward lanes (clock pinned to a weekday under tests).
    // Champion Contracts (docs/CONTRACTS.md): evaluate THIS run against the weekly board.
    // Uncompleted satisfied contracts pay cores here + (marquee rows) a Gilded phenotype.
    const contractFacts: ContractRunFacts = {
      mode: isRush ? 'rush' : isDaily ? 'daily' : result.endless ? 'endless' : result.campaignStage !== undefined ? 'campaign' : 'stage',
      won: result.won,
      wave: result.wave,
      kills: result.kills,
      bossKills: result.stats.bossKills ?? 0,
      cardsDrafted: result.stats.cardIds.length,
      integrityLost: result.stats.integrityLost,
      towerBuilds: result.stats.towerBuilds,
      heroId: result.stats.heroId,
    };
    const contractWeek = contractWeekKey();
    const contractBoard = activeContracts();
    const contractOpen = contractBoard.filter((c) => !save.contracts.completed.includes(`${contractWeek}:${c.id}`));
    const contractHits = contractOpen.filter((c) => contractSatisfied(c, contractFacts));
    // Near-misses: open rows the run failed by EXACTLY one constraint (mode already matched) —
    // the chase feedback that makes a silent board feel alive (docs/CONTRACTS.md §near-miss).
    const contractNears = contractOpen
      .filter((c) => !contractHits.includes(c))
      .map((c) => ({ c, rep: contractReport(c, contractFacts) }))
      .filter(({ rep }) => rep.modeOk && rep.checks.filter((k) => !k.ok).length === 1)
      .map(({ c, rep }) => ({ id: c.id, name: c.name, missed: rep.checks.find((k) => !k.ok)!.label }));
    // Perfect Week: THIS run completed the board's last open row (docs/CONTRACTS.md §perfect-week).
    // The lastPerfect watermark stops a re-pay if the ledger is ever re-satisfied in-week.
    const contractLedger = contractHits.length > 0
      ? [...save.contracts.completed, ...contractHits.map((c) => `${contractWeek}:${c.id}`)]
      : save.contracts.completed;
    const perfectWeek = contractHits.length > 0
      && save.contracts.lastPerfect !== contractWeek
      && contractBoard.every((c) => contractLedger.includes(`${contractWeek}:${c.id}`));
    const contractCores = contractHits.reduce((a, c) => a + c.reward.cores, 0) + (perfectWeek ? PERFECT_WEEK.cores : 0);

    // Weekly Directives (docs/LIVEOPS.md §directives): bank THIS run's facts into the cumulative
    // ladder. A new UTC week resets the board (progress + claims) before accruing — no reward is
    // granted here (milestones/capstone claim explicitly in the console), so this is a pure fold.
    const dirWeek = directiveWeekKey();
    const dirBase = save.directives.week === dirWeek
      ? { progress: save.directives.progress, claimed: save.directives.claimed }
      : { progress: {}, claimed: [] }; // week rolled over → fresh board
    const nextDirectives: SaveData['directives'] = {
      week: dirWeek,
      progress: accrueDirectives(dirBase.progress, result.stats),
      claimed: dirBase.claimed,
    };

    const loBase = liveopsMods();
    const loEv = liveEventLaneModsNow(); // the identity events' lane boosts stack in (LIVE-EVENTS.md §4)
    const lo = Object.fromEntries((Object.keys(loBase) as (keyof typeof loBase)[]).map((k) => [k, loBase[k] * loEv[k]])) as typeof loBase;
    const dailyCoreBonus = dailyRewarded
      ? Math.round((DAILY.reward.clearCores + Math.min(DAILY.reward.streakBonusCap, dailyStreak - 1) * DAILY.reward.streakBonus) * asc.coreGainMult * asc.dailyBonusMult * lo.dailyCoreMult)
      : 0;
    const nextDaily: SaveData['daily'] = isDaily
      ? {
          lastKey: dailyKey,
          lastWave: save.daily.lastKey === dailyKey ? Math.max(save.daily.lastWave, result.wave) : result.wave,
          bestWave: Math.max(save.daily.bestWave, result.wave),
          completions: save.daily.completions + (dailyRewarded ? 1 : 0),
          streak: dailyStreak,
          rewardedKey: dailyRewarded ? dailyKey : save.daily.rewardedKey,
          // The replay follows the wave it backs: a new daily best carries its own recording.
          lastReplay: save.daily.lastKey !== dailyKey || result.wave >= save.daily.lastWave
            ? (result.dailyReplay ?? null)
            : save.daily.lastReplay,
        }
      : save.daily;

    // 1. global shards + run records
    // Doctrine protocols (docs/DOCTRINES.md): run-end reward warps (director policy) × the
    // account's MASTERY RANK with this doctrine (pre-run ledgers — this run settles after).
    const docRank = result.doctrine
      ? doctrineRank(result.doctrine, save.stats.doctrineWins[result.doctrine] ?? 0, save.stats.doctrineBestWave[result.doctrine] ?? 0)
      : 0;
    const docEcon = doctrineEconomy(result.doctrine, docRank);
    // THREAT LADDER (docs/THREAT.md): only the ladder modes carry a level (anything else settles at
    // Threat 0 ⇒ ×1). Reward through the director's threatEconomy → the `threat.reward` factor; the
    // per-mode record + milestone titles fold through the pure settleThreat.
    const threatMode: ThreatMode | null = isRush ? 'bossRush' : result.endless ? 'endless' : isCampaign ? 'campaign' : null;
    // Clamped to the PRE-run earned ceiling (defense in depth — the picker already clamps).
    const threatLevel = threatMode ? Math.min(threatMaxFor(save, threatMode), Math.max(0, Math.floor(result.threat ?? 0))) : 0;
    const threatEcon = threatEconomy(threatLevel);
    const threatSettled = threatMode && threatLevel > 0
      ? settleThreat(save.threat, threatMode, threatLevel, {
        won: result.won, wave: result.wave, stage: result.campaignStage,
        frontier: save.campaign.cleared[result.difficulty ?? 'standard'] ?? 0,
      }, save.unlockedTitles, threatEcon.rewardMult)
      : null;
    const doctrineEssence = docEcon.essenceFor(result.wave);
    // Adaptive income seam (docs/ECONOMY_FORMULAS.md §5, ACTIVATED 2026-07 — BALANCE_ARCHITECTURE
    // §7 round 3): the account's distance from its OWN frontier bar tilts settle income — behind
    // the bar catches up (deep farm keeps out-earning the next geometric sink), far ahead cools
    // (the post-liveops faucet stack stops compounding into runaway molt cadence). OFF below the
    // onboarding floor, so fresh-account settles stay byte-identical (pinned tests unaffected).
    const adaptive = highestCampaignStage(save) >= ECONOMY_ADAPTIVE.minStage
      ? { powerGap: recommendedPowerScore(highestCampaignStage(save) + 1, 'standard') / Math.max(1, composePower(accountPowerParts(save)).score) - 1 }
      : undefined;
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
      threatRewardMult: threatEcon.rewardMult,
      adaptive,
    }).total() * researchBoost.coresMult
      // LiveOps spotlight weeks: the live mode's lane gets its window multiplier.
      * (result.bossRush ? lo.rushShardMult : result.endless ? lo.endlessShardMult : result.campaignStage !== undefined ? lo.campaignShardMult : 1)
    ) + firstClearBonus + attemptBonus + rushCoreBonus + dailyCoreBonus + contractCores + huntCores;
    // Boss Rush keeps its OWN depth record (rush waves are dense, short numbers — folding them
    // into the Infinite record would warp that mode's qualify gate + prediction floor).
    // Mode-scoped records: Boss Rush + Daily keep their OWN depth ledgers — neither pollutes the
    // Infinite bestWave (its qualify gate + prediction floor are calibrated on Infinite depths).
    const newBest = isRush ? result.wave > save.rushBestWave : isDaily ? result.wave > save.daily.bestWave : result.wave > save.bestWave;

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
        ? Math.floor(Math.min(save.rushBestWave, RUSH.qualifyRecordCap) * INFINITE_REWARD_QUALIFY_FRAC) // Boss Rush inherits the same anti-farm rule, keyed to ITS record (capped — docs/BOSS-RUSH.md §wall)
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
      modeLootMult: lootMult * lo.lootMult, // LiveOps Spore Tide / Reclamation fatten the haul (×1 off-window)
      containerRateMult: econDiff.containerRateMult,
      bossLootMult: cb.bossLootMult, // Bosses codex: +Boss Loot
      // Infinite depth-camping taper (docs/MODE-IDENTITY.md §anti-grind) — same curve as the live
      // meter, keyed on result.wave so run-end and live banking agree. Identity for non-endless.
      endlessTaperMult: result.endless ? endlessLootTaper(result.wave) : 1,
      threatRewardMult: threatEcon.rewardMult, // Threat ladder (identity at Threat 0)
      adaptive, // the same seam as cores — behind-the-bar accounts fill containers faster
    }).total()) + rushLootBonus;
    // Meter awakening (docs/LOOTBOX.md §meter): the loot QUEUE banks nothing until the account's
    // first Mega Boss kill — run caches + stage first-clear caches below still pay. The slain
    // ledger writes live (megaKilled event), and result.stats.megaKills covers callers without
    // live events (the progression simulator): the run that fells the first mega banks in full.
    const meterAwake = hasSlainMega(save) || (result.stats.megaKills?.length ?? 0) > 0;
    const lootAdv = lootEligible && meterAwake
      ? addProgress(save.lootQueue, Math.max(0, lootPoints - runLootBanked), Math.random, lootBiasFor(save, result.difficulty))
      : { state: save.lootQueue, awarded: [] as string[] }; // unqualified/dormant: no run-end loot, meter frozen (no RNG spent)
    const queueRemainder: PendingContainer[] = lootAdv.awarded.map((rarity) => ({ kind: 'loot', rarity }));
    const runCache: PendingContainer = { kind: 'cache', chestId: chestForWave(result.wave) };
    // Flawless first-clear "Stage Cache": the bonus container is awarded ONLY when a campaign stage
    // is cleared for the FIRST time WITHOUT the Nucleus taking any integrity damage. Regen does not
    // redeem a hit — any damage taken forfeits the bonus — and replays never qualify. Scaled by the
    // stage number so deeper flawless first clears drop a richer cache.
    const noDamage = result.stats.integrityLost === 0;
    const flawlessEarned = firstClear && noDamage;
    const stageCache: PendingContainer[] = flawlessEarned ? [{ kind: 'cache', chestId: chestForWave(stageNo) }] : [];
    // Results notice (docs/REWARD-PRESENTATION.md): earned/missed status on a qualifying campaign win.
    const flawlessCache = isCampaign && result.won ? { earned: flawlessEarned, firstClear, noDamage } : null;
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
    // Mega Boss bounty (docs/MEGA-BOSS.md §rewards): EVERY defeated mega guarantees Ichor —
    // base bounty × tier × encounter-type × kill EFFICIENCY (expected/actual, power-adjusted),
    // so outperforming your own expectation pays and stalling never does.
    for (const k of result.stats.megaKills ?? []) {
      const megaDef = megaBossDef(k.defId);
      if (!megaDef) continue;
      const { efficiency } = megaKillExpectation(save, k);
      // LiveOps raid windows (Apex Week / Prime Hunt / Bloom) fatten every mega bounty.
      ichorGain += Math.round(megaBossIchor(megaDef, k.tier, k.encounter, efficiency) * lo.megaIchorMult);
      timeline = pushTimeline(timeline, '◆', `Ichor bleed — ${megaDef.name} felled`);
    }

    if (contractHits.length > 0) {
      for (const c of contractHits) timeline = pushTimeline(timeline, '❖', `Contract honoured — ${c.name}`);
      if (perfectWeek) timeline = pushTimeline(timeline, '❖', 'PERFECT WEEK — every Champion Contract honoured');
    }
    // NEMESIS (docs/NEMESIS.md): a boss standing over the fallen Nucleus becomes — or
    // deepens — the hunt. Wins never touch it; revenge clears it via the bossKilled lane.
    const fallenTo = !result.won ? (result.stats.bossesAtDefeat ?? []) : [];
    const nextNemesis = fallenTo.length > 0 ? deepenNemesis(save.nemesis, fallenTo[0]) : save.nemesis;
    if (fallenTo.length > 0) {
      const nm = bossDef(fallenTo[0])?.name ?? fallenTo[0];
      timeline = pushTimeline(timeline, '☠', save.nemesis?.defId === fallenTo[0]
        ? `The Nemesis deepens — ${nm} has slain you ${nextNemesis!.slain} times`
        : `Nemesis risen — ${nm} will remember you`);
    }
    // INFESTATION (docs/INFESTATION.md): every finished run feeds the conquest board.
    // Target = the pinned sector, else the emptiest (spread by default). Lazy decay is
    // folded into the stored level at write time.
    const infestNow = Date.now();
    const infestGain = runInfestGain(result.wave, result.won);
    let nextInfestation = save.infestation;
    if (infestGain > 0) {
      // THE FRONT (docs/INFESTATION.md §front): resolve yesterday's incursion BEFORE feeding
      // (an undefended attack bites the pre-feed board), boost hotspot feeds, and record a
      // defense when a WON run feeds today's attacked sector.
      const frontDay = dayKey(infestNow);
      const frontYesterday = dayKey(infestNow - 86_400_000);
      let frontSectors = save.infestation.sectors as Record<string, { level: number; updatedAt: number } | undefined>;
      let lastIncursionDay = save.infestation.lastIncursionDay;
      if (lastIncursionDay < frontYesterday) {
        const bite = resolveIncursionBite(frontSectors, frontYesterday, save.infestation.defenses, infestNow);
        frontSectors = bite.sectors;
        lastIncursionDay = frontYesterday;
      }
      // Pin may be a sector OR a region (feed its emptiest); overflow SPILLS instead of
      // wasting — same region first, then the emptiest anywhere (docs/INFESTATION.md §spillover).
      const targetId = resolveFeedTarget(save.infestation.target, frontSectors, infestNow);
      const boosted = targetId === hotspotSectorId(frontDay) ? Math.round(infestGain * HOTSPOT_FEED_MULT) : infestGain;
      const fedResult = feedInfestation(frontSectors, targetId, boosted, infestNow);
      // DEFENSE CREDIT: a WON run whose feed touched today's attacked sector holds it. The
      // ring stays bounded (newest 14 day-keys) — it is only ever read for yesterday.
      const incursion = incursionSectorId(frontDay, frontSectors, infestNow);
      let defenses = save.infestation.defenses;
      if (result.won && incursion && fedResult.fed.some((f) => f.id === incursion)) {
        const entries = Object.entries({ ...defenses, [frontDay]: incursion }).sort(([a], [b]) => (a < b ? -1 : 1)).slice(-14);
        defenses = Object.fromEntries(entries);
      }
      nextInfestation = { ...save.infestation, sectors: fedResult.sectors, defenses, lastIncursionDay };
    }
    // Account XP (docs/ACCOUNT-LEVEL.md): the run's play fold — kills, waves, bosses, mode beats.
    // Acquisition/achievement XP land in their own folds; this is the "playing pays" lane. PLAY XP
    // scales with the account's depth at run start (§depth); contract bonuses stay flat — their
    // ContractsCard previews quote the table value (previews == outcomes).
    const depthMult = depthXpMult(accountDepth(highestCampaignStage(save), save.bestWave));
    const playXp =
      result.kills * ACCOUNT_XP.kill +
        bossKills * ACCOUNT_XP.bossKill +
        (result.stats.megaKills?.length ?? 0) * ACCOUNT_XP.megaKill +
        result.wave * ACCOUNT_XP.wave +
        (isRush ? result.wave * ACCOUNT_XP.bossRushWavePremium : 0) +
        (result.won ? ACCOUNT_XP.win : 0) +
        (isCampaign && result.won ? stageNo * ACCOUNT_XP.campaignClearPerStage + (firstClear ? ACCOUNT_XP.campaignFirstClear : 0) : 0) +
        (isDaily && result.won ? ACCOUNT_XP.dailyComplete : 0);
    const flatXp = contractHits.length * ACCOUNT_XP.contract + (perfectWeek ? ACCOUNT_XP.perfectWeek : 0);
    const runXp = playXp * depthMult + flatXp;
    const periodXp = playXp + flatXp; // the weekly/monthly boards count activity, before the depth multiplier
    const acctXpBefore = save.accountXp.xp;
    const settled: SaveData = {
      ...save,
      prediction,
      createdAt: save.createdAt || Date.now(),
      timeline,
      contracts: {
        completed: contractLedger,
        perfectWeeks: save.contracts.perfectWeeks + (perfectWeek ? 1 : 0),
        lastPerfect: perfectWeek ? contractWeek : save.contracts.lastPerfect,
      },
      directives: nextDirectives,
      nemesis: nextNemesis ?? null,
      infestation: nextInfestation,
      cosmetics: contractHits.some((c) => c.reward.cosmetic && !save.cosmetics.owned.includes(c.reward.cosmetic))
        ? { ...save.cosmetics, owned: [...save.cosmetics.owned, ...contractHits.map((c) => c.reward.cosmetic).filter((id): id is string => !!id && !save.cosmetics.owned.includes(id))] }
        : save.cosmetics,
      shards: save.shards + shardsEarned,
      lifetimeShards: save.lifetimeShards + shardsEarned,
      ichor: save.ichor + ichorGain,
      lifetimeIchor: save.lifetimeIchor + ichorGain,
      bestWave: isRush || isDaily ? save.bestWave : Math.max(save.bestWave, result.wave),
      // Mega ledger: fold the run's abilities-survived count (kill/WP records land via events).
      megaProgress: (result.stats.megaAbilitiesSurvived ?? 0) > 0
        ? { ...save.megaProgress, abilitiesSurvived: save.megaProgress.abilitiesSurvived + (result.stats.megaAbilitiesSurvived ?? 0) }
        : save.megaProgress,
      rushBestWave: isRush ? Math.max(save.rushBestWave, result.wave) : save.rushBestWave,
      rushBestBoss: isRush ? Math.max(save.rushBestBoss, bossKills) : save.rushBestBoss,
      daily: nextDaily,
      totalRuns: save.totalRuns + 1,
      towerMasteryXp,
      research: { ...save.research, pendingBoosts: [] }, // one-run boosts consumed by THIS finish (docs/RESEARCH.md)
      towerKills,
      heroMasteryXp,
      heroKills,
      heroFavEquip,
      stats: accumulateStats(save.stats, result.stats, result.mastery, { durationSec: result.durationSec, doctrine: result.doctrine, bossRush: isRush }),
      geneEssence: save.geneEssence + Math.round(doctrineEssence * asc.essenceGainMult * lo.essenceMult), // Corrupted Genome essence × Ascendant Alchemy × LiveOps essence lane (all ×1/0 by default)
      lootQueue: lootAdv.state,
      pendingContainers: [...pendingBase, ...newlyBanked], // bank the run-end remainder + cache (unopened); an unqualified Infinite run rolled its live loot back out of pendingBase
      unlockedTitles: threatSettled && threatSettled.outcome.titles.length > 0 ? [...unlockedTitles, ...threatSettled.outcome.titles] : unlockedTitles,
      unlockedLore,
      threat: threatSettled ? threatSettled.record : save.threat, // v55 Threat records (docs/THREAT.md)
      // Prestige: this run's Shards count toward the current Molt cycle's mint metric.
      prestige: { ...save.prestige, cycleShards: save.prestige.cycleShards + shardsEarned },
      campaign: nextCampaign,
    };
    persist(foldAccountXp(withIncome(withPeakPower(settled, settled), save), runXp, Date.now(), periodXp).save); // v56: peak Power + the per-run income ledger
    runLootBanked = 0; // this run is settled — re-arm the live-bank cycle for the next run
    runContainersBanked = [];
    // Run-end milestones (extract, kills, mastery, …). The Results screen shows these inline AFTER
    // the reward sequence; the floating toaster is suppressed off-menu so nothing covers the stats.
    const unlockedAchievements = this.evaluateAchievements({ ...result, bossKills: result.stats.bossKills })
      .map(achievementById)
      .filter((d): d is AchievementDef => !!d);
    // Battle Pass XP (docs/BATTLEPASS.md §xp): every meaningful activity feeds the season.
    // Kills + waves are the base; bosses/megas/wins/stages/daily-clears/contracts stack on.
    const passXp = Math.round(
      result.kills * 0.5
      + result.wave * 8
      + (result.stats.bossKills ?? 0) * 25
      + (result.stats.megaKills?.length ?? 0) * 80
      + (result.won ? 120 : 30)
      + (result.campaignStage ?? 0) * 3
      + (isDaily && result.won ? 200 : 0)
      + contractHits.length * 150,
    );
    const passLevelUp = this.grantPassXp('run', passXp);
    // Quests (docs/QUESTS.md §credit): the settled run feeds both lanes' missions — the same
    // facts the contracts judge saw, plus the depth extras. Completions surface on Results.
    const questMissions = this.creditQuests({
      type: 'run',
      facts: {
        ...contractFacts,
        bossKills: result.stats.bossKills ?? 0,
        megaKills: result.stats.megaKills?.length ?? 0,
      },
    }).map((mi) => ({ id: mi.id, name: mi.name, quest: questById(mi.id.slice(0, mi.id.indexOf(':')))?.name ?? '' }));
    // Wardrobe auto-unlocks ride the same seam (new stage/depth/daily/rush/roulette records).
    this.pollWardrobeUnlocks();
    // Genome Rank promotions (docs/GENOME-RANK.md): the settle may have crossed a rank —
    // grant + queue now so the cinematic fires the moment the player returns to the menu.
    this.pollGenomePromotions();
    // The settle's TOTAL Account-XP delta (run fold + the achievement fold inside evaluate) —
    // drained here so Results owns this settle's level-ups (the menu toaster shows the rest).
    const acctAfter = store.get().accountXp.xp;
    const accountXp: AccountXpDelta = {
      gained: acctAfter - acctXpBefore,
      from: levelFromXp(acctXpBefore),
      to: levelFromXp(acctAfter),
      levelUps: pendingAccountLevelUps.splice(0),
      ...(depthMult > 1 ? { depthMult } : {}),
    };
    const momentumMult = adaptive ? adaptiveIncomeMult(adaptive) : 1;
    const outcome: RunOutcome = {
      passXp,
      ...(passLevelUp ? { passLevelUp } : {}),
      accountXp,
      ...(momentumMult > 1.005 ? { momentum: momentumMult } : {}),
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
      ...(result.stats.megaHunt ? { megaHunt: megaHuntOutcome(store.get(), result.stats.megaHunt, huntRanksGained, huntCores) } : {}),
      ...(isDaily ? { dailyProgress: { cores: dailyCoreBonus, streak: nextDaily.streak, cleared: result.won } } : {}),
      ...(contractHits.length > 0 ? { contracts: contractHits.map((c) => ({ id: c.id, name: c.name, cores: c.reward.cores, cosmetic: c.reward.cosmetic })) } : {}),
      ...(questMissions.length > 0 ? { questMissions } : {}),
      ...(contractNears.length > 0 ? { contractNears } : {}),
      ...(perfectWeek ? { perfectWeek: { cores: PERFECT_WEEK.cores } } : {}),
      // First-defeat story premieres queued by the megaKilled lane — drained here so they
      // play exactly once, after THIS run's reward summary (docs/CUTSCENES.md §autoplay).
      ...(pendingMegaCutscenes.length > 0 ? { megaCutscenes: pendingMegaCutscenes.splice(0) } : {}),
      flawlessCache,
      ...(threatSettled ? { threat: threatSettled.outcome } : {}),
    };
    // Reward placards (docs/NOTIFICATIONS.md §reward-toasts): the run's account-level take,
    // announced through the global toaster. Pushed while Results is up ⇒ the bus HOLDS them
    // and they land as the claim trail the moment the player returns to the hub.
    {
      const toastSource = isRush ? 'Boss Rush'
        : isCampaign ? `Campaign Stage ${stageNo}`
        : result.endless ? `Infinite — Depth ${result.wave}`
        : isDaily ? 'Daily Run' : 'Field Run';
      const ev: ToastEvents = [];
      if (shardsEarned > 0) ev.push({ type: 'genomeCores', qty: shardsEarned });
      if (passXp > 0) ev.push({ type: 'bpXp', qty: passXp });
      for (const c of bankedThisRun) ev.push(c.kind === 'cache' ? { type: 'runCache' } : { type: 'container', rarity: c.rarity });
      if (ev.length > 0) rewardToast.pushMany(toastSource, ev);
    }
    settledOutcomes.set(result, outcome);
    return outcome;
  },

  /** Equip (or clear, id=null) a mastery title for the player profile. No-op if the title
   * isn't unlocked (defensive — the UI only offers unlocked ones). */
  equipTitle(id: string | null): void {
    const save = store.get();
    if (id !== null && !save.unlockedTitles.includes(id)) return;
    persist({ ...save, equippedTitle: id });
  },

  /** Rename the Commander (Player Profile banner + leaderboards). Mirrors the SERVER's
   *  sanitizeName exactly (functions/lib/validate.ts): control/markup chars stripped,
   *  trimmed, ≤20 chars, minimum 2 — so the name a player picks is the name others see.
   *  Junk that sanitizes below 2 chars is a no-op (the UI disables Confirm first). */
  setProfileName(name: string): void {
    const cleaned = sanitizeCommanderName(name);
    if (cleaned === null) return;
    try {
      // An EXPLICIT choice (even re-choosing the default) ends the designation prompt.
      localStorage.setItem('assimilate.designated', '1');
    } catch {
      /* storage unavailable — the prompt gates on the name value alone */
    }
    persist({ ...store.get(), profileName: cleaned });
  },

  /** Wear a commissioning sigil (docs/PROFILE.md §commissioning) — null clears it. Unknown ids
   *  are refused (the picker only offers registry rows; imports sanitize separately). */
  setProfileSigil(id: string | null): void {
    if (id !== null && sigilById(id) === null) return;
    persist({ ...store.get(), profileSigil: id });
  },

  /** THE COMMISSIONING (docs/PROFILE.md §commissioning) — the one-time identity settle at
   *  tutorial completion: designation + sigil + the founding-title oath in ONE persist.
   *  Every part is optional (each ceremony step is skippable); the founding title grants
   *  ONLY the chosen one — the other two are the roads not taken, permanently (an identity
   *  choice, like a doctrine oath). Re-invocations never re-grant a second founding title. */
  commission(choice: { name?: string; sigilId?: string | null; titleId?: string | null }): void {
    let save = store.get();
    const cleaned = choice.name !== undefined ? sanitizeCommanderName(choice.name) : null;
    if (cleaned !== null) {
      save = { ...save, profileName: cleaned };
      try { localStorage.setItem('assimilate.designated', '1'); } catch { /* name value gates alone */ }
    }
    if (choice.sigilId !== undefined && (choice.sigilId === null || sigilById(choice.sigilId) !== null)) {
      save = { ...save, profileSigil: choice.sigilId };
    }
    const title = choice.titleId ? FOUNDING_TITLES.find((t) => t.id === choice.titleId) : undefined;
    const alreadySwore = FOUNDING_TITLES.some((t) => save.unlockedTitles.includes(t.id));
    if (title && !alreadySwore) {
      save = { ...save, unlockedTitles: [...save.unlockedTitles, title.id], equippedTitle: title.id };
    }
    persist(save);
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
    // DORMANT until the account's first Mega Boss kill (docs/LOOTBOX.md §meter): the meter
    // banks nothing — runs pay run/stage caches only. The slain ledger writes LIVE on the
    // megaKilled event, so the run that fells the first mega awakens the meter mid-run and
    // finishRun banks its full backlog (nothing earned before the kill is lost).
    if (!hasSlainMega(save)) return [];
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
   * Null when nothing is pending (or a tampered entry can't be resolved → discarded).
   * `guarded: false` is ONLY for openContainers(), which gates the whole batch once. */
  openContainer(guarded = true): CrackedContainer | null {
    if (guarded && !guardOk('container.open')) return null;
    const save = store.get();
    const [c, ...rest] = save.pendingContainers;
    if (!c) return null;
    const towerShards = { ...save.towerShards };
    const heroShards = { ...save.heroShards };
    // Hero-shard pulls bias toward still-locked, Shard-UNLOCKABLE heroes (see heroShardUnlockPool):
    // milestone heroes are excluded so they don't soak unlock-shards, and once the queue drains the
    // pool empties ⇒ shards fund Stars for EVERY hero (Vitriol included) — the HERO_IDS fallback.
    const lockedPool = heroShardUnlockPool(save);
    // Tower-shard drops are GATED: a locked tower's shards drop only after its campaign gate is met,
    // so a deep-gated tower's shards never leak before its stage (Coil/Siphon — docs/SIPHON.md §gate).
    const towerPool = towerShardPool(save);
    let mats = save.mats;
    let chest: ChestResult;
    let label: string;
    let color: string;
    if (c.kind === 'cache') {
      const def = CHESTS[c.chestId] ?? CHESTS[RUN_CHEST];
      chest = rollChest(def, Math.random, lockedPool, towerPool);
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
      const [award] = openLootBoxes([c.rarity], towerShards, heroShards, lockedPool, towerPool);
      chest = award.chest;
      const def = rarityRegistry.get(c.rarity);
      label = `${def?.name ?? c.rarity} Container`;
      color = def?.color ?? 'var(--r-common)';
    } else { // junk id from a tampered save → discard, no reward
      persist({ ...save, pendingContainers: rest });
      return null;
    }
    // Unified equipment drop (docs/EQUIPMENT.md §gear-chase): ~50% chance per container, AT MOST ONE
    // item, stamped with the account's DEPTH item level (uncapped log curve) and rolled from that
    // level's rarity band. Folded into the reveal (chest.items/equipment) + inventory here so BOTH
    // container kinds award gear identically — equipment no longer drops per-roll from the chest pools.
    const power = composePower(accountPowerParts(save)).score;
    if (Math.random() < EQUIP_DROP_CHANCE) {
      const item = rollItemForDepth(Math.random, highestCampaignStage(save), save.bestWave);
      // FIRST DISCOVERY (docs/LOOTBOX.md §opening-flow): the def was never owned — the Gear
      // Codex's PERMANENT ledger (v56, GM1: salvaging the last copy no longer re-arms NEW). Each
      // open persists before the next, so the second copy in a multi-open batch is NOT new.
      const isNew = !gearDiscovered(save).has(item.defId);
      chest.items.push({ type: 'equipment', rarity: item.rarity, item, isNew });
      chest.equipment.push(item);
    }
    // Secondary crafting-material drop (docs/EQUIPMENT.md §Materials): low chance, small stacks, a
    // pity-protected RARE catalyst — scaled by Power + campaign progress + this container's rarity.
    // Applied to BOTH container kinds so every Vault container can feed crafting (equipment stays
    // primary). Folded into the reveal + save; matPity persists the guarantee across containers.
    const ascOpen = ascendantBonuses(save.prestige.nodes); // Alchemy/Forgeblood income levers (×1 without nodes)
    // LiveOps calendar lanes (docs/LIVEOPS.md): essence/material windows scale each reward AT ITS
    // SOURCE scalar (before it feeds both the reveal item and the grant), so the ceremony always
    // shows exactly what was banked. Every lane is ×1 outside its window — inert baseline.
    const loBase = liveopsMods();
    const loEv = liveEventLaneModsNow(); // the identity events' lane boosts stack in (LIVE-EVENTS.md §4)
    const lo = Object.fromEntries((Object.keys(loBase) as (keyof typeof loBase)[]).map((k) => [k, loBase[k] * loEv[k]])) as typeof loBase;
    const { drop, pity } = rollMaterialDrop({
      containerRarity: chest.topRarity, power, campaignStage: highestCampaignStage(save), pity: save.matPity, rng: Math.random,
    });
    if (drop) {
      const matAmt = Math.max(1, Math.round(drop.amount * ascOpen.matGainMult * lo.materialsMult)); // × Ascendant Forgeblood × Harvest window
      chest.items.push({ type: 'material', rarity: drop.rarity, mat: drop.mat, amount: matAmt });
      chest.materials[drop.mat] += matAmt;
      mats = { ...mats, [drop.mat]: mats[drop.mat] + matAmt };
    }
    // ── Gene Essence — duplicate conversion (docs/GENE-EVOLUTION.md §Economy). A tower/hero at MAX
    //    Star progression — or a tower whose bank already funds its whole remaining ★ ladder (the
    //    campaign-capped surplus, 2026-11) — can't spend more shards, so the shards GRANTED by this open (diffed from the
    //    pre-open save, so it's path-agnostic + un-farmable) convert to Gene Essence, scaled by the
    //    container's rarity, instead of piling up dead. The excess is reverted from the shard totals so
    //    it never accumulates, and shown immediately on the reveal (a `geneEssence` event item). ──
    // The container's TRUE rarity: a loot box IS its box rarity (its pulls all read 'common'); a run
    // cache reads its best pull. Feeds both the conversion rate and the bonus-drop scaling below.
    const containerRarity = c.kind === 'loot' ? c.rarity : chest.topRarity;
    let essenceGained = 0;
    let towerDupes = 0;
    for (const k of TOWER_ORDER) {
      const before = save.towerShards[k] ?? 0;
      const granted = (towerShards[k] ?? 0) - before;
      // SURPLUS → Essence (BALANCE_ARCHITECTURE.md §9): convert only what the bank can never spend —
      // shards past the tower's unlock + every remaining ★ (towerShardNeed; 0 at ★max, so a maxed
      // tower converts its whole grant exactly as before). Shards that still fund a future ★ bank.
      const excess = Math.min(granted, (towerShards[k] ?? 0) - Math.max(before, towerShardNeed(save, k)));
      if (excess > 0) {
        towerShards[k] = (towerShards[k] ?? 0) - excess;
        towerDupes += excess;
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
      const amt = Math.round(essenceForDuplicates(containerRarity, towerDupes) * ascOpen.essenceGainMult * lo.essenceMult);
      essenceGained += amt;
      chest.items.push({ type: 'event', rarity: chest.topRarity, currency: 'geneEssence', amount: amt, note: `Duplicate ${rName} Tower` });
    }
    if (heroDupes > 0) {
      const amt = Math.round(essenceForDuplicates(containerRarity, heroDupes) * ascOpen.essenceGainMult * lo.essenceMult);
      essenceGained += amt;
      chest.items.push({ type: 'event', rarity: chest.topRarity, currency: 'geneEssence', amount: amt, note: `Duplicate ${rName} Hero` });
    }
    // ── Gene Essence — bonus container drop (Task 3): a rare, small, purely-ADDITIVE roll (never
    //    replaces a guaranteed reward), scaled by the container's rarity + slightly by Campaign
    //    progress and Power Score. Duplicate conversion above stays the dominant source (simulated
    //    in docs/GENE-EVOLUTION.md §Economy). ──
    const essenceDrop = Math.round(rollEssenceDrop({ containerRarity, power, campaignStage: highestCampaignStage(save), rng: Math.random }) * ascOpen.essenceGainMult * lo.essenceMult);
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
    // ── Mulligan spoils (docs/MULLIGANS.md §loot): every container bleeds a little Gene Essence
    //    (the unified gene currency — it levels Gene Cards AND Mulligan modifiers), scaled by
    //    rarity; epic+ containers additionally DISCOVER a random modifier at a rolled rarity
    //    (recording the best rarity seen in the dex). Purely additive — a fresh account is unaffected. ──
    const BLEED_BY_RARITY: Record<string, number> = { common: 15, rare: 30, epic: 55, legendary: 90, exotic: 140, mythic: 200 };
    const bleedTotal = Math.round((BLEED_BY_RARITY[containerRarity] ?? 15) * (0.7 + Math.random() * 0.6) * lo.essenceMult);
    const premiumMull = containerRarity === 'epic' || containerRarity === 'legendary' || containerRarity === 'exotic' || containerRarity === 'mythic';
    // §localized (docs/ECONOMY.md): once Mulligans are unlocked, a premium container's bleed
    // SPLITS EVENLY between Gene Essence and GRAFT TISSUE — halves of the SAME bleed, never a
    // second one (value unchanged; the two share a unit price). This is the mid-catalog
    // Mulligan-Tissue faucet: duplicate dissolves only flow once the catalog is fully sequenced,
    // so the bleed carries graft pace until then (sim-localized-economy pins ≥1.5 upgrades/week).
    const tissueBleed = premiumMull && meta.mulligansUnlocked() ? Math.round(bleedTotal * 0.5) : 0;
    const essenceBleed = bleedTotal - tissueBleed;
    let mulliganDex = save.mulliganDex;
    // Surface the bleed on the reveal (an event pull) so the spoils are never invisible.
    chest.items.push({ type: 'event', rarity: chest.topRarity, currency: 'geneEssence', amount: essenceBleed, note: 'Gene Bleed' });
    if (tissueBleed > 0) chest.items.push({ type: 'event', rarity: chest.topRarity, currency: 'mulliganTissue', amount: tissueBleed, note: 'Graft Bleed' });
    // ── GENE CARD DISCOVERY (docs/CARDS.md §discovery): the additive lane that permanently
    //    expands the Gene Archive. Chance by container rarity; pool = campaign-milestone
    //    rarity pools ∩ the card's own unlock gate; undiscovered strands carry the fading
    //    duplicate-protection boost; a roll that lands on a KNOWN strand echoes into Gene
    //    Essence (never a dead pull). Epic+ discoveries also mark the profile timeline. ──
    let genesDiscovered = save.genesDiscovered;
    let geneEchoEssence = 0;
    const geneRoll = rollGeneDiscovery(
      Math.random, containerRarity, highestCampaignStage(save),
      new Set(unlockedCardIds(save)), new Set(save.genesDiscovered),
    );
    if (geneRoll) {
      const magnitude: LootRarity = geneRoll.card.rarity === 'legendary' ? 'legendary'
        : geneRoll.card.rarity === 'epic' ? 'epic'
        : geneRoll.card.rarity === 'common' ? 'common' : 'rare'; // uncommon/rare read at 'rare' emphasis
      if (geneRoll.kind === 'discover') {
        genesDiscovered = [...genesDiscovered, geneRoll.card.id];
        chest.items.push({ type: 'gene', rarity: magnitude, cardRarity: geneRoll.card.rarity, cardId: geneRoll.card.id, isNew: true });
      } else {
        geneEchoEssence = Math.round(geneRoll.essence * ascOpen.essenceGainMult * lo.essenceMult);
        chest.items.push({ type: 'gene', rarity: magnitude, cardRarity: geneRoll.card.rarity, cardId: geneRoll.card.id, isNew: false, echoEssence: geneEchoEssence });
      }
    }
    let dupeTissue = 0;
    // §gate: pieces only drop once the pillar is unlocked (3 distinct Mega Bosses slain,
    // or the account already holds pieces — grandfathered pre-v29 progress).
    if (premiumMull && meta.mulligansUnlocked()) {
      // §exclusivity economy: prefer an UNOWNED piece (pieces are unique — one copy each).
      // When the whole catalog is owned, the pull dissolves into Gene Essence on the spot
      // (there is no selling; duplicates never enter the inventory).
      const modIds = mulliganRegistry.ids();
      const unowned = modIds.filter((m) => !mulliganDex[m]);
      const rar = rollRarity(Math.random());
      const revealRarity: LootRarity = rar === 'ascendant' ? 'exotic' : rar === 'uncommon' ? 'common' : rar;
      if (unowned.length > 0) {
        const id = unowned[Math.floor(Math.random() * unowned.length)];
        mulliganDex = { ...mulliganDex, [id]: rar };
        // The DISCOVERY moment (docs/MULLIGANS.md §loot + §reveal) — a unique ceremony pull.
        chest.items.push({
          type: 'event', rarity: revealRarity, currency: 'mulliganModifier', amount: 1,
          note: `Modifier Sequenced — ${mulliganRegistry.get(id)?.name ?? id} (${MULLIGAN_RARITY[rar].label})`,
        });
      } else {
        // §localized: a fully-sequenced catalog dissolves duplicates into MULLIGAN TISSUE — the
        // same numbers the old Gene-Essence table paid (a currency swap, never new value).
        dupeTissue = DUP_TISSUE[rar];
        const dupId = modIds[Math.floor(Math.random() * modIds.length)];
        chest.items.push({
          type: 'event', rarity: revealRarity, currency: 'mulliganTissue', amount: dupeTissue,
          note: `Duplicate Dissolved — ${mulliganRegistry.get(dupId)?.name ?? 'Modifier'} (${MULLIGAN_RARITY[rar].label})`,
        });
      }
    }
    persist({
      ...save, towerShards, heroShards, mats, matPity: pity, antigen,
      geneEssence: save.geneEssence + essenceGained + essenceBleed + geneEchoEssence,
      mulliganTissue: save.mulliganTissue + tissueBleed + dupeTissue,
      mulliganDex,
      genesDiscovered,
      timeline: geneRoll?.kind === 'discover' && (geneRoll.card.rarity === 'epic' || geneRoll.card.rarity === 'legendary')
        ? pushTimeline(save.timeline, '🧬', `${geneRoll.card.name} sequenced — ${geneRoll.card.rarity} strand discovered`)
        : save.timeline,
      ichor: save.ichor + ichorBleed,
      lifetimeIchor: save.lifetimeIchor + ichorBleed,
      equipment: { ...save.equipment, inventory: [...save.equipment.inventory, ...chest.equipment] },
      pendingContainers: rest,
      metabolism: bumpCounter(save.metabolism, 'containersOpened'), // Hatchery Habit (docs/METABOLISM.md)
    });
    this.creditQuests({ type: 'containers', n: 1 }); // the Vault feeds the directive layer (docs/QUESTS.md §credit)
    return { chest, label, color };
  },

  /** Crack up to `count` pending containers as ONE gesture (Open Five/Ten/All). Guarded ONCE:
   * the per-open cooldown paces ceremony spam, not a single multi-open press — guarding each
   * open would refuse calls 2..N of the synchronous loop and silently open one container
   * (same batch-is-one-action reasoning as quest.claim's board clear). Each open still
   * persists before the next so isNew/pity/duplicate-conversion stay per-open correct.
   * Returns the opened containers in crack order (fewer when the stockpile runs dry). */
  openContainers(count: number): CrackedContainer[] {
    if (!Number.isFinite(count) || count < 1 || !guardOk('container.open')) return [];
    const out: CrackedContainer[] = [];
    for (let i = 0; i < count; i++) {
      const award = this.openContainer(false); // the batch was gated above
      if (!award) break;
      out.push(award);
    }
    return out;
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
    // Every achievement also pays Account XP (docs/ACCOUNT-LEVEL.md) — folded into the SAME persist.
    persist(foldAccountXp({
      ...save,
      shards: save.shards + reward,
      lifetimeShards: save.lifetimeShards + reward,
      ichor: save.ichor + ichorReward,
      lifetimeIchor: save.lifetimeIchor + ichorReward,
      achievements: [...(save.achievements ?? []), ...newly.map((a) => a.id)],
      timeline,
    }, newly.length * ACCOUNT_XP.achievement).save);
    // Achievements feed the Battle Pass (docs/BATTLEPASS.md §xp) — a flat bounty per unlock.
    this.grantPassXp('achievement', newly.length * 150);
    return newly.map((a) => a.id);
  },

  /** Per-tower run multipliers from the current save (passed into a new Game).
   * `mulliganOverride` substitutes the account's organisms — the Daily Run's loadout. */
  towerProgress(mulliganOverride?: Partial<Record<TowerKind, MulliganState>>): TowerProgress {
    return towerProgress(store.get(), true, mulliganOverride);
  },

  /** Choose a star-fork option for a tower (keyed by the fork's star). Re-selectable any
   * time; takes effect on the next run (folded by towerProgress). */
  setTowerFork(kind: TowerKind, star: number, optionId: string): void {
    const save = store.get();
    const forKind = { ...(save.towerForks[kind] ?? {}), [String(star)]: optionId };
    persist({ ...save, towerForks: { ...save.towerForks, [kind]: forKind } });
  },

  /** The ability-fork tiers a hero has UNLOCKED at its current star (empty until ★5). Drives the
   * Hero Lab fork picker; pairs with the hero's saved picks (heroForks). */
  heroForkTiers(kind: HeroKind): HeroForkTier[] {
    return heroForkTiers(kind, store.get().heroStars[kind] ?? 0);
  },
  /** The hero's current fork picks (star → optionId); unset stars default to their first option. */
  heroForkPicks(kind: HeroKind): Record<string, string> {
    return store.get().heroForks[kind] ?? {};
  },
  /** Choose an ability-fork option for a hero (keyed by the fork's star). Re-selectable any time;
   * takes effect on the next run (resolved by heroAbilityKits). Mirrors setTowerFork. */
  setHeroFork(kind: HeroKind, star: number, optionId: string): void {
    const save = store.get();
    const forKind = { ...(save.heroForks[kind] ?? {}), [String(star)]: optionId };
    persist({ ...save, heroForks: { ...save.heroForks, [kind]: forKind } });
  },

  /** The Adaptation tree for a unit (nodes + spendable Antigen Points). */
  adaptation(subject: 'tower' | 'hero', unit: string): AdaptView {
    return adaptationView(store.get(), subject, unit);
  },
  /** Spend one Antigen Point on an adaptation node — if a point is free AND the node is pickable
   *  (tier ladder + campaign gate + no exclusive sibling owned). Takes effect on the next run. */
  spendAdaptation(subject: 'tower' | 'hero', unit: string, nodeId: string): boolean {
    const save = store.get();
    // A DORMANT tower's tree is locked shut — Antigen only flows into synthesized organisms
    // (the Lab shows the same lock; this guard keeps every other surface honest).
    if (subject === 'tower' && !isTowerUnlocked(save, unit as TowerKind)) return false;
    // Antigen BANKS until the Adaptation Chamber opens (docs/PROGRESSION-GATING.md) — no surface
    // (a best-move shortcut, a stale tab) may spend it before the wing is revealed.
    if (!featureRevealed(save, 'adaptation')) return false;
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

  /** Record today's Power Score in the save's daily history ledger (docs/POWER-SCORE.md
   * §history). Idempotent per (day, score) — an unchanged score never writes. Called on app
   * boot and (debounced) after power gains; system bookkeeping, not a player action. */
  notePowerSnapshot(): void {
    const save = store.get();
    const next = withPowerLogged(save, composePower(accountPowerParts(save)).score);
    if (next !== save) persist(next);
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
  /** Chosen Transcendence options (card id → option id) for a run boot (§Transcendence).
   *  Sparse; empty ⇒ no second lines (golden path). */
  geneTranscends(): Record<string, string> {
    const out: Record<string, string> = {};
    const g = store.get().genes;
    for (const id in g) { const t = g[id].transcend; if (t) out[id] = t; }
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
  /** The card ids that AUTO-ACTIVATE at run boot: the equipped, DISCOVERED cards in unlocked
   *  slots. Passed to the Game as RunOptions.startingGenes; empty ⇒ nothing applied (golden path). */
  startingGenes(): string[] {
    const s = store.get();
    const owned = new Set(s.genesDiscovered ?? []);
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
      if (!(s.genesDiscovered ?? []).includes(id)) return false; // must be discovered
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
  // ── Phenotypes (docs/COSMETICS.md) — own/equip/cultivate. Pure presentation: the sim
  //    never reads any of this; equips only change what GameView threads to the renderer. ──
  // ── Infestation map (docs/INFESTATION.md) — the persistent conquest board. ──
  /** The full territory read-model: per-sector live level + tier + decay forecasts + the
   *  feed destination preview, per-region live passive + entrenchment, and map totals. */
  infestationView(now = Date.now()): InfestationMapView {
    const s = store.get();
    const raw = s.infestation.sectors;
    const feedsInto = resolveFeedTarget(s.infestation.target, raw, now);
    const sectors: Record<string, number> = {};
    const sectorDetails: InfestationMapView['sectorDetails'] = {};
    for (const x of ALL_SECTORS) {
      const lvl = effectiveLevel(raw[x.id], now);
      sectors[x.id] = lvl;
      sectorDetails[x.id] = {
        id: x.id, name: x.name, level: lvl, tier: tierOf(lvl),
        zeroInDays: zeroInDays(raw[x.id], now), tierHoldDays: tierHoldDays(raw[x.id], now),
        saturated: lvl >= SATURATED_AT, // one band with the Saturated tier (docs §front)
      };
    }
    const regions = REGIONS.map((def) => {
      const fraction = regionFraction(def, raw, now);
      const entrenched = isEntrenched(def, raw, now);
      const pct = Math.round((def.bonus.max - 1) * fraction * (entrenched ? 1.25 : 1) * 1000) / 10;
      return { def, fraction, entrenched, bonusNow: `${def.bonus.label} +${pct}%` };
    });
    const total = ALL_SECTORS.reduce((a, x) => a + sectors[x.id], 0);
    return {
      regions, sectors, sectorDetails,
      target: s.infestation.target,
      feedsInto,
      completion: total / (ALL_SECTORS.length * 100),
      saturatedCount: ALL_SECTORS.filter((x) => sectorDetails[x.id].saturated).length,
      dormant: total <= 0,
    };
  },
  /** Pin where future runs feed: a SECTOR id, a REGION id (its emptiest sector), or null
   *  (auto-spread to the emptiest anywhere). */
  setInfestTarget(id: string | null): boolean {
    const s = store.get();
    if (id !== null && !isValidInfestTarget(id)) return false;
    persist({ ...s, infestation: { ...s.infestation, target: id } });
    return true;
  },
  /** The map's region passives, folded into every run like gear. [] on a fresh board. */
  infestationRunEffects(now = Date.now()): CardEffect[] {
    return infestationEffects(store.get().infestation.sectors, now);
  },

  // ── THE FRONT (docs/INFESTATION.md §front) — the war layer: claims, tribute, incursions. ──
  /** The Front's read-model: today's hotspot + incursion, claimable tier spoils, tributes. */
  frontView(now = Date.now()): FrontView {
    const s = store.get();
    const raw = s.infestation.sectors;
    const day = dayKey(now);
    const hotId = hotspotSectorId(day);
    const hotDef = ALL_SECTORS.find((x) => x.id === hotId)!;
    const incId = incursionSectorId(day, raw, now);
    const tierClaims: FrontView['tierClaims'] = [];
    for (const x of ALL_SECTORS) {
      const region = regionOfSector(x.id)!;
      const cur = tierOf(effectiveLevel(raw[x.id], now)).index;
      const claimed = s.infestation.tierClaims[x.id] ?? 0;
      const pending = CLAIMABLE_TIERS.filter((t) => t <= cur && t > claimed);
      if (pending.length === 0) continue;
      tierClaims.push({
        id: x.id, name: x.name, regionId: region.id, tierName: SECTOR_TIERS[cur].name,
        rewards: pending.flatMap((t) => tierReward(region.id, t)),
      });
    }
    const wk = weekKey(now);
    const tributes = REGIONS.map((r) => {
      const heldTiers = regionHeldTiers(r, raw, now);
      const rewards = tributeFor(r.id, heldTiers);
      const claimable = heldTiers >= TRIBUTE_MIN_TIERS && rewards.length > 0 && s.infestation.tributeWeeks[r.id] !== wk;
      return { regionId: r.id, name: r.name, heldTiers, claimable, rewards };
    });
    const incursion = incId
      ? { id: incId, name: ALL_SECTORS.find((x) => x.id === incId)!.name, defended: s.infestation.defenses[day] === incId, bite: INCURSION_BITE }
      : null;
    return {
      hotspot: { id: hotId, name: hotDef.name, regionName: regionOfSector(hotId)!.name, mult: HOTSPOT_FEED_MULT },
      incursion,
      tierClaims,
      tributes,
      claimableCount: tierClaims.length + tributes.filter((t) => t.claimable).length + (incursion && !incursion.defended ? 1 : 0),
    };
  },

  /** Claim every pending tier reward on a sector (one card, all unclaimed tiers up to the
   *  live one — a sector that fell and re-climbed never pays twice). Guarded + exactly-once. */
  claimFrontTier(sectorId: string): boolean {
    if (!guardOk('front.claim', sectorId)) return false;
    const s = store.get();
    const region = regionOfSector(sectorId);
    if (!region) return false;
    const now = Date.now();
    const cur = tierOf(effectiveLevel(s.infestation.sectors[sectorId], now)).index;
    const claimed = s.infestation.tierClaims[sectorId] ?? 0;
    const pending = CLAIMABLE_TIERS.filter((t) => t <= cur && t > claimed);
    if (pending.length === 0) return false;
    const rewards = pending.flatMap((t) => tierReward(region.id, t));
    const res = applyRewardList(s, rewards, { ichor: 0, cores: 0 }, null, 'front');
    const name = ALL_SECTORS.find((x) => x.id === sectorId)?.name ?? sectorId;
    rewardToast.pushMany(`The Front — ${name} ${SECTOR_TIERS[cur].name}`, res.events);
    persist({
      ...res.next,
      infestation: { ...res.next.infestation, tierClaims: { ...res.next.infestation.tierClaims, [sectorId]: Math.max(...pending) } },
      timeline: pushTimeline(res.next.timeline, '⛬', `The Front — ${name} secured at ${SECTOR_TIERS[cur].name}`),
    });
    return true;
  },

  /** Collect a region's weekly tribute (held tiers scale it; once per ISO week per region). */
  claimFrontTribute(regionId: string): boolean {
    if (!guardOk('front.claim', regionId)) return false;
    const s = store.get();
    const region = REGIONS.find((r) => r.id === regionId);
    if (!region) return false;
    const now = Date.now();
    const wk = weekKey(now);
    if (s.infestation.tributeWeeks[regionId] === wk) return false;
    const heldTiers = regionHeldTiers(region, s.infestation.sectors, now);
    if (heldTiers < TRIBUTE_MIN_TIERS) return false;
    const rewards = tributeFor(regionId, heldTiers);
    if (rewards.length === 0) return false;
    const res = applyRewardList(s, rewards, { ichor: 0, cores: 0 }, null, 'front');
    rewardToast.pushMany(`The Front — ${region.name} tribute`, res.events);
    persist({
      ...res.next,
      infestation: { ...res.next.infestation, tributeWeeks: { ...res.next.infestation.tributeWeeks, [regionId]: wk } },
      timeline: pushTimeline(res.next.timeline, '⛬', `The Front — ${region.name} pays tribute (${heldTiers} tiers held)`),
    });
    return true;
  },

  /** Advance the incursion cursor outside runs (the Front screen polls on mount): an
   *  undefended past attack bites at most ONCE per return — bounded pressure, never a
   *  death spiral (natural decay handles the rest of an absence). Idempotent per day. */
  pollFront(now = Date.now()): void {
    const s = store.get();
    const yesterday = dayKey(now - 86_400_000);
    if (s.infestation.lastIncursionDay >= yesterday) return;
    const res = resolveIncursionBite(s.infestation.sectors, yesterday, s.infestation.defenses, now);
    persist({ ...s, infestation: { ...s.infestation, sectors: res.sectors, lastIncursionDay: yesterday } });
  },

  // ── Story cutscenes (docs/CUTSCENES.md) — the Memory Archive. ──
  /** Every cutscene with its live unlock state — the Archive renders THIS. */
  cutscenesView(): { def: CutsceneDef; unlocked: boolean }[] {
    const save = store.get();
    return CUTSCENES.map((def) => ({ def, unlocked: isCutsceneUnlocked(save, def) }));
  },
  /** The Archive's small permanent passives — one per unlocked memory, folded into every
   *  run beside the other permanent lanes. [] on a fresh save (golden-safe). */
  cutsceneRunEffects(): CardEffect[] {
    return cutsceneEffects(unlockedCutsceneIds(store.get()));
  },

  // ── Weekly Directives (docs/LIVEOPS.md §directives) — the cumulative objective ladder. ──
  /** The console's board: this week's three directives (progress/complete/claimed) + the
   *  capstone state. Reads the save's ledger scoped to the current UTC week (a stale week from
   *  a save loaded across a boundary reads as an empty board — the next run re-accrues it). */
  directivesView(): {
    directives: { id: string; name: string; blurb: string; icon: string; target: number; progress: number; complete: boolean; claimed: boolean; reward: DirectiveReward }[];
    capstone: { earned: boolean; claimed: boolean; reward: DirectiveReward & { name: string; icon: string } };
    weekEndsInMs: number;
  } {
    const save = store.get();
    const wk = directiveWeekKey();
    const cur = save.directives.week === wk ? save.directives : { week: wk, progress: {}, claimed: [] };
    const board = directiveBoard(cur.progress, cur.claimed);
    const cap = capstoneState(cur.progress, cur.claimed);
    // The week ends at the next UTC-Monday midnight (weekIndex rolls on Monday).
    const now = liveopsNow();
    const dow = (now.getUTCDay() + 6) % 7; // 0 = Monday
    const weekEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow + 7);
    return {
      directives: board.map((b) => ({
        id: b.def.id, name: b.def.name, blurb: b.def.blurb, icon: b.def.icon,
        target: b.def.target, progress: b.progress, complete: b.complete, claimed: b.claimed, reward: b.def.reward,
      })),
      capstone: { ...cap, reward: DIRECTIVE_CAPSTONE },
      weekEndsInMs: Math.max(0, weekEnd - now.getTime()),
    };
  },
  /** Claim a completed directive's reward (or the capstone via id '__capstone'). Idempotent +
   *  guarded; grants cores/essence/container and marks the '<week>:<id>' ledger entry. */
  claimDirective(id: string): DirectiveReward | null {
    if (!guardOk('directive.claim', id)) return null;
    const save = store.get();
    const wk = directiveWeekKey();
    const cur = save.directives.week === wk ? save.directives : { week: wk, progress: {}, claimed: [] };
    const key = `${wk}:${id}`;
    if (cur.claimed.includes(key)) return null; // already claimed
    let reward: DirectiveReward | null = null;
    if (id === '__capstone') {
      const cap = capstoneState(cur.progress, cur.claimed);
      if (!cap.earned) return null;
      reward = DIRECTIVE_CAPSTONE;
    } else {
      const b = directiveBoard(cur.progress, cur.claimed).find((x) => x.def.id === id);
      if (!b || !b.complete) return null;
      reward = b.def.reward;
    }
    const cache: PendingContainer[] = reward.container ? [{ kind: 'cache', chestId: RUN_CHEST }] : [];
    persist({
      ...save,
      shards: save.shards + (reward.cores ?? 0),
      lifetimeShards: save.lifetimeShards + (reward.cores ?? 0),
      geneEssence: save.geneEssence + (reward.essence ?? 0),
      pendingContainers: [...save.pendingContainers, ...cache],
      directives: { week: wk, progress: cur.progress, claimed: [...cur.claimed, key] },
      timeline: pushTimeline(save.timeline, '❇', `Directive claimed — ${id === '__capstone' ? DIRECTIVE_CAPSTONE.name : (activeDirectives().find((x) => x.id === id)?.name ?? id)}`),
    });
    {
      const ev: ToastEvents = [];
      if (reward.cores) ev.push({ type: 'genomeCores', qty: reward.cores });
      if (reward.essence) ev.push({ type: 'geneEssence', qty: reward.essence });
      if (reward.container) ev.push({ type: 'runCache' });
      rewardToast.pushMany('Weekly Directive', ev);
    }
    return reward;
  },

  // ── Hero Expeditions (docs/EXPEDITIONS.md) — the benched-hero idle lane. ──
  /** The full board: live missions (+remaining ms/progress) + the offer matrix — every
   *  mission × every benched hero with its projected multiplier (stars × affinity ×
   *  mastery; the risk outcome stays hidden until claim). */
  expeditionsView(now = Date.now()): {
    defs: ExpeditionDef[];
    active: { defId: string; hero: HeroKind; endsAt: number; remainingMs: number; claimable: boolean; progress: number }[];
    benched: HeroKind[];
    slotsFree: number;
    offers: {
      def: ExpeditionDef;
      masteryRuns: number;
      masteryBonus: number;
      picks: { hero: HeroKind; stars: number; affinity: boolean; mult: number }[];
    }[];
  } {
    const s = store.get();
    const fielded = new Set(this.fieldedLoadout());
    const away = new Set(s.expeditions.active.map((e) => e.hero));
    const benched = HERO_ORDER.filter((h) => isHeroUnlocked(s, h) && !fielded.has(h) && !away.has(h));
    return {
      defs: EXPEDITION_DEFS,
      active: s.expeditions.active.map((e) => {
        const hours = expeditionById(e.defId)?.hours ?? 1;
        return {
          ...e,
          remainingMs: Math.max(0, e.endsAt - now),
          claimable: now >= e.endsAt,
          progress: Math.max(0, Math.min(1, 1 - (e.endsAt - now) / (hours * 3_600_000))),
        };
      }),
      benched,
      // Held territory opens roads (docs/INFESTATION.md §front): entrenchment pays +1 slot.
      slotsFree: expeditionSlotsFor(REGIONS.filter((r) => isEntrenched(r, s.infestation.sectors, now)).length) - s.expeditions.active.length,
      offers: EXPEDITION_DEFS.map((def) => {
        const runs = s.expeditions.mastery[def.id] ?? 0;
        return {
          def,
          masteryRuns: runs,
          masteryBonus: masteryBonus(runs),
          picks: benched.map((hero) => {
            const affinity = HERO_DEFS[hero].combatClass === def.affinity;
            const stars = s.heroStars[hero] ?? 0;
            return { hero, stars, affinity, mult: expeditionMult(stars, affinity, runs) };
          }),
        };
      }),
    };
  },
  /** Send a BENCHED hero out. Refuses fielded/away heroes, full slots, unknown defs. */
  startExpedition(defId: string, hero: HeroKind, now = Date.now()): boolean {
    const s = store.get();
    const def = expeditionById(defId);
    if (!def) return false;
    if (s.expeditions.active.length >= expeditionSlotsFor(REGIONS.filter((r) => isEntrenched(r, s.infestation.sectors, now)).length)) return false;
    if (!isHeroUnlocked(s, hero)) return false; // milestone heroes derive — never in the array
    if (this.fieldedLoadout().includes(hero)) return false; // the front line stays home
    if (s.expeditions.active.some((e) => e.hero === hero)) return false; // already away
    persist({
      ...s,
      expeditions: { ...s.expeditions, active: [...s.expeditions.active, { defId, hero, endsAt: now + def.hours * 3_600_000 }] },
      timeline: pushTimeline(s.timeline, '⇢', `Expedition — ${HERO_DEFS[hero].name} departs (${def.name})`),
    });
    return true;
  },
  /** Claim a finished mission: rolls the risk outcome + rare find (both deterministic from
   *  the mission's identity), pays the multiplied bundle, bumps the mission's mastery, and
   *  frees the hero. Null before time. `reward` is the TOTAL paid (find included). */
  claimExpedition(hero: HeroKind, now = Date.now()): { reward: ExpeditionReward; outcome: ExpeditionOutcome; find: RareFind | null } | null {
    if (!guardOk('expedition.claim', hero)) return null;
    const s = store.get();
    const e = s.expeditions.active.find((x) => x.hero === hero);
    if (!e || now < e.endsAt) return null;
    const def = expeditionById(e.defId);
    if (!def) return null;
    const affinity = HERO_DEFS[hero].combatClass === def.affinity;
    const runs = s.expeditions.mastery[def.id] ?? 0;
    const outcome = expeditionOutcome(e);
    const find = rollRareFind(e);
    const base = scaleReward(def.reward, expeditionMult(s.heroStars[hero] ?? 0, affinity, runs) * outcome.mult);
    const reward = find ? sumRewards(base, find.reward) : base;
    const flavor = outcome.kind === 'windfall' ? 'returns heavy with spoils'
      : outcome.kind === 'setback' ? 'limps home with a lean haul'
        : 'returns bearing spoils';
    persist({
      ...s,
      shards: s.shards + reward.cores,
      lifetimeShards: s.lifetimeShards + reward.cores,
      geneEssence: s.geneEssence + reward.essence,
      hiveMaterials: s.hiveMaterials + (reward.chitin ?? 0),
      mats: {
        mutagen: s.mats.mutagen + reward.mats.mutagen,
        scrap: s.mats.scrap + reward.mats.scrap,
        catalyst: s.mats.catalyst + reward.mats.catalyst,
      },
      expeditions: {
        active: s.expeditions.active.filter((x) => x.hero !== hero),
        mastery: { ...s.expeditions.mastery, [def.id]: runs + 1 },
      },
      timeline: pushTimeline(s.timeline, '⇠', `Expedition — ${HERO_DEFS[hero].name} ${flavor} (${def.name})${find ? ` · ${find.name}!` : ''}`),
    });
    this.grantPassXp('expedition', 40); // away-missions feed the season (docs/BATTLEPASS.md §xp)
    {
      const ev: ToastEvents = [{ type: 'bpXp', qty: 40 }];
      if (reward.cores > 0) ev.push({ type: 'genomeCores', qty: reward.cores });
      if (reward.essence > 0) ev.push({ type: 'geneEssence', qty: reward.essence });
      if ((reward.chitin ?? 0) > 0) ev.push({ type: 'hiveMaterials', qty: reward.chitin ?? 0 });
      if (reward.mats.mutagen > 0) ev.push({ type: 'mutagen', qty: reward.mats.mutagen });
      if (reward.mats.scrap > 0) ev.push({ type: 'scrap', qty: reward.mats.scrap });
      if (reward.mats.catalyst > 0) ev.push({ type: 'catalyst', qty: reward.mats.catalyst });
      if (find) ev.push({ type: 'collection', name: `Rare Find — ${find.name}`, rarity: 'epic' });
      rewardToast.pushMany(`Expedition — ${HERO_DEFS[hero].name}`, ev);
    }
    this.creditQuests({ type: 'expeditions', n: 1 }); // …and the directive layer (docs/QUESTS.md §credit)
    return { reward, outcome: outcome.kind, find };
  },

  // ── Trophy Rack (docs/NEMESIS.md §trophies) — a RACK of up to trophySlots organs. Ownership
  //    derives from the kill ledgers (chassis/mega) + the vengeance ledger. ──
  trophies(): { def: TrophyDef; owned: boolean; equipped: boolean }[] {
    const s = store.get();
    const ctx = trophyCtx(s);
    return TROPHY_DEFS.map((def) => ({
      def,
      owned: trophyOwned(def, ctx),
      equipped: s.equippedTrophies.includes(def.id),
    }));
  },
  /** Rack capacity + fill (docs/NEMESIS.md §rack) — slots grow with organs owned. */
  trophyRack(): { slots: number; used: number; owned: number } {
    const s = store.get();
    const owned = trophyOwnedCount(s);
    const slots = trophySlots(owned);
    return { slots, used: Math.min(slots, s.equippedTrophies.length), owned };
  },
  /** Mount (on=true) or unmount (on=false) ONE organ. Refuses unowned organs and a full rack;
   *  idempotent. Light-guarded against toggle spam (docs/SECURITY.md). */
  equipTrophy(id: string, on: boolean): boolean {
    if (!guardOk('trophy.equip', id)) return false;
    const s = store.get();
    const def = trophyById(id);
    if (!def || !trophyOwned(def, trophyCtx(s))) return false;
    const has = s.equippedTrophies.includes(id);
    if (on === has) return true; // already in the requested state
    if (on) {
      if (s.equippedTrophies.length >= trophySlots(trophyOwnedCount(s))) return false; // rack full
      persist({ ...s, equippedTrophies: [...s.equippedTrophies, id] });
    } else {
      persist({ ...s, equippedTrophies: s.equippedTrophies.filter((t) => t !== id) });
    }
    return true;
  },
  /** The mounted rack's folded effects (docs/NEMESIS.md) — every equipped+owned organ's pair,
   *  clamped to the live slot count. [] when the rack is empty (golden-safe). */
  trophyRunEffects(): CardEffect[] {
    const s = store.get();
    const ctx = trophyCtx(s);
    const slots = trophySlots(trophyOwnedCount(s));
    const out: CardEffect[] = [];
    for (const id of s.equippedTrophies.slice(0, slots)) {
      const def = trophyById(id);
      if (def && trophyOwned(def, ctx)) out.push(...def.effects);
    }
    return out;
  },
  /** The active hunt for the UI (docs/NEMESIS.md): grudge tier + escalation traits + the
   *  tier-scaled revenge bounty. null when no nemesis stalks the account. */
  nemesisView(): { defId: string; name: string; slain: number; tier: number; tierName: string; traits: string[]; rewardCores: number } | null {
    const nem = store.get().nemesis;
    if (!nem) return null;
    const tb = nemesisTraits(nem.slain);
    return {
      defId: nem.defId,
      name: bossDef(nem.defId)?.name ?? nem.defId,
      slain: nem.slain,
      tier: tb.tier,
      tierName: tb.tierName,
      traits: tb.traits,
      rewardCores: vengeanceCores(nem.slain),
    };
  },
  /** Grant a cosmetic by id (contracts/nemesis/cultivation all land here). Idempotent. */
  grantCosmetic(id: string): boolean {
    const save = store.get();
    if (!cosmeticById(id) || save.cosmetics.owned.includes(id)) return false;
    persist({ ...save, cosmetics: { ...save.cosmetics, owned: [...save.cosmetics.owned, id] } });
    return true;
  },
  /** Equip an owned phenotype on its target kind (null clears back to the default look). */
  equipCosmetic(target: { kind: 'tower'; tower: TowerKind } | { kind: 'hero'; hero: HeroKind }, id: string | null): boolean {
    const save = store.get();
    if (id !== null) {
      const def = cosmeticById(id);
      if (!def || !save.cosmetics.owned.includes(id)) return false;
      if (def.target.kind !== target.kind) return false;
      if (target.kind === 'tower' && (def.target as { tower: TowerKind }).tower !== target.tower) return false;
      if (target.kind === 'hero' && (def.target as { hero: HeroKind }).hero !== target.hero) return false;
    }
    const cosmetics = { ...save.cosmetics, towers: { ...save.cosmetics.towers }, heroes: { ...save.cosmetics.heroes } };
    if (target.kind === 'tower') {
      if (id === null) delete cosmetics.towers[target.tower];
      else cosmetics.towers[target.tower] = id;
    } else {
      if (id === null) delete cosmetics.heroes[target.hero];
      else cosmetics.heroes[target.hero] = id;
    }
    persist({ ...save, cosmetics });
    return true;
  },
  /** Cultivate: spend Gene Essence to grow ONE random unowned cultivate-pool phenotype.
   *  Returns the grown def (UI ceremony) or null (broke / pool exhausted). */
  cultivateCosmetic(): CosmeticDef | null {
    const save = store.get();
    if (save.geneEssence < CULTIVATE_COST) return null;
    const owned = new Set(save.cosmetics.owned);
    const pool = cultivatePool().filter((d) => !owned.has(d.id));
    if (pool.length === 0) return null;
    const def = pool[Math.floor(Math.random() * pool.length)]; // meta-side roll (not the sim's rng)
    persist({
      ...save,
      geneEssence: save.geneEssence - CULTIVATE_COST,
      cosmetics: { ...save.cosmetics, owned: [...save.cosmetics.owned, def.id] },
    });
    return def;
  },

  // ── WARDROBE (docs/COSMETICS.md §wardrobe) — account cosmetics: the auto-unlock poll,
  //    equip slots, favorites, the Ichor boutique, milestone claims, the reveal queue. ──

  /** The auto-lane unlock context (campaign/depth/daily/rush/roulette/achievements/ranks). */
  wardrobeUnlockCtx(): WardrobeUnlockCtx {
    const save = store.get();
    const v = this.collection();
    const ranks: Partial<Record<CollectionCategoryId, number>> = {};
    for (const c of v.categories) ranks[c.id] = c.rankIndex;
    return {
      campaignStage: highestCampaignStage(save),
      bestDepth: save.bestWave,
      dailyClears: save.daily.completions,
      lifetimeLogins: save.login.lifetime,
      rushBossKills: save.stats.rushBossKills,
      rouletteSpores: save.stats.rouletteSpores,
      achievements: new Set(save.achievements ?? []),
      collectionRanks: ranks,
      overallRank: v.rankIndex,
    };
  },

  /** Achievement-style poll: grant every EARNED auto-lane item not yet owned. Newly granted
   *  ids queue the unlock ceremony (persisted — a run-end unlock survives reload). */
  pollWardrobeUnlocks(): WardrobeItemDef[] {
    const fresh = earnedAutoItems(this.wardrobeUnlockCtx());
    const save = store.get();
    const granted = new Set(save.wardrobe.granted); // once per SOURCE — ever (v53)
    const grants = fresh.filter((d) => !granted.has(d.id));
    if (grants.length === 0) return [];
    const now = Date.now();
    let next: SaveData = save;
    for (const d of grants) {
      const got = receiveCosmetic(next, d.id, sourceLabel(d.source), now);
      if (got) next = got.next;
    }
    let timeline = next.timeline;
    for (const d of grants) timeline = pushTimeline(timeline, '❖', `Wardrobe — ${d.name} acquired`);
    persist({ ...next, timeline });
    return grants;
  },

  /** Equip an owned wardrobe item into its kind's slot (null clears to the classic look). */
  equipWardrobe(kind: WardrobeKind, id: string | null): boolean {
    const save = store.get();
    if (id !== null) {
      const def = wardrobeItem(id);
      if (!def || def.kind !== kind || !save.wardrobe.owned.includes(id)) return false;
    }
    const equipped = { ...save.wardrobe.equipped };
    if (id === null) delete equipped[kind];
    else equipped[kind] = id;
    persist({ ...save, wardrobe: { ...save.wardrobe, equipped } });
    return true;
  },

  toggleWardrobeFavorite(id: string): boolean {
    const save = store.get();
    if (!save.wardrobe.owned.includes(id)) return false;
    const favorites = save.wardrobe.favorites.includes(id)
      ? save.wardrobe.favorites.filter((x) => x !== id)
      : [...save.wardrobe.favorites, id];
    persist({ ...save, wardrobe: { ...save.wardrobe, favorites } });
    return true;
  },

  /** The dice: equip a random owned item in every kind that owns one. */
  randomizeWardrobe(): void {
    const save = store.get();
    const owned = new Set(save.wardrobe.owned);
    const equipped = { ...save.wardrobe.equipped };
    for (const k of WARDROBE_KINDS) {
      const pool = wardrobeItemsOf(k.id).filter((d) => owned.has(d.id));
      if (pool.length > 0) equipped[k.id] = pool[Math.floor(Math.random() * pool.length)].id;
    }
    persist({ ...save, wardrobe: { ...save.wardrobe, equipped } });
  },

  /** Opening the Wardrobe clears its NEW badges (idempotent). */
  markWardrobeSeen(): void {
    const save = store.get();
    const unseen = save.wardrobe.owned.filter((id) => !save.wardrobe.seen.includes(id));
    if (unseen.length === 0) return;
    persist({ ...save, wardrobe: { ...save.wardrobe, seen: [...save.wardrobe.seen, ...unseen] } });
  },

  /** Buy a boutique item with Ichor (cosmetics never rotate out of the boutique). The boutique
   *  is curated, not a mint: one copy per account (granted-gated), delivered UNCLAIMED. */
  buyWardrobeItem(id: string): boolean {
    if (!guardOk('wardrobe.buy', id)) return false;
    const save = store.get();
    const def = wardrobeItem(id);
    if (!def || def.source.kind !== 'shop' || save.wardrobe.granted.includes(id)) return false;
    if (save.ichor < def.source.ichor) return false;
    const got = receiveCosmetic(save, id, 'Ichor Boutique', Date.now());
    if (!got) return false;
    persist({
      ...got.next,
      ichor: got.next.ichor - def.source.ichor,
      timeline: pushTimeline(got.next.timeline, '❖', `Boutique — ${def.name} acquired`),
    });
    return true;
  },

  /** Direct grant (events / dev / future lanes). Once per id; delivers to the Vault. */
  grantWardrobeItem(id: string): boolean {
    const save = store.get();
    if (!wardrobeItem(id) || save.wardrobe.granted.includes(id)) return false;
    const got = receiveCosmetic(save, id, 'Grant', Date.now());
    if (!got) return false;
    persist(got.next);
    return true;
  },

  /** CLAIM a cosmetic — the irreversible account-bind (v53, docs/COSMETICS.md §claiming).
   *  Consumes ONE unclaimed instance from the Specimen Vault, moves its id into the claimed
   *  set (equip gates, collection codices, achievements and the permanent bonus fold all key
   *  on it), carries the instance's acquisition origin into the permanent provenance stamp and
   *  BINDS it (no unbind exists, by policy). Claiming a duplicate of an already-claimed id is
   *  refused — duplicates stay in the vault as pure trade goods. */
  claimCosmetic(uid: string, now = Date.now()): PremiumReceiptLine[] | null {
    if (!guardOk('cosmetic.claim', uid)) return null;
    const res = claimCosmeticDraft(store.get(), uid, now);
    if (!res) return null;
    persist(res.next);
    rewardToast.push({ type: 'cosmetic', name: res.def.name, source: 'Assimilated' });
    this.evaluateAchievements(); // the claimed set moved — collections/achievements re-poll
    return res.lines;
  },

  /** CLAIM ALL — bind every unclaimed specimen of the given rarities in ONE guarded action
   *  (docs/COSMETICS.md §claim-all). The no-choice backlog only: by default commons, so rare-and-
   *  above keep their per-item decision (bind vs keep liquid for the Auction House). One instance
   *  per item id (duplicates stay tradable, exactly as a manual claim leaves them); each bind is
   *  the same draft step as claimCosmetic, folded into a single persist. Returns the bound
   *  defs + receipt lines (empty when nothing qualifies, null when the guard refuses). */
  claimAllCosmetics(rarities: readonly string[] = ['common'], now = Date.now()): { ids: string[]; names: string[]; lines: PremiumReceiptLine[] } | null {
    if (!guardOk('cosmetic.claimAll')) return null;
    const allow = new Set(rarities);
    let draft = store.get();
    const ids: string[] = [];
    const names: string[] = [];
    const lines: PremiumReceiptLine[] = [];
    const seen = new Set<string>();
    // Oldest first, so the provenance/timeline reads in acquisition order.
    for (const inst of [...draft.wardrobe.inventory].sort((a, b) => a.at - b.at)) {
      const def = wardrobeItem(inst.item);
      if (!def || !allow.has(def.rarity) || seen.has(inst.item) || draft.wardrobe.owned.includes(inst.item)) continue;
      const res = claimCosmeticDraft(draft, inst.uid, now, false); // ONE timeline line for the batch (the 60-entry rail must not flood)
      if (!res) continue;
      seen.add(inst.item);
      draft = res.next;
      ids.push(def.id);
      names.push(def.name);
      lines.push(...res.lines);
    }
    if (names.length === 0) return { ids, names, lines };
    persist({ ...draft, timeline: pushTimeline(draft.timeline, '❖', `Assimilated ${names.length} common specimen${names.length === 1 ? '' : 's'} — bound to the genome`) });
    rewardToast.push({ type: 'cosmetic', name: `${names.length} specimen${names.length === 1 ? '' : 's'}`, source: 'Assimilated' });
    this.evaluateAchievements();
    return { ids, names, lines };
  },

  /** Claimed-cosmetic bonuses as run effects (the App boot fold — docs/COSMETICS.md §bonuses). */
  wardrobeRunEffects(): CardEffect[] {
    return wardrobeEffectsOf(store.get());
  },

  /** The Collector Panel's one read (docs/COSMETICS.md §provenance). Null ⇒ unknown item. */
  collectorView(id: string): CollectorView | null {
    const def = wardrobeItem(id);
    if (!def) return null;
    const save = store.get();
    const claimed = save.wardrobe.owned.includes(id);
    const held = save.wardrobe.inventory.filter((i) => i.item === id);
    let newestUid: string | null = null;
    let newestAt = -1;
    for (const i of held) if (i.at > newestAt) { newestAt = i.at; newestUid = i.uid; }
    const stamp = (claimed ? itemProvenance(save.provenance, { cat: 'cosmetic', id }) : null)
      ?? (newestUid ? itemProvenance(save.provenance, { cat: 'cosmetic', id: newestUid }) : null);
    const family = cosmeticFamily(def);
    const owned = new Set(save.wardrobe.owned);
    let familyTotal = 0;
    let familyClaimed = 0;
    for (const d of WARDROBE_ITEMS) {
      if (cosmeticFamily(d) !== family) continue;
      familyTotal += 1;
      if (owned.has(d.id)) familyClaimed += 1;
    }
    return {
      def, era: cosmeticEra(def), availability: cosmeticAvailability(def),
      badges: cosmeticBadges(def), lore: cosmeticLore(def), family,
      familyClaimed, familyTotal, claimed, copiesHeld: held.length, stamp,
      census: cosmeticCensus(id), market: cosmeticMarket(id),
    };
  },

  /** Drain the unlock-ceremony queue (the reveal overlay consumes it). */
  takeWardrobeReveals(): WardrobeItemDef[] {
    const save = store.get();
    if (save.wardrobe.pendingReveal.length === 0) return [];
    const defs = save.wardrobe.pendingReveal
      .map((id) => wardrobeItem(id))
      .filter((d): d is WardrobeItemDef => d !== undefined);
    persist({ ...save, wardrobe: { ...save.wardrobe, pendingReveal: [] } });
    return defs;
  },

  /** Milestone track state (docs/COSMETICS.md §milestones). */
  wardrobeMilestones(): { def: WardrobeMilestone; state: 'locked' | 'claimable' | 'claimed'; at: number }[] {
    const save = store.get();
    const v = this.collection();
    return WARDROBE_MILESTONES.map((def) => {
      const at = v.categories.find((c) => c.id === def.category)?.rankIndex ?? 0;
      const state: 'locked' | 'claimable' | 'claimed' =
        save.wardrobe.milestones.includes(def.id) ? 'claimed' : at >= def.rank ? 'claimable' : 'locked';
      return { def, state, at };
    });
  },

  /** Claim one cosmetic milestone → its receipt lines (null if not claimable). */
  claimWardrobeMilestone(id: string): PremiumReceiptLine[] | null {
    if (!guardOk('wardrobe.claim', id)) return null;
    const def = wardrobeMilestone(id);
    if (!def) return null;
    const row = this.wardrobeMilestones().find((m) => m.def.id === id);
    if (!row || row.state !== 'claimable') return null;
    const save = store.get();
    const lines: PremiumReceiptLine[] = [];
    let next: SaveData = { ...save, wardrobe: { ...save.wardrobe, milestones: [...save.wardrobe.milestones, id] } };
    for (const r of def.rewards) {
      switch (r.kind) {
        case 'ichor':
          next = { ...next, ichor: next.ichor + r.qty, lifetimeIchor: next.lifetimeIchor + r.qty };
          lines.push({ icon: '◆', label: `${r.qty} Ichor` });
          break;
        case 'cores':
          next = { ...next, shards: next.shards + r.qty, lifetimeShards: next.lifetimeShards + r.qty };
          lines.push({ icon: '⬡', label: `${r.qty} Genome Cores` });
          break;
        case 'geneEssence':
          next = { ...next, geneEssence: next.geneEssence + r.qty };
          lines.push({ icon: '⌬', label: `${r.qty} Gene Essence` });
          break;
        case 'container':
          next = { ...next, pendingContainers: [...next.pendingContainers, ...Array.from({ length: r.count }, () => ({ kind: 'loot' as const, rarity: r.rarity }))] };
          lines.push({ icon: '◈', label: `${r.count}× ${r.rarity} Bio-Container`, rarity: r.rarity });
          break;
        case 'towerShardsAll': {
          // Direct lanes BANK since Prime (docs/PRIME-STRAINS.md §economy) — no conversion here.
          const towerShards = { ...next.towerShards };
          for (const k of towerShardPool(next)) towerShards[k] = (towerShards[k] ?? 0) + r.qtyEach;
          next = { ...next, towerShards };
          lines.push({ icon: '✦', label: `${r.qtyEach} Strain Samples × every tower` });
          break;
        }
        case 'heroShardsAll': {
          const heroShards = { ...next.heroShards };
          for (const k of HERO_ORDER) heroShards[k] = (heroShards[k] ?? 0) + r.qtyEach;
          next = { ...next, heroShards };
          lines.push({ icon: '✦', label: `${r.qtyEach} Apex Genome × every hero` });
          break;
        }
        case 'item': {
          if (!next.wardrobe.granted.includes(r.id)) {
            const got = receiveCosmetic(next, r.id, 'Cosmetic milestone', Date.now());
            if (got) {
              next = got.next;
              lines.push({ icon: '❖', label: `${wardrobeItem(r.id)!.name} — in the Specimen Cabinet` });
            }
          }
          break;
        }
      }
    }
    persist({ ...next, timeline: pushTimeline(next.timeline, '❖', `Milestone — ${def.name} claimed`) });
    rewardToast.pushMany(`Wardrobe — ${def.name}`, eventsForPassRewards(def.rewards as never));
    return lines;
  },

  // ── BATTLE PASS (docs/BATTLEPASS.md) — rotating dual-track seasons over the Wardrobe. ──

  /** Advance the rotation window (max-window tamper rule — a rolled-back clock can't forge a
   *  fresh season). On rollover, every EARNED-but-unclaimed level auto-claims first (mail-on-
   *  rollover: progress is never lost), then the record resets for the incoming season. */
  pollBattlePass(now = Date.now()): void {
    const save = store.get();
    const w = passWindow(now);
    if (w <= save.battlePass.window) return;
    const season = seasonForWindow(save.battlePass.window);
    const tracks = seasonTracks(season.id);
    const level = levelOf(save.battlePass.xp).level;
    let draft = save;
    let stamina = 0;
    for (let l = 1; l <= level; l++) {
      if (!draft.battlePass.claimedFree.includes(l)) {
        const res = applyPassRewards(draft, season, tracks.free[l - 1], 'free', l);
        draft = res.next; stamina += res.stamina;
      }
      const premiumOk = draft.battlePass.premium || BP.freePremiumLevels.includes(l);
      if (premiumOk && !draft.battlePass.claimedPremium.includes(l)) {
        const res = applyPassRewards(draft, season, tracks.premium[l - 1], 'premium', l);
        draft = res.next; stamina += res.stamina;
      }
    }
    persist({
      ...draft,
      timeline: level > 0 ? pushTimeline(draft.timeline, season.glyph, `${season.name} concluded — unclaimed rewards delivered`) : draft.timeline,
      battlePass: { ...draft.battlePass, window: w, xp: 0, premium: false, claimedFree: [], claimedPremium: [], adDay: '', adUsed: 0 },
    });
    if (stamina > 0) this.grantRushStamina(stamina, now);
  },

  /** The pass screen's read-model. Poll separately (UI tick) — this never persists. */
  battlePass(now = Date.now()): BattlePassView {
    const save = store.get();
    const bp = save.battlePass;
    const season = seasonForWindow(Math.max(bp.window, passWindow(now)));
    const lp = levelOf(bp.xp);
    const claimableFree: number[] = [];
    const claimablePremium: number[] = [];
    for (let l = 1; l <= lp.level; l++) {
      if (!bp.claimedFree.includes(l)) claimableFree.push(l);
      if ((bp.premium || BP.freePremiumLevels.includes(l)) && !bp.claimedPremium.includes(l)) claimablePremium.push(l);
    }
    return {
      season,
      window: bp.window,
      endsInMs: msToPassEnd(now),
      xp: bp.xp,
      level: lp.level,
      into: lp.into,
      need: lp.need,
      totalXp: xpToReach(BP.levels),
      premium: bp.premium,
      tracks: seasonTracks(season.id),
      claimedFree: new Set(bp.claimedFree),
      claimedPremium: new Set(bp.claimedPremium),
      claimableFree,
      claimablePremium,
      permanents: new Set(bp.permanents),
      completions: bp.completions[season.id] ?? 0,
      stacks: bp.stacks,
      levelPrice: lp.level >= BP.levels ? null : levelBuyPrice(lp.level),
      adAvailable: (bp.adDay === dayKey(now) ? bp.adUsed : 0) < BP.adLevelsPerDay && lp.level < BP.levels,
    };
  },

  /** Claim one earned level's rewards on a track → receipt lines (null = not claimable).
   *  Premium levels need Premium — except the free-preview levels (1 / 50 / 99). */
  claimPassLevel(track: 'free' | 'premium', level: number, now = Date.now()): PremiumReceiptLine[] | null {
    if (!guardOk('pass.claim', `${track}:${level}`)) return null;
    return claimPassLevelCore(track, level, now);
  },

  /** Claim EVERYTHING currently claimable (both tracks, ascending) → combined lines. */
  claimAllPass(now = Date.now()): PremiumReceiptLine[] {
    // ONE guarded action for the whole backlog (pass.claimAll): a full season is up to 200 level
    // claims, which the per-level pass.claim bucket would cut off part-way ("Claim all" needed a
    // second press on a deep backlog).
    if (!guardOk('pass.claimAll')) return [];
    this.pollBattlePass(now);
    const lines: PremiumReceiptLine[] = [];
    const view = this.battlePass(now);
    for (const l of view.claimableFree) lines.push(...(claimPassLevelCore('free', l, now) ?? []));
    for (const l of view.claimablePremium) lines.push(...(claimPassLevelCore('premium', l, now) ?? []));
    return lines;
  },

  /** Grant pass XP from a gameplay source. Returns {from,to} on a level-up (for toasts).
   *  `source` is the faucet's name — kept for future analytics parity with grantIchor. */
  grantPassXp(_source: string, xp: number, now = Date.now()): { from: number; to: number } | null {
    const amt = Math.max(0, Math.round(xp));
    if (amt <= 0) return null;
    this.pollBattlePass(now);
    const save = store.get();
    const cap = xpToReach(BP.levels);
    if (save.battlePass.xp >= cap) return null;
    const from = levelOf(save.battlePass.xp).level;
    const nextXp = Math.min(cap, save.battlePass.xp + amt);
    const to = levelOf(nextXp).level;
    persist({ ...save, battlePass: { ...save.battlePass, xp: nextXp } });
    if (to > from) this.creditQuests({ type: 'passLevels', n: to - from }, now); // seasons feed the directives (docs/QUESTS.md §credit)
    return to > from ? { from, to } : null;
  },

  /** Buy ONE level with Ichor (price ramps every 10 levels). */
  buyPassLevel(now = Date.now()): boolean {
    this.pollBattlePass(now);
    const save = store.get();
    const lp = levelOf(save.battlePass.xp);
    if (lp.level >= BP.levels) return false;
    const price = levelBuyPrice(lp.level);
    if (save.ichor < price) return false;
    persist({ ...save, ichor: save.ichor - price, battlePass: { ...save.battlePass, xp: save.battlePass.xp + (lp.need - lp.into) } });
    return true;
  },

  /** Advance one level via a completed rewarded ad (caller runs the provider first;
   *  docs/RESEARCH.md provider rules). Capped per UTC day. */
  adAdvancePass(now = Date.now()): boolean {
    if (!guardOk('pass.ad')) return false;
    this.pollBattlePass(now);
    const save = store.get();
    const day = dayKey(now);
    const used = save.battlePass.adDay === day ? save.battlePass.adUsed : 0;
    if (used >= BP.adLevelsPerDay) return false;
    const lp = levelOf(save.battlePass.xp);
    if (lp.level >= BP.levels) return false;
    persist({ ...save, battlePass: { ...save.battlePass, xp: save.battlePass.xp + (lp.need - lp.into), adDay: day, adUsed: used + 1 } });
    return true;
  },

  // ── Daily Bio-Cache (docs/DAILY-LOGIN.md) — the login-streak faucet ─────────

  /** The streak presentation read-model. The day's bundle is a PURE roll of
   *  (dayKey, lifetimeAtRoll, streakAtRoll), so pre-claim preview, the claim itself and a
   *  post-claim reload all show the SAME rewards; tomorrow is the same roll one day ahead
   *  (teased as value/multiplier/milestone only — the lines stay a surprise). */
  loginView(now = Date.now()): LoginView {
    const save = store.get();
    const l = save.login;
    const todayKey = dayKey(now);
    const claimedToday = l.last === todayKey;
    const claimable = l.last < todayKey; // lexical ISO compare — forged future keys wait it out
    const nextStreak = isPrevDayKey(l.last, todayKey) ? l.streak + 1 : claimedToday ? l.streak : 1;
    // Today's roll inputs: post-claim they're recorded (lifetime-1 was the count AT roll).
    const today = claimedToday
      ? rollLoginBundle(l.last, l.lifetime - 1, l.streak)
      : rollLoginBundle(todayKey, l.lifetime, nextStreak);
    const todayStreak = claimedToday ? l.streak : nextStreak;
    const todayLines = today.rewards.map((r) => rewardLabel(r));
    if (today.passXp > 0) todayLines.push({ icon: '✚', label: `${today.passXp} Season XP` });
    // §income (docs/DAILY-LOGIN.md): minutes of the LIVE Core income — frozen at the claim.
    const cpm = coresPerMinute(save);
    const cpr = coresPerRun(save);
    const incomeCores = claimedToday ? (l.incomeCores ?? 0) : loginIncomeCores(cpm, nextStreak, cpr);
    if (incomeCores > 0) todayLines.push({ icon: '⬡', label: `${incomeCores.toLocaleString('en-US')} Genome Cores · ${LOGIN.incomeMinutes} min of your income` });
    // Tomorrow assumes the streak holds (today claimed) — that IS the anticipation pitch.
    const tomorrowStreak = todayStreak + 1;
    const tomorrowLifetime = claimedToday ? l.lifetime : l.lifetime + 1;
    const tomorrowIncome = loginIncomeCores(cpm, tomorrowStreak, cpr);
    const tomorrowTarget = loginTargetValue(tomorrowLifetime, tomorrowStreak);
    return {
      claimable,
      todayKey,
      streak: l.streak,
      nextStreak,
      lifetime: l.lifetime,
      best: l.best,
      mult: streakMult(todayStreak),
      target: today.target,
      todayLines,
      todayMilestone: today.milestone,
      incomeCores,
      valueCores: Math.round(today.target / LANE_VALUE.cores) + incomeCores,
      tomorrow: {
        mult: streakMult(tomorrowStreak),
        target: tomorrowTarget,
        milestone: milestoneContainer(tomorrowStreak),
        incomeCores: tomorrowIncome,
        valueCores: Math.round(tomorrowTarget / LANE_VALUE.cores) + tomorrowIncome,
      },
      msToReset: Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate() + 1) - now,
    };
  },

  /** Open today's Bio-Cache — ONCE per UTC day. A consecutive day extends the streak; a gap
   *  resets the multiplier to day 1 but NEVER touches lifetime/best (collections, titles and
   *  Genome Rank ride the lifetime count). Grants speak the shared reward interpreter; the
   *  Season-XP rider pays through the same faucet quests use. Returns the ceremony receipt. */
  claimLogin(now = Date.now()): LoginReceipt | null {
    if (!guardOk('login.claim')) return null;
    const save = store.get();
    const key = dayKey(now);
    if (save.login.last >= key) return null; // claimed already (or forged future — self-heals)
    const nextStreak = isPrevDayKey(save.login.last, key) ? save.login.streak + 1 : 1;
    const bundle = rollLoginBundle(key, save.login.lifetime, nextStreak);
    const res = applyRewardList(save, bundle.rewards, LOGIN.repeatReplacement, null);
    // §income (v56): the guaranteed Core line — minutes of the live income × the streak. Plain
    // reward Cores (never the Molt mint metric, like every other granted Core).
    const incomeCores = loginIncomeCores(coresPerMinute(save), nextStreak, coresPerRun(save));
    if (incomeCores > 0) {
      res.next = { ...res.next, shards: res.next.shards + incomeCores, lifetimeShards: res.next.lifetimeShards + incomeCores };
      res.lines.push({ icon: '⬡', label: `${incomeCores.toLocaleString('en-US')} Genome Cores · ${LOGIN.incomeMinutes} min of your income` });
      res.events.push({ type: 'genomeCores', qty: incomeCores });
    }
    rewardToast.pushMany(`Daily Bio-Cache — Day ${nextStreak}`, res.events);
    const lifetime = save.login.lifetime + 1;
    const best = Math.max(save.login.best, nextStreak);
    persist({
      ...res.next,
      login: { last: key, streak: nextStreak, best, lifetime, incomeCores },
      timeline: pushTimeline(res.next.timeline, '◈', `Daily Bio-Cache opened — day ${lifetime}, streak ${nextStreak} (×${streakMult(nextStreak).toFixed(2)})`),
    });
    if (res.stamina > 0) this.grantRushStamina(res.stamina, now);
    if (bundle.passXp > 0) this.grantPassXp('login', bundle.passXp, now);
    this.pollWardrobeUnlocks(); // devotion titles/plaques land the moment their day is reached
    this.evaluateAchievements();
    const lines = [...res.lines];
    if (bundle.passXp > 0) lines.push({ icon: '✚', label: `${bundle.passXp} Season XP` });
    return {
      lines, streak: nextStreak, best, lifetime,
      mult: streakMult(nextStreak), value: bundle.value, jackpot: bundle.jackpot, milestone: bundle.milestone,
    };
  },

  // ── IDLE HARVEST (docs/IDLE-HARVEST.md) — the Hive keeps harvesting while you're away. ──

  /** Everything the Harvest screen + badge render: the live accrual, the tree (levels, costs,
   *  gates as work-toward labels), the eligible/locked drop rows, and the grow-next suggestion. */
  idleView(now = Date.now()): IdleHarvestView {
    const save = store.get();
    const ctx = idleGateContext(save);
    const arenaDiv = this.arenaDivisionIndex(now);
    const hive = hiveProductionBonus(save.hive.built);
    const acc = idleAccrual(now - (save.idle.lastCollect || now), highestCampaignStage(save), save.idle.nodes, ctx.genomeRankIndex, arenaIdleDividend(arenaDiv), arenaIdleCapBonusHours(arenaDiv), hive);
    const nodes = IDLE_NODES.map((def) => {
      const level = save.idle.nodes[def.id] ?? 0;
      const gate = idleNodeGate(def, level + 1, ctx);
      return { def, level, cost: idleNodeCost(def, level), gate, gateLabel: gate ? idleGateLabel(gate) : null, affordable: gate === null && save.hiveMaterials >= idleNodeCost(def, level) };
    });
    const eligible = new Set(eligibleIdleDrops(ctx).map((d) => d.id));
    return {
      accrual: acc,
      collectable: acc.rawHours * 60 >= IDLE.minCollectMinutes,
      nodes,
      suggestion: idleSuggestion(save.idle.nodes, save.hiveMaterials, ctx),
      drops: [...IDLE_DROPS_VIEW].map((d) => ({ ...d, eligible: eligible.has(d.id) })),
      ledger: { ...save.idle },
      chitin: save.hiveMaterials,
      rankIndex: ctx.genomeRankIndex,
      rankBonus: IDLE.rankGrowth * Math.max(0, ctx.genomeRankIndex - 1),
      arenaDividend: arenaIdleDividend(arenaDiv),
      arenaCapBonusHours: arenaIdleCapBonusHours(arenaDiv),
      hive,
      synergies: HIVE_SYNERGIES.map((def) => ({ def, live: synergyLive(save.hive.built, def) })),
      mostProductive: mostProductiveOrgan(save.hive.built),
    };
  },

  /** Collect the banked harvest: ONE atomic persist rolls the seeded drop table, pays every
   *  wallet, feeds Account XP, advances the lifetime ledger and re-arms the clock. Null when
   *  the hopper is still warming (< IDLE.minCollectMinutes) or the guard refuses. The accrual
   *  anchor is MONOTONE: a rolled-back clock pays nothing and never rewinds it (rewinding
   *  would let the same wall-clock span be farmed in a loop) — accrual resumes when real time
   *  passes the anchor, and absurdly-future anchors clamp to the bounded freeze window. */
  collectIdleHarvest(now = Date.now()): IdleHarvestReceipt | null {
    if (!guardOk('idle.collect')) return null;
    const save = store.get();
    const last = save.idle.lastCollect || now;
    if (last > now) { // clock rolled back (or a future forge): HOLD — never rewind the anchor.
      const maxLast = now + IDLE.tamperFreezeMaxHours * 3_600_000;
      if (last > maxLast) persist({ ...save, idle: { ...save.idle, lastCollect: maxLast } });
      return null;
    }
    const ctx = idleGateContext(save);
    const arenaDiv = this.arenaDivisionIndex(now);
    const hive = hiveProductionBonus(save.hive.built);
    const acc = idleAccrual(now - last, highestCampaignStage(save), save.idle.nodes, ctx.genomeRankIndex, arenaIdleDividend(arenaDiv), arenaIdleCapBonusHours(arenaDiv), hive);
    if (acc.rawHours * 60 < IDLE.minCollectMinutes) return null;
    const rng = new Rng(((Math.floor(now / 1000) ^ Math.floor(last / 1000)) >>> 0) || 1);
    const roll = rollIdleHarvest(acc, save.idle.nodes, ctx, () => rng.next(), hive);
    let next: SaveData = { ...save };
    const lines: IdleReceiptLine[] = [];
    let value = 0;
    for (const line of roll.lines) {
      value += idleGrantValue(line.grant);
      next = applyIdleGrant(next, line.grant, () => rng.next(), line, lines);
    }
    const xpFold = foldAccountXp(next, roll.xp, now);
    next = xpFold.save;
    // One row per THING: same-lane repeat rolls fold together, materials combine with zero
    // components dropped, and the XP footer lands after the haul (the ceremony's order).
    const merged = mergeIdleReceiptLines(lines);
    if (roll.xp > 0) merged.push({ icon: '⬆', label: `${roll.xp} Account XP`, rare: false });
    const effPct = Math.round(acc.offlineEff * 100);
    persist({
      ...next,
      idle: {
        ...next.idle,
        lastCollect: now,
        lifetimeHours: next.idle.lifetimeHours + acc.effHours,
        harvests: next.idle.harvests + 1,
        lifetimeValue: next.idle.lifetimeValue + Math.round(value),
        bestHours: Math.max(next.idle.bestHours, acc.effHours),
        blooms: next.idle.blooms + (roll.bloom ? 1 : 0),
      },
      timeline: pushTimeline(next.timeline, '⬢', `Hive Production — ${fmtIdleHours(acc.effHours)} banked${roll.bloom ? ' · BLOOM' : ''}`),
    });
    {
      const ev: ToastEvents = [];
      for (const l of roll.lines) {
        const g = l.grant;
        if (g.kind === 'cores') ev.push({ type: 'genomeCores', qty: g.qty });
        else if (g.kind === 'essence') ev.push({ type: 'geneEssence', qty: g.qty });
        else if (g.kind === 'hiveMats') ev.push({ type: 'hiveMaterials', qty: g.qty });
        else if (g.kind === 'tissue') ev.push({ type: 'mulliganTissue', qty: g.qty });
        else if (g.kind === 'ichor') ev.push({ type: 'ichor', qty: g.qty });
        else if (g.kind === 'mats') {
          if (g.mutagen) ev.push({ type: 'mutagen', qty: g.mutagen });
          if (g.scrap) ev.push({ type: 'scrap', qty: g.scrap });
          if (g.catalyst) ev.push({ type: 'catalyst', qty: g.catalyst });
        } else if (g.kind === 'towerShards') ev.push({ type: 'towerShards', qty: g.qtyEach, name: 'every tower' });
        else if (g.kind === 'heroShards') ev.push({ type: 'heroShards', qty: g.qtyEach, name: 'every hero' });
        else if (g.kind === 'mulligan') ev.push({ type: 'mulligan', name: 'Modifier drop' });
        else if (g.kind === 'container') ev.push({ type: 'container', rarity: g.rarity });
        else if (g.kind === 'runCache') ev.push({ type: 'runCache' });
      }
      rewardToast.pushMany(roll.bloom ? 'Hive Production — BLOOM' : 'Hive Production', ev);
    }
    this.evaluateAchievements();
    return {
      lines: merged,
      rawHours: acc.rawHours, effHours: acc.effHours, capHours: acc.capHours, full: acc.full,
      bloom: roll.bloom, xp: roll.xp, value: Math.round(value), efficiencyPct: effPct,
      suggestion: idleSuggestion(store.get().idle.nodes, store.get().hiveMaterials, ctx),
    };
  },

  /** Grow one evolution-tree node: CHITIN spend (docs/ECONOMY.md §localized — the Hive builds
   *  itself from its own secretion, never Genome Cores), progression gates enforced (Campaign /
   *  Genome Rank / Molts / Boss Rush / Collections / Power — the gate is a work-toward label in
   *  the UI, never a silent grey-out). Infinite levels, geometric costs. */
  buyIdleNode(id: string): boolean {
    if (!guardOk('progress.upgrade', `idle:${id}`)) return false;
    const def = IDLE_NODE_BY_ID[id];
    if (!def) return false;
    const save = store.get();
    const level = save.idle.nodes[id] ?? 0;
    if (idleNodeGate(def, level + 1, idleGateContext(save)) !== null) return false;
    const cost = idleNodeCost(def, level);
    if (save.hiveMaterials < cost) return false;
    persist(foldAccountXp({
      ...save,
      hiveMaterials: save.hiveMaterials - cost,
      idle: { ...save.idle, nodes: { ...save.idle.nodes, [id]: level + 1 } },
    }, ACCOUNT_XP.acquisition).save);
    this.evaluateAchievements(); // tree-depth milestones (idle_tree25)
    return true;
  },

  /** Unlock the CURRENT season's Premium track with Ichor (the real-money path is the
   *  store's Season Pass offer — both land on the same flag). */
  buyPassPremium(now = Date.now()): boolean {
    this.pollBattlePass(now);
    const save = store.get();
    if (save.battlePass.premium || save.ichor < BP.premiumIchor) return false;
    const season = seasonForWindow(save.battlePass.window);
    persist({
      ...save,
      ichor: save.ichor - BP.premiumIchor,
      battlePass: { ...save.battlePass, premium: true },
      timeline: pushTimeline(save.timeline, season.glyph, `${season.name} — Premium track unlocked`),
    });
    return true;
  },

  /** Battle Pass permanents + Perennial stacks as run effects (folded like gear). */
  battlePassRunEffects(): CardEffect[] {
    return battlePassEffectsOf(store.get());
  },

  // ── ARENA (docs/ARENA.md) — the live-PvP pillar: ranked seasons, the wins-only pass,
  //    exclusives, and the settle path. Authority model: docs/ONLINE-FOUNDATION.md §4 —
  //    online matches settle server-side (functions/api/arena/report.ts) and reconcile;
  //    AI/offline matches run the SAME shared validators locally, right here. ──

  /** Roll the record into the current 30-day season (archive → soft reset → placements) and
   *  MATERIALIZE lazy rank decay. Idempotent; every arena entry point calls it first. */
  pollArenaSeason(now = Date.now()): void {
    const save = store.get();
    const season = arenaSeasonIndex(now);
    let arena = rolledArenaSave(save.arena, season);
    const decayed = decayedRating(arena.rating, arena.lastPlayedAt, now);
    if (decayed !== arena.rating) arena = { ...arena, rating: decayed };
    if (arena !== save.arena) persist({ ...save, arena });
  },

  /** The division index (0-based) at the live, decay-adjusted rating — the idle dividend's
   *  input (0 for accounts that never touched the arena ⇒ ×1 identity, golden-safe). */
  arenaDivisionIndex(now = Date.now()): number {
    const save = store.get();
    if (save.arena.season === 0 && save.arena.rating === 0) return 0;
    const arena = rolledArenaSave(save.arena, arenaSeasonIndex(now));
    return divisionIndex(decayedRating(arena.rating, arena.lastPlayedAt, now));
  },

  /** The Arena screen's read-model (poll-free — derives the rolled/decayed picture without
   *  persisting; pollArenaSeason materializes on real interactions). */
  arenaView(now = Date.now()): ArenaHubView {
    const save = store.get();
    const season = arenaSeasonIndex(now);
    const arena = rolledArenaSave(save.arena, season);
    const rating = decayedRating(arena.rating, arena.lastPlayedAt, now);
    const div = divisionForRating(rating);
    const divIdx = divisionIndex(rating);
    const info = arenaSeasonInfo(season, now);
    const lp = arenaPassLevelOf(arena.passXp);
    const track = arenaPassTrack(season);
    const claimableFree: number[] = [];
    const claimablePremium: number[] = [];
    for (let l = 1; l <= lp.level; l++) {
      if (!arena.passClaimedFree.includes(l)) claimableFree.push(l);
      if (arena.passPremium && !arena.passClaimedPremium.includes(l)) claimablePremium.push(l);
    }
    return {
      season: info,
      rating,
      division: div,
      divisionIndex: divIdx,
      nextDivision: ARENA_DIVISIONS_NEXT[divIdx] ?? null,
      placementsLeft: arena.placements,
      wins: arena.wins,
      losses: arena.losses,
      streak: arena.streak,
      lifetimeWins: arena.lifetimeWins,
      lifetimeLosses: arena.lifetimeLosses,
      peak: arena.peak,
      pass: {
        xp: arena.passXp,
        level: lp.level,
        into: lp.into,
        need: lp.need,
        premium: arena.passPremium,
        premiumPrice: ARENA_PASS.premiumIchor,
        track,
        claimedFree: new Set(arena.passClaimedFree),
        claimedPremium: new Set(arena.passClaimedPremium),
        claimableFree,
        claimablePremium,
        exclusive: info.exclusive,
        exclusiveLabel: arenaExclusiveLabel(info.exclusive),
        exclusiveOwned: arena.exclusives.includes(info.exclusive),
      },
      idle: { dividend: arenaIdleDividend(divIdx), capBonusHours: arenaIdleCapBonusHours(divIdx) },
      history: arena.history,
      power: this.power().score,
    };
  },

  /** The LOCAL player's match boot bundle — the same snapshot a normal run boots with
   *  (docs/ARENA.md §ruleset), MINUS the unfair-in-PvP layers: no Molt Vows, no Nemesis, no
   *  daily overrides (the mirror fairness rule — both fields fight the seed's world). */
  arenaBootBundle(): ArenaBootBundle {
    const save = store.get();
    return {
      meta: metaModifiers(save),
      towerProgress: this.towerProgress(),
      heroKind: this.selectedHero(),
      heroProgress: this.heroProgress(),
      opts: {
        runEffects: [
          ...this.genomeRunEffects(), ...this.collectionRunEffects(), ...this.trophyRunEffects(),
          ...this.infestationRunEffects(), ...this.cutsceneRunEffects(), ...this.mulliganGlobalEffects(),
          ...this.battlePassRunEffects(),
        ],
        heroRoster: this.fieldedLoadout(),
        heroEquip: this.heroRosterEquip(),
        setEffects: this.fieldedSetEffects(),
        heroAbilityKits: this.heroAbilityKits(),
        favorite: this.favoriteTower(),
        unlocked: this.unlockedTowers(),
        geneLevels: this.geneLevels(),
        geneTranscends: this.geneTranscends(),
        nucleusEffects: this.nucleusEffects(),
        startingGenes: this.startingGenes(),
        unlockedCardIds: this.unlockedCardIds(),
        draftPool: this.discoveredGeneIds(),
      },
    };
  },

  /** Settle one finished match from its validated claim — the shared-validator path
   *  (docs/ONLINE-FOUNDATION.md §4). Exactly-once by matchId; rating moves by the SAME
   *  ratingDelta the server runs; wins (only) feed the pass; rewards pay through the ONE
   *  interpreter (wins → division-banded container + Run Cache; losses → cores + salvage). */
  settleArenaMatch(claim: ArenaMatchClaim, now = Date.now()): ArenaSettleReceipt | null {
    if (!guardOk('arena.settle', claim.matchId)) return null;
    if (arenaClaimProblem(claim) !== null) return null;
    this.pollArenaSeason(now);
    const save = store.get();
    const arena = save.arena;
    if (claim.season !== arena.season) return null; // stale claim (season rolled mid-flight)
    if (arena.settledMatchIds.includes(claim.matchId)) return null; // exactly-once
    const divBefore = divisionIndex(arena.rating);
    const delta = claim.outcome === 'draw'
      ? 0
      : ratingDelta({ rating: arena.rating, oppRating: claim.oppRating, won: claim.outcome === 'win', placementsLeft: arena.placements, streak: arena.streak });
    const rating = applyRatingFloor(arena.rating + delta);
    const divAfter = divisionIndex(rating);
    const { rewards, passXp } = arenaMatchRewards(claim.outcome, divBefore);
    const res = applyRewardList(save, rewards, BP.repeatReplacement, null, 'arena-match');
    const passBefore = arenaPassLevelOf(arena.passXp).level;
    const passAfter = arenaPassLevelOf(arena.passXp + passXp).level;
    const settled = [...arena.settledMatchIds, claim.matchId].slice(-ARENA_SETTLED_CAP);
    const nextArena: ArenaSave = {
      ...arena,
      rating,
      peak: Math.max(arena.peak, rating),
      wins: arena.wins + (claim.outcome === 'win' ? 1 : 0),
      losses: arena.losses + (claim.outcome === 'loss' ? 1 : 0),
      lifetimeWins: arena.lifetimeWins + (claim.outcome === 'win' ? 1 : 0),
      lifetimeLosses: arena.lifetimeLosses + (claim.outcome === 'loss' ? 1 : 0),
      placements: Math.max(0, arena.placements - 1),
      streak: claim.outcome === 'win' ? arena.streak + 1 : 0,
      lastPlayedAt: now,
      passXp: arena.passXp + passXp,
      settledMatchIds: settled,
    };
    const div = divisionForRating(rating);
    persist({
      ...res.next,
      arena: nextArena,
      timeline: claim.outcome === 'win'
        ? pushTimeline(res.next.timeline, '⚔', `Arena victory — ${div.name} (${rating})`)
        : res.next.timeline,
    });
    if (res.stamina > 0) this.grantRushStamina(res.stamina, now);
    rewardToast.pushMany(
      claim.outcome === 'win' ? 'Arena — VICTORY' : claim.outcome === 'loss' ? 'Arena — defeat' : 'Arena — draw',
      res.events,
    );
    this.evaluateAchievements();
    const lines = [...res.lines];
    if (passXp > 0) lines.push({ icon: '⚔', label: `${passXp} Arena Pass XP` });
    return {
      outcome: claim.outcome,
      delta,
      rating,
      division: div.name,
      promoted: divAfter > divBefore,
      demoted: divAfter < divBefore,
      placementsLeft: nextArena.placements,
      lines,
      passXp,
      passLevelUp: passAfter > passBefore ? { from: passBefore, to: passAfter } : null,
    };
  },

  /** Claim one earned Arena Pass level on a track → receipt lines (null = not claimable).
   *  Level 100 additionally grants the SEASON EXCLUSIVE (once ever per content piece — the
   *  forever ledger): the tower/hero joins the account roster with no other acquisition path. */
  claimArenaPassLevel(track: 'free' | 'premium', level: number, now = Date.now()): PremiumReceiptLine[] | null {
    if (!guardOk('arena.claim', `${track}:${level}`)) return null;
    this.pollArenaSeason(now);
    const save = store.get();
    const arena = save.arena;
    if (arena.season === 0) return null; // never touched the arena
    if (level < 1 || level > ARENA_PASS.levels || level > arenaPassLevelOf(arena.passXp).level) return null;
    const claimed = track === 'free' ? arena.passClaimedFree : arena.passClaimedPremium;
    if (claimed.includes(level)) return null;
    if (track === 'premium' && !arena.passPremium) return null;
    const row = arenaPassTrack(arena.season)[level - 1];
    const res = applyRewardList(save, row[track], BP.repeatReplacement, null, 'arena-pass');
    let next = res.next;
    const lines = [...res.lines];
    // The level-100 crown: the season's arena-exclusive content piece (docs/ARENA.md §6).
    if (row.exclusive && !next.arena.exclusives.includes(row.exclusive)) {
      next = grantArenaExclusive(next, row.exclusive);
      lines.push({ icon: '✦', label: `${arenaExclusiveLabel(row.exclusive)} — UNLOCKED` });
    }
    const claimKey = track === 'free' ? 'passClaimedFree' : 'passClaimedPremium';
    persist({
      ...next,
      arena: { ...next.arena, [claimKey]: [...next.arena[claimKey], level] },
      timeline: row.exclusive && next.arena.exclusives.includes(row.exclusive) && !save.arena.exclusives.includes(row.exclusive)
        ? pushTimeline(next.timeline, '✦', `Arena exclusive claimed — ${arenaExclusiveLabel(row.exclusive)}`)
        : next.timeline,
    });
    if (res.stamina > 0) this.grantRushStamina(res.stamina, now);
    this.evaluateAchievements();
    rewardToast.pushMany(`Arena Pass — Level ${level}`, res.events);
    return lines;
  },

  /** Unlock the season's premium arena track (Ichor). Mirrors buyPassPremium. */
  buyArenaPassPremium(now = Date.now()): boolean {
    if (!guardOk('arena.premium')) return false;
    this.pollArenaSeason(now);
    const save = store.get();
    if (save.arena.season === 0 || save.arena.passPremium || save.ichor < ARENA_PASS.premiumIchor) return false;
    const info = arenaSeasonInfo(save.arena.season);
    persist({
      ...save,
      ichor: save.ichor - ARENA_PASS.premiumIchor,
      arena: { ...save.arena, passPremium: true },
      timeline: pushTimeline(save.timeline, info.glyph, `${info.name} — Premium arena track unlocked`),
    });
    return true;
  },

  // ── QUESTS & MISSIONS (docs/QUESTS.md) — the directive layer. Missions compose quests;
  //    the weekly lane is windowed (progress never carries over), the main questline is the
  //    permanent story spine. Crediting seams push events here; claims pay PassReward lists
  //    through the shared interpreter. ──

  /** Advance the weekly rotation window (max-window tamper rule, the Battle-Pass pattern).
   *  On rollover, the OUTGOING week's earned-but-unclaimed missions — and, if every mission
   *  landed, its finale — auto-claim first (mail: progress is never lost), then the weekly
   *  record resets for the incoming quest. Repeat finales substitute currency (§once). Mail
   *  pays the SAME pass XP manual claims would have — granted AFTER the reset persists, so
   *  the level-up's re-entrant credit lands on the incoming week (never re-mails). */
  pollWeeklyQuest(now = Date.now()): void {
    const save = store.get();
    const w = weeklyWindow(now);
    if (w <= save.quests.weekly.window) return;
    const quest = weeklyQuestFor(save.quests.weekly.window);
    let draft = save;
    let mailXp = 0;
    for (const mi of quest.missions) {
      if ((draft.quests.weekly.progress[mi.id] ?? 0) < mi.target || draft.quests.weekly.claimed.includes(mi.id)) continue;
      draft = applyRewardList(draft, mi.rewards, QUESTS.repeatFinale, null).next;
      draft = { ...draft, quests: { ...draft.quests, weekly: { ...draft.quests.weekly, claimed: [...draft.quests.weekly.claimed, mi.id] } } };
      mailXp += QUEST_PASS_XP.mission;
    }
    if (questComplete(quest, draft.quests.weekly.progress) && !draft.quests.weekly.completionClaimed) {
      draft = grantQuestFinale(draft, quest).next;
      mailXp += QUEST_PASS_XP.finale;
    }
    persist({
      ...draft,
      timeline: mailXp > 0 ? pushTimeline(draft.timeline, quest.glyph, `${quest.name} concluded — unclaimed rewards delivered`) : draft.timeline,
      quests: { ...draft.quests, weekly: { window: w, progress: {}, claimed: [], completionClaimed: false } },
    });
    if (mailXp > 0) this.grantPassXp('quest', mailXp, now);
  },

  /** Fold one credit event (a settled run, or a meta act) into BOTH lanes: the live weekly
   *  quest and the ACTIVE main chapter (locked/finished chapters never accrue). Missions that
   *  reach their target here enter the lifetime `missionsDone` codex (docs/QUESTS.md §credit).
   *  Returns the missions COMPLETED by this event (finishRun surfaces them on Results). */
  creditQuests(ev: { type: 'run'; facts: QuestRunFacts } | QuestMetaEvent, now = Date.now()): MissionDef[] {
    creditEventChallenges(ev, now); // live-event challenges ride the SAME judged vocabulary (LIVE-EVENTS.md §6)
    this.pollWeeklyQuest(now);
    const save = store.get();
    const q = save.quests;
    const weekly = weeklyQuestFor(q.weekly.window);
    const chapter = MAIN_QUESTLINE.find((c) => !q.main.completions.includes(c.id)) ?? null;
    const wk = foldCredit(weekly.missions, q.weekly.progress, ev);
    const mn = chapter ? foldCredit(chapter.missions, q.main.progress, ev) : { next: q.main.progress, moved: [] as string[] };
    if (wk.moved.length === 0 && mn.moved.length === 0) return [];
    const nowDone = [...wk.moved, ...mn.moved].filter((id) => {
      const mi = missionById(id);
      const p = wk.moved.includes(id) ? wk.next[id] : mn.next[id];
      return !!mi && (p ?? 0) >= mi.target && !q.missionsDone.includes(id);
    });
    persist({
      ...save,
      quests: {
        ...q,
        weekly: { ...q.weekly, progress: wk.next },
        main: { ...q.main, progress: mn.next },
        missionsDone: nowDone.length > 0 ? [...q.missionsDone, ...nowDone] : q.missionsDone,
      },
    });
    return nowDone.map((id) => missionById(id)).filter((mi): mi is MissionDef => mi !== undefined);
  },

  /** Claim one earned mission's rewards → receipt lines (null = not claimable). Weekly
   *  missions must belong to the LIVE window's quest; main missions to the active chapter. */
  claimQuestMission(missionId: string, now = Date.now()): PremiumReceiptLine[] | null {
    if (!guardOk('quest.claim', missionId)) return null;
    this.pollWeeklyQuest(now);
    const save = store.get();
    const q = save.quests;
    const mi = missionById(missionId);
    const quest = mi ? questById(missionId.slice(0, missionId.indexOf(':'))) : undefined;
    if (!mi || !quest) return null;
    const lane = quest.lane === 'weekly' ? q.weekly : q.main;
    if (quest.lane === 'weekly' && weeklyQuestFor(q.weekly.window).id !== quest.id) return null;
    if (quest.lane === 'main' && (MAIN_QUESTLINE.find((c) => !q.main.completions.includes(c.id))?.id !== quest.id)) return null;
    if ((lane.progress[missionId] ?? 0) < mi.target || lane.claimed.includes(missionId)) return null;
    const res = applyRewardList(save, mi.rewards, QUESTS.repeatFinale, null);
    const claimed = [...lane.claimed, missionId];
    persist({
      ...res.next,
      metabolism: bumpCounter(res.next.metabolism, 'questsClaimed'), // Directive Devotion (docs/METABOLISM.md)
      quests: {
        ...res.next.quests,
        ...(quest.lane === 'weekly'
          ? { weekly: { ...res.next.quests.weekly, claimed } }
          : { main: { ...res.next.quests.main, claimed } }),
        missionsDone: res.next.quests.missionsDone.includes(missionId)
          ? res.next.quests.missionsDone
          : [...res.next.quests.missionsDone, missionId],
      },
    });
    if (res.stamina > 0) this.grantRushStamina(res.stamina, now);
    this.grantPassXp('quest', QUEST_PASS_XP.mission, now); // directives feed the season (docs/BATTLEPASS.md §xp)
    rewardToast.pushMany(`Mission — ${mi.name}`, [...res.events, { type: 'bpXp', qty: QUEST_PASS_XP.mission }]);
    // The receipt names the season credit too — the claim popup teaches the quests→pass loop.
    return [...res.lines, { icon: '❁', label: `+${QUEST_PASS_XP.mission} Season XP` }];
  },

  /** Claim a completed quest's FINALE → receipt lines (null = not claimable). Earned-but-
   *  unclaimed missions auto-claim first (nothing strands). First completion grants the story
   *  cutscene + exclusive cosmetic FOREVER; repeats substitute currency (docs/QUESTS.md §finale).
   *  Claiming a main chapter's finale opens the next chapter. */
  claimQuestFinale(questId: string, now = Date.now()): PremiumReceiptLine[] | null {
    // Dedupe key carries the rotation window — one finale per quest per window is the domain
    // rule, and a NEW window's re-claim (the weekly repeat) must never read as a duplicate.
    if (!guardOk('quest.claim', `finale:${questId}:${weeklyWindow(now)}`)) return null;
    this.pollWeeklyQuest(now);
    const save = store.get();
    const q = save.quests;
    const quest = questById(questId);
    if (!quest) return null;
    if (quest.lane === 'weekly' && (weeklyQuestFor(q.weekly.window).id !== questId || q.weekly.completionClaimed)) return null;
    if (quest.lane === 'main' && (MAIN_QUESTLINE.find((c) => !q.main.completions.includes(c.id))?.id !== questId)) return null;
    const lane = quest.lane === 'weekly' ? q.weekly : q.main;
    if (!questComplete(quest, lane.progress)) return null;
    const lines: PremiumReceiptLine[] = [];
    const events: ToastEvents = [];
    let draft = save;
    let autoClaimed = 0;
    for (const mi of quest.missions) {
      const cur = quest.lane === 'weekly' ? draft.quests.weekly : draft.quests.main;
      if (cur.claimed.includes(mi.id)) continue;
      const res = applyRewardList(draft, mi.rewards, QUESTS.repeatFinale, null);
      const claimed = [...cur.claimed, mi.id];
      draft = {
        ...res.next,
        quests: {
          ...res.next.quests,
          ...(quest.lane === 'weekly'
            ? { weekly: { ...res.next.quests.weekly, claimed } }
            : { main: { ...res.next.quests.main, claimed } }),
          missionsDone: res.next.quests.missionsDone.includes(mi.id)
            ? res.next.quests.missionsDone
            : [...res.next.quests.missionsDone, mi.id],
        },
      };
      lines.push(...res.lines);
      events.push(...res.events);
      autoClaimed++;
    }
    const fin = grantQuestFinale(draft, quest);
    draft = fin.next;
    lines.push(...fin.lines);
    events.push(...fin.events);
    persist({
      ...draft,
      timeline: pushTimeline(draft.timeline, quest.glyph, `Quest complete — ${quest.name}`),
    });
    if (fin.premiere) cutsceneBus.premiere([quest.finaleCutscene]);
    // Auto-claimed missions pay their mission XP too — same rates as claiming them one by one.
    this.grantPassXp('quest', QUEST_PASS_XP.finale + autoClaimed * QUEST_PASS_XP.mission, now);
    this.evaluateAchievements();
    lines.push({ icon: '❁', label: `+${QUEST_PASS_XP.finale + autoClaimed * QUEST_PASS_XP.mission} Season XP` });
    rewardToast.pushMany(`Quest Finale — ${quest.name}`, [...events, { type: 'bpXp', qty: QUEST_PASS_XP.finale + autoClaimed * QUEST_PASS_XP.mission }]);
    return lines;
  },

  /** The Quest Board's read-model (docs/QUESTS.md §ui). Never persists — poll separately. */
  quests(now = Date.now()): QuestsView {
    const save = store.get();
    const q = save.quests;
    const weekly = weeklyQuestFor(Math.max(q.weekly.window, weeklyWindow(now)));
    const live = weekly.id === weeklyQuestFor(q.weekly.window).id; // false only pre-poll on a stale record
    const wkProgress = live ? q.weekly.progress : {};
    const wkClaimed = live ? q.weekly.claimed : [];
    const activeIdx = MAIN_QUESTLINE.findIndex((c) => !q.main.completions.includes(c.id));
    return {
      weekly: {
        quest: weekly,
        endsInMs: msToWeeklyRotation(now),
        progress: wkProgress,
        claimed: new Set(wkClaimed),
        completionClaimed: live ? q.weekly.completionClaimed : false,
        complete: questComplete(weekly, wkProgress),
        finaleClaimable: questComplete(weekly, wkProgress) && !(live ? q.weekly.completionClaimed : false),
        completions: q.questCompletions[weekly.id] ?? 0,
        firstTime: !q.once.includes(`cosmetic:${weekly.id}`),
      },
      main: MAIN_QUESTLINE.map((c, i) => ({
        quest: c,
        state: q.main.completions.includes(c.id) ? 'done' : (i === activeIdx ? 'active' : 'locked') as 'done' | 'active' | 'locked',
        progress: q.main.progress,
        claimed: new Set(q.main.claimed),
        complete: questComplete(c, q.main.progress),
        finaleClaimable: i === activeIdx && questComplete(c, q.main.progress),
        firstTime: !q.once.includes(`cosmetic:${c.id}`),
      })),
      missionsDone: q.missionsDone.length,
    };
  },

  upgradeGene(id: string): boolean {
    if (!guardOk('gene.upgrade', id)) return false;
    const save = store.get();
    const def = cardRegistry.get(id);
    if (!def) return false;
    if (!(save.genesDiscovered ?? []).includes(id)) return false; // must be discovered first
    const level = geneLevel(save.genes, id);
    if (level >= geneMaxLevel(def)) return false; // authored ceiling
    const next = level + 1;
    if (next > geneLevelCapForStage(highestCampaignStage(save))) return false; // campaign gate
    const cost = essenceUpgradeCost(def.rarity, next);
    if (save.geneEssence < cost) return false;
    const prev = save.genes[id];
    const powerBefore = meta.power().score;
    persist(foldAccountXp({
      ...save,
      geneEssence: save.geneEssence - cost,
      genes: { ...save.genes, [id]: { ...prev, level: next, upgradedAt: Date.now() } },
    }, ACCOUNT_XP.acquisition).save);
    announcePower(`${def.name} — Gene Level ${next}`, powerBefore, meta.power().score);
    return true;
  },

  /** TRANSCEND a maxed card (docs/GENE-EVOLUTION.md §Transcendence): spend Essence to add the
   *  chosen SECOND effect line. Re-choosing a DIFFERENT option later pays the full price again
   *  (that is the sink); re-buying the same option is refused (a pure waste). */
  transcendGene(id: string, optionId: string): boolean {
    if (!guardOk('gene.upgrade', `${id}:${optionId}`)) return false;
    const save = store.get();
    const def = cardRegistry.get(id);
    if (!def) return false;
    if (!(save.genesDiscovered ?? []).includes(id)) return false; // must be discovered first
    if (geneLevel(save.genes, id) < geneMaxLevel(def)) return false; // max level only
    if (!transcendOptionsFor(def).some((o) => o.id === optionId)) return false; // real option only
    const prev = save.genes[id];
    if (prev?.transcend === optionId) return false; // already chosen — nothing to buy
    const cost = essenceTranscendCost(def.rarity);
    if (save.geneEssence < cost) return false;
    const powerBefore = meta.power().score;
    persist(foldAccountXp({
      ...save,
      geneEssence: save.geneEssence - cost,
      genes: { ...save.genes, [id]: { ...(prev ?? { level: geneLevel(save.genes, id) }), transcend: optionId, upgradedAt: Date.now() } },
    }, ACCOUNT_XP.acquisition).save);
    // A FIRST transcend must raise Power (audit armed); RE-choosing may go lateral/down by design.
    announcePower(`${def.name} — Transcended`, powerBefore, meta.power().score, !prev?.transcend);
    return true;
  },

  // ── Nucleus Mulligans (docs/NUCLEUS.md) — the Hive Nucleus's own organ system. Organs are
  //    GROWN with Gene Essence (permanent dex), slotted into unlocked CHAMBERS (exclusive), and
  //    chambers 2/3 open through the data-driven NUCLEUS_GATES trials. ──

  /** The raw Nucleus state (read-only view of save.nucleus). */
  nucleus(): NucleusState {
    return store.get().nucleus;
  },
  /** The resolved Nucleus — boot effects, Power, mutations, adaptations (identity while empty). */
  nucleusResolved(): ResolvedNucleus {
    return resolveNucleus(store.get().nucleus);
  },
  /** The run-boot effect list (RunOptions.nucleusEffects). Empty ⇒ byte-identical golden run. */
  nucleusEffects() {
    return resolveNucleus(store.get().nucleus).effects;
  },
  /** The live snapshot NUCLEUS_GATES evaluate against (UI + the unlock action share it). */
  nucleusGateSnapshot(): NucleusGateSnapshot {
    const save = store.get();
    const g = meta.genomeSnapshot();
    return {
      campaignStage: g.campaignStage,
      genomeRankTier: rankFromRating(genomeRating(g)).index,
      powerScore: g.powerScore,
      megasSlain: save.megaProgress.slain.length,
      rushBestBoss: g.rushBestBoss,
      mulligansActive: TOWER_ORDER.filter((k) => isMulliganActive(save.mulligans?.[k])).length,
      masteryLevels: g.masteryLevels,
      molts: g.molts,
      dailyCompletions: g.dailyCompletions,
      collectionPct: g.collectionCompletion,
      ichor: save.ichor,
    };
  },
  /** A chamber gate's live progress rows (null for chamber 1 — born open). */
  nucleusGate(chamber: number): NucleusGateProgress | null {
    return nucleusGateProgress(chamber, meta.nucleusGateSnapshot());
  },
  /** GROW an organ — the permanent Gene Essence sink. Idempotent per organ (already grown ⇒ false). */
  growNucleusOrgan(id: string): boolean {
    if (!guardOk('nucleus.grow', id)) return false;
    const save = store.get();
    const def = nucleusRegistry.get(id);
    if (!def) return false;
    if (save.nucleus.grown[id]) return false; // already grown
    const cost = organGrowCost(def);
    if (save.geneEssence < cost) return false;
    persist(foldAccountXp({
      ...save,
      geneEssence: save.geneEssence - cost,
      nucleus: { ...save.nucleus, grown: { ...save.nucleus.grown, [id]: { level: 1 } } },
    }, ACCOUNT_XP.acquisition).save);
    return true;
  },
  /** Level a grown organ (Gene Essence). Moves Power at once when its chamber is active. */
  upgradeNucleusOrgan(id: string): boolean {
    if (!guardOk('nucleus.grow', `up:${id}`)) return false;
    const save = store.get();
    const def = nucleusRegistry.get(id);
    const cur = save.nucleus.grown[id];
    if (!def || !cur) return false;
    if (cur.level >= organLevelCap(def)) return false;
    const cost = organUpgradeCost(def, cur.level);
    if (save.geneEssence < cost) return false;
    const powerBefore = meta.power().score;
    const hosted = organChamber(save.nucleus, id) !== null && isChamberActive(save.nucleus, organChamber(save.nucleus, id)!);
    persist({
      ...save,
      geneEssence: save.geneEssence - cost,
      nucleus: { ...save.nucleus, grown: { ...save.nucleus.grown, [id]: { level: cur.level + 1 } } },
    });
    announcePower(`${def.name} — Nucleus organ level ${cur.level + 1}`, powerBefore, meta.power().score, hosted);
    return true;
  },
  /** Slot a grown organ into an unlocked chamber (null clears). MOVE semantics — an organ lives
   *  in ONE chamber slot; slotting it elsewhere vacates its old seat (§exclusivity). */
  setNucleusSlot(chamber: number, slot: number, organId: string | null): boolean {
    if (!guardOk('nucleus.slot', `${chamber}:${slot}:${organId ?? '-'}`)) return false;
    const save = store.get();
    if (chamber < 0 || chamber >= save.nucleus.unlocked) return false;
    if (slot < 0 || slot >= (save.nucleus.chambers[chamber]?.length ?? 0)) return false;
    if (organId !== null && (!nucleusRegistry.has(organId) || !save.nucleus.grown[organId])) return false;
    const powerBefore = meta.power().score;
    const chambers = save.nucleus.chambers.map((row) => row.slice());
    if (organId !== null) {
      for (const row of chambers) {
        for (let i = 0; i < row.length; i++) if (row[i] === organId) row[i] = null; // vacate the old seat
      }
    }
    chambers[chamber][slot] = organId;
    const nucleusNext = { ...save.nucleus, chambers };
    // Chronicle a COMPLETED full adaptation into the lifetime ledger (the Adaptation codex —
    // re-slotting later never confiscates the credit).
    const a = chamberAdaptation(nucleusNext, chamber);
    if (a?.tier === 'full' && !(nucleusNext.adapted ?? []).includes(a.cls)) {
      nucleusNext.adapted = [...(nucleusNext.adapted ?? []), a.cls];
    }
    persist({ ...save, nucleus: nucleusNext });
    // Completing (or breaking) a chamber legitimately moves Power either way — no gain expectation.
    announcePower('Nucleus chamber reconfigured', powerBefore, meta.power().score, false);
    return true;
  },
  /** Open the NEXT chamber once its trial is met (chamber 3 also pays its Ichor price). */
  unlockNucleusChamber(chamber: number): boolean {
    if (!guardOk('nucleus.unlock', String(chamber))) return false;
    const save = store.get();
    if (chamber !== save.nucleus.unlocked + 1 || chamber > NUCLEUS_CHAMBERS) return false; // sequential
    const gate = nucleusGateProgress(chamber, meta.nucleusGateSnapshot());
    if (!gate || !gate.ready) return false;
    persist(foldAccountXp({
      ...save,
      ichor: save.ichor - gate.gate.ichorCost,
      nucleus: { ...save.nucleus, unlocked: chamber },
    }, ACCOUNT_XP.acquisition).save);
    return true;
  },

  // ── Hero Symbiotes (docs/HERO-SYMBIOTES.md) — every champion's grafted-organism system: organs
  //    are GRAFTED per host with Gene Essence, seated into that hero's slots (exclusive within the
  //    host), and slots II/III open through per-hero HERO_SYMBIOTE_GATES trials + Ichor. ──

  /** The raw symbiote state for a hero (an empty scaffold while untouched — read-only view). */
  heroSymbiote(kind: HeroKind): HeroSymbioteState {
    return store.get().heroSymbiotes?.[kind] ?? emptyHeroSymbiote();
  },
  /** The resolved symbiote — merged kit, adaptations, resonance, Power (identity while empty). */
  heroSymbioteResolved(kind: HeroKind): ResolvedHeroSymbiote {
    return resolveHeroSymbiote(store.get().heroSymbiotes?.[kind]);
  },
  /** The live per-hero snapshot HERO_SYMBIOTE_GATES evaluate against (UI + unlock share it). */
  symbioteGateSnapshot(kind: HeroKind): SymbioteGateSnapshot {
    const save = store.get();
    const g = meta.genomeSnapshot();
    return {
      kills: save.heroKills[kind] ?? 0,
      masteryLevel: masteryLevel(save.heroMasteryXp[kind] ?? 0),
      stars: save.heroStars[kind] ?? 0,
      campaignStage: g.campaignStage,
      genomeRankTier: rankFromRating(genomeRating(g)).index,
      powerScore: g.powerScore,
      megasSlain: save.megaProgress.slain.length,
      rushBestBoss: g.rushBestBoss,
      molts: g.molts,
      collectionPct: g.collectionCompletion,
      ichor: save.ichor,
    };
  },
  /** A slot gate's live progress rows (null for slot 1 — born open). */
  heroSymbioteGate(kind: HeroKind, slot: number): SymbioteGateProgress | null {
    return symbioteGateProgress(kind, slot, meta.symbioteGateSnapshot(kind));
  },
  /** GRAFT an organ into a hero — the permanent Gene Essence sink. Idempotent per host+organ. */
  graftHeroSymbiote(kind: HeroKind, organId: string): boolean {
    if (!guardOk('symbiote.graft', `${kind}:${organId}`)) return false;
    const save = store.get();
    const def = symbioteRegistry.get(organId);
    if (!def) return false;
    const st = save.heroSymbiotes?.[kind] ?? emptyHeroSymbiote();
    if (st.grown[organId]) return false; // already grafted into this host
    const cost = symbioteGraftCost(def);
    if (save.geneEssence < cost) return false;
    persist(foldAccountXp({
      ...save,
      geneEssence: save.geneEssence - cost,
      heroSymbiotes: { ...save.heroSymbiotes, [kind]: { ...st, grown: { ...st.grown, [organId]: { level: 1 } } } },
    }, ACCOUNT_XP.acquisition).save);
    return true;
  },
  /** Level a grafted organ (Gene Essence). Moves Power at once when its slot is active. */
  upgradeHeroSymbiote(kind: HeroKind, organId: string): boolean {
    if (!guardOk('symbiote.graft', `up:${kind}:${organId}`)) return false;
    const save = store.get();
    const def = symbioteRegistry.get(organId);
    const st = save.heroSymbiotes?.[kind];
    const cur = st?.grown[organId];
    if (!def || !st || !cur) return false;
    if (cur.level >= symbioteLevelCap(def)) return false;
    const cost = symbioteUpgradeCost(def, cur.level);
    if (save.geneEssence < cost) return false;
    const powerBefore = meta.power().score;
    const seat = symbioteSeat(st, organId);
    const hosted = seat !== null && isSlotActive(st, seat.slot);
    persist({
      ...save,
      geneEssence: save.geneEssence - cost,
      heroSymbiotes: { ...save.heroSymbiotes, [kind]: { ...st, grown: { ...st.grown, [organId]: { level: cur.level + 1 } } } },
    });
    announcePower(`${def.name} — symbiote organ level ${cur.level + 1}`, powerBefore, meta.power().score, hosted);
    return true;
  },
  /** Seat a grafted organ into an unlocked slot (null clears). MOVE semantics within the host —
   *  an organ lives in ONE seat; seating it elsewhere vacates its old one (§exclusivity). */
  setHeroSymbioteSeat(kind: HeroKind, slot: number, seat: number, organId: string | null): boolean {
    if (!guardOk('symbiote.slot', `${kind}:${slot}:${seat}:${organId ?? '-'}`)) return false;
    const save = store.get();
    const st = save.heroSymbiotes?.[kind] ?? emptyHeroSymbiote();
    if (slot < 0 || slot >= st.unlocked) return false;
    if (seat < 0 || seat >= (st.slots[slot]?.length ?? 0)) return false;
    if (organId !== null && (!symbioteRegistry.has(organId) || !st.grown[organId])) return false;
    const powerBefore = meta.power().score;
    const slots = st.slots.map((row) => row.slice());
    if (organId !== null) {
      for (const row of slots) {
        for (let i = 0; i < row.length; i++) if (row[i] === organId) row[i] = null; // vacate the old seat
      }
    }
    slots[slot][seat] = organId;
    const next: HeroSymbioteState = { ...st, slots };
    // Chronicle the lifetime ledgers (re-seating never confiscates credit): full adaptations,
    // resonances witnessed, and the host's first complete evolution (docs/HERO-SYMBIOTES.md).
    const a = slotAdaptation(next, slot);
    if (a?.tier === 'full' && !(next.adapted ?? []).includes(a.cls)) next.adapted = [...(next.adapted ?? []), a.cls];
    const res = resonanceOf(next);
    if (res && !(next.resonated ?? []).includes(res.id)) next.resonated = [...(next.resonated ?? []), res.id];
    if (resolveHeroSymbiote(next).evolved) next.evolved = true;
    persist({ ...save, heroSymbiotes: { ...save.heroSymbiotes, [kind]: next } });
    // Completing (or breaking) a slot legitimately moves Power either way — no gain expectation.
    announcePower('Symbiote slot reconfigured', powerBefore, meta.power().score, false);
    return true;
  },
  /** Open the NEXT slot once its trial is met (slots II/III pay their Ichor price). */
  unlockHeroSymbioteSlot(kind: HeroKind, slot: number): boolean {
    if (!guardOk('symbiote.unlock', `${kind}:${slot}`)) return false;
    const save = store.get();
    const st = save.heroSymbiotes?.[kind] ?? emptyHeroSymbiote();
    if (slot !== st.unlocked + 1 || slot > SYMBIOTE_SLOTS) return false; // sequential
    const gate = symbioteGateProgress(kind, slot, meta.symbioteGateSnapshot(kind));
    if (!gate || !gate.ready) return false;
    persist(foldAccountXp({
      ...save,
      ichor: save.ichor - gate.gate.ichorCost,
      heroSymbiotes: { ...save.heroSymbiotes, [kind]: { ...st, unlocked: slot } },
    }, ACCOUNT_XP.acquisition).save);
    return true;
  },

  // ── Mulligan system (docs/MULLIGANS.md) — the per-tower biomechanical organism. All mutations go
  //    through the save; a Mulligan does nothing until all three slots are filled (resolveMulligan). ──

  /** §gate — the pillar unlocks after slaying THREE distinct Mega Bosses. Accounts that
   *  already hold pieces are grandfathered (pre-gate progress is never confiscated). */
  mulligansUnlocked(): boolean {
    const s = store.get();
    return s.megaProgress.slain.length >= MULLIGAN_GATE_MEGAS || Object.keys(s.mulliganDex).length > 0;
  },
  /** Distinct Mega Bosses slain toward the gate (UI progress line). */
  mulliganGateProgress(): { slain: number; needed: number } {
    return { slain: store.get().megaProgress.slain.length, needed: MULLIGAN_GATE_MEGAS };
  },
  /** The persisted Mulligan for a tower kind (a fresh empty one if never touched). */
  mulligan(kind: TowerKind): MulliganState {
    return store.get().mulligans[kind] ?? emptyMulligan();
  },
  /** The RESOLVED Mulligan (folded kit + profile + power; identity unless all three slots filled). */
  mulliganResolved(kind: TowerKind): ResolvedMulligan {
    return resolveMulligan(store.get().mulligans[kind], TOWER_DEFS[kind].combatClass);
  },
  /** Record a modifier discovery at a rarity (loot). Keeps the HIGHEST rarity seen; returns whether
   *  the dex advanced (a new modifier, or a better rarity than before). */
  discoverModifier(id: string, rarity: MulliganRarity): boolean {
    const save = store.get();
    if (!mulliganRegistry.has(id)) return false;
    const cur = save.mulliganDex[id];
    if (cur && rarityAtLeast(cur, rarity)) return false;
    persist({ ...save, mulliganDex: { ...save.mulliganDex, [id]: rarity } });
    return true;
  },
  /** Grant Gene Essence (the Gene Archive's card-upgrade currency) — loot / conversions. */
  grantGeneEssence(amount: number): void {
    const save = store.get();
    persist({ ...save, geneEssence: Math.max(0, save.geneEssence + Math.floor(amount)) });
  },
  /** Grant Mulligan Tissue (the graft-upgrade wallet — docs/ECONOMY.md §localized) — loot / dissolves. */
  grantMulliganTissue(amount: number): void {
    const save = store.get();
    persist({ ...save, mulliganTissue: Math.max(0, save.mulliganTissue + Math.floor(amount)) });
  },
  /** Slot an OWNED piece into a tower's Mulligan (rarity ≤ the owned ceiling; level 1).
   *  §exclusivity: a piece lives on ONE tower — equipping it here MOVES it off its current
   *  host (that organism deactivates) unless either tower is reforge-LOCKED, which refuses.
   *  Recomputes the organism seeds from the new composition. Returns success. */
  equipMulligan(kind: TowerKind, slotIndex: number, modId: string, rarity?: MulliganRarity): boolean {
    const save = store.get();
    if (slotIndex < 0 || slotIndex >= MULLIGAN_SLOTS) return false;
    const def = mulliganRegistry.get(modId);
    if (!def) return false;
    const owned = save.mulliganDex[modId];
    if (!owned) return false; // must be discovered first
    const cur = save.mulligans[kind] ?? emptyMulligan();
    if (cur.locked) return false; // a reforged organism is permanent (§reforge)
    if (cur.slots.some((s, i) => s?.id === modId && i !== slotIndex)) return false; // one physical piece
    const host = modifierHost(save.mulligans, modId);
    let mulligans = save.mulligans;
    if (host && host !== kind) {
      const hostState = mulligans[host as TowerKind];
      if (hostState?.locked) return false; // the piece is BOUND into a locked organism
      const hostSlots = hostState.slots.map((s) => (s?.id === modId ? null : s));
      mulligans = { ...mulligans, [host]: { ...hostState, slots: hostSlots, ...seedFor(host, hostSlots) } };
    }
    const useRarity: MulliganRarity = rarity && rarityAtLeast(owned, rarity) ? rarity : owned; // cap at discovered
    const slot = makeSlot(modId, useRarity, 1);
    if (!slot) return false;
    const slots = cur.slots.slice();
    slots[slotIndex] = slot;
    const powerBefore = meta.power().score;
    persist({ ...save, mulligans: { ...mulligans, [kind]: { slots, ...seedFor(kind, slots) } } });
    // Power only moves once the organism ACTIVATES (all three slots) — announce the awakening jump,
    // stay silent for the first two grafts (no partial activation ⇒ no Power change by design).
    if (meta.mulliganResolved(kind).active) announcePower(`${TOWER_DEFS[kind].name} Mulligan — ${def.name}`, powerBefore, meta.power().score);
    return true;
  },
  /** Clear a slot (organism deactivates until refilled). Refused on a LOCKED organism. */
  unequipMulligan(kind: TowerKind, slotIndex: number): boolean {
    const save = store.get();
    const cur = save.mulligans[kind];
    if (!cur || cur.locked || slotIndex < 0 || slotIndex >= MULLIGAN_SLOTS || !cur.slots[slotIndex]) return false;
    const slots = cur.slots.slice();
    slots[slotIndex] = null;
    persist({ ...save, mulligans: { ...save.mulligans, [kind]: { slots, ...seedFor(kind, slots) } } });
    return true;
  },
  /** Spend Mulligan Tissue to raise a slot's level by one (within its rarity ceiling).
   *  docs/ECONOMY.md §localized — grafts grow from graft tissue, never the Gene Archive's wallet. */
  upgradeMulligan(kind: TowerKind, slotIndex: number): boolean {
    if (!guardOk('craft.mulligan', `${kind}:${slotIndex}`)) return false;
    const save = store.get();
    const cur = save.mulligans[kind];
    const slot = cur?.slots[slotIndex];
    if (!cur || !slot || isMaxLevel(slot)) return false;
    const cost = mulliganUpgradeCost(slot.rarity, slot.level);
    if (save.mulliganTissue < cost) return false;
    const slots = cur.slots.slice();
    slots[slotIndex] = { ...slot, level: slot.level + 1 };
    const powerBefore = meta.power().score;
    persist({ ...save, mulliganTissue: save.mulliganTissue - cost, mulligans: { ...save.mulligans, [kind]: { ...cur, slots } } });
    if (meta.mulliganResolved(kind).active) announcePower(`${TOWER_DEFS[kind].name} Mulligan — Level ${slot.level + 1}`, powerBefore, meta.power().score);
    return true;
  },
  /** Spend Mulligan Tissue to ASCEND a MAXED slot to the next rarity (Ascension-ready). Bumps the dex
   *  so the modifier can be re-slotted at the new rarity; recomputes the (intensified) organism. */
  ascendMulligan(kind: TowerKind, slotIndex: number): boolean {
    if (!guardOk('craft.mulligan', `${kind}:${slotIndex}:asc`)) return false;
    const save = store.get();
    const cur = save.mulligans[kind];
    const slot = cur?.slots[slotIndex];
    if (!cur || !slot || !isMaxLevel(slot)) return false;
    const nxt = nextRarity(slot.rarity);
    const cost = ascendCost(slot.rarity);
    if (!nxt || cost == null || save.mulliganTissue < cost) return false;
    const slots = cur.slots.slice();
    slots[slotIndex] = { id: slot.id, rarity: nxt, level: slot.level }; // level preserved (new cap ≥ old)
    const dexCur = save.mulliganDex[slot.id];
    const mulliganDex = dexCur && rarityAtLeast(dexCur, nxt) ? save.mulliganDex : { ...save.mulliganDex, [slot.id]: nxt };
    const powerBefore = meta.power().score;
    persist({ ...save, mulliganTissue: save.mulliganTissue - cost, mulliganDex, mulligans: { ...save.mulligans, [kind]: { ...cur, slots, ...seedFor(kind, slots) } } });
    if (meta.mulliganResolved(kind).active) announcePower(`${TOWER_DEFS[kind].name} Mulligan — ${nxt}`, powerBefore, meta.power().score);
    return true;
  },
  /** §reforge — spin the wheel on an ACTIVE organism's reforge slot. Spends Ichor, rolls a
   *  rarity-weighted mod (the wheel animates TO this result), and PERMANENTLY LOCKS the
   *  organism onto its host — no unequip, no re-slotting, ever. Re-spinning an occupied
   *  slot replaces its mod (the gamble). Returns the rolled mod, or null (refused). */
  reforgeMulligan(kind: TowerKind, slotIndex: number): { mod: MulliganReforgeMod; cost: number } | null {
    if (!guardOk('craft.mulligan', `${kind}:${slotIndex}:rf`)) return null;
    const save = store.get();
    const cur = save.mulligans[kind];
    if (!cur || !isMulliganActive(cur)) return null;
    const usable = reforgeSlotCount(cur);
    if (slotIndex < 0 || slotIndex >= usable) return null;
    const cost = mulliganReforgeCost(slotIndex);
    if (save.ichor < cost) return null;
    const mod = rollReforgeMod(Math.random(), Math.random());
    const reforges = (cur.reforges ?? [null, null, null]).slice(0, 3);
    while (reforges.length < 3) reforges.push(null);
    reforges[slotIndex] = mod.id;
    const powerBefore = meta.power().score;
    persist({
      ...save,
      ichor: save.ichor - cost,
      mulligans: { ...save.mulligans, [kind]: { ...cur, locked: true, reforges } },
      timeline: pushTimeline(save.timeline, '⊛', `Mulligan Reforged — ${TOWER_DEFS[kind].name}: ${mod.name} (${REFORGE_RARITY[mod.rarity].label})`),
    });
    announcePower(`${TOWER_DEFS[kind].name} Reforge — ${mod.name}`, powerBefore, meta.power().score);
    return { mod, cost };
  },
  /** §reforge — the account-wide passives from LEGENDARY reforge mods across every locked
   *  organism, folded into runs beside the collection/trophy/infestation lanes. */
  mulliganGlobalEffects(): CardEffect[] {
    const s = store.get();
    const out: CardEffect[] = [];
    for (const kind of TOWER_ORDER) {
      const st = s.mulligans[kind];
      if (!st?.reforges) continue;
      const usable = reforgeSlotCount(st);
      for (let i = 0; i < usable; i++) {
        const mod = st.reforges[i] ? reforgeModById(st.reforges[i]!) : undefined;
        if (mod?.global) out.push(...mod.global);
      }
    }
    return out;
  },

  /** Progress prediction (docs/PREDICTION.md) — an intelligent, self-calibrating ESTIMATE (never a
   *  guarantee) of how far the account can expect to reach in a mode, + 1–2 guidance recommendations.
   *  `difficultyId` is the mode's currently selected difficulty (harder ⇒ lower reach). */
  predict(mode: 'campaign' | 'infinite' | 'bossRush', difficultyId?: string): { p: Prediction; recommendations: string[]; advice: { text: string; nav?: string }[] } {
    const save = store.get();
    const powerMult = composePower(accountPowerParts(save)).mult;
    const diffMult = resolveDifficulty(difficultyId).enemyHealthMult;
    const p = mode === 'campaign'
      ? predictCampaign(powerMult, highestCampaignStage(save), diffMult, save.prediction.campaign)
      : mode === 'bossRush'
        ? predictBossRush(powerMult, save.rushBestWave, diffMult, save.prediction.bossRush)
        : predictInfinite(powerMult, save.bestWave, diffMult, save.prediction.infinite);
    const advice = predictionRecommendations(save, mode, p.estimate);
    return { p, recommendations: advice.map((a) => a.text), advice };
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

  /** The gated gene-card ids the account has unlocked — threaded into a run so they can be drafted
   *  (RunOptions.unlockedCardIds). Empty for a fresh account ⇒ the golden draft pool is unchanged. */
  unlockedCardIds(): string[] {
    return unlockedCardIds(store.get());
  },

  /** The DISCOVERED Gene Card ids (docs/CARDS.md §discovery) — the run draft pool
   *  (RunOptions.draftPool) and the Archive's membership set. */
  discoveredGeneIds(): string[] {
    return [...store.get().genesDiscovered];
  },

  /** Claim a locked tower once enough of ITS Tower Shards are banked: spends the unlock cost,
   *  marks it owned, and returns true — it immediately joins the Biomorph Conveyor pool and can
   *  be starred / set as the favorite. False if already owned or unaffordable. */
  unlockTower(kind: TowerKind): boolean {
    if (!guardOk('progress.unlock', kind)) return false;
    const save = store.get();
    if (isTowerUnlocked(save, kind)) return false;
    if (!towerShardGateMet(save, kind)) return false; // its campaign gate isn't cleared — no shards yet
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
    if (!guardOk('progress.unlock', `hero:${kind}`)) return false;
    const save = store.get();
    if (isHeroUnlocked(save, kind)) return false;
    if (HERO_DEFS[kind].unlock) return false; // milestone-gated (Vitriol) — earned by a feat, never claimed with Shards
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
    if (!guardOk('progress.star', `hero:${kind}`)) return false;
    const save = store.get();
    const stars = save.heroStars[kind] ?? 0;
    if (stars >= STAR.maxStars) return false;
    const cost = heroStarCost(stars);
    if ((save.heroShards[kind] ?? 0) < cost) return false;
    const powerBefore = meta.power().score;
    persist(foldAccountXp({
      ...save,
      heroShards: { ...save.heroShards, [kind]: (save.heroShards[kind] ?? 0) - cost },
      heroStars: { ...save.heroStars, [kind]: stars + 1 },
    }, ACCOUNT_XP.acquisition).save);
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
    if (!guardOk('progress.star', kind)) return false;
    const save = store.get();
    if (!isTowerUnlocked(save, kind)) return false; // locked: shards bank toward the unlock
    const stars = save.towerStars[kind] ?? 0;
    if (stars >= STAR.maxTowerStars) return false;
    if (stars >= evolutionStarCap(save)) return false; // Campaign Evolution Cap not yet unlocked
    const cost = towerStarCost(stars);
    if ((save.towerShards[kind] ?? 0) < cost) return false;
    const powerBefore = meta.power().score;
    persist(foldAccountXp({
      ...save,
      towerShards: { ...save.towerShards, [kind]: (save.towerShards[kind] ?? 0) - cost },
      towerStars: { ...save.towerStars, [kind]: stars + 1 },
    }, ACCOUNT_XP.acquisition).save);
    announcePower(`${TOWER_DEFS[kind].name} — Evolution ◈${stars + 1}`, powerBefore, meta.power().score);
    this.evaluateAchievements(); // first_star / star3
    return true;
  },

  // ── PRIME STRAINS (docs/PRIME-STRAINS.md) — the infinite ladder past max Stars ───────────

  /** Buy the next PRIME level for a MAX-Star tower: spends its Strain Samples (+ Catalyst at
   *  deep levels) in ONE atomic persist — both currencies leave together or not at all.
   *  Refused below max Stars: Prime CONTINUES the star seam, it never bypasses it. */
  buyTowerPrime(kind: TowerKind): boolean {
    if (!guardOk('progress.star', `prime:${kind}`)) return false;
    const save = store.get();
    if (!isTowerUnlocked(save, kind)) return false;
    if ((save.towerStars[kind] ?? 0) < STAR.maxTowerStars) return false; // finish the ★ ladder first
    const level = save.towerPrime?.[kind] ?? 0;
    const cost = primeCost('tower', level);
    const catalyst = primeCatalystCost(level + 1);
    if ((save.towerShards[kind] ?? 0) < cost) return false;
    if (save.mats.catalyst < catalyst) return false;
    const powerBefore = meta.power().score;
    persist(foldAccountXp({
      ...save,
      towerShards: { ...save.towerShards, [kind]: (save.towerShards[kind] ?? 0) - cost },
      towerPrime: { ...save.towerPrime, [kind]: level + 1 },
      mats: catalyst > 0 ? { ...save.mats, catalyst: save.mats.catalyst - catalyst } : save.mats,
    }, ACCOUNT_XP.acquisition).save);
    announcePower(`${TOWER_DEFS[kind].name} — Prime Strain L${level + 1}`, powerBefore, meta.power().score);
    return true;
  },

  /** The hero twin: spends Apex Genome (+ Catalyst at deep levels), same gate + atomicity. */
  buyHeroPrime(kind: HeroKind): boolean {
    if (!guardOk('progress.star', `prime:hero:${kind}`)) return false;
    const save = store.get();
    if (!isHeroUnlocked(save, kind)) return false;
    if ((save.heroStars[kind] ?? 0) < STAR.maxStars) return false;
    const level = save.heroPrime?.[kind] ?? 0;
    const cost = primeCost('hero', level);
    const catalyst = primeCatalystCost(level + 1);
    if ((save.heroShards[kind] ?? 0) < cost) return false;
    if (save.mats.catalyst < catalyst) return false;
    const powerBefore = meta.power().score;
    persist(foldAccountXp({
      ...save,
      heroShards: { ...save.heroShards, [kind]: (save.heroShards[kind] ?? 0) - cost },
      heroPrime: { ...save.heroPrime, [kind]: level + 1 },
      mats: catalyst > 0 ? { ...save.mats, catalyst: save.mats.catalyst - catalyst } : save.mats,
    }, ACCOUNT_XP.acquisition).save);
    announcePower(`${HERO_DEFS[kind].name} — Prime Strain L${level + 1}`, powerBefore, meta.power().score);
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

  /** TEAM set bonuses — set pieces POOLED across the fielded roster (2pc at ≥2, 4pc at ≥4), folded
   *  ONCE into the run (App threads this into RunOptions.setEffects). Empty roster ⇒ golden-safe. */
  fieldedSetEffects(): CardEffect[] {
    const save = store.get();
    return teamSetEffects(save.equipment.inventory, fieldedLoadout(save).map((k) => loadoutOf(save, k)));
  },

  /** Per-hero EFFECTIVE ability kits for the fielded roster — the star-gated ult/skills patched by
   *  the hero's chosen ★5/★8 forks (App threads this into RunOptions.heroAbilityKits). A fresh hero
   *  (0 stars, no fork picks) resolves to its base kit ⇒ byte-identical to the static consts. */
  heroAbilityKits(): Partial<Record<HeroKind, ResolvedHeroKit>> {
    const save = store.get();
    const out: Partial<Record<HeroKind, ResolvedHeroKit>> = {};
    for (const kind of fieldedLoadout(save)) out[kind] = resolveHeroKit(kind, save.heroStars[kind] ?? 0, save.heroForks[kind]);
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
      rewardToast.pushMany('Collection Rank-Up', [{ type: 'ichor', qty: gain }]);
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
  // ── Premium Store (docs/PREMIUM-STORE.md) ─────────────────────────────────

  /** Open the store — stamps today's key so the "new rotating pack" nav badge clears. */
  openStore(now?: Date): void {
    const save = store.get();
    const key = dailyKey(now);
    if (save.premium.seenKey === key) return;
    persist({ ...save, premium: { ...save.premium, seenKey: key } });
  },

  /** The ONE availability truth for store surfaces + the sandbox pipeline: the pure catalog
   *  rules (offerAvailable — limits/rotation/window/season-pair) layered with the save-aware
   *  gates the pure fn can't see: season SKUs refuse while Premium is already owned THIS
   *  window; flash SKUs sell only inside their live first-sight window (core/flashOffers.ts). */
  offerPurchasable(offerId: string, now = Date.now()): boolean {
    const offer = premiumOfferById(offerId);
    if (!offer) return false;
    if (offer.kind === 'season') this.pollBattlePass(now); // normalize the window first (mail-safe rollover)
    const save = store.get();
    if (!offerAvailable(offer, dailyKey(new Date(now)), save.premium.purchases, save.premium.lastRotatingBuyKey)) return false;
    if (offer.kind === 'season' && save.battlePass.premium) return false; // one flag per window — no double-charge
    if (offer.kind === 'flash' && flashStatus(offer, save, now) !== 'live') return false;
    return true;
  },

  // ── FLASH SALES (docs/PREMIUM-STORE.md §flash) — presentation ledger ────────
  /** The one offer allowed to pop a modal right now (null = stay quiet). Pure read. */
  flashPopup(now = Date.now()): PremiumOfferDef | null {
    return flashPopupCandidate(store.get(), now);
  },

  /** A popup fired: anchor the offer's countdown (first sight) + stamp the cadence limiter. */
  markFlashShown(offerId: string, now = Date.now()): void {
    const save = store.get();
    const slot = save.premium.flash[offerId] ?? {};
    persist({
      ...save,
      premium: {
        ...save.premium,
        flash: slot.shownAt !== undefined ? save.premium.flash : { ...save.premium.flash, [offerId]: { ...slot, shownAt: now } },
        lastFlashShownAt: now,
      },
    });
  },

  /** The store rendered its Flash section: every ARMED offer anchors its countdown at this
   *  first sight (the store IS a sighting — the 48h window never runs unseen). No cadence
   *  stamp: browsing the store must not delay unrelated popups. */
  markFlashSeen(now = Date.now()): void {
    const save = store.get();
    let flash = save.premium.flash;
    let changed = false;
    for (const f of flashOverview(save, now)) {
      if (f.status === 'ready') {
        flash = { ...flash, [f.offer.id]: { ...flash[f.offer.id], shownAt: now } };
        changed = true;
      }
    }
    if (changed) persist({ ...save, premium: { ...save.premium, flash } });
  },

  /** Popup closed without buying: never modal again (the store chip stays for the window). */
  dismissFlashPopup(offerId: string): void {
    const save = store.get();
    const slot = save.premium.flash[offerId];
    if (!slot || slot.dismissed) return;
    persist({ ...save, premium: { ...save.premium, flash: { ...save.premium.flash, [offerId]: { ...slot, dismissed: true } } } });
  },

  /**
   * Purchase a premium offer. Runs the full pipeline — availability → CHECKOUT SEAM → grants →
   * ledger — and returns the receipt the reveal ceremony renders (null = refused/unavailable).
   *
   * PAYMENTS: `PREMIUM.checkout` is 'sandbox' — the charge step below is a stub that always
   * clears. A production provider (Stripe / Steam / App Store) replaces ONLY that step with its
   * real flow (async checkout → verify → then the grant block runs unchanged). No payment
   * secrets or processing exist in this client.
   *
   * SAFEGUARDS (state/premiumSafeguards.test.ts): grants flow through the game's normal
   * pipelines; purchased Cores deliberately do NOT feed prestige.cycleShards (money never mints
   * Ascendant Cells); equipment grants are rarity-capped by the type system; nothing here can
   * touch campaign progress, evolution caps, or hero slots.
   */
  purchaseOffer(offerId: string, now?: Date): PremiumReceipt | null {
    if (!guardOk('purchase.offer', offerId)) return null;
    const offer = premiumOfferById(offerId);
    if (!offer) return null;
    if (!this.offerPurchasable(offerId, (now ?? new Date()).getTime())) return null;
    const save = store.get(); // AFTER the availability check — season SKUs may normalize the pass window
    const key = dailyKey(now);
    // ── checkout seam: this path is the SANDBOX (dev/offline) charge stub. Production
    //    builds route real money through Stripe Checkout → /api/store/claim →
    //    applyVerifiedPurchase below (docs/DEPLOYMENT.md §purchases) — the grant
    //    interpreter is shared, so both paths grant identically. ──
    const sandbox = true;
    const { lines, stamina, next } = this.interpretGrants(save, offer);
    persist({
      ...next,
      premium: {
        ...save.premium,
        purchases: { ...save.premium.purchases, [offer.id]: (save.premium.purchases[offer.id] ?? 0) + 1 },
        lastRotatingBuyKey: offer.kind === 'rotating' ? key : save.premium.lastRotatingBuyKey,
        totalSpentUsd: save.premium.totalSpentUsd + offer.priceUsd,
      },
      timeline: pushTimeline(save.timeline, '✷', `Premium — ${offer.name}`),
    });
    if (stamina > 0) this.grantRushStamina(stamina); // capped by the existing pipeline
    return { offer, lines, valueIchor: offerValueIchor(offer), sandbox, powerPotential: this.offerPowerPotential(offerId) };
  },

  /**
   * Apply a SERVER-VERIFIED purchase (docs/DEPLOYMENT.md §purchases). Called after
   * /api/store/claim confirms the Stripe Checkout Session is paid and awards this
   * client the fulfillment. `receiptId` (the session id) is the apply-once guard:
   * a receipt already in the ledger is never granted again — double clicks, second
   * tabs, refreshes and re-claims all collapse to one application. Availability is
   * deliberately NOT re-checked here: the money moved and the SERVER enforced offer
   * caps at checkout creation — a paid receipt always delivers.
   */
  applyVerifiedPurchase(offerId: string, receiptId: string): PremiumReceipt | null {
    const save = store.get();
    if (save.premium.claimedReceipts.includes(receiptId)) return null; // already applied
    const offer = premiumOfferById(offerId);
    if (!offer) return null; // unknown catalog id (server validates; defensive)
    const { lines, stamina, next } = this.interpretGrants(save, offer);
    const pending = save.premium.pendingCheckout;
    persist({
      ...next,
      premium: {
        ...save.premium,
        purchases: { ...save.premium.purchases, [offer.id]: (save.premium.purchases[offer.id] ?? 0) + 1 },
        lastRotatingBuyKey: offer.kind === 'rotating' ? dailyKey() : save.premium.lastRotatingBuyKey,
        totalSpentUsd: save.premium.totalSpentUsd + offer.priceUsd,
        claimedReceipts: [...save.premium.claimedReceipts, receiptId].slice(-200),
        pendingCheckout: pending && pending.sessionId === receiptId ? null : pending,
      },
      timeline: pushTimeline(save.timeline, '✷', `Premium — ${offer.name}`),
    });
    if (stamina > 0) this.grantRushStamina(stamina);
    return { offer, lines, valueIchor: offerValueIchor(offer), sandbox: false, powerPotential: this.offerPowerPotential(offerId) };
  },

  /** Record an in-flight redirect checkout so a refresh / power loss / closed tab
   *  can resume the claim on next boot (docs/DEPLOYMENT.md §purchases). */
  beginPendingCheckout(offerId: string, sessionId: string): void {
    const save = store.get();
    persist({ ...save, premium: { ...save.premium, pendingCheckout: { offerId, sessionId, startedAt: Date.now() } } });
  },

  // ── FIELD RESEARCH (docs/RESEARCH.md) — the optional rewarded-ad lane ─────────

  /** Today's research board: rows (mode-gated, windowed), per-reward/pool claim counts
   *  (stale days read as zero), the progression scale, and the armed boosts. Pure read. */
  researchView(now?: Date): {
    day: string;
    scale: number;
    rows: (ResearchRewardDef & { claimed: number; cap: number; poolLeft: number })[];
    pools: Record<ResearchCategory, { used: number; cap: number }>;
    pendingBoosts: ResearchRewardDef[];
    lifetimeViews: number;
  } {
    const save = store.get();
    const day = researchDayKey(now);
    const fresh = save.research.day === day ? save.research.claims : {};
    const scale = this.researchScaleFor(save);
    const pools = {} as Record<ResearchCategory, { used: number; cap: number }>;
    const rows = activeResearchRewards(day).filter((d) => this.researchRewardVisible(d, save));
    for (const cat of Object.keys(RESEARCH.pools) as ResearchCategory[]) {
      const used = rows.filter((r) => r.category === cat).reduce((n, r) => n + (fresh[r.id] ?? 0), 0);
      pools[cat] = { used, cap: RESEARCH.pools[cat] };
    }
    return {
      day,
      scale,
      rows: rows.map((r) => ({
        ...r,
        claimed: fresh[r.id] ?? 0,
        cap: Math.min(r.dailyCap ?? RESEARCH.pools[r.category], RESEARCH.pools[r.category]),
        poolLeft: Math.max(0, RESEARCH.pools[r.category] - pools[r.category].used),
      })),
      pools,
      pendingBoosts: save.research.pendingBoosts
        .map((id) => researchRewardById(id))
        .filter((d): d is ResearchRewardDef => !!d),
      lifetimeViews: save.research.lifetime.views,
    };
  },

  researchRewardVisible(d: ResearchRewardDef, save: SaveData): boolean {
    if (d.requires === 'bossRush') return isBossRushUnlocked(save);
    if (d.requires === 'daily') return isDailyUnlocked(save);
    return true;
  },

  /** The progression scale (docs/RESEARCH.md §scaling): campaign + prestige + collection. */
  researchScaleFor(save: SaveData): number {
    const view = collectionView(collectionContextOf(save));
    return researchScale({ stage: highestCampaignStage(save), molts: save.prestige.molts, collectionFrac: view.completion });
  },

  /** Record a completed field-study VIEW (the provider finished). Local, privacy-friendly. */
  recordResearchView(): void {
    const save = store.get();
    persist({
      ...save,
      research: { ...save.research, lifetime: { ...save.research.lifetime, views: save.research.lifetime.views + 1 } },
    });
  },

  /**
   * Claim a Field Research reward AFTER the provider confirms a completed study.
   * Enforces the daily category pools + per-reward caps (UTC rollover), scales sample
   * payouts, routes grants through the SAME interpreter as the Premium Store, arms
   * boosts, and books the day's ledger. Returns the receipt for the reveal — null =
   * refused (capped / unknown / gated).
   */
  claimResearch(rewardId: string, pick?: EmergencyPick, now?: Date): PremiumReceipt | null {
    if (!guardOk('research.claim', rewardId)) return null;
    const save = store.get();
    const def = researchRewardById(rewardId);
    if (!def) return null;
    const day = researchDayKey(now);
    if (!activeResearchRewards(day).some((d) => d.id === rewardId)) return null; // windowed row off-season
    if (!this.researchRewardVisible(def, save)) return null;
    const claims = save.research.day === day ? { ...save.research.claims } : {};
    const rows = activeResearchRewards(day);
    const poolUsed = rows.filter((r) => r.category === def.category).reduce((n, r) => n + (claims[r.id] ?? 0), 0);
    if (poolUsed >= RESEARCH.pools[def.category]) return null; // category pool spent
    if ((claims[def.id] ?? 0) >= (def.dailyCap ?? RESEARCH.pools[def.category])) return null; // per-reward cap

    const scale = this.researchScaleFor(save);
    let boosts = save.research.pendingBoosts;
    let grants: PremiumGrant[] = [];
    if (def.category === 'emergency') {
      // The player chose the payout (docs/RESEARCH.md §emergency).
      const choice = pick ?? 'cores';
      if (!EMERGENCY_PICKS.some((p) => p.pick === choice)) return null;
      if (choice === 'ichor') grants = [{ grant: 'ichor', qty: 3 }];
      else if (choice === 'container') grants = [{ grant: 'container', rarity: specimenRarity(day), count: 1 }];
      else if (choice === 'cores') grants = def.grants!(scale);
      else boosts = boosts.length < 8 ? [...boosts, 'mastery_focus'] : boosts;
    } else if (def.boost) {
      if (boosts.length >= 8) return null; // pathological hoarding guard
      boosts = [...boosts, def.id];
    } else if (def.grants) {
      grants = def.grants(scale);
      // The specimen pod's rarity is a deterministic per-day roll (no reroll-scumming).
      if (def.id === 'sealed_specimen') grants = [{ grant: 'container', rarity: specimenRarity(day), count: 1 }];
    }

    // Grants flow through the Premium Store interpreter — same pipelines, same safeguards.
    const synthetic = grants.length
      ? { id: `research:${def.id}`, kind: 'ichor' as const, name: def.name, tagline: def.blurb, priceUsd: 0.01, grants, accent: def.accent, art: def.icon }
      : null;
    const applied = synthetic ? this.interpretGrants(save, synthetic) : { next: save, lines: [] as PremiumReceiptLine[], stamina: 0 };
    const lines = synthetic
      ? applied.lines
      : [{ icon: def.icon, label: `${def.name} armed — applies to your next completed run` }];

    persist({
      ...applied.next,
      research: {
        day,
        claims: { ...claims, [def.id]: (claims[def.id] ?? 0) + 1 },
        pendingBoosts: boosts,
        lifetime: {
          views: save.research.lifetime.views,
          claims: { ...save.research.lifetime.claims, [def.id]: (save.research.lifetime.claims[def.id] ?? 0) + 1 },
        },
      },
      timeline: pushTimeline(save.timeline, '⌬', `Field Research — ${def.name}`),
    });
    if (applied.stamina > 0) this.grantRushStamina(applied.stamina);
    const receipt: PremiumOfferDef = synthetic ?? { id: `research:${def.id}`, kind: 'ichor', name: def.name, tagline: def.blurb, priceUsd: 0.01, grants: [], accent: def.accent, art: def.icon };
    return { offer: receipt, lines, valueIchor: 0, sandbox: false, powerPotential: 0 };
  },

  /** Consume nothing, clear armed boosts (dev/reset hygiene). */
  clearResearchBoosts(): void {
    const save = store.get();
    if (save.research.pendingBoosts.length === 0) return;
    persist({ ...save, research: { ...save.research, pendingBoosts: [] } });
  },

  /** Clear the pending marker (cancelled / expired / claimed-elsewhere). */
  clearPendingCheckout(): void {
    const save = store.get();
    if (!save.premium.pendingCheckout) return;
    persist({ ...save, premium: { ...save.premium, pendingCheckout: null } });
  },

  /** The ONE grant pipeline both purchase paths share (sandbox purchaseOffer;
   *  verified applyVerifiedPurchase): interpret an offer's grants over a save
   *  snapshot. Pure — no persist, no ledger; callers own both. Stamina is
   *  returned for the caller's capped grantRushStamina pipeline. */
  interpretGrants(save: SaveData, offer: PremiumOfferDef): { next: SaveData; lines: PremiumReceiptLine[]; stamina: number } {
    // ── grant interpreter — one pass builds the next save + the receipt lines ──
    let ichor = save.ichor;
    let lifetimeIchor = save.lifetimeIchor;
    let shards = save.shards;
    let lifetimeShards = save.lifetimeShards;
    let geneEssence = save.geneEssence;
    const mats = { ...save.mats };
    const towerShards = { ...save.towerShards };
    const heroShards = { ...save.heroShards };
    const pending = [...save.pendingContainers];
    const inventory = [...save.equipment.inventory];
    let stamina = 0;
    let battlePassPremium = save.battlePass.premium;
    const lines: PremiumReceiptLine[] = [];
    for (const g of offer.grants) {
      switch (g.grant) {
        case 'ichor':
          ichor += g.qty; lifetimeIchor += g.qty;
          lines.push({ icon: '◆', label: `${g.qty} Ichor` });
          break;
        case 'cores':
          // NOT prestige.cycleShards: purchased Cores never count toward the Molt mint (safeguard).
          shards += g.qty; lifetimeShards += g.qty;
          lines.push({ icon: '⬡', label: `${g.qty} Genome Cores` });
          break;
        case 'geneEssence':
          geneEssence += g.qty;
          lines.push({ icon: '⌬', label: `${g.qty} Gene Essence` });
          break;
        case 'mats':
          mats.mutagen += g.mutagen ?? 0; mats.scrap += g.scrap ?? 0; mats.catalyst += g.catalyst ?? 0;
          lines.push({ icon: '⚒', label: `Materials — ⊕${g.mutagen ?? 0} · ◳${g.scrap ?? 0} · ✷${g.catalyst ?? 0}` });
          break;
        case 'towerShardsAll':
          // Gate-eligible towers only (docs/SIPHON.md §gate): a purchase accelerates toward gates, it
          // never crosses one — a deep-gated tower's shards stay sealed until its progression gate.
          for (const k of towerShardPool(save)) towerShards[k] = (towerShards[k] ?? 0) + g.qtyEach;
          lines.push({ icon: '✦', label: `${g.qtyEach} Strain Samples × every tower` });
          break;
        case 'heroShardsAll':
          for (const k of HERO_ORDER) heroShards[k] = (heroShards[k] ?? 0) + g.qtyEach;
          lines.push({ icon: '✦', label: `${g.qtyEach} Apex Genome × every hero` });
          break;
        case 'container':
          for (let i = 0; i < g.count; i++) pending.push({ kind: 'loot', rarity: g.rarity });
          lines.push({ icon: '◈', label: `${g.count}× ${g.rarity} Bio-Container`, rarity: g.rarity });
          break;
        case 'runCache':
          for (let i = 0; i < g.count; i++) pending.push({ kind: 'cache', chestId: RUN_CHEST });
          lines.push({ icon: '⬢', label: `${g.count}× Run Cache` });
          break;
        case 'equipment': {
          // Rolled by the NORMAL generator at the offer's (epic-capped) rarity; ilvl rides the
          // account's depth so drops read on-curve, never ahead of it.
          const names: string[] = [];
          for (let i = 0; i < g.count; i++) {
            const def = CAPPED_GRANT_ITEMS[Math.floor(Math.random() * CAPPED_GRANT_ITEMS.length)];
            const item = rollItem(Math.random, def, g.rarity, Math.max(1, save.bestWave));
            inventory.push(item);
            names.push(itemDef(item.defId)?.name ?? item.defId);
          }
          lines.push({ icon: '⛨', label: `${g.count}× ${g.rarity} Equipment — ${names.join(', ')}`, rarity: g.rarity });
          break;
        }
        case 'rushStamina':
          stamina += g.qty; // granted after the persist via the existing capped pipeline
          lines.push({ icon: '☠', label: `${g.qty} Rush Stamina` });
          break;
        case 'battlePassPremium':
          // Same flag the Ichor door sets (docs/BATTLEPASS.md §premium). Idempotent — an
          // already-premium season simply re-lines the receipt (store availability gates it).
          battlePassPremium = true;
          lines.push({ icon: '❁', label: 'Season Pass — premium track unlocked' });
          break;
      }
    }
    // Pack shards BANK even on max-Star units — they fuel the Prime ladder now
    // (docs/PRIME-STRAINS.md §economy); only container opens convert duplicates.
    return {
      lines,
      stamina,
      next: {
        ...save,
        ichor, lifetimeIchor, shards, lifetimeShards, geneEssence, mats, towerShards, heroShards,
        pendingContainers: pending,
        equipment: { ...save.equipment, inventory },
        battlePass: { ...save.battlePass, premium: battlePassPremium },
      },
    };
  },

  /** Honest Power estimate for an offer: purchases alone move Power by ZERO (nothing auto-equips,
   *  shards must still be SPENT at normal prices) — this previews the score if the granted shards
   *  were invested in the stars they can afford right now. "Up to +N when invested." */
  offerPowerPotential(offerId: string): number {
    const offer = premiumOfferById(offerId);
    if (!offer) return 0;
    let towerGrant = 0;
    let heroGrant = 0;
    for (const g of offer.grants) {
      if (g.grant === 'towerShardsAll') towerGrant += g.qtyEach;
      if (g.grant === 'heroShardsAll') heroGrant += g.qtyEach;
    }
    if (towerGrant === 0 && heroGrant === 0) return 0;
    const before = this.power().score;
    const after = this.previewPower((s) => {
      const towerStars = { ...s.towerStars };
      const heroStars = { ...s.heroStars };
      const cap = evolutionStarCap(s);
      for (const k of TOWER_ORDER) {
        let budget = (s.towerShards[k] ?? 0) + towerGrant;
        let stars = towerStars[k] ?? 0;
        // Greedy: buy every star the granted+banked shards afford, still honouring the CAMPAIGN
        // Evolution Cap — money cannot cross that gate (the safeguard the cap exists for).
        while (stars < cap && budget >= towerStarCost(stars)) { budget -= towerStarCost(stars); stars++; }
        towerStars[k] = stars;
      }
      for (const k of HERO_ORDER) {
        let budget = (s.heroShards[k] ?? 0) + heroGrant;
        let stars = heroStars[k] ?? 0;
        while (stars < STAR.maxStars && budget >= heroStarCost(stars)) { budget -= heroStarCost(stars); stars++; }
        heroStars[k] = stars;
      }
      return { ...s, towerStars, heroStars };
    }).score;
    return Math.max(0, after - before);
  },

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

  /** Bank Bio-Spores (Roulette ammo) from any source — quest finales and pass milestones go
   *  through applyRewardList instead; this is the direct lane (Boss Rush runs, dev grants). */
  addBioSpores(n: number, source: string): void {
    const amt = Math.max(0, Math.floor(n));
    if (amt <= 0) return;
    const save = store.get();
    persist({ ...save, bioSpores: Math.min(999, save.bioSpores + amt) });
    rewardToast.push({ type: 'bioSpores', qty: amt, source });
  },

  /** One-click Bio-Roulette collection (docs/BOSS-RUSH.md §roulette): fold every landed pod
   *  into the account in a single persist, advance the lifetime spore ledger, then re-poll
   *  achievements (the roulette ladder unlocks + toasts through the normal channel). */
  grantRouletteRewards(rewards: RouletteReward[], spores: number): void {
    const save = store.get();
    const spent = Math.max(0, Math.floor(spores));
    let next: SaveData = {
      ...save,
      bioSpores: Math.max(0, save.bioSpores - spent), // a session consumes its banked ammo
      stats: { ...save.stats, rouletteSpores: save.stats.rouletteSpores + spent },
      metabolism: bumpCounter(save.metabolism, 'sporesAbsorbed', spent), // Roulette Communion (docs/METABOLISM.md)
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
          const def = CAPPED_GRANT_ITEMS[Math.floor(Math.random() * CAPPED_GRANT_ITEMS.length)];
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
    this.grantPassXp('roulette', 30); // the wheel feeds the season too (docs/BATTLEPASS.md §xp)
    this.creditQuests({ type: 'roulette', n: 1 }); // …and the directive layer (docs/QUESTS.md §credit)
    this.evaluateAchievements();
  },

  /** Claim a live-event track milestone (docs/LIVE-EVENTS.md §6): threshold claim — the
   *  token bank must have REACHED `at` (tokens are the ladder, not spent here). Pays through
   *  applyRewardList, so repeat-window permanents substitute automatically. */
  claimEventMilestone(eventKey: string, at: number, now = Date.now()): PremiumReceiptLine[] | null {
    if (!guardOk('event.claim')) return null;
    const a = activeLiveEvents(now).find((x) => x.key === eventKey);
    if (!a) return null;
    const save = store.get();
    const le = save.liveEvents;
    const milestone = eventTrack(a.def).find((m) => m.at === at);
    if (!milestone) return null;
    if ((le.claimed[eventKey] ?? []).includes(at)) return null;
    if ((le.tokens[eventKey] ?? 0) < at) return null;
    const { next, lines, stamina, events } = applyRewardList(save, milestone.rewards, QUESTS.repeatFinale, null, `event:${a.def.id}`);
    persist({ ...next, liveEvents: { ...le, claimed: { ...le.claimed, [eventKey]: [...(le.claimed[eventKey] ?? []), at] } } });
    if (stamina > 0) this.grantRushStamina(stamina, now);
    rewardToast.pushMany(a.def.name, events);
    this.evaluateAchievements();
    return lines;
  },

  /** Buy a live-event shop row — the token SINK (docs/LIVE-EVENTS.md §shops): finite stock
   *  per limit window, spends the window bank. `shopRowView` is the ONE arbiter of remaining
   *  stock — daily/weekly rows count under composite `rowId@period` keys (window pruning
   *  retires them for free), lifetime rows under the never-pruned `eventId:rowId` ledger so a
   *  signature piece stays sold across every future return of the event. A `bpXp` rider feeds
   *  the season lane post-persist (the claimQuestMission pattern — bpXp is not a PassReward). */
  buyEventShopRow(eventKey: string, rowId: string, now = Date.now()): PremiumReceiptLine[] | null {
    if (!guardOk('event.buy')) return null;
    const a = activeLiveEvents(now).find((x) => x.key === eventKey);
    const row = a?.def.shop?.find((r) => r.id === rowId);
    if (!a || !row) return null;
    const save = store.get();
    const le = save.liveEvents;
    const view = shopRowView(a, row, le, now);
    if (view.soldOut || !view.affordable) return null;
    const { next, lines, stamina, events } = applyRewardList(save, row.rewards, QUESTS.repeatFinale, null, `event:${a.def.id}`);
    const lifetimeKey = `${a.def.id}:${row.id}`;
    persist({
      ...next,
      liveEvents: {
        ...le,
        tokens: { ...le.tokens, [eventKey]: (le.tokens[eventKey] ?? 0) - row.costTokens },
        ...((row.limit ?? 'window') === 'lifetime'
          ? { lifetimeBought: { ...le.lifetimeBought, [lifetimeKey]: view.bought + 1 } }
          : { shopBought: { ...le.shopBought, [eventKey]: { ...(le.shopBought[eventKey] ?? {}), [rowLedgerKey(row, now)]: view.bought + 1 } } }),
      },
    });
    if (stamina > 0) this.grantRushStamina(stamina, now);
    if (row.bpXp) {
      this.grantPassXp('event-shop', row.bpXp, now);
      lines.push({ icon: '❁', label: `+${row.bpXp} Season XP` });
      events.push({ type: 'bpXp', qty: row.bpXp });
    }
    rewardToast.pushMany(`${a.def.storefront?.name ?? a.def.name} — ${row.name}`, events);
    return lines;
  },

  /** Claim EVERY reached-but-unclaimed tier on one Metabolism track in a single gesture →
   *  combined receipt lines (null = nothing claimable). Tier payouts run through
   *  applyRewardList tier by tier (each tier's grown qty honored); bpXp rows feed the season
   *  lane post-persist (the claimQuestMission pattern). Guarded ONCE for the whole batch — a
   *  veteran's ten-tier back-fill is one gesture, not ten (the openContainers reasoning). */
  claimMetabolism(trackId: string, now = Date.now()): PremiumReceiptLine[] | null {
    if (!guardOk('metabolism.claim', trackId)) return null;
    const def = metaTrack(trackId);
    if (!def) return null;
    const save = store.get();
    const v = trackView(save, def);
    if (v.claimable <= 0) return null;
    let next = save;
    const lines: PremiumReceiptLine[] = [];
    const events: ToastEvents = [];
    let stamina = 0;
    let bpXp = 0;
    for (let tier = v.claimed; tier < v.reached; tier++) {
      const rows = rewardsFor(def, tier);
      for (const r of rows) if (r.type === 'bpXp') bpXp += r.qty;
      const res = applyRewardList(next, toPassRewards(rows), QUESTS.repeatFinale, null, 'metabolism');
      next = res.next; lines.push(...res.lines); events.push(...res.events); stamina += res.stamina;
    }
    persist({ ...next, metabolism: { ...next.metabolism, claimed: { ...next.metabolism.claimed, [def.id]: v.reached } } });
    if (stamina > 0) this.grantRushStamina(stamina, now);
    if (bpXp > 0) {
      this.grantPassXp('metabolism', bpXp, now);
      lines.push({ icon: '❁', label: `+${bpXp} Season XP` });
      events.push({ type: 'bpXp', qty: bpXp });
    }
    rewardToast.pushMany(`${META_CATS[def.cat].label} — ${def.name}`, events);
    this.evaluateAchievements();
    return lines;
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
    if (!guardOk('ichor.spend')) return false;
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
      heroes: HERO_ORDER.filter((k) => isHeroUnlocked(save, k)),
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
    if (!guardOk('market.buy', slotId)) return false;
    const save = store.get();
    const window = Math.max(marketWindow(now), save.market.window);
    const bought = save.market.window === window ? save.market.bought : [];
    if (bought.includes(slotId)) return false;
    const stock = rollStock(marketSeedOf(save), window, {
      towers: TOWER_ORDER.filter((k) => isTowerUnlocked(save, k)),
      heroes: HERO_ORDER.filter((k) => isHeroUnlocked(save, k)),
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
    const ev: ToastEvents = []; // the purchased good placards (docs/NOTIFICATIONS.md §reward-toasts)
    switch (it.good) {
      case 'towerShards':
        next = { ...next, towerShards: { ...next.towerShards, [it.kind]: (next.towerShards[it.kind] ?? 0) + it.qty } };
        ev.push({ type: 'towerShards', qty: it.qty, name: TOWER_DEFS[it.kind].name });
        break;
      case 'heroShards':
        next = { ...next, heroShards: { ...next.heroShards, [it.hero]: (next.heroShards[it.hero] ?? 0) + it.qty } };
        ev.push({ type: 'heroShards', qty: it.qty, name: HERO_DEFS[it.hero as HeroKind].name });
        break;
      case 'scrap':
        next = { ...next, mats: { ...next.mats, scrap: next.mats.scrap + it.qty } };
        ev.push({ type: 'scrap', qty: it.qty });
        break;
      case 'geneEssence':
        next = { ...next, geneEssence: next.geneEssence + it.qty };
        ev.push({ type: 'geneEssence', qty: it.qty });
        break;
      case 'equipment': {
        // The SLOT (rarity + price) is deterministic per window; the concrete piece rolls at
        // purchase like every other equipment grant (meta layer, Math.random).
        const def = CAPPED_GRANT_ITEMS[Math.floor(Math.random() * CAPPED_GRANT_ITEMS.length)];
        const item = rollItem(Math.random, def, it.equipRarity, undefined, 'Splice Market');
        next = { ...next, equipment: { ...next.equipment, inventory: [...next.equipment.inventory, item] } };
        ev.push({ type: 'equipment', name: itemDef(item.defId)?.name ?? 'Equipment', rarity: item.rarity });
        break;
      }
      case 'container': {
        const def = rarityRegistry.get(it.rarity);
        next = {
          ...next,
          pendingContainers: [...next.pendingContainers, { kind: 'loot', rarity: it.rarity }],
          timeline: pushTimeline(next.timeline, '◈', `Splice Market — ${def?.name ?? it.rarity} Bio-Container acquired`),
        };
        ev.push({ type: 'container', rarity: it.rarity });
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
        ev.push({ type: 'stamina', qty: it.qty });
        break;
      }
    }
    persist(next);
    rewardToast.pushMany('Splice Market', ev);
    return true;
  },

  // ── Ichor Exchange (docs/MARKET.md §exchange) — the 30-min barter of Ichor DOWN into the
  //    grind currencies. Lots are priced from the reserve SNAPSHOT taken when the window
  //    first rolls (mid-window spends never re-price the board); the max-window rule
  //    mirrors the Splice Market, so clocks can't forge fresh lots. ──
  /** Roll the window record forward when a new 30-min window begins. Idempotent (UI tick). */
  pollIchorExchange(now = Date.now()): void {
    const save = store.get();
    const w = Math.max(exchangeWindow(now), save.ichorExchange.window);
    if (w === save.ichorExchange.window) return;
    persist({ ...save, ichorExchange: { window: w, reserve: save.ichor, bought: [] } });
  },
  /** The six lots + countdown for the UI — pure over the persisted snapshot. An un-polled
   *  fresh window previews at the live reserve (poll persists those same values). */
  ichorExchangeView(now = Date.now()): {
    offers: (ExchangeOffer & { traded: boolean; affordable: boolean })[];
    msToRefresh: number;
    reserve: number;
    ichor: number;
  } {
    const save = store.get();
    const rec = save.ichorExchange;
    const w = Math.max(exchangeWindow(now), rec.window);
    const fresh = w !== rec.window;
    const reserve = fresh ? save.ichor : rec.reserve;
    const bought = fresh ? [] : rec.bought;
    return {
      offers: rollExchange(w, reserve).map((o) => ({ ...o, traded: bought.includes(o.index), affordable: save.ichor >= o.cost })),
      msToRefresh: msToExchangeRefresh(now),
      reserve,
      ichor: save.ichor,
    };
  },
  /** Trade one lot: spend the Ichor, grant the currency, mark the slot. False (no mutation)
   *  when the lot is already traded this window or unaffordable. One persist. */
  buyIchorOffer(index: number, now = Date.now()): boolean {
    if (!guardOk('market.ichorOffer', String(index))) return false;
    meta.pollIchorExchange(now);
    const save = store.get();
    const rec = save.ichorExchange;
    if (rec.bought.includes(index)) return false;
    const offer = rollExchange(rec.window, rec.reserve).find((o) => o.index === index);
    if (!offer || save.ichor < offer.cost) return false;
    const name = offer.currency === 'genomeCores' ? 'Genome Cores' : offer.currency === 'geneEssence' ? 'Gene Essence' : 'Scrap';
    let next: SaveData = {
      ...save,
      ichor: save.ichor - offer.cost,
      ichorExchange: { ...rec, bought: [...rec.bought, index] },
      timeline: pushTimeline(save.timeline, '⇄', `Ichor Exchange — ${offer.cost} Ichor → ${offer.qty} ${name}`),
    };
    if (offer.currency === 'genomeCores') next = { ...next, shards: next.shards + offer.qty, lifetimeShards: next.lifetimeShards + offer.qty };
    else if (offer.currency === 'geneEssence') next = { ...next, geneEssence: next.geneEssence + offer.qty };
    else next = { ...next, mats: { ...next.mats, scrap: next.mats.scrap + offer.qty } };
    persist(next);
    rewardToast.pushMany('Ichor Exchange', [{ type: offer.currency, qty: offer.qty }]);
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

  // ── Mastery Evolution Tracks (docs/MASTERY.md §evolution track) ────────────────

  /** A unit's live claim state (fresh loop 1 when untouched). */
  masteryEvolutionState(subject: EvolutionSubject, unit: string): { claimedUpTo: number; prestige: number; xpAt: number } {
    return store.get().masteryEvolution[`${subject}:${unit}`] ?? { claimedUpTo: 0, prestige: 0, xpAt: 0 };
  },

  /** Claim EVERY reached-unclaimed node on the unit's current loop in one tap. Grants flow
   *  through their real lanes (shards bank on the unit, containers queue for the Vault), the
   *  receipt toasts once, and the celebration event carries the major count for audio. */
  claimMasteryEvolution(subject: EvolutionSubject, unit: string): number {
    if (!guardOk('mastery.claim', `${subject}:${unit}`)) return 0;
    const save = store.get();
    const key = `${subject}:${unit}`;
    const st = save.masteryEvolution[key] ?? { claimedUpTo: 0, prestige: 0, xpAt: 0 };
    const xp = subject === 'tower' ? save.towerMasteryXp[unit as TowerKind] ?? 0 : save.heroMasteryXp[unit as HeroKind] ?? 0;
    const trackLevel = trackLevelFromXp(xp - st.xpAt, st.prestige);
    const due = masteryEvolutionTrack(subject, unit, st.prestige).nodes
      .filter((n) => n.level <= trackLevel && n.level > st.claimedUpTo);
    if (due.length === 0) return 0;
    let next = save;
    for (const n of due) for (const g of n.grants) next = applyEvolutionGrant(next, subject, unit, g);
    next = { ...next, masteryEvolution: { ...next.masteryEvolution, [key]: { claimedUpTo: trackLevel, prestige: st.prestige, xpAt: st.xpAt } } };
    persist(next);
    const unitName = subject === 'tower' ? TOWER_DEFS[unit as TowerKind]?.name ?? unit : HERO_DEFS[unit as HeroKind]?.name ?? unit;
    const majors = due.filter((n) => n.major).length;
    rewardToast.pushMany(`Evolution Track — ${unitName}`, evolutionToastEvents(due.flatMap((n) => n.grants), unitName, subject));
    if (gameEvents.hasListeners('masteryEvolutionClaim')) gameEvents.emit('masteryEvolutionClaim', { subject, unit, nodes: due.length, majors });
    return due.length;
  },

  /** EVOLVE the organism (prestige): auto-claims anything outstanding, then re-arms the loop —
   *  mastery level NEVER decreases; the next loop's (upgraded, shard-free) pool begins at once. */
  prestigeMasteryEvolution(subject: EvolutionSubject, unit: string): boolean {
    if (!guardOk('mastery.prestige', `${subject}:${unit}`)) return false;
    meta.claimMasteryEvolution(subject, unit); // nothing earned is ever lost to an evolution
    const save = store.get();
    const key = `${subject}:${unit}`;
    const st = save.masteryEvolution[key] ?? { claimedUpTo: 0, prestige: 0, xpAt: 0 };
    const xp = subject === 'tower' ? save.towerMasteryXp[unit as TowerKind] ?? 0 : save.heroMasteryXp[unit as HeroKind] ?? 0;
    if (!canPrestigeFromXp(xp - st.xpAt, st.prestige)) return false;
    const unitName = subject === 'tower' ? TOWER_DEFS[unit as TowerKind]?.name ?? unit : HERO_DEFS[unit as HeroKind]?.name ?? unit;
    persist({
      ...save,
      // The new loop re-arms from THIS moment's XP watermark (docs/MASTERY.md §pacing) —
      // mastery level itself never moves; only the helix's meter re-zeros.
      masteryEvolution: { ...save.masteryEvolution, [key]: { claimedUpTo: 0, prestige: st.prestige + 1, xpAt: xp } },
      timeline: pushTimeline(save.timeline, '\u29c9', `${unitName} evolved — Mastery Prestige ${st.prestige + 2}`),
    });
    rewardToast.pushMany('Evolution Track', [{ type: 'evolutionNode', name: `${unitName} — Prestige ${st.prestige + 2}`, rarity: 'epic' }]);
    if (gameEvents.hasListeners('masteryEvolutionPrestige')) gameEvents.emit('masteryEvolutionPrestige', { subject, unit, prestige: st.prestige + 1 });
    return true;
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
    if (!guardOk('craft.equipment', uid)) return false;
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
    if (!guardOk('equipment.salvage', uid)) return false;
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

  // ── Auction House custody (docs/AUCTION-HOUSE.md §client) ────────────────────
  // The SERVER is the trade truth; these methods only move things across the save↔market
  // boundary. Ordering is server-first: the store calls the endpoint, and only a 200 moves
  // the local copy (auctionEscrowOut) — auctionReconcile self-heals the crash window by
  // removing anything the server shows actively listed that still exists locally.
  // (AuctionSellable is declared beside SaveData imports at the top of this file's types.)

  /** Everything the account could list right now, with per-item block reasons. The Sell tab
   *  renders this read-model verbatim; the server re-validates every fact independently. */
  auctionSellables(): AuctionSellable[] {
    const save = store.get();
    const out: AuctionSellable[] = [];
    const stampOf = (refKey: string): { season: number; source: string; bound: boolean } => {
      const s = itemProvenance(save.provenance, parseRefKey(refKey)!);
      return { season: s?.season ?? 0, source: s?.source ?? 'legacy', bound: s?.bound === true };
    };
    for (const item of save.equipment.inventory) {
      if (item.locked || item.favorite) continue; // protected gear never even offers itself
      const refKey = `eq:${item.uid}`;
      const p = stampOf(refKey);
      const blocks: ('bound' | 'equipped' | 'neverTrade')[] = [];
      if (p.bound) blocks.push('bound');
      if (this.isItemEquipped(item.uid)) blocks.push('equipped');
      out.push({
        refKey, cat: 'equipment', name: itemDef(item.defId)?.name ?? item.defId,
        familyKey: equipmentFamilyKey(item.defId, item.rarity), rarity: item.rarity,
        season: p.season, source: p.source, payload: { kind: 'equipment', item }, blocks,
      });
    }
    for (const id of save.genesDiscovered) {
      const def = cardRegistry.get(id);
      if (!def) continue;
      const fam = marketFamily(geneFamilyKey(id));
      if (!fam) continue;
      const refKey = `gene:${id}`;
      const p = stampOf(refKey);
      const blocks: ('bound' | 'equipped' | 'neverTrade')[] = [];
      if (fam.neverTrade) blocks.push('neverTrade');
      if (p.bound) blocks.push('bound');
      out.push({
        refKey, cat: 'geneCard', name: def.name, familyKey: fam.familyKey, rarity: def.rarity,
        season: p.season, source: p.source, payload: { kind: 'gene', id }, blocks,
      });
    }
    const cosmetic = (id: string, name: string): void => {
      const fam = marketFamily(cosmeticFamilyKey(id));
      if (!fam) return;
      const refKey = `cos:${id}`;
      const p = stampOf(refKey);
      const blocks: ('bound' | 'equipped' | 'neverTrade')[] = [];
      if (fam.neverTrade) blocks.push('neverTrade');
      if (p.bound) blocks.push('bound');
      out.push({
        refKey, cat: 'cosmetic', name, familyKey: fam.familyKey, rarity: fam.rarity,
        season: p.season, source: p.source, payload: { kind: 'cosmetic', id }, blocks,
      });
    };
    for (const id of save.wardrobe.owned) cosmetic(id, wardrobeItem(id)?.name ?? id);
    for (const id of save.cosmetics.owned) cosmetic(id, cosmeticById(id)?.name ?? id);
    // Tower Mulligan pieces (docs/MULLIGANS.md): the dex entry IS the ownership — the piece
    // trades at its sequenced rarity. A grafted piece must unslot first ('slotted'); a piece
    // bound into a reforge-LOCKED organism can never leave it, which reads as 'bound'.
    for (const [id, rar] of Object.entries(save.mulliganDex)) {
      const def = mulliganRegistry.get(id);
      if (!def) continue;
      const refKey = `mul:${id}`;
      const p = stampOf(refKey);
      const host = modifierHost(save.mulligans, id);
      const blocks: AuctionSellable['blocks'] = [];
      if (p.bound) blocks.push('bound');
      if (host) blocks.push(save.mulligans[host as TowerKind]?.locked ? 'bound' : 'slotted');
      out.push({
        refKey, cat: 'mulliganPiece', name: def.name, familyKey: mulliganFamilyKey(id, rar), rarity: rar,
        season: p.season, source: p.source, payload: { kind: 'mulligan', id, rarity: rar }, blocks,
      });
    }
    return out;
  },

  /** Remove a just-listed thing from the save (the server accepted the listing). Equipment
   *  instances leave the inventory; gene/cosmetic UNLOCKS leave the account (quantity is
   *  always 1 — selling your only copy removes access, the confirm dialog says so). */
  auctionEscrowOut(refKey: string): boolean {
    if (!guardOk('auction.list', refKey)) return false;
    const ref = parseRefKey(refKey);
    if (!ref) return false;
    const save = store.get();
    if (ref.cat === 'equipment') {
      const item = save.equipment.inventory.find((i) => i.uid === ref.id);
      if (!item || item.locked || item.favorite || this.isItemEquipped(ref.id)) return false;
      persist({ ...save, equipment: { ...save.equipment, inventory: save.equipment.inventory.filter((i) => i.uid !== ref.id) } });
      return true;
    }
    if (ref.cat === 'mulliganPiece') {
      // The physical gate is the SLOT: a grafted piece never leaves the account (unslot
      // first; a reforge-locked organism refuses forever — same rule the Sell tab shows).
      if (!save.mulliganDex[ref.id] || modifierHost(save.mulligans, ref.id)) return false;
      const dex = { ...save.mulliganDex };
      delete dex[ref.id];
      persist({ ...save, mulliganDex: dex });
      return true;
    }
    if (marketFamily(ref.cat === 'geneCard' ? geneFamilyKey(ref.id) : cosmeticFamilyKey(ref.id))?.neverTrade !== false) return false;
    if (ref.cat === 'geneCard') {
      if (!save.genesDiscovered.includes(ref.id)) return false;
      persist({ ...save, genesDiscovered: save.genesDiscovered.filter((id) => id !== ref.id) });
      return true;
    }
    if (save.wardrobe.owned.includes(ref.id)) {
      const equipped = Object.fromEntries(Object.entries(save.wardrobe.equipped).filter(([, v]) => v !== ref.id));
      persist({
        ...save,
        wardrobe: {
          ...save.wardrobe,
          owned: save.wardrobe.owned.filter((id) => id !== ref.id),
          favorites: save.wardrobe.favorites.filter((id) => id !== ref.id),
          equipped: equipped as typeof save.wardrobe.equipped,
        },
      });
      return true;
    }
    if (save.cosmetics.owned.includes(ref.id)) {
      const strip = <K extends string>(m: Partial<Record<K, string>>): Partial<Record<K, string>> =>
        Object.fromEntries(Object.entries(m).filter(([, v]) => v !== ref.id)) as Partial<Record<K, string>>;
      persist({
        ...save,
        cosmetics: { owned: save.cosmetics.owned.filter((id) => id !== ref.id), towers: strip(save.cosmetics.towers), heroes: strip(save.cosmetics.heroes) },
      });
      return true;
    }
    return false;
  },

  /** Materialize market deliveries (won purchases, returned cancellations/expiries) into the
   *  save. Payloads are the documented client-attested boundary — every shape is validated
   *  and unknown ones are skipped (never a crash, never a partial write). Returns what
   *  landed so the caller can raise placards. */
  auctionDeliver(rows: { refKey: string; payloadJson: string; season: number; transfers: number }[]): { refKey: string; cat: string; name: string; rarity: string }[] {
    if (!guardOk('auction.deliver')) return [];
    const delivered: { refKey: string; cat: string; name: string; rarity: string }[] = [];
    for (const row of rows) {
      const save = store.get();
      let payload: Record<string, unknown>;
      try { payload = JSON.parse(row.payloadJson) as Record<string, unknown>; } catch { continue; }
      const grant = (payload.grant ?? payload) as Record<string, unknown>;
      const stamp = (refKey: string): void => {
        const ref = parseRefKey(refKey);
        if (!ref) return;
        const s = stampAcquisition(store.get().provenance, ref, 'Auction House', Date.now(), Math.max(0, row.season));
        s.transfers = Math.max(s.transfers, Math.floor(row.transfers) || 0);
      };
      if (grant.kind === 'equipment' && grant.item && typeof grant.item === 'object') {
        const raw = grant.item as OwnedItem;
        const def = itemDef(String(raw.defId));
        if (!def || typeof raw.rarity !== 'string' || !Array.isArray(raw.affixes)) continue;
        const uid = typeof raw.uid === 'string' && raw.uid.length > 0 && !save.equipment.inventory.some((i) => i.uid === raw.uid)
          ? raw.uid // keep the instance identity — eq:<uid> is the provenance thread across owners
          : `a${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
        const item: OwnedItem = { ...raw, uid, source: 'Auction House', locked: false, favorite: false, seen: false };
        persist({ ...save, equipment: { ...save.equipment, inventory: [...save.equipment.inventory, item] } });
        stamp(`eq:${uid}`);
        delivered.push({ refKey: `eq:${uid}`, cat: 'equipment', name: def.name, rarity: item.rarity });
      } else if (grant.kind === 'equipment' && typeof grant.defId === 'string') {
        const def = itemDef(grant.defId);
        if (!def) continue;
        const rarity = typeof grant.rarity === 'string' ? grant.rarity : 'common';
        const item = rollItem(Math.random, def, rarity as OwnedItem['rarity'], undefined, 'Market Authority');
        persist({ ...save, equipment: { ...save.equipment, inventory: [...save.equipment.inventory, item] } });
        stamp(`eq:${item.uid}`);
        delivered.push({ refKey: `eq:${item.uid}`, cat: 'equipment', name: def.name, rarity });
      } else if (grant.kind === 'gene' && typeof grant.id === 'string') {
        const def = cardRegistry.get(grant.id);
        if (!def) continue;
        if (!save.genesDiscovered.includes(grant.id)) {
          persist({ ...save, genesDiscovered: [...save.genesDiscovered, grant.id] });
        }
        stamp(`gene:${grant.id}`);
        delivered.push({ refKey: `gene:${grant.id}`, cat: 'geneCard', name: def.name, rarity: def.rarity });
      } else if (grant.kind === 'mulligan' && typeof grant.id === 'string') {
        const def = mulliganRegistry.get(grant.id);
        if (!def) continue;
        const rarity = (typeof grant.rarity === 'string' && grant.rarity in MULLIGAN_RARITY ? grant.rarity : 'common') as MulliganRarity;
        if (save.mulliganDex[grant.id]) {
          // Already sequenced — the pillar's duplicate law applies (DUP_TISSUE), exactly as
          // if the piece had dropped from a container: dissolve, never a second copy.
          persist({ ...save, mulliganTissue: save.mulliganTissue + DUP_TISSUE[rarity] });
          delivered.push({ refKey: `mul:${grant.id}`, cat: 'mulliganTissue', name: `${def.name} — dissolved (+${DUP_TISSUE[rarity]} Tissue)`, rarity });
        } else {
          persist({ ...save, mulliganDex: { ...save.mulliganDex, [grant.id]: rarity } });
          stamp(`mul:${grant.id}`);
          delivered.push({ refKey: `mul:${grant.id}`, cat: 'mulliganPiece', name: def.name, rarity });
        }
      } else if (grant.kind === 'cosmetic' && typeof grant.id === 'string') {
        const wd = wardrobeItem(grant.id);
        if (wd) {
          // v53: the jackpot is NEVER wasted — a repeat roll delivers a tradable duplicate.
          const got = receiveCosmetic(save, grant.id, 'Daily Bio-Cache', Date.now());
          if (got) persist(got.next);
          delivered.push({ refKey: `cos:${grant.id}`, cat: 'cosmetic', name: wd.name, rarity: wd.rarity });
        } else {
          const classic = cosmeticById(grant.id);
          if (!classic) continue;
          if (!save.cosmetics.owned.includes(grant.id)) {
            persist({ ...save, cosmetics: { ...save.cosmetics, owned: [...save.cosmetics.owned, grant.id] } });
          }
          stamp(`cos:${grant.id}`);
          delivered.push({ refKey: `cos:${grant.id}`, cat: 'cosmetic', name: classic.name, rarity: classic.rarity });
        }
      }
    }
    return delivered;
  },

  /** Self-heal the crash window between a server-accepted listing and the local removal:
   *  anything the server shows ACTIVELY listed by us that still exists locally leaves now. */
  auctionReconcile(activeRefKeys: readonly string[]): number {
    let removed = 0;
    for (const refKey of activeRefKeys) {
      const ref = parseRefKey(refKey);
      if (!ref) continue;
      const save = store.get();
      const present = ref.cat === 'equipment'
        ? save.equipment.inventory.some((i) => i.uid === ref.id)
        : ref.cat === 'geneCard'
          ? save.genesDiscovered.includes(ref.id)
          : ref.cat === 'mulliganPiece'
            ? !!save.mulliganDex[ref.id]
            : save.wardrobe.owned.includes(ref.id) || save.cosmetics.owned.includes(ref.id);
      if (present && this.auctionEscrowOut(refKey)) removed++;
    }
    return removed;
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
    if (!guardOk('equipment.salvage', uids.join(','))) return { count: 0, refund: { mutagen: 0, scrap: 0, catalyst: 0 } };
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
    if (!isDebugEnabled()) return; // release isolation (docs/SECURITY.md §debug)
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
    if (!guardOk('save.import')) return { ok: false, error: 'Rate limited — try again in a moment.' };
    const result = parseImport(text);
    if (!result.ok) return result;
    if (tabIsStale()) return { ok: false, error: 'Another tab is managing this save. Reload before importing.' };
    const next = withGearDiscoveries(result.data);
    // Imports are explicitly paced by save.import, but must not use persist's best-effort
    // write coalescer: report success and notify subscribers only after the disk commit.
    if (!saveStore.importSave(next, store.get())) {
      return { ok: false, error: 'Could not save the import. Your current progress is unchanged. Export JSON to keep a separate copy.' };
    }
    publishSaveReplacement(next);
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
    if (!guardOk('save.restore', id) || tabIsStale()) return false;
    const data = saveStore.restoreBackup(id, store.get());
    if (!data) return false;
    publishSaveReplacement(data);
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
    if (!guardOk('tutorial.claim', id)) return null;
    const save = store.get();
    if (save.tutorial.rewarded.includes(id)) return null; // already paid — replays never duplicate
    const powerBefore = composePower(accountPowerParts(save)).score;
    const { cores: CORES, towerShards: TSHARD, heroShards: HSHARD, containerRarity, itemDefId } = TUTORIAL_GRANT;
    const hero = save.selectedHero;
    const towerShards = { ...save.towerShards };
    for (const k of towerShardPool(save)) towerShards[k] = (towerShards[k] ?? 0) + TSHARD; // a little of every gate-eligible tower currency
    const heroShards = { ...save.heroShards, [hero]: (save.heroShards[hero] ?? 0) + HSHARD };
    const container: PendingContainer = { kind: 'loot', rarity: containerRarity }; // the guaranteed Tutorial Bio-Container
    const item: OwnedItem = { uid: `tut-${id}-${Date.now().toString(36)}`, defId: itemDefId, rarity: 'rare', affixes: [] };
    persist(foldAccountXp({
      ...save,
      shards: save.shards + CORES,
      lifetimeShards: save.lifetimeShards + CORES,
      towerShards,
      heroShards,
      pendingContainers: [...save.pendingContainers, container],
      equipment: { ...save.equipment, inventory: [...save.equipment.inventory, item] },
      tutorial: { ...save.tutorial, rewarded: [...save.tutorial.rewarded, id] },
    }, ACCOUNT_XP.tutorialComplete).save); // onboarding completion is account history (docs/ACCOUNT-LEVEL.md)
    const unlocked = this.evaluateAchievements(); // grants tutorial_complete (completeTutorial ran first)
    return {
      cores: CORES, towerShards: TSHARD, heroShards: HSHARD, containerRarity, containers: 1,
      itemName: itemDef(itemDefId)?.name ?? 'Weapon', items: 1,
      achievement: unlocked.includes('tutorial_complete') ? 'Assimilation Protocol' : null,
      powerBefore, powerAfter: composePower(accountPowerParts(store.get())).score,
    };
  },
  /** THE graduation payout (docs/TUTORIAL.md §graduation) — called once on the Combat
   *  Tutorial's genuine completion. Pays every onboarding ledger still unclaimed (the tutorial's
   *  own + the one the Field Orientation used to pay) as ONE summary for ONE reveal. Each
   *  ledger stays independently idempotent: a save that already claimed either is paid only
   *  the remainder, and a replay pays nothing (null). */
  grantOnboardingRewards(): TutorialRewardSummary | null {
    let total: TutorialRewardSummary | null = null;
    for (const id of ONBOARDING_LEDGERS) {
      const r = this.grantTutorialRewards(id);
      if (r) total = total ? mergeTutorialRewards(total, r) : r;
    }
    return total;
  },
  /** What the graduation would still pay (the tutorial Skip confirm names it), or null when
   *  every onboarding ledger is already claimed — a replay's Skip forfeits nothing. */
  pendingOnboardingReward(): { cores: number; containers: number; containerRarity: string } | null {
    const unpaid = ONBOARDING_LEDGERS.filter((id) => !store.get().tutorial.rewarded.includes(id)).length;
    return unpaid === 0 ? null : { cores: TUTORIAL_GRANT.cores * unpaid, containers: unpaid, containerRarity: TUTORIAL_GRANT.containerRarity };
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
    {
      const ev: ToastEvents = [];
      if (cores > 0) ev.push({ type: 'genomeCores', qty: cores });
      if (essence > 0) ev.push({ type: 'geneEssence', qty: essence });
      rewardToast.pushMany('Tutorial Milestone', ev);
    }
    return { cores, essence };
  },

  // ── Help wiki + What's New (docs/HELP.md) ──────────────────────────────────
  /** The unlocked mechanics for the living Help wiki (locked ones stay hidden). */
  helpMechanics(): MechanicDef[] {
    return unlockedMechanics(store.get());
  },
  /** This beat's What's New cards (docs/PROGRESSION-GATING.md §announcements): the unannounced
   *  mechanics in priority order, capped at ANNOUNCE.perBeat per finished run — the rest wait for the
   *  next runs (they are already in the Help wiki). */
  whatsNew(): MechanicDef[] {
    const s = store.get();
    if (announceBeat.runs !== s.totalRuns) announceBeat = { runs: s.totalRuns, shown: 0 };
    return pacedAnnouncements(s, announceBeat.shown);
  },
  /** Archive announced mechanics into Help (so they never re-announce, but stay browsable). Cards the
   *  player was SHOWN this beat count against its budget; ids already seen don't. */
  archiveMechanics(ids: string[], opts: { beat?: boolean } = {}): void {
    const s = store.get();
    const fresh = ids.filter((id) => !s.help.seen.includes(id));
    // In-run FIELD NOTES archive with beat:false — they are taught mid-fight, not from the hub's budget.
    if (opts.beat !== false && announceBeat.runs === s.totalRuns) announceBeat = { runs: s.totalRuns, shown: announceBeat.shown + fresh.length };
    const seen = Array.from(new Set([...s.help.seen, ...ids]));
    persist({ ...s, help: { ...s.help, seen } });
  },
  // ── Account Level (docs/ACCOUNT-LEVEL.md) ─────────────────────────────────
  /** The live Account-Level view: level, bar progress, period ledgers, next milestone. */
  accountLevel(): { xp: number; level: number; into: number; need: number; nextMilestone: number; weekXp: number; monthXp: number } {
    const s = store.get();
    const p = levelProgress(s.accountXp.xp);
    return {
      xp: s.accountXp.xp,
      level: p.level,
      into: p.into,
      need: p.need,
      nextMilestone: nextMilestone(p.level + 1),
      weekXp: s.accountXp.week.key === weekKey(Date.now()) ? s.accountXp.week.xp : 0,
      monthXp: s.accountXp.month.key === monthKey(Date.now()) ? s.accountXp.month.xp : 0,
    };
  },
  /** Drain level-ups earned OUTSIDE a run settle (spends, molts …) — the menu toaster's feed. */
  drainAccountLevelUps(): AccountLevelUp[] {
    return pendingAccountLevelUps.splice(0);
  },

  // ── Genome Rank (docs/GENOME-RANK.md) ─────────────────────────────────────
  /** The plain-number snapshot the pure rating core consumes. Completion denominators are the
   *  LIVE content registries, so shipping new towers/cards/items automatically deepens the
   *  ladder. A future system integrates here (one field) + one GENOME_SOURCES row. */
  genomeSnapshot(): GenomeSnapshot {
    const save = store.get();
    const towers = TOWER_ORDER.length;
    const heroes = HERO_ORDER.length;
    const cards = cardRegistry.ids().length;
    const sumRec = (r: Record<string, number>): number => Object.values(r).reduce((a, n) => a + (n ?? 0), 0);
    const masteryLevels =
      TOWER_ORDER.reduce((a, k) => a + masteryLevel(save.towerMasteryXp[k] ?? 0), 0) +
      HERO_ORDER.reduce((a, k) => a + masteryLevel(save.heroMasteryXp[k] ?? 0), 0);
    const assembled = TOWER_ORDER.filter((k) => {
      const m = save.mulligans[k];
      return m && m.slots.length >= MULLIGAN_SLOTS && m.slots.every((s) => s !== null);
    }).length;
    // §adaptations (docs/MULLIGANS.md): fully class-synchronized organisms deepen the measure —
    // assembling is half the mulligan journey, completing adaptations is the other half.
    const adapted = TOWER_ORDER.filter((k) => adaptationOf(save.mulligans[k], TOWER_DEFS[k].combatClass).tier === 'full').length;
    const geneLevels = Object.keys(save.genes).reduce((a, id) => a + geneLevel(save.genes, id), 0);
    return {
      accountLevel: levelFromXp(save.accountXp.xp),
      campaignStage: highestCampaignStage(save),
      bestWave: save.bestWave,
      rushBestBoss: save.rushBestBoss,
      dailyCompletions: save.daily.completions,
      lifetimeLogins: save.login.lifetime,
      contractsHonoured: save.contracts.completed.length,
      idleLifetimeHours: save.idle.lifetimeHours,
      // v56 (docs/GENOME-RANK.md §peak): the Power axis reads the PEAK — a Molt's trough is a
      // cycle reset, not a demotion. max() keeps it exact before the first poll raises the peak.
      powerScore: Math.max(save.genomeRank.peakPower ?? 0, composePower(accountPowerParts(save)).score),
      molts: save.prestige.molts,
      masteryLevels,
      lifetimeIchor: save.lifetimeIchor,
      titles: save.unlockedTitles.length,
      towerStarRatio: sumRec(save.towerStars) / (towers * 10), // 10 = the evolution design target
      strainRatio: sumRec(save.stats.towerBestStrain) / (towers * 5),
      mulliganRatio: (assembled + adapted) / (towers * 2),
      nucleusRatio: (() => {
        let active = 0;
        for (let c = 0; c < NUCLEUS_CHAMBERS; c++) if (isChamberActive(save.nucleus, c)) active++;
        return (active + Math.min(NUCLEUS_CHAMBERS, (save.nucleus.adapted ?? []).length)) / (NUCLEUS_CHAMBERS * 2);
      })(),
      symbioteRatio: (() => {
        // Per hero: active slots (0..3) + the full-evolution crown (docs/HERO-SYMBIOTES.md).
        let sum = 0;
        for (const k of HERO_ORDER) {
          const r = resolveHeroSymbiote(save.heroSymbiotes?.[k]);
          sum += r.slotsActive + (r.evolved ? 1 : 0);
        }
        return sum / (heroes * (SYMBIOTE_SLOTS + 1));
      })(),
      heroRatio: (HERO_ORDER.filter((k) => isHeroUnlocked(save, k)).length / heroes + Math.min(1, sumRec(save.heroStars) / (heroes * 10))) / 2,
      gearRatio: gearDiscovered(save).size / ALL_ITEMS.length, // v56: permanent discoveries
      geneRatio: ((save.genesDiscovered ?? []).length / cards + Math.min(1, geneLevels / (cards * 3))) / 2,
      // Authored set only (docs/PROGRESSION-SYSTEMS.md §ladders): the generated ladders are an
      // endless trickle — counting them would dilute the ratio and shrink every rating.
      achievementRatio: authoredEarned(save.achievements ?? []) / AUTHORED_ACHIEVEMENTS.length,
      collectionCompletion: collectionView(collectionContextOf(save)).completion,
      cosmeticRatio: (save.cosmetics.owned.length / cosmeticRegistry.ids().length + save.wardrobe.owned.length / WARDROBE_ITEMS.length) / 2,
      passScore: Math.min(1, save.battlePass.permanents.length / PASS_PASSIVES.length)
        + 0.25 * Object.values(save.battlePass.completions).reduce((a, n) => a + n, 0),
    };
  },
  /** The live Genome Rank view — rating + the rank ladder position (docs/GENOME-RANK.md). */
  genomeRank(): GenomeRankView {
    return rankFromRating(genomeRating(this.genomeSnapshot()));
  },
  /** Per-source contribution bars (Profile breakdown). */
  genomeBreakdown(): GenomeContribution[] {
    return genomeBreakdown(this.genomeSnapshot());
  },
  /** The Genome Progress Advisor — the biggest realistic rating opportunities right now. */
  genomeAdvice(n = 4): GenomeAdvice[] {
    return genomeAdvice(this.genomeSnapshot(), n);
  },
  /** Detect rank crossings past the celebrated watermark; grant each crossed rank's one-time
   *  reward (cores/ichor/container + the rank title) and queue its promotion for the cinematic.
   *  Idempotent: the watermark persists WITH the rewards, so a crash can't double-pay. */
  pollGenomePromotions(): GenomePromotion[] {
    // v56 (docs/GENOME-RANK.md §peak): bank the live Power as the peak first — this poll runs at
    // every settle and on the menu drain, so the peak (the migration seed included) stays current.
    const peaked = withPeakPower(store.get(), store.get());
    if (peaked !== store.get()) persist(peaked);
    const save = store.get();
    const view = rankFromRating(genomeRating(this.genomeSnapshot()));
    const from = Math.max(1, save.genomeRank.celebrated);
    if (view.index <= from) return [];
    const fresh: GenomePromotion[] = [];
    let draft: SaveData = { ...save, genomeRank: { ...save.genomeRank, celebrated: view.index } };
    let timeline = draft.timeline;
    for (let i = from + 1; i <= view.index; i++) {
      const reward = genomeRankReward(i);
      fresh.push({ index: i, name: rankName(i), numeral: romanNumeral(i), reward });
      draft = {
        ...draft,
        shards: draft.shards + reward.cores,
        lifetimeShards: draft.lifetimeShards + reward.cores,
        ichor: draft.ichor + reward.ichor,
        lifetimeIchor: draft.lifetimeIchor + reward.ichor,
        pendingContainers: [
          ...draft.pendingContainers,
          ...reward.containers.map((chestId): PendingContainer => ({ kind: 'cache', chestId })),
        ],
        unlockedTitles: draft.unlockedTitles.includes(reward.titleId)
          ? draft.unlockedTitles
          : [...draft.unlockedTitles, reward.titleId],
      };
      timeline = pushTimeline(timeline, '⟁', `Genome Rank ${romanNumeral(i)} — ${rankName(i)}`);
    }
    persist({ ...draft, timeline });
    pendingGenomePromotions.push(...fresh);
    return fresh;
  },
  /** Drain queued promotions — the menu cinematic's feed (polls first, so menu grants count). */
  drainGenomePromotions(): GenomePromotion[] {
    this.pollGenomePromotions();
    return pendingGenomePromotions.splice(0);
  },

  // ── Progression Director (docs/PROGRESSION-GATING.md) ─────────────────────
  /** Latch any feature whose unlock condition newly holds (save.director.revealed[id] = the
   *  totalRuns count at reveal). A latched surface never re-seals — salvaging your last gear or
   *  opening your last container can't hide a screen again. Returns the newly latched ids
   *  (empty ⇒ nothing persisted). Veterans auto-latch everything their history already earns. */
  latchNewReveals(): string[] {
    const s = store.get();
    const fresh = unlatchedReveals(s);
    if (fresh.length === 0) return fresh;
    const revealed = { ...s.director.revealed };
    for (const id of fresh) revealed[id] = s.totalRuns;
    persist({ ...s, director: { ...s.director, revealed } });
    return fresh;
  },
  /** Count a hub-screen open (exposure ledger — powers ignored-feature detection). */
  noteNavVisit(key: string): void {
    const s = store.get();
    persist({ ...s, director: { ...s.director, visits: { ...s.director.visits, [key]: (s.director.visits[key] ?? 0) + 1 } } });
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
  /** THE FIRST LOOP (state/firstLoop.ts, docs/TUTORIAL.md §first-loop): record a finished coach beat
   *  and archive what it taught hands-on — its What's New cards would only repeat the lesson.
   *  Idempotent (the tutorial milestone ledger; no reward of its own). */
  completeCoachBeat(id: CoachBeatId): void {
    const s = store.get();
    const key = beatKey(id);
    if (!s.tutorial.milestones.includes(key)) persist({ ...s, tutorial: { ...s.tutorial, milestones: [...s.tutorial.milestones, key] } });
    const teaches = FIRST_LOOP_BY_ID.get(id)?.teaches ?? [];
    if (teaches.length > 0) this.archiveMechanics(teaches, { beat: false });
  },
  /** Skip the whole first loop: the coach stops for good and the full Command Center opens. */
  skipFirstLoop(): void {
    const s = store.get();
    const key = beatKey('skip');
    if (!s.tutorial.milestones.includes(key)) persist({ ...s, tutorial: { ...s.tutorial, milestones: [...s.tutorial.milestones, key] } });
  },
  shouldHudTour(): boolean {
    const s = store.get();
    return !s.help.hudTour && s.tutorial.completed.includes('combat');
  },
  /** Mark the HUD Tour done (Finish OR Skip — identical: the tour pays nothing of its own since
   *  the onboarding payout merged into the tutorial's ONE graduation reveal, so a Skip can never
   *  forfeit anything). The one exception is a LEGACY save that graduated under the old two-part
   *  promise (the 'combat' ledger paid, 'hudtour' still owed): it is paid that remainder here,
   *  either way the tour ends. Idempotent. Returns the reward summary, or null. */
  completeHudTour(): TutorialRewardSummary | null {
    const s = store.get();
    if (s.help.hudTour) return null;
    persist({ ...s, help: { ...s.help, hudTour: true } });
    const owed = s.tutorial.rewarded.includes('combat') && !s.tutorial.rewarded.includes('hudtour');
    const reward = owed ? this.grantTutorialRewards('hudtour') : null;
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

  // ── Patch notes (docs/CHANGELOG-PIPELINE.md) — the Update Briefing read-model. The release HISTORY
  //    is passed in by its one reader (ui/UpdateBriefing, a lazy chunk), so the boot bundle never
  //    carries every release ever shipped (docs/DEPLOYMENT.md §boot-budget). ──
  /** Releases the player hasn't seen (newest first), the latest, and the opt-out. */
  patchNotesView(RELEASES: readonly Release[]): { latest: Release | null; unseen: Release[]; optOut: boolean } {
    const s = store.get();
    const latest = RELEASES[0] ?? null;
    const seenIdx = s.patchNotes.seen === '' ? RELEASES.length : RELEASES.findIndex((r) => r.id === s.patchNotes.seen);
    const unseen = RELEASES.slice(0, seenIdx === -1 ? RELEASES.length : seenIdx).filter((r) => r.entries.length > 0);
    return { latest, unseen, optOut: s.patchNotes.optOut };
  },
  /** Mark everything up to the latest release as seen (Continue / open-full-notes). */
  markPatchNotesSeen(RELEASES: readonly Release[]): void {
    const s = store.get();
    const latest = RELEASES[0];
    if (!latest || s.patchNotes.seen === latest.id) return;
    persist({ ...s, patchNotes: { ...s.patchNotes, seen: latest.id } });
  },
  /** Permanent "never show again" (also marks the current release seen). Reversible in Settings. */
  setPatchNotesOptOut(optOut: boolean, RELEASES: readonly Release[]): void {
    const s = store.get();
    persist({ ...s, patchNotes: { seen: RELEASES[0]?.id ?? s.patchNotes.seen, optOut } });
  },

  reset(): void {
    if (!guardOk('account.reset')) return;
    resetSecurity();
    saveStore.backup();
    announceBeat = { runs: -1, shown: 0 };
    persist(defaultSave());
  },

  /** GUEST MODE entry (docs/ACCOUNTS.md §guest-mode) — chosen on the WelcomeGate (fresh profile)
   *  or the Commissioning SAFEGUARD step (a just-graduated life electing "keep nothing"). The
   *  LIVE save moves onto session-scoped storage — current progress rides along, playable now,
   *  gone with the browser — and the durable copy is purged so the tryout leaves no trace. */
  enterGuestSession(): void {
    enterGuestMode();
    saveStore.swapStorage(sessionStorageLike(), { purgePrevious: true });
    saveStore.save(store.get());
  },

  /** GUEST MODE conversion — the account flow succeeded (register or sign-in), so the tryout
   *  becomes a real life: the session save commits to durable storage and every normal account
   *  system (sync, cloud backup, purchases, standings) resumes from here. */
  commitGuestSession(): void {
    if (!guestModeActive()) return;
    exitGuestMode();
    saveStore.swapStorage(durableStorageLike(), { purgePrevious: true });
    saveStore.save(store.get());
    store.set(store.get()); // notify — account/store surfaces restyle out of guest mode
  },

  /** Developer Reset (docs/DEV-RESET.md) — wipe a specific save SCOPE (or everything). Always
   *  persists a valid, complete, current-version save (re-checksummed by SaveStore.save), so no
   *  orphaned references or version drift. 'everything' also clears backups + preference keys. */
  devReset(id: string): void {
    if (!isDebugEnabled()) return; // release isolation (docs/SECURITY.md §debug)
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
    if (!isDebugEnabled()) return; // release isolation (docs/SECURITY.md §debug)
    const save = store.get();
    persist({ ...save, shards: Math.max(0, save.shards + n) });
  },

  debugSetUpgrade(id: string, level: number): void {
    if (!isDebugEnabled()) return; // release isolation (docs/SECURITY.md §debug)
    const def = META_UPGRADES.find((u) => u.id === id);
    if (!def) return;
    const lvl = Math.max(0, Math.min(def.maxLevel, Math.floor(level)));
    persist({ ...store.get(), upgrades: { ...store.get().upgrades, [id]: lvl } });
  },

  debugMaxUpgrades(): void {
    if (!isDebugEnabled()) return; // release isolation (docs/SECURITY.md §debug)
    const upgrades: Record<string, number> = {};
    for (const u of META_UPGRADES) upgrades[u.id] = u.maxLevel;
    persist({ ...store.get(), upgrades });
  },

  debugAddTowerShards(n: number): void {
    if (!isDebugEnabled()) return; // release isolation (docs/SECURITY.md §debug)
    const save = store.get();
    const towerShards = { ...save.towerShards };
    for (const k of TOWER_ORDER) towerShards[k] = Math.max(0, (towerShards[k] ?? 0) + n);
    persist({ ...save, towerShards });
  },

  debugAddMasteryXp(n: number): void {
    if (!isDebugEnabled()) return; // release isolation (docs/SECURITY.md §debug)
    const save = store.get();
    const towerMasteryXp = { ...save.towerMasteryXp };
    for (const k of TOWER_ORDER) towerMasteryXp[k] = Math.max(0, (towerMasteryXp[k] ?? 0) + n);
    persist({ ...save, towerMasteryXp });
  },

  // ── Mulligan dev tools (docs/MULLIGANS.md §dev) — exercise the whole pipeline without loot. ──
  debugGrantEssence(n: number): void {
    if (!isDebugEnabled()) return; // release isolation (docs/SECURITY.md §debug)
    meta.grantGeneEssence(n);
  },
  /** Discover every modifier at Epic (headroom for upgrade/ascension testing). */
  debugDiscoverAllMulligans(): void {
    if (!isDebugEnabled()) return; // release isolation (docs/SECURITY.md §debug)
    for (const m of mulliganRegistry.all()) meta.discoverModifier(m.id, 'epic');
  },
  /** Discover all + fill every tower's three slots with a VARIED triple (a live organism per kind). */
  debugAutoAssembleMulligans(): void {
    if (!isDebugEnabled()) return; // release isolation (docs/SECURITY.md §debug)
    const ids = mulliganRegistry.ids();
    meta.debugDiscoverAllMulligans();
    TOWER_ORDER.forEach((k, i) => {
      for (let s = 0; s < 3; s++) meta.equipMulligan(k, s, ids[(i * 3 + s) % ids.length], 'epic');
    });
  },

  /** Set the highest cleared Campaign stage for a difficulty track — drives the Evolution Cap
   *  (lets the debug panel + tests exercise the cap gating without playing the ladder). */
  debugSetCampaignStage(stage: number, difficulty = 'standard'): void {
    if (!isDebugEnabled()) return; // release isolation (docs/SECURITY.md §debug)
    const save = store.get();
    persist({ ...save, campaign: { ...save.campaign, cleared: { ...save.campaign.cleared, [difficulty]: Math.max(0, Math.floor(stage)) } } });
  },

  /** Fully evolve every tower (★max) and unlock the Evolution Cap — to inspect the late-game
   *  visual evolution (lab portraits + battlefield) without the full grind. */
  debugMaxEvolution(): void {
    if (!isDebugEnabled()) return; // release isolation (docs/SECURITY.md §debug)
    const save = store.get();
    const towerStars = { ...save.towerStars };
    for (const k of TOWER_ORDER) towerStars[k] = STAR.maxTowerStars;
    persist({ ...save, towerStars, campaign: { ...save.campaign, cleared: { ...save.campaign.cleared, standard: 300 } } });
  },

  debugAddHeroShards(n: number): void {
    if (!isDebugEnabled()) return; // release isolation (docs/SECURITY.md §debug)
    const save = store.get();
    const heroShards = { ...save.heroShards };
    for (const k of HERO_ORDER) heroShards[k] = Math.max(0, (heroShards[k] ?? 0) + n);
    persist({ ...save, heroShards });
  },

  debugAddHeroMasteryXp(n: number): void {
    if (!isDebugEnabled()) return; // release isolation (docs/SECURITY.md §debug)
    const save = store.get();
    const heroMasteryXp = { ...save.heroMasteryXp };
    for (const k of HERO_ORDER) heroMasteryXp[k] = Math.max(0, (heroMasteryXp[k] ?? 0) + n);
    persist({ ...save, heroMasteryXp });
  },

  /** Own every hero — the debug shortcut for testing gated content. Claims the Shard-gated heroes
   *  (into heroUnlocked) AND satisfies the milestone gates: records enough distinct chassis for
   *  Vitriol and floors the depth record for Revenant (milestone ownership always derives). */
  debugUnlockHeroes(): void {
    if (!isDebugEnabled()) return; // release isolation (docs/SECURITY.md §debug)
    const save = store.get();
    const shardGated = HERO_ORDER.filter((k) => (HERO_DEFS[k].unlockShards ?? 0) > 0 && !HERO_DEFS[k].unlock);
    const heroUnlocked = [...new Set([...(save.heroUnlocked ?? []), ...shardGated])];
    const vitriolReq = HERO_DEFS.vitriol.unlock;
    const chassisNeed = vitriolReq?.kind === 'bossSlain' ? vitriolReq.count : 0;
    const bossesSlain = [...new Set([...save.bossesSlain, ...Object.keys(CHASSIS).slice(0, chassisNeed)])];
    const revenantReq = HERO_DEFS.revenant.unlock;
    const bestWave = revenantReq?.kind === 'infiniteDepth' ? Math.max(save.bestWave, revenantReq.wave) : save.bestWave;
    const knellReq = HERO_DEFS.knell.unlock;
    const molts = knellReq?.kind === 'molts' ? Math.max(save.prestige.molts, knellReq.count) : save.prestige.molts;
    persist({ ...save, heroUnlocked, bossesSlain, bestWave, prestige: { ...save.prestige, molts } });
  },

  /** Roll + grant a chest immediately (returns it so the panel can show a reveal). */
  debugOpenChest(chestId: string = RUN_CHEST): ChestResult {
    if (!isDebugEnabled()) return rollChest(CHESTS[RUN_CHEST], () => 0); // release isolation (inert roll, nothing granted)
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
    if (!isDebugEnabled()) return { points: 0, boxes: [], claimedThreshold: 0 } as unknown as RunOutcome['loot']; // release isolation
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

// ── Power-history wiring (docs/POWER-SCORE.md §history) ─────────────────────────────────────
// Browser-only, like the security layer's inert-in-Node rule — Node test runs stay free of
// stray timers/persists. Boot logs today's baseline; gains re-log on a short debounce so a
// claim-all chain lands as ONE ledger write.
if (typeof window !== 'undefined') {
  let logTimer: ReturnType<typeof setTimeout> | null = null;
  onPowerGain(() => {
    if (logTimer) clearTimeout(logTimer);
    logTimer = setTimeout(() => { logTimer = null; meta.notePowerSnapshot(); }, 600);
  });
  setTimeout(() => meta.notePowerSnapshot(), 0);
}
