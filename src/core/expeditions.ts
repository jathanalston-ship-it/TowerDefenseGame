// HERO EXPEDITIONS (docs/EXPEDITIONS.md) — the idle lane: BENCHED heroes (owned but not
// fielded in the run loadout) go on real-time away-missions and come back carrying
// resources. Pure data + arithmetic here; meta owns the save ledger and the claims.
//
// TIME DISCIPLINE: durations are wall-clock milliseconds stored as absolute endsAt
// timestamps — offline-safe (nothing ticks; a claim just compares now to endsAt), and
// every meta API takes `now` for testability. The SIM never sees any of this.
//
// DEPTH MODEL (the overhaul): every mission carries a CLASS AFFINITY (a matching-class
// hero forages +25%) and a RISK tier (Safe / Risky / Perilous — riskier roads roll
// claim-time WINDFALLS and SETBACKS). Claims can also surface a RARE FIND (a bonus
// bundle; chance scales with hours + risk), and each mission builds permanent MASTERY
// (+2% per completion, capped) in the save's per-mission ledger. All rolls are
// DETERMINISTIC — hashed from `defId:hero:endsAt`, never stored, never Math.random —
// so claims replay identically offline, in tests, and across reloads.

import { hashStr } from './hash';
import type { CombatClass } from './types';

export interface ExpeditionReward {
  cores: number; // Genome Cores
  essence: number; // Gene Essence
  mats: { mutagen: number; scrap: number; catalyst: number };
}

export type ExpeditionOutcome = 'setback' | 'standard' | 'windfall';

/** A risk tier: the odds and payoff of each claim-time outcome band. */
export interface RiskTier {
  name: string;
  blurb: string;
  windfall: number; // chance of a windfall claim
  setback: number; // chance of a setback claim
  windfallMult: number;
  setbackMult: number;
}

/** Safe roads pay the sheet; risky roads gamble it. EV rises with tier (the risk premium),
 *  and setbacks only shrink the haul — an expedition never returns empty-handed. */
export const RISK_TIERS: RiskTier[] = [
  { name: 'Safe', blurb: 'Pays the sheet.', windfall: 0, setback: 0, windfallMult: 1, setbackMult: 1 },
  { name: 'Risky', blurb: 'Chance of a windfall — or a lean return.', windfall: 0.25, setback: 0.1, windfallMult: 1.5, setbackMult: 0.7 },
  { name: 'Perilous', blurb: 'Boom or bust. The deep roads pay double — sometimes.', windfall: 0.3, setback: 0.25, windfallMult: 2, setbackMult: 0.5 },
];

export interface ExpeditionDef {
  id: string;
  name: string;
  blurb: string;
  hours: number; // real-time length
  risk: 0 | 1 | 2; // index into RISK_TIERS
  affinity: CombatClass; // a matching-class hero forages +AFFINITY_MULT
  reward: ExpeditionReward; // BASE payout — multiplied by the claim-time stack
}

/** The mission board — session errands through day-long hauls, each with a class it
 *  favors and a reward lane it leans into. Rewards scale ~linearly with hours plus a
 *  patience premium on the long roads and a risk premium on the dangerous ones. */
export const EXPEDITION_DEFS: ExpeditionDef[] = [
  {
    id: 'exp_patrol', name: 'Perimeter Patrol', hours: 2, risk: 0, affinity: 'Kinetic',
    blurb: 'Sweep the near ruins for splice-worthy tissue. Quick, safe, modest.',
    reward: { cores: 30, essence: 40, mats: { mutagen: 2, scrap: 4, catalyst: 0 } },
  },
  {
    id: 'exp_vents', name: 'Vent Skim', hours: 3, risk: 1, affinity: 'Caustic',
    blurb: 'Trawl the chemical vents while they weep. Rich mutagen — if the fumes allow.',
    reward: { cores: 45, essence: 60, mats: { mutagen: 7, scrap: 4, catalyst: 0 } },
  },
  {
    id: 'exp_signal', name: 'Whisper Signal', hours: 4, risk: 0, affinity: 'Neural',
    blurb: 'Follow a dying transmitter to its hoard. Slow, quiet, essence-sweet.',
    reward: { cores: 55, essence: 95, mats: { mutagen: 3, scrap: 6, catalyst: 1 } },
  },
  {
    id: 'exp_harvest', name: 'Deep Harvest', hours: 6, risk: 0, affinity: 'Vital',
    blurb: 'Follow the vein-lines under the old city and bring back what still pulses.',
    reward: { cores: 110, essence: 150, mats: { mutagen: 8, scrap: 14, catalyst: 1 } },
  },
  {
    id: 'exp_hunt', name: 'Apex Hunt', hours: 8, risk: 2, affinity: 'Viral',
    blurb: 'Stalk something big enough to matter. The genome bounty is huge — when it works.',
    reward: { cores: 190, essence: 170, mats: { mutagen: 9, scrap: 16, catalyst: 2 } },
  },
  {
    id: 'exp_relic', name: 'Relic Descent', hours: 12, risk: 1, affinity: 'Neural',
    blurb: 'A day in the dark. The deepest strata pay in catalyst and old genome.',
    reward: { cores: 260, essence: 340, mats: { mutagen: 18, scrap: 30, catalyst: 4 } },
  },
  {
    id: 'exp_graveyard', name: 'Titan Graveyard', hours: 16, risk: 2, affinity: 'Kinetic',
    blurb: 'Strip the fallen colossi bone by bone. The longest road, the heaviest haul.',
    reward: { cores: 340, essence: 430, mats: { mutagen: 22, scrap: 52, catalyst: 7 } },
  },
];

/** Concurrent away-missions the hive can support. */
export const EXPEDITION_SLOTS = 3;

/** Reward-multiplier knobs (the claim-time stack — see expeditionMult). */
export const STAR_BONUS = 0.1; // +10% per hero star
export const AFFINITY_MULT = 1.25; // class-matched hero
export const MASTERY_PER_RUN = 0.02; // +2% per prior completion of the mission…
export const MASTERY_CAP_RUNS = 10; // …capped at +20%

export function expeditionById(id: string): ExpeditionDef | undefined {
  return EXPEDITION_DEFS.find((d) => d.id === id);
}

/** Mastery bonus for a mission completed `runs` times before (capped). */
export function masteryBonus(runs: number): number {
  return MASTERY_PER_RUN * Math.max(0, Math.min(MASTERY_CAP_RUNS, Math.floor(runs)));
}

/** The deterministic pre-roll multiplier stack: stars × affinity × mastery.
 *  The risk outcome (expeditionOutcome) multiplies on top of this at claim time. */
export function expeditionMult(stars: number, affinity: boolean, masteryRuns: number): number {
  return (1 + STAR_BONUS * Math.max(0, stars)) * (affinity ? AFFINITY_MULT : 1) * (1 + masteryBonus(masteryRuns));
}

/** Scale a base bundle by a multiplier (rounded per lane). */
export function scaleReward(base: ExpeditionReward, mult: number): ExpeditionReward {
  return {
    cores: Math.round(base.cores * mult),
    essence: Math.round(base.essence * mult),
    mats: {
      mutagen: Math.round(base.mats.mutagen * mult),
      scrap: Math.round(base.mats.scrap * mult),
      catalyst: Math.round(base.mats.catalyst * mult),
    },
  };
}

/** Fold two bundles (a claim + its rare find). */
export function sumRewards(a: ExpeditionReward, b: ExpeditionReward): ExpeditionReward {
  return {
    cores: a.cores + b.cores,
    essence: a.essence + b.essence,
    mats: {
      mutagen: a.mats.mutagen + b.mats.mutagen,
      scrap: a.mats.scrap + b.mats.scrap,
      catalyst: a.mats.catalyst + b.mats.catalyst,
    },
  };
}

/** The identity of one live mission — everything a claim-time roll hashes over. */
export interface ExpeditionTicket { defId: string; hero: string; endsAt: number }

/** Deterministic 0..1 roll for a mission — salted so outcome/find/pick draws differ. */
function roll01(t: ExpeditionTicket, salt: string): number {
  return hashStr(`${salt}:${t.defId}:${t.hero}:${t.endsAt}`) / 4294967296;
}

/** Resolve the mission's RISK outcome — pure and replayable (nothing is stored). */
export function expeditionOutcome(t: ExpeditionTicket): { kind: ExpeditionOutcome; mult: number } {
  const tier = RISK_TIERS[expeditionById(t.defId)?.risk ?? 0];
  const r = roll01(t, 'outcome');
  if (r < tier.windfall) return { kind: 'windfall', mult: tier.windfallMult };
  if (r < tier.windfall + tier.setback) return { kind: 'setback', mult: tier.setbackMult };
  return { kind: 'standard', mult: 1 };
}

/** A rare find: a flat bonus bundle stapled onto a lucky claim. */
export interface RareFind {
  id: string;
  name: string;
  blurb: string;
  reward: ExpeditionReward;
}

export const RARE_FINDS: RareFind[] = [
  {
    id: 'find_gene_cache', name: 'Sealed Gene Cache',
    blurb: 'A pre-fall vault of viable genome, still cold.',
    reward: { cores: 150, essence: 0, mats: { mutagen: 0, scrap: 0, catalyst: 0 } },
  },
  {
    id: 'find_essence_bloom', name: 'Essence Bloom',
    blurb: 'A living seam of raw essence, harvested whole.',
    reward: { cores: 0, essence: 220, mats: { mutagen: 0, scrap: 0, catalyst: 0 } },
  },
  {
    id: 'find_catalyst_geode', name: 'Catalyst Geode',
    blurb: 'Cracked open on the road — crystalline catalyst inside.',
    reward: { cores: 0, essence: 0, mats: { mutagen: 0, scrap: 0, catalyst: 6 } },
  },
  {
    id: 'find_titanplate', name: 'Titanplate Cache',
    blurb: 'Armor plate stripped from something enormous and dead.',
    reward: { cores: 0, essence: 0, mats: { mutagen: 10, scrap: 40, catalyst: 0 } },
  },
];

/** Rare-find odds: longer + riskier roads find more (capped at 35%). */
export function rareFindChance(def: ExpeditionDef): number {
  return Math.min(0.35, 0.05 + 0.01 * def.hours + 0.06 * def.risk);
}

/** Roll the claim's rare find — deterministic, or null (the common case). */
export function rollRareFind(t: ExpeditionTicket): RareFind | null {
  const def = expeditionById(t.defId);
  if (!def) return null;
  if (roll01(t, 'find') >= rareFindChance(def)) return null;
  return RARE_FINDS[hashStr(`pick:${t.defId}:${t.hero}:${t.endsAt}`) % RARE_FINDS.length];
}
