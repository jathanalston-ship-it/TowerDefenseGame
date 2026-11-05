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
  FEATURES, FEATURE_BY_ID, REVEAL_CEILING_STAGE, cognitiveLoad, evalCondition, featureRevealed, featureView,
  earliestStage, guaranteedByStage, nextReveals, unlatchedReveals, unlockTimeline,
} from './unlocks';
import type { UnlockCondition } from './unlocks';
import { MECHANIC_BY_ID, isMechanicUnlocked } from './mechanics';
import { MECHANIC_TEXT } from './mechanicsText';
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

  it('no surface can be luck-locked: every feature is GUARANTEED by the reveal ceiling', () => {
    for (const f of FEATURES) {
      expect(guaranteedByStage(f.condition), `${f.id} has no stage/runs backbone`).toBeLessThanOrEqual(REVEAL_CEILING_STAGE);
    }
  });

  it('no luck-reveal past the core block: a deep wing never opens before its stage backbone', () => {
    // Re-paced 2026-11: early drops (gear, modifiers, Antigen, specimens, Ichor) bank silently and
    // surface AT the reveal — a resource branch would open a system before its new backstop.
    // History clauses (rushHistory/dailyHistory) are GRANDFATHERS for pre-gate saves, not luck.
    const GRANDFATHER = new Set<string>(['rushHistory', 'dailyHistory']);
    const noHistory = (c: UnlockCondition): UnlockCondition =>
      c.kind === 'any' ? { kind: 'any', of: c.of.filter((x) => !GRANDFATHER.has(x.kind)) } : c;
    for (const f of FEATURES) {
      if (guaranteedByStage(f.condition) <= 2) continue; // the core early block (vault/evolution) may fire on its first delivery
      if (f.id === 'cur:cells') continue; // Cells appear with the Molt that mints them (the Molt itself is campaign-gated)
      expect(earliestStage(noHistory(f.condition)), `${f.id} can reveal before its stage gate`).toBe(guaranteedByStage(f.condition));
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
    for (let stage = 1; stage <= REVEAL_CEILING_STAGE + 2; stage++) {
      const step = SCREENS.filter((f) => !featureRevealed(at(stage - 1), f.id) && featureRevealed(at(stage), f.id));
      expect(step.length, `stage ${stage} dumps ${step.map((f) => f.id).join(',')}`).toBeLessThanOrEqual(3);
    }
  });

  it('past the core block, every beat reveals at most TWO screens (the re-paced ≤2-per-beat rule)', () => {
    for (let stage = 3; stage <= REVEAL_CEILING_STAGE + 2; stage++) {
      const step = SCREENS.filter((f) => !featureRevealed(at(stage - 1), f.id) && featureRevealed(at(stage), f.id));
      expect(step.length, `stage ${stage} reveals ${step.map((f) => f.id).join(',')}`).toBeLessThanOrEqual(2);
    }
  });

  it('the reveals span the first ~10 hours: deep wings stay sealed through the first hour', () => {
    // Stage → hours (progression simulator, docs/PROGRESSION-GATING.md §timeline): stage ~12 ≈ 1h,
    // ~22 ≈ 2h, ~30 ≈ 10h. The pre-2026-11 timeline opened everything by stage 9.
    const hourOne = SCREENS.filter((f) => featureRevealed(at(12), f.id)).length;
    expect(hourOne, 'screens open after ~1h').toBeLessThanOrEqual(18);
    for (const id of ['hive', 'harvest', 'expeditions', 'infestation', 'metabolism', 'adaptation', 'mulligans', 'phenotypes', 'specimens', 'arena', 'auction']) {
      expect(featureRevealed(at(12), id), `${id} open in the first hour`).toBe(false);
    }
    expect(Math.max(...SCREENS.map((f) => guaranteedByStage(f.condition)))).toBeGreaterThanOrEqual(28);
  });

  it('a stage-30 veteran has everything: screens, currencies, zero teasers', () => {
    const vet = at(REVEAL_CEILING_STAGE, 90);
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
    expect(featureRevealed(s, 'equipment')).toBe(false); // no gear, no stage 6
    const latched: SaveData = { ...s, director: { revealed: { equipment: 3 }, visits: {} } };
    expect(featureRevealed(latched, 'equipment')).toBe(true); // the ledger wins
  });

  it('re-pace grandfather: wings an existing save already revealed stay open under the later gates', () => {
    // A stage-9 account from the old timeline latched everything (all wings opened by stage 9);
    // the 2026-11 re-pace moves most of them to stages 10–30 — the latch keeps every one.
    const oldVet = at(9, 20);
    const everything = Object.fromEntries(FEATURES.map((f) => [f.id, 5]));
    const latched: SaveData = { ...oldVet, director: { revealed: everything, visits: {} } };
    for (const f of FEATURES) expect(featureRevealed(latched, f.id), f.id).toBe(true);
    expect(featureRevealed(oldVet, 'auction')).toBe(false); // …while a fresh stage-9 save waits
  });

  it('unlatchedReveals reports exactly the newly-satisfied, never-latched features', () => {
    const s = at(3, 3);
    const fresh = unlatchedReveals(s);
    expect(fresh).toContain('infinite');
    expect(fresh).not.toContain('market'); // stage 8 since the 2026-11 re-pace
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
        expect((MECHANIC_TEXT[row!.id]?.[k] ?? '').length, `${f.teach}.${k} empty`).toBeGreaterThan(10);
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
  it('a currency chip never precedes its purpose: Ichor with the Market, Materials with the Archive, Cells with the Molt', () => {
    for (let stage = 0; stage <= REVEAL_CEILING_STAGE; stage++) {
      const s = at(stage);
      expect(featureRevealed(s, 'cur:ichor'), `ichor @${stage}`).toBe(featureRevealed(s, 'market'));
      expect(featureRevealed(s, 'cur:mats'), `mats @${stage}`).toBe(featureRevealed(s, 'genes')); // Gene Essence is its first member
    }
    // Banked Ichor never reveals the chip early (it waits for its sink).
    expect(featureRevealed({ ...at(4), ichor: 25, lifetimeIchor: 25 }, 'cur:ichor')).toBe(false);
    const molted: SaveData = { ...at(12), prestige: { ...at(12).prestige, molts: 1, cells: 14, lifetimeCells: 14 } };
    expect(featureRevealed(molted, 'cur:cells')).toBe(true); // the first Molt mints → the chip appears
    expect(featureRevealed(at(12), 'cur:cells')).toBe(false); // no empty prestige wallet in the first hour
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
