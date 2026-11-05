/// <reference types="vite/client" />
// SFX MIX invariants (docs/AUDIO.md): every dispatcher cue has ONE mix row; per-dispatch variation is
// bounded, table-driven and RNG-injected (musical categories stay exact); Wardrobe packs still re-voice;
// mute + volume reach the master; the mastering/space graph is built ONCE; long noise layers loop
// instead of stopping dead (the audit's truncation defect); a swarm can't starve a reward of voices.
// A recording fake AudioContext stands in for Web Audio — what sound.ts SCHEDULES is the contract.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { audio, sfxDev } from './sound';
import { CUE_MIX, SFX_CATEGORIES, SFX_MASTER, drawVariation, type SfxCategory } from './sfxMix';

class FakeParam {
  value = 0;
  events: [string, number, number][] = [];
  setValueAtTime(v: number, t: number): this { this.events.push(['set', v, t]); this.value = v; return this; }
  exponentialRampToValueAtTime(v: number, t: number): this { this.events.push(['exp', v, t]); return this; }
  linearRampToValueAtTime(v: number, t: number): this { this.events.push(['lin', v, t]); return this; }
  cancelScheduledValues(): this { return this; }
}
class FakeNode {
  out: FakeNode[] = [];
  connect<T extends FakeNode>(n: T): T { this.out.push(n); return n; }
  disconnect(): void { this.out = []; }
}
class FakeGain extends FakeNode { gain = Object.assign(new FakeParam(), { value: 1 }); }
class FakeSource extends FakeNode {
  onended: (() => void) | null = null;
  startAt = -1; stopAt = -1; startOffset = 0;
  start(t = 0, offset = 0): void { this.startAt = t; this.startOffset = offset; }
  stop(t = 0): void { this.stopAt = t; }
}
class FakeOsc extends FakeSource { type = 'sine'; frequency = new FakeParam(); }
class FakeBufferSource extends FakeSource { buffer: FakeBuffer | null = null; loop = false; }
class FakeFilter extends FakeNode { type = 'lowpass'; frequency = new FakeParam(); Q = new FakeParam(); }
class FakeComp extends FakeNode { threshold = new FakeParam(); knee = new FakeParam(); ratio = new FakeParam(); attack = new FakeParam(); release = new FakeParam(); }
class FakeConvolver extends FakeNode { buffer: FakeBuffer | null = null; }
class FakeShaper extends FakeNode { curve: Float32Array | null = null; }
class FakeConst extends FakeSource { offset = new FakeParam(); }
class FakeBuffer {
  private data: Float32Array[];
  constructor(public numberOfChannels: number, public length: number, public sampleRate: number) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration(): number { return this.length / this.sampleRate; }
  getChannelData(c: number): Float32Array { return this.data[c]; }
}

const made = { osc: [] as FakeOsc[], src: [] as FakeBufferSource[], gain: [] as FakeGain[], comp: [] as FakeComp[], conv: [] as FakeConvolver[], keep: [] as FakeConst[] };
let ctxMade: FakeCtx | null = null;
class FakeCtx {
  constructor() { ctxMade = this; }
  currentTime = 0;
  sampleRate = 8000; // small: the generated IR + noise buffer stay cheap
  state = 'running';
  destination = new FakeNode();
  createGain(): FakeGain { const n = new FakeGain(); made.gain.push(n); return n; }
  createOscillator(): FakeOsc { const n = new FakeOsc(); made.osc.push(n); return n; }
  createBufferSource(): FakeBufferSource { const n = new FakeBufferSource(); made.src.push(n); return n; }
  createBiquadFilter(): FakeFilter { return new FakeFilter(); }
  createDynamicsCompressor(): FakeComp { const n = new FakeComp(); made.comp.push(n); return n; }
  createConvolver(): FakeConvolver { const n = new FakeConvolver(); made.conv.push(n); return n; }
  createWaveShaper(): FakeShaper { return new FakeShaper(); }
  createConstantSource(): FakeConst { const n = new FakeConst(); made.keep.push(n); return n; }
  createBuffer(ch: number, len: number, sr: number): FakeBuffer { return new FakeBuffer(ch, len, sr); }
  resume(): Promise<void> { return Promise.resolve(); }
}

/** End every voice (fires onended — releases the voice counters) and forget what was made. */
function endVoices(): void {
  for (const n of [...made.osc, ...made.src]) n.onended?.();
  made.osc.length = 0; made.src.length = 0;
}
const master = (): FakeGain => made.gain.find((g) => g.out.includes(ctxMade!.destination))!;
const firstFreq = (o: FakeOsc): number => o.frequency.events[0][1];

beforeAll(() => {
  (globalThis as unknown as { window: unknown }).window = { AudioContext: FakeCtx };
  sfxDev.setRng(() => 0.5); // centred: no variation unless a test asks for it
  audio.resume(); // build the graph once
});
afterEach(() => {
  endVoices();
  sfxDev.setRng(() => 0.5);
  audio.setWardrobeCues({});
  audio.setEnabled(true);
  audio.setVolume(1);
});

const soundSrc = Object.values(import.meta.glob('/src/audio/sound.ts', { query: '?raw', import: 'default', eager: true }))[0] as string;
const CASES = new Set([...soundSrc.matchAll(/case '([\w-]+)':/g)].map((m) => m[1]));

describe('the mix table', () => {
  it('every dispatcher case has exactly one CUE_MIX row, and every row a case', () => {
    expect([...CASES].filter((t) => !(t in CUE_MIX))).toEqual([]);
    expect(Object.keys(CUE_MIX).filter((t) => !CASES.has(t))).toEqual([]);
  });

  it('variation bounds stay micro (pitch ≤ ±3 %, level ≤ ±1.5 dB, jitter ≤ 10 ms); musical categories are exact', () => {
    for (const [id, c] of Object.entries(SFX_CATEGORIES)) {
      expect(c.vary.pitch, id).toBeLessThanOrEqual(0.03);
      expect(c.vary.gainDb, id).toBeLessThanOrEqual(1.5);
      expect(c.vary.jitterMs, id).toBeLessThanOrEqual(10);
    }
    for (const id of ['reward', 'alert', 'cinematic'] as SfxCategory[]) expect(SFX_CATEGORIES[id].vary.pitch, id).toBe(0);
    // frequent cues are the quietest category but ambient; rewards and alerts the most prominent
    const t = (id: SfxCategory): number => SFX_CATEGORIES[id].targetLufs;
    expect(t('combatFrequent')).toBeLessThan(t('combatImpact'));
    expect(t('combatImpact')).toBeLessThan(t('reward'));
    expect(t('reward')).toBe(t('alert'));
    expect(t('ambient')).toBeLessThan(t('combatFrequent'));
  });

  it('drawVariation is bounded at the RNG extremes and the identity at its centre', () => {
    const v = { pitch: 0, gain: 0, delay: 0 };
    const vary = SFX_CATEGORIES.combatFrequent.vary;
    drawVariation(v, vary, () => 0.5);
    expect(v.pitch).toBe(1); expect(v.gain).toBe(1); expect(v.delay).toBeCloseTo(vary.jitterMs / 2000, 6);
    drawVariation(v, vary, () => 0);
    expect(v.pitch).toBeCloseTo(1 - vary.pitch, 9); expect(20 * Math.log10(v.gain)).toBeCloseTo(-vary.gainDb, 9); expect(v.delay).toBe(0);
    drawVariation(v, vary, () => 0.999999);
    expect(v.pitch).toBeLessThanOrEqual(1 + vary.pitch); expect(20 * Math.log10(v.gain)).toBeLessThanOrEqual(vary.gainDb); expect(v.delay).toBeLessThanOrEqual(vary.jitterMs / 1000);
    drawVariation(v, vary, () => 0, 0.006); // a row's pitch override (the kill-streak ladder)
    expect(v.pitch).toBeCloseTo(0.994, 9);
  });
});

describe('dispatch (a recording fake AudioContext)', () => {
  it('builds the mastering + space graph ONCE: 2 compressors, 1 convolver, 1 keep-alive — cues only add voices', () => {
    for (const tag of ['hit', 'clear', 'cin_title', 'boss', 'tfire_tick']) audio.cue(tag);
    expect(made.comp).toHaveLength(2);
    expect(made.conv).toHaveLength(1);
    expect(made.keep).toHaveLength(1);
    expect(made.keep[0].offset.value).toBeLessThan(1e-5); // −120 dBFS: inaudible, but keeps the dynamics processing
  });

  it('one variation per dispatch moves every voice of a frequent cue; trims are table data', () => {
    sfxDev.setRng(() => 0.999999);
    audio.cue('tfire_tick');
    expect(firstFreq(made.osc[0])).toBeCloseTo(820 * (1 + 0.03), 1);
    endVoices();
    sfxDev.setRng(() => 0.5);
    audio.cue('tfire_tick');
    expect(firstFreq(made.osc[0])).toBe(820);
    endVoices();
    sfxDev.setRng(null); // the audit's nominal renders: no variation at all
    audio.cue('tfire_tick');
    expect(firstFreq(made.osc[0])).toBe(820);
    expect(made.osc[0].startAt).toBe(0); // and no start jitter
  });

  it('musical categories never vary: a reward keeps its exact pitches and timing', () => {
    sfxDev.setRng(() => 0.999999);
    audio.cue('clear');
    expect(made.osc.map(firstFreq).slice(0, 2)).toEqual([392, 523]);
    expect(made.osc[0].startAt).toBe(0);
    expect(made.osc[1].startAt).toBeCloseTo(0.075, 9); // the arpeggio step (data, not jitter)
  });

  it('cinematic beats keep their timing: every film voice starts on the beat (no jitter)', () => {
    sfxDev.setRng(() => 0.999999);
    for (const tag of ['cin_ping', 'cin_rumble', 'cin_title', 'cin_dive']) {
      audio.cue(tag);
      for (const v of [...made.osc, ...made.src]) expect(v.startAt, tag).toBe(0);
      endVoices();
    }
  });

  it('a Wardrobe audio pack still re-voices its family (and only its family)', () => {
    audio.setWardrobeCues({ tower: 'deep', enemy: 'crisp' });
    audio.cue('tfire_tick');
    expect(firstFreq(made.osc[0])).toBeCloseTo(820 * 0.72, 6);
    endVoices();
    audio.cue('kill');
    expect(firstFreq(made.osc[0])).toBeCloseTo(330 * 1.32, 6);
    endVoices();
    audio.cue('clear'); // not a tower/enemy cue — stays classic
    expect(firstFreq(made.osc[0])).toBe(392);
    endVoices();
    audio.cueBatch({ 'tfire_tick~wet': 1 }); // a per-unit Phenotype variant wins over the pack
    expect(firstFreq(made.osc[0])).toBeCloseTo(820 * 0.86, 6);
  });

  it('mute and volume reach the master; a muted engine schedules nothing', () => {
    audio.setVolume(0.5);
    expect(master().gain.value).toBeCloseTo(SFX_MASTER.output * 0.5, 9);
    audio.setEnabled(false);
    expect(master().gain.value).toBe(0);
    audio.cue('hit');
    expect(made.osc).toHaveLength(0);
    audio.setEnabled(true);
    expect(master().gain.value).toBeCloseTo(SFX_MASTER.output * 0.5, 9);
  });

  it('long noise layers LOOP from a random offset — they never stop dead at the buffer end', () => {
    audio.cue('cin_rumble'); // its noise layer is 1.5 s — the old 0.5 s buffer cut it two-thirds early
    expect(made.src.length).toBeGreaterThan(0);
    for (const s of made.src) {
      expect(s.loop).toBe(true);
      expect(s.startOffset).toBeGreaterThanOrEqual(0);
      expect(s.startOffset).toBeLessThan(s.buffer!.duration);
    }
    expect(Math.max(...made.src.map((s) => s.stopAt - s.startAt))).toBeGreaterThan(1.5);
  });

  it('a swarm fills ITS voice budget, never a reward\'s', () => {
    for (let i = 0; i < 40; i++) audio.cueBatch({ tfire_tick: 3, hit: 3, edie_crack: 4, kill: 5 });
    const { voices } = sfxDev.stats();
    expect(voices).toBeLessThanOrEqual(SFX_CATEGORIES.combatFrequent.voices);
    const before = made.osc.length;
    audio.cue('levelup');
    expect(made.osc.length - before).toBeGreaterThanOrEqual(4); // the whole fanfare sounds
  });
});
