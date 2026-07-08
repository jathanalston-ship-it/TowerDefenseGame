// FIELD RESEARCH (docs/RESEARCH.md) — the OPTIONAL rewarded-ad lane, themed as the hive
// studying corporate specimens: a player may "review field studies" (watch a rewarded ad in
// provider builds) for a small daily accelerator. Design law, enforced by tests:
//   • never mandatory, never optimal — total daily value is a small fraction of one normal run;
//   • never interrupts play — offered ONLY in non-combat menus, never auto-played;
//   • Ichor stays a trickle (flat, never scaled) — it supplements the store, never replaces it;
//   • money-adjacent truths stay elsewhere: this system grants through the SAME interpreter as
//     the Premium Store, so every cap/safeguard there applies here too.
//
// Everything is DATA on a registry: a future holiday/event/creator reward is one
// ResearchRewardDef row (optionally windowed), zero engine changes.

import { Registry } from './registry';
import { hashStr } from './hash';
import type { PremiumGrant } from './premium';

// ── Config (docs/RESEARCH.md §limits) ─────────────────────────────────────────
export const RESEARCH = {
  /** Daily claim caps per category pool (UTC day). */
  pools: { sample: 5, boost: 2, specimen: 1, stamina: 1, emergency: 1 } as Record<ResearchCategory, number>,
  /** Ichor is additionally capped on its own — the premium trickle never widens. */
  ichorDailyCap: 2,
  /** Progression scaling clamp for sample amounts (docs/RESEARCH.md §scaling). */
  scaleMin: 1,
  scaleMax: 8,
  /** The specimen container upgrades to RARE on ~1 day in 5 (deterministic per day —
   *  reloading can't reroll it; never epic+: high rarity stays a drop-luck moment). */
  specimenRareOdds: 5,
} as const;

export type ResearchCategory = 'sample' | 'boost' | 'specimen' | 'stamina' | 'emergency';

/** A one-run boost armed by a claim and consumed by the NEXT finished run
 *  (meta.finishRun folds + clears; the biomass lever folds at metaModifiers). */
export interface ResearchBoost {
  towerXpMult?: number;
  heroXpMult?: number;
  coresMult?: number;
  biomassMult?: number;
}

export interface ResearchRewardDef {
  id: string;
  category: ResearchCategory;
  name: string;
  blurb: string; // the in-fiction pitch line
  icon: string;
  accent: string; // CSS color token/value for the card
  /** Per-reward daily cap INSIDE its category pool (default: the pool cap). */
  dailyCap?: number;
  /** Mode gate — hidden until the mode is unlocked (evaluated meta-side). */
  requires?: 'bossRush' | 'daily';
  /** Optional availability window (inclusive ISO dates, UTC) — holiday/event/promo rows. */
  window?: { from: string; to: string };
  /** Grant payload for sample/specimen/stamina/emergency rewards; `scale` is the
   *  progression multiplier (≥1). Flows through meta.interpretGrants — the Premium
   *  Store pipeline — so every store safeguard applies. */
  grants?: (scale: number) => PremiumGrant[];
  /** Boost payload for 'boost' rewards. */
  boost?: ResearchBoost;
}

export const researchRegistry = new Registry<ResearchRewardDef>('researchReward', {
  idOf: (d) => d.id,
  validate: (d) => {
    const out: string[] = [];
    if (!d.grants && !d.boost) out.push('a reward must grant something or arm a boost');
    if (d.grants && d.boost) out.push('grant XOR boost — one payload per reward');
    if (d.category === 'boost' && !d.boost) out.push("category 'boost' needs a boost payload");
    if (d.boost) {
      for (const v of Object.values(d.boost)) {
        if (typeof v === 'number' && (v < 1 || v > 1.25)) out.push('boost multipliers stay within [1, 1.25] (accelerator, never a power spike)');
      }
    }
    if (d.grants) {
      // The premium trickle is law: no single claim may exceed 3 Ichor at ANY scale.
      for (const scale of [1, RESEARCH.scaleMax]) {
        for (const g of d.grants(scale)) {
          if (g.grant === 'ichor' && g.qty > 3) out.push('ichor per claim must stay ≤ 3 (docs/RESEARCH.md §premium)');
        }
      }
    }
    return out;
  },
});

/** UTC day key (YYYY-MM-DD) — same identity core/daily.ts uses, kept local so this
 *  module stays lean (no stage-generator import chain). */
export function researchDayKey(now?: Date): string {
  return (now ?? new Date()).toISOString().slice(0, 10);
}

/** Progression scaling for sample amounts: campaign depth + prestige + collection keep
 *  the payouts USEFUL all game long without ever outpacing play (clamped). Ichor is
 *  deliberately excluded — it never scales. */
export function researchScale(input: { stage: number; molts: number; collectionFrac: number }): number {
  const raw = 1 + input.stage * 0.05 + input.molts * 0.25 + Math.max(0, Math.min(1, input.collectionFrac)) * 1.5;
  return Math.min(RESEARCH.scaleMax, Math.max(RESEARCH.scaleMin, raw));
}

/** Deterministic per-day specimen rarity (no reroll-scumming): rare on ~1 day in N. */
export function specimenRarity(dayKey: string): 'common' | 'rare' {
  return hashStr('specimen:' + dayKey) % RESEARCH.specimenRareOdds === 0 ? 'rare' : 'common';
}

// ── The launch catalog ────────────────────────────────────────────────────────
// CATEGORY A — small resources (5 pooled claims/day; scaled by progression).
const SAMPLES: ResearchRewardDef[] = [
  {
    id: 'core_sample', category: 'sample', name: 'Core Sample', icon: '⬡', accent: 'var(--gold)',
    blurb: 'Sequence a captured specimen — its genome pays in Cores.',
    grants: (s) => [{ grant: 'cores', qty: Math.round(14 * s) }],
  },
  {
    id: 'mat_harvest', category: 'sample', name: 'Tissue Harvest', icon: '⚒', accent: 'var(--caustic)',
    blurb: 'Strip a carcass for crafting stock.',
    grants: (s) => [{ grant: 'mats', mutagen: Math.round(1 * s), scrap: Math.round(3 * s), catalyst: Math.max(1, Math.round(0.5 * s)) }],
  },
  {
    id: 'essence_extract', category: 'sample', name: 'Essence Extraction', icon: '⌬', accent: 'var(--viral)',
    blurb: 'Distill gene essence from field remains.',
    grants: (s) => [{ grant: 'geneEssence', qty: Math.round(8 * s) }],
  },
  {
    id: 'ichor_trace', category: 'sample', name: 'Ichor Trace', icon: '◆', accent: 'var(--vital)',
    dailyCap: RESEARCH.ichorDailyCap, // its own hard cap inside the pool
    blurb: 'A black-market contact pays for surveillance footage. Barely.',
    grants: () => [{ grant: 'ichor', qty: 1 }], // FLAT forever — the premium trickle never scales
  },
];

// CATEGORY B — one-run boosts (2/day). All fold meta-side (docs/RESEARCH.md §boosts).
const BOOSTS: ResearchRewardDef[] = [
  {
    id: 'mastery_focus', category: 'boost', name: 'Mastery Focus', icon: '✦', accent: 'var(--kinetic)',
    blurb: 'Field notes sharpen the strain: +10% Tower Mastery XP next run.',
    boost: { towerXpMult: 1.1 },
  },
  {
    id: 'apex_observation', category: 'boost', name: 'Apex Observation', icon: '✷', accent: 'var(--vital)',
    blurb: 'Study the champions at work: +15% Hero XP next run.',
    boost: { heroXpMult: 1.15 },
  },
  {
    id: 'specimen_bounty', category: 'boost', name: 'Specimen Bounty', icon: '⬢', accent: 'var(--gold)',
    blurb: 'A standing contract on samples: +10% Genome Cores from the next run.',
    boost: { coresMult: 1.1 },
  },
  {
    id: 'nutrient_wash', category: 'boost', name: 'Nutrient Wash', icon: '❋', accent: 'var(--caustic)',
    blurb: 'Pre-digested feedstock: +5% Biomass generation next run.',
    boost: { biomassMult: 1.05 },
  },
];

// CATEGORY C — one container/day; rarity is a deterministic day roll, never epic+.
const SPECIMEN: ResearchRewardDef = {
  id: 'sealed_specimen', category: 'specimen', name: 'Sealed Specimen', icon: '◈', accent: 'var(--r-rare, #7fd0ff)',
  blurb: 'A recovered containment pod — crack it in the Genetic Vault.',
  grants: () => [{ grant: 'container', rarity: 'common', count: 1 }], // rarity upgraded per-day in meta
};

// CATEGORY D — small Boss Rush stamina refill, once/day, gated on the mode.
const STAMINA: ResearchRewardDef = {
  id: 'stamina_infusion', category: 'stamina', name: 'Stamina Infusion', icon: '☠', accent: 'var(--danger, #ff4d6d)',
  requires: 'bossRush',
  blurb: 'Adrenal extract for the gauntlet: +10 Rush Stamina.',
  grants: () => [{ grant: 'rushStamina', qty: 10 }],
};

// CATEGORY E — the once-daily EMERGENCY PROTOCOL: the player picks ONE.
export type EmergencyPick = 'ichor' | 'container' | 'cores' | 'boost';
export const EMERGENCY_PICKS: { pick: EmergencyPick; name: string; blurb: string; icon: string }[] = [
  { pick: 'ichor', name: 'Ichor Payout', blurb: '3 Ichor, no questions asked.', icon: '◆' },
  { pick: 'container', name: 'Recovered Pod', blurb: 'One Bio-Container for the Vault.', icon: '◈' },
  { pick: 'cores', name: 'Core Bundle', blurb: 'A doubled Core Sample payout.', icon: '⬡' },
  { pick: 'boost', name: 'Mastery Focus', blurb: 'Arm a +10% Tower Mastery XP boost.', icon: '✦' },
];
const EMERGENCY: ResearchRewardDef = {
  id: 'emergency_protocol', category: 'emergency', name: 'Emergency Protocol', icon: '⚠', accent: 'var(--gold)',
  blurb: 'Once a day, the hive liquidates a study on YOUR terms — choose the payout.',
  // The payload is resolved from the player's pick at claim time (meta.claimResearch);
  // this base payload is the fallback and the validator's non-empty witness.
  grants: (s) => [{ grant: 'cores', qty: Math.round(28 * s) }],
};

export const RESEARCH_REWARDS: ResearchRewardDef[] = [...SAMPLES, ...BOOSTS, SPECIMEN, STAMINA, EMERGENCY];
researchRegistry.registerAll(RESEARCH_REWARDS);

export function researchRewardById(id: string): ResearchRewardDef | undefined {
  return researchRegistry.get(id);
}

/** The rows live on `key` (windowed rows = events/holidays/promos; absent window = always). */
export function activeResearchRewards(key: string): ResearchRewardDef[] {
  return researchRegistry.active().filter((d) => !d.window || (d.window.from <= key && key <= d.window.to));
}
