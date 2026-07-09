// Procedural equipment art (docs/EQUIPMENT.md §visuals) — pins that the illustration DERIVES from
// item data (rarity tier + affixes scale embellishment/effects) and is deterministic per item.
import { describe, it, expect } from 'vitest';
import { deriveItemArt, rarityTier, artSeed } from './equipmentArt';
import { WEAPONS, ARMOR, RELICS } from '../core/equipment';

describe('deriveItemArt', () => {
  it('rarity raises the visual tier, spike count, particles, and unlocks "living" at legendary+', () => {
    const def = WEAPONS[0];
    const common = deriveItemArt(def, 'common', 0);
    const legendary = deriveItemArt(def, 'legendary', 0);
    const exotic = deriveItemArt(def, 'exotic', 0);
    expect(legendary.tier).toBeGreaterThan(common.tier);
    expect(legendary.spikes).toBeGreaterThan(common.spikes);
    expect(common.living).toBe(false);
    expect(legendary.living).toBe(true);
    expect(exotic.particles).toBeGreaterThan(common.particles);
  });
  it('affixes add embellishment; the seed + form are stable per item id', () => {
    const def = WEAPONS[1];
    expect(deriveItemArt(def, 'epic', 4).spikes).toBeGreaterThan(deriveItemArt(def, 'epic', 0).spikes);
    expect(deriveItemArt(def, 'epic', 0).seed).toBe(artSeed(def.id));
  });
  it('the emblem subtype tracks the slot (weapon/armor/relic)', () => {
    expect(deriveItemArt(WEAPONS[0], 'rare').slot).toBe('weapon');
    expect(deriveItemArt(ARMOR[0], 'rare').slot).toBe('armor');
    expect(deriveItemArt(RELICS[0], 'rare').subtype).toBe('relic');
  });
  it('rarityTier is rarity-agnostic (unknown ⇒ mid tier, never crashes)', () => {
    expect(rarityTier('common')).toBe(0);
    expect(rarityTier('nonsense')).toBe(2);
  });
});
