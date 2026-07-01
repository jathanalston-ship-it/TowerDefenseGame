// Gene Cards — permanent progression ARCHITECTURE (docs/GENE-EVOLUTION.md). Pins the data model,
// the effective-effects / power seams (no-op until Task 4 authors upgrades), and the save sanitizer.

import { describe, it, expect } from 'vitest';
import {
  effectiveGeneEffects, genePermanentPowerMult, geneCollectionPowerMult, geneLevel, geneMaxLevel,
  sanitizeGeneSave,
} from './geneCards';
import type { GeneSave } from './geneCards';
import { CARD_POOL, cardRegistry } from './cards';
import type { CardDef } from './cards';
import { effectsPower } from './power';

const baseCard = CARD_POOL[0]; // a real registered card (Task 4: now carries authored upgrades)

// A synthetic upgrade-less card — the golden-safety reference: a card applied at level 0 (or with
// nothing authored) must be byte-identical to its base. Fresh saves have EMPTY gene maps ⇒ level 0.
const bare: CardDef = {
  id: 'x_bare', name: 'X', rarity: 'common', category: 'tower', description: '',
  effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.1 }],
};

// A synthetic card WITH upgrade levels — proves the fold logic works ahead of Task 4's content.
const leveled: CardDef = {
  id: baseCard.id, // reuse a real id so registry lookups resolve
  name: 'X', rarity: 'common', category: 'tower', description: '',
  effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.1 }],
  maxLevel: 3,
  upgrades: [
    { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.1 }], note: 'L1' },
    { effects: [{ op: 'add', field: 'needleExtraProjectiles', value: 1 }], note: 'L2' },
    { effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.1 }], note: 'L3' },
  ],
};

describe('gene architecture — effective effects seam', () => {
  it('level 0 (a fresh save) returns BASE effects — and an upgrade-less card at any level (golden-safe)', () => {
    expect(effectiveGeneEffects(baseCard, 0)).toEqual(baseCard.effects); // real card at level 0 = base
    expect(effectiveGeneEffects(bare, 5)).toEqual(bare.effects); // no upgrades authored ⇒ base at any level
    expect(geneMaxLevel(bare)).toBe(1); // base-only ceiling
    expect(geneMaxLevel(baseCard)).toBeGreaterThanOrEqual(3); // Task 4: real cards carry 3–5 levels
  });

  it('folds base + upgrades up to the level (and clamps to authored count)', () => {
    expect(effectiveGeneEffects(leveled, 0)).toEqual(leveled.effects);
    expect(effectiveGeneEffects(leveled, 1)).toHaveLength(2); // base + L1
    expect(effectiveGeneEffects(leveled, 3)).toHaveLength(4); // base + L1..L3
    expect(effectiveGeneEffects(leveled, 99)).toHaveLength(4); // clamped to authored upgrades
    expect(geneMaxLevel(leveled)).toBe(3);
  });
});

describe('gene architecture — power seams', () => {
  it('permanent power is 1 at level 0 and rises with authored upgrade levels', () => {
    expect(genePermanentPowerMult(baseCard, 0)).toBe(1);
    expect(genePermanentPowerMult(bare, 5)).toBe(1); // nothing authored ⇒ nothing permanent
    expect(genePermanentPowerMult(leveled, 0)).toBe(1);
    expect(genePermanentPowerMult(leveled, 1)).toBeGreaterThan(1);
    expect(genePermanentPowerMult(leveled, 3)).toBeGreaterThan(genePermanentPowerMult(leveled, 1));
    // only the UPGRADE effects count (base is temporary), so it equals effectsPower of the deltas.
    expect(genePermanentPowerMult(leveled, 1)).toBeCloseTo(effectsPower(leveled.upgrades![0].effects), 10);
  });

  it('collection power is 1 with nothing upgraded, and LINEAR (scale-safe) as it grows', () => {
    expect(geneCollectionPowerMult({})).toBe(1);
    const one: GeneSave = { [baseCard.id]: { level: 0 } };
    expect(geneCollectionPowerMult(one)).toBe(1); // level 0 ⇒ no contribution
    // Linear aggregation: the WHOLE library maxed can't explode (bounded, additive — scale-safe).
    const many: GeneSave = {};
    for (const c of CARD_POOL) many[c.id] = { level: 5 };
    const p = geneCollectionPowerMult(many);
    expect(p).toBeGreaterThan(1); // Task 4: real upgrades now contribute permanent power
    expect(p).toBeLessThan(30); // linear, not exponential — sane even fully maxed
    expect(Number.isFinite(p)).toBe(true);
  });
});

describe('gene architecture — save sanitizer (anti-corruption / anti-manipulation)', () => {
  it('drops unknown/renamed card ids', () => {
    const out = sanitizeGeneSave({ __not_a_card__: { level: 3 }, [baseCard.id]: { level: 1 } });
    expect(out.__not_a_card__).toBeUndefined();
    // baseCard has maxLevel 1 (no upgrades) ⇒ level clamps to 1... but it's the real card (max 1).
    expect(geneLevel(out, baseCard.id)).toBeLessThanOrEqual(geneMaxLevel(cardRegistry.get(baseCard.id)!));
  });

  it('clamps levels to the card ceiling and negative/garbage to 0', () => {
    const out = sanitizeGeneSave({ [baseCard.id]: { level: -5 }, });
    expect(geneLevel(out, baseCard.id)).toBe(0);
    expect(sanitizeGeneSave({ [baseCard.id]: { level: 'lots' } })[baseCard.id]).toBeUndefined(); // garbage ⇒ dropped (level 0, sparse)
    expect(sanitizeGeneSave(null)).toEqual({});
    expect(sanitizeGeneSave(42)).toEqual({});
  });

  it('keeps the map SPARSE — a level-0 entry is not persisted', () => {
    expect(sanitizeGeneSave({ [baseCard.id]: { level: 0 } })).toEqual({});
  });
});
