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
import { cosmeticById } from '../core/cosmetics';
import { trophyById, TROPHY_SLOT_THRESHOLDS } from '../core/trophies';
import { vowById, MAX_VOWS } from '../core/vows';
import { hiveOrganById } from '../core/hiveOrgans';
import { expeditionById, EXPEDITION_SLOTS } from '../core/expeditions';
import { ALL_SECTORS, SECTOR_CAP, isValidInfestTarget } from '../core/infestation';
import type { PrestigeState } from '../core/prestige';
import { sanitizeProgress } from '../core/tutorial';
import type { TutorialProgress } from '../core/tutorial';
import { defaultCalib } from '../core/predict';
import type { PredictCalib } from '../core/predict';
import { adaptNode } from '../core/adaptation';
import { sanitizeGeneSave } from '../core/geneCards';
import { sanitizeGeneLoadout, sanitizeGeneSlots } from '../core/geneLoadout';
import type { GeneSave } from '../core/geneCards';
import { MULLIGAN_RARITY, MULLIGAN_SLOTS, emptyMulligan, levelCap, mulliganRegistry } from '../core/mulligan';
import { emptyNucleus, sanitizeNucleus } from '../core/nucleus';
import type { NucleusState } from '../core/nucleus';
import { sanitizeHeroSymbiotes } from '../core/heroSymbiote';
import type { HeroSymbioteState } from '../core/heroSymbiote';
import { reforgeModById } from '../core/mulliganReforge';
import type { MulliganRarity, MulliganSlot, MulliganState } from '../core/mulligan';
import { starterItems, wardrobeItem, wardrobeMilestone, WARDROBE_KINDS } from '../core/wardrobe';
import type { WardrobeKind } from '../core/wardrobe';
import { BP, passPassive, seasonById } from '../core/battlePass';
import { missionById, questById } from '../core/quests';

export interface SaveData {
  shards: number;
  upgrades: Record<string, number>; // upgradeId -> level
  bestWave: number;
  // ── Boss Rush records (docs/BOSS-RUSH.md) — additive; 0 for older saves ──
  rushBestWave: number; // deepest Boss Rush wave reached (reward-qualify gate + prediction floor)
  rushBestBoss: number; // most bosses defeated in a SINGLE rush run (the lifetime-record band base)
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
  //    (NEVER reset — collections/titles/Genome Rank ride it). ──
  login: { last: string; streak: number; best: number; lifetime: number };
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
  infestation: { target: string | null; sectors: Record<string, { level: number; updatedAt: number }> };
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
  equipment: { inventory: OwnedItem[]; loadouts: Partial<Record<HeroKind, Loadout>> };
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
  //    highest rank index already celebrated and paid. Additive; golden-safe. ──
  genomeRank: { celebrated: number };
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
  //    equip gate + Collections/Achievements source. Modifier upgrades spend `geneEssence` — the SAME
  //    currency Gene Cards level with (unified; the retired `geneOverflow` wallet folds into it on load).
  //    All additive: pre-v26 saves default empty Mulligans + empty dex. ──
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
  // ── Mastery Evolution Tracks (v44, docs/MASTERY.md §evolution track) — per-unit CLAIM state
  //    for the procedural reward tracks (core/masteryEvolution.ts): claimedUpTo = highest track
  //    level fully claimed THIS loop, prestige = completed loops. Sparse map keyed
  //    'tower:<kind>' / 'hero:<kind>'; {} ⇒ nothing claimed. Purely additive — migration grants
  //    nothing retroactively (a veteran's first visit is a celebration, not a side-effect).
  masteryEvolution: Record<string, { claimedUpTo: number; prestige: number }>;
  // ── Wardrobe (v31, docs/COSMETICS.md §wardrobe) — account cosmetics beyond unit Phenotypes:
  //    owned item ids (starter rows seeded on load), ONE equipped id per kind ({} = classic
  //    look everywhere ⇒ golden-safe), favorites + seen (NEW badges), claimed cosmetic
  //    milestones, and the unlock-ceremony queue (persisted so run-end unlocks survive reload). ──
  wardrobe: {
    owned: string[];
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

/** v44 Mastery Evolution claim state: clamp claimedUpTo into the 0..100 loop window and
 *  prestige to a non-negative int — junk entries drop to a fresh track, never crash. */
function sanitizeMasteryEvolution(raw: unknown): Record<string, { claimedUpTo: number; prestige: number }> {
  const out: Record<string, { claimedUpTo: number; prestige: number }> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const rec = v as { claimedUpTo?: unknown; prestige?: unknown };
    const claimedUpTo = Math.max(0, Math.min(100, Math.floor(Number(rec.claimedUpTo) || 0)));
    const prestige = Math.max(0, Math.floor(Number(rec.prestige) || 0));
    out[k] = { claimedUpTo, prestige };
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
export const CURRENT_VERSION = 44;

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
  return TOWER_ORDER.filter((k) => !(TOWER_DEFS[k].unlockShards && TOWER_DEFS[k].unlockShards! > 0));
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
  return {
    shards: 0,
    upgrades: {},
    bestWave: 0,
    rushBestWave: 0,
    rushBestBoss: 0,
    rushStamina: { value: 100, updatedAt: 0, freeDay: '' },
    research: { day: '', claims: {}, pendingBoosts: [], lifetime: { views: 0, claims: {} } },
    daily: { lastKey: '', lastWave: 0, bestWave: 0, completions: 0, streak: 0, rewardedKey: '', lastReplay: null },
    cosmetics: { owned: [], towers: {}, heroes: {} },
    contracts: { completed: [], perfectWeeks: 0, lastPerfect: '' },
    directives: { week: '', progress: {}, claimed: [] },
    hive: { built: {} },
    login: { last: '', streak: 0, best: 0, lifetime: 0 },
    idle: { lastCollect: 0, nodes: {}, lifetimeHours: 0, harvests: 0, lifetimeValue: 0, bestHours: 0, blooms: 0 },
    nemesis: null,
    equippedTrophies: [],
    vengeance: [],
    expeditions: { active: [], mastery: {} },
    infestation: { target: null, sectors: {} },
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
    equipment: { inventory: [], loadouts: {} },
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
    genomeRank: { celebrated: 1 },
    genes: {},
    geneSlots: 1,
    geneLoadout: [null, null, null, null, null],
    geneEssence: 0,
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
    masteryEvolution: {},
  };
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
  return { celebrated: Number.isFinite(n) && n >= 1 ? n : 1 };
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
  return { owned: [...starters], equipped: {}, favorites: [], seen: [...starters], milestones: [], pendingReveal: [] };
}

function sanitizeWardrobe(raw: unknown): SaveData['wardrobe'] {
  const out = defaultWardrobe();
  if (!raw || typeof raw !== 'object') return out;
  const o = raw as Record<string, unknown>;
  const ids = (v: unknown): string[] =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && wardrobeItem(x) !== undefined))] : [];
  out.owned = [...new Set([...out.owned, ...ids(o.owned)])]; // starters are always owned
  const ownedSet = new Set(out.owned);
  out.favorites = ids(o.favorites).filter((id) => ownedSet.has(id));
  out.seen = [...new Set([...out.seen, ...ids(o.seen)])];
  out.pendingReveal = ids(o.pendingReveal).filter((id) => ownedSet.has(id));
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
  return stripRetired({
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
      return { last, streak, best: Math.max(int(raw?.best), streak), lifetime };
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
      const raw = (data as { infestation?: { target?: unknown; sectors?: unknown } }).infestation;
      const out: SaveData['infestation'] = { target: null, sectors: {} };
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
    // v18→v19: Starting Gene Loadout. Pre-v19 ⇒ 1 slot, empty loadout; junk ids/duplicates dropped.
    geneSlots: sanitizeGeneSlots((data as { geneSlots?: unknown }).geneSlots),
    geneLoadout: sanitizeGeneLoadout((data as { geneLoadout?: unknown }).geneLoadout),
    // v18: permanent gene currency (pre-v18 ⇒ 0). Unified wallet: a legacy save's `geneOverflow`
    // (the short-lived Mulligan-upgrade currency) folds in 1:1 — one currency now levels Gene
    // Cards AND Mulligan modifiers, and no banked balance is lost.
    geneEssence: Math.max(0, Math.floor(Number((data as { geneEssence?: unknown }).geneEssence) || 0))
      + Math.max(0, Math.floor(Number((data as { geneOverflow?: unknown }).geneOverflow) || 0)),
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
    masteryEvolution: sanitizeMasteryEvolution((data as { masteryEvolution?: unknown }).masteryEvolution),
    wardrobe: sanitizeWardrobe((data as { wardrobe?: unknown }).wardrobe),
    battlePass: sanitizeBattlePass((data as { battlePass?: unknown }).battlePass),
    quests: sanitizeQuests((data as { quests?: unknown }).quests),
  });
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
function migrate(_version: number, data: unknown): unknown {
  // v1→v2 (tower progression), v2→v3 (hero progression + roster, lifetime stats +
  // achievements), v3→v4 (loot queue), v4→v5 (tower star-fork picks), and v5→v6 (mastery
  // identity: titles/lore) — plus v8→v9 (per-tower lifetime kills) and v9→v10 (campaign progression) — are all additive: withDefaults() deep-fills the new records, the
  // selectedHero default, the stats block, the loot queue, the fork picks, the mastery
  // identity arrays, and the prestige block (v6→v7; v7→v8 adds the Ascendant Tree node map,
  // deep-filled by sanitizePrestige). v8→v9 adds per-hero kills + favorite-equipment, deep-filled
  // by withDefaults. Structural changes add steps here.
  return data;
}

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

  private set(key: string, value: string): void {
    try {
      this.storage.setItem(key, value);
    } catch {
      /* storage full/unavailable — fail soft */
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
    if (!raw) return null;
    const meta: BackupMeta = {
      id: `${Date.now().toString(36)}-${(this.bakSeq++).toString(36)}`,
      at: new Date().toISOString(),
    };
    this.set(BAK_PREFIX + meta.id, raw);
    const list = [meta, ...this.listBackups()].slice(0, MAX_BACKUPS);
    // prune dropped backups
    const kept = new Set(list.map((b) => b.id));
    for (const old of this.listBackups()) {
      if (!kept.has(old.id)) this.remove(BAK_PREFIX + old.id);
    }
    this.set(BAK_INDEX, JSON.stringify(list));
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
