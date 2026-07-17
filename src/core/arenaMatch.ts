// ARENA MATCH ORCHESTRATION (docs/ARENA.md §ruleset) — one live PvP match: TWO deterministic
// sims (the mirror SIEGE RACE) advancing side by side from the shared match seed, the command
// log (the match's replayable evidence object), the PvP timer + outcome resolution, and the
// rollback/reconnect primitive — `replayRemoteFromLog` rebuilds the opponent's battlefield
// byte-exactly from (boot bundle, seed, command log), which is both the late-command recovery
// path and the reconnect path (docs/ONLINE-FOUNDATION.md §3).
//
// The orchestrator is TRANSPORT-AGNOSTIC: callers wire `onLocalCommand` to a transport (or
// nothing, vs AI). AI matches construct an AiController and drive the remote sim through the
// SAME command pipeline a human uses — one vocabulary, one log shape, one anti-cheat surface.
//
// Pure core: no DOM, no transport, no Math.random.

import { Game } from './game';
import type { RunOptions } from './game';
import { SIM_DT, TOWER_ORDER, HERO_ORDER } from './config';
import type { HeroKind, MetaModifiers, TowerKind, TowerProgress, HeroProgress } from './types';
import { applyArenaCommand, arenaStateDigest } from './online';
import type { ArenaCommand, StampedCommand } from './online';
import { ARENA, resolveArenaOutcome } from './arena';
import type { ArenaMatchClaim, ArenaSideResult } from './arena';
import { AiController } from './arenaAi';
import type { AiOpponent } from './arenaAi';

/** Everything needed to boot ONE side's sim (the Game constructor bundle). Serializable —
 *  human PvP exchanges it in the `boot` handshake; AI generation produces it directly. */
export interface ArenaBootBundle {
  meta: MetaModifiers;
  towerProgress?: TowerProgress;
  heroKind: HeroKind;
  heroProgress?: HeroProgress;
  opts: RunOptions;
}

/** Anti-cheat: sanity-validate a REMOTE boot bundle before simulating it (a forged bundle is
 *  refused, not clamped — the match simply doesn't start; docs/ONLINE-FOUNDATION.md §anti-cheat).
 *  Ceilings are generous (deep legitimate accounts pass) but finite. */
export function bootBundleProblem(b: ArenaBootBundle): string | null {
  const mult = (v: unknown, cap: number): boolean => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= cap;
  if (!b || typeof b !== 'object' || !b.meta || !b.opts) return 'malformed';
  if (!mult(b.meta.towerDamageMult, 50) || !mult(b.meta.biomassMult, 50) || !mult(b.meta.heroDamageMult, 50)) return 'meta-mult';
  if (!Number.isFinite(b.meta.integrityBonus) || b.meta.integrityBonus < 0 || b.meta.integrityBonus > 1000) return 'integrity';
  if (!Number.isInteger(b.meta.bonusSlots) || b.meta.bonusSlots < 0 || b.meta.bonusSlots > 8) return 'slots';
  if (!HERO_ORDER.includes(b.heroKind)) return 'hero';
  if (b.towerProgress) {
    for (const k of Object.keys(b.towerProgress) as TowerKind[]) {
      const m = b.towerProgress[k];
      if (!m || !mult(m.damageMult, 100) || !mult(m.fireRateMult, 20)) return 'tower-progress';
    }
  }
  if (b.opts.unlocked && (!Array.isArray(b.opts.unlocked) || b.opts.unlocked.some((k) => !TOWER_ORDER.includes(k)))) return 'roster';
  if (b.opts.startingGenes && (!Array.isArray(b.opts.startingGenes) || b.opts.startingGenes.length > 5)) return 'genes';
  return null;
}

function bootGame(seed: number, b: ArenaBootBundle): Game {
  const game = new Game(seed, b.meta, b.towerProgress, b.heroKind, b.heroProgress, {
    ...b.opts,
    mode: 'endless', // the arena ruleset: the shared escalating assault
    noMega: true, // docs/ARENA.md §ruleset — no Mega Boss encounters in PvP
  });
  game.timeScale = 1; // PvP runs at real speed on both fields — no fast-forward in the arena
  return game;
}

export interface ArenaMatchSetup {
  matchId: string;
  seed: number;
  season: number;
  local: ArenaBootBundle;
  remote: ArenaBootBundle;
  vsAi: boolean;
  /** The generated AI opponent (vsAi matches) — its controller drives the remote sim. */
  ai?: AiOpponent;
  /** The local player's Power Score + current rating (claim facts). */
  localPower: number;
  oppPower: number;
  oppRating: number;
  /** Display name for a HUMAN opponent (from their hello card); AI matches use `ai.name`. */
  oppName?: string;
}

/** The per-frame opponent read-model the Arena HUD renders (docs/ARENA.md §hud). */
export interface ArenaOpponentState {
  integrityFrac: number;
  wave: number;
  heroDown: boolean;
  digest: number;
}

export class ArenaMatch {
  readonly matchId: string;
  readonly seed: number;
  readonly season: number;
  readonly vsAi: boolean;
  readonly localGame: Game;
  remoteGame: Game;
  /** The evidence objects: every command each side issued, in order (docs/ONLINE-FOUNDATION.md §3). */
  readonly localLog: StampedCommand[] = [];
  readonly remoteLog: StampedCommand[] = [];
  /** The PvP clock (real seconds — a player idling in a draft burns their own clock). */
  elapsed = 0;
  finished: { outcome: 'win' | 'loss' | 'draw'; claim: ArenaMatchClaim; local: ArenaSideResult; remote: ArenaSideResult } | null = null;
  /** Fires for every local command the sim ACCEPTED — wire it to the transport. */
  onLocalCommand: ((cmd: StampedCommand) => void) | null = null;

  private readonly setup: ArenaMatchSetup;
  private readonly aiCtl: AiController | null;
  private localSeq = 0;
  private remoteSeq = 0;
  private localFellAt: number | null = null;
  private remoteFellAt: number | null = null;
  /** Remote commands received but not yet due (sorted by tick, applied on their EXACT tick). */
  private pendingRemote: StampedCommand[] = [];
  /** The mirror's FRONTIER: the newest sender tick any remote message carried. The remote sim
   *  NEVER advances past it — with an ordered wire, every command therefore arrives while the
   *  mirror is still at/behind its stamp and applies on its exact boundary (byte-exact vs the
   *  replay). AI matches are locally driven ⇒ unbounded. */
  private remoteFrontier: number;
  /** Next expected remote seq (gap ⇒ the wire lost something ⇒ needsResync). */
  private expectRemoteSeq = 0;
  /** The wire lost/garbled the stream — the session polls this and runs the resync handshake. */
  needsResync = false;
  /** Fractional-tick carry for the precise remote advance. */
  private remoteCarry = 0;

  constructor(setup: ArenaMatchSetup) {
    this.matchId = setup.matchId;
    this.seed = setup.seed;
    this.season = setup.season;
    this.vsAi = setup.vsAi;
    this.setup = setup;
    this.localGame = bootGame(setup.seed, setup.local);
    this.remoteGame = bootGame(setup.seed, setup.remote);
    this.aiCtl = setup.vsAi && setup.ai ? new AiController(setup.ai.controllerSeed, setup.ai.personality) : null;
    this.remoteFrontier = this.aiCtl ? Number.MAX_SAFE_INTEGER : 0;
  }

  /** Issue a LOCAL player command: stamp at the local sim's current tick, apply through the
   *  ONE pipeline, log + emit only if the sim accepted it. Returns the sim's verdict. */
  issueLocal(cmd: ArenaCommand): boolean {
    if (this.finished) return false;
    const ok = applyArenaCommand(this.localGame, cmd);
    if (!ok) return false;
    const stamped: StampedCommand = { tick: this.localGame.stepCount, seq: this.localSeq++, cmd };
    this.localLog.push(stamped);
    this.onLocalCommand?.(stamped);
    return true;
  }

  /** Ingest a REMOTE command from the transport. The seq stream must be gapless (ordered
   *  wire); a gap or a stamp already behind the mirror means the wire lost something — flag
   *  needsResync and let the session run the resync handshake (command-log replay). */
  ingestRemote(stamped: StampedCommand): void {
    if (this.finished || this.vsAi) return;
    if (stamped.seq !== this.expectRemoteSeq || stamped.tick < this.remoteGame.stepCount) {
      this.needsResync = true;
      return; // the log arrives whole via resync — a partial insert would double-apply
    }
    this.expectRemoteSeq++;
    this.remoteLog.push(stamped);
    this.remoteFrontier = Math.max(this.remoteFrontier, stamped.tick);
    this.pendingRemote.push(stamped);
    this.pendingRemote.sort((a, b) => a.tick - b.tick || a.seq - b.seq);
  }

  /** Every remote message carries the sender's tick — beacons push the mirror's frontier
   *  forward between commands (the session calls this for every message it receives). */
  noteRemoteTick(tick: number): void {
    if (!this.vsAi) this.remoteFrontier = Math.max(this.remoteFrontier, tick);
  }

  /** Advance both battlefields by dt real seconds; drive the AI (or the frontier-bounded
   *  mirror); resolve terminal states. Call from the view loop / headless driver. */
  step(dtReal: number): void {
    if (this.finished) return;
    this.elapsed += dtReal;

    // Local field.
    this.localGame.advance(dtReal);

    // Remote field: AI issues commands through the SAME pipeline; a human mirror advances
    // tick-precisely, never past the frontier, applying commands on their exact stamps.
    if (this.aiCtl) {
      const cmds = this.aiCtl.step(this.remoteGame, dtReal);
      for (const cmd of cmds) this.issueRemoteInternal(cmd);
      this.remoteGame.advance(dtReal);
    } else {
      this.advanceMirror(dtReal);
    }

    // Terminal facts.
    if (this.localFellAt === null && (this.localGame.phase === 'lost' || this.localGame.integrity <= 0)) this.localFellAt = this.elapsed;
    if (this.remoteFellAt === null && (this.remoteGame.phase === 'lost' || this.remoteGame.integrity <= 0)) this.remoteFellAt = this.elapsed;
    if (this.localFellAt !== null || this.remoteFellAt !== null || this.elapsed >= ARENA.matchSec) this.resolve();
  }

  /** The remote side's commands in an AI match originate locally — same stamping, same log. */
  private issueRemoteInternal(cmd: ArenaCommand): void {
    const ok = applyArenaCommand(this.remoteGame, cmd);
    if (!ok) return;
    this.remoteLog.push({ tick: this.remoteGame.stepCount, seq: this.remoteSeq++, cmd });
  }

  /** Tick-precise, frontier-bounded mirror advance: commands apply when the mirror's clock
   *  EQUALS their stamp — the live mirror and a log replay are byte-identical by construction. */
  private advanceMirror(dtReal: number): void {
    this.remoteCarry += dtReal;
    let ticks = Math.floor(this.remoteCarry / SIM_DT);
    this.remoteCarry -= ticks * SIM_DT;
    while (ticks > 0 && this.remoteGame.stepCount < this.remoteFrontier) {
      this.applyPendingAtCurrentTick();
      const before = this.remoteGame.stepCount;
      this.remoteGame.advance(SIM_DT);
      if (this.remoteGame.stepCount === before) break; // sim paused (terminal) — stop burning
      ticks--;
    }
    this.applyPendingAtCurrentTick();
  }

  private applyPendingAtCurrentTick(): void {
    while (this.pendingRemote.length > 0 && this.pendingRemote[0].tick <= this.remoteGame.stepCount) {
      const next = this.pendingRemote.shift()!;
      if (next.tick < this.remoteGame.stepCount) {
        // The mirror somehow passed a stamp (a frontier violation — lost ordering): rebuild.
        this.needsResync = true;
        this.replayRemoteFromLog();
        return;
      }
      applyArenaCommand(this.remoteGame, next.cmd);
    }
  }

  /** Forfeit lanes: the local player concedes, or the opponent's connection died past the
   *  reconnect window (docs/ONLINE-FOUNDATION.md §2). */
  forfeitLocal(): void {
    if (this.finished) return;
    this.localFellAt = this.elapsed;
    this.resolve();
  }
  forfeitRemote(): void {
    if (this.finished) return;
    this.remoteFellAt = this.elapsed;
    this.resolve();
  }

  /** ROLLBACK / RECONNECT: rebuild the remote battlefield byte-exactly from (bundle, seed,
   *  command log) — commands re-apply on their exact tick boundaries. A 5-minute match replays
   *  headlessly in well under a second (the deterministic sim's gift). */
  replayRemoteFromLog(targetTick = this.remoteGame.stepCount): void {
    const rebuilt = bootGame(this.seed, this.setup.remote);
    const advanceTo = (tick: number): void => {
      while (rebuilt.stepCount < tick) {
        const before = rebuilt.stepCount;
        rebuilt.advance(SIM_DT);
        if (rebuilt.stepCount === before) return; // sim paused (terminal state) — done
      }
    };
    const log = [...this.remoteLog].sort((a, b) => a.tick - b.tick || a.seq - b.seq);
    for (const entry of log) {
      advanceTo(entry.tick);
      applyArenaCommand(rebuilt, entry.cmd);
    }
    advanceTo(targetTick);
    this.remoteGame = rebuilt;
    this.pendingRemote = this.pendingRemote.filter((c) => c.tick > rebuilt.stepCount);
  }

  /** RECONNECT ingest: replace the remote log with the peer's authoritative copy and rebuild
   *  (the `resync` message's landing site — docs/ONLINE-FOUNDATION.md §3). */
  resyncFromLog(cmds: StampedCommand[], targetTick: number): void {
    this.remoteLog.length = 0;
    this.remoteLog.push(...cmds);
    this.pendingRemote = [];
    this.expectRemoteSeq = cmds.length; // the log is seq 0..n-1 by construction
    this.remoteFrontier = Math.max(this.remoteFrontier, targetTick);
    this.needsResync = false;
    this.replayRemoteFromLog(Math.max(targetTick, 0));
  }

  /** The opponent read-model for the HUD + the periodic `state` beacon. */
  opponentState(): ArenaOpponentState {
    const g = this.remoteGame;
    const hero = g.heroes[0];
    return {
      integrityFrac: g.maxIntegrity > 0 ? Math.max(0, g.integrity / g.maxIntegrity) : 0,
      wave: g.waveIndex,
      heroDown: hero ? hero.down : false,
      digest: arenaStateDigest(g),
    };
  }
  localState(): ArenaOpponentState {
    const g = this.localGame;
    const hero = g.heroes[0];
    return {
      integrityFrac: g.maxIntegrity > 0 ? Math.max(0, g.integrity / g.maxIntegrity) : 0,
      wave: g.waveIndex,
      heroDown: hero ? hero.down : false,
      digest: arenaStateDigest(g),
    };
  }

  private sideResult(game: Game, fellAt: number | null): ArenaSideResult {
    return {
      integrityFrac: game.maxIntegrity > 0 ? Math.max(0, game.integrity / game.maxIntegrity) : 0,
      waveReached: game.waveIndex,
      damageDealt: Math.round(game.getRunStats().damageDealt),
      fellAtSec: fellAt,
    };
  }

  private resolve(): void {
    if (this.finished) return;
    const local = this.sideResult(this.localGame, this.localFellAt);
    const remote = this.sideResult(this.remoteGame, this.remoteFellAt);
    const outcome = resolveArenaOutcome(local, remote);
    const claim: ArenaMatchClaim = {
      matchId: this.matchId,
      season: this.season,
      outcome,
      vsAi: this.vsAi,
      oppRating: this.setup.oppRating,
      oppPower: this.setup.oppPower,
      durationSec: Math.min(Math.ceil(this.elapsed), Math.ceil(ARENA.matchSec) + 60),
      waveReached: this.localGame.waveIndex,
      power: Math.round(this.setup.localPower),
    };
    this.finished = { outcome, claim, local, remote };
  }
}
