# Living Battlefield

The arena visibly **assimilates** as a run deepens. Early on it is the clean natural map the player
started on; by late-game it no longer resembles that map — it has been infected, terraformed and
assimilated into a living biomechanical ecosystem (breathing ground, arteries, bone, blinking eyes,
crawling parasites). A single screenshot should communicate roughly how deep the run is, what kind of
build the player made, and how thoroughly they have taken over the environment.

This is **visual storytelling, never power creep.** It is entirely render-side and derived — the
simulation never reads it, so the deterministic golden run is byte-identical (same contract as
`render/gore.ts` and `render/equipmentArt.ts`). It is **inert at Stage 0**, so a fresh/early run is the
original arena.

Implementation: `src/render/livingBattlefield.ts`. Wired beneath the entities in
`src/render/renderer.ts` (`drawGame`), fed the live Power Score from `src/ui/GameView.tsx`.

## The hidden Battlefield Biomass value

A single hidden scalar accumulates from **everything the player builds** — it is never shown as a
number in normal play (only the dev readout). `computeAssimilation(rs, ctx)` folds:

- **Towers** — count + per-tower depth: strain, branch tier, permanent stars, mastery rank, and a
  grafted Mulligan organism.
- **Heroes** — count + whether they are wearing equipment.
- **Combat** — kills, boss kills (heavier), mega-boss kills (heaviest).
- **Progression** — wave/depth, and the run's **Power Score** (log-scaled so it can never dominate).
- **Biome** — an active biome accelerates assimilation slightly.

The value maps to an **evolution stage 0–5** via `STAGE_THRESHOLDS`
(`Dormant → Seeded → Spreading → Infested → Assimilated → Living`). `intensity = (stage + progress)/6`
is the master alpha for the whole effect, so the arena deepens smoothly rather than popping between
stages.

**One source of truth.** In the live game the stage is *not* taken from this local biomass — it is
taken from the canonical **Assimilation Index** (`core/assimilation.ts`, docs/ASSIMILATION.md), the
run's hidden master state that already folds the Power Score + contribution profiles and drives the
mood FX, music floor and HUD glow. `GameView` passes its eased `game.assimilation.index` down through
`drawGame`; `computeAssimilation(rs, ctx, masterIndex)` reads its tier via `tierAt()`. So the terrain,
the music and the HUD all deepen **together** — never one at "Planetary" while another lags. The local
biomass accumulator is the **standalone fallback** (used by the unit tests and Spectate/replay, where
the eased index isn't threaded); the **regional hotspots are always computed here**, since the scalar
index can't carry per-tower placement.

## Environmental Influence Profiles (data-driven, future-proof)

Each contributor declares **how** it mutates the ground via a *motif* (`vein · flesh · bone · crystal ·
spore · root · chitin · ember`), and a motif carries a hue. Lookups —
`profileForTower / profileForMulligan / profileForHero / profileForGene` — read a small curated map and
**fall back to a stable hash-derived motif** for anything missing. So a new tower, hero, mulligan axis
or gene archetype grows a coherent look **with zero code change here**; authoring a row only *curates*
what it would already do. (CLAUDE.md — "generalize, don't hardcode".)

## Regional evolution

Mutation blooms outward from **hotspots**, each in its own motif:

- every **tower** (its build depth = bloom size, its profile = motif/hue),
- the **nucleus** (the run's central organ — always the strongest anchor),
- the current **heavy-combat zone** (the danger-camera focus), and
- a **mega body** across the top band.

`arteries` (pulsing veins with a travelling heartbeat) connect the nucleus to each tower, so the network
literally follows the player's layout.

## The Terraform Layer (architecture + optimization)

All the **stable** terrain — membrane, tubular veins, shaded blooms, edge overgrowth and permanent
scars — is **baked once** into an offscreen canvas, keyed by `(stage, biome, build layout, perm-scar
count)`. It is rebuilt only when that key changes (a stage step, a biome flip, a tower placed/upgraded,
a boss falling) and **crossfades** from the previous bake over ~0.85 s, so the arena *grows* instead of
popping. Per frame the drawer does **one `drawImage`** plus a handful of cheap, gradient-free live
accents. Baked in:

1. **Membrane** — multi-octave fleshy mottling behind an **assimilation frontier** that advances from the
   hive (bottom) toward the spawn line (top) as the run deepens — the map is *consumed*, not overlaid.
   **Tinted** toward the biome accent (consume, don't overwrite) **and** the Assimilation-Index tier
   colour, so the ground shares the mood-FX/HUD art direction.
2. **Veins** — tubular nucleus→tower channels (dark casing, bright core, capillary offshoots) following
   the real build.
3. **Regional blooms** — 2-tone **shaded** per-motif geometry (bone spurs, crystal shards, spore pods,
   roots, chitin plates, ember cracks, specular sacs), lit up-left to match the renderer.
4. **Overgrowth** (stage ≥ 2) — a rising bottom crust, creeping edge tendrils and, at stage ≥ 4, chitin
   plating snapping onto the tile lattice — this is what makes late-game *not the starting map*.
5. **Permanent scars** — boss/mega craters (tracked render-side by boss-id disappearance, so no sim change).

**Live accents** (cheap, over the blit): breathing blit-alpha, heartbeat beads travelling the veins, the
**nucleus organ** (roots/sacs/blinking eyes/heartbeat ring), a **combat flare** where the line is pressed
hardest, a mega bloom, fading combat scorch (two-arc fills, no gradients), and **ambient life** over the
entities.

## Audio

A single subtle organic swell (`bioStage` cue) plays **only when the arena deepens a stage** — never on
load, never on a decrease. Quiet by design; the score is never interrupted.

## Performance

- The entire terrain is a **cached blit** — rebuilt only on a real change, crossfaded, so a steady frame
  costs one `drawImage` (two mid-crossfade) instead of dozens of per-region gradient allocations.
- Live accents are gradient-free where it matters (heartbeat beads, combat scorch); scars are **pooled +
  capped**; the bake is one-time and amortized.
- **LOD**: under a large swarm (`PERF.lodEnemyCount`) live vein-bead counts drop and ambient life is
  skipped. Graceful — the field simplifies, it never stalls the frame.
- **Headless fallback**: with no DOM (unit tests / jsdom) the drawer paints a cheap direct wash + simple
  veins so the path still runs end-to-end without an offscreen canvas.

## Developer tools

`DebugPanel` → **Living Battlefield**: a live readout (biomass value, stage, progress %, dominant motif,
region count), a **master On/Off** toggle, and **Force stage** buttons (`Auto`, `0…5`) to preview every
evolution stage instantly on a live run. Backed by `setStageOverride` / `setLivingBattlefieldEnabled`.

## Invariants

- **Render-only.** Nothing here is read by the sim; `RenderState.assimilation` is a pure snapshot read
  of counters the sim already tracks. Golden stays byte-identical.
- **Inert at Stage 0.** No draw output until the field wakes ⇒ the clean early arena is preserved.
- **Readability first.** Low alpha, under the entities; ambient life is sparse and edge-biased. The
  effect never competes with gameplay legibility.

## Known limitations / future hooks

- Combat scars are fed by the existing enemy death buffer; a dedicated projectile-impact buffer could
  add finer per-shot scorching later.
- Biome adaptation currently re-tints the shared motifs; per-biome bespoke motifs (bone dunes, mutated
  trees) can be added by extending the motif set and a biome→motif bias map — no gameplay code changes.
- Stage thresholds and per-source weights live as constants at the top of `livingBattlefield.ts` for
  easy balancing.
