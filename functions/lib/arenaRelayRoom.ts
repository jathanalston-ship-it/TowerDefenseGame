// ARENA RELAY ROOM BROKER (docs/ONLINE-FOUNDATION.md §relay) — the PURE room/pairing logic
// under the ws relay. No sockets, no node imports, no timers: joins/messages/closes come in
// as events, wire effects come out as actions — so the SAME module drives the standalone
// `npm run relay` server today and a Durable-Objects room tomorrow, and CI tests the pairing
// contract without opening a socket.
//
// Two room flavours, chosen by the client's ?room= value:
//   • `mm:<key>`  — a MATCHMAKING key (season + power band). The first client under a key
//     WAITS; the second is PAIRED with it: both move into a fresh `r<n>` room and receive
//     `paired {room, role}` (waiter = role 0 — it proposes `ready`, the joiner echoes).
//     Clients re-target their reconnects at the assigned room via RelayTransport.setRoom.
//   • anything else — a DIRECT room (reconnects mid-match; private matches later). Capacity
//     is exactly 2: a third join is refused with close code 4001.
//
// The relay stays a PIPE: paired traffic forwards verbatim (never parsed); only unpaired
// sockets get their `ping` answered by the broker (a waiting client's heartbeat must not
// starve — docs/ONLINE-FOUNDATION.md §netcode gives it 3 missed beats before it drops).

import { decodeArenaMessage, encodeArenaMessage } from '../../src/core/online';

export type RelayAction =
  | { kind: 'send'; to: number; raw: string }
  | { kind: 'close'; to: number; code: number };

/** Direct-room join refused — the room already holds a live pair. */
export const RELAY_CLOSE_FULL = 4001;
export const RELAY_MM_PREFIX = 'mm:';

interface Conn {
  id: number;
  /** The DIRECT room this conn occupies (assigned on pairing, or joined directly). */
  room: string | null;
  /** The matchmaking key this conn waits under (mutually exclusive with `room`). */
  waitKey: string | null;
}

export class RelayBroker {
  private readonly conns = new Map<number, Conn>();
  /** Matchmaking key → the conn id waiting under it (one waiter per key). */
  private readonly waiting = new Map<string, number>();
  /** Direct room → occupant conn ids (≤ 2). */
  private readonly rooms = new Map<string, number[]>();
  private nextRoom = 1;

  /** A socket connected asking for `room` (the ?room= query). */
  join(id: number, room: string): RelayAction[] {
    const conn: Conn = { id, room: null, waitKey: null };
    this.conns.set(id, conn);

    if (room.startsWith(RELAY_MM_PREFIX)) {
      const waiterId = this.waiting.get(room);
      const waiter = waiterId !== undefined ? this.conns.get(waiterId) : undefined;
      if (!waiter) {
        // Nobody (alive) under this key — wait. A stale entry (socket died without a clean
        // close) is simply replaced; leave() clears healthy ones.
        this.waiting.set(room, id);
        conn.waitKey = room;
        return [];
      }
      // Pair: both move into a fresh direct room. The WAITER is role 0 (deterministic).
      this.waiting.delete(room);
      const assigned = `r${this.nextRoom++}`;
      waiter.waitKey = null;
      waiter.room = assigned;
      conn.room = assigned;
      this.rooms.set(assigned, [waiter.id, id]);
      return [
        { kind: 'send', to: waiter.id, raw: encodeArenaMessage({ t: 'paired', room: assigned, role: 0 }) },
        { kind: 'send', to: id, raw: encodeArenaMessage({ t: 'paired', room: assigned, role: 1 }) },
      ];
    }

    // Direct room (reconnect / future private matches): capacity exactly 2.
    const occupants = this.rooms.get(room) ?? [];
    if (occupants.length >= 2) {
      this.conns.delete(id);
      return [{ kind: 'close', to: id, code: RELAY_CLOSE_FULL }];
    }
    occupants.push(id);
    this.rooms.set(room, occupants);
    conn.room = room;
    return [];
  }

  /** A text frame arrived from `id`. Paired ⇒ forward verbatim; unpaired ⇒ answer ping. */
  message(id: number, raw: string): RelayAction[] {
    const peer = this.peerOf(id);
    if (peer !== null) return [{ kind: 'send', to: peer, raw }];
    const msg = decodeArenaMessage(raw);
    if (msg && msg.t === 'ping') return [{ kind: 'send', to: id, raw: encodeArenaMessage({ t: 'pong', at: msg.at }) }];
    return [];
  }

  /** The socket closed. A paired peer is told `bye` but HOLDS the room — the leaver's
   *  reconnect rejoins the same room (RelayTransport re-targets it after `paired`), and the
   *  peer's session runs the resync handshake (docs/ONLINE-FOUNDATION.md §3). */
  leave(id: number): RelayAction[] {
    const conn = this.conns.get(id);
    this.conns.delete(id);
    if (!conn) return [];
    if (conn.waitKey !== null && this.waiting.get(conn.waitKey) === id) this.waiting.delete(conn.waitKey);
    if (conn.room === null) return [];
    const occupants = (this.rooms.get(conn.room) ?? []).filter((x) => x !== id);
    if (occupants.length === 0) {
      this.rooms.delete(conn.room);
      return [];
    }
    this.rooms.set(conn.room, occupants);
    return [{ kind: 'send', to: occupants[0], raw: encodeArenaMessage({ t: 'bye' }) }];
  }

  private peerOf(id: number): number | null {
    const conn = this.conns.get(id);
    if (!conn || conn.room === null) return null;
    const occupants = this.rooms.get(conn.room) ?? [];
    const peer = occupants.find((x) => x !== id);
    return peer ?? null;
  }

  /** Introspection for tests + the relay's log line. */
  stats(): { conns: number; waiting: number; rooms: number } {
    return { conns: this.conns.size, waiting: this.waiting.size, rooms: this.rooms.size };
  }
}
