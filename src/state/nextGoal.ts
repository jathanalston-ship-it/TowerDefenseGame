// The Next-Goal engine (docs/ONE-MORE-RUN.md) — the anticipation spine. A pure read-model that
// scans every progression meter in the save and returns the imminent rewards RANKED closest-to-done,
// so any screen the player might quit from can show "you're almost at X." One source of truth for the
// Home NEXT banner, the "coming up" rail, and the Results cliffhanger ("1 run from …").
//
// Pure over SaveData (no DOM/sim), same shape as the other state read-models. Deliberately imports
// the existing derivations rather than re-deriving costs/gates — and is NEVER imported by meta.ts
// (one-way), so there is no cycle.

import type { SaveData } from '../save/saveStore';
import { highestCampaignStage } from '../save/derive';
import { clamp01 } from '../core/math';
import { TOWER_DEFS, HERO_DEFS, HERO_SLOTS, STAR } from '../core/config';
import { prestigeStageReq } from '../core/prestige';
import { collectionView } from '../core/collection';
import { cardRegistry } from '../core/cards';
import { GENE_LEVEL_GATES, geneLevel, geneLevelCapForStage, geneMaxLevel } from '../core/geneCards';
import {
  heroCollection, towerStarCost, nextHeroStarCost, evolutionStarCap, heroSlotsUnlocked,
  collectionContextOf,
} from './meta';
import { nextReveals } from './unlocks';

/** One imminent reward the player is close to earning. `progress` is 0..1 toward it. */
export interface NextGoal {
  id: string;
  kind: 'hero-release' | 'evolution' | 'prestige' | 'collection' | 'campaign-gate' | 'reveal';
  label: string; // the thing you're about to get, e.g. "Release Shepherd"
  remaining: string; // how far, e.g. "18 Apex Genome" / "2 stages"
  reward: string; // one-line preview of the payoff
  progress: number; // 0..1 (only 0 < p < 1 goals are surfaced)
  nav: string; // Hub nav key to jump to it
  color: string;
}

/** Scan the save and rank every imminent reward closest-to-done first (capped). */
export function nextGoals(save: SaveData, limit = 6): NextGoal[] {
  const goals: NextGoal[] = [];

  // ── Hero Release (locked heroes accumulating Apex Genome) ──
  for (const e of heroCollection(save)) {
    if (e.unlocked || e.requirement) continue; // milestone-gated heroes (Vitriol) are EARNED, not released with Shards
    goals.push({
      id: `release:${e.kind}`, kind: 'hero-release',
      label: `Release ${e.name}`,
      remaining: e.canUnlock ? 'Ready now' : `${Math.max(0, e.cost - e.shards)} Apex Genome`,
      reward: `Unlock the ${HERO_DEFS[e.kind].combatClass} champion`,
      progress: e.canUnlock ? 1 : clamp01(e.progress),
      nav: 'heroes', color: e.color,
    });
  }

  // ── Next Evolution (per strain / champion) — the closest shard-funded tier under the cap ──
  const cap = evolutionStarCap(save);
  let bestTower: NextGoal | null = null;
  for (const k of Object.keys(TOWER_DEFS) as (keyof typeof TOWER_DEFS)[]) {
    const stars = save.towerStars[k] ?? 0;
    if (stars >= STAR.maxTowerStars || stars >= cap) continue; // maxed or gated → not a shard goal
    const cost = towerStarCost(stars);
    const have = save.towerShards[k] ?? 0;
    const p = clamp01(have / cost);
    if (p <= 0 || p >= 1) continue;
    const g: NextGoal = {
      id: `evo:tower:${k}`, kind: 'evolution',
      label: `${TOWER_DEFS[k].name} — Evolution ${stars + 1}`,
      remaining: `${Math.max(0, cost - have)} Strain Samples`,
      reward: 'A new divergent mutation to splice',
      progress: p, nav: 'towers', color: TOWER_DEFS[k].color,
    };
    if (!bestTower || p > bestTower.progress) bestTower = g;
  }
  if (bestTower) goals.push(bestTower);

  let bestHero: NextGoal | null = null;
  for (const k of Object.keys(HERO_DEFS) as (keyof typeof HERO_DEFS)[]) {
    const cost = nextHeroStarCost(save, k);
    if (cost === null) continue;
    const have = save.heroShards[k] ?? 0;
    const p = clamp01(have / cost);
    if (p <= 0 || p >= 1) continue;
    const g: NextGoal = {
      id: `evo:hero:${k}`, kind: 'evolution',
      label: `${HERO_DEFS[k].name} — Evolution ${(save.heroStars[k] ?? 0) + 1}`,
      remaining: `${Math.max(0, cost - have)} Apex Genome`,
      reward: 'A new champion mutation',
      progress: p, nav: 'heroes', color: HERO_DEFS[k].color,
    };
    if (!bestHero || p > bestHero.progress) bestHero = g;
  }
  if (bestHero) goals.push(bestHero);

  // ── MOLT readiness (Campaign depth toward the next prestige) ──
  const molts = save.prestige?.molts ?? 0;
  const req = prestigeStageReq(molts);
  const stage = highestCampaignStage(save);
  if (req > 0 && stage < req) {
    goals.push({
      id: 'prestige', kind: 'prestige',
      label: molts === 0 ? 'First MOLT' : `MOLT ${molts + 1}`,
      remaining: `${req - stage} Campaign ${req - stage === 1 ? 'stage' : 'stages'}`,
      reward: 'Shed & Ascend — a permanent compounding strain',
      progress: clamp01(stage / req), nav: 'evolution', color: 'var(--viral)',
    });
  }

  // ── Campaign gate — the next Symbiosis (hero) slot ──
  const slots = heroSlotsUnlocked(save);
  const nextSlot = HERO_SLOTS[slots]; // the first still-locked slot (0-indexed)
  if (nextSlot && nextSlot.campaignStage > stage) {
    goals.push({
      id: `slot:${nextSlot.slot}`, kind: 'campaign-gate',
      label: `${nextSlot.name} (Slot ${nextSlot.slot})`,
      remaining: `${nextSlot.campaignStage - stage} Campaign ${nextSlot.campaignStage - stage === 1 ? 'stage' : 'stages'}`,
      reward: 'Field another champion at once',
      progress: clamp01(stage / nextSlot.campaignStage), nav: 'campaign', color: 'var(--r-epic)',
    });
  }

  // ── Campaign gate — the next GLOBAL gene-level unlock (docs/GENE-EVOLUTION.md §Gates). Surfaced
  //    exactly when it BITES: at least one owned card is parked at the current cap with deeper
  //    authored levels waiting — the player has something real to unlock. ──
  const geneCap = geneLevelCapForStage(stage);
  const geneGate = GENE_LEVEL_GATES.find((g) => g.stage > stage);
  if (geneGate) {
    const ownedSet = new Set(save.genesDiscovered ?? []);
    let blocked = 0;
    for (const c of cardRegistry.active()) {
      if (ownedSet.has(c.id) && geneLevel(save.genes, c.id) >= geneCap && geneMaxLevel(c) > geneCap) blocked++;
    }
    if (blocked > 0) {
      goals.push({
        id: `gene-gate:${geneGate.level}`, kind: 'campaign-gate',
        label: `Gene Level ${geneGate.level} unlock`,
        remaining: `${geneGate.stage - stage} Campaign ${geneGate.stage - stage === 1 ? 'stage' : 'stages'}`,
        reward: `${blocked} gene card${blocked > 1 ? 's' : ''} ready to evolve deeper`,
        progress: clamp01(stage / geneGate.stage), nav: 'genes', color: 'var(--caustic)',
      });
    }
  }

  // ── Collection (Assimilation Archive completion) ──
  const codex = collectionView(collectionContextOf(save));
  if (codex.total > 0 && codex.discovered < codex.total) {
    const left = codex.total - codex.discovered;
    goals.push({
      id: 'collection', kind: 'collection',
      label: 'Assimilation Archive',
      remaining: `${left} ${left === 1 ? 'specimen' : 'specimens'}`,
      reward: 'Collection completion reward',
      progress: clamp01(codex.discovered / codex.total), nav: 'collection', color: 'var(--gold)',
    });
  }

  // ── Feature reveal — the next SCREEN the progression-gating framework will open
  //    (docs/PROGRESSION-GATING.md): a whole new system is itself the reward. ──
  for (const v of nextReveals(save, 1)) {
    if (v.progress <= 0) continue; // untouched gates rank as noise; teasers in the nav cover them
    goals.push({
      id: `reveal:${v.def.id}`, kind: 'reveal',
      label: `Unlock the ${v.def.name}`,
      remaining: v.label,
      reward: v.def.blurb,
      progress: v.progress, nav: 'campaign', color: 'var(--viral)',
    });
  }

  // Closest-to-done first; ties broken by kind priority (a near unlock beats a near collection).
  const KIND_RANK: Record<NextGoal['kind'], number> = { 'hero-release': 0, evolution: 1, reveal: 2, 'campaign-gate': 3, prestige: 4, collection: 5 };
  return goals
    .sort((a, b) => b.progress - a.progress || KIND_RANK[a.kind] - KIND_RANK[b.kind])
    .slice(0, limit);
}
