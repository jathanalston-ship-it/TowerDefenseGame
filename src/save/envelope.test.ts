// Save envelope contracts (docs/ACCOUNTS.md §save-architecture): the module
// partition is LOSSLESS (round-trip identity — structurally guaranteed by the
// 'core' catch-all and pinned here), checksums catch corruption, and reassembly
// rides the normal import sanitizer.

import { describe, expect, it } from 'vitest';
import { buildEnvelope, isEnvelope, openEnvelope, SAVE_MODULES, verifyEnvelope } from './envelope';
import { defaultSave, parseImport, CURRENT_VERSION } from './saveStore';
import { mergeSaves } from './merge';

const ctx = { accountId: '11111111-2222-4333-8444-555555555555', platform: 'web', power: 1234.6, campaignStage: 7 };

describe('save envelope', () => {
  it('partitions into named modules and reassembles to the EXACT same save', () => {
    const save = defaultSave();
    save.shards = 777;
    save.bestWave = 31;
    save.profileName = 'OVERMIND';
    const env = buildEnvelope(save, ctx);
    expect(isEnvelope(env)).toBe(true);
    expect(verifyEnvelope(env)).toBe(true);
    expect(env.schemaVersion).toBe(CURRENT_VERSION);
    expect(env.power).toBe(1235);
    expect(env.campaignStage).toBe(7);
    // Round trip through the NORMAL import path (wrapper shape + sanitizer).
    const parsed = parseImport(openEnvelope(env));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data).toEqual(save);
  });

  it('every SaveData field lands in exactly one module (core catches strays)', () => {
    const save = defaultSave();
    (save as unknown as Record<string, unknown>).futureField2029 = { anything: true };
    const env = buildEnvelope(save, ctx);
    const claimed = new Set<string>();
    for (const m of SAVE_MODULES) {
      for (const k of Object.keys(env.modules[m.id] ?? {})) {
        expect(claimed.has(k)).toBe(false); // no double-claim
        claimed.add(k);
      }
    }
    expect(claimed.size).toBe(Object.keys(save).length); // nothing dropped
    expect(env.modules.core).toHaveProperty('futureField2029'); // unknown fields survive
  });

  it('a tampered/corrupted envelope fails checksum verification', () => {
    const env = buildEnvelope(defaultSave(), ctx);
    expect(verifyEnvelope(env)).toBe(true);
    (env.modules.wallet as Record<string, unknown>).shards = 999_999_999;
    expect(verifyEnvelope(env)).toBe(false);
  });
});

describe('conflict merge (conservative)', () => {
  it('records union/max; currencies come from the primary (more playtime) only', () => {
    const a = defaultSave();
    a.stats.playtimeSec = 10_000; // primary
    a.shards = 500;
    a.bestWave = 20;
    a.achievements = ['first_blood'];
    a.towerMasteryXp = { spitter: 100 } as unknown as typeof a.towerMasteryXp;
    const b = defaultSave();
    b.stats.playtimeSec = 2_000;
    b.shards = 9_999; // must NOT leak into the merge (secondary wallet)
    b.bestWave = 33;
    b.achievements = ['first_blood', 'wave_30'];
    b.towerMasteryXp = { spitter: 250, mortar: 40 } as unknown as typeof b.towerMasteryXp;

    const m = mergeSaves(a, b);
    expect(m.shards).toBe(500); // primary wallet
    expect(m.bestWave).toBe(33); // record max
    expect(m.achievements.sort()).toEqual(['first_blood', 'wave_30']); // union
    expect((m.towerMasteryXp as Record<string, number>).spitter).toBe(250); // per-key max
    expect((m.towerMasteryXp as Record<string, number>).mortar).toBe(40);
    expect(m.stats.playtimeSec).toBe(10_000);
  });

  it('is symmetric in inputs (primary chosen by playtime, not argument order)', () => {
    const a = defaultSave();
    a.stats.playtimeSec = 100;
    a.shards = 1;
    const b = defaultSave();
    b.stats.playtimeSec = 5_000;
    b.shards = 42;
    expect(mergeSaves(a, b).shards).toBe(42);
    expect(mergeSaves(b, a).shards).toBe(42);
  });
});
