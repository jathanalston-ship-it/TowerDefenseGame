# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-11-04 06:24 UTC · **Diff scope:** f73e8fb...HEAD
- **Branch:** claude/beautiful-feynman-qdyilo · **HEAD:** 2beef2e

## Summary of work completed

The 2026-11 polish batch: six worktree tracks (F1 battle feel, F2 post-run flow, N1 hub shell, N2 screens/naming, C3 content, E2 economy health) merged onto `claude/beautiful-feynman-qdyilo`, plus lead fixes found while integrating. Everything except C3's content and E2's two economy rules is render/UI; goldens are byte-identical and the save stays v55. The batch is NOT deployed: production needs the owner's go-ahead, then a fast-forward of `claude/zen-hawking-rh1gxl`. The one thing to know: any `Game` that is not the player's own run must call `game.isolateEvents()` (meta.ts records boss/Mega kills off the app-wide bus).

## Files modified

- Source (102): `src/audio/sound.ts`, `src/changelog/releases.gen.ts`, `src/core/adaptation.ts`, `src/core/arenaMatch.ts`, `src/core/biomes.ts`, `src/core/branches.ts`, `src/core/config.ts`, `src/core/events.ts`, `src/core/game.ts`, `src/core/geneCards.ts`, `src/core/heroIdentity.ts`, `src/core/heroLore.ts`, `src/core/heroSymbiote.ts`, `src/core/mastery.ts`, `src/core/mulligan.ts`, `src/core/replay.ts`, `src/core/stars.ts`, `src/core/towerIdle.ts`, `src/core/types.ts`, `src/dev/balanceReport.ts`, `src/dev/dil/knowledge.ts`, `src/dev/docSync.ts`, `src/dev/progressionSim.ts`, `src/dev/systemRegistry.ts`, `src/i18n/index.ts`, `src/index.css`, `src/render/assimilationFx.ts`, `src/render/feel.ts`, `src/render/heroEvolution.ts`, `src/render/heroSymbiotes.ts`, `src/render/impactFx.ts`, `src/render/megaboss.ts`, `src/render/organism.ts`, `src/render/renderer.ts`, `src/render/starEvolution.ts`, `src/render/theme.ts`, `src/render/towerEvolution.ts`, `src/render/towerForms.ts`, `src/security/registry.ts`, `src/state/achievements.ts`, `src/state/guidedUnlocks.ts`, `src/state/mechanics.ts`, `src/state/meta.ts`, `src/state/navBus.ts`, `src/state/prefs.ts`, `src/state/progressionLoop.ts`, `src/state/recommendations.ts`, `src/state/rewardToast.ts`, `src/state/stats.ts`, `src/state/unlocks.ts`, `src/state/vaultReveal.ts`, `src/ui/AchievementToaster.tsx`, `src/ui/App.tsx`, `src/ui/BattlePassScreen.tsx`, `src/ui/BossRushScreen.tsx`, `src/ui/CampaignScreen.tsx`, `src/ui/CommandCenter.tsx`, `src/ui/DraftModal.tsx`, `src/ui/EvolutionHQ.tsx`, `src/ui/GameView.tsx`, `src/ui/GeneArchive.tsx`, `src/ui/GeneticVault.tsx`, `src/ui/GuidedUnlock.tsx`, `src/ui/HelpWiki.tsx`, `src/ui/HeroLab.tsx`, `src/ui/Hub.tsx`, `src/ui/HubLanding.tsx`, `src/ui/Hud.tsx`, `src/ui/InfiniteScreen.tsx`, `src/ui/InitCutscene.tsx`, `src/ui/Inspector.tsx`, `src/ui/ItemDetails.tsx`, `src/ui/MetabolismScreen.tsx`, `src/ui/NextGoalBanner.tsx`, `src/ui/PredictionPanel.tsx`, `src/ui/QuestBoard.tsx`, `src/ui/Results.tsx`, `src/ui/RewardReveal.tsx`, `src/ui/SpecimenVault.tsx`, `src/ui/SpectateView.tsx`, `src/ui/VaultReveal.tsx`, `src/ui/browserBack.ts`, `src/ui/components/AccountXpBar.tsx`, `src/ui/components/AdviceLink.tsx`, `src/ui/components/CentreStage.tsx`, `src/ui/components/ChipPopover.tsx`, `src/ui/components/ClaimAll.tsx`, `src/ui/components/LoadoutStrip.tsx`, `src/ui/components/MaterialsChip.tsx`, `src/ui/components/MotionSettings.tsx`, `src/ui/components/Popup.tsx`, `src/ui/components/ScreenBoundary.tsx`, `src/ui/components/ScreenHeader.tsx`, `src/ui/components/SectionNav.tsx`, `src/ui/components/WalletChip.tsx`, `src/ui/components/WardrobeReveal.tsx`, `src/ui/helpSearch.ts`, `src/ui/homeModel.ts`, `src/ui/layoutProfile.ts`, `src/ui/lazyNamed.ts`, `src/ui/navModel.ts`, `src/ui/tutorial/TutorialOverlay.tsx`
- Tests (32): `src/audio/cues.test.ts`, `src/core/answerRoster.test.ts`, `src/core/gameBoss.test.ts`, `src/core/geneUpgrades.test.ts`, `src/core/myceliarch.test.ts`, `src/core/puzzleFauna.test.ts`, `src/core/registry.test.ts`, `src/core/replay.test.ts`, `src/dev/balanceReport.test.ts`, `src/dev/progressionSim.test.ts`, `src/dev/tokenContrast.test.ts`, `src/i18n/i18n.test.ts`, `src/render/feel.test.ts`, `src/security/securityRegistry.test.ts`, `src/state/achievements.framework.test.ts`, `src/state/battlePassMeta.test.ts`, `src/state/bosscollection.test.ts`, `src/state/directShardGrants.test.ts`, `src/state/guidedUnlocks.test.ts`, `src/state/nemesis.test.ts`, `src/state/progressionLoop.test.ts`, `src/state/recommendations.test.ts`, `src/state/runDebrief.test.ts`, `src/state/stats.test.ts`, `src/ui/HubLanding.test.ts`, `src/ui/browserBack.test.ts`, `src/ui/components/loadoutStrip.test.ts`, `src/ui/components/sectionNav.test.ts`, `src/ui/components/topbarTouch.test.ts`, `src/ui/helpSearch.test.ts`, `src/ui/lazyNamed.test.ts`, `src/ui/navModel.test.ts`
- Docs (45): `docs/BALANCE_ARCHITECTURE.md`, `docs/BALANCE_REPORT.md`, `docs/BOSS-DESIGN.md`, `docs/BUGFIX-LOG.md`, `docs/CAMPAIGN.md`, `docs/COMBAT-VISUAL-STANDARDS.md`, `docs/COMMAND-CENTER.md`, `docs/DEPENDENCY_GRAPH.md`, `docs/DEPLOYMENT.md`, `docs/DIL_GRAPH.md`, `docs/ENEMIES.md`, `docs/GAME-FEEL.md`, `docs/GAME-STATE.md`, `docs/GENE-EVOLUTION.md`, `docs/HELP.md`, `docs/HERO-CINEMATICS.md`, `docs/HEROES.md`, `docs/HISTORY.md`, `docs/HUB-FLOW.md`, `docs/HUD.md`, `docs/ICON-LANGUAGE.md`, `docs/INFO-HIERARCHY.md`, `docs/LOOTBOX.md`, `docs/MUSIC.md`, `docs/NEMESIS.md`, `docs/NOTIFICATIONS.md`, `docs/PIL_REPORT.md`, `docs/POWER-SCORE.md`, `docs/PRIME-STRAINS.md`, `docs/PROGRESSION_REPORT.md`, `docs/PROJECT_MANIFEST.md`, `docs/QUESTS.md`, `docs/RESPONSIVE-DESIGN.md`, `docs/REWARD-PRESENTATION.md`, `docs/SHARD-ECONOMY.md`, `docs/SIGNATURE-MOMENTS.md`, `docs/SIMULATION-FRAMEWORK.md`, `docs/STYLE-GUIDE.md`, `docs/THREAT.md`, `docs/TOWERS.md`, `docs/TUTORIAL.md`, `docs/UI-STANDARDS.md`, `docs/UI_STYLE_GUIDE.md`, `docs/WEBSITE.md`, `docs/devlog/DRAFT-2026-11-04.md`

## Systems affected (from the dependency registry)

- **account-level** — `src/ui/components/AccountXpBar.tsx`
- **achievements** — `src/state/achievements.ts`, `src/ui/AchievementToaster.tsx`
- **arena** — `src/core/arenaMatch.ts`
- **assimilation** — `src/render/assimilationFx.ts`
- **audio** — `src/audio/sound.ts`
- **battle-pass** — `src/ui/BattlePassScreen.tsx`
- **biomes** — `src/core/biomes.ts`
- **boss-rush** — `src/ui/BossRushScreen.tsx`
- **campaign** — `src/ui/CampaignScreen.tsx`
- **chronicle** — `src/changelog/releases.gen.ts`
- **content-infra** — `src/core/config.ts`, `src/core/types.ts`
- **cosmetics** — `src/ui/SpecimenVault.tsx`, `src/ui/components/WardrobeReveal.tsx`
- **currencies** — `src/ui/components/MaterialsChip.tsx`
- **dev-registry** — `src/dev/balanceReport.ts`, `src/dev/dil/knowledge.ts`, `src/dev/docSync.ts`, `src/dev/progressionSim.ts`, `src/dev/systemRegistry.ts`
- **engine** — `src/core/events.ts`, `src/core/game.ts`
- **equipment** — `src/ui/ItemDetails.tsx`
- **evolution-hq** — `src/ui/EvolutionHQ.tsx`
- **gene-cards** — `src/core/geneCards.ts`, `src/ui/DraftModal.tsx`, `src/ui/GeneArchive.tsx`
- **hero-symbiotes** — `src/core/heroSymbiote.ts`, `src/render/heroSymbiotes.ts`
- **heroes** — `src/core/heroIdentity.ts`, `src/core/heroLore.ts`, `src/ui/HeroLab.tsx`
- **hub-shell** — `src/state/progressionLoop.ts`, `src/ui/App.tsx`, `src/ui/CommandCenter.tsx`, `src/ui/Hub.tsx`, `src/ui/NextGoalBanner.tsx`, `src/ui/browserBack.ts`, `src/ui/components/AdviceLink.tsx`, `src/ui/components/Popup.tsx`, `src/ui/components/ScreenBoundary.tsx`, `src/ui/components/ScreenHeader.tsx`, `src/ui/homeModel.ts`, `src/ui/navModel.ts`
- **i18n** — `src/i18n/index.ts`
- **infinite** — `src/ui/InfiniteScreen.tsx`
- **living-battlefield** — `src/render/organism.ts`
- **loot** — `src/state/vaultReveal.ts`, `src/ui/GeneticVault.tsx`, `src/ui/VaultReveal.tsx`
- **mastery** — `src/core/adaptation.ts`, `src/core/mastery.ts`
- **mega-bosses** — `src/render/megaboss.ts`
- **meta-store** — `src/state/meta.ts`, `src/state/prefs.ts`
- **metabolism** — `src/ui/MetabolismScreen.tsx`
- **mulligans** — `src/core/mulligan.ts`
- **net-backend** — `src/core/replay.ts`, `src/ui/SpectateView.tsx`
- **notifications** — `src/state/recommendations.ts`, `src/state/rewardToast.ts`, `src/ui/HubLanding.tsx`, `src/ui/components/WalletChip.tsx`
- **onboarding** — `src/state/guidedUnlocks.ts`, `src/state/mechanics.ts`, `src/ui/GuidedUnlock.tsx`, `src/ui/HelpWiki.tsx`, `src/ui/InitCutscene.tsx`, `src/ui/helpSearch.ts`, `src/ui/tutorial/TutorialOverlay.tsx`
- **prediction** — `src/ui/PredictionPanel.tsx`
- **progression-gating** — `src/state/navBus.ts`, `src/state/unlocks.ts`
- **quests** — `src/ui/QuestBoard.tsx`
- **rendering** — `src/render/assimilationFx.ts`, `src/render/feel.ts`, `src/render/heroEvolution.ts`, `src/render/heroSymbiotes.ts`, `src/render/impactFx.ts`, `src/render/megaboss.ts`, `src/render/organism.ts`, `src/render/renderer.ts`, `src/render/starEvolution.ts`, `src/render/theme.ts`, `src/render/towerEvolution.ts`, `src/render/towerForms.ts`
- **run-ui** — `src/ui/GameView.tsx`, `src/ui/Hud.tsx`, `src/ui/Inspector.tsx`, `src/ui/Results.tsx`, `src/ui/RewardReveal.tsx`, `src/ui/components/CentreStage.tsx`
- **security** — `src/security/registry.ts`
- **stats** — `src/state/stats.ts`
- **towers** — `src/core/branches.ts`, `src/core/stars.ts`, `src/core/towerIdle.ts`
- **ui-kit** — `src/ui/components/ChipPopover.tsx`, `src/ui/components/ClaimAll.tsx`, `src/ui/components/LoadoutStrip.tsx`, `src/ui/components/MotionSettings.tsx`, `src/ui/components/SectionNav.tsx`, `src/ui/layoutProfile.ts`, `src/ui/lazyNamed.ts`
- Consumer ring (verify, unchanged): accounts, analytics, bosses, collection, contracts, crafting, cutscenes, daily, daily-login, devtools, difficulty, directives, doctrines, expeditions, field-research, genome-rank, hero-cinematics, hive-construction, hive-mind, idle-harvest, infestation, liveops, map-layouts, nemesis, nucleus, online-foundation, pil, power, premium, prestige, profile, reward-architecture, shards-economy, splice-market, threat, website

## Power Score changes

E2 added `GENE_LEVEL_POWER_FLOOR = 0.0125` so every gene level moves displayed Power (maxed library ×3.078 → ×3.092; the 3.2 ceiling test holds; `geneUpgrades.test`). C3's towers/hero join Power automatically (powerIntegration tests). Nothing else touches Power buckets.

## UI changes

Surfaces in the blast radius: `Results (XP fill + level-ups)`, `PlayerProfile (level block)`, `CommandCenter vitals`, `Hub topbar chip`, `AchievementPanel`, `RewardReveal (inline strip)`, `AchievementToaster`, `ArenaScreen`, `ArenaView`, `Hub`, `PlayerProfile (pvp section)`, `ArenaView (opponent bar, PvP timer, connection chip, scroll indicator, command dock)`, `AssimilationDebug (DebugPanel section)`, `screen veil + camera heartbeat (GameView)`, `canvas-frame glow`, `MusicDebug (Settings dev console)`, `(audible)`, `BattlePassScreen`, `CampaignScreen`, `biome banner`, `BossRushScreen`, `BioRoulette`, `CommandCenter`, `App (UpdateBriefing popup)`, `Wardrobe`, `PhenotypeLab`, `SpecimenVault`, `WardrobeReveal`, `CurrencyIcon (everywhere)`, `top resource bar`, `GameView`, `Hud`, `Toolbar`, `BuildControls`, `Inspector`, `BuildPanel`, `EquipmentPanel`, `ItemDetails`, `EquipmentCollection (Equip Codex gallery)`, `HeroGearPreview`, `EvolutionHQ`, `GeneArchive`, `DraftModal`, `gene splash`, `HeroLab (Symbiote Chamber)`, `in-run symbiote grafts + resonance crown (drawHeroSymbiotes)`, `HeroLab`, `ability button`, `HeroSelectPanel`, `ProgressDashboard`, `Hub (settings language picker)`, `InfiniteScreen`, `the battlefield itself`, `GeneticVault`, `VaultReveal`, `LootMeter`, `LootToaster`, `AdaptationChamber (Adaptation Chamber)`, `MasteryProfile`, `MasteryToaster`, `EvolutionTrackPanel (labs helix — docs/MASTERY.md §evolution track)`, `halos (renderer)`, `live projection + level-up rings (GameView)`, `Inspector craft bar`, `DailyScreen (variant brief)`, `mega raid bar`, `weak-point callouts`, `arrival card`, `SaveManager`, `MetabolismScreen`, `GameView (organism overlay + emitter shots + graft ambience)`, `MulliganLab`, `Inspector (organism block)`, `DailyScreen (assignment briefing)`, `Vault reveal (Overflow + discovery pulls)`, `PlayerProfile (dex + Overflow rows)`, `CloudBackup`, `LeaderboardBlock`, `SpectateView`, `DailyScreen (Replay Theater)`, `Hub (badges)`, `RewardToaster (claim popups)`, `nav badges`, `HelpWiki`, `WhatsNew`, `HudTour`, `CommandCenter (tips)`, `TutorialOverlay`, `PredictionPanel`, `Hub (nav gating + FeatureLocked)`, `WhatsNew (unlock ceremony)`, `HudTour (revealed stops)`, `CommandCenter (widget gates)`, `QuestBoard`, `Results`, `ALL`, `SecurityPulse`, `PlayerProfile`, `TowerLab`, `TowerCodex`, `StarCeremony`, `tower rail`, `(embedded everywhere)`

Centre-stage announcer cards, boss-fall rings, ult impact frames, Motion settings (Settings + pause), the draft pick commit; Results Stage N+1 + top-anchored capsule; ClaimAll on Pass/Quests/Milestones; Back/Escape behaviour, ScreenBoundary, Go ▸ advice links, decision badges, Home CTA above the fold; SectionNav/LoadoutStrip/ChipPopover; the replay theater's fall cards. Coverage: mobilecheck CLEAN (incl. the new `homeCtaContract`), first-session probe within budgets, live Playwright checks of the theater (fall card + save not credited) and the Gene Archive guide.

## Documentation changes

Registry says these move with the touched systems: `docs/ACCOUNT-LEVEL.md`, `docs/IDLE-HARVEST.md`, `docs/CONTRACTS.md`, `docs/GENOME-RANK.md`, `docs/PROGRESSION-SYSTEMS.md`, `docs/PROFILE.md`, `docs/ARENA.md`, `docs/ARENA_MATCH_REPORT.md`, `docs/ASSIMILATION.md`, `docs/ARCHITECTURE.md`, `docs/CODEMAP.md`, `docs/DESIGN.md`, `docs/HUD.md`, `docs/READABILITY.md`, `docs/REWARD-PRESENTATION.md`, `docs/LIVING-BATTLEFIELD.md`, `docs/DEV-RESET.md`, `docs/MUSIC.md`, `docs/GAME-FEEL.md`, `docs/CUTSCENES.md`, `docs/BATTLEPASS.md`, `docs/METABOLISM.md`, `docs/DAILY-LOGIN.md`, `docs/DAILY-RUN.md`, `docs/ECONOMY.md`, `docs/QUESTS.md`, `docs/BIOMES.md`, `docs/CAMPAIGN.md`, `docs/CAMPAIGN-EVENTS.md`, `docs/MODE-IDENTITY.md`, `docs/STAGES.md`, `docs/MAP-LAYOUTS.md`, `docs/BOSS-RUSH.md`, `docs/RESEARCH.md`, `docs/WEBSITE.md`, `docs/THREAT.md`, `docs/TOWER-STARS.md`, `docs/TOWER-BRANCHES.md`, `docs/TOWER-LAB.md`, `docs/TOWER-CODEX.md`, `docs/TOWERS.md`, `docs/STRAIN.md`, `docs/HEROES.md`, `docs/HERO-FRAMEWORK.md`, `docs/HERO-EVOLUTION.md`, `docs/HERO-SELECTION.md`, `docs/SLOTS.md`, `docs/LOOTBOX.md`, `docs/LOOT-PROGRESSION.md`, `docs/GENE-EVOLUTION.md`, `docs/CARDS.md`, `docs/GENE-AUDIT-REPORT.md`, `docs/PROGRESSION-PHILOSOPHY.md`, `docs/PROGRESSION-REDESIGN.md`, `docs/SIMULATION-FRAMEWORK.md`, `docs/BALANCE_REPORT.md`, `docs/VOWS.md`, `docs/PROGRESSION-GATING.md`, `docs/UNLOCK-TREE.md`, `docs/CHANGELOG-PIPELINE.md`, `docs/CORE-FRAMEWORKS.md`, `docs/AUTHORING.md`, `docs/HIVE-MIND.md`, `docs/POWER-SCORE.md`, `docs/POWER-AUDIT.md`, `docs/POWER-ADVISOR.md`, `docs/MISSION-CONTROL.md`, `docs/EVOLUTION-ROADMAP.md`, `docs/MULLIGANS.md`, `docs/PREMIUM-STORE.md`, `docs/PREMIUM-ECONOMY-REPORT.md`, `docs/ONLINE-FOUNDATION.md`, `docs/TRADING-PREP.md`, `docs/MASTERY.md`, `docs/ADAPTATION.md`, `docs/EQUIPMENT.md`, `docs/EQUIPMENT-PHILOSOPHY.md`, `docs/NUCLEUS.md`, `docs/HERO-SYMBIOTES.md`, `docs/COLLECTION.md`, `docs/EVOLUTION-HQ.md`, `docs/GENOME-CORE.md`, `docs/EVOLUTION-CAP.md`, `docs/LEXICON.md`, `docs/ECONOMY_FORMULAS.md`, `docs/SCALABILITY.md`, `docs/PROJECT_MANIFEST.md`, `docs/BOSS-DESIGN.md`, `docs/MEGA-BOSS.md`, `docs/DOCTRINES.md`, `docs/DIFFICULTY.md`, `docs/DIFFICULTY_DIRECTOR.md`, `docs/DEPLOYMENT.md`, `docs/COSMETICS.md`, `docs/NEMESIS.md`, `docs/MARKET.md`, `docs/DIL.md`, `docs/DEPENDENCY_GRAPH.md`, `docs/ENGINEERING-AUDIT.md`, `docs/GAME_CONSTITUTION.md`, `docs/PROJECT_STATUS.md`, `docs/AI_HANDOFF.md`, `docs/PIL.md`, `docs/ENDLESS-SCALING.md`, `docs/HERO-CINEMATICS.md`, `docs/TUTORIAL.md`, `docs/HELP.md`, `docs/TUTORIAL-AUDIT.md`, `docs/GUIDED-UNLOCKS.md`, `docs/RENDER-PIPELINE.md`, `docs/TOWER-VISUAL-EVOLUTION.md`, `docs/CAMERA.md`, `docs/COMBAT-VISUAL-STANDARDS.md`, `docs/REFORGE.md`, `docs/EXPEDITIONS.md`, `docs/COMMAND-CENTER.md`, `docs/HOME-BASE.md`, `docs/ONE-MORE-RUN.md`, `docs/PROGRESSION-LOOP.md`, `docs/UX-CONSOLIDATION.md`, `docs/HIVE-CONSTRUCTION.md`, `docs/INFESTATION.md`, `docs/REWARD-ARCHITECTURE.md`, `docs/REWARD-FREQUENCY.md`, `docs/I18N.md`, `docs/SHARD-ECONOMY.md`, `docs/PRIME-STRAINS.md`, `docs/ACCOUNTS.md`, `docs/REPLAY-SHARE.md`, `docs/LIVEOPS.md`, `docs/LIVE-EVENTS.md`, `docs/NOTIFICATIONS.md`, `docs/HIVE-INTEL.md`, `docs/SECURITY.md`, `docs/ANALYTICS.md`, `docs/PREDICTION.md`, `docs/UI-STANDARDS.md`, `docs/STYLE-GUIDE.md`, `docs/UI-MOTION.md`, `docs/VISUAL_IDENTITY.md`, `docs/UI_STYLE_GUIDE.md`, `docs/DESIGN_LANGUAGE.md`, `docs/RESPONSIVE-DESIGN.md`, `docs/ICON-LANGUAGE.md`, `docs/INFO-HIERARCHY.md`

Updated: GAME-STATE (batch summary + counts), BUGFIX-LOG (46–76), PROJECT_MANIFEST (HUD kit, VFX, economy sim), GAME-FEEL (CentreStage/theater), BOSS-DESIGN + NEMESIS (`bossKilled.final`), ARENA (mirror isolation), THREAT (naming), WEBSITE (media timing), SIGNATURE-MOMENTS (new, design only); the tracks updated their own (HUB-FLOW, NOTIFICATIONS, UI-STANDARDS, TOWERS/HEROES/ENEMIES, BALANCE_ARCHITECTURE §9, SHARD-ECONOMY §7, GENE-EVOLUTION, POWER-SCORE). The other registry-listed docs (ACCOUNT-LEVEL, IDLE-HARVEST, CONTRACTS, GENOME-RANK, PROFILE…): no change needed — their systems were touched for labels/hooks only.

## Save changes

None — save layer untouched.

## Known edge cases

- `gameEvents` is global: a second Game (theater, Arena mirror, verifier) must `isolateEvents()`, or its kills credit the viewer's save.
- A splitter boss fires `bossKilled` per piece; anything meaning "the boss is dead" reads `final`.
- Old replay/arena records lack newer tower kinds; the Game fills them neutral — keep it that way when adding kinds.
- Security guards are OFF in Node tests; a rate-limit bug needs `setSecurityEnabled(true)` + a fixed clock to reproduce (see battlePassMeta / meta.test).
- Adding enemies to a stage pool changes the media stills' waves — re-review `npm run media` output.
- Chronicle appends raw commit subjects to the open release; curate `changelog/ledger.json` before a deploy (v2026.11.04 is sealed as shipped; v2026.11.04.2 is this batch).

## Remaining technical debt

- `BRANCH_HITSTOP` is sim-set, outside the FEEL table.
- BALANCE_REPORT.md / PROGRESSION_REPORT.md predate the Molt Imprint (re-render with the seeded matrix, ~70 min); acquisitions now count kept levels.
- Essence pile-up after ~700h and unspent Catalyst in sims (BALANCE_ARCHITECTURE §9.5).
- The Campaign persona's late pacing rose ~10% with the Imprint (the persona the trough hurt most) — watch it in the next report.

## Recommended next tasks

1. Signature moments in order 1 → 2 → 4 → 3 (docs/SIGNATURE-MOMENTS.md), each reviewed from a frame-stepped capture.
2. Re-render BALANCE_REPORT / PROGRESSION_REPORT under the Molt Imprint and re-check the Campaign persona's pacing.
3. Essence sinks past ~700h (BALANCE_ARCHITECTURE §9.5).

## Future expansion hooks

- `render/feel.ts` `ANNOUNCE` / `FEEL` — one row per new centre-stage moment or feel event; `ui/components/CentreStage.tsx` `StageCard` for its markup.
- `ui/browserBack.ts` `useDismiss` — any new modal joins Back/Escape in one line.
- `core/game.ts` `Game.isolateEvents` — for any future spectator/simulation Game.
- `core/events.ts` `bossKilled.final` — for any "boss is dead" consumer.
- `state/meta.ts` `towerShardNeed` — the shard-surplus → Essence rule, data-driven per tower.
