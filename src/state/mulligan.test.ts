// Mulligan save + meta integration (docs/MULLIGANS.md): the v26 schema defaults + migration +
// sanitization, the GOLDEN-SAFETY of the towerProgress fold (empty ⇒ identity), the separately-scored
// Power bucket, and the full equip/upgrade/ascend/discover pipeline through the meta store.

import { describe, it, expect } from 'vitest';
import { defaultSave, parseImport } from '../save/saveStore';
import { accountPowerParts, meta, towerProgress } from './meta';
import { assembleMulligan } from '../core/mulligan';
import type { SaveData } from '../save/saveStore';

describe('save schema v26', () => {
  it('defaults: every tower owns an empty Mulligan; dex empty; no separate Mulligan wallet', () => {
    const d = defaultSave();
    expect('geneOverflow' in d).toBe(false); // unified: upgrades spend geneEssence
    expect(d.mulliganDex).toEqual({});
    expect(d.mulligans.needle.slots).toEqual([null, null, null]);
  });

  it('migrates a pre-v26 save (no Mulligan fields) to empty organisms', () => {
    const legacy = { ...defaultSave() } as Record<string, unknown>;
    delete legacy.mulligans;
    delete legacy.mulliganDex;
    const r = parseImport(JSON.stringify(legacy));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.mulligans.mortar.slots).toEqual([null, null, null]);
      expect(r.data.mulliganDex).toEqual({});
    }
  });

  it('unification migration: a legacy geneOverflow balance folds 1:1 into geneEssence (nothing lost)', () => {
    const legacy = { ...defaultSave(), geneEssence: 120 } as Record<string, unknown>;
    legacy.geneOverflow = 380; // the retired Mulligan wallet
    const r = parseImport(JSON.stringify(legacy));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.geneEssence).toBe(500); // 120 + 380 — the banked Overflow became Essence
      expect('geneOverflow' in r.data).toBe(false); // the old wallet is gone
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
  it('activates only at three slots, spends Gene Essence, and gates ascension on max level', () => {
    meta.reset();
    expect(meta.get().geneEssence).toBe(0);
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

    // upgrade needs currency — the UNIFIED Gene Essence wallet (shared with Gene Card levels)
    expect(meta.upgradeMulligan('needle', 0)).toBe(false);
    meta.grantGeneEssence(100000);
    const p0 = meta.power().score;
    const spentBefore = meta.get().geneEssence;
    expect(meta.upgradeMulligan('needle', 0)).toBe(true);
    expect(meta.get().mulligans.needle.slots[0]!.level).toBe(2);
    expect(meta.get().geneEssence).toBeLessThan(spentBefore); // charged
    expect(meta.power().score).toBeGreaterThan(p0);

    // ascension requires a maxed slot
    expect(meta.ascendMulligan('needle', 0)).toBe(false); // level 2 ≠ epic cap
    // unequip deactivates the organism
    expect(meta.unequipMulligan('needle', 2)).toBe(true);
    expect(meta.mulliganResolved('needle').active).toBe(false);
    meta.reset();
  });
});

// ── Reconciliation surfaces (docs/MULLIGANS.md §daily/§collection/§inspect) ──

import { TOWER_ORDER } from '../core/config';
import { TUTORIAL_MULLIGAN_IDS, dailyMulliganAssignment, isMulliganActive, mulliganRegistry, resolveMulligan } from '../core/mulligan';
import { collectionView } from '../core/collection';
import { collectionContextOf } from './meta';
import { checkAchievements } from './achievements';

describe('the Daily assignment (docs/MULLIGANS.md §daily)', () => {
  it('is deterministic per seed, ACTIVE on every kind, and dex-drawn', () => {
    const dex = { bone_spike: 'legendary', green_vein: 'rare', rapid_synapse: 'common' } as const;
    const a = dailyMulliganAssignment(1234, TOWER_ORDER, { ...dex });
    const b = dailyMulliganAssignment(1234, TOWER_ORDER, { ...dex });
    expect(a).toEqual(b); // same day ⇒ identical organisms
    expect(a.tutorial).toBe(false);
    for (const k of TOWER_ORDER) {
      const st = a.byKind[k]!;
      expect(isMulliganActive(st)).toBe(true); // dailies always field awake organisms
      for (const slot of st.slots) {
        expect(slot).not.toBeNull();
        expect(Object.keys(dex)).toContain(slot!.id); // drawn ONLY from the player's dex
        expect(slot!.rarity).toBe(dex[slot!.id as keyof typeof dex]); // at the discovered rarity
        expect(slot!.level).toBe(1);
      }
    }
    expect(dailyMulliganAssignment(4321, TOWER_ORDER, { ...dex })).not.toEqual(a); // a new day reshuffles
  });

  it('an empty dex borrows the loaner tutorial trio', () => {
    const a = dailyMulliganAssignment(99, TOWER_ORDER, {});
    expect(a.tutorial).toBe(true);
    for (const k of TOWER_ORDER) {
      for (const slot of a.byKind[k]!.slots) expect([...TUTORIAL_MULLIGAN_IDS]).toContain(slot!.id);
    }
  });

  it('the towerProgress override substitutes the account organisms for the fold only', () => {
    const save = defaultSave();
    save.mulligans.needle = assembleMulligan(['bone_spike', 'bone_spike', 'bone_spike'], 'legendary', 5, 'needle');
    const own = towerProgress(save);
    expect(own.needle.damageMult).toBeGreaterThan(1); // the account's own graft
    const override = dailyMulliganAssignment(7, ['needle'], { rapid_synapse: 'common' }).byKind;
    const daily = towerProgress(save, true, override);
    const expected = resolveMulligan(override.needle);
    expect(daily.needle.fireRateMult).toBeCloseTo(expected.fireRateMult, 9); // the day's organism
    expect(daily.needle.damageMult).toBeLessThan(own.needle.damageMult); // the bone stack is benched
    expect(towerProgress(save).needle.damageMult).toBe(own.needle.damageMult); // the save untouched
  });
});

describe('the Modifier codex (docs/MULLIGANS.md §collection)', () => {
  it('tiers Unsequenced → Discovered → Transcendent off the dex', () => {
    const save = defaultSave();
    save.mulliganDex = { bone_spike: 'rare', rapid_synapse: 'legendary' };
    const cat = collectionView(collectionContextOf(save)).categories.find((c) => c.id === 'mulligans')!;
    expect(cat.total).toBe(mulliganRegistry.size);
    expect(cat.discovered).toBe(2);
    expect(cat.entries.find((e) => e.id === 'bone_spike')!.tier).toBe(1);
    expect(cat.entries.find((e) => e.id === 'rapid_synapse')!.tier).toBe(2); // legendary+ = Transcendent
    expect(cat.entries.find((e) => e.id === 'green_vein')!.tierLabel).toBe('Unsequenced');
  });
});

describe('the achievement ladder additions', () => {
  it('reads dex completion, level caps, ascendant slots, and organism Power', () => {
    const save = defaultSave();
    const fresh = new Set(checkAchievements({ save }).map((a) => a.id));
    for (const id of ['mulligan_dex', 'mulligan_perfected', 'mulligan_ascendant', 'mulligan_overlord']) {
      expect(fresh.has(id)).toBe(false);
    }
    save.mulliganDex = Object.fromEntries(mulliganRegistry.ids().map((id) => [id, 'common' as const]));
    for (const k of TOWER_ORDER) save.mulligans[k] = assembleMulligan(['bone_spike', 'green_vein', 'rapid_synapse'], 'ascendant', 20, k);
    const ids = new Set(checkAchievements({ save }).map((a) => a.id));
    for (const id of ['mulligan_dex', 'mulligan_perfected', 'mulligan_ascendant', 'mulligan_overlord']) {
      expect(ids.has(id)).toBe(true);
    }
  });
});
