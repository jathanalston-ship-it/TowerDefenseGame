# REWARD-PRESENTATION.md — End-of-Run Reward Capsule

Compressed developer summary of the end-of-run reward screen (the "progression
capsule"). Prefer this over re-reading the code.

## Architecture

Two files, clean data/presentation split:

- **`src/ui/Results.tsx` — the DATA layer.** Turns the already-decided
  `RunOutcome` + `RunResult` into an ordered `RewardCategory[]` and an
  `AchievementItem[]`, then renders `<RewardReveal>`. Only rows/categories with
  data are emitted (graceful + scalable). No animation logic here.
- **`src/ui/RewardReveal.tsx` — the ENGINE.** Owns the paced reveal, animated
  numbers, player controls, and the post-sequence achievement spotlight. Pure
  presentation — rewards are applied upstream in `meta.finishRun`.

The flow: cinematic title → categories animate in **one at a time** (each
auto-expands while its numbers count up via `useCountUp`, then collapses to a
one-line summary) → after the stats **settle**, unlocked achievements
**spotlight sequentially** in a strip below the stats (never covering them) →
`Continue`. ~6s for the category sequence (`CATEGORY_MS`/`SETTLE_MS`).

## Public API

```ts
// RewardReveal.tsx
interface RewardStat { id; label; value; format?; icon?; accent?; note?; bar?; celebrate? }
interface RewardCategory { id; title; icon?; accent?; summary; stats: RewardStat[]; extra?: ReactNode }
interface AchievementItem { id; name; desc; reward? }
function RewardReveal({ title, categories, achievements, onContinue })
```

`bar` (0..1) draws a progress bar that fills as the number counts. `celebrate`
adds a pop/glow for records & unlocks. `extra` is detail shown only while a
category is expanded.

## Extension points

- **Add a reward to an existing bucket:** push a `RewardStat` (or set `extra`) in
  the relevant category in `Results.tsx`. Count-up + bar are automatic.
- **Add a new progression system:** prefer adding stats to one of the five fixed
  buckets (Combat / Progression / Resources / Bio-Containers / Discoveries) so
  the collapsed list stays short. Add a whole new `RewardCategory` only for a
  genuinely new top-level bucket. This is how it scales to dozens of systems
  without clutter.

## Important assumptions

- The five categories are **stable buckets**; new systems are rows within them.
- The floating `AchievementToaster` is suppressed off-menu (`App.tsx`), so the
  capsule owns achievement display end-to-end (spotlight + full list in
  Discoveries `extra`).
- Layout never page-scrolls: only one category is expanded at a time; the capsule
  caps at `max-height:94vh` with internal scroll as a last-resort safety only (see
  §debrief's layout contract).

## Player controls

Skip (reveal all instantly), click-anywhere to fast-forward one beat, manual
expand/collapse of any category (re-expanding replays its count-up/celebrate —
the "replay milestone" affordance), `prefers-reduced-motion` → instant.

## Known limitations / future hooks

- Discoveries surfaces achievements + new masteries today; **collection entries
  and unlocked-content** slot in as more `RewardStat`s/`extra` with no engine
  change.
- "Highest Threat" comes from `state/runDebrief.highestThreat(stats)`: a slain mega, else the
  last framework boss BY NAME (`RunStats.bossesSlain`), else the toughest roster kill. Framework
  bosses borrow the `'tyrant'` kind as a render proxy, so `killsByEnemy.tyrant` counts every boss
  — the function discounts the proxied kills (`bossKills − megaKills`) so a stage boss is never
  named "Brood Tyrant" (the 2026-11 naming bug; the `apex_slayer` copy now reads "Slay your first
  boss"). The lifetime ledger strips the proxy: `state/stats.accumulateStats` books
  `killsByEnemy.tyrant − bossKills`, so the Bio-Dex "Brood Tyrant" entry counts only real Brood
  Tyrants, and Apex Slayer reads the run's own `bossKills` (RunSummary). Flawless is
  tracked (`RunStats.integrityLost`, 0 = no Nucleus damage): the Bio-Containers category shows a
  Flawless first-clear bonus-cache verdict (earned/missed) driven by `RunOutcome.flawlessCache`. A
  standalone "Flawless" combat stat could still slot in as a `RewardStat` with no engine change.

## §debrief (2026-11) — a defeat explains itself

`RewardReveal({ banner })` renders an always-visible panel under the title (outside the paced
sequence). On a loss `Results` fills it from `state/runDebrief.defeatDebrief(result, { power,
rec, canOpen })`: **how close** ("Fell on wave 2 of 6", plus "Viral Matriarch had 23% HP left"
on a boss wave), **what got through** (top 3 Nucleus-damage sources with their share) and **one
concrete suggestion** — a genuine Power gap (< `READINESS.warnBelow`) points at the first OPEN
spend wing (Tower Lab → Evolution HQ → Hero Hall, with a "Go ▸" door; replay advice when none
is open), a boss break-through gets the boss-wave plan, otherwise the top leaker's counter is
picked by its ROLE TRAITS (flying / siege / burst / armor / summoner / fast — a data table, no
per-enemy ladder). The sim feeds it read-only ledgers (`RunStats.hiveDamageBy`, `bossesSlain`,
`bossHpAtDefeat`, `totalWaves`; booked at every integrity-damage site, never read by the sim,
goldens byte-identical). Tests: `src/state/runDebrief.test.ts`, `src/core/hiveSiege.test.ts`.

**Layout contract:** capsule children never flex-shrink (the old achievement strip collapsed
to its 4px min-height and painted over the Farm Phase card); ≥1000px wide the collapsed
categories pair into two columns (an open one spans both) so report + debrief + post-run cards
fit 1366×768 unscrolled; the post-run cards (`.rr-cliff-slot`) share an auto-fit grid (side by
side ≥230px each, else stacked — no one-word-per-line titles); the action row is sticky at the
capsule's bottom edge. Verified at 1024×768 / 1180×820 / 1366×768 / 1440×900 / 1920×1080.

## §ceremony (2026-07-17) — the physical reward moment (as built)

**Audit result:** the bus (`state/rewardToast.ts`) already announces every grant surface
(18 push points in meta — runs, pass, quests, cache, harvest, expeditions, market,
exchange, evolution, collection rank-ups, tutorial…), and the placard stack scales tiers
t0–t3 with merge folding. The missing layer was the WALLET: counters snapped silently and
nothing physically arrived. That layer is now `ui/components/CeremonyLayer.tsx` +
`WalletChip.tsx`:

- **CeremonyLayer** taps the bus (observe-only): every event fires a particle BURST at the
  claim point (the last pointer-down; tier-scaled 5/7/10 sparks) and — for types with a
  top-bar home (cores/ichor/cells/materials) — an icon FLIGHT that arcs into the chip,
  which BUMPS on arrival. Same-type flights fold within 260ms; concurrency bounded (8);
  `prefers-reduced-motion` disables the whole layer (placards still tell the story).
  Because every surface announces on the bus, every current and FUTURE reward inherits
  this with zero wiring.
- **WalletChip** rolls value changes prev→next (ease-out, ~0.6s), lifts gold while
  gaining, and carries the `data-cur` flight target. Types without a persistent chip
  (shard pools, XP, items) burst only — their placard's nav is the pointer.
- Verified headlessly on the live pass-claim path: 5 flights · 9 bursts · 5 bumps · the
  cores chip rolled 0→149. Small rewards stay instant (nothing blocks, nothing modal).

## §roulette (2026-07-17) — the signature-machine anticipation pass

Presentation-only (the model still pre-rolls everything): the orifice now CONTRACTS for
0.35s before each launch and overshoots on the eject with a wet spit cue — spores are spat,
not spawned; in the deceleration lap every pod the spore sweeps BLIPS (scale + rim flare)
with a rate-limited tick whose spacing widens as the ease-out slows — the roulette tension
read; a JACKPOT landing detonates a double gold shockwave across the organ; the tally rows
POP as counts grow (remount key carries the count). Reduced-motion still resolves to the
readable still. ~~Known gap: the roulette only mounts after a real Boss Rush~~ — CLOSED by the
game-wide spore integration (BOSS-RUSH.md §roulette): the Vault's Roulette bay spins the
banked lane, so the wheel is headlessly reachable (seed `bioSpores` → vault → spin → collect;
probe verifies bank consumption, the lifetime ledger, and the return-to-vault routing).
