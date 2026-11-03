# PROGRESSION-LOOP.md — the Campaign ↔ Infinite macro-loop, enforced

> The intended experience: **Campaign advance → a gradual WALL → farm Infinite → permanent
> power → BREAKTHROUGH → repeat, forever.** This document states the math that makes the loop
> inescapable, the engine that makes it legible (`src/state/progressionLoop.ts`), and the
> invariants that keep future changes from breaking it (`progressionLoop.test.ts` — the build
> goes red if the loop's shape changes). Companions: `PREDICTION.md` (the reach model),
> `DIFFICULTY_DIRECTOR.md` (scaling policy), `MODE-IDENTITY.md` (who pays what).

---

## 1. The three curves (why the loop is structural)

| Curve | Shape | Source |
|---|---|---|
| Campaign requirement | **geometric** — `recommendedPowerScore(s)` ≈ ×1.06 per stage (doubles every ~10–12 stages) | `core/campaign.ts` |
| Reach for power | **logarithmic** — ≈ `4 + 6·log₂(1+powerMult)` stages; `5 + 9·log₂(1+powerMult)` Infinite waves | `core/predict.ts` |
| Farm income | **unbounded** — loot points, Mastery XP, Gene Essence, shards have no cap | meta settle |

Geometric requirement + logarithmic reach ⇒ **every breakthrough re-forms the wall** (each
power doubling buys ~6 more stages, then the curve pulls ahead again). Unbounded farm income
⇒ **every wall is finitely breakable**. That pair IS the loop; no timer or artificial gate
required.

## 2. Measured curves (2026-07, current content)

- Requirement: stage 11 ≈ 1.8k · stage 31 ≈ 5.7k · stage 61 ≈ 33k · stage 91 ≈ 189k Power.
- **Stage-cap ceiling** (caps unlocked at stage s, funded by uncapped farm: stars at
  `campaignStarCap`, genes at `geneLevelCapForStage`, mid-band upgrades, saturated mastery —
  conservatively WITHOUT equipment or prestige): clears the next stage with ≥ 50% slack across
  stages 1–90 (invariant 3). Equipment (rolls scale with power) and prestige raise it further.
- **Single levers saturate**: mastery alone plateaus near ~1.8k Power (below stage 31's bar) —
  farming must convert into MULTIPLE systems (stars, genes, gear, upgrades), which is the
  loop's intended texture (invariant 4).
- **The long-range ring is prestige**: `prestigeMult = 1 + c·√lifetimeCells` — unbounded, and
  each Molt's gate is CAMPAIGN depth (`prestigeStageReq` grows per molt), so the deep loop
  routes back through Campaign by construction (invariant 5).

## 3. Why neither mode can be skipped

- **Campaign is unskippable** because permanent-system CAPS gate on stage: tower stars
  (`campaignStarCap`), gene levels (`GENE_LEVEL_GATES`), hero slots (`HERO_SLOTS`), molt
  requirements. Farming raises the meters; only stages raise the caps. (Invariant 6.)
- **Infinite is unskippable** because it is the farm: loot ×1.0 vs campaign ×0.35, Mastery
  ×1.35 vs ×1.0 (`MODE_REWARDS`), and the exploit gate (`INFINITE_REWARD_QUALIFY_FRAC`) makes
  short runs pay nothing — farming happens at the frontier or not at all. (Invariant 7.)

## 4. The engine (`state/progressionLoop.ts`)

`loopState(save, difficultyId)` classifies the account from the same curves the game trusts:

- `phase` — `advance-campaign` (Power ≥ the frontier's bar) or `farm-infinite` (the wall).
- `frontierStage`, `requiredPower`, `power`, `readiness` (power/required), `powerShort`.
- `farmDepth` — the predicted Infinite frontier (where farming pays best right now).

`loopAdvice(ls)` renders the one-line routing. Surfaces (`LoopDirective` in
`ui/NextGoalBanner.tsx`): **Results** (the wall/breakthrough moment lands with the run's
outcome), **Campaign** (readiness meter above the roadmap rail), **Infinite** (why you're
farming — the experiment feeds the frontier's bar). One engine, identical copy everywhere.
Farm advice names Infinite only once it is unlocked (`ls.infiniteOpen`); before Stage
`MODE_UNLOCKS.infinite` the wall copy says "replay cleared stages" and phrases Infinite as a
goal ("opens at Stage 3"), never as an action.

### §readiness — the deploy warning is calm and honest

`readinessBand(power, rec)` → `'ready'` (≥ rec) · `'close'` (≥ `READINESS.warnBelow` × rec,
config: 0.9) · `'under'`. `deployReadiness(power, rec, stage, diff)` additionally calms an
`'under'` band to `'close'` on the stage right after a FLAWLESS clear of the previous one (a
device-local memory, `prefs.lastFlawlessClearPref`, written by `App.handleEnd` on every campaign
settle — so the calm lasts exactly one attempt). Only `'under'` warns, and the copy is
outcome-first: the home CTA reads **"Fight anyway — recommended Power not met"**, the Campaign
map flags the fact row, the deploy briefing carries one calm line, and `LoopDirective` shows a
PUSH phase ("within reach") instead of a wall. `phase` itself stays the strict ≥ 1 split — the
invariants and the progression simulator are untouched; the band is presentation only.

## 5. What is deliberately NOT pinned here — the time axis

How LONG each wall takes (hours per breakthrough band) is an income-rate question, not a
structural one. That belongs to the **progression simulator** (`src/dev/progressionSim.ts`,
virtual accounts over the real settle layer) — its hour-band report is generated to
`docs/PROGRESSION_REPORT.md` (`npm run sim:progression`) and is the only sanctioned input
for weighting the `DIRECTOR_ADAPTIVE` / `ECONOMY_ADAPTIVE` seams or touching pacing
constants (the change protocol in `BALANCE_ARCHITECTURE.md` §4).

## 6. Player-experience contract (the checklist the invariants encode)

- Early Campaign success ✓ (stage 1 open on a fresh account — invariant 8)
- A gradual wall ✓ (geometric bar, logarithmic reach — invariants 1–2)
- Infinite farming with real payoff ✓ (farm identity — invariant 7)
- Campaign breakthrough, then a NEW wall ✓ (curve shapes — invariants 1–3)
- Never permanently stuck / never impossible ✓ (ceiling co-movement + unbounded prestige — 3, 5)
- Never resistance-free ✓ (every band multiplies the bar — invariant 1)
