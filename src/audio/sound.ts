// Procedural audio (Web Audio API). Asset-free — every sound is synthesized, so
// it ships with no files and is re-themeable. Created lazily on the first user
// gesture (browser autoplay policy). Pure presentation: the sim emits string
// cues; this turns them into sound. Voice-capped so a swarm can't machine-gun.
//
// The MIX is data (audio/sfxMix.ts, docs/AUDIO.md): every cue belongs to a CATEGORY that owns its
// loudness target, reverb send, per-dispatch variation and voice budget; a measured per-cue trim
// (`npm run audio:audit`) levels it. Signal path, built once per context:
//   voice → category bus ─┬─→ SFX bus → glue compressor → limiter → soft clip → master (volume) → out
//                         └─→ send → one shared procedural reverb → SFX bus


type AnyWindow = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;
import { music } from './music';
import type { StingerId } from './music';
import { feelOf } from '../render/feel';
import { SFX_CATEGORIES, SFX_MASTER, dbToGain, drawVariation, mixOf } from './sfxMix';
import type { CompressorParams, SfxCategory, SfxVariation } from './sfxMix';

// Per-cue DUCK depth + musical STINGER live in the ONE feel table (render/feel.ts FEEL) — the same
// rows GameView reads for shake/hit-stop — so every existing and future call site pays off with
// zero per-site wiring. Stingers are throttled per id (streamy cues like the Power toaster can't
// turn a motif into a siren). Boss deaths ride the sim's `bossFall` cue → its 'bossDown' row.
const STING_COOLDOWN_MS = 6000;
const stingLastAt: Partial<Record<StingerId, number>> = {};

// Power chain (docs/POWER-SCORE.md §feel): the stinger cooldown above stops fanfare spam, but a
// purchase CHAIN must never go quiet — successive gains inside the window climb an ascending
// chime (pitch steps with chain depth, combo-counter style) and reset after a quiet beat.
const POWER_CHAIN_WINDOW_MS = 4000;
let powerChainAt = -1e12;
let powerChain = 0;

// Crits are frequent: a soft "ching" at most once per CRIT_GAP_MS, however many land per frame.
const CRIT_GAP_MS = 90;
let critAt = -1e12;

let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
const catBus = {} as Record<SfxCategory, GainNode>;

let enabled = true;
let volume = 1; // the player's SFX volume (0..1); the designed output level is SFX_MASTER.output
let voices = 0;
const MAX_VOICES = 40;
// Per-category voice budgets (SFX_CATEGORIES[cat].voices): a swarm fills ITS budget, never a reward's.
const catVoices: Record<SfxCategory, number> = { combatFrequent: 0, combatImpact: 0, reward: 0, ui: 0, cinematic: 0, alert: 0, ambient: 0 };
let peakVoices = 0;
let dropped = 0;

// kill-cadence state (pitch ramps on streaks)
let killStreak = 0;
let lastKillAt = -10;

function ensure(): boolean {
  if (!enabled) return false;
  if (ctx) return true;
  try {
    const AC = window.AudioContext || (window as AnyWindow).webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    buildGraph(ctx);
  } catch {
    return false;
  }
  return true;
}

/** The SFX signal path (see the header) — built ONCE per context, never per cue. */
function buildGraph(c: AudioContext): void {
  const M = SFX_MASTER;
  master = c.createGain();
  master.gain.value = M.output * volume;
  master.connect(c.destination);
  const comp = (p: CompressorParams): DynamicsCompressorNode => {
    const n = c.createDynamicsCompressor();
    n.threshold.value = p.threshold; n.knee.value = p.knee; n.ratio.value = p.ratio;
    n.attack.value = p.attack; n.release.value = p.release;
    return n;
  };
  const glue = comp(M.glue); // bus glue: stacked voices sit together
  const limiter = comp(M.limiter); // a swarm wipe can't clip
  const clip = c.createWaveShaper(); // the last-resort ceiling for whatever the limiter's attack lets through
  clip.curve = softClipCurve(M.clipKnee);
  sfxBus = c.createGain();
  sfxBus.gain.value = M.busGain;
  sfxBus.connect(glue); glue.connect(limiter); limiter.connect(clip); clip.connect(master);
  // SPACE: one shared convolver (a generated IR), fed by per-category sends.
  const verb = c.createConvolver();
  verb.buffer = reverbIR(c);
  const ret = c.createGain();
  ret.gain.value = M.reverb.return;
  verb.connect(ret); ret.connect(sfxBus);
  for (const cat of Object.keys(SFX_CATEGORIES) as SfxCategory[]) {
    const bus = c.createGain();
    bus.connect(sfxBus);
    const send = c.createGain();
    send.gain.value = SFX_CATEGORIES[cat].send;
    bus.connect(send); send.connect(verb);
    catBus[cat] = bus;
  }
  // one shared LOOPED noise buffer; every noise voice reads it from a random offset
  noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * NOISE_SECONDS), c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
const NOISE_SECONDS = 2;

/** Linear below `knee`, a tanh shoulder to just under full scale above it (input past ±1 clamps). */
function softClipCurve(knee: number): Float32Array<ArrayBuffer> {
  const n = 2048, out = new Float32Array(new ArrayBuffer(n * 4)), head = 1 - knee;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    out[i] = Math.sign(x) * (a <= knee ? a : knee + head * Math.tanh((a - knee) / head));
  }
  return out;
}

/** A small dark room: decorrelated stereo noise under an exponential decay that darkens as it fades. */
function reverbIR(c: BaseAudioContext): AudioBuffer {
  const R = SFX_MASTER.reverb, sr = c.sampleRate;
  const len = Math.floor(sr * R.seconds), pre = Math.floor(sr * R.preDelay);
  const ir = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const u = (i - pre) / sr;
      const k = R.brightness * (1 - u / R.seconds) + 0.04; // a one-pole low-pass closing over the tail
      lp += k * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.pow(10, (-3 * u) / R.rt60); // −60 dB at rt60
    }
  }
  return ir;
}

const t = (): number => ctx!.currentTime;

// Wardrobe audio packs (docs/COSMETICS.md §wardrobe): a transient family pitch factor applied
// around one cue dispatch — tone()/noise() read it, so EVERY synth in the family re-voices
// without touching each cue function. 1 = classic. Per-unit Phenotype variants win over it.
let wdPitch = 1;

// The MIX around one dispatch (sfxMix.ts) — set by cueBatch from the cue's row and read by every
// voice: the category (bus + voice budget), the level (measured trim × variation), the variation
// pitch and the start jitter. Reset after each dispatch, like wdPitch. `rng` is injectable
// (sfxDev — tests and the audit); null = no variation.
let rng: (() => number) | null = Math.random;
let curCat: SfxCategory = 'ui';
let vGain = 1;
let vPitch = 1;
let vDelay = 0;
const VAR: SfxVariation = { pitch: 1, gain: 1, delay: 0 };

/** Voice admission: the global cap AND the dispatching category's budget. */
function admit(): boolean {
  if (voices >= MAX_VOICES || catVoices[curCat] >= SFX_CATEGORIES[curCat].voices) { dropped++; return false; }
  return true;
}
function track(node: AudioScheduledSourceNode): void {
  const cat = curCat;
  voices++;
  catVoices[cat]++;
  if (voices > peakVoices) peakVoices = voices;
  node.onended = () => { voices = Math.max(0, voices - 1); catVoices[cat] = Math.max(0, catVoices[cat] - 1); };
}
/** Attack → peak → exponential decay to silence at t0 + dur (the voice stops 20 ms later). */
function envelope(g: GainNode, t0: number, peak: number, attack: number, dur: number): void {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.00012, peak * vGain), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

/** One oscillator voice. `at` delays it inside the cue (layers, arpeggios). */
function tone(freq: number, dur: number, type: OscillatorType, peak: number, slideTo?: number, at = 0): void {
  if (!admit()) return;
  const t0 = t() + vDelay + at, pf = wdPitch * vPitch;
  const o = ctx!.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq * pf, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo * pf), t0 + dur);
  const g = ctx!.createGain();
  envelope(g, t0, peak, Math.min(0.02, dur * 0.3), dur);
  o.connect(g);
  g.connect(catBus[curCat]);
  track(o);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

/** One filtered-noise voice. The buffer LOOPS from a random offset, so a layer longer than the
 *  buffer never stops dead (the old 0.5 s buffer cut every longer layer mid-envelope) and no two
 *  hits share the same noise. `type` picks the filter (lowpass body; highpass/bandpass transients). */
function noise(dur: number, peak: number, filterFreq: number, slideTo?: number, at = 0, type: BiquadFilterType = 'lowpass'): void {
  if (!noiseBuf || !admit()) return;
  const t0 = t() + vDelay + at, pf = wdPitch * vPitch;
  const src = ctx!.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx!.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(filterFreq * pf, t0);
  if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, slideTo * pf), t0 + dur);
  const g = ctx!.createGain();
  g.gain.setValueAtTime(Math.max(0.00012, peak * vGain), t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f);
  f.connect(g);
  g.connect(catBus[curCat]);
  track(src);
  src.start(t0, (rng ?? Math.random)() * NOISE_SECONDS);
  src.stop(t0 + dur + 0.02);
}

/** IMPACT weight: a sine kick — a fast pitch drop (2.2× → 1× in ≤ 35 ms) into a sinking sub — with
 *  a 3 ms attack (click-free). The "thump" under deaths, lids and landings. */
function thump(freq: number, dur: number, peak: number, at = 0): void {
  if (!admit()) return;
  const t0 = t() + vDelay + at, pf = wdPitch * vPitch;
  const o = ctx!.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq * 2.2 * pf, t0);
  o.frequency.exponentialRampToValueAtTime(freq * pf, t0 + Math.min(0.035, dur * 0.4));
  o.frequency.exponentialRampToValueAtTime(Math.max(1, freq * 0.62 * pf), t0 + dur);
  const g = ctx!.createGain();
  envelope(g, t0, peak, 0.003, dur);
  o.connect(g);
  g.connect(catBus[curCat]);
  track(o);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

/** Detuned UNISON: two voices ±cents apart — a chorused, wider note at about the pair's level. */
function unison(freq: number, dur: number, type: OscillatorType, peak: number, cents: number, slideTo?: number, at = 0): void {
  const up = Math.pow(2, cents / 1200), dn = 1 / up;
  tone(freq * up, dur, type, peak * 0.62, slideTo && slideTo * up, at);
  tone(freq * dn, dur, type, peak * 0.62, slideTo && slideTo * dn, at);
}

// ── individual sounds ──
// The 2026-11 sound pass rebuilt the most-heard cues as layers (docs/AUDIO.md §cues): a transient
// (the onset you feel), a body (the cue's identity — unchanged pitches and timbres) and weight or a
// tail (a thump under impacts, unison/sparkle on rewards, the shared room on everything).
function sHit(i: number): void { noise(0.06, 0.12, 2600 - i * 300, 1100); tone(640 - i * 60, 0.05, 'triangle', 0.06, 560); thump(150 - i * 12, 0.07, 0.07); }
// Status applications (docs/COMBAT-VISUAL-STANDARDS.md §audio): a wet corruption squelch for
// DoTs/debuffs landing, a crystalline arrest chime for control — quiet, throttled by the view.
function sStatusDot(i: number): void { noise(0.09, 0.07, 900 - i * 120, 320); tone(210 - i * 18, 0.09, 'sawtooth', 0.028, 125); }
function sStatusControl(i: number): void { tone(960 + i * 70, 0.07, 'triangle', 0.045, 1420); tone(480, 0.11, 'sine', 0.028, 640); }
function sKill(): void {
  const nowS = performance.now() / 1000;
  if (nowS - lastKillAt > 1.0) killStreak = 0;
  lastKillAt = nowS;
  const semis = Math.min(killStreak, 14);
  const r = Math.pow(2, semis / 12);
  tone(330 * r, 0.14, 'sine', 0.16, 520 * r);
  tone(660 * r, 0.07, 'triangle', 0.035, 1040 * r); // a bright overtone on the attack — a ping, not a beep
  killStreak++;
}
function sShred(): void { tone(900, 0.18, 'sawtooth', 0.14, 180); noise(0.1, 0.07, 3000); }
function sBreach(): void { tone(90, 0.35, 'sine', 0.3, 55); noise(0.3, 0.18, 700); }
// Per-archetype enemy DEATH timbres (config.enemyDeathCue) — the body-specific IMPACT layered under
// the kill-streak ping. `i` detunes + softens stacked deaths so a swarm-wipe doesn't blow out.
function sEdSquelch(i: number): void { noise(0.11, 0.08 - i * 0.012, 850 - i * 90, 300); tone(190 - i * 12, 0.09, 'sine', 0.045, 110); noise(0.06, 0.05 - i * 0.008, 1300 - i * 100, 400, 0.028); } // soft wet — chaff/support/summoner (a second bubble behind it)
function sEdCrack(i: number): void { noise(0.012, 0.07 - i * 0.01, 4200, undefined, 0, 'highpass'); noise(0.05, 0.12 - i * 0.014, 3200 - i * 250, 900); tone(440 - i * 30, 0.05, 'square', 0.05, 200); } // chitin crack — plated/shielded (a hard transient first)
function sEdScreech(i: number): void { unison(1150 - i * 90, 0.13, 'sawtooth', 0.06, 18, 300); noise(0.09, 0.045, 3800 - i * 300, 1600); } // airy screech — flying (two throats)
function sEdPop(i: number): void { noise(0.08, 0.12 - i * 0.015, 1500 - i * 120, 380); tone(280 - i * 20, 0.06, 'triangle', 0.06, 90); thump(110 - i * 8, 0.09, 0.06 - i * 0.008); } // wet burst — suicide (with a body)
function sEdSplat(i: number): void { noise(0.15, 0.11 - i * 0.012, 680 - i * 60, 200); thump(130 - i * 8, 0.15, 0.07); noise(0.05, 0.04 - i * 0.006, 3000, 900, 0.03); } // deep splat — heavy bruisers (weight, then spatter)
// A soft, addictive ABSORB shimmer as gibs coalesce into the meters (render/gore.ts). Very quiet, a
// gentle rising sine — it reads as "the kill is being assimilated." `i` staggers stacked deaths.
function sAssimilate(i: number): void { tone(540 + i * 70, 0.1, 'sine', 0.032, 960 + i * 90); }
// BASE tower firing timbres (config.towerFireCue) — an unbranched tower was silent; these give each
// firing character its own snap. Quiet + throttled (firing is frequent); `i` detunes stacked shots.
// `vf` = Phenotype firing-variant pitch factor (docs/COSMETICS.md §sfx; 1 = default timbre).
function sTfTick(i: number, vf = 1): void { tone((820 - i * 40) * vf, 0.04, 'square', 0.045, 560 * vf); noise(0.014, 0.04, (3600 - i * 200) * vf, undefined, 0, 'highpass'); thump(190 * vf, 0.045, 0.03); } // kinetic/synaptic snap
function sTfThud(i: number, vf = 1): void { thump((120 - i * 6) * vf, 0.15, 0.11); noise(0.06, 0.07, 480 * vf, 200 * vf); noise(0.012, 0.025, 1800 * vf, undefined, 0, 'bandpass'); } // heavy lob thud (the launch pop on top)
function sTfWet(i: number, vf = 1): void { noise(0.05, 0.06, (1400 - i * 120) * vf, 500 * vf); tone((300 - i * 15) * vf, 0.05, 'triangle', 0.045, 170 * vf); tone((520 - i * 25) * vf, 0.035, 'sine', 0.025, 300 * vf, 0.014); } // wet organic blip (a double bubble)
function sTfZap(i: number, vf = 1): void { unison((640 + i * 45) * vf, 0.07, 'sawtooth', 0.05, 12, 1500 * vf); noise(0.03, 0.03, 5200 * vf); } // psionic zap (detuned — wider, fatter)
function sTfTing(i: number, vf = 1): void { noise(0.006, 0.03, 7000 * vf, undefined, 0, 'highpass'); tone((1400 - i * 60) * vf, 0.09, 'sine', 0.045, 1900 * vf); tone((2050 - i * 80) * vf, 0.06, 'sine', 0.025); } // crystalline ting (a glass tap first)
// IDLE READY (docs/TOWER-IDLE.md §6): a tower's preparation bank fills — a very quiet, wet
// two-note swallow (once per idle cycle by construction; `i` staggers simultaneous banks).
function sPrepReady(i: number): void { tone(340 + i * 30, 0.11, 'sine', 0.026, 520); tone(520 + i * 40, 0.08, 'sine', 0.018, 760); }
// ── LIVING ORGANISM ambience (docs/LIVING-BATTLEFIELD.md §organisms/audio): the quiet
//    per-family murmurs the ambience director rotates through while towers anticipate or
//    breathe deep-idle. DELIBERATELY faint (peaks ≤ ~0.035, well under every combat cue),
//    each a layered one-shot — the throttle in render/organism.ts guarantees no looping.
function sOrgHeart(): void { tone(64, 0.16, 'sine', 0.03, 52); tone(58, 0.13, 'sine', 0.024); }
function sOrgBreath(): void { noise(0.55, 0.014, 900, 500); tone(120, 0.4, 'sine', 0.012, 96); }
function sOrgBone(): void { tone(210, 0.05, 'triangle', 0.028, 140); tone(150, 0.07, 'triangle', 0.02, 96); }
function sOrgAcid(): void { tone(430, 0.06, 'sine', 0.02, 300); tone(560, 0.05, 'sine', 0.016, 380); noise(0.14, 0.008, 2400); }
function sOrgSpore(): void { noise(0.4, 0.012, 3600, 2200); }
function sOrgChirp(): void { tone(880, 0.045, 'triangle', 0.02, 1150); tone(1240, 0.04, 'triangle', 0.014, 990); }
function sOrgHum(): void { tone(96, 0.5, 'sine', 0.018, 102); tone(192, 0.4, 'sine', 0.01); }
/** Phenotype sfx variants → pitch factors (audible identity shift on the same synth). */
const VARIANT_PITCH: Record<string, number> = { deep: 0.72, crisp: 1.32, wet: 0.86, aetheric: 1.16 };

// ── Wardrobe audio packs (docs/COSMETICS.md §wardrobe) — GLOBAL cue-family variants. Each
//    equipped pack re-voices its family through the same VARIANT_PITCH vocabulary. A per-unit
//    Phenotype `~variant` on the tag wins over the global pack (specific beats global).
interface WardrobeCueFamilies { tower?: string; enemy?: string; notif?: string; hero?: string; wave?: string }
let wdFamilies: WardrobeCueFamilies = {};
/** The family the tag belongs to → its equipped variant pitch (1 when nothing is equipped). */
function wardrobeFamilyPitch(tag: string): number {
  const v = tag.startsWith('tfire_') || tag.startsWith('br_') ? wdFamilies.tower
    : tag.startsWith('edie_') || tag === 'kill' ? wdFamilies.enemy
      : tag === 'achieve' || tag === 'reveal' ? wdFamilies.notif
        : tag === 'ability' ? wdFamilies.hero
          : tag === 'wave' || tag === 'clear' ? wdFamilies.wave
            : undefined;
  return v ? VARIANT_PITCH[v] ?? 1 : 1;
}
// ── Hive Siege voices (docs/HIVE-SIEGE.md §audio) ──
function sHiveHit(): void { tone(72, 0.14, 'sine', 0.16, 48); noise(0.07, 0.07, 420, 90); } // a wet chitin THUD — one per landed bite (capped per tick)
function sHiveGroan(): void { // the organism groans as a damage state fails (75/50/25/10%)
  tone(110, 0.9, 'sawtooth', 0.1, 62); tone(74, 1.1, 'sine', 0.14, 46); noise(0.8, 0.05, 260, 60);
}
function sHeartbeat(): void { // lub-DUB at critical integrity (second thump via a slow slide)
  tone(58, 0.12, 'sine', 0.24, 50);
  tone(64, 0.34, 'sine', 0.17, 40);
}
function sAbility(): void { noise(0.3, 0.16, 400, 3500); tone(120, 0.4, 'sine', 0.22, 320); }
function sPlace(): void { thump(200, 0.17, 0.18); tone(330, 0.1, 'triangle', 0.08, 300); noise(0.05, 0.05, 1200, 300); } // the tower SEATS: a thunk into the ground
function sSelect(): void { noise(0.008, 0.03, 4500, undefined, 0, 'highpass'); tone(520, 0.045, 'triangle', 0.05, 490); tone(520, 0.03, 'square', 0.014); } // a tactile click on the same 520 Hz blip, its square edge tamed
function sHover(): void { tone(900, 0.02, 'sine', 0.012, 1200); } // a faint, premium tick as the pointer crosses a control
function sLaunch(): void { tone(196, 0.16, 'sine', 0.15, 392); tone(294, 0.3, 'triangle', 0.09, 440); noise(0.1, 0.045, 1300, 4200); } // a confident "engage" swell on Start Run
function sWave(): void { thump(82, 0.22, 0.12); unison(330, 0.13, 'sawtooth', 0.16, 9); unison(494, 0.26, 'sawtooth', 0.16, 9, undefined, 0.09); } // the horn call: a fifth, "da-DAA", over a drum
function sBoss(): void { // apex-threat sting: falling tritone over a sub thump + hiss swell
  tone(220, 0.5, 'sawtooth', 0.22, 156); tone(156, 0.7, 'sawtooth', 0.16, 110);
  tone(55, 0.6, 'sine', 0.3, 41); noise(0.5, 0.1, 500, 150);
}
function sBossPhase(): void { // boss MUTATION roar: chitin crack + a rising beast-throat sweep — evolution, not injury
  noise(0.2, 0.13, 2800, 400); tone(140, 0.8, 'sawtooth', 0.15, 260);
  tone(93, 0.7, 'sawtooth', 0.1, 175); tone(50, 0.8, 'sine', 0.2, 38);
}
function sNemesisRoar(): void { // the personal hunt RETURNS (docs/NEMESIS.md): a vengeful sub-growl + bent snarl + ragged breath
  tone(46, 1.2, 'sine', 0.34, 29); // deep, sinking sub — it remembers you
  tone(174, 0.7, 'sawtooth', 0.18, 92); tone(116, 0.9, 'sawtooth', 0.12, 58); // a bent, snarling fall
  noise(0.9, 0.12, 700, 110); // ragged breath drawing in
}
// ── Mega Boss suite (docs/MEGA-BOSS.md §audio) — the raid encounter's sonic identity ──
function sMega(): void { // arrival: a continental roar — sub quake + descending double saw + long hiss
  tone(41, 1.6, 'sine', 0.34, 27); tone(110, 1.1, 'sawtooth', 0.2, 55);
  tone(165, 0.9, 'sawtooth', 0.14, 62); noise(1.4, 0.14, 900, 90);
}
function sMegaMaw(): void { // Voraxis theme sting: grinding jaws — low saw chews + bone clicks
  tone(65, 1.0, 'sawtooth', 0.22, 49); tone(98, 0.7, 'square', 0.1, 73);
  noise(0.18, 0.12, 2400); noise(0.18, 0.1, 1800); tone(37, 1.2, 'sine', 0.26, 30);
}
function sMegaChoir(): void { // Meridia theme sting: a hollow choir — detuned fifths swell + shimmer
  tone(220, 1.4, 'triangle', 0.12, 218); tone(330, 1.4, 'triangle', 0.1, 327);
  tone(440, 1.2, 'sine', 0.08, 436); noise(1.2, 0.05, 5200, 2400); tone(55, 1.5, 'sine', 0.2);
}
function sMegaShepherd(): void { // Ossira theme sting: bone chimes over a hollow pastoral drone
  tone(392, 0.5, 'sine', 0.1, 388); tone(587, 0.4, 'sine', 0.08, 583); tone(494, 0.45, 'sine', 0.07);
  noise(0.12, 0.08, 5200); noise(0.12, 0.07, 4300); tone(49, 1.8, 'sine', 0.24, 46); tone(73, 1.6, 'triangle', 0.12, 70);
}
function sMegaTide(): void { // Vesperine theme sting: submerged bells — detuned tolls in slowed air
  tone(311, 1.6, 'sine', 0.12, 308); tone(415, 1.3, 'sine', 0.09, 411); tone(233, 1.8, 'triangle', 0.1, 230);
  noise(1.4, 0.04, 900, 300); tone(52, 2.0, 'sine', 0.22, 49);
}
function sMegaTithe(): void { // Moloch-Ama theme sting: coins into a drum — hollow gold over a greedy pulse
  tone(880, 0.1, 'triangle', 0.1); tone(1174, 0.1, 'triangle', 0.09); tone(740, 0.12, 'triangle', 0.08);
  tone(58, 0.5, 'sine', 0.26, 44); tone(58, 0.5, 'sine', 0.2, 44); noise(0.8, 0.07, 700, 150);
}
function sMegaGorge(): void { // Sarcophage theme + the GORGE itself: wet chewing collapse into a swallowing drone
  noise(0.3, 0.14, 1100, 260); noise(0.24, 0.1, 800, 200);
  tone(120, 0.5, 'sine', 0.16, 52); tone(72, 0.9, 'sawtooth', 0.12, 40); tone(44, 1.1, 'sine', 0.22, 34);
}
function sMegaMyriad(): void { // Myriad theme sting: a detuned answer-cluster resolving into one cold tone
  tone(311, 0.9, 'triangle', 0.09, 308); tone(370, 0.8, 'triangle', 0.08, 366); tone(415, 0.7, 'triangle', 0.07, 412);
  tone(233, 1.4, 'sine', 0.12, 231); noise(1.0, 0.05, 4200, 1400); tone(47, 1.6, 'sine', 0.22, 40);
}
function sMegaStagger(): void { // the TOPPLE: structure gives way — crunch cascade over a falling gong
  noise(0.28, 0.18, 2600, 300); noise(0.4, 0.12, 900, 160);
  tone(196, 0.9, 'sawtooth', 0.14, 65); tone(98, 1.1, 'sine', 0.2, 42); tone(523, 0.5, 'sine', 0.09, 260);
}
function sMegaCataclysm(): void { // the finale LANDS: a full-weight strike into the Hive — brutal and final
  tone(48, 0.9, 'sine', 0.34, 26); tone(90, 0.6, 'sawtooth', 0.2, 38);
  noise(0.7, 0.16, 1600, 120); tone(150, 0.4, 'square', 0.1, 60); noise(0.25, 0.14, 4800, 900);
}
function sMegaAbility(): void { // telegraph riser: tension you can HEAR building — interrupt it
  tone(196, 0.8, 'sawtooth', 0.1, 392); noise(0.7, 0.06, 700, 2600); tone(49, 0.8, 'sine', 0.14);
}
function sMegaCast(): void { // the riser RESOLVES: the strike lands — heavy sub thump + venting hiss
  tone(60, 0.5, 'sine', 0.28, 32); tone(120, 0.3, 'sawtooth', 0.12, 58);
  noise(0.55, 0.1, 3600, 480);
}
function sMegaPhase(): void { // mutation crunch: the organism SHIFTS — wet crack + falling growl
  noise(0.3, 0.16, 3000, 300); tone(180, 0.7, 'sawtooth', 0.18, 90); tone(60, 0.9, 'sine', 0.24, 45);
}
function sWpOpen(): void { // an organ descends: wet dilation + a heartbeat under it
  noise(0.35, 0.1, 1200, 300); tone(70, 0.16, 'sine', 0.2, 55); tone(70, 0.16, 'sine', 0.16, 55);
  tone(523, 0.25, 'sine', 0.06, 660);
}
function sWpBreak(): void { // the rupture payoff: burst + creature shriek + a reward gleam
  noise(0.4, 0.2, 4000, 400); tone(600, 0.35, 'sawtooth', 0.14, 140);
  tone(880, 0.12, 'triangle', 0.12); tone(1175, 0.3, 'sine', 0.12);
  tone(45, 0.5, 'sine', 0.22, 34);
}
function sMegaDeath(): void { // the collapse: a long dying groan, structure failing, final boom
  tone(110, 2.2, 'sawtooth', 0.2, 24); tone(82, 2.0, 'sawtooth', 0.14, 20);
  noise(1.8, 0.14, 2200, 120); tone(30, 2.4, 'sine', 0.32, 18);
  tone(1046, 0.5, 'sine', 0.07, 523); // one thin gleam over the ruin — the reward is coming
}
function sMegaBurrow(): void { // §dormancy: earth swallows / releases the mass — deep soil rumble, no shriek
  tone(42, 1.1, 'sine', 0.22, 26); tone(66, 0.8, 'sawtooth', 0.08, 30);
  noise(0.9, 0.09, 500, 90); noise(0.35, 0.06, 1800, 500);
}
function sMine(): void { // spore-mine burst: wet pop + acid fizz (docs/SOWER.md)
  noise(0.22, 0.16, 1600, 300); tone(180, 0.18, 'sine', 0.2, 70); noise(0.3, 0.06, 5200, 2000);
}
function sDraft(): void { noise(0.03, 0.04, 3000, undefined, 0, 'highpass'); tone(523, 0.12, 'triangle', 0.14); unison(784, 0.3, 'triangle', 0.14, 6, undefined, 0.07); } // the deal: a card flick, then two notes
// GENE PICK (docs/GAME-FEEL.md §draft): the commitment — a wet THUNK, then a riser whose reach and
// shimmer grow with rarity (d = tier depth from the 'draftPick@N' suffix; common 0 … legendary 1).
function sDraftPick(d = 0): void {
  noise(0.08, 0.12, 900, 220); thump(150, 0.18, 0.2); // the thunk
  unison(392, 0.16 + 0.22 * d, 'triangle', 0.08 + 0.04 * d, 7, 784 * (1 + 0.5 * d), 0.035); // the riser, just behind it
  if (d >= 0.5) { tone(1175, 0.3 + 0.2 * d, 'sine', 0.05 * d, 1568, 0.05); noise(0.24, 0.03 * d, 6200, undefined, 0.05); } // epic+ shimmer
}
// A STAGE BOSS FALLS (docs/GAME-FEEL.md §boss kills): crunch + sub boom + a brief rising gleam —
// unmistakably a kill, never the Hive-breach alarm it used to borrow.
function sBossFall(): void {
  noise(0.32, 0.18, 2600, 260); thump(64, 0.75, 0.32); tone(128, 0.4, 'sawtooth', 0.12, 52);
  tone(523, 0.32, 'triangle', 0.07, 1046, 0.1); // the gleam rises out of the crunch
}
// Hero ULT landing (docs/HERO-CINEMATICS.md §impact): a short sub thump + dust under the impact frame.
function sAbilityImpact(): void { tone(70, 0.26, 'sine', 0.24, 38); noise(0.18, 0.1, 1400, 220); }
// Critical hit: a soft, bright "ching" (rate-limited in the dispatcher — crits arrive in bursts).
function sCrit(): void { tone(1568, 0.07, 'sine', 0.05, 2093); tone(2637, 0.05, 'sine', 0.022); }
// Maw REFLUX VOLLEY (docs/STRAIN.md): a wet spit fan — `i` detunes a stacked volley.
function sShot(i: number): void { noise(0.07, 0.07, 1700 - i * 150, 520); tone(260 - i * 20, 0.06, 'triangle', 0.045, 150); }
// Arena match result stings — short, dry, distinct from the run cadences the music owns.
function sVictory(): void { tone(392, 0.12, 'triangle', 0.12); tone(523, 0.12, 'triangle', 0.12); tone(784, 0.4, 'sine', 0.14, 830); }
function sDefeat(): void { tone(330, 0.2, 'triangle', 0.11, 311); tone(262, 0.24, 'triangle', 0.1, 247); tone(98, 0.6, 'sine', 0.16, 70); }
// ── Mulligan graft cues (docs/MULLIGANS.md §audio) — the organism is ALIVE: a soft wet
//    heartbeat under fielded organisms in-run, tissue squelch on socketing a modifier,
//    bone crack + vital swell on an upgrade. All QUIET by design — organic presence. ──
function sGraftPulse(): void { // lub-dub + a faint wet sigh — the graft breathing
  tone(58, 0.14, 'sine', 0.11, 46); tone(58, 0.12, 'sine', 0.08, 44); noise(0.22, 0.02, 600, 200);
}
function sGraftSquelch(): void { // wet tissue seating into the socket
  noise(0.16, 0.09, 1100, 350); tone(120, 0.14, 'sine', 0.09, 66); tone(340, 0.08, 'triangle', 0.04, 220);
}
function sGraftCrack(): void { // bone crack + a rising vital swell — the upgrade takes
  noise(0.06, 0.12, 3400, 900); noise(0.05, 0.09, 2600, 700); tone(90, 0.22, 'sine', 0.1, 210); tone(523, 0.16, 'triangle', 0.06, 660);
}
function sBioStage(): void { // LIVING BATTLEFIELD deepens a stage — a low organic swell + soft rising shimmer (subtle, never abrupt)
  tone(70, 0.55, 'sine', 0.055, 56); tone(210, 0.42, 'sine', 0.03, 300); tone(316, 0.5, 'triangle', 0.024, 430); noise(0.5, 0.012, 480, 150);
}
// ── OPENING CINEMATIC sound design (docs/GAME-FEEL.md §intro) — beat-fired by InitCutscene ──
function sCinPing(): void { // deep-crust radar contact — a cold sonar ping with a phosphor tail
  tone(1180, 0.5, 'sine', 0.07, 1160); tone(2360, 0.22, 'sine', 0.02, 2330);
}
function sCinAlarm(): void { // the signal ERUPTS — a two-note klaxon under static
  tone(620, 0.16, 'square', 0.05, 590); tone(466, 0.24, 'square', 0.05, 440); noise(0.35, 0.03, 2400, 800);
}
function sCinRumble(): void { // the crust groans — a long sub swell (the appetite below)
  tone(38, 1.6, 'sine', 0.12, 33); tone(57, 1.3, 'sine', 0.07, 49); noise(1.5, 0.05, 160, 70);
}
function sCinShriek(): void { // a distant swarm shriek rising out of the rumble
  tone(880, 0.5, 'sawtooth', 0.028, 1900); tone(1320, 0.4, 'sawtooth', 0.018, 2500); noise(0.4, 0.02, 3600, 1800);
}
function sCinCreep(): void { // veins taking steel — wet fibrous creep + a strained groan
  noise(0.7, 0.05, 620, 220); tone(96, 0.65, 'sine', 0.05, 74); tone(340, 0.35, 'triangle', 0.02, 210);
}
function sCinSnap(): void { // a girder gives way — metallic crack + falling ring
  noise(0.06, 0.1, 3600, 1200); tone(520, 0.4, 'triangle', 0.05, 130); tone(1560, 0.2, 'sine', 0.03, 900);
}
function sCinHeart(): void { // the Hive Core's double-thump — the film's pulse (matches the 1.9s visual)
  tone(52, 0.16, 'sine', 0.14, 40); tone(52, 0.13, 'sine', 0.1, 38); noise(0.2, 0.015, 500, 180);
}
function sCinBloom(): void { // regrowth — a warm gathering shimmer (motes spiraling home)
  tone(523, 0.35, 'sine', 0.03, 784); tone(659, 0.3, 'sine', 0.024, 988); tone(392, 0.42, 'triangle', 0.02, 523);
}
function sCinErupt(): void { // a defender bursts out of the ground — a wet organic thud under a rising sinew crack
  tone(70, 0.35, 'sine', 0.13, 44); noise(0.22, 0.07, 900, 200); tone(260, 0.24, 'triangle', 0.04, 620);
}
function sCinFeed(): void { // the swarm breaks on the line — a crunching volley, then the biomass shimmering home
  noise(0.12, 0.08, 2600, 700); tone(180, 0.12, 'square', 0.03, 90); tone(784, 0.3, 'sine', 0.025, 1175);
}
function sCinTitle(): void { // the wordmark lands — a wide dark-major swell with a sub floor
  tone(65, 1.7, 'sine', 0.1, 63); tone(196, 1.4, 'sine', 0.05); tone(247, 1.4, 'sine', 0.045); tone(392, 1.2, 'triangle', 0.035); noise(1.2, 0.02, 900, 300);
}
function sCinCut(): void { // scene cut — a soft air whoosh (never a slam; the score carries the weight)
  noise(0.3, 0.05, 300, 2400); tone(180, 0.2, 'sine', 0.02, 90);
}
function sCinDive(): void { // THE DESCENT — diving into the hive: a long falling sweep into a heartbeat landing
  tone(980, 1.15, 'sine', 0.06, 60); noise(1.1, 0.06, 4200, 240); tone(48, 0.5, 'sine', 0.12, 36);
}
// ── TUTORIAL presentation cues (docs/TUTORIAL.md §4) ──
function sTutStep(): void { // checkpoint complete — a soft affirmative uplink blip
  tone(660, 0.09, 'sine', 0.06, 880); tone(990, 0.12, 'sine', 0.04, 1320);
}
function sTutDone(): void { // graduation — a short rising ceremony (three-step lift + shimmer)
  tone(392, 0.14, 'triangle', 0.09); tone(523, 0.16, 'triangle', 0.09, undefined, 0.09);
  tone(659, 0.3, 'triangle', 0.1, 784, 0.18); tone(1046, 0.4, 'sine', 0.03, 1568, 0.18);
}
// ── progression / reward dopamine cues ──
function sClear(): void { // wave-cleared fanfare (rising major triad, arpeggiated; the top note held wide)
  tone(392, 0.14, 'triangle', 0.15); tone(523, 0.16, 'triangle', 0.15, undefined, 0.075);
  unison(659, 0.4, 'triangle', 0.16, 7, undefined, 0.15); tone(1319, 0.3, 'sine', 0.035, undefined, 0.15);
}
function sChest(): void { noise(0.025, 0.05, 2400, undefined, 0, 'bandpass'); noise(0.18, 0.16, 900, 300); thump(140, 0.24, 0.2); } // latch click + lid thunk
let revealStep = 0;
function sReveal(): void { // bright pluck that climbs with each item revealed (a chorused pluck + its octave sparkle)
  const r = Math.pow(2, Math.min(revealStep, 10) / 12);
  unison(660 * r, 0.13, 'triangle', 0.12, 8, 990 * r); tone(1980 * r, 0.06, 'sine', 0.025);
  revealStep++;
}
function sJackpot(): void { // rare hero-shard sparkle
  tone(880, 0.1, 'sine', 0.14); tone(1175, 0.1, 'sine', 0.14); tone(1568, 0.34, 'sine', 0.16);
  noise(0.2, 0.05, 6000);
}
function sAchieve(): void { tone(587, 0.12, 'square', 0.1); unison(880, 0.36, 'square', 0.12, 6, undefined, 0.1); } // unlock "ta-da"
// Power gain — a short ASCENDING bio-chime (fifth up + octave shimmer): unmistakably "you got
// stronger", quiet enough to layer under reveals (POWER-SCORE.md §feel).
function sPower(chain = 0): void {
  const f = 1 + Math.min(chain, 8) * 0.08; // each chained gain rings a step higher (chain 0 = the base chime)
  tone(523 * f, 0.07, 'triangle', 0.09, 660 * f); tone(784 * f, 0.12, 'sine', 0.1); tone(1568 * f, 0.22, 'sine', 0.06);
}
// Mastery level-up — the CRAFT chime: sPower's softer, lower sibling (expertise, not loot).
function sMastery(): void { tone(392, 0.07, 'triangle', 0.08, 494); tone(587, 0.11, 'sine', 0.09); tone(1175, 0.2, 'sine', 0.045); }
// ── Mastery Evolution Tracks (docs/MASTERY.md §evolution track) — the helix's own voice,
//    kept apart from sMastery (craft) and sJackpot (loot): wet, genetic, strand-like. ──
function sEvoClaim(): void { // nodes bank — a wet double-pluck climbing a fifth (a base pair snaps in)
  tone(494, 0.08, 'triangle', 0.1, 741); tone(741, 0.14, 'sine', 0.1, 988); noise(0.06, 0.03, 5200);
}
function sEvoMilestone(): void { // a ganglion lights — the claim voice over a deep organic bloom
  sEvoClaim(); tone(196, 0.3, 'sine', 0.12, 147); tone(988, 0.26, 'sine', 0.07, 1319);
}
function sEvoPrestige(): void { // EVOLVE — the strand melts down, then re-rises reformed
  tone(660, 0.22, 'sawtooth', 0.09, 220); tone(110, 0.32, 'sine', 0.12, 82);
  tone(330, 0.2, 'triangle', 0.1, 660); tone(660, 0.34, 'sine', 0.1, 1320); noise(0.24, 0.06, 900, 4200);
}
// ── Specimen flips (docs/LOOTBOX.md §opening) — the clutch's own voice. One wet membrane
//    TURN whose body deepens and whose after-ring brightens with rarity (d = tier/4 rides the
//    'flip@N' suffix); commons stay a dry turn, the apex tiers add sJackpot + the 'legendary'
//    stinger ON TOP (cued by the ceremony, throttled by the stinger cooldown). ──
function sFlip(d = 0): void {
  noise(0.05 + 0.05 * d, 0.05 + 0.03 * d, 2600 - 1200 * d, 640);
  tone(236 - 90 * d, 0.09 + 0.05 * d, 'triangle', 0.06 + 0.03 * d, 128);
  if (d > 0) tone(620 + 640 * d, 0.09 + 0.08 * d, 'sine', 0.02 + 0.045 * d, 900 + 900 * d);
}
// ── Reward toast tiers (docs/NOTIFICATIONS.md §reward-toasts) — small/medium/epic voices;
//    legendary placards ride 'jackpot' (and its 'legendary' stinger). Deliberately short +
//    quiet: toasts LAYER under gameplay and merge-bursts tick, never klaxon. ──
function sToast0(): void { // light organic click — the everyday reward
  noise(0.03, 0.04, 3600, 900); tone(520, 0.05, 'triangle', 0.05, 640);
}
function sToast1(): void { // mutation pulse — a worthwhile drop
  tone(392, 0.07, 'triangle', 0.07, 523); tone(784, 0.1, 'sine', 0.055); noise(0.05, 0.03, 5200);
}
function sToast2(): void { // biological resonance — an EPIC arrival blooms
  tone(262, 0.16, 'sine', 0.08, 330); tone(659, 0.12, 'triangle', 0.07, 880);
  tone(1319, 0.22, 'sine', 0.05); noise(0.1, 0.04, 2400, 5200);
}
function sStrandFound(): void { // a NEW strand enters the Archive — wet snap, then a rising helix
  tone(494, 0.07, 'triangle', 0.1, 741); noise(0.07, 0.05, 4600);
  tone(659, 0.1, 'sine', 0.1, 988); tone(988, 0.3, 'sine', 0.09, 1480);
}
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
// Branch cue DEPTH (BRANCH-EVOLUTION.md §3d): a tier intensity d∈[0,1] (tier 1→0 … tier 5→1)
// deepens the synth — pitch sinks (`lo`), the hit gains weight (`up`), and a sub-octave thump
// drops in at the high tiers — so each purchased tier sounds bigger than the last. d=0 reproduces
// the original tier-1 cue exactly.
const lo = (d: number): number => 1 - 0.16 * d; // pitch multiplier (sinks with tier)
const up = (d: number): number => 1 + 0.55 * d; // peak multiplier (louder with tier)
function sub(d: number, freq: number): void { if (d >= 0.5) tone(freq, 0.13, 'sine', 0.05 * d, freq * 0.7); } // capstone weight
function sBrSwarm(d = 0): void { noise(0.04, 0.05 * up(d), 4200 * lo(d)); tone(760 * lo(d), 0.05, 'square', 0.035 * up(d), 980 * lo(d)); sub(d, 150); } // chittering barb volley
function sBrRail(d = 0): void { tone(1250 * lo(d), 0.06, 'sawtooth', 0.06 * up(d), 230); tone(130 * lo(d), 0.11, 'sine', 0.06 * up(d), 66); sub(d, 90); } // railgun crack + thud
function sBrSiege(d = 0): void { tone(90 * lo(d), 0.16, 'sine', 0.09 * up(d), 50); noise(0.12, 0.07 * up(d), 900 * lo(d), 280); sub(d, 60); } // deep necrotic mortar boom
function sBrAcid(d = 0): void { noise(0.16, 0.06 * up(d), 1800 * lo(d), 600); tone(220 * lo(d), 0.1, 'triangle', 0.03 * up(d), 130); } // caustic glug + hiss
function sBrVital(d = 0): void { tone(66 * lo(d), 0.16, 'sine', 0.08 * up(d), 46); tone(132 * lo(d), 0.12, 'sine', 0.035 * up(d), 92); sub(d, 44); } // warm heart lub-dub
function sBrSpore(d = 0): void { noise(0.1, 0.06 * up(d), 1300 * lo(d), 480); tone(300 * lo(d), 0.09, 'triangle', 0.03 * up(d), 170); } // wet brood-pod pop
function sBrPlague(d = 0): void { noise(0.12, 0.05 * up(d), 2400 * lo(d), 700); tone(420 * lo(d), 0.07, 'sine', 0.03 * up(d), 300); } // sick spore spit
function sBrGore(d = 0): void { noise(0.07, 0.07 * up(d), 1500 * lo(d), 400); tone(160 * lo(d), 0.07, 'sawtooth', 0.04 * up(d), 80); sub(d, 70); } // vicious wet crunch
function sBrPsi(d = 0): void { tone(180 * lo(d), 0.18, 'sine', 0.05 * up(d), 120); tone(270 * lo(d), 0.16, 'triangle', 0.025 * up(d), 200); } // ominous psionic hum
function sBrStorm(d = 0): void { noise(0.05, 0.05 * up(d), 5000 * lo(d), 1500); tone(1500 * lo(d), 0.05, 'sawtooth', 0.04 * up(d), 400); sub(d, 110); } // crackling neural zap
function sBrMaw(d = 0): void { noise(0.06, 0.08 * up(d), 900 * lo(d), 260); tone(110 * lo(d), 0.1, 'sawtooth', 0.05 * up(d), 55); sub(d, 65); } // heavy wet jaw crunch
function sBrGullet(d = 0): void { noise(0.14, 0.05 * up(d), 700 * lo(d), 200); tone(85 * lo(d), 0.14, 'sine', 0.05 * up(d), 48); } // dragging undertow glug
function sBrAmber(d = 0): void { tone(980 * lo(d), 0.07, 'triangle', 0.045 * up(d), 640); tone(310 * lo(d), 0.1, 'sine', 0.03 * up(d), 210); sub(d, 95); } // crystalline resin set
function sBrWail(d = 0): void { tone(520 * lo(d), 0.2, 'sine', 0.04 * up(d), 340); tone(392 * lo(d), 0.22, 'triangle', 0.03 * up(d), 260); sub(d, 80); } // mournful psychic wail

// Ecosystem-transition sting — an airy rising sweep that says "new biome" (BIOMES.md §5).
function sBiome(): void {
  tone(196, 0.5, 'sine', 0.12, 523); tone(294, 0.55, 'triangle', 0.07, 784); noise(0.4, 0.05, 600, 3200);
}
// Collection rank promotion (COLLECTION.md) — a triumphant ascending fanfare + shimmer.
function sRankUp(): void {
  tone(523, 0.12, 'triangle', 0.12); tone(659, 0.12, 'triangle', 0.12);
  tone(784, 0.16, 'sine', 0.14); tone(1047, 0.42, 'sine', 0.16); noise(0.28, 0.05, 6500);
}
// NEW SYSTEM UNLOCKED (docs/PROGRESSION-GATING.md §presentation) — the reveal fanfare: a rising
// organic swell into a bright arrival chord. Bigger than sAchieve (a whole WING opened, not one
// feat), distinct from sRankUp's ladder — the ear learns "the game just grew".
function sUnlock(): void {
  tone(330, 0.16, 'triangle', 0.1, 494); // low swell rising a fifth
  tone(659, 0.14, 'square', 0.08, undefined, 0.08);
  unison(988, 0.24, 'sine', 0.12, 6, undefined, 0.16); unison(1319, 0.5, 'sine', 0.14, 6, undefined, 0.16); // the arrival chord blooms
  noise(0.32, 0.045, 7000, undefined, 0.16); // airy shimmer tail
}
// ACCOUNT LEVEL UP (docs/ACCOUNT-LEVEL.md §ceremony) — a warm two-step pulse into a held bloom:
// "the ACCOUNT grew". Softer attack than sUnlock (levels are frequent), unmistakably celebratory.
function sLevelUp(): void {
  tone(440, 0.1, 'triangle', 0.11); tone(554, 0.1, 'triangle', 0.11, undefined, 0.085); // the two-step
  unison(880, 0.38, 'sine', 0.13, 6, 932, 0.17); // held bloom with a gentle upward bend
  noise(0.22, 0.035, 6500, undefined, 0.17);
}
// COMPLETE CLASS ADAPTATION (docs/MULLIGANS.md §adaptations) — the organism SYNCHRONIZES:
// a wet biological snap into a bright rising fifth that locks. Distinct from graftSquelch
// (routine equips) — this is the set-complete moment.
function sAdapt(): void {
  noise(0.09, 0.09, 1400); // the wet snap — tissue locking into place
  tone(392, 0.12, 'triangle', 0.11); tone(587, 0.3, 'sine', 0.13, 622); // the rising fifth, held
  tone(1175, 0.24, 'sine', 0.07); // a thin harmonic sheen on top
}
// GENOME RANK PROMOTION (docs/GENOME-RANK.md §cinematic) — the biggest personal fanfare in the
// kit: a low organic swell under a rising two-step into a held two-voice bloom. Rare by design.
function sPromotion(): void {
  tone(110, 0.5, 'sawtooth', 0.05, 165); // the sub-swell (the organism stirs)
  tone(330, 0.16, 'triangle', 0.1); tone(415, 0.16, 'triangle', 0.1); // rising steps
  tone(523, 0.5, 'sine', 0.13, 587); tone(659, 0.5, 'sine', 0.1, 698); // the held bloom
  noise(0.4, 0.03, 4200);
}

export const audio = {
  resume(): void {
    if (!ensure() || !ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
  },
  setEnabled(b: boolean): void {
    enabled = b;
    if (master) master.gain.value = b ? SFX_MASTER.output * volume : 0;
  },
  /** The player's SFX volume, 0..1 (1 = the designed mix level). */
  setVolume(v: number): void {
    volume = Math.max(0, Math.min(1, v));
    if (master) master.gain.value = enabled ? SFX_MASTER.output * volume : 0;
  },
  cue(tag: string): void {
    this.cueBatch({ [tag]: 1 });
  },
  cueBatch(counts: Record<string, number>): void {
    if (!ensure()) return;
    for (const rawTag in counts) {
      const n = counts[rawTag];
      if (n <= 0) continue;
      // Suffix grammar (game.pushSfx → GameView translate):
      //   'tag@tier'    branch depth d∈[0,1] deepening the synth (BRANCH-EVOLUTION.md §3d)
      //   'tag:kind'    the firing tower's kind (Phenotypes) — untranslated (e.g. the Replay
      //                 Theater) it simply strips to the base cue
      //   'tag~variant' a Phenotype firing variant → a pitch factor on the same synth
      let core = rawTag;
      const colon = core.indexOf(':');
      if (colon >= 0) core = core.slice(0, colon);
      let vf = 1;
      const tilde = core.indexOf('~');
      if (tilde >= 0) {
        vf = VARIANT_PITCH[core.slice(tilde + 1)] ?? 1;
        core = core.slice(0, tilde);
      }
      const at = core.indexOf('@');
      const tag = at < 0 ? core : core.slice(0, at);
      const feel = feelOf(tag);
      // The cue's MIX row (sfxMix.ts): category bus + budget, measured trim, per-dispatch variation.
      const mix = mixOf(tag);
      const cat = SFX_CATEGORIES[mix.cat];
      curCat = mix.cat;
      if (rng) drawVariation(VAR, cat.vary, rng, mix.pitch);
      else { VAR.pitch = 1; VAR.gain = 1; VAR.delay = 0; }
      vPitch = VAR.pitch;
      vGain = VAR.gain * dbToGain(mix.trimDb);
      vDelay = VAR.delay;
      // A FEEL row's duck wins; otherwise a prominent reward/alert dips the score by its category's duck.
      const duck = feel?.duck ?? ((mix.rel ?? 0) > -4 ? cat.duck : undefined);
      if (duck) music.duck(duck[0], duck[1]);
      const sting = feel?.stinger;
      if (sting) {
        const now = Date.now();
        if ((stingLastAt[sting] ?? -1e12) + STING_COOLDOWN_MS <= now) {
          stingLastAt[sting] = now;
          music.stinger(sting);
        }
      }
      const d = at < 0 ? 0 : Math.min(1, Math.max(0, (Number(core.slice(at + 1)) - 1) / 4));
      // Wardrobe pack re-voicing: only when NO per-unit variant rode the tag (vf === 1).
      wdPitch = vf === 1 ? wardrobeFamilyPitch(tag) : 1;
      switch (tag) {
        case 'hit': for (let i = 0; i < Math.min(3, n); i++) sHit(i); break;
        case 'kill': for (let i = 0; i < Math.min(5, n); i++) sKill(); break;
        case 'edie_squelch': for (let i = 0; i < Math.min(4, n); i++) sEdSquelch(i); break;
        case 'edie_crack': for (let i = 0; i < Math.min(4, n); i++) sEdCrack(i); break;
        case 'edie_screech': for (let i = 0; i < Math.min(3, n); i++) sEdScreech(i); break;
        case 'edie_pop': for (let i = 0; i < Math.min(4, n); i++) sEdPop(i); break;
        case 'edie_splat': for (let i = 0; i < Math.min(3, n); i++) sEdSplat(i); break;
        case 'assimilate': for (let i = 0; i < Math.min(3, n); i++) sAssimilate(i); break;
        case 'tfire_tick': for (let i = 0; i < Math.min(3, n); i++) sTfTick(i, vf); break;
        case 'tfire_thud': for (let i = 0; i < Math.min(2, n); i++) sTfThud(i, vf); break;
        case 'tfire_wet': for (let i = 0; i < Math.min(3, n); i++) sTfWet(i, vf); break;
        case 'tfire_zap': for (let i = 0; i < Math.min(3, n); i++) sTfZap(i, vf); break;
        case 'tfire_ting': for (let i = 0; i < Math.min(2, n); i++) sTfTing(i, vf); break;
        case 'tprep_ready': for (let i = 0; i < Math.min(2, n); i++) sPrepReady(i); break;
        case 'org_heart': sOrgHeart(); break;
        case 'org_breath': sOrgBreath(); break;
        case 'org_bone': sOrgBone(); break;
        case 'org_acid': sOrgAcid(); break;
        case 'org_spore': sOrgSpore(); break;
        case 'org_chirp': sOrgChirp(); break;
        case 'org_hum': sOrgHum(); break;
        case 'status_dot': for (let i = 0; i < Math.min(2, n); i++) sStatusDot(i); break;
        case 'status_control': for (let i = 0; i < Math.min(2, n); i++) sStatusControl(i); break;
        case 'shred': for (let i = 0; i < Math.min(2, n); i++) sShred(); break;
        case 'breach': sBreach(); break;
        case 'hiveHit': for (let i = 0; i < Math.min(2, n); i++) sHiveHit(); break;
        case 'hiveGroan': sHiveGroan(); break;
        case 'heartbeat': sHeartbeat(); break;
        case 'ability': sAbility(); break;
        case 'place': sPlace(); break;
        case 'select': sSelect(); break;
        case 'wave': sWave(); break;
        case 'boss': sBoss(); break;
        case 'boss_phase': sBossPhase(); break;
        case 'nemesis_roar': sNemesisRoar(); break;
        case 'mega_cast': sMegaCast(); break;
        case 'mega': sMega(); break;
        case 'megaMaw': sMegaMaw(); break;
        case 'megaChoir': sMegaChoir(); break;
        case 'megaShepherd': sMegaShepherd(); break;
        case 'megaTide': sMegaTide(); break;
        case 'megaTithe': sMegaTithe(); break;
        case 'megaGorge': sMegaGorge(); break;
        case 'megaMyriad': sMegaMyriad(); break;
        case 'megaStagger': sMegaStagger(); break;
        case 'megaCataclysm': sMegaCataclysm(); break;
        case 'mine': for (let i = 0; i < Math.min(3, n); i++) sMine(); break;
        case 'megaAbility': sMegaAbility(); break;
        case 'megaPhase': sMegaPhase(); break;
        case 'wpOpen': sWpOpen(); break;
        case 'wpBreak': sWpBreak(); break;
        case 'megaDeath': sMegaDeath(); break;
        case 'megaBurrow': sMegaBurrow(); break;
        case 'draft': sDraft(); break;
        case 'draftPick': sDraftPick(d); break;
        case 'bossFall': sBossFall(); break;
        case 'abilityImpact': sAbilityImpact(); break;
        case 'crit': {
          const cNow = Date.now();
          if (cNow - critAt >= CRIT_GAP_MS) { critAt = cNow; sCrit(); }
          break;
        }
        case 'shot': for (let i = 0; i < Math.min(2, n); i++) sShot(i); break;
        case 'victory': sVictory(); break;
        case 'defeat': sDefeat(); break;
        case 'graftPulse': sGraftPulse(); break;
        case 'graftSquelch': sGraftSquelch(); break;
        case 'graftCrack': sGraftCrack(); break;
        case 'bioStage': sBioStage(); break;
        case 'cin_ping': sCinPing(); break;
        case 'cin_alarm': sCinAlarm(); break;
        case 'cin_rumble': sCinRumble(); break;
        case 'cin_shriek': sCinShriek(); break;
        case 'cin_creep': sCinCreep(); break;
        case 'cin_snap': sCinSnap(); break;
        case 'cin_heart': sCinHeart(); break;
        case 'cin_bloom': sCinBloom(); break;
        case 'cin_erupt': sCinErupt(); break;
        case 'cin_feed': sCinFeed(); break;
        case 'cin_title': sCinTitle(); break;
        case 'cin_cut': sCinCut(); break;
        case 'cin_dive': sCinDive(); break;
        case 'tut_step': sTutStep(); break;
        case 'tut_done': sTutDone(); break;
        case 'ui': sSelect(); break;
        case 'hover': sHover(); break;
        case 'launch': sLaunch(); break;
        case 'clear': sClear(); break;
        case 'chest': revealStep = 0; sChest(); break; // resets the reveal pitch ramp
        case 'reveal': sReveal(); break;
        case 'jackpot': sJackpot(); break;
        case 'shard_tower': sShardTower(); break;
        case 'shard_hero': sShardHero(); break;
        case 'achieve': sAchieve(); break;
        case 'unlock': sUnlock(); break;
        case 'levelup': sLevelUp(); break;
        case 'promotion': sPromotion(); break;
        case 'adapt': sAdapt(); break;
        case 'power': {
          const pNow = Date.now();
          powerChain = pNow - powerChainAt < POWER_CHAIN_WINDOW_MS ? powerChain + 1 : 0;
          powerChainAt = pNow;
          sPower(powerChain);
          break;
        }
        case 'mastery': sMastery(); break;
        case 'evoClaim': sEvoClaim(); break;
        case 'evoMilestone': sEvoMilestone(); break;
        case 'evoPrestige': sEvoPrestige(); break;
        case 'rankup': sRankUp(); break;
        case 'biome': sBiome(); break;
        case 'splice': sSplice(); break;
        case 'flip': sFlip(d); break;
        case 'strandFound': sStrandFound(); break;
        case 'toast0': sToast0(); break;
        case 'toast1': sToast1(); break;
        case 'toast2': sToast2(); break;
        case 'dissolve': sDissolve(); break;
        case 'br_swarm': for (let i = 0; i < Math.min(2, n); i++) sBrSwarm(d); break;
        case 'br_rail': sBrRail(d); break;
        case 'br_siege': for (let i = 0; i < Math.min(2, n); i++) sBrSiege(d); break;
        case 'br_acid': sBrAcid(d); break;
        case 'br_vital': sBrVital(d); break;
        case 'br_spore': sBrSpore(d); break;
        case 'br_plague': for (let i = 0; i < Math.min(2, n); i++) sBrPlague(d); break;
        case 'br_gore': for (let i = 0; i < Math.min(2, n); i++) sBrGore(d); break;
        case 'br_psi': sBrPsi(d); break;
        case 'br_storm': for (let i = 0; i < Math.min(2, n); i++) sBrStorm(d); break;
        case 'br_maw': for (let i = 0; i < Math.min(2, n); i++) sBrMaw(d); break;
        case 'br_gullet': sBrGullet(d); break;
        case 'br_amber': case 'br_sap': sBrAmber(d); break;
        case 'br_choir': case 'br_malice': sBrWail(d); break;
        case 'br_siphon': sBrStorm(d); break; // Marrow Siphon — a searing drain hum
        case 'br_well': sBrVital(d); break; // Bloodwell — a wet, vital pulse
        case 'br_scatter': for (let i = 0; i < Math.min(2, n); i++) sBrSwarm(d); break; // Spitfang Flechette Storm — a rattling multi-shot
        case 'br_slug': sBrSiege(d); break; // Spitfang Heavy Slug — a heavy AP boom
        case 'br_collapse': sBrPsi(d); break; // Rift Event Horizon — a psionic void pull
        case 'br_annihilate': for (let i = 0; i < Math.min(2, n); i++) sBrStorm(d); break; // Rift Annihilation Core — a roaring crush
      }
      wdPitch = 1; // family re-voicing scopes to one dispatch — never leaks across cues
      vGain = 1; vPitch = 1; vDelay = 0; // …and so does the mix
    }
  },
  /** Install the equipped Wardrobe audio packs (docs/COSMETICS.md §wardrobe). Each value is a
   *  VARIANT_PITCH id ('deep'/'crisp'/'wet'/'aetheric'); undefined = that family stays classic. */
  setWardrobeCues(families: { tower?: string; enemy?: string; notif?: string; hero?: string; wave?: string }): void {
    wdFamilies = families;
  },
};

/** DEV / AUDIT ONLY — never called by the game. Tests and `npm run audio:audit` pin the variation
 *  RNG (null = no variation: the audit's nominal single-cue renders) and read the voice counters. */
export const sfxDev = {
  setRng(fn: (() => number) | null): void { rng = fn; },
  stats(): { voices: number; peakVoices: number; dropped: number } { return { voices, peakVoices, dropped }; },
};
