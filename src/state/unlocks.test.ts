// PROGRESSION GATING enforcement (docs/PROGRESSION-GATING.md §validation) — the automated
// contracts behind "the game reveals itself one learnable beat at a time":
//   • every Hub screen is claimed by exactly one FeatureDef (parsing the real NavKey union, so a
//     future screen FAILS CI until it declares its place on the learning curve);
//   • no screen can be luck-locked (every condition carries a stage/runs backbone) and everything
//     is guaranteed open by the Boss Rush gate;
//   • a fresh account is CALM (four screens, two teasers) and never hits a reveal desert;
//   • reveals latch (a surface never re-seals) and veterans auto-pass;
//   • every gated screen has TEACH coverage (a mechanics row on the same nav) whose announcement
//     fires exactly when the screen reveals (single source of truth);
//   • the generated docs/UNLOCK-TREE.md is fresh.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { defaultSave, type SaveData } from '../save/saveStore';
import {
  FEATURES, FEATURE_BY_ID, cognitiveLoad, evalCondition, featureRevealed, featureView,
  guaranteedByStage, nextReveals, unlatchedReveals, unlockTimeline,
} from './unlocks';
import { MECHANIC_BY_ID, isMechanicUnlocked } from './mechanics';
import { nextGoals } from './nextGoal';
import { MODE_UNLOCKS } from '../core/config';

/** The canonical walk: run k has cleared stage k (resource conditions stay unfired, so this is
 *  the WORST-CASE reveal path — every backstop must carry it). */
function at(stage: number, runs = stage): SaveData {
  const s = defaultSave();
  return { ...s, totalRuns: runs, campaign: { ...s.campaign, cleared: stage > 0 ? { standard: stage } : {} } };
}

const SCREENS = FEATURES.filter((f) => f.kind === 'screen');

describe('unlock registry — structural contracts', () => {
  it('covers the Hub NavKey union exactly (a new screen must join the learning curve)', () => {
    const model = readFileSync('src/ui/navModel.ts', 'utf-8'); // the nav IA's single source of truth
    const union = /export type NavKey =([\s\S]*?);/.exec(model);
    expect(union, 'NavKey union not found in navModel.ts').toBeTruthy();
    const navKeys = [...union![1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
    expect(SCREENS.map((f) => f.id).sort()).toEqual(navKeys);
  });

  it('ids and orders are unique; currencies carry the cur: prefix', () => {
    expect(new Set(FEATURES.map((f) => f.id)).size).toBe(FEATURES.length);
    expect(new Set(FEATURES.map((f) => f.order)).size).toBe(FEATURES.length);
    for (const f of FEATURES.filter((x) => x.kind === 'currency')) expect(f.id).toMatch(/^cur:/);
  });

  it('no surface can be luck-locked: every feature is GUARANTEED by the Boss Rush gate', () => {
    for (const f of FEATURES) {
      expect(guaranteedByStage(f.condition), `${f.id} has no stage/runs backbone`).toBeLessThanOrEqual(MODE_UNLOCKS.bossRush);
    }
  });

  it('every row justifies its timing and hooks its teaser', () => {
    for (const f of FEATURES) {
      expect(f.because.length, `${f.id} missing justification`).toBeGreaterThan(20);
      expect(f.blurb.length, `${f.id} missing teaser blurb`).toBeGreaterThan(5);
    }
  });
});

describe('the learning curve — pacing contracts', () => {
  it('a brand-new account is CALM: five screens, Cores-only wallet, two teasers queued', () => {
    const fresh = at(0, 0);
    const revealed = SCREENS.filter((f) => featureRevealed(fresh, f.id)).map((f) => f.id).sort();
    // 'store' joined the minute-0 set by operator decision (2026-07) — the supporter door
    // is always open. Five screens still sits inside the 'calm' band (≤6).
    expect(revealed).toEqual(['campaign', 'help', 'home', 'settings', 'store']);
    const load = cognitiveLoad(fresh, 0);
    expect(load.band).toBe('calm');
    expect(load.currencies).toBe(2); // Genome Cores + Biomass — nothing else yet
    expect(nextReveals(fresh, 2).map((v) => v.def.id)).toEqual(['profile', 'vault']);
  });

  it('no reveal desert: every stage 1–7 on the worst-case walk opens at least one new screen', () => {
    // Stage 8's beat WAS the Premium Store; the operator un-gated it to minute 0 (2026-07),
    // so the guaranteed reveal cadence now ends at stage 7 (Boss Rush lands at 10).
    for (let stage = 1; stage <= 7; stage++) {
      const before = SCREENS.filter((f) => featureRevealed(at(stage - 1), f.id)).length;
      const after = SCREENS.filter((f) => featureRevealed(at(stage), f.id)).length;
      expect(after, `stage ${stage} revealed nothing new`).toBeGreaterThan(before);
    }
  });

  it('no overload beat: no single worst-case stage reveals more than three screens', () => {
    for (let stage = 1; stage <= 12; stage++) {
      const step = SCREENS.filter((f) => !featureRevealed(at(stage - 1), f.id) && featureRevealed(at(stage), f.id));
      expect(step.length, `stage ${stage} dumps ${step.map((f) => f.id).join(',')}`).toBeLessThanOrEqual(3);
    }
  });

  it('a stage-12 veteran has everything: screens, currencies, zero teasers', () => {
    const vet = at(12, 40);
    for (const f of FEATURES) expect(featureRevealed(vet, f.id), f.id).toBe(true);
    expect(nextReveals(vet, 2)).toEqual([]);
    expect(cognitiveLoad(vet, 0).band).toBe('full');
  });

  it('the reveal order (nav teaser order) matches the guaranteed timeline', () => {
    // Within screens, `order` must never contradict the guaranteed stages — a feature the
    // player is TOLD comes next can't be guaranteed later than one queued behind it.
    const byOrder = [...SCREENS].sort((a, b) => a.order - b.order).map((f) => guaranteedByStage(f.condition));
    for (let i = 1; i < byOrder.length; i++) {
      expect(byOrder[i], `order position ${i} regresses the guaranteed timeline`).toBeGreaterThanOrEqual(byOrder[i - 1] - 1); // ≤1 stage of resource-driven slack
    }
  });
});

describe('latching + grandfathering', () => {
  it('a latched reveal never re-seals when its resource condition regresses', () => {
    const s = at(0, 5);
    expect(featureRevealed(s, 'equipment')).toBe(false); // no gear, no stage 4
    const latched: SaveData = { ...s, director: { revealed: { equipment: 3 }, visits: {} } };
    expect(featureRevealed(latched, 'equipment')).toBe(true); // the ledger wins
  });

  it('unlatchedReveals reports exactly the newly-satisfied, never-latched features', () => {
    const s = at(3, 3);
    const fresh = unlatchedReveals(s);
    expect(fresh).toContain('infinite');
    expect(fresh).toContain('market');
    expect(fresh).not.toContain('bossrush');
    const partly: SaveData = { ...s, director: { revealed: { infinite: 1 }, visits: {} } };
    expect(unlatchedReveals(partly)).not.toContain('infinite');
  });

  it('veteran histories auto-pass their earned gates (Boss Rush / Daily grandfather clauses)', () => {
    const rushVet: SaveData = { ...at(4), rushBestWave: 6 };
    expect(featureRevealed(rushVet, 'bossrush')).toBe(true);
    const dailyVet: SaveData = { ...at(2), daily: { ...defaultSave().daily, completions: 3 } };
    expect(featureRevealed(dailyVet, 'daily')).toBe(true);
  });
});

describe('teach coverage — every unlock explains itself', () => {
  const SELF_EVIDENT = new Set(['home', 'help', 'settings', 'profile']); // no ceremony needed
  it('every gated screen names a mechanics row on its own nav', () => {
    for (const f of SCREENS) {
      if (SELF_EVIDENT.has(f.id)) continue;
      expect(f.teach, `${f.id} has no teach row`).toBeTruthy();
      const row = MECHANIC_BY_ID.get(f.teach!);
      expect(row, `${f.id} → missing mechanic '${f.teach}'`).toBeTruthy();
      expect(row!.nav, `${f.id} teach row points at the wrong nav`).toBe(f.id);
      for (const k of ['what', 'why', 'where', 'next'] as const) {
        expect((row![k] ?? '').length, `${f.teach}.${k} empty`).toBeGreaterThan(10);
      }
    }
  });

  it("non-core teach rows announce EXACTLY when their screen reveals (What's New sync)", () => {
    for (const f of SCREENS) {
      const row = f.teach ? MECHANIC_BY_ID.get(f.teach) : undefined;
      if (!row || row.core) continue; // core rows live in the wiki from minute 0 by design
      for (let stage = 0; stage <= 12; stage++) {
        const s = at(stage);
        expect(isMechanicUnlocked(row, s), `${f.id} vs ${row.id} at stage ${stage}`).toBe(featureRevealed(s, f.id));
      }
    }
  });
});

describe('economy coherence + director integration', () => {
  it('a currency chip never precedes its purpose: Ichor reveals with the Market, Cells before Prestige', () => {
    for (let stage = 0; stage <= 12; stage++) {
      const s = at(stage);
      if (featureRevealed(s, 'cur:ichor')) expect(featureRevealed(s, 'market')).toBe(true);
    }
    expect(featureRevealed(at(9), 'cur:cells')).toBe(true); // teased one stage before the Molt gate (10)
    expect(featureRevealed(at(8), 'cur:cells')).toBe(false);
  });

  it("the Next-Goal engine surfaces the next reveal as a chaseable 'reveal' goal", () => {
    const s = at(2, 4); // 2/3 toward Infinite
    const goal = nextGoals(s, 8).find((g) => g.kind === 'reveal');
    expect(goal).toBeTruthy();
    expect(goal!.label).toContain('Infinite');
    expect(goal!.nav).toBe('campaign');
  });

  it('featureView progress is live and clamped', () => {
    const v = featureView(at(2), 'infinite');
    expect(v.revealed).toBe(false);
    expect(v.progress).toBeCloseTo(2 / MODE_UNLOCKS.infinite, 5);
    expect(v.label).toContain(`Stage ${MODE_UNLOCKS.infinite}`);
    expect(FEATURE_BY_ID.get('infinite')).toBeTruthy();
  });
});

describe('generated unlock tree', () => {
  it('docs/UNLOCK-TREE.md is fresh (run `npm run unlocks`)', () => {
    const doc = readFileSync('docs/UNLOCK-TREE.md', 'utf-8');
    expect(doc).toContain(`${FEATURES.length} features`);
    for (const f of FEATURES) expect(doc, `tree missing ${f.id}`).toContain(`\`${f.id}\``);
  });

  it('the timeline query orders by guaranteed stage', () => {
    const t = unlockTimeline();
    for (let i = 1; i < t.length; i++) expect(t[i].guaranteedBy).toBeGreaterThanOrEqual(t[i - 1].guaranteedBy);
    expect(evalCondition({ kind: 'always' }, at(0)).done).toBe(true);
  });
});
