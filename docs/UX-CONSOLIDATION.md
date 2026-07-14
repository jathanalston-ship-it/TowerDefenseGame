# UX-CONSOLIDATION.md — the game-wide audit & coalescing record

> **Foundational release pass (2026-07).** This file records every merge/keep decision from the
> UX consolidation: which guidance surfaces were absorbed into the five Foundations, which were
> deliberately kept, and the per-screen audit verdicts (evidence: live headless screenshot sweep,
> fresh + veteran seeds). The governing rule: **the same depth, dramatically easier to understand —
> never remove information; remove owners.** One fact, one owner.

## The five Foundations

Reference docs: `docs/MISSION-CONTROL.md`, `docs/HIVE-INTEL.md`, `docs/GUIDED-UNLOCKS.md`,
`docs/EVOLUTION-ROADMAP.md`, `docs/POWER-ADVISOR.md`.

| # | Foundation | Owner surface | Owns |
|---|---|---|---|
| 1 | Mission Control | Command Center centerpiece (`.mc-campaign` + ledger) | "What should I do now?" — primary stage objective, secondary moves, AHEAD strip |
| 2 | Hive Intelligence | Command Center feed (`.cc-feed`) | Action verbs: banked value, ready Power moves, unlock proximity, milestone tail |
| 3 | Guided Unlocks | `state/guidedUnlocks` + `ui/GuidedUnlock` | First contact with every new wing (spotlight walkthrough + practice + one-time reward) |
| 4 | Evolution Roadmap | Command Center rail (`.cc-roadmap`) | The system future: every wing, ordered, with requirement/distance/Power |
| 5 | Power Advisor | `state/powerAdvisor` → Growth panel + per-wing BEST VALUE strips | "What should I buy?" — exact best value everywhere spending happens |

## Coalescing decisions — ABSORBED (one fact, one owner)

1. **Home NEXT banner (`NextGoalBanner`) → Mission Control's objective ledger.** The nextGoals
   spine renders as MC secondary rows; the standalone banner's component + CSS were removed
   after its last consumer went. One main-zone objectives owner instead of two.
2. **Raw command-feed timeline → Hive Intelligence's note tail.** The milestone list survives as
   the feed's low-priority `note` rows; the feed's ACT/SOON layers ride above it. Nothing lost;
   the bus is now derived (acting retires an entry with zero bookkeeping).
3. **COMING UP resource-goal rail → split by kind.** Resource goals (evolutions, releases) live
   in Mission Control's ledger; the Evolution Roadmap owns only the SYSTEM curve. No goal renders
   on two home surfaces.
4. **Progress dashboard's HOT/claim layer → the Feed's ACT rows.** The dashboard's "Open Now /
   Evolve / Equip" CTAs duplicated the Hive Intelligence rows rendered directly above them (two
   glowing vault affordances stacked). The dashboard is now the STANDINGS row — per-system
   momentum (stockpile, fill %, evolutions within reach, armory size, codex %) — and the Feed
   alone carries the verbs. Its unique Ascension banner stays (see KEEP).
5. **`command-feed` mount gate re-founded.** The widget's `when` still keyed off the old timeline
   model, hiding a fresh account's first ACT rows (found by the live tour probe); it now mounts
   whenever Hive Intelligence has anything to say (timeline, banked containers, or wallet).
6. **What's New "Open it now" → "Show me" + guided walkthrough.** The unlock card, the door, and
   the first-use lesson are one chain (`guideBus`); the Help wiki replays the same guides
   (`▶ Field guide`), and replays never re-pay (tutorial milestone ledger).
7. **Update Briefing → WAITING FOR YOU strip.** The returning-player what-changed card now
   bridges into the Feed's own ACT rows (banked containers, best Power move with exact +⚡) — the
   briefing says what changed, the strip says what to do, both one tap deep.
8. **HUD Tour re-founded Foundations-first.** Field Orientation's opening stops teach the four
   home instruments before the wings; widget stops drop when their element isn't mounted (the
   tour never points at nothing); a Settings replay routes home first.

## KEEP decisions — deliberate multi-surface renders (one engine, several doors)

- **`LoopDirective`** (Campaign, Infinite, Results, Profile): the macro farm↔push routing line.
  Four surfaces, ONE engine (`state/progressionLoop`) — the loop must read identically at every
  decision point, and Mission Control's power numbers derive from the same
  `recommendedPowerScore`, so the surfaces can never contradict.
- **`NextGoalCliffhanger`** (Results): the "one more run" retention beat at the quit moment.
  Spine-fed (`nextGoals[0]` — the same row Mission Control shows first), so it is a re-render,
  not a rival truth.
- **`BestBuyStrip`** (Tower Lab, Hero Hall, Evolution HQ, Gene Archive) + **Growth panel**
  (home): the same `bestPurchase` math surfaced where the question is asked. Intentional
  repetition of one answer, not two answers.
- **Ascension banner** (dashboard): Molt readiness at claim-prominence. No Foundation surface
  carries prestige readiness this loudly; unique, stays.
- **`BioCacheCard`** (home + Vault): one component, two mounts by design — the login faucet
  cracks where containers crack.
- **What's New vs Update Briefing**: mechanics vs versions. Distinct jobs; the briefing yields
  to the card queue and now shares the Feed's intel (decision 7).
- **HUD Tour vs Guided Unlocks**: orientation (once, the instruments + revealed wings) vs
  first-contact walkthrough (per wing, at unlock). Different beats; both ride the same tutorial
  primitives and the same idempotent reward ledger.
- **Foundation help rows are CORE mechanics** (browsable from minute 0, never announced): a
  What's New card for the guidance layer itself would be noise.

## Per-screen audit (evidence: headless sweep, 1280×860, fresh + stage-12 veteran seeds)

Checklist per screen: combine · simplify · dedupe · collapse · scrolling/clicks · hierarchy.

| Screen | Verdict | Notes |
|---|---|---|
| Command Center (fresh) | ✅ consolidated | MC centerpiece → feed → roadmap; no duplicate goal owners left |
| Command Center (veteran) | ✅ consolidated | Standings row no longer mirrors the feed's verbs (decision 4) |
| Campaign | ✅ keep | LoopDirective + map; difficulty lives here (MC links to it read-only) |
| Infinite | ✅ keep | CTA + prediction + LoopDirective; guide anchors `inf-start` |
| Boss Rush / Daily | ✅ keep | Mode terminals; records + stamina/seed cards are unique facts |
| Tower Lab / Hero Hall / Evolution HQ / Gene Archive | ✅ keep | BEST VALUE strip = the advisor at the point of sale; guides anchor the strip |
| Genetic Vault | ✅ keep | Crack actions + incubation + pity — all unique; guide anchors `vault-ready`/`vault-crack` |
| Armory / Gear Codex | ✅ keep | Loadouts vs collection split is clean |
| Splice Market | ✅ keep | Stock/exchange/research sections distinct; guide anchors `market-grid` |
| Quest Board | ✅ keep | Weekly directives vs story contracts; guide anchors both sections |
| The Hive / Idle Harvest / Expeditions | ✅ keep | Composite sink + away-game pair |
| Collection / Season / Phenotypes / Store | ✅ keep | Collection layers; store never guide-pushed |
| Profile / Settings / Help | ✅ keep | Help gained the five Foundation rows + guide replays |

## How to extend without regressing

- A new wing (stage ≤ 4 guarantee) **must** add a `GUIDES` row — `guidedUnlocks.test.ts` fails
  until it exists.
- A new "do this now" surface belongs in `hiveIntel` (an ACT row), not a new glowing widget.
- A new "what should I buy" surface must call `bestPurchase`/`advisorPlan`, never its own math.
- A new objective surface must render the `nextGoals` spine or Mission Control's model.
- Never leave two owners for one fact on one screen — absorb or link, don't mirror.
