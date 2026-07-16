# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-16 15:21 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 7bed509

## Summary of work completed

THE ONLINE FOUNDATION SAGA — the largest architectural batch of the project, in four pushed
commits (80509a8 → 5772b2c → 7bed509 → this docs batch): (1) the authoritative ONLINE
FOUNDATION (docs/ONLINE-FOUNDATION.md) — replicated command vocabulary with ONE
`applyArenaCommand` path, deterministic-lockstep wire protocol, frontier-bounded mirrors with
exact-tick application (live mirror ≡ command-log replay ⇒ rollback and reconnect are the same
primitive), digest beacons with self-healing resync, the `PROGRESSION_AUTHORITY` table, seeded
loopback network model + dormant WebSocket relay; (2) AUCTION HOUSE BACKEND PREP
(docs/TRADING-PREP.md, save **v47**) — per-item provenance stamps with self-healing load-time
coverage, Ichor trade economics, fraud heuristics, the `item_events` D1 ledger — deliberately
NO trading gameplay/UI; (3) the ARENA pillar (docs/ARENA.md) — mirror siege-race matches
(noMega), 20s Power-bracket matchmaking with seamless procedural AI ACCOUNTS playing the real
sim through commands, Spore→Apex divisions (placements/streaks/decay/30-day soft resets),
division-banded match rewards (wins: container + Run Cache; losses: cores + salvage), the
wins-only 100-level Arena Pass with procedurally rotated seasonal tables + hard Ichor cap,
server settlement endpoints sharing the client's validators, idle-harvest rank dividends, and
the Proving Grounds screen + dual-battlefield ArenaView (mirrored live opponent sim, PvP HUD);
(4) the three ARENA EXCLUSIVES as full content (Basilisk Maw / Ossuary Choir / Chimera).
**The one thing the next session must know:** every online surface derives from
`core/online.ts` + `core/arena.ts` shared modules — the server imports them verbatim; never
add a claim field or a reward amount the shared validators don't derive.

## Files modified

Across the four pushed batches: ~40 source files (12 new core/net modules, 3 UI, 2 backend
endpoints, 1 migration), 7 new test files (arena/arenaPass/arenaAi/arenaMatch/online/
itemIdentity/arenaMeta + netcode + backend), and this docs batch (`PROJECT_MANIFEST.md`,
`GAME-STATE.md`, `ARENA.md`, `ONLINE-FOUNDATION.md`, `TRADING-PREP.md`, DIL knowledge + graphs,
UNLOCK-TREE, VALIDATION_REPORT). The trailing scaffold diff caught only the chronicle + DIL
knowledge artifacts.

## Systems affected (from the dependency registry)

- **online-foundation** (NEW) — protocol/provenance/trading/transports/session
- **arena** (NEW) — rank/pass/AI/match/UI/backend
- **engine** — `RunOptions.noMega` (one gate at `spawnMegaBoss`; absent ⇒ golden path)
- **idle-harvest** — identity-defaulted arena dividend params on rate/cap/accrual
- **meta-store** — save v47 (`arena`, `provenance`), settle/claim methods, reward-list
  provenance stamping; **security** — 4 new policies; **towers/heroes** — the exclusives;
  **hub-shell** — NavKey/unlocks/mechanics/i18n rows; **net-backend** — arena endpoints + FakeD1.

## Power Score changes

Arena rank is deliberately ZERO-Power (the Genome Rank prestige-lane precedent, recorded in
the registry row). The exclusives are full content pieces scored by the existing tower/hero
buckets once unlocked — fresh saves unchanged (POWER_BASE untouched, suite-pinned).

## UI changes

New surfaces: the Proving Grounds hub screen (queue console with widening bracket + honest
20s countdown, ranked emblem, wins-only pass track with claims/premium/crown showcase, season
history) and the ArenaView match surface (vertically-expanded battlefield: opponent's genuine
live sim mirrored above the membrane seam; wheel/drag scroll with ease-home camera + reset;
opponent bar with health/portrait/name/rating; PvP timer; connection chip; command dock;
draft modal; verdict panel). Verified LIVE headlessly on the real bundle: hub → queue → AI
fallback → place/start-wave commands → scroll to the live mirrored opponent → camera reset →
mid-match HUD; zero page errors (9 screenshots reviewed). Mobilecheck CLEAN (in validate).

## Documentation changes

New canon: `ONLINE-FOUNDATION.md`, `ARENA.md`, `TRADING-PREP.md`. Updated: manifest (+2
sections + index), GAME-STATE (v47 header, tower/hero counts 22/11, the online/arena/exclusives
status block), UNLOCK-TREE + DIL_GRAPH + DEPENDENCY_GRAPH (regenerated), 5 DIL knowledge rows.
`docs/CHANGELOG-PIPELINE.md`/`DIL.md`/`ENGINEERING-AUDIT.md`/`GAME_CONSTITUTION.md`/`PIL.md`:
no change needed (pipelines regenerated their own artifacts; no rule/tooling amended).

## Save changes

**v46 → v47** (both additive, migration-tested): `arena` (season record: rating/placements/
streak/pass ledgers/FOREVER exclusives/history/settled-match ring; junk degrades to an inert
record) and `provenance` (the coverage-invariant stamp ledger — reconciled on EVERY load AND in
`defaultSave`). Sanitizer detail: `lastPlayedAt` caps at year-2100 epoch-ms (the 1e9 default
cap crushed real timestamps into full decay — fixed and pinned by arenaMeta tests).

## Known edge cases

- `arenaExclusive` towers carry NO `unlockShards` yet must never be starters — THREE seams
  special-case the flag (`starterTowers`, `isTowerUnlocked`, `towerShardGateMet`); a new
  unlock/shard surface must honor it or the Pass crowns leak to everyone.
- The mirror is FRONTIER-BOUNDED: it never simulates past the newest received sender tick, so
  commands apply on exact stamps. Weakening that (e.g. free-running the mirror) silently
  diverges live mirrors from replays and trips resync storms.
- Arena settles are exactly-once by matchId on BOTH sides — resubmits are free by design;
  never "fix" the duplicate return path into an error.
- The arena pass Ichor cap is enforced at TABLE GENERATION (overflow → cores); retuning the
  rotation weights cannot break the economy law, but changing `ARENA_PASS_ICHOR_CAP` needs the
  arenaPassEconomy scan (40 seasons) re-read.
- The ArenaView pixel-flips the opponent field, so the renderer's baked lane labels read
  upside-down there (damage floats are stripped); cosmetic, documented in ARENA.md.

## Remaining technical debt

- No deployed realtime relay: human-vs-human matches await a Durable-Objects (or any ws room)
  relay — the transport/protocol/resync seams are relay-ready and CI-exercised via the
  loopback network model. Launch experience is the AI framework (per spec's fallback mandate).
- The ArenaView is a lean command surface: no branch/strain/inspector console mid-match yet;
  arena runs deliberately skip PvE ledgers (mastery XP/loot meter) — revisit only with
  engagement evidence.
- Arena achievements/collection codex rows are not yet authored (recognition layer); the
  mechanics row + unlock reveal cover onboarding.

## Recommended next tasks

1. Arena recognition layer: achievements (first win / placements done / division tiers /
   season crown) + a `pvp` profile section — all data rows on existing frameworks.
2. The relay: a minimal ws room server + `RelayTransport` bring-up behind
   `VITE_ARENA_RELAY_URL`, then human matchmaking through the same queue console.
3. Auction House phase 2 (when wanted): D1 listings/bids schema + endpoints over the prepared
   types; escrow + `recordTransfer` wiring; the browse/sell UI reading `tradeEligibility`.
4. Persona-simulator pass over arena pacing (wins/day vs pass curve) once real telemetry or
   the progression sim gains a PvP persona.

## Future expansion hooks

- `core/online.ts` — one union member + one switch arm per new player verb; one
  `PROGRESSION_AUTHORITY` row per new online event class.
- `core/arenaPass.ts` — seasonal wardrobe cosmetics are one unlock-source row + pool entries;
  `arenaExclusiveForSeason` extends past three crowns by appending to `ARENA_EXCLUSIVES`.
- `core/trading.ts` — `pvpLegality` is the seasonal-ruleset seam; `auditTradeEvents` is
  servable as-is over the `item_events` ledger.
- `core/arenaAi.ts` — new personalities are data rows; `ARENA_AI.exclusiveMinDiv` gates what
  deep-ladder AI showcases.
