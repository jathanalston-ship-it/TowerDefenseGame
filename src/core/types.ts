// Shared simulation types. `Def`s are static data (config.ts); the live objects
// below are runtime instances owned by the Game (game.ts). No React/DOM here.

import type { Vec2 } from './math';
import type { ActiveStatus } from './status';
import type { AbilityComponent } from './ability';
import type { TargetingProfile } from './targeting';

export type CombatClass = 'Kinetic' | 'Caustic' | 'Viral' | 'Neural' | 'Vital';
export type StatusType = 'Fracture' | 'Corrosion' | 'Infection' | 'Disruption';
export type TowerKind = 'needle' | 'mortar' | 'reactor' | 'parasite' | 'obelisk';
export type EnemyKind =
  // swarm
  | 'runner' | 'mite' | 'larva'
  // fast
  | 'rusher' | 'darter' | 'lasher'
  // heavy
  | 'brute' | 'tank' | 'golem' | 'colossus'
  // shielded
  | 'bulwark' | 'warden'
  // regenerating
  | 'knitter' | 'revenant'
  // burrowing
  | 'burrower' | 'molerat'
  // flying
  | 'flyer' | 'wisp' | 'gargoyle'
  // summoner
  | 'broodmother' | 'hivecaller'
  // support
  | 'mender' | 'cantor'
  // suicide
  | 'bomber' | 'popper'
  // artillery
  | 'siegeworm' | 'spitter'
  // elite / apex
  | 'apex' | 'dreadnought' | 'tyrant';
export type HeroKind = 'ravager' | 'shepherd' | 'overseer';

/** How a tower delivers its attack — drives the firing/projectile dispatch, so a
 * new tower that reuses a behavior is data-only (no sim code). 'support' = no fire,
 * 'field' = periodic in-range pulse (no projectile). */
export type TowerFiring = 'homing' | 'splash' | 'support' | 'infest' | 'field';
/** What a live projectile does on the field (a subset of TowerFiring that flies). */
export type ProjectileBehavior = 'homing' | 'splash' | 'parasite';

/** Run phase. A run is: prep -> wave -> draft -> prep ... -> won | lost. */
export type Phase = 'prep' | 'wave' | 'draft' | 'won' | 'lost';

export type CardRarity = 'common' | 'rare' | 'epic' | 'legendary';
/** Gene-card synergy category (CARDS.md §4). A first-class tag: today it drives UI
 * grouping; the framework keys future per-category weighting/synergy meta off it. */
export type CardCategory =
  | 'poison' | 'summons' | 'economy' | 'crit' | 'aoe' | 'control' | 'hero' | 'tower' | 'mutation';

/** What a Gene Card primarily AFFECTS — its subject, shown as a badge in the draft so a card's
 *  target reads at a glance (CARDS.md). DERIVED from the card's effects (cards.ts: `cardSubject`),
 *  so the badge can never drift from behaviour. A specific tower carries its `TowerKind` → the UI
 *  pulls that tower's color/name/icon from `TOWER_DEFS`, future-proof for new towers with no UI
 *  change. 'global' = army-wide; 'economy' = biomass; 'hive' = the Nucleus + its build structure. */
export type CardSubject =
  | { kind: 'tower'; tower: TowerKind }
  | { kind: 'hero' }
  | { kind: 'global' }
  | { kind: 'economy' }
  | { kind: 'hive' };

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  baseArmor: number;
  speed: number; // px/sec at full speed
  bounty: number; // biomass on death
  damage: number; // integrity damage PER ATTACK while sieging the Hive Core (docs/HIVE-SIEGE.md)
  // status
  fracture: number; // stacks
  corrosion: number; // remaining seconds of corrosion
  infection: number; // Viral infection stacks — ramping armor-ignoring DoT; spreads on death
  disrupt: number; // remaining seconds of Neural Disruption (slow + vulnerability)
  shredFlash: number; // seconds of reaction flash remaining (visual)
  hitFlash: number; // seconds of white hit-flash remaining (visual)
  dmgAccum: number; // damage banked toward the next aggregated damage number (visual)
  dmgTimer: number; // throttle until the banked damage may pop as a float (visual)
  alive: boolean;
  // ── Hive Siege combat (docs/HIVE-SIEGE.md): enemies ATTACK the Hive Core instead of
  //    despawning at a finish line. All plain fields (hot path — no optional checks).
  sieging: boolean; // reached the Hive: locked onto the attack ring, running the attack loop
  ring: number; // which crust ring it fights from (0 = contact; assigned on arrival)
  attackCd: number; // seconds until the next attack may START (recovery + cadence)
  windup: number; // <0 idle; ≥0 = attack in progress, damage lands when it reaches 0
  attackInterval: number; // resolved cadence (def.attack, or the boss chassis's) — spawn-time constant
  attackWindup: number; // resolved windup/fuse — spawn-time constant
  lastHitKind: TowerKind | null; // tower kind of the last damaging hit (mastery: kill credit)
  boss: BossRuntime | null; // present only for framework bosses (null for normal enemies)
  elite: boolean; // director-promoted elite (buffed) — drives elite-priority targeting
  // Universal status-effect container (status.ts). Optional/lazy — the four legacy
  // statuses keep their fast fields above; NEW effects (burn, slow, stun, …) live here
  // and run through the generic engine. Undefined on the historical path (golden-safe).
  statuses?: ActiveStatus[];
  // ── Role-trait runtime (the ~30-enemy roster). Optional/lazy: undefined on the historical
  //    seven enemies, so every gated hook is a no-op there and the golden run is byte-identical.
  shield?: number; // remaining front-shield HP absorbed before the body (Shielded / Support)
  shieldFlash?: number; // seconds of shield-SHATTER flash remaining (visual; set when it breaks)
  summonCd?: number; // seconds until the next add spawns (Summoner)
  siegeCd?: number; // seconds until the next bombardment volley (Artillery)
}

/** An ARTILLERY shell in flight (Siege Maw / Acid Spitter bombardment — docs/ENEMIES.md
 *  §artillery). Sim-real: damage lands ON IMPACT, so the player sees the threat coming.
 *  The array is empty on the golden path (no historical enemy sets `siege`). */
export interface EnemyShell {
  x: number; // launch point (the renderer arcs from here)
  y: number;
  targetX: number; // impact point (the Nucleus)
  targetY: number;
  t: number; // flight progress 0..1
  duration: number; // total flight seconds
  damage: number; // integrity damage on impact
  color: string; // the firing enemy's hue (shell + trail tint)
}

/** Live state a framework boss carries on top of its enemy body (see boss.ts). */
export interface BossRuntime {
  defId: string;
  name: string;
  phase: number; // current phase index
  phases: number; // total phase count
  moduleCd: number[]; // per-module cooldown remaining (indexed like BossDef.modules)
  shielded: number; // seconds of invulnerability remaining (0 = vulnerable)
  enrage: number; // enrage stacks
  channel: number; // seconds left on a Nucleus channel (0 = none)
  charge: number; // seconds left on a telegraphed dash (0 = not charging)
  carapace: number; // bonus armor from an active carapace window (0 = none; cracked by Fracture → Shred)
  carapaceT: number; // seconds left on the carapace window (0 ⇒ carapace resets to 0)
  splitsLeft: number; // splitter: generations this lineage may still split into on death (0 = terminal)
  telegraph: string | null; // current telegraphed action (drives the banner)
}

/** A transient banner shown when a tower buys a branch tier (the "mutation" celebration). `id`
 * is a monotonic counter so the view can re-key the element and restart its animation even when
 * the same tier name repeats. `branchId` lets the view tint it with the branch's signature color. */
export interface MutationBanner {
  id: number;
  title: string; // the tier's name ("Twin Spinnerets")
  sub: string; // branch + tier ("Hivemind Swarm · Tier 2")
  branchId: string;
  color: string; // fallback accent (the tower's class color)
}

export interface BossBannerSnapshot {
  name: string;
  hpPct: number;
  phase: number;
  phases: number;
  telegraph: string | null;
}

export interface Tower {
  id: number;
  kind: TowerKind;
  x: number;
  y: number;
  slot: number; // tower-slot index it occupies
  cooldown: number; // seconds until next action
  overcharged: boolean; // buffed by an adjacent reactor this tick
  bornAt: number; // sim-time placed (drives the grow-in animation)
  disabledUntil: number; // sim-time a boss suppressor re-enables it (0 = active)
  // ── Per-instance branch upgrade (TOWER-BRANCHES.md). Run-temporary (never persisted);
  //    `branchId` locks on the Tier-1 purchase, `tier` climbs 1..5. 0/null ⇒ unbranched ⇒
  //    identical to a branch-less run (golden-safe). `pulseCd` paces a support tower's
  //    branch abilities (Reactor); `branchKit` caches the resolved kit (recomputed on buy). ──
  branchId: string | null;
  tier: number;
  /** STRAIN level 1..5 (docs/STRAIN.md) — the in-run evolution layer. Run-temporary like the
   *  branch; 1 = unmutated baseline (empty kit, zero rng ⇒ golden-safe by construction). */
  strain: number;
  pulseCd: number; // support-tower branch-ability cadence (0 for projectile towers)
  mutatedAt: number; // sim-time of the last tier purchase (drives the grow-in + mutation flash); -∞-ish when unbranched
  movedAt: number; // sim-time of the last RELOCATION (drives the landing-impact FX); -∞-ish when never moved (docs/TOWER-MANAGEMENT.md §3)
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  speed: number;
  targetId: number; // homing target id (-1 = positional, e.g. splash)
  damage: number;
  behavior: ProjectileBehavior;
  splash: number; // splash radius (0 = single target)
  alive: boolean;
  sourceKind: TowerKind | null; // tower kind that fired it (mastery: damage credit)
  // ── Projectile mutators (mutators.ts). Absent ⇒ no pierce ⇒ dies on first hit (the
  //    historical behavior, golden-safe). Set by a tower's star kit at spawn. ──
  pierce?: number; // extra enemies it passes through before dying (0/undefined = none)
  hitIds?: number[]; // enemies already struck (pierce: avoids re-hitting the same body)
  // Cosmetic skin id (= the firing tower's branchId) so the renderer can draw a branch-specific
  // shot (barbed swarm needle, rail lance, acid glob…). Undefined ⇒ the base look (golden-safe).
  skin?: string;
  skinTier?: number; // the firing tower's branch tier (1..5) — drives projectile evolution (size/detail)
  // Graceful fade-out OPACITY (1 → 0) once the projectile loses its target: it coasts out and
  // the renderer fades it instead of popping it instantly. Undefined ⇒ fully opaque / live
  // (the historical behavior, golden-safe — fading shots never re-acquire or deal damage).
  fade?: number;
  /** STRAIN fragmentation payload (docs/STRAIN.md) — splash shells split on impact. */
  fragment?: { count: number; damageFrac: number; radius: number };
}

export interface Pool {
  id: number;
  x: number;
  y: number;
  radius: number;
  dps: number;
  remaining: number; // seconds
  sourceKind: TowerKind | null; // tower kind that spawned it (mastery: damage credit)
}

/** A hero's current action/movement state — observational (drives the selection panel + future
 *  ability targeting). Never feeds back into the sim, so a fresh/golden run is byte-identical. */
export type HeroMoveState = 'idle' | 'moving' | 'attacking' | 'retreating' | 'downed';

export interface Hero {
  kind: HeroKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  down: boolean;
  respawn: number; // seconds until respawn when down
  rally: Vec2;
  attackCd: number;
  abilityCd: number;
  pulseCd: number; // role pulse timer (Shepherd vital pulse / Overseer disrupt field)
  // Absorb-shield (Shepherd's Bloom; future support gear). `shield` = remaining absorb
  // pool, soaked before HP; `shieldTime` = seconds until it lapses. 0/0 ⇒ no shield, so
  // the Ravager and a fresh run are byte-identical (golden-safe).
  shield: number;
  shieldTime: number;
  // Per-hero identity SCALING state (was singular on the Game; now per-hero for multi-slot rosters,
  // HEROES.md). Ravager only; 0/0 for every other hero + a fresh run ⇒ byte-identical golden run.
  killchain: number; // elites this hero has slain this run (Apex Predator / Killchain)
  rushUntil: number; // sim-time its Bloodthirst speed surge lasts until
  // Observational AI state, refreshed each tick — read by the selection panel + future abilities,
  // never by sim math (so it stays golden-safe): the current target + what the hero is doing.
  targetId: number; // current target's Enemy.id, or -1 when none
  moveState: HeroMoveState;
}

/** A summoned friendly unit (the `summon` ability primitive). A temporary attacker that
 * seeks and strikes the nearest enemy; enemies in contact halt and chew through it, so it
 * also body-blocks the lane until its HP or lifetime runs out. Runtime-only (never persisted)
 * and absent on the golden path — no content summons there — so it's byte-identical. */
export interface Minion {
  id: number;
  kind: string; // MINION_DEFS key (the unit type)
  x: number;
  y: number;
  hp: number; // remaining health — enemies in contact damage it; 0 ⇒ destroyed
  maxHp: number;
  hitFlash: number; // seconds of white "being chewed" flash remaining (visual)
  damage: number; // per attack
  attackCd: number; // seconds until the next attack
  attackInterval: number;
  range: number; // seek radius — finds the nearest enemy within it
  speed: number; // px/sec
  life: number; // seconds remaining before it expires
  maxLife: number; // initial life (drives the render fade-out)
  radius: number; // body radius (render + attack reach)
  color: string;
  alive: boolean;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number; // seconds remaining
  /** Presentation class — 'crit' floats render bigger with a pop + ring (renderer-only). */
  kind?: 'crit';
}

/** Cosmetic particle (pooled, capped). Never affects gameplay determinism. */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

/** Permanent (meta) multipliers folded into a run at start — the "permanent bucket". */
export interface MetaModifiers {
  towerDamageMult: number;
  biomassMult: number;
  heroDamageMult: number;
  integrityBonus: number;
  bonusSlots: number; // permanently-unlocked tower slots beyond SLOTS.initialUnlocked (flat, 0 = none)
}

/** Per-tower-kind permanent multipliers (stars + mastery), applied at build time.
 * Identity (all 1) for a fresh save, so the base game is unchanged. */
export interface TowerMods {
  damageMult: number;
  fireRateMult: number;
  // ── Star-evolution kit (stars.ts). All optional; absent ⇒ base behavior, so a fresh
  //    account (no stars) is byte-identical. The sim reads these in towerSystem. ──
  targeting?: TargetingProfile; // overrides the tower's default target pick
  extraProjectiles?: number; // additional simultaneous targets for the base attack
  splashMult?: number; // multiplies projectile splash radius
  // Identity-range upgrades (docs/RANGE.md §8) — NEVER a generic "+range%". Each is a
  // tower-specific reach axis: engagement range (needle marksman) / pulse radius (obelisk
  // control field), and infection-spread reach (parasite). Absent ⇒ base, golden-safe.
  rangeMult?: number; // scales the tower's targeting range + field/aura radius (engagement / pulse)
  infectionSpreadMult?: number; // parasite-only: scales the Infection death-spread radius
  projectileMutators?: string[]; // mutator ids applied to each spawned projectile (pierce …)
  extraAbilities?: AbilityComponent[]; // granted attacks/auras/chains run each cast
  reactorBiomassMult?: number; // reactor-only: scales its biomass generation (support evolution)
  reactorOverchargeBonus?: number; // reactor-only: extra overcharge to adjacent towers
  cosmetics?: string[]; // visual mutation ids (renderer)
}
export type TowerProgress = Record<TowerKind, TowerMods>;

/** Per-tower-kind usage signals a run accrues for mastery (pure observation — never
 * feeds back into the sim; banked into permanent XP at run end). */
export interface MasteryCount {
  kills: number;
  damage: number;
  activeTime: number; // tower-seconds deployed
}
export type MasteryCounts = Record<TowerKind, MasteryCount>;
export type HeroMasteryCounts = Record<HeroKind, MasteryCount>;

/** Per-hero permanent multipliers (stars + mastery + equipment), applied at run
 * start. Identity (all 1) for a fresh save, so the base hero is unchanged. This is
 * the fold point the EQUIPMENT.md item system plugs into (see meta.heroProgress). */
export interface HeroMods {
  damageMult: number;
  cooldownMult: number;
}
export type HeroProgress = Record<HeroKind, HeroMods>;

/** Raw per-run statistics observed by the sim (presentation/meta only — never feeds
 * combat, so it can't change a fixed-seed outcome). Read out once at run end and
 * folded into LifetimeStats by `state/stats.ts`. */
export interface RunStats {
  kills: number;
  wave: number;
  won: boolean;
  biomassEarned: number; // total biomass income this run
  damageDealt: number; // total damage dealt (towers + hero + DoT)
  killsByEnemy: Record<EnemyKind, number>;
  towerBuilds: Record<TowerKind, number>; // towers grown this run, per kind
  cardIds: string[]; // gene cards drafted this run (ids; may repeat)
  heroId: string; // hero fielded this run
}

/** Persistent lifetime statistics (in SaveData). The accumulation reducer in
 * `state/stats.ts` is the single place that grows when a new stat is added. */
export interface LifetimeStats {
  lifetimeKills: number;
  highestWave: number;
  totalBiomass: number;
  totalDamage: number;
  runsCompleted: number; // won
  runsFailed: number; // lost
  cardsDrafted: number; // total gene cards drafted across all runs
  uniqueCards: string[]; // distinct card ids ever collected (the "collection")
  killsByEnemy: Record<EnemyKind, number>;
  towerUsage: Record<TowerKind, number>; // total builds per kind (drives "favorite tower")
  heroUsage: Record<string, number>; // runs fielded per hero id
  // ── Per-tower combat depth (schema v20) — the Mastery panel's lifetime ledger ──
  towerDamage: Record<TowerKind, number>; // lifetime damage dealt per kind
  towerBestWave: Record<TowerKind, number>; // deepest wave reached in a run that DEPLOYED the kind
  // ── Player Profile ledgers (schema v22, docs/PROFILE.md) — additive; 0/{} for old saves ──
  playtimeSec: number; // total sim-seconds across settled runs (RunResult.durationSec)
  longestRunSec: number; // the single longest settled run
  waveSum: number; // Σ final waves across settled runs → average wave = waveSum / totalRuns
  doctrineRuns: Record<string, number>; // runs settled per doctrine id ('none' excluded)
  cardDrafts: Record<string, number>; // lifetime drafts per gene-card id (argmax = most drafted)
}

/** One account milestone on the Profile timeline (schema v22, docs/PROFILE.md) — newest LAST. */
export interface TimelineEvent {
  at: number; // Date.now() at the moment the milestone landed
  icon: string; // single glyph for the rail
  label: string; // "Released Shepherd" / "MOLT III" / "Reached Stage 30"
}

/** Compact snapshot the React HUD reads (throttled). Never the live entity arrays. */
/** A purchasable next tier on a branch (TOWER-BRANCHES.md), for the Mutation panel. */
export interface BranchTierOffer {
  tier: number;
  name: string;
  desc: string;
  cost: number;
  affordable: boolean;
}
/** One branch path offered for a placed tower (both pre-lock; only the committed one after). */
export interface BranchOffer {
  branchId: string;
  name: string;
  theme: string;
  locked: boolean; // this instance is committed to this branch
  tier: number; // tiers owned on this branch (0 = none)
  next: BranchTierOffer | null; // next tier to buy, or null if maxed
}
/** The placed tower the player is inspecting — drives the Inspector's Mutation panel. */
export interface SelectedPlacedTower {
  id: number;
  kind: TowerKind;
  name: string;
  combatClass: CombatClass;
  tier: number; // current branch tier (0 = unbranched)
  strain: number; // STRAIN level 1..5 (docs/STRAIN.md) — the in-run evolution layer
  strainName: string | null; // current strain mutation's name (null at Strain I)
  branchName: string | null; // committed branch's display name (null = unbranched)
  branches: BranchOffer[];
  // ── Tower management (docs/TOWER-MANAGEMENT.md) ──
  sell: TowerSellQuote; // refund breakdown for the Sell confirm dialog
  canMove: boolean; // relocation allowed right now (Build Phase only)
  moving: boolean; // this tower is currently picked up for relocation
}

/** Refund breakdown for the Sell dialog (docs/TOWER-MANAGEMENT.md §2). All values are biomass. */
export interface TowerSellQuote {
  investment: number; // total spent: purchase + every branch tier bought
  towerRefund: number; // round(frac · purchase cost)
  branchRefund: number; // round(frac · branch-tier total)
  total: number; // towerRefund + branchRefund (what selling credits)
}

/** One buff/debuff chip on the hero selection panel — extensible: a new hero status is one entry. */
export interface HeroStatusChip { id: string; label: string; kind: 'buff' | 'debuff'; detail?: string }
/** One cooldown gauge on the selection panel (remaining / total seconds; 0 total ⇒ ready/none). */
export interface HeroCooldownView { id: string; label: string; remaining: number; total: number }
/** The selected hero's LIVE combat state for the (non-modal) selection panel — null when nothing is
 *  selected. Equipment is read separately from the meta loadout (locked at run start). This is the
 *  read-model future hero abilities also key off (the selection is authoritative in the sim). */
export interface SelectedHeroView {
  kind: HeroKind;
  name: string;
  combatClass: string;
  // Live effective combat stats — fold gear + stars + mastery + biome. damage/attackSpeed are 0
  // for a non-attacker (support/controller). moveSpeed is the steady rate (excludes the transient
  // Bloodthirst surge, which shows as its own buff chip).
  damage: number;
  attackSpeed: number; // attacks per second
  moveSpeed: number; // px per second
  hp: number;
  maxHp: number;
  shield: number;
  down: boolean;
  respawn: number; // seconds until respawn while down
  state: HeroMoveState;
  target: string | null; // the current target enemy's display name, or null
  cooldowns: HeroCooldownView[];
  buffs: HeroStatusChip[];
  debuffs: HeroStatusChip[];
}

export interface HudSnapshot {
  phase: Phase;
  wave: number; // 1-based wave the player is on / just finished
  totalWaves: number;
  biomass: number;
  integrity: number;
  maxIntegrity: number;
  // Hive Siege pressure readouts (docs/HIVE-SIEGE.md §UI) — how hard the Core is being hit NOW.
  hiveAttackers: number; // enemies currently attacking the Hive (sieging + alive)
  hiveDps: number; // their summed damage/interval — the incoming-DPS estimate the HUD shows
  hiveRecentDamage: number; // integrity lost in the last ~3s (drives the ghost bar + under-attack state)
  kills: number;
  hero: {
    kind: HeroKind;
    down: boolean;
    respawn: number;
    hp: number;
    maxHp: number;
    shield: number; // active absorb-shield HP (0 = none); shown beside Health when > 0
    abilityReady: boolean;
    abilityCd: number;
    abilityCdMax: number;
  };
  enemiesAlive: number;
  emergency: boolean; // Emergency Defense Mode — an enemy is in the Final Defense Zone
  draft: CardOption[] | null;
  selectedTower: TowerKind | null;
  selectedPlaced: SelectedPlacedTower | null; // a placed tower being inspected (branch/Mutation UI)
  armedAbility: boolean;
  cards: CardOption[]; // gene cards drafted this run (build panel)
  buffs: string[]; // human-readable active run modifiers
  bossBanner: BossBannerSnapshot | null; // a live framework-boss banner (name/hp/phase)
  mutation: MutationBanner | null; // a transient "tier purchased" banner (the branch-upgrade moment)
  endless: boolean; // true in Endless mode (HUD shows Depth instead of Wave N/12)
  // Active biome (docs/BIOMES.md) — the HUD shows its name/accent + a hazard telegraph. In Stage
  // mode this is the NEUTRAL identity (the HUD suppresses the chip when there is no real biome).
  biome: { id: string; name: string; accent: string; modifier: string; hazardName: string; hazardActive: boolean };
  // Run Identity (docs/RUN-IDENTITY.md) — the current wave's telegraphed beat (Campaign/Endless), and
  // the run's one-line headline (its Anomaly, if any). Both null/empty in Stage mode.
  runEvent: { name: string; desc: string; kind: string } | null;
  runHeadline?: string;
  // The player-selected hero's live state (docs/HERO-SELECTION.md), or null. Non-modal — the sim
  // keeps running while it's shown. Future hero abilities read the same selection.
  selectedHero: SelectedHeroView | null;
  anticipation: string[]; // upcoming named beats (next boss / next chest tier) — pacing hook
  autoStart: boolean; // auto-start preference (next wave fires after a prep countdown)
  autoStartIn: number; // seconds left on the auto-start countdown (0 when off / not in prep / still armed-but-waiting)
  autoStartWaiting: boolean; // armed but INACTIVE — waiting for the first tower / manual wave before the countdown begins
  // Hero Evolution (docs/HERO-EVOLUTION.md) — per-category levels bought this run + total owned.
  // The UI renders costs/effects/affordability from the shared HERO_EVO_CATEGORIES + live biomass.
  heroEvo: { levels: Record<string, number>; totalOwned: number };
}

export interface CardOption {
  id: string;
  name: string;
  rarity: CardRarity;
  description: string;
  category: string;
  subject: CardSubject; // what the card affects (tower/hero/global/economy/hive) — drives the draft badge
}

/** A telegraph of an upcoming wave's composition (anticipation / informed prep). */
export interface WavePreviewEntry {
  kind: EnemyKind;
  count: number;
}
