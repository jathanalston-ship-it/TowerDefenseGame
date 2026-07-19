// Metabolism (docs/METABOLISM.md) — the recursive progression system. Pins the four load-bearing
// contracts: (1) registry integrity — every track well-formed, every reward id a real
// REWARD_TYPES row; (2) the infinite ladder — nice-number thresholds STRICTLY increase forever
// (nice-rounding may never flatten a step) and the tier scan is bounded; (3) the anti-inflation
// invariant — reward-per-threshold-unit strictly DECAYS tier over tier while absolute rewards
// still grow; (4) the read model — derive-first back-fill for veterans, claim clamping, and the
// v50→v51 save deep-fill/sanitize round-trip.

import { describe, it, expect } from 'vitest';
import {
  METABOLISM, META_CATS, META_TRACKS, metaTrack, metabolismClaimable,
  metabolismProblems, metabolismViews, nice, rewardsFor, threshold, tierAt, toPassRewards, trackView,
} from './metabolism';
import { meta } from './meta';
import { defaultMetabolism, defaultSave, serializeExport } from '../save/saveStore';

const totalQty = (rows: { qty: number }[]): number => rows.reduce((a, r) => a + r.qty, 0);

describe('registry integrity (the one-row future-system contract)', () => {
  it('metabolismProblems() is clean and ids are unique', () => {
    expect(metabolismProblems()).toEqual([]);
    expect(new Set(META_TRACKS.map((t) => t.id)).size).toBe(META_TRACKS.length);
  });

  it('every reward row speaks the applyRewardList language (bpXp rides the season lane)', () => {
    for (const t of META_TRACKS) {
      const rows = rewardsFor(t, 0);
      const bpRows = rows.filter((r) => r.type === 'bpXp').length;
      expect(toPassRewards(rows).length + bpRows, `${t.id} has an unmappable reward`).toBe(rows.length);
    }
  });

  it('every category is populated and the tuning obeys the inflation guard', () => {
    const cats = new Set(META_TRACKS.map((t) => t.cat));
    for (const c of Object.keys(META_CATS)) expect(cats.has(c as keyof typeof META_CATS)).toBe(true);
    expect(METABOLISM.rewardGrowth).toBeLessThan(METABOLISM.thresholdGrowth);
    expect(metaTrack('kills')?.name).toBe('Endless Feast');
    expect(metaTrack('__nope__')).toBeUndefined();
  });
});

describe('the infinite nice-number ladder', () => {
  it('nice() rounds up onto the 1/2/5 ladder', () => {
    const cases: [number, number][] = [
      [0.4, 1], [1, 1], [2, 2], [3, 5], [5, 5], [7, 10], [10, 10], [11, 20],
      [29, 50], [50, 50], [51, 100], [499, 500], [501, 1000], [1_800_000, 2_000_000],
    ];
    for (const [input, want] of cases) expect(nice(input), `nice(${input})`).toBe(want);
  });

  it('thresholds strictly increase for EVERY track across 48 tiers (rounding never flattens)', () => {
    for (const t of META_TRACKS) {
      expect(threshold(t, 0)).toBe(nice(t.base));
      for (let tier = 1; tier < 48; tier++) {
        expect(threshold(t, tier), `${t.id} tier ${tier}`).toBeGreaterThan(threshold(t, tier - 1));
      }
    }
  });

  it('tierAt agrees with thresholds at the exact boundaries', () => {
    for (const t of META_TRACKS) for (const tier of [0, 1, 5, 12]) {
      const at = threshold(t, tier);
      expect(tierAt(t, at), `${t.id} at threshold(${tier})`).toBe(tier + 1);
      expect(tierAt(t, at - 1), `${t.id} just below threshold(${tier})`).toBe(tier);
    }
  });

  it('the tier scan is bounded — absurd lifetime values terminate at maxTiersScanned', () => {
    for (const t of META_TRACKS) {
      expect(tierAt(t, Number.MAX_SAFE_INTEGER)).toBeLessThanOrEqual(METABOLISM.maxTiersScanned);
    }
    expect(tierAt(META_TRACKS[0], 0)).toBe(0);
  });
});

describe('anti-inflation: rewards grow, reward-per-unit decays', () => {
  it('absolute reward qty never shrinks tier over tier (claiming deeper always pays more)', () => {
    for (const t of META_TRACKS) for (let tier = 1; tier < 40; tier++) {
      expect(totalQty(rewardsFor(t, tier)), `${t.id} tier ${tier}`)
        .toBeGreaterThanOrEqual(totalQty(rewardsFor(t, tier - 1)));
    }
  });

  it('reward EV per threshold unit strictly decays every tier for every track', () => {
    for (const t of META_TRACKS) {
      for (let tier = 1; tier < 40; tier++) {
        const prev = totalQty(rewardsFor(t, tier - 1)) / threshold(t, tier - 1);
        const cur = totalQty(rewardsFor(t, tier)) / threshold(t, tier);
        expect(cur, `${t.id} EV at tier ${tier}`).toBeLessThan(prev);
      }
      // Deep play pays big absolute numbers yet a vanishing rate — the engagement contract.
      const ev0 = totalQty(rewardsFor(t, 0)) / threshold(t, 0);
      const ev30 = totalQty(rewardsFor(t, 30)) / threshold(t, 30);
      expect(ev30).toBeLessThan(ev0 / 100);
    }
  });
});

describe('read model (trackView / metabolismViews)', () => {
  const containers = metaTrack('containers')!;

  it('containers ladder reads 5/10/20/50/100 and a value of 12 sits mid-tier-3', () => {
    expect([0, 1, 2, 3, 4].map((t) => threshold(containers, t))).toEqual([5, 10, 20, 50, 100]);
    const s = defaultSave();
    s.metabolism.counters.containersOpened = 12;
    const v = trackView(s, containers);
    expect(v.value).toBe(12);
    expect(v.reached).toBe(2);
    expect(v.claimable).toBe(2);
    expect(v.prevAt).toBe(10);
    expect(v.nextAt).toBe(20);
    // Next claim pays tier 0 (claims are ordered); once claimed out, previews the upcoming tier.
    expect(v.nextRewards).toEqual(rewardsFor(containers, 0));
    s.metabolism.claimed.containers = 2;
    const done = trackView(s, containers);
    expect(done.claimable).toBe(0);
    expect(done.nextRewards).toEqual(rewardsFor(containers, 2));
  });

  it('claimed can never exceed reached (a shrunk or tampered save clamps, not crashes)', () => {
    const s = defaultSave();
    s.metabolism.counters.containersOpened = 12;
    s.metabolism.claimed.containers = 99;
    const v = trackView(s, containers);
    expect(v.claimed).toBe(2);
    expect(v.claimable).toBe(0);
  });

  it('derive-first back-fill: a veteran save reaches tiers with ZERO metabolism writes', () => {
    const s = defaultSave();
    s.stats.lifetimeKills = 2500; // an existing lifetime ledger, not a metabolism counter
    const kills = trackView(s, metaTrack('kills')!);
    expect(kills.value).toBe(2500);
    expect(kills.reached).toBeGreaterThanOrEqual(2);
    expect(metabolismClaimable(s)).toBeGreaterThanOrEqual(kills.claimable);
  });

  it('every track view is internally consistent on a fresh save (and every value() resolves)', () => {
    const views = metabolismViews(defaultSave());
    expect(views.length).toBe(META_TRACKS.length);
    for (const v of views) {
      expect(v.value).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(v.value)).toBe(true);
      expect(v.claimable).toBe(v.reached - v.claimed);
      expect(v.nextAt).toBeGreaterThan(v.prevAt);
      expect(v.value).toBeLessThan(v.nextAt);
      expect(v.value).toBeGreaterThanOrEqual(v.prevAt);
    }
  });
});

describe('meta pipeline — claimMetabolism (guarded batch claim)', () => {
  it('claims every reached tier in one gesture, pays through the interpreter, refuses repeats', () => {
    const s = defaultSave();
    s.metabolism.counters.containersOpened = 12; // Hatchery Habit: tiers 0+1 reached (5/10)
    meta.importText(serializeExport(s));
    const before = meta.get();
    const lines = meta.claimMetabolism('containers');
    expect(lines).not.toBeNull();
    const after = meta.get();
    expect(after.metabolism.claimed.containers).toBe(2);
    // Tier 0 pays 25 essence + 4 ichor; tier 1 grows ×1.35 → 34 + 6 (ceil).
    expect(after.geneEssence - before.geneEssence).toBe(59);
    expect(after.ichor - before.ichor).toBe(10);
    expect(meta.claimMetabolism('containers')).toBeNull(); // nothing left on the track
    expect(meta.claimMetabolism('__nope__')).toBeNull(); // unknown track id
  });

  it('bpXp rewards ride the season lane (Season Communion pays Season XP)', () => {
    const s = defaultSave();
    s.metabolism.counters.passClaimed = 5; // tier 0 completes at 5
    meta.importText(serializeExport(s));
    const lines = meta.claimMetabolism('passClaims');
    expect(lines?.some((l) => l.label.includes('Season XP'))).toBe(true);
    expect(meta.get().battlePass.xp).toBeGreaterThanOrEqual(60);
    expect(meta.get().metabolism.claimed.passClaims).toBe(1);
  });
});

describe('save round-trip (v50→v51 deep-fill + sanitize)', () => {
  it('an export WITHOUT metabolism imports cleanly with the default shape', () => {
    const old = defaultSave() as unknown as Record<string, unknown>;
    delete old.metabolism;
    expect(meta.importText(serializeExport(old as unknown as ReturnType<typeof defaultSave>)).ok).toBe(true);
    expect(meta.get().metabolism).toEqual(defaultMetabolism());
  });

  it('junk metabolism data sanitizes: fractional/negative counters floor, claimed clamps', () => {
    const s = defaultSave() as unknown as Record<string, unknown>;
    s.metabolism = {
      counters: { containersOpened: -3.7, sporesAbsorbed: 12.9, questsClaimed: 'x', passClaimed: 4 },
      claimed: { kills: 2.8, __bogus__: -1, spores: 'junk' },
    };
    expect(meta.importText(serializeExport(s as unknown as ReturnType<typeof defaultSave>)).ok).toBe(true);
    const m = meta.get().metabolism;
    expect(m.counters.containersOpened).toBe(0);
    expect(m.counters.sporesAbsorbed).toBe(12);
    expect(m.counters.questsClaimed).toBe(0);
    expect(m.counters.passClaimed).toBe(4);
    expect(m.claimed.kills).toBe(2);
    expect(m.claimed.__bogus__).toBeUndefined();
    expect(m.claimed.spores).toBeUndefined();
  });
});
