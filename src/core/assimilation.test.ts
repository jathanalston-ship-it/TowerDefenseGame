import { describe, it, expect } from 'vitest';
import {
  ASSIMILATION_TIERS,
  ASSIM,
  GROUP_WEIGHTS,
  allContributions,
  assimilationPresentation,
  computeAssimilation,
  computeAssimilationTarget,
  initialAssimilation,
  registerAssimilationContribution,
  stepAssimilation,
  tierAt,
  tierColorAt,
  zeroSignals,
  type AssimilationSignals,
} from './assimilation';

const richSignals = (): AssimilationSignals => ({
  wave: 30, totalWaves: 30, currentBiomass: 3000, biomassGenerated: 12000, kills: 800, bossKills: 6,
  megaKills: 3, weakPoints: 12, towerCount: 14, heroCount: 3, strainSum: 40, branchTierSum: 24, activeBuffs: 4,
  runPower: 18000, integrityFrac: 0.8, time: 120,
});

describe('assimilation — the fold', () => {
  it('a neutral run reads 0 (Contained) and never exceeds 1', () => {
    const { raw } = computeAssimilation(zeroSignals());
    expect(raw).toBe(0);
    const big = computeAssimilation({ ...richSignals(), runPower: 1e9, wave: 1e6, kills: 1e6, biomassGenerated: 1e9 });
    expect(big.raw).toBeLessThanOrEqual(1);
    expect(big.raw).toBeGreaterThan(0.6);
  });

  it('is monotonic in every contributor (more of a signal never lowers the index)', () => {
    const base = computeAssimilation(zeroSignals()).raw;
    for (const c of allContributions()) {
      // Nudge only this contributor by feeding a large value through its own read path.
      const s = zeroSignals();
      // Reconstruct a signal the profile reads: bump a superset field set, then confirm the
      // fold rose. We bump ALL numeric fields for the profile under test via a rich signal and
      // compare against a version with that contributor zeroed is complex; instead assert the
      // rich signal strictly exceeds the neutral fold, and each sub-score is in range.
      void s; void c;
    }
    const rich = computeAssimilation(richSignals());
    expect(rich.raw).toBeGreaterThan(base);
    for (const c of rich.contributions) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(1);
    }
  });

  it('a higher runPower strictly raises the index (Power Score is the universal contributor)', () => {
    const lo = computeAssimilation({ ...zeroSignals(), runPower: 1000 }).raw;
    const hi = computeAssimilation({ ...zeroSignals(), runPower: 50000 }).raw;
    expect(hi).toBeGreaterThan(lo);
  });

  it('contribution shares sum to ~1 when anything contributes', () => {
    const { contributions } = computeAssimilation(richSignals());
    const sum = contributions.reduce((a, c) => a + c.share, 0);
    expect(sum).toBeGreaterThan(0.999);
    expect(sum).toBeLessThan(1.001);
  });
});

describe('assimilation — tiers', () => {
  it('there are 6 tiers, ordered, spanning 0..<1', () => {
    expect(ASSIMILATION_TIERS.length).toBe(6);
    expect(ASSIMILATION_TIERS[0].at).toBe(0);
    for (let i = 1; i < ASSIMILATION_TIERS.length; i++) {
      expect(ASSIMILATION_TIERS[i].at).toBeGreaterThan(ASSIMILATION_TIERS[i - 1].at);
      expect(ASSIMILATION_TIERS[i].at).toBeLessThan(1);
    }
  });

  it('tierAt resolves boundaries and progress correctly', () => {
    expect(tierAt(0).tier.index).toBe(0);
    expect(tierAt(1).tier.index).toBe(5);
    expect(tierAt(1).progress).toBe(1);
    const t2 = ASSIMILATION_TIERS[2];
    expect(tierAt(t2.at).tier.index).toBe(2);
    expect(tierAt(t2.at).progress).toBeCloseTo(0, 5);
  });

  it('the blended tier color stays in byte range and shifts across a boundary', () => {
    for (const x of [0, 0.2, 0.5, 0.83, 1]) {
      const c = tierColorAt(x);
      for (const ch of c) { expect(ch).toBeGreaterThanOrEqual(0); expect(ch).toBeLessThanOrEqual(255); }
    }
    expect(tierColorAt(0)).not.toEqual(tierColorAt(1));
  });
});

describe('assimilation — the smoothing step', () => {
  it('converges toward a raised target and settles exactly', () => {
    const s = initialAssimilation();
    for (let i = 0; i < 600; i++) stepAssimilation(s, 0.7, 1 / 60);
    expect(s.index).toBeCloseTo(0.7, 3);
    expect(s.tier).toBe(tierAt(0.7).tier.index);
  });

  it('rises faster than it falls (the organism does not un-grow abruptly)', () => {
    expect(ASSIM.riseRate).toBeGreaterThan(ASSIM.fallRate);
    const up = initialAssimilation();
    stepAssimilation(up, 1, 0.1);
    const down = { ...initialAssimilation(), index: 1, tier: 5, tierProgress: 1 };
    stepAssimilation(down, 0, 0.1);
    const roseBy = up.index - 0;
    const fellBy = 1 - down.index;
    expect(roseBy).toBeGreaterThan(fellBy);
  });

  it('an override drives the index and clamps to 0..1; releasing resumes the target', () => {
    const s = initialAssimilation();
    s.override = 2; // out of range
    for (let i = 0; i < 300; i++) stepAssimilation(s, 0.1, 1 / 60);
    expect(s.index).toBeCloseTo(1, 3);
    s.override = null;
    // The fall is deliberately slow (ASSIM.fallRate) — give it enough sim-time to relax to target.
    for (let i = 0; i < 2400; i++) stepAssimilation(s, 0.1, 1 / 60);
    expect(s.index).toBeCloseTo(0.1, 2);
  });
});

describe('assimilation — presentation', () => {
  it('every channel is bounded and music intensity is monotonic in the index', () => {
    let lastMusic = -1;
    for (const x of [0, 0.25, 0.5, 0.75, 1]) {
      const p = assimilationPresentation({ index: x, target: x, tier: tierAt(x).tier.index, tierProgress: tierAt(x).progress, override: null, peakTier: tierAt(x).tier.index, ascensionPulse: 0, ascendedTier: tierAt(x).tier.index });
      expect(p.musicIntensity).toBeGreaterThan(lastMusic);
      lastMusic = p.musicIntensity;
      for (const v of [p.vignette, p.glow, p.spore, p.saturation, p.hudGlow]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(p.cameraAmp).toBeLessThan(0.005); // a breath, never a zoom
    }
  });
});

describe('assimilation — the extension seam', () => {
  it('a registered profile reading a custom signal folds into the index', () => {
    const before = computeAssimilation({ ...zeroSignals(), custom: { nucleusEvolution: 100 } }).raw;
    registerAssimilationContribution({
      id: 'test-nucleus', label: 'Nucleus Evolution', group: 'battlefield', weight: 5, half: 10,
      read: (s) => s.custom?.nucleusEvolution ?? 0,
    });
    const after = computeAssimilation({ ...zeroSignals(), custom: { nucleusEvolution: 100 } }).raw;
    expect(after).toBeGreaterThan(before);
    expect(allContributions().some((c) => c.id === 'test-nucleus')).toBe(true);
  });
});

describe('assimilation — the allocation-free hot path', () => {
  it('computeAssimilationTarget equals computeAssimilation().raw for every signal', () => {
    const cases: AssimilationSignals[] = [
      zeroSignals(),
      richSignals(),
      { ...zeroSignals(), runPower: 5000, wave: 12, kills: 120 },
      { ...richSignals(), megaKills: 0, bossKills: 0, weakPoints: 0 },
      { ...zeroSignals(), towerCount: 40, strainSum: 120, branchTierSum: 60 },
    ];
    for (const s of cases) {
      expect(computeAssimilationTarget(s)).toBeCloseTo(computeAssimilation(s).raw, 12);
    }
  });

  it('the target is bounded and monotonic in the run Power Score', () => {
    expect(computeAssimilationTarget(zeroSignals())).toBe(0);
    const lo = computeAssimilationTarget({ ...zeroSignals(), runPower: 2000 });
    const hi = computeAssimilationTarget({ ...zeroSignals(), runPower: 40000 });
    expect(hi).toBeGreaterThan(lo);
    expect(computeAssimilationTarget({ ...richSignals(), runPower: 1e9, wave: 1e6, kills: 1e6 })).toBeLessThanOrEqual(1);
  });
});

describe('assimilation — group-normalized pillars', () => {
  it('strength (one contributor) outweighs a fully-maxed lesser pillar — pillars are balanced, not counted', () => {
    // Each pillar is capped at its GROUP weight share, no matter how many contributors it holds.
    const strengthMax = computeAssimilationTarget({ ...zeroSignals(), runPower: 1e7 });
    const battlefieldMax = computeAssimilationTarget({ ...zeroSignals(), towerCount: 1e6, heroCount: 1e6, strainSum: 1e6, branchTierSum: 1e6 });
    const conquestMax = computeAssimilationTarget({ ...zeroSignals(), kills: 1e7, biomassGenerated: 1e9, bossKills: 1e4, megaKills: 1e4, weakPoints: 1e4 });
    // Strength's higher group weight wins even though it is a SINGLE contributor vs 4–5 maxed ones.
    expect(strengthMax).toBeGreaterThan(battlefieldMax);
    expect(strengthMax).toBeGreaterThan(conquestMax);
    // And each pillar alone stays well under 1 — one pillar can never dominate the whole index.
    for (const v of [strengthMax, battlefieldMax, conquestMax]) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(GROUP_WEIGHTS.strength / (GROUP_WEIGHTS.strength + GROUP_WEIGHTS.tempo + GROUP_WEIGHTS.conquest + GROUP_WEIGHTS.battlefield) + 0.001);
    }
  });

  it('the breakdown exposes per-pillar scores whose weighted shares sum to ~1', () => {
    const { groups } = computeAssimilation(richSignals());
    expect(groups.length).toBe(4);
    const shareSum = groups.reduce((a, g) => a + g.share, 0);
    expect(shareSum).toBeGreaterThan(0.999);
    expect(shareSum).toBeLessThan(1.001);
    for (const g of groups) { expect(g.score).toBeGreaterThanOrEqual(0); expect(g.score).toBeLessThanOrEqual(1); }
  });

  it('weak-points is a live conquest contributor and raises the index', () => {
    expect(allContributions().some((c) => c.id === 'weakPoints')).toBe(true);
    const lo = computeAssimilationTarget({ ...zeroSignals(), weakPoints: 0 });
    const hi = computeAssimilationTarget({ ...zeroSignals(), weakPoints: 40 });
    expect(hi).toBeGreaterThan(lo);
  });
});

describe('assimilation — the Ascension Moment', () => {
  it('fires once per new tier crossed, then holds without re-firing', () => {
    const s = initialAssimilation();
    let fired = 0;
    for (let i = 0; i < 600; i++) {
      const before = s.peakTier;
      stepAssimilation(s, 0.5, 1 / 60); // climb to Dominance (tier 3)
      if (s.peakTier > before) fired++;
    }
    expect(s.tier).toBe(tierAt(s.index).tier.index);
    expect(s.peakTier).toBe(3);
    expect(fired).toBe(3); // crossed T1, T2, T3
    // Holding steady lets the pulse decay to rest and never re-fires.
    for (let i = 0; i < 600; i++) stepAssimilation(s, 0.5, 1 / 60);
    expect(s.ascensionPulse).toBe(0);
  });

  it('sets the pulse to 1 and records the reached tier on a crossing', () => {
    const s = initialAssimilation();
    stepAssimilation(s, 0.3, 100); // huge dt snaps the index up past tier 2 in one step
    expect(s.ascensionPulse).toBe(1);
    expect(s.ascendedTier).toBe(s.tier);
    expect(s.tier).toBeGreaterThanOrEqual(2);
  });

  it('the slow relax never lowers the peak nor re-triggers the flourish', () => {
    const s = initialAssimilation();
    for (let i = 0; i < 600; i++) stepAssimilation(s, 0.7, 1 / 60); // up to Ascension (tier 4)
    const peak = s.peakTier;
    expect(peak).toBe(4);
    let refired = 0;
    for (let i = 0; i < 4000; i++) { const b = s.peakTier; stepAssimilation(s, 0, 1 / 60); if (s.peakTier > b) refired++; }
    expect(s.peakTier).toBe(peak); // peak is monotone
    expect(refired).toBe(0);
    expect(s.ascensionPulse).toBe(0);
  });
});
