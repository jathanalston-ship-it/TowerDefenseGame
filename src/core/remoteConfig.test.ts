// remoteConfig — pins the A/B seam's two laws (docs/ANALYTICS.md §ab): the whitelist is
// the determinism firewall (unknown keys drop, bounds clamp, only UI/meta lanes exist),
// and bucket assignment is a pure deterministic function of (playerId, salt).

import { describe, expect, it } from 'vitest';
import {
  REMOTE_FLAGS, REMOTE_NUMBERS, assignmentRoll, bucketFor, defaultRemoteConfig,
  remoteConfigProblems, sanitizeRemoteConfig,
} from './remoteConfig';

describe('whitelist sanitizer', () => {
  it('keeps known keys, drops unknown, clamps bounds', () => {
    const doc = sanitizeRemoteConfig({
      rev: 7,
      flags: { 'ui.flashOffers': false, 'sim.enemyHp': true, junk: true },
      numbers: { 'ui.placardMax': 99, 'store.flashCooldownMin': -5, evil: 1 },
    });
    expect(doc.rev).toBe(7);
    expect(doc.flags['ui.flashOffers']).toBe(false);
    expect('sim.enemyHp' in doc.flags).toBe(false); // a sim key can NEVER enter
    expect(doc.numbers['ui.placardMax']).toBe(8); // clamped to max
    expect(doc.numbers['store.flashCooldownMin']).toBe(60); // clamped to min
    expect('evil' in doc.numbers).toBe(false);
  });

  it('junk documents fall back to complete defaults', () => {
    const doc = sanitizeRemoteConfig('garbage');
    expect(doc).toEqual(defaultRemoteConfig());
    expect(Object.keys(doc.flags)).toHaveLength(REMOTE_FLAGS.length);
    expect(Object.keys(doc.numbers)).toHaveLength(REMOTE_NUMBERS.length);
  });

  it('experiments sanitize: tokens only, pcts capped at 100 total', () => {
    const doc = sanitizeRemoteConfig({
      experiments: [
        { id: 'daily_double', salt: 's1', buckets: [{ id: 'on', pct: 60 }, { id: 'loud', pct: 70 }] },
        { id: 'BAD ID!', salt: 's', buckets: [{ id: 'x', pct: 10 }] },
      ],
    });
    expect(doc.experiments).toHaveLength(1);
    const [e] = doc.experiments;
    expect(e.buckets.map((b) => b.pct)).toEqual([60, 40]); // second slice clamped into the remainder
  });

  it('the registry itself stays inside the UI/meta lane', () => {
    expect(remoteConfigProblems()).toEqual([]);
  });
});

describe('deterministic assignment', () => {
  const exp = { id: 'daily_double', salt: 'v1', buckets: [{ id: 'on', pct: 50 }] };

  it('same player+salt ⇒ same bucket, forever', () => {
    for (const pid of ['aaaa-1', 'bbbb-2', 'cccc-3']) {
      expect(bucketFor(pid, exp)).toBe(bucketFor(pid, exp));
      expect(assignmentRoll(pid, 'v1')).toBe(assignmentRoll(pid, 'v1'));
    }
  });

  it('a 50% rollout lands near half of a large population; salt change reshuffles', () => {
    let on = 0; let moved = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const pid = `player-${i}-${(i * 2654435761) >>> 0}`;
      const b1 = bucketFor(pid, exp);
      if (b1 === 'on') on++;
      if (b1 !== bucketFor(pid, { ...exp, salt: 'v2' })) moved++;
    }
    expect(on / N).toBeGreaterThan(0.46);
    expect(on / N).toBeLessThan(0.54);
    expect(moved / N).toBeGreaterThan(0.3); // a new salt genuinely reshuffles
  });

  it('outside every slice ⇒ control', () => {
    const tiny = { id: 'x', salt: 's', buckets: [{ id: 'on', pct: 1 }] };
    const buckets = new Set<string>();
    for (let i = 0; i < 500; i++) buckets.add(bucketFor(`p${i}`, tiny));
    expect(buckets.has('control')).toBe(true);
  });
});
