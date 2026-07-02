// Tower Lab DATA model — derives everything a tower panel shows from the existing systems (stars,
// mastery, the star path, card subjects), so the panel itself is pure presentation and the model
// scales to dozens of towers with no new code. Pure: no React/DOM.

import { CARD_POOL, cardSubject } from '../core/cards';
import { STAR, STAR_MILESTONES, TOWER_DEFS, nextEvolutionUnlock, nextStarMutationTier } from '../core/config';
import { MASTERY_RANK_EVERY, masteryRankTitle } from '../core/mastery';
import { forksOf, isFork, stepAt } from '../core/stars';
import type { StarStep } from '../core/stars';
import { evolutionStarCap, highestCampaignStage, masteryProgress, nextStarCost, towerProgress } from '../state/meta';
import type { SaveData } from '../save/saveStore';
import type { TowerKind } from '../core/types';

type TowerStats = ReturnType<typeof towerProgress>[TowerKind];

export interface StepView { star: number; name: string; desc: string; isFork: boolean; ascension?: boolean }
export interface TowerLabModel {
  kind: TowerKind;
  name: string;
  color: string;
  combatClass: string;
  stars: number;
  maxStars: number;
  shards: number;
  cost: number | null; // null = maxed
  affordable: boolean;
  maxed: boolean;
  mastery: { level: number; into: number; need: number; rank: string | null };
  specialization: string; // the ◈3 fork choice once reached, else the combat class
  currentEvolution: string; // the latest named mutation, or "Base Form"
  nextStep: StepView | null; // the very next star (preview)
  nextAbility: StepView | null; // the next star that grants a new attack/ability (may be further)
  stats: { label: string; value: string }[]; // current combat stats (or reactor economy)
  lifetimeKills: number;
  signatureGenes: string[]; // gene cards whose subject is this tower (uses the card-subject system)
  buildPath: string; // the configured fork path, or "Base form"
  milestones: { star: number; reached: boolean }[];
  nextMilestone: number | null;
  // ── Campaign Evolution Cap (docs/EVOLUTION-CAP.md) ──
  evolutionCap: number; // highest star Campaign currently permits
  capLocked: boolean; // the next star is gated by Campaign progress (not shards)
  campaignStage: number; // highest Campaign stage cleared (progress toward the next cap)
  capUnlock: { stage: number; maxStar: number } | null; // the stage that lifts the cap for the next star
  nextVisualMutation: { at: number; name: string; desc: string } | null; // upcoming visual generation
}

/** Resolve a star step's display (forks show the player's chosen option). */
export function stepView(kind: TowerKind, step: StarStep, save: SaveData): StepView {
  if (isFork(step)) {
    const id = save.towerForks[kind]?.[String(step.star)] ?? step.fork[0].id;
    const opt = step.fork.find((o) => o.id === id) ?? step.fork[0];
    return { star: step.star, name: opt.name, desc: opt.desc, isFork: true };
  }
  return { star: step.star, name: step.name, desc: step.desc, isFork: false };
}

/** Does a star step introduce a new ATTACK/ABILITY (vs. targeting/projectile/economy only)? */
export function grantsAbility(kind: TowerKind, step: StarStep, save: SaveData): boolean {
  const grants = isFork(step)
    ? (step.fork.find((o) => o.id === (save.towerForks[kind]?.[String(step.star)] ?? step.fork[0].id)) ?? step.fork[0]).grants
    : step.grants;
  const tagged = !isFork(step) && (step.kind === 'attack' || step.kind === 'capstone');
  return tagged || grants.some((g) => g.t === 'ability');
}

/** What the upgrade CEREMONY reveals for a freshly-reached star (`toStar`). */
export function ceremonyView(save: SaveData, kind: TowerKind, toStar: number): {
  unlocked: StepView | null;
  next: StepView | null;
  milestoneStar: number | null;
} {
  const got = stepAt(kind, toStar);
  const unlocked = got ? stepView(kind, got, save) : null;
  const nextRaw = toStar < STAR.maxTowerStars ? stepAt(kind, toStar + 1) : null;
  const next: StepView | null =
    toStar >= STAR.maxTowerStars
      ? null
      : nextRaw
        ? stepView(kind, nextRaw, save)
        : { star: toStar + 1, name: `Ascension ◈${toStar + 1}`, desc: '', isFork: false, ascension: true };
  return { unlocked, next, milestoneStar: STAR_MILESTONES.includes(toStar) ? toStar : null };
}

export function towerLabModel(save: SaveData, kind: TowerKind, prog: TowerStats): TowerLabModel {
  const def = TOWER_DEFS[kind];
  const stars = save.towerStars[kind] ?? 0;
  const cost = nextStarCost(save, kind);
  const maxed = cost === null;
  const shards = save.towerShards[kind] ?? 0;
  const mp = masteryProgress(save.towerMasteryXp[kind] ?? 0);

  // Latest named mutation ≤ current stars (forks resolve to the chosen option).
  let currentEvolution = 'Base Form';
  for (let s = Math.min(stars, STAR.maxStars); s >= 1; s--) {
    const st = stepAt(kind, s);
    if (st) { currentEvolution = stepView(kind, st, save).name; break; }
  }

  // Specialization = the ◈3 "Specialization" fork choice once reached; otherwise the combat class.
  const specFork = forksOf(kind).find((f) => f.star === 3);
  const specialization =
    specFork && stars >= 3 ? stepView(kind, specFork, save).name : def.combatClass;

  // Next star preview: the authored step if any; past ◈5 it's an ASCENSION power tier.
  const rawNext = maxed ? null : stepAt(kind, stars + 1);
  const nextStep: StepView | null = maxed
    ? null
    : rawNext
      ? stepView(kind, rawNext, save)
      : {
          star: stars + 1,
          name: `Ascension ◈${stars + 1}`,
          desc: `+${Math.round(STAR.damagePerStar * 100)}% damage · +${Math.round(STAR.fireRatePerStar * 100)}% fire rate`,
          isFork: false,
          ascension: true,
        };

  // Next NEW ability unlock (may be several stars out).
  let nextAbility: StepView | null = null;
  for (let s = stars + 1; s <= STAR.maxStars; s++) {
    const st = stepAt(kind, s);
    if (st && grantsAbility(kind, st, save)) { nextAbility = stepView(kind, st, save); break; }
  }

  // Current stats — combat for attackers, economy for the support Reactor.
  const stats: { label: string; value: string }[] = [];
  if (def.firing === 'support') {
    stats.push({ label: 'Biomass', value: `+${Math.round(((prog.reactorBiomassMult ?? 1) - 1) * 100)}%` });
    stats.push({ label: 'Overcharge', value: `+${Math.round((prog.reactorOverchargeBonus ?? 0) * 100)}%` });
    stats.push({ label: 'Aura', value: 'Adjacent' });
  } else {
    const dmg = def.damage * prog.damageMult;
    const rate = def.fireInterval > 0 ? prog.fireRateMult / def.fireInterval : 0;
    stats.push({ label: 'DPS', value: String(Math.round(dmg * rate * (1 + (prog.extraProjectiles ?? 0)))) });
    stats.push({ label: 'Range', value: String(Math.round(def.range * (prog.rangeMult ?? 1))) });
    if (def.splash > 0) stats.push({ label: 'Splash', value: String(Math.round(def.splash * (prog.splashMult ?? 1))) });
    else if (prog.extraProjectiles) stats.push({ label: 'Targets', value: `${1 + prog.extraProjectiles}` });
    else stats.push({ label: 'Cadence', value: `${rate.toFixed(1)}/s` });
  }

  // Signature genes — the gene cards built for this tower (card-subject system).
  const signatureGenes = CARD_POOL
    .filter((c) => { const s = cardSubject(c); return s.kind === 'tower' && s.tower === kind; })
    .map((c) => c.name);

  // Build path — the configured fork choices the player has reached.
  const buildPath =
    forksOf(kind)
      .filter((f) => f.star <= stars)
      .map((f) => stepView(kind, f, save).name)
      .join(' · ') || 'Base form';

  // Campaign Evolution Cap: the next star may be SHARD-affordable yet still gated by Campaign
  // progress (docs/EVOLUTION-CAP.md). capLocked is a distinct state from can't-afford.
  const evolutionCap = evolutionStarCap(save);
  const campaignStage = highestCampaignStage(save);
  const capLocked = !maxed && stars >= evolutionCap;
  const capUnlock = capLocked ? nextEvolutionUnlock(stars) : null;

  return {
    kind,
    name: def.name,
    color: def.color,
    combatClass: def.combatClass,
    stars,
    maxStars: STAR.maxTowerStars,
    shards,
    cost,
    affordable: cost !== null && shards >= cost && !capLocked,
    maxed,
    mastery: { level: mp.level, into: mp.into, need: mp.need, rank: mp.level >= MASTERY_RANK_EVERY ? masteryRankTitle(mp.level) : null },
    specialization,
    currentEvolution,
    nextStep,
    nextAbility,
    stats,
    lifetimeKills: save.towerKills[kind] ?? 0,
    signatureGenes,
    buildPath,
    milestones: STAR_MILESTONES.map((m) => ({ star: m, reached: stars >= m })),
    nextMilestone: STAR_MILESTONES.find((m) => m > stars) ?? null,
    evolutionCap,
    capLocked,
    campaignStage,
    capUnlock,
    nextVisualMutation: maxed ? null : nextStarMutationTier(stars),
  };
}
