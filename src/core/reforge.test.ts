// Reforge system invariants (docs/REFORGE.md): the seven operations are pure + deterministic,
// respect per-affix locks and the ilvl tier ceiling, progression is gradual, and drops are
// slot-balanced. Meta-only (Math.random in prod) — nothing here touches the deterministic sim.

import { describe, it, expect } from 'vitest';
import { Rng } from './rng';
import { itemDef, itemScore, maxTierForIlvl as maxTierEquip, rollItemDrop } from './equipment';
import type { EquipSlot, OwnedItem } from './equipment';
import {
  canAfford, enhance, itemAffixView, maxTierForIlvl, opAvailable, powerScore, randomizeAffix,
  reforge, reforgeCost, reroll, salvageValue, spend, toggleAffixLock, upgrade,
} from './reforge';

const mk = (seed: number): (() => number) => {
  const r = new Rng(seed);
  return () => r.next();
};
function item(over: Partial<OwnedItem> = {}): OwnedItem {
  return { uid: 'u1', defId: 'w_coil', rarity: 'epic', affixes: [], ...over };
}

describe('maxTierForIlvl — the gradual ceiling', () => {
  it('caps low early, unlocks T6 with depth, and is uncapped for legacy gear', () => {
    expect(maxTierForIlvl(undefined)).toBe(6); // legacy items (no ilvl)
    expect(maxTierForIlvl(1)).toBe(2);
    expect(maxTierForIlvl(9)).toBe(3);
    expect(maxTierForIlvl(33)).toBe(6);
    expect(maxTierForIlvl(200)).toBe(6);
    expect(maxTierForIlvl).toBe(maxTierEquip); // re-exported from equipment (no cycle)
    // monotonic non-decreasing
    for (let l = 2; l <= 80; l++) expect(maxTierForIlvl(l)).toBeGreaterThanOrEqual(maxTierForIlvl(l - 1));
  });
});

describe('enhance — steady +1, capped, lock-aware', () => {
  it('raises the lowest unlocked affix by one tier', () => {
    const it = item({ ilvl: 200, affixes: [{ affixId: 'keen', tier: 2 }, { affixId: 'swift', tier: 4 }] });
    const out = enhance(mk(1), it);
    expect(out.affixes[0].tier).toBe(3); // lowest raised
    expect(out.affixes[1].tier).toBe(4); // untouched
  });
  it('skips locked affixes and never exceeds the ilvl ceiling', () => {
    const locked = item({ ilvl: 200, affixes: [{ affixId: 'keen', tier: 2, locked: true }, { affixId: 'swift', tier: 4 }] });
    expect(enhance(mk(1), locked).affixes[1].tier).toBe(5); // raises the unlocked one
    const capped = item({ ilvl: 1, affixes: [{ affixId: 'keen', tier: 2 }] }); // ilvl1 ceiling = T2
    expect(enhance(mk(1), capped)).toBe(capped); // already at ceiling → no-op (same ref)
  });
});

describe('reroll — keep types, new tiers', () => {
  it('preserves affix ids, rerolls unlocked tiers within the ceiling, keeps locked', () => {
    const it = item({ ilvl: 200, affixes: [{ affixId: 'keen', tier: 3 }, { affixId: 'swift', tier: 5, locked: true }] });
    const out = reroll(mk(7), it);
    expect(out.affixes.map((a) => a.affixId)).toEqual(['keen', 'swift']); // types unchanged
    expect(out.affixes[1].tier).toBe(5); // locked tier kept
    expect(out.affixes[0].tier).toBeGreaterThanOrEqual(1);
    expect(out.affixes[0].tier).toBeLessThanOrEqual(6);
  });
});

describe('reforge — reroll all unlocked TYPES, keep locked', () => {
  it('keeps locked affixes and preserves the rarity affix count', () => {
    const it = item({ rarity: 'epic', ilvl: 200, affixes: [{ affixId: 'keen', tier: 4, locked: true }, { affixId: 'swift', tier: 2 }] });
    const out = reforge(mk(3), it);
    expect(out.affixes.length).toBe(2); // epic = 2 slots
    expect(out.affixes.some((a) => a.affixId === 'keen' && a.locked)).toBe(true); // locked survives
  });
  it('is deterministic in its rng', () => {
    const base = item({ ilvl: 50, affixes: [{ affixId: 'keen', tier: 2 }, { affixId: 'swift', tier: 2 }] });
    expect(reforge(mk(9), base)).toEqual(reforge(mk(9), base));
  });
});

describe('upgrade — rarity +1, bounded at legendary', () => {
  it('adds an affix slot and raises rarity', () => {
    const out = upgrade(mk(2), item({ rarity: 'rare', ilvl: 50, affixes: [{ affixId: 'keen', tier: 2 }] }))!;
    expect(out.rarity).toBe('epic');
    expect(out.affixes.length).toBe(2);
  });
  it('refuses legendary and exotic (already at cap)', () => {
    expect(upgrade(mk(1), item({ rarity: 'legendary' }))).toBeNull();
    expect(upgrade(mk(1), item({ rarity: 'exotic' }))).toBeNull();
  });
});

describe('randomize + lock — targeted per-affix ops', () => {
  it('swaps one affix to a new type and skips locked', () => {
    const it = item({ ilvl: 200, affixes: [{ affixId: 'keen', tier: 3 }, { affixId: 'swift', tier: 3 }] });
    const out = randomizeAffix(mk(4), it, 0);
    expect(out.affixes[0].affixId).not.toBe('keen'); // fresh type (excludes carried)
    expect(out.affixes[1].affixId).toBe('swift');
    const locked = item({ affixes: [{ affixId: 'keen', tier: 3, locked: true }] });
    expect(randomizeAffix(mk(4), locked, 0)).toBe(locked); // locked → no-op
  });
  it('toggles a per-affix lock', () => {
    const it = item({ affixes: [{ affixId: 'keen', tier: 3 }] });
    expect(toggleAffixLock(it, 0).affixes[0].locked).toBe(true);
    expect(toggleAffixLock(toggleAffixLock(it, 0), 0).affixes[0].locked).toBe(false);
  });
});

describe('salvage value — scales with rarity + ilvl (superset of the old formula)', () => {
  it('a common at ilvl 1 yields the historical baseline; exotic/deep yields more', () => {
    expect(salvageValue(item({ rarity: 'common', ilvl: 1 }))).toEqual({ mutagen: 0, scrap: 1, catalyst: 0 });
    const exo = salvageValue(item({ rarity: 'exotic', ilvl: 40 }));
    expect(exo.scrap).toBeGreaterThan(salvageValue(item({ rarity: 'common', ilvl: 1 })).scrap);
    expect(exo.catalyst).toBeGreaterThan(0);
  });
});

describe('itemAffixView — Primary / Prefix / Suffix read-model', () => {
  it('splits the highest-tier affix as primary and classifies the rest', () => {
    const view = itemAffixView(item({ affixes: [
      { affixId: 'keen', tier: 5 },      // prefix (offense), highest → primary
      { affixId: 'volatile', tier: 3 },  // prefix
      { affixId: 'swift', tier: 2 },     // suffix (utility)
    ] }));
    expect(view.primary?.affixId).toBe('keen');
    expect(view.prefixes.map((a) => a.affixId)).toEqual(['volatile']);
    expect(view.suffixes.map((a) => a.affixId)).toEqual(['swift']);
  });
});

describe('costs + availability + power score', () => {
  it('costs rise with rarity; canAfford / spend are consistent', () => {
    const cheap = reforgeCost('reforge', item({ rarity: 'common' }));
    const dear = reforgeCost('reforge', item({ rarity: 'exotic' }));
    expect(dear.mutagen).toBeGreaterThan(cheap.mutagen);
    const wallet = { mutagen: 5, scrap: 5, catalyst: 5 };
    expect(canAfford(wallet, cheap)).toBe(true);
    expect(spend(wallet, cheap).mutagen).toBe(5 - cheap.mutagen);
    expect(canAfford({ mutagen: 0, scrap: 0, catalyst: 0 }, dear)).toBe(false);
  });
  it('opAvailable gates upgrade at cap, enhance at ceiling, salvage on lock', () => {
    expect(opAvailable('upgrade', item({ rarity: 'legendary' }))).toBe(false);
    expect(opAvailable('upgrade', item({ rarity: 'rare' }))).toBe(true);
    expect(opAvailable('enhance', item({ ilvl: 1, affixes: [{ affixId: 'keen', tier: 2 }] }))).toBe(false); // at T2 ceiling
    expect(opAvailable('salvage', item({ locked: true }))).toBe(false);
  });
  it('power score keeps rarity + affixes dominant over ilvl', () => {
    const legendaryLowIlvl = item({ rarity: 'legendary', ilvl: 1, affixes: [{ affixId: 'keen', tier: 3 }] });
    const commonDeep = item({ rarity: 'common', ilvl: 60, affixes: [] });
    expect(itemScore(legendaryLowIlvl)).toBeGreaterThan(itemScore(commonDeep));
    expect(powerScore).toBe(itemScore); // alias
  });
});

describe('rollItemDrop — slot-balanced drops stamped with ilvl', () => {
  it('drops all three categories with roughly equal representation and stamps ilvl from wave', () => {
    const rng = mk(123);
    const counts: Record<EquipSlot, number> = { weapon: 0, armor: 0, relic: 0 };
    const N = 600;
    for (let i = 0; i < N; i++) {
      const drop = rollItemDrop(rng, 20);
      const slot = itemDef(drop.defId)!.slot;
      counts[slot]++;
      expect(drop.ilvl).toBe(20); // stamped from wave
    }
    // Uniform-over-slot ⇒ each ≈ N/3; assert every category is well represented (not weighted by
    // how many items each category defines, which previously starved the smaller pools).
    for (const s of ['weapon', 'armor', 'relic'] as EquipSlot[]) expect(counts[s]).toBeGreaterThan(N * 0.25);
  });
});
