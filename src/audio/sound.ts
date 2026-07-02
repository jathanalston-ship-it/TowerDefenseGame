// Procedural audio (Web Audio API). Asset-free — every sound is synthesized, so
// it ships with no files and is re-themeable. Created lazily on the first user
// gesture (browser autoplay policy). Pure presentation: the sim emits string
// cues; this turns them into sound. Voice-capped so a swarm can't machine-gun.


type AnyWindow = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;
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
function sAbility(): void { noise(0.3, 0.16, 400, 3500); tone(120, 0.4, 'sine', 0.22, 320); }
function sPlace(): void { tone(200, 0.16, 'sine', 0.18, 130); tone(330, 0.1, 'triangle', 0.08); }
function sSelect(): void { tone(520, 0.05, 'square', 0.05); }
function sHover(): void { tone(900, 0.02, 'sine', 0.012, 1200); } // a faint, premium tick as the pointer crosses a control
function sLaunch(): void { tone(196, 0.16, 'sine', 0.15, 392); tone(294, 0.3, 'triangle', 0.09, 440); noise(0.1, 0.045, 1300, 4200); } // a confident "engage" swell on Start Run
function sWave(): void { tone(330, 0.12, 'sawtooth', 0.16); tone(494, 0.22, 'sawtooth', 0.16); }
function sDraft(): void { tone(523, 0.12, 'triangle', 0.14); tone(784, 0.3, 'triangle', 0.14); }
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
      // Branch cues carry a "tag@tier" suffix (game.pushSfx) → a depth d∈[0,1] (tier 1→0 … 5→1)
      // that deepens the synth per tier (BRANCH-EVOLUTION.md §3d). Non-suffixed cues ⇒ d=0, unchanged.
      const at = rawTag.indexOf('@');
      const tag = at < 0 ? rawTag : rawTag.slice(0, at);
      const d = at < 0 ? 0 : Math.min(1, Math.max(0, (Number(rawTag.slice(at + 1)) - 1) / 4));
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
      }
    }
  },
};
