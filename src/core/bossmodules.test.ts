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

// ── Chassis signatures (docs/BOSS-DESIGN.md §identity) — each verb, executed in the sim ────────

function sigBoss(chassis: BossDef['chassis'], modules: BossModule[]): BossDef {
  return {
    id: `sig_boss_${seq++}`, name: 'Signature Boss', chassis, hpMult: 4, radius: 34,
    color: '#ffffff', bounty: 100, damage: 10, modules,
    phases: [{ threshold: 1, modules: modules.map((_, i) => i) }], modifiers: [],
  };
}

describe('chassis signature behaviors', () => {
  it('warcry: the pack gains a timed speed surge, and it FADES', () => {
    const g = new Game(4, NO_META);
    g.startWave();
    g.spawnBoss(sigBoss('bruiser', [{ kind: 'warcry', cooldown: 8, duration: 1, frac: 0.3 }]));
    // First cast lands at 0.6×cooldown ≈ 4.8s — by then the wave has real bodies on the field.
    for (let i = 0; i < 60 * 5; i++) g.advance(SIM_DT);
    const hasted = g.enemies.filter((e) => e.alive && (e.hasteT ?? 0) > 0);
    expect(hasted.length).toBeGreaterThan(0);
    expect(hasted[0].hasteMult).toBeCloseTo(1.3, 5);
    for (let i = 0; i < 90; i++) g.advance(SIM_DT); // 1.5s — past the 1s surge
    expect(g.enemies.every((e) => (e.hasteT ?? 0) === 0)).toBe(true); // the cry faded before the next
  });

  it('mortarfall: reticles bloom ON the guns, then the landed strike SUPPRESSES them', () => {
    const g = new Game(4, NO_META);
    g.placeTower('needle', towerSlots[0].x, towerSlots[0].y);
    const tower = g.towers[0];
    g.startWave();
    g.spawnBoss(sigBoss('artillery', [{ kind: 'mortarfall', cooldown: 2, amount: 2, radius: 70, duration: 2.5 }]));
    let sawReticle = false;
    for (let i = 0; i < 60 * 4; i++) {
      g.advance(SIM_DT);
      if (g.mortarStrikes.some((s) => Math.hypot(s.x - tower.x, s.y - tower.y) < 1)) sawReticle = true;
    }
    expect(sawReticle).toBe(true); // the lock painted the densest gun
    expect(tower.disabledUntil).toBeGreaterThan(g.time); // the strike landed — suppressed
  });

  it('broodburst: spends its own HP to birth adds and leaves the body EXPOSED', () => {
    const g = new Game(4, NO_META);
    g.startWave();
    g.spawnBoss(sigBoss('swarmlord', [{ kind: 'broodburst', cooldown: 30, amount: 5, frac: 0.1, duration: 2, addKind: 'runner' }]));
    const boss = g.enemies.find((e) => e.boss)!;
    const before = g.enemies.length;
    for (let i = 0; i < 60 * 19; i++) g.advance(SIM_DT); // first cast at 0.6×30 = 18s
    expect(boss.hp).toBeLessThan(boss.maxHp); // the tearing has a price
    expect(g.enemies.length).toBeGreaterThanOrEqual(before + 5);
    let exposedSeen = boss.boss!.exposeT > 0;
    for (let i = 0; i < 60 * 3 && !exposedSeen; i++) { g.advance(SIM_DT); exposedSeen = boss.boss!.exposeT > 0; }
    expect(exposedSeen).toBe(true);
  });

  it('nullwell: wells SWALLOW crossing projectiles (the boss walks untouched), capped at two', () => {
    // Control first: in this exact setup (boss parked beside the gun, heroes benched) the
    // needle LANDS — so a frozen HP bar below is the wells' doing, not a vacuous test.
    seq = 40; // identical boss ids/names across both runs — only the module differs
    const control = new Game(7, NO_META);
    control.placeTower('needle', towerSlots[0].x, towerSlots[0].y);
    control.startWave();
    control.spawnBoss(sigBoss('controller', [{ kind: 'rally', cooldown: 999, amount: 4 }])); // never fires
    const cBoss = control.enemies.find((e) => e.boss)!;
    cBoss.x = towerSlots[0].x;
    cBoss.y = towerSlots[0].y - 120;
    for (const h of control.heroes) { h.down = true; h.respawn = 999; } // only PROJECTILES may touch it
    for (let i = 0; i < 60 * 3; i++) control.advance(SIM_DT);
    expect(cBoss.hp).toBeLessThan(cBoss.maxHp); // the needle lands

    seq = 40;
    const g = new Game(7, NO_META);
    g.placeTower('needle', towerSlots[0].x, towerSlots[0].y);
    g.startWave();
    g.spawnBoss(sigBoss('controller', [{ kind: 'nullwell', cooldown: 1, radius: 9999, duration: 99 }]));
    const boss = g.enemies.find((e) => e.boss)!;
    boss.x = towerSlots[0].x;
    boss.y = towerSlots[0].y - 120;
    for (const h of g.heroes) { h.down = true; h.respawn = 999; }
    let guard = 0;
    while (g.nullWells.length === 0 && guard++ < 600) g.advance(SIM_DT); // ≤10s to the first cast
    expect(g.nullWells.length).toBeGreaterThan(0);
    const hpAtWell = boss.hp; // (a shot may land in the pre-well window — that's the fair fight)
    for (let i = 0; i < 60 * 3; i++) g.advance(SIM_DT);
    expect(boss.hp).toBe(hpAtWell); // a full-field well: every shot died crossing it
    expect(g.nullWells.length).toBeLessThanOrEqual(2); // fairness cap holds under cooldown-1 spam
  });

  it('unstoppable: the march shrugs damage in applyDamage AND ignores slows for the window', () => {
    const mods: BossModule[] = [{ kind: 'unstoppable', cooldown: 1, duration: 10, frac: 0.5 }];
    const inert: BossModule[] = [{ kind: 'rally', cooldown: 999, amount: 4 }];
    const run = (modules: BossModule[]): number => {
      seq = 60; // identical ids across runs
      const g = new Game(9, NO_META);
      g.startWave();
      g.spawnBoss(sigBoss('juggernaut', modules));
      const boss = g.enemies.find((e) => e.boss)!;
      boss.disrupt = 999; // a permanent Neural slow — the march must ignore it, the control must not
      for (let i = 0; i < 60 * 3; i++) g.advance(SIM_DT);
      if (modules === mods) {
        expect(boss.boss!.unstop).toBeGreaterThan(0); // the window is live when we sample
        expect(boss.boss!.unstopDR).toBe(0.5);
        // The DR fold, sampled through the REAL damage pipe (reaction bursts are true damage
        // and intentionally bypass it — like they crack carapace). Same hit, window on vs off:
        const dmg = (g as unknown as { applyDamage: (e: typeof boss, raw: number) => number }).applyDamage.bind(g);
        const during = dmg(boss, 500);
        boss.boss!.unstop = 0; // close the window — same boss, same armor, same vulnerability
        const after = dmg(boss, 500);
        expect(during).toBeLessThan(after); // the march shrugged its authored fraction
        boss.boss!.unstop = 10; // restore for the movement leg below
      }
      return boss.y;
    };
    const controlY = run(inert);
    const marchY = run(mods);
    expect(marchY).toBeGreaterThan(controlY); // the slow never bit — it out-marched the control
  });

  it('every signature passes content validation on its owner chassis', () => {
    expect(bossProblems(sigBoss('bruiser', [{ kind: 'warcry', cooldown: 12, duration: 3.5, frac: 0.28 }]))).toEqual([]);
    expect(bossProblems(sigBoss('artillery', [{ kind: 'mortarfall', cooldown: 13, amount: 3, radius: 70, duration: 2.6 }]))).toEqual([]);
    expect(bossProblems(sigBoss('swarmlord', [{ kind: 'broodburst', cooldown: 14, amount: 6, frac: 0.1, duration: 3 }]))).toEqual([]);
    expect(bossProblems(sigBoss('controller', [{ kind: 'nullwell', cooldown: 13, radius: 80, duration: 5 }]))).toEqual([]);
    expect(bossProblems(sigBoss('juggernaut', [{ kind: 'unstoppable', cooldown: 15, duration: 4, frac: 0.35 }]))).toEqual([]);
    // Malformed params refused: a warcry without a frac, a nullwell without a radius.
    expect(bossProblems(sigBoss('bruiser', [{ kind: 'warcry', cooldown: 12, duration: 3.5 } as BossModule])).length).toBeGreaterThan(0);
    expect(bossProblems(sigBoss('controller', [{ kind: 'nullwell', cooldown: 13, duration: 5 } as BossModule])).length).toBeGreaterThan(0);
  });
});
