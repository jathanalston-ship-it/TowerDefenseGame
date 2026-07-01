// Starting Gene Loadouts (Task 7): sanitizers, the guarded slot API, and the run-boot auto-apply.

import { describe, it, expect } from 'vitest';
import { GENE_LOADOUT_MAX, GENE_LOADOUT_SLOTS, sanitizeGeneLoadout, sanitizeGeneSlots } from './geneLoadout';
import { CARD_POOL } from './cards';
import { Game } from './game';
import { meta } from '../state/meta';
import { defaultSave, serializeExport } from '../save/saveStore';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const a = CARD_POOL[0].id; // sharpened_needles
const b = CARD_POOL[1].id; // rapid_glands

function seed(over: Partial<ReturnType<typeof defaultSave>> = {}): void {
  meta.importText(serializeExport({ ...defaultSave(), ...over }));
}
const owned = (...ids: string[]) => ({ stats: { ...defaultSave().stats, uniqueCards: ids } });

describe('loadout sanitizers (anti-corruption)', () => {
  it('pads/clamps to five entries, drops unknown ids + duplicates', () => {
    expect(sanitizeGeneLoadout(undefined)).toEqual([null, null, null, null, null]);
    expect(sanitizeGeneLoadout([a, a, '__junk__', b, null, 'overflow'])).toEqual([a, null, null, b, null]);
    expect(sanitizeGeneSlots(undefined)).toBe(1);
    expect(sanitizeGeneSlots(99)).toBe(GENE_LOADOUT_MAX);
    expect(sanitizeGeneSlots(-3)).toBe(1);
  });
});

describe('meta loadout API — guarded equip / swap / buy', () => {
  it('equips only OWNED cards into UNLOCKED slots, never duplicated', () => {
    seed(owned(a));
    expect(meta.setGeneSlot(1, a)).toBe(false); // slot 2 locked (geneSlots = 1)
    expect(meta.setGeneSlot(0, b)).toBe(false); // b not discovered
    expect(meta.setGeneSlot(0, a)).toBe(true);
    seed({ ...owned(a, b), geneSlots: 2, geneLoadout: [a, null, null, null, null] });
    expect(meta.setGeneSlot(1, a)).toBe(false); // duplicate — one slot per card
    expect(meta.setGeneSlot(1, b)).toBe(true);
    expect(meta.setGeneSlot(0, null)).toBe(true); // clear
    expect(meta.geneLoadout()[0]).toBeNull();
  });

  it('rearranges via swap within unlocked slots', () => {
    seed({ ...owned(a, b), geneSlots: 2, geneLoadout: [a, b, null, null, null] });
    meta.swapGeneSlots(0, 1);
    expect(meta.geneLoadout().slice(0, 2)).toEqual([b, a]);
    meta.swapGeneSlots(0, 4); // slot 5 locked → no-op
    expect(meta.geneLoadout()[0]).toBe(b);
  });

  it('buyGeneSlot is DUAL-gated (Campaign AND Cores), sequential, and capped at five', () => {
    const slot2 = GENE_LOADOUT_SLOTS[1];
    seed({ shards: slot2.coreCost }); // rich but no campaign
    expect(meta.buyGeneSlot()).toBe(false);
    seed({ campaign: { cleared: { standard: slot2.campaignStage } } }); // deep but broke
    expect(meta.buyGeneSlot()).toBe(false);
    seed({ shards: slot2.coreCost + 5, campaign: { cleared: { standard: slot2.campaignStage } } });
    expect(meta.buyGeneSlot()).toBe(true); // both gates met
    expect(meta.geneSlots()).toBe(2);
    expect(meta.get().shards).toBe(5); // cores spent
    expect(meta.buyGeneSlot()).toBe(false); // slot 3 needs Stage 25 — sequential, still gated
    seed({ geneSlots: 5, shards: 1e9, campaign: { cleared: { standard: 999 } } });
    expect(meta.buyGeneSlot()).toBe(false); // all five owned
  });

  it('startingGenes returns only OWNED cards in UNLOCKED slots (the run-boot list)', () => {
    seed({ ...owned(a), geneSlots: 2, geneLoadout: [a, b, null, null, null] });
    expect(meta.startingGenes()).toEqual([a]); // b unowned ⇒ filtered
    seed({ ...owned(a, b), geneSlots: 1, geneLoadout: [a, b, null, null, null] });
    expect(meta.startingGenes()).toEqual([a]); // slot 2 locked ⇒ b ignored
  });
});

describe('run boot — equipped genes AUTO-ACTIVATE (and Power updates immediately)', () => {
  it('applies each starting gene at its permanent level, exactly like a draft', () => {
    // sharpened_needles at L1: base ×1.12 × upgrade ×1.06.
    const g = new Game(1, NO_META, undefined, 'ravager', undefined, { startingGenes: [a], geneLevels: { [a]: 1 } });
    const any = g as unknown as { mods: { towerDamageMult: number } };
    expect(any.mods.towerDamageMult).toBeCloseTo(1.12 * 1.06, 5);
    expect(g.chosenCards.map((c) => c.id)).toEqual([a]); // visible in the run's card list
    expect(g.powerEffects().length).toBeGreaterThan(0); // the live run Power moves at boot
  });

  it('is golden-safe: omitted / empty startingGenes boots byte-identical mods', () => {
    const base = new Game(1, NO_META) as unknown as { mods: Record<string, unknown> };
    const empty = new Game(1, NO_META, undefined, 'ravager', undefined, { startingGenes: [] }) as unknown as { mods: Record<string, unknown> };
    expect(empty.mods).toEqual(base.mods);
  });
});
