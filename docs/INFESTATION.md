# Infestation Map — the persistent conquest meta

A hive-map of **four regions × four sectors**. Every finished run — campaign, daily,
rush, infinite — feeds infestation into one sector; infested regions pay passive account
bonuses; neglect decays. One visible conquest board that every mode drives.

## Model (`src/core/infestation.ts`)

- `REGIONS` (data): Cordyceps Fringe → **Biomass ×1.08** · Calcified Reach → **Tower
  Damage ×1.06** · Neural Basin → **Hero Damage ×1.08** · Marrow Fields → **Fire Rate
  ×1.05** (values at FULL regional infestation; scale linearly with the live fraction).
- **Feeding**: `runInfestGain(wave, won)` = `wave × 2` (losses half), capped at 40/run.
  `finishRun` applies it to the **pinned** sector (`save.infestation.target`) or
  auto-spreads to the emptiest.
- **Decay is lazy**: sectors persist `{level, updatedAt}`; every read resolves
  `effectiveLevel = level − daysSince × 2` (floor 0, cap 100). Nothing ticks, offline-safe,
  and every API takes `now` — tests never sleep.
- **Folding**: `meta.infestationRunEffects()` joins the run-effects assembly (like gear
  and trophies). A fresh board contributes nothing (golden-safe).

## UI

Command Center → **Infestation board**: region rows with live sector fills, the region
passive at current strength, click-to-pin (◉) the sector future runs feed.

## Extending

New region = one `REGIONS` row (four sector rows + a bonus lever from the R bucket).
Decay/gain pacing lives in the four exported constants.
