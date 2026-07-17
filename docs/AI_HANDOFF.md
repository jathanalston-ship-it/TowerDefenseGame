# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-17 · **Diff scope:** the recognition/relay batch (pushed ab95670)
  PLUS the Live-PvP-brief delta batch (this commit: private bouts, the ladder, the sweep)
- **Branch:** claude/zen-hawking-rh1gxl

## Summary of work completed

The ARENA RECOGNITION LAYER + THE RELAY BRING-UP (the Online Foundation saga's first two
follow-ups, user-directed; Auction House phase 2 explicitly deferred): 11 `arena_*`
achievement rows + the Profile's Proving Grounds career section (docs/ARENA.md §recognition),
and LIVE HUMAN-vs-HUMAN MATCHES over a real WebSocket relay (docs/ONLINE-FOUNDATION.md
§relay) — the pure `RelayBroker` room server (`npm run relay`, `ws` devDep), the
`findArenaOpponent` matchmaker racing the 20-second AI window, the `paired → hello/loadout/
boot → peerProblem gate → ready-echo` handshake, ArenaSession wired into ArenaView with a
live RTT/quality chip, and reconnects re-targeted at the match room. **The one thing the
next session must know:** the relay is DUMB (a pairing pipe) and the broker is PURE — all
trust lives in the shared validators (`peerProblem`/`bootBundleProblem`) plus the server
settle; a Durable-Objects migration imports `functions/lib/arenaRelayRoom.ts` verbatim.

THEN the LIVE-PvP BRIEF (user-queued): audited against the landed saga — the coverage map
lives in ARENA.md §brief-coverage; the two recorded-decision conflicts (`noMega`,
server-side sim) are flagged there for the user. The genuine deltas shipped: PRIVATE BOUTS
(§private — friendly, unrated, by shared code over direct relay rooms; never settles),
THE SEASON LADDER (§ladder — GET /api/arena/ladder + migration 0006 names + the Proving
Grounds ladder tab), and THE SWEEP (§sweep — `npm run arena:sweep`; the shipped 240-match
AI-vs-AI run is STABLE with 100% server-valid claims → docs/ARENA_MATCH_REPORT.md).

## Files modified

- Source (14): `src/changelog/releases.gen.ts`, `src/core/arenaMatch.ts`, `src/core/online.ts`, `src/dev/dil/knowledge.ts`, `src/dev/systemRegistry.ts`, `src/net/arenaTransport.ts`, `src/state/achievements.ts`, `src/state/profile.ts`, `src/ui/App.tsx`, `src/ui/ArenaScreen.tsx`, `src/ui/ArenaView.tsx`, `src/ui/Hub.tsx`, `src/ui/PlayerProfile.tsx`, `src/net/arenaMatchmaker.ts`
- Tests (4): `src/state/achievements.test.ts`, `src/state/profile.test.ts`, `functions/arenaRelay.test.ts`, `src/net/arenaMatchmaker.test.ts`
- Docs (6): `docs/ARENA.md`, `docs/DEPENDENCY_GRAPH.md`, `docs/DIL_GRAPH.md`, `docs/HISTORY.md`, `docs/ONLINE-FOUNDATION.md`, `docs/VALIDATION_REPORT.md`

## Systems affected (from the dependency registry)

- **achievements** — `src/state/achievements.ts`
- **arena** — `src/core/arenaMatch.ts`, `src/ui/ArenaScreen.tsx`, `src/ui/ArenaView.tsx`
- **chronicle** — `src/changelog/releases.gen.ts`
- **dev-registry** — `src/dev/dil/knowledge.ts`, `src/dev/systemRegistry.ts`
- **hub-shell** — `src/ui/App.tsx`, `src/ui/Hub.tsx`
- **online-foundation** — `src/core/online.ts`, `src/net/arenaTransport.ts`, `src/net/arenaMatchmaker.ts`
- **profile** — `src/state/profile.ts`, `src/ui/PlayerProfile.tsx`
- Consumer ring (verify, unchanged): accounts, battle-pass, cosmetics, hive-construction, infestation, onboarding, pil, quests

## Power Score changes

None moved. Recognition is deliberately zero-Power (the arena registry row's recorded
stance); the new achievement rows pay Genome Cores/Ichor through the existing one-shot
lanes, and the pvp profile section is read-only. Fresh-save Power stays suite-pinned.

## UI changes

Surfaces in the blast radius: `AchievementPanel`, `RewardReveal (inline strip)`, `AchievementToaster`, `ArenaScreen`, `ArenaView`, `Hub`, `PlayerProfile (pvp section)`, `ArenaView (opponent bar, PvP timer, connection chip, scroll indicator, command dock)`, `App (UpdateBriefing popup)`, `CommandCenter`, `ProgressDashboard`, `PlayerProfile`

Profile gains the **Proving Grounds** career fold (division/rating/records/pass/crowns/
best-closed-season; hidden until first arena touch — the one declared-empty section on a
fresh save). The queue console now RACES the relay's human lane against the 20s AI window
(console UI unchanged — the transition stays invisible). ArenaView's connection chip is LIVE
for human matches (RTT ms + quality color; RECONNECTING…/LOST states); the opponent bar
names the human peer (hello name + tag). Verified END-TO-END headlessly on a
`VITE_ARENA_RELAY_URL` build: two real clients queued, paired through the running relay
(`npm run relay`), and landed in live ArenaViews naming each other with `⇄ 2ms · excellent`
chips — zero page errors, screenshot reviewed. Mobilecheck CLEAN (27 screens × 4 viewports).

## Documentation changes

Registry says these move with the touched systems: `docs/PROGRESSION-SYSTEMS.md`, `docs/PROFILE.md`, `docs/ARENA.md`, `docs/CHANGELOG-PIPELINE.md`, `docs/DIL.md`, `docs/DEPENDENCY_GRAPH.md`, `docs/ENGINEERING-AUDIT.md`, `docs/GAME_CONSTITUTION.md`, `docs/PROJECT_STATUS.md`, `docs/AI_HANDOFF.md`, `docs/PIL.md`, `docs/COMMAND-CENTER.md`, `docs/HOME-BASE.md`, `docs/ONE-MORE-RUN.md`, `docs/HUD.md`, `docs/PROGRESSION-LOOP.md`, `docs/UX-CONSOLIDATION.md`, `docs/HIVE-CONSTRUCTION.md`, `docs/INFESTATION.md`, `docs/COSMETICS.md`, `docs/BATTLEPASS.md`, `docs/QUESTS.md`, `docs/ONLINE-FOUNDATION.md`, `docs/TRADING-PREP.md`, `docs/ACCOUNTS.md`, `docs/DEPLOYMENT.md`, `docs/TUTORIAL.md`, `docs/HELP.md`, `docs/TUTORIAL-AUDIT.md`, `docs/GUIDED-UNLOCKS.md`

Updated: `docs/ONLINE-FOUNDATION.md` (§relay — server/rooms/handshake/keys/reconnect +
limitations), `docs/ARENA.md` (§recognition + limitations), DIL knowledge (+2 rows) and both
regenerated graphs, `docs/PROJECT_STATUS.md` + this handoff. The remaining listed docs move
with UNTOUCHED consumer systems — no change needed.

## Save changes

None — recognition reads `save.arena` as-is; the relay is transport-layer only.

## Known edge cases

- Matchmaking keys quantize power to one log2 band — a fair pair straddling a band edge
  misses and falls to the AI window (documented §relay; the client-side live-bracket gate in
  `peerProblem` is the real fairness check either way).
- `RelayTransport.setRoom` on `paired` is LOAD-BEARING: without it a mid-match reconnect
  re-enters the matchmaking pool, where a stranger's commands would corrupt the mirror.
- The broker answers pings ONLY for unpaired sockets (a waiter's heartbeat must not starve);
  paired pings forward and the PEER answers — don't "fix" the relay into answering both or
  RTT stops measuring the full loop.
- A command sent in the beat between matchmaker resolve and ArenaSession attach is recovered
  by the seq-gap → resync lane (self-healing by architecture — no ordering shim needed).
- `arena_placed` requires `season > 0` (a fresh record has placements=5 at season 0 and must
  not fire); division achievements ride `peak`, never the soft-reset live rating.

## Remaining technical debt

- The relay is self-hosted node infrastructure (`npm run relay`), not yet a deployed
  Cloudflare service — the broker is DO-portable by construction (no node imports).
- Private matches / spectators would reuse the relay's DIRECT rooms; no UI is wired to them.

## Recommended next tasks

1. THE LIVE-PvP BRIEF (user-queued next): audit against the landed saga + this batch, then
   implement the genuine deltas (arena mode hooks — Quick/Private over direct rooms; bulk
   AI-match stability sweep; rating leaderboard lane). Two brief lines conflict with RECORDED
   decisions and need the user's call: arena `noMega` (ARENA.md §1) and "server simulates
   everything" vs the documented lockstep + server-progression-authority architecture
   (ONLINE-FOUNDATION.md §0).
2. Deploy the relay (Durable Object or any ws host) + set `VITE_ARENA_RELAY_URL` in the
   Pages build — human matchmaking lights up with zero code changes.
3. Auction House phase 2 (explicitly deferred): D1 listings/bids over the prepared types.

## Future expansion hooks

- `functions/lib/arenaRelayRoom.ts` — DIRECT rooms are the private-match/spectator seam.
- `net/arenaMatchmaker.ts` `peerProblem` — the one gate to extend for stricter fairness.
- `core/online.ts` `ArenaMessage` — `paired`/`boot` joined the versioned envelope; a future
  intent stays one union member + one switch arm.
