// Champion Contracts (docs/CONTRACTS.md): deterministic weekly rotation, honest
// constraint evaluation, and reward-id hygiene against the Phenotype registry.

import { describe, expect, it } from 'vitest';
import {
  CONTRACTS_PER_WEEK, CONTRACT_POOL, activeContracts, contractRewardIdsValid, contractSatisfied, contractWeekKey,
} from './contracts';
import type { ContractRunFacts } from './contracts';

const facts = (over: Partial<ContractRunFacts> = {}): ContractRunFacts => ({
  mode: 'stage', won: true, wave: 15, kills: 200, integrityLost: 0,
  towerBuilds: { needle: 3 }, heroId: 'ravager', ...over,
});

describe('weekly rotation', () => {
  it('is deterministic per week and rotates the pool', () => {
    const a = activeContracts(new Date(Date.UTC(2026, 0, 6)));
    const b = activeContracts(new Date(Date.UTC(2026, 0, 8))); // same ISO week
    const c = activeContracts(new Date(Date.UTC(2026, 0, 13))); // next week
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(a.map((x) => x.id)).not.toEqual(c.map((x) => x.id));
    expect(a).toHaveLength(CONTRACTS_PER_WEEK);
    expect(contractWeekKey(new Date(Date.UTC(2026, 0, 6)))).toMatch(/^w\d+$/);
  });

  it('every pool row appears within a full cycle (no dead contracts)', () => {
    const seen = new Set<string>();
    for (let w = 0; w < CONTRACT_POOL.length; w++) {
      for (const c of activeContracts(new Date(Date.UTC(2026, 0, 6 + w * 7)))) seen.add(c.id);
    }
    expect(seen.size).toBe(CONTRACT_POOL.length);
  });
});

describe('constraint evaluation', () => {
  const by = (id: string) => CONTRACT_POOL.find((c) => c.id === id)!;

  it('the Iron Line demands a flawless win', () => {
    expect(contractSatisfied(by('iron_line'), facts())).toBe(true);
    expect(contractSatisfied(by('iron_line'), facts({ integrityLost: 5 }))).toBe(false);
    expect(contractSatisfied(by('iron_line'), facts({ won: false }))).toBe(false);
  });

  it('bans and ceilings read the towerBuilds ledger', () => {
    expect(contractSatisfied(by('no_needles'), facts({ towerBuilds: { mortar: 4 } }))).toBe(true);
    expect(contractSatisfied(by('no_needles'), facts({ towerBuilds: { needle: 1, mortar: 4 } }))).toBe(false);
    expect(contractSatisfied(by('monoculture'), facts({ towerBuilds: { needle: 5, mortar: 2 } }))).toBe(true);
    expect(contractSatisfied(by('monoculture'), facts({ towerBuilds: { needle: 5, mortar: 2, coil: 1 } }))).toBe(false);
    expect(contractSatisfied(by('lean_garrison'), facts({ towerBuilds: { needle: 6 } }))).toBe(true);
    expect(contractSatisfied(by('lean_garrison'), facts({ towerBuilds: { needle: 7 } }))).toBe(false);
  });

  it('mode-scoped contracts refuse other modes', () => {
    expect(contractSatisfied(by('daily_butcher'), facts({ mode: 'daily', kills: 200 }))).toBe(true);
    expect(contractSatisfied(by('daily_butcher'), facts({ mode: 'stage', kills: 200 }))).toBe(false);
  });
});

describe('reward hygiene', () => {
  it('every cosmetic payout is a REAL contract-source phenotype', () => {
    expect(contractRewardIdsValid()).toEqual([]);
  });
});
