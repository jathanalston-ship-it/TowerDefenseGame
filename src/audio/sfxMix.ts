// SFX MIX — the ONE table behind the synthesized SFX bus (docs/AUDIO.md). Pure data + pure
// helpers (no AudioContext), so the game (audio/sound.ts), the tests and the offline audit
// (`npm run audio:audit` → docs/AUDIO_REPORT.md) all read the same rows.
//
//   • CATEGORY  — every cue belongs to one. A category owns its loudness TARGET, its reverb SEND,
//                 its per-dispatch micro-VARIATION bounds and its VOICE budget.
//   • rel       — DESIGN intent: how far this cue sits from its category target (dB). Tiers live
//                 here (toast0 < toast1 < toast2; the boss sting over a wave horn).
//   • trimDb    — MEASURED correction, derived by the audit: trimDb = (target + rel) − loudness the
//                 cue renders at untrimmed. Re-run the audit after editing a synth and paste its
//                 suggested trims; never hand-tune a literal inside a cue function.
//
// A new cue = a `case` in sound.ts + a row here (src/audio/sound.test.ts fails on a case without a
// row, or a row without a case).

export type SfxCategory = 'combatFrequent' | 'combatImpact' | 'reward' | 'ui' | 'cinematic' | 'alert' | 'ambient';

export interface SfxVary {
  /** Pitch spread: ± this fraction (0.03 = ±3 %). */
  pitch: number;
  /** Level spread: ± this many dB. */
  gainDb: number;
  /** Start jitter: 0 … this many ms late. */
  jitterMs: number;
}

export interface SfxCategoryDef {
  /** Target loudness of ONE cue of this category: momentary-max LUFS (400 ms window, K-weighted)
   *  at the default volume, as the audit measures it. Frequent cues sit low (they pile up);
   *  rewards and alerts sit high (they must cut through the combat bed and the score). */
  targetLufs: number;
  /** Send level (0..1) into the shared procedural reverb. Combat stays nearly dry (clarity);
   *  cinematic and reward cues get the space. */
  send: number;
  /** Per-dispatch micro-variation so repeats never machine-gun. Musical categories stay exact. */
  vary: SfxVary;
  /** Voices this category may hold at once (the global cap in sound.ts still applies). Frequent
   *  combat is budgeted so a swarm wipe can never starve a reward or an alert of voices. */
  voices: number;
  /** Music duck [depth 0..1, recovery s] for this category's prominent cues (rel > −4) when the
   *  cue has no FEEL row of its own — rewards and alerts cut through the score. */
  duck?: readonly [number, number];
}

const EXACT: SfxVary = { pitch: 0, gainDb: 0, jitterMs: 0 };

// Targets are set against the score as measured by the audit (docs/AUDIO_REPORT.md): the combat bed
// sits near −25 LUFS short-term, the menu bed near −30. One frequent cue sits well under the bed
// (dozens land per second); impacts at the bed; rewards and alerts on top of it (plus a duck).
export const SFX_CATEGORIES: Readonly<Record<SfxCategory, SfxCategoryDef>> = {
  combatFrequent: { targetLufs: -37, send: 0.03, vary: { pitch: 0.03, gainDb: 1.5, jitterMs: 6 }, voices: 22 },
  combatImpact: { targetLufs: -29, send: 0.08, vary: { pitch: 0.02, gainDb: 1, jitterMs: 3 }, voices: 12 },
  alert: { targetLufs: -23, send: 0.14, vary: EXACT, voices: 12, duck: [0.2, 0.9] },
  reward: { targetLufs: -23, send: 0.2, vary: EXACT, voices: 14, duck: [0.16, 0.7] },
  ui: { targetLufs: -35, send: 0.04, vary: { pitch: 0.012, gainDb: 0.5, jitterMs: 0 }, voices: 6 },
  cinematic: { targetLufs: -27, send: 0.32, vary: EXACT, voices: 14 },
  ambient: { targetLufs: -47, send: 0.18, vary: { pitch: 0.02, gainDb: 1, jitterMs: 0 }, voices: 4 },
};

export interface CompressorParams { threshold: number; knee: number; ratio: number; attack: number; release: number }
/** The SFX bus mastering + space (sound.ts buildGraph). */
export const SFX_MASTER: {
  busGain: number; output: number; glue: CompressorParams; limiter: CompressorParams; clipKnee: number;
  reverb: { seconds: number; rt60: number; preDelay: number; brightness: number; return: number };
} = {
  busGain: 0.9, // the summed bus into the glue
  output: 0.75, // the master level at volume 1 — the pre-mix default volume, so "100 %" plays as it always did
  // Glue: gentle 2:1 above −16 dB — a stack of voices compresses together instead of piling up.
  glue: { threshold: -16, knee: 8, ratio: 2, attack: 0.004, release: 0.2 },
  // Limiter: 20:1 above −4 dB with a fast attack — a swarm wipe lands loud, never clipped.
  limiter: { threshold: -4, knee: 0, ratio: 20, attack: 0.001, release: 0.12 },
  clipKnee: 0.9, // the soft-clip shoulder (linear below 0.9 of full scale)
  // One shared room: a short, dark, ~1.5 s RT60 space with a 14 ms pre-delay.
  reverb: { seconds: 1.8, rt60: 1.5, preDelay: 0.014, brightness: 0.5, return: 0.55 },
};

export interface CueMixRow {
  cat: SfxCategory;
  /** Design offset from the category target (dB, default 0). */
  rel?: number;
  /** Measured correction (dB) — the audit's suggested trim. */
  trimDb: number;
  /** Override the category's pitch spread (e.g. the kill-streak ladder must stay in tune). */
  pitch?: number;
}

const c = (cat: SfxCategory, trimDb = 0, rel = 0, pitch?: number): CueMixRow => (pitch === undefined ? { cat, rel, trimDb } : { cat, rel, trimDb, pitch });

/** Every dispatcher cue (sound.ts `case` labels) → its mix row. */
export const CUE_MIX: Readonly<Record<string, CueMixRow>> = {
  // ── combat, frequent: per shot / hit / death — quiet, varied, nearly dry ──
  hit: c('combatFrequent'),
  kill: c('combatFrequent', 0, 2, 0.006), // the streak ping climbs in semitones — keep it in tune
  edie_squelch: c('combatFrequent'),
  edie_crack: c('combatFrequent'),
  edie_screech: c('combatFrequent'),
  edie_pop: c('combatFrequent'),
  edie_splat: c('combatFrequent', 0, 1),
  assimilate: c('combatFrequent', 0, -6),
  tfire_tick: c('combatFrequent', 0, -2),
  tfire_thud: c('combatFrequent', 0, -1),
  tfire_wet: c('combatFrequent', 0, -2),
  tfire_zap: c('combatFrequent', 0, -2),
  tfire_ting: c('combatFrequent', 0, -2),
  status_dot: c('combatFrequent', 0, -5),
  status_control: c('combatFrequent', 0, -5),
  shred: c('combatFrequent', 0, -1),
  crit: c('combatFrequent', 0, -1, 0.01),
  shot: c('combatFrequent', 0, -2),
  br_swarm: c('combatFrequent', 0, -2),
  br_rail: c('combatFrequent', 0, -1),
  br_siege: c('combatFrequent', 0, -1),
  br_acid: c('combatFrequent', 0, -2),
  br_vital: c('combatFrequent', 0, -2),
  br_spore: c('combatFrequent', 0, -2),
  br_plague: c('combatFrequent', 0, -2),
  br_gore: c('combatFrequent', 0, -2),
  br_psi: c('combatFrequent', 0, -2),
  br_storm: c('combatFrequent', 0, -2),
  br_maw: c('combatFrequent', 0, -2),
  br_gullet: c('combatFrequent', 0, -2),
  br_amber: c('combatFrequent', 0, -2),
  br_sap: c('combatFrequent', 0, -2),
  br_choir: c('combatFrequent', 0, -2),
  br_malice: c('combatFrequent', 0, -2),
  br_siphon: c('combatFrequent', 0, -2),
  br_well: c('combatFrequent', 0, -2),
  br_scatter: c('combatFrequent', 0, -2),
  br_slug: c('combatFrequent', 0, -1),
  br_collapse: c('combatFrequent', 0, -2),
  br_annihilate: c('combatFrequent', 0, -1),
  // ── combat, impact: player actions + heavy hits — weightier, a touch of room ──
  hiveHit: c('combatImpact', 0, -2),
  ability: c('combatImpact'),
  abilityImpact: c('combatImpact'),
  mine: c('combatImpact', 0, -2),
  place: c('combatImpact', 0, -2),
  splice: c('combatImpact', 0, 1),
  dissolve: c('combatImpact', 0, -1),
  boss_phase: c('combatImpact', 0, 3),
  mega_cast: c('combatImpact', 0, 2),
  megaStagger: c('combatImpact', 0, 3),
  megaCataclysm: c('combatImpact', 0, 4),
  megaPhase: c('combatImpact', 0, 3),
  wpOpen: c('combatImpact', 0, 1),
  wpBreak: c('combatImpact', 0, 3),
  megaBurrow: c('combatImpact', 0, 1),
  // ── alerts: threat arrivals + the Hive in danger — must cut through everything ──
  breach: c('alert', 0, -2),
  hiveGroan: c('alert', 0, -2),
  heartbeat: c('alert', 0, -3),
  wave: c('alert', 0, -2),
  boss: c('alert', 0, 1),
  nemesis_roar: c('alert', 0, 1),
  mega: c('alert', 0, 2),
  megaMaw: c('alert'),
  megaChoir: c('alert'),
  megaShepherd: c('alert'),
  megaTide: c('alert'),
  megaTithe: c('alert'),
  megaGorge: c('alert'),
  megaMyriad: c('alert'),
  megaAbility: c('alert', 0, -1),
  defeat: c('alert', 0, -1),
  // ── rewards: the dopamine layer — prominent, a little room, tiers by `rel` ──
  clear: c('reward'),
  bossFall: c('reward', 0, 2),
  megaDeath: c('reward', 0, 3),
  chest: c('reward', 0, -2),
  reveal: c('reward', 0, -2),
  jackpot: c('reward', 0, 2),
  shard_tower: c('reward', 0, -1),
  shard_hero: c('reward', 0, 1),
  achieve: c('reward'),
  unlock: c('reward', 0, 2),
  levelup: c('reward', 0, 1),
  promotion: c('reward', 0, 3),
  adapt: c('reward'),
  power: c('reward', 0, -4),
  mastery: c('reward', 0, -3),
  evoClaim: c('reward', 0, -2),
  evoMilestone: c('reward'),
  evoPrestige: c('reward', 0, 2),
  rankup: c('reward', 0, 1),
  flip: c('reward', 0, -4),
  strandFound: c('reward'),
  toast0: c('reward', 0, -8),
  toast1: c('reward', 0, -5),
  toast2: c('reward', 0, -2),
  draft: c('reward', 0, -3),
  draftPick: c('reward', 0, -1),
  victory: c('reward', 0, 1),
  graftCrack: c('reward', 0, -2),
  tut_done: c('reward'),
  // ── UI: clean, dry, quiet — heard constantly in the hub ──
  select: c('ui'),
  ui: c('ui'),
  hover: c('ui', 0, -9),
  launch: c('ui', 0, 4),
  tut_step: c('ui', 0, 1),
  graftSquelch: c('ui', 0, 1),
  // ── cinematic: the opening film's beats + biome transitions — wide and wet ──
  cin_ping: c('cinematic', 0, -2),
  cin_alarm: c('cinematic', 0, -1),
  cin_rumble: c('cinematic', 0, 1),
  cin_shriek: c('cinematic', 0, -3),
  cin_creep: c('cinematic', 0, -2),
  cin_snap: c('cinematic'),
  cin_heart: c('cinematic'),
  cin_bloom: c('cinematic', 0, -2),
  cin_erupt: c('cinematic', 0, 1),
  cin_feed: c('cinematic', 0, -1),
  cin_title: c('cinematic', 0, 2),
  cin_cut: c('cinematic', 0, -5),
  cin_dive: c('cinematic', 0, 1),
  biome: c('cinematic', 0, -2),
  // ── ambient: the living battlefield's murmurs — faint by design, under every combat cue ──
  org_heart: c('ambient'),
  org_breath: c('ambient'),
  org_bone: c('ambient'),
  org_acid: c('ambient'),
  org_spore: c('ambient'),
  org_chirp: c('ambient'),
  org_hum: c('ambient'),
  tprep_ready: c('ambient', 0, 4),
  graftPulse: c('ambient', 0, 4),
  bioStage: c('ambient', 0, 6),
};

/** The row a cue mixes by — unknown tags fall back to a neutral UI row (never silent, never loud). */
export const FALLBACK_MIX: CueMixRow = { cat: 'ui', rel: 0, trimDb: 0 };
export const mixOf = (tag: string): CueMixRow => CUE_MIX[tag] ?? FALLBACK_MIX;

export const dbToGain = (db: number): number => Math.pow(10, db / 20);

/** One dispatch's variation draw (written into `out` — the dispatcher reuses one object, so the hot
 *  path allocates nothing). Three draws in a fixed order: pitch, level, jitter. A centred roll (0.5)
 *  is the identity for pitch and level. */
export interface SfxVariation { pitch: number; gain: number; delay: number }
export function drawVariation(out: SfxVariation, vary: SfxVary, rng: () => number, pitchOverride?: number): SfxVariation {
  const p = pitchOverride ?? vary.pitch;
  out.pitch = 1 + (rng() * 2 - 1) * p;
  out.gain = dbToGain((rng() * 2 - 1) * vary.gainDb);
  out.delay = (rng() * vary.jitterMs) / 1000;
  return out;
}
