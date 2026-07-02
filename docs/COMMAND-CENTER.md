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
| `strip` | `vitals` — the command strip: Power / Campaign / Infinite / Collection / Champions / Vaults / Next unlock / Achievements, **every chip a door** |
| `world` | `world-status` — the living centerpiece (§2) |
| `main` | `next-goal` (anticipation banner), `mission-control` (CONTINUE CAMPAIGN dominates) |
| `side` | `forecast` (PredictionPanel; hidden until the first run), `roadmap` (§3) |
| `army` | `army` — the live roster (§4) |
| `ops` | `modes` — Infinite / Quick Skirmish (+ FEATURES-flagged future modes) |
| `feed` | `command-feed` (§5; hidden until history exists), `dashboard` (system momentum cards) |
| `foot` | `tip` — the one-line teacher |

**Adding a widget** = `homeRegistry.register({ id, zone, order, when? })` in `homeModel.ts`
(or from the future system's own module) **+ one renderer entry** in `CommandCenter.tsx`'s
`WIDGETS` map. The shell, zones and CSS never change. Unknown ids render nothing (a widget
without its renderer is inert, never a crash). `main`+`side` share a responsive row
(mission | rail) that stacks under 900px.

## 2. World Status — the living centerpiece

`worldStatus(save)` (pure) folds the account into an organism: the **era** (NASCENT →
ASCENDANT via `homeBaseTiers.labScore/labEra` — the same development model the lab
atmosphere uses), ambient **intensity**, campaign stage / best wave / molts / Power,
frontier biome, and one **organ per strain** (color, Stars, Adaptation FORM stage).

`WorldStatus.tsx` renders it as one rAF canvas: a wobbling membrane nucleus that grows with
the era (molts add faint shells; the iris glows gold when Power meets the campaign
frontier's recommendation — "PRIMED FOR DESCENT"), one orbiting organelle per strain
(size = Stars, viral rings = FORM stages), a drifting DNA helix, and a spore field whose
density follows intensity. HTML overlays carry the vitals (crisp text). The canvas dies
with the component; spore count tops out ~84; `prefers-reduced-motion` stills the CSS
layer (the canvas stays subtle by construction).

## 3. Unlock roadmap

`nextGoals(save, 4)` (state/nextGoal.ts — the ONE-MORE-RUN engine) rendered as a rail of
conic progress rings: the next hero release / evolution / prestige / collection / campaign
gate, each with % complete, "N to go", and a deep link.

## 4. Live army

`armyView(save)` (pure): every strain (Stars · Mastery level · FORM stage) and every
champion (unlocked / FIELDED / reserve), each chip tinted its class hue and linking to its
lab. The FORM ring on a strain's orb mirrors its battlefield Adaptation stage.

## 5. Command feed

`commandFeed(save, now, 8)`: the save's **timeline** (v22 — molts, releases, stage records,
achievements pushed by the meta layer, cap 60) newest-first with human recency labels
(`agoLabel`). Hidden until the first milestone lands.

## 6. Invariants (tests pin these)

1. Every model is total on a FRESH save (no crashes, no dead panels — `when` guards hide
   empty widgets instead).
2. `worldStatus` organs cover the full tower roster; FORM stages mirror `adaptVisualTier`.
3. `commandFeed` sorts newest-first and speaks human recency at all scales.
4. `armyView` covers the full roster with faithful unlock/fielded state.
5. The registry is OPEN (registering a widget surfaces it in zone order) and `when` guards
   are honored per-save.
