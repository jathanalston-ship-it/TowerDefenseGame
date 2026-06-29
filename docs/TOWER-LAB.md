# TOWER-LAB.md — Tower Lab & Star Ceremony

Compressed developer summary of the Tower Lab redesign (the permanent per-tower
progression screen) and the star-upgrade ceremony. Prefer this over re-reading
the code. Builds on `TOWER-STARS.md` (the star EVOLUTION data) and `stars.ts`.

## Architecture

A clean data → presentation split:

- **`src/ui/towerLabModel.ts` — DATA.** `towerLabModel(save, kind, prog)` derives
  every panel field from existing systems (stars, mastery, the authored star path,
  the card-subject system). `ceremonyView(save, kind, toStar)` derives what the
  upgrade ceremony reveals. Pure; no React. Add a tower → it appears with zero new
  code.
- **`src/ui/TowerPortrait.tsx` — a LIVING portrait.** A self-contained canvas that
  reuses the battlefield vfx primitives (`render/vfx`, `render/theme`) and visibly
  grows with star level (orbiting organs, a ★5 spike crown, ★7/★10 ascension
  rings). Animated via rAF; honors `prefers-reduced-motion` (one static frame). No
  sim/renderer coupling.
- **`src/ui/StarCeremony.tsx` — the mutation moment.** On upgrade: portrait pop →
  the new star fills into the pip track → the unlocked evolution is revealed → the
  next unlock is previewed → milestone stars celebrate. Dismissible; pure
  presentation (the star was already bought upstream).
- **`src/ui/TowerLab.tsx`** renders the responsive card grid (scales to dozens of
  towers) and owns the upgrade intent + ceremony state.

## Stars: ★0–★10

`STAR.maxTowerStars = 10` (towers only; heroes stay `STAR.maxStars = 5`).
**★1–5** unlock the authored evolutions (`stars.ts`); **★6–10** are ASCENSION
power tiers (the S-bucket stat bump only — `stepAt` returns nothing, so the
ceremony shows "Power Ascension"). `STAR_MILESTONES = [3,5,7,10]` drive the
celebratory ceremony banners (Specialized / Fully Evolved / Ascendant / Apex
Organism). A steep cost curve (`baseCost·costMult^star`, ×1.8) gates the late grind.

## Save additions (schema v9)

`towerKills: Record<TowerKind, number>` — lifetime per-tower kills, accumulated in
`meta.finishRun` from the per-tower mastery accrual (`result.mastery[k].kills`,
already computed for mastery XP). Additive migration via `withDefaults` (zeroed for
old saves).

## Panel fields (all data-driven)

Portrait · star level · specialization (the ★3 fork choice, else combat class) ·
mastery level + rank · current evolution (latest named mutation) · next star
preview · next ability unlock · current stats (DPS/Range/… or Reactor economy) ·
lifetime kills · signature genes (cards whose `cardSubject` is this tower) · build
path (configured forks) · Mutate button.

## Extension points

- **New tower:** authored `TowerDef` + star path ⇒ the lab card, portrait, stats,
  signature genes, and ceremony all work with no UI change.
- **New panel field:** add it to `TowerLabModel` + one row in `TowerLab.tsx`.
- **More milestones / higher cap:** edit `STAR_MILESTONES` / `STAR.maxTowerStars`.

## Known limitations / honest framing

- "Genes" = the tower's *signature* genes (subject-matched), and "Build" = the
  *configured* fork path — not usage-frequency "favorites" (per-tower card-usage
  correlation isn't tracked yet). When a usage tally lands, rank "Genes" by it.
- ★6–10 add power, not new authored evolutions (deliberate — the ascension band).
- Raising the tower cap to 10 increases maxed-account power (up to +60% dmg / +30%
  rate); intended as a long-term goal, gated by the cost curve. Golden runs
  (0 stars) are unaffected.
