# QUESTS.md — Quests & Missions (the directive layer)

> Status: **shipped** (save v32). Core: `src/core/quests.ts` · meta: `src/state/meta.ts`
> (§QUESTS block) · UI: `src/ui/QuestBoard.tsx` (nav `quests`, Play group) · tests:
> `src/core/quests.test.ts`, `src/state/questsMeta.test.ts`.

**Missions compose quests.** A mission is one counted objective (a closed condition
vocabulary judged at the meta seams) paying its own `PassReward[]`; completing every mission
in a quest opens the quest's **finale** — currency plus, on FIRST completion, a guaranteed
**story cutscene** and an **exclusive Wardrobe cosmetic**, forever.

## Two lanes, one framework

| | WEEKLY QUEST | MAIN QUESTLINE — “The Descent Below” |
|---|---|---|
| Content | ring of 3 quests × 6 missions | 3 chapters × 10 missions |
| Rotation | 7-day UTC windows from `QUESTS.epochMs` (the pass epoch); ring wraps forever | permanent, sequential — claiming a finale opens the next chapter |
| Progress | THIS window only — **never carries over**; rollover auto-claims earned rewards (mail), then resets | forever; only the ACTIVE chapter accrues |
| Repeats | replayable every rotation; already-granted one-time finales substitute `QUESTS.repeatFinale` (40 Ichor + 300 Cores) | chapters complete once |

## §credit — the seams

`meta.creditQuests(ev)` folds one event into BOTH lanes (`foldCredit`, capped at target, no
mutation). Push sites: `finishRun` (run facts = `ContractRunFacts` + bossKills/megaKills),
`openContainer` (+1 containers), `claimExpedition` (+1), `grantRouletteRewards` (+1 roulette),
`grantPassXp` (level-ups → passLevels). A mission crossing its target enters the lifetime
`missionsDone` codex immediately (completion ≠ claim). Condition verbs (`MissionCond`):
runs / wins / waveReached (mode-filterable) / flawlessWins / leanWins / killsTotal /
bossKillsTotal / megaKillsTotal / containersOpened / expeditionsClaimed / rouletteCollects /
passLevels. **Adding a verb** = one union member + one `missionCredit` case (+ a seam if new).

## §finale & §once

`claimQuestFinale` auto-claims earned-but-unclaimed missions first (nothing strands), then
`grantQuestFinale`: repeatable rewards through the SHARED interpreter (`applyRewardList`, the
Battle-Pass reward language — quest defs never author `stack`/`passive`/`cosmetic` kinds), then
the one-time unlocks against the FOREVER ledger `save.quests.once`
(`'cutscene:<questId>'` / `'cosmetic:<questId>'`): first time grants the film (premiered via
`cutsceneBus` → App's cutscene queue) + the wardrobe item (owned + reveal ceremony); repeats
pay the substitution. Ledgers: `questCompletions[questId]++` (collections tiering), weekly
`completionClaimed` / main `completions` (chapter gate). Claims feed the pass (+40 XP mission,
+150 finale).

## Cross-registry contracts (test-pinned)

- Every quest's `finaleCutscene` exists in `CUTSCENES` with `unlock: { kind: 'quest', questId }`;
  `save/derive.isCutsceneUnlocked` resolves it from the once-ledger. Boosts stay small
  (cutscenes.test ceiling).
- Every quest's `finaleCosmetic` exists in the wardrobe with `source: { kind: 'quest', quest }`
  (never auto-unlocks; `sourceLabel` names the quest via wardrobe's own QUEST_NAMES map —
  quests.test pins it against drift).
- Collections: `quests` codex (weekly mastery ×3 = Perennial; main = Chronicled) + `missions`
  codex (lifetime `missionsDone`) — both zero on a fresh save (golden-safe), small
  campaign-economy/biomass/power weights at completion.

## Save (v32) & rotation rules

`save.quests = { weekly: { window, progress, claimed, completionClaimed }, main: { progress,
claimed, completions }, once, missionsDone, questCompletions }` — sanitizer drops unknown
ids, clamps progress to targets, validates once-keys. `weekly.window` is the MAX window
observed (clock-tamper rule: a rolled-back clock can't re-mail or regress; credits keep
landing on the recorded window's quest). `pollWeeklyQuest` runs on the Hub heartbeat + all
quest entry points.

## UI

`QuestBoard.tsx`: weekly banner (countdown, glyph/accent theming via `--qa`, mission rows
with progress bars + claims, finale strip previewing the cutscene + cosmetic or the repeat
substitution), the three chapter cards (done/active/locked; active expands), and Champion
Contracts mounted on the same board (the quest-adjacent weekly skill checks —
docs/CONTRACTS.md). Receipts reuse the Battle-Pass toast. Gating: FEATURES `quests`
(stage 4, order 13) + mechanics teach row.

## Extension points

- **New weekly quest**: append to `WEEKLY_QUESTS` (+ its quest-source wardrobe item + story
  cutscene; tests enforce the links). The ring length changes the rotation automatically.
- **New chapter**: append to `MAIN_QUESTLINE` — gating/UI/collections pick it up.
- **Future**: per-mission cutscene beats, quest-gated LiveOps events, a daily mission strip.

## Known limitations

- Weekly quests share one epoch with the pass; there is no per-player stagger (deliberate —
  every player sees the same week, no server).
- Rollover mail pays rewards but not pass XP (claims only) — avoids recursive XP loops.
- Mission progress inside a window is client-clock honest: the max-window rule blocks farm-
  by-rollback, but within a window the clock is trusted (same stance as the pass/markets).
