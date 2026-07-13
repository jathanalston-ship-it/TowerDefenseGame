// Tutorial gate seams (docs/TUTORIAL.md) — game.tutorialMode must hold the game's self-driven
// beats for the director WITHOUT existing on the golden path: natural post-wave drafts are
// suppressed, the director-released draft opens on demand, and the biomass top-up is inert
// outside the tutorial. Golden safety is structural (tutorialMode defaults false and nothing
// else reads it), pinned by sim.test's byte-identity.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT } from './config';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

/** Run the wave out (cull everything) until the post-wave phase lands. */
function clearWave(g: Game): void {
  for (let i = 0; i < 60 * 30; i++) {
    for (const e of g.enemies) { e.hp = 0; e.alive = false; }
    g.advance(SIM_DT);
    if (g.phase !== 'wave') break;
  }
  while (g.phase === 'wave') g.advance(SIM_DT); // settle tail
  for (let i = 0; i < 60 * 6 && (g.phase as string) === 'wave'; i++) g.advance(SIM_DT);
}

describe('tutorial gates (game.tutorialMode)', () => {
  it('suppresses the natural post-wave draft; the director releases it on demand', () => {
    const g = new Game(1, NO_META);
    g.tutorialMode = true;
    g.startWave();
    clearWave(g);
    for (let i = 0; i < 60 * 4 && g.phase !== 'prep' && g.phase !== 'draft'; i++) g.advance(SIM_DT);
    expect(g.phase).toBe('prep'); // stage mode drafts every wave — the gate held it
    expect(g.draft).toBeNull();

    g.openTutorialDraft(); // the gene-card lesson releases it
    expect(g.phase).toBe('draft');
    expect(g.draft?.length).toBe(3);
  });

  it('a normal (non-tutorial) run still drafts after the wave', () => {
    const g = new Game(1, NO_META);
    g.startWave();
    clearWave(g);
    for (let i = 0; i < 60 * 4 && g.phase !== 'draft'; i++) g.advance(SIM_DT);
    expect(g.phase).toBe('draft');
    expect(g.draft?.length).toBe(3);
  });

  it('openTutorialDraft is inert outside tutorial mode or outside prep', () => {
    const g = new Game(1, NO_META);
    g.openTutorialDraft(); // not tutorial mode
    expect(g.phase).toBe('prep');
    expect(g.draft).toBeNull();
    g.tutorialMode = true;
    g.startWave();
    g.openTutorialDraft(); // mid-wave: never yanks a live fight into a draft
    expect(g.phase).toBe('wave');
  });

  it('tutorialEnsureBiomass tops up only in tutorial mode, never down', () => {
    const g = new Game(1, NO_META);
    const start = g.biomass;
    g.tutorialEnsureBiomass(start + 500);
    expect(g.biomass).toBe(start); // guard: inert outside the tutorial
    g.tutorialMode = true;
    g.tutorialEnsureBiomass(start + 500);
    expect(g.biomass).toBe(start + 500);
    g.tutorialEnsureBiomass(10); // never reduces
    expect(g.biomass).toBe(start + 500);
  });
});

describe('tutorial ACCURACY (docs/TUTORIAL.md §accuracy — the lessons run the REAL deployment model)', () => {
  it('the Biomorph Conveyor is LIVE under the tutorial: the free gift is on the belt', () => {
    const g = new Game(1, NO_META);
    g.tutorialMode = true;
    g.advance(SIM_DT); // one prep tick — the belt boots and seats the run-start gift
    expect(g.conveyor.length).toBeGreaterThan(0); // the second-tower lesson deploys from HERE
    expect(g.conveyor[0].free).toBe(true); // …and the first organism is the free instant gift
  });

  it('tutorial placement rides the SAME universal deploy curve as every real run', () => {
    const run = (tut: boolean): number => {
      const g = new Game(1, NO_META);
      g.tutorialMode = tut;
      g.advance(SIM_DT);
      const before = g.biomass;
      g.selectTower('needle');
      g.click(360, 740, { shift: false }); // the favorite deploys via the conveyor economy
      return before - g.biomass;
    };
    expect(run(true)).toBe(run(false)); // identical price — no tutorial-only sandbox pricing
    expect(run(true)).toBeGreaterThan(0); // …and a deploy actually happened
  });
});
