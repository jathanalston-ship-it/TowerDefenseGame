// THE FRONT (docs/INFESTATION.md §front) — the war layer's laws: tier spoils are exactly-once
// per sector ledger (a fallen-and-reclimbed sector never pays twice), tribute is once per ISO
// week scaled by held tiers, incursions rotate deterministically and bite at most ONCE per
// return, the hotspot is day-deterministic, deploy warps stay inside the flavor band, and
// entrenchment opens exactly one extra expedition road.

import { describe, expect, it } from 'vitest';
import { meta } from './meta';
import { defaultSave, serializeExport } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';
import {
  ALL_SECTORS, INCURSION_BITE, REGIONS, REGION_WARPS, SECTOR_CAP,
  deployWarp, effectiveLevel, hotspotSectorId, incursionSectorId, regionHeldTiers,
  resolveIncursionBite, tierReward, tributeFor,
} from '../core/infestation';
import { EXPEDITION_SLOTS, expeditionSlotsFor } from '../core/expeditions';
import { weekKey } from '../core/accountLevel';

const NOW = Date.now();
const sector = (level: number) => ({ level, updatedAt: NOW - 60_000 });

function seed(infestation: Partial<SaveData['infestation']>): void {
  const base = defaultSave();
  const imported = meta.importText(serializeExport({
    ...base,
    infestation: { ...base.infestation, ...infestation },
  } as SaveData));
  expect(imported.ok).toBe(true);
}

describe('tier spoils — exactly-once per sector ledger', () => {
  it('claims every pending tier at once, pays the region wallet, and never pays twice', () => {
    seed({ sectors: { fringe_meadow: sector(75) } }); // Stronghold (tier 3)
    const chitin0 = meta.get().hiveMaterials;
    expect(meta.claimFrontTier('fringe_meadow')).toBe(true);
    // Colony (40) + Stronghold (90) Chitin — the Fringe pays the Hive wallet.
    expect(meta.get().hiveMaterials).toBe(chitin0 + 40 + 90);
    expect(meta.get().infestation.tierClaims.fringe_meadow).toBe(3);
    expect(meta.claimFrontTier('fringe_meadow')).toBe(false); // nothing pending
  });

  it('a sector that fell below a claimed tier does not re-pay on the way back up', () => {
    seed({ sectors: { fields_granary: sector(40) }, tierClaims: { fields_granary: 3 } });
    // Live tier is Colony (2) but Stronghold (3) was already claimed — nothing pending.
    expect(meta.claimFrontTier('fields_granary')).toBe(false);
  });

  it('saturated claims add the rare-container bonus', () => {
    const rewards = tierReward('reach', 4);
    expect(rewards.some((r) => r.kind === 'container' && r.rarity === 'rare')).toBe(true);
  });
});

describe('weekly tribute — held tiers pay once per ISO week', () => {
  it('pays scaled by held tiers and stamps the week', () => {
    // Four Fringe sectors at Saturated = 16 held tiers ⇒ the full 60-Chitin tribute.
    const sectors = Object.fromEntries(REGIONS[0].sectors.map((s) => [s.id, sector(SECTOR_CAP)]));
    seed({ sectors });
    const chitin0 = meta.get().hiveMaterials;
    expect(meta.claimFrontTribute('fringe')).toBe(true);
    expect(meta.get().hiveMaterials).toBe(chitin0 + 60);
    expect(meta.get().infestation.tributeWeeks.fringe).toBe(weekKey(Date.now()));
    expect(meta.claimFrontTribute('fringe')).toBe(false); // same week — refused
  });

  it('refuses when nothing meaningful is held, and drops zero rows at low holds', () => {
    seed({ sectors: { fringe_meadow: sector(2) } }); // Foothold — 1 held tier < minimum
    expect(meta.claimFrontTribute('fringe')).toBe(false);
    expect(tributeFor('reach', 1)).toEqual([]); // 2 × 1/16 rounds to 0 ⇒ row dropped
    expect(tributeFor('fields', 16)).toEqual([{ kind: 'cores', qty: 120 }]);
  });
});

describe('incursions — deterministic pressure, bounded bite', () => {
  const held = { reach_spine: sector(80), basin_cortex: sector(50) };

  it('targets nothing on an empty board, a held sector otherwise — same all day', () => {
    expect(incursionSectorId('2026-07-18', {}, NOW)).toBeNull();
    const a = incursionSectorId('2026-07-18', held, NOW);
    expect(a === 'reach_spine' || a === 'basin_cortex').toBe(true);
    expect(incursionSectorId('2026-07-18', held, NOW)).toBe(a); // deterministic per day
  });

  it('bites an undefended target, spares a defended one', () => {
    const day = '2026-07-17';
    const target = incursionSectorId(day, held, NOW)!;
    const before = effectiveLevel(held[target as keyof typeof held], NOW);
    const bitten = resolveIncursionBite(held, day, {}, NOW);
    expect(bitten.bitten).toBe(target);
    expect(effectiveLevel(bitten.sectors[target], NOW)).toBeCloseTo(before - INCURSION_BITE, 5);
    const defended = resolveIncursionBite(held, day, { [day]: target }, NOW);
    expect(defended.bitten).toBeNull();
  });

  it('pollFront resolves at most yesterday — one bite per return, then idempotent', () => {
    seed({ sectors: held, lastIncursionDay: '' }); // a long absence: many undefended days behind
    meta.pollFront(NOW);
    const afterFirst = meta.get().infestation;
    const yesterday = new Date(NOW - 86_400_000).toISOString().slice(0, 10);
    expect(afterFirst.lastIncursionDay).toBe(yesterday);
    const levels = { ...afterFirst.sectors };
    meta.pollFront(NOW); // same day again — cursor holds, nothing more bites
    expect(meta.get().infestation.sectors).toEqual(levels);
  });
});

describe('hotspot + deploy flavor', () => {
  it('the hotspot is deterministic per day and a real sector', () => {
    const a = hotspotSectorId('2026-07-18');
    expect(hotspotSectorId('2026-07-18')).toBe(a);
    expect(ALL_SECTORS.some((x) => x.id === a)).toBe(true);
    expect(hotspotSectorId('2026-07-19')).not.toBe(hotspotSectorId('2026-07-21')); // rotates (distinct hashes)
  });

  it('every region has a deploy warp inside the flavor band [0.9, 1.2]', () => {
    for (const r of REGIONS) {
      const w = REGION_WARPS[r.id];
      expect(w).toBeTruthy();
      for (const v of Object.values(w.warp)) {
        expect(v).toBeGreaterThanOrEqual(0.9);
        expect(v).toBeLessThanOrEqual(1.2);
      }
    }
    expect(deployWarp('fringe_meadow')).toBe(REGION_WARPS.fringe.warp);
    expect(deployWarp('junk')).toBeUndefined();
  });
});

describe('entrenchment perk — held territory opens roads', () => {
  it('grants exactly one bonus expedition slot while any region is entrenched', () => {
    expect(expeditionSlotsFor(0)).toBe(EXPEDITION_SLOTS);
    expect(expeditionSlotsFor(1)).toBe(EXPEDITION_SLOTS + 1);
    expect(expeditionSlotsFor(4)).toBe(EXPEDITION_SLOTS + 1); // capped — felt, not stacked
  });

  it('regionHeldTiers counts live tiers', () => {
    const sectors = { fringe_meadow: sector(SECTOR_CAP), fringe_mire: sector(40) };
    expect(regionHeldTiers(REGIONS[0], sectors, NOW)).toBe(4 + 2);
  });
});
