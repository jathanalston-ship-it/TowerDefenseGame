# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-18 08:34 UTC · **Diff scope:** batch commit 8376a53 + rituals
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 8376a53

## Summary of work completed

Auction House batch (#351): **mulliganPiece is the fourth tradable category** —
`mul:<pieceId>` trades the dex UNLOCK through the full spine (itemIdentity refKeys →
trading `slotted` block → marketCatalog `mul.<piece>.<rarity>` families → authority
common/uncommon bands → meta custody: sellables/escrow-out/deliver-with-Tissue-dissolve/
reconcile → auctionHost authority grants → UI chips). The screen also got its **visual
overhaul**: mastheaded exchange floor, `--rc` rarity-washed specimen cards with category
glyphs (⌬ ⛨ ❖ ⊛), segmented pill tabs, membrane wallet, tinted sheets, boxed My-Market
sections — verified live at desktop + landscape-phone. The one thing to know: **an owned
piece delivered from the market dissolves to Tissue via `DUP_TISSUE` (core/mulligan.ts,
now exported)** — the pillar's duplicate law, shared with container opens; never grant a
second copy.

## Files modified

- Source (17): core/{itemIdentity,trading,mulligan,marketCatalog,marketAuthority}.ts,
  save/saveStore.ts, state/{meta,auctionHouse,unlocks}.ts, ui/AuctionHouse.tsx, index.css,
  functions/lib/auctionHost.ts, dev/dil/knowledge.ts, changelog/releases.gen.ts (+ site regen)
- Tests (3): `src/state/auctionCustody.test.ts` (NEW, 8 custody tests),
  functions/auction.test.ts (+1 wire round-trip), core/marketCatalog.test.ts (category loop)
- Docs (5): AUCTION-HOUSE.md, TRADING-PREP.md, GAME-STATE.md, DIL_GRAPH.md, HISTORY.md

## Systems affected (from the dependency registry)

- **online-foundation** — market catalog/authority/custody spine (mulliganPiece lane)
- **mulligans** — DUP_TISSUE export; dex is now a trade surface
- **meta-store** — auctionSellables/EscrowOut/Deliver/Reconcile mulligan branches
- **net-backend** — auctionHost authority grants for `mul.` families
- **chronicle** — releases.gen.ts (notes run)

## Power Score changes

None — trading moves ownership, never stats; delivery reuses the existing sequence/dissolve
paths that already fold into Power.

## UI changes

`ui/AuctionHouse.tsx` + the `ah-` CSS block (index.css): masthead (kicker/display
title/subtitle naming mulligan organs), membrane wallet (market balance = hero figure),
segmented pill tabs, rarity-washed cards driven by `--rc` with glyph watermarks + `⚕ stock`
chip, tinted detail/sell sheets with area-filled sparkline, boxed My-Market ledger
sections, breathing hot-market banner, upgraded guest gate. mobilecheck CLEAN (29 screens ×
6 viewports); uiStandards green; live screenshots verified at 1440×900 + 844×390.

## Documentation changes

- `docs/AUCTION-HOUSE.md` — categories row, family formats (+`mul.<piece>.<rarity>`),
  §8 client custody (slotted block + Tissue dissolve), §10 checklist proof note.
- `docs/TRADING-PREP.md` — four categories, `mul:` ledger key, `slotted` block axis.
- `docs/GAME-STATE.md` — 2026-07 mulliganPiece addendum on the market summary.
- `docs/CHANGELOG-PIPELINE.md` — no change needed (notes pipeline untouched).

## Save changes

None this batch — `mulliganDex` custody mutations ride the existing v50 shape;
provenance gains `mul:` stamps via the established reconcile path (account-level,
never pruned).

## Known edge cases

- A grafted piece lists as blocked (`slotted`); a **reforge-LOCKED host reads `bound`** —
  locked organisms never release pieces, so the block is permanent for that piece.
- The server cannot know slot state: `listItem` gates on client blocks BEFORE the network
  call, and `auctionEscrowOut` re-checks `modifierHost` after a 200 (refuses, keeping the
  save consistent even if a stale client raced a graft).
- Fixture trap: TowerKind ids only (`mortar`, not `gatling`) — the save sanitizer silently
  drops organisms under unknown tower keys; starter genes are neverTrade, so tests needing
  a sellable gene must inject a non-starter.

## Remaining technical debt

- sim-market's synthetic family list doesn't model mulligan lanes (deliberate: it tests
  the engine generically; real-catalog coverage lives in the restock host test).
- Browse in dev shows "Reading the market…" with no local D1 — the offline banner only
  fires on connectivity loss, not on API absence (cosmetic, dev-only).

## Recommended next tasks

1. ~~#352 Website deploy fix + never-again guard~~ — **SHIPPED same session** (b32121c):
   production_branch pinned every run + version.json stamp + post-deploy production-URL
   verify that fails the workflow on mismatch; proven live on run #201 (production now
   serves the current build at assimilate-69x.pages.dev).
2. **#350 Recommended-decisions prominence pass**: RecommendStrip/Best-Purchase/NextUp as
   the first visual read on every screen that has one.

## Future expansion hooks

- `core/marketCatalog.ts` `mulliganFamilyKey`/`mulliganExclusive` — rarity-band tuning in
  one place if organ liquidity needs widening.
- `meta.auctionDeliver` grant switch — the pattern for any fifth category's payload shape.
- `ui/AuctionHouse.tsx` `CAT_GLYPH`/`RARITY_TINT` — extend per new category/rarity; sheets
  and cards inherit via `--rc` automatically.
