// Champion Contracts (docs/CONTRACTS.md): deterministic weekly rotation, the pool
// invariants (marquee stride, verb coverage, ledger-safe ids), honest constraint
// evaluation across the WHOLE verb vocabulary, the per-constraint report (near-miss
// surface), the rotation countdown, and reward-id hygiene against the Phenotype registry.

import { describe, expect, it } from 'vitest';
import {
  CONTRACTS_PER_WEEK, CONTRACT_POOL, activeContracts, constraintLabel, contractReport,
  contractRewardIdsValid, contractRotationEnd, contractSatisfied, contractWeekKey,
} from './contracts';
import type { ContractConstraint, ContractRunFacts } from './contracts';
import { weekIndex } from './liveops';
import { TOWER_DEFS } from './config';

const facts = (over: Partial<ContractRunFacts> = {}): ContractRunFacts => ({
  mode: 'stage', won: true, wave: 15, kills: 200, bossKills: 2, cardsDrafted: 3,
  integrityLost: 0, towerBuilds: { needle: 3 }, heroId: 'ravager', ...over,
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

  it('every weekly board carries EXACTLY one Gilded marquee (docs/CONTRACTS.md §invariants)', () => {
    for (let w = 0; w < CONTRACT_POOL.length; w++) {
      const board = activeContracts(new Date(Date.UTC(2026, 0, 6 + w * 7)));
      expect(board.filter((c) => c.reward.cosmetic !== null)).toHaveLength(1);
    }
  });

  it('the rotation countdown lands exactly on the weekIndex boundary', () => {
    const now = new Date(Date.UTC(2026, 0, 6));
    const end = contractRotationEnd(now);
    expect(end.getTime()).toBeGreaterThan(now.getTime());
    expect(weekIndex(end)).toBe(weekIndex(now) + 1);
    expect(weekIndex(new Date(end.getTime() - 1))).toBe(weekIndex(now));
  });
});

describe('pool invariants', () => {
  it('length divides into whole weeks; ids are unique and ledger-safe', () => {
    expect(CONTRACT_POOL.length % CONTRACTS_PER_WEEK).toBe(0);
    const ids = CONTRACT_POOL.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z_]+$/); // the save-ledger sanitizer's alphabet
  });

  it('marquee rows sit exactly at rotation stride (one Gilded per week, structural)', () => {
    CONTRACT_POOL.forEach((c, i) => {
      if (i % CONTRACTS_PER_WEEK === 0) expect(c.reward.cosmetic, `${c.id} should be a marquee`).not.toBeNull();
      else expect(c.reward.cosmetic, `${c.id} must not be a marquee off-stride`).toBeNull();
    });
  });

  it('every constraint verb appears in the pool (no dead vocabulary)', () => {
    const used = new Set(CONTRACT_POOL.flatMap((c) => c.constraints.map((k) => k.kind)));
    const all: ContractConstraint['kind'][] = [
      'win', 'minWave', 'minKills', 'minBossKills', 'noLeaks', 'banTower', 'requireTower',
      'banClass', 'onlyClass', 'maxTowerKinds', 'minTowerKinds', 'maxTowersBuilt', 'maxCards', 'requireHero',
    ];
    for (const kind of all) expect(used.has(kind), `verb '${kind}' is authored but unused`).toBe(true);
  });

  it('difficulty pips stay in the 1–3 display band', () => {
    for (const c of CONTRACT_POOL) expect([1, 2, 3]).toContain(c.difficulty);
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

  it('class verbs judge builds by TowerDef.combatClass', () => {
    expect(TOWER_DEFS.obelisk.combatClass).toBe('Neural'); // the fixtures below rely on these
    expect(TOWER_DEFS.needle.combatClass).toBe('Kinetic');
    // onlyClass: every build inside the class
    expect(contractSatisfied(by('pale_synod'), facts({ towerBuilds: { obelisk: 3, effigy: 1 } }))).toBe(true);
    expect(contractSatisfied(by('pale_synod'), facts({ towerBuilds: { obelisk: 3, needle: 1 } }))).toBe(false);
    // banClass: none of the class anywhere
    expect(contractSatisfied(by('cold_resonance'), facts({ towerBuilds: { obelisk: 2, coil: 1 } }))).toBe(true);
    expect(contractSatisfied(by('cold_resonance'), facts({ towerBuilds: { obelisk: 2, needle: 1 } }))).toBe(false);
  });

  it('boss, draft, diversity-floor, require-tower and require-hero verbs evaluate honestly', () => {
    expect(contractSatisfied(by('bossbreaker'), facts({ bossKills: 3 }))).toBe(true);
    expect(contractSatisfied(by('bossbreaker'), facts({ bossKills: 2 }))).toBe(false);
    expect(contractSatisfied(by('purist_draft'), facts({ cardsDrafted: 2 }))).toBe(true);
    expect(contractSatisfied(by('purist_draft'), facts({ cardsDrafted: 3 }))).toBe(false);
    expect(contractSatisfied(by('ascetic'), facts({ cardsDrafted: 0 }))).toBe(true);
    expect(contractSatisfied(by('ascetic'), facts({ cardsDrafted: 1 }))).toBe(false);
    expect(contractSatisfied(by('wide_front'), facts({ towerBuilds: { needle: 1, mortar: 1, coil: 1, obelisk: 1, reactor: 1 } }))).toBe(true);
    expect(contractSatisfied(by('wide_front'), facts({ towerBuilds: { needle: 4, mortar: 1, coil: 1, obelisk: 1 } }))).toBe(false);
    expect(contractSatisfied(by('mortar_covenant'), facts({ mode: 'campaign', towerBuilds: { mortar: 1 } }))).toBe(true);
    expect(contractSatisfied(by('mortar_covenant'), facts({ mode: 'campaign', towerBuilds: { needle: 1 } }))).toBe(false);
    expect(contractSatisfied(by('champions_oath'), facts({ heroId: 'ravager' }))).toBe(true);
    expect(contractSatisfied(by('champions_oath'), facts({ heroId: 'somebody_else' }))).toBe(false);
  });

  it('mode-scoped contracts refuse other modes', () => {
    expect(contractSatisfied(by('daily_butcher'), facts({ mode: 'daily', kills: 200 }))).toBe(true);
    expect(contractSatisfied(by('daily_butcher'), facts({ mode: 'stage', kills: 200 }))).toBe(false);
    expect(contractSatisfied(by('abyssal_reach'), facts({ mode: 'endless', wave: 18 }))).toBe(true);
    expect(contractSatisfied(by('abyssal_reach'), facts({ mode: 'stage', wave: 18 }))).toBe(false);
  });

  it('the report names exactly what a near-miss failed (payout and display share one evaluator)', () => {
    const rep = contractReport(by('iron_line'), facts({ integrityLost: 4 }));
    expect(rep.modeOk).toBe(true);
    expect(rep.satisfied).toBe(false);
    expect(rep.checks.filter((k) => !k.ok)).toHaveLength(1);
    expect(rep.checks.find((k) => !k.ok)!.label).toBe(constraintLabel({ kind: 'noLeaks' }));
    // satisfied ⇔ contractSatisfied, always
    for (const c of CONTRACT_POOL) {
      const f = facts();
      expect(contractReport(c, f).satisfied).toBe(contractSatisfied(c, f));
    }
  });

  it('every verb renders a human label', () => {
    for (const c of CONTRACT_POOL) {
      for (const k of c.constraints) {
        expect(constraintLabel(k).length).toBeGreaterThan(3);
      }
    }
  });
});

describe('reward hygiene', () => {
  it('every cosmetic payout is a REAL contract-source phenotype', () => {
    expect(contractRewardIdsValid()).toEqual([]);
  });
});
