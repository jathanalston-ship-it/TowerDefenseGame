// SAVE v55 → v56 (Batch G "the grind") — migration, sanitizer and merge contracts for the four
// additive fields: equipment.discovered (permanent Gear Codex credit), genomeRank.peakPower,
// income (the per-run income ledger) and login.incomeCores. A pre-v56 blob must load with the
// same Collection / Power it had (the codex backfills from the held inventory).

import { describe, expect, it } from 'vitest';
import { CURRENT_VERSION, defaultSave, parseImport, serializeExport } from './saveStore';
import type { SaveData } from './saveStore';
import { mergeSaves } from './merge';
import { ALL_ITEMS, rollItem } from '../core/equipment';
import { Rng } from '../core/rng';

const r = new Rng(5);
const item = (i: number) => rollItem(() => r.next(), ALL_ITEMS[i], 'common', 5, 'Genetic Vault');

/** A v55-shaped blob: the v56 fields simply do not exist yet. */
function v55Blob(over: Record<string, unknown> = {}): string {
  const d = defaultSave() as unknown as Record<string, unknown>;
  const { income: _i, ...rest } = d;
  void _i;
  const data = {
    ...rest,
    equipment: { inventory: [], loadouts: {} },
    genomeRank: { celebrated: 3 },
    login: { last: '', streak: 0, best: 0, lifetime: 0 },
    ...over,
  };
  return JSON.stringify({ schemaVersion: 55, data });
}

describe('v55 → v56 migration', () => {
  it('the schema is v56', () => {
    expect(CURRENT_VERSION).toBe(56);
  });

  it('a pre-v56 save backfills the Gear Codex from the HELD inventory, peak 0, empty income ledger', () => {
    const held = [item(0), item(0), item(4)];
    const res = parseImport(v55Blob({ equipment: { inventory: held, loadouts: {} } }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(new Set(res.data.equipment.discovered)).toEqual(new Set([ALL_ITEMS[0].id, ALL_ITEMS[4].id]));
    expect(res.data.genomeRank).toEqual({ celebrated: 3, peakPower: 0 }); // raised to live on first read
    expect(res.data.income).toEqual({ runs: 0, last: {}, rate: {} });
    expect(res.data.login.incomeCores).toBe(0);
  });

  it('a live v56 record round-trips byte-exactly', () => {
    const s: SaveData = {
      ...defaultSave(),
      equipment: { inventory: [], loadouts: {}, discovered: [ALL_ITEMS[1].id, ALL_ITEMS[2].id] },
      genomeRank: { celebrated: 4, peakPower: 123456.5 },
      income: { runs: 7, last: { cores: 900, 'apex:ravager': 40 }, rate: { cores: 120.5, stage: 0.2 } },
      login: { last: '2026-06-10', streak: 2, best: 2, lifetime: 2, incomeCores: 450 },
    };
    const back = parseImport(serializeExport(s));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.data.equipment.discovered).toEqual(s.equipment.discovered);
    expect(back.data.genomeRank).toEqual(s.genomeRank);
    expect(back.data.income).toEqual(s.income);
    expect(back.data.login).toEqual(s.login);
  });
});

describe('v56 sanitizer', () => {
  it('coerces junk: discovered keeps strings (∪ held defs), peak finite ≥ 0, income numbers ≥ 0', () => {
    const res = parseImport(JSON.stringify({
      schemaVersion: 56,
      data: {
        ...defaultSave(),
        equipment: { inventory: [item(3)], loadouts: {}, discovered: [ALL_ITEMS[1].id, 7, null, '', ALL_ITEMS[1].id] },
        genomeRank: { celebrated: 2, peakPower: -50 },
        income: { runs: -3, last: { cores: 'x', stage: 4, bad: -1 }, rate: 'nope' },
        login: { last: '', streak: 0, best: 0, lifetime: 0, incomeCores: -9 },
      },
    }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(new Set(res.data.equipment.discovered)).toEqual(new Set([ALL_ITEMS[1].id, ALL_ITEMS[3].id]));
    expect(res.data.genomeRank.peakPower).toBe(0);
    expect(res.data.income).toEqual({ runs: 0, last: { stage: 4 }, rate: {} });
    expect(res.data.login.incomeCores).toBe(0);
  });

  it('NaN / Infinity peaks fall back to 0 (never a poisoned rating)', () => {
    for (const peakPower of ['NaN', Number.POSITIVE_INFINITY, {}]) {
      const res = parseImport(JSON.stringify({ schemaVersion: 56, data: { ...defaultSave(), genomeRank: { celebrated: 1, peakPower } } }));
      expect(res.ok && res.data.genomeRank.peakPower).toBe(0);
    }
  });
});

describe('v56 account merge', () => {
  it('discovered = union, peakPower = max — records only, never currencies', () => {
    const a: SaveData = {
      ...defaultSave(),
      stats: { ...defaultSave().stats, playtimeSec: 100 },
      equipment: { inventory: [], loadouts: {}, discovered: [ALL_ITEMS[0].id] },
      genomeRank: { celebrated: 2, peakPower: 900 },
    };
    const b: SaveData = {
      ...defaultSave(),
      stats: { ...defaultSave().stats, playtimeSec: 50 },
      equipment: { inventory: [], loadouts: {}, discovered: [ALL_ITEMS[5].id] },
      genomeRank: { celebrated: 5, peakPower: 4000 },
    };
    const m = mergeSaves(a, b);
    expect(new Set(m.equipment.discovered)).toEqual(new Set([ALL_ITEMS[0].id, ALL_ITEMS[5].id]));
    expect(m.genomeRank.peakPower).toBe(4000);
    expect(m.genomeRank.celebrated).toBe(2); // the watermark stays the primary's (its rewards were paid there)
  });
});

describe('v56 Boss Rush record epoch (docs/BOSS-RUSH.md §epoch)', () => {
  it('a pre-v56 record is archived and the live record restarts; the depth record is kept', () => {
    const res = parseImport(v55Blob({ rushBestBoss: 650, rushBestWave: 35 }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.rushBestBoss).toBe(0);
    expect(res.data.rushLegacyBestBoss).toBe(650);
    expect(res.data.rushBestWave).toBe(35);
  });

  it('runs once: a v56 save keeps its record (and a junk legacy field sanitizes to 0)', () => {
    const fresh = { ...defaultSave(), rushBestBoss: 42, rushLegacyBestBoss: 650 };
    const res = parseImport(serializeExport(fresh));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.rushBestBoss).toBe(42);
    expect(res.data.rushLegacyBestBoss).toBe(650);
    const junk = parseImport(v55Blob({ rushBestBoss: 0, rushLegacyBestBoss: 'x' }));
    expect(junk.ok && junk.data.rushLegacyBestBoss).toBe(0);
  });

  it('merge keeps the higher of each record', () => {
    const a = { ...defaultSave(), rushBestBoss: 12, rushLegacyBestBoss: 650 };
    const b = { ...defaultSave(), rushBestBoss: 30, rushLegacyBestBoss: 0 };
    const m = mergeSaves(a, b);
    expect(m.rushBestBoss).toBe(30);
    expect(m.rushLegacyBestBoss).toBe(650);
  });
});
