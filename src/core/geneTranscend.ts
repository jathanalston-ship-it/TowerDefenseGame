// Gene Card TRANSCENDENCE (docs/GENE-EVOLUTION.md §Transcendence) — the late-game Essence sink.
// A card at its authored max level may TRANSCEND: a large Gene Essence spend adds a SECOND effect
// line, chosen by the player from a small curated pool. Options are authored per card CATEGORY
// (the archetype family), so every card in the registry resolves a pool with ZERO per-card code;
// a card may override its family pool via `CardDef.transcendOptions`. The chosen option folds into
// runs through effectiveGeneEffects — the exact pipeline leveled upgrades already ride — so the
// sim gains no new seam and an untranscended save stays byte-identical (the golden invariant).
//
// FUTURE HOOK (documented, not built): a SECOND transcendence tier would add
// `transcend2?: string` beside `transcend` on GeneCardSave and a second resolver pass here —
// the fold, power and sanitizer seams below are all shaped to take it without restructuring.

import type { CardCategory } from './types';
import type { CardDef, CardEffect } from './cards';
import { effectsPower } from './power';

export interface TranscendOption {
  id: string;
  label: string;
  effects: CardEffect[];
}

/** THE family pools — 2–3 options per card category (all nine union members, so future cards in
 *  any category resolve options the day they ship). Magnitudes are a strong second line —
 *  comparable to a deep upgrade level, never a second base card. Every effect uses a LIVE,
 *  Power-scored RunModifiers field (never boot-only — a transcended card must still work when
 *  drafted MID-run; enforced by validate.ts for these pools + cardProblems for overrides). */
export const TRANSCEND_BY_CATEGORY: Record<CardCategory, TranscendOption[]> = {
  tower: [
    { id: 't_overwhelm', label: 'Overwhelming Force', effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.08 }] },
    { id: 't_cadence', label: 'Relentless Cadence', effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.06 }] },
    { id: 't_bulwark', label: 'Rooted Bulwark', effects: [{ op: 'add', field: 'integrityRegenPerWave', value: 20 }] },
  ],
  economy: [
    { id: 'e_yield', label: 'Compounding Yield', effects: [{ op: 'mul', field: 'biomassMult', value: 1.1 }] },
    { id: 'e_reactor', label: 'Reactor Attunement', effects: [{ op: 'mul', field: 'reactorBiomassMult', value: 1.15 }] },
    { id: 'e_salvage', label: 'Perfect Salvage', effects: [{ op: 'add', field: 'sellRefundFrac', value: 0.1 }] },
  ],
  hero: [
    { id: 'h_edge', label: 'Killing Edge', effects: [{ op: 'mul', field: 'heroDamageMult', value: 1.1 }] },
    { id: 'h_tempo', label: 'Battle Tempo', effects: [{ op: 'mul', field: 'heroCooldownMult', value: 0.92 }] },
    { id: 'h_ward', label: 'Vital Ward', effects: [{ op: 'mul', field: 'heroHealingMult', value: 1.15 }] },
  ],
  control: [
    { id: 'c_grip', label: 'Lingering Grip', effects: [{ op: 'add', field: 'corrosionSlowBonus', value: 0.04 }] },
    { id: 'c_reverb', label: 'Status Reverb', effects: [{ op: 'add', field: 'fractureBonusStacks', value: 1 }] },
    { id: 'c_patience', label: 'Iron Patience', effects: [{ op: 'add', field: 'integrityRegenPerWave', value: 15 }] },
  ],
  poison: [
    { id: 'p_virulence', label: 'Virulence', effects: [{ op: 'mul', field: 'poolDpsMult', value: 1.12 }] },
    { id: 'p_infection', label: 'Deep Infection', effects: [{ op: 'mul', field: 'parasiteInfectionMult', value: 1.12 }] },
    { id: 'p_spread', label: 'Necrotic Spread', effects: [{ op: 'add', field: 'killFractureSplash', value: 1 }] },
  ],
  aoe: [
    { id: 'a_bloom', label: 'Wider Bloom', effects: [{ op: 'mul', field: 'splashRadiusMult', value: 1.08 }] },
    { id: 'a_pools', label: 'Enduring Pools', effects: [{ op: 'mul', field: 'mortarPoolDurationMult', value: 1.15 }] },
    { id: 'a_shrapnel', label: 'Shrapnel Seed', effects: [{ op: 'add', field: 'fractureBonusStacks', value: 1 }] },
  ],
  crit: [
    { id: 'k_eye', label: "Predator's Eye", effects: [{ op: 'add', field: 'heroCritChance', value: 0.05 }] },
    { id: 'k_brutality', label: 'Brutality', effects: [{ op: 'add', field: 'heroCritDamageBonus', value: 0.25 }] },
    { id: 'k_ambush', label: 'Ambush Instinct', effects: [{ op: 'add', field: 'fullHealthDamageBonus', value: 0.05 }] },
  ],
  mutation: [
    { id: 'm_flux', label: 'Adaptive Flux', effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.05 }, { op: 'mul', field: 'biomassMult', value: 1.04 }] },
    { id: 'm_emplacement', label: 'Grafted Emplacement', effects: [{ op: 'add', field: 'bonusTowerSlots', value: 1 }] },
    { id: 'm_resonant', label: 'Class Resonance', effects: [{ op: 'add', field: 'classResonanceBonus', value: 0.05 }] },
  ],
  summons: [
    { id: 's_frenzy', label: 'Frenzied Brood', effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.05 }] },
    { id: 's_devour', label: 'Devouring Brood', effects: [{ op: 'mul', field: 'biomassMult', value: 1.06 }] },
  ],
};

/** The pool a card transcends from: its own override when authored, else its family's. */
export function transcendOptionsFor(def: CardDef): TranscendOption[] {
  return def.transcendOptions ?? TRANSCEND_BY_CATEGORY[def.category] ?? [];
}

/** Resolve a saved option id against the card's pool (null = untranscended / stale id). */
export function transcendOption(def: CardDef, optionId?: string): TranscendOption | null {
  if (!optionId) return null;
  return transcendOptionsFor(def).find((o) => o.id === optionId) ?? null;
}

/** ONE card's transcendence power multiplier — the strength of its chosen second line only
 *  (×1 untranscended, so the account Power fold stays golden-safe). */
export function transcendPowerMult(def: CardDef, optionId?: string): number {
  const opt = transcendOption(def, optionId);
  return opt ? effectsPower(opt.effects) : 1;
}
