// Hero Symbiote contracts (docs/HERO-SYMBIOTES.md) — the catalog coverage rules, the golden
// identity gate, kit scaling/merging, slot adaptations, the resonance census, per-hero gates
// (the future-hero contract), the sanitizer, and Power monotonicity.

import { describe, expect, it } from 'vitest';
import {
  HERO_SYMBIOTE_GATES, SYMBIOTE_CATEGORIES, SYMBIOTE_SEATS, SYMBIOTE_SLOTS,
  emptyHeroSymbiote, heroSymbiotePower, accountSymbiotePower, isSlotActive, mergeSymbioteKit,
  resolveHeroSymbiote, resonanceOf, sanitizeHeroSymbiote, sanitizeHeroSymbiotes, slotAdaptation,
  symbioteGateProgress, symbioteGraftCost, symbioteKitAt, symbioteLevelCap, symbioteRegistry,
  symbioteUpgradeCost, symbiotesByCategory, symbiotesByClass,
} from './heroSymbiote';
import type { HeroSymbioteState, SymbioteGateSnapshot, SymbioteKit } from './heroSymbiote';
import { COMBAT_CLASS_ORDER } from './combatClass';
import { MULLIGAN_RARITY } from './mulligan';
import { HERO_ORDER } from './config';
import { meta, heroProgress } from '../state/meta';
import { defaultSave, serializeExport } from '../save/saveStore';

/** Build a state with `ids` grafted (level `level`) and seated sequentially across slots. */
function grafted(ids: string[], level = 1, unlocked = SYMBIOTE_SLOTS): HeroSymbioteState {
  const st = emptyHeroSymbiote();
  st.unlocked = unlocked;
  ids.forEach((id, i) => {
    st.grown[id] = { level };
    st.slots[Math.floor(i / SYMBIOTE_SEATS)][i % SYMBIOTE_SEATS] = id;
  });
  return st;
}

const snap = (over: Partial<SymbioteGateSnapshot> = {}): SymbioteGateSnapshot => ({
  kills: 0, masteryLevel: 0, stars: 0, campaignStage: 0, genomeRankTier: 1, powerScore: 0,
  megasSlain: 0, rushBestBoss: 0, molts: 0, collectionPct: 0, ichor: 0, ...over,
});

describe('symbiote catalog contracts', () => {
  it('every organ passes its registry validator', () => {
    expect(symbioteRegistry.validate()).toEqual([]);
  });

  it('launch catalog is 36 species — six per class, two per class×category cell', () => {
    expect(symbioteRegistry.all().length).toBe(36);
    for (const cls of COMBAT_CLASS_ORDER) {
      const ofClass = symbiotesByClass(cls);
      expect(ofClass.length, `${cls} species`).toBe(6);
      for (const cat of SYMBIOTE_CATEGORIES) {
        const cell = ofClass.filter((o) => o.category === cat);
        expect(cell.length, `${cls}×${cat} cell`).toBeGreaterThanOrEqual(2);
      }
    }
    // Category totals stay balanced (12 per category) so every resonance is reachable.
    for (const cat of SYMBIOTE_CATEGORIES) expect(symbiotesByCategory(cat).length).toBe(12);
  });

  it('graft/upgrade costs rise with rarity and level', () => {
    const byTier = symbioteRegistry.all().slice().sort((a, b) => MULLIGAN_RARITY[a.rarity].tier - MULLIGAN_RARITY[b.rarity].tier);
    const lo = byTier[0];
    const hi = byTier[byTier.length - 1];
    expect(symbioteGraftCost(hi)).toBeGreaterThan(symbioteGraftCost(lo));
    expect(symbioteUpgradeCost(lo, 4)).toBeGreaterThan(symbioteUpgradeCost(lo, 1));
    for (const o of symbioteRegistry.all()) expect(symbioteLevelCap(o)).toBeGreaterThanOrEqual(1);
  });
});

describe('golden identity gate', () => {
  it('absent / empty / partial states resolve to the exact identity', () => {
    for (const state of [undefined, null, emptyHeroSymbiote()]) {
      const r = resolveHeroSymbiote(state);
      expect(r.active).toBe(false);
      expect(r.slotsActive).toBe(0);
      expect(r.kit).toBeNull();
      expect(r.power).toBe(1);
      expect(r.adaptations).toEqual([]);
      expect(r.resonance).toBeNull();
      expect(r.evolved).toBe(false);
    }
    // Two of three seats ⇒ still nothing (no partial activation).
    const partial = grafted(['acid_ducts', 'plague_fangs']);
    expect(isSlotActive(partial, 0)).toBe(false);
    expect(resolveHeroSymbiote(partial).power).toBe(1);
    // A seated organ that was never grafted ⇒ inactive.
    const ghost = grafted(['acid_ducts', 'plague_fangs', 'drone_membrane']);
    delete ghost.grown.drone_membrane;
    expect(isSlotActive(ghost, 0)).toBe(false);
  });

  it('a locked slot never activates even when seated', () => {
    const st = grafted(['acid_ducts', 'plague_fangs', 'drone_membrane', 'bone_lancets', 'coiled_tendons', 'tallow_glands'], 1, 1);
    expect(isSlotActive(st, 0)).toBe(true);
    expect(isSlotActive(st, 1)).toBe(false); // unlocked=1 ⇒ slot 2 is sealed
    expect(resolveHeroSymbiote(st).slotsActive).toBe(1);
  });
});

describe('kit scaling + merging', () => {
  it('levels scale amounts/deltas, never capabilities', () => {
    const acid = symbioteRegistry.get('acid_ducts')!;
    expect(symbioteKitAt(acid, 5).strikeStatuses![0].amount).toBeCloseTo(2 * 1.2, 10); // +5%/level
    const lancets = symbioteRegistry.get('bone_lancets')!;
    const k5 = symbioteKitAt(lancets, 5);
    expect(k5.strikeComponents).toBe(lancets.kit.strikeComponents); // flat capability, untouched
    const tendons = symbioteRegistry.get('coiled_tendons')!;
    expect(symbioteKitAt(tendons, 5).killHaste!.mult).toBeCloseTo(1 + 0.2 * 1.2, 10); // delta scales
    expect(symbioteKitAt(tendons, 5).killHaste!.seconds).toBe(1.0); // duration stays authored
  });

  it('merge caps echo/overheal, multiplies mults, keeps the strongest surge, last survival wins', () => {
    const kit: SymbioteKit = {};
    mergeSymbioteKit(kit, { abilityEchoFrac: 0.5, overhealShieldFrac: 0.7, auraMult: 1.1, survival: 'aggressive' });
    mergeSymbioteKit(kit, { abilityEchoFrac: 0.6, overhealShieldFrac: 0.7, auraMult: 1.2, survival: 'evasive', killHaste: { mult: 1.1, seconds: 2 } });
    mergeSymbioteKit(kit, { killHaste: { mult: 1.3, seconds: 1 } });
    expect(kit.abilityEchoFrac).toBe(0.9); // capped
    expect(kit.overhealShieldFrac).toBe(1); // capped
    expect(kit.auraMult).toBeCloseTo(1.32, 10);
    expect(kit.killHaste).toEqual({ mult: 1.3, seconds: 2 }); // strongest of each axis
    expect(kit.survival).toBe('evasive'); // last rewire wins
  });

  it('an active slot merges its three organs into one kit', () => {
    const st = grafted(['acid_ducts', 'plague_fangs', 'drone_membrane']);
    const r = resolveHeroSymbiote(st);
    expect(r.active).toBe(true);
    expect(r.slotsActive).toBe(1);
    expect(r.kit!.strikeStatuses).toEqual([
      { status: 'Corrosion', amount: 2 },
      { status: 'Infection', amount: 2 },
    ]);
    expect(r.kit!.auraMult).toBeCloseTo(1.08, 10);
    expect(r.power).toBeGreaterThan(1);
    expect(r.fx.length).toBe(3);
  });
});

describe('complete hero adaptation (per slot)', () => {
  it('three of a class ⇒ FULL capability; exactly two ⇒ MINOR; mixed ⇒ none', () => {
    const full = grafted(['bone_lancets', 'ram_plates', 'war_ganglion']); // 3× Kinetic
    const a = slotAdaptation(full, 0);
    expect(a?.tier).toBe('full');
    expect(a?.cls).toBe('Kinetic');
    const rf = resolveHeroSymbiote(full);
    expect(rf.adaptations.length).toBe(1);
    expect(rf.kit!.strikeComponents?.some((c) => c.type === 'explosion')).toBe(true); // the granted capability
    expect(rf.fx).toContain('crest');

    const minor = grafted(['bone_lancets', 'ram_plates', 'acid_ducts']); // 2× Kinetic + Caustic
    expect(slotAdaptation(minor, 0)?.tier).toBe('minor');

    const mixed = grafted(['bone_lancets', 'acid_ducts', 'plague_fangs']); // 1/1/1
    expect(slotAdaptation(mixed, 0)).toBeNull();

    // Power ladder: full > minor > mixed (same seat count, ascending set bonuses).
    const p = (s: HeroSymbioteState): number => resolveHeroSymbiote(s).power;
    expect(p(full)).toBeGreaterThan(p(minor));
  });
});

describe('multi-slot resonance (the census)', () => {
  const NINE_OFFENSIVE = ['bone_lancets', 'ram_plates', 'acid_ducts', 'dissolver_maw', 'plague_fangs', 'burst_cysts', 'synapse_barbs', 'stasis_needles', 'leech_quills'];

  it('null until all three slots are active', () => {
    expect(resonanceOf(grafted(NINE_OFFENSIVE.slice(0, 6)))).toBeNull(); // two slots only
    expect(resonanceOf(grafted(NINE_OFFENSIVE, 1, 2))).toBeNull(); // third slot sealed
  });

  it('≥6 of one category ⇒ its pure apex; 3/3/3 ⇒ the Trinity; else the leading pair', () => {
    expect(resonanceOf(grafted(NINE_OFFENSIVE))?.id).toBe('apex_predator');
    // Six offensive + three utility still reads pure.
    const sixThree = grafted(['bone_lancets', 'ram_plates', 'acid_ducts', 'plague_fangs', 'synapse_barbs', 'leech_quills', 'coiled_tendons', 'reek_vents', 'carrier_fleas']);
    expect(resonanceOf(sixThree)?.id).toBe('apex_predator');
    // A perfect 3/3/3.
    const trinity = grafted(['bone_lancets', 'acid_ducts', 'plague_fangs', 'coiled_tendons', 'reek_vents', 'carrier_fleas', 'ossified_lattice', 'tallow_glands', 'gestation_sac']);
    expect(resonanceOf(trinity)?.id).toBe('trinity_organism');
    // 5 offensive + 4 utility ⇒ the offensive+utility pair.
    const storm = grafted(['bone_lancets', 'ram_plates', 'acid_ducts', 'plague_fangs', 'synapse_barbs', 'coiled_tendons', 'war_ganglion', 'reek_vents', 'fume_sacs']);
    expect(resonanceOf(storm)?.id).toBe('stormfront');
  });

  it('a resonant hero is EVOLVED, folds the resonance kit, and pays Power for the crown', () => {
    const st = grafted(NINE_OFFENSIVE);
    const r = resolveHeroSymbiote(st);
    expect(r.evolved).toBe(true);
    expect(r.resonance?.id).toBe('apex_predator');
    expect(r.kit!.killHaste!.mult).toBeGreaterThanOrEqual(1.3); // Apex Predator's surge
    const two = resolveHeroSymbiote(grafted(NINE_OFFENSIVE.slice(0, 6)));
    expect(r.power).toBeGreaterThan(two.power);
  });
});

describe('per-hero slot gates (the future-hero contract)', () => {
  it('every hero declares exactly two trials — slot II and a strictly harder slot III', () => {
    for (const kind of HERO_ORDER) {
      const gates = HERO_SYMBIOTE_GATES[kind];
      expect(gates, `${kind} gates`).toBeDefined();
      expect(gates.map((g) => g.slot)).toEqual([2, 3]);
      const [ii, iii] = gates;
      expect(ii.title.length).toBeGreaterThan(0);
      expect(iii.ichorCost).toBeGreaterThan(ii.ichorCost); // III is the expensive crown
      expect(ii.ichorCost).toBeGreaterThan(0);
      expect(ii.reqs.length).toBeGreaterThanOrEqual(3);
      expect(iii.reqs.length).toBeGreaterThanOrEqual(5);
      const kills2 = ii.reqs.find((r) => r.id === 'kills')!;
      const kills3 = iii.reqs.find((r) => r.id === 'kills')!;
      expect(kills3.need, `${kind} III kills`).toBeGreaterThan(kills2.need);
    }
  });

  it('gate progress reads live rows; ready needs requirements AND the Ichor price', () => {
    const cold = symbioteGateProgress('ravager', 2, snap())!;
    expect(cold.ready).toBe(false);
    expect(cold.rows.every((r) => !r.met)).toBe(true);
    const gate = HERO_SYMBIOTE_GATES.ravager[0];
    const met = snap({ kills: 999999, stars: 5, campaignStage: 99, masteryLevel: 99 });
    const noIchor = symbioteGateProgress('ravager', 2, met)!;
    expect(noIchor.reqsMet).toBe(true);
    expect(noIchor.ready).toBe(false); // wallet short
    const paid = symbioteGateProgress('ravager', 2, { ...met, ichor: gate.ichorCost })!;
    expect(paid.ready).toBe(true);
    expect(symbioteGateProgress('ravager', 1, snap())).toBeNull(); // slot I has no gate
  });
});

describe('sanitizer — content is the authority', () => {
  it('garbage collapses to the empty state; unknown ids and kinds drop; levels clamp', () => {
    expect(sanitizeHeroSymbiote(undefined)).toEqual(emptyHeroSymbiote());
    expect(sanitizeHeroSymbiote(42)).toEqual(emptyHeroSymbiote());
    const dirty = sanitizeHeroSymbiote({
      unlocked: 99,
      grown: { acid_ducts: { level: 999 }, NOT_REAL: { level: 3 }, plague_fangs: { level: -2 } },
      slots: [['acid_ducts', 'NOT_REAL', 'plague_fangs'], ['acid_ducts'], 'junk'],
      adapted: ['Kinetic', 'FakeClass', 'Kinetic'],
      resonated: ['apex_predator', 'nope'],
      evolved: 'yes',
    });
    expect(dirty.unlocked).toBe(SYMBIOTE_SLOTS);
    expect(dirty.grown.acid_ducts.level).toBe(symbioteLevelCap(symbioteRegistry.get('acid_ducts')!));
    expect(dirty.grown.plague_fangs.level).toBe(1);
    expect(dirty.grown.NOT_REAL).toBeUndefined();
    expect(dirty.slots[0]).toEqual(['acid_ducts', null, 'plague_fangs']);
    expect(dirty.slots[1]).toEqual([null, null, null]); // §exclusivity — first seat won
    expect(dirty.adapted).toEqual(['Kinetic']);
    expect(dirty.resonated).toEqual(['apex_predator']);
    expect(dirty.evolved).toBeUndefined(); // only literal true persists

    const map = sanitizeHeroSymbiotes({ ravager: { unlocked: 2 }, bogus_hero: { unlocked: 3 } });
    expect(map.ravager?.unlocked).toBe(2);
    expect('bogus_hero' in map).toBe(false);
  });
});

describe('power', () => {
  it('grows with graft levels and multiplies across the roster', () => {
    const l1 = heroSymbiotePower(grafted(['acid_ducts', 'plague_fangs', 'drone_membrane'], 1));
    const l5 = heroSymbiotePower(grafted(['acid_ducts', 'plague_fangs', 'drone_membrane'], 5));
    expect(l1).toBeGreaterThan(1);
    expect(l5).toBeGreaterThan(l1);
    const solo = grafted(['acid_ducts', 'plague_fangs', 'drone_membrane']);
    expect(accountSymbiotePower([solo, undefined, emptyHeroSymbiote()])).toBeCloseTo(heroSymbiotePower(solo), 12);
  });
});

describe('meta pipeline — graft → seat → level → unlock (guarded spends)', () => {
  const seed = (over: Partial<ReturnType<typeof defaultSave>> = {}): void => {
    meta.importText(serializeExport({ ...defaultSave(), ...over }));
  };
  const kinetic = symbiotesByClass('Kinetic').slice(0, 3).map((o) => o.id);
  const common = symbioteRegistry.all().find((o) => o.rarity === 'common')!;

  it('graft: pays the rarity price once per HOST; refuses broke + double-grafts', () => {
    seed({ geneEssence: symbioteGraftCost(common) - 1 });
    expect(meta.graftHeroSymbiote('ravager', common.id)).toBe(false); // can't afford
    seed({ geneEssence: symbioteGraftCost(common) * 2 + 7 });
    expect(meta.graftHeroSymbiote('ravager', common.id)).toBe(true);
    expect(meta.get().heroSymbiotes.ravager?.grown[common.id]).toEqual({ level: 1 });
    expect(meta.graftHeroSymbiote('ravager', common.id)).toBe(false); // already grafted into this host
    expect(meta.graftHeroSymbiote('shepherd', common.id)).toBe(true); // another host grows its OWN instance
    expect(meta.get().geneEssence).toBe(7);
  });

  it('seat: grafted-only, unlocked slots only, MOVE semantics keep organs exclusive per host', () => {
    seed({ geneEssence: 1e9 });
    for (const id of kinetic) expect(meta.graftHeroSymbiote('ravager', id)).toBe(true);
    expect(meta.setHeroSymbioteSeat('ravager', 1, 0, kinetic[0])).toBe(false); // slot II sealed
    expect(meta.setHeroSymbioteSeat('ravager', 0, 0, '__forged__')).toBe(false);
    expect(meta.setHeroSymbioteSeat('ravager', 0, 0, kinetic[0])).toBe(true);
    expect(meta.setHeroSymbioteSeat('ravager', 0, 1, kinetic[0])).toBe(true); // moves — vacates seat 0
    expect(meta.get().heroSymbiotes.ravager?.slots[0]).toEqual([null, kinetic[0], null]);
    expect(meta.setHeroSymbioteSeat('ravager', 0, 1, null)).toBe(true); // clear
  });

  it('completing a full-class slot chronicles the adaptation ledger + moves Power; the fold attaches the kit', () => {
    seed({ geneEssence: 1e9 });
    for (const id of kinetic) meta.graftHeroSymbiote('ravager', id);
    expect(heroProgress(meta.get()).ravager.symbiote).toBeUndefined(); // grafted but unseated ⇒ identity
    const before = meta.power().score;
    kinetic.forEach((id, i) => expect(meta.setHeroSymbioteSeat('ravager', 0, i, id)).toBe(true));
    expect(isSlotActive(meta.get().heroSymbiotes.ravager!, 0)).toBe(true);
    expect(meta.get().heroSymbiotes.ravager?.adapted).toEqual(['Kinetic']); // the lifetime codex credit
    expect(meta.power().score).toBeGreaterThan(before); // the mulligans bucket moved
    const kit = heroProgress(meta.get()).ravager.symbiote;
    expect(kit).toBeDefined();
    expect(kit!.killHaste).toBeDefined(); // Ballistic Physiology's surge reached the fold
    expect(heroProgress(meta.get()).shepherd.symbiote).toBeUndefined(); // other hosts untouched
    expect(meta.genomeSnapshot().symbioteRatio).toBeGreaterThan(0);
    // breaking the slot never confiscates the ledger
    expect(meta.setHeroSymbioteSeat('ravager', 0, 0, null)).toBe(true);
    expect(meta.get().heroSymbiotes.ravager?.adapted).toEqual(['Kinetic']);
  });

  it('level: spends essence up to the rarity cap', () => {
    seed({ geneEssence: 1e9 });
    meta.graftHeroSymbiote('ravager', common.id);
    expect(meta.upgradeHeroSymbiote('ravager', common.id)).toBe(true);
    expect(meta.get().heroSymbiotes.ravager?.grown[common.id].level).toBe(2);
    while ((meta.get().heroSymbiotes.ravager?.grown[common.id].level ?? 0) < symbioteLevelCap(common)) {
      expect(meta.upgradeHeroSymbiote('ravager', common.id)).toBe(true);
    }
    expect(meta.upgradeHeroSymbiote('ravager', common.id)).toBe(false); // capped
  });

  it('unlock: sequential, gate-checked, no Ichor deducted on refusal', () => {
    seed({ ichor: 500 });
    expect(meta.unlockHeroSymbioteSlot('ravager', 3)).toBe(false); // not sequential (II first)
    expect(meta.unlockHeroSymbioteSlot('ravager', 2)).toBe(false); // trial unmet on a fresh save
    expect(meta.get().ichor).toBe(500); // nothing deducted on refusal
    // A save that MEETS slot II's trial: kills + stars + campaign (the ravager rows).
    seed({
      ichor: 500,
      heroKills: { ...defaultSave().heroKills, ravager: 999999 },
      heroStars: { ...defaultSave().heroStars, ravager: 5 },
      campaign: { cleared: { standard: 40, brutal: 0 }, bestTime: {} },
    });
    const gate = meta.heroSymbioteGate('ravager', 2)!;
    expect(gate.reqsMet).toBe(true);
    expect(meta.unlockHeroSymbioteSlot('ravager', 2)).toBe(true);
    expect(meta.get().heroSymbiotes.ravager?.unlocked).toBe(2);
    expect(meta.get().ichor).toBe(500 - gate.gate.ichorCost);
  });
});
