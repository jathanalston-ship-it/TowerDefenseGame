# Infestation Map — THE FRONT (persistent conquest meta)

A hive-map of **four regions × four sectors**. Every finished run — campaign, daily,
rush, infinite — feeds infestation into the map; sectors climb named tiers, saturate, and
entrench; infested regions pay passive account bonuses; neglect decays. Since save v49 the
map is also a **war layer** (§front): held ground pays spoils and weekly tribute, comes
under daily incursion, and deploys runs with regional warps.

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

## §front — the war layer (save v49)

The map is not a passive readout: it **pays, attacks back, and deploys**. Home shows the
one-line `FrontStrip`; the full board + war console is PLAY → **The Front** (`FrontScreen`,
revealed at campaign stage 8; notification source `front.war` counts waiting actions).

- **Tier spoils — exactly-once per sector** (`tierReward`, `CLAIMABLE_TIERS = [2,3,4]`):
  the first time a sector holds Colony/Stronghold/Saturated a claim opens on the Front.
  Regions pay their theme: Fringe **Chitin** 40/90/150 · Reach **tower shards (all)** 2/4/6
  · Basin **hero shards (all)** 2/3/5 · Fields **cores** 120/260/400; Saturated adds a
  **rare container**. `infestation.tierClaims[sectorId]` is a high-watermark ledger — a
  sector that falls and re-climbs never re-pays. `meta.claimFrontTier` (guard `front.claim`)
  pays through `applyRewardList`, so toasts/provenance come free.
- **Weekly tribute — held ground pays its keeper** (`tributeFor` × `regionHeldTiers`):
  once per ISO week per region (`tributeWeeks[regionId] = weekKey`), scaled by Σ held tier
  indexes / 16, gated at `TRIBUTE_MIN_TIERS = 2`, zero rows dropped. Full-hold bases:
  60 Chitin / 2 tower shards / 2 hero shards / 120 cores (`meta.claimFrontTribute`).
- **Budget laws** (`npm run sim:front`): full-map one-time spoils ≤ 15,000 core-eq (a
  content prize, not income) and full-hold weekly tribute ≤ 15% of weekly active income —
  plus the no-death-spiral, rotation, and warp-pairing laws below.
- **Daily hotspot** (`hotspotSectorId(dayKey)`): one day-deterministic sector where feeds
  land ×`HOTSPOT_FEED_MULT` (1.5) — somewhere to be today (applied in `finishRun` when the
  resolved feed target is the hotspot).
- **Incursions — decay with a face** (`incursionSectorId`, `resolveIncursionBite`): each
  day one held sector (tier ≥ `INCURSION_MIN_TIER`) comes under attack; a **won** run that
  feeds it that day defends it (`defenses[dayKey]`, newest-14 ring). Undefended, it loses
  `INCURSION_BITE` (12) when the next day resolves — **lazily and bounded**: the
  `lastIncursionDay` cursor resolves only the most recent unresolved day, so a lapsed
  player returns to at most ONE bite + natural decay (pressure, never a death spiral).
  Both `meta.pollFront` (Front mount) and `finishRun` advance the cursor.
- **Deploy — the map starts fights** (`REGION_WARPS`, `deployWarp`, `state/frontDeploy`):
  each region pairs a hazard with a payoff inside the [0.9, 1.2] flavor band (Fringe swarm
  +8% / bounty +12%; Reach hardened +12% / rewards +6%; Basin fast +8% / rewards +6%;
  Fields horde +15%, frail −5% / bounty +5%). Deploying pins the sector and arms a
  session-scoped warp the next campaign/infinite/rush boot consumes
  (`RunOptions.sectorWarp`, folded at the single director seam in `game.ts`; absent ⇒
  byte-identical golden path; dailies/tutorial/Arena never receive it).
- **Entrenchment opens roads**: while any region is entrenched, `expeditionSlotsFor`
  grants **+1 expedition slot** — capped at one, felt not stacked.
- **`SATURATED_AT = 99.5`, not 100**: lazy decay pulls a cap-written sector below an
  exact-100 threshold within seconds, which made the Saturated tier transiently
  unreachable; 99.5 buys ≈ half a day of hold at the saturated half-decay rate.

## Extending

New region = one `REGIONS` row (four sector rows + a bonus lever from the R bucket) — it
joins the map layout, the view, and the passives automatically; give it a `REGION_WARPS`
entry and `tierReward`/`tributeFor` arms (or let it fall to the cores default) and it joins
the war too. Tier thresholds, decay/gain pacing, saturation shield, and entrenchment
strength live in the exported constants (`SECTOR_TIERS`, `SATURATED_AT`, `DECAY_PER_DAY`,
`GAIN_PER_WAVE`, `GAIN_CAP_PER_RUN`, `SATURATED_DECAY_MULT`, `ENTRENCH_MULT`); war pacing
in `HOTSPOT_FEED_MULT`, `INCURSION_BITE`, `INCURSION_MIN_TIER`, `TRIBUTE_MIN_TIERS`, and
the reward tables — re-run `npm run sim:front` after touching any of them.
