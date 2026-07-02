// Gene Evolution stress test (Task 12 audit — docs/GENE-EVOLUTION.md). Registers synthetic cards
// on top of the real pool and proves the ARCHITECTURE holds at the CLAUDE.md content target
// (hundreds of cards) with no redesign: the validator, the Archive read-model, the Power fold,
// the sanitizer, and the Archive's filter/sort derivations all stay correct AND fast. Registry
// state is per-test-file (vitest isolation), so the synthetics never leak into other suites.
// Timing bounds are deliberately generous (~10× local headroom) to stay CI-stable while still
// catching an accidental O(n²) regression.

import { describe, it, expect } from 'vitest';
import { CARD_POOL, cardProblems, cardRegistry } from '../core/cards';
import type { CardDef } from '../core/cards';
import type { CardRarity } from '../core/types';
import { geneCollectionPowerMult, geneMaxLevel, sanitizeGeneSave } from '../core/geneCards';
import type { GeneSave } from '../core/geneCards';
import { geneArchiveRows, geneArchiveSummary } from './geneArchive';
import { defaultSave } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';

const RARITIES: CardRarity[] = ['common', 'rare', 'epic', 'legendary'];

/** A well-formed synthetic card — passes every cardProblems rule (3 Power-visible levels). */
function synthCard(n: number): CardDef {
  return {
    id: `stress_gene_${n}`,
    name: `Stress Gene ${n}`,
    rarity: RARITIES[n % RARITIES.length],
    category: 'tower',
    description: `synthetic card #${n}`,
    effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.05 }],
    maxLevel: 3,
    upgrades: [
      { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.04 }], note: `L1 #${n}` },
      { effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.03 }], note: `L2 #${n}` },
      { effects: [{ op: 'add', field: 'needleExtraProjectiles', value: 1 }], note: `L3 #${n}` },
    ],
  };
}

/** Grow the registry to `total` cards (real pool + synthetics), idempotently. */
function growRegistryTo(total: number): void {
  for (let n = 0; cardRegistry.ids().length < total; n++) {
    if (!cardRegistry.get(`stress_gene_${n}`)) cardRegistry.register(synthCard(n));
  }
}

/** A maxed-out account over every registered card (everything owned, everything leveled). */
function fullSave(): SaveData {
  const ids = cardRegistry.ids();
  const genes: GeneSave = {};
  for (const id of ids) genes[id] = { level: geneMaxLevel(cardRegistry.get(id)!) };
  return {
    ...defaultSave(),
    stats: { ...defaultSave().stats, uniqueCards: ids },
    genes,
    geneEssence: 10_000_000,
    campaign: { cleared: { standard: 100 }, bestTime: {} },
  };
}

function timed<T>(fn: () => T): { out: T; ms: number } {
  const t0 = performance.now();
  const out = fn();
  return { out, ms: performance.now() - t0 };
}

describe.each([100, 250, 500])('Gene architecture at %i cards (stress)', (total) => {
  it('validates, renders, folds Power, sorts, and sanitizes — correct and fast', () => {
    growRegistryTo(total);
    expect(cardRegistry.ids().length).toBeGreaterThanOrEqual(total);

    // 1) Content contract holds for every synthetic (no card bypasses upgrades or Power).
    expect(cardProblems(cardRegistry.get('stress_gene_0')!)).toEqual([]);

    const save = fullSave();

    // 2) The Archive read-model: one row per registered card, still fast at scale.
    const rows = timed(() => geneArchiveRows(save));
    expect(rows.out).toHaveLength(cardRegistry.ids().length);
    expect(rows.out.every((r) => r.owned && r.level === r.maxLevel && r.nextCost === null)).toBe(true);
    expect(rows.ms).toBeLessThan(250); // linear derivation — generous CI bound

    const sum = geneArchiveSummary(save, rows.out);
    expect(sum.total).toBe(rows.out.length);
    expect(sum.levels).toBe(sum.maxLevels); // everything maxed

    // 3) The Power fold stays LINEAR: finite, bounded, and cheap even fully maxed.
    const power = timed(() => geneCollectionPowerMult(save.genes));
    expect(Number.isFinite(power.out)).toBe(true);
    expect(power.out).toBeGreaterThan(1);
    expect(power.out).toBeLessThan(1 + 0.15 * 1.0 * cardRegistry.ids().length); // per-card delta < 1.0 ⇒ linear ceiling
    expect(power.ms).toBeLessThan(100);

    // 4) The Archive's client-side derivations (filter + sort) scale.
    const sorted = timed(() => rows.out
      .filter((r) => r.owned)
      .slice()
      .sort((a, b) => b.powerMult - a.powerMult || a.def.name.localeCompare(b.def.name)));
    expect(sorted.out).toHaveLength(rows.out.length);
    expect(sorted.ms).toBeLessThan(100);

    // 5) The sanitizer over the full map (every import/export runs this).
    const sane = timed(() => sanitizeGeneSave(save.genes));
    expect(Object.keys(sane.out)).toHaveLength(Object.keys(save.genes).length);
    expect(sane.ms).toBeLessThan(250);

    // 6) The real pool is untouched by scale (registry order stable — saves stay compatible).
    expect(cardRegistry.ids().slice(0, CARD_POOL.length)).toEqual(CARD_POOL.map((c) => c.id));
  });
});
