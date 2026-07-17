// ARENA MATCHMAKER (docs/ONLINE-FOUNDATION.md §relay, docs/ARENA.md §2) — the human lane of
// the 20-second queue. With a relay configured (VITE_ARENA_RELAY_URL) the console races TWO
// clocks: this matchmaker hunting a fair human, and the window clock that fires the seamless
// AI fallback. The handshake over a paired relay room:
//
//   paired {room, role}  →  both send hello · loadout · boot  →  each side VALIDATES the
//   peer (protocol/season/bracket/boot bounds/fingerprint — peerProblem, pure + tested)
//   →  role 0 proposes `ready {matchId, seed}`  →  role 1 validates + ECHOES it (the echo is
//   the accept)  →  both resolve with the SAME matchId/seed and hand the live transport to
//   the ArenaView, whose ArenaSession takes over the message stream.
//
// Anything wrong — unfair bracket, forged boot bundle, a peer that vanishes, no relay
// answer — resolves `null` and the AI fallback owns the window end, exactly as without a
// relay. Fail-soft is the contract: this module can lose a match, never strand the queue.
// (A command the peer sends in the beat between resolve and the session attaching is
// self-healing by design: the seq gap flags needsResync and the log replays — §3.)

import { PROTOCOL_VERSION, loadoutFingerprint } from '../core/online';
import type { ArenaHello, ArenaLoadoutCard, ArenaMessage } from '../core/online';
import { matchSearchState, opponentInBracket } from '../core/arena';
import { bootBundleProblem } from '../core/arenaMatch';
import type { ArenaBootBundle } from '../core/arenaMatch';
import { RelayTransport } from './arenaTransport';

/** Season + power-band matchmaking key. One log2 band ≈ the widened end-bracket (±60%);
 *  a fair pair near a band edge can miss — accepted for bring-up, the AI fallback covers it
 *  (documented in docs/ONLINE-FOUNDATION.md §relay). */
export function mmRoomKey(season: number, power: number): string {
  return `mm:s${season}.p${Math.round(Math.log2(Math.max(1, power)))}`;
}

export interface PeerCard {
  hello: ArenaHello;
  loadout: ArenaLoadoutCard;
  boot: ArenaBootBundle;
}

/** The ONE peer gate (pure — unit-tested): protocol, season, bracket fairness at the live
 *  search width, boot-bundle bounds, and the loadout fingerprint's internal consistency.
 *  Returns null when the peer is playable, else the machine-readable refusal. */
export function peerProblem(args: { season: number; power: number; elapsedSec: number }, peer: PeerCard): string | null {
  if (peer.hello.proto !== PROTOCOL_VERSION) return 'proto';
  if (peer.hello.season !== args.season) return 'season';
  if (!Number.isFinite(peer.hello.power) || peer.hello.power <= 0) return 'power';
  if (!opponentInBracket(matchSearchState(args.elapsedSec, args.power), peer.hello.power)) return 'bracket';
  const bootBad = bootBundleProblem(peer.boot);
  if (bootBad) return `boot:${bootBad}`;
  if (peer.loadout.fingerprint !== loadoutFingerprint(peer.loadout.towerKinds, peer.loadout.heroKinds, peer.hello.power)) return 'fingerprint';
  return null;
}

export interface HumanMatchFound {
  transport: RelayTransport;
  matchId: string;
  seed: number;
  remoteBoot: ArenaBootBundle;
  oppHello: ArenaHello;
}

export interface MatchmakerArgs {
  url: string;
  season: number;
  power: number;
  hello: ArenaHello;
  loadout: ArenaLoadoutCard;
  boot: ArenaBootBundle;
}

export interface MatchmakerHandle {
  /** Resolves a playable human match, or null (peer refused / relay dead / cancelled).
   *  NEVER rejects — the AI fallback is the queue's other clock. */
  promise: Promise<HumanMatchFound | null>;
  cancel(): void;
}

function newMatchId(): string {
  return `m_${Date.now().toString(36)}_${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}

export function findArenaOpponent(args: MatchmakerArgs): MatchmakerHandle {
  return runHandshake(new RelayTransport(args.url, mmRoomKey(args.season, args.power)), args, (peer, elapsedSec) =>
    peerProblem({ season: args.season, power: args.power, elapsedSec }, peer));
}

/** Private-bout room key — both players enter the same code (docs/ARENA.md §private). */
export function pmRoomKey(season: number, code: string): string {
  return `pm:${season}:${code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)}`;
}

/** PRIVATE BOUT (friendly, unrated — docs/ARENA.md §private): both players join the SAME
 *  direct relay room by shared code; the broker fills it with the identical `paired`
 *  handshake. The peer gate keeps protocol/season/boot-bounds/fingerprint but DROPS the
 *  power bracket — friends of any power may spar (the match never settles, so there is
 *  nothing to farm). */
export function findPrivateMatch(args: MatchmakerArgs & { code: string }): MatchmakerHandle {
  return runHandshake(new RelayTransport(args.url, pmRoomKey(args.season, args.code)), args, (peer) => {
    if (peer.hello.proto !== PROTOCOL_VERSION) return 'proto';
    if (peer.hello.season !== args.season) return 'season';
    const bootBad = bootBundleProblem(peer.boot);
    if (bootBad) return `boot:${bootBad}`;
    if (peer.loadout.fingerprint !== loadoutFingerprint(peer.loadout.towerKinds, peer.loadout.heroKinds, peer.hello.power)) return 'fingerprint';
    return null;
  });
}

function runHandshake(
  transport: RelayTransport,
  args: MatchmakerArgs,
  gate: (peer: PeerCard, elapsedSec: number) => string | null,
): MatchmakerHandle {
  const startedAt = Date.now();
  let settled = false;
  let role: 0 | 1 | null = null;
  let peerHello: ArenaHello | null = null;
  let peerLoadout: ArenaLoadoutCard | null = null;
  let peerBoot: ArenaBootBundle | null = null;
  let proposed: { matchId: string; seed: number } | null = null;
  let off: () => void = () => {};
  let poll: ReturnType<typeof setInterval> | null = null;
  let finishOuter: (found: HumanMatchFound | null) => void = () => {};

  const promise = new Promise<HumanMatchFound | null>((resolve) => {
    const finish = (found: HumanMatchFound | null): void => {
      if (settled) return;
      settled = true;
      off();
      if (poll !== null) clearInterval(poll);
      if (!found) {
        transport.send({ t: 'bye' });
        transport.close();
      }
      resolve(found);
    };
    finishOuter = finish;

    // A dead relay (bad URL, refused socket, spent reconnect window) ends the human lane.
    poll = setInterval(() => {
      if (transport.state() === 'closed') finish(null);
    }, 500);

    const maybeReady = (): void => {
      // Role 0 proposes once the peer's full card validated; role 1 answers inside handle().
      if (role !== 0 || proposed || !peerHello || !peerLoadout || !peerBoot) return;
      const bad = gate({ hello: peerHello, loadout: peerLoadout, boot: peerBoot }, (Date.now() - startedAt) / 1000);
      if (bad) {
        finish(null);
        return;
      }
      proposed = { matchId: newMatchId(), seed: (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0 };
      transport.send({ t: 'ready', ...proposed });
    };

    const handle = (msg: ArenaMessage): void => {
      if (settled) return;
      switch (msg.t) {
        case 'paired':
          role = msg.role;
          transport.setRoom(msg.room); // reconnects now rejoin the MATCH room
          transport.send({ t: 'hello', ...args.hello });
          transport.send({ t: 'loadout', ...args.loadout });
          transport.send({ t: 'boot', bundle: args.boot });
          return;
        case 'hello':
          peerHello = msg;
          maybeReady();
          return;
        case 'loadout':
          peerLoadout = msg;
          maybeReady();
          return;
        case 'boot':
          peerBoot = msg.bundle as ArenaBootBundle;
          maybeReady();
          return;
        case 'ready': {
          if (typeof msg.matchId !== 'string' || msg.matchId.length < 8 || !Number.isFinite(msg.seed)) return finish(null);
          if (role === 1) {
            // The proposal — validate the peer's card, echo the accept, and we're matched.
            if (!peerHello || !peerLoadout || !peerBoot) return finish(null);
            const bad = gate({ hello: peerHello, loadout: peerLoadout, boot: peerBoot }, (Date.now() - startedAt) / 1000);
            if (bad) return finish(null);
            transport.send({ t: 'ready', matchId: msg.matchId, seed: msg.seed });
            return finish({ transport, matchId: msg.matchId, seed: msg.seed >>> 0, remoteBoot: peerBoot, oppHello: peerHello });
          }
          // Role 0: the echo — matchId must match our proposal.
          if (!proposed || msg.matchId !== proposed.matchId || !peerHello || !peerBoot) return finish(null);
          return finish({ transport, matchId: proposed.matchId, seed: proposed.seed, remoteBoot: peerBoot, oppHello: peerHello });
        }
        case 'bye':
          return finish(null); // the peer (or its half of the pair) left mid-handshake
        default:
          return; // cmd/state/etc are the SESSION's concern — never valid mid-handshake
      }
    };

    off = transport.onMessage(handle);
  });

  return {
    promise,
    cancel(): void {
      finishOuter(null); // resolves the promise null + says bye + closes the socket
    },
  };
}
