// ONLINE FOUNDATION (docs/ONLINE-FOUNDATION.md) — the protocol + authority layer every online
// feature (live PvP today; trading, clans, live events tomorrow) speaks. Three pieces:
//
//   1. THE COMMAND VOCABULARY — every gameplay-affecting player verb as data (ArenaCommand).
//      One `applyArenaCommand(game, cmd)` maps commands onto the Game's PUBLIC intents, and it
//      is the ONLY application path for local echo, remote mirror and AI alike — so what a
//      player "can do" is defined exactly once. Anti-cheat property BY CONSTRUCTION: commands
//      carry intents, never outcomes — a forged command cannot mint biomass or damage; the
//      deterministic sim's own affordability/validity gates reject it on every honest peer.
//
//   2. THE WIRE PROTOCOL — versioned envelopes (hello/loadout/ready/cmd/state/ping/resync/
//      finish) over any ArenaTransport (src/net/arenaTransport.ts). DETERMINISTIC-LOCKSTEP
//      model: each side simulates BOTH battlefields from the shared match seed; only commands
//      cross the wire (bytes/sec stays tiny — bandwidth optimization by architecture).
//      Reconnect/rollback = command-log replay: the full log re-simulates a match from tick 0
//      in well under a second, so a rejoining client resyncs EXACTLY (no approximation).
//
//   3. STATE BEACONS + DIGESTS — periodic light `state` messages carry the opponent's HUD facts
//      (integrity/wave) and a deterministic state digest; digest mismatch at the same tick is
//      the desync/tamper alarm (docs/ONLINE-FOUNDATION.md §anti-cheat).
//
// Pure core: no DOM, no transport, no Math.random. The sim is imported for TYPES + intents.

import type { Game } from './game';
import type { HeroKind, TowerKind } from './types';
import { SIM_DT } from './config';

export const PROTOCOL_VERSION = 1;

// ── Netcode policy (docs/ONLINE-FOUNDATION.md §netcode) ────────────────────────
export const NETCODE = {
  /** Remote commands schedule at (stampedTick + bufferTicks) — the fixed input-delay lockstep
   *  buffer. 12 ticks @ 60Hz = 200ms of jitter absorption before a rollback is ever needed. */
  bufferTicks: 12,
  /** The remote sim renders this many ticks behind its newest applied command (interpolation
   *  headroom — scrolling to the opponent never shows a stalled field). */
  remoteLagTicks: 6,
  /** Periodic light state beacon cadence (seconds) — HUD facts + desync digest. Beacons also
   *  advance the mirror's FRONTIER (the mirror never simulates past the newest received
   *  sender tick), so the cadence is the mirror's smoothness floor between commands. */
  stateBeaconSec: 0.25,
  /** Heartbeat cadence (seconds) — RTT sampling + liveness. */
  heartbeatSec: 2,
  /** Missed heartbeats before the connection counts as DROPPED (grace = reconnect window). */
  dropAfterMissed: 3,
  /** Reconnect window (seconds) — inside it the match holds and replays; past it, forfeit. */
  reconnectWindowSec: 45,
  /** A remote command older than this against the remote sim's tick forces a log replay
   *  (the rollback path) instead of in-place application. */
  maxLateTicks: 30,
  /** RTT smoothing window (samples). */
  rttWindow: 8,
} as const;

export function tickOfTime(simTime: number): number {
  return Math.round(simTime / SIM_DT);
}

// ── Connection quality (drives the HUD indicator — docs/ARENA.md §hud) ─────────
export type ConnectionQuality = 'excellent' | 'good' | 'poor' | 'bad';

export function connectionQuality(rttMs: number, missedHeartbeats: number): ConnectionQuality {
  if (missedHeartbeats >= 2) return 'bad';
  if (rttMs <= 80) return 'excellent';
  if (rttMs <= 180) return 'good';
  if (rttMs <= 350) return 'poor';
  return 'bad';
}

// ── The command vocabulary (every gameplay-affecting verb — selection is local-only) ──
export type ArenaCommand =
  | { k: 'place'; tower: TowerKind; x: number; y: number }
  | { k: 'deployConveyor'; itemId: number; x: number; y: number }
  | { k: 'strainConveyor'; itemId: number }
  | { k: 'discardConveyor'; itemId: number }
  | { k: 'sell'; towerId: number }
  | { k: 'move'; towerId: number; x: number; y: number }
  | { k: 'branch'; towerId: number; branchId: string }
  | { k: 'strain'; towerId: number }
  | { k: 'startWave' }
  | { k: 'chooseCard'; cardId: string }
  | { k: 'rerollDraft' }
  | { k: 'ability'; x: number; y: number } // primary-hero signature cast at a point
  | { k: 'rally'; x: number; y: number }
  | { k: 'buyAutocast' }
  | { k: 'toggleAutocast' }
  | { k: 'heroEvo'; catId: string }
  | { k: 'autoStart'; on: boolean };

/** A command as it crosses the wire / sits in the match log. `seq` is per-sender monotonic
 *  (gap detection); `tick` is the sender's sim tick at issue. */
export interface StampedCommand {
  tick: number;
  seq: number;
  cmd: ArenaCommand;
}

/** Apply one command through the Game's PUBLIC intent surface. Returns whether the sim
 *  accepted it (rejections are normal under latency — a late sell on a dead tower — and are
 *  simply dropped on every peer identically, keeping the lockstep deterministic). */
export function applyArenaCommand(game: Game, cmd: ArenaCommand): boolean {
  switch (cmd.k) {
    case 'place': return game.placeTower(cmd.tower, cmd.x, cmd.y);
    case 'deployConveyor': return game.deployFromConveyor(cmd.itemId, cmd.x, cmd.y);
    case 'strainConveyor': return game.strainFromConveyor(cmd.itemId) === 'ok';
    case 'discardConveyor': return game.discardConveyor(cmd.itemId);
    case 'sell': return game.sellTower(cmd.towerId);
    case 'move': {
      game.beginMove(cmd.towerId);
      const r = game.moveTower(cmd.x, cmd.y);
      if (r !== 'ok') game.cancelMove();
      return r === 'ok';
    }
    case 'branch': return game.buyBranchTier(cmd.towerId, cmd.branchId) === 'ok';
    case 'strain': return game.raiseStrain(cmd.towerId) === 'ok';
    case 'startWave': {
      if (game.phase !== 'prep') return false;
      game.startWave();
      return true;
    }
    case 'chooseCard': {
      if (game.phase !== 'draft') return false;
      game.chooseCard(cmd.cardId);
      return true;
    }
    case 'rerollDraft': return game.rerollDraft();
    case 'ability': {
      if (!game.armedAbility) game.armAbility();
      if (!game.armedAbility) return false; // ability not ready — arm refused
      game.click(cmd.x, cmd.y);
      return true;
    }
    case 'rally': {
      game.setRally(cmd.x, cmd.y);
      return true;
    }
    case 'buyAutocast': return game.buyAutocast();
    case 'toggleAutocast': {
      game.toggleAutocast();
      return true;
    }
    case 'heroEvo': return game.buyHeroEvolution(cmd.catId);
    case 'autoStart': {
      game.setAutoStart(cmd.on);
      return true;
    }
  }
}

// ── State digest (desync/tamper alarm) ─────────────────────────────────────────
/** A cheap deterministic digest of the gameplay-relevant sim state. Two honest peers at the
 *  same tick ALWAYS agree; a diverged (bugged or tampered) peer trips the mismatch alarm.
 *  FNV-1a over the load-bearing observables — not cryptographic, just collision-resistant
 *  enough for a per-second beacon. */
export function arenaStateDigest(game: Game): number {
  let h = 0x811c9dc5;
  const fold = (n: number): void => {
    // Quantize floats so IEEE noise can't false-alarm (integrity is fractional mid-decay).
    let x = Math.round(n * 16) >>> 0;
    for (let i = 0; i < 4; i++) {
      h ^= x & 0xff;
      h = Math.imul(h, 0x01000193);
      x >>>= 8;
    }
  };
  fold(game.stepCount);
  fold(game.waveIndex);
  fold(game.kills);
  fold(game.integrity);
  fold(game.biomass);
  fold(game.towers.length);
  fold(game.enemies.length);
  for (const t of game.towers) {
    fold(t.slot);
    fold(t.tier);
    fold(t.strain);
  }
  return h >>> 0;
}

// ── The wire protocol ──────────────────────────────────────────────────────────
/** The opponent identity card (hello) — everything the HUD + matchmaking fairness check need. */
export interface ArenaHello {
  proto: number;
  playerId: string;
  name: string;
  tag: string; // designation tag (#0421)
  power: number;
  rating: number;
  season: number;
  heroKind: HeroKind; // portrait (slot-1 hero)
}

/** The loadout fingerprint (anti-cheat seam): a stable hash of the build the peer CLAIMS,
 *  stored server-side with the match so post-hoc verification can compare claims to results. */
export interface ArenaLoadoutCard {
  fingerprint: number;
  towerKinds: TowerKind[];
  heroKinds: HeroKind[];
}

export type ArenaMessage =
  | ({ t: 'hello' } & ArenaHello)
  | ({ t: 'loadout' } & ArenaLoadoutCard)
  | { t: 'ready'; matchId: string; seed: number }
  | ({ t: 'cmd' } & StampedCommand)
  | { t: 'state'; tick: number; digest: number; integrityFrac: number; wave: number; heroDown: boolean }
  | { t: 'ping'; at: number }
  | { t: 'pong'; at: number }
  | { t: 'resyncReq' } // "I reconnected — send me the log"
  | { t: 'resync'; seed: number; matchId: string; cmds: StampedCommand[]; tick: number }
  | { t: 'finish'; integrityFrac: number; wave: number; damageDealt: number; fellAtSec: number | null }
  | { t: 'forfeit' }
  | { t: 'bye' };

/** Codec — JSON with a version + shape gate on decode. Unknown/foreign payloads decode to
 *  null (never throw): a malformed peer can only be ignored, not crash the match loop. */
export function encodeArenaMessage(msg: ArenaMessage): string {
  return JSON.stringify({ v: PROTOCOL_VERSION, ...msg });
}

const MESSAGE_KINDS = new Set<string>(['hello', 'loadout', 'ready', 'cmd', 'state', 'ping', 'pong', 'resyncReq', 'resync', 'finish', 'forfeit', 'bye']);

export function decodeArenaMessage(raw: string): ArenaMessage | null {
  try {
    const o = JSON.parse(raw) as { v?: unknown; t?: unknown };
    if (o.v !== PROTOCOL_VERSION || typeof o.t !== 'string' || !MESSAGE_KINDS.has(o.t)) return null;
    return o as unknown as ArenaMessage;
  } catch {
    return null;
  }
}

/** Stable fingerprint of a loadout summary (FNV over the sorted kind lists). */
export function loadoutFingerprint(towerKinds: readonly TowerKind[], heroKinds: readonly HeroKind[], power: number): number {
  const s = `${[...towerKinds].sort().join(',')}|${[...heroKinds].sort().join(',')}|${Math.round(power)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ── Server-authority policy (docs/ONLINE-FOUNDATION.md §authority) ─────────────
/** Every progression event class, with its authority rule. The table IS the policy: a future
 *  progression system adds one row and inherits the online model (no rewrites). When the
 *  session is ONLINE the server validates/settles the event; OFFLINE (or vs AI without infra)
 *  the SAME shared validators run locally and the settle is queued for reconciliation. */
export type AuthorityRule = 'server' | 'shared-validated';

export const PROGRESSION_AUTHORITY: Record<string, AuthorityRule> = {
  'arena.match': 'server', // rating, wins, pass XP — functions/api/arena/report.ts
  'arena.passClaim': 'shared-validated', // deterministic tables; server reconciles on sync
  'arena.exclusive': 'shared-validated', // level-100 grant — derivable, ledgered, bindable
  'trade.list': 'server', // future Auction House — server-only, no offline path
  'trade.bid': 'server',
  'trade.settle': 'server',
  'purchase.checkout': 'server', // existing Stripe flow (docs/DEPLOYMENT.md §purchases)
  'leaderboard.submit': 'server', // existing bounds + replay verification
  'cloud.sync': 'server', // existing envelope sync (docs/ACCOUNTS.md)
};
