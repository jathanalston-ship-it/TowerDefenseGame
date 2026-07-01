// MUSIC ENGINE (docs/GAME-FEEL.md §music) — an actual soundtrack, not ambience. Two halves:
//
//   1. A PURE COMPOSITION CORE (exported, unit-tested): tracks are DATA (tempo, key, chord
//      progression, per-layer patterns); `barNotes(track, bar)` deterministically renders one
//      bar of notes for every layer — melody, harmony, rhythm, percussion, bass, evolving
//      structure. No AudioContext here, so tests can prove "this is a composition" (recognizable
//      melody, harmonic progression, drum grammar, intro ≠ loop, sections evolve).
//
//   2. A WebAudio PLAYER (the music manager): lookahead scheduler, per-layer gain buses,
//      intro → loop-region playback, ~2s equal-power crossfades between category tracks, and
//      `setIntensity(0..1)` mapping onto per-layer [min,max] gains — the future-adaptive seam
//      (boss layer fades in, low-health percussion swap) with NO hardcoded playback anywhere:
//      callers only ever request a CATEGORY.
//
// Categories: menu · combat · boss · victory · defeat · events (victory/defeat are one-shot
// cadences). Style: slow bio-mechanical pulse — synth arps, deep bass, haunting minor melody,
// mechanical drums, organic pad UNDER the mix. Tuned for hours-long listening: sparse lead,
// long phrases, no white noise beds.

// ── The pure composition core ────────────────────────────────────────────────────────────────

export type MusicCategory = 'menu' | 'combat' | 'boss' | 'victory' | 'defeat' | 'events';
export type LayerId = 'bass' | 'drums' | 'arp' | 'lead' | 'pad' | 'texture';

export interface Note {
  /** Offset inside the bar, in 16th steps (0..15). */
  step: number;
  /** MIDI note number (drums use channel-style ids: 36 kick, 38 snare, 42 hat, 46 open). */
  midi: number;
  /** Duration in 16th steps. */
  len: number;
  /** 0..1 — velocity/level. */
  vel: number;
}

export interface LayerDef {
  id: LayerId;
  /** Gain range across intensity 0..1 (the adaptive seam): gain = min + (max-min)·intensity. */
  gain: [number, number];
}

export interface TrackDef {
  id: string;
  category: MusicCategory;
  bpm: number;
  /** Root MIDI note of the key (E minor menu = 40). */
  root: number;
  /** Scale intervals from the root (natural minor default). */
  scale: number[];
  /** Chord progression, one degree index per bar of the LOOP (into `scale`); negative = rest bar. */
  progression: number[];
  /** Bars of intro before the loop region (intro renders reduced layers). */
  introBars: number;
  /** One-shot (victory/defeat cadences): play intro+progression once, no loop. */
  oneShot?: boolean;
  /** Authored lead motif in scale DEGREES (octave-relative), consumed phrase-wise; -1 = rest. */
  motif: number[];
  layers: LayerDef[];
}

const MINOR = [0, 2, 3, 5, 7, 8, 10];

/** All authored tracks — a category is one data row. Balance/authoring lives HERE. */
export const TRACKS: Record<MusicCategory, TrackDef> = {
  menu: {
    id: 'menu_hive', category: 'menu', bpm: 92, root: 40, scale: MINOR,
    // 16-bar loop, two 8-bar halves: i–VI–III–VII | i–VI–iv–V-ish (degrees into the scale).
    progression: [0, 5, 2, 6, 0, 5, 2, 6, 0, 5, 3, 4, 0, 3, 4, 4],
    introBars: 4,
    // The Hive theme — a long, haunting phrase with breaths (-1 = rest); repeats every 8 bars
    // with the second half varied by the renderer.
    motif: [7, -1, 5, 7, 8, -1, 7, 5, 3, -1, 2, 3, 5, -1, -1, -1, 7, -1, 8, 10, 9, -1, 7, 5, 7, -1, 5, 3, 2, -1, -1, -1],
    layers: [
      { id: 'bass', gain: [0.5, 0.7] },
      { id: 'drums', gain: [0.35, 0.6] },
      { id: 'arp', gain: [0.3, 0.5] },
      { id: 'lead', gain: [0.5, 0.6] },
      { id: 'pad', gain: [0.25, 0.3] },
      { id: 'texture', gain: [0.15, 0.3] },
    ],
  },
  combat: {
    id: 'combat_strain', category: 'combat', bpm: 112, root: 38, scale: MINOR,
    progression: [0, 0, 5, 6, 0, 0, 3, 4],
    introBars: 2,
    motif: [0, -1, 3, 5, -1, 5, 3, 2, 0, -1, 3, 7, -1, 5, 3, -1],
    layers: [
      { id: 'bass', gain: [0.55, 0.75] },
      { id: 'drums', gain: [0.5, 0.8] },
      { id: 'arp', gain: [0.35, 0.55] },
      { id: 'lead', gain: [0.3, 0.5] },
      { id: 'pad', gain: [0.15, 0.25] },
      { id: 'texture', gain: [0.1, 0.25] },
    ],
  },
  boss: {
    id: 'boss_apex', category: 'boss', bpm: 126, root: 37, scale: [0, 1, 3, 5, 7, 8, 10], // phrygian menace
    progression: [0, 1, 0, 6, 0, 1, 3, 4],
    introBars: 1,
    motif: [0, 1, -1, 0, 3, -1, 1, 0, 5, -1, 3, 1, 0, -1, -1, -1],
    layers: [
      { id: 'bass', gain: [0.65, 0.85] },
      { id: 'drums', gain: [0.65, 0.9] },
      { id: 'arp', gain: [0.4, 0.6] },
      { id: 'lead', gain: [0.45, 0.65] },
      { id: 'pad', gain: [0.2, 0.3] },
      { id: 'texture', gain: [0.2, 0.35] },
    ],
  },
  victory: {
    id: 'sting_victory', category: 'victory', bpm: 100, root: 43, scale: [0, 2, 4, 5, 7, 9, 11], // major lift
    progression: [3, 4, 0, 0], introBars: 0, oneShot: true,
    motif: [0, 2, 4, 7, -1, 4, 7, 9, 7, -1, -1, -1, -1, -1, -1, -1],
    layers: [
      { id: 'bass', gain: [0.55, 0.7] }, { id: 'drums', gain: [0.35, 0.5] }, { id: 'arp', gain: [0.4, 0.5] },
      { id: 'lead', gain: [0.65, 0.75] }, { id: 'pad', gain: [0.3, 0.35] }, { id: 'texture', gain: [0.1, 0.15] },
    ],
  },
  defeat: {
    id: 'sting_defeat', category: 'defeat', bpm: 72, root: 40, scale: MINOR,
    progression: [5, 4, 0, 0], introBars: 0, oneShot: true,
    motif: [5, -1, 3, 2, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    layers: [
      { id: 'bass', gain: [0.5, 0.6] }, { id: 'drums', gain: [0.1, 0.2] }, { id: 'arp', gain: [0.15, 0.25] },
      { id: 'lead', gain: [0.6, 0.7] }, { id: 'pad', gain: [0.35, 0.4] }, { id: 'texture', gain: [0.15, 0.2] },
    ],
  },
  events: {
    id: 'event_pulse', category: 'events', bpm: 104, root: 40, scale: MINOR,
    progression: [0, 6, 5, 4], introBars: 1,
    motif: [3, -1, 5, 7, -1, 7, 8, 7, 5, -1, 3, 2, -1, -1, -1, -1],
    layers: [
      { id: 'bass', gain: [0.5, 0.7] }, { id: 'drums', gain: [0.45, 0.65] }, { id: 'arp', gain: [0.4, 0.55] },
      { id: 'lead', gain: [0.4, 0.55] }, { id: 'pad', gain: [0.2, 0.3] }, { id: 'texture', gain: [0.15, 0.3] },
    ],
  },
};

const degreeToMidi = (t: TrackDef, degree: number, octave = 0): number => {
  const n = t.scale.length;
  const idx = ((degree % n) + n) % n;
  const oct = octave + Math.floor(degree / n);
  return t.root + t.scale[idx] + 12 * oct;
};

/** Chord tones (triad) of the loop-bar's progression degree. */
export function chordAt(t: TrackDef, loopBar: number): number[] {
  const deg = t.progression[((loopBar % t.progression.length) + t.progression.length) % t.progression.length];
  return [degreeToMidi(t, deg), degreeToMidi(t, deg + 2), degreeToMidi(t, deg + 4)];
}

/** Deterministic per-bar pattern variation (tiny hash — same bar always renders identically). */
const vary = (bar: number, salt: number): number => {
  let h = (bar * 2654435761 + salt * 40503) >>> 0;
  h ^= h >> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >> 15;
  return (h % 1000) / 1000;
};

export interface BarNotes { bar: number; inIntro: boolean; layers: Record<LayerId, Note[]>; }

/** Render ONE bar of the track — the whole composition, deterministically. `bar` is absolute
 *  (0-based): bars < introBars render the reduced intro; after that the loop region repeats
 *  with evolving structure (arp A/B halves, drum fills on phrase ends, lead phrasing in/out). */
export function barNotes(t: TrackDef, bar: number): BarNotes {
  const inIntro = bar < t.introBars;
  const loopBar = inIntro ? 0 : (bar - t.introBars) % t.progression.length;
  const chord = chordAt(t, loopBar);
  const rootMidi = chord[0] - 12; // bass lives an octave under the chord
  const phraseEnd = !inIntro && (loopBar + 1) % 8 === 0;
  const half = Math.floor(loopBar / 8) % 2; // A/B section (evolving structure)
  const L: Record<LayerId, Note[]> = { bass: [], drums: [], arp: [], lead: [], pad: [], texture: [] };

  // BASS — driving 8ths on the root with a passing approach into the next bar (harmonic motion).
  for (let s = 0; s < 16; s += 2) {
    const approach = s === 14 && vary(bar, 1) > 0.5;
    const midi = approach ? chordAt(t, loopBar + 1)[0] - 12 - 2 : rootMidi - (s === 8 && half === 1 ? 5 : 0); // B halves pivot on the fifth below (in-scale in minor/phrygian/major)
    L.bass.push({ step: s, midi, len: 2, vel: s % 4 === 0 ? 0.9 : 0.7 });
  }

  // DRUMS — mechanical kit: kick 1 & 3 (+ syncopation in B halves), snare 2 & 4, 8th hats with
  // accents; a fill closes every 8-bar phrase. Intro: hats only (the pulse breathes in).
  if (!inIntro || t.introBars === 0) {
    L.drums.push({ step: 0, midi: 36, len: 1, vel: 1 }, { step: 8, midi: 36, len: 1, vel: 0.95 });
    if (half === 1 && vary(bar, 2) > 0.4) L.drums.push({ step: 10, midi: 36, len: 1, vel: 0.7 });
    L.drums.push({ step: 4, midi: 38, len: 1, vel: 0.85 }, { step: 12, midi: 38, len: 1, vel: 0.85 });
    if (phraseEnd) for (let s = 13; s < 16; s++) L.drums.push({ step: s, midi: 38, len: 1, vel: 0.5 + 0.15 * (s - 13) });
  }
  for (let s = 0; s < 16; s += 2) L.drums.push({ step: s, midi: 42, len: 1, vel: s % 4 === 0 ? 0.5 : 0.3 });
  if (!inIntro && vary(bar, 3) > 0.7) L.drums.push({ step: 14, midi: 46, len: 2, vel: 0.4 });

  // ARP — 16th synth arpeggio over the chord; pattern A rises, pattern B rocks (section change).
  if (!inIntro) {
    const spread = [chord[0], chord[1], chord[2], chord[1] + 12];
    for (let s = 0; s < 16; s++) {
      const i = half === 0 ? s % 4 : [0, 2, 1, 3][s % 4];
      L.arp.push({ step: s, midi: spread[i], len: 1, vel: 0.5 + 0.2 * ((s % 4) === 0 ? 1 : 0) });
    }
  }

  // LEAD — the authored motif, spoken in 2-bar phrases with rests; sits out the first half of
  // each 16-bar cycle after the intro (space to breathe), returns varied (+octave shimmer in B).
  const leadActive = !inIntro && (loopBar % 16 >= 8 || t.oneShot || t.progression.length <= 8);
  if (leadActive) {
    const phrase = Math.floor(loopBar / 2) % Math.max(1, Math.floor(t.motif.length / 16));
    for (let s = 0; s < 16; s += 2) {
      const d = t.motif[(phrase * 16 + (loopBar % 2) * 8 + s / 2) % t.motif.length];
      if (d < 0) continue;
      L.lead.push({ step: s, midi: degreeToMidi(t, d, 1) + (half === 1 && vary(bar, 4) > 0.6 ? 12 : 0), len: 2, vel: 0.75 });
    }
  }

  // PAD — one organic chord swell per bar, UNDER the mix (harmonic bed, never a drone lead).
  for (const m of chord) L.pad.push({ step: 0, midi: m, len: 16, vel: 0.5 });

  // TEXTURE — sparse bio-clicks/chitters (organic technology), placed off-grid-ish but seeded.
  if (vary(bar, 5) > 0.55) L.texture.push({ step: 3 + Math.floor(vary(bar, 6) * 4) * 2, midi: 84 + Math.floor(vary(bar, 7) * 7), len: 1, vel: 0.3 });

  return { bar, inIntro, layers: L };
}

// ── The WebAudio player (the music manager) ──────────────────────────────────────────────────

const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const LOOKAHEAD_S = 0.15;
const TICK_MS = 40;
const XFADE_S = 1.8;

interface ActiveTrack {
  def: TrackDef;
  bus: GainNode; // track master (crossfade target)
  layers: Record<LayerId, GainNode>;
  nextBar: number;
  nextBarTime: number;
  done?: boolean; // one-shot finished
}

class MusicManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private active: ActiveTrack | null = null;
  private fading: ActiveTrack | null = null;
  private intensity = 0.5;
  private volume = 0.8;
  private enabled = true;
  current: MusicCategory | null = null;

  private ensure(): boolean {
    if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return false;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return true;
  }

  /** Request a CATEGORY (never a hardcoded file/loop) — crossfades from whatever is playing.
   *  One-shots (victory/defeat) play once over the fading bed and end silent. */
  play(category: MusicCategory): void {
    if (!this.enabled || !this.ensure() || !this.ctx || !this.master) return;
    if (this.current === category && this.active && !this.active.def.oneShot) return; // already on it
    const def = TRACKS[category];
    const bus = this.ctx.createGain();
    bus.gain.value = 0;
    bus.connect(this.master);
    const layers = {} as Record<LayerId, GainNode>;
    for (const l of def.layers) {
      const g = this.ctx.createGain();
      g.gain.value = l.gain[0] + (l.gain[1] - l.gain[0]) * this.intensity;
      g.connect(bus);
      layers[l.id] = g;
    }
    // Crossfade: previous track fades out (equal-power-ish), the new one fades in.
    const now = this.ctx.currentTime;
    if (this.fading) { try { this.fading.bus.disconnect(); } catch { /* already gone */ } }
    if (this.active) {
      this.fading = this.active;
      this.fading.bus.gain.cancelScheduledValues(now);
      this.fading.bus.gain.setValueAtTime(this.fading.bus.gain.value, now);
      this.fading.bus.gain.linearRampToValueAtTime(0, now + XFADE_S);
    }
    bus.gain.setValueAtTime(0, now);
    bus.gain.linearRampToValueAtTime(1, now + XFADE_S);
    this.active = { def, bus, layers, nextBar: 0, nextBarTime: now + 0.05 };
    this.current = category;
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (!this.ctx || !this.active) return;
    const now = this.ctx.currentTime;
    this.active.bus.gain.cancelScheduledValues(now);
    this.active.bus.gain.setValueAtTime(this.active.bus.gain.value, now);
    this.active.bus.gain.linearRampToValueAtTime(0, now + 0.8);
    this.fading = this.active;
    this.active = null;
    this.current = null;
  }

  /** The adaptive seam: 0 = calm … 1 = full — maps onto each layer's authored gain range.
   *  (Boss enters → setIntensity(1); low health → the drums range dominates; prestige moments
   *  can ride a layer directly via setLayerGain.) */
  setIntensity(v: number): void {
    this.intensity = Math.min(1, Math.max(0, v));
    if (!this.ctx || !this.active) return;
    for (const l of this.active.def.layers) {
      const g = this.active.layers[l.id];
      g.gain.linearRampToValueAtTime(l.gain[0] + (l.gain[1] - l.gain[0]) * this.intensity, this.ctx.currentTime + 0.4);
    }
  }

  /** Direct layer override (future adaptive hooks — e.g. mute the lead during dialogue). */
  setLayerGain(layer: LayerId, gain: number): void {
    if (!this.ctx || !this.active) return;
    this.active.layers[layer]?.gain.linearRampToValueAtTime(Math.max(0, gain), this.ctx.currentTime + 0.3);
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.master && this.ctx) this.master.gain.linearRampToValueAtTime(this.volume, this.ctx.currentTime + 0.1);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.stop();
  }

  // Lookahead scheduler: render bars slightly ahead of the clock (the standard WebAudio pattern —
  // cheap: one pass per bar, a handful of short-lived nodes per note, no per-frame work).
  private tick(): void {
    if (!this.ctx) return;
    const t = this.active;
    if (!t || t.done) return;
    while (t.nextBarTime < this.ctx.currentTime + LOOKAHEAD_S + (60 / t.def.bpm) * 4) {
      const barLen = (60 / t.def.bpm) * 4;
      const totalBars = t.def.introBars + t.def.progression.length;
      if (t.def.oneShot && t.nextBar >= totalBars) { t.done = true; this.current = null; break; }
      this.renderBar(t, barNotes(t.def, t.nextBar), t.nextBarTime);
      t.nextBar++;
      t.nextBarTime += barLen;
    }
  }

  private renderBar(t: ActiveTrack, bar: BarNotes, at: number): void {
    if (!this.ctx) return;
    const stepLen = (60 / t.def.bpm) / 4;
    for (const layer of Object.keys(bar.layers) as LayerId[]) {
      const out = t.layers[layer];
      if (!out) continue;
      for (const n of bar.layers[layer]) {
        const when = at + n.step * stepLen;
        const dur = Math.max(0.05, n.len * stepLen);
        if (layer === 'drums') this.drum(n, when, out);
        else this.voice(layer, n, when, dur, out);
      }
    }
  }

  private voice(layer: LayerId, n: Note, when: number, dur: number, out: GainNode): void {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    o.type = layer === 'bass' ? 'sawtooth' : layer === 'arp' ? 'square' : layer === 'lead' ? 'sawtooth' : layer === 'texture' ? 'sine' : 'triangle';
    o.frequency.value = midiHz(n.midi);
    f.type = 'lowpass';
    f.frequency.value = layer === 'bass' ? 300 : layer === 'pad' ? 900 : layer === 'lead' ? 2200 : 1800;
    if (layer === 'arp') { f.frequency.setValueAtTime(900, when); f.frequency.linearRampToValueAtTime(1900, when + dur); }
    const a = layer === 'pad' ? 0.6 : 0.01;
    const peak = n.vel * (layer === 'pad' ? 0.14 : layer === 'bass' ? 0.3 : layer === 'lead' ? 0.22 : 0.16);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + a);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur + (layer === 'pad' ? 0.8 : 0.08));
    o.connect(f); f.connect(g); g.connect(out);
    o.start(when); o.stop(when + dur + 1);
    if (layer === 'lead') { // organic vibrato — the "alive" quality
      const lfo = this.ctx.createOscillator(); const lg = this.ctx.createGain();
      lfo.frequency.value = 5.2; lg.gain.value = 4;
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(when + 0.12); lfo.stop(when + dur + 1);
    }
  }

  private drum(n: Note, when: number, out: GainNode): void {
    if (!this.ctx) return;
    if (n.midi === 36) { // kick — pitched drop
      const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(120, when); o.frequency.exponentialRampToValueAtTime(38, when + 0.12);
      g.gain.setValueAtTime(0.5 * n.vel, when); g.gain.exponentialRampToValueAtTime(0.001, when + 0.22);
      o.connect(g); g.connect(out); o.start(when); o.stop(when + 0.3);
      return;
    }
    // snare / hats — shaped noise bursts (mechanical, chitinous)
    const len = n.midi === 38 ? 0.14 : n.midi === 46 ? 0.25 : 0.05;
    const buf = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * len), this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = n.midi === 38 ? 'bandpass' : 'highpass';
    f.frequency.value = n.midi === 38 ? 1900 : 6500;
    const g = this.ctx.createGain();
    g.gain.value = (n.midi === 38 ? 0.3 : 0.12) * n.vel;
    src.connect(f); f.connect(g); g.connect(out); src.start(when);
  }
}

export const music = new MusicManager();
