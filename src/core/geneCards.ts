// Gene Cards — permanent progression layer (docs/GENE-EVOLUTION.md). The DEFINITION of a card lives
// in cards.ts (CardDef, static, data-driven). This module owns the PERMANENT per-card player STATE
// (level / rarity-tier / ascension / skin), the save shape + sanitizer, and the pure seams the rest
// of the game reads through:
//   • effectiveGeneEffects(def, level)  — the card's effects AT a permanent level (base + upgrades)
//   • genePermanentPowerMult(def, level) — that card's PERMANENT power contribution (upgrades only)
//   • geneCollectionPowerMult(genes)     — the whole collection's permanent power (scale-safe)
// ARCHITECTURE ONLY: no upgrade CONTENT is authored here (Task 4) — with the current empty `upgrades`
// arrays every seam is a no-op, so existing gameplay + the golden run are byte-identical. No DOM/state.

import { cardRegistry, CARD_RARITY_LADDER } from './cards';
import type { CardDef, CardEffect } from './cards';
import type { CardRarity } from './types';
import { effectsPower } from './power';

/** PERMANENT per-card player state (saved, sparse — only non-default cards get an entry). */
export interface GeneCardSave {
  level: number; // permanent upgrade level (0 = base). Campaign-gated ceiling (GENE_LEVEL_GATES).
  rarityTier?: number; // rarity-UPGRADE tier above the card's base rarity (0 = base). Backend (Task 10).
  ascension?: number; // ascension tier (0 = none). Backend only — NO gameplay (Task 10).
  skin?: string; // equipped skin id (future artwork).
  acquiredAt?: number; // ms timestamp of first acquisition (drives "recently acquired" sort).
  upgradedAt?: number; // ms timestamp of the last level purchase (drives "recently improved" sort).
  favorite?: boolean; // player-starred (sorts ahead of the rest; a collection gesture).
  pinned?: boolean; // player-pinned (always first in the Archive, before favorites).
}

// ── Campaign gates (docs/GENE-EVOLUTION.md §Gates) — gene LEVELS unlock GLOBALLY at campaign
//    milestones: L1 immediately, deeper levels as the campaign advances. Data — rebalance = edit rows.
//    The Archive always SHOWS a locked level's requirement (never hides it).
export const GENE_LEVEL_GATES: { level: number; stage: number }[] = [
  { level: 1, stage: 0 },
  { level: 2, stage: 15 },
  { level: 3, stage: 30 },
  { level: 4, stage: 50 },
  { level: 5, stage: 75 },
];

/** The globally-unlocked gene level ceiling at a campaign stage (level 1 from the start). */
export function geneLevelCapForStage(stage: number): number {
  let cap = 0;
  for (const g of GENE_LEVEL_GATES) if (stage >= g.stage) cap = Math.max(cap, g.level);
  return cap;
}

/** The campaign stage required to buy `level` (0 = ungated; beyond the table ⇒ the last gate). */
export function geneGateForLevel(level: number): number {
  const g = GENE_LEVEL_GATES.find((x) => x.level === level);
  return g ? g.stage : GENE_LEVEL_GATES[GENE_LEVEL_GATES.length - 1].stage;
}

/** The permanent gene map: card id → its state. Absent id ⇒ base (level 0). Ownership is tracked
 *  separately via stats.uniqueCards (the collection), so this map stays sparse. */
export type GeneSave = Record<string, GeneCardSave>;

export const DEFAULT_GENE_STATE: Readonly<GeneCardSave> = { level: 0 };

/** How strongly permanent gene upgrades move the account Power Score. LINEAR in the number of
 *  upgrades (see geneCollectionPowerMult) so it stays sane at 500+ cards. RE-CALIBRATED as the
 *  library grew: the 80-card library's per-card deltas now sum to ≈15.18 fully maxed, so 0.098 puts
 *  a completed library at ≈×2.49 on the meta bucket — a major pillar (comparable to stars/prestige),
 *  not a runaway dominator; a mid-game third of the library reads ≈×1.5. Re-measure when the library
 *  grows again (geneArchive.test pins the ×2–2.6 band). */
export const GENE_POWER_SCALE = 0.098;

/** The permanent upgrade ceiling for a card (base-only = 1 until Task 4 authors levels). */
export function geneMaxLevel(def: CardDef): number {
  return Math.max(1, def.maxLevel ?? 1);
}

/** The card's permanent level from the save (0 if unleveled/unowned). */
export function geneLevel(genes: GeneSave, id: string): number {
  return genes[id]?.level ?? 0;
}

/** The card's effects AT a permanent level: base effects + every authored upgrade up to `level`,
 *  plus every authored ASCENSION tier up to `ascension` (Task 10 backend — no tiers are authored
 *  and no save can reach tier > 0 yet, so today the third argument is always a no-op).
 *  With nothing authored this returns the base effects unchanged (golden-safe). */
export function effectiveGeneEffects(def: CardDef, level: number, ascension = 0): CardEffect[] {
  const ups = def.upgrades;
  const tiers = ascension > 0 ? def.ascension?.tiers : undefined;
  if ((!ups || ups.length === 0 || level <= 0) && !tiers) return def.effects;
  const out = def.effects.slice();
  if (ups && level > 0) {
    const cap = Math.min(level, ups.length);
    for (let i = 0; i < cap; i++) out.push(...ups[i].effects);
  }
  if (tiers) {
    const cap = Math.min(ascension, tiers.length);
    for (let i = 0; i < cap; i++) out.push(...(tiers[i].effects ?? []));
  }
  return out;
}

// ── Ascension backend seams (Task 10) — pure reads over the AUTHORED tier data. No gameplay
//    consumes these yet: no grant path exists, no tiers are authored, and the sanitizer clamps
//    saved tiers to the authored ceiling (0 today). When Ascension ships, gameplay wires
//    effectiveGeneEffects(def, level, tier) at the run seams — Power ALREADY counts it below. ──

/** The card's ascension ceiling (0 = not ascendable — nothing authored). */
export function geneAscensionMaxTier(def: CardDef): number {
  return Math.max(0, def.ascension?.maxTier ?? 0);
}

/** ONE card's ascension power multiplier — the strength added by its ascended tiers only. */
export function geneAscensionPowerMult(def: CardDef, tier: number): number {
  const tiers = def.ascension?.tiers;
  if (!tiers || tiers.length === 0 || tier <= 0) return 1;
  const delta: CardEffect[] = [];
  const cap = Math.min(tier, tiers.length);
  for (let i = 0; i < cap; i++) delta.push(...(tiers[i].effects ?? []));
  return effectsPower(delta);
}

/** The card's EFFECTIVE rarity: base, stepped up the ladder by future rarity upgrades
 *  (`rarityTier`), then raised further by an authored ascended-rarity override if higher. */
export function geneEffectiveRarity(def: CardDef, state?: GeneCardSave): CardRarity {
  let idx = Math.max(0, CARD_RARITY_LADDER.indexOf(def.rarity));
  idx = Math.min(CARD_RARITY_LADDER.length - 1, idx + (state?.rarityTier ?? 0));
  const tiers = def.ascension?.tiers;
  const tier = state?.ascension ?? 0;
  if (tiers && tier > 0) {
    const cap = Math.min(tier, tiers.length);
    for (let i = 0; i < cap; i++) {
      const r = tiers[i].rarity;
      if (r) idx = Math.max(idx, CARD_RARITY_LADDER.indexOf(r));
    }
  }
  return CARD_RARITY_LADDER[idx];
}

/** The card's artwork key for the renderer: equipped skin → deepest ascended art at the saved
 *  tier → base art → undefined (procedural fallback, GeneCardArt). The future-UI resolution seam. */
export function geneArtKey(def: CardDef, state?: GeneCardSave): string | undefined {
  if (state?.skin) {
    const skin = def.skins?.find((s) => s.id === state.skin);
    if (skin?.art) return skin.art;
  }
  const tiers = def.ascension?.tiers;
  const tier = state?.ascension ?? 0;
  if (tiers && tier > 0) {
    for (let i = Math.min(tier, tiers.length) - 1; i >= 0; i--) {
      if (tiers[i].art) return tiers[i].art;
    }
  }
  return def.art;
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
    // Ascension folds into the SAME linear sum (Task 10) — a no-op today (no tiers authored, no
    // save reaches tier > 0), but the moment Ascension ships, Power counts it with no extra wire.
    sum += geneAscensionPowerMult(def, genes[id].ascension ?? 0) - 1;
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
    // Future-state fields clamp to what CURRENT content authors (like `level`): rarityTier can't
    // step past the ladder top; ascension can't exceed the card's authored tier count (0 today) —
    // so save manipulation can't fabricate progression that content doesn't define.
    const rarityTier = clampInt(s.rarityTier, 0, CARD_RARITY_LADDER.length - 1 - Math.max(0, CARD_RARITY_LADDER.indexOf(def.rarity)));
    const ascension = clampInt(s.ascension, 0, geneAscensionMaxTier(def));
    const skin = typeof s.skin === 'string' ? s.skin : undefined;
    const acquiredAt = typeof s.acquiredAt === 'number' && s.acquiredAt >= 0 ? s.acquiredAt : undefined;
    const upgradedAt = typeof s.upgradedAt === 'number' && s.upgradedAt >= 0 ? s.upgradedAt : undefined;
    const favorite = s.favorite === true;
    const pinned = s.pinned === true;
    // Persist only meaningful (non-default) state so the map stays sparse.
    if (level > 0 || rarityTier > 0 || ascension > 0 || skin || acquiredAt !== undefined || upgradedAt !== undefined || favorite || pinned) {
      out[id] = { level, ...(rarityTier ? { rarityTier } : {}), ...(ascension ? { ascension } : {}), ...(skin ? { skin } : {}), ...(acquiredAt !== undefined ? { acquiredAt } : {}), ...(upgradedAt !== undefined ? { upgradedAt } : {}), ...(favorite ? { favorite } : {}), ...(pinned ? { pinned } : {}) };
    }
  }
  return out;
}

function clampInt(v: unknown, lo: number, hi: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0;
  return Math.max(lo, Math.min(hi, n));
}
