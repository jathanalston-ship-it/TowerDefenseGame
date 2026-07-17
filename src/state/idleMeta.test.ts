// IDLE HARVEST meta pipeline (docs/IDLE-HARVEST.md): the collect is ONE atomic persist (wallet
// + lifetime ledger + the re-armed clock together), the accrual anchor is MONOTONE (a rolled-back
// clock can never re-farm a span it already paid), the sanitizer holds-but-bounds forged future
// stamps, node purchases enforce the six-lens gates, and the identity surfaces (codex /
// achievements / Genome Rank / profile) all ride the lifetime ledger.

import { describe, expect, it } from 'vitest';
import { meta, collectionContextOf } from './meta';
import { defaultSave, parseImport, serializeExport } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';
import { IDLE } from '../core/config';
import { idleCapHours } from '../core/idleHarvest';
import { collectionView } from '../core/collection';

const H = 3_600_000;
/** A fixed anchor safely in the real past (the sanitizer keeps past stamps verbatim). */
const T0 = Date.UTC(2026, 0, 10, 12, 0, 0);

function seed(over: Partial<SaveData> = {}, idle: Partial<SaveData['idle']> = {}): void {
  const base = defaultSave();
  const imported = meta.importText(serializeExport({
    ...base, ...over,
    idle: { ...base.idle, lastCollect: T0, ...idle },
  } as SaveData));
  expect(imported.ok).toBe(true);
}

/** Push junk through the real import path (serialize → parse ⇒ sanitize). */
function sanitized(junk: unknown): SaveData {
  const back = parseImport(serializeExport(junk as SaveData));
  if (!back.ok) throw new Error('import refused');
  return back.data;
}

describe('the collect — one atomic settle', () => {
  it('a warming hopper (under the minimum) refuses without persisting', () => {
    seed();
    const before = meta.get();
    expect(meta.collectIdleHarvest(T0 + 60_000)).toBeNull(); // 1 minute < minCollectMinutes
    expect(meta.get()).toBe(before); // not even a persist
  });

  it('a 6-hour absence pays: receipt, wallets, ledger, clock and timeline move TOGETHER', () => {
    seed({}, { nodes: { capacity: 2 } }); // cap 12h — 6h sits under it
    meta.debugSetCampaignStage(6);
    const before = meta.get();
    const now = T0 + 6 * H;
    const r = meta.collectIdleHarvest(now);
    expect(r).not.toBeNull();
    expect(r!.rawHours).toBeCloseTo(6, 5);
    expect(r!.effHours).toBeCloseTo(6, 5); // under the cap ⇒ nothing clipped
    expect(r!.full).toBe(false);
    expect(r!.lines.length).toBeGreaterThan(0);
    expect(r!.value).toBeGreaterThan(0);
    expect(r!.xp).toBeGreaterThan(0);
    const after = meta.get();
    // The ledger advanced as ONE coherent settle.
    expect(after.idle.lastCollect).toBe(now);
    expect(after.idle.harvests).toBe(1);
    expect(after.idle.lifetimeHours).toBeCloseTo(r!.effHours, 5);
    expect(after.idle.bestHours).toBeCloseTo(r!.effHours, 5);
    expect(after.idle.lifetimeValue).toBe(r!.value);
    // Something real landed (every drop lane ultimately moves one of these).
    const moved =
      after.shards !== before.shards || after.geneEssence !== before.geneEssence
      || after.ichor !== before.ichor || after.pendingContainers.length !== before.pendingContainers.length
      || after.mats.mutagen !== before.mats.mutagen || after.mats.scrap !== before.mats.scrap
      || after.mats.catalyst !== before.mats.catalyst
      || JSON.stringify(after.towerShards) !== JSON.stringify(before.towerShards)
      || JSON.stringify(after.heroShards) !== JSON.stringify(before.heroShards);
    expect(moved).toBe(true);
    expect(after.accountXp.xp).toBeGreaterThan(before.accountXp.xp);
    expect(after.timeline.some((t) => t.label.includes('Hive Production'))).toBe(true);
    expect(after.achievements).toContain('idle_first');
  });

  it('an immediate second collect refuses and moves nothing (no double settle)', () => {
    seed();
    expect(meta.collectIdleHarvest(T0 + 6 * H)).not.toBeNull();
    const before = meta.get();
    expect(meta.collectIdleHarvest(T0 + 6 * H)).toBeNull();
    expect(meta.get()).toBe(before);
  });

  it('a brimmed hopper clips to the cap and flags full (no infinite bank)', () => {
    seed();
    const r = meta.collectIdleHarvest(T0 + 500 * H)!;
    expect(r.full).toBe(true);
    expect(r.effHours).toBe(IDLE.capHoursLadder[0]);
    expect(meta.get().idle.lifetimeHours).toBeCloseTo(IDLE.capHoursLadder[0], 5);
  });

  it('the receipt closes on a live suggestion (the ceremony grow-next hook)', () => {
    seed();
    meta.debugAddShards(10_000);
    const r = meta.collectIdleHarvest(T0 + 6 * H)!;
    expect(r.suggestion).not.toBeNull();
  });
});

describe('the anchor is monotone — clock tamper never double-pays', () => {
  it('a rolled-back clock pays nothing and does NOT rewind the anchor', () => {
    seed();
    const t1 = T0 + 6 * H;
    expect(meta.collectIdleHarvest(t1)).not.toBeNull();
    // The clock rolls back two hours: refuse, and the anchor must NOT move.
    expect(meta.collectIdleHarvest(t1 - 2 * H)).toBeNull();
    expect(meta.get().idle.lastCollect).toBe(t1);
    // Real time resumes: only the genuinely NEW hour pays (never the rolled-over span again).
    const r = meta.collectIdleHarvest(t1 + 1 * H)!;
    expect(r.rawHours).toBeCloseTo(1, 5);
  });

  it('an absurdly future anchor clamps to the bounded freeze window (no multi-year brick)', () => {
    seed();
    const t1 = T0 + 6 * H;
    expect(meta.collectIdleHarvest(t1)).not.toBeNull();
    // The device clock is discovered to be ~30 days slow (anchor now far in the "future").
    const rolledBack = t1 - 30 * 24 * H;
    expect(meta.collectIdleHarvest(rolledBack)).toBeNull();
    expect(meta.get().idle.lastCollect).toBe(rolledBack + IDLE.tamperFreezeMaxHours * H);
  });

  it('the sanitizer HOLDS a future stamp but bounds the freeze (reload cannot reopen the farm loop)', () => {
    const now = Date.now();
    const forged = { ...defaultSave(), idle: { ...defaultSave().idle, lastCollect: now + 365 * 24 * H } };
    const s = sanitized(forged);
    expect(s.idle.lastCollect).toBeGreaterThan(now); // held — a forged clock banks nothing
    expect(s.idle.lastCollect).toBeLessThanOrEqual(now + IDLE.tamperFreezeMaxHours * H + 60_000);
  });

  it('the sanitizer seeds junk anchors to NOW (no retroactive epoch-sized grant) and scrubs node levels', () => {
    const now = Date.now();
    for (const junk of [0, -5, NaN, 'yesterday'] as unknown[]) {
      const s = sanitized({ ...defaultSave(), idle: { ...defaultSave().idle, lastCollect: junk } });
      expect(Math.abs(s.idle.lastCollect - now)).toBeLessThan(60_000);
    }
    const s = sanitized({
      ...defaultSave(),
      idle: { ...defaultSave().idle, nodes: { speed: 3.9, capacity: -2, junk: NaN }, lifetimeHours: -4, harvests: 2.7 },
    });
    expect(s.idle.nodes).toEqual({ speed: 3 });
    expect(s.idle.lifetimeHours).toBe(0);
    expect(s.idle.harvests).toBe(2);
  });

  it('the lifetime ledger round-trips export → import intact', () => {
    seed();
    meta.collectIdleHarvest(T0 + 6 * H);
    const before = meta.get().idle;
    const back = sanitized(meta.get());
    expect(back.idle.harvests).toBe(before.harvests);
    expect(back.idle.lifetimeHours).toBeCloseTo(before.lifetimeHours, 9);
    expect(back.idle.bestHours).toBeCloseTo(before.bestHours, 9);
    expect(back.idle.lifetimeValue).toBe(before.lifetimeValue);
  });
});

describe('the evolution tree — guarded, gated, geometric', () => {
  it('an ungated node buys: Chitin spends (Cores untouched), the level lands, the price climbs', () => {
    seed({ hiveMaterials: 200 }); // §localized (docs/ECONOMY.md): organs are priced in Chitin
    const chitin = meta.get().hiveMaterials;
    const cores = meta.get().shards;
    const view = meta.idleView(T0 + 60_000);
    const speed = view.nodes.find((n) => n.def.id === 'speed')!;
    expect(speed.gate).toBeNull();
    expect(speed.cost).toBe(60);
    expect(meta.buyIdleNode('speed')).toBe(true);
    expect(meta.get().hiveMaterials).toBe(chitin - 60);
    expect(meta.get().shards).toBe(cores); // the account wallet never funds organs anymore
    expect(meta.get().idle.nodes.speed).toBe(1);
    expect(meta.idleView(T0 + 60_000).nodes.find((n) => n.def.id === 'speed')!.cost).toBe(81); // 60 × 1.35
  });

  it('a progression gate refuses the buy even with the Chitin in hand', () => {
    seed({ hiveMaterials: 100_000 }); // fresh account: stage 0 — the containers node wants Campaign Stage 10 at L1
    expect(meta.buyIdleNode('containers')).toBe(false);
    expect(meta.get().idle.nodes.containers).toBeUndefined();
    meta.debugSetCampaignStage(10);
    expect(meta.buyIdleNode('containers')).toBe(true);
    expect(meta.get().idle.nodes.containers).toBe(1);
  });

  it('poverty refuses cleanly (nothing spent, nothing granted) — and Cores cannot substitute', () => {
    seed();
    meta.debugAddShards(100_000); // a rich account wallet must NOT buy organs (§localized)
    const before = meta.get();
    expect(before.hiveMaterials).toBeLessThan(60);
    expect(meta.buyIdleNode('speed')).toBe(false);
    expect(meta.get()).toBe(before);
  });

  it('capacity levels widen the live cap the view reports', () => {
    seed({}, { nodes: { capacity: 3 } });
    const v = meta.idleView(T0 + 60_000);
    expect(v.accrual.capHours).toBe(idleCapHours({ capacity: 3 }));
    expect(v.accrual.capHours).toBe(IDLE.capHoursLadder[3]);
  });
});

describe('identity surfaces ride the lifetime ledger', () => {
  it('harvests advance the Idle codex, the Genome snapshot, and the achievements ladder', () => {
    seed({}, { lifetimeHours: 23, harvests: 9, bestHours: 6, blooms: 0 });
    meta.debugSetCampaignStage(6);
    const before = collectionView(collectionContextOf(meta.get())).categories.find((c) => c.id === 'idle')!;
    expect(before.discovered).toBeGreaterThan(0); // 1 + 10-harvest rows pending; 1-harvest row discovered
    meta.collectIdleHarvest(T0 + 8 * H); // harvest #10 crosses 24 lifetime hours too
    const after = collectionView(collectionContextOf(meta.get())).categories.find((c) => c.id === 'idle')!;
    expect(after.discovered).toBeGreaterThan(before.discovered);
    expect(meta.get().achievements).toContain('idle_hours24');
    expect(meta.genomeSnapshot().idleLifetimeHours).toBeCloseTo(meta.get().idle.lifetimeHours, 9);
  });

  it('a fresh account reads zero everywhere (golden-safe: no idle Power, no idle bonuses)', () => {
    seed({}, { lastCollect: 0 }); // sanitizer seeds to load-time now
    const cat = collectionView(collectionContextOf(meta.get())).categories.find((c) => c.id === 'idle')!;
    expect(cat.discovered).toBe(0);
    expect(cat.completion).toBe(0);
    expect(cat.bonuses).toEqual([]); // identity-only: the harvest itself is the payout
    expect(meta.genomeSnapshot().idleLifetimeHours).toBe(0);
  });
});
