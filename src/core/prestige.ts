// Prestige — Layer 1: MOLT (PROGRESSION.md §5). The first "ascension": sacrifice the
// core-upgrade economy (banked Genome Cores + the capped meta upgrades) to mint Ascendant Cells,
// which grant a PERMANENT, compounding global damage multiplier — a brand-new multiplicative
// bucket on top of stars/mastery/equipment. Trophies (stars, mastery, titles, lore, gear,
// tower/hero shards, loot queue) never reset; only the engine does.
//
// The math follows the generic template (§5.1): square-root GAIN (diminishing within a
// cycle → "when do I molt?" becomes a real decision) + a square-root global MULTIPLIER
// (infinite but never explosive). Pure data + pure functions; no DOM/sim/content imports.
//
// Golden invariant: a fresh account has 0 lifetime cells ⇒ multiplier ×1 ⇒ every run is
// byte-identical.

/** Centralized MOLT tunables. Tuned 2026-07 from progression-simulator evidence
 *  (docs/PROGRESSION_REPORT.md via the BALANCE_ARCHITECTURE.md §4 change protocol):
 *  minCells 1→12 ended the molt-every-run spiral (a Molt is a MILESTONE — ≥ 6,400 Cores of
 *  cycle income), and the stage gate went compound→LINEAR so deep Molts never freeze —
 *  layer-1 prestige stays alive as the deep-game bridge until prestige layers 2–6 land. */
export const PRESTIGE = {
  molt: {
    cellGain: 1.5, // B — cells = ⌊cellGain × √(cycleShards / cellScale)⌋
    cellScale: 100, // S — cycle-shards per scale unit
    multPerCell: 0.1, // c — globalMult = 1 + c × √(lifetimeCells)
    minCells: 12, // a Molt is offered once it would mint at least this many cells (⇒ ≥ 6,400 cycle Cores)
  },
  // Campaign gate (PROGRESSION.md) — Prestige is anchored to campaign depth, not idle shards:
  // the FIRST Molt requires clearing Campaign Stage `firstStage`, and every later Molt requires
  // `stagePerMolt` MORE stages. LINEAR by design: a compound gate eventually outruns the
  // crawling deep frontier and freezes layer-1 forever (measured — PROGRESSION_REPORT.md);
  // a linear gate keeps Molts cycling at the pace of real breakthroughs. Future prestige
  // layers (2–6) add their own, steeper gates ON TOP rather than re-shaping this one.
  campaign: {
    firstStage: 10, // first Molt (molts = 0) requires clearing Campaign Stage 10
    stagePerMolt: 3, // each later Molt requires +3 more campaign stages (linear — never freezes)
  },
};

/** The highest-cleared Campaign stage the NEXT Molt requires, given lifetime `molts` already
 *  done. Linear: `firstStage + stagePerMolt × molts` — strictly increasing (every Molt visibly
 *  costs more campaign) yet always reachable while the frontier still moves at all. */
export function prestigeStageReq(molts: number): number {
  return PRESTIGE.campaign.firstStage + PRESTIGE.campaign.stagePerMolt * Math.max(0, molts);
}

/** Per-run-cycle "engine metric": the Genome Cores EARNED since the last Molt drive the mint. */
export function cellsForCycle(cycleShards: number): number {
  if (cycleShards <= 0) return 0;
  return Math.floor(PRESTIGE.molt.cellGain * Math.sqrt(cycleShards / PRESTIGE.molt.cellScale));
}

/** The permanent global damage multiplier from lifetime cells (the P bucket). ×1 at 0. */
export function prestigeMult(lifetimeCells: number): number {
  return 1 + PRESTIGE.molt.multPerCell * Math.sqrt(Math.max(0, lifetimeCells));
}

/** Whether a Molt is worth offering (it would mint ≥ minCells). */
export function canMolt(cycleShards: number): boolean {
  return cellsForCycle(cycleShards) >= PRESTIGE.molt.minCells;
}

/** Cycle shards needed for the NEXT whole cell (for a "progress to +1 cell" bar). */
export function shardsForCells(cells: number): number {
  // invert cells = cellGain·√(x/cellScale) → x = cellScale × (cells / cellGain)²
  return Math.ceil(PRESTIGE.molt.cellScale * Math.pow(cells / PRESTIGE.molt.cellGain, 2));
}

/** Persisted prestige state (lives on SaveData). */
export interface PrestigeState {
  cells: number; // spendable balance — spent on the Ascendant Tree (ascendant.ts)
  lifetimeCells: number; // total ever minted — drives the global multiplier
  cycleShards: number; // Genome Cores earned since the last Molt (the mint metric)
  molts: number; // lifetime Molt count (a trophy / pacing readout)
  nodes: Record<string, number>; // Ascendant Tree node id → level (kept across Molts)
}

export function defaultPrestige(): PrestigeState {
  return { cells: 0, lifetimeCells: 0, cycleShards: 0, molts: 0, nodes: {} };
}
