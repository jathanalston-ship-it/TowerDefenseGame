// Gene Archive read-model (docs/GENE-EVOLUTION.md, Task 5) — ONE pure transform from the save into
// everything the Archive renders: a row per registered card (level, ceiling, next cost, campaign
// gate — always SHOWN, never hidden — owned state, upgradeability, permanent power) plus header
// totals. Derives generically from cardRegistry + save.genes, so hundreds of future cards render
// with no UI change. Task 8 layers search/sort over these same rows. Pure: no DOM/meta writes.

import { cardRegistry, cardSubject } from '../core/cards';
import type { CardDef } from '../core/cards';
import type { CardSubject } from '../core/types';
import {
  geneGateForLevel, geneLevel, geneLevelCapForStage, geneMaxLevel, genePermanentPowerMult,
} from '../core/geneCards';
import { transcendOption, transcendOptionsFor, transcendPowerMult } from '../core/geneTranscend';
import type { TranscendOption } from '../core/geneTranscend';
import { essenceTranscendCost, essenceUpgradeCost } from '../core/geneEssence';
import type { SaveData } from '../save/saveStore';
import { highestCampaignStage } from '../save/derive';

export interface GeneArchiveRow {
  def: CardDef;
  subject: CardSubject; // what it affects (tower / hero / global / economy / hive)
  owned: boolean; // drafted at least once (stats.uniqueCards)
  level: number; // current permanent level
  maxLevel: number; // authored ceiling
  powerMult: number; // this card's PERMANENT power contribution right now (1 at level 0)
  // ── The next level (null everywhere when maxed) ──
  nextCost: number | null; // Essence cost of level+1
  nextNote: string | null; // what level+1 does
  gateStage: number; // campaign stage required for level+1 (0 = ungated)
  gateMet: boolean; // campaign progress satisfies the gate
  canAfford: boolean; // wallet covers nextCost
  upgradeable: boolean; // owned && !maxed && gateMet && canAfford — the "buy now" signal
  // ── History / future (the inspection screen) ──
  historyNotes: string[]; // notes of levels already purchased (the upgrade history)
  futureNotes: { level: number; note: string; cost: number; gateStage: number; gateMet: boolean }[];
  // ── Transcendence (docs/GENE-EVOLUTION.md §Transcendence) — the late-game sink on a MAXED card ──
  transcend: TranscendOption | null; // the chosen second line (null = untranscended)
  transcendOptions: TranscendOption[]; // the pool this card picks from (family or per-card override)
  transcendCost: number; // Essence price — choosing AND re-choosing pay this in full (the sink)
  transcendReady: boolean; // owned && maxed && affordable — the "sink is buyable now" signal
  acquiredAt?: number;
  upgradedAt?: number;
  favorite: boolean;
  pinned: boolean;
}

export interface GeneArchiveSummary {
  total: number; // registered cards
  owned: number;
  upgradeable: number; // rows with the buy-now signal
  levels: number; // Σ purchased levels
  maxLevels: number; // Σ ceilings
  transcended: number; // cards carrying a chosen Transcendence line (§Transcendence)
  essence: number; // wallet
  campaignStage: number;
  levelCap: number; // globally-unlocked level ceiling at this stage
  nextGate: { level: number; stage: number } | null; // the next milestone to surface prominently
}

/** One row per REGISTERED card, in registry order (stable). */
export function geneArchiveRows(save: SaveData): GeneArchiveRow[] {
  const stage = highestCampaignStage(save);
  const ownedSet = new Set(save.stats?.uniqueCards ?? []);
  const cap = geneLevelCapForStage(stage);
  return cardRegistry.active().map((def) => {
    const level = geneLevel(save.genes, def.id);
    const max = geneMaxLevel(def);
    const ups = def.upgrades ?? [];
    const owned = ownedSet.has(def.id);
    const maxed = level >= max;
    const nextLevel = level + 1;
    const nextCost = maxed ? null : essenceUpgradeCost(def.rarity, nextLevel);
    const gateStage = maxed ? 0 : geneGateForLevel(nextLevel);
    const gateMet = !maxed && nextLevel <= cap;
    const canAfford = nextCost !== null && save.geneEssence >= nextCost;
    const chosenTranscend = save.genes[def.id]?.transcend;
    const transcendCost = essenceTranscendCost(def.rarity);
    return {
      def,
      subject: cardSubject(def),
      owned,
      level,
      maxLevel: max,
      // Permanent contribution = upgrade levels + the transcended second line, combined ADDITIVELY —
      // the same linear per-card sum geneCollectionPowerMult folds (so the tile shows fold truth).
      powerMult: genePermanentPowerMult(def, level) + (transcendPowerMult(def, chosenTranscend) - 1),
      nextCost,
      nextNote: maxed ? null : ups[level]?.note ?? null,
      gateStage,
      gateMet,
      canAfford,
      upgradeable: owned && !maxed && gateMet && canAfford,
      historyNotes: ups.slice(0, level).map((u) => u.note),
      futureNotes: ups.slice(level).map((u, i) => {
        const l = level + i + 1;
        return { level: l, note: u.note, cost: essenceUpgradeCost(def.rarity, l), gateStage: geneGateForLevel(l), gateMet: l <= cap };
      }),
      transcend: transcendOption(def, chosenTranscend),
      transcendOptions: transcendOptionsFor(def),
      transcendCost,
      transcendReady: owned && maxed && save.geneEssence >= transcendCost,
      acquiredAt: save.genes[def.id]?.acquiredAt,
      upgradedAt: save.genes[def.id]?.upgradedAt,
      favorite: save.genes[def.id]?.favorite === true,
      pinned: save.genes[def.id]?.pinned === true,
    };
  });
}

/** Header totals + the next campaign gate (displayed prominently — the player always knows what
 *  they are working toward). */
export function geneArchiveSummary(save: SaveData, rows = geneArchiveRows(save)): GeneArchiveSummary {
  const stage = highestCampaignStage(save);
  const cap = geneLevelCapForStage(stage);
  let levels = 0, maxLevels = 0, owned = 0, upgradeable = 0, transcended = 0;
  for (const r of rows) {
    levels += r.level;
    maxLevels += r.maxLevel;
    if (r.owned) owned++;
    if (r.upgradeable) upgradeable++;
    if (r.transcend) transcended++;
  }
  // The next gate above the current cap (null once every authored level is globally unlocked).
  const nextGate = (() => {
    let best: { level: number; stage: number } | null = null;
    for (let l = cap + 1; l <= 5; l++) {
      const s = geneGateForLevel(l);
      if (s > stage) { best = { level: l, stage: s }; break; }
    }
    return best;
  })();
  return { total: rows.length, owned, upgradeable, levels, maxLevels, transcended, essence: save.geneEssence, campaignStage: stage, levelCap: cap, nextGate };
}
