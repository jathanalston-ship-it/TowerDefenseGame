# ANALYTICS.md — Player Telemetry, Analytics & Developer Intelligence

The unified gameplay-intelligence platform: every practical signal a live-service game needs,
riding ONE event architecture, folded into bounded rollups, surfaced as automatic insights,
and read through a separate downloadable desktop dev app. Privacy is a design input, not an
afterthought: pseudonymous ids only, Guest Mode sends nothing, one Settings switch turns the
whole lane off, and the server never stores more than the registry declares.

> The legacy anonymous counter beacon (`net/events.ts` → `/api/events` → `analytics_counters`)
> is a SEPARATE lane with a separate promise — aggregate counts with no player association.
> It stays untouched; nothing here replaces it.

---

## §events — the unified event registry (`src/core/analyticsEvents.ts`)

**One registry row IS the whole contract for an event.** `AN_EVENTS` declares, per kind:

| Field | Meaning |
|---|---|
| `kind` | wire token (`run_end`, `tw_win`, `err`, …) |
| `dim` | dimension contract: `none` or `token` (bounded machine token, `AN_LIMITS.dimPattern`) |
| `value` | optional integer bounds `{min,max}` — anything outside is rejected |
| `rollup` | server writes daily aggregate rows for it |
| `durable` | raw row survives pruning (player timelines read these) — else pruned after `rawDays` |
| `extras` | allowlisted extra keys (strings length-capped, numbers bounded) |
| `sample` | client session-sampling rate (e.g. FPS summaries ride 50% of sessions) |

The client emitter validates against the row (dev builds warn), the server ingest validates
against the SAME row (authoritative), the rollup router derives its writes from it, and the
stress sims fuzz it. **Adding a future event = one row here + one `telemetry.emit(...)` call.**
Nothing else — no schema change, no server change, no dashboard change (generic series
explorers pick the new kind up automatically).

**Wire shape (bandwidth-first).** A batch carries shared context once — `playerId`, `session`,
`platform`, `ver` (app version), `lang`, `power` (Power Score), `stage` (highest campaign
stage) — and each event carries only `{k, at, sc?, md?, d?, v?, x?}` (kind, time, screen, mode,
dim, value, extras). Region and device class are derived SERVER-side from the request
(`request.cf.country`, User-Agent class) — never client-claimed.

**Hot signals never leave raw** (the performance contract):
- **FPS** — a 61-bucket histogram (`FpsAccumulator`); one `fps` summary event per session
  (avg/p01/p99 ×10). Emitting is `buckets[fps]++`.
- **Interaction heat** — pointerdowns fold into a 12×8 grid per screen (`heatCell`); a whole
  session's heatmap is a few dozen counters flushed as `heat` events.
- **Currency flows** — `FlowFold` maps (`currency:source` → summed amount) drained as a handful
  of `cur_gain` / `cur_spend` events per flush.
- **Errors** — deduped by a stable djb2 hash (`errorHash`); the dim is the hash, extras carry a
  truncated message/stack head.
- **Loss locations** — waves band into `w1-5`, `w6-10`, … (`waveBand`); campaign losses pin the
  stage (`campaign:c12`) so dims stay bounded at any content scale.

The launch taxonomy (~37 kinds) covers: sessions & retention (`ses_start/ses_ping/ses_end`,
`quit_loc`), screens (`nav` with dwell, `heat`, `notif`, `tut`), runs & progression
(`run_start/run_end/run_loss/run_quit`, `stage_clear`, `power`, `xp`, `rank`, `unlock`),
loadout usage (`tw_field/tw_win/tw_up/tw_strain`, `hero_pick/hero_win`, `ability`,
`equip_use`, `mull_use`, `gene_use`), economy (`box_open`, `loot_rare`, `cur_gain/cur_spend`,
`idle_collect`), health (`fps`, `load`, `net`, `err`), money (`buy`, `ad`), and experiments
(`ab_assign`).

## §client — the telemetry pipe (`src/net/telemetry.ts`)

Design contract:
- **Extremely cheap at emit time**: push-to-array or fold-into-counter. Nothing synchronous
  ever touches the network or storage on the hot path.
- **Batched + fail-soft**: flushes every `AN_LIMITS.flushSec` via `fetch` keepalive to
  `POST /api/an/ingest`; `pagehide` drains through `navigator.sendBeacon`; a failed flush
  parks in a small localStorage outbox (`assimilation.an.outbox`, max 3 batches) and retries
  next session. A telemetry problem can never touch play — every path swallows.
- **Auto-context**: `telemetry.start({power, stage})` boots the pipe once (App); providers keep
  `meta` out of the module (no import cycles). `emit(kind, rest)` stamps screen + mode
  automatically. Emitting from a new surface is ONE line.
- **Backpressure**: the queue caps at 200 events; overflow evicts the oldest NON-durable event
  first, so `buy`/`err`/`run_end` survive a burst.
- **Oversize valve**: a batch that would exceed `batchBytes` (24 KB) is dropped, never wedged.

Instrumented chokepoints (each is 1–3 lines at an existing seam):

| Signal | Seam |
|---|---|
| session start/end/heartbeat, quit screen, net band, global errors, tap heat | inside `telemetry.start()` (window listeners) |
| screen views + dwell + badge-drawn clicks (`notif …:act`) | `Hub.go()` |
| run summary + usage lanes (towers/hero/genes/equipment/mulligans) + `run_loss` + `power` | `App.handleEnd` → `emitRunTelemetry()` |
| `run_start` / `run_quit` / mode stamps | `App` screen effect, `begin()`, `handleAbandon(wave)` |
| `stage_clear` (first clears only) | `App.handleEnd` (prev-cleared read before `finishRun`) |
| FPS histogram | GameView rAF loop (`fpsTick(dt)`) |
| `ability` (arm transitions) | Toolbar button + GameView Q hotkey |
| ALL currency gains + `loot_rare` | ONE `rewardToast.tap()` subscription — every reward source announces on the toast bus, so telemetry inherits every current and future gain for free |
| spends (`cores:upgrade`, `tshards:star`, `hshards:star/prime`, `essence:gene`) | balance-delta folds at the four lab buy handlers |
| `box_open` | Genetic Vault crack (per rarity band) |
| `idle_collect` | Harvest collect (banked hours ×10) |
| `buy` (verified purchases, cents) | `net/checkout.ts` claim — the one door all real purchases pass |
| `ad` (`placement:start/complete/abort`) | Field Research study + Battle Pass free-level |
| `tut` steps + `abandon:step` | TutorialRunner checkpoint tracking |
| `unlock` / `rank` | Hub reveal latch / Genome promotion cinematic |

## §privacy

- **Pseudonymous only.** The player id is the game's existing random account UUID. No names,
  emails, or free text ever ride an event — dims are machine tokens, extras are allowlisted
  and length-capped, and the server rejects anything outside the registry.
- **Guest Mode sends nothing.** The tryout is silent on every network lane, this one included.
- **One switch.** Settings → "Gameplay Analytics" (`assimilation.an.optout`): off drops the
  queue, clears all folds, and sends nothing further. Default on, honestly labeled.
- **Server-derived region only** — coarse country code from the edge, never geolocation.
- **Deletion lane.** The existing cloud-data deletion (`DELETE /api/save`) also purges the
  player's analytics rows (events, sessions, activity, player row) — one door for "forget me."
- **Bounded retention.** Raw non-durable rows prune after `rawDays` (30); durable rows after
  `durableDays` (400); rollups are aggregates with no per-player data.

## §insights — automatic conclusions (`src/core/analyticsInsights.ts`)

A pure module (shared by the dev API and the desktop app) that turns daily rollup rows into
**ranked findings** with real statistics — two-proportion z-tests, `|z| ≥ 1.96` marks
`significant`, minimum-sample guards keep small n silent instead of lying:

- `tower-worst` / `tower-best` — win-rate outliers vs the pooled baseline (`tw_field` vs `tw_win`)
- `hero-worst` / `hero-ignored` — same test for heroes + pick-share starvation
- `abandon-hotspot` — loss+quit concentration by location (action-severity past 20% share)
- `funnel-cliff` — the campaign stage where consecutive clear-counts drop hardest
- `exit-screen` — screens players disproportionately quit from (`quit_loc` vs `nav` share)
- `skipped-screen` — known screens with the least traffic
- `notif-ignored` — badge channels with the worst act rates
- `tutorial-abandon` — the step players leave the tutorial on
- `economy-bottleneck` — currencies whose spend outpaces earn (coverage < 0.9)
- `top-bundle`, `retention-d1`, `error-rate`
- `patchImpact(rows, kind, dim, verA, verB)` — version-over-version rate shift with a z-score
  (rollups keep a per-version split precisely for this)

Findings rank action → watch → info; every finding carries its sample size.

## §ab — experiments & remote config (`src/core/remoteConfig.ts`)

- **The whitelist is the determinism firewall.** The server serves one sanitized document
  (flags/numbers/experiments); the client applies it through `sanitizeRemoteConfig`: unknown
  keys DROP, numbers CLAMP to declared bounds, and every key must live in a
  `ui./meta./store./market./an.` namespace — **nothing remote can ever feed the deterministic
  sim, replays, or goldens** (enforced by `remoteConfigProblems()` in the test suite).
- **Deterministic assignment.** `bucketFor(playerId, exp)` = FNV-1a(`playerId|salt`) % 10000 →
  cumulative pct slices → bucket id ('control' outside every slice). Same player ⇒ same bucket
  on every device with zero server round-trips; change the salt to reshuffle. The bucket is
  emitted once as `ab_assign`, so every dashboard series can segment by experiment.

## §server — ingest, rollups, dev API (functions/api/an/*, functions/api/dev/*)

- `POST /api/an/ingest` validates the batch against the SAME shared registry, enriches region
  server-side, upserts daily rollups (`day, kind, dim, ver → n, sum, sum²`), maintains
  session/player/activity rows, dedupes errors by hash, rate-limits per player, and caps the
  body at 24 KB. Rejected batches return 400 — the client treats that as done, not retryable.
- **Storage stays bounded by design**: rollup cardinality = kinds × dims × versions × days —
  independent of player count. Raw rows prune on the retention windows above. That's the whole
  scale story: 10 or 100,000 players write the same number of rollup rows per day.
- `GET /api/dev/*` (overview, series, insights, player timeline, errors, export, flags) is
  gated by the `DEV_KEY` secret header. `GET /api/config` serves the sanitized public remote-
  config document.

## §devapp — the desktop developer app (`devapp/`)

A **downloadable Electron desktop application**, deliberately separate from the game and the
website: its own subproject (`devapp/package.json`), never part of the Vite build, never
deployed to Pages. It talks to the production API with the `DEV_KEY` you configure on first
launch. Build locally: `cd devapp && npm install && npm run dist` (installers land in
`devapp/dist/`); `npm start` runs it unpackaged. Binaries are never committed.

Surfaces: live overview (players now, DAU/WAU/MAU, revenue, crash rate), retention cohorts,
campaign funnels, a generic series explorer over every event kind, balance tables
(towers/heroes/genes/equipment/mulligans) with significance badges, economy flow graphs,
screen heatmaps, the automatic insights feed, per-player timelines (durable events), the error
log, patch impact comparisons, and CSV/JSON export of any view.

## §scale — validated bounds (`npm run sim:analytics`)

The stress simulation drives synthetic populations of **10 / 100 / 1,000 / 10,000 / 100,000
players** (7 synthetic days each) through the real pipeline pieces — client-shaped sessions
under `AN_LIMITS`, `acceptBatch` validation, `foldRollups` — and fails the run if any scale
law breaks. Measured (deterministic seed, single thread):

| Players | Sessions | Events | Max batch | Rollup rows | Validate+fold |
|---:|---:|---:|---:|---:|---:|
| 10 | 28 | 1,181 | 4.1 KB | 504 | ~150k ev/s |
| 100 | 261 | 11,839 | 4.5 KB | 1,604 | ~226k ev/s |
| 1,000 | 2,676 | 121,244 | 4.6 KB | 5,125 | ~273k ev/s |
| 10,000 | 26,724 | 1,211,182 | 4.6 KB | 6,251 | ~336k ev/s |
| 100,000 | 264,996 | 12,026,230 | 4.7 KB | **6,272** | ~340k ev/s |

The laws the run asserts: every batch under the 24 KB wire budget (worst seen 4.7 KB); rollup
rows population-independent (1k → 5,125 vs 100k → 6,272 — the small growth is rare dims
filling in, not population); validation throughput > 50k events/s single-thread; 100k-shaped
`computeInsights` < 250 ms (measured ~4 ms); synthetic cohort D1 recovered exactly as seeded.

## Extension points

- **New event**: one `AN_EVENTS` row + one `emit` call (screens/modes/context ride free).
- **New insight**: one function in `analyticsInsights.ts` pushing `Finding`s — the API and the
  desktop feed render it with zero further wiring.
- **New remote flag/number**: one `REMOTE_FLAGS`/`REMOTE_NUMBERS` row (bounds mandatory).
- **New reward source**: nothing — the toast-bus tap inherits it.

## Known limitations

- `ability` counts manual arm transitions (button/hotkey), not autocast volleys — engagement
  signal, not total casts (the sim stays telemetry-free by design).
- Spend folds cover the four primary sinks; niche sinks (reforge, transcend, exchange lots)
  can adopt the same 2-line balance-delta pattern as wanted.
- Client-side `ab_assign` emission activates with the remote-config fetch lane (`/api/config`
  consumption) — assignment math itself is live and tested.
