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
  caps at `max-height:94vh` with internal scroll as a last-resort safety only.

## Player controls

Skip (reveal all instantly), click-anywhere to fast-forward one beat, manual
expand/collapse of any category (re-expanding replays its count-up/celebrate —
the "replay milestone" affordance), `prefers-reduced-motion` → instant.

## Known limitations / future hooks

- Discoveries surfaces achievements + new masteries today; **collection entries
  and unlocked-content** slot in as more `RewardStat`s/`extra` with no engine
  change.
- "Highest Threat" is derived from `killsByEnemy` (toughest enemy felled);
  "Flawless" awaits an integrity-lost stat in `RunStats`.
