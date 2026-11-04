# EARLY-CALL.md — calling the next wave mid-fight

> **Canonical doc** for the Early Call input (Batch G "the grind", track GR1). Code:
> `src/core/game.ts` (`earlyCallBonus` / `callWaveEarly` / the owed-draft queue), tunables
> `EARLY_CALL` in `src/core/config.ts`, HUD in `src/ui/GameView.tsx` (run-controls strip + Space).
> Tests: `src/core/grindLevers.test.ts` (EARLY CALL block).

## Why

The grind audit (G1, ~560 headless Campaign runs) measured the **idle share of wave time** at
24 % (0.75 h account) → 53 % (8 h) → 63 % (100 h): a strong board kills a wave as fast as it
spawns, then waits for the schedule to run out. Early Call turns that dead time into a decision —
*tempo vs. safety* — and pays for it.

## The rule

- **When:** during a wave (`phase === 'wave'`, not in the settle beat), at least
  `EARLY_CALL.minElapsed` (3 s) after the latest launch — so a double-tapped Start/Space can never
  stack waves — and never on the final scripted wave or the Daily Mega (no next wave).
- **What happens:** the next wave launches **over the live field**. The called-over wave's
  unspawned tail keeps its schedule; the new wave's queue merges in by time (stable sort). Boss
  Rush's pending boss column is carried the same way.
- **Stack cap:** at most `EARLY_CALL.maxAhead` (2) calls before the field clears (⇒ ≤ 3 waves overlap).
- **The bonus:** the *skipped wait* — the field's last scheduled spawn + `clearAllowance` (8 s)
  minus now, capped at `maxSkipSeconds` (30) — × `biomassPerSecond` (2) × the **next** wave's
  bounty multiplier × the run's Biomass multiplier. The HUD shows it live (`HudSnapshot.earlyCall`,
  −1 = unavailable) and it shrinks as the current wave runs out. Paid up front, cued (`splice`).
- **Nothing owed is lost:** every called-over wave still earns its **gene draft** — owed drafts
  (`draftsOwed`) are dealt back to back when the field clears (endless cadence respected via
  `shouldDraftThisWave`), and **Regenerative Carapace** ticks at the call.

## Scope (opt-in per run — golden-safe)

`RunOptions.earlyCall` (default **false**). `GameView` passes `!tutorial`, so it is live in
Campaign, Infinite, Boss Rush, Skirmish and the Daily. The **tutorial** never gets it (and
`tutorialMode` refuses it in the sim too); the **Arena** boots its own games and
`arenaMatch.bootGame` forces it off even for a forged bundle. The golden autoplay never calls.

## Replays

`callWaveEarly` is a **recorded input** (`core/replay.ts REPLAY_METHODS`), so a Daily replay
with early calls re-simulates exactly (pinned in `grindLevers.test.ts`). Older records (no
`earlyCall` option, no calls in the log) replay unchanged.

## Auto Wave

Auto Wave **never calls early** — it only launches from the build phase after its countdown.
The risk of stacking waves is always the player's decision (Hive Intelligence doesn't call either).

## HUD

`⏩ Call early +N` — the Start Wave control's in-fight form, in the run-controls strip (left of
the speed / Hive / Pause cluster, so its arrival never shifts them; the label collapses to
`⏩ +N` on narrow boards). **Space** calls early mid-wave and starts the wave in prep.

## Measured (the G1 harness — the same 16 replay/frontier runs per account, with vs without a bot
that calls whenever ≤ 2 enemies are alive and the wave hasn't cost integrity)

| account | calls / run | median winning wave-seconds | idle share | wins | flawless wins |
|---|---|---|---|---|---|
| 8 h (S29) | 0 → 5.3 | 424 → 371 (−12 %) | 0.65 → 0.66 | 10 → 7 of 16 | 8/10 → 4/7 |
| 100 h (S80) | 0 → 7.0 | 1305 → 890 (−32 %) | 0.84 → 0.79 | 12 → 10 of 16 | 8/12 → 9/10 |

It does what it should: real tempo (a third of the wave time at 100 h) for real risk (the eager bot
lost more runs — a human picks safer moments).

## Known limitations

- The credit is time-based, not threat-based: calling over a wave whose tail is a boss pays the
  same per second as chaff. The stack cap + the overlap risk are the counterweight.
- `waveCompleted` events (tutorial-only listener) fire once per field clear, not per called-over wave.
