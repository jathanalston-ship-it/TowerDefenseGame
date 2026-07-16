// ARENA (docs/ARENA.md) — the live PvP pillar's pure core: ranked divisions, the rating model
// (placements, streaks, decay, seasonal soft reset), 30-day UTC seasons, Power-Score
// matchmaking brackets with the 20-second AI fallback, match outcome resolution (the mirror
// SIEGE RACE ruleset), reward tables, and the SHARED match-claim validation the Pages Function
// re-runs server-side (functions/api/arena/report.ts imports this module — the premium.ts
// shared-code precedent, so client promise and server truth can never diverge).
//
// No sim import, no DOM, no Math.random — every roll takes a seeded rng or is closed-form.
// A fresh save has rating 0 / no arena record ⇒ nothing here can perturb the golden runs.

import type { PassReward } from './battlePass';

// ── Season clock (30-day UTC windows from a fixed epoch) ───────────────────────
export const ARENA = {
  /** Season length — the spec's 30 days, counted from a fixed UTC epoch. */
  seasonMs: 30 * 86_400_000,
  epochMs: Date.UTC(2026, 7, 1), // 2026-08-01T00:00Z — season 1 opens with the arena's release
  /** Matchmaking: hard search ceiling before the AI opponent takes the slot (spec: 20s). */
  searchSec: 20,
  /** Power-Score bracket: start ±15%, widen to ±60% across the search window. */
  bracketStartFrac: 0.15,
  bracketEndFrac: 0.6,
  /** Match ruleset (the mirror SIEGE RACE — docs/ARENA.md §ruleset). */
  matchSec: 300, // PvP timer: hard cap; survivors resolve on the tiebreak ladder
  /** Rating model. */
  placementMatches: 5,
  kPlacement: 96, // rating swing during placements (finds your level fast)
  kNormal: 32,
  eloScale: 400, // classic logistic scale
  streakBonus: 4, // + per consecutive win past the first (capped below)
  streakCap: 5,
  ratingFloor: 0, // ratings never go negative
  /** Seasonal soft reset: new = base + (old − base) × carry. */
  resetBase: 600,
  resetCarry: 0.5,
  /** Rank decay (top divisions only): after idleDays, −decayPerDay until the decayFloor. */
  decayIdleDays: 7,
  decayPerDay: 15,
  /** AI opponents: rating the fallback pretends to hold = yours ± jitter (fair by design). */
  aiRatingJitter: 40,
  /** Match rewards (validated server-side; deliberately modest — the ARENA PASS is the real
   *  payout lane). WINS pay in CONTAINERS (a division-banded Bio-Container + a Run Cache);
   *  LOSSES pay standard resources only (Genome Cores + salvage materials) so a hard match is
   *  never worthless but containers stay a victory lane. */
  lossCores: 25,
  drawCores: 55,
  winPassXp: 10, // arena-pass XP per WIN (losses pay zero — spec: only wins advance)
} as const;

export function arenaSeasonIndex(now: number): number {
  return Math.max(0, Math.floor((now - ARENA.epochMs) / ARENA.seasonMs)) + 1; // 1-based
}
export function arenaSeasonStart(season: number): number {
  return ARENA.epochMs + (season - 1) * ARENA.seasonMs;
}
export function msToSeasonEnd(now: number): number {
  return arenaSeasonStart(arenaSeasonIndex(now) + 1) - now;
}

// ── Divisions (the Assimilate ladder — spec's Bronze/Silver/Gold, re-fleshed) ──
export interface ArenaDivisionDef {
  id: string;
  name: string; // "Spore III"
  tier: 'spore' | 'larval' | 'chrysalis' | 'apex';
  glyph: string;
  color: string;
  minRating: number;
  /** Rank decay applies from this division upward (spec: "decay where appropriate"). */
  decays: boolean;
}

/** Ten divisions, lowest first. Thresholds are data — retune without code. */
export const ARENA_DIVISIONS: readonly ArenaDivisionDef[] = [
  { id: 'spore3', name: 'Spore III', tier: 'spore', glyph: '·', color: '#8a9a8a', minRating: 0, decays: false },
  { id: 'spore2', name: 'Spore II', tier: 'spore', glyph: ':', color: '#8a9a8a', minRating: 400, decays: false },
  { id: 'spore1', name: 'Spore I', tier: 'spore', glyph: '∴', color: '#8a9a8a', minRating: 700, decays: false },
  { id: 'larval3', name: 'Larval III', tier: 'larval', glyph: '⌒', color: '#7fd08f', minRating: 1000, decays: false },
  { id: 'larval2', name: 'Larval II', tier: 'larval', glyph: '≈', color: '#7fd08f', minRating: 1250, decays: false },
  { id: 'larval1', name: 'Larval I', tier: 'larval', glyph: '≋', color: '#7fd08f', minRating: 1500, decays: false },
  { id: 'chrysalis2', name: 'Chrysalis II', tier: 'chrysalis', glyph: '◍', color: '#5fb8ff', minRating: 1800, decays: true },
  { id: 'chrysalis1', name: 'Chrysalis I', tier: 'chrysalis', glyph: '◉', color: '#5fb8ff', minRating: 2100, decays: true },
  { id: 'apex2', name: 'Apex Strain II', tier: 'apex', glyph: '❖', color: '#ffb64d', minRating: 2400, decays: true },
  { id: 'apex1', name: 'Apex Strain', tier: 'apex', glyph: '✦', color: '#ff4d6d', minRating: 2800, decays: true },
];

export function divisionForRating(rating: number): ArenaDivisionDef {
  let out = ARENA_DIVISIONS[0];
  for (const d of ARENA_DIVISIONS) if (rating >= d.minRating) out = d;
  return out;
}
export function divisionIndex(rating: number): number {
  return ARENA_DIVISIONS.indexOf(divisionForRating(rating));
}

// ── Rating model ───────────────────────────────────────────────────────────────
/** Expected score of `a` vs `b` (classic logistic). */
export function expectedScore(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / ARENA.eloScale));
}

/** Rating delta for one match. Placements swing hard (K=96); streaks pay a small bonus on
 *  wins. NEVER trusted from the client — the server recomputes it from the same inputs. */
export function ratingDelta(args: { rating: number; oppRating: number; won: boolean; placementsLeft: number; streak: number }): number {
  const k = args.placementsLeft > 0 ? ARENA.kPlacement : ARENA.kNormal;
  const expected = expectedScore(args.rating, args.oppRating);
  const score = args.won ? 1 : 0;
  let delta = Math.round(k * (score - expected));
  if (args.won) delta += Math.min(ARENA.streakCap, Math.max(0, args.streak)) * ARENA.streakBonus;
  // A win never pays ≤ 0 and a loss never pays ≥ 0 (fairness floor — spec: never obviously unfair).
  if (args.won) delta = Math.max(1, delta);
  else delta = Math.min(-1, delta);
  return delta;
}

export function applyRatingFloor(rating: number): number {
  return Math.max(ARENA.ratingFloor, Math.round(rating));
}

/** Seasonal soft reset (spec: seasonal resets): pull toward resetBase, keep half the spread. */
export function seasonResetRating(oldRating: number): number {
  return applyRatingFloor(ARENA.resetBase + (oldRating - ARENA.resetBase) * ARENA.resetCarry);
}

/** Lazy rank decay: idle days past the grace window bleed rating, only in decaying divisions,
 *  never below the highest non-decaying threshold (you can't decay out of Larval I). */
export function decayedRating(rating: number, lastPlayedAt: number, now: number): number {
  const div = divisionForRating(rating);
  if (!div.decays || lastPlayedAt <= 0) return rating;
  const idleDays = Math.floor((now - lastPlayedAt) / 86_400_000);
  const decayDays = idleDays - ARENA.decayIdleDays;
  if (decayDays <= 0) return rating;
  const floor = ARENA_DIVISIONS.filter((d) => !d.decays).reduce((a, d) => Math.max(a, d.minRating), 0);
  return Math.max(floor, rating - decayDays * ARENA.decayPerDay);
}

// ── Matchmaking model (pure — the transport layer executes it) ────────────────
/** The live search state at `elapsedSec` into a queue, for a player at `power`.
 *  Brackets WIDEN over the window (spec) and the console renders every field. */
export interface MatchSearchState {
  elapsedSec: number;
  /** Acceptable opponent Power window (low..high) right now. */
  powerLow: number;
  powerHigh: number;
  /** 0..1 across the search window (drives the console's sweep animation). */
  frac: number;
  /** Seconds until the AI fallback fires. */
  aiInSec: number;
  /** Honest estimated wait copy: the fallback GUARANTEES a match inside the window. */
  estimatedWaitSec: number;
}

export function matchSearchState(elapsedSec: number, power: number): MatchSearchState {
  const t = Math.max(0, Math.min(ARENA.searchSec, elapsedSec));
  const frac = t / ARENA.searchSec;
  const spread = ARENA.bracketStartFrac + (ARENA.bracketEndFrac - ARENA.bracketStartFrac) * frac;
  return {
    elapsedSec: t,
    powerLow: Math.max(0, Math.round(power * (1 - spread))),
    powerHigh: Math.round(power * (1 + spread)),
    frac,
    aiInSec: Math.max(0, ARENA.searchSec - t),
    estimatedWaitSec: ARENA.searchSec,
  };
}

/** Would an opponent at `oppPower` be a fair match at this point of the search? */
export function opponentInBracket(state: MatchSearchState, oppPower: number): boolean {
  return oppPower >= state.powerLow && oppPower <= state.powerHigh;
}

// ── Match outcome (the mirror SIEGE RACE ruleset — docs/ARENA.md §ruleset) ─────
/** One combatant's terminal facts, read from its sim when the match ends. */
export interface ArenaSideResult {
  integrityFrac: number; // nucleus integrity 0..1 at match end (0 = fell)
  waveReached: number;
  damageDealt: number;
  fellAtSec: number | null; // sim-time the nucleus fell (null = survived)
}

/** Resolve the winner: first nucleus to fall loses; if both stand at the timer (or both fell
 *  the same tick), the ladder is integrity% → waves cleared → damage → draw. */
export function resolveArenaOutcome(local: ArenaSideResult, remote: ArenaSideResult): 'win' | 'loss' | 'draw' {
  const lFell = local.fellAtSec !== null ? local.fellAtSec : Infinity;
  const rFell = remote.fellAtSec !== null ? remote.fellAtSec : Infinity;
  if (lFell !== rFell) return lFell > rFell ? 'win' : 'loss';
  if (local.integrityFrac !== remote.integrityFrac) return local.integrityFrac > remote.integrityFrac ? 'win' : 'loss';
  if (local.waveReached !== remote.waveReached) return local.waveReached > remote.waveReached ? 'win' : 'loss';
  if (local.damageDealt !== remote.damageDealt) return local.damageDealt > remote.damageDealt ? 'win' : 'loss';
  return 'draw';
}

// ── Match claims + SHARED validation (client settle + server re-check) ────────
/** The settle-time claim (client → meta.settleArenaMatch; online → functions/api/arena/report).
 *  Rewards/rating are NEVER fields here — both sides DERIVE them from these facts. */
export interface ArenaMatchClaim {
  matchId: string; // uuid-ish; the exactly-once key on both sides
  season: number;
  outcome: 'win' | 'loss' | 'draw';
  vsAi: boolean;
  oppRating: number;
  oppPower: number;
  durationSec: number;
  waveReached: number;
  power: number; // the player's Power Score at match start
}

/** Generous-but-finite bounds (the MODE_BOUNDS discipline — anything outside is a rejected
 *  forgery, not a clamp). Shared verbatim by the server. */
export const ARENA_CLAIM_BOUNDS = {
  maxDurationSec: ARENA.matchSec + 120, // settle lag headroom past the hard timer
  minDurationSec: 5,
  maxWave: 200,
  maxPower: 50_000_000,
  maxRating: 20_000,
  maxMatchIdLen: 64,
} as const;

/** The ONE claim validator. Returns null when valid, else the machine-readable reason. */
export function arenaClaimProblem(c: ArenaMatchClaim): string | null {
  if (typeof c.matchId !== 'string' || c.matchId.length < 8 || c.matchId.length > ARENA_CLAIM_BOUNDS.maxMatchIdLen) return 'bad-match-id';
  if (!Number.isInteger(c.season) || c.season < 1 || c.season > 10_000) return 'bad-season';
  if (c.outcome !== 'win' && c.outcome !== 'loss' && c.outcome !== 'draw') return 'bad-outcome';
  if (typeof c.vsAi !== 'boolean') return 'bad-vs-ai';
  if (!Number.isFinite(c.oppRating) || c.oppRating < 0 || c.oppRating > ARENA_CLAIM_BOUNDS.maxRating) return 'bad-opp-rating';
  if (!Number.isFinite(c.oppPower) || c.oppPower < 0 || c.oppPower > ARENA_CLAIM_BOUNDS.maxPower) return 'bad-opp-power';
  if (!Number.isFinite(c.durationSec) || c.durationSec < ARENA_CLAIM_BOUNDS.minDurationSec || c.durationSec > ARENA_CLAIM_BOUNDS.maxDurationSec) return 'bad-duration';
  if (!Number.isInteger(c.waveReached) || c.waveReached < 0 || c.waveReached > ARENA_CLAIM_BOUNDS.maxWave) return 'bad-wave';
  if (!Number.isFinite(c.power) || c.power < 0 || c.power > ARENA_CLAIM_BOUNDS.maxPower) return 'bad-power';
  // Wave-vs-duration sanity: waves take real time — ~3s/wave is beyond any legitimate pace.
  if (c.waveReached > 3 + c.durationSec / 3) return 'implausible-pace';
  return null;
}

/** Deterministic match rewards — both sides DERIVE, neither trusts (the division index comes
 *  from each side's own authoritative rating, never from the claim). WINS pay containers
 *  (division-banded Bio-Container + Run Cache); LOSSES pay standard resources (cores + salvage
 *  materials); draws split the difference in cores only. */
export function arenaMatchRewards(outcome: 'win' | 'loss' | 'draw', divIndex: number): { rewards: PassReward[]; passXp: number } {
  if (outcome === 'win') {
    const rarity: 'common' | 'rare' | 'epic' = divIndex >= 6 ? 'epic' : divIndex >= 3 ? 'rare' : 'common';
    return { rewards: [{ kind: 'container', rarity, count: 1 }, { kind: 'runCache', count: 1 }], passXp: ARENA.winPassXp };
  }
  if (outcome === 'loss') {
    const mats: PassReward = { kind: 'mats', scrap: 2, mutagen: divIndex >= 6 ? 1 : 0, catalyst: 0 };
    return { rewards: [{ kind: 'cores', qty: ARENA.lossCores }, mats], passXp: 0 };
  }
  return { rewards: [{ kind: 'cores', qty: ARENA.drawCores }], passXp: 0 };
}

// ── Rank benefits (docs/ARENA.md §benefits) — the Idle Harvest dividend ────────
/** Idle-rate multiplier for a division index (0-based). Diminishing by construction
 *  (sqrt curve) and capped: Apex Strain pays ×1.145 — modest, never runaway (spec).
 *  Division 0 pays exactly ×1 ⇒ IEEE-identity for non-arena accounts (golden-safe). */
export function arenaIdleDividend(divIndex: number): number {
  if (divIndex <= 0) return 1;
  return 1 + Math.min(0.15, 0.048 * Math.sqrt(divIndex));
}

/** Harvest storage-cap bonus hours by division tier (flat, small — the second modest lever). */
export function arenaIdleCapBonusHours(divIndex: number): number {
  if (divIndex <= 0) return 0;
  return Math.min(6, Math.floor(divIndex / 2) + 1);
}

// ── Persisted state shape (save.arena, v47) + pure fold helpers ────────────────
/** The save record (owned by saveStore; meta mutates through settle/claim methods only). */
export interface ArenaSave {
  season: number; // season index the record last touched (0 = never played)
  rating: number;
  peak: number; // lifetime peak (never resets)
  wins: number; // this season
  losses: number; // this season
  lifetimeWins: number;
  lifetimeLosses: number;
  placements: number; // placement matches REMAINING this season
  streak: number; // current win streak
  lastPlayedAt: number; // decay anchor (epoch ms)
  passXp: number; // arena-pass XP this season (wins only)
  passPremium: boolean; // premium track unlocked this season
  passClaimedFree: number[];
  passClaimedPremium: number[];
  exclusives: string[]; // arena-exclusive content ids ever granted (FOREVER — never reset)
  history: { season: number; rating: number; division: string; wins: number; losses: number }[]; // closed seasons, newest last, bounded
  settledMatchIds: string[]; // exactly-once settle keys (bounded ring)
}

export const ARENA_HISTORY_CAP = 24;
export const ARENA_SETTLED_CAP = 64;

export function defaultArenaSave(): ArenaSave {
  return {
    season: 0, rating: 0, peak: 0, wins: 0, losses: 0, lifetimeWins: 0, lifetimeLosses: 0,
    placements: ARENA.placementMatches, streak: 0, lastPlayedAt: 0,
    passXp: 0, passPremium: false, passClaimedFree: [], passClaimedPremium: [],
    exclusives: [], history: [], settledMatchIds: [],
  };
}

/** Roll the record into `season` if it is stale: archive the closed season, soft-reset the
 *  rating, re-arm placements, clear the pass. Idempotent for the current season. Pure —
 *  returns a NEW record (meta persists it). */
export function rolledArenaSave(state: ArenaSave, season: number): ArenaSave {
  if (state.season >= season) return state;
  const next: ArenaSave = { ...state, passClaimedFree: [...state.passClaimedFree], passClaimedPremium: [...state.passClaimedPremium], exclusives: [...state.exclusives], history: [...state.history], settledMatchIds: [...state.settledMatchIds] };
  if (next.season > 0 && (next.wins > 0 || next.losses > 0 || next.rating > 0)) {
    next.history.push({ season: next.season, rating: next.rating, division: divisionForRating(next.rating).name, wins: next.wins, losses: next.losses });
    if (next.history.length > ARENA_HISTORY_CAP) next.history.splice(0, next.history.length - ARENA_HISTORY_CAP);
  }
  next.rating = next.season > 0 ? seasonResetRating(next.rating) : 0;
  next.season = season;
  next.wins = 0;
  next.losses = 0;
  next.placements = ARENA.placementMatches;
  next.streak = 0;
  next.passXp = 0;
  next.passPremium = false;
  next.passClaimedFree = [];
  next.passClaimedPremium = [];
  return next;
}
