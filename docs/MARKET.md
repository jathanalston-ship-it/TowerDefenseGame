# SPLICE MARKET — the refreshing store + the ICHOR premium currency

Two goals (the design brief, verbatim): **(1)** a refreshing store page selling lesser-value /
lower-quantity goods for Genome Cores, and **(2)** a new PREMIUM currency — microtransaction-
shaped, but with NO payment code — that buys rarer goods, larger quantities, and critically
**more Bio-Containers**, which rotate through the refreshes like everything else.

Meta-layer only: no sim, save-checksum, or golden-pinned behavior changes. A fresh save has
0 Ichor and identical behavior everywhere except the new (empty) market surfaces.

## Architecture

| Piece | File | Role |
|---|---|---|
| Pure core | `src/core/market.ts` | Every tunable (`MARKET`, `ICHOR`), window math, the deterministic stock roll, the gamble roll |
| Meta seams | `src/state/meta.ts` | `grantIchor` / `spendIchor` / `marketState` / `openMarket` / `buyMarketSlot` + the faucet folds |
| Read-model | `src/state/spliceMarket.ts` | `marketView(save, now)` — renderable slots (names, budgets, SOLD, countdown) |
| Screen | `src/ui/SpliceMarket.tsx` | Presentation only; mount = starter vial + badge stamp |
| Save | `saveStore.ts` | `ichor`, `lifetimeIchor`, `market {window, bought, seenWindow, starter}` (additive; sanitized) |

## The stock (5-minute windows, deterministic)

> 2026-07: the premium pool grew a 5th authored row — a **Gauntlet Stamina pack**
> (+20 Boss Rush stamina for 8 Ichor, overflow-capped; docs/BOSS-RUSH.md §stamina).
> Windows still stock exactly 3 of the 5 premium rows.

Stock is a **pure function of (profile seed, window index, owned roster)** — the seed derives
from `createdAt` (no rolled save field; `defaultSave()` stays deterministic). Reloading
mid-window shows identical stock; locked towers/heroes can never appear (roster-gated pools).

8 slots per window: **4 core-priced** small bundles (one each: Strain Samples ×5–15 @8/qty ·
Apex Genome ×2–5 @22/qty · Scrap ×2–6 @18/qty · Gene Essence ×3–10 @12/qty, shuffled) +
**3 ichor-priced** premium rows (Strain Samples ×40–80, Apex Genome ×8–16, rare/epic/legendary
Bio-Gear @12/20/34, Gene Essence ×25–50) + **1 Bio-Container** (rarity roll 42/30/18/8/2%,
priced 30/48/75/115/170 Ichor). 25% of windows roll a **second container** in place of an
ichor row — never a 9th slot — so one lot might carry a common, the next a rare AND an epic.
Equipment slots roll their concrete item at PURCHASE (the slot's rarity+price are what's
deterministic). Container buys land in `pendingContainers` — opened in the Genetic Vault like
any other container.

**Clock-tamper rule:** the effective window is `max(clock window, recorded window)`. Rewinding
re-shows the SAME recorded window with its purchases intact (nothing re-buyable); rolling
forward equals waiting. Purchases are one-shot per window (`market.bought`), validated against
the CURRENT stock at buy time — a stale click across a refresh fails silently.

## Ichor — faucets (sparse, front-loaded, un-farmable)

| Source | Amount | Guard |
|---|---|---|
| Starter vial (first market open) | 30 | `market.starter`, once ever |
| Achievement earned | 3 / 5 / 8 by core-reward tier (≤20 / ≤50 / >50) | achievements fire once |
| Collection rank-up | 5 per rank | session baseline never re-pays a rank (a rank earned but not polled that session pays on the NEXT promotion poll) |
| Campaign milestone | 12 per FIRST clear of every 5th stage | first-clear only |
| Infinite depth record | 2 per NEW 5-wave band of `bestWave` | record-keyed; replays pay 0 |
| **Boss Rush record (the primary repeatable lane)** | 2 per NEW 5-boss band of `rushBestBoss` (+ a weighted-common Bio-Container per NEW 10-band) | single-run RECORD-keyed; matching it pays 0 — docs/BOSS-RUSH.md §ichor |
| **Container bleed (the gamble)** | 10 @50% · 18 @30% · 26 @15% · 40 @5%, at **22%** per container (**26%** epic+) | independent, pity-less |

Early accounts bleed fast (achievements/ranks/stages tick rapidly ≈ 2–4 containers' worth),
then the tap tightens to depth records + the gamble — the intended hook curve.

## The gamble's EV discipline (pinned by `state/marketEconomy.test.ts`)

Expected Ichor per opened container ≈ 0.22 × 16.9 ≈ **3.7 ≈ 12%** of the cheapest container
(30) — asserted ≤ 15%. Only the 40-jackpot exceeds one container's price (the "perpetuate for
a little bit" beat). A 100k-trial seeded Monte Carlo starting from a 3-container bank pins:
**median ≤ 3 boxes · P(≥6) < 3% · P(≥9) < 0.1% · max < 14** — lucky players stretch to 6–8
total openings in extreme cases and ALWAYS starve. Ichor never touches the Power Score
(pinned), and no market slot ever grants Genome Cores (cores flow one way, in).

## MTX seam (closed)

`meta.grantIchor(source, n)` is the single tagged external grant path; `MARKET.mtxEnabled =
false` keeps the screen's "Acquire Ichor" button disabled. No payment code exists anywhere.

## Surfaces

Hub nav **Splice Market** (Collection group) + a nav badge when an unseen stock window has
landed (`notificationSources`, max-window rule, cleared by `openMarket`); Ichor chip in the
top resource bar; an Ichor Bleed shows in the hatch ceremony as an epic-emphasis pull row +
harvest line; Help wiki entry `splice-market`; dev-reset `currency` scope clears it all.

## Extension points

New goods = one row in a `rollStock` pool (+ a `describeGood` case). New faucet = one
`grantIchor(source, n)` call. Prices/weights/EV all live in `MARKET`/`ICHOR` — retune there
and the economy tests recompute their bounds from the same constants.

## Known limitations

Collection rank Ichor pays at the promotion POLL (Codex open); a rank earned and never polled
in a session pays on the next promotion instead of instantly. Stock names in `describeGood`
use framework fallbacks for unknown ids (tamper-safe). The gamble is intentionally pity-less.

## Research Samples (Field Research)

The Market hosts the OPTIONAL rewarded-study lane — full design in **docs/RESEARCH.md**.
The section shows remaining daily claims per category, the UTC reset countdown, the
progression yield badge, and armed observation boosts. Hidden entirely when no ad
provider is configured (`VITE_ADS_PROVIDER=none`). Its Ichor trickle (≤5/day, flat
forever) is accounted in the faucet philosophy above: a supplement that never rivals
either the earn lanes or the store.

## §exchange — the Ichor Exchange (2026-07)

The one-way valve OUT of the premium reserve: six barter lots on the Splice Market screen
(`core/ichorExchange.ts` pure; `meta.pollIchorExchange/ichorExchangeView/buyIchorOffer`;
save v30 `ichorExchange`). Two lots per currency — Genome Cores, Gene Essence, Scrap — a
small taste (~10% of the reserve) and a bulk lot (~25%), refreshing every **30 minutes**.

- **Reserve-scaled pricing:** lots are priced from the Ichor reserve SNAPSHOT taken when
  the window first rolls (mid-window spends never re-price the board). At 10 Ichor the
  lots read "1 Ichor → 10 Genome Cores / 1 Ichor → 1 Scrap"; at 1000 they read
  "≈250 Ichor → ≈50 Scrap".
- **Anti-snowball curve:** volume is SUBLINEAR (`qty = rate₀ × cost^0.7`, ±15% seeded
  jitter, +10% bulk sweetener) — a whale's mega-trade pays a leaner per-Ichor rate than a
  pocket trade, so hoarded Ichor accelerates the grind but never breaks the economy.
  Rate anchors (per-Ichor at pocket size): **10 cores · 6 essence · 1 scrap** — derived
  from expedition bundle parities and the Bio-Roulette pod weights.
- **One trade per lot per window;** the max-window rule mirrors the market stock (a
  rolled-back clock cannot forge fresh lots). Ichor itself stays never-farmable — the
  exchange only spends it.
