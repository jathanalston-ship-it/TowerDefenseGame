// AUDIO AUDIT (npm run audio:audit) — measure the synthesized SFX instead of guessing at them.
//
// Nobody can listen inside a container, so this renders the REAL audio code offline and measures it:
//   1. bundles src/audio/sound.ts + music.ts (esbuild, the same modules the game ships) into headless
//      Chromium, and drives them ONLY through their public API (audio.cue / cueBatch; music.play) —
//      every render loads a FRESH copy of the modules into a fresh OfflineAudioContext (the page's
//      AudioContext constructor is pointed at it), with Math.random seeded and the clocks the
//      dispatcher's throttles read (Date.now / performance.now) pinned to the render clock. Black-box
//      on purpose: the same tool measures any revision, so a before/after is apples to apples.
//   2. renders EVERY cue the dispatcher knows (the `case` labels of sound.ts) and reports per cue:
//      sample peak (dBFS), loudness (momentary-max LUFS: 400 ms K-weighted, BS.1770 filters),
//      duration, CLIPPING (|x| > 1), HARD STOPS (the envelope falls ≥ 30 dB inside 1 ms) and
//      TRUNCATED VOICES (a noise buffer that runs out before its own stop() — the energy still
//      sounding at the cut is the click you hear).
//   3. renders the STRESS mix (a swarm wipe: 40 kills + 30 shots + 20 hits inside 1 s, a boss death
//      on top) → peak / clipping / limiter behaviour + nodes created per second (CPU note), the opening
//      FILM's cue sequence and a COMBAT MONTAGE over the music bed (the score rendered into the same
//      offline context, like the speakers sum the two engines), plus the music bed alone (reference).
//   4. writes WAVs (+ MP3 audition files with --mp3) to --out and the report to docs/AUDIO_REPORT.md.
//
// Options:
//   --out <dir>         where WAVs/MP3s/results.json go (default: $TMPDIR/assimilation-audio-audit)
//   --label <name>      a name for this run (e.g. before / after), printed in the report
//   --baseline <json>   a previous run's results.json → before/after columns in the report
//   --mp3               also encode the audition set (key cues, film, montage, stress) with ffmpeg
//   --only <a,b,…>      render only these cues (fast iteration; implies --no-report)
//   --no-report         don't write docs/AUDIO_REPORT.md
//   --suggest           print the trim table the measurement suggests (paste into src/audio/sfxMix.ts)
// Docs: docs/AUDIO.md §audit.

import { chromium, type Page } from 'playwright-core';
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromePath } from './chromePath';
import { CUE_MIX, SFX_CATEGORIES, mixOf, type SfxCategory } from '../src/audio/sfxMix';

const args = process.argv.slice(2).filter((a) => a !== '--');
const flag = (n: string): boolean => args.includes(`--${n}`);
const opt = (n: string): string | undefined => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const ROOT = new URL('..', import.meta.url).pathname;
/** The checkout whose src/audio is rendered (default: this one) — point it at a `git worktree` of an
 *  older revision to measure a baseline with the same tool. */
const SRC = opt('src') ?? ROOT;
const OUT = opt('out') ?? join(tmpdir(), 'assimilation-audio-audit');
const LABEL = opt('label') ?? 'current';
const ONLY = opt('only')?.split(',').filter(Boolean);
const SR = 48000;
const CUE_SECONDS = 5; // long enough for the longest cue (~2.4 s) plus a reverb tail

// ───────────────────────────── the cue list (what the dispatcher knows) ─────────────────────────────
const soundSrc = readFileSync(join(SRC, 'src/audio/sound.ts'), 'utf8');
const CASES = [...new Set([...soundSrc.matchAll(/case '([\w-]+)':/g)].map((m) => m[1]))];
/** Depth-suffixed variants worth hearing on their own (draft rarity, specimen tier, branch capstone). */
const VARIANTS = ['draftPick@5', 'flip@5', 'br_rail@5', 'br_siege@5'];

/** The audition set — the most-heard sounds of a first hour, in a fixed order (same names before/after). */
const AUDITION = [
  'tfire_tick', 'tfire_thud', 'tfire_wet', 'tfire_zap', 'tfire_ting', 'hit', 'kill', 'edie_squelch', 'edie_crack',
  'edie_pop', 'edie_splat', 'crit', 'select', 'hover', 'place', 'wave', 'clear', 'draft', 'draftPick', 'draftPick@5',
  'chest', 'reveal', 'levelup', 'unlock', 'boss', 'bossFall', 'breach', 'cin_rumble', 'cin_title', 'cin_dive',
];

// ───────────────────────────── the page runtime (plain JS, runs in Chromium) ─────────────────────────────
const PAGE_RUNTIME = String.raw`
(() => {
  const SR = ${SR};
  const counts = { osc: 0, src: 0, gain: 0, filter: 0, other: 0 };
  const P = BaseAudioContext.prototype;
  const wrap = (name, key) => { const f = P[name]; if (!f) return; P[name] = function (...a) { counts[key]++; return f.apply(this, a); }; };
  wrap('createOscillator', 'osc'); wrap('createBufferSource', 'src'); wrap('createGain', 'gain'); wrap('createBiquadFilter', 'filter');
  for (const n of ['createDynamicsCompressor', 'createConvolver', 'createWaveShaper', 'createStereoPanner', 'createDelay']) wrap(n, 'other');
  // Buffer-source bookkeeping: a non-looping buffer shorter than its own stop() is a TRUNCATED voice.
  const plays = [];
  const S = AudioBufferSourceNode.prototype;
  const st = S.start, sp = S.stop;
  S.start = function (when = 0, offset = 0, ...rest) { this.__w = Math.max(when, this.context.currentTime); this.__o = offset; return st.call(this, when, offset, ...rest); };
  let heal = false; // differential measurement: let a short buffer LOOP to its stop() — the difference is the cut-off tail
  S.stop = function (when = 0) {
    const len = this.buffer ? this.buffer.duration : 0;
    plays.push({ start: this.__w || 0, offset: this.__o || 0, stop: when, loop: !!this.loop, len });
    if (heal && !this.loop && (this.__w || 0) + len - (this.__o || 0) < when - 0.002) this.loop = true;
    return sp.call(this, when);
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const seed = (s) => { let a = s >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const b64 = (f32) => { const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const realNow = performance.now.bind(performance), realDate = Date.now, realRandom = Math.random;
  window.__render = async (spec) => {
    seed(spec.seed);
    heal = !!spec.heal;
    const ctx = new OfflineAudioContext(2, Math.ceil(spec.seconds * SR), SR);
    const resume = OfflineAudioContext.prototype.resume.bind(ctx);
    ctx.resume = () => Promise.resolve(); // the engines' own autoplay resume() must not restart a suspended render
    window.AudioContext = function () { return ctx; };
    window.webkitAudioContext = undefined;
    performance.now = () => ctx.currentTime * 1000;
    Date.now = () => 1.7e12 + ctx.currentTime * 1000;
    for (const k in counts) counts[k] = 0;
    plays.length = 0;
    (0, eval)(window.__bundle); // a FRESH copy of sound.ts + music.ts → globalThis.__audit
    const A = globalThis.__audit;
    if (A.dev && spec.nominal) A.dev.setRng(null); // nominal = no per-dispatch variation (single-cue metrics)
    A.audio.resume(); // the context is born at t = 0, as the game's first gesture creates it — the pre-roll lets it settle
    if (!spec.music) A.music.setEnabled(false);
    const fire = (e) => {
      if (e.kind === 'cue') A.audio.cue(e.tag);
      else if (e.kind === 'batch') A.audio.cueBatch(e.counts);
      else if (e.kind === 'music') A.music.play(e.category, { trackId: e.trackId, force: true });
      else if (e.kind === 'intensity') A.music.setIntensity(e.v);
    };
    // One suspend per render quantum: events grouped by time; the score's lookahead scheduler runs on
    // a real setInterval, so music renders pause at "pump" points long enough for it to tick.
    const q = (t) => Math.round((t * SR) / 128) * 128 / SR;
    const at = new Map();
    const slot = (t) => { const k = q(t); if (!at.has(k)) at.set(k, { evs: [], pump: false }); return at.get(k); };
    for (const e of spec.events) slot(e.t).evs.push(e);
    if (spec.music) for (let t = 0.25; t < spec.seconds; t += 0.25) slot(t).pump = true;
    let musicStarted = false;
    for (const [t, s] of at) {
      if (t <= 0) { for (const e of s.evs) { fire(e); if (e.kind === 'music') musicStarted = true; } continue; }
      ctx.suspend(t).then(async () => {
        let needsTick = s.pump;
        for (const e of s.evs) { fire(e); if (e.kind === 'music') needsTick = true; }
        if (needsTick) await sleep(60);
        resume();
      });
    }
    if (musicStarted) await sleep(80);
    const buf = await ctx.startRendering();
    performance.now = realNow; Date.now = realDate; Math.random = realRandom;
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    let last = 0;
    for (let i = L.length - 1; i >= 0; i--) if (Math.abs(L[i]) > 1e-6 || Math.abs(R[i]) > 1e-6) { last = i; break; }
    const n = Math.min(L.length, last + 2400);
    return { l: b64(L.subarray(0, n)), r: b64(R.subarray(0, n)), n, counts: { ...counts }, plays: plays.slice(), dev: A.dev && A.dev.stats ? A.dev.stats() : null };
  };
})();
`;

// ───────────────────────────── measurement (node side) ─────────────────────────────
type Ev = { t: number; kind: 'cue'; tag: string } | { t: number; kind: 'batch'; counts: Record<string, number> }
  | { t: number; kind: 'music'; category: string; trackId?: string } | { t: number; kind: 'intensity'; v: number };
interface Spec { seconds: number; seed: number; events: Ev[]; music: boolean; nominal: boolean; heal?: boolean }
interface Play { start: number; offset: number; stop: number; loop: boolean; len: number }
interface Rendered { l: Float32Array; r: Float32Array; counts: Record<string, number>; plays: Play[]; dev: { dropped: number; peakVoices: number } | null }

const dB = (x: number): number => (x > 0 ? 20 * Math.log10(x) : -200);
const pow2dB = (p: number): number => (p > 0 ? 10 * Math.log10(p) : -200);

function f32(b64: string): Float32Array {
  const b = Buffer.from(b64, 'base64');
  const out = new Float32Array(b.length / 4);
  new Uint8Array(out.buffer).set(b);
  return out;
}

/** Every render creates the context at t = 0 and runs PRE seconds of silence before the first event,
 *  then drops it: Chromium's DynamicsCompressor starts from a fully-attenuated detector and needs
 *  ~0.2 s to settle (sound.ts keeps it processing through silence), so the pre-roll measures the
 *  steady state — what every cue but the very first one after the autoplay unlock meets.
 *  0.32 s = a whole number of render quanta. */
const PRE = 0.32;
async function render(page: Page, spec: Spec): Promise<Rendered> {
  const shifted: Spec = { ...spec, seconds: spec.seconds + PRE, events: spec.events.map((e) => ({ ...e, t: e.t + PRE })) };
  const r = await page.evaluate((s) => (window as unknown as { __render: (s: unknown) => Promise<{ l: string; r: string; counts: Record<string, number>; plays: Play[]; dev: Rendered['dev'] }> }).__render(s), shifted);
  const head = Math.round(PRE * SR);
  const l = f32(r.l), rr = f32(r.r);
  return {
    l: l.subarray(Math.min(head, l.length)), r: rr.subarray(Math.min(head, rr.length)), counts: r.counts,
    plays: r.plays.map((p) => ({ ...p, start: p.start - PRE, stop: p.stop - PRE })), dev: r.dev,
  };
}

// BS.1770 K-weighting at 48 kHz (pre-filter shelf + RLB high-pass), direct form I.
const K_SHELF = { b: [1.53512485958697, -2.69169618940638, 1.19839281085285], a: [-1.69065929318241, 0.73248077421585] };
const K_HP = { b: [1, -2, 1], a: [-1.99004745483398, 0.99007225036621] };
function biquad(x: Float32Array | Float64Array, c: { b: number[]; a: number[] }): Float64Array {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = c.b[0] * x[i] + c.b[1] * x1 + c.b[2] * x2 - c.a[0] * y1 - c.a[1] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
/** Prefix sums of K-weighted energy, summed over both channels. */
function kEnergy(l: Float32Array, r: Float32Array): Float64Array {
  const kl = biquad(biquad(l, K_SHELF), K_HP), kr = biquad(biquad(r, K_SHELF), K_HP);
  const p = new Float64Array(l.length + 1);
  for (let i = 0; i < l.length; i++) p[i + 1] = p[i] + kl[i] * kl[i] + kr[i] * kr[i];
  return p;
}
/** Max loudness over a sliding window (0.4 s = momentary, 3 s = short-term), zero-padded past the end. */
function maxLoudness(p: Float64Array, winS: number): number {
  const n = p.length - 1, W = Math.round(winS * SR), hop = Math.round(0.01 * SR);
  let best = 0;
  for (let s = 0; s === 0 || s + W <= n; s += hop) best = Math.max(best, (p[Math.min(n, s + W)] - p[s]) / W);
  return -0.691 + pow2dB(best);
}
/** Gated integrated loudness (BS.1770-4: 400 ms blocks, 75 % overlap, −70 abs / −10 rel gates). */
function integrated(p: Float64Array): number {
  const n = p.length - 1, W = Math.round(0.4 * SR), hop = Math.round(0.1 * SR);
  const blocks: number[] = [];
  for (let s = 0; s + W <= n; s += hop) blocks.push((p[s + W] - p[s]) / W);
  const abs = blocks.filter((z) => -0.691 + pow2dB(z) > -70);
  if (!abs.length) return -200;
  const relGate = -0.691 + pow2dB(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const rel = abs.filter((z) => -0.691 + pow2dB(z) > relGate);
  return -0.691 + pow2dB(rel.reduce((a, b) => a + b, 0) / rel.length);
}

interface Metrics {
  peakDb: number; lufsM: number; lufsS: number; lufsI: number; durS: number; clipped: number;
  hardStops: number; truncated: number; truncLostDb: number | null;
  /** Share of the cue's intended energy that the truncation removes (0..1). */
  truncShare: number;
  /** Longest stretch of a voice's envelope that never plays because its buffer ran out (s). */
  truncMissingS: number;
}
function measure(x: Rendered, healed?: Rendered): Metrics {
  const { l, r } = x;
  const n = l.length;
  let peak = 0, clipped = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(Math.abs(l[i]), Math.abs(r[i]));
    if (a > peak) peak = a;
    if (a > 1) clipped++;
  }
  const p = kEnergy(l, r);
  // envelope in 1 ms blocks (max of the two channels' mean square)
  const B = SR / 1000, nb = Math.floor(n / B);
  const env = new Float64Array(nb);
  for (let k = 0; k < nb; k++) {
    let sl = 0, sr = 0;
    for (let i = k * B; i < (k + 1) * B; i++) { sl += l[i] * l[i]; sr += r[i] * r[i]; }
    env[k] = pow2dB(Math.max(sl, sr) / B);
  }
  const peakDb = dB(peak);
  const thr = Math.max(peakDb - 60, -80);
  let lastK = 0;
  for (let k = nb - 1; k >= 0; k--) if (env[k] > thr) { lastK = k; break; }
  let hardStops = 0;
  for (let k = 0; k + 2 < nb; k++) if (env[k] > -60 && env[k + 1] < env[k] - 30 && env[k + 2] < env[k] - 30) hardStops++;
  // truncated voices (structural): a non-looping buffer that runs out before its own stop()
  let truncated = 0, truncMissingS = 0;
  for (const pl of x.plays) {
    const end = pl.start + (pl.len - pl.offset);
    if (pl.loop || end >= pl.stop - 0.002) continue;
    truncated++;
    truncMissingS = Math.max(truncMissingS, pl.stop - 0.02 - end); // noise() stops 20 ms after its envelope ends
  }
  // the energy still sounding at the cut: RMS of (healed − as-rendered) over the 5 ms after each cut
  let truncLost: number | null = null, truncShare = 0;
  if (healed && truncated) {
    for (const pl of x.plays) {
      const end = pl.start + (pl.len - pl.offset);
      if (pl.loop || end >= pl.stop - 0.002) continue;
      const c0 = Math.round(end * SR), w = Math.round(0.005 * SR);
      let e = 0;
      for (let i = c0; i < c0 + w; i++) {
        const dl = (healed.l[i] ?? 0) - (l[i] ?? 0), dr = (healed.r[i] ?? 0) - (r[i] ?? 0);
        e += Math.max(dl * dl, dr * dr);
      }
      const lost = pow2dB(e / w);
      truncLost = truncLost === null ? lost : Math.max(truncLost, lost);
    }
    // share of the K-weighted (perceived) energy the cut removes
    const m = healed.l.length, dl = new Float32Array(m), dr = new Float32Array(m);
    for (let i = 0; i < m; i++) { dl[i] = healed.l[i] - (l[i] ?? 0); dr[i] = healed.r[i] - (r[i] ?? 0); }
    const eh = kEnergy(healed.l, healed.r)[m], ed = kEnergy(dl, dr)[m];
    truncShare = eh > 0 ? ed / eh : 0;
  }
  return {
    peakDb, lufsM: maxLoudness(p, 0.4), lufsS: maxLoudness(p, 3), lufsI: integrated(p), durS: (lastK + 1) / 1000, clipped,
    hardStops, truncated, truncLostDb: truncLost, truncShare, truncMissingS,
  };
}

function writeWav(path: string, l: Float32Array, r: Float32Array): void {
  const n = l.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  // what the speakers get: the destination clamps to ±1
  const s16 = (v: number): number => Math.round(Math.max(-1, Math.min(1, v)) * 32767);
  for (let i = 0; i < n; i++) { buf.writeInt16LE(s16(l[i]), 44 + i * 4); buf.writeInt16LE(s16(r[i]), 46 + i * 4); }
  writeFileSync(path, buf);
}
const mp3 = (wav: string, out: string): void => {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-q:a', '2', out]);
};

// ───────────────────────────── scenarios ─────────────────────────────
/** A deterministic LCG for scenario authoring (node side — independent of the page's seeded random). */
function lcg(seed: number): () => number { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const FIRE = ['tfire_tick', 'tfire_thud', 'tfire_wet', 'tfire_zap', 'tfire_ting'];
const DEATH = ['edie_squelch', 'edie_crack', 'edie_pop', 'edie_splat', 'edie_screech'];
/** Collapse (t, tag) hits into one cueBatch per 60 fps frame — exactly how GameView drains the sim. */
function frames(hits: { t: number; tag: string }[]): Ev[] {
  const by = new Map<number, Record<string, number>>();
  for (const h of hits) {
    const f = Math.round(h.t * 60);
    const m = by.get(f) ?? {};
    m[h.tag] = (m[h.tag] ?? 0) + 1;
    by.set(f, m);
  }
  return [...by].map(([f, counts]) => ({ t: f / 60, kind: 'batch', counts }));
}
/** The swarm wipe: 40 kills + 30 shots + 20 hits inside 1 s (each kill = ping + body death + absorb). */
function swarm(t0: number, rnd: () => number, k = 40, s = 30, h = 20): { t: number; tag: string }[] {
  const out: { t: number; tag: string }[] = [];
  for (let i = 0; i < k; i++) { const t = t0 + rnd(); out.push({ t, tag: 'kill' }, { t, tag: DEATH[i % DEATH.length] }, { t: t + 0.05, tag: 'assimilate' }); }
  for (let i = 0; i < s; i++) out.push({ t: t0 + rnd(), tag: FIRE[i % FIRE.length] });
  for (let i = 0; i < h; i++) out.push({ t: t0 + rnd(), tag: 'hit' });
  return out;
}
function stressSpec(scale = 1): Spec {
  const rnd = lcg(7);
  const ev = frames(swarm(0.1, rnd, 40 * scale, 30 * scale, 20 * scale));
  ev.push({ t: 0.6, kind: 'cue', tag: 'bossFall' });
  return { seconds: 3.5, seed: 11, events: ev, music: false, nominal: false };
}
/** ~21 s of a first-hour wave over the combat bed: steady fire → a boss → a wipe → the reward chain. */
function montageSpec(): Spec {
  const rnd = lcg(3);
  const hits: { t: number; tag: string }[] = [];
  const steady = (a: number, b: number, rate: number): void => {
    for (let t = a; t < b; t += 1 / rate) {
      hits.push({ t: t + rnd() * 0.05, tag: FIRE[Math.floor(rnd() * FIRE.length)] });
      if (rnd() < 0.55) hits.push({ t: t + 0.12, tag: 'hit' });
      if (rnd() < 0.22) { const tk = t + 0.15; hits.push({ t: tk, tag: 'kill' }, { t: tk, tag: DEATH[Math.floor(rnd() * DEATH.length)] }, { t: tk + 0.3, tag: 'assimilate' }); }
      if (rnd() < 0.05) hits.push({ t: t + 0.12, tag: 'crit' });
      if (rnd() < 0.04) hits.push({ t: t + 0.1, tag: 'status_dot' });
    }
  };
  steady(1.6, 8.6, 6);
  steady(9.4, 11.0, 9);
  hits.push(...swarm(11.0, rnd, 24, 18, 14));
  const ev: Ev[] = [
    { t: 0, kind: 'music', category: 'combat', trackId: 'combat_strain' }, { t: 0, kind: 'intensity', v: 0.45 },
    { t: 0.3, kind: 'cue', tag: 'launch' }, { t: 1.1, kind: 'cue', tag: 'wave' },
    { t: 4.0, kind: 'cue', tag: 'place' }, { t: 6.2, kind: 'cue', tag: 'ability' },
    { t: 8.7, kind: 'cue', tag: 'boss' }, { t: 8.7, kind: 'intensity', v: 0.9 },
    { t: 11.6, kind: 'cue', tag: 'bossFall' }, { t: 12.6, kind: 'cue', tag: 'clear' }, { t: 12.6, kind: 'intensity', v: 0.35 },
    { t: 13.6, kind: 'cue', tag: 'draft' }, { t: 15.0, kind: 'cue', tag: 'draftPick@3' },
    { t: 16.0, kind: 'cue', tag: 'chest' }, { t: 16.5, kind: 'cue', tag: 'reveal' }, { t: 16.9, kind: 'cue', tag: 'reveal' },
    { t: 17.3, kind: 'cue', tag: 'reveal' }, { t: 17.8, kind: 'cue', tag: 'jackpot' }, { t: 18.8, kind: 'cue', tag: 'levelup' },
    { t: 19.9, kind: 'cue', tag: 'unlock' },
    ...frames(hits),
  ];
  return { seconds: 23, seed: 5, events: ev, music: true, nominal: false };
}
/** The opening film's cue sequence, read from the film's own data (InitCutscene SCENES) — the
 *  receive-tap ping, each scene's beats, the cut whoosh per scene change, the dive out of the title. */
function filmSpec(): Spec {
  const src = readFileSync(join(ROOT, 'src/ui/InitCutscene.tsx'), 'utf8');
  const block = src.slice(src.indexOf('export const SCENES'), src.indexOf('const WORDMARK'));
  const scenes = block.split(/\bid: '/).slice(1).map((s) => ({
    durMs: Number(/durMs: (\d+)/.exec(s)?.[1] ?? 0),
    beats: [...s.matchAll(/\{ at: ([\d.]+), cue: '([\w-]+)'/g)].map((m) => ({ at: Number(m[1]), cue: m[2] })),
  }));
  const ev: Ev[] = [{ t: 0, kind: 'cue', tag: 'cin_ping' }, { t: 0, kind: 'music', category: 'cinema' }, { t: 0, kind: 'intensity', v: 0 }];
  let t0 = 0;
  scenes.forEach((s, i) => {
    if (i > 0) ev.push({ t: t0, kind: 'cue', tag: 'cin_cut' }, { t: t0, kind: 'intensity', v: i / (scenes.length - 1) });
    for (const b of s.beats) ev.push({ t: t0 + b.at, kind: 'cue', tag: b.cue });
    t0 += s.durMs ? s.durMs / 1000 : 4.5; // the title waits for the player — they tap at ~4.5 s
  });
  ev.push({ t: t0, kind: 'cue', tag: 'cin_dive' });
  return { seconds: t0 + 3, seed: 9, events: ev, music: true, nominal: false };
}
/** Repeats: the same frequent cue eight times — machine-gun vs varied. */
function repeatSpec(tag: string, gap: number): Spec {
  return { seconds: 8 * gap + 1.5, seed: 13, events: Array.from({ length: 8 }, (_, i) => ({ t: 0.05 + i * gap, kind: 'cue' as const, tag })), music: false, nominal: false };
}
const musicSpec = (category: string, trackId: string, v: number): Spec => ({
  seconds: 14, seed: 21, events: [{ t: 0, kind: 'music', category, trackId }, { t: 0, kind: 'intensity', v }], music: true, nominal: false,
});

// ───────────────────────────── main ─────────────────────────────
interface CueRow extends Metrics { tag: string; cat: SfxCategory; goal: number; trimDb: number; nodes: number }
interface Results {
  label: string; date: string; cues: CueRow[];
  scenes: Record<string, Metrics & { nodes: number; nodesPerSec?: number; dropped?: number; peakVoices?: number }>;
  /** Montage sections: the SFX alone vs the score alone (ungated LUFS over the section). */
  balance?: { section: string; sfx: number; music: number }[];
}

/** The montage's sections (seconds) — the mix questions the owner asked: does the score sit UNDER
 *  combat, and do rewards cut THROUGH it? */
const MONTAGE_SECTIONS: [string, number, number][] = [['steady combat', 2, 8.6], ['boss + swarm wipe', 8.7, 12.5], ['reward chain', 13.4, 21.5]];
function sectionLoudness(x: Rendered, a: number, b: number): number {
  const p = kEnergy(x.l, x.r), i0 = Math.min(p.length - 1, Math.round(a * SR)), i1 = Math.min(p.length - 1, Math.round(b * SR));
  return -0.691 + pow2dB((p[i1] - p[i0]) / Math.max(1, Math.round((b - a) * SR)));
}

async function main(): Promise<void> {
  mkdirSync(join(OUT, 'wav'), { recursive: true });
  const bundle = await build({
    stdin: {
      contents: "import { audio } from './src/audio/sound'; import * as snd from './src/audio/sound'; import { music } from './src/audio/music';"
        + ' (globalThis as any).__audit = { audio, music, dev: (snd as any).sfxDev ?? null };',
      resolveDir: SRC, loader: 'ts', sourcefile: 'audit-entry.ts',
    },
    bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', logLevel: 'error',
  });
  const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.setContent('<!doctype html><title>audio audit</title>');
    await page.evaluate((src) => { (window as unknown as { __bundle: string }).__bundle = src; }, bundle.outputFiles[0].text);
    await page.addScriptTag({ content: PAGE_RUNTIME });

    const tags = ONLY ?? [...CASES, ...VARIANTS];
    const cues: CueRow[] = [];
    for (const tag of tags) {
      const spec: Spec = { seconds: CUE_SECONDS, seed: 1, events: [{ t: 0, kind: 'cue', tag }], music: false, nominal: true };
      const x = await render(page, spec);
      const cut = x.plays.some((pl) => !pl.loop && pl.start + (pl.len - pl.offset) < pl.stop - 0.002);
      const healed = cut ? await render(page, { ...spec, heal: true }) : undefined;
      const base = tag.replace(/[@~:].*$/, '');
      const row = mixOf(base);
      const nodes = Object.values(x.counts).reduce((a, b) => a + b, 0);
      cues.push({ tag, cat: row.cat, goal: SFX_CATEGORIES[row.cat].targetLufs + (row.rel ?? 0), trimDb: row.trimDb, nodes, ...measure(x, healed) });
      writeWav(join(OUT, 'wav', `${tag.replace(/[@~:]/g, '_')}.wav`), x.l, x.r);
    }
    console.log(`rendered ${cues.length} cues`);

    const scenes: Results['scenes'] = {};
    if (!ONLY) {
      const SCENES: [string, Spec][] = [
        ['stress', stressSpec(1)], ['stress_x2', stressSpec(2)], ['montage', montageSpec()], ['film', filmSpec()],
        ['repeat_tfire_tick', repeatSpec('tfire_tick', 0.16)], ['repeat_hit', repeatSpec('hit', 0.14)], ['repeat_edie_squelch', repeatSpec('edie_squelch', 0.22)],
        ['music_combat', musicSpec('combat', 'combat_strain', 0.5)], ['music_menu', musicSpec('menu', 'menu_hive', 0.5)],
      ];
      for (const [name, spec] of SCENES) {
        const x = await render(page, spec);
        const nodes = Object.values(x.counts).reduce((a, b) => a + b, 0);
        scenes[name] = { ...measure(x), nodes, ...(name.startsWith('stress') ? { nodesPerSec: nodes / 1.0 } : {}), ...(x.dev ? { dropped: x.dev.dropped, peakVoices: x.dev.peakVoices } : {}) };
        writeWav(join(OUT, 'wav', `${name}.wav`), x.l, x.r);
        console.log(`scene ${name}: peak ${scenes[name].peakDb.toFixed(1)} dBFS, ${nodes} nodes`);
      }
    }
    let balance: Results['balance'];
    if (!ONLY) {
      const m = montageSpec();
      const isMusic = (e: Ev): boolean => e.kind === 'music' || e.kind === 'intensity';
      const sfxOnly = await render(page, { ...m, music: false, events: m.events.filter((e) => !isMusic(e)) });
      const musicOnly = await render(page, { ...m, events: m.events.filter(isMusic) });
      balance = MONTAGE_SECTIONS.map(([section, a, b]) => ({ section, sfx: sectionLoudness(sfxOnly, a, b), music: sectionLoudness(musicOnly, a, b) }));
      for (const r of balance) console.log(`balance ${r.section}: SFX ${r.sfx.toFixed(1)} vs score ${r.music.toFixed(1)} LUFS`);
    }
    const res: Results = { label: LABEL, date: new Date().toISOString().slice(0, 10), cues, scenes, balance };
    writeFileSync(join(OUT, 'results.json'), JSON.stringify(res, null, 1));

    if (flag('mp3')) {
      mkdirSync(join(OUT, 'mp3'), { recursive: true });
      const order = [...AUDITION.filter((t) => tags.includes(t)), ...Object.keys(scenes).filter((s) => !s.startsWith('music_'))];
      order.forEach((name, i) => {
        const f = name.replace(/[@~:]/g, '_');
        mp3(join(OUT, 'wav', `${f}.wav`), join(OUT, 'mp3', `${String(i + 1).padStart(2, '0')}-${f}.mp3`));
      });
      console.log(`mp3 audition set → ${join(OUT, 'mp3')}`);
    }
    if (flag('suggest')) printSuggest(cues);
    if (!ONLY && !flag('no-report')) {
      const base = opt('baseline');
      const before = base && existsSync(base) ? (JSON.parse(readFileSync(base, 'utf8')) as Results) : null;
      writeFileSync(join(ROOT, 'docs/AUDIO_REPORT.md'), report(res, before));
      console.log('wrote docs/AUDIO_REPORT.md');
    }
  } finally {
    await browser.close();
  }
}

function printSuggest(cues: CueRow[]): void {
  console.log('\n// suggested trims (trimDb = current + goal − measured, 0.5 dB steps):');
  for (const c of cues) {
    if (/[@~:]/.test(c.tag) || !(c.tag in CUE_MIX)) continue;
    const s = Math.round((c.trimDb + c.goal - c.lufsM) * 2) / 2;
    console.log(`${c.tag}: ${s}`);
  }
}

// ───────────────────────────── the report ─────────────────────────────
const f1 = (v: number | null | undefined): string => (v === null || v === undefined || v < -150 ? '—' : v.toFixed(1));
const median = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
interface Headline { worstPeak: number; worstPeakTag: string; clippedCues: number; truncatedCues: number; hardStopCues: number; errRms: number; errMax: number; spread: number; stressPeak: number; stressClipped: number; stressX2Peak: number; montagePeak: number; nodesPerSec: number }
function headline(r: Results): Headline {
  const cs = r.cues.filter((c) => !/[@~:]/.test(c.tag));
  const worst = cs.reduce((a, b) => (b.peakDb > a.peakDb ? b : a), cs[0]);
  const err = cs.map((c) => c.lufsM - c.goal);
  const cats = Object.keys(SFX_CATEGORIES) as SfxCategory[];
  const spreads = cats.map((k) => { const v = cs.filter((c) => c.cat === k).map((c) => c.lufsM - c.goal); return v.length ? Math.max(...v) - Math.min(...v) : 0; });
  return {
    worstPeak: worst.peakDb, worstPeakTag: worst.tag, clippedCues: cs.filter((c) => c.clipped > 0).length,
    truncatedCues: cs.filter((c) => c.truncated > 0).length, hardStopCues: cs.filter((c) => c.hardStops > 0).length,
    errRms: Math.sqrt(err.reduce((a, b) => a + b * b, 0) / err.length), errMax: Math.max(...err.map(Math.abs)),
    spread: Math.max(...spreads),
    stressPeak: r.scenes.stress?.peakDb ?? NaN, stressClipped: r.scenes.stress?.clipped ?? NaN, stressX2Peak: r.scenes.stress_x2?.peakDb ?? NaN,
    montagePeak: r.scenes.montage?.peakDb ?? NaN, nodesPerSec: r.scenes.stress?.nodesPerSec ?? NaN,
  };
}

function report(r: Results, before: Results | null): string {
  const h = headline(r), b = before ? headline(before) : null;
  const cats = Object.keys(SFX_CATEGORIES) as SfxCategory[];
  const L: string[] = [];
  L.push('# AUDIO_REPORT — the measured SFX mix', '');
  L.push(`> Generated by \`npm run audio:audit\` (scripts/audio-audit.ts) on ${r.date} — run "${r.label}"${before ? ` vs baseline "${before.label}" (${before.date})` : ''}.`);
  L.push('> Every cue the dispatcher knows is rendered OFFLINE in headless Chromium (OfflineAudioContext, 48 kHz stereo, default volume,');
  L.push('> no variation) through the real src/audio code. Method + how to act on it: docs/AUDIO.md §audit. Generated — do not hand-edit.', '');
  L.push('## Headline', '');
  L.push(`| metric | ${b ? 'before | ' : ''}now |`, `|---|${b ? '---|' : ''}---|`);
  const row = (name: string, now: string, was?: string): void => { L.push(`| ${name} | ${b ? `${was ?? '—'} | ` : ''}${now} |`); };
  row('worst single-cue peak (dBFS)', `${f1(h.worstPeak)} (${h.worstPeakTag})`, b ? `${f1(b.worstPeak)} (${b.worstPeakTag})` : undefined);
  row('cues that clip (|x| > 1)', String(h.clippedCues), b ? String(b.clippedCues) : undefined);
  row('cues with a TRUNCATED voice (click)', String(h.truncatedCues), b ? String(b.truncatedCues) : undefined);
  row('cues with a hard stop (≥ 30 dB in 1 ms)', String(h.hardStopCues), b ? String(b.hardStopCues) : undefined);
  row('loudness error vs design goal — RMS / max (dB)', `${f1(h.errRms)} / ${f1(h.errMax)}`, b ? `${f1(b.errRms)} / ${f1(b.errMax)}` : undefined);
  row('worst in-category loudness spread (dB)', f1(h.spread), b ? f1(b.spread) : undefined);
  row('stress mix peak (dBFS) / clipped samples', `${f1(h.stressPeak)} / ${h.stressClipped}`, b ? `${f1(b.stressPeak)} / ${b.stressClipped}` : undefined);
  row('stress ×2 peak (dBFS)', f1(h.stressX2Peak), b ? f1(b.stressX2Peak) : undefined);
  row('combat montage peak, music + SFX (dBFS)', f1(h.montagePeak), b ? f1(b.montagePeak) : undefined);
  row('nodes created in the 1 s swarm wipe', String(Math.round(h.nodesPerSec)), b ? String(Math.round(b.nodesPerSec)) : undefined);
  L.push('');
  L.push('## Loudness by category', '', 'Momentary-max LUFS (400 ms, K-weighted) of ONE cue. *goal* = category target + the cue\'s design offset (`rel`, src/audio/sfxMix.ts).', '');
  L.push(`| category | target | cues | median | min | max | spread | median error${b ? ' | before: median / spread / median error' : ''} |`);
  L.push(`|---|---|---|---|---|---|---|---|${b ? '---|' : ''}`);
  for (const k of cats) {
    const cs = r.cues.filter((c) => c.cat === k && !/[@~:]/.test(c.tag));
    if (!cs.length) continue;
    const v = cs.map((c) => c.lufsM), e = cs.map((c) => c.lufsM - c.goal);
    let was = '';
    if (before) {
      const bc = before.cues.filter((c) => mixOf(c.tag).cat === k && !/[@~:]/.test(c.tag));
      const bv = bc.map((c) => c.lufsM), be = bc.map((c) => c.lufsM - (SFX_CATEGORIES[k].targetLufs + (mixOf(c.tag).rel ?? 0)));
      was = ` | ${f1(median(bv))} / ${f1(Math.max(...be) - Math.min(...be))} / ${f1(median(be))}`;
    }
    L.push(`| ${k} | ${SFX_CATEGORIES[k].targetLufs} | ${cs.length} | ${f1(median(v))} | ${f1(Math.min(...v))} | ${f1(Math.max(...v))} | ${f1(Math.max(...e) - Math.min(...e))} | ${f1(median(e))}${was} |`);
  }
  L.push('', '## Scenes', '', '| scene | peak dBFS | clipped | LUFS-M max | LUFS-S max | LUFS-I | nodes | dropped voices | peak voices |', '|---|---|---|---|---|---|---|---|---|');
  for (const [name, s] of Object.entries(r.scenes)) {
    L.push(`| ${name} | ${f1(s.peakDb)} | ${s.clipped} | ${f1(s.lufsM)} | ${f1(s.lufsS)} | ${f1(s.lufsI)} | ${s.nodes} | ${s.dropped ?? '—'} | ${s.peakVoices ?? '—'} |`);
  }
  if (before) {
    L.push('', 'Before:', '', '| scene | peak dBFS | clipped | LUFS-M max | LUFS-S max | LUFS-I | nodes |', '|---|---|---|---|---|---|---|');
    for (const [name, s] of Object.entries(before.scenes)) L.push(`| ${name} | ${f1(s.peakDb)} | ${s.clipped} | ${f1(s.lufsM)} | ${f1(s.lufsS)} | ${f1(s.lufsI)} | ${s.nodes} |`);
  }
  if (r.balance) {
    L.push('', '## Mix balance — SFX vs the score', '', 'The combat montage rendered twice — SFX alone, score alone (no ducks) — ungated LUFS per section.', '');
    L.push(`| section | SFX | score | SFX over score${before?.balance ? ' | before: SFX / score / over' : ''} |`, `|---|---|---|---|${before?.balance ? '---|' : ''}`);
    r.balance.forEach((x, i) => {
      const o = before?.balance?.[i];
      L.push(`| ${x.section} | ${f1(x.sfx)} | ${f1(x.music)} | ${(x.sfx - x.music >= 0 ? '+' : '') + f1(x.sfx - x.music)} dB${o ? ` | ${f1(o.sfx)} / ${f1(o.music)} / ${(o.sfx - o.music >= 0 ? '+' : '') + f1(o.sfx - o.music)} dB` : ''} |`);
    });
  }
  L.push('', '*stress* = 40 kills + 30 shots + 20 hits inside 1 s with a boss death on top (×2 doubles the swarm); *montage* = ~21 s of a',
    'first-hour wave over the combat score (music + SFX summed in one context, as the speakers sum the two engines); *film* = the',
    'opening film\'s cue sequence over the cinema score; *music_* = the score alone (the bed the SFX targets are set against).');
  L.push('', '## Every cue', '', `| cue | category | goal | LUFS-M | error | peak dBFS | dur s | trim | nodes | trunc | body missing s | level at cut dBFS | energy lost${b ? ' | before LUFS-M / peak / trunc' : ''} |`);
  L.push(`|---|---|---|---|---|---|---|---|---|---|---|---|---|${b ? '---|' : ''}`);
  const bm = new Map((before?.cues ?? []).map((c) => [c.tag, c]));
  for (const c of r.cues) {
    const o = bm.get(c.tag);
    L.push(`| ${c.tag} | ${c.cat} | ${f1(c.goal)} | ${f1(c.lufsM)} | ${f1(c.lufsM - c.goal)} | ${f1(c.peakDb)} | ${c.durS.toFixed(2)} | ${c.trimDb} | ${c.nodes} | ${c.truncated || ''} | ${c.truncMissingS ? c.truncMissingS.toFixed(2) : ''} | ${f1(c.truncLostDb)} | ${c.truncShare ? `${(c.truncShare * 100).toFixed(0)} %` : ''}${b ? ` | ${o ? `${f1(o.lufsM)} / ${f1(o.peakDb)} / ${o.truncated || ''}` : '—'}` : ''} |`);
  }
  L.push('');
  return L.join('\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
