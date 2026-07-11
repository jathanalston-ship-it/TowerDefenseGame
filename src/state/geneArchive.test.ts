// Gene Archive (Task 5) + campaign gates (Task 6 spine): the read-model rows, the gate ladder, and
// the guarded meta.upgradeGene spend path.

import { describe, it, expect } from 'vitest';
import { geneArchiveRows, geneArchiveSummary } from './geneArchive';
import { meta } from './meta';
import { defaultSave, serializeExport } from '../save/saveStore';
import { CARD_POOL } from '../core/cards';
import { geneLevelCapForStage, genePermanentPowerMult } from '../core/geneCards';
import { transcendOptionsFor } from '../core/geneTranscend';
import { essenceTranscendCost, essenceUpgradeCost } from '../core/geneEssence';

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

describe('next-goal prominence (Task 6): the upcoming gene gate surfaces when it BITES', () => {
  it('appears on the Home goals once an owned card is parked at the cap, and points at the Archive', async () => {
    const { nextGoals } = await import('./nextGoal');
    // Fresh save: nothing owned ⇒ no gene-gate goal (nothing real to unlock).
    seed();
    expect(nextGoals(meta.get(), 20).find((g) => g.id.startsWith('gene-gate'))).toBeUndefined();
    // A card at the L1 cap with deeper levels waiting ⇒ the L2@15 gate is now a surfaced goal.
    seed({ stats: { ...defaultSave().stats, uniqueCards: [card.id] }, genes: { [card.id]: { level: 1 } }, campaign: { cleared: { standard: 5 }, bestTime: {} } });
    const goal = nextGoals(meta.get(), 20).find((g) => g.id.startsWith('gene-gate'));
    expect(goal).toBeDefined();
    expect(goal!.label).toContain('Gene Level 2');
    expect(goal!.remaining).toBe('10 Campaign stages'); // stage 5 of 15 — the requirement is explicit
    expect(goal!.nav).toBe('genes');
  });
});

describe('Power integration (Task 9) — every permanent gene improvement moves Power, immediately', () => {
  it('upgradeGene raises the ACCOUNT Power Score at once, and previewPower predicts it exactly', async () => {
    seed({
      stats: { ...defaultSave().stats, uniqueCards: [card.id] }, geneEssence: 999,
      campaign: { cleared: { standard: 100 }, bestTime: {} },
    });
    const before = meta.power().score;
    const predicted = meta.previewPower((s) => ({
      ...s, genes: { ...s.genes, [card.id]: { level: 1 } },
    })).score;
    expect(meta.upgradeGene(card.id)).toBe(true);
    const after = meta.power().score;
    expect(after).toBeGreaterThan(before); // Power moved immediately on persist
    expect(after).toBe(predicted); // the Archive's preview is the real model, not an estimate
  });

  it('the maxed library lands in the calibrated major-pillar band (×2–2.9 on the meta bucket)', async () => {
    const { geneCollectionPowerMult, geneMaxLevel } = await import('../core/geneCards');
    const full: Record<string, { level: number }> = {};
    for (const c of CARD_POOL) full[c.id] = { level: geneMaxLevel(c) };
    const mult = geneCollectionPowerMult(full);
    // Band tracks the library size: the Deep-Strain set (docs/SIPHON.md) added 7 upgradable cards,
    // lifting the maxed collection from ~2.6 to ~2.72. Upper bound leaves headroom for near-term growth.
    expect(mult).toBeGreaterThan(2);
    expect(mult).toBeLessThan(2.9);
  });

  it('the validator REJECTS a gene level that is invisible to Power (bypass prevention)', async () => {
    const { cardProblems } = await import('../core/cards');
    const bad = {
      ...card,
      maxLevel: 3,
      upgrades: [
        { effects: [{ op: 'mul' as const, field: 'towerDamageMult' as const, value: 1.05 }], note: 'ok' },
        { effects: [{ op: 'biomass' as const, value: 50 }], note: 'instant only — unscored' },
        { effects: [{ op: 'mul' as const, field: 'towerDamageMult' as const, value: 1.05 }], note: 'ok' },
      ],
    };
    const problems = cardProblems(bad);
    expect(problems.some((p) => p.includes('L2 is invisible to Power Score'))).toBe(true);
  });
});

describe('nav badge (Task 12 audit) — the Archive lights up when an upgrade is ready', () => {
  it("the 'genes' channel counts upgradeable cards and clears when none remain", async () => {
    await import('./notificationSources'); // side-effect registration (as the Hub does)
    const { notifications } = await import('./notifications');
    seed(); // fresh save: nothing owned ⇒ no badge
    expect(notifications.badges(meta.get()).genes).toBeUndefined();
    seed({ stats: { ...defaultSave().stats, uniqueCards: [card.id] }, geneEssence: 999 });
    expect(notifications.badges(meta.get()).genes).toBe(1); // owned + gate met + affordable
    notifications.markSeen('genes', meta.get());
    expect(notifications.badges(meta.get()).genes).toBeUndefined(); // acknowledged
  });
});

describe('favorites + pinning (Task 8) — persisted collection gestures', () => {
  it('toggles persist, survive a save round-trip, and surface on the rows', () => {
    seed();
    meta.toggleGeneFavorite(card.id);
    meta.toggleGenePin(card.id);
    let row = geneArchiveRows(meta.get()).find((r) => r.def.id === card.id)!;
    expect(row.favorite).toBe(true);
    expect(row.pinned).toBe(true);
    // Round-trip through the sanitizer (export → import) keeps the flags.
    meta.importText(serializeExport(meta.get()));
    row = geneArchiveRows(meta.get()).find((r) => r.def.id === card.id)!;
    expect(row.favorite).toBe(true);
    expect(row.pinned).toBe(true);
    // Toggling off returns the entry toward sparse defaults.
    meta.toggleGeneFavorite(card.id);
    expect(geneArchiveRows(meta.get()).find((r) => r.def.id === card.id)!.favorite).toBe(false);
    expect(meta.upgradeGene(card.id)).toBe(false); // unrelated guards untouched (still unowned)
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
      campaign: { cleared: { standard: 100 }, bestTime: {} },
    });
    for (let i = 0; i < card.maxLevel!; i++) expect(meta.upgradeGene(card.id)).toBe(true);
    expect(meta.upgradeGene(card.id)).toBe(false); // authored ceiling reached
    expect(meta.get().genes[card.id].level).toBe(card.maxLevel);
  });
});

describe('meta.transcendGene — the late-game sink (docs/GENE-EVOLUTION.md §Transcendence)', () => {
  const cost = essenceTranscendCost(card.rarity);
  const opts = transcendOptionsFor(card);
  const maxed = (essence: number) => ({
    stats: { ...defaultSave().stats, uniqueCards: [card.id] },
    geneEssence: essence,
    genes: { [card.id]: { level: card.maxLevel! } },
  });

  it('refuses undiscovered / below-max / bogus-option / unaffordable', () => {
    seed({ geneEssence: cost, genes: { [card.id]: { level: card.maxLevel! } } });
    expect(meta.transcendGene(card.id, opts[0].id)).toBe(false); // not discovered
    seed({ stats: { ...defaultSave().stats, uniqueCards: [card.id] }, geneEssence: cost, genes: { [card.id]: { level: card.maxLevel! - 1 } } });
    expect(meta.transcendGene(card.id, opts[0].id)).toBe(false); // max level only
    seed(maxed(cost));
    expect(meta.transcendGene(card.id, '__forged__')).toBe(false); // real options only
    seed(maxed(cost - 1));
    expect(meta.transcendGene(card.id, opts[0].id)).toBe(false); // can't afford
    expect(meta.get().genes[card.id].transcend).toBeUndefined(); // nothing leaked through
  });

  it('spends the full price, persists the choice, moves Power immediately', () => {
    seed(maxed(cost + 5));
    const before = meta.power().score;
    expect(meta.transcendGene(card.id, opts[0].id)).toBe(true);
    const s = meta.get();
    expect(s.geneEssence).toBe(5);
    expect(s.genes[card.id].transcend).toBe(opts[0].id);
    expect(s.genes[card.id].level).toBe(card.maxLevel); // level untouched
    expect(s.genes[card.id].upgradedAt).toBeGreaterThan(0);
    expect(meta.power().score).toBeGreaterThan(before); // the second line counts at once
  });

  it('re-buying the SAME option is refused; a DIFFERENT one pays the full price again', () => {
    seed({ ...maxed(cost * 2), genes: { [card.id]: { level: card.maxLevel!, transcend: opts[0].id } } });
    expect(meta.transcendGene(card.id, opts[0].id)).toBe(false); // pure waste — blocked
    expect(meta.transcendGene(card.id, opts[1].id)).toBe(true); // the sink: full price re-choice
    expect(meta.get().geneEssence).toBe(cost); // one full price deducted
    expect(meta.get().genes[card.id].transcend).toBe(opts[1].id); // old line replaced
  });

  it('survives a save round-trip and surfaces on the Archive rows + summary', () => {
    seed(maxed(cost));
    expect(meta.transcendGene(card.id, opts[0].id)).toBe(true);
    meta.importText(serializeExport(meta.get())); // export → sanitizer → import
    expect(meta.get().genes[card.id].transcend).toBe(opts[0].id);
    const row = geneArchiveRows(meta.get()).find((r) => r.def.id === card.id)!;
    expect(row.transcend?.id).toBe(opts[0].id);
    expect(row.transcendOptions.length).toBeGreaterThanOrEqual(2);
    expect(row.transcendCost).toBe(cost);
    expect(row.powerMult).toBeGreaterThan(genePermanentPowerMult(card, card.maxLevel!)); // tile shows the line
    expect(geneArchiveSummary(meta.get()).transcended).toBe(1);
  });

  it('rows flag transcendReady only when owned + maxed + affordable', () => {
    seed(maxed(cost));
    expect(geneArchiveRows(meta.get()).find((r) => r.def.id === card.id)!.transcendReady).toBe(true);
    seed(maxed(cost - 1));
    expect(geneArchiveRows(meta.get()).find((r) => r.def.id === card.id)!.transcendReady).toBe(false);
    seed({ ...maxed(cost), genes: { [card.id]: { level: card.maxLevel! - 1 } } });
    expect(geneArchiveRows(meta.get()).find((r) => r.def.id === card.id)!.transcendReady).toBe(false);
  });
});
