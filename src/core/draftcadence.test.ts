// Gene Card acquisition cadence (CARDS.md §1): campaign drafts every wave (generous); endless
// slows the drip with depth so cards stay exciting and deep runs lean on permanent progression.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { endlessDraftInterval } from './cards';
import { SIM_DT } from './config';
import { towerSlots } from './map';
import type { MetaModifiers, TowerKind } from './types';

// Tanky Nucleus so survival never confounds a CADENCE test — we assert *when* cards appear, not
// whether the autopilot can hold the line that deep.
const TANKY_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 100_000, bonusSlots: 0 };
const KINDS: TowerKind[] = ['needle', 'mortar', 'reactor'];

/** Drive a run, returning the depth/wave numbers at which a Gene Card draft was offered. */
function draftDepths(mode: 'stage' | 'endless', untilWave: number): number[] {
  const g = new Game(7, TANKY_META, undefined, undefined, undefined, { mode });
  const offered: number[] = [];
  let guard = 0;
  while (g.waveIndex < untilWave && g.phase !== 'lost' && g.phase !== 'won' && guard++ < 500_000) {
    if (g.phase === 'draft') {
      offered.push(g.waveIndex); // waveIndex is the wave that just cleared (it ++s at wave start)
      g.chooseCard(g.getSnapshot().draft![0].id);
      continue;
    }
    if (g.phase === 'prep') {
      for (let i = 0; i < towerSlots.length; i++) g.placeTower(KINDS[i % KINDS.length], towerSlots[i].x, towerSlots[i].y);
      g.startWave();
    }
    g.advance(SIM_DT);
  }
  return offered;
}

describe('endlessDraftInterval — the cadence curve', () => {
  it('widens one wave per 5-depth band and caps at 5', () => {
    // Bands: 1–5→1, 6–10→2, 11–15→3, 16–20→4, 21+→5 (CARDS.md §1).
    const bands: Array<[number, number]> = [
      [1, 1], [5, 1], [6, 2], [10, 2], [11, 3], [15, 3], [16, 4], [20, 4], [21, 5], [25, 5],
    ];
    for (const [wave, expected] of bands) expect(endlessDraftInterval(wave)).toBe(expected);
  });

  it('caps at 5 no matter how deep, and never returns < 1', () => {
    expect(endlessDraftInterval(100)).toBe(5);
    expect(endlessDraftInterval(1000)).toBe(5);
    expect(endlessDraftInterval(0)).toBe(1); // defensive: wave 0 never under-flows
  });

  it('produces the documented draft-depth sequence (counter, never shrinks the gap)', () => {
    // Simulate the same counter the Game uses, then pin the exact sequence the docs promise.
    const depths: number[] = [];
    let since = 0;
    for (let w = 1; w <= 30; w++) {
      since++;
      if (since >= endlessDraftInterval(w)) { depths.push(w); since = 0; }
    }
    expect(depths).toEqual([1, 2, 3, 4, 5, 7, 9, 12, 15, 19, 24, 29]);
    // Gaps are monotonically non-decreasing — the drip only ever widens.
    const gaps = depths.slice(1).map((d, i) => d - depths[i]);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThanOrEqual(gaps[i - 1]);
  });
});

describe('draft cadence — wired through the Game', () => {
  it('campaign (stage) drafts after EVERY wave', () => {
    const offered = draftDepths('stage', 6);
    expect(offered).toEqual([1, 2, 3, 4, 5]); // a card after each of the first five waves
  });

  it('endless drafts every wave 1–5, then skips wave 6 (the drip begins)', () => {
    const offered = draftDepths('endless', 8);
    // Reached deep enough for the test to be meaningful.
    expect(offered).toContain(7);
    expect(offered.filter((d) => d <= 7)).toEqual([1, 2, 3, 4, 5, 7]); // 6 skipped, 7 resumes
    expect(offered).not.toContain(6);
  });

  it('endless draft waves resolve to draft; the skipped wave resolves straight to prep', () => {
    const g = new Game(7, TANKY_META, undefined, undefined, undefined, { mode: 'endless' });
    const phaseAfterWave = new Map<number, string>();
    let prevPhase = g.phase;
    let guard = 0;
    while (g.waveIndex < 8 && g.phase !== 'lost' && guard++ < 500_000) {
      if (g.phase === 'draft') { g.chooseCard(g.getSnapshot().draft![0].id); continue; }
      if (g.phase === 'prep') {
        for (let i = 0; i < towerSlots.length; i++) g.placeTower(KINDS[i % KINDS.length], towerSlots[i].x, towerSlots[i].y);
        g.startWave();
      }
      g.advance(SIM_DT);
      // The first phase a wave resolves INTO (settle keeps phase 'wave', so this is endWave's flip).
      if (prevPhase === 'wave' && g.phase !== 'wave') phaseAfterWave.set(g.waveIndex, g.phase);
      prevPhase = g.phase;
    }
    expect(phaseAfterWave.get(5)).toBe('draft'); // a draft wave
    expect(phaseAfterWave.get(6)).toBe('prep'); // the first skipped wave → straight to build
    expect(phaseAfterWave.get(7)).toBe('draft'); // cadence resumes
  });

  it('surfaces the next Gene Card depth so the slower drip stays anticipated', () => {
    // At the very start, the first card is the next wave.
    const g = new Game(7, TANKY_META, undefined, undefined, undefined, { mode: 'endless' });
    expect(g.getSnapshot().anticipation).toContain('Gene Card at depth 1');

    // After wave 6 is skipped, the prep screen should point at depth 7 (the next draft).
    let guard = 0;
    while (!(g.waveIndex === 6 && g.phase === 'prep') && g.phase !== 'lost' && guard++ < 500_000) {
      if (g.phase === 'draft') { g.chooseCard(g.getSnapshot().draft![0].id); continue; }
      if (g.phase === 'prep') {
        for (let i = 0; i < towerSlots.length; i++) g.placeTower(KINDS[i % KINDS.length], towerSlots[i].x, towerSlots[i].y);
        g.startWave();
      }
      g.advance(SIM_DT);
    }
    expect(g.waveIndex).toBe(6); // reached the skipped wave's prep
    expect(g.getSnapshot().anticipation).toContain('Gene Card at depth 7');
  });
});
