// Run debrief (docs/REWARD-PRESENTATION.md §debrief) — the Results "what happened" read-model.
// Pins: framework bosses are named by what actually fell (never the 'tyrant' render proxy), the
// achievement that keys off that proxy describes what it measures, and a defeat explains itself
// (how close, what got through, one concrete next step that never points at a sealed wing).

import { describe, expect, it } from 'vitest';
import { Game } from '../core/game';
import { ENEMY_DEFS, SIM_DT } from '../core/config';
import type { BossDef } from '../core/boss';
import type { MetaModifiers, RunStats } from '../core/types';
import { defaultSave } from '../save/saveStore';
import { achievementById, checkAchievements } from './achievements';
import { accumulateStats } from './stats';
import { defeatDebrief, highestThreat } from './runDebrief';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const boss = (name: string): BossDef => ({
  id: `rd_${name}`, name, chassis: 'artillery', hpMult: 1, radius: 30, color: '#ffffff',
  bounty: 100, damage: 10, modules: [], phases: [{ threshold: 1, modules: [] }], modifiers: [],
});

/** A run that kills exactly one framework boss named `name` (and nothing else). */
function bossKillStats(name: string): RunStats {
  const g = new Game(5, NO_META);
  g.startWave();
  (g as unknown as { spawnQueue: unknown[] }).spawnQueue.length = 0;
  g.spawnBoss(boss(name));
  g.enemies.find((e) => e.boss)!.hp = 0;
  g.advance(SIM_DT);
  return g.getRunStats();
}

describe('boss naming — the root of "Apex Slayer: Slay a Brood Tyrant" on an Apex Bombard stage', () => {
  it('Highest Threat names the framework boss that fell, not the tyrant render proxy', () => {
    const stats = bossKillStats('Apex Bombard');
    expect(stats.killsByEnemy.tyrant).toBe(1); // the proxy count the old code read as "Brood Tyrant"
    expect(highestThreat(stats)?.name).toBe('Apex Bombard');
  });

  it('a genuine (authored) Brood Tyrant kill is still named as one', () => {
    const stats = { ...bossKillStats('Viral Matriarch'), bossesSlain: [], bossKills: 0 };
    expect(highestThreat(stats)?.name).toBe(ENEMY_DEFS.tyrant.name);
  });

  it('Apex Slayer unlocks off any boss kill — and its description says exactly that', () => {
    const stats = bossKillStats('Apex Bombard');
    const save = defaultSave();
    const after = { ...save, stats: accumulateStats(save.stats, stats) };
    expect(checkAchievements({ save: after }).some((a) => a.id === 'apex_slayer')).toBe(true);
    const def = achievementById('apex_slayer')!;
    // The trigger counts every boss, so the copy may not promise one specific enemy.
    for (const d of Object.values(ENEMY_DEFS)) expect(def.desc).not.toContain(d.name);
    expect(def.desc.toLowerCase()).toContain('boss');
  });
});

describe('defeat debrief — how close, what got through, one next step', () => {
  const base = (): RunStats => ({ ...bossKillStats('Unused'), bossesSlain: [], bossKills: 0 });

  it('a win has no debrief', () => {
    expect(defeatDebrief({ won: true, wave: 6, stats: base() }, { power: 1000, rec: 1000, canOpen: () => true })).toBeNull();
  });

  it('a boss-wave loss reports the wave, the boss HP left, the top leakers and the boss plan', () => {
    const stats: RunStats = {
      ...base(), totalWaves: 6,
      hiveDamageBy: { 'boss:Viral Matriarch': 60, runner: 30, flea: 10 },
      bossHpAtDefeat: [{ name: 'Viral Matriarch', hpFrac: 0.234 }],
    };
    const d = defeatDebrief({ won: false, wave: 6, stats }, { power: 1100, rec: 1103, canOpen: () => true })!;
    expect(d.wave).toBe(6);
    expect(d.totalWaves).toBe(6);
    expect(d.bosses).toEqual([{ name: 'Viral Matriarch', hpPct: 23 }]);
    expect(d.threats.map((t) => t.name)).toEqual(['Viral Matriarch', ENEMY_DEFS.runner.name, ENEMY_DEFS.flea.name]);
    expect(d.threats[0].share).toBeCloseTo(0.6, 5);
    expect(d.tip).toMatch(/boss/i);
  });

  it('a genuine Power gap points at the first OPEN spend wing — never a sealed one', () => {
    const stats: RunStats = { ...base(), totalWaves: 6, hiveDamageBy: { runner: 50 } };
    const sealedLab = defeatDebrief({ won: false, wave: 3, stats }, { power: 500, rec: 1000, canOpen: (n) => n === 'heroes' })!;
    expect(sealedLab.tipNav).toBe('heroes');
    const nothingOpen = defeatDebrief({ won: false, wave: 3, stats }, { power: 500, rec: 1000, canOpen: () => false })!;
    expect(nothingOpen.tipNav).toBeUndefined();
    expect(nothingOpen.tip).toMatch(/replay a cleared stage/);
  });

  it('otherwise the tip counters the top leaker by its traits (data, not a per-enemy ladder)', () => {
    const flyer = (Object.values(ENEMY_DEFS).find((d) => d.behavior.flying))!;
    const stats: RunStats = { ...base(), totalWaves: 6, hiveDamageBy: { [flyer.kind]: 40 } };
    const d = defeatDebrief({ won: false, wave: 4, stats }, { power: 1000, rec: 1000, canOpen: () => true })!;
    expect(d.tip).toContain(flyer.name);
    expect(d.tip).toMatch(/fly/);
  });
});
