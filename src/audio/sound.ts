// Procedural audio (Web Audio API). Asset-free — every sound is synthesized, so
// it ships with no files and is re-themeable. Created lazily on the first user
// gesture (browser autoplay policy). Pure presentation: the sim emits string
// cues; this turns them into sound. Voice-capped so a swarm can't machine-gun.


type AnyWindow = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;
import { music } from './music';
import type { StingerId } from './music';
import { feelOf } from '../render/feel';

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

let enabled = true;
let volume = 0.75;
let voices = 0;
const MAX_VOICES = 28;

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
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);
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

// Wardrobe audio packs (docs/COSMETICS.md §wardrobe): a transient family pitch factor applied
// around one cue dispatch — tone()/noise() read it, so EVERY synth in the family re-voices
// without touching each cue function. 1 = classic. Per-unit Phenotype variants win over it.
let wdPitch = 1;

function tone(freq: number, dur: number, type: OscillatorType, peak: number, slideTo?: number): void {
  if (voices >= MAX_VOICES) return;
  const o = ctx!.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq * wdPitch, t());
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo * wdPitch), t() + dur);
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
  f.frequency.setValueAtTime(filterFreq * wdPitch, t());
  if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, slideTo * wdPitch), t() + dur);
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
// Status applications (docs/COMBAT-VISUAL-STANDARDS.md §audio): a wet corruption squelch for
// DoTs/debuffs landing, a crystalline arrest chime for control — quiet, throttled by the view.
function sStatusDot(i: number): void { noise(0.09, 0.07, 900 - i * 120, 320); tone(210 - i * 18, 0.09, 'sawtooth', 0.028, 125); }
function sStatusControl(i: number): void { tone(960 + i * 70, 0.07, 'triangle', 0.045, 1420); tone(480, 0.11, 'sine', 0.028, 640); }
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
// Per-archetype enemy DEATH timbres (config.enemyDeathCue) — the body-specific IMPACT layered under
// the kill-streak ping. `i` detunes + softens stacked deaths so a swarm-wipe doesn't blow out.
function sEdSquelch(i: number): void { noise(0.11, 0.08 - i * 0.012, 850 - i * 90, 300); tone(190 - i * 12, 0.09, 'sine', 0.045, 110); } // soft wet — chaff/support/summoner
function sEdCrack(i: number): void { noise(0.05, 0.12 - i * 0.014, 3200 - i * 250, 900); tone(440 - i * 30, 0.05, 'square', 0.05, 200); } // chitin crack — plated/shielded
function sEdScreech(i: number): void { tone(1150 - i * 90, 0.13, 'sawtooth', 0.06, 300); noise(0.09, 0.045, 3800 - i * 300, 1600); } // airy screech — flying
function sEdPop(i: number): void { noise(0.08, 0.12 - i * 0.015, 1500 - i * 120, 380); tone(280 - i * 20, 0.06, 'triangle', 0.06, 90); } // wet burst — suicide
function sEdSplat(i: number): void { noise(0.15, 0.11 - i * 0.012, 680 - i * 60, 200); tone(130 - i * 8, 0.13, 'sine', 0.06, 65); } // deep splat — heavy bruisers
// A soft, addictive ABSORB shimmer as gibs coalesce into the meters (render/gore.ts). Very quiet, a
// gentle rising sine — it reads as "the kill is being assimilated." `i` staggers stacked deaths.
function sAssimilate(i: number): void { tone(540 + i * 70, 0.1, 'sine', 0.032, 960 + i * 90); }
// BASE tower firing timbres (config.towerFireCue) — an unbranched tower was silent; these give each
// firing character its own snap. Quiet + throttled (firing is frequent); `i` detunes stacked shots.
// `vf` = Phenotype firing-variant pitch factor (docs/COSMETICS.md §sfx; 1 = default timbre).
function sTfTick(i: number, vf = 1): void { tone((820 - i * 40) * vf, 0.04, 'square', 0.045, 560 * vf); noise(0.02, 0.035, (4200 - i * 200) * vf); } // kinetic/synaptic snap
function sTfThud(i: number, vf = 1): void { tone((120 - i * 6) * vf, 0.13, 'sine', 0.11, 58 * vf); noise(0.06, 0.07, 480 * vf, 200 * vf); } // heavy lob thud
function sTfWet(i: number, vf = 1): void { noise(0.05, 0.06, (1400 - i * 120) * vf, 500 * vf); tone((300 - i * 15) * vf, 0.05, 'triangle', 0.045, 170 * vf); } // wet organic blip
function sTfZap(i: number, vf = 1): void { tone((640 + i * 45) * vf, 0.07, 'sawtooth', 0.05, 1500 * vf); noise(0.03, 0.03, 5200 * vf); } // psionic zap
function sTfTing(i: number, vf = 1): void { tone((1400 - i * 60) * vf, 0.09, 'sine', 0.045, 1900 * vf); tone((2050 - i * 80) * vf, 0.06, 'sine', 0.025); } // crystalline ting
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
function sPlace(): void { tone(200, 0.16, 'sine', 0.18, 130); tone(330, 0.1, 'triangle', 0.08); }
function sSelect(): void { tone(520, 0.05, 'square', 0.05); }
function sHover(): void { tone(900, 0.02, 'sine', 0.012, 1200); } // a faint, premium tick as the pointer crosses a control
function sLaunch(): void { tone(196, 0.16, 'sine', 0.15, 392); tone(294, 0.3, 'triangle', 0.09, 440); noise(0.1, 0.045, 1300, 4200); } // a confident "engage" swell on Start Run
function sWave(): void { tone(330, 0.12, 'sawtooth', 0.16); tone(494, 0.22, 'sawtooth', 0.16); }
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
function sDraft(): void { tone(523, 0.12, 'triangle', 0.14); tone(784, 0.3, 'triangle', 0.14); }
// GENE PICK (docs/GAME-FEEL.md §draft): the commitment — a wet THUNK, then a riser whose reach and
// shimmer grow with rarity (d = tier depth from the 'draftPick@N' suffix; common 0 … legendary 1).
function sDraftPick(d = 0): void {
  noise(0.08, 0.12, 900, 220); tone(150, 0.16, 'sine', 0.2, 70); // the thunk
  tone(392, 0.16 + 0.22 * d, 'triangle', 0.08 + 0.04 * d, 784 * (1 + 0.5 * d)); // the riser
  if (d >= 0.5) { tone(1175, 0.3 + 0.2 * d, 'sine', 0.05 * d, 1568); noise(0.24, 0.03 * d, 6200); } // epic+ shimmer
}
// A STAGE BOSS FALLS (docs/GAME-FEEL.md §boss kills): crunch + sub boom + a brief rising gleam —
// unmistakably a kill, never the Hive-breach alarm it used to borrow.
function sBossFall(): void {
  noise(0.32, 0.18, 2600, 260); tone(64, 0.7, 'sine', 0.32, 30); tone(128, 0.4, 'sawtooth', 0.12, 52);
  tone(523, 0.32, 'triangle', 0.07, 1046);
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
  tone(392, 0.14, 'triangle', 0.09); tone(523, 0.16, 'triangle', 0.09); tone(659, 0.3, 'triangle', 0.1, 784); tone(1046, 0.4, 'sine', 0.03, 1568);
}
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
  tone(659, 0.14, 'square', 0.08);
  tone(988, 0.2, 'sine', 0.12); tone(1319, 0.46, 'sine', 0.14); // the arrival chord blooms
  noise(0.32, 0.045, 7000); // airy shimmer tail
}
// ACCOUNT LEVEL UP (docs/ACCOUNT-LEVEL.md §ceremony) — a warm two-step pulse into a held bloom:
// "the ACCOUNT grew". Softer attack than sUnlock (levels are frequent), unmistakably celebratory.
function sLevelUp(): void {
  tone(440, 0.1, 'triangle', 0.11); tone(554, 0.1, 'triangle', 0.11); // the two-step
  tone(880, 0.34, 'sine', 0.13, 932); // held bloom with a gentle upward bend
  noise(0.22, 0.035, 6500);
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
      if (feel?.duck) music.duck(feel.duck[0], feel.duck[1]);
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
    }
  },
  /** Install the equipped Wardrobe audio packs (docs/COSMETICS.md §wardrobe). Each value is a
   *  VARIANT_PITCH id ('deep'/'crisp'/'wet'/'aetheric'); undefined = that family stays classic. */
  setWardrobeCues(families: { tower?: string; enemy?: string; notif?: string; hero?: string; wave?: string }): void {
    wdFamilies = families;
  },
};
