// CHAMPION CONTRACTS (docs/CONTRACTS.md) — weekly authored constraint runs. Three
// contracts are live each week, rotating DETERMINISTICALLY from one authored pool on the
// same UTC week index the LiveOps spotlights use — every player sees the same board, no
// server. Completing a contract's constraints inside a qualifying run pays Genome Cores
// + Account XP; the weekly MARQUEE row pays an EXCLUSIVE Gilded phenotype
// (docs/COSMETICS.md); honouring all three in one week is a PERFECT WEEK (bonus cores).
//
// Constraints are a tiny DATA vocabulary evaluated against a run-facts snapshot at
// finishRun — adding a contract is one registry row, adding a verb is one union member +
// one `checkConstraint` case + one label. `contractReport` exposes the per-constraint
// verdicts, so the UI's near-miss feedback can never drift from the real evaluation.
//
// POOL INVARIANTS (pinned by contracts.test.ts):
//   • pool length divisible by CONTRACTS_PER_WEEK, ids unique;
//   • marquee rows (cosmetic ≠ null) sit EXACTLY at indices ≡ 0 (mod 3) — every weekly
//     board carries exactly one marquee + two core-paying rows;
//   • every constraint verb appears in the pool (no dead vocabulary);
//   • every cosmetic reward resolves to a real `source: 'contract'` phenotype.

import { weekIndex, liveopsNow } from './liveops';
import { cosmeticRegistry } from './cosmetics';
import { HERO_DEFS, TOWER_DEFS } from './config';
import type { CombatClass, HeroKind, TowerKind } from './types';

export interface ContractRunFacts {
  mode: 'campaign' | 'daily' | 'rush' | 'endless' | 'stage';
  won: boolean;
  wave: number;
  kills: number;
  bossKills: number; // assembled bosses felled this run
  cardsDrafted: number; // gene cards drafted this run
  integrityLost: number;
  towerBuilds: Partial<Record<TowerKind, number>>;
  heroId: string;
}

export type ContractConstraint =
  | { kind: 'win' }
  | { kind: 'minWave'; value: number }
  | { kind: 'minKills'; value: number }
  | { kind: 'minBossKills'; value: number } // assembled bosses felled
  | { kind: 'noLeaks' } // zero Nucleus integrity lost
  | { kind: 'banTower'; tower: TowerKind } // never build this kind
  | { kind: 'requireTower'; tower: TowerKind } // field at least one
  | { kind: 'banClass'; cls: CombatClass } // no towers of a biological class
  | { kind: 'onlyClass'; cls: CombatClass } // every build within one class
  | { kind: 'maxTowerKinds'; value: number } // build diversity ceiling
  | { kind: 'minTowerKinds'; value: number } // build diversity floor
  | { kind: 'maxTowersBuilt'; value: number } // total builds ceiling (moves count as builds)
  | { kind: 'maxCards'; value: number } // gene-draft discipline ceiling
  | { kind: 'requireHero'; hero: HeroKind };

export interface ContractDef {
  id: string;
  name: string;
  blurb: string; // the pitch — states the constraint in plain language
  mode: ContractRunFacts['mode'] | 'any';
  difficulty: 1 | 2 | 3; // presentation only (board pips) — evaluation never reads it
  constraints: ContractConstraint[];
  reward: { cores: number; cosmetic: string | null }; // cosmetic = a Gilded phenotype id
}

/** Honouring ALL THREE of a week's contracts is a PERFECT WEEK — bonus cores on the run
 *  that completes the sweep (XP sibling lives in ACCOUNT_XP.perfectWeek). */
export const PERFECT_WEEK = { cores: 300 } as const;

export const MODE_LABEL: Record<ContractDef['mode'], string> = {
  any: 'Any mode', campaign: 'Campaign', daily: 'Daily Run', rush: 'Boss Rush', endless: 'Infinite', stage: 'Skirmish',
};

/** The authored pool — 24 rows = an 8-week cycle. Marquee rows (Gilded phenotype) sit at
 *  indices ≡ 0 (mod 3) so every week carries exactly one marquee + two core contracts. */
export const CONTRACT_POOL: ContractDef[] = [
  // ── Week A ──
  { id: 'iron_line', name: 'The Iron Line', blurb: 'Win any run without losing a single point of Nucleus integrity.', mode: 'any', difficulty: 3, constraints: [{ kind: 'win' }, { kind: 'noLeaks' }], reward: { cores: 260, cosmetic: 'pt_gilded_needle' } },
  { id: 'lean_garrison', name: 'Lean Garrison', blurb: 'Win any run building six towers or fewer, total.', mode: 'any', difficulty: 2, constraints: [{ kind: 'win' }, { kind: 'maxTowersBuilt', value: 6 }], reward: { cores: 180, cosmetic: null } },
  { id: 'deep_stand', name: 'Deep Stand', blurb: 'Reach wave 12 in any mode.', mode: 'any', difficulty: 1, constraints: [{ kind: 'minWave', value: 12 }], reward: { cores: 120, cosmetic: null } },
  // ── Week B ──
  { id: 'no_needles', name: 'Cold Turkey', blurb: 'Win any run without building a single Needle Spitter.', mode: 'any', difficulty: 2, constraints: [{ kind: 'win' }, { kind: 'banTower', tower: 'needle' }], reward: { cores: 220, cosmetic: 'pt_gilded_mortar' } },
  { id: 'monoculture', name: 'Monoculture', blurb: 'Win any run using at most two tower kinds.', mode: 'any', difficulty: 2, constraints: [{ kind: 'win' }, { kind: 'maxTowerKinds', value: 2 }], reward: { cores: 200, cosmetic: null } },
  { id: 'daily_butcher', name: 'The Daily Butcher', blurb: 'Take 150 kills in today’s Daily Run.', mode: 'daily', difficulty: 1, constraints: [{ kind: 'minKills', value: 150 }], reward: { cores: 150, cosmetic: null } },
  // ── Week C ──
  { id: 'silent_mortars', name: 'Silent Mortars', blurb: 'Win any run without a Bone Mortar on the field.', mode: 'any', difficulty: 2, constraints: [{ kind: 'win' }, { kind: 'banTower', tower: 'mortar' }], reward: { cores: 220, cosmetic: 'pt_gilded_reactor' } },
  { id: 'gauntlet_deep', name: 'Gauntlet Tithe', blurb: 'Reach wave 4 of the Boss Rush gauntlet.', mode: 'rush', difficulty: 1, constraints: [{ kind: 'minWave', value: 4 }], reward: { cores: 160, cosmetic: null } },
  { id: 'clean_dozen', name: 'A Clean Dozen', blurb: 'Reach wave 12 without losing integrity.', mode: 'any', difficulty: 2, constraints: [{ kind: 'minWave', value: 12 }, { kind: 'noLeaks' }], reward: { cores: 240, cosmetic: null } },
  // ── Week D ──
  { id: 'pale_synod', name: 'The Pale Synod', blurb: 'Win any run fielding Neural towers only.', mode: 'any', difficulty: 3, constraints: [{ kind: 'win' }, { kind: 'onlyClass', cls: 'Neural' }], reward: { cores: 280, cosmetic: 'pt_gilded_obelisk' } },
  { id: 'bossbreaker', name: 'Bossbreaker', blurb: 'Fell three assembled bosses in a single run.', mode: 'any', difficulty: 2, constraints: [{ kind: 'minBossKills', value: 3 }], reward: { cores: 190, cosmetic: null } },
  { id: 'purist_draft', name: 'Purist Draft', blurb: 'Win any run drafting at most two Gene Cards.', mode: 'any', difficulty: 2, constraints: [{ kind: 'win' }, { kind: 'maxCards', value: 2 }], reward: { cores: 200, cosmetic: null } },
  // ── Week E ──
  { id: 'cold_resonance', name: 'Cold Resonance', blurb: 'Win any run without a single Kinetic tower.', mode: 'any', difficulty: 3, constraints: [{ kind: 'win' }, { kind: 'banClass', cls: 'Kinetic' }], reward: { cores: 280, cosmetic: 'pt_gilded_coil' } },
  { id: 'wide_front', name: 'The Wide Front', blurb: 'Win any run fielding at least five different tower kinds.', mode: 'any', difficulty: 2, constraints: [{ kind: 'win' }, { kind: 'minTowerKinds', value: 5 }], reward: { cores: 190, cosmetic: null } },
  { id: 'abyssal_reach', name: 'Abyssal Reach', blurb: 'Reach wave 18 of the Infinite experiment.', mode: 'endless', difficulty: 2, constraints: [{ kind: 'minWave', value: 18 }], reward: { cores: 210, cosmetic: null } },
  // ── Week F ──
  { id: 'viral_creed', name: 'The Viral Creed', blurb: 'Win any run fielding Viral towers only.', mode: 'any', difficulty: 3, constraints: [{ kind: 'win' }, { kind: 'onlyClass', cls: 'Viral' }], reward: { cores: 300, cosmetic: 'pt_gilded_parasite' } },
  { id: 'champions_oath', name: 'Champion’s Oath', blurb: 'Win any run with the Ravager fielded.', mode: 'any', difficulty: 1, constraints: [{ kind: 'win' }, { kind: 'requireHero', hero: 'ravager' }], reward: { cores: 140, cosmetic: null } },
  { id: 'knife_edge', name: 'Knife Edge', blurb: 'Reach wave 8 without losing integrity.', mode: 'any', difficulty: 2, constraints: [{ kind: 'minWave', value: 8 }, { kind: 'noLeaks' }], reward: { cores: 180, cosmetic: null } },
  // ── Week G ──
  { id: 'caustic_communion', name: 'Caustic Communion', blurb: 'Win any run fielding Caustic towers only.', mode: 'any', difficulty: 3, constraints: [{ kind: 'win' }, { kind: 'onlyClass', cls: 'Caustic' }], reward: { cores: 280, cosmetic: 'pt_gilded_chrysalis' } },
  { id: 'deep_cull', name: 'The Deep Cull', blurb: 'Take 400 kills in a single run.', mode: 'any', difficulty: 2, constraints: [{ kind: 'minKills', value: 400 }], reward: { cores: 180, cosmetic: null } },
  { id: 'spartan_rush', name: 'Spartan Gauntlet', blurb: 'Reach wave 6 of the Boss Rush gauntlet.', mode: 'rush', difficulty: 3, constraints: [{ kind: 'minWave', value: 6 }], reward: { cores: 260, cosmetic: null } },
  // ── Week H ──
  { id: 'apex_hunt', name: 'The Apex Hunt', blurb: 'Fell five assembled bosses and win the run.', mode: 'any', difficulty: 3, constraints: [{ kind: 'win' }, { kind: 'minBossKills', value: 5 }], reward: { cores: 300, cosmetic: 'pt_gilded_rift' } },
  { id: 'ascetic', name: 'The Ascetic', blurb: 'Win any run without drafting a single Gene Card.', mode: 'any', difficulty: 3, constraints: [{ kind: 'win' }, { kind: 'maxCards', value: 0 }], reward: { cores: 250, cosmetic: null } },
  { id: 'mortar_covenant', name: 'Mortar Covenant', blurb: 'Win a Campaign stage with a Bone Mortar fielded.', mode: 'campaign', difficulty: 1, constraints: [{ kind: 'win' }, { kind: 'requireTower', tower: 'mortar' }], reward: { cores: 150, cosmetic: null } },
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

/** The UTC instant this week's board rotates (weekIndex increments) — feeds the countdown. */
export function contractRotationEnd(d: Date = liveopsNow()): Date {
  return new Date(((weekIndex(d) + 1) * 7 - 3) * 86_400_000);
}

function builds(f: ContractRunFacts): [TowerKind, number][] {
  return (Object.entries(f.towerBuilds) as [TowerKind, number | undefined][])
    .filter((e): e is [TowerKind, number] => (e[1] ?? 0) > 0);
}

/** ONE verb, ONE verdict — `contractSatisfied` and the UI report both read this. */
function checkConstraint(k: ContractConstraint, f: ContractRunFacts): boolean {
  switch (k.kind) {
    case 'win': return f.won;
    case 'minWave': return f.wave >= k.value;
    case 'minKills': return f.kills >= k.value;
    case 'minBossKills': return f.bossKills >= k.value;
    case 'noLeaks': return f.integrityLost <= 0;
    case 'banTower': return (f.towerBuilds[k.tower] ?? 0) === 0;
    case 'requireTower': return (f.towerBuilds[k.tower] ?? 0) > 0;
    case 'banClass': return builds(f).every(([t]) => TOWER_DEFS[t].combatClass !== k.cls);
    case 'onlyClass': return builds(f).every(([t]) => TOWER_DEFS[t].combatClass === k.cls);
    case 'maxTowerKinds': return builds(f).length <= k.value;
    case 'minTowerKinds': return builds(f).length >= k.value;
    case 'maxTowersBuilt': return builds(f).reduce((a, [, n]) => a + n, 0) <= k.value;
    case 'maxCards': return f.cardsDrafted <= k.value;
    case 'requireHero': return f.heroId === k.hero;
  }
}

/** Short human verdict line per verb — board pips, tooltips, and near-miss copy. */
export function constraintLabel(k: ContractConstraint): string {
  switch (k.kind) {
    case 'win': return 'Win the run';
    case 'minWave': return `Reach wave ${k.value}`;
    case 'minKills': return `${k.value} kills`;
    case 'minBossKills': return `Fell ${k.value} boss${k.value === 1 ? '' : 'es'}`;
    case 'noLeaks': return 'Lose no integrity';
    case 'banTower': return `No ${TOWER_DEFS[k.tower].name}s`;
    case 'requireTower': return `Field a ${TOWER_DEFS[k.tower].name}`;
    case 'banClass': return `No ${k.cls} towers`;
    case 'onlyClass': return `${k.cls} towers only`;
    case 'maxTowerKinds': return `At most ${k.value} tower kinds`;
    case 'minTowerKinds': return `At least ${k.value} tower kinds`;
    case 'maxTowersBuilt': return `Build at most ${k.value} towers`;
    case 'maxCards': return k.value === 0 ? 'Draft no Gene Cards' : `Draft at most ${k.value} Gene Cards`;
    case 'requireHero': return `Field ${HERO_DEFS[k.hero].name}`;
  }
}

export interface ContractReport {
  modeOk: boolean;
  checks: { label: string; ok: boolean }[];
  satisfied: boolean;
}

/** Per-constraint verdicts for one run — the near-miss surface (Results, board tooltips).
 *  `contractSatisfied` derives from this, so display and payout can never disagree. */
export function contractReport(c: ContractDef, f: ContractRunFacts): ContractReport {
  const modeOk = c.mode === 'any' || c.mode === f.mode;
  const checks = c.constraints.map((k) => ({ label: constraintLabel(k), ok: checkConstraint(k, f) }));
  return { modeOk, checks, satisfied: modeOk && checks.every((x) => x.ok) };
}

export function contractSatisfied(c: ContractDef, f: ContractRunFacts): boolean {
  return contractReport(c, f).satisfied;
}

/** Registry hygiene, used by tests: every cosmetic reward must be a REAL Gilded phenotype. */
export function contractRewardIdsValid(): string[] {
  const bad: string[] = [];
  for (const c of CONTRACT_POOL) {
    if (c.reward.cosmetic !== null && cosmeticRegistry.get(c.reward.cosmetic)?.source !== 'contract') bad.push(c.id);
  }
  return bad;
}
