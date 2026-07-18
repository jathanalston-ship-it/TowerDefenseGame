# AUCTION-HOUSE.md — the player-driven market & Market Stabilization System

> The complete trading economy: player listings in Ichor across **Gene Cards, Equipment
> (Bio-Gear), Cosmetics, and Mulligan Modifiers** — no other category may trade —
> stabilized by an invisible, always-running **Market Authority**. This document is the single reference for the
> economy rules, pricing intelligence, item metadata, transaction validation, the
> authority's levers, the security model, expansion hooks, and the developer tools.
>
> Prep layer: docs/TRADING-PREP.md (identity/eligibility/fees vocabulary — still canonical
> for what it covers). Server architecture style: docs/DEPLOYMENT.md + docs/ONLINE-FOUNDATION.md.

---

## 1. Architecture — one rulebook, three hosts

```
src/core/auction.ts          the ENGINE: listing lifecycle as a pure state machine
src/core/marketAuthority.ts  the AUTHORITY: metrics → bounded levers; manipulation detectors
src/core/marketCatalog.ts    the CATALOG: registry-derived families + exclusivity rules
src/core/trading.ts          constants/fees/eligibility/fraud heuristics (prep layer)
src/core/itemIdentity.ts     provenance stamps + global item ids (prep layer)
        ▲            ▲                ▲
        │            │                │            ┌────────────────────────────┐
functions/lib/auctionHost.ts + functions/api/auction/*   │ scripts/sim-market.ts      │
  (D1 truth: wallets, escrow, settlement, ticks)         │ (10-scenario economy sims) │
        ▲                                                └────────────────────────────┘
src/net/auctionHouse.ts → src/state/auctionHouse.ts → src/ui/AuctionHouse.tsx
  (typed transport)        (custody + outbox)          (Browse / Sell / My Market)
```

Every rule lives in `src/core/` and is executed by **three hosts**: the server (the trade
truth), the client (previews — can never disagree with the server because it runs the same
functions), and the simulation (the health harness). The engine emits money movements as
`LedgerOp` rows; hosts map them onto their own storage (D1 wallet ledger / sim agent
wallets). Nothing in the engine touches DOM, RNG, or clocks.

## 2. Economy rules (the numbers and why)

All tunables in `core/trading.ts` `TRADE`:

| Rule | Value | Why |
|---|---|---|
| Categories | geneCard, equipment, cosmetic, mulliganPiece | The launch trio + the organ lane (2026-07, the §10 checklist's first proof); `TRADABLE_CATEGORIES` is the gate |
| Currency | Ichor | The premium-adjacent sink currency — trading gives it a player-set exchange rate |
| Listing fee | 5% of buy-now/ask, min 1, **burned** | Spam brake + baseline Ichor sink; non-refundable so relist-churn costs |
| Sale tax | 10% of price, **burned** | The big anti-inflation sink; scales ×1–×2 under the authority |
| Price bounds | 5 … 100,000 | A floor so fees mean something; a ceiling so "1e15" listings can't exist |
| Durations | 12 / 24 / 48 h | Short enough to keep the book live, long enough to cross time zones |
| Bid rule | full escrow, +5% min increment, 120s anti-snipe | Sniping loses to the extension; escrow makes bids real money |
| Account gates | campaign stage 10, 3-day age, 12 listings/day | Trading is an EARNED capability (fraud friction) — server-derived, never client-claimed |
| Quantity | always 1 | Equipment trades the instance; gene/cosmetic/mulligan trades **the unlock** — selling your only copy removes access (the confirm dialog says so). A grafted mulligan piece must unslot first (`slotted` block); a reforge-LOCKED host binds its pieces forever; delivering an already-owned piece dissolves to Mulligan Tissue by the pillar's own duplicate law (`DUP_TISSUE`) |

**Money conservation is an invariant, not a hope:** every Ichor entering the market
(deposits) equals wallet holdings + burns + withdrawals, exactly. The sim asserts it after
~3,820 simulated days; `functions/auction.test.ts` asserts it after every endpoint flow;
the D1 ledger makes it auditable in SQL (§9).

## 3. Item metadata (lightweight, permanent)

Server-side (`market_items`, one row per item that ever entered the market): global id,
refKey, category, family, rarity, provenance season + acquisition source, current owner +
custody state (escrow → delivered → collected / returned), transfer count, capped owner
history, serialized payload, fraud flag, created-at. Client-side, the v47 provenance
ledger (docs/TRADING-PREP.md) stamps every delivery with source `'Auction House'`, the
item's season, and the server's transfer count.

Identity threads: `globalItemId = owner/refKey` is assigned at first listing and reused
when a market-born item relists under the same owner (full history continuity for
gene/cosmetic unlocks). Equipment preserves its instance uid across owners, so `eq:<uid>`
is the cross-account provenance thread the fraud audit chains on.

## 4. Pricing intelligence

Per FAMILY (the aggregation identity — `gene.<id>`, `eq.<def>.<rarity>`, `cos.<id>`,
`mul.<piece>.<rarity>` — mulligans family per SEQUENCED rarity, the equipment precedent:
mixing rarities would poison the price stats):

- **History**: one row per (family, UTC day) — sales, median, low, high — folded at
  settlement from real trades, served 30 days back (`/api/auction/history`).
- **Stats** (`familyStats`): lowest active listing, highest sale, volume-weighted recent
  average (7d), **estimated value** (recency-weighted median of day-medians, ×3/×2/×1
  weights over 14d — the "worth" line), sales/day velocity, volatility (median spread ÷
  estimate, 0..1).
- **Recommended ask** (`recommendedPrice`): undercut a live floor by 3%, else the
  estimate; multiplied by the authority's `recBias` (±15% max); always inside bounds.
  Guidance only — **no price is ever forced or capped.**

## 5. The Market Authority (invisible, always running, never artificial)

NOT an NPC. "Always running" is a property of the data: every trafficked endpoint calls
`maintainMarket()`, which lazily settles due auctions, advances the authority **window**
(1 UTC hour; `market_windows` PK makes the tick exactly-once under racing requests),
restocks baseline supply, and periodically audits. Zero traffic ⇒ nothing to steward.

**It watches** (`MarketMetrics`, computed per window from live tables): active listings,
listings opened, sales + volume + average price, unique traders, Ichor burned, market
circulation (Σ wallets), median wealth, stale listings, rare availability, volatility.

**It answers with four bounded, smooth levers** (`AuthorityState`, drift ≤ 6% per window —
interventions are gradual *by construction*):

| Lever | Range | Hot (inflation index > 1.05) | Notes |
|---|---|---|---|
| feeMult | 1 – 2.5 | → 2.0 | Illiquidity (>50% stale) overrides to 1 — health beats dogma |
| taxMult | 1 – 2 | → 1.8 | Relaxes toward 1 whenever not hot |
| baselineLevel | 1 – 6 /family | → 5 | Also nudges up when zero rares are listed |
| recBias | 0.85 – 1.15 | → 0.9 | Steers asks, never forces them |

**Inflation index**: two-speed EWMA over sales-weighted average price (fast 0.15 vs slow
0.02 gain) — a slow boil that is invisible window-over-window still compounds in the
fast/slow ratio. Sink coverage (burn ÷ volume) modulates it, damped so authority-sale
burns can never mask real price growth. Sparse windows (<3 sales) are noise and move
nothing. The levers **actually charge**: the engine takes `feeMult`/`taxMult` at
open/settle, so server, client preview and sim apply identical fees.

**Baseline stock** (§catalog is the law): the authority lists ONLY foundational items —
common/uncommon gene cards, common equipment, entry-band (rare) boutique/cultivate
cosmetics — priced 10% ABOVE guidance (a floor for newcomers that never undercuts player
sellers), scaled to population (`baselineDemandScale`: ~×1 per 40 active traders, cap ×8),
capped at 40 orders per tick. Authority sales pay no seller: **100% burns** (a pure sink
that grows exactly when inflation does). It can NEVER stock: seasonal/limited/event/
battle-pass/quest/achievement cosmetics, exotic equipment, epic+ genes, or anything
`neverTrade` — enforced three times (catalog exclusivity, `baselineEligible` band, tests).

## 5b. §buybacks — the Market Liquidity Engine (the authority's BUY side)

The authority may quietly PURCHASE a stale, fairly-priced foundational player listing so
the market keeps transacting when player demand is thin — liquidity, never competition.
Pure planner: `planBuybacks` (`core/marketAuthority.ts`, `BUYBACK` tunables); host
execution: `runBuybacks` inside the same exactly-once window tick; the sim drives the
identical planner daily. The seller is paid EXACTLY like any sale (proceeds + live-tax
burn); the item is ABSORBED (owner `@authority` — never resold, so absorbed stock can't
re-enter and depress prices; baseline supply is synthesized separately). Trade rows carry
`authority = 2`.

**Funding — structurally sink-positive:** a window's budget is
`min(2000, max(40, prevWindowBurns × 0.5))`. Nothing accumulates or carries over; across
every sim scenario injections run 0.01–4% of burns. The D1 ledger identity (§9) is
unchanged (proceeds are ordinary ledger rows); the CLOSED-SUPPLY identity gains one
explicit term: `held + burned + withdrawn = deposited + Σ price(authority=2 trades)` —
nothing else may ever create Ichor.

**The brief's demands, mapped to mechanisms:**

| Demand | Mechanism |
|---|---|
| Eligibility: commons/uncommons + baseline cosmetics only | `BUYBACK_MAX_RARITY` band (gene c/u · equipment c/u · cosmetic entry-band rare) |
| Never: limited/seasonal/prestige/arena/promo/mythic | catalog `exclusive ∥ neverTrade` is an absolute veto (same law as baseline stock) |
| "Authority Eligible" flag | `AUTHORITY_ELIGIBLE_OVERRIDES` (marketCatalog) — hand-curated; widens the band, never past exclusivity |
| Listing age / staleness | bid-free + older than 35% of its duration; buy-now listings only |
| Supply/demand/velocity awareness | families selling ≥ 1.5/day are skipped; `velocityFade` starves the engine as player sales/window rise |
| Player population coupling | `busyFade`: activity ~×1.5 in a dead market → 0 as unique traders/window approach 40 |
| Price vs historical average | the valuation corridor: pay ≤ ×1.05 of the family estimate (the recency-weighted median players see), skip < ×0.2 (suppression bait); no history ⇒ conservative per-rarity seed guidance |
| Randomized timing / never guaranteed | crypto-entropy shuffle + a 0.55 accept roll per pick — no action sequence forces a purchase |
| Budget limits / daily caps | per-window budget above; ≤ 3 buys/window; ≤ 1 per family/window |
| Per-seller caps + cooldowns | 1 buyback per seller per UTC day + 6h cooldown |
| Duplicate listing detection | a seller with > 2 active same-family listings disqualifies that family (dupe walls) |
| Inflation/suppression/wash/relist detection | any seller named by an UNREVIEWED `market_flags` row is invisible to the engine (the §6 detectors are the sensor suite); `fraud_flag` items and items with > 2 transfers (mule/relist chains) are skipped |
| Alt-account detection | heuristic, not identity-graph: per-seller caps + flag vetoes + the §6 pair/chain detectors bound what any cluster of accounts can extract (see §12) |
| Player trades dominate | buybacks are excluded from sales metrics AND price history (no self-referential price support), and the sim gate pins buybacks ≤ 25% of trades in every scenario |

**Race discipline:** the sold-gate `UPDATE … WHERE state='active' AND bid IS NULL` means a
player bid landing in the window race always beats the authority at the SQL level; the
trade INSERT + money statements follow the §7 conditioning exactly (op ids share the
`sale:<listingId>:*` family — a listing settles once, ever).

## 6. Anti-manipulation (flag, never auto-punish)

Detectors (`auditMarket`, ~twice daily over 7d of trades + 24h of listing events):

| Signal | Trigger |
|---|---|
| rapidTransfer | same item ≥3 owner hops in 6h (mule chain) |
| circular | an item returning to a previous owner |
| priceOutlier | trade beyond ×8 / ÷8 the family median (RMT wash shapes) |
| selfDealing | same pair trading ≥4 times |
| rapidRelist | ≥3 open→cancel cycles of one item in 24h (visibility gaming) |
| monopoly | one seller holding ≥60% of a family's book (≥5 listings) |
| priceFixing | ≥3 sellers posting the identical ask at ≥×2 median |
| dupeSuspect | the same equipment instance escrowed under two owners at once (flagged at listing time; uid collisions can be honest — moderation decides) |

Flags land in `market_flags` (+ `fraud_flag` on item rows). **The moderation hook exists
now**: `GET/POST /api/auction/flags`, gated by the `MOD_KEY` secret (`x-mod-key` header;
unset ⇒ 503 closed). A human reviews; nothing is ever punished automatically.

## 7. Transaction validation & atomicity (server)

Every write endpoint: same-origin check → per-IP rate limit → size-capped JSON → player
auth (account session OR the cloud-save sync token — trading REQUIRES a synced identity;
guests are refused) → shared-core validation (`tradeEligibility` over **server-derived**
context, catalog family/rarity match, engine dry-run) → one D1 batch.

Atomicity discipline (functions/lib/auctionHost.ts):
- **Schema guards**: wallet `CHECK (balance ≥ 0, escrow ≥ 0)` turns an overdraft into a
  SQL error → the whole batch rolls back; the partial UNIQUE index (one ACTIVE listing per
  item) does the same for double-lists. Insufficient funds cannot half-apply, ever.
- **Ordering**: the state transition runs first (guarded listing UPDATE / trade INSERT
  gate) and every money statement is CONDITIONED on it (`WHERE EXISTS…`) — a lost race
  reads false and charges nothing. No compensation paths in request flow.
- **Exactly-once**: `market_trades` PK (one settlement per listing, forever),
  `market_wallet_ledger` PK (deposits/withdrawals/credits dedupe by op id),
  `market_windows` PK (one authority tick per window).
- Known window: a crash between the settle gate and its money batch strands a trade row
  without movements (the arena/purchases discipline shares this). Repair query in §9.

**Trust boundary (documented, deliberate)**: wallet *deposits* and listing *payloads* are
client-attested — the same posture as every client-economy attestation in
docs/SECURITY-AUDIT.md. Sale proceeds, escrow, settlement, custody and history are
server-sourced truth. The audit lane watches the attested aggregates; deposits are
Turnstile-gated, bounded (≤250k/op), and rate-limited. The catalog refuses the one
categorical exploit: content the save sanitizer re-seeds on load (starter genes, starter
wardrobe) is `neverTrade` — selling a self-healing item would mint Ichor forever.

## 8. Client (docs/AUCTION-HOUSE.md §client)

`ui/AuctionHouse.tsx` in the MARKET hub (stage-9 reveal; the server's stage-10 line gates
the first listing — one stage of window-shopping). Browse: indexed filters (category,
rarity, price band, family set — free text resolves to family keys client-side against
the shared catalog; the server never scans names), four sorts, pagination, family sheet
with sparkline + stats + recommended price. Sell: `meta.auctionSellables()` (block
reasons: bound/equipped/neverTrade/slotted — slotted is the mulligan gate: unslot the
graft before listing; a reforge-locked host reads as bound), recommended-price prefill,
fee preview at the LIVE multiplier, only-copy warning. My Market: wallet, listings +
cancel, bids with leading/outbid state, trades, ledger. Mulligan delivery: an unowned
piece sequences into `mulliganDex` at the listing's rarity; an owned one dissolves to
Tissue (`DUP_TISSUE[rarity]`) — never a duplicate.

Custody is **server-first**: only a 200 moves the save (`auctionEscrowOut` /
`auctionDeliver`, provenance-stamped); `auctionReconcile` self-heals the crash window on
every `/mine` refresh. Wallet ops ride a **crash-safe localStorage outbox** — the same op
id retries across restarts and the server's ledger PK makes retries free. Deliveries and
sale proceeds raise reward placards (`rewardToast`, source `'auction'`). Affix-level and
collection-status filtering are client-side refinements over fetched pages (v1 scope; the
indexed-affix column is the scale-up hook, §10).

## 9. Developer tools

- `npm run sim:market` — the 10-scenario economy harness (§11). The iterate-until-healthy
  loop for ANY economy change: touch a lever, re-run, all 10 must stay green.
- `npx vitest run functions/auction.test.ts src/core/auction.test.ts
  src/core/marketAuthority.test.ts src/core/marketCatalog.test.ts` — 45 market tests.
- Moderation: `curl -H "x-mod-key: $MOD_KEY" https://<host>/api/auction/flags?unreviewed=1`;
  ack with `POST {"flagIds":[…]}`. Set the secret: `wrangler pages secret put MOD_KEY`.
- Migration: `wrangler d1 migrations apply <db> --remote` (0007_auction.sql).
- Ledger audit (money conservation in SQL):
  `SELECT (SELECT COALESCE(SUM(amount),0) FROM market_wallet_ledger WHERE player_id != '@burn')
        - (SELECT COALESCE(SUM(balance+escrow),0) FROM market_wallets) AS drift;` — must be 0.
- Stranded-settlement repair scan (the §7 crash window):
  `SELECT t.listing_id FROM market_trades t LEFT JOIN market_wallet_ledger l
     ON l.op_id = 'sale:' || t.listing_id || ':seller' WHERE t.authority IN (0, 2) AND l.op_id IS NULL;`

## 10. Foundational design — what a future category inherits

Adding a tradable category (or any new content in an existing one):

1. Content registries → `marketCatalog` derives families, names, rarity bands, exclusivity
   and neverTrade AUTOMATICALLY (new gene cards/equipment defs/cosmetics need zero market
   wiring — `marketCatalogProblems()` guards the derivation in content-integrity tests).
2. A genuinely NEW category: add it to `TRADABLE_CATEGORIES` (itemIdentity), a refKey
   prefix, a catalog projection, a payload grant shape in `meta.auctionDeliver`, and a
   baseline band row in `marketAuthority.BASELINE_MAX_RARITY`. Engine, endpoints, search,
   authority, audit, wallet, UI tabs and docs need **no changes** — nothing keys on
   concrete ids. Proven 2026-07: `mulliganPiece` (`mul:` refKeys, `mul.<piece>.<rarity>`
   families, common/uncommon baseline band, `slotted` block, owned-delivery Tissue
   dissolve) landed by exactly this checklist — the server accepted `mul` listings with
   zero endpoint edits beyond the two authority-grant lines.
3. Open hooks: `SellerRecord` (trust surface), `pvpLegality` (season rulesets),
   per-affix search columns when listing volume justifies them, push notifications for
   outbid/sold (needs a save-pure channel), regional shards (windowKey already namespaces
   metrics), `MANIPULATION`/`FRAUD` tunables as moderation learns.

## 11. Testing — the mandated scenarios

`scripts/sim-market.ts`: persona agents (F2P / casual / whale / manipulator / bot) with
utility anchors and rational bidding, ~3,820 simulated days across **inflation, deflation,
low population, high population, market crash, whale spending, F2P-only, rare scarcity,
bots + manipulators, baseline** — every scenario must hold: exact money conservation
(now including the buyback-injection term), commons-basket affordability within [⅓, ×3] of
calibration, full-basket bands, exclusives never stocked NOR bought, authority levers
inside bounds and ENGAGING under pressure, every planted fraud pattern flagged, buybacks
never from flagged personas, never exceeding 25% of trade, and never out-injecting burns. Current run: **all 10 healthy** with the levers live-charging
(inflation idx 1.18 → fee ×1.6 tax ×1.8; bot scenario raises rapidTransfer, circular,
priceOutlier, selfDealing, rapidRelist, priceFixing). Unit layer: engine lifecycle +
conservation, authority bounds/step caps/illiquidity override, catalog exclusivity +
printer guard, endpoint atomicity + exactly-once + custody round-trips (67 functions
tests).

## 12. Known limitations (deliberate v1 scope)

- Deposits/payloads are client-attested (§7) — the audit lane is the watchdog, moderation
  the teeth. Server-side inventory truth would require full server saves (out of scope by
  architecture: browser-local saves are a product decision, docs/ARCHITECTURE.md).
- No push/badge channel for outbid/sold while away — notification sources are save-pure
  today; proceeds surface as placards on the next market visit (§10 hook).
- Equipment relist across owners re-mints a per-owner global id (the `eq:<uid>` refKey
  remains the cross-owner thread); metadata continuity is by ref, not row.
- The settle-gate crash window (§7) — shared with the established purchase discipline,
  repairable via the §9 scan; no player-visible loss (item + trade row both persist).
- Liquidity-engine anti-exploit is HEURISTIC where identity is unknowable (§5b): true
  alt-account/wash graphs need identity infrastructure this architecture doesn't have.
  The bound is economic — per-seller caps, flag vetoes, the valuation corridor and the
  sink-funded budget cap what any account cluster can extract to a few fairly-priced
  commons per day, paid at market value. Revisit only with telemetry showing farming
  despite the bounds.
- `busyFade`/`velocityFade` are per-WINDOW semantics (server: 1 UTC hour; sim: 1 day) —
  the same deliberate host-dependence as the rest of the window vocabulary.
