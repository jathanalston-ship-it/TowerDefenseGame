// INCOME LEDGER (docs/ONE-MORE-RUN.md §eta) — "how far does ONE run move each meter, for THIS
// account, RIGHT NOW?" The Next-Goal engine turns every goal's remaining amount into an honest
// run ETA with it ("~14 runs", never a blanket "one more run"), and the Daily Bio-Cache sizes its
// income line as minutes of the player's current Genome-Core income.
//
// Shape: a METER is a plain-number reading of the save that only ever grows in normal play
// (lifetime Cores, cleared stage, ln peak Power, per-unit shard WEALTH = balance + everything that
// currency already bought …). At every settle meta.finishRun ticks the ledger: the delta since the
// previous settle (so containers opened between runs count toward the run that earned them) folds
// into a per-run moving average. New systems add ONE meter row; per-unit meters are generated from
// the content registries, so 100 towers / 30 heroes need nothing here.
//
// PURE over SaveData (no store, no DOM). Imported by meta (the tick) and the read-models (ETAs);
// it imports only core + save — never meta (no cycle).

import type { IncomeSave, SaveData } from '../save/saveStore';
import { highestCampaignStage } from '../save/derive';
import { HERO_DEFS, HERO_ORDER, STAR, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import { primeCost } from '../core/prime';
import { recommendedPowerScore } from '../core/campaign';

/** Ledger tunables (docs/ONE-MORE-RUN.md §eta). */
export const INCOME = {
  /** Floor weight of the moving average: the newest ~10 runs dominate — LIVE income, not lifetime. */
  alphaMin: 0.1,
  /** The lifetime-average PRIOR the ledger is seeded with counts as this many runs, so the first
   *  few real samples refine the estimate instead of replacing it (no one-run whiplash). */
  priorRuns: 3,
  /** "One more run" copy is only allowed at or under this ETA (the honesty contract). */
  honestRuns: 2,
  /** ETAs past this read as "a long road" — no fake precision on a 4-digit run count. */
  etaCap: 999,
} as const;

export interface IncomeMeter {
  id: string;
  read: (s: SaveData) => number;
}

// Unit WEALTH — the shard balance plus everything that unit's currency has ever bought (unlock,
// ★ ladder, Prime ladder). Spending moves wealth from the balance into the ladder, so the reading
// only grows with income — the ledger measures earning, never spending. Closed forms mirror
// meta.towerStarCost / heroStarCost / buyTowerPrime (income.test pins the equivalence).
function ladderSpent(base: number, mult: number, stars: number): number {
  let sum = 0;
  for (let s = 0; s < stars; s++) sum += Math.round(base * Math.pow(mult, s));
  return sum;
}
function primeSpent(ladder: 'tower' | 'hero', level: number): number {
  let sum = 0;
  for (let l = 0; l < level; l++) sum += primeCost(ladder, l);
  return sum;
}
export function towerWealth(s: SaveData, k: (typeof TOWER_ORDER)[number]): number {
  const unlock = (TOWER_DEFS[k]?.unlockShards ?? 0) > 0 && (s.towerUnlocked ?? []).includes(k) ? TOWER_DEFS[k].unlockShards ?? 0 : 0;
  return (s.towerShards[k] ?? 0) + unlock + ladderSpent(STAR.towerBaseCost, STAR.towerCostMult, s.towerStars[k] ?? 0) + primeSpent('tower', s.towerPrime?.[k] ?? 0);
}
export function heroWealth(s: SaveData, k: (typeof HERO_ORDER)[number]): number {
  const def = HERO_DEFS[k];
  const unlock = !def?.unlock && (def?.unlockShards ?? 0) > 0 && (s.heroUnlocked ?? []).includes(k) ? def.unlockShards ?? 0 : 0;
  return (s.heroShards[k] ?? 0) + unlock + ladderSpent(STAR.heroBaseCost, STAR.heroCostMult, s.heroStars[k] ?? 0) + primeSpent('hero', s.heroPrime?.[k] ?? 0);
}

/** THE meter table — a new system that wants honest ETAs (or an achievement ladder) adds ONE row. */
export const INCOME_METERS: IncomeMeter[] = [
  { id: 'cores', read: (s) => s.lifetimeShards }, // Genome Cores earned (also the Molt mint metric)
  { id: 'stage', read: (s) => highestCampaignStage(s) },
  { id: 'lnPower', read: (s) => Math.log(Math.max(1, s.genomeRank?.peakPower ?? 0)) }, // peak ⇒ a Molt never reads as negative income
  { id: 'playSec', read: (s) => s.stats.playtimeSec }, // run length (sim-seconds) — the "minutes of income" divisor
  { id: 'accountXp', read: (s) => s.accountXp.xp },
  { id: 'kills', read: (s) => s.stats.lifetimeKills },
  { id: 'damage', read: (s) => s.stats.totalDamage },
  { id: 'molts', read: (s) => s.prestige.molts },
  { id: 'megaKills', read: (s) => s.megaProgress.kills },
  { id: 'weakPoints', read: (s) => s.megaProgress.weakPoints },
  { id: 'bestWave', read: (s) => s.bestWave },
  { id: 'rushBosses', read: (s) => s.stats.rushBossKills },
  { id: 'rushWave', read: (s) => s.rushBestWave },
  { id: 'containers', read: (s) => s.metabolism?.counters.containersOpened ?? 0 },
  ...TOWER_ORDER.map((k): IncomeMeter => ({ id: `strain:${k}`, read: (s) => towerWealth(s, k) })),
  ...HERO_ORDER.map((k): IncomeMeter => ({ id: `apex:${k}`, read: (s) => heroWealth(s, k) })),
];
const METER_BY_ID = new Map(INCOME_METERS.map((m) => [m.id, m]));

/** One meter's current reading (0 for an unknown id) — achievement ladders read their ledger here. */
export function readMeter(save: SaveData, id: string): number {
  const v = METER_BY_ID.get(id)?.read(save) ?? 0;
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

/** Read every meter (+ caller-supplied readings the state layer derives — e.g. the codex count,
 *  which needs meta's collection context and would otherwise cycle this module into meta). */
export function incomeMeters(save: SaveData, extra: Record<string, number> = {}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of INCOME_METERS) {
    const v = m.read(save);
    if (Number.isFinite(v)) out[m.id] = Math.max(0, v);
  }
  for (const [k, v] of Object.entries(extra)) if (Number.isFinite(v)) out[k] = Math.max(0, v);
  return out;
}

/** Fold one settle into the ledger. The first observation records the baseline and seeds every
 *  rate with the account's LIFETIME average (`totalRuns` settles so far) as a prior; afterwards
 *  each meter's gain (clamped ≥ 0 — a reset/import never reads as negative income) folds into a
 *  moving average weighted 1/(n + priorRuns) while the ledger is young, then INCOME.alphaMin. A
 *  meter seen for the first time (new content) starts its own baseline. `samples` are DIRECT
 *  per-run observations with no lifetime counter behind them (`runCores` — the Cores the RUN
 *  itself paid, excluding achievement/rank/login grants): they fold as-is. Pure. */
export function tickIncome(ledger: IncomeSave, meters: Record<string, number>, totalRuns = 0, samples: Record<string, number> = {}): IncomeSave {
  const fresh = ledger.runs === 0 && Object.keys(ledger.last).length === 0;
  if (fresh) {
    const rate: Record<string, number> = {};
    if (totalRuns > 0) for (const [k, v] of Object.entries(meters)) rate[k] = v / totalRuns;
    for (const [k, v] of Object.entries(samples)) if (Number.isFinite(v)) rate[k] = Math.max(0, v);
    return { runs: 0, last: { ...meters }, rate };
  }
  const alpha = Math.max(INCOME.alphaMin, 1 / (ledger.runs + 1 + INCOME.priorRuns));
  const rate: Record<string, number> = { ...ledger.rate };
  const fold = (k: string, d: number): void => { rate[k] = rate[k] === undefined ? d : rate[k] * (1 - alpha) + d * alpha; };
  for (const [k, now] of Object.entries(meters)) {
    const prev = ledger.last[k];
    if (prev === undefined) continue; // new meter — baseline only
    fold(k, Math.max(0, now - prev));
  }
  for (const [k, v] of Object.entries(samples)) if (Number.isFinite(v)) fold(k, Math.max(0, v));
  return { runs: ledger.runs + 1, last: { ...meters }, rate };
}

/** A meter's live per-run income. Until the ledger has a rate (fresh account, or before the
 *  first settle after the v56 migration) it bootstraps from the lifetime average. */
export function incomePerRun(save: SaveData, id: string): number {
  const inc = save.income;
  if (inc && inc.rate[id] !== undefined) return inc.rate[id];
  if (SAMPLE_FALLBACK[id]) return incomePerRun(save, SAMPLE_FALLBACK[id]); // a sample not yet observed
  const m = METER_BY_ID.get(id);
  if (!m || save.totalRuns <= 0) return 0;
  return Math.max(0, m.read(save)) / save.totalRuns;
}

/** Direct per-run samples (tickIncome `samples`) → the lifetime meter that stands in for them
 *  until the first settle observes one (a migrated veteran gets an estimate immediately). */
const SAMPLE_FALLBACK: Record<string, string> = { runCores: 'cores' };

/** Runs to earn `amount` more of a meter at the live rate (∞ when nothing flows yet). */
export function runsToGain(save: SaveData, id: string, amount: number): number {
  if (amount <= 0) return 0;
  const r = incomePerRun(save, id);
  return r > 1e-9 ? Math.ceil(amount / r) : Infinity;
}

/** Runs until Campaign Stage `target` is CLEARED. While the account's LIVE Power already meets
 *  that stage's recommendation, every stage still to clear is one run. At a wall the answer is
 *  the account's OWN observed stage pace (the honest number — it already contains the Molt
 *  sawtooth, farm runs and push risk; a peak-Power model promised "one more run" for 20–30 runs
 *  of post-Molt re-climb in the G2 trace), floored at one run per stage; with no pace observed
 *  yet, the farm runs Power needs at the live ln-Power growth. `livePower` defaults to the
 *  stored peak (callers with meta access pass the live score). */
export function runsToStage(save: SaveData, target: number, livePower?: number): number {
  const cleared = highestCampaignStage(save);
  if (cleared >= target) return 0;
  const clears = target - cleared;
  const power = livePower ?? save.genomeRank?.peakPower ?? 0;
  const need = recommendedPowerScore(target);
  if (power > 0 && power >= need) return clears;
  const pace = incomePerRun(save, 'stage');
  if (pace > 1e-6) return Math.max(clears, Math.ceil(clears / pace));
  const g = incomePerRun(save, 'lnPower');
  return power > 0 && g > 1e-6 ? clears + Math.ceil(Math.log(need / power) / g) : Infinity;
}

/** Genome Cores per minute of play at the live RUN income (0 until a run has been observed). */
export function coresPerMinute(save: SaveData): number {
  const sec = incomePerRun(save, 'playSec');
  return sec > 1 ? incomePerRun(save, 'runCores') / (sec / 60) : 0;
}

/** Genome Cores ONE run pays at the live rate (run income only — the Molt mint's own metric). */
export function coresPerRun(save: SaveData): number {
  return incomePerRun(save, 'runCores');
}

/** Player-facing ETA words — honest at every scale. */
export function etaLabel(runs: number): string {
  if (runs <= 0) return 'ready now';
  if (runs === 1) return 'next run';
  if (!Number.isFinite(runs) || runs > INCOME.etaCap) return 'a long road';
  return `~${runs} runs`;
}

/** Whether "one more run" is a TRUE statement for this ETA (the cliffhanger contract). */
export function isOneMoreRun(runs: number): boolean {
  return runs > 0 && runs <= INCOME.honestRuns;
}
