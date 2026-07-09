// Mulligan save + meta integration (docs/MULLIGANS.md): the v26 schema defaults + migration +
// sanitization, the GOLDEN-SAFETY of the towerProgress fold (empty ⇒ identity), the separately-scored
// Power bucket, and the full equip/upgrade/ascend/discover pipeline through the meta store.

import { describe, it, expect } from 'vitest';
import { defaultSave, parseImport } from '../save/saveStore';
import { accountPowerParts, meta, towerProgress } from './meta';
import { assembleMulligan } from '../core/mulligan';
import type { SaveData } from '../save/saveStore';

describe('save schema v26', () => {
  it('defaults: every tower owns an empty Mulligan; dex empty; 0 Gene Overflow', () => {
    const d = defaultSave();
    expect(d.geneOverflow).toBe(0);
    expect(d.mulliganDex).toEqual({});
    expect(d.mulligans.needle.slots).toEqual([null, null, null]);
  });

  it('migrates a pre-v26 save (no Mulligan fields) to empty organisms + 0 overflow', () => {
    const legacy = { ...defaultSave() } as Record<string, unknown>;
    delete legacy.mulligans;
    delete legacy.mulliganDex;
    delete legacy.geneOverflow;
    const r = parseImport(JSON.stringify(legacy));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.geneOverflow).toBe(0);
      expect(r.data.mulligans.mortar.slots).toEqual([null, null, null]);
      expect(r.data.mulliganDex).toEqual({});
    }
  });

  it('sanitizes malformed slots (unknown id / bad level) and drops unknown dex ids', () => {
    const bad = { ...defaultSave() } as Record<string, unknown>;
    bad.mulligans = { needle: { slots: [{ id: 'nope', rarity: 'common', level: 1 }, { id: 'bone_spike', rarity: 'epic', level: 9999 }, null], visualSeed: -3.5, animSeed: 'x' } };
    bad.mulliganDex = { bone_spike: 'rare', ghost_gene: 'epic', acid_gland: 'not_a_rarity' };
    const r = parseImport(JSON.stringify(bad));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const s = r.data.mulligans.needle.slots;
      expect(s[0]).toBeNull(); // unknown modifier dropped
      expect(s[1]!.level).toBeLessThanOrEqual(14); // clamped to epic ceiling
      expect(Number.isInteger(r.data.mulligans.needle.visualSeed)).toBe(true);
      expect(r.data.mulliganDex).toEqual({ bone_spike: 'rare' }); // unknown id + bad rarity dropped
    }
  });
});

describe('golden-safety: the towerProgress fold is identity when empty', () => {
  it('a fresh save folds no Mulligan effect (sim byte-identical)', () => {
    const d = defaultSave();
    expect(towerProgress(d)).toEqual(towerProgress(d, false)); // empty organisms ⇒ no delta
  });
  it('a fresh account attributes exactly 1 to the Mulligan Power bucket', () => {
    expect(accountPowerParts(defaultSave()).mulligans).toBe(1);
  });
});

describe('active Mulligan folds into the tower + its own Power bucket', () => {
  it('a full offensive Mulligan raises the tower damage AND the mulligans bucket (not towers)', () => {
    const save: SaveData = { ...defaultSave(), mulligans: { ...defaultSave().mulligans, needle: assembleMulligan(['siege_carapace', 'crystalline_core', 'bone_spike'], 'epic', 5, 'needle') } };
    const tpFull = towerProgress(save); // sim path (includes Mulligan)
    const tpExcl = towerProgress(save, false); // power towers-bucket path (excludes Mulligan)
    expect(tpFull.needle.damageMult).toBeGreaterThan(tpExcl.needle.damageMult); // folds into the sim
    expect(tpFull.needle.projectileMutators).toContain('pierce1'); // bone_spike capability
    const parts = accountPowerParts(save);
    expect(parts.mulligans).toBeGreaterThan(1); // credited to its OWN bucket
    // towers bucket is Mulligan-excluded ⇒ unchanged from a fresh account (no double count)
    expect(parts.towers).toBeCloseTo(accountPowerParts(defaultSave()).towers, 9);
  });
});

describe('meta pipeline — discover → equip → upgrade → ascend', () => {
  it('activates only at three slots, spends Gene Overflow, and gates ascension on max level', () => {
    meta.reset();
    expect(meta.get().geneOverflow).toBe(0);
    // cannot equip an undiscovered modifier
    expect(meta.equipMulligan('needle', 0, 'siege_carapace')).toBe(false);
    meta.discoverModifier('siege_carapace', 'epic');
    meta.discoverModifier('crystalline_core', 'epic');
    meta.discoverModifier('rapid_synapse', 'epic');
    const before = meta.power().score;
    expect(meta.equipMulligan('needle', 0, 'siege_carapace')).toBe(true);
    expect(meta.equipMulligan('needle', 1, 'crystalline_core')).toBe(true);
    expect(meta.mulliganResolved('needle').active).toBe(false); // only two slots
    expect(meta.equipMulligan('needle', 2, 'rapid_synapse')).toBe(true);
    expect(meta.mulliganResolved('needle').active).toBe(true);
    expect(meta.power().score).toBeGreaterThan(before);

    // upgrade needs currency
    expect(meta.upgradeMulligan('needle', 0)).toBe(false);
    meta.grantGeneOverflow(100000);
    const p0 = meta.power().score;
    const spentBefore = meta.get().geneOverflow;
    expect(meta.upgradeMulligan('needle', 0)).toBe(true);
    expect(meta.get().mulligans.needle.slots[0]!.level).toBe(2);
    expect(meta.get().geneOverflow).toBeLessThan(spentBefore); // charged
    expect(meta.power().score).toBeGreaterThan(p0);

    // ascension requires a maxed slot
    expect(meta.ascendMulligan('needle', 0)).toBe(false); // level 2 ≠ epic cap
    // unequip deactivates the organism
    expect(meta.unequipMulligan('needle', 2)).toBe(true);
    expect(meta.mulliganResolved('needle').active).toBe(false);
    meta.reset();
  });
});
