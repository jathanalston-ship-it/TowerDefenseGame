// Gene Cards — permanent progression layer (docs/GENE-EVOLUTION.md). The DEFINITION of a card lives
// in cards.ts (CardDef, static, data-driven). This module owns the PERMANENT per-card player STATE
// (level / rarity-tier / ascension / skin), the save shape + sanitizer, and the pure seams the rest
// of the game reads through:
//   • effectiveGeneEffects(def, level)  — the card's effects AT a permanent level (base + upgrades)
//   • genePermanentPowerMult(def, level) — that card's PERMANENT power contribution (upgrades only)
//   • geneCollectionPowerMult(genes)     — the whole collection's permanent power (scale-safe)
// ARCHITECTURE ONLY: no upgrade CONTENT is authored here (Task 4) — with the current empty `upgrades`
// arrays every seam is a no-op, so existing gameplay + the golden run are byte-identical. No DOM/state.

import { cardRegistry } from './cards';
import type { CardDef, CardEffect } from './cards';
import { effectsPower } from './power';

/** PERMANENT per-card player state (saved, sparse — only non-default cards get an entry). */
export interface GeneCardSave {
  level: number; // permanent upgrade level (0 = base). Campaign-gated ceiling in Task 6.
  rarityTier?: number; // rarity-UPGRADE tier above the card's base rarity (0 = base). Backend (Task 10).
  ascension?: number; // ascension tier (0 = none). Backend only — NO gameplay (Task 10).
  skin?: string; // equipped skin id (future artwork).
  acquiredAt?: number; // ms timestamp of first acquisition (drives "recently acquired" sort).
}

/** The permanent gene map: card id → its state. Absent id ⇒ base (level 0). Ownership is tracked
 *  separately via stats.uniqueCards (the collection), so this map stays sparse. */
export type GeneSave = Record<string, GeneCardSave>;

export const DEFAULT_GENE_STATE: Readonly<GeneCardSave> = { level: 0 };

/** How strongly permanent gene upgrades move the account Power Score. LINEAR in the number of
 *  upgrades (see geneCollectionPowerMult) so it stays sane at 500+ cards. Task 9 tunes it; the
 *  architecture only needs the seam. */
export const GENE_POWER_SCALE = 1;

/** The permanent upgrade ceiling for a card (base-only = 1 until Task 4 authors levels). */
export function geneMaxLevel(def: CardDef): number {
  return Math.max(1, def.maxLevel ?? 1);
}

/** The card's permanent level from the save (0 if unleveled/unowned). */
export function geneLevel(genes: GeneSave, id: string): number {
  return genes[id]?.level ?? 0;
}

/** The card's effects AT a permanent level: base effects + every authored upgrade up to `level`.
 *  With no authored upgrades this returns the base effects unchanged (golden-safe). */
export function effectiveGeneEffects(def: CardDef, level: number): CardEffect[] {
  const ups = def.upgrades;
  if (!ups || ups.length === 0 || level <= 0) return def.effects;
  const out = def.effects.slice();
  const cap = Math.min(level, ups.length);
  for (let i = 0; i < cap; i++) out.push(...ups[i].effects);
  return out;
}

/** ONE card's PERMANENT power multiplier — the offense/strength added by its upgrade LEVELS only
 *  (the base effect is temporary, counted when the card is drafted). 1 at level 0. */
export function genePermanentPowerMult(def: CardDef, level: number): number {
  const ups = def.upgrades;
  if (!ups || ups.length === 0 || level <= 0) return 1;
  const delta: CardEffect[] = [];
  const cap = Math.min(level, ups.length);
  for (let i = 0; i < cap; i++) delta.push(...ups[i].effects);
  return effectsPower(delta);
}

/** The WHOLE collection's permanent power multiplier, folded into the account Power Score. LINEAR
 *  aggregation (1 + scale·Σ(perCardMult−1)) so it can't explode as the library grows to hundreds of
 *  cards — the scale-safety the architecture guarantees. 1 when nothing is upgraded. */
export function geneCollectionPowerMult(genes: GeneSave): number {
  let sum = 0;
  for (const id in genes) {
    const def = cardRegistry.get(id);
    if (!def) continue;
    sum += genePermanentPowerMult(def, genes[id].level) - 1;
  }
  return 1 + GENE_POWER_SCALE * sum;
}

/** Coerce arbitrary saved data into a valid, current GeneSave: drop unknown ids, clamp levels to the
 *  card's ceiling, and keep only well-formed numeric fields. Additive-safe (unknown future fields are
 *  ignored, not lost — callers merge). Prevents save manipulation / stale content from corrupting. */
export function sanitizeGeneSave(raw: unknown): GeneSave {
  const out: GeneSave = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const def = cardRegistry.get(id);
    if (!def || !v || typeof v !== 'object') continue; // drop unknown/renamed cards
    const s = v as Record<string, unknown>;
    const level = clampInt(s.level, 0, geneMaxLevel(def));
    const rarityTier = clampInt(s.rarityTier, 0, 99);
    const ascension = clampInt(s.ascension, 0, 99);
    const skin = typeof s.skin === 'string' ? s.skin : undefined;
    const acquiredAt = typeof s.acquiredAt === 'number' && s.acquiredAt >= 0 ? s.acquiredAt : undefined;
    // Persist only meaningful (non-default) state so the map stays sparse.
    if (level > 0 || rarityTier > 0 || ascension > 0 || skin || acquiredAt !== undefined) {
      out[id] = { level, ...(rarityTier ? { rarityTier } : {}), ...(ascension ? { ascension } : {}), ...(skin ? { skin } : {}), ...(acquiredAt !== undefined ? { acquiredAt } : {}) };
    }
  }
  return out;
}

function clampInt(v: unknown, lo: number, hi: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0;
  return Math.max(lo, Math.min(hi, n));
}
