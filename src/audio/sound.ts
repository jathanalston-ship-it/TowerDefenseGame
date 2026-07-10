// Procedural audio (Web Audio API). Asset-free — every sound is synthesized, so
// it ships with no files and is re-themeable. Created lazily on the first user
// gesture (browser autoplay policy). Pure presentation: the sim emits string
// cues; this turns them into sound. Voice-capped so a swarm can't machine-gun.


type AnyWindow = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;
import { music } from './music';

/** Stings heavy enough to DUCK the score under (depth removed, recovery seconds) —
 *  the mix glue that makes the big moments read as one soundtrack, not two layers. */
const DUCK: Record<string, [number, number]> = {
  mega: [0.45, 1.4], megaDeath: [0.5, 1.8], megaPhase: [0.3, 0.9],
  wpBreak: [0.28, 0.7], splice: [0.3, 0.8], breach: [0.25, 0.6],
};

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
/** Phenotype sfx variants → pitch factors (audible identity shift on the same synth). */
const VARIANT_PITCH: Record<string, number> = { deep: 0.72, crisp: 1.32, wet: 0.86, aetheric: 1.16 };
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
function sMegaAbility(): void { // telegraph riser: tension you can HEAR building — interrupt it
  tone(196, 0.8, 'sawtooth', 0.1, 392); noise(0.7, 0.06, 700, 2600); tone(49, 0.8, 'sine', 0.14);
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
function sMine(): void { // spore-mine burst: wet pop + acid fizz (docs/SOWER.md)
  noise(0.22, 0.16, 1600, 300); tone(180, 0.18, 'sine', 0.2, 70); noise(0.3, 0.06, 5200, 2000);
}
function sDraft(): void { tone(523, 0.12, 'triangle', 0.14); tone(784, 0.3, 'triangle', 0.14); }
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
function sPower(): void { tone(523, 0.07, 'triangle', 0.09, 660); tone(784, 0.12, 'sine', 0.1); tone(1568, 0.22, 'sine', 0.06); }
// Mastery level-up — the CRAFT chime: sPower's softer, lower sibling (expertise, not loot).
function sMastery(): void { tone(392, 0.07, 'triangle', 0.08, 494); tone(587, 0.11, 'sine', 0.09); tone(1175, 0.2, 'sine', 0.045); }
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
      const duck = DUCK[tag];
      if (duck) music.duck(duck[0], duck[1]);
      const d = at < 0 ? 0 : Math.min(1, Math.max(0, (Number(core.slice(at + 1)) - 1) / 4));
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
        case 'mega': sMega(); break;
        case 'megaMaw': sMegaMaw(); break;
        case 'megaChoir': sMegaChoir(); break;
        case 'megaShepherd': sMegaShepherd(); break;
        case 'megaTide': sMegaTide(); break;
        case 'megaTithe': sMegaTithe(); break;
        case 'mine': for (let i = 0; i < Math.min(3, n); i++) sMine(); break;
        case 'megaAbility': sMegaAbility(); break;
        case 'megaPhase': sMegaPhase(); break;
        case 'wpOpen': sWpOpen(); break;
        case 'wpBreak': sWpBreak(); break;
        case 'megaDeath': sMegaDeath(); break;
        case 'draft': sDraft(); break;
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
        case 'power': sPower(); break;
        case 'mastery': sMastery(); break;
        case 'rankup': sRankUp(); break;
        case 'biome': sBiome(); break;
        case 'splice': sSplice(); break;
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
    }
  },
};
