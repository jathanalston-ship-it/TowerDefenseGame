# Infestation Map — the persistent conquest meta

A hive-map of **four regions × four sectors**. Every finished run — campaign, daily,
rush, infinite — feeds infestation into the map; sectors climb named tiers, saturate, and
entrench; infested regions pay passive account bonuses; neglect decays. One visible living
conquest board that every mode drives.

## Model (`src/core/infestation.ts`)

- `REGIONS` (data): Cordyceps Fringe → **Biomass ×1.08** · Calcified Reach → **Tower
  Damage ×1.06** · Neural Basin → **Hero Damage ×1.08** · Marrow Fields → **Fire Rate
  ×1.05** (values at FULL regional infestation; scale linearly with the live fraction).
- **Feeding**: `runInfestGain(wave, won)` = `wave × 2` (losses half), capped at 40/run.
  `finishRun` resolves the pin (`resolveFeedTarget`) then applies it with **spillover**.

### §tiers — the named ladder

`SECTOR_TIERS`: **Dormant** (0) → **Foothold** (1) → **Colony** (35) → **Stronghold** (70)
→ **Saturated** (100). `tierOf(level)` returns the current tier + the next edge; the map and
the detail line speak in these names. A **Saturated** sector (written at cap) decays at
**half** rate (`SATURATED_DECAY_MULT`, via `decayRateOf`) — conquest entrenches.

### §spillover

`feedInfestation(sectors, targetId, gain, now)` pours a run's points into the target, and
any **overflow past the cap** spills into the emptiest not-full sector of the **same
region** first, then the emptiest **anywhere** — nothing is wasted until the whole map is
saturated. Returns the fed ledger (`{id, amount}[]`) so the UI can flash exactly what grew.

### §pins

`save.infestation.target` may be a **sector id** (feed it), a **region id** (feed that
region's emptiest sector — `resolveFeedTarget`), or **null** (spread to the emptiest
anywhere). `isValidInfestTarget` gates both the meta setter and the save sanitizer.

### §entrenchment

A region whose four sectors are all effectively saturated is **entrenched**: its bonus
portion pays **×`ENTRENCH_MULT` (1.25)** — the set payoff for holding a whole region
(`isEntrenched`, folded in `infestationEffects`).

### §forecasts

`zeroInDays` (days until the sector empties) and `tierHoldDays` (days until it drops a
tier) drive the detail-line "empties in 12d" readouts — the lazy-decay math made legible.

- **Decay is lazy**: sectors persist `{level, updatedAt}`; every read resolves
  `effectiveLevel = level − daysSince × decayRateOf(s)` (floor 0, cap 100). Nothing ticks,
  offline-safe, and every API takes `now` — tests never sleep.
- **Folding**: `meta.infestationRunEffects()` joins the run-effects assembly (like gear
  and trophies). A fresh board contributes nothing (golden-safe).

## §map — the living board (`render/infestationMap.ts` + `InfestationBoard`)

The board is a **procedural canvas territory map**, not a row of bars:

- `infestationLayout(w, h, regions)` places the four regions as organic **lobes** (2×2) and
  their sectors as **cells** in a diamond around each lobe — deterministic, canvas-scaled,
  and **shared** by the renderer and the a11y overlay so the buttons sit exactly on the cells.
- `drawInfestationMap` paints: region halos (brighter as they fill, pulsing when entrenched),
  mycelial links region→cell, and each sector as an **organic blob** whose infestation
  **blooms from within** (accent-tinted, veined, scaled by live level). Saturated cells grow
  a bright nucleus pip; the pinned cell wears a rotating dashed ring; the resolved **feed
  target** wears a reticle; a just-fed cell erupts a decaying **flash** ring.
- `meta.infestationView()` is the read-model: per-sector `{level, tier, zeroInDays,
  tierHoldDays, saturated}`, per-region `{fraction, entrenched, bonusNow}`, the resolved
  `feedsInto`, map `completion`, `saturatedCount`, and `dormant` (nothing infested anywhere).
- The canvas loop is **DPR-aware**, **pauses when the tab is hidden**, and renders a single
  still under `prefers-reduced-motion`. The board's controls pin a region / spread; clicking
  a cell pins/unpins that sector; hover/focus drives the tier + forecast detail line.
- **Dormant collapse (home hierarchy):** while `view.dormant` the board renders as a
  one-line teaser — the system's pitch, the resolved next-feed sector, and a "View map"
  expander (session-local state; the canvas effects re-arm on expand) — instead of a
  screen-tall empty map. The first infested point opens the full board unconditionally.

## Extending

New region = one `REGIONS` row (four sector rows + a bonus lever from the R bucket) — it
joins the map layout, the view, and the passives automatically. Tier thresholds,
decay/gain pacing, saturation shield, and entrenchment strength live in the exported
constants (`SECTOR_TIERS`, `DECAY_PER_DAY`, `GAIN_PER_WAVE`, `GAIN_CAP_PER_RUN`,
`SATURATED_DECAY_MULT`, `ENTRENCH_MULT`).
