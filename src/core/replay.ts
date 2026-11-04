// Input recording + deterministic replay (docs/SECURITY-AUDIT.md R1).
//
// The sim advances in FIXED steps (`SIM_DT` accumulator), so `Game.stepCount` is the
// complete timeline: recording every UI→sim call with its step index reproduces a run
// EXACTLY, independent of frame rate, pauses, or timeScale (those only change how many
// real milliseconds pass between steps, never the step sequence itself). A leaderboard
// claim therefore ships `{ctor args, input log, claim}` and any holder of the blob can
// re-run it: a diverging outcome means the claim was not produced by honest inputs
// (save-editing mid-run, god-mode, or a forged score all diverge).
//
// Scope: DAILY runs (the competitive surface). The record is small — a few hundred
// events of primitives — and golden-safe: recording wraps methods on ONE instance and
// appends to an array; the sim itself never reads any of it.

import { Game } from './game';
import { SIM_DT } from './config';

/** Every Game method the UI calls that can influence the sim (or the selection state
 *  that placement/ability routing reads). Verified against the UI call graph — the
 *  replay round-trip test fails loudly if a new input path is added without extending
 *  this list. Debug helpers are deliberately absent: a debug-assisted run DIVERGES on
 *  replay and is flagged, which is the point. */
export const REPLAY_METHODS = [
  'click', 'startWave', 'setAutoStart',
  'selectTower', 'selectPlacedTower', 'selectHero', 'selectConveyorItem', 'inspectAt',
  'cancelInteractions', 'armAbility', 'setRally',
  'toggleAutocast', 'buyAutocast',
  'strainFromConveyor', 'discardConveyor',
  'sellTower', 'beginMove', 'cancelMove',
  'chooseCard', 'buyBranchTier', 'buyHeroEvolution',
] as const;

export interface ReplayEvent {
  s: number; // Game.stepCount when the input landed
  op: (typeof REPLAY_METHODS)[number];
  a: unknown[]; // the call's arguments (all primitives / plain data by construction)
}

/** The full constructor tuple — everything that shapes a run. All plain data. */
export type ReplayCtorArgs = ConstructorParameters<typeof Game>;

export interface ReplayOutcome {
  wave: number;
  kills: number;
  integrity: number;
  biomass: number;
  phase: string;
  stepCount: number;
}

export interface ReplayRecord {
  v: 1;
  args: ReplayCtorArgs;
  log: ReplayEvent[];
  /** stepCount at the moment the claim was read — replay stops EXACTLY here. */
  end: number;
  claim: { wave: number; kills: number };
}

/** Submission blobs above this are dropped client-side (submit still goes out without
 *  a replay — the entry simply stays unverifiable). Generous: real logs are ~10KB. */
export const MAX_REPLAY_BYTES = 262_144;

export interface Recorder {
  /** The live log (append-only while the run plays). */
  log: ReplayEvent[];
  /** Snapshot a submission-ready record from the finished game. */
  finish: (claim: { wave: number; kills: number }) => ReplayRecord;
}

/** Wrap the input surface of ONE game instance so every UI call lands in the log.
 *  Call immediately after construction, BEFORE any input can occur. */
export function attachRecorder(game: Game, args: ReplayCtorArgs): Recorder {
  const log: ReplayEvent[] = [];
  const g = game as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const op of REPLAY_METHODS) {
    const orig = g[op].bind(game);
    g[op] = (...a: unknown[]) => {
      log.push({ s: game.stepCount, op, a });
      return orig(...a);
    };
  }
  return {
    log,
    finish: (claim) => ({ v: 1, args: cloneArgs(args), log: [...log], end: game.stepCount, claim }),
  };
}

/** JSON round-trip: strips functions/undefined and PROVES the args are serializable
 *  (a non-plain arg would throw here, in the recording session, not at verify time). */
function cloneArgs(args: ReplayCtorArgs): ReplayCtorArgs {
  return JSON.parse(JSON.stringify(args)) as ReplayCtorArgs;
}

/** Re-run a record to completion (terminal phase) or its step/time budget. */
export function replayRun(record: ReplayRecord, maxSimSeconds = 7_200): ReplayOutcome {
  const game = new Game(...record.args);
  game.isolateEvents(); // a verifier: nothing it re-simulates may reach app listeners
  const g = game as unknown as Record<string, (...a: unknown[]) => unknown>;
  const maxSteps = Math.min(Math.ceil(maxSimSeconds / SIM_DT), Math.max(0, record.end) + 60);
  let guard = 0;
  const done = (): boolean => game.stepCount >= record.end;
  for (const e of record.log) {
    // Advance the sim clock to the event's step. If the clock can't get there (the
    // phase froze differently than in the recording), the run has already diverged —
    // apply the input anyway and let the outcome comparison fail.
    while (game.stepCount < e.s && !done() && guard++ < maxSteps) {
      const before = game.stepCount;
      game.advance(SIM_DT);
      if (game.stepCount === before) break; // frozen phase (draft/pause) — inputs unblock it
    }
    if (done()) break;
    try {
      g[e.op](...e.a);
    } catch {
      break; // an input the current state rejects ⇒ divergence; outcome check decides
    }
  }
  // Coast to the claim's exact step — the recorded run ended precisely here.
  while (!done() && guard++ < maxSteps) {
    const before = game.stepCount;
    game.advance(SIM_DT);
    if (game.stepCount === before) break; // frozen with no inputs left (e.g. unanswered draft)
  }
  return {
    wave: game.waveIndex,
    kills: game.kills,
    integrity: Math.round(game.integrity),
    biomass: Math.round(game.biomass),
    phase: game.phase,
    stepCount: game.stepCount,
  };
}

export interface ReplayVerdict {
  ok: boolean;
  reason: 'verified' | 'wave-mismatch' | 'kills-mismatch' | 'malformed';
  claimed: { wave: number; kills: number } | null;
  replayed: ReplayOutcome | null;
}

/** Parse + re-run + compare a submitted record against its own claim. */
export function verifyReplay(raw: string): ReplayVerdict {
  let record: ReplayRecord;
  try {
    record = JSON.parse(raw) as ReplayRecord;
    if (record?.v !== 1 || !Array.isArray(record.args) || !Array.isArray(record.log) || typeof record.end !== 'number' || typeof record.claim?.wave !== 'number') {
      return { ok: false, reason: 'malformed', claimed: null, replayed: null };
    }
  } catch {
    return { ok: false, reason: 'malformed', claimed: null, replayed: null };
  }
  const replayed = replayRun(record);
  if (replayed.wave !== record.claim.wave) return { ok: false, reason: 'wave-mismatch', claimed: record.claim, replayed };
  if (replayed.kills !== record.claim.kills) return { ok: false, reason: 'kills-mismatch', claimed: record.claim, replayed };
  return { ok: true, reason: 'verified', claimed: record.claim, replayed };
}
