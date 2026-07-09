// Phenotypes (docs/COSMETICS.md): the generator must cover EVERY tower and hero in the
// registries (new kinds inherit their full line automatically — this is the test that
// catches a parallel-session tower landing without its phenotypes), themes must be valid,
// and the save sanitizer must reject junk while keeping honest data.

import { describe, expect, it } from 'vitest';
import { COSMETIC_FAMILIES, cosmeticRegistry, cosmeticsForHero, cosmeticsForTower, cultivatePool } from './cosmetics';
import { HERO_ORDER, TOWER_ORDER } from './config';
import { defaultSave, parseImport, CURRENT_VERSION } from '../save/saveStore';

describe('phenotype registry', () => {
  it('every tower and hero has one phenotype per family (registry-driven scale)', () => {
    expect(cosmeticRegistry.size).toBe(COSMETIC_FAMILIES.length * (TOWER_ORDER.length + HERO_ORDER.length));
    for (const k of TOWER_ORDER) expect(cosmeticsForTower(k).length, k).toBe(COSMETIC_FAMILIES.length);
    for (const h of HERO_ORDER) expect(cosmeticsForHero(h).length, h).toBe(COSMETIC_FAMILIES.length);
  });

  it('exclusive families stay out of the cultivate pool', () => {
    const pool = new Set(cultivatePool().map((d) => d.id));
    for (const d of cosmeticRegistry.all()) {
      expect(pool.has(d.id), d.id).toBe(d.source === 'cultivate');
    }
  });

  it('every theme carries a full expression (palette + aura + sfx)', () => {
    for (const d of cosmeticRegistry.all()) {
      expect(d.theme.primary, d.id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(d.theme.glow, d.id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(d.theme.aura.length, d.id).toBeGreaterThan(0);
      expect(d.theme.sfx.length, d.id).toBeGreaterThan(0);
    }
  });
});

describe('phenotype save lane (v26)', () => {
  const pack = (data: unknown): string =>
    JSON.stringify({ schemaVersion: CURRENT_VERSION, data, checksum: '' });

  it('sanitizer keeps honest owned/equips and drops junk, wrong-kind and unowned equips', () => {
    const towerId = cosmeticsForTower(TOWER_ORDER[0])[0].id;
    const heroId = cosmeticsForHero(HERO_ORDER[0])[0].id;
    const s = {
      ...defaultSave(),
      cosmetics: {
        owned: [towerId, heroId, 'pt_fake_nope', 42],
        towers: {
          [TOWER_ORDER[0]]: towerId, // honest
          [TOWER_ORDER[1]]: towerId, // wrong kind for this slot key → dropped
          junkKind: heroId, // hero skin on a tower slot → dropped
        },
        heroes: { [HERO_ORDER[0]]: heroId, [HERO_ORDER[1]]: 'ph_missing_x' },
      },
    };
    const r = parseImport(pack(s));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.cosmetics.owned).toEqual([towerId, heroId]);
    expect(r.data.cosmetics.towers).toEqual({ [TOWER_ORDER[0]]: towerId });
    expect(r.data.cosmetics.heroes).toEqual({ [HERO_ORDER[0]]: heroId });
  });

  it('a pre-v26 save (no cosmetics field) fills the bare default — identity dress', () => {
    const legacy = { ...defaultSave() } as Record<string, unknown>;
    delete legacy.cosmetics;
    const r = parseImport(pack(legacy));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.cosmetics).toEqual({ owned: [], towers: {}, heroes: {} });
  });
});
