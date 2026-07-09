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

## Layers (all beneath the entities, except ambient life)

1. **Membrane** — a cached, stage-keyed fleshy ground texture (rebuilt only when stage or biome flips),
   blitted with a breathing alpha. **Biome adaptation** tints it toward the biome accent (consume, don't
   overwrite — e.g. a frozen biome yields icy-tinted flesh).
2. **Arteries** — nucleus→tower veins + heartbeat beads.
3. **Regional blooms** — per-motif geometry (bone spurs, crystal shards, spore pods, roots, chitin
   plates, ember cracks, breathing sacs).
4. **Nucleus organ** — spreading roots, pulsing sacs, blinking eyes (stage ≥ 3), a heartbeat ring; grows
   with the run.
5. **Scars** — permanent boss/mega craters (tracked render-side by boss-id disappearance, so no sim
   change) + fading combat scorch on heavy-fought ground.
6. **Ambient life** (over entities) — a few crawling parasites, drifting spores and rare blinking eyes,
   **stage ≥ 3 only, low alpha, edge-biased** so the play-critical centre stays readable.

## Audio

A single subtle organic swell (`bioStage` cue) plays **only when the arena deepens a stage** — never on
load, never on a decrease. Quiet by design; the score is never interrupted.

## Performance

- The expensive full-field texture is **cached** and rebuilt only on a stage/biome change.
- Everything else is time/hash-keyed with no per-frame allocation churn; scars are **pooled + capped**.
- **LOD**: under a large swarm (`PERF.lodEnemyCount`) artery/region counts drop and ambient life is
  skipped. Graceful — the field simplifies, it never stalls the frame.

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
