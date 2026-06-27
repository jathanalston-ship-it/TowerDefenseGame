// Data-driven SFX registry. Every sound is PROCEDURAL — a tiny stack of synth voices
// (Web Audio oscillators / noise) described by plain data, so the game ships with zero
// binary audio assets and a new sound is one entry here. The AudioManager (audio.ts)
// renders these; the AudioDriver (driver.ts) decides when to fire them from render state.
//
// Keep peak gains modest (combat stacks many at once) and durations short — this is
// feedback, not melody. `minIntervalMs` throttles spammy triggers (e.g. tower fire).

export type Waveform = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise';

/** One synth voice: a wave with a gain envelope and an optional pitch glide. */
export interface Voice {
  wave: Waveform;
  freq: number; // start frequency (Hz); ignored for noise (uses a filtered burst)
  freqEnd?: number; // glide target by end of `dur` (portamento)
  dur: number; // seconds the voice sounds
  attack?: number; // seconds to peak gain (default 0.005)
  release?: number; // seconds of tail after `dur` (default 0.04)
  gain?: number; // peak gain 0..1 (default 0.3)
  delay?: number; // seconds to wait before starting (layering)
  filterHz?: number; // low-pass cutoff for noise voices (default 2000)
}

export interface SoundDef {
  voices: Voice[];
  minIntervalMs?: number; // ignore re-triggers within this window (anti-spam)
}

export type SoundId =
  | 'fire_needle' | 'fire_mortar'
  | 'death' | 'shred' | 'breach'
  | 'apex' | 'hero_down'
  | 'place' | 'select'
  | 'card' | 'box_open' | 'purchase'
  | 'wave_start' | 'wave_clear' | 'victory' | 'defeat' | 'bonus' | 'confirm';

export const SOUNDS: Record<SoundId, SoundDef> = {
  // ── Combat ────────────────────────────────────────────────────────────────
  // Needle: a short, bright tick. Mortar: a low thunk. Both throttled so rapid fire
  // becomes a texture, not a wall of noise.
  fire_needle: { minIntervalMs: 55, voices: [{ wave: 'square', freq: 920, freqEnd: 560, dur: 0.05, gain: 0.12, release: 0.03 }] },
  fire_mortar: { minIntervalMs: 90, voices: [{ wave: 'triangle', freq: 200, freqEnd: 90, dur: 0.12, gain: 0.2, release: 0.06 }, { wave: 'noise', freq: 0, dur: 0.08, gain: 0.08, filterHz: 800 }] },
  // Death: soft noisy puff with a falling tone. Pitch is varied per-call by the driver.
  death: { minIntervalMs: 28, voices: [{ wave: 'noise', freq: 0, dur: 0.09, gain: 0.12, filterHz: 1600 }, { wave: 'sine', freq: 330, freqEnd: 150, dur: 0.08, gain: 0.08 }] },
  // SHRED: the signature reaction — a bright metallic zap (two detuned saws + a click).
  shred: { minIntervalMs: 35, voices: [{ wave: 'sawtooth', freq: 680, freqEnd: 1500, dur: 0.13, gain: 0.16, release: 0.06 }, { wave: 'square', freq: 1020, freqEnd: 2100, dur: 0.1, gain: 0.08 }] },
  breach: { minIntervalMs: 120, voices: [{ wave: 'sawtooth', freq: 160, freqEnd: 70, dur: 0.28, gain: 0.22, release: 0.1 }] },
  apex: { voices: [{ wave: 'sawtooth', freq: 280, freqEnd: 1400, dur: 0.22, gain: 0.22, release: 0.1 }, { wave: 'square', freq: 140, freqEnd: 700, dur: 0.22, gain: 0.1 }] },
  hero_down: { voices: [{ wave: 'sawtooth', freq: 420, freqEnd: 90, dur: 0.4, gain: 0.22, release: 0.15 }] },
  // ── UI / meta ───────────────────────────────────────────────────────────────
  place: { voices: [{ wave: 'triangle', freq: 320, freqEnd: 520, dur: 0.09, gain: 0.18, release: 0.04 }] },
  select: { minIntervalMs: 40, voices: [{ wave: 'square', freq: 660, dur: 0.04, gain: 0.1, release: 0.03 }] },
  card: { voices: [{ wave: 'triangle', freq: 520, freqEnd: 880, dur: 0.16, gain: 0.16, release: 0.08 }] },
  // Loot box: a rising shimmer that lands on a chord — the payoff moment.
  box_open: { voices: [{ wave: 'triangle', freq: 440, freqEnd: 880, dur: 0.28, gain: 0.18, release: 0.12 }, { wave: 'sine', freq: 660, dur: 0.3, gain: 0.12, delay: 0.06 }, { wave: 'sine', freq: 1320, dur: 0.3, gain: 0.08, delay: 0.12 }] },
  purchase: { voices: [{ wave: 'triangle', freq: 600, freqEnd: 900, dur: 0.12, gain: 0.16 }, { wave: 'sine', freq: 1200, dur: 0.1, gain: 0.08, delay: 0.05 }] },
  wave_start: { voices: [{ wave: 'sawtooth', freq: 130, freqEnd: 196, dur: 0.34, gain: 0.2, release: 0.12 }, { wave: 'square', freq: 65, dur: 0.34, gain: 0.1 }] },
  wave_clear: { voices: [{ wave: 'sine', freq: 523, dur: 0.18, gain: 0.16 }, { wave: 'sine', freq: 784, dur: 0.22, gain: 0.14, delay: 0.1 }] },
  victory: { voices: [{ wave: 'triangle', freq: 523, dur: 0.2, gain: 0.2 }, { wave: 'triangle', freq: 659, dur: 0.2, gain: 0.2, delay: 0.16 }, { wave: 'triangle', freq: 784, dur: 0.34, gain: 0.2, delay: 0.32 }] },
  defeat: { voices: [{ wave: 'triangle', freq: 392, dur: 0.26, gain: 0.2 }, { wave: 'triangle', freq: 311, dur: 0.26, gain: 0.2, delay: 0.2 }, { wave: 'triangle', freq: 233, dur: 0.5, gain: 0.2, delay: 0.4 }] },
  bonus: { voices: [{ wave: 'sine', freq: 880, freqEnd: 1320, dur: 0.12, gain: 0.12 }] },
  confirm: { voices: [{ wave: 'triangle', freq: 440, freqEnd: 660, dur: 0.12, gain: 0.16 }] },
};
