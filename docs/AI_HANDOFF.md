# AI_HANDOFF.md — live session context (overwrite each session)

> The incoming session reads this FIRST. Keep it short, factual, current.

## Where we are (2026-07-12)

Branch `claude/zen-hawking-rh1gxl` (the only push target — standing user rule). All green at
HEAD: typecheck, 1960 tests, build, mobilecheck CLEAN, validate PASS.

## Landed this session (all pushed)

1. **Catalog expansion** — tower Mulligan pieces 51→102 (`CATALOG_PER_TOWER = 6`), Nucleus
   organs 18→30 (5/class), Symbiote species 36→54 (3/cell). Acquisition audited: every entry
   registry-drawn (containers/essence/graft) — zero loot wiring.
2. **Monetization expansion** — Season Pass pair (`bp_premium_first` $4.99 first-ever purchase,
   limit 1; `bp_premium` $9.99 after; one door via `seasonOfferFor`), 4 one-time milestone
   FLASH sales with the timing engine in `state/flashOffers.ts` (48h first-sight windows, one
   popup/72h, stage-3+5-runs floor), save v42 `premium.flash`, store sections + Hub popup +
   pass-screen door. Honesty rules validator-enforced (listUsd ≤ real worth, ×1.4–3.0).
3. **Fix: conveyor ready-state screen shift** — root cause was the UNDEFINED `--fs-2xs/--fs-xs`
   tokens (fell back to 16px); now defined at :root (10/11px) + grow bar matches the action row
   (24/32px) + `.cv-actions` contributes zero intrinsic width. Live-probed box-identical.
4. **Fix: undismissable Tower Lab NEW badge** — chip now means "upgraded since last LOOKED"
   (labPrefs.recentsSeen); inspecting dismisses.
5. **Daily Bio-Cache** — badge moved home→vault channel (home self-cleared on landing);
   BioCacheCard now also renders in the Genetic Vault.
6. **Quest Board** — "N to claim" title chip, ready-row gold chrome + pulse, claim erupts
   reward chips over a shock ring from the click point (reduced-motion safe).
7. **Gore-chunk flight overhaul** — chunks never fade mid-flight (failsafe lives), destinations
   moved on-screen, arrival = orbit/coalesce → consume flash → debounced "+N" value floats
   (real bounty for biomass; ◈units for assimilation). 22s live-combat probe clean.
8. **Best-Purchase advisor (MAJOR)** — `state/bestPurchase.ts` diffs the REAL pure scorer per
   hypothetical purchase; `BestBuyStrip` mounted on Gene Archive / Evolution HQ / Tower Lab.

## Next up (user-queued, tasks #287/#288)

Full visual overhauls, in the user's words: (a) Bio-Container opening animation/process,
(b) end-of-run reward summary, (c) the Vault screen itself. Substantial standalone redesigns —
start from docs/LOOTBOX.md + ui/VaultReveal.tsx / Results.tsx / GeneticVault.tsx.

## Watchouts

- Push ONLY to `claude/zen-hawking-rh1gxl`; rebase (never force) on rejection.
- `meta.offerPurchasable` polls the pass window (persists) — never call it during render.
- The `--fs-*` type tokens now EXIST; author new micro-labels against them.
- Flash SKU rows must stay in core/premium.ts (functions/ prices checkout from it); timing
  logic stays in state/flashOffers.ts (core/ may not import save/).
