// PRIME STRAINS (docs/PRIME-STRAINS.md) — the per-unit infinite ladder past max Stars.
// Pins the closed forms (geometric costs, log-eased diminishing bonus), the max-Star gate,
// purchase atomicity (shards + Catalyst leave together or not at all), the fold identity at
// level 0 (golden-safe), Power movement, and the save round-trip incl. tamper clamping.

import { describe, it, expect } from 'vitest';
import { meta, nextTowerPrimeCost, nextHeroPrimeCost, totalPrimeLevels, towerProgress, heroProgress, heroStarCost, towerStarCost } from './meta';
import { primeAnchorCost, primeCost, primeCatalystCost, primeMult, primeNextGainPct } from '../core/prime';
import { defaultSave, parseImport, serializeExport } from '../save/saveStore';
import { PRIME, STAR } from '../core/config';

describe('prime cost curve — steeply geometric off the final star', () => {
  it('anchors at the ladder’s FINAL star price × costMult', () => {
    expect(primeAnchorCost('tower')).toBe(towerStarCost(STAR.maxTowerStars - 1)); // 5120
    expect(primeAnchorCost('hero')).toBe(heroStarCost(STAR.maxStars - 1));
    expect(primeCost('tower', 0)).toBe(Math.round(primeAnchorCost('tower') * PRIME.costMult));
  });

  it('grows geometrically at costGrowth (≥ 1.35) per level', () => {
    expect(PRIME.costGrowth).toBeGreaterThanOrEqual(1.35);
    for (const lvl of [0, 1, 5, 20]) {
      const ratio = primeCost('tower', lvl + 1) / primeCost('tower', lvl);
      expect(ratio).toBeGreaterThan(PRIME.costGrowth - 0.01);
      expect(ratio).toBeLessThan(PRIME.costGrowth + 0.01);
    }
    // The documented opening rungs (docs/PRIME-STRAINS.md §curves) — a re-tune is a deliberate edit.
    expect([primeCost('tower', 0), primeCost('tower', 1), primeCost('tower', 2)]).toEqual([5120, 7168, 10035]);
  });

  it('deep levels consume Catalyst by tier (0 below the first threshold)', () => {
    expect(primeCatalystCost(1)).toBe(0);
    expect(primeCatalystCost(PRIME.catalystTiers[0].from - 1)).toBe(0);
    expect(primeCatalystCost(PRIME.catalystTiers[0].from)).toBe(PRIME.catalystTiers[0].catalyst);
    expect(primeCatalystCost(PRIME.catalystTiers[1].from)).toBe(PRIME.catalystTiers[1].catalyst);
    expect(primeCatalystCost(999)).toBe(PRIME.catalystTiers[PRIME.catalystTiers.length - 1].catalyst);
  });
});

describe('prime bonus curve — small, honestly diminishing, never 0-level drift', () => {
  it('is EXACTLY 1 at level 0 (the golden-safe identity)', () => {
    expect(primeMult(0)).toBe(1);
    expect(primeMult(-3)).toBe(1); // hostile input folds to identity, never a debuff
  });

  it('starts at ≈ +0.5%/level and each level is worth less than the last (monotonic, unbounded)', () => {
    const firstGain = primeMult(1) - 1;
    expect(firstGain).toBeGreaterThan(0.0045);
    expect(firstGain).toBeLessThanOrEqual(PRIME.bonusPerLevel);
    let prevGain = Infinity;
    let prevMult = 1;
    for (let l = 1; l <= 200; l++) {
      const m = primeMult(l);
      expect(m).toBeGreaterThan(prevMult); // every level still helps (monotonic)
      const gain = m - prevMult;
      expect(gain).toBeLessThanOrEqual(prevGain + 1e-12); // …but never more than the last (diminishing)
      prevGain = gain;
      prevMult = m;
    }
    // The closed form: at L₀ the marginal level is worth about HALF the first.
    const l0 = PRIME.softCapLevels;
    expect((primeMult(l0 + 1) - primeMult(l0)) / (primeMult(1) - primeMult(0))).toBeCloseTo(0.5, 1);
    expect(primeNextGainPct(0)).toBeGreaterThan(primeNextGainPct(l0));
  });
});

describe('prime gating + purchase atomicity (the star seam continued)', () => {
  it('quotes null while the ★ ladder is unfinished, and the buy refuses', () => {
    meta.reset();
    const save = defaultSave();
    expect(nextTowerPrimeCost(save, 'needle')).toBeNull();
    expect(nextHeroPrimeCost(save, 'ravager')).toBeNull();
    meta.debugAddTowerShards(999999);
    expect(meta.buyTowerPrime('needle')).toBe(false); // 0 stars — refused, nothing spent
    expect(meta.get().towerPrime.needle).toBe(0);
    expect(meta.buyHeroPrime('ravager')).toBe(false);
    meta.reset();
  });

  it('a maxed tower buys prime levels atomically — Catalyst gates the deep tiers', () => {
    meta.reset();
    meta.debugSetCampaignStage(300); // lift the Evolution Cap
    meta.debugAddTowerShards(9999999);
    for (let i = 0; i < STAR.maxTowerStars; i++) expect(meta.buyStar('needle')).toBe(true);

    // Levels below the Catalyst tier: shards-only, exact spend.
    const before = meta.get().towerShards.needle ?? 0;
    expect(meta.buyTowerPrime('needle')).toBe(true);
    expect(meta.get().towerPrime.needle).toBe(1);
    expect(meta.get().towerShards.needle).toBe(before - primeCost('tower', 0));

    // Walk to the Catalyst threshold with an empty materials wallet…
    const tier = PRIME.catalystTiers[0];
    while ((meta.get().towerPrime.needle ?? 0) < tier.from - 1) expect(meta.buyTowerPrime('needle')).toBe(true);
    expect(meta.get().mats.catalyst).toBe(0);
    const shardsAtGate = meta.get().towerShards.needle ?? 0;
    expect(meta.buyTowerPrime('needle')).toBe(false); // refused: Catalyst missing
    expect(meta.get().towerShards.needle).toBe(shardsAtGate); // ATOMIC — no shards left the wallet
    expect(meta.get().towerPrime.needle).toBe(tier.from - 1);

    // …grant Catalyst (debug gear grant banks +6) and the same buy now spends BOTH currencies.
    meta.debugGrantGear(1);
    const cat = meta.get().mats.catalyst;
    expect(cat).toBeGreaterThanOrEqual(tier.catalyst);
    expect(meta.buyTowerPrime('needle')).toBe(true);
    expect(meta.get().towerPrime.needle).toBe(tier.from);
    expect(meta.get().mats.catalyst).toBe(cat - tier.catalyst);
    expect(totalPrimeLevels(meta.get())).toBe(tier.from);
    meta.reset();
  });
});

describe('prime fold + Power (one multiplier lane on the star/mastery pipeline)', () => {
  it('folds to identity at level 0 and to primeMult(L) at level L', () => {
    const save = defaultSave();
    expect(towerProgress(save).needle.damageMult).toBe(1); // fresh save: byte-identical fold
    expect(heroProgress(save).ravager.damageMult).toBe(1);
    save.towerPrime.needle = 7;
    save.heroPrime.ravager = 3;
    expect(towerProgress(save).needle.damageMult).toBeCloseTo(primeMult(7), 12);
    expect(heroProgress(save).ravager.damageMult).toBeCloseTo(primeMult(3), 12);
  });

  it('every prime level strictly raises Power (through the existing towers/heroes buckets)', () => {
    meta.reset();
    // One L1 on one tower moves the roster GEOMEAN by less than a rounded index point on a
    // fresh account — the strict invariant lives in the raw multiplier, so assert THAT…
    const cur = meta.power();
    expect(meta.previewPower((s) => ({ ...s, towerPrime: { ...s.towerPrime, needle: 1 } })).mult).toBeGreaterThan(cur.mult);
    expect(meta.previewPower((s) => ({ ...s, heroPrime: { ...s.heroPrime, ravager: 2 } })).mult).toBeGreaterThan(cur.mult);
    // …and a real ladder depth reads on the integer index too.
    expect(meta.previewPower((s) => ({ ...s, towerPrime: { ...s.towerPrime, needle: 40 } })).score).toBeGreaterThan(cur.score);
  });
});

describe('prime save round-trip + tamper clamping', () => {
  it('levels survive export → import; junk clamps to safe wholes', () => {
    const save = defaultSave();
    save.towerPrime.needle = 12;
    save.heroPrime.ravager = 4;
    const back = parseImport(serializeExport(save));
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.data.towerPrime.needle).toBe(12);
      expect(back.data.heroPrime.ravager).toBe(4);
    }

    const hostile = defaultSave();
    (hostile as unknown as { towerPrime: Record<string, unknown> }).towerPrime = { needle: -5, mortar: Number.NaN, reactor: 3.9 };
    const round = parseImport(serializeExport(hostile as never));
    expect(round.ok).toBe(true);
    if (round.ok) {
      expect(round.data.towerPrime.needle).toBe(0); // negative → default
      expect(round.data.towerPrime.mortar).toBe(0); // NaN → default
      expect(round.data.towerPrime.reactor).toBe(3); // fractional → floored whole
    }
  });
});
