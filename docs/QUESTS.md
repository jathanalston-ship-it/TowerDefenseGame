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
`completionClaimed` / main `completions` (chapter gate). Every claim path feeds the pass at
ONE rate table (`QUEST_PASS_XP`: +40 mission / +150 finale) — manual claims, the finale's
auto-claimed missions, and rollover mail all pay identically, so deferring a claim never
costs season progress. Mail XP is granted AFTER the reset persists: its level-up's re-entrant
`passLevels` credit lands on the INCOMING week (re-entrancy-safe, never re-mails).

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
(stage 4, order 13) + mechanics teach row. Movement is surfaced everywhere it happens:
run-driven completions appear as a Results category (`outcome.questMissions` — claim on the
board), and a `quests` nav badge counts claimable missions + finales across both lanes
(notificationSources — claims drop it, viewing the board acknowledges it).

### §claim-all (2026-11)

The board header carries the shared **`✹ Claim all (N)`** control (`ui/components/ClaimAll.tsx`,
the one batch-claim pattern — docs/NOTIFICATIONS.md §claim-all) whenever ≥1 mission is ready:
one tap claims every earned MISSION across the weekly window and the active chapter (each
through `meta.claimQuestMission`, one burst at the tap point, one `chest`+`power` cue) — what
was eight taps is one. **Finales are never batched**: their story cutscene + exclusive cosmetic
stay a deliberate `Claim finale` tap (the same rule as auto-claim, docs/NOTIFICATIONS.md
§auto-claim). The header chip still counts finales, so `◈ 2 to claim` after a Claim all names
exactly the ceremonies left.

## Extension points

- **New weekly quest**: append to `WEEKLY_QUESTS` (+ its quest-source wardrobe item + story
  cutscene; tests enforce the links). The ring length changes the rotation automatically.
- **New chapter**: append to `MAIN_QUESTLINE` — gating/UI/collections pick it up.
- **Future**: per-mission cutscene beats, quest-gated LiveOps events, a daily mission strip.

## Known limitations

- Weekly quests share one epoch with the pass; there is no per-player stagger (deliberate —
  every player sees the same week, no server).
- Mission progress inside a window is client-clock honest: the max-window rule blocks farm-
  by-rollback, but within a window the clock is trusted (same stance as the pass/markets).
- Rollover mail unlocks (cutscene/cosmetic) land silently in the Archive/Wardrobe — only
  hub claims premiere the film (a surprise premiere at boot would collide with the briefing
  queue).

Quest Board accessibility: each mission progress bar names its quest and mission, exposes bounded progress and announces ready/claimed state. Reward icon groups expose the existing rewardLabel descriptions (also as native tooltips). Mission and finale claim buttons name their objective/quest; visible layout, handlers, rewards and eligibility are unchanged.

Mission claim keyboard continuity: each mission is a named group with a programmatic focus target. A successful focused Claim action moves focus to that same persistent row before the button disappears; the row label then includes claimed. A rejected claim keeps its button focus. Rows do not add extra Tab stops, and reward/eligibility logic remains in meta.claimQuestMission.

Claim all follows the same keyboard continuity rule: after at least one successful reward claim from a focused batch button, focus moves to the persistent Quest Board heading. If no claims succeed, focus stays on the button. The heading adds no sequential Tab stop; batch contents and finale exclusion are unchanged.

Quest claim burst origin uses the activating control center for keyboard/assistive clicks (detail === 0); pointer clicks retain their client coordinates. This shared path covers mission, batch and finale claims. Existing reduced-motion suppression, receipt contents and reward/audio logic are unchanged.
