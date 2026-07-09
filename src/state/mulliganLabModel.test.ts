// Mulligan Lab read-model (docs/MULLIGANS.md §UI) — the view the equip screen paints. Verifies the
// fresh-account shape, and that after the meta pipeline runs it reflects slots, costs, affordability,
// activation, and the owned (discovered) list.

import { describe, it, expect } from 'vitest';
import { meta } from './meta';
import { mulliganLabView } from './mulliganLabModel';
import { defaultSave } from '../save/saveStore';

describe('mulliganLabView', () => {
  it('a fresh account: 0 essence, nothing discovered, every organism empty + inactive', () => {
    const v = mulliganLabView(defaultSave());
    expect(v.essence).toBe(0);
    expect(v.discovered).toBe(0);
    expect(v.total).toBe(30);
    expect(v.owned).toEqual([]);
    expect(v.towers.every((t) => !t.active && t.power === 1 && t.slots.every((s) => !s.filled))).toBe(true);
    // Dormant organisms carry no identity or package — the showcase copy relies on this.
    expect(v.towers.every((t) => t.filled === 0 && t.dominant === '' && t.packageLines.length === 0)).toBe(true);
  });

  it('reflects the pipeline: discovery → equip (activation) → upgrade cost + affordability', () => {
    meta.reset();
    meta.discoverModifier('siege_carapace', 'epic');
    meta.discoverModifier('crystalline_core', 'rare');
    meta.discoverModifier('bone_spike', 'legendary');
    let v = mulliganLabView(meta.get());
    expect(v.discovered).toBe(3);
    expect(v.owned[0].rarity).toBe('legendary'); // sorted highest-rarity first
    // fill all three slots on the needle → active
    meta.equipMulligan('needle', 0, 'siege_carapace');
    meta.equipMulligan('needle', 1, 'crystalline_core');
    meta.equipMulligan('needle', 2, 'bone_spike');
    v = mulliganLabView(meta.get());
    const needle = v.towers.find((t) => t.kind === 'needle')!;
    expect(needle.active).toBe(true);
    expect(needle.power).toBeGreaterThan(1);
    // An awake organism has an identity + a display-ready package (the showcase reads these).
    expect(needle.filled).toBe(3);
    expect(needle.dominant).not.toBe('');
    expect(needle.packageLines.length).toBeGreaterThan(0);
    const s0 = needle.slots[0];
    expect(s0.filled).toBe(true);
    expect(s0.desc).toBeTruthy();
    expect(s0.nextRarity).toBe('legendary'); // epic slot ascends toward legendary
    expect(s0.upgradeCost).toBeGreaterThan(0);
    expect(s0.canAfford).toBe(false); // 0 essence
    meta.grantGeneEssence(100000);
    expect(mulliganLabView(meta.get()).towers.find((t) => t.kind === 'needle')!.slots[0].canAfford).toBe(true);
    meta.reset();
  });
});
