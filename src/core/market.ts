// Splice Market — the refreshing store + the Ichor premium-currency economy (docs/MARKET.md).
// PURE core: window math, the deterministic stock roll, and every economy tunable live here;
// no save/DOM/store imports (mirrors core/conveyor.ts). The meta layer owns purchases.
//
// Determinism contract: a window's stock is a pure function of (profile marketSeed, window
// index, owned roster) — reloading mid-window shows identical stock, clocks can't forge new
// stock (see the max-window rule in meta.buyMarketSlot), and tests pin distributions exactly.

import { Rng } from './rng';
import type { TowerKind } from './types';

// ── Ichor — the premium currency's complete faucet/sink table (docs/MARKET.md §ichor) ──────
// Front-loaded by design: achievements/collection/campaign dominate early accounts, then the
// tap tightens to depth records + the container gamble. The gamble's EV sits deliberately
// UNDER water (marketEconomy.test pins it) so lucky streaks fund a few extra containers but
// always die out.
export const ICHOR = {
  starterVial: 30, // one-time grant on first opening the market — everyone tastes the loop
  /** Per-achievement grant, tiered by the achievement's Genome Core reward size. */
  achievementSmall: 3, // core reward ≤ 20 (or none)
  achievementMid: 5, // core reward 21–50
  achievementBig: 8, // core reward > 50
  collectionRank: 5, // per collection rank gained (persisted paid-rank record — never re-paid)
  campaignEvery: 5, // every Nth campaign stage…
  campaignAmount: 12, // …pays this on FIRST clear only
  infiniteBand: 5, // every Nth Infinite wave…
  infinitePerBand: 2, // …pays this per NEW band of the best-wave RECORD (un-farmable)
  // Boss Rush — the PRIMARY repeatable Ichor lane (docs/BOSS-RUSH.md §ichor). Keyed to the
  // single-run boss RECORD (save.rushBestBoss), same un-farmable band construction: matching
  // your record pays nothing; every NEW band of 5 bleeds Ichor, every NEW band of 10 also
  // drops a weighted-common Bio-Container.
  rushBossBand: 5, // every Nth NEW record boss…
  rushBossPerBand: 2, // …pays this Ichor
  rushVaultBand: 10, // every Nth NEW record boss additionally drops a Bio-Container…
  rushVaultWeights: [
    ['common', 55],
    ['rare', 28],
    ['epic', 12],
    ['legendary', 4],
    ['exotic', 1],
  ] as const, // …of this rarity (weighted hard toward common)
  // The container gamble: an independent roll per opened Bio-Container. No pity — this is
  // the luck engine. Premium (epic+) containers bleed a little more often.
  dropChance: 0.22,
  dropChancePremium: 0.26,
  dropTable: [
    [10, 0.5],
    [18, 0.3],
    [26, 0.15],
    [40, 0.05], // the only drop exceeding the cheapest container price — the jackpot beat
  ] as const,
} as const;

/** Ichor granted for an achievement, tiered by its Genome Core reward size. */
export function ichorForAchievement(coreReward: number): number {
  if (coreReward > 50) return ICHOR.achievementBig;
  if (coreReward > 20) return ICHOR.achievementMid;
  return ICHOR.achievementSmall;
}

/** The container gamble: 0 (no bleed) or a table amount. `rng` is a [0,1) source. */
export function rollIchorDrop(rng: () => number, premium: boolean): number {
  if (rng() >= (premium ? ICHOR.dropChancePremium : ICHOR.dropChance)) return 0;
  let r = rng();
  for (const [amount, p] of ICHOR.dropTable) {
    r -= p;
    if (r < 0) return amount;
  }
  return ICHOR.dropTable[ICHOR.dropTable.length - 1][0];
}

/** New-band Infinite payout: bands of `infiniteBand` waves FIRST reached this run. */
export function ichorForDepthRecord(prevBestWave: number, wave: number): number {
  const prev = Math.floor(Math.max(0, prevBestWave) / ICHOR.infiniteBand);
  const now = Math.floor(Math.max(0, wave) / ICHOR.infiniteBand);
  return Math.max(0, now - prev) * ICHOR.infinitePerBand;
}

/** New-band Boss Rush payout: bands of `rushBossBand` bosses FIRST felled in a single run.
 *  Record semantics: record 10 → an 11-boss run pays 0 (band 15 not reached); 15 pays once. */
export function ichorForBossRecord(prevBestBoss: number, bosses: number): number {
  const prev = Math.floor(Math.max(0, prevBestBoss) / ICHOR.rushBossBand);
  const now = Math.floor(Math.max(0, bosses) / ICHOR.rushBossBand);
  return Math.max(0, now - prev) * ICHOR.rushBossPerBand;
}

/** Bio-Containers owed for NEW `rushVaultBand` bands of the single-run boss record. */
export function vaultsForBossRecord(prevBestBoss: number, bosses: number): number {
  const prev = Math.floor(Math.max(0, prevBestBoss) / ICHOR.rushVaultBand);
  return Math.max(0, Math.floor(Math.max(0, bosses) / ICHOR.rushVaultBand) - prev);
}

/** Roll one record-band vault's rarity (weighted hard toward common). `rng` is [0,1). */
export function rollRushVaultRarity(rng: () => number): string {
  const total = ICHOR.rushVaultWeights.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [rarity, w] of ICHOR.rushVaultWeights) {
    r -= w;
    if (r < 0) return rarity;
  }
  return ICHOR.rushVaultWeights[0][0];
}

/** The next record boss count that pays Ichor — the "Lifetime Bosses 13/15" display base. */
export function nextRushIchorAt(bestBoss: number): number {
  return (Math.floor(Math.max(0, bestBoss) / ICHOR.rushBossBand) + 1) * ICHOR.rushBossBand;
}

// ── The market itself ───────────────────────────────────────────────────────────────────────

export const MARKET = {
  refreshMs: 300_000, // 5-minute stock windows
  slots: 8, // 4 core-priced + 3 ichor-priced + 1 container (a 2nd container may replace an ichor slot)
  secondContainerChance: 0.25,
  containerWeights: [
    ['common', 42],
    ['rare', 30],
    ['epic', 18],
    ['legendary', 8],
    ['exotic', 2],
  ] as const,
  containerPrice: { common: 30, rare: 48, epic: 75, legendary: 115, exotic: 170 } as Record<string, number>,
  equipWeights: [
    ['rare', 60],
    ['epic', 34],
    ['legendary', 6],
  ] as const,
  equipPrice: { rare: 12, epic: 20, legendary: 34 } as Record<string, number>,
  staminaPackPrice: 8, // Boss Rush stamina pack: +staminaPackQty entry fuel for Ichor…
  staminaPackQty: 20, // …one extra gauntlet entry per pack (overflow-capped on grant)
  mtxEnabled: false, // the premium-acquire seam stays CLOSED — no payment code exists
} as const;

export type MarketGood =
  | { good: 'towerShards'; kind: TowerKind; qty: number }
  | { good: 'heroShards'; hero: string; qty: number }
  | { good: 'scrap'; qty: number }
  | { good: 'geneEssence'; qty: number }
  | { good: 'equipment'; equipRarity: 'rare' | 'epic' | 'legendary' } // concrete item rolls at purchase
  | { good: 'container'; rarity: string }
  | { good: 'stamina'; qty: number }; // Boss Rush entry fuel (docs/BOSS-RUSH.md §stamina)

export interface MarketSlot {
  id: string; // stable within its window: `${window}:${index}`
  pay: 'cores' | 'ichor';
  price: number; // integer ≥ 1
  item: MarketGood;
}

/** The roster the stock may draw from — owned kinds only (locked content never stocks). */
export interface MarketRoster {
  towers: readonly TowerKind[]; // non-empty by construction (starters always owned)
  heroes: readonly string[]; // unlocked heroes; non-empty by construction (starter hero)
}

/** Current stock window for a clock value. */
export function marketWindow(now: number): number {
  return Math.floor(now / MARKET.refreshMs);
}

/** Milliseconds until the NEXT window begins (for the refresh countdown). */
export function msToNextWindow(now: number): number {
  return MARKET.refreshMs - (now % MARKET.refreshMs);
}

/** Seed mixer — one Rng stream per (profile, window); avalanche via golden-ratio multiply. */
function windowRng(seed: number, window: number): Rng {
  return new Rng(((seed >>> 0) ^ (Math.imul(window, 0x9e3779b1) >>> 0)) >>> 0);
}

/**
 * Roll a window's stock — 8 slots, deterministic in (seed, window, roster order).
 * Layout: slots 0–3 core-priced small goods (one of each family, shuffled), slots 4+ the
 * ichor tier (big bundles / equipment), container(s) LAST. A second container (25% of
 * windows) REPLACES an ichor-goods slot — never a 9th slot.
 */
export function rollStock(seed: number, window: number, roster: MarketRoster): MarketSlot[] {
  const rng = windowRng(seed, window);
  const towers = roster.towers.length > 0 ? roster.towers : (['needle'] as TowerKind[]);
  const heroes = roster.heroes.length > 0 ? roster.heroes : ['ravager'];

  // Core tier — one of each small-goods family, order shuffled per window for variety.
  const core: { price: number; item: MarketGood }[] = [];
  {
    const qtyT = 5 + rng.int(11); // 5–15
    core.push({ price: 8 * qtyT, item: { good: 'towerShards', kind: rng.pick(towers), qty: qtyT } });
    const qtyH = 2 + rng.int(4); // 2–5
    core.push({ price: 22 * qtyH, item: { good: 'heroShards', hero: rng.pick(heroes), qty: qtyH } });
    const qtyS = 2 + rng.int(5); // 2–6
    core.push({ price: 18 * qtyS, item: { good: 'scrap', qty: qtyS } });
    const qtyE = 3 + rng.int(8); // 3–10
    core.push({ price: 12 * qtyE, item: { good: 'geneEssence', qty: qtyE } });
    for (let i = core.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [core[i], core[j]] = [core[j], core[i]];
    }
  }

  // Ichor tier — 3 distinct rows from the premium pool (5 authored rows).
  const premiumPool: (() => { price: number; item: MarketGood })[] = [
    () => {
      const qty = 40 + rng.int(41); // 40–80
      return { price: Math.ceil(qty / 6), item: { good: 'towerShards', kind: rng.pick(towers), qty } };
    },
    () => {
      const qty = 8 + rng.int(9); // 8–16
      return { price: Math.ceil(qty / 1.5), item: { good: 'heroShards', hero: rng.pick(heroes), qty } };
    },
    () => {
      const r = rng.pickWeighted(MARKET.equipWeights as readonly (readonly [string, number])[]) as 'rare' | 'epic' | 'legendary';
      return { price: MARKET.equipPrice[r], item: { good: 'equipment', equipRarity: r } };
    },
    () => {
      const qty = 25 + rng.int(26); // 25–50
      return { price: Math.ceil(qty / 4), item: { good: 'geneEssence', qty } };
    },
    () => ({ price: MARKET.staminaPackPrice, item: { good: 'stamina', qty: MARKET.staminaPackQty } }),
  ];
  // pick 3 distinct row indices, order-preserving
  const dropA = rng.int(premiumPool.length);
  let dropB = rng.int(premiumPool.length - 1);
  if (dropB >= dropA) dropB++;
  const premium = premiumPool.filter((_, i) => i !== dropA && i !== dropB).map((f) => f());

  // Container(s) — the premium centerpiece. A 2nd one replaces an ichor-goods row.
  const containers: { price: number; item: MarketGood }[] = [];
  const roll = (): void => {
    const rarity = rng.pickWeighted(MARKET.containerWeights as readonly (readonly [string, number])[]);
    containers.push({ price: MARKET.containerPrice[rarity], item: { good: 'container', rarity } });
  };
  roll();
  if (rng.chance(MARKET.secondContainerChance)) {
    premium.pop(); // replaced, never appended — always exactly MARKET.slots slots
    roll();
  }

  const rows: { pay: 'cores' | 'ichor'; price: number; item: MarketGood }[] = [
    ...core.map((r) => ({ pay: 'cores' as const, ...r })),
    ...premium.map((r) => ({ pay: 'ichor' as const, ...r })),
    ...containers.map((r) => ({ pay: 'ichor' as const, ...r })),
  ];
  return rows.map((r, i) => ({ id: `${window}:${i}`, ...r }));
}
