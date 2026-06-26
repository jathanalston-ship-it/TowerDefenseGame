# BALANCE-LOG.md — Progression & Economy Balance Changes

One section per balance pass. Each documents **what was reviewed**, **what was
found** (bottlenecks / dead zones), **what changed** (with the before→after
numbers), and **what was deliberately left alone and why**. This is the
companion to `docs/ECONOMY.md` (reward formulas) and `docs/PROGRESSION.md` (the
long-term design spec) — those say *what the systems are*; this says *what we
tuned and the reasoning*.

> **Anti-grind stance (read first).** "Adjust pacing" never means "raise costs."
> The default move is to **add a sink or smooth a curve**, not to inflate the
> grind. Every cost increase in this log must name the dead zone or runaway it
> closes; absent that, numbers are left untouched.

---

## 2026-06-26 — Progression review pass (every permanent system)

### Scope

Reviewed all implemented permanent-progression systems against the design intent
in `PROGRESSION.md`: **shards, mastery, equipment, prestige, rewards, cards**,
plus the **stars** concept (per-stage rating). Goal: find bottlenecks and dead
zones, fix pacing for long-term retention, **without adding pointless grind**.

### Audit — current implemented state

| System | Currency | Source (mode) | Sink | Status before pass |
|---|---|---|---|---|
| **Core power** (4 nodes) | Shards | Classic + Stage | Core track | ✅ healthy |
| **Mastery** (3 nodes) | Essence | Endless | Mastery track | ✅ healthy |
| **Equipment** (3 nodes) | Components | Stage clears | Equipment track | ✅ healthy |
| **Prestige** | Catalyst | Endless depth (⌊wave/10⌋) | — | ❌ **DEAD: no sink** |
| **Rewards** | — | per-mode formulas | — | ✅ (see ECONOMY.md) |
| **Cards** (30) | — | drafted in-run | resets each run | ✅ healthy |
| **Stars** (per-stage rating) | — | — | — | ⚪ not implemented (deferred) |

### Bottlenecks identified

- **None requiring a cost cut.** Early shard income is healthy: a first Classic
  run to ~wave 8 pays **~88 shards**; the cheapest Core node is **25** — a node
  on the first run, not a wall. Stage runs pay far more (**~270 shards** at
  wave 9 won + objective), so a Stage-leaning player ramps Core fast. No early
  pinch to relieve.
- **Mode→track coverage was uneven** (a soft bottleneck for mode-loyal players):
  before this pass Endless funded only Mastery with a *spendable* currency —
  its Catalyst was orphaned (below). Classic still funds only Core (acceptable:
  Classic is the baseline/on-ramp mode; Stage and Endless are the mains).

### Dead zones identified

1. **Catalyst had no sink (the big one).** Endless minted Catalyst by depth
   (⌊wave/10⌋) but **nothing consumed it** — a "prestige currency" with no
   prestige. Deep Endless runs produced a number that did nothing. This is the
   single clearest dead zone in the economy.
2. **Post-max cliff (mitigated, not yet eliminated).** All four tracks are
   capped, so a completionist eventually has no sink. This pass pushes that
   horizon far out (Prestige is a slow ⌊wave/10⌋-fed climb) and the *durable*
   answer — non-power goals (collection, codex, achievements, titles) — is the
   subject of the next pass (`PROGRESSION.md` long-term goals). Tracked here so
   it isn't forgotten.

### Changes made

**Added the Prestige track (Catalyst sink) — closes dead zone #1.**

- New `PRESTIGE_UPGRADES` in `src/core/config.ts` (data-driven, same `UpgradeDef`
  shape as the other tracks — one entry each, folds into `MetaModifiers` via
  `apply`). `'catalyst'` is now a first-class `Currency`; `meta.tracks.prestige`
  and a fourth MetaShop panel surface it.

  | Node | Effect / level | Max | baseCost | costMult | Maxed cost |
  |---|---|---|---|---|---|
  | Viral Apex | +5% tower **&** hero damage | 10 | 2 | 1.35 | 110 |
  | Living Bastion | +35 max Integrity | 10 | 2 | 1.35 | 110 |
  | Hypermetabolism | +12% biomass income | 8 | 2 | 1.35 | 58 |

  Design: **premium, global, dual-stat** nodes (distinct from Core's single-stat
  Shard tree) so Prestige *feels* like prestige. Catalyst is rare, so absolute
  costs are tiny (first node = 2 Catalyst ≈ one wave-20 Endless run) but the
  geometric climb makes a full track **~278 Catalyst ≈ 90–140 deep Endless runs**
  — a genuine "forever" lean, not a weekend.

- **No existing cost or reward changed.** This pass *only adds a sink*; it does
  not inflate any curve (per the anti-grind stance above).

### Pacing reference (cumulative cost → runs-to-max)

| Track | Currency | Total to max | Typical yield/run | ≈ Runs to max |
|---|---|---|---|---|
| Core | Shards | 12,997 | ~150 (mixed), ~270 (Stage) | ~50–90 |
| Mastery | Essence | 3,323 | ~195 (Endless w25) | ~17 |
| Equipment | Components | 2,278 | ~12 (Stage 3) → ~50 (Stage 20) | ~45–100 |
| Prestige | Catalyst | 278 | ~2–4 (Endless depth) | ~90–140 |

Mastery is intentionally the *fastest* track to fill (Endless rewards depth
generously) and Prestige the *slowest* (the trophy climb). Core sits in the
middle as the shared Stage/Classic spine. The spread means **whatever you play,
a track is visibly moving**, and no single track maxes so fast it leaves its mode
without a goal within a session.

### Deliberately unchanged (and why)

- **Reward formulas** (ECONOMY.md) — verified consistent with the per-mode intent
  from the reward pass; no change.
- **Card pool / draft weights** — the run bucket is the *renewable* excitement
  layer (resets each run); it isn't a permanent-progression dead zone, so it's
  out of scope for a *permanent*-pacing pass.
- **Track caps** — kept finite. Uncapped/logarithmic "Paragon"-style nodes are a
  `PROGRESSION.md` prestige-layer feature; forcing them into the capped
  `UpgradeDef` shape would either break anti-inflation (linear `apply` × ∞) or
  need a parallel system. Deferred to the dedicated prestige-layer work, not
  bodged in here.

### Verification

`npm run typecheck` clean; `npx vitest run` green (incl. a new
`meta.test.ts` case proving Catalyst earned in Endless is now spendable on
Prestige and leaves other currencies untouched).
