# TOWER-CODEX.md — the Evolution encyclopedia + Campaign-gated Evolution Tiers

Two linked systems, documented before implementation:

1. **Tower Codex** — the Tower Lab becomes an *encyclopedia of biological evolution*. Selecting a
   tower opens a detail view that shows its current form AND lets the player **preview every
   evolutionary stage** (★1/★3/★5/★7/★9) and **both branch specializations** (A & B, Tier 1–5),
   instantly, **without owning** any of it — so the lab sells the dream of progression.
2. **Evolution Tiers** — Campaign milestones permanently **raise the tower Star Cap**, unlocked
   through a dramatic **Evolution Unlock sequence** (not a silent bump), so clearing campaign
   milestones feels like beating an RPG boss.

Pure presentation reuses the existing systems; the only sim/meta change is the Star-Cap gate.

---

## 1. Evolution Tiers (the Star-Cap gate)

### Model (`src/core/evolution.ts`, pure)
- `BASE_STAR_CAP = 6` — a fresh save can fully **evolve** a tower (★1–5, the visual mutation band)
  and take the **first ascension step** (★6) with shards alone. (Preserves the existing
  "towers ascend past ★5" rule + its test.)
- `EVOLUTION_MILESTONES` — campaign-stage thresholds that unlock the **transcendent** tiers:

  | Milestone | Campaign stage cleared | New Star Cap | Title |
  |---|---|---|---|
  | 1 | 4  | ★7  | Apex Genome |
  | 2 | 8  | ★8  | Transcendent Genome |
  | 3 | 12 | ★9  | Primordial Genome |
  | 4 | 16 | ★10 | Omega Genome |

- `highestCampaignStage(cleared)` = max cleared stage across **all** difficulties (best progress
  counts). `evolutionStarCap(highestStage)` = the highest milestone cap ≤ that, else `BASE_STAR_CAP`
  (always ≤ `STAR.maxTowerStars`). `milestoneCrossed(oldStage, newStage)` → the milestone unlocked
  by this clear, or null.

### Gate (`state/meta.ts`)
- `nextStarCost` and `buyStar` cap at `evolutionStarCap(highestCampaignStage(save))` instead of the
  absolute `STAR.maxTowerStars`. **Never downgrades**: a tower already above the current cap (e.g.
  a legacy ★10) keeps every star and its kit; the gate only blocks *new* purchases past the cap.
- This is the ONLY mechanical change. Determinism/golden runs are untouched (star kits still
  resolve from owned stars; the cap only limits the meta shop).

### Unlock detection (`finishRun`)
On a **won campaign** run, compare `highestCampaignStage` before/after the `cleared` update. If a
milestone was crossed, attach `RunOutcome.evolutionUnlock = { milestone, oldCap, newCap, title,
towers, newAbilities }` — the trigger for the sequence. `towers` = the whole roster (the cap is
global); `newAbilities` = each tower's star-step name at the new cap (what the tier grants).

---

## 2. The Evolution Unlock sequence (`ui/EvolutionUnlock.tsx`)

A full-screen, dramatic overlay shown by `App` when `outcome.evolutionUnlock` is present (over the
Results screen; dismiss → continue to Results). NOT a silent unlock. Displays:

- **NEW EVOLUTION UNLOCKED** (eyebrow) + the milestone **title**.
- **Star Cap Increased → ★N** (the headline).
- **New mutations available** — the band of stars now reachable.
- **Affected towers** — the roster (each as a living portrait at the new cap).
- **New abilities unlocked** — the star-step each tower gains at the new tier.
- A **dramatic mutation animation**: portraits burst/ascend (reuses `TowerPortrait` at the new cap
  + the ceremony burst), staged reveals, screen-filling glow. Honors reduced-motion.

It reuses the `StarCeremony` visual language (eyebrow → name → portrait → pips → continue) scaled up
to a roster-wide, milestone-grade moment.

---

## 3. The Tower Codex (`ui/TowerCodex.tsx`)

Selecting a tower in the Lab opens the Codex (a focused overlay; the grid stays the selector).

### Current form (top)
Living portrait at the **current** star/branch, name + class, **current Star level**, **current
Branch** (or "Base strain"), **Mastery** rank/level, and the **abilities unlocked** so far.

### Preview (the new feature) — `towerCodex(save, kind)` read-model
Three preview tracks the player switches between instantly (no ownership required):

- **Evolution (Stars)** — chips ★1 · ★3 · ★5 · ★7 · ★9. Each shows the portrait at that star plus
  the star-step's name/description and whether it grants a new ability. Each chip is tagged
  **owned / reachable / locked** vs the player's stars and the campaign cap (locked tiers show the
  campaign milestone that unlocks them — the hook for excitement).
- **Branch A** / **Branch B** — chips T1…T5. Each renders the branch's evolved silhouette
  (`TowerPortrait` with `branchId`+`tier` → `drawTowerEvolution`) plus that tier's mutation
  name/description (from `branchTreeView`).

Selecting any chip swaps the big portrait + detail pane instantly. Previews are **derived**, never
gated by owned upgrades — the lab is an encyclopedia, so every entry is always viewable.

### Future-proofing
Everything is **data-driven over the existing registries**: star stages from `stepAt`/`forksOf`,
branches from `branchesFor`/`branchTreeView`, visuals from `BRANCH_EVOLUTION` + the star portrait.
A **new tower** appears in the Codex automatically with zero codex code — it just needs its star
path + branches + (optional) branch-evolution organs, like every existing tower.

---

## 4. Determinism, save-compat, limitations
- Save-compat: no new persisted fields. The cap is **derived** from existing `campaign.cleared`, so
  no migration; legacy over-cap stars are preserved (gate is purchase-only).
- The Codex is pure presentation (no sim coupling); previews never touch saved progress.
- `TowerPortrait` gains optional `branchId`/`tier` (absent ⇒ the current star-only portrait,
  unchanged everywhere it's already used).
- Limitation: branch previews show the *visual* evolution + tier text, not a live DPS sandbox
  (stats are the owned-tower's job in the in-run inspector); a previewed stat readout is a future
  hook on the same read-model.
