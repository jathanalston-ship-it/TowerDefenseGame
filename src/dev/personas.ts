// PLAYER PERSONAS for the permanent simulation framework (docs/SIMULATION-FRAMEWORK.md).
// A persona is a POLICY MODULATION over the loop-faithful virtual player in progressionSim:
// how greedily it spends, what it prioritizes, how lucky its loot rolls run, how much menu
// overhead it pays, and whether it deviates from the intended Campaign↔Infinite macro-loop.
// Personas never touch balance values — they exist so the report can show how the SAME
// economy feels to different player types (the "estimated player frustration" axis).
//
// Dev-only (src/dev/* is never imported by app code).

export interface Persona {
  id: string;
  name: string;
  blurb: string; // one line in the report's methodology table
  /** Loot luck: multiplies the kills that feed container fill (lucky > 1, unlucky < 1). */
  luck: number;
  /** Chance per run to SKIP the spend pass (lazy/overwhelmed players bank instead of buying). */
  spendSkip: number;
  /** Per-run menu overhead seconds (efficient players fiddle less). */
  menuSec: number;
  /** Chance, when the loop says ADVANCE, to farm Infinite anyway (infinite-lovers). */
  farmAnyway: number;
  /** Chance, when the loop says FARM, to push the campaign frontier anyway (impatient
   *  campaign-lovers) — under-ready pushes can FAIL, wasting the run (the frustration model). */
  pushRisk: number;
  /** Spend priority: which permanent track gets bought first when funds are tight. */
  focus: 'balanced' | 'towers' | 'heroes' | 'completionist';
  /** Report band ceiling in hours (fresh accounts are only meaningful early). */
  maxHours: number;
}

const BASE: Omit<Persona, 'id' | 'name' | 'blurb'> = {
  luck: 1, spendSkip: 0, menuSec: 90, farmAnyway: 0, pushRisk: 0, focus: 'balanced', maxHours: Infinity,
};

/** The persona roster. `efficient` is the loop-faithful optimum — the simulator's historical
 *  default policy, so pre-persona traces remain comparable. */
export const PERSONAS: Record<string, Persona> = {
  fresh: { ...BASE, id: 'fresh', name: 'Fresh Account', blurb: 'First hours; spends late, fiddles long.', spendSkip: 0.5, menuSec: 150, maxHours: 10 },
  average: { ...BASE, id: 'average', name: 'Average Player', blurb: 'Mostly loop-faithful; banks now and then.', spendSkip: 0.25, menuSec: 110 },
  efficient: { ...BASE, id: 'efficient', name: 'Efficient Player', blurb: 'Loop-faithful optimum; spends everything immediately.', menuSec: 70 },
  unlucky: { ...BASE, id: 'unlucky', name: 'Unlucky Player', blurb: 'Bottom-quartile loot luck.', luck: 0.8 },
  lucky: { ...BASE, id: 'lucky', name: 'Lucky Player', blurb: 'Top-quartile loot luck.', luck: 1.25 },
  completionist: { ...BASE, id: 'completionist', name: 'Completionist', blurb: 'Buys every track including gene depth; heavier menus.', focus: 'completionist', menuSec: 130 },
  infinite: { ...BASE, id: 'infinite', name: 'Infinite-Focused', blurb: 'Farms Infinite even when the campaign is ready.', farmAnyway: 0.6 },
  campaign: { ...BASE, id: 'campaign', name: 'Campaign-Focused', blurb: 'Pushes the frontier early; under-ready attempts can fail.', pushRisk: 0.5 },
  heroes: { ...BASE, id: 'heroes', name: 'Hero-Focused', blurb: 'Champion tracks first when funds are tight.', focus: 'heroes' },
  towers: { ...BASE, id: 'towers', name: 'Tower-Focused', blurb: 'Strain tracks first when funds are tight.', focus: 'towers' },
  equipment: { ...BASE, id: 'equipment', name: 'Equipment-Focused', blurb: 'Chases containers (extra Infinite) for gear.', farmAnyway: 0.35 },
};

export const PERSONA_IDS = Object.keys(PERSONAS);
