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
  { from: 'system:doctrines', kind: 'rewards', to: 'currency:gene-essence', note: 'essencePerWave protocols (Corrupted Genome / Overmind) pay at finishRun' },
  { from: 'system:doctrines', kind: 'dependsOn', to: 'concept:progression-gates', note: 'unlockStage campaign gates + doctrineRuns grandfathering (save/derive.ts)' },
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
  { from: 'system:progression-gating', kind: 'gates', to: 'system:hub-shell', note: 'nav entries, wallet chips and home widgets reveal via the FEATURES registry (teasers = next two reveals)' },
  { from: 'system:progression-gating', kind: 'extends', to: 'system:onboarding', note: "screen-linked mechanics rows delegate unlock predicates to featureRevealed — What's New fires exactly when a wing reveals" },
  { from: 'system:bosses', kind: 'triggers', to: 'system:audio', note: 'bossPhase event → boss_phase mutation roar (GameView seam; the sim itself only pushes the splice crunch)' },
  { from: 'system:mega-bosses', kind: 'triggers', to: 'system:audio', note: 'the telegraph-resolve edge (banner snapshot-diff, stun-guarded so eye interrupts stay silent) fires mega_cast — the SAME edge drives the render-side CAST shock ring in megaboss.ts' },
  { from: 'system:account-level', kind: 'consumes', to: 'system:meta-store', note: 'every XP-paying persist wraps in foldAccountXp — a NEW XP source is one ACCOUNT_XP row + one wrap, never a parallel pipeline' },
  { from: 'system:account-level', kind: 'provides', to: 'system:loot', note: "every 5th level + milestones bank Bio-Containers as kind:'cache' — REUSE the cache branch, never add a PendingContainer kind for level rewards" },
  { from: 'system:account-level', kind: 'references', to: 'system:mastery', note: 'account titles share save.equippedTitle with mastery rewards — display surfaces MUST resolve via titleName() (profile.ts), not masteryRewardById alone' },
  { from: 'system:account-level', kind: 'conflictsWith', to: 'system:shards-economy', note: 'level-reward cores must stay a supplement — sim guard trips if they exceed 15% of lifetime cores (reward ∝ n^0.7 vs requirement ∝ n^1.25)' },
  { from: 'system:net-backend', kind: 'extends', to: 'system:account-level', note: 'leaderboard modes accountLevel/weeklyXp/monthlyXp: score = XP, wave = level; the SERVER derives period bucket keys (functions/lib/period.ts mirrors core weekKey/monthKey)' },
  { from: 'system:genome-rank', kind: 'consumes', to: 'system:account-level', note: 'account level is ONE weighted GENOME_SOURCES row — the rank measures breadth across every system, never one lane' },
  { from: 'system:genome-rank', kind: 'consumes', to: 'concept:power-score', note: 'power is the strength category source; if its live share exceeds 35% the sim dominance guard trips (retune exp/div in the table)' },
  { from: 'system:genome-rank', kind: 'references', to: 'system:mastery', note: 'grank_<n> titles share save.equippedTitle — always resolve display through titleName() (profile.ts), never per-registry lookups' },
  { from: 'system:genome-rank', kind: 'conflictsWith', to: 'concept:golden-test', note: 'promotion rewards are meta-only (cores/ichor/containers/titles) — NO gameplay passives may ride ranks, or goldens and pay-to-win both break' },
  { from: 'system:mega-bosses', kind: 'balances', to: 'system:towers', note: 'the ADAPT verb (Myriad) armors against the top-damage tower kind from a per-kind ledger at the raid-fire seams — single-kind stacking is punished by design; heroes bypass it' },
  { from: 'system:mulligans', kind: 'consumes', to: 'system:towers', note: "ADAPTATIONS compare modifier classes to TowerDef.combatClass — resolveMulligan needs the HOST class everywhere (a class-less call silently drops the set bonus); COMBAT_CLASSES (core/combatClass.ts) is the ONE display table" },
  { from: 'system:mulligans', kind: 'conflictsWith', to: 'concept:golden-test', note: 'adaptation bonuses fold ONLY through existing MulliganStats channels inside resolveMulligan — a new sim branch for a class bonus breaks the inactive⇒identity gate' },
  { from: 'system:security', kind: 'gates', to: 'system:meta-store', note: 'every economy-named meta mutator must carry a guard() or an allowlist reason (securityRegistry.test.ts name-shape scan); the persist() chokepoint gives ALL mutations flood control automatically' },
  { from: 'system:security', kind: 'consumes', to: 'concept:determinism', note: 'guards live OUTSIDE the sim: wall-clock rate limits on in-run verbs would corrupt replays/dailies/goldens — in-run spam is absorbed at the UI input boundary instead' },
  { from: 'system:security', kind: 'conflictsWith', to: 'concept:golden-test', note: 'the guard layer is window-gated INERT in Node — the deterministic suite + economy personas hammer meta methods by design; a jsdom test environment would silently activate it (keep tests in Node or setSecurityEnabled(false))' },
  { from: 'system:security', kind: 'modifies', to: 'system:meta-store', note: 'tabArbiter: the newest writing tab owns the save — persist() stops disk writes in stale tabs (storage-event takeover latch) and finishRun replays return the settle-once cached outcome; both inherited by all future mutations/run modes' },
  { from: 'system:directives', kind: 'consumes', to: 'concept:determinism', note: 'the weekly board rotates on the same UTC weekIndex as liveops/contracts (no server); progress banks from run FACTS at finishRun — the pinned test Monday keeps it gameplay-neutral (fresh save = 0 progress, meta-only rewards ⇒ golden-safe)' },
  { from: 'system:directives', kind: 'rewards', to: 'currency:genome-cores', note: 'milestone + capstone payouts (also Gene Essence + Bio-Containers) — claimed explicitly in the console, guarded by security directive.claim' },
  { from: 'system:liveops', kind: 'balances', to: 'concept:power-score', note: 'event reward lanes (cores/essence/materials/mega-ichor/loot) fatten meta INCOME, never gameplay strength — ×1 baseline off-window so the calendar can never warp a run' },
  { from: 'system:contracts', kind: 'consumes', to: 'system:towers', note: 'banClass/onlyClass verbs judge builds via TOWER_DEFS[k].combatClass; requireTower/requireHero rows must reference content EVERY account owns early or the row is dead for new players' },
  { from: 'system:contracts', kind: 'provides', to: 'system:genome-rank', note: 'lifetime completions (save.contracts.completed.length) are the contractsHonoured journey source — a pool expansion needs NO genome change' },
  { from: 'system:contracts', kind: 'consumes', to: 'system:cosmetics', note: 'marquee rows pay pt_gilded_* phenotypes under a pinned POOL INVARIANT: length % 3 == 0 and marquees EXACTLY at indices ≡ 0 mod 3 — one Gilded marquee per weekly window; off-stride marquees give some weeks two and others none' },
  { from: 'system:collection', kind: 'consumes', to: 'system:doctrines', note: "the doctrines codex tier IS 1 + doctrineRank over the stats ledgers ('none' never rows) — one ladder shared with the picker, so never author parallel codex thresholds; fresh save = 0 runs ⇒ tier 0 ⇒ golden-safe" },
  { from: 'system:achievements', kind: 'consumes', to: 'system:doctrines', note: 'doctrine_first/breadth/families/exemplar read the stats doctrine ledgers registry-checked — stale/unknown ledger ids never count as commitment' },
  { from: 'system:doctrines', kind: 'conflictsWith', to: 'system:daily', note: 'DELIBERATE: Daily runs doctrine-less (ONE worldwide seed — a doctrine choice would fragment the fair board) and Boss Rush too (boss-count pacing is its own contract); extending the run-config axis beyond Campaign/Infinite is a future design decision, not an integration gap' },

  { from: 'system:mega-bosses', kind: 'gates', to: 'system:cutscenes', note: 'ENFORCED CONTENT CONTRACT: every MEGA_BOSS_DEFS id must ship a defeat cutscene — cutscenes.test.ts fails the build without one' },
  { from: 'system:prestige', kind: 'references', to: 'system:cutscenes', note: 'the Molt Chamber + ceremony reuse the cutscene molt tableau via drawCutsceneFrame — retheme it, never fork it' },
  { from: 'system:cutscenes', kind: 'provides', to: 'concept:progression-gates', note: 'memories unlock from milestones (stages, molt, depth) and first mega defeats; each grants a small capped passive' },
  { from: 'system:cosmetics', kind: 'modifies', to: 'system:audio', note: 'Phenotype firing variants repitch tower fire cues; Wardrobe packs re-voice whole cue FAMILIES (tower/enemy/notif/hero/wave) + re-voice menu/combat music (root/tempo/brightness) — per-unit variants always win over the global pack' },
  { from: 'system:cosmetics', kind: 'modifies', to: 'system:rendering', note: 'the Wardrobe render kit (render/wardrobeFx.ts) re-dresses nucleus/battlefield/trails/tower FX/placement and PRECOMPUTES enemy/boss/mega palettes — module state set by ui/wardrobeDressing.ts, never per-frame work' },
  { from: 'system:battle-pass', kind: 'consumes', to: 'system:cosmetics', note: 'reward tables DERIVE cosmetic placement from wardrobe battlepass sources — battlePass.test.ts fails if an item slot and the table disagree' },
  { from: 'system:battle-pass', kind: 'consumes', to: 'system:premium', note: "the store 'bp_premium' season SKU and the 250-Ichor door set the SAME per-season flag; offerValueIchor hardcodes 250 (functions/ bundle stays lean) and battlePass.test.ts pins it against BP.premiumIchor" },
  { from: 'system:battle-pass', kind: 'conflictsWith', to: 'concept:golden-test', note: 'permanents/stacks fold at the META seams (effects + accountEconomyBonuses) only — a fresh save must fold NOTHING or the pinned seeds break' },
  { from: 'system:cosmetics', kind: 'conflictsWith', to: 'concept:power-score', note: 'wardrobe codices carry ZERO powerWeight — starter items are pre-owned, so any weight moves a fresh account off POWER_BASE (the 1002 bug)' },
  { from: 'system:quests', kind: 'consumes', to: 'system:battle-pass', note: 'quest rewards SPEAK PassReward through the shared applyRewardList interpreter (never author stack/passive/cosmetic kinds — quests.test pins it); claims feed pass XP, pass level-ups credit passLevels missions via grantPassXp' },
  { from: 'system:quests', kind: 'gates', to: 'system:cutscenes', note: "every quest's finaleCutscene must exist with unlock {kind:'quest',questId} — resolved off save.quests.once ('cutscene:<questId>'), premiered from the hub via cutsceneBus; quests.test fails without the link" },
  { from: 'system:quests', kind: 'consumes', to: 'system:cosmetics', note: "every quest's finaleCosmetic must be a wardrobe item with source {kind:'quest',quest} (never auto-unlocks; sourceLabel's QUEST_NAMES map is pinned against quest names by quests.test)" },
  { from: 'system:quests', kind: 'references', to: 'system:contracts', note: 'contracts are the quest-adjacent weekly SKILL checks — same board (ContractsCard mounts in QuestBoard), same run-facts DNA (QuestRunFacts extends ContractRunFacts)' },
  { from: 'system:quests', kind: 'conflictsWith', to: 'concept:golden-test', note: 'weekly progress NEVER carries over (rollover mails earned rewards then resets); a fresh save has empty ledgers so the quests/missions codices read zero — any starter-time credit breaks POWER_BASE' },
  { from: 'system:onboarding', kind: 'conflictsWith', to: 'system:run-ui', note: 'PHONE DOCK CONTRACT (docs/TUTORIAL.md §phone): ≤700px the lesson callout DOCKS to the edge opposite its anchor and must never cover the step’s action (the step-3 slot bug); controls live top-right, the banner yields to the draft, and a missing spotlight target renders NO scrim' },

  // ── Potential conflicts (landmines discovered in development — check these before editing) ──
  { from: 'system:daily', kind: 'conflictsWith', to: 'system:mulligans', note: 'the Daily SUBSTITUTES seeded organisms via mulliganOverride — account organisms must not leak into a daily run' },
  { from: 'system:cosmetics', kind: 'conflictsWith', to: 'concept:golden-test', note: 'skins/visual tiers must stay render-only; any def stat touched for looks breaks the pinned seeds' },
  { from: 'system:website', kind: 'conflictsWith', to: 'system:meta-store', note: 'the game moved to /play/ — root share/checkout deep links rely on the home forwarder; never remove it while old links exist' },
  { from: 'system:accounts', kind: 'conflictsWith', to: 'system:meta-store', note: 'cloud sync merges the same save blob the local store owns — schema changes need BOTH migration paths' },

  // ── Future expansion (planned, not built — replaces re-deriving intent every session) ──
  { from: 'system:website', kind: 'plans', to: 'system:liveops', note: 'community spotlight + seasonal event pages once events ship' },
  { from: 'system:nemesis', kind: 'plans', to: 'system:bosses', note: 'nemesis organisms escalate the boss framework with per-player memory' },
  { from: 'system:nemesis', kind: 'modifies', to: 'system:engine', note: 'nemesisTraits(slain) rides RunOptions → spawnBoss applies hp/armor/damage/attack-speed deterministically (core/nemesis.ts)' },
  { from: 'system:nemesis', kind: 'consumes', to: 'system:mega-bosses', note: 'mega + vengeance trophy organs; mega kills derive mega-source trophy ownership' },
  { from: 'system:prestige', kind: 'extends', to: 'system:meta-store', note: 'Ascendant nodes multiply the permanent buckets' },
  { from: 'system:living-battlefield', kind: 'plans', to: 'system:biomes', note: 'per-biome bespoke terrain flora beyond the BIOME_FLORA tint map' },
];
