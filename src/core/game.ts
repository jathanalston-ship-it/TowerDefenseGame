// The simulation: a deterministic, fixed-timestep tower-defense run. Plain TS —
// no React/DOM imports (ARCHITECTURE.md §2,§7). The Game owns all run (R-bucket)
// state; it evaporates when a new Game is constructed, which is why nothing here
// is ever persisted (PROGRESSION.md §1.1: the run is temporary).

import { Rng } from './rng';
import { dist, dist2, moveToward } from './math';
import { SpatialGrid } from './spatial';
import {
  CELL,
  CLASSIC_LAYOUT,
  DEFENSE_TOP_Y,
  HEIGHT,
  REACH_Y,
  WIDTH,
  flowDirAt,
  goalDistanceAt,
  loadArena,
  nucleusPoint,
  reachedBottom,
  slotAt,
  slotsAdjacent,
  spawnSegments,
  topSpawn,
  towerSlots,
} from './map';
import type { TowerSlot } from './map';
import {
  defaultStageMods,
  envModifier,
  generateEndlessWave,
  generateStage,
} from './stage';
import type { StageDef, StageMods, StageObjective, SpawnZone } from './stage';
import { BIOMES, DEFAULT_PALETTE } from './biomes';
import type { BiomeId, BiomePalette } from './biomes';
import {
  CARD_FX,
  ECON,
  ELITE,
  ENEMY_DEFS,
  HERO,
  PARTICLE,
  PERF,
  SIM_DT,
  SLOTS,
  LOOT,
  STATUS,
  STEER,
  TOWER_DEFS,
  WAVE_FLOW,
} from './config';
import type { StarStat } from './config';
import {
  CLASSIC_CAMPAIGN,
  CLASSIC_WAVE_COUNT,
  waveDifficulty,
} from './wavecomposer';
import type { WaveGroup } from './wavecomposer';
import {
  CARD_POOL,
  cardToOption,
  defaultRunModifiers,
  draftCards,
} from './cards';
import type { CardContext, CardDef, RunModifiers } from './cards';
import type {
  Enemy,
  EnemyKind,
  EnemyShot,
  Hero,
  HudSnapshot,
  MetaModifiers,
  Particle,
  Phase,
  Pool,
  Projectile,
  Tower,
  TowerKind,
  FloatingText,
} from './types';

interface QueuedSpawn {
  kind: Enemy['kind'];
  at: number; // sim-time to spawn
  hpMult: number;
  bountyMult: number;
  elite: boolean;
}

export interface RenderState {
  enemies: Enemy[];
  towers: Tower[];
  projectiles: Projectile[];
  enemyShots: EnemyShot[];
  pools: Pool[];
  floats: FloatingText[];
  particles: Particle[];
  hero: Hero;
  phase: Phase;
  selectedTower: TowerKind | null;
  armedAbility: boolean;
  unlockedSlots: number;
  time: number; // sim seconds — drives presentation pulses/animation
  integrity: number;
  maxIntegrity: number;
  // biome theming (renderer reads these instead of hardcoded colors)
  palette: BiomePalette;
  lighting: number;
  ambient: { motes: number; fog: number; pulse: number };
  spawnZones: readonly SpawnZone[];
  rangeMult: number; // tower range mult (Dense Fog etc.) for the placement preview
}

export type GameMode = 'classic' | 'stage' | 'endless';

export interface GameConfig {
  mode: GameMode;
  stage?: StageDef; // required for 'stage'
  biome?: BiomeId; // optional starting biome for 'endless'
}

/** Permanent per-run fold applied at run start: per-tower Star stats + a RunModifiers
 *  applier that layers Star unlocks AND equipped Hero gear onto the run. Optional:
 *  omitted in tests/headless → no permanent bonus → deterministic baseline. */
export interface RunFold {
  stat: Record<TowerKind, StarStat>;
  apply: (m: RunModifiers) => void;
}

export class Game {
  readonly mode: GameMode;
  readonly stage: StageDef | null;
  readonly biome: BiomeId | null;
  phase: Phase = 'prep';
  waveIndex = 0; // waves started/cleared so far
  totalWaves: number; // finite for classic/stage; Infinity for endless
  biomass: number;
  integrity: number;
  maxIntegrity: number;
  kills = 0;
  unlockedSlots = SLOTS.initialUnlocked; // raised by future upgrades
  time = 0;
  // objective / scoring tracking
  leaks = 0; // enemies that breached the line
  apexUses = 0; // Apex Leap activations
  towersBuilt = 0;
  // Automatic wave flow: the Build-Phase countdown that auto-starts the next wave.
  // -1 = inactive (run start before the first tower, or during a wave/draft);
  // ≥0 = seconds remaining. Sim-time based, so it stays deterministic.
  buildCountdown = -1;
  earlyBonus = 0; // amount of the most recent early-start bonus
  earlyBonusSeq = 0; // increments on each grant so the HUD can pop it once
  // Per-wave tallies (reset each wave) → the Build-Phase wave summary.
  private waveKills = 0;
  private waveBiomass = 0;
  lastWaveSummary: { wave: number; kills: number; biomass: number } | null = null;
  // Persistent Loot Meter contribution earned THIS run (kills + completed waves).
  // Run-local + monotonic; the meta layer folds the delta into the saved meter.
  lootProgress = 0;
  // discovery tracking (write-only observability → Codex; never reads back into sim,
  // so determinism is unaffected). Surfaced via getResult() for the meta layer.
  readonly seenEnemies = new Set<EnemyKind>();
  readonly seenCards = new Set<string>();

  private stageMods: StageMods;
  private readonly seed: number;
  private starStat: Record<TowerKind, StarStat> | null = null; // per-kind Star stat fold

  // debug-only knobs — no effect at their defaults (driven by the debug panel)
  god = false;
  timeScale = 1;
  debugDamageMult = 1; // scales player damage output (applyDamage)
  debugHpMult = 1; // scales enemy HP at spawn (makeEnemyAt)
  debugTrackDps = false; // when on, hurt() records hits for the DPS readout
  private dpsHits: { t: number; amount: number }[] = []; // rolling damage log (debug)

  enemies: Enemy[] = [];
  towers: Tower[] = [];
  projectiles: Projectile[] = [];
  enemyShots: EnemyShot[] = []; // Ranged-enemy shots aimed at the hero
  pools: Pool[] = [];
  floats: FloatingText[] = [];
  particles: Particle[] = [];
  hero: Hero;
  mods: RunModifiers;

  selectedTower: TowerKind | null = null;
  armedAbility = false;
  draft: CardDef[] | null = null;

  private rng: Rng;
  private fxRng: Rng; // cosmetic-only stream (particles) — keeps gameplay rng pure
  private grid = new SpatialGrid<Enemy>(WIDTH, HEIGHT, PERF.spatialCell);
  private projPool: Projectile[] = [];
  private partPool: Particle[] = [];
  private targetScratch: Enemy[] = [];
  private neighborScratch: Enemy[] = [];
  private occupied = new Set<number>();
  private needleFocus = new Map<number, Enemy>(); // towerId -> sticky focus-fire target
  private spawnQueue: QueuedSpawn[] = [];
  private spawnedAll = false;
  private nextId = 1;
  private armorBreakUntil = new Map<number, number>();
  private acc = 0; // fixed-timestep accumulator

  constructor(seed: number, meta: MetaModifiers, config: GameConfig = { mode: 'classic' }, fold?: RunFold) {
    this.seed = seed >>> 0;
    this.rng = new Rng(seed);
    this.fxRng = new Rng((seed ^ 0x9e3779b9) >>> 0);
    this.mode = config.mode;
    this.stage = config.stage ?? null;
    this.stageMods = defaultStageMods();

    // ── Configure the arena, biome, wave source and stage modifiers per mode. ──
    if (this.mode === 'stage' && this.stage) {
      loadArena(this.stage.layout);
      this.biome = this.stage.biome;
      for (const id of this.stage.mods) envModifier(id)?.apply(this.stageMods);
      this.totalWaves = this.stage.waves.length;
    } else if (this.mode === 'endless') {
      // Reuse the modular generator for a coherent arena + biome; waves are
      // generated per-index for unbounded escalation (no env modifiers).
      const base = generateStage(this.seed, 1);
      loadArena(base.layout);
      this.biome = config.biome ?? base.biome;
      this.totalWaves = Infinity;
    } else {
      loadArena(CLASSIC_LAYOUT);
      this.biome = null;
      this.totalWaves = CLASSIC_WAVE_COUNT;
    }

    this.mods = defaultRunModifiers();
    // Fold permanent (meta) multipliers — from every upgrade track — into the run.
    this.mods.towerDamageMult = meta.towerDamageMult;
    this.mods.towerFireRateMult *= meta.towerFireRateMult;
    this.mods.splashRadiusMult *= meta.splashMult;
    this.mods.biomassMult = meta.biomassMult;
    this.mods.heroDamageMult = meta.heroDamageMult;
    this.mods.heroSpeedMult *= meta.heroSpeedMult;
    // Fold permanent progression (Tower Stars + Hero gear): unlock/affix appliers set
    // the same run hooks cards use; per-kind Star stat steps are stored for towerSystem.
    // (Absent in tests → no change → deterministic baseline.)
    if (fold) {
      fold.apply(this.mods);
      this.starStat = fold.stat;
    }
    this.maxIntegrity = Math.round((ECON.baseIntegrity + meta.integrityBonus) * this.stageMods.integrityMult);
    this.integrity = this.maxIntegrity;
    this.biomass = ECON.startingBiomass + meta.startBiomass + this.stageMods.startBiomassBonus;
    this.hero = {
      x: nucleusPoint.x,
      y: nucleusPoint.y,
      hp: HERO.maxHp,
      maxHp: HERO.maxHp,
      down: false,
      respawn: 0,
      rally: { x: WIDTH / 2, y: DEFENSE_TOP_Y - CELL }, // patrol the line by default
      attackCd: 0,
      abilityCd: 0,
      facing: -Math.PI / 2, // facing up-field toward the swarm
      swing: 0,
    };
  }

  // ── Intents (from the UI) ────────────────────────────────────────────────

  selectTower(kind: TowerKind | null): void {
    this.selectedTower = kind;
    this.armedAbility = false;
  }

  armAbility(): void {
    if (this.hero.abilityCd <= 0 && !this.hero.down) {
      this.armedAbility = true;
      this.selectedTower = null;
    }
  }

  /** Re-anchor the hero's leash (right-click). */
  setRally(px: number, py: number): void {
    this.hero.rally = { x: px, y: py };
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
    });
    this.towersBuilt++;
    // Run start: placing the FIRST tower arms the auto-start countdown (the player
    // sets up unrushed, then the clock begins). Between waves it's already armed.
    if (this.phase === 'prep' && this.buildCountdown < 0) this.buildCountdown = this.effectiveBuildSeconds();
    return true;
  }

  /** Unlock additional tower slots (hook for future permanent upgrades). */
  unlockSlots(n: number): void {
    this.unlockedSlots = Math.min(towerSlots.length, this.unlockedSlots + n);
  }

  /** Effective Build-Phase countdown — the canonical base scaled by the run's
   *  buildCountdownMult (cards/upgrades) so the duration is tunable. */
  effectiveBuildSeconds(): number {
    return Math.max(0, WAVE_FLOW.buildSeconds * this.mods.buildCountdownMult);
  }

  /** Begin the Build Phase: arm the auto-start countdown. Called on entering prep
   *  between waves (immediately) — the run-start prep instead arms on the first
   *  tower (see placeTower), giving the player an unrushed first placement. */
  private enterBuildPhase(): void {
    this.phase = 'prep';
    this.buildCountdown = this.effectiveBuildSeconds();
  }

  /** Manual "Start Next Wave" — begins the next wave immediately and grants a small
   *  biomass bonus for committing early (surfaced to the HUD + a battlefield float). */
  startWave(): void {
    if (this.phase !== 'prep' || this.waveIndex >= this.totalWaves) return;
    const bonus = WAVE_FLOW.earlyStartBonus;
    this.biomass += bonus;
    this.earlyBonus = bonus;
    this.earlyBonusSeq++;
    this.floats.push({ x: nucleusPoint.x, y: nucleusPoint.y - 18, text: `+${bonus} ⬡ early`, color: '#7CF6C8', life: 1.1 });
    this.beginWave();
  }

  /** Start the next wave (shared by manual start and the countdown auto-start). */
  private beginWave(): void {
    if (this.phase !== 'prep' || this.waveIndex >= this.totalWaves) return;
    this.buildCountdown = -1; // consume the countdown
    this.waveKills = 0;
    this.waveBiomass = 0;
    this.waveIndex++;
    const def = this.waveScript(this.waveIndex);
    const { hpMult, bountyMult } = this.waveScaling(this.waveIndex);
    this.spawnQueue = [];
    for (const group of def) {
      for (let i = 0; i < group.count; i++) {
        this.spawnQueue.push({
          kind: group.kind,
          at: this.time + group.delay + i * group.spacing,
          hpMult,
          bountyMult,
          elite: group.elite ?? false,
        });
      }
    }
    this.spawnQueue.sort((a, b) => a.at - b.at);
    this.spawnedAll = false;
    this.phase = 'wave';
  }

  /** The composed wave (groups) for a 1-based wave index, per mode — all three
   *  modes flow through the Wave Composer (scripted campaign / procedural). */
  private waveScript(index: number): readonly WaveGroup[] {
    if (this.mode === 'endless') return generateEndlessWave(this.seed, index - 1, this.biome ?? 'wasteland');
    if (this.mode === 'stage' && this.stage) return this.stage.waves[index - 1] ?? [];
    return CLASSIC_CAMPAIGN[index - 1] ?? [];
  }

  /** Per-wave HP/bounty growth — the Wave Composer owns the curves; the stage's
   *  env-modifier HP mult is folded in here. */
  private waveScaling(index: number): { hpMult: number; bountyMult: number } {
    const sn = this.stage ? this.stage.stageNumber : 1;
    const { hpMult, bountyMult } = waveDifficulty(this.mode, index, sn);
    return { hpMult: hpMult * this.stageMods.enemyHpMult, bountyMult };
  }

  chooseCard(id: string): void {
    if (this.phase !== 'draft' || !this.draft) return;
    const card = this.draft.find((c) => c.id === id);
    if (card) card.apply(this.cardContext());
    this.draft = null;
    this.enterBuildPhase(); // Build Phase: countdown auto-arms between waves
  }

  private cardContext(): CardContext {
    return {
      mods: this.mods,
      grantBiomass: (n) => {
        this.biomass += n;
      },
      grantIntegrity: (n) => {
        this.maxIntegrity += n;
        this.integrity += n;
      },
      healHero: (n) => {
        this.hero.maxHp += n;
        this.hero.hp += n;
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
      this.economySystem(dt);
      this.overchargeSystem();
      this.reactorAuraSystem();
      this.towerSystem(dt);
      this.projectileSystem(dt);
      this.poolSystem(dt);
      this.statusSystem(dt);
      this.enemyAbilitySystem(dt);
      this.enemyMoveSystem(dt);
      this.heroSystem(dt);
      this.enemyShotSystem(dt);
      this.deathSystem();
      this.floatSystem(dt);
      this.particleSystem(dt);
      this.checkWaveEnd();
      if (this.integrity <= 0) {
        this.integrity = 0;
        this.phase = 'lost';
      }
    } else {
      // prep / Build Phase: hero still roams; no spawns/economy/loss. The auto-start
      // countdown ticks here (when armed) and launches the next wave at zero.
      if (this.buildCountdown >= 0) {
        this.buildCountdown -= dt;
        if (this.buildCountdown <= 0) this.beginWave(); // auto-start (no early bonus)
      }
      this.overchargeSystem();
      this.heroSystem(dt);
      this.floatSystem(dt);
      this.particleSystem(dt);
    }
  }

  private rebuildGrid(): void {
    this.grid.clear();
    for (const e of this.enemies) if (e.alive) this.grid.insert(e);
  }

  // ── Systems ──────────────────────────────────────────────────────────────

  private spawnSystem(): void {
    while (this.spawnQueue.length > 0 && this.spawnQueue[0].at <= this.time) {
      const q = this.spawnQueue.shift()!;
      this.spawnOne(q.kind, q.hpMult, q.bountyMult, q.elite);
    }
    if (this.spawnQueue.length === 0) this.spawnedAll = true;
  }

  private spawnOne(kind: EnemyKind, hpMult: number, bountyMult: number, elite = false): void {
    if (this.enemies.length >= PERF.maxEnemies) return; // entity budget
    const spawn = topSpawn(this.rng.next());
    this.makeEnemyAt(kind, spawn.x, spawn.y, hpMult, bountyMult, elite);
  }

  /** Construct + register one enemy (shared by top spawns and splits). An elite is
   *  the same enemy with buffed stats + a flag the renderer reads (ELITE in config). */
  private makeEnemyAt(kind: EnemyKind, x: number, y: number, hpMult: number, bountyMult: number, elite = false): void {
    const def = ENEMY_DEFS[kind];
    this.seenEnemies.add(kind); // Codex discovery (the one choke point for every spawn)
    const eHp = (elite ? ELITE.hpMult : 1) * this.debugHpMult; // dev "modify health" knob (×1 default)
    const shield = (def.shield ?? 0) * eHp;
    this.enemies.push({
      id: this.nextId++,
      kind,
      x,
      y,
      hp: def.hp * hpMult * eHp,
      maxHp: def.hp * hpMult * eHp,
      baseArmor: def.armor,
      speed: def.speed * this.stageMods.enemySpeedMult,
      bounty: def.bounty * bountyMult * (elite ? ELITE.bountyMult : 1),
      damage: def.damage * (elite ? ELITE.damageMult : 1),
      elite,
      fracture: 0,
      corrosion: 0,
      slowUntil: 0,
      weakenUntil: 0,
      shredFlash: 0,
      shield,
      maxShield: shield,
      lastHitTime: 0,
      attackCd: def.ranged ? def.ranged.interval : 0,
      alive: true,
    });
  }

  private economySystem(dt: number): void {
    let gen = 0;
    for (const t of this.towers) {
      if (t.kind === 'reactor') gen += ECON.reactorBiomassPerSec;
    }
    if (gen > 0) this.biomass += gen * this.mods.reactorBiomassMult * dt;
  }

  private reactorCells(): TowerSlot[] {
    const cells: TowerSlot[] = [];
    for (const t of this.towers) {
      if (t.kind === 'reactor') cells.push(towerSlots[t.slot]);
    }
    return cells;
  }

  private overchargeSystem(): void {
    const reactors = this.reactorCells();
    for (const t of this.towers) {
      if (t.kind === 'reactor') {
        t.overcharged = false;
        continue;
      }
      const slot = towerSlots[t.slot];
      t.overcharged = reactors.some((rc) => slotsAdjacent(rc, slot));
    }
  }

  /**
   * Each tower fires by its OWN logic, so the three read as distinct units:
   *   • Needle — sticky single-target executioner: locks the toughest threat and
   *     keeps drilling it (rapid homing needles, Fracture stacks).
   *   • Mortar — area zoner: lobs a slow shell at the DENSEST cluster, leaving a pool.
   *   • Reactor — no projectile (handled by economy/overcharge/aura systems).
   */
  private towerSystem(dt: number): void {
    for (const t of this.towers) {
      const def = TOWER_DEFS[t.kind];
      if (def.fireInterval <= 0) continue; // reactor: not a weapon
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      // Hive Lattice: +fire-rate for each neighbouring tower. Stage modifiers
      // (Power Surge / Dense Fog) fold in here too.
      const adj = this.mods.adjacencyHaste > 0 ? this.adjacentTowerCount(t) : 0;
      const ss = this.starStat ? this.starStat[t.kind] : null; // per-kind Star stat fold
      const rateMult = this.mods.towerFireRateMult * this.stageMods.towerFireRateMult * (ss ? ss.fireRateMult : 1) * (1 + this.mods.adjacencyHaste * adj) * (t.overcharged ? 1 + ECON.overchargeRate : 1);
      const dmgMult = this.mods.towerDamageMult * (ss ? ss.damageMult : 1) * (t.overcharged ? 1 + ECON.overchargeDamage + this.mods.reactorOverchargeBonus : 1);
      const range = def.range * this.stageMods.towerRangeMult * (ss ? ss.rangeMult : 1);
      if (t.kind === 'needle') {
        const focus = this.needleTarget(t, range);
        if (!focus) continue;
        // All needles pour into the locked target — single-target burst & fast Fracture.
        const shots = 1 + this.mods.needleExtraProjectiles;
        for (let i = 0; i < shots; i++) {
          this.spawnProjectile(t.x, t.y, focus.x, focus.y, def.projectileSpeed, focus.id, def.damage * dmgMult, 'needle', 0, this.mods.needleBounce);
        }
        t.cooldown = def.fireInterval / rateMult;
      } else if (t.kind === 'mortar') {
        const splash = def.splash * this.mods.splashRadiusMult * (ss ? ss.splashMult : 1);
        const shells = 1 + this.mods.mortarExtraShell;
        let fired = false;
        for (let i = 0; i < shells; i++) {
          const aim = this.mortarAim(t.x, t.y, range, splash);
          if (!aim) break;
          // fan extra shells slightly so their pools don't fully overlap
          const off = i === 0 ? 0 : splash * 0.8;
          const ang = i * 1.7;
          this.spawnProjectile(t.x, t.y, aim.x + Math.cos(ang) * off, aim.y + Math.sin(ang) * off, def.projectileSpeed, -1, def.damage * dmgMult, 'mortar', splash);
          fired = true;
        }
        if (!fired) continue;
        t.cooldown = def.fireInterval / rateMult;
      }
    }
  }

  /**
   * Needle targeting — sticky focus-fire with an anti-armor bias. Keeps its current
   * target while it lives and stays in range (so Fracture compounds on one body);
   * otherwise locks the most-threatening tough enemy in range (armor + shield, then
   * advancement). This is what makes the Needle the boss/tank killer.
   */
  private needleTarget(t: Tower, range: number): Enemy | null {
    const r2 = range * range;
    const held = this.needleFocus.get(t.id);
    if (held && held.alive && dist2(t.x, t.y, held.x, held.y) <= r2) return held;

    let best: Enemy | null = null;
    let bestScore = -Infinity;
    this.grid.forNeighbors(t.x, t.y, range, (e) => {
      if (!e.alive || dist2(t.x, t.y, e.x, e.y) > r2) return;
      // Toughness first (its job is to crack armor), then how close to breaching.
      const tough = e.baseArmor + e.maxHp * 0.02;
      const score = tough * 100 - goalDistanceAt(e.x, e.y);
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    });
    if (best) this.needleFocus.set(t.id, best);
    else this.needleFocus.delete(t.id);
    return best;
  }

  /**
   * Mortar targeting — lob where it hits the MOST enemies. Evaluates in-range
   * enemies as candidate impact points and picks the one whose splash covers the
   * largest cluster (ties broken toward the line). Makes the Mortar feel like an
   * area weapon, not a single-target gun.
   */
  private mortarAim(x: number, y: number, range: number, splash: number): { x: number; y: number } | null {
    const r2 = range * range;
    const cands = this.targetScratch;
    cands.length = 0;
    this.grid.forNeighbors(x, y, range, (e) => {
      if (e.alive && dist2(x, y, e.x, e.y) <= r2 && cands.length < 48) cands.push(e);
    });
    if (cands.length === 0) return null;
    const s2 = splash * splash;
    let best = cands[0];
    let bestScore = -Infinity;
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      let count = 0;
      for (let j = 0; j < cands.length; j++) {
        if (dist2(c.x, c.y, cands[j].x, cands[j].y) <= s2) count++;
      }
      const score = count * 1000 - goalDistanceAt(c.x, c.y);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return { x: best.x, y: best.y };
  }

  /**
   * Reactor aura — the support tower's battlefield presence. Enemies inside the
   * aura of any reactor are briefly slowed and "weakened" (take extra damage), so
   * a reactor planted on a chokepoint amplifies every nearby tower's output on top
   * of its biomass + overcharge. Refresh-based (re-stamped each tick they're inside).
   */
  private reactorAuraSystem(): void {
    const R = ECON.reactorAuraRadius * this.mods.reactorAuraRadiusMult; // Sprawling Roots
    const R2 = R * R;
    const until = this.time + 0.18;
    for (const t of this.towers) {
      if (t.kind !== 'reactor') continue;
      this.grid.forNeighbors(t.x, t.y, R, (e) => {
        if (!e.alive || dist2(t.x, t.y, e.x, e.y) > R2) return;
        e.slowUntil = until;
        e.weakenUntil = until;
      });
    }
  }

  /** Count towers on lattice-adjacent slots (Hive Lattice fire-rate bonus). */
  private adjacentTowerCount(t: Tower): number {
    const slot = towerSlots[t.slot];
    let n = 0;
    for (const o of this.towers) {
      if (o !== t && slotsAdjacent(slot, towerSlots[o.slot])) n++;
    }
    return n;
  }

  private projectileSystem(dt: number): void {
    for (const p of this.projectiles) {
      if (p.kind === 'needle') {
        const target = this.enemies.find((e) => e.id === p.targetId && e.alive);
        if (!target) {
          p.alive = false; // fizzle if the target died
          continue;
        }
        p.tx = target.x;
        p.ty = target.y;
        const step = p.speed * dt;
        if (dist(p.x, p.y, p.tx, p.ty) <= step + 4) {
          this.applyDamage(target, p.damage);
          this.addFracture(target, 1 + this.mods.needleBonusFracture);
          this.maybeShred(target);
          if (p.bounces > 0) this.bounceNeedle(p, target); // Ricochet Spores
          p.alive = false;
        } else {
          const np = moveToward(p.x, p.y, p.tx, p.ty, step);
          p.x = np.x;
          p.y = np.y;
        }
      } else {
        // mortar: positional, splash on arrival
        const step = p.speed * dt;
        if (dist(p.x, p.y, p.tx, p.ty) <= step + 4) {
          this.mortarImpact(p);
          p.alive = false;
        } else {
          const np = moveToward(p.x, p.y, p.tx, p.ty, step);
          p.x = np.x;
          p.y = np.y;
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
    const r2 = p.splash * p.splash;
    this.grid.forNeighbors(p.x, p.y, p.splash, (e) => {
      if (!e.alive) return;
      if (dist2(p.x, p.y, e.x, e.y) <= r2) {
        this.applyDamage(e, p.damage);
        e.corrosion = STATUS.corrosionDuration;
        if (this.mods.mortarAppliesFracture) this.addFracture(e, 1);
        this.maybeShred(e);
      }
    });
    this.pools.push({
      id: this.nextId++,
      x: p.x,
      y: p.y,
      radius: p.splash * STATUS.poolRadiusFactor,
      dps: STATUS.corrosionDps * this.mods.poolDpsMult,
      remaining: STATUS.poolDuration * this.mods.mortarPoolDurationMult,
    });
  }

  private poolSystem(dt: number): void {
    for (const pool of this.pools) {
      const r2 = pool.radius * pool.radius;
      this.grid.forNeighbors(pool.x, pool.y, pool.radius, (e) => {
        if (!e.alive) return;
        if (dist2(pool.x, pool.y, e.x, e.y) <= r2) {
          this.applyDamage(e, pool.dps * dt);
          e.corrosion = STATUS.corrosionDuration;
          this.maybeShred(e);
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
        this.applyDamage(e, STATUS.corrosionDps * 0.5 * dt); // light tick from the status itself
      }
      if (e.shredFlash > 0) e.shredFlash = Math.max(0, e.shredFlash - dt);
    }
  }

  /**
   * Per-archetype abilities driven by one data field each:
   *   • Regenerating (mender) — heal once it hasn't been hurt for `delay`s. Corrosion
   *     ticks (and any pressure) keep stamping lastHitTime, so DoT shuts it off.
   *   • Ranged (spitter) — when the hero is in range, lob a shot at where it stands.
   */
  private enemyAbilitySystem(dt: number): void {
    const h = this.hero;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const def = ENEMY_DEFS[e.kind];
      if (def.regen && e.hp < e.maxHp && this.time - e.lastHitTime >= def.regen.delay) {
        e.hp = Math.min(e.maxHp, e.hp + def.regen.perSec * dt);
      }
      if (def.ranged) {
        e.attackCd -= dt;
        if (
          e.attackCd <= 0 && !h.down &&
          dist2(e.x, e.y, h.x, h.y) <= def.ranged.range * def.ranged.range
        ) {
          this.enemyShots.push({ x: e.x, y: e.y, tx: h.x, ty: h.y, speed: def.ranged.speed, damage: def.ranged.damage, alive: true });
          e.attackCd = def.ranged.interval;
        }
      }
    }
  }

  /** Move ranged shots toward their fired point; on arrival they hit the hero only
   *  if it's still near it — so a moving hero can sidestep them (positioning matters). */
  private enemyShotSystem(dt: number): void {
    const h = this.hero;
    for (const s of this.enemyShots) {
      const step = s.speed * dt;
      if (dist(s.x, s.y, s.tx, s.ty) <= step + 4) {
        if (!h.down && !this.god && dist(s.tx, s.ty, h.x, h.y) <= 24) {
          h.hp -= s.damage;
          if (h.hp <= 0) {
            h.down = true;
            h.respawn = HERO.respawnTime;
            this.floats.push({ x: h.x, y: h.y - 20, text: 'DOWN', color: '#ff5d73', life: 1.2 });
          }
        }
        this.spawnParticles(s.tx, s.ty, PARTICLE.heroHit);
        s.alive = false;
      } else {
        const np = moveToward(s.x, s.y, s.tx, s.ty, step);
        s.x = np.x;
        s.y = np.y;
      }
    }
    const ss = this.enemyShots;
    for (let i = ss.length - 1; i >= 0; i--) {
      if (!ss[i].alive) {
        ss[i] = ss[ss.length - 1];
        ss.pop();
      }
    }
  }

  /** Splitter death — burst into a small knot of children (deterministic offsets). */
  private spawnSplit(parent: Enemy, split: { kind: EnemyKind; count: number }): void {
    for (let i = 0; i < split.count; i++) {
      if (this.enemies.length >= PERF.maxEnemies) break;
      const ang = this.rng.next() * Math.PI * 2;
      const d = 8 + this.rng.next() * 12;
      const x = Math.max(8, Math.min(WIDTH - 8, parent.x + Math.cos(ang) * d));
      const y = parent.y + Math.sin(ang) * d;
      this.makeEnemyAt(split.kind, x, y, 1, 1); // children unscaled — keeps splits fair
    }
  }

  /** Run-card effects that fire when an enemy dies (each guarded by its flag). */
  private onKillCards(e: Enemy): void {
    const m = this.mods;
    const h = this.hero;
    if (m.heroLifestealOnKill > 0 && !h.down) h.hp = Math.min(h.maxHp, h.hp + m.heroLifestealOnKill); // Sanguine Coil
    if (m.apexKillReset > 0 && h.abilityCd > 0) h.abilityCd = Math.max(0, h.abilityCd - m.apexKillReset); // Apex Hunger
    if (m.corrosionSpread && e.corrosion > 0) this.areaEffect(e, CARD_FX.corrosionSpreadRange, (o) => { o.corrosion = STATUS.corrosionDuration; }); // Viral Bloom
    if (m.deathBurst) this.areaEffect(e, CARD_FX.deathBurstRadius, (o) => this.applyDamage(o, CARD_FX.deathBurstDamage)); // Volatile Decay
    if (m.deathPools) {
      this.pools.push({ // Acidic Remains
        id: this.nextId++,
        x: e.x,
        y: e.y,
        radius: CARD_FX.deathPoolRadius,
        dps: CARD_FX.deathPoolDps * m.poolDpsMult,
        remaining: CARD_FX.deathPoolDuration * m.mortarPoolDurationMult,
      });
    }
  }

  /** Apply a callback to every other live enemy within `range` of `e` (grid-local). */
  private areaEffect(e: Enemy, range: number, fn: (o: Enemy) => void): void {
    const r2 = range * range;
    this.grid.forNeighbors(e.x, e.y, range, (o) => {
      if (o.alive && o !== e && dist2(e.x, e.y, o.x, o.y) <= r2) fn(o);
    });
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
    const sepR = CELL * 0.9;
    const sepR2 = sepR * sepR;
    const tR = STEER.towerAvoidRadius;
    const tR2 = tR * tR;
    const hR = STEER.heroAvoidRadius;
    const hR2 = hR * hR;
    const hero = this.hero;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (reachedBottom(e.y)) {
        this.hitNucleus(e);
        continue;
      }
      const def = ENEMY_DEFS[e.kind];
      const b = def.behavior;
      let slow = e.corrosion > 0 ? slowBase : 0;
      if (e.slowUntil > this.time) slow = Math.max(slow, ECON.reactorAuraSlow); // reactor aura
      if (this.mods.lineSlow > 0 && e.y > DEFENSE_TOP_Y) slow = Math.max(slow, this.mods.lineSlow); // Tar Membrane
      slow = Math.min(0.85, slow);
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
        const n = e.id * 0.137 + this.time * STEER.jitterFreq;
        vx += Math.sin(n) * b.jitter;
        vy += Math.cos(n * 1.31) * b.jitter;
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
    this.leaks++;
    if (!this.god) this.integrity -= e.damage;
    e.alive = false;
    this.armorBreakUntil.delete(e.id);
    this.spawnParticles(e.x, e.y, PARTICLE.breach);
    this.floats.push({ x: nucleusPoint.x, y: nucleusPoint.y - 14, text: `-${e.damage}`, color: '#ff5d73', life: 0.9 });
  }

  private heroSystem(dt: number): void {
    // One hero today; structured per-hero so future loadouts can run several
    // (just call updateHero for each). Equipment/abilities layer on via mods.
    this.updateHero(this.hero, dt);
  }

  /**
   * Autonomous battlefield unit. Roams freely and hunts the MOST DANGEROUS
   * advancing enemy (proximity to breaching + how hard it hits), intercepting
   * AHEAD of its path rather than trailing it, faces what it fights, and cleaves
   * chaff around its target. Patrols its forward guard post when the field is clear.
   */
  private updateHero(h: Hero, dt: number): void {
    if (h.down) {
      h.swing = 0;
      h.respawn -= dt;
      if (h.respawn <= 0) {
        h.down = false;
        h.hp = h.maxHp;
        h.x = nucleusPoint.x;
        h.y = nucleusPoint.y;
      }
      return;
    }
    if (h.attackCd > 0) h.attackCd -= dt;
    if (h.abilityCd > 0) h.abilityCd -= dt;
    if (h.swing > 0) h.swing = Math.max(0, h.swing - dt);

    // ── Threat targeting: closest-to-breaching, weighted by how much it hurts. ──
    const aggro2 = HERO.aggroRange * HERO.aggroRange;
    let target: Enemy | null = null;
    let bestScore = -Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (dist2(h.x, h.y, e.x, e.y) > aggro2) continue;
      const score = -goalDistanceAt(e.x, e.y) + e.damage * HERO.threatPerDamage;
      if (score > bestScore) {
        bestScore = score;
        target = e;
      }
    }

    // ── Movement: lead the target (intercept), else hold the guard post. ──
    let goalX: number;
    let goalY: number;
    if (target) {
      const b = ENEMY_DEFS[target.kind].behavior;
      let dx: number;
      let dy: number;
      if (b.flying || b.burrowing) {
        dx = nucleusPoint.x - target.x;
        dy = REACH_Y - target.y;
      } else {
        const fd = flowDirAt(target.x, target.y);
        dx = fd.x;
        dy = fd.y;
      }
      const l = Math.hypot(dx, dy) || 1;
      goalX = target.x + (dx / l) * target.speed * HERO.lead;
      goalY = target.y + (dy / l) * target.speed * HERO.lead;
    } else {
      goalX = h.rally.x;
      goalY = h.rally.y;
    }
    const np = moveToward(h.x, h.y, goalX, goalY, HERO.speed * this.mods.heroSpeedMult * dt);
    const mvx = np.x - h.x;
    const mvy = np.y - h.y;
    h.x = Math.max(0, Math.min(WIDTH, np.x));
    h.y = Math.max(0, Math.min(HEIGHT, np.y));

    // ── Facing: smoothly turn toward the target, else toward travel direction. ──
    let desired = h.facing;
    if (target) desired = Math.atan2(target.y - h.y, target.x - h.x);
    else if (mvx * mvx + mvy * mvy > 1e-4) desired = Math.atan2(mvy, mvx);
    let da = desired - h.facing;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    h.facing += da * Math.min(1, dt * HERO.turnRate);

    // ── Attack: hit the target, then cleave nearby chaff for a fraction. ──
    if (target && h.attackCd <= 0 && dist(h.x, h.y, target.x, target.y) <= HERO.attackRange + ENEMY_DEFS[target.kind].radius) {
      const dmg = HERO.attackDamage * this.mods.heroDamageMult;
      const strikes = 1 + this.mods.heroExtraStrikes; // Frenzy Glands
      for (let s = 0; s < strikes; s++) this.applyDamage(target, dmg);
      this.addFracture(target, HERO.attackFracture);
      this.maybeShred(target);
      const cr2 = HERO.cleaveRadius * HERO.cleaveRadius;
      const hit = this.neighborScratch;
      this.grid.queryInto(h.x, h.y, HERO.cleaveRadius, hit);
      for (let k = 0; k < hit.length; k++) {
        const o = hit[k];
        if (o === target || !o.alive) continue;
        if (dist2(h.x, h.y, o.x, o.y) <= cr2) {
          this.applyDamage(o, dmg * HERO.cleaveFraction);
          this.maybeShred(o);
        }
      }
      h.attackCd = HERO.attackInterval / this.mods.heroAttackRateMult; // Adrenal Surge
      h.swing = HERO.swingTime;
      this.spawnParticles(target.x, target.y, PARTICLE.heroHit);
    }

    // Contact damage to the hero from nearby enemies (grid-local).
    let incoming = 0;
    const near = this.neighborScratch;
    this.grid.queryInto(h.x, h.y, HERO.contactRange + 28, near);
    for (let k = 0; k < near.length; k++) {
      const e = near[k];
      if (!e.alive) continue;
      if (dist(h.x, h.y, e.x, e.y) <= HERO.contactRange + ENEMY_DEFS[e.kind].radius) incoming += e.damage;
    }
    if (incoming > 0 && !this.god) {
      h.hp -= incoming * dt;
      if (h.hp <= 0) {
        h.down = true;
        h.respawn = HERO.respawnTime;
        this.floats.push({ x: h.x, y: h.y - 20, text: 'DOWN', color: '#ff5d73', life: 1.2 });
      }
    }
  }

  private triggerAbility(px: number, py: number): void {
    const h = this.hero;
    if (h.down || h.abilityCd > 0) return;
    this.apexUses++;
    h.x = px;
    h.y = py;
    h.rally = { x: px, y: py };
    const r2 = HERO.ability.radius * HERO.ability.radius;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (dist2(px, py, e.x, e.y) <= r2) {
        this.applyDamage(e, HERO.ability.damage * this.mods.heroDamageMult);
        this.addFracture(e, HERO.ability.fracture);
        this.maybeShred(e);
      }
    }
    h.abilityCd = HERO.ability.cooldown * this.mods.heroCooldownMult;
    this.floats.push({ x: px, y: py - 20, text: 'APEX!', color: '#5ad1ff', life: 0.8 });
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
        this.waveKills++;
        this.lootProgress += LOOT.perKill; // persistent loot meter (kills)
        const reward = e.bounty * this.mods.biomassMult;
        this.biomass += reward;
        this.waveBiomass += reward;
        this.armorBreakUntil.delete(e.id);
        this.spawnParticles(e.x, e.y, PARTICLE.death, ENEMY_DEFS[e.kind].color);
        const split = ENEMY_DEFS[e.kind].split;
        if (split) this.spawnSplit(e, split); // Splitter: burst into children
        this.onKillCards(e); // run-card on-death effects
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
      f.y -= 18 * dt;
      if (f.life <= 0) {
        fs[i] = fs[fs.length - 1];
        fs.pop();
      }
    }
  }

  // ── Pools & particles (scalability) ──────────────────────────────────────

  private spawnProjectile(
    x: number, y: number, tx: number, ty: number, speed: number,
    targetId: number, damage: number, kind: TowerKind, splash: number, bounces = 0,
  ): void {
    const p = this.projPool.pop();
    if (p) {
      p.id = this.nextId++;
      p.x = x; p.y = y; p.ox = x; p.oy = y; p.tx = tx; p.ty = ty; p.speed = speed;
      p.targetId = targetId; p.damage = damage; p.kind = kind; p.splash = splash; p.bounces = bounces; p.alive = true;
      this.projectiles.push(p);
    } else {
      this.projectiles.push({ id: this.nextId++, x, y, ox: x, oy: y, tx, ty, speed, targetId, damage, kind, splash, bounces, alive: true });
    }
  }

  private releaseProjectile(p: Projectile): void {
    if (this.projPool.length < 256) this.projPool.push(p);
  }

  /** Ricochet a spent needle to the nearest other enemy (one fewer bounce). */
  private bounceNeedle(p: Projectile, from: Enemy): void {
    const R = CARD_FX.needleBounceRange;
    const R2 = R * R;
    let best: Enemy | null = null;
    let bestD = Infinity;
    this.grid.forNeighbors(from.x, from.y, R, (e) => {
      if (!e.alive || e === from) return;
      const d = dist2(from.x, from.y, e.x, e.y);
      if (d <= R2 && d < bestD) {
        bestD = d;
        best = e;
      }
    });
    if (best) {
      const b = best as Enemy;
      this.spawnProjectile(from.x, from.y, b.x, b.y, p.speed, b.id, p.damage, 'needle', 0, p.bounces - 1);
    }
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
      p.vx *= 0.92; // drag
      p.vy *= 0.92;
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

  private checkWaveEnd(): void {
    if (this.phase !== 'wave') return;
    if (this.spawnedAll && this.spawnQueue.length === 0 && this.enemies.length === 0) {
      // Snapshot the just-cleared wave for the Build-Phase summary.
      this.lastWaveSummary = { wave: this.waveIndex, kills: this.waveKills, biomass: Math.round(this.waveBiomass) };
      this.lootProgress += LOOT.perWave; // persistent loot meter (completed wave)
      if (this.waveIndex >= this.totalWaves) {
        this.phase = 'won'; // finite modes only; endless has totalWaves = Infinity
      } else {
        this.openDraft();
      }
    }
  }

  // ── Status / reaction helpers ────────────────────────────────────────────

  private addFracture(e: Enemy, n: number): void {
    const cap = STATUS.fractureMaxStacks + this.mods.fractureBonusStacks;
    e.fracture = Math.min(cap, e.fracture + n);
  }

  private effectiveArmor(e: Enemy): number {
    if ((this.armorBreakUntil.get(e.id) ?? 0) > this.time) return 0;
    let a = e.baseArmor - e.fracture * STATUS.fractureArmorShred;
    if (e.corrosion > 0) a -= STATUS.corrosionArmorShred;
    return Math.max(0, a);
  }

  private applyDamage(e: Enemy, raw: number): void {
    if (!e.alive) return;
    if (this.debugDamageMult !== 1) raw *= this.debugDamageMult; // dev "modify damage" knob
    let mult = 1 + e.fracture * STATUS.fractureDamageTakenPerStack;
    if (e.weakenUntil > this.time) mult += ECON.reactorWeaken; // reactor aura mark
    if (e.corrosion > 0 && this.mods.corrodedAmp > 0) mult += this.mods.corrodedAmp; // Brittle Rot
    this.hurt(e, Math.max(1, raw * mult - this.effectiveArmor(e)));
  }

  /** Apply post-mitigation damage, draining the shield first and stamping the hit
   *  time (which gates regen). Every damage path funnels through here so Shielded
   *  and Regenerating enemies behave consistently. */
  private hurt(e: Enemy, amount: number): void {
    if (amount <= 0 || !e.alive) return;
    if (this.debugTrackDps) this.dpsHits.push({ t: this.time, amount }); // dev DPS readout only
    e.lastHitTime = this.time;
    if (e.shield > 0) {
      const absorbed = Math.min(e.shield, amount);
      e.shield -= absorbed;
      amount -= absorbed;
    }
    if (amount > 0) e.hp -= amount;
  }

  /** Fracture + Corrosion present → consume Fracture for a true-damage burst + armor break. */
  private maybeShred(e: Enemy): void {
    if (!e.alive) return;
    if (e.fracture >= 1 && e.corrosion > 0) {
      const burst = STATUS.shredBase + STATUS.shredPerStack * e.fracture;
      this.hurt(e, burst); // true damage (ignores armor), but the shield still soaks it
      this.armorBreakUntil.set(e.id, this.time + STATUS.shredArmorBreak);
      e.fracture = 0; // consumed before any explosion -> cascade can't re-trigger on `e`
      e.shredFlash = STATUS.shredFlash;
      this.spawnParticles(e.x, e.y, PARTICLE.shred);
      this.floats.push({ x: e.x, y: e.y - 16, text: 'SHRED', color: '#fff066', life: 0.7 });
      if (this.mods.shredExplosion) {
        // Detonation Cascade — AoE around the shredded target.
        const R2 = CARD_FX.shredExplosionRadius * CARD_FX.shredExplosionRadius;
        this.grid.forNeighbors(e.x, e.y, CARD_FX.shredExplosionRadius, (o) => {
          if (!o.alive || o === e || dist2(e.x, e.y, o.x, o.y) > R2) return;
          this.applyDamage(o, CARD_FX.shredExplosionDamage);
        });
      }
    }
  }

  // ── Debug API (driven by the debug panel; no effect on normal play) ──────

  debugSpawn(kind: EnemyKind, count = 1, elite = false): void {
    const { hpMult, bountyMult } = this.waveScaling(Math.max(1, this.waveIndex));
    for (let i = 0; i < count; i++) this.spawnOne(kind, hpMult, bountyMult, elite);
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

  /** Roll a 1-of-3 draft, record the offered cards for the Codex, and enter draft
   *  phase. Single choke point so card discovery is tracked wherever a draft opens. */
  private openDraft(): void {
    this.draft = draftCards(this.rng, 3);
    for (const c of this.draft) this.seenCards.add(c.id);
    this.phase = 'draft';
  }

  /** Open the 1-of-3 draft now (abandons any in-progress wave). */
  debugOpenDraft(): void {
    if (this.phase === 'won' || this.phase === 'lost') return;
    this.openDraft();
  }

  /** Apply a specific card's effect immediately (force a card selection). */
  debugApplyCard(id: string): void {
    const card = CARD_POOL.find((c) => c.id === id);
    if (card) card.apply(this.cardContext());
  }

  debugReviveHero(): void {
    this.hero.down = false;
    this.hero.hp = this.hero.maxHp;
    this.hero.respawn = 0;
    this.hero.abilityCd = 0;
  }

  /** Jump to and start a specific wave (prep only) — fast-forward to late-game state. */
  debugForceWave(n: number): void {
    if (this.phase !== 'prep') return;
    this.waveIndex = Math.max(0, Math.min(Math.floor(n), this.totalWaves) - 1);
    this.startWave();
  }

  /** Player-side DPS over the last `windowSec` (requires debugTrackDps). Prunes the
   *  rolling hit log as a side effect; returns 0 when tracking is off / no hits. */
  debugDps(windowSec = 2): number {
    const cutoff = this.time - windowSec;
    if (this.dpsHits.length > 0) {
      let i = 0;
      while (i < this.dpsHits.length && this.dpsHits[i].t < cutoff) i++;
      if (i > 0) this.dpsHits.splice(0, i);
    }
    let sum = 0;
    for (const h of this.dpsHits) sum += h.amount;
    return sum / windowSec;
  }

  /** Live enemy breakdown for the balancing panel (read-only; no sim effect). */
  debugEnemyStats(): { alive: number; elites: number; totalHp: number; byKind: Partial<Record<EnemyKind, number>> } {
    const byKind: Partial<Record<EnemyKind, number>> = {};
    let alive = 0;
    let elites = 0;
    let totalHp = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      alive++;
      if (e.elite) elites++;
      totalHp += e.hp + e.shield;
      byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    }
    return { alive, elites, totalHp: Math.round(totalHp), byKind };
  }

  // ── Mode helpers ─────────────────────────────────────────────────────────

  private biomeData(): { palette: BiomePalette; lighting: number; ambient: { motes: number; fog: number; pulse: number } } {
    const b = this.biome ? BIOMES[this.biome] : null;
    return {
      palette: b ? b.palette : DEFAULT_PALETTE,
      lighting: b ? b.lighting : 1,
      ambient: b ? b.ambient : { motes: 1, fog: 1, pulse: 1 },
    };
  }

  /** Whether the stage's optional objective is satisfied by the tracked stats. */
  objectiveComplete(): boolean {
    const o = this.stage?.objective;
    if (!o) return false;
    if (o.kind === 'flawless') return this.leaks === 0;
    if (o.kind === 'restraint') return this.apexUses === 0;
    if (o.kind === 'frugal') return this.towersBuilt <= o.target;
    if (o.kind === 'slayer') return this.kills >= o.target;
    if (o.kind === 'swift') return this.time <= o.target;
    return false;
  }

  /** Endless leaderboard score — depth dominates, then kills, then time survived. */
  endlessScore(): number {
    return Math.floor(this.waveIndex * this.waveIndex * 100 + this.kills * 5 + this.time);
  }

  /** Mode-aware run summary the meta layer turns into a reward. */
  getResult(): RunResult {
    return {
      mode: this.mode,
      won: this.phase === 'won',
      wave: this.waveIndex,
      kills: this.kills,
      stageNumber: this.stage?.stageNumber ?? 0,
      rewardMultiplier: this.stage?.rewardMultiplier ?? 1,
      objectiveDone: this.mode === 'stage' && this.phase === 'won' && this.objectiveComplete(),
      objectiveBonus: this.stage?.objective?.rewardBonus ?? 0,
      score: this.endlessScore(),
      // Codex discoveries this run (folded into permanent collection by the meta layer).
      biome: this.biome,
      enemiesSeen: [...this.seenEnemies],
      cardsSeen: [...this.seenCards],
    };
  }

  // ── Read models (for UI / renderer) ──────────────────────────────────────

  getRenderState(): RenderState {
    const bd = this.biomeData();
    return {
      enemies: this.enemies,
      towers: this.towers,
      projectiles: this.projectiles,
      enemyShots: this.enemyShots,
      pools: this.pools,
      floats: this.floats,
      particles: this.particles,
      hero: this.hero,
      phase: this.phase,
      selectedTower: this.selectedTower,
      armedAbility: this.armedAbility,
      unlockedSlots: this.unlockedSlots,
      time: this.time,
      integrity: this.integrity,
      maxIntegrity: this.maxIntegrity,
      palette: bd.palette,
      lighting: bd.lighting,
      ambient: bd.ambient,
      spawnZones: spawnSegments(),
      rangeMult: this.stageMods.towerRangeMult,
    };
  }

  /** Aggregated composition of the upcoming wave (Build-Phase incoming preview).
   *  Pure — waveScript has no side effects — so it's safe to call from the HUD. */
  getWavePreview(): { kind: EnemyKind; count: number; elite: boolean; isBoss: boolean }[] {
    if (this.waveIndex >= this.totalWaves) return [];
    const agg = new Map<string, { kind: EnemyKind; count: number; elite: boolean; isBoss: boolean }>();
    for (const g of this.waveScript(this.waveIndex + 1)) {
      const key = `${g.kind}:${g.elite ? 'e' : ''}`;
      const cur = agg.get(key);
      if (cur) cur.count += g.count;
      else agg.set(key, { kind: g.kind, count: g.count, elite: g.elite ?? false, isBoss: ENEMY_DEFS[g.kind].isBoss ?? false });
    }
    return [...agg.values()];
  }

  getSnapshot(): HudSnapshot {
    const obj = this.stage?.objective ?? null;
    return {
      phase: this.phase,
      mode: this.mode,
      wave: this.waveIndex,
      totalWaves: this.totalWaves,
      biomeName: this.biome ? BIOMES[this.biome].name : null,
      biomass: Math.floor(this.biomass),
      integrity: Math.ceil(this.integrity),
      maxIntegrity: this.maxIntegrity,
      kills: this.kills,
      hero: {
        down: this.hero.down,
        respawn: this.hero.respawn,
        hp: Math.ceil(this.hero.hp),
        maxHp: this.hero.maxHp,
        abilityReady: this.hero.abilityCd <= 0 && !this.hero.down,
      },
      enemiesAlive: this.enemies.length,
      draft: this.draft ? this.draft.map(cardToOption) : null,
      selectedTower: this.selectedTower,
      armedAbility: this.armedAbility,
      objective: obj ? { name: obj.name, description: obj.description, done: this.objectiveComplete() } : null,
      score: this.mode === 'endless' ? this.endlessScore() : 0,
      buildCountdown: this.buildCountdown >= 0 ? this.buildCountdown : null,
      buildCountdownTotal: this.effectiveBuildSeconds(),
      earlyBonus: this.earlyBonus,
      earlyBonusSeq: this.earlyBonusSeq,
      waveSummary: this.lastWaveSummary,
      incoming: this.phase === 'prep' && this.waveIndex < this.totalWaves ? this.getWavePreview() : [],
      lootProgress: this.lootProgress,
    };
  }
}

export interface RunResult {
  mode: GameMode;
  won: boolean;
  wave: number;
  kills: number;
  stageNumber: number;
  rewardMultiplier: number;
  objectiveDone: boolean;
  objectiveBonus: number;
  score: number;
  // Codex discoveries accrued during the run.
  biome: BiomeId | null;
  enemiesSeen: EnemyKind[];
  cardsSeen: string[];
}
