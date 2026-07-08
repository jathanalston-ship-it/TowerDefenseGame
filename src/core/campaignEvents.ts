// CAMPAIGN EVENTS (docs/CAMPAIGN-EVENTS.md) — the authoring SEAM the procedural campaign was missing.
// generateStage is otherwise pure stat-scaling: every stage is the same board with bigger numbers.
// This registry lets specific stages carry an AUTHORED identity — an Elite Rush, a Boss Gauntlet, a
// Genome Cache, or a Mutation choice — sampled deterministically from (stage, difficulty). It is a
// DATA registry, not a mode: a new event archetype is one CAMPAIGN_EVENTS row.
//
// Discipline (mirrors runEvents.ts): events LAYER ON. The sampler uses a DEDICATED seed stream, and
// the transform (campaign.ts `applyCampaignEvent`) writes only to separate StageConfig.event fields
// (+ the group elite flags / bossWaves / startBiomass levers the sim already consumes) — it never
// mutates the base scaling / rewardMult curve, so the smooth-progression invariants stay intact.
// Golden-safe: only campaign/daily call generateStage; the golden autoplay passes no stage at all.

import { Rng } from './rng';
import { hashStr } from './hash';
import { CAMPAIGN_REWARDS } from './config';
import { campaignBossFor } from './boss';
import type { CardEffect } from './cards';

export type CampaignEventKind = 'eliteRush' | 'gauntlet' | 'cache' | 'mutation';

/** One option of a Mutation event's A/B choice — a run-scoped boon expressed as run effects. */
export interface CampaignBoon {
  id: string;
  name: string;
  desc: string;
  effects: CardEffect[]; // folded into the run's global run-effects at launch (App)
}

/** An authored campaign-stage archetype. Lever knobs are optional; each rides an EXISTING sim lever
 *  (see campaign.ts `applyCampaignEvent`) so no new sim consumption is invented. */
export interface CampaignEventDef {
  id: string;
  kind: CampaignEventKind;
  name: string;   // telegraph / map-node title
  desc: string;   // telegraph line
  icon: string;   // a single glyph for the map node + mission card
  accent: string; // node / telegraph colour
  weight: number; // sampling weight among eligible defs
  minStage: number; // earliest stage it may appear
  // ── lever knobs (all optional) ──
  eliteMult?: number;        // eliteRush: multiply the displayed eliteFrequency (clamped to the cap)
  elitePromote?: number;     // eliteRush: per-group chance to force-promote a composed group to elite
  gauntletBosses?: number;   // gauntlet: extra mid-stage bosses (spawned through StageConfig.bossWaves)
  gauntletTierFrac?: number; // gauntlet: each extra boss's tier = stage × this (default 0.45)
  rewardMult?: number;       // cache/gauntlet: end-of-run reward × — an EVENT stamp, never the base curve
  startBiomassBonus?: number;// cache: extra opening Biomass (rides the existing startBiomass lever)
  boons?: CampaignBoon[];    // mutation: the A/B choice offered before the stage
}

/** The resolved, display-ready stamp placed on StageConfig.event and CampaignMapNode.event. Carries
 *  only what consumers (renderer, App payout, mission card) need — the mechanical wave/boss levers
 *  have already been folded into the StageConfig by the time this stamp exists. */
export interface CampaignEventStamp {
  id: string;
  kind: CampaignEventKind;
  name: string;
  desc: string;
  icon: string;
  accent: string;
  rewardMult?: number;     // App folds this into result.rewardMult at run end (cache/gauntlet payout)
  boons?: CampaignBoon[];  // mutation options — the mission card renders the choice
}

// ── Registry — spans all four archetypes; extend by adding a row ─────────────────────────────────
export const CAMPAIGN_EVENTS: CampaignEventDef[] = [
  // Elite Rush — a wall of champions. Fewer-but-stronger packs (the standard elite economy) + richer pay.
  { id: 'elite_rush', kind: 'eliteRush', name: 'Elite Rush', icon: '✦', accent: '#ff5d73', weight: 10, minStage: 4,
    desc: 'A vanguard of champions floods the lane — most packs arrive elite.',
    eliteMult: 1.8, elitePromote: 0.5, rewardMult: 1.25 },
  { id: 'apex_pack', kind: 'eliteRush', name: 'Apex Pack', icon: '✦', accent: '#ff3d5c', weight: 6, minStage: 12,
    desc: 'An apex swarm — nearly every organism is a hardened elite.',
    eliteMult: 2.0, elitePromote: 0.65, rewardMult: 1.35 },

  // Boss Gauntlet — reuses the Daily per-wave boss lever (StageConfig.bossWaves) as a campaign set-piece.
  { id: 'boss_gauntlet', kind: 'gauntlet', name: 'Boss Gauntlet', icon: '⚔', accent: '#ffb03d', weight: 8, minStage: 6,
    desc: 'Champion organisms anchor mid-stage waves — a run of bosses, not just the finale.',
    gauntletBosses: 2, gauntletTierFrac: 0.45, rewardMult: 1.45 },
  { id: 'the_triad', kind: 'gauntlet', name: 'The Triad', icon: '⚔', accent: '#ff9a2d', weight: 5, minStage: 16,
    desc: 'Three champions stalk the descent before the finale even wakes.',
    gauntletBosses: 3, gauntletTierFrac: 0.5, rewardMult: 1.7 },

  // Genome Cache — a reward stage: a fat opening economy + a rich end-of-run payout.
  { id: 'genome_cache', kind: 'cache', name: 'Genome Cache', icon: '❖', accent: '#ffd24d', weight: 9, minStage: 5,
    desc: 'A biomass-gorged vault — a fat opening economy and a rich haul on clear.',
    rewardMult: 1.8, startBiomassBonus: 140 },
  { id: 'mother_lode', kind: 'cache', name: 'Mother Lode', icon: '❖', accent: '#ffe066', weight: 5, minStage: 12,
    desc: 'A colossal cache — overflowing biomass and the run\'s richest payout.',
    rewardMult: 2.3, startBiomassBonus: 220 },

  // Mutation — the authored CHOICE set-piece: pick one run-scoped boon before deploying.
  { id: 'adaptive_strain', kind: 'mutation', name: 'Adaptive Strain', icon: '⬡', accent: '#c98bff', weight: 9, minStage: 4,
    desc: 'The colony offers an adaptation — choose how your defense mutates for this stage.',
    boons: [
      { id: 'ferocity', name: 'Ferocity', desc: '+25% tower damage all run.', effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.25 }] },
      { id: 'alacrity', name: 'Alacrity', desc: '+25% tower fire rate all run.', effects: [{ op: 'mul', field: 'towerFireRateMult', value: 1.25 }] },
    ] },
  { id: 'symbiotic_bloom', kind: 'mutation', name: 'Symbiotic Bloom', icon: '⬡', accent: '#b57bff', weight: 7, minStage: 8,
    desc: 'A symbiotic surge — feed the champions, or feed the economy.',
    boons: [
      { id: 'vigor', name: 'Vigor', desc: '+30% hero damage, −15% ability cooldown.', effects: [{ op: 'mul', field: 'heroDamageMult', value: 1.3 }, { op: 'mul', field: 'heroCooldownMult', value: 0.85 }] },
      { id: 'harvest', name: 'Harvest', desc: '+40% biomass from kills.', effects: [{ op: 'mul', field: 'biomassMult', value: 1.4 }] },
    ] },
  { id: 'volatile_mutagen', kind: 'mutation', name: 'Volatile Mutagen', icon: '⬡', accent: '#d18bff', weight: 6, minStage: 14,
    desc: 'An unstable mutagen — go wide, or go deep.',
    boons: [
      { id: 'overload', name: 'Overload', desc: '+40% splash radius, +10% tower damage.', effects: [{ op: 'mul', field: 'splashRadiusMult', value: 1.4 }, { op: 'mul', field: 'towerDamageMult', value: 1.1 }] },
      { id: 'foundation', name: 'Foundation', desc: '+1 tower emplacement for this run.', effects: [{ op: 'add', field: 'bonusTowerSlots', value: 1 }] },
    ] },
];

const EVENT_SALT = 0x43455654; // 'CEVT' — a dedicated seed stream, decoupled from the stage's own rng
const MIN_EVENT_STAGE = 4; // stages 1–3 stay clean onboarding (also keeps the stage-1 baseline pristine)
const EVENT_CHANCE = 0.34; // ~1 in 3 ELIGIBLE stages carries an authored event — punctuation, not noise

/** Deterministic per-(stage,difficulty) seed for the event stream (independent of generateStage's rng). */
function eventSeed(stage: number, difficultyId: string): number {
  return (Math.imul(stage >>> 0, 2654435761) ^ hashStr(difficultyId) ^ EVENT_SALT) >>> 0;
}

/** Whether a stage may host an authored event: past the onboarding floor, and NOT a milestone or an
 *  authored-boss stage (those are already hand-crafted set-pieces — an event would clash / double up). */
export function campaignEventEligible(stage: number): boolean {
  const st = Math.floor(stage);
  if (st < MIN_EVENT_STAGE) return false;
  if (st % CAMPAIGN_REWARDS.milestoneEvery === 0) return false;
  if (campaignBossFor(st)) return false;
  return true;
}

/** The authored event a stage carries, or null (most stages). Pure + deterministic in (stage,diff). */
export function campaignEventForStage(stage: number, difficultyId = 'standard'): CampaignEventDef | null {
  const st = Math.floor(stage);
  if (!campaignEventEligible(st)) return null;
  const rng = new Rng(eventSeed(st, difficultyId));
  if (!rng.chance(EVENT_CHANCE)) return null;
  const eligible = CAMPAIGN_EVENTS.filter((e) => st >= e.minStage);
  if (eligible.length === 0) return null;
  return rng.pickWeighted(eligible.map((e) => [e, e.weight] as const));
}

/** The display-ready stamp for a def (mechanical levers are folded separately by campaign.ts). */
export function campaignEventStamp(def: CampaignEventDef): CampaignEventStamp {
  return {
    id: def.id, kind: def.kind, name: def.name, desc: def.desc, icon: def.icon, accent: def.accent,
    ...(def.rewardMult !== undefined ? { rewardMult: def.rewardMult } : {}),
    ...(def.boons ? { boons: def.boons } : {}),
  };
}

/** Resolve a mutation event's chosen boon: the picked option, else the first (the default). */
export function resolveCampaignBoon(boons: CampaignBoon[] | undefined, boonId?: string): CampaignBoon | null {
  if (!boons || boons.length === 0) return null;
  return boons.find((b) => b.id === boonId) ?? boons[0];
}
