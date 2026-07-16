# ONLINE-FOUNDATION.md — the authoritative online architecture

> Canonical doc for `src/core/online.ts`, `src/net/arenaTransport.ts`, and the server-authority
> model every online feature inherits. Related: `ARENA.md` (the live PvP pillar built on this),
> `TRADING-PREP.md` (the Auction House backend prep), `DEPLOYMENT.md` (the Pages Functions
> backend), `SECURITY.md` (the client action guard layer), `ACCOUNTS.md` (identity + sync).

## 0. Design position

ASSIMILATION's sim is **deterministic and client-side by design** (ARCHITECTURE.md §5;
SECURITY-AUDIT.md "do not move gameplay simulation to the server"). The online foundation
builds on that instead of fighting it:

- **Deterministic lockstep for PvP** — each client simulates BOTH battlefields from a shared
  match seed; only player COMMANDS cross the wire (§2). Bandwidth is architecture-level tiny
  (bytes per action, not state streams), and the opponent's battlefield is a *genuine live
  simulation*, not a replicated approximation.
- **Server authority for PROGRESSION** — the client never decides rewards/rating/track XP.
  Every progression event derives from validated FACTS via shared validator code that the
  Pages Functions import verbatim (`functions/api/arena/report.ts` ← `src/core/arena.ts`; the
  `premium.ts` shared-code precedent), so the server can never disagree with what the client
  promised. Offline / vs-AI settles run the SAME validators locally and reconcile via cloud
  sync (§4).
- **Anti-cheat by construction** — commands carry INTENTS, never outcomes. A forged command
  cannot mint biomass or deal damage: the deterministic sim's own affordability/validity gates
  reject it identically on every honest peer. State DIGESTS (per-second beacons) make any
  divergence — bug or tamper — visible immediately (§3).

## 1. The command vocabulary (`core/online.ts`)

Every gameplay-affecting player verb is data — `ArenaCommand`:
`place · deployConveyor · strainConveyor · discardConveyor · sell · move · branch · strain ·
startWave · chooseCard · rerollDraft · ability · rally · buyAutocast · toggleAutocast ·
heroEvo · autoStart`. Selection/inspection stays local-only (never replicated).

`applyArenaCommand(game, cmd)` is the ONE application path — local echo, remote mirror and the
AI controller all speak it, so "what a player can do" has exactly one definition. It maps onto
the Game's PUBLIC intent surface (`placeTower`, `startWave`, …) and returns the sim's verdict.
Rejections under latency (a late sell on a dead tower) drop identically on every peer.

**A future intent = one union member + one switch arm here.** Nothing else changes: the wire,
the log, the AI and the replay path inherit it.

## 2. The wire protocol

`ArenaMessage` envelopes (versioned, JSON; `decodeArenaMessage` never throws — malformed peers
are ignored, not crash vectors):

| Message | Purpose |
|---|---|
| `hello` / `loadout` | identity card (name/tag/power/rating/hero) + loadout fingerprint |
| `ready` | match id + shared seed — both sims boot identically |
| `cmd` | one stamped command `{tick, seq, cmd}` |
| `state` | per-second beacon: integrity/wave/hero-down + the state DIGEST |
| `ping`/`pong` | RTT sampling (drives the HUD latency + quality indicator) |
| `resyncReq` → `resync` | reconnect: the full command log replays the match exactly (§3) |
| `finish` / `forfeit` / `bye` | terminal facts exchange |

**Netcode policy (`NETCODE`):** remote commands schedule at `stampedTick + bufferTicks`
(200 ms of jitter absorption at 60 Hz); the remote sim renders `remoteLagTicks` behind its
newest command (interpolation headroom); heartbeats every 2 s; `dropAfterMissed` heartbeats ⇒
DROPPED; a `reconnectWindowSec` grace holds the match for command-log resync before forfeit.

## 3. Rollback, reconnect, desync

The deterministic sim makes the strongest netcode primitive FREE: **any match state is
reproducible from (seed, command log)**. A 5-minute match is ≤ ~18k ticks — a full replay
re-simulates in well under a second headlessly.

- **Late command past `maxLateTicks`** → the mirror sim rebuilds from the log (rollback with
  perfect accuracy, no interpolation artifacts).
- **Reconnect** → `resyncReq`; the peer answers with `{seed, cmds, tick}`; the rejoining client
  replays to the live tick. Inside `reconnectWindowSec` the match simply continues.
- **Desync detection** → `arenaStateDigest(game)` (quantized FNV over the load-bearing
  observables: step/wave/kills/integrity/biomass/towers) rides every `state` beacon; a mismatch
  at the same tick flags the match for server-side review (the replay IS the evidence).

## 4. The server-authority policy table

`PROGRESSION_AUTHORITY` (core/online.ts) enumerates every progression event class with its
rule — the table IS the policy; a future system adds one row and inherits the model:

| Event | Rule |
|---|---|
| `arena.match` (rating/wins/pass XP) | **server** — `functions/api/arena/report.ts`, exactly-once by matchId |
| `arena.passClaim` / `arena.exclusive` | shared-validated (deterministic tables, ledgered, reconciled on sync) |
| `trade.list` / `trade.bid` / `trade.settle` | **server-only** — no offline path (TRADING-PREP.md) |
| `purchase.checkout` | **server** — the existing Stripe flow |
| `leaderboard.submit` | **server** — existing bounds + replay verification |
| `cloud.sync` | **server** — the existing envelope engine |

"Shared-validated" means: the SAME validator module runs on both sides; offline settles are
queued facts the next sync reconciles — never client-invented values.

## 5. Transports (`src/net/arenaTransport.ts`)

`ArenaTransport` is the seam: `send(msg)` / `onMessage` / `rtt()` / `quality()` / lifecycle.

- **LoopbackTransport** — the in-process pair (AI matches + tests) with a configurable latency
  / jitter / drop model, so high-latency and disconnect behavior is exercised in CI, not
  discovered in production.
- **RelayTransport** — WebSocket to `VITE_ARENA_RELAY_URL` (heartbeat, RTT, backoff reconnect,
  resync on rejoin). Ships DORMANT: without a configured relay the matchmaker always resolves
  to the AI opponent at the search window's end — the seamless fallback is the launch
  experience, and real infrastructure is a config value + a Durable-Objects relay away
  (documented in DEPLOYMENT.md's future-work section; the protocol is transport-agnostic).

## 6. What a future online feature must do

1. Speak commands (one union member) — never mutate the remote sim directly.
2. Route progression through a `PROGRESSION_AUTHORITY` row + shared validators.
3. Stamp acquisitions through the provenance ledger (TRADING-PREP.md) if it grants items.
4. Add its transport traffic as `ArenaMessage` envelopes (version-gated).
5. Test under the LoopbackTransport's latency/jitter/drop model.

## Known limitations

- No deployed realtime relay yet — live cross-device PvP awaits a Durable-Objects (or
  equivalent) relay; until then every match past the search window is vs the AI framework
  (which fields real builds and plays the real sim — see ARENA.md §ai).
- Command-log resync assumes both peers keep the log for the match duration (they do — it is
  also the anti-cheat evidence object).
- `arenaStateDigest` is a tripwire, not a proof; authoritative adjudication is the server-side
  replay of the command log (the leaderboard replay-verification precedent).
