// MusicEngine — a tiny PROCEDURAL ambient bed (no audio files). Persistent oscillators
// form a low drone + pad; a filtered, pulsing layer fades in for combat. Scenes only
// crossfade layer gains (and nudge the root), so transitions are seamless and cheap.
// Created lazily by the AudioManager once audio is unlocked; all nodes live under the
// music bus, so the master mute/volume and the music toggle govern it.

export type MusicScene = 'menu' | 'prep' | 'combat' | 'won' | 'lost';

// Per-scene: root frequency (Hz) and combat intensity (0 calm … 1 dense).
const SCENES: Record<MusicScene, { root: number; intensity: number }> = {
  menu: { root: 110, intensity: 0.0 }, // A2
  prep: { root: 110, intensity: 0.15 },
  combat: { root: 110, intensity: 1.0 },
  won: { root: 146.83, intensity: 0.1 }, // D3 — brighter
  lost: { root: 82.41, intensity: 0.05 }, // E2 — darker, sparse
};

export class MusicEngine {
  private started = false;
  private drone!: OscillatorNode;
  private fifth!: OscillatorNode;
  private padGain!: GainNode;
  private combat!: OscillatorNode;
  private combatGain!: GainNode;
  private pulseLfo!: OscillatorNode;
  private pulseDepth!: GainNode;

  constructor(private ctx: AudioContext, private out: GainNode) {}

  private start(): void {
    if (this.started) return;
    const { ctx, out } = this;
    const t = ctx.currentTime;

    // Drone + a fifth above → a calm, open bed (triangles are soft).
    this.drone = ctx.createOscillator();
    this.drone.type = 'triangle';
    this.fifth = ctx.createOscillator();
    this.fifth.type = 'sine';
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.18;
    this.drone.connect(this.padGain);
    this.fifth.connect(this.padGain);
    this.padGain.connect(out);

    // Combat layer: a detuned saw through a low-pass, pulsed by a slow LFO (a heartbeat).
    this.combat = ctx.createOscillator();
    this.combat.type = 'sawtooth';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    this.combatGain = ctx.createGain();
    this.combatGain.gain.value = 0.0001; // faded in per scene
    this.combat.connect(lp).connect(this.combatGain);
    this.combatGain.connect(out);
    // LFO → amplitude wobble on the combat layer.
    this.pulseLfo = ctx.createOscillator();
    this.pulseLfo.type = 'sine';
    this.pulseLfo.frequency.value = 2.2;
    this.pulseDepth = ctx.createGain();
    this.pulseDepth.gain.value = 0.06;
    this.pulseLfo.connect(this.pulseDepth).connect(this.combatGain.gain);

    for (const o of [this.drone, this.fifth, this.combat, this.pulseLfo]) o.start(t);
    this.started = true;
  }

  setScene(scene: MusicScene): void {
    this.start();
    const { ctx } = this;
    const t = ctx.currentTime;
    const s = SCENES[scene];
    this.drone.frequency.setTargetAtTime(s.root, t, 0.4);
    this.fifth.frequency.setTargetAtTime(s.root * 1.5, t, 0.4);
    this.combat.frequency.setTargetAtTime(s.root * 2, t, 0.4);
    this.padGain.gain.setTargetAtTime(0.06 + (1 - s.intensity) * 0.14, t, 0.6);
    this.combatGain.gain.setTargetAtTime(0.0001 + s.intensity * 0.14, t, 0.6);
  }

  /** Silence the bed (music toggled off) without tearing down the graph. */
  stop(): void {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    this.padGain.gain.setTargetAtTime(0.0001, t, 0.3);
    this.combatGain.gain.setTargetAtTime(0.0001, t, 0.3);
  }
}
