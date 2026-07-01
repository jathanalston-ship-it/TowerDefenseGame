// Evolution HQ read-model (docs/EVOLUTION-HQ.md) — groups the Genome Core upgrades by category
// into renderable sections + per-card views. Pure over SaveData + config: adding an upgrade or a
// category needs nothing here. Power previews stay in the component (they call the reactive store).

import { META_UPGRADES } from '../core/config';
import type { GenomeCategory, UpgradeDef } from '../core/config';
import { upgradeCost, upgradeLevel } from './meta';
import type { SaveData } from '../save/saveStore';

export interface GenomeCardView {
  id: string;
  name: string;
  description: string;
  level: number;
  maxLevel: number;
  cost: number | null; // null = maxed
  effectNow: string; // cumulative effect at the current level ('—' at 0)
  effectNext: string; // effect at level+1 ('' when maxed)
  completed: boolean;
}

export interface GenomeSection {
  category: GenomeCategory;
  icon: string;
  title: string;
  desc: string;
  cards: GenomeCardView[];
  boughtLevels: number;
  totalLevels: number;
  completionPct: number; // 0..100
  coresSpent: number; // Genome Cores sunk into this section so far
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

/** Cumulative effect label at `level` (e.g. '+24%', '+75', '−10%'), or '—' at level 0. */
export function effectLabel(u: UpgradeDef, level: number): string {
  if (level <= 0) return '—';
  const raw = perLevelOf(u) * level;
  if (FLAT_FIELDS.has(fieldOf(u))) return `+${Math.round(raw)}`;
  const pct = Math.round(raw * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
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
    const cards: GenomeCardView[] = defs.map((u) => {
      const level = upgradeLevel(save, u.id);
      const maxed = level >= u.maxLevel;
      bought += level;
      total += u.maxLevel;
      coresSpent += spentTo(u, level);
      return {
        id: u.id,
        name: u.name,
        description: u.description,
        level,
        maxLevel: u.maxLevel,
        cost: maxed ? null : upgradeCost(u, level),
        effectNow: effectLabel(u, level),
        effectNext: maxed ? '' : effectLabel(u, level + 1),
        completed: maxed,
      };
    });
    out.push({
      category,
      ...SECTION_META[category],
      cards,
      boughtLevels: bought,
      totalLevels: total,
      completionPct: total > 0 ? Math.round((bought / total) * 100) : 0,
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
