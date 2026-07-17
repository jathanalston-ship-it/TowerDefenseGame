# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-17 13:58 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** b78bb01

## Summary of work completed

The MARKET LIQUIDITY ENGINE shipped (AUCTION-HOUSE.md §5b): the invisible Market Authority
now has a BUY side — it may purchase a stale, fairly-priced FOUNDATIONAL player listing so
the market keeps transacting when demand is thin. Pure planner (`planBuybacks` +
`BUYBACK` tunables in core/marketAuthority.ts), host execution in the exactly-once window
tick (`runBuybacks`), the sim drives the identical planner in all 10 scenarios. The one
thing to know: buybacks are STRUCTURALLY unfarmable — sink-funded budget (≤ 50% of the
prior window's burns), crypto-rng + accept roll (never guaranteed), hard caps per
window/family/seller, valuation corridor ×0.2–×1.05 of the player-only estimate, flagged
sellers invisible, and buyback trades (authority = 2) NEVER feed price history or demand
metrics. The closed-supply conservation identity gained one explicit term:
`held + burned + withdrawn = deposited + Σ price(authority=2)`.

## Files modified

- Source (1): `src/changelog/releases.gen.ts`
- Tests (0): —
- Docs (2): `docs/HISTORY.md`, `docs/devlog/DRAFT-2026-07-17.md`

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts`

## Power Score changes

None — no Power-relevant system touched.

## UI changes

Surfaces in the blast radius: `App (UpdateBriefing popup)`

Nothing player-visible changes except outcomes: a stale fair listing occasionally sells
(the seller sees a normal sale + proceeds placard). No new UI. Verified through the FakeD1
e2e layer (40-window drives) and the 10-scenario sim, not a browser probe (server-side
behavior only).

## Documentation changes

Registry says these move with the touched systems: `docs/CHANGELOG-PIPELINE.md`

AUCTION-HOUSE.md (§5b new, §9 scan widened to authority IN (0,2), §11 + §12 updated);
GAME-STATE.md auction summary addendum; DIL row + regen. CHANGELOG-PIPELINE.md — no change
needed (notes ran).

## Save changes

None — save layer untouched.

## Known edge cases

- The FakeD1 testkit maps trade-INSERT args POSITIONALLY — never put SQL literals in a
  column position (the buyback INSERT uses the canonical 9-bind shape for this reason).
- Buyback settle-gates require `bid IS NULL` — a racing player bid must always win; do not
  "simplify" that condition away.
- The sim's liquidity engine uses its OWN rng stream (w.buyRng): consuming the agent stream
  shifts every scenario's chaotic path and breaks the tuned expectEngaged baselines.
- planBuybacks acceptChance means e2e tests must drive ~40 windows for determinism-in-
  practice (miss ≈ 0.45^40); don't write a single-window "it bought" assertion.
- `busyFade`/`velocityFade` are per-WINDOW (server hour / sim day) — deliberate.

## Remaining technical debt

None new. Observed: alt-account/wash detection remains heuristic by architecture (bounded
economically, documented in §12) — real identity graphs would need infrastructure the
browser-local-save product decision rules out.

## Recommended next tasks

1. Watch live telemetry once deployed: buyback rate vs player trade (the §5b dominance
   contract) — `SELECT COUNT(*) FROM market_trades WHERE authority = 2`.
2. Populate AUTHORITY_ELIGIBLE_OVERRIDES (marketCatalog.ts) as design decides specific
   families need liquidity support.
3. Standing user-decision flags unchanged (arena noMega; server-side sim).

## Future expansion hooks

- `AUTHORITY_ELIGIBLE_OVERRIDES` (core/marketCatalog.ts) — the hand-curated band-widening
  hook ("Authority Eligible" items), empty by design.
- `BuybackCandidate.authorityEligible` + `BUYBACK` tunables — every lever the engine has,
  in one const.
- `SellerBuybackRecord` — the seller-history seam a future trust-score system extends.
