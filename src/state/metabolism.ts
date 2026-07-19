// METABOLISM (docs/METABOLISM.md) — the recursive progression system: the organism grows by
// DIGESTING everything the player already does. Every track watches a lifetime quantity the
// game already accumulates (derive-first — veterans back-fill instantly on load) or one of
// four small counters fed by single chokepoints. Tiers extend FOREVER on a nice-number
// geometric ladder; rewards grow strictly SLOWER than thresholds, so the reward-per-action
// decays and the system engages without inflating (the sim pins this).
//
// "I wasn't even trying to do that… nice." — nothing here is a grind target; it is a
// gratitude ledger over normal play.
//
// Pure data + math: no DOM, no RNG, no clocks. Lives in state/ (not core/) because every
// track's value() reads the whole SaveData — the GENOME_SOURCES precedent; the save SHAPE
// (MetabolismSave + defaults + sanitizer) is owned by saveStore. A FUTURE SYSTEM joins by
// adding ONE TrackDef row — the dev test enforces shape, uniqueness, curve bands, and
// reward-id validity automatically.

import type { MetabolismSave, SaveData } from '../save/saveStore';
import type { PassReward } from '../core/battlePass';

// ── Tuning (one place — docs/METABOLISM.md §curves) ──────────────────────────────────────
export const METABOLISM = {
  thresholdGrowth: 1.8, // tier N+1 needs ×1.8 of tier N (before nice-rounding)
  rewardGrowth: 1.35, // reward qty growth per tier — STRICTLY below thresholdGrowth
  maxTiersScanned: 64, // 1.8^64 ≈ 2e16 — beyond any reachable lifetime value
} as const;

export type MetaCat = 'combat' | 'collection' | 'growth' | 'ritual';
export const META_CATS: Record<MetaCat, { label: string; glyph: string }> = {
  combat: { label: 'Conquest', glyph: '⚔' },
  collection: { label: 'Assimilation', glyph: '❈' },
  growth: { label: 'Evolution', glyph: '⇧' },
  ritual: { label: 'Rituals', glyph: '✹' },
};

/** A track's payout row. `type` is the PassReward-expressible vocabulary — claims pay through
 *  applyRewardList (THE reward interpreter), so a metabolism reward is BY CONSTRUCTION anything
 *  that interpreter speaks. 'bpXp' is the one exception: the claim action feeds it to the
 *  season lane post-persist (the claimQuestMission pattern). */
export type MetaRewardType =
  | 'cores' | 'ichor' | 'geneEssence' | 'hiveMats' | 'bioSpores' | 'mulliganTissue'
  | 'towerShardsAll' | 'heroShardsAll' | 'container' | 'runCache' | 'bpXp';
export interface MetaReward { type: MetaRewardType; base: number; rarity?: 'rare' | 'epic' | 'legendary' }
export interface TrackDef {
  id: string;
  name: string;
  glyph: string; // icon-language mark shown on the row
  cat: MetaCat;
  unit: string; // "containers opened" — reads as "<n> <unit>"
  base: number; // tier-1 threshold (before nice-rounding)
  value: (s: SaveData) => number; // the lifetime quantity — MONOTONIC by contract
  rewards: MetaReward[];
}

const sum = (r: Record<string, number>): number => Object.values(r).reduce((a, b) => a + b, 0);

/** THE registry — a future system is one row here (spec: foundational design). */
export const META_TRACKS: readonly TrackDef[] = [
  // ── Conquest — the fight itself feeds the organism ──
  { id: 'kills', name: 'Endless Feast', glyph: '⚔', cat: 'combat', unit: 'enemies assimilated', base: 500,
    value: (s) => s.stats.lifetimeKills, rewards: [{ type: 'cores', base: 40 }] },
  { id: 'victories', name: 'Perfect Digestions', glyph: '✓', cat: 'combat', unit: 'victories', base: 3,
    value: (s) => s.stats.runsCompleted, rewards: [{ type: 'cores', base: 60 }, { type: 'bioSpores', base: 2 }] },
  { id: 'waves', name: 'Tides Endured', glyph: '≋', cat: 'combat', unit: 'waves survived', base: 50,
    value: (s) => s.stats.waveSum, rewards: [{ type: 'geneEssence', base: 30 }] },
  { id: 'megas', name: 'Apex Predation', glyph: '☠', cat: 'combat', unit: 'Mega Bosses felled', base: 2,
    value: (s) => s.megaProgress.kills, rewards: [{ type: 'container', base: 1, rarity: 'rare' }] },
  { id: 'rushBosses', name: 'Gauntlet Trophies', glyph: '⛬', cat: 'combat', unit: 'Boss Rush bosses', base: 5,
    value: (s) => s.stats.rushBossKills, rewards: [{ type: 'bioSpores', base: 3 }] },
  { id: 'strains', name: 'Strain Ascendance', glyph: '⊛', cat: 'combat', unit: 'strains evolved', base: 3,
    value: (s) => s.stats.strainsEvolved, rewards: [{ type: 'towerShardsAll', base: 3 }] },

  // ── Assimilation — the collection is the body ──
  { id: 'genes', name: 'Sequenced Genome', glyph: '⌬', cat: 'collection', unit: 'gene cards discovered', base: 5,
    value: (s) => s.genesDiscovered.length, rewards: [{ type: 'geneEssence', base: 40 }] },
  { id: 'cosmetics', name: 'Phenotype Library', glyph: '❖', cat: 'collection', unit: 'cosmetics collected', base: 3,
    value: (s) => s.wardrobe.owned.length, rewards: [{ type: 'ichor', base: 8 }] },
  { id: 'organs', name: 'Organ Bank', glyph: '⊛', cat: 'collection', unit: 'Mulligan organs sequenced', base: 3,
    value: (s) => Object.keys(s.mulliganDex).length, rewards: [{ type: 'mulliganTissue', base: 40 }] },
  { id: 'feats', name: 'Remembered Feats', glyph: '🏆', cat: 'collection', unit: 'achievements unlocked', base: 3,
    value: (s) => s.achievements.length, rewards: [{ type: 'cores', base: 50 }] },

  // ── Evolution — the account's own flesh ──
  { id: 'towerStars', name: 'Mutation Ladder', glyph: '◈', cat: 'growth', unit: 'tower evolutions', base: 3,
    value: (s) => sum(s.towerStars), rewards: [{ type: 'towerShardsAll', base: 4 }] },
  { id: 'geneLevels', name: 'Deep Splicing', glyph: '⟡', cat: 'growth', unit: 'gene levels evolved', base: 3,
    value: (s) => Object.values(s.genes).reduce((a, g) => a + g.level, 0), rewards: [{ type: 'geneEssence', base: 35 }] },
  { id: 'mastery', name: 'Muscle Memory', glyph: '⟁', cat: 'growth', unit: 'k mastery XP', base: 5,
    value: (s) => Math.floor((sum(s.towerMasteryXp) + sum(s.heroMasteryXp)) / 1000), rewards: [{ type: 'cores', base: 45 }] },
  { id: 'molts', name: 'Shed Skins', glyph: '♾', cat: 'growth', unit: 'Molts completed', base: 1,
    value: (s) => s.prestige.molts, rewards: [{ type: 'ichor', base: 12 }] },
  { id: 'coreHoard', name: 'Core Hoard', glyph: '⬡', cat: 'growth', unit: 'Genome Cores amassed', base: 500,
    value: (s) => s.lifetimeShards, rewards: [{ type: 'heroShardsAll', base: 2 }] },
  { id: 'ichorDrawn', name: 'Black Blood', glyph: '🩸', cat: 'growth', unit: 'Ichor drawn', base: 50,
    value: (s) => s.lifetimeIchor, rewards: [{ type: 'ichor', base: 10 }] },

  // ── Rituals — rewarding the act of collecting rewards (the recursive heart) ──
  { id: 'containers', name: 'Hatchery Habit', glyph: '◉', cat: 'ritual', unit: 'Bio-Containers opened', base: 5,
    value: (s) => s.metabolism.counters.containersOpened, rewards: [{ type: 'geneEssence', base: 25 }, { type: 'ichor', base: 4 }] },
  { id: 'spores', name: 'Roulette Communion', glyph: '✺', cat: 'ritual', unit: 'Bio-Spores absorbed', base: 10,
    value: (s) => s.metabolism.counters.sporesAbsorbed, rewards: [{ type: 'bioSpores', base: 2 }] },
  { id: 'quests', name: 'Directive Devotion', glyph: '✪', cat: 'ritual', unit: 'quests claimed', base: 5,
    value: (s) => s.metabolism.counters.questsClaimed, rewards: [{ type: 'cores', base: 45 }] },
  { id: 'passClaims', name: 'Season Communion', glyph: '❁', cat: 'ritual', unit: 'pass rewards claimed', base: 5,
    value: (s) => s.metabolism.counters.passClaimed, rewards: [{ type: 'bpXp', base: 60 }] },
  { id: 'harvests', name: 'Patient Reaping', glyph: '⬣', cat: 'ritual', unit: 'Hive harvests', base: 3,
    value: (s) => s.idle.harvests, rewards: [{ type: 'hiveMats', base: 30 }] },
  { id: 'devotion', name: 'Daily Devotion', glyph: '☀', cat: 'ritual', unit: 'days returned', base: 3,
    value: (s) => s.login.lifetime, rewards: [{ type: 'ichor', base: 5 }] },
] as const;

const BY_ID = new Map(META_TRACKS.map((t) => [t.id, t]));
export const metaTrack = (id: string): TrackDef | undefined => BY_ID.get(id);

// ── The infinite ladder ──────────────────────────────────────────────────────────────────
/** Round up to the 1/2/5 ladder (5→5, 9→10, 40→50 …) — thresholds read as designed numbers. */
export function nice(n: number): number {
  if (n <= 1) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  for (const m of [1, 2, 5, 10]) if (n <= m * mag) return Math.round(m * mag);
  return 10 * mag;
}

/** Tier t's threshold (t is 0-indexed: tier 0 completes at `nice(base)`). Strictly increasing —
 *  nice-rounding can flatten neighbours on the raw curve, so each step forces PAST the last. */
export function threshold(def: TrackDef, tier: number): number {
  let prev = 0;
  for (let t = 0; t <= tier; t++) {
    const raw = def.base * Math.pow(METABOLISM.thresholdGrowth, t);
    prev = Math.max(nice(raw), prev < 1 ? 1 : nice(prev * METABOLISM.thresholdGrowth));
  }
  return prev;
}

/** How many tiers a lifetime value has fully completed. */
export function tierAt(def: TrackDef, value: number): number {
  let tiers = 0;
  for (let t = 0; t < METABOLISM.maxTiersScanned; t++) {
    if (value >= threshold(def, t)) tiers++;
    else break;
  }
  return tiers;
}

/** Reward rows for claiming tier `tier` (0-indexed) — qty grows slower than thresholds. */
export function rewardsFor(def: TrackDef, tier: number): { type: MetaRewardType; qty: number; rarity?: 'rare' | 'epic' | 'legendary' }[] {
  return def.rewards.map((r) => ({ type: r.type, qty: Math.ceil(r.base * Math.pow(METABOLISM.rewardGrowth, tier)), rarity: r.rarity }));
}

/** Convert reward rows to the applyRewardList language. 'bpXp' rows are EXCLUDED — the claim
 *  action pays those through the season-XP lane after the persist (grantPassXp). */
export function toPassRewards(rows: { type: MetaRewardType; qty: number; rarity?: 'rare' | 'epic' | 'legendary' }[]): PassReward[] {
  const out: PassReward[] = [];
  for (const r of rows) {
    switch (r.type) {
      case 'cores': out.push({ kind: 'cores', qty: r.qty }); break;
      case 'ichor': out.push({ kind: 'ichor', qty: r.qty }); break;
      case 'geneEssence': out.push({ kind: 'geneEssence', qty: r.qty }); break;
      case 'hiveMats': out.push({ kind: 'hiveMats', qty: r.qty }); break;
      case 'bioSpores': out.push({ kind: 'bioSpores', qty: r.qty }); break;
      case 'mulliganTissue': out.push({ kind: 'mulliganTissue', qty: r.qty }); break;
      case 'towerShardsAll': out.push({ kind: 'towerShardsAll', qtyEach: r.qty }); break;
      case 'heroShardsAll': out.push({ kind: 'heroShardsAll', qtyEach: r.qty }); break;
      case 'container': out.push({ kind: 'container', rarity: r.rarity ?? 'rare', count: r.qty }); break;
      case 'runCache': out.push({ kind: 'runCache', count: r.qty }); break;
      case 'bpXp': break; // season lane — see claimMetabolism
    }
  }
  return out;
}

/** Bump ONE ritual counter immutably — the single write path meta chokepoints use. */
export function bumpCounter(m: MetabolismSave, k: keyof MetabolismSave['counters'], n = 1): MetabolismSave {
  return { ...m, counters: { ...m.counters, [k]: m.counters[k] + Math.max(0, Math.floor(n)) } };
}

// ── Read model ───────────────────────────────────────────────────────────────────────────
export interface TrackView {
  def: TrackDef;
  value: number;
  claimed: number; // tiers already claimed
  reached: number; // tiers completed by the current value
  claimable: number; // reached − claimed
  nextAt: number; // the next UNREACHED threshold (the live goal)
  prevAt: number; // the threshold beneath it (progress-bar floor)
  nextRewards: ReturnType<typeof rewardsFor>; // what claiming the NEXT claimable (or upcoming) tier pays
}
export function trackView(s: SaveData, def: TrackDef): TrackView {
  const value = Math.max(0, Math.floor(def.value(s)));
  const reached = tierAt(def, value);
  const claimed = Math.min(s.metabolism.claimed[def.id] ?? 0, reached);
  const claimable = reached - claimed;
  const nextTier = claimable > 0 ? claimed : reached; // the tier whose rewards show next
  return {
    def, value, claimed, reached, claimable,
    nextAt: threshold(def, reached),
    prevAt: reached === 0 ? 0 : threshold(def, reached - 1),
    nextRewards: rewardsFor(def, nextTier),
  };
}
export function metabolismViews(s: SaveData): TrackView[] {
  return META_TRACKS.map((d) => trackView(s, d));
}
export function metabolismClaimable(s: SaveData): number {
  return metabolismViews(s).reduce((a, v) => a + v.claimable, 0);
}

// ── Content integrity (dev test + validate) ──────────────────────────────────────────────
export function metabolismProblems(): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const t of META_TRACKS) {
    if (ids.has(t.id)) out.push(`${t.id}: duplicate id`);
    ids.add(t.id);
    if (t.base < 1) out.push(`${t.id}: base < 1`);
    if (!t.glyph) out.push(`${t.id}: no glyph (icon language)`);
    if (t.rewards.length === 0) out.push(`${t.id}: no rewards`);
    for (const r of t.rewards) if (r.base < 1) out.push(`${t.id}: reward ${r.type} base < 1`);
    // The anti-inflation invariant lives in tuning, not per-row — assert it once anyway.
  }
  if (METABOLISM.rewardGrowth >= METABOLISM.thresholdGrowth) out.push('rewardGrowth must stay BELOW thresholdGrowth (inflation guard)');
  return out;
}
