// Live Event operations (docs/LIVE-EVENTS.md §8): the remote-override contract — pure
// resolution over the deterministic calendar, publish-gate validation, guard rails.

import { describe, expect, it } from 'vitest';
import { BP } from './battlePass';
import { activeLiveEvents } from './liveEvents';
import { effectiveTuning, eventOpsProblems, resolveEvents } from './eventOps';

const T0 = BP.epochMs + 3_600_000;

describe('resolveEvents — the override layer', () => {
  it('no config ⇒ the pure calendar, byte-for-byte', () => {
    expect(resolveEvents(T0, null)).toEqual(activeLiveEvents(T0));
    expect(resolveEvents(T0, undefined)).toEqual(activeLiveEvents(T0));
  });
  it('kill switch suppresses an event and the ring fills the slot — never an empty horizon', () => {
    const base = activeLiveEvents(T0);
    const killedId = base[2].def.id; // the live short event
    const r = resolveEvents(T0, { rev: 1, kill: [killedId] });
    expect(r).toHaveLength(3);
    expect(r[2].def.id).not.toBe(killedId);
    expect(r[2].def.horizon).toBe('short');
  });
  it('scheduled placement takes its horizon slot only inside its window', () => {
    const base = activeLiveEvents(T0);
    const other = 'spore_bloom' === base[2].def.id ? 'ember_tide' : 'spore_bloom';
    const cfg = { rev: 1, schedule: [{ eventId: other, horizon: 'short' as const, startsAt: T0 - 1, endsAt: T0 + 86_400_000 }] };
    expect(resolveEvents(T0, cfg)[2].def.id).toBe(other);
    expect(resolveEvents(T0 + 2 * 86_400_000, cfg)[2].def.id).toBe(base[2].def.id); // window over (same 3d slot)
  });
  it('preview events hide from players and appear for debug clients', () => {
    const base = activeLiveEvents(T0);
    const id = base[2].def.id;
    const cfg = { rev: 1, preview: [id] };
    expect(resolveEvents(T0, cfg, false)[2].def.id).not.toBe(id);
    expect(resolveEvents(T0, cfg, true)[2].def.id).toBe(id);
  });
});

describe('guard rails', () => {
  it('tuning clamps to safe bands and defaults to identity', () => {
    expect(effectiveTuning(null, 'ember_tide')).toEqual({ trackScale: 1, tokenScale: 1, shopStockDelta: 0, modsScale: 1 });
    const t = effectiveTuning({ rev: 1, tuning: { ember_tide: { trackScale: 9, tokenScale: 0.1, shopStockDelta: 7, modsScale: -2 } } }, 'ember_tide');
    expect(t).toEqual({ trackScale: 1.5, tokenScale: 0.5, shopStockDelta: 2, modsScale: 0 });
  });
  it('the publish gate rejects unknown ids, inverted windows, horizon mismatches, dead rings', () => {
    expect(eventOpsProblems({ rev: 1 })).toEqual([]);
    expect(eventOpsProblems({ rev: 1, kill: ['nope'] }).length).toBeGreaterThan(0);
    expect(eventOpsProblems({ rev: 1, schedule: [{ eventId: 'ember_tide', horizon: 'major', startsAt: 1, endsAt: 2 }] }).length).toBeGreaterThan(0);
    expect(eventOpsProblems({ rev: 1, schedule: [{ eventId: 'ember_tide', horizon: 'short', startsAt: 5, endsAt: 5 }] }).length).toBeGreaterThan(0);
    expect(eventOpsProblems({ rev: 1, kill: ['ember_tide', 'spore_bloom', 'static_night'] }).some((p) => p.includes('empties the short ring'))).toBe(true);
  });
});
