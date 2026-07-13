// DAILY BIO-CACHE (docs/DAILY-LOGIN.md) — the login-streak faucet: one living cache per UTC
// day, sized by an internal ICHOR-VALUE (IV) budget and paid as a procedurally VARIED bundle
// speaking the shared PassReward language (state/meta.applyRewardList interprets it — this
// module never grants anything itself).
//
// The economics in one line: every day generates a target IV budget
//     target = base(lifetimeLogins) × streakMult(currentStreak)
// and the generator converts that budget into 2–3 weighted reward lanes whose quantities are
// priced off LANE_VALUE — canonical IV-per-unit rates anchored to the LIVE economy (the Ichor
// Exchange pocket rates + Splice Market retail, cited per line below). Rewards vary day to
// day; their VALUE tracks the curve. Balance lives in this one table.
//
// Curve contracts (pinned by loginStreak.test.ts):
//   • streakMult increases on EVERY consecutive day, never caps, never explodes (√ growth:
//     ×1.24 @ 30d · ×1.86 @ 365d · ×2.35 @ 1000d · ×3.72 @ 10y).
//   • base grows gently with LIFETIME logins (ln), so veterans open richer caches even after
//     a broken streak. Missing a day resets ONLY the streak multiplier — lifetime count,
//     collections, titles and Genome Rank credit are permanent by construction.
//   • The roll is a PURE function of (dayKey, lifetimeLogins, streak): preview, claim and a
//     reload all agree, and tomorrow's cache is previewable by rolling tomorrow's inputs.
//
// PURE core: no save, no DOM, no Date.now() — the meta layer owns the day gate (once per UTC
// day, forged-future keys self-heal by waiting), the grant, and the ceremony receipt.

import type { PassReward } from './battlePass';
import { hashStr } from './hash';
import { HERO_ORDER, TOWER_ORDER } from './config';

// ── Tunables ────────────────────────────────────────────────────────────────────────────────
export const LOGIN = {
  /** Day-one cache budget in IV (≈ this ×10 in Genome Cores at the pocket exchange rate). */
  baseValue: 6,
  /** Lifetime growth: base = baseValue + baseGrowth·ln(1 + lifetime/30). */
  baseGrowth: 2.2,
  /** Streak growth: mult = 1 + streakStep·√(streak−1) — slight daily rise, uncapped. */
  streakStep: 0.045,
  /** Random lanes per cache: 2, or 3 when the third-lane roll hits. */
  thirdLaneOdds: 0.4,
  /** Season XP the cache may carry at most per day (≈ half a pass level — pace-safe). */
  passXpCap: 300,
  /** The extremely-rare cosmetic jackpot: ~1 cache in this many carries a login-drop item. */
  jackpotOdds: 220,
  /** Owned jackpot/permanent repeats pay this instead (applyRewardList's replacement bundle). */
  repeatReplacement: { ichor: 6, cores: 120 },
} as const;

/** Streak milestones whose cache carries a GUARANTEED Bio-Container on top of the budget —
 *  the "tomorrow preview" anticipation beats. Every full year of unbroken streak re-pays the
 *  legendary (streak % 365 === 0). */
export const LOGIN_MILESTONE_CONTAINER: Record<number, 'rare' | 'epic' | 'legendary'> = {
  7: 'rare',
  30: 'epic',
  100: 'legendary',
};

/** Login-exclusive jackpot cosmetics (wardrobe rows with source kind 'login-drop'). Seeded
 *  pick; an already-owned hit pays LOGIN.repeatReplacement via the shared interpreter. */
export const LOGIN_JACKPOT_IDS = ['wd_projectiletrail_ichor_wake', 'wd_cardframe_caul_filigree'] as const;

// ── The curve ───────────────────────────────────────────────────────────────────────────────
/** Base cache value (IV) for a lifetime-login count — grows forever, slows forever. */
export function loginBaseValue(lifetime: number): number {
  return LOGIN.baseValue + LOGIN.baseGrowth * Math.log(1 + Math.max(0, lifetime) / 30);
}

/** The infinite compounding streak multiplier. Day 1 = ×1; strictly increasing after. */
export function streakMult(streak: number): number {
  return 1 + LOGIN.streakStep * Math.sqrt(Math.max(0, streak - 1));
}

/** The day's target reward value in IV, to one decimal. */
export function loginTargetValue(lifetime: number, streak: number): number {
  return Math.round(loginBaseValue(lifetime) * streakMult(streak) * 10) / 10;
}

// ── IV valuation (the balance ledger) ──────────────────────────────────────────────────────
/** IV per UNIT of each grantable — anchored to live rates:
 *  cores/essence: Ichor Exchange pocket rates (core/ichorExchange.ts EXCHANGE_RATE0 — 10 cores,
 *  ~5 essence per Ichor). Shards: Splice Market premium lots (≈6 strain, ≈1.5 apex per Ichor).
 *  Mats: exchange scrap ~1 IV, mutagen softer, catalyst scarcest (mirrors hive/market spreads).
 *  Containers: Splice Market retail (30/48/75/115). Run Cache: between common and rare.
 *  Stamina: market pack (8 Ichor / 20). Season XP: ~half the level-buy retail (15–33 per
 *  ~617 XP level) — a faucet may undercut the store, never embarrass it. */
export const LANE_VALUE = {
  cores: 0.1,
  geneEssence: 0.2,
  towerShardEach: 1 / 6,
  heroShardEach: 1 / 1.5,
  mutagen: 0.8,
  scrap: 1.2,
  catalyst: 2.0,
  container: { common: 30, rare: 48, epic: 75, legendary: 115 } as Record<string, number>,
  runCache: 12,
  rushStamina: 0.4,
  passXp: 0.02,
  ichor: 1,
} as const;

/** IV value of one PassReward line under LANE_VALUE (cosmetics are uncosted gifts). */
export function rewardValue(r: PassReward): number {
  switch (r.kind) {
    case 'cores': return r.qty * LANE_VALUE.cores;
    case 'geneEssence': return r.qty * LANE_VALUE.geneEssence;
    case 'ichor': return r.qty * LANE_VALUE.ichor;
    case 'mats': return (r.mutagen ?? 0) * LANE_VALUE.mutagen + (r.scrap ?? 0) * LANE_VALUE.scrap + (r.catalyst ?? 0) * LANE_VALUE.catalyst;
    case 'towerShardsAll': return r.qtyEach * TOWER_ORDER.length * LANE_VALUE.towerShardEach;
    case 'heroShardsAll': return r.qtyEach * HERO_ORDER.length * LANE_VALUE.heroShardEach;
    case 'container': return (LANE_VALUE.container[r.rarity] ?? 30) * r.count;
    case 'runCache': return r.count * LANE_VALUE.runCache;
    case 'rushStamina': return r.qty * LANE_VALUE.rushStamina;
    default: return 0; // cosmetic / phenotype / passive / stack — never budget-priced here
  }
}

// ── The procedural bundle ───────────────────────────────────────────────────────────────────
export interface LoginBundle {
  rewards: PassReward[];
  passXp: number; // Season XP rider (granted via meta.grantPassXp — not a PassReward kind)
  value: number; // Σ IV actually granted (≈ target; milestone containers ride on top)
  target: number; // the curve's budget for the day
  jackpot: boolean; // the extremely-rare cosmetic rode along
  milestone: 'rare' | 'epic' | 'legendary' | null; // guaranteed container, when the streak hits one
}

/** One deterministic stream per (day, lifetime) — same LCG family as the Ichor Exchange. */
function stream(key: string, lifetime: number): () => number {
  let h = hashStr(`login:${key}:${lifetime}`) || 1;
  return () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 0x1_0000_0000;
  };
}

/** The random lane pool: weight picks the lane, minIV keeps floor-quantity lanes out of small
 *  budgets (a day-one cache can't afford a Run Cache), roll converts a lane budget into a line. */
interface Lane {
  id: string;
  weight: number;
  minIV: number;
  roll: (iv: number, rng: () => number) => { reward?: PassReward; passXp?: number };
}

const LANES: Lane[] = [
  { id: 'cores', weight: 30, minIV: 1, roll: (iv) => ({ reward: { kind: 'cores', qty: Math.max(10, Math.round(iv / LANE_VALUE.cores / 5) * 5) } }) },
  { id: 'essence', weight: 16, minIV: 1, roll: (iv) => ({ reward: { kind: 'geneEssence', qty: Math.max(3, Math.round(iv / LANE_VALUE.geneEssence)) } }) },
  {
    id: 'mats', weight: 13, minIV: 1.6, roll: (iv, rng) => {
      // One or two material kinds, seeded — scrap-leaning (the crafting bottleneck).
      const kinds: ('mutagen' | 'scrap' | 'catalyst')[] = ['scrap', rng() < 0.5 ? 'mutagen' : 'catalyst'];
      const n = iv >= 3 && rng() < 0.6 ? 2 : 1;
      const out: { mutagen?: number; scrap?: number; catalyst?: number } = {};
      for (let i = 0; i < n; i++) out[kinds[i]] = Math.max(1, Math.round(iv / n / LANE_VALUE[kinds[i]]));
      return { reward: { kind: 'mats', ...out } };
    },
  },
  // The *ShardsAll lanes grant qtyEach to EVERY kind, so their minimum chunk COSTS a full
  // roster-each — derive minIV from that cost (roster-proof: new towers/heroes can never make
  // the smallest grant overshoot a small day's budget again).
  { id: 'towerShards', weight: 9, minIV: TOWER_ORDER.length * LANE_VALUE.towerShardEach, roll: (iv) => ({ reward: { kind: 'towerShardsAll', qtyEach: Math.max(1, Math.round(iv / (TOWER_ORDER.length * LANE_VALUE.towerShardEach))) } }) },
  { id: 'heroShards', weight: 8, minIV: HERO_ORDER.length * LANE_VALUE.heroShardEach, roll: (iv) => ({ reward: { kind: 'heroShardsAll', qtyEach: Math.max(1, Math.round(iv / (HERO_ORDER.length * LANE_VALUE.heroShardEach))) } }) },
  { id: 'runCache', weight: 8, minIV: 8, roll: (iv) => ({ reward: { kind: 'runCache', count: Math.max(1, Math.floor(iv / LANE_VALUE.runCache + 0.5)) } }) },
  { id: 'passXp', weight: 9, minIV: 1, roll: (iv) => ({ passXp: Math.min(LOGIN.passXpCap, Math.max(40, Math.round(iv / LANE_VALUE.passXp / 10) * 10)) }) },
  { id: 'stamina', weight: 4, minIV: 1.5, roll: (iv) => ({ reward: { kind: 'rushStamina', qty: Math.max(3, Math.min(15, Math.round(iv / LANE_VALUE.rushStamina))) } }) },
  { id: 'ichor', weight: 3, minIV: 2, roll: (iv) => ({ reward: { kind: 'ichor', qty: Math.max(2, Math.min(6, Math.round(iv))) } }) },
];

/** Weighted draw without replacement (eligible rows only). */
function drawLane(rng: () => number, pool: Lane[]): Lane {
  const total = pool.reduce((a, l) => a + l.weight, 0);
  let t = rng() * total;
  for (const l of pool) {
    t -= l.weight;
    if (t <= 0) return l;
  }
  return pool[pool.length - 1];
}

/** The guaranteed milestone container for a streak day (null off-milestone). A full year of
 *  unbroken devotion — and every year after — re-pays the legendary. */
export function milestoneContainer(streak: number): 'rare' | 'epic' | 'legendary' | null {
  if (streak > 0 && streak % 365 === 0) return 'legendary';
  return LOGIN_MILESTONE_CONTAINER[streak] ?? null;
}

/**
 * Roll the day's cache — pure + deterministic in (key, lifetime, streak).
 * Composition: [guaranteed milestone container when the streak hits one] + 2–3 weighted lanes
 * splitting the IV budget (shares seeded), quantities priced by LANE_VALUE with sane floors,
 * a Genome-Core top-up absorbing rounding shortfall, and the ~1-in-220 jackpot cosmetic.
 * Milestone containers ride ON TOP of the budget — those days are meant to feel oversized.
 */
export function rollLoginBundle(key: string, lifetime: number, streak: number): LoginBundle {
  const rng = stream(key, lifetime);
  const target = loginTargetValue(lifetime, streak);
  const rewards: PassReward[] = [];
  let passXp = 0;

  const milestone = milestoneContainer(streak);
  if (milestone) rewards.push({ kind: 'container', rarity: milestone, count: 1 });

  // 2–3 random lanes over the full budget (milestone rides on top — see docstring).
  const laneCount = rng() < LOGIN.thirdLaneOdds ? 3 : 2;
  const pool = LANES.filter((l) => l.minIV <= target / laneCount);
  const picked: Lane[] = [];
  while (picked.length < laneCount && pool.length > 0) {
    const lane = drawLane(rng, pool);
    pool.splice(pool.indexOf(lane), 1);
    picked.push(lane);
  }
  // Seeded shares — jittered-uniform, normalized (never a degenerate 0-share lane).
  const shares = picked.map(() => 0.6 + rng() * 0.8);
  const shareSum = shares.reduce((a, b) => a + b, 0);
  for (let i = 0; i < picked.length; i++) {
    const out = picked[i].roll((target * shares[i]) / shareSum, rng);
    if (out.reward) rewards.push(out.reward);
    if (out.passXp) passXp += out.passXp;
  }

  // Rounding settlement: quantization drifts each lane a little — top up any shortfall in
  // Genome Cores (merging into an existing cores line) so Σ value tracks the curve.
  const paid = (): number => rewards.reduce((a, r) => a + rewardValue(r), 0) + passXp * LANE_VALUE.passXp - (milestone ? LANE_VALUE.container[milestone] : 0);
  const short = target - paid();
  if (short > 0.5) {
    const topUp = Math.round(short / LANE_VALUE.cores / 5) * 5;
    if (topUp > 0) {
      const cores = rewards.find((r): r is Extract<PassReward, { kind: 'cores' }> => r.kind === 'cores');
      if (cores) cores.qty += topUp;
      else rewards.push({ kind: 'cores', qty: topUp });
    }
  }

  // The extremely-rare jackpot — a login-exclusive wardrobe drop, ON TOP of everything.
  const jackpot = rng() < 1 / LOGIN.jackpotOdds;
  if (jackpot) rewards.push({ kind: 'cosmetic', id: LOGIN_JACKPOT_IDS[Math.floor(rng() * LOGIN_JACKPOT_IDS.length)] });

  return {
    rewards,
    passXp,
    value: Math.round((rewards.reduce((a, r) => a + rewardValue(r), 0) + passXp * LANE_VALUE.passXp) * 10) / 10,
    target,
    jackpot,
    milestone,
  };
}
