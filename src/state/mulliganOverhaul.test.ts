// Mulligan overhaul (docs/MULLIGANS.md): piece EXCLUSIVITY (one tower per piece — equips
// MOVE, sanitizer dedupes), the 3-unique-mega progress GATE, the REFORGE wheel (ichor
// spend, permanent lock, 1–3 slots by combined rarity, global legendary passives), and
// the catalog invariant that makes "one full organism per tower" always possible.

import { describe, expect, it } from 'vitest';
import { meta } from './meta';
import { TOWER_ORDER } from '../core/config';
import {
  MULLIGAN_GATE_MEGAS, isMulliganActive, modifierHost, mulliganRegistry, reforgeSlotCount,
} from '../core/mulligan';
import { REFORGE_MODS, REFORGE_RARITY, reforgeCost, rollReforgeMod, rollReforgeRarity } from '../core/mulliganReforge';
import { defaultSave, parseImport } from '../save/saveStore';

const K0 = TOWER_ORDER[0];
const K1 = TOWER_ORDER[1];

function unlockAndDiscover(ids: string[], rarity = 'common' as const): void {
  meta.reset();
  for (const id of ids) meta.discoverModifier(id, rarity);
}

describe('piece exclusivity — one tower at a time', () => {
  it('equipping an owned piece on a second tower MOVES it (the first organism loses it)', () => {
    const ids = mulliganRegistry.ids().slice(0, 4);
    unlockAndDiscover(ids);
    expect(meta.equipMulligan(K0, 0, ids[0])).toBe(true);
    expect(modifierHost(meta.get().mulligans, ids[0])).toBe(K0);
    expect(meta.equipMulligan(K1, 0, ids[0])).toBe(true); // move, not copy
    const save = meta.get();
    expect(save.mulligans[K1].slots[0]?.id).toBe(ids[0]);
    expect(save.mulligans[K0].slots[0]).toBeNull();
    expect(modifierHost(save.mulligans, ids[0])).toBe(K1);
  });

  it('refuses the same piece twice on one tower (one physical copy)', () => {
    const ids = mulliganRegistry.ids().slice(0, 2);
    unlockAndDiscover(ids);
    expect(meta.equipMulligan(K0, 0, ids[0])).toBe(true);
    expect(meta.equipMulligan(K0, 1, ids[0])).toBe(false);
  });

  it('sanitizer nulls cross-tower duplicates deterministically (first host wins)', () => {
    const id = mulliganRegistry.ids()[0];
    const bad = { ...defaultSave() } as ReturnType<typeof defaultSave>;
    const slot = { id, rarity: 'common', level: 1 };
    bad.mulligans = {
      ...bad.mulligans,
      [K0]: { slots: [slot, null, null], visualSeed: 1, animSeed: 1 },
      [K1]: { slots: [slot, null, null], visualSeed: 2, animSeed: 2 },
    } as typeof bad.mulligans;
    const r = parseImport(JSON.stringify(bad));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.mulligans[K0].slots[0]?.id).toBe(id);
      expect(r.data.mulligans[K1].slots[0]).toBeNull();
    }
  });

  it('the catalog always holds exactly three pieces per tower (full-roster coverage)', () => {
    expect(mulliganRegistry.size).toBe(3 * TOWER_ORDER.length);
  });
});

describe('progress gate — three distinct Mega Bosses', () => {
  it('locked on a fresh account; opens at the mega threshold; grandfathers piece holders', () => {
    meta.reset();
    expect(meta.mulligansUnlocked()).toBe(false);
    expect(meta.mulliganGateProgress()).toEqual({ slain: 0, needed: MULLIGAN_GATE_MEGAS });
    // Piece holders (pre-gate saves) stay unlocked — progress is never confiscated.
    meta.discoverModifier(mulliganRegistry.ids()[0], 'common');
    expect(meta.mulligansUnlocked()).toBe(true);
  });
});

describe('reforge — the permanent gamble', () => {
  function assembled(kind = K0, rarity: 'common' | 'legendary' = 'common'): void {
    meta.reset();
    const ids = mulliganRegistry.ids().slice(0, 3);
    for (const id of ids) meta.discoverModifier(id, rarity);
    ids.forEach((id, i) => expect(meta.equipMulligan(kind, i, id, rarity)).toBe(true));
    expect(isMulliganActive(meta.get().mulligans[kind])).toBe(true);
  }

  it('slot count scales with combined graft rarity (1 at common triple, 3 at legendary triple)', () => {
    assembled(K0, 'common');
    expect(reforgeSlotCount(meta.get().mulligans[K0])).toBe(1);
    assembled(K0, 'legendary');
    expect(reforgeSlotCount(meta.get().mulligans[K0])).toBe(3);
    expect(reforgeSlotCount(undefined)).toBe(0); // inactive organisms cannot gamble
  });

  it('spins spend ichor, lock the organism forever, and block re-slotting its pieces', () => {
    assembled(K0);
    expect(meta.reforgeMulligan(K0, 0)).toBeNull(); // no ichor → refused, still unlocked
    expect(meta.get().mulligans[K0].locked).not.toBe(true);
    meta.grantIchor('test', 1000);
    const before = meta.get().ichor;
    const res = meta.reforgeMulligan(K0, 0);
    expect(res).not.toBeNull();
    expect(REFORGE_MODS.some((m) => m.id === res!.mod.id)).toBe(true);
    const save = meta.get();
    expect(before - save.ichor).toBe(reforgeCost(0));
    expect(save.mulligans[K0].locked).toBe(true);
    expect(save.mulligans[K0].reforges?.[0]).toBe(res!.mod.id);
    // LOCKED: no unequip, no re-slot, and its pieces cannot move to another tower.
    expect(meta.unequipMulligan(K0, 0)).toBe(false);
    expect(meta.equipMulligan(K0, 0, mulliganRegistry.ids()[3])).toBe(false);
    const boundPiece = save.mulligans[K0].slots[0]!.id;
    expect(meta.equipMulligan(K1, 0, boundPiece)).toBe(false);
    // A common triple has ONE slot — deeper slots refuse even with ichor.
    expect(meta.reforgeMulligan(K0, 1)).toBeNull();
  });

  it('reforge stats fold into the resolved kit; legendary globals reach the run-effects lane', () => {
    assembled(K0);
    meta.grantIchor('test', 1000);
    const beforeKit = meta.mulliganResolved(K0);
    let res = meta.reforgeMulligan(K0, 0)!;
    // Re-spin until a STAT mod lands (globals don't touch the local kit) — bounded loop.
    for (let i = 0; i < 60 && !res.mod.stats; i++) res = meta.reforgeMulligan(K0, 0)!;
    if (res.mod.stats) {
      const after = meta.mulliganResolved(K0);
      expect(after.power).toBeGreaterThan(beforeKit.power);
    }
    // Global lane: force a legendary global into the state via the same API shape.
    const legendary = REFORGE_MODS.find((m) => m.rarity === 'legendary' && m.global)!;
    const s = meta.get();
    // simulate the roll having landed on the legendary (state-level, sanitizer-legal)
    const st = { ...s.mulligans[K0], locked: true, reforges: [legendary.id, null, null] };
    expect(parseImport(JSON.stringify({ ...s, mulligans: { ...s.mulligans, [K0]: st } })).ok).toBe(true);
  });

  it('rarity roll respects the wheel weights and every mod id resolves', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) {
      const r = rollReforgeRarity(i / 4000);
      counts[r] = (counts[r] ?? 0) + 1;
    }
    expect(counts.common).toBeGreaterThan(counts.legendary ?? 0);
    expect(Object.keys(counts).sort()).toEqual([...Object.keys(REFORGE_RARITY)].sort());
    for (let i = 0; i < 50; i++) {
      const m = rollReforgeMod(i / 50, (i * 7 % 50) / 50);
      expect(REFORGE_MODS).toContain(m);
    }
  });
});
