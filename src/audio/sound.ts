// Procedural audio (Web Audio API). Asset-free — every sound is synthesized, so
// it ships with no files and is re-themeable. Created lazily on the first user
// gesture (browser autoplay policy). Pure presentation: the sim emits string
// cues; this turns them into sound. Voice-capped so a swarm can't machine-gun.

import type { BiomeAmbient } from '../core/biomes';

type AnyWindow = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

let enabled = true;
let volume = 0.75;
let voices = 0;
const MAX_VOICES = 28;

// music
let droneOn = false;
let beatAcc = 0;
let killStreak = 0;
let lastKillAt = -10;
// Biome ambient (docs/BIOMES.md) — the drone is RE-VOICED per biome (asset-free): we keep the
// oscillator/filter nodes so `setBiome` can ramp them smoothly on a transition. Default = the
// original Hostile-Frontier drone (so Stage mode sounds exactly as before).
let biomeAmbient: BiomeAmbient = { root: 55, fifth: 82.4, cutoff: 260, wave: 'sawtooth' };
let droneNodes: { osc: OscillatorNode; filter: BiquadFilterNode }[] = [];

function ensure(): boolean {
  if (!enabled) return false;
  if (ctx) return true;
  try {
    const AC = window.AudioContext || (window as AnyWindow).webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(master);
    // one shared noise buffer (0.5s white noise)
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch {
    return false;
  }
  return true;
}

const t = (): number => ctx!.currentTime;

function tone(freq: number, dur: number, type: OscillatorType, peak: number, slideTo?: number): void {
  if (voices >= MAX_VOICES) return;
  const o = ctx!.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t());
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t() + dur);
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.0001, t());
  g.gain.exponentialRampToValueAtTime(peak, t() + Math.min(0.02, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t() + dur);
  o.connect(g);
  g.connect(sfxBus!);
  voices++;
  o.onended = () => { voices = Math.max(0, voices - 1); };
  o.start();
  o.stop(t() + dur + 0.02);
}

function noise(dur: number, peak: number, filterFreq: number, slideTo?: number): void {
  if (voices >= MAX_VOICES || !noiseBuf) return;
  const src = ctx!.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx!.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(filterFreq, t());
  if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, slideTo), t() + dur);
  const g = ctx!.createGain();
  g.gain.setValueAtTime(peak, t());
  g.gain.exponentialRampToValueAtTime(0.0001, t() + dur);
  src.connect(f);
  f.connect(g);
  g.connect(sfxBus!);
  voices++;
  src.onended = () => { voices = Math.max(0, voices - 1); };
  src.start();
  src.stop(t() + dur + 0.02);
}

// ── individual sounds ──
function sHit(i: number): void { noise(0.06, 0.12, 2600 - i * 300); tone(640 - i * 60, 0.05, 'triangle', 0.06); }
function sKill(): void {
  const nowS = performance.now() / 1000;
  if (nowS - lastKillAt > 1.0) killStreak = 0;
  lastKillAt = nowS;
  const semis = Math.min(killStreak, 14);
  tone(330 * Math.pow(2, semis / 12), 0.14, 'sine', 0.16, 520 * Math.pow(2, semis / 12));
  killStreak++;
}
function sShred(): void { tone(900, 0.18, 'sawtooth', 0.14, 180); noise(0.1, 0.07, 3000); }
function sBreach(): void { tone(90, 0.35, 'sine', 0.3, 55); noise(0.3, 0.18, 700); }
function sAbility(): void { noise(0.3, 0.16, 400, 3500); tone(120, 0.4, 'sine', 0.22, 320); }
function sPlace(): void { tone(200, 0.16, 'sine', 0.18, 130); tone(330, 0.1, 'triangle', 0.08); }
function sSelect(): void { tone(520, 0.05, 'square', 0.05); }
function sWave(): void { tone(330, 0.12, 'sawtooth', 0.16); tone(494, 0.22, 'sawtooth', 0.16); }
function sDraft(): void { tone(523, 0.12, 'triangle', 0.14); tone(784, 0.3, 'triangle', 0.14); }
function sHeartbeat(strength: number): void { tone(60, 0.18, 'sine', 0.08 + strength * 0.1, 42); }
// ── progression / reward dopamine cues ──
function sClear(): void { // wave-cleared fanfare (rising major triad)
  tone(392, 0.14, 'triangle', 0.15); tone(523, 0.16, 'triangle', 0.15); tone(659, 0.34, 'triangle', 0.16);
}
function sChest(): void { noise(0.18, 0.16, 900, 300); tone(140, 0.22, 'sine', 0.2, 90); } // lid thunk
let revealStep = 0;
function sReveal(): void { // bright pluck that climbs with each item revealed
  const semis = Math.min(revealStep, 10);
  tone(660 * Math.pow(2, semis / 12), 0.12, 'triangle', 0.12, 990 * Math.pow(2, semis / 12));
  revealStep++;
}
function sJackpot(): void { // rare hero-shard sparkle
  tone(880, 0.1, 'sine', 0.14); tone(1175, 0.1, 'sine', 0.14); tone(1568, 0.34, 'sine', 0.16);
  noise(0.2, 0.05, 6000);
}
function sAchieve(): void { tone(587, 0.14, 'square', 0.1); tone(880, 0.36, 'square', 0.12); } // unlock "ta-da"
// Shard reward stingers — deliberately DISTINCT so the ear, not the text, says which shard landed.
function sShardTower(): void { // Tower Shard — a crisp, glassy crystalline "ting"
  tone(1245, 0.07, 'triangle', 0.1, 1660); tone(1860, 0.16, 'sine', 0.08); noise(0.05, 0.03, 8000);
}
function sShardHero(): void { // Hero Shard — a brighter ASCENDING sparkle, a celebratory "rare get"
  tone(988, 0.08, 'sine', 0.12); tone(1319, 0.08, 'sine', 0.12); tone(1976, 0.3, 'sine', 0.14); noise(0.22, 0.05, 7500);
}

// ── Tower-branch cues (TOWER-BRANCHES.md) — `splice` is the commit moment; the `br_*` tags are
//    each branch's per-shot firing signature. Firing cues are deliberately SHORT + QUIET so a
//    board of mutated towers layers under the hit/kill mix rather than drowning it (voice-capped). ──
function sSplice(): void { // wet, rising graft — the irreversible commitment
  tone(150, 0.22, 'sawtooth', 0.13, 360); tone(80, 0.26, 'sine', 0.12, 190); noise(0.2, 0.1, 1100, 3200);
}
function sDissolve(): void { // tower dissolves into biomass — a wet, DESCENDING melt (the inverse of splice)
  tone(360, 0.26, 'sawtooth', 0.12, 90); tone(190, 0.3, 'sine', 0.1, 70); noise(0.28, 0.12, 2600, 480);
}
function sBrSwarm(): void { noise(0.04, 0.05, 4200); tone(760, 0.05, 'square', 0.035, 980); } // chittering barb volley
function sBrRail(): void { tone(1250, 0.06, 'sawtooth', 0.06, 230); tone(130, 0.11, 'sine', 0.06, 66); } // railgun crack + thud
function sBrSiege(): void { tone(90, 0.16, 'sine', 0.09, 50); noise(0.12, 0.07, 900, 280); } // deep necrotic mortar boom
function sBrAcid(): void { noise(0.16, 0.06, 1800, 600); tone(220, 0.1, 'triangle', 0.03, 130); } // caustic glug + hiss
function sBrVital(): void { tone(66, 0.16, 'sine', 0.08, 46); tone(132, 0.12, 'sine', 0.035, 92); } // warm heart lub-dub
function sBrSpore(): void { noise(0.1, 0.06, 1300, 480); tone(300, 0.09, 'triangle', 0.03, 170); } // wet brood-pod pop
function sBrPlague(): void { noise(0.12, 0.05, 2400, 700); tone(420, 0.07, 'sine', 0.03, 300); } // sick spore spit
function sBrGore(): void { noise(0.07, 0.07, 1500, 400); tone(160, 0.07, 'sawtooth', 0.04, 80); } // vicious wet crunch
function sBrPsi(): void { tone(180, 0.18, 'sine', 0.05, 120); tone(270, 0.16, 'triangle', 0.025, 200); } // ominous psionic hum
function sBrStorm(): void { noise(0.05, 0.05, 5000, 1500); tone(1500, 0.05, 'sawtooth', 0.04, 400); } // crackling neural zap

function startDrone(): void {
  if (droneOn || !ctx || !musicBus) return;
  droneOn = true;
  droneNodes = [];
  const make = (freq: number, detune: number): void => {
    const o = ctx!.createOscillator();
    o.type = biomeAmbient.wave;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = ctx!.createGain();
    g.gain.value = 0.5;
    const f = ctx!.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = biomeAmbient.cutoff;
    o.connect(f);
    f.connect(g);
    g.connect(musicBus!);
    o.start();
    droneNodes.push({ osc: o, filter: f });
  };
  make(biomeAmbient.root, -4); // root
  make(biomeAmbient.fifth, 5); // fifth
}

// Ecosystem-transition sting — an airy rising sweep that says "new biome" (BIOMES.md §5).
function sBiome(): void {
  tone(196, 0.5, 'sine', 0.12, 523); tone(294, 0.55, 'triangle', 0.07, 784); noise(0.4, 0.05, 600, 3200);
}

export const audio = {
  resume(): void {
    if (!ensure() || !ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
  },
  setEnabled(b: boolean): void {
    enabled = b;
    if (master) master.gain.value = b ? volume : 0;
  },
  setVolume(v: number): void {
    volume = Math.max(0, Math.min(1, v));
    if (master) master.gain.value = volume;
  },
  cue(tag: string): void {
    this.cueBatch({ [tag]: 1 });
  },
  cueBatch(counts: Record<string, number>): void {
    if (!ensure()) return;
    for (const tag in counts) {
      const n = counts[tag];
      if (n <= 0) continue;
      switch (tag) {
        case 'hit': for (let i = 0; i < Math.min(3, n); i++) sHit(i); break;
        case 'kill': for (let i = 0; i < Math.min(5, n); i++) sKill(); break;
        case 'shred': for (let i = 0; i < Math.min(2, n); i++) sShred(); break;
        case 'breach': sBreach(); break;
        case 'ability': sAbility(); break;
        case 'place': sPlace(); break;
        case 'select': sSelect(); break;
        case 'wave': sWave(); break;
        case 'draft': sDraft(); break;
        case 'ui': sSelect(); break;
        case 'clear': sClear(); break;
        case 'chest': revealStep = 0; sChest(); break; // resets the reveal pitch ramp
        case 'reveal': sReveal(); break;
        case 'jackpot': sJackpot(); break;
        case 'shard_tower': sShardTower(); break;
        case 'shard_hero': sShardHero(); break;
        case 'achieve': sAchieve(); break;
        case 'biome': sBiome(); break;
        case 'splice': sSplice(); break;
        case 'dissolve': sDissolve(); break;
        case 'br_swarm': for (let i = 0; i < Math.min(2, n); i++) sBrSwarm(); break;
        case 'br_rail': sBrRail(); break;
        case 'br_siege': for (let i = 0; i < Math.min(2, n); i++) sBrSiege(); break;
        case 'br_acid': sBrAcid(); break;
        case 'br_vital': sBrVital(); break;
        case 'br_spore': sBrSpore(); break;
        case 'br_plague': for (let i = 0; i < Math.min(2, n); i++) sBrPlague(); break;
        case 'br_gore': for (let i = 0; i < Math.min(2, n); i++) sBrGore(); break;
        case 'br_psi': sBrPsi(); break;
        case 'br_storm': for (let i = 0; i < Math.min(2, n); i++) sBrStorm(); break;
      }
    }
  },
  /** Run-end musical RESOLUTION (the tension lets go): fade the ambient bed and land a short
   *  cadence — a warm rising major for a win, a somber descending minor for a defeat. One-shot,
   *  played as the battlefield outro begins. */
  resolve(won: boolean): void {
    if (!ensure() || !ctx) return;
    if (musicBus) musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.8); // the drone resolves out
    if (won) {
      [262, 330, 392, 523].forEach((f, i) => setTimeout(() => tone(f, 1.0 + i * 0.18, 'triangle', 0.16), i * 165)); // C–E–G–C
      setTimeout(() => tone(784, 1.5, 'sine', 0.09), 660); // a high shimmer lands it
    } else {
      [330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 1.1 + i * 0.2, 'sine', 0.16, f * 0.97), i * 270)); // descending fall
      setTimeout(() => tone(98, 2.0, 'sine', 0.14, 68), 180); // a low sub underpins the loss
    }
  },
  /** Re-voice the ambient drone for the active biome (docs/BIOMES.md). Smoothly ramps the live
   *  drone's frequencies + filter on a transition; if the drone isn't running yet, the tuning is
   *  applied when it next starts. Cheap + idempotent — safe to call every biome change. */
  setBiome(ambient: BiomeAmbient): void {
    biomeAmbient = { ...ambient };
    if (!ctx || droneNodes.length < 2) return;
    const now = ctx.currentTime;
    droneNodes[0].osc.frequency.setTargetAtTime(ambient.root, now, 0.7);
    droneNodes[1].osc.frequency.setTargetAtTime(ambient.fifth, now, 0.7);
    for (const n of droneNodes) {
      n.filter.frequency.setTargetAtTime(ambient.cutoff, now, 0.7);
      n.osc.type = ambient.wave;
    }
  },
  /** Update the ambient bed; pass null to fade it out. */
  music(pressure: number | null, dt: number): void {
    if (!ensure() || !ctx || !musicBus) return;
    if (pressure === null) {
      musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      return;
    }
    startDrone();
    musicBus.gain.setTargetAtTime(0.05 + pressure * 0.06, ctx.currentTime, 0.6);
    const interval = 1.1 - pressure * 0.55; // heartbeat quickens under pressure
    beatAcc += dt;
    if (beatAcc >= interval) {
      beatAcc = 0;
      sHeartbeat(pressure);
    }
  },
};
