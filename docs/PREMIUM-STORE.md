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

## Paid random content — the region rule (`§paid-loot-boxes`)

**Decision (2026-11): apply the strictest reading — Belgium's — in both Belgium and the
Netherlands. In a restricted region, real money never reaches a random outcome: not a container in
the pack, and not a currency that can be spent on one.** This is an engineering decision from the
regulators' published positions, not legal advice; confirm with counsel before taking live payments.

**Why this line.**

- **Belgium.** The Gaming Commission (Kansspelcommissie, April 2018) found paid loot boxes are games
  of chance under the Gaming Act of 7 May 1999 — and counted loot boxes bought with *in-game
  currency that can itself be bought with real money*. Penalties reach €800,000 and five years'
  imprisonment, doubled where minors are involved. Industry practice followed the strict reading:
  EA stopped selling FIFA Points in Belgium (2019), Valve disabled case opening, Nintendo withdrew
  two mobile titles, and Diablo Immortal launched in neither Belgium nor the Netherlands (2022).
- **Netherlands.** The Kansspelautoriteit's test turns on tradable prizes with market value; its
  €10m order against EA was overturned by the Raad van State (March 2022), but Parliament has asked
  for a ban and the government backs EU-level rules. Applying Belgium's rule here costs little and
  survives either outcome.
- Gating only containers bought *directly* (the earlier switch) left the classic path open:
  money → Ichor → Splice Market container. That is exactly what the Belgian reading covers.

**How it is enforced — derived, never a hand SKU list** (`core/premium.ts`):

- `RANDOM_SINKS` lists every meta-game sink where a currency buys a random outcome: Splice Market
  containers and gear (Ichor), the Mulligan reforge wheel (Ichor), Cultivate (Gene Essence), Armory
  reroll/reforge/randomize/upgrade (crafting materials), and the Season Pass premium track's
  containers.
- `CURRENCY_PATHS` lists every way one currency buys another (the Ichor Exchange, the Splice
  Market's tiers, the pass's Ichor door and its Ichor rewards).
- `GRANT_STAKE` maps each grant kind to a random draw or the currency it pays (exhaustive — a new
  grant kind fails typecheck until classified). `currencyReachesChance` walks the paths;
  `offerReachesChance(offer)` is true when any grant is random or reaches a random sink.
- `premium.test.ts` pins the tables to the live code (every Splice Market slot, every exchange
  currency, every season's premium track), so a new random sink or path cannot slip past.
- **Today's verdicts:** Ichor, Genome Cores, Gene Essence, crafting materials and the Season Pass
  reach chance; tower/hero shards and Boss Rush stamina do not (stamina buys entries to a skill
  mode — its drops are earned in play). With the current catalog **nothing is sold for real money
  in a restricted region**; a pack of only deterministic progress (e.g. shards) would be sold
  automatically.

**Where it bites:**

- **Server (authoritative).** `POST /api/store/checkout` answers `451 region-restricted` for every
  SKU where `offerReachesChance` is true when Cloudflare's `request.cf.country` is in
  `PAID_LOOTBOX_BLOCKED_COUNTRIES` (comma list; **unset = `BE,NL`**, `""` = nowhere). An unknown
  country (no `cf`, `XX`, Tor `T1`) is refused when `ENVIRONMENT=production`, allowed in
  preview/dev. Logic: `functions/lib/lootbox.ts`; tests: `functions/lootbox.test.ts`.
- **Config.** `GET /api/config` reports `paidRandomContainers: boolean` for the caller (cache
  `private` — a shared edge copy would leak one country's answer to another).
- **Client.** The Premium Store, the flash-sale popup and the Season Pass screen's "$ in the Store"
  door hide those SKUs (`src/net/storeRegion.ts`); the store explains why in one line. With
  real-money checkout an unknown answer hides them (fail closed); the sandbox/static build hides
  only on an explicit "blocked".
- **What stays.** All play: containers, the Splice Market, the wheel, Cultivate and the Season Pass
  premium track still work with currencies *earned in play* (no money enters, so no stake). The pass
  keeps its in-game Ichor unlock.
- **Disclosure everywhere.** Container drop rates are shown in the Vault (`GeneticVault.tsx`).

**Residual risks for counsel:** a player who bought Ichor while outside a restricted region and
later plays inside one (or uses a VPN) can still spend that Ichor on containers — the game sells
nothing in-region, but does not segregate money-bought balances. Revisit if the Netherlands or the
EU adopts an explicit ban, or if a new region is added (one env var).

## Expandability

A holiday / anniversary / creator / collab offer is **one `registerPremiumOffer` call** with a
`window: { from, to }` — `activeEventOffers(dayKey)` surfaces it, the same card renders it, the
same pipeline sells it (pinned by the registry test's Solstice fixture). Cosmetic grant kinds
slot into the `PremiumGrant` union as new data rows when cosmetics exist.

## Economy review

See **docs/PREMIUM-ECONOMY-REPORT.md** — the five-persona, 30-day simulation
(`state/premiumEconomy.test.ts`) that gates this catalog in CI.
