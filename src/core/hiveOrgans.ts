// HIVE CONSTRUCTION (docs/HIVE-CONSTRUCTION.md) — the composite long-horizon sink. The Home
// Base's passive growth (ui/homeBaseTiers.ts: labScore → eras → fixtures) stays the
// PREREQUISITE ladder; this registry makes the next stage ACTIVE: the player BUILDS the
// laboratory's organs, each consuming a MIX of currencies (Genome Cores + Gene Essence +
// Strain Samples + Apex Genome + materials — a different recipe per organ), and each built
// organ LAYERS visibly into LabAtmosphere through the existing generic fixture renderer
// (an organ = its fixture rows — zero renderer changes).
//
// CONSTITUTION: organs are sidegrades — visible base transformation + fiction/QoL only,
// NEVER combat power. Power Score never reads this file (docs/GAME_CONSTITUTION.md).
//
// Costs follow the economyDirector discipline: every price is a FACTOR-TRACED line
// (base × tierFactor, left-to-right) so a cost is explainable, not a bare number.
// Strain Samples / Apex Genome are PER-KIND wallets — a recipe charges a TOTAL and the
// drain plan takes greedily from the RICHEST stacks first (deterministic ROSTER-order
// tie-break), protecting kinds the player has nearly saved up for an Evolution.

import type { TowerKind, HeroKind } from './types';
import { TOWER_ORDER, HERO_ORDER } from './config';

/** The wallets an organ recipe may charge. Scalars come straight off the save; strain/apex
 *  are TOTALS drained across the per-kind records by the drain plan below. */
export interface HiveRecipe {
  cores?: number; // Genome Cores (save.shards)
  essence?: number; // Gene Essence (save.geneEssence)
  strain?: number; // Strain Samples TOTAL (save.towerShards, drained richest-first)
  apex?: number; // Apex Genome TOTAL (save.heroShards, drained richest-first)
  mutagen?: number;
  scrap?: number;
  catalyst?: number;
}

export const RECIPE_KEYS = ['cores', 'essence', 'strain', 'apex', 'mutagen', 'scrap', 'catalyst'] as const;
export type RecipeKey = (typeof RECIPE_KEYS)[number];

export interface HiveOrganDef {
  id: string;
  name: string;
  icon: string; // single-glyph identity (cards + timeline)
  blurb: string; // the fiction — what grows into the lab
  era: 0 | 1 | 2 | 3; // labEra PREREQUISITE (homeBaseTiers) — construction unlocks WITHIN reached eras
  tiers: 1 | 3; // ×3-tiered organs deepen (geometric cost, extra fixture layers)
  recipe: HiveRecipe; // TIER-1 base — tier n costs base × TIER_FACTOR^(n-1)
  /** Fixture layers per built tier (index 0 = tier 1). Each id renders as `.lab-fix .fix-<id>`
   *  in LabAtmosphere — layers are ADDITIVE (tier 2 keeps tier 1's growth). */
  fixtures: string[][];
  perk: string; // the QoL/fiction payoff line (NEVER combat power)
}

/** Geometric deepening for ×3-tiered organs (tier n = base × 3^(n-1)). */
export const HIVE_TIER_FACTOR = 3;

const O = (id: string, name: string, icon: string, era: HiveOrganDef['era'], tiers: HiveOrganDef['tiers'],
  recipe: HiveRecipe, fixtures: string[][], blurb: string, perk: string): HiveOrganDef =>
  ({ id, name, icon, era, tiers, recipe, fixtures, blurb, perk });

/** THE ORGAN BOOK — adding an organ = one row (+ its .fix-* CSS layers). */
export const HIVE_ORGANS: HiveOrganDef[] = [
  // ── ERA 0 · NASCENT — the first deliberate growths ──
  O('spore_garden', 'Spore Garden', '❀', 0, 3,
    { essence: 40, scrap: 6 },
    [['hv-spores1'], ['hv-spores2'], ['hv-spores3']],
    'Planter clusters seeded with luminous spores — the first thing the lab grows on purpose.',
    'Drifting spore motes thicken with each planting; the floor learns to glow.'),
  O('lumen_polyps', 'Lumen Polyps', '◉', 0, 1,
    { cores: 400, mutagen: 8 },
    [['hv-polyps']],
    'Soft-bodied light organs budded along the ceiling line. They dim when you leave.',
    'The lab lights itself — ambient luminance rises.'),

  // ── ERA 1 · GROWING — infrastructure with a pulse ──
  O('marrow_forge', 'Marrow Forge', '⚒', 1, 3,
    { cores: 600, scrap: 12, strain: 30 },
    [['hv-forge1'], ['hv-forge2'], ['hv-forge3']],
    'A smithy of living bone — ribs for tongs, a heart for a bellows. It shapes chitin like clay.',
    'Forge-light flickers across the floor plates; slag pits breathe embers.'),
  O('sample_arbor', 'Specimen Arbor', '⚘', 1, 1,
    { essence: 120, strain: 60 },
    [['hv-arbor']],
    'A tree whose fruit are specimen jars. Every strain you have mastered hangs somewhere on it.',
    'The arbor catalogues your victories — jars sway when you molt.'),
  O('chorus_node', 'Chorus Node', '♪', 1, 1,
    { cores: 900, catalyst: 5 },
    [['hv-chorus']],
    'A resonance organ tuned to the Hive Core\'s heartbeat. It hums the frequency of home.',
    'The base gains a voice — the chorus swells as your organism thrives.'),

  // ── ERA 2 · THRIVING — the lab becomes an ecosystem ──
  O('vein_loom', 'Vein Loom', '∿', 2, 3,
    { essence: 200, mutagen: 15, apex: 20 },
    [['hv-loom1'], ['hv-loom2'], ['hv-loom3']],
    'A loom that weaves living conduit — every pass threads new veins through the architecture.',
    'Vein networks spread wall to wall, pulsing in time with the supercomputer.'),
  O('membrane_dome', 'Membrane Observatory', '◍', 2, 1,
    { cores: 2500, strain: 90, catalyst: 10 },
    [['hv-dome']],
    'A translucent dome of stretched membrane. Through it, the infestation outside looks back.',
    'A skylight onto the war — auroras of the surface world play across the floor.'),
  O('symbiote_pool', 'Symbiote Pool', '≋', 2, 1,
    { essence: 450, apex: 45, scrap: 30 },
    [['hv-pool']],
    'A breeding pool for the small symbiotes that keep the lab clean, fed, and faintly singing.',
    'Ripples cross the pool when heroes return from expeditions.'),

  // ── ERA 3 · ASCENDANT — the crown of the organism ──
  O('crown_spire', 'Crown Spire', '♆', 3, 3,
    { cores: 4000, essence: 600, strain: 120, apex: 60, catalyst: 14 },
    [['hv-spire1'], ['hv-spire2'], ['hv-spire3']],
    'The apex growth — a spire of fused chitin and light climbing out of the lab\'s heart.',
    'The spire crowns the skyline of the base; its beacon marks an apex organism.'),
  O('world_womb', 'World-Womb', '✧', 3, 1,
    { cores: 10_000, essence: 1500, strain: 250, apex: 120, mutagen: 60, scrap: 60, catalyst: 25 },
    [['hv-womb']],
    'The final chamber: a womb the size of a room, dreaming the organism\'s next body.',
    'Something vast turns over in its sleep. The whole lab breathes with it.'),
];

export function hiveOrganById(id: string): HiveOrganDef | undefined {
  return HIVE_ORGANS.find((o) => o.id === id);
}

// ── Factor-traced costs (economyDirector discipline: a price is a TRACE, not a number) ──────

export interface HiveCostLine {
  key: RecipeKey;
  base: number;
  tierFactor: number; // 3^(tier-1) for tiered organs; 1 for tier 1 / untiered
  amount: number; // base × tierFactor (the charged value — exact order)
}

/** The traced cost of building `def` at `tier` (1-based). Lines only for charged currencies. */
export function hiveCost(def: HiveOrganDef, tier: number): HiveCostLine[] {
  const f = Math.pow(HIVE_TIER_FACTOR, Math.max(0, tier - 1));
  const out: HiveCostLine[] = [];
  for (const key of RECIPE_KEYS) {
    const base = def.recipe[key];
    if (base !== undefined && base > 0) out.push({ key, base, tierFactor: f, amount: base * f });
  }
  return out;
}

/** Human trace ("600 × 9 = 5,400 Cores") — the §explain twin of economyDirector.explainIncome. */
export function explainCost(line: HiveCostLine): string {
  return line.tierFactor === 1
    ? `${line.amount.toLocaleString()}`
    : `${line.base.toLocaleString()} × ${line.tierFactor} = ${line.amount.toLocaleString()}`;
}

// ── The per-kind drain plan (Strain Samples / Apex Genome are per-kind wallets) ─────────────

/** Take `total` from per-kind stacks, RICHEST first (ties broken by roster order — stable and
 *  deterministic). Returns null when the stacks can't cover the total. Pure. */
export function drainPlan<K extends string>(stacks: Record<K, number>, order: readonly K[], total: number):
  { kind: K; take: number }[] | null {
  if (total <= 0) return [];
  const held = order.reduce((s, k) => s + (stacks[k] ?? 0), 0);
  if (held < total) return null;
  // Sort a copy: richest first, roster order among equals (indexOf is fine at roster scale).
  const ranked = [...order].sort((a, b) => (stacks[b] ?? 0) - (stacks[a] ?? 0) || order.indexOf(a) - order.indexOf(b));
  const plan: { kind: K; take: number }[] = [];
  let left = total;
  for (const kind of ranked) {
    if (left <= 0) break;
    const take = Math.min(stacks[kind] ?? 0, left);
    if (take > 0) {
      plan.push({ kind, take });
      left -= take;
    }
  }
  return left > 0 ? null : plan;
}

export const strainDrainPlan = (stacks: Record<TowerKind, number>, total: number): { kind: TowerKind; take: number }[] | null =>
  drainPlan(stacks, TOWER_ORDER, total);
export const apexDrainPlan = (stacks: Record<HeroKind, number>, total: number): { kind: HeroKind; take: number }[] | null =>
  drainPlan(stacks, HERO_ORDER, total);

// ── Registry validation (content-registry pattern; hiveOrgans.test.ts runs it per row) ──────

export function hiveOrganProblems(o: HiveOrganDef): string[] {
  const out: string[] = [];
  if (!o.id || !/^[a-z_]+$/.test(o.id)) out.push(`${o.id}: id must be snake_case`);
  if (!o.name || !o.blurb || !o.icon || !o.perk) out.push(`${o.id}: name/blurb/icon/perk required`);
  if (o.era < 0 || o.era > 3) out.push(`${o.id}: era must be 0..3`);
  if (o.tiers !== 1 && o.tiers !== 3) out.push(`${o.id}: tiers must be 1 or 3`);
  const lines = hiveCost(o, 1);
  if (lines.length < 2) out.push(`${o.id}: a hive recipe must MIX at least two currencies (the composite-sink mandate)`);
  for (const l of lines) {
    if (!Number.isFinite(l.base) || l.base <= 0 || l.base !== Math.floor(l.base)) out.push(`${o.id}: ${l.key} must be a positive integer`);
  }
  if (o.fixtures.length !== o.tiers) out.push(`${o.id}: one fixture layer-list per tier (${o.fixtures.length} ≠ ${o.tiers})`);
  for (const layer of o.fixtures) {
    if (layer.length === 0) out.push(`${o.id}: every tier must add at least one fixture layer`);
    for (const id of layer) if (!/^hv-[a-z0-9-]+$/.test(id)) out.push(`${o.id}: fixture '${id}' must be hv-kebab (its .fix-<id> CSS class)`);
  }
  return out;
}

/** Fixture ids contributed by a built ledger — the LabAtmosphere merge (layers are additive:
 *  every tier up to the built one contributes). Unknown ids/tiers are ignored defensively. */
export function hiveFixtures(built: Record<string, number>): string[] {
  const out: string[] = [];
  for (const o of HIVE_ORGANS) {
    const tier = Math.min(built[o.id] ?? 0, o.tiers);
    for (let t = 0; t < tier; t++) out.push(...o.fixtures[t]);
  }
  return out;
}

/** The built organism's ambient-glow bonus — a VISUAL intensity lift only (LabAtmosphere's
 *  --lab-intensity), never gameplay. +0.02 per built tier, capped gently. */
export function hiveGlow(built: Record<string, number>): number {
  const tiers = HIVE_ORGANS.reduce((s, o) => s + Math.min(built[o.id] ?? 0, o.tiers), 0);
  return Math.min(0.16, tiers * 0.02);
}
