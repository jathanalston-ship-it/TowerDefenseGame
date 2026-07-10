// Progression Director (docs/PROGRESSION-GATING.md §director) — the exposure/advice read-model
// plus the meta write-side: reveals latch once (with the run count stamped), nav visits count,
// ignored reveals surface, and the advice ranks visit-what-you-have over chase-what-is-next.

import { beforeEach, describe, expect, it } from 'vitest';
import { meta } from './meta';
import { directorAdvice, ignoredReveals, loadEstimate, revealAge } from './progressionDirector';
import { defaultSave, type SaveData } from '../save/saveStore';

beforeEach(() => meta.reset());

function seeded(patch: Partial<SaveData>): SaveData {
  return { ...defaultSave(), ...patch };
}

describe('meta latch + visit ledgers', () => {
  it('latchNewReveals persists newly-satisfied features once, stamped with the run count', () => {
    const first = meta.latchNewReveals(); // a fresh account latches its always-on surfaces
    expect(first).toContain('home');
    expect(first).toContain('campaign');
    expect(meta.latchNewReveals()).toEqual([]); // idempotent — nothing new
    expect(meta.get().director.revealed.home).toBe(0); // stamped at totalRuns = 0
  });

  it('noteNavVisit counts screen opens', () => {
    meta.noteNavVisit('campaign');
    meta.noteNavVisit('campaign');
    expect(meta.get().director.visits.campaign).toBe(2);
  });
});

describe('director queries', () => {
  it('revealAge measures runs since the reveal (Infinity when never revealed)', () => {
    const s = seeded({ totalRuns: 7, director: { revealed: { vault: 3 }, visits: {} } });
    expect(revealAge(s, 'vault')).toBe(4);
    expect(revealAge(s, 'bossrush')).toBe(Infinity);
  });

  it('ignoredReveals surfaces revealed-but-never-visited screens after the grace window', () => {
    const s = seeded({ totalRuns: 6, director: { revealed: { vault: 1 }, visits: {} } });
    expect(ignoredReveals(s).map((v) => v.def.id)).toContain('vault');
    const visited = seeded({ totalRuns: 6, director: { revealed: { vault: 1 }, visits: { vault: 1 } } });
    expect(ignoredReveals(visited).map((v) => v.def.id)).not.toContain('vault');
    const tooSoon = seeded({ totalRuns: 2, director: { revealed: { vault: 1 }, visits: {} } });
    expect(ignoredReveals(tooSoon).map((v) => v.def.id)).not.toContain('vault');
  });

  it('advice ranks visiting an ignored wing above chasing the next reveal', () => {
    const s = seeded({ totalRuns: 6, director: { revealed: { vault: 1 }, visits: {} } });
    const advice = directorAdvice(s);
    expect(advice[0].kind).toBe('visit');
    expect(advice[0].nav).toBe('vault');
    expect(advice.some((a) => a.kind === 'chase')).toBe(true);
    expect(advice.length).toBeLessThanOrEqual(3);
  });

  it('loadEstimate bands a fresh account calm', () => {
    expect(loadEstimate(defaultSave()).band).toBe('calm');
  });
});
