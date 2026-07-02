// The SYSTEM DEPENDENCY REGISTRY (docs/DEPENDENCY_GRAPH.md is GENERATED from this file).
// Every gameplay system registers what it depends on, what it touches, and where it surfaces —
// so "what breaks if I change this?" is a lookup, not an investigation.
//
// RULES (enforced by systemRegistry.test.ts — the build goes red if you break them):
//   • Every non-test src file must be claimed by ≥1 system (new feature ⇒ register it here).
//   • Every glob must match ≥1 real file; every doc path must exist.
//   • dependsOn / help / tutorial / achievements / save references must resolve against the
//     real registries (mechanics, TUTORIALS, ACHIEVEMENTS, defaultSave) — no rot.
//   • docs/DEPENDENCY_GRAPH.md must be regenerated after edits (npm run docs:graph).
//
// Dev-only module: imported by tests + scripts, never by app code.

export interface SystemDef {
  id: string;
  name: string;
  purpose: string; // one line
  /** File globs this system owns ('*' = within a segment, '**' = across segments). */
  files: string[];
  /** System ids this one READS/CALLS (consumers are derived — never list them by hand). */
  dependsOn: string[];
  /** How it feeds the Power Score (null = intentionally none). */
  powerScore: string | null;
  /** SaveData top-level fields it owns or writes. */
  save: string[];
  /** Tutorial ids (core/tutorial.ts TUTORIALS) that teach it. */
  tutorial: string[];
  /** Help mechanic ids (state/mechanics.ts MECHANICS) that document it in-game. */
  help: string[];
  /** In-run HUD surfaces that show it (component names; [] = none). */
  hud: string[];
  /** Owning menu screens / UI components. */
  ui: string[];
  /** Collection interplay (category id or a note; null = none). */
  collection: string | null;
  /** Achievement ids referencing it. */
  achievements: string[];
  /** Localization surfaces. The game has NO i18n layer yet — every entry is 'inline-en' so the
   *  day i18n lands, this field already enumerates each system's string surface. */
  localization: 'inline-en' | 'none';
  /** Canonical docs (the ones that must move when this system moves). */
  docs: string[];
}

export const SYSTEMS: SystemDef[] = [
  {
    id: 'engine', name: 'Sim Engine', purpose: 'Deterministic fixed-timestep simulation — the Game, combat, statuses, targeting, spawning, run events.',
    files: ['src/core/game.ts', 'src/core/combat.ts', 'src/core/status.ts', 'src/core/targeting.ts', 'src/core/reactions.ts', 'src/core/spawndirector.ts', 'src/core/runEvents.ts', 'src/core/events.ts', 'src/core/map.ts', 'src/core/ability.ts', 'src/core/mutators.ts', 'src/core/modifiers.ts', 'src/core/simharness.ts', 'src/core/director.ts', 'src/core/sim.testutil.ts'],
    dependsOn: ['content-infra', 'towers', 'heroes', 'gene-cards', 'bosses', 'biomes', 'difficulty'],
    powerScore: 'emits the TEMPORARY in-run bucket (game.powerEffects)', save: [], tutorial: ['combat'], help: ['hive-core', 'biomass'],
    hud: ['Hud', 'Toolbar', 'BuildControls', 'Inspector', 'BuildPanel'], ui: ['GameView'], collection: 'kills/usage feed collection tiers', achievements: [],
    localization: 'inline-en', docs: ['docs/ARCHITECTURE.md', 'docs/CODEMAP.md', 'docs/DESIGN.md'],
  },
  {
    id: 'content-infra', name: 'Content Infrastructure', purpose: 'Registry<T>, validation, config tunables, shared types/math/rng/spatial — the data-driven backbone.',
    files: ['src/core/registry.ts', 'src/core/validate.ts', 'src/core/config.ts', 'src/core/types.ts', 'src/core/math.ts', 'src/core/rng.ts', 'src/core/spatial.ts', 'src/core/features.ts', 'src/vite-env.d.ts'],
    dependsOn: [], powerScore: null, save: [], tutorial: [], help: [], hud: [], ui: [], collection: null, achievements: [],
    localization: 'none', docs: ['docs/CODEMAP.md', 'docs/CORE-FRAMEWORKS.md', 'docs/AUTHORING.md'],
  },
  {
    id: 'power', name: 'Power Score', purpose: 'ONE account-strength number folded from every permanent bucket + the in-run temporary bucket.',
    files: ['src/core/power.ts', 'src/state/itemPower.ts', 'src/state/powerEvents.ts', 'src/ui/components/PowerScore.tsx', 'src/ui/components/PowerDelta.tsx', 'src/ui/components/PowerToaster.tsx'],
    dependsOn: ['content-infra'], powerScore: 'IS the model (buckets, effectsPower, FIELD_WEIGHT)', save: [], tutorial: [], help: ['power-score'],
    hud: ['Hud (live run Power)'], ui: ['ProgressDashboard', 'PlayScreen (recommended power)'], collection: 'collection completion feeds a bucket', achievements: [],
    localization: 'inline-en', docs: ['docs/POWER-SCORE.md', 'docs/POWER-AUDIT.md'],
  },
  {
    id: 'campaign', name: 'Campaign', purpose: 'Procedural authored-feeling stages; depth is the master progression gate.',
    files: ['src/core/campaign.ts', 'src/ui/CampaignScreen.tsx'],
    dependsOn: ['engine', 'biomes', 'bosses', 'difficulty', 'power'], powerScore: 'recommended-power display; first-clear rewards move account Power indirectly', save: ['campaign'],
    tutorial: [], help: ['campaign'], hud: [], ui: ['CampaignScreen', 'PlayScreen'], collection: 'biome discovery', achievements: [],
    localization: 'inline-en', docs: ['docs/CAMPAIGN.md', 'docs/MODE-IDENTITY.md', 'docs/STAGES.md'],
  },
  {
    id: 'infinite', name: 'Infinite Mode', purpose: 'Endless AI-Director escalation; personal bests + richest loot meter.',
    files: ['src/ui/InfiniteScreen.tsx'],
    dependsOn: ['engine', 'loot', 'difficulty'], powerScore: null, save: ['bestWave'], tutorial: [], help: ['infinite'],
    hud: [], ui: ['InfiniteScreen', 'PlayScreen'], collection: 'chest tiers unlock by best wave', achievements: [],
    localization: 'inline-en', docs: ['docs/ENDLESS-SCALING.md', 'docs/MODE-IDENTITY.md'],
  },
  {
    id: 'towers', name: 'Towers, Stars, Branches & Codex', purpose: 'Tower roster; permanent Star evolutions; in-run Branch specialization; the Codex.',
    files: ['src/core/stars.ts', 'src/core/branches.ts', 'src/core/branchTree.ts', 'src/ui/TowerLab.tsx', 'src/ui/TowerCodex.tsx', 'src/ui/TowerPortrait.tsx', 'src/ui/towerLabModel.ts', 'src/ui/towerCodexModel.ts', 'src/ui/StarCeremony.tsx', 'src/ui/components/BranchTree.tsx'],
    dependsOn: ['content-infra', 'shards-economy', 'campaign'], powerScore: 'stars/branches feed permanent + temporary buckets', save: ['towerStars', 'towerShards', 'towerMasteryXp', 'towerForks'],
    tutorial: ['combat'], help: ['towers', 'tower-stars', 'tower-branches'], hud: ['tower rail', 'Inspector'], ui: ['TowerLab', 'TowerCodex', 'StarCeremony'],
    collection: 'towers category (usage tiers)', achievements: [], localization: 'inline-en',
    docs: ['docs/TOWER-STARS.md', 'docs/TOWER-BRANCHES.md', 'docs/TOWER-LAB.md', 'docs/TOWER-CODEX.md', 'docs/TOWERS.md'],
  },
  {
    id: 'mastery', name: 'Mastery / Adaptation', purpose: 'Identity-through-use: titles, procedural ranks, halos, Antigen-Point decision trees.',
    files: ['src/core/mastery.ts', 'src/core/adaptation.ts', 'src/state/masteryEvents.ts', 'src/ui/MasteryProfile.tsx', 'src/ui/components/AdaptationTree.tsx', 'src/ui/components/MasteryToaster.tsx'],
    dependsOn: ['stats', 'content-infra'], powerScore: 'mastery multiplier folds into the permanent bucket', save: ['towerMasteryXp', 'heroMasteryXp', 'adaptation', 'antigen'],
    tutorial: [], help: [], hud: ['halos (renderer)', 'live projection + level-up rings (GameView)', 'Inspector craft bar'], ui: ['MasteryProfile', 'MasteryToaster'], collection: null, achievements: [],
    localization: 'inline-en', docs: ['docs/MASTERY.md', 'docs/ADAPTATION.md'],
  },
  {
    id: 'heroes', name: 'Heroes', purpose: 'Autonomous champions: AI behaviors, abilities, stars, slots, in-run Hero Evolution.',
    files: ['src/core/heroIdentity.ts', 'src/core/heroLore.ts', 'src/core/heroEvolution.ts', 'src/ui/HeroLab.tsx', 'src/ui/HeroSelectPanel.tsx', 'src/ui/HeroSlotUnlock.tsx', 'src/ui/HeroEvolutionPanel.tsx', 'src/state/heroView.ts', 'src/ui/components/HeroPortrait.tsx'],
    dependsOn: ['content-infra', 'engine', 'shards-economy', 'campaign'], powerScore: 'hero stars/evolution feed permanent + temporary buckets', save: ['heroStars', 'heroShards', 'heroUnlocked', 'heroLoadout', 'heroMasteryXp'],
    tutorial: ['combat'], help: ['heroes', 'hero-slots'], hud: ['ability button', 'HeroSelectPanel'], ui: ['HeroLab'],
    collection: 'heroes category (usage tiers)', achievements: [], localization: 'inline-en',
    docs: ['docs/HEROES.md', 'docs/HERO-FRAMEWORK.md', 'docs/HERO-EVOLUTION.md', 'docs/HERO-SELECTION.md', 'docs/SLOTS.md'],
  },
  {
    id: 'equipment', name: 'Equipment & Armory', purpose: '~180 behavioral items, affixes, sets; per-hero Weapon/Armor/Relic loadouts.',
    files: ['src/core/equipment.ts', 'src/ui/EquipmentPanel.tsx', 'src/ui/ItemDetails.tsx', 'src/ui/components/ItemArt.tsx'],
    dependsOn: ['content-infra', 'loot', 'power', 'heroes'], powerScore: 'equipped items score via itemPower into the gear bucket', save: ['equipment'],
    tutorial: [], help: ['equipment'], hud: [], ui: ['EquipmentPanel', 'ItemDetails'], collection: 'equipment category (owned)', achievements: [],
    localization: 'inline-en', docs: ['docs/EQUIPMENT.md', 'docs/EQUIPMENT-PHILOSOPHY.md'],
  },
  {
    id: 'crafting', name: 'Crafting / Reforge', purpose: 'Materials sink: enhance, reroll, targeted swap, rarity upgrade.',
    files: ['src/core/reforge.ts', 'src/core/materialDrop.ts'],
    dependsOn: ['equipment', 'loot'], powerScore: 'reforged items re-score through the gear bucket', save: ['mats', 'matPity'],
    tutorial: [], help: ['equipment-reforge'], hud: [], ui: ['EquipmentPanel (reforge overlay)'], collection: null, achievements: [],
    localization: 'inline-en', docs: ['docs/REFORGE.md'],
  },
  {
    id: 'loot', name: 'Loot & Bio-Containers', purpose: 'Meter → pre-determined containers → Vault ceremony; pity + progression catch-up.',
    files: ['src/core/loot.ts', 'src/core/lootQueue.ts', 'src/core/progressionLoot.ts', 'src/state/lootbox.ts', 'src/state/vaultReveal.ts', 'src/ui/GeneticVault.tsx', 'src/ui/VaultReveal.tsx', 'src/ui/LootMeter.tsx', 'src/ui/LootToaster.tsx'],
    dependsOn: ['content-infra', 'power', 'campaign'], powerScore: 'reads Power for catch-up bias; grants move account Power', save: ['lootQueue', 'pendingContainers'],
    tutorial: [], help: ['containers'], hud: ['LootMeter', 'LootToaster'], ui: ['GeneticVault', 'VaultReveal'], collection: 'chests category', achievements: [],
    localization: 'inline-en', docs: ['docs/LOOTBOX.md', 'docs/LOOT-PROGRESSION.md', 'docs/REWARD-PRESENTATION.md'],
  },
  {
    id: 'gene-cards', name: 'Gene Cards (draft + permanent evolution)', purpose: 'Between-wave drafts + the permanent Archive: Essence-funded levels, gates, loadouts, Ascension backend.',
    files: ['src/core/cards.ts', 'src/core/geneCards.ts', 'src/core/geneUpgrades.ts', 'src/core/geneEssence.ts', 'src/core/geneLoadout.ts', 'src/state/geneArchive.ts', 'src/ui/GeneArchive.tsx', 'src/ui/DraftModal.tsx', 'src/ui/cardAffects.tsx', 'src/ui/components/GeneCardArt.tsx', 'src/core/doctrines.ts'],
    dependsOn: ['content-infra', 'power', 'campaign', 'shards-economy'], powerScore: 'permanent levels fold linearly (GENE_POWER_SCALE); drafts feed the temporary bucket; validator enforces visibility', save: ['genes', 'geneEssence', 'geneSlots', 'geneLoadout'],
    tutorial: ['combat'], help: ['gene-cards', 'gene-essence', 'gene-archive', 'gene-loadout'], hud: ['DraftModal', 'BuildPanel', 'gene splash'],
    ui: ['GeneArchive'], collection: 'cards category (Gene Level labels)', achievements: ['collector'], localization: 'inline-en',
    docs: ['docs/GENE-EVOLUTION.md', 'docs/CARDS.md', 'docs/GENE-AUDIT-REPORT.md'],
  },
  {
    id: 'shards-economy', name: 'Shards & Star Economy', purpose: 'Strain Samples / Apex Genome income + star cost curves + duplicate→Essence conversion seam.',
    files: [],
    dependsOn: ['loot'], powerScore: 'stars bought with shards move the permanent bucket', save: ['shards', 'lifetimeShards'],
    tutorial: [], help: ['tower-stars'], hud: [], ui: ['TowerLab', 'HeroLab'], collection: null, achievements: [],
    localization: 'inline-en', docs: ['docs/SHARD-ECONOMY.md', 'docs/ECONOMY.md'],
  },
  {
    id: 'collection', name: 'Collections / Codex', purpose: 'Discovery + usage tiers across all content; ranks, rewards, small Power fold.',
    files: ['src/core/collection.ts', 'src/ui/CollectionPanel.tsx'],
    dependsOn: ['content-infra', 'stats'], powerScore: 'completion feeds the collection bucket', save: [],
    tutorial: [], help: [], hud: [], ui: ['CollectionPanel'], collection: 'IS the system', achievements: ['collector'],
    localization: 'inline-en', docs: ['docs/COLLECTION.md'],
  },
  {
    id: 'evolution-hq', name: 'Evolution HQ (Genome Cores)', purpose: 'Permanent categorized account upgrades bought with Genome Cores.',
    files: ['src/state/evolutionHQ.ts', 'src/ui/EvolutionHQ.tsx', 'src/ui/EvolutionUnlock.tsx'],
    dependsOn: ['content-infra', 'prestige'], powerScore: 'META_UPGRADES fold into the permanent bucket', save: ['upgrades'],
    tutorial: [], help: ['genome-core'], hud: [], ui: ['EvolutionHQ'], collection: null, achievements: [],
    localization: 'inline-en', docs: ['docs/EVOLUTION-HQ.md', 'docs/GENOME-CORE.md', 'docs/EVOLUTION-CAP.md'],
  },
  {
    id: 'prestige', name: 'Prestige (Molt / Ascendant)', purpose: 'Reset loop: mint Ascendant Cells → compounding multiplier + permanent tree.',
    files: ['src/core/prestige.ts', 'src/core/ascendant.ts', 'src/ui/PrestigePanel.tsx'],
    dependsOn: ['campaign', 'evolution-hq'], powerScore: 'the P bucket (log fold of Cells + tree)', save: ['prestige'],
    tutorial: [], help: ['prestige', 'ascension'], hud: [], ui: ['PrestigePanel', 'EvolutionHQ (Ascension section)'], collection: null, achievements: [],
    localization: 'inline-en', docs: ['docs/PROGRESSION-PHILOSOPHY.md', 'docs/PROGRESSION-REDESIGN.md'],
  },
  {
    id: 'currencies', name: 'Currencies & Economy Framework', purpose: 'Currency identities (icon/color/tooltip/format) + the adaptive economy framework: one factor-traced income composition per currency, adaptive seams, health guards.',
    files: ['src/core/currencies.ts', 'src/core/economyDirector.ts', 'src/ui/components/CurrencyIcon.tsx'],
    dependsOn: ['content-infra'], powerScore: null, save: [], tutorial: [], help: ['gene-essence'], hud: ['top resource bar'], ui: ['CurrencyIcon (everywhere)'],
    collection: null, achievements: [], localization: 'inline-en', docs: ['docs/ECONOMY.md', 'docs/LEXICON.md', 'docs/ECONOMY_FORMULAS.md'],
  },
  {
    id: 'achievements', name: 'Achievements', purpose: 'Milestone recognition with auto-granted Shard rewards.',
    files: ['src/state/achievements.ts', 'src/ui/AchievementPanel.tsx', 'src/ui/AchievementToaster.tsx'],
    dependsOn: ['stats'], powerScore: 'rewards (shards) move Power indirectly', save: ['achievements'],
    tutorial: [], help: [], hud: ['AchievementToaster'], ui: ['AchievementPanel', 'RewardReveal (inline strip)'], collection: null,
    achievements: [], localization: 'inline-en', docs: ['docs/PROGRESSION-SYSTEMS.md'],
  },
  {
    id: 'stats', name: 'Lifetime Stats', purpose: 'Run summaries accumulated into lifetime stats — the substrate for mastery/collection/achievements/profile.',
    files: ['src/state/stats.ts'],
    dependsOn: [], powerScore: null, save: ['stats', 'totalRuns', 'bestWave'], tutorial: [], help: [], hud: [], ui: ['PlayerProfile', 'MasteryProfile'],
    collection: 'usage counts drive tiers', achievements: ['collector'], localization: 'inline-en', docs: ['docs/PROGRESSION-SYSTEMS.md'],
  },
  {
    id: 'profile', name: 'Player Profile', purpose: 'The account dashboard: banner + frames, registry-driven career stats, power breakdown, showcase, milestone timeline, next milestones, analytics.',
    files: ['src/state/profile.ts', 'src/ui/PlayerProfile.tsx'],
    dependsOn: ['stats', 'power', 'achievements', 'collection', 'prestige', 'hub-shell'], powerScore: null,
    save: ['createdAt', 'profileName', 'profileFrame', 'timeline'], tutorial: [], help: [], hud: [],
    ui: ['PlayerProfile'], collection: 'per-category completion rendered', achievements: [],
    localization: 'inline-en', docs: ['docs/PROFILE.md'],
  },
  {
    id: 'onboarding', name: 'Tutorials, Help & Onboarding', purpose: 'Combat Tutorial over a live sim, HUD Tour, mechanics-registry Help wiki, What\'s New, loading tips.',
    files: ['src/core/tutorial.ts', 'src/state/tutorial.ts', 'src/state/mechanics.ts', 'src/ui/TutorialRunner.tsx', 'src/ui/tutorial/*', 'src/ui/HelpWiki.tsx', 'src/ui/WhatsNew.tsx', 'src/ui/HudTour.tsx', 'src/ui/tips.ts'],
    dependsOn: ['engine', 'meta-store'], powerScore: null, save: ['tutorial', 'help'],
    tutorial: ['combat'], help: [], hud: ['TutorialOverlay'], ui: ['HelpWiki', 'WhatsNew', 'HudTour', 'PlayScreen (tips)'], collection: null,
    achievements: [], localization: 'inline-en', docs: ['docs/TUTORIAL.md', 'docs/HELP.md'],
  },
  {
    id: 'hub-shell', name: 'Hub Shell & Home', purpose: 'The nav shell, home base, mission control, dashboards, next-goal + progression-loop surfacing.',
    files: ['src/ui/Hub.tsx', 'src/ui/PlayScreen.tsx', 'src/ui/ProgressDashboard.tsx', 'src/ui/NextGoalBanner.tsx', 'src/state/nextGoal.ts', 'src/state/progressionLoop.ts', 'src/ui/hubProgress.ts', 'src/ui/homeBaseTiers.ts', 'src/ui/LabAtmosphere.tsx', 'src/ui/App.tsx', 'src/ui/ErrorBoundary.tsx', 'src/main.tsx'],
    dependsOn: ['meta-store', 'notifications', 'prediction', 'power'], powerScore: null, save: [],
    tutorial: [], help: [], hud: [], ui: ['Hub', 'PlayScreen', 'ProgressDashboard'], collection: null, achievements: [],
    localization: 'inline-en', docs: ['docs/HOME-BASE.md', 'docs/ONE-MORE-RUN.md', 'docs/HUD.md', 'docs/PROGRESSION-LOOP.md'],
  },
  {
    id: 'run-ui', name: 'In-Run HUD & Results', purpose: 'The battlefield interface: HUD, toolbar, inspector, build panel, results + reward reveal.',
    files: ['src/ui/GameView.tsx', 'src/ui/Hud.tsx', 'src/ui/Toolbar.tsx', 'src/ui/BuildControls.tsx', 'src/ui/BuildPanel.tsx', 'src/ui/Inspector.tsx', 'src/ui/Results.tsx', 'src/ui/RewardReveal.tsx', 'src/ui/RewardPreview.tsx'],
    dependsOn: ['engine', 'meta-store', 'power'], powerScore: 'renders live run Power', save: [],
    tutorial: ['combat'], help: [], hud: ['ALL'], ui: ['Results'], collection: null, achievements: [],
    localization: 'inline-en', docs: ['docs/HUD.md', 'docs/READABILITY.md', 'docs/REWARD-PRESENTATION.md'],
  },
  {
    id: 'notifications', name: 'Notifications', purpose: 'Generic menu badges: registered count(save) sources per nav channel.',
    files: ['src/state/notifications.ts', 'src/state/notificationSources.ts'],
    dependsOn: ['meta-store'], powerScore: null, save: [], tutorial: [], help: [], hud: ['nav badges'], ui: ['Hub (badges)'],
    collection: 'collection channel badge', achievements: [], localization: 'inline-en', docs: ['docs/NOTIFICATIONS.md'],
  },
  {
    id: 'prediction', name: 'Progress Prediction', purpose: 'Self-calibrating reach forecasts from Power history.',
    files: ['src/core/predict.ts', 'src/ui/PredictionPanel.tsx'],
    dependsOn: ['power'], powerScore: 'consumes the score as its input signal', save: ['prediction'],
    tutorial: [], help: ['power-score'], hud: [], ui: ['PredictionPanel', 'ProgressDashboard'], collection: null, achievements: [],
    localization: 'inline-en', docs: ['docs/PREDICTION.md'],
  },
  {
    id: 'meta-store', name: 'Meta Store & Save', purpose: 'The permanent progression store + versioned/checksummed persistence, backups, resets, prefs.',
    files: ['src/state/meta.ts', 'src/state/store.ts', 'src/state/prefs.ts', 'src/state/devReset.ts', 'src/save/*', 'src/ui/SaveManager.tsx'],
    dependsOn: ['content-infra'], powerScore: 'recomputes the account score on every persist', save: ['ALL (owner)'],
    tutorial: [], help: [], hud: [], ui: ['SaveManager'], collection: null, achievements: [],
    localization: 'inline-en', docs: ['docs/DEV-RESET.md', 'docs/SCALABILITY.md', 'docs/PROJECT_MANIFEST.md'],
  },
  {
    id: 'bosses', name: 'Bosses', purpose: 'Module/phase framework + procedural assembly; campaign milestone bosses.',
    files: ['src/core/boss.ts'],
    dependsOn: ['engine', 'content-infra'], powerScore: null, save: ['bossesSlain'], tutorial: [], help: ['bosses'],
    hud: ['boss bar'], ui: [], collection: 'bosses category (chassis)', achievements: [], localization: 'inline-en',
    docs: ['docs/BOSS-DESIGN.md'],
  },
  {
    id: 'biomes', name: 'Biomes', purpose: 'Environmental zones with modifiers/hazards rotating with depth.',
    files: ['src/core/biomes.ts'],
    dependsOn: ['content-infra'], powerScore: null, save: [], tutorial: [], help: ['biomes'], hud: ['biome banner'], ui: ['CampaignScreen'],
    collection: 'biomes category', achievements: [], localization: 'inline-en', docs: ['docs/BIOMES.md'],
  },
  {
    id: 'difficulty', name: 'Difficulty', purpose: 'Difficulty variants + the Universal Difficulty Director — ONE composition layer for every scaling policy (threat curves, doctrine warps, stage folds, mode economy).',
    files: ['src/core/difficulty.ts', 'src/core/difficultyDirector.ts'],
    dependsOn: ['content-infra'], powerScore: null, save: [], tutorial: [], help: [], hud: [], ui: ['CampaignScreen', 'InfiniteScreen', 'PlayScreen'],
    collection: null, achievements: [], localization: 'inline-en', docs: ['docs/DIFFICULTY.md', 'docs/DIFFICULTY_DIRECTOR.md'],
  },
  {
    id: 'rendering', name: 'Rendering & VFX', purpose: 'Canvas2D battlefield, tower visual evolution, particles/vfx, theme.',
    files: ['src/render/*'],
    dependsOn: ['engine'], powerScore: null, save: [], tutorial: [], help: [], hud: ['the battlefield itself'], ui: [],
    collection: null, achievements: [], localization: 'none', docs: ['docs/RENDER-PIPELINE.md', 'docs/TOWER-VISUAL-EVOLUTION.md', 'docs/GAME-FEEL.md'],
  },
  {
    id: 'audio', name: 'Audio', purpose: 'Synthesized SFX/music bus — cues, heartbeat tempo, reward stingers.',
    files: ['src/audio/*'],
    dependsOn: [], powerScore: null, save: [], tutorial: [], help: [], hud: ['(audible)'], ui: [], collection: null, achievements: [],
    localization: 'none', docs: ['docs/GAME-FEEL.md'],
  },
  {
    id: 'devtools', name: 'Dev Tools & Debug', purpose: 'Debug flag/panel, dev seeding, developer reset UI.',
    files: ['src/debug/*', 'src/ui/DebugPanel.tsx', 'src/ui/DevTools.tsx'],
    dependsOn: ['meta-store'], powerScore: null, save: [], tutorial: [], help: [], hud: [], ui: ['DebugPanel', 'DevTools'],
    collection: null, achievements: [], localization: 'none', docs: ['docs/DEV-RESET.md'],
  },
  {
    id: 'ui-kit', name: 'Shared UI Component Kit', purpose: 'Reusable presentation components every screen composes (icons, bars, count-ups) — the component library.',
    files: ['src/ui/components/Icon.tsx', 'src/ui/components/ProgressBar.tsx', 'src/ui/components/useCountUp.ts', 'src/ui/components/usePressRepeat.ts', 'src/ui/components/AudioToggles.tsx'],
    dependsOn: [], powerScore: null, save: [], tutorial: [], help: [], hud: ['(embedded everywhere)'], ui: ['(embedded everywhere)'],
    collection: null, achievements: [], localization: 'inline-en', docs: ['docs/UI-STANDARDS.md', 'docs/STYLE-GUIDE.md', 'docs/UI-MOTION.md', 'docs/VISUAL_IDENTITY.md', 'docs/UI_STYLE_GUIDE.md', 'docs/DESIGN_LANGUAGE.md', 'docs/RESPONSIVE-DESIGN.md'],
  },
  {
    id: 'dev-registry', name: 'System Registry & Doc Tooling', purpose: 'THIS registry + the doc-sync/validation generators (dev-only).',
    files: ['src/dev/*'],
    dependsOn: [], powerScore: null, save: [], tutorial: [], help: [], hud: [], ui: [], collection: null, achievements: [],
    localization: 'none', docs: ['docs/DEPENDENCY_GRAPH.md', 'docs/ENGINEERING-AUDIT.md', 'docs/GAME_CONSTITUTION.md', 'docs/PROJECT_STATUS.md', 'docs/AI_HANDOFF.md'],
  },
];

export const SYSTEM_BY_ID = new Map(SYSTEMS.map((s) => [s.id, s] as const));

/** Systems that list `id` in dependsOn — the DERIVED consumer edge. */
export function consumersOf(id: string): SystemDef[] {
  return SYSTEMS.filter((s) => s.dependsOn.includes(id));
}

/** Tiny glob: '**' crosses '/'; '*' stays within a segment. Anchored full-match. */
export function globToRegExp(glob: string): RegExp {
  const re = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, ' ')
    .replace(/\*/g, '[^/]*')
    .replace(/ /g, '.*');
  return new RegExp(`^${re}$`);
}

/** All systems whose file globs claim `path` (repo-relative, forward slashes). */
export function systemsForFile(path: string): SystemDef[] {
  return SYSTEMS.filter((s) => s.files.some((g) => globToRegExp(g).test(path)));
}

/** The "what breaks if I change this?" view for one system. */
export function impactOf(id: string): {
  system: SystemDef; consumers: SystemDef[]; docsToUpdate: string[]; uiToReview: string[];
  helpToReview: string[]; tutorialToReview: string[]; saveFields: string[];
} {
  const system = SYSTEM_BY_ID.get(id);
  if (!system) throw new Error(`unknown system '${id}'`);
  const consumers = consumersOf(id);
  return {
    system,
    consumers,
    docsToUpdate: [...new Set([...system.docs, ...consumers.flatMap((c) => c.docs)])],
    uiToReview: [...new Set([...system.ui, ...system.hud])],
    helpToReview: system.help,
    tutorialToReview: system.tutorial,
    saveFields: system.save,
  };
}
