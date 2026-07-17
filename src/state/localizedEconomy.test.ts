// LOCALIZED ECONOMY (docs/ECONOMY.md §localized) — the v48 currency-swap contracts:
// seeded migration (no invested build stalls), the guaranteed Chitin hopper lane (value
// SHIFTED, never added), expedition value-swaps at exact old totals, and the reveal
// pipeline rendering the new currency ids. Pace parity is scripts/sim-localized-economy.ts.

import { describe, expect, it } from 'vitest';
import { defaultSave, parseImport, serializeExport } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';
import { IDLE } from '../core/config';
import { eligibleIdleDrops, idleAccrual, idleGrantValue, rollIdleHarvest } from '../core/idleHarvest';
import type { IdleGateContext } from '../core/idleHarvest';
import { EXPEDITION_DEFS, RARE_FINDS, scaleReward, sumRewards } from '../core/expeditions';
import { describePull } from './vaultReveal';
import type { RewardItem } from './lootbox';

/** Round-trip junk through the real import path (serialize → parse ⇒ sanitize + seed). */
function sanitized(junk: unknown): SaveData {
  const back = parseImport(serializeExport(junk as SaveData));
  if (!back.ok) throw new Error('import refused');
  return back.data;
}

const ctx = (stage: number, rank = 1): IdleGateContext =>
  ({ stage, genomeRankIndex: rank, molts: 0, rushBest: 0, collectionCompletion: 0, power: 0 });

describe('v48 migration seeds — an invested build never stalls', () => {
  it('a pre-v48 save with organ levels seeds a working Chitin balance (60 + 20/level)', () => {
    const legacy = { ...defaultSave(), idle: { ...defaultSave().idle, nodes: { speed: 3, capacity: 2 } } } as Record<string, unknown>;
    delete legacy.hiveMaterials; // the field does not exist pre-v48
    expect(sanitized(legacy).hiveMaterials).toBe(60 + 20 * 5);
  });

  it('a pre-v48 save with graft levels seeds Mulligan Tissue (25 + 8/level)', () => {
    const base = defaultSave();
    const legacy = {
      ...base,
      mulligans: {
        ...base.mulligans,
        needle: { slots: [{ id: 'siege_carapace', rarity: 'epic', level: 2 }, { id: 'crystalline_core', rarity: 'epic', level: 3 }, null] },
      },
    } as Record<string, unknown>;
    delete legacy.mulliganTissue;
    expect(sanitized(legacy).mulliganTissue).toBe(25 + 8 * 5);
  });

  it('untouched systems — and fresh accounts — seed exactly 0 (golden-safe)', () => {
    const legacy = { ...defaultSave() } as Record<string, unknown>;
    delete legacy.hiveMaterials;
    delete legacy.mulliganTissue;
    const back = sanitized(legacy);
    expect(back.hiveMaterials).toBe(0);
    expect(back.mulliganTissue).toBe(0);
  });

  it('present balances sanitize instead of re-seeding (negative → 0, floats floor)', () => {
    const back = sanitized({ ...defaultSave(), hiveMaterials: -20, mulliganTissue: 41.9, idle: { ...defaultSave().idle, nodes: { speed: 9 } } });
    expect(back.hiveMaterials).toBe(0); // NOT the investment seed — the field exists
    expect(back.mulliganTissue).toBe(41);
  });
});

describe('the Chitin hopper lane — guaranteed, deterministic, value-SHIFTED', () => {
  const nodes = {};
  const acc = idleAccrual(8 * 3_600_000, 20, nodes, 1);

  it('every harvest pays exactly the top-slice share as Chitin', () => {
    const roll = rollIdleHarvest(acc, nodes, ctx(20), () => 0.99); // 0.99 ⇒ no bloom
    const chitin = roll.lines.filter((l) => l.grant.kind === 'hiveMats');
    expect(chitin).toHaveLength(1);
    const qty = (chitin[0].grant as { kind: 'hiveMats'; qty: number }).qty;
    expect(qty).toBe(Math.round((acc.budget * IDLE.hiveMatsShare) / IDLE.valuePerUnit.hiveMats));
    expect(qty).toBeGreaterThan(0);
  });

  it('the harvest total stays inside the budget — the slice came OUT of it, not on top', () => {
    const roll = rollIdleHarvest(acc, nodes, ctx(20), () => 0.99);
    const total = roll.lines.reduce((s, l) => s + idleGrantValue(l.grant), 0);
    // Fixed-price rows (containers/caches) can round a slice up, so allow the same modest
    // headroom the guardrail uses — the point is the chitin lane did not ADD ~30% on top.
    expect(total).toBeLessThanOrEqual(roll.budget * 1.15);
  });

  it('the Mulligan Tissue trickle row gates exactly like the modifier drop (stage 12 · rank 3)', () => {
    expect(eligibleIdleDrops(ctx(11, 3)).some((d) => d.id === 'tissue')).toBe(false);
    expect(eligibleIdleDrops(ctx(12, 2)).some((d) => d.id === 'tissue')).toBe(false);
    expect(eligibleIdleDrops(ctx(12, 3)).some((d) => d.id === 'tissue')).toBe(true);
  });
});

describe('expedition Chitin lanes — value swapped from cores at 1:1, never added', () => {
  it('the three scavenge roads pay their exact pre-swap totals', () => {
    const OLD_TOTAL: Record<string, number> = { exp_patrol: 30, exp_harvest: 110, exp_graveyard: 340 };
    for (const [id, total] of Object.entries(OLD_TOTAL)) {
      const d = EXPEDITION_DEFS.find((x) => x.id === id)!;
      expect(d.reward.cores + (d.reward.chitin ?? 0)).toBe(total);
      expect(d.reward.chitin ?? 0).toBeGreaterThan(0);
    }
  });

  it('scaleReward and sumRewards carry the chitin lane', () => {
    const d = EXPEDITION_DEFS.find((x) => x.id === 'exp_patrol')!;
    const scaled = scaleReward(d.reward, 2);
    expect(scaled.chitin).toBe(d.reward.chitin! * 2);
    const lode = RARE_FINDS.find((f) => f.id === 'find_chitin_lode')!;
    expect(sumRewards(scaled, lode.reward).chitin).toBe(d.reward.chitin! * 2 + 150);
  });
});

describe('the reveal pipeline renders the new wallets', () => {
  it('a Mulligan-Tissue event pull rides the generic currency branch (icon + name)', () => {
    const pull = describePull({ type: 'event', rarity: 'rare', currency: 'mulliganTissue', amount: 90, note: 'Duplicate Dissolved — Bone Spike (Rare)' } as RewardItem);
    expect(pull.currency).toBe('mulliganTissue');
    expect(pull.amountLabel).toBe('+90 Mulligan Tissue');
    expect(pull.name).toContain('Duplicate Dissolved');
  });

  it('an unknown currency string still degrades to a glyph (the extension contract)', () => {
    const pull = describePull({ type: 'event', rarity: 'common', currency: 'someFutureWallet', amount: 5 } as unknown as RewardItem);
    expect(pull.currency).toBeUndefined();
    expect(pull.glyph).toBe('✦');
  });
});
