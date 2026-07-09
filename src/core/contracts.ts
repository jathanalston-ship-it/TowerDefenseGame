// CHAMPION CONTRACTS (docs/CONTRACTS.md) — weekly authored constraint runs. Three
// contracts are live each week, rotating DETERMINISTICALLY from one authored pool on the
// same UTC week index the LiveOps spotlights use — every player sees the same board, no
// server. Completing a contract's constraints inside a qualifying run pays Genome Cores
// and (for the marquee rows) an EXCLUSIVE Gilded phenotype (docs/COSMETICS.md).
//
// Constraints are a tiny DATA vocabulary evaluated against a run-facts snapshot at
// finishRun — adding a contract is one registry row, adding a verb is one case here.

import { weekIndex, liveopsNow } from './liveops';
import { cosmeticRegistry } from './cosmetics';
import type { HeroKind, TowerKind } from './types';

export interface ContractRunFacts {
  mode: 'campaign' | 'daily' | 'rush' | 'endless' | 'stage';
  won: boolean;
  wave: number;
  kills: number;
  integrityLost: number;
  towerBuilds: Partial<Record<TowerKind, number>>;
  heroId: string;
}

export type ContractConstraint =
  | { kind: 'win' }
  | { kind: 'minWave'; value: number }
  | { kind: 'minKills'; value: number }
  | { kind: 'noLeaks' } // zero Nucleus integrity lost
  | { kind: 'banTower'; tower: TowerKind } // never build this kind
  | { kind: 'maxTowerKinds'; value: number } // build diversity ceiling
  | { kind: 'maxTowersBuilt'; value: number } // total builds ceiling (moves count as builds)
  | { kind: 'requireHero'; hero: HeroKind };

export interface ContractDef {
  id: string;
  name: string;
  blurb: string; // the pitch — states the constraint in plain language
  mode: ContractRunFacts['mode'] | 'any';
  constraints: ContractConstraint[];
  reward: { cores: number; cosmetic: string | null }; // cosmetic = a Gilded phenotype id
}

/** The authored pool. Marquee rows (a Gilded phenotype) sit at rotation stride so every
 *  week carries exactly one marquee + two core-paying contracts. */
export const CONTRACT_POOL: ContractDef[] = [
  { id: 'iron_line', name: 'The Iron Line', blurb: 'Win any run without losing a single point of Nucleus integrity.', mode: 'any', constraints: [{ kind: 'win' }, { kind: 'noLeaks' }], reward: { cores: 260, cosmetic: 'pt_gilded_needle' } },
  { id: 'lean_garrison', name: 'Lean Garrison', blurb: 'Win any run building six towers or fewer, total.', mode: 'any', constraints: [{ kind: 'win' }, { kind: 'maxTowersBuilt', value: 6 }], reward: { cores: 180, cosmetic: null } },
  { id: 'deep_stand', name: 'Deep Stand', blurb: 'Reach wave 12 in any mode.', mode: 'any', constraints: [{ kind: 'minWave', value: 12 }], reward: { cores: 120, cosmetic: null } },
  { id: 'no_needles', name: 'Cold Turkey', blurb: 'Win any run without building a single Needle Spitter.', mode: 'any', constraints: [{ kind: 'win' }, { kind: 'banTower', tower: 'needle' }], reward: { cores: 220, cosmetic: 'pt_gilded_mortar' } },
  { id: 'monoculture', name: 'Monoculture', blurb: 'Win any run using at most two tower kinds.', mode: 'any', constraints: [{ kind: 'win' }, { kind: 'maxTowerKinds', value: 2 }], reward: { cores: 200, cosmetic: null } },
  { id: 'daily_butcher', name: 'The Daily Butcher', blurb: 'Take 150 kills in today’s Daily Run.', mode: 'daily', constraints: [{ kind: 'minKills', value: 150 }], reward: { cores: 150, cosmetic: null } },
  { id: 'silent_mortars', name: 'Silent Mortars', blurb: 'Win any run without a Bone Mortar on the field.', mode: 'any', constraints: [{ kind: 'win' }, { kind: 'banTower', tower: 'mortar' }], reward: { cores: 220, cosmetic: 'pt_gilded_reactor' } },
  { id: 'gauntlet_deep', name: 'Gauntlet Tithe', blurb: 'Reach wave 4 of the Boss Rush gauntlet.', mode: 'rush', constraints: [{ kind: 'minWave', value: 4 }], reward: { cores: 160, cosmetic: null } },
  { id: 'clean_dozen', name: 'A Clean Dozen', blurb: 'Reach wave 12 without losing integrity.', mode: 'any', constraints: [{ kind: 'minWave', value: 12 }, { kind: 'noLeaks' }], reward: { cores: 240, cosmetic: 'pt_gilded_obelisk' } },
];

export const CONTRACTS_PER_WEEK = 3;

/** This week's board — a stable window over the pool, striding by week. */
export function activeContracts(d: Date = liveopsNow()): ContractDef[] {
  const offset = (weekIndex(d) * CONTRACTS_PER_WEEK) % CONTRACT_POOL.length;
  return Array.from({ length: CONTRACTS_PER_WEEK }, (_, i) => CONTRACT_POOL[(offset + i) % CONTRACT_POOL.length]);
}

/** The completion-ledger key for this week's board (save.contracts.completed entries). */
export function contractWeekKey(d: Date = liveopsNow()): string {
  return `w${weekIndex(d)}`;
}

export function contractSatisfied(c: ContractDef, f: ContractRunFacts): boolean {
  if (c.mode !== 'any' && c.mode !== f.mode) return false;
  return c.constraints.every((k) => {
    switch (k.kind) {
      case 'win': return f.won;
      case 'minWave': return f.wave >= k.value;
      case 'minKills': return f.kills >= k.value;
      case 'noLeaks': return f.integrityLost <= 0;
      case 'banTower': return (f.towerBuilds[k.tower] ?? 0) === 0;
      case 'maxTowerKinds': return Object.values(f.towerBuilds).filter((n) => (n ?? 0) > 0).length <= k.value;
      case 'maxTowersBuilt': return Object.values(f.towerBuilds).reduce((a: number, n) => a + (n ?? 0), 0) <= k.value;
      case 'requireHero': return f.heroId === k.hero;
    }
  });
}

/** Registry hygiene, used by tests: every cosmetic reward must be a REAL Gilded phenotype. */
export function contractRewardIdsValid(): string[] {
  const bad: string[] = [];
  for (const c of CONTRACT_POOL) {
    if (c.reward.cosmetic !== null && cosmeticRegistry.get(c.reward.cosmetic)?.source !== 'contract') bad.push(c.id);
  }
  return bad;
}
