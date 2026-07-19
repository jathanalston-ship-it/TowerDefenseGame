# TRADING-PREP.md — Auction House backend preparation (Ichor economy)

> Canonical doc for `src/core/itemIdentity.ts` + `src/core/trading.ts` and the `save.provenance`
> ledger (v47). **Deliberately NO Auction House gameplay or UI exists** — this is the complete
> backend preparation so the future market lands without architectural rewrites. Related:
> `ONLINE-FOUNDATION.md` (authority model), `MARKET.md` (Ichor identity + faucets),
> `EQUIPMENT.md`, `COSMETICS.md`, `GENE-EVOLUTION.md`, `MULLIGANS.md` (the four tradable
> categories).

## 0. Scope contract

- **Tradable categories: cosmetics, equipment, Gene Cards, Mulligan pieces. ONLY.**
  (`TRADABLE_CATEGORIES`) — currencies, shards, containers, progression are structurally
  untradable. (Mulligan pieces joined 2026-07: the DEX UNLOCK trades, never a slotted graft.)
- **Denomination: Ichor.** Fees and taxes are Ichor sinks (`TRADE.listingFeeFrac` 5% up-front,
  `TRADE.saleTaxFrac` 10% at settlement) — the future market is economically integrated with
  `MARKET.md`'s premium currency from day one.
- **Authority: server-only.** `trade.list` / `trade.bid` / `trade.settle` are
  `PROGRESSION_AUTHORITY` server rows with NO offline path.

## 1. Item identity (`core/itemIdentity.ts`, save v47 `provenance`)

Every owned tradable carries a **ProvenanceStamp**:

| Field | Meaning |
|---|---|
| `source` | acquisition source ('Genetic Vault', 'arena-pass', 'legacy', …) |
| `at` | acquisition epoch ms (0 = pre-ledger — honest and deterministic) |
| `season` | arena season index at acquisition |
| `bound` | soul-bound: PERMANENTLY untradable (arena exclusives, tutorial grants). One-way — there is no unbind. |
| `transfers` | ownership changes so far (future trades increment) |
| `history` | prior owner player-ids, capped at `ITEM_IDENTITY.historyCap` |

Ledger keys: `eq:<uid>` (equipment instances) · `cos:<id>` (wardrobe + phenotype cosmetics) ·
`gene:<id>` (gene cards) · `mul:<pieceId>` (mulligan dex unlocks).

**The coverage invariant (self-healing):** `reconcileProvenance` runs on EVERY load (and on
`defaultSave()` itself): anything owned-but-unstamped gains a `legacy` stamp; stamps for dead
equipment uids prune; force-bound refs re-bind. Coverage is a load-time invariant, not a
discipline — a hand-edited save cannot un-bind an exclusive or strip an item's history durably.

**Global uniqueness:** local uids are device-unique; the SERVER assigns
`globalItemId(ownerPlayerId, ref)` when an item first enters the market — the client never
invents one.

**Stamping chokepoints:** acquisition sources stamp opportunistically going forward (meta's
container-open, market and reward paths); the reconcile pass guarantees the floor either way.
Origin is immutable — `stampAcquisition` is first-writer-wins.

## 2. Eligibility (`core/trading.ts`)

`tradeEligibility(ref, stamp, ctx)` → `{ok, blocks[]}` — the ONE evaluation, imported by both
the future UI and the server functions. Block axes: `bound` · `guest` · `campaign`
(< stage 10) · `accountAge` (< 3 days) · `listingCap` (12/day) · `equipped` · `slotted`
(a grafted mulligan piece — unslot first) · `category`.
Every block has human copy (`tradeBlockLabel`).

## 3. The market's economic architecture (constants + types, no implementation)

- `TRADE`: listing fee 5% (min 1, non-refundable — spam brake), sale tax 10% (the Ichor sink),
  price bounds 5..100 000 Ichor, durations 12/24/48 h, bid increment 5% (min +1), anti-snipe
  extension 120 s, 30-day public price history.
- Pure math the server recomputes and the client previews: `listingFee` · `saleTax` ·
  `sellerProceeds` · `minNextBid` · `priceInBounds`.
- Type vocabulary ready for the D1 schema: `AuctionListing` (buy-now AND bidding),
  `AuctionBid`, `MarketHistoryPoint` (per-day median/low/high — the price-trend endpoint's
  row), `SellerRecord` (public track record).

## 4. Fraud detection (`auditTradeEvents`)

Real, unit-tested heuristics over the server's trade-event log (pure — servable as-is):

| Signal | Trigger |
|---|---|
| `rapidTransfer` | the same item hopping ≥ 3 owners inside 6 h (mule chains) |
| `priceOutlier` | price beyond ×8 / ÷8 of the item's median (RMT wash shapes) |
| `selfDealing` | the same account pair trading ≥ 4 times |
| `circular` | an item returning to a previous owner |

Signals flag for review — they never auto-punish (human adjudication; the command-log /
ledger history is the evidence).

## 5. PvP legality seam

`pvpLegality(ref, stamp)` — whether an item may be fielded in ranked arena play. Everything is
legal today; seasonal rulesets filter here without touching equipment/arena code.

## 6. The Auction House — BUILT (docs/AUCTION-HOUSE.md)

Everything this section once listed now exists: `migrations/0007_auction.sql` (listings/
bids/wallets/ledger/trades/history/authority/flags), `functions/api/auction/*` behind the
shared eligibility + engine validation, item escrow + settlement with provenance
transfers, and `ui/AuctionHouse.tsx` reading `tradeEligibility` for every button state —
plus the invisible Market Authority (core/marketAuthority.ts) this prep layer anticipated.
**docs/AUCTION-HOUSE.md is the market's reference now**; this document stays canonical for
the identity/eligibility/fee vocabulary it defines.

## 7. Cosmetic census & market-record contract (v53 provenance layer)

The Collector Panel (docs/COSMETICS.md §provenance) displays network-wide facts per
cosmetic — copies introduced/claimed/tradable/bound, auction sale counts and price history.
The client NEVER fabricates these numbers: `core/wardrobe.ts` exposes two provider seams
that return `null` until a server feeds them, and the UI renders an honest placeholder
("awaiting network census") for null.

- **`CosmeticCensus`** `{ introduced, claimed, tradable, bound, asOf }` — set via
  `setCosmeticCensusProvider`, read via `cosmeticCensus(itemId)`. Server source of truth:
  `introduced` = count of delivery events (every `receiveCosmetic` on every account),
  `claimed`/`bound` = count of `cos_claim` analytics events (the durable per-item claim
  row emitted at the Specimen Vault's claim ceremony — the ONLY claim surface),
  `tradable` = introduced − claimed − (instances consumed by future trades/sinks).
- **`CosmeticMarketRecord`** `{ sales, last, average, high, low, asOf }` — set via
  `setCosmeticMarketProvider`, read via `cosmeticMarket(itemId)`. Server source of truth:
  the auction `trades` table (0007_auction.sql), aggregated per cosmetic item id at
  settlement time.
- **Endpoint shape (future)**: one read-only
  `GET /api/census/cosmetics?ids=wd_a,wd_b` returning `{ [itemId]: { census, market } }`,
  cached aggressively (asOf is the honesty timestamp) — the boot sequence installs both
  providers from one fetch. Until that endpoint ships, the seams stay null and the museum
  stays honest.

## Known limitations

- Gene-card trades transfer the UNLOCK (account-level id), not an instance — a design
  decision the listing flow must respect (quantity is always 1, and selling your only
  copy removes access; the future UI must confirm exactly like equipment's destruction
  safeguards). Cosmetics left this model in v53: the tradable unit is now the UNCLAIMED
  `CosmeticInstance` (uid-stamped like equipment); claimed cosmetics are bound forever.
- Equipment `history` starts at the ledger's birth — pre-v47 provenance is honestly `legacy`.
- Client clocks stamp `at` for offline acquisitions; the server re-stamps on first listing
  (server truth at the trade boundary).
