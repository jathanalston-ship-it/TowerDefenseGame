// The simulation: a deterministic, fixed-timestep tower-defense run. Plain TS —
// no React/DOM imports (ARCHITECTURE.md §2,§7). The Game owns all run (R-bucket)
// state; it evaporates when a new Game is constructed, which is why nothing here
// is ever persisted (PROGRESSION.md §1.1: the run is temporary).

import { Rng } from './rng';
import { dist, dist2, moveToward } from './math';
import { SpatialGrid } from './spatial';
import {
  CELL,
  DEFENSE_TOP_Y,
  HEIGHT,
  REACH_Y,
  WIDTH,
  flowDirAt,
  goalDistanceAt,
  inFinalDefenseZone,
  nucleusPoint,
  reachedBottom,
  slotAt,
  topSpawn,
  towerSlots,
} from './map';
import type { TowerSlot } from './map';
import {
  COMBAT,
  ECON,
  ENEMY_DEFS,
  ENEMY_KINDS,
  EVO,
  FX,
  HERO_DEFS,
  HERO_ORDER,
  MOVE,
  PARTICLE,
  PERF,
  SETTLE,
  SIM_DT,
  SLOTS,
  STATUS,
  STEER,
  TOWER_DEFS,
  TOWER_ORDER,
  TOWER_ABILITIES,
  HERO_PULSE,
  HERO_ULT,
  WAVES,
  WAVE_BOUNTY_GROWTH,
  AUTO_START_DELAY,
  AUTO_START_FIRST_DELAY,
  WAVE_HP_GROWTH,
  MINION_DEFS,
  MINION_CAP,
} from './config';
import type { EnemyDef, HeroDef } from './config';
import {
  CARD_POOL,
  applyCard,
  cardToOption,
  defaultRunModifiers,
  draftCards,
  endlessDraftInterval,
} from './cards';
import type { CardContext, CardDef, CardEffect, HookEvent, HookSpec, RunModifiers } from './cards';
import { damageAfter, effectiveArmor, fractureCap, shredBurst } from './combat';
import { CHASSIS, assembleBoss, bossDef } from './boss';
import type { BossDef } from './boss';
import { BOSS, DIRECTOR, ENDLESS, REACTIONS, CHESTS, chestForWave, spawnCount } from './config';
import { pendingReaction } from './reactions';
import type { ReactionDef } from './reactions';
import { Director } from './director';
import { runAbilities, runAbility } from './ability';
import type { AbilityCast, AbilityComponent, AbilityContext, ParticleKind, StatusApplication } from './ability';
import { aggregate as aggregateStatuses, applyStatus as applyStatusInstance, statusRegistry, tickStatuses } from './status';
import { SpawnDirector } from './spawndirector';
import type { QueuedSpawn } from './spawndirector';
import { generateRunPlan, planForWave } from './runEvents';
import type { RunPlan } from './runEvents';
import { resolveDifficulty } from './difficulty';
import type { StageConfig } from './campaign';
import { NEUTRAL_BIOME, biomeForDepth, hazardActive } from './biomes';
import { heroIdentity } from './heroIdentity';
import type { HeroIdentity } from './heroIdentity';
import type { Biome } from './biomes';
import type { DifficultyDef } from './difficulty';
import { resolveDoctrine } from './doctrines';
import { combineMult } from './modifiers';
import { sortByProfile } from './targeting';
import type { TargetingProfile } from './targeting';
import { applyMutators } from './mutators';
import { gameEvents } from './events';
import { branchesFor, branchRegistry, resolveBranchKit } from './branches';
import type { Branch, ResolvedBranchKit } from './branches';
import { BRANCH_COSTS } from './config';

const EMPTY_STR: readonly string[] = []; // shared no-alloc default for per-cast mutator lists
const SUPPORT_BRANCH_PULSE = 2.0; // seconds between a branched support tower's (Reactor) ability pulses
const BRANCH_HITSTOP = 0.12; // seconds the view-loop freezes on a tier purchase (a juicy "impact" beat)
const MUTATION_BANNER_LIFE = 2.4; // seconds the tier-purchase banner is surfaced to the HUD

export type RunMode = 'stage' | 'endless' | 'campaign';

/** Options a run can boot with. */
export interface RunOptions {
  runEffects?: CardEffect[]; // run-start effects folded into the R-bucket (e.g. equipment)
  mode?: RunMode; // 'stage' = authored WAVES (default, golden path); 'endless' = AI Director; 'campaign' = generated stage
  difficulty?: string; // universal difficulty id (default 'standard' = identity/golden path)
  doctrine?: string; // exclusive run-start build commitment (default 'none' = no effects)
  stage?: StageConfig; // campaign mode: the procedurally generated stage to run (campaign.ts)
  heroRoster?: HeroKind[]; // the fielded hero slots (HEROES.md). Omitted / [heroKind] ⇒ single hero (golden path)
  heroEquip?: Partial<Record<HeroKind, CardEffect[]>>; // PER-HERO equipment effects — each hero's gear affects only that hero
}

/** Fold a declarative effect into the run modifiers (mul/add/flag; grants handled at boot). */
function applyRunEffect(mods: RunModifiers, e: CardEffect): void {
  if (e.op === 'mul') mods[e.field] *= e.value;
  else if (e.op === 'add') mods[e.field] += e.value;
  else if (e.op === 'flag') mods[e.field] = true;
  else if (e.op === 'set') mods[e.field] = e.value;
}
import type {
  Enemy,
  EnemyKind,
  Hero,
  HeroKind,
  HeroMasteryCounts,
  HeroProgress,
  HudSnapshot,
  MasteryCounts,
  MetaModifiers,
  Minion,
  Particle,
  Phase,
  Pool,
  Projectile,
  ProjectileBehavior,
  RunStats,
  SelectedPlacedTower,
  TowerSellQuote,
  StatusType,
  Tower,
  TowerKind,
  TowerProgress,
  FloatingText,
  CardOption,
  WavePreviewEntry,
} from './types';
import type { WaveDef } from './config';

/** Aggregate a wave script into per-kind totals (telegraph for the prep phase). */
function wavePreview(def: WaveDef): WavePreviewEntry[] {
  const order: WavePreviewEntry[] = [];
  const idx = new Map<string, WavePreviewEntry>();
  for (const g of def) {
    const n = spawnCount(g.count); // the REAL integer that spawns — never a fractional preview
    const e = idx.get(g.kind);
    if (e) e.count += n;
    else {
      const entry = { kind: g.kind, count: n };
      idx.set(g.kind, entry);
      order.push(entry);
    }
  }
  return order;
}

/** Identity per-kind progression — a fresh save plays exactly like the base game. */
function neutralTowerProgress(): TowerProgress {
  const r = {} as TowerProgress;
  for (const k of TOWER_ORDER) r[k] = { damageMult: 1, fireRateMult: 1 };
  return r;
}
function zeroMasteryCounts(): MasteryCounts {
  const r = {} as MasteryCounts;
  for (const k of TOWER_ORDER) r[k] = { kills: 0, damage: 0, activeTime: 0 };
  return r;
}
/** Identity per-hero progression — a fresh save plays exactly like the base game. */
function neutralHeroProgress(): HeroProgress {
  const r = {} as HeroProgress;
  for (const k of HERO_ORDER) r[k] = { damageMult: 1, cooldownMult: 1 };
  return r;
}
function zeroHeroMastery(): HeroMasteryCounts {
  const r = {} as HeroMasteryCounts;
  for (const k of HERO_ORDER) r[k] = { kills: 0, damage: 0, activeTime: 0 };
  return r;
}
function zeroEnemyCounts(): Record<EnemyKind, number> {
  const r = {} as Record<EnemyKind, number>;
  for (const k of ENEMY_KINDS) r[k] = 0;
  return r;
}
function zeroTowerCounts(): Record<TowerKind, number> {
  const r = {} as Record<TowerKind, number>;
  for (const k of TOWER_ORDER) r[k] = 0;
  return r;
}

export interface RenderState {
  enemies: Enemy[];
  towers: Tower[];
  projectiles: Projectile[];
  pools: Pool[];
  floats: FloatingText[];
  particles: Particle[];
  heroes: Hero[];
  minions: Minion[];
  phase: Phase;
  selectedTower: TowerKind | null;
  selectedPlacedId: number | null; // a placed tower the player is inspecting (branch highlight)
  movingTowerId: number | null; // a placed tower picked up for relocation (move-mode highlight + holo)
  armedAbility: boolean;
  unlockedSlots: number;
  time: number; // sim seconds — drives presentation pulses/animation
  integrity: number;
  maxIntegrity: number;
  // Emergency Defense Mode (docs/RANGE.md §4) — render-only.
  emergency: boolean; // an enemy is in the Final Defense Zone (drives the alert visuals)
  emergencyRamp: number; // 0..1 eased intensity so the visuals fade in/out, never pop
  emergencyFocusX: number; // the in-zone enemy nearest the core — beams converge here
  emergencyFocusY: number;
  // Per-kind EFFECTIVE range (base × identity rangeMult) so the range preview/selection
  // shows the tower's TRUE reach, including mastery upgrades (docs/RANGE.md §6/§8).
  effectiveRanges: Record<TowerKind, number>;
  // Biome (docs/BIOMES.md) — the renderer tints the arena to the biome accent, flashes on a
  // transition, and pulses a hazard telegraph. Stage mode reports NEUTRAL_BIOME.
  biome: { id: string; name: string; accent: string };
  biomeFlash: number; // 0..1 transition flash (Infinite); 0 in Stage/Campaign steady state
  hazardActive: boolean; // the biome's hazard pulse is firing right now (telegraph)
}

/** A timed, run-wide friendly buff (the `buff` ability primitive). Keyed by `stat`; the
 * matching fold point reads `mult`. Lazy — none on the golden path, so it's byte-identical. */
interface RunBuff {
  stat: string; // which stat it scales (e.g. 'towerDamage')
  mult: number; // multiplier (1.2 = +20%)
  remaining: number; // seconds left
  label: string; // HUD text for the build panel
}

export class Game {
  phase: Phase = 'prep';
  /** Combat→Build settle countdown (s). > 0 after the last enemy dies: the wave is cleared but
   * the phase hasn't flipped yet — the battlefield winds down (see step's settle branch). */
  private settleTimer = 0;
  waveIndex = 0; // waves started/cleared so far (= Depth in endless)
  readonly totalWaves: number; // authored TOTAL_WAVES, or a campaign stage's generated wave count
  readonly mode: RunMode;
  private director: Director | null = null;
  // The wave list this run plays: authored WAVES (stage) or a campaign stage's generated waves.
  private readonly waves: WaveDef[];
  // The campaign stage this run plays (null for stage/endless) — drives the finale + mini boss.
  private readonly stage: StageConfig | null;
  private readonly stageSpeedMult: number; // enemy-speed scalar (campaign per-stage; 1 otherwise → golden-safe)
  // The active biome (docs/BIOMES.md): its mechanical modifiers are read at the spawn/tower/hero/
  // hazard hooks below. Campaign = the stage's biome (fixed); Infinite = rotates by depth; Stage =
  // NEUTRAL_BIOME (identity ×1/+0/no-hazard ⇒ every biome read is byte-identical → golden-safe).
  private activeBiome: Biome;
  private biomeFlash = 0; // render-only: eased 1→0 after an Infinite-mode biome transition (surfaced via RenderState)
  // Run Identity (docs/RUN-IDENTITY.md): a seed-derived plan of discrete per-wave EVENTS + a run-wide
  // ANOMALY, layered onto Campaign/Endless via a DEDICATED rng stream (never this.rng). null in Stage
  // ⇒ every wave read is a no-op ⇒ the golden autoplay never drifts.
  private runPlan: RunPlan | null = null;
  private runEventRng: Rng;
  private activeRunEvent: { name: string; desc: string; kind: string } | null = null; // current wave's beat (HUD telegraph)
  // Universal difficulty (global scalars layered on the base curves); 'standard' = identity.
  private readonly diff: DifficultyDef;
  // Spawn Director: owns spawn spacing/timing/pacing/elite/boss/special-event scheduling.
  private readonly spawner = new SpawnDirector();
  biomass: number;
  integrity: number;
  maxIntegrity: number;
  kills = 0;
  // Permanently-unlocked slots (initial allotment + Hive Emplacements Shard upgrades), frozen
  // at construction from meta.bonusSlots. Temporary gene-card slots ride on top via the
  // `unlockedSlots` getter below. See docs/SLOTS.md.
  private permanentSlots = SLOTS.initialUnlocked;
  time = 0;

  // Presentation-only: a brief view-loop freeze ("hitstop") after a juicy event. The VIEW
  // decrements this and skips `advance` while > 0, so the sim's stepping stays deterministic
  // (advance never reads it ⇒ tests/golden that drive advance directly are unaffected).
  hitstop = 0;
  // The most recent branch-tier purchase, surfaced as a transient HUD banner (the upgrade moment).
  private mutationSeq = 0;
  private mutation: { id: number; title: string; sub: string; branchId: string; color: string; at: number } | null = null;

  // debug-only knobs — no effect at their defaults (driven by the debug panel)
  god = false;
  timeScale = 1;
  // Auto-start: when on, prep auto-advances to the next wave after a countdown. Off by default
  // (a player QoL toggle); the manual-start golden run never touches it.
  autoStart = false;

  enemies: Enemy[] = [];
  towers: Tower[] = [];
  projectiles: Projectile[] = [];
  pools: Pool[] = [];
  floats: FloatingText[] = [];
  particles: Particle[] = [];
  minions: Minion[] = []; // summoned friendly units (empty on the golden path → byte-identical)
  // The active hero roster. One today (the selected hero); the array is the seam for
  // future hero slots (HEROES.md) — slot unlocks just push more heroes in.
  heroes: Hero[];
  mods: RunModifiers;
  // Per-tower-kind permanent buffs (stars + mastery), frozen at construction so a
  // run stays deterministic; identity for a fresh save.
  private towerProgress: TowerProgress;
  // Per-kind EFFECTIVE range (base × identity rangeMult) — frozen at construction; the
  // renderer reads it so the range preview/selection shows the tower's true reach (docs/RANGE.md §8).
  private readonly towerEffectiveRange: Record<TowerKind, number>;
  // Per-hero permanent buffs (stars + mastery + equipment); identity for a fresh save.
  private heroProgress: HeroProgress;
  // ── Hero identity (docs/HERO-FRAMEWORK.md) — the fielded roster's data-driven kits, keyed by
  //    kind (1–3 distinct heroes; HEROES.md hero slots). Per-hero scaling state (killchain/rush)
  //    lives on the Hero. All golden-safe: the Ravager's hooks fire only on `elite` enemies (absent
  //    from Stage autoplay), Shepherd/Overseer are never fielded by autoplay, and a fresh account
  //    fields exactly ONE hero ⇒ the single-hero path is byte-identical. ──
  private readonly heroIdById: Partial<Record<HeroKind, HeroIdentity>> = {};
  // Pure-observation usage signals accrued this run, banked into mastery at run end.
  private masteryAccrual: MasteryCounts = zeroMasteryCounts();
  private heroMasteryAccrual: HeroMasteryCounts = zeroHeroMastery();
  // Pure-observation run statistics (banked into lifetime stats at run end). Like
  // mastery, these NEVER feed back into combat, so they can't alter a fixed seed.
  private statBiomassEarned = 0;
  private statDamageDealt = 0;
  private statKillsByEnemy: Record<EnemyKind, number> = zeroEnemyCounts();
  private statTowerBuilds: Record<TowerKind, number> = zeroTowerCounts();

  selectedTower: TowerKind | null = null;
  selectedPlacedId: number | null = null; // a placed tower selected for inspection / branch upgrades
  movingTowerId: number | null = null; // a placed tower PICKED UP for relocation (Build Phase) — docs/TOWER-MANAGEMENT.md §3
  armedAbility = false;
  draft: CardDef[] | null = null;
  sfx: string[] = []; // presentation cue queue (drained by the view: audio + shake)
  chosenCards: CardOption[] = []; // gene cards taken this run

  private rng: Rng;
  private fxRng: Rng; // cosmetic-only stream (particles) — keeps gameplay rng pure
  private grid = new SpatialGrid<Enemy>(WIDTH, HEIGHT, PERF.spatialCell);
  private enemyById = new Map<number, Enemy>(); // O(1) projectile target lookup
  private reactorCount = 0; // cached on tower placement (economy), not per tick
  private bossCount = 0; // # framework bosses on the field (gates the boss system)
  private procBosses = new Map<string, BossDef>(); // assembled boss defs by id (lookup at runtime)
  private targetRng = (): number => this.rng.next(); // stable closure for 'random' targeting
  private projPool: Projectile[] = [];
  private partPool: Particle[] = [];
  private targetScratch: Enemy[] = [];
  private neighborScratch: Enemy[] = [];
  private occupied = new Set<number>();
  private spawnQueue: QueuedSpawn[] = [];
  private spawnedAll = false;
  private waveStartIntegrity = 0; // integrity when the current wave began (drives FLAWLESS)
  private prepCountdown = AUTO_START_DELAY; // prep seconds left before an auto-start fires
  private wavesSinceDraft = 0; // endless cadence: waves cleared since the last Gene Card draft
  private nextId = 1;
  private armorBreakUntil = new Map<number, number>();
  private acc = 0; // fixed-timestep accumulator

  // ── Ability execution (Part 2): the shared executor's context + per-cast scratch ──
  // The active cast's source (for mastery credit) + caster (for self-heal). Set right
  // before runAbilities so the context's primitives credit/heal the right unit.
  private abilitySourceKind: TowerKind | null = null;
  private abilityHeroKind: HeroKind | null = null;
  private abilityCaster: Hero | null = null;
  private runBuffs: RunBuff[] = []; // active timed run-wide buffs (empty on the golden path)
  private abilityTargeting: TargetingProfile = 'closestToBase'; // the active cast's target pick
  // ── Final Defense Zone / Emergency Defense Mode (docs/RANGE.md §4) ──
  // In-zone enemies, recomputed ONCE per tick (sorted nearest-to-core) and shared by every
  // tower — no per-tower re-scan. Drives the targeting override + the emergency visuals.
  private readonly emergencyEnemies: Enemy[] = [];
  private emergencyActive = false; // any enemy inside the Final Defense Zone right now
  private emergencyRamp = 0; // render-only eased intensity (0..1) for the visual fade in/out
  private emergencyFocusX = 0; // render-only: in-zone enemy nearest the core (beam convergence)
  private emergencyFocusY = 0;
  private castExtraProjectiles = 0; // star-kit projectile bonus for the active tower cast (0 = base)
  private castSplashMult = 1; // star-kit splash multiplier for the active tower cast (1 = base)
  private castRangeMult = 1; // identity-range multiplier for the active tower cast (1 = base; docs/RANGE.md §8)
  private castProjectileMutators: readonly string[] = EMPTY_STR; // star-kit mutators for the active cast
  private castProjectileSkin: string | undefined = undefined; // branch cosmetic id tagged onto shots (undefined = base)
  private castProjectileSkinTier = 0; // branch tier tagged onto shots (drives projectile evolution; 0 = base)
  // Run-start behavioral grants/hooks collected at boot from equipment (the §3 verbs).
  // Empty by default ⇒ a gear-less run is byte-identical (golden invariant).
  private readonly grantedTowerMutators: string[] = []; // projectile mutators applied to EVERY shot
  private readonly heroAttackStatuses: { status: StatusType; amount: number }[] = []; // GLOBAL (doctrine/collection): every hero's hits apply
  private readonly heroAttackKit: AbilityComponent[] = []; // GLOBAL: ability components run on each hero hit (cleave/chain/AoE/status/crit)
  // PER-HERO equipment (HEROES.md per-hero loadouts): a hero WITH gear gets its own mods bundle +
  // attack verbs; a hero WITHOUT gear falls back to the global values ⇒ a single-hero / gear-less
  // run is byte-identical (golden-safe). Keyed by kind (the roster is distinct).
  private readonly heroHmods: Partial<Record<HeroKind, RunModifiers>> = {};
  private readonly heroKits: Partial<Record<HeroKind, AbilityComponent[]>> = {};
  private readonly heroStatuses: Partial<Record<HeroKind, { status: StatusType; amount: number }[]>> = {};
  private readonly relicHooks: HookSpec[] = []; // relic battlefield rules (run events → actions)
  private readonly castScratch: AbilityCast = { x: 0, y: 0, damageMult: 1, target: null };
  private readonly actx: AbilityContext = this.buildAbilityContext();

  constructor(
    seed: number,
    meta: MetaModifiers,
    towerProgress: TowerProgress = neutralTowerProgress(),
    heroKind: HeroKind = 'ravager',
    heroProgress: HeroProgress = neutralHeroProgress(),
    opts: RunOptions = {},
  ) {
    this.rng = new Rng(seed);
    this.fxRng = new Rng((seed ^ 0x9e3779b9) >>> 0);
    this.towerProgress = towerProgress;
    this.towerEffectiveRange = {} as Record<TowerKind, number>;
    for (const k of TOWER_ORDER) this.towerEffectiveRange[k] = TOWER_DEFS[k].range * (towerProgress[k].rangeMult ?? 1);
    this.heroProgress = heroProgress;
    this.mode = opts.mode ?? 'stage';
    // Campaign runs a procedurally GENERATED stage: its combined difficulty (variant × per-stage
    // scaling) becomes `this.diff`, its waves replace the authored WAVES, and its speed scalar
    // rides separately. Stage/endless are unchanged ⇒ byte-identical (golden-safe).
    this.stage = opts.stage ?? null;
    this.diff = this.stage ? this.stage.scaling : resolveDifficulty(opts.difficulty);
    this.waves = this.stage ? this.stage.waves : WAVES;
    this.totalWaves = this.waves.length;
    // Enemy speed = the stage's own scaling (campaign) × the DIFFICULTY speed axis (both modes).
    // standard ⇒ ×1 → golden-safe.
    this.stageSpeedMult = (this.stage ? this.stage.enemySpeedMult : 1) * this.diff.enemySpeedMult;
    // Biome: Campaign uses the stage's fixed biome; Infinite seeds the first biome (rotates as the
    // run deepens — see startEndlessWave); Stage uses the identity biome (golden-safe).
    this.activeBiome = this.stage ? this.stage.biome : this.mode === 'endless' ? biomeForDepth(1) : NEUTRAL_BIOME;
    if (this.mode === 'endless') this.director = new Director(() => this.rng.next(), this.diff);
    // Run Identity: a DEDICATED rng stream (decoupled from this.rng ⇒ base run unperturbed) + the plan.
    // Stage ⇒ null plan (golden-safe). Campaign uses the stage's wave count (finale reserved for its
    // boss); Endless plans over a horizon. Rare Invasions draw OUT of the active biome's signature.
    this.runEventRng = new Rng((seed ^ 0x52554e21) >>> 0);
    this.runPlan = this.mode === 'stage' ? null : generateRunPlan(seed, {
      mode: this.mode,
      waveCount: this.mode === 'endless' ? 50 : this.totalWaves,
      reserveFinale: this.mode === 'campaign',
      biomeSignature: this.activeBiome.mods.signature,
      invasionPool: ENEMY_KINDS,
    });
    this.mods = defaultRunModifiers();
    // Fold permanent (meta) multipliers into the run as starting buckets.
    this.mods.towerDamageMult = meta.towerDamageMult;
    this.mods.biomassMult = meta.biomassMult;
    this.mods.heroDamageMult = meta.heroDamageMult;
    // Fold the chosen doctrine's run-start effects, then run-start effects (equipment, …).
    // 'none' / no gear contribute nothing, so a default run stays byte-identical.
    for (const e of resolveDoctrine(opts.doctrine).effects) this.bootRunEffect(e);
    if (opts.runEffects) for (const e of opts.runEffects) this.bootRunEffect(e);
    // Hero identity (docs/HERO-FRAMEWORK.md): field the ROSTER — 1–3 distinct heroes (opts.heroRoster,
    // defaulting to the single selected hero ⇒ golden-safe). Cache each hero's kit and fold its innate
    // PASSIVE where it's a mod (Shepherd's Symbiosis grants a tower aura). The Ravager's passive is
    // `eliteDamage` (no fold), so a single-Ravager autoplay run stays byte-identical.
    const roster = opts.heroRoster && opts.heroRoster.length > 0 ? opts.heroRoster : [heroKind];
    for (const k of roster) {
      const id = heroIdentity(k);
      this.heroIdById[k] = id;
      if (id.passive.kind === 'towerAura') {
        this.mods.heroAuraRadius = Math.max(this.mods.heroAuraRadius, 130);
        this.mods.heroTowerHasteAura += id.passive.amount;
        this.mods.heroTowerDamageAura += id.passive.amount;
      }
    }
    this.maxIntegrity = (ECON.baseIntegrity + meta.integrityBonus) * this.mods.integrityMult;
    this.integrity = this.maxIntegrity;
    // Permanent tower slots: initial allotment + Hive Emplacements upgrades (meta.bonusSlots),
    // capped at SLOTS.permanentMax. Persists across runs via the saved upgrade ladder; the
    // run-only gene-card slots layer on top in the `unlockedSlots` getter. docs/SLOTS.md.
    this.permanentSlots = Math.min(SLOTS.permanentMax, SLOTS.initialUnlocked + meta.bonusSlots);
    this.biomass = ECON.startingBiomass + this.mods.startBiomassBonus;
    this.foldHeroEquip(roster, opts.heroEquip); // build per-hero gear mods BEFORE heroes (makeHero reads them)
    this.heroes = roster.map((k) => this.makeHero(k));
  }

  /** Fold each hero's EQUIPMENT (opts.heroEquip) into a per-hero mods bundle + attack verbs, so a
   *  hero's gear affects only that hero and never overwrites another's loadout (HEROES.md). Tower
   *  grants (projectile mutators) + relic hooks are battlefield-GLOBAL. No-op for a gear-less roster
   *  (opts.heroEquip omitted / empty) ⇒ the golden run is byte-identical. */
  private foldHeroEquip(roster: HeroKind[], heroEquip?: Partial<Record<HeroKind, CardEffect[]>>): void {
    if (!heroEquip) return;
    for (const k of roster) {
      const effects = heroEquip[k];
      if (!effects || effects.length === 0) continue;
      const hm: RunModifiers = { ...this.mods }; // start from the global (meta × doctrine × collection)
      const kit = [...this.heroAttackKit];
      const statuses = [...this.heroAttackStatuses];
      for (const e of effects) {
        if (e.op === 'grant') {
          if (e.grant.kind === 'towerProjectileMutator') this.grantedTowerMutators.push(e.grant.id); // battlefield-global
          else if (e.grant.kind === 'heroAttackStatus') statuses.push({ status: e.grant.status, amount: e.grant.amount });
          else if (e.grant.kind === 'heroAttackAbility') kit.push(e.grant.component);
        } else if (e.op === 'hook') {
          this.relicHooks.push(e.hook); // relic rules are battlefield-global
        } else {
          applyRunEffect(hm, e);
        }
      }
      this.heroHmods[k] = hm;
      this.heroKits[k] = kit;
      this.heroStatuses[k] = statuses;
    }
  }

  /** Build a hero runtime instance from its data-driven definition. */
  private makeHero(kind: HeroKind): Hero {
    const def = HERO_DEFS[kind];
    const maxHp = def.maxHp * (this.heroHmods[kind] ?? this.mods).heroMaxHpMult; // this hero's own gear survivability folds in
    if (gameEvents.hasListeners('heroSpawned')) gameEvents.emit('heroSpawned', { kind });
    return {
      kind,
      x: nucleusPoint.x,
      y: nucleusPoint.y,
      hp: maxHp,
      maxHp,
      down: false,
      respawn: 0,
      rally: { x: WIDTH / 2, y: DEFENSE_TOP_Y - CELL }, // patrol the line by default
      attackCd: 0,
      abilityCd: 0,
      pulseCd: 0,
      shield: 0,
      shieldTime: 0,
      killchain: 0,
      rushUntil: 0,
    };
  }

  /** The player-controlled (slot-1) hero — abilities, HUD, and pings target it. */
  private get primaryHero(): Hero {
    return this.heroes[0];
  }

  /** The data-driven identity kit for a fielded hero (built at construction, keyed by kind). */
  private idOf(h: Hero): HeroIdentity {
    return this.heroIdById[h.kind]!;
  }

  /** A hero's effective run modifiers — its own gear-folded bundle if it has equipment, else the
   *  global mods. Single-hero / gear-less ⇒ returns `this.mods` (byte-identical). */
  private hmods(h: Hero): RunModifiers {
    return this.heroHmods[h.kind] ?? this.mods;
  }
  /** A hero's on-hit ability verbs (its equipment kit, else the global grants). */
  private hkit(h: Hero): AbilityComponent[] {
    return this.heroKits[h.kind] ?? this.heroAttackKit;
  }
  /** A hero's on-hit statuses (its equipment statuses, else the global grants). */
  private hstatuses(h: Hero): { status: StatusType; amount: number }[] {
    return this.heroStatuses[h.kind] ?? this.heroAttackStatuses;
  }

  /** Build the ability executor's view of the sim. The Game owns the side-effects;
   * ability components only call these primitives, so a tower/hero kit composes from
   * reusable blocks without bespoke code. Per-cast source/caster live on the Game. */
  private buildAbilityContext(): AbilityContext {
    const self = this;
    return {
      pickTargets: (x, y, range, n) => this.pickTargets(x, y, range, n, this.abilityTargeting),
      forEnemiesInRadius: (x, y, r, fn) => {
        const r2 = r * r;
        this.grid.forNeighbors(x, y, r, (e) => {
          if (e.alive && dist2(x, y, e.x, e.y) <= r2) fn(e);
        });
      },
      nearestEnemy: (x, y, range, exclude) => {
        let best: Enemy | null = null;
        let bd = range * range;
        this.grid.forNeighbors(x, y, range, (e) => {
          if (!e.alive || exclude.has(e.id)) return;
          const d2 = dist2(x, y, e.x, e.y);
          if (d2 <= bd) {
            bd = d2;
            best = e;
          }
        });
        return best;
      },
      fireProjectile: (x, y, target, tx, ty, behavior, damage, speed, splash) => {
        this.spawnProjectile(x, y, tx, ty, speed, target ? target.id : -1, damage, behavior, splash, this.abilitySourceKind);
      },
      dealDamage: (e, raw, flash) => {
        const applied = this.applyDamage(e, raw, this.abilitySourceKind, flash);
        if (this.abilityHeroKind) this.heroMasteryAccrual[this.abilityHeroKind].damage += applied;
        if (this.abilityCaster) this.heroLifesteal(this.abilityCaster, applied); // lifesteal on ability/kit hits
        return applied;
      },
      applyStatus: (e, status) => this.applyStatus(e, status),
      reactOnHit: (e) => this.maybeReact(e),
      healNucleus: (n) => {
        this.integrity = Math.min(this.maxIntegrity, this.integrity + n);
      },
      healCaster: (n) => {
        const h = this.abilityCaster;
        if (h) h.hp = Math.min(h.maxHp, h.hp + n);
      },
      grantShield: (amount, seconds) => {
        const h = this.abilityCaster;
        if (!h) return;
        // Refresh to the stronger pool + a fresh window (matches the status framework's
        // 'refresh' Shield buff). Decays in updateHero; absorbed in heroContactDamage.
        h.shield = Math.max(h.shield, amount);
        h.shieldTime = Math.max(h.shieldTime, seconds);
      },
      grantBuff: (stat, amount, seconds) => this.grantRunBuff(stat, amount, seconds),
      summon: (unit, count, x, y) => this.summonMinions(unit, count, x, y),
      particles: (x, y, kind: ParticleKind) => this.spawnParticles(x, y, PARTICLE[kind]),
      sfx: (k) => this.pushSfx(k),
      roll: () => this.rng.next(),
      get extraProjectiles() {
        return self.mods.needleExtraProjectiles + self.castExtraProjectiles; // run-mods + star kit
      },
      get splashMult() {
        return self.mods.splashRadiusMult * self.castSplashMult; // run-mods × star kit
      },
      get rangeMult() {
        return self.castRangeMult; // identity-range upgrade (mastery), per active tower cast
      },
    };
  }

  /** Dispatch a run-start effect at boot: stat folds go to mods; the behavioral verbs
   * (grant/hook) are collected for the sim to consume. Empty when no gear ⇒ golden-safe. */
  private bootRunEffect(e: CardEffect): void {
    if (e.op === 'grant' || e.op === 'hook') this.collectRunVerb(e);
    else applyRunEffect(this.mods, e);
  }

  /** Collect a behavioral verb (grant/hook) into the live arrays the sim reads each tick.
   * Shared by boot-time equipment folding AND mid-run card drafts, so a drafted card can
   * also grant a projectile mutator / hero on-hit / battlefield rule (one effect vocabulary). */
  private collectRunVerb(e: CardEffect): void {
    if (e.op === 'grant') {
      if (e.grant.kind === 'towerProjectileMutator') this.grantedTowerMutators.push(e.grant.id);
      else if (e.grant.kind === 'heroAttackStatus') this.heroAttackStatuses.push({ status: e.grant.status, amount: e.grant.amount });
      else if (e.grant.kind === 'heroAttackAbility') this.heroAttackKit.push(e.grant.component);
    } else if (e.op === 'hook') {
      this.relicHooks.push(e.hook);
    }
  }

  /** Run the equipped relics' battlefield rules for a run event (no-op without relic gear). */
  private fireRelicHooks(on: HookEvent, e: Enemy | null): void {
    for (const h of this.relicHooks) {
      if (h.on !== on) continue;
      const a = h.action;
      if (a.do === 'biomass') {
        this.biomass += a.value;
      } else if (a.do === 'heal') {
        this.integrity = Math.min(this.maxIntegrity, this.integrity + a.value);
      } else if (a.do === 'shield') {
        const ph = this.primaryHero;
        if (!ph.down) {
          ph.shield = Math.max(ph.shield, a.value);
          ph.shieldTime = Math.max(ph.shieldTime, a.seconds);
        }
      } else if (a.do === 'spreadStatus' && e) {
        const r2 = a.radius * a.radius;
        this.grid.forNeighbors(e.x, e.y, a.radius, (n) => {
          if (n.alive && n.id !== e.id && dist2(e.x, e.y, n.x, n.y) <= r2) {
            this.applyStatus(n, { kind: a.status, amount: a.amount });
          }
        });
      }
    }
  }

  /** Where a hero idles when no target — biased by the equipment behavior profile's anchor.
   * 'default' returns the hero's rally (historical behavior ⇒ golden-safe). */
  private heroIdleGoal(h: Hero): { x: number; y: number } {
    switch (this.hmods(h).heroAnchor) {
      case 'nucleus': return nucleusPoint;
      case 'line': return { x: WIDTH / 2, y: DEFENSE_TOP_Y };
      case 'towers': {
        if (this.towers.length === 0) return nucleusPoint;
        let sx = 0;
        let sy = 0;
        for (const t of this.towers) ((sx += t.x), (sy += t.y));
        return { x: sx / this.towers.length, y: sy / this.towers.length };
      }
      default: return h.rally;
    }
  }

  /** Apply a status request to an enemy — the one place a StatusType maps to its field.
   * (The Part 3 status framework will replace these direct fields with managed stacks.) */
  private applyStatus(e: Enemy, status: StatusApplication): void {
    switch (status.kind) {
      case 'Fracture':
        this.addFracture(e, status.amount);
        break;
      case 'Corrosion':
        e.corrosion = status.amount;
        break;
      case 'Infection':
        this.infect(e, status.amount);
        break;
      case 'Disruption':
        e.disrupt = status.amount;
        break;
    }
  }

  // ── Intents (from the UI) ────────────────────────────────────────────────

  selectTower(kind: TowerKind | null): void {
    this.selectedTower = kind;
    this.armedAbility = false;
    if (kind) { this.selectedPlacedId = null; this.movingTowerId = null; } // arming placement clears inspect/move
  }

  // ── Branch upgrades (TOWER-BRANCHES.md) — per-instance, Biomass-bought, run-temporary ──

  /** The branch offers for a placed tower: each path with its lock state + the next tier
   *  to buy (name/desc/cost/affordable). Once locked, only the chosen path is returned. */
  branchOptions(towerId: number): {
    branchId: string; name: string; theme: string; locked: boolean; tier: number;
    next: { tier: number; name: string; desc: string; cost: number; affordable: boolean } | null;
  }[] {
    const t = this.towers.find((tw) => tw.id === towerId);
    if (!t) return [];
    const all = branchesFor(t.kind);
    const offer = (b: Branch) => {
      const owned = t.branchId === b.id ? t.tier : 0;
      const nextTier = owned + 1;
      const td = b.tiers[nextTier - 1];
      const cost = nextTier <= 5 ? BRANCH_COSTS[t.kind][nextTier - 1] : 0;
      return {
        branchId: b.id, name: b.name, theme: b.theme,
        locked: t.branchId === b.id, tier: owned,
        next: td ? { tier: nextTier, name: td.name, desc: td.desc, cost, affordable: this.biomass >= cost } : null,
      };
    };
    // Before the lock, show both paths; after, only the committed one.
    return t.branchId ? all.filter((b) => b.id === t.branchId).map(offer) : all.map(offer);
  }

  /** Buy the next tier of `branchId` on a placed tower. The first purchase LOCKS the tower
   *  into that branch for the run; later purchases must match it and step 1→5. */
  buyBranchTier(towerId: number, branchId: string): 'ok' | 'locked' | 'maxed' | 'poor' | 'badTower' {
    const t = this.towers.find((tw) => tw.id === towerId);
    if (!t) return 'badTower';
    const b = branchRegistry.get(branchId);
    if (!b || b.tower !== t.kind) return 'badTower';
    if (t.branchId && t.branchId !== branchId) return 'locked'; // committed elsewhere
    if (t.tier >= 5) return 'maxed';
    const cost = BRANCH_COSTS[t.kind][t.tier]; // next tier's cost (t.tier is 0-based into the ladder)
    if (this.biomass < cost) return 'poor';
    this.biomass -= cost;
    t.branchId = branchId;
    t.tier += 1;
    t.mutatedAt = this.time; // drives the grow-in + mutation flash (render-side)
    this.recomputeTowerCaches(); // overcharge adjacency unaffected, but keep caches coherent
    this.triggerMutationSpectacle(t, b, cost); // the "this feels important" moment
    if (gameEvents.hasListeners('towerPlaced')) gameEvents.emit('towerPlaced', { id: t.id, kind: t.kind, slot: t.slot });
    return 'ok';
  }

  /** The branch-tier purchase MOMENT: a brief view-freeze, a mutation burst, biomass visibly
   *  absorbed into the tower, a cost float, a meaty cue (which also shakes the screen), and a
   *  transient upgrade banner. Cosmetic only — FX rng + sfx queue + presentation fields, so the
   *  pinned sim outcome never changes (and autoplay never buys ⇒ golden byte-identical). */
  private triggerMutationSpectacle(t: Tower, b: Branch, cost: number): void {
    const color = TOWER_DEFS[t.kind].color;
    this.hitstop = BRANCH_HITSTOP; // 1) pause briefly (the view honors this)
    this.spawnParticles(t.x, t.y, PARTICLE.mutate, color); // 2) mutation burst — new matter erupts
    this.spawnAbsorption(t.x, t.y); // 3) biomass converges INTO the tower (absorption)
    this.floats.push({ x: t.x, y: t.y - 16, text: `−${cost}`, color: '#b6e84a', life: 1.2 }); // 3) cost absorbed
    this.pushSfx('splice'); // 6) the cue (drives screen-shake in the view too)
    const tier = b.tiers[t.tier - 1];
    // 5) the upgrade banner (surfaced to the HUD; 4) grow-in + the flash are driven by t.mutatedAt)
    this.mutation = { id: ++this.mutationSeq, title: tier.name, sub: `${b.name} · Tier ${t.tier}`, branchId: b.id, color, at: this.time };
  }

  /** Biomass motes converging INWARD onto a tower — the tower visibly "absorbing" the spent
   *  Biomass. FX rng + budget-capped pooling (never the gameplay rng) ⇒ golden-safe. */
  private spawnAbsorption(x: number, y: number): void {
    const N = 16;
    for (let i = 0; i < N; i++) {
      if (this.particles.length >= PERF.maxParticles) break;
      const ang = (i / N) * Math.PI * 2 + this.fxRng.next() * 0.4;
      const dist = 26 + this.fxRng.next() * 20;
      const spd = dist * 2.4; // reaches the core in ~0.4s (drag eases it in)
      const p = this.partPool.pop() ?? { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0, color: '#b6e84a' };
      p.x = x + Math.cos(ang) * dist;
      p.y = y + Math.sin(ang) * dist;
      p.vx = -Math.cos(ang) * spd; // inward
      p.vy = -Math.sin(ang) * spd;
      p.life = 0.42; p.maxLife = 0.42; p.size = 2.3; p.color = '#b6e84a';
      this.particles.push(p);
    }
  }

  /** The HUD view of the inspected placed tower (its branch offers), or null. */
  private selectedPlacedView(): SelectedPlacedTower | null {
    if (this.selectedPlacedId === null) return null;
    const t = this.towers.find((tw) => tw.id === this.selectedPlacedId);
    if (!t) return null;
    const def = TOWER_DEFS[t.kind];
    const branch = t.branchId ? branchRegistry.get(t.branchId) : null;
    const q = this.sellQuote(t.id)!;
    return {
      id: t.id,
      kind: t.kind,
      name: def.name,
      combatClass: def.combatClass,
      tier: t.tier,
      branchName: branch ? branch.name : null,
      branches: this.branchOptions(t.id),
      sell: { investment: q.investment, towerRefund: q.towerRefund, branchRefund: q.branchRefund, total: q.total },
      canMove: this.phase === 'prep', // relocation is Build-Phase only
      moving: this.movingTowerId === t.id,
    };
  }

  armAbility(): void {
    const h = this.primaryHero;
    if (h.abilityCd <= 0 && !h.down) {
      this.armedAbility = true;
      this.selectedTower = null;
    }
  }

  /** Re-anchor the hero's leash (right-click). */
  setRally(px: number, py: number): void {
    this.primaryHero.rally = { x: px, y: py };
  }

  /** Route a canvas click based on what is currently armed. `shift` keeps the build tool armed for
   *  rapid placement (docs/TOWER-MANAGEMENT.md §4). */
  click(px: number, py: number, opts: { shift?: boolean } = {}): void {
    if (this.armedAbility) {
      this.triggerAbility(px, py);
      this.armedAbility = false;
      return;
    }
    // Relocation mode: a tap lands the picked-up tower on a valid empty slot (moveTower re-selects
    // it → back to Inspect), or cancels on its own slot. An invalid tap is ignored so the player
    // stays in move mode and can try another slot.
    if (this.movingTowerId !== null) {
      this.moveTower(px, py);
      return;
    }
    if (this.selectedTower) {
      // Clicking an EXISTING tower always inspects it — placement only lands on empty slots, so
      // an occupied-slot click would otherwise misfire into a no-op placement and the armed build
      // tool would shadow inspection entirely. Redirect it to the Mutation panel.
      const occupant = this.towerAt(px, py);
      if (occupant) { this.selectPlacedTower(occupant.id); return; }
      // One-shot placement by default; holding Shift keeps the tool armed for rapid building.
      if (this.placeTower(this.selectedTower, px, py) && !opts.shift) this.selectedTower = null;
      return;
    }
    // Nothing armed: clicking a PLACED tower selects it (opens its branch/Mutation panel).
    const t = this.towerAt(px, py);
    if (t) {
      this.selectPlacedTower(t.id);
      return;
    }
    this.selectedPlacedId = null; // clicked empty space → deselect
    this.setRally(px, py);
  }

  /** Double-click fast path (docs/TOWER-MANAGEMENT.md §4): open Inspect on the tower under
   *  (px,py), if any. A no-op on empty space, so it never disturbs the hero/rally. */
  inspectAt(px: number, py: number): void {
    const t = this.towerAt(px, py);
    if (t) this.selectPlacedTower(t.id);
  }

  /** The placed tower occupying the cell at (px,py), or null. */
  private towerAt(px: number, py: number): Tower | null {
    const slot = slotAt(px, py);
    if (!slot) return null;
    return this.towers.find((t) => t.slot === slot.index) ?? null;
  }

  /** Select a placed tower for inspection / branch upgrades (null = deselect). */
  selectPlacedTower(id: number | null): void {
    this.selectedPlacedId = id !== null && this.towers.some((t) => t.id === id) ? id : null;
    if (this.selectedPlacedId !== null) {
      this.selectedTower = null; // inspecting, not placing
      this.movingTowerId = null;
      this.armedAbility = false;
    }
  }

  /** Close every tower interaction (inspect / move / armed placement). The ESC + right-click
   *  escape hatch (docs/TOWER-MANAGEMENT.md §4). Never touches the hero or the sim clock. */
  cancelInteractions(): void {
    this.selectedTower = null;
    this.selectedPlacedId = null;
    this.movingTowerId = null;
  }

  // ── Tower SELL (docs/TOWER-MANAGEMENT.md §2) ───────────────────────────────
  /** Refund breakdown for the Sell confirm dialog (pure read-model), or null if the id is gone.
   *  Investment = purchase cost + every branch tier bought; refund = round(frac · each part). */
  sellQuote(id: number): (TowerSellQuote & { name: string; kind: TowerKind; tier: number }) | null {
    const t = this.towers.find((tw) => tw.id === id);
    if (!t) return null;
    const frac = this.mods.sellRefundFrac;
    const purchase = TOWER_DEFS[t.kind].cost;
    const ladder = BRANCH_COSTS[t.kind];
    let branchTotal = 0;
    for (let i = 0; i < t.tier; i++) branchTotal += ladder[i];
    const towerRefund = Math.round(frac * purchase);
    const branchRefund = Math.round(frac * branchTotal);
    return {
      name: TOWER_DEFS[t.kind].name,
      kind: t.kind,
      tier: t.tier,
      investment: purchase + branchTotal,
      towerRefund,
      branchRefund,
      total: towerRefund + branchRefund,
    };
  }

  /** Sell a placed tower: credit the refund, free its slot, despawn it cleanly, play the dissolve
   *  FX. Allowed in prep AND combat (remove unwanted towers during a run); blocked once the run
   *  is over. Returns false if the id is unknown / the run ended. */
  sellTower(id: number): boolean {
    if (this.phase === 'won' || this.phase === 'lost') return false;
    const idx = this.towers.findIndex((tw) => tw.id === id);
    if (idx < 0) return false;
    const t = this.towers[idx];
    const refund = this.sellQuote(id)!.total;
    this.biomass += refund;
    this.occupied.delete(t.slot); // free the placement slot IMMEDIATELY
    this.towers.splice(idx, 1); // remove the tower (its in-flight shots/pools coast out on their own)
    if (this.selectedPlacedId === id) this.selectedPlacedId = null; // selling closes Inspect
    if (this.movingTowerId === id) this.movingTowerId = null;
    this.recomputeTowerCaches(); // overcharge adjacency + reactor count stay coherent
    this.sellFx(t, refund);
    if (gameEvents.hasListeners('towerSold')) gameEvents.emit('towerSold', { id, kind: t.kind, slot: t.slot, refund });
    return true;
  }

  /** Dissolve spectacle: tower matter erupts, green biomass motes stream to the Hive Core, a
   *  refund float rises, and a unique cue fires. FX rng + presentation queues ⇒ golden-safe. */
  private sellFx(t: Tower, refund: number): void {
    const color = TOWER_DEFS[t.kind].color;
    this.spawnParticles(t.x, t.y, PARTICLE.mutate, color); // tower dissolves into matter
    this.spawnDissolveToCore(t.x, t.y); // biomass returns to the Hive Core
    this.floats.push({ x: t.x, y: t.y - 16, text: `+${refund}`, color: '#b6e84a', life: 1.4 });
    this.pushSfx('dissolve');
  }

  /** Green biomass motes flung from (x,y) toward the Hive Core — the refund "returning". FX-only. */
  private spawnDissolveToCore(x: number, y: number): void {
    const N = 14;
    const dx = nucleusPoint.x - x;
    const dy = nucleusPoint.y - y;
    const d = Math.hypot(dx, dy) || 1;
    const life = 0.5;
    for (let i = 0; i < N; i++) {
      if (this.particles.length >= PERF.maxParticles) break;
      const spread = (this.fxRng.next() - 0.5) * 0.5; // a little fan so it reads as a stream, not a line
      const ca = Math.cos(spread);
      const sa = Math.sin(spread);
      const ux = (dx / d) * ca - (dy / d) * sa;
      const uy = (dx / d) * sa + (dy / d) * ca;
      const spd = (d / life) * (0.85 + this.fxRng.next() * 0.3); // reaches the core in ~`life`s
      const p = this.partPool.pop() ?? { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0, color: '#b6e84a' };
      p.x = x + (this.fxRng.next() - 0.5) * 10;
      p.y = y + (this.fxRng.next() - 0.5) * 10;
      p.vx = ux * spd;
      p.vy = uy * spd;
      p.life = life; p.maxLife = life; p.size = 2.4; p.color = '#b6e84a';
      this.particles.push(p);
    }
  }

  // ── Tower RELOCATION (docs/TOWER-MANAGEMENT.md §3) ─────────────────────────
  /** Pick a tower up for relocation — Build Phase only (no-op otherwise). */
  beginMove(id: number): void {
    if (this.phase !== 'prep') return; // movement is disabled during combat (future perk widens this)
    if (!this.towers.some((t) => t.id === id)) return;
    this.movingTowerId = id;
    this.selectedTower = null;
    this.armedAbility = false;
  }

  /** Drop the picked-up tower (cancel relocation), keeping it where it is. */
  cancelMove(): void {
    this.movingTowerId = null;
  }

  /** Relocate the picked-up tower to the slot under (px,py). Build Phase only; the slot must be
   *  unlocked + empty. Mutates the EXISTING tower object (so every runtime state transfers) and
   *  re-selects it (returns to Inspect). Returns 'ok' | 'sameSlot' (cancel) | 'invalid'. */
  moveTower(px: number, py: number): 'ok' | 'sameSlot' | 'invalid' {
    if (this.phase !== 'prep' || this.movingTowerId === null) return 'invalid';
    const t = this.towers.find((tw) => tw.id === this.movingTowerId);
    if (!t) { this.movingTowerId = null; return 'invalid'; }
    const slot = slotAt(px, py);
    if (!slot) return 'invalid';
    if (slot.index === t.slot) { this.movingTowerId = null; this.selectPlacedTower(t.id); return 'sameSlot'; } // dropped back
    if (slot.index >= this.unlockedSlots || this.occupied.has(slot.index)) return 'invalid'; // locked / occupied
    // Relocate the SAME object — slot/position only. bornAt/mutatedAt (visual evolution) untouched.
    this.occupied.delete(t.slot);
    this.occupied.add(slot.index);
    t.slot = slot.index;
    t.x = slot.x;
    t.y = slot.y;
    t.movedAt = this.time; // landing-impact FX
    this.movingTowerId = null;
    this.recomputeTowerCaches(); // overcharge adjacency changed → refresh
    this.spawnParticles(t.x, t.y, PARTICLE.mutate, TOWER_DEFS[t.kind].color); // land burst
    this.pushSfx('place');
    this.selectPlacedTower(t.id); // returns to Inspect automatically
    if (gameEvents.hasListeners('towerPlaced')) gameEvents.emit('towerPlaced', { id: t.id, kind: t.kind, slot: t.slot });
    return 'ok';
  }

  /** Tower slots the player may build on right now: the permanent base (initial + Shard
   *  upgrades, frozen at construction) plus this run's temporary gene-card slots, each capped
   *  by its own ceiling (SLOTS.permanentMax / SLOTS.tempMax) and the physical slot count.
   *  Slots unlock in map.ts centre-out index order, so the available set stays symmetric
   *  whichever source granted the slot. See docs/SLOTS.md. */
  get unlockedSlots(): number {
    const temp = Math.min(SLOTS.tempMax, this.mods.bonusTowerSlots);
    return Math.min(towerSlots.length, this.permanentSlots + temp);
  }

  placeTower(kind: TowerKind, px: number, py: number): boolean {
    if (this.phase === 'won' || this.phase === 'lost') return false;
    const slot = slotAt(px, py);
    if (!slot) return false;
    if (slot.index >= this.unlockedSlots) return false; // slot still locked
    if (this.occupied.has(slot.index)) return false;
    const def = TOWER_DEFS[kind];
    if (this.biomass < def.cost) return false;
    this.biomass -= def.cost;
    this.occupied.add(slot.index);
    this.towers.push({
      id: this.nextId++,
      kind,
      x: slot.x,
      y: slot.y,
      slot: slot.index,
      cooldown: 0,
      overcharged: false,
      bornAt: this.time,
      disabledUntil: 0,
      branchId: null,
      tier: 0,
      pulseCd: 0,
      mutatedAt: -100, // never mutated ⇒ no grow-in / flash (a fresh, unbranched silhouette)
      movedAt: -100, // never relocated ⇒ no landing-impact FX
    });
    this.statTowerBuilds[kind]++; // lifetime-stats observation
    this.recomputeTowerCaches();
    this.pushSfx('place');
    if (gameEvents.hasListeners('towerPlaced')) gameEvents.emit('towerPlaced', { id: this.nextId - 1, kind, slot: slot.index });
    // Auto-start: the FIRST tower of the opening prep (before any wave) buys a longer setup
    // window, so an auto-start doesn't fire before the player finishes their opening build.
    if (this.autoStart && this.waveIndex === 0 && this.towers.length === 1) {
      this.prepCountdown = AUTO_START_FIRST_DELAY;
    }
    return true;
  }

  /** Grant `n` additional TEMPORARY tower slots for this run — the future hook for in-run slot
   *  rewards (events, boss drops, …) beyond the Reclaimed Node gene card. Run-only (not saved)
   *  and capped at SLOTS.tempMax by the `unlockedSlots` getter; permanent slots come from the
   *  Hive Emplacements Shard upgrade (meta.bonusSlots) instead. See docs/SLOTS.md. */
  unlockSlots(n: number): void {
    this.mods.bonusTowerSlots += n;
  }

  /** Enemy-HP multiplier for a 0-based wave index: the base escalation curve × the universal
   * difficulty's health scalar. At Standard (×1) this equals the base curve exactly. */
  private hpMultFor(idx0: number): number {
    return (1 + WAVE_HP_GROWTH * idx0) * this.diff.enemyHealthMult * this.mods.enemyHpRunMult;
  }

  /** Bounty/biomass multiplier for a 0-based wave index: base curve × difficulty reward. */
  private bountyMultFor(idx0: number): number {
    return (1 + WAVE_BOUNTY_GROWTH * idx0) * this.diff.rewardMult;
  }

  // ── Endless intensity curves (docs/ENDLESS-SCALING.md). Kept SEPARATE from the linear stage
  //    curves above so the authored golden run is byte-identical; these apply ONLY in endless. ──

  /** Endless enemy-HP multiplier — GEOMETRIC, the PRIMARY wall (outpaces any fixed DPS over depth). */
  private endlessHpMult(depth: number): number {
    return Math.pow(ENDLESS.hpGrowth, depth - 1) * this.diff.enemyHealthMult * this.mods.enemyHpRunMult;
  }

  /** Endless per-enemy bounty — rises SLOWER than HP, so deep enemies are biomass-inefficient. */
  private endlessBountyMult(depth: number): number {
    return (1 + ENDLESS.bountyGrowth * (depth - 1)) * this.diff.rewardMult;
  }

  /** Endless enemy-speed multiplier — gradual, clamped so the field stays readable. */
  private endlessSpeedMult(depth: number): number {
    return Math.min(ENDLESS.speedCap, 1 + ENDLESS.speedGrowth * (depth - 1));
  }

  /** Endless enemy-damage multiplier — gradual, continuous. */
  private endlessDamageMult(depth: number): number {
    return 1 + ENDLESS.damageGrowth * (depth - 1);
  }

  /** Composite tower-damage multiplier from the active KEYSTONES (Last Stand, Famine,
   * Swarm). Returns exactly 1 when none are equipped, so combineMult stays bit-identical
   * (the golden invariant) — every branch is gated on its neutral value. */
  private keystoneTowerDmgMult(): number {
    const m = this.mods;
    let out = 1;
    if (m.lastStandThreshold > 0 && this.integrity <= m.lastStandThreshold * this.maxIntegrity) out *= m.lastStandMult;
    if (m.damagePerEmptySlot > 0) out *= 1 + m.damagePerEmptySlot * Math.max(0, this.unlockedSlots - this.towers.length);
    if (m.damagePerTower > 0) out *= 1 + m.damagePerTower * this.towers.length;
    if (m.diversityBonus > 0) {
      const classes = new Set<string>();
      for (const t of this.towers) classes.add(TOWER_DEFS[t.kind].combatClass);
      out *= 1 + m.diversityBonus * classes.size; // rewards a varied board (which fuels reactions)
    }
    return out;
  }

  // ── Biome hooks (docs/BIOMES.md). All reduce to identity under NEUTRAL_BIOME (Stage mode). ──
  /** Tower fire-rate factor: the biome's steady modifier × its active hazard pulse (1 in Stage). */
  private biomeTowerRate(): number {
    const m = this.activeBiome.mods;
    return m.towerFireRateMult * (hazardActive(this.activeBiome, this.time) ? m.hazard.towerRateMult : 1);
  }
  /** Enemy-speed factor from the active hazard pulse only (the steady biome speed is baked at spawn). */
  private biomeHazardEnemySpeed(): number {
    return hazardActive(this.activeBiome, this.time) ? this.activeBiome.mods.hazard.enemySpeedMult : 1;
  }
  /** Switch the active biome; on a CHANGE (Infinite transition) telegraph it (sting + render flash)
   *  so crossing into a new ecosystem is seen and heard (BIOMES.md §5). No-op when unchanged. */
  private enterBiome(b: Biome): void {
    if (b.id === this.activeBiome.id) return;
    this.activeBiome = b;
    this.biomeFlash = 1;
    this.pushSfx('biome');
  }

  startWave(): void {
    if (this.phase !== 'prep') return;
    if (this.mode === 'endless') {
      this.startEndlessWave();
      return;
    }
    if (this.waveIndex >= this.totalWaves) return;
    this.waveIndex++;
    const def = this.waves[this.waveIndex - 1];
    const idx0 = this.waveIndex - 1;
    // The Spawn Director schedules the scripted wave; difficulty's spawn-rate knob (×1 at
    // Standard) tightens spacing. Byte-identical to the former inline loop at the defaults.
    this.spawnQueue = this.spawner.scheduleScripted(
      def,
      this.time,
      this.hpMultFor(idx0),
      this.bountyMultFor(idx0),
      this.diff.spawnRateMult,
    );
    // Campaign: framework bosses aren't enemy-kinds, so the Game spawns them — the selected boss
    // caps the finale wave, the mini-boss (if any) anchors a middle wave. Both escorted by chaff.
    if (this.stage) {
      if (this.waveIndex === this.totalWaves) this.spawnBoss(this.stage.boss);
      else if (this.stage.miniBoss && this.waveIndex === this.stage.miniBossWave) this.spawnBoss(this.stage.miniBoss);
    }
    this.applyRunEvent(this.waveIndex); // Run Identity: fold this wave's beat + anomaly (no-op in Stage)
    this.spawnedAll = false;
    this.waveStartIntegrity = this.integrity;
    this.phase = 'wave';
    this.pushSfx('wave');
    if (gameEvents.hasListeners('waveStarted')) gameEvents.emit('waveStarted', { wave: this.waveIndex, endless: false });
    if (this.relicHooks.length) this.fireRelicHooks('waveStarted', null); // relic battlefield rules
  }

  /** Endless wave: the AI Director composes spawns from a depth-scaled threat budget; the
   * Spawn Director lays them out on the endless cadence (incl. the swarm special event). */
  private startEndlessWave(): void {
    this.waveIndex++; // = Depth
    const depth = this.waveIndex;
    this.enterBiome(biomeForDepth(depth)); // Infinite: rotate ecosystems as the run goes deep
    const w = this.director!.next(depth, this.activeBiome);
    // Endless uses its OWN intensity curves (geometric HP, gradual bounty) — NOT the linear stage
    // curve — so the wall behaves as docs/ENDLESS-SCALING.md describes. Speed/damage are applied
    // per-enemy in spawnOne (also mode-gated), keyed on this depth.
    this.spawnQueue = this.spawner.scheduleDirected(
      w,
      this.time,
      this.endlessHpMult(depth),
      this.endlessBountyMult(depth),
      this.diff.spawnRateMult,
    );
    this.spawnedAll = false;
    this.waveStartIntegrity = this.integrity;
    this.phase = 'wave';
    if (w.spawnBoss) this.spawnProceduralBoss(depth);
    this.applyRunEvent(depth); // Run Identity: fold this depth's beat + anomaly
    this.pushSfx('wave');
    if (gameEvents.hasListeners('waveStarted')) gameEvents.emit('waveStarted', { wave: depth, endless: true });
  }

  /** Run Identity (docs/RUN-IDENTITY.md): fold this wave's scheduled event + the run anomaly onto the
   *  freshly-scheduled spawn queue (buff HP/bounty, promote elites, inflate/thin counts, inject an
   *  out-of-biome group) and spawn any ambush boss. Uses the DEDICATED runEventRng so the base run is
   *  unperturbed; a no-op when the plan is null (Stage) ⇒ golden-safe. Sets the HUD telegraph. */
  private applyRunEvent(wave: number): void {
    this.activeRunEvent = null;
    if (!this.runPlan) return;
    const { event, effect } = planForWave(this.runPlan, wave);
    const q = this.spawnQueue;
    if (effect.hpMult) for (const s of q) s.hpMult *= effect.hpMult;
    if (effect.bountyMult) for (const s of q) s.bountyMult *= effect.bountyMult;
    if (effect.eliteAll) for (const s of q) s.elite = true;
    else if (effect.eliteChance) for (const s of q) { if (this.runEventRng.next() < effect.eliteChance) s.elite = true; }
    if (effect.countMult && effect.countMult !== 1) this.scaleSpawnCount(effect.countMult);
    if (effect.injectKind) this.injectSpawnGroup(effect.injectKind, effect.injectCount ?? 6, !!effect.eliteAll);
    if (effect.boss) {
      const scale = this.stage ? this.stage.stage : this.waveIndex;
      const tier = effect.boss === 'major' ? Math.max(2, scale + 1) : Math.max(1, Math.round(scale * 0.6));
      this.spawnBoss(assembleBoss(() => this.runEventRng.next(), tier, this.activeBiome.mods.bossChassisBias));
    }
    if (event) {
      this.activeRunEvent = { name: event.def.name, desc: event.def.desc, kind: event.def.kind };
      this.pushSfx('boss'); // a telegraph sting so the beat is felt, not just seen
    }
  }

  /** Duplicate a share of the queued spawns (Swarm; mult>1) or thin them (Dead Calm; mult<1), keeping
   *  at least the first spawn. Deterministic on runEventRng. */
  private scaleSpawnCount(mult: number): void {
    if (mult >= 1) {
      const extra = mult - 1;
      const clones: QueuedSpawn[] = [];
      for (const s of this.spawnQueue) if (this.runEventRng.next() < extra) clones.push({ ...s, at: s.at + 0.3 });
      if (clones.length) { for (const c of clones) this.spawnQueue.push(c); this.spawnQueue.sort((a, b) => a.at - b.at); }
    } else {
      const drop = 1 - mult;
      this.spawnQueue = this.spawnQueue.filter((_, i) => i === 0 || this.runEventRng.next() >= drop);
    }
  }

  /** Inject an out-of-biome group into the current wave window (Rare Invasion). */
  private injectSpawnGroup(kind: EnemyKind, count: number, elite: boolean): void {
    const q = this.spawnQueue;
    const base = q.length ? q[0].at : this.time + 1;
    const hp = q.length ? q[0].hpMult : 1;
    const bounty = q.length ? q[0].bountyMult : 1;
    for (let i = 0; i < count; i++) q.push({ kind, at: base + 1 + i * 0.4, hpMult: hp, bountyMult: bounty, elite: elite || undefined });
    q.sort((a, b) => a.at - b.at);
  }

  chooseCard(id: string): void {
    if (this.phase !== 'draft' || !this.draft) return;
    const card = this.draft.find((c) => c.id === id);
    if (card) {
      applyCard(card, this.cardContext());
      // Behavioral verbs (grant/hook) fold into the live sim arrays too — a drafted card can
      // add a projectile mutator / battlefield rule mid-run, not just at boot (equipment).
      for (const e of card.effects) if (e.op === 'grant' || e.op === 'hook') this.collectRunVerb(e);
      this.chosenCards.push(cardToOption(card));
      this.pushSfx('draft');
      if (gameEvents.hasListeners('cardChosen')) gameEvents.emit('cardChosen', { id: card.id, rarity: card.rarity });
    }
    this.draft = null;
    this.phase = 'prep';
    this.prepCountdown = AUTO_START_DELAY; // fresh countdown for the new prep
  }

  /** Toggle auto-start (the next wave fires automatically after a prep countdown). */
  setAutoStart(on: boolean): void {
    this.autoStart = on;
    if (on) this.prepCountdown = AUTO_START_DELAY; // start a fresh countdown when enabling
  }

  private cardContext(): CardContext {
    return {
      mods: this.mods,
      grantBiomass: (n) => {
        this.biomass += n;
        this.statBiomassEarned += n;
      },
      grantIntegrity: (n) => {
        this.maxIntegrity += n;
        this.integrity += n;
      },
      healHero: (n) => {
        const h = this.primaryHero;
        h.maxHp += n;
        h.hp += n;
      },
    };
  }

  // ── Tick loop ────────────────────────────────────────────────────────────

  /** The sim does not advance while drafting or after the run has ended. */
  private get paused(): boolean {
    return this.phase === 'won' || this.phase === 'lost' || this.phase === 'draft';
  }

  advance(dtReal: number): void {
    if (this.paused) return;
    if (this.biomeFlash > 0) this.biomeFlash = Math.max(0, this.biomeFlash - dtReal * 0.7); // render-only transition ease (~1.4s)
    const scale = this.timeScale;
    this.acc += Math.min(dtReal * scale, 0.25 * scale); // clamp avoids spiral-of-death
    const cap = 8 * Math.max(1, Math.ceil(scale)); // allow extra steps when fast-forwarding
    let steps = 0;
    while (this.acc >= SIM_DT && steps < cap) {
      this.step(SIM_DT);
      this.acc -= SIM_DT;
      steps++;
      if (this.paused) break; // step() may have ended the wave/run
    }
  }

  private step(dt: number): void {
    // ── Combat→Build SETTLE beat ── the wave is cleared and the simulation is PAUSED: the sim
    // clock, run-buff + minion timers, and every combat system are frozen, so all downstream
    // deterministic state (enemy steering jitter keyed off `this.time`, the spawn schedule, buff
    // durations…) is identical to a no-settle run and the golden seeds don't move. Only the
    // battlefield's VISUAL wind-down runs: in-flight shots coast out and FADE, particles + floats
    // dissipate (all driven by the frame `dt`, not the sim clock). endWave() reveals the draft /
    // win once the beat elapses. (Acid pools + the hero resume in the prep/draft branch below.)
    if (this.phase === 'wave' && this.settleTimer > 0) {
      this.settleTimer -= dt;
      this.projectileSystem(dt);
      this.floatSystem(dt);
      this.particleSystem(dt);
      if (this.settleTimer <= 0) this.endWave();
      return;
    }
    this.time += dt;
    if (this.runBuffs.length > 0) this.tickRunBuffs(dt); // no-op (skipped) on the golden path
    if (this.minions.length > 0) this.minionSystem(dt); // empty on the golden path → skipped
    if (this.phase === 'wave') {
      this.spawnSystem();
      this.rebuildGrid(); // one O(n) rebuild feeds every proximity query this tick
      if (this.bossCount > 0) this.bossSystem(dt); // no-op cost when no boss is present
      this.economySystem(dt);
      this.emergencySystem(dt); // before towers: builds the in-zone set towers may override to
      this.towerSystem(dt);
      this.projectileSystem(dt);
      this.poolSystem(dt);
      this.statusSystem(dt);
      this.enemyAbilitySystem(dt); // regen / support auras / summons (no-op for trait-less enemies)
      this.enemyMoveSystem(dt);
      this.heroSystem(dt);
      this.deathSystem();
      this.floatSystem(dt);
      this.particleSystem(dt);
      this.checkWaveEnd();
      if (this.integrity <= 0) {
        this.integrity = 0;
        this.phase = 'lost';
      }
    } else {
      // prep / draft: hero still roams; no spawns/economy/loss (overcharge is cached on
      // placement). Combat RESIDUE keeps winding down — projectiles coast out + fade, acid pools
      // dissipate — so nothing freezes mid-air into the build phase. No enemies ⇒ no RNG/damage
      // (and autoplay never advances in these phases, so the golden run is byte-identical).
      this.emergencySystem(dt); // no enemies here → eases the emergency visuals back to rest
      this.projectileSystem(dt);
      this.poolSystem(dt);
      this.heroSystem(dt);
      this.floatSystem(dt);
      this.particleSystem(dt);
      // Auto-start: count the prep timer down to the next wave when the player enabled it. Off
      // by default ⇒ the manual-start golden run is byte-identical; consumes no rng.
      if (this.autoStart && this.phase === 'prep') {
        this.prepCountdown -= dt;
        if (this.prepCountdown <= 0) this.startWave();
      }
    }
  }

  /** Rebuild the per-tick spatial index + id map from the live enemy list. */
  private rebuildGrid(): void {
    this.grid.clear();
    this.enemyById.clear();
    for (const e of this.enemies) {
      if (!e.alive) continue;
      this.grid.insert(e);
      this.enemyById.set(e.id, e);
    }
  }

  // ── Systems ──────────────────────────────────────────────────────────────

  private spawnSystem(): void {
    while (this.spawnQueue.length > 0 && this.spawnQueue[0].at <= this.time) {
      const q = this.spawnQueue.shift()!;
      this.spawnOne(q.kind, q.hpMult, q.bountyMult, q.elite === true);
    }
    if (this.spawnQueue.length === 0) this.spawnedAll = true;
  }

  private spawnOne(kind: EnemyKind, hpMult: number, bountyMult: number, elite = false): void {
    if (this.enemies.length >= PERF.maxEnemies) return; // entity budget
    const def = ENEMY_DEFS[kind];
    const spawn = topSpawn(this.rng.next());
    // Director-promoted elites are buffed in place (no new archetype) — endless only,
    // so a stage run (elite=false) is byte-identical.
    const eHp = elite ? DIRECTOR.eliteHpMult : 1;
    const eDmg = elite ? DIRECTOR.eliteDmgMult : 1;
    const eBounty = elite ? DIRECTOR.eliteBountyMult : 1;
    // Biome enemy modifiers (docs/BIOMES.md) — baked once at spawn so a unit keeps its BIRTH
    // biome's stats after an Infinite transition. Identity under NEUTRAL_BIOME ⇒ golden-safe.
    const bm = this.activeBiome.mods;
    const hp = def.hp * hpMult * eHp * bm.enemyHpMult;
    // Endless-only intensity: enemies get gradually faster + hit harder with depth. Mode-gated so a
    // stage spawn is byte-identical (×1). Keyed on the current depth (= waveIndex during this wave).
    const endless = this.mode === 'endless';
    const eSpeed = endless ? this.endlessSpeedMult(this.waveIndex) : 1;
    const eDmgWave = endless ? this.endlessDamageMult(this.waveIndex) : 1;
    this.enemies.push({
      id: this.nextId++,
      kind,
      x: spawn.x,
      y: spawn.y,
      hp,
      maxHp: hp,
      baseArmor: def.armor + bm.enemyArmorBonus,
      speed: def.speed * eSpeed * this.stageSpeedMult * bm.enemySpeedMult, // ×endless depth ×campaign per-stage ×biome (all ×1 otherwise → golden-safe)
      bounty: def.bounty * bountyMult * eBounty * bm.bountyMult,
      damage: def.damage * eDmg * this.diff.enemyDamageMult * eDmgWave * bm.enemyDamageMult,
      fracture: 0,
      corrosion: 0,
      shredFlash: 0,
      hitFlash: 0,
      dmgAccum: 0,
      dmgTimer: 0,
      infection: 0,
      disrupt: 0,
      alive: true,
      lastHitKind: null,
      boss: null,
      elite,
      // Role-trait runtime (undefined for the trait-less historical roster → golden-safe).
      shield: def.shieldHp,
      summonCd: def.summon?.interval,
      siegeCd: def.siege?.interval,
    });
  }

  /**
   * Spawn a framework boss (boss.ts) — a composed encounter, not a big enemy. It
   * enters with a BossRuntime the bossSystem drives through phases/modules. Used by
   * the director / endless / debug — never in the authored golden waves.
   */
  spawnBoss(def: BossDef): void {
    const hp = BOSS.baseHp * def.hpMult;
    this.procBosses.set(def.id, def); // ensure bossSystem can always resolve this boss's def
    this.bossCount++;
    this.enemies.push({
      id: this.nextId++,
      kind: 'tyrant', // borrows the boss-tier visual; behavior is driven by the runtime
      x: topSpawn(this.rng.next()).x,
      y: 8,
      hp,
      maxHp: hp,
      baseArmor: 14,
      speed: CHASSIS[def.chassis].speed,
      bounty: def.bounty,
      damage: def.damage,
      fracture: 0,
      corrosion: 0,
      infection: 0,
      disrupt: 0,
      shredFlash: 0,
      hitFlash: 0,
      dmgAccum: 0,
      dmgTimer: 0,
      alive: true,
      lastHitKind: null,
      elite: false,
      boss: {
        defId: def.id,
        name: def.name,
        phase: 0,
        phases: def.phases.length,
        moduleCd: def.modules.map((m) => m.cooldown * 0.6), // first cast comes a little early
        shielded: 0,
        enrage: 0,
        channel: 0,
        charge: 0,
        telegraph: null,
      },
    });
  }

  /**
   * Drive every framework boss: HP-gated phase transitions + telegraphed module
   * abilities (summon adds, enrage ramp, shield windows, Nucleus channel). Only
   * called when a boss is on the field, so normal runs pay nothing.
   */
  private bossSystem(dt: number): void {
    for (const e of this.enemies) {
      const b = e.boss;
      if (!b || !e.alive) continue;
      const def = bossDef(b.defId) ?? this.procBosses.get(b.defId);
      if (!def) continue;

      // phase transition (HP-gated) — advancing resets shield/telegraph (no snowball).
      const hpFrac = e.hp / e.maxHp;
      while (b.phase + 1 < def.phases.length && hpFrac <= def.phases[b.phase + 1].threshold) {
        b.phase++;
        b.shielded = 0;
        b.telegraph = 'PHASE SHIFT';
      }
      const phase = def.phases[b.phase];

      if (b.shielded > 0) b.shielded = Math.max(0, b.shielded - dt);
      if (b.channel > 0) {
        b.channel -= dt;
        b.telegraph = 'CHANNELING';
        if (b.channel <= 0) {
          // the cast lands on the Nucleus unless the boss died mid-cast
          const chan = def.modules.find((m) => m.kind === 'channeler');
          if (chan && !this.god) this.integrity = Math.max(0, this.integrity - (chan.amount ?? 12));
          this.floats.push({ x: nucleusPoint.x, y: nucleusPoint.y - 16, text: 'BREACH!', color: '#ff5d73', life: 1 });
          b.telegraph = null;
        }
      } else if (b.shielded <= 0) {
        b.telegraph = null;
      }

      // tick + fire the phase's active modules
      for (const mi of phase.modules) {
        b.moduleCd[mi] -= dt;
        if (b.moduleCd[mi] > 0) continue;
        const m = def.modules[mi];
        b.moduleCd[mi] = m.cooldown;
        switch (m.kind) {
          case 'spawner':
            if (this.enemies.length < PERF.maxEnemies) {
              const n = m.amount ?? 3;
              for (let i = 0; i < n; i++) this.spawnNear(m.addKind ?? 'runner', e.x, e.y);
              b.telegraph = 'SUMMON';
            }
            break;
          case 'enrager':
            b.enrage++;
            e.speed *= 1.06;
            b.telegraph = 'ENRAGE';
            break;
          case 'shieldphase':
            b.shielded = m.duration ?? 3;
            b.telegraph = 'SHIELDED';
            break;
          case 'channeler':
            if (b.channel <= 0) b.channel = m.duration ?? 3;
            break;
          case 'charger':
            b.charge = m.duration ?? 1.4; // a telegraphed dash toward the line
            b.telegraph = 'CHARGE';
            break;
          case 'suppressor':
            this.suppressTowers(e, m.radius ?? 120, m.duration ?? 4); // disable nearby towers
            b.telegraph = 'SUPPRESS';
            break;
        }
      }
      if (b.charge > 0) {
        b.charge = Math.max(0, b.charge - dt); // count the dash window down
        if (b.charge > 0 && b.channel <= 0 && b.shielded <= 0) b.telegraph = 'CHARGE';
      }
      if (phase.speedMult && b.enrage === 0) e.speed = CHASSIS[def.chassis].speed * phase.speedMult;
    }
  }

  /** Boss suppressor module: disable every tower within `radius` for `duration` seconds. */
  private suppressTowers(boss: Enemy, radius: number, duration: number): void {
    const r2 = radius * radius;
    for (const t of this.towers) {
      if (dist2(boss.x, boss.y, t.x, t.y) <= r2) t.disabledUntil = Math.max(t.disabledUntil, this.time + duration);
    }
  }

  /** Spawn a normal enemy at a position (boss adds). */
  private spawnNear(kind: EnemyKind, x: number, y: number): void {
    if (this.enemies.length >= PERF.maxEnemies) return;
    const def = ENEMY_DEFS[kind];
    this.enemies.push({
      id: this.nextId++, kind, x: Math.max(12, Math.min(WIDTH - 12, x + (this.rng.next() - 0.5) * 60)), y: y + 12,
      hp: def.hp, maxHp: def.hp, baseArmor: def.armor, speed: def.speed, bounty: def.bounty, damage: def.damage,
      fracture: 0, corrosion: 0, infection: 0, disrupt: 0, shredFlash: 0, hitFlash: 0, dmgAccum: 0, dmgTimer: 0, alive: true, lastHitKind: null, boss: null, elite: false,
      shield: def.shieldHp, summonCd: def.summon?.interval, siegeCd: def.siege?.interval,
    });
  }

  private economySystem(dt: number): void {
    if (this.reactorCount > 0) {
      // Reactor STAR evolution (support-tower path): its kit scales biomass generation.
      const starBiomass = this.towerProgress.reactor.reactorBiomassMult ?? 1; // 1 for a fresh save
      let gain = this.reactorCount * ECON.reactorBiomassPerSec * this.mods.reactorBiomassMult * starBiomass * dt;
      // Per-instance BRANCH economy (TOWER-BRANCHES.md): a branched reactor's kit adds extra
      // biomass ON TOP of the base term (the base is untouched ⇒ an unbranched run is byte-
      // identical, golden-safe). Only branched reactors (tier > 0) contribute here.
      for (const t of this.towers) {
        if (t.kind === 'reactor' && t.tier > 0) {
          const bMult = resolveBranchKit(t.branchId, t.tier).reactorBiomassMult;
          if (bMult > 1) gain += ECON.reactorBiomassPerSec * this.mods.reactorBiomassMult * (bMult - 1) * dt;
        }
      }
      this.biomass += gain;
      this.statBiomassEarned += gain;
    }
  }

  /** Per-tick enemy ROLE abilities: self-regen, support auras, and summons. Every branch is
   * gated on a trait the historical seven don't carry, so this is a pure no-op for them (and
   * consumes no gameplay rng unless a summoner — never in the golden run — actually fires). */
  private enemyAbilitySystem(dt: number): void {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const def = ENEMY_DEFS[e.kind];
      // Regen = the enemy's own trait + the biome's ambient regen (Necrotic Mire). The biome term
      // is 0 under NEUTRAL_BIOME, so this is byte-identical to `def.regenPerSec` on the golden path.
      const regen = (def.regenPerSec ?? 0) + this.activeBiome.mods.enemyRegenFrac * e.maxHp;
      if (regen > 0) e.hp = Math.min(e.maxHp, e.hp + regen * dt); // Regenerating
      if (def.auraRadius) this.supportAura(e, def, dt); // Support
      if (def.summon) {
        e.summonCd = (e.summonCd ?? def.summon.interval) - dt; // Summoner
        if (e.summonCd <= 0) {
          e.summonCd = def.summon.interval;
          for (let i = 0; i < def.summon.count; i++) this.spawnNear(def.summon.kind, e.x, e.y);
        }
      }
    }
  }

  /** Project a Support enemy's aura onto nearby allies — heal and/or refresh a shield. */
  private supportAura(src: Enemy, def: EnemyDef, dt: number): void {
    const r = def.auraRadius as number;
    const r2 = r * r;
    this.grid.forNeighbors(src.x, src.y, r, (o) => {
      if (!o.alive || o === src || dist2(src.x, src.y, o.x, o.y) > r2) return;
      if (def.auraRegenPerSec) o.hp = Math.min(o.maxHp, o.hp + def.auraRegenPerSec * dt);
      if (def.auraShield) o.shield = Math.max(o.shield ?? 0, def.auraShield);
    });
  }

  /**
   * Recompute tower-layout caches (reactor count + per-tower overcharge flags).
   * Towers never move or die, so this only runs when a tower is placed — keeping
   * the economy + overcharge systems O(1) per tick instead of O(towers^2).
   */
  private recomputeTowerCaches(): void {
    const reactors: TowerSlot[] = [];
    for (const t of this.towers) {
      if (t.kind === 'reactor') reactors.push(towerSlots[t.slot]);
    }
    this.reactorCount = reactors.length;
    // The reactor's SUPPORT RADIUS (docs/RANGE.md §8): its effective range (base × the
    // "+support radius" mastery). A non-reactor tower whose centre lies within that radius of
    // any reactor is overcharged. At the base 90px this catches orthogonal lattice neighbours
    // (80px) and excludes diagonals (≈113px) — reproducing the former slot-adjacency exactly —
    // and the upgrade widens the reach to support farther towers.
    const supportR2 = this.towerEffectiveRange.reactor * this.towerEffectiveRange.reactor;
    for (const t of this.towers) {
      if (t.kind === 'reactor') {
        t.overcharged = false;
        continue;
      }
      const slot = towerSlots[t.slot];
      let oc = false;
      for (const rc of reactors) {
        if (dist2(rc.x, rc.y, slot.x, slot.y) <= supportR2) {
          oc = true;
          break;
        }
      }
      t.overcharged = oc;
    }
  }

  /** Emergency Defense Mode (docs/RANGE.md §4). Recompute — ONCE per tick, shared by every
   * tower — the enemies inside the Final Defense Zone, ordered nearest-to-core. When that set
   * is non-empty the Hive is in emergency: every offensive tower may override its range to
   * focus the breach (see pickTargets). Also eases the render-only intensity/focus. O(enemies).*/
  private emergencySystem(dt: number): void {
    const list = this.emergencyEnemies;
    list.length = 0;
    for (const e of this.enemies) {
      if (e.alive && inFinalDefenseZone(e.y)) list.push(e);
    }
    // Priority 2: nearest enemy to the Hive Core first (priority 1 — being in-zone — is the
    // membership test above). The list is just the leakers, so this sort is cheap.
    if (list.length > 1) {
      const cx = nucleusPoint.x;
      const cy = nucleusPoint.y;
      list.sort((a, b) => (a.x - cx) ** 2 + (a.y - cy) ** 2 - ((b.x - cx) ** 2 + (b.y - cy) ** 2));
    }
    this.emergencyActive = list.length > 0;
    if (this.emergencyActive) {
      this.emergencyFocusX = list[0].x;
      this.emergencyFocusY = list[0].y;
    }
    // Render-only ease: snap in fast (alarm), relax out slow. Never read by the sim, so it
    // cannot perturb a fixed-seed outcome.
    const target = this.emergencyActive ? 1 : 0;
    const rate = this.emergencyActive ? 8 : 3;
    this.emergencyRamp += (target - this.emergencyRamp) * Math.min(1, rate * dt);
  }

  private towerSystem(dt: number): void {
    const ksDmg = this.keystoneTowerDmgMult(); // run-wide keystone damage (1 = none); per-tick
    const runBuffDmg = this.runBuffMult('towerDamage'); // timed run buff (1 = none); bit-identical when off
    // Class resonance: the fielded hero's combat class amplifies same-class towers (off at 0).
    const resoClass = this.mods.classResonanceBonus > 0 ? HERO_DEFS[this.heroes[0].kind].combatClass : null;
    for (const t of this.towers) {
      const def = TOWER_DEFS[t.kind];
      this.masteryAccrual[t.kind].activeTime += dt; // usage signal (every deployed tower)
      if (def.firing === 'support') {
        if (t.tier > 0) this.supportBranchPulse(t, dt); // branched reactor: pulse its mutations
        continue; // base economy/overcharge handled in economySystem
      }
      if (this.time < t.disabledUntil) continue; // suppressed by a boss — can't fire
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const prog = this.towerProgress[t.kind]; // permanent per-kind buffs (stars + mastery)
      // Per-instance branch upgrade kit (TOWER-BRANCHES.md). Null when unbranched ⇒ every
      // fold below reduces to the base path ⇒ golden byte-identical (autoplay never branches).
      const bk = t.tier > 0 ? resolveBranchKit(t.branchId, t.tier) : null;
      // Bonus math flows through the universal modifier framework (combineMult — the
      // canonical multiplier fold, bit-identical to the previous a*b*c product).
      const ocRate = t.overcharged ? 1 + ECON.overchargeRate : 1;
      // Reactor STAR evolution: its kit adds to the overcharge it projects onto neighbors.
      const starOc = this.towerProgress.reactor.reactorOverchargeBonus ?? 0; // 0 for a fresh save
      const ocDmg = t.overcharged ? 1 + ECON.overchargeDamage + this.mods.reactorOverchargeBonus + starOc : 1;
      // SUPPORT gear: a hero aura hastes/empowers towers within range (×1 ⇒ golden-safe without aura gear).
      let heroHaste = 1;
      let heroDmgAura = 1;
      if (this.mods.heroAuraRadius > 0) {
        const r2 = this.mods.heroAuraRadius * this.mods.heroAuraRadius;
        // A tower is buffed if near ANY living hero projecting the aura (per-roster; single-hero
        // iterates just the primary ⇒ byte-identical golden run).
        if (this.heroes.some((ph) => !ph.down && dist2(t.x, t.y, ph.x, ph.y) <= r2)) {
          heroHaste = 1 + this.mods.heroTowerHasteAura;
          heroDmgAura = 1 + this.mods.heroTowerDamageAura;
        }
      }
      // Biome efficiency (docs/BIOMES.md): a per-combat-class damage × that shifts which class
      // shines, and a fire-rate × (steady + hazard pulse). Applied OUTSIDE combineMult so the
      // identity (×1 under NEUTRAL_BIOME) is IEEE-exact ⇒ Stage mode stays byte-identical.
      const biomeClassDmg = this.activeBiome.mods.towerClassMult[def.combatClass] ?? 1;
      const rateMult = combineMult(this.mods.towerFireRateMult, prog.fireRateMult, ocRate, heroHaste, bk ? bk.fireRateMult : 1) * this.biomeTowerRate();
      const reso = resoClass !== null && def.combatClass === resoClass ? 1 + this.mods.classResonanceBonus : 1;
      const dmgMult = combineMult(this.mods.towerDamageMult, prog.damageMult, ocDmg, ksDmg, reso, heroDmgAura, runBuffDmg, bk ? bk.damageMult : 1) * biomeClassDmg;
      // The tower's attack is a list of reusable AbilityComponents (data), run by the
      // shared executor — no per-firing branches. The targeting profile drives which
      // enemies its projectiles pick; cooldown resets only if it acted (no target = wait).
      this.abilitySourceKind = t.kind;
      this.abilityHeroKind = null;
      this.abilityCaster = null;
      // Star evolution: targeting override + per-cast projectile/splash kit (defaults = base).
      this.abilityTargeting = bk?.targeting ?? prog.targeting ?? def.targeting ?? 'closestToBase';
      this.castExtraProjectiles = (prog.extraProjectiles ?? 0) + (bk?.extraProjectiles ?? 0);
      this.castSplashMult = (prog.splashMult ?? 1) * (bk?.splashMult ?? 1);
      this.castRangeMult = (prog.rangeMult ?? 1) * (bk?.rangeMult ?? 1);
      this.castProjectileMutators =
        bk && bk.projectileMutators.length
          ? [...(prog.projectileMutators ?? EMPTY_STR), ...bk.projectileMutators]
          : prog.projectileMutators ?? EMPTY_STR;
      this.castProjectileSkin = bk ? t.branchId ?? undefined : undefined; // branch shot-skin (renderer-only)
      this.castProjectileSkinTier = bk ? t.tier : 0; // branch shot-tier (renderer-only; drives projectile evolution)
      this.castScratch.x = t.x;
      this.castScratch.y = t.y;
      this.castScratch.damageMult = dmgMult;
      this.castScratch.target = null;
      this.castScratch.pierce = 0;
      let acted = runAbilities(this.actx, TOWER_ABILITIES[t.kind], this.castScratch);
      // Star-granted attacks (auras / chains / debuffs) run on the same cadence as the base.
      if (prog.extraAbilities) acted = runAbilities(this.actx, prog.extraAbilities, this.castScratch) || acted;
      // Branch-granted attacks (shrapnel crits, infection, neural bolts …) on the same cadence.
      if (bk && bk.extraAbilities.length) acted = runAbilities(this.actx, bk.extraAbilities, this.castScratch) || acted;
      if (acted) {
        t.cooldown = def.fireInterval / rateMult;
        // Branch sensory signature (TOWER-BRANCHES.md §1): a muzzle spray + sound on every shot.
        // Cosmetic only (FX rng + sfx queue) ⇒ golden-safe; bk is null on the unbranched/autoplay path.
        if (bk) this.emitBranchSignature(bk, t.x, t.y - 6, t.tier);
      }
    }
    // Reset the per-cast kit so later systems (hero casts) see base values, not a tower's.
    this.castExtraProjectiles = 0;
    this.castSplashMult = 1;
    this.castRangeMult = 1;
    this.castProjectileMutators = EMPTY_STR;
    this.castProjectileSkin = undefined;
    this.castProjectileSkinTier = 0;
  }

  /** A branched SUPPORT tower (Flesh Reactor) runs its branch abilities — auras, summons,
   *  heals, buffs — on a fixed pulse cadence (it has no projectile attack loop). No-op when
   *  unbranched ⇒ golden-safe. Its branch ECONOMY (biomass/overcharge) folds in economySystem. */
  private supportBranchPulse(t: Tower, dt: number): void {
    const bk = resolveBranchKit(t.branchId, t.tier);
    // A branched reactor THROBS on a fixed cadence: it runs its offensive/economy mutations (if
    // any) and throws its sensory signature — even on an economy-only tier, so a Symbiotic Heart
    // visibly/audibly beats from its very first splice. Cosmetic emission is golden-safe.
    t.pulseCd -= dt;
    if (t.pulseCd > 0) return;
    t.pulseCd = SUPPORT_BRANCH_PULSE;
    if (bk.extraAbilities.length > 0) {
      this.abilitySourceKind = t.kind;
      this.abilityHeroKind = null;
      this.abilityCaster = null;
      this.abilityTargeting = 'closestToBase';
      this.castScratch.x = t.x;
      this.castScratch.y = t.y;
      this.castScratch.damageMult = this.mods.towerDamageMult * bk.damageMult;
      this.castScratch.target = null;
      this.castScratch.pierce = 0;
      runAbilities(this.actx, bk.extraAbilities, this.castScratch);
    }
    this.emitBranchSignature(bk, t.x, t.y, t.tier); // the reactor's pulse throws its branch matter too
  }

  /** Spray a branched tower's signature particle + sound on an attack/pulse, ESCALATED by tier
   *  (BRANCH-EVOLUTION.md §3a/§3d): a higher tier erupts denser, faster matter and a deeper cue,
   *  so every purchased upgrade visibly + audibly grows. Cosmetic only — the FX rng and sfx queue
   *  are independent of the gameplay rng, so this never perturbs the pinned sim (and bk is only
   *  ever passed for a branched tower, never on the golden path). */
  private emitBranchSignature(bk: ResolvedBranchKit, x: number, y: number, tier: number): void {
    const intensity = 1 + EVO.muzzleGrowth * Math.max(0, tier - 1);
    if (bk.particle) this.spawnParticles(x, y, PARTICLE[bk.particle], undefined, intensity);
    if (bk.sfx) this.pushSfx(bk.sfx, tier);
  }

  /** Branch-flavoured IMPACT burst where a branched shot LANDS (BRANCH-EVOLUTION.md §3c). The shot
   *  carries its branchId (skin) + tier; we resolve the kit's impact matter and spray it, scaled by
   *  tier. Cosmetic (FX rng) and only ever called for a branched shot (skin set), so the
   *  golden/autoplay path — which fires un-skinned shots — never reaches it. */
  private spawnBranchImpact(x: number, y: number, skin: string, tier: number): void {
    const bk = resolveBranchKit(skin, tier);
    const kind = bk.impact ?? bk.particle;
    if (!kind) return;
    const intensity = 1 + EVO.impactGrowth * Math.max(0, tier - 1);
    this.spawnParticles(x, y, PARTICLE[kind], undefined, intensity);
  }

  /** Up to `n` in-range enemies chosen by the tower's targeting profile (data-driven).
   * The default 'closestToBase' reproduces the historical goal-distance sort exactly. */
  private pickTargets(x: number, y: number, range: number, n: number, profile: TargetingProfile = 'closestToBase'): Enemy[] {
    // Emergency Defense Mode override (docs/RANGE.md §4): while an enemy is in the Final
    // Defense Zone, every OFFENSIVE TOWER ignores its range against in-zone enemies and
    // focuses the breach nearest the Hive Core. Scoped to tower casts — heroes (abilityHeroKind
    // set) and the Obelisk's control field (no target pick) are excluded. The shared, already
    // nearest-to-core-sorted list means no per-tower re-scan. Falls through to normal targeting
    // if every in-zone enemy died this tick (priority 3).
    if (this.emergencyActive && this.abilityHeroKind === null && this.abilitySourceKind !== null) {
      const focus = this.targetScratch;
      focus.length = 0;
      for (const e of this.emergencyEnemies) {
        if (!e.alive) continue;
        focus.push(e);
        if (focus.length >= n) break;
      }
      if (focus.length > 0) return focus.slice(0, n);
    }
    const r2 = range * range;
    const out = this.targetScratch;
    out.length = 0;
    this.grid.forNeighbors(x, y, range, (e) => {
      if (e.alive && dist2(x, y, e.x, e.y) <= r2) out.push(e);
    });
    sortByProfile(out, profile, { tx: x, ty: y, goalDistance: goalDistanceAt, rng: this.targetRng });
    return out.slice(0, n);
  }

  private projectileSystem(dt: number): void {
    for (const p of this.projectiles) {
      const step = p.speed * dt;
      // Fading out (lost its target): coast along the last heading while the renderer fades it,
      // then release — a graceful wind-down instead of an instant pop. Deals no damage / no rng.
      if (p.fade !== undefined) {
        p.fade -= dt / SETTLE.projectileFade; // opacity 1 → 0 over projectileFade seconds
        if (p.fade <= 0) {
          p.alive = false;
          continue;
        }
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const d = Math.hypot(dx, dy);
        if (d > step) {
          p.x += (dx / d) * step;
          p.y += (dy / d) * step;
        }
        continue;
      }
      if (p.behavior === 'homing' || p.behavior === 'parasite') {
        const target = this.enemyById.get(p.targetId); // O(1) homing lookup
        if (!target || !target.alive) {
          p.fade = 1; // target gone → coast out + fade gracefully (was an instant pop)
          continue;
        }
        p.tx = target.x;
        p.ty = target.y;
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const d = Math.hypot(dx, dy); // one sqrt for both the arrival test and the move
        if (d <= step + COMBAT.projectileHitEpsilon) {
          this.applyDamage(target, p.damage, p.sourceKind);
          if (p.behavior === 'parasite') {
            this.infect(target, STATUS.infectionOnHit); // Viral payload (no Fracture)
          } else {
            this.addFracture(target, 1);
            this.maybeReact(target);
          }
          this.pushSfx('hit');
          if (p.skin) this.spawnBranchImpact(p.x, p.y, p.skin, p.skinTier ?? 1); // branch-flavoured landing (cosmetic; un-skinned golden shots skip it)
          if (gameEvents.hasListeners('projectileHit')) gameEvents.emit('projectileHit', { x: p.x, y: p.y, damage: p.damage, targetId: p.targetId, byTower: p.sourceKind });
          // Pierce (mutators.ts): pass THROUGH to the next unhit foe instead of dying. A
          // projectile with no pierce (the default) dies here exactly as before (golden-safe).
          if (p.pierce && p.pierce > 0) {
            p.pierce -= 1;
            (p.hitIds ??= []).push(target.id);
            const next = this.nextPierceTarget(p);
            if (next) p.targetId = next.id;
            else p.alive = false;
          } else {
            p.alive = false;
          }
        } else {
          const k = step / d;
          p.x += dx * k;
          p.y += dy * k;
        }
      } else {
        // mortar: positional, splash on arrival
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const d = Math.hypot(dx, dy);
        if (d <= step + COMBAT.projectileHitEpsilon) {
          this.mortarImpact(p);
          p.alive = false;
        } else {
          const k = step / d;
          p.x += dx * k;
          p.y += dy * k;
        }
      }
    }
    const pr = this.projectiles;
    for (let i = pr.length - 1; i >= 0; i--) {
      if (!pr[i].alive) {
        this.releaseProjectile(pr[i]);
        pr[i] = pr[pr.length - 1];
        pr.pop();
      }
    }
  }

  private mortarImpact(p: Projectile): void {
    this.pushSfx('hit');
    if (p.skin) this.spawnBranchImpact(p.x, p.y, p.skin, p.skinTier ?? 1); // siege fireball / acid splash, by branch+tier
    if (gameEvents.hasListeners('projectileHit')) gameEvents.emit('projectileHit', { x: p.x, y: p.y, damage: p.damage, targetId: -1, byTower: p.sourceKind });
    const r2 = p.splash * p.splash;
    this.grid.forNeighbors(p.x, p.y, p.splash, (e) => {
      if (!e.alive) return;
      if (dist2(p.x, p.y, e.x, e.y) <= r2) {
        this.applyDamage(e, p.damage, p.sourceKind);
        e.corrosion = STATUS.corrosionDuration;
        if (this.mods.mortarAppliesFracture) this.addFracture(e, 1);
        this.maybeReact(e);
      }
    });
    this.pools.push({
      id: this.nextId++,
      x: p.x,
      y: p.y,
      radius: p.splash * STATUS.poolRadiusFactor,
      dps: STATUS.corrosionDps * this.mods.poolDpsMult,
      remaining: STATUS.poolDuration * this.mods.mortarPoolDurationMult,
      sourceKind: p.sourceKind,
    });
  }

  private poolSystem(dt: number): void {
    for (const pool of this.pools) {
      const r2 = pool.radius * pool.radius;
      this.grid.forNeighbors(pool.x, pool.y, pool.radius, (e) => {
        if (!e.alive) return;
        if (dist2(pool.x, pool.y, e.x, e.y) <= r2) {
          this.applyDamage(e, pool.dps * dt, pool.sourceKind, false); // DoT — credit mastery, no flash
          e.corrosion = STATUS.corrosionDuration;
          this.maybeReact(e);
        }
      });
      pool.remaining -= dt;
    }
    const ps = this.pools;
    for (let i = ps.length - 1; i >= 0; i--) {
      if (ps[i].remaining <= 0) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
      }
    }
  }

  private statusSystem(dt: number): void {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.corrosion > 0) {
        e.corrosion = Math.max(0, e.corrosion - dt);
        this.applyDamage(e, STATUS.corrosionDps * 0.5 * dt, null, false); // light DoT — no source, no flash
      }
      if (e.infection > 0) {
        // Viral: ramp toward the cap, then bleed armor-ignoring DoT scaled by stacks.
        e.infection = Math.min(STATUS.infectionMaxStacks, e.infection + STATUS.infectionRampPerSec * dt);
        this.applyInfectionDamage(e, e.infection * STATUS.infectionDpsPerStack * this.mods.parasiteInfectionMult * dt);
      }
      if (e.disrupt > 0) e.disrupt = Math.max(0, e.disrupt - dt); // Neural slow + vulnerability decays
      // Universal status framework: tick any generic effects (burn/poison/regen/…) and
      // apply this tick's deltas. Inert on the historical path (no framework statuses).
      // DoT is applied precisely (no per-tick floor) and scaled by vulnerability.
      if (e.statuses !== undefined && e.statuses.length > 0) {
        const fx = tickStatuses(e.statuses, dt);
        const dmg = (fx.dotDamage + fx.trueDamage) * this.vulnMult(e);
        if (dmg > 0) {
          e.hp -= dmg;
          e.dmgAccum += dmg;
          this.statDamageDealt += dmg;
        }
        if (fx.heal > 0) e.hp = Math.min(e.maxHp, e.hp + fx.heal);
      }
      if (e.shredFlash > 0) e.shredFlash = Math.max(0, e.shredFlash - dt);
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
      // Aggregated damage numbers: bank hits, pop a single readable total per beat.
      // Suppressed in heavy swarms (same LOD gate as enemy detail) to stay clean.
      if (e.dmgTimer > 0) e.dmgTimer = Math.max(0, e.dmgTimer - dt);
      if (e.dmgAccum >= 1 && e.dmgTimer <= 0 && this.enemies.length < PERF.lodEnemyCount) {
        this.floats.push({ x: e.x, y: e.y - 12, text: `${Math.round(e.dmgAccum)}`, color: '#ffe9a8', life: 0.55 });
        e.dmgAccum = 0;
        e.dmgTimer = FX.dmgFloatInterval;
      }
    }
  }

  /**
   * Threat-prioritized movement. Each enemy blends, per its behavior profile:
   * seek toward the base (flow field, or a straight line for flyers/burrowers that
   * ignore obstacles) + avoid tower kill-zones (steering toward undefended gaps to
   * PENETRATE) + react to the hero (skirt, or hunt if avoidHero<0) + separation +
   * organic wander. Emergent, data-driven, and ready for new archetypes.
   */
  private enemyMoveSystem(dt: number): void {
    const slowBase = STATUS.corrosionSlow + this.mods.corrosionSlowBonus;
    const sepR = MOVE.separationRadius;
    const sepR2 = sepR * sepR;
    const tR = STEER.towerAvoidRadius;
    const tR2 = tR * tR;
    const hR = STEER.heroAvoidRadius;
    const hR2 = hR * hR;
    const hero = this.primaryHero; // enemies steer around the lead hero
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (reachedBottom(e.y)) {
        this.hitNucleus(e);
        continue;
      }
      const def = ENEMY_DEFS[e.kind];
      // Artillery: advance to a standoff line, THEN halt and bombard the Nucleus. The
      // standoff is at least 2/3 of the way down the lane so towers can actually engage it;
      // `siege.range` is how far above the defense line it prefers to stop, clamped to that
      // 2/3 floor. Gated on `siege`, which the historical roster never sets, so those enemies
      // always advance normally. (The previous gate compared goalDistanceAt — a CELL-unit
      // path cost — against a PIXEL range, so it was ~always true and the artillery sniped the
      // core from the spawn edge, far outside any defensible range. This makes it commit.)
      if (def.siege) {
        const standoffY = Math.max(HEIGHT * (2 / 3), DEFENSE_TOP_Y - def.siege.range);
        if (e.y >= standoffY) {
          e.siegeCd = (e.siegeCd ?? def.siege.interval) - dt;
          if (e.siegeCd <= 0) {
            e.siegeCd = def.siege.interval;
            if (!this.god) this.integrity -= def.siege.damage;
            this.floats.push({ x: nucleusPoint.x, y: nucleusPoint.y - 18, text: `-${def.siege.damage}`, color: '#ff8a3d', life: 0.9 });
            this.pushSfx('breach');
          }
          continue; // standoff: it shells the core instead of advancing
        }
      }
      // Minion body-block: a friendly summon in contact halts the enemy and soaks its attack
      // (the blocker fantasy). Flying/burrowing enemies bypass it (their identity), and the
      // whole check is gated on minions existing ⇒ enemyMoveSystem is byte-identical on golden.
      if (this.minions.length > 0 && !def.behavior.flying && !def.behavior.burrowing && this.minionBlock(e, def, dt)) continue;
      const b = def.behavior;
      // Corrosion and Disruption both slow; take the stronger, capped at 0.85.
      let slow = 0;
      if (e.corrosion > 0) slow = slowBase;
      if (e.disrupt > 0) slow = Math.max(slow, STATUS.disruptSlow + this.mods.obeliskSlowBonus);
      let disabled = false;
      if (e.statuses !== undefined && e.statuses.length > 0) {
        const ag = aggregateStatuses(e.statuses); // framework Slow/Freeze/Stun fold in here
        slow = Math.max(slow, ag.slowPct);
        disabled = ag.disabled;
      }
      if (slow > 0.85) slow = 0.85;
      if (disabled) slow = 1; // hard control (Stun/Freeze) fully stops movement
      // Boss charger: a telegraphed dash multiplies movement this tick (null boss ⇒ ×1 ⇒ golden-safe).
      const chargeMult = e.boss && e.boss.charge > 0 ? BOSS.chargeSpeedMult : 1;
      // Biome hazard speed pulse (e.g. Firestorm) — transient, on top of the speed baked at spawn.
      // 1 when no hazard is active / Stage mode ⇒ golden-safe.
      const step = e.speed * chargeMult * this.biomeHazardEnemySpeed() * (1 - slow) * dt;

      // 1. seek
      let vx: number;
      let vy: number;
      if (b.flying || b.burrowing) {
        const dx = nucleusPoint.x - e.x;
        const dy = REACH_Y - e.y;
        const l = Math.hypot(dx, dy) || 1;
        vx = (dx / l) * b.seek;
        vy = (dy / l) * b.seek;
      } else {
        const dir = flowDirAt(e.x, e.y);
        vx = dir.x * b.seek;
        vy = dir.y * b.seek;
      }

      // 2. avoid defensive structures -> route toward gaps (penetration)
      if (b.avoidTowers !== 0) {
        for (const t of this.towers) {
          const d2 = dist2(e.x, e.y, t.x, t.y);
          if (d2 > 0 && d2 < tR2) {
            const d = Math.sqrt(d2);
            const w = ((tR - d) / tR) * b.avoidTowers;
            vx += ((e.x - t.x) / d) * w;
            vy += ((e.y - t.y) / d) * w;
          }
        }
      }

      // 3. react to the hero (skirt it; <0 would hunt it)
      if (b.avoidHero !== 0 && !hero.down) {
        const d2 = dist2(e.x, e.y, hero.x, hero.y);
        if (d2 > 0 && d2 < hR2) {
          const d = Math.sqrt(d2);
          const w = ((hR - d) / hR) * b.avoidHero;
          vx += ((e.x - hero.x) / d) * w;
          vy += ((e.y - hero.y) / d) * w;
        }
      }

      // 4. separation (spread instead of stacking) — grid-local, closure-free
      if (b.separation !== 0) {
        const near = this.neighborScratch;
        this.grid.queryInto(e.x, e.y, sepR, near);
        let sx = 0;
        let sy = 0;
        for (let k = 0; k < near.length; k++) {
          const o = near[k];
          if (o === e || !o.alive) continue;
          const d2 = dist2(e.x, e.y, o.x, o.y);
          if (d2 > 0 && d2 < sepR2) {
            const w = (sepR - Math.sqrt(d2)) / sepR;
            sx += (e.x - o.x) * w;
            sy += (e.y - o.y) * w;
          }
        }
        const sl = Math.hypot(sx, sy);
        if (sl > 0) {
          vx += (sx / sl) * b.separation;
          vy += (sy / sl) * b.separation;
        }
      }

      // 5. organic wander (deterministic noise — never touches the gameplay RNG)
      if (b.jitter !== 0) {
        const n = e.id * MOVE.jitterIdScale + this.time * STEER.jitterFreq;
        vx += Math.sin(n) * b.jitter;
        vy += Math.cos(n * MOVE.jitterPhase) * b.jitter;
      }

      const vl = Math.hypot(vx, vy) || 1;
      e.x += (vx / vl) * step;
      e.y += (vy / vl) * step;

      // Stay inside the arena horizontally.
      const r = def.radius;
      if (e.x < r) e.x = r;
      else if (e.x > WIDTH - r) e.x = WIDTH - r;
      if (reachedBottom(e.y)) this.hitNucleus(e);
    }
  }

  private hitNucleus(e: Enemy): void {
    if (!e.alive) return;
    if (!this.god) this.integrity -= e.damage;
    e.alive = false;
    if (e.boss) this.bossCount = Math.max(0, this.bossCount - 1);
    this.armorBreakUntil.delete(e.id);
    this.pushSfx('breach');
    this.spawnParticles(e.x, e.y, PARTICLE.breach);
    this.floats.push({ x: nucleusPoint.x, y: nucleusPoint.y - 14, text: `-${e.damage}`, color: '#ff5d73', life: 0.9 });
    // Suicide: a detonation that also catches the hero in its blast (gated on `explodeRadius`,
    // which the historical roster never sets — so this is a no-op there).
    const def = ENEMY_DEFS[e.kind];
    if (def.explodeRadius && def.explodeDamage) {
      const h = this.primaryHero;
      if (!h.down && !this.god && dist2(e.x, e.y, h.x, h.y) <= def.explodeRadius * def.explodeRadius) {
        h.hp -= def.explodeDamage;
        if (h.hp <= 0) {
          h.down = true;
          h.respawn = HERO_DEFS[h.kind].respawnTime;
          this.floats.push({ x: h.x, y: h.y - 20, text: 'DOWN', color: '#ff5d73', life: 1.2 });
        }
      }
      this.spawnParticles(e.x, e.y, PARTICLE.bossfall); // a real blast, not a nibble
    }
  }

  // ── Hero identity hooks (docs/HERO-FRAMEWORK.md). All reduce to identity unless the matching
  //    hero is fielded + (Ravager) the target is `elite` ⇒ golden-safe. ──
  /** Ravager Apex Predator + Killchain: bonus damage vs ELITE enemies, growing per elite slain this
   *  run. ×1 vs non-elites — and Stage autoplay spawns none ⇒ byte-identical golden run. */
  private heroEliteDamage(h: Hero, target: Enemy): number {
    const id = this.idOf(h);
    if (!target.elite || id.passive.kind !== 'eliteDamage') return 1;
    return 1 + id.passive.amount + Math.min(id.scaling.cap, h.killchain * id.scaling.perStack);
  }

  /** Overseer Neural Static + Overload: disrupted enemies take extra damage, deepening with depth.
   *  Summed over the roster; 0 unless an Overseer is fielded ⇒ golden-safe. */
  private heroVulnBonus(): number {
    let m = 0;
    for (const h of this.heroes) {
      const id = this.idOf(h);
      if (id.passive.kind === 'vulnField') m += id.passive.amount + Math.min(id.scaling.cap, this.waveIndex * id.scaling.perStack);
    }
    return m;
  }

  /** Ravager Bloodthirst + Killchain on an elite death: stack the chain, heal the hero, brief speed
   *  rush — PER Ravager in the roster. No-op unless a Ravager is fielded; elites never spawn in Stage
   *  autoplay ⇒ golden-safe (a single Ravager behaves byte-identically to the old singular state). */
  private onEliteSlain(): void {
    for (const h of this.heroes) {
      if (this.idOf(h).passive.kind !== 'eliteDamage') continue;
      h.killchain++;
      if (!h.down) {
        h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.12); // Bloodthirst heal
        h.rushUntil = this.time + 3; // brief mobility surge
      }
    }
  }

  private heroSystem(dt: number): void {
    for (const h of this.heroes) this.updateHero(h, dt);
    // The non-primary roster (slots 2+) is fully AUTONOMOUS — it auto-casts its signature ability on
    // cooldown; the primary (slot 1) stays PLAYER-triggered. The loop is empty for a single-hero run
    // ⇒ it never executes ⇒ byte-identical golden run.
    for (let i = 1; i < this.heroes.length; i++) this.autoCastHero(this.heroes[i]);
  }

  /** Autonomous ability cast for a non-primary hero: fire the signature ability the moment it's
   *  ready, aimed at the deepest enemy in aggro range (a support hero with no target self-casts). */
  private autoCastHero(h: Hero): void {
    if (h.down || h.abilityCd > 0) return;
    const def = HERO_DEFS[h.kind];
    const r2 = (def.aggroRange * this.hmods(h).heroAggroRangeMult) ** 2;
    let target: Enemy | null = null;
    let best = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || dist2(h.x, h.y, e.x, e.y) > r2) continue;
      const gd = goalDistanceAt(e.x, e.y);
      if (gd < best) { best = gd; target = e; }
    }
    if (target) this.castHeroAbility(h, target.x, target.y);
    else if (def.behavior === 'guard') this.castHeroAbility(h, h.x, h.y); // support self-casts (heal / shield / mend)
  }

  /** Autonomous battlefield unit. Shared lifecycle (respawn, cooldowns, usage
   * accrual, contact damage); the per-behavior brain — move + target + act — is
   * dispatched by the hero's data-driven profile so each plays completely
   * differently: a dive bruiser, a guarding sustainer, a floating controller. */
  private updateHero(h: Hero, dt: number): void {
    const def = HERO_DEFS[h.kind];
    if (h.down) {
      h.respawn -= dt;
      if (h.respawn <= 0) {
        h.down = false;
        h.hp = h.maxHp;
        h.x = nucleusPoint.x;
        h.y = nucleusPoint.y;
      }
      return;
    }
    if (this.phase === 'wave') this.heroMasteryAccrual[h.kind].activeTime += dt; // usage signal
    if (h.attackCd > 0) h.attackCd -= dt;
    if (h.abilityCd > 0) h.abilityCd -= dt;
    if (h.pulseCd > 0) h.pulseCd -= dt;
    if (h.shieldTime > 0) {
      h.shieldTime -= dt;
      if (h.shieldTime <= 0) { h.shieldTime = 0; h.shield = 0; } // window lapsed → drop the pool
    }

    // Threat-aware survival (docs/HERO-FRAMEWORK.md §3): cautious/evasive heroes disengage toward the
    // nucleus at low HP; the Ravager's `aggressive` profile contributes 0 (its recklessness is a
    // designed weakness), so the golden autoplay hero never retreats ⇒ byte-identical. Equipment's
    // "wary" threshold layers on top (max).
    const innateRetreat = this.idOf(h).survival === 'evasive' ? 0.4 : this.idOf(h).survival === 'cautious' ? 0.3 : 0;
    const retreatAt = Math.max(this.hmods(h).heroRetreatThreshold, innateRetreat);
    if (retreatAt > 0 && h.hp < h.maxHp * retreatAt) {
      const np = moveToward(h.x, h.y, nucleusPoint.x, nucleusPoint.y, def.speed * this.hmods(h).heroSpeedMult * dt);
      h.x = Math.max(0, Math.min(WIDTH, np.x));
      h.y = Math.max(0, Math.min(HEIGHT, np.y));
    } else {
      switch (def.behavior) {
        case 'dive': this.updateDiveHero(h, def, dt); break;
        case 'guard': this.updateGuardHero(h, def, dt); break;
        case 'control': this.updateControlHero(h, def, dt); break;
      }
    }

    this.heroContactDamage(h, def, dt);
  }

  /**
   * RAVAGER (Kinetic dive). Roams the whole arena, prioritizing the most-advanced
   * threat — preferring ones still ABOVE the line so it intercepts before they reach
   * tower range — falling back to the deepest enemy, then patrolling its rally when
   * the field is clear. Dives and stacks Fracture. (Behavior unchanged from the
   * original single-hero build, so the golden outcomes are preserved.)
   */
  private updateDiveHero(h: Hero, def: HeroDef, dt: number): void {
    const aggroRange = def.aggroRange * this.hmods(h).heroAggroRangeMult; // equipment aggression knob
    const aggro2 = aggroRange * aggroRange;
    let target: Enemy | null = null;
    let bestApproach = Infinity; // best among enemies still above the line
    let fallback: Enemy | null = null;
    let bestAny = Infinity;
    let elite: Enemy | null = null; // Apex Predator: hunt elites first (none in Stage ⇒ golden-safe)
    let bestElite = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (dist2(h.x, h.y, e.x, e.y) > aggro2) continue;
      const gd = goalDistanceAt(e.x, e.y);
      if (gd < bestAny) {
        bestAny = gd;
        fallback = e;
      }
      if (e.y < DEFENSE_TOP_Y && gd < bestApproach) {
        bestApproach = gd;
        target = e;
      }
      if (e.elite && gd < bestElite) {
        bestElite = gd;
        elite = e;
      }
    }
    target = elite ?? target ?? fallback; // identity: prioritize elites, then the most-advanced threat

    const goal = target ? { x: target.x, y: target.y } : this.heroIdleGoal(h); // anchor (equipment)
    // Bloodthirst: a brief speed surge after an elite kill (×1 otherwise ⇒ golden-safe). MOBILITY gear rides on top.
    const moveSpeed = def.speed * this.hmods(h).heroSpeedMult * (this.time < h.rushUntil ? 1.4 : 1);
    const np = moveToward(h.x, h.y, goal.x, goal.y, moveSpeed * dt);
    h.x = Math.max(0, Math.min(WIDTH, np.x));
    h.y = Math.max(0, Math.min(HEIGHT, np.y));

    if (target && h.attackCd <= 0 && dist(h.x, h.y, target.x, target.y) <= def.attackRange) {
      const dmg = def.attackDamage * this.hmods(h).heroDamageMult * this.activeBiome.mods.heroDamageMult * this.heroProgress[h.kind].damageMult * this.heroEliteDamage(h, target);
      const applied = this.applyDamage(target, dmg);
      this.heroMasteryAccrual[h.kind].damage += applied;
      this.heroLifesteal(h, applied); // weapon: sustain through attacking (no-op at 0)
      this.addFracture(target, def.attackFracture);
      // Weapon grant: the hero's hits also apply granted statuses (no-op without such gear).
      for (const s of this.hstatuses(h)) this.applyStatus(target, { kind: s.status, amount: s.amount });
      this.maybeReact(target);
      this.runHeroAttackKit(h, target); // weapon: cleave/chain/AoE/status/crit RE-AUTHOR the attack
      h.attackCd = def.attackInterval;
    }
  }

  /** Heal the hero by a fraction of damage it dealt (lifesteal weapons). No-op at 0 (golden-safe). */
  private heroLifesteal(h: Hero, applied: number): void {
    if (this.hmods(h).heroLifestealFrac <= 0 || h.down) return;
    h.hp = Math.min(h.maxHp, h.hp + applied * this.hmods(h).heroLifestealFrac);
  }

  /** Run the weapon-granted attack kit on a hero hit (cleave/chain/on-hit AoE/status/crit), via
   * the shared ability executor. Empty without such gear ⇒ no-op ⇒ a gear-less run is golden-safe. */
  private runHeroAttackKit(h: Hero, target: Enemy): void {
    if (this.hkit(h).length === 0) return;
    this.abilitySourceKind = null;
    this.abilityHeroKind = h.kind;
    this.abilityCaster = h;
    this.castScratch.x = target.x;
    this.castScratch.y = target.y;
    this.castScratch.damageMult = this.hmods(h).heroDamageMult * this.activeBiome.mods.heroDamageMult * this.heroProgress[h.kind].damageMult * this.heroEliteDamage(h, target);
    this.castScratch.target = target;
    this.castScratch.pierce = 0;
    this.castRangeMult = 1;
    runAbilities(this.actx, this.hkit(h), this.castScratch);
  }

  /**
   * SHEPHERD (Vital guard). Holds the defensive zone in front of the Nucleus,
   * sliding to cover the deepest incursion; mends Integrity over time and emits a
   * short vital pulse that chips whatever is pressing the line. Never chases up-field
   * — its job is to keep the core beating, not to hunt.
   */
  private updateGuardHero(h: Hero, def: HeroDef, dt: number): void {
    if (def.nucleusRegen > 0 && this.integrity < this.maxIntegrity) {
      this.integrity = Math.min(this.maxIntegrity, this.integrity + def.nucleusRegen * dt);
    }
    const zoneTop = DEFENSE_TOP_Y - CELL;
    let gx = nucleusPoint.x;
    let gy = (DEFENSE_TOP_Y + HEIGHT) / 2;
    let best = Infinity;
    let threat: Enemy | null = null;
    for (const e of this.enemies) {
      if (!e.alive || e.y < zoneTop) continue; // only the ones at/into the zone matter
      const gd = goalDistanceAt(e.x, e.y);
      if (gd < best) {
        best = gd;
        threat = e;
      }
    }
    if (threat) {
      gx = threat.x;
      gy = Math.max(DEFENSE_TOP_Y, threat.y - CELL);
    }
    const np = moveToward(h.x, h.y, gx, gy, def.speed * this.hmods(h).heroSpeedMult * dt);
    h.x = Math.max(0, Math.min(WIDTH, np.x));
    h.y = Math.max(DEFENSE_TOP_Y - CELL, Math.min(HEIGHT, np.y)); // stays in/near the zone
    if (def.pulseInterval > 0 && h.pulseCd <= 0) {
      this.heroPulse(h);
      h.pulseCd = def.pulseInterval;
    }
  }

  /**
   * OVERSEER (Neural control). Floats to the densest knot of enemies to blanket the
   * most bodies in its Disruption field (slow + vulnerability). Deals ~no damage —
   * its value is amplifying everything else that hits the crowd it has marked.
   */
  private updateControlHero(h: Hero, def: HeroDef, dt: number): void {
    const hot = this.densestCluster(def.pulseRadius);
    let gx = nucleusPoint.x;
    let gy = DEFENSE_TOP_Y;
    if (hot) {
      gx = hot.x;
      gy = Math.max(DEFENSE_TOP_Y - CELL * 3, hot.y); // hover over the crowd, not the spawn
    }
    const np = moveToward(h.x, h.y, gx, gy, def.speed * this.hmods(h).heroSpeedMult * dt);
    h.x = Math.max(0, Math.min(WIDTH, np.x));
    h.y = Math.max(0, Math.min(HEIGHT, np.y));
    if (def.pulseInterval > 0 && h.pulseCd <= 0) {
      this.heroPulse(h);
      h.pulseCd = def.pulseInterval;
    }
  }

  /** Densest enemy (cheap proxy: most neighbours within `r`) — the Overseer's anchor. */
  private densestCluster(r: number): Enemy | null {
    let best: Enemy | null = null;
    let bestCount = -1;
    const near = this.neighborScratch;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      this.grid.queryInto(e.x, e.y, r, near);
      let c = 0;
      for (let k = 0; k < near.length; k++) if (near[k].alive) c++;
      if (c > bestCount) {
        bestCount = c;
        best = e;
      }
    }
    return best;
  }

  /** Shepherd/Overseer role pulse: AoE chip (+ Disruption for the controller) around
   * the hero. Credits hero mastery; cosmetic burst uses the FX rng only. */
  /** The guard/control role pulse — an aura AbilityComponent run by the shared executor. */
  private heroPulse(h: Hero): void {
    const pulse = HERO_PULSE[h.kind];
    if (!pulse) return;
    this.abilitySourceKind = null;
    this.abilityHeroKind = h.kind;
    this.abilityCaster = h;
    this.castScratch.x = h.x;
    this.castScratch.y = h.y;
    this.castScratch.damageMult = this.hmods(h).heroDamageMult * this.activeBiome.mods.heroDamageMult * this.heroProgress[h.kind].damageMult;
    this.castScratch.target = null;
    this.castScratch.pierce = 0;
    runAbility(this.actx, pulse, this.castScratch);
    // Weapon grant (e.g. "Venomous"): a status-on-hit weapon also rides the guard/control
    // heroes' role pulse — their offensive output — so it isn't Ravager-only. Gated on the
    // grant (empty by default ⇒ no-op ⇒ golden-safe).
    if (this.hstatuses(h).length) {
      const r = HERO_DEFS[h.kind].pulseRadius;
      if (r > 0) {
        const r2 = r * r;
        this.grid.forNeighbors(h.x, h.y, r, (e) => {
          if (e.alive && dist2(h.x, h.y, e.x, e.y) <= r2) {
            for (const s of this.hstatuses(h)) this.applyStatus(e, { kind: s.status, amount: s.amount });
          }
        });
      }
    }
  }

  /** Enemies in contact with a hero deal damage to it; at 0 HP the hero is downed. */
  private heroContactDamage(h: Hero, def: HeroDef, dt: number): void {
    let incoming = 0;
    const near = this.neighborScratch;
    this.grid.queryInto(h.x, h.y, def.contactRange + COMBAT.heroContactMargin, near);
    for (let k = 0; k < near.length; k++) {
      const e = near[k];
      if (!e.alive) continue;
      if (dist(h.x, h.y, e.x, e.y) <= def.contactRange + ENEMY_DEFS[e.kind].radius) {
        incoming += e.damage;
        if (this.hmods(h).heroThornsFrac > 0) this.applyDamage(e, e.damage * this.hmods(h).heroThornsFrac * dt); // DEFENSE gear: reflect
      }
    }
    if (incoming > 0 && !this.god) {
      let dmg = incoming * dt;
      // Front-shield soaks first; only the overflow reaches HP. No-op when shield is 0
      // (every hero but a freshly-bloomed Shepherd), so the golden runs are unchanged.
      if (h.shield > 0) {
        const absorbed = Math.min(h.shield, dmg);
        h.shield -= absorbed;
        dmg -= absorbed;
      }
      if (dmg > 0) {
        h.hp -= dmg;
        if (h.hp <= 0) {
          h.down = true;
          h.respawn = def.respawnTime;
          this.floats.push({ x: h.x, y: h.y - 20, text: 'DOWN', color: '#ff5d73', life: 1.2 });
        }
      }
    }
  }

  /** Cast the primary hero's signature ability at (px,py) — dispatched by hero data:
   * Ravager leaps + fractures, Shepherd blooms (heal + AoE), Overseer floods Disruption. */
  private triggerAbility(px: number, py: number): void {
    this.castHeroAbility(this.primaryHero, px, py);
  }

  /** Cast hero `h`'s signature ability at (px,py). Player-triggered for the primary (triggerAbility);
   *  auto-cast for the autonomous roster (autoCastHero). A single-hero run only ever casts the
   *  primary ⇒ byte-identical golden run. */
  private castHeroAbility(h: Hero, px: number, py: number): void {
    if (h.down || h.abilityCd > 0) return;
    const def = HERO_DEFS[h.kind];
    const ab = def.ability;
    h.x = px;
    h.y = py;
    h.rally = { x: px, y: py };
    // The signature ability is a list of AbilityComponents (heal + explosion / debuff),
    // run by the shared executor — see HERO_ULT.
    this.abilitySourceKind = null;
    this.abilityHeroKind = h.kind;
    this.abilityCaster = h;
    this.castScratch.x = px;
    this.castScratch.y = py;
    this.castScratch.damageMult = this.hmods(h).heroDamageMult * this.activeBiome.mods.heroDamageMult * this.heroProgress[h.kind].damageMult;
    this.castScratch.target = null;
    this.castScratch.pierce = 0;
    this.castRangeMult = this.hmods(h).heroAbilityRadiusMult; // this hero's ABILITIES gear scales its ability AoE
    runAbilities(this.actx, HERO_ULT[h.kind], this.castScratch);
    this.castRangeMult = 1;
    if (this.relicHooks.length) this.fireRelicHooks('abilityCast', null); // relic rule on ability cast
    h.abilityCd = ab.cooldown * this.hmods(h).heroCooldownMult * this.activeBiome.mods.heroCooldownMult * this.heroProgress[h.kind].cooldownMult;
    this.pushSfx('ability');
    if (gameEvents.hasListeners('heroAbilityUsed')) gameEvents.emit('heroAbilityUsed', { kind: h.kind }); // drives the Combat Tutorial (golden-safe: gated on a listener)
    this.floats.push({ x: px, y: py - 20, text: `${ab.name}!`, color: def.color, life: 0.8 });
  }

  private deathSystem(): void {
    // In-place swap-remove (no per-tick array realloc). Evicts BOTH hp-deaths and
    // enemies that breached the line (hitNucleus set alive=false without an hp-death).
    const es = this.enemies;
    for (let i = es.length - 1; i >= 0; i--) {
      const e = es[i];
      if (e.alive && e.hp <= 0) {
        e.alive = false;
        this.kills++;
        if (e.elite) this.onEliteSlain(); // Ravager Killchain/Bloodthirst (golden-safe: no elites in Stage)
        this.statKillsByEnemy[e.kind]++; // lifetime-stats observation
        if (e.boss) this.bossCount = Math.max(0, this.bossCount - 1); // a boss fell
        if (e.lastHitKind) this.masteryAccrual[e.lastHitKind].kills++; // mastery: kill credit
        if (e.infection > 0) this.spreadInfection(e); // Viral: the plague jumps to the living
        const gain = e.bounty * this.mods.biomassMult;
        this.biomass += gain;
        this.statBiomassEarned += gain;
        this.armorBreakUntil.delete(e.id);
        this.spawnParticles(e.x, e.y, PARTICLE.death, ENEMY_DEFS[e.kind].color);
        this.spawnMotes(e.x, e.y); // biomass income "flies" up off the kill
        this.pushSfx('kill');
        if (e.boss) this.bossDeathSpectacle(e); // a boss death is an event, not a pop
        if (e.bounty >= 20) {
          this.floats.push({ x: e.x, y: e.y - 14, text: `+${Math.round(gain)}`, color: '#b6e84a', life: 0.8 });
        }
        // Gameplay events (gated: no payload built when nobody is listening).
        if (gameEvents.hasListeners('enemyKilled')) {
          gameEvents.emit('enemyKilled', { id: e.id, kind: e.kind, x: e.x, y: e.y, bounty: e.bounty, byTower: e.lastHitKind, isBoss: e.boss !== null });
        }
        if (e.boss && gameEvents.hasListeners('bossKilled')) {
          gameEvents.emit('bossKilled', { defId: e.boss.defId, name: e.boss.name, x: e.x, y: e.y });
        }
        if (this.relicHooks.length) this.fireRelicHooks('enemyKilled', e); // relic battlefield rules
      }
      if (!e.alive) {
        es[i] = es[es.length - 1];
        es.pop();
      }
    }
  }

  private floatSystem(dt: number): void {
    const fs = this.floats;
    for (let i = fs.length - 1; i >= 0; i--) {
      const f = fs[i];
      f.life -= dt;
      f.y -= FX.floatRiseSpeed * dt;
      if (f.life <= 0) {
        fs[i] = fs[fs.length - 1];
        fs.pop();
      }
    }
  }

  // ── Pools & particles (scalability) ──────────────────────────────────────

  private spawnProjectile(
    x: number, y: number, tx: number, ty: number, speed: number,
    targetId: number, damage: number, behavior: ProjectileBehavior, splash: number,
    sourceKind: TowerKind | null,
  ): void {
    const p = this.projPool.pop();
    if (p) {
      p.id = this.nextId++;
      p.x = x; p.y = y; p.tx = tx; p.ty = ty; p.speed = speed;
      p.targetId = targetId; p.damage = damage; p.behavior = behavior; p.splash = splash; p.alive = true;
      p.sourceKind = sourceKind;
      p.pierce = 0; // reset pooled mutator state before re-applying the kit's mutators
      p.skin = this.castProjectileSkin; // branch shot-skin (renderer-only; undefined on the base path)
      p.skinTier = this.castProjectileSkinTier; // branch shot-tier (renderer-only)
      p.fade = undefined; // a reused shot starts fully opaque / live (clear any prior fade-out)
      if (p.hitIds) p.hitIds.length = 0;
      this.projectiles.push(p);
      this.applyProjectileMutators(p);
    } else {
      const np: Projectile = { id: this.nextId++, x, y, tx, ty, speed, targetId, damage, behavior, splash, alive: true, sourceKind, pierce: 0, skin: this.castProjectileSkin, skinTier: this.castProjectileSkinTier };
      this.projectiles.push(np);
      this.applyProjectileMutators(np);
    }
  }

  /** Apply the per-cast star-kit mutators + the run-wide granted mutators to a fresh shot. */
  private applyProjectileMutators(p: Projectile): void {
    if (this.castProjectileMutators.length) applyMutators(this.castProjectileMutators, p);
    if (this.grantedTowerMutators.length) applyMutators(this.grantedTowerMutators, p);
    // A 'pierce' ability component (ability.ts) adds pierce to shots fired this cast.
    if (this.castScratch.pierce) {
      p.pierce = (p.pierce ?? 0) + this.castScratch.pierce;
      p.hitIds = p.hitIds ?? [];
    }
  }

  /** Nearest alive enemy a piercing projectile hasn't struck yet (the next pass-through). */
  private nextPierceTarget(p: Projectile): Enemy | null {
    const R = 170; // pass-through search radius
    let best: Enemy | null = null;
    let bd = R * R;
    const hit = p.hitIds;
    this.grid.forNeighbors(p.x, p.y, R, (e) => {
      if (!e.alive || (hit !== undefined && hit.includes(e.id))) return;
      const d2 = dist2(p.x, p.y, e.x, e.y);
      if (d2 <= bd) {
        bd = d2;
        best = e;
      }
    });
    return best;
  }

  private releaseProjectile(p: Projectile): void {
    if (this.projPool.length < 256) this.projPool.push(p);
  }

  private particleSystem(dt: number): void {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (this.partPool.length < PERF.maxParticles) this.partPool.push(p);
        ps[i] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= FX.particleDrag; // drag
      p.vy *= FX.particleDrag;
    }
  }

  /** Cosmetic burst. Uses the FX rng (never the gameplay rng) + pooling + budget. `intensity`
   *  (default 1) scales the burst's headcount + speed — the branch sensory escalation
   *  (BRANCH-EVOLUTION.md §3a) sprays denser, faster matter at higher tiers. At intensity 1 the
   *  draws are byte-identical to before, so every existing caller is unchanged. */
  private spawnParticles(
    x: number, y: number,
    spec: { count: number; speed: number; life: number; size: number; color?: string },
    color?: string, intensity = 1,
  ): void {
    const col = color ?? spec.color ?? '#ffffff';
    const count = Math.round(spec.count * intensity);
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= PERF.maxParticles) break; // budget
      const ang = this.fxRng.next() * Math.PI * 2;
      const spd = spec.speed * intensity * (0.4 + this.fxRng.next() * 0.6);
      const p = this.partPool.pop() ?? { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0, color: col };
      p.x = x; p.y = y;
      p.vx = Math.cos(ang) * spd; p.vy = Math.sin(ang) * spd;
      p.life = spec.life; p.maxLife = spec.life;
      p.size = spec.size; p.color = col;
      this.particles.push(p);
    }
  }

  /** Biomass motes drifting up off a kill — the income reads as "flying" to the HUD. */
  private spawnMotes(x: number, y: number): void {
    const spec = PARTICLE.mote;
    for (let i = 0; i < spec.count; i++) {
      if (this.particles.length >= PERF.maxParticles) break; // budget
      const p = this.partPool.pop() ?? { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0, color: spec.color };
      p.x = x + (this.fxRng.next() - 0.5) * 10;
      p.y = y;
      p.vx = (this.fxRng.next() - 0.5) * 24;
      p.vy = -55 - this.fxRng.next() * 45; // upward, toward the resource counter
      p.life = spec.life; p.maxLife = spec.life;
      p.size = spec.size; p.color = spec.color;
      this.particles.push(p);
    }
  }

  // ── Reward-moment spectacle (cosmetic; uses the FX rng + cue queue only, so it never
  //    perturbs the deterministic outcome the golden tests pin). ────────────────────────

  /** A framework boss dies as an EVENT: a double-burst detonation, a flood of biomass motes
   * streaming to the counter, a banner, and a heavy shake cue. */
  private bossDeathSpectacle(e: Enemy): void {
    this.spawnParticles(e.x, e.y, PARTICLE.bossfall);
    this.spawnParticles(e.x, e.y, PARTICLE.bossfall, ENEMY_DEFS[e.kind].color);
    for (let i = 0; i < 5; i++) this.spawnMotes(e.x, e.y); // the boss's biomass floods home
    this.floats.push({ x: e.x, y: e.y - 26, text: `${e.boss?.name ?? 'BOSS'} FELL`, color: '#ffd24d', life: 1.8 });
    this.pushSfx('breach'); // strongest existing shake cue
  }

  /** Wave-clear flourish at the line; a no-damage wave reads as FLAWLESS (skill reward). */
  private waveCompleteFlourish(flawless: boolean): void {
    const x = nucleusPoint.x;
    this.spawnParticles(x, DEFENSE_TOP_Y, PARTICLE.celebrate);
    if (flawless) {
      this.spawnParticles(x, DEFENSE_TOP_Y, PARTICLE.celebrate, '#ffd24d');
      this.floats.push({ x, y: DEFENSE_TOP_Y - 30, text: 'FLAWLESS', color: '#ffd24d', life: 1.6 });
    } else {
      this.floats.push({ x, y: DEFENSE_TOP_Y - 30, text: 'WAVE CLEARED', color: '#b6e84a', life: 1.2 });
    }
    this.pushSfx('wave');
  }

  /** Stage-clear crescendo — a wide multi-hued extraction bloom across the line. */
  private stageClearCrescendo(): void {
    const x = nucleusPoint.x;
    for (let i = 0; i < 5; i++) {
      this.spawnParticles(x + (i - 2) * 48, DEFENSE_TOP_Y, PARTICLE.celebrate, i % 2 ? '#ffd24d' : '#5ad1ff');
    }
    this.floats.push({ x, y: DEFENSE_TOP_Y - 40, text: 'EXTRACTION', color: '#ffd24d', life: 2.2 });
    this.pushSfx('ability');
  }

  private checkWaveEnd(): void {
    if (this.phase !== 'wave' || this.settleTimer > 0) return; // already winding down
    if (this.spawnedAll && this.spawnQueue.length === 0 && this.enemies.length === 0) {
      this.minions.length = 0; // temporary summons don't outlive the wave they were called into
      if (gameEvents.hasListeners('waveCompleted')) gameEvents.emit('waveCompleted', { wave: this.waveIndex, endless: this.mode === 'endless' });
      if (this.relicHooks.length) this.fireRelicHooks('waveCleared', null); // relic rule on a cleared wave
      const flawless = this.integrity >= this.waveStartIntegrity; // held the line without a breach
      // Fire the clear feedback NOW (and roll the draft at the unchanged RNG point), but hold the
      // phase flip for the settle beat (endWave) so the battlefield winds down first. The draft
      // options aren't shown until the phase is 'draft' (the modal is phase-gated).
      // Endless never "wins" — it only ends when the Nucleus falls. Stage + campaign clear when
      // their (authored / generated) wave count is reached.
      if (this.mode !== 'endless' && this.waveIndex >= this.totalWaves) {
        this.stageClearCrescendo();
      } else {
        this.waveCompleteFlourish(flawless);
        // Gene Card cadence (CARDS.md §1): campaign drafts every wave (generous); endless slows
        // the drip with depth so cards stay exciting and deep runs lean on permanent progression.
        if (this.shouldDraftThisWave()) {
          this.draft = draftCards(this.rng, 3, this.waveIndex); // depth-scaled rarity (CARDS.md §2)
        }
      }
      this.settleTimer = SETTLE.duration; // begin the wind-down; endWave() reveals the result
    }
  }

  /** Whether the just-cleared wave grants a Gene Card draft. Stage + campaign: always (generous).
   * Endless: the cadence widens with depth (1→5-wave gaps, CARDS.md §1) — counts waves since the
   * last draft and fires once it reaches the depth's interval, so the gap only ever widens. Mutates
   * the since-last-draft counter, so call exactly once per cleared wave. */
  private shouldDraftThisWave(): boolean {
    if (this.mode !== 'endless') return true;
    this.wavesSinceDraft++;
    if (this.wavesSinceDraft >= endlessDraftInterval(this.waveIndex)) {
      this.wavesSinceDraft = 0;
      return true;
    }
    return false;
  }

  /** End of the settle beat: reveal the post-wave state — the stage win, the gene-card draft
   * (already rolled in checkWaveEnd), or straight to the next prep on an endless no-draft wave.
   * Pure phase flip; the battlefield is now wound down. */
  private endWave(): void {
    this.settleTimer = 0;
    // Stage + campaign clear (win) when their wave count is reached; endless never wins.
    if (this.mode !== 'endless' && this.waveIndex >= this.totalWaves) {
      this.phase = 'won';
    } else if (this.draft && this.draft.length > 0) {
      this.phase = 'draft';
    } else {
      // Endless skipped this wave's draft (CARDS.md §1) — no card to offer, so go build.
      this.phase = 'prep';
      this.prepCountdown = AUTO_START_DELAY; // fresh countdown, like chooseCard's prep entry
    }
  }

  // ── Status / reaction helpers ────────────────────────────────────────────

  private addFracture(e: Enemy, n: number): void {
    e.fracture = Math.min(fractureCap(this.mods.fractureBonusStacks), e.fracture + n);
  }

  /** Total incoming-damage multiplier on `e`: Fracture's per-stack amp + Neural
   * Vulnerability (Disruption). Applies to EVERY source. Identity (1) when clean,
   * so undisrupted/unfractured enemies take damage exactly as before. */
  private vulnMult(e: Enemy): number {
    let m = 1 + e.fracture * STATUS.fractureDamageTakenPerStack;
    if (e.disrupt > 0) m += STATUS.disruptVulnerability + this.mods.obeliskVulnerabilityBonus + this.heroVulnBonus();
    // Framework debuffs (e.g. Armor Break amp, generic Vulnerability) add in here too —
    // inert on the historical path (no framework statuses present).
    if (e.statuses !== undefined && e.statuses.length > 0) m += aggregateStatuses(e.statuses).damageTakenMult;
    return m;
  }

  /** Viral: add Infection stacks (capped). */
  private infect(e: Enemy, n: number): void {
    e.infection = Math.min(STATUS.infectionMaxStacks, e.infection + n);
  }

  /** Apply a universal status-effect (status.ts) to an enemy — the path NEW effects
   * (burn, slow, stun, regen, …) flow through. The four legacy statuses keep their fast
   * fields; everything else lives in the generic container, ticked in statusSystem and
   * read by enemyMoveSystem/vulnMult. Returns false for an unknown id. */
  applyEffect(e: Enemy, id: string, amount = 1): boolean {
    const d = statusRegistry.get(id);
    if (!d) return false;
    (e.statuses ??= []);
    applyStatusInstance(e.statuses, d, amount);
    return true;
  }

  /** Apply Infection's continuous DoT: ignores armor (biological), but still scales
   * with Vulnerability and credits the Nest for mastery/kill attribution. No min-1
   * floor — it's a true continuous bleed, not a discrete hit. */
  private applyInfectionDamage(e: Enemy, dot: number): void {
    if (!e.alive || dot <= 0) return;
    const applied = dot * this.vulnMult(e);
    e.hp -= applied;
    e.dmgAccum += applied;
    e.lastHitKind = 'parasite';
    this.masteryAccrual.parasite.damage += applied;
  }

  /** Viral spread: on an infected death, seed Infection onto the nearest neighbours
   * (the epidemic walking through the pack). Deterministic nearest-first; cosmetic
   * spore burst uses the FX rng only. */
  private spreadInfection(src: Enemy): void {
    // Identity-range upgrade (docs/RANGE.md §8): the Parasite's mastery widens the plague's
    // reach. 1× for a fresh save (golden-safe).
    const r = STATUS.infectionSpreadRadius * (this.towerProgress.parasite.infectionSpreadMult ?? 1);
    const r2 = r * r;
    const near = this.neighborScratch;
    this.grid.queryInto(src.x, src.y, r, near);
    near.sort((a, b) => dist2(src.x, src.y, a.x, a.y) - dist2(src.x, src.y, b.x, b.y));
    let jumps = 0;
    for (let i = 0; i < near.length && jumps < STATUS.infectionSpreadTargets; i++) {
      const o = near[i];
      if (o === src || !o.alive || o.infection >= STATUS.infectionMaxStacks) continue;
      if (dist2(src.x, src.y, o.x, o.y) > r2) continue;
      this.infect(o, STATUS.infectionSpreadStacks);
      jumps++;
    }
    this.spawnParticles(src.x, src.y, PARTICLE.infect);
  }

  /** Apply `raw` damage to `e`. `sourceKind` (a firing tower) credits mastery +
   * kill attribution — pure bookkeeping that never alters the damage dealt.
   * `flash` pops the white hit-flash on discrete hits; continuous DoT
   * (corrosion/pools) passes false so it doesn't strobe. Returns damage applied. */
  private applyDamage(e: Enemy, raw: number, sourceKind: TowerKind | null = null, flash = true): number {
    if (!e.alive) return 0;
    if (e.boss && e.boss.shielded > 0) {
      if (flash) e.hitFlash = FX.hitFlash; // sparks off the shield, but no HP lost
      return 0;
    }
    const broken = (this.armorBreakUntil.get(e.id) ?? 0) > this.time;
    const applied = damageAfter(raw, this.vulnMult(e), effectiveArmor(e, broken));
    // Shielded enemies soak the hit into the front shield first; only the overflow reaches HP.
    // The shield is undefined/0 on the historical roster, so this is a no-op there (golden-safe).
    let toBody = applied;
    if ((e.shield ?? 0) > 0) {
      const absorbed = Math.min(e.shield as number, applied);
      e.shield = (e.shield as number) - absorbed;
      toBody = applied - absorbed;
    }
    e.hp -= toBody;
    e.dmgAccum += applied; // banked for the next aggregated damage number
    this.statDamageDealt += applied; // lifetime-stats observation
    if (flash) e.hitFlash = FX.hitFlash;
    if (sourceKind) {
      e.lastHitKind = sourceKind;
      this.masteryAccrual[sourceKind].damage += applied;
    }
    // Executioner keystone: cull a non-elite/boss host left under the threshold (off at 0).
    if (this.mods.executeThreshold > 0 && e.hp > 0 && !e.boss && !e.elite && e.hp <= this.mods.executeThreshold * e.maxHp) {
      e.hp = 0;
    }
    return applied;
  }

  /** Run the highest-priority status REACTION ready on `e` (the reaction matrix). Shred
   * (Fracture + Corrosion) is first and unchanged, so a Fracture+Corrosion-only run is
   * byte-identical; the other five reactions need Infection/Disruption to be present. */
  private maybeReact(e: Enemy): void {
    if (!e.alive) return;
    // Reactions normally fire once; the Cascade / Hivemind keystones chain extra ones
    // (reactionRepeats defaults to 0 ⇒ a single reaction ⇒ byte-identical golden path).
    let iterations = 1 + this.mods.reactionRepeats;
    while (iterations-- > 0 && e.alive) {
      const r = pendingReaction(e);
      if (!r) return;
      this.runReaction(e, r);
    }
  }

  /** Execute one resolved reaction's side-effects on `e` (the matrix payload). */
  private runReaction(e: Enemy, r: ReactionDef): void {
    switch (r.id) {
      case 'shred': {
        const burst = shredBurst(e.fracture);
        e.hp -= burst; // true damage, ignores armor
        this.armorBreakUntil.set(e.id, this.time + STATUS.shredArmorBreak);
        e.fracture = 0;
        e.shredFlash = STATUS.shredFlash;
        this.pushSfx('shred');
        this.spawnParticles(e.x, e.y, PARTICLE.shred);
        break;
      }
      case 'virulence': {
        // Fracture + Infection: consume the Fracture to surge the plague (burst + ramp).
        e.hp -= REACTIONS.virulenceBase + REACTIONS.virulencePerStack * e.fracture;
        this.infect(e, e.fracture); // wounds feed the plague (capped in infect)
        e.fracture = 0;
        e.shredFlash = STATUS.shredFlash;
        this.pushSfx('shred');
        this.spawnParticles(e.x, e.y, PARTICLE.infect);
        break;
      }
      case 'detonate': {
        // Fracture + Disruption: the destabilized shell detonates (true burst).
        e.hp -= REACTIONS.detonateBase + REACTIONS.detonatePerStack * e.fracture;
        e.fracture = 0;
        e.shredFlash = STATUS.shredFlash;
        this.pushSfx('shred');
        this.spawnParticles(e.x, e.y, PARTICLE.shred);
        break;
      }
      case 'putrefy': {
        // Corrosion + Infection: acid rot accelerates the plague.
        e.hp -= REACTIONS.putrefyBase;
        this.infect(e, REACTIONS.putrefyInfectAdd);
        e.corrosion = 0; // consumed
        e.shredFlash = STATUS.shredFlash;
        this.pushSfx('hit');
        this.spawnParticles(e.x, e.y, PARTICLE.infect);
        break;
      }
      case 'dissolve': {
        // Corrosion + Disruption: armor melts entirely (+ a true tick).
        e.hp -= REACTIONS.dissolveBase;
        this.armorBreakUntil.set(e.id, this.time + REACTIONS.dissolveBreak);
        e.corrosion = 0; // consumed
        e.shredFlash = STATUS.shredFlash;
        this.pushSfx('shred');
        this.spawnParticles(e.x, e.y, PARTICLE.disrupt);
        break;
      }
      case 'plaguebloom': {
        // Infection + Disruption: the vulnerable plague blooms and leaps to the pack.
        e.hp -= REACTIONS.plagueBase + REACTIONS.plaguePerStack * Math.floor(e.infection);
        e.disrupt = 0; // consumed
        e.shredFlash = STATUS.shredFlash;
        this.pushSfx('shred');
        this.spreadInfection(e); // jumps to neighbours now (also bursts infect particles)
        break;
      }
    }
    this.floats.push({ x: e.x, y: e.y - 16, text: r.name, color: r.color, life: 0.7 });
  }

  // ── Debug API (driven by the debug panel; no effect on normal play) ──────

  debugSpawn(kind: EnemyKind, count = 1): void {
    const idx0 = Math.max(0, this.waveIndex - 1);
    for (let i = 0; i < count; i++) this.spawnOne(kind, this.hpMultFor(idx0), this.bountyMultFor(idx0));
  }

  debugAddBiomass(n: number): void {
    this.biomass = Math.max(0, this.biomass + n);
  }

  debugRefillIntegrity(): void {
    this.integrity = this.maxIntegrity;
  }

  debugKillAll(): void {
    for (const e of this.enemies) {
      if (e.alive) {
        this.kills++;
        this.biomass += e.bounty * this.mods.biomassMult;
      }
    }
    this.enemies = [];
    this.armorBreakUntil.clear();
  }

  debugWin(): void {
    if (!this.paused) this.phase = 'won';
  }

  debugLose(): void {
    this.integrity = 0;
    this.phase = 'lost';
  }

  /** Instantly clear the current wave (auto-resolves to draft / win next tick). */
  debugSkipWave(): void {
    if (this.phase !== 'wave') return;
    this.debugKillAll();
    this.spawnQueue = [];
    this.spawnedAll = true;
  }

  /** Open the 1-of-3 draft now (abandons any in-progress wave). */
  debugOpenDraft(): void {
    if (this.phase === 'won' || this.phase === 'lost') return;
    this.draft = draftCards(this.rng, 3, this.waveIndex);
    this.phase = 'draft';
  }

  /** Apply a specific card's effect immediately (force a card selection). */
  debugApplyCard(id: string): void {
    const card = CARD_POOL.find((c) => c.id === id);
    if (card) applyCard(card, this.cardContext());
  }

  debugReviveHero(): void {
    for (const h of this.heroes) {
      h.down = false;
      h.hp = h.maxHp;
      h.respawn = 0;
      h.abilityCd = 0;
    }
  }

  // ── Read models (for UI / renderer) ──────────────────────────────────────

  /** Drain the presentation cue queue (audio + screen-shake) — view-only. */
  drainSfx(): string[] {
    if (this.sfx.length === 0) return this.sfx;
    const out = this.sfx;
    this.sfx = [];
    return out;
  }

  private pushSfx(k: string, tier?: number): void {
    // A branch cue carries its tier as a "tag@tier" suffix so the audio layer can deepen the
    // synth per tier (BRANCH-EVOLUTION.md §3d). Tier ≤1 / absent ⇒ the plain tag, so every
    // existing cue is byte-identical and the coalescer (GameView) stays tag-agnostic.
    if (this.sfx.length < 256) this.sfx.push(tier && tier > 1 ? `${k}@${tier}` : k);
  }

  /** Grant/refresh a timed run-wide buff (the `buff` ability primitive). Refresh-not-stack
   * per stat: take the stronger multiplier and the longer window so re-casts don't snowball. */
  private grantRunBuff(stat: string, mult: number, seconds: number): void {
    const label = this.buffLabel(stat, mult);
    const existing = this.runBuffs.find((b) => b.stat === stat);
    if (existing) {
      existing.mult = Math.max(existing.mult, mult);
      existing.remaining = Math.max(existing.remaining, seconds);
      existing.label = label;
    } else {
      this.runBuffs.push({ stat, mult, remaining: seconds, label });
    }
  }

  /** Advance run-buff timers; drop the expired ones. Called once per tick when any is active. */
  private tickRunBuffs(dt: number): void {
    for (const b of this.runBuffs) b.remaining -= dt;
    if (this.runBuffs.some((b) => b.remaining <= 0)) this.runBuffs = this.runBuffs.filter((b) => b.remaining > 0);
  }

  /** Product of active buff multipliers for `stat` (exactly 1 when none — the golden path). */
  private runBuffMult(stat: string): number {
    let m = 1;
    for (const b of this.runBuffs) if (b.stat === stat) m *= b.mult;
    return m;
  }

  private buffLabel(stat: string, mult: number): string {
    const name = stat === 'towerDamage' ? 'tower dmg' : stat;
    return `${mult >= 1 ? '+' : ''}${Math.round((mult - 1) * 100)}% ${name}`;
  }

  /** Summon `count` friendly units of `unit` around (x,y) — the `summon` ability primitive.
   * Capped globally (MINION_CAP) and fanned out in a ring so they don't stack on the point. */
  private summonMinions(unit: string, count: number, x: number, y: number): void {
    const def = MINION_DEFS[unit];
    if (!def) return;
    const n = Math.min(count, MINION_CAP - this.minions.length);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = n > 1 ? 18 : 0; // ring radius (single summon sits on the point)
      this.minions.push({
        id: this.nextId++, kind: unit, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
        hp: def.hp, maxHp: def.hp, hitFlash: 0,
        damage: def.damage, attackCd: 0, attackInterval: def.attackInterval, range: def.range,
        speed: def.speed, life: def.life, maxLife: def.life, radius: def.radius, color: def.color, alive: true,
      });
    }
    if (n > 0) this.spawnParticles(x, y, PARTICLE.bloom); // a small conjuration puff
  }

  /** Summoned friendly units: decay life, seek the nearest enemy, close in, and strike on
   * cooldown. Time-limited (no HP today). Seek/attack only during a wave (the grid is fresh
   * then); life decays every frame so they never freeze between waves. */
  private minionSystem(dt: number): void {
    const inWave = this.phase === 'wave';
    for (const m of this.minions) {
      m.life -= dt;
      if (m.life <= 0) { m.alive = false; continue; }
      if (m.hitFlash > 0) m.hitFlash -= dt; // "being chewed" flash decays (visual)
      if (m.attackCd > 0) m.attackCd -= dt;
      if (!inWave) continue;
      const target = this.nearestEnemyTo(m.x, m.y, m.range);
      if (!target) continue;
      const reach = m.radius + ENEMY_DEFS[target.kind].radius + 6;
      if (dist(m.x, m.y, target.x, target.y) > reach) {
        const np = moveToward(m.x, m.y, target.x, target.y, m.speed * dt);
        m.x = np.x;
        m.y = np.y;
      } else if (m.attackCd <= 0) {
        this.applyDamage(target, m.damage, null, true);
        this.maybeReact(target);
        m.attackCd = m.attackInterval;
      }
    }
    if (this.minions.some((m) => !m.alive)) this.minions = this.minions.filter((m) => m.alive);
  }

  /** Nearest live enemy within `range` of (x,y), via the spatial grid (null if none). */
  private nearestEnemyTo(x: number, y: number, range: number): Enemy | null {
    let best: Enemy | null = null;
    let bd = range * range;
    this.grid.forNeighbors(x, y, range, (e) => {
      if (!e.alive) return;
      const d2 = dist2(x, y, e.x, e.y);
      if (d2 < bd) { bd = d2; best = e; }
    });
    return best;
  }

  /** Body-block: if a friendly minion is in contact with `e`, the enemy halts and chews
   * through it (dealing its attack to the minion's HP) instead of advancing. Returns whether
   * the enemy was blocked this tick. The minion fights back via minionSystem. ≤ MINION_CAP
   * minions, so the scan is bounded; only called when minions exist (golden-safe). */
  private minionBlock(e: Enemy, def: EnemyDef, dt: number): boolean {
    let blocker: Minion | null = null;
    let bd = Infinity;
    for (const m of this.minions) {
      if (!m.alive) continue;
      const reach = def.radius + m.radius + 6; // matches the minion's own attack reach
      const d2 = dist2(e.x, e.y, m.x, m.y);
      if (d2 <= reach * reach && d2 < bd) { bd = d2; blocker = m; }
    }
    if (!blocker) return false;
    blocker.hp -= e.damage * dt;
    blocker.hitFlash = FX.hitFlash; // white shimmer while it's being chewed
    if (blocker.hp <= 0) {
      blocker.alive = false; // minionSystem culls it next tick
      this.spawnParticles(blocker.x, blocker.y, PARTICLE.death);
    }
    return true;
  }

  /** Human-readable active run modifiers for the build panel. */
  private activeBuffs(): string[] {
    const m = this.mods;
    const out: string[] = [];
    const pct = (v: number): string => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
    if (m.towerDamageMult !== 1) out.push(`${pct(m.towerDamageMult - 1)} tower dmg`);
    if (m.towerFireRateMult !== 1) out.push(`${pct(m.towerFireRateMult - 1)} fire rate`);
    if (m.splashRadiusMult !== 1) out.push(`${pct(m.splashRadiusMult - 1)} splash`);
    if (m.biomassMult !== 1) out.push(`${pct(m.biomassMult - 1)} biomass`);
    if (m.heroDamageMult !== 1) out.push(`${pct(m.heroDamageMult - 1)} hero dmg`);
    if (m.heroCooldownMult !== 1) out.push(`-${Math.round((1 - m.heroCooldownMult) * 100)}% hero cd`);
    if (m.needleExtraProjectiles > 0) out.push(`+${m.needleExtraProjectiles} needle`);
    if (m.fractureBonusStacks > 0) out.push(`+${m.fractureBonusStacks} fracture cap`);
    if (m.mortarAppliesFracture) out.push('mortar applies Fracture');
    if (m.reactorOverchargeBonus > 0) out.push(`${pct(m.reactorOverchargeBonus)} overcharge`);
    if (m.mortarPoolDurationMult !== 1) out.push(`${pct(m.mortarPoolDurationMult - 1)} pool time`);
    if (m.poolDpsMult !== 1) out.push(`${pct(m.poolDpsMult - 1)} pool dmg`);
    if (m.reactorBiomassMult !== 1) out.push(`${pct(m.reactorBiomassMult - 1)} reactor biomass`);
    if (m.corrosionSlowBonus > 0) out.push(`${pct(m.corrosionSlowBonus)} corrosion slow`);
    if (m.parasiteInfectionMult !== 1) out.push(`${pct(m.parasiteInfectionMult - 1)} infection dmg`);
    if (m.obeliskVulnerabilityBonus > 0) out.push(`${pct(m.obeliskVulnerabilityBonus)} vulnerability`);
    if (m.obeliskSlowBonus > 0) out.push(`${pct(m.obeliskSlowBonus)} disrupt slow`);
    // Timed run-wide buffs (e.g. the Overseer's Mass Override) — shown with their countdown.
    for (const b of this.runBuffs) out.push(`${b.label} (${Math.ceil(b.remaining)}s)`);
    return out;
  }

  getRenderState(): RenderState {
    return {
      enemies: this.enemies,
      towers: this.towers,
      projectiles: this.projectiles,
      pools: this.pools,
      floats: this.floats,
      particles: this.particles,
      heroes: this.heroes,
      minions: this.minions,
      phase: this.phase,
      selectedTower: this.selectedTower,
      selectedPlacedId: this.selectedPlacedId,
      movingTowerId: this.movingTowerId,
      armedAbility: this.armedAbility,
      unlockedSlots: this.unlockedSlots,
      time: this.time,
      integrity: this.integrity,
      maxIntegrity: this.maxIntegrity,
      emergency: this.emergencyActive,
      emergencyRamp: this.emergencyRamp,
      emergencyFocusX: this.emergencyFocusX,
      emergencyFocusY: this.emergencyFocusY,
      effectiveRanges: this.towerEffectiveRange,
      biome: { id: this.activeBiome.id, name: this.activeBiome.name, accent: this.activeBiome.accent },
      biomeFlash: this.biomeFlash,
      hazardActive: hazardActive(this.activeBiome, this.time),
    };
  }

  getSnapshot(): HudSnapshot {
    const h = this.primaryHero;
    const ab = HERO_DEFS[h.kind].ability;
    return {
      phase: this.phase,
      wave: this.waveIndex,
      totalWaves: this.totalWaves,
      biomass: Math.floor(this.biomass),
      integrity: Math.ceil(this.integrity),
      maxIntegrity: this.maxIntegrity,
      kills: this.kills,
      hero: {
        kind: h.kind,
        down: h.down,
        respawn: h.respawn,
        hp: Math.ceil(h.hp),
        maxHp: h.maxHp,
        shield: Math.ceil(h.shield), // 0 when no shield (zeroed on expiry in updateHero)
        abilityReady: h.abilityCd <= 0 && !h.down,
        abilityCd: Math.max(0, h.abilityCd),
        abilityCdMax: ab.cooldown * this.hmods(h).heroCooldownMult * this.activeBiome.mods.heroCooldownMult * this.heroProgress[h.kind].cooldownMult,
      },
      enemiesAlive: this.enemies.length,
      emergency: this.emergencyActive,
      draft: this.draft ? this.draft.map(cardToOption) : null,
      selectedTower: this.selectedTower,
      selectedPlaced: this.selectedPlacedView(),
      armedAbility: this.armedAbility,
      cards: this.chosenCards,
      buffs: this.activeBuffs(),
      bossBanner: this.bossBanner(),
      mutation:
        this.mutation && this.time - this.mutation.at < MUTATION_BANNER_LIFE
          ? { id: this.mutation.id, title: this.mutation.title, sub: this.mutation.sub, branchId: this.mutation.branchId, color: this.mutation.color }
          : null,
      endless: this.mode === 'endless',
      biome: {
        id: this.activeBiome.id,
        name: this.activeBiome.name,
        accent: this.activeBiome.accent,
        modifier: this.activeBiome.modifierName,
        hazardName: this.activeBiome.mods.hazard.name,
        hazardActive: hazardActive(this.activeBiome, this.time),
      },
      runEvent: this.activeRunEvent,
      runHeadline: this.runPlan?.headline || undefined,
      anticipation: this.nextAnticipation(),
      autoStart: this.autoStart,
      autoStartIn: this.autoStart && this.phase === 'prep' ? Math.max(0, this.prepCountdown) : 0,
    };
  }

  /** Upcoming named beats so the player ALWAYS has something to look forward to (the pacing
   * "always something to anticipate" hook). Pure read-model — never touches the sim. */
  private nextAnticipation(): string[] {
    if (this.phase === 'won' || this.phase === 'lost') return [];
    const out: string[] = [];
    if (this.mode === 'endless') {
      const nextBoss = (Math.floor(this.waveIndex / DIRECTOR.bossEvery) + 1) * DIRECTOR.bossEvery;
      out.push(`Boss at depth ${nextBoss}`);
      // Next Gene Card depth: simulate the cadence counter forward so the slower endless drip stays
      // anticipated, not just absent (CARDS.md §1). During a wave the current depth can still grant
      // the card (its draft hasn't resolved); in prep that decision is already behind us.
      let since = this.wavesSinceDraft;
      let depth = this.phase === 'wave' ? this.waveIndex - 1 : this.waveIndex;
      do { depth++; since++; } while (since < endlessDraftInterval(depth));
      out.push(`Gene Card at depth ${depth}`);
      return out;
    }
    const w = Math.max(0, this.waveIndex);
    // The finale boss: a campaign stage names its generated boss; the authored stage, the Tyrant.
    const bossName = this.stage ? this.stage.boss.name : ENEMY_DEFS.tyrant.name;
    if (w < this.totalWaves) out.push(`${bossName} at wave ${this.totalWaves}`);
    if (this.stage?.miniBoss && w < this.stage.miniBossWave) out.push(`${this.stage.miniBoss.name} at wave ${this.stage.miniBossWave}`);
    // The next wave at which the run-end cache tier upgrades (data-driven via chestForWave).
    const curTier = chestForWave(w);
    for (let nw = w + 1; nw <= this.totalWaves; nw++) {
      if (chestForWave(nw) !== curTier) {
        out.push(`${CHESTS[chestForWave(nw)].name} at wave ${nw}`);
        break;
      }
    }
    return out;
  }

  /** The most-wounded framework boss as a banner snapshot (null if none). */
  private bossBanner(): HudSnapshot['bossBanner'] {
    let worst: Enemy | null = null;
    for (const e of this.enemies) {
      if (!e.boss || !e.alive) continue;
      if (!worst || e.hp / e.maxHp < worst.hp / worst.maxHp) worst = e;
    }
    if (!worst || !worst.boss) return null;
    return {
      name: worst.boss.name,
      hpPct: Math.max(0, worst.hp / worst.maxHp),
      phase: worst.boss.phase + 1,
      phases: worst.boss.phases,
      telegraph: worst.boss.telegraph,
    };
  }

  /** Spawn an authored boss (debug / director). */
  debugSpawnBoss(): void {
    this.spawnBoss(bossDef('progenitor')!);
  }

  /** Assemble + register + spawn a procedural boss at a Threat Level (director/endless). */
  spawnProceduralBoss(tl: number): void {
    const def = assembleBoss(() => this.rng.next(), tl, this.activeBiome.mods.bossChassisBias);
    this.procBosses.set(def.id, def);
    this.spawnBoss(def);
  }

  /** Composition of the wave that Start Wave will launch next (null if none left). */
  getNextWavePreview(): WavePreviewEntry[] | null {
    if (this.mode === 'endless' || this.waveIndex >= this.totalWaves) return null;
    return wavePreview(this.waves[this.waveIndex]);
  }

  /** Per-tower-kind usage accrued this run — banked into permanent mastery at run end. */
  getMasteryAccrual(): MasteryCounts {
    const out = {} as MasteryCounts;
    for (const k of TOWER_ORDER) {
      const a = this.masteryAccrual[k];
      out[k] = { kills: a.kills, damage: a.damage, activeTime: a.activeTime };
    }
    return out;
  }

  /** Per-hero usage accrued this run — banked into permanent hero mastery at run end. */
  getHeroMasteryAccrual(): HeroMasteryCounts {
    const out = {} as HeroMasteryCounts;
    for (const k of HERO_ORDER) {
      const a = this.heroMasteryAccrual[k];
      out[k] = { kills: a.kills, damage: a.damage, activeTime: a.activeTime };
    }
    return out;
  }

  /** Raw statistics observed this run — banked into lifetime stats at run end. */
  getRunStats(): RunStats {
    return {
      kills: this.kills,
      wave: this.waveIndex,
      won: this.phase === 'won',
      biomassEarned: this.statBiomassEarned,
      damageDealt: this.statDamageDealt,
      killsByEnemy: { ...this.statKillsByEnemy },
      towerBuilds: { ...this.statTowerBuilds },
      cardIds: this.chosenCards.map((c) => c.id),
      heroId: this.primaryHero.kind,
    };
  }
}
