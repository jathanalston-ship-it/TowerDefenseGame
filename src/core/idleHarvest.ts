// IDLE HARVEST (docs/IDLE-HARVEST.md) — the Hive keeps harvesting while the player is away.
// Pure model over config.IDLE: accrual closed forms, the infinite cap ladder, the evolution
// tree (10 infinite, soft-scaled, progression-GATED nodes), and the future-proof DROP REGISTRY
// (a new resource = one row: weight + gates; everything else integrates automatically).
// No DOM, no state, no Math.random — the harvest roll takes a seeded rng so collects are
// testable and receipts reproducible. meta owns application (wallet writes, ledger, guards).
//
// PHILOSOPHY (the §simulation guardrail pins it): playing is ALWAYS more rewarding than
// idling. The value budget is priced in core-equivalents (IDLE.valuePerUnit) and calibrated
// far below active farming at every progression band.
//
// CLOSED FORMS
//   rate(stage)       = baseCoresPerHour × (1 + stageGrowth·(stage−1)) × soft(speedLvl)
//   soft(L)           = 1 + per·L₀·ln(1 + L/L₀)      (the shared log easing; exactly 1 at 0)
//   capHours(L)       = ladder[L] … then 72 + capHoursBeyond·(L − 7)   (infinite)
//   effHours(rawH, L) = min(rawH, cap) + overflowFrac·min(max(rawH − cap, 0), cap)
//   budget            = rate × effHours × offlineEff × (bloom ? bloomBudgetMult : 1)

import { IDLE } from './config';
import { HIVE_PRODUCTION_IDENTITY, type HiveProductionBonus } from './hiveProduction';

// ── Soft scaling (shared by every multiplier node) ───────────────────────────────────────────
/** Log-eased multiplier: slope `per` at level 0, halved at L₀, unbounded but logarithmic. */
export function idleSoft(level: number, per: number): number {
  if (level <= 0) return 1;
  const l0 = IDLE.softScaleL0;
  return 1 + per * l0 * Math.log(1 + level / l0);
}

// ── Evolution tree ───────────────────────────────────────────────────────────────────────────
/** A progression gate a node tier (or a drop) may demand. Resolved against IdleGateContext —
 *  the six lenses the design names: Campaign, Genome Rank, Prestige, Boss Rush, Collections,
 *  Power Score. */
export type IdleGateReq =
  | { kind: 'campaign'; stage: number }
  | { kind: 'genomeRank'; rank: number } // 1-based rank index (core/genomeRank.ts)
  | { kind: 'molts'; count: number }
  | { kind: 'rushBest'; bosses: number }
  | { kind: 'collection'; completion: number } // overall Bio-Dex tier-weighted completion 0..1
  | { kind: 'power'; score: number };

/** Everything gate checks need, prebuilt by meta (core stays cycle-free). */
export interface IdleGateContext {
  stage: number;
  genomeRankIndex: number;
  molts: number;
  rushBest: number;
  collectionCompletion: number;
  power: number;
}

export function idleGateMet(ctx: IdleGateContext, req: IdleGateReq): boolean {
  switch (req.kind) {
    case 'campaign': return ctx.stage >= req.stage;
    case 'genomeRank': return ctx.genomeRankIndex >= req.rank;
    case 'molts': return ctx.molts >= req.count;
    case 'rushBest': return ctx.rushBest >= req.bosses;
    case 'collection': return ctx.collectionCompletion >= req.completion;
    case 'power': return ctx.power >= req.score;
  }
}

export function idleGateLabel(req: IdleGateReq): string {
  switch (req.kind) {
    case 'campaign': return `Campaign Stage ${req.stage}`;
    case 'genomeRank': return `Genome Rank ${req.rank}`;
    case 'molts': return `${req.count} Molt${req.count > 1 ? 's' : ''}`;
    case 'rushBest': return `${req.bosses} bosses in one Rush`;
    case 'collection': return `${Math.round(req.completion * 100)}% Bio-Dex completion`;
    case 'power': return `${req.score.toLocaleString('en-US')} Power`;
  }
}

export interface IdleNodeDef {
  id: string;
  name: string;
  glyph: string;
  blurb: string; // what the node grows, in hive language
  baseCost: number; // Chitin for level 1 (docs/ECONOMY.md §localized — the Hive builds itself)
  costGrowth: number; // geometric per level (every node is INFINITE)
  /** Per-level effect strength consumed by the accrual/roll (interpreted per node id). */
  per: number;
  /** Progression gates: buying a level ≥ `atLevel` demands `req`. Ascending; ALL matching rows
   *  must hold. The gate is a "work toward it" surface, never a dead end (docs/EVOLUTION-CAP.md
   *  taught the pattern). */
  gates: readonly { atLevel: number; req: IdleGateReq }[];
}

/** The ten launch nodes. Every one is infinite + soft-scaled; deeper tiers demand progression
 *  through all six gate lenses so idle capability grows WITH the account, not around it. */
export const IDLE_NODES: readonly IdleNodeDef[] = [
  { id: 'speed', name: 'Harvest Speed', glyph: '⚡', per: 0.05,
    blurb: 'The extraction veins pump faster — more value per banked hour.',
    baseCost: 60, costGrowth: 1.35,
    gates: [{ atLevel: 10, req: { kind: 'campaign', stage: 25 } }, { atLevel: 25, req: { kind: 'genomeRank', rank: 4 } }, { atLevel: 50, req: { kind: 'power', score: 100000 } }] },
  { id: 'capacity', name: 'Harvest Capacity', glyph: '⬢', per: 0,
    blurb: 'Grow the storage bladders — the Hive banks more hours before it brims.',
    baseCost: 100, costGrowth: 1.6,
    gates: [{ atLevel: 3, req: { kind: 'campaign', stage: 15 } }, { atLevel: 5, req: { kind: 'campaign', stage: 40 } }, { atLevel: 7, req: { kind: 'molts', count: 1 } }, { atLevel: 10, req: { kind: 'genomeRank', rank: 6 } }] },
  { id: 'rare', name: 'Rare Drop Chance', glyph: '✦', per: 0.04,
    blurb: 'Deeper strata open — the rare vein weights swell.',
    baseCost: 150, costGrowth: 1.4,
    gates: [{ atLevel: 5, req: { kind: 'campaign', stage: 20 } }, { atLevel: 20, req: { kind: 'collection', completion: 0.2 } }] },
  { id: 'containers', name: 'Container Chance', glyph: '◈', per: 0.05,
    blurb: 'Whole pods calcify around finds — Bio-Containers and Run Caches surface.',
    baseCost: 220, costGrowth: 1.45,
    gates: [{ atLevel: 1, req: { kind: 'campaign', stage: 10 } }, { atLevel: 10, req: { kind: 'rushBest', bosses: 5 } }] },
  { id: 'craft', name: 'Crafting Yield', glyph: '⚒', per: 0.05,
    blurb: 'The rendering glands thicken — more Mutagen, Scrap and Catalyst per harvest.',
    baseCost: 90, costGrowth: 1.35,
    gates: [{ atLevel: 15, req: { kind: 'campaign', stage: 30 } }] },
  { id: 'shards', name: 'Shard Yield', glyph: '✧', per: 0.05,
    blurb: 'Strain Samples and Apex Genome crystallize in the runoff.',
    baseCost: 90, costGrowth: 1.35,
    gates: [{ atLevel: 15, req: { kind: 'campaign', stage: 30 } }, { atLevel: 30, req: { kind: 'genomeRank', rank: 5 } }] },
  { id: 'xp', name: 'Idle XP', glyph: '⬆', per: 0.05,
    blurb: 'The Hive remembers — each collect feeds Account XP.',
    baseCost: 70, costGrowth: 1.35,
    gates: [{ atLevel: 20, req: { kind: 'campaign', stage: 35 } }] },
  { id: 'offline', name: 'Offline Efficiency', glyph: '☾', per: 0.03,
    blurb: 'The unattended Hive harvests at 70% — close the gap toward full song.',
    baseCost: 120, costGrowth: 1.5,
    gates: [{ atLevel: 5, req: { kind: 'campaign', stage: 20 } }, { atLevel: 10, req: { kind: 'genomeRank', rank: 4 } }] },
  { id: 'overflow', name: 'Overflow Storage', glyph: '∿', per: 0.05,
    blurb: 'Brimmed bladders weep into overflow sacs — over-cap hours keep a fraction.',
    baseCost: 200, costGrowth: 1.5,
    gates: [{ atLevel: 1, req: { kind: 'campaign', stage: 15 } }, { atLevel: 6, req: { kind: 'molts', count: 2 } }] },
  { id: 'events', name: 'Special Events', glyph: '❉', per: 0.01,
    blurb: 'Sometimes the Hive BLOOMS — a doubled harvest crowned with a guaranteed rare.',
    baseCost: 300, costGrowth: 1.5,
    gates: [{ atLevel: 1, req: { kind: 'campaign', stage: 25 } }, { atLevel: 10, req: { kind: 'collection', completion: 0.35 } }] },
];

export const IDLE_NODE_BY_ID: Record<string, IdleNodeDef> = Object.fromEntries(IDLE_NODES.map((n) => [n.id, n]));

/** Chitin cost of buying node level `level+1` (from `level`). Geometric — infinite. */
export function idleNodeCost(def: IdleNodeDef, level: number): number {
  return Math.round(def.baseCost * Math.pow(def.costGrowth, Math.max(0, level)));
}

/** The first unmet gate for buying TO `toLevel`, or null when the way is clear. */
export function idleNodeGate(def: IdleNodeDef, toLevel: number, ctx: IdleGateContext): IdleGateReq | null {
  for (const g of def.gates) if (toLevel >= g.atLevel && !idleGateMet(ctx, g.req)) return g.req;
  return null;
}

// ── Accrual ──────────────────────────────────────────────────────────────────────────────────
export type IdleNodeLevels = Record<string, number>;
const lvl = (nodes: IdleNodeLevels, id: string): number => Math.max(0, Math.floor(nodes[id] ?? 0));

/** Storage cap in hours at a Capacity level: the authored ladder, then +capHoursBeyond forever.
 *  `bonusHours` is the ARENA RANK storage benefit (docs/ARENA.md §8 — flat, ≤ 6h, division-
 *  derived); 0 (or omitted) ⇒ unchanged for every pre-arena call site. */
export function idleCapHours(nodes: IdleNodeLevels, bonusHours = 0): number {
  const l = lvl(nodes, 'capacity');
  const ladder = IDLE.capHoursLadder;
  const base = l < ladder.length ? ladder[l] : ladder[ladder.length - 1] + IDLE.capHoursBeyond * (l - (ladder.length - 1));
  return base + Math.max(0, bonusHours);
}

/** Offline efficiency 0.7 → 1.0 (never above full — idle may approach play, not pass it).
 *  `bonus` is the Hive-structure feed (docs/HIVE-PRODUCTION.md); the 1.0 cap holds it too. */
export function idleOfflineEff(nodes: IdleNodeLevels, bonus = 0): number {
  return Math.min(1, IDLE.baseOfflineEff + IDLE_NODE_BY_ID.offline.per * lvl(nodes, 'offline') + Math.max(0, bonus));
}

/** Fraction of a second cap-width of OVER-cap hours retained (0 → 0.5). */
export function idleOverflowFrac(nodes: IdleNodeLevels): number {
  return Math.min(0.5, IDLE_NODE_BY_ID.overflow.per * lvl(nodes, 'overflow'));
}

/** BLOOM chance per collect (Special Events node) — capped so it stays an event, not a norm.
 *  The Hive-structure `bonus` (crown spire, womb lullaby) rides INSIDE a slightly-lifted cap. */
export function idleBloomChance(nodes: IdleNodeLevels, bonus = 0): number {
  return Math.min(0.25 + Math.max(0, bonus), IDLE_NODE_BY_ID.events.per * lvl(nodes, 'events') + Math.max(0, bonus));
}

/** Core-equivalent budget per EFFECTIVE hour at a campaign stage + node levels. GENOME RANK
 *  DIVIDEND (docs/IDLE-HARVEST.md §rank, 2026-07): the mastery ladder feeds the harvest —
 *  each rank past I adds IDLE.rankGrowth to the rate ("the Hive harvests smarter as the
 *  organism masters more"). Rank I (or omitted) is exactly ×1, so fresh accounts and every
 *  pre-existing call site are unchanged; the idle<active guardrail bounds the whole model. */
export function idleRatePerHour(stage: number, nodes: IdleNodeLevels, rankIndex = 1, arenaMult = 1, hiveRateMult = 1): number {
  // ARENA RANK DIVIDEND (docs/ARENA.md §8): a second, DIMINISHING mastery-ladder feed —
  // core/arena.arenaIdleDividend, ×1 at division 0 (IEEE-identity for non-arena accounts)
  // and hard-capped at ×1.15, so the idle<active guardrail's headroom absorbs it whole.
  // HIVE STRUCTURE FEED (docs/HIVE-PRODUCTION.md): the built organism's rate lane — ×1 with
  // nothing built, capped by HIVE_PRODUCTION_CAPS; the guardrail bounds the merged model.
  return IDLE.baseCoresPerHour * (1 + IDLE.stageGrowth * Math.max(0, stage - 1))
    * (1 + IDLE.rankGrowth * Math.max(0, rankIndex - 1))
    * Math.max(1, arenaMult)
    * Math.max(1, hiveRateMult)
    * idleSoft(lvl(nodes, 'speed'), IDLE_NODE_BY_ID.speed.per);
}

export interface IdleAccrual {
  rawHours: number; // wall-clock hours since the last collect (clamped ≥ 0)
  effHours: number; // capped + overflow-retained hours the budget pays for
  capHours: number;
  overflowHours: number; // the retained over-cap portion of effHours
  full: boolean; // the bladders have brimmed (rawHours ≥ cap)
  ratePerHour: number;
  offlineEff: number;
  budget: number; // core-equivalents to spend through the drop registry
}

/** The whole accrual picture for `elapsedMs` away. Pure; negative/NaN elapsed folds to zero
 *  (clock-tamper clamps live in meta, but the math itself can never mint from junk).
 *  `arenaMult`/`arenaCapBonusHours` are the ARENA RANK benefits (docs/ARENA.md §8) — both
 *  identity (1 / 0) when omitted, so every pre-arena call site is byte-unchanged. */
export function idleAccrual(elapsedMs: number, stage: number, nodes: IdleNodeLevels, rankIndex = 1, arenaMult = 1, arenaCapBonusHours = 0, hive: HiveProductionBonus = HIVE_PRODUCTION_IDENTITY): IdleAccrual {
  const rawHours = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) / 3_600_000 : 0;
  const capHours = idleCapHours(nodes, arenaCapBonusHours + hive.capBonusHours);
  const overflowHours = idleOverflowFrac(nodes) * Math.min(Math.max(rawHours - capHours, 0), capHours);
  const effHours = Math.min(rawHours, capHours) + overflowHours;
  const ratePerHour = idleRatePerHour(stage, nodes, rankIndex, arenaMult, hive.rateMult);
  const offlineEff = idleOfflineEff(nodes, hive.offlineBonus);
  return {
    rawHours, effHours, capHours, overflowHours,
    full: rawHours >= capHours,
    ratePerHour, offlineEff,
    budget: ratePerHour * effHours * offlineEff,
  };
}

// ── The drop registry (future-proofing contract) ─────────────────────────────────────────────
/** What one registry row pays. meta APPLIES grants (wallet writes); the registry only shapes
 *  them — so a future currency is ONE row here + one apply-case there. */
export type IdleGrant =
  | { kind: 'cores'; qty: number }
  | { kind: 'mats'; mutagen: number; scrap: number; catalyst: number }
  | { kind: 'essence'; qty: number }
  | { kind: 'towerShards'; qtyEach: number }
  | { kind: 'heroShards'; qtyEach: number }
  | { kind: 'mulligan'; count: number }
  | { kind: 'container'; rarity: 'common' | 'uncommon' | 'rare' }
  | { kind: 'runCache' }
  | { kind: 'ichor'; qty: number }
  | { kind: 'hiveMats'; qty: number } // Chitin — the guaranteed lane (IDLE.hiveMatsShare), never a weighted row
  | { kind: 'tissue'; qty: number }; // Mulligan Tissue — hopper traces beside the dupe-dissolve faucet

export interface IdleDropDef {
  id: string;
  name: string;
  icon: string;
  /** Relative roll weight among ELIGIBLE rows (the whole future-proofing contract: eligibility +
   *  weight + the two gates below — everything else integrates automatically). */
  weight: number;
  minCampaign?: number; // absent ⇒ always eligible
  minGenomeRank?: number; // 1-based rank index
  rare?: boolean; // rides the Rare Drop node's weight multiplier + BLOOM's guaranteed pick
  /** Minimum core-equivalent SLICE value this row pays fairly. Slices below it skip the row.
   *  THE anti-dust-farm clause of the guardrail (idleHarvest.test.ts): fixed-price grants
   *  (containers, caches, mulligans) and batch grants (shards ×roster) ignore slice size, so
   *  without this floor a spam-collected 5-minute harvest would mint full-priced drops from
   *  near-zero budget. Rule of thumb: ≈ half the grant's real core-equivalent value. */
  minValue?: number;
  /** Turn a core-equivalent value slice into a concrete grant (unit prices: IDLE.valuePerUnit). */
  grant: (value: number, rng: () => number) => IdleGrant;
}

const unit = (id: string): number => IDLE.valuePerUnit[id] ?? 1;
const qtyFor = (value: number, per: number, min = 1): number => Math.max(min, Math.round(value / per));

export const IDLE_DROPS: readonly IdleDropDef[] = [
  { id: 'cores', name: 'Genome Cores', icon: '⬡', weight: 34,
    grant: (v) => ({ kind: 'cores', qty: qtyFor(v, unit('cores')) }) },
  { id: 'mats', name: 'Crafting Materials', icon: '⚒', weight: 16, minCampaign: 4, minValue: 1.25,
    grant: (v, rng) => {
      const units = qtyFor(v, unit('mats'));
      const mutagen = Math.round(units * (0.45 + rng() * 0.15));
      const scrap = Math.max(0, units - mutagen - (rng() < 0.12 ? 1 : 0));
      return { kind: 'mats', mutagen, scrap, catalyst: Math.max(0, units - mutagen - scrap) };
    } },
  { id: 'essence', name: 'Gene Essence', icon: '⌬', weight: 13, minCampaign: 3, minValue: 0.6,
    grant: (v) => ({ kind: 'essence', qty: qtyFor(v, unit('essence')) }) },
  // Mulligan Tissue traces (docs/ECONOMY.md §localized) — weight CARVED from the essence row
  // (16 → 13), not added: the hopper's total value is unchanged, a sliver of it just pays in the
  // Mulligan wallet. Gates mirror the modifier drop above — tissue is meaningless pre-Mulligans.
  { id: 'tissue', name: 'Mulligan Tissue', icon: '⊛', weight: 3, minCampaign: 12, minGenomeRank: 3, minValue: 0.6,
    grant: (v) => ({ kind: 'tissue', qty: qtyFor(v, unit('tissue')) }) },
  { id: 'towerShards', name: 'Strain Samples', icon: '✦', weight: 12, minCampaign: 2, minValue: 12,
    grant: (v) => ({ kind: 'towerShards', qtyEach: qtyFor(v / 8, unit('towerShard')) }) },
  { id: 'heroShards', name: 'Apex Genome', icon: '✧', weight: 8, minCampaign: 5, minValue: 15,
    grant: (v) => ({ kind: 'heroShards', qtyEach: qtyFor(v / 6, unit('heroShard')) }) },
  { id: 'mulligan', name: 'Mulligan Modifier', icon: '⧬', weight: 5, minCampaign: 12, minGenomeRank: 3, rare: true, minValue: 30,
    grant: () => ({ kind: 'mulligan', count: 1 }) },
  { id: 'container', name: 'Bio-Container', icon: '◈', weight: 4, minCampaign: 8, rare: true, minValue: 175,
    grant: (_v, rng) => ({ kind: 'container', rarity: rng() < 0.15 ? 'rare' : rng() < 0.5 ? 'uncommon' : 'common' }) },
  { id: 'runCache', name: 'Run Cache', icon: '⬢', weight: 3, minCampaign: 10, rare: true, minValue: 125,
    grant: () => ({ kind: 'runCache' }) },
  // NOTE: Bio-Roulette spores are deliberately ABSENT — they are minted from Boss Rush run
  // results (record-chase identity, never banked), so idling must not dilute them
  // (docs/IDLE-HARVEST.md §registry). A future banked wallet would make them one row here.
  { id: 'ichor', name: 'Ichor', icon: '🩸', weight: 1, minCampaign: 20, minGenomeRank: 5, rare: true, minValue: 20,
    grant: (v) => ({ kind: 'ichor', qty: Math.max(1, Math.min(3, Math.round(v / unit('ichor')))) }) },
];

/** Rows currently eligible for an account (the future-proofing filter). */
export function eligibleIdleDrops(ctx: IdleGateContext): IdleDropDef[] {
  return IDLE_DROPS.filter((d) =>
    (d.minCampaign === undefined || ctx.stage >= d.minCampaign) &&
    (d.minGenomeRank === undefined || ctx.genomeRankIndex >= d.minGenomeRank));
}

// ── The harvest roll ─────────────────────────────────────────────────────────────────────────
export interface IdleHarvestLine { dropId: string; name: string; icon: string; grant: IdleGrant; rare: boolean }
export interface IdleHarvestResult {
  lines: IdleHarvestLine[];
  bloom: boolean; // the Special-Events jackpot fired
  budget: number; // final core-equivalent budget spent (after bloom)
  xp: number; // account XP from the Idle XP node
}

/** Split the accrued budget into 3–6 weighted slices and shape each through the registry.
 *  Deterministic from `rng` (meta seeds it from the collect timestamp): testable, replayable
 *  receipts. Container-class drops are hard-capped per collect (fairness), and a BLOOM doubles
 *  the budget + guarantees one rare line. */
export function rollIdleHarvest(
  accrual: IdleAccrual,
  nodes: IdleNodeLevels,
  ctx: IdleGateContext,
  rng: () => number,
  hive: HiveProductionBonus = HIVE_PRODUCTION_IDENTITY,
): IdleHarvestResult {
  const bloom = rng() < idleBloomChance(nodes, hive.bloomBonus);
  const budget = accrual.budget * (bloom ? IDLE.bloomBudgetMult : 1);
  // THE CHITIN LANE (docs/ECONOMY.md §localized): a GUARANTEED top-slice of the budget pays the
  // Hive-Production build currency before the weighted roll — deterministic because organ growth
  // must never be drought-gated by drop RNG. Value-neutral: the weighted slices split the REMAINDER,
  // so the harvest's core-equivalent total is exactly what it was.
  const hiveMatsQty = Math.round((budget * IDLE.hiveMatsShare) / unit('hiveMats'));
  const sliceBudget = budget * (1 - IDLE.hiveMatsShare);
  const pool = eligibleIdleDrops(ctx);
  const rareMult = idleSoft(lvl(nodes, 'rare'), IDLE_NODE_BY_ID.rare.per) * hive.rareWeightMult;
  const containerMult = idleSoft(lvl(nodes, 'containers'), IDLE_NODE_BY_ID.containers.per) * hive.containerWeightMult;
  const craftMult = idleSoft(lvl(nodes, 'craft'), IDLE_NODE_BY_ID.craft.per) * hive.craftMult;
  const shardMult = idleSoft(lvl(nodes, 'shards'), IDLE_NODE_BY_ID.shards.per) * hive.shardMult;
  const weightOf = (d: IdleDropDef): number => {
    let w = d.weight;
    if (d.rare) w *= rareMult;
    if (d.id === 'container' || d.id === 'runCache') w *= containerMult;
    return w;
  };
  const lines: IdleHarvestLine[] = [];
  let containers = 0;
  const slices = Math.min(6, Math.max(3, Math.floor(accrual.effHours / 3) + 3));
  const baseSlice = sliceBudget / slices;
  for (let i = 0; i < slices; i++) {
    let slice = baseSlice;
    // The BLOOM's guaranteed rare rides the FIRST slice (when any AFFORDABLE rare row exists).
    const affordable = (d: IdleDropDef): boolean => baseSlice >= (d.minValue ?? 0);
    const mustRare = bloom && i === 0 && pool.some((d) => d.rare && affordable(d));
    const candidates = pool.filter((d) => {
      if (!affordable(d)) return false; // the anti-dust-farm floor (see IdleDropDef.minValue)
      if (containers >= IDLE.maxContainersPerCollect && (d.id === 'container' || d.id === 'runCache')) return false;
      return mustRare ? d.rare === true : true;
    });
    if (candidates.length === 0) continue;
    let total = 0;
    for (const d of candidates) total += weightOf(d);
    let u = rng() * total;
    let pick = candidates[candidates.length - 1];
    for (const d of candidates) { u -= weightOf(d); if (u < 0) { pick = d; break; } }
    if (pick.id === 'mats') slice *= craftMult;
    if (pick.id === 'towerShards' || pick.id === 'heroShards') slice *= shardMult;
    if (pick.id === 'container' || pick.id === 'runCache') containers++;
    lines.push({ dropId: pick.id, name: pick.name, icon: pick.icon, grant: pick.grant(slice, rng), rare: pick.rare === true });
  }
  // The Chitin lane lands LAST in roll order so a BLOOM's guaranteed rare still leads the raw
  // receipt; display order is owned by mergeIdleReceiptLines' currency sort either way.
  if (hiveMatsQty > 0) lines.push({ dropId: 'hiveMats', name: 'Chitin', icon: '⬣', grant: { kind: 'hiveMats', qty: hiveMatsQty }, rare: false });
  const xp = Math.round(accrual.effHours * 4 * idleSoft(lvl(nodes, 'xp'), IDLE_NODE_BY_ID.xp.per) * hive.xpMult);
  return { lines, bloom, budget, xp };
}

/** Price a whole harvest in core-equivalents (the idle<active guardrail's ruler; the ceremony's
 *  "efficiency" stat). Registry-driven, so future drops price themselves via valuePerUnit. */
export function idleGrantValue(g: IdleGrant): number {
  switch (g.kind) {
    case 'cores': return g.qty * unit('cores');
    case 'mats': return (g.mutagen + g.scrap + g.catalyst) * unit('mats');
    case 'essence': return g.qty * unit('essence');
    case 'towerShards': return g.qtyEach * 8 * unit('towerShard'); // paid to ~8 unlocked lanes
    case 'heroShards': return g.qtyEach * 6 * unit('heroShard');
    case 'mulligan': return g.count * unit('mulligan');
    case 'container': return unit('container');
    case 'runCache': return unit('runCache');
    case 'ichor': return g.qty * unit('ichor');
    case 'hiveMats': return g.qty * unit('hiveMats');
    case 'tissue': return g.qty * unit('tissue');
  }
}

/** The cheapest currently-buyable node (the ceremony's "grow this next" suggestion), or the
 *  nearest gate when everything affordable is progression-locked. `chitin` is the Hive wallet
 *  (save.hiveMaterials) — organs are priced in Chitin, never Genome Cores. */
export function idleSuggestion(nodes: IdleNodeLevels, chitin: number, ctx: IdleGateContext):
  { kind: 'buy'; node: IdleNodeDef; cost: number } | { kind: 'gate'; node: IdleNodeDef; req: IdleGateReq } | null {
  let cheapest: { node: IdleNodeDef; cost: number } | null = null;
  let gated: { node: IdleNodeDef; req: IdleGateReq } | null = null;
  for (const def of IDLE_NODES) {
    const level = lvl(nodes, def.id);
    const gate = idleNodeGate(def, level + 1, ctx);
    if (gate) { gated ??= { node: def, req: gate }; continue; }
    const cost = idleNodeCost(def, level);
    if (!cheapest || cost < cheapest.cost) cheapest = { node: def, cost };
  }
  if (cheapest && chitin >= cheapest.cost) return { kind: 'buy', ...cheapest };
  if (cheapest) return { kind: 'buy', ...cheapest }; // still the target — the UI shows the price
  return gated ? { kind: 'gate', ...gated } : null;
}

// ── Harvest receipt lines (docs/IDLE-HARVEST.md §presentation) ────────────────────────────
// The collect ceremony's display model. Raw lines arrive one-per-rolled-grant (the same
// lane can roll several times in a long absence); mergeIdleReceiptLines folds them into ONE
// row per thing — summed quantities, materials combined with zero components dropped —
// ordered currencies → shards → materials → specials, so the ceremony reads as a haul,
// never as a log.

export interface IdleReceiptLine {
  /** Glyph fallback (specials render it; currency rows render their CurrencyIcon instead). */
  icon: string;
  /** Full text fallback + accessibility label. Rebuilt after merging. */
  label: string;
  rare: boolean;
  /** CurrencyIcon id for currency-backed rows ('genomeCores', 'geneEssence', 'ichor',
   *  'towerShards', 'heroShards'). Merge key when present. */
  cur?: string;
  qty?: number;
  /** Trailing qualifier kept out of the merge key's amount (e.g. '× every tower'). */
  suffix?: string;
  /** Materials row: component quantities (zeros dropped at render; all-zero rows dropped). */
  mats?: { mutagen: number; scrap: number; catalyst: number };
}

const CUR_LABEL: Record<string, string> = {
  genomeCores: 'Genome Cores', geneEssence: 'Gene Essence', ichor: 'Ichor',
  towerShards: 'Strain Samples', heroShards: 'Apex Genome',
  hiveMaterials: 'Chitin', mulliganTissue: 'Mulligan Tissue',
};
const CUR_ORDER = ['genomeCores', 'hiveMaterials', 'geneEssence', 'mulliganTissue', 'ichor', 'towerShards', 'heroShards'];

export function mergeIdleReceiptLines(lines: readonly IdleReceiptLine[]): IdleReceiptLine[] {
  const byCur = new Map<string, IdleReceiptLine>();
  let mats: { mutagen: number; scrap: number; catalyst: number } | null = null;
  let matsRare = false;
  const specials: IdleReceiptLine[] = [];
  for (const l of lines) {
    if (l.mats) {
      mats = mats
        ? { mutagen: mats.mutagen + l.mats.mutagen, scrap: mats.scrap + l.mats.scrap, catalyst: mats.catalyst + l.mats.catalyst }
        : { ...l.mats };
      matsRare = matsRare || l.rare;
    } else if (l.cur && typeof l.qty === 'number') {
      const key = `${l.cur}|${l.suffix ?? ''}`;
      const prior = byCur.get(key);
      if (prior) {
        prior.qty = (prior.qty ?? 0) + l.qty;
        prior.rare = prior.rare || l.rare;
      } else {
        byCur.set(key, { ...l });
      }
    } else {
      specials.push(l); // discrete finds (containers, modifiers, caches) stay individual
    }
  }
  const out: IdleReceiptLine[] = [...byCur.values()]
    .sort((a, b) => CUR_ORDER.indexOf(a.cur ?? '') - CUR_ORDER.indexOf(b.cur ?? ''))
    .map((l) => ({ ...l, label: `${(l.qty ?? 0).toLocaleString('en-US')} ${CUR_LABEL[l.cur ?? ''] ?? l.label}${l.suffix ? ` ${l.suffix}` : ''}` }));
  if (mats && mats.mutagen + mats.scrap + mats.catalyst > 0) {
    const parts: string[] = [];
    if (mats.mutagen > 0) parts.push(`${mats.mutagen} Mutagen`);
    if (mats.scrap > 0) parts.push(`${mats.scrap} Scrap`);
    if (mats.catalyst > 0) parts.push(`${mats.catalyst} Catalyst`);
    out.push({ icon: '⚒', label: parts.join(' · '), rare: matsRare, mats });
  }
  out.push(...specials);
  return out;
}
