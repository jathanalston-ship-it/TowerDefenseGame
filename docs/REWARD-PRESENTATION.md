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
interface RewardStat { id; label; value; format?; icon?; accent?; note?; bar?; celebrate?; cue?; from? }
interface RewardCategory { id; title; icon?; accent?; summary; stats: RewardStat[]; extra?: ReactNode }
interface AchievementItem { id; name; desc; reward? }
function RewardReveal({ title, banner?, categories, achievements, onContinue, cliffhanger?,
                        onReplay?, replayLabel?, next?: { label, onClick } })
```

`bar` (0..1) draws a progress bar that fills as the number counts. `celebrate`
adds a pop/glow for records & unlocks. `extra` is detail shown only while a
category is expanded. `from` is the honest starting point of the count-up (the
previous level / Power / vault count — default 0, so gains still count from 0);
`cue` is an `audio.cue` tag that sounds as the row lands (§audio).

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

## §audio (2026-11) — the reveal has a voice

The capsule unseals with the `chest` lid thunk (which also re-roots the climbing pluck), then
EVERY category that lands plucks the climbing `reveal` cue once; a stat's own `cue` trails its
category by `STAT_CUE_MS` (260ms) — the Account Level row carries `cue: 'levelup'`, so the
level-up sounds when its row appears (it used to fire as the panel opened, ~1.3s early). A skip
or reduced motion lands the remainder as ONE beat (one pluck, each distinct stat cue once).
`RewardReveal({ paused })` holds the whole sequence — pacing AND audio — while a milestone
cinematic (Hero Slot / Evolution Unlock, App.tsx) is over Results, so the capsule plays from its
first beat once the cinematic is dismissed instead of plucking unseen beneath it.
Honest counts: Account Level counts from the level you had (`LV 1 → 1…5`, not `0…5`), Power
from the pre-settle snapshot (App takes `meta.power().score` just before `finishRun` →
`Results({ powerBefore })`), Now in Vault from `owned − earned`.

## §next (2026-11) — a win pushes forward

On a Campaign WIN with Stage N+1 open on that difficulty, the action row reads
**`↻ Replay` · `Stage N+1 ▸` (primary) · `Continue`**. `Stage N+1 ▸` runs `App.startNextStage`
— the Campaign map Deploy path (campaign difficulty pref, `notePredictionBaseline`, the
boon, `begin()`'s deploy briefing incl. the readiness warning; the armed doctrine carries).
When Stage N+1 has a Mutation event with a boon choice, Results shows it right above the row
(**Stage N+1 boon**, the first option pre-selected — the same pick the Campaign panel offers;
`RewardReveal next.choices`), and the pick rides `Stage N+1 ▸`. Losses read `↻ Try again` beside the primary Continue; every other mode
keeps `↻ Infect Again`. Continue is the primary while the sequence plays and steps down to a
plain button the moment `Stage N+1 ▸` appears; it always stays LAST (the hub door — the first-session probe
clicks the last continue). The forward/replay buttons appear once the sequence settles.

## §backdrop (2026-11) — Results sits on the board

`Results({ backdrop })` paints the run's last frame behind the capsule instead of a black void
(docs/SIGNATURE-MOMENTS.md §2): `ui/components/RunBackdrop.tsx` lays the board back exactly where
it stood (contain-fitted if the viewport changed shape) blurred 8 px at 40 % brightness over a
heavily-blurred cover fill of the same image (index.css §S2 `--rb-*`). The image is one small JPEG
data URL from `render/runOutro.ts capture()`, carried by `GameView.onEnd(result, backdrop)` into
App's last-run state and dropped when the screen leaves Results. With a backdrop the screen itself
no longer fades in (the board is already there) — only the capsule does — and the sticky action
row's readability band is feathered at its sides so it never reads as a slab. Absent (replay
theater, Arena, tutorial, crash path) ⇒ the dark room as before. Every behaviour above — Stage
N+1 ▸ + boon, the top-anchored capsule, the pause under milestone cinematics, Skip — is
unchanged; text keeps ≥ 4.5:1 over the backdrop (measured per text node, see the S2 report).

## Player controls

Skip (reveal all instantly), click-anywhere to fast-forward one beat, manual
expand/collapse of any category (re-expanding replays its count-up/celebrate —
the "replay milestone" affordance), `prefers-reduced-motion` → instant.

## Known limitations / future hooks

- Discoveries surfaces achievements + new masteries today; **collection entries
  and unlocked-content** slot in as more `RewardStat`s/`extra` with no engine
  change.
- "Toughest Kill" (the Combat Report line) comes from `state/runDebrief.highestThreat(stats)`: a slain mega, else the
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

**Layout contract:** the screen is TOP-anchored (`.menu` is a column flex — `justify-content:
flex-start`), so expanding/collapsing a category grows the capsule downward and the verdict
title never moves (it bounced 15–25px per beat when centred); the capsule takes exactly
`100dvh − padding`, so its sticky action row rests on the viewport's bottom edge and the page
never scrolls; `.results-screen` clips its −6% after-battle haze (a phone's layout viewport
used to widen to ~410px). Capsule children never flex-shrink (the old achievement strip collapsed
to its 4px min-height and painted over the Farm Phase card); ≥1000px wide the collapsed
categories pair into two columns (an open one spans both) so report + debrief + post-run cards
fit 1366×768 unscrolled (390×844 portrait: the run-flow hold keeps the rotate gate off Results —
docs/RESPONSIVE-DESIGN.md §run — and the action row wraps/stretches ≤480px); the post-run cards (`.rr-cliff-slot`) share an auto-fit grid (side by
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
