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
import type { CardContext, CardDef, RunModifiers } from './cards';
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
  Tower,
  TowerKind,
  TowerProgress,
  FloatingText,
  CardOption,
} from './types';

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

interface QueuedSpawn {
  kind: EnemyKind;
  at: number; // sim-time to spawn
  hpMult: number;
  bountyMult: number;
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
  waveIndex = 0; // waves started/cleared so far
  readonly totalWaves = TOTAL_WAVES;
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

  constructor(
    seed: number,
    meta: MetaModifiers,
    towerProgress: TowerProgress = neutralTowerProgress(),
    heroKind: HeroKind = 'ravager',
    heroProgress: HeroProgress = neutralHeroProgress(),
  ) {
    this.rng = new Rng(seed);
    this.fxRng = new Rng((seed ^ 0x9e3779b9) >>> 0);
    this.towerProgress = towerProgress;
    this.heroProgress = heroProgress;
    this.mods = defaultRunModifiers();
    // Fold permanent (meta) multipliers into the run as starting buckets.
    this.mods.towerDamageMult = meta.towerDamageMult;
    this.mods.biomassMult = meta.biomassMult;
    this.mods.heroDamageMult = meta.heroDamageMult;
    this.maxIntegrity = ECON.baseIntegrity + meta.integrityBonus;
    this.integrity = this.maxIntegrity;
    this.biomass = ECON.startingBiomass;
    this.heroes = [this.makeHero(heroKind)];
  }

  /** Build a hero runtime instance from its data-driven definition. */
  private makeHero(kind: HeroKind): Hero {
    const def = HERO_DEFS[kind];
    return {
      kind,
      x: nucleusPoint.x,
      y: nucleusPoint.y,
      hp: def.maxHp,
      maxHp: def.maxHp,
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
    this.recomputeTowerCaches();
    this.pushSfx('place');
    return true;
  }

  /** Unlock additional tower slots (hook for future permanent upgrades). */
  unlockSlots(n: number): void {
    this.unlockedSlots = Math.min(towerSlots.length, this.unlockedSlots + n);
  }

  startWave(): void {
    if (this.phase !== 'prep') return;
    if (this.waveIndex >= TOTAL_WAVES) return;
    this.waveIndex++;
    const def = WAVES[this.waveIndex - 1];
    const hpMult = 1 + WAVE_HP_GROWTH * (this.waveIndex - 1);
    const bountyMult = 1 + WAVE_BOUNTY_GROWTH * (this.waveIndex - 1);
    this.spawnQueue = [];
    for (const group of def) {
      for (let i = 0; i < group.count; i++) {
        this.spawnQueue.push({
          kind: group.kind,
          at: this.time + group.delay + i * group.spacing,
          hpMult,
          bountyMult,
        });
      }
    }
    this.spawnQueue.sort((a, b) => a.at - b.at);
    this.spawnedAll = false;
    this.phase = 'wave';
    this.pushSfx('wave');
  }

  chooseCard(id: string): void {
    if (this.phase !== 'draft' || !this.draft) return;
    const card = this.draft.find((c) => c.id === id);
    if (card) {
      applyCard(card, this.cardContext());
      this.chosenCards.push(cardToOption(card));
      this.pushSfx('draft');
    }
    this.draft = null;
    this.phase = 'prep';
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
      this.spawnOne(q.kind, q.hpMult, q.bountyMult);
    }
    if (this.spawnQueue.length === 0) this.spawnedAll = true;
  }

  private spawnOne(kind: EnemyKind, hpMult: number, bountyMult: number): void {
    if (this.enemies.length >= PERF.maxEnemies) return; // entity budget
    const def = ENEMY_DEFS[kind];
    const spawn = topSpawn(this.rng.next());
    this.enemies.push({
      id: this.nextId++,
      kind,
      x: spawn.x,
      y: spawn.y,
      hp: def.hp * hpMult,
      maxHp: def.hp * hpMult,
      baseArmor: def.armor,
      speed: def.speed,
      bounty: def.bounty * bountyMult,
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
    });
  }

  private economySystem(dt: number): void {
    if (this.reactorCount > 0) {
      this.biomass += this.reactorCount * ECON.reactorBiomassPerSec * this.mods.reactorBiomassMult * dt;
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
    for (const t of this.towers) {
      const def = TOWER_DEFS[t.kind];
      this.masteryAccrual[t.kind].activeTime += dt; // usage signal (every deployed tower)
      if (def.firing === 'support') continue; // economy/aura only (handled elsewhere)
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const prog = this.towerProgress[t.kind]; // permanent per-kind buffs (stars + mastery)
      const rateMult = this.mods.towerFireRateMult * prog.fireRateMult * (t.overcharged ? 1 + ECON.overchargeRate : 1);
      const dmgMult = this.mods.towerDamageMult * prog.damageMult * (t.overcharged ? 1 + ECON.overchargeDamage + this.mods.reactorOverchargeBonus : 1);
      // Dispatch by firing behavior (data), not the specific tower kind — so a new
      // tower reusing 'homing'/'splash' needs no change here.
      if (def.firing === 'homing') {
        const targets = this.pickTargets(t.x, t.y, def.range, 1 + this.mods.needleExtraProjectiles);
        if (targets.length === 0) continue;
        for (const e of targets) {
          this.spawnProjectile(t.x, t.y, e.x, e.y, def.projectileSpeed, e.id, def.damage * dmgMult, 'homing', 0, t.kind);
        }
        t.cooldown = def.fireInterval / rateMult;
      } else if (def.firing === 'splash') {
        const target = this.pickTargets(t.x, t.y, def.range, 1)[0];
        if (!target) continue;
        this.spawnProjectile(t.x, t.y, target.x, target.y, def.projectileSpeed, -1, def.damage * dmgMult, 'splash', def.splash * this.mods.splashRadiusMult, t.kind);
        t.cooldown = def.fireInterval / rateMult;
      } else if (def.firing === 'infest') {
        // Viral: launch a homing parasite. Low impact damage — the ramping,
        // armor-ignoring Infection it seeds (and its death-spread) is the payoff.
        const target = this.pickTargets(t.x, t.y, def.range, 1)[0];
        if (!target) continue;
        this.spawnProjectile(t.x, t.y, target.x, target.y, def.projectileSpeed, target.id, def.damage * dmgMult, 'parasite', 0, t.kind);
        t.cooldown = def.fireInterval / rateMult;
      } else if (def.firing === 'field') {
        // Neural: pulse a psionic field over everything in range (no projectile).
        // The pulse cycles on its rhythm whether or not anything is caught.
        this.fieldPulse(t, def.range, def.damage * dmgMult);
        t.cooldown = def.fireInterval / rateMult;
      }
    }
  }

  /** Neural Obelisk pulse: Disrupt (slow + vulnerability) every enemy in range plus
   * a token chip of direct damage. Its value is the debuff, not the chip. */
  private fieldPulse(t: Tower, range: number, damage: number): void {
    const r2 = range * range;
    let hit = false;
    this.grid.forNeighbors(t.x, t.y, range, (e) => {
      if (!e.alive) return;
      if (dist2(t.x, t.y, e.x, e.y) > r2) return;
      e.disrupt = STATUS.disruptDuration; // refresh slow + vulnerability
      this.applyDamage(e, damage, t.kind); // chip benefits from the vuln it just applied
      hit = true;
    });
    if (hit) this.spawnParticles(t.x, t.y, PARTICLE.disrupt);
  }

  /** Up to `n` distinct enemies in range, prioritizing those closest to the line. */
  private pickTargets(x: number, y: number, range: number, n: number): Enemy[] {
    const r2 = range * range;
    const out = this.targetScratch;
    out.length = 0;
    this.grid.forNeighbors(x, y, range, (e) => {
      if (e.alive && dist2(x, y, e.x, e.y) <= r2) out.push(e);
    });
    out.sort((a, b) => goalDistanceAt(a.x, a.y) - goalDistanceAt(b.x, b.y));
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
            this.maybeShred(target);
          }
          this.pushSfx('hit');
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
    const r2 = p.splash * p.splash;
    this.grid.forNeighbors(p.x, p.y, p.splash, (e) => {
      if (!e.alive) return;
      if (dist2(p.x, p.y, e.x, e.y) <= r2) {
        this.applyDamage(e, p.damage, p.sourceKind);
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
        this.applyDamage(e, STATUS.corrosionDps * 0.5 * dt, null, false); // light DoT — no source, no flash
      }
      if (e.infection > 0) {
        // Viral: ramp toward the cap, then bleed armor-ignoring DoT scaled by stacks.
        e.infection = Math.min(STATUS.infectionMaxStacks, e.infection + STATUS.infectionRampPerSec * dt);
        this.applyInfectionDamage(e, e.infection * STATUS.infectionDpsPerStack * this.mods.parasiteInfectionMult * dt);
      }
      if (e.disrupt > 0) e.disrupt = Math.max(0, e.disrupt - dt); // Neural slow + vulnerability decays
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
      if (slow > 0.85) slow = 0.85;
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

    switch (def.behavior) {
      case 'dive': this.updateDiveHero(h, def, dt); break;
      case 'guard': this.updateGuardHero(h, def, dt); break;
      case 'control': this.updateControlHero(h, def, dt); break;
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
    const aggro2 = def.aggroRange * def.aggroRange;
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
      this.maybeShred(target);
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
      this.heroPulse(h, def);
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
      this.heroPulse(h, def);
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
  private heroPulse(h: Hero, def: HeroDef): void {
    const r2 = def.pulseRadius * def.pulseRadius;
    const dmg = def.pulseDamage * this.mods.heroDamageMult * this.heroProgress[h.kind].damageMult;
    let hit = false;
    this.grid.forNeighbors(h.x, h.y, def.pulseRadius, (e) => {
      if (!e.alive || dist2(h.x, h.y, e.x, e.y) > r2) return;
      if (def.pulseDisrupt > 0) e.disrupt = def.pulseDisrupt;
      if (dmg > 0) {
        this.heroMasteryAccrual[h.kind].damage += this.applyDamage(e, dmg);
        this.maybeShred(e);
      }
      hit = true;
    });
    if (hit) this.spawnParticles(h.x, h.y, def.behavior === 'control' ? PARTICLE.disrupt : PARTICLE.bloom);
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
    const dmgMult = this.mods.heroDamageMult * this.heroProgress[h.kind].damageMult;
    if (ab.heal > 0) {
      this.integrity = Math.min(this.maxIntegrity, this.integrity + ab.heal); // mend the Nucleus
      h.hp = Math.min(h.maxHp, h.hp + ab.heal);
    }
    const r2 = ab.radius * ab.radius;
    for (const e of this.enemies) {
      if (!e.alive || dist2(px, py, e.x, e.y) > r2) continue;
      if (ab.damage > 0) this.heroMasteryAccrual[h.kind].damage += this.applyDamage(e, ab.damage * dmgMult);
      if (ab.fracture > 0) this.addFracture(e, ab.fracture);
      if (ab.disrupt > 0) e.disrupt = ab.disrupt;
      if (ab.damage > 0 || ab.fracture > 0) this.maybeShred(e);
    }
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
        if (e.lastHitKind) this.masteryAccrual[e.lastHitKind].kills++; // mastery: kill credit
        if (e.infection > 0) this.spreadInfection(e); // Viral: the plague jumps to the living
        const gain = e.bounty * this.mods.biomassMult;
        this.biomass += gain;
        this.armorBreakUntil.delete(e.id);
        this.spawnParticles(e.x, e.y, PARTICLE.death, ENEMY_DEFS[e.kind].color);
        this.spawnMotes(e.x, e.y); // biomass income "flies" up off the kill
        this.pushSfx('kill');
        if (e.bounty >= 20) {
          this.floats.push({ x: e.x, y: e.y - 14, text: `+${Math.round(gain)}`, color: '#b6e84a', life: 0.8 });
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
      if (this.waveIndex >= TOTAL_WAVES) {
        this.phase = 'won';
      } else {
        this.draft = draftCards(this.rng, 3);
        this.phase = 'draft';
      }
    }
  }

  // ── Status / reaction helpers ────────────────────────────────────────────

  private addFracture(e: Enemy, n: number): void {
    const cap = STATUS.fractureMaxStacks + this.mods.fractureBonusStacks;
    e.fracture = Math.min(cap, e.fracture + n);
  }

  /** Total incoming-damage multiplier on `e`: Fracture's per-stack amp + Neural
   * Vulnerability (Disruption). Applies to EVERY source. Identity (1) when clean,
   * so undisrupted/unfractured enemies take damage exactly as before. */
  private vulnMult(e: Enemy): number {
    let m = 1 + e.fracture * STATUS.fractureDamageTakenPerStack;
    if (e.disrupt > 0) m += STATUS.disruptVulnerability + this.mods.obeliskVulnerabilityBonus;
    return m;
  }

  /** Viral: add Infection stacks (capped). */
  private infect(e: Enemy, n: number): void {
    e.infection = Math.min(STATUS.infectionMaxStacks, e.infection + n);
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

  private effectiveArmor(e: Enemy): number {
    if ((this.armorBreakUntil.get(e.id) ?? 0) > this.time) return 0;
    let a = e.baseArmor - e.fracture * STATUS.fractureArmorShred;
    if (e.corrosion > 0) a -= STATUS.corrosionArmorShred;
    return Math.max(0, a);
  }

  /** Apply `raw` damage to `e`. `sourceKind` (a firing tower) credits mastery +
   * kill attribution — pure bookkeeping that never alters the damage dealt.
   * `flash` pops the white hit-flash on discrete hits; continuous DoT
   * (corrosion/pools) passes false so it doesn't strobe. Returns damage applied. */
  private applyDamage(e: Enemy, raw: number, sourceKind: TowerKind | null = null, flash = true): number {
    if (!e.alive) return 0;
    const mult = this.vulnMult(e);
    const applied = Math.max(1, raw * mult - this.effectiveArmor(e));
    e.hp -= applied;
    e.dmgAccum += applied; // banked for the next aggregated damage number
    if (flash) e.hitFlash = FX.hitFlash;
    if (sourceKind) {
      e.lastHitKind = sourceKind;
      this.masteryAccrual[sourceKind].damage += applied;
    }
    return applied;
  }

  /** Fracture + Corrosion present → consume Fracture for a true-damage burst + armor break. */
  private maybeShred(e: Enemy): void {
    if (!e.alive) return;
    if (e.fracture >= 1 && e.corrosion > 0) {
      const burst = STATUS.shredBase + STATUS.shredPerStack * e.fracture;
      e.hp -= burst; // true damage, ignores armor
      this.armorBreakUntil.set(e.id, this.time + STATUS.shredArmorBreak);
      e.fracture = 0;
      e.shredFlash = STATUS.shredFlash;
      this.pushSfx('shred');
      this.spawnParticles(e.x, e.y, PARTICLE.shred);
      this.floats.push({ x: e.x, y: e.y - 16, text: 'SHRED', color: '#fff066', life: 0.7 });
    }
  }

  // ── Debug API (driven by the debug panel; no effect on normal play) ──────

  debugSpawn(kind: EnemyKind, count = 1): void {
    const hpMult = 1 + WAVE_HP_GROWTH * Math.max(0, this.waveIndex - 1);
    const bountyMult = 1 + WAVE_BOUNTY_GROWTH * Math.max(0, this.waveIndex - 1);
    for (let i = 0; i < count; i++) this.spawnOne(kind, hpMult, bountyMult);
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
    };
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
}
