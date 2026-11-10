# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-11-10 02:19 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** codex/hive-autoplay · **HEAD:** 353c962b

## Summary of work completed

Implemented locally on codex/hive-autoplay; not deployed. Hive Intelligence is an opt-in continuous toggle unlocked by Campaign Stage 5 completion on any difficulty. It automates purchases, waves, recommended drafts and lead-hero abilities/rally; competitive modes, tutorials and uncleared Threat remain excluded. Standalone preferences are preserved; the toggle resets each run.

## Files modified

- Source (15): `src/core/config.ts`, `src/core/game.ts`, `src/core/hivemind.ts`, `src/core/replay.ts`, `src/core/types.ts`, `src/dev/dil/knowledge.ts`, `src/dev/systemRegistry.ts`, `src/save/derive.ts`, `src/state/mechanics.ts`, `src/state/mechanicsText.ts`, `src/ui/BuildControls.tsx`, `src/ui/DraftModal.tsx`, `src/ui/GameView.css`, `src/ui/GameView.tsx`, `src/ui/Toolbar.tsx`
- Tests (2): `src/core/hivemind.test.ts`, `src/state/threatMeta.test.ts`
- Docs (7): `docs/DEPENDENCY_GRAPH.md`, `docs/DIL_GRAPH.md`, `docs/GAME-STATE.md`, `docs/HIVE-MIND.md`, `docs/HUD.md`, `docs/PROJECT_MANIFEST.md`, `docs/VALIDATION_REPORT.md`

## Systems affected (from the dependency registry)

- **content-infra** — `src/core/config.ts`, `src/core/types.ts`
- **dev-registry** — `src/dev/dil/knowledge.ts`, `src/dev/systemRegistry.ts`
- **engine** — `src/core/game.ts`
- **gene-cards** — `src/ui/DraftModal.tsx`
- **hive-mind** — `src/core/hivemind.ts`
- **meta-store** — `src/save/derive.ts`
- **net-backend** — `src/core/replay.ts`
- **onboarding** — `src/state/mechanics.ts`, `src/state/mechanicsText.ts`
- **run-ui** — `src/ui/BuildControls.tsx`, `src/ui/GameView.tsx`, `src/ui/Toolbar.tsx`
- Consumer ring (verify, unchanged): account-level, accounts, analytics, arena, audio, battle-pass, biomes, boss-rush, bosses, campaign, chronicle, class-bonds, collection, contracts, cosmetics, currencies, cutscenes, daily, daily-login, devtools, difficulty, directives, doctrines, equipment, evolution-hq, expeditions, field-research, genome-rank, hero-cinematics, hero-symbiotes, heroes, hive-construction, hub-shell, idle-harvest, infestation, infinite, liveops, living-battlefield, loot, map-layouts, mastery, mega-bosses, metabolism, mulligans, nemesis, notifications, nucleus, online-foundation, pil, power, premium, progression-gating, quests, rendering, security, threat, towers, website

## Power Score changes

No Power formula changes. Purchases use existing audited Game APIs. Existing Power tests and Hive purchase tests passed.

## UI changes

Surfaces in the blast radius: `GameView`, `Hud`, `Toolbar`, `BuildControls`, `Inspector`, `BuildPanel`, `GeneArchive`, `DraftModal`, `gene splash`, `Splice pill`, `GameView (◈ HIVE INTELLIGENCE button + pulse ticker)`, `SaveManager`, `CloudBackup`, `LeaderboardBlock`, `SpectateView`, `DailyScreen (Replay Theater)`, `HelpWiki`, `WhatsNew`, `HudTour`, `CommandCenter (tips)`, `TutorialOverlay`, `Results`, `ALL`

ON/OFF button, compact phone state, draft Enable/Stop controls, and HIVE AUTO ability indicator. Browser smoke exercised opening placement, wave start, automatic gene pick and draft stop; screenshots inspected.

## Documentation changes

Registry says these move with the touched systems: `docs/CODEMAP.md`, `docs/CORE-FRAMEWORKS.md`, `docs/AUTHORING.md`, `docs/HIVE-MIND.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/EARLY-CALL.md`, `docs/POWER-SCORE.md`, `docs/POWER-AUDIT.md`, `docs/POWER-ADVISOR.md`, `docs/MISSION-CONTROL.md`, `docs/EVOLUTION-ROADMAP.md`, `docs/MULLIGANS.md`, `docs/PREMIUM-STORE.md`, `docs/PREMIUM-ECONOMY-REPORT.md`, `docs/ONLINE-FOUNDATION.md`, `docs/TRADING-PREP.md`, `docs/TOWER-STARS.md`, `docs/TOWER-BRANCHES.md`, `docs/TOWER-LAB.md`, `docs/TOWER-CODEX.md`, `docs/TOWERS.md`, `docs/STRAIN.md`, `docs/MASTERY.md`, `docs/ADAPTATION.md`, `docs/HEROES.md`, `docs/HERO-FRAMEWORK.md`, `docs/HERO-EVOLUTION.md`, `docs/HERO-SELECTION.md`, `docs/SLOTS.md`, `docs/EQUIPMENT.md`, `docs/EQUIPMENT-PHILOSOPHY.md`, `docs/LOOTBOX.md`, `docs/LOOT-PROGRESSION.md`, `docs/REWARD-PRESENTATION.md`, `docs/GENE-EVOLUTION.md`, `docs/CARDS.md`, `docs/GENE-AUDIT-REPORT.md`, `docs/NUCLEUS.md`, `docs/HERO-SYMBIOTES.md`, `docs/COLLECTION.md`, `docs/EVOLUTION-HQ.md`, `docs/GENOME-CORE.md`, `docs/EVOLUTION-CAP.md`, `docs/ECONOMY.md`, `docs/LEXICON.md`, `docs/ECONOMY_FORMULAS.md`, `docs/DEV-RESET.md`, `docs/SCALABILITY.md`, `docs/PROJECT_MANIFEST.md`, `docs/BOSS-DESIGN.md`, `docs/MEGA-BOSS.md`, `docs/BIOMES.md`, `docs/MAP-LAYOUTS.md`, `docs/DOCTRINES.md`, `docs/MODE-IDENTITY.md`, `docs/THREAT.md`, `docs/DIFFICULTY.md`, `docs/DIFFICULTY_DIRECTOR.md`, `docs/WEBSITE.md`, `docs/DEPLOYMENT.md`, `docs/DIL.md`, `docs/DEPENDENCY_GRAPH.md`, `docs/ENGINEERING-AUDIT.md`, `docs/GAME_CONSTITUTION.md`, `docs/PROJECT_STATUS.md`, `docs/AI_HANDOFF.md`, `docs/PIL.md`, `docs/CAMPAIGN.md`, `docs/CAMPAIGN-EVENTS.md`, `docs/STAGES.md`, `docs/ENDLESS-SCALING.md`, `docs/BOSS-RUSH.md`, `docs/DAILY-RUN.md`, `docs/ARENA.md`, `docs/ARENA_MATCH_REPORT.md`, `docs/HERO-CINEMATICS.md`, `docs/CLASS-BONDS.md`, `docs/NEMESIS.md`, `docs/TUTORIAL.md`, `docs/HELP.md`, `docs/TUTORIAL-AUDIT.md`, `docs/GUIDED-UNLOCKS.md`, `docs/HUD.md`, `docs/READABILITY.md`, `docs/RENDER-PIPELINE.md`, `docs/TOWER-VISUAL-EVOLUTION.md`, `docs/GAME-FEEL.md`, `docs/CAMERA.md`, `docs/COMBAT-VISUAL-STANDARDS.md`, `docs/LIVING-BATTLEFIELD.md`, `docs/MUSIC.md`, `docs/AUDIO.md`, `docs/ACCOUNTS.md`, `docs/RESEARCH.md`, `docs/REPLAY-SHARE.md`, `docs/IDLE-HARVEST.md`, `docs/METABOLISM.md`, `docs/HIVE-CONSTRUCTION.md`, `docs/HOME-BASE.md`, `docs/DAILY-LOGIN.md`, `docs/LIVEOPS.md`, `docs/LIVE-EVENTS.md`, `docs/CONTRACTS.md`, `docs/INFESTATION.md`, `docs/CHANGELOG-PIPELINE.md`, `docs/EXPEDITIONS.md`, `docs/COSMETICS.md`, `docs/BATTLEPASS.md`, `docs/QUESTS.md`, `docs/ACCOUNT-LEVEL.md`, `docs/GENOME-RANK.md`, `docs/PROGRESSION-GATING.md`, `docs/UNLOCK-TREE.md`, `docs/COMMAND-CENTER.md`, `docs/ONE-MORE-RUN.md`, `docs/PROGRESSION-LOOP.md`, `docs/UX-CONSOLIDATION.md`, `docs/NOTIFICATIONS.md`, `docs/HIVE-INTEL.md`, `docs/CUTSCENES.md`, `docs/SECURITY.md`, `docs/ANALYTICS.md`

Updated HIVE-MIND, manifest, game state, HUD, Help/announcement registry, beginner guide and dependency graphs. Existing economy and balance formulas unchanged.

## Save changes

No save schema change or new persisted fields. save/derive.ts reads existing campaign progress for the stage-5 unlock.

## Known edge cases

Drafts pause the sim: gene picks stay in DraftModal, while purchases and wave starts use fixed steps. Toggle can be enabled in an opening draft. Existing Auto Wave/Auto Gene/Auto-Cast preferences survive takeover. Default branch is production; do not push it without release authorization.

## Remaining technical debt

Existing validator spawnSync calls assume Unix npx/npm executables; Windows requires direct checks. Raw-text security scanner expects LF. Browser test harness produced an isolated Vite HMR websocket-port warning, separate from game behavior.

## Recommended next tasks

Review the branch diff and choose when to publish. No implementation task is deferred.

## Future expansion hooks

New Biomass sinks still register HiveProvider in core/hivemind.ts. Pulse cadence and unlock milestone remain HIVE_MIND config. No auto-selling, risky overlapping early calls, paid rerolls, hub purchases or automatic next-run launch.
