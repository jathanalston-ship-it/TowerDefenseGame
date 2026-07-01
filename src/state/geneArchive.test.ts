// Gene Archive (Task 5) + campaign gates (Task 6 spine): the read-model rows, the gate ladder, and
// the guarded meta.upgradeGene spend path.

import { describe, it, expect } from 'vitest';
import { geneArchiveRows, geneArchiveSummary } from './geneArchive';
import { meta } from './meta';
import { defaultSave, serializeExport } from '../save/saveStore';
import { CARD_POOL } from '../core/cards';
import { geneLevelCapForStage } from '../core/geneCards';
import { essenceUpgradeCost } from '../core/geneEssence';

const card = CARD_POOL[0]; // sharpened_needles (common)

function seed(over: Partial<ReturnType<typeof defaultSave>> = {}): void {
  meta.importText(serializeExport({ ...defaultSave(), ...over }));
}

describe('campaign gate ladder', () => {
  it('unlocks L1 immediately and deeper levels at 15/30/50/75', () => {
    expect(geneLevelCapForStage(0)).toBe(1);
    expect(geneLevelCapForStage(14)).toBe(1);
    expect(geneLevelCapForStage(15)).toBe(2);
    expect(geneLevelCapForStage(30)).toBe(3);
    expect(geneLevelCapForStage(50)).toBe(4);
    expect(geneLevelCapForStage(75)).toBe(5);
    expect(geneLevelCapForStage(200)).toBe(5);
  });
});

describe('gene archive read-model', () => {
  it('renders one row per registered card, unowned + level 0 on a fresh save', () => {
    seed();
    const rows = geneArchiveRows(meta.get());
    expect(rows).toHaveLength(CARD_POOL.length);
    for (const r of rows) {
      expect(r.owned).toBe(false);
      expect(r.level).toBe(0);
      expect(r.upgradeable).toBe(false); // unowned ⇒ never upgradeable
      expect(r.gateStage).toBe(0); // L1 is ungated — the requirement is SHOWN as none
      expect(r.nextCost).toBe(essenceUpgradeCost(r.def.rarity, 1));
      expect(r.futureNotes.length).toBe(r.maxLevel); // every future level is listed (never hidden)
    }
  });

  it('flags a row upgradeable only when owned + gate met + affordable', () => {
    seed({ stats: { ...defaultSave().stats, uniqueCards: [card.id] }, geneEssence: 999 });
    const row = geneArchiveRows(meta.get()).find((r) => r.def.id === card.id)!;
    expect(row.owned).toBe(true);
    expect(row.upgradeable).toBe(true);
    const sum = geneArchiveSummary(meta.get());
    expect(sum.upgradeable).toBe(1);
    expect(sum.nextGate).toEqual({ level: 2, stage: 15 }); // the next milestone, surfaced prominently
  });

  it('shows (never hides) a locked level: L2 requires Campaign Stage 15', () => {
    seed({ stats: { ...defaultSave().stats, uniqueCards: [card.id] }, geneEssence: 99999, genes: { [card.id]: { level: 1 } } });
    const row = geneArchiveRows(meta.get()).find((r) => r.def.id === card.id)!;
    expect(row.level).toBe(1);
    expect(row.gateStage).toBe(15); // the requirement is visible
    expect(row.gateMet).toBe(false);
    expect(row.upgradeable).toBe(false); // affordable but campaign-locked
  });
});

describe('meta.upgradeGene — the guarded spend', () => {
  it('refuses unowned / unaffordable; succeeds owned + funded; stamps upgradedAt', () => {
    seed({ geneEssence: 999 });
    expect(meta.upgradeGene(card.id)).toBe(false); // not discovered yet
    seed({ stats: { ...defaultSave().stats, uniqueCards: [card.id] }, geneEssence: 3 });
    expect(meta.upgradeGene(card.id)).toBe(false); // can't afford (L1 costs 25)
    seed({ stats: { ...defaultSave().stats, uniqueCards: [card.id] }, geneEssence: 999 });
    expect(meta.upgradeGene(card.id)).toBe(true);
    const s = meta.get();
    expect(s.genes[card.id].level).toBe(1);
    expect(s.geneEssence).toBe(999 - essenceUpgradeCost(card.rarity, 1));
    expect(s.genes[card.id].upgradedAt).toBeGreaterThan(0); // drives "recently improved"
  });

  it('enforces the campaign gate and the authored ceiling', () => {
    // Stage 0 ⇒ cap L1: the second buy is campaign-locked even with a full wallet.
    seed({ stats: { ...defaultSave().stats, uniqueCards: [card.id] }, geneEssence: 99999 });
    expect(meta.upgradeGene(card.id)).toBe(true); // → L1
    expect(meta.upgradeGene(card.id)).toBe(false); // L2 needs Campaign Stage 15
    // With the campaign far along, levels buy through to the authored ceiling and stop.
    seed({
      stats: { ...defaultSave().stats, uniqueCards: [card.id] }, geneEssence: 9999999,
      campaign: { cleared: { standard: 100 } },
    });
    for (let i = 0; i < card.maxLevel!; i++) expect(meta.upgradeGene(card.id)).toBe(true);
    expect(meta.upgradeGene(card.id)).toBe(false); // authored ceiling reached
    expect(meta.get().genes[card.id].level).toBe(card.maxLevel);
  });
});
