// Pure-logic tests for the audio layer. The Web Audio backend can't run in the Node
// test env (no AudioContext), which is exactly the contract: the AudioManager must be a
// safe no-op there, and the registry/prefs must validate without a context.

import { describe, it, expect } from 'vitest';
import { SOUNDS } from './sounds';
import type { SoundId } from './sounds';
import { AudioManager, clampVolume, parsePrefs } from './audio';

describe('sound registry', () => {
  it('every sound has at least one well-formed voice', () => {
    for (const [id, def] of Object.entries(SOUNDS)) {
      expect(def.voices.length, id).toBeGreaterThan(0);
      for (const v of def.voices) {
        expect(v.dur, id).toBeGreaterThan(0);
        expect(v.dur, id).toBeLessThan(1); // feedback, not melody
        if (v.wave !== 'noise') expect(v.freq, id).toBeGreaterThan(0);
        if (v.gain !== undefined) expect(v.gain, `${id} gain`).toBeLessThanOrEqual(0.3); // headroom for stacking
      }
    }
  });

  it('throttled sounds declare a positive interval', () => {
    for (const [id, def] of Object.entries(SOUNDS)) {
      if (def.minIntervalMs !== undefined) expect(def.minIntervalMs, id).toBeGreaterThan(0);
    }
  });
});

describe('audio prefs', () => {
  it('clampVolume bounds to [0,1] and defaults bad input', () => {
    expect(clampVolume(0.5)).toBe(0.5);
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(2)).toBe(1);
    expect(clampVolume('x')).toBe(0.7); // default
    expect(clampVolume(NaN)).toBe(0.7);
  });

  it('parsePrefs is resilient to junk and round-trips valid prefs', () => {
    expect(parsePrefs(null)).toEqual({ muted: false, volume: 0.7, music: true });
    expect(parsePrefs('not json')).toEqual({ muted: false, volume: 0.7, music: true });
    expect(parsePrefs(JSON.stringify({ muted: true, volume: 0.3, music: false }))).toEqual({ muted: true, volume: 0.3, music: false });
    expect(parsePrefs(JSON.stringify({ volume: 9 }))).toEqual({ muted: false, volume: 1, music: true }); // clamped
  });
});

describe('AudioManager without Web Audio (Node)', () => {
  it('reports unsupported and no-ops every call (no throws)', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const m = new AudioManager(storage);
    expect(m.supported).toBe(false); // no AudioContext in Node
    // None of these should throw without a context.
    expect(() => {
      m.unlock();
      (Object.keys(SOUNDS) as SoundId[]).forEach((id) => m.play(id));
      m.setScene('combat');
      m.setMuted(true);
      m.setVolume(0.2);
      m.setMusic(false);
    }).not.toThrow();
  });

  it('persists preference changes through the injected storage', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const m = new AudioManager(storage);
    m.setMuted(true);
    m.setVolume(0.25);
    m.setMusic(false);
    // A fresh manager reads them back (settings survive a reload).
    expect(new AudioManager(storage).getPrefs()).toEqual({ muted: true, volume: 0.25, music: false });
  });
});
