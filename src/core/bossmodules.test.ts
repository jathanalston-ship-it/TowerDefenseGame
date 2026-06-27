import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT } from './config';
import { towerSlots } from './map';
import type { BossDef, BossModule } from './boss';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0 };

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
