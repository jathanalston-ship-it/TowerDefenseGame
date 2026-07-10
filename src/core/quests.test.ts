// Quests & Missions core (docs/QUESTS.md): window math, the authored content contract
// (weekly ring + main questline), the finale cross-links into the Wardrobe + Cutscene
// registries (every quest's one-time unlocks must be REAL and point back), the condition
// judge, and progress folding.

import { describe, expect, it } from 'vitest';
import {
  ALL_QUESTS, MAIN_QUESTLINE, QUESTS, WEEKLY_QUESTS, allMissions, foldCredit, missionById,
  missionCredit, msToWeeklyRotation, questById, questComplete, weeklyQuestFor, weeklyWindow,
} from './quests';
import type { QuestRunFacts } from './quests';
import { cutsceneDef } from './cutscenes';
import { sourceLabel, wardrobeItem } from './wardrobe';

const facts = (over: Partial<QuestRunFacts> = {}): QuestRunFacts => ({
  mode: 'stage', won: true, wave: 10, kills: 100, cardsDrafted: 0, integrityLost: 0,
  towerBuilds: { needle: 4 }, heroId: 'myco', bossKills: 2, megaKills: 0, ...over,
});

describe('the weekly window', () => {
  it('floors from the epoch, clamps pre-epoch clocks to 0, and counts the rotation down', () => {
    expect(weeklyWindow(QUESTS.epochMs)).toBe(0);
    expect(weeklyWindow(QUESTS.epochMs - 123456)).toBe(0);
    expect(weeklyWindow(QUESTS.epochMs + QUESTS.rotationMs - 1)).toBe(0);
    expect(weeklyWindow(QUESTS.epochMs + QUESTS.rotationMs)).toBe(1);
    expect(msToWeeklyRotation(QUESTS.epochMs)).toBe(QUESTS.rotationMs);
    expect(msToWeeklyRotation(QUESTS.epochMs + 1000)).toBe(QUESTS.rotationMs - 1000);
  });

  it('the ring wraps forever over the three launch quests', () => {
    expect(WEEKLY_QUESTS).toHaveLength(3);
    for (let w = 0; w < 9; w++) expect(weeklyQuestFor(w).id).toBe(WEEKLY_QUESTS[w % 3].id);
  });
});

describe('the authored content contract', () => {
  it('lanes are shaped as designed: 3 weekly quests × 6 missions, 3 chapters × 10 missions', () => {
    expect(WEEKLY_QUESTS.every((q) => q.lane === 'weekly' && q.missions.length === 6)).toBe(true);
    expect(MAIN_QUESTLINE).toHaveLength(3);
    expect(MAIN_QUESTLINE.every((q) => q.lane === 'main' && q.missions.length === 10)).toBe(true);
  });

  it('every id is unique and every mission id carries its quest prefix', () => {
    expect(new Set(ALL_QUESTS.map((q) => q.id)).size).toBe(ALL_QUESTS.length);
    const ids = allMissions().map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of ALL_QUESTS) {
      for (const m of q.missions) expect(m.id.startsWith(`${q.id}:`), m.id).toBe(true);
    }
  });

  it('missions are real objectives: named, explained, positive targets, non-empty rewards', () => {
    for (const m of allMissions()) {
      expect(m.name.length, m.id).toBeGreaterThan(3);
      expect(m.blurb.length, m.id).toBeGreaterThan(8);
      expect(m.target, m.id).toBeGreaterThanOrEqual(1);
      expect(m.rewards.length, m.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('quest rewards never author pass-ledger kinds (stack/passive live on the Battle Pass)', () => {
    for (const q of ALL_QUESTS) {
      for (const r of [...q.finaleRewards, ...q.missions.flatMap((m) => m.rewards)]) {
        expect(['stack', 'passive', 'cosmetic']).not.toContain(r.kind); // cosmetics ride finaleCosmetic
      }
    }
  });

  it('every finale guarantees a REAL story cutscene that unlocks from THIS quest', () => {
    for (const q of ALL_QUESTS) {
      const film = cutsceneDef(q.finaleCutscene);
      expect(film, `${q.id} → missing cutscene ${q.finaleCutscene}`).toBeDefined();
      expect(film!.kind).toBe('story');
      expect(film!.unlock).toEqual({ kind: 'quest', questId: q.id });
    }
  });

  it('every finale guarantees a REAL exclusive cosmetic sourced from THIS quest (label included)', () => {
    for (const q of ALL_QUESTS) {
      const item = wardrobeItem(q.finaleCosmetic);
      expect(item, `${q.id} → missing wardrobe item ${q.finaleCosmetic}`).toBeDefined();
      expect(item!.source).toEqual({ kind: 'quest', quest: q.id });
      // The locked-card hint names the quest (wardrobe keeps its own name map — pin it here).
      expect(sourceLabel(item!.source)).toContain(q.name);
    }
  });

  it('weekly finales pay better than average: Ichor + a premium container in every one', () => {
    for (const q of WEEKLY_QUESTS) {
      expect(q.finaleRewards.some((r) => r.kind === 'ichor' && r.qty >= 25), q.id).toBe(true);
      expect(q.finaleRewards.some((r) => r.kind === 'container' && (r.rarity === 'epic' || r.rarity === 'legendary')), q.id).toBe(true);
    }
  });

  it('lookups resolve and questComplete demands every mission', () => {
    const q = WEEKLY_QUESTS[0];
    expect(questById(q.id)).toBe(q);
    expect(missionById(q.missions[0].id)).toBe(q.missions[0]);
    expect(questById('nope')).toBeUndefined();
    const all = Object.fromEntries(q.missions.map((m) => [m.id, m.target]));
    expect(questComplete(q, all)).toBe(true);
    expect(questComplete(q, { ...all, [q.missions[0].id]: q.missions[0].target - 1 })).toBe(false);
    expect(questComplete(q, {})).toBe(false);
  });
});

describe('the condition judge', () => {
  it('run verbs: qualifying-run counts respect their mode filter', () => {
    expect(missionCredit({ kind: 'runs' }, { type: 'run', facts: facts({ won: false }) })).toBe(1);
    expect(missionCredit({ kind: 'runs', mode: 'endless' }, { type: 'run', facts: facts() })).toBe(0);
    expect(missionCredit({ kind: 'runs', mode: 'any' }, { type: 'run', facts: facts() })).toBe(1);
    expect(missionCredit({ kind: 'wins' }, { type: 'run', facts: facts({ won: false }) })).toBe(0);
    expect(missionCredit({ kind: 'wins', mode: 'campaign' }, { type: 'run', facts: facts({ mode: 'campaign' }) })).toBe(1);
    expect(missionCredit({ kind: 'waveReached', wave: 12 }, { type: 'run', facts: facts({ wave: 11 }) })).toBe(0);
    expect(missionCredit({ kind: 'waveReached', wave: 12, mode: 'endless' }, { type: 'run', facts: facts({ wave: 15 }) })).toBe(0);
    expect(missionCredit({ kind: 'waveReached', wave: 12 }, { type: 'run', facts: facts({ wave: 12 }) })).toBe(1);
  });

  it('run verbs: flawless demands zero integrity lost; lean counts total builds', () => {
    expect(missionCredit({ kind: 'flawlessWins' }, { type: 'run', facts: facts() })).toBe(1);
    expect(missionCredit({ kind: 'flawlessWins' }, { type: 'run', facts: facts({ integrityLost: 1 }) })).toBe(0);
    expect(missionCredit({ kind: 'flawlessWins' }, { type: 'run', facts: facts({ won: false }) })).toBe(0);
    expect(missionCredit({ kind: 'leanWins', maxTowers: 8 }, { type: 'run', facts: facts({ towerBuilds: { needle: 5, mortar: 3 } }) })).toBe(1);
    expect(missionCredit({ kind: 'leanWins', maxTowers: 8 }, { type: 'run', facts: facts({ towerBuilds: { needle: 5, mortar: 4 } }) })).toBe(0);
  });

  it('magnitude verbs accumulate; meta verbs answer only their own seam', () => {
    expect(missionCredit({ kind: 'killsTotal' }, { type: 'run', facts: facts({ kills: 231 }) })).toBe(231);
    expect(missionCredit({ kind: 'bossKillsTotal' }, { type: 'run', facts: facts({ bossKills: 3 }) })).toBe(3);
    expect(missionCredit({ kind: 'megaKillsTotal' }, { type: 'run', facts: facts({ megaKills: 1 }) })).toBe(1);
    expect(missionCredit({ kind: 'containersOpened' }, { type: 'containers', n: 2 })).toBe(2);
    expect(missionCredit({ kind: 'containersOpened' }, { type: 'roulette', n: 2 })).toBe(0);
    expect(missionCredit({ kind: 'expeditionsClaimed' }, { type: 'expeditions', n: 1 })).toBe(1);
    expect(missionCredit({ kind: 'rouletteCollects' }, { type: 'roulette', n: 1 })).toBe(1);
    expect(missionCredit({ kind: 'passLevels' }, { type: 'passLevels', n: 3 })).toBe(3);
    expect(missionCredit({ kind: 'killsTotal' }, { type: 'containers', n: 5 })).toBe(0);
    expect(missionCredit({ kind: 'containersOpened' }, { type: 'run', facts: facts() })).toBe(0);
  });
});

describe('progress folding', () => {
  const quest = WEEKLY_QUESTS[0]; // The Red Harvest: kills 400 / wins 2 / bosses 6 / flawless / wave 14 / containers 3
  it('caps at target, reports movers, and never mutates the input', () => {
    const before: Record<string, number> = { [`${quest.id}:reap`]: 390 };
    const { next, moved } = foldCredit(quest.missions, before, { type: 'run', facts: facts({ kills: 50, wave: 14 }) });
    expect(before[`${quest.id}:reap`]).toBe(390); // untouched
    expect(next[`${quest.id}:reap`]).toBe(400); // capped, not 440
    expect(moved).toContain(`${quest.id}:reap`);
    expect(moved).toContain(`${quest.id}:stand`); // the win
    expect(moved).toContain(`${quest.id}:deep`); // wave 14
    expect(moved).toContain(`${quest.id}:clean`); // flawless
  });

  it('a mission already at target is skipped (no movement, no re-credit)', () => {
    const done = Object.fromEntries(quest.missions.map((m) => [m.id, m.target]));
    const { next, moved } = foldCredit(quest.missions, done, { type: 'run', facts: facts() });
    expect(moved).toEqual([]);
    expect(next).toBe(done); // the SAME object — zero-move folds allocate nothing
  });

  it('an event that credits nothing returns the same progress object', () => {
    const p = {};
    const { next, moved } = foldCredit(quest.missions, p, { type: 'expeditions', n: 1 }); // Red Harvest has no expedition mission
    expect(moved).toEqual([]);
    expect(next).toBe(p);
  });
});
