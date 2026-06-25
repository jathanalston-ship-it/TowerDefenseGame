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
  ECON,
  ENEMY_DEFS,
  HERO,
  PARTICLE,
  PERF,
  SIM_DT,
  SLOTS,
  STATUS,
  STEER,
  TOWER_DEFS,
  TOTAL_WAVES,
  WAVES,
  WAVE_BOUNTY_GROWTH,
  WAVE_HP_GROWTH,
} from './config';
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
}

export interface RenderState {
  enemies: Enemy[];
  towers: Tower[];
  projectiles: Projectile[];
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
  private spawnQueue: QueuedSpawn[] = [];
  private spawnedAll = false;
  private nextId = 1;
  private armorBreakUntil = new Map<number, number>();
  private acc = 0; // fixed-timestep accumulator

  constructor(seed: number, meta: MetaModifiers) {
    this.rng = new Rng(seed);
    this.fxRng = new Rng((seed ^ 0x9e3779b9) >>> 0);
    this.mods = defaultRunModifiers();
    // Fold permanent (meta) multipliers into the run as starting buckets.
    this.mods.towerDamageMult = meta.towerDamageMult;
    this.mods.biomassMult = meta.biomassMult;
    this.mods.heroDamageMult = meta.heroDamageMult;
    this.maxIntegrity = ECON.baseIntegrity + meta.integrityBonus;
    this.integrity = this.maxIntegrity;
    this.biomass = ECON.startingBiomass;
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
  }

  chooseCard(id: string): void {
    if (this.phase !== 'draft' || !this.draft) return;
    const card = this.draft.find((c) => c.id === id);
    if (card) card.apply(this.cardContext());
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
      // prep: hero still roams; no spawns/economy/loss.
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
      slowUntil: 0,
      shredFlash: 0,
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

  private towerSystem(dt: number): void {
    for (const t of this.towers) {
      const def = TOWER_DEFS[t.kind];
      if (def.fireInterval <= 0) continue; // reactor
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const rateMult = this.mods.towerFireRateMult * (t.overcharged ? 1 + ECON.overchargeRate : 1);
      const dmgMult = this.mods.towerDamageMult * (t.overcharged ? 1 + ECON.overchargeDamage + this.mods.reactorOverchargeBonus : 1);
      if (t.kind === 'needle') {
        const targets = this.pickTargets(t.x, t.y, def.range, 1 + this.mods.needleExtraProjectiles);
        if (targets.length === 0) continue;
        for (const e of targets) {
          this.spawnProjectile(t.x, t.y, e.x, e.y, def.projectileSpeed, e.id, def.damage * dmgMult, 'needle', 0);
        }
        t.cooldown = def.fireInterval / rateMult;
      } else if (t.kind === 'mortar') {
        const target = this.pickTargets(t.x, t.y, def.range, 1)[0];
        if (!target) continue;
        this.spawnProjectile(t.x, t.y, target.x, target.y, def.projectileSpeed, -1, def.damage * dmgMult, 'mortar', def.splash * this.mods.splashRadiusMult);
        t.cooldown = def.fireInterval / rateMult;
      }
    }
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
          this.addFracture(target, 1);
          this.maybeShred(target);
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
      const slow = e.corrosion > 0 ? Math.min(0.85, slowBase) : 0;
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
   * Autonomous battlefield unit. Roams the whole arena freely (no leash),
   * auto-seeks enemies, and prioritizes the most-advanced threat — preferring
   * ones still ABOVE the defensive line so it intercepts them before they enter
   * tower range; it falls back to the deepest enemy in the zone, and patrols its
   * rally point when the field is clear.
   */
  private updateHero(h: Hero, dt: number): void {
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
    if (h.attackCd > 0) h.attackCd -= dt;
    if (h.abilityCd > 0) h.abilityCd -= dt;

    // Threat-based targeting (lower goal distance = closer to breaching).
    const aggro2 = HERO.aggroRange * HERO.aggroRange;
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

    // Move to intercept the target, else patrol the rally point. Free roam,
    // clamped only to the arena bounds.
    const goal = target ? { x: target.x, y: target.y } : h.rally;
    const np = moveToward(h.x, h.y, goal.x, goal.y, HERO.speed * dt);
    h.x = Math.max(0, Math.min(WIDTH, np.x));
    h.y = Math.max(0, Math.min(HEIGHT, np.y));

    // Attack the target in melee range.
    if (target && h.attackCd <= 0 && dist(h.x, h.y, target.x, target.y) <= HERO.attackRange) {
      this.applyDamage(target, HERO.attackDamage * this.mods.heroDamageMult);
      this.addFracture(target, HERO.attackFracture);
      this.maybeShred(target);
      h.attackCd = HERO.attackInterval;
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
        this.biomass += e.bounty * this.mods.biomassMult;
        this.armorBreakUntil.delete(e.id);
        this.spawnParticles(e.x, e.y, PARTICLE.death, ENEMY_DEFS[e.kind].color);
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
    targetId: number, damage: number, kind: TowerKind, splash: number,
  ): void {
    const p = this.projPool.pop();
    if (p) {
      p.id = this.nextId++;
      p.x = x; p.y = y; p.tx = tx; p.ty = ty; p.speed = speed;
      p.targetId = targetId; p.damage = damage; p.kind = kind; p.splash = splash; p.alive = true;
      this.projectiles.push(p);
    } else {
      this.projectiles.push({ id: this.nextId++, x, y, tx, ty, speed, targetId, damage, kind, splash, alive: true });
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

  private effectiveArmor(e: Enemy): number {
    if ((this.armorBreakUntil.get(e.id) ?? 0) > this.time) return 0;
    let a = e.baseArmor - e.fracture * STATUS.fractureArmorShred;
    if (e.corrosion > 0) a -= STATUS.corrosionArmorShred;
    return Math.max(0, a);
  }

  private applyDamage(e: Enemy, raw: number): void {
    if (!e.alive) return;
    const mult = 1 + e.fracture * STATUS.fractureDamageTakenPerStack;
    const applied = Math.max(1, raw * mult - this.effectiveArmor(e));
    e.hp -= applied;
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
    if (card) card.apply(this.cardContext());
  }

  debugReviveHero(): void {
    this.hero.down = false;
    this.hero.hp = this.hero.maxHp;
    this.hero.respawn = 0;
    this.hero.abilityCd = 0;
  }

  // ── Read models (for UI / renderer) ──────────────────────────────────────

  getRenderState(): RenderState {
    return {
      enemies: this.enemies,
      towers: this.towers,
      projectiles: this.projectiles,
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
    };
  }

  getSnapshot(): HudSnapshot {
    return {
      phase: this.phase,
      wave: this.waveIndex,
      totalWaves: this.totalWaves,
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
    };
  }
}
