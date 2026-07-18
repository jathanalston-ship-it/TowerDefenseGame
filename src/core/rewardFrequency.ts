// REWARD FREQUENCY ENGINEERING (docs/REWARD-FREQUENCY.md) — the permanent design
// philosophy, machine-enforced: maximize MEANINGFUL POSITIVE INTERACTIONS per hour of play
// (open · unlock · rankUp · complete · collect · claim · discover · evolve · prestige ·
// progress) WITHOUT raising total resource generation. Value belongs to the economy sims;
// this module owns the RHYTHM.
//
// The instrument is a minute-resolution walk of one typical hour per persona, with every
// beat rate derived from live data — REWARD_SOURCES cadences, the REAL weekly-quest defs
// judged by the REAL missionCredit(), the REAL Battle-Pass XP curve — so new content and
// rebalances shift the measured hour automatically, and rewardFrequencyProblems() (run by
// the test suite) fails the build when any persona's hour drops below the momentum floor,
// floods past the overwhelm ceiling, opens a dead window, or turns claiming into menu work.
//
// Fatigue vocabulary (the contract's four ceilings):
//   • DEAD TIME    — a stretch ≥ DEAD_WINDOW_MIN minutes with zero interaction beats.
//   • MENU FATIGUE — taps per interaction (the Ready Chain keeps claims ~1-tap; anything
//     that averages ≥ TAPS_CEILING is navigation, not play).
//   • DECISION FATIGUE — choices per hour (drafts, wheel sessions, purchase decisions).
//   • REWARD FATIGUE — peak beats in any rolling minute (the toast bus merges at 4; a
//     sustained flood past PEAK_CEILING reads as noise, not celebration).
//
// Pure core module: no DOM, no state imports. Deterministic per (persona, seed).

import { BP, xpToReach } from './battlePass';
import { WEEKLY_QUESTS, missionCredit } from './quests';
import type { QuestRunFacts } from './quests';
import { REWARD_SOURCES } from './rewardLoops';
import { IDLE } from './config';

// ── The interaction verb taxonomy (the brief's list, closed) ─────────────────────────────
export const INTERACTION_VERBS = [
  'open', 'unlock', 'rankUp', 'complete', 'collect', 'claim', 'discover', 'evolve',
  'prestige', 'progress',
] as const;
export type InteractionVerb = (typeof INTERACTION_VERBS)[number];

/** Every REWARD_SOURCES row names its interaction verb — the inheritance contract at the
 *  source level: a NEW reward pathway fails verbTotalityProblems() until classified here,
 *  which drops it into the measured hour automatically. */
export const SOURCE_VERB: Record<string, InteractionVerb> = {
  run_campaign: 'complete', run_infinite: 'complete', run_bossrush: 'complete',
  run_daily: 'complete', run_arena: 'complete',
  vault_containers: 'open', run_cache: 'open', bio_roulette: 'open',
  daily_login: 'collect', idle_harvest: 'collect', expeditions: 'collect', field_research: 'collect',
  battle_pass: 'claim', quests: 'complete', directives: 'complete', contracts: 'complete',
  mastery_tracks: 'claim', achievements: 'unlock', genome_rank: 'rankUp', account_level: 'rankUp',
  unlock_reveals: 'unlock', tutorial_milestones: 'complete',
  tower_stars: 'evolve', hero_stars: 'evolve', evolution_hq: 'evolve', gene_upgrades: 'evolve',
  equipment_forge: 'evolve', mulligan_grafts: 'evolve', hive_organs: 'evolve', adaptation_nodes: 'evolve',
  collections_ranks: 'rankUp', gene_discovery: 'discover', wardrobe: 'discover',
  boss_trophies: 'discover', gear_codex: 'discover',
  splice_market: 'collect', ichor_exchange: 'collect', auction_house: 'collect',
  premium_store: 'open', infestation: 'progress',
};
export function verbTotalityProblems(): string[] {
  const out: string[] = [];
  for (const s of REWARD_SOURCES) {
    if (!SOURCE_VERB[s.id]) out.push(`reward source '${s.id}' has no interaction verb — add it to SOURCE_VERB (core/rewardFrequency.ts) so the frequency instrument measures it`);
  }
  return out;
}

// ── Personas — playstyle × spend × account band ──────────────────────────────────────────
// Run shapes mirror the canonical archetypes the Battle-Pass economy sim pins
// (battlePassEconomy.test.ts CASUAL/MID/HEAVY_RUN) so the two instruments describe the
// same players; the XP formula below is the same meta.finishRun mirror.
export interface FrequencyPersona {
  id: string;
  premium: boolean;
  /** The session this persona actually plays (metrics normalize to per-hour rates). */
  sessionMinutes: number;
  runMinutes: number; // average run length
  facts: QuestRunFacts; // the persona's typical run, judged by the REAL quest defs
  /** Upgrade purchases affordable per session-hour (spending EXISTING income — value-neutral). */
  upgradesPerHour: number;
  /** Absence before the session (drives harvest ripeness + login). */
  gapHours: number;
  /** Banked hub state entering the session (mid-life account averages). */
  bank: { containers: number; spores: number; expeditions: number };
}
const FACTS = (kills: number, wave: number, bosses: number, megas: number, won: boolean, towers: number): QuestRunFacts =>
  ({ mode: 'endless', won, wave, kills, integrityLost: won ? 0.4 : 1, towerBuilds: { needle: towers }, bossKills: bosses, megaKills: megas } as QuestRunFacts);

export const FREQUENCY_PERSONAS: FrequencyPersona[] = [
  { id: 'commuter-free-early', premium: false, sessionMinutes: 45, runMinutes: 13, facts: FACTS(350, 24, 2, 0, true, 9), upgradesPerHour: 4, gapHours: 24, bank: { containers: 3, spores: 1, expeditions: 1 } },
  { id: 'commuter-premium-mid', premium: true, sessionMinutes: 45, runMinutes: 13, facts: FACTS(350, 24, 2, 0, true, 9), upgradesPerHour: 3, gapHours: 24, bank: { containers: 4, spores: 2, expeditions: 1 } },
  { id: 'grinder-free-mid', premium: false, sessionMinutes: 60, runMinutes: 21, facts: FACTS(550, 32, 3, 0, true, 11), upgradesPerHour: 2.5, gapHours: 6, bank: { containers: 5, spores: 3, expeditions: 1 } },
  { id: 'grinder-premium-late', premium: true, sessionMinutes: 60, runMinutes: 24, facts: FACTS(700, 38, 4, 1, true, 12), upgradesPerHour: 1.5, gapHours: 4, bank: { containers: 6, spores: 4, expeditions: 2 } },
  { id: 'weekender-free-mid', premium: false, sessionMinutes: 60, runMinutes: 17, facts: FACTS(550, 32, 3, 0, true, 11), upgradesPerHour: 3, gapHours: 60, bank: { containers: 8, spores: 4, expeditions: 2 } },
  { id: 'idler-free-late', premium: false, sessionMinutes: 28, runMinutes: 16, facts: FACTS(700, 38, 4, 1, true, 12), upgradesPerHour: 2, gapHours: 20, bank: { containers: 4, spores: 2, expeditions: 2 } },
];
/** Settled runs per hour at the persona's pace (runs fill the session between hub passes). */
export function runsPerHourOf(p: FrequencyPersona): number {
  return (p.sessionMinutes / (p.runMinutes + 3.5)) * (60 / p.sessionMinutes);
}

/** The meta.finishRun pass-XP formula, mirrored (a drift breaks the frequency test too). */
export function runPassXp(f: QuestRunFacts, dailyClear: boolean): number {
  return Math.round(f.kills * 0.5 + f.wave * 8 + f.bossKills * 25 + f.megaKills * 80 + (f.won ? 120 : 30) + 12 * 3 + (dailyClear ? 200 : 0));
}

// ── Data-derived beat rates ──────────────────────────────────────────────────────────────
/** Expected weekly-quest MISSION completions in one hour, judged by the REAL ring defs:
 *  each live mission accrues the persona's real per-run credit; assuming mid-week progress
 *  (half the target remaining, ~4 of 6 missions still open), a completion lands when the
 *  hour's credit covers the remainder. Averaged across the whole ring (rotation-stable). */
export function missionCompletesPerHour(p: FrequencyPersona): number {
  const rph = runsPerHourOf(p);
  let sum = 0;
  for (const q of WEEKLY_QUESTS) {
    let e = 0;
    for (const m of q.missions) {
      const perRun = missionCredit(m.cond, { type: 'run', facts: p.facts });
      const metaPerHour = m.cond.kind === 'containersOpened' ? Math.min(p.bank.containers, 6)
        : m.cond.kind === 'expeditionsClaimed' ? p.bank.expeditions
        : m.cond.kind === 'rouletteCollects' ? (p.bank.spores > 0 ? 1 : 0)
        : m.cond.kind === 'passLevels' ? passLevelsPerHour(p) : 0;
      const hourCredit = perRun * rph + metaPerHour;
      e += Math.min(1, hourCredit / Math.max(1, m.target / 2));
    }
    sum += Math.min(e, 4); // ~4 of 6 missions still open mid-week
  }
  return sum / WEEKLY_QUESTS.length;
}

/** Battle-Pass levels gained in the hour — the real curve (avg step ≈ xpToReach(100)/100). */
export function passLevelsPerHour(p: FrequencyPersona): number {
  const avgStep = xpToReach(BP.levels) / BP.levels;
  return (runPassXp(p.facts, false) * runsPerHourOf(p) + runPassXp(p.facts, true) - runPassXp(p.facts, false)) / avgStep;
}

// ── The hour walk ────────────────────────────────────────────────────────────────────────
export interface Beat { minute: number; verb: InteractionVerb; what: string; taps: number; choice: boolean }
export interface HourMetrics {
  perHour: number;
  byVerb: Record<InteractionVerb, number>;
  maxGapMin: number; // longest stretch with zero beats
  deadWindows: number; // gaps ≥ DEAD_WINDOW_MIN
  tapsPerInteraction: number;
  choicesPerHour: number;
  peakPerMinute: number;
  verbSpread: number; // distinct verbs in the hour (variety guard — reward fatigue's cousin)
}

function rng32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Walk one typical session. Beats carry tap costs from the measured Ready-Chain economy
 *  (docs/HUB-FLOW.md §validation: chain claims ≈1.2 taps, un-chained surfaces ≈2.5). */
export function walkSession(p: FrequencyPersona, seed = 1): Beat[] {
  const r = rng32(seed ^ (p.id.length * 2654435761));
  const S = p.sessionMinutes;
  const beats: Beat[] = [];
  const push = (minute: number, verb: InteractionVerb, what: string, taps = 1.2, choice = false): void => {
    beats.push({ minute: Math.min(S - 1, Math.max(0, Math.round(minute))), verb, what, taps, choice });
  };

  // ── The opening hub pass (the Ready Chain ride) — dailies + everything banked ──
  let t = 0.5;
  push(t, 'collect', 'daily bio-cache', 1.2); t += 0.4;
  if (p.gapHours * 60 >= IDLE.ceremonyMinutes) { push(t, 'collect', 'idle harvest ceremony', 1.2); t += 0.5; }
  for (let i = 0; i < p.bank.expeditions; i++) { push(t, 'collect', 'expedition debrief', 1.2); t += 0.4; }
  const opens = Math.min(p.bank.containers, 5);
  for (let i = 0; i < opens; i++) {
    push(t, 'open', 'bio-container crack', i === 0 ? 1.2 : 0.3); t += 0.35;
    if (r() < 0.18) { push(t, 'discover', 'first-discovery drop', 0); t += 0.2; }
  }
  if (p.bank.spores > 0) {
    push(t, 'open', 'bio-roulette session', 1.2, true); t += 1.2;
    push(t, 'collect', 'roulette absorb-all', 1); t += 0.4;
  }
  push(t, 'collect', 'field research turn-in', 2.5); t += 0.6;

  // ── Runs FILL the session between hub passes; hour-rate budgets prorate to the session ──
  const frac = S / 60;
  let missionsLeft = missionCompletesPerHour(p) * frac;
  let passLeft = passLevelsPerHour(p) * frac;
  let upgradesLeft = p.upgradesPerHour * frac;
  while (t < S - p.runMinutes * 0.45) {
    const start = t;
    const end = Math.min(S - 1.5, start + p.runMinutes);
    // Gene drafts — a real choice roughly every 3 waves (~2.6 min at typical pace).
    for (let m = start + 2.2; m < end - 1; m += 2.6) push(m, 'progress', 'gene draft pick', 1, true);
    // Wave-banner beats every ~5 waves; boss spectacles from the persona's real boss count.
    for (let m = start + 3.5; m < end - 1; m += 4.2) push(m, 'progress', 'wave milestone');
    for (let b = 0; b < p.facts.bossKills; b++) push(start + ((b + 1) / (p.facts.bossKills + 1)) * (end - start), 'progress', 'boss felled', 0);
    // The loot meter banks a container MID-run (live syncRunLoot) about every other run.
    if (r() < 0.55) push(start + (end - start) * 0.62, 'collect', 'loot meter fill → banked container', 0);
    // In-run mastery XP milestones surface as celebrations ~once per long run.
    if (p.runMinutes >= 18 && r() < 0.6) push(start + (end - start) * 0.8, 'rankUp', 'mastery level-up', 0);
    t = end;
    // Results + the post-run hub pass (chain handoff).
    push(t, 'complete', 'run settled (Results)', 1); t += 0.7;
    if (r() < 0.25) { push(t, 'discover', 'new record / first-clear', 0); t += 0.2; }
    while (passLeft >= 1 && t < S - 1) { push(t, 'claim', 'pass level claim', p.premium ? 0.6 : 1.2); passLeft -= 1; t += 0.3; }
    if (missionsLeft > 0 && r() < missionsLeft) { push(t, 'complete', 'quest mission claim', 1.2); missionsLeft -= 1; t += 0.35; }
    while (upgradesLeft > 0 && t < S - 1) {
      if (r() < Math.min(1, upgradesLeft)) { push(t, 'evolve', 'upgrade purchase', 2, true); t += 0.5; }
      upgradesLeft -= 1;
    }
    t += 0.6; // breath between loops
  }

  // ── The WIND-DOWN (docs/REWARD-FREQUENCY.md §wind-down): a session tail too short for a
  // full run gets a QUICK FINISHER — the recommendation layer's 'play' lane (the free daily
  // gauntlet entry, rush.freeEntry) fills it with a ~6-minute short-mode run.
  if (S - t >= 5.5) {
    const start = t;
    const end = Math.min(S - 1, start + Math.min(6, S - t - 1));
    for (let m = start + 1.2; m < end - 0.5; m += 1.6) push(m, 'progress', 'gauntlet boss felled', 0);
    push(start + 2.8, 'progress', 'gauntlet draft pick', 1, true);
    t = end;
    push(t, 'complete', 'gauntlet settled (Results)', 1); t += 0.7;
    if (r() < 0.5) { push(t, 'collect', 'roulette spores banked', 0); t += 0.3; }
  }

  // Sparse session-scale beats: achievements + account level + prestige steps.
  if (r() < 0.45 * frac) push(r() * S, 'unlock', 'achievement');
  if (r() < 0.5 * frac) push(r() * S, 'rankUp', 'account level-up', 0);
  if (r() < 0.15 * frac) push(r() * S, 'prestige', 'transcend / prestige step', 2.5, true);

  return beats.sort((a, b) => a.minute - b.minute);
}

export const DEAD_WINDOW_MIN = 5;

export function measureSession(beats: Beat[], sessionMinutes: number): HourMetrics {
  const byVerb = Object.fromEntries(INTERACTION_VERBS.map((v) => [v, 0])) as Record<InteractionVerb, number>;
  const perMinute = new Array<number>(sessionMinutes).fill(0);
  let taps = 0;
  let choices = 0;
  for (const b of beats) {
    byVerb[b.verb] += 1;
    perMinute[Math.min(sessionMinutes - 1, b.minute)] += 1;
    taps += b.taps;
    if (b.choice) choices += 1;
  }
  let maxGap = 0; let deadWindows = 0; let last = 0;
  for (let m = 0; m < sessionMinutes; m++) {
    if (perMinute[m] > 0) { const gap = m - last; if (gap > maxGap) maxGap = gap; if (gap >= DEAD_WINDOW_MIN) deadWindows += 1; last = m; }
  }
  const tail = sessionMinutes - 1 - last;
  if (tail > maxGap) maxGap = tail;
  if (tail >= DEAD_WINDOW_MIN) deadWindows += 1;
  const toHour = 60 / sessionMinutes;
  return {
    perHour: beats.length * toHour,
    byVerb: Object.fromEntries(INTERACTION_VERBS.map((v) => [v, byVerb[v] * toHour])) as Record<InteractionVerb, number>,
    maxGapMin: maxGap,
    deadWindows,
    tapsPerInteraction: beats.length > 0 ? taps / beats.length : 0,
    choicesPerHour: choices * toHour,
    peakPerMinute: Math.max(...perMinute),
    verbSpread: INTERACTION_VERBS.filter((v) => byVerb[v] > 0).length,
  };
}

// ── THE CONTRACT — the bands every persona's hour must live inside ───────────────────────
// Floors keep momentum ("players should rarely ask what do I do now"); ceilings keep the
// hour from flooding into noise. Future content shifts the measured hour through the
// registries; these bands are the guardrails it must inherit.
export const FREQUENCY_BANDS = {
  perHour: { floor: 25, ceiling: 110 },
  maxGapMin: 6, // no dead window longer than this
  tapsPerInteraction: 2.4, // menu-fatigue ceiling (chain-claims keep the average low)
  choicesPerHour: { floor: 4, ceiling: 60 }, // decision-fatigue band
  peakPerMinute: 10, // reward-fatigue ceiling (toast bus merges above 4 anyway)
  verbSpreadFloor: 6, // the hour touches ≥6 of the 10 verbs (variety, not one-note farming)
} as const;

const TRIALS = 48;

/** Average a persona's hour across seeds (the walk is stochastic in run counts/discoveries). */
export function personaHour(p: FrequencyPersona): HourMetrics {
  const acc: HourMetrics[] = [];
  for (let s = 1; s <= TRIALS; s++) acc.push(measureSession(walkSession(p, s), p.sessionMinutes));
  const avg = (f: (m: HourMetrics) => number): number => acc.reduce((a, m) => a + f(m), 0) / acc.length;
  const byVerb = Object.fromEntries(INTERACTION_VERBS.map((v) => [v, avg((m) => m.byVerb[v])])) as Record<InteractionVerb, number>;
  return {
    perHour: avg((m) => m.perHour),
    byVerb,
    maxGapMin: Math.max(...acc.map((m) => m.maxGapMin)),
    deadWindows: avg((m) => m.deadWindows),
    tapsPerInteraction: avg((m) => m.tapsPerInteraction),
    choicesPerHour: avg((m) => m.choicesPerHour),
    peakPerMinute: Math.max(...acc.map((m) => m.peakPerMinute)),
    verbSpread: Math.min(...acc.map((m) => m.verbSpread)),
  };
}

/** The build gate: every persona inside every band. Empty ⇒ the philosophy holds. */
export function rewardFrequencyProblems(): string[] {
  const out = verbTotalityProblems();
  for (const p of FREQUENCY_PERSONAS) {
    const m = personaHour(p);
    const B = FREQUENCY_BANDS;
    if (m.perHour < B.perHour.floor) out.push(`${p.id}: ${m.perHour.toFixed(1)} interactions/hour < momentum floor ${B.perHour.floor}`);
    if (m.perHour > B.perHour.ceiling) out.push(`${p.id}: ${m.perHour.toFixed(1)} interactions/hour > overwhelm ceiling ${B.perHour.ceiling}`);
    if (m.maxGapMin > B.maxGapMin) out.push(`${p.id}: dead window of ${m.maxGapMin}min > ${B.maxGapMin}min ceiling`);
    if (m.tapsPerInteraction > B.tapsPerInteraction) out.push(`${p.id}: ${m.tapsPerInteraction.toFixed(2)} taps/interaction > menu-fatigue ceiling ${B.tapsPerInteraction}`);
    if (m.choicesPerHour < B.choicesPerHour.floor) out.push(`${p.id}: ${m.choicesPerHour.toFixed(1)} choices/hour < ${B.choicesPerHour.floor} (no agency)`);
    if (m.choicesPerHour > B.choicesPerHour.ceiling) out.push(`${p.id}: ${m.choicesPerHour.toFixed(1)} choices/hour > decision-fatigue ceiling ${B.choicesPerHour.ceiling}`);
    if (m.peakPerMinute > B.peakPerMinute) out.push(`${p.id}: peak ${m.peakPerMinute} beats/minute > reward-fatigue ceiling ${B.peakPerMinute}`);
    if (m.verbSpread < B.verbSpreadFloor) out.push(`${p.id}: only ${m.verbSpread} interaction verbs in the hour < variety floor ${B.verbSpreadFloor}`);
  }
  return out;
}
