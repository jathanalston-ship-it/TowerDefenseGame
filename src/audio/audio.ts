// AudioManager — the Web Audio backend for the procedural SFX/music. Lazily creates an
// AudioContext on the first user gesture (browser autoplay policy), renders SoundDefs
// from the registry, and owns a SFX bus + a music bus under a master gain. Preferences
// (muted / volume / music) persist to localStorage — deliberately NOT the save file, so
// audio settings carry across saves and never touch the save schema/migrations.
//
// Capability-guarded: with no Web Audio (Node test env / SSR) every method is a safe
// no-op, so the deterministic sim + tests never depend on audio.

import { SOUNDS } from './sounds';
import type { SoundId, Voice } from './sounds';
import { MusicEngine } from './music';
import type { MusicScene } from './music';

export interface AudioPrefs {
  muted: boolean;
  volume: number; // 0..1 master
  music: boolean; // music bed on/off (SFX still play)
}

const PREFS_KEY = 'assimilate.audio';
const VOICE_CAP = 18; // hard ceiling on simultaneous SFX voices (combat can stack)

export function clampVolume(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.7;
}

export function parsePrefs(raw: string | null): AudioPrefs {
  const d: AudioPrefs = { muted: false, volume: 0.7, music: true };
  if (!raw) return d;
  try {
    const o = JSON.parse(raw) as Partial<AudioPrefs>;
    return { muted: o.muted === true, volume: clampVolume(o.volume), music: o.music !== false };
  } catch {
    return d;
  }
}

type AC = typeof AudioContext;

export class AudioManager {
  private prefs: AudioPrefs;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private music: MusicEngine | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private readonly lastPlayed = new Map<SoundId, number>();
  private voices = 0;
  private scene: MusicScene = 'menu';
  private readonly AC?: AC;

  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()) {
    this.prefs = parsePrefs(this.storage?.getItem(PREFS_KEY) ?? null);
    const w = typeof window !== 'undefined' ? (window as unknown as { AudioContext?: AC; webkitAudioContext?: AC }) : undefined;
    this.AC = w?.AudioContext ?? w?.webkitAudioContext;
  }

  get supported(): boolean {
    return this.AC !== undefined;
  }

  getPrefs(): AudioPrefs {
    return { ...this.prefs };
  }

  private persist(): void {
    try {
      this.storage?.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    } catch {
      /* storage full / unavailable — prefs simply don't persist */
    }
  }

  /** Resume/create the context — must be called from a user gesture. Idempotent. */
  unlock(): void {
    if (!this.supported) return;
    if (!this.ctx) this.build();
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    this.applyMusic();
  }

  private build(): void {
    if (!this.AC) return;
    const ctx = new this.AC();
    const master = ctx.createGain();
    master.gain.value = this.prefs.muted ? 0 : this.prefs.volume;
    master.connect(ctx.destination);
    const sfx = ctx.createGain();
    sfx.gain.value = 0.9;
    sfx.connect(master);
    const musicGain = ctx.createGain();
    musicGain.gain.value = 0.5;
    musicGain.connect(master);
    // One reusable white-noise buffer (puffs/impacts).
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.ctx = ctx;
    this.master = master;
    this.sfx = sfx;
    this.musicGain = musicGain;
    this.noiseBuf = buf;
    this.music = new MusicEngine(ctx, musicGain);
  }

  // ── Preferences ────────────────────────────────────────────────────────────
  setMuted(muted: boolean): void {
    this.prefs = { ...this.prefs, muted };
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : this.prefs.volume, this.ctx.currentTime, 0.02);
    this.persist();
  }

  setVolume(volume: number): void {
    this.prefs = { ...this.prefs, volume: clampVolume(volume) };
    if (this.master && this.ctx && !this.prefs.muted) this.master.gain.setTargetAtTime(this.prefs.volume, this.ctx.currentTime, 0.02);
    this.persist();
  }

  setMusic(on: boolean): void {
    this.prefs = { ...this.prefs, music: on };
    this.applyMusic();
    this.persist();
  }

  // ── Music ────────────────────────────────────────────────────────────────
  setScene(scene: MusicScene): void {
    if (scene === this.scene) return;
    this.scene = scene;
    this.applyMusic();
  }

  private applyMusic(): void {
    if (!this.music) return;
    if (this.prefs.music) this.music.setScene(this.scene);
    else this.music.stop();
  }

  // ── SFX ────────────────────────────────────────────────────────────────
  /** Play a registry sound. `pitch` multiplies every voice frequency (death/variety).
   *  Safe to call anywhere: no-ops without Web Audio, when muted, or when throttled. */
  play(id: SoundId, pitch = 1): void {
    if (!this.ctx || !this.sfx || this.prefs.muted) return;
    const def = SOUNDS[id];
    if (!def) return;
    const now = performance.now();
    if (def.minIntervalMs) {
      const last = this.lastPlayed.get(id) ?? -Infinity;
      if (now - last < def.minIntervalMs) return; // throttled
      this.lastPlayed.set(id, now);
    }
    for (const v of def.voices) this.voice(v, pitch);
  }

  private voice(v: Voice, pitch: number): void {
    const ctx = this.ctx!;
    if (this.voices >= VOICE_CAP) return; // voice budget — drop the quietest path (just skip)
    const t0 = ctx.currentTime + (v.delay ?? 0);
    const attack = v.attack ?? 0.005;
    const release = v.release ?? 0.04;
    const peak = v.gain ?? 0.3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + v.dur + release);
    g.connect(this.sfx!);

    let src: AudioScheduledSourceNode;
    if (v.wave === 'noise') {
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuf;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = v.filterHz ?? 2000;
      n.connect(lp).connect(g);
      src = n;
    } else {
      const osc = ctx.createOscillator();
      osc.type = v.wave;
      osc.frequency.setValueAtTime(v.freq * pitch, t0);
      if (v.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, v.freqEnd * pitch), t0 + v.dur);
      osc.connect(g);
      src = osc;
    }
    this.voices++;
    src.onended = () => { this.voices--; };
    src.start(t0);
    src.stop(t0 + v.dur + release + 0.02);
  }
}

function safeStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** App-wide singleton. */
export const audio = new AudioManager();
