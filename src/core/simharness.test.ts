import { describe, it, expect } from 'vitest';
import { simulateBattle, sweepSeeds, formatReport } from './simharness';
import { TOWER_ORDER } from './config';

describe('combat simulation framework', () => {
  it('is deterministic — same config yields an identical report', () => {
    const a = simulateBattle({ seed: 42, maxWaves: 6 });
    const b = simulateBattle({ seed: 42, maxWaves: 6 });
    expect(a).toEqual(b);
  });

  it('measures every balancing metric in a sane range', () => {
    const r = simulateBattle({ seed: 1, maxWaves: 8 });
    expect(r.waves).toBeGreaterThan(0);
    expect(r.durationSec).toBeGreaterThan(0);
    // throughput
    expect(r.totalTowerDamage).toBeGreaterThan(0);
    expect(r.towerDpsTeam).toBeGreaterThan(0);
    expect(r.heroDps).toBeGreaterThanOrEqual(0);
    // a tower the autopilot actually built should report positive per-second DPS
    expect(r.towerDps.needle).toBeGreaterThan(0);
    // survival
    expect(r.enemiesSpawned).toBeGreaterThan(0);
    expect(r.enemiesKilled).toBeGreaterThan(0);
    expect(r.enemiesLeaked).toBeGreaterThanOrEqual(0);
    expect(r.killRate).toBeGreaterThan(0);
    expect(r.killRate).toBeLessThanOrEqual(1);
    expect(r.avgEnemyLifetimeSec).toBeGreaterThan(0);
    // economy
    expect(r.totalBiomassEarned).toBeGreaterThan(0);
    expect(r.economyPerSec).toBeGreaterThan(0);
    // status uptime is a fraction in [0,1] for every status
    for (const s of ['Fracture', 'Corrosion', 'Infection', 'Disruption'] as const) {
      expect(r.statusUptime[s]).toBeGreaterThanOrEqual(0);
      expect(r.statusUptime[s]).toBeLessThanOrEqual(1);
    }
    // per-wave rows are present and bookkept
    expect(r.perWave.length).toBeGreaterThan(0);
    expect(r.perWave[0].durationSec).toBeGreaterThan(0);
  });

  it("the difficulty 'standard' is identity (report matches the default run)", () => {
    const def = simulateBattle({ seed: 7, maxWaves: 6 });
    const std = simulateBattle({ seed: 7, difficulty: 'standard', maxWaves: 6 });
    expect(std).toEqual(def);
  });

  it('a harder difficulty changes the battle (the knobs are wired through)', () => {
    const std = simulateBattle({ seed: 7, maxWaves: 6 });
    const brutal = simulateBattle({ seed: 7, difficulty: 'brutal', maxWaves: 6 });
    expect(brutal).not.toEqual(std);
    // Tougher hosts survive longer on average than on Standard.
    expect(brutal.avgEnemyLifetimeSec).toBeGreaterThan(std.avgEnemyLifetimeSec);
  });

  it('sweepSeeds aggregates a balancing summary across seeds', () => {
    const agg = sweepSeeds([1, 7, 42], { maxWaves: 6 });
    expect(agg.runs).toBe(3);
    expect(agg.winRate).toBeGreaterThanOrEqual(0);
    expect(agg.winRate).toBeLessThanOrEqual(1);
    expect(agg.avgWaves).toBeGreaterThan(0);
    expect(agg.avgEconomyPerSec).toBeGreaterThan(0);
    for (const k of TOWER_ORDER) expect(agg.avgTowerDps[k]).toBeGreaterThanOrEqual(0);
  });

  it('endless mode runs headless and reports depth reached', () => {
    const r = simulateBattle({ seed: 99, mode: 'endless', maxWaves: 5 });
    expect(r.mode).toBe('endless');
    expect(r.waves).toBeGreaterThan(0);
    expect(r.enemiesSpawned).toBeGreaterThan(0);
  });

  it('formatReport renders a readable multi-line summary', () => {
    const text = formatReport(simulateBattle({ seed: 1, maxWaves: 4 }));
    expect(text).toContain('Sim stage/standard seed 1');
    expect(text).toContain('status uptime');
  });
});
