# PROGRESSION-GATING.md — the reveal framework (how the game teaches itself)

> **The objective is not more systems — it is pacing the ones we have.** Nearly every major
> system exists; this framework decides WHEN each one reveals itself, WHY (every gate carries a
> written justification), HOW the reveal is presented, and HOW we prove the pacing never rots.
> Progression itself is the reward: a fresh account sees FOUR nav entries; dozens of hours later
> it has watched the game grow into all twenty.

The generated timeline lives in **docs/UNLOCK-TREE.md** (`npm run unlocks`). The enforcement
suite is `src/state/unlocks.test.ts` + `src/state/progressionDirector.test.ts` + the persona
timeline test in `src/dev/progressionSim.test.ts`.

---

## 1 · Philosophy — one learnable beat at a time

- **Foundational at minute 0**: Home, Campaign, Help, Settings. The first minutes ARE the
  campaign — towers, the hero, gene drafts and the wave rhythm all happen IN-RUN from run 1
  (taught by the Combat Tutorial), so the hub starts nearly empty and calm.
- **Reveal with purpose**: every screen opens when it has something real to do — the Vault
  when the first Bio-Container banks, the Tower Lab with the first Strain Samples. Past that
  core block every wing is a pure STAGE gate (§timeline): drops that arrive before their wing
  (gear, modifiers, Antigen, specimens, Ichor, Essence) **bank silently** and are waiting at the
  reveal (docs/ECONOMY.md §player-facing). *Economy coherence*: a currency chip never precedes
  its sink; a screen never opens onto emptiness.
- **At most two related reveals per beat**, each building on the last ("I understand this —
  now here's something new"). The worst-case walk (zero drop luck) still reveals ≥1 new screen
  every stage from 1–7, never more than 3 in one stage, and never more than 2 past stage 3 —
  all machine-enforced.
- **Anticipation, not absence**: the nav lists revealed screens **plus the next two upcoming
  reveals as locked teasers** with live progress; deeper wings stay hidden entirely. Clicking a
  teaser opens its **unlock briefing** (`FeatureLocked` — the generalized ModeLocked): the gate,
  a progress bar, and a route to the Campaign. This extends docs/MODE-IDENTITY.md §gates: modes
  stay visible-for-anticipation exactly while they are *next*.
- **Monetization last among the mid-game** (Premium Store at Stage 8): the game proves itself
  before it asks (docs/PREMIUM-STORE.md).

## 2 · The framework — one registry, four consumers

`src/state/unlocks.ts` — **FEATURES**: one row per hub screen (all 20 NavKeys) + gated wallet
chips (`cur:ichor`, `cur:mats`, `cur:cells`). Each row: declarative `condition`, learning-curve
`order`, teaser `blurb`, `teach` link, and a written `because`.

**Conditions are data, not closures** (`always | runs | stage | cores | gear | containers |
cards | mulligans | ichor | mats | molted | rushHistory | dailyHistory | any`), so the UI renders
live progress ("Clear Campaign Stage 4 · 2 to go"), the persona simulator replays the whole
timeline, and tests prove pacing. Resource conditions fire on the economy's first delivery;
`any(resource, stage N)` backstops guarantee **no player can be luck-locked** — every screen is
guaranteed by `REVEAL_CEILING_STAGE` (30, enforced).

Consumers:
1. **Hub** (`src/ui/Hub.tsx`) — nav filtering + teasers + `FeatureLocked` briefings + wallet
   chips; empty nav groups stay silent. `meta.latchNewReveals()` runs on every save change.
2. **What's New** (`src/ui/WhatsNew.tsx` ← `src/state/mechanics.ts`) — the reveal ceremony:
   screen-linked mechanics rows delegate their unlock predicate to `featureRevealed(...)`, so
   the announcement card (what/why/where/next), the **unlock fanfare** (`audio.cue('unlock')`),
   and the **"Open it now ▸"** CTA (via `src/state/navBus.ts`) fire exactly when the nav entry
   appears. Never a silent unlock — enforced by the teach-coverage tests.
3. **Next-Goal engine** (`src/state/nextGoal.ts`) — the `reveal` goal kind surfaces the next
   locked feature as a chaseable objective on Home and the Campaign rail.
4. **HUD Tour** (`src/ui/HudTour.tsx`) — stops filter to revealed navs: a fresh account gets a
   short, focused orientation; each hidden wing introduces itself later via its own card.
   The Command Center's widget board rides the same reveals (`src/ui/homeModel.ts` `when`).

## 3 · Reveals LATCH — and veterans grandfather

`save.director.revealed[featureId] = totalRuns at reveal` (written by `meta.latchNewReveals`).
Once revealed, always revealed — salvaging your last gear or opening your last container never
re-seals a screen. Conditions are pure over SaveData, so an existing account's history reveals
everything it already earned on first load (plus explicit `rushHistory`/`dailyHistory`
grandfather clauses). The stamp doubles as pacing analytics.

## 4 · The Progression Director

`src/state/progressionDirector.ts` (reads) + `meta.noteNavVisit` (writes `director.visits`):
- **Exposure**: `revealAge`, `ignoredReveals` — revealed ≥3 runs ago, never opened
  ("feature abandonment").
- **Advice**: `directorAdvice` — visit-what-you-have first, then chase-what-is-next; small by
  design (guidance, never a quest log). Future systems (adaptive hints, session summaries,
  re-engagement nudges) consume these queries instead of re-deriving.
- **Cognitive load**: `loadEstimate` — screens/currencies/mechanics + band
  (`calm ≤6 · learning ≤13 · full`). A fresh account must sit in `calm` (enforced); the live
  readout ships in the debug panel.

## 5 · Validation — what CI proves

- **Coverage**: the FEATURES screen set equals Hub's `NavKey` union, parsed from source — a new
  screen FAILS CI until it declares its place on the learning curve. That is the
  future-proofing contract: *one FeatureDef row (+ one mechanics row) is the entire
  integration*.
- **Never blocked**: every feature guaranteed by `REVEAL_CEILING_STAGE` (30); a stage-30 save reveals everything.
- **Pacing**: fresh = exactly 4 screens + 2 teasers + Cores-only wallet, `calm` band; no reveal
  desert (stages 1–8) and no overload beat (>3/stage) on the worst-case walk; teaser order
  never contradicts the guaranteed timeline.
- **Teach coverage**: every gated screen names a mechanics row on its own nav with full
  what/why/where/next; non-core rows announce **exactly** when the screen reveals.
- **Economy coherence**: Ichor implies the Market; Cells tease one stage before Prestige.
- **Archetype timelines**: persona traces (fresh + efficient) replayed through the registry —
  the reveal curve is alive for slow and optimal players alike.
- **Presentation**: mobilecheck audits the minute-0 hub (`hub-fresh`) AND a seeded developed
  profile so every screen still passes the responsive gate at every viewport class.

## §timeline · The re-paced reveal timeline (2026-11)

The pre-2026-11 timeline opened all 34 surfaces by Campaign Stage 9 — roughly the first hour.
They now spread across the first **~8 h (frictionless bot) / ~20 h (Fresh Account persona)**
(stage → hours from `simulateAccount`, 4 seeds × 40h; calibration table in
`scripts/gen-unlocks.ts`, rendered into UNLOCK-TREE.md's "≈ Play time" column):

| Stages | ≈ Play time (bot · fresh) | Reveals |
|---|---|---|
| 0–3 | first ~10–20 min | Home · Campaign · Help · Store · Settings · Profile · Tower Lab · Vault · Evolution HQ · Hero Hall · Infinite (the core) |
| 4–8 | 15–55 min | Gene Archive + Materials chip (4) · Daily (5) · Armory (6) · Quest Board (7) · Splice Market + Ichor (8) |
| 10–18 | 45 min–2 h | Season Pass (10) · Boss Rush (12) · Bio-Dex (13) · The Hive (14) · Gear Codex tab (15) · Hive Production tab (16) · Expeditions tab (18) |
| 20–30 | 2 h–8 h · 3 h–22 h | The Front (20) · Milestones tab (22) · Adaptation + Cells backstop (24) · Mulligan Lab (25) · Phenotype Lab (26) · Specimen Vault tab (27) · Proving Grounds (28) · Auction House (30) |

`REVEAL_CEILING_STAGE = 30` (unlocks.ts) bounds the guarantee; `MODE_UNLOCKS.bossRush` moved
9 → 12 with it. **Existing saves keep everything they were shown**: reveals LATCH
(`director.revealed`, §3), so a save that opened a wing under the old gates keeps it, and
`isBossRushUnlocked` honours a latched Boss Rush reveal too. Tests: `unlocks.test.ts`
(≤2-per-beat past the core, no luck-reveal past the core, the first-hour seal, the re-pace
grandfather, a stage-30 veteran has everything).

## §announcements · The first hour, one beat at a time (2026-11)

Screens were already paced (§timeline), but the **mechanics** announcements (What's New) had no
budget: a fresh account's first run unlocked 11 at once — one "11 new systems unlocked" summary
(measured: `simulateAccount` + the tutorial step, Fresh Account persona, matching the first-session
probe). Three rules now apply (`state/mechanics.ts`, `state/fieldNotes.ts`, `meta.whatsNew`):

1. **The seal rule.** A mechanic whose `nav` names a gated screen never unlocks — in the Help wiki or
   What's New — before that screen reveals (`isMechanicUnlocked`). It closed two leaks: the Nucleus row
   announced the stage-25 Mulligan Lab from minute 0, Gene Essence the stage-4 Gene Archive after run 1.
   It binds every ADVICE surface too (2026-11-06): the Power Atlas (Growth panel BEST MOVE) and the Power
   Advisor (Mission Control, Hive Intel) rank moves only on wings `isOpenNav` admits, and
   `meta.spendAdaptation` refuses while the Adaptation Chamber is sealed — a one-tap best move had spent
   banked Antigen before stage 24 (owner report).
2. **Pacing.** `meta.whatsNew()` hands at most `ANNOUNCE.perBeat` = **2** cards per BEAT (a finished
   run); a revealed screen's own lesson (`FEATURES.teach`) leads, then registry order. The beat is
   session memory (no save field — a reload opens a fresh beat). Nothing is hidden: a queued mechanic
   is already in the Help wiki; only its announcement waits.
3. **In-run controls teach in the run** — the field notes (docs/GUIDED-UNLOCKS.md §field-notes) — and
   never queue in the hub. Two lazy gates moved to their real moment: the map-layout lesson after the
   first NEW layout is played (stage 2's pin), the Threat ladder with the first replay pillar
   (Infinite, stage 3).

Measured, Fresh Account + tutorial (`firstHour.test.ts` pins the shape):

| | before | after |
|---|---|---|
| Cards after run 1 | 11 (one summary) | 2 (Tower Lab briefing + the daily cache) |
| Max cards in one beat | 11 | 2 |
| Queue | everything at once | peaks at ~8 waiting, drained by ~2 h |
| Screen briefings | Tower Lab / Hero Hall / Infinite never (core lessons) | every screen, on the run it opens |

## 6 · Existing gates, re-evaluated (what changed and what deliberately didn't)

- **Re-paced 2026-11** (§timeline): Boss Rush S9 → S12, every deep wing moved to stages 10–30.
- **Kept** (already proven): Infinite S3 · Daily S5 (`MODE_UNLOCKS`), Deep
  Strain S15, hero slots S25/S90, gene-level gates, adaptation gates, tower-trio unlock,
  prestige S10. The registry *wraps* these — numbers still live in `core/config.ts`.
- **New screen gates** (previously all visible at minute 0): profile, vault, towers, evolution,
  heroes, market, genes, equipment, collection, gearcodex, mulligans, phenotypes, store — see
  UNLOCK-TREE.md for each row's justification.
- **Currency chips gated**: Ichor / Materials / Cells appear with their purpose.
- **Deliberately untouched**: currency COSTS and progression curves — cost tuning belongs to
  the simulator protocol (docs/BALANCE_ARCHITECTURE.md §4), not to this pass.

## 7 · Adding a future system (the whole checklist)

1. Add the screen to Hub's `NavKey` + nav group (as before).
2. Add ONE `FeatureDef` row in `src/state/unlocks.ts` — condition, order, blurb, `because`,
   `teach`.
3. Add/point ONE mechanics row (`src/state/mechanics.ts`) with `nav` = the new key and
   `unlock: (s) => featureRevealed(s, '<key>')`.
4. `npm run unlocks` (regenerate the tree).
Tests enforce the rest: coverage, backstop, pacing, teach copy, announcement sync, responsive
fit. The learning curve absorbs the system with zero bespoke wiring.
