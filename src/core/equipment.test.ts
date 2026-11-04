import { describe, it, expect } from 'vitest';
import { Rng } from './rng';
import {
  ALL_ITEMS,
  RARITY_AFFIXES,
  WEAPONS,
  affixEffectText,
  itemDef,
  itemEffects,
  loadoutEffects,
  teamSetEffects,
  rerollAffixes,
  rollItem,
  rollItemForDepth,
  rollItemDrop,
  gearRarityOdds,
  itemLevelForDepth,
  maxTierForIlvl,
  RARITY_ORDER,
  transmute,
} from './equipment';
import { GEAR_RARITY_BANDS } from './config';

const mk = (seed: number): (() => number) => {
  const r = new Rng(seed);
  return () => r.next();
};

describe('equipment', () => {
  it('catalog has unique ids and ~20 weapons', () => {
    const ids = ALL_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(WEAPONS.length).toBeGreaterThanOrEqual(18);
  });

  it('rollItem rolls the affix count for the rarity', () => {
    const it = rollItem(mk(1), WEAPONS[0], 'epic');
    expect(it.affixes.length).toBe(RARITY_AFFIXES.epic);
  });

  it('exotic definitions force exotic rarity', () => {
    const exo = WEAPONS.find((w) => w.exotic)!;
    expect(rollItem(mk(2), exo, 'common').rarity).toBe('exotic');
  });

  it('itemEffects carries the base behavior (behavior-first)', () => {
    const it = rollItem(mk(3), itemDef('w_quill')!, 'common');
    const eff = itemEffects(it);
    expect(eff.some((e) => (e.op === 'add' || e.op === 'mul') && e.field === 'needleExtraProjectiles')).toBe(true);
  });

  it('an empty loadout contributes no effects (gear-less run stays identity)', () => {
    expect(loadoutEffects([], { weapon: null, armor: null, relic: null })).toEqual([]);
  });

  it('set bonuses are NOT baked into per-loadout item effects (they pool team-wide)', () => {
    const r = mk(4);
    const a = rollItem(r, itemDef('w_quill')!, 'common'); // apex weapon
    const b = rollItem(r, itemDef('a_chitin')!, 'common'); // apex armor
    const eff = loadoutEffects([a, b], { weapon: a.uid, armor: b.uid, relic: null });
    // The apex 2pc (+1 fracture stack) is NOT here — it's emitted by teamSetEffects instead, folded once.
    expect(eff.some((e) => e.op === 'add' && e.field === 'fractureBonusStacks')).toBe(false);
  });

  it('teamSetEffects: 2 pooled pieces → 2pc only; 4 pieces SPLIT across loadouts → 2pc AND the 4pc unlocks', () => {
    const r = mk(4);
    const w1 = rollItem(r, itemDef('w_quill')!, 'common');     // apex weapon
    const a1 = rollItem(r, itemDef('a_chitin')!, 'common');    // apex armor
    const w2 = rollItem(r, itemDef('w_ricochet')!, 'common');  // apex weapon
    const a2 = rollItem(r, itemDef('a_spineback')!, 'common'); // apex armor
    const inv = [w1, a1, w2, a2];
    const loA = { weapon: w1.uid, armor: a1.uid, relic: null };
    const loB = { weapon: w2.uid, armor: a2.uid, relic: null };
    const has = (eff: ReturnType<typeof teamSetEffects>, op: string, field: string) => eff.some((e) => e.op === op && (e as { field?: string }).field === field);
    // 2 pooled (one loadout): apex 2pc present, 4pc absent.
    const two = teamSetEffects(inv, [loA]);
    expect(has(two, 'add', 'fractureBonusStacks')).toBe(true);  // bonus2
    expect(has(two, 'mul', 'towerFireRateMult')).toBe(false);   // bonus4 not yet
    // 4 pooled ACROSS two heroes' loadouts — the point of team pooling: BOTH tiers now fire.
    const four = teamSetEffects(inv, [loA, loB]);
    expect(has(four, 'add', 'fractureBonusStacks')).toBe(true); // bonus2
    expect(has(four, 'mul', 'towerFireRateMult')).toBe(true);   // bonus4 UNLOCKED across the roster
  });

  it('reroll keeps the affix count; transmute raises rarity + adds an affix', () => {
    const r = mk(5);
    const it = rollItem(r, WEAPONS[1], 'rare');
    expect(rerollAffixes(r, it).affixes.length).toBe(RARITY_AFFIXES.rare);
    const t = transmute(r, it)!;
    expect(t.rarity).toBe('epic');
    expect(t.affixes.length).toBe(RARITY_AFFIXES.epic);
  });
});

describe('Details-screen support: affix explanations + item provenance', () => {
  it('affixEffectText renders a plain-language stat line per op', () => {
    expect(affixEffectText({ affixId: 'keen', tier: 1 })).toBe('+5% Tower Damage'); // mul
    expect(affixEffectText({ affixId: 'piercing', tier: 1 })).toBe('+1 max Fracture'); // add
    expect(affixEffectText({ affixId: 'anchored', tier: 1 })).toBe('Sets Anchor Point → nucleus'); // set
    expect(affixEffectText({ affixId: 'swift', tier: 1 })).toBe('−5% Ability Cooldown'); // reduction
  });

  it('rolled items are stamped with a source (Vault gear says so)', () => {
    expect(rollItemForDepth(mk(3), 40).source).toBe('Genetic Vault');
    expect(rollItem(mk(3), WEAPONS[0], 'rare').source).toBe('Genetic Vault'); // default
    expect(rollItem(mk(3), WEAPONS[0], 'rare', 5, 'Run Extraction').source).toBe('Run Extraction');
  });
});

describe('the gear chase (docs/EQUIPMENT.md §gear-chase)', () => {
  it('every band\'s odds sum to 1 and the rare tail never shrinks with depth', () => {
    let prevTail = -1;
    for (const b of GEAR_RARITY_BANDS) {
      const o = gearRarityOdds(b.fromIlvl);
      expect(RARITY_ORDER.reduce((a, r) => a + o[r], 0)).toBeCloseTo(1, 9);
      const tail = o.legendary + o.exotic;
      expect(tail).toBeGreaterThanOrEqual(prevTail);
      prevTail = tail;
    }
    expect(gearRarityOdds(1).legendary + gearRarityOdds(1).exotic).toBe(0); // the opening band is Inert/Active
    expect(gearRarityOdds(500)).toEqual(gearRarityOdds(GEAR_RARITY_BANDS[GEAR_RARITY_BANDS.length - 1].fromIlvl));
  });

  it('the roll reproduces the quoted odds (previews == outcomes) and Apex only comes from exotic defs', () => {
    const rng = mk(77);
    const ilvl = 34;
    const N = 20000;
    const n: Record<string, number> = {};
    for (let i = 0; i < N; i++) {
      const it = rollItemDrop(rng, ilvl);
      n[it.rarity] = (n[it.rarity] ?? 0) + 1;
      expect(it.ilvl).toBe(ilvl);
      expect(it.rarity === 'exotic').toBe(!!itemDef(it.defId)!.exotic);
      for (const a of it.affixes) expect(a.tier).toBeLessThanOrEqual(maxTierForIlvl(ilvl));
    }
    const odds = gearRarityOdds(ilvl);
    for (const r of RARITY_ORDER) expect(Math.abs((n[r] ?? 0) / N - odds[r])).toBeLessThan(0.012);
  });

  it('deep accounts reach T6 affixes (the old ilvl cap of 30 stopped at T5)', () => {
    expect(maxTierForIlvl(itemLevelForDepth(30))).toBeLessThan(6);
    expect(maxTierForIlvl(itemLevelForDepth(100))).toBe(6);
  });
});
