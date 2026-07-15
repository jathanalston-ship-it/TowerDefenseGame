# PREMIUM-STORE.md — ethical monetization as pure data

The Premium Store is ASSIMILATION's monetization layer: a permanent Hub tab (its own nav group —
visibly **separate from gameplay progression**) selling Ichor bundles, two permanent packs, one
rotating daily pack, time-windowed event offers, the **Season Pass pair** (§season), and one-time
milestone **flash sales** (§flash). Everything is a row on a **registry** (`src/core/premium.ts`);
the screen (`src/ui/PremiumStore.tsx`) renders whatever is registered. Flash TIMING (triggers,
first-sight windows, popup cadence) is client-only logic in `src/state/flashOffers.ts` — the SKU
rows stay in the shared catalog so `functions/` prices checkout without changes.

**The contract: purchases accelerate, they never replace gameplay.** Enforced in code
(`state/premiumSafeguards.test.ts` + the grant-type system), not just policy:

- **A purchase moves Power Score by ZERO.** Nothing auto-equips; shards still buy stars at normal
  prices. The store shows an honest `⚡ up to +N Power when invested` estimate
  (`meta.offerPowerPotential`) computed with the real cost ladders — and that preview **honours the
  Campaign Evolution Cap**: money cannot cross a campaign gate.
- **Money never mints prestige.** Purchased Genome Cores deliberately skip `prestige.cycleShards`.
- **Legendary/Exotic equipment is never sold.** The grant type (`PremiumEquipRarity = rare|epic`)
  makes it unrepresentable; legendary+ gear stays a drop. Legendary **containers** may be sold —
  they still roll normal odds in the Vault, so the jackpot stays a jackpot. Exotic containers stay
  Splice-Market/gameplay-only.
- **No forbidden verbs.** The grant language has no campaign-clear / evolution-cap / hero-slot /
  Ascendant-Cell grants — future offers stay inside the safeguards *by construction*.

## The catalog

**Ichor bundles** (repeatable) — `$1 ≈ 25 base Ichor` (`PREMIUM.ichorPerUsd`), anchored on the live
sinks (cheapest Bio-Container 30 Ichor, exotic 170). Bonus grows with commitment (displayed):

| Bundle | Price | Base + bonus | Total Ichor |
|---|---|---|---|
| Starter Vial | $1.99 | 50 + 0% | 50 |
| Small Phial | $4.99 | 125 + 8% | 135 |
| Ichor Flask | $9.99 | 250 + 15% | 288 |
| Ichor Cask | $19.99 | 500 + 25% | 625 |
| Ichor Reservoir | $49.99 | 1250 + 40% | 1750 |
| The Wellspring | $99.99 | 2500 + 60% | 4000 |

**Permanent packs** (once per account): **Starter Mutation Pack** ($4.99, new players — Ichor,
tower/hero shards across the whole roster, a Run Cache, 2 rare equipment; ×1.85 à-la-carte value)
and **Growth Accelerator Pack** ($19.99, mid-game — Ichor, epic+legendary containers, epic gear,
crafting mats, Gene Essence, Cores; ×1.44 value).

**Rotating packs** ($9.99, exactly ONE visible per UTC day, once-per-day purchase): Tower Research
/ Hero Enhancement / Equipment Forge bundles, each targeting **~×1.65 value** with a hard theme.
Rotation is seeded off the day key (`todaysRotatingOffer`), countdown shown live.

**Season Pass (§season)** — the premium track's real-money door, TWO SKUs, one shown at a time
(`seasonOfferFor`): the **first-ever** season purchase is always `bp_premium_first` — **$4.99,
half price, once per account** (limit 1, server-enforced from the fulfillment ledger) — and the
standard `bp_premium` **$9.99** takes over from the second season on. Accounts that already paid
full price are not first-timers and never see the sale. Both set the SAME per-window flag the
250-Ichor door sets (docs/BATTLEPASS.md §pricing); while premium is owned this window, neither
door sells (`meta.offerPurchasable`). Surfaces: a store Season section + the pass screen's
"or $X in the Store" button.

**Flash sales (§flash)** — one-time pop-up bundles ($1.99–$4.99, `limit: 1`) armed by MILESTONE
triggers at achievement highs, with goods matched to what the player is doing next:

| SKU | Price (was) | Trigger | Contents |
|---|---|---|---|
| First Hunt Cache | $1.99 ($3.99) | first Mega Boss slain | 40 Ichor · rare container · 50 Essence |
| Season Spark | $2.99 ($6.99) | Season Pass level 5 | 70 Ichor · epic container · Run Cache |
| Deep Roots Bundle | $3.99 ($8.99) | Campaign Stage 12 cleared | 20 Strain Samples ×all · 200 Cores · 2 epic containers · 60 Ichor |
| Molt Celebration | $4.99 ($10.99) | first Molt | 120 Ichor · legendary container · mats · 100 Essence |

**Timing rules** (`state/flashOffers.ts`, tested): no popup before the eligibility floor
(**stage 3 + 5 runs** — the game proves itself first); **one popup per 72h**, one live sale at a
time, backlog drains in catalog order; the **48h countdown anchors at FIRST SIGHT** (popup or
store visit — a window never burns unseen); a dismissed popup **never re-pops** (the store's
Flash section keeps the countdown). **Honesty rules** (validator + tests): `listUsd` (the struck
"was" price) may never exceed the goods' real à-la-carte worth; flash value sits in the same
≥×1.4 / ≤×3.0 pack window; every flash SKU is `limit: 1` and ≤ $5 **by construction**.

**Value model** (`offerValueIchor` / `offerValueMultiple`): every grant converts to Ichor-equivalents
at the LIVE Splice-Market prices — one table drives the card badges, the ≥×1.4 / ≤×3.0 test bounds
(worthwhile, never a skip), and the economy simulation.

## Purchase flow & feedback

Card (animated art, contents preview, value badge, Power note) → **confirmation** (full recap,
price, sandbox notice) → `meta.purchaseOffer` → **reveal ceremony** (staggered line pops with the
chest audio ramp, then the honest "spend it in the Labs" close). The nav badge lights when a new
rotation lands (`store.rotation` notification, cleared by `meta.openStore`). The account ledger
(`save.premium`) records purchase counts, the rotating-day stamp, and display-price totals.

## Payments — the provider seam

**No payment processor exists in this client** (static SPA). `PREMIUM.checkout = 'sandbox'`: the
pipeline runs availability → *charge seam* → grants → receipt, with the charge step a stub that
always clears (receipts carry `sandbox: true`, the UI says so out loud). Wiring a real provider
(Stripe / Steam / App Store) replaces exactly one step inside `meta.purchaseOffer` — offers,
grants, safeguards, and UI are untouched. Until then the store is a fully-testable sandbox.

## Expandability

A holiday / anniversary / creator / collab offer is **one `registerPremiumOffer` call** with a
`window: { from, to }` — `activeEventOffers(dayKey)` surfaces it, the same card renders it, the
same pipeline sells it (pinned by the registry test's Solstice fixture). Cosmetic grant kinds
slot into the `PremiumGrant` union as new data rows when cosmetics exist.

## Economy review

See **docs/PREMIUM-ECONOMY-REPORT.md** — the five-persona, 30-day simulation
(`state/premiumEconomy.test.ts`) that gates this catalog in CI.
