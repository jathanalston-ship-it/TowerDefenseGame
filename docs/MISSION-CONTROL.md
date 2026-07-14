# MISSION-CONTROL.md — Foundation #1 of the UX consolidation pass

> **The answer to "what should I do now?" — always on the Command Center.** A player should never
> have to ask; Mission Control answers it at every moment, for a primary objective, a handful of
> secondary moves, and the long horizon. Part of the foundational release pass (see
> `docs/UX-CONSOLIDATION.md` for the whole picture and the coalescing record).

## What it is

The centerpiece of the Command Center: the Continue-Campaign deploy card (`.mc-campaign`) plus an
objective **ledger** beneath it. Three tiers, each answering *what · why · reward · how much
stronger · where*:

- **PRIMARY** — the current campaign frontier: stage, biome, recommended Power (ready ✓ / under ⚠),
  boss, first-clear reward, and the honest "remaining" line (`Ready now` · `+N Power — the Advisor
  plan covers it` · `+N Power to the recommendation`).
- **SECONDARY** — up to three near-term moves: the `nextGoals` spine (anticipation), a vault row
  when containers are banked, and the Advisor's top move (with its exact `+N⚡`).
- **LONG-TERM (AHEAD)** — the first few unrevealed FEATURES screens, in learning-curve order — a
  quiet glyph strip so the future feels exciting, not overwhelming.

## Architecture

`src/state/missionControl.ts` — a **pure** function of `SaveData`, memoized per revision at the
consumer:

```ts
missionControl(save: SaveData): { primary: MissionObjective; secondary: MissionObjective[]; longterm: MissionObjective[]; plan: AdvisorPlan }
interface MissionObjective { id; tier: 'primary'|'secondary'|'longterm'; title; why; progress; remaining; reward; powerGain?; nav; glyph? }
```

The primary is the campaign frontier (difficulty pref → cleared+1 → `recommendedPowerScore` →
ready?). Secondary maps the `nextGoals` spine + vault-pending + `advisorPlan(save).moves[0]`.
Long-term walks `FEATURES` screen rows where `!featureRevealed`, sorted by `order`, sliced to 3.

Rendered by the `MissionControl` widget in `src/ui/CommandCenter.tsx`: the deploy card, then the
`.mc-ledger` objective rows (a conic progress ring per row, `+N⚡` when a Power gain is known), then
the `.mc-horizon` AHEAD strip.

## Extension points

- A new objective source is a new branch inside `missionControl` returning a `MissionObjective` —
  no UI change (the widget renders any ledger row).
- The `nextGoals` engine (`state/nextGoal.ts`) feeds the secondary tier; add a goal there and it
  surfaces here automatically.

## Invariants

- **Pure over SaveData**, memoized — the hypothetical scoring never runs during animation frames.
- **One owner per fact.** Mission Control absorbed the old standalone NEXT banner; the Evolution
  Roadmap owns the *system* curve, Mission Control owns *resource/objective* goals — no goal
  renders on two home surfaces (`docs/UX-CONSOLIDATION.md`).
- Power numbers derive from the campaign's own `recommendedPowerScore`, so Mission Control can
  never disagree with the Campaign screen or the roadmap.

## Verification

Pinned by `src/state/missionControl.test.ts` (spine passthrough identity; advisor exact-gain
identity). The live home probe asserts the ledger renders and no rival goal owner remains.
