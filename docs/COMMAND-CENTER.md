# COMMAND CENTER — the living bio-organic home

> The Home screen is not a menu; it is the bridge of an evolving war organism. Everything on
> it is a door (every vital clickable), everything on it is alive (the world breathes, the
> army pulses), and everything on it is **registry-driven** — a future system earns a home
> presence with one registration, never shell surgery. Canonical reference for the board's
> architecture; the ambient lab behind it is docs/HOME-BASE.md, the one-more-run loop
> surfacing is docs/ONE-MORE-RUN.md + docs/PROGRESSION-LOOP.md.

Files: `src/ui/homeModel.ts` (pure read-models + `homeRegistry`) · `src/ui/CommandCenter.tsx`
(the shell + widget renderers) · `src/ui/WorldStatus.tsx` (the canvas centerpiece) ·
`src/ui/ProgressDashboard.tsx`, `src/ui/NextGoalBanner.tsx`, `src/ui/PredictionPanel.tsx`
(reused as widgets). Tests: `src/ui/homeModel.test.ts`.

---

## 1. Architecture — zones × registry × renderers

The shell (`CommandCenter.tsx`) renders fixed **zones** top-to-bottom — `strip` → the
`main`|`side` row → `world` → `army` → `ops` → `feed` → `foot`; each zone renders whatever
`homeRegistry.zone(save, zone)` yields, in `order`, honoring per-widget `when` guards (a fresh
account's board stays calm — no empty panels).

**§zones — the primary CTA is above the fold (2026-11).** The deploy row LEADS the 190px World
Status visual (it used to sit above it, pushing Continue Campaign to y≈720/900 — cut off at
1366×768, two screens down at 844×390). On landscape phones (`data-layout="landscape"`) the row
also leads the live-event banner and Mission Control lists its deploy button straight under the
stage header (fact tiles + reward chips drop below). `scripts/mobilecheck.ts` asserts it
(`homeCtaContract`): the developed Home's `.mc-deploy` is fully inside the viewport at scroll 0
on every landscape/desktop viewport (portrait hubs sit under the rotate gate). Measured:
y 720→516 at 1440×900 and 1366×768, 771→214 at 844×390.

**§cta — the main button follows the farm/push loop (2026-11, Batch G).** The G2 audit found
Home's main button at depth reading "Fight anyway — recommended Power not met" while the "Farm
Infinite ~Depth 93" directive appeared only on Results/Campaign/Infinite/Profile. Now, when the
frontier band is genuinely `'under'` (docs/PROGRESSION-LOOP.md §readiness) AND Infinite is open,
Mission Control's PRIMARY (`.mc-deploy.is-farm`, still the above-the-fold contract's element)
is **"Farm Infinite ~Depth N"** (`loopState.farmDepth`) with one line under it — the frontier's
readiness %, the readiness ONE run gains at the live income (`readiness × (e^g − 1)`, g = the
income ledger's per-run ln-Power growth — state/income.ts) and the stage ETA (`runsToStage`);
the gain + ETA only speak once the ledger has OBSERVED `INCOME.priorRuns` runs (a migrated
veteran's lifetime-average prior over-states depth growth) — and the frontier fight steps down
to a secondary "Fight Stage N anyway ▸" (same title tooltip,
same partial-field-data note). `'close'`/`'ready'` keep "Continue Campaign"; before Infinite
opens the old under-ready button stays (farm advice never names a sealed mode).

| Zone | Launch widgets |
|---|---|
| `strip` | `vitals` — the command strip: Power / Campaign / Infinite / Collection / Champions / Vaults / Achievements, **every chip a door** (the nearest goal is deliberately absent — the NEXT banner owns it) |
| `main` | `mission-control` FIRST (the deploy decision leads the board), then `next-goal` (the single nearest goal), `live-events`, `contracts` |
| `side` | `recommend` (the Ready Chain, then Recommended Now — which never repeats a chain stop: one fact, one owner), `forecast` (PredictionPanel; hidden until the first run — its lever lines carry a "Go ▸"), `roadmap` (§3 — goals **behind** the banner's) |
| `world` | `world-status` — the living centerpiece (§2), rendered BELOW the deploy row (§zones) |
| `army` | `army` — the live roster (§4) |
| `ops` | `modes` — Infinite / Boss Rush / Daily / Quick Skirmish (mirrors the nav's Play group), then `infestation` (the conquest map rides with operations, never above the deploy button; **collapses to a one-line teaser while `view.dormant`** — docs/INFESTATION.md §map) |
| `feed` | `command-feed` (§5; hidden until history exists), `dashboard` (claim cards: Vault / Tower Evolution / Equipment / Collection) |
| `foot` | `tip` — the one-line teacher |

**Adding a widget** = `homeRegistry.register({ id, zone, order, when? })` in `homeModel.ts`
(or from the future system's own module) **+ one renderer entry** in `CommandCenter.tsx`'s
`WIDGETS` map. The shell, zones and CSS never change. Unknown ids render nothing (a widget
without its renderer is inert, never a crash). `main`+`side` share a responsive row
(mission | rail) that stacks under 900px.

### The home view-model — one fact, one value

`buildHomeView(save)` computes **every number the board shows once per save change**
(memoized in the shell, handed to every renderer as `ctx.view`): the Power fold, the
campaign frontier (`homeFrontier` — stage, generated config, recommendation, readiness,
first-clear payout), the `nextGoals` queue, the canonical codex completion, vault count and
the `WorldStatusView`. Widgets read slices of the view instead of re-deriving models — that
is the coherence contract (the pre-overhaul board computed `nextGoals` three times and
showed two different Collection percentages) and the perf contract (one `generateStage`,
one Power fold per save change). **Collection on home surfaces is `CollectionView.pct`**
(discovery — the number the Collection screen leads with), never the rank-weighted
`.completion`.

## 2. World Status — the living centerpiece

`worldStatus(save)` (pure) folds the account into an organism: the **era** (NASCENT →
ASCENDANT via `homeBaseTiers.labScore/labEra` — the same development model the lab
atmosphere uses), ambient **intensity**, campaign stage / best wave / molts / Power,
frontier biome, and one **organ per OWNED strain** (color, Stars, Adaptation FORM stage) —
dormant (shard-gated, unsynthesized) strains are not part of the organism yet.

`WorldStatus.tsx` renders it (as a `ws` prop — a slice of the home view-model) as one rAF
canvas: a wobbling membrane nucleus that grows with the era (molts add faint shells; the
iris glows gold when Power meets the campaign frontier's recommendation — "PRIMED FOR
DESCENT"), one orbiting organelle per strain (size = Stars, viral rings = FORM stages), a
drifting DNA helix, and a spore field whose density follows intensity. The HTML overlay
carries only what no other widget shows — era, readiness posture, next-descent biome; the
numbers themselves live in the command strip. The canvas dies with the component, **pauses
while the tab is hidden** (visibilitychange), and renders a single still frame under
`prefers-reduced-motion`; spore count tops out ~84.

## 3. Unlock roadmap

`view.goals` (state/nextGoal.ts — the ONE-MORE-RUN engine, computed once in the view-model)
split across two surfaces without overlap: the NEXT banner owns `goals[0]`; the side
roadmap renders `goals[1..4]` as a "COMING UP" rail of conic progress rings — the next hero
release / evolution / prestige / collection / campaign gate, each with % complete, "N to
go", and a deep link. One goal, one surface.

## 4. Live army

`armyView(save)` (pure): every strain (Stars · Mastery level · FORM stage; a dormant
shard-gated strain shows 🔒 via `isTowerUnlocked`, dimmed like a locked champion) and every
champion (unlocked / FIELDED / reserve), each chip tinted its class hue and linking to its
lab. The FORM ring on a strain's orb mirrors its battlefield Adaptation stage.

## 5. Command feed

`commandFeed(save, now, 8)`: the save's **timeline** (v22 — molts, releases, stage records,
achievements pushed by the meta layer, cap 60) newest-first with human recency labels
(`agoLabel`). Hidden until the first milestone lands.

## 6. Invariants (tests pin these)

1. Every model is total on a FRESH save (no crashes, no dead panels — `when` guards hide
   empty widgets instead).
2. `worldStatus` organs cover exactly the OWNED tower roster; FORM stages mirror
   `adaptVisualTier`.
3. `commandFeed` sorts newest-first and speaks human recency at all scales.
4. `armyView` covers the full roster with faithful unlock/fielded state for heroes AND
   towers (dormant strains locked, never fielded).
5. The registry is OPEN (registering a widget surfaces it in zone order) and `when` guards
   are honored per-save.
