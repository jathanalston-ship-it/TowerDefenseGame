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
  weakPoints: number; // weak points ruptured this run (elite/boss dismantling — a cheap monotonic counter)
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
    megaKills: 0, weakPoints: 0, towerCount: 0, heroCount: 0, strainSum: 0, branchTierSum: 0, activeBuffs: 0,
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
  { id: 'weakPoints', label: 'Weak Points Ruptured', group: 'conquest', weight: 1.2, half: 14, read: (s) => s.weakPoints },
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

// ── The four pillars (group weighting) ───────────────────────────────────────────────────────────
// The fold is GROUP-NORMALIZED: each group yields its OWN weighted-mean sub-score, then the four
// group scores combine by these weights. This keeps the pillars balanced no matter how many
// contributors each holds — adding a battlefield row rebalances only WITHIN battlefield and can
// never swamp conquest (docs/GAME_CONSTITUTION.md — build for the target content scale). Strength
// stays the dominant single pillar because the Power Score is the universal contributor (rule 1).

export const GROUP_WEIGHTS: Record<ContributionGroup, number> = {
  strength: 3.0, tempo: 2.0, conquest: 2.6, battlefield: 2.0,
};
const GROUP_ORDER: readonly ContributionGroup[] = ['strength', 'tempo', 'conquest', 'battlefield'];
/** group id → dense index 0..3 (for the scratch accumulators). */
const GI: Record<ContributionGroup, number> = { strength: 0, tempo: 1, conquest: 2, battlefield: 3 };

// ── The fold ─────────────────────────────────────────────────────────────────────────────────────

export interface ContributionResult {
  id: string;
  label: string;
  group: ContributionGroup;
  score: number; // 0..1 saturated sub-score
  weight: number;
  share: number; // fraction of the final index this contributor supplied (0..1)
}

/** One pillar's aggregate (for the debug panel). */
export interface GroupResult {
  group: ContributionGroup;
  score: number; // 0..1 weighted-mean sub-score of the group's contributors
  weight: number; // the group's pull on the final index
  share: number; // fraction of the final index this pillar supplied (0..1)
}

export interface AssimilationBreakdown {
  /** The raw target index 0..1 (a group-normalized weighted mean ⇒ inherently bounded). */
  raw: number;
  contributions: ContributionResult[];
  groups: GroupResult[];
}

// Reused scratch accumulators for the ZERO-ALLOCATION hot fold (single-threaded; filled and read
// within one synchronous call, never retained). Indexed by GI: 0 strength · 1 tempo · 2 conquest ·
// 3 battlefield. num = Σ weight·score, den = Σ weight within the group.
const _num = [0, 0, 0, 0];
const _den = [0, 0, 0, 0];

/** ALLOCATION-FREE hot path: signals → the target index 0..1 ONLY (no breakdown). The run loop folds
 *  this at ~8Hz, so it iterates the contributor arrays directly and accumulates into reused scratch
 *  scalars — no arrays, no objects, no per-frame GC. Group-normalized (the four pillars stay balanced
 *  at any content scale). computeAssimilation() returns the SAME `raw` plus a full breakdown for the
 *  debug panel (cold path). */
export function computeAssimilationTarget(s: AssimilationSignals): number {
  _num[0] = _num[1] = _num[2] = _num[3] = 0;
  _den[0] = _den[1] = _den[2] = _den[3] = 0;
  for (const p of CONTRIBUTIONS) { const g = GI[p.group]; _num[g] += sat(p.read(s), p.half) * p.weight; _den[g] += p.weight; }
  for (const p of EXTRA_CONTRIBUTIONS) { const g = GI[p.group]; _num[g] += sat(p.read(s), p.half) * p.weight; _den[g] += p.weight; }
  let accN = 0;
  let accD = 0;
  for (let g = 0; g < 4; g++) {
    if (_den[g] > 0) { const gw = GROUP_WEIGHTS[GROUP_ORDER[g]]; accN += (_num[g] / _den[g]) * gw; accD += gw; }
  }
  return accD > 0 ? Math.min(1, accN / accD) : 0;
}

/** Pure fold of signals → target index + per-contributor + per-pillar breakdown. Allocates (the cold
 *  path — the debug panel). Its `raw` is identical to computeAssimilationTarget(s). */
export function computeAssimilation(s: AssimilationSignals): AssimilationBreakdown {
  const profiles = allContributions();
  const num = [0, 0, 0, 0];
  const den = [0, 0, 0, 0];
  const scoreById = new Map<string, number>();
  for (const p of profiles) {
    const score = sat(p.read(s), p.half);
    scoreById.set(p.id, score);
    const g = GI[p.group];
    num[g] += score * p.weight;
    den[g] += p.weight;
  }
  let accN = 0;
  let accD = 0;
  for (let g = 0; g < 4; g++) {
    if (den[g] > 0) { const gw = GROUP_WEIGHTS[GROUP_ORDER[g]]; accN += (num[g] / den[g]) * gw; accD += gw; }
  }
  const raw = accD > 0 ? Math.min(1, accN / accD) : 0;
  // A contributor's absolute pull on the (pre-clamp) index: (its group's weight / Σ active group
  // weight) · (its weighted score / its group denom). These sum to `accN/accD`, so share = pull/Σpull.
  const pullOf = (p: ContributionProfile): number => {
    const g = GI[p.group];
    return den[g] > 0 && accD > 0 ? (GROUP_WEIGHTS[p.group] / accD) * (((scoreById.get(p.id) ?? 0) * p.weight) / den[g]) : 0;
  };
  const totalPull = profiles.reduce((a, p) => a + pullOf(p), 0);
  const contributions: ContributionResult[] = profiles.map((p) => ({
    id: p.id, label: p.label, group: p.group, score: scoreById.get(p.id) ?? 0, weight: p.weight,
    share: totalPull > 0 ? pullOf(p) / totalPull : 0,
  }));
  const groups: GroupResult[] = GROUP_ORDER.map((grp, g) => {
    const gw = GROUP_WEIGHTS[grp];
    const gScore = den[g] > 0 ? num[g] / den[g] : 0;
    return { group: grp, score: gScore, weight: gw, share: accN > 0 && den[g] > 0 ? (gScore * gw) / accN : 0 };
  });
  return { raw, contributions, groups };
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
  /** Highest tier the run has ever reached — the Ascension Moment fires only on a NEW peak, so the
   *  slow relax never re-triggers it. Monotonically non-decreasing across a run. */
  peakTier: number;
  /** 0..1 decaying pulse set to 1 the instant the run crosses into a higher tier; drives the
   *  screen flourish (bloom + ring + tier-name). Eases to 0 over ASSIM.ascendHold seconds. */
  ascensionPulse: number;
  /** Which tier the current pulse is announcing (the flourish names it even as the index eases). */
  ascendedTier: number;
}

export function initialAssimilation(): AssimilationState {
  return { index: 0, target: 0, tier: 0, tierProgress: 0, override: null, peakTier: 0, ascensionPulse: 0, ascendedTier: 0 };
}

export const ASSIM = {
  riseRate: 0.9, // index ease-in per second toward a higher target (the organism grows briskly)
  fallRate: 0.3, // ease-out per second toward a lower target (it relaxes slowly — never snaps down)
  overrideRate: 2.4, // ease rate while a dev override is engaged (snappier, for previewing)
  ascendHold: 2.6, // seconds the Ascension flourish takes to decay from 1 → 0
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
  // Ascension Moment: the FIRST time the run reaches a higher integer tier, fire a decaying pulse
  // (the payoff for the hidden heartbeat — the veil blooms and names the new tier). Gated on a
  // strictly-increasing peak so the slow relax never re-fires it; a dev override earns previews too.
  if (tier.index > s.peakTier) {
    s.peakTier = tier.index;
    s.ascendedTier = tier.index;
    s.ascensionPulse = 1;
  } else if (s.ascensionPulse > 0) {
    s.ascensionPulse = Math.max(0, s.ascensionPulse - dt / ASSIM.ascendHold);
  }
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
  vein: number; // 0..1 membrane-vein density (high-tier only — the world becomes tissue)
  ascensionPulse: number; // 0..1 decaying flourish pulse (0 except right after a tier crossing)
  ascendedTier: number; // the tier the current pulse announces (0..5)
  ascendedName: string; // that tier's name (for the flourish caption)
}

export function assimilationPresentation(s: AssimilationState): AssimilationPresentation {
  const x = clamp01(s.index);
  const e = smoothstep(x); // ease the perceptual response so low index stays calm
  const { tier } = tierAt(x);
  const at = Math.min(ASSIMILATION_TIERS.length - 1, Math.max(0, Math.round(s.ascendedTier)));
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
    vein: smoothstep(clamp01((x - 0.42) / 0.58)), // membranes surface past ~Dominance
    ascensionPulse: clamp01(s.ascensionPulse),
    ascendedTier: at,
    ascendedName: ASSIMILATION_TIERS[at].name,
  };
}

// ── small pure helpers ───────────────────────────────────────────────────────────────────────────

function clamp01(x: number): number { return Math.min(1, Math.max(0, x)); }

/** Smootherstep — zero first-derivative at both ends (soft accel AND decel). */
export function smoothstep(x: number): number {
  const t = clamp01(x);
  return t * t * t * (t * (t * 6 - 15) + 10);
}
