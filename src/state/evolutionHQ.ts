// Evolution HQ read-model (docs/EVOLUTION-HQ.md) — groups the Genome Core upgrades by category
// into renderable sections + per-card views. Pure over SaveData + config: adding an upgrade or a
// category needs nothing here. Power previews stay in the component (they call the reactive store).

import { META_UPGRADES, upgradeEffectUnits } from '../core/config';
import type { GenomeCategory, UpgradeDef } from '../core/config';
import { upgradeCost, upgradeLevel, upgradeUnlocked } from './meta';
import type { SaveData } from '../save/saveStore';

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
