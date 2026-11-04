// Evolution HQ read-model (docs/EVOLUTION-HQ.md) — groups the Genome Core upgrades by category
// into renderable sections + per-card views. Pure over SaveData + config: adding an upgrade or a
// category needs nothing here. Power previews stay in the component (they call the reactive store).

import { META_UPGRADES, upgradeEffectUnits } from '../core/config';
import type { GenomeCategory, UpgradeDef } from '../core/config';
import { accountPowerParts, genomeRebuildSave, genomeUpgradeFactor, upgradeCost, upgradeLevel, upgradeUnlocked } from './meta';
import type { GenomeRebuildStep } from './meta';
import type { SaveData } from '../save/saveStore';
import { composePower } from '../core/power';
import { powerBreakdown } from './profile';

export interface GenomeCardView {
  id: string;
  name: string;
  description: string;
  level: number;
  maxLevel: number; // Infinity for the Runaway tier
  infinite: boolean; // the uncapped Genome Core sink card (docs/EVOLUTION-HQ.md §runaway)
  cost: number | null; // null = maxed (never null for infinite)
  spent: number; // Genome Cores sunk into THIS card so far
  effectNow: string; // cumulative effect at the current level ('—' at 0)
  effectNext: string; // effect at level+1 ('' when maxed)
  completed: boolean;
  locked: boolean; // progression-gated and not yet earned (visible, not purchasable)
  unlockNote: string; // human requirement while locked ('' once earned / ungated)
}

export interface GenomeSection {
  category: GenomeCategory;
  icon: string;
  title: string;
  desc: string;
  cards: GenomeCardView[];
  boughtLevels: number; // capped catalog only — the Runaway tier can never complete
  totalLevels: number; // capped catalog only
  completionPct: number; // 0..100 (capped catalog)
  endlessLevels: number; // Runaway levels bought in this section (uncapped)
  coresSpent: number; // Genome Cores sunk into this section so far (Runaway included)
}

// Section identity (icon + blurb) — data, so a new category is one row. Order = display order.
const SECTION_META: Record<GenomeCategory, { icon: string; title: string; desc: string }> = {
  Combat: { icon: '⚔', title: 'Combat', desc: 'Raw offense — damage, fire rate, reach, execution.' },
  Economy: { icon: '⬡', title: 'Economy', desc: 'Biomass income, starting reserves, and refunds.' },
  Hero: { icon: '✶', title: 'Hero Evolution', desc: 'Every hero deeper — survivability, uptime, sustain.' },
  Tower: { icon: '⌖', title: 'Tower Evolution', desc: 'Reward how you build the board.' },
  Infrastructure: { icon: '⛨', title: 'Infrastructure', desc: 'The Nucleus itself — capacity and integrity.' },
  Utility: { icon: '❈', title: 'Utility', desc: 'Situational, high-value levers.' },
};
const SECTION_ORDER: GenomeCategory[] = ['Combat', 'Economy', 'Hero', 'Tower', 'Infrastructure', 'Utility'];

// Flat fields render as a bare "+N"; every other lever is a multiplier rendered as "±X%".
const FLAT_FIELDS = new Set<string>(['integrityBonus', 'bonusSlots', 'startBiomassBonus']);

function fieldOf(u: UpgradeDef): string {
  return u.effect ? u.effect.stat : u.run!.field;
}
function perLevelOf(u: UpgradeDef): number {
  return u.effect ? u.effect.perLevel : u.run!.perLevel;
}

/** Cumulative effect label at `level` (e.g. '+24%', '+75', '−10%'), or '—' at level 0.
 *  Runaway (infinite) upgrades fold at √level and render one decimal — their marginal gain
 *  shrinks every level, and the label must show that honestly (+6.3% → +6.6%). */
export function effectLabel(u: UpgradeDef, level: number): string {
  if (level <= 0) return '—';
  const raw = perLevelOf(u) * upgradeEffectUnits(u, level);
  if (FLAT_FIELDS.has(fieldOf(u))) return `+${u.infinite ? raw.toFixed(1) : Math.round(raw)}`;
  const pct = raw * 100;
  if (u.infinite) return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  return `${pct >= 0 ? '+' : ''}${Math.round(pct)}%`;
}

/** Total Genome Cores already spent to reach `level` (Σ cost of steps 0..level-1). */
function spentTo(def: UpgradeDef, level: number): number {
  let sum = 0;
  for (let i = 0; i < level; i++) sum += upgradeCost(def, i);
  return sum;
}

/** The Genome Core sections for the Evolution HQ, in display order (empty categories omitted). */
export function genomeSections(save: SaveData): GenomeSection[] {
  const byCat = new Map<GenomeCategory, UpgradeDef[]>();
  for (const u of META_UPGRADES) {
    const list = byCat.get(u.category) ?? [];
    list.push(u);
    byCat.set(u.category, list);
  }
  const out: GenomeSection[] = [];
  for (const category of SECTION_ORDER) {
    const defs = byCat.get(category);
    if (!defs || defs.length === 0) continue;
    let bought = 0;
    let total = 0;
    let coresSpent = 0;
    let endlessLevels = 0;
    const cards: GenomeCardView[] = defs.map((u) => {
      const level = upgradeLevel(save, u.id);
      const infinite = u.infinite === true;
      const maxed = !infinite && level >= u.maxLevel;
      // Completion is a CAPPED-catalog notion — the Runaway tier never completes, so it
      // counts toward the section's core spend + its own endless tally, never the %.
      if (infinite) endlessLevels += level;
      else { bought += level; total += u.maxLevel; }
      const spent = spentTo(u, level);
      coresSpent += spent;
      const locked = !upgradeUnlocked(save, u);
      return {
        id: u.id,
        name: u.name,
        description: u.description,
        level,
        maxLevel: u.maxLevel,
        infinite,
        cost: maxed ? null : upgradeCost(u, level),
        spent,
        effectNow: effectLabel(u, level),
        effectNext: maxed ? '' : effectLabel(u, level + 1),
        completed: maxed,
        locked,
        unlockNote: locked ? unlockLabel(u) : '',
      };
    });
    // The Runaway sink renders LAST in its section — the horizon after the capped catalog.
    cards.sort((a, b) => Number(a.infinite) - Number(b.infinite));
    out.push({
      category,
      ...SECTION_META[category],
      cards,
      boughtLevels: bought,
      totalLevels: total,
      completionPct: total > 0 ? Math.round((bought / total) * 100) : 0,
      endlessLevels,
      coresSpent,
    });
  }
  return out;
}

/** Future systems named but not yet shipped — the visible long horizon (docs/EVOLUTION-HQ.md). */
export const FUTURE_LOCKED: { name: string; desc: string }[] = [
  { name: 'Speciation', desc: 'Fuse two combat classes into a hybrid lineage — a build-space explosion.' },
  { name: 'Transcendence', desc: 'A second ascension layer beyond the Molt — for accounts that have mastered the Ascendant Tree.' },
];

/** Human requirement text for a gated upgrade (docs/EVOLUTION-HQ.md §gates). */
function unlockLabel(u: UpgradeDef): string {
  const g = u.unlock;
  if (!g) return '';
  switch (g.kind) {
    case 'campaignStage': return `Clear Campaign Stage ${g.stage}`;
    case 'bestWave': return `Reach Depth ${g.wave} in any run`;
    case 'towerUnlocked': return 'Claim the gated tower in the Tower Lab';
    case 'totalRuns': return `Settle ${g.runs} runs`;
    case 'lifetimeKills': return `Cull ${g.kills.toLocaleString('en-US')} enemies (lifetime)`;
    case 'bossesSlain': return `Slay ${g.bosses} distinct boss archetypes`;
    case 'totalBiomass': return `Harvest ${g.biomass.toLocaleString('en-US')} biomass (lifetime)`;
  }
}

// ── ONE-TAP GENOME REBUILD (docs/EVOLUTION-HQ.md §rebuild) ─────────────────────────────────────
// After a Molt the engine re-climbs: 20–50 Genome levels re-bought by hand every cycle. The
// rebuild spends the treasury along the EXISTING Best Value ranking (state/bestPurchase — exact
// Power per Core, the strip at the top of this screen) as one confirmable plan, re-ranked after
// every level. Only PowerParts.meta reads save.upgrades (meta.genomeUpgradeFactor), so each
// candidate is scored by swapping that one factor into ONE full parts computation — the same
// Power the Best Value strip reports, at microseconds per score (a 100-level plan stays instant on
// a phone). The after-Power is then scored IN FULL on the apply's own builder.
export const REBUILD = {
  maxSteps: 120, // a plan longer than this is split across taps (the confirm stays readable)
} as const;

export interface GenomeRebuildPlan {
  steps: GenomeRebuildStep[];
  rows: { id: string; name: string; from: number; to: number; cores: number }[]; // per-upgrade summary, plan order
  cores: number;
  powerBefore: number;
  powerAfter: number; // = powerBreakdown(genomeRebuildSave(save, steps)) — the apply's own builder
}

export function genomeRebuildPlan(save: SaveData, maxSteps: number = REBUILD.maxSteps): GenomeRebuildPlan {
  const powerBefore = powerBreakdown(save).score;
  const parts = accountPowerParts(save);
  const rest = parts.meta / Math.max(1e-12, genomeUpgradeFactor(save)); // every non-upgrade factor of `meta`
  const scoreOf = (upgrades: Record<string, number>): number =>
    composePower({ ...parts, meta: rest * genomeUpgradeFactor({ ...save, upgrades }) }).score;
  const defs = META_UPGRADES.filter((u) => upgradeUnlocked(save, u));
  const steps: GenomeRebuildStep[] = [];
  let upgrades = { ...save.upgrades };
  let shards = save.shards;
  let base = scoreOf(upgrades);
  while (steps.length < maxSteps) {
    // The Best Value pick: the affordable next level with the most Power per Core right now
    // (bestPurchase's ranking key; ties toward the cheaper commitment).
    let pick: { id: string; level: number; cost: number; value: number; score: number } | null = null;
    for (const def of defs) {
      const level = upgrades[def.id] ?? 0;
      if (level >= def.maxLevel) continue;
      const cost = upgradeCost(def, level);
      if (cost <= 0 || cost > shards) continue;
      const score = scoreOf({ ...upgrades, [def.id]: level + 1 });
      const value = (score - base) / cost;
      if (value > 0 && (!pick || value > pick.value || (value === pick.value && cost < pick.cost))) pick = { id: def.id, level, cost, value, score };
    }
    if (!pick) break;
    steps.push({ id: pick.id, level: pick.level + 1, cost: pick.cost });
    upgrades = { ...upgrades, [pick.id]: pick.level + 1 };
    shards -= pick.cost;
    base = pick.score;
  }
  const rows: GenomeRebuildPlan['rows'] = [];
  const byId = new Map<string, GenomeRebuildPlan['rows'][number]>();
  for (const st of steps) {
    const row = byId.get(st.id);
    if (row) { row.to = st.level; row.cores += st.cost; continue; }
    const def = META_UPGRADES.find((u) => u.id === st.id)!;
    const fresh = { id: st.id, name: def.name, from: st.level - 1, to: st.level, cores: st.cost };
    byId.set(st.id, fresh);
    rows.push(fresh);
  }
  const after = steps.length > 0 ? genomeRebuildSave(save, steps) : save;
  return {
    steps, rows,
    cores: steps.reduce((a, s) => a + s.cost, 0),
    powerBefore,
    powerAfter: after ? powerBreakdown(after).score : powerBefore,
  };
}
