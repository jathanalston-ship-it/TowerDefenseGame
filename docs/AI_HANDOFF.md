# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the judgment sections were filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-11-04 01:10 UTC · **Diff scope:** 6390559...HEAD
- **Branch:** claude/beautiful-feynman-qdyilo · **HEAD:** 5e6af84

## Summary of work completed

Executed the 2026-11 player-experience review end to end (first hour, the run, the meta, the
platform) as seven parallel tracks merged and verified here; GAME-STATE's "First-hour, run, meta &
platform pass" summary is the map. The first session now has one graduation reward, a lane-safe
2-wave tutorial and ONE unlock summary after run 1 (probe: 10 modals → 1). Runs gained a
board-first layout on every device (incl. portrait phones), 13 data-driven arena layouts, a rising
Stage 1–3 curve, 25 Rule Genes, automation limited to solved content and a 10-rung Threat ladder
(save v55). The meta reveals over S4→S30 with fewer visible currencies, host tabs (26 nav rows),
auto-claim and decision-only badges; hub screens are lazy-loaded (boot JS 820 → ~517 KB gzip).
**Know this first:** `unlocks.isOpenNav` is the single guidance gate and `rewardVisibility.ts`
the single currency-visibility gate — new advice, badges or reward surfaces must go through them.

## Files modified

- Source (94): `src/changelog/releases.gen.ts`, `src/core/campaign.ts`, `src/core/cards.ts`, `src/core/config.ts`, `src/core/daily.ts`, `src/core/difficultyDirector.ts`, `src/core/economyDirector.ts`, `src/core/effectLanguage.ts`, `src/core/game.ts`, `src/core/geneUpgrades.ts`, `src/core/hivemind.ts`, `src/core/map.ts`, `src/core/mapLayouts.ts`, `src/core/premium.ts`, `src/core/sim.testutil.ts`, `src/core/threat.ts`, `src/core/tutorial.ts`, `src/core/types.ts`, `src/dev/dil/knowledge.ts`, `src/dev/docSync.ts`, `src/dev/systemRegistry.ts`, `src/i18n/index.ts`, `src/index.css`, `src/main.tsx`, `src/net/storeRegion.ts`, `src/net/swRegister.ts`, `src/render/renderer.ts`, `src/save/derive.ts`, `src/save/merge.ts`, `src/save/saveStore.ts`, `src/state/achievements.ts`, `src/state/autoClaim.ts`, `src/state/mechanics.ts`, `src/state/meta.ts`, `src/state/missionControl.ts`, `src/state/nextGoal.ts`, `src/state/notificationSources.ts`, `src/state/notifications.ts`, `src/state/prefs.ts`, `src/state/profile.ts`, `src/state/progressionLoop.ts`, `src/state/recommendations.ts`, `src/state/rewardToast.ts`, `src/state/rewardVisibility.ts`, `src/state/runDebrief.ts`, `src/state/unlocks.ts`, `src/ui/AchievementToaster.tsx`, `src/ui/App.tsx`, `src/ui/BossRushScreen.tsx`, `src/ui/BuildControls.tsx`, `src/ui/CampaignScreen.tsx`, `src/ui/CommandCenter.tsx`, `src/ui/DeployScreen.tsx`, `src/ui/DraftModal.tsx`, `src/ui/EquipmentPanel.tsx`, `src/ui/GameView.tsx`, `src/ui/GeneticVault.tsx`, `src/ui/HiveScreen.tsx`, `src/ui/Hub.tsx`, `src/ui/HubLanding.tsx`, `src/ui/Hud.tsx`, `src/ui/HudTour.tsx`, `src/ui/InfiniteScreen.tsx`, `src/ui/Inspector.tsx`, `src/ui/NextGoalBanner.tsx`, `src/ui/PlayerProfile.tsx`, `src/ui/PremiumStore.tsx`, `src/ui/QuestBoard.tsx`, `src/ui/Results.tsx`, `src/ui/RewardReveal.tsx`, `src/ui/TutorialRunner.tsx`, `src/ui/VaultReveal.tsx`, `src/ui/Wardrobe.tsx`, `src/ui/WhatsNew.tsx`, `src/ui/components/AccountXpBar.tsx`, `src/ui/components/AutoClaimSummary.tsx`, `src/ui/components/FlashOfferPopup.tsx`, `src/ui/components/HiveOrganism.tsx`, `src/ui/components/HostTabs.tsx`, `src/ui/components/MaterialsChip.tsx`, `src/ui/components/RewardToaster.tsx`, `src/ui/components/RotateGate.tsx`, `src/ui/components/ScreenFallback.tsx`, `src/ui/components/ThreatPicker.tsx`, `src/ui/components/WardrobeReveal.tsx`, `src/ui/homeModel.ts`, `src/ui/layoutProfile.ts`, `src/ui/lazyNamed.ts`, `src/ui/navModel.ts`, `src/ui/tutorial/Commissioning.tsx`, `src/ui/tutorial/TutorialOverlay.tsx`, `src/ui/tutorial/TutorialRewardReveal.tsx`, `src/ui/tutorial/primitives.tsx`, `src/ui/tutorial/tutorialDirector.ts`
- Tests (36): `functions/lootbox.test.ts`, `site/gen.test.ts`, `src/core/campaign.test.ts`, `src/core/cards.test.ts`, `src/core/heroEvoGame.test.ts`, `src/core/hiveSiege.test.ts`, `src/core/hivemind.test.ts`, `src/core/mapLayouts.test.ts`, `src/core/rewardLoops.test.ts`, `src/core/ruleGenes.test.ts`, `src/core/threat.test.ts`, `src/core/tutorial.test.ts`, `src/core/tutorialGate.test.ts`, `src/dev/progressionSim.test.ts`, `src/dev/tutorialAnchors.test.ts`, `src/net/storeRegion.test.ts`, `src/state/autoClaim.test.ts`, `src/state/campaignCurve.test.ts`, `src/state/geneArchive.test.ts`, `src/state/mechanics.test.ts`, `src/state/missionControl.test.ts`, `src/state/modeGates.test.ts`, `src/state/nextGoal.test.ts`, `src/state/notificationSources.season.test.ts`, `src/state/progressionLoop.test.ts`, `src/state/questsMeta.test.ts`, `src/state/recommendations.test.ts`, `src/state/research.test.ts`, `src/state/rewardToast.test.ts`, `src/state/rewardVisibility.test.ts`, `src/state/runDebrief.test.ts`, `src/state/threatMeta.test.ts`, `src/state/tutorialRewards.test.ts`, `src/state/unlocks.test.ts`, `src/ui/homeModel.test.ts`, `src/ui/navModel.test.ts`
- Docs (43): `docs/ACCOUNTS.md`, `docs/BALANCE_ARCHITECTURE.md`, `docs/BOSS-DESIGN.md`, `docs/BOSS-RUSH.md`, `docs/BUGFIX-LOG.md`, `docs/CAMPAIGN.md`, `docs/CARDS.md`, `docs/COGLOAD_REPORT.md`, `docs/DAILY-RUN.md`, `docs/DEPENDENCY_GRAPH.md`, `docs/DEPLOYMENT.md`, `docs/DIFFICULTY_DIRECTOR.md`, `docs/DIL_GRAPH.md`, `docs/ECONOMY.md`, `docs/ECONOMY_FORMULAS.md`, `docs/FIRST-SESSION-PROBE.md`, `docs/FIRST_SESSION_REPORT.md`, `docs/GAME-STATE.md`, `docs/GENE-EVOLUTION.md`, `docs/GUIDED-UNLOCKS.md`, `docs/HELP.md`, `docs/HERO-EVOLUTION.md`, `docs/HISTORY.md`, `docs/HIVE-MIND.md`, `docs/HUD.md`, `docs/MAP-LAYOUTS.md`, `docs/MODE-IDENTITY.md`, `docs/NOTIFICATIONS.md`, `docs/PREMIUM-STORE.md`, `docs/PROFILE.md`, `docs/PROGRESSION-GATING.md`, `docs/PROGRESSION-LOOP.md`, `docs/PROGRESSION_REPORT.md`, `docs/PROJECT_MANIFEST.md`, `docs/RELEASE-GUIDE.md`, `docs/RESPONSIVE-DESIGN.md`, `docs/REWARD-PRESENTATION.md`, `docs/THREAT.md`, `docs/TUTORIAL-AUDIT.md`, `docs/TUTORIAL.md`, `docs/UNLOCK-TREE.md`, `docs/VALIDATION_REPORT.md`, `docs/devlog/DRAFT-2026-11-04.md`

## Systems affected (from the dependency registry)

- **account-level** — `src/ui/components/AccountXpBar.tsx`
- **accounts** — `src/save/merge.ts`
- **achievements** — `src/state/achievements.ts`, `src/ui/AchievementToaster.tsx`
- **boss-rush** — `src/ui/BossRushScreen.tsx`
- **campaign** — `src/core/campaign.ts`, `src/ui/CampaignScreen.tsx`
- **chronicle** — `src/changelog/releases.gen.ts`
- **content-infra** — `src/core/config.ts`, `src/core/types.ts`
- **cosmetics** — `src/ui/Wardrobe.tsx`, `src/ui/components/WardrobeReveal.tsx`
- **currencies** — `src/core/economyDirector.ts`, `src/state/rewardVisibility.ts`, `src/ui/components/MaterialsChip.tsx`
- **daily** — `src/core/daily.ts`
- **dev-registry** — `src/dev/dil/knowledge.ts`, `src/dev/docSync.ts`, `src/dev/systemRegistry.ts`
- **difficulty** — `src/core/difficultyDirector.ts`
- **engine** — `src/core/game.ts`, `src/core/map.ts`, `src/core/sim.testutil.ts`
- **equipment** — `src/ui/EquipmentPanel.tsx`
- **gene-cards** — `src/core/cards.ts`, `src/core/effectLanguage.ts`, `src/core/geneUpgrades.ts`, `src/ui/DraftModal.tsx`
- **hive-construction** — `src/ui/HiveScreen.tsx`, `src/ui/components/HiveOrganism.tsx`
- **hive-mind** — `src/core/hivemind.ts`
- **hub-shell** — `src/main.tsx`, `src/net/swRegister.ts`, `src/state/nextGoal.ts`, `src/state/progressionLoop.ts`, `src/ui/App.tsx`, `src/ui/CommandCenter.tsx`, `src/ui/DeployScreen.tsx`, `src/ui/Hub.tsx`, `src/ui/NextGoalBanner.tsx`, `src/ui/components/HostTabs.tsx`, `src/ui/homeModel.ts`, `src/ui/navModel.ts`
- **i18n** — `src/i18n/index.ts`
- **infinite** — `src/ui/InfiniteScreen.tsx`
- **loot** — `src/ui/GeneticVault.tsx`, `src/ui/VaultReveal.tsx`
- **map-layouts** — `src/core/mapLayouts.ts`
- **meta-store** — `src/save/derive.ts`, `src/save/merge.ts`, `src/save/saveStore.ts`, `src/state/meta.ts`, `src/state/prefs.ts`
- **notifications** — `src/state/autoClaim.ts`, `src/state/notificationSources.ts`, `src/state/notifications.ts`, `src/state/recommendations.ts`, `src/state/rewardToast.ts`, `src/ui/HubLanding.tsx`, `src/ui/components/AutoClaimSummary.tsx`, `src/ui/components/RewardToaster.tsx`
- **onboarding** — `src/core/tutorial.ts`, `src/state/mechanics.ts`, `src/ui/HudTour.tsx`, `src/ui/TutorialRunner.tsx`, `src/ui/WhatsNew.tsx`, `src/ui/tutorial/Commissioning.tsx`, `src/ui/tutorial/TutorialOverlay.tsx`, `src/ui/tutorial/TutorialRewardReveal.tsx`, `src/ui/tutorial/primitives.tsx`, `src/ui/tutorial/tutorialDirector.ts`
- **power** — `src/state/missionControl.ts`
- **premium** — `src/core/premium.ts`, `src/net/storeRegion.ts`, `src/ui/PremiumStore.tsx`, `src/ui/components/FlashOfferPopup.tsx`
- **profile** — `src/state/profile.ts`, `src/ui/PlayerProfile.tsx`
- **progression-gating** — `src/state/unlocks.ts`
- **quests** — `src/ui/QuestBoard.tsx`
- **rendering** — `src/render/renderer.ts`
- **run-ui** — `src/state/runDebrief.ts`, `src/ui/BuildControls.tsx`, `src/ui/GameView.tsx`, `src/ui/Hud.tsx`, `src/ui/Inspector.tsx`, `src/ui/Results.tsx`, `src/ui/RewardReveal.tsx`
- **threat** — `src/core/threat.ts`, `src/ui/components/ThreatPicker.tsx`
- **ui-kit** — `src/ui/components/RotateGate.tsx`, `src/ui/components/ScreenFallback.tsx`, `src/ui/layoutProfile.ts`, `src/ui/lazyNamed.ts`
- Consumer ring (verify, unchanged): analytics, arena, audio, battle-pass, biomes, bosses, collection, contracts, crafting, cutscenes, daily-login, devtools, directives, doctrines, evolution-hq, expeditions, field-research, genome-rank, hero-cinematics, hero-symbiotes, heroes, idle-harvest, infestation, liveops, living-battlefield, mastery, mega-bosses, metabolism, mulligans, nemesis, net-backend, nucleus, online-foundation, pil, prediction, prestige, reward-architecture, security, shards-economy, splice-market, towers, website

## Power Score changes

Only the gene library moved: 25 Rule Genes raise the maxed library's Power from ≈×2.76 to ≈×3.08
(`geneArchive.test` ceiling 2.9 → 3.2). `GENE_POWER_SCALE` is unchanged, so no existing account's
Power shifts. Threat rewards are cosmetic-only (`threatMeta.test` "never Power"). Readiness now
warns below 90 % of recommended Power (`READINESS.warnBelow`), pinned in `progressionLoop.test`.

## UI changes

Surfaces in the blast radius: `Results (XP fill + level-ups)`, `PlayerProfile (level block)`, `CommandCenter vitals`, `Hub topbar chip`, `AccountPanel`, `WelcomeGate`, `ConflictModal`, `PlayerProfile`, `Hub`, `AchievementPanel`, `RewardReveal (inline strip)`, `AchievementToaster`, `BossRushScreen`, `BioRoulette`, `CommandCenter`, `CampaignScreen`, `App (UpdateBriefing popup)`, `Wardrobe`, `PhenotypeLab`, `SpecimenVault`, `WardrobeReveal`, `CurrencyIcon (everywhere)`, `top resource bar`, `InfiniteScreen`, `GameView`, `Hud`, `Toolbar`, `BuildControls`, `Inspector`, `BuildPanel`, `EquipmentPanel`, `ItemDetails`, `EquipmentCollection (Equip Codex gallery)`, `HeroGearPreview`, `GeneArchive`, `DraftModal`, `gene splash`, `HiveScreen`, `LabAtmosphere (fixture layers)`, `GameView (◈ HIVE INTELLIGENCE button + pulse ticker)`, `ProgressDashboard`, `Hub (settings language picker)`, `GeneticVault`, `VaultReveal`, `LootMeter`, `LootToaster`, `CampaignScreen (stage preview layout line)`, `DeployScreen (deploy sub-line)`, `SaveManager`, `Hub (badges)`, `RewardToaster (claim popups)`, `nav badges`, `HelpWiki`, `WhatsNew`, `HudTour`, `CommandCenter (tips)`, `TutorialOverlay`, `CommandCenter (recommended power + Growth panel)`, `Hud (live run Power)`, `PremiumStore`, `Hub (nav gating + FeatureLocked)`, `WhatsNew (unlock ceremony)`, `HudTour (revealed stops)`, `CommandCenter (widget gates)`, `QuestBoard`, `the battlefield itself`, `Results`, `ALL`, `ThreatPicker (CampaignScreen replay panel, InfiniteScreen, BossRushScreen)`, `ThreatResult (Results)`, `ThreatRecord (PlayerProfile)`, `wm-threat chip (run HUD wave module)`, `(embedded everywhere)`

Tutorial order/callouts, Commissioning guest choice, one unlock summary + held/collapsed toasts,
Results (two-column, defeat debrief, auto-claim row, Threat banner), run layout v2 (run-controls
strip, bigger board, phone portrait/landscape with drawers), layout chip on stage preview/deploy,
ThreatPicker on Campaign replay/Infinite/Boss Rush, Materials chip, host tabs, Rule badge in drafts,
the Hive button's locked state (desktop reason / phone 🔒). Headless coverage on the integrated
build: `npm run probe:first-session` (all 5 budgets pass), `npm run mobilecheck` CLEAN (26 screens +
in-run × 6 viewports + tutorial walks), `npm run cogload` regenerated.

## Documentation changes

Registry says these move with the touched systems: `docs/ACCOUNT-LEVEL.md`, `docs/IDLE-HARVEST.md`, `docs/CONTRACTS.md`, `docs/GENOME-RANK.md`, `docs/ACCOUNTS.md`, `docs/DEPLOYMENT.md`, `docs/TUTORIAL.md`, `docs/HELP.md`, `docs/TUTORIAL-AUDIT.md`, `docs/GUIDED-UNLOCKS.md`, `docs/ANALYTICS.md`, `docs/PROGRESSION-SYSTEMS.md`, `docs/PROFILE.md`, `docs/BOSS-RUSH.md`, `docs/MODE-IDENTITY.md`, `docs/RESEARCH.md`, `docs/WEBSITE.md`, `docs/THREAT.md`, `docs/CAMPAIGN.md`, `docs/CAMPAIGN-EVENTS.md`, `docs/STAGES.md`, `docs/DAILY-RUN.md`, `docs/TOWER-STARS.md`, `docs/TOWER-BRANCHES.md`, `docs/TOWER-LAB.md`, `docs/TOWER-CODEX.md`, `docs/TOWERS.md`, `docs/STRAIN.md`, `docs/HEROES.md`, `docs/HERO-FRAMEWORK.md`, `docs/HERO-EVOLUTION.md`, `docs/HERO-SELECTION.md`, `docs/SLOTS.md`, `docs/LOOTBOX.md`, `docs/LOOT-PROGRESSION.md`, `docs/REWARD-PRESENTATION.md`, `docs/GENE-EVOLUTION.md`, `docs/CARDS.md`, `docs/GENE-AUDIT-REPORT.md`, `docs/PROGRESSION-PHILOSOPHY.md`, `docs/PROGRESSION-REDESIGN.md`, `docs/SIMULATION-FRAMEWORK.md`, `docs/BALANCE_REPORT.md`, `docs/VOWS.md`, `docs/PROGRESSION-GATING.md`, `docs/UNLOCK-TREE.md`, `docs/CHANGELOG-PIPELINE.md`, `docs/CODEMAP.md`, `docs/CORE-FRAMEWORKS.md`, `docs/AUTHORING.md`, `docs/HIVE-MIND.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/POWER-SCORE.md`, `docs/POWER-AUDIT.md`, `docs/POWER-ADVISOR.md`, `docs/MISSION-CONTROL.md`, `docs/EVOLUTION-ROADMAP.md`, `docs/MULLIGANS.md`, `docs/PREMIUM-STORE.md`, `docs/PREMIUM-ECONOMY-REPORT.md`, `docs/ONLINE-FOUNDATION.md`, `docs/TRADING-PREP.md`, `docs/MASTERY.md`, `docs/ADAPTATION.md`, `docs/EQUIPMENT.md`, `docs/EQUIPMENT-PHILOSOPHY.md`, `docs/NUCLEUS.md`, `docs/HERO-SYMBIOTES.md`, `docs/COLLECTION.md`, `docs/EVOLUTION-HQ.md`, `docs/GENOME-CORE.md`, `docs/EVOLUTION-CAP.md`, `docs/ECONOMY.md`, `docs/LEXICON.md`, `docs/ECONOMY_FORMULAS.md`, `docs/DEV-RESET.md`, `docs/SCALABILITY.md`, `docs/PROJECT_MANIFEST.md`, `docs/BOSS-DESIGN.md`, `docs/MEGA-BOSS.md`, `docs/BIOMES.md`, `docs/MAP-LAYOUTS.md`, `docs/DOCTRINES.md`, `docs/DIFFICULTY.md`, `docs/DIFFICULTY_DIRECTOR.md`, `docs/COSMETICS.md`, `docs/DAILY-LOGIN.md`, `docs/NEMESIS.md`, `docs/BATTLEPASS.md`, `docs/QUESTS.md`, `docs/MARKET.md`, `docs/REPLAY-SHARE.md`, `docs/LIVEOPS.md`, `docs/LIVE-EVENTS.md`, `docs/DIL.md`, `docs/DEPENDENCY_GRAPH.md`, `docs/ENGINEERING-AUDIT.md`, `docs/GAME_CONSTITUTION.md`, `docs/PROJECT_STATUS.md`, `docs/AI_HANDOFF.md`, `docs/PIL.md`, `docs/ENDLESS-SCALING.md`, `docs/ARENA.md`, `docs/ARENA_MATCH_REPORT.md`, `docs/HERO-CINEMATICS.md`, `docs/HUD.md`, `docs/READABILITY.md`, `docs/RENDER-PIPELINE.md`, `docs/TOWER-VISUAL-EVOLUTION.md`, `docs/GAME-FEEL.md`, `docs/CAMERA.md`, `docs/COMBAT-VISUAL-STANDARDS.md`, `docs/LIVING-BATTLEFIELD.md`, `docs/MUSIC.md`, `docs/REFORGE.md`, `docs/HIVE-CONSTRUCTION.md`, `docs/HOME-BASE.md`, `docs/COMMAND-CENTER.md`, `docs/ONE-MORE-RUN.md`, `docs/PROGRESSION-LOOP.md`, `docs/UX-CONSOLIDATION.md`, `docs/INFESTATION.md`, `docs/REWARD-ARCHITECTURE.md`, `docs/REWARD-FREQUENCY.md`, `docs/I18N.md`, `docs/SHARD-ECONOMY.md`, `docs/PRIME-STRAINS.md`, `docs/METABOLISM.md`, `docs/EXPEDITIONS.md`, `docs/NOTIFICATIONS.md`, `docs/HIVE-INTEL.md`, `docs/CUTSCENES.md`, `docs/SECURITY.md`, `docs/PREDICTION.md`, `docs/UI-STANDARDS.md`, `docs/STYLE-GUIDE.md`, `docs/UI-MOTION.md`, `docs/VISUAL_IDENTITY.md`, `docs/UI_STYLE_GUIDE.md`, `docs/DESIGN_LANGUAGE.md`, `docs/RESPONSIVE-DESIGN.md`, `docs/ICON-LANGUAGE.md`, `docs/INFO-HIERARCHY.md`

Updated this batch: TUTORIAL, TUTORIAL-AUDIT §G, HELP, PROFILE, ACCOUNTS, REWARD-PRESENTATION,
PROGRESSION-LOOP, PROGRESSION-GATING, UNLOCK-TREE (regen), NOTIFICATIONS, GUIDED-UNLOCKS, HUD,
RESPONSIVE-DESIGN, HIVE-MIND, HERO-EVOLUTION, MAP-LAYOUTS (new), CAMPAIGN, DAILY-RUN,
DIFFICULTY_DIRECTOR, CARDS, GENE-EVOLUTION, ECONOMY, ECONOMY_FORMULAS, THREAT (new), BOSS-RUSH,
MODE-IDENTITY, BOSS-DESIGN, BALANCE_ARCHITECTURE §8, PROGRESSION_REPORT (regen), PREMIUM-STORE,
RELEASE-GUIDE, DEPLOYMENT, FIRST-SESSION-PROBE (new), FIRST_SESSION_REPORT (gen), GAME-STATE,
BUGFIX-LOG (rows 17–44), PROJECT_MANIFEST (3 new sections), DIL_GRAPH/DEPENDENCY_GRAPH (regen),
COGLOAD_REPORT, VALIDATION_REPORT, HISTORY/patch notes. The remaining registry-listed docs need no
change (their systems are only in the consumer ring).

## Save changes

`CURRENT_VERSION = 55`. New field `threat: {campaign, endless, bossRush}` (best cleared rung per
mode) — additive: missing ⇒ zeros, `sanitizeThreat` clamps junk, `merge.ts` keeps per-mode maxima.
v54 is unused (Track D needed no field: re-pacing grandfathers through the existing
`director.revealed` latch). Tests: `threatMeta.test.ts` "v55 save" block (fresh, migration, merge).
The flawless-clear calm is a device pref (`prefs.ts`), not save data.

## Known edge cases

- `vitest` in the main checkout also collects `.claude/worktrees/**` if agent worktrees exist —
  run with `--exclude '.claude/**'` or remove merged worktrees first.
- The tutorial deals its draft during wave 1's settle beat (`openTutorialDraft` needs prep or
  settling); anything that force-advances lessons (mobilecheck's walker) must clear the wave first
  (`reachDraftLesson`).
- Run layout v2 keys tutorial anchors on `canvas.board`, `.ability-btn`, `[data-tut="ability"]` —
  `tutorialAnchors.test` fails if renamed. Probes must map slots through `canvas.board`'s rect,
  never hard-coded pixels.
- `.tut-callout` is `pointer-events: none`; every interactive child must opt back in.
- Arena layouts: new sim code must use the Game's own `NavField`, not `map.ts` module helpers
  (those read the classic field — goldens depend on it). Changing the grace window re-rolls
  Stages 1–7 (shared rng stream).
- Hub screens must be added via `lazyNamed` or the probe's boot-JS budget trips.

## Remaining technical debt

- Older width-based in-run CSS in `index.css` is overridden by run layout v2 and now dead.
- Bio-Dex "Brood Tyrant" still counts every boss kill (bosses use the tyrant type as a stand-in).
- Live achievement bursts while already on the hub are not collapsed (only the held flush is).
- The loop directive can still say "Push it" right after a loss when Power is within tolerance.
- The entry chunk is still >500 KB raw (sim/state core); further splitting needs a core boundary.

## Recommended next tasks

1. Legal decision on Ichor bought with money then spent on containers (`docs/PREMIUM-STORE.md`
   §paid-loot-boxes, `RELEASE-GUIDE.md` step 18) — not region-gated today.
2. A human playtest of the new first hour using `npm run probe:first-session --shots` as the
   script; watch Stage 3 (twin lanes) and the S4–S8 reveal beats.
3. Full spenders still clear Stages 1–3 at 98–100 % (`src/state/campaignCurve.test.ts`); decide
   whether that is acceptable or tune `CAMPAIGN_ONBOARDING`.
4. Remove the dead width-based run CSS once run layout v2 has soaked.
5. Fix the Bio-Dex boss tally (`runDebrief` bosses-slain ledger already names bosses).

## Future expansion hooks

- `core/mapLayouts.ts` — a new battlefield is one registry row; `layoutForStage` /
  `layoutIdForDepth` own selection.
- `core/threat.ts` — rungs and levers are data rows; `threatRewardMult` / `threatWarp`.
- `core/cards.ts` `RULE_CHANGING_OPS` + `effectLanguage.ts` `EVENT_VOCAB` — new hook events
  (`eliteKilled`, `nucleusHit`, `towerDeployed`, `strainRaised`) are ready for more Rule Genes.
- `state/rewardVisibility.ts` `REVEALED_WITH` — one line per new currency.
- `ui/navModel.ts` `FOLDED_NAVS` — fold further screens into host tabs.
- `functions/lib/lootbox.ts` + `PAID_LOOTBOX_BLOCKED_COUNTRIES` — region list is env config.
