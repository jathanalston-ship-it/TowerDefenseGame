// Hive Siege framework (docs/HIVE-SIEGE.md) — the enemy-side combat contracts:
// enemies ATTACK the Hive Core instead of despawning at a line. Pinned here:
// arrival → crust lock, the windup/cycle attack loop (DPS = damage/interval),
// stun interruption + slow stretching, suicide one-shot detonation, artillery on
// the same gating, 100 simultaneous attackers without deadlocks or frozen AI,
// wave end once the crust is dead, and byte-level determinism of it all.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { ENEMY_DEFS, HIVE, SIM_DT } from './config';
import { nucleusPoint } from './map';
import { applyStatus, STATUS_EFFECTS } from './status';
import type { Enemy, MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 100000, bonusSlots: 0 };

/** A clean siege lab: a live wave with the spawn queue emptied and heroes benched, so the
 *  only combatants are the enemies WE inject — nothing else moves the integrity needle. */
function lab(seed = 7): Game {
  const g = new Game(seed, NO_META);
  g.startWave();
  (g as unknown as { spawnQueue: unknown[] }).spawnQueue.length = 0;
  for (const h of g.heroes) {
    h.down = true;
    h.respawn = 99999;
  }
  return g;
}

let nextId = 900000;
function inject(g: Game, kind: keyof typeof ENEMY_DEFS, x: number, y: number): Enemy {
  const def = ENEMY_DEFS[kind];
  const e: Enemy = {
    id: nextId++, kind, x, y, hp: def.hp, maxHp: def.hp, baseArmor: def.armor, speed: def.speed,
    bounty: def.bounty, damage: def.damage, fracture: 0, corrosion: 0, infection: 0, disrupt: 0, mark: 0, resonance: 0,
    shredFlash: 0, hitFlash: 0, dmgAccum: 0, dmgTimer: 0, alive: true,
    sieging: false, ring: 0, attackCd: 0, windup: -1,
    attackInterval: def.attack.interval, attackWindup: def.attack.windup,
    lastHitKind: null, boss: null, elite: false,
    shield: def.shieldHp, summonCd: def.summon?.interval, siegeCd: def.siege?.interval,
  };
  g.enemies.push(e);
  return e;
}

function run(g: Game, seconds: number): void {
  const ticks = Math.round(seconds / SIM_DT);
  for (let i = 0; i < ticks; i++) g.advance(SIM_DT);
}

describe('siege arrival & the attack loop', () => {
  it('an enemy reaching the Hive LOCKS ON and attacks continuously — it never despawns', () => {
    const g = lab();
    const e = inject(g, 'runner', nucleusPoint.x, HIVE.convergeY + 20);
    const int0 = g.integrity;
    run(g, 6);
    expect(e.alive).toBe(true); // still here — no finish-line despawn
    expect(e.sieging).toBe(true);
    expect(g.enemies).toContain(e);
    const def = ENEMY_DEFS.runner;
    const lost = int0 - g.integrity;
    // ~6s of approach + chewing at damage/interval; generous band (approach eats ~1s)
    const ceiling = (6 / def.attack.interval) * def.damage;
    expect(lost).toBeGreaterThan(ceiling * 0.5);
    expect(lost).toBeLessThanOrEqual(ceiling);
    // and it holds the contact ring, not the old bottom line
    const d = Math.hypot(e.x - nucleusPoint.x, e.y - nucleusPoint.y);
    expect(d).toBeLessThan(HIVE.coreRadius + def.radius + HIVE.contactPad + HIVE.maxRings * HIVE.ringGap + 1);
  });

  it('sustained DPS equals damage/interval (interval = full start-to-start cycle)', () => {
    const g = lab();
    const e = inject(g, 'tank', nucleusPoint.x, nucleusPoint.y - HIVE.coreRadius - ENEMY_DEFS.tank.radius);
    run(g, 2); // settle into the loop (arrival + first windup + stagger)
    expect(e.sieging).toBe(true);
    const int0 = g.integrity;
    const window = 11; // multiple full cycles
    run(g, window);
    const dps = (int0 - g.integrity) / window;
    const expected = ENEMY_DEFS.tank.damage / ENEMY_DEFS.tank.attack.interval;
    expect(Math.abs(dps - expected) / expected).toBeLessThan(0.15);
  });

  it('stun INTERRUPTS the attack (the swing is lost) and the loop resumes after', () => {
    const g = lab();
    const e = inject(g, 'brute', nucleusPoint.x, nucleusPoint.y - HIVE.coreRadius - ENEMY_DEFS.brute.radius);
    run(g, 3); // sieging + mid-loop
    expect(e.sieging).toBe(true);
    const int0 = g.integrity;
    // permanent stun: re-applied every tick so it never expires during the window
    for (let i = 0; i < Math.round(2.5 / SIM_DT); i++) {
      e.statuses ??= [];
      applyStatus(e.statuses, STATUS_EFFECTS.stun);
      g.advance(SIM_DT);
    }
    expect(g.integrity).toBe(int0); // not a single hit landed while controlled
    run(g, 3); // control released → the assault resumes
    expect(g.integrity).toBeLessThan(int0);
  });

  it('suicide kinds detonate ONCE at the Core and are gone — no lingering melee', () => {
    const g = lab();
    const def = ENEMY_DEFS.bomber;
    const e = inject(g, 'bomber', nucleusPoint.x, nucleusPoint.y - HIVE.coreRadius - def.radius);
    const int0 = g.integrity;
    run(g, 4);
    expect(int0 - g.integrity).toBe(def.damage); // exactly one burst
    expect(e.alive).toBe(false);
    expect(g.enemies).not.toContain(e); // evicted, not idling at the crust
  });

  it('artillery runs on the SAME combat gating: stun pauses the battery', () => {
    const g = lab();
    const def = ENEMY_DEFS.siegeworm;
    const e = inject(g, 'siegeworm', nucleusPoint.x, 660); // past its standoff line — it bombards
    const shellsAt = (): number => (g as unknown as { enemyShells: unknown[] }).enemyShells.length;
    let sawShell = false;
    for (let i = 0; i < Math.round(def.siege!.interval * 2.5 / SIM_DT); i++) {
      g.advance(SIM_DT);
      if (shellsAt() > 0) sawShell = true;
    }
    expect(sawShell).toBe(true); // the battery works when free
    // stun ON, then let the already-airborne volleys land (in-flight shells are combat
    // residue, like projectiles) before measuring the silence
    for (let i = 0; i < Math.round(3 / SIM_DT); i++) {
      e.statuses ??= [];
      applyStatus(e.statuses, STATUS_EFFECTS.stun);
      g.advance(SIM_DT);
    }
    const before = g.integrity;
    for (let i = 0; i < Math.round(def.siege!.interval * 3 / SIM_DT); i++) {
      e.statuses ??= [];
      applyStatus(e.statuses, STATUS_EFFECTS.stun);
      g.advance(SIM_DT);
      expect(shellsAt()).toBe(0); // not one NEW volley while controlled
    }
    expect(g.integrity).toBe(before);
  });
});

describe('the crust at scale', () => {
  it('100 simultaneous attackers: everyone engages, spreads across rings, nobody freezes', () => {
    const g = lab(11);
    for (let i = 0; i < 100; i++) {
      inject(g, 'runner', 60 + (i % 20) * 30, HIVE.convergeY + 10 + Math.floor(i / 20) * 18);
    }
    run(g, 8); // converge + settle + chew
    const sieging = g.enemies.filter((e) => e.alive && e.sieging);
    expect(g.enemies.length).toBe(100); // no despawns, no evictions
    expect(sieging.length).toBe(100); // ALL of them made it onto the crust — no stuck AI
    // positions are finite and spread — no NaN, no giant clipping stack on one point
    let maxRing = 0;
    const cells = new Set<string>();
    for (const e of sieging) {
      expect(Number.isFinite(e.x) && Number.isFinite(e.y)).toBe(true);
      maxRing = Math.max(maxRing, e.ring);
      cells.add(`${Math.round(e.x / 8)}:${Math.round(e.y / 8)}`);
    }
    expect(maxRing).toBeGreaterThanOrEqual(2); // late arrivals took outer rings
    expect(cells.size).toBeGreaterThan(40); // the crowd occupies many distinct 8px cells
    // no frozen AI: over one steady window the crowd lands ≈ damage/interval each
    const int0 = g.integrity;
    run(g, 3);
    const dps = (int0 - g.integrity) / 3;
    const expected = (100 * ENEMY_DEFS.runner.damage) / ENEMY_DEFS.runner.attack.interval;
    expect(dps).toBeGreaterThan(expected * 0.8);
    expect(dps).toBeLessThanOrEqual(expected * 1.05);
    // and the pressure readouts see it
    expect(g.hiveAttackers).toBe(100);
    expect(g.hiveDps).toBeCloseTo(expected, 5);
  });

  it('the wave ENDS once the crust is dead (no stuck waves, no leftover phantoms)', () => {
    const g = lab(13);
    for (let i = 0; i < 12; i++) inject(g, 'runner', 100 + i * 40, HIVE.convergeY + 30);
    run(g, 5);
    expect(g.phase).toBe('wave');
    for (const e of g.enemies) e.hp = -1; // the defense finishes them
    run(g, 10); // death eviction + settle beat + phase flip
    expect(g.enemies.length).toBe(0);
    expect(g.phase).not.toBe('wave');
  });
});

describe('determinism under siege', () => {
  it('the identical scenario produces an identical integrity trace', () => {
    const trace = (): number[] => {
      nextId = 900000;
      const g = lab(21);
      for (let i = 0; i < 30; i++) inject(g, i % 3 === 0 ? 'brute' : 'runner', 80 + i * 20, HIVE.convergeY + (i % 5) * 12);
      const out: number[] = [];
      for (let i = 0; i < Math.round(9 / SIM_DT); i++) {
        g.advance(SIM_DT);
        out.push(g.integrity);
      }
      return out;
    };
    expect(trace()).toEqual(trace());
  });
});

// Flawless-run tracking (docs/MODE-IDENTITY.md §flawless cache): RunStats.integrityLost must
// accumulate EVERY point of Nucleus damage — it's what gates the 2nd campaign cache. Pinned on
// the siege path so a future damage-path change can't silently let a hit slip past the counter.
describe('flawless-run damage tracking (RunStats.integrityLost)', () => {
  it('starts at zero and a clean run stays flawless', () => {
    const g = lab();
    expect(g.getRunStats().integrityLost).toBe(0);
    run(g, 2); // nothing injected → the Core takes no hits
    expect(g.getRunStats().integrityLost).toBe(0);
  });

  it('accumulates exactly the integrity the Core lost to a siege', () => {
    const g = lab();
    inject(g, 'runner', nucleusPoint.x, HIVE.convergeY + 20);
    const int0 = g.integrity;
    run(g, 6); // the runner locks on and bites the Core repeatedly
    const lost = int0 - g.integrity;
    expect(lost).toBeGreaterThan(0); // the siege actually landed
    expect(g.getRunStats().integrityLost).toBe(lost); // counter == real damage (no double-count, no miss)
  });
});
