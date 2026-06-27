// Prestige — Layer 1: MOLT (PROGRESSION.md §5). The first "ascension": sacrifice the
// core-upgrade economy (banked Shards + the capped meta upgrades) to mint Ascendant Cells,
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

/** Centralized MOLT tunables (balance is placeholder; the architecture is the deliverable). */
export const PRESTIGE = {
  molt: {
    cellGain: 1.5, // B — cells = ⌊cellGain × √(cycleShards / cellScale)⌋
    cellScale: 100, // S — cycle-shards per scale unit
    multPerCell: 0.1, // c — globalMult = 1 + c × √(lifetimeCells)
    minCells: 1, // a Molt is offered once it would mint at least this many cells
  },
};

/** Per-run-cycle "engine metric": the Shards EARNED since the last Molt drive the mint. */
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
  cells: number; // spendable balance (reserved for the future Ascendant Tree)
  lifetimeCells: number; // total ever minted — drives the global multiplier
  cycleShards: number; // Shards earned since the last Molt (the mint metric)
  molts: number; // lifetime Molt count (a trophy / pacing readout)
}

export function defaultPrestige(): PrestigeState {
  return { cells: 0, lifetimeCells: 0, cycleShards: 0, molts: 0 };
}
