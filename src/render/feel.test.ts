// The feel table + centre-stage announcer (render/feel.ts) and the Motion prefs resolution
// (state/prefs.ts resolveMotion) — docs/GAME-FEEL.md §feel table / §centre-stage / §4.

import { describe, expect, it, vi } from 'vitest';
import { ANNOUNCE, Announcer, FEEL } from './feel';
import type { AnnounceKind } from './feel';
import { STINGERS } from '../audio/music';
import { FX } from '../core/config';
import { MOTION_DEFAULTS, motionPrefs, resolveMotion, setMotionPrefs, onMotionPrefs, DEVICE_PREF_KEYS } from '../state/prefs';

type Card = { kind: AnnounceKind; id?: number };
const card = (kind: AnnounceKind, id = 0): Card => ({ kind, id });

describe('centre-stage announcer', () => {
  it('a card owns the stage for exactly its table duration, then the stage clears', () => {
    const a = new Announcer<Card>();
    expect(a.push(card('wave'), 0)).toBe(true);
    expect(a.current?.item.kind).toBe('wave');
    expect(a.tick(ANNOUNCE.wave.ms - 1)).toBe(false);
    expect(a.tick(ANNOUNCE.wave.ms)).toBe(true);
    expect(a.current).toBeNull();
  });

  it('a LOWER-priority card waits its turn instead of overprinting (tier banner behind WAVE N)', () => {
    const a = new Announcer<Card>();
    a.push(card('wave'), 0);
    expect(a.push(card('tier'), 10)).toBe(false); // queued — the wave banner keeps the stage
    expect(a.current?.item.kind).toBe('wave');
    a.tick(ANNOUNCE.wave.ms);
    expect(a.current?.item.kind).toBe('tier'); // …then it plays, whole
    expect(a.current?.at).toBe(ANNOUNCE.wave.ms);
  });

  it('a HIGHER-priority card preempts; a barely-started card re-queues but drops once stale', () => {
    const a = new Announcer<Card>();
    a.push(card('tier'), 0);
    a.push(card('bossIntro'), 100); // preempts the tier banner 100ms in
    expect(a.current?.item.kind).toBe('bossIntro');
    expect(a.queued.map((c) => c.kind)).toEqual(['tier']);
    a.tick(100 + ANNOUNCE.bossIntro.ms);
    expect(a.current?.item.kind).toBe('tier'); // its staleness budget outlasts a boss card

    const b = new Announcer<Card>();
    b.push(card('wave'), 0);
    b.push(card('megaIntro'), 50); // the wave banner's 400ms budget can't outlast a mega card
    b.tick(50 + ANNOUNCE.megaIntro.ms);
    expect(b.current).toBeNull();
    expect(b.queued).toEqual([]);
  });

  it('a card mostly seen is not replayed after a preemption', () => {
    const a = new Announcer<Card>();
    a.push(card('tier'), 0);
    a.push(card('megaFall'), ANNOUNCE.tier.ms * 0.8);
    expect(a.queued).toEqual([]);
  });

  it('newer news of the same kind replaces (on stage and in line), never stacks', () => {
    const a = new Announcer<Card>();
    a.push(card('weakPoint', 1), 0);
    const seq = a.current!.seq;
    a.push(card('weakPoint', 2), 300);
    expect(a.current?.item.id).toBe(2);
    expect(a.current!.seq).toBeGreaterThan(seq); // re-keyed → the animation restarts
    a.push(card('tier', 1), 400);
    a.push(card('tier', 2), 500);
    expect(a.queued).toEqual([{ kind: 'tier', id: 2 }]);
  });

  it('waiters play highest-priority first; stale waiters are dropped; an expired card leaves before a newcomer is judged', () => {
    const a = new Announcer<Card>();
    a.push(card('megaFall'), 0);
    a.push(card('weakPoint'), 10); // will go stale (budget 1500ms) behind a 3.6s fall card
    a.push(card('tier'), 2000);
    a.tick(ANNOUNCE.megaFall.ms);
    expect(a.current?.item.kind).toBe('tier'); // the weak-point card's news was too old to play
    const b = new Announcer<Card>();
    b.push(card('megaFall'), 0);
    b.push(card('tier'), 2000);
    b.push(card('weakPoint'), ANNOUNCE.megaFall.ms - 100);
    b.tick(ANNOUNCE.megaFall.ms);
    expect(b.current?.item.kind).toBe('weakPoint'); // both fresh → the higher priority first
    // The weak-point card has expired but nobody ticked yet: the queued tier card takes the stage
    // first, then the newcomer is judged against IT — wave (40) outranks tier (20) and preempts.
    const t = ANNOUNCE.megaFall.ms + ANNOUNCE.weakPoint.ms;
    expect(b.push(card('wave'), t)).toBe(true);
    expect(b.current?.item.kind).toBe('wave');
    expect(b.queued.map((c) => c.kind)).toEqual(['tier']); // tier had barely begun → it waits on
  });

  it('every announced kind has a sane slot: positive duration, a staleness budget, unique priority', () => {
    const prios = Object.values(ANNOUNCE).map((s) => s.priority);
    expect(new Set(prios).size).toBe(prios.length);
    for (const s of Object.values(ANNOUNCE)) {
      expect(s.ms).toBeGreaterThan(500);
      expect(s.maxWaitMs).toBeGreaterThanOrEqual(0);
    }
    // The fall of a raid organism outranks everything; the ambient tier banner yields to all.
    expect(ANNOUNCE.megaFall.priority).toBe(Math.max(...prios));
    expect(ANNOUNCE.tier.priority).toBe(Math.min(...prios));
  });
});

describe('FEEL table (one source for shake / hit-stop / duck / stinger)', () => {
  it('every row is in range and every stinger exists in the score', () => {
    for (const [id, row] of Object.entries(FEEL)) {
      if (row.shake !== undefined) expect(row.shake, id).toBeGreaterThan(0);
      if (row.shake !== undefined) expect(row.shake, id).toBeLessThanOrEqual(FX.shakeCap);
      // Hit-stop punctuates, it never lags: tiny, and never longer than the branch-purchase beat.
      if (row.hitstop !== undefined) expect(row.hitstop, id).toBeLessThanOrEqual(0.12);
      if (row.duck) { expect(row.duck[0], id).toBeGreaterThan(0); expect(row.duck[0], id).toBeLessThan(1); }
      if (row.stinger) expect(Object.keys(STINGERS), id).toContain(row.stinger);
    }
  });

  it('boss kills LAND: heavier than any combat hum, with a hit-stop and the bossDown stinger', () => {
    expect(FEEL.bossFall.shake).toBeGreaterThanOrEqual(0.4);
    expect(FEEL.bossFall.hitstop).toBeGreaterThan(0.1);
    expect(FEEL.bossFall.stinger).toBe('bossDown');
    expect(FEEL.bossFall.shake!).toBeGreaterThan(FEEL.kill.shake! * 10);
  });

  it('hero casts never shake; only an ult LANDING earns a light kick + a short impact frame', () => {
    expect(FEEL.ability.shake ?? 0).toBe(0);
    expect(FEEL.abilityImpact.shake).toBeGreaterThan(0);
    expect(FEEL.abilityImpact.shake!).toBeLessThan(FEEL.bossFall.shake!);
    expect(FEEL.abilityImpact.hitstop).toBeLessThanOrEqual(0.07);
  });
});

describe('Motion prefs → one motionScale', () => {
  it('reduced motion zeroes shake + flashes unless the player allows motion; numbers are independent', () => {
    expect(resolveMotion(MOTION_DEFAULTS, false)).toEqual({ motion: 1, shake: 1, numbers: true, flashes: true });
    expect(resolveMotion(MOTION_DEFAULTS, true)).toEqual({ motion: 0, shake: 0, numbers: true, flashes: false });
    expect(resolveMotion({ ...MOTION_DEFAULTS, allowMotion: true, shake: 0.5 }, true)).toEqual({ motion: 1, shake: 0.5, numbers: true, flashes: true });
    expect(resolveMotion({ ...MOTION_DEFAULTS, numbers: false, flashes: false }, false)).toEqual({ motion: 1, shake: 1, numbers: false, flashes: false });
  });

  it('persists as a device pref (registered for the factory reset), clamps, and notifies a live run', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } });
    try {
      expect(motionPrefs()).toEqual(MOTION_DEFAULTS);
      const seen: number[] = [];
      const off = onMotionPrefs((p) => seen.push(p.shake));
      setMotionPrefs({ shake: 0.3 });
      off();
      setMotionPrefs({ shake: 0.6 });
      expect(seen).toEqual([0.3]);
      expect(motionPrefs().shake).toBe(0.6);
      store.set('assimilate.motion', JSON.stringify({ shake: 7, numbers: 'yes' }));
      expect(motionPrefs()).toEqual({ ...MOTION_DEFAULTS, shake: 1 });
      expect(DEVICE_PREF_KEYS).toContain('assimilate.motion');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
