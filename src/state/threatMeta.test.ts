// THREAT LADDER meta layer (docs/THREAT.md): the v55 save record (additive migration + sanitizer +
// merge), the settle (record, reward factor, milestone titles + frames + achievements — never
// Power), the derived baseline/ceiling, and THE AUTOMATION GATE's save-aware verdict.

import { describe, it, expect } from 'vitest';
import { meta } from './meta';
import type { RunResult } from './meta';
import { CURRENT_VERSION, defaultLifetimeStats, defaultSave, parseImport } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';
import { mergeSaves } from '../save/merge';
import { automationFor, campaignStageCleared, threatBaselineMet, threatMaxFor } from '../save/derive';
import { HERO_ORDER, TOWER_ORDER } from '../core/config';
import { THREAT_BENCHMARK, THREAT_MAX, threatRewardMult } from '../core/threat';
import { titleName, PROFILE_FRAMES } from './profile';
import { ACHIEVEMENTS } from './achievements';
import type { RunStats } from '../core/types';

function makeResult(over: Partial<RunResult>): RunResult {
  const zero = { kills: 0, damage: 0, activeTime: 0 };
  const mastery = TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['mastery'];
  const heroMastery = HERO_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['heroMastery'];
  const stats: RunStats = {
    kills: 0, wave: 0, won: false, biomassEarned: 0, damageDealt: 0, integrityLost: 0,
    killsByEnemy: defaultLifetimeStats().killsByEnemy,
    towerBuilds: TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: 0 }), {}) as RunStats['towerBuilds'],
    cardIds: [], heroId: HERO_ORDER[0], bossKills: 0,
  };
  return { wave: 0, kills: 0, won: false, mastery, heroMastery, stats, ...over };
}

/** A fresh account that has EARNED its way up the Infinite ladder through real settles: a deep
 *  baseline run (bestWave ⇒ the Threat-0 benchmark), then one cleared run per rung 1..`cleared`. */
function climbedInfinite(cleared: number): void {
  meta.reset();
  meta.abandonRun();
  meta.finishRun(makeResult({ wave: 40, kills: 400, endless: true }));
  for (let t = 1; t <= cleared; t++) meta.finishRun(makeResult({ wave: 20, kills: 200, endless: true, threat: t }));
}

const coreLane = (o: ReturnType<typeof meta.finishRun>): number =>
  o.reward.shardsEarned - (o.contracts ?? []).reduce((a, c) => a + c.cores, 0) - (o.perfectWeek?.cores ?? 0);

describe('v55 save — the Threat record', () => {
  it('schema is v55 and a fresh save starts every mode at 0', () => {
    expect(CURRENT_VERSION).toBeGreaterThanOrEqual(55); // v55 introduced the record (v56 = Batch G, additive)
    expect(defaultSave().threat).toEqual({ campaign: 0, endless: 0, bossRush: 0 });
  });

  it('migrates a pre-v55 save additively (missing ⇒ zeros) and sanitizes junk', () => {
    const legacy = { ...defaultSave() } as Record<string, unknown>;
    delete legacy.threat;
    const r = parseImport(JSON.stringify({ schemaVersion: 53, data: legacy }));
    expect(r.ok && r.data.threat).toEqual({ campaign: 0, endless: 0, bossRush: 0 });
    const junk = parseImport(JSON.stringify({ ...defaultSave(), threat: { campaign: 999, endless: -4, bossRush: 'x', bogus: 3 } }));
    expect(junk.ok && junk.data.threat).toEqual({ campaign: THREAT_MAX, endless: 0, bossRush: 0 });
  });

  it('merges as a monotonic record (per-mode maxima)', () => {
    const a = { ...defaultSave(), threat: { campaign: 4, endless: 1, bossRush: 0 } };
    const b = { ...defaultSave(), threat: { campaign: 2, endless: 6, bossRush: 3 } };
    expect(mergeSaves(a, b).threat).toEqual({ campaign: 4, endless: 6, bossRush: 3 });
  });
});

describe('derived ladder state + the automation gate', () => {
  const s = (patch: Partial<SaveData>): SaveData => ({ ...defaultSave(), ...patch });

  it('the Threat-0 baseline derives from EXISTING records (veterans start one rung up)', () => {
    expect(threatMaxFor(s({}), 'campaign')).toBe(0);
    expect(threatMaxFor(s({ campaign: { ...defaultSave().campaign, cleared: { standard: 1 } } }), 'campaign')).toBe(1);
    expect(threatBaselineMet(s({ bestWave: THREAT_BENCHMARK.endless.wave }), 'endless')).toBe(true);
    expect(threatMaxFor(s({ bestWave: 40, threat: { campaign: 0, endless: 4, bossRush: 0 } }), 'endless')).toBe(5);
    expect(threatMaxFor(s({ rushBestWave: 2, threat: { campaign: 0, endless: 0, bossRush: 3 } }), 'bossRush')).toBe(0); // baseline record missing ⇒ sealed
  });

  it('automation: cleared Campaign replays + Infinite only; frontier stages, Rush, Daily, tutorial and frontier Threat say why', () => {
    const vet = s({ campaign: { ...defaultSave().campaign, cleared: { standard: 8 } }, bestWave: 30, threat: { campaign: 2, endless: 2, bossRush: 0 } });
    expect(campaignStageCleared(vet, 8, 'standard')).toBe(true);
    expect(campaignStageCleared(vet, 9, 'standard')).toBe(false);
    expect(campaignStageCleared(vet, 3, 'nightmare')).toBe(false); // the frontier is per difficulty track
    expect(automationFor(vet, { mode: 'campaign', tutorial: false, stage: 5, difficulty: 'standard' }).allowed).toBe(true);
    const frontier = automationFor(vet, { mode: 'campaign', tutorial: false, stage: 9, difficulty: 'standard' });
    expect(frontier.allowed).toBe(false);
    expect(frontier.reason).toBe('Unlocks on stages you’ve cleared');
    expect(automationFor(vet, { mode: 'endless', tutorial: false, threat: 2 }).allowed).toBe(true);
    expect(automationFor(vet, { mode: 'endless', tutorial: false, threat: 3 }).reason).toMatch(/Threat/);
    expect(automationFor(vet, { mode: 'campaign', tutorial: false, stage: 5, difficulty: 'standard', threat: 3 }).allowed).toBe(false);
    expect(automationFor(vet, { mode: 'bossRush', tutorial: false }).allowed).toBe(false);
    expect(automationFor(vet, { mode: 'daily', tutorial: false }).allowed).toBe(false);
    expect(automationFor(vet, { mode: 'endless', tutorial: true }).allowed).toBe(false);
  });
});

describe('the settle — record, reward factor, cosmetic milestones (never Power)', () => {
  it('an Infinite run at Threat 3 pays ×threatRewardMult(3) on the core lane and records the clear', () => {
    climbedInfinite(2);
    expect(meta.get().threat.endless).toBe(2);
    const t0 = coreLane(meta.finishRun(makeResult({ wave: 20, kills: 200, endless: true })));
    climbedInfinite(2);
    const powerBefore = meta.power().score;
    const out = meta.finishRun(makeResult({ wave: 20, kills: 200, endless: true, threat: 3 }));
    const t3 = coreLane(out);
    expect(t3 / t0).toBeGreaterThan(threatRewardMult(3) * 0.98);
    expect(t3 / t0).toBeLessThan(threatRewardMult(3) * 1.02);
    expect(out.threat).toMatchObject({ mode: 'endless', level: 3, cleared: true, newRecord: true, nextUnlocked: 4 });
    expect(meta.get().threat.endless).toBe(3);
    // Milestone: Threat 3 grants its title (+ the achievement); the title resolves for the profile.
    expect(out.threat!.titles).toEqual(['threat_t3']);
    expect(meta.get().unlockedTitles).toContain('threat_t3');
    expect(titleName('threat_t3')).toBe('Threat-Tempered');
    expect(meta.get().achievements).toContain('threat_3');
    // The Power rule: Threat moves no Power bucket (cores are a currency, unspent here).
    expect(meta.power().score).toBe(powerBefore);
  });

  it('a Threat level above the earned ceiling settles CLAMPED (defense in depth)', () => {
    climbedInfinite(1);
    const out = meta.finishRun(makeResult({ wave: 20, kills: 100, endless: true, threat: 9 }));
    expect(out.threat!.level).toBe(2);
    expect(meta.get().threat.endless).toBe(2);
  });

  it('Threat is ignored off the ladder modes (Daily / Quick Skirmish settle at ×1, no record)', () => {
    climbedInfinite(0);
    const out = meta.finishRun(makeResult({ wave: 12, kills: 100, won: true, threat: 1 }));
    expect(out.threat).toBeUndefined();
    expect(meta.get().threat).toEqual({ campaign: 0, endless: 0, bossRush: 0 });
  });

  it('profile frames + achievements are registry rows over the record', () => {
    const top = { ...defaultSave(), threat: { campaign: 10, endless: 0, bossRush: 0 } };
    expect(PROFILE_FRAMES.find((f) => f.id === 'threat5')!.unlocked(top)).toBe(true);
    expect(PROFILE_FRAMES.find((f) => f.id === 'threat10')!.unlocked(defaultSave())).toBe(false);
    for (const id of ['threat_3', 'threat_5', 'threat_10']) {
      const a = ACHIEVEMENTS.find((x) => x.id === id)!;
      expect(a.test({ save: top }), id).toBe(true);
      expect(a.test({ save: defaultSave() }), id).toBe(false);
    }
  });
});
