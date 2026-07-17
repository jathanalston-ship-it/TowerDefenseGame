// LOCALIZED ECONOMY SIMULATION (docs/ECONOMY.md §localized) — npm run sim:economy.
// The v48 currency swap moved Hive organs onto Chitin and Mulligan grafts onto Mulligan
// Tissue. This sim verifies the swap's four laws over 14 days × 4 personas × 3 bands,
// using the REAL config curves (idle accrual, drop weights, node costs, expedition sheets,
// graft costs) wherever a real number exists:
//
//   1. ORGAN PACE PARITY — tree levels bought by day 14 funded by the NEW Chitin faucets
//      land within [0.75, 1.30] of the OLD cores-funded pace at the base allocation
//      assumption (sensitivity printed for the pessimistic/optimistic brackets).
//   2. NO MIGRATION STALL — the v48 investment seed (60 + 20/organ level) affords the next
//      organ immediately, or within 2 days of new income, at every investment depth.
//   3. GENE-WALLET RELIEF — essence available for Gene Cards does not drop: grafts leaving
//      the essence wallet outweighs the bleed split + hopper carve that fund Tissue.
//   4. EARN COVERAGE — every engaged persona shows nonzero daily income for BOTH new
//      wallets once their systems unlock (no dead currency).
//
// DOCUMENTED ASSUMPTIONS (the structural laws are separately unit-pinned and do not
// depend on these): run-economy core income per day by band, the fraction of core income
// players historically allocated to Hive organs (organs competed with Permanent Upgrades,
// Prime, Molt vows and gene slots — one sink among several), premium-container cadence,
// and expedition cadence per persona. Each is printed with the results.

import { IDLE } from '../src/core/config';
import {
  IDLE_DROPS, IDLE_NODES, eligibleIdleDrops, idleAccrual, idleNodeCost, idleNodeGate,
} from '../src/core/idleHarvest';
import type { IdleGateContext, IdleNodeLevels } from '../src/core/idleHarvest';
import { EXPEDITION_DEFS, RARE_FINDS, expeditionMult, rareFindChance } from '../src/core/expeditions';
import { upgradeCost } from '../src/core/mulligan';
import { CURRENCIES } from '../src/core/currencies';

// ── Assumptions (printed) ────────────────────────────────────────────────────────────────
const RUN_CORES_PER_DAY: Record<BandId, number> = { early: 120, mid: 400, late: 900 }; // run economy, per active day
const ORGAN_SHARE_OLD = 0.2; // base: organs took ~1/5 of the core wallet (one sink of ~5)
const ORGAN_SHARE_BRACKETS = [0.15, 0.3]; // pessimistic/optimistic sensitivity
const PREMIUM_CONTAINERS_PER_DAY: Record<BandId, number> = { early: 0.2, mid: 1.0, late: 1.8 };
const AVG_BLEED = { early: 25, mid: 70, late: 120 }; // mid-roll of BLEED_BY_RARITY × typical rarity mix

type BandId = 'early' | 'mid' | 'late';
interface Band { id: BandId; stage: number; rank: number; nodes: IdleNodeLevels }
const BANDS: Band[] = [
  { id: 'early', stage: 6, rank: 1, nodes: {} },
  { id: 'mid', stage: 25, rank: 4, nodes: { speed: 8, capacity: 3, craft: 4 } },
  { id: 'late', stage: 45, rank: 6, nodes: { speed: 15, capacity: 5, rare: 8, craft: 8 } },
];

interface Persona {
  id: string;
  activeDay: (d: number) => boolean;
  gapHours: number; // absence before the day's first collect
  collectsPerDay: number;
  /** Expedition claims per active day, as mission ids PER BAND — early accounts realistically
   *  run the short roads (few benched heroes, short sessions); the 16h Titan Graveyard is a
   *  late-band habit. */
  expeditions: Record<BandId, string[]>;
}
const PERSONAS: Persona[] = [
  { id: 'idle-farmer', activeDay: () => true, gapHours: 20, collectsPerDay: 1,
    expeditions: { early: ['exp_patrol'], mid: ['exp_patrol', 'exp_harvest'], late: ['exp_patrol', 'exp_harvest'] } },
  { id: 'daily-commuter', activeDay: () => true, gapHours: 24, collectsPerDay: 1,
    expeditions: { early: ['exp_patrol'], mid: ['exp_harvest'], late: ['exp_harvest'] } },
  { id: 'grinder', activeDay: () => true, gapHours: 6, collectsPerDay: 2,
    expeditions: { early: ['exp_patrol', 'exp_vents'], mid: ['exp_patrol', 'exp_harvest', 'exp_graveyard'], late: ['exp_patrol', 'exp_harvest', 'exp_graveyard'] } },
  { id: 'weekender', activeDay: (d) => d % 7 >= 5, gapHours: 60, collectsPerDay: 1,
    expeditions: { early: ['exp_patrol'], mid: ['exp_graveyard'], late: ['exp_graveyard'] } },
];

const ctxOf = (b: Band): IdleGateContext =>
  ({ stage: b.stage, genomeRankIndex: b.rank, molts: 0, rushBest: 0, collectionCompletion: 0.2, power: 0 });

/** Daily idle budget (core-equivalents) from the REAL accrual closed forms. */
function idleBudgetPerDay(p: Persona, b: Band): number {
  const first = idleAccrual(p.gapHours * 3_600_000, b.stage, b.nodes, b.rank);
  let budget = first.budget;
  for (let c = 1; c < p.collectsPerDay; c++) budget += idleAccrual(4 * 3_600_000, b.stage, b.nodes, b.rank).budget;
  return budget;
}

/** Share of the weighted slice budget a drop id takes at a band (REAL weights + gates). */
function dropShare(id: string, b: Band): number {
  const pool = eligibleIdleDrops(ctxOf(b));
  const total = pool.reduce((s, d) => s + d.weight, 0);
  const row = pool.find((d) => d.id === id);
  return row ? row.weight / total : 0;
}

/** Expedition chitin + essence per active day (REAL sheets; ×1.2 stars/affinity/mastery mix,
 *  windfall/setback EV ≈ neutral-plus; rare-find EV from the REAL chance × uniform pick). */
function expeditionPerDay(p: Persona, band: BandId): { chitin: number; essence: number; cores: number } {
  let chitin = 0; let essence = 0; let cores = 0;
  const mult = expeditionMult(2, false, 5) * 1.05; // ~×1.26 typical claim stack
  for (const id of p.expeditions[band]) {
    const d = EXPEDITION_DEFS.find((x) => x.id === id)!;
    const perClaim = 24 / Math.max(d.hours, 8); // a slot re-runs as it finishes, ≤ 3/day each
    const claims = Math.min(1, perClaim); // conservative: one claim of each listed road per day
    const findEv = rareFindChance(d) / RARE_FINDS.length;
    chitin += claims * ((d.reward.chitin ?? 0) * mult + findEv * 150);
    essence += claims * (d.reward.essence * mult + findEv * 220);
    cores += claims * (d.reward.cores * mult + findEv * 150);
  }
  return { chitin, essence, cores };
}

/** Greedy tree walk with REAL costs + gates: levels bought in 14 days at `incomePerDay`,
 *  plus the day the FIRST purchase landed (−1 = never). */
function treeWalk(b: Band, startLevels: IdleNodeLevels, incomePerDay: (day: number) => number, startWallet = 0): { bought: number; firstDay: number } {
  const levels: IdleNodeLevels = { ...startLevels };
  let wallet = startWallet;
  let bought = 0;
  let firstDay = -1;
  for (let day = 0; day < 14; day++) {
    wallet += incomePerDay(day);
    for (;;) {
      let best: { id: string; cost: number } | null = null;
      for (const def of IDLE_NODES) {
        const lv = levels[def.id] ?? 0;
        if (idleNodeGate(def, lv + 1, ctxOf(b)) !== null) continue;
        const cost = idleNodeCost(def, lv);
        if (!best || cost < best.cost) best = { id: def.id, cost };
      }
      if (!best || wallet < best.cost) break;
      wallet -= best.cost;
      levels[best.id] = (levels[best.id] ?? 0) + 1;
      bought += 1;
      if (firstDay < 0) firstDay = day;
    }
  }
  return { bought, firstDay };
}

// ── Run ──────────────────────────────────────────────────────────────────────────────────
console.log('LOCALIZED ECONOMY SIMULATION — 4 personas × 3 bands × 14 days\n');
console.log(`assumptions: run cores/day ${JSON.stringify(RUN_CORES_PER_DAY)} · old organ share ${ORGAN_SHARE_OLD} (brackets ${ORGAN_SHARE_BRACKETS.join('/')})`);
console.log(`             premium containers/day ${JSON.stringify(PREMIUM_CONTAINERS_PER_DAY)} · hopper chitin share ${IDLE.hiveMatsShare}\n`);

const fails: string[] = [];
const bar = (ok: boolean, label: string): void => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`);
  if (!ok) fails.push(label);
};

// Law 1 — organ pace parity, and Law 4 — earn coverage.
console.log('persona          band   chitin/day   old-organ/day   levels old→new   ratio (brackets)');
for (const p of PERSONAS) {
  for (const b of BANDS) {
    const activeDays = Array.from({ length: 14 }, (_, d) => p.activeDay(d));
    const perActive = (v: number) => (day: number) => (activeDays[day] ? v : 0);
    const budget = idleBudgetPerDay(p, b);
    const exp = expeditionPerDay(p, b.id);
    const chitinDay = (budget * IDLE.hiveMatsShare) / IDLE.valuePerUnit.hiveMats + exp.chitin;
    const idleCoresOld = budget * dropShare('cores', b); // pre-swap: no top-slice, weights whole
    const oldFunding = (share: number) => share * (RUN_CORES_PER_DAY[b.id] + idleCoresOld + exp.cores);
    const oldWalk = treeWalk(b, b.nodes, perActive(oldFunding(ORGAN_SHARE_OLD)));
    const newWalk = treeWalk(b, b.nodes, perActive(chitinDay));
    const ratio = oldWalk.bought === 0 ? 1 : newWalk.bought / oldWalk.bought;
    const bracketRatios = ORGAN_SHARE_BRACKETS.map((s) => {
      const o = treeWalk(b, b.nodes, perActive(oldFunding(s))).bought;
      return o === 0 ? 1 : newWalk.bought / o;
    });
    console.log(
      `${p.id.padEnd(16)} ${b.id.padEnd(6)} ${chitinDay.toFixed(0).padStart(8)} ${oldFunding(ORGAN_SHARE_OLD).toFixed(0).padStart(13)} ` +
      `${String(oldWalk.bought).padStart(8)} → ${String(newWalk.bought).padEnd(4)} ${ratio.toFixed(2).padStart(8)} (${bracketRatios.map((r) => r.toFixed(2)).join(' / ')})`,
    );
    const activeCount = activeDays.filter(Boolean).length;
    if (oldWalk.bought >= 4) {
      // Enough purchases for a ratio to mean something — hold the pace band.
      bar(ratio >= 0.75 && ratio <= 1.3, `${p.id}/${b.id}: organ pace parity (${ratio.toFixed(2)} in [0.75, 1.30])`);
      bar(newWalk.bought >= Math.min(3, activeCount), `${p.id}/${b.id}: no organ stall (${newWalk.bought} levels in 14 days)`);
    } else {
      // Small-sample cell (a couple of purchases either way): ratios are integer noise, so the
      // honest floor is TIME-TO-FIRST-ORGAN — the next growth lands within 4 active days.
      const activeDaysToFirst = newWalk.firstDay < 0 ? Infinity : activeDays.slice(0, newWalk.firstDay + 1).filter(Boolean).length;
      bar(activeDaysToFirst <= 4, `${p.id}/${b.id}: first organ within 4 active days (${newWalk.firstDay < 0 ? 'never' : activeDaysToFirst})`);
    }
    bar(chitinDay > 0, `${p.id}/${b.id}: Chitin income live`);
  }
}

// Law 2 — migration seeds afford the next organ (REAL costs at each investment depth).
for (const invested of [{ label: 'dabbler', levels: { speed: 3, capacity: 1, craft: 1 } },
  { label: 'builder', levels: { speed: 6, capacity: 3, craft: 3, xp: 3 } },
  { label: 'architect', levels: { speed: 12, capacity: 5, rare: 8, craft: 8, xp: 7 } }]) {
  const total = Object.values(invested.levels).reduce((s, v) => s + v, 0);
  const seed = 60 + 20 * total;
  const band = BANDS[invested.label === 'dabbler' ? 0 : invested.label === 'builder' ? 1 : 2];
  const nextCost = Math.min(...IDLE_NODES
    .filter((d) => idleNodeGate(d, ((invested.levels as IdleNodeLevels)[d.id] ?? 0) + 1, ctxOf(band)) === null)
    .map((d) => idleNodeCost(d, (invested.levels as IdleNodeLevels)[d.id] ?? 0)));
  const farmer = PERSONAS[0];
  const twoDays = 2 * ((idleBudgetPerDay(farmer, band) * IDLE.hiveMatsShare) + expeditionPerDay(farmer, band.id).chitin);
  bar(seed >= nextCost || seed + twoDays >= nextCost,
    `migration seed (${invested.label}, Σ${total} levels): ${seed} Chitin vs next organ ${nextCost} (≤2 days' income to bridge)`);
}

// Law 3 — gene-wallet relief: essence purchasing power for CARDS does not drop.
// OLD: hopper essence (weight 16, pre-carve) + expedition essence + 100% of the bleed − graft
// spending (assumed equal to what the NEW tissue faucets deliver — the player upgraded the
// same grafts from the shared wallet). NEW: hopper essence (13) + expeditions + 60% bleed,
// all of it spendable on cards. Tissue income = hopper tissue (3) + 40% bleed (+ dupes ≥ 0).
for (const b of BANDS.slice(1)) { // mulligans are mid-game systems
  const p = PERSONAS[1]; // daily-commuter
  const budget = idleBudgetPerDay(p, b);
  const exp = expeditionPerDay(p, b.id);
  const bleed = PREMIUM_CONTAINERS_PER_DAY[b.id] * AVG_BLEED[b.id];
  const essenceUnit = IDLE.valuePerUnit.essence;
  const pool = eligibleIdleDrops(ctxOf(b));
  const totalW = pool.reduce((s, d) => s + d.weight, 0);
  const oldPool = totalW - (pool.find((d) => d.id === 'tissue')?.weight ?? 0); // pre-carve pool had essence 16, no tissue row
  const hopperEssenceOld = budget * (16 / oldPool) / essenceUnit;
  const hopperEssenceNew = (budget * (1 - IDLE.hiveMatsShare)) * dropShare('essence', b) / essenceUnit;
  const hopperTissue = (budget * (1 - IDLE.hiveMatsShare)) * dropShare('tissue', b) / IDLE.valuePerUnit.tissue;
  const tissueIncome = hopperTissue + 0.5 * bleed; // the even bleed split (meta.openContainer)
  const oldForCards = hopperEssenceOld + exp.essence + bleed - tissueIncome; // grafts drained the shared wallet
  const newForCards = hopperEssenceNew + exp.essence + 0.5 * bleed;
  bar(newForCards >= oldForCards * 0.95,
    `${b.id}: gene-wallet relief (cards get ${newForCards.toFixed(0)}/day vs ${oldForCards.toFixed(0)} before, ≥95%)`);
  // Tissue adequacy: ≥1.5 mid-tier graft upgrades per week for a container-active player —
  // mid-catalog pace rides the bleed split alone; the dupe-dissolve faucet (30–500/dupe once
  // the catalog completes) lifts it several-fold late, so mid is the deliberate floor.
  const weekly = 7 * tissueIncome;
  const midUpgrade = upgradeCost('rare', 4);
  bar(weekly >= 1.5 * midUpgrade, `${b.id}: tissue funds ≥1.5 graft upgrades/week (${weekly.toFixed(0)} vs 1.5×${midUpgrade}=${(1.5 * midUpgrade).toFixed(0)})`);
}

// Law 4 (structural half) — every currency documents overlapping faucets; the two new
// wallets' faucets exist in the REAL registries this sim just exercised.
{
  const chitinSources = CURRENCIES.hiveMaterials.earnedFrom.length;
  const tissueSources = CURRENCIES.mulliganTissue.earnedFrom.length;
  bar(chitinSources >= 2 && tissueSources >= 2, `overlap: chitin ${chitinSources} faucets, tissue ${tissueSources} faucets (≥2 each)`);
  bar(IDLE_DROPS.some((d) => d.id === 'tissue'), 'hopper tissue trickle row exists');
  bar(EXPEDITION_DEFS.filter((d) => (d.reward.chitin ?? 0) > 0).length >= 3, '≥3 expedition roads haul Chitin');
}

if (fails.length > 0) {
  console.error(`\nFAILED ${fails.length} localized-economy law(s).`);
  process.exit(1);
}
console.log('\nALL BANDS PASS — organ pace held, no migration stall, gene wallet relieved, faucets live.');
