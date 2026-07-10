// DIL CURATED KNOWLEDGE (docs/DIL.md §knowledge) — the design relationships that live in NO code
// registry: what gates what, what pays what, what balances what, where the landmines are, and
// what future work plans to extend. THIS FILE IS THE DIL'S MEMORY — when a session discovers a
// relationship the graph doesn't know (a hidden coupling, a new pattern, a conflict), it adds ONE
// LINE here. Every endpoint is validated against the built graph by dil.test.ts, so knowledge can
// never rot into pointing at things that no longer exist.

import type { DilNode, EdgeKind } from './graph';

export interface KnowledgeEdge { from: string; kind: EdgeKind; to: string; note: string }

/** Cross-cutting concepts + currencies — the ideas systems share but no registry declares. */
export const CONCEPTS: DilNode[] = [
  { id: 'concept:power-score', kind: 'concept', name: 'Power Score', summary: 'ONE account-strength number folded from every permanent bucket + the in-run temporary bucket (core/power.ts).' },
  { id: 'concept:determinism', kind: 'concept', name: 'Determinism', summary: 'A run is a pure function of seed + inputs — the invariant behind replays, fair dailies and the golden test. The renderer NEVER writes into the sim.' },
  { id: 'concept:golden-test', kind: 'concept', name: 'Golden Test', summary: 'Six seeded runs pinned byte-for-byte (core/golden.test.ts) — the tripwire for any accidental sim change.' },
  { id: 'concept:progression-gates', kind: 'concept', name: 'Progression Gates', summary: 'Depth/stage/shard requirements that stage content unlocks (towers, heroes, cards, modes).' },
  { id: 'concept:replays', kind: 'concept', name: 'Replays', summary: 'Seed+inputs compressed to a shareable code; recomputed locally (net/replayShare.ts, Replay Theater).' },
  { id: 'concept:daily-seed', kind: 'concept', name: 'Daily Seed', summary: 'One deterministic run per UTC day, identical worldwide (core/daily.ts).' },
  { id: 'currency:biomass', kind: 'currency', name: 'Biomass', summary: 'THE run currency — dropped by kills, spent on towers/upgrades; dies with the run.' },
  { id: 'currency:genome-cores', kind: 'currency', name: 'Genome Cores (◆)', summary: 'The permanent meta currency — genome upgrades, rewards, achievement payouts.' },
  { id: 'currency:tower-shards', kind: 'currency', name: 'Tower Shards (✦)', summary: 'Per-tower permanent currency: unlocks locked towers, buys Star evolutions.' },
  { id: 'currency:hero-shards', kind: 'currency', name: 'Hero Shards', summary: 'Per-hero permanent currency for hero Stars and unlocks.' },
  { id: 'currency:gene-essence', kind: 'currency', name: 'Gene Essence', summary: 'Levels Gene Archive cards and assembles/levels Mulligan modifiers.' },
  { id: 'currency:materials', kind: 'currency', name: 'Materials (mutagen/scrap/catalyst)', summary: 'Equipment crafting + reforge inputs (Armory).' },
  { id: 'currency:stamina', kind: 'currency', name: 'Rush Stamina', summary: 'Attempt gate for Boss Rush — makes each gauntlet deliberate.' },
];

/** Which game surfaces each public site guide explains (guide slug → node ids). */
export const GUIDE_TOPICS: Record<string, string[]> = {
  beginner: ['system:onboarding', 'currency:biomass'],
  towers: ['system:towers'],
  heroes: ['system:heroes', 'system:equipment'],
  'gene-cards': ['system:gene-cards'],
  bosses: ['system:bosses'],
  'mega-bosses': ['system:mega-bosses'],
  'power-score': ['concept:power-score', 'system:power'],
  progression: ['system:meta-store', 'system:shards-economy'],
  campaign: ['system:campaign'],
  infinite: ['system:infinite'],
  'boss-rush': ['system:boss-rush', 'currency:stamina'],
  daily: ['system:daily', 'concept:daily-seed'],
  mulligans: ['system:mulligans'],
  collections: ['system:collection'],
  mastery: ['system:mastery'],
  prestige: ['system:prestige'],
};

/** The curated design edges. ADD A LINE when you learn something the graph should know. */
export const KNOWLEDGE_EDGES: KnowledgeEdge[] = [
  // ── Determinism: the load-bearing invariant and who leans on it ──
  { from: 'concept:replays', kind: 'dependsOn', to: 'concept:determinism', note: 'a replay IS a recomputation' },
  { from: 'concept:daily-seed', kind: 'dependsOn', to: 'concept:determinism', note: 'fair boards need identical runs' },
  { from: 'concept:golden-test', kind: 'tests', to: 'concept:determinism', note: 'six pinned seeds catch any sim drift' },
  { from: 'system:engine', kind: 'provides', to: 'concept:determinism', note: 'fixed-timestep sim, seeded rng, render/sim wall' },
  { from: 'system:rendering', kind: 'consumes', to: 'concept:determinism', note: 'render-only contract: reads snapshots, NEVER writes sim state' },
  { from: 'system:living-battlefield', kind: 'consumes', to: 'concept:determinism', note: 'terrain evolution is render-side; inert at stage 0' },
  { from: 'system:prediction', kind: 'dependsOn', to: 'concept:determinism', note: 'outcome prediction replays candidate futures' },
  { from: 'system:net-backend', kind: 'consumes', to: 'concept:replays', note: 'leaderboard verification recomputes submitted runs' },

  // ── Economy: who pays what (reward sources), who spends what ──
  { from: 'system:campaign', kind: 'rewards', to: 'currency:genome-cores', note: 'first-clear + stage rewards' },
  { from: 'system:campaign', kind: 'rewards', to: 'currency:tower-shards', note: 'stage rewards feed unlock gates' },
  { from: 'system:infinite', kind: 'rewards', to: 'currency:genome-cores', note: 'depth records + chest tiers' },
  { from: 'system:boss-rush', kind: 'rewards', to: 'currency:genome-cores', note: 'pays PER BOSS DEFEATED' },
  { from: 'system:boss-rush', kind: 'consumes', to: 'currency:stamina', note: 'attempt gating' },
  { from: 'system:daily', kind: 'rewards', to: 'currency:genome-cores', note: 'completion reward independent of rank' },
  { from: 'system:expeditions', kind: 'rewards', to: 'currency:materials', note: 'mission payouts' },
  { from: 'system:loot', kind: 'rewards', to: 'currency:tower-shards', note: 'chest pipeline' },
  { from: 'system:loot', kind: 'rewards', to: 'currency:hero-shards', note: 'chest pipeline' },
  { from: 'system:achievements', kind: 'rewards', to: 'currency:genome-cores', note: 'auto-granted on unlock' },
  { from: 'system:towers', kind: 'consumes', to: 'currency:tower-shards', note: 'unlocks + Star purchases' },
  { from: 'system:heroes', kind: 'consumes', to: 'currency:hero-shards', note: 'unlocks + Star purchases' },
  { from: 'system:gene-cards', kind: 'consumes', to: 'currency:gene-essence', note: 'Archive leveling' },
  { from: 'system:mulligans', kind: 'consumes', to: 'currency:gene-essence', note: 'modifier assembly + leveling' },
  { from: 'system:equipment', kind: 'consumes', to: 'currency:materials', note: 'crafting + reforge ops' },
  { from: 'system:meta-store', kind: 'consumes', to: 'currency:genome-cores', note: 'genome upgrade tree' },
  { from: 'system:splice-market', kind: 'modifies', to: 'currency:materials', note: 'exchange rates between currencies' },

  // ── Progression gating ──
  { from: 'system:campaign', kind: 'provides', to: 'concept:progression-gates', note: 'depth is the master unlock axis' },
  { from: 'concept:progression-gates', kind: 'gates', to: 'system:gene-cards', note: '44 cards unlock by progression' },
  { from: 'concept:progression-gates', kind: 'gates', to: 'system:towers', note: 'locked kinds carry unlockShards + stage requirements' },
  { from: 'concept:power-score', kind: 'displays', to: 'system:campaign', note: 'recommended-power readiness on stage cards' },
  { from: 'system:difficulty', kind: 'balances', to: 'system:campaign', note: 'the Universal Difficulty Director owns every scaling policy' },
  { from: 'system:difficulty', kind: 'balances', to: 'system:infinite', note: 'endless threat curves' },

  // ── Presentation couplings that are easy to miss ──
  { from: 'system:hub-shell', kind: 'consumes', to: 'system:campaign', note: 'buildHomeView generates the campaign frontier ONCE per save change — home widgets read ctx.view, never re-derive models' },
  { from: 'system:hub-shell', kind: 'references', to: 'system:collection', note: 'home surfaces show CollectionView.pct (discovery); mixing in rank-weighted .completion once put two contradictory percentages on one board' },
  { from: 'system:living-battlefield', kind: 'consumes', to: 'system:assimilation', note: 'terrain stage comes from tierAt(game.assimilation.index) — ONE source of truth with music/HUD mood' },
  { from: 'system:assimilation', kind: 'consumes', to: 'concept:power-score', note: 'live Power is the universal contribution profile' },
  { from: 'system:audio', kind: 'visualizes', to: 'system:assimilation', note: 'music intensity floor rides the index (sonifies the same state the terrain draws)' },
  { from: 'system:mulligans', kind: 'modifies', to: 'system:rendering', note: 'grafted organisms recolor host towers, projectiles and Living-Battlefield ground hues' },
  { from: 'system:equipment', kind: 'modifies', to: 'system:rendering', note: 'heroes render worn gear; gear color skins hero projectiles' },
  { from: 'system:onboarding', kind: 'triggers', to: 'system:audio', note: 'the opening cinematic scores itself via the cinema track + cin_* beat cues' },
  { from: 'system:cosmetics', kind: 'modifies', to: 'system:audio', note: 'Phenotype firing variants repitch tower fire cues' },
  { from: 'system:progression-gating', kind: 'gates', to: 'system:hub-shell', note: 'nav entries, wallet chips and home widgets reveal via the FEATURES registry (teasers = next two reveals)' },
  { from: 'system:progression-gating', kind: 'extends', to: 'system:onboarding', note: "screen-linked mechanics rows delegate unlock predicates to featureRevealed — What's New fires exactly when a wing reveals" },

  { from: 'system:mega-bosses', kind: 'gates', to: 'system:cutscenes', note: 'ENFORCED CONTENT CONTRACT: every MEGA_BOSS_DEFS id must ship a defeat cutscene — cutscenes.test.ts fails the build without one' },
  { from: 'system:prestige', kind: 'references', to: 'system:cutscenes', note: 'the Molt Chamber + ceremony reuse the cutscene molt tableau via drawCutsceneFrame — retheme it, never fork it' },
  { from: 'system:cutscenes', kind: 'provides', to: 'concept:progression-gates', note: 'memories unlock from milestones (stages, molt, depth) and first mega defeats; each grants a small capped passive' },

  // ── Potential conflicts (landmines discovered in development — check these before editing) ──
  { from: 'system:daily', kind: 'conflictsWith', to: 'system:mulligans', note: 'the Daily SUBSTITUTES seeded organisms via mulliganOverride — account organisms must not leak into a daily run' },
  { from: 'system:cosmetics', kind: 'conflictsWith', to: 'concept:golden-test', note: 'skins/visual tiers must stay render-only; any def stat touched for looks breaks the pinned seeds' },
  { from: 'system:website', kind: 'conflictsWith', to: 'system:meta-store', note: 'the game moved to /play/ — root share/checkout deep links rely on the home forwarder; never remove it while old links exist' },
  { from: 'system:accounts', kind: 'conflictsWith', to: 'system:meta-store', note: 'cloud sync merges the same save blob the local store owns — schema changes need BOTH migration paths' },

  // ── Future expansion (planned, not built — replaces re-deriving intent every session) ──
  { from: 'system:website', kind: 'plans', to: 'system:liveops', note: 'community spotlight + seasonal event pages once events ship' },
  { from: 'system:nemesis', kind: 'plans', to: 'system:bosses', note: 'nemesis organisms escalate the boss framework with per-player memory' },
  { from: 'system:prestige', kind: 'extends', to: 'system:meta-store', note: 'Ascendant nodes multiply the permanent buckets' },
  { from: 'system:living-battlefield', kind: 'plans', to: 'system:biomes', note: 'per-biome bespoke terrain flora beyond the BIOME_FLORA tint map' },
];
