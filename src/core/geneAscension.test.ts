// Ascension BACKEND (Gene Task 10 — docs/GENE-EVOLUTION.md §Ascension). NO gameplay: no tiers are
// authored, no grant path exists, and the sanitizer clamps saved tiers to the authored ceiling
// (0 today). These tests pin the seams the future Ascension feature will light up — effects fold,
// Power fold, rarity/art resolution, save compatibility, and the dev-boot content validator.

import { describe, it, expect } from 'vitest';
import {
  effectiveGeneEffects, geneAscensionMaxTier, geneAscensionPowerMult, geneCollectionPowerMult,
  geneEffectiveRarity, geneArtKey, sanitizeGeneSave,
} from './geneCards';
import { CARD_POOL, cardProblems, cardRegistry } from './cards';
import type { CardDef, GeneUpgradeLevel } from './cards';

// A fully-authored synthetic ascendable card — well-formed by every cardProblems rule, so the
// validator variants below fail ONLY for the ascension defect under test. Registered (unique id)
// so the registry-reading seams (collection power, sanitizer) resolve it.
const upgrades: GeneUpgradeLevel[] = [
  { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.05 }], note: 'L1' },
  { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.05 }], note: 'L2' },
  { effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.05 }], note: 'L3' },
];
const ascCard: CardDef = {
  id: 'x_ascend_test', name: 'X', rarity: 'rare', category: 'tower', description: '',
  effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.1 }],
  maxLevel: 3, upgrades,
  ascension: {
    maxTier: 2,
    tiers: [
      { rarity: 'epic', art: 'asc1', effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.2 }], note: 'T1' },
      { rarity: 'legendary', effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.15 }], note: 'T2' },
    ],
  },
  skins: [{ id: 'chrome', name: 'Chrome', art: 'skin_chrome' }],
  art: 'base_art',
};
cardRegistry.register(ascCard);

describe('Task 10 pin — NO ascension gameplay ships today', () => {
  it('no real card authors ascension; a saved tier on a real card sanitizes away', () => {
    for (const c of CARD_POOL) expect(geneAscensionMaxTier(c)).toBe(0);
    // A manipulated save claiming tier 3 on a real card clamps to the authored ceiling (0).
    const real = CARD_POOL[0];
    const out = sanitizeGeneSave({ [real.id]: { level: 1, ascension: 3 } });
    expect(out[real.id].ascension).toBeUndefined();
    expect(out[real.id].level).toBe(1);
  });
});

describe('effects fold — effectiveGeneEffects(def, level, ascension)', () => {
  it('tier 0 (the only reachable state today) is byte-identical to the level-only fold', () => {
    expect(effectiveGeneEffects(ascCard, 0, 0)).toEqual(ascCard.effects);
    expect(effectiveGeneEffects(ascCard, 2, 0)).toEqual(effectiveGeneEffects(ascCard, 2));
  });

  it('authored tiers append after upgrades, clamped to the authored count', () => {
    expect(effectiveGeneEffects(ascCard, 0, 1)).toHaveLength(2); // base + T1
    expect(effectiveGeneEffects(ascCard, 3, 2)).toHaveLength(6); // base + L1..3 + T1..2
    expect(effectiveGeneEffects(ascCard, 3, 99)).toHaveLength(6); // clamped
  });
});

describe('Power fold — ascension can never silently bypass the Power Score', () => {
  it('per-card ascension power is 1 at tier 0 and rises per authored tier', () => {
    expect(geneAscensionPowerMult(ascCard, 0)).toBe(1);
    expect(geneAscensionPowerMult(ascCard, 1)).toBeGreaterThan(1);
    expect(geneAscensionPowerMult(ascCard, 2)).toBeGreaterThan(geneAscensionPowerMult(ascCard, 1));
    expect(geneAscensionPowerMult(CARD_POOL[0], 5)).toBe(1); // nothing authored ⇒ nothing counted
  });

  it('the collection fold counts ascension in the SAME linear sum as levels', () => {
    const levelsOnly = geneCollectionPowerMult({ [ascCard.id]: { level: 2 } });
    const withTier = geneCollectionPowerMult({ [ascCard.id]: { level: 2, ascension: 1 } });
    expect(withTier).toBeGreaterThan(levelsOnly);
  });
});

describe('rarity + artwork resolution seams (future UI)', () => {
  it('effective rarity: base → rarityTier steps → ascended override, clamped at the ladder top', () => {
    expect(geneEffectiveRarity(ascCard)).toBe('rare'); // base
    expect(geneEffectiveRarity(ascCard, { level: 0, rarityTier: 1 })).toBe('epic'); // future rarity upgrade
    expect(geneEffectiveRarity(ascCard, { level: 0, rarityTier: 99 })).toBe('legendary'); // ladder-top clamp
    expect(geneEffectiveRarity(ascCard, { level: 0, ascension: 1 })).toBe('epic'); // T1 override
    expect(geneEffectiveRarity(ascCard, { level: 0, ascension: 2 })).toBe('legendary'); // T2 override
    expect(geneEffectiveRarity(CARD_POOL[0])).toBe(CARD_POOL[0].rarity); // real cards: unchanged
  });

  it('art key: skin wins → deepest ascended art at the tier → base art → undefined', () => {
    expect(geneArtKey(ascCard)).toBe('base_art');
    expect(geneArtKey(ascCard, { level: 0, ascension: 1 })).toBe('asc1');
    expect(geneArtKey(ascCard, { level: 0, ascension: 2 })).toBe('asc1'); // T2 has no art ⇒ deepest authored
    expect(geneArtKey(ascCard, { level: 0, ascension: 2, skin: 'chrome' })).toBe('skin_chrome');
    expect(geneArtKey(CARD_POOL[0])).toBe(CARD_POOL[0].art); // real cards: procedural fallback path
  });
});

describe('save compatibility — the sanitizer clamps future-state fields to authored content', () => {
  it('round-trips a valid tier on an ascendable card; clamps beyond the ceiling', () => {
    const out = sanitizeGeneSave({ [ascCard.id]: { level: 1, ascension: 1, rarityTier: 1, skin: 'chrome' } });
    expect(out[ascCard.id]).toMatchObject({ level: 1, ascension: 1, rarityTier: 1, skin: 'chrome' });
    expect(sanitizeGeneSave({ [ascCard.id]: { level: 0, ascension: 99 } })[ascCard.id].ascension).toBe(2);
    // rarityTier headroom: rare sits 2 below legendary ⇒ 99 clamps to 2.
    expect(sanitizeGeneSave({ [ascCard.id]: { level: 0, rarityTier: 99 } })[ascCard.id].rarityTier).toBe(2);
  });
});

describe('dev-boot validation — future ascension content must ship sound', () => {
  it('accepts the well-formed ascension block', () => {
    expect(cardProblems(ascCard)).toEqual([]);
  });

  it('rejects tier-count mismatch, empty tiers, Power-invisible tiers, boot-only fields, rarity downgrades', () => {
    const bad = (asc: CardDef['ascension']): string[] => cardProblems({ ...ascCard, id: 'x_bad', ascension: asc });
    expect(bad({ maxTier: 3, tiers: ascCard.ascension!.tiers })).toContainEqual(expect.stringContaining('must equal maxTier'));
    expect(bad({ maxTier: 1, tiers: [{ note: 'art-only' }] })).toContainEqual(expect.stringContaining('T1 has no effects'));
    expect(bad({ maxTier: 1, tiers: [{ effects: [{ op: 'biomass', value: 50 }] }] }))
      .toContainEqual(expect.stringContaining('T1 is invisible to Power Score'));
    expect(bad({ maxTier: 1, tiers: [{ effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.1 }, { op: 'mul', field: 'integrityMult', value: 1.2 }] }] }))
      .toContainEqual(expect.stringContaining("boot-only"));
    expect(bad({ maxTier: 1, tiers: [{ rarity: 'common', effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.1 }] }] }))
      .toContainEqual(expect.stringContaining('downgrades rarity'));
    expect(bad({ maxTier: 0, tiers: [] })).toContainEqual(expect.stringContaining('positive integer'));
  });
});
