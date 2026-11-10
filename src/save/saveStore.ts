// Browser-local persistence + save management (ARCHITECTURE.md §15). Versioned +
// checksummed blob, a migration pipeline, rolling backups, JSON export/import, and
// non-destructive recovery (a corrupt save falls back to the newest valid backup,
// then to defaults — never crashing, never silently overwriting good data).
// Storage is injectable so the core is testable headlessly; the browser uses
// localStorage. No DOM/file APIs here (those live in saveFile.ts).

import { ENEMY_KINDS, HERO_DEFS, HERO_ORDER, HERO_IDS, IDLE, TOWER_DEFS, TOWER_ORDER, heroRegistry, towerRegistry } from '../core/config';
import type { EnemyKind, HeroKind, LifetimeStats, TimelineEvent, TowerKind } from '../core/types';
import type { Loadout, OwnedItem } from '../core/equipment';
import { defaultLootQueue, sanitizeLootQueue } from '../core/lootQueue';
import type { LootQueueState } from '../core/lootQueue';
import type { PendingContainer } from '../state/lootbox';
import { defaultPrestige } from '../core/prestige';
import { sanitizeClassBonds } from '../core/classBonds';
import type { BondLevels } from '../core/classBonds';
import { cosmeticById } from '../core/cosmetics';
import { trophyById, TROPHY_SLOT_THRESHOLDS } from '../core/trophies';
import { vowById, MAX_VOWS } from '../core/vows';
import { THREAT_MAX, THREAT_MODES, clampThreat } from '../core/threat';
import type { ThreatMode } from '../core/threat';
import { hiveOrganById } from '../core/hiveOrgans';
import { expeditionById, EXPEDITION_SLOTS } from '../core/expeditions';
import { ALL_SECTORS, REGIONS, SECTOR_CAP, isValidInfestTarget } from '../core/infestation';
import type { PrestigeState } from '../core/prestige';
import { sanitizeProgress } from '../core/tutorial';
import type { TutorialProgress } from '../core/tutorial';
import { defaultCalib } from '../core/predict';
import type { PredictCalib } from '../core/predict';
import { adaptNode } from '../core/adaptation';
import { sanitizeGeneSave } from '../core/geneCards';
import { STARTER_GENES } from '../core/geneDiscovery';
import { cardRegistry } from '../core/cards';
import { sanitizeGeneLoadout, sanitizeGeneSlots } from '../core/geneLoadout';
import { activeLiveEvents, eventTrack } from '../core/liveEvents';
import type { GeneSave } from '../core/geneCards';
import { MULLIGAN_RARITY, MULLIGAN_SLOTS, emptyMulligan, levelCap, mulliganRegistry } from '../core/mulligan';
import { emptyNucleus, sanitizeNucleus } from '../core/nucleus';
import type { NucleusState } from '../core/nucleus';
import { sanitizeHeroSymbiotes } from '../core/heroSymbiote';
import type { HeroSymbioteState } from '../core/heroSymbiote';
import { reforgeModById } from '../core/mulliganReforge';
import type { MulliganRarity, MulliganSlot, MulliganState } from '../core/mulligan';
import { starterItems, wardrobeItem, wardrobeMilestone, WARDROBE_KINDS } from '../core/wardrobe';
import type { CosmeticInstance, WardrobeKind } from '../core/wardrobe';
import { BP, passPassive, seasonById } from '../core/battlePass';
import { missionById, questById } from '../core/quests';
import { ARENA, ARENA_HISTORY_CAP, ARENA_SETTLED_CAP, defaultArenaSave } from '../core/arena';
import type { ArenaSave } from '../core/arena';
import { reconcileProvenance, sanitizeProvenanceLedger } from '../core/itemIdentity';
import type { ProvenanceLedger } from '../core/itemIdentity';

export interface SaveData {
  shards: number;
  upgrades: Record<string, number>; // upgradeId -> level
  bestWave: number;
  // ── Boss Rush records (docs/BOSS-RUSH.md) — additive; 0 for older saves ──
  rushBestWave: number; // deepest Boss Rush wave reached (reward-qualify gate + prediction floor)
  rushBestBoss: number; // most bosses defeated in a SINGLE rush run (the lifetime-record band base)
  rushLegacyBestBoss: number; // v56 record epoch (docs/BOSS-RUSH.md §epoch): the pre-wall single-run record, archived — display only
  // Boss Rush stamina (docs/BOSS-RUSH.md §stamina) — lazily regenerated from updatedAt; the
  // day key records the last FREE daily entry (ISO date, UTC).
  rushStamina: { value: number; updatedAt: number; freeDay: string };
  // ── Premium Store ledger (docs/PREMIUM-STORE.md) — additive; a fresh ledger for older saves.
  //    purchases: lifetime count per offer id (enforces one-time packs); lastRotatingBuyKey: the UTC
  //    day the rotating slot was last bought (once/day); seenKey: last day the store was OPENED (the
  //    nav badge); totalSpentUsd: display-price bookkeeping for the support/economy views. ──
  //    v23 adds the VERIFIED-purchase ledger (docs/DEPLOYMENT.md §purchases): claimedReceipts —
  //    server receipt ids (Stripe session ids) whose grants were already applied, the client-side
  //    apply-once guard; pendingCheckout — an in-flight redirect checkout to resume/claim on boot
  //    (power loss / refresh / closed-tab recovery). Sandbox purchases never touch either. ──
  //    v42 adds the FLASH-sale ledger (docs/PREMIUM-STORE.md §flash): flash — per-offer first-sight
  //    timestamp (anchors the 48h countdown) + dismissed flag (a closed popup never re-pops);
  //    lastFlashShownAt — the popup cadence limiter (state/flashOffers.ts FLASH.popupCooldownMs). ──
  premium: {
    purchases: Record<string, number>;
    lastRotatingBuyKey: string;
    seenKey: string;
    totalSpentUsd: number;
    claimedReceipts: string[];
    pendingCheckout: { offerId: string; sessionId: string; startedAt: number } | null;
    flash: Record<string, { shownAt?: number; dismissed?: boolean }>;
    lastFlashShownAt: number;
  };
  // ── Field Research ledger (v24, docs/RESEARCH.md) — the optional rewarded-ad lane.
  //    day: the UTC key the daily counters belong to (stale day ⇒ counters read as 0 and are
  //    reset on the next claim); claims: per-reward claims today; pendingBoosts: one-run boost
  //    ids armed for the next FINISHED run; lifetime: privacy-friendly local analytics. ──
  research: {
    day: string;
    claims: Record<string, number>;
    pendingBoosts: string[];
    lifetime: { views: number; claims: Record<string, number> };
  };
  // ── Daily Run ledger (docs/DAILY-RUN.md) — additive; a fresh ledger for older saves.
  //    lastKey/lastWave: the most recent attempt day + its deepest wave; bestWave: lifetime record;
  //    completions: lifetime cleared dailies; streak: consecutive-day clears; rewardedKey: the day
  //    whose clear reward was already granted (the once-per-day gate). ──
  daily: { lastKey: string; lastWave: number; bestWave: number; completions: number; streak: number; rewardedKey: string; lastReplay: string | null }; // lastReplay: the recorded input log backing today's best (v25, docs/SECURITY-AUDIT.md R1)
  // ── Phenotypes (schema v26, docs/COSMETICS.md) — owned cosmetic ids + per-kind equips.
  //    PURE presentation: nothing here is read by the sim (golden-safe by construction). ──
  cosmetics: { owned: string[]; towers: Partial<Record<TowerKind, string>>; heroes: Partial<Record<HeroKind, string>> };
  // ── Champion Contracts (v26, docs/CONTRACTS.md) — weekly completion ledger ('w<week>:<id>')
  //    + Perfect Week chase (lifetime count; lastPerfect week-key stops double-pays). ──
  contracts: { completed: string[]; perfectWeeks: number; lastPerfect: string };
  // ── Weekly Directives (v33, docs/LIVEOPS.md §directives) — the cumulative objective ladder.
  //    `week` scopes progress to the current UTC week (reset when it rolls over); `progress`
  //    accumulates per directive id; `claimed` holds '<week>:<id>' + '<week>:__capstone'. ──
  directives: { week: string; progress: Record<string, number>; claimed: string[] };
  // ── Hive Construction (v36, docs/HIVE-CONSTRUCTION.md) — the built laboratory organs:
  //    organ id → built tier (1..def.tiers). Purely base-side (fixtures/QoL — never Power). ──
  hive: { built: Record<string, number> };
  // ── Daily Bio-Cache (v38, docs/DAILY-LOGIN.md) — the login-streak ledger. last: the UTC day
  //    key already claimed (once-per-day gate; a forged FUTURE key self-heals by waiting);
  //    streak: consecutive-day claims; best: streak watermark; lifetime: total claims ever
  //    (NEVER reset — collections/titles/Genome Rank ride it).
  //    v56 (docs/DAILY-LOGIN.md §income): incomeCores — the income-scaled Genome-Core line the
  //    LAST claim paid (frozen at claim so a post-claim reload shows what was granted). ──
  login: { last: string; streak: number; best: number; lifetime: number; incomeCores?: number };
  // ── Idle Harvest (v40, docs/IDLE-HARVEST.md) — the away-time accrual clock + evolution tree.
  //    lastCollect: epoch ms of the last collect (the accrual origin; MONOTONE — never rewound;
  //    a future stamp freezes accrual, bounded by IDLE.tamperFreezeMaxHours on load). nodes:
  //    infinite tree levels. The
  //    lifetime ledger (hours/harvests/value/bestHours/blooms) is NEVER reset — collections,
  //    achievements and Genome Rank ride it. Pure economy, never Power. ──
  idle: { lastCollect: number; nodes: Record<string, number>; lifetimeHours: number; harvests: number; lifetimeValue: number; bestHours: number; blooms: number };
  // ── Nemesis + trophies (v26, docs/NEMESIS.md; rack + vengeance v34). nemesis: the boss
  //    currently hunting this account (null = none). equippedTrophies: the mounted rack (up to
  //    trophySlots organs). vengeance: chassis you have AVENGED — the vengeance-trophy ledger
  //    AND the hunt's rap sheet (a real event, not a kill count). ──
  nemesis: { defId: string; slain: number } | null;
  equippedTrophies: string[];
  vengeance: string[];
  // ── Hero Expeditions (v26, docs/EXPEDITIONS.md) — active away-missions (absolute endsAt ms)
  //    + per-mission mastery ledger (v27: completions per defId → permanent reward bonus). ──
  expeditions: { active: { defId: string; hero: HeroKind; endsAt: number }[]; mastery: Record<string, number> };
  // ── Infestation map (v26, docs/INFESTATION.md) — sector conquest {level, updatedAt} + target. ──
  // ── Infestation / THE FRONT (v49, docs/INFESTATION.md §front) — the conquest ledger grew
  //    claims: `tierClaims` = highest tier index already claimed per sector (one-time spoils);
  //    `tributeWeeks` = last ISO week each region's tribute was collected; `defenses` =
  //    dayKey → sector defended that day (bounded ring); `lastIncursionDay` = the newest
  //    dayKey whose incursion was resolved. All additive ⇒ pre-v49 saves default empty. ──
  infestation: {
    target: string | null;
    sectors: Record<string, { level: number; updatedAt: number }>;
    tierClaims: Record<string, number>;
    tributeWeeks: Record<string, string>;
    defenses: Record<string, string>;
    lastIncursionDay: string;
  };
  // ── Patch notes (v28, docs/CHANGELOG-PIPELINE.md) — last release id seen (drives the
  //    Update Briefing) + a permanent opt-out. ──
  patchNotes: { seen: string; optOut: boolean };
  totalRuns: number;
  lifetimeShards: number;
  cardsSeen: number;
  // ── Tower progression (per kind) — added in schema v2 ──
  towerShards: Record<TowerKind, number>; // shard currency, earned from chests
  towerStars: Record<TowerKind, number>; // star upgrade level (0 = base)
  towerPrime: Record<TowerKind, number>; // PRIME level past max Stars (v39, docs/PRIME-STRAINS.md) — 0 = none
  towerForks: Record<TowerKind, Record<string, string>>; // per-tower star-fork picks (star → optionId)
  towerMasteryXp: Record<TowerKind, number>; // lifetime mastery XP (grows forever)
  towerKills: Record<TowerKind, number>; // lifetime kills per tower (schema v9) — Tower Lab
  heroShards: Record<string, number>; // per-hero shards (earned from chests)
  // ── Hero progression + roster (per kind) — added in schema v3 ──
  heroStars: Record<HeroKind, number>; // hero star level (0 = base)
  heroPrime: Record<HeroKind, number>; // PRIME level past max Stars (v39, docs/PRIME-STRAINS.md) — 0 = none
  heroForks: Record<HeroKind, Record<string, string>>; // per-hero ability-fork picks (star → optionId); mirrors towerForks
  heroMasteryXp: Record<HeroKind, number>; // lifetime hero mastery XP (grows forever)
  selectedHero: HeroKind; // slot-1 hero (back-compat mirror of heroLoadout[0]); see meta.setSelectedHero
  favoriteTower: TowerKind; // the Biomorph Conveyor's always-available FAVORITE (docs/STRAIN.md §conveyor)
  // ── Hero Slot roster (HEROES.md) — the heroes fielded per slot; index i = slot i+1. Length grows
  //    with unlocked slots (heroSlotsUnlocked). Clamped to unlocked slots + distinct kinds at run
  //    start. Migrated from selectedHero for pre-slot saves. ──
  heroLoadout: HeroKind[];
  // ── Hero Collection unlock (schema v14). Which heroes the account OWNS. Starters (HeroDef with no
  //    unlockShards, e.g. Ravager) are always present; locked heroes are claimed with Hero Shards.
  //    Selection/fielding is gated to this set. Pre-v14 saves grandfather in every hero the player
  //    already engaged with (stars / usage / loadout / selected) so no access is stripped. ──
  heroUnlocked: HeroKind[];
  towerUnlocked: TowerKind[]; // owned tower kinds (docs/TOWERS.md §expansion) — starters + shard-claimed
  // ── Adaptation (schema v15, docs/PROGRESSION-REDESIGN §2). Chosen adaptation-node ids per unit,
  //    keyed `tower:<kind>` / `hero:<kind>`. Antigen Points (one per mastery Rank) are spent here.
  //    Empty for a fresh unit ⇒ zero run effects ⇒ golden-safe. Additive; pre-v15 saves default {}. ──
  adaptation: Record<string, string[]>;
  // ── Per-hero lifetime ownership stats (schema v9) — drive the Hero Lab detail page ──
  heroKills: Record<HeroKind, number>; // lifetime kills BY each hero (accrued for the fielded hero)
  heroFavEquip: Record<HeroKind, Record<string, number>>; // per-hero equip-usage counts (defId → runs); argmax = favorite
  // ── Lifetime statistics + achievements — added in schema v3 ──
  stats: LifetimeStats;
  achievements: string[]; // unlocked achievement ids
  // ── Hero equipment (schema v3; PER-HERO loadouts as of v12) ──
  // Each hero keeps its OWN weapon/armor/relic (HEROES.md hero slots). A uid is a single physical
  // item ⇒ it lives in at most one hero's loadout. Absent hero key ⇒ that hero has no gear equipped.
  // v56 `discovered` (docs/EQUIPMENT.md §codex): every equipment def id EVER owned — the permanent
  // Gear Codex credit (Collection %, Genome Rank, the NEW badge). Additive and NEVER shrinks:
  // salvaging the last copy keeps the discovery. Folded from the inventory at every persist
  // (meta) and on load (backfill), so readers may treat it as ⊇ the inventory's defs.
  equipment: { inventory: OwnedItem[]; loadouts: Partial<Record<HeroKind, Loadout>>; discovered?: string[] };
  mats: { mutagen: number; scrap: number; catalyst: number }; // crafting / reroll currencies
  matPity: number; // containers opened since the last RARE material (catalyst) — the pity counter (v16)
  // ── Undo-Salvage buffer (v17): the single most-recently salvaged item + the materials it refunded,
  //    so an accidental dismantle is recoverable until the next salvage (or a run) overwrites it. ──
  lastSalvage: { item: OwnedItem; refund: { mutagen: number; scrap: number; catalyst: number } } | null;
  // ── Loot queue (schema v4) — pre-determined boxes + pity, filled by run progress ──
  lootQueue: LootQueueState;
  // ── Pending bio-containers (schema v8) — completed-but-UNOPENED containers (loot boxes +
  //    the run-end cache). Runs bank them here; the player cracks them in the Genetic Vault. ──
  pendingContainers: PendingContainer[];
  // ── Tower star-fork picks (schema v5) — per-run evolution choices, persisted ──
  // (towerForks is declared above with the other tower-progression records.)
  // ── Mastery identity (schema v6) — earned titles/lore + the worn title ──
  unlockedTitles: string[]; // reward ids of unlocked mastery titles
  equippedTitle: string | null; // the title shown on the player profile (null = none)
  unlockedLore: string[]; // reward ids of unlocked lore (codex)
  // ── Collection: framework-boss chassis archetypes ever slain (drives the Bestiary's boss
  //    codex). Recorded from the bossKilled event; additive (withDefaults fills [] for old saves). ──
  bossesSlain: string[];
  // ── Mega Boss lifetime ledger (docs/MEGA-BOSS.md) — the megaBosses collection category +
  //    achievements read this. Recorded from megaKilled/megaWeakPointDown events; additive
  //    (withDefaults zero-fills for old saves; sanitizer coerces junk). ──
  megaProgress: MegaProgress;
  // ── Prestige (schema v7) — MOLT: Ascendant Cells + the permanent P-bucket multiplier ──
  prestige: PrestigeState;
  // ── Campaign progression (schema v10) — highest stage CLEARED per difficulty id (0 = none).
  //    Stage N is unlocked when N ≤ cleared[diff] + 1; cleared stages are replayable. Per-difficulty
  //    so new DifficultyDef variants get their own track for free (CAMPAIGN.md §7). ──
  campaign: {
    cleared: Record<string, number>;
    // Fastest clear per stage per difficulty (schema v21) — seconds; only WINS record.
    bestTime: Record<string, Record<string, number>>;
  };
  // ── Tutorial (schema v12) — permanent completion + resumable progress. Additive; withDefaults
  //    fills the default for older saves. Cleared on Account Reset (docs/TUTORIAL.md). ──
  tutorial: TutorialSave;
  // ── Progress prediction (docs/PREDICTION.md) — self-calibrating per-mode estimators. Additive;
  //    withDefaults fills defaults for older saves. Never affects the sim (golden-safe). ──
  prediction: { campaign: PredictCalib; infinite: PredictCalib; bossRush: PredictCalib };
  // ── Help / What's New (docs/HELP.md): `seen` = mechanic ids already announced (archived into the
  //    Help wiki); `primed` guards a one-time seed so existing saves don't flood on first load. Also
  //    tracks whether the first-launch HUD Tour has run. Additive; golden-safe. ──
  help: { seen: string[]; primed: boolean; hudTour: boolean };
  // ── Progression Director (docs/PROGRESSION-GATING.md): `revealed` latches each feature id to
  //    the totalRuns count at its reveal (a revealed surface never re-seals + pacing analytics);
  //    `visits` counts hub-screen opens (exposure / ignored-feature detection). Additive;
  //    withDefaults fills empties for older saves; never read by the sim (golden-safe). ──
  director: { revealed: Record<string, number>; visits: Record<string, number> };
  // ── Account Level (docs/ACCOUNT-LEVEL.md): lifetime Account XP (level is DERIVED — one source
  //    of truth) + rolling week/month XP ledgers (leaderboard feed). Additive; golden-safe. ──
  accountXp: { xp: number; week: { key: string; xp: number }; month: { key: string; xp: number } };
  // ── Genome Rank (docs/GENOME-RANK.md): the rating + rank are always DERIVED from the whole
  //    save (meta.genomeRank); the ONLY stored piece is the ceremony/reward watermark — the
  //    highest rank index already celebrated and paid. Additive; golden-safe.
  //    v56 `peakPower`: the highest Power Score ever observed — the rating's Power axis reads it
  //    (a Molt's Power trough never demotes the named rank). Monotone; migration seeds it from
  //    the live score on first read (meta raises it to max(peak, live) at every poll). ──
  genomeRank: { celebrated: number; peakPower?: number };
  // ── Gene Cards — permanent progression (schema v18, docs/GENE-EVOLUTION.md). Sparse per-card state
  //    (level / rarity-tier / ascension / skin), keyed by the card's permanent id. Absent id ⇒ base
  //    (level 0); ownership stays in stats.uniqueCards so this map only holds upgraded cards. Additive:
  //    withDefaults fills {} for pre-v18 saves, sanitizeGeneSave drops unknown/renamed ids. ──
  genes: GeneSave;
  // ── Starting Gene Loadout (v19) — equipped card ids that auto-activate at run boot. `geneSlots`
  //    = unlocked slot count (1..5; slot 1 free, 2–5 bought with Campaign progress + Genome Cores). ──
  geneSlots: number;
  geneLoadout: (string | null)[];
  // ── Gene Essence (schema v18) — permanent Gene Card upgrade currency. Earned mainly by converting
  //    duplicate max-Star shards (meta.openContainer) + rare container drops. Additive ⇒ 0 for old saves. ──
  geneEssence: number;
  // ── Localized wallets (schema v48, docs/ECONOMY.md §localized) — one specialized currency per
  //    system. `hiveMaterials` (Chitin) grows Hive-Production organs (previously Genome Cores);
  //    `mulliganTissue` upgrades/ascends tower Mulligan grafts (previously Gene Essence — the v26
  //    unification is deliberately re-split; localization is the design, not wallet sprawl).
  //    Absent fields SEED from existing investment on load (withDefaults), so no migrating
  //    build-in-progress stalls; fresh accounts stay 0 (golden-safe). ──
  hiveMaterials: number;
  mulliganTissue: number;
  // ── Bio-Spores (v48, docs/BOSS-RUSH.md §roulette) — banked Bio-Roulette ammunition. Earned from
  //    Boss Rush, first-kill boss chassis (any mode), quest finales and Battle Pass milestones;
  //    consumed by a wheel session (state/meta grantRouletteRewards). Additive ⇒ 0 for old saves. ──
  bioSpores: number;
  // ── Live Events (v49, docs/LIVE-EVENTS.md §4/§6) — the per-window event ledgers, keyed
  //    `eventId:window` so rotation retires state structurally: `tokens` (the event currency
  //    banks, capped by each def), `claimed` (track milestone `at` values already paid),
  //    `shopBought` (per-row purchase counts against finite stock; daily/weekly limit rows
  //    count under composite `rowId@period` keys — v52, docs/LIVE-EVENTS.md §shops). The
  //    sanitizer prunes any key not currently active (stale windows evaporate = the
  //    anti-inflation contract). The ONE exception is `lifetimeBought` (`eventId:rowId`,
  //    v52): never pruned, so a signature exclusive stays sold when its event returns.
  //    Absent ⇒ empty ledgers (additive, golden-safe). ──
  liveEvents: { tokens: Record<string, number>; claimed: Record<string, number[]>; shopBought: Record<string, Record<string, number>>; progress: Record<string, Record<string, number>>; lifetimeBought: Record<string, number> };
  // ── Metabolism (schema v51, docs/METABOLISM.md) — the recursive-progression ledger:
  //    four chokepoint counters + per-track claimed tiers. Everything else DERIVES live. ──
  metabolism: MetabolismSave;
  // ── THREAT LADDER (schema v55, docs/THREAT.md) — the best CLEARED Threat level per mode
  //    (0 = none above the baseline; THREAT_MAX caps it). Feeds the picker's ceiling, the
  //    automation gate and cosmetic milestones — never Power. ──
  threat: Record<ThreatMode, number>;
  // ── INCOME LEDGER (schema v56, docs/ONE-MORE-RUN.md §eta) — what ONE settled run earns, per
  //    meter (state/income.ts INCOME_METERS: cores, stage, peak-Power growth, specimens, per-unit
  //    Strain Samples / Apex Genome wealth, lifetime ledgers …), as a per-run moving average.
  //    `last` = each meter's value at the previous settle (deltas are taken settle→settle, so
  //    containers opened between runs count); `rate` = the moving average; `runs` = settles
  //    observed. Read-only estimate — goal ETAs and the Bio-Cache income line; never Power. ──
  income: IncomeSave;
  // ── Gene Card DISCOVERY (v46, docs/CARDS.md §discovery) — the Archive's membership set:
  //    card ids the account has discovered (starters + Bio-Container finds). Drafting and
  //    permanent upgrades key on membership. Migration seeds STARTER_GENES ∪ every card the
  //    account has already touched (stats.uniqueCards + leveled genes) — veterans lose nothing. ──
  genesDiscovered: string[];
  // ── Player Profile (schema v22, docs/PROFILE.md) — account identity + the milestone timeline.
  //    `createdAt` stays 0 in defaultSave (determinism) and is stamped by the FIRST settle.
  //    `timeline` is newest-LAST and capped (TIMELINE_CAP) at every push. Additive migrations. ──
  createdAt: number;
  profileName: string;
  profileFrame: string; // unlockable banner frame id (state/profile PROFILE_FRAMES)
  profileSigil: string | null; // commissioning sigil id (core/identity SIGILS; null = none)
  timeline: TimelineEvent[];
  // ── Power history (v43, docs/POWER-SCORE.md §history) — one entry per UTC day (last
  //    observed score that day), bounded to the newest 90. Feeds the Growth panel's weekly
  //    delta + the Profile trend sparkline. Empty ⇒ no trend yet (additive). ──
  powerLog: { day: string; score: number }[];
  // ── Adaptation (v22, docs/ADAPTATION.md) — Antigen granted by legendary+ containers.
  //    Consumed as a CAPPED budget source (core/adaptation ANTIGEN.containerCap). ──
  antigen: number;
  // ── Splice Market (docs/MARKET.md) — the Ichor premium currency + the market's window
  //    record. `market.window` is the MAX stock window ever observed (clock-tamper rule);
  //    `bought` holds THAT window's consumed slot ids; `seenWindow` clears the nav badge;
  //    `starter` marks the one-time 30-Ichor vial. Additive: pre-market saves default all. ──
  ichor: number;
  lifetimeIchor: number;
  market: { window: number; bought: string[]; seenWindow: number; starter: boolean };
  // ── Ichor Exchange (v30, docs/MARKET.md §exchange) — the 30-min barter window: max window
  //    observed (clock-tamper rule), the Ichor reserve SNAPSHOT the lots were priced from,
  //    and the slot indices already traded this window. ──
  ichorExchange: { window: number; reserve: number; bought: number[] };
  // ── Mulligan system (schema v26, docs/MULLIGANS.md) — the per-tower biomechanical organism. Each
  //    tower kind permanently owns ONE Mulligan (three modifier slots + generated visual/anim seeds);
  //    the organism does NOTHING until all three slots are filled, so a fresh account is byte-identical
  //    (golden-safe). `mulliganDex` is the discovered-modifier collection (id → best rarity found), the
  //    equip gate + Collections/Achievements source. Modifier upgrades spend `mulliganTissue`
  //    (v48 — localized out of the v26 geneEssence unification; the retired `geneOverflow` wallet
  //    still folds into geneEssence on load). All additive: pre-v26 saves default empty. ──
  mulligans: Record<TowerKind, MulliganState>;
  mulliganDex: Record<string, MulliganRarity>; // modifier id → highest rarity discovered (equip ceiling)
  // ── Nucleus Mulligans (schema v37, docs/NUCLEUS.md) — the Hive Nucleus's OWN organ system: up
  //    to three CHAMBERS, each a three-organ Mulligan triple. `grown` is the permanent organ dex
  //    (Gene Essence sink); chambers reference grown organs (exclusive). Chamber 1 is born open;
  //    2 and 3 open through NUCLEUS_GATES. Everything empty ⇒ resolveNucleus is identity
  //    (golden-safe). All additive: pre-v37 saves default to emptyNucleus(). ──
  nucleus: NucleusState;
  // ── Hero Symbiotes (schema v41, docs/HERO-SYMBIOTES.md) — every champion's OWN grafted-organism
  //    system: up to three SLOTS per hero, each a three-organ Mulligan triple. Organs are grafted
  //    per host with Gene Essence (`grown` is that hero's permanent dex); slot I is born open,
  //    II/III open through per-hero HERO_SYMBIOTE_GATES trials + Ichor. Sparse map — a hero appears
  //    only once touched; everything empty ⇒ resolveHeroSymbiote is identity (golden-safe).
  //    All additive: pre-v41 saves default to {}. ──
  heroSymbiotes: Partial<Record<HeroKind, HeroSymbioteState>>;
  // ── Class Bonds (v58, docs/CLASS-BONDS.md) — the account's bond LEVEL per combat class (0..10,
  //    bought with Genome Cores on the Class Bonds screen). Sparse: a class appears once levelled.
  //    Levels scale the set bonus a run's fielded classes wake; additive — pre-v58 saves ⇒ {}. ──
  classBonds: BondLevels;
  // ── Mastery Evolution Tracks (v44, docs/MASTERY.md §evolution track) — per-unit CLAIM state
  //    for the procedural reward tracks (core/masteryEvolution.ts): claimedUpTo = highest track
  //    level fully claimed THIS loop, prestige = completed loops, xpAt (v45) = the unit's
  //    lifetime mastery-XP watermark when the current loop re-armed (0 for the debut loop —
  //    loops past the first are XP-metered on it; docs/MASTERY.md §pacing). Sparse map keyed
  //    'tower:<kind>' / 'hero:<kind>'; {} ⇒ nothing claimed. Purely additive — migration grants
  //    nothing retroactively (a veteran's first visit is a celebration, not a side-effect).
  masteryEvolution: Record<string, { claimedUpTo: number; prestige: number; xpAt: number }>;
  // ── Wardrobe (v31, docs/COSMETICS.md §wardrobe) — account cosmetics beyond unit Phenotypes:
  //    `owned` is the CLAIMED (account-bound) set (starter rows seeded on load) — the ONLY set
  //    equip gates, collection codices, and the claim-bonus fold read; ONE equipped id per kind
  //    ({} = classic look everywhere ⇒ golden-safe), favorites + seen (NEW badges), claimed
  //    cosmetic milestones, and the unlock-ceremony queue (persisted across reload).
  //    v53 (§claiming): `inventory` holds UNCLAIMED cosmetic instances (tradable, no bonus,
  //    not equippable — the Auction House's stock; uid-stamped in the provenance ledger) and
  //    `granted` records every id EVER delivered (the once-per-source gate for auto lanes,
  //    the boutique, and direct grants — duplicates only flow from repeatable reward tracks). ──
  wardrobe: {
    owned: string[];
    inventory: CosmeticInstance[];
    granted: string[];
    equipped: Partial<Record<WardrobeKind, string>>;
    favorites: string[];
    seen: string[];
    milestones: string[];
    pendingReveal: string[];
  };
  // ── Battle Pass (v31, docs/BATTLEPASS.md) — the rotating dual-track season. `window` is the
  //    MAX rotation window observed (clock-tamper rule); xp/claims/premium are THIS window's;
  //    `permanents` is FOREVER (cross-season, never re-granted); `completions` counts full
  //    100-level clears per season id; `stacks` is the infinite completion bonus. ──
  battlePass: {
    window: number;
    xp: number;
    premium: boolean;
    claimedFree: number[];
    claimedPremium: number[];
    adDay: string; // UTC day key of the last rewarded-ad level advance
    adUsed: number; // ad advances consumed on adDay
    permanents: string[];
    completions: Record<string, number>;
    stacks: number;
  };
  // ── Quests & Missions (v32, docs/QUESTS.md). The weekly lane is windowed: `window` is the MAX
  //    rotation window observed (clock-tamper rule); progress/claims are THIS window's and NEVER
  //    carry over (rollover auto-claims earned rewards, then resets). The main questline is
  //    permanent + sequential (`completions` gates the next chapter). `once` is the FOREVER
  //    ledger of granted one-time finale unlocks ('cutscene:<questId>' / 'cosmetic:<questId>' —
  //    repeats substitute currency); `missionsDone`/`questCompletions` are lifetime codex
  //    ledgers (collections). ──
  quests: {
    weekly: { window: number; progress: Record<string, number>; claimed: string[]; completionClaimed: boolean };
    main: { progress: Record<string, number>; claimed: string[]; completions: string[] };
    once: string[];
    missionsDone: string[];
    questCompletions: Record<string, number>;
  };
  // ── Arena (v47, docs/ARENA.md) — the live-PvP season record: rating/placements/streak per
  //    30-day season, the wins-only Arena Pass ledger, the FOREVER exclusives ledger, closed-
  //    season history, and the exactly-once settled-match ring. Server-authoritative when
  //    online (functions/api/arena/report.ts); the same shared validators run locally for
  //    AI/offline matches. A fresh record (rating 0, season 0) is inert ⇒ golden-safe. ──
  arena: ArenaSave;
  // ── Item provenance ledger (v47, docs/TRADING-PREP.md) — the Auction House's identity
  //    spine: one stamp per owned tradable (equipment uid / cosmetic id / gene card id):
  //    source, acquisition time, arena season, soul-bound flag, ownership history. SELF-HEALS
  //    on load (reconcileProvenance): owned-but-unstamped ⇒ `legacy`; stamps for dead
  //    equipment uids prune. Pure metadata — never read by the sim (golden-safe). ──
  provenance: ProvenanceLedger;
}

/** Permanent tutorial state: which tutorials are fully done, which have paid out their one-time
 *  completion rewards (idempotent on replay), + any resumable in-progress run. */
/** Lifetime Mega Boss ledger (docs/MEGA-BOSS.md §collection). Every field additive/idempotent. */
export interface MegaProgress {
  slain: string[]; // mega def ids ever defeated
  perfect: string[]; // defs ever defeated with ZERO Nucleus integrity lost
  speed: string[]; // defs ever defeated faster than the expected kill time
  kills: number; // lifetime mega kills (variants included)
  weakPoints: number; // lifetime weak points destroyed
  wpKinds: string[]; // DISTINCT weak point kinds ever destroyed
  interrupts: number; // lifetime telegraph interrupts (perfect interrupts)
  abilitiesSurvived: number; // lifetime mega abilities that completed against the player
  fastestSec: Record<string, number>; // fastest kill per def id (seconds)
}

export function defaultMegaProgress(): MegaProgress {
  return { slain: [], perfect: [], speed: [], kills: 0, weakPoints: 0, wpKinds: [], interrupts: 0, abilitiesSurvived: 0, fastestSec: {} };
}

/** v46 Gene Discovery set (docs/CARDS.md §discovery): known card ids, deduped. A PRE-v46
 *  save (field missing) seeds STARTER_GENES ∪ every card the account already TOUCHED
 *  (stats.uniqueCards + leveled/transcended genes) — veterans lose nothing. Starters are
 *  always unioned back in, so the teaching set self-heals on every load. */
function sanitizeGenesDiscovered(data: Partial<SaveData>): string[] {
  const known = new Set(cardRegistry.active().map((c) => c.id));
  const out = new Set<string>();
  for (const id of STARTER_GENES) if (known.has(id)) out.add(id);
  const raw = (data as { genesDiscovered?: unknown }).genesDiscovered;
  if (Array.isArray(raw)) {
    for (const id of raw) if (typeof id === 'string' && known.has(id)) out.add(id);
  }
  // Touched-card union runs UNCONDITIONALLY (not just when the field is missing): withDefaults
  // fills absent fields before sanitize, so "missing" is unobservable here — and the union is
  // safe by invariant (drafts are pool-restricted to discovered ids going forward, so
  // uniqueCards/levels can only name cards the account legitimately used pre-v46).
  const unique = (data.stats as { uniqueCards?: unknown } | undefined)?.uniqueCards;
  if (Array.isArray(unique)) for (const id of unique) if (typeof id === 'string' && known.has(id)) out.add(id);
  for (const id of Object.keys((data.genes as Record<string, unknown> | undefined) ?? {})) if (known.has(id)) out.add(id);
  return [...out];
}

/** v44/v45 Mastery Evolution claim state: clamp claimedUpTo into the 0..100 loop window,
 *  prestige to a non-negative int, and the v45 xpAt watermark to a non-negative finite
 *  number (missing ⇒ 0, the debut loop) — junk entries drop to a fresh track, never crash. */
function sanitizeMasteryEvolution(raw: unknown): Record<string, { claimedUpTo: number; prestige: number; xpAt: number }> {
  const out: Record<string, { claimedUpTo: number; prestige: number; xpAt: number }> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const rec = v as { claimedUpTo?: unknown; prestige?: unknown; xpAt?: unknown };
    const claimedUpTo = Math.max(0, Math.min(100, Math.floor(Number(rec.claimedUpTo) || 0)));
    const prestige = Math.max(0, Math.floor(Number(rec.prestige) || 0));
    const xpAtRaw = Number(rec.xpAt);
    const xpAt = Number.isFinite(xpAtRaw) ? Math.max(0, xpAtRaw) : 0;
    out[k] = { claimedUpTo, prestige, xpAt };
  }
  return out;
}

function sanitizeMegaProgress(raw: unknown): MegaProgress {
  const d = defaultMegaProgress();
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Record<string, unknown>;
  const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 999) : []);
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const fastest: Record<string, number> = {};
  if (o.fastestSec && typeof o.fastestSec === 'object') {
    for (const [k, v] of Object.entries(o.fastestSec as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) fastest[k] = v;
    }
  }
  return {
    slain: strs(o.slain), perfect: strs(o.perfect), speed: strs(o.speed),
    kills: num(o.kills), weakPoints: num(o.weakPoints), wpKinds: strs(o.wpKinds),
    interrupts: num(o.interrupts), abilitiesSurvived: num(o.abilitiesSurvived), fastestSec: fastest,
  };
}

export interface TutorialSave {
  completed: string[];
  rewarded: string[]; // tutorial ids whose one-time rewards were granted (never re-granted on replay)
  milestones: string[]; // "tutorialId:checkpointId" mid-lesson rewards granted (same never-re-grant rule)
  progress: TutorialProgress | null;
}

// v11→v12: tutorial (completion + resumable progress). v12→v13: PER-HERO equipment loadouts
// (migrated from the shared loadout). v21→v22: Player Profile (identity fields + milestone
// timeline + profile stat ledgers). v22→v23: verified-purchase ledger (claimedReceipts +
// pendingCheckout — docs/DEPLOYMENT.md §purchases). v23→v24: Field Research ledger
// (docs/RESEARCH.md). v25→v26: Phenotypes (owned + equipped cosmetics — docs/COSMETICS.md) +
// Mulligans (per-tower organism: mulligans + mulliganDex — docs/MULLIGANS.md). The short-lived
// `geneOverflow` wallet was unified into `geneEssence` (its balance folds in on load).
// v26→v27: Expedition overhaul — per-mission mastery ledger (expeditions.mastery); the
// roster/risk/affinity depth is data-side and needs no save shape.
// v27→v28: Patch-note tracking (patchNotes.seen + optOut — docs/CHANGELOG-PIPELINE.md).
// v28→v29: Mulligan overhaul — piece EXCLUSIVITY (one tower per piece; cross-tower dupes
// sanitize away), reforge fields (locked + reforges — docs/MULLIGANS.md §reforge).
// v29→v30: Ichor Exchange window record (ichorExchange — docs/MARKET.md §exchange).
// v30→v31: Wardrobe (account cosmetics: owned/equipped/favorites/milestones/reveal queue —
// docs/COSMETICS.md §wardrobe) + Battle Pass season record (docs/BATTLEPASS.md).
// v31→v32: Quests & Missions (weekly window record + main questline ledgers + the once-granted
// finale ledger — docs/QUESTS.md).
// v32→v33: Weekly Directives (the cumulative liveops objective ladder — docs/LIVEOPS.md
// §directives): save.directives { week, progress, claimed }.
// v33→v34: Nemesis & Trophy overhaul (docs/NEMESIS.md) — the single `equippedTrophy` becomes a
// multi-slot rack `equippedTrophies[]` (the old value migrates into a one-organ rack) + a
// `vengeance[]` ledger (chassis avenged → vengeance-trophy ownership + the hunt's rap sheet).
// v34→v35: Molt Vows (docs/VOWS.md) — `prestige.vows` (armed wager ids; settled + cleared at
// the next Molt). Additive inside the prestige blob — withDefaults deep-fills, sanitize caps.
// v35→v36: Hive Construction (docs/HIVE-CONSTRUCTION.md) — `hive.built` (organ id → tier):
// the active base-building ledger; fixtures/QoL only, never Power.
// v36→v37: Nucleus Mulligans (docs/NUCLEUS.md) — `nucleus` (chambers/grown/unlocked): the
// Hive Nucleus's own organ system. Empty ⇒ identity fold (golden-safe).
// v37→v38: Daily Bio-Cache (docs/DAILY-LOGIN.md) — `login` {last, streak, best, lifetime}:
// the login-streak ledger behind the daily cache faucet; pure economy, never Power.
// v38→v39: PRIME STRAINS (docs/PRIME-STRAINS.md) — `towerPrime` / `heroPrime` per-unit infinite
// ladders past max Stars. Additive Records, zero-filled for older saves (level 0 = identity fold).
// v39→v40: IDLE HARVEST (docs/IDLE-HARVEST.md) — `idle` {lastCollect, nodes, lifetime ledger}:
// the away-time accrual clock + the infinite evolution tree. lastCollect seeds to NOW on
// migration (the clock starts at the update — no retroactive grant); pure economy, never Power.
// v40→v41: HERO SYMBIOTES (docs/HERO-SYMBIOTES.md) — `heroSymbiotes` (per-hero slots/grown/
// unlocked + lifetime adaptation/resonance ledgers): the champion wing of the Mulligan pillar.
// Empty ⇒ identity fold (golden-safe).
// All additive/migrated — withDefaults() deep-fills, sanitize() folds the legacy field.
// v41→v42: premium.flash (per-offer first-sight/dismiss ledger) + premium.lastFlashShownAt
// (popup cadence limiter) — docs/PREMIUM-STORE.md §flash. Empty ledger ⇒ no flash offer has
// been seen; purely additive (sanitizePremium deep-fills older saves).
// v42→v43: powerLog (docs/POWER-SCORE.md §history) — bounded daily Power Score ledger for the
// Growth panel's weekly delta + Profile trend. Empty ⇒ no trend yet; purely additive.
// v43→v44: MASTERY EVOLUTION TRACKS (docs/MASTERY.md §evolution track) — `masteryEvolution`
// per-unit { claimedUpTo, prestige } claim state for the procedural 100-level reward loops.
// {} ⇒ untouched; purely additive (sanitizeMasteryEvolution clamps/int-coerces).
// v44→v45: masteryEvolution.xpAt — the mastery-XP watermark stamped on EVOLVE; loops past the
// first are XP-metered on it (docs/MASTERY.md §pacing — the balancing sims killed level
// windows: loop 2 would have cost ×83,522 loop 1). Missing ⇒ 0 (debut loop unchanged).
// v45→v46: GENE DISCOVERY (docs/CARDS.md §discovery) — `genesDiscovered` (Archive membership:
// starters + Bio-Container finds; drafting + permanent upgrades key on it). Missing ⇒ seeded
// from STARTER_GENES ∪ touched cards, so no veteran loses access to anything they used.
// v46→v47: ONLINE FOUNDATION (docs/ONLINE-FOUNDATION.md) — `arena` (the live-PvP season
// record: rating/placements/streak, the wins-only Arena Pass, the forever exclusives ledger,
// season history, exactly-once settled-match ring) + `provenance` (the Auction House identity
// spine: per-item acquisition stamps with bound flags + ownership history, self-healing on
// load so every owned tradable is ALWAYS covered). Both inert when fresh ⇒ golden-safe.
// v47→v48: LOCALIZED ECONOMY (docs/ECONOMY.md §localized) — `hiveMaterials` (Chitin: the
// Hive-Production organ wallet, replacing Genome Cores there) + `mulliganTissue` (the tower
// Mulligan graft wallet, replacing Gene Essence there). Missing ⇒ seeded from existing
// investment (Σ organ levels / Σ graft levels) so a migrating build never stalls; 0 when
// the account never touched the system (fresh accounts byte-identical).
// ALSO v48: BANKED BIO-SPORES (docs/BOSS-RUSH.md §roulette) — `bioSpores` (Bio-Roulette ammo
// banked across sources: Boss Rush, first-kill chassis, quest finales, Battle Pass milestones;
// spent by a wheel session). Missing ⇒ 0 — purely additive.
// v48→v49: THE FRONT (docs/INFESTATION.md §front) — the Infestation overhaul's claim ledgers
// on `infestation`: tierClaims (one-time tier spoils per sector), tributeWeeks (weekly
// regional tribute watermarks), defenses (dayKey → defended sector, bounded ring) and
// lastIncursionDay (incursion resolution cursor). All empty on pre-v49 saves ⇒ additive,
// fresh accounts byte-identical.
// v49→v50: LIVE EVENT LEDGERS (docs/LIVE-EVENTS.md §6) — `liveEvents` {tokens, claimed,
// shopBought, progress}, every key `eventId:window`; the sanitizer prunes keys outside the
// currently ACTIVE trio, so rotation retires state and the ledger is structurally bounded.
// Missing ⇒ empty ledgers — purely additive, golden-safe. (v49 was reserved by The Front —
// the twin batch's coordination note — so the ledgers take their own number.)
// v50→v51: METABOLISM (docs/METABOLISM.md) — `metabolism` {counters, claimed}: the
// recursive-progression ledger. Missing ⇒ zero counters (derived tracks back-fill free).
// v51→v52: EVENT SHOPS (docs/LIVE-EVENTS.md §shops) — `liveEvents.lifetimeBought`
// (`eventId:rowId` → count, NEVER pruned: the exclusive lane's once-ever contract) +
// daily/weekly restock counters as `rowId@period` keys inside shopBought (window-pruned).
// v52→v53: TWO-STATE COSMETICS (docs/COSMETICS.md §claiming) — `wardrobe.inventory`
// (UNCLAIMED tradable instances {uid,item,at,src}) + `wardrobe.granted` (ids ever delivered —
// the once-per-source gate). MIGRATION: pre-v53 `owned` stays CLAIMED unchanged (equips,
// collections, ceremonies all keep their history — nothing is taken away); granted seeds
// from owned, inventory starts empty. Purely additive, golden-safe.
// v53→v55: THREAT LADDER (docs/THREAT.md) — `threat` {campaign, endless, bossRush}: the best
// CLEARED Threat level per mode. Pre-v55 (version < 55) ⇒ all 0 (the baseline is DERIVED from
// existing records, so veterans start one rung up, never re-earning Threat 0). Integers clamped
// to [0, THREAT_MAX]. Purely additive, golden-safe. (v54 is reserved by a parallel track.)
// v55→v56: THE GRIND (docs/ONE-MORE-RUN.md §eta · GENOME-RANK.md §peak · EQUIPMENT.md §codex ·
// DAILY-LOGIN.md §income) — four additive fields: `equipment.discovered` (permanent Gear Codex
// credit; BACKFILLED from the current inventory, never shrinks), `genomeRank.peakPower` (the
// rating's Power axis; absent ⇒ 0, raised to the live score on first read), `income` (the per-run
// income ledger; absent ⇒ empty, it fills from the next settle) and `login.incomeCores` (the
// claimed day's income line). Merge: discovered = union, peakPower = max. Golden-safe.
// Also v56 — the Boss Rush RECORD EPOCH (docs/BOSS-RUSH.md §epoch): Boss Rush got its wall, so a
// pre-v56 `rushBestBoss` (set when waves waited forever — 400–650 bosses) is unbeatable. migrate()
// archives it to `rushLegacyBestBoss` (display only) and restarts the record at 0, so its Ichor
// bands and the (re-keyed) leaderboard pay again. `rushBestWave` is kept (its readers are capped).
// Merge: max.
export const CURRENT_VERSION = 58;

// ── v56 Income ledger (docs/ONE-MORE-RUN.md §eta) — the SHAPE lives here; meters + math in
// state/income.ts. Keys are meter ids ('cores', 'stage', 'apex:shepherd', …). ──
export interface IncomeSave {
  runs: number; // settles observed since the ledger started
  last: Record<string, number>; // meter values at the previous settle
  rate: Record<string, number>; // per-run moving average of each meter's gain
}
export function defaultIncome(): IncomeSave {
  return { runs: 0, last: {}, rate: {} };
}
/** Bounded so a tampered blob cannot bloat the save (the live meter set is ~40 keys). */
const INCOME_KEY_CAP = 600;
function sanitizeIncome(raw: unknown): IncomeSave {
  const out = defaultIncome();
  if (typeof raw !== 'object' || raw === null) return out;
  const o = raw as { runs?: unknown; last?: unknown; rate?: unknown };
  out.runs = Math.max(0, Math.min(1e9, Math.floor(Number(o.runs) || 0)));
  const map = (v: unknown): Record<string, number> => {
    const m: Record<string, number> = {};
    if (typeof v !== 'object' || v === null) return m;
    let n = 0;
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const f = Number(x);
      if (typeof k !== 'string' || k.length > 64 || !Number.isFinite(f) || f < 0) continue;
      m[k] = f;
      if (++n >= INCOME_KEY_CAP) break;
    }
    return m;
  };
  out.last = map(o.last);
  out.rate = map(o.rate);
  return out;
}
/** v56 Gear Codex ledger: known string ids, deduped, ∪ every def currently in the inventory
 *  (the backfill — a pre-v56 save discovers exactly what it holds; never less). */
function sanitizeDiscovered(raw: unknown, inventory: OwnedItem[]): string[] {
  const out = new Set<string>();
  if (Array.isArray(raw)) for (const id of raw) if (typeof id === 'string' && id.length > 0 && id.length <= 64) out.add(id);
  for (const it of inventory) if (typeof it?.defId === 'string') out.add(it.defId);
  return [...out];
}

// ── v51 Metabolism ledger (docs/METABOLISM.md) — the save SHAPE lives here (saveStore owns
// module shapes); the track registry + curve math live in state/metabolism.ts. ──
export interface MetabolismSave {
  /** The four unledgered verbs, fed by single meta chokepoints. Everything else derives. */
  counters: { containersOpened: number; sporesAbsorbed: number; questsClaimed: number; passClaimed: number };
  /** Per-track CLAIMED tier count (tiers are claimed in order; reached-but-unclaimed = claimable). */
  claimed: Record<string, number>;
}
export function defaultMetabolism(): MetabolismSave {
  return { counters: { containersOpened: 0, sporesAbsorbed: 0, questsClaimed: 0, passClaimed: 0 }, claimed: {} };
}

/** v55 THREAT ledger: every mode present, whole numbers in [0, THREAT_MAX]; junk ⇒ 0. */
function sanitizeThreat(raw: unknown): Record<ThreatMode, number> {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const out = {} as Record<ThreatMode, number>;
  for (const m of THREAT_MODES) out[m] = clampThreat(Number(o[m]) || 0, THREAT_MAX);
  return out;
}

function sanitizeMetabolism(raw: unknown): MetabolismSave {
  const d = defaultMetabolism();
  if (typeof raw !== 'object' || raw === null) return d;
  const o = raw as { counters?: Record<string, unknown>; claimed?: Record<string, unknown> };
  const num = (v: unknown): number => Math.max(0, Math.floor(Number(v) || 0));
  if (typeof o.counters === 'object' && o.counters !== null) {
    for (const k of Object.keys(d.counters) as (keyof MetabolismSave['counters'])[]) d.counters[k] = num(o.counters[k]);
  }
  if (typeof o.claimed === 'object' && o.claimed !== null) {
    for (const [k, v] of Object.entries(o.claimed)) { const n = num(v); if (n > 0) d.claimed[k] = n; }
  }
  return d;
}
/** v50 Live Event ledgers: shape-check + clamp against the LIVE defs, prune stale windows.
 *  Wall-clock use is deliberate — staleness IS a function of now (same rule the claim paths
 *  apply); tests exercise it by seeding keys for the active trio vs long-dead windows. */
function sanitizeLiveEvents(raw: unknown): { tokens: Record<string, number>; claimed: Record<string, number[]>; shopBought: Record<string, Record<string, number>>; progress: Record<string, Record<string, number>>; lifetimeBought: Record<string, number> } {
  const out = { tokens: {} as Record<string, number>, claimed: {} as Record<string, number[]>, shopBought: {} as Record<string, Record<string, number>>, progress: {} as Record<string, Record<string, number>>, lifetimeBought: {} as Record<string, number> };
  if (!raw || typeof raw !== 'object') return out;
  const byKey = new Map(activeLiveEvents(Date.now()).map((a) => [a.key, a.def]));
  const r = raw as { tokens?: Record<string, unknown>; claimed?: Record<string, unknown>; shopBought?: Record<string, unknown> };
  for (const [k, v] of Object.entries(r.tokens ?? {})) {
    const def = byKey.get(k);
    if (!def?.currency) continue; // stale window (or currency-less event) ⇒ prune
    const n = Math.max(0, Math.min(def.currency.cap, Math.floor(Number(v) || 0)));
    if (n > 0) out.tokens[k] = n;
  }
  for (const [k, v] of Object.entries(r.claimed ?? {})) {
    const def = byKey.get(k);
    if (!def || !Array.isArray(v)) continue;
    const valid = new Set(eventTrack(def).map((m) => m.at));
    const kept = [...new Set(v.map((x) => Math.floor(Number(x) || 0)).filter((x) => valid.has(x)))];
    if (kept.length > 0) out.claimed[k] = kept;
  }
  for (const [k, v] of Object.entries((r as { progress?: Record<string, unknown> }).progress ?? {})) {
    const def = byKey.get(k);
    if (!def?.challenges || !v || typeof v !== 'object') continue;
    const rows: Record<string, number> = {};
    for (const ch of def.challenges) {
      const n = Math.floor(Number((v as Record<string, unknown>)[ch.id]) || 0);
      if (n > 0) rows[ch.id] = Math.min(ch.target, n);
    }
    if (Object.keys(rows).length > 0) out.progress[k] = rows;
  }
  for (const [k, v] of Object.entries(r.shopBought ?? {})) {
    const def = byKey.get(k);
    if (!def?.shop || !v || typeof v !== 'object') continue;
    const rows: Record<string, number> = {};
    for (const [rk, rv] of Object.entries(v as Record<string, unknown>)) {
      // Plain keys are window-limited rows; `rowId@period` keys are daily/weekly restock
      // counters (docs/LIVE-EVENTS.md §shops). Both clamp to the row's per-period stock;
      // stale-period keys prune with the window like everything else here.
      const rowId = rk.includes('@') ? rk.slice(0, rk.indexOf('@')) : rk;
      const row = def.shop.find((s) => s.id === rowId);
      if (!row) continue;
      const n = Math.floor(Number(rv) || 0);
      if (n > 0) rows[rk] = Math.min(row.stock, n);
    }
    if (Object.keys(rows).length > 0) out.shopBought[k] = rows;
  }
  // v52: the LIFETIME purchase ledger — `${eventId}:${rowId}` keys survive window rotation
  // FOREVER (the exclusive lane's once-ever contract). Deliberately not pruned against the
  // live registry: a retired event's history must keep blocking a re-buy if it returns.
  for (const [k, v] of Object.entries((raw as { lifetimeBought?: Record<string, unknown> }).lifetimeBought ?? {})) {
    const n = Math.floor(Number(v) || 0);
    if (n > 0) out.lifetimeBought[k] = Math.min(9, n);
  }
  return out;
}

/** The placeholder every save is born with — the Commander designation prompt fires
 *  while the name is still exactly this (components/CommanderName.tsx). */
export const DEFAULT_PROFILE_NAME = 'OVERMIND';
const SAVE_KEY = 'assimilate.save';
const BAK_PREFIX = 'assimilate.save.bak.';
const BAK_INDEX = 'assimilate.save.baklist';
const MAX_BACKUPS = 8;

interface SaveBlob {
  schemaVersion: number;
  data: unknown;
  checksum: string;
}

export interface BackupMeta {
  id: string;
  at: string; // ISO timestamp
}

export type ImportResult = { ok: true; data: SaveData } | { ok: false; error: string };

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function zeroByTower(): Record<TowerKind, number> {
  const r = {} as Record<TowerKind, number>;
  for (const k of TOWER_ORDER) r[k] = 0;
  return r;
}
function emptyForksByTower(): Record<TowerKind, Record<string, string>> {
  const r = {} as Record<TowerKind, Record<string, string>>;
  for (const k of TOWER_ORDER) r[k] = {};
  return r;
}
function emptyMulligansByTower(): Record<TowerKind, MulliganState> {
  const r = {} as Record<TowerKind, MulliganState>;
  for (const k of TOWER_ORDER) r[k] = emptyMulligan();
  return r;
}
/** Coerce one persisted Mulligan into valid shape: exactly MULLIGAN_SLOTS slots, each either null
 *  or a known modifier at a valid rarity with its level clamped to the rarity ceiling; integer seeds.
 *  Unknown modifier ids and malformed slots become null (the organism simply stays inactive). */
function sanitizeMulligan(raw: unknown): MulliganState {
  const base = emptyMulligan();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as { slots?: unknown; visualSeed?: unknown; animSeed?: unknown };
  const slots: (MulliganSlot | null)[] = [];
  const arr = Array.isArray(o.slots) ? o.slots : [];
  for (let i = 0; i < MULLIGAN_SLOTS; i++) {
    const s = arr[i] as { id?: unknown; rarity?: unknown; level?: unknown } | null | undefined;
    if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !mulliganRegistry.has(s.id) || typeof s.rarity !== 'string' || !(s.rarity in MULLIGAN_RARITY)) {
      slots.push(null);
      continue;
    }
    const rarity = s.rarity as MulliganRarity;
    const level = Math.max(1, Math.min(levelCap(rarity), Math.floor(Number(s.level) || 1)));
    slots.push({ id: s.id, rarity, level });
  }
  // §reforge (v29): the permanent lock + rolled wheel mods (unknown ids drop harmlessly).
  const o2 = raw as { locked?: unknown; reforges?: unknown };
  const reforges: (string | null)[] = [];
  if (Array.isArray(o2.reforges)) {
    for (let i = 0; i < 3; i++) {
      const id = o2.reforges[i];
      reforges.push(typeof id === 'string' && reforgeModById(id) ? id : null);
    }
  }
  return {
    slots,
    visualSeed: Math.floor(Number(o.visualSeed) || 0) >>> 0,
    animSeed: Math.floor(Number(o.animSeed) || 0) >>> 0,
    ...(o2.locked === true ? { locked: true } : {}),
    ...(reforges.some((r) => r) ? { reforges } : {}),
  };
}
function sanitizeMulligans(raw: unknown): Record<TowerKind, MulliganState> {
  const out = emptyMulligansByTower();
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    for (const k of TOWER_ORDER) if (k in o) out[k] = sanitizeMulligan(o[k]);
  }
  // §exclusivity (v29): a piece lives on ONE tower (and one slot) at a time. Walk the
  // roster in canonical order and null out any repeat of an already-seen modifier id —
  // pre-v29 saves that stacked or shared pieces sanitize to the first host deterministically.
  const seen = new Set<string>();
  for (const k of TOWER_ORDER) {
    const st = out[k];
    let changed = false;
    const slots = st.slots.map((slot) => {
      if (!slot) return slot;
      if (seen.has(slot.id)) { changed = true; return null; }
      seen.add(slot.id);
      return slot;
    });
    if (changed) out[k] = { ...st, slots };
  }
  return out;
}
/** Discovered-modifier collection (id → best rarity). Drops unknown ids + invalid rarities. */
function sanitizeMulliganDex(raw: unknown): Record<string, MulliganRarity> {
  const out: Record<string, MulliganRarity> = {};
  if (raw && typeof raw === 'object') {
    for (const [id, r] of Object.entries(raw as Record<string, unknown>)) {
      if (mulliganRegistry.has(id) && typeof r === 'string' && r in MULLIGAN_RARITY) out[id] = r as MulliganRarity;
    }
  }
  return out;
}
function emptyForksByHero(): Record<HeroKind, Record<string, string>> {
  const r = {} as Record<HeroKind, Record<string, string>>;
  for (const k of HERO_ORDER) r[k] = {};
  return r;
}
function zeroByHero(): Record<string, number> {
  const r: Record<string, number> = {};
  for (const id of HERO_IDS) r[id] = 0;
  return r;
}
function zeroByHeroKind(): Record<HeroKind, number> {
  const r = {} as Record<HeroKind, number>;
  for (const k of HERO_ORDER) r[k] = 0;
  return r;
}
function emptyFavByHero(): Record<HeroKind, Record<string, number>> {
  const r = {} as Record<HeroKind, Record<string, number>>;
  for (const k of HERO_ORDER) r[k] = {};
  return r;
}
/** Heroes owned from the start — no `unlockShards` gate AND no milestone gate (e.g. Ravager).
 *  Milestone heroes (HeroDef.unlock — Vitriol/Revenant) carry no shard cost either, but they are
 *  NEVER starters and never live in `heroUnlocked`: their ownership DERIVES live from the feat
 *  (meta.isHeroUnlocked). Seeding them here handed both out at minute zero — the gating bug. */
function starterHeroes(): HeroKind[] {
  return HERO_ORDER.filter((k) => !HERO_DEFS[k].unlock && !(HERO_DEFS[k].unlockShards && HERO_DEFS[k].unlockShards! > 0));
}
/** Towers owned from the start — those with no `unlockShards` gate (the launch five). */
function starterTowers(): TowerKind[] {
  // Arena exclusives carry no shard price but are NEVER starters — the Arena Pass crown is
  // their only acquisition path (docs/ARENA.md §6).
  return TOWER_ORDER.filter((k) => !TOWER_DEFS[k].arenaExclusive && !(TOWER_DEFS[k].unlockShards && TOWER_DEFS[k].unlockShards! > 0));
}
/** Resolve the owned-tower set (mirrors sanitizeHeroUnlocked). A save with the field honors its
 *  persisted list (registry-resolved, deduped); a PRE-gate save has no field ⇒ grandfather in any
 *  gated tower the player already engaged with (stars / lifetime deployments) UNION the starters,
 *  so nobody loses access to a tower they were using. Stable TOWER_ORDER order. */
function sanitizeTowerUnlocked(data: SaveData): TowerKind[] {
  const set = new Set<TowerKind>(starterTowers());
  const raw = (data as { towerUnlocked?: unknown }).towerUnlocked;
  if (Array.isArray(raw)) {
    for (const x of raw) { const k = towerRegistry.resolve(typeof x === 'string' ? x : '') as TowerKind | undefined; if (k) set.add(k); }
  } else {
    // Pre-gate migration: anything the player has touched stays owned.
    for (const k of TOWER_ORDER) if ((data.towerStars?.[k] ?? 0) > 0 || (data.stats?.towerUsage?.[k] ?? 0) > 0) set.add(k);
    const fav = data.favoriteTower as TowerKind | undefined; if (fav && TOWER_ORDER.includes(fav)) set.add(fav);
  }
  return TOWER_ORDER.filter((k) => set.has(k));
}
/** Resolve the owned-hero set. A v14+ save honors its persisted list (registry-resolved, deduped);
 *  a PRE-v14 save has no field ⇒ grandfather in every hero the player already engaged with (stars /
 *  fielded / selected / lifetime usage) UNION the starters, so an existing player never loses access
 *  to a hero they were using. Always includes the starters and returns a stable HERO_ORDER order.
 *  MILESTONE heroes (HeroDef.unlock) are stripped even when persisted: their ownership derives
 *  live from the feat (meta.isHeroUnlocked), and the list must never re-grant them — this also
 *  self-heals saves from the era when starterHeroes() wrongly seeded Vitriol/Revenant. */
function sanitizeHeroUnlocked(data: SaveData): HeroKind[] {
  const set = new Set<HeroKind>(starterHeroes());
  const raw = (data as { heroUnlocked?: unknown }).heroUnlocked;
  if (Array.isArray(raw)) {
    for (const x of raw) { const k = heroRegistry.resolve(typeof x === 'string' ? x : '') as HeroKind | undefined; if (k) set.add(k); }
  } else {
    // Pre-v14 migration: anything the player has touched stays owned.
    for (const k of HERO_ORDER) if ((data.heroStars?.[k] ?? 0) > 0 || (data.stats?.heroUsage?.[k] ?? 0) > 0) set.add(k);
    for (const x of data.heroLoadout ?? []) { const k = heroRegistry.resolve(x) as HeroKind | undefined; if (k) set.add(k); }
    const sel = heroRegistry.resolve(data.selectedHero) as HeroKind | undefined; if (sel) set.add(sel);
  }
  return HERO_ORDER.filter((k) => set.has(k) && !HERO_DEFS[k].unlock);
}
/** Keep only real, de-duplicated adaptation-node ids per unit key (drops junk from a tampered save). */
function sanitizeAdaptation(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(val)) continue;
    const ids = Array.from(new Set(val.filter((x): x is string => typeof x === 'string' && !!adaptNode(x))));
    if (ids.length) out[key] = ids;
  }
  return out;
}
function zeroByEnemy(): Record<EnemyKind, number> {
  const r = {} as Record<EnemyKind, number>;
  for (const k of ENEMY_KINDS) r[k] = 0;
  return r;
}

/** A zeroed lifetime-stats block — the v3 default and the merge base for old saves. */
export function defaultLifetimeStats(): LifetimeStats {
  return {
    lifetimeKills: 0,
    highestWave: 0,
    totalBiomass: 0,
    totalDamage: 0,
    runsCompleted: 0,
    runsFailed: 0,
    cardsDrafted: 0,
    uniqueCards: [],
    killsByEnemy: zeroByEnemy(),
    towerUsage: zeroByTower(),
    heroUsage: zeroByHero(),
    towerDamage: zeroByTower(),
    towerBestWave: zeroByTower(),
    bestStrain: 0,
    strainsEvolved: 0,
    towerBestStrain: zeroByTower(),
    playtimeSec: 0,
    longestRunSec: 0,
    waveSum: 0,
    doctrineRuns: {},
    doctrineWins: {},
    doctrineBestWave: {},
    cardDrafts: {},
    rushRuns: 0,
    rushBossKills: 0,
    rouletteSpores: 0,
  };
}

export function defaultSave(): SaveData {
  return reconcileSaveProvenance({
    shards: 0,
    upgrades: {},
    bestWave: 0,
    rushBestWave: 0,
    rushBestBoss: 0,
    rushLegacyBestBoss: 0,
    rushStamina: { value: 100, updatedAt: 0, freeDay: '' },
    research: { day: '', claims: {}, pendingBoosts: [], lifetime: { views: 0, claims: {} } },
    daily: { lastKey: '', lastWave: 0, bestWave: 0, completions: 0, streak: 0, rewardedKey: '', lastReplay: null },
    cosmetics: { owned: [], towers: {}, heroes: {} },
    contracts: { completed: [], perfectWeeks: 0, lastPerfect: '' },
    directives: { week: '', progress: {}, claimed: [] },
    hive: { built: {} },
    login: { last: '', streak: 0, best: 0, lifetime: 0, incomeCores: 0 },
    idle: { lastCollect: 0, nodes: {}, lifetimeHours: 0, harvests: 0, lifetimeValue: 0, bestHours: 0, blooms: 0 },
    nemesis: null,
    equippedTrophies: [],
    vengeance: [],
    expeditions: { active: [], mastery: {} },
    infestation: { target: null, sectors: {}, tierClaims: {}, tributeWeeks: {}, defenses: {}, lastIncursionDay: '' },
    patchNotes: { seen: '', optOut: false },
    premium: { purchases: {}, lastRotatingBuyKey: '', seenKey: '', totalSpentUsd: 0, claimedReceipts: [], pendingCheckout: null, flash: {}, lastFlashShownAt: 0 },
    totalRuns: 0,
    lifetimeShards: 0,
    cardsSeen: 0,
    towerShards: zeroByTower(),
    towerStars: zeroByTower(),
    towerPrime: zeroByTower(),
    towerForks: emptyForksByTower(),
    towerMasteryXp: zeroByTower(),
    towerKills: zeroByTower(),
    heroShards: zeroByHero(),
    heroStars: zeroByHeroKind(),
    heroPrime: zeroByHeroKind(),
    heroForks: emptyForksByHero(),
    heroMasteryXp: zeroByHeroKind(),
    selectedHero: 'ravager',
    favoriteTower: 'needle',
    heroLoadout: ['ravager'],
    heroUnlocked: starterHeroes(),
    towerUnlocked: starterTowers(),
    adaptation: {},
    heroKills: zeroByHeroKind(),
    heroFavEquip: emptyFavByHero(),
    stats: defaultLifetimeStats(),
    achievements: [],
    equipment: { inventory: [], loadouts: {}, discovered: [] },
    mats: { mutagen: 0, scrap: 0, catalyst: 0 },
    matPity: 0,
    lastSalvage: null,
    lootQueue: defaultLootQueue(),
    pendingContainers: [],
    unlockedTitles: [],
    equippedTitle: null,
    unlockedLore: [],
    bossesSlain: [],
    megaProgress: defaultMegaProgress(),
    prestige: defaultPrestige(),
    campaign: { cleared: {}, bestTime: {} },
    tutorial: { completed: [], rewarded: [], milestones: [], progress: null },
    prediction: { campaign: defaultCalib(), infinite: defaultCalib(), bossRush: defaultCalib() },
    help: { seen: [], primed: false, hudTour: false },
    director: { revealed: {}, visits: {} },
    accountXp: { xp: 0, week: { key: '', xp: 0 }, month: { key: '', xp: 0 } },
    genomeRank: { celebrated: 1, peakPower: 0 },
    genes: {},
    geneSlots: 1,
    geneLoadout: [null, null, null, null, null],
    geneEssence: 0,
    hiveMaterials: 0,
    mulliganTissue: 0,
    bioSpores: 0,
    liveEvents: { tokens: {}, claimed: {}, shopBought: {}, progress: {}, lifetimeBought: {} },
    metabolism: defaultMetabolism(),
    threat: { campaign: 0, endless: 0, bossRush: 0 },
    income: defaultIncome(),
    genesDiscovered: [...STARTER_GENES], // the teaching set — every account starts with it

    createdAt: 0, // stamped by the first settle — defaultSave() must stay deterministic
    profileName: DEFAULT_PROFILE_NAME,
    profileFrame: 'membrane',
    profileSigil: null,
    timeline: [],
    powerLog: [],
    antigen: 0,
    ichor: 0,
    lifetimeIchor: 0,
    market: { window: 0, bought: [], seenWindow: 0, starter: false },
    ichorExchange: { window: 0, reserve: 0, bought: [] },
    wardrobe: defaultWardrobe(),
    battlePass: { window: 0, xp: 0, premium: false, claimedFree: [], claimedPremium: [], adDay: '', adUsed: 0, permanents: [], completions: {}, stacks: 0 },
    quests: defaultQuests(),
    mulligans: emptyMulligansByTower(),
    mulliganDex: {},
    nucleus: emptyNucleus(),
    heroSymbiotes: {},
    classBonds: {},
    masteryEvolution: {},
    arena: defaultArenaSave(),
    // v47 coverage invariant: even a FRESH account's starter tradables (starter genes,
    // starter wardrobe rows) carry provenance stamps — reconciled by the wrapper above,
    // deterministically (legacy stamps at 0).
    provenance: {},
  });
}

export function defaultQuests(): SaveData['quests'] {
  return {
    weekly: { window: 0, progress: {}, claimed: [], completionClaimed: false },
    main: { progress: {}, claimed: [], completions: [] },
    once: [], missionsDone: [], questCompletions: {},
  };
}

/** Coerce a loaded market record (docs/MARKET.md): finite ints, string ids, capped list. */
function sanitizeMarket(raw: unknown): SaveData['market'] {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<SaveData['market']>;
  const int = (v: unknown): number => Math.max(0, Math.floor(Number(v) || 0));
  return {
    window: int(o.window),
    bought: Array.isArray(o.bought) ? o.bought.filter((x): x is string => typeof x === 'string').slice(0, 32) : [],
    seenWindow: int(o.seenWindow),
    starter: o.starter === true,
  };
}

/** Coerce a loaded tutorial block into a valid shape (completed ids + resumable progress). */
function sanitizeTutorial(raw: unknown): TutorialSave {
  if (typeof raw !== 'object' || raw === null) return { completed: [], rewarded: [], milestones: [], progress: null };
  const o = raw as Partial<TutorialSave>;
  const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return { completed: strs(o.completed), rewarded: strs(o.rewarded), milestones: strs(o.milestones), progress: sanitizeProgress(o.progress) };
}

function sanitizeCalib(raw: unknown): PredictCalib {
  const d = defaultCalib();
  if (typeof raw !== 'object' || raw === null) return d;
  const o = raw as Partial<PredictCalib>;
  const num = (v: unknown, fb: number): number => (typeof v === 'number' && isFinite(v) ? v : fb);
  return {
    bias: num(o.bias, 0),
    samples: Math.max(0, Math.floor(num(o.samples, 0))),
    lastEstimate: Math.max(0, num(o.lastEstimate, 0)),
    prevPowerMult: Math.max(0, num(o.prevPowerMult, 1)),
  };
}
function sanitizePrediction(raw: unknown): SaveData['prediction'] {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return { campaign: sanitizeCalib(o.campaign), infinite: sanitizeCalib(o.infinite), bossRush: sanitizeCalib(o.bossRush) };
}
function sanitizeHelp(raw: unknown): SaveData['help'] {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const seen = Array.isArray(o.seen) ? o.seen.filter((x): x is string => typeof x === 'string') : [];
  return { seen, primed: o.primed === true, hudTour: o.hudTour === true };
}
/** Coerce the Account-XP block: finite ≥0 lifetime XP + rolling period ledgers. */
function sanitizeAccountXp(raw: unknown): SaveData['accountXp'] {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown): number => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const period = (v: unknown): { key: string; xp: number } => {
    const p = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
    return { key: typeof p.key === 'string' ? p.key : '', xp: num(p.xp) };
  };
  return { xp: num(o.xp), week: period(o.week), month: period(o.month) };
}
/** Coerce the Genome Rank watermark: a finite rank index ≥ 1 (rank I never celebrates). */
function sanitizeGenomeRank(raw: unknown): SaveData['genomeRank'] {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const n = Math.floor(Number(o.celebrated));
  // v56 peakPower: finite ≥ 0 (absent ⇒ 0 — meta raises it to the live score on first read).
  const peak = Number(o.peakPower);
  return { celebrated: Number.isFinite(n) && n >= 1 ? n : 1, peakPower: Number.isFinite(peak) && peak > 0 ? Math.min(peak, 1e15) : 0 };
}
/** Coerce the Progression Director ledgers to string → finite ≥0 int maps (junk entries dropped). */
function sanitizeDirector(raw: unknown): SaveData['director'] {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const numMap = (v: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    if (typeof v === 'object' && v !== null) {
      for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
        const num = Math.floor(Number(n));
        if (Number.isFinite(num) && num >= 0) out[k] = num;
      }
    }
    return out;
  };
  return { revealed: numMap(o.revealed), visits: numMap(o.visits) };
}
/** Coerce the Undo-Salvage buffer: needs a plausible item (uid + defId) and a numeric refund, else null. */
function sanitizeLastSalvage(raw: unknown): SaveData['lastSalvage'] {
  const o = raw as { item?: { uid?: unknown; defId?: unknown }; refund?: Record<string, unknown> } | null;
  if (!o || typeof o !== 'object' || !o.item || typeof o.item.uid !== 'string' || typeof o.item.defId !== 'string') return null;
  const n = (v: unknown): number => Math.max(0, Math.floor(Number(v) || 0));
  return { item: o.item as OwnedItem, refund: { mutagen: n(o.refund?.mutagen), scrap: n(o.refund?.scrap), catalyst: n(o.refund?.catalyst) } };
}

/**
 * Merge a validated (possibly older / partial) save onto a complete default —
 * filling any missing top-level field AND deep-merging the per-kind progression
 * records so every tower/hero key is present. This is the v1→v2 upgrade path:
 * a pre-progression save simply gains zeroed records.
 */
/** v26 Phenotypes: keep only REAL registry ids; an equip must be owned AND target its kind.
 *  Junk/tampered imports fall back to bare defaults — never a crash, never a phantom skin. */
function sanitizeCosmetics(raw: unknown): SaveData['cosmetics'] {
  const out: SaveData['cosmetics'] = { owned: [], towers: {}, heroes: {} };
  if (!raw || typeof raw !== 'object') return out;
  const o = raw as { owned?: unknown; towers?: unknown; heroes?: unknown };
  if (Array.isArray(o.owned)) {
    out.owned = [...new Set(o.owned.filter((x): x is string => typeof x === 'string' && cosmeticById(x) !== undefined))];
  }
  const ownedSet = new Set(out.owned);
  const fill = <K extends string>(src: unknown, kind: 'tower' | 'hero', into: Partial<Record<K, string>>): void => {
    if (!src || typeof src !== 'object') return;
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (typeof v !== 'string' || !ownedSet.has(v)) continue;
      const def = cosmeticById(v);
      if (!def || def.target.kind !== kind) continue;
      if ((kind === 'tower' && (def.target as { tower: string }).tower === k) || (kind === 'hero' && (def.target as { hero: string }).hero === k)) {
        into[k as K] = v;
      }
    }
  };
  fill(o.towers, 'tower', out.towers);
  fill(o.heroes, 'hero', out.heroes);
  return out;
}

/** A fresh Wardrobe: starter items owned + pre-seen (no NEW noise on first boot), nothing
 *  equipped ({} = the classic look everywhere — golden-safe). */
function defaultWardrobe(): SaveData['wardrobe'] {
  const starters = starterItems().map((d) => d.id);
  return { owned: [...starters], inventory: [], granted: [...starters], equipped: {}, favorites: [], seen: [...starters], milestones: [], pendingReveal: [] };
}

/** Cap on stored unclaimed instances — generous (thousands-scale UI) but bounded. */
const COSMETIC_INV_CAP = 999;

function sanitizeWardrobe(raw: unknown): SaveData['wardrobe'] {
  const out = defaultWardrobe();
  if (!raw || typeof raw !== 'object') return out;
  const o = raw as Record<string, unknown>;
  const ids = (v: unknown): string[] =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && wardrobeItem(x) !== undefined))] : [];
  out.owned = [...new Set([...out.owned, ...ids(o.owned)])]; // starters are always owned
  const ownedSet = new Set(out.owned);
  // v53 UNCLAIMED instances: shape-checked, known items only, unique uids, bounded. Dupes of
  // claimed ids stay (pure trade goods); junk instances evaporate.
  if (Array.isArray(o.inventory)) {
    const seenUids = new Set<string>();
    for (const v of o.inventory) {
      if (out.inventory.length >= COSMETIC_INV_CAP) break;
      if (!v || typeof v !== 'object') continue;
      const inst = v as Partial<CosmeticInstance>;
      if (typeof inst.uid !== 'string' || inst.uid.length === 0 || seenUids.has(inst.uid)) continue;
      if (typeof inst.item !== 'string' || wardrobeItem(inst.item) === undefined) continue;
      seenUids.add(inst.uid);
      out.inventory.push({
        uid: inst.uid.slice(0, 40),
        item: inst.item,
        at: typeof inst.at === 'number' && Number.isFinite(inst.at) && inst.at > 0 ? Math.floor(inst.at) : 0,
        src: typeof inst.src === 'string' && inst.src.length > 0 ? inst.src.slice(0, 40) : 'legacy',
      });
    }
  }
  // v53 granted ledger: claimed ⇒ granted (migration seeds pre-v53 saves from `owned`), plus
  // everything sitting unclaimed in the vault — the once-per-source gate stays airtight.
  out.granted = [...new Set([...out.owned, ...ids(o.granted), ...out.inventory.map((i) => i.item)])];
  out.favorites = ids(o.favorites).filter((id) => ownedSet.has(id));
  out.seen = [...new Set([...out.seen, ...ids(o.seen)])];
  const held = new Set([...out.owned, ...out.inventory.map((i) => i.item)]); // reveals need a live copy
  out.pendingReveal = ids(o.pendingReveal).filter((id) => held.has(id));
  if (o.milestones && Array.isArray(o.milestones)) {
    out.milestones = [...new Set(o.milestones.filter((x): x is string => typeof x === 'string' && wardrobeMilestone(x) !== undefined))];
  }
  if (o.equipped && typeof o.equipped === 'object') {
    for (const k of WARDROBE_KINDS) {
      const v = (o.equipped as Record<string, unknown>)[k.id];
      if (typeof v !== 'string' || !ownedSet.has(v)) continue;
      const def = wardrobeItem(v);
      if (def && def.kind === k.id) out.equipped[k.id as WardrobeKind] = v;
    }
  }
  return out;
}

function sanitizeBattlePass(raw: unknown): SaveData['battlePass'] {
  const out: SaveData['battlePass'] = { window: 0, xp: 0, premium: false, claimedFree: [], claimedPremium: [], adDay: '', adUsed: 0, permanents: [], completions: {}, stacks: 0 };
  if (!raw || typeof raw !== 'object') return out;
  const o = raw as Record<string, unknown>;
  const nat = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  out.window = nat(o.window);
  out.xp = nat(o.xp);
  out.premium = o.premium === true;
  const levels = (v: unknown): number[] =>
    Array.isArray(v) ? [...new Set(v.map(nat).filter((n) => n >= 1 && n <= BP.levels))] : [];
  out.claimedFree = levels(o.claimedFree);
  out.claimedPremium = levels(o.claimedPremium);
  out.adDay = typeof o.adDay === 'string' ? o.adDay : '';
  out.adUsed = nat(o.adUsed);
  out.stacks = nat(o.stacks);
  if (Array.isArray(o.permanents)) {
    out.permanents = [...new Set(o.permanents.filter((x): x is string => typeof x === 'string' && passPassive(x) !== undefined))];
  }
  if (o.completions && typeof o.completions === 'object') {
    for (const [k, v] of Object.entries(o.completions as Record<string, unknown>)) {
      if (seasonById(k) && nat(v) > 0) out.completions[k] = nat(v);
    }
  }
  return out;
}

/** Coerce a loaded quest record (docs/QUESTS.md): every referenced mission/quest must be REAL
 *  (removed content sanitizes away), progress clamps to 0..target, ledgers dedupe. */
function sanitizeQuests(raw: unknown): SaveData['quests'] {
  const out = defaultQuests();
  if (!raw || typeof raw !== 'object') return out;
  const o = raw as Record<string, unknown>;
  const nat = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  const progress = (v: unknown): Record<string, number> => {
    const p: Record<string, number> = {};
    if (v && typeof v === 'object') {
      for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
        const def = missionById(k);
        if (def && nat(n) > 0) p[k] = Math.min(def.target, nat(n));
      }
    }
    return p;
  };
  const missionIds = (v: unknown): string[] =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && missionById(x) !== undefined))] : [];
  const w = (o.weekly && typeof o.weekly === 'object' ? o.weekly : {}) as Record<string, unknown>;
  out.weekly = { window: nat(w.window), progress: progress(w.progress), claimed: missionIds(w.claimed), completionClaimed: w.completionClaimed === true };
  const m = (o.main && typeof o.main === 'object' ? o.main : {}) as Record<string, unknown>;
  out.main = {
    progress: progress(m.progress), claimed: missionIds(m.claimed),
    completions: Array.isArray(m.completions)
      ? [...new Set(m.completions.filter((x): x is string => typeof x === 'string' && questById(x)?.lane === 'main'))]
      : [],
  };
  if (Array.isArray(o.once)) {
    out.once = [...new Set(o.once.filter((x): x is string => {
      if (typeof x !== 'string') return false;
      const sep = x.indexOf(':');
      if (sep < 0) return false;
      const tag = x.slice(0, sep);
      return (tag === 'cutscene' || tag === 'cosmetic') && questById(x.slice(sep + 1)) !== undefined;
    }))];
  }
  out.missionsDone = missionIds(o.missionsDone);
  if (o.questCompletions && typeof o.questCompletions === 'object') {
    for (const [k, v] of Object.entries(o.questCompletions as Record<string, unknown>)) {
      if (questById(k) && nat(v) > 0) out.questCompletions[k] = nat(v);
    }
  }
  return out;
}

/** PRIME level records (v39, docs/PRIME-STRAINS.md): whole, non-negative, finite — a tampered
 *  import can't fold a NaN/negative multiplier into a run. Unknown keys drop (defaults carry
 *  the roster); levels have no upper cap by design (the ladder is infinite). */
function sanitizePrime<K extends string>(defaults: Record<K, number>, raw: unknown): Record<K, number> {
  const out = { ...defaults };
  if (typeof raw === 'object' && raw !== null) {
    for (const k of Object.keys(defaults) as K[]) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === 'number' && isFinite(v) && v > 0) out[k] = Math.floor(v);
    }
  }
  return out;
}

function withDefaults(data: SaveData): SaveData {
  const d = defaultSave();
  return reconcileSaveProvenance(stripRetired({
    ...d,
    ...data,
    upgrades: { ...data.upgrades },
    towerShards: { ...d.towerShards, ...data.towerShards },
    towerStars: { ...d.towerStars, ...data.towerStars },
    // v38→v39: PRIME levels (docs/PRIME-STRAINS.md) — zero-filled for older saves, values
    // clamped to whole non-negative numbers (a tampered level can't fold a NaN/negative mult).
    towerPrime: sanitizePrime(d.towerPrime, (data as { towerPrime?: unknown }).towerPrime),
    // v4→v5: per-tower fork picks fill empty for a pre-v5 save (⇒ each fork defaults to its
    // first option). Shallow-merge keeps known towers' picks and defaults the rest.
    towerForks: { ...d.towerForks, ...(data.towerForks && typeof data.towerForks === 'object' ? data.towerForks : {}) },
    towerMasteryXp: { ...d.towerMasteryXp, ...data.towerMasteryXp },
    towerKills: { ...d.towerKills, ...data.towerKills }, // v8→v9: additive, zeroed for old saves
    heroShards: { ...d.heroShards, ...data.heroShards },
    heroStars: { ...d.heroStars, ...data.heroStars },
    heroPrime: sanitizePrime(d.heroPrime, (data as { heroPrime?: unknown }).heroPrime),
    // Per-hero ability-fork picks fill empty for a pre-fork save (⇒ each fork defaults to its
    // first option). Shallow-merge keeps known heroes' picks and defaults the rest.
    heroForks: { ...d.heroForks, ...(data.heroForks && typeof data.heroForks === 'object' ? data.heroForks : {}) },
    heroMasteryXp: { ...d.heroMasteryXp, ...data.heroMasteryXp },
    // v8→v9: per-hero ownership stats. Zeroed/empty for a pre-v9 save (deep-filled per hero).
    heroKills: { ...d.heroKills, ...data.heroKills },
    heroFavEquip: { ...d.heroFavEquip, ...(data.heroFavEquip && typeof data.heroFavEquip === 'object' ? data.heroFavEquip : {}) },
    // Resolve the fielded hero through the registry (honors aliases for renamed ids)
    // and fall back to the default if it's unknown — a corrupt/removed id can't crash.
    selectedHero: (heroRegistry.resolve(data.selectedHero) as HeroKind | undefined) ?? d.selectedHero,
    // Conveyor favorite (docs/STRAIN.md §conveyor): must be a real, OWNED kind — a locked
    // favorite (tampered/stale import) falls back to the starter default.
    favoriteTower: sanitizeTowerUnlocked(data).includes(data.favoriteTower as TowerKind) ? (data.favoriteTower as TowerKind) : d.favoriteTower,
    // Hero Slot roster (HEROES.md): resolve each entry through the registry (honors aliases),
    // dedupe, and drop junk. A pre-slot save (no heroLoadout) seeds from the migrated selectedHero
    // so slot 1 carries over unchanged — additive, no data loss.
    heroLoadout: sanitizeLoadout(data.heroLoadout, (heroRegistry.resolve(data.selectedHero) as HeroKind | undefined) ?? d.selectedHero),
    // v13→v14: Hero Collection ownership. Pre-v14 saves grandfather in used heroes (no access lost).
    heroUnlocked: sanitizeHeroUnlocked(data),
    // Tower unlock gate (docs/TOWERS.md §expansion): pre-gate saves grandfather in used towers.
    towerUnlocked: sanitizeTowerUnlocked(data),
    // v14→v15: Adaptation node picks (empty for pre-v15 ⇒ golden-safe).
    adaptation: sanitizeAdaptation((data as { adaptation?: unknown }).adaptation),
    // v25→v26: Phenotypes — empty for older saves (identity look ⇒ golden-safe).
    cosmetics: sanitizeCosmetics((data as { cosmetics?: unknown }).cosmetics),
    contracts: ((): SaveData['contracts'] => {
      const c = (data as { contracts?: { completed?: unknown; perfectWeeks?: unknown; lastPerfect?: unknown } }).contracts;
      return {
        completed: Array.isArray(c?.completed)
          ? [...new Set(c.completed.filter((x): x is string => typeof x === 'string' && /^w\d+:[a-z_]+$/.test(x)))].slice(0, 2000)
          : [],
        perfectWeeks: Math.max(0, Math.floor(Number(c?.perfectWeeks) || 0)),
        lastPerfect: typeof c?.lastPerfect === 'string' && /^w\d+$/.test(c.lastPerfect) ? c.lastPerfect : '',
      };
    })(),
    // v32→v33: Weekly Directives ledger — a bounded {week, progress, claimed}. Absent/garbage
    // on older saves ⇒ an empty board (rebuilds on the next run) ⇒ golden-safe.
    directives: ((): SaveData['directives'] => {
      const raw = (data as { directives?: unknown }).directives as { week?: unknown; progress?: unknown; claimed?: unknown } | undefined;
      const week = typeof raw?.week === 'string' && /^w\d+$/.test(raw.week) ? raw.week : '';
      const progress: Record<string, number> = {};
      if (raw?.progress && typeof raw.progress === 'object') {
        for (const [k, v] of Object.entries(raw.progress as Record<string, unknown>)) {
          if (/^[a-z_]+$/.test(k) && Number.isFinite(Number(v)) && Number(v) > 0) progress[k] = Math.min(1e9, Math.floor(Number(v)));
        }
      }
      const claimed = Array.isArray(raw?.claimed)
        ? [...new Set((raw!.claimed as unknown[]).filter((x): x is string => typeof x === 'string' && /^w\d+:[a-z_]+$/.test(x)))].slice(0, 500)
        : [];
      return { week, progress, claimed };
    })(),
    // v35→v36: the Hive Construction ledger — real organ ids only, tiers clamped to the def.
    hive: ((): SaveData['hive'] => {
      const raw = (data as { hive?: { built?: unknown } }).hive?.built;
      const built: Record<string, number> = {};
      if (raw && typeof raw === 'object') {
        for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
          const def = hiveOrganById(id);
          const tier = Math.floor(Number(v));
          if (def && Number.isFinite(tier) && tier > 0) built[id] = Math.min(tier, def.tiers);
        }
      }
      return { built };
    })(),
    // v36→v37: the Daily Bio-Cache ledger — ISO day key + non-negative ints; best keeps its
    // watermark contract (≥ streak). A forged FUTURE `last` is kept as-is: the claim gate
    // compares day keys lexically, so it self-heals by waiting (the rushStamina convention).
    login: ((): SaveData['login'] => {
      const raw = (data as { login?: unknown }).login as { last?: unknown; streak?: unknown; best?: unknown; lifetime?: unknown } | undefined;
      // A REAL calendar day only (shape + round-trip) — '2027-99-99' would otherwise sit
      // lexically in the future and lock the cache until 2028.
      const shaped = typeof raw?.last === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.last) ? raw.last : '';
      const parsed = shaped ? Date.parse(shaped + 'T00:00:00Z') : NaN;
      const last = Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === shaped ? shaped : '';
      const int = (v: unknown): number => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(1e9, Math.floor(Number(v)))) : 0);
      const streak = int(raw?.streak);
      const lifetime = Math.max(int(raw?.lifetime), streak); // lifetime can never trail the live streak
      // v56: the claimed day's income-scaled Cores line (display-only memory of the grant).
      const incomeCores = int((raw as { incomeCores?: unknown } | undefined)?.incomeCores);
      return { last, streak, best: Math.max(int(raw?.best), streak), lifetime, incomeCores };
    })(),
    // v39→v40: Idle Harvest (docs/IDLE-HARVEST.md). lastCollect: absent/junk/0 seeds to NOW (the
    // clock starts at migration — no retroactive grant); a FUTURE stamp is HELD (frozen accrual
    // is a forged clock's price — meta keeps the live anchor monotone) but clamped to now + the
    // freeze window, so a legitimately wrong device clock self-heals in bounded time. Clamping
    // to NOW here would reopen the collect→rollback→reload farming loop the hold exists to kill.
    // Node levels + the lifetime ledger clamp to whole non-negatives.
    idle: ((): SaveData['idle'] => {
      const raw = (data as { idle?: unknown }).idle as Partial<SaveData['idle']> | undefined;
      const now = Date.now();
      const int = (v: unknown): number => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);
      const stamp = int(raw?.lastCollect);
      const nodes: Record<string, number> = {};
      if (raw?.nodes && typeof raw.nodes === 'object') {
        for (const [k, v] of Object.entries(raw.nodes)) { const n = int(v); if (n > 0) nodes[k] = n; }
      }
      return {
        lastCollect: stamp === 0 ? now : Math.min(stamp, now + IDLE.tamperFreezeMaxHours * 3_600_000),
        nodes,
        lifetimeHours: Math.max(0, Number.isFinite(Number(raw?.lifetimeHours)) ? Number(raw?.lifetimeHours) : 0),
        harvests: int(raw?.harvests),
        lifetimeValue: int(raw?.lifetimeValue),
        bestHours: Math.max(0, Number.isFinite(Number(raw?.bestHours)) ? Number(raw?.bestHours) : 0),
        blooms: int(raw?.blooms),
      };
    })(),
    nemesis: ((): SaveData['nemesis'] => {
      const n = (data as { nemesis?: unknown }).nemesis as { defId?: unknown; slain?: unknown } | null | undefined;
      if (!n || typeof n !== 'object' || typeof n.defId !== 'string') return null;
      const slain = Math.max(1, Math.min(50, Math.floor(Number(n.slain) || 1)));
      return { defId: n.defId, slain };
    })(),
    // v34: the rack. Accept the new array; MIGRATE the old single `equippedTrophy` string into
    // a one-organ rack; drop unknown ids; hard-cap at the max possible slots (tamper ceiling —
    // meta re-clamps to the live slot count on equip/fold).
    equippedTrophies: ((): string[] => {
      const d = data as { equippedTrophies?: unknown; equippedTrophy?: unknown };
      const raw = Array.isArray(d.equippedTrophies)
        ? d.equippedTrophies
        : typeof d.equippedTrophy === 'string' ? [d.equippedTrophy] : [];
      const seen = new Set<string>();
      const out: string[] = [];
      for (const x of raw) {
        if (typeof x === 'string' && !seen.has(x) && trophyById(x)) { seen.add(x); out.push(x); }
      }
      return out.slice(0, TROPHY_SLOT_THRESHOLDS.length);
    })(),
    // v34: the avenged-chassis ledger (vengeance-trophy ownership + rap sheet). Plain strings,
    // deduped, bounded; unknown chassis are inert (no vengeance organ matches them).
    vengeance: Array.isArray((data as { vengeance?: unknown }).vengeance)
      ? [...new Set(((data as { vengeance: unknown[] }).vengeance).filter((x): x is string => typeof x === 'string'))].slice(0, 16)
      : [],
    expeditions: ((): SaveData['expeditions'] => {
      const rawExp = (data as { expeditions?: { active?: unknown; mastery?: unknown } }).expeditions;
      const raw = rawExp?.active;
      // Mastery ledger (v27): keep only known mission ids, whole non-negative counts.
      const mastery: Record<string, number> = {};
      if (rawExp?.mastery && typeof rawExp.mastery === 'object') {
        for (const [k, v] of Object.entries(rawExp.mastery as Record<string, unknown>)) {
          if (expeditionById(k) === undefined) continue;
          const n = Math.max(0, Math.min(100_000, Math.floor(Number(v) || 0)));
          if (n > 0) mastery[k] = n;
        }
      }
      if (!Array.isArray(raw)) return { active: [], mastery };
      const seen = new Set<string>();
      const active = raw
        .filter((e): e is { defId: string; hero: HeroKind; endsAt: number } => {
          const o = e as { defId?: unknown; hero?: unknown; endsAt?: unknown };
          return typeof o.defId === 'string' && expeditionById(o.defId) !== undefined
            && typeof o.hero === 'string' && HERO_ORDER.includes(o.hero as HeroKind)
            && typeof o.endsAt === 'number' && Number.isFinite(o.endsAt);
        })
        .filter((e) => { if (seen.has(e.hero)) return false; seen.add(e.hero); return true; })
        .slice(0, EXPEDITION_SLOTS);
      return { active, mastery };
    })(),
    infestation: ((): SaveData['infestation'] => {
      const raw = (data as { infestation?: { target?: unknown; sectors?: unknown; tierClaims?: unknown; tributeWeeks?: unknown; defenses?: unknown; lastIncursionDay?: unknown } }).infestation;
      const out: SaveData['infestation'] = { target: null, sectors: {}, tierClaims: {}, tributeWeeks: {}, defenses: {}, lastIncursionDay: '' };
      if (!raw || typeof raw !== 'object') return out;
      // A pin may be a sector OR a region id (docs/INFESTATION.md §pins).
      if (typeof raw.target === 'string' && isValidInfestTarget(raw.target)) out.target = raw.target;
      if (raw.sectors && typeof raw.sectors === 'object') {
        for (const [k, v] of Object.entries(raw.sectors as Record<string, unknown>)) {
          if (!ALL_SECTORS.some((x) => x.id === k)) continue;
          const o = v as { level?: unknown; updatedAt?: unknown };
          const level = Math.max(0, Math.min(SECTOR_CAP, Number(o?.level) || 0));
          const updatedAt = Number(o?.updatedAt) || 0;
          if (level > 0) out.sectors[k] = { level, updatedAt };
        }
      }
      // v49 (THE FRONT): claim ledgers — unknown ids drop, tiers clamp to 0..4, the defense
      // ring keeps only the newest 14 day-keys (all it is ever read for is yesterday).
      if (raw.tierClaims && typeof raw.tierClaims === 'object') {
        for (const [k, v] of Object.entries(raw.tierClaims as Record<string, unknown>)) {
          if (!ALL_SECTORS.some((x) => x.id === k)) continue;
          const t = Math.max(0, Math.min(4, Math.floor(Number(v) || 0)));
          if (t > 0) out.tierClaims[k] = t;
        }
      }
      if (raw.tributeWeeks && typeof raw.tributeWeeks === 'object') {
        for (const [k, v] of Object.entries(raw.tributeWeeks as Record<string, unknown>)) {
          if (REGIONS.some((r) => r.id === k) && typeof v === 'string') out.tributeWeeks[k] = v.slice(0, 12);
        }
      }
      if (raw.defenses && typeof raw.defenses === 'object') {
        const entries = Object.entries(raw.defenses as Record<string, unknown>)
          .filter(([, v]) => typeof v === 'string' && ALL_SECTORS.some((x) => x.id === v))
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .slice(-14);
        for (const [k, v] of entries) out.defenses[k.slice(0, 12)] = v as string;
      }
      if (typeof raw.lastIncursionDay === 'string') out.lastIncursionDay = raw.lastIncursionDay.slice(0, 12);
      return out;
    })(),
    stats: mergeStats(d.stats, data.stats),
    achievements: Array.isArray(data.achievements) ? data.achievements : d.achievements,
    equipment: {
      inventory: Array.isArray(data.equipment?.inventory) ? data.equipment.inventory : [],
      // v11→v12: PER-HERO loadouts. A pre-v12 save has one shared `loadout` → migrate it onto the
      // slot-1 hero (its selectedHero) so equipped gear carries over. Sanitized so a uid lives on
      // only ONE hero (a single physical item).
      loadouts: sanitizeLoadouts(data.equipment, (heroRegistry.resolve(data.selectedHero) as HeroKind | undefined) ?? d.selectedHero),
      // v55→v56: the permanent Gear Codex ledger — backfilled from the held inventory.
      discovered: sanitizeDiscovered((data.equipment as { discovered?: unknown } | undefined)?.discovered, Array.isArray(data.equipment?.inventory) ? data.equipment.inventory : []),
    },
    mats: { ...d.mats, ...data.mats },
    // v15→v16: the crafting-material pity counter. Absent on older saves ⇒ 0 (fresh pity).
    matPity: Math.max(0, Math.floor(Number((data as { matPity?: unknown }).matPity) || 0)),
    // v16→v17: the Undo-Salvage buffer. Absent/malformed ⇒ null (nothing to undo).
    lastSalvage: sanitizeLastSalvage((data as { lastSalvage?: unknown }).lastSalvage),
    // v3→v4: a pre-v4 save has no queue — sanitize fills a fresh, pre-determined one;
    // an existing queue is validated (unknown rarities dropped, pity/depth rebuilt).
    lootQueue: sanitizeLootQueue(data.lootQueue),
    // v8: pending unopened containers. Empty for a pre-v8 save; coerce each entry (an early
    // v8 stored bare rarity strings → loot boxes) and cap against a hostile blob.
    pendingContainers: Array.isArray(data.pendingContainers)
      ? data.pendingContainers
          .map((x): PendingContainer | null => {
            if (typeof x === 'string') return { kind: 'loot', rarity: x }; // early-v8 string → loot box
            if (x && typeof x === 'object') {
              const o = x as { kind?: unknown; rarity?: unknown; chestId?: unknown };
              if (o.kind === 'loot' && typeof o.rarity === 'string') return { kind: 'loot', rarity: o.rarity };
              if (o.kind === 'cache' && typeof o.chestId === 'string') return { kind: 'cache', chestId: o.chestId };
            }
            return null;
          })
          .filter((c): c is PendingContainer => c !== null)
          .slice(0, 999)
      : [],
    // v5→v6: mastery identity. Empty for a pre-v6 save; arrays guarded against junk.
    unlockedTitles: Array.isArray(data.unlockedTitles) ? data.unlockedTitles : [],
    equippedTitle: typeof data.equippedTitle === 'string' ? data.equippedTitle : null,
    unlockedLore: Array.isArray(data.unlockedLore) ? data.unlockedLore : [],
    bossesSlain: Array.isArray(data.bossesSlain) ? data.bossesSlain : [],
    // Mega Boss ledger (docs/MEGA-BOSS.md) — zero-filled for old saves (additive).
    megaProgress: sanitizeMegaProgress(data.megaProgress),
    // v6→v7: prestige (MOLT). Zeroed for a pre-v7 save; each field guarded against junk.
    prestige: { ...d.prestige, ...sanitizePrestige(data.prestige) },
    // v9→v10: campaign progression. Empty for an old save; coerce the cleared map to finite ≥0 ints.
    campaign: {
      cleared: sanitizeCleared(data.campaign?.cleared),
      // v20→v21: fastest-clear ledger — empty for older saves (additive).
      bestTime: data.campaign?.bestTime && typeof data.campaign.bestTime === 'object' ? data.campaign.bestTime : {},
    },
    tutorial: sanitizeTutorial(data.tutorial),
    prediction: sanitizePrediction(data.prediction),
    help: sanitizeHelp(data.help),
    director: sanitizeDirector((data as { director?: unknown }).director), // additive: pre-director saves ⇒ empty ledgers
    accountXp: sanitizeAccountXp((data as { accountXp?: unknown }).accountXp), // additive: pre-level saves ⇒ zero XP
    genomeRank: sanitizeGenomeRank((data as { genomeRank?: unknown }).genomeRank), // additive: pre-rank saves ⇒ watermark I
    genes: sanitizeGeneSave(data.genes), // v18: drops unknown/renamed cards + clamps levels (pre-v18 ⇒ {})
    genesDiscovered: sanitizeGenesDiscovered(data as Partial<SaveData>), // v46: starters ∪ touched (migration) → known ids only
    // v18→v19: Starting Gene Loadout. Pre-v19 ⇒ 1 slot, empty loadout; junk ids/duplicates dropped.
    geneSlots: sanitizeGeneSlots((data as { geneSlots?: unknown }).geneSlots),
    geneLoadout: sanitizeGeneLoadout((data as { geneLoadout?: unknown }).geneLoadout),
    // v18: permanent gene currency (pre-v18 ⇒ 0). Unified wallet: a legacy save's `geneOverflow`
    // (the short-lived Mulligan-upgrade currency) folds in 1:1 — one currency now levels Gene
    // Cards AND Mulligan modifiers, and no banked balance is lost.
    geneEssence: Math.max(0, Math.floor(Number((data as { geneEssence?: unknown }).geneEssence) || 0))
      + Math.max(0, Math.floor(Number((data as { geneOverflow?: unknown }).geneOverflow) || 0)),
    // v48 (docs/ECONOMY.md §localized): the two specialized wallets. An ABSENT field on an
    // invested save seeds a working balance from the investment itself (≈ the next purchase's
    // scale), so the currency swap never strands a build mid-ladder; untouched systems — and
    // every fresh account — seed exactly 0 (golden-safe). Present fields just sanitize.
    hiveMaterials: (() => {
      const raw = (data as { hiveMaterials?: unknown }).hiveMaterials;
      if (raw !== undefined) return Math.max(0, Math.floor(Number(raw) || 0));
      const nodes = (data as { idle?: { nodes?: Record<string, unknown> } }).idle?.nodes ?? {};
      const organLevels = Object.values(nodes).reduce<number>((s, v) => s + Math.max(0, Math.floor(Number(v) || 0)), 0);
      return organLevels > 0 ? 60 + 20 * organLevels : 0;
    })(),
    mulliganTissue: (() => {
      const raw = (data as { mulliganTissue?: unknown }).mulliganTissue;
      if (raw !== undefined) return Math.max(0, Math.floor(Number(raw) || 0));
      const mull = (data as { mulligans?: Record<string, { slots?: unknown[] } | null> }).mulligans ?? {};
      let graftLevels = 0;
      for (const st of Object.values(mull)) {
        for (const s of st?.slots ?? []) graftLevels += Math.max(0, Math.floor(Number((s as { level?: unknown } | null)?.level) || 0));
      }
      return graftLevels > 0 ? 25 + 8 * graftLevels : 0;
    })(),
    // v48: banked Bio-Roulette spores (pre-v48 ⇒ 0). Clamped well above ROULETTE.sporeCap so a
    // session cap change never silently burns a bank; negative/junk ⇒ 0.
    bioSpores: Math.max(0, Math.min(999, Math.floor(Number((data as { bioSpores?: unknown }).bioSpores) || 0))),
    // v49: Live Event ledgers (docs/LIVE-EVENTS.md §6). Keys are `eventId:window`; anything
    // not in the CURRENTLY-ACTIVE key set prunes on load — rotation retires state, tokens are
    // use-it-or-lose-it (the anti-inflation contract), and the ledger can never grow unbounded.
    liveEvents: sanitizeLiveEvents((data as { liveEvents?: unknown }).liveEvents),
    // v50→v51: Metabolism ledger — counters floor to ints; claimed clamps in trackView.
    metabolism: sanitizeMetabolism((data as { metabolism?: unknown }).metabolism),
    // v53→v55: Threat ladder records — missing (pre-v55) or junk ⇒ 0 per mode.
    threat: sanitizeThreat((data as { threat?: unknown }).threat),
    // v55→v56: the per-run income ledger — absent ⇒ empty (fills from the next settle).
    income: sanitizeIncome((data as { income?: unknown }).income),
    // v21→v22: Player Profile — identity fields + the milestone timeline (pre-v22 ⇒ defaults;
    // createdAt stays 0 until the first settle stamps it).
    createdAt: Math.max(0, Math.floor(Number((data as { createdAt?: unknown }).createdAt) || 0)),
    profileName: typeof (data as { profileName?: unknown }).profileName === 'string' && ((data as { profileName?: unknown }).profileName as string).trim().length > 0
      ? ((data as { profileName?: unknown }).profileName as string).slice(0, 24)
      : d.profileName,
    profileFrame: typeof (data as { profileFrame?: unknown }).profileFrame === 'string' ? ((data as { profileFrame?: unknown }).profileFrame as string) : d.profileFrame,
    // Commissioning sigil (docs/PROFILE.md §commissioning) — additive; null for older saves.
    profileSigil: typeof (data as { profileSigil?: unknown }).profileSigil === 'string' ? ((data as { profileSigil?: unknown }).profileSigil as string) : null,
    patchNotes: ((): SaveData['patchNotes'] => {
      const raw = (data as { patchNotes?: { seen?: unknown; optOut?: unknown } }).patchNotes;
      return {
        seen: typeof raw?.seen === 'string' ? raw.seen.slice(0, 32) : '',
        optOut: raw?.optOut === true,
      };
    })(),
    timeline: sanitizeTimeline((data as { timeline?: unknown }).timeline),
    powerLog: sanitizePowerLog((data as { powerLog?: unknown }).powerLog),
    antigen: Math.max(0, Math.floor(Number((data as { antigen?: unknown }).antigen) || 0)),
    // Splice Market (docs/MARKET.md): pre-market saves ⇒ 0 Ichor + a fresh window record.
    ichor: Math.max(0, Math.floor(Number((data as { ichor?: unknown }).ichor) || 0)),
    // Boss Rush records (docs/BOSS-RUSH.md): pre-rush saves ⇒ 0 (additive).
    rushBestWave: Math.max(0, Math.floor(Number((data as { rushBestWave?: unknown }).rushBestWave) || 0)),
    rushBestBoss: Math.max(0, Math.floor(Number((data as { rushBestBoss?: unknown }).rushBestBoss) || 0)),
    rushLegacyBestBoss: Math.max(0, Math.floor(Number((data as { rushLegacyBestBoss?: unknown }).rushLegacyBestBoss) || 0)),
    rushStamina: sanitizeRushStamina((data as { rushStamina?: unknown }).rushStamina),
    // Daily Run ledger (docs/DAILY-RUN.md): pre-daily saves ⇒ a fresh ledger (additive).
    research: sanitizeResearch((data as { research?: unknown }).research),
    daily: sanitizeDaily((data as { daily?: unknown }).daily),
    // Premium Store ledger (docs/PREMIUM-STORE.md): pre-store saves ⇒ a fresh ledger (additive).
    premium: sanitizePremium((data as { premium?: unknown }).premium),
    lifetimeIchor: Math.max(0, Math.floor(Number((data as { lifetimeIchor?: unknown }).lifetimeIchor) || 0)),
    market: sanitizeMarket((data as { market?: unknown }).market),
    ichorExchange: ((): SaveData['ichorExchange'] => {
      const raw = (data as { ichorExchange?: { window?: unknown; reserve?: unknown; bought?: unknown } }).ichorExchange;
      return {
        window: Math.max(0, Math.floor(Number(raw?.window) || 0)),
        reserve: Math.max(0, Math.floor(Number(raw?.reserve) || 0)),
        bought: Array.isArray(raw?.bought)
          ? [...new Set(raw.bought.filter((x): x is number => Number.isInteger(x) && x >= 0 && x < 6))]
          : [],
      };
    })(),
    // Mulligan system (docs/MULLIGANS.md): pre-v26 saves ⇒ empty organisms + empty dex.
    mulligans: sanitizeMulligans((data as { mulligans?: unknown }).mulligans),
    mulliganDex: sanitizeMulliganDex((data as { mulliganDex?: unknown }).mulliganDex),
    nucleus: sanitizeNucleus((data as { nucleus?: unknown }).nucleus),
    heroSymbiotes: sanitizeHeroSymbiotes((data as { heroSymbiotes?: unknown }).heroSymbiotes),
    classBonds: sanitizeClassBonds((data as { classBonds?: unknown }).classBonds), // v58 (absent ⇒ {})
    masteryEvolution: sanitizeMasteryEvolution((data as { masteryEvolution?: unknown }).masteryEvolution),
    wardrobe: sanitizeWardrobe((data as { wardrobe?: unknown }).wardrobe),
    battlePass: sanitizeBattlePass((data as { battlePass?: unknown }).battlePass),
    quests: sanitizeQuests((data as { quests?: unknown }).quests),
    // v46→v47: Arena season record (docs/ARENA.md) — absent on older saves ⇒ a fresh, inert record.
    arena: sanitizeArena((data as { arena?: unknown }).arena),
    // v46→v47: provenance stamps are shape-checked here; ownership reconciliation (the
    // self-heal guaranteeing every owned tradable carries a stamp) runs AFTER the object
    // assembles, below — it needs the sanitized inventory/wardrobe/gene sets.
    provenance: sanitizeProvenanceLedger((data as { provenance?: unknown }).provenance),
  }));
}

/** v47 Arena record (docs/ARENA.md): whole non-negative ints, bounded arrays, placements
 *  clamped to the placement count, exclusives/settled ids deduped. A junk blob degrades to a
 *  fresh inert record — never crashes, never mints rating. */
function sanitizeArena(raw: unknown): ArenaSave {
  const d = defaultArenaSave();
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Partial<ArenaSave>;
  const int = (v: unknown, cap = 1e9): number => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 0 ? Math.min(n, cap) : 0;
  };
  const strs = (v: unknown, cap: number): string[] =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length <= 64))].slice(-cap) : [];
  const levels = (v: unknown): number[] =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is number => Number.isInteger(x) && x >= 1 && x <= 100))] : [];
  const history: ArenaSave['history'] = [];
  if (Array.isArray(o.history)) {
    for (const h of o.history) {
      if (!h || typeof h !== 'object') continue;
      const e = h as Partial<ArenaSave['history'][number]>;
      if (!Number.isInteger(e.season) || (e.season as number) < 1) continue;
      history.push({
        season: e.season as number,
        rating: int(e.rating, 20_000),
        division: typeof e.division === 'string' ? e.division.slice(0, 24) : '',
        wins: int(e.wins, 100_000),
        losses: int(e.losses, 100_000),
      });
    }
  }
  return {
    season: int(o.season, 10_000),
    rating: int(o.rating, 20_000),
    peak: Math.max(int(o.peak, 20_000), int(o.rating, 20_000)), // peak can never trail the live rating
    wins: int(o.wins, 100_000),
    losses: int(o.losses, 100_000),
    lifetimeWins: Math.max(int(o.lifetimeWins, 1e9), int(o.wins, 100_000)),
    lifetimeLosses: Math.max(int(o.lifetimeLosses, 1e9), int(o.losses, 100_000)),
    placements: Math.min(int(o.placements, ARENA.placementMatches), ARENA.placementMatches),
    streak: int(o.streak, 100_000),
    lastPlayedAt: int(o.lastPlayedAt, 4_102_444_800_000), // epoch ms — capped at year 2100 (a forged future stamp can only DELAY decay's grace window, never mint)
    passXp: int(o.passXp, 1e6),
    passPremium: o.passPremium === true,
    passClaimedFree: levels(o.passClaimedFree),
    passClaimedPremium: levels(o.passClaimedPremium),
    exclusives: strs(o.exclusives, 16),
    history: history.slice(-ARENA_HISTORY_CAP),
    settledMatchIds: strs(o.settledMatchIds, ARENA_SETTLED_CAP),
  };
}

/** v47 provenance self-heal (docs/TRADING-PREP.md §coverage): every owned tradable gets a
 *  stamp (`legacy` when its true origin predates the ledger), dead equipment stamps prune.
 *  Runs on EVERY load so coverage is an invariant, not a discipline. */
function reconcileSaveProvenance(save: SaveData): SaveData {
  save.provenance = reconcileProvenance(save.provenance, {
    equipmentUids: save.equipment.inventory.map((i) => i.uid),
    cosmeticIds: [...save.wardrobe.owned, ...save.cosmetics.owned],
    geneCardIds: save.genesDiscovered,
    mulliganPieceIds: Object.keys(save.mulliganDex),
    cosmeticInstanceUids: save.wardrobe.inventory.map((i) => i.uid), // v53 unclaimed vault
  });
  return save;
}

/** Retired top-level fields a legacy blob may still carry (they ride in through the `...data`
 *  spread). Each was migrated into a live field above (geneOverflow → geneEssence), so the stale
 *  key is stripped to keep re-serialized saves clean. */
const RETIRED_FIELDS = ['geneOverflow'] as const;
function stripRetired(save: SaveData): SaveData {
  for (const k of RETIRED_FIELDS) delete (save as unknown as Record<string, unknown>)[k];
  return save;
}

/** Coerce a loaded timeline into valid, capped shape (newest LAST preserved). */
const TIMELINE_CAP = 60;
function sanitizeTimeline(raw: unknown): TimelineEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: TimelineEvent[] = [];
  for (const e of raw) {
    if (typeof e !== 'object' || e === null) continue;
    const o = e as Partial<TimelineEvent>;
    if (typeof o.at !== 'number' || typeof o.label !== 'string') continue;
    out.push({ at: o.at, icon: typeof o.icon === 'string' ? o.icon : '◈', label: o.label.slice(0, 80) });
  }
  return out.slice(-TIMELINE_CAP);
}

/** Power-history ledger cap — ~a quarter of daily entries (docs/POWER-SCORE.md §history). */
export const POWER_LOG_CAP = 90;

function sanitizePowerLog(raw: unknown): { day: string; score: number }[] {
  if (!Array.isArray(raw)) return [];
  const out: { day: string; score: number }[] = [];
  for (const e of raw) {
    if (typeof e !== 'object' || e === null) continue;
    const o = e as Partial<{ day: string; score: number }>;
    if (typeof o.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.day)) continue;
    const score = Math.floor(Number(o.score) || 0);
    if (score <= 0) continue;
    out.push({ day: o.day, score });
  }
  out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  return out.slice(-POWER_LOG_CAP);
}

/** Append a milestone to the timeline (pure; newest LAST, capped). The meta layer calls this
 *  at the moments that matter (settle records, releases, molts, achievements). */
export function pushTimeline(list: TimelineEvent[], icon: string, label: string): TimelineEvent[] {
  return [...list, { at: Date.now(), icon, label }].slice(-TIMELINE_CAP);
}

/** Coerce loaded equipment into PER-HERO loadouts (v12). Resolves hero aliases and guarantees a uid
 *  is equipped on at most one hero. Migrates a legacy single `loadout` onto `slot1`. */
function sanitizeLoadouts(equip: unknown, slot1: HeroKind): Partial<Record<HeroKind, Loadout>> {
  const out: Partial<Record<HeroKind, Loadout>> = {};
  const used = new Set<string>(); // a physical item lives on only ONE hero
  const take = (raw: unknown): Loadout => {
    const l = (raw && typeof raw === 'object' ? raw : {}) as Partial<Loadout>;
    const pick = (v: unknown): string | null => (typeof v === 'string' && !used.has(v) ? (used.add(v), v) : null);
    return { weapon: pick(l.weapon), armor: pick(l.armor), relic: pick(l.relic) };
  };
  const e = equip as { loadouts?: Record<string, unknown>; loadout?: unknown } | undefined;
  if (e?.loadouts && typeof e.loadouts === 'object') {
    for (const [k, v] of Object.entries(e.loadouts)) {
      const kind = heroRegistry.resolve(k) as HeroKind | undefined;
      if (kind) out[kind] = take(v);
    }
  } else if (e?.loadout) {
    out[slot1] = take(e.loadout); // legacy single loadout → the slot-1 hero
  }
  return out;
}

/** Coerce a loaded hero-loadout array into known, DISTINCT hero kinds (aliases resolved).
 *  Empty / all-junk → the fallback (slot-1) hero, so a run always has at least one hero. */
function sanitizeLoadout(raw: unknown, fallback: HeroKind): HeroKind[] {
  const out: HeroKind[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw)) {
    for (const x of raw) {
      const k = heroRegistry.resolve(typeof x === 'string' ? x : '') as HeroKind | undefined;
      if (k && !seen.has(k)) { out.push(k); seen.add(k); }
    }
  }
  if (out.length === 0) out.push(fallback);
  return out;
}

/** Coerce a loaded campaign `cleared` map into clean non-negative integers (drops junk). */
function sanitizeCleared(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = Math.floor(v);
    }
  }
  return out;
}

/** Coerce a loaded prestige blob into clean non-negative numbers (drops junk fields). */
function sanitizePrestige(p: PrestigeState | undefined): Partial<PrestigeState> {
  if (!p || typeof p !== 'object') return {};
  const num = (v: unknown): number | undefined => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : undefined);
  const out: Partial<PrestigeState> = {};
  if (num(p.cells) !== undefined) out.cells = p.cells;
  if (num(p.lifetimeCells) !== undefined) out.lifetimeCells = p.lifetimeCells;
  if (num(p.cycleShards) !== undefined) out.cycleShards = p.cycleShards;
  if (num(p.molts) !== undefined) out.molts = p.molts;
  // Ascendant Tree node levels: keep only finite non-negative integer levels.
  if (p.nodes && typeof p.nodes === 'object') {
    const nodes: Record<string, number> = {};
    for (const [k, v] of Object.entries(p.nodes)) if (num(v) !== undefined) nodes[k] = Math.floor(v as number);
    out.nodes = nodes;
  }
  // v35: armed Molt Vows — real vow ids only, deduped, capped at the arm limit (docs/VOWS.md).
  if (Array.isArray(p.vows)) {
    out.vows = [...new Set(p.vows.filter((x): x is string => typeof x === 'string' && vowById(x) !== undefined))].slice(0, MAX_VOWS);
  }
  return out;
}

/** Fill a (possibly absent / partial) stats block onto the zeroed default — the
 * v2→v3 upgrade path: a pre-stats save simply gains a zeroed stats block. */
function mergeStats(base: LifetimeStats, s: LifetimeStats | undefined): LifetimeStats {
  if (!s || typeof s !== 'object') return base;
  return {
    ...base,
    ...s,
    uniqueCards: Array.isArray(s.uniqueCards) ? s.uniqueCards : base.uniqueCards,
    killsByEnemy: { ...base.killsByEnemy, ...s.killsByEnemy },
    towerUsage: { ...base.towerUsage, ...s.towerUsage },
    heroUsage: { ...base.heroUsage, ...s.heroUsage },
    // v19→v20: per-tower damage/best-wave ledgers — zeroed for older saves (additive).
    towerDamage: { ...base.towerDamage, ...s.towerDamage },
    towerBestWave: { ...base.towerBestWave, ...s.towerBestWave },
    // Strain ledgers (docs/STRAIN.md §7) — zeroed for older saves (additive; scalars ride the spread).
    towerBestStrain: { ...base.towerBestStrain, ...s.towerBestStrain },
    // v21→v22: profile ledgers — zeroed/empty for older saves (additive).
    doctrineRuns: { ...base.doctrineRuns, ...s.doctrineRuns },
    // Doctrine mastery ledgers (docs/DOCTRINES.md §mastery) — empty for older saves (additive).
    doctrineWins: { ...base.doctrineWins, ...s.doctrineWins },
    doctrineBestWave: { ...base.doctrineBestWave, ...s.doctrineBestWave },
    cardDrafts: { ...base.cardDrafts, ...s.cardDrafts },
  };
}

/** Boss Rush stamina: numeric clamps + a plausible ISO day key; pre-stamina saves start FULL. */
function sanitizeRushStamina(raw: unknown): SaveData['rushStamina'] {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, d: number): number => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    value: Math.max(0, Math.min(120, Math.floor(num(o.value, 100)))),
    updatedAt: Math.max(0, Math.floor(num(o.updatedAt, 0))),
    freeDay: typeof o.freeDay === 'string' ? o.freeDay.slice(0, 10) : '',
  };
}

/** Coerce a loaded Field Research ledger (docs/RESEARCH.md) — fresh for pre-v24 saves.
 *  Unknown reward ids are kept in counters (harmless, day-scoped) but pendingBoosts are
 *  id-checked lazily at consumption (meta), so junk can never arm anything. */
function sanitizeResearch(raw: unknown): SaveData['research'] {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const counts = (v: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    if (typeof v === 'object' && v !== null) {
      for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
        const c = Math.max(0, Math.floor(Number(n) || 0));
        if (c > 0 && k.length <= 64) out[k] = c;
      }
    }
    return out;
  };
  const lt = (typeof o.lifetime === 'object' && o.lifetime !== null ? o.lifetime : {}) as Record<string, unknown>;
  return {
    day: typeof o.day === 'string' ? o.day.slice(0, 10) : '',
    claims: counts(o.claims),
    pendingBoosts: Array.isArray(o.pendingBoosts)
      ? o.pendingBoosts.filter((b): b is string => typeof b === 'string' && b.length <= 64).slice(0, 8)
      : [],
    lifetime: { views: Math.max(0, Math.floor(Number(lt.views) || 0)), claims: counts(lt.claims) },
  };
}

/** Coerce a loaded Daily Run ledger (docs/DAILY-RUN.md) — a fresh ledger for pre-daily saves. */
function sanitizeDaily(raw: unknown): SaveData['daily'] {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown): number => Math.max(0, Math.floor(Number.isFinite(Number(v)) ? Number(v) : 0));
  const key = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 10) : '');
  return {
    lastKey: key(o.lastKey),
    lastWave: num(o.lastWave),
    bestWave: num(o.bestWave),
    completions: num(o.completions),
    streak: num(o.streak),
    rewardedKey: key(o.rewardedKey),
    // v25: today's best-run replay blob — a bounded string or nothing (pre-v25 saves: null).
    lastReplay: typeof o.lastReplay === 'string' && o.lastReplay.length <= 300_000 ? o.lastReplay : null,
  };
}

/** Coerce a loaded Premium Store ledger (docs/PREMIUM-STORE.md) — fresh for pre-store saves. */
function sanitizePremium(raw: unknown): SaveData['premium'] {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const purchases: Record<string, number> = {};
  if (typeof o.purchases === 'object' && o.purchases !== null) {
    for (const [k, v] of Object.entries(o.purchases as Record<string, unknown>)) {
      const n = Math.max(0, Math.floor(Number(v) || 0));
      if (n > 0) purchases[k] = n;
    }
  }
  const key = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 10) : '');
  // v23: verified-purchase ledger — receipt ids are bounded strings, capped in count (the
  // oldest fall off; the SERVER's fulfillments table remains the permanent record).
  const claimedReceipts = Array.isArray(o.claimedReceipts)
    ? o.claimedReceipts.filter((r): r is string => typeof r === 'string' && r.length > 0 && r.length <= 200).slice(-200)
    : [];
  const pc = (typeof o.pendingCheckout === 'object' && o.pendingCheckout !== null ? o.pendingCheckout : null) as
    | { offerId?: unknown; sessionId?: unknown; startedAt?: unknown }
    | null;
  const pendingCheckout =
    pc && typeof pc.offerId === 'string' && typeof pc.sessionId === 'string' && pc.sessionId.length <= 200
      ? { offerId: pc.offerId.slice(0, 64), sessionId: pc.sessionId, startedAt: Math.max(0, Number(pc.startedAt) || 0) }
      : null;
  // v42: flash-sale ledger — bounded ids, timestamps coerced; junk slots simply drop
  // (a lost slot re-anchors at next sight — never a lost purchase, purchases live above).
  const flash: SaveData['premium']['flash'] = {};
  if (typeof o.flash === 'object' && o.flash !== null) {
    for (const [k, v] of Object.entries(o.flash as Record<string, unknown>)) {
      if (k.length === 0 || k.length > 64 || typeof v !== 'object' || v === null) continue;
      const s = v as { shownAt?: unknown; dismissed?: unknown };
      const slot: SaveData['premium']['flash'][string] = {};
      const at = Number(s.shownAt);
      if (Number.isFinite(at) && at > 0) slot.shownAt = at;
      if (s.dismissed === true) slot.dismissed = true;
      if (slot.shownAt !== undefined || slot.dismissed) flash[k] = slot;
    }
  }
  return {
    purchases,
    lastRotatingBuyKey: key(o.lastRotatingBuyKey),
    seenKey: key(o.seenKey),
    totalSpentUsd: Math.max(0, Number(o.totalSpentUsd) || 0),
    claimedReceipts,
    pendingCheckout,
    flash,
    lastFlashShownAt: Math.max(0, Number(o.lastFlashShownAt) || 0),
  };
}

/** Small, stable, non-cryptographic hash (djb2) for integrity detection. */
function checksum(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function isSaveData(v: unknown): v is SaveData {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.shards === 'number' &&
    typeof o.upgrades === 'object' &&
    o.upgrades !== null &&
    typeof o.bestWave === 'number' &&
    typeof o.totalRuns === 'number' &&
    typeof o.lifetimeShards === 'number' &&
    typeof o.cardsSeen === 'number'
  );
}

/** Ordered migrations v(n) -> v(n+1). Append-only; never remove old steps. */
function migrate(version: number, data: unknown): unknown {
  // v1→v2 (tower progression), v2→v3 (hero progression + roster, lifetime stats +
  // achievements), v3→v4 (loot queue), v4→v5 (tower star-fork picks), and v5→v6 (mastery
  // identity: titles/lore) — plus v8→v9 (per-tower lifetime kills) and v9→v10 (campaign progression) — are all additive: withDefaults() deep-fills the new records, the
  // selectedHero default, the stats block, the loot queue, the fork picks, the mastery
  // identity arrays, and the prestige block (v6→v7; v7→v8 adds the Ascendant Tree node map,
  // deep-filled by sanitizePrestige). v8→v9 adds per-hero kills + favorite-equipment, deep-filled
  // by withDefaults. Structural changes add steps here.
  // v55→v56: the Boss Rush record epoch (docs/BOSS-RUSH.md §epoch) — archive the pre-wall
  // single-run record and restart it. Runs once: a v56 blob never re-enters this step.
  let out = data;
  if (version < 56 && typeof out === 'object' && out !== null) {
    const o = out as { rushBestBoss?: unknown; rushLegacyBestBoss?: unknown };
    const old = Math.max(0, Math.floor(Number(o.rushBestBoss) || 0));
    if (old > 0) out = { ...o, rushBestBoss: 0, rushLegacyBestBoss: Math.max(old, Math.floor(Number(o.rushLegacyBestBoss) || 0)) };
  }
  // v56→v57: the first-hour pass (docs/PROGRESSION-GATING.md §announcements) turns the Tower Lab, Hero
  // Hall and Infinite lessons from always-known rows into briefings that announce when their screen
  // opens (carrying the guided "Show me ▸"). A player who already MET a screen (its reveal is latched in
  // director.revealed — or, for a pre-director save that has played, all of them) gets that lesson
  // archived, so a veteran never sees a "Towers — new system" card; a screen not yet reached still
  // briefs and guides on arrival. Runs once.
  if (version < 57 && typeof out === 'object' && out !== null) {
    const o = out as { totalRuns?: unknown; help?: { seen?: unknown }; director?: { revealed?: unknown } };
    const latched = o.director && typeof o.director.revealed === 'object' && o.director.revealed !== null ? Object.keys(o.director.revealed) : [];
    const played = (Number(o.totalRuns) || 0) >= 1;
    const met = V57_WING_LESSONS.filter(([wing]) => latched.includes(wing) || (latched.length === 0 && played)).map(([, lesson]) => lesson);
    if (met.length > 0 && o.help && typeof o.help === 'object') {
      const seen = Array.isArray(o.help.seen) ? (o.help.seen as unknown[]).filter((x): x is string => typeof x === 'string') : [];
      out = { ...o, help: { ...o.help, seen: Array.from(new Set([...seen, ...met])) } };
    }
  }
  // v57→v58: Class Bonds (docs/CLASS-BONDS.md) — additive `classBonds` levels; the sanitizer turns an
  // absent field into {} (no levels), so there is nothing to rewrite. The bump exists so an OLDER
  // client refuses a v58 save instead of loading it and dropping the bond levels on its next write.
  return out;
}
/** [screen, lesson] pairs whose lesson stopped being always-known at v57 (see migrate). */
const V57_WING_LESSONS: readonly [string, string][] = [['towers', 'towers'], ['heroes', 'heroes'], ['infinite', 'infinite']];

function blobString(data: SaveData): string {
  const body = JSON.stringify(data);
  const blob: SaveBlob = { schemaVersion: CURRENT_VERSION, data, checksum: checksum(body) };
  return JSON.stringify(blob);
}

/** Parse a stored blob string into validated SaveData, or null if invalid/corrupt. */
function parseBlob(raw: string | null): SaveData | null {
  if (!raw) return null;
  try {
    const blob = JSON.parse(raw) as SaveBlob;
    if (typeof blob.schemaVersion !== 'number' || typeof blob.checksum !== 'string') return null;
    if (checksum(JSON.stringify(blob.data)) !== blob.checksum) return null; // tamper/corruption
    const migrated = migrate(blob.schemaVersion, blob.data);
    if (!isSaveData(migrated)) return null;
    return withDefaults(migrated);
  } catch {
    return null;
  }
}

// ── Export / import (pure; usable without a SaveStore, e.g. in tests) ────────

interface SaveExport {
  app: 'ASSIMILATION';
  kind: 'save-export';
  schemaVersion: number;
  exportedAt: string;
  data: SaveData;
  checksum: string;
}

export function serializeExport(data: SaveData): string {
  const exp: SaveExport = {
    app: 'ASSIMILATION',
    kind: 'save-export',
    schemaVersion: CURRENT_VERSION,
    exportedAt: new Date().toISOString(),
    data,
    checksum: checksum(JSON.stringify(data)),
  };
  return JSON.stringify(exp, null, 2);
}

/** Lenient import: accepts an export wrapper, a raw blob, or a bare SaveData object.
 * Hand-edited files are fine — the checksum is recomputed on save, not enforced here. */
export function parseImport(text: string): ImportResult {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: 'File is not valid JSON.' };
  }
  if (typeof obj !== 'object' || obj === null) return { ok: false, error: 'File is not a save object.' };
  const o = obj as Record<string, unknown>;
  const version = typeof o.schemaVersion === 'number' ? o.schemaVersion : CURRENT_VERSION;
  const raw = 'data' in o ? o.data : o; // wrapper/blob -> .data, else the object itself
  const migrated = migrate(version, raw);
  if (!isSaveData(migrated)) return { ok: false, error: 'File does not contain a recognizable save.' };
  return { ok: true, data: withDefaults(migrated) };
}

function memoryStorage(): StorageLike {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, val) => void m.set(k, val),
    removeItem: (k) => void m.delete(k),
  };
}

/** Session-scoped driver (docs/ACCOUNTS.md §guest-mode): survives reloads within the tab,
 *  dies with the browser session — the Guest Mode tryout's home. Memory fallback elsewhere. */
export function sessionStorageLike(): StorageLike {
  return typeof sessionStorage !== 'undefined' ? (sessionStorage as StorageLike) : memoryStorage();
}

/** The durable default driver (what the zero-arg constructor picks). */
export function durableStorageLike(): StorageLike {
  return typeof localStorage !== 'undefined' ? (localStorage as StorageLike) : memoryStorage();
}

export class SaveStore {
  private storage: StorageLike;
  private bakSeq = 0;

  constructor(storage?: StorageLike) {
    this.storage =
      storage ??
      (typeof localStorage !== 'undefined' ? (localStorage as StorageLike) : memoryStorage());
  }

  /** Re-point the store at a different driver (Guest Mode enter/convert — docs/ACCOUNTS.md
   *  §guest-mode). `purgePrevious` removes the main save key from the OLD driver so a tryout
   *  leaves no durable residue (enter) and a conversion leaves no stale session copy (commit).
   *  The caller re-saves the live snapshot right after, so no data rides only on the old driver. */
  swapStorage(next: StorageLike, opts?: { purgePrevious?: boolean }): void {
    if (opts?.purgePrevious) {
      try { this.storage.removeItem(SAVE_KEY); } catch { /* old driver unavailable */ }
    }
    this.storage = next;
  }

  private get(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }

  private set(key: string, value: string): boolean {
    try {
      this.storage.setItem(key, value);
      return true;
    } catch {
      /* storage full/unavailable — fail soft */
      return false;
    }
  }

  /** Load the main save; recover from the newest valid backup, else clean defaults. */
  load(): SaveData {
    const main = parseBlob(this.get(SAVE_KEY));
    if (main) return main;
    for (const b of this.listBackups()) {
      const recovered = parseBlob(this.get(BAK_PREFIX + b.id));
      if (recovered) return recovered;
    }
    return defaultSave();
  }

  save(data: SaveData): void {
    this.set(SAVE_KEY, blobString(data));
  }

  /** Snapshot the current main save into the rolling backup ring. */
  backup(): BackupMeta | null {
    const raw = this.get(SAVE_KEY);
    if (!raw || !parseBlob(raw)) return null;
    const meta: BackupMeta = {
      id: `${Date.now().toString(36)}-${(this.bakSeq++).toString(36)}`,
      at: new Date().toISOString(),
    };
    if (!this.set(BAK_PREFIX + meta.id, raw)) return null;
    const previous = this.listBackups();
    const list = [meta, ...previous].slice(0, MAX_BACKUPS);
    // Publish the index before pruning: a failed write must not destroy older snapshots.
    if (!this.set(BAK_INDEX, JSON.stringify(list))) {
      this.remove(BAK_PREFIX + meta.id);
      return null;
    }
    const kept = new Set(list.map((b) => b.id));
    for (const old of previous) {
      if (!kept.has(old.id)) this.remove(BAK_PREFIX + old.id);
    }
    return meta;
  }

  listBackups(): BackupMeta[] {
    try {
      const raw = this.get(BAK_INDEX);
      if (!raw) return [];
      const list = JSON.parse(raw) as BackupMeta[];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  restoreBackup(id: string): SaveData | null {
    const data = parseBlob(this.get(BAK_PREFIX + id));
    if (!data) return null;
    this.save(data);
    return data;
  }

  /** Wipe the main save (does NOT touch backups). */
  reset(): void {
    this.remove(SAVE_KEY);
  }

  /** Developer Reset "EVERYTHING" (docs/DEV-RESET.md §3): remove the main save, EVERY backup, and
   *  the backup index — a clean slate in this store's keyspace. (Prefs/flags are wiped by meta.) */
  wipeAll(): void {
    for (const b of this.listBackups()) this.remove(BAK_PREFIX + b.id);
    this.remove(BAK_INDEX);
    this.remove(SAVE_KEY);
  }

  private remove(key: string): void {
    try {
      this.storage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}
