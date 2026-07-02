# ADAPTATION — the Antigen specialization layer

> Mastery is **experience** (automatic, infinite, stat-flavored — docs/MASTERY.md).
> Adaptation is **specialization**: deliberate, scarce, identity-defining decisions that
> rewrite how a unit *behaves*. This doc is the canonical reference for the system's
> economy, tree anatomy, gating, visuals, UI and — most importantly — how to author the
> tree for a future tower **without writing code**.

Files: `src/core/adaptation.ts` (data + pure rules) · `src/state/meta.ts`
(`adaptationView` / `spendAdaptation` / `respecAdaptation`, kit fold in `towerProgress`) ·
`src/ui/components/AdaptationTree.tsx` (the lab UI) · `src/render/renderer.ts` +
`src/ui/GameView.tsx` (battlefield FORM stages) · tests in `src/core/adaptation.test.ts`.

---

## 1. The Antigen economy — multi-source, never farmable

Antigen is the spend currency (violet spike-ball, `currencies.ts`). The budget a unit can
spend is **earned − spent**, where earned (`antigenEarned`) sums four sources — every one
slow or capped, so repeat-running Infinite can never print Antigen:

| Source | Rate | Bound |
|---|---|---|
| **Mastery Ranks** (per unit) | +1 per Rank (every 25 mastery levels) | logarithmic XP curve — the slow infinite engine |
| **Campaign depth** (account) | +1 per `ANTIGEN.stagePer` (15) stages cleared | content-bounded |
| **Antigen Traces** (account) | +1 per Legendary/Mythic Bio-Container opened | **lifetime cap** `ANTIGEN.containerCap` (4) — granted in `meta.openContainer`, stored as `save.antigen` |
| **Achievements** (account) | +1 per `ANTIGEN.achievementsPer` (5) unlocked | cap `ANTIGEN.achievementCap` (3) |

Future systems (events, seasons) add a source by extending `AntigenSources` +
`antigenEarned` — capped or slow, per the same rule.

## 2. Tree anatomy — 4 branches × 10 tiers per tower

Every tower gets its **own** tree, generated from one theme row (§5): branches
`predation / mutation / overclock / symbiosis` (`ADAPT_BRANCH_META` carries name, blurb,
color, icon). Within a branch, tier N requires a pick at tier N−1 (**of that tower's
tree** — other towers' picks never satisfy it).

- **Rungs** (tiers 1–3, 5–6, 8–9): small themed stat steps (`BranchTheme.field` × `step`).
- **Forks** (tiers 4 and 7): two **mutually exclusive** siblings (`exclusiveWith`,
  symmetric) — picking one permanently seals the other until a respec. Forks are where
  tower identities diverge (pure lethality vs. extra projectiles; pierce vs. saturation…).
- **Capstone** (tier 10): the apex identity node.

**Campaign gates** (`ADAPT_STAGE_GATES`): tier 4+ needs account campaign Stage 15, tier 7+
Stage 30, tier 10 Stage 50. Depth cannot be rushed by farming — late-game by construction.

**Visual FORM stages** (`visualTier`): fork-4 picks set stage 1, fork-7 stage 2, capstone
stage 3. `adaptVisualTier(chosen)` = the unit's stage (0–3).

Heroes currently share the legacy three-branch tree (`HERO_ADAPT_BRANCHES`); per-hero
generated trees are a later content pass — the shapes coexist (`adaptNodesFor`).

## 3. Effects — golden-safe by construction

`adaptationEffect(chosen)` folds picks into one `AdaptEffect` (multiplicative mults;
stacked projectile mutators + extra projectiles). It feeds the **existing** per-kind kit
fold (`meta.towerProgress` / `heroProgress`) — the same channel stars + mastery perks
already ride — so there are **no new sim branches**, and an empty pick set folds to the
neutral effect: a fresh save simulates **byte-identically** (pinned by tests).

Battlefield visuals: `GameView` passes per-kind `adaptTiers` (from `adaptVisualTier`) into
`drawGame`; `drawTower` renders the FORM stages — viral membrane (1), rotating antigen
spikes (2), apex corona (3) in the Antigen violet. Stage 0 draws nothing.

## 4. Respec — identity change is allowed but not free

`respecAdaptation` refunds **all** of a unit's picks, priced `ADAPT_RESPEC.corePerPick`
(20) Genome Cores per pick and gated behind campaign Stage `ADAPT_RESPEC.stageGate` (10).
The meta layer owns every guard (gate → affordability → deduct + clear).

## 5. Authoring a NEW tower's tree — one data row, zero programming

Add one row to `TOWER_THEMES` in `core/adaptation.ts` (keyed by the new `TowerKind`), with
per-branch: `field` + `step` (the rung identity), `rungName` (flavor stem), `fork4`,
`fork7` (two named siblings each, any kit fields), `capstone`. `genTowerTree` generates
the 48 nodes — ids, ladders, exclusivity, campaign gates and visual stages included.
Module-load self-checks + `adaptation.test.ts` invariants (4×12 nodes per tower, unique
ids, fork symmetry, gate placement) fail loudly if a row is malformed. Nothing else to
touch: the UI renders whatever the generator yields, effects ride the existing kit fold,
and the doc you are reading stays true.

New **effect verbs** (e.g. a future `ricochet` mutator) are added once in the sim's
projectile-mutator vocabulary and then referenced from theme rows like any other field.

## 6. The lab UI (`AdaptationTree.tsx`)

Budget bar (Antigen wallet + per-source provenance chips + FORM stage + priced respec) →
tree canvas (tier rows × branch columns, `or`-pip forks, gate rails across tiers 4/7/10
showing met/unmet) → **inspector**: selecting any node previews the mutation, its visual
stage change, what it forsakes (or what sealed it), every requirement with met/unmet marks
(Antigen cost, tier ladder, campaign stage), and the Power contribution
(`meta.previewPower` with the pick hypothetically applied — behavioral rewrites honestly
read "Power unchanged"). The ADAPT button routes through `meta.spendAdaptation`.

## 7. Invariants (tests pin these)

1. Empty picks ⇒ neutral effect ⇒ fresh saves byte-identical (golden safety).
2. Every tower: 4 branches × 12 nodes, globally unique ids, symmetric forks, gates at
   4/7/10 — enforced at module load AND in `adaptation.test.ts`.
3. Antigen sources capped exactly as §1; spends never exceed earned − spent.
4. Deep tiers unreachable below their campaign stage regardless of budget.
5. Respec refused below Stage 10 or when Genome Cores < cost; on success deducts and
   refunds every point.
