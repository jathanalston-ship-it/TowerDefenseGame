# POWER-ADVISOR.md — Foundation #5 of the UX consolidation pass

> **The answer to "what should I buy?" — exact, ranked, everywhere spending happens.** Power Score
> is the universal language of getting stronger; the Advisor turns it into a ranked list of your
> best next moves. Part of the foundational release pass (`docs/UX-CONSOLIDATION.md`).

## What it is

- A **Growth panel** on the Command Center (`ui/components/GrowthPanel.tsx`) — your best affordable
  Power moves across every system, ranked by exact gain, each with a one-tap buy.
- A **BEST VALUE strip** (`ui/components/BestBuyStrip.tsx`) atop every many-options spend screen
  (Tower Lab, Hero Hall, Evolution HQ, Gene Archive) — the single best affordable pick, plus the
  "save up" tease when the overall champion is out of wallet range.

## Architecture

`src/state/powerAdvisor.ts` — pure over `SaveData`:

```ts
advisorPlan(save: SaveData, k = 5): AdvisorPlan
interface AdvisorMove { label; system; nav; price; powerDelta; affordable; action: AtlasAction }
interface AdvisorPlan { moves; saveUp: AdvisorMove | null; totalGain; estMinutes }
```

`moves` are affordable, sorted by `powerDelta` desc. Built from the exact per-system advisors —
`bestPurchase` ranked lists over four surfaces (towers/heroes/evolution/genes), `adaptationPicks`
(Antigen), `equipUpgrades` (free gear swaps) — each carrying an executable `AtlasAction`
(`{purchase|adapt|equip}`). The strip's own quick-buy routes through `executePurchase`, the same
guarded meta action the screen's button calls, so it self-advances to the next pick after a buy.

The **diff is against the REAL Power scorer** per candidate — no heuristics. Memoized per save
revision at every consumer, so the hypothetical scoring never runs during animation frames.

## Reuse across the Foundations

The Advisor's top move surfaces as a Mission Control secondary objective and a Hive Intelligence
ACT row (both with the exact `+N⚡`). Power Score is the shared unit — one number, one owner, many
doors.

## Invariants

- **Exact, never vague.** Every move carries a real `powerDelta` from the scorer.
- A broke account yields `moves: []`, `totalGain: 0`, and a non-null `saveUp` (unaffordable).
- Deterministic — JSON-stable across calls for a fixed save (pinned).

## Verification

`src/state/powerAdvisor.test.ts` (funded → ranked affordable executable plan; broke → empty +
saveUp; k-respect + JSON determinism).
