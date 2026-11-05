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
  /** Send level (0..1) into the shared procedural reverb. Combat stays dry or nearly dry (clarity);
   *  cinematic and reward cues get the space. 0 = no send at all: the most frequent cues never keep
   *  the convolver awake (it idles through ordinary combat — the audit's render-time column). */
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
  combatFrequent: { targetLufs: -35, send: 0, vary: { pitch: 0.03, gainDb: 1.5, jitterMs: 6 }, voices: 22 },
  combatImpact: { targetLufs: -28, send: 0.08, vary: { pitch: 0.02, gainDb: 1, jitterMs: 3 }, voices: 12 },
  alert: { targetLufs: -21, send: 0.14, vary: EXACT, voices: 12, duck: [0.2, 0.9] },
  reward: { targetLufs: -21, send: 0.2, vary: EXACT, voices: 14, duck: [0.16, 0.7] },
  ui: { targetLufs: -35, send: 0.025, vary: { pitch: 0.012, gainDb: 0.5, jitterMs: 0 }, voices: 6 },
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
  reverb: { seconds: 1.4, rt60: 1.5, preDelay: 0.014, brightness: 0.5, return: 1.6 },
};

export interface CueMixRow {
  cat: SfxCategory;
  /** Design offset from the category target (dB, default 0). */
  rel?: number;
  /** Measured correction (dB) — the audit's suggested trim. */
  trimDb: number;
  /** Override the category's pitch spread (e.g. the kill-streak ladder must stay in tune). */
  pitch?: number;
  /** false = never take the category's music duck (a REPEATING cue would pump the score). */
  duck?: false;
}

const c = (cat: SfxCategory, trimDb = 0, rel = 0, pitch?: number): CueMixRow => (pitch === undefined ? { cat, rel, trimDb } : { cat, rel, trimDb, pitch });

/** Every dispatcher cue (sound.ts `case` labels) → its mix row. */
export const CUE_MIX: Readonly<Record<string, CueMixRow>> = {
  // ── combat, frequent: per shot / hit / death — quiet, varied, nearly dry ──
  hit: c('combatFrequent', 3),
  kill: c('combatFrequent', -3, 2, 0.006), // the streak ping climbs in semitones — keep it in tune
  edie_squelch: c('combatFrequent', 7.5),
  edie_crack: c('combatFrequent', 4),
  edie_screech: c('combatFrequent', 6.5),
  edie_pop: c('combatFrequent', 4),
  edie_splat: c('combatFrequent', 3, 1),
  assimilate: c('combatFrequent', 4, -6),
  tfire_tick: c('combatFrequent', 5, -2),
  tfire_thud: c('combatFrequent', -2.5, -1),
  tfire_wet: c('combatFrequent', 9, -2),
  tfire_zap: c('combatFrequent', 8.5, -2),
  tfire_ting: c('combatFrequent', 2.5, -2),
  status_dot: c('combatFrequent', 9, -5),
  status_control: c('combatFrequent', 2, -5),
  shred: c('combatFrequent', -4.5, -1),
  crit: c('combatFrequent', 3.5, -1, 0.01),
  shot: c('combatFrequent', 8.5, -2),
  br_swarm: c('combatFrequent', 6.5, -2),
  br_rail: c('combatFrequent', 3, -1),
  br_siege: c('combatFrequent', 0, -1),
  br_acid: c('combatFrequent', 8, -2),
  br_vital: c('combatFrequent', 1, -2),
  br_spore: c('combatFrequent', 10, -2),
  br_plague: c('combatFrequent', 8, -2),
  br_gore: c('combatFrequent', 11, -2),
  br_psi: c('combatFrequent', 1, -2),
  br_storm: c('combatFrequent', 8, -2),
  br_maw: c('combatFrequent', 9, -2),
  br_gullet: c('combatFrequent', 5, -2),
  br_amber: c('combatFrequent', 5.5, -2),
  br_sap: c('combatFrequent', 5.5, -2),
  br_choir: c('combatFrequent', 1.5, -2),
  br_malice: c('combatFrequent', 1.5, -2),
  br_siphon: c('combatFrequent', 8, -2),
  br_well: c('combatFrequent', 1, -2),
  br_scatter: c('combatFrequent', 6.5, -2),
  br_slug: c('combatFrequent', 0, -1),
  br_collapse: c('combatFrequent', 1, -2),
  br_annihilate: c('combatFrequent', 9, -1),
  // ── combat, impact: player actions + heavy hits — weightier, a touch of room ──
  hiveHit: c('combatImpact', 3, -2),
  ability: c('combatImpact', -4.5),
  abilityImpact: c('combatImpact', -1),
  mine: c('combatImpact', -3, -2),
  place: c('combatImpact', -1.5, -2),
  splice: c('combatImpact', 2.5, 1),
  dissolve: c('combatImpact', -1, -1),
  boss_phase: c('combatImpact', -3.5, 3),
  mega_cast: c('combatImpact', -4, 2),
  megaStagger: c('combatImpact', -6.5, 3),
  megaCataclysm: c('combatImpact', -5, 4),
  megaPhase: c('combatImpact', -5.5, 3),
  wpOpen: c('combatImpact', -2, 1),
  wpBreak: c('combatImpact', -3, 3),
  megaBurrow: c('combatImpact', -3.5, 1),
  // ── alerts: threat arrivals + the Hive in danger — must cut through everything ──
  breach: c('alert', -1.5, -2),
  hiveGroan: c('alert', 0.5, -2),
  heartbeat: { ...c('alert', 2, -3), duck: false }, // pounds every ~1 s at critical integrity
  wave: c('alert', 3.5, -2),
  boss: c('alert', 0, 1),
  nemesis_roar: c('alert', -1, 1),
  mega: c('alert', -1.5, 2),
  megaMaw: c('alert', -1),
  megaChoir: c('alert', -4),
  megaShepherd: c('alert', -4),
  megaTide: c('alert', -6),
  megaTithe: c('alert', -2),
  megaGorge: c('alert'),
  megaMyriad: c('alert', -2.5),
  megaAbility: c('alert', 3, -1),
  defeat: c('alert', 2.5, -1),
  // ── rewards: the dopamine layer — prominent, a little room, tiers by `rel` ──
  clear: c('reward', 3.5),
  bossFall: c('reward', -0.5, 2),
  megaDeath: c('reward', -1, 3),
  chest: c('reward', 3, -2),
  reveal: c('reward', 8.5, -4),
  jackpot: c('reward', 6.5, 2),
  shard_tower: c('reward', 10, -1),
  shard_hero: c('reward', 4, 1),
  achieve: c('reward', 3.5),
  unlock: c('reward', 5.5, 2),
  levelup: c('reward', 6, 1),
  promotion: c('reward', 6, 3),
  adapt: c('reward', 6),
  power: c('reward', 1.5, -7),
  mastery: c('reward', 10, -3),
  evoClaim: c('reward', 10, -2),
  evoMilestone: c('reward', 7.5),
  evoPrestige: c('reward', 11.5, 2),
  rankup: c('reward', 6.5, 1),
  flip: c('reward', 15, -6),
  strandFound: c('reward', 9),
  toast0: c('reward', 12, -12),
  toast1: c('reward', 8.5, -8),
  toast2: c('reward', 8.5, -4),
  draft: { ...c('reward', 2.5, -3), duck: false }, // also the hub's gene equip/slot confirm
  draftPick: c('reward', 5, -1),
  victory: c('reward', 6, 1),
  graftCrack: c('reward', 9, -2),
  tut_done: c('reward', 8),
  // ── UI: clean, dry, quiet — heard constantly in the hub ──
  select: c('ui', 10),
  ui: c('ui', 10),
  hover: c('ui', 9.5, -15),
  launch: c('ui', -3, 4),
  tut_step: c('ui', 4, 1),
  graftSquelch: c('ui', 1.5, 1),
  // ── cinematic: the opening film's beats + biome transitions — wide and wet ──
  cin_ping: c('cinematic', -2, -2),
  cin_alarm: c('cinematic', 3, -1),
  cin_rumble: c('cinematic', -1, 1),
  cin_shriek: c('cinematic', 7, -3),
  cin_creep: c('cinematic', 3.5, -2),
  cin_snap: c('cinematic', 5.5),
  cin_heart: c('cinematic', 1),
  cin_bloom: c('cinematic', 6, -2),
  cin_erupt: c('cinematic', 2, 1),
  cin_feed: c('cinematic', 8.5, -1),
  cin_title: c('cinematic', -4.5, 2),
  cin_cut: c('cinematic', 13, -5),
  cin_dive: c('cinematic', -2.5, 1),
  biome: c('cinematic', -6, -2),
  // ── ambient: the living battlefield's murmurs — faint by design, under every combat cue ──
  org_heart: c('ambient', -6.5),
  org_breath: c('ambient', -1),
  org_bone: c('ambient', -0.5),
  org_acid: c('ambient'),
  org_spore: c('ambient', 4),
  org_chirp: c('ambient', 3.5),
  org_hum: c('ambient', -6),
  tprep_ready: c('ambient', 0.5, 4),
  graftPulse: c('ambient', -13, 4),
  bioStage: c('ambient', -9.5, 6),
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
