// Browser-local persistence + save management (ARCHITECTURE.md §15). Versioned +
// checksummed blob, a migration pipeline, rolling backups, JSON export/import, and
// non-destructive recovery (a corrupt save falls back to the newest valid backup,
// then to defaults — never crashing, never silently overwriting good data).
// Storage is injectable so the core is testable headlessly; the browser uses
// localStorage. No DOM/file APIs here (those live in saveFile.ts).

import { ENEMY_KINDS, HERO_DEFS, HERO_ORDER, HERO_IDS, TOWER_DEFS, TOWER_ORDER, heroRegistry, towerRegistry } from '../core/config';
import type { EnemyKind, HeroKind, LifetimeStats, TimelineEvent, TowerKind } from '../core/types';
import type { Loadout, OwnedItem } from '../core/equipment';
import { defaultLootQueue, sanitizeLootQueue } from '../core/lootQueue';
import type { LootQueueState } from '../core/lootQueue';
import type { PendingContainer } from '../state/lootbox';
import { defaultPrestige } from '../core/prestige';
import type { PrestigeState } from '../core/prestige';
import { sanitizeProgress } from '../core/tutorial';
import type { TutorialProgress } from '../core/tutorial';
import { defaultCalib } from '../core/predict';
import type { PredictCalib } from '../core/predict';
import { adaptNode } from '../core/adaptation';
import { sanitizeGeneSave } from '../core/geneCards';
import { sanitizeGeneLoadout, sanitizeGeneSlots } from '../core/geneLoadout';
import type { GeneSave } from '../core/geneCards';

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
  premium: {
    purchases: Record<string, number>;
    lastRotatingBuyKey: string;
    seenKey: string;
    totalSpentUsd: number;
    claimedReceipts: string[];
    pendingCheckout: { offerId: string; sessionId: string; startedAt: number } | null;
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
  totalRuns: number;
  lifetimeShards: number;
  cardsSeen: number;
  // ── Tower progression (per kind) — added in schema v2 ──
  towerShards: Record<TowerKind, number>; // shard currency, earned from chests
  towerStars: Record<TowerKind, number>; // star upgrade level (0 = base)
  towerForks: Record<TowerKind, Record<string, string>>; // per-tower star-fork picks (star → optionId)
  towerMasteryXp: Record<TowerKind, number>; // lifetime mastery XP (grows forever)
  towerKills: Record<TowerKind, number>; // lifetime kills per tower (schema v9) — Tower Lab
  heroShards: Record<string, number>; // per-hero shards (earned from chests)
  // ── Hero progression + roster (per kind) — added in schema v3 ──
  heroStars: Record<HeroKind, number>; // hero star level (0 = base)
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
  timeline: TimelineEvent[];
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
// (docs/RESEARCH.md). All additive — withDefaults() deep-fills, migrate() passes through.
export const CURRENT_VERSION = 25;
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
/** Heroes owned from the start — those with no `unlockShards` gate (e.g. Ravager). */
function starterHeroes(): HeroKind[] {
  return HERO_ORDER.filter((k) => !(HERO_DEFS[k].unlockShards && HERO_DEFS[k].unlockShards! > 0));
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
 *  to a hero they were using. Always includes the starters and returns a stable HERO_ORDER order. */
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
  return HERO_ORDER.filter((k) => set.has(k));
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
    premium: { purchases: {}, lastRotatingBuyKey: '', seenKey: '', totalSpentUsd: 0, claimedReceipts: [], pendingCheckout: null },
    totalRuns: 0,
    lifetimeShards: 0,
    cardsSeen: 0,
    towerShards: zeroByTower(),
    towerStars: zeroByTower(),
    towerForks: emptyForksByTower(),
    towerMasteryXp: zeroByTower(),
    towerKills: zeroByTower(),
    heroShards: zeroByHero(),
    heroStars: zeroByHeroKind(),
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
    genes: {},
    geneSlots: 1,
    geneLoadout: [null, null, null, null, null],
    geneEssence: 0,
    createdAt: 0, // stamped by the first settle — defaultSave() must stay deterministic
    profileName: 'OVERMIND',
    profileFrame: 'membrane',
    timeline: [],
    antigen: 0,
    ichor: 0,
    lifetimeIchor: 0,
    market: { window: 0, bought: [], seenWindow: 0, starter: false },
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
function withDefaults(data: SaveData): SaveData {
  const d = defaultSave();
  return {
    ...d,
    ...data,
    upgrades: { ...data.upgrades },
    towerShards: { ...d.towerShards, ...data.towerShards },
    towerStars: { ...d.towerStars, ...data.towerStars },
    // v4→v5: per-tower fork picks fill empty for a pre-v5 save (⇒ each fork defaults to its
    // first option). Shallow-merge keeps known towers' picks and defaults the rest.
    towerForks: { ...d.towerForks, ...(data.towerForks && typeof data.towerForks === 'object' ? data.towerForks : {}) },
    towerMasteryXp: { ...d.towerMasteryXp, ...data.towerMasteryXp },
    towerKills: { ...d.towerKills, ...data.towerKills }, // v8→v9: additive, zeroed for old saves
    heroShards: { ...d.heroShards, ...data.heroShards },
    heroStars: { ...d.heroStars, ...data.heroStars },
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
    genes: sanitizeGeneSave(data.genes), // v18: drops unknown/renamed cards + clamps levels (pre-v18 ⇒ {})
    // v18→v19: Starting Gene Loadout. Pre-v19 ⇒ 1 slot, empty loadout; junk ids/duplicates dropped.
    geneSlots: sanitizeGeneSlots((data as { geneSlots?: unknown }).geneSlots),
    geneLoadout: sanitizeGeneLoadout((data as { geneLoadout?: unknown }).geneLoadout),
    geneEssence: Math.max(0, Math.floor(Number((data as { geneEssence?: unknown }).geneEssence) || 0)), // v18: permanent gene currency (pre-v18 ⇒ 0)
    // v21→v22: Player Profile — identity fields + the milestone timeline (pre-v22 ⇒ defaults;
    // createdAt stays 0 until the first settle stamps it).
    createdAt: Math.max(0, Math.floor(Number((data as { createdAt?: unknown }).createdAt) || 0)),
    profileName: typeof (data as { profileName?: unknown }).profileName === 'string' && ((data as { profileName?: unknown }).profileName as string).trim().length > 0
      ? ((data as { profileName?: unknown }).profileName as string).slice(0, 24)
      : d.profileName,
    profileFrame: typeof (data as { profileFrame?: unknown }).profileFrame === 'string' ? ((data as { profileFrame?: unknown }).profileFrame as string) : d.profileFrame,
    timeline: sanitizeTimeline((data as { timeline?: unknown }).timeline),
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
  };
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
  return {
    purchases,
    lastRotatingBuyKey: key(o.lastRotatingBuyKey),
    seenKey: key(o.seenKey),
    totalSpentUsd: Math.max(0, Number(o.totalSpentUsd) || 0),
    claimedReceipts,
    pendingCheckout,
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
  app: 'ASSIMILATE';
  kind: 'save-export';
  schemaVersion: number;
  exportedAt: string;
  data: SaveData;
  checksum: string;
}

export function serializeExport(data: SaveData): string {
  const exp: SaveExport = {
    app: 'ASSIMILATE',
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

export class SaveStore {
  private storage: StorageLike;
  private bakSeq = 0;

  constructor(storage?: StorageLike) {
    this.storage =
      storage ??
      (typeof localStorage !== 'undefined' ? (localStorage as StorageLike) : memoryStorage());
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
