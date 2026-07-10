// GENOME RANK (docs/GENOME-RANK.md) — the account's ULTIMATE mastery ladder. Not another XP
// bar: a hidden GENOME RATING procedurally computed from weighted contributions of every major
// system, expressed to the player only as prestigious RANKS (I → X named, XI+ forever). The
// Account Level measures dedication; the Genome Rank measures BREADTH — how much of the whole
// organism the player has grown.
//
// Design contracts (enforced by genomeRank.test.ts):
//   • Rating is a PURE function of a plain-number snapshot — never stored, never drifts.
//   • Weights are DATA (GENOME_SOURCES): a future system integrates by adding ONE source row
//     (+ one snapshot field in meta's builder). No source may dominate the ladder.
//   • Completion axes ride content registries via ratios (adding towers/cards/items auto-scales
//     the denominator); depth axes (stage, level, wave …) decelerate but NEVER cap → the rank
//     ladder is infinite (Roman numerals + procedurally named ranks beyond X).
//   • The Advisor derives "easiest remaining rating" opportunities from the same table — no
//     hand-authored checklists to rot.

import { hashStr } from './hash';

// ── The snapshot — plain numbers only (the state layer adapts SaveData → this) ──────────────
// Depth axes are raw counts (uncapped); completion axes are 0..1 ratios whose denominators are
// the LIVE content registries (see meta.genomeSnapshot), so new content lowers ratios and the
// rank keeps meaning as the game grows.
export interface GenomeSnapshot {
  accountLevel: number; // docs/ACCOUNT-LEVEL.md — the dedication lane
  campaignStage: number; // deepest stage cleared
  bestWave: number; // Infinite personal best
  rushBestBoss: number; // most bosses felled in one rush
  dailyCompletions: number; // lifetime daily clears
  powerScore: number; // the one strength number
  molts: number; // prestige cycles
  masteryLevels: number; // Σ tower + hero mastery levels
  lifetimeIchor: number; // premium trickle ever earned
  titles: number; // earned titles (mastery + account + rank)
  towerStarRatio: number; // Σ stars / (roster × star target)
  strainRatio: number; // Σ best strain / (roster × 5)
  mulliganRatio: number; // fully assembled organisms / roster
  heroRatio: number; // blend of roster unlocked + hero stars
  gearRatio: number; // distinct equipment defs owned / all defs
  geneRatio: number; // blend of cards discovered + levels bought
  achievementRatio: number; // earned / authored
  collectionCompletion: number; // Codex tier-weighted completion (core/collection.ts)
  cosmeticRatio: number; // phenotypes + wardrobe owned / catalogs
  passScore: number; // battle pass: permanents ratio + 0.25 per full season clear (uncapped)
}

export type GenomeCategory = 'journey' | 'strength' | 'arsenal' | 'identity';

export interface GenomeSource {
  id: string;
  name: string;
  category: GenomeCategory;
  weight: number; // relative importance (DATA — tune freely; dominance test guards the spread)
  nav: string; // Hub NavKey the Advisor routes to
  /** Normalized points 0..~10 for completion axes; decelerating & uncapped for depth axes. */
  score: (s: GenomeSnapshot) => number;
  /** Advisor hint — the concrete next action that grows this source. */
  hint: string;
}

/** Soft ceiling completion axes score toward (a full ratio = this many points). */
const FULL = 10;
const ratio = (r: number): number => Math.max(0, Math.min(1, r)) * FULL;
/** Decelerating depth curve: value^exp / div — grows forever, slows forever. */
const depth = (v: number, exp: number, div: number): number => Math.pow(Math.max(0, v), exp) / div;

/** THE weight table — every major system contributes; a new system is one row here. */
export const GENOME_SOURCES: GenomeSource[] = [
  { id: 'account-level', name: 'Account Level', category: 'journey', weight: 100, nav: 'profile',
    score: (s) => depth(s.accountLevel, 0.8, 3), hint: 'Everything pays Account XP — keep playing, keep leveling.' },
  { id: 'campaign', name: 'Campaign Depth', category: 'journey', weight: 120, nav: 'campaign',
    score: (s) => depth(s.campaignStage, 0.8, 3), hint: 'Clear the next Campaign stage.' },
  { id: 'infinite', name: 'Infinite Depth', category: 'journey', weight: 70, nav: 'infinite',
    score: (s) => depth(s.bestWave, 0.75, 3), hint: 'Push a new Infinite best wave.' },
  { id: 'boss-rush', name: 'Boss Rush', category: 'journey', weight: 55, nav: 'bossrush',
    score: (s) => depth(s.rushBestBoss, 0.8, 2), hint: 'Fell more bosses in a single rush.' },
  { id: 'daily', name: 'Daily Gauntlets', category: 'journey', weight: 45, nav: 'daily',
    score: (s) => depth(s.dailyCompletions, 0.7, 1.5), hint: 'Complete today’s Daily Run.' },
  { id: 'prestige', name: 'Molts', category: 'journey', weight: 80, nav: 'evolution',
    score: (s) => depth(s.molts, 0.75, 1 / 1.2), hint: 'Complete another Molt cycle.' },
  { id: 'battle-pass', name: 'Seasons', category: 'journey', weight: 55, nav: 'season',
    score: (s) => Math.max(0, s.passScore) * FULL, hint: 'Claim season rewards and finish the pass.' },

  { id: 'power', name: 'Power Score', category: 'strength', weight: 130, nav: 'profile',
    score: (s) => depth(s.powerScore, 0.35, 8), hint: 'Any permanent upgrade raises Power.' },

  { id: 'tower-stars', name: 'Tower Evolution', category: 'arsenal', weight: 90, nav: 'towers',
    score: (s) => ratio(s.towerStarRatio), hint: 'Evolve a tower with Strain Samples.' },
  { id: 'mastery', name: 'Mastery', category: 'arsenal', weight: 75, nav: 'towers',
    score: (s) => depth(s.masteryLevels, 0.7, 4), hint: 'Field varied towers and champions — mastery grows in combat.' },
  { id: 'strains', name: 'Strain Records', category: 'arsenal', weight: 45, nav: 'towers',
    score: (s) => ratio(s.strainRatio), hint: 'Evolve deeper Strains (merge duplicates in-run).' },
  { id: 'mulligans', name: 'Mulligan Organisms', category: 'arsenal', weight: 50, nav: 'mulligans',
    score: (s) => ratio(s.mulliganRatio), hint: 'Assemble a full three-modifier organism.' },
  { id: 'heroes', name: 'Champion Roster', category: 'arsenal', weight: 85, nav: 'heroes',
    score: (s) => ratio(s.heroRatio), hint: 'Unlock and star-up champions.' },
  { id: 'equipment', name: 'Armory Codex', category: 'arsenal', weight: 60, nav: 'gearcodex',
    score: (s) => ratio(s.gearRatio), hint: 'Discover equipment you have never owned.' },
  { id: 'genes', name: 'Gene Archive', category: 'arsenal', weight: 75, nav: 'genes',
    score: (s) => ratio(s.geneRatio), hint: 'Draft new gene cards and level the Archive.' },

  { id: 'achievements', name: 'Achievements', category: 'identity', weight: 70, nav: 'profile',
    score: (s) => ratio(s.achievementRatio), hint: 'Chase the open achievement milestones.' },
  { id: 'collection', name: 'Bio-Dex', category: 'identity', weight: 65, nav: 'collection',
    score: (s) => ratio(s.collectionCompletion), hint: 'Raise Codex tiers — every kill and clear counts.' },
  { id: 'cosmetics', name: 'Cosmetics', category: 'identity', weight: 45, nav: 'phenotypes',
    score: (s) => ratio(s.cosmeticRatio), hint: 'Grow the Phenotype + Wardrobe collections.' },
  { id: 'titles', name: 'Titles', category: 'identity', weight: 30, nav: 'profile',
    score: (s) => depth(s.titles, 0.6, 1), hint: 'Earn titles from Mastery ranks and Account milestones.' },
  { id: 'ichor', name: 'Ichor Legacy', category: 'identity', weight: 25, nav: 'market',
    score: (s) => depth(s.lifetimeIchor, 0.5, 2), hint: 'Ichor bleeds from rush records and deep milestones.' },
];

const TOTAL_WEIGHT = GENOME_SOURCES.reduce((a, r) => a + r.weight, 0);

// ── The rating ───────────────────────────────────────────────────────────────
/** The hidden Genome Rating — Σ weight·score, scaled so ranks read as big, earned numbers. */
export function genomeRating(s: GenomeSnapshot): number {
  let sum = 0;
  for (const src of GENOME_SOURCES) sum += src.weight * src.score(s);
  return Math.round(sum / 10);
}

export interface GenomeContribution {
  id: string;
  name: string;
  category: GenomeCategory;
  nav: string;
  rating: number; // this source's contribution, in rating points
  share: number; // 0..1 of the current total
}

/** Per-source contribution breakdown (Profile bars + the dominance guard). */
export function genomeBreakdown(s: GenomeSnapshot): GenomeContribution[] {
  const rows = GENOME_SOURCES.map((src) => ({
    id: src.id, name: src.name, category: src.category, nav: src.nav,
    rating: (src.weight * src.score(s)) / 10,
  }));
  const total = rows.reduce((a, r) => a + r.rating, 0);
  return rows
    .map((r) => ({ ...r, rating: Math.round(r.rating * 10) / 10, share: total > 0 ? r.rating / total : 0 }))
    .sort((a, b) => b.rating - a.rating);
}

// ── The rank ladder (I..X named, XI+ forever) ───────────────────────────────
export interface GenomeRankDef { index: number; name: string; numeral: string; at: number }

/** The ten named ranks — thresholds calibrated against the persona simulator (docs/GENOME-RANK.md
 *  §calibration): a first session reaches II, the pinned 30h optimal account sits ~V–VI, X is a
 *  completionist's long horizon. */
export const GENOME_RANKS: { name: string; at: number }[] = [
  { name: 'Dormant', at: 0 }, // I — every organism starts asleep
  { name: 'Emergent', at: 90 }, // II
  { name: 'Adaptive', at: 260 }, // III
  { name: 'Mutating', at: 520 }, // IV
  { name: 'Parasitic', at: 880 }, // V
  { name: 'Hiveborn', at: 1340 }, // VI
  { name: 'Dominant', at: 1950 }, // VII
  { name: 'Genome Ascendant', at: 2750 }, // VIII
  { name: 'Perfect Organism', at: 3800 }, // IX
  { name: 'Living Catastrophe', at: 5200 }, // X
];
/** Every rank past X needs this much more rating than the one before (forever). */
export const BEYOND_STEP = 1600;

export function romanNumeral(n: number): string {
  const table: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let v = Math.max(1, Math.floor(n));
  let out = '';
  for (const [k, sym] of table) while (v >= k) { out += sym; v -= k; }
  return out;
}

// Procedural identities beyond X — deterministic per rank index, so every player sees the same
// name for Rank XIV. Two-part combinator: enough space for hundreds of ranks without repeats
// feeling adjacent.
const BEYOND_PRE = ['Unbound', 'Omniviral', 'Worldrot', 'Star-Eater', 'Chthonic', 'Terminal', 'Sporewrought', 'Abyssal'];
const BEYOND_STEM = ['Genome', 'Organism', 'Catastrophe', 'Lineage', 'Chorus', 'Bloom', 'Colossus', 'Dominion'];

/** Rank threshold for 1-based `index` (index ≤ 10 named; beyond = X + linear steps). */
export function rankThreshold(index: number): number {
  if (index <= GENOME_RANKS.length) return GENOME_RANKS[Math.max(0, index - 1)].at;
  return GENOME_RANKS[GENOME_RANKS.length - 1].at + (index - GENOME_RANKS.length) * BEYOND_STEP;
}

/** Display name for 1-based `index` — authored through X, procedural (deterministic) beyond. */
export function rankName(index: number): string {
  if (index <= GENOME_RANKS.length) return GENOME_RANKS[Math.max(0, index - 1)].name;
  const h = hashStr(`genome-rank:${index}`);
  return `${BEYOND_PRE[h % BEYOND_PRE.length]} ${BEYOND_STEM[Math.floor(h / 7) % BEYOND_STEM.length]}`;
}

export interface GenomeRankView {
  rating: number;
  index: number; // 1-based rank index (1 = Dormant)
  name: string;
  numeral: string;
  at: number; // this rank's threshold
  next: number; // the next rank's threshold (always exists — the ladder is infinite)
  into: number; // rating past `at`
  need: number; // rating span of this rank
}

export function rankFromRating(rating: number): GenomeRankView {
  const r = Math.max(0, rating);
  let index = 1;
  while (rankThreshold(index + 1) <= r) index++;
  const at = rankThreshold(index);
  const next = rankThreshold(index + 1);
  return { rating: r, index, name: rankName(index), numeral: romanNumeral(index), at, next, into: r - at, need: next - at };
}

// ── The Genome Progress Advisor ──────────────────────────────────────────────
export interface GenomeAdvice {
  id: string;
  name: string;
  nav: string;
  hint: string;
  /** Rating points realistically on the table for this source right now. */
  potential: number;
}

/** "Easiest remaining rating" — completion axes offer everything they're missing; depth axes
 *  offer the next CHUNK of progress (5 steps' marginal gain), so an endless axis never drowns
 *  the finishable ones. Sorted biggest-first; the UI shows the top few. */
export function genomeAdvice(s: GenomeSnapshot, n = 4): GenomeAdvice[] {
  const DEPTH_IDS: Record<string, (x: GenomeSnapshot, k: number) => GenomeSnapshot> = {
    'account-level': (x, k) => ({ ...x, accountLevel: x.accountLevel + k }),
    'campaign': (x, k) => ({ ...x, campaignStage: x.campaignStage + k }),
    'infinite': (x, k) => ({ ...x, bestWave: x.bestWave + k }),
    'boss-rush': (x, k) => ({ ...x, rushBestBoss: x.rushBestBoss + k }),
    'daily': (x, k) => ({ ...x, dailyCompletions: x.dailyCompletions + k }),
    'prestige': (x) => ({ ...x, molts: x.molts + 1 }), // one molt IS the chunk
    'mastery': (x, k) => ({ ...x, masteryLevels: x.masteryLevels + k * 2 }),
    'titles': (x, k) => ({ ...x, titles: x.titles + k }),
    'ichor': (x, k) => ({ ...x, lifetimeIchor: x.lifetimeIchor + k * 3 }),
    'power': (x) => ({ ...x, powerScore: x.powerScore * 1.25 }), // +25% strength chunk
    'battle-pass': (x) => ({ ...x, passScore: x.passScore + 0.15 }),
  };
  const rows = GENOME_SOURCES.map((src) => {
    const step = DEPTH_IDS[src.id];
    const potential = step
      ? (src.weight * (src.score(step(s, 5)) - src.score(s))) / 10
      : (src.weight * (FULL - src.score(s))) / 10; // completion axes: all remaining points
    return { id: src.id, name: src.name, nav: src.nav, hint: src.hint, potential: Math.max(0, Math.round(potential * 10) / 10) };
  });
  return rows.sort((a, b) => b.potential - a.potential).slice(0, n);
}

// ── Promotion rewards (DATA — cosmetic-leaning prestige, never pay-to-win) ──
// One-time payouts when a rank is first reached: cores + (from IV) ichor + (from V) a premium
// container, plus the rank TITLE every time (identity is the real prize). No gameplay passives —
// strength stays with the systems the rating measures.
export interface GenomeRankReward {
  cores: number;
  ichor: number;
  containers: string[]; // chest ids banked as kind 'cache'
  titleId: string; // `grank_<index>` — resolves via rankName (state/profile titleName chain)
}

export function genomeRankReward(index: number): GenomeRankReward {
  return {
    cores: Math.round(120 * Math.pow(index, 1.3)),
    ichor: index >= 4 ? 2 + index : 0,
    containers: index >= 5 ? ['prime'] : index >= 3 ? ['rich'] : [],
    titleId: `grank_${index}`,
  };
}

/** Resolve a `grank_<n>` title id to its display name (undefined for foreign ids). */
export function genomeTitleName(id: string): string | undefined {
  const m = /^grank_(\d+)$/.exec(id);
  if (!m) return undefined;
  const n = Number(m[1]);
  return `${rankName(n)} ${romanNumeral(n)}`;
}

/** Static dominance guard target (genomeRank.test.ts): no single source's weight may exceed
 *  this share of the table — breadth stays the point of the ladder. */
export const MAX_WEIGHT_SHARE = 0.12;
export { TOTAL_WEIGHT };
