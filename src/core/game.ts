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
  FINAL_DEFENSE_TOP_Y,
  HEIGHT,
  REACH_Y,
  WIDTH,
  inFinalDefenseZone,
  nucleusPoint,
  slotAt,
  towerSlots,
} from './map';
import type { NavField, TowerSlot } from './map';
import { DEFAULT_LAYOUT_ID, layoutById, layoutIdForDepth, layoutSpawn, navFieldFor } from './mapLayouts';
import type { MapLayoutDef } from './mapLayouts';
import {
  COMBAT,
  ECON,
  ENEMY_DEFS,
  enemyDeathCue,
  towerFireCue,
  ENEMY_KINDS,
  EVO,
  FX,
  HERO_DEFS,
  HERO_ORDER,
  MOVE,
  PARTICLE,
  PERF,
  HIVE,
  SETTLE,
  SIPHON,
  SIM_DT,
  SLOTS,
  STATUS,
  STEER,
  TOWER_DEFS,
  TOWER_ORDER,
  TOWER_ABILITIES,
  HERO_PULSE,
  HERO_ULT,
  HERO_SKILLS,
  HERO_SKILL_DEFS,
  HERO_AUTOCAST,
  HERO_PHASE_FLASH,
  REVENANT,
  WYRM,
  SYMBIOTE,
  GLAIVE,
  ROOST,
  WAVES,
  AUTO_START_DELAY,
  DRAFT_REROLL,
  DRAFT_FIT,
  SPLICE,
  AUTO_START_FIRST_DELAY,
  MINION_DEFS,
  MINION_CAP,
  GRAVEBIND,
  TOWER_IDLE,
  HIVE_MIND,
} from './config';
import { hivePlan, type HiveAction } from './hivemind';
import { IDLE_BEHAVIORS, towerIdleState } from './towerIdle';
import type { CinematicActor, CinematicMotion, EnemyDef, HeroAbilityDef, HeroDef, MinionDef, ResolvedHeroKit, TowerDef } from './config';
import { DANGER_CAM, initialDangerCamera, stepDangerCamera } from './dangerCamera';
import type { DangerCameraState } from './dangerCamera';
import { initialAssimilation } from './assimilation';
import type { AssimilationState, AssimilationSignals } from './assimilation';
import {
  CARD_POOL,
  applyCard,
  cardRegistry,
  cardToOption,
  defaultRunModifiers,
  draftCards,
  draftFitOf,
  endlessDraftInterval,
  isRuleChangingCard,
} from './cards';
import type { CardContext, CardDef, CardEffect, DraftFit, HookEvent, HookSpec, RunModifiers } from './cards';
import { branchPowerEffects, effectsPower } from './power';
import { HERO_CRIT_BASE, HERO_EVO, HERO_EVO_BY_ID, NEUTRAL_HERO_EVO, deriveHeroEvoMods, heroEvoCost, heroEvoEffects, heroEvoTotalOwned } from './heroEvolution';
import type { HeroEvoLevels, HeroEvoMods } from './heroEvolution';
import { effectiveGeneEffects } from './geneCards';
import { damageAfter, effectiveArmor, fractureCap, shredBurst } from './combat';
import { CHASSIS, assembleBoss, bossDef } from './boss';
import type { BossDef } from './boss';
import { nemesisTraits } from './nemesis';
import { CAMPAIGN_OPENING, DIRECTOR_ADAPTIVE, EARLY_CALL, ENDLESS_SQUEEZE, MINES } from './config';
import { MEGA, NEUTRAL_MEGA_FX, WEAK_POINT_DEFS, campaignMegaFor, createMegaRuntime, foldMegaFx, infiniteMegaFor, megaBossDef, rushMegaFor } from './megaboss';
import type { MegaAbility, MegaBossDef, MegaEncounter, MegaFieldFx, MegaMotif, MegaRuntime, MegaWeakPoint } from './megaboss';
import { BOSS, BEAM, DIRECTOR, REACTIONS, RUSH, CHESTS, chestForWave, rushStrength, spawnCount } from './config';
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
import { liveProbe, promoteEliteShare, swapInProbe } from './campaign';
import type { LiveProbe } from './campaign';
import { COVERAGE_AXIS_NAME } from './coverage';
import { NEUTRAL_BIOME, biomeForDepth, hazardActive } from './biomes';
import { heroIdentity } from './heroIdentity';
import type { HeroIdentity } from './heroIdentity';
import type { Biome } from './biomes';
import type { DifficultyDef } from './difficulty';
import { resolveDoctrine } from './doctrines';
import type { DoctrineWarp } from './doctrines';
import { combinedVowWarp, composeWarps } from './vows';
import { createDirector } from './difficultyDirector';
import type { RunDirector } from './difficultyDirector';
import { combineMult } from './modifiers';
import { sortByProfile } from './targeting';
import type { TargetingProfile } from './targeting';
import { applyMutators } from './mutators';
import { EventBus, gameEvents } from './events';
import type { GameEventMap } from './events';
import { branchesFor, branchRegistry, resolveBranchKit } from './branches';
import { resolveStrain, strainRegistry, strainPowerEffects } from './strains';
import type { StrainHooks } from './strains';
import { CONVEYOR, deployCost, strainCost, recycleValue, rollKind, rollRarity, growDuration, openingAnswerKinds } from './conveyor';
import type { ConveyorItem } from './conveyor';
import { NEUTRAL_EFFECTS, combinedEffects } from './dailyModifiers';
import type { ResolvedEffects } from './dailyModifiers';
import type { Branch, ResolvedBranchKit } from './branches';
import { BRANCH_COSTS } from './config';

const EMPTY_STR: readonly string[] = []; // shared no-alloc default for per-cast mutator lists
const SUPPORT_BRANCH_PULSE = 2.0; // seconds between a branched support tower's (Reactor) ability pulses
const BRANCH_HITSTOP = 0.12; // seconds the view-loop freezes on a tier purchase (a juicy "impact" beat)
const KILL_FRACTURE_RANGE = 78; // Viral Payload — on-kill Fracture-splash radius (px)
const HERO_CORROSION_RANGE = 92; // Toxic Aura — the hero's passive Corrosion aura radius (px)
const MUTATION_BANNER_LIFE = 2.4; // seconds the tier-purchase banner is surfaced to the HUD

export type RunMode = 'stage' | 'endless' | 'campaign' | 'bossRush' | 'daily';

/** Options a run can boot with. */
export interface RunOptions {
  runEffects?: CardEffect[];
  nucleusEffects?: CardEffect[]; // resolved Nucleus chamber organs (docs/NUCLEUS.md) — boot fold; empty/omitted ⇒ byte-identical // run-start effects folded into the R-bucket (e.g. equipment)
  mode?: RunMode; // 'stage' = authored WAVES (default, golden path); 'endless' = AI Director; 'campaign' = generated stage; 'bossRush' = escalating boss gauntlet (docs/BOSS-RUSH.md); 'daily' = the day's shared challenge (docs/DAILY-RUN.md)
  difficulty?: string; // universal difficulty id (default 'standard' = identity/golden path)
  doctrine?: string; // exclusive run-start build commitment (default 'none' = no effects)
  vows?: string[]; // armed Molt Vows (docs/VOWS.md) — cycle-wide handicap warps composed ONTO the doctrine's; absent/[] ⇒ identity (golden path). Dailies never pass this (fair shared board).
  threat?: number; // THREAT LADDER level (docs/THREAT.md) — stacked warp rungs composed LAST through the director. 0/omitted ⇒ identity (golden path); the meta layer passes it only on solved content (Campaign replays / Infinite / Boss Rush)
  sectorWarp?: DoctrineWarp; // THE FRONT deploy flavor (docs/INFESTATION.md §front) — a region warp composed onto doctrine × vows for ONE explicitly-deployed run. Absent ⇒ identity (golden path); dailies/Arena never pass it (fair shared boards).
  stage?: StageConfig; // campaign mode: the procedurally generated stage to run (campaign.ts)
  heroRoster?: HeroKind[]; // the fielded hero slots (HEROES.md). Omitted / [heroKind] ⇒ single hero (golden path)
  heroEquip?: Partial<Record<HeroKind, CardEffect[]>>; // PER-HERO equipment effects — each hero's gear affects only that hero
  setEffects?: CardEffect[]; // TEAM set bonuses — set pieces pooled across the fielded roster (2pc/4pc), folded ONCE. Empty ⇒ golden-safe
  heroAbilityKits?: Partial<Record<HeroKind, ResolvedHeroKit>>; // per-hero EFFECTIVE abilities (base + star forks). Absent ⇒ the base kit (golden-safe)
  geneLevels?: Record<string, number>; // permanent gene-card levels (docs/GENE-EVOLUTION.md) — drafted cards apply at these levels. Empty ⇒ base effects (golden path)
  geneTranscends?: Record<string, string>; // chosen Transcendence option per card id (§Transcendence) — folds through the SAME effectiveGeneEffects path. Empty ⇒ no second lines (golden path)
  favorite?: TowerKind; // the account's FAVORITE tower (docs/STRAIN.md §conveyor) — always deployable; default 'needle'
  unlocked?: TowerKind[]; // the OWNED tower roster this run (docs/TOWERS.md §expansion unlock gate):
  // gates placement, the conveyor's kind rolls, and the draft pool. Omitted ⇒ ALL kinds (the
  // golden path — tests/autoplay/probes construct without it and are byte-identical).
  startingGenes?: string[]; // Starting Gene Loadout: card ids that AUTO-ACTIVATE at run boot (each at its permanent level). Empty/omitted ⇒ nothing applied (golden path)
  unlockedCardIds?: readonly string[]; // PROGRESSION-gated gene-card ids (CardDef.unlock) the account has earned — injected into the draft pool. Omitted ⇒ only ungated cards (golden path)
  draftPool?: readonly string[]; // DISCOVERED gene-card ids (docs/CARDS.md §discovery) — when present, drafts draw ONLY these (∩ the other gates). Omitted ⇒ legacy pool (golden path unchanged)
  /** DRAFT FIT (docs/CARDS.md §fit): deal by relevance (live damage shares, banked Biomass, recency),
   *  keep the rule slot to fielded subjects, and stamp each open offer's fit (◆PICK). The app decides
   *  via cards.ts draftFeaturesFor. Omitted ⇒ the uniform deal (golden path byte-identical). */
  draftFit?: boolean;
  /** OPENING DRAFT (docs/CARDS.md §opening): the run opens with a draft before wave 1 (Campaign —
   *  the app decides). Omitted ⇒ none (golden path). */
  openingDraft?: boolean;
  /** SPLICE (docs/CARDS.md §splice): banked Biomass buys an extra draft in the build phase (a recorded
   *  input — core/replay.ts). Omitted ⇒ off (golden path). */
  splice?: boolean;
  /** THE AUTOMATION GATE (docs/HIVE-MIND.md §solved-content): may this run use Hive Intelligence +
   *  Auto Gene? The META layer decides from the save (core/hivemind.ts automationGate — solved
   *  content only) and passes the verdict; the sim never reads the save. Omitted ⇒ false (fail
   *  closed). Never affects the sim itself — only whether the pulse may act. */
  automationAllowed?: boolean;
  // Daily Run (docs/DAILY-RUN.md): the day's TWO modifier ids, resolved once at boot into the
  // neutral-defaulted ResolvedEffects struct the sim reads. Omitted ⇒ NEUTRAL (golden path).
  // The day's 3-tower Conveyor pool rides the existing `unlocked` + `favorite` options.
  daily?: { modifierIds: string[] };
  // Daily MEGA variant (docs/MEGA-BOSS.md §daily): the run IS one evolving Mega Boss encounter —
  // no wave plan, periodic reinforcements, ends when the Hive or the boss dies. Omitted ⇒ normal.
  megaDaily?: MegaEncounter;
  /** The account's NEMESIS (docs/NEMESIS.md): a boss with this defId spawns BUFFED (+15%/slay
   *  hp, +10%/slay bounty, both capped) and marked. Excluded from Daily runs (shared gauntlet). */
  nemesis?: { defId: string; slain: number };
  /** Suppress ALL Mega Boss encounters this run (docs/ARENA.md §ruleset — arena matches are
   *  wave-vs-wave by design). One gate at spawnMegaBoss covers every mode. Absent/false ⇒
   *  unchanged cadence (golden-safe). */
  noMega?: boolean;
  /** BOSS RUSH ONLY (docs/BOSS-RUSH.md §wall): the account Power Score the gauntlet is sized to —
   *  boss HP × clamp((rushPower / RUSH.powerRef)^RUSH.powerExp, RUSH.powerScaleMin, ∞). The meta
   *  layer passes meta.power().score at launch (recorded in the replay ctor args like every option).
   *  Omitted ⇒ RUSH.powerRef (×1 — the probe-tuned curve); ignored by every other mode. */
  rushPower?: number;
  /** DEV/INSTRUMENT ONLY (docs/TOWER-IDLE.md §5): disable the idle-posture layer entirely —
   *  postures stay 0, banks never fill, field towers resume their legacy empty pulses. The
   *  sim then reproduces the PRE-IDLE behavior exactly (the A/B baseline for the balance
   *  instrument + the isolation regression test). Shipping UI never sets this. */
  disableIdle?: boolean;
  /** PIN the arena layout (docs/MAP-LAYOUTS.md) by id — overrides the stage's layout and
   *  Infinite's rotation. Absent ⇒ stage.layout (Campaign/Daily) → Infinite's depth rotation →
   *  the classic arena (Skirmish, tutorial, golden autoplay — byte-identical). */
  layout?: string;
  /** EARLY CALL (docs/EARLY-CALL.md): may the player call the next wave mid-wave for a Biomass
   *  bonus (callWaveEarly)? The app passes true for every run except the tutorial; the Arena never
   *  does. Omitted ⇒ false (golden-safe: autoplay never calls). */
  earlyCall?: boolean;
  /** LIVE ADAPTIVE THREAT (docs/DIFFICULTY_DIRECTOR.md §6a), Campaign only: the account's Power ÷
   *  the stage's recommended Power at boot. Present ⇒ waves ≥ DIRECTOR_ADAPTIVE.liveFromWave and
   *  every boss body scale with the run's live Power ratio. Omitted ⇒ ×1 (golden-safe). */
  livePowerBase?: number;
  /** INFINITE SQUEEZE (config ENDLESS_SQUEEZE — docs/ENDLESS-SCALING.md §squeeze): the pressure band
   *  + the per-wave breach ceiling. The app passes it for Infinite; the Arena never. Omitted ⇒ off. */
  squeeze?: boolean;
}

/** Fold a declarative effect into the run modifiers (mul/add/flag; grants handled at boot). */
function applyRunEffect(mods: RunModifiers, e: CardEffect): void {
  if (e.op === 'mul') mods[e.field] *= e.value;
  else if (e.op === 'add') mods[e.field] += e.value;
  else if (e.op === 'flag') mods[e.field] = true;
  else if (e.op === 'set') mods[e.field] = e.value;
}

/** RunModifier fields the sim reads PER-HERO (via the hmods(h) accessors / heroMaxHpFor). A hero's
 *  equipment effect on one of these folds into THAT hero's private bundle; EVERY other field is
 *  battlefield-GLOBAL (towers, economy, and the hero AURA read this.mods — note the hero-prefixed
 *  aura fields are global, not per-hero) and folds into the shared bucket so a hero's gear — item
 *  bases AND set bonuses — reaches the board. Keep in sync with the hmods(h) read sites below. */
const HERO_SCOPED_FIELDS: ReadonlySet<keyof RunModifiers> = new Set<keyof RunModifiers>([
  'heroDamageMult', 'heroSpeedMult', 'heroAttackSpeedMult', 'heroCooldownMult', 'heroAbilityRadiusMult',
  'heroHealingMult', 'heroCritChance', 'heroCritDamageBonus', 'heroAnchor', 'heroAggroRangeMult',
  'heroRetreatThreshold', 'heroLifestealFrac', 'heroThornsFrac', 'heroArmor', 'heroMaxHpMult',
]);
import type {
  CombatClass,
  Enemy,
  SporeMine,
  EnemyKind,
  Hero,
  HeroKind,
  HeroMasteryCounts,
  HeroProgress,
  HeroSymbioteKit,
  HudSnapshot,
  HeroCooldownView,
  HeroStatusChip,
  SelectedHeroView,
  MasteryCounts,
  MetaModifiers,
  Minion,
  Particle,
  Phase,
  Pool,
  Projectile,
  ProjectileBehavior,
  RunStats,
  MegaKillStat,
  SelectedPlacedTower,
  TowerSellQuote,
  StatusType,
  Tower,
  TowerKind,
  TowerMods,
  TowerProgress,
  FloatingText,
  EnemyShell,
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
    if (e) {
      e.count += n;
      if (g.elite) e.elite = (e.elite ?? 0) + n;
    } else {
      const entry: WavePreviewEntry = g.elite ? { kind: g.kind, count: n, elite: n } : { kind: g.kind, count: n };
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
  enemyShells: EnemyShell[]; // artillery bombardment in flight (drawn as arcing lobs)
  pools: Pool[];
  corruptionPools: { x: number; y: number; r: number; t: number; frac: number }[]; // boss corruptor zones (docs/BOSS-DESIGN.md §siege)
  mortarStrikes: { x: number; y: number; r: number; t: number; suppress: number }[]; // ARTILLERY signature: reticles counting down to impact (docs/BOSS-DESIGN.md §identity)
  nullWells: { x: number; y: number; r: number; t: number }[]; // CONTROLLER signature: projectile-swallowing wells
  floats: FloatingText[];
  particles: Particle[];
  heroes: Hero[];
  minions: Minion[];
  phase: Phase;
  selectedTower: TowerKind | null;
  selectedPlacedId: number | null; // a placed tower the player is inspecting (branch highlight)
  movingTowerId: number | null; // a placed tower picked up for relocation (move-mode highlight + holo)
  selectedHero: HeroKind | null; // the player-selected hero (draws the selection ring) — null = none
  armedAbility: boolean;
  unlockedSlots: number;
  time: number; // sim seconds — drives presentation pulses/animation
  fxTime: number; // presentation clock: seconds STEPPED, settle beat included (where `time` freezes) — the wind-down's gore rides it
  hiveAttackers: number; // enemies locked onto the Core (siege-crust rendering intensity)
  hiveHitPulse: number; // 0..1 impact accumulator — the renderer's shudder/flash signal
  integrity: number;
  maxIntegrity: number;
  // Emergency Defense Mode (docs/RANGE.md §4) — render-only.
  emergency: boolean; // an enemy is in the Final Defense Zone (drives the alert visuals)
  dangerIntensity: number; // danger-camera smoothed 0..1 (docs/CAMERA.md) — every tension effect keys on this
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
  layoutId: string; // the active arena layout (docs/MAP-LAYOUTS.md) — the renderer draws its obstacles
  hazardActive: boolean; // the biome's hazard pulse is firing right now (telegraph)
  // Mega Boss (docs/MEGA-BOSS.md) — null on every run without one (the overwhelming majority).
  megaBoss: MegaBossView | null;
  megaShots: MegaShot[]; // raid-fire tracers (tower/hero → weak point / body); empty otherwise
  mines: SporeMine[]; // Blight Sower spore mines (docs/SOWER.md); empty on every other run
  deathEvents: DeathEvent[]; // one-shot ENEMY-DEATH descriptors for the assimilation VFX (render/gore.ts)
  castEvents: CastEvent[]; // one-shot hero-CAST descriptors for the ability cinematics (render/abilityCinematics.ts)
  // LIVING BATTLEFIELD (docs/LIVING-BATTLEFIELD.md) — read-only run signals the render-side biomass
  // accumulator folds (with rs.towers/heroes/biome + the render maps) into the arena's evolution
  // stage. Pure snapshot reads of counters the sim already tracks ⇒ no sim math touched ⇒ golden-safe.
  assimilation: { wave: number; kills: number; bossKills: number; megaKills: number };
}

/** A single enemy death, surfaced for the ASSIMILATION gore system (render/gore.ts) — the renderer
 *  seq-ingests these to explode gibs + route coalescing chunks. Presentation-only: the buffer never
 *  affects wave/kills/integrity/biomass, so the golden sim is unperturbed. */
export interface DeathEvent {
  seq: number; // monotonic id — the renderer ingests each event exactly once (decoupled from draw rate)
  x: number;
  y: number;
  color: string; // the enemy's body colour (viscera tint)
  overkill: number; // 0..~1.5 — how far past 0 the killing blow drove hp ⇒ burst strength
  bounty: number; // base biomass value ⇒ the relative-scale reference for piece counts
  killerKind: TowerKind | null; // credited tower kind (nearest instance = the visual XP target); null ⇒ hero/other
  flying: boolean;
}

/** A single hero-ability cast, surfaced for the ABILITY CINEMATICS layer
 *  (render/abilityCinematics.ts, docs/HERO-CINEMATICS.md) — the renderer seq-ingests these to
 *  stage the cast's procedural set-piece performance (the Cinderwyrm's dragon swoop, the Fovea's
 *  eye-beam). Presentation-only: nothing in the sim reads the buffer back — the payload's LANDING
 *  timing is owned by the pendingImpacts queue, not by this feed. */
export interface CastEvent {
  seq: number; // monotonic id — the renderer ingests each cast exactly once (mirrors DeathEvent)
  hero: HeroKind;
  name: string; // resolved ability name (fork renames ride along)
  slot: 'ult' | 0 | 1 | 'echo'; // which verb fired ('echo' = the symbiote aftershock — always instant)
  x: number; // impact-zone center
  y: number;
  fromX: number; // the caster's stance when the cast began (beams/lobs/lunges launch here)
  fromY: number;
  radius: number; // resolved zone radius (ability × gear/evolution range mult; pools included)
  color: string; // fork-resolved fxColor (falls back to the hero's identity color)
  actor: CinematicActor;
  motion: CinematicMotion;
  delay: number; // seconds until the payload lands — the performance's travel window
  at: number; // sim time of the cast (performances run on sim time ⇒ pause/speed stay in sync)
}

/** The sim half of a cinematic cast (docs/HERO-CINEMATICS.md): the zone payload
 *  (explosion/debuff/pool) scheduled to LAND when the performance strikes. Crit + damage
 *  multipliers were resolved at cast (no rng at impact); enemies are re-queried at the stored
 *  point when it fires — the blow hits whatever stands in the zone when it lands. */
interface PendingImpact {
  at: number; // sim time the payload lands
  x: number;
  y: number;
  comps: AbilityComponent[]; // the zone payload (explosion/debuff/pool), fork-resolved
  damageMult: number;
  rangeMult: number; // cast-time ability radius mult (gear × evolution)
  hero: HeroKind;
  particle?: ParticleKind; // the landing burst (deferred from cast time)
  fxColor?: string;
  ult?: boolean; // the hero's ULTIMATE (the view stages an impact frame on its landing)
  radius?: number; // resolved zone radius (presentation: the impact bloom's extent)
}

/** Component types that LAND with the cinematic impact; everything else in a kit
 *  (heal/shield/buff/summon…) stays instant at cast — support must never feel laggy. */
const IMPACT_COMP_TYPES: ReadonlySet<AbilityComponent['type']> = new Set(['explosion', 'debuff', 'pool']);

/** An instant raid-fire tracer (tower/hero → weak point / body chip). Presentation-only. */
export interface MegaShot {
  x0: number; y0: number; x1: number; y1: number;
  life: number; // seconds left (fades out)
  color: string;
}

/** The renderer/HUD view of the live Mega Boss (a snapshot of MegaRuntime + its def identity). */
export interface MegaBossView {
  defId: string;
  name: string;
  title: string;
  palette: { body: string; glow: string; accent: string };
  motif: MegaMotif; // per-def anatomy suite (render/megaboss.ts drawMotif)
  bodyFrac: number;
  anchorY: number;
  hp: number;
  maxHp: number;
  phase: number;
  phases: number;
  visualTier: number;
  telegraph: { kind: string; frac: number } | null; // frac 0→1 across the windup (the counterplay read)
  stunned: number; // seconds of rotation stun left (eye interrupt feedback)
  stagger: number; // posture meter 0..1 (weak-point ruptures fill it)
  staggered: boolean; // TOPPLED — organ windows frozen, body takes bonus damage
  exposed: boolean; // heart window — the renderer floods the body with glow
  deathT: number; // > 0: the death sequence is playing
  burrow: number; // §dormancy 0 surfaced → 1 buried between waves (presentation only)
  weakPoints: MegaWeakPoint[];
  effects: string[]; // short HUD labels for the live manipulations (e.g. 'HASTE', 'LEECH')
  // LONE SIEGE (docs/MEGA-BOSS.md §lone siege): null while shepherding a wave. While sieging,
  // windupFrac is the live HIVE LASH charge (0 between lashes, 0→1 across a windup) — the
  // renderer's reaching-arm + strike-warning read.
  siege: { windupFrac: number } | null;
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
  /** Where this sim's gameplay events go (core/events.ts). The player's own run keeps the app-wide
   *  bus. A sim that is NOT the player's run (the replay theater, the Arena opponent's mirror,
   *  replay verification) calls isolateEvents(), so its kills never reach the player's save,
   *  toasts or the live run's view. Emission stays hasListeners-gated either way. */
  events: EventBus<GameEventMap> = gameEvents;

  /** Give this sim a private event bus (returned for the caller's own listeners). */
  isolateEvents(): EventBus<GameEventMap> {
    this.events = new EventBus<GameEventMap>();
    return this.events;
  }

  phase: Phase = 'prep';
  /** Combat→Build settle countdown (s). > 0 after the last enemy dies: the wave is cleared but
   * the phase hasn't flipped yet — the battlefield winds down (see step's settle branch). */
  private settleTimer = 0;
  // LAST-KILL beat bookkeeping (docs/SIGNATURE-MOMENTS.md §1) — presentation only: where/how the
  // most recent enemy LEFT the field (rank 0 breach/devoured · 1 kill · 2 boss kill · 3 the Mega),
  // the waves a boss / the Mega fell in, and the wave whose `waveLastKill` already fired. Written on
  // eviction, read only to build that event ⇒ nothing in the sim reads it (goldens byte-identical).
  private readonly lastOut = { x: 0, y: 0, rank: 0, step: -1, wave: 0, bossWave: 0, megaWave: 0, sentWave: 0 };
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
  // The arena LAYOUT (docs/MAP-LAYOUTS.md) + the NavField this Game owns for it — every flow/
  // goal-distance query resolves here, so concurrent Games never share map state. Infinite
  // re-points it as biomes rotate (unless pinned).
  private layout: MapLayoutDef;
  private nav: NavField;
  private readonly layoutPinned: boolean;
  private readonly goalDistance = (px: number, py: number): number => this.nav.goalDistanceAt(px, py);
  private biomeFlash = 0; // render-only: eased 1→0 after an Infinite-mode biome transition (surfaced via RenderState)
  // Run Identity (docs/RUN-IDENTITY.md): a seed-derived plan of discrete per-wave EVENTS + a run-wide
  // ANOMALY, layered onto Campaign/Endless via a DEDICATED rng stream (never this.rng). null in Stage
  // ⇒ every wave read is a no-op ⇒ the golden autoplay never drifts.
  private runPlan: RunPlan | null = null;
  private runEventRng: Rng;
  private activeRunEvent: { name: string; desc: string; kind: string } | null = null; // current wave's beat (HUD telegraph)
  // Daily Run (docs/DAILY-RUN.md): the day's two modifiers resolved into ONE neutral-defaulted
  // struct (mults 1 / adds 0 ⇒ every hook read is golden-safe without them) + a dedicated rng for
  // Infestation's elite rolls (never consumed unless that modifier is live).
  private readonly dailyFx: ResolvedEffects;
  private readonly dailyRng: Rng;
  // Universal difficulty (global scalars layered on the base curves); 'standard' = identity.
  private readonly diff: DifficultyDef;
  // The Universal Difficulty Director — the run's whole scaling policy (difficulty × doctrine
  // warp × stage axes × curves). The sim APPLIES its factors; it never composes balance inline.
  private readonly dd: RunDirector;
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
  /** Monotonic fixed-step counter — THE sim clock for input recording/replay
   *  (docs/SECURITY-AUDIT.md R1). Purely observational: nothing reads it. */
  stepCount = 0;
  timeScale = 1;
  // Auto-start: when on, prep auto-advances to the next wave after a countdown. Off by default
  // (a player QoL toggle); the manual-start golden run never touches it.
  autoStart = false;
  // Primary-hero AUTO-CAST (docs/HEROES.md): a one-time in-run Biomass unlock, then a free toggle.
  // Both default OFF ⇒ the primary hero stays player-triggered and the golden run never auto-casts.
  autocastUnlocked = false;
  autocastOn = false;
  // TUTORIAL GATE (docs/TUTORIAL.md): set only by the TutorialRunner, never on a golden run.
  // While on, the game defers its self-driven beats to the tutorial director: natural post-wave
  // drafts are HELD (the director releases one exactly when the gene-card lesson teaches it) and
  // auto-start stays inert — so the lessons and the live game can never desync.
  tutorialMode = false;
  // Tutorial READ-MODEL (docs/TUTORIAL.md §accuracy): the lesson's scripted wave count. When > 0
  // the HUD snapshot reports it as the run length and drops the host stage's finale
  // anticipations (boss / cache tiers), so the lesson never advertises a 12-wave run it won't
  // play. Presentation only — no sim system reads it (golden-safe: 0 everywhere else).
  tutorialWaves = 0;
  // Auto-start ARMING gate (mode-agnostic): even with autoStart ON, the countdown stays frozen
  // until the player takes their FIRST setup action this run — places a tower OR manually starts
  // wave 1. This stops an armed Auto Wave from firing (and taking damage) before the player has
  // built anything. Latched once, true for the rest of the run. Centralized here so EVERY mode
  // (campaign/infinite/tutorial/challenge/future) inherits it with no per-mode code.
  private autoStartReady = false;

  enemies: Enemy[] = [];
  towers: Tower[] = [];
  projectiles: Projectile[] = [];
  pools: Pool[] = [];
  private nemesisSpec: { defId: string; slain: number } | null = null; // docs/NEMESIS.md — spawn-time boss buff
  private readonly noMega: boolean; // docs/ARENA.md §ruleset — suppress every Mega Boss encounter (PvP)
  private readonly rushHpScale: number; // Boss Rush §wall: the account-sizing factor S (1 in every other mode); blended in by depth (rushSizing)
  private rushColumnDue = 0; // Boss Rush §wall: sim time the NEXT column marches in regardless (0 = no column pending)
  private readonly disableIdle: boolean; // docs/TOWER-IDLE.md §5 — dev/instrument A/B flag (legacy sim)
  // ── Idle-posture run counters (docs/TOWER-IDLE.md §7) — surfaced to the balance instrument. ──
  idleOpeners = 0; // charged windup/reserve payloads released
  idleRangingShots = 0; // idle suppression casts fired (Spore Drift …)
  idleBiomass = 0; // biomass trickled by unengaged towers
  idleMended = 0; // Nucleus integrity mended by unengaged towers
  floats: FloatingText[] = [];
  particles: Particle[] = [];
  deathEvents: DeathEvent[] = []; // presentation-only ENEMY-DEATH buffer for the assimilation gore VFX
  private deathSeq = 0; // monotonic id for one-shot render ingest
  castEvents: CastEvent[] = []; // presentation-only hero-CAST buffer for the ability cinematics (docs/HERO-CINEMATICS.md)
  private castSeq = 0; // monotonic id for one-shot render ingest
  // Scheduled cinematic payloads (docs/HERO-CINEMATICS.md) — the sim half of impactDelay. Empty
  // on any run that never casts a hero ability (the golden autoplay) ⇒ zero per-tick work, no rng.
  private pendingImpacts: PendingImpact[] = [];
  minions: Minion[] = []; // summoned friendly units (empty on the golden path → byte-identical)
  enemyShells: EnemyShell[] = []; // artillery shells in flight (empty on the golden path)
  /** Danger-camera state machine (docs/CAMERA.md) — RENDER-ONLY; no sim system reads it. */
  readonly dangerCam: DangerCameraState = initialDangerCamera();
  /** Assimilation Index master state (docs/ASSIMILATION.md) — the run's hidden 0..1 "how thoroughly
   *  have I taken the battlefield" signal that every dynamic presentation system keys on. RENDER-ONLY
   *  (stepped by the view from assimilationSignals()); no sim system reads it ⇒ golden-safe. */
  readonly assimilation: AssimilationState = initialAssimilation();
  // The active hero roster. One today (the selected hero); the array is the seam for
  // future hero slots (HEROES.md) — slot unlocks just push more heroes in.
  heroes: Hero[];
  mods: RunModifiers;
  // Hero Evolution (docs/HERO-EVOLUTION.md) — the in-run BIOMASS sink. Per-category levels bought
  // this run + the derived live multiplier bundle, applied to EVERY hero (and any unlocked mid-run).
  // Run-only: constructed empty, never saved, reset by a fresh Game. Neutral bundle ⇒ golden-safe.
  private heroEvoLevels: HeroEvoLevels = {};
  private evo: HeroEvoMods = NEUTRAL_HERO_EVO;
  // Flat max-HP granted mid-run by `heroHp` card effects (Battle Stims, Thick Hide…), per hero kind.
  // Folded into heroMaxHpFor so a max-HP recompute (Vitality) never drops it. Empty ⇒ golden-safe.
  private heroFlatMaxHp: Partial<Record<HeroKind, number>> = {};
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
  private statIntegrityLost = 0; // cumulative Nucleus integrity damage taken (0 = flawless run)
  private statKillsByEnemy: Record<EnemyKind, number> = zeroEnemyCounts();
  private statTowerBuilds: Record<TowerKind, number> = zeroTowerCounts();
  // Defeat debrief ledgers (docs/REWARD-PRESENTATION.md §debrief) — read-only observation, like
  // the stats above: WHO hurt the Hive (enemy kind, or `boss:`/`mega:` + display name) and the
  // framework bosses actually slain BY NAME (killsByEnemy books them under the 'tyrant' proxy).
  private statHiveDamageBy: Record<string, number> = {};
  private statBossesSlain: string[] = [];

  // Raw effects of gene cards drafted this run — retained so the run's TEMPORARY Power bucket can be
  // scored live (effectsPower) for the HUD/menus. Reset per run (fresh Game). Golden-safe: unused by sim.
  private chosenCardEffects: CardEffect[] = [];
  // Permanent gene-card levels (docs/GENE-EVOLUTION.md) — a drafted/starting card applies its EFFECTIVE
  // effects at the player's level. Empty ⇒ base effects everywhere ⇒ golden byte-identical.
  private readonly geneLevels: Record<string, number>;
  private readonly geneTranscends: Record<string, string>;
  selectedTower: TowerKind | null = null;
  selectedPlacedId: number | null = null; // a placed tower selected for inspection / branch upgrades
  movingTowerId: number | null = null; // a placed tower PICKED UP for relocation (Build Phase) — docs/TOWER-MANAGEMENT.md §3
  /** The player-selected hero (docs/HERO-SELECTION.md) — authoritative in the sim so future hero
   *  abilities key off it. null = nothing selected. Selecting never pauses the run. */
  selectedHeroKind: HeroKind | null = null;
  armedAbility = false;
  draft: CardDef[] | null = null;
  private draftRerolled = false; // one paid re-deal per draft (docs/CARDS.md §reroll)
  sfx: string[] = []; // presentation cue queue (drained by the view: audio + shake)
  chosenCards: CardOption[] = []; // gene cards taken this run

  private rng: Rng;
  private fxRng: Rng; // cosmetic-only stream (particles) — keeps gameplay rng pure
  private grid = new SpatialGrid<Enemy>(WIDTH, HEIGHT, PERF.spatialCell);
  private enemyById = new Map<number, Enemy>(); // O(1) projectile target lookup
  private reactorCount = 0; // cached on tower placement (economy), not per tick
  private bossCount = 0; // # framework bosses on the field (gates the boss system)
  private procBosses = new Map<string, BossDef>(); // assembled boss defs by id (lookup at runtime)
  // ── Mega Boss (docs/MEGA-BOSS.md). Null on every run without one; megaFx stays NEUTRAL then,
  //    so every fold point multiplies by 1 / adds 0 — IEEE-exact ⇒ golden byte-identical. ──
  private mega: MegaRuntime | null = null;
  private megaFx: MegaFieldFx = { ...NEUTRAL_MEGA_FX };
  private megaShots: MegaShot[] = [];
  private megaHitSfxT = -1; // last raid-strike cue time (throttle — beams tick every frame)
  // Hive-guardian override (§targeting): true while the Core is threatened — towers/beams
  // yield raid duty to normal targeting. Derived per tick in megaBossSystem; only read while
  // a mega is live, so it is inert (and never derived) on every other run.
  private megaRaidYield = false;
  // GRAVEBIND (docs/HEROES.md §carrion) — the fielded corpse-raiser, cached at roster boot.
  // Null on every run without one (incl. golden autoplay) ⇒ the death-seam hook is inert.
  private gravebindHero: Hero | null = null;
  private raiseCd = 0; // seconds until the next corpse may rise (GRAVEBIND.cadenceSec)
  // Blight Sower spore mines (docs/SOWER.md) — empty on every run without one (golden-safe).
  mines: SporeMine[] = [];
  private nextMineId = 1;
  private megaRng!: Rng; // dedicated stream (reinforcement mixes / corrupt picks) — never touches this.rng
  private megaDailyEnc: MegaEncounter | null = null; // the Daily Mega variant (opts.megaDaily)
  private runMegaKills: MegaKillStat[] = [];
  private statMegaSeen = false; // any mega encountered this run (gates the RunStats block)
  private statWpDestroyed = 0;
  private statWpKinds = new Set<string>();
  private statMegaInterrupts = 0;
  private statMegaSurvived = 0; // mega abilities that COMPLETED against you
  corruptionPools: { x: number; y: number; r: number; t: number; frac: number }[] = []; // boss corruptor zones (docs/BOSS-DESIGN.md §siege; renderer draws them)
  // Chassis signatures (docs/BOSS-DESIGN.md §identity) — both empty until a signature fires,
  // so every path below is a no-op cost for boss-less (and pre-signature) runs.
  mortarStrikes: { x: number; y: number; r: number; t: number; suppress: number }[] = []; // reticles counting down; impact SUPPRESSES towers under them
  nullWells: { x: number; y: number; r: number; t: number }[] = []; // wells that swallow projectiles crossing them
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
  private rushPending: { at: number; tl: number; ramp: number; hp: number }[] = []; // Boss Rush: staggered boss deployments still due this wave (time-sorted; ramp = the strength curve's HP/damage scale)
  // ── Batch G grind levers (all neutral unless the app opts the run in) ──
  private readonly earlyCallAllowed: boolean; // RunOptions.earlyCall (docs/EARLY-CALL.md)
  private readonly livePowerBase: number | null; // RunOptions.livePowerBase (§6a live adaptive threat; Campaign only)
  private readonly squeezeOn: boolean; // RunOptions.squeeze (ENDLESS_SQUEEZE; Infinite only)
  private waveLaunchedAt = 0; // sim time the latest wave launched (early-call minElapsed)
  private waveSpawnEnd = 0; // last scheduled spawn time of the waves on the field (early-call skip credit)
  private calledAhead = 0; // waves called early since the field last cleared (≤ EARLY_CALL.maxAhead)
  private draftsOwed = 0; // gene drafts the called-over waves still owe — dealt back to back at the clear
  /** The live adaptive multiplier the latest Campaign wave launched with (1 = none) — HUD intel. */
  liveThreat = 1;
  /** Infinite pressure-band HP multiplier (1 = none; ENDLESS_SQUEEZE). */
  squeezePressure = 1;
  private runBossKills = 0; // bosses defeated this run (RunStats.bossKills; Boss Rush rewards key off it)
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
  // ── Hive Siege pressure (docs/HIVE-SIEGE.md §UI): folded once per tick, read by HUD/renderer.
  hiveAttackers = 0; // enemies currently locked onto the Core
  hiveDps = 0; // their summed damage/interval — the incoming-DPS estimate
  hiveRecentDamage = 0; // leaky window of integrity lost (last ~HIVE.recentWindow seconds)
  hiveHitPulse = 0; // render accumulator: kicks on every landed hit, decays fast (shudder/flash)
  private hiveFloatAccum = 0; // banked hive damage toward ONE aggregated float per beat
  private statMaxStrain = 1; // deepest strain reached this run (latched — survives sells)
  private statStrains = 0; // strain evolutions committed this run (raiseStrain successes)
  private readonly statStrainByKind: Partial<Record<TowerKind, number>> = {}; // per-kind latch (docs/STRAIN.md §7 ledgers)
  private hiveFloatTimer = 0;
  private emergencyActive = false; // any enemy inside the Final Defense Zone right now
  private emergencyRamp = 0; // render-only eased intensity (0..1) for the visual fade in/out
  private emergencyFocusX = 0; // render-only: in-zone enemy nearest the core (beam convergence)
  private emergencyFocusY = 0;
  private castExtraProjectiles = 0; // star-kit projectile bonus for the active tower cast (0 = base)
  private castSplashMult = 1; // star-kit splash multiplier for the active tower cast (1 = base)
  private castRangeMult = 1;
  private castMinRange = 0; // artillery DEADZONE (px) for the active cast — enemies closer can't be targeted (0 = none; docs/TOWERS.md §deadzone)
  private castExcludeFrozen = false; // Chrysalis Twin Cocoon: current cast skips frozen victims // identity-range multiplier for the active tower cast (1 = base; docs/RANGE.md §8)
  private castStatusAmountBonus = 0; // idle-opener STATUS enrichment (docs/TOWER-IDLE.md) — added to every status amount this cast applies (0 = identity, every non-opener cast)
  private castProjectileMutators: readonly string[] = EMPTY_STR; // star-kit mutators for the active cast
  private castProjectileSkin: string | undefined = undefined; // branch cosmetic id tagged onto shots (undefined = base)
  private castProjectileSkinTier = 0;
  private castFragment: { count: number; damageFrac: number; radius: number } | null = null; // STRAIN §framework: splash shells fragment on impact
  private castRicochet: { range: number; damageFrac: number } | null = null; // STRAIN: kill-chaining needles
  private castKnockback = 0; // STRAIN: concussive splash stagger (px up-lane)
  private castVenom: { threshold: number; burstFrac: number } | null = null; // STRAIN: venom-mark detonation
  private castEcho: { speedFrac: number; damageFrac: number } | null = null; // STRAIN: echo shells
  private castFragKnockback = false; // STRAIN: fragments inherit the stagger
  private echoing = false; // re-entrancy guard: an echo never spawns its own echo
  // Cross-cut strain kits (docs/STRAIN.md): the plague/wave verbs act outside a tower's own
  // cast, so the MAX-strain kit per kind is cached on the same cadence as the tower caches.
  private parasiteKit: StrainHooks = {};
  private chrysalisKit: StrainHooks = {}; // cross-cut expiry verbs (resin/shatter/siphon)
  private effigyKit: StrainHooks = {}; // cross-cut fear verbs (chill/contagion/knell)
  private reactorKit: StrainHooks = {};
  private readonly arcScratch: Enemy[] = []; // obelisk discharge neighbor scratch (zero-alloc)
  // ── Biomorph Conveyor (docs/STRAIN.md §conveyor). DEDICATED rng stream: rolls never touch
  //    the gameplay rng, so a run that ignores the belt is byte-identical to one without it. ──
  private readonly conveyorRng: Rng;
  readonly conveyor: ConveyorItem[] = []; // growing (readyAt > time, ≤1) + ready (≤ queueMax)
  favoriteTower: TowerKind;
  readonly unlockedKinds: ReadonlySet<TowerKind>; // the run roster (UI rails read this too)
  private readonly unlockedCardIds: ReadonlySet<string>; // progression-gated gene cards the account has earned (draft injection)
  private readonly draftPool: ReadonlySet<string> | undefined; // DISCOVERED card ids — the exact draft pool when present (discovery overhaul)
  // THE RULE SLOT (docs/CARDS.md §rules): armed once the account has EARNED any rule-changing gene
  // (its unlocked set holds one) — then every deal whose eligible pool holds a rule card offers one.
  // A fresh account (and the golden sim) earns none ⇒ off ⇒ zero extra draws, byte-identical drafts.
  private readonly ruleSlot: boolean;
  // DRAFT FIT / SPLICE (docs/CARDS.md §fit · §splice) — off unless the app opts in (golden-safe).
  private readonly draftFitOn: boolean;
  private readonly spliceOn: boolean;
  private dealSeq = 0; // deals dealt this run (fit's recency window counts in deals)
  private readonly offeredAt = new Map<string, number>(); // card id → the deal it was last offered in
  private draftKind: 'wave' | 'opening' | 'splice' = 'wave'; // why the open draft exists (modal eyebrow)
  /** Splices bought this run — each one raises the next price (SPLICE.growth). */
  splicesBought = 0;
  // Defeat-debrief ledgers (docs/REWARD-PRESENTATION.md §debrief) — observation only (sim clock s, -1 = never).
  private firstFlierAt = -1; // the first flier took the field…
  private firstFlierWave = 0; // …on this wave
  private firstAirKillAt = -1; // the first flier was downed — the run's first real anti-air
  /** Whether Hive Intelligence may act this run (RunOptions.automationAllowed — fail closed). */
  readonly automationAllowed: boolean;
  /** The run's THREAT LADDER level (docs/THREAT.md) — 0 = baseline. Display only (the director owns the warp). */
  readonly threat: number;
  deployments = 0; // player deployments this run — drives the universal cost curve
  selectedConveyorId: number | null = null; // a READY organism armed for placement (docs/STRAIN.md §conveyor)
  private conveyorSeq = 0; // branch tier tagged onto shots (drives projectile evolution; 0 = base)
  // Run-start behavioral grants/hooks collected at boot from equipment (the §3 verbs).
  // Empty by default ⇒ a gear-less run is byte-identical (golden invariant).
  private readonly grantedTowerMutators: string[] = []; // projectile mutators applied to EVERY shot
  /** The active doctrine's enemy-world warp ({} = none — every consumer gates on presence). */
  private warp: DoctrineWarp = {};
  private readonly heroAttackStatuses: { status: StatusType; amount: number }[] = []; // GLOBAL (doctrine/collection): every hero's hits apply
  private readonly heroAttackKit: AbilityComponent[] = []; // GLOBAL: ability components run on each hero hit (cleave/chain/AoE/status/crit)
  // PER-HERO equipment (HEROES.md per-hero loadouts): a hero WITH gear gets its own mods bundle +
  // attack verbs; a hero WITHOUT gear falls back to the global values ⇒ a single-hero / gear-less
  // run is byte-identical (golden-safe). Keyed by kind (the roster is distinct).
  private readonly heroHmods: Partial<Record<HeroKind, RunModifiers>> = {};
  // Per-hero EFFECTIVE abilities (base kit + the ★5/★8 fork upgrades the player picked). Absent for a
  // hero ⇒ the static base kit (HERO_ULT / HERO_SKILLS), so a fork-less / golden run is byte-identical.
  private readonly heroAbilityKits: Partial<Record<HeroKind, ResolvedHeroKit>> = {};
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
    this.conveyorRng = new Rng((seed ^ 0xb10c0de5) >>> 0);
    this.favoriteTower = opts.favorite ?? 'needle';
    this.nemesisSpec = opts.nemesis ?? null;
    this.noMega = opts.noMega === true; // arena ruleset flag (docs/ARENA.md) — false ⇒ golden path
    this.rushHpScale = opts.mode === 'bossRush'
      ? Math.max(RUSH.powerScaleMin, Math.pow(Math.max(1, opts.rushPower ?? RUSH.powerRef) / RUSH.powerRef, RUSH.powerExp))
      : 1;
    this.disableIdle = opts.disableIdle === true; // instrument A/B flag (docs/TOWER-IDLE.md §5)
    this.unlockedKinds = new Set(opts.unlocked ?? TOWER_ORDER);
    // Progression-gated gene cards the account has earned (default = none ⇒ only the ungated catalog
    // is draftable, so a fresh account / the golden sim is byte-identical).
    this.unlockedCardIds = new Set(opts.unlockedCardIds ?? []);
    this.automationAllowed = opts.automationAllowed === true;
    // Batch G grind levers — each off unless the app opts this run in (golden/Arena/probes unchanged).
    this.earlyCallAllowed = opts.earlyCall === true;
    // §6a: from DIRECTOR_ADAPTIVE.liveFromStage on — the onboarding Stages 1–3 keep their calibrated curve (campaignCurve).
    this.livePowerBase = opts.mode === 'campaign' && (opts.stage?.stage ?? 0) >= DIRECTOR_ADAPTIVE.liveFromStage && opts.livePowerBase !== undefined && Number.isFinite(opts.livePowerBase) ? Math.max(0, opts.livePowerBase) : null;
    this.squeezeOn = opts.squeeze === true && opts.mode === 'endless';
    this.threat = Math.max(0, Math.floor(opts.threat ?? 0));
    this.ruleSlot = [...this.unlockedCardIds].some((id) => { const c = cardRegistry.get(id); return c !== undefined && isRuleChangingCard(c); });
    this.draftPool = opts.draftPool ? new Set(opts.draftPool) : undefined;
    this.draftFitOn = opts.draftFit === true;
    this.spliceOn = opts.splice === true;
    // Daily Run (docs/DAILY-RUN.md): resolve the day's modifiers ONCE into the neutral-defaulted
    // struct every hook reads (mults 1 / adds 0 without them ⇒ every read below is golden-safe).
    // The dedicated rng paces Infestation's elite rolls — consumed ONLY when that modifier is live.
    this.dailyFx = opts.daily ? combinedEffects(opts.daily.modifierIds) : NEUTRAL_EFFECTS;
    this.dailyRng = new Rng((seed ^ 0xda11f00d) >>> 0);
    // A record from an OLDER build (a shared replay link, a Daily entry under verification, an
    // Arena peer) predates kinds added since: they read neutral instead of throwing. A current
    // input has every kind, so it is kept as-is (same object — golden-safe).
    if (TOWER_ORDER.some((k) => !towerProgress[k])) towerProgress = { ...neutralTowerProgress(), ...towerProgress };
    if (HERO_ORDER.some((k) => !heroProgress[k])) heroProgress = { ...neutralHeroProgress(), ...heroProgress };
    this.towerProgress = towerProgress;
    this.towerEffectiveRange = {} as Record<TowerKind, number>;
    for (const k of TOWER_ORDER) this.towerEffectiveRange[k] = TOWER_DEFS[k].range * (towerProgress[k].rangeMult ?? 1) * this.dailyFx.towerRangeMult;
    this.heroProgress = heroProgress;
    if (opts.heroAbilityKits) Object.assign(this.heroAbilityKits, opts.heroAbilityKits); // fork-resolved abilities (empty on the golden path)
    this.mode = opts.mode ?? 'stage';
    // Campaign runs a procedurally GENERATED stage: its combined difficulty (variant × per-stage
    // scaling) becomes `this.diff`, its waves replace the authored WAVES, and its speed scalar
    // rides separately. Stage/endless are unchanged ⇒ byte-identical (golden-safe).
    this.stage = opts.stage ?? null;
    // The UNIVERSAL DIFFICULTY DIRECTOR (docs/DIFFICULTY_DIRECTOR.md) composes the run's whole
    // scaling policy — difficulty variant × doctrine warp × stage axes. The sim only APPLIES
    // its factors, at the same sites in the same order ⇒ the golden runs stay byte-identical.
    // MOLT VOWS (docs/VOWS.md) compose ONTO the doctrine warp right here — multiplying, not
    // replacing: mult axes multiply, additive axes add, and with no vows the doctrine's warp
    // passes through UNTOUCHED (referential identity — the golden path never sees a new object).
    // THE FRONT's deploy warp (docs/INFESTATION.md §front) composes LAST through the same
    // seam — absent (every non-deployed run) it is a no-op passthrough, so goldens hold.
    this.dd = createDirector({
      difficulty: this.stage ? this.stage.scaling : resolveDifficulty(opts.difficulty),
      warp: composeWarps(composeWarps(resolveDoctrine(opts.doctrine).warp, combinedVowWarp(opts.vows)), opts.sectorWarp),
      stageEnemySpeedMult: this.stage ? this.stage.enemySpeedMult : 1,
      threat: opts.threat, // THREAT LADDER (docs/THREAT.md) — composes last; 0/omitted ⇒ passthrough
    });
    this.diff = this.dd.difficulty; // doctrine damage already folded (the director's ONE fold site)
    this.warp = this.dd.queueWarp();
    this.waves = this.stage ? this.stage.waves : WAVES;
    this.totalWaves = this.waves.length;
    // Enemy speed = the stage's own scaling (campaign) × the DIFFICULTY speed axis (both modes).
    // standard ⇒ ×1 → golden-safe.
    this.stageSpeedMult = this.dd.enemySpeedStatic();
    // Biome: Campaign uses the stage's fixed biome; Infinite + Boss Rush seed the first biome
    // (rotating as the run deepens — see startEndlessWave / startBossRushWave); Stage uses the
    // identity biome (golden-safe).
    this.activeBiome = this.stage ? this.stage.biome : this.mode === 'endless' || this.mode === 'bossRush' ? biomeForDepth(1) : NEUTRAL_BIOME;
    // Layout: an explicit pin → the stage's layout → Infinite's rotation → the classic arena.
    this.layoutPinned = opts.layout !== undefined;
    this.layout = layoutById(opts.layout ?? this.stage?.layout ?? (this.mode === 'endless' ? layoutIdForDepth(1) : DEFAULT_LAYOUT_ID));
    this.nav = navFieldFor(this.layout.id);
    this.geneLevels = opts.geneLevels ?? {}; // permanent gene levels; empty ⇒ base effects (golden-safe)
    this.geneTranscends = opts.geneTranscends ?? {}; // chosen second lines; empty ⇒ none (golden-safe)
    if (this.mode === 'endless' || this.mode === 'bossRush') this.director = new Director(() => this.rng.next(), this.diff, this.mode === 'endless');
    // Run Identity: a DEDICATED rng stream (decoupled from this.rng ⇒ base run unperturbed) + the plan.
    // Stage ⇒ null plan (golden-safe), and so does Boss Rush — its bosses ARE the run identity
    // (docs/BOSS-RUSH.md); anomalies stay Infinite's. Campaign uses the stage's wave count (finale
    // reserved for its boss); Endless plans over a horizon. Rare Invasions draw OUT of the biome signature.
    this.runEventRng = new Rng((seed ^ 0x52554e21) >>> 0);
    this.megaRng = new Rng((seed ^ 0x4d454741) >>> 0); // 'MEGA' — mega reinforcement/corrupt stream
    this.megaDailyEnc = opts.megaDaily ?? null;
    // …and the Daily has NO run-identity plan either: its identity IS the day's two modifiers.
    this.runPlan = this.mode === 'stage' || this.mode === 'bossRush' || this.mode === 'daily' ? null : generateRunPlan(seed, {
      mode: this.mode,
      waveCount: this.mode === 'endless' ? 50 : this.totalWaves,
      reserveFinale: this.mode === 'campaign',
      biomeSignature: this.activeBiome.mods.signature,
      // Campaign invasions honour the stage's unlock gate (its enemyPool): an all-kinds pool flooded a
      // stage-1 board with 8 colossi — an unanswerable wall (docs/CAMPAIGN.md §grace).
      invasionPool: this.stage ? this.stage.enemyPool : ENEMY_KINDS,
    });
    this.mods = defaultRunModifiers();
    // Fold permanent (meta) multipliers into the run as starting buckets.
    this.mods.towerDamageMult = meta.towerDamageMult;
    this.mods.biomassMult = meta.biomassMult;
    this.mods.heroDamageMult = meta.heroDamageMult;
    // Doctrine WARP (docs/MODE-IDENTITY.md §doctrines) is owned by the director above:
    // 'none' ⇒ empty warp, zero RNG draws, byte-identical golden run.

    // Fold the chosen doctrine's run-start effects, then run-start effects (equipment, …).
    // 'none' / no gear contribute nothing, so a default run stays byte-identical.
    for (const e of resolveDoctrine(opts.doctrine).effects) this.bootRunEffect(e);
    if (opts.runEffects) for (const e of opts.runEffects) this.bootRunEffect(e);
    // Nucleus Mulligans (docs/NUCLEUS.md) — the Hive's own organ chambers fold HERE, before
    // integrity/biomass/heroes consume the mods (boot-only fields like integrityMult land).
    // Omitted/empty ⇒ nothing happens (the golden run is byte-identical).
    if (opts.nucleusEffects) for (const e of opts.nucleusEffects) this.bootRunEffect(e);
    // Daily modifiers — boot-time folds into the SAME run buckets doctrine/gear use (×1 neutral ⇒
    // byte-identical without them). Per-tick knobs (drain/regen/armor/speed/elites/costs/cadence)
    // are read at their hooks from this.dailyFx.
    this.mods.heroDamageMult *= this.dailyFx.heroDamageMult;
    this.mods.biomassMult *= this.dailyFx.incomeMult;
    this.mods.towerDamageMult *= this.dailyFx.towerDamageMult;
    this.mods.towerFireRateMult *= this.dailyFx.towerRateMult;
    // Hero identity (docs/HERO-FRAMEWORK.md): field the ROSTER — 1–3 distinct heroes (opts.heroRoster,
    // defaulting to the single selected hero ⇒ golden-safe). Cache each hero's kit and fold its innate
    // PASSIVE where it's a mod (Shepherd's Symbiosis grants a tower aura). The Ravager's passive is
    // `eliteDamage` (no fold), so a single-Ravager autoplay run stays byte-identical.
    const roster = opts.heroRoster && opts.heroRoster.length > 0 ? opts.heroRoster : [heroKind];
    for (const k of roster) {
      const id = heroIdentity(k);
      this.heroIdById[k] = id;
      if (id.passive.kind === 'towerAura') {
        // Symbiote presence swell (docs/HERO-SYMBIOTES.md): an auraMult organ deepens the host's
        // innate aura — strength AND reach. ×1 without one (golden-safe).
        const am = this.heroProgress[k].symbiote?.auraMult ?? 1;
        this.mods.heroAuraRadius = Math.max(this.mods.heroAuraRadius, 130 * am);
        this.mods.heroTowerHasteAura += id.passive.amount * am;
        this.mods.heroTowerDamageAura += id.passive.amount * am;
      }
    }
    // Equipment folds HERE — before integrity/biomass (below) and heroes (makeHero) consume the mods.
    // Pass 1 puts each fielded hero's GLOBAL gear (tower/economy fields + SET bonuses) into this.mods
    // so the board sees it; pass 2 builds each hero's private bundle. Gear-less roster ⇒ no-op (golden).
    this.foldHeroEquip(roster, opts.heroEquip, opts.setEffects);
    this.foldHeroSymbiotes(roster); // symbiote strike verbs layer onto the per-hero lists (after gear)
    this.maxIntegrity = (ECON.baseIntegrity + meta.integrityBonus) * this.mods.integrityMult;
    this.integrity = this.maxIntegrity;
    // Permanent tower slots: initial allotment + Hive Emplacements upgrades (meta.bonusSlots),
    // capped at SLOTS.permanentMax. Persists across runs via the saved upgrade ladder; the
    // run-only gene-card slots layer on top in the `unlockedSlots` getter. docs/SLOTS.md.
    this.permanentSlots = Math.min(SLOTS.permanentMax, SLOTS.initialUnlocked + meta.bonusSlots);
    // Campaign early-stage opening aid (docs/CAMPAIGN.md §grace) rides the stage config —
    // 0 for every other mode and from stage ~5 on, so nothing else moves.
    this.biomass = ECON.startingBiomass + this.mods.startBiomassBonus + (this.stage?.startBiomassBonus ?? 0)
      + (this.mode === 'bossRush' ? RUSH.openingBiomass : 0); // the gauntlet fortifies before wave 1's boss duel (docs/BOSS-RUSH.md)
    this.heroes = roster.map((k) => this.makeHero(k));
    // GRAVEBIND (docs/HEROES.md §carrion): cache the fielded corpse-raiser once — the death seam
    // early-outs on null, so every roster without one (incl. golden autoplay) does zero work.
    this.gravebindHero = this.heroes.find((h) => this.idOf(h).passive.kind === 'gravebind') ?? null;
    // ── Starting Gene Loadout (docs/GENE-EVOLUTION.md §Loadouts): equipped cards auto-activate NOW,
    //    through the exact same path as a mid-run draft (applyCard + live verb collection + the run's
    //    card list + chosenCardEffects), so they show in the Build panel and the live run Power
    //    IMMEDIATELY. Applied last — heroes/integrity/biomass exist, so instant ops land correctly.
    //    Empty/omitted ⇒ nothing happens (the golden run is byte-identical). ──
    if (opts.startingGenes) {
      for (const id of opts.startingGenes) {
        const card = cardRegistry.get(id);
        if (!card) continue; // unknown id (stale save) — skip, never crash a run boot
        const effects = effectiveGeneEffects(card, this.geneLevels[card.id] ?? 0, 0, this.geneTranscends[card.id]);
        applyCard({ ...card, effects }, this.cardContext());
        for (const e of effects) if (e.op === 'grant' || e.op === 'hook') this.collectRunVerb(e);
        this.foldIntoHeroBundles(effects);
        this.chosenCards.push(cardToOption(card, effects));
        this.chosenCardEffects.push(...effects);
      }
    }
    // OPENING DRAFT (docs/CARDS.md §opening): Campaign runs the app opts in open with a draft BEFORE
    // wave 1 — dealt last (every boot-time draw already happened), for the favorite (the one tower
    // the player is sure to field). Omitted ⇒ the run opens in prep exactly as before (golden-safe).
    if (opts.openingDraft === true && this.mode === 'campaign') {
      const deal = this.dealDraft(new Set([this.favoriteTower]));
      if (deal.length > 0) {
        this.draft = deal;
        this.draftKind = 'opening';
        this.phase = 'draft';
      }
    }
  }

  /** Fold each hero's EQUIPMENT (opts.heroEquip) into a per-hero mods bundle + attack verbs, so a
   *  hero's gear affects only that hero and never overwrites another's loadout (HEROES.md). Tower
   *  grants (projectile mutators) + relic hooks are battlefield-GLOBAL. No-op for a gear-less roster
   *  (opts.heroEquip omitted / empty) ⇒ the golden run is byte-identical. */
  private foldHeroEquip(roster: HeroKind[], heroEquip?: Partial<Record<HeroKind, CardEffect[]>>, setEffects?: CardEffect[]): void {
    // Team SET bonuses (set pieces pooled across the fielded roster, 2pc/4pc) fold ONCE into the shared
    // mods — BEFORE the per-hero clones in pass 2 — so tower/economy fields reach the battlefield AND
    // hero-scoped set fields propagate to EVERY fielded hero via that clone. Empty roster ⇒ golden-safe.
    if (setEffects) {
      for (const e of setEffects) {
        if (e.op === 'grant') {
          if (e.grant.kind === 'towerProjectileMutator') this.grantedTowerMutators.push(e.grant.id);
        } else if (e.op === 'hook') {
          this.relicHooks.push(e.hook);
        } else if (e.op === 'mul' || e.op === 'add' || e.op === 'flag' || e.op === 'set') {
          applyRunEffect(this.mods, e);
        }
      }
    }
    if (!heroEquip) return;
    // Pass 1 — GLOBAL-scoped gear (tower/economy fields, the hero AURA, and ALL SET bonuses) folds
    // into the shared this.mods so it reaches the battlefield systems: towers/economy/auras read
    // this.mods, never a per-hero bundle. Each fielded hero contributes, so gear STACKS across the
    // roster (a fuller geared roster = a stronger board — the same product the Power model counts in
    // equipmentPower). Tower projectile-mutator grants + relic hooks are battlefield-global too.
    for (const k of roster) {
      const effects = heroEquip[k];
      if (!effects) continue;
      for (const e of effects) {
        if (e.op === 'grant') {
          if (e.grant.kind === 'towerProjectileMutator') this.grantedTowerMutators.push(e.grant.id);
        } else if (e.op === 'hook') {
          this.relicHooks.push(e.hook);
        } else if ((e.op === 'mul' || e.op === 'add' || e.op === 'flag' || e.op === 'set') && !HERO_SCOPED_FIELDS.has(e.field)) {
          applyRunEffect(this.mods, e);
        }
      }
    }
    // Pass 2 — HERO-scoped gear folds into each hero's PRIVATE bundle (cloned AFTER pass 1 so every
    // hero also inherits the shared/global gear), plus its on-hit attack verbs (kit/statuses). Read
    // via hmods(h)/hkit(h) — so a hero's stat gear affects only that hero, never another's loadout.
    for (const k of roster) {
      const effects = heroEquip[k];
      if (!effects || effects.length === 0) continue;
      const hm: RunModifiers = { ...this.mods };
      const kit = [...this.heroAttackKit];
      const statuses = [...this.heroAttackStatuses];
      for (const e of effects) {
        if (e.op === 'grant') {
          if (e.grant.kind === 'heroAttackStatus') statuses.push({ status: e.grant.status, amount: e.grant.amount });
          else if (e.grant.kind === 'heroAttackAbility') kit.push(e.grant.component);
        } else if ((e.op === 'mul' || e.op === 'add' || e.op === 'flag' || e.op === 'set') && HERO_SCOPED_FIELDS.has(e.field)) {
          applyRunEffect(hm, e);
        }
      }
      this.heroHmods[k] = hm;
      this.heroKits[k] = kit;
      this.heroStatuses[k] = statuses;
    }
  }

  /** SYMBIOTE strike verbs (docs/HERO-SYMBIOTES.md): each host's grafted organism folds its strike
   *  toxins + on-hit components into the SAME per-hero lists gear uses (created from the globals
   *  when the host carries no gear — runs AFTER foldHeroEquip so gear clones aren't clobbered).
   *  The kit's other verbs are read at their seams via heroProgress[kind].symbiote. No kit ⇒
   *  nothing allocates (golden-safe). */
  private foldHeroSymbiotes(roster: HeroKind[]): void {
    for (const k of roster) {
      const kit = this.heroProgress[k].symbiote;
      if (!kit) continue;
      if (kit.strikeStatuses?.length) {
        const list = this.heroStatuses[k] ?? (this.heroStatuses[k] = [...this.heroAttackStatuses]);
        for (const s of kit.strikeStatuses) list.push({ status: s.status, amount: s.amount });
      }
      if (kit.strikeComponents?.length) {
        const list = this.heroKits[k] ?? (this.heroKits[k] = [...this.heroAttackKit]);
        list.push(...kit.strikeComponents);
      }
    }
  }

  /** Build a hero runtime instance from its data-driven definition. */
  private makeHero(kind: HeroKind): Hero {
    const maxHp = this.heroMaxHpFor(kind); // gear survivability × Evolution Vitality — a mid-run hero inherits both
    if (this.events.hasListeners('heroSpawned')) this.events.emit('heroSpawned', { kind });
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
      targetId: -1,
      moveState: 'idle',
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
  /** A hero's merged Symbiote behavior kit (docs/HERO-SYMBIOTES.md) — undefined on a fresh save,
   *  so every symbiote seam below is a no-op there (golden-safe). */
  private symbioteOf(h: Hero): HeroSymbioteKit | undefined {
    return this.heroProgress[h.kind].symbiote;
  }

  // ── Hero effective stats (docs/HERO-EVOLUTION.md) — each folds the hero's own gear mods with the
  //    run-wide Evolution bundle (this.evo). Centralized so gear + Evolution stack in ONE place and
  //    the HUD/panel read the same numbers combat does. Neutral evo ⇒ identical to before (golden). ──

  /** Effective hero max HP: base × gear survivability × Evolution Vitality + flat card HP. */
  private heroMaxHpFor(kind: HeroKind): number {
    return HERO_DEFS[kind].maxHp * (this.heroHmods[kind] ?? this.mods).heroMaxHpMult * this.evo.maxHpMult + (this.heroFlatMaxHp[kind] ?? 0);
  }
  /** Target-independent hero damage multiplier: gear × biome × stars/mastery × Evolution Lethality. */
  private heroDamageMult(h: Hero): number {
    return this.hmods(h).heroDamageMult * this.activeBiome.mods.heroDamageMult * this.heroProgress[h.kind].damageMult * this.evo.damageMult;
  }
  /** Effective hero move speed (px/s), steady (excludes the transient Bloodthirst surge). */
  private heroSpeed(h: Hero): number {
    return HERO_DEFS[h.kind].speed * this.hmods(h).heroSpeedMult * this.evo.moveSpeedMult;
  }
  /** Attack/pulse HASTE multiplier (>1 = faster) — gear × Evolution Frenzy. Divides the base interval. */
  private heroHaste(h: Hero): number {
    // Symbiote kill-surge (docs/HERO-SYMBIOTES.md): while the host is rushing, a killHaste organ
    // quickens the attack cadence too (the ×1.4 move surge stays Bloodthirst's own). No kit ⇒ ×1.
    const kh = this.symbioteOf(h)?.killHaste;
    const rush = kh && this.time < h.rushUntil ? kh.mult : 1;
    return this.hmods(h).heroAttackSpeedMult * this.evo.attackSpeedMult * rush;
  }
  /** Effective ability cooldown (s): base × gear × biome × mastery × Evolution Overdrive. */
  private heroAbilityCooldownFor(h: Hero): number {
    return HERO_DEFS[h.kind].ability.cooldown * this.hmods(h).heroCooldownMult * this.activeBiome.mods.heroCooldownMult * this.heroProgress[h.kind].cooldownMult * this.evo.cooldownMult * this.megaFx.heroCd;
  }
  /** Effective ability AoE multiplier: gear × Evolution Amplitude × the symbiote footprint. */
  private heroAbilityRadiusFor(h: Hero): number {
    return this.hmods(h).heroAbilityRadiusMult * this.evo.abilityRadiusMult * (this.symbioteOf(h)?.abilityRadiusMult ?? 1);
  }
  /** Heal a hero by `n`, scaled by Evolution Regeneration + the run's healing-received modifier
   *  (gear / gene cards / Genome meta), clamped to max HP. No-op when down or n≤0. Both factors
   *  are 1 in a neutral run ⇒ a plain clamp (golden-safe). */
  private healHeroBy(h: Hero, n: number): void {
    if (h.down || n <= 0) return;
    const amt = n * this.evo.healingMult * this.hmods(h).heroHealingMult;
    // Symbiote overheal carapace (docs/HERO-SYMBIOTES.md): overflow healing condenses into a
    // decaying shield (the grantShield pool). No verb ⇒ exactly the old clamp (golden-safe).
    const frac = this.symbioteOf(h)?.overhealShieldFrac;
    if (frac) {
      const overflow = h.hp + amt - h.maxHp;
      if (overflow > 0) {
        h.shield = Math.max(h.shield, overflow * frac);
        h.shieldTime = Math.max(h.shieldTime, SYMBIOTE.shieldSeconds);
      }
    }
    h.hp = Math.min(h.maxHp, h.hp + amt);
  }
  /** Roll a hero crit for one damage instance → the damage multiplier (1 = no crit) + whether it
   *  crit. GATED on crit chance > 0 so a run with no Precision spends NO rng (golden byte-identical). */
  private rollHeroCrit(h: Hero): { mult: number; crit: boolean } {
    const chance = this.hmods(h).heroCritChance + this.evo.critChance;
    if (chance <= 0) return { mult: 1, crit: false };
    if (this.rng.next() < chance) return { mult: HERO_CRIT_BASE + this.hmods(h).heroCritDamageBonus + this.evo.critDamageBonus, crit: true };
    return { mult: 1, crit: false };
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
        // PREDICTIVE LEAD for positional (non-homing) shots at a live target: aim where the
        // enemy WILL be, not where it was — enemies advance down-lane at `speed`, so a slow
        // arcing shell aimed at the fire-time position lands behind fast movers ("tracking
        // feels slow"). One refinement iteration; pure math, deterministic.
        if (behavior !== 'homing' && behavior !== 'parasite' && target && speed > 0) {
          let t = Math.hypot(tx - x, ty - y) / speed;
          let py = ty + target.speed * 0.85 * t; // dominant motion is +y (toward the core)
          t = Math.hypot(tx - x, py - y) / speed;
          py = Math.min(HEIGHT - 8, ty + target.speed * 0.85 * t);
          ty = py;
        }
        this.spawnProjectile(x, y, tx, ty, speed, target ? target.id : -1, damage, behavior, splash, this.abilitySourceKind);
      },
      dealDamage: (e, raw, flash) => {
        const applied = this.applyDamage(e, raw, this.abilitySourceKind, flash);
        if (this.abilityHeroKind) {
          this.heroMasteryAccrual[this.abilityHeroKind].damage += applied;
          if (e.hp <= 0) e.lastHitHero = this.abilityHeroKind; // killing blow — kill credit + symbiote kill verbs
        }
        if (this.abilityCaster) this.heroLifesteal(this.abilityCaster, applied); // lifesteal on ability/kit hits
        return applied;
      },
      applyStatus: (e, status) => this.applyStatus(e, status, this.abilitySourceKind), // a tower cast claims its Infection
      reactOnHit: (e) => this.maybeReact(e),
      healNucleus: (n) => {
        this.integrity = Math.min(this.maxIntegrity, this.integrity + n);
      },
      healCaster: (n) => {
        const h = this.abilityCaster;
        if (h) this.healHeroBy(h, n); // Regeneration scales received healing (Bloom, etc.)
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
      spawnPool: (x, y, radius, dps, seconds) => this.spawnCorrosionPool(x, y, radius, dps, seconds),
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

  /** A gene card applied AFTER boot (draft / Starting Gene Loadout) must also reach every PER-HERO
   *  bundle: a geared or symbiote-grafted hero reads its own boot-time clones (hmods / hkit /
   *  hstatuses), so a hero-scoped stat, stance or on-hit grant folded only into the globals would
   *  silently skip it. No per-hero bundles (gear-less roster — the golden run) ⇒ a no-op. */
  private foldIntoHeroBundles(effects: readonly CardEffect[]): void {
    for (const e of effects) {
      if ((e.op === 'mul' || e.op === 'add' || e.op === 'flag' || e.op === 'set') && HERO_SCOPED_FIELDS.has(e.field)) {
        for (const hm of Object.values(this.heroHmods)) if (hm) applyRunEffect(hm, e);
      } else if (e.op === 'grant' && e.grant.kind === 'heroAttackStatus') {
        const st = { status: e.grant.status, amount: e.grant.amount };
        for (const list of Object.values(this.heroStatuses)) list?.push(st);
      } else if (e.op === 'grant' && e.grant.kind === 'heroAttackAbility') {
        for (const kit of Object.values(this.heroKits)) kit?.push(e.grant.component);
      }
    }
  }

  /** Run the battlefield rules (relic gear + rule-changing gene cards) for a run event — a no-op
   *  without hooks. A spread centers on the triggering enemy (excluded: it is the source), else on
   *  the event's own point (ax, ay — the cast point / deploy slot / struck-from position); an event
   *  with neither (wave start/clear) has nothing to spread from. */
  private fireRelicHooks(on: HookEvent, e: Enemy | null, ax?: number, ay?: number): void {
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
      } else if (a.do === 'spreadStatus') {
        const cx = e ? e.x : ax;
        const cy = e ? e.y : ay;
        if (cx === undefined || cy === undefined) continue;
        const srcId = e ? e.id : -1;
        const r2 = a.radius * a.radius;
        this.grid.forNeighbors(cx, cy, a.radius, (n) => {
          if (n.alive && n.id !== srcId && dist2(cx, cy, n.x, n.y) <= r2) {
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
   * (The Part 3 status framework will replace these direct fields with managed stacks.)
   * `castStatusAmountBonus` (docs/TOWER-IDLE.md — a charged opener's enrichment) is added to
   * the authored amount here; 0 on every non-opener cast ⇒ identity. */
  private applyStatus(e: Enemy, status: StatusApplication, source: TowerKind | null = null): void {
    const amount = this.castStatusAmountBonus > 0 ? status.amount + this.castStatusAmountBonus : status.amount;
    switch (status.kind) {
      case 'Fracture':
        this.addFracture(e, amount);
        break;
      case 'Corrosion':
        e.corrosion = amount;
        break;
      case 'Infection':
        this.infect(e, amount, source);
        break;
      case 'Disruption':
        e.disrupt = amount;
        break;
      case 'Mark': // Vital reaction fuel (Marrow Siphon) — capped stacks, harvested in reactions
        e.mark = Math.min(STATUS.markMax, e.mark + amount);
        break;
      case 'Resonance': // Resonant reaction fuel (Resonance Coil) — capped stacks, shattered in reactions
        e.resonance = Math.min(STATUS.resonanceMax, e.resonance + amount);
        break;
      // The expansion statuses ride the universal framework (status.ts): amount is SECONDS,
      // scaled by the owning tower's identity run-mod. A refractory marker (stacks 0) means
      // the application bounces — perma-CC is impossible by construction (status.ts).
      case 'Freeze': {
        if (this.applyEffect(e, 'freeze')) {
          const st = e.statuses?.find((x) => x.id === 'freeze');
          if (st && st.stacks > 0) st.remaining = amount * this.mods.chrysalisFreezeDurationMult;
        }
        break;
      }
      case 'Fear': {
        if (this.applyEffect(e, 'fear')) {
          const st = e.statuses?.find((x) => x.id === 'fear');
          if (st && st.stacks > 0) st.remaining = amount * this.mods.effigyDreadDurationMult;
        }
        break;
      }
    }
  }

  // ── Intents (from the UI) ────────────────────────────────────────────────

  selectTower(kind: TowerKind | null): void {
    this.selectedTower = kind;
    this.selectedConveyorId = null; // arming a KIND disarms any conveyor organism (and vice versa)
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
      const cost = nextTier <= 5 ? Math.round(BRANCH_COSTS[t.kind][nextTier - 1] * this.dailyFx.branchCostMult) : 0; // ×1 without Scarcity
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
  /** The REAL next-tier price (0-based ladder; Scarcity daily multiplies) — the single pricing
   *  source shared by buyBranchTier, the Inspector, and Hive Intelligence's planner. */
  branchTierCost(kind: TowerKind, tier: number): number {
    return Math.round(BRANCH_COSTS[kind][tier] * this.dailyFx.branchCostMult);
  }

  buyBranchTier(towerId: number, branchId: string): 'ok' | 'locked' | 'maxed' | 'poor' | 'badTower' {
    const t = this.towers.find((tw) => tw.id === towerId);
    if (!t) return 'badTower';
    const b = branchRegistry.get(branchId);
    if (!b || b.tower !== t.kind) return 'badTower';
    if (t.branchId && t.branchId !== branchId) return 'locked'; // committed elsewhere
    if (t.tier >= 5) return 'maxed';
    const cost = this.branchTierCost(t.kind, t.tier); // next tier's cost (0-based ladder)
    if (this.biomass < cost) return 'poor';
    const powerBefore = effectsPower(this.powerEffects()); // runtime Power validator (cold path)
    this.biomass -= cost;
    t.branchId = branchId;
    t.tier += 1;
    t.mutatedAt = this.time; // drives the grow-in + mutation flash (render-side)
    this.recomputeTowerCaches(); // overcharge adjacency unaffected, but keep caches coherent
    this.triggerMutationSpectacle(t, b, cost); // the "this feels important" moment
    if (this.events.hasListeners('towerPlaced')) this.events.emit('towerPlaced', { id: t.id, kind: t.kind, slot: t.slot });
    this.auditTempPower(powerBefore, `Branch tier ${t.tier} (${b.name})`);
    return 'ok';
  }

  /** Raise a tower's STRAIN level (docs/STRAIN.md §framework) — the single mutation point.
   *  Acquisition (the Biomorph Conveyor, §conveyor) is the only in-game caller; the framework
   *  validates, fires the ceremony surface, and audits the Power bucket like every other
   *  in-run strength grant. Branches/Mastery/Genes are untouched — everything stacks. */
  raiseStrain(towerId: number): 'ok' | 'maxed' | 'badTower' {
    const t = this.towers.find((tw) => tw.id === towerId);
    if (!t) return 'badTower';
    if (t.strain >= 5) return 'maxed';
    const powerBefore = effectsPower(this.powerEffects());
    t.strain += 1;
    this.statMaxStrain = Math.max(this.statMaxStrain, t.strain);
    this.statStrains += 1;
    this.statStrainByKind[t.kind] = Math.max(this.statStrainByKind[t.kind] ?? 1, t.strain);
    t.mutatedAt = this.time; // the strain grow-in rides the same flash channel as a splice
    const d = strainRegistry.get(`${t.kind}:${t.strain}`);
    const color = TOWER_DEFS[t.kind].color;
    this.hitstop = BRANCH_HITSTOP;
    this.spawnParticles(t.x, t.y, PARTICLE.mutate, color);
    this.spawnAbsorption(t.x, t.y);
    this.pushSfx('splice');
    this.mutation = {
      id: ++this.mutationSeq,
      title: d?.name ?? `Strain ${['I', 'II', 'III', 'IV', 'V'][t.strain - 1]}`,
      sub: `${TOWER_DEFS[t.kind].name} · Strain ${['I', 'II', 'III', 'IV', 'V'][t.strain - 1]}`,
      branchId: t.branchId ?? '',
      color,
      at: this.time,
    };
    this.auditTempPower(powerBefore, `Strain ${t.strain} (${t.kind})`);
    if (this.relicHooks.length) this.fireRelicHooks('strainRaised', null, t.x, t.y); // rule genes (docs/CARDS.md §rules)
    return 'ok';
  }

  /** STRAIN reactor wave-openers (docs/STRAIN.md — Adrenal Glands / Glut Sacs): fires as each
   *  wave starts. Empty kit (no strained reactor) ⇒ complete no-op, golden-safe. */
  private applyWaveStartStrains(): void {
    const rk = this.reactorKit;
    if (rk.waveSurge !== undefined) {
      let surged = 0;
      for (const t of this.towers) {
        if (t.kind === 'reactor' && t.strain >= 3) {
          surged += rk.waveSurge;
          this.spawnParticles(t.x, t.y, PARTICLE.bloom, TOWER_DEFS.reactor.color, 0.6);
        }
      }
      if (surged > 0) {
        this.biomass += surged;
        this.floats.push({ x: nucleusPoint.x, y: nucleusPoint.y - 30, text: `+${Math.round(surged)}`, color: '#b6e84a', life: 1.0 });
      }
    }
    // Maw GLUT decay (docs/STRAIN.md — Gorging Gullet): hunger resets each wave unless the
    // Apex Devourer (V) has made it permanent. Non-maws never carry glut — zero work.
    for (const t of this.towers) {
      if (t.kind === 'maw' && t.glut !== undefined && t.glut > 0) {
        if (resolveStrain('maw', t.strain).apexGorge === undefined) t.glut = 0;
      }
    }
    if (rk.waveStartReset === true) {
      for (const t of this.towers) {
        if (t.overcharged) t.cooldown = 0; // the jolt: an opening alpha-strike
      }
    }
  }

  /** BIOMORPH CONVEYOR tick (docs/STRAIN.md §conveyor): keep exactly one organism growing;
   *  at maturity it joins the ready queue — or, if the belt is already full, auto-enters the
   *  Biomass Recycler (flat payout — nothing is wasted, nothing compounds). Dedicated rng. */
  private conveyorTick(): void {
    // Run-start GIFT (docs/STRAIN.md §conveyor): the very first organism is instantly ready
    // and FREE — the belt opens with a decision, not a 14-second wait. Seeded on the first
    // tick (tutorials never tick the belt), latched by conveyorSeq.
    if (this.conveyorSeq === 0) {
      const deployed = new Set<TowerKind>();
      // OPENING ANSWER (docs/STRAIN.md §opening): a Campaign gift is rolled from the owned kinds
      // that answer the stage's opening threats (same rng draw count — only the pool narrows).
      const answers = this.mode === 'campaign' && this.stage && this.stage.stage >= CONVEYOR.openingAnswerFromStage
        ? openingAnswerKinds(this.stage.waves, this.unlockedKinds, this.favoriteTower)
        : null;
      const kind = rollKind(this.conveyorRng, deployed, this.favoriteTower, answers ?? this.unlockedKinds);
      const rar = rollRarity(this.conveyorRng, 0);
      this.conveyor.push({
        id: ++this.conveyorSeq, kind, rarity: rar.id, strain: rar.strain,
        bornAt: this.time, readyAt: this.time, free: true,
      });
      return;
    }
    let growing: ConveyorItem | null = null;
    let ready = 0;
    for (const c of this.conveyor) {
      if (c.readyAt > this.time) growing = c;
      else ready++;
    }
    if (growing === null) {
      // did one just mature against a full belt? (ready > queueMax means the maturing one)
      if (ready > CONVEYOR.queueMax) {
        // recycle the NEWEST arrival (highest readyAt)
        let newest = 0;
        for (let i = 1; i < this.conveyor.length; i++) {
          if (this.conveyor[i].readyAt > this.conveyor[newest].readyAt) newest = i;
        }
        const [gone] = this.conveyor.splice(newest, 1);
        const value = gone !== undefined && gone.free === true ? 0 : recycleValue();
        if (value > 0) {
          this.biomass += value;
          this.floats.push({ x: WIDTH - 60, y: HEIGHT - 40, text: `+${value}`, color: '#b6e84a', life: 0.9 });
        }
        this.pushSfx('dissolve');
        if (gone) ready = Math.min(ready, CONVEYOR.queueMax);
      }
      // Start the next growth ONLY under combat pressure (docs/STRAIN.md §conveyor anti-farm):
      // an in-flight organism finishes its remaining seconds in prep, but a NEW one never
      // starts there — idling between waves can't farm the belt into recycler income.
      if (this.phase !== 'wave') return;
      const deployed = new Set<TowerKind>();
      for (const t of this.towers) deployed.add(t.kind);
      const kind = rollKind(this.conveyorRng, deployed, this.favoriteTower, this.unlockedKinds);
      const rar = rollRarity(this.conveyorRng, this.waveIndex);
      this.conveyor.push({
        id: ++this.conveyorSeq,
        kind,
        rarity: rar.id,
        strain: rar.strain,
        bornAt: this.time,
        readyAt: this.time + growDuration(this.waveIndex),
      });
    }
  }

  /** Deploy the FAVORITE tower (docs/STRAIN.md §economy): the universal compounding cost —
   *  no per-tower prices. The conveyor covers every other kind. */
  deployTower(kind: TowerKind, px: number, py: number): boolean {
    if (!this.unlockedKinds.has(kind)) return false; // not on this account's roster
    if (this.phase === 'won' || this.phase === 'lost') return false;
    const slot = slotAt(px, py);
    if (!slot || slot.index >= this.unlockedSlots || this.occupied.has(slot.index)) return false;
    const cost = deployCost(this.deployments);
    if (this.biomass < cost) return false;
    this.biomass -= cost;
    this.deployments++;
    this.placeCore(kind, slot);
    return true;
  }

  /** Deploy a READY conveyor organism onto a slot — it arrives at its rolled strain level. */
  deployFromConveyor(itemId: number, px: number, py: number): boolean {
    const idx = this.conveyor.findIndex((c) => c.id === itemId && c.readyAt <= this.time);
    if (idx < 0 || this.phase === 'won' || this.phase === 'lost') return false;
    const slot = slotAt(px, py);
    if (!slot || slot.index >= this.unlockedSlots || this.occupied.has(slot.index)) return false;
    const item = this.conveyor[idx];
    // The run-start gift deploys for FREE and never advances the universal curve (§conveyor).
    const cost = item.free === true ? 0 : deployCost(this.deployments);
    if (this.biomass < cost) return false;
    this.biomass -= cost;
    if (item.free !== true) this.deployments++;
    const powerBefore = item.strain > 1 ? effectsPower(this.powerEffects()) : 0;
    const t = this.placeCore(item.kind, slot);
    if (item.strain > 1) {
      t.strain = Math.min(5, item.strain);
      this.statMaxStrain = Math.max(this.statMaxStrain, t.strain);
      this.statStrainByKind[t.kind] = Math.max(this.statStrainByKind[t.kind] ?? 1, t.strain);
      t.mutatedAt = this.time;
      this.recomputeTowerCaches();
      this.auditTempPower(powerBefore, `Deployed Strain-${t.strain} organism (${t.kind})`);
    }
    this.conveyor.splice(idx, 1);
    return true;
  }

  /** STRAIN-MERGE a ready organism (docs/STRAIN.md §merge): consumes it, raises the highest-
   *  Power deployed tower of the same kind one level. Branches/Mastery/Genes are untouched. */
  strainFromConveyor(itemId: number): 'ok' | 'noTarget' | 'poor' | 'badItem' {
    const idx = this.conveyor.findIndex((c) => c.id === itemId && c.readyAt <= this.time);
    if (idx < 0) return 'badItem';
    const item = this.conveyor[idx];
    // highest-Power eligible: branch tier is the dominant power axis among same-kind towers,
    // then current strain, then seniority (stable, deterministic).
    let target: Tower | null = null;
    for (const t of this.towers) {
      if (t.kind !== item.kind || t.strain >= 5) continue;
      if (
        target === null ||
        t.tier > target.tier ||
        (t.tier === target.tier && t.strain > target.strain) ||
        (t.tier === target.tier && t.strain === target.strain && t.id < target.id)
      ) {
        target = t;
      }
    }
    if (target === null) return 'noTarget';
    const cost = strainCost(this.deployments, target.strain);
    if (this.biomass < cost) return 'poor';
    this.biomass -= cost;
    this.conveyor.splice(idx, 1);
    this.raiseStrain(target.id);
    return 'ok';
  }

  /** Discard a ready organism into the Biomass Recycler — the flat payout, instantly. */
  discardConveyor(itemId: number): boolean {
    const idx = this.conveyor.findIndex((c) => c.id === itemId && c.readyAt <= this.time);
    if (idx < 0) return false;
    const [gone] = this.conveyor.splice(idx, 1);
    // Free in, free out: the gift organism recycles for 0 — it can never feed the economy.
    if (gone === undefined || gone.free !== true) this.biomass += recycleValue();
    this.pushSfx('dissolve');
    return true;
  }

  /** STRAIN births (docs/STRAIN.md — Womb of the Colony / Brood Nest): the organism produces
   *  friendly units on its own cadence. Runs only for towers past Strain I with a births verb. */
  private strainBirthTick(t: Tower, dt: number): void {
    const sk = resolveStrain(t.kind, t.strain);
    const b = sk.births;
    if (!b) return;
    t.strainCd -= dt;
    if (t.strainCd > 0) return;
    t.strainCd = b.interval;
    this.summonMinions(b.unit, b.count, t.x, t.y - 14);
  }

  /** STRAIN static field (docs/STRAIN.md — obelisk ladder): each control pulse CHARGES every
   *  enemy in the field; at the arc threshold the host DISCHARGES — damage (and stun) leaping
   *  to its neighbors, forking wider at Storm Crown. One pass per pulse, gameplay-rng-free. */
  private obeliskStrainPulse(t: Tower, sk: StrainHooks): void {
    const chargeDef = statusRegistry.get('charge');
    if (!chargeDef || sk.staticCharge === undefined) return;
    const def = TOWER_DEFS.obelisk;
    const r = (this.towerEffectiveRange.obelisk ?? def.range) * this.castRangeMult;
    const r2 = r * r;
    const stacksPerPulse = Math.max(1, Math.round(sk.staticCharge.perSec * def.fireInterval));
    const arc = sk.chargeArc;
    this.grid.forNeighbors(t.x, t.y, r, (e) => {
      if (!e.alive || dist2(t.x, t.y, e.x, e.y) > r2) return;
      e.statuses ??= [];
      applyStatusInstance(e.statuses, chargeDef, stacksPerPulse);
      if (arc === undefined) return;
      const st = e.statuses.find((x) => x.id === 'charge');
      if (!st || st.stacks < arc.threshold) return;
      st.stacks = 0; // the discharge consumes the charge
      st.remaining = 0.01;
      this.applyDamage(e, arc.damage, 'obelisk');
      this.spawnParticles(e.x, e.y, PARTICLE.shred, TOWER_DEFS.obelisk.color, 0.8);
      // Arc to the nearest victims — 1 leap, +forks at Storm Crown.
      const jumps = 1 + (sk.arcForks ?? 0);
      const near = this.arcScratch;
      this.grid.queryInto(e.x, e.y, arc.radius, near);
      near.sort((a, b) => dist2(e.x, e.y, a.x, a.y) - dist2(e.x, e.y, b.x, b.y));
      let hit = 0;
      for (let i = 0; i < near.length && hit < jumps; i++) {
        const o = near[i];
        if (!o.alive || o === e) continue;
        if (dist2(e.x, e.y, o.x, o.y) > arc.radius * arc.radius) break;
        this.applyDamage(o, arc.damage, 'obelisk');
        if (sk.chargeStun !== undefined && this.applyEffect(o, 'stun')) {
          const stn = o.statuses?.find((x) => x.id === 'stun');
          if (stn) stn.remaining = sk.chargeStun;
        }
        this.spawnParticles(o.x, o.y, PARTICLE.shred, TOWER_DEFS.obelisk.color, 0.5);
        hit++;
      }
    });
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
      strain: t.strain,
      strainName: strainRegistry.get(`${t.kind}:${t.strain}`)?.name ?? null,
      idleState: this.phase === 'wave' ? towerIdleState(t.prep) : 'preparation', // build phase = full preparation (matches the renderer's treatment)
      idleName: IDLE_BEHAVIORS[t.kind].name,
      idleBlurb: IDLE_BEHAVIORS[t.kind].blurb,
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

  /** Arm a READY conveyor organism for placement (docs/STRAIN.md §conveyor). Sets the classic
   *  kind selection too so the placement ghost/range preview renders for free; `click` checks
   *  the conveyor arm FIRST so the deploy consumes the organism. null disarms both. */
  selectConveyorItem(id: number | null): void {
    if (id === null) {
      this.selectedConveyorId = null;
      return;
    }
    const item = this.conveyor.find((c) => c.id === id && c.readyAt <= this.time);
    if (!item) return;
    this.selectedConveyorId = id;
    this.selectedTower = item.kind; // preview only — click() routes to deployFromConveyor
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
      // Conveyor organism armed → deploying CONSUMES it (universal economy). Otherwise the
      // favorite deploys on the same universal curve — tutorial included (its lessons are
      // authored against the real conveyor model).
      if (this.selectedConveyorId !== null) {
        if (this.deployFromConveyor(this.selectedConveyorId, px, py)) {
          this.selectedConveyorId = null;
          if (!opts.shift) this.selectedTower = null;
        }
        return;
      }
      // One-shot placement by default; holding Shift keeps the tool armed for rapid building.
      // The tutorial uses the SAME deploy path as every real run (conveyor pricing) — the lessons
      // must teach the deployment model the player will actually live with (docs/TUTORIAL.md).
      const placed = this.deployTower(this.selectedTower, px, py);
      if (placed && !opts.shift) this.selectedTower = null;
      return;
    }
    // Nothing armed: a tap on a HERO selects it (non-modal — the run keeps running). Heroes roam the
    // open field, so this rarely competes with a tower's fixed slot; check it first.
    if (this.selectHeroAt(px, py)) return;
    // Nothing armed: clicking a PLACED tower selects it (opens its branch/Mutation panel).
    const t = this.towerAt(px, py);
    if (t) {
      this.selectPlacedTower(t.id);
      return;
    }
    this.selectedPlacedId = null; // clicked empty space → deselect tower
    this.selectedHeroKind = null; // …and the hero (tap the hero again to reselect)
    this.setRally(px, py);
  }

  // ── Hero selection (docs/HERO-SELECTION.md) — a non-modal pick abilities also key off ─────────
  /** The living hero whose body is under (px,py) within a forgiving tap radius, nearest first. */
  private heroAt(px: number, py: number): Hero | null {
    let best: Hero | null = null;
    let bestD2 = 26 * 26; // tap radius a touch wider than the 16px hero body
    for (const h of this.heroes) {
      if (h.down) continue; // a downed hero has nothing to act on
      const d2 = dist2(px, py, h.x, h.y);
      if (d2 < bestD2) { bestD2 = d2; best = h; }
    }
    return best;
  }

  /** Select the hero under (px,py), if any; returns whether one was hit. Never pauses the run. */
  selectHeroAt(px: number, py: number): boolean {
    const h = this.heroAt(px, py);
    if (!h) return false;
    this.selectedHeroKind = h.kind;
    this.selectedPlacedId = null; // selecting a hero clears tower inspection
    return true;
  }

  /** Set/clear the hero selection directly (kind must be in the fielded roster). */
  selectHero(kind: HeroKind | null): void {
    this.selectedHeroKind = kind && this.heroes.some((h) => h.kind === kind) ? kind : null;
  }

  /** The selected Hero instance, or null — the seam future hero abilities act through. */
  getSelectedHero(): Hero | null {
    return this.selectedHeroKind ? this.heroes.find((h) => h.kind === this.selectedHeroKind) ?? null : null;
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
    this.selectedHeroKind = null; // Escape also drops the hero selection
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
    if (t.kind === 'sower' && this.mines.length > 0) this.witherMines(t.id); // its garden dies with it
    if (this.selectedPlacedId === id) this.selectedPlacedId = null; // selling closes Inspect
    if (this.movingTowerId === id) this.movingTowerId = null;
    this.recomputeTowerCaches(); // overcharge adjacency + reactor count stay coherent
    this.sellFx(t, refund);
    if (this.events.hasListeners('towerSold')) this.events.emit('towerSold', { id, kind: t.kind, slot: t.slot, refund });
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
    if (t.kind === 'sower' && this.mines.length > 0) this.witherMines(t.id); // uprooted — it reseeds from the new plot
    this.movingTowerId = null;
    this.recomputeTowerCaches(); // overcharge adjacency changed → refresh
    this.spawnParticles(t.x, t.y, PARTICLE.mutate, TOWER_DEFS[t.kind].color); // land burst
    this.pushSfx('place');
    this.selectPlacedTower(t.id); // returns to Inspect automatically
    if (this.events.hasListeners('towerPlaced')) this.events.emit('towerPlaced', { id: t.id, kind: t.kind, slot: t.slot });
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
    if (!this.unlockedKinds.has(kind)) return false; // not on this account's roster
    const slot = slotAt(px, py);
    if (!slot) return false;
    if (slot.index >= this.unlockedSlots) return false; // slot still locked
    if (this.occupied.has(slot.index)) return false;
    const def = TOWER_DEFS[kind];
    if (this.biomass < def.cost) return false;
    this.biomass -= def.cost;
    this.placeCore(kind, slot);
    return true;
  }

  /** Placement CORE (charging already done by the caller): the tower body, caches, FX, events,
   *  auto-start arming. `placeTower` (legacy def-cost path — tests/autoplay) and the Biomorph
   *  Conveyor paths (universal economy, docs/STRAIN.md §economy) share it exactly. */
  private placeCore(kind: TowerKind, slot: TowerSlot): Tower {
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
      dampenedUntil: 0,
      dampenFrac: 0,
      branchId: null,
      tier: 0,
      strain: 1, // Strain I — the unmutated baseline (docs/STRAIN.md)
      strainCd: 0,
      pulseCd: 0,
      mutatedAt: -100, // never mutated ⇒ no grow-in / flash (a fresh, unbranched silhouette)
      movedAt: -100, // never relocated ⇒ no landing-impact FX
      prep: 0, // idle posture (docs/TOWER-IDLE.md) — born combat-taut; eases up when unengaged
      idleCharge: 0,
      idleCd: 0,
      choirDmg: 0,
      beamTarget: -1, // Resonance Beam: not channeling (inert for every non-coil kind)
      beamHeat: 0, // resonance charge (0..1)
    });
    this.statTowerBuilds[kind]++; // lifetime-stats observation
    this.recomputeTowerCaches();
    // Rooting burst — the organism takes hold (fxRng: pure presentation, golden-safe).
    this.spawnParticles(slot.x, slot.y, PARTICLE.mutate, TOWER_DEFS[kind].color, 0.8);
    this.pushSfx('place');
    if (this.events.hasListeners('towerPlaced')) this.events.emit('towerPlaced', { id: this.nextId - 1, kind, slot: slot.index });
    if (this.relicHooks.length) this.fireRelicHooks('towerDeployed', null, slot.x, slot.y); // rule genes (docs/CARDS.md §rules)
    // First setup action taken → ARM the auto-start countdown (see autoStartReady). Placing a
    // tower is one of the two triggers (the other is a manual startWave); latched for the run.
    this.autoStartReady = true;
    // Auto-start: the FIRST tower of the opening prep (before any wave) buys a longer setup
    // window, so an auto-start doesn't fire before the player finishes their opening build.
    if (this.autoStart && this.waveIndex === 0 && this.towers.length === 1) {
      this.prepCountdown = AUTO_START_FIRST_DELAY;
    }
    return this.towers[this.towers.length - 1];
  }

  /** Grant `n` additional TEMPORARY tower slots for this run — the future hook for in-run slot
   *  rewards (events, boss drops, …) beyond the Reclaimed Node gene card. Run-only (not saved)
   *  and capped at SLOTS.tempMax by the `unlockedSlots` getter; permanent slots come from the
   *  Hive Emplacements Shard upgrade (meta.bonusSlots) instead. See docs/SLOTS.md. */
  unlockSlots(n: number): void {
    this.mods.bonusTowerSlots += n;
  }

  // ── Scaling curves: ALL sourced from the Universal Difficulty Director (the policy layer).
  //    The sim only multiplies its own RUN-state modifiers (player build) on top. ──

  /** Enemy-HP multiplier for a 0-based wave index (director curve × the run's own HP mod). */
  private hpMultFor(idx0: number): number {
    return this.dd.waveHpMult(idx0) * this.mods.enemyHpRunMult * this.dailyFx.enemyHpMult; // ×1 without a daily HP modifier
  }

  /** Bounty/biomass multiplier for a 0-based wave index. */
  private bountyMultFor(idx0: number): number {
    return this.dd.waveBountyMult(idx0);
  }

  // Endless intensity curves (docs/ENDLESS-SCALING.md) — director-owned; endless-only call sites.

  private endlessHpMult(depth: number): number {
    return this.dd.endlessHpMult(depth) * this.mods.enemyHpRunMult;
  }

  private endlessBountyMult(depth: number): number {
    return this.dd.endlessBountyMult(depth);
  }

  private endlessSpeedMult(depth: number): number {
    return this.dd.endlessSpeedMult(depth);
  }

  private endlessDamageMult(depth: number): number {
    return this.dd.endlessDamageMult(depth);
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

  /** Switch the arena layout (Infinite rotation). Wave starts only — the field is clear then. */
  private enterLayout(id: string): void {
    if (id === this.layout.id) return;
    this.layout = layoutById(id);
    this.nav = navFieldFor(this.layout.id);
  }

  startWave(): void {
    if (this.phase !== 'prep') return;
    this.launchWave();
    this.noteWaveLaunch();
  }

  /** Launch the next wave — from prep (startWave) or mid-wave over a live field (callWaveEarly). */
  private launchWave(): void {
    // Starting a wave (manually, or via a now-armed auto-start) is the other trigger that ARMS
    // the auto-start countdown for the rest of the run (see autoStartReady). No-op once latched.
    this.autoStartReady = true;
    if (this.mode === 'endless') {
      this.startEndlessWave();
      return;
    }
    if (this.mode === 'bossRush') {
      this.startBossRushWave();
      return;
    }
    // Daily MEGA variant (docs/MEGA-BOSS.md §daily): the run IS the encounter — no wave plan.
    // One "wave" opens, the boss arrives, and megaBossSystem drives evolution + reinforcements
    // until the Hive or the organism dies. checkWaveEnd never settles while it lives.
    if (this.megaDailyEnc !== null) {
      this.waveIndex++;
      this.spawnQueue = [];
      this.spawnedAll = true;
      if (this.mega === null) this.spawnMegaBoss(this.megaDailyEnc, 'daily');
      this.waveStartIntegrity = this.integrity;
      this.phase = 'wave';
      this.pushSfx('wave');
      if (this.events.hasListeners('waveStarted')) this.events.emit('waveStarted', { wave: this.waveIndex, endless: false });
      return;
    }
    if (this.waveIndex >= this.totalWaves) return;
    this.waveIndex++;
    const idx0 = this.waveIndex - 1;
    // LIVE adaptive threat (docs/DIFFICULTY_DIRECTOR.md §6a): exactly 1 unless a Campaign run opted
    // in — then waves ≥ liveFromWave (chaff) and every boss body scale with the live Power ratio,
    // and (v3) a share of the wave's groups arrives ELITE (the same transform the prep preview shows).
    const ratio = this.livePowerRatio();
    const m = this.waveIndex >= DIRECTOR_ADAPTIVE.liveFromWave ? this.dd.liveThreatMult(ratio) : 1;
    const def = this.liveWave(idx0, m).wave; // the plain plan at m ≤ 1 (same array)
    const wave = this.dd.liveThreatParts(m, this.stageSpeedMult); // HP × pace × speed — exactly {1, 1, 1} at ×1
    this.liveThreat = wave.hp * wave.pace * wave.speed; // the APPLIED multiplier (== m unless speed hit its readability ceiling)
    const bossHp = this.dd.liveBossMult(ratio); // every boss body, any wave (exactly 1 at ratio ≤ 1)
    // The Spawn Director schedules the scripted wave; difficulty's spawn-rate knob (×1 at
    // Standard) tightens spacing. Byte-identical to the former inline loop at the defaults.
    this.spawnQueue = this.spawner.scheduleScripted(
      def,
      this.time,
      this.hpMultFor(idx0) * wave.hp,
      this.bountyMultFor(idx0),
      this.diff.spawnRateMult * wave.pace,
    );
    if (wave.speed !== 1) for (const q of this.spawnQueue) q.speedMult = wave.speed; // §6a live speed part (absent ⇒ ×1)
    // Campaign: framework bosses aren't enemy-kinds, so the Game spawns them — the selected boss
    // caps the finale wave, the mini-boss (if any) anchors a middle wave. Both escorted by chaff.
    if (this.stage) {
      if (this.waveIndex === this.totalWaves) this.spawnBoss(this.stage.boss, bossHp);
      else if (this.stage.miniBoss && this.waveIndex === this.stage.miniBossWave) this.spawnBoss(this.stage.miniBoss, bossHp);
      // Per-wave boss overrides (docs/DAILY-RUN.md §bosses): the Daily's seeded mid-boss roster.
      // Campaign leaves bossWaves undefined ⇒ this lookup never fires (golden-safe).
      const extraBoss = this.stage.bossWaves?.[this.waveIndex];
      if (extraBoss) this.spawnBoss(extraBoss, bossHp);
      // Mega Boss stages (docs/MEGA-BOSS.md): every MEGA.campaignEvery-th campaign stage hosts one.
      // It ARRIVES with wave CAMPAIGN_OPENING.megaArrivalWave (clamped to the stage — never with the
      // opening build, docs/CAMPAIGN.md §opening) and persists across the rest of the stage; the stage
      // cannot be cleared until it falls (checkWaveEnd holds the finale open with overtime reinforcements).
      if (this.mode === 'campaign' && this.waveIndex === Math.min(this.totalWaves, CAMPAIGN_OPENING.megaArrivalWave) && this.mega === null) {
        const enc = campaignMegaFor(this.stage.stage);
        if (enc) this.spawnMegaBoss(enc, 'campaign');
      }
    }
    this.applyDoctrineWarp(); // doctrine protocols reshape the queue first (no-op without a warp)
    this.applyRunEvent(this.waveIndex); // Run Identity: fold this wave's beat + anomaly (no-op in Stage)
    this.spawnedAll = false;
    this.waveStartIntegrity = this.integrity;
    this.applyWaveStartStrains(); // STRAIN reactor verbs (adrenal jolt / glut surge)
    this.phase = 'wave';
    this.pushSfx('wave');
    if (this.events.hasListeners('waveStarted')) this.events.emit('waveStarted', { wave: this.waveIndex, endless: false });
    if (this.relicHooks.length) this.fireRelicHooks('waveStarted', null); // relic battlefield rules
  }

  /** Stamp a launch for the EARLY CALL credit: when it happened + when its last spawn is due. */
  private noteWaveLaunch(): void {
    this.waveLaunchedAt = this.time;
    const q = this.spawnQueue;
    const r = this.rushPending;
    this.waveSpawnEnd = Math.max(this.time, q.length > 0 ? q[q.length - 1].at : 0, r.length > 0 ? r[r.length - 1].at : 0);
  }

  /** §6a live board-power ratio → the director's live threat multiplier. Exactly 1 unless this
   *  Campaign run opted in (RunOptions.livePowerBase). Cold path: once per wave launch. */
  private liveThreatNow(): number {
    const p = this.dd.liveThreatParts(this.dd.liveThreatMult(this.livePowerRatio()), this.stageSpeedMult);
    return p.hp * p.pace * p.speed; // the applied multiplier (what the HUD chip shows)
  }

  /** The run's LIVE board-power ratio (§6a/§7: account Power ÷ the stage's recommended Power × the
   *  run's temporary Power × the board fielded vs an opening build) — 1 (neutral) unless this
   *  Campaign run opted in via RunOptions.livePowerBase. */
  private livePowerRatio(): number {
    return this.livePowerBase === null ? 1 : this.dd.liveRatio(this.livePowerBase, this.investedPower(), this.towers.length, effectsPower(this.chosenCardEffects));
  }

  /** HUD read of the live adaptive multiplier: in prep, what the NEXT wave would launch with right
   *  now (the briefing — previews == outcomes while the board is unchanged); otherwise the current
   *  wave's. Exactly 1 for every run that did not opt in. */
  private liveThreatView(): number {
    if (this.livePowerBase === null) return 1;
    if (this.phase !== 'prep') return this.liveThreat;
    return this.waveIndex + 1 >= DIRECTOR_ADAPTIVE.liveFromWave && this.waveIndex < this.totalWaves ? this.liveThreatNow() : 1;
  }

  /** EARLY CALL (docs/EARLY-CALL.md): the Biomass calling the next wave RIGHT NOW would pay, or -1
   *  when no call is possible — off for this run (RunOptions.earlyCall), the tutorial, outside a
   *  fight or during its settle beat, the Daily Mega, the final scripted wave, the stack cap
   *  (EARLY_CALL.maxAhead), or the first EARLY_CALL.minElapsed seconds of a wave. The credit is
   *  the skipped wait — the field's last scheduled spawn + clearAllowance, minus now (capped) —
   *  priced at the NEXT wave's bounty multiplier × the run's Biomass multiplier. */
  earlyCallBonus(): number {
    if (!this.earlyCallAllowed || this.tutorialMode || this.phase !== 'wave' || this.settleTimer > 0) return -1;
    if (this.megaDailyEnc !== null || this.calledAhead >= EARLY_CALL.maxAhead) return -1;
    const open = this.mode === 'endless' || this.mode === 'bossRush';
    if (!open && this.waveIndex >= this.totalWaves) return -1;
    if (this.time - this.waveLaunchedAt < EARLY_CALL.minElapsed) return -1;
    const skipped = Math.min(EARLY_CALL.maxSkipSeconds, Math.max(0, this.waveSpawnEnd + EARLY_CALL.clearAllowance - this.time));
    const bounty = open ? this.endlessBountyMult(this.waveIndex + 1) : this.bountyMultFor(this.waveIndex);
    return Math.round(EARLY_CALL.biomassPerSecond * skipped * bounty * this.mods.biomassMult);
  }

  /** Call the next wave NOW, over the live field (docs/EARLY-CALL.md). The waves overlap: the
   *  called-over wave's unspawned tail keeps its schedule and the new wave's queue merges in by
   *  time. Pays earlyCallBonus() up front; the called-over wave's per-wave beats still land — its
   *  gene draft is OWED (dealt at the next clear) and Regenerative Carapace ticks now. A recorded
   *  input (core/replay.ts REPLAY_METHODS). Returns false (nothing happens) when unavailable. */
  callWaveEarly(): boolean {
    const bonus = this.earlyCallBonus();
    if (bonus < 0) return false;
    if (this.shouldDraftThisWave()) this.draftsOwed++; // the called-over wave's card, dealt at the clear
    if (this.mods.integrityRegenPerWave > 0) this.integrity = Math.min(this.maxIntegrity, this.integrity + this.mods.integrityRegenPerWave);
    const carry = this.spawnQueue;
    const carryRush = this.rushPending;
    const prevEnd = this.waveSpawnEnd;
    this.calledAhead++;
    this.launchWave();
    if (carry.length > 0) this.spawnQueue = [...carry, ...this.spawnQueue].sort((a, b) => a.at - b.at); // stable
    if (carryRush.length > 0) this.rushPending = [...carryRush, ...this.rushPending].sort((a, b) => a.at - b.at);
    this.noteWaveLaunch();
    this.waveSpawnEnd = Math.max(this.waveSpawnEnd, prevEnd);
    if (bonus > 0) {
      this.biomass += bonus;
      this.statBiomassEarned += bonus;
      this.floats.push({ x: WIDTH / 2, y: 120, text: `EARLY CALL +${bonus}`, color: '#b6e84a', life: 1.4 });
      this.pushSfx('splice'); // the reward's own cue, over the wave launch's
    }
    return true;
  }

  /** Deal one OWED draft (a wave called over early still earns its card). False when none is owed. */
  private dealOwedDraft(): boolean {
    while (this.draftsOwed > 0) {
      this.draftsOwed--;
      this.draft = this.dealDraft(); // THE deal seam (draft fit when on — docs/CARDS.md §fit)
      this.draftKind = 'wave';
      this.draftRerolled = false;
      if (this.draft.length > 0) return true;
    }
    this.draft = null;
    return false;
  }

  /** INFINITE SQUEEZE pressure band (ENDLESS_SQUEEZE): a flawless wave past fromDepth tightens the
   *  HP pressure; a wave that drained ≥ easeAt of max integrity eases it (down to S.floor). At each clear. */
  private updateSqueeze(): void {
    const S = ENDLESS_SQUEEZE;
    const loss = (this.waveStartIntegrity - this.integrity) / Math.max(1, this.maxIntegrity);
    if (loss <= 0) {
      if (this.waveIndex >= S.fromDepth) this.squeezePressure = Math.min(S.cap, this.squeezePressure * (1 + S.rise));
    } else if (loss >= S.easeAt) {
      this.squeezePressure = Math.max(S.floor, this.squeezePressure * (1 - S.ease));
    }
  }

  /** INFINITE SQUEEZE breach ceiling: once THIS wave has drained ENDLESS_SQUEEZE.waveLossCap of max
   *  integrity, the rest of a hit lands at ×overflowMult (the Core braces). Returns `dmg` untouched
   *  unless the squeeze is on (golden-safe). */
  private braceHiveDamage(dmg: number): number {
    if (!this.squeezeOn) return dmg;
    const cap = ENDLESS_SQUEEZE.waveLossCap * this.maxIntegrity;
    const lost = Math.max(0, this.waveStartIntegrity - this.integrity);
    const under = Math.max(0, Math.min(dmg, cap - lost));
    return Math.round(under + (dmg - under) * ENDLESS_SQUEEZE.overflowMult);
  }

  /** Endless wave: the AI Director composes spawns from a depth-scaled threat budget; the
   * Spawn Director lays them out on the endless cadence (incl. the swarm special event). */
  private startEndlessWave(): void {
    this.waveIndex++; // = Depth
    const depth = this.waveIndex;
    this.enterBiome(biomeForDepth(depth)); // Infinite: rotate ecosystems as the run goes deep
    if (!this.layoutPinned) this.enterLayout(layoutIdForDepth(depth)); // …and reshape the arena with them
    const w = this.director!.next(depth, this.activeBiome);
    // Endless uses its OWN intensity curves (geometric HP, gradual bounty) — NOT the linear stage
    // curve — so the wall behaves as docs/ENDLESS-SCALING.md describes. Speed/damage are applied
    // per-enemy in spawnOne (also mode-gated), keyed on this depth.
    this.spawnQueue = this.spawner.scheduleDirected(
      w,
      this.time,
      this.endlessHpMult(depth) * this.squeezePressure, // ×1 unless the Infinite squeeze is on (ENDLESS_SQUEEZE)
      this.endlessBountyMult(depth),
      this.diff.spawnRateMult,
    );
    this.spawnedAll = false;
    this.waveStartIntegrity = this.integrity;
    this.applyWaveStartStrains(); // STRAIN reactor verbs (adrenal jolt / glut surge)
    this.phase = 'wave';
    if (w.spawnBoss) this.spawnProceduralBoss(depth, this.dd.endlessBossStrength(depth) * this.squeezePressure);
    // Mega Boss cadence (docs/MEGA-BOSS.md): one every MEGA.infiniteEvery waves — but never two at
    // once (a surviving mega simply keeps dominating; the next window is skipped).
    if (this.mega === null) {
      const enc = infiniteMegaFor(depth);
      if (enc) this.spawnMegaBoss(enc, 'infinite');
    }
    this.applyDoctrineWarp(); // doctrine protocols reshape the queue first (no-op without a warp)
    this.applyRunEvent(depth); // Run Identity: fold this depth's beat + anomaly
    this.pushSfx('wave');
    if (this.events.hasListeners('waveStarted')) this.events.emit('waveStarted', { wave: depth, endless: true });
  }

  /** Boss Rush wave (docs/BOSS-RUSH.md): wave N deploys N procedural bosses in a staggered siege
   * column, screened by a THINNED director squad. The escort rides the endless intensity curves;
   * the bosses scale by Threat Level, so depth raises boss QUALITY as the count raises pressure. */
  private startBossRushWave(overlap = false): void {
    this.waveIndex++; // = Depth = boss count this wave
    const depth = this.waveIndex;
    this.enterBiome(biomeForDepth(depth)); // rotate ecosystems like Infinite
    const w = this.director!.next(depth, this.activeBiome);
    // Thin the escort to a skirmish screen (deterministic keep-every-Nth) — the bosses ARE the wave.
    const escort = this.spawner.scheduleDirected(
      w,
      this.time,
      this.endlessHpMult(depth),
      this.endlessBountyMult(depth),
      this.diff.spawnRateMult,
    ).filter((_, i) => i % RUSH.escortKeepEvery === 0);
    // The siege column: N bosses at this depth's Threat Level, deployed on a stagger so each
    // arrival reads (and the Nucleus never eats one simultaneous wall of grips).
    const tl = RUSH.bossTlBase + RUSH.bossTlPerWave * (depth - 1);
    // Strength curve (docs/BOSS-RUSH.md §wall): early columns field REDUCED bosses (ease-in), the
    // linear climb runs to geoFromWave, then the column grows GEOMETRICALLY — a wall always forms.
    const ramp = rushStrength(depth);
    const column: { at: number; tl: number; ramp: number; hp: number }[] = [];
    const hp = this.rushSizing(depth);
    for (let i = 0; i < depth; i++) column.push({ at: this.time + i * RUSH.bossStagger, tl, ramp, hp });
    // THE COLUMN DOESN'T WAIT (§wall): an overlapping column marches in ON TOP of the survivors —
    // what is still due from the column before is KEPT and merged back (time-sorted) after this
    // column's escort takes the doctrine warp (so leftovers are never warped twice).
    const leftover = overlap ? this.spawnQueue : [];
    this.spawnQueue = escort;
    this.rushPending = overlap ? [...this.rushPending, ...column].sort((a, b) => a.at - b.at) : column;
    if (overlap) this.floats.push({ x: WIDTH / 2, y: 300, text: `THE COLUMN DOESN'T WAIT — ${depth} MORE`, color: '#ff5d73', life: 2.4 });
    this.rushColumnDue = this.time + (depth - 1) * RUSH.bossStagger + RUSH.columnGraceSec;
    // Mega Boss cadence in the gauntlet (docs/MEGA-BOSS.md): every MEGA.rushEvery-th column is
    // ALSO overseen by a mega — the ultimate rush pressure. Never two at once (window skipped).
    if (this.mega === null) {
      const enc = rushMegaFor(depth);
      if (enc) this.spawnMegaBoss(enc, 'bossRush');
    }
    this.spawnedAll = false;
    this.waveStartIntegrity = this.integrity;
    this.applyWaveStartStrains(); // STRAIN reactor verbs (adrenal jolt / glut surge)
    this.phase = 'wave';
    this.applyDoctrineWarp(); // doctrine protocols reshape the escort queue (no-op without a warp)
    if (leftover.length > 0) this.spawnQueue = [...leftover, ...this.spawnQueue].sort((a, b) => a.at - b.at);
    this.pushSfx('wave');
    if (this.events.hasListeners('waveStarted')) this.events.emit('waveStarted', { wave: depth, endless: false });
  }

  /** Run Identity (docs/RUN-IDENTITY.md): fold this wave's scheduled event + the run anomaly onto the
   *  freshly-scheduled spawn queue (buff HP/bounty, promote elites, inflate/thin counts, inject an
   *  out-of-biome group) and spawn any ambush boss. Uses the DEDICATED runEventRng so the base run is
   *  unperturbed; a no-op when the plan is null (Stage) ⇒ golden-safe. Sets the HUD telegraph. */
  /** Doctrine protocol warp for the freshly-scheduled wave — the SAME deterministic queue
   *  transforms run events use (hp/bounty buffs, elite promotion, count scaling on
   *  runEventRng). Zero draws when the doctrine has no warp ⇒ golden-safe. */
  private applyDoctrineWarp(): void {
    const w = this.warp;
    if (w.hpMult) for (const s of this.spawnQueue) s.hpMult *= w.hpMult;
    if (w.bountyMult) for (const s of this.spawnQueue) s.bountyMult *= w.bountyMult;
    if (w.eliteChance) for (const s of this.spawnQueue) { if (this.runEventRng.next() < w.eliteChance) s.elite = true; }
    if (w.countMult && w.countMult !== 1) this.scaleSpawnCount(w.countMult);
  }

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

  /** The open draft's reroll price (docs/CARDS.md §reroll) — wave-scaled so a late re-deal is a
   *  real decision against next-prep tower money. */
  rerollCost(): number {
    return Math.round(DRAFT_REROLL.base + DRAFT_REROLL.perWave * this.waveIndex);
  }

  /** ONE paid re-deal of the open draft (docs/CARDS.md §reroll): pays Biomass for a fresh
   *  3-card roll from the same live-board pool. Never in the tutorial (the lesson is the base
   *  flow), never twice. Golden-safe: the extra rng draw happens only when a player invokes it. */
  rerollDraft(): boolean {
    if (this.phase !== 'draft' || this.draft === null || this.draftRerolled || this.tutorialMode) return false;
    const cost = this.rerollCost();
    if (this.biomass < cost) return false;
    this.biomass -= cost;
    this.draftRerolled = true;
    this.draft = this.dealDraft();
    this.pushSfx('draft'); // the re-deal plays the same beat as the deal
    return true;
  }

  chooseCard(id: string): void {
    if (this.phase !== 'draft' || !this.draft) return;
    const card = this.draft.find((c) => c.id === id);
    if (card) {
      // Apply the card at the player's PERMANENT level (docs/GENE-EVOLUTION.md): base effects + any
      // authored upgrade levels. With no upgrades authored yet this equals card.effects (golden-safe).
      const effects = effectiveGeneEffects(card, this.geneLevels[card.id] ?? 0, 0, this.geneTranscends[card.id]);
      applyCard({ ...card, effects }, this.cardContext());
      // Behavioral verbs (grant/hook) fold into the live sim arrays too — a drafted card can
      // add a projectile mutator / battlefield rule mid-run, not just at boot (equipment).
      for (const e of effects) if (e.op === 'grant' || e.op === 'hook') this.collectRunVerb(e);
      this.foldIntoHeroBundles(effects);
      const scored = effectsPower(effects) > 1; // instant-only cards are legitimately unscored
      const powerBefore = scored ? effectsPower(this.powerEffects()) : 0;
      this.chosenCards.push(cardToOption(card, effects));
      this.chosenCardEffects.push(...effects); // retain for the live run-Power (temporary bucket)
      if (scored) this.auditTempPower(powerBefore, `Gene Card ${card.name}`);
      this.pushSfx('draft');
      if (this.events.hasListeners('cardChosen')) this.events.emit('cardChosen', { id: card.id, rarity: card.rarity });
    }
    this.draft = null;
    if (this.dealOwedDraft()) return; // EARLY CALL: a called-over wave's card is next (stay in the draft)
    this.phase = 'prep';
    this.prepCountdown = AUTO_START_DELAY; // fresh countdown for the new prep
  }

  /** Toggle auto-start (the next wave fires automatically after a prep countdown). */
  setAutoStart(on: boolean): void {
    this.autoStart = on;
    if (on) this.prepCountdown = AUTO_START_DELAY; // start a fresh countdown when enabling
  }

  /** Buy the primary-hero AUTO-CAST unlock (docs/HEROES.md): a one-time Biomass purchase that also
   *  turns it ON. Returns false (no charge) if the run is over, it's already owned, or unaffordable —
   *  so the caller can gate feedback on a real purchase. */
  buyAutocast(): boolean {
    if (this.phase === 'won' || this.phase === 'lost') return false;
    if (this.autocastUnlocked) return false;
    if (this.biomass < HERO_AUTOCAST.cost) return false;
    this.biomass -= HERO_AUTOCAST.cost;
    this.autocastUnlocked = true;
    this.autocastOn = true;
    return true;
  }

  /** Toggle primary-hero auto-cast on/off (free; no-op until unlocked). */
  toggleAutocast(): void {
    if (this.autocastUnlocked) this.autocastOn = !this.autocastOn;
  }

  // ── Hero Evolution (docs/HERO-EVOLUTION.md) — the in-run BIOMASS sink ──────────

  /** Buy the next level of a Hero Evolution category. Deducts Biomass, applies the upgrade to EVERY
   *  active hero at once (and to any hero unlocked later — makeHero re-reads the bundle), and
   *  re-derives the live multiplier bundle. Returns false if the run is over / unknown id / maxed /
   *  unaffordable, so the caller can gate feedback on a real purchase. */
  /** Biomass invested into Hero Evolution this run (Hero Combat Console economy readout). */
  heroEvoSpent = 0;

  buyHeroEvolution(catId: string): boolean {
    if (this.phase === 'won' || this.phase === 'lost') return false;
    const cat = HERO_EVO_BY_ID[catId];
    if (!cat) return false;
    const level = this.heroEvoLevels[catId] ?? 0;
    if (level >= HERO_EVO.maxLevel) return false;
    const cost = heroEvoCost(cat, level, heroEvoTotalOwned(this.heroEvoLevels));
    if (this.biomass < cost) return false;
    const powerBefore = effectsPower(this.powerEffects()); // runtime Power validator (cold path)
    this.biomass -= cost;
    this.heroEvoSpent += cost; // the console's economy ledger (display only)
    this.heroEvoLevels[catId] = level + 1;
    this.evo = deriveHeroEvoMods(this.heroEvoLevels);
    // Vitality changes maxHp on the LIVE heroes — grow every hero's pool and heal by the delta so
    // the buy is instantly felt and never drops a hero to a lower HP% than before.
    if (cat.key === 'maxHpMult') {
      for (const h of this.heroes) {
        const newMax = this.heroMaxHpFor(h.kind);
        const delta = newMax - h.maxHp;
        h.maxHp = newMax;
        if (delta > 0 && !h.down) h.hp = Math.min(newMax, h.hp + delta);
        else h.hp = Math.min(newMax, h.hp); // never let current HP exceed the new max
      }
    }
    this.pushSfx('splice'); // the evolution/mutation cue — a satisfying purchase sound
    const ph = this.primaryHero;
    this.floats.push({ x: ph.x, y: ph.y - 30, text: `${cat.icon} ${cat.name} ${level + 1}`, color: '#7ad1ff', life: 1.2 });
    this.auditTempPower(powerBefore, `Hero Evolution ${cat.name} L${level + 1}`);
    return true;
  }

  /** The run's Hero Evolution purchases as CardEffect[] — they fold into the `temporary` Power bucket
   *  via the shared effectsPower bridge, so every purchase raises the global Power Score. */
  heroEvoEffects(): CardEffect[] {
    return heroEvoEffects(this.heroEvoLevels);
  }

  /** Read-only view of the run's Hero Evolution levels (Hive Intelligence's planner input). */
  heroEvoLevelsView(): Readonly<Record<string, number>> {
    return this.heroEvoLevels;
  }

  // ── HIVE INTELLIGENCE (docs/HIVE-MIND.md) — the in-run best-upgrade executive ────────────
  //    Player-triggered ONLY (the HUD button): golden autoplay never calls these, so every
  //    golden seed is untouched by construction. All purchases ride the same public APIs a
  //    manual click uses — Power audit, ceremonies and stats all fire normally.

  /** The ranked plan (best value first) — what a pulse WOULD buy right now. Pure read. */
  hiveEvaluate(): HiveAction[] {
    if (!this.automationAllowed || this.phase === 'won' || this.phase === 'lost') return [];
    return hivePlan(this);
  }

  // The HUD's readiness glow, recomputed at most twice a sim-second (getSnapshot runs at UI
  // rate; the plan walk is cheap but not free). Presentation cache only — never sim input.
  private hiveReadyCache = false;
  private hiveReadyAt = -1;
  private hiveReadySnapshot(): boolean {
    if (this.hiveReadyAt < 0 || this.time - this.hiveReadyAt >= 0.5 || this.time < this.hiveReadyAt) {
      this.hiveReadyCache = this.hiveEvaluate().length > 0;
      this.hiveReadyAt = this.time;
    }
    return this.hiveReadyCache;
  }

  /** Execute one HIVE INTELLIGENCE pulse: buy the best action, re-plan (costs and curves move
   *  with every purchase), repeat until nothing worthwhile remains, the reserve is reached, or
   *  the per-pulse cap trips. Returns the report the HUD renders as the action ticker. */
  hivePulse(opts?: { maxActions?: number }): { spent: number; actions: { label: string; detail: string; cost: number }[] } {
    const cap = opts?.maxActions ?? HIVE_MIND.maxActionsPerPulse;
    // The reserve is pinned ONCE from the wallet the pulse started with — re-planning after
    // each buy must never re-shrink it (that would asymptotically spend toward zero).
    const reserveFloor = Math.max(HIVE_MIND.reserveMin, Math.floor(this.biomass * HIVE_MIND.reserveFrac));
    const actions: { label: string; detail: string; cost: number }[] = [];
    let spent = 0;
    if (!this.automationAllowed) return { spent, actions }; // frontier content: the decisions stay the player's
    for (let i = 0; i < cap; i++) {
      if (this.phase === 'won' || this.phase === 'lost') break;
      const plan = hivePlan(this, { reserveFloor });
      const best = plan[0];
      if (!best) break;
      const before = this.biomass;
      if (!best.exec(this)) break; // a provider mispriced reality — stop rather than thrash
      spent += before - this.biomass;
      actions.push({ label: best.label, detail: best.detail, cost: best.cost });
      // The battlefield announces the actor (each purchase's own ceremony already fired).
      this.floats.push({ x: WIDTH / 2, y: 330 + actions.length * 22, text: `◈ ${best.label}`, color: '#8fd0ff', life: 1.6 });
    }
    if (actions.length > 0) this.pushSfx('splice');
    this.hiveReadyAt = -1; // the wallet moved — recompute the button glow immediately
    return { spent, actions };
  }

  /** ALL of the run's TEMPORARY power contributors as CardEffect[] — drafted gene cards + Hero
   *  Evolution. `meta.powerWith(game.powerEffects())` yields the live run Power Score (HUD/menus).
   *  Gear/doctrine boot effects are excluded (already counted in the account `equipment` bucket). */
  powerEffects(): CardEffect[] {
    // Purchased branch tiers are real strength — scored via the heuristic vehicle (POWER-AUDIT.md;
    // this fixed the "branches raise strength without raising Power" bug).
    const branchTiers = this.towers.reduce((n, t) => n + t.tier, 0);
    const strainLevels = this.towers.reduce((n, t) => n + (t.strain - 1), 0); // docs/STRAIN.md §power
    return [...this.chosenCardEffects, ...heroEvoEffects(this.heroEvoLevels), ...branchPowerEffects(branchTiers), ...strainPowerEffects(strainLevels)];
  }

  /** The run's temporary Power WITHOUT the drafted cards (Hero Evolution + branches + strains — the
   *  Biomass investment) — the §6a v3 live ratio's in-run term. Cold path (wave launch / prep HUD). */
  private investedPower(): number {
    const branchTiers = this.towers.reduce((n, t) => n + t.tier, 0);
    const strainLevels = this.towers.reduce((n, t) => n + (t.strain - 1), 0);
    return effectsPower(heroEvoEffects(this.heroEvoLevels)) * effectsPower(branchPowerEffects(branchTiers)) * effectsPower(strainPowerEffects(strainLevels));
  }

  // ── Power-integration runtime validator (docs/POWER-AUDIT.md) ────────────────────────────────
  //   Any in-run action that grants strength MUST move the temporary Power bucket. Violations
  //   collect here (and warn) so tests pin the contract and future content can't silently bypass
  //   Power. Cold paths only (draft / purchase moments) — never the tick loop.
  readonly powerAuditWarnings: string[] = [];

  private auditTempPower(before: number, source: string): void {
    const after = effectsPower(this.powerEffects());
    if (after <= before + 1e-12) {
      const msg = `[power-audit] ${source} granted strength but the temporary Power bucket did not rise (${before.toFixed(4)} → ${after.toFixed(4)})`;
      this.powerAuditWarnings.push(msg);
      console.warn(msg);
    }
  }

  /** Field an ADDITIONAL hero mid-run — the forward-looking hero-unlock seam (HEROES.md). The new
   *  hero IMMEDIATELY inherits every Hero Evolution bought so far (makeHero folds the live bundle),
   *  and its innate passive aura folds in like a roster hero. No-op if the kind is already fielded. */
  fieldHero(kind: HeroKind): boolean {
    if (this.heroes.some((h) => h.kind === kind)) return false;
    if (!this.heroIdById[kind]) {
      const id = heroIdentity(kind);
      this.heroIdById[kind] = id;
      if (id.passive.kind === 'towerAura') {
        const am = this.heroProgress[kind].symbiote?.auraMult ?? 1; // symbiote presence swell
        this.mods.heroAuraRadius = Math.max(this.mods.heroAuraRadius, 130 * am);
        this.mods.heroTowerHasteAura += id.passive.amount * am;
        this.mods.heroTowerDamageAura += id.passive.amount * am;
      }
    }
    this.heroes.push(this.makeHero(kind));
    return true;
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
        this.heroFlatMaxHp[h.kind] = (this.heroFlatMaxHp[h.kind] ?? 0) + n; // so heroMaxHpFor keeps it
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
    this.stepCount++;
    // Danger camera (docs/CAMERA.md) — render-only, ticked in EVERY phase (combat, settle,
    // prep, won, lost) so the tension always enters deliberately and exhales smoothly.
    this.dangerCameraSystem(dt);
    // Biomorph Conveyor (docs/STRAIN.md §conveyor): the belt lives through build AND combat —
    // INCLUDING the tutorial (docs/TUTORIAL.md §accuracy: the lessons teach the REAL deployment
    // model, so the belt must exist under them). Dedicated rng + refunds only on overflow, so an
    // untouched belt costs the sim nothing and the golden autoplay (never tutorialMode) is unmoved.
    if (this.phase === 'prep' || this.phase === 'wave') this.conveyorTick();
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
      if (this.mega !== null) this.megaDormancySystem(dt); // §dormancy: the organism burrows as the wave winds down
      if (this.settleTimer <= 0) this.endWave();
      return;
    }
    this.time += dt;
    if (this.runBuffs.length > 0) this.tickRunBuffs(dt); // no-op (skipped) on the golden path
    if (this.minions.length > 0) this.minionSystem(dt); // empty on the golden path → skipped
    if (this.phase === 'wave') {
      this.spawnSystem();
      if (this.rushPending.length > 0) this.rushSpawnSystem(); // Boss Rush only — empty otherwise
      // Boss Rush §wall: a column still standing past its grace window is joined by the next one.
      if (this.rushColumnDue > 0 && this.time >= this.rushColumnDue && this.settleTimer <= 0) this.startBossRushWave(true);
      this.rebuildGrid(); // one O(n) rebuild feeds every proximity query this tick
      if (this.corruptionPools.length > 0) {
      for (const cp of this.corruptionPools) cp.t -= dt;
      this.corruptionPools = this.corruptionPools.filter((cp) => cp.t > 0);
    }
    // Signature fields (docs/BOSS-DESIGN.md §identity) — both outlive their caster (a landed
    // reticle still strikes, a well still swallows), so they tick here, not in bossSystem.
    // Empty on every non-signature run ⇒ zero cost (golden-safe).
    if (this.mortarStrikes.length > 0) this.mortarStrikeTick(dt);
    if (this.nullWells.length > 0) {
      for (const w of this.nullWells) w.t -= dt;
      this.nullWells = this.nullWells.filter((w) => w.t > 0);
    }
    if (this.bossCount > 0) this.bossSystem(dt); // no-op cost when no boss is present
      if (this.mega !== null) this.megaBossSystem(dt); // gated: zero cost on every other run
      if (this.mines.length > 0) this.mineSystem(dt); // Blight Sower fields only — empty otherwise
      this.economySystem(dt);
      // Daily per-second modifiers (docs/DAILY-RUN.md) — both gated (0 without the modifier ⇒
      // golden-safe): Blood Frenzy bleeds the fielded heroes; Regeneration knits the Hive.
      if (this.dailyFx.heroDrainFrac > 0 && !this.god) {
        for (const h of this.heroes) {
          if (h.down) continue;
          h.hp -= h.maxHp * this.dailyFx.heroDrainFrac * dt;
          if (h.hp <= 0) {
            h.down = true;
            h.respawn = HERO_DEFS[h.kind].respawnTime;
            this.floats.push({ x: h.x, y: h.y - 20, text: 'DOWN', color: '#ff5d73', life: 1.2 });
          }
        }
      }
      if (this.dailyFx.hiveRegenFrac > 0 && this.integrity > 0) {
        this.integrity = Math.min(this.maxIntegrity, this.integrity + this.maxIntegrity * this.dailyFx.hiveRegenFrac * dt);
      }
      this.emergencySystem(dt); // before towers: builds the in-zone set towers may override to
      this.towerSystem(dt);
      this.projectileSystem(dt);
      this.poolSystem(dt);
      this.statusSystem(dt);
      this.enemyAbilitySystem(dt); // regen / support auras / summons (no-op for trait-less enemies)
      this.enemyShellSystem(dt); // artillery shells in flight (empty array on the golden path)
      this.enemyMoveSystem(dt);
      this.heroSystem(dt);
      if (this.pendingImpacts.length > 0) this.pendingImpactSystem(); // cinematic payloads LAND (docs/HERO-CINEMATICS.md)
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
      this.enemyShellSystem(dt); // in-flight shells still land (combat residue, like projectiles)
      this.poolSystem(dt);
      this.heroSystem(dt);
      this.floatSystem(dt);
      this.particleSystem(dt);
      if (this.mega !== null) this.megaDormancySystem(dt); // §dormancy: a persisting mega stays buried through prep
      // Auto-start: count the prep timer down to the next wave when the player enabled it AND has
      // taken their first setup action (autoStartReady). Off by default ⇒ the manual-start golden
      // run is byte-identical; consumes no rng. While armed-but-not-ready the countdown is frozen
      // (the HUD shows "Waiting for first placement…") so the run never auto-fires on an empty board.
      if (this.autoStart && this.autoStartReady && this.phase === 'prep') {
        // REAL-TIME countdown: dividing by timeScale cancels the fast-forward step multiplier, so the
        // prep auto-start burns the same WALL time at 1×/2×/5×. timeScale is 1 on the golden path (and
        // no combat runs in prep) ⇒ byte-identical. See docs/GAME-SPEED / AUTO_START_DELAY.
        this.prepCountdown -= dt / this.timeScale;
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
      this.spawnOne(q.kind, q.hpMult, q.bountyMult, q.elite === true, q.speedMult ?? 1);
    }
    if (this.spawnQueue.length === 0) this.spawnedAll = true;
  }

  /** Boss Rush (docs/BOSS-RUSH.md): deploy any bosses whose stagger time has arrived. Only ever
   * populated in bossRush mode — every other mode sees a zero-length no-op (golden-safe). */
  private rushSpawnSystem(): void {
    while (this.rushPending.length > 0 && this.rushPending[0].at <= this.time) {
      const p = this.rushPending.shift()!;
      this.spawnProceduralBoss(p.tl, p.ramp, p.hp);
    }
  }

  /** Boss Rush §wall: the account-sizing HP factor at a depth — S^t, t ramping 0 → 1 across
   *  RUSH.powerRampFrom → powerRampTo (the opening duels stay the warm-up). 1 in every other mode. */
  private rushSizing(depth: number): number {
    if (this.rushHpScale === 1) return 1;
    const t = Math.max(0, Math.min(1, (depth - RUSH.powerRampFrom) / Math.max(1, RUSH.powerRampTo - RUSH.powerRampFrom)));
    return Math.pow(this.rushHpScale, t);
  }

  private spawnOne(kind: EnemyKind, hpMult: number, bountyMult: number, elite = false, speedMult = 1): void {
    if (this.enemies.length >= PERF.maxEnemies) return; // entity budget
    const def = ENEMY_DEFS[kind];
    const spawn = layoutSpawn(this.layout, this.rng.next());
    // Daily Infestation: per-spawn elite promotion off the DEDICATED daily rng (never consumed at
    // chance 0 ⇒ every other mode's rng sequence is untouched).
    if (this.dailyFx.eliteChance > 0 && !elite && this.dailyRng.next() < this.dailyFx.eliteChance) elite = true;
    // Director-promoted elites are buffed in place (no new archetype) — endless only,
    // so a stage run (elite=false) is byte-identical.
    const eHp = elite ? DIRECTOR.eliteHpMult : 1;
    const eDmg = elite ? DIRECTOR.eliteDmgMult : 1;
    const eBounty = elite ? DIRECTOR.eliteBountyMult : 1;
    // Biome enemy modifiers (docs/BIOMES.md) — baked once at spawn so a unit keeps its BIRTH
    // biome's stats after an Infinite transition. Identity under NEUTRAL_BIOME ⇒ golden-safe.
    const bm = this.activeBiome.mods;
    const hp = def.hp * hpMult * eHp * bm.enemyHpMult;
    // Endless-only intensity: enemies get gradually faster + hit harder with depth (Boss Rush
    // escorts ride the same curves). Mode-gated so a stage spawn is byte-identical (×1). Keyed
    // on the current depth (= waveIndex during this wave).
    const endless = this.mode === 'endless' || this.mode === 'bossRush';
    const eSpeed = endless ? this.endlessSpeedMult(this.waveIndex) : 1;
    const eDmgWave = endless ? this.endlessDamageMult(this.waveIndex) : 1;
    this.enemies.push({
      id: this.nextId++,
      kind,
      x: spawn.x,
      y: spawn.y,
      hp,
      maxHp: hp,
      baseArmor: def.armor + bm.enemyArmorBonus + this.dailyFx.enemyArmorAdd, // +0 without Ironhide → golden-safe
      speed: def.speed * eSpeed * this.stageSpeedMult * bm.enemySpeedMult * (this.warp.speedMult ?? 1) * this.dailyFx.enemySpeedMult * speedMult, // ×endless ×stage ×biome ×doctrine ×daily ×§6a live speed (all ×1 otherwise → golden-safe)
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
      mark: 0,
      resonance: 0,
      alive: true,
      sieging: false,
      ring: 0,
      attackCd: 0,
      windup: -1,
      attackInterval: def.attack.interval,
      attackWindup: def.attack.windup,
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
  spawnBoss(def: BossDef, hpScale = 1): void {
    // NEMESIS (docs/NEMESIS.md): the boss that killed you returns HARDER — its GRUDGE LADDER
    // (core/nemesis.ts) folds `slain` into a full trait bundle (hp, bounty, armor, Nucleus
    // damage, siege cadence), not just HP. Rides ctor opts ⇒ replays reproduce it exactly;
    // absent (fresh saves, dailies) ⇒ every lever is ×1/+0 ⇒ identical to the base spawn.
    const nem = this.nemesisSpec !== null && this.nemesisSpec.defId === def.id ? nemesisTraits(this.nemesisSpec.slain) : null;
    const hp = BOSS.baseHp * def.hpMult * (nem ? nem.hpMult : 1) * hpScale; // hpScale: §6a live threat (1 elsewhere)
    this.procBosses.set(def.id, def); // ensure bossSystem can always resolve this boss's def
    this.bossCount++;
    const splitter = def.modules.find((m) => m.kind === 'splitter');
    this.enemies.push({
      id: this.nextId++,
      kind: 'tyrant', // borrows the boss-tier visual; behavior is driven by the runtime
      x: layoutSpawn(this.layout, this.rng.next()).x,
      y: 8,
      hp,
      maxHp: hp,
      baseArmor: (def.armor ?? BOSS.baseArmor) + (nem ? nem.armorBonus : 0),
      speed: CHASSIS[def.chassis].speed,
      bounty: Math.round(def.bounty * (nem ? nem.bountyMult : 1)),
      damage: def.damage * (nem ? nem.damageMult : 1),
      fracture: 0,
      corrosion: 0,
      infection: 0,
      disrupt: 0,
      mark: 0,
      resonance: 0,
      shredFlash: 0,
      hitFlash: 0,
      dmgAccum: 0,
      dmgTimer: 0,
      alive: true,
      sieging: false,
      ring: 0,
      attackCd: 0,
      windup: -1,
      attackInterval: CHASSIS[def.chassis].attack.interval / (nem ? nem.attackSpeedMult : 1),
      attackWindup: CHASSIS[def.chassis].attack.windup,
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
        carapace: 0,
        carapaceT: 0,
        grip: 0,
        burrow: 0,
        unstop: 0,
        unstopDR: 0,
        exposeT: 0,
        visualTier: 0,
        ...(nem ? { nemesis: true, nemesisTier: nem.tier } : {}),
        splitsLeft: splitter ? splitter.generations ?? 1 : 0,
        telegraph: null,
      },
    });
    // Side-channel for the HUD/audio (docs/NEMESIS.md) — a nemesis entrance earns its roar.
    // No listeners on the headless/golden path ⇒ never emitted, never a determinism factor.
    if (this.events.hasListeners('bossSpawned')) {
      this.events.emit('bossSpawned', { defId: def.id, name: def.name, nemesis: !!nem, nemesisTier: nem ? nem.tier : 0 });
    }
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
        // The MUTATION beat (docs/BOSS-DESIGN.md §phases): the boss visibly evolves — a new
        // visual tier, a burst + heavy cue — and any `rally` module in the phase it ENTERED
        // calls reinforcements scaled by its missing HP (the deeper the wound, the bigger the call).
        const entered = def.phases[b.phase];
        b.visualTier = entered.visualTier ?? b.phase;
        e.hitFlash = FX.hitFlash;
        this.floats.push({ x: e.x, y: e.y - 26, text: 'MUTATING!', color: def.color, life: 1 });
        this.pushSfx('splice');
        if (this.events.hasListeners('bossPhase')) this.events.emit('bossPhase', { defId: b.defId, name: b.name, phase: b.phase });
        for (const mi of entered.modules) {
          const rm = def.modules[mi];
          if (rm.kind !== 'rally') continue;
          const call = (rm.amount ?? 4) + Math.floor((1 - hpFrac) * 3);
          for (let i = 0; i < call && this.enemies.length < PERF.maxEnemies; i++) {
            this.spawnNear(rm.addKind ?? 'runner', e.x, e.y);
          }
        }
      }
      const phase = def.phases[b.phase];

      if (b.shielded > 0) b.shielded = Math.max(0, b.shielded - dt);
      if (b.channel > 0) {
        b.channel -= dt;
        b.telegraph = 'CHANNELING';
        if (b.channel <= 0) {
          // the cast lands on the Nucleus unless the boss died mid-cast
          const chan = def.modules.find((m) => m.kind === 'channeler');
          if (chan && !this.god) {
            const before = this.integrity;
            this.integrity = Math.max(0, this.integrity - (chan.amount ?? 12));
            this.statIntegrityLost += before - this.integrity; // flawless-run tracking (regen can't redeem it)
            this.noteHiveDamage(`boss:${b.name}`, before - this.integrity);
          }
          this.floats.push({ x: nucleusPoint.x, y: nucleusPoint.y - 16, text: 'BREACH!', color: '#ff5d73', life: 1 });
          b.telegraph = null;
        }
      } else if (b.shielded <= 0) {
        b.telegraph = null;
      }

      // tick + fire the phase's active modules — a desperation phase runs the kit HOT
      // (cadenceMult < 1 — docs/BOSS-DESIGN.md §identity).
      for (const mi of phase.modules) {
        b.moduleCd[mi] -= dt;
        if (b.moduleCd[mi] > 0) continue;
        const m = def.modules[mi];
        b.moduleCd[mi] = m.cooldown * (phase.cadenceMult ?? 1);
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
          case 'healer':
            this.bossHeal(e, m.amount ?? 120, m.radius ?? 160); // mend itself + the nearby pack
            b.telegraph = 'MENDING';
            break;
          case 'carapace':
            b.carapace = m.amount ?? 30; // heavy bonus armor for a window — Fracture → Shred cracks it
            b.carapaceT = m.duration ?? 3.5;
            b.telegraph = 'CARAPACE';
            break;
          case 'corecrush':
            // Only fires AT the Hive: grabs the Core and crushes it over time — but the grip
            // EXPOSES it (applyDamage amplifies hits while gripping). Burst it off.
            if (e.sieging && b.grip <= 0 && b.burrow <= 0) {
              b.grip = m.duration ?? 4;
              b.telegraph = 'CORE CRUSH';
              this.pushSfx('breach');
            } else if (b.grip <= 0) {
              b.moduleCd[mi] = 1.5; // not in position yet — retry soon
            }
            break;
          case 'burrower':
            // Vanish beneath the field (untargetable), then ERUPT beside the Hive.
            if (!e.sieging && b.burrow <= 0 && b.grip <= 0) {
              b.burrow = m.duration ?? 2.4;
              b.telegraph = 'BURROWED';
              e.windup = -1;
            }
            break;
          case 'bulwark':
            e.shield = Math.max(e.shield ?? 0, m.amount ?? 220); // a REAL bio-shield — sustained damage breaks it
            b.telegraph = 'BIO-SHIELD';
            break;
          case 'corruptor': {
            // Seed a corruption pool on the nearest tower (else at its own feet): towers
            // inside hit softer until it fades. Value OUTSIDE the pool is the counter.
            let px = e.x;
            let py = e.y;
            let best = Infinity;
            for (const ct of this.towers) {
              const cd2 = dist2(e.x, e.y, ct.x, ct.y);
              if (cd2 < best) { best = cd2; px = ct.x; py = ct.y; }
            }
            this.corruptionPools.push({ x: px, y: py, r: m.radius ?? 95, t: m.duration ?? 6, frac: m.frac ?? 0.35 });
            b.telegraph = 'CORRUPTION';
            break;
          }
          case 'gravitas': {
            // Drag every hero in reach toward itself — positioning pressure nothing else applies.
            const gr2 = (m.radius ?? 240) * (m.radius ?? 240);
            const pull = m.amount ?? 90;
            for (const h of this.heroes) {
              if (h.down) continue;
              const hd2 = dist2(e.x, e.y, h.x, h.y);
              if (hd2 > gr2 || hd2 < 1) continue;
              const hd = Math.sqrt(hd2);
              const step = Math.min(pull, Math.max(0, hd - 40)); // never INTO the body
              h.x += ((e.x - h.x) / hd) * step;
              h.y += ((e.y - h.y) / hd) * step;
            }
            b.telegraph = 'DRAG';
            this.pushSfx('dissolve');
            break;
          }
          case 'dampener': {
            // Suppression aura: towers in reach fire slower for a window (soft suppressor).
            const dr2 = (m.radius ?? 150) * (m.radius ?? 150);
            for (const dtw of this.towers) {
              if (dist2(e.x, e.y, dtw.x, dtw.y) <= dr2) {
                dtw.dampenedUntil = Math.max(dtw.dampenedUntil, this.time + (m.duration ?? 5));
                dtw.dampenFrac = Math.max(dtw.dampenFrac, m.frac ?? 0.3);
              }
            }
            b.telegraph = 'DAMPEN FIELD';
            break;
          }
          case 'rally':
            break; // phase-ENTRY behavior — fired by the transition above, never by cooldown
          // ── Chassis signatures (docs/BOSS-DESIGN.md §identity) ──
          case 'warcry': {
            // BRUISER: the pack surges — every living enemy gains timed speed. Counter: slows,
            // or hold AoE for the stampede. The boss itself rides its own cry.
            const mult = 1 + (m.frac ?? 0.25);
            const dur = m.duration ?? 3.5;
            for (const we of this.enemies) {
              if (!we.alive) continue;
              we.hasteT = Math.max(we.hasteT ?? 0, dur);
              we.hasteMult = Math.max(we.hasteMult ?? 1, mult);
            }
            b.telegraph = 'WARCRY';
            this.floats.push({ x: e.x, y: e.y - 26, text: 'WARCRY!', color: def.color, life: 1 });
            this.pushSfx('boss');
            break;
          }
          case 'mortarfall': {
            // ARTILLERY: reticles bloom over the DENSEST guns, then the strikes SUPPRESS
            // whatever still sits under them. Counter: spread placement (one strike per target
            // tower — a spread line eats one reticle, a clump eats them all).
            if (this.towers.length === 0) { b.moduleCd[mi] = 2; break; }
            const strikes = Math.min(m.amount ?? 3, this.towers.length);
            // Deterministic target pick: the towers nearest the Nucleus-ward mass of the field —
            // sort a scratch copy by neighbor density (towers within 2r), densest first.
            const r = m.radius ?? 70;
            const r2 = (r * 2) * (r * 2);
            const ranked = this.towers
              .map((t) => ({ t, n: this.towers.reduce((a, o) => a + (dist2(t.x, t.y, o.x, o.y) <= r2 ? 1 : 0), 0) }))
              .sort((a, b2) => b2.n - a.n || a.t.y - b2.t.y);
            for (let i = 0; i < strikes; i++) {
              const tgt = ranked[i].t;
              this.mortarStrikes.push({ x: tgt.x, y: tgt.y, r, t: 1.15, suppress: m.duration ?? 2.6 });
            }
            b.telegraph = 'MORTARFALL';
            this.pushSfx('boss');
            break;
          }
          case 'broodburst': {
            // SWARMLORD: converts its own HP into a birthing flood — and the tearing leaves it
            // EXPOSED (bonus damage, like the core-crush grip). Counter: punish the window.
            const cost = Math.min(e.hp - 1, e.maxHp * (m.frac ?? 0.1));
            if (cost <= 0 || this.enemies.length >= PERF.maxEnemies) break;
            e.hp -= cost;
            b.exposeT = m.duration ?? 3;
            const n = m.amount ?? 5;
            for (let i = 0; i < n && this.enemies.length < PERF.maxEnemies; i++) {
              this.spawnNear(m.addKind ?? 'runner', e.x, e.y);
            }
            b.telegraph = 'BROODBURST';
            e.hitFlash = FX.hitFlash;
            this.floats.push({ x: e.x, y: e.y - 26, text: 'BROODBURST!', color: def.color, life: 1 });
            this.pushSfx('splice');
            break;
          }
          case 'nullwell': {
            // CONTROLLER: a well between itself and the nearest tower that SWALLOWS projectiles
            // crossing it. Counter: fire from new angles / reposition. Two wells max — fairness.
            if (this.nullWells.length >= 2) { b.moduleCd[mi] = 3; break; }
            let wx = e.x;
            let wy = Math.min(HEIGHT - 60, e.y + 90);
            let best = Infinity;
            for (const wt of this.towers) {
              const wd2 = dist2(e.x, e.y, wt.x, wt.y);
              if (wd2 < best) { best = wd2; wx = (e.x + wt.x) / 2; wy = (e.y + wt.y) / 2; }
            }
            this.nullWells.push({ x: wx, y: wy, r: m.radius ?? 80, t: m.duration ?? 5 });
            b.telegraph = 'NULL WELL';
            this.pushSfx('dissolve');
            break;
          }
          case 'unstoppable':
            // JUGGERNAUT: the march — slow-immune and damage-reduced for the window. Counter:
            // spend burst BEFORE or AFTER, never during. (applyDamage + the slow fold honor it.)
            b.unstop = m.duration ?? 4;
            b.unstopDR = m.frac ?? 0.35;
            b.telegraph = 'UNSTOPPABLE';
            e.hitFlash = FX.hitFlash;
            this.pushSfx('boss');
            break;
        }
      }
      if (b.carapaceT > 0) {
        b.carapaceT = Math.max(0, b.carapaceT - dt);
        if (b.carapaceT <= 0) b.carapace = 0; // window closed — soft again
      }
      // Core-crush grip: drains Integrity continuously while attached; ends when the duration
      // lapses or it's knocked off the Hive. EXPOSED the whole time (see applyDamage).
      if (b.grip > 0) {
        b.grip = Math.max(0, b.grip - dt);
        if (!e.sieging) b.grip = 0; // peeled off the Hive — the grip breaks
        else {
          const crush = def.modules.find((cm) => cm.kind === 'corecrush');
          if (crush && !this.god) {
            const before = this.integrity;
            this.integrity = Math.max(0, this.integrity - (crush.amount ?? 6) * dt);
            this.statIntegrityLost += before - this.integrity; // flawless-run tracking (regen can't redeem it)
            this.noteHiveDamage(`boss:${b.name}`, before - this.integrity);
          }
          b.telegraph = 'CORE CRUSH';
        }
      }
      // Burrow: submerged (untargetable, immobile) — then ERUPTS beside the Hive.
      if (b.burrow > 0) {
        b.burrow = Math.max(0, b.burrow - dt);
        b.telegraph = 'BURROWED';
        if (b.burrow <= 0) {
          e.x = Math.max(24, Math.min(WIDTH - 24, nucleusPoint.x + (this.rng.next() - 0.5) * 180));
          e.y = Math.max(24, nucleusPoint.y - 110 - this.rng.next() * 40);
          b.telegraph = 'ERUPTED';
          e.hitFlash = FX.hitFlash;
          this.floats.push({ x: e.x, y: e.y - 24, text: 'ERUPTION!', color: def.color, life: 0.9 });
          this.pushSfx('dissolve');
        }
      }
      if (b.charge > 0) {
        b.charge = Math.max(0, b.charge - dt); // count the dash window down
        if (b.charge > 0 && b.channel <= 0 && b.shielded <= 0) b.telegraph = 'CHARGE';
      }
      // Signature windows (docs/BOSS-DESIGN.md §identity): the juggernaut march and broodburst
      // exposure count down here; applyDamage + the movement slow fold CONSUME them.
      if (b.unstop > 0) {
        b.unstop = Math.max(0, b.unstop - dt);
        if (b.unstop > 0 && b.channel <= 0 && b.shielded <= 0) b.telegraph = 'UNSTOPPABLE';
        else if (b.unstop <= 0) b.unstopDR = 0; // the march ends — soft again
      }
      if (b.exposeT > 0) b.exposeT = Math.max(0, b.exposeT - dt);
      if (phase.speedMult && b.enrage === 0) e.speed = CHASSIS[def.chassis].speed * phase.speedMult;
    }
  }

  /** Corruption-pool damage penalty for a tower (docs/BOSS-DESIGN.md §siege): the STRONGEST
   *  overlapping pool applies (no stacking spiral). 1 with no pools ⇒ identical fold. */
  private towerCorruptionMult(t: Tower): number {
    if (this.corruptionPools.length === 0) return 1;
    let worst = 0;
    for (const cp of this.corruptionPools) {
      if (cp.frac > worst && dist2(t.x, t.y, cp.x, cp.y) <= cp.r * cp.r) worst = cp.frac;
    }
    return 1 - worst;
  }

  /** The boss's current-phase damage multiplier (desperation phases hit harder). 1 for
   *  normal enemies and phases without a damageMult ⇒ identical fold. */
  private bossPhaseDamageMult(e: Enemy): number {
    if (!e.boss) return 1;
    const def = bossDef(e.boss.defId) ?? this.procBosses.get(e.boss.defId);
    return def?.phases[e.boss.phase]?.damageMult ?? 1;
  }

  /** Boss suppressor module: disable every tower within `radius` for `duration` seconds. */
  private suppressTowers(boss: Enemy, radius: number, duration: number): void {
    const r2 = radius * radius;
    for (const t of this.towers) {
      if (dist2(boss.x, boss.y, t.x, t.y) <= r2) t.disabledUntil = Math.max(t.disabledUntil, this.time + duration);
    }
  }

  /** ARTILLERY MORTARFALL reticles (docs/BOSS-DESIGN.md §identity): each counts down, then the
   *  shell LANDS — every tower still under the blast is suppressed for the strike's window. The
   *  reticle IS the telegraph; guns can't move, so the counter is pre-spread placement. */
  private mortarStrikeTick(dt: number): void {
    let landed = false;
    for (const s of this.mortarStrikes) {
      s.t -= dt;
      if (s.t > 0) continue;
      landed = true;
      const r2 = s.r * s.r;
      for (const t of this.towers) {
        if (dist2(s.x, s.y, t.x, t.y) <= r2) t.disabledUntil = Math.max(t.disabledUntil, this.time + s.suppress);
      }
      this.spawnParticles(s.x, s.y, PARTICLE.ember, undefined, 1.5);
      this.floats.push({ x: s.x, y: s.y - 14, text: 'IMPACT!', color: '#ff8a3c', life: 0.9 });
    }
    if (landed) {
      this.pushSfx('breach');
      this.mortarStrikes = this.mortarStrikes.filter((s) => s.t > 0);
    }
  }

  /** Boss healer module: pulse HP to the boss + every living enemy within `radius` (the whole pack),
   *  clamped to each unit's max. The lesson is kill-priority — burst it down or clear the adds it mends. */
  private bossHeal(boss: Enemy, amount: number, radius: number): void {
    const r2 = radius * radius;
    for (const e of this.enemies) {
      if (!e.alive || e.hp >= e.maxHp) continue;
      if (e === boss || dist2(boss.x, boss.y, e.x, e.y) <= r2) {
        e.hp = Math.min(e.maxHp, e.hp + amount);
        e.hitFlash = FX.hitFlash;
      }
    }
    this.floats.push({ x: boss.x, y: boss.y - 18, text: 'MEND', color: '#6effa8', life: 0.7 });
  }

  /** Boss splitter module (death-triggered): cleave the dying boss into `amount` smaller copies, each
   *  at a fraction of its max HP and one generation shorter. The lesson is to spread damage — overkill
   *  on the parent is wasted, since the split children carry their own fresh bars. */
  private splitBoss(parent: Enemy): void {
    const b = parent.boss;
    if (!b) return;
    const def = bossDef(b.defId) ?? this.procBosses.get(b.defId);
    if (!def) return;
    const copies = def.modules.find((m) => m.kind === 'splitter')?.amount ?? 2;
    const childHp = Math.max(1, Math.floor(parent.maxHp * 0.4)); // diminishing — finishing beats overkill
    for (let i = 0; i < copies; i++) {
      if (this.enemies.length >= PERF.maxEnemies) break;
      const ang = ((i + 0.5) / copies) * Math.PI * 2;
      this.bossCount++;
      this.enemies.push({
        id: this.nextId++, kind: 'tyrant',
        x: Math.max(12, Math.min(WIDTH - 12, parent.x + Math.cos(ang) * 26)),
        y: Math.max(8, parent.y + 8),
        hp: childHp, maxHp: childHp, baseArmor: def.armor ?? BOSS.baseArmor,
        speed: CHASSIS[def.chassis].speed * 1.08, bounty: Math.round(def.bounty * 0.35),
        damage: Math.max(1, Math.round(def.damage * 0.6)),
        fracture: 0, corrosion: 0, infection: 0, disrupt: 0, mark: 0, resonance: 0, shredFlash: 0, hitFlash: 0, dmgAccum: 0, dmgTimer: 0,
        alive: true, sieging: false, ring: 0, attackCd: 0, windup: -1,
        attackInterval: CHASSIS[def.chassis].attack.interval * 0.8, attackWindup: CHASSIS[def.chassis].attack.windup * 0.8,
        lastHitKind: null, elite: false,
        boss: {
          defId: def.id, name: def.name, phase: 0, phases: def.phases.length,
          moduleCd: def.modules.map((m) => m.cooldown * 0.6), shielded: 0, enrage: 0, channel: 0, charge: 0,
          carapace: 0, carapaceT: 0, grip: 0, burrow: 0, unstop: 0, unstopDR: 0, exposeT: 0, visualTier: 0, splitsLeft: b.splitsLeft - 1, telegraph: null,
        },
      });
    }
    this.floats.push({ x: parent.x, y: parent.y - 20, text: 'SPLIT!', color: def.color, life: 0.9 });
  }

  /** Spawn a normal enemy at a position (boss adds). */
  private spawnNear(kind: EnemyKind, x: number, y: number): void {
    if (this.enemies.length >= PERF.maxEnemies) return;
    const def = ENEMY_DEFS[kind];
    this.enemies.push({
      id: this.nextId++, kind, x: Math.max(12, Math.min(WIDTH - 12, x + (this.rng.next() - 0.5) * 60)), y: y + 12,
      hp: def.hp, maxHp: def.hp, baseArmor: def.armor, speed: def.speed, bounty: def.bounty, damage: def.damage,
      fracture: 0, corrosion: 0, infection: 0, disrupt: 0, mark: 0, resonance: 0, shredFlash: 0, hitFlash: 0, dmgAccum: 0, dmgTimer: 0, alive: true,
      sieging: false, ring: 0, attackCd: 0, windup: -1, attackInterval: def.attack.interval, attackWindup: def.attack.windup,
      lastHitKind: null, boss: null, elite: false,
      shield: def.shieldHp, summonCd: def.summon?.interval, siegeCd: def.siege?.interval,
    });
  }

  // ════════════════════════ MEGA BOSS (docs/MEGA-BOSS.md) ════════════════════════
  // A battlefield-scale RAID organism anchored across the top of the field. It never walks and
  // (almost) never touches the Hive: its ability rotation manipulates everything else, folded into
  // this.megaFx at the sim's chokepoints. The player defeats it through WEAK POINTS — independent
  // objects with their own HP whose destruction always CHANGES the fight. Every method below is
  // reached only while this.mega !== null, so every other run pays nothing.

  /** Anchor a Mega Boss over the battlefield. One at a time — a second call is ignored. */
  spawnMegaBoss(enc: MegaEncounter, encounter: MegaRuntime['encounter']): void {
    if (this.noMega) return; // arena ruleset (docs/ARENA.md): no Mega Boss encounters in PvP
    const def = megaBossDef(enc.defId);
    if (!def || this.mega !== null) return;
    const rt = createMegaRuntime(def, enc, encounter);
    rt.spawnedAt = this.time;
    rt.integrityAtSpawn = this.statIntegrityLost;
    this.mega = rt;
    this.statMegaSeen = true;
    this.openPhaseWeakPoints(def, rt);
    foldMegaFx(def, rt, this.time, this.megaFx);
    // Arrival ceremony: the field shakes, the name lands, the theme stings.
    this.floats.push({ x: WIDTH / 2, y: 250, text: `${def.name} — ${def.title.toUpperCase()}`, color: def.palette.glow, life: 3 });
    this.spawnParticles(WIDTH / 2, MEGA.anchorY + 60, PARTICLE.bossfall, def.palette.glow);
    this.pushSfx('mega');
    this.pushSfx(def.themeCue);
    if (this.events.hasListeners('megaSpawned')) this.events.emit('megaSpawned', { defId: def.id, name: def.name, tier: enc.tier, encounter });
  }

  /** Drive the anchored organism: rotation, weak-point lifecycle, phases, regen, the daily
   *  evolution loop, and the megaFx fold. Called once per tick while a mega is present. */
  private megaBossSystem(dt: number): void {
    const rt = this.mega!;
    const def = megaBossDef(rt.defId);
    if (!def) { this.mega = null; return; }
    // HIVE-GUARDIAN OVERRIDE (docs/MEGA-BOSS.md §targeting): raid duty YIELDS while the Core
    // is in danger — enemies locked onto it, or inside the final-defense zone. Without this,
    // a sparse early board tunnels an open organ (needle/mortar reach organs from anywhere)
    // while wave enemies walk into an undefended Hive (the stage-10 contract-probe wipe).
    this.megaRaidYield = this.hiveAttackers > 0;
    if (!this.megaRaidYield) {
      for (const e of this.enemies) {
        if (e.alive && e.y >= FINAL_DEFENSE_TOP_Y) { this.megaRaidYield = true; break; }
      }
    }
    // Tracer decay (presentation) — runs during the death sequence too.
    for (let i = this.megaShots.length - 1; i >= 0; i--) {
      this.megaShots[i].life -= dt;
      if (this.megaShots[i].life <= 0) { this.megaShots[i] = this.megaShots[this.megaShots.length - 1]; this.megaShots.pop(); }
    }
    // Death sequence: the rotation is over; the renderer plays the collapse, then the body clears.
    if (rt.deathT > 0) {
      rt.deathT -= dt;
      if (rt.deathT <= 0) {
        this.mega = null;
        this.megaShots.length = 0;
        this.megaRaidYield = false;
        if (this.megaDailyEnc !== null) this.phase = 'won'; // the Daily Mega variant ends HERE
      }
      return;
    }
    // §dormancy: combat is live — the organism SURFACES. Presentation only (the rotation
    // below never waits for the pose); the one-shot cue fires on the first emerging tick.
    if (rt.burrow > 0) {
      if (rt.burrow >= 1) {
        this.pushSfx('megaBurrow');
        this.spawnParticles(WIDTH / 2, MEGA.anchorY + 60, PARTICLE.bossfall, def.palette.glow);
      }
      rt.burrow = Math.max(0, rt.burrow - dt / MEGA.burrowOutSec);
    }
    const phase = def.phases[rt.phase];
    rt.stunned = Math.max(0, rt.stunned - dt);
    // Self-regeneration (phase trait + daily evolution stacks; the regen organ cancels it).
    const regen = (phase.regenPerSec ?? 0) * (1 + (rt.tier - 1) * 0.25) + rt.evolveStacks * MEGA.dailyEvolveRegen;
    if (regen > 0 && this.time >= rt.regenOffUntil && rt.hp < rt.maxHp) rt.hp = Math.min(rt.maxHp, rt.hp + regen * dt);
    rt.armor = this.time < rt.armorOffUntil ? 0 : rt.baseArmor;
    // Stagger posture bleeds while it stands — the topple must be earned in one push.
    if (this.time >= rt.staggeredUntil && rt.stagger > 0) rt.stagger = Math.max(0, rt.stagger - MEGA.staggerDecayPerSec * dt);
    // Expired aura effects fall off.
    for (let i = rt.active.length - 1; i >= 0; i--) if (this.time >= rt.active[i].until) rt.active.splice(i, 1);
    // ── Ability rotation: telegraph → cast. A stun (eye interrupt) freezes the whole rotation. ──
    if (rt.stunned <= 0) {
      if (rt.telegraph !== null) {
        rt.telegraph.t -= dt;
        if (rt.telegraph.t <= 0) {
          this.castMegaAbility(def, rt, rt.telegraph.ability);
          rt.telegraph = null;
        }
      } else {
        for (const ai of phase.abilities) {
          rt.abilityCd[ai] -= dt;
          if (rt.abilityCd[ai] <= 0 && rt.telegraph === null) {
            const a = def.abilities[ai];
            rt.telegraph = { ability: ai, t: a.telegraph, total: a.telegraph };
            rt.abilityCd[ai] = a.cooldown; // pay the cooldown at telegraph START (interrupts don't refund)
            this.openTriggeredWeakPoints(def, rt, 'abilityCast', a.kind);
            this.floats.push({ x: WIDTH / 2, y: MEGA.anchorY + 90, text: `${a.kind.toUpperCase()} CHANNELING`, color: def.palette.accent, life: a.telegraph });
            this.pushSfx('megaAbility');
          }
        }
      }
    }
    // ── Weak point lifecycle ──
    for (let i = 0; i < def.weakPoints.length; i++) {
      const spec = def.weakPoints[i];
      if (spec.on === 'hpBelow' && !rt.hpTriggered[i] && rt.hp / rt.maxHp <= (spec.at ?? 0)) {
        rt.hpTriggered[i] = true;
        this.openWeakPoint(def, rt, i);
      } else if (spec.on === 'timer') {
        rt.timerT[i] -= dt;
        if (rt.timerT[i] <= 0) {
          rt.timerT[i] = spec.every ?? 20;
          this.openWeakPoint(def, rt, i);
        }
      }
    }
    for (const wp of rt.weakPoints) {
      if (wp.hitFlash > 0) wp.hitFlash -= dt;
      if (wp.state === 'open') {
        if (wp.emergeT < 1) wp.emergeT = Math.min(1, wp.emergeT + dt * 2); // the organ descends (0.5s)
        if (wp.window > 0 && this.time >= rt.staggeredUntil) { // toppled ⇒ windows FREEZE (burst at leisure)
          wp.window -= dt;
          if (wp.window <= 0) { // sealed itself — regen kinds regrow, one-shot kinds stay gone
            wp.state = 'closed';
            wp.regrow = WEAK_POINT_DEFS[wp.kind].regen ? MEGA.weakPointRegrowSec : Infinity;
          }
        }
      } else if (wp.state === 'closed' && wp.regrow !== Infinity) {
        wp.regrow -= dt;
        if (wp.regrow <= 0) {
          wp.state = 'open';
          wp.hp = wp.maxHp;
          wp.window = WEAK_POINT_DEFS[wp.kind].window;
          wp.emergeT = 0;
          rt.lastOrganOpenAt = this.time;
          this.pushSfx('wpOpen');
        }
      }
    }
    this.megaOrganDrought(def, rt);
    // ── LONE SIEGE (docs/MEGA-BOSS.md §lone siege): the organism never lets the fight stall.
    //    Once the wave plan is spent and the field has gone bare, it TURNS ON THE HIVE — direct,
    //    telegraphed HIVE LASHES on a cadence that tightens with every landed blow. Its own
    //    reinforcements never break the siege; only a resumed wave plan (next wave) does. The
    //    windup shares the rotation's counterplay: an eye interrupt or a stagger drops it. ──
    const planActive = !this.spawnedAll || this.spawnQueue.length > 0 || this.rushPending.length > 0;
    const quiet = !planActive && this.enemies.length === 0;
    if (planActive) {
      rt.siegeT = 0;
      rt.lashWindup = 0;
    } else if (quiet || rt.siegeT > 0) {
      const wasSieging = rt.siegeT >= MEGA.siegeGraceSec;
      rt.siegeT += dt;
      if (!wasSieging && rt.siegeT >= MEGA.siegeGraceSec) { // the turn: it notices the Hive
        rt.lashT = MEGA.siegeLashEvery * 0.5; // first lash on the half-beat (the opening convention)
        this.floats.push({ x: WIDTH / 2, y: MEGA.anchorY + 84, text: MEGA.siegeFloatText, color: '#ff5d73', life: 2.4 });
        this.pushSfx('megaPhase');
      }
      if (rt.siegeT >= MEGA.siegeGraceSec && rt.stunned <= 0 && this.time >= rt.staggeredUntil) {
        if (rt.lashWindup > 0) { // a committed windup resolves regardless of stragglers…
          rt.lashWindup -= dt;
          if (rt.lashWindup <= 0) this.landSiegeLash(def, rt);
        } else if (this.enemies.length === 0) { // …but a NEW one only begins over a bare field
          rt.lashT -= dt;
          if (rt.lashT <= 0) {
            rt.lashWindup = MEGA.siegeLashTelegraph;
            this.floats.push({ x: nucleusPoint.x, y: nucleusPoint.y - 40, text: 'HIVE LASH INCOMING', color: '#ffd24d', life: MEGA.siegeLashTelegraph });
            this.pushSfx('megaAbility');
          }
        }
      }
    }
    // ── Reinforcement loop: the Daily variant ALWAYS pulses; every other encounter pulses only
    //    while quiet (overtime). A long siege SURGES the pulse — bigger, meaner mixes — but the
    //    surge is capped: the siege pressures through the lash, not a corpse flood. `surge` takes
    //    the max of the daily evolution ladder and the siege ladder so the Daily's own escalation
    //    is unchanged and every other encounter climbs the same steps while the siege holds. ──
    if (rt.encounter === 'daily' || quiet) {
      rt.reinforceT += dt;
      if (rt.reinforceT >= MEGA.dailyReinforceSec) {
        rt.reinforceT = 0;
        const surge = Math.max(rt.evolveStacks, Math.min(MEGA.siegeReinforceCap, Math.floor(rt.siegeT / MEGA.siegeReinforceEvery)));
        const n = MEGA.dailyReinforceBase + surge;
        const pool: EnemyKind[] = surge >= 4 ? ['rusher', 'lasher', 'warden'] : surge >= 2 ? ['runner', 'rusher', 'lasher'] : ['runner', 'rusher'];
        for (let i = 0; i < n; i++) this.spawnNear(this.megaRng.pick(pool), 60 + this.megaRng.next() * (WIDTH - 120), 28);
      }
    }
    // Daily evolution: the encounter gets harder the longer it lasts (haste + regen stacks).
    if (rt.encounter === 'daily') {
      rt.evolveT += dt;
      if (rt.evolveT >= MEGA.dailyEvolveSec) {
        rt.evolveT = 0;
        rt.evolveStacks++;
        this.floats.push({ x: WIDTH / 2, y: MEGA.anchorY + 70, text: 'IT EVOLVES', color: def.palette.glow, life: 1.6 });
        this.pushSfx('megaPhase');
      }
    }
    // ── Phase transitions (HP-gated; mutation_node suppresses the entry surge once). ──
    while (rt.phase + 1 < def.phases.length && rt.hp / rt.maxHp <= def.phases[rt.phase + 1].threshold) {
      rt.phase++;
      const p = def.phases[rt.phase];
      if (p.entrySurge && !rt.weakenNextPhase && this.time >= rt.summonsOffUntil) {
        for (let i = 0; i < p.entrySurge.count; i++) this.spawnNear(p.entrySurge.addKind, 80 + this.megaRng.next() * (WIDTH - 160), 30);
      }
      rt.weakenNextPhase = false; // consumed (or unused) either way — one node suppresses ONE shift
      this.openPhaseWeakPoints(def, rt);
      this.floats.push({ x: WIDTH / 2, y: MEGA.anchorY + 80, text: 'IT MUTATES', color: def.palette.glow, life: 2 });
      this.spawnParticles(WIDTH / 2, MEGA.anchorY + 50, PARTICLE.bossfall, def.palette.body);
      this.pushSfx('megaPhase');
      if (this.events.hasListeners('megaPhase')) this.events.emit('megaPhase', { defId: def.id, phase: rt.phase });
    }
    foldMegaFx(def, rt, this.time, this.megaFx);
    if (rt.hp <= 0) this.beginMegaDeath(def, rt);
  }

  /** Resolve a completed telegraph into its battlefield effect. */
  private castMegaAbility(def: MegaBossDef, rt: MegaRuntime, ai: number): void {
    const a: MegaAbility = def.abilities[ai];
    rt.abilitiesCast++;
    this.statMegaSurvived++;
    switch (a.kind) {
      case 'brood':
      case 'menders':
      case 'eliteSurge': {
        if (this.time < rt.summonsOffUntil) {
          this.floats.push({ x: WIDTH / 2, y: MEGA.anchorY + 90, text: 'SUMMONS HALTED', color: '#6effa8', life: 1.2 });
          return;
        }
        const n = a.count ?? 1;
        for (let i = 0; i < n; i++) {
          this.spawnNear(a.addKind ?? 'runner', 70 + this.megaRng.next() * (WIDTH - 140), 26);
          if (a.kind === 'eliteSurge') {
            const e = this.enemies[this.enemies.length - 1];
            if (e) { e.elite = true; e.hp *= 2.2; e.maxHp *= 2.2; e.bounty = Math.round(e.bounty * 2); }
          }
        }
        break;
      }
      case 'shieldWeave': {
        if (this.time < rt.weaveOffUntil) return; // generator destroyed — the weave fizzles
        for (const e of this.enemies) if (e.alive && e.boss === null) e.shield = (e.shield ?? 0) + (a.magnitude ?? 40);
        break;
      }
      case 'corrupt': {
        // Corrupt occupied emplacements: those towers go dark for the window (existing seam).
        const candidates = this.towers.filter((t) => this.time >= t.disabledUntil);
        for (let i = 0; i < (a.count ?? 1) && candidates.length > 0; i++) {
          const idx = this.megaRng.int(candidates.length);
          const t = candidates.splice(idx, 1)[0];
          t.disabledUntil = this.time + (a.duration || 6);
          this.floats.push({ x: t.x, y: t.y - 16, text: 'CORRUPTED', color: def.palette.accent, life: 1.4 });
        }
        break;
      }
      case 'gorge': {
        // The boss DEVOURS its own field — up to `count` living non-boss enemies nearest the
        // maw (smallest y; id-tiebreak keeps it deterministic), each healing tier-scaled HP.
        // No bounty, no kill credit: the player's counterplay is DENIAL, not harvesting.
        const food = this.enemies
          .filter((e) => e.alive && e.boss === null)
          .sort((p, q) => p.y - q.y || p.id - q.id)
          .slice(0, a.count ?? 1);
        if (food.length === 0) {
          this.floats.push({ x: WIDTH / 2, y: MEGA.anchorY + 90, text: 'STARVED — NOTHING TO GORGE', color: '#6effa8', life: 1.6 });
          break;
        }
        const healEach = (a.magnitude ?? 100) * (0.7 + 0.3 * rt.tier);
        for (const e of food) {
          e.alive = false; // devoured — mirrors detonate()'s manual removal bookkeeping
          e.sieging = false;
          this.armorBreakUntil.delete(e.id);
          this.floats.push({ x: e.x, y: e.y - 12, text: 'DEVOURED', color: def.palette.glow, life: 1.1 });
          this.spawnParticles(e.x, e.y, PARTICLE.spore, def.palette.body);
        }
        const healed = Math.min(rt.maxHp - rt.hp, healEach * food.length);
        rt.hp += healed;
        this.floats.push({ x: WIDTH / 2, y: MEGA.anchorY + 74, text: `GORGED ×${food.length} — +${Math.round(healed)}`, color: def.palette.glow, life: 1.8 });
        this.pushSfx('megaGorge');
        break;
      }
      case 'adapt': {
        // It studies the tower kind that has hurt it MOST this encounter and answers it: that
        // kind deals ×magnitude to the boss while the window holds. Deterministic argmax over
        // the canonical TOWER_DEFS key order; with no damage on the ledger the lesson fizzles.
        let top: string | null = null;
        let best = 0;
        for (const k of Object.keys(TOWER_DEFS)) {
          const d = rt.dmgByKind[k] ?? 0;
          if (d > best) { best = d; top = k; }
        }
        if (top === null) {
          this.floats.push({ x: WIDTH / 2, y: MEGA.anchorY + 90, text: 'NOTHING LEARNED', color: '#6effa8', life: 1.4 });
          break;
        }
        rt.adaptKind = top;
        rt.adaptUntil = this.time + a.duration;
        rt.adaptMult = a.magnitude ?? 0.5;
        this.floats.push({ x: WIDTH / 2, y: MEGA.anchorY + 74, text: `IT LEARNS YOUR ${TOWER_DEFS[top as TowerKind].name.toUpperCase()}`, color: def.palette.accent, life: 2 });
        break;
      }
      case 'cataclysm': {
        // The FINALE lands: a direct strike into the Hive. The long telegraph was the whole
        // counterplay — an eye interrupt or a stagger during the windup prevents this entirely.
        const dmg = Math.round(a.magnitude ?? 15);
        if (!this.god) {
          this.integrity -= dmg;
          this.statIntegrityLost += dmg; // flawless-run tracking, same ledger as siege shells
          this.noteHiveDamage(`mega:${def.name}`, dmg);
          this.hiveRecentDamage += dmg;
          this.hiveHitPulse = Math.min(1, this.hiveHitPulse + 0.5 + dmg * 0.012);
        }
        this.floats.push({ x: nucleusPoint.x, y: nucleusPoint.y - 22, text: `CATACLYSM −${dmg}`, color: '#ff5d73', life: 2.2 });
        this.spawnParticles(nucleusPoint.x, nucleusPoint.y, PARTICLE.bossfall, def.palette.glow);
        this.spawnParticles(WIDTH / 2, MEGA.anchorY + 80, PARTICLE.breach, def.palette.accent);
        this.pushSfx('megaCataclysm');
        break;
      }
      default:
        // Aura verbs fold through megaFx while active.
        rt.active.push({ kind: a.kind, until: this.time + a.duration, magnitude: a.magnitude ?? 1 });
        break;
    }
  }

  /** A HIVE LASH lands (docs/MEGA-BOSS.md §lone siege): the sieging organism strikes the Core
   *  directly. The windup was the whole counterplay — an eye interrupt or a stagger drops it —
   *  and every landed blow TIGHTENS the cadence, so stalling the raid is a losing race. */
  private landSiegeLash(def: MegaBossDef, rt: MegaRuntime): void {
    rt.lashes++;
    rt.lashT = Math.max(MEGA.siegeLashEveryMin, MEGA.siegeLashEvery * Math.pow(MEGA.siegeLashRamp, rt.lashes));
    const dmg = Math.round(MEGA.siegeLashDamage + MEGA.siegeLashPerTier * Math.max(0, rt.tier - 1));
    if (!this.god) {
      this.integrity -= dmg;
      this.statIntegrityLost += dmg; // same ledger as siege shells + the cataclysm
      this.noteHiveDamage(`mega:${def.name}`, dmg);
      this.hiveRecentDamage += dmg;
      this.hiveHitPulse = Math.min(1, this.hiveHitPulse + 0.5 + dmg * 0.012);
    }
    this.floats.push({ x: nucleusPoint.x, y: nucleusPoint.y - 22, text: `HIVE LASH −${dmg}`, color: '#ff5d73', life: 1.8 });
    this.spawnParticles(nucleusPoint.x, nucleusPoint.y, PARTICLE.breach, def.palette.glow);
    this.megaShots.push({ x0: WIDTH / 2, y0: MEGA.anchorY + 70, x1: nucleusPoint.x, y1: nucleusPoint.y, life: 0.3, color: def.palette.glow });
    this.pushSfx('megaCataclysm');
  }

  /** Open every phaseEntry weak point of the CURRENT phase (spawn + phase shifts). */
  private openPhaseWeakPoints(def: MegaBossDef, rt: MegaRuntime): void {
    for (let i = 0; i < def.weakPoints.length; i++) {
      if (def.weakPoints[i].on === 'phaseEntry') this.openWeakPoint(def, rt, i);
    }
  }

  private openTriggeredWeakPoints(def: MegaBossDef, rt: MegaRuntime, on: 'abilityCast', ability: string): void {
    for (let i = 0; i < def.weakPoints.length; i++) {
      const w = def.weakPoints[i];
      if (w.on === on && w.ability === ability) this.openWeakPoint(def, rt, i);
    }
  }

  /** Materialize spec `i` as a live organ (one instance per spec; destroyed specs never return). */
  private openWeakPoint(def: MegaBossDef, rt: MegaRuntime, i: number): void {
    const existing = rt.weakPoints.find((w) => w.spec === i);
    if (existing) {
      if (existing.state === 'closed' && WEAK_POINT_DEFS[existing.kind].regen) {
        existing.state = 'open';
        existing.hp = existing.maxHp;
        existing.window = WEAK_POINT_DEFS[existing.kind].window;
        existing.emergeT = 0;
        this.pushSfx('wpOpen');
      }
      return; // open already, or destroyed forever
    }
    const spec = def.weakPoints[i];
    const wd = WEAK_POINT_DEFS[spec.kind];
    const hp = Math.max(30, Math.round(rt.maxHp * wd.hpFrac));
    rt.weakPoints.push({
      spec: i, kind: spec.kind, x: spec.x * WIDTH, y: spec.y,
      hp, maxHp: hp, armor: wd.armor, state: 'open', window: wd.window,
      regrow: 0, emergeT: 0, hitFlash: 0,
    });
    rt.lastOrganOpenAt = this.time; // every opening resets the drought clock
    this.floats.push({ x: spec.x * WIDTH, y: spec.y - 26, text: `WEAK POINT — ${wd.name.toUpperCase()}`, color: def.palette.glow, life: 1.8 });
    this.pushSfx('wpOpen');
  }

  /** ORGAN DROUGHT VALVE (docs/MEGA-BOSS.md §feel): a persisting organism must never run out
   *  of counterplay. Destroyed organs never return, so cast/timer triggers no-op on their
   *  scars — a long campaign fight that spends every destructible while hp still sits above
   *  the next hpBelow trigger would have ZERO windows left, only armored body chip vs regen.
   *  When NOTHING has been open for organDroughtSec, the organism REGROWS one spent organ
   *  (fresh hp, fresh window, same authored spec — cycled round-robin so long fights rotate
   *  the whole kit). Healthy fights never reach the valve (probe-measured mean organ gap is
   *  4–10s); the scar ledger (wpDestroyed/wpKinds) keeps counting every rupture. */
  private megaOrganDrought(def: MegaBossDef, rt: MegaRuntime): void {
    if (rt.weakPoints.some((w) => w.state === 'open')) return;
    if (this.time - rt.lastOrganOpenAt < MEGA.organDroughtSec) return;
    for (let n = 0; n < def.weakPoints.length; n++) {
      const i = (rt.droughtRotor + n) % def.weakPoints.length;
      const existing = rt.weakPoints.find((w) => w.spec === i);
      if (existing) {
        existing.state = 'open';
        existing.hp = existing.maxHp;
        existing.window = WEAK_POINT_DEFS[existing.kind].window;
        existing.emergeT = 0;
        existing.regrow = 0;
        rt.lastOrganOpenAt = this.time;
        rt.droughtRotor = i + 1;
        this.floats.push({ x: existing.x, y: existing.y - 26, text: `IT REGROWS — ${WEAK_POINT_DEFS[existing.kind].name.toUpperCase()}`, color: megaBossDef(rt.defId)?.palette.glow ?? '#fff', life: 1.8 });
        this.pushSfx('wpOpen');
        return;
      }
      this.openWeakPoint(def, rt, i); // spec never seen this fight — a plain first opening
      rt.droughtRotor = i + 1;
      return;
    }
  }

  /** §dormancy (docs/MEGA-BOSS.md): outside combat megaBossSystem/towerSystem never run, so a
   *  persisting mega is frozen by DESIGN — this pose makes that read as intentional instead of
   *  "invincibility". The organism BURROWS into the ridge (renderer sinks the mass, the raid
   *  bar greys out); the next wave's first ticks surface it again. Presentation only — no
   *  combat number moves with `burrow`. Ticked from step's settle + prep/draft branches. */
  private megaDormancySystem(dt: number): void {
    const rt = this.mega;
    if (rt === null || rt.deathT > 0 || rt.burrow >= 1) return;
    if (rt.burrow <= 0) { // the one-shot descent cue — soil folds over the mass
      this.pushSfx('megaBurrow');
      this.spawnParticles(WIDTH / 2, MEGA.anchorY + 60, PARTICLE.bossfall, megaBossDef(rt.defId)?.palette.glow ?? '#fff');
    }
    rt.burrow = Math.min(1, rt.burrow + dt / MEGA.burrowInSec);
  }

  /** Nearest OPEN weak point within `range` of (x,y), or null. */
  private megaWeakPointInRange(x: number, y: number, range: number): MegaWeakPoint | null {
    const rt = this.mega;
    if (rt === null || rt.deathT > 0) return null;
    const r2 = range * range;
    let best: MegaWeakPoint | null = null;
    let bd = Infinity;
    for (const wp of rt.weakPoints) {
      if (wp.state !== 'open' || wp.emergeT < 1) continue; // still descending — untargetable
      const d = dist2(x, y, wp.x, wp.y);
      if (d <= r2 && d < bd) { bd = d; best = wp; }
    }
    return best;
  }

  /** Between-window body-chip aim point for a tower at height `ty` with `range` reach. The
   *  organism is a WALL: each tower strikes the HIGHEST point of its mass it can reach, so a
   *  long gun's tracer crosses the field instead of stubbing out at its own muzzle. While it
   *  SIEGES (docs/MEGA-BOSS.md §lone siege) the mass hangs to the front build row, so even the
   *  shortest reach connects; while shepherding only the high band exists (front-row reach —
   *  unchanged). The 40px slack absorbs the horizontal clamp drift, so the caller's distance
   *  check always passes at the returned height. */
  private megaBodyY(ty: number, range: number): number {
    const rt = this.mega!;
    const low = rt.siegeT >= MEGA.siegeGraceSec ? Math.max(MEGA.bodyBandY, Math.min(MEGA.siegeBodyY, ty - MEGA.siegeBodyGap)) : MEGA.bodyBandY;
    return Math.max(MEGA.bodyBandY, Math.min(low, ty - (range - 40)));
  }

  /** Body-chip severity: reaching for the Hive EXPOSES the organism (§lone siege), so a sieging
   *  body takes the deeper siege chip — the risk half of the trade its lash pressure opens. */
  private megaChipMult(): number {
    return this.mega!.siegeT >= MEGA.siegeGraceSec ? MEGA.siegeChipMult : MEGA.bodyChipMult;
  }

  /** Tower raid-fire: burst an open weak point (priority) or chip the anchored body when the field
   *  is empty. Returns true when the shot was consumed (the caller skips its normal cast). */
  private towerMegaFire(t: Tower, def: TowerDef, prog: TowerMods, bk: ResolvedBranchKit | null, dmgMult: number, rateMult: number): boolean {
    // The Hive outranks the raid: while the Core is threatened, every tower falls back to
    // normal enemy targeting (megaRaidYield — derived once per tick in megaBossSystem).
    if (this.megaRaidYield) return false;
    // Pure-tempo organs (the Effigy's dread field) carry no damage — nothing to throw at a
    // mountain. They keep their own kit instead of burning casts on zero-damage tracers.
    if (def.damage <= 0) return false;
    const rt = this.mega!;
    // ADAPT (§functional overhaul): the boss's learned resistance answers ONE tower kind.
    // The per-kind ledger below is what the verb studies — heroes bypass both.
    const adaptMul = this.time < rt.adaptUntil && t.kind === rt.adaptKind ? rt.adaptMult : 1;
    const range = def.range * (prog.rangeMult ?? 1) * (bk?.rangeMult ?? 1) * this.megaFx.towerRange;
    const wp = this.megaWeakPointInRange(t.x, t.y, range);
    if (wp !== null) {
      const raw = def.damage * dmgMult * adaptMul;
      this.megaHitWeakPoint(wp, raw, t.x, t.y, TOWER_DEFS[t.kind].color);
      rt.dmgByKind[t.kind] = (rt.dmgByKind[t.kind] ?? 0) + raw;
      this.masteryAccrual[t.kind].damage += def.damage * dmgMult; // raid damage still earns mastery
      t.cooldown = def.fireInterval / rateMult;
      return true;
    }
    // Body chip: the between-window sustain. A tower with NO prey in ITS OWN reach was going
    // to do nothing at all — it turns its guns on the mountain instead (mirrors the hero
    // rule; the old BARE-FIELD gate let one add anywhere freeze every out-of-reach tower,
    // the reported "boss just stops" stall). Towers with live prey in range still fight the
    // wave first (fall through), and megaRaidYield above parks the raid while the Hive is
    // threatened.
    if (!this.towerHasTarget(t.x, t.y, range, def.minRange ?? 0)) {
      const bx = Math.max(WIDTH * 0.2, Math.min(WIDTH * 0.8, t.x));
      const by = this.megaBodyY(t.y, range);
      if (dist2(t.x, t.y, bx, by) <= range * range) {
        const raw = def.damage * dmgMult * this.megaChipMult() * adaptMul;
        this.megaHitBody(raw, t.x, t.y, bx, by, TOWER_DEFS[t.kind].color);
        rt.dmgByKind[t.kind] = (rt.dmgByKind[t.kind] ?? 0) + raw;
        t.cooldown = def.fireInterval / rateMult;
        return true;
      }
    }
    return false;
  }

  /** Raid strikes were SILENT (user report) — the raid path bypasses projectiles, so the normal
   *  impact cue never fired. One throttled 'hit' across the whole raid: per-frame beam ticks
   *  and a full volley alike read as steady combat, never a machine-gun of cues. */
  private megaHitSfx(): void {
    if (this.time - this.megaHitSfxT < 0.15) return;
    this.megaHitSfxT = this.time;
    this.pushSfx('hit');
  }

  /** Apply a hit to a weak point (its own armor; no boss armor). Destruction fires the consequence. */
  private megaHitWeakPoint(wp: MegaWeakPoint, raw: number, sx: number, sy: number, color: string): void {
    const applied = damageAfter(raw, 1, wp.armor);
    wp.hp -= applied;
    wp.hitFlash = 0.15;
    this.statDamageDealt += applied;
    this.megaShots.push({ x0: sx, y0: sy, x1: wp.x, y1: wp.y, life: 0.14, color });
    this.megaHitSfx();
    if (wp.hp <= 0 && wp.state === 'open') this.destroyWeakPoint(wp);
  }

  /** Apply a hit to the anchored body: boss armor (unless broken), heart-exposure vulnerability,
   *  and the stagger window's bonus (a toppled organism cannot hold its guard). */
  private megaHitBody(raw: number, sx: number, sy: number, tx: number, ty: number, color: string): void {
    const rt = this.mega!;
    let vuln = this.time < rt.exposedUntil ? 1 + rt.exposedFrac : 1;
    if (this.time < rt.staggeredUntil) vuln *= 1 + MEGA.staggerDamageAmp;
    const applied = damageAfter(raw, vuln, rt.armor);
    rt.hp -= applied;
    this.statDamageDealt += applied;
    this.megaShots.push({ x0: sx, y0: sy, x1: tx, y1: ty, life: 0.14, color });
    this.megaHitSfx();
  }

  /** A weak point falls: a chunk of boss HP + its mapped consequence + the full ceremony. */
  private destroyWeakPoint(wp: MegaWeakPoint): void {
    const rt = this.mega!;
    const def = megaBossDef(rt.defId)!;
    const wd = WEAK_POINT_DEFS[wp.kind];
    wp.state = 'destroyed';
    rt.wpDestroyed++;
    this.statWpDestroyed++;
    this.statWpKinds.add(wp.kind);
    if (!rt.wpKinds.includes(wp.kind)) rt.wpKinds.push(wp.kind);
    rt.hp -= wp.maxHp * 1.5; // the rupture tears INTO the organism — destruction always hurts it
    const c = wd.consequence;
    let interrupted = false;
    switch (c.effect) {
      case 'interrupt':
        if (rt.telegraph !== null) { rt.telegraph = null; rt.interrupts++; this.statMegaInterrupts++; interrupted = true; }
        if (rt.lashWindup > 0) { // the reaching arm recoils — a wound-up HIVE LASH is defused too
          rt.lashWindup = 0;
          rt.lashT = Math.max(rt.lashT, 4); // …and must re-approach, not instantly re-wind
          if (!interrupted) { rt.interrupts++; this.statMegaInterrupts++; interrupted = true; }
        }
        rt.stunned = Math.max(rt.stunned, c.seconds ?? 4);
        break;
      case 'expose':
        rt.exposedUntil = this.time + (c.seconds ?? 8);
        rt.exposedFrac = c.frac ?? MEGA.exposeFallback;
        break;
      case 'haltSummons':
        rt.summonsOffUntil = this.time + (c.seconds ?? 10);
        for (const e of this.enemies) if (e.alive && e.boss === null) e.hp -= e.hp * (c.frac ?? 0.3);
        break;
      case 'armorBreak':
        rt.armorOffUntil = this.time + (c.seconds ?? 10);
        break;
      case 'purgeShields':
        for (const e of this.enemies) if ((e.shield ?? 0) > 0) { e.shield = 0; e.shieldFlash = 0.3; }
        rt.weaveOffUntil = this.time + (c.seconds ?? 12);
        break;
      case 'disablePassive':
        rt.passiveOffUntil = this.time + (c.seconds ?? 10);
        break;
      case 'stopRegen':
        rt.regenOffUntil = this.time + (c.seconds ?? 12);
        break;
      case 'biomassBurst': {
        const amt = Math.round((c.amount ?? 100) * (0.7 + 0.3 * rt.tier));
        this.biomass += amt;
        this.statBiomassEarned += amt;
        rt.leechOffUntil = this.time + (c.seconds ?? 10);
        this.floats.push({ x: wp.x, y: wp.y - 12, text: `+${amt}`, color: '#b6e84a', life: 1.2 });
        break;
      }
      case 'towerBuff':
        rt.towerBuffUntil = this.time + (c.seconds ?? 8);
        rt.towerBuffFrac = c.frac ?? 0.25;
        break;
      case 'weakenPhase':
        rt.weakenNextPhase = true;
        break;
    }
    // STAGGER posture (§functional overhaul): every rupture rocks the organism; enough of them
    // in one push TOPPLE it — rotation stunned, telegraph dropped (a cataclysm defused this way
    // is the raid's clutch play), organ windows frozen, body wide open to bonus damage.
    if (this.time >= rt.staggeredUntil) {
      rt.stagger = Math.min(1, rt.stagger + MEGA.staggerPerWp);
      if (rt.stagger >= 1) {
        rt.stagger = 0;
        rt.staggers++;
        rt.staggeredUntil = this.time + MEGA.staggerDurSec;
        rt.stunned = Math.max(rt.stunned, MEGA.staggerDurSec);
        rt.telegraph = null; // whatever it was winding up dies with its footing
        if (rt.lashWindup > 0) { rt.lashWindup = 0; rt.lashT = Math.max(rt.lashT, 4); } // …including a reaching HIVE LASH (§lone siege)
        this.floats.push({ x: WIDTH / 2, y: MEGA.anchorY + 96, text: MEGA.staggerFloatText, color: '#ffd24d', life: 2.4 });
        this.pushSfx('megaStagger');
      }
    }
    // The payoff ceremony: rupture burst, roar, and the "what changed" callout (HUD reads the event).
    this.spawnParticles(wp.x, wp.y, PARTICLE.bossfall, megaBossDef(rt.defId)!.palette.glow);
    this.floats.push({ x: wp.x, y: wp.y - 28, text: `${wd.name.toUpperCase()} DESTROYED`, color: '#ffd24d', life: 2 });
    this.floats.push({ x: wp.x, y: wp.y - 10, text: wd.hudNote, color: '#6effa8', life: 2.2 });
    this.pushSfx('wpBreak');
    if (this.events.hasListeners('megaWeakPointDown')) {
      this.events.emit('megaWeakPointDown', { defId: def.id, kind: wp.kind, note: wd.hudNote, interrupted });
    }
  }

  /** The organism falls: record the kill (rewards ride RunStats → meta), start the collapse. */
  private beginMegaDeath(def: MegaBossDef, rt: MegaRuntime): void {
    rt.hp = 0;
    rt.deathT = 3.5; // the renderer's multi-stage collapse window
    rt.telegraph = null;
    rt.lashWindup = 0; // a reaching lash dies with it
    rt.active.length = 0;
    this.megaFx = { ...NEUTRAL_MEGA_FX }; // its grip on the battlefield releases IMMEDIATELY
    const killSec = this.time - rt.spawnedAt;
    const perfect = this.statIntegrityLost === rt.integrityAtSpawn;
    this.runMegaKills.push({
      defId: rt.defId, tier: rt.tier, encounter: rt.encounter,
      killSec, perfect, weakPoints: rt.wpDestroyed, interrupts: rt.interrupts,
    });
    this.runBossKills++; // a mega counts toward boss-kill ledgers (Boss Rush bands included)
    this.noteLastOut(WIDTH / 2, MEGA.anchorY + 40, 3); // the last-kill beat's raid case (presentation)
    // The fall is ANNOUNCED by the view's centre-stage card (megaKilled event). Its voice dies with
    // it: channeling callouts (centre floats) and organ labels fade within a beat instead of
    // lingering under the card. Presentation-only (floats never feed the sim).
    for (const f of this.floats) {
      if (f.x === WIDTH / 2 || def.weakPoints.some((wp) => Math.abs(f.x - wp.x * WIDTH) < 0.5)) f.life = Math.min(f.life, 0.3);
    }
    this.spawnParticles(WIDTH / 2, MEGA.anchorY + 40, PARTICLE.bossfall, def.palette.glow);
    this.spawnParticles(WIDTH * 0.3, MEGA.anchorY + 70, PARTICLE.bossfall, def.palette.body);
    this.spawnParticles(WIDTH * 0.7, MEGA.anchorY + 70, PARTICLE.bossfall, def.palette.accent);
    this.pushSfx('megaDeath');
    if (this.events.hasListeners('megaKilled')) {
      this.events.emit('megaKilled', {
        defId: rt.defId, tier: rt.tier, encounter: rt.encounter,
        killSec, perfect, weakPoints: rt.wpDestroyed, interrupts: rt.interrupts,
      });
    }
  }

  /** Hero RAID DUTY (docs/MEGA-BOSS.md §targeting): with the line CLEAR, a fighting hero
   *  MARCHES on the organism — the nearest open organ first, else the anchored body — and
   *  strikes on its own attack cadence (heroes hold the line first; adds returning hands the
   *  tick back to the behavior loop). Supports without a real attack keep their loops (they
   *  return false here). Owns the hero's movement for the tick when it returns true. */
  private heroMegaRaid(h: Hero, def: HeroDef, dt: number): boolean {
    const rt = this.mega;
    if (rt === null || rt.deathT > 0 || this.enemies.length !== 0) return false;
    if (def.attackRange <= 0 || def.attackDamage <= 0) return false;
    const reach = Math.max(def.attackRange, 140);
    // Nearest open, emerged organ ANYWHERE (mobility is the heroes' edge over towers).
    let wp: MegaWeakPoint | null = null;
    let bd = Infinity;
    for (const w of rt.weakPoints) {
      if (w.state !== 'open' || w.emergeT < 1) continue;
      const d = dist2(h.x, h.y, w.x, w.y);
      if (d < bd) { bd = d; wp = w; }
    }
    // Approach point: the organ, or a stand-off just under the body band (the jaw's shadow).
    const bx = Math.max(WIDTH * 0.2, Math.min(WIDTH * 0.8, h.x));
    const ax = wp ? wp.x : bx;
    const ay = wp ? wp.y : MEGA.bodyBandY + 46;
    const np = moveToward(h.x, h.y, ax, ay, this.heroSpeed(h) * dt);
    h.x = Math.max(0, Math.min(WIDTH, np.x));
    h.y = Math.max(0, Math.min(HEIGHT, np.y));
    h.targetId = -1;
    h.moveState = dist(h.x, h.y, ax, ay) <= reach ? 'attacking' : 'moving';
    if (h.attackCd <= 0) {
      if (wp !== null && dist2(h.x, h.y, wp.x, wp.y) <= reach * reach) {
        const dmg = def.attackDamage * this.heroDamageMult(h);
        this.megaHitWeakPoint(wp, dmg, h.x, h.y, HERO_DEFS[h.kind].color);
        this.heroMasteryAccrual[h.kind].damage += dmg;
        h.attackCd = def.attackInterval / this.heroHaste(h);
      } else if (wp === null && dist2(h.x, h.y, bx, MEGA.bodyBandY) <= reach * reach) {
        const dmg = def.attackDamage * this.heroDamageMult(h) * this.megaChipMult();
        this.megaHitBody(dmg, h.x, h.y, bx, MEGA.bodyBandY, HERO_DEFS[h.kind].color);
        this.heroMasteryAccrual[h.kind].damage += dmg;
        h.attackCd = def.attackInterval / this.heroHaste(h);
      }
    }
    return true;
  }

  /** Unit RAID DUTY (docs/MEGA-BOSS.md §targeting): a friendly unit with no enemy in its own
   *  reach joins the raid — it moves on the nearest open organ ANYWHERE (the leash yields to
   *  the carcass when its territory is bare) and strikes on its own cadence; with every window
   *  spent and the field EMPTY it bites the anchored body instead (chip-scaled, deeper while
   *  the organism SIEGES). The Hive still outranks the raid (megaRaidYield). `credit` feeds
   *  mastery + the ADAPT ledger for tower-born units (the roost's drakes); hero summons pass
   *  null, exactly like their normal combat crediting. Returns true when raid duty owned the
   *  unit's tick. */
  private unitMegaRaid(m: Minion, dt: number, credit: TowerKind | null): boolean {
    const rt = this.mega;
    if (rt === null || rt.deathT > 0 || this.megaRaidYield) return false;
    let wp: MegaWeakPoint | null = null;
    let bd = Infinity;
    for (const w of rt.weakPoints) {
      if (w.state !== 'open' || w.emergeT < 1) continue;
      const d = dist2(m.x, m.y, w.x, w.y);
      if (d < bd) { bd = d; wp = w; }
    }
    if (wp !== null) {
      const reach = m.radius + MEGA.weakPointRadius;
      if (dist(m.x, m.y, wp.x, wp.y) > reach) {
        const np = moveToward(m.x, m.y, wp.x, wp.y, m.speed * dt);
        m.x = np.x;
        m.y = np.y;
      } else if (m.attackCd <= 0) {
        this.megaHitWeakPoint(wp, m.damage, m.x, m.y, m.color);
        if (credit !== null) {
          rt.dmgByKind[credit] = (rt.dmgByKind[credit] ?? 0) + m.damage;
          this.masteryAccrual[credit].damage += m.damage;
        }
        m.attackCd = m.attackInterval;
      }
      return true;
    }
    if (this.enemies.length === 0) {
      const bx = Math.max(WIDTH * 0.2, Math.min(WIDTH * 0.8, m.x));
      const by = this.megaBodyY(m.y, 60); // it climbs to the lowest hanging mass it can bite
      if (dist(m.x, m.y, bx, by) > m.radius + 12) {
        const np = moveToward(m.x, m.y, bx, by, m.speed * dt);
        m.x = np.x;
        m.y = np.y;
      } else if (m.attackCd <= 0) {
        const dmg = m.damage * this.megaChipMult();
        this.megaHitBody(dmg, m.x, m.y, bx, by, m.color);
        if (credit !== null) {
          rt.dmgByKind[credit] = (rt.dmgByKind[credit] ?? 0) + dmg;
          this.masteryAccrual[credit].damage += dmg;
        }
        m.attackCd = m.attackInterval;
      }
      return true;
    }
    return false;
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
      gain *= this.megaFx.biomass; // mega leech drinks reactor output too (×1 without one)
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
          // Birth burst — the womb's release reads on the battlefield (render-only particles).
          this.spawnParticles(e.x, e.y, PARTICLE.spore, def.color);
        }
      }
      if (e.shieldFlash !== undefined && e.shieldFlash > 0) e.shieldFlash -= dt; // shatter flash decay
    }
  }

  /** Advance artillery shells: arc toward the Nucleus; damage lands ON IMPACT (with the
   *  breach float + burst the old instant hit used to fire). Empty on the golden path. */
  private enemyShellSystem(dt: number): void {
    if (this.enemyShells.length === 0) return;
    for (const s of this.enemyShells) {
      s.t += dt / s.duration;
      if (s.t >= 1) {
        if (!this.god) { const sd = this.braceHiveDamage(s.damage); this.integrity -= sd; this.statIntegrityLost += sd; this.noteHiveDamage(s.src ?? 'siege', sd); } // flawless-run tracking (siege lands on impact; Infinite breach ceiling)
        this.floats.push({ x: s.targetX, y: s.targetY - 18, text: `-${s.damage}`, color: '#ff8a3d', life: 0.9 });
        this.spawnParticles(s.targetX, s.targetY, PARTICLE.breach, s.color);
      }
    }
    this.enemyShells = this.enemyShells.filter((s) => s.t < 1);
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
    const supportR = this.towerEffectiveRange.reactor;
    const supportR2 = supportR * supportR;
    // STRAIN Synaptic Weave (docs/STRAIN.md — reactor IV): CHAINED reactors amplify each other —
    // a reactor with another reactor in weave reach projects a wider overcharge ring. Topology,
    // not a stat: only linked reactors get the extended radius. Empty kit ⇒ base behaviour.
    let maxReactorStrain = 1;
    let maxParasiteStrain = 1;
    let maxChrysalisStrain = 1;
    let maxEffigyStrain = 1;
    for (const t of this.towers) {
      if (t.kind === 'reactor' && t.strain > maxReactorStrain) maxReactorStrain = t.strain;
      if (t.kind === 'parasite' && t.strain > maxParasiteStrain) maxParasiteStrain = t.strain;
      if (t.kind === 'chrysalis' && t.strain > maxChrysalisStrain) maxChrysalisStrain = t.strain;
      if (t.kind === 'effigy' && t.strain > maxEffigyStrain) maxEffigyStrain = t.strain;
    }
    this.reactorKit = resolveStrain('reactor', maxReactorStrain);
    this.parasiteKit = resolveStrain('parasite', maxParasiteStrain);
    this.chrysalisKit = resolveStrain('chrysalis', maxChrysalisStrain);
    this.effigyKit = resolveStrain('effigy', maxEffigyStrain);
    const weave = this.reactorKit.reactorLink === true;
    const linked: boolean[] = [];
    if (weave) {
      const weaveR2 = supportR2 * 4; // chain reach: 2× the support radius
      for (let i = 0; i < reactors.length; i++) {
        linked[i] = false;
        for (let j = 0; j < reactors.length; j++) {
          if (i !== j && dist2(reactors[i].x, reactors[i].y, reactors[j].x, reactors[j].y) <= weaveR2) {
            linked[i] = true;
            break;
          }
        }
      }
    }
    const linkedR2 = supportR * 1.45 * (supportR * 1.45);
    for (const t of this.towers) {
      if (t.kind === 'reactor') {
        t.overcharged = false;
        continue;
      }
      const slot = towerSlots[t.slot];
      let oc = false;
      for (let i = 0; i < reactors.length; i++) {
        const rc = reactors[i];
        const reach = weave && linked[i] ? linkedR2 : supportR2;
        if (dist2(rc.x, rc.y, slot.x, slot.y) <= reach) {
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
    let atk = 0;
    let dps = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (inFinalDefenseZone(e.y)) list.push(e);
      if (e.sieging) {
        atk++;
        dps += e.damage / e.attackInterval;
      }
    }
    this.hiveAttackers = atk;
    this.hiveDps = dps;
    // Presentation decay (render-only accumulators — same precedent as emergencyRamp below).
    this.hiveRecentDamage = Math.max(0, this.hiveRecentDamage - this.hiveRecentDamage * (dt / HIVE.recentWindow) - 0.02 * dt);
    this.hiveHitPulse = Math.max(0, this.hiveHitPulse - dt * 2.4);
    if (this.hiveFloatTimer > 0) this.hiveFloatTimer -= dt;
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
    // Render-only ease, GATED by the danger-camera state machine (docs/CAMERA.md): the zone
    // wash/beams may only light up once danger has COMMITTED (confirmation window passed), and
    // they exhale slowly — an in-zone blip that dies before confirming never flashes the screen,
    // and successive leakers inside the hold window don't re-flash it. Never read by the sim.
    const zoneTarget = this.emergencyActive && this.dangerCam.phase === 'danger' ? 1 : 0;
    const rate = zoneTarget > this.emergencyRamp ? 5 : 0.9;
    this.emergencyRamp += (zoneTarget - this.emergencyRamp) * Math.min(1, rate * dt);
  }

  /** RENDER-ONLY (docs/CAMERA.md): fold the battlefield into one raw THREAT SCORE — every
   *  enemy past the defensive edge, weighted by proximity (approach band → zone → core),
   *  tier (boss ≫ elite ≫ normal) and remaining health (dying enemies fade out of the
   *  score) — then advance the danger-camera state machine. One pass, no allocation; no
   *  sim system reads any of it, so fixed-seed outcomes are untouched. */
  private dangerCameraSystem(dt: number): void {
    let raw = 0;
    if (this.enemies.length > 0) {
      const bandTop = DEFENSE_TOP_Y;
      const zoneTop = FINAL_DEFENSE_TOP_Y;
      const coreSpan = Math.max(1, HEIGHT - zoneTop);
      for (const e of this.enemies) {
        if (!e.alive || e.y <= bandTop) continue;
        const w = e.y < zoneTop
          ? DANGER_CAM.wApproach * ((e.y - bandTop) / (zoneTop - bandTop))
          : DANGER_CAM.wZone + (DANGER_CAM.wCore - DANGER_CAM.wZone) * Math.min(1, (e.y - zoneTop) / coreSpan);
        const tier = e.boss ? DANGER_CAM.tier.boss : e.elite ? DANGER_CAM.tier.elite : DANGER_CAM.tier.normal;
        const hp = e.maxHp > 0 ? e.hp / e.maxHp : 1;
        raw += w * tier * (DANGER_CAM.hpFloor + (1 - DANGER_CAM.hpFloor) * hp);
      }
    }
    stepDangerCamera(this.dangerCam, raw, dt);
  }

  private towerSystem(dt: number): void {
    const ksDmg = this.keystoneTowerDmgMult(); // run-wide keystone damage (1 = none); per-tick
    const runBuffDmg = this.runBuffMult('towerDamage'); // timed run buff (1 = none); bit-identical when off
    // Class resonance: the fielded hero's combat class amplifies same-class towers (off at 0).
    const resoClass = this.mods.classResonanceBonus > 0 ? HERO_DEFS[this.heroes[0].kind].combatClass : null;
    for (const t of this.towers) {
      const def = TOWER_DEFS[t.kind];
      this.castMinRange = def.minRange ?? 0; // artillery deadzone (mortar); 0 for every other tower ⇒ identity. Set for EVERY tower up front so a mortar's value never leaks into a later support-branch / strain sub-cast.
      this.masteryAccrual[t.kind].activeTime += dt; // usage signal (every deployed tower)
      if (t.strain > 1) this.strainBirthTick(t, dt); // STRAIN births (harvester / brood) — any kind
      if (def.firing === 'support') {
        // Systolic Reserve (docs/TOWER-IDLE.md): the heart reads its NEIGHBORHOOD — a calm
        // sense radius means preparation (the trickle mend); a threat inside snaps it taut.
        this.towerIdlePosture(t, this.towerHasTarget(t.x, t.y, TOWER_IDLE.reactorSenseRadius, 0), dt);
        if (t.tier > 0) this.supportBranchPulse(t, dt); // branched reactor: pulse its mutations
        continue; // base economy/overcharge handled in economySystem
      }
      if (this.time < t.disabledUntil) continue; // suppressed by a boss — can't fire
      // Beam towers (firing 'beam'): a CONTINUOUS, locked, ramping channel — damage every tick (not on
      // the projectile cooldown), so handled before the cooldown gate. Both share the EXACT damage/rate
      // fold (towerAttackMods) so overcharge, hero auras, biome, class resonance, dampeners, corruption
      // and branches apply identically. Routed by kind: the Resonance Coil melts (beamTowerSystem); the
      // Marrow Siphon melts AND siphons the drain into Biomass (beamSystem). No beam tower ⇒ never reached.
      if (def.firing === 'beam') {
        const bprog = this.towerProgress[t.kind];
        const bbk = t.tier > 0 ? resolveBranchKit(t.branchId, t.tier) : null;
        const bmods = this.towerAttackMods(t, def, bprog, bbk, ksDmg, runBuffDmg, resoClass);
        if (t.kind === 'siphon') this.beamSystem(t, dt, def, bprog, bbk, bmods.dmgMult, bmods.rateMult);
        else this.beamTowerSystem(t, dt, def, bprog, bbk, bmods.dmgMult, bmods.rateMult);
        continue;
      }
      // Trap towers (Blight Sower, firing 'trap'): no attack — it SEEDS armed spore mines up-lane
      // on its cadence (docs/SOWER.md). Shares the exact damage/rate fold; detonation stats are
      // baked at PLANT time. No trap tower ⇒ never reached (golden-safe).
      if (def.firing === 'trap') {
        const sprog = this.towerProgress[t.kind];
        const sbk = t.tier > 0 ? resolveBranchKit(t.branchId, t.tier) : null;
        const smods = this.towerAttackMods(t, def, sprog, sbk, ksDmg, runBuffDmg, resoClass);
        this.trapTowerSystem(t, dt, def, sprog, sbk, smods.dmgMult, smods.rateMult);
        continue;
      }
      // Summon towers (Drake Roost, firing 'summon'): no attack — it INCUBATES a brood of hero-AI
      // drakes on its own cadence (docs/TOWERS.md §roost). The shared damage/rate fold shapes the
      // UNITS: dmgMult scales hatchling claws/hide, rateMult the hatch cadence, rangeMult (via the
      // star/branch kit) the hunt leash baked into each hatch. No roost ⇒ never reached (golden-safe).
      if (def.firing === 'summon') {
        const rprog = this.towerProgress[t.kind];
        const rbk = t.tier > 0 ? resolveBranchKit(t.branchId, t.tier) : null;
        const rmods = this.towerAttackMods(t, def, rprog, rbk, ksDmg, runBuffDmg, resoClass);
        this.roostSystem(t, dt, def, rprog, rbk, rmods.dmgMult, rmods.rateMult);
        continue;
      }
      t.cooldown -= dt;
      const prog = this.towerProgress[t.kind]; // permanent per-kind buffs (stars + mastery)
      // Per-instance branch upgrade kit (TOWER-BRANCHES.md). Null when unbranched ⇒ every
      // fold below reduces to the base path ⇒ golden byte-identical (autoplay never branches).
      const bk = t.tier > 0 ? resolveBranchKit(t.branchId, t.tier) : null;
      // Bonus math flows through the universal modifier framework (combineMult). Factored into
      // towerAttackMods so the beam path shares the EXACT math; the projectile result is bit-identical.
      const { dmgMult, rateMult } = this.towerAttackMods(t, def, prog, bk, ksDmg, runBuffDmg, resoClass);
      // A ranging cast (docs/TOWER-IDLE.md — idle suppression fire) rides the normal cast path
      // below with weakened globals; latched here so the fold + bookkeeping know.
      let rangingCast = false;
      if (this.mega !== null && this.mega.deathT === 0) {
        // MEGA raid-fire (docs/MEGA-BOSS.md): an OPEN weak point inside this tower's reach takes
        // absolute priority over normal targets; with none and an empty field, the tower chips the
        // anchored body instead. Handles its own cooldown; gated ⇒ zero cost without a mega.
        // A standing mega IS engagement (docs/TOWER-IDLE.md): posture reads combat, banks hold.
        this.towerIdlePosture(t, true, dt);
        if (t.cooldown > 0) continue;
        if (this.towerMegaFire(t, def, prog, bk, dmgMult, rateMult)) continue;
      } else {
        // THE ENGAGEMENT TEST (docs/TOWER-IDLE.md §1): any living enemy inside effective reach,
        // outside the deadzone. Unengaged towers ease into PREPARATION and run their secondary
        // behavior instead of casting (field towers no longer pulse empty air — deliberate).
        let effRange = def.range * (prog.rangeMult ?? 1) * (bk?.rangeMult ?? 1) * this.megaFx.towerRange;
        if (t.kind === 'maw') effRange *= this.mods.mawCleaveRadiusMult;
        if (t.kind === 'polyp') effRange *= this.mods.polypFieldMult;
        const engaged = this.disableIdle || this.towerHasTarget(t.x, t.y, effRange, def.minRange ?? 0);
        this.towerIdlePosture(t, engaged, dt);
        if (!engaged) {
          const row = IDLE_BEHAVIORS[t.kind];
          if (row.verb !== 'ranging' || row.ranging === undefined || t.idleCd > 0 || t.cooldown > 0 || this.enemies.length === 0) continue;
          rangingCast = true; // Spore Drift: a weak long-reach volley through the normal pipeline
        }
        if (t.cooldown > 0) continue;
      }
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
      this.castRangeMult = (prog.rangeMult ?? 1) * (bk?.rangeMult ?? 1) * this.megaFx.towerRange;
      if (t.kind === 'maw') this.castRangeMult *= this.mods.mawCleaveRadiusMult; // bite reach (cards/affixes)
      if (t.kind === 'polyp') this.castRangeMult *= this.mods.polypFieldMult; // a wider undertow (cards)
      if (t.kind === 'spire') this.castExtraProjectiles += Math.max(0, Math.floor(this.mods.spireChainJumps)); // +arc hops (cards)
      if (t.kind === 'glaive') this.castExtraProjectiles += Math.max(0, Math.floor(this.mods.glaiveExtraBlades)); // +blades per throw (cards)
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
      this.castStatusAmountBonus = 0;
      // STRAIN hooks (docs/STRAIN.md §framework): resolved per cast, EMPTY at Strain I (zero
      // rng, zero work ⇒ pre-strain runs byte-identical). Fragmentation rides the projectile.
      const sk = resolveStrain(t.kind, t.strain);
      // Maw GLUT (docs/STRAIN.md — Gorging Gullet): this wave's meals widen the jaws NOW.
      if (sk.gorge !== undefined && t.glut !== undefined && t.glut > 0) {
        this.castRangeMult *= 1 + Math.min(sk.gorge.maxStacks, t.glut) * sk.gorge.reachPerStack;
      }
      // Chrysalis Twin Cocoon: the warden refuses preserved bodies — its pick skips them.
      this.castExcludeFrozen = sk.dualCasing === true;
      this.castFragment = sk.fragmentOnImpact ?? null;
      this.castRicochet = sk.ricochetOnKill ?? null;
      this.castKnockback = sk.impactKnockback ?? 0;
      this.castVenom = sk.venomMark ?? null;
      this.castEcho = sk.echoShell ?? null;
      this.castFragKnockback = sk.fragmentsKnockback === true;
      // ── Idle-posture folds (docs/TOWER-IDLE.md §2). A RANGING cast weakens the whole volley
      //    (suppression, not power); a banked WINDUP amplifies the OPENING cast, interpolated by
      //    charge. Both ride the shared cast globals, so stars/branches/cards compose untouched. ──
      const idleRow = IDLE_BEHAVIORS[t.kind];
      let openerCharge = 0;
      if (rangingCast && idleRow.ranging !== undefined) {
        const rg = idleRow.ranging;
        this.castScratch.damageMult *= rg.dmgFrac;
        this.castRangeMult *= rg.reachMult;
        this.castSplashMult *= rg.splashFrac;
      } else if (!this.disableIdle && idleRow.verb === 'windup' && idleRow.open !== undefined && t.idleCharge >= TOWER_IDLE.readyAt) {
        openerCharge = t.idleCharge;
        const o = idleRow.open;
        if (o.dmgMult !== undefined) this.castScratch.damageMult *= 1 + (o.dmgMult - 1) * openerCharge;
        if (o.rangeMult !== undefined) this.castRangeMult *= 1 + (o.rangeMult - 1) * openerCharge;
        if (o.splashMult !== undefined) this.castSplashMult *= 1 + (o.splashMult - 1) * openerCharge;
        if (o.extraProjectiles !== undefined) this.castExtraProjectiles += Math.round(o.extraProjectiles * openerCharge);
        if (o.pierce !== undefined) this.castScratch.pierce += Math.round(o.pierce * openerCharge);
        if (o.statusBonus !== undefined) this.castStatusAmountBonus = o.statusBonus * openerCharge;
      }
      let acted = runAbilities(this.actx, TOWER_ABILITIES[t.kind], this.castScratch);
      // Secondary firing organ (twin-cast): the WHOLE cast repeats once on the proc — a new
      // volley, not extra projectiles (that axis belongs to stars/branches). During an APEX
      // FRENZY window (docs/STRAIN.md — Apex Spinneret) the proc is GUARANTEED: a readable
      // rhythmic burst beat, still consuming the roll so the rng stream stays uniform.
      if (acted && sk.twinCastChance !== undefined) {
        const roll = this.rng.next();
        const fw = sk.frenzyWindow;
        const frenzied = fw !== undefined && this.time % fw.period < fw.duration;
        if (frenzied || roll < sk.twinCastChance) {
          runAbilities(this.actx, TOWER_ABILITIES[t.kind], this.castScratch);
        }
      }
      // Expansion strain verbs (docs/STRAIN.md): each executes ONCE here, gated on its hook —
      // an empty kit is zero work, so pre-strain and legacy-roster runs are byte-identical.
      if (acted && (sk.cleaveGrip !== undefined || sk.refluxVolley !== undefined || sk.apexGorge !== undefined)) {
        this.mawStrainBite(t, sk, dmgMult, def);
      }
      if (acted && sk.terrorFeed !== undefined) this.effigyTerrorFeed(t, sk.terrorFeed.damagePerPulse * dmgMult, def);
      // Star-granted attacks (auras / chains / debuffs) run on the same cadence as the base.
      if (prog.extraAbilities) acted = runAbilities(this.actx, prog.extraAbilities, this.castScratch) || acted;
      // Branch-granted attacks (shrapnel crits, infection, neural bolts …) on the same cadence.
      if (bk && bk.extraAbilities.length) acted = runAbilities(this.actx, bk.extraAbilities, this.castScratch) || acted;
      if (acted) {
        if (sk.staticCharge !== undefined) this.obeliskStrainPulse(t, sk); // STRAIN static field rides the pulse
        if (rangingCast && idleRow.ranging !== undefined) {
          // Suppression volley (docs/TOWER-IDLE.md): its own cadence; primary readiness stays
          // hot (cooldown ≤ 0) so real engagement still opens instantly.
          t.idleCd = idleRow.ranging.cadence / rateMult;
          t.cooldown = 0;
          this.idleRangingShots++;
        } else if (!this.disableIdle && idleRow.verb === 'reserve' && idleRow.reserve !== undefined && t.idleCharge >= 1) {
          // A gestated reserve round: the next follows at burst tempo, spending the clutch.
          t.idleCharge -= 1;
          t.cooldown = idleRow.reserve.burstInterval / rateMult;
          this.idleOpeners++;
        } else {
          t.cooldown = def.fireInterval / rateMult;
        }
        if (openerCharge > 0) { t.idleCharge = 0; this.idleOpeners++; } // the windup released
        // Branch sensory signature (TOWER-BRANCHES.md §1): a muzzle spray + sound on every shot.
        // Cosmetic only (FX rng + sfx queue) ⇒ golden-safe; bk is null on the unbranched/autoplay path.
        if (bk) this.emitBranchSignature(bk, t.x, t.y - 6, t.tier);
        else { const fc = towerFireCue(t.kind); if (fc) this.pushSfx(`${fc}:${t.kind}`); } // BASE firing cue, kind-tagged for Phenotype sfx variants (presentation-only)
      }
    }
    // Reset the per-cast kit so later systems (hero casts) see base values, not a tower's.
    this.castStatusAmountBonus = 0;
    this.castFragment = null;
    this.castRicochet = null;
    this.castKnockback = 0;
    this.castVenom = null;
    this.castEcho = null;
    this.castFragKnockback = false;
    this.castExtraProjectiles = 0;
    this.castSplashMult = 1;
    this.castRangeMult = 1;
    this.castMinRange = 0;
    this.castProjectileMutators = EMPTY_STR;
    this.castProjectileSkin = undefined;
    this.castProjectileSkinTier = 0;
    this.castExcludeFrozen = false;
  }

  /** The combined tower DAMAGE + FIRE-RATE fold (overcharge · hero aura · biome class · dampener ·
   *  corruption · class resonance · keystones · run buffs · branch ride-along). Extracted so the
   *  projectile loop AND the Resonance Beam share the EXACT same math — the projectile path's result
   *  is bit-identical to the previous inline computation (golden-safe). `ksDmg`/`runBuffDmg`/`resoClass`
   *  are hoisted once per tick by the caller (loop-invariant). */
  private towerAttackMods(
    t: Tower, def: TowerDef, prog: TowerMods, bk: ResolvedBranchKit | null,
    ksDmg: number, runBuffDmg: number, resoClass: CombatClass | null,
  ): { dmgMult: number; rateMult: number } {
    const ocRate = t.overcharged ? 1 + ECON.overchargeRate : 1;
    // Reactor STAR evolution: its kit adds to the overcharge it projects onto neighbors.
    const starOc = this.towerProgress.reactor.reactorOverchargeBonus ?? 0; // 0 for a fresh save
    const ocDmg = t.overcharged ? 1 + ECON.overchargeDamage + this.mods.reactorOverchargeBonus + starOc : 1;
    // SUPPORT gear: a hero aura hastes/empowers towers within range (×1 ⇒ golden-safe without aura gear).
    let heroHaste = 1;
    let heroDmgAura = 1;
    if (this.mods.heroAuraRadius > 0) {
      const r2 = this.mods.heroAuraRadius * this.mods.heroAuraRadius;
      if (this.heroes.some((ph) => !ph.down && dist2(t.x, t.y, ph.x, ph.y) <= r2)) {
        heroHaste = 1 + this.mods.heroTowerHasteAura;
        heroDmgAura = 1 + this.mods.heroTowerDamageAura;
      }
    }
    // Biome efficiency (docs/BIOMES.md): per-combat-class damage × + fire-rate ×; identity (×1) under
    // NEUTRAL_BIOME is IEEE-exact ⇒ Stage mode stays byte-identical.
    const biomeClassDmg = this.activeBiome.mods.towerClassMult[def.combatClass] ?? 1;
    // Boss dampener aura (docs/BOSS-DESIGN.md §siege): a dampened tower fires slower. 1 when never dampened.
    const dampenMult = this.time < t.dampenedUntil ? 1 - t.dampenFrac : 1;
    const rateMult = combineMult(this.mods.towerFireRateMult, prog.fireRateMult, ocRate, heroHaste, bk ? bk.fireRateMult : 1) * this.biomeTowerRate() * dampenMult * this.megaFx.towerRate;
    const reso = resoClass !== null && def.combatClass === resoClass ? 1 + this.mods.classResonanceBonus : 1;
    // Idle-choir song (docs/TOWER-IDLE.md — Sepulchral Chorus): an unengaged choir tower grants
    // nearby towers a small damage bonus; ×1 whenever no choir sings (golden/disableIdle path).
    const choir = t.choirDmg > 0 ? 1 + t.choirDmg : 1;
    const dmgMult = combineMult(this.mods.towerDamageMult, prog.damageMult, ocDmg, ksDmg, reso, heroDmgAura, runBuffDmg, bk ? bk.damageMult : 1) * biomeClassDmg * this.towerCorruptionMult(t) * choir;
    return { dmgMult, rateMult };
  }

  /** THE ENGAGEMENT TEST (docs/TOWER-IDLE.md §1): any living enemy inside `range`, outside the
   *  deadzone. Mirrors the targeting query's reach so a tower never idles while it could act. */
  private towerHasTarget(x: number, y: number, range: number, minRange: number): boolean {
    const r2 = range * range;
    const m2 = minRange * minRange;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d2 = dist2(x, y, e.x, e.y);
      if (d2 <= r2 && d2 >= m2) return true;
    }
    return false;
  }

  /** IDLE POSTURE + secondary-behavior accrual (docs/TOWER-IDLE.md). Runs every tick for every
   *  tower on every firing path: eases `prep` (the renderer's transition scalar), decays a
   *  received choir bonus, and — while unengaged — banks windup charge / gestates reserves,
   *  counts ranging cadence, pays trickles, and sings the choir. Preheat/tending execute inside
   *  their bespoke systems (beam/trap/summon) but share this posture bookkeeping. Under
   *  `disableIdle` only the choir decay runs (everything is 0 ⇒ zero work — the legacy sim). */
  private towerIdlePosture(t: Tower, engaged: boolean, dt: number): void {
    if (t.choirDmg > 0) t.choirDmg = Math.max(0, t.choirDmg - TOWER_IDLE.choirDecay * t.choirDmg * dt);
    if (this.disableIdle) return;
    if (engaged) {
      if (t.prep > 0) t.prep = Math.max(0, t.prep - dt / TOWER_IDLE.fallTime);
      return;
    }
    if (t.prep < 1) t.prep = Math.min(1, t.prep + dt / TOWER_IDLE.riseTime);
    const row = IDLE_BEHAVIORS[t.kind];
    switch (row.verb) {
      case 'windup': {
        if (t.idleCharge < 1) {
          const time = (row.chargeTime ?? 5) / Math.max(0.1, this.mods.towerIdleChargeMult);
          const next = Math.min(1, t.idleCharge + dt / time);
          if (next >= 1) this.pushSfx('tprep_ready'); // the bank fills — once per idle cycle
          t.idleCharge = next;
        }
        break;
      }
      case 'reserve': {
        const r = row.reserve;
        if (r !== undefined && t.idleCharge < r.volleys) {
          const time = (row.chargeTime ?? 5) / Math.max(0.1, this.mods.towerIdleChargeMult);
          const next = Math.min(r.volleys, t.idleCharge + (r.volleys * dt) / time);
          if (next >= r.volleys && t.idleCharge < r.volleys) this.pushSfx('tprep_ready');
          t.idleCharge = next;
        }
        break;
      }
      case 'ranging':
        if (t.idleCd > 0) t.idleCd -= dt;
        break;
      case 'trickle': {
        const tr = row.trickle;
        if (tr === undefined) break;
        if (tr.biomassPerSec !== undefined) {
          const gain = tr.biomassPerSec * dt;
          this.biomass += gain;
          this.idleBiomass += gain;
        }
        if (tr.integrityPerSec !== undefined && this.integrity > 0 && this.integrity < this.maxIntegrity) {
          const mend = Math.min(this.maxIntegrity - this.integrity, tr.integrityPerSec * dt);
          this.integrity += mend;
          this.idleMended += mend;
        }
        break;
      }
      case 'choir': {
        const c = row.choir;
        if (c === undefined) break;
        const r2 = c.radius * c.radius;
        for (const nb of this.towers) {
          if (nb.id !== t.id && dist2(t.x, t.y, nb.x, nb.y) <= r2 && nb.choirDmg < c.dmgBonus) nb.choirDmg = c.dmgBonus;
        }
        break;
      }
      case 'preheat':
      case 'tending':
        break; // executed in beamTowerSystem / trapTowerSystem / roostSystem
    }
  }

  /** RESONANCE BEAM (Resonance Coil, firing 'beam') — the roster's sustained-focus MELTER, and a
   *  genuinely different mechanic: instead of discrete shots, the Coil channels a CONTINUOUS beam at
   *  one locked target and RAMPS. `beamHeat` (0..1) climbs while focus holds the SAME target and
   *  resets on a switch; damage per tick = base DPS × dmgMult × (1 + heat · rampBonus · coilRampMult),
   *  so it starts weak and melts anything that stands in it — elites and bosses especially. It honors
   *  `extraProjectiles` (stars/branches) + the `coilBeamTargets` card knob as EXTRA simultaneous beam
   *  targets, and fires star/branch grants (crit/status/aura) on the tower's PULSE cadence. Runs every
   *  tick (dt-scaled ⇒ deterministic). Inert unless a Coil is fielded ⇒ the golden run never sees it. */
  private beamTowerSystem(
    t: Tower, dt: number, def: TowerDef, prog: TowerMods, bk: ResolvedBranchKit | null,
    dmgMult: number, rateMult: number,
  ): void {
    const profile: TargetingProfile = bk?.targeting ?? prog.targeting ?? def.targeting ?? 'closestToBase';
    const rangeMult = (prog.rangeMult ?? 1) * (bk?.rangeMult ?? 1);
    const range = def.range * rangeMult * this.megaFx.towerRange; // ×1 without a mega suppression field
    const extra = (prog.extraProjectiles ?? 0) + (bk?.extraProjectiles ?? 0) + Math.max(0, Math.floor(this.mods.coilBeamTargets));
    const nTargets = 1 + Math.max(0, extra);
    this.abilitySourceKind = t.kind;
    this.abilityHeroKind = null;
    this.abilityCaster = null;
    this.abilityTargeting = profile;
    const r2 = range * range;
    // STICKY lock: hold the current target while it's alive + in reach — THAT is what lets resonance
    // ramp (a fresh profile-pick every tick would reset heat constantly). Re-pick by profile only when
    // the lock is empty or lost, so the beam bites the toughest, then MELTS it to death before moving on.
    // MEGA raid channel (docs/MEGA-BOSS.md): an open weak point in reach takes the beam. The lock
    // encodes as -1000 - spec so resonance HOLDS across ticks (same organ = same heat ramp);
    // the renderer resolves the coordinates from the mega view. Gated ⇒ never reached otherwise.
    if (this.mega !== null && this.mega.deathT === 0) {
      const rt = this.mega;
      // The Hive outranks the raid (megaRaidYield): while the Core is threatened the beam
      // ignores organs and hunts enemies like any other tick.
      const wp = this.megaRaidYield ? null : this.megaWeakPointInRange(t.x, t.y, range);
      if (wp !== null) {
        const lock = -1000 - wp.spec;
        if (t.beamTarget !== lock) { t.beamTarget = lock; t.beamHeat = 0; }
        else t.beamHeat = Math.min(1, t.beamHeat + BEAM.heatPerSec * rateMult * dt);
        const wpHeat = 1 + t.beamHeat * BEAM.rampBonus * this.mods.coilRampMult;
        const raw = def.damage * dmgMult * wpHeat * dt;
        this.megaHitWeakPoint(wp, raw, t.x, t.y, TOWER_DEFS.coil.color);
        rt.dmgByKind.coil = (rt.dmgByKind.coil ?? 0) + raw; // ADAPT's ledger sees the beam too
        t.cooldown = Math.max(0, t.cooldown - dt);
        return;
      }
      if (t.beamTarget <= -1000) { t.beamTarget = -1; t.beamHeat = 0; } // organ gone — the lock drops cold
      // Between windows, a beam with NO prey in its own reach grinds the anchored body
      // instead — armored chip, no resonance ramp on dead chitin (docs/MEGA-BOSS.md
      // §targeting; same no-dead-sentry rule as towerMegaFire).
      if (!this.towerHasTarget(t.x, t.y, range, 0)) {
        const bx = Math.max(WIDTH * 0.2, Math.min(WIDTH * 0.8, t.x));
        const by = this.megaBodyY(t.y, range);
        if (dist2(t.x, t.y, bx, by) <= r2) {
          const raw = def.damage * dmgMult * this.megaChipMult() * dt;
          this.megaHitBody(raw, t.x, t.y, bx, by, TOWER_DEFS.coil.color);
          rt.dmgByKind.coil = (rt.dmgByKind.coil ?? 0) + raw;
          t.beamHeat = Math.max(0, t.beamHeat - BEAM.heatDecayPerSec * dt);
          t.cooldown = Math.max(0, t.cooldown - dt);
          return;
        }
      }
    }
    let primary: Enemy | null = null;
    if (t.beamTarget >= 0) {
      const held = this.enemyById.get(t.beamTarget);
      if (held && held.alive && dist2(t.x, t.y, held.x, held.y) <= r2) primary = held;
    }
    const picks = this.pickTargets(t.x, t.y, range, nTargets, profile);
    if (!primary) primary = picks[0] ?? null;
    if (!primary) {
      // Nothing in reach: the beam sputters — the lock drops. Under the idle contract the heat
      // DRIFTS to the Harmonic Reserve floor (docs/TOWER-IDLE.md — decays down to it, climbs
      // slowly up to it) so the beam re-opens pre-ramped; legacy path bleeds to zero.
      this.towerIdlePosture(t, false, dt);
      t.beamTarget = -1;
      if (this.disableIdle) {
        t.beamHeat = Math.max(0, t.beamHeat - BEAM.heatDecayPerSec * dt);
      } else {
        const floor = IDLE_BEHAVIORS.coil.preheat?.floor ?? 0;
        t.beamHeat = t.beamHeat > floor
          ? Math.max(floor, t.beamHeat - BEAM.heatDecayPerSec * dt)
          : Math.min(floor, t.beamHeat + TOWER_IDLE.preheatRisePerSec * dt);
      }
      t.cooldown = Math.max(0, t.cooldown - dt); // keep the proc pulse ticking down
      return;
    }
    this.towerIdlePosture(t, true, dt); // channeling = combat posture
    // Sustained focus RAMPS; a NEW lock starts cold. Fire rate speeds the ramp.
    if (primary.id !== t.beamTarget) { t.beamTarget = primary.id; t.beamHeat = 0; }
    else t.beamHeat = Math.min(1, t.beamHeat + BEAM.heatPerSec * rateMult * dt);
    const heatMult = 1 + t.beamHeat * BEAM.rampBonus * this.mods.coilRampMult;
    const perTick = def.damage * dmgMult * heatMult * dt; // def.damage = base DPS; × dt = this tick's slice
    const hot = t.beamHeat >= 0.5; // only flash white once the beam bites, to keep the read clean
    // The beamed set = the held primary + up to (nTargets-1) other profile picks (extra channels ride
    // the SAME resonance heat — an extraProjectiles/coilBeamTargets upgrade fans the melt across foes).
    const beamed: Enemy[] = [primary];
    for (const e of picks) { if (beamed.length >= nTargets) break; if (e.id !== primary.id) beamed.push(e); }
    for (const e of beamed) {
      this.applyDamage(e, perTick, t.kind, hot);
      this.maybeReact(e);
    }
    // Proc pulse: star/branch grants (crit / status / aura) + the Corrosion sear fire on the tower's
    // cadence, NOT every tick — so a beam with a crit branch crits a few times a second, not 60×.
    t.cooldown -= dt;
    if (t.cooldown > 0) return;
    t.cooldown = def.fireInterval / rateMult;
    this.applyStatus(primary, { kind: 'Resonance', amount: STATUS.resonancePerHit }); // the Coil's OWN Resonant status (reaction fuel) — builds each pulse as it channels; maybeReact (per tick above) combusts it
    if (prog.extraAbilities || (bk && bk.extraAbilities.length)) {
      this.castExtraProjectiles = extra;
      this.castSplashMult = (prog.splashMult ?? 1) * (bk?.splashMult ?? 1);
      this.castRangeMult = rangeMult;
      this.castProjectileMutators = bk && bk.projectileMutators.length
        ? [...(prog.projectileMutators ?? EMPTY_STR), ...bk.projectileMutators]
        : prog.projectileMutators ?? EMPTY_STR;
      this.castProjectileSkin = undefined; // the beam draws itself; no projectile skin
      this.castProjectileSkinTier = 0;
      this.castScratch.x = t.x;
      this.castScratch.y = t.y;
      this.castScratch.damageMult = dmgMult * heatMult; // grants scale with the beam's current resonance
      this.castScratch.target = primary;
      this.castScratch.pierce = 0;
      if (prog.extraAbilities) runAbilities(this.actx, prog.extraAbilities, this.castScratch);
      if (bk && bk.extraAbilities.length) runAbilities(this.actx, bk.extraAbilities, this.castScratch);
      this.castExtraProjectiles = 0;
      this.castSplashMult = 1;
      this.castRangeMult = 1;
      this.castProjectileMutators = EMPTY_STR;
    }
    if (bk) this.emitBranchSignature(bk, t.x, t.y - 6, t.tier); // branch matter on the pulse
  }

  /** Carrion Maw strain verbs on a landed bite (docs/STRAIN.md): Bone Vice grips everything in
   *  the jaws; Acid Reflux regurgitates a bone volley every Nth bite; the Apex Devourer follows
   *  every full-glut bite with a wider half-strength sweep. */
  private mawStrainBite(t: Tower, sk: StrainHooks, dmgMult: number, def: TowerDef): void {
    const reach = def.range * this.castRangeMult;
    if (sk.cleaveGrip !== undefined) {
      const grip = sk.cleaveGrip.seconds;
      this.grid.forNeighbors(t.x, t.y, reach, (o) => {
        if (!o.alive || dist2(t.x, t.y, o.x, o.y) > reach * reach) return;
        if (this.applyEffect(o, 'stun')) {
          const st = o.statuses?.find((x) => x.id === 'stun');
          if (st && st.stacks > 0 && st.remaining < grip) st.remaining = grip;
        }
      });
    }
    if (sk.refluxVolley !== undefined) {
      const rv = sk.refluxVolley;
      t.strainCd += 1; // the bite counter (maws never birth — the field is free here)
      if (t.strainCd >= rv.every) {
        t.strainCd = 0;
        const prey = this.pickTargets(t.x, t.y, rv.range, rv.count, 'farthest');
        for (const o of prey) {
          this.spawnProjectile(t.x, t.y, o.x, o.y, 520, o.id, def.damage * rv.damageFrac * dmgMult, 'homing', 0, 'maw');
        }
        if (prey.length > 0) this.pushSfx('shot');
      }
    }
    if (sk.apexGorge !== undefined && sk.gorge !== undefined && (t.glut ?? 0) >= sk.gorge.maxStacks) {
      const wide = reach * sk.apexGorge.reachFrac;
      const dmg = def.damage * sk.apexGorge.damageFrac * dmgMult;
      this.grid.forNeighbors(t.x, t.y, wide, (o) => {
        if (!o.alive || dist2(t.x, t.y, o.x, o.y) > wide * wide) return;
        this.applyDamage(o, dmg, 'maw', false);
      });
      this.spawnParticles(t.x, t.y, PARTICLE.mutate, TOWER_DEFS.maw.color, 0.8);
    }
  }

  /** Wailing Effigy — Nightmare Feast (docs/STRAIN.md): the pulse WOUNDS feared minds only. */
  private effigyTerrorFeed(t: Tower, damage: number, def: TowerDef): void {
    const reach = def.range * this.castRangeMult;
    this.grid.forNeighbors(t.x, t.y, reach, (o) => {
      if (!o.alive || dist2(t.x, t.y, o.x, o.y) > reach * reach) return;
      const feared = o.statuses?.some((x) => x.id === 'fear' && x.stacks > 0);
      if (feared) this.applyDamage(o, damage, 'effigy', true);
    });
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

  /** The Marrow Siphon's CONTINUOUS drain beam (docs/SIPHON.md — firing 'beam'). Unlike every other
   *  tower it does not fire discrete shots: it LOCKS a single target chosen by its targeting profile
   *  and drains it every tick (dt-scaled). The lock has MEMORY — a Gorge ramp builds while it holds
   *  the SAME target (0→1 over a few seconds, resets on a switch), multiplying the drain up to
   *  ×(1+gorgeMaxBonus). A fraction of all damage dealt is SIPHONED into Biomass (the Vital return),
   *  banked and paid out on the pulse cadence. Star/branch grants (targeting, damage/rate/range,
   *  extra "forks", and pulsed auras/debuffs) fold in via the SAME kits as every other tower, so the
   *  upgrade paths are fully wired with zero bespoke plumbing. Never reached on the golden path (the
   *  siphon is shard-locked), and its run-mod scalars default neutral ⇒ byte-identical when absent. */
  private beamSystem(t: Tower, dt: number, def: TowerDef, prog: TowerMods, bk: ResolvedBranchKit | null, dmgMult: number, rateMult: number): void {
    // dmgMult / rateMult come pre-folded from towerAttackMods (overcharge · hero aura · biome · class
    // resonance · dampener · corruption · branch) — the SAME math the projectile + Coil paths share.
    const rangeMult = (prog.rangeMult ?? 1) * (bk?.rangeMult ?? 1);
    const range = def.range * rangeMult;
    const targeting = bk?.targeting ?? prog.targeting ?? def.targeting ?? 'highestHealth';
    const forks = SIPHON.baseForks + (prog.extraProjectiles ?? 0) + (bk?.extraProjectiles ?? 0); // the drain WEB — several tethers at once (vs the Coil's single lock)

    // MEGA raid drain (docs/MEGA-BOSS.md §targeting): an open organ in reach takes the tether —
    // the drain bites it continuously; with an EMPTY field the web falls to the anchored body
    // (armored chip). No Biomass is banked from the organism (the leech runs one way) and the
    // Gorge starves on raid duty. Gated ⇒ never reached without a mega (golden-safe).
    if (this.mega !== null && this.mega.deathT === 0) {
      const rt = this.mega;
      // The Hive outranks the raid (megaRaidYield): a threatened Core pulls the web back
      // onto the enemies feeding on it before any organ gets a tether.
      const wp = this.megaRaidYield ? null : this.megaWeakPointInRange(t.x, t.y, range);
      if (wp !== null) {
        const raw = def.damage * dmgMult * dt;
        t.beamTarget = -1000 - wp.spec; // organ lock (the Coil's encode — any lock reader agrees)
        t.beamX = wp.x;
        t.beamY = wp.y;
        this.megaHitWeakPoint(wp, raw, t.x, t.y, TOWER_DEFS.siphon.color);
        rt.dmgByKind.siphon = (rt.dmgByKind.siphon ?? 0) + raw; // ADAPT studies the drain too
        t.beamHeat = Math.max(0, (t.beamHeat ?? 0) - SIPHON.gorgeDecayPerSec * dt);
        t.cooldown = Math.max(0, t.cooldown - dt);
        return;
      }
      if (!this.towerHasTarget(t.x, t.y, range, 0)) { // no prey in reach ⇒ drain the mountain (no dead sentries)
        const bx = Math.max(WIDTH * 0.2, Math.min(WIDTH * 0.8, t.x));
        const by = this.megaBodyY(t.y, range);
        if (dist2(t.x, t.y, bx, by) <= range * range) {
          const raw = def.damage * dmgMult * this.megaChipMult() * dt;
          t.beamTarget = -1;
          t.beamX = bx;
          t.beamY = by;
          this.megaHitBody(raw, t.x, t.y, bx, by, TOWER_DEFS.siphon.color);
          rt.dmgByKind.siphon = (rt.dmgByKind.siphon ?? 0) + raw;
          t.beamHeat = Math.max(0, (t.beamHeat ?? 0) - SIPHON.gorgeDecayPerSec * dt);
          t.cooldown = Math.max(0, t.cooldown - dt);
          return;
        }
      }
      if (t.beamTarget <= -1000) { t.beamTarget = -1; t.beamX = undefined; t.beamY = undefined; } // organ gone — the tether drops
    }

    // Acquire / maintain the locked target. Scope the target pick as a TOWER cast so emergency
    // focus + deadzone behave identically to every other tower.
    this.abilitySourceKind = t.kind;
    this.abilityHeroKind = null;
    this.castMinRange = def.minRange ?? 0;
    this.castExcludeFrozen = false;
    const targets: Enemy[] = this.pickTargets(t.x, t.y, range, forks, targeting);
    const primary = targets.length > 0 ? targets[0] : null;

    // GORGE = gluttony (docs/SIPHON.md), NOT the Coil's focus-heat: it builds from total FEEDING —
    // drain throughput (a floor so a lone drain still ramps) + a bonus per KILL — and bleeds off
    // slowly. Target-agnostic: switching prey never resets it, so it rewards feeding a kill-rich lane.
    let heat = Math.max(0, (t.beamHeat ?? 0) - SIPHON.gorgeDecayPerSec * dt);
    if (primary === null) {
      // Root Draw (docs/TOWER-IDLE.md): between meals the roots drink the soil — the trickle
      // verb pays inside towerIdlePosture. Posture eases into preparation.
      this.towerIdlePosture(t, false, dt);
      t.beamTarget = -1;
      t.beamX = undefined;
      t.beamY = undefined;
    } else {
      this.towerIdlePosture(t, true, dt); // draining = combat posture
      t.beamTarget = primary.id; // the primary tether drives the main ray visual
      t.beamX = primary.x;
      t.beamY = primary.y;
      const heatMult = 1 + SIPHON.gorgeMaxBonus * heat;
      const primaryDps = def.damage * dmgMult * heatMult; // per-tether drain/second BEFORE dt
      let drained = 0;
      let fed = 0; // enemies THIS drain finished — each kill fattens the Gorge
      for (let k = 0; k < targets.length; k++) {
        const e = targets[k];
        const live = e.hp > 0;
        const dps = k === 0 ? primaryDps : primaryDps * SIPHON.forkDamageFrac; // forks drain wide, not deep
        drained += this.applyDamage(e, dps * dt, t.kind, false); // continuous → no strobe
        if (live && e.hp <= 0) fed++; // the drain landed the killing blow
      }
      // Gorge climbs with feeding VOLUME (throughput floor) + a per-kill bonus, scaled by siphonRampMult.
      const gain = (drained / Math.max(1, def.damage)) * SIPHON.gorgeThroughputPerSec + fed * SIPHON.gorgePerKill;
      heat = Math.min(1, heat + gain * this.mods.siphonRampMult);
      // Siphon: bank a fraction of the drain as Biomass (the Vital return), paid on the pulse cadence.
      t.beamBank = (t.beamBank ?? 0) + drained * SIPHON.drainFrac * this.mods.siphonDrainMult;
    }
    t.beamHeat = heat;

    // Pulse cadence: pay out the banked siphon, run any star/branch granted abilities, throw FX.
    t.cooldown -= dt;
    if (t.cooldown > 0) return;
    t.cooldown = def.fireInterval / rateMult;
    if ((t.beamBank ?? 0) > 0) {
      const gain = t.beamBank as number;
      this.biomass += gain;
      this.statBiomassEarned += gain;
      if (gain >= 1) this.floats.push({ x: t.x, y: t.y - 16, text: `+${Math.round(gain)}`, color: def.color, life: 0.7 });
      this.spawnMotes(t.x, t.y); // siphoned income flies up off the organ
      t.beamBank = 0;
    }
    // Vital Mark (docs/REACTIONS): tag the primary tether on the cadence pulse, then combust — the
    // Siphon's entry into the reaction matrix (Mark fuels Harvest/Ferment/Bloom Rot/Synaptic Bloom).
    if (primary !== null && primary.hp > 0) {
      this.applyStatus(primary, { kind: 'Mark', amount: STATUS.markPerHit });
      this.maybeReact(primary);
    }
    // Star- and branch-granted attacks (auras / debuffs / chains) pulse on the beam's cadence — the
    // same grant vocabulary every other tower uses, so upgrade paths need no beam-specific code.
    const granted = ((prog.extraAbilities?.length ?? 0) + (bk?.extraAbilities.length ?? 0)) > 0;
    if (granted) {
      this.abilitySourceKind = t.kind;
      this.abilityHeroKind = null;
      this.abilityCaster = null;
      this.abilityTargeting = targeting;
      this.castExtraProjectiles = 0;
      this.castSplashMult = (prog.splashMult ?? 1) * (bk?.splashMult ?? 1);
      this.castRangeMult = rangeMult;
      this.castScratch.x = t.x;
      this.castScratch.y = t.y;
      this.castScratch.damageMult = dmgMult;
      this.castScratch.target = primary; // the fed-upon — victim-centred grants land on it (as the Coil's do)
      this.castScratch.pierce = 0;
      if (prog.extraAbilities) runAbilities(this.actx, prog.extraAbilities, this.castScratch);
      if (bk && bk.extraAbilities.length) runAbilities(this.actx, bk.extraAbilities, this.castScratch);
      this.castRangeMult = 1;
      this.castSplashMult = 1;
    }
    if (bk) this.emitBranchSignature(bk, t.x, t.y - 6, t.tier);
  }

  // ════════════════════════ BLIGHT SOWER (firing 'trap' — docs/SOWER.md) ════════════════════════
  // The roster's PRE-PLACED damage tower: it never attacks — it SEEDS armed spore mines up-lane on
  // its cadence, and the wave walks into them. Detonation stats are BAKED at plant time (that
  // moment's damage/splash folds), so a burst is a pure proximity event. Genuinely different from
  // every firing before it: the player buys area DENIAL, not a reaction.

  /** Seed one mine per cadence while below the tower's cap (stars/branches/cards raise it). */
  private trapTowerSystem(t: Tower, dt: number, def: TowerDef, prog: TowerMods, bk: ResolvedBranchKit | null, dmgMult: number, rateMult: number): void {
    t.cooldown -= dt;
    // Fallow Tilling (docs/TOWER-IDLE.md): with nothing in planting reach the gardener works
    // HARDER — +1 mine cap and a faster plant cadence. Engaged (enemies walking the garden),
    // it returns to the base tempo. disableIdle ⇒ tending never true ⇒ legacy behavior.
    const tending = !this.disableIdle
      && !this.towerHasTarget(t.x, t.y, def.range * (prog.rangeMult ?? 1) * (bk?.rangeMult ?? 1), 0);
    this.towerIdlePosture(t, !tending, dt);
    const tend = tending ? IDLE_BEHAVIORS.sower.tending : undefined;
    if (t.cooldown > 0) return;
    const cap = MINES.maxPerTower + (prog.extraProjectiles ?? 0) + (bk?.extraProjectiles ?? 0) + Math.max(0, Math.floor(this.mods.sowerExtraMines)) + (tend?.capBonus ?? 0);
    let owned = 0;
    for (const m of this.mines) if (m.towerId === t.id) owned++;
    if (owned >= cap) {
      t.cooldown = Math.min(0.25, def.fireInterval * 0.1); // full garden — re-check soon, don't bank a volley
      return;
    }
    // Plant UP-LANE of the tower, inside its reach, spread apart (min spacing). The lane flows
    // downward globally, so anything above the tower is on the approach. Deterministic: the run rng
    // (a sower never exists on the golden path) with a bounded retry for spacing.
    const range = def.range * (prog.rangeMult ?? 1) * (bk?.rangeMult ?? 1);
    let px = t.x;
    let py = t.y;
    for (let attempt = 0; attempt < 4; attempt++) {
      const cx = t.x + (this.rng.next() * 2 - 1) * range * 0.55;
      const cy = t.y - (0.35 + this.rng.next() * 0.5) * range;
      px = Math.max(16, Math.min(WIDTH - 16, cx));
      py = Math.max(80, Math.min(t.y - 30, cy));
      let clear = true;
      for (const m of this.mines) {
        if (dist2(m.x, m.y, px, py) < MINES.minSpacing * MINES.minSpacing) { clear = false; break; }
      }
      if (clear) break;
    }
    const blast = def.splash * (prog.splashMult ?? 1) * (bk?.splashMult ?? 1) * this.mods.splashRadiusMult * this.mods.sowerBlastRadiusMult;
    this.mines.push({
      id: this.nextMineId++, towerId: t.id, x: px, y: py,
      arm: MINES.armSec, blast, damage: def.damage * dmgMult, corrosion: MINES.corrosionSec,
    });
    this.spawnParticles(px, py, PARTICLE.spore, def.color, 0.5); // the bud takes root
    t.cooldown = def.fireInterval / (rateMult * (tend?.rateMult ?? 1));
    if (bk) this.emitBranchSignature(bk, px, py, t.tier); // the garden grows in branch matter
  }

  /** Arm + trigger every planted mine. Gated on mines existing, so every other run pays nothing. */
  private mineSystem(dt: number): void {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      if (m.arm > 0) { m.arm -= dt; continue; }
      // Proximity trigger: the first living, targetable enemy inside the trigger ring sets it off.
      let tripped = false;
      this.grid.forNeighbors(m.x, m.y, MINES.triggerRadius + 24, (e) => {
        if (tripped || !e.alive) return;
        if (e.boss !== null && e.boss.burrow > 0) return; // submerged — passes beneath the garden
        if (dist2(m.x, m.y, e.x, e.y) <= (MINES.triggerRadius + 6) * (MINES.triggerRadius + 6)) tripped = true;
      });
      if (!tripped) continue;
      this.detonateMine(m);
      this.mines[i] = this.mines[this.mines.length - 1];
      this.mines.pop();
    }
  }

  /** The burst: full damage + Corrosion to everything in the blast, then the tower's star/branch
   *  grants (auras / debuffs / novas) fire AT the crater — upgrades bloom where the mine bursts. */
  private detonateMine(m: SporeMine): void {
    const owner = this.towers.find((t) => t.id === m.towerId);
    const r2 = m.blast * m.blast;
    this.grid.forNeighbors(m.x, m.y, m.blast, (e) => {
      if (!e.alive || dist2(m.x, m.y, e.x, e.y) > r2) return;
      this.applyDamage(e, m.damage, 'sower');
      this.applyStatus(e, { kind: 'Corrosion', amount: m.corrosion });
      this.maybeReact(e);
    });
    this.spawnParticles(m.x, m.y, PARTICLE.acid, TOWER_DEFS.sower.color); // the burst
    this.pushSfx('mine');
    if (owner) {
      const prog = this.towerProgress.sower;
      const bk = owner.tier > 0 ? resolveBranchKit(owner.branchId, owner.tier) : null;
      if ((prog.extraAbilities?.length ?? 0) + (bk?.extraAbilities.length ?? 0) > 0) {
        this.abilitySourceKind = 'sower';
        this.abilityHeroKind = null;
        this.abilityCaster = null;
        this.abilityTargeting = 'closestToBase';
        this.castSplashMult = 1;
        this.castRangeMult = 1;
        this.castScratch.x = m.x;
        this.castScratch.y = m.y;
        this.castScratch.damageMult = 1; // grant components carry their own numbers
        this.castScratch.target = null;
        this.castScratch.pierce = 0;
        if (prog.extraAbilities) runAbilities(this.actx, prog.extraAbilities, this.castScratch);
        if (bk && bk.extraAbilities.length) runAbilities(this.actx, bk.extraAbilities, this.castScratch);
      }
    }
  }

  /** A sold/uprooted Sower's field withers (no detonation — the player chose to remove it). */
  private witherMines(towerId: number): void {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      if (this.mines[i].towerId !== towerId) continue;
      this.spawnParticles(this.mines[i].x, this.mines[i].y, PARTICLE.death, TOWER_DEFS.sower.color, 0.4);
      this.mines[i] = this.mines[this.mines.length - 1];
      this.mines.pop();
    }
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
    // Emergency Defense Mode (docs/RANGE.md §4): while an enemy is in the Final Defense Zone the
    // breach nearest the Hive Core is the TOP-PRIORITY target — but only among enemies THIS tower
    // can actually reach. A tower whose range spans the zone still focus-fires the breach; a
    // short-range tower is NO LONGER yanked off a nearer enemy it can hit toward a breach it can't
    // (that used to leave the enemy in front of it un-engaged while a straggler leaked — the
    // "towers refuse to target the last enemy" bug). Scoped to tower casts — heroes (abilityHeroKind
    // set) and the Obelisk's control field (no target pick) are excluded.
    const emergency = this.emergencyActive && this.abilityHeroKind === null && this.abilitySourceKind !== null;
    const r2 = range * range;
    const minR2 = this.castMinRange * this.castMinRange; // artillery deadzone (docs/TOWERS.md §deadzone); 0 ⇒ no inner cutoff
    if (emergency) {
      const focus = this.emergencyFocus(x, y, r2, minR2, n); // in-zone, in reach & outside the deadzone — nearest-core first
      if (focus.length > 0) return focus;
    }
    const out = this.targetScratch;
    out.length = 0;
    const skipFrozen = this.castExcludeFrozen; // Chrysalis Twin Cocoon (docs/STRAIN.md)
    this.grid.forNeighbors(x, y, range, (e) => {
      if (!e.alive) return;
      const de2 = dist2(x, y, e.x, e.y);
      if (de2 > r2 || de2 < minR2) return; // outside range, or inside the deadzone (minRange)
      if (e.boss !== null && e.boss.burrow > 0) return; // submerged — untargetable
      if (skipFrozen && e.statuses !== undefined && e.statuses.some((s) => s.id === 'freeze')) return;
      out.push(e);
    });
    // Last stand (docs/RANGE.md §4): an otherwise-IDLE tower during a breach extends to the nearest
    // in-zone enemy with UNLIMITED range — nothing else to shoot, so it reaches for the core's
    // attacker. A tower already engaging its own sector (out non-empty) is never pulled away.
    if (emergency && out.length === 0) {
      const focus = this.emergencyFocus(x, y, Infinity, minR2, n); // in-zone, ANY range (still outside the deadzone)
      if (focus.length > 0) return focus;
    }
    sortByProfile(out, profile, { tx: x, ty: y, goalDistance: this.goalDistance, rng: this.targetRng });
    return out.slice(0, n);
  }

  /** In-zone enemies (Final Defense Zone) this cast may focus, already sorted nearest-Hive-Core,
   *  filtered to those within `r2` (squared reach — Infinity for the unlimited last-stand reach)
   *  and outside `minR2` (squared artillery deadzone; 0 = none), capped at `n`. Skips submerged
   *  bosses. Returns a fresh slice so the shared target scratch stays free for the normal scan. */
  private emergencyFocus(x: number, y: number, r2: number, minR2: number, n: number): Enemy[] {
    const focus = this.targetScratch;
    focus.length = 0;
    for (const e of this.emergencyEnemies) {
      if (!e.alive || (e.boss !== null && e.boss.burrow > 0)) continue;
      const de2 = dist2(x, y, e.x, e.y);
      if (de2 > r2 || de2 < minR2) continue;
      focus.push(e);
      if (focus.length >= n) break;
    }
    return focus.slice(0, n);
  }

  private projectileSystem(dt: number): void {
    for (const p of this.projectiles) {
      const step = p.speed * this.megaFx.projSpeed * dt; // ×1 without a mega slow-shots field
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
      // CONTROLLER NULL WELLS (docs/BOSS-DESIGN.md §identity): a live shot crossing a well is
      // SWALLOWED — it winks out instead of landing. Counter: fire from angles the wells don't
      // cover (beams ignore them — texture, not a hard wall). Gated on wells existing ⇒ the
      // base projectile path never pays for the check (golden-safe).
      if (this.nullWells.length > 0) {
        let eaten = false;
        for (const w of this.nullWells) {
          if (dist2(p.x, p.y, w.x, w.y) <= w.r * w.r) { eaten = true; break; }
        }
        if (eaten) {
          this.spawnParticles(p.x, p.y, PARTICLE.disrupt, '#b48cff', 0.6);
          p.alive = false;
          continue;
        }
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
          // STRAIN venom marks (docs/STRAIN.md — Venom Ducts): each hit brands the host; the
          // Nth mark DETONATES for a burst scaled off this hit. Optional field ⇒ base path free.
          if (p.venom && target.alive) {
            target.venom = (target.venom ?? 0) + 1;
            if (target.venom >= p.venom.threshold) {
              target.venom = 0;
              this.applyDamage(target, p.damage * p.venom.burstFrac, p.sourceKind);
              this.spawnParticles(target.x, target.y, PARTICLE.shred, TOWER_DEFS.needle.color, 0.7);
            }
          }
          if (p.behavior === 'parasite') {
            this.infect(target, STATUS.infectionOnHit, p.sourceKind); // Viral payload (no Fracture)
          } else {
            this.addFracture(target, 1);
            this.maybeReact(target);
          }
          this.pushSfx('hit');
          if (p.skin) this.spawnBranchImpact(p.x, p.y, p.skin, p.skinTier ?? 1); // branch-flavoured landing (cosmetic; un-skinned golden shots skip it)
          if (this.events.hasListeners('projectileHit')) this.events.emit('projectileHit', { x: p.x, y: p.y, damage: p.damage, targetId: p.targetId, byTower: p.sourceKind });
          // STRAIN kill-chaining (docs/STRAIN.md §identity — Hungering Barbs): a shot that
          // KILLS leaps once to the nearest living victim (distinct from pierce, which passes
          // through regardless of the outcome).
          if (p.ricochet && !target.alive) {
            const rr = p.ricochet;
            p.ricochet = undefined; // once per shot
            let next: Enemy | null = null;
            let bd = rr.range * rr.range;
            this.grid.forNeighbors(p.x, p.y, rr.range, (o) => {
              if (!o.alive || o.id === target.id) return;
              const d2n = dist2(p.x, p.y, o.x, o.y);
              if (d2n < bd) { bd = d2n; next = o; }
            });
            if (next !== null) {
              p.targetId = (next as Enemy).id;
              p.damage *= rr.damageFrac;
              continue; // stays alive — the barb leaps instead of dying
            }
          }
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
      } else if (p.behavior === 'arc') {
        // The returning blade (docs/TOWERS.md §glaive): CARVE every unhit body within the blade's
        // reach as it passes — one cut per enemy per LEG (hitIds clears at the turnaround) — then
        // flip at the leg's end; the return leg dies back at the launch origin. No retargeting,
        // no rng: pure kinematics from the spawn params, so the flight is fully deterministic.
        const hitIds = (p.hitIds ??= []);
        const reach2 = GLAIVE.carveReach * GLAIVE.carveReach;
        let carved = false;
        this.grid.forNeighbors(p.x, p.y, GLAIVE.carveReach, (e) => {
          if (!e.alive || hitIds.includes(e.id) || dist2(p.x, p.y, e.x, e.y) > reach2) return;
          hitIds.push(e.id);
          carved = true;
          this.applyDamage(e, p.damage, p.sourceKind);
          this.addFracture(e, 1); // Kinetic identity — the cut shreds plating
          // STRAIN venom on the blade (Serrated Venom): same detonation contract as the needles.
          if (p.venom && e.alive) {
            e.venom = (e.venom ?? 0) + 1;
            if (e.venom >= p.venom.threshold) {
              e.venom = 0;
              this.applyDamage(e, p.damage * p.venom.burstFrac, p.sourceKind);
              this.spawnParticles(e.x, e.y, PARTICLE.shred, TOWER_DEFS.glaive.color, 0.7);
            }
          }
          // STRAIN concussive carve (Concussive Return): survivors are batted back up-lane.
          if (p.knockback && e.alive && !e.boss) {
            e.y = Math.max(24, e.y - p.knockback);
            if (e.sieging) { e.sieging = false; e.windup = -1; }
          }
          if (e.alive) this.maybeReact(e);
          if (p.skin) this.spawnBranchImpact(e.x, e.y, p.skin, p.skinTier ?? 1); // branch-flavoured cut (cosmetic)
        });
        if (carved) this.pushSfx('hit'); // one cue per carve tick, not per body (a lane isn't a drumroll)
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const d = Math.hypot(dx, dy);
        if (d <= step + COMBAT.projectileHitEpsilon) {
          if (p.arcReturn !== true) {
            p.arcReturn = true; // the turnaround — the blade wheels for home
            hitIds.length = 0; // the return pass cuts everyone AGAIN
            p.tx = p.arcOx ?? p.x;
            p.ty = p.arcOy ?? p.y;
          } else {
            p.alive = false; // caught back at the launch ring
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
    // STRAIN fragmentation (docs/STRAIN.md §framework): the shell splits into sub-munitions —
    // deterministic ring offsets, each a small splash of its own. Only strained shells carry
    // `fragment`, so the base path is untouched.
    if (p.fragment) {
      const f = p.fragment;
      for (let i = 0; i < f.count; i++) {
        const a = (i / f.count) * Math.PI * 2 + 0.6;
        const fx = p.x + Math.cos(a) * f.radius * 0.7;
        const fy = p.y + Math.sin(a) * f.radius * 0.7;
        const r2f = f.radius * f.radius * 0.25;
        this.grid.forNeighbors(fx, fy, f.radius * 0.5, (e) => {
          if (!e.alive) return;
          if (dist2(fx, fy, e.x, e.y) <= r2f) {
            this.applyDamage(e, p.damage * f.damageFrac, p.sourceKind);
            // STRAIN Shockbone Lattice: the shrapnel itself staggers (docs/STRAIN.md).
            if (p.fragKnockback && e.alive && !e.boss) {
              e.y = Math.max(24, e.y - p.fragKnockback);
              if (e.sieging) {
                e.sieging = false;
                e.windup = -1;
              }
            }
          }
        });
        this.spawnParticles(fx, fy, PARTICLE.breach, TOWER_DEFS.mortar.color, 0.5);
      }
    }
    if (p.skin) this.spawnBranchImpact(p.x, p.y, p.skin, p.skinTier ?? 1); // siege fireball / acid splash, by branch+tier
    if (this.events.hasListeners('projectileHit')) this.events.emit('projectileHit', { x: p.x, y: p.y, damage: p.damage, targetId: -1, byTower: p.sourceKind });
    const r2 = p.splash * p.splash;
    this.grid.forNeighbors(p.x, p.y, p.splash, (e) => {
      if (!e.alive) return;
      if (dist2(p.x, p.y, e.x, e.y) <= r2) {
        this.applyDamage(e, p.damage, p.sourceKind);
        e.corrosion = STATUS.corrosionDuration;
        if (this.mods.mortarAppliesFracture) this.addFracture(e, 1);
        this.maybeReact(e);
        // STRAIN concussive stagger (docs/STRAIN.md §identity — Concussive Marrow): the blast
        // hurls survivors back UP-LANE — displacement no other system grants. Bosses hold
        // their ground; a knocked attacker loses its crust lock and must re-approach.
        if (p.knockback && e.alive && !e.boss) {
          e.y = Math.max(24, e.y - p.knockback);
          if (e.sieging) {
            e.sieging = false;
            e.windup = -1;
          }
        }
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

  /** Drop a lingering Corrosion pool at (x,y) — the `pool` ability primitive (Vitriol's
   *  Corrosive Cataclysm; future Caustic content). Hero/ability-sourced, so sourceKind is null
   *  (no tower-mastery credit). The pool system ticks its dps + applies Corrosion each frame. */
  private spawnCorrosionPool(x: number, y: number, radius: number, dps: number, seconds: number): void {
    this.pools.push({ id: this.nextId++, x, y, radius, dps, remaining: seconds, sourceKind: null });
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
        // STRAIN Neural Infestation (docs/STRAIN.md): at FULL infection the parasite seizes the
        // host once — the body stops obeying. Latched per enemy; empty kit ⇒ no-op.
        const seize = this.parasiteKit.infectionSeize;
        if (seize !== undefined && !e.seized && e.infection >= STATUS.infectionMaxStacks - 1e-9) {
          e.seized = true;
          if (this.applyEffect(e, 'stun')) {
            const stn = e.statuses?.find((x) => x.id === 'stun');
            if (stn) stn.remaining = seize.stunSeconds;
          }
          this.spawnParticles(e.x, e.y, PARTICLE.mutate, TOWER_DEFS.parasite.color, 0.9);
        }
        this.applyInfectionDamage(e, e.infection * STATUS.infectionDpsPerStack * this.mods.parasiteInfectionMult * dt);
      }
      if (e.disrupt > 0) e.disrupt = Math.max(0, e.disrupt - dt); // Neural slow + vulnerability decays
      if (e.hasteT !== undefined && e.hasteT > 0) e.hasteT = Math.max(0, e.hasteT - dt); // warcry surge fades
      // Universal status framework: tick any generic effects (burn/poison/regen/…) and
      // apply this tick's deltas. Inert on the historical path (no framework statuses).
      // DoT is applied precisely (no per-tick floor) and scaled by vulnerability.
      if (e.statuses !== undefined && e.statuses.length > 0) {
        // STRAIN Living Amber (docs/STRAIN.md — chrysalis V): encased victims are SIPHONED.
        // Gated on the kit AND an active freeze — zero work on every other path.
        const siph = this.chrysalisKit.amberSiphon;
        if (siph !== undefined && e.statuses.some((s) => s.id === 'freeze' && s.stacks > 0)) {
          this.applyDamage(e, siph.dps * dt, 'chrysalis', false);
        }
        const fx = tickStatuses(e.statuses, dt);
        const dmg = (fx.dotDamage + fx.trueDamage) * this.vulnMult(e);
        if (dmg > 0) {
          e.hp -= dmg;
          e.dmgAccum += dmg;
          this.statDamageDealt += dmg;
        }
        if (fx.heal > 0) e.hp = Math.min(e.maxHp, e.hp + fx.heal);
        // On-break verbs (docs/STRAIN.md): a casing or panic ENDING is itself an event.
        if (fx.expired !== undefined) {
          for (const id of fx.expired) {
            if (id === 'freeze') this.onCasingBreak(e);
            else if (id === 'fear') this.onPanicFade(e);
          }
        }
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
      const def = ENEMY_DEFS[e.kind];
      // Status fold FIRST — the melee attack loop, the artillery battery and movement all obey
      // the SAME control effects (docs/HIVE-SIEGE.md §status): stun interrupts, slow stretches.
      // Corrosion and Disruption both slow; take the stronger, capped at 0.85.
      let slow = 0;
      if (e.corrosion > 0) slow = slowBase;
      if (e.disrupt > 0) slow = Math.max(slow, STATUS.disruptSlow + this.mods.obeliskSlowBonus);
      let disabled = false;
      let fleeing = false;
      let hardStop = false;
      if (e.statuses !== undefined && e.statuses.length > 0) {
        const ag = aggregateStatuses(e.statuses); // framework Slow/Freeze/Stun fold in here
        slow = Math.max(slow, ag.slowPct);
        disabled = ag.disabled;
        fleeing = ag.fleeing;
        hardStop = ag.hardStop;
      }
      if (slow > 0.85) slow = 0.85;
      if (hardStop) slow = 1; // hard control (Stun/Freeze) pins the body; Fear keeps it RUNNING
      // JUGGERNAUT UNSTOPPABLE window (docs/BOSS-DESIGN.md §identity): the march shrugs every
      // slow, stun and interrupt — the counter is TIMING damage, not control. Null boss ⇒ no-op.
      if (e.boss !== null && e.boss.unstop > 0) { slow = 0; hardStop = false; disabled = false; }
      // SIEGING (docs/HIVE-SIEGE.md): the Hive Core is the target. Hold the crust ring, spread
      // along it, and run the attack loop until killed — enemies never despawn at a line.
      if (e.sieging) {
        if (fleeing && !hardStop) {
          // Fear (docs/HIVE-SIEGE.md §status): the attacker breaks off the crust and scatters.
          // It falls through to the normal move step, whose flee branch carries it up-lane;
          // when the panic fades it converges and re-sieges through the standard arrival path.
          e.sieging = false;
          e.windup = -1;
        } else {
          this.siegeCrustTick(e, def, dt);
          this.siegeAttackTick(e, def, dt, slow, disabled);
          continue;
        }
      }
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
          // Same combat framework as the melee loop (docs/HIVE-SIEGE.md §ranged): hard
          // control pauses the battery, slows stretch its cadence — no special-case rules.
          e.siegeCd = (e.siegeCd ?? def.siege.interval) - (disabled ? 0 : dt * (1 - slow));
          if (e.siegeCd <= 0) {
            e.siegeCd = def.siege.interval;
            // Launch a VISIBLE shell (docs/ENEMIES.md §artillery) — damage lands on IMPACT,
            // so the bombardment reads as a dodgeable arc instead of an invisible tax.
            // (Flawless-run tracking happens at impact — see enemyShellSystem.)
            const dist = Math.hypot(nucleusPoint.x - e.x, nucleusPoint.y - e.y);
            this.enemyShells.push({
              x: e.x, y: e.y, targetX: nucleusPoint.x, targetY: nucleusPoint.y,
              t: 0, duration: Math.max(0.5, dist / 260), damage: def.siege.damage, color: def.color, src: e.kind,
            });
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
      if (b.flying === true && this.firstFlierAt < 0) { this.firstFlierAt = this.time; this.firstFlierWave = this.waveIndex; } // debrief ledger (observation only)
      // A burrowed boss is beneath the field: no movement, no contact, no attacks.
      if (e.boss !== null && e.boss.burrow > 0) { e.windup = -1; continue; }
      // Boss charger: a telegraphed dash multiplies movement this tick (null boss ⇒ ×1 ⇒ golden-safe).
      const chargeMult = e.boss && e.boss.charge > 0 ? BOSS.chargeSpeedMult : 1;
      // BRUISER WARCRY haste (docs/BOSS-DESIGN.md §identity): a timed pack-wide surge. Undefined
      // on every enemy the cry never touched ⇒ ×1 ⇒ golden-safe.
      const haste = e.hasteT !== undefined && e.hasteT > 0 ? e.hasteMult ?? 1 : 1;
      // GAIT (docs/ENEMIES.md §gaits): the kind's LOCOMOTION pattern over the steering blend.
      // Bosses keep their own identity verbs (charge/burrow) — never a gait. The PULSE is a
      // deterministic duty-cycle (lunges / skitters / pounces), phased off the body id so a
      // brood never moves in lockstep; authored to average ×1, so the arrival clock holds.
      const gait = e.boss === null ? b.gait : undefined;
      let gaitMult = 1;
      if (gait?.pulse !== undefined) {
        const gp = gait.pulse;
        gaitMult = ((this.time + e.id * 0.618034) / gp.period) % 1 < gp.duty ? gp.burst : gp.rest;
      }
      // Biome hazard speed pulse (e.g. Firestorm) — transient, on top of the speed baked at spawn.
      // 1 when no hazard is active / Stage mode ⇒ golden-safe.
      const step = e.speed * gaitMult * chargeMult * haste * this.biomeHazardEnemySpeed() * this.megaFx.enemyHaste * (1 - slow) * dt;

      // 1. seek
      let vx: number;
      let vy: number;
      if (fleeing && !hardStop) {
        // Panic (status.ts `flees`): scramble AWAY from the Core at reduced coordination.
        const fx = e.x - nucleusPoint.x;
        const fy = e.y - REACH_Y;
        const fl = Math.hypot(fx, fy) || 1;
        vx = (fx / fl) * b.seek * 0.7;
        vy = (fy / fl) * b.seek * 0.7;
      } else if (b.flying || b.burrowing || e.y >= HIVE.convergeY) {
        // Final approach (docs/HIVE-SIEGE.md §movement): below the Final Defense line every
        // enemy leaves the lane field and converges on the Core ITSELF — the crust forms
        // around the organism, not along an invisible finish line.
        const dx = nucleusPoint.x - e.x;
        const dy = REACH_Y - e.y;
        const l = Math.hypot(dx, dy) || 1;
        vx = (dx / l) * b.seek;
        vy = (dy / l) * b.seek;
      } else {
        const dir = this.nav.flowDirAt(e.x, e.y);
        vx = dir.x * b.seek;
        vy = dir.y * b.seek;
      }

      // 1b. GAIT flank (§gaits): above `untilY` the body pulls toward its side lane — id
      // parity splits a brood across both flanks — so it RUNS THE EDGES, then cuts in.
      if (gait?.flank !== undefined && e.y < gait.flank.untilY && !fleeing) {
        const lane = (e.id & 1) === 0 ? WIDTH * 0.12 : WIDTH * 0.88;
        vx += (lane > e.x ? 1 : -1) * gait.flank.pull;
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

      // 6. GAIT weave (§gaits): a coherent PERPENDICULAR sinusoid on the blended heading —
      // jitter scrambles, weave SNAKES (slithers, banks, wisp-swirls). Deterministic phase.
      if (gait?.weave !== undefined) {
        const gw = gait.weave;
        const ol = Math.hypot(vx, vy) || 1;
        const w = Math.sin(this.time * gw.freq + e.id * 1.732051) * gw.amp;
        const ox = vx / ol;
        vx += (-vy / ol) * w;
        vy += ox * w;
      }

      const vl = Math.hypot(vx, vy) || 1;
      e.x += (vx / vl) * step;
      e.y += (vy / vl) * step;

      // Stay inside the arena horizontally.
      const r = def.radius;
      if (e.x < r) e.x = r;
      else if (e.x > WIDTH - r) e.x = WIDTH - r;
      if (e.y > REACH_Y) e.y = REACH_Y; // never past the Core line — there is nothing beyond it
      // ── ARRIVAL (docs/HIVE-SIEGE.md §movement): lock onto the crust — ring chosen by current
      //    attacker pressure so late arrivals surround the crowd instead of clipping into it.
      //    A deterministic id-hash stagger keeps a simultaneous wave from attacking in lockstep.
      let ring = 0;
      let cum = HIVE.ringCapacity;
      while (this.hiveAttackers >= cum && ring < HIVE.maxRings - 1) {
        ring++;
        cum += HIVE.ringCapacity + ring * HIVE.ringGrowth; // outer rings hold more (longer arcs)
      }
      const rd = HIVE.coreRadius + def.radius + HIVE.contactPad + ring * HIVE.ringGap;
      if (dist2(e.x, e.y, nucleusPoint.x, nucleusPoint.y) <= rd * rd) {
        e.sieging = true;
        e.ring = ring;
        e.windup = -1;
        e.attackCd = (e.id % 7) * 0.09;
        this.hiveAttackers++; // count it NOW so same-tick arrivals stack outward deterministically
      }
    }
  }

  /** Crust hold (docs/HIVE-SIEGE.md §positioning): a sieging enemy stops advancing and holds
   *  its attack ring. Neighbor separation still pushes it, then it re-projects onto the ring —
   *  so the crust SLIDES APART along its arc instead of stacking, with no slot bookkeeping,
   *  no deadlocks and zero allocation (same grid scratch the move loop uses). */
  private siegeCrustTick(e: Enemy, def: EnemyDef, dt: number): void {
    const near = this.neighborScratch;
    this.grid.queryInto(e.x, e.y, MOVE.separationRadius, near);
    const sepR = MOVE.separationRadius;
    const sepR2 = sepR * sepR;
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
      e.x += (sx / sl) * HIVE.crustSeparation * dt;
      e.y += (sy / sl) * HIVE.crustSeparation * dt;
    }
    // Re-project onto the ring: the bite stays locked to the Core's surface.
    const rd = HIVE.coreRadius + def.radius + HIVE.contactPad + e.ring * HIVE.ringGap;
    const dx = e.x - nucleusPoint.x;
    const dy = e.y - nucleusPoint.y;
    const d = Math.hypot(dx, dy) || 1;
    e.x = nucleusPoint.x + (dx / d) * rd;
    e.y = nucleusPoint.y + (dy / d) * rd;
    const r = def.radius;
    if (e.x < r) e.x = r;
    else if (e.x > WIDTH - r) e.x = WIDTH - r;
    if (e.y > REACH_Y) e.y = REACH_Y;
  }

  /** The Hive attack loop (docs/HIVE-SIEGE.md §attack-loop): cooldown → windup → DAMAGE EVENT →
   *  recovery, repeating until the attacker dies. Stun/Freeze INTERRUPTS the swing (windup is
   *  lost); slows stretch both timers. Suicide kinds run the same loop once — their windup is
   *  the fuse and the damage event is `detonate`. */
  private siegeAttackTick(e: Enemy, def: EnemyDef, dt: number, slow: number, disabled: boolean): void {
    if (disabled) {
      e.windup = -1; // hard control interrupts the attack — the swing is lost, not banked
      return;
    }
    const rate = 1 - slow;
    if (e.windup >= 0) {
      e.windup -= dt * rate;
      if (e.windup <= 0) {
        e.windup = -1;
        if (def.explodeDamage) {
          this.detonate(e, def);
          return;
        }
        this.hiveStrike(e);
        // `interval` is the FULL start-to-start cycle (recovery = interval − windup), so an
        // attacker's sustained DPS is exactly damage/interval — the number the HUD estimates.
        e.attackCd = Math.max(0.05, e.attackInterval - e.attackWindup);
      }
    } else {
      e.attackCd -= dt * rate;
      if (e.attackCd <= 0) e.windup = e.attackWindup;
    }
  }

  /** One landed hit on the Hive Core — THE damage event. Integrity, the recent-damage window
   *  and the render pulse move together; the float is AGGREGATED (one readable total per beat)
   *  so a hundred attackers read as pressure, not confetti. */
  private hiveStrike(e: Enemy): void {
    if (!this.god) {
      const dmg = this.braceHiveDamage(Math.round(e.damage * this.bossPhaseDamageMult(e))); // Infinite breach ceiling (identity elsewhere)
      this.integrity -= dmg;
      this.statIntegrityLost += dmg; // flawless-run tracking (regen can't redeem it)
      this.noteHiveDamage(e.boss ? `boss:${e.boss.name}` : e.kind, dmg);
      this.hiveRecentDamage += e.damage;
      this.hiveHitPulse = Math.min(1, this.hiveHitPulse + 0.25 + e.damage * 0.012);
    }
    this.pushSfx('hiveHit');
    if (this.relicHooks.length) this.fireRelicHooks('nucleusHit', null, e.x, e.y); // rule genes — the attacker is IN the burst
    // Impact FX at the bite point on the Core's surface (toward the attacker).
    const dx = e.x - nucleusPoint.x;
    const dy = e.y - nucleusPoint.y;
    const d = Math.hypot(dx, dy) || 1;
    this.spawnParticles(nucleusPoint.x + (dx / d) * HIVE.coreRadius, nucleusPoint.y + (dy / d) * HIVE.coreRadius, PARTICLE.breach);
    this.hiveFloatAccum += e.damage;
    if (this.hiveFloatTimer <= 0 && this.hiveFloatAccum >= 1) {
      this.floats.push({ x: nucleusPoint.x, y: nucleusPoint.y - 16, text: `-${Math.round(this.hiveFloatAccum)}`, color: '#ff5d73', life: 0.8 });
      this.hiveFloatAccum = 0;
      this.hiveFloatTimer = 0.6;
    }
  }

  /** Defeat-debrief ledger (RunStats.hiveDamageBy): observation only — never read by the sim. */
  private noteHiveDamage(key: string, dmg: number): void {
    if (dmg > 0) this.statHiveDamageBy[key] = (this.statHiveDamageBy[key] ?? 0) + dmg;
  }

  /** Suicide detonation at the Core (docs/HIVE-SIEGE.md §suicide): one burst — integrity + a
   *  hero-catching blast — then the attacker is GONE (no lingering melee). Mirrors the manual
   *  bookkeeping the old breach removal did, since this bypasses an hp-death. */
  private detonate(e: Enemy, def: EnemyDef): void {
    if (!e.alive) return;
    if (!this.god) {
      const dmg = this.braceHiveDamage(Math.round(e.damage * this.bossPhaseDamageMult(e))); // Infinite breach ceiling (identity elsewhere)
      this.integrity -= dmg;
      this.statIntegrityLost += dmg; // flawless-run tracking (regen can't redeem it)
      this.noteHiveDamage(e.boss ? `boss:${e.boss.name}` : e.kind, dmg);
      this.hiveRecentDamage += e.damage;
      this.hiveHitPulse = Math.min(1, this.hiveHitPulse + 0.4 + e.damage * 0.012);
    }
    e.alive = false;
    e.sieging = false;
    if (e.boss) this.bossCount = Math.max(0, this.bossCount - 1);
    this.armorBreakUntil.delete(e.id);
    if (this.relicHooks.length) this.fireRelicHooks('nucleusHit', null, e.x, e.y); // rule genes (docs/CARDS.md §rules)
    this.pushSfx('breach');
    if (!e.boss) this.pushSfx('edie_pop'); // the suicide's own volatile burst, under the Core-breach
    this.spawnParticles(e.x, e.y, PARTICLE.breach);
    this.floats.push({ x: nucleusPoint.x, y: nucleusPoint.y - 14, text: `-${e.damage}`, color: '#ff5d73', life: 0.9 });
    // The blast also catches the hero (gated on `explodeRadius` — unset on the historical roster).
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
      if (id.passive.kind === 'vulnField') m += (id.passive.amount + Math.min(id.scaling.cap, this.waveIndex * id.scaling.perStack)) * (this.symbioteOf(h)?.auraMult ?? 1);
    }
    return m;
  }

  /** Vitriol Solvent Rounds + Saturation: CORRODED enemies take extra damage, deepening with depth.
   *  Summed over the roster; 0 unless a Vitriol is fielded ⇒ golden-safe (no causticVuln hero in
   *  Stage autoplay, so a corroded enemy's damage taken is unchanged there). */
  private heroCorrosionVulnBonus(): number {
    let m = 0;
    for (const h of this.heroes) {
      const id = this.idOf(h);
      if (id.passive.kind === 'causticVuln') m += (id.passive.amount + Math.min(id.scaling.cap, this.waveIndex * id.scaling.perStack)) * (this.symbioteOf(h)?.auraMult ?? 1);
    }
    return m;
  }

  /** Revenant Virulent Presence + Virulence: INFECTED enemies take extra damage, deepening with depth.
   *  Summed over the roster; 0 unless a Revenant (viralVuln passive) is fielded ⇒ golden-safe (no such
   *  hero in Stage autoplay, so an infected enemy's damage taken is unchanged there). */
  private heroInfectionVulnBonus(): number {
    let m = 0;
    for (const h of this.heroes) {
      const id = this.idOf(h);
      if (id.passive.kind === 'viralVuln') m += (id.passive.amount + Math.min(id.scaling.cap, this.waveIndex * id.scaling.perStack)) * (this.symbioteOf(h)?.auraMult ?? 1);
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
        this.healHeroBy(h, h.maxHp * 0.12); // Bloodthirst heal (Regeneration scales it)
        h.rushUntil = this.time + 3; // brief mobility surge
      }
    }
  }

  private heroSystem(dt: number): void {
    if (this.gravebindHero !== null && this.raiseCd > 0) this.raiseCd -= dt; // Gravebind cadence (gated ⇒ golden-inert)
    for (const h of this.heroes) this.updateHero(h, dt);
    // The non-primary roster (slots 2+) is fully AUTONOMOUS — it auto-casts its signature ability on
    // cooldown; the primary (slot 1) stays PLAYER-triggered. The loop is empty for a single-hero run
    // ⇒ it never executes ⇒ byte-identical golden run.
    for (let i = 1; i < this.heroes.length; i++) this.autoCastHero(this.heroes[i]);
    // Primary hero (slot 1): AUTO-CAST only when the player has bought AND enabled it — same
    // decision + code path as the autonomous roster. Off by default ⇒ byte-identical golden run.
    if (this.autocastOn && this.heroes.length > 0) this.autoCastHero(this.heroes[0]);
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
      const gd = this.nav.goalDistanceAt(e.x, e.y);
      if (gd < best) { best = gd; target = e; }
    }
    if (target) this.castHeroAbility(h, target.x, target.y);
    else if (def.behavior === 'guard') this.castHeroAbility(h, h.x, h.y); // support self-casts (heal / shield / mend)
  }

  /** The star-gated ability KIT (HEROES.md) — each UNLOCKED skill auto-casts on its own cooldown, so a
   *  progressed hero fights with a full kit (auto-attack + skills + ult), not one verb. Zero unlocked
   *  skills ⇒ this returns immediately, so a fresh account (the golden run) never casts one. */
  private updateHeroSkills(h: Hero, dt: number): void {
    if (h.down) return;
    const n = this.heroProgress[h.kind].skillCount ?? 0;
    if (n === 0) return;
    const defs = this.heroAbilityKits[h.kind]?.skills ?? HERO_SKILL_DEFS[h.kind]; // fork-resolved skill defs (else base)
    if (defs.length === 0) return;
    if (h.skillCd === undefined) h.skillCd = new Array(defs.length).fill(0) as number[];
    const def = HERO_DEFS[h.kind];
    for (let i = 0; i < n && i < defs.length; i++) {
      if (h.skillCd[i] > 0) { h.skillCd[i] -= dt; continue; }
      const sk = defs[i];
      let px = h.x;
      let py = h.y;
      if ((sk.castOn ?? 'target') === 'target') {
        // Aim at the deepest enemy in aggro range (the same target sense as the auto-cast ult).
        const r2 = (def.aggroRange * this.hmods(h).heroAggroRangeMult) ** 2;
        let target: Enemy | null = null;
        let best = Infinity;
        for (const e of this.enemies) {
          if (!e.alive || dist2(h.x, h.y, e.x, e.y) > r2) continue;
          const gd = this.nav.goalDistanceAt(e.x, e.y);
          if (gd < best) { best = gd; target = e; }
        }
        if (target === null) continue; // nothing to hit — hold (no cooldown paid until it fires)
        px = target.x;
        py = target.y;
      }
      // Don't waste an AoE skill on an empty zone; self-cast utility (Graft/Flock) sets minEnemies 0.
      const need = sk.minEnemies ?? 1;
      if (need > 0) {
        const rr = Math.max(48, sk.radius) ** 2;
        let near = 0;
        for (const e of this.enemies) if (e.alive && dist2(px, py, e.x, e.y) <= rr && ++near >= need) break;
        if (near < need) continue;
      }
      this.castHeroSkill(h, i, px, py, sk);
    }
  }

  /** Fire one kit skill: reuse the ult's effect pipeline with the skill's compiled components. Unlike
   *  the ult it does NOT reposition the hero — the skill fires from where it stands, at the aim point. */
  private castHeroSkill(h: Hero, i: number, px: number, py: number, sk: HeroAbilityDef): void {
    this.abilitySourceKind = null;
    this.abilityHeroKind = h.kind;
    this.abilityCaster = h;
    this.castScratch.x = px;
    this.castScratch.y = py;
    this.castScratch.damageMult = this.heroDamageMult(h); // no crit roll — the auto-cast kit stays rng-free
    this.castScratch.target = null;
    this.castScratch.pierce = 0;
    this.castRangeMult = this.heroAbilityRadiusFor(h);
    const comps = this.heroAbilityKits[h.kind]?.skillComps[i] ?? HERO_SKILLS[h.kind][i];
    const delay = sk.cinematic?.impactDelay ?? 0;
    if (delay > 0) {
      // Cinematic cast (docs/HERO-CINEMATICS.md): support components fire NOW; the zone payload
      // (damage/debuff/pool) lands when the performance strikes, `delay` seconds out.
      const instant = comps.filter((c) => !IMPACT_COMP_TYPES.has(c.type));
      if (instant.length > 0) runAbilities(this.actx, instant, this.castScratch);
      this.queueImpact(h, sk, comps, px, py, delay);
    } else {
      runAbilities(this.actx, comps, this.castScratch);
    }
    this.pushCastEvent(h, sk, i as 0 | 1, px, py, h.x, h.y);
    this.castRangeMult = 1;
    if (delay === 0 && sk.particle) this.spawnParticles(px, py, PARTICLE[sk.particle], sk.fxColor); // the skill's unique cast VFX (fork-recoloured); a delayed payload bursts on LANDING instead
    (h.skillCd as number[])[i] = sk.cooldown * this.heroProgress[h.kind].cooldownMult; // stars/gear shave skill cds too
    if (this.relicHooks.length) this.fireRelicHooks('abilityCast', null, px, py);
    this.pushSfx('ability');
    this.floats.push({ x: px, y: py - 18, text: sk.name, color: HERO_DEFS[h.kind].color, life: 0.7 });
  }

  /** Autonomous battlefield unit. Shared lifecycle (respawn, cooldowns, usage
   * accrual, contact damage); the per-behavior brain — move + target + act — is
   * dispatched by the hero's data-driven profile so each plays completely
   * differently: a dive bruiser, a guarding sustainer, a floating controller. */
  private updateHero(h: Hero, dt: number): void {
    const def = HERO_DEFS[h.kind];
    if (h.down) {
      h.moveState = 'downed';
      h.targetId = -1;
      // Symbiote cocoon (docs/HERO-SYMBIOTES.md): a reviveSpeedMult organ reknits the host faster. ×1 without one.
      h.respawn -= dt * (this.symbioteOf(h)?.reviveSpeedMult ?? 1);
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
    // Symbiote ECHO (docs/HERO-SYMBIOTES.md): the pending re-cast fires shortly after the ability.
    // Only an echo organ ever schedules it (castHeroAbility) ⇒ golden-safe.
    if (h.echoT !== undefined) {
      h.echoT -= dt;
      if (h.echoT <= 0) {
        h.echoT = undefined;
        this.castHeroEcho(h);
      }
    }
    this.updateHeroSkills(h, dt); // star-gated ability kit (auto-casts on cooldown). No-op at 0 skills ⇒ golden-safe.
    if (h.shieldTime > 0) {
      h.shieldTime -= dt;
      if (h.shieldTime <= 0) { h.shieldTime = 0; h.shield = 0; } // window lapsed → drop the pool
    }

    // Threat-aware survival (docs/HERO-FRAMEWORK.md §3): cautious/evasive heroes disengage toward the
    // nucleus at low HP; the Ravager's `aggressive` profile contributes 0 (its recklessness is a
    // designed weakness), so the golden autoplay hero never retreats ⇒ byte-identical. Equipment's
    // "wary" threshold layers on top (max).
    // Symbiote adaptive AI (docs/HERO-SYMBIOTES.md): a survival organ rewires the host's innate
    // profile (aggressive/cautious/evasive). Absent ⇒ the identity's own (golden-safe).
    const survival = this.symbioteOf(h)?.survival ?? this.idOf(h).survival;
    const innateRetreat = survival === 'evasive' ? 0.4 : survival === 'cautious' ? 0.3 : 0;
    const retreatAt = Math.max(this.hmods(h).heroRetreatThreshold, innateRetreat);
    if (retreatAt > 0 && h.hp < h.maxHp * retreatAt) {
      h.moveState = 'retreating';
      h.targetId = -1;
      const np = moveToward(h.x, h.y, nucleusPoint.x, nucleusPoint.y, this.heroSpeed(h) * dt);
      h.x = Math.max(0, Math.min(WIDTH, np.x));
      h.y = Math.max(0, Math.min(HEIGHT, np.y));
    } else if (!this.heroMegaRaid(h, def, dt)) {
      // MEGA raid duty owns the tick when the line is clear (seek + strike the organism —
      // docs/MEGA-BOSS.md §targeting); otherwise the identity behaviors run as ever.
      switch (def.behavior) {
        case 'dive': this.updateDiveHero(h, def, dt); break;
        case 'guard': this.updateGuardHero(h, def, dt); break;
        case 'control': this.updateControlHero(h, def, dt); break;
        case 'siege': this.updateSiegeHero(h, def, dt); break;
        case 'phase': this.updatePhaseHero(h, def, dt); break;
        case 'swoop': this.updateSwoopHero(h, def, dt); break;
      }
    }

    this.heroContactDamage(h, def, dt);
    if (this.mods.heroCorrosionAura) this.heroCorrosionField(h); // Toxic Aura (gene card)
  }

  /** Toxic Aura (gene card) — the hero passively drenches nearby enemies in Corrosion, which can
   *  SHRED (the Corrosion→Fracture reaction) via maybeReact. Gated on the mod ⇒ off on the golden
   *  path (autoplay never drafts it), and a no-op with no enemies in range. */
  private heroCorrosionField(h: Hero): void {
    if (h.down) return;
    const near = this.neighborScratch;
    this.grid.queryInto(h.x, h.y, HERO_CORROSION_RANGE, near);
    for (let k = 0; k < near.length; k++) {
      const e = near[k];
      if (!e.alive || dist(h.x, h.y, e.x, e.y) > HERO_CORROSION_RANGE) continue;
      e.corrosion = STATUS.corrosionDuration;
      this.maybeReact(e);
    }
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
      const gd = this.nav.goalDistanceAt(e.x, e.y);
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
    h.targetId = target ? target.id : -1;

    const goal = target ? { x: target.x, y: target.y } : this.heroIdleGoal(h); // anchor (equipment)
    // Bloodthirst: a brief speed surge after an elite kill (×1 otherwise ⇒ golden-safe). MOBILITY gear rides on top.
    const moveSpeed = this.heroSpeed(h) * (this.time < h.rushUntil ? 1.4 : 1);
    const np = moveToward(h.x, h.y, goal.x, goal.y, moveSpeed * dt);
    h.x = Math.max(0, Math.min(WIDTH, np.x));
    h.y = Math.max(0, Math.min(HEIGHT, np.y));
    h.moveState = !target ? 'idle' : dist(h.x, h.y, target.x, target.y) <= def.attackRange ? 'attacking' : 'moving';

    if (target && h.attackCd <= 0 && dist(h.x, h.y, target.x, target.y) <= def.attackRange) {
      const crit = this.rollHeroCrit(h); // Precision/Savagery — gated so no-crit runs spend no rng
      const dmg = def.attackDamage * this.heroDamageMult(h) * this.heroEliteDamage(h, target) * crit.mult;
      const applied = this.applyDamage(target, dmg);
      if (crit.crit) { this.pushSfx('crit'); this.floats.push({ x: target.x, y: target.y - 16, text: `${Math.round(applied)}!`, color: '#ffcf5a', life: 0.7, kind: 'crit' }); } // crit damage number + a soft, rate-limited ching
      this.heroMasteryAccrual[h.kind].damage += applied;
      this.heroLifesteal(h, applied); // weapon: sustain through attacking (no-op at 0)
      if (target.hp <= 0) target.lastHitHero = h.kind; // killing blow — kill credit + symbiote kill verbs
      this.addFracture(target, def.attackFracture);
      // Weapon grant: the hero's hits also apply granted statuses (no-op without such gear).
      for (const s of this.hstatuses(h)) this.applyStatus(target, { kind: s.status, amount: s.amount });
      this.maybeReact(target);
      this.runHeroAttackKit(h, target); // weapon: cleave/chain/AoE/status/crit RE-AUTHOR the attack
      h.attackCd = def.attackInterval / this.heroHaste(h);
    }
  }

  /** Heal the hero by a fraction of damage it dealt (lifesteal weapons). No-op at 0 (golden-safe). */
  private heroLifesteal(h: Hero, applied: number): void {
    if (this.hmods(h).heroLifestealFrac <= 0 || h.down) return;
    this.healHeroBy(h, applied * this.hmods(h).heroLifestealFrac); // Regeneration scales lifesteal healing
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
    this.castScratch.damageMult = this.heroDamageMult(h) * this.heroEliteDamage(h, target);
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
      const gd = this.nav.goalDistanceAt(e.x, e.y);
      if (gd < best) {
        best = gd;
        threat = e;
      }
    }
    if (threat) {
      gx = threat.x;
      gy = Math.max(DEFENSE_TOP_Y, threat.y - CELL);
    }
    h.targetId = threat ? threat.id : -1;
    h.moveState = threat ? 'attacking' : 'idle'; // holds the zone; engages the deepest incursion
    const np = moveToward(h.x, h.y, gx, gy, this.heroSpeed(h) * dt);
    h.x = Math.max(0, Math.min(WIDTH, np.x));
    h.y = Math.max(DEFENSE_TOP_Y - CELL, Math.min(HEIGHT, np.y)); // stays in/near the zone
    if (def.pulseInterval > 0 && h.pulseCd <= 0) {
      this.heroPulse(h);
      h.pulseCd = def.pulseInterval / this.heroHaste(h); // Frenzy speeds the role pulse too
    }
  }

  /**
   * OVERSEER (Neural control). Floats to the densest knot of enemies to blanket the
   * most bodies in its Disruption field (slow + vulnerability). Deals ~no damage —
   * its value is amplifying everything else that hits the crowd it has marked.
   */
  private updateControlHero(h: Hero, def: HeroDef, dt: number): void {
    const hot = this.densestCluster(def.pulseRadius);
    h.targetId = -1; // control blankets a CLUSTER, not a single target
    h.moveState = hot ? 'moving' : 'idle';
    let gx = nucleusPoint.x;
    let gy = DEFENSE_TOP_Y;
    if (hot) {
      gx = hot.x;
      gy = Math.max(DEFENSE_TOP_Y - CELL * 3, hot.y); // hover over the crowd, not the spawn
    }
    const np = moveToward(h.x, h.y, gx, gy, this.heroSpeed(h) * dt);
    h.x = Math.max(0, Math.min(WIDTH, np.x));
    h.y = Math.max(0, Math.min(HEIGHT, np.y));
    if (def.pulseInterval > 0 && h.pulseCd <= 0) {
      this.heroPulse(h);
      h.pulseCd = def.pulseInterval / this.heroHaste(h); // Frenzy speeds the role pulse too
    }
  }

  /**
   * VITRIOL (Caustic siege). Holds a rear standoff line and rains corrosive artillery on the
   * deepest threat within its long bombardment range — each shell splashes, applies Corrosion,
   * and leaves a pool (area denial). Slides horizontally to keep the biggest threat lined up;
   * never advances into melee. The hive's only ranged / area-denial hero.
   */
  private updateSiegeHero(h: Hero, def: HeroDef, dt: number): void {
    const aggro2 = (def.aggroRange * this.mods.heroAggroRangeMult) ** 2;
    const range2 = def.attackRange * def.attackRange;
    let target: Enemy | null = null; // deepest enemy within firing range → the bombardment target
    let bestInRange = Infinity;
    let lineup: Enemy | null = null; // deepest enemy anywhere in aggro → drives repositioning
    let bestAny = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d2 = dist2(h.x, h.y, e.x, e.y);
      if (d2 > aggro2) continue;
      const gd = this.nav.goalDistanceAt(e.x, e.y);
      if (gd < bestAny) { bestAny = gd; lineup = e; }
      if (d2 <= range2 && gd < bestInRange) { bestInRange = gd; target = e; }
    }

    // Hold a rear standoff line (protected, long sightlines up-field); slide X to line up the
    // biggest threat, or drift to the idle anchor when the field is clear.
    const standY = DEFENSE_TOP_Y + CELL * 2;
    const goalX = lineup ? lineup.x : this.heroIdleGoal(h).x;
    const np = moveToward(h.x, h.y, goalX, standY, def.speed * this.mods.heroSpeedMult * dt);
    h.x = Math.max(0, Math.min(WIDTH, np.x));
    h.y = Math.max(DEFENSE_TOP_Y - CELL, Math.min(HEIGHT, np.y)); // never chases up-field

    if (target && h.attackCd <= 0) {
      this.fireSiegeShell(h, def, target);
      h.attackCd = def.attackInterval;
    }
  }

  /** Lob a corrosive siege shell at a target — a splash projectile routed through the shared
   *  mortar-impact path (splash damage + Corrosion + a Corrosion pool). Credits hero mastery at
   *  fire time (base damage) since the deferred impact carries no hero source. */
  private fireSiegeShell(h: Hero, def: HeroDef, target: Enemy): void {
    const dmg = def.attackDamage * this.mods.heroDamageMult * this.heroProgress[h.kind].damageMult;
    const splash = (def.attackSplash ?? 0) * this.mods.splashRadiusMult;
    this.spawnProjectile(h.x, h.y, target.x, target.y, def.projectileSpeed ?? 440, -1, dmg, 'splash', splash, null);
    this.heroMasteryAccrual[h.kind].damage += dmg; // usage signal (mortarImpact has no hero source)
  }

  /**
   * REVENANT (Viral phase-assassin). It does NOT walk to its prey: it BLINKS (teleports) to the
   * biggest threat — boss > elite > highest-HP within aggro — lands a heavy strike, and injects a
   * deep Infection (a ramping armor-ignoring DoT that SPREADS on the host's death). Between strikes
   * it holds, "phased". The blink is its identity: it reaches anything, anywhere, to delete ONE fat
   * target. Never fielded on the golden path (milestone-gated), so its teleport + Infection never
   * touch the pinned autoplay.
   */
  private updatePhaseHero(h: Hero, def: HeroDef, dt: number): void {
    if ((h.phaseT ?? 0) > 0) h.phaseT = Math.max(0, (h.phaseT as number) - dt); // decay the blink flash
    const aggro2 = (def.aggroRange * this.hmods(h).heroAggroRangeMult) ** 2;
    // The assassin hunts the BIGGEST threat: a boss first, then an elite, then the highest-HP body.
    let target: Enemy | null = null;
    let rank = 0; // 3 boss · 2 elite · 1 normal
    let bestHp = -Infinity;
    for (const e of this.enemies) {
      if (!e.alive || dist2(h.x, h.y, e.x, e.y) > aggro2) continue;
      const r = e.boss !== null ? 3 : e.elite ? 2 : 1;
      if (r > rank || (r === rank && e.hp > bestHp)) { rank = r; bestHp = e.hp; target = e; }
    }
    h.targetId = target ? target.id : -1;

    if (!target) {
      // Field clear: drift to the idle anchor (a normal walk — nothing to blink to).
      h.moveState = 'idle';
      const goal = this.heroIdleGoal(h);
      const np = moveToward(h.x, h.y, goal.x, goal.y, this.heroSpeed(h) * dt);
      h.x = Math.max(0, Math.min(WIDTH, np.x));
      h.y = Math.max(0, Math.min(HEIGHT, np.y));
      return;
    }

    if (h.attackCd > 0) { h.moveState = 'moving'; return; } // recovering between blinks (phased out)

    // BLINK-STRIKE: teleport just off the target (from wherever it was), then strike hard.
    const near = def.attackRange * 0.6;
    const ang = Math.atan2(h.y - target.y, h.x - target.x); // land on the side it approached from
    h.phaseFromX = h.x;
    h.phaseFromY = h.y;
    h.phaseT = HERO_PHASE_FLASH;
    h.x = Math.max(0, Math.min(WIDTH, target.x + Math.cos(ang) * near));
    h.y = Math.max(0, Math.min(HEIGHT, target.y + Math.sin(ang) * near));
    h.moveState = 'attacking';
    this.spawnParticles(h.x, h.y, PARTICLE.infect, def.color, 0.6); // a viral phase-in burst
    this.pushSfx('ability'); // a sharp phase-in cue
    // The strike: heavy single-target damage + a deep Infection injection (Plague Strike).
    const crit = this.rollHeroCrit(h);
    const dmg = def.attackDamage * this.heroDamageMult(h) * crit.mult;
    const applied = this.applyDamage(target, dmg);
    if (crit.crit) { this.pushSfx('crit'); this.floats.push({ x: target.x, y: target.y - 16, text: `${Math.round(applied)}!`, color: '#ffcf5a', life: 0.7, kind: 'crit' }); }
    this.heroMasteryAccrual[h.kind].damage += applied;
    this.heroLifesteal(h, applied);
    if (target.hp <= 0) target.lastHitHero = h.kind; // killing blow — kill credit + symbiote kill verbs
    this.infect(target, REVENANT.infectPerStrike); // deep Infection — spreads on the host's death
    for (const s of this.hstatuses(h)) this.applyStatus(target, { kind: s.status, amount: s.amount }); // weapon grants
    this.maybeReact(target);
    this.runHeroAttackKit(h, target); // weapon: cleave/chain/on-hit re-authors the strike
    h.attackCd = def.attackInterval / this.heroHaste(h);
  }

  /** The hive's SKY caste — the CINDERWYRM (Caustic strafe-flier). It never lands and never
   *  parks on a target: it flies AT the deepest threat (elites first, like the dive brain),
   *  strikes on the fly-by — Corrosion doused into the wound (WYRM.corrodePerStrike) — then
   *  BANKS THROUGH to a point past the victim before wheeling back for the next pass. The bank
   *  is what keeps it out of the scrum: it spends its recovery flying, not standing in contact.
   *  Fielded only via the unlock feat (never on a fresh account) ⇒ golden-safe. */
  private updateSwoopHero(h: Hero, def: HeroDef, dt: number): void {
    const aggro2 = (def.aggroRange * this.hmods(h).heroAggroRangeMult) ** 2;
    let target: Enemy | null = null;
    let best = Infinity;
    let elite: Enemy | null = null; // apex instinct: elites first (none in Stage ⇒ golden-parallel)
    let bestElite = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || dist2(h.x, h.y, e.x, e.y) > aggro2) continue;
      const gd = this.nav.goalDistanceAt(e.x, e.y);
      if (gd < best) { best = gd; target = e; }
      if (e.elite && gd < bestElite) { bestElite = gd; elite = e; }
    }
    target = elite ?? target;
    h.targetId = target ? target.id : -1;

    // Mid-bank: keep flying the strafe line until the bank point is reached (or the field empties).
    if (h.bankX !== undefined && h.bankY !== undefined) {
      const np = moveToward(h.x, h.y, h.bankX, h.bankY, this.heroSpeed(h) * dt);
      h.x = Math.max(0, Math.min(WIDTH, np.x));
      h.y = Math.max(0, Math.min(HEIGHT, np.y));
      h.moveState = 'moving';
      if ((h.x === h.bankX && h.y === h.bankY) || target === null) { h.bankX = undefined; h.bankY = undefined; }
      return;
    }

    if (!target) {
      // Empty sky: circle the idle anchor in a slow patrol wheel (never hovers dead-still).
      const goal = this.heroIdleGoal(h);
      const a = this.time * 0.9;
      const np = moveToward(h.x, h.y, goal.x + Math.cos(a) * 46, goal.y + Math.sin(a) * 30, this.heroSpeed(h) * dt);
      h.x = Math.max(0, Math.min(WIDTH, np.x));
      h.y = Math.max(0, Math.min(HEIGHT, np.y));
      h.moveState = 'idle';
      return;
    }

    const d = dist(h.x, h.y, target.x, target.y);
    if (d > def.attackRange || h.attackCd > 0) {
      // Closing (or recovering between passes): fly straight at the prey.
      const np = moveToward(h.x, h.y, target.x, target.y, this.heroSpeed(h) * dt);
      h.x = Math.max(0, Math.min(WIDTH, np.x));
      h.y = Math.max(0, Math.min(HEIGHT, np.y));
      h.moveState = 'moving';
      return;
    }

    // THE FLY-BY: strike, douse the wound in Corrosion, and bank THROUGH to the far side.
    h.moveState = 'attacking';
    const crit = this.rollHeroCrit(h);
    const dmg = def.attackDamage * this.heroDamageMult(h) * this.heroEliteDamage(h, target) * crit.mult;
    const applied = this.applyDamage(target, dmg);
    if (crit.crit) { this.pushSfx('crit'); this.floats.push({ x: target.x, y: target.y - 16, text: `${Math.round(applied)}!`, color: '#ffcf5a', life: 0.7, kind: 'crit' }); }
    this.heroMasteryAccrual[h.kind].damage += applied;
    this.heroLifesteal(h, applied);
    if (target.hp <= 0) target.lastHitHero = h.kind; // killing blow — kill credit + symbiote kill verbs
    this.applyStatus(target, { kind: 'Corrosion', amount: WYRM.corrodePerStrike }); // the ember wake
    for (const s of this.hstatuses(h)) this.applyStatus(target, { kind: s.status, amount: s.amount }); // weapon grants
    this.maybeReact(target);
    this.runHeroAttackKit(h, target); // weapon: cleave/chain/on-hit re-authors the strike
    this.spawnParticles(target.x, target.y, PARTICLE.acid, def.color, 0.5); // a searing pass
    h.attackCd = def.attackInterval / this.heroHaste(h);
    // Bank point: carry the strafe line PAST the victim (clamped to the arena).
    const ang = Math.atan2(target.y - h.y, target.x - h.x);
    h.bankX = Math.max(0, Math.min(WIDTH, target.x + Math.cos(ang) * WYRM.bankDist));
    h.bankY = Math.max(0, Math.min(HEIGHT, target.y + Math.sin(ang) * WYRM.bankDist));
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
    this.castScratch.damageMult = this.heroDamageMult(h); // Evolution Lethality folds in (pulse gets damage, not crit)
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
      // Carapace (Evolution) + any gear armor prevent a fraction of incoming contact damage, capped
      // well short of immunity. 0 ⇒ ×1 (golden-safe).
      const reduction = Math.min(0.85, this.hmods(h).heroArmor + this.evo.armor);
      let dmg = incoming * dt * (1 - reduction);
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
    const kit = this.heroAbilityKits[h.kind]; // fork-resolved abilities (absent ⇒ base kit)
    const ab = kit?.ult ?? def.ability;
    const fromX = h.x; // stance BEFORE the reposition — beams/lobs/lunges launch here (cast feed)
    const fromY = h.y;
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
    const crit = this.rollHeroCrit(h); // Precision/Savagery — one roll per cast (no rng at 0 chance)
    this.castScratch.damageMult = this.heroDamageMult(h) * crit.mult;
    this.castScratch.target = null;
    this.castScratch.pierce = 0;
    this.castRangeMult = this.heroAbilityRadiusFor(h); // gear × Evolution Amplitude scales the ability AoE
    const comps = kit?.ultComps ?? HERO_ULT[h.kind];
    const delay = ab.cinematic?.impactDelay ?? 0;
    if (delay > 0) {
      // Cinematic cast (docs/HERO-CINEMATICS.md): support components (heal/shield/buff/summon)
      // fire NOW; the zone payload lands when the performance strikes, `delay` seconds out.
      const instant = comps.filter((c) => !IMPACT_COMP_TYPES.has(c.type));
      if (instant.length > 0) runAbilities(this.actx, instant, this.castScratch);
      this.queueImpact(h, ab, comps, px, py, delay, true);
    } else {
      runAbilities(this.actx, comps, this.castScratch);
    }
    this.pushCastEvent(h, ab, 'ult', px, py, fromX, fromY);
    this.castRangeMult = 1;
    if (delay === 0 && ab.particle) this.spawnParticles(px, py, PARTICLE[ab.particle], ab.fxColor); // the ult's unique cast VFX (fork-recoloured); a delayed payload bursts on LANDING instead
    if (this.relicHooks.length) this.fireRelicHooks('abilityCast', null, px, py); // relic/rule hooks fire at the cast point
    h.abilityCd = this.heroAbilityCooldownFor(h);
    this.pushSfx('ability');
    if (this.events.hasListeners('heroAbilityUsed')) this.events.emit('heroAbilityUsed', { kind: h.kind }); // drives the Combat Tutorial (golden-safe: gated on a listener)
    // The name rides ABOVE the zone (the caster repositions onto its centre) — never on its body,
    // and clear of the grouped damage total the view lands mid-zone at impact.
    this.floats.push({ x: px, y: py - Math.max(64, ab.radius + 18), text: crit.crit ? `${ab.name}! ✷CRIT` : `${ab.name}!`, color: crit.crit ? '#ffcf5a' : def.color, life: 0.8, kind: crit.crit ? 'crit' : undefined });
    // Symbiote ECHO (docs/HERO-SYMBIOTES.md): an echo organ schedules a weaker answer to the cast.
    if (this.symbioteOf(h)?.abilityEchoFrac) {
      h.echoT = SYMBIOTE.echoDelay;
      h.echoX = px;
      h.echoY = py;
    }
  }

  /** Fire a scheduled symbiote ECHO — a weaker re-cast of the signature ability at the original
   *  point: no reposition, no cooldown, no relic hooks or tutorial events; damage scaled by the
   *  kit's echo fraction, footprint slightly tucked. Only an echo organ ever schedules one, and
   *  the crit roll is skipped, so a fresh run spends no rng here (golden-safe). */
  private castHeroEcho(h: Hero): void {
    const frac = this.symbioteOf(h)?.abilityEchoFrac ?? 0;
    if (h.down || frac <= 0) return;
    const def = HERO_DEFS[h.kind];
    const kit = this.heroAbilityKits[h.kind];
    const ab = kit?.ult ?? def.ability;
    const px = h.echoX ?? h.x;
    const py = h.echoY ?? h.y;
    this.abilitySourceKind = null;
    this.abilityHeroKind = h.kind;
    this.abilityCaster = h;
    this.castScratch.x = px;
    this.castScratch.y = py;
    this.castScratch.damageMult = this.heroDamageMult(h) * frac;
    this.castScratch.target = null;
    this.castScratch.pierce = 0;
    this.castRangeMult = this.heroAbilityRadiusFor(h) * 0.85; // the echo is a smaller answer
    runAbilities(this.actx, kit?.ultComps ?? HERO_ULT[h.kind], this.castScratch);
    this.pushCastEvent(h, ab, 'echo', px, py, h.x, h.y); // a diminished encore performance (delay 0)
    this.castRangeMult = 1;
    if (ab.particle) {
      const p = PARTICLE[ab.particle];
      this.spawnParticles(px, py, { ...p, count: Math.max(3, Math.floor(p.count / 2)) }, ab.fxColor);
    }
    this.floats.push({ x: px, y: py - 16, text: `${ab.name} echoes`, color: def.color, life: 0.6 });
  }

  /** Publish a cast to the presentation feed (RenderState.castEvents): the ability-cinematics
   *  layer (render/abilityCinematics.ts) seq-ingests each event exactly once and stages the
   *  performance — the DeathEvent pattern. Presentation-only; the sim never reads it back.
   *  Call while castRangeMult is still armed (the zone radius resolves through it). */
  private pushCastEvent(h: Hero, ab: HeroAbilityDef, slot: CastEvent['slot'], px: number, py: number, fromX: number, fromY: number): void {
    const cine = ab.cinematic;
    if (!cine) return;
    this.castEvents.push({
      seq: this.castSeq++,
      hero: h.kind,
      name: ab.name,
      slot,
      x: px,
      y: py,
      fromX,
      fromY,
      radius: Math.max(ab.radius, ab.poolRadius ?? 0) * this.castRangeMult,
      color: ab.fxColor ?? HERO_DEFS[h.kind].color,
      actor: cine.actor,
      motion: cine.motion,
      delay: slot === 'echo' ? 0 : cine.impactDelay,
      at: this.time,
    });
    if (this.castEvents.length > 32) this.castEvents.splice(0, this.castEvents.length - 32);
  }

  /** Queue the LANDING half of a cinematic cast: the zone payload (IMPACT_COMP_TYPES) resolves
   *  `delay` seconds out, when the performance strikes. Damage/crit multipliers and the ability
   *  radius were locked at CAST — the impact spends no rng. */
  private queueImpact(h: Hero, ab: HeroAbilityDef, comps: readonly AbilityComponent[], px: number, py: number, delay: number, ult = false): void {
    const impact = comps.filter((c) => IMPACT_COMP_TYPES.has(c.type));
    if (impact.length === 0) return;
    this.pendingImpacts.push({
      ult,
      radius: Math.max(ab.radius, ab.poolRadius ?? 0) * this.castRangeMult,
      at: this.time + delay,
      x: px,
      y: py,
      comps: impact,
      damageMult: this.castScratch.damageMult,
      rangeMult: this.castRangeMult,
      hero: h.kind,
      particle: ab.particle,
      fxColor: ab.fxColor,
    });
  }

  /** Fire every cinematic payload whose performance has LANDED. Gated in step() on a non-empty
   *  queue, so a cast-less run — the golden autoplay — never pays a tick for it. Enemies are
   *  re-queried at the stored zone: the blow hits whatever stands there when it lands. */
  private pendingImpactSystem(): void {
    const due = this.pendingImpacts.filter((p) => this.time >= p.at);
    if (due.length === 0) return;
    this.pendingImpacts = this.pendingImpacts.filter((p) => this.time < p.at);
    for (const p of due) {
      this.abilitySourceKind = null;
      this.abilityHeroKind = p.hero;
      this.abilityCaster = this.heroes.find((x) => x.kind === p.hero) ?? null;
      this.castScratch.x = p.x;
      this.castScratch.y = p.y;
      this.castScratch.damageMult = p.damageMult;
      this.castScratch.target = null;
      this.castScratch.pierce = 0;
      this.castRangeMult = p.rangeMult;
      const dealtBefore = this.statDamageDealt;
      runAbilities(this.actx, p.comps, this.castScratch);
      this.castRangeMult = 1;
      if (p.particle) this.spawnParticles(p.x, p.y, PARTICLE[p.particle], p.fxColor); // the landing burst
      // The view's IMPACT FRAME (docs/HERO-CINEMATICS.md §impact): hit-stop + zone bloom + one
      // grouped damage total. Observation only — gated on a listener, so the sim is untouched.
      if (p.ult && this.events.hasListeners('abilityImpact')) {
        this.events.emit('abilityImpact', { hero: p.hero, x: p.x, y: p.y, radius: p.radius ?? 0, color: p.fxColor ?? HERO_DEFS[p.hero].color, damage: this.statDamageDealt - dealtBefore });
      }
    }
  }

  private deathSystem(): void {
    // In-place swap-remove (no per-tick array realloc). Evicts BOTH hp-deaths and
    // enemies that breached the line (hitNucleus set alive=false without an hp-death).
    const es = this.enemies;
    for (let i = es.length - 1; i >= 0; i--) {
      const e = es[i];
      const killed = e.alive && e.hp <= 0;
      if (killed) {
        e.alive = false;
        this.kills++;
        if (e.elite) this.onEliteSlain(); // Ravager Killchain/Bloodthirst (golden-safe: no elites in Stage)
        this.statKillsByEnemy[e.kind]++; // lifetime-stats observation
        if (e.boss) this.bossCount = Math.max(0, this.bossCount - 1); // a boss fell
        if (e.lastHitKind) this.masteryAccrual[e.lastHitKind].kills++; // mastery: kill credit
        // Hero KILLING-BLOW credit (stamped by the strike/ability paths) — feeds hero mastery +
        // lifetime heroKills, and triggers the killer's Symbiote kill verbs (docs/HERO-SYMBIOTES.md).
        // Pure observation + kit-gated triggers ⇒ golden-safe.
        if (e.lastHitHero) {
          this.heroMasteryAccrual[e.lastHitHero].kills++;
          const killer = this.heroes.find((x) => x.kind === e.lastHitHero);
          const kit = killer ? this.symbioteOf(killer) : undefined;
          if (killer && kit) {
            if (kit.killHaste) killer.rushUntil = Math.max(killer.rushUntil, this.time + kit.killHaste.seconds);
            const kp = kit.killPlague;
            if (kp && (e.corrosion > 0 || e.infection > 0)) {
              const cor = e.corrosion * kp.frac;
              const inf = e.infection * kp.frac;
              const r2 = kp.radius * kp.radius;
              this.grid.forNeighbors(e.x, e.y, kp.radius, (o) => {
                if (!o.alive || o === e) return;
                if (dist2(o.x, o.y, e.x, e.y) > r2) return;
                if (cor > 0) this.applyStatus(o, { kind: 'Corrosion', amount: cor });
                if (inf > 0) this.applyStatus(o, { kind: 'Infection', amount: inf });
              });
              this.spawnParticles(e.x, e.y, PARTICLE.infect, '#a7ff5e', 0.7); // the plague bursts outward
            }
          }
        }
        // Expansion strain death verbs (docs/STRAIN.md) — all kit-gated (zero work pre-strain):
        // a Maw meal feeds the nearest gorging jaws; a feared death spreads its panic; a body
        // dying INSIDE its casing still shatters.
        if (e.lastHitKind === 'maw') {
          let feeder: Tower | null = null;
          let fd = Infinity;
          for (const t of this.towers) {
            if (t.kind !== 'maw' || t.strain < 2) continue;
            const d2m = dist2(t.x, t.y, e.x, e.y);
            if (d2m < fd) { fd = d2m; feeder = t; }
          }
          if (feeder !== null) {
            const gk = resolveStrain('maw', feeder.strain).gorge;
            if (gk !== undefined) feeder.glut = Math.min(gk.maxStacks, (feeder.glut ?? 0) + 1);
          }
        }
        if (e.statuses !== undefined && e.statuses.length > 0) {
          const fearedDeath = e.statuses.some((x) => x.id === 'fear' && x.stacks > 0);
          const frozenDeath = e.statuses.some((x) => x.id === 'freeze' && x.stacks > 0);
          const cont = this.effigyKit.fearContagion;
          if (fearedDeath && cont !== undefined) {
            let near: Enemy | null = null;
            let bd = cont.range * cont.range;
            this.grid.forNeighbors(e.x, e.y, cont.range, (o) => {
              if (!o.alive || o.statuses?.some((x) => x.id === 'fear')) return;
              const d2f = dist2(e.x, e.y, o.x, o.y);
              if (d2f < bd) { bd = d2f; near = o; }
            });
            if (near !== null && this.applyEffect(near, 'fear')) {
              const nf = (near as Enemy).statuses?.find((x) => x.id === 'fear');
              if (nf && nf.stacks > 0) nf.remaining = cont.seconds;
              this.spawnParticles((near as Enemy).x, (near as Enemy).y, PARTICLE.disrupt, TOWER_DEFS.effigy.color, 0.5);
            }
          }
          if (frozenDeath) this.onCasingBreak(e);
        }
        // GRAVEBIND (docs/HEROES.md §carrion): the hive does not bury what it kills — a corpse
        // falling near the fielded Carrion RISES as a thrall. Null-gated ⇒ inert on every
        // other roster (incl. golden autoplay).
        if (this.gravebindHero !== null) this.raiseFromCorpse(e);
        if (e.infection > 0) {
          this.spreadInfection(e); // Viral: the plague jumps to the living
          // STRAIN plague verbs (docs/STRAIN.md — Spore Bloat / Leaping Broodworm): the nest's
          // evolution empowers the infection itself. Empty kit ⇒ zero work (golden-safe).
          const pk = this.parasiteKit;
          if (pk.infectionDeathBurst !== undefined) {
            const b = pk.infectionDeathBurst;
            this.grid.forNeighbors(e.x, e.y, b.radius, (o) => {
              if (!o.alive || dist2(e.x, e.y, o.x, o.y) > b.radius * b.radius) return;
              if (this.applyEffect(o, 'slow')) {
                const sl = o.statuses?.find((x) => x.id === 'slow');
                if (sl) sl.remaining = b.seconds;
              }
            });
            this.spawnParticles(e.x, e.y, PARTICLE.mutate, TOWER_DEFS.parasite.color, 0.7);
          }
          if (pk.infectionLeap !== undefined) {
            const lp = pk.infectionLeap;
            let far: Enemy | null = null;
            let bd = lp.range * lp.range;
            this.grid.forNeighbors(e.x, e.y, lp.range, (o) => {
              if (!o.alive || o.infection > 0) return;
              const d2l = dist2(e.x, e.y, o.x, o.y);
              if (d2l < bd) { bd = d2l; far = o; }
            });
            if (far !== null) {
              this.infect(far, lp.stacks, 'parasite'); // the Nest's own strain verb
              this.spawnParticles((far as Enemy).x, (far as Enemy).y, PARTICLE.mutate, TOWER_DEFS.parasite.color, 0.5);
            }
          }
        }
        const gain = e.bounty * this.mods.biomassMult * this.megaFx.biomass; // ×1 without a mega leech
        this.biomass += gain;
        this.statBiomassEarned += gain;
        this.armorBreakUntil.delete(e.id);
        if (this.firstAirKillAt < 0 && ENEMY_DEFS[e.kind].behavior.flying === true) this.firstAirKillAt = this.time; // debrief ledger
        if (e.boss) {
          this.spawnParticles(e.x, e.y, PARTICLE.death, ENEMY_DEFS[e.kind].color);
          this.spawnMotes(e.x, e.y); // biomass income "flies" up off the kill
        } else {
          // ASSIMILATION VFX (render/gore.ts): the renderer explodes gibs + routes coalescing chunks
          // to the biomass HUD / the killing tower-hero / the container meter. Metadata only — a
          // one-shot descriptor the renderer seq-ingests; the pinned outputs are untouched.
          const dd = ENEMY_DEFS[e.kind];
          this.deathEvents.push({ seq: this.deathSeq++, x: e.x, y: e.y, color: dd.color,
            overkill: Math.min(1.5, -e.hp / Math.max(1, e.maxHp)), bounty: e.bounty,
            killerKind: e.lastHitKind, flying: dd.behavior.flying === true });
          if (this.deathEvents.length > 160) this.deathEvents.splice(0, this.deathEvents.length - 160);
        }
        this.pushSfx('kill'); // the rising kill-streak reward ping
        if (!e.boss) { this.pushSfx(enemyDeathCue(ENEMY_DEFS[e.kind])); this.pushSfx('assimilate'); } // body-impact + a soft absorb shimmer
        if (e.boss) {
          this.bossDeathSpectacle(e); // a boss death is an event, not a pop
          this.runBossKills++; // RunStats.bossKills — Boss Rush rewards + lifetime ledgers key off it
          if (!this.statBossesSlain.includes(e.boss.name)) this.statBossesSlain.push(e.boss.name); // RunStats.bossesSlain (names, observation)
        }
        if (e.boss && e.boss.splitsLeft > 0) this.splitBoss(e); // Mitotic Horror: cleave into smaller copies
        if (e.bounty >= 20) {
          this.floats.push({ x: e.x, y: e.y - 14, text: `+${Math.round(gain)}`, color: '#b6e84a', life: 0.8 });
        }
        // Gameplay events (gated: no payload built when nobody is listening).
        if (this.events.hasListeners('enemyKilled')) {
          this.events.emit('enemyKilled', { id: e.id, kind: e.kind, x: e.x, y: e.y, bounty: e.bounty, byTower: e.lastHitKind, isBoss: e.boss !== null });
        }
        if (e.boss && this.events.hasListeners('bossKilled')) {
          const kdef = bossDef(e.boss.defId) ?? this.procBosses.get(e.boss.defId);
          // A splitter (Mitotic Horror) is ONE boss in pieces: `final` marks the last piece, so the
          // FALLEN card and nemesis revenge wait for it. Read-only scan, built only for listeners.
          const id = e.boss.defId;
          const final = e.boss.splitsLeft === 0 && !this.enemies.some((o) => o !== e && o.alive && o.boss?.defId === id);
          this.events.emit('bossKilled', { defId: id, name: e.boss.name, x: e.x, y: e.y, epithet: kdef?.epithet, final });
        }
        if (this.relicHooks.length) this.fireRelicHooks('enemyKilled', e); // relic battlefield rules
        if (this.relicHooks.length && (e.elite || e.boss)) this.fireRelicHooks('eliteKilled', e); // rule genes (docs/CARDS.md §rules)
        if (this.mods.killFractureSplash > 0) { // Viral Payload (gene card) — the kill seeds Fracture nearby
          this.grid.forNeighbors(e.x, e.y, KILL_FRACTURE_RANGE, (o) => {
            if (o.alive && o.id !== e.id) this.addFracture(o, this.mods.killFractureSplash);
          });
        }
      }
      if (!e.alive) {
        this.noteLastOut(e.x, e.y, killed ? (e.boss ? 2 : 1) : 0);
        es[i] = es[es.length - 1];
        es.pop();
      }
    }
  }

  /** Record an enemy (or the Mega) leaving the field for the last-kill beat. Within one tick the
   *  biggest exit wins (a kill over a breach, the Mega over its escort); across ticks the newest. */
  private noteLastOut(x: number, y: number, rank: number): void {
    const lo = this.lastOut;
    if (rank === 2) lo.bossWave = this.waveIndex;
    else if (rank === 3) lo.megaWave = this.waveIndex;
    if (lo.step === this.stepCount && rank < lo.rank) return;
    lo.x = x; lo.y = y; lo.rank = rank; lo.step = this.stepCount; lo.wave = this.waveIndex;
  }

  /** LAST-KILL beat (docs/SIGNATURE-MOMENTS.md §1): `waveLastKill` fires ONCE per wave, the tick the
   *  field empties. A collapsing Mega counts as gone — its fall IS the last kill — so a raid wave's
   *  beat lands on the fall, not 3.5 s later when the body clears. Presentation only (listener-gated). */
  private lastKillBeat(): void {
    const lo = this.lastOut;
    if (lo.sentWave === this.waveIndex) return;
    if (!this.spawnedAll || this.spawnQueue.length > 0 || this.rushPending.length > 0 || this.enemies.length > 0) return;
    if (this.megaHoldsWave && this.mega!.deathT <= 0) return; // the organism still stands
    lo.sentWave = this.waveIndex;
    const seen = lo.wave === this.waveIndex; // nothing left the field this wave (a debug skip) ⇒ no kill
    this.events.emit('waveLastKill', {
      wave: this.waveIndex,
      x: seen ? lo.x : WIDTH / 2,
      y: seen ? lo.y : HEIGHT / 2,
      kill: seen && lo.rank > 0,
      boss: lo.bossWave === this.waveIndex,
      mega: lo.megaWave === this.waveIndex,
      final: this.megaDailyEnc !== null || (this.mode !== 'endless' && this.mode !== 'bossRush' && this.waveIndex >= this.totalWaves),
    });
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
    // Pool or cold-allocate; EITHER way every field below is set explicitly, so a reused shot
    // never inherits a prior cast's STRAIN modifier (the leak) and a cold allocation never drops
    // one (docs/STRAIN.md §framework). Strain I leaves them all empty ⇒ byte-identical golden path.
    const p: Projectile = this.projPool.pop() ?? ({} as Projectile);
    p.id = this.nextId++;
    p.x = x; p.y = y; p.tx = tx; p.ty = ty; p.speed = speed;
    p.targetId = targetId; p.damage = damage; p.behavior = behavior; p.splash = splash; p.alive = true;
    p.sourceKind = sourceKind;
    p.heroSource = this.abilityHeroKind ?? undefined; // cosmetic: hero-fired shots → gear-skinned (render-only, golden-safe)
    p.pierce = 0; // reset pooled mutator state before re-applying the kit's mutators
    p.skin = this.castProjectileSkin; // branch shot-skin (renderer-only; undefined on the base path)
    p.skinTier = this.castProjectileSkinTier; // branch shot-tier (renderer-only)
    p.fade = undefined; // a reused shot starts fully opaque / live (clear any prior fade-out)
    if (p.hitIds) p.hitIds.length = 0;
    p.fragment = this.castFragment !== null && behavior === 'splash' ? this.castFragment : undefined;
    // Knockback rides splash impacts (mortar stagger) AND the arc carve (Concussive Return).
    p.knockback = this.castKnockback > 0 && (behavior === 'splash' || behavior === 'arc') ? this.castKnockback : undefined;
    p.fragKnockback = this.castFragKnockback && p.fragment !== undefined && p.knockback !== undefined ? p.knockback * 0.6 : undefined;
    p.ricochet = this.castRicochet !== null && behavior === 'homing' ? this.castRicochet : undefined;
    // Venom marks ride homing needles AND the arc blade (Serrated Venom) — same detonation contract.
    p.venom = this.castVenom !== null && (behavior === 'homing' || behavior === 'arc') ? this.castVenom : undefined;
    // 'arc' (the Wyrmwing Glaive): repurpose (tx,ty) as the TURNAROUND point — the aim direction
    // carried out to the tower's effective range — and stamp the return kinematics. Explicitly
    // reset on every other behavior so a pooled shot never inherits a stale arc state.
    if (behavior === 'arc') {
      const reach = (sourceKind !== null ? TOWER_DEFS[sourceKind].range : 400) * this.castRangeMult;
      const adx = tx - x;
      const ady = ty - y;
      const ad = Math.hypot(adx, ady) || 1;
      p.tx = x + (adx / ad) * reach;
      p.ty = y + (ady / ad) * reach;
      p.arcOx = x;
      p.arcOy = y;
      p.arcDist = reach;
      p.arcReturn = false;
      p.hitIds = p.hitIds ?? []; // the per-leg cut ledger (cleared at the turnaround)
    } else {
      p.arcOx = undefined;
      p.arcOy = undefined;
      p.arcDist = undefined;
      p.arcReturn = undefined;
    }
    this.projectiles.push(p);
    // STRAIN echo shell (docs/STRAIN.md — Echoing Howitzer): a slower twin chases the first
    // shell to the same crater. Guarded so an echo never breeds an echo.
    if (this.castEcho !== null && behavior === 'splash' && !this.echoing) {
      this.echoing = true;
      this.spawnProjectile(x, y, tx, ty, speed * this.castEcho.speedFrac, targetId, damage * this.castEcho.damageFrac, behavior, splash, sourceKind);
      this.echoing = false;
    }
    this.applyProjectileMutators(p);
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
    // The fall is ANNOUNCED by the view's centre-stage card (bossKilled event); this cue carries its
    // weight — shake, hit-stop, duck + the bossDown stinger (render/feel.ts FEEL.bossFall).
    this.pushSfx('bossFall');
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
    // A living Mega Boss HOLDS its encounter open (docs/MEGA-BOSS.md §modes): in every mode
    // EXCEPT campaign the organism counts as part of its wave — the wave cannot complete until
    // it falls (previously only daily/campaign-finales held, so an infinite/rush wave could
    // slip past a live mega in the gap before its reinforcement pulse — the reported jank).
    // The lone-siege loop supplies pressure while it stands. CAMPAIGN is the one mode where a
    // mega persists across waves; only its FINAL wave holds for the kill (the stage finale).
    if (this.events.hasListeners('waveLastKill')) this.lastKillBeat(); // presentation: may fire before the hold releases
    if (this.megaHoldsWave) return;
    if (this.spawnedAll && this.spawnQueue.length === 0 && this.rushPending.length === 0 && this.enemies.length === 0) {
      this.minions.length = 0; // temporary summons don't outlive the wave they were called into
      if (this.events.hasListeners('waveCompleted')) this.events.emit('waveCompleted', { wave: this.waveIndex, endless: this.mode === 'endless' });
      if (this.relicHooks.length) this.fireRelicHooks('waveCleared', null); // relic rule on a cleared wave
      this.calledAhead = 0; // the field is clear — the EARLY CALL stack re-opens
      if (this.squeezeOn) this.updateSqueeze(); // Infinite pressure band (before any regen redeems the loss)
      if (this.mods.integrityRegenPerWave > 0) { // Regenerative Carapace (gene card)
        this.integrity = Math.min(this.maxIntegrity, this.integrity + this.mods.integrityRegenPerWave);
      }
      const flawless = this.integrity >= this.waveStartIntegrity; // held the line without a breach
      // Fire the clear feedback NOW (and roll the draft at the unchanged RNG point), but hold the
      // phase flip for the settle beat (endWave) so the battlefield winds down first. The draft
      // options aren't shown until the phase is 'draft' (the modal is phase-gated).
      // Endless + Boss Rush never "win" — they only end when the Nucleus falls. Stage + campaign
      // clear when their (authored / generated) wave count is reached.
      if (this.mode !== 'endless' && this.mode !== 'bossRush' && this.waveIndex >= this.totalWaves) {
        this.stageClearCrescendo();
      } else {
        this.waveCompleteFlourish(flawless);
        // Gene Card cadence (CARDS.md §1): campaign drafts every wave (generous); endless slows
        // the drip with depth so cards stay exciting and deep runs lean on permanent progression.
        if (!this.tutorialMode && this.shouldDraftThisWave()) {
          this.draft = this.dealDraft(); // depth-scaled rarity (CARDS.md §2); tower cards only for FIELDED kinds
          this.draftKind = 'wave';
          this.draftRerolled = false; // a fresh deal re-arms the one paid reroll (§reroll)
        }
      }
      this.settleTimer = SETTLE.duration; // begin the wind-down; endWave() reveals the result
      this.pendingImpacts.length = 0; // the field is clear — no cinematic payload left to land
    }
  }

  /** A living (or collapsing) Mega holds its encounter open — see checkWaveEnd. */
  private get megaHoldsWave(): boolean {
    return this.mega !== null && (this.megaDailyEnc !== null || this.mode !== 'campaign' || this.waveIndex >= this.totalWaves);
  }

  /** Whether the just-cleared wave grants a Gene Card draft. Stage + campaign: always (generous).
   * Endless: the cadence widens with depth (1→5-wave gaps, CARDS.md §1) — counts waves since the
   * last draft and fires once it reaches the depth's interval, so the gap only ever widens. Mutates
   * the since-last-draft counter, so call exactly once per cleared wave. */
  private shouldDraftThisWave(): boolean {
    // Daily Dormancy (docs/DAILY-RUN.md): a positive cadence override drafts only every Nth wave.
    // 0 (the neutral default) ⇒ fall through to the mode's own cadence — golden-safe.
    if (this.dailyFx.draftEveryWaves > 0) return this.waveIndex % this.dailyFx.draftEveryWaves === 0;
    // Boss Rush: a FIXED every-2nd-wave cadence (docs/BOSS-RUSH.md) — steady power injections
    // against the linearly growing boss count, without Campaign's every-wave generosity.
    if (this.mode === 'bossRush') {
      this.wavesSinceDraft++;
      if (this.wavesSinceDraft >= RUSH.draftEvery) {
        this.wavesSinceDraft = 0;
        return true;
      }
      return false;
    }
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
    // Stage + campaign clear (win) when their wave count is reached; endless + Boss Rush never win.
    if (this.mode !== 'endless' && this.mode !== 'bossRush' && this.waveIndex >= this.totalWaves) {
      this.phase = 'won';
    } else if ((this.draft && this.draft.length > 0) || this.dealOwedDraft()) {
      this.phase = 'draft'; // this wave's card — or one a called-over wave still owes (EARLY CALL)
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
    if (this.mods.fullHealthDamageBonus > 0 && e.hp >= e.maxHp) m += this.mods.fullHealthDamageBonus; // Ambush Enzyme — first-strike bonus
    if (e.disrupt > 0) m += STATUS.disruptVulnerability + this.mods.obeliskVulnerabilityBonus + this.heroVulnBonus();
    if (e.corrosion > 0) m += this.heroCorrosionVulnBonus(); // Vitriol Solvent Rounds (0 unless fielded)
    if (e.infection > 0) m += this.heroInfectionVulnBonus(); // Revenant Virulent Presence (0 unless fielded)
    // Framework debuffs (e.g. Armor Break amp, generic Vulnerability) add in here too —
    // inert on the historical path (no framework statuses present).
    if (e.statuses !== undefined && e.statuses.length > 0) m += aggregateStatuses(e.statuses).damageTakenMult;
    return m;
  }

  /** Viral: add Infection stacks (capped). A tower `source` claims the plague (its spread
   *  upgrades set the death-spread reach); heroes and reactions add stacks without claiming. */
  private infect(e: Enemy, n: number, source: TowerKind | null = null): void {
    e.infection = Math.min(STATUS.infectionMaxStacks, e.infection + n);
    if (source !== null) e.infectedBy = source;
  }

  /** Apply a universal status-effect (status.ts) to an enemy — the path NEW effects
   * (burn, slow, stun, regen, …) flow through. The four legacy statuses keep their fast
   * fields; everything else lives in the generic container, ticked in statusSystem and
   * read by enemyMoveSystem/vulnMult. Returns false for an unknown id. */
  /** A Freeze casing just broke on `e` (expiry or death): Setting Resin slicks the ground,
   *  Splinter Shards burst, Living Amber releases its stored siphon (docs/STRAIN.md). */
  private onCasingBreak(e: Enemy): void {
    const kit = this.chrysalisKit;
    const slick = kit.resinSlick;
    if (slick !== undefined) {
      this.grid.forNeighbors(e.x, e.y, slick.radius, (o) => {
        if (!o.alive || dist2(e.x, e.y, o.x, o.y) > slick.radius * slick.radius) return;
        if (this.applyEffect(o, 'slow')) {
          const sl = o.statuses?.find((x) => x.id === 'slow');
          if (sl && sl.stacks > 0 && sl.remaining < slick.seconds) sl.remaining = slick.seconds;
        }
      });
    }
    const burst = kit.shatterBurst;
    if (burst !== undefined) {
      this.grid.forNeighbors(e.x, e.y, burst.radius, (o) => {
        if (!o.alive || dist2(e.x, e.y, o.x, o.y) > burst.radius * burst.radius) return;
        this.applyDamage(o, burst.damage, 'chrysalis', true);
      });
    }
    if (kit.amberSiphon !== undefined && e.alive) {
      this.applyDamage(e, kit.amberSiphon.burst, 'chrysalis', true);
    }
    if (slick !== undefined || burst !== undefined || kit.amberSiphon !== undefined) {
      this.spawnParticles(e.x, e.y, PARTICLE.mutate, TOWER_DEFS.chrysalis.color, 0.7);
    }
  }

  /** Fear just faded on `e`: Creeping Dread chills the body, the Death Knell tears the mind
   *  and everything beside it (docs/STRAIN.md — effigy II / V). */
  private onPanicFade(e: Enemy): void {
    const kit = this.effigyKit;
    const chill = kit.fearChill;
    if (chill !== undefined && e.alive && this.applyEffect(e, 'slow')) {
      const sl = e.statuses?.find((x) => x.id === 'slow');
      if (sl && sl.stacks > 0 && sl.remaining < chill.seconds) sl.remaining = chill.seconds;
    }
    const knell = kit.deathKnell;
    if (knell !== undefined) {
      this.grid.forNeighbors(e.x, e.y, knell.radius, (o) => {
        if (!o.alive || dist2(e.x, e.y, o.x, o.y) > knell.radius * knell.radius) return;
        this.applyDamage(o, knell.damage, 'effigy', true);
      });
      this.applyDamage(e, knell.damage, 'effigy', true);
      this.spawnParticles(e.x, e.y, PARTICLE.mutate, TOWER_DEFS.effigy.color, 0.8);
    }
  }

  applyEffect(e: Enemy, id: string, amount = 1): boolean {
    const d = statusRegistry.get(id);
    if (!d) return false;
    (e.statuses ??= []);
    applyStatusInstance(e.statuses, d, amount);
    // Presentation seam (docs/COMBAT-VISUAL-STANDARDS.md §audio): the view layer plays a
    // throttled category cue per application. hasListeners-gated ⇒ zero work, no payload,
    // byte-identical goldens on the subscriber-less path.
    if (this.events.hasListeners('statusApplied')) {
      this.events.emit('statusApplied', { id, category: d.category, x: e.x, y: e.y });
    }
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
    // Identity-range upgrade (docs/RANGE.md §8): the INFECTING tower's spread upgrades (mastery,
    // Adaptation) widen the plague's reach — a Miasma Lung's coat leaps by the Lung's, the Nest's
    // by the Nest's; unclaimed (hero/reaction) plague uses the Nest's. 1× on a fresh save.
    const owner = src.infectedBy ?? 'parasite';
    const r = STATUS.infectionSpreadRadius * (this.towerProgress[owner]?.infectionSpreadMult ?? 1);
    const r2 = r * r;
    const near = this.neighborScratch;
    this.grid.queryInto(src.x, src.y, r, near);
    near.sort((a, b) => dist2(src.x, src.y, a.x, a.y) - dist2(src.x, src.y, b.x, b.y));
    let jumps = 0;
    for (let i = 0; i < near.length && jumps < STATUS.infectionSpreadTargets; i++) {
      const o = near[i];
      if (o === src || !o.alive || o.infection >= STATUS.infectionMaxStacks) continue;
      if (dist2(src.x, src.y, o.x, o.y) > r2) continue;
      this.infect(o, STATUS.infectionSpreadStacks, src.infectedBy ?? null); // the plague keeps its owner as it walks
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
    if (e.boss && e.boss.burrow > 0) return 0; // submerged — beneath the field, untargetable
    // Core-crush counterplay: a gripping boss is EXPOSED — hits land harder, so burst breaks it off.
    if (e.boss && e.boss.grip > 0) raw *= BOSS.gripExposeMult;
    // Signature windows (docs/BOSS-DESIGN.md §identity): broodburst tearing leaves the swarmlord
    // EXPOSED (same punish math as the grip); the juggernaut march SHRUGS its authored fraction.
    if (e.boss && e.boss.exposeT > 0) raw *= BOSS.gripExposeMult;
    if (e.boss && e.boss.unstop > 0) raw *= 1 - e.boss.unstopDR;
    const broken = (this.armorBreakUntil.get(e.id) ?? 0) > this.time;
    // Boss carapace: heavy bonus armor while the window is up — but a Shred (broken) cracks it too,
    // so Fracture answers the wall. Zero on every normal enemy ⇒ golden-safe.
    const armor = effectiveArmor(e, broken) + (broken ? 0 : e.boss?.carapace ?? 0) + this.megaFx.enemyArmorAdd; // mega chitinize (+0 without one)
    const applied = damageAfter(raw, this.vulnMult(e), armor);
    // Shielded enemies soak the hit into the front shield first; only the overflow reaches HP.
    // The shield is undefined/0 on the historical roster, so this is a no-op there (golden-safe).
    let toBody = applied;
    if ((e.shield ?? 0) > 0) {
      const absorbed = Math.min(e.shield as number, applied);
      e.shield = (e.shield as number) - absorbed;
      toBody = applied - absorbed;
      if (e.shield <= 0) e.shieldFlash = 0.3; // the bubble SHATTERS — a readable break moment
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
      // ── Vital (Mark) — HARVEST family: the marked affliction is rendered into a burst + Biomass. ──
      case 'harvest': { // Mark + Fracture
        e.hp -= REACTIONS.markBurst;
        this.harvestBiomass(REACTIONS.markBiomass);
        e.fracture = 0; e.mark = 0; e.shredFlash = STATUS.shredFlash;
        this.pushSfx('hit');
        this.spawnParticles(e.x, e.y, PARTICLE.shred);
        break;
      }
      case 'ferment': { // Mark + Corrosion
        e.hp -= REACTIONS.markBurst;
        this.harvestBiomass(REACTIONS.markBiomass);
        e.corrosion = 0; e.mark = 0; e.shredFlash = STATUS.shredFlash;
        this.pushSfx('hit');
        this.spawnParticles(e.x, e.y, PARTICLE.infect);
        break;
      }
      case 'bloomrot': { // Mark + Infection
        e.hp -= REACTIONS.markBurst;
        this.harvestBiomass(REACTIONS.markBiomass);
        e.infection = 0; e.mark = 0; e.shredFlash = STATUS.shredFlash;
        this.pushSfx('hit');
        this.spawnParticles(e.x, e.y, PARTICLE.infect);
        break;
      }
      case 'synapticbloom': { // Mark + Disruption
        e.hp -= REACTIONS.markBurst;
        this.harvestBiomass(REACTIONS.markBiomass);
        e.disrupt = 0; e.mark = 0; e.shredFlash = STATUS.shredFlash;
        this.pushSfx('hit');
        this.spawnParticles(e.x, e.y, PARTICLE.disrupt);
        break;
      }
      // ── Resonant (Resonance) — SHATTER family: the beam's resonance shatters the co-present status. ──
      case 'resonantshear': { // Resonance + Fracture (scales with Fracture) + armor break
        e.hp -= REACTIONS.resoBurst + REACTIONS.resoPerStack * e.fracture;
        this.armorBreakUntil.set(e.id, this.time + STATUS.shredArmorBreak);
        e.fracture = 0; e.resonance = 0; e.shredFlash = STATUS.shredFlash;
        this.pushSfx('shred');
        this.spawnParticles(e.x, e.y, PARTICLE.shred);
        break;
      }
      case 'resonantmelt': { // Resonance + Corrosion → armor melts (dissolve-like)
        e.hp -= REACTIONS.resoBurst;
        this.armorBreakUntil.set(e.id, this.time + REACTIONS.dissolveBreak);
        e.corrosion = 0; e.resonance = 0; e.shredFlash = STATUS.shredFlash;
        this.pushSfx('shred');
        this.spawnParticles(e.x, e.y, PARTICLE.disrupt);
        break;
      }
      case 'resonantrupture': { // Resonance + Infection (scales with Infection)
        e.hp -= REACTIONS.resoBurst + REACTIONS.resoPerStack * Math.floor(e.infection);
        e.infection = 0; e.resonance = 0; e.shredFlash = STATUS.shredFlash;
        this.pushSfx('shred');
        this.spawnParticles(e.x, e.y, PARTICLE.infect);
        break;
      }
      case 'resonantovertone': { // Resonance + Disruption
        e.hp -= REACTIONS.resoBurst;
        e.disrupt = 0; e.resonance = 0; e.shredFlash = STATUS.shredFlash;
        this.pushSfx('shred');
        this.spawnParticles(e.x, e.y, PARTICLE.disrupt);
        break;
      }
      // ── Mark + Resonance — SYNTHESIS: the two newest castes combine (heavy burst + Biomass). ──
      case 'synthesis': {
        e.hp -= REACTIONS.synthesisBurst;
        this.harvestBiomass(REACTIONS.synthesisBiomass);
        e.mark = 0; e.resonance = 0; e.shredFlash = STATUS.shredFlash;
        this.pushSfx('shred');
        this.spawnParticles(e.x, e.y, PARTICLE.shred);
        break;
      }
    }
    this.floats.push({ x: e.x, y: e.y - 16, text: r.name, color: r.color, life: 0.7 });
  }

  /** Biomass returned to the hive by a Vital (Mark) reaction — the harvest payoff (Vital = economy). */
  private harvestBiomass(n: number): void {
    this.biomass += n;
    this.statBiomassEarned += n;
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

  /** Kinds ACTIVELY FIELDED right now — the kinds with a tower on the board. Gene drafts offer
   *  tower-subject cards ONLY for these (docs/CARDS.md §draft relevance): a card for an organism
   *  you aren't running is a dead pick. Global / economy / hive / hero cards are unaffected, and
   *  the pool re-widens the moment a new kind is placed (each draft reads the LIVE board). */
  private fieldedKinds(): ReadonlySet<TowerKind> {
    const s = new Set<TowerKind>();
    for (const t of this.towers) s.add(t.kind);
    return s;
  }

  /** Deal one 3-card draft — THE deal seam (wave clear, reroll, opening, splice, tutorial, debug).
   *  DRAFT FIT off ⇒ exactly the legacy draftCards call (golden path). On ⇒ the live fit read +
   *  the recency window, and the dealt ids are stamped so the next deals avoid a carousel. */
  private dealDraft(allowed: ReadonlySet<TowerKind> = this.fieldedKinds()): CardDef[] {
    const fit = this.draftFitOn ? this.draftFitContext(true) : undefined;
    const deal = draftCards(this.rng, 3, this.waveIndex, allowed, this.unlockedCardIds, this.draftPool, this.ruleSlot, fit);
    if (fit) {
      this.dealSeq++;
      for (const c of deal) this.offeredAt.set(c.id, this.dealSeq);
    }
    return deal;
  }

  /** The DRAFT FIT read (docs/CARDS.md §fit): who deals this run's damage (towers per kind + heroes),
   *  and how deep the Biomass bank is. Before any damage lands it reads the BOARD instead (towers by
   *  count, an empty board counting the favorite) with the hero at DRAFT_FIT.heroPrior. Pure read. */
  private draftFitContext(withRecent: boolean): DraftFit {
    const towerShare: Partial<Record<TowerKind, number>> = {};
    let towerDmg = 0;
    for (const k of TOWER_ORDER) towerDmg += this.masteryAccrual[k].damage;
    let heroDmg = 0;
    for (const h of this.heroes) heroDmg += this.heroMasteryAccrual[h.kind].damage;
    const total = towerDmg + heroDmg;
    let heroShare: number;
    if (total > 0) {
      for (const k of TOWER_ORDER) if (this.masteryAccrual[k].damage > 0) towerShare[k] = this.masteryAccrual[k].damage / total;
      heroShare = heroDmg / total;
    } else {
      heroShare = this.heroes.length > 0 ? DRAFT_FIT.heroPrior : 0;
      const counts = new Map<TowerKind, number>();
      for (const t of this.towers) counts.set(t.kind, (counts.get(t.kind) ?? 0) + 1);
      if (counts.size === 0) counts.set(this.favoriteTower, DRAFT_FIT.favoritePrior);
      let n = 0;
      for (const c of counts.values()) n += c;
      for (const [k, c] of counts) towerShare[k] = (c / n) * (1 - heroShare);
    }
    let recent: Set<string> | undefined;
    if (withRecent) {
      recent = new Set<string>();
      for (const [id, at] of this.offeredAt) if (this.dealSeq - at < DRAFT_FIT.recentDeals) recent.add(id);
    }
    return { towerShare, heroShare, bankRatio: this.biomass / deployCost(this.deployments), recent };
  }

  // ── SPLICE (docs/CARDS.md §splice) — turn a Biomass overflow into an extra draft ─────────────────

  /** The price of an extra draft right now: SPLICE.costDeploys × the next deploy cost × growth^bought. */
  spliceCost(): number {
    return Math.round(SPLICE.costDeploys * deployCost(this.deployments) * Math.pow(SPLICE.growth, this.splicesBought));
  }

  /** Whether a splice could be bought right now — the feature is on, it is the build phase (never
   *  mid-fight, never over an open draft), and the bank reached the price. Never in the tutorial or
   *  under a Daily that rations drafts (Dormancy — the day's rule wins). */
  canSplice(): boolean {
    return this.spliceOn && this.phase === 'prep' && !this.tutorialMode && this.dailyFx.draftEveryWaves <= 0
      && this.biomass >= this.spliceCost();
  }

  /** Buy a SPLICE: pay the price, deal a fresh 1-of-3 from the live board, open it as a draft. The
   *  pick returns to this same build phase (chooseCard). A recorded input (core/replay.ts). */
  splice(): boolean {
    if (!this.canSplice()) return false;
    const cost = this.spliceCost();
    this.biomass -= cost; // pay first — the deal's fit reads the bank the player is left with
    const deal = this.dealDraft();
    if (deal.length === 0) { this.biomass += cost; return false; } // nothing draftable — never charge for air
    this.splicesBought++;
    this.draft = deal;
    this.draftKind = 'splice';
    this.draftRerolled = false; // a splice deal carries its own one paid reroll (§reroll)
    this.phase = 'draft';
    this.pushSfx('draft');
    return true;
  }

  /** Tutorial beats (tutorialMode only — the director calls these to script the lessons). The
   *  gene-card lesson releases the held draft here exactly when it teaches drafting: during the
   *  SETTLE beat right after a clear (endWave then flips to the draft in natural wave → draft →
   *  build order, so the HUD's wave counter never steps backwards), or from prep (a resumed
   *  lesson on a fresh board). Never mid-fight. */
  openTutorialDraft(): void {
    if (!this.tutorialMode) return;
    const settling = this.phase === 'wave' && this.settleTimer > 0;
    if (this.phase !== 'prep' && !settling) return;
    this.draft = this.dealDraft();
    this.draftKind = 'wave';
    this.draftRerolled = false;
    if (!settling) this.phase = 'draft'; // settling: endWave() reveals it when the field winds down
  }

  /** Recharge the primary hero's ability so the ability lesson can never stall on a cooldown
   *  the player burned earlier (same contract as the biomass top-up: tutorial-only, never a nerf). */
  tutorialReadyAbility(): void {
    if (!this.tutorialMode) return;
    this.primaryHero.abilityCd = 0;
  }

  /** Top the Biomass bank up to `min` so a build lesson can never stall unaffordable. */
  tutorialEnsureBiomass(min: number): void {
    if (!this.tutorialMode) return;
    this.biomass = Math.max(this.biomass, min);
  }

  /** Open the 1-of-3 draft now (abandons any in-progress wave). */
  debugOpenDraft(): void {
    if (this.phase === 'won' || this.phase === 'lost') return;
    this.draft = this.dealDraft();
    this.draftKind = 'wave';
    this.draftRerolled = false;
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
  /** GRAVEBIND (docs/HEROES.md §carrion): raise a just-fallen enemy as a Risen Thrall carrying a
   *  fraction of its own body (floored at the thrall MinionDef; deepened by the raiser's scaling,
   *  the shared per-wave curve). Cadence + a personal thrall cap keep swarm wipes from becoming an
   *  instant army; bosses stay down. Called ONLY from the death seam while a gravebind hero is
   *  fielded — every other run never reaches this path. */
  private raiseFromCorpse(e: Enemy): void {
    const h = this.gravebindHero!;
    if (h.down || e.boss || this.raiseCd > 0) return;
    if (this.minions.length >= MINION_CAP) return;
    if (dist2(h.x, h.y, e.x, e.y) > GRAVEBIND.radius * GRAVEBIND.radius) return;
    let own = 0;
    for (const m of this.minions) if (m.alive && m.kind === 'thrall') own++;
    if (own >= GRAVEBIND.maxThralls) return;
    const def = MINION_DEFS.thrall;
    const id = this.idOf(h);
    const depth = 1 + Math.min(id.scaling.cap, this.waveIndex * id.scaling.perStack); // Rising Tide of the dead
    const hp = Math.max(def.hp, e.maxHp * GRAVEBIND.hpFrac) * depth;
    const dmg = Math.max(def.damage, e.damage * GRAVEBIND.dmgFrac) * depth;
    this.minions.push({
      id: this.nextId++, kind: 'thrall', x: e.x, y: e.y,
      hp, maxHp: hp, hitFlash: 0,
      damage: dmg, attackCd: 0, attackInterval: def.attackInterval, range: def.range,
      speed: def.speed, life: def.life, maxLife: def.life, radius: def.radius, color: def.color, alive: true,
    });
    this.raiseCd = GRAVEBIND.cadenceSec;
    this.spawnParticles(e.x, e.y, PARTICLE.bloom, def.color, 0.8); // the body claws back up
  }

  private summonMinions(unit: string, count: number, x: number, y: number): void {
    const def = MINION_DEFS[unit];
    if (!def) return;
    // Symbiote brood nurture (docs/HERO-SYMBIOTES.md): a HERO-cast summon inherits its caster's
    // summonMult (tower cast paths null the caster — see towerSystem's context reset). ×1 without.
    const sm = this.abilityCaster ? this.symbioteOf(this.abilityCaster)?.summonMult : undefined;
    const n = Math.min(count, MINION_CAP - this.minions.length);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = n > 1 ? 18 : 0; // ring radius (single summon sits on the point)
      this.minions.push({
        id: this.nextId++, kind: unit, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
        hp: def.hp * (sm?.hpMult ?? 1), maxHp: def.hp * (sm?.hpMult ?? 1), hitFlash: 0,
        damage: def.damage * (sm?.damageMult ?? 1), attackCd: 0, attackInterval: def.attackInterval, range: def.range,
        speed: def.speed, life: def.life, maxLife: def.life, radius: def.radius, color: def.color, alive: true,
        // Hero-AI units summoned OFF a roost (strain births / hero abilities) rally to their
        // spawn point — no roostId, so they never occupy a roost's brood slot.
        homeX: def.heroAI ? x : undefined, homeY: def.heroAI ? y : undefined,
      });
    }
    if (n > 0) this.spawnParticles(x, y, PARTICLE.bloom); // a small conjuration puff
  }

  /** Drake Roost incubation (firing 'summon' — docs/TOWERS.md §roost). Keeps a BROOD of hero-AI
   *  drakes fielded around the perch: hatches one per cadence tick while below the brood cap and
   *  re-checks quickly when full (a chewed-through drake frees its slot mid-wave). The tower's
   *  whole upgrade surface improves the UNITS — branch tier + star 'brood' grants raise the unit
   *  TIER (ROOST.unitByTier) and the brood size, ROOST_BRANCH shaping trades tier vs. count, and
   *  the shared damage/range folds are baked into each hatch like a mine bakes its blast. */
  private roostSystem(t: Tower, dt: number, def: TowerDef, prog: TowerMods, bk: ResolvedBranchKit | null, dmgMult: number, rateMult: number): void {
    t.cooldown -= dt;
    // Brood Tending (docs/TOWER-IDLE.md): a CALM leash is mothering time — eggs hatch faster
    // (below) and perched drakes mend at double rate (drakeBrain reads the posture scalar).
    const calm = !this.disableIdle
      && !this.towerHasTarget(t.x, t.y, def.range * (prog.rangeMult ?? 1) * (bk?.rangeMult ?? 1), 0);
    this.towerIdlePosture(t, !calm, dt);
    if (t.cooldown > 0) return;
    let fielded = 0;
    for (const m of this.minions) if (m.alive && m.roostId === t.id) fielded++; // ≤ MINION_CAP ⇒ bounded
    const brood = ROOST.brood + (prog.roostBroodBonus ?? 0) + (bk?.roostBroodBonus ?? 0) + Math.max(0, Math.floor(this.mods.roostBroodSize));
    const tier = 1 + (prog.roostTierBonus ?? 0) + (bk?.roostTierBonus ?? 0);
    if (fielded >= brood || this.minions.length >= MINION_CAP) {
      t.cooldown = 0.25; // full clutch — re-check soon (a lost drake frees its slot)
      return;
    }
    const unit = ROOST.unitByTier[Math.max(0, Math.min(ROOST.unitByTier.length - 1, tier - 1))];
    this.hatchDrake(t, unit, dmgMult, (prog.rangeMult ?? 1) * (bk?.rangeMult ?? 1));
    t.cooldown = def.fireInterval / (Math.max(0.05, rateMult) * (calm ? IDLE_BEHAVIORS.roost.tending?.rateMult ?? 1 : 1));
  }

  /** One drake hatches from the roost: the unit def scaled by the roost's folds — claws by the
   *  full damage fold, hide at half strength (an upgraded roost fields meaner AND tougher drakes),
   *  hunt leash by the range fold — stamped with its perch so the hero-AI brain can leash,
   *  retreat, and rally (docs/TOWERS.md §roost). */
  private hatchDrake(t: Tower, unit: string, dmgMult: number, leashMult: number): void {
    const d = MINION_DEFS[unit];
    if (!d) return;
    const hp = Math.round(d.hp * (1 + (dmgMult - 1) * 0.5));
    this.minions.push({
      id: this.nextId++, kind: unit, x: t.x, y: t.y - 16,
      hp, maxHp: hp, hitFlash: 0,
      damage: d.damage * dmgMult, attackCd: 0, attackInterval: d.attackInterval, range: d.range * leashMult,
      speed: d.speed, life: d.life, maxLife: d.life, radius: d.radius, color: d.color, alive: true,
      homeX: t.x, homeY: t.y, roostId: t.id, perched: false,
    });
    this.spawnParticles(t.x, t.y - 10, PARTICLE.bloom, d.color); // the hatch — shell shards + a first wingbeat
    const fc = towerFireCue(t.kind);
    if (fc) this.pushSfx(`${fc}:${t.kind}`); // the wet crack of the hatch (same tagging as the base firing cue)
  }

  /** Hero-style brain for drake units (MinionDef.heroAI — docs/TOWERS.md §roost). Mirrors the
   *  hero framework's verbs at unit scale: DEEPEST-threat targeting with elites first (the dive
   *  brain's sense), a rally LEASH around the home perch, retreat-to-perch when wounded + perch
   *  regen (the survival profile), then back into the hunt. Classic motes never reach this
   *  (flag-gated in minionSystem), so the wisp/harvester/broodling path is byte-identical. */
  private drakeBrain(m: Minion, def: MinionDef, dt: number, inWave: boolean): void {
    const homeX = m.homeX ?? m.x;
    const homeY = m.homeY ?? m.y;
    if (m.perched === true) {
      // Mending at the perch: regenerate (star kit deepens it), hold position, rejoin once fit.
      let regen = (def.perchRegen ?? 10) * (1 + (this.towerProgress.roost.roostRegenBonus ?? 0));
      // Brood Tending (docs/TOWER-IDLE.md): a calm roost mothers harder — the perch mends at
      // double rate while the leash is quiet (the roost's posture scalar IS the calm signal).
      if (!this.disableIdle && m.roostId !== undefined) {
        const roost = this.towers.find((x) => x.id === m.roostId);
        if (roost !== undefined && roost.prep > 0.5) regen *= IDLE_BEHAVIORS.roost.tending?.regenMult ?? 1;
      }
      m.hp = Math.min(m.maxHp, m.hp + regen * dt);
      if (m.hp >= m.maxHp * ROOST.reengageFrac) m.perched = false;
      if (dist(m.x, m.y, homeX, homeY) > 6) {
        const np = moveToward(m.x, m.y, homeX, homeY, m.speed * dt);
        m.x = np.x;
        m.y = np.y;
      }
      return;
    }
    if (m.hp <= m.maxHp * ROOST.retreatFrac) { m.perched = true; return; } // wounded — break off
    if (!inWave) return; // the grid is stale between waves (mirrors the mote brain)
    // Hunt the deepest threat within the leash of the PERCH (elites first — the apex instinct).
    // (Locals are re-read through a widened alias below: TS narrowing can't see callback writes.)
    let deepest: Enemy | null = null;
    let best = Infinity;
    let elite: Enemy | null = null;
    let bestElite = Infinity;
    const leash2 = m.range * m.range;
    this.grid.forNeighbors(homeX, homeY, m.range, (e) => {
      if (!e.alive || dist2(homeX, homeY, e.x, e.y) > leash2) return;
      const gd = this.nav.goalDistanceAt(e.x, e.y);
      if (gd < best) { best = gd; deepest = e; }
      if (e.elite && gd < bestElite) { bestElite = gd; elite = e; }
    });
    const target = (elite ?? deepest) as Enemy | null;
    if (!target) {
      // MEGA raid duty (docs/MEGA-BOSS.md §targeting): with the leash territory bare, the
      // flock dives the organism instead of circling — organs first, the sieging body after
      // (roost-credited, so ADAPT can study the brood and mastery accrues).
      if (this.mega !== null && this.unitMegaRaid(m, dt, 'roost')) return;
      // Empty territory: wheel back toward the perch (drakes never stray off their leash).
      if (dist(m.x, m.y, homeX, homeY) > 24) {
        const np = moveToward(m.x, m.y, homeX, homeY, m.speed * dt);
        m.x = np.x;
        m.y = np.y;
      }
      return;
    }
    const reach = m.radius + ENEMY_DEFS[target.kind].radius + 6;
    if (dist(m.x, m.y, target.x, target.y) > reach) {
      const np = moveToward(m.x, m.y, target.x, target.y, m.speed * dt);
      m.x = np.x;
      m.y = np.y;
    } else if (m.attackCd <= 0) {
      this.applyDamage(target, m.damage, 'roost', true); // kill/damage credit feeds roost mastery
      this.maybeReact(target);
      m.attackCd = m.attackInterval;
    }
  }

  /** Summoned friendly units: decay life, seek the nearest enemy, close in, and strike on
   * cooldown. Time-limited (no HP today). Seek/attack only during a wave (the grid is fresh
   * then); life decays every frame so they never freeze between waves. Hero-AI units
   * (MinionDef.heroAI — the roost's drakes) dispatch to their own brain instead. */
  private minionSystem(dt: number): void {
    const inWave = this.phase === 'wave';
    for (const m of this.minions) {
      m.life -= dt;
      if (m.life <= 0) { m.alive = false; continue; }
      if (m.hitFlash > 0) m.hitFlash -= dt; // "being chewed" flash decays (visual)
      if (m.attackCd > 0) m.attackCd -= dt;
      const mdef = MINION_DEFS[m.kind];
      if (mdef?.heroAI) { this.drakeBrain(m, mdef, dt, inWave); continue; }
      if (!inWave) continue;
      const target = this.nearestEnemyTo(m.x, m.y, m.range);
      if (!target) {
        // MEGA raid duty (docs/MEGA-BOSS.md §targeting): an idle mote joins the raid too
        // (hero-summon crediting — null — exactly like its normal strikes).
        if (this.mega !== null) this.unitMegaRaid(m, dt, null);
        continue;
      }
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
    blocker.hp -= (e.damage / e.attackInterval) * dt; // its true DPS — damage is per-hit now
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
    if (m.glaiveExtraBlades > 0) out.push(`+${m.glaiveExtraBlades} glaive blade`);
    if (m.roostBroodSize > 0) out.push(`+${m.roostBroodSize} roost drake`);
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
      enemyShells: this.enemyShells,
      pools: this.pools,
      corruptionPools: this.corruptionPools,
      mortarStrikes: this.mortarStrikes,
      nullWells: this.nullWells,
      floats: this.floats,
      particles: this.particles,
      heroes: this.heroes,
      minions: this.minions,
      phase: this.phase,
      selectedTower: this.selectedTower,
      selectedPlacedId: this.selectedPlacedId,
      movingTowerId: this.movingTowerId,
      selectedHero: this.selectedHeroKind,
      armedAbility: this.armedAbility,
      unlockedSlots: this.unlockedSlots,
      time: this.time,
      fxTime: this.stepCount * SIM_DT,
      integrity: this.integrity,
      hiveAttackers: this.hiveAttackers,
      hiveHitPulse: this.hiveHitPulse,
      maxIntegrity: this.maxIntegrity,
      emergency: this.emergencyActive,
      dangerIntensity: this.dangerCam.intensity,
      emergencyRamp: this.emergencyRamp,
      emergencyFocusX: this.emergencyFocusX,
      emergencyFocusY: this.emergencyFocusY,
      effectiveRanges: this.towerEffectiveRange,
      biome: { id: this.activeBiome.id, name: this.activeBiome.name, accent: this.activeBiome.accent },
      biomeFlash: this.biomeFlash,
      layoutId: this.layout.id,
      hazardActive: hazardActive(this.activeBiome, this.time),
      megaBoss: this.megaBossView(),
      megaShots: this.megaShots,
      mines: this.mines,
      deathEvents: this.deathEvents,
      castEvents: this.castEvents,
      assimilation: { wave: this.waveIndex, kills: this.kills, bossKills: this.runBossKills, megaKills: this.runMegaKills.length },
    };
  }

  /** Live run signals for the Assimilation Index (docs/ASSIMILATION.md). Read-only fold of run state
   *  the view feeds to computeAssimilation(); the Game is the source of truth for run signals, the
   *  account baseline rides in through runPower (the Power Score folds nearly every strength bucket).
   *  Cheap but allocates a couple of arrays (powerEffects/activeBuffs) ⇒ the view throttles it. */
  assimilationSignals(): AssimilationSignals {
    let strainSum = 0;
    let branchTierSum = 0;
    for (const t of this.towers) {
      if (t.strain > 1) strainSum += t.strain - 1;
      if (t.branchId) branchTierSum += t.tier;
    }
    return {
      mode: this.mode,
      wave: this.waveIndex,
      totalWaves: this.totalWaves,
      currentBiomass: this.biomass,
      biomassGenerated: this.statBiomassEarned,
      kills: this.kills,
      bossKills: this.runBossKills,
      megaKills: this.runMegaKills.length,
      weakPoints: this.statWpDestroyed,
      towerCount: this.towers.length,
      heroCount: this.heroes.length,
      strainSum,
      branchTierSum,
      activeBuffs: this.activeBuffs().length,
      runPower: effectsPower(this.powerEffects()),
      integrityFrac: this.maxIntegrity > 0 ? this.integrity / this.maxIntegrity : 1,
      time: this.time,
    };
  }

  /** Snapshot the live Mega Boss for the renderer/HUD (null on every run without one). */
  private megaBossView(): MegaBossView | null {
    const rt = this.mega;
    if (rt === null) return null;
    const def = megaBossDef(rt.defId);
    if (!def) return null;
    const phase = def.phases[rt.phase];
    const effects: string[] = [];
    for (const a of rt.active) if (this.time < a.until) effects.push(a.kind.toUpperCase());
    if (phase.passive && this.time >= rt.passiveOffUntil) effects.push(`${phase.passive.kind.toUpperCase()}*`);
    if (rt.adaptKind !== null && this.time < rt.adaptUntil) effects.push(`ADAPTED·${TOWER_DEFS[rt.adaptKind as TowerKind].name.toUpperCase()}`);
    const sieging = rt.siegeT >= MEGA.siegeGraceSec && rt.deathT === 0;
    if (sieging) effects.push('HIVE SIEGE');
    return {
      defId: def.id,
      name: def.name,
      title: def.title,
      palette: def.palette,
      motif: def.motif,
      bodyFrac: def.bodyFrac,
      anchorY: MEGA.anchorY,
      hp: Math.max(0, rt.hp),
      maxHp: rt.maxHp,
      phase: rt.phase,
      phases: def.phases.length,
      visualTier: phase.visualTier ?? rt.phase,
      telegraph: rt.telegraph !== null
        ? { kind: def.abilities[rt.telegraph.ability].kind, frac: 1 - rt.telegraph.t / rt.telegraph.total }
        : null,
      stunned: rt.stunned,
      stagger: rt.stagger,
      staggered: this.time < rt.staggeredUntil,
      exposed: this.time < rt.exposedUntil,
      deathT: rt.deathT,
      burrow: rt.burrow,
      weakPoints: rt.weakPoints,
      effects,
      siege: sieging ? { windupFrac: rt.lashWindup > 0 ? 1 - rt.lashWindup / MEGA.siegeLashTelegraph : 0 } : null,
    };
  }

  /** Build the selected hero's LIVE panel view (docs/HERO-SELECTION.md), or null when none is
   *  selected. A pure read of the sim's hero state — the same selection future abilities act on. */
  private selectedHeroView(): SelectedHeroView | null {
    const h = this.getSelectedHero();
    if (!h) return null;
    const def = HERO_DEFS[h.kind];
    // Cooldowns — only the gauges that apply: ability always; attack for attackers; pulse for support.
    const ultDef = this.heroAbilityKits[h.kind]?.ult ?? def.ability; // fork-resolved names read on the HUD
    const cooldowns: HeroCooldownView[] = [{ id: 'ability', label: ultDef.name, remaining: Math.max(0, h.abilityCd), total: def.ability.cooldown }];
    // Star-gated kit skills (HEROES.md) — surface a cooldown gauge for each UNLOCKED one (none at 0 stars).
    const unlockedSkills = this.heroProgress[h.kind].skillCount ?? 0;
    const skillDefs = this.heroAbilityKits[h.kind]?.skills ?? HERO_SKILL_DEFS[h.kind];
    for (let i = 0; i < unlockedSkills && i < skillDefs.length; i++) {
      cooldowns.push({ id: `skill${i}`, label: skillDefs[i].name, remaining: Math.max(0, h.skillCd?.[i] ?? 0), total: skillDefs[i].cooldown });
    }
    if (def.attackRange > 0) cooldowns.push({ id: 'attack', label: 'Attack', remaining: Math.max(0, h.attackCd), total: def.attackInterval });
    if (def.pulseInterval > 0) cooldowns.push({ id: 'pulse', label: 'Pulse', remaining: Math.max(0, h.pulseCd), total: def.pulseInterval });
    // Buffs from live hero state (extensible — a new hero status appends a chip). Debuffs: none yet.
    const buffs: HeroStatusChip[] = [];
    if (h.shield > 0) buffs.push({ id: 'shield', label: 'Shielded', kind: 'buff', detail: `${Math.round(h.shield)} absorb · ${h.shieldTime.toFixed(1)}s` });
    if (this.time < h.rushUntil) buffs.push({ id: 'rush', label: 'Bloodthirst', kind: 'buff', detail: `+40% speed · ${(h.rushUntil - this.time).toFixed(1)}s` });
    if (h.killchain > 0) buffs.push({ id: 'killchain', label: `Killchain ×${h.killchain}`, kind: 'buff', detail: 'Apex Predator stacks' });
    const debuffs: HeroStatusChip[] = []; // heroes take no debuffs yet — the section is wired for when they do
    // The current target's display name, resolved from the observational targetId (or null).
    let target: string | null = null;
    if (h.targetId >= 0) {
      const e = this.enemies.find((en) => en.id === h.targetId && en.alive);
      if (e) target = ENEMY_DEFS[e.kind].name;
    }
    // Live effective stats (same folds combat uses, incl. Hero Evolution): damage = base × gear ×
    // biome × stars/mastery × Evolution; attackSpeed folds the haste mult; moveSpeed the steady rate.
    const damage = def.attackRange > 0 ? def.attackDamage * this.heroDamageMult(h) : 0;
    return {
      kind: h.kind,
      name: def.name,
      combatClass: def.combatClass,
      damage: Math.round(damage),
      attackSpeed: def.attackInterval > 0 ? this.heroHaste(h) / def.attackInterval : 0,
      moveSpeed: Math.round(this.heroSpeed(h)),
      hp: Math.max(0, Math.round(h.hp)),
      maxHp: Math.round(h.maxHp),
      shield: Math.round(h.shield),
      down: h.down,
      respawn: Math.max(0, h.respawn),
      state: h.moveState,
      target,
      cooldowns,
      buffs,
      debuffs,
    };
  }

  getSnapshot(): HudSnapshot {
    const h = this.primaryHero;
    return {
      phase: this.phase,
      wave: this.waveIndex,
      totalWaves: this.tutorialWaves > 0 ? this.tutorialWaves : this.totalWaves,
      biomass: Math.floor(this.biomass),
      integrity: Math.ceil(this.integrity),
      maxIntegrity: this.maxIntegrity,
      hiveAttackers: this.hiveAttackers,
      hiveDps: this.hiveDps,
      hiveRecentDamage: this.hiveRecentDamage,
      kills: this.kills,
      conveyor: {
        favorite: this.favoriteTower,
        deployCost: deployCost(this.deployments),
        recycleValue: recycleValue(),
        strainCostFrom: [strainCost(this.deployments, 1), strainCost(this.deployments, 2), strainCost(this.deployments, 3), strainCost(this.deployments, 4)],
        items: this.conveyor.map((c) => ({
          id: c.id,
          kind: c.kind,
          rarity: c.rarity,
          strain: c.strain,
          growFrac: c.readyAt <= this.time ? 1 : Math.min(1, Math.max(0, (this.time - c.bornAt) / Math.max(0.01, c.readyAt - c.bornAt))),
          readyIn: Math.max(0, c.readyAt - this.time),
          free: c.free === true,
        })),
      },
      hero: {
        kind: h.kind,
        down: h.down,
        respawn: h.respawn,
        hp: Math.ceil(h.hp),
        maxHp: h.maxHp,
        shield: Math.ceil(h.shield), // 0 when no shield (zeroed on expiry in updateHero)
        abilityReady: h.abilityCd <= 0 && !h.down,
        abilityCd: Math.max(0, h.abilityCd),
        abilityCdMax: this.heroAbilityCooldownFor(h),
      },
      enemiesAlive: this.enemies.length,
      // Banner rides the danger-camera STATE (deliberate entry + min-hold + smooth exit,
      // docs/CAMERA.md) — the targeting override keeps its own instantaneous in-zone list.
      emergency: this.dangerCam.phase === 'danger',
      // Draft DTOs describe the LEVELED effects — the exact effects a pick will apply
      // (docs/CARDS.md §language) — so the generated text and comparison math never lie.
      draft: this.draft ? this.draftOffers(this.draft) : null,
      draftKind: this.draftKind,
      draftsOwed: this.draftsOwed,
      spliceCost: this.spliceOn && this.phase === 'prep' && !this.tutorialMode && this.dailyFx.draftEveryWaves <= 0 ? this.spliceCost() : -1,
      // §reroll: the open draft's one paid re-deal — price, or -1 once used / in the tutorial.
      draftRerollCost: this.phase === 'draft' && this.draft !== null && !this.draftRerolled && !this.tutorialMode ? this.rerollCost() : -1,
      earlyCall: this.earlyCallBonus(),
      liveThreat: this.liveThreatView(),
      squeezePressure: this.squeezePressure,
      selectedTower: this.selectedTower,
      selectedPlaced: this.selectedPlacedView(),
      armedAbility: this.armedAbility,
      cards: this.chosenCards,
      buffs: this.activeBuffs(),
      bossBanner: this.bossBanner(),
      megaBanner: this.megaBanner(),
      mutation:
        this.mutation && this.time - this.mutation.at < MUTATION_BANNER_LIFE
          ? { id: this.mutation.id, title: this.mutation.title, sub: this.mutation.sub, branchId: this.mutation.branchId, color: this.mutation.color }
          : null,
      endless: this.mode === 'endless',
      bossRush: this.mode === 'bossRush',
      rushColumnIn: this.phase === 'wave' && this.rushColumnDue > this.time && this.settleTimer <= 0 ? Math.ceil(this.rushColumnDue - this.time) : null,
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
      selectedHero: this.selectedHeroView(),
      anticipation: this.tutorialWaves > 0 ? [] : this.nextAnticipation(), // the lesson has no finale to anticipate
      autoStart: this.autoStart,
      hiveReady: this.hiveReadySnapshot(),
      threat: this.threat,
      autoStartIn: this.autoStart && this.autoStartReady && this.phase === 'prep' ? Math.max(0, this.prepCountdown) : 0,
      autoStartWaiting: this.autoStart && !this.autoStartReady,
      autocast: { unlocked: this.autocastUnlocked, on: this.autocastOn, cost: HERO_AUTOCAST.cost, affordable: this.biomass >= HERO_AUTOCAST.cost },
      heroEvo: { levels: { ...this.heroEvoLevels }, totalOwned: heroEvoTotalOwned(this.heroEvoLevels) },
    };
  }

  /** The open draft's DTOs — the LEVELED effects a pick will apply — each stamped with its DRAFT FIT
   *  (docs/CARDS.md §fit) when the feature is on (the ◆PICK + "off-build" read it). */
  private draftOffers(draft: readonly CardDef[]): CardOption[] {
    const fit = this.draftFitOn ? this.draftFitContext(false) : undefined;
    return draft.map((c) => {
      const o = cardToOption(c, effectiveGeneEffects(c, this.geneLevels[c.id] ?? 0, 0, this.geneTranscends[c.id]));
      if (fit) o.fit = draftFitOf(c, fit);
      return o;
    });
  }

  /** Upcoming named beats so the player ALWAYS has something to look forward to (the pacing
   * "always something to anticipate" hook). Pure read-model — never touches the sim. */
  private nextAnticipation(): string[] {
    if (this.phase === 'won' || this.phase === 'lost') return [];
    const out: string[] = [];
    if (this.mode === 'bossRush') {
      // Wave N = N bosses — the next siege line is ALWAYS worth dreading (docs/BOSS-RUSH.md).
      const nextWave = this.waveIndex + 1;
      // §wall: mid-wave the rail counts down to the column that marches in regardless.
      if (this.phase === 'wave' && this.rushColumnDue > this.time && this.settleTimer <= 0) out.push(`Wave ${nextWave} marches in ${Math.ceil(this.rushColumnDue - this.time)}s — clear the column`);
      out.push(`${nextWave} ${nextWave === 1 ? 'boss' : 'bosses'} at wave ${nextWave}`);
      let since = this.wavesSinceDraft;
      let w = this.phase === 'wave' ? this.waveIndex - 1 : this.waveIndex;
      do { w++; since++; } while (since < RUSH.draftEvery);
      out.push(`Gene Card at wave ${w}`);
      return out;
    }
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
    // Identity fields (docs/BOSS-DESIGN.md §identity): the epithet + kit come off the def —
    // authored bosses carry an authored epithet; procedural ones derive theirs at assembly.
    const def = bossDef(worst.boss.defId) ?? this.procBosses.get(worst.boss.defId);
    return {
      name: worst.boss.name,
      epithet: def?.epithet ?? '',
      kit: def?.modules.map((m) => m.kind) ?? [],
      hpPct: Math.max(0, worst.hp / worst.maxHp),
      phase: worst.boss.phase + 1,
      phases: worst.boss.phases,
      telegraph: worst.boss.telegraph,
    };
  }

  /** The Mega Boss raid bar (docs/MEGA-BOSS.md §hud) — null on every run without one. */
  private megaBanner(): HudSnapshot['megaBanner'] {
    const rt = this.mega;
    if (rt === null || rt.deathT > 0) return null;
    const def = megaBossDef(rt.defId);
    if (!def) return null;
    const view = this.megaBossView()!;
    return {
      name: def.name,
      title: def.title,
      hpPct: Math.max(0, rt.hp / rt.maxHp),
      phase: rt.phase + 1,
      phases: def.phases.length,
      telegraph: view.telegraph,
      stunned: rt.stunned > 0,
      stagger: rt.stagger,
      staggered: this.time < rt.staggeredUntil,
      exposed: this.time < rt.exposedUntil,
      // §dormancy: buried between waves — the greyed bar must not claim active regen (nothing
      // ticks while dormant), so the regen chip is gated on being surfaced.
      dormant: rt.burrow >= 0.5,
      regenActive: rt.burrow < 0.5 && ((def.phases[rt.phase].regenPerSec ?? 0) > 0 || rt.evolveStacks > 0) && this.time >= rt.regenOffUntil && rt.hp < rt.maxHp,
      armored: rt.armor > 0,
      effects: view.effects,
      weakPoints: rt.weakPoints
        .filter((w) => w.state === 'open')
        .map((w) => ({ kind: w.kind, name: WEAK_POINT_DEFS[w.kind].name, hpPct: Math.max(0, w.hp / w.maxHp), note: WEAK_POINT_DEFS[w.kind].hudNote })),
      glow: def.palette.glow,
    };
  }

  /** Deal direct damage to the live Mega Boss (tests / balance probes only — bypasses armor). */
  debugDamageMega(n: number): void {
    if (this.mega !== null && this.mega.deathT === 0) this.mega.hp -= n;
  }

  /** Spawn an authored boss (debug / director). */
  debugSpawnBoss(): void {
    this.spawnBoss(bossDef('progenitor')!);
  }

  /** Assemble + register + spawn a procedural boss at a Threat Level (director/endless). */
  spawnProceduralBoss(tl: number, strengthScale = 1, hpScale = 1): void {
    let def = assembleBoss(() => this.rng.next(), tl, this.activeBiome.mods.bossChassisBias);
    // Boss Rush entry columns (ramped waves 1–3): re-roll a burrower vanguard — tunneling under
    // the WHOLE defense line is uncounterable on an opening board (probe-verified wipe). From
    // wave 4 every module is legal. Deterministic (same rng stream), bounded.
    if (strengthScale < 1) {
      let guard = 0;
      while (def.modules.some((m) => m.kind === 'burrower') && guard++ < 6) {
        def = assembleBoss(() => this.rng.next(), tl, this.activeBiome.mods.bossChassisBias);
      }
    }
    // Same chassis + same ⌊TL⌋ assemble under the same id — uniquify so concurrent bosses
    // (Boss Rush fields many at once) never swap each other's def resolution mid-fight.
    if (this.procBosses.has(def.id)) def.id = `${def.id}_${this.nextId}`;
    if (strengthScale !== 1 || hpScale !== 1) {
      // Boss Rush strength curve: HP + contact damage ease in early, overload deep — but damage
      // caps sooner (RUSH.damageCap) so deep walls are out-tanked, not one-shot roulette. HP also
      // carries the account sizing (§wall: rushSizing — 1 in every other mode).
      def.hpMult *= strengthScale * hpScale;
      def.damage = Math.round(def.damage * Math.min(RUSH.damageCap, strengthScale));
    }
    // Boss Rush: FLAT bounty — the assembled TL-scaled bounty made the column fund the very
    // board that kills it (every difficulty lever self-cancelling, probe-verified). Flat pay
    // decouples income (∝N) from threat (∝N×TL). Endless/debug keep the assembled value.
    if (this.mode === 'bossRush') def.bounty = RUSH.bossBounty;
    this.procBosses.set(def.id, def);
    this.spawnBoss(def);
  }

  /** Composition of the wave that Start Wave will launch next (null if none left). */
  getNextWavePreview(): WavePreviewEntry[] | null {
    if (this.mode === 'endless' || this.mode === 'bossRush' || this.waveIndex >= this.totalWaves) return null;
    // v3 live composition: the NEXT wave as it would launch right now (preview == outcome while the
    // board is unchanged — the same rule as the ADAPTED chip). ×1 (the plain plan) for every other run.
    const m = this.livePowerBase !== null && this.waveIndex + 1 >= DIRECTOR_ADAPTIVE.liveFromWave ? this.dd.liveThreatMult(this.livePowerRatio()) : 1;
    const live = this.liveWave(this.waveIndex, m);
    const out = wavePreview(live.wave);
    if (live.probe !== null) { // v4: the briefing names the probe role and the coverage it tests
      const p = live.probe;
      const e = out.find((x) => x.kind === p.kind);
      if (e) e.probe = { label: p.label, lacks: COVERAGE_AXIS_NAME[p.axis] };
    }
    return out;
  }

  /** §6a LIVE COMPOSITION: wave `idx0` as it launches at live multiplier m — the board's PROBE role
   *  swapped in (campaign.ts liveProbe: the role whose answering coverage axis the fielded board covers
   *  least, coverage.ts), then the ELITE share promoted. Pure in (plan, board, m) — the prep preview and
   *  the launch call it identically. `probe` is non-null only when the probe actually joined the wave.
   *  The plain plan (same array) at m ≤ 1, i.e. on every run that did not opt in. */
  private liveWave(idx0: number, m: number): { wave: WaveDef; probe: LiveProbe | null } {
    const base = this.waves[idx0];
    if (!(m > 1) || this.stage === null) return { wave: base, probe: null };
    const probe = this.dd.liveProbeShare(m) > 0 ? liveProbe(this.stage.enemyPool, this.towers, DIRECTOR_ADAPTIVE.liveProbeGapTie) : null;
    const probed = probe !== null ? swapInProbe(base, probe.kind, this.dd.liveProbeShare(m, (idx0 + 1) / this.totalWaves)) : base;
    return { wave: promoteEliteShare(probed, this.dd.liveEliteShare(m)), probe: probed !== base ? probe : null };
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

  /** Bosses still standing when the Nucleus fell, with the HP fraction they had left (split
   *  children pool under their parent's name; the anchored mega joins as its own row). */
  /** The Mega Hunt read (docs/MEGA-BOSS.md §hunt): the organism still standing (its wound so far),
   *  else the last one felled this run (hpTorn 1). Observation only — never feeds the sim. */
  private megaHuntRead(): { defId: string; tier: number; hpTorn: number; organs: number } | undefined {
    const rt = this.mega;
    if (rt !== null && rt.deathT <= 0) return { defId: rt.defId, tier: rt.tier, hpTorn: Math.max(0, Math.min(1, 1 - rt.hp / Math.max(1, rt.maxHp))), organs: rt.wpDestroyed };
    const k = this.runMegaKills[this.runMegaKills.length - 1];
    return k ? { defId: k.defId, tier: k.tier, hpTorn: 1, organs: k.weakPoints } : undefined;
  }

  private bossHpAtDefeat(): { name: string; hpFrac: number }[] {
    const pools = new Map<string, { hp: number; max: number }>();
    for (const e of this.enemies) {
      if (!e.alive || !e.boss) continue;
      const p = pools.get(e.boss.name) ?? { hp: 0, max: 0 };
      p.hp += Math.max(0, e.hp);
      p.max += Math.max(1, e.maxHp);
      pools.set(e.boss.name, p);
    }
    const out = [...pools].map(([name, p]) => ({ name, hpFrac: Math.min(1, p.hp / p.max) }));
    const mega = this.mega;
    const megaName = mega ? megaBossDef(mega.defId)?.name : undefined;
    if (mega && megaName && mega.hp > 0) out.push({ name: megaName, hpFrac: Math.min(1, mega.hp / Math.max(1, mega.maxHp)) });
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
      integrityLost: this.statIntegrityLost,
      killsByEnemy: { ...this.statKillsByEnemy },
      towerBuilds: { ...this.statTowerBuilds },
      cardIds: this.chosenCards.map((c) => c.id),
      heroId: this.primaryHero.kind,
      maxStrain: this.towers.reduce((m, t) => Math.max(m, t.strain), this.statMaxStrain),
      strains: this.statStrains,
      strainByKind: { ...this.statStrainByKind },
      bossKills: this.runBossKills,
      // NEMESIS seed (docs/NEMESIS.md): only a LOSS records which bosses were still standing.
      ...(this.phase === 'lost'
        ? { bossesAtDefeat: this.enemies.filter((e) => e.alive && e.boss).map((e) => e.boss!.defId) }
        : {}),
      // Defeat debrief (docs/REWARD-PRESENTATION.md §debrief) — observation-only ledgers.
      totalWaves: this.mode === 'endless' || this.mode === 'bossRush' ? 0 : this.totalWaves,
      hiveDamageBy: { ...this.statHiveDamageBy },
      bossesSlain: [...this.statBossesSlain],
      ...(this.phase === 'lost' ? { bossHpAtDefeat: this.bossHpAtDefeat() } : {}),
      // Board + anti-air read (debrief §board/§anti-air) — LOSS only, so every win serializes as before.
      ...(this.phase === 'lost'
        ? {
            boardAtEnd: this.towers.length,
            slotsAtEnd: this.unlockedSlots,
            ...(this.firstFlierAt >= 0 ? { firstFlierSec: this.firstFlierAt, firstFlierWave: this.firstFlierWave } : {}),
            ...(this.firstAirKillAt >= 0 ? { firstAirKillSec: this.firstAirKillAt } : {}),
          }
        : {}),
      // Mega Boss block — present only when a mega was ENCOUNTERED this run, so every existing
      // fixture (and every ordinary run) serializes exactly as before.
      ...(this.statMegaSeen
        ? {
            megaKills: [...this.runMegaKills],
            weakPointsDestroyed: this.statWpDestroyed,
            weakPointKinds: [...this.statWpKinds],
            megaInterrupts: this.statMegaInterrupts,
            megaAbilitiesSurvived: this.statMegaSurvived,
            megaHunt: this.megaHuntRead(),
          }
        : {}),
    };
  }
}
