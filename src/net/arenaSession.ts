// ARENA SESSION (docs/ONLINE-FOUNDATION.md §2–3) — the protocol glue binding ONE ArenaMatch to
// ONE ArenaTransport: outbound command relay, periodic state beacons, the FRONTIER feed (every
// received message's tick lets the mirror advance — it never simulates past what the sender
// has confirmed), EXACT-tick digest comparison (the mirror pauses on the frontier, so a beacon
// tick is always landable — desync checks are never approximate), the self-healing resync
// handshake (lost/garbled stream ⇒ command-log replay), opponent finish facts, and liveness
// (drop → reconnect window → forfeit).
//
// The UI's view loop calls `step(dt)`; everything else is message-driven. Vs-AI matches simply
// never construct a session (the match layer drives the AI internally) — one code path fewer.

import { NETCODE } from '../core/online';
import type { ArenaMessage, StampedCommand } from '../core/online';
import type { ArenaMatch } from '../core/arenaMatch';
import type { ArenaTransport } from './arenaTransport';

export interface ArenaSessionEvents {
  /** The opponent's live HUD facts (integrity/wave/hero) — from their authoritative beacon. */
  onOpponentBeacon?: (s: { tick: number; integrityFrac: number; wave: number; heroDown: boolean }) => void;
  /** A digest mismatch at an exactly-aligned tick — flagged for server-side review. */
  onDesync?: (tick: number, ours: number, theirs: number) => void;
  /** The opponent finished/forfeited; the match layer resolves the outcome. */
  onOpponentFinish?: (facts: { integrityFrac: number; wave: number; damageDealt: number; fellAtSec: number | null }) => void;
  onOpponentForfeit?: () => void;
  /** The transport spent its reconnect window — the opponent is gone for good. */
  onConnectionLost?: () => void;
}

export class ArenaSession {
  private beaconInSec = NETCODE.stateBeaconSec;
  private droppedForSec = 0;
  private resyncCooldown = 0;
  private wasDown = false;
  /** The newest opponent beacon still awaiting its exact-tick digest check. */
  private pendingBeacon: { tick: number; digest: number } | null = null;
  private readonly unsubscribe: () => void;
  desyncTick: number | null = null;

  constructor(
    private readonly match: ArenaMatch,
    private readonly transport: ArenaTransport,
    private readonly events: ArenaSessionEvents = {},
  ) {
    match.onLocalCommand = (sc: StampedCommand) => transport.send({ t: 'cmd', ...sc });
    this.unsubscribe = transport.onMessage((msg) => this.handle(msg));
  }

  /** Advance the match + the session's periodic work. Call from the view loop. */
  step(dtReal: number): void {
    this.match.step(dtReal);

    // Exact-tick digest check: the mirror pauses on the frontier (= the newest beacon tick),
    // so once it catches up, stepCount EQUALS the beacon tick and the comparison is precise.
    if (this.pendingBeacon && this.match.remoteGame.stepCount >= this.pendingBeacon.tick) {
      if (this.match.remoteGame.stepCount === this.pendingBeacon.tick) {
        const ours = this.match.opponentState().digest;
        if (ours !== this.pendingBeacon.digest) {
          if (this.desyncTick === null) {
            this.desyncTick = this.pendingBeacon.tick;
            this.events.onDesync?.(this.pendingBeacon.tick, ours, this.pendingBeacon.digest);
          }
          this.match.needsResync = true; // heal through the same lane as a lost stream
        }
      }
      this.pendingBeacon = null;
    }

    // Outbound beacon (HUD facts + digest + frontier for the peer's mirror).
    this.beaconInSec -= dtReal;
    if (this.beaconInSec <= 0 && !this.match.finished) {
      this.beaconInSec = NETCODE.stateBeaconSec;
      const s = this.match.localState();
      this.transport.send({
        t: 'state',
        tick: this.match.localGame.stepCount,
        digest: s.digest,
        integrityFrac: s.integrityFrac,
        wave: s.wave,
        heroDown: s.heroDown,
      });
    }

    // Self-healing: a lost/garbled stream (or a confirmed desync) re-requests the log,
    // throttled so a dead wire doesn't spam.
    this.resyncCooldown = Math.max(0, this.resyncCooldown - dtReal);
    if (this.match.needsResync && this.resyncCooldown === 0 && this.transport.state() === 'open') {
      this.resyncCooldown = 1;
      this.requestResync();
    }

    // Liveness: a dropped transport holds the match for the reconnect window, then forfeits.
    const state = this.transport.state();
    if (state === 'dropped') {
      this.droppedForSec += dtReal;
      this.wasDown = true;
      if (this.droppedForSec > NETCODE.reconnectWindowSec) {
        this.events.onConnectionLost?.();
        this.match.forfeitRemote();
      }
    } else if (state === 'open') {
      if (this.wasDown) {
        this.wasDown = false;
        this.requestResync(); // we were gone — catch up from their authoritative log
      }
      this.droppedForSec = 0;
    } else if (state === 'closed' && !this.match.finished) {
      this.events.onConnectionLost?.();
      this.match.forfeitRemote();
    }

    if (this.match.finished) this.sendFinishOnce();
  }

  private handle(msg: ArenaMessage): void {
    switch (msg.t) {
      case 'cmd':
        this.match.noteRemoteTick(msg.tick);
        this.match.ingestRemote({ tick: msg.tick, seq: msg.seq, cmd: msg.cmd });
        return;
      case 'state':
        this.match.noteRemoteTick(msg.tick);
        this.events.onOpponentBeacon?.({ tick: msg.tick, integrityFrac: msg.integrityFrac, wave: msg.wave, heroDown: msg.heroDown });
        this.pendingBeacon = { tick: msg.tick, digest: msg.digest };
        return;
      case 'resyncReq':
        this.transport.send({
          t: 'resync',
          seed: this.match.seed,
          matchId: this.match.matchId,
          cmds: this.match.localLog,
          tick: this.match.localGame.stepCount,
        });
        return;
      case 'resync':
        if (msg.matchId === this.match.matchId) this.match.resyncFromLog(msg.cmds, msg.tick);
        return;
      case 'finish':
        this.events.onOpponentFinish?.({ integrityFrac: msg.integrityFrac, wave: msg.wave, damageDealt: msg.damageDealt, fellAtSec: msg.fellAtSec });
        return;
      case 'forfeit':
        this.events.onOpponentForfeit?.();
        this.match.forfeitRemote();
        return;
      default:
        return; // hello/loadout/ready/ping/pong/bye are handshake/transport concerns
    }
  }

  /** Ask the peer for their authoritative command log (reconnect / stream-loss recovery). */
  requestResync(): void {
    this.transport.send({ t: 'resyncReq' });
  }

  private finishSent = false;
  private sendFinishOnce(): void {
    if (this.finishSent || !this.match.finished) return;
    this.finishSent = true;
    const f = this.match.finished;
    this.transport.send({
      t: 'finish',
      integrityFrac: f.local.integrityFrac,
      wave: f.local.waveReached,
      damageDealt: f.local.damageDealt,
      fellAtSec: f.local.fellAtSec,
    });
  }

  close(): void {
    this.unsubscribe();
    this.match.onLocalCommand = null;
  }
}
