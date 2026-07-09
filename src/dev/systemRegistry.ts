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
  /** Localization surfaces. The typed t() layer lives in src/i18n (docs/I18N.md); 'inline-en'
   *  marks systems whose strings have not fully migrated through it yet. */
  localization: 'inline-en' | 'none';
  /** Canonical docs (the ones that must move when this system moves). */
  docs: string[];
}

export const SYSTEMS: SystemDef[] = [
  {
    id: 'engine', name: 'Sim Engine', purpose: 'Deterministic fixed-timestep simulation — the Game, combat, statuses, targeting, spawning, run events.',
    files: ['src/core/game.ts', 'src/core/combat.ts', 'src/core/status.ts', 'src/core/targeting.ts', 'src/core/reactions.ts', 'src/core/spawndirector.ts', 'src/core/runEvents.ts', 'src/core/events.ts', 'src/core/map.ts', 'src/core/ability.ts', 'src/core/mutators.ts', 'src/core/modifiers.ts', 'src/core/simharness.ts', 'src/core/director.ts', 'src/core/sim.testutil.ts'],
    dependsOn: ['content-infra', 'towers', 'heroes', 'gene-cards', 'bosses', 'biomes', 'difficulty', 'assimilation'],
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
    hud: ['Hud (live run Power)'], ui: ['ProgressDashboard', 'CommandCenter (recommended power)'], collection: 'collection completion feeds a bucket', achievements: [],
    localization: 'inline-en', docs: ['docs/POWER-SCORE.md', 'docs/POWER-AUDIT.md'],
  },
  {
    id: 'campaign', name: 'Campaign', purpose: 'Procedural authored-feeling stages; depth is the master progression gate. Authored EVENTS (Elite Rush / Boss Gauntlet / Genome Cache / Mutation choice) punctuate the ladder via a data registry.',
    files: ['src/core/campaign.ts', 'src/core/campaignEvents.ts', 'src/core/hash.ts', 'src/ui/CampaignScreen.tsx'],
    dependsOn: ['engine', 'biomes', 'bosses', 'difficulty', 'power'], powerScore: 'recommended-power display; first-clear rewards move account Power indirectly', save: ['campaign'],
    tutorial: [], help: ['campaign'], hud: [], ui: ['CampaignScreen', 'CommandCenter'], collection: 'biome discovery', achievements: [],
    localization: 'inline-en', docs: ['docs/CAMPAIGN.md', 'docs/CAMPAIGN-EVENTS.md', 'docs/MODE-IDENTITY.md', 'docs/STAGES.md'],
  },
  {
    id: 'infinite', name: 'Infinite Mode', purpose: 'Endless AI-Director escalation; personal bests + richest loot meter.',
    files: ['src/ui/InfiniteScreen.tsx'],
    dependsOn: ['engine', 'loot', 'difficulty'], powerScore: null, save: ['bestWave'], tutorial: [], help: ['infinite'],
    hud: [], ui: ['InfiniteScreen', 'CommandCenter'], collection: 'chest tiers unlock by best wave', achievements: [],
    localization: 'inline-en', docs: ['docs/ENDLESS-SCALING.md', 'docs/MODE-IDENTITY.md'],
  },
  {
    id: 'boss-rush', name: 'Boss Rush', purpose: 'The gauntlet: wave N = N assembled bosses (staggered column + thinned escort); rewards pay per boss defeated; own records/prediction channel.',
    files: ['src/ui/BossRushScreen.tsx', 'src/state/bioRoulette.ts', 'src/ui/BioRoulette.tsx'],
    dependsOn: ['engine', 'bosses', 'loot', 'difficulty'], powerScore: null, save: ['rushBestWave', 'rushBestBoss', 'rushStamina'], tutorial: [], help: ['boss-rush', 'bio-roulette'],
    hud: [], ui: ['BossRushScreen', 'BioRoulette', 'CommandCenter'], collection: null, achievements: ['rush_first', 'rush_wave5', 'rush_wave10', 'rush_boss15', 'rush_bosses50', 'rush_bosses250', 'roulette_first', 'roulette_50'],
    localization: 'inline-en', docs: ['docs/BOSS-RUSH.md', 'docs/MODE-IDENTITY.md'],
  },
  {
    id: 'daily', name: 'Daily Run', purpose: 'The fourth pillar: one deterministic seed per UTC day ⇒ the SAME 20-wave run worldwide — rolled biome, seeded 3-boss roster, TWO gameplay modifiers, a 3-tower Conveyor pool.',
    files: ['src/core/daily.ts', 'src/core/dailyModifiers.ts', 'src/ui/DailyScreen.tsx'],
    dependsOn: ['engine', 'campaign', 'biomes', 'bosses', 'towers'], powerScore: 'recommended-power readiness on the day card', save: ['daily'], tutorial: [], help: [],
    hud: [], ui: ['CommandCenter'], collection: null, achievements: [],
    localization: 'inline-en', docs: ['docs/DAILY-RUN.md', 'docs/MODE-IDENTITY.md'],
  },
  {
    id: 'mulligans', name: 'Mulligan System', purpose: 'A permanent endgame pillar: each tower kind permanently owns ONE biomechanical Mulligan organism assembled from THREE genetic modifiers. Fully data-driven — a new modifier is one registry row; the organism\'s appearance, animation and projectile are PROCEDURALLY generated from the modifiers\' stat profile. Inactive until all three slots fill ⇒ golden-safe; folds through the existing TowerMods channels (no new sim branch).',
    files: ['src/core/mulligan.ts', 'src/render/mulliganOrganism.ts', 'src/state/mulliganLabModel.ts', 'src/ui/MulliganLab.tsx'],
    dependsOn: ['content-infra', 'towers', 'power', 'meta-store'], powerScore: 'a DEDICATED, separately-inspectable PowerParts.mulligans bucket (accountMulliganPower) — modifiers × rarity × level; exactly 1 until an organism is fully assembled', save: ['mulligans', 'mulliganDex'], tutorial: [], help: ['mulligans'],
    hud: [], ui: ['GameView (organism overlay + emitter shots + graft ambience)', 'MulliganLab', 'Inspector (organism block)', 'DailyScreen (assignment briefing)', 'Vault reveal (Overflow + discovery pulls)', 'PlayerProfile (dex + Overflow rows)'], collection: 'mulligans (Modifiers) — dex-driven codex: Discovered → Transcendent; +5% fire rate at completion', achievements: ['mulligan_grafted', 'mulligan_splicer', 'mulligan_transcendent', 'mulligan_dex', 'mulligan_perfected', 'mulligan_ascendant', 'mulligan_overlord'],
    localization: 'inline-en', docs: ['docs/MULLIGANS.md'],
  },
  {
    id: 'premium', name: 'Premium Store', purpose: 'Ethical monetization as pure data: Ichor bundles, permanent packs, one rotating daily pack, and windowed event offers on a registry; purchases accelerate but never replace gameplay (Power moves zero until invested; money never mints prestige or crosses campaign gates).',
    files: ['src/core/premium.ts', 'src/ui/PremiumStore.tsx'],
    dependsOn: ['content-infra', 'splice-market', 'daily', 'power'], powerScore: 'offerPowerPotential — the honest "up to +N when invested" estimate', save: ['premium'], tutorial: [], help: [],
    hud: [], ui: ['PremiumStore'], collection: null, achievements: [],
    localization: 'inline-en', docs: ['docs/PREMIUM-STORE.md', 'docs/PREMIUM-ECONOMY-REPORT.md'],
  },
  {
    id: 'field-research', name: 'Field Research (rewarded studies)', purpose: 'The OPTIONAL rewarded-ad lane, in-fiction: daily field studies pay small progression-scaled samples, one-run boosts, a sealed specimen, rush stamina, and a once-daily player-chosen emergency payout. Registry-driven (a holiday reward is one data row), provider-agnostic (VITE_ADS_PROVIDER; hidden when none), menus-only, never optimal (validator + tests cap ichor and boost magnitudes).',
    files: ['src/core/research.ts', 'src/ads/provider.ts', 'src/ads/googleAdapter.ts', 'src/ui/components/FieldResearch.tsx', 'src/net/events.ts'],
    dependsOn: ['premium', 'meta-store', 'splice-market', 'boss-rush', 'daily'], powerScore: null, save: ['research'], tutorial: [], help: ['field-research'],
    hud: [], ui: ['FieldResearchPanel', 'FieldResearchCard'], collection: null, achievements: [],
    localization: 'inline-en', docs: ['docs/RESEARCH.md', 'docs/WEBSITE.md'],
  },
  {
    id: 'net-backend', name: 'Backend lanes (net/)', purpose: 'The client side of the Cloudflare Pages Functions backend (docs/DEPLOYMENT.md): anonymous identity + sync codes, Stripe Checkout begin/claim with exactly-once local application, manual cloud save backup/restore, day-ticketed leaderboard submission, and the invisible Turnstile challenge. Everything fail-soft — offline play never depends on any of it.',
    files: ['src/net/identity.ts', 'src/net/checkout.ts', 'src/net/cloudSave.ts', 'src/net/autoSync.ts', 'src/net/leaderboard.ts', 'src/net/turnstile.ts', 'src/core/replay.ts', 'src/net/replayShare.ts', 'src/ui/SpectateView.tsx', 'src/ui/components/ShareReplay.tsx', 'src/ui/components/CloudBackup.tsx', 'src/ui/components/LeaderboardBlock.tsx'],
    dependsOn: ['premium', 'meta-store', 'daily', 'power'], powerScore: null, save: ['premium'], tutorial: [], help: [],
    hud: [], ui: ['CloudBackup', 'LeaderboardBlock', 'SpectateView', 'DailyScreen (Replay Theater)'], collection: null, achievements: [],
    localization: 'inline-en', docs: ['docs/DEPLOYMENT.md', 'docs/REPLAY-SHARE.md'],
  },
  {
    id: 'towers', name: 'Towers, Stars, Branches, Strain & Codex', purpose: 'Tower roster; permanent Star evolutions; in-run Branch specialization; the in-run STRAIN evolution layer (docs/STRAIN.md); the Codex.',
    files: ['src/core/stars.ts', 'src/core/branches.ts', 'src/core/branchTree.ts', 'src/core/strains.ts', 'src/core/conveyor.ts', 'src/ui/TowerLab.tsx', 'src/ui/TowerCodex.tsx', 'src/ui/TowerPortrait.tsx', 'src/ui/towerLabModel.ts', 'src/ui/towerCodexModel.ts', 'src/ui/StarCeremony.tsx', 'src/ui/components/BranchTree.tsx'],
    dependsOn: ['content-infra', 'shards-economy', 'campaign'], powerScore: 'stars/branches feed permanent + temporary buckets', save: ['towerStars', 'towerShards', 'towerMasteryXp', 'towerForks'],
    tutorial: ['combat'], help: ['towers', 'tower-stars', 'tower-branches'], hud: ['tower rail', 'Inspector'], ui: ['TowerLab', 'TowerCodex', 'StarCeremony'],
    collection: 'towers category (usage tiers)', achievements: [], localization: 'inline-en',
    docs: ['docs/TOWER-STARS.md', 'docs/TOWER-BRANCHES.md', 'docs/TOWER-LAB.md', 'docs/TOWER-CODEX.md', 'docs/TOWERS.md', 'docs/STRAIN.md'],
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
    id: 'equipment', name: 'Equipment & Armory', purpose: '~180 behavioral items, affixes, sets; per-hero Weapon/Armor/Relic loadouts. Bespoke PROCEDURAL card art (render/equipmentArt.ts) — a unique rarity-graded biomechanical emblem per item, derived from slot/subtype/set/rarity/affixes (no placeholder icons; scales to hundreds for free) — and, in-game, the equipped loadout draws as hero GEAR on the battlefield.',
    files: ['src/core/equipment.ts', 'src/render/equipmentArt.ts', 'src/ui/EquipmentPanel.tsx', 'src/ui/ItemDetails.tsx', 'src/ui/EquipmentCollection.tsx', 'src/ui/components/ItemArt.tsx', 'src/ui/components/HeroGearPreview.tsx'],
    dependsOn: ['content-infra', 'loot', 'power', 'heroes'], powerScore: 'equipped items score via itemPower into the gear bucket', save: ['equipment'],
    tutorial: [], help: ['equipment'], hud: [], ui: ['EquipmentPanel', 'ItemDetails', 'EquipmentCollection (Equip Codex gallery)', 'HeroGearPreview'], collection: 'equipment category (owned) + the Equip Codex art gallery', achievements: [],
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
    localization: 'inline-en', docs: ['docs/PROGRESSION-PHILOSOPHY.md', 'docs/PROGRESSION-REDESIGN.md', 'docs/SIMULATION-FRAMEWORK.md', 'docs/BALANCE_REPORT.md'],
  },
  {
    id: 'currencies', name: 'Currencies & Economy Framework', purpose: 'Currency identities (icon/color/tooltip/format) + the adaptive economy framework: one factor-traced income composition per currency, adaptive seams, health guards.',
    files: ['src/core/currencies.ts', 'src/core/economyDirector.ts', 'src/ui/components/CurrencyIcon.tsx'],
    dependsOn: ['content-infra'], powerScore: null, save: [], tutorial: [], help: ['gene-essence'], hud: ['top resource bar'], ui: ['CurrencyIcon (everywhere)'],
    collection: null, achievements: [], localization: 'inline-en', docs: ['docs/ECONOMY.md', 'docs/LEXICON.md', 'docs/ECONOMY_FORMULAS.md'],
  },
  {
    id: 'splice-market', name: 'Splice Market & Ichor', purpose: 'The refreshing store (deterministic 5-min stock windows; cores for small goods, Ichor for premium goods + Bio-Containers) and the Ichor premium currency: front-loaded faucets (achievements, collection ranks, campaign milestones, Infinite depth records, container bleeds) with an under-water gamble EV so lucky chains always die.',
    files: ['src/core/market.ts', 'src/state/spliceMarket.ts', 'src/ui/SpliceMarket.tsx'],
    dependsOn: ['currencies', 'loot'], powerScore: 'none by design (Ichor never feeds Power)', save: ['ichor', 'lifetimeIchor', 'market'],
    tutorial: [], help: ['splice-market'], hud: ['top resource bar (Ichor chip)'], ui: ['SpliceMarket', 'Hub nav (Collection group)'],
    collection: null, achievements: [], localization: 'inline-en', docs: ['docs/MARKET.md'],
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
    id: 'liveops', name: 'LiveOps calendar', purpose: 'Deterministic UTC event calendar (docs/LIVEOPS.md): weekend surge + rotating weekly mode spotlights fold ×1-baseline reward multipliers into finishRun; the hub strip shows what is live. Clock pinned under tests.',
    files: ['src/core/liveops.ts', 'src/ui/components/LiveEventsStrip.tsx'],
    dependsOn: ['meta-store', 'daily'], powerScore: null, save: [], tutorial: [], help: [], hud: [],
    ui: ['LiveEventsStrip'], collection: null, achievements: [],
    localization: 'inline-en', docs: ['docs/LIVEOPS.md'],
  },
  {
    id: 'i18n', name: 'Localization Core', purpose: 'Typed t()/locale layer (docs/I18N.md): the EN literal catalog defines MsgKey, ES/PT are Record<MsgKey, string> so a missing translation is a compile error; locale persists to localStorage and re-renders via useLocale. Chrome strings migrate through it; content registries stay English for now.',
    files: ['src/i18n/index.ts'],
    dependsOn: [], powerScore: null, save: [], tutorial: [], help: [], hud: [],
    ui: ['Hub (settings language picker)'], collection: null, achievements: [],
    localization: 'none', docs: ['docs/I18N.md'],
  },
  {
    id: 'contracts', name: 'Champion Contracts', purpose: 'Weekly authored constraint runs (docs/CONTRACTS.md): a deterministic UTC 3-contract board (same weekIndex as LiveOps), a data constraint vocabulary evaluated against run facts in finishRun, core payouts folded into the run reward, and Gilded-phenotype marquee exclusives.',
    files: ['src/core/contracts.ts', 'src/ui/components/ContractsCard.tsx'],
    dependsOn: ['meta-store', 'liveops', 'cosmetics'], powerScore: null, save: ['contracts'],
    tutorial: [], help: [], hud: [], ui: ['CommandCenter (contracts board)', 'Results (contracts category)'], collection: null, achievements: [],
    localization: 'inline-en', docs: ['docs/CONTRACTS.md'],
  },
  {
    id: 'infestation', name: 'Infestation Map', purpose: 'The persistent conquest meta (docs/INFESTATION.md): four regions x four sectors; every finished run feeds a target with SPILLOVER (overflow pours into the same region, then the emptiest anywhere), sectors climb named TIERS (Dormant->Foothold->Colony->Stronghold->Saturated), saturation halves decay, a fully-saturated region ENTRENCHES (bonus x1.25). Passives scale by LIVE fractions; neglect decays lazily from wall-clock timestamps (nothing ticks). Pin a sector, a region (feeds its emptiest), or spread. A LIVING canvas territory map (render/infestationMap.ts): organic region lobes + creeping cell fills + pinned pulse + feed reticle + entrenchment auras, with an a11y button overlay.',
    files: ['src/core/infestation.ts', 'src/render/infestationMap.ts', 'src/ui/components/InfestationBoard.tsx'],
    dependsOn: ['meta-store', 'hub-shell'], powerScore: null, save: ['infestation'],
    tutorial: [], help: [], hud: [], ui: ['CommandCenter (infestation board)'], collection: null, achievements: [],
    localization: 'inline-en', docs: ['docs/INFESTATION.md'],
  },
  {
    id: 'expeditions', name: 'Hero Expeditions', purpose: 'The benched-hero idle lane (docs/EXPEDITIONS.md): owned-but-unfielded heroes run real-time away-missions (absolute endsAt timestamps — offline-safe, testable now params) and return star-scaled bundles of cores/essence/materials. HeroLab panel with countdowns, claims and the send flow.',
    files: ['src/core/expeditions.ts'],
    dependsOn: ['heroes', 'meta-store'], powerScore: null, save: ['expeditions'],
    tutorial: [], help: [], hud: [], ui: ['HeroLab (Expeditions panel)'], collection: null, achievements: [],
    localization: 'inline-en', docs: ['docs/EXPEDITIONS.md'],
  },
  {
    id: 'nemesis', name: 'Nemesis & Trophies', purpose: 'The personal hunt (docs/NEMESIS.md): a boss standing at your defeat becomes the Nemesis — it returns buffed (+15%/slay hp, capped, via RunOptions ⇒ replay-deterministic) and branded; revenge pays scaled cores + an Abyssal phenotype. Boss trophies: one organ per chassis/mega, DERIVED ownership, ONE equipped tradeoff pair folded like gear.',
    files: ['src/core/trophies.ts'],
    dependsOn: ['engine', 'bosses', 'meta-store', 'cosmetics'], powerScore: null, save: ['nemesis', 'equippedTrophy'],
    tutorial: [], help: [], hud: ['NEMESIS brand (renderer)'], ui: ['PlayerProfile (Trophy Rack + hunt banner)'], collection: null, achievements: [],
    localization: 'inline-en', docs: ['docs/NEMESIS.md'],
  },
  {
    id: 'cosmetics', name: 'Phenotypes (Cosmetics)', purpose: 'Data-driven visual skins (docs/COSMETICS.md): six theme families × every tower/hero (generator — new kinds inherit automatically); save v26 owned/equipped; renderer re-expression (palette/aura/projectiles/beams) + firing-sfx variants; Phenotype Lab hub screen; Phenotypes collection codex with a hive-wide passive.',
    files: ['src/core/cosmetics.ts', 'src/ui/PhenotypeLab.tsx'],
    dependsOn: ['meta-store', 'collection', 'hub-shell'], powerScore: 'via the collection codex weight', save: ['cosmetics'],
    tutorial: [], help: [], hud: [], ui: ['PhenotypeLab'], collection: 'cosmetics category (Phenotypes codex)', achievements: [],
    localization: 'inline-en', docs: ['docs/COSMETICS.md'],
  },
  {
    id: 'profile', name: 'Player Profile', purpose: 'The account dashboard: banner + frames, registry-driven career stats, power breakdown, showcase, milestone timeline, next milestones, analytics.',
    files: ['src/state/profile.ts', 'src/ui/PlayerProfile.tsx', 'src/ui/components/CommanderName.tsx'],
    dependsOn: ['stats', 'power', 'achievements', 'collection', 'prestige', 'hub-shell'], powerScore: null,
    save: ['createdAt', 'profileName', 'profileFrame', 'timeline'], tutorial: [], help: [], hud: [],
    ui: ['PlayerProfile'], collection: 'per-category completion rendered', achievements: [],
    localization: 'inline-en', docs: ['docs/PROFILE.md'],
  },
  {
    id: 'onboarding', name: 'Tutorials, Help & Onboarding', purpose: 'Combat Tutorial over a live sim, HUD Tour, mechanics-registry Help wiki, What\'s New, loading tips.',
    files: ['src/ui/InitCutscene.tsx', 'src/render/introScenes.ts', 'src/core/tutorial.ts', 'src/state/tutorial.ts', 'src/state/mechanics.ts', 'src/ui/TutorialRunner.tsx', 'src/ui/tutorial/*', 'src/ui/HelpWiki.tsx', 'src/ui/WhatsNew.tsx', 'src/ui/HudTour.tsx', 'src/ui/tips.ts'],
    dependsOn: ['engine', 'meta-store'], powerScore: null, save: ['tutorial', 'help'],
    tutorial: ['combat'], help: [], hud: ['TutorialOverlay'], ui: ['HelpWiki', 'WhatsNew', 'HudTour', 'CommandCenter (tips)'], collection: null,
    achievements: [], localization: 'inline-en', docs: ['docs/TUTORIAL.md', 'docs/HELP.md', 'docs/TUTORIAL-AUDIT.md'],
  },
  {
    id: 'hub-shell', name: 'Hub Shell & Home', purpose: 'The nav shell + the Command Center home: registry-driven widgets, living World Status, mission control, feed/roadmap/army, dashboards.',
    files: ['src/ui/Hub.tsx', 'src/ui/CommandCenter.tsx', 'src/ui/DeployScreen.tsx', 'src/ui/homeModel.ts', 'src/ui/WorldStatus.tsx', 'src/ui/ProgressDashboard.tsx', 'src/ui/NextGoalBanner.tsx', 'src/state/nextGoal.ts', 'src/state/progressionLoop.ts', 'src/ui/hubProgress.ts', 'src/ui/homeBaseTiers.ts', 'src/ui/LabAtmosphere.tsx', 'src/ui/App.tsx', 'src/ui/ErrorBoundary.tsx', 'src/main.tsx', 'src/net/swRegister.ts', 'src/ui/components/UpdateToast.tsx', 'src/ui/components/Popup.tsx'],
    dependsOn: ['meta-store', 'notifications', 'prediction', 'power'], powerScore: null, save: [],
    tutorial: [], help: [], hud: [], ui: ['Hub', 'CommandCenter', 'ProgressDashboard'], collection: null, achievements: [],
    localization: 'inline-en', docs: ['docs/COMMAND-CENTER.md', 'docs/HOME-BASE.md', 'docs/ONE-MORE-RUN.md', 'docs/HUD.md', 'docs/PROGRESSION-LOOP.md'],
  },
  {
    id: 'run-ui', name: 'In-Run HUD & Results', purpose: 'The battlefield interface: HUD, toolbar, inspector, build panel, results + reward reveal.',
    files: ['src/ui/GameView.tsx', 'src/ui/Hud.tsx', 'src/ui/Toolbar.tsx', 'src/ui/BuildControls.tsx', 'src/ui/BuildPanel.tsx', 'src/ui/Inspector.tsx', 'src/ui/Results.tsx', 'src/ui/RewardReveal.tsx', 'src/ui/RewardPreview.tsx'],
    dependsOn: ['engine', 'meta-store', 'power', 'assimilation'], powerScore: 'renders live run Power', save: [],
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
    id: 'mega-bosses', name: 'Mega Bosses', purpose: 'Battlefield-scale RAID organisms: anchored ability rotation manipulating the field, modular weak points, encounter cadence across every mode, the Daily Mega variant, efficiency-scaled Ichor.',
    files: ['src/core/megaboss.ts', 'src/render/megaboss.ts'],
    dependsOn: ['engine', 'content-infra', 'bosses'], powerScore: 'megaBosses collection category weight', save: ['megaProgress'],
    tutorial: [], help: [], hud: ['mega raid bar', 'weak-point callouts', 'arrival card'], ui: ['DailyScreen (variant brief)'],
    collection: 'megaBosses category (Slain/Mastered/Dominated)', achievements: ['mega_first', 'mega_perfect', 'mega_speed', 'mega_all', 'mega_10', 'wp_first', 'wp_100', 'wp_all_kinds', 'interrupt_50', 'mega_attrition', 'mega_survivor'], localization: 'inline-en',
    docs: ['docs/MEGA-BOSS.md'],
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
    dependsOn: ['content-infra'], powerScore: null, save: [], tutorial: [], help: [], hud: [], ui: ['CampaignScreen', 'InfiniteScreen', 'CommandCenter'],
    collection: null, achievements: [], localization: 'inline-en', docs: ['docs/DIFFICULTY.md', 'docs/DIFFICULTY_DIRECTOR.md'],
  },
  {
    id: 'rendering', name: 'Rendering & VFX', purpose: 'Canvas2D battlefield, tower visual evolution, particles/vfx, theme, danger-camera state machine.',
    files: ['src/render/*', 'src/core/dangerCamera.ts'],
    dependsOn: ['engine'], powerScore: null, save: [], tutorial: [], help: [], hud: ['the battlefield itself'], ui: [],
    collection: null, achievements: [], localization: 'none', docs: ['docs/RENDER-PIPELINE.md', 'docs/TOWER-VISUAL-EVOLUTION.md', 'docs/GAME-FEEL.md', 'docs/CAMERA.md'],
  },
  {
    id: 'living-battlefield', name: 'Living Battlefield', purpose: 'A hidden per-run "biomass" (towers/strain/branches/stars/mastery/mulligans + heroes/gear + kills/boss/mega + wave + Power Score + biome) drives an evolution STAGE 0–5 that terraforms the arena beneath the entities: data-driven Environmental Influence Profiles per tower/mulligan/hero/gene (hash-default ⇒ new content needs no code), regional blooms from towers/nucleus/combat/mega, nucleus organ, biome adaptation, boss/mega scars, ambient life. Render-only + inert at Stage 0 ⇒ golden-safe.',
    files: ['src/render/livingBattlefield.ts'],
    dependsOn: ['rendering', 'engine', 'audio', 'assimilation'], powerScore: null, save: [], tutorial: [], help: [], hud: ['the battlefield itself'], ui: [],
    collection: null, achievements: [], localization: 'none', docs: ['docs/LIVING-BATTLEFIELD.md'],
  },
  {
    id: 'audio', name: 'Audio', purpose: 'Synthesized SFX/music bus — cues, heartbeat tempo, reward stingers.',
    files: ['src/audio/*'],
    dependsOn: [], powerScore: null, save: [], tutorial: [], help: [], hud: ['(audible)'], ui: [], collection: null, achievements: [],
    localization: 'none', docs: ['docs/GAME-FEEL.md'],
  },
  {
    id: 'assimilation', name: 'Assimilation Index',
    purpose: 'The hidden per-run MASTER STATE: one continuous 0..1 index folded from weighted contributions across every active system (the live run Power Score is the universal contributor, so nearly all present + future strength raises it for free), smoothed like the danger-camera, driving every dynamic presentation channel — music-intensity floor, camera heartbeat, screen veil, HUD glow — through ONE derived bundle. Six evolution tiers (Contained → Planetary Assimilation) blend continuously; future systems plug in via a data ContributionProfile with no gameplay-code change. Render-only ⇒ golden-safe.',
    files: ['src/core/assimilation.ts', 'src/render/assimilationFx.ts', 'src/ui/AssimilationDebug.tsx'],
    dependsOn: [], powerScore: 'CONSUMES the live run Power Score as its dominant contributor (never feeds Power)', save: [], tutorial: [], help: [],
    hud: ['screen veil + camera heartbeat (GameView)', 'canvas-frame glow'], ui: ['AssimilationDebug (DebugPanel section)'], collection: null, achievements: [],
    localization: 'none', docs: ['docs/ASSIMILATION.md'],
  },
  {
    id: 'devtools', name: 'Dev Tools & Debug', purpose: 'Debug flag/panel, dev seeding, developer reset UI.',
    files: ['src/debug/*', 'src/ui/DebugPanel.tsx', 'src/ui/DevTools.tsx'],
    dependsOn: ['meta-store', 'assimilation'], powerScore: null, save: [], tutorial: [], help: [], hud: [], ui: ['DebugPanel', 'DevTools'],
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
