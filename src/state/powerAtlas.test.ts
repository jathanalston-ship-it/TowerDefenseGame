// Power Atlas (docs/POWER-SCORE.md §atlas) — one row per Power system, advisor-exact moves,
// honest tend notes, and a cross-system "best move now" that only ever names an affordable,
// strictly-positive gain.

import { describe, expect, it } from 'vitest';
import { powerAtlas } from './powerAtlas';
import { bestPurchase, canBuyNow, purchaseCandidates } from './bestPurchase';
import { evolutionStarCap } from './meta';
import { notifications } from './notifications';
import { recommendationsFor } from './recommendations';
import './notificationSources';
import { defaultSave } from '../save/saveStore';
import { TOWER_ORDER } from '../core/config';
import { isOpenNav } from './unlocks';

const IDS = ['towers', 'heroes', 'evolution', 'genes', 'adaptation', 'equipment', 'mulligans', 'collection'];

describe('powerAtlas', () => {
  it('fresh save: only REACHED wings have rows (the seal rule), notes non-empty, no headline lies', () => {
    const fresh = defaultSave();
    const atlas = powerAtlas(fresh);
    expect(atlas.systems.map((s) => s.id)).toEqual(IDS.filter((id) => isOpenNav(fresh, atlas.systems.find((x) => x.id === id)?.nav ?? id)));
    expect(atlas.systems.map((s) => s.id)).not.toContain('adaptation'); // stage 24 — sealed on a fresh account
    for (const s of atlas.systems) {
      expect(s.note.length).toBeGreaterThan(0);
      expect(s.nav.length).toBeGreaterThan(0);
    }
    if (atlas.headline) {
      expect(atlas.headline.move.affordable).toBe(true);
      expect(atlas.headline.move.powerDelta).toBeGreaterThan(0);
    }
  });

  it('a sealed wing can never be the best move — banked Antigen waits for the Chamber (reported 2026-11-06)', () => {
    const s = defaultSave();
    s.campaign.cleared = { standard: 12 }; // well short of the Adaptation Chamber (stage 24)
    s.towerMasteryXp = { ...s.towerMasteryXp, needle: 1e9 }; // a fat Antigen budget, banked
    const atlas = powerAtlas(s);
    expect(atlas.systems.some((x) => x.id === 'adaptation')).toBe(false);
    expect(atlas.headline?.move.action.type).not.toBe('adapt');
    for (const sys of atlas.systems) expect(isOpenNav(s, sys.nav), sys.id).toBe(true);
    s.campaign.cleared = { standard: 24 }; // the Chamber opens → the same budget is advisable
    expect(powerAtlas(s).systems.some((x) => x.id === 'adaptation' && x.move !== null)).toBe(true);
  });

  it('developed save: every system has its row', () => {
    const s = defaultSave();
    s.campaign.cleared = { standard: 30 };
    s.totalRuns = 25;
    expect(powerAtlas(s).systems.map((x) => x.id)).toEqual(IDS);
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

describe('gated moves — the Evolution Cap (owner playtest 2026-11-11: a Buy that did nothing)', () => {
  // A tower AT the Evolution Cap with Strain Samples to spare is
  // "affordable" by wallet but refused by buyStar — it must read as blocked everywhere.
  const capped = () => {
    const s = defaultSave();
    s.campaign.cleared = { standard: 10 }; // the Tower Lab + Evolution HQ wings are open; the cap still bites
    const k = TOWER_ORDER[0];
    s.towerStars = { ...s.towerStars, [k]: evolutionStarCap(s) };
    s.towerShards = { ...s.towerShards, [k]: 1e6 };
    return { s, k };
  };

  it('a capped ★ carries its gate and is never the buyable pick', () => {
    const { s, k } = capped();
    const c = purchaseCandidates(s, 'towers').find((x) => x.id === k)!;
    expect(c.affordable).toBe(true); // the wallet covers it …
    expect(c.blocked).toMatch(/Evolution Cap/); // … the campaign does not
    expect(canBuyNow(c)).toBe(false);
    expect(bestPurchase(s, 'towers').bestAffordable?.id).not.toBe(k);
  });

  it('the headline prefers an actionable move; a gated one only shows (greyed) when nothing else is buyable', () => {
    const { s } = capped();
    const atlas = powerAtlas(s);
    expect(atlas.systems.find((x) => x.id === 'towers')!.readyCount).toBe(0); // not "ready"
    if (atlas.headline && !atlas.headline.move.blocked) expect(atlas.headline.move.affordable).toBe(true);
    // Nothing else affordable ⇒ the gated star may be the headline — then it carries its reason.
    if (atlas.headline?.move.blocked) expect(atlas.headline.move.blocked).toMatch(/Evolution Cap/);
    s.shards = 1e6; // now an Evolution HQ upgrade is buyable → it outranks the gated star
    const rich = powerAtlas(s);
    expect(rich.headline).not.toBeNull();
    expect(rich.headline!.move.blocked).toBeUndefined();
  });

  it('the Tower Lab badge does not count a capped ★ (it does once the star is under the cap)', () => {
    const { s, k } = capped();
    const broke = { ...s, towerShards: { ...s.towerShards, [k]: 0 } }; // same save, no Strain Samples
    const base = notifications.badges(broke).towers ?? 0;
    expect(notifications.badges(s).towers ?? 0).toBe(base); // capped + rich ⇒ no extra badge
    const under = { ...s, towerStars: { ...s.towerStars, [k]: evolutionStarCap(s) - 1 } };
    expect(notifications.badges(under).towers ?? 0).toBe(base + 1); // a real decision ⇒ it badges
  });

  it('recommendations never advise a locked teaser', () => {
    const s = defaultSave();
    s.campaign.cleared = { standard: 2 };
    expect(recommendationsFor(s, { limit: 20 }).some((r) => r.kind === 'unlock')).toBe(false);
  });
});
