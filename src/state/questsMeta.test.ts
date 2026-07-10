// Quests meta pipeline (docs/QUESTS.md): crediting seams into both lanes, weekly rollover
// mail + reset (progress NEVER carries over), the clock-tamper max-window rule, mission and
// finale claims (one-time cutscene + cosmetic grants, repeat substitution), sequential
// chapter gating, the collections wiring, and the save sanitizer's guarantees.

import { beforeEach, describe, expect, it } from 'vitest';
import { meta, collectionContextOf } from './meta';
import { collectionView } from '../core/collection';
import { MAIN_QUESTLINE, QUESTS, WEEKLY_QUESTS, weeklyQuestFor } from '../core/quests';
import type { QuestRunFacts } from '../core/quests';
import { cutsceneDef } from '../core/cutscenes';
import { isCutsceneUnlocked } from '../save/derive';
import { defaultSave, serializeExport } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';

beforeEach(() => meta.reset());

// A fixed clock inside window 0 of the weekly ring (the epoch is Monday 2026-07-06 UTC).
const T0 = QUESTS.epochMs + 3_600_000;
const WEEK = QUESTS.rotationMs;

const run = (over: Partial<QuestRunFacts> = {}): { type: 'run'; facts: QuestRunFacts } => ({
  type: 'run',
  facts: {
    mode: 'stage', won: true, wave: 10, kills: 100, integrityLost: 0,
    towerBuilds: { needle: 4 }, heroId: 'myco', bossKills: 2, megaKills: 0, ...over,
  },
});

/** Inject an arbitrary save through the REAL import path (parseImport → sanitizers). */
function inject(mutate: (s: SaveData) => SaveData): void {
  const result = meta.importText(serializeExport(mutate(defaultSave())));
  expect(result.ok).toBe(true);
}

describe('crediting', () => {
  it('a settled run feeds the live weekly quest AND the active chapter — and only those', () => {
    meta.creditQuests(run({ kills: 150, wave: 14 }), T0);
    const q = meta.get().quests;
    const weekly = weeklyQuestFor(0); // wk_red_harvest
    expect(q.weekly.progress[`${weekly.id}:reap`]).toBe(150);
    expect(q.weekly.progress[`${weekly.id}:stand`]).toBe(1);
    expect(q.weekly.progress[`${weekly.id}:deep`]).toBe(1); // wave 14
    expect(q.main.progress['mq_awakening:stir']).toBe(1);
    expect(q.main.progress['mq_awakening:cull']).toBe(150);
    // Chapter II never accrues while Chapter I is active.
    expect(Object.keys(q.main.progress).some((id) => id.startsWith('mq_choirs:'))).toBe(false);
  });

  it('meta seams credit their own verbs; completion enters the lifetime missionsDone codex', () => {
    meta.creditQuests({ type: 'containers', n: 3 }, T0);
    const q = meta.get().quests;
    expect(q.weekly.progress['wk_red_harvest:crack']).toBe(3); // target 3 → complete
    expect(q.missionsDone).toContain('wk_red_harvest:crack');
    expect(q.main.progress['mq_awakening:larder']).toBe(2); // capped at its target of 2
    expect(q.missionsDone).toContain('mq_awakening:larder');
    // Re-crediting a finished mission neither moves it nor duplicates the codex entry.
    meta.creditQuests({ type: 'containers', n: 5 }, T0);
    const q2 = meta.get().quests;
    expect(q2.weekly.progress['wk_red_harvest:crack']).toBe(3);
    expect(q2.missionsDone.filter((id) => id === 'wk_red_harvest:crack')).toHaveLength(1);
  });

  it('pass level-ups flow into passLevels missions through grantPassXp', () => {
    meta.grantPassXp('test', 1000, T0); // several early levels
    const q = meta.get().quests;
    expect(q.main.progress['mq_awakening:season']).toBeGreaterThanOrEqual(2);
  });
});

describe('mission claims', () => {
  it('refuses unearned/unknown/foreign missions; pays earned ones exactly once', () => {
    expect(meta.claimQuestMission('wk_red_harvest:crack', T0)).toBeNull(); // unearned
    expect(meta.claimQuestMission('nope:nope', T0)).toBeNull();
    expect(meta.claimQuestMission('wk_deep_signals:sorties', T0)).toBeNull(); // not this window's quest
    meta.creditQuests({ type: 'containers', n: 3 }, T0);
    const before = meta.get().shards;
    const lines = meta.claimQuestMission('wk_red_harvest:crack', T0);
    expect(lines).not.toBeNull();
    expect(meta.get().shards).toBe(before + 150); // 150 cores authored on that mission
    expect(meta.get().quests.weekly.claimed).toContain('wk_red_harvest:crack');
    expect(meta.claimQuestMission('wk_red_harvest:crack', T0)).toBeNull(); // once
  });

  it('main-lane missions claim only while their chapter is ACTIVE', () => {
    meta.creditQuests({ type: 'containers', n: 2 }, T0);
    expect(meta.claimQuestMission('mq_awakening:larder', T0)).not.toBeNull();
    // Chapter II's counterpart is locked (not the active chapter) even if somehow progressed.
    expect(meta.claimQuestMission('mq_choirs:vault', T0)).toBeNull();
  });
});

/** Drive the CURRENT weekly quest to full completion at time `now` (pure credit calls). */
function completeWeekly(now: number): void {
  meta.creditQuests(run({ kills: 400, wave: 14, bossKills: 6 }), now); // reap + deep + clean + stand(1) + tyrants
  meta.creditQuests(run({ kills: 0, wave: 1, bossKills: 0 }), now); // stand(2)
  meta.creditQuests({ type: 'containers', n: 3 }, now); // crack
}

describe('the weekly finale', () => {
  it('first completion grants the story cutscene + exclusive cosmetic FOREVER (and premieres)', () => {
    completeWeekly(T0);
    const view = meta.quests(T0);
    expect(view.weekly.complete).toBe(true);
    expect(view.weekly.finaleClaimable).toBe(true);
    expect(view.weekly.firstTime).toBe(true);
    const lines = meta.claimQuestFinale('wk_red_harvest', T0)!;
    expect(lines).not.toBeNull();
    const s = meta.get();
    expect(s.quests.once).toContain('cutscene:wk_red_harvest');
    expect(s.quests.once).toContain('cosmetic:wk_red_harvest');
    expect(s.wardrobe.owned).toContain('wd_projectiletrail_reaper_s_wake');
    expect(s.wardrobe.pendingReveal).toContain('wd_projectiletrail_reaper_s_wake');
    expect(isCutsceneUnlocked(s, cutsceneDef('story:red_harvest')!)).toBe(true);
    expect(s.quests.questCompletions['wk_red_harvest']).toBe(1);
    expect(s.quests.weekly.completionClaimed).toBe(true);
    expect(meta.claimQuestFinale('wk_red_harvest', T0)).toBeNull(); // once per window
    // The receipt names both one-time unlocks.
    expect(lines.some((l) => l.label.includes('THE RED HARVEST'))).toBe(true);
    expect(lines.some((l) => l.label.includes('Reaper’s Wake'))).toBe(true);
  });

  it('claiming the finale auto-claims earned-but-unclaimed missions first (nothing strands)', () => {
    completeWeekly(T0);
    const before = meta.get().shards;
    meta.claimQuestFinale('wk_red_harvest', T0);
    // Missions authored: 140+180+150 cores + finale 260 cores (+ containers/ichor/essence lines).
    expect(meta.get().shards - before).toBeGreaterThanOrEqual(140 + 180 + 150 + 260);
    expect(meta.get().quests.weekly.claimed.length).toBe(WEEKLY_QUESTS[0].missions.length);
  });

  it('a REPEAT completion (3 windows later, same quest) substitutes currency for the unlocks', () => {
    completeWeekly(T0);
    meta.claimQuestFinale('wk_red_harvest', T0);
    const t3 = T0 + 3 * WEEK; // the ring wraps back to wk_red_harvest
    meta.pollWeeklyQuest(t3);
    expect(meta.quests(t3).weekly.quest.id).toBe('wk_red_harvest');
    expect(meta.quests(t3).weekly.firstTime).toBe(false);
    completeWeekly(t3);
    const ichorBefore = meta.get().ichor;
    const lines = meta.claimQuestFinale('wk_red_harvest', t3)!;
    expect(lines.some((l) => l.label.includes('unlocked'))).toBe(true); // the substitution line
    const s = meta.get();
    expect(s.quests.questCompletions['wk_red_harvest']).toBe(2);
    expect(s.quests.once.filter((k) => k === 'cutscene:wk_red_harvest')).toHaveLength(1);
    expect(s.wardrobe.owned.filter((id) => id === 'wd_projectiletrail_reaper_s_wake')).toHaveLength(1);
    // The auto-claimed flawless mission (14) + finale ichor (30) + the substitution (40).
    expect(s.ichor - ichorBefore).toBe(14 + 30 + QUESTS.repeatFinale.ichor);
  });
});

describe('rotation: rollover mail, reset, tamper', () => {
  it('rollover auto-claims earned unclaimed rewards (finale included), then resets clean', () => {
    completeWeekly(T0); // everything earned, NOTHING claimed
    const coresBefore = meta.get().shards;
    meta.pollWeeklyQuest(T0 + WEEK);
    const s = meta.get();
    // Mail: all six missions + the finale paid out…
    expect(s.shards).toBeGreaterThan(coresBefore + 700);
    expect(s.quests.once).toContain('cutscene:wk_red_harvest');
    expect(s.quests.questCompletions['wk_red_harvest']).toBe(1);
    // …and the incoming week is pristine: progress NEVER carries over.
    expect(s.quests.weekly.window).toBe(1);
    expect(s.quests.weekly.progress).toEqual({});
    expect(s.quests.weekly.claimed).toEqual([]);
    expect(s.quests.weekly.completionClaimed).toBe(false);
    expect(meta.quests(T0 + WEEK).weekly.quest.id).toBe('wk_deep_signals');
  });

  it('partial progress is mailed only for EARNED missions; the rest evaporates with the window', () => {
    meta.creditQuests({ type: 'containers', n: 3 }, T0); // crack earned; reap sits at 0
    meta.creditQuests(run({ kills: 50 }), T0); // reap 50/400 — unearned
    const coresBefore = meta.get().shards;
    meta.pollWeeklyQuest(T0 + WEEK);
    const s = meta.get();
    expect(s.shards).toBe(coresBefore + 150); // only crack's 150 cores mailed
    expect(s.quests.weekly.progress).toEqual({});
    expect(s.quests.questCompletions['wk_red_harvest']).toBeUndefined();
  });

  it('the max-window rule: a rolled-back clock can neither regress nor re-mail', () => {
    completeWeekly(T0);
    meta.pollWeeklyQuest(T0 + WEEK); // window 1
    const snapshot = meta.get().quests;
    meta.pollWeeklyQuest(T0); // clock rolled back into window 0
    expect(meta.get().quests).toEqual(snapshot); // untouched
    meta.creditQuests(run(), T0); // credits land on the RECORDED window's quest (deep signals)
    expect(meta.get().quests.weekly.progress['wk_deep_signals:sorties']).toBe(1);
    expect(meta.get().quests.weekly.window).toBe(1);
  });
});

describe('the main questline', () => {
  /** Drive chapter I to completion (10 missions) with pure credit calls at `now`. */
  function completeChapterOne(now: number): void {
    meta.creditQuests(run({ mode: 'campaign', kills: 500, wave: 8, bossKills: 3 }), now); // stir1 hold1 cull descent wall taste clean
    meta.creditQuests(run({ kills: 0, wave: 1, bossKills: 0 }), now); // stir2 hold2
    meta.creditQuests(run({ won: false, kills: 0, wave: 1, integrityLost: 5, bossKills: 0 }), now); // stir3
    meta.creditQuests({ type: 'containers', n: 2 }, now); // larder
    meta.creditQuests({ type: 'expeditions', n: 1 }, now); // scout
    meta.creditQuests({ type: 'passLevels', n: 2 }, now); // season
  }

  it('claiming Chapter I opens Chapter II; the ledger is permanent', () => {
    completeChapterOne(T0);
    const view = meta.quests(T0);
    expect(view.main[0].finaleClaimable).toBe(true);
    expect(view.main[1].state).toBe('locked');
    const lines = meta.claimQuestFinale('mq_awakening', T0)!;
    expect(lines).not.toBeNull();
    const s = meta.get();
    expect(s.quests.main.completions).toEqual(['mq_awakening']);
    expect(s.wardrobe.owned).toContain('wd_emblem_first_eye');
    expect(isCutsceneUnlocked(s, cutsceneDef('story:mq_awakening')!)).toBe(true);
    const after = meta.quests(T0);
    expect(after.main[0].state).toBe('done');
    expect(after.main[1].state).toBe('active');
    expect(meta.claimQuestFinale('mq_awakening', T0)).toBeNull(); // chapters never re-claim
    // Chapter II accrues now.
    meta.creditQuests(run({ megaKills: 1 }), T0);
    expect(meta.get().quests.main.progress['mq_choirs:colossus']).toBe(1);
  });
});

describe('collections & sanitizer', () => {
  it('quest completions + missions feed the two codices', () => {
    completeWeekly(T0);
    meta.claimQuestFinale('wk_red_harvest', T0);
    const v = collectionView(collectionContextOf(meta.get()));
    const quests = v.categories.find((c) => c.id === 'quests')!;
    expect(quests.total).toBe(WEEKLY_QUESTS.length + MAIN_QUESTLINE.length);
    expect(quests.entries.find((e) => e.id === 'wk_red_harvest')!.tier).toBe(1); // Answered
    const missions = v.categories.find((c) => c.id === 'missions')!;
    expect(missions.discovered).toBeGreaterThanOrEqual(6);
  });

  it('the sanitizer drops unknown ids, clamps progress, and validates the once ledger', () => {
    inject((s) => ({
      ...s,
      quests: {
        weekly: { window: 2, progress: { 'wk_long_watch:hold': 99, 'ghost:mission': 5 }, claimed: ['wk_long_watch:hold', 'nope'], completionClaimed: false },
        main: { progress: { 'mq_awakening:cull': -3 }, claimed: [], completions: ['mq_awakening', 'wk_red_harvest', 'junk'] },
        once: ['cutscene:wk_red_harvest', 'cosmetic:nope', 'garbage', 'cutscene:mq_root'],
        missionsDone: ['wk_long_watch:hold', 'wk_long_watch:hold', 'bogus'],
        questCompletions: { wk_red_harvest: 2.9, junk: 5, mq_root: 0 },
      } as SaveData['quests'],
    }));
    const q = meta.get().quests;
    expect(q.weekly.window).toBe(2);
    expect(q.weekly.progress).toEqual({ 'wk_long_watch:hold': 3 }); // clamped to target, ghost dropped
    expect(q.weekly.claimed).toEqual(['wk_long_watch:hold']);
    expect(q.main.progress).toEqual({}); // negatives sanitize away
    expect(q.main.completions).toEqual(['mq_awakening']); // weekly ids can't be chapter completions
    expect(q.once).toEqual(['cutscene:wk_red_harvest', 'cutscene:mq_root']);
    expect(q.missionsDone).toEqual(['wk_long_watch:hold']);
    expect(q.questCompletions).toEqual({ wk_red_harvest: 2 });
  });

  it('a fresh save carries an empty quest record (nothing folds, golden-safe)', () => {
    const s = defaultSave();
    expect(s.quests).toEqual({
      weekly: { window: 0, progress: {}, claimed: [], completionClaimed: false },
      main: { progress: {}, claimed: [], completions: [] },
      once: [], missionsDone: [], questCompletions: {},
    });
  });
});
