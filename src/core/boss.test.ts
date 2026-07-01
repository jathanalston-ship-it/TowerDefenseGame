import { describe, it, expect } from 'vitest';
import { Rng } from './rng';
import { assembleBoss, bossDef, bossProblems, campaignBossFor, CAMPAIGN_BOSSES, BOSS_DEFS } from './boss';

const mk = (seed: number): (() => number) => {
  const r = new Rng(seed);
  return () => r.next();
};

describe('boss framework', () => {
  it('the authored Progenitor is a real composition (phases + modules)', () => {
    const d = bossDef('progenitor')!;
    expect(d.phases.length).toBeGreaterThanOrEqual(2);
    expect(d.modules.length).toBeGreaterThanOrEqual(3);
    expect(d.phases[0].threshold).toBe(1); // first phase from full HP
  });

  it('procedural assembly scales module + phase count with Threat Level', () => {
    const low = assembleBoss(mk(1), 2);
    const high = assembleBoss(mk(1), 40);
    expect(high.modules.length).toBeGreaterThanOrEqual(low.modules.length);
    expect(high.phases.length).toBeGreaterThanOrEqual(low.phases.length);
    expect(high.phases.length).toBeLessThanOrEqual(3); // capped (fairness)
  });

  it('every assembled boss has ≥2 modules and a from-full first phase (fair)', () => {
    for (const seed of [3, 7, 11, 42]) {
      const b = assembleBoss(mk(seed), 18);
      expect(b.modules.length).toBeGreaterThanOrEqual(2);
      expect(b.phases[0].threshold).toBe(1);
    }
  });

  it('assembly is deterministic from the rng seed', () => {
    expect(assembleBoss(mk(5), 20).name).toBe(assembleBoss(mk(5), 20).name);
  });

  it('every authored boss is a valid composition (bossProblems clean)', () => {
    for (const d of Object.values(BOSS_DEFS)) expect(bossProblems(d)).toEqual([]);
  });

  it('bossProblems catches malformed defs (each module invariant)', () => {
    const base = bossDef('brood_cyst')!;
    expect(bossProblems({ ...base, hpMult: 0 })).toContain('hpMult must be > 0');
    expect(bossProblems({ ...base, phases: [{ threshold: 0.5, modules: [0] }] })).toContain('phases must start at threshold 1 (from full HP)');
    expect(bossProblems({ ...base, modules: [{ kind: 'healer', cooldown: 4, amount: 100 }], phases: [{ threshold: 1, modules: [0] }] })).toContain('healer needs a radius');
    expect(bossProblems({ ...base, modules: [{ kind: 'splitter', cooldown: 9, amount: 2 }], phases: [{ threshold: 1, modules: [] }] })).toContain('splitter needs generations ≥ 1');
  });
});

describe('Milestone-1 campaign boss line (docs/BOSS-DESIGN §4)', () => {
  it('pins six authored bosses to their campaign stages (5/10/15/20/25/30)', () => {
    expect(Object.keys(CAMPAIGN_BOSSES).map(Number).sort((a, b) => a - b)).toEqual([5, 10, 15, 20, 25, 30]);
    expect(campaignBossFor(5)!.id).toBe('first_antibody');
    expect(campaignBossFor(30)!.id).toBe('purge_engine');
    expect(campaignBossFor(12)).toBeUndefined(); // non-milestone stages stay procedural
  });

  it('each teaches its lesson through a real module (not just more HP)', () => {
    expect(campaignBossFor(15)!.modules.some((m) => m.kind === 'healer')).toBe(true); // The Mender
    expect(campaignBossFor(20)!.modules.some((m) => m.kind === 'carapace')).toBe(true); // Chitin Colossus
    expect(campaignBossFor(25)!.modules.some((m) => m.kind === 'splitter')).toBe(true); // Mitotic Horror
    expect(campaignBossFor(30)!.phases.length).toBe(3); // The Purge Engine — a real gauntlet
  });
});
