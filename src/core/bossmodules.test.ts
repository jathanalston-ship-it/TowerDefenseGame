import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT } from './config';
import { towerSlots } from './map';
import { bossProblems } from './boss';
import type { BossDef, BossModule } from './boss';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

let seq = 0;
function testBoss(modules: BossModule[]): BossDef {
  return {
    id: `test_boss_${seq++}`, name: 'Test Boss', chassis: 'bruiser', hpMult: 1, radius: 30, color: '#ffffff',
    bounty: 100, damage: 10, modules, phases: [{ threshold: 1, modules: modules.map((_, i) => i) }], modifiers: [],
  };
}

describe('boss modules: charger + suppressor (previously reserved, now wired)', () => {
  it('a suppressor module disables nearby towers', () => {
    const g = new Game(1, NO_META);
    g.placeTower('needle', towerSlots[0].x, towerSlots[0].y);
    const tower = g.towers[0];
    expect(tower.disabledUntil).toBe(0);
    g.startWave();
    g.spawnBoss(testBoss([{ kind: 'suppressor', cooldown: 1, duration: 3, radius: 9999 }]));
    for (let i = 0; i < 120; i++) g.advance(SIM_DT); // ~2s: the suppressor fires + refreshes
    expect(tower.disabledUntil).toBeGreaterThan(g.time); // actively suppressed
  });

  it('a charger module opens a dash window and drives the boss down-field faster', () => {
    const g = new Game(2, NO_META);
    g.startWave();
    g.spawnBoss(testBoss([{ kind: 'charger', cooldown: 1, duration: 1.5 }]));
    const boss = g.enemies.find((e) => e.boss)!;
    const yStart = boss.y;
    let sawCharge = false;
    for (let i = 0; i < 120; i++) {
      g.advance(SIM_DT);
      if ((boss.boss?.charge ?? 0) > 0) sawCharge = true;
    }
    expect(sawCharge).toBe(true); // the dash window was active
    expect(boss.y).toBeGreaterThan(yStart); // it advanced toward the line
  });
});

// ── Siege behaviors (docs/BOSS-DESIGN.md §siege) — the encounter-defining tier ──────────────

function siegeBoss(modules: BossModule[], phases?: BossDef['phases']): BossDef {
  return {
    id: `siege_boss_${seq++}`, name: 'Siege Boss', chassis: 'juggernaut', hpMult: 4, radius: 34,
    color: '#ffffff', bounty: 100, damage: 10, modules,
    phases: phases ?? [{ threshold: 1, modules: modules.map((_, i) => i) }], modifiers: [],
  };
}

describe('siege behaviors', () => {
  it('corecrush: grips at the Hive, drains Integrity over time, and EXPOSES the boss', () => {
    const g = new Game(3, NO_META);
    g.startWave();
    g.spawnBoss(siegeBoss([{ kind: 'corecrush', cooldown: 1, amount: 8, duration: 3 }]));
    const boss = g.enemies.find((e) => e.boss)!;
    boss.sieging = true; // parked at the Hive (the module only fires there)
    const before = g.integrity;
    for (let i = 0; i < 90; i++) g.advance(SIM_DT); // ~1.5s: fire + drain
    expect(boss.boss!.grip).toBeGreaterThan(0);
    expect(g.integrity).toBeLessThan(before); // the Core is being CRUSHED
    expect(boss.boss!.telegraph).toBe('CORE CRUSH');
  });

  it('corecrush grip BREAKS when the boss is peeled off the Hive', () => {
    const g = new Game(3, NO_META);
    g.startWave();
    g.spawnBoss(siegeBoss([{ kind: 'corecrush', cooldown: 1, amount: 8, duration: 30 }]));
    const boss = g.enemies.find((e) => e.boss)!;
    boss.sieging = true;
    for (let i = 0; i < 90; i++) g.advance(SIM_DT);
    expect(boss.boss!.grip).toBeGreaterThan(0);
    boss.sieging = false; // peeled (fear/kill-pressure fantasy)
    g.advance(SIM_DT);
    expect(boss.boss!.grip).toBe(0);
  });

  it('burrower: submerges (untargetable, immobile) then ERUPTS beside the Hive', () => {
    const g = new Game(3, NO_META);
    g.placeTower('needle', towerSlots[0].x, towerSlots[0].y);
    g.startWave();
    g.spawnBoss(siegeBoss([{ kind: 'burrower', cooldown: 1, duration: 1.5 }]));
    const boss = g.enemies.find((e) => e.boss)!;
    for (let i = 0; i < 48; i++) g.advance(SIM_DT); // ~0.8s: the burrow fires
    expect(boss.boss!.burrow).toBeGreaterThan(0);
    const hpDuring = boss.hp;
    const yDuring = boss.y;
    for (let i = 0; i < 30; i++) g.advance(SIM_DT); // half a second submerged
    expect(boss.hp).toBe(hpDuring); // untargetable — nothing lands
    expect(boss.y).toBe(yDuring); // immobile while under
    // advance until it surfaces once (the 1s test cooldown re-burrows quickly after)
    let emerged = false;
    for (let i = 0; i < 240 && !emerged; i++) {
      g.advance(SIM_DT);
      if (boss.boss!.burrow === 0) emerged = true;
    }
    expect(emerged).toBe(true);
    expect(boss.y).toBeGreaterThan(yDuring + 100); // erupted DEEP downfield, beside the Hive
  });

  it('bulwark grows a REAL bio-shield that soaks damage before HP', () => {
    const g = new Game(3, NO_META);
    g.startWave();
    g.spawnBoss(siegeBoss([{ kind: 'bulwark', cooldown: 1, amount: 300 }]));
    const boss = g.enemies.find((e) => e.boss)!;
    for (let i = 0; i < 90; i++) g.advance(SIM_DT);
    expect(boss.shield ?? 0).toBeGreaterThan(0); // the shield is REAL HP — applyDamage soaks it first
  });

  it('corruptor seeds a decaying pool that weakens towers inside', () => {
    const g = new Game(3, NO_META);
    g.placeTower('needle', towerSlots[0].x, towerSlots[0].y);
    g.startWave();
    g.spawnBoss(siegeBoss([{ kind: 'corruptor', cooldown: 1, duration: 2, radius: 90, frac: 0.35 }]));
    for (let i = 0; i < 90; i++) g.advance(SIM_DT);
    expect(g.corruptionPools.length).toBeGreaterThan(0);
    const pool = g.corruptionPools[0];
    expect(pool.frac).toBe(0.35);
    // the pool lands ON the tower cluster (the counter is building OUTSIDE it)
    expect(Math.hypot(pool.x - towerSlots[0].x, pool.y - towerSlots[0].y)).toBeLessThan(1);
    const boss = g.enemies.find((e) => e.boss)!;
    boss.hp = 0; // slay the corruptor — its pools must still fade on their own
    for (let i = 0; i < 240; i++) g.advance(SIM_DT); // ~4s: every pool decays away
    expect(g.corruptionPools.length).toBe(0);
  });

  it('gravitas DRAGS the hero toward the boss', () => {
    const g = new Game(3, NO_META);
    g.startWave();
    g.spawnBoss(siegeBoss([{ kind: 'gravitas', cooldown: 1, amount: 80, radius: 9999 }]));
    const boss = g.enemies.find((e) => e.boss)!;
    const hero = g.heroes[0];
    const dBefore = Math.hypot(boss.x - hero.x, boss.y - hero.y);
    for (let i = 0; i < 90; i++) g.advance(SIM_DT);
    const dAfter = Math.hypot(boss.x - hero.x, boss.y - hero.y);
    expect(dAfter).toBeLessThan(dBefore - 30); // yanked meaningfully closer
  });

  it('dampener slows nearby tower fire rate for a window (soft suppressor)', () => {
    const g = new Game(3, NO_META);
    g.placeTower('needle', towerSlots[0].x, towerSlots[0].y);
    const tower = g.towers[0];
    g.startWave();
    g.spawnBoss(siegeBoss([{ kind: 'dampener', cooldown: 1, duration: 4, radius: 9999, frac: 0.3 }]));
    for (let i = 0; i < 90; i++) g.advance(SIM_DT);
    expect(tower.dampenedUntil).toBeGreaterThan(g.time); // actively dampened
    expect(tower.dampenFrac).toBe(0.3);
    expect(tower.disabledUntil).toBe(0); // NOT disabled — it still fires, just slower
  });

  it('rally: entering a phase calls reinforcements scaled by missing HP + stamps the visual tier', () => {
    const g = new Game(3, NO_META);
    g.startWave();
    g.spawnBoss(siegeBoss(
      [{ kind: 'rally', cooldown: 999, amount: 4, addKind: 'runner' }],
      [
        { threshold: 1, modules: [], visualTier: 0 },
        { threshold: 0.5, modules: [0], visualTier: 2 },
      ],
    ));
    const boss = g.enemies.find((e) => e.boss)!;
    const beforeCount = g.enemies.length;
    boss.hp = boss.maxHp * 0.4; // wound it below the phase cut
    g.advance(SIM_DT);
    expect(boss.boss!.phase).toBe(1);
    expect(boss.boss!.visualTier).toBe(2); // the authored mutation stage, not the index
    expect(g.enemies.length).toBeGreaterThanOrEqual(beforeCount + 4); // the rally answered
  });

  it('every siege module kind passes content validation, and bad params are rejected', () => {
    for (const m of [
      { kind: 'corecrush', cooldown: 10, amount: 6, duration: 4 },
      { kind: 'burrower', cooldown: 12, duration: 2 },
      { kind: 'bulwark', cooldown: 12, amount: 200 },
      { kind: 'corruptor', cooldown: 10, duration: 5, radius: 90, frac: 0.3 },
      { kind: 'gravitas', cooldown: 10, amount: 80, radius: 200 },
      { kind: 'dampener', cooldown: 8, duration: 4, radius: 140, frac: 0.25 },
      { kind: 'rally', cooldown: 999, amount: 4 },
    ] as BossModule[]) {
      expect(bossProblems(siegeBoss([m]))).toEqual([]);
    }
    expect(bossProblems(siegeBoss([{ kind: 'corruptor', cooldown: 10, duration: 5, radius: 90, frac: 1.4 } as BossModule])).length).toBeGreaterThan(0);
    expect(bossProblems(siegeBoss([{ kind: 'corecrush', cooldown: 10, duration: 4 } as BossModule])).length).toBeGreaterThan(0);
  });
});
