// MOLT VOWS meta pipeline (docs/VOWS.md): arming sinks Genome Cores on the geometric curve
// (never refunded), the board caps at MAX_VOWS, the molt mint honours the wager product and
// clears the oaths, junk save data sanitizes, and the none-armed cycle is a perfect identity.

import { describe, expect, it } from 'vitest';
import { meta } from './meta';
import { defaultSave, parseImport, serializeExport } from '../save/saveStore';
import { defaultPrestige } from '../core/prestige';
import { MAX_VOWS, VOW_COST, vowArmCost, vowYieldProduct } from '../core/vows';

/** Seed an importable save mid-cycle: rich bank, molt-ready cycle, campaign gate met. */
function seed(over: Partial<ReturnType<typeof defaultSave>> = {}): void {
  const s = {
    ...defaultSave(),
    shards: 50_000,
    campaign: { cleared: { standard: 10 }, bestTime: {} },
    prestige: { ...defaultPrestige(), cycleShards: 10_000 },
    ...over,
  };
  const imported = meta.importText(serializeExport(s));
  expect(imported.ok).toBe(true);
}

describe('arming vows — the Core sink', () => {
  it('spends the exact geometric cost, refuses junk/duplicates/poverty, caps at MAX_VOWS', () => {
    seed();
    expect(meta.armVow('not_a_vow')).toBe(false);
    const start = meta.get().shards;
    expect(meta.armVow('vow_flesh')).toBe(true);
    expect(start - meta.get().shards).toBe(vowArmCost(0)); // 1st: base
    expect(meta.armVow('vow_flesh')).toBe(false); // duplicate refuses
    expect(meta.armVow('vow_haste')).toBe(true);
    expect(start - meta.get().shards).toBe(vowArmCost(0) + vowArmCost(1)); // 2nd: ×growth
    expect(meta.armVow('vow_famine')).toBe(true);
    expect(start - meta.get().shards).toBe(vowArmCost(0) + vowArmCost(1) + vowArmCost(2)); // 3rd: ×growth²
    expect(meta.armVow('vow_legion')).toBe(false); // board full
    expect(meta.get().prestige.vows.length).toBe(MAX_VOWS);
    const view = meta.vowsView();
    expect(view.nextCost).toBeNull();
    expect(view.yieldProduct).toBeCloseTo(vowYieldProduct(['vow_flesh', 'vow_haste', 'vow_famine']), 10);
  });

  it('a poor account cannot swear; disarm removes the oath and refunds NOTHING', () => {
    seed({ shards: 100 }); // below VOW_COST.base
    expect(VOW_COST.base).toBeGreaterThan(100);
    expect(meta.armVow('vow_flesh')).toBe(false);
    seed({ shards: 1000 });
    expect(meta.armVow('vow_flesh')).toBe(true);
    const afterArm = meta.get().shards;
    expect(meta.disarmVow('vow_flesh')).toBe(true);
    expect(meta.get().shards).toBe(afterArm); // the oath cost is FORFEIT
    expect(meta.get().prestige.vows).toEqual([]);
    expect(meta.disarmVow('vow_flesh')).toBe(false); // not armed anymore
  });
});

describe('the molt mint honours the wager', () => {
  it('cells = ⌊base × vow product⌋; the oaths clear with the molt; costs stay burnt', () => {
    seed();
    // Baseline (no vows): 1.5·√(10000/100) = 15 cells.
    expect(meta.prestigeView().gain).toBe(15);
    meta.armVow('vow_flesh'); // ×1.35
    meta.armVow('vow_apex'); // ×1.6
    const product = vowYieldProduct(['vow_flesh', 'vow_apex']);
    expect(meta.prestigeView().gain).toBe(Math.floor(15 * product)); // the preview IS the mint
    expect(meta.molt()).toBe(true);
    const after = meta.get();
    expect(after.prestige.lifetimeCells).toBe(Math.floor(15 * product));
    expect(after.prestige.vows).toEqual([]); // settled — the next cycle starts unsworn
    expect(after.prestige.cycleShards).toBe(0); // the engine reset (arm costs were consumed pre-molt, not refunded — any residual shards are the MOLT's own account-level rewards)
    expect(meta.prestigeView().gain).toBe(0); // fresh cycle, no lingering multiplier
  });

  it('the none-armed cycle is a perfect identity (golden invariant at the meta layer)', () => {
    seed();
    expect(meta.vowsView().yieldProduct).toBe(1);
    expect(meta.vowsView().combinedWarp).toBeUndefined();
    expect(meta.prestigeView().gain).toBe(15); // exactly the un-vowed mint
  });
});

describe('save round-trip — sanitize', () => {
  it('junk vow data (unknown ids, dupes, over-cap) coerces to a clean armed set', () => {
    const s = defaultSave() as unknown as Record<string, unknown>;
    (s.prestige as Record<string, unknown>).vows = ['vow_flesh', 'vow_flesh', 'nope', 'vow_haste', 'vow_famine', 'vow_legion', 42];
    const res = parseImport(JSON.stringify({ schemaVersion: 35, data: s }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.prestige.vows).toEqual(['vow_flesh', 'vow_haste', 'vow_famine']); // deduped, real, capped at 3
  });

  it('a pre-vow save deep-fills to an empty board', () => {
    const s = defaultSave() as unknown as { prestige: Record<string, unknown> };
    delete s.prestige.vows;
    const res = parseImport(JSON.stringify({ schemaVersion: 34, data: s }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.prestige.vows).toEqual([]);
  });
});
