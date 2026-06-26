// Configurable targeting framework. Combat is UNCHANGED — only *which* enemy a tower
// picks is now a data-driven profile, so a new tower just sets `targeting` instead of
// hand-rolling a sort. The default 'closestToBase' reproduces the historical behavior
// (sort by goal distance), so existing towers — and the golden runs — are byte-identical.
//
// Pure + deterministic: every comparator is a total order over the in-range list; only
// 'random' consumes the (deterministic) sim rng, and no shipping tower uses it.

import type { Enemy } from './types';

export type TargetingProfile =
  | 'closestToBase' // default — historical behavior (deepest toward the line first)
  | 'nearest' // closest to the tower
  | 'farthest' // farthest from the tower (still in range)
  | 'highestHealth'
  | 'lowestHealth'
  | 'bossPriority' // framework bosses first, then closest to base
  | 'elitePriority' // director-promoted elites first, then closest to base
  | 'fastest'
  | 'mostCorrupted' // heaviest status load (corrosion + infection + disrupt + fracture)
  | 'random';

export interface TargetingCtx {
  tx: number; // tower x
  ty: number; // tower y
  goalDistance: (x: number, y: number) => number; // lower = closer to the base/line
  rng: () => number; // deterministic; only 'random' consumes it
}

export const TARGETING_LABELS: Record<TargetingProfile, string> = {
  closestToBase: 'Closest to Base',
  nearest: 'Nearest',
  farthest: 'Farthest',
  highestHealth: 'Highest Health',
  lowestHealth: 'Lowest Health',
  bossPriority: 'Boss Priority',
  elitePriority: 'Elite Priority',
  fastest: 'Fastest',
  mostCorrupted: 'Most Corrupted',
  random: 'Random',
};

function d2(e: Enemy, ctx: TargetingCtx): number {
  const dx = e.x - ctx.tx;
  const dy = e.y - ctx.ty;
  return dx * dx + dy * dy;
}
function corruption(e: Enemy): number {
  return e.corrosion + e.infection + e.disrupt + e.fracture;
}
const flag = (b: boolean): number => (b ? 1 : 0);

/** Sort `list` in place so the BEST targets for `profile` come first; caller slices N. */
export function sortByProfile(list: Enemy[], profile: TargetingProfile, ctx: TargetingCtx): void {
  switch (profile) {
    case 'closestToBase':
      list.sort((a, b) => ctx.goalDistance(a.x, a.y) - ctx.goalDistance(b.x, b.y));
      return;
    case 'nearest':
      list.sort((a, b) => d2(a, ctx) - d2(b, ctx));
      return;
    case 'farthest':
      list.sort((a, b) => d2(b, ctx) - d2(a, ctx));
      return;
    case 'highestHealth':
      list.sort((a, b) => b.hp - a.hp);
      return;
    case 'lowestHealth':
      list.sort((a, b) => a.hp - b.hp);
      return;
    case 'fastest':
      list.sort((a, b) => b.speed - a.speed);
      return;
    case 'mostCorrupted':
      list.sort((a, b) => corruption(b) - corruption(a));
      return;
    case 'bossPriority':
      list.sort(
        (a, b) => flag(b.boss !== null) - flag(a.boss !== null) || ctx.goalDistance(a.x, a.y) - ctx.goalDistance(b.x, b.y),
      );
      return;
    case 'elitePriority':
      list.sort(
        (a, b) => flag(b.elite) - flag(a.elite) || ctx.goalDistance(a.x, a.y) - ctx.goalDistance(b.x, b.y),
      );
      return;
    case 'random': {
      // Deterministic random selection: assign each enemy a key from the sim rng.
      const keys = new Map<number, number>();
      for (const e of list) keys.set(e.id, ctx.rng());
      list.sort((a, b) => keys.get(a.id)! - keys.get(b.id)!);
      return;
    }
  }
}
