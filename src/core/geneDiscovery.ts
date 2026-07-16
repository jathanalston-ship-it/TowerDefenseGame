// GENE CARD DISCOVERY (docs/CARDS.md §discovery, docs/GENE-EVOLUTION.md §discovery) — the
// collection layer that turns the card catalog into DISCOVER → COLLECT → UPGRADE → TRANSCEND:
//
//   • Every card belongs to one of FIVE rarities (common/uncommon/rare/epic/legendary — the
//     CardRarity union). Rarity drives drop weights, visuals, essence costs, and excitement.
//   • A fresh account owns the STARTER_GENES (auto-discovered — they teach the system);
//     every OTHER card must be DISCOVERED from a Bio-Container before it can be drafted
//     or upgraded. Containers roll the discovery lane on open (state/meta.openContainer).
//   • Card rarities enter the drop pool on CAMPAIGN milestones (poolStageByCardRarity),
//     and a card's own `unlock` gate must ALSO be met — discovery never leaks a card the
//     account hasn't earned the right to meet.
//   • DUPLICATE PROTECTION: undiscovered cards carry a weight multiplier that starts heavy
//     and fades to ×1 as archive completion rises. A roll that still lands on an
//     already-discovered card pays a small Gene Essence ECHO instead (never a dead pull).
//
// Pure + rng-injected (meta passes Math.random; sims pass a seeded rng). The deterministic
// sim never calls this — draft pools inside a run are decided at LAUNCH (RunOptions.draftPool),
// so the golden path is untouched by construction. Zero per-card code: a future card gets
// discovery, gating, hints, and weighting purely from its def (rarity + unlock + subject).

import { CARD_POOL, cardRegistry } from './cards';
import type { CardDef } from './cards';
import { TOWER_DEFS } from './config';
import type { CardRarity } from './types';

// ── Tunables (docs/CARDS.md §discovery — every number lives here; sims sweep them) ──────
export const GENE_DISCOVERY = {
  /** Chance a container's open rolls the discovery lane at all, by CONTAINER rarity id
   *  (loot rarities; unknown ids fall back to `common`). Additive lane — never replaces
   *  a guaranteed reward. */
  chanceByContainer: {
    common: 0.16, uncommon: 0.22, rare: 0.28, epic: 0.42, legendary: 0.58, exotic: 0.7,
  } as Record<string, number>,
  /** Campaign stage at which each CARD rarity enters the drop pool (spec: pools unlock on
   *  campaign milestones; per-card `unlock` gates still apply on top). */
  poolStageByCardRarity: { common: 0, uncommon: 8, rare: 15, epic: 30, legendary: 60 } as Record<CardRarity, number>,
  /** Per-card draw weight inside the discovery roll, by CARD rarity. */
  dropWeightByCardRarity: { common: 60, uncommon: 40, rare: 24, epic: 8, legendary: 2 } as Record<CardRarity, number>,
  /** Duplicate protection: undiscovered cards weigh ×(1 + boost·(1−completion)) — ×8 on an
   *  empty archive, fading to ×1 as the collection completes (spec: generous, never a
   *  guaranteed instant completion). */
  undiscoveredBoost: 7,
  /** Gene Essence paid when the roll lands on an already-discovered card (the ECHO — a
   *  dupe is never a dead pull), by the CARD's rarity. Small next to upgrade costs. */
  echoEssenceByCardRarity: { common: 6, uncommon: 9, rare: 14, epic: 24, legendary: 40 } as Record<CardRarity, number>,
} as const;

/** The starter archive (docs/CARDS.md §starters): auto-discovered on every account — a
 *  deliberately wide teaching set (tower damage/rate, poison, crit, economy, hive defense,
 *  reactor economy, hero stats) drawn from the UNGATED commons, so the fresh draft pool
 *  the tutorial teaches is exactly what a new account owns. 10–20 by design contract. */
export const STARTER_GENES: readonly string[] = [
  'twin_fang', // the signature Needle Spitter opener
  'sharpened_needles', 'rapid_glands', // global tower damage / fire rate
  'caustic_edge', 'corroded_fangs', 'toxic_coating', // the poison lane
  'fracture_point', // crit / status synergy
  'biomass_surge', 'bonemeal', 'fertile_decay', // economy
  'hardened_carapace', 'thick_marrow', // hive defense
  'engorged_reactor', // reactor economy
  'battle_stims', 'fleet_step', 'thick_hide', // the hero axes
];

/** Whether a card's RARITY pool is open at this campaign stage. */
export function rarityPoolOpen(rarity: CardRarity, campaignStage: number): boolean {
  return campaignStage >= (GENE_DISCOVERY.poolStageByCardRarity[rarity] ?? 0);
}

/** Every card currently ELIGIBLE for discovery: its rarity pool is open AND its own unlock
 *  gate is met (`unlockMet` — meta passes the earned set; ungated cards always qualify).
 *  Starters are eligible too (they matter for migration seeding, not for rolling — the
 *  discovered filter handles that at roll time). */
export function eligibleDiscoveries(campaignStage: number, unlockMet: ReadonlySet<string>): CardDef[] {
  return cardRegistry.active().filter((c) =>
    rarityPoolOpen(c.rarity, campaignStage) && (!c.unlock || unlockMet.has(c.id)));
}

/** Archive completion 0..1 over the whole catalog (drives duplicate-protection fade). */
export function archiveCompletion(discovered: ReadonlySet<string>): number {
  const total = cardRegistry.active().length;
  return total > 0 ? Math.min(1, discovered.size / total) : 0;
}

export type GeneDiscoveryRoll =
  | { kind: 'discover'; card: CardDef } // a brand-new strand — the celebration
  | { kind: 'echo'; card: CardDef; essence: number } // landed on a known strand → essence echo
  | null; // the lane didn't fire (or nothing is eligible yet)

/** Roll ONE container's gene-discovery lane. Pure given `rng`; meta applies the result
 *  (extend genesDiscovered / grant the echo essence) and pushes the reveal item. */
export function rollGeneDiscovery(
  rng: () => number,
  containerRarity: string,
  campaignStage: number,
  unlockMet: ReadonlySet<string>,
  discovered: ReadonlySet<string>,
): GeneDiscoveryRoll {
  const chance = GENE_DISCOVERY.chanceByContainer[containerRarity] ?? GENE_DISCOVERY.chanceByContainer.common;
  if (rng() >= chance) return null;
  const pool = eligibleDiscoveries(campaignStage, unlockMet);
  if (pool.length === 0) return null;
  const boost = 1 + GENE_DISCOVERY.undiscoveredBoost * (1 - archiveCompletion(discovered));
  let total = 0;
  const weights = pool.map((c) => {
    const w = (GENE_DISCOVERY.dropWeightByCardRarity[c.rarity] ?? 1) * (discovered.has(c.id) ? 1 : boost);
    total += w;
    return w;
  });
  let u = rng() * total;
  let picked = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) {
    u -= weights[i];
    if (u < 0) { picked = pool[i]; break; }
  }
  if (discovered.has(picked.id)) {
    return { kind: 'echo', card: picked, essence: GENE_DISCOVERY.echoEssenceByCardRarity[picked.rarity] ?? 6 };
  }
  return { kind: 'discover', card: picked };
}

/** The Archive's DISCOVERY HINT for an undiscovered card — derived entirely from the def,
 *  so every future card gets an honest, specific hint with zero authoring. */
export function discoveryHint(def: CardDef, campaignStage: number): string {
  const stage = GENE_DISCOVERY.poolStageByCardRarity[def.rarity] ?? 0;
  if (campaignStage < stage) return `Pool sealed — clear Campaign Stage ${stage}`;
  if (def.unlock) {
    switch (def.unlock.kind) {
      case 'campaignStage': return campaignStage < def.unlock.stage ? `Clear Campaign Stage ${def.unlock.stage}` : 'Recovered from Bio-Containers';
      case 'bestWave': return `Reach Depth ${def.unlock.wave} in any run`;
      case 'towerUnlocked': return `Requires the ${TOWER_DEFS[def.unlock.tower]?.name ?? def.unlock.tower} strain`;
      case 'totalRuns': return `Survive ${def.unlock.runs} assimilation runs`;
      case 'lifetimeKills': return `Cull ${def.unlock.kills.toLocaleString()} organisms`;
      case 'bossesSlain': return `Slay ${def.unlock.bosses} distinct bosses`;
      case 'totalBiomass': return `Harvest ${def.unlock.biomass.toLocaleString()} biomass`;
    }
  }
  return 'Recovered from Bio-Containers';
}

/** Content guardrails — swept by tests so a future card/profile tweak that breaks the
 *  discovery contract fails the build, not the player. */
export function geneDiscoveryProblems(): string[] {
  const out: string[] = [];
  const ids = new Set(CARD_POOL.map((c) => c.id));
  if (STARTER_GENES.length < 10 || STARTER_GENES.length > 20) out.push(`starter set must hold 10–20 cards (has ${STARTER_GENES.length})`);
  const seen = new Set<string>();
  const cats = new Set<string>();
  for (const id of STARTER_GENES) {
    if (!ids.has(id)) out.push(`starter '${id}' is not a registered card`);
    if (seen.has(id)) out.push(`starter '${id}' listed twice`);
    seen.add(id);
    const def = CARD_POOL.find((c) => c.id === id);
    if (def?.unlock) out.push(`starter '${id}' is progression-gated — starters must be ungated`);
    if (def) cats.add(def.category);
  }
  if (cats.size < 4) out.push(`starters must span ≥4 categories for mechanic variety (span ${cats.size})`);
  for (const [r, s] of Object.entries(GENE_DISCOVERY.poolStageByCardRarity)) {
    if (s < 0) out.push(`pool stage for ${r} is negative`);
  }
  // The rarity ladder must open in order — a higher tier can never unlock before a lower one.
  const ladder: CardRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  for (let i = 1; i < ladder.length; i++) {
    if (GENE_DISCOVERY.poolStageByCardRarity[ladder[i]] < GENE_DISCOVERY.poolStageByCardRarity[ladder[i - 1]]) {
      out.push(`pool stages out of order: ${ladder[i]} opens before ${ladder[i - 1]}`);
    }
  }
  for (const c of CARD_POOL) {
    if (!(c.rarity in GENE_DISCOVERY.dropWeightByCardRarity)) out.push(`card '${c.id}' has unweighted rarity '${c.rarity}'`);
  }
  return out;
}
