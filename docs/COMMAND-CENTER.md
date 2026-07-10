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

The shell (`CommandCenter.tsx`) renders fixed **zones** top-to-bottom; each zone renders
whatever `homeRegistry.zone(save, zone)` yields, in `order`, honoring per-widget `when`
guards (a fresh account's board stays calm — no empty panels).

| Zone | Launch widgets |
|---|---|
| `strip` | `vitals` — the command strip: Power / Campaign / Infinite / Collection / Champions / Vaults / Achievements, **every chip a door** (the nearest goal is deliberately absent — the NEXT banner owns it) |
| `world` | `world-status` — the living centerpiece (§2) |
| `main` | `mission-control` FIRST (the deploy decision leads the board), then `next-goal` (the single nearest goal), `live-events`, `contracts` |
| `side` | `forecast` (PredictionPanel; hidden until the first run), `roadmap` (§3 — goals **behind** the banner's) |
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
