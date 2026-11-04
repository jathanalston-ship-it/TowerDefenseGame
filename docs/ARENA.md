# ARENA.md — live PvP, ranked seasons, the Arena Pass

> Canonical doc for `src/core/arena.ts`, `src/core/arenaPass.ts`, `src/core/arenaAi.ts`,
> `src/core/arenaMatch.ts`, the arena backend (`functions/api/arena/*`) and the Arena UI.
> Built on `ONLINE-FOUNDATION.md` (protocol/authority/netcode). Save: `save.arena` (v47).

## 0. The pillar in one paragraph

THE PROVING GROUNDS: two hives fight the same escalating assault on mirrored battlefields —
the local player below, the opponent above (vertical scroll; never both at once) — and the
survivor takes the rating. Matchmaking is Power-Score-bracketed with a hard 20-second ceiling:
if no fair human match exists, a procedurally-built AI OPPONENT takes the slot seamlessly and
plays the real sim with real intents. Wins (and only wins) advance a 100-level seasonal ARENA
PASS whose level-100 crown alternates between three permanently arena-exclusive content
pieces. Rank pays modest, diminishing Idle-Harvest dividends — participation rewards that
never invalidate PvE progression.

## 1. The ruleset — the mirror SIEGE RACE

- Both sims boot from the SHARED match seed in `endless` mode (identical difficulty curves +
  wave budgets; composition varies only by each side's own combat rng — statistically fair,
  identical in expectation). **Mega Bosses are suppressed in arena** (`RunOptions.noMega`) —
  match-scale fights stay wave-vs-wave (a design decision, not a limitation).
- Each player commands ONLY their own field, through the shared command vocabulary
  (ONLINE-FOUNDATION.md §1). The opponent's field is a genuine live simulation — towers, hero,
  projectiles, gene effects, statuses, everything.
- **Win:** the opponent's Nucleus falls first. At the PvP timer (`ARENA.matchSec` 300 s) the
  tiebreak ladder is integrity % → waves cleared → damage dealt → draw.
- Forfeit/disconnect past the reconnect window = loss (the reconnect flow first replays the
  command log — see ONLINE-FOUNDATION.md §3).

## 2. Matchmaking (docs spec: 20 s hard ceiling, Power brackets, AI fallback)

`matchSearchState(elapsedSec, power)` — the pure model the console renders: the Power bracket
starts at ±15% and WIDENS to ±60% across the 20-second window; `opponentInBracket` gates
candidates; at window end the AI opponent takes the slot with the same hello/loadout handshake
(the transition is invisible — same protocol, same HUD). Estimated wait is honest: the
fallback guarantees a match inside the window.

## §toggle — human matchmaking on by default, AI-only as a HARDENED opt-out (2026-07)

Wherever a relay is configured, the queue hunts humans by default. The console's
**OPPONENTS** row (`HUMANS + AI` / `AI ONLY`) is a device-local pref
(`humanMatchmakingPref`, `assimilate.humanMM` — `state/prefs.ts`), read at queue ENTRY
only (no mid-search flips; the toggle locks while searching).

- **Opting out is honored, never free:** an AI-only queue skips the 20 s hunt
  (`ARENA.aiOnlySearchSec` = 3 s beat) but the sparring construct generates at
  `aiFallbackPower(power, optedOut=true)` = **×`ARENA.aiOptOutPowerPremium` (1.25) Power**
  with UNCHANGED Elo stakes — ducking humans is a harder fight for the same rating,
  so the opt-out can't become the easy-rating farm.
- **The involuntary fallback stays at parity (×1):** a player who WANTED humans and found
  none is never punished for an empty pool — same power, same stakes, invisible transition.
- No relay configured ⇒ the toggle renders disabled and every queue is the AI lane at ×1
  (the pre-relay behavior, unchanged).

Tunables live in `ARENA` (`core/arena.ts`); the hardening applies at GENERATION
(`generateAiOpponent` receives the premium power), so every downstream system — boot
validation, match rewards, server settle — sees an ordinary opponent.

## 3. Ranked divisions

Ten divisions over the rating line (`ARENA_DIVISIONS`, data): Spore III→I · Larval III→I ·
Chrysalis II→I · Apex Strain II→I (thresholds 0..2800; the spec's Bronze/Silver/Gold ladder in
Assimilate's fiction). Rating model (`ratingDelta`): logistic expectation (scale 400), K=96
during the 5 placement matches then K=32, capped win-streak bonus, wins always > 0 / losses
always < 0 (fairness floor). **Decay** bites only Chrysalis+ after 7 idle days (−15/day), never
below Larval I. **Season roll** (`rolledArenaSave`): archive history, soft-reset
`600 + (old−600)×0.5`, re-arm placements, clear the pass — idempotent, applied lazily on the
first arena touch of a new season.

## 4. Seasons (30-day UTC windows)

`arenaSeasonIndex(now)` from the fixed epoch (`ARENA.epochMs`). Each season procedurally
rotates (deterministically from its index — `arenaSeasonInfo`): name, glyph, accent palette,
music re-voice, tagline, and the entire pass reward table (§5). Structure stays foundational;
contents rotate.

## 5. The Arena Pass (100 levels, wins-only)

`core/arenaPass.ts` — speaks the Battle Pass `PassReward` vocabulary so meta's ONE interpreter
pays both passes.

- **Progress:** `ARENA.winPassXp` (10) per WIN, zero on loss/draw. Level costs band 10/15/20 XP
  (1–40/41–70/71–100) ⇒ 1450 XP ≈ **145 wins** for the full clear (~5 wins/day across the
  30-day season).
- **Tracks:** free + premium on every level, both never empty (test-enforced). Premium unlock:
  `ARENA_PASS.premiumIchor` (200 Ichor).
- **Rotation:** the table is seeded per season — containers, cores, essence, materials,
  shards, stamina, phenotype cosmetics and small Ichor rotate genuinely (neighbor seasons
  differ; the same season is byte-identical forever).
- **Economy law (structural):** each track's total Ichor is HARD-capped by construction
  (`ARENA_PASS_ICHOR_CAP`, premium cap = 50% of the premium price; overflow converts to cores
  at generation) — completing a pass can never fund the next one.

## 6. Arena exclusives (the level-100 crown)

`ARENA_EXCLUSIVES` alternate forever: **Basilisk Maw** (Tower A) → **Ossuary Choir** (Tower B)
→ **Chimera** (Hero) → repeat. Granted ONLY by claiming pass level 100 that season
(`save.arena.exclusives` is a forever-ledger); no shard drops, no market, no containers —
enforced at the content defs (no `unlockShards`/stage path) and the meta grant. Each is a
fully-integrated content piece (stars, branches, adaptation, mastery, mulligans, collections,
Power) — see §content in TOWERS.md / HEROES.md when they land.

## 7. Match rewards (server-derived, never claimed)

`arenaMatchRewards(outcome, divisionIndex)` — deterministic on both sides:

| Outcome | Pays |
|---|---|
| **Win** | a division-banded Bio-Container (common → rare @ Larval → epic @ Chrysalis+) + a Run Cache + 10 pass XP |
| **Loss** | standard resources only: 25 Genome Cores + salvage materials (scrap; mutagen at Chrysalis+) |
| **Draw** | 55 Genome Cores |

Claims are FACTS (`ArenaMatchClaim`), validated by the shared `arenaClaimProblem` bounds
(rejects forgeries: implausible pace, out-of-range power/duration/wave) — the server re-runs
the identical validator and derives rating/rewards itself (`functions/api/arena/report.ts`).

## 8. Rank benefits (modest, diminishing — never runaway)

- Idle-Harvest rate dividend: `arenaIdleDividend(divisionIndex)` = `1 + min(0.15, 0.048·√d)` —
  ×1.00 at Spore III (IEEE-identity for non-arena accounts ⇒ golden-safe), ×1.145 cap at Apex.
- Harvest storage bonus: `arenaIdleCapBonusHours` — up to +6 h, flat and small.
- Both fold through the existing idle closed forms (IDLE-HARVEST.md §rank precedent).

## 9. The AI opponent framework (`core/arenaAi.ts`)

Procedural AI ACCOUNTS, not scripts: a seeded profile (name/personality axes) + a generated
progression bundle (tower roster, stars/progression mults, hero + gear effects, starting
genes) scaled to the target Power bracket; the controller drives a REAL `Game` through the
SAME command vocabulary — placing, merging, branching, straining, drafting by synergy,
casting on threats, reacting to breaches. No two AI opponents feel identical (seeded
variation); fairness is structural (same sim, same rules, bracket-matched power).

## 10. HUD (docs spec §hud)

The in-run arena overlay: opponent health + hero portrait + name/tag, arena rank emblem,
latency (RTT) + connection-quality dots, PvP timer, the vertical-scroll indicator and the
camera-reset control. Camera: the battlefield extends vertically — scroll to inspect the
opponent's field (never both at once; zoom unchanged); focus returns to your field on release.

## §recognition — achievements + the PvP profile wing (2026-07)

Eleven `arena_*` achievement rows (`state/achievements.ts`) — first match/win, placements
done, a 5-streak, division watermarks at Larval/Chrysalis/Apex (riding `peak`, which never
soft-resets), the 25/100 lifetime-win ladder, the Season Crown (first exclusive owned), and
Perennial (3 closed seasons). `settleArenaMatch`/`claimArenaPassLevel` already evaluate
achievements — the rows needed zero new triggers. The Profile's **Proving Grounds** section
(`state/profile.ts` `pvp-core`) shows division/rating/records/pass/crowns/best-closed-season
and stays hidden until the account's first arena touch (the one declared-empty profile
section on a fresh save).

## §private — Private Bouts (friendly, unrated)

Two players agree on a code and both press SPAR on the Proving Grounds console: each joins
the direct relay room `pm:<season>:<CODE>` (codes normalize — trim/case/punctuation — so
friends always land together), the broker fills it with the SAME `paired` handshake as
ranked, and the peer gate keeps protocol/season/boot-bounds/fingerprint but DROPS the power
bracket — any two friends may spar. `ArenaMatchSetup.friendly` plays the full ruleset and
**never settles**: no rating, no rewards, no pass XP (and therefore nothing to win-trade);
the verdict panel says so. Quick Match (a public unranked queue) is deliberately NOT shipped —
it would split the ranked pool; the seam is one `mm:`-prefix variant away if evidence ever
wants it. Tournament/spectator hooks live on the same direct-room seam
(ONLINE-FOUNDATION.md §relay).

## §ladder — the season rating ladder

`GET /api/arena/ladder` reads the CURRENT season's `arena_ratings` top slice (the
`idx_arena_ratings_ladder` index was built for this) plus the asker's own rank; display
names ride the report body (sanitized server-side, stored on the rating row — migration
0006), tags derive from the STORED player id (unforgeable — the wave-leaderboard precedent).
The Proving Grounds ladder tab renders it fail-soft: offline/guest hives fight unlisted.

## §sweep — the bulk stability harness

`npm run arena:sweep [-- N [seed]]` (scripts/arena-match-sweep.ts) runs N full AI-vs-AI
matches of the real ruleset — the genuine `AiController` on BOTH fields, commands through
the one `applyArenaCommand` pipeline — across 6 Power brackets × 4 division tiers, asserting:
every match terminates, every terminal claim passes the SHARED `arenaClaimProblem` validator,
and the rating model moves the right direction. Writes `docs/ARENA_MATCH_REPORT.md`
(regenerate after sim/arena/AI changes; the BALANCE_REPORT.md pattern).

## §brief-coverage — the Live-PvP brief, mapped to evidence

The 2026-07 "COMPLETE LIVE PvP EXECUTION" brief is delivered across the Online Foundation
saga + the two follow-up batches. The map (each row names its living evidence):

| Brief section | Status | Evidence |
|---|---|---|
| Real-time two-player matches | ✅ | deterministic lockstep + relay (ONLINE-FOUNDATION.md §2, §relay); live dual-client probe |
| Authoritative model / client never trusted | ✅* | commands-are-intents + digest tripwires + shared validators + server-derived rating/rewards (§0, §authority) — *see conflict note below |
| Matchmaking (20s, widening brackets, honest console, invisible AI fallback) | ✅ | `matchSearchState` + the human-lane race (ArenaScreen) |
| Vertically mirrored, scrollable battlefield | ✅ | ArenaView membrane seam + ease-home camera |
| Live opponent sim ("everything visible") | ✅* | the mirror IS a genuine sim; megas excluded by RECORDED decision (§1) — *conflict note. It speaks on a private event bus (`game.isolateEvents()`, rollback rebuild included), so the opponent's kills never reach this player's save or toasts |
| HUD overhaul (health/portraits/latency/rank/timer/scroll/reset) | ✅ | ArenaView §10 set + the live RTT/quality chip |
| AI as a real player (procedural accounts, real sim, no cheating) | ✅ | core/arenaAi.ts (§9) |
| Sync: prediction/rollback/reconnect/bandwidth | ✅ | frontier mirror, log-replay rollback/reconnect, digests, bytes-per-action wire (§2–3) |
| Online security battery | ✅ | intent commands, bounds validators, exactly-once settles, provenance, netcode CI |
| Arena modes: Ranked · Private (future-ready) · hooks | ✅ | ranked queue + §private bouts; spectator/tournament seams documented |
| Rank divisions / placements / resets / leaderboard | ✅ | ARENA_DIVISIONS + §ladder |
| Arena Pass (100 lv, 30d, wins-only, 3 exclusive crowns as full content) | ✅ | core/arenaPass.ts + the exclusives |
| Power Score validation | ✅ | the engine-level Power validator batch + claim bounds + bracket gates |
| Performance / traffic | ✅ | bandwidth by architecture (commands, not state streams); FPS unchanged |
| UX loop (menu→queue→match→verdict→rewards→queue again) | ✅ | verdict panel → RETURN → console |
| Bulk testing (latency/loss/disconnect/brackets/exploits) | ✅ | netcode CI (loopback network model) + §sweep |

**Recorded-decision conflicts (user's call, not silently re-litigated):** the brief lists
Mega Bosses on the opponent field — ARENA.md §1 records `noMega` as a design decision; and
"the server simulates everything, clients become prediction layers" — ONLINE-FOUNDATION.md §0
records the deterministic-lockstep + server-progression-authority architecture instead
(SECURITY-AUDIT: "do not move gameplay simulation to the server"), which delivers the brief's
anti-cheat INTENT without a server sim.

## Known limitations

- Human matches need a reachable relay (`npm run relay`, then `VITE_ARENA_RELAY_URL` at build
  or the device-local `assimilate.relayUrl` override — ONLINE-FOUNDATION.md §relay); without
  one the AI framework carries every queue. Matchmaking pairs inside one power band per key;
  band-edge pairs fall to the AI fallback.
- The AI-only pref is device-local, so a determined player could flip it per device; the
  hardened construct (×1.25) is the deterrent, not a server-enforced lock — revisit only if
  telemetry shows opt-out farming despite the premium.
- Arena runs deliberately do NOT feed PvE ledgers (mastery XP, lifetime kill stats, loot
  meter): PvP progression is its own lane (rating/pass/exclusives) — revisit only with
  evidence it starves engagement.
- Wave composition (not difficulty) can diverge between the two sims via combat-rng
  consumption; budgets/HP curves are identical by wave index (fair in expectation).
