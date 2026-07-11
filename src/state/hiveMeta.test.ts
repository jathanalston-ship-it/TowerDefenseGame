// HIVE CONSTRUCTION meta pipeline (docs/HIVE-CONSTRUCTION.md): era gating refuses early
// builds, the spend is ATOMIC across every charged currency (incl. richest-first per-kind
// drains), the built ledger round-trips through the sanitizer, and built organs derive
// their fixture layers into the lab.

import { describe, expect, it } from 'vitest';
import { meta } from './meta';
import { defaultSave, parseImport, serializeExport } from '../save/saveStore';
import { hiveCost, hiveOrganById } from '../core/hiveOrgans';
import { labEra, labScore, unlockedFixtures } from '../ui/homeBaseTiers';
import { TOWER_ORDER } from '../core/config';
import { sumValues } from '../core/math';

/** Seed an importable save with a rich mixed wallet (era 0 unless overridden). */
function seed(over: Partial<ReturnType<typeof defaultSave>> = {}): void {
  const s = {
    ...defaultSave(),
    shards: 50_000,
    geneEssence: 5_000,
    mats: { mutagen: 200, scrap: 200, catalyst: 100 },
    ...over,
  };
  const imported = meta.importText(serializeExport(s));
  expect(imported.ok).toBe(true);
}

describe('era gating — construction unlocks WITHIN reached eras', () => {
  it('a fresh account (era 0) can build era-0 organs but not era-1+', () => {
    seed();
    expect(labEra(labScore(meta.get()))).toBe(0);
    const view = meta.hiveView();
    expect(view.era).toBe(0);
    expect(view.organs.find((o) => o.def.id === 'lumen_polyps')?.next?.affordable).toBe(true);
    expect(view.organs.find((o) => o.def.id === 'marrow_forge')?.next?.affordable).toBe(false); // era 1 gate
    expect(meta.buildOrgan('marrow_forge')).toBe(false); // refused by the gate, wallet notwithstanding
  });
});

describe('buildOrgan — one atomic multi-currency spend', () => {
  it('charges EVERY recipe line exactly once and records the tier', () => {
    seed();
    const before = meta.get();
    const cost = hiveCost(hiveOrganById('lumen_polyps')!, 1);
    expect(meta.buildOrgan('lumen_polyps')).toBe(true);
    const after = meta.get();
    expect(after.hive.built.lumen_polyps).toBe(1);
    expect(before.shards - after.shards).toBe(cost.find((l) => l.key === 'cores')!.amount);
    expect(before.mats.mutagen - after.mats.mutagen).toBe(cost.find((l) => l.key === 'mutagen')!.amount);
    expect(after.mats.scrap).toBe(before.mats.scrap); // uncharged lanes untouched
    expect(meta.buildOrgan('lumen_polyps')).toBe(false); // maxed (tiers: 1)
  });

  it('refuses when ANY lane is short — nothing is spent (atomicity)', () => {
    seed({ mats: { mutagen: 0, scrap: 200, catalyst: 100 } }); // cores rich, mutagen empty
    const before = meta.get();
    expect(meta.buildOrgan('lumen_polyps')).toBe(false);
    expect(meta.get().shards).toBe(before.shards); // the cores lane was NOT touched
    expect(meta.get().hive.built.lumen_polyps).toBeUndefined();
  });

  it('drains Strain Samples richest-first across the per-kind wallet', () => {
    // marrow_forge needs strain 30 + era 1 → seed a developed account: stars push labScore ≥ 16.
    const s = defaultSave();
    s.shards = 50_000; s.geneEssence = 5_000; s.mats = { mutagen: 200, scrap: 200, catalyst: 100 };
    for (const k of TOWER_ORDER.slice(0, 4)) s.towerStars[k] = 5; // labScore 20 ⇒ era 1
    s.towerShards = { ...s.towerShards, [TOWER_ORDER[0]]: 25, [TOWER_ORDER[1]]: 10, [TOWER_ORDER[2]]: 3 };
    const imported = meta.importText(serializeExport(s));
    expect(imported.ok).toBe(true);
    expect(labEra(labScore(meta.get()))).toBeGreaterThanOrEqual(1);
    const before = meta.get();
    expect(meta.buildOrgan('marrow_forge')).toBe(true);
    const after = meta.get();
    expect(sumValues(before.towerShards) - sumValues(after.towerShards)).toBe(30);
    expect(before.towerShards[TOWER_ORDER[0]] - after.towerShards[TOWER_ORDER[0]]).toBe(25); // richest fully drained
    expect(before.towerShards[TOWER_ORDER[1]] - after.towerShards[TOWER_ORDER[1]]).toBe(5); // remainder from the next
    expect(after.towerShards[TOWER_ORDER[2]]).toBe(3); // smallest stack untouched
  });

  it('tiered organs deepen geometrically and stop at tier 3', () => {
    seed({ geneEssence: 100_000, mats: { mutagen: 999, scrap: 9_999, catalyst: 999 } });
    const t = [1, 2, 3].map((n) => hiveCost(hiveOrganById('spore_garden')!, n).find((l) => l.key === 'essence')!.amount);
    expect(t).toEqual([40, 120, 360]); // ×3 per tier
    const start = meta.get().geneEssence;
    expect(meta.buildOrgan('spore_garden')).toBe(true);
    expect(meta.buildOrgan('spore_garden')).toBe(true);
    expect(meta.buildOrgan('spore_garden')).toBe(true);
    expect(meta.buildOrgan('spore_garden')).toBe(false); // maxed
    expect(start - meta.get().geneEssence).toBe(40 + 120 + 360);
    expect(meta.get().hive.built.spore_garden).toBe(3);
  });
});

describe('save round-trip + fixtures derive', () => {
  it('junk hive data sanitizes (unknown ids dropped, tiers clamped); a pre-v36 save deep-fills', () => {
    const s = defaultSave() as unknown as Record<string, unknown>;
    s.hive = { built: { spore_garden: 99, nonsense: 2, lumen_polyps: '1' } };
    const res = parseImport(JSON.stringify({ schemaVersion: 36, data: s }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.hive.built).toEqual({ spore_garden: 3, lumen_polyps: 1 });
    const old = defaultSave() as unknown as { hive?: unknown };
    delete old.hive;
    const res2 = parseImport(JSON.stringify({ schemaVersion: 35, data: old }));
    expect(res2.ok).toBe(true);
    if (res2.ok) expect(res2.data.hive.built).toEqual({});
  });

  it('built organs layer their fixtures into the lab; an empty ledger changes nothing', () => {
    const s = defaultSave();
    const base = unlockedFixtures(s);
    s.hive = { built: { spore_garden: 2, lumen_polyps: 1 } };
    expect(unlockedFixtures(s)).toEqual([...base, 'hv-spores1', 'hv-spores2', 'hv-polyps']);
  });
});
