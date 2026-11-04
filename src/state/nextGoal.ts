// The Next-Goal engine (docs/ONE-MORE-RUN.md) — the anticipation spine. A pure read-model that
// scans every progression meter in the save and returns the imminent rewards RANKED by an HONEST
// run ETA (§eta: every goal kind turns its remaining amount into runs at the player's LIVE income —
// state/income.ts), so any screen the player might quit from can show what is genuinely next. One
// source of truth for Mission Control's ledger, the Campaign rail and the Results cliffhanger
// (which may only say "one more run" when the ETA really is ≤ 2 runs).
//
// Pure over SaveData (no DOM/sim), same shape as the other state read-models. Deliberately imports
// the existing derivations rather than re-deriving costs/gates — and is NEVER imported by meta.ts
// (one-way), so there is no cycle.

import type { SaveData } from '../save/saveStore';
import { highestCampaignStage } from '../save/derive';
import { clamp01 } from '../core/math';
import { TOWER_DEFS, HERO_DEFS, HERO_SLOTS, STAR } from '../core/config';
import { PRESTIGE, prestigeStageReq, shardsForCells } from '../core/prestige';
import { ascendantBonuses } from '../core/ascendant';
import { vowYieldProduct } from '../core/vows';
import { collectionView } from '../core/collection';
import { cardRegistry } from '../core/cards';
import { GENE_LEVEL_GATES, geneLevel, geneLevelCapForStage, geneMaxLevel } from '../core/geneCards';
import {
  heroCollection, towerStarCost, nextHeroStarCost, evolutionStarCap, heroSlotsUnlocked,
  collectionContextOf, accountPowerParts,
} from './meta';
import { composePower } from '../core/power';
import { isOpenNav, nextReveals } from './unlocks';
import type { UnlockCondition } from './unlocks';
import { INCOME, etaLabel, runsToGain, runsToStage } from './income';
import { ladderGoals } from './achievements';

/** One imminent reward the player is close to earning. `progress` is 0..1 toward it. */
export interface NextGoal {
  id: string;
  kind: 'hero-release' | 'evolution' | 'prestige' | 'collection' | 'campaign-gate' | 'reveal' | 'achievement';
  label: string; // the thing you're about to get, e.g. "Release Shepherd"
  remaining: string; // how far, e.g. "18 Apex Genome" / "2 stages"
  reward: string; // one-line preview of the payoff
  progress: number; // 0..1 (only 0 < p < 1 goals are surfaced)
  nav: string; // Hub nav key to jump to it
  color: string;
  /** §eta: runs until it lands at the LIVE income (0 = ready now, ∞ = nothing flowing yet). */
  etaRuns: number;
  /** The same ETA in player words ("next run", "~14 runs", "a long road"). */
  eta: string;
}

type GoalDraft = Omit<NextGoal, 'eta'>;

/** Runs until a reveal condition holds — the stage/runs backbone is simulatable; resource-luck
 *  branches have no ETA of their own (an `any` takes its fastest branch). */
function conditionEta(save: SaveData, c: UnlockCondition, live: number): number {
  switch (c.kind) {
    case 'always': return 0;
    case 'runs': return Math.max(0, c.runs - save.totalRuns);
    case 'stage': return runsToStage(save, c.stage, live);
    case 'any': return Math.min(Infinity, ...c.of.map((x) => conditionEta(save, x, live)));
    default: return Infinity;
  }
}

/** Scan the save and rank every imminent reward by its honest ETA, nearest first (capped). */
export function nextGoals(save: SaveData, limit = 6): NextGoal[] {
  const goals: GoalDraft[] = [];
  const live = composePower(accountPowerParts(save)).score; // stage ETAs gate on LIVE Power (a post-Molt trough is real)

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
      etaRuns: e.canUnlock ? 0 : runsToGain(save, `apex:${e.kind}`, e.cost - e.shards),
    });
  }

  // ── Next Evolution (per strain / champion) — the closest shard-funded tier under the cap ──
  const cap = evolutionStarCap(save);
  let bestTower: GoalDraft | null = null;
  for (const k of Object.keys(TOWER_DEFS) as (keyof typeof TOWER_DEFS)[]) {
    const stars = save.towerStars[k] ?? 0;
    if (stars >= STAR.maxTowerStars || stars >= cap) continue; // maxed or gated → not a shard goal
    const cost = towerStarCost(stars);
    const have = save.towerShards[k] ?? 0;
    const p = clamp01(have / cost);
    if (p <= 0 || p >= 1) continue;
    const g: GoalDraft = {
      id: `evo:tower:${k}`, kind: 'evolution',
      label: `${TOWER_DEFS[k].name} — Evolution ${stars + 1}`,
      remaining: `${Math.max(0, cost - have)} Strain Samples`,
      reward: 'A new divergent mutation to splice',
      progress: p, nav: 'towers', color: TOWER_DEFS[k].color,
      etaRuns: runsToGain(save, `strain:${k}`, cost - have),
    };
    // The NEAREST evolution (by ETA at this strain's own income; progress breaks ties).
    if (!bestTower || g.etaRuns < bestTower.etaRuns || (g.etaRuns === bestTower.etaRuns && p > bestTower.progress)) bestTower = g;
  }
  if (bestTower) goals.push(bestTower);

  let bestHero: GoalDraft | null = null;
  for (const k of Object.keys(HERO_DEFS) as (keyof typeof HERO_DEFS)[]) {
    const cost = nextHeroStarCost(save, k);
    if (cost === null) continue;
    const have = save.heroShards[k] ?? 0;
    const p = clamp01(have / cost);
    if (p <= 0 || p >= 1) continue;
    const g: GoalDraft = {
      id: `evo:hero:${k}`, kind: 'evolution',
      label: `${HERO_DEFS[k].name} — Evolution ${(save.heroStars[k] ?? 0) + 1}`,
      remaining: `${Math.max(0, cost - have)} Apex Genome`,
      reward: 'A new champion mutation',
      progress: p, nav: 'heroes', color: HERO_DEFS[k].color,
      etaRuns: runsToGain(save, `apex:${k}`, cost - have),
    };
    if (!bestHero || g.etaRuns < bestHero.etaRuns || (g.etaRuns === bestHero.etaRuns && p > bestHero.progress)) bestHero = g;
  }
  if (bestHero) goals.push(bestHero);

  // ── MOLT (§eta): BOTH gates — the Ascendant Cells this cycle has minted (the dominant late
  //    milestone: cycle Genome Cores toward the first offerable mint, after the Ascendant
  //    Resonance + vow multipliers) and the Campaign depth. The ETA is the slower gate's; a ready
  //    Molt surfaces as "ready now" (it outranks everything — the chamber is waiting). ──
  const molts = save.prestige?.molts ?? 0;
  const req = prestigeStageReq(molts);
  const stage = highestCampaignStage(save);
  {
    const gainMult = Math.max(1e-9, ascendantBonuses(save.prestige?.nodes ?? {}).cellGainMult * vowYieldProduct(save.prestige?.vows ?? []));
    const mintNeed = shardsForCells(Math.ceil(PRESTIGE.molt.minCells / gainMult - 1e-9));
    const cycle = save.prestige?.cycleShards ?? 0;
    const coresLeft = Math.max(0, mintNeed - cycle);
    const stagesLeft = Math.max(0, req - stage);
    const parts: string[] = [];
    if (coresLeft > 0) parts.push(`${coresLeft.toLocaleString('en-US')} Genome Cores to mint`);
    if (stagesLeft > 0) parts.push(`${stagesLeft} Campaign ${stagesLeft === 1 ? 'stage' : 'stages'}`);
    goals.push({
      id: `prestige:${molts + 1}`, kind: 'prestige', // one goal per Molt — the next one is a NEW milestone
      label: molts === 0 ? 'First MOLT' : `MOLT ${molts + 1}`,
      remaining: parts.length > 0 ? parts.join(' · ') : 'Ready now',
      reward: 'Shed & Ascend — a permanent compounding strain',
      progress: Math.min(clamp01(cycle / Math.max(1, mintNeed)), req > 0 ? clamp01(stage / req) : 1),
      nav: 'evolution', color: 'var(--viral)',
      etaRuns: Math.max(runsToGain(save, 'runCores', coresLeft), runsToStage(save, req, live)), // the mint counts RUN Cores only
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
      etaRuns: runsToStage(save, nextSlot.campaignStage, live),
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
        etaRuns: runsToStage(save, geneGate.stage, live),
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
      etaRuns: runsToGain(save, 'specimens', left),
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
      etaRuns: conditionEta(save, v.def.condition, live),
    });
  }

  // ── Achievement LADDERS (docs/PROGRESSION-SYSTEMS.md §ladders) — the generated tiered families
  //    keep a goal on the board at every depth. ONE entry: the nearest rung by ETA on its own
  //    lifetime meter (a dozen ladders must never crowd out the real milestones). ──
  let bestLadder: GoalDraft | null = null;
  for (const l of ladderGoals(save)) {
    const g: GoalDraft = {
      id: `ladder:${l.family}`, kind: 'achievement',
      label: l.name, remaining: l.remaining, reward: l.reward,
      progress: l.progress, nav: 'profile', color: 'var(--r-rare)',
      etaRuns: runsToGain(save, l.meter, l.need),
    };
    if (!bestLadder || g.etaRuns < bestLadder.etaRuns || (g.etaRuns === bestLadder.etaRuns && g.progress > bestLadder.progress)) bestLadder = g;
  }
  if (bestLadder && bestLadder.etaRuns <= INCOME.ladderGoalRuns) goals.push(bestLadder);

  // §eta: NEAREST first — by honest run ETA at the live income; ties by progress, then kind
  // priority (a near unlock beats a near collection). Raw progress alone overpromised: a 90%-full
  // bar can be 48 hours away. A goal whose destination is still sealed never surfaces (never
  // advise a locked wing) — the `reveal` goal already phrases the next sealed wing as the goal.
  const KIND_RANK: Record<NextGoal['kind'], number> = { 'hero-release': 0, evolution: 1, reveal: 2, prestige: 3, 'campaign-gate': 4, achievement: 5, collection: 6 };
  return goals
    .filter((g) => isOpenNav(save, g.nav))
    .sort((a, b) => a.etaRuns - b.etaRuns || b.progress - a.progress || KIND_RANK[a.kind] - KIND_RANK[b.kind])
    .slice(0, limit)
    .map((g) => ({ ...g, eta: etaLabel(g.etaRuns) }));
}
