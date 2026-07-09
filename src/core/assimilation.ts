// THE ASSIMILATION INDEX (docs/ASSIMILATION.md) — the game's hidden MASTER STATE. One continuous
// 0..1 number that measures how thoroughly the player has assimilated the battlefield during the
// CURRENT RUN, and the single driver every dynamic presentation system keys on (music intensity,
// screen FX, camera breathing, HUD glow, battlefield mutation, tower/hero/nucleus richness).
//
// It is NOT a currency, NOT a progression system, NOT player-upgradable. It is DERIVED — a weighted
// fold of contributions from every active system — so systems evolve TOGETHER instead of each
// inventing its own thresholds. New content plugs in two ways, neither of which touches gameplay
// code: (1) implicitly, because most strength folds into the Power Score which is our dominant
// contributor; (2) explicitly, by registering a ContributionProfile (a data row) that reads a named
// custom signal. See docs/ASSIMILATION.md §Extension.
//
// Architecture mirrors the danger-camera (src/core/dangerCamera.ts): a PURE, geometry-free,
// zero-allocation state machine. The caller owns the state object and steps it; RENDER-ONLY by
// contract — nothing in the sim reads the index back, so a fixed seed's outcome is untouched and
// this module never imports React/DOM/state/render (docs/GAME_CONSTITUTION.md rule 12).

// ── Inputs ─────────────────────────────────────────────────────────────────────────────────────

/** The raw run signals the index folds. The Game fills these from live run state
 *  (game.assimilationSignals()); `custom` is the open seam for future systems (see below). */
export interface AssimilationSignals {
  wave: number; // current wave / Infinite depth / Boss-Rush depth
  totalWaves: number; // authored total (0 for open-ended modes)
  currentBiomass: number; // biomass banked right now (spendable pressure)
  biomassGenerated: number; // biomass earned across the run (cumulative conquest)
  kills: number; // enemies assimilated this run
  bossKills: number; // bosses defeated this run
  megaKills: number; // Mega Bosses defeated this run (battlefield-scale)
  towerCount: number; // organisms fielded
  heroCount: number; // champions present
  strainSum: number; // Σ (tower strain − 1) — in-run mutation depth on the field
  branchTierSum: number; // Σ tower branch tier — in-run specialization depth
  activeBuffs: number; // run-wide buffs currently live
  runPower: number; // live run Power Score (the unified strength number — folds nearly everything)
  integrityFrac: number; // Hive integrity 0..1 (besieged vs. untouched — a minor flavor input)
  time: number; // sim seconds (pulse phase for presentation)
  /** Open extension seam: future systems inject named signals here and register a
   *  ContributionProfile that reads them — no change to this interface or any gameplay code. */
  custom?: Record<string, number>;
}

/** A neutral signal bag — every contributor reads 0 ⇒ index 0 (Contained). Used for tests/previews. */
export function zeroSignals(): AssimilationSignals {
  return {
    wave: 0, totalWaves: 0, currentBiomass: 0, biomassGenerated: 0, kills: 0, bossKills: 0,
    megaKills: 0, towerCount: 0, heroCount: 0, strainSum: 0, branchTierSum: 0, activeBuffs: 0,
    runPower: 0, integrityFrac: 1, time: 0,
  };
}

// ── Contribution profiles (the data registry — the extension surface) ────────────────────────────

export type ContributionGroup = 'strength' | 'tempo' | 'conquest' | 'battlefield';

/** One weighted contributor. `read` pulls a raw ≥0 signal; `half` is the soft-saturation constant
 *  (the raw value that reads 0.5). Sub-score = read/(read+half) ∈ [0,1) — smooth, monotonic, never
 *  "flips on", asymptotes to 1. A new system = one more row (or one registered at runtime). */
export interface ContributionProfile {
  id: string;
  label: string;
  group: ContributionGroup;
  weight: number; // relative pull on the index
  half: number; // soft-saturation half point (raw value → 0.5 sub-score)
  read: (s: AssimilationSignals) => number;
}

const sat = (x: number, half: number): number => (x <= 0 ? 0 : x / (x + half));

/** The canonical contributors. Weights/half-points are tunables — rebalance freely here
 *  (docs/GAME_CONSTITUTION.md rule 15: balance lives in data, in one place). */
export const CONTRIBUTIONS: readonly ContributionProfile[] = [
  // STRENGTH — the accumulated-power baseline. Power Score already folds prestige, gene cards,
  // equipment, mastery, stars, branches, mulligans, collection… so this ONE row makes every
  // present and future progression system raise Assimilation with no extra wiring.
  { id: 'power', label: 'Assimilated Power', group: 'strength', weight: 3.0, half: 4200, read: (s) => s.runPower },
  // TEMPO — the moment-to-moment climb of a single run.
  { id: 'wave', label: 'Wave Depth', group: 'tempo', weight: 2.2, half: 16, read: (s) => s.wave },
  { id: 'biomass', label: 'Live Biomass', group: 'tempo', weight: 0.9, half: 1400, read: (s) => s.currentBiomass },
  { id: 'buffs', label: 'Active Adaptations', group: 'tempo', weight: 0.5, half: 5, read: (s) => s.activeBuffs },
  // CONQUEST — cumulative dominance over the wave.
  { id: 'kills', label: 'Assimilated Enemies', group: 'conquest', weight: 1.4, half: 260, read: (s) => s.kills },
  { id: 'biomassGen', label: 'Total Biomass Reclaimed', group: 'conquest', weight: 1.0, half: 6000, read: (s) => s.biomassGenerated },
  { id: 'bosses', label: 'Bosses Broken', group: 'conquest', weight: 1.6, half: 3.5, read: (s) => s.bossKills },
  { id: 'megaBosses', label: 'Mega Bosses Consumed', group: 'conquest', weight: 2.0, half: 1.5, read: (s) => s.megaKills },
  // BATTLEFIELD — how developed the player's living infestation is on the field right now.
  { id: 'towers', label: 'Fielded Organisms', group: 'battlefield', weight: 1.0, half: 11, read: (s) => s.towerCount },
  { id: 'heroes', label: 'Champions Present', group: 'battlefield', weight: 0.6, half: 2.5, read: (s) => s.heroCount },
  { id: 'strain', label: 'Strain Mutation', group: 'battlefield', weight: 1.0, half: 26, read: (s) => s.strainSum },
  { id: 'branches', label: 'Branch Specialization', group: 'battlefield', weight: 0.8, half: 18, read: (s) => s.branchTierSum },
];

// Runtime extension registry (docs/ASSIMILATION.md §Extension) — future systems push a profile here
// at module init; the fold consumes them automatically. Kept separate from the canonical list so the
// base fold stays a stable, testable constant.
const EXTRA_CONTRIBUTIONS: ContributionProfile[] = [];

/** Register a contribution profile at runtime (idempotent by id). The profile typically reads a
 *  `custom` signal the owning system injects into AssimilationSignals — so a new system contributes
 *  to the master state without editing this file or any gameplay code. */
export function registerAssimilationContribution(p: ContributionProfile): void {
  const at = EXTRA_CONTRIBUTIONS.findIndex((e) => e.id === p.id);
  if (at >= 0) EXTRA_CONTRIBUTIONS[at] = p;
  else EXTRA_CONTRIBUTIONS.push(p);
}

/** All active contributors (canonical + registered). */
export function allContributions(): ContributionProfile[] {
  return [...CONTRIBUTIONS, ...EXTRA_CONTRIBUTIONS];
}

// ── The fold ─────────────────────────────────────────────────────────────────────────────────────

export interface ContributionResult {
  id: string;
  label: string;
  group: ContributionGroup;
  score: number; // 0..1 saturated sub-score
  weight: number;
  share: number; // fraction of the final index this contributor supplied (0..1)
}

export interface AssimilationBreakdown {
  /** The raw target index 0..1 (a weighted mean of sub-scores ⇒ inherently bounded). */
  raw: number;
  contributions: ContributionResult[];
}

/** Pure fold of signals → target index + per-contributor breakdown. Cheap (a dozen ops); the caller
 *  may throttle it (event-driven), but it is safe to call per frame. */
export function computeAssimilation(s: AssimilationSignals): AssimilationBreakdown {
  const profiles = allContributions();
  let totalW = 0;
  let acc = 0;
  const parts: { p: ContributionProfile; score: number }[] = [];
  for (const p of profiles) {
    const score = sat(Math.max(0, p.read(s)), p.half);
    parts.push({ p, score });
    acc += score * p.weight;
    totalW += p.weight;
  }
  const raw = totalW > 0 ? Math.min(1, acc / totalW) : 0;
  const contributions: ContributionResult[] = parts.map(({ p, score }) => ({
    id: p.id, label: p.label, group: p.group, score, weight: p.weight,
    share: acc > 0 ? (score * p.weight) / acc : 0,
  }));
  return { raw, contributions };
}

// ── Evolution tiers ──────────────────────────────────────────────────────────────────────────────

export interface AssimilationTier {
  index: number; // 0..5
  id: string;
  name: string;
  at: number; // lower bound on the index [0,1]
  /** Signature RGB accent (the presentation blends between adjacent tiers by progress). */
  color: [number, number, number];
  /** One-line fiction, surfaced by the debug panel + docs. */
  blurb: string;
}

/** The six presentation tiers — Contained infestation → Planetary organism. Bounds are the LOWER
 *  edge; a tier smoothly blends into the next (no hard flips). 6 evolution tiers. */
export const ASSIMILATION_TIERS: readonly AssimilationTier[] = [
  { index: 0, id: 'contained', name: 'Contained', at: 0.0, color: [70, 140, 150], blurb: 'A contained infestation. The battlefield is still theirs.' },
  { index: 1, id: 'colonization', name: 'Colonization', at: 0.12, color: [80, 180, 140], blurb: 'The infection takes root. Tendrils spread from the Hive.' },
  { index: 2, id: 'expansion', name: 'Expansion', at: 0.28, color: [150, 200, 90], blurb: 'A growing infection. The terrain begins to answer to you.' },
  { index: 3, id: 'dominance', name: 'Dominance', at: 0.46, color: [220, 180, 70], blurb: 'Regional takeover. The battlefield is becoming an organ.' },
  { index: 4, id: 'ascension', name: 'Ascension', at: 0.64, color: [230, 110, 90], blurb: 'Ascension. The world convulses around your growth.' },
  { index: 5, id: 'planetary', name: 'Planetary Assimilation', at: 0.82, color: [220, 80, 190], blurb: 'A planetary organism, fully awake. Nothing here is not you.' },
];

/** The tier owning `index`, and the 0..1 progress toward the NEXT tier (1 at the top tier). */
export function tierAt(index: number): { tier: AssimilationTier; progress: number } {
  const x = Math.min(1, Math.max(0, index));
  let ti = 0;
  for (let i = ASSIMILATION_TIERS.length - 1; i >= 0; i--) {
    if (x >= ASSIMILATION_TIERS[i].at) { ti = i; break; }
  }
  const tier = ASSIMILATION_TIERS[ti];
  const next = ASSIMILATION_TIERS[ti + 1];
  const progress = next ? Math.min(1, (x - tier.at) / (next.at - tier.at)) : 1;
  return { tier, progress };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The accent color at `index`, blended smoothly across the tier boundary (never a hard swap). */
export function tierColorAt(index: number): [number, number, number] {
  const { tier, progress } = tierAt(index);
  const next = ASSIMILATION_TIERS[tier.index + 1] ?? tier;
  const t = smoothstep(progress);
  return [
    Math.round(lerp(tier.color[0], next.color[0], t)),
    Math.round(lerp(tier.color[1], next.color[1], t)),
    Math.round(lerp(tier.color[2], next.color[2], t)),
  ];
}

// ── The smoothed running state (caller-owned, zero-allocation step) ──────────────────────────────

export interface AssimilationState {
  /** The one smoothed output 0..1 — every presentation system keys on THIS, never the raw target. */
  index: number;
  /** The most recent computed target (pre-smoothing). */
  target: number;
  /** Current tier index 0..5 and the 0..1 progress toward the next (mirrors tierAt(index)). */
  tier: number;
  tierProgress: number;
  /** Dev override 0..1 (debug panel). When non-null the state eases toward it instead of the run
   *  target — RENDER-ONLY, never persisted. */
  override: number | null;
}

export function initialAssimilation(): AssimilationState {
  return { index: 0, target: 0, tier: 0, tierProgress: 0, override: null };
}

export const ASSIM = {
  riseRate: 0.9, // index ease-in per second toward a higher target (the organism grows briskly)
  fallRate: 0.3, // ease-out per second toward a lower target (it relaxes slowly — never snaps down)
  overrideRate: 2.4, // ease rate while a dev override is engaged (snappier, for previewing)
};

/** Advance the smoothed index toward `target` (or the dev override) by `dt` sim-seconds. Mutates
 *  `s` in place. Asymmetric ease: rises faster than it falls, so a lull never collapses the mood.
 *  Safe at any dt (pause = not called; speed rides dt; huge dt clamps to a stable step). */
export function stepAssimilation(s: AssimilationState, target: number, dt: number): void {
  const goal = s.override !== null ? clamp01(s.override) : clamp01(target);
  s.target = clamp01(target);
  const rate = s.override !== null ? ASSIM.overrideRate : goal > s.index ? ASSIM.riseRate : ASSIM.fallRate;
  s.index += (goal - s.index) * Math.min(1, Math.max(0, rate) * dt);
  if (Math.abs(goal - s.index) < 0.0005) s.index = goal; // settle exactly at rest
  const { tier, progress } = tierAt(s.index);
  s.tier = tier.index;
  s.tierProgress = progress;
}

// ── Derived presentation bundle (what consumers actually read) ────────────────────────────────────

/** Every presentation channel the master state drives, derived from the smoothed index. Consumers
 *  read this bundle instead of re-deriving thresholds — so the whole game evolves in lockstep.
 *  All channels are readability-preserving (edge/veil intensities stay subtle by construction). */
export interface AssimilationPresentation {
  index: number;
  tier: number;
  tierName: string;
  tierProgress: number;
  color: [number, number, number]; // smoothly-blended accent
  musicIntensity: number; // 0..1 → music.setIntensity floor (combat pressure rides ON TOP)
  vignette: number; // 0..1 organic edge-darkening strength
  glow: number; // 0..1 tier-tinted rim-glow strength
  spore: number; // 0..1 ambient spore/mote density
  saturation: number; // 0..1 biome tint strength (very subtle)
  cameraAmp: number; // view-scale heartbeat amplitude (tiny — never disorienting)
  cameraHz: number; // heartbeat frequency (Hz)
  hudGlow: number; // 0..1 HUD organic-accent strength (CSS var)
}

export function assimilationPresentation(s: AssimilationState): AssimilationPresentation {
  const x = clamp01(s.index);
  const e = smoothstep(x); // ease the perceptual response so low index stays calm
  const { tier } = tierAt(x);
  return {
    index: x,
    tier: tier.index,
    tierName: tier.name,
    tierProgress: s.tierProgress,
    color: tierColorAt(x),
    musicIntensity: 0.18 + 0.82 * x,
    vignette: 0.08 + 0.30 * e,
    glow: 0.04 + 0.20 * e,
    spore: e,
    saturation: 0.05 * e,
    cameraAmp: 0.0012 + 0.0030 * e, // ≤0.42% scale — a breath, not a zoom
    cameraHz: 0.55 + 0.45 * x, // resting ~33bpm → excited ~60bpm heartbeat
    hudGlow: e,
  };
}

// ── small pure helpers ───────────────────────────────────────────────────────────────────────────

function clamp01(x: number): number { return Math.min(1, Math.max(0, x)); }

/** Smootherstep — zero first-derivative at both ends (soft accel AND decel). */
export function smoothstep(x: number): number {
  const t = clamp01(x);
  return t * t * t * (t * (t * 6 - 15) + 10);
}
