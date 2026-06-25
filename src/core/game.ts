// The simulation: a deterministic, fixed-timestep tower-defense run. Plain TS —
// no React/DOM imports (ARCHITECTURE.md §2,§7). The Game owns all run (R-bucket)
// state; it evaporates when a new Game is constructed, which is why nothing here
// is ever persisted (PROGRESSION.md §1.1: the run is temporary).

import { Rng } from './rng';
import { dist, dist2, moveToward } from './math';
import {
  buildCells,
  buildCellAt,
  cellsAdjacent,
  nucleusPoint,
  pathPoints,
  spawnPoint,
} from './map';
import type { BuildCell } from './map';
import {
  ECON,
  ENEMY_DEFS,
  HERO,
  SIM_DT,
  STATUS,
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
  hero: Hero;
  phase: Phase;
  selectedTower: TowerKind | null;
  armedAbility: boolean;
}

export class Game {
  phase: Phase = 'prep';
  waveIndex = 0; // waves started/cleared so far
  readonly totalWaves = TOTAL_WAVES;
  biomass: number;
  integrity: number;
  maxIntegrity: number;
  kills = 0;
  time = 0;

  // debug-only knobs — no effect at their defaults (driven by the debug panel)
  god = false;
  timeScale = 1;

  enemies: Enemy[] = [];
  towers: Tower[] = [];
  projectiles: Projectile[] = [];
  pools: Pool[] = [];
  floats: FloatingText[] = [];
  hero: Hero;
  mods: RunModifiers;

  selectedTower: TowerKind | null = null;
  armedAbility = false;
  draft: CardDef[] | null = null;

  private rng: Rng;
  private occupied = new Set<number>();
  private spawnQueue: QueuedSpawn[] = [];
  private spawnedAll = false;
  private nextId = 1;
  private armorBreakUntil = new Map<number, number>();
  private acc = 0; // fixed-timestep accumulator

  constructor(seed: number, meta: MetaModifiers) {
    this.rng = new Rng(seed);
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
      rally: { x: pathPoints[Math.floor(pathPoints.length / 2)].x, y: pathPoints[Math.floor(pathPoints.length / 2)].y },
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
    const cell = buildCellAt(px, py);
    if (!cell) return false;
    if (this.occupied.has(cell.index)) return false;
    const def = TOWER_DEFS[kind];
    if (this.biomass < def.cost) return false;
    this.biomass -= def.cost;
    this.occupied.add(cell.index);
    this.towers.push({
      id: this.nextId++,
      kind,
      x: cell.x,
      y: cell.y,
      cell: cell.index,
      cooldown: 0,
      overcharged: false,
    });
    return true;
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
    const def = ENEMY_DEFS[kind];
    this.enemies.push({
      id: this.nextId++,
      kind,
      x: spawnPoint.x,
      y: spawnPoint.y,
      hp: def.hp * hpMult,
      maxHp: def.hp * hpMult,
      baseArmor: def.armor,
      speed: def.speed,
      bounty: def.bounty * bountyMult,
      damage: def.damage,
      pathIndex: 1,
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

  private reactorCells(): BuildCell[] {
    const cells: BuildCell[] = [];
    for (const t of this.towers) {
      if (t.kind === 'reactor') cells.push(buildCells[t.cell]);
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
      const cell = buildCells[t.cell];
      t.overcharged = reactors.some((rc) => cellsAdjacent(rc, cell));
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
          this.projectiles.push({
            id: this.nextId++,
            x: t.x,
            y: t.y,
            tx: e.x,
            ty: e.y,
            speed: def.projectileSpeed,
            targetId: e.id,
            damage: def.damage * dmgMult,
            kind: 'needle',
            splash: 0,
            alive: true,
          });
        }
        t.cooldown = def.fireInterval / rateMult;
      } else if (t.kind === 'mortar') {
        const target = this.pickTargets(t.x, t.y, def.range, 1)[0];
        if (!target) continue;
        this.projectiles.push({
          id: this.nextId++,
          x: t.x,
          y: t.y,
          tx: target.x,
          ty: target.y,
          speed: def.projectileSpeed,
          targetId: -1,
          damage: def.damage * dmgMult,
          kind: 'mortar',
          splash: def.splash * this.mods.splashRadiusMult,
          alive: true,
        });
        t.cooldown = def.fireInterval / rateMult;
      }
    }
  }

  /** Up to `n` distinct enemies in range, prioritizing those furthest along the path. */
  private pickTargets(x: number, y: number, range: number, n: number): Enemy[] {
    const r2 = range * range;
    const inRange = this.enemies.filter((e) => e.alive && dist2(x, y, e.x, e.y) <= r2);
    inRange.sort((a, b) => b.pathIndex - a.pathIndex);
    return inRange.slice(0, n);
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
    this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  private mortarImpact(p: Projectile): void {
    const r2 = p.splash * p.splash;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (dist2(p.x, p.y, e.x, e.y) <= r2) {
        this.applyDamage(e, p.damage);
        e.corrosion = STATUS.corrosionDuration;
        if (this.mods.mortarAppliesFracture) this.addFracture(e, 1);
        this.maybeShred(e);
      }
    }
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
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (dist2(pool.x, pool.y, e.x, e.y) <= r2) {
          this.applyDamage(e, pool.dps * dt);
          e.corrosion = STATUS.corrosionDuration;
          this.maybeShred(e);
        }
      }
      pool.remaining -= dt;
    }
    this.pools = this.pools.filter((p) => p.remaining > 0);
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

  private enemyMoveSystem(dt: number): void {
    const slowBase = STATUS.corrosionSlow + this.mods.corrosionSlowBonus;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const slow = e.corrosion > 0 ? Math.min(0.85, slowBase) : 0;
      const step = e.speed * (1 - slow) * dt;
      if (e.pathIndex >= pathPoints.length) {
        this.hitNucleus(e);
        continue;
      }
      const wp = pathPoints[e.pathIndex];
      if (dist(e.x, e.y, wp.x, wp.y) <= step) {
        e.x = wp.x;
        e.y = wp.y;
        e.pathIndex++;
        if (e.pathIndex >= pathPoints.length) this.hitNucleus(e);
      } else {
        const np = moveToward(e.x, e.y, wp.x, wp.y, step);
        e.x = np.x;
        e.y = np.y;
      }
    }
  }

  private hitNucleus(e: Enemy): void {
    if (!e.alive) return;
    if (!this.god) this.integrity -= e.damage;
    e.alive = false;
    this.floats.push({ x: nucleusPoint.x, y: nucleusPoint.y - 14, text: `-${e.damage}`, color: '#ff5d73', life: 0.9 });
  }

  private heroSystem(dt: number): void {
    const h = this.hero;
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

    // pick nearest enemy in aggro range
    let target: Enemy | null = null;
    let best = HERO.aggroRange * HERO.aggroRange;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d2 = dist2(h.x, h.y, e.x, e.y);
      if (d2 < best) {
        best = d2;
        target = e;
      }
    }

    const goal = target ? { x: target.x, y: target.y } : h.rally;
    const np = moveToward(h.x, h.y, goal.x, goal.y, HERO.speed * dt);
    h.x = np.x;
    h.y = np.y;
    // clamp within leash of rally
    const dr = dist(h.x, h.y, h.rally.x, h.rally.y);
    if (dr > HERO.leashRadius) {
      const c = moveToward(h.rally.x, h.rally.y, h.x, h.y, HERO.leashRadius);
      h.x = c.x;
      h.y = c.y;
    }

    // attack
    if (target && h.attackCd <= 0 && dist(h.x, h.y, target.x, target.y) <= HERO.attackRange) {
      this.applyDamage(target, HERO.attackDamage * this.mods.heroDamageMult);
      this.addFracture(target, HERO.attackFracture);
      this.maybeShred(target);
      h.attackCd = HERO.attackInterval;
    }

    // contact damage to the hero from nearby enemies
    let incoming = 0;
    for (const e of this.enemies) {
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
    let removed = false;
    for (const e of this.enemies) {
      if (e.alive && e.hp <= 0) {
        e.alive = false;
        this.kills++;
        const gain = e.bounty * this.mods.biomassMult;
        this.biomass += gain;
        this.armorBreakUntil.delete(e.id);
        removed = true;
      }
    }
    if (removed) this.enemies = this.enemies.filter((e) => e.alive);
  }

  private floatSystem(dt: number): void {
    for (const f of this.floats) {
      f.life -= dt;
      f.y -= 18 * dt;
    }
    this.floats = this.floats.filter((f) => f.life > 0);
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
      hero: this.hero,
      phase: this.phase,
      selectedTower: this.selectedTower,
      armedAbility: this.armedAbility,
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
