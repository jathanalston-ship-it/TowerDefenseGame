// The premiere lane (docs/CUTSCENES.md §autoplay): the FIRST defeat of a mega queues its
// story cutscene, the next finishRun's outcome carries it (Results dismisses into the film),
// and repeat defeats stay silent. Mirrors the infestation × finishRun test harness.

import { describe, expect, it } from 'vitest';
import { meta } from './meta';
import type { RunResult } from './meta';
import { defaultLifetimeStats } from '../save/saveStore';
import { HERO_ORDER, TOWER_ORDER } from '../core/config';
import { gameEvents } from '../core/events';
import type { RunStats } from '../core/types';

function run(wave: number, won: boolean): RunResult {
  const zero = { kills: 0, damage: 0, activeTime: 0 };
  const mastery = TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['mastery'];
  const heroMastery = HERO_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['heroMastery'];
  const stats: RunStats = {
    kills: 10, wave, won, biomassEarned: 0, damageDealt: 100, integrityLost: won ? 0 : 100,
    killsByEnemy: defaultLifetimeStats().killsByEnemy,
    towerBuilds: TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: 0 }), {}) as RunStats['towerBuilds'],
    cardIds: [], heroId: HERO_ORDER[0],
  };
  return { wave, kills: 10, won, mastery, heroMastery, stats };
}

const megaKill = (defId: string): void =>
  gameEvents.emit('megaKilled', { defId, tier: 1, encounter: 'campaign', killSec: 60, perfect: false, weakPoints: 0, interrupts: 0 });

describe('first mega defeat → the premiere after the reward summary', () => {
  it('first kill queues the film onto the NEXT outcome; the unlock derives from the ledger', () => {
    meta.reset();
    megaKill('voraxis');
    const outcome = meta.finishRun(run(12, true));
    expect(outcome.megaCutscenes).toEqual(['mega:voraxis']);
    expect(meta.cutscenesView().find((m) => m.def.id === 'mega:voraxis')?.unlocked).toBe(true);
    // …and the small passive is live from now on
    expect(meta.cutsceneRunEffects()).toEqual([{ op: 'mul', field: 'biomassMult', value: 1.02 }]);
  });

  it('repeat defeats premiere NOTHING (the film plays once; the Archive replays it forever)', () => {
    meta.reset();
    megaKill('voraxis');
    meta.finishRun(run(12, true)); // premiere consumed here
    megaKill('voraxis');
    const outcome = meta.finishRun(run(14, true));
    expect(outcome.megaCutscenes).toBeUndefined();
  });

  it('two first-kills in one run premiere BOTH films, in kill order', () => {
    meta.reset();
    megaKill('meridia');
    megaKill('ossira');
    const outcome = meta.finishRun(run(20, true));
    expect(outcome.megaCutscenes).toEqual(['mega:meridia', 'mega:ossira']);
  });
});
