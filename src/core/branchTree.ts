// Presentation read-model for the Tower Inspect panel's mutation TREE (TOWER-BRANCHES.md).
// Pure derivation over the branch system (branches.ts) + the cost ladder (config.BRANCH_COSTS):
// it turns a placed tower's state — its committed branch, current tier, and the player's
// Biomass — into display LANES, one per branch, each a full ladder of tier nodes tagged
// owned / next / future / locked-out with the per-tier cost. The panel renders lanes and
// nodes generically, so adding a branch (or changing a branch's tier count) in branches.ts
// flows straight through with ZERO interface changes. No sim, no DOM, no React.

import { BRANCH_COSTS, TOWER_DEFS } from './config';
import { branchesFor, resolveBranchKit } from './branches';
import type { TowerKind } from './types';

/** A tier's status relative to the inspected tower instance. */
export type TierState = 'owned' | 'next' | 'future' | 'lockedout';

export interface TierNodeView {
  tier: number; // 1-based
  name: string; // the mutation the tier grants ("Twin Spinnerets")
  desc: string; // what it changes, in player words
  cost: number; // Biomass to buy this tier
  state: TierState;
  affordable: boolean; // only meaningful when state === 'next'
}

export interface BranchLaneView {
  branchId: string;
  name: string; // the path's identity ("Hivemind Swarm")
  theme: string; // one-line fantasy for the lane header
  committed: boolean; // this instance is locked into this branch
  lockedOut: boolean; // a DIFFERENT branch was committed → this path is closed
  owned: number; // tiers owned on this lane (0 unless committed)
  tiers: TierNodeView[];
  next: TierNodeView | null; // the buyable tier (null if maxed or locked out)
}

export interface BranchTreeView {
  lanes: BranchLaneView[];
  committedId: string | null;
  maxTier: number; // tiers in the longest lane (layout / "Tier x/N")
}

/**
 * Build the mutation tree for a placed tower instance. `committedId` + `currentTier` come from
 * the live snapshot (`SelectedPlacedTower`); `biomass` drives affordability with the SAME rule
 * the sim uses (`biomass >= cost`). Empty `lanes` for a tower with no authored branches.
 */
export function branchTreeView(
  kind: TowerKind,
  committedId: string | null,
  currentTier: number,
  biomass: number,
): BranchTreeView {
  const costs = BRANCH_COSTS[kind];
  const lanes = branchesFor(kind).map((b): BranchLaneView => {
    const committed = b.id === committedId;
    const lockedOut = committedId !== null && !committed;
    const owned = committed ? currentTier : 0;
    const tiers = b.tiers.map((t): TierNodeView => {
      const cost = costs[t.tier - 1] ?? 0;
      const state: TierState = lockedOut
        ? 'lockedout'
        : t.tier <= owned
          ? 'owned'
          : t.tier === owned + 1
            ? 'next'
            : 'future';
      return { tier: t.tier, name: t.name, desc: t.desc, cost, state, affordable: state === 'next' && biomass >= cost };
    });
    const next = lockedOut ? null : (tiers.find((t) => t.state === 'next') ?? null);
    return { branchId: b.id, name: b.name, theme: b.theme, committed, lockedOut, owned, tiers, next };
  });
  return { lanes, committedId, maxTier: lanes.reduce((m, l) => Math.max(m, l.tiers.length), 0) };
}

export interface BranchStatsView {
  dps: number | null; // base-attack DPS estimate (null for field/support towers)
  range: number;
  rate: number | null; // shots (or pulses) per second
  splash: number;
  shots: number; // simultaneous targets (1 + extra projectiles)
  firing: string; // def.firing — lets the panel label Pulse vs Fire rate
}

/**
 * Fold the per-instance branch kit onto the tower's base def for the panel's Current-Stats
 * readout. Branch-only by design — this is the dimension the player is inspecting; account,
 * overcharge, and hero-aura multipliers ride on top at runtime and aren't shown here.
 */
export function branchStatsView(kind: TowerKind, committedId: string | null, tier: number): BranchStatsView {
  const def = TOWER_DEFS[kind];
  const kit = resolveBranchKit(committedId, tier);
  const damage = def.damage * kit.damageMult;
  const rate = def.fireInterval > 0 ? kit.fireRateMult / def.fireInterval : null;
  const shots = 1 + kit.extraProjectiles;
  const firing = def.firing;
  const dps = rate !== null && firing !== 'field' && firing !== 'support' ? Math.round(damage * rate * shots) : null;
  return {
    dps,
    range: Math.round(def.range * kit.rangeMult),
    rate,
    splash: Math.round(def.splash * kit.splashMult),
    shots,
    firing,
  };
}
