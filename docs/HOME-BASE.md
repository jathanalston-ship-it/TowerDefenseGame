# Evolving Home Base — the laboratory as a progression system

> The headquarters is not a static menu backdrop. The ASSIMILATE laboratory **visibly evolves**
> as the account develops: it brightens, fills with bioluminescent life, and grows new equipment.
> Returning after dozens of hours should feel unrecognizable from the first launch. Built on
> origin's `LabAtmosphere` ambient layer (extended, not replaced).

## Architecture

- **`homeBaseTiers.ts`** (pure model): folds many progression signals into one monotonic
  **development score**, then derives an **era** (0..3), an ambient **intensity** (0..1), and the
  set of **fixtures** currently present. No DOM, no sim — unit-pinned (`homeBaseTiers.test.ts`).
- **`LabAtmosphere.tsx`** (render): reads the live save, sets `--lab-intensity` + `data-lab-era`
  on the atmosphere root, scales spore density, and renders one `.lab-fix.fix-<id>` element per
  unlocked fixture. Pure decoration: `pointer-events:none`, CSS-only motion, stilled under
  `prefers-reduced-motion`.
- **`index.css`** (the equipment): each fixture is an edge-anchored, low-opacity organic prop so
  menu content stays readable; brightness rides `--lab-intensity`, mood deepens by `data-lab-era`.

## The development score

```
score = towerStars·1.0 + heroStars·1.4 + upgrades·0.9 + bossesSlain·2.0
      + lifetimeCells·6.0 + min(runs,60)·0.35 + bestWave·0.25
```

Blended on purpose: no single system maxes the lab, and prestige (cells) carries the most weight,
so the environment keeps changing across a long arc. `intensity = clamp(score/110, 0.12, 1)` —
floored so a fresh lab still breathes, saturating only on a deep account.

| Era | Score | Mood |
|----|------|------|
| 0 nascent | 0–15 | dark, near-empty lab |
| 1 growing | 16–44 | first machinery, warmer light |
| 2 thriving | 45–89 | dense life, a vital wash |
| 3 ascendant | 90+ | a living organism, viral bloom |

## The fixture ladder (data-driven — adding one is a row)

Each fixture switches on once the score passes its threshold; two are also gated by their own
system so the environment never lies about what you've achieved.

| Fixture | Unlocks at | Represents |
|---|---|---|
| `vats` | score ≥ 6 | mutation vats bubbling to life (first stars) |
| `pipes` | score ≥ 12 | biomechanical plumbing threading the walls |
| `herochambers` | score ≥ 30 **and** heroStars ≥ 3 | hero stasis chambers |
| `containment` | score ≥ 22 | animated containment chambers (a boss felled) |
| `supercomputer` | score ≥ 38 | an organic supercomputer, pulsing |
| `walls` | score ≥ 58 | the walls themselves mutate |
| `ascension` | **a completed Molt** (cells ≥ 1) | ascension devices crowning the lab |

## Invariants & scale

- **Truthful + monotonic:** the score never decreases on progress; gated fixtures require their
  system (no hero chambers without heroes; no ascension device pre-Molt).
- **Performant:** all motion is CSS transforms/opacity on a handful of elements; no JS render
  loop; reduced-motion stills it. Fixtures are edge-anchored so they never occlude content.
- **Future-proof:** new equipment, new eras, or a re-weighted score are local edits to
  `homeBaseTiers.ts` + one CSS rule — the renderer is generic.
