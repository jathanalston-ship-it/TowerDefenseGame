# Shareable replays — codes, links, and the Replay Theater

Determinism makes "watch this exact run" nearly free: the **same record the leaderboard
verifies** (`core/replay.ts` — ctor args + step-indexed input log + end step + claim) is
the share payload. No server, no storage: the run travels inside the code itself.

## Wire format (`src/net/replayShare.ts`)

`<prefix><base64url bytes>` — `ARZ1.` = gzipped JSON (normal), `ARR1.` = plain JSON
(fallback when `CompressionStream` is missing). Decoders accept both forever; codes
outlive builds. `decodeReplayCode` applies the verifier's shape gate + the
`MAX_REPLAY_BYTES` size gate and returns `null` for anything malformed — pasted garbage
can never throw. Codes ≤ 1,800 chars ride a `?replay=<code>` link
(`replayShareUrl`); longer ones share as plain text.

## Surfaces

- **Daily screen → Replay Theater panel**: watch today's best (`save.daily.lastReplay`,
  stored with the day's best since v25), copy its share code/link, or paste any code and
  watch it.
- **Results (daily runs)**: a "Share replay" button right where the pride is freshest
  (`result.dailyReplay`).
- **Boot**: `App` reads `?replay=` once, strips the param (reloads don't re-run someone
  else's game), and opens the theater. Works for brand-new visitors — a shared link is
  a playable demo of the game.

## The viewer (`src/ui/SpectateView.tsx`)

Rebuilds the exact `Game` from the record's ctor args and drives it **incrementally with
`replayRun`'s semantics** (inputs fire at their recorded step; a frozen phase is
unblocked by the next input; hard stop at `record.end` + the same runaway guard). A rAF
loop converts wall time × speed (×1–×16, capped steps/frame) into whole `SIM_DT` steps,
renders through the normal renderer (`drawGame`; account cosmetics default — outcome
identical, dress optional), and plays the sim's own presentation cues. "⤑ Outcome"
fast-chunks to the end. The finish card compares the re-simulated outcome against the
record's claim: every shared code is **self-verifying** — VERIFIED or DIVERGED, in the
viewer, with no server involved.

## Invariants

- The viewer must never mutate account state: it constructs its own `Game` and calls
  nothing on `meta`. Watching a replay banks nothing.
- Any future Game input method must join `REPLAY_METHODS` (core/replay.ts) — the
  round-trip test fails loudly if recording misses an input path, which protects shares
  and leaderboard verification alike.
- Chrome strings live in the i18n catalogs (`spectate.*`, `daily.theater.*`).
