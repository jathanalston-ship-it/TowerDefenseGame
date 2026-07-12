// Power Atlas (docs/POWER-SCORE.md §atlas) — one row per Power system, advisor-exact moves,
// honest tend notes, and a cross-system "best move now" that only ever names an affordable,
// strictly-positive gain.

import { describe, expect, it } from 'vitest';
import { powerAtlas } from './powerAtlas';
import { bestPurchase } from './bestPurchase';
import { defaultSave } from '../save/saveStore';
import { TOWER_ORDER } from '../core/config';

const IDS = ['towers', 'heroes', 'evolution', 'genes', 'adaptation', 'equipment', 'mulligans', 'collection'];

describe('powerAtlas', () => {
  it('fresh save: all eight systems present, notes non-empty, no crash, no headline lies', () => {
    const atlas = powerAtlas(defaultSave());
    expect(atlas.systems.map((s) => s.id)).toEqual(IDS);
    for (const s of atlas.systems) {
      expect(s.note.length).toBeGreaterThan(0);
      expect(s.nav.length).toBeGreaterThan(0);
    }
    if (atlas.headline) {
      expect(atlas.headline.move.affordable).toBe(true);
      expect(atlas.headline.move.powerDelta).toBeGreaterThan(0);
    }
  });

  it('developed save: buy rows mirror their advisors; headline is the max affordable gain', () => {
    const s = defaultSave();
    s.campaign.cleared = { standard: 30 };
    s.totalRuns = 25;
    s.shards = 5000;
    s.towerShards[TOWER_ORDER[0]] = 10_000;
    const atlas = powerAtlas(s);

    const towers = atlas.systems.find((x) => x.id === 'towers')!;
    const advisor = bestPurchase(s, 'towers');
    const pick = advisor.bestAffordable ?? advisor.best;
    expect(towers.move?.label).toBe(pick?.label);
    expect(towers.move?.powerDelta).toBe(pick?.powerDelta);
    expect(towers.readyCount).toBe(advisor.ranked.filter((c) => c.affordable).length);
    // Quick-buy payload: the move carries the exact candidate the advisor ranked.
    expect(towers.move?.action).toEqual({ type: 'purchase', surface: 'towers', id: pick?.id });

    expect(atlas.headline).not.toBeNull();
    const { move } = atlas.headline!;
    expect(move.affordable).toBe(true);
    for (const sys of atlas.systems) {
      if (sys.move?.affordable) expect(move.powerDelta).toBeGreaterThanOrEqual(sys.move.powerDelta);
    }
  });

  it('slices pass through the six-bucket breakdown (share bar source)', () => {
    const atlas = powerAtlas(defaultSave());
    expect(atlas.slices.map((x) => x.id)).toEqual(['towers', 'heroes', 'equipment', 'meta', 'collection', 'mulligans']);
    expect(atlas.score).toBeGreaterThanOrEqual(1000);
  });
});
