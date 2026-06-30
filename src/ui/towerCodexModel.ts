// Tower Codex read-model (docs/TOWER-CODEX.md §3) — derives the encyclopedia's current-form summary
// PLUS every previewable evolutionary stage (stars 1/3/5/7/9) and both branch specializations
// (Tier 1-5), from the existing star / branch / mastery systems. Pure: no React/DOM. A NEW tower
// flows through with zero codex code — it just needs a star path + branches, like every tower.

import { EVOLUTION_CAPS, STAR, TOWER_DEFS } from '../core/config';
import { forksOf, stepAt } from '../core/stars';
import { branchesFor } from '../core/branches';
import { BRANCH_COLOR } from '../render/towerEvolution';
import { MASTERY_RANK_EVERY, masteryRankTitle } from '../core/mastery';
import { evolutionStarCap, masteryProgress } from '../state/meta';
import { grantsAbility, stepView } from './towerLabModel';
import type { SaveData } from '../save/saveStore';
import type { TowerKind } from '../core/types';

/** The star stages the Codex previews (the encyclopedia's "evolutionary stages"). */
export const STAR_PREVIEW_STAGES = [1, 3, 5, 7, 9] as const;

export type StageState = 'owned' | 'reachable' | 'locked';

export interface CodexStage {
  star: number;
  name: string; // the mutation at this star (Base Form / Ascension if none authored)
  desc: string;
  grantsAbility: boolean;
  state: StageState; // vs current stars + the campaign-unlocked cap
  unlockHint: string | null; // when locked by the cap: which campaign milestone opens it
}

export interface CodexTier { tier: number; name: string; desc: string }
export interface CodexBranch { id: string; name: string; theme: string; color: string; tiers: CodexTier[] }

export interface TowerCodex {
  kind: TowerKind;
  name: string;
  color: string;
  combatClass: string;
  stars: number; // current owned stars
  starCap: number; // campaign-unlocked cap
  maxStars: number; // absolute (★10)
  currentBranch: string; // the persistent ★3 specialization, or "Base strain"
  mastery: { level: number; rank: string | null };
  abilities: string[]; // ability-granting star steps owned so far
  stages: CodexStage[]; // the star preview stages
  branches: CodexBranch[]; // both branch specializations, T1-5
}

/** A preview star's status + (when locked) the campaign milestone that unlocks its tier. */
function stageState(star: number, stars: number, cap: number): { state: StageState; unlockHint: string | null } {
  if (star <= stars) return { state: 'owned', unlockHint: null };
  if (star <= cap) return { state: 'reachable', unlockHint: null };
  const row = EVOLUTION_CAPS.find((e) => e.maxStar >= star);
  return { state: 'locked', unlockHint: row ? `Clear Campaign Stage ${row.stage}` : null };
}

export function towerCodex(save: SaveData, kind: TowerKind): TowerCodex {
  const def = TOWER_DEFS[kind];
  const stars = save.towerStars[kind] ?? 0;
  const cap = evolutionStarCap(save); // Campaign Evolution Cap (docs/EVOLUTION-CAP.md)
  const mp = masteryProgress(save.towerMasteryXp[kind] ?? 0);

  // Current branch = the persistent ★3 specialization fork choice, once reached.
  const specFork = forksOf(kind).find((f) => f.star === 3);
  const currentBranch = specFork && stars >= 3 ? stepView(kind, specFork, save).name : 'Base strain';

  // Abilities unlocked so far (ability-granting star steps ≤ current stars).
  const abilities: string[] = [];
  for (let s = 1; s <= Math.min(stars, STAR.maxTowerStars); s++) {
    const st = stepAt(kind, s);
    if (st && grantsAbility(kind, st, save)) abilities.push(stepView(kind, st, save).name);
  }

  // Star preview stages (1/3/5/7/9) — viewable regardless of ownership.
  const stages: CodexStage[] = STAR_PREVIEW_STAGES.map((star): CodexStage => {
    const st = stepAt(kind, star);
    const sv = st ? stepView(kind, st, save) : null;
    const { state, unlockHint } = stageState(star, stars, cap);
    return {
      star,
      name: sv?.name ?? (star <= 5 ? 'Base Form' : `Ascension ★${star}`),
      desc: sv?.desc ?? (star > 5 ? `+${Math.round(STAR.damagePerStar * 100)}% damage & +${Math.round(STAR.fireRatePerStar * 100)}% fire rate per star` : 'The strain in its founding form.'),
      grantsAbility: !!(st && grantsAbility(kind, st, save)),
      state,
      unlockHint,
    };
  });

  // Both branch specializations, T1-5 — the in-run mutation paths, previewable here.
  const branches: CodexBranch[] = branchesFor(kind).map((b): CodexBranch => ({
    id: b.id,
    name: b.name,
    theme: b.theme,
    color: BRANCH_COLOR[b.id] ?? def.color,
    tiers: b.tiers.map((t) => ({ tier: t.tier, name: t.name, desc: t.desc })),
  }));

  return {
    kind,
    name: def.name,
    color: def.color,
    combatClass: def.combatClass,
    stars,
    starCap: cap,
    maxStars: STAR.maxTowerStars,
    currentBranch,
    mastery: { level: mp.level, rank: mp.level >= MASTERY_RANK_EVERY ? masteryRankTitle(mp.level) : null },
    abilities,
    stages,
    branches,
  };
}
