# MARKET CONSTRUCTS — the game's own AI players

> Owner request (2026-11-06): "5–10 bot accounts that just grind the game and actually play and engage
> and stimulate the auction house… playing nonstop." Owner decisions: **always labelled as bots**, run on
> a **scheduled Cloudflare Worker**, **auction + activity only — never on a leaderboard**.

Code: `src/core/constructs.ts` (roster, tunables, every trading decision — pure), `workers/constructs/`
(`engine.ts` one tick · `router.ts` the wire · `roster.ts` the scheduled loop · `index.ts` the Worker ·
`wrangler.toml`), `migrations/0009_constructs.sql`, the ⚙ chip in `src/ui/AuctionHouse.tsx`.

## The roster

Eight constructs (`CONSTRUCTS`): a fixed id, a name, a **trader style** (fair / bargain / collector /
clearer) and a **play style** (a progression-simulator persona: average, efficient, completionist…).
Ids are UUID-shaped (the API's `isPlayerId`) but **version 0** — `crypto.randomUUID()` (every real
client id) is always version 4, so no player can ever hold or spoof one. `isConstructId(id)` is the one
test the client labels by and the server refuses by.

## How a construct plays (§tick)

A Cron Trigger fires every 5 minutes; `runRoster` ticks every construct once, strictly one at a time
(the meta layer is a singleton over one save):

1. **Load** its save from its own `cloud_saves` slot via `GET /api/save` (a missing slot ⇒ a fresh account).
2. **Play** the wall time it is owed: `playVirtualRun` (src/dev/progressionSim.ts — the same virtual
   player the progression report uses) picks the run the progression loop asks for, feeds a MODELED
   battle result (waves, kills, duration — the calibrated `WORLD` constants) through the REAL meta
   layer (settlement, loot, containers, the spend pass). **Pace is real time**: a play-credit balance in
   the roster row means it plays exactly as many seconds as the clock gives it — nonstop, never faster;
   an outage is not binged (`maxCatchUpSec` 1 h, `maxRunsPerTick` 12).
3. **Visit the market** every half hour (`marketEveryMs`) — the player client's flow step for step.
4. **Commit** the save via `PUT /api/save` (the sync engine's envelope + headline).

Measured: a fresh construct reaches ~stage 20 in its first two hours and ~stage 150 after two weeks of
nonstop play; a late-game run costs ~0.2 s CPU; a two-week save is ~72 KB (cap 256 KB).

## How a construct trades (§market)

Through `router.ts`: the EXACT Pages Function handlers a browser reaches over HTTP, invoked in-process on
the same D1 — eligibility, fees, custody, rate limits, the fraud audit and money conservation apply
unchanged. The router is an **allowlist** (its save slot + `/api/auction/*`); leaderboards, the Arena,
analytics, accounts and the store are unroutable, and the Worker refuses every stray `fetch`.

| Step | Rule (src/core/constructs.ts) |
|---|---|
| Deliveries | reconcile custody, deliver pending items into the save and ack them at once (like the client) |
| Deposit | top the wallet up to `walletTarget` (400) from its OWN earned Ichor, ≤ `maxDepositPerDay` (600); opens before trading is allowed (the wallet's first touch starts the market-age clock) |
| Gate | the player's gate: Campaign Stage ≥ 10 AND market age ≥ 3 days |
| Withdraw | proceeds above `withdrawAbove` (2 000) go back to the save (they feed its progression) |
| Sell | one listing per visit at `listChance` 0.2, ≤ `maxListingsPerDay` 6, ≤ `maxPerFamily` 2 live per family; ask = recommended × style band (≥ 0.9×, ≤ 1.25×); a COLD family (no history, nothing listed) is priced from `HOST.defaultGuide` by rarity, never the bare floor; collectors keep rare+ |
| Shop | players' listings only (`shoppable`: never another construct, never authority stock, never itself); buy-now ≤ worth (value × ≤ 1.1) and ≤ half the wallet; bids only up to worth (no bid wars); ≤ 4 buys + 4 bids a day |

**Commit order never mints:** server-side moves (escrow, withdrawals, buys/bids, delivery acks) precede
the save commit; the deposit is spent locally, committed, THEN credited (a refusal refunds and
re-commits). A failed commit discards the tick's local changes and leaves the pacing untouched (the next
tick replays the owed time) — an acked-but-uncommitted delivery is LOST, never duplicated (re-delivering
equipment would mint a copy under a fresh uid). **One tick at a time:** each tick runs under a
compare-and-set lease (`lease_until`, 4 min) — overlapping cron runs can never tick one construct twice
(both would credit a deposit while only one save survives).

## Fairness + transparency

- **Labelled everywhere:** ⚙ CONSTRUCT on listing cards, the listing sheet (seller name + a line), a
  Construct's leading bid, and your trade history; Help → **Constructs**; the Auction House help text.
- **Never ranks:** `/api/leaderboard/submit` and `/api/arena/report` return 403 `construct`, and the
  router cannot reach them.
- **Economy:** they only sell what they earned and spend what they earned; they sell AT the market and
  buy AT OR BELOW value; they never trade with each other. `npm run sim:market` scenario "constructs (8 AI
  players, nonstop)" drives the SAME decision functions beside a player base: money conserved, prices
  flat (basket ×1.0), more sales and fewer stale listings than without them, zero construct↔construct
  trades, zero fraud flags implicating a construct.
- **Moderation feed:** `auditMarket` exempts construct pairs from `selfDealing` (a construct is every
  player's counterparty by design and cannot collude); item-chain signals still see their trades.

## Operating it

- **Deploy:** the `constructs` job in `.github/workflows/deploy.yml` (after the site, production releases
  only) applies the idempotent `0007_auction.sql` + `0009_constructs.sql` and runs
  `wrangler deploy -c workers/constructs/wrangler.toml`. **Needs the Workers Paid plan** (the cron runs
  real progression code — far above the free tier's 10 ms CPU) and an API token with **Workers
  Scripts: Edit**. Its failure never affects the site.
- **Pause:** set the Worker var `CONSTRUCTS_ENABLED=off` (dashboard or `wrangler.toml`).
- **Watch:** `GET https://assimilate-constructs.<subdomain>.workers.dev/status` (no credentials) and
  Workers Logs (one JSON line per construct per tick).
- **Tune:** `CONSTRUCT` in src/core/constructs.ts; add a construct = one `CONSTRUCTS` row (it is
  provisioned on the next tick).

## Known limitations

- A run's BATTLE is modeled, not simulated tick by tick (the progression simulator's calibrated world
  model); everything the run feeds is production code. Playing real `Game` sims would cost ~100× CPU.
- Constructs reach the market only after three days (the player account-age gate), so the board fills
  in on day 3 after the first deploy.
- `HOST.defaultGuide` stops at rare: a cold epic/legendary family is neither listed nor bought by a
  construct until players give it a price.
- The endpoint's own recommendation for a cold family is the bare floor (20) whatever the rarity — a
  market-wide quirk players also see; constructs work around it, the sell dialog does not yet.
