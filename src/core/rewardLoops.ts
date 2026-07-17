// REWARD LOOP ARCHITECTURE (docs/REWARD-ARCHITECTURE.md) — the master map of every reward
// pathway in the game, classified into the five primary gameplay loops and wired so NO
// source is a dead end: every source's output feeds at least one loop besides its own.
// The philosophy this registry enforces is Reward Frequency > Reward Quantity — sessions
// should flow claim → open → upgrade → collect → play across loops, not sit inside one.
//
// This is a KNOWLEDGE registry over systems that already exist (nothing here grants
// anything): the rows power the loop-rotation recommendation layer (state/recommendations
// rotates the hub's "next action" across loops), the chain handoffs on claim surfaces,
// the docs' flow map, and the content-integrity suite — rewardLoopProblems() makes the
// no-dead-end law and the everywhere-reachable loop graph MACHINE-ENFORCED: a future
// reward source that feeds nothing fails the build until it declares its downstream.
//
// Pure data module: no DOM, no state imports, no side effects.

export const LOOPS = ['collection', 'progression', 'upgrade', 'reward', 'economy'] as const;
export type LoopId = (typeof LOOPS)[number];

export const LOOP_LABEL: Record<LoopId, string> = {
  collection: 'Collection',
  progression: 'Progression',
  upgrade: 'Upgrade',
  reward: 'Reward',
  economy: 'Economy',
};

/** How often a source naturally pays. The registry requires every loop to be fed at
 *  MULTIPLE timescales so there is always something close to ready. */
export type Cadence = 'perRun' | 'daily' | 'weekly' | 'seasonal' | 'passive' | 'onDemand' | 'milestone';

export interface RewardSourceDef {
  id: string;
  name: string;
  /** The loop the ACTION itself lives in (where the player is when they interact). */
  loop: LoopId;
  /** Loops the OUTPUT advances. THE LAW: must contain at least one loop ≠ `loop`. */
  feeds: LoopId[];
  cadence: Cadence;
  /** Hub screen where the action happens (NavKey vocabulary — validated in tests). */
  nav: string;
  /** What it pays, one line (docs + dashboards read this). */
  gives: string;
  /** Implementation anchor. */
  at: string;
}

/** THE map — one row per reward pathway that exists in the game today. */
export const REWARD_SOURCES: RewardSourceDef[] = [
  // ── Runs (the five modes) — the loop's re-entry point and its biggest faucet ──
  { id: 'run_campaign', name: 'Campaign clears', loop: 'reward', feeds: ['economy', 'progression', 'upgrade', 'collection'], cadence: 'perRun', nav: 'campaign',
    gives: 'Cores (first-clear + per-stage survey drip), loot points, mastery XP, quest/pass progress, unlock gates', at: 'src/state/meta.ts finishRun · core/config.ts CAMPAIGN_REWARDS' },
  { id: 'run_infinite', name: 'Infinite depth runs', loop: 'reward', feeds: ['economy', 'upgrade', 'progression'], cadence: 'perRun', nav: 'infinite',
    gives: 'The loot-point farm (MODE_REWARDS.loot ×1.0), endurance mastery, depth records', at: 'src/state/meta.ts finishRun · MODE_REWARDS' },
  { id: 'run_bossrush', name: 'Boss Rush gauntlet', loop: 'reward', feeds: ['reward', 'economy', 'collection'], cadence: 'perRun', nav: 'bossrush',
    gives: 'Cores per boss + Bio-Spores → Bio-Roulette spins → gene/cosmetic pulls', at: 'src/state/meta.ts finishRun · RUSH · state/bioRoulette.ts' },
  { id: 'run_daily', name: 'Daily Run clear', loop: 'reward', feeds: ['economy', 'progression'], cadence: 'daily', nav: 'daily',
    gives: 'Once-per-day clear bundle + streak ledger + leaderboard entry', at: 'src/state/meta.ts finishRun dailyKey lane' },
  { id: 'run_arena', name: 'Arena victories', loop: 'reward', feeds: ['progression', 'collection', 'economy'], cadence: 'perRun', nav: 'arena',
    gives: 'Rating, Arena Pass XP (wins only), season exclusives at L100', at: 'src/state/meta.ts settleArenaMatch · core/arena.ts' },

  // ── Reward-loop claim surfaces ──
  { id: 'vault_containers', name: 'Bio-Container opening', loop: 'reward', feeds: ['upgrade', 'collection', 'economy'], cadence: 'onDemand', nav: 'vault',
    gives: 'Tower/hero shards, materials, equipment roll, gene-card discoveries', at: 'src/state/meta.ts openContainers · core/loot.ts RARITIES' },
  { id: 'run_cache', name: 'Run Caches', loop: 'reward', feeds: ['upgrade', 'economy'], cadence: 'perRun', nav: 'vault',
    gives: 'The end-of-run banked cache (chestForWave) cracked in the Vault', at: 'core/config.ts CHESTS · meta.ts openContainers' },
  { id: 'bio_roulette', name: 'Bio-Roulette spins', loop: 'reward', feeds: ['collection', 'upgrade', 'economy'], cadence: 'onDemand', nav: 'bossrush',
    gives: 'Spore-funded pulls: gene cards, shards, cosmetic jackpots (pity-protected)', at: 'src/state/bioRoulette.ts' },
  { id: 'daily_login', name: 'Daily Bio-Cache (login streak)', loop: 'reward', feeds: ['economy', 'progression', 'collection'], cadence: 'daily', nav: 'home',
    gives: 'IV-budgeted daily bundle + Season-XP rider + streak milestones + devotion codex', at: 'src/core/loginStreak.ts · ui/BioCache.tsx' },
  { id: 'idle_harvest', name: 'Hive Production collection', loop: 'reward', feeds: ['economy', 'upgrade', 'collection'], cadence: 'passive', nav: 'harvest',
    gives: 'Banked offline yield: guaranteed Chitin lane + cores, essence, materials, rare drops', at: 'src/core/idleHarvest.ts · meta.collectIdleHarvest' },
  { id: 'expeditions', name: 'Hero Expedition debriefs', loop: 'reward', feeds: ['economy', 'upgrade', 'progression'], cadence: 'passive', nav: 'expeditions',
    gives: 'Timed away-mission spoils sized by risk/affinity/streak; scavenge roads haul Chitin', at: 'src/state/expeditions (meta) · docs/EXPEDITIONS.md' },
  { id: 'field_research', name: 'Field Research studies', loop: 'reward', feeds: ['economy', 'upgrade'], cadence: 'daily', nav: 'market',
    gives: 'Rewarded-study grants (daily-capped, power-scaled)', at: 'src/core/research.ts · ui/components/FieldResearch.tsx' },

  // ── Progression-loop tracks ──
  { id: 'battle_pass', name: 'Battle Pass levels', loop: 'progression', feeds: ['collection', 'economy', 'upgrade'], cadence: 'seasonal', nav: 'season',
    gives: 'Per-level claims: cosmetics, passives, containers, currency', at: 'src/core/battlePass.ts · meta claims' },
  { id: 'quests', name: 'Quest missions & finales', loop: 'progression', feeds: ['economy', 'reward', 'collection'], cadence: 'weekly', nav: 'quests',
    gives: 'Mission claims + questline chapter finales (cutscene premieres)', at: 'src/core/quests.ts · meta claims' },
  { id: 'directives', name: 'Weekly Directives', loop: 'progression', feeds: ['economy', 'reward'], cadence: 'weekly', nav: 'quests',
    gives: 'Weekly rotation objectives paying through the shared reward interpreter', at: 'docs/DIRECTIVES.md lane' },
  { id: 'contracts', name: 'Champion Contracts', loop: 'progression', feeds: ['collection', 'economy'], cadence: 'weekly', nav: 'quests',
    gives: 'Constraint-run completions → exclusive rewards', at: 'docs/CONTRACTS.md lane' },
  { id: 'mastery_tracks', name: 'Evolution Track claims', loop: 'progression', feeds: ['upgrade', 'economy', 'collection'], cadence: 'perRun', nav: 'evolution',
    gives: 'Per-tower/hero mastery milestones + prestige loops', at: 'src/core/masteryTrack.ts · meta claims' },
  { id: 'achievements', name: 'Achievements', loop: 'progression', feeds: ['collection', 'economy'], cadence: 'milestone', nav: 'profile',
    gives: 'Auto-granted on unlock; feed Genome Rank breadth + profile record', at: 'src/state/achievements.ts' },
  { id: 'genome_rank', name: 'Genome Rank promotions', loop: 'progression', feeds: ['economy', 'collection', 'reward'], cadence: 'milestone', nav: 'profile',
    gives: 'Promotion cinematics: cores, Ichor, premium containers, titles', at: 'src/state/meta.ts genome promotions' },
  { id: 'account_level', name: 'Account Level ups', loop: 'progression', feeds: ['economy', 'reward'], cadence: 'perRun', nav: 'profile',
    gives: 'Evergreen XP ladder level-up grants', at: 'src/state/meta.ts account XP fold' },
  { id: 'unlock_reveals', name: 'Feature unlock reveals', loop: 'progression', feeds: ['reward', 'upgrade', 'collection'], cadence: 'milestone', nav: 'campaign',
    gives: 'New wings opening as the Campaign proves the account (guaranteed by stage 9)', at: 'src/state/unlocks.ts · progression director' },
  { id: 'tutorial_milestones', name: 'Tutorial & guide milestones', loop: 'progression', feeds: ['economy'], cadence: 'milestone', nav: 'help',
    gives: 'One-time teaching grants (checkpoints, HUD tour, guided unlocks)', at: 'meta.grantTutorialMilestone' },

  // ── Upgrade-loop spend surfaces (spends that CREATE readiness elsewhere) ──
  { id: 'tower_stars', name: 'Tower Lab stars & strains', loop: 'upgrade', feeds: ['collection', 'progression'], cadence: 'onDemand', nav: 'towers',
    gives: 'Shard spends → permanent tower power, collection ranks, Power Score', at: 'meta.buyStar · TowerLab' },
  { id: 'hero_stars', name: 'Hero Lab stars & primes', loop: 'upgrade', feeds: ['collection', 'progression'], cadence: 'onDemand', nav: 'heroes',
    gives: 'Apex Genome spends → hero power, prime ladders, slots', at: 'meta.buyHeroStar/buyHeroPrime · HeroLab' },
  { id: 'evolution_hq', name: 'Evolution HQ upgrades', loop: 'upgrade', feeds: ['progression'], cadence: 'onDemand', nav: 'evolution',
    gives: 'Core spends → the 1000-upgrade genome board, Power Score', at: 'meta.buyUpgrade · EvolutionHQ' },
  { id: 'gene_upgrades', name: 'Gene Archive upgrades', loop: 'upgrade', feeds: ['collection', 'progression'], cadence: 'onDemand', nav: 'genes',
    gives: 'Essence spends → permanent card levels, transcendence picks', at: 'meta.upgradeGene · GeneArchive' },
  { id: 'equipment_forge', name: 'Armory equips & reforges', loop: 'upgrade', feeds: ['collection', 'progression'], cadence: 'onDemand', nav: 'equipment',
    gives: 'Loadout power, set bonuses, gear codex progress', at: 'ui/EquipmentPanel · meta loadouts' },
  { id: 'mulligan_grafts', name: 'Mulligan grafts & reforges', loop: 'upgrade', feeds: ['collection', 'progression'], cadence: 'onDemand', nav: 'mulligans',
    gives: 'Organism slots (Mulligan Tissue spends), reforge wheels, dex ranks', at: 'meta mulligan APIs · TowerLab tab' },
  { id: 'hive_organs', name: 'Hive organ growth', loop: 'upgrade', feeds: ['reward', 'economy'], cadence: 'onDemand', nav: 'hive',
    gives: 'Chitin-priced organ tiers → production lanes + synergies → BIGGER idle yields', at: 'core/hiveProduction.ts · meta.buyIdleNode' },
  { id: 'adaptation_nodes', name: 'Adaptation Chamber picks', loop: 'upgrade', feeds: ['progression'], cadence: 'milestone', nav: 'adaptation',
    gives: 'Antigen points arrive at mastery/stage milestones → per-subject adaptive node picks', at: 'core/adaptation.ts · meta picks' },

  // ── Collection-loop surfaces ──
  { id: 'collections_ranks', name: 'Collection rank-ups', loop: 'collection', feeds: ['economy', 'reward'], cadence: 'milestone', nav: 'collection',
    gives: 'Codex depth → rank Ichor bleeds + completion run-effects', at: 'src/state/collections lane · meta collectionRunEffects' },
  { id: 'gene_discovery', name: 'Gene card discovery', loop: 'collection', feeds: ['upgrade', 'progression'], cadence: 'onDemand', nav: 'genes',
    gives: 'New strands discovered from containers → draft pool grows', at: 'core/geneDiscovery.ts · v46 genesDiscovered' },
  { id: 'wardrobe', name: 'Wardrobe & phenotypes', loop: 'collection', feeds: ['progression', 'economy'], cadence: 'milestone', nav: 'phenotypes',
    gives: 'Cosmetic unlocks, wardrobe milestones, collection passives', at: 'src/state/cosmetics lane' },
  { id: 'boss_trophies', name: 'Nemesis & boss trophies', loop: 'collection', feeds: ['progression', 'upgrade'], cadence: 'milestone', nav: 'collection',
    gives: 'First-kill codex entries, trophy run-effects, mega cutscene premieres', at: 'docs/NEMESIS.md · trophyRunEffects' },
  { id: 'gear_codex', name: 'Gear Codex completion', loop: 'collection', feeds: ['progression'], cadence: 'milestone', nav: 'gearcodex',
    gives: 'Equipment families discovered → codex ranks → Genome Rank breadth', at: 'ui/GearCodex lane' },

  // ── Economy-loop exchange surfaces ──
  { id: 'splice_market', name: 'Splice Market buys', loop: 'economy', feeds: ['upgrade', 'collection'], cadence: 'daily', nav: 'market',
    gives: 'Rotating stock: shards, materials, boosts bought with earned currency', at: 'ui/SpliceMarket lane' },
  { id: 'ichor_exchange', name: 'Ichor Exchange lots', loop: 'economy', feeds: ['upgrade', 'economy'], cadence: 'daily', nav: 'market',
    gives: 'Reserve-scaled 30-min barter lots (cores/essence/scrap)', at: 'docs/EXCHANGE.md lane' },
  { id: 'auction_house', name: 'Auction House trades', loop: 'economy', feeds: ['collection', 'upgrade', 'economy'], cadence: 'onDemand', nav: 'auction',
    gives: 'Player listings + authority baseline: genes/equipment/cosmetics for Ichor', at: 'core/auction.ts · functions/api/auction' },
  { id: 'premium_store', name: 'Premium Store & flash offers', loop: 'economy', feeds: ['reward', 'collection'], cadence: 'onDemand', nav: 'store',
    gives: 'Ichor bundles, passes, premium containers (verified purchases)', at: 'core/premium.ts · net/checkout.ts' },
  { id: 'infestation', name: 'Infestation territory passives', loop: 'economy', feeds: ['reward', 'progression'], cadence: 'passive', nav: 'campaign',
    gives: 'Sector conquest → persistent regional bonuses feeding every run', at: 'core/infestation lane · infestationRunEffects' },
];

export const SOURCE_BY_ID: Record<string, RewardSourceDef> = Object.fromEntries(REWARD_SOURCES.map((s) => [s.id, s]));

/** Sources whose ACTION lives in a loop. */
export function sourcesInLoop(loop: LoopId): RewardSourceDef[] {
  return REWARD_SOURCES.filter((s) => s.loop === loop);
}

/** The loop graph: which loops each loop's outputs advance (union over its sources). */
export function loopGraph(): Record<LoopId, LoopId[]> {
  const g = Object.fromEntries(LOOPS.map((l) => [l, new Set<LoopId>()])) as Record<LoopId, Set<LoopId>>;
  for (const s of REWARD_SOURCES) for (const f of s.feeds) if (f !== s.loop) g[s.loop].add(f);
  return Object.fromEntries(LOOPS.map((l) => [l, [...g[l]]])) as Record<LoopId, LoopId[]>;
}

/** The loop a hub screen belongs to (first registry row that claims the nav wins).
 *  Screens outside the map (settings/help/home) return null — they're chrome, not loops. */
export function loopOfNav(nav: string): LoopId | null {
  const hit = REWARD_SOURCES.find((s) => s.nav === nav);
  return hit ? hit.loop : null;
}

/** A demonstration chain: greedy walk that visits every loop once starting from `start`
 *  (the docs' "Boss Rush → Roulette → Genes → Rank → Upgrade → Campaign" figure, derived
 *  live so it can never drift from the registry). Returns null if the graph can't do it —
 *  which rewardLoopProblems() treats as a build failure. */
export function fullLoopChain(start: LoopId): LoopId[] | null {
  const g = loopGraph();
  const walk = (path: LoopId[]): LoopId[] | null => {
    if (path.length === LOOPS.length) return path;
    for (const next of g[path[path.length - 1]]) {
      if (path.includes(next)) continue;
      const done = walk([...path, next]);
      if (done) return done;
    }
    return null;
  };
  return walk([start]);
}

const TOKEN = /^[a-z0-9_]{1,32}$/;

/** Registry integrity (content-integrity suite) — the architecture's laws, machine-enforced. */
export function rewardLoopProblems(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const s of REWARD_SOURCES) {
    if (seen.has(s.id)) problems.push(`duplicate source: ${s.id}`);
    seen.add(s.id);
    if (!TOKEN.test(s.id)) problems.push(`bad source id token: ${s.id}`);
    if (!s.gives || !s.at) problems.push(`undocumented source: ${s.id}`);
    // THE NO-DEAD-END LAW: every source's output must advance a loop besides its own.
    if (!s.feeds.some((f) => f !== s.loop)) problems.push(`dead-end source (feeds only its own loop): ${s.id}`);
    for (const f of s.feeds) if (!LOOPS.includes(f)) problems.push(`unknown loop '${f}' on ${s.id}`);
  }
  for (const loop of LOOPS) {
    const inLoop = sourcesInLoop(loop);
    if (inLoop.length < 2) problems.push(`loop '${loop}' has fewer than 2 sources`);
    // Multi-timescale law: a loop must pay at ≥2 distinct cadences so something is
    // always close to ready (perRun alongside daily/passive/milestone…).
    if (new Set(inLoop.map((s) => s.cadence)).size < 2) problems.push(`loop '${loop}' pays at only one cadence`);
    // Cross-fed law: every loop is fed BY some other loop's source.
    const fedBy = REWARD_SOURCES.some((s) => s.loop !== loop && s.feeds.includes(loop));
    if (!fedBy) problems.push(`loop '${loop}' is never fed by another loop`);
    // The full-cycle law: from every loop, a chain can visit all five.
    if (!fullLoopChain(loop)) problems.push(`no full 5-loop chain starting from '${loop}'`);
  }
  return problems;
}
