// DAILY RUN MODIFIERS (docs/DAILY-RUN.md §modifiers) — the expandable run-modifier framework the
// Daily Run rolls two of each day. A modifier is PURE DATA: a declarative `ModifierEffects` bag the
// sim reads at fixed hook points. The generator (daily.ts) rolls from the REGISTRY, never a
// hardcoded list, so a future modifier is a one-row data add. Magnitudes come from DAILY.mod
// (config.ts) — centralized tunables, no inline literals.
//
// GOLDEN SAFETY: the sim never reads a raw modifier — it reads ONE resolved struct
// (`combinedEffects`) whose defaults are neutral (mults 1 / adds 0). With no modifiers the struct
// is NEUTRAL_EFFECTS by construction, so any code path that reads it is byte-identical to before.

import { DAILY } from './config';
import { Registry } from './registry';

/** The declarative knobs a modifier may set. Open bag (index signature) so future keys are a data
 *  add, not a framework change. A `hooks` seam is left for behaviours that can't be expressed as a
 *  scalar (kept intentionally small — don't over-engineer it until a modifier actually needs it). */
export interface ModifierEffects {
  enemySpeedMult?: number; // × enemy speed
  enemyArmorAdd?: number; // + flat enemy armor
  enemyHpMult?: number; // × enemy HP
  heroDamageMult?: number; // × hero damage
  heroDrainFrac?: number; // hero max-HP fraction lost per second
  incomeMult?: number; // × biomass income
  towerRangeMult?: number; // × tower range
  branchCostMult?: number; // × branch-tier cost
  draftEveryWaves?: number; // gene-card draft cadence override (waves between drafts)
  eliteChance?: number; // per-spawn elite promotion chance
  towerRateMult?: number; // × tower fire rate
  towerDamageMult?: number; // × tower damage
  hiveRegenFrac?: number; // Hive max-integrity fraction regenerated per second
  [key: string]: number | undefined; // future keys plug in without a schema change
}

/** Optional imperative seam (e.g. an on-wave-start pulse). Typed loosely so this module stays free
 *  of a Game import (no cycle); a hook receives the live Game and is invoked by the sim. */
export interface DailyModifierHooks {
  onWaveStart?(game: unknown): void;
}

export interface DailyModifierDef {
  id: string;
  name: string;
  blurb: string;
  severity: number; // 1 (mild) … 3 (brutal) — feeds the day's difficulty estimate
  effects: ModifierEffects;
  hooks?: DailyModifierHooks;
}

/** The FULLY resolved effect struct the sim reads — every field present at its neutral default so a
 *  single object answers every hook with no `?? default` at the read site. */
export interface ResolvedEffects {
  enemySpeedMult: number;
  enemyArmorAdd: number;
  enemyHpMult: number;
  heroDamageMult: number;
  heroDrainFrac: number;
  incomeMult: number;
  towerRangeMult: number;
  branchCostMult: number;
  draftEveryWaves: number; // 0 = no override (use the mode default cadence)
  eliteChance: number;
  towerRateMult: number;
  towerDamageMult: number;
  hiveRegenFrac: number;
}

/** Neutral resolution: mults 1, adds 0, no cadence override. `combinedEffects([])` returns this ⇒
 *  a run with no modifiers is byte-identical to a run that never consulted the framework. */
export const NEUTRAL_EFFECTS: ResolvedEffects = {
  enemySpeedMult: 1,
  enemyArmorAdd: 0,
  enemyHpMult: 1,
  heroDamageMult: 1,
  heroDrainFrac: 0,
  incomeMult: 1,
  towerRangeMult: 1,
  branchCostMult: 1,
  draftEveryWaves: 0,
  eliteChance: 0,
  towerRateMult: 1,
  towerDamageMult: 1,
  hiveRegenFrac: 0,
};

// ── The registry (registry.ts conventions) — the single source the generator rolls from. ──
export const dailyModifierRegistry = new Registry<DailyModifierDef>('dailyModifier', { idOf: (d) => d.id });

/** Register one modifier (open at runtime for mods, like every other content registry). */
export function registerDailyModifier(def: DailyModifierDef): DailyModifierDef {
  return dailyModifierRegistry.register(def);
}

export function dailyModifierById(id: string): DailyModifierDef | undefined {
  return dailyModifierRegistry.get(id);
}

const M = DAILY.mod;

// ── The core 10 (docs/DAILY-RUN.md §modifiers). Numbers live in DAILY.mod (config.ts). ──
export const DAILY_MODIFIERS: DailyModifierDef[] = [
  { id: 'overrun', name: 'Overrun', blurb: 'The swarm surges — enemies move 30% faster.', severity: 2, effects: { enemySpeedMult: M.enemySpeedMult } },
  { id: 'blood_frenzy', name: 'Blood Frenzy', blurb: 'Your hero deals double damage but bleeds out over time.', severity: 3, effects: { heroDamageMult: M.heroDamageMult, heroDrainFrac: M.heroDrainFrac } },
  { id: 'famine', name: 'Famine', blurb: 'Biomass income is choked (~-35%).', severity: 2, effects: { incomeMult: M.incomeMult } },
  { id: 'myopia', name: 'Myopia', blurb: 'A sensory fog shortens every tower’s range (~-25%).', severity: 2, effects: { towerRangeMult: M.towerRangeMult } },
  { id: 'scarcity', name: 'Scarcity', blurb: 'Branch upgrades cost 50% more.', severity: 2, effects: { branchCostMult: M.branchCostMult } },
  { id: 'ironhide', name: 'Ironhide', blurb: 'Every enemy grows heavier armor.', severity: 2, effects: { enemyArmorAdd: M.enemyArmorAdd } },
  { id: 'dormancy', name: 'Dormancy', blurb: 'Gene cards draft only every 3rd wave.', severity: 1, effects: { draftEveryWaves: M.draftEveryWaves } },
  { id: 'infestation', name: 'Infestation', blurb: 'Random elite enemies erupt from the swarm.', severity: 3, effects: { eliteChance: M.eliteChance } },
  { id: 'overclock', name: 'Overclock', blurb: 'Towers fire faster but hit softer.', severity: 1, effects: { towerRateMult: M.towerRateMult, towerDamageMult: M.towerDamageMult } },
  { id: 'regeneration', name: 'Regeneration', blurb: 'The Hive slowly knits itself back together.', severity: 1, effects: { hiveRegenFrac: M.hiveRegenFrac } },
];
dailyModifierRegistry.registerAll(DAILY_MODIFIERS);

/**
 * Merge the active modifiers into ONE resolved struct the sim reads. Mults multiply, adds add;
 * `eliteChance` takes the max (most severe), `draftEveryWaves` the tightest positive cadence.
 * Unknown ids are skipped (a stale roll never crashes a run boot). `[]` ⇒ NEUTRAL_EFFECTS.
 */
export function combinedEffects(ids: string[]): ResolvedEffects {
  const r: ResolvedEffects = { ...NEUTRAL_EFFECTS };
  for (const id of ids) {
    const def = dailyModifierById(id);
    if (!def) continue;
    const e = def.effects;
    if (e.enemySpeedMult) r.enemySpeedMult *= e.enemySpeedMult;
    if (e.enemyHpMult) r.enemyHpMult *= e.enemyHpMult;
    if (e.enemyArmorAdd) r.enemyArmorAdd += e.enemyArmorAdd;
    if (e.heroDamageMult) r.heroDamageMult *= e.heroDamageMult;
    if (e.heroDrainFrac) r.heroDrainFrac += e.heroDrainFrac;
    if (e.incomeMult) r.incomeMult *= e.incomeMult;
    if (e.towerRangeMult) r.towerRangeMult *= e.towerRangeMult;
    if (e.branchCostMult) r.branchCostMult *= e.branchCostMult;
    if (e.towerRateMult) r.towerRateMult *= e.towerRateMult;
    if (e.towerDamageMult) r.towerDamageMult *= e.towerDamageMult;
    if (e.hiveRegenFrac) r.hiveRegenFrac += e.hiveRegenFrac;
    if (e.eliteChance) r.eliteChance = Math.max(r.eliteChance, e.eliteChance);
    if (e.draftEveryWaves) r.draftEveryWaves = r.draftEveryWaves === 0 ? e.draftEveryWaves : Math.min(r.draftEveryWaves, e.draftEveryWaves);
  }
  return r;
}
