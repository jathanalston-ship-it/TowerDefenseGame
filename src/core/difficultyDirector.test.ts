// Universal Difficulty Director — PARITY + IDENTITY pins (docs/DIFFICULTY_DIRECTOR.md).
// The director centralizes scaling POLICY without changing a single number: these tests write
// the legacy inline formulas verbatim and assert exact (bit-level) equality across the
// difficulty × doctrine × depth space. The golden sim suite is the end-to-end gate; this file
// is the unit-level spec of "same numbers, one owner". Adaptive weights must stay 0 until the
// progression simulator calibrates them — pinned here too.

import { describe, it, expect } from 'vitest';
import {
  composeStageDifficulty,
  createDirector,
  doctrineEconomy,
  economyFor,
  hazardRating,
  lootQualityTier,
  modeCoreMult,
  modeLootMult,
  modeMasteryMult,
} from './difficultyDirector';
import { DIFFICULTIES, DIFFICULTY_IDS, resolveDifficulty, STANDARD } from './difficulty';
import { DOCTRINES, DOCTRINE_IDS } from './doctrines';
import { DIRECTOR_ADAPTIVE, ENDLESS, MODE_REWARDS, WAVE_BOUNTY_GROWTH, WAVE_HP_GROWTH } from './config';

const DEPTHS = [1, 2, 5, 12, 30, 60];

describe('RunDirector — exact parity with the legacy inline formulas', () => {
  it('standard + no doctrine is the IDENTITY policy (the golden run contract)', () => {
    const dd = createDirector({ difficulty: STANDARD });
    expect(dd.difficulty).toBe(STANDARD); // no warp ⇒ no fold, same object
    expect(dd.enemySpeedStatic()).toBe(1);
    for (const d of DEPTHS) {
      expect(dd.waveHpMult(d - 1)).toBe(1 + WAVE_HP_GROWTH * (d - 1));
      expect(dd.waveBountyMult(d - 1)).toBe(1 + WAVE_BOUNTY_GROWTH * (d - 1));
      expect(dd.endlessHpMult(d)).toBe(Math.pow(ENDLESS.hpGrowth, d - 1));
      expect(dd.endlessDamageMult(d)).toBe(1 + ENDLESS.damageGrowth * (d - 1));
    }
  });

  it('matches the legacy curves EXACTLY across every difficulty × doctrine × depth', () => {
    for (const diffId of DIFFICULTY_IDS) {
      for (const docId of DOCTRINE_IDS) {
        const diff = resolveDifficulty(diffId);
        const warp = DOCTRINES[docId].warp ?? {};
        const dd = createDirector({ difficulty: diff, warp });
        // The one fold site: doctrine damage reshapes the run's difficulty up front.
        const foldedDmg = warp.damageMult ? diff.enemyDamageMult * warp.damageMult : diff.enemyDamageMult;
        expect(dd.difficulty.enemyDamageMult).toBe(foldedDmg);
        expect(dd.difficulty.enemyHealthMult).toBe(diff.enemyHealthMult);
        expect(dd.queueWarp()).toBe(warp);
        for (const depth of DEPTHS) {
          const idx0 = depth - 1;
          const rate = warp.scalingRateMult ?? 1;
          // Legacy formulas, verbatim (game.ts pre-director):
          expect(dd.waveHpMult(idx0)).toBe((1 + WAVE_HP_GROWTH * idx0) * diff.enemyHealthMult);
          expect(dd.waveBountyMult(idx0)).toBe((1 + WAVE_BOUNTY_GROWTH * idx0) * diff.rewardMult);
          expect(dd.endlessHpMult(depth)).toBe(Math.pow(ENDLESS.hpGrowth, (depth - 1) * rate) * diff.enemyHealthMult);
          expect(dd.endlessBountyMult(depth)).toBe((1 + ENDLESS.bountyGrowth * ((depth - 1) * rate)) * diff.rewardMult);
          expect(dd.endlessSpeedMult(depth)).toBe(Math.min(ENDLESS.speedCap, 1 + ENDLESS.speedGrowth * ((depth - 1) * rate)));
          expect(dd.endlessDamageMult(depth)).toBe(1 + ENDLESS.damageGrowth * ((depth - 1) * rate));
        }
      }
    }
  });

  it('campaign speed axis: stage speed × difficulty speed (the old constructor product)', () => {
    const diff = resolveDifficulty('brutal');
    const dd = createDirector({ difficulty: diff, stageEnemySpeedMult: 1.22 });
    expect(dd.enemySpeedStatic()).toBe(1.22 * diff.enemySpeedMult);
  });

  it('ADAPTIVE weights ship at 0 and supplying adaptive inputs changes NOTHING (bit-exact)', () => {
    expect(DIRECTOR_ADAPTIVE.threatPerPowerRatio).toBe(0); // tune ONLY via the progression simulator
    expect(DIRECTOR_ADAPTIVE.rewardPerPerformance).toBe(0);
    const base = createDirector({ difficulty: resolveDifficulty('nightmare'), warp: DOCTRINES.corrupted.warp });
    const fed = createDirector({
      difficulty: resolveDifficulty('nightmare'),
      warp: DOCTRINES.corrupted.warp,
      adaptive: { powerRatio: 3.7, recentPerformance: -0.8 },
    });
    for (const depth of DEPTHS) {
      expect(Object.is(base.endlessHpMult(depth), fed.endlessHpMult(depth))).toBe(true);
      expect(Object.is(base.waveBountyMult(depth - 1), fed.waveBountyMult(depth - 1))).toBe(true);
    }
  });
});

describe('standalone policy queries — parity with the legacy call sites', () => {
  it('composeStageDifficulty reproduces the campaign fold exactly (stages 1..40)', () => {
    const C = { hpGrowth: 0.07, dmgGrowth: 0.05, spawnGrowth: 0.01, spawnCap: 1.5, rewardGrowth: 0.05 };
    for (const diffId of DIFFICULTY_IDS) {
      const base = resolveDifficulty(diffId);
      for (let stage = 1; stage <= 40; stage += 3) {
        const s = stage - 1;
        const sc = {
          hpMult: Math.pow(1 + C.hpGrowth, s),
          damageMult: Math.pow(1 + C.dmgGrowth, s),
          spawnMult: Math.min(C.spawnCap, 1 + C.spawnGrowth * s),
          rewardMult: 1 + C.rewardGrowth * s,
        };
        const out = composeStageDifficulty(base, sc);
        expect(out.id).toBe(`campaign:${base.id}`);
        expect(out.enemyHealthMult).toBe(base.enemyHealthMult * sc.hpMult);
        expect(out.enemyDamageMult).toBe(base.enemyDamageMult * sc.damageMult);
        expect(out.spawnRateMult).toBe(base.spawnRateMult * sc.spawnMult);
        expect(out.rewardMult).toBe(base.rewardMult * sc.rewardMult);
        expect(out.eliteChanceMult).toBe(base.eliteChanceMult); // carries from the variant
      }
    }
  });

  it('mode reward identity matches the legacy ternaries for every flag combination', () => {
    expect(modeCoreMult({ endless: true, campaign: false, firstClear: false })).toBe(MODE_REWARDS.core.endless);
    expect(modeCoreMult({ endless: false, campaign: true, firstClear: true })).toBe(MODE_REWARDS.core.campaignFirst);
    expect(modeCoreMult({ endless: false, campaign: true, firstClear: false })).toBe(MODE_REWARDS.core.campaignReplay);
    expect(modeCoreMult({ endless: false, campaign: false, firstClear: false })).toBe(MODE_REWARDS.core.stage);
    expect(modeLootMult({ endless: true, campaign: false })).toBe(MODE_REWARDS.loot.endless);
    expect(modeLootMult({ endless: false, campaign: true })).toBe(MODE_REWARDS.loot.campaign);
    expect(modeLootMult({ endless: false, campaign: false })).toBe(MODE_REWARDS.loot.stage);
    expect(modeMasteryMult({ endless: true, campaign: false })).toBe(MODE_REWARDS.mastery.endless);
    expect(modeMasteryMult({ endless: false, campaign: true })).toBe(MODE_REWARDS.mastery.campaign);
    expect(modeMasteryMult({ endless: false, campaign: false })).toBe(MODE_REWARDS.mastery.stage);
  });

  it('doctrine run-end economy: reward mult + essence payout (floor semantics)', () => {
    expect(doctrineEconomy('none')).toMatchObject({ rewardMult: 1 });
    expect(doctrineEconomy('none').essenceFor(50)).toBe(0);
    expect(doctrineEconomy('corrupted').rewardMult).toBe(1.5);
    expect(doctrineEconomy('corrupted').essenceFor(20)).toBe(60); // floor(3 × 20)
    expect(doctrineEconomy(undefined).rewardMult).toBe(1); // omitted ⇒ 'none'
  });

  it('loot quality tier composes difficulty + Fortune + codex exactly like lootBiasFor did', () => {
    expect(lootQualityTier({ difficultyLootQualityMult: 1, fortuneMult: 1, codexTier: 0 })).toBe(0);
    for (const diffId of DIFFICULTY_IDS) {
      const d = resolveDifficulty(diffId);
      const legacy = Math.max(0, (d.lootQualityMult - 1) * 2 + (1.15 - 1) * 2 + 0.5);
      expect(lootQualityTier({ difficultyLootQualityMult: d.lootQualityMult, fortuneMult: 1.15, codexTier: 0.5 })).toBe(legacy);
    }
  });

  it('hazard rating reproduces the Infinite terminal formula (1–5 skulls)', () => {
    expect(hazardRating('standard')).toBe(1);
    for (const diffId of DIFFICULTY_IDS) {
      for (const docId of DOCTRINE_IDS) {
        const diff = DIFFICULTIES[diffId];
        const w = DOCTRINES[docId].warp ?? {};
        const load = (diff?.enemyHealthMult ?? 1) * (w.hpMult ?? 1) * (w.damageMult ?? 1) *
          (w.countMult && w.countMult > 1 ? w.countMult : 1) * (w.speedMult ?? 1) * (w.scalingRateMult ?? 1) *
          (w.bountyMult && w.bountyMult < 1 ? 1 + (1 - w.bountyMult) : 1) * // droughts rate as load
          (w.eliteChance ? 1 + w.eliteChance * 0.8 : 1); // elite pressure rates as load
        const legacy = Math.max(1, Math.min(5, Math.round(1 + (load - 1) * 1.4)));
        expect(hazardRating(diffId, DOCTRINES[docId])).toBe(legacy);
      }
    }
    // The new axes actually bite: Famine's drought rates above baseline outright, and elite
    // pressure (Predator's Wager) never rates BELOW a warpless doctrine at any difficulty.
    expect(hazardRating('standard', DOCTRINES.famine)).toBeGreaterThan(1);
    for (const diffId of DIFFICULTY_IDS) {
      expect(hazardRating(diffId, DOCTRINES.predator)).toBeGreaterThanOrEqual(hazardRating(diffId, DOCTRINES.glasscannon));
    }
  });

  it('economyFor is the settle layer entry: resolves ids with the Standard fallback', () => {
    expect(economyFor('nightmare')).toBe(DIFFICULTIES.nightmare);
    expect(economyFor(undefined)).toBe(STANDARD);
    expect(economyFor('bogus')).toBe(STANDARD);
  });
});
