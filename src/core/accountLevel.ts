// ACCOUNT LEVEL (docs/ACCOUNT-LEVEL.md) — the evergreen, UNCAPPED meta-progression backbone.
// One number that measures long-term play itself: not strength (Power Score), not depth
// (Campaign), not a reset loop (Prestige) — dedication. Nearly every meaningful activity pays
// Account XP; every level pays a procedurally generated reward; milestone levels celebrate big.
//
// Design contracts (enforced by accountLevel.test.ts):
//   • NO CAP — the curve is a smooth power law; level N is reachable for any N and the math
//     stays inside Number.MAX_SAFE_INTEGER far beyond human scales (level 100 000+).
//   • Requirements grow FASTER than reward value (value ∝ n^0.7 vs requirement ∝ n^1.25), so
//     high levels stay prestigious and level-farming never out-earns playing.
//   • Rewards are DATA + a deterministic weighted roll per level (same reward for everyone at
//     level N — fair, testable, save-RNG-free). New reward kinds are one pool row.
//   • Pure module: no meta/store imports. The write side lives in state/meta (settle pipeline).

import { hashStr } from './hash';
import { Rng } from './rng';
import { chestForWave } from './config';

// ── XP sources (the tunables) ───────────────────────────────────────────────
// One table, consumed by meta's settle fold. Values are calibrated against the persona
// simulator (docs/BALANCE_ARCHITECTURE.md §4): a first run pays a level or two; a deep
// late-game run pays a healthy fraction of one.
export const ACCOUNT_XP = {
  kill: 1, // per enemy felled
  bossKill: 40, // per assembled boss felled (stats.bossKills)
  megaKill: 250, // per Mega Boss felled (stats.megaKills)
  wave: 12, // per wave survived, any mode
  win: 150, // any victorious run
  campaignClearPerStage: 6, // stage-N first-or-repeat clear bonus: N × this
  campaignFirstClear: 120, // discovery premium on a first clear
  dailyComplete: 300, // the day's gauntlet completed
  bossRushWavePremium: 10, // rush waves pay this ON TOP of `wave` (the gauntlet is denser)
  contract: 250, // per Champion Contract honoured (docs/CONTRACTS.md)
  perfectWeek: 600, // the week's whole contract board swept (rides PERFECT_WEEK cores)
  // Acquisition XP (the dopamine ledger, docs/PROGRESSION-GATING.md): every permanent
  // acquisition — a star, an upgrade level, a gene level, a hero, a molt — advances the account.
  acquisition: 15,
  molt: 500, // a MOLT is a chapter, not an acquisition
  achievement: 100, // per achievement unlocked
  tutorialComplete: 200, // one-time onboarding completion (combat tutorial / hud tour grants)
} as const;

// ── Depth XP (docs/ACCOUNT-LEVEL.md §depth) ─────────────────────────────────
// A run's PLAY XP (kills, bosses, waves, wins, clears, dailies) scales with the account's DEPTH —
// the same depth the gear chase reads (deepest cleared Campaign stage, or the Infinite record ×
// ITEM_LEVEL_CURVE.infiniteWeight). Kills/waves per minute plateau at depth while the curve keeps
// rising, so without this the lane slowed to ~0.3 levels/hour by hour 100 (grind audit G2). The
// curve itself never changes (no retroactive level jumps). ×1 through `from` (onboarding untouched),
// then 1 + ((depth − from) / span)^exp: smooth, monotonic, uncapped — calibrated on the persona sim
// to a level-up every ~50–75 min from hour 10 to hour 400.
export const ACCOUNT_XP_DEPTH = { from: 30, span: 25, exp: 1.6 } as const;

/** The play-XP multiplier at an account depth (≥ 1; exactly 1 at/below `from`). */
export function depthXpMult(depth: number): number {
  const { from, span, exp } = ACCOUNT_XP_DEPTH;
  const over = Math.max(0, depth - from);
  return over > 0 ? 1 + Math.pow(over / span, exp) : 1;
}

// ── The curve (uncapped) ────────────────────────────────────────────────────
// Per-level requirement: BASE + GROWTH · n^EXP — smooth, spike-free, forever-rising.
// Leveling therefore SLOWS with depth while staying attainable (no walls: the ratio
// req(n+1)/req(n) → 1 as n grows).
export const ACCOUNT_CURVE = { base: 80, growth: 40, exp: 1.25 } as const;

/** XP required to go from level n to n+1 (n ≥ 1). */
export function xpForLevel(n: number): number {
  const { base, growth, exp } = ACCOUNT_CURVE;
  return Math.round(base + growth * Math.pow(n, exp));
}

/** Level for a lifetime-XP total (level 1 at 0 XP; strictly monotonic; uncapped). */
export function levelFromXp(totalXp: number): number {
  let xp = Math.max(0, totalXp);
  let level = 1;
  // Linear walk is O(levels) — fine for live saves (levels grow ~log-ish in playtime). The
  // uncapped/overflow property test walks 100k levels in μs because each step is arithmetic.
  for (;;) {
    const need = xpForLevel(level);
    if (xp < need) return level;
    xp -= need;
    level++;
  }
}

/** Progress view for bars: current level, xp into it, and the requirement. */
export function levelProgress(totalXp: number): { level: number; into: number; need: number } {
  let xp = Math.max(0, totalXp);
  let level = 1;
  for (;;) {
    const need = xpForLevel(level);
    if (xp < need) return { level, into: xp, need };
    xp -= need;
    level++;
  }
}

/** Total XP required to REACH level n from 0 (closed-form-ish; used by tests/tools). */
export function totalXpForLevel(n: number): number {
  let sum = 0;
  for (let i = 1; i < n; i++) sum += xpForLevel(i);
  return sum;
}

// ── Milestones (infinite) ───────────────────────────────────────────────────
// Named early landmarks, then every 500 forever — a milestone always lies ahead.
export const MILESTONE_LEVELS = [10, 25, 50, 100, 250, 500, 1000] as const;

export function isMilestoneLevel(n: number): boolean {
  return (MILESTONE_LEVELS as readonly number[]).includes(n) || (n > 1000 && n % 500 === 0);
}

/** The next milestone at or above `n` (for "next milestone" previews — always exists). */
export function nextMilestone(n: number): number {
  for (const m of MILESTONE_LEVELS) if (m >= n) return m;
  return Math.ceil(n / 500) * 500;
}

// ── Milestone identity (titles + frames ride the EXISTING profile systems) ──
export interface AccountTitle { id: string; name: string; level: number }
export const ACCOUNT_TITLES: AccountTitle[] = [
  { id: 'acct_t10', name: 'Taking Root', level: 10 },
  { id: 'acct_t25', name: 'Established Strain', level: 25 },
  { id: 'acct_t50', name: 'Evergreen Organism', level: 50 },
  { id: 'acct_t100', name: 'Century Bloom', level: 100 },
  { id: 'acct_t250', name: 'Old Growth', level: 250 },
  { id: 'acct_t500', name: 'Deep Symbiont', level: 500 },
  { id: 'acct_t1000', name: 'Millennial Hive', level: 1000 },
];
export const ACCOUNT_TITLE_BY_ID = new Map(ACCOUNT_TITLES.map((t) => [t.id, t] as const));

// ── Procedural per-level rewards ────────────────────────────────────────────
// Weighted pools + level-scaled magnitudes. Deterministic per level (seeded by the level
// number), so the reward track is a shared, previewable ladder — and a pure function.

export interface AccountLevelReward {
  cores: number;
  essence: number;
  towerShards: number; // meta assigns them to a deterministic tower kind
  heroShards: number;
  mats: { mutagen: number; scrap: number; catalyst: number };
  ichor: number;
  /** Bio-Container chest ids to bank (kind 'cache'). */
  containers: string[];
  titleId?: string; // milestone identity (ACCOUNT_TITLES)
  milestone: boolean;
}

/** Deep-level payout re-weighting (docs/ACCOUNT-LEVEL.md §depth). Depth XP makes deep levels arrive
 *  ~2–4× as often, so each pays a smaller share — more frequent, smaller beats, with level-reward
 *  value per hour within −14…+18 % of the pre-depth economy per play band (±1 % over 30–400 h,
 *  sim-measured). Levels ≤ `fromLevel`
 *  pay exactly what they always did; past it the budget divides by 1 + k·ln(n / fromLevel), which
 *  dips to ~45 by L100 and then creeps back up (budget ∝ n^0.7 / ln n — deep levels never shrink to
 *  nothing). Containers: one every `every` levels, the interval widening by `every` each `widenEvery`
 *  levels (every 5th to L50, every 10th to L100, every 15th to L150 … always on round levels). */
export const ACCOUNT_REWARD_DEPTH = { fromLevel: 42, k: 3, every: 5, widenEvery: 50 } as const;

/** Reward VALUE budget for level n — deliberately sublinear (n^0.7) vs the n^1.25 curve, re-weighted
 *  past ACCOUNT_REWARD_DEPTH.fromLevel. */
function valueBudget(n: number): number {
  const { fromLevel, k } = ACCOUNT_REWARD_DEPTH;
  const base = 18 + 6 * Math.pow(n, 0.7);
  return n > fromLevel ? base / (1 + k * Math.log(n / fromLevel)) : base;
}

/** Does reaching `level` bank the periodic Bio-Container? (Milestones add their own on top.) */
export function isContainerLevel(level: number): boolean {
  const { every, widenEvery } = ACCOUNT_REWARD_DEPTH;
  return level > 0 && level % (every * Math.ceil(level / widenEvery)) === 0;
}

interface PoolRow { kind: 'cores' | 'essence' | 'towerShards' | 'heroShards' | 'mats' | 'ichor'; weight: number; minLevel: number }
/** The weighted pool (DATA — a future currency is one row + one apply line in meta). */
export const ACCOUNT_REWARD_POOL: PoolRow[] = [
  { kind: 'cores', weight: 30, minLevel: 1 },
  { kind: 'essence', weight: 16, minLevel: 3 }, // genes reveal early (docs/UNLOCK-TREE.md)
  { kind: 'towerShards', weight: 20, minLevel: 2 },
  { kind: 'heroShards', weight: 12, minLevel: 4 },
  { kind: 'mats', weight: 10, minLevel: 5 },
  { kind: 'ichor', weight: 3, minLevel: 12 }, // rare by design — the premium trickle stays a trickle
];

/** The deterministic reward for reaching `level`. Every level pays SOMETHING. */
export function accountLevelReward(level: number): AccountLevelReward {
  const rng = new Rng(hashStr(`account-level:${level}`));
  const out: AccountLevelReward = {
    cores: 0, essence: 0, towerShards: 0, heroShards: 0,
    mats: { mutagen: 0, scrap: 0, catalyst: 0 }, ichor: 0, containers: [],
    milestone: isMilestoneLevel(level),
  };
  const budget = valueBudget(level);

  // Base roll: one weighted pool pick (milestones roll two).
  const rolls = out.milestone ? 2 : 1;
  const eligible = ACCOUNT_REWARD_POOL.filter((r) => level >= r.minLevel);
  for (let i = 0; i < rolls; i++) {
    const total = eligible.reduce((a, r) => a + r.weight, 0);
    let pick = rng.next() * total;
    const row = eligible.find((r) => (pick -= r.weight) <= 0) ?? eligible[0];
    switch (row.kind) {
      case 'cores': out.cores += Math.round(budget); break;
      case 'essence': out.essence += Math.round(budget * 2.2); break; // essence is a cheaper unit
      case 'towerShards': out.towerShards += Math.max(2, Math.round(budget / 6)); break;
      case 'heroShards': out.heroShards += Math.max(1, Math.round(budget / 10)); break;
      case 'mats': {
        const m = (['mutagen', 'scrap', 'catalyst'] as const)[Math.floor(rng.next() * 3)];
        out.mats[m] += Math.max(1, Math.round(budget / 9));
        break;
      }
      case 'ichor': out.ichor += 1 + Math.floor(rng.next() * 2); break;
    }
  }
  // A guaranteed core floor so no level ever feels empty.
  if (out.cores === 0) out.cores = Math.max(5, Math.round(budget * 0.35));

  // Periodic Bio-Container (every 5th level, widening at depth — isContainerLevel); tier scales
  // with level via the shared cache ladder.
  if (isContainerLevel(level)) out.containers.push(chestForWave(Math.min(14, 3 + Math.floor(level / 10))));

  // Milestones: a big package + identity.
  if (out.milestone) {
    out.cores = Math.round(out.cores * 4 + budget * 3);
    out.ichor += level >= 100 ? 5 : 2;
    out.containers.push(level >= 100 ? 'prime' : 'rich');
    const title = ACCOUNT_TITLES.find((t) => t.level === level);
    if (title) out.titleId = title.id;
  }
  return out;
}

// ── Weekly / monthly XP ledgers (leaderboard feed) ──────────────────────────
/** ISO-ish period keys (UTC): week = "2026-W28", month = "2026-07". */
export function weekKey(now: number): string {
  const d = new Date(now);
  // ISO week number (UTC): Thursday-anchored.
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
export function monthKey(now: number): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
