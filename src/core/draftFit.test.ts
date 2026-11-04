// DRAFT FIT · OPENING DRAFT · SPLICE (docs/CARDS.md §fit · §opening · §splice — Batch G "the grind").
// G1 measured that drafts did not matter: half the offers were hero/economy cards for a hero dealing
// 5–25 % of the damage and a bank 26k–49k Biomass deep, the rule slot kept offering a Parasite card to
// runs whose Parasite dealt 0.2 %, and the highest-rarity ◆PICK matched the strongest option 46 % of
// the time. These pin the fixes — and that every one of them is OFF on the golden path.

import { describe, it, expect } from 'vitest';
import { cardRegistry, cardSubject, cardToOption, draftCards, draftFeaturesFor, draftFitOf, draftPickIndex, isRuleChangingCard } from './cards';
import type { CardDef, DraftFit } from './cards';
import { DRAFT_FEATURES, DRAFT_FIT, SIM_DT, SPLICE, TOWER_ORDER } from './config';
import { Rng } from './rng';
import { Game } from './game';
import { generateStage } from './campaign';
import { towerSlots } from './map';
import { attachRecorder, replayRun } from './replay';
import type { ReplayCtorArgs } from './replay';
import type { MetaModifiers, TowerKind } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const ALL = new Set<TowerKind>(TOWER_ORDER);
const bySubject = (kind: string, tower?: TowerKind): CardDef[] =>
  cardRegistry.active().filter((c) => { const s = cardSubject(c); return s.kind === kind && (tower === undefined || (s.kind === 'tower' && s.tower === tower)); });

describe('draft fit — how well a card fits THIS run (§fit)', () => {
  const fit: DraftFit = { towerShare: { needle: 0.6, parasite: 0.002 }, heroShare: 0.08, bankRatio: 0 };

  it('tower cards follow their subject’s damage share (floored), global cards stay neutral', () => {
    const needle = bySubject('tower', 'needle')[0];
    const parasite = bySubject('tower', 'parasite')[0];
    expect(draftFitOf(needle, fit)).toBe(1); // ≥ shareForFull ⇒ full fit
    expect(draftFitOf(parasite, fit)).toBeCloseTo(DRAFT_FIT.floor, 2); // a 0.2 % dealer barely registers
    expect(draftFitOf(parasite, fit)).toBeGreaterThan(0); // …but a pivot stays possible
    for (const c of bySubject('global').slice(0, 5)) expect(draftFitOf(c, fit)).toBe(1);
  });

  it('hero cards follow the hero’s share; economy cards fade as the bank piles up', () => {
    const hero = bySubject('hero')[0];
    expect(draftFitOf(hero, fit)).toBeLessThan(draftFitOf(hero, { ...fit, heroShare: 0.4 }));
    const econ = bySubject('economy')[0];
    const lean = draftFitOf(econ, { ...fit, bankRatio: 0.5 });
    const flush = draftFitOf(econ, { ...fit, bankRatio: 50 }); // G1: 26k–49k banked at ~500/deploy
    expect(lean).toBeGreaterThan(0.85);
    expect(flush).toBeLessThan(0.1);
    expect(flush).toBeGreaterThanOrEqual(DRAFT_FIT.economyFloor);
  });

  it('a fit deal draws exactly as many rng values as the uniform deal (one per card)', () => {
    for (let seed = 1; seed < 40; seed++) {
      const a = new Rng(seed);
      const b = new Rng(seed);
      draftCards(a, 3, 4, ALL);
      draftCards(b, 3, 4, ALL, undefined, undefined, false, fit);
      expect(b.next()).toBe(a.next());
    }
  });

  it('deals lean toward the run’s real damage dealers', () => {
    let needle = 0;
    let parasite = 0;
    for (let seed = 1; seed <= 400; seed++) {
      for (const c of draftCards(new Rng(seed), 3, 4, ALL, undefined, undefined, false, fit)) {
        const s = cardSubject(c);
        if (s.kind === 'tower' && s.tower === 'needle') needle++;
        if (s.kind === 'tower' && s.tower === 'parasite') parasite++;
      }
    }
    expect(needle).toBeGreaterThan(parasite * 3);
  });

  it('recently offered cards come back far less often (no same-card carousel)', () => {
    const pool = cardRegistry.active().filter((c) => !c.unlock);
    const recent = new Set(pool.filter((_, i) => i % 2 === 0).map((c) => c.id)); // half of EVERY rarity tier
    let inRecent = 0;
    let total = 0;
    for (let seed = 1; seed <= 300; seed++) {
      for (const c of draftCards(new Rng(seed), 3, 0, ALL, undefined, undefined, false, { ...fit, towerShare: {}, heroShare: 0.4, recent })) {
        total++;
        if (recent.has(c.id)) inRecent++;
      }
    }
    expect(inRecent / total).toBeLessThan(0.4); // half the pool, well under half the offers
  });

  it('THE RULE SLOT only re-deals rules whose subject the run fields (G1: Contagion Bloom for a 0.2 % Parasite)', () => {
    const unlocked = new Set(cardRegistry.active().filter((c) => c.unlock).map((c) => c.id));
    let redealt = 0;
    for (let seed = 1; seed <= 300; seed++) {
      // Same seed with and without the slot: the deals match until the slot re-deals card 3.
      const plain = draftCards(new Rng(seed), 3, 6, ALL, unlocked, undefined, false, fit);
      const armed = draftCards(new Rng(seed), 3, 6, ALL, unlocked, undefined, true, fit);
      expect(armed.slice(0, 2).map((c) => c.id)).toEqual(plain.slice(0, 2).map((c) => c.id));
      if (armed[2].id !== plain[2].id) {
        redealt++;
        expect(isRuleChangingCard(armed[2])).toBe(true);
        expect(draftFitOf(armed[2], fit), armed[2].id).toBeGreaterThanOrEqual(DRAFT_FIT.ruleMinFit);
      }
    }
    expect(redealt).toBeGreaterThan(20); // the guarantee still fires — just with fielded rules
  });
});

describe('◆PICK — fit × Power, not rarity (§fit)', () => {
  const opt = (id: string, fit?: number) => {
    const o = cardToOption(cardRegistry.get(id)!);
    if (fit !== undefined) o.fit = fit;
    return o;
  };
  const strong = cardRegistry.active().filter((c) => cardSubject(c).kind === 'global' && c.effects.some((e) => e.op === 'mul' && e.field === 'towerDamageMult' && e.value >= 1.15))[0];
  const weak = cardRegistry.active().filter((c) => cardSubject(c).kind === 'economy' && c.effects.every((e) => e.op === 'biomass'))[0];

  it('without a fit it names the strongest option by Power', () => {
    expect(draftPickIndex([opt(weak.id), opt(strong.id)])).toBe(1);
  });

  it('an off-build card loses to a fitting one even when it is stronger on paper', () => {
    expect(draftPickIndex([opt(strong.id, 0.05), opt(weak.id, 1)])).toBe(1);
    expect(draftPickIndex([opt(strong.id, 1), opt(weak.id, 1)])).toBe(0);
  });
});

describe('who gets which feature (DRAFT_FEATURES)', () => {
  it('never in the tutorial; opening draft on Campaign from its stage; Splice from its clear (Daily: everyone)', () => {
    expect(draftFeaturesFor({ mode: 'campaign', stage: 40, tutorial: true, campaignCleared: 40 })).toEqual({});
    const deep = draftFeaturesFor({ mode: 'campaign', stage: DRAFT_FEATURES.opening.fromStage, tutorial: false, campaignCleared: 30 });
    expect(deep).toEqual({ draftFit: true, openingDraft: true, splice: true });
    const early = draftFeaturesFor({ mode: 'campaign', stage: 2, tutorial: false, campaignCleared: 1 });
    expect(early).toEqual({ draftFit: true });
    expect(draftFeaturesFor({ mode: 'endless', tutorial: false, campaignCleared: 50 }).openingDraft).toBeUndefined();
    expect(draftFeaturesFor({ mode: 'daily', tutorial: false, campaignCleared: 0 }).splice).toBe(true); // a shared board: same rules for all
  });
});

describe('the opening draft (§opening)', () => {
  const stage = generateStage(12, 'standard');

  it('a Campaign run opts in ⇒ it opens on a draft before wave 1, for the favorite, and returns to prep', () => {
    const g = new Game(5, NO_META, undefined, 'ravager', undefined, { mode: 'campaign', stage, openingDraft: true, draftFit: true, favorite: 'needle' });
    expect(g.phase).toBe('draft');
    expect(g.waveIndex).toBe(0);
    const snap = g.getSnapshot();
    expect(snap.draftKind).toBe('opening');
    expect(snap.draft).toHaveLength(3);
    for (const o of snap.draft!) {
      expect(o.fit).toBeGreaterThan(0);
      if (o.subject.kind === 'tower') expect(o.subject.tower).toBe('needle'); // only the favorite is fielded-to-be
    }
    g.chooseCard(snap.draft![0].id);
    expect(g.phase).toBe('prep');
    expect(g.getRunStats().cardIds).toEqual([snap.draft![0].id]);
  });

  it('without the option (and outside Campaign) the run opens in prep exactly as before', () => {
    expect(new Game(5, NO_META, undefined, 'ravager', undefined, { mode: 'campaign', stage }).phase).toBe('prep');
    expect(new Game(5, NO_META, undefined, 'ravager', undefined, { mode: 'endless', openingDraft: true }).phase).toBe('prep');
    expect(new Game(5, NO_META).getSnapshot().draft?.[0]?.fit).toBeUndefined();
  });
});

describe('SPLICE — the Biomass overflow becomes a draft (§splice)', () => {
  const boot = (opts: { splice?: boolean } = { splice: true }) => {
    const g = new Game(9, NO_META, undefined, 'ravager', undefined, { mode: 'endless', draftFit: true, ...opts });
    for (const s of towerSlots) if (g.placeTower('needle', s.x, s.y)) break;
    return g;
  };

  it('is unavailable without the feature and below the price — the price IS the threshold', () => {
    const off = boot({});
    off.debugAddBiomass(1e6);
    expect(off.canSplice()).toBe(false);
    expect(off.getSnapshot().spliceCost).toBe(-1);
    const g = boot();
    expect(g.getSnapshot().spliceCost).toBe(g.spliceCost());
    expect(g.biomass).toBeLessThan(g.spliceCost());
    expect(g.splice()).toBe(false);
  });

  it('pays the quoted price, opens a 1-of-3 splice draft, returns to the build phase, and costs more next time', () => {
    const g = boot();
    g.debugAddBiomass(1e5);
    const cost = g.spliceCost();
    expect(cost).toBe(Math.round(SPLICE.costDeploys * 100 * Math.pow(1.11, g.deployments)));
    const bio = g.biomass;
    expect(g.splice()).toBe(true);
    expect(g.biomass).toBe(bio - cost);
    expect(g.phase).toBe('draft');
    expect(g.getSnapshot().draftKind).toBe('splice');
    expect(g.getSnapshot().draftRerollCost).toBeGreaterThan(0); // its own one paid reroll
    expect(g.canSplice()).toBe(false); // never over an open draft
    g.chooseCard(g.getSnapshot().draft![0].id);
    expect(g.phase).toBe('prep');
    expect(g.spliceCost()).toBe(Math.round(cost * SPLICE.growth));
  });

  it('never mid-fight', () => {
    const g = boot();
    g.debugAddBiomass(1e5);
    g.startWave();
    g.advance(SIM_DT);
    expect(g.phase).toBe('wave');
    expect(g.canSplice()).toBe(false);
    expect(g.splice()).toBe(false);
  });
});

describe('draft spends replay exactly (core/replay.ts)', () => {
  it('a recorded run with a reroll and a splice re-simulates to the same outcome', () => {
    // A rich economy (meta ×biomass) so the run EARNS a splice — debug grants would be unrecorded.
    // Positional progress must be real objects (JSON turns `undefined` into null) — borrow the neutral ones.
    const neutral = new Game(1, NO_META) as unknown as { towerProgress: ReplayCtorArgs[2]; heroProgress: ReplayCtorArgs[4] };
    const args: ReplayCtorArgs = [77, { ...NO_META, biomassMult: 25 }, neutral.towerProgress, 'ravager', neutral.heroProgress, { mode: 'endless', draftFit: true, splice: true }];
    const game = new Game(...args);
    const rec = attachRecorder(game, args);
    let placed = 0;
    let spliced = false;
    let rerolled = false;
    for (let guard = 0; game.waveIndex < 4 && game.phase !== 'lost' && guard < 40_000; guard++) {
      if (game.phase === 'draft') {
        if (!rerolled && game.rerollDraft()) { rerolled = true; continue; }
        game.chooseCard(game.getSnapshot().draft![0].id);
        continue;
      }
      if (game.phase === 'prep') {
        for (let i = 0; i < 2 && placed < towerSlots.length; i++) {
          game.selectTower('needle');
          game.click(towerSlots[placed].x, towerSlots[placed].y);
          placed++;
        }
        if (!spliced && game.waveIndex >= 1 && game.canSplice()) {
          spliced = game.splice();
          continue;
        }
        game.startWave();
      }
      for (let i = 0; i < 30; i++) game.advance(SIM_DT);
    }
    expect(rerolled).toBe(true);
    expect(spliced).toBe(true);
    const outcome = { wave: game.waveIndex, kills: game.kills, integrity: Math.round(game.integrity), biomass: Math.round(game.biomass) };
    const replayed = replayRun(rec.finish({ wave: game.waveIndex, kills: game.kills }), 1_200);
    expect({ wave: replayed.wave, kills: replayed.kills, integrity: replayed.integrity, biomass: replayed.biomass }).toEqual(outcome);
    expect(rec.log.some((e) => e.op === 'rerollDraft')).toBe(true);
    expect(rec.log.some((e) => e.op === 'splice')).toBe(true);
  });
});
