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
  nucleusPoint,
  reachedBottom,
  slotAt,
  slotsAdjacent,
  topSpawn,
  towerSlots,
} from './map';
import type { TowerSlot } from './map';
import {
  COMBAT,
  ECON,
  ENEMY_DEFS,
  ENEMY_KINDS,
  FX,
  HERO_DEFS,
  HERO_ORDER,
  MOVE,
  PARTICLE,
  PERF,
  SIM_DT,
  SLOTS,
  STATUS,
  STEER,
  TOWER_DEFS,
  TOWER_ORDER,
  TOTAL_WAVES,
  TOWER_ABILITIES,
  HERO_PULSE,
  HERO_ULT,
  WAVES,
  WAVE_BOUNTY_GROWTH,
  WAVE_HP_GROWTH,
} from './config';
import type { HeroDef } from './config';
import {
  CARD_POOL,
  applyCard,
  cardToOption,
  defaultRunModifiers,
  draftCards,
} from './cards';
import type { CardContext, CardDef, CardEffect, RunModifiers } from './cards';
import { damageAfter, effectiveArmor, fractureCap, shredBurst } from './combat';
import { CHASSIS, assembleBoss, bossDef } from './boss';
import type { BossDef } from './boss';
import { BOSS, DIRECTOR, REACTIONS } from './config';
import { pendingReaction } from './reactions';
import type { ReactionDef } from './reactions';
import { Director } from './director';
import { runAbilities, runAbility } from './ability';
import type { AbilityCast, AbilityContext, ParticleKind, StatusApplication } from './ability';
import { aggregate as aggregateStatuses, applyStatus as applyStatusInstance, statusRegistry, tickStatuses } from './status';
import { SpawnDirector } from './spawndirector';
import type { QueuedSpawn } from './spawndirector';
import { resolveDifficulty } from './difficulty';
import type { DifficultyDef } from './difficulty';
import { resolveDoctrine } from './doctrines';
import { combineMult } from './modifiers';
import { sortByProfile } from './targeting';
import type { TargetingProfile } from './targeting';
import { gameEvents } from './events';

export type RunMode = 'stage' | 'endless';

/** Options a run can boot with. */
export interface RunOptions {
  runEffects?: CardEffect[]; // run-start effects folded into the R-bucket (e.g. equipment)
  mode?: RunMode; // 'stage' = authored WAVES (default, golden path); 'endless' = AI Director
  difficulty?: string; // universal difficulty id (default 'standard' = identity/golden path)
  doctrine?: string; // exclusive run-start build commitment (default 'none' = no effects)
}

/** Fold a declarative effect into the run modifiers (mul/add/flag; grants handled at boot). */
function applyRunEffect(mods: RunModifiers, e: CardEffect): void {
  if (e.op === 'mul') mods[e.field] *= e.value;
  else if (e.op === 'add') mods[e.field] += e.value;
  else if (e.op === 'flag') mods[e.field] = true;
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
  Particle,
  Phase,
  Pool,
  Projectile,
  ProjectileBehavior,
  RunStats,
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
    const e = idx.get(g.kind);
    if (e) e.count += g.count;
    else {
      const entry = { kind: g.kind, count: g.count };
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
  phase: Phase;
  selectedTower: TowerKind | null;
  armedAbility: boolean;
  unlockedSlots: number;
  time: number; // sim seconds — drives presentation pulses/animation
  integrity: number;
  maxIntegrity: number;
}

export class Game {
  phase: Phase = 'prep';
  waveIndex = 0; // waves started/cleared so far (= Depth in endless)
  readonly totalWaves = TOTAL_WAVES;
  readonly mode: RunMode;
  private director: Director | null = null;
  // Universal difficulty (global scalars layered on the base curves); 'standard' = identity.
  private readonly diff: DifficultyDef;
  // Spawn Director: owns spawn spacing/timing/pacing/elite/boss/special-event scheduling.
  private readonly spawner = new SpawnDirector();
  biomass: number;
  integrity: number;
  maxIntegrity: number;
  kills = 0;
  unlockedSlots = SLOTS.initialUnlocked; // raised by future upgrades
  time = 0;

  // debug-only knobs — no effect at their defaults (driven by the debug panel)
  god = false;
  timeScale = 1;

  enemies: Enemy[] = [];
  towers: Tower[] = [];
  projectiles: Projectile[] = [];
  pools: Pool[] = [];
  floats: FloatingText[] = [];
  particles: Particle[] = [];
  // The active hero roster. One today (the selected hero); the array is the seam for
  // future hero slots (HEROES.md) — slot unlocks just push more heroes in.
  heroes: Hero[];
  mods: RunModifiers;
  // Per-tower-kind permanent buffs (stars + mastery), frozen at construction so a
  // run stays deterministic; identity for a fresh save.
  private towerProgress: TowerProgress;
  // Per-hero permanent buffs (stars + mastery + equipment); identity for a fresh save.
  private heroProgress: HeroProgress;
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
  private nextId = 1;
  private armorBreakUntil = new Map<number, number>();
  private acc = 0; // fixed-timestep accumulator

  // ── Ability execution (Part 2): the shared executor's context + per-cast scratch ──
  // The active cast's source (for mastery credit) + caster (for self-heal). Set right
  // before runAbilities so the context's primitives credit/heal the right unit.
  private abilitySourceKind: TowerKind | null = null;
  private abilityHeroKind: HeroKind | null = null;
  private abilityCaster: Hero | null = null;
  private abilityTargeting: TargetingProfile = 'closestToBase'; // the active cast's target pick
  private castExtraProjectiles = 0; // star-kit projectile bonus for the active tower cast (0 = base)
  private castSplashMult = 1; // star-kit splash multiplier for the active tower cast (1 = base)
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
    this.heroProgress = heroProgress;
    this.diff = resolveDifficulty(opts.difficulty);
    this.mode = opts.mode ?? 'stage';
    if (this.mode === 'endless') this.director = new Director(() => this.rng.next(), this.diff);
    this.mods = defaultRunModifiers();
    // Fold permanent (meta) multipliers into the run as starting buckets.
    this.mods.towerDamageMult = meta.towerDamageMult;
    this.mods.biomassMult = meta.biomassMult;
    this.mods.heroDamageMult = meta.heroDamageMult;
    // Fold the chosen doctrine's run-start effects, then run-start effects (equipment, …).
    // 'none' / no gear contribute nothing, so a default run stays byte-identical.
    for (const e of resolveDoctrine(opts.doctrine).effects) applyRunEffect(this.mods, e);
    if (opts.runEffects) for (const e of opts.runEffects) applyRunEffect(this.mods, e);
    this.maxIntegrity = (ECON.baseIntegrity + meta.integrityBonus) * this.mods.integrityMult;
    this.integrity = this.maxIntegrity;
    this.biomass = ECON.startingBiomass + this.mods.startBiomassBonus;
    this.heroes = [this.makeHero(heroKind)];
  }

  /** Build a hero runtime instance from its data-driven definition. */
  private makeHero(kind: HeroKind): Hero {
    const def = HERO_DEFS[kind];
    const maxHp = def.maxHp * this.mods.heroMaxHpMult; // equipment survivability folds in here
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
    };
  }

  /** The player-controlled (slot-1) hero — abilities, HUD, and pings target it. */
  private get primaryHero(): Hero {
    return this.heroes[0];
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
      grantShield: () => {
        /* reserved: no shield mechanic yet — the Part 3 status framework will back this */
      },
      particles: (x, y, kind: ParticleKind) => this.spawnParticles(x, y, PARTICLE[kind]),
      sfx: (k) => this.pushSfx(k),
      roll: () => this.rng.next(),
      get extraProjectiles() {
        return self.mods.needleExtraProjectiles + self.castExtraProjectiles; // run-mods + star kit
      },
      get splashMult() {
        return self.mods.splashRadiusMult * self.castSplashMult; // run-mods × star kit
      },
    };
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

  /** Route a canvas click based on what is currently armed. */
  click(px: number, py: number): void {
    if (this.armedAbility) {
      this.triggerAbility(px, py);
      this.armedAbility = false;
      return;
    }
    if (this.selectedTower) {
      this.placeTower(this.selectedTower, px, py);
      return; // stay armed for repeat placement
    }
    // default: re-anchor the hero's leash
    this.setRally(px, py);
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
    });
    this.statTowerBuilds[kind]++; // lifetime-stats observation
    this.recomputeTowerCaches();
    this.pushSfx('place');
    if (gameEvents.hasListeners('towerPlaced')) gameEvents.emit('towerPlaced', { id: this.nextId - 1, kind, slot: slot.index });
    return true;
  }

  /** Unlock additional tower slots (hook for future permanent upgrades). */
  unlockSlots(n: number): void {
    this.unlockedSlots = Math.min(towerSlots.length, this.unlockedSlots + n);
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

  startWave(): void {
    if (this.phase !== 'prep') return;
    if (this.mode === 'endless') {
      this.startEndlessWave();
      return;
    }
    if (this.waveIndex >= TOTAL_WAVES) return;
    this.waveIndex++;
    const def = WAVES[this.waveIndex - 1];
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
    this.spawnedAll = false;
    this.phase = 'wave';
    this.pushSfx('wave');
    if (gameEvents.hasListeners('waveStarted')) gameEvents.emit('waveStarted', { wave: this.waveIndex, endless: false });
  }

  /** Endless wave: the AI Director composes spawns from a depth-scaled threat budget; the
   * Spawn Director lays them out on the endless cadence (incl. the swarm special event). */
  private startEndlessWave(): void {
    this.waveIndex++; // = Depth
    const depth = this.waveIndex;
    const w = this.director!.next(depth);
    const idx0 = depth - 1;
    this.spawnQueue = this.spawner.scheduleDirected(
      w,
      this.time,
      this.hpMultFor(idx0),
      this.bountyMultFor(idx0),
      this.diff.spawnRateMult,
    );
    this.spawnedAll = false;
    this.phase = 'wave';
    if (w.spawnBoss) this.spawnProceduralBoss(depth);
    this.pushSfx('wave');
    if (gameEvents.hasListeners('waveStarted')) gameEvents.emit('waveStarted', { wave: depth, endless: true });
  }

  chooseCard(id: string): void {
    if (this.phase !== 'draft' || !this.draft) return;
    const card = this.draft.find((c) => c.id === id);
    if (card) {
      applyCard(card, this.cardContext());
      this.chosenCards.push(cardToOption(card));
      this.pushSfx('draft');
      if (gameEvents.hasListeners('cardChosen')) gameEvents.emit('cardChosen', { id: card.id, rarity: card.rarity });
    }
    this.draft = null;
    this.phase = 'prep';
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
    this.time += dt;
    if (this.phase === 'wave') {
      this.spawnSystem();
      this.rebuildGrid(); // one O(n) rebuild feeds every proximity query this tick
      if (this.bossCount > 0) this.bossSystem(dt); // no-op cost when no boss is present
      this.economySystem(dt);
      this.towerSystem(dt);
      this.projectileSystem(dt);
      this.poolSystem(dt);
      this.statusSystem(dt);
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
      // prep: hero still roams; no spawns/economy/loss (overcharge is cached on placement).
      this.heroSystem(dt);
      this.floatSystem(dt);
      this.particleSystem(dt);
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
    this.enemies.push({
      id: this.nextId++,
      kind,
      x: spawn.x,
      y: spawn.y,
      hp: def.hp * hpMult * eHp,
      maxHp: def.hp * hpMult * eHp,
      baseArmor: def.armor,
      speed: def.speed,
      bounty: def.bounty * bountyMult * eBounty,
      damage: def.damage * eDmg * this.diff.enemyDamageMult,
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
    });
  }

  /**
   * Spawn a framework boss (boss.ts) — a composed encounter, not a big enemy. It
   * enters with a BossRuntime the bossSystem drives through phases/modules. Used by
   * the director / endless / debug — never in the authored golden waves.
   */
  spawnBoss(def: BossDef): void {
    const hp = BOSS.baseHp * def.hpMult;
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
          default:
            break; // charger/suppressor: reserved (defined, not yet wired)
        }
      }
      if (phase.speedMult && b.enrage === 0) e.speed = CHASSIS[def.chassis].speed * phase.speedMult;
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
    });
  }

  private economySystem(dt: number): void {
    if (this.reactorCount > 0) {
      const gain = this.reactorCount * ECON.reactorBiomassPerSec * this.mods.reactorBiomassMult * dt;
      this.biomass += gain;
      this.statBiomassEarned += gain;
    }
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
    for (const t of this.towers) {
      if (t.kind === 'reactor') {
        t.overcharged = false;
        continue;
      }
      const slot = towerSlots[t.slot];
      let oc = false;
      for (const rc of reactors) {
        if (slotsAdjacent(rc, slot)) {
          oc = true;
          break;
        }
      }
      t.overcharged = oc;
    }
  }

  private towerSystem(dt: number): void {
    const ksDmg = this.keystoneTowerDmgMult(); // run-wide keystone damage (1 = none); per-tick
    // Class resonance: the fielded hero's combat class amplifies same-class towers (off at 0).
    const resoClass = this.mods.classResonanceBonus > 0 ? HERO_DEFS[this.heroes[0].kind].combatClass : null;
    for (const t of this.towers) {
      const def = TOWER_DEFS[t.kind];
      this.masteryAccrual[t.kind].activeTime += dt; // usage signal (every deployed tower)
      if (def.firing === 'support') continue; // economy/aura only (handled elsewhere)
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const prog = this.towerProgress[t.kind]; // permanent per-kind buffs (stars + mastery)
      // Bonus math flows through the universal modifier framework (combineMult — the
      // canonical multiplier fold, bit-identical to the previous a*b*c product).
      const ocRate = t.overcharged ? 1 + ECON.overchargeRate : 1;
      const ocDmg = t.overcharged ? 1 + ECON.overchargeDamage + this.mods.reactorOverchargeBonus : 1;
      const rateMult = combineMult(this.mods.towerFireRateMult, prog.fireRateMult, ocRate);
      const reso = resoClass !== null && def.combatClass === resoClass ? 1 + this.mods.classResonanceBonus : 1;
      const dmgMult = combineMult(this.mods.towerDamageMult, prog.damageMult, ocDmg, ksDmg, reso);
      // The tower's attack is a list of reusable AbilityComponents (data), run by the
      // shared executor — no per-firing branches. The targeting profile drives which
      // enemies its projectiles pick; cooldown resets only if it acted (no target = wait).
      this.abilitySourceKind = t.kind;
      this.abilityHeroKind = null;
      this.abilityCaster = null;
      // Star evolution: targeting override + per-cast projectile/splash kit (defaults = base).
      this.abilityTargeting = prog.targeting ?? def.targeting ?? 'closestToBase';
      this.castExtraProjectiles = prog.extraProjectiles ?? 0;
      this.castSplashMult = prog.splashMult ?? 1;
      this.castScratch.x = t.x;
      this.castScratch.y = t.y;
      this.castScratch.damageMult = dmgMult;
      this.castScratch.target = null;
      let acted = runAbilities(this.actx, TOWER_ABILITIES[t.kind], this.castScratch);
      // Star-granted attacks (auras / chains / debuffs) run on the same cadence as the base.
      if (prog.extraAbilities) acted = runAbilities(this.actx, prog.extraAbilities, this.castScratch) || acted;
      if (acted) t.cooldown = def.fireInterval / rateMult;
    }
    // Reset the per-cast kit so later systems (hero casts) see base values, not a tower's.
    this.castExtraProjectiles = 0;
    this.castSplashMult = 1;
  }

  /** Up to `n` in-range enemies chosen by the tower's targeting profile (data-driven).
   * The default 'closestToBase' reproduces the historical goal-distance sort exactly. */
  private pickTargets(x: number, y: number, range: number, n: number, profile: TargetingProfile = 'closestToBase'): Enemy[] {
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
      if (p.behavior === 'homing' || p.behavior === 'parasite') {
        const target = this.enemyById.get(p.targetId); // O(1) homing lookup
        if (!target || !target.alive) {
          p.alive = false; // fizzle if the target died
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
          if (gameEvents.hasListeners('projectileHit')) gameEvents.emit('projectileHit', { x: p.x, y: p.y, damage: p.damage, targetId: p.targetId, byTower: p.sourceKind });
          p.alive = false;
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
      const step = e.speed * (1 - slow) * dt;

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
  }

  private heroSystem(dt: number): void {
    // Iterate the roster (one hero today; the loop is the multi-slot seam).
    for (const h of this.heroes) this.updateHero(h, dt);
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

    // Equipment behavior profile: a "wary" loadout disengages the hero toward the nucleus
    // at low HP instead of running its normal AI. Neutral default (threshold 0) ⇒ never
    // retreats ⇒ byte-identical to a gear-less run (golden invariant).
    if (this.mods.heroRetreatThreshold > 0 && h.hp < h.maxHp * this.mods.heroRetreatThreshold) {
      const np = moveToward(h.x, h.y, nucleusPoint.x, nucleusPoint.y, def.speed * dt);
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
    const aggroRange = def.aggroRange * this.mods.heroAggroRangeMult; // equipment aggression knob
    const aggro2 = aggroRange * aggroRange;
    let target: Enemy | null = null;
    let bestApproach = Infinity; // best among enemies still above the line
    let fallback: Enemy | null = null;
    let bestAny = Infinity;
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
    }
    target = target ?? fallback;

    const goal = target ? { x: target.x, y: target.y } : h.rally;
    const np = moveToward(h.x, h.y, goal.x, goal.y, def.speed * dt);
    h.x = Math.max(0, Math.min(WIDTH, np.x));
    h.y = Math.max(0, Math.min(HEIGHT, np.y));

    if (target && h.attackCd <= 0 && dist(h.x, h.y, target.x, target.y) <= def.attackRange) {
      const dmg = def.attackDamage * this.mods.heroDamageMult * this.heroProgress[h.kind].damageMult;
      this.heroMasteryAccrual[h.kind].damage += this.applyDamage(target, dmg);
      this.addFracture(target, def.attackFracture);
      this.maybeReact(target);
      h.attackCd = def.attackInterval;
    }
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
    const np = moveToward(h.x, h.y, gx, gy, def.speed * dt);
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
    const np = moveToward(h.x, h.y, gx, gy, def.speed * dt);
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
    this.castScratch.damageMult = this.mods.heroDamageMult * this.heroProgress[h.kind].damageMult;
    this.castScratch.target = null;
    runAbility(this.actx, pulse, this.castScratch);
  }

  /** Enemies in contact with a hero deal damage to it; at 0 HP the hero is downed. */
  private heroContactDamage(h: Hero, def: HeroDef, dt: number): void {
    let incoming = 0;
    const near = this.neighborScratch;
    this.grid.queryInto(h.x, h.y, def.contactRange + COMBAT.heroContactMargin, near);
    for (let k = 0; k < near.length; k++) {
      const e = near[k];
      if (!e.alive) continue;
      if (dist(h.x, h.y, e.x, e.y) <= def.contactRange + ENEMY_DEFS[e.kind].radius) incoming += e.damage;
    }
    if (incoming > 0 && !this.god) {
      h.hp -= incoming * dt;
      if (h.hp <= 0) {
        h.down = true;
        h.respawn = def.respawnTime;
        this.floats.push({ x: h.x, y: h.y - 20, text: 'DOWN', color: '#ff5d73', life: 1.2 });
      }
    }
  }

  /** Cast the primary hero's signature ability at (px,py) — dispatched by hero data:
   * Ravager leaps + fractures, Shepherd blooms (heal + AoE), Overseer floods Disruption. */
  private triggerAbility(px: number, py: number): void {
    const h = this.primaryHero;
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
    this.castScratch.damageMult = this.mods.heroDamageMult * this.heroProgress[h.kind].damageMult;
    this.castScratch.target = null;
    runAbilities(this.actx, HERO_ULT[h.kind], this.castScratch);
    h.abilityCd = ab.cooldown * this.mods.heroCooldownMult * this.heroProgress[h.kind].cooldownMult;
    this.pushSfx('ability');
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
      this.projectiles.push(p);
    } else {
      this.projectiles.push({ id: this.nextId++, x, y, tx, ty, speed, targetId, damage, behavior, splash, alive: true, sourceKind });
    }
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

  /** Cosmetic burst. Uses the FX rng (never the gameplay rng) + pooling + budget. */
  private spawnParticles(
    x: number, y: number,
    spec: { count: number; speed: number; life: number; size: number; color?: string },
    color?: string,
  ): void {
    const col = color ?? spec.color ?? '#ffffff';
    for (let i = 0; i < spec.count; i++) {
      if (this.particles.length >= PERF.maxParticles) break; // budget
      const ang = this.fxRng.next() * Math.PI * 2;
      const spd = spec.speed * (0.4 + this.fxRng.next() * 0.6);
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

  private checkWaveEnd(): void {
    if (this.phase !== 'wave') return;
    if (this.spawnedAll && this.spawnQueue.length === 0 && this.enemies.length === 0) {
      if (gameEvents.hasListeners('waveCompleted')) gameEvents.emit('waveCompleted', { wave: this.waveIndex, endless: this.mode === 'endless' });
      // Endless never "wins" — it only ends when the Nucleus falls. Stage caps at 12.
      if (this.mode === 'stage' && this.waveIndex >= TOTAL_WAVES) {
        this.phase = 'won';
      } else {
        this.draft = draftCards(this.rng, 3);
        this.phase = 'draft';
      }
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
    if (e.disrupt > 0) m += STATUS.disruptVulnerability + this.mods.obeliskVulnerabilityBonus;
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
    const r = STATUS.infectionSpreadRadius;
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
    e.hp -= applied;
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
    this.draft = draftCards(this.rng, 3);
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

  private pushSfx(k: string): void {
    if (this.sfx.length < 256) this.sfx.push(k);
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
      phase: this.phase,
      selectedTower: this.selectedTower,
      armedAbility: this.armedAbility,
      unlockedSlots: this.unlockedSlots,
      time: this.time,
      integrity: this.integrity,
      maxIntegrity: this.maxIntegrity,
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
        abilityReady: h.abilityCd <= 0 && !h.down,
        abilityCd: Math.max(0, h.abilityCd),
        abilityCdMax: ab.cooldown * this.mods.heroCooldownMult * this.heroProgress[h.kind].cooldownMult,
      },
      enemiesAlive: this.enemies.length,
      draft: this.draft ? this.draft.map(cardToOption) : null,
      selectedTower: this.selectedTower,
      armedAbility: this.armedAbility,
      cards: this.chosenCards,
      buffs: this.activeBuffs(),
      bossBanner: this.bossBanner(),
      endless: this.mode === 'endless',
    };
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
    const def = assembleBoss(() => this.rng.next(), tl);
    this.procBosses.set(def.id, def);
    this.spawnBoss(def);
  }

  /** Composition of the wave that Start Wave will launch next (null if none left). */
  getNextWavePreview(): WavePreviewEntry[] | null {
    if (this.mode === 'endless' || this.waveIndex >= TOTAL_WAVES) return null;
    return wavePreview(WAVES[this.waveIndex]);
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
