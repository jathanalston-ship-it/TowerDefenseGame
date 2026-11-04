// Prestige — Layer 1: MOLT (PROGRESSION.md §5). The first "ascension": sacrifice the
// core-upgrade economy (banked Genome Cores + the capped meta upgrades) to mint Ascendant Cells,
// which grant a PERMANENT, compounding global damage multiplier — a brand-new multiplicative
// bucket on top of stars/mastery/equipment. Trophies (stars, mastery, titles, lore, gear,
// tower/hero shards, loot queue) never reset; only the engine does — less the MOLT IMPRINT, a
// share of every upgrade's levels that grows with the Molts already done (moltImprint below).
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
    // MOLT IMPRINT (docs/BALANCE_ARCHITECTURE.md §9.6): the share of every Genome upgrade's levels a
    // Molt KEEPS. Grows with the Molts already completed (0 on the first Molt), capped — so the
    // post-Molt Power trough stays bounded as the engine deepens instead of crashing ×30+ late.
    imprintPerMolt: 0.0125, // +1.25% of each upgrade's levels kept per completed Molt
    imprintMax: 0.7, // never more than 70% — the dear top of every ladder (most of its Cores) always sheds
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

/** The MOLT IMPRINT: the share of each Genome upgrade's levels the NEXT Molt keeps, given lifetime
 *  `molts` already done. Linear in Molts, capped at `imprintMax`; 0 for the first Molt. */
export function moltImprint(molts: number): number {
  return Math.min(PRESTIGE.molt.imprintMax, PRESTIGE.molt.imprintPerMolt * Math.max(0, molts));
}

/** The Genome upgrade levels a Molt leaves standing: round(level × imprint) per upgrade (zeros
 *  dropped). The kept levels are the cheap BOTTOM of each geometric ladder — most of the Power, a
 *  small slice of the Cores — so the re-climb still costs. ROUNDED, not floored: a floor zeroes
 *  every short ladder (a level-2 upgrade at 30% keeps nothing), punishing players who spread
 *  their purchases across many upgrades. */
export function imprintedUpgrades(upgrades: Record<string, number>, imprint: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, level] of Object.entries(upgrades)) {
    const kept = Math.round((level ?? 0) * imprint + 1e-9); // epsilon: a float x.4999… half must still round up
    if (kept > 0) out[id] = kept;
  }
  return out;
}

/** Persisted prestige state (lives on SaveData). */
export interface PrestigeState {
  cells: number; // spendable balance — spent on the Ascendant Tree (ascendant.ts)
  lifetimeCells: number; // total ever minted — drives the global multiplier
  cycleShards: number; // Genome Cores earned since the last Molt (the mint metric)
  molts: number; // lifetime Molt count (a trophy / pacing readout)
  nodes: Record<string, number>; // Ascendant Tree node id → level (kept across Molts)
  vows: string[]; // armed MOLT VOWS (docs/VOWS.md) — cycle-wide wagers; settled + cleared at the next Molt
}

export function defaultPrestige(): PrestigeState {
  return { cells: 0, lifetimeCells: 0, cycleShards: 0, molts: 0, nodes: {}, vows: [] };
}
