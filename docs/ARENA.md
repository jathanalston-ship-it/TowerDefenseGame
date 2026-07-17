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

## Known limitations

- Human matches need a reachable relay (`npm run relay` + `VITE_ARENA_RELAY_URL` at build —
  ONLINE-FOUNDATION.md §relay); without one the AI framework carries every queue. Matchmaking
  pairs inside one power band per key; band-edge pairs fall to the AI fallback.
- Arena runs deliberately do NOT feed PvE ledgers (mastery XP, lifetime kill stats, loot
  meter): PvP progression is its own lane (rating/pass/exclusives) — revisit only with
  evidence it starves engagement.
- Wave composition (not difficulty) can diverge between the two sims via combat-rng
  consumption; budgets/HP curves are identical by wave index (fair in expectation).
