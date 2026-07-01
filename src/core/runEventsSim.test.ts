// Run Identity — END-TO-END in the sim (docs/RUN-IDENTITY.md). Autoplays real Campaign runs and
// confirms the plan actually manifests: beats fire and telegraph through the snapshot, the run is
// deterministic, and (the golden contract) a STAGE run never surfaces an event.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { generateStage } from './campaign';
import { SIM_DT } from './config';
import { towerSlots } from './map';
import type { MetaModifiers, TowerKind } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const KINDS: TowerKind[] = ['needle', 'mortar', 'reactor'];

/** Autoplay a run (god-mode so it survives deep enough to observe scheduled beats), collecting the
 *  distinct run-event names telegraphed via the snapshot + the run headline. */
function play(game: Game, stopAtWave = 8): { events: string[]; headline: string } {
  const seen = new Set<string>();
  let t = 0; let guard = 0;
  while (t < 240 && game.phase !== 'won' && game.phase !== 'lost' && game.waveIndex < stopAtWave && guard++ < 300000) {
    if (game.phase === 'draft') { game.chooseCard(game.getSnapshot().draft![0].id); continue; }
    if (game.phase === 'prep') {
      let placed = 0;
      for (let i = 0; i < towerSlots.length && placed < 6; i++) {
        if (game.placeTower(KINDS[i % 3], towerSlots[i].x, towerSlots[i].y)) placed++;
      }
      game.god = true; // survive to observe the plan's beats; more towers clear waves fast
      game.startWave();
    }
    game.advance(SIM_DT); t += SIM_DT;
    const ev = game.getSnapshot().runEvent;
    if (ev) seen.add(ev.name);
  }
  return { events: [...seen], headline: game.getSnapshot().runHeadline ?? '' };
}

const campaignGame = (seed: number, stageNum = 4): Game =>
  new Game(seed, NO_META, undefined, 'ravager', undefined, { mode: 'campaign', stage: generateStage(stageNum, 'standard') });

describe('run identity — end-to-end in the sim', () => {
  it('surfaces run events during real Campaign runs (identity actually manifests)', () => {
    const union = new Set<string>();
    let headlined = 0;
    for (let s = 1; s <= 8; s++) {
      const { events, headline } = play(campaignGame(s));
      for (const e of events) union.add(e);
      if (headline) headlined++;
    }
    expect(union.size).toBeGreaterThan(0); // beats fire in-sim, not just on paper
    expect(headlined).toBeGreaterThan(0); // some runs carry a headline identity
  });

  it('is deterministic — the same seed telegraphs the same beats + headline', () => {
    const a = play(campaignGame(7));
    const b = play(campaignGame(7));
    expect(a.events.sort()).toEqual(b.events.sort());
    expect(a.headline).toBe(b.headline);
  });

  it('a STAGE run never surfaces a run event (golden-safety contract)', () => {
    const game = new Game(42, NO_META); // default = stage mode
    const { events, headline } = play(game);
    expect(events).toEqual([]);
    expect(headline).toBe('');
  });
});
