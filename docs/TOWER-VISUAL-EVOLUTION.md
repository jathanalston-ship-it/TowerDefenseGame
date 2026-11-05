# TOWER-VISUAL-EVOLUTION.md — Star-driven visual mutation (framework)

Tower progression is no longer *only* a number. As a tower gains **Stars** (the permanent
per-tower ladder, `TOWER-STARS.md`) it **visibly mutates on the battlefield** — a new
generation of biological organism roughly every two stars. This is the framework spec,
written before the implementation, per the brief.

Companion to `EVOLUTION-CAP.md` (what *gates* stars), `TOWER-STARS.md` (what stars *do*),
`RENDER-PIPELINE.md` (the renderer) and the existing `src/render/towerEvolution.ts` (the
**organ vocabulary**, built for in-run *branch* tiers — which this reuses).

---

## 1. Principle

> A higher-Star tower is a more-evolved **organism**, not a bigger number.

Every two stars the tower enters a new **generation** (`config.STAR_MUTATION_TIERS`, shared
with the Lab's "upcoming visual mutation" preview so the look and the label never drift):

| Stars | Generation | What appears |
|---|---|---|
| ★1–2 | **Base Organism** | the unmutated base silhouette |
| ★3–4 | **Minor Mutation** | additional limbs, glowing veins, armor growth, a new firing organ |
| ★5–6 | **Large Mutation** | a larger, more aggressive silhouette; improved projectiles |
| ★7–8 | **Advanced Mutation** | animated biological structures, larger effects, organic movement |
| ★9–10 | **Ultimate Organism** | a fully-evolved, prestige-level silhouette + legendary ambient FX |

Each mutation must **read as more powerful** *and* **preserve the tower's identity**: a
Needle Spitter, Bone Mortar, Flesh Reactor, Parasite Nest or Neural Obelisk is instantly
recognizable at every stage (silhouette + class hue are never replaced, only *grown*).

## 2. Architecture — reuse the organ vocabulary, add a star consumer

The project already has a **data-driven organ system** (`src/render/towerEvolution.ts`): an
`EvoPartKind` vocabulary (`halo · barbs · barrel · barrels · armor · biomass · organs ·
spikes · limbs · tendrils · fangs · crown · glyphRing · arcs · pods · ripples · heart ·
nova`), one small pure drawer per kind in `PART_DRAWERS`, composed by tier. It currently has
**one consumer** — `BRANCH_EVOLUTION`, keyed by in-run `branchId`.

Star evolution is a **second consumer of the same vocabulary**, keyed by `TowerKind`:

- **`src/render/starEvolution.ts`** — `STAR_EVOLUTION: Record<TowerKind, { growth, parts }>`.
  Each tower authors which organs it grows and at which **star** (`EvoPart.at` = the star the
  organ first appears: 1/3/5/7/9). `drawStarEvolution(ctx, tw, stars, r, now, color, fired)`
  composes them by calling the shared `PART_DRAWERS`. `starEvolutionGrowth(kind, stars)`
  swells the body (the "larger / prestige silhouette").
- **Organ size** is driven by a **moderated intensity** `vis = ceil(stars/2)` (∈ 1..5) so the
  10-star range maps onto the range the drawers were tuned for — the visuals never blow up at
  ★10. **Which** organs appear is gated by the raw star (`part.at ≤ stars`).

### How a star reaches the renderer (render-only, golden-safe)

The permanent per-kind star count is passed to the renderer exactly like the existing
mastery `cosmeticTiers`: `GameView` reads `save.towerStars` once at run start and hands
`drawGame(…, cosmeticTiers, starTiers)`; `drawTower` calls `drawStarEvolution`. **No sim
code, no `Tower` field, no `RenderState` change** — the renderer is pure presentation, so the
golden tests (which never render) are untouched by construction. A 0-star tower draws no star
organs ⇒ the fresh-account look is unchanged.

## 3. Layering (how it composes with what's already drawn)

`drawTower` draws, in order: body → kind flourish → **mastery halo** (rank) → **star organs
(new)** → **branch organs** (in-run tier) → mutation flash → selection. Star and branch
evolution **share the vocabulary and the tower's hue**, so when both are present they read as
one coherent organism rather than two systems. In practice most field towers are branch-tier
0 (branches cost biomass mid-run), so the star layer is usually the *only* evolution showing
— which is the permanent-progression read we want.

## 4. Identity-preserving organ sets (the launch roster)

Each tower's organs are chosen from the vocabulary to **extend its silhouette**, never mask
it (color = the tower's class hue):

| Tower | ★1 | ★3 Minor | ★5 Large | ★7 Advanced | ★9 Ultimate |
|---|---|---|---|---|---|
| **Needle Spitter** (Kinetic) | halo | barbs (venom spines) | barrel (longer spire) | spikes (barbed carapace) | nova |
| **Bone Mortar** (Caustic) | halo | biomass (acid sacs) | barrels (battery) | armor (plating) | nova |
| **Flesh Reactor** (Vital) | heart | organs (vital nodes) | biomass (engorged sacs) | tendrils (overcharge) | nova |
| **Parasite Nest** (Viral) | halo | pods (egg-pods) | biomass (spore blisters) | ripples (contagion) | nova |
| **Neural Obelisk** (Neural) | glyphRing | organs (psionic nodes) | crown (spike crown) | arcs (neural lightning) | nova |

The `nova` capstone at ★9 is the "legendary ambient animation / prestige silhouette."

## 5. Future-proofing (a new tower, zero new draw code)

Adding a tower's visual evolution = **one `STAR_EVOLUTION[kind]` data row** listing organs +
appearance stars, reusing the existing drawers. No renderer edits, no `switch`. A brand-new
organ kind (rare) is one new entry in `EvoPartKind` + one drawer in `PART_DRAWERS`, then it's
available to *both* the star and branch systems. This is the "generalize, don't hardcode"
spine from CLAUDE.md applied to art.

## 5b. The moments — placing and evolving LAND (`src/render/towerMoments.ts`, 2026-11)

The organs above are the *state*; the beats are the *transition*, so growing the board feels like
something happened (docs/GAME-FEEL.md §board growth):

- **Deploy** (keyed off `bornAt`): a damped size overshoot (≈ +11 %, settles to exactly ×1), a light
  shock ring + a dark dust ring running out along the ground plane, kicked flecks, a touch-down
  bloom (Flashes setting) and the build pad flaring in the tower's hue — ~0.8 s.
- **Evolve / molt** (keyed off `mutatedAt` — branch tiers, strain raises, strain merges and
  strain-deploys all stamp it): depth = `tier + (strain − 1)`; duration 0.61 → 1.09 s, rings 1 → 4
  (+1 per 2 levels), 5 + depth shed chitin shards, a white pop (Flashes), and at an **apex** step
  (tier V / Strain V / depth ≥ 5) a column of the organism's light rising off it.
- Derived only from `(age, tier, strain, id, colour)` — no per-tower state; one table
  (`TOWER_MOMENTS`), nothing per-kind ⇒ tower #100 gets the same beats. Reduced motion keeps the
  pad glow / a static fading halo and drops the pop, rings, shards and column.
- Star / mastery evolution happens OUTSIDE a run (the Lab), so it has no battlefield moment; the
  Lab portrait owns that reveal.

## 6. Performance & invariants

- All embellishment is procedural Canvas2D (no assets), gated the same way the branch organs
  already are; star organ counts are **fixed per generation** (no count explosion at ★10).
- Pure presentation: reads only `tw.{kind,x,y,id}` + the star count; never mutates the sim.
- `starEvolutionGrowth` is `1` at ★0 and gentle (≈ +0.02/star, ★10 ≈ 1.2×), so the body never
  outgrows its build pad and a fresh account is pixel-identical.
- The Tower Lab portrait (`TowerPortrait.tsx`) shares the same `STAR_EVOLUTION` so the lab and
  the battlefield show the *same* organism at a given star.
