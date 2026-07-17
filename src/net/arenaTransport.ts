// ARENA TRANSPORTS (docs/ONLINE-FOUNDATION.md §5) — the wire under the match protocol.
//
//   • LoopbackTransport — an in-process pair with a CONFIGURABLE network model (latency,
//     jitter, drop) driven by an explicit pump clock: AI matches ride it with zero conditions,
//     and the netcode tests exercise high-latency / lossy / disconnect behavior
//     deterministically in CI (seeded rng — no flaky network tests).
//   • RelayTransport — the real-infrastructure seam: a WebSocket to VITE_ARENA_RELAY_URL with
//     heartbeats, RTT sampling, missed-beat drop detection and windowed reconnect. Ships
//     DORMANT (no URL configured ⇒ matchmaking always resolves to the AI opponent); deploying
//     a relay (Durable Objects or any ws room server) is a config value, not a refactor.
//
// Fail-soft everywhere (the net/ house rule): a dead transport degrades the match to the
// forfeit/reconnect flow — it never throws into the view loop.

import { NETCODE, connectionQuality, decodeArenaMessage, encodeArenaMessage } from '../core/online';
import type { ArenaMessage, ConnectionQuality } from '../core/online';
import { Rng } from '../core/rng';

export type TransportState = 'connecting' | 'open' | 'dropped' | 'closed';

export interface ArenaTransport {
  readonly kind: 'loopback' | 'relay';
  send(msg: ArenaMessage): void;
  /** Subscribe to inbound messages; returns the unsubscribe. */
  onMessage(fn: (msg: ArenaMessage) => void): () => void;
  rttMs(): number;
  quality(): ConnectionQuality;
  state(): TransportState;
  close(): void;
}

// ── Loopback (AI matches + deterministic netcode tests) ────────────────────────
/** The simulated network between a loopback pair. All optional — defaults are a perfect wire. */
export interface NetConditions {
  latencyMs?: number; // one-way base latency
  jitterMs?: number; // ± uniform jitter per packet
  dropRate?: number; // 0..1 per-packet loss
  seed?: number; // jitter/drop rng seed (deterministic tests)
}

interface QueuedPacket {
  at: number; // pump-clock ms the packet becomes deliverable
  raw: string;
}

class LoopbackEnd implements ArenaTransport {
  readonly kind = 'loopback' as const;
  peer: LoopbackEnd | null = null;
  private handlers: ((msg: ArenaMessage) => void)[] = [];
  private queue: QueuedPacket[] = [];
  private readonly rng: Rng;
  private readonly net: Required<Omit<NetConditions, 'seed'>>;
  private lifecycle: TransportState = 'open';
  private lastRtt: number;

  constructor(net: NetConditions) {
    this.rng = new Rng((net.seed ?? 1) >>> 0);
    this.net = { latencyMs: net.latencyMs ?? 0, jitterMs: net.jitterMs ?? 0, dropRate: net.dropRate ?? 0 };
    this.lastRtt = this.net.latencyMs * 2;
  }

  send(msg: ArenaMessage): void {
    if (this.lifecycle !== 'open' || !this.peer || this.peer.lifecycle !== 'open') return;
    if (this.net.dropRate > 0 && this.rng.chance(this.net.dropRate)) return; // the wire ate it
    const jitter = this.net.jitterMs > 0 ? this.rng.range(-this.net.jitterMs, this.net.jitterMs) : 0;
    const at = loopClock + Math.max(0, this.net.latencyMs + jitter);
    this.peer.queue.push({ at, raw: encodeArenaMessage(msg) });
  }

  /** Deliver everything due at the shared pump clock (tests + the view loop drive it). */
  pump(): void {
    if (this.queue.length === 0) return;
    this.queue.sort((a, b) => a.at - b.at);
    while (this.queue.length > 0 && this.queue[0].at <= loopClock) {
      const pkt = this.queue.shift()!;
      const msg = decodeArenaMessage(pkt.raw);
      if (!msg) continue;
      if (msg.t === 'ping') {
        this.send({ t: 'pong', at: msg.at });
        continue;
      }
      if (msg.t === 'pong') {
        this.lastRtt = Math.max(0, loopClock - msg.at);
        continue;
      }
      for (const fn of this.handlers) fn(msg);
    }
  }

  onMessage(fn: (msg: ArenaMessage) => void): () => void {
    this.handlers.push(fn);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== fn);
    };
  }

  rttMs(): number {
    return this.net.latencyMs === 0 && this.net.jitterMs === 0 ? this.lastRtt : Math.max(this.lastRtt, this.net.latencyMs * 2);
  }
  quality(): ConnectionQuality {
    return connectionQuality(this.rttMs(), 0);
  }
  state(): TransportState {
    return this.lifecycle;
  }
  close(): void {
    this.lifecycle = 'closed';
  }
  /** Test hook: simulate this end's link dying (peer sees silence, not a close frame). */
  simulateDrop(): void {
    this.lifecycle = 'dropped';
  }
  simulateRecover(): void {
    if (this.lifecycle === 'dropped') this.lifecycle = 'open';
  }
}

/** The shared loopback pump clock (ms). Tests advance it explicitly; the view loop advances
 *  it by real dt. One module-level clock keeps a pair's two ends coherent. */
let loopClock = 0;
export function advanceLoopbackClock(ms: number): void {
  loopClock += Math.max(0, ms);
}
export function resetLoopbackClock(): void {
  loopClock = 0;
}

export interface LoopbackPair {
  a: LoopbackEnd;
  b: LoopbackEnd;
  /** Advance the network clock and deliver everything due on both ends. */
  pump(ms: number): void;
}

export function createLoopbackPair(net: NetConditions = {}): LoopbackPair {
  const a = new LoopbackEnd(net);
  const b = new LoopbackEnd({ ...net, seed: ((net.seed ?? 1) ^ 0x7f7f7f7f) >>> 0 });
  a.peer = b;
  b.peer = a;
  return {
    a,
    b,
    pump(ms: number): void {
      advanceLoopbackClock(ms);
      a.pump();
      b.pump();
    },
  };
}

// ── Relay (the real-infrastructure seam — dormant without a configured URL) ────
export function arenaRelayUrl(): string | null {
  const url = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_ARENA_RELAY_URL;
  return typeof url === 'string' && url.length > 0 ? url : null;
}

/** WebSocket transport with heartbeats, RTT sampling, drop detection and windowed reconnect.
 *  The match layer reacts to `state()` — 'dropped' holds the match for the reconnect window
 *  (resync via command log), 'closed' forfeits (docs/ONLINE-FOUNDATION.md §3). */
export class RelayTransport implements ArenaTransport {
  readonly kind = 'relay' as const;
  private ws: WebSocket | null = null;
  private handlers: ((msg: ArenaMessage) => void)[] = [];
  private lifecycle: TransportState = 'connecting';
  private rtts: number[] = [];
  private missedBeats = 0;
  private beatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAt = 0;
  private attempts = 0;

  constructor(private readonly url: string, private room: string) {
    this.connect();
  }

  /** Re-target future (re)connects at a different room — the matchmaker calls this with the
   *  relay-assigned match room on `paired`, so a mid-match reconnect rejoins the MATCH room
   *  instead of re-entering the matchmaking pool (docs/ONLINE-FOUNDATION.md §relay). */
  setRoom(room: string): void {
    this.room = room;
  }

  private connect(): void {
    if (typeof WebSocket === 'undefined') {
      this.lifecycle = 'closed';
      return;
    }
    try {
      this.ws = new WebSocket(`${this.url}?room=${encodeURIComponent(this.room)}`);
    } catch {
      this.lifecycle = 'closed';
      return;
    }
    this.lifecycle = 'connecting';
    this.ws.onopen = () => {
      this.lifecycle = 'open';
      this.attempts = 0;
      this.missedBeats = 0;
      this.armHeartbeat();
    };
    this.ws.onmessage = (ev) => {
      const msg = typeof ev.data === 'string' ? decodeArenaMessage(ev.data) : null;
      if (!msg) return;
      if (msg.t === 'ping') {
        this.send({ t: 'pong', at: msg.at });
        return;
      }
      if (msg.t === 'pong') {
        this.missedBeats = 0;
        this.rtts.push(Math.max(0, Date.now() - msg.at));
        if (this.rtts.length > NETCODE.rttWindow) this.rtts.shift();
        return;
      }
      for (const fn of this.handlers) fn(msg);
    };
    this.ws.onclose = () => this.onLinkDown();
    this.ws.onerror = () => this.onLinkDown();
  }

  private onLinkDown(): void {
    if (this.lifecycle === 'closed') return;
    this.disarmHeartbeat();
    const now = Date.now();
    if (this.reconnectAt === 0) this.reconnectAt = now;
    if (now - this.reconnectAt > NETCODE.reconnectWindowSec * 1000) {
      this.lifecycle = 'closed'; // window spent — the match layer forfeits
      return;
    }
    this.lifecycle = 'dropped';
    const backoff = Math.min(8000, 500 * Math.pow(2, this.attempts++));
    setTimeout(() => {
      if (this.lifecycle === 'dropped') this.connect();
    }, backoff);
  }

  private armHeartbeat(): void {
    this.disarmHeartbeat();
    this.beatTimer = setInterval(() => {
      this.missedBeats++;
      if (this.missedBeats >= NETCODE.dropAfterMissed) {
        this.ws?.close();
        return;
      }
      this.send({ t: 'ping', at: Date.now() });
    }, NETCODE.heartbeatSec * 1000);
  }
  private disarmHeartbeat(): void {
    if (this.beatTimer !== null) clearInterval(this.beatTimer);
    this.beatTimer = null;
  }

  send(msg: ArenaMessage): void {
    if (this.lifecycle !== 'open' || !this.ws || this.ws.readyState !== 1) return;
    try {
      this.ws.send(encodeArenaMessage(msg));
    } catch {
      /* fail-soft — drop detection handles a dead socket */
    }
  }

  onMessage(fn: (msg: ArenaMessage) => void): () => void {
    this.handlers.push(fn);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== fn);
    };
  }

  rttMs(): number {
    if (this.rtts.length === 0) return 0;
    return Math.round(this.rtts.reduce((a, b) => a + b, 0) / this.rtts.length);
  }
  quality(): ConnectionQuality {
    return connectionQuality(this.rttMs(), this.missedBeats);
  }
  state(): TransportState {
    return this.lifecycle;
  }
  close(): void {
    this.lifecycle = 'closed';
    this.disarmHeartbeat();
    try {
      this.ws?.close();
    } catch {
      /* already dead */
    }
  }
}
