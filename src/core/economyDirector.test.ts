// Adaptive Economy Framework — parity + health-guard pins (docs/ECONOMY_FORMULAS.md).
//   • PARITY: the framework's factor chains reproduce the legacy settle expressions verbatim
//     (bit-exact, left-to-right float order) across the input grid.
//   • NEUTRALITY: adaptive weights ship at 0 — supplying adaptive inputs changes nothing.
//   • ANTI-STARVATION: every farmable currency has a positive, uncapped per-run source.
//   • ANTI-INFLATION: every sink's cost curve grows geometrically (compounding brakes).

import { describe, it, expect } from 'vitest';
import { adaptiveIncomeMult, coreShardIncome, explainIncome, lootPointIncome } from './economyDirector';
import { ECON, ECONOMY_ADAPTIVE, MODE_REWARDS } from './config';
import { LOOT_EARN, RARITIES } from './loot';
import { heroStarCost, towerStarCost, upgradeCost } from '../state/meta';
import { META_UPGRADES } from './config';

const GRID = [
  { wave: 1, kills: 0 },
  { wave: 12, kills: 140 },
  { wave: 60, kills: 900 },
  { wave: 200, kills: 2600 },
];

describe('income parity (legacy settle expressions, verbatim)', () => {
  it('Genome Cores: base × prestige × stage × endless × mode × doctrine, in that order', () => {
    for (const g of GRID) {
      for (const mults of [
        { sg: 1, cg: 1, rm: 1, er: 1, cm: 1, dr: 1 }, // fresh account, quick run
        { sg: 1.1, cg: 1.25, rm: 2.95, er: 1, cm: 0.3, dr: 1.5 }, // deep campaign replay + corrupted
        { sg: 1.2, cg: 1, rm: 1, er: 2.4, cm: 0.2, dr: 1.35 }, // endless nightmare + adaptive doctrine
      ]) {
        const legacy = (g.wave * ECON.shardsPerWave + g.kills * ECON.shardsPerKill) * mults.sg * mults.cg * mults.rm * mults.er * mults.cm * mults.dr;
        const inc = coreShardIncome({
          wave: g.wave, kills: g.kills,
          prestigeShardGainMult: mults.sg, prestigeCoreGainMult: mults.cg,
          stageRewardMult: mults.rm, endlessRewardMult: mults.er,
          modeCoreMult: mults.cm, doctrineRewardMult: mults.dr,
        });
        expect(Object.is(inc.total(), legacy)).toBe(true); // bit-exact (×1 adaptive tail is IEEE identity)
      }
    }
  });

  it('Loot points: base × prestige × stage × mode × containerRate × bossLoot, in that order', () => {
    for (const g of GRID) {
      const legacy = (g.wave * LOOT_EARN.pointsPerWave + g.kills * LOOT_EARN.pointsPerKill) * 1.15 * 1.6 * MODE_REWARDS.loot.endless * 1.3 * 1.08;
      const inc = lootPointIncome({
        wave: g.wave, kills: g.kills,
        prestigeLootGainMult: 1.15, stageRewardMult: 1.6,
        modeLootMult: MODE_REWARDS.loot.endless, containerRateMult: 1.3, bossLootMult: 1.08,
      });
      expect(Object.is(inc.total(), legacy)).toBe(true);
    }
  });

  it('adaptive weights ship at 0 and adaptive inputs change nothing (bit-exact)', () => {
    expect(ECONOMY_ADAPTIVE.catchUpPerPowerGap).toBe(0); // tune ONLY on simulator evidence
    expect(ECONOMY_ADAPTIVE.aheadTaperPerPowerGap).toBe(0);
    expect(adaptiveIncomeMult({ powerGap: 3 })).toBe(1);
    expect(adaptiveIncomeMult({ powerGap: -0.9 })).toBe(1);
    const a = coreShardIncome({ wave: 40, kills: 500, prestigeShardGainMult: 1.1, prestigeCoreGainMult: 1, stageRewardMult: 2, endlessRewardMult: 1, modeCoreMult: 1, doctrineRewardMult: 1 });
    const b = coreShardIncome({ wave: 40, kills: 500, prestigeShardGainMult: 1.1, prestigeCoreGainMult: 1, stageRewardMult: 2, endlessRewardMult: 1, modeCoreMult: 1, doctrineRewardMult: 1, adaptive: { powerGap: 5 } });
    expect(Object.is(a.total(), b.total())).toBe(true);
  });

  it('the factor trace explains a payout without recomputing it', () => {
    const inc = lootPointIncome({ wave: 10, kills: 100, prestigeLootGainMult: 1.2, stageRewardMult: 1, modeLootMult: 1, containerRateMult: 1, bossLootMult: 1 });
    expect(explainIncome(inc)).toContain('base 240'); // 10×14 + 100×1
    expect(explainIncome(inc)).toContain('prestige.lootGain ×1.2');
  });
});

describe('economy health guards', () => {
  it('ANTI-STARVATION: every farmable currency has a positive per-run source', () => {
    expect(ECON.shardsPerWave).toBeGreaterThan(0); // Genome Cores flow from every run
    expect(LOOT_EARN.pointsPerWave).toBeGreaterThan(0); // containers flow from every run
    for (const r of RARITIES) {
      expect(r.reward.rolls).toBeGreaterThan(0); // every container pays rolls …
      expect(r.reward.towerShardRange[0]).toBeGreaterThan(0); // … with tower shards guaranteed
      expect(r.reward.heroShardChance).toBeGreaterThan(0); // … and a real hero-shard chance
    }
  });

  it('ANTI-INFLATION: sink cost curves compound (geometric growth, never flat)', () => {
    for (let s = 0; s < 9; s++) {
      expect(towerStarCost(s + 1)).toBeGreaterThan(towerStarCost(s) * 1.15); // ≥ +15%/star
      expect(heroStarCost(s + 1)).toBeGreaterThan(heroStarCost(s) * 1.1);
    }
    for (const u of META_UPGRADES) {
      for (let l = 0; l < 8; l++) {
        expect(upgradeCost(u, l + 1)).toBeGreaterThan(upgradeCost(u, l)); // strictly rising
      }
      expect(upgradeCost(u, 10)).toBeGreaterThan(upgradeCost(u, 0) * 3); // compounding over bands
    }
  });
});
