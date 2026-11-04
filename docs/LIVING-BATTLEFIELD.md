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

## The Terraform Spec + dual-layer bake (architecture + optimization)

Everything with a position is first **derived** into a pure `TerraformSpec` (the house
`derive*`/`draw*` pattern): the **vein network** — a greedy nearest-connected *tree* rooted at the
nucleus, so veins branch organically through the build instead of star-bursting from one point —
plus terrain **eye sites**, biome **flora**, and the spread parameters. The bake paints from the spec
and the live accents read the *same* spec, so animation always matches the baked geometry.

Spread is governed by a radial **infection field**: mutation *radiates outward* from every hotspot
(reach grows with stage) and pools up from the hive **frontier**, the two merging as the run deepens —
the original map is consumed, not overlaid.

The stable terrain is baked into **two** offscreen canvases keyed by `(stage, biome, build layout,
perm-scar count)`, rebuilt only on a real change and **crossfaded** (~0.85 s):

- **BASE** — field-gated fleshy membrane (biome + tier tinted), the **feathered** frontier crust +
  edge tendrils + stage-4 chitin plating on the tile lattice, vein casings/walls + capillaries, 2-tone
  shaded per-motif blooms, **flora** (biome-flavoured micro-growth: `BIOME_FLORA` data row, dominant-
  motif fallback), closed **eye sockets**, permanent scars. Blitted with a slow breathing alpha.
- **GLOW** — vein cores, bloom glints, the frontier shimmer, ember light. Blitted with a
  **heartbeat-modulated alpha**, so the entire network pulses as one organism for the cost of a
  `drawImage`.

**Live accents** (cheap, over the blits): nutrient beads running the vein network, **parasites crawling
along the veins** (under the entities ⇒ correct occlusion), **terrain eyes whose pupils track the
nearest enemy** (idle wander under LOD), the **nucleus organ** (roots/sacs/blinking eyes/heartbeat
ring), a **combat flare** where the line is pressed hardest, a mega bloom, fading combat scorch
(two-arc fills, no gradients), and **ambient spores/floating eyes** over the entities.

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

## Living gutters — the terrain past the board edge (`src/render/gutters.ts`)

On desktop the 3:4 board sits in a wide frame; the periphery around it is painted with the SAME
terrain vocabulary, darkened to ≤ 35 % and baked at ¼ resolution so it reads as the world beyond the
camera, never as playable space (docs/SIGNATURE-MOMENTS.md §4 has the full spec, tunables and numbers).

- **Shared painters, not a fork.** `livingBattlefield.ts` exports `terraformPalette` (the bake palette,
  also used by `buildBake`), `crustGeometry` (also used by `paintCrust`), `infectionField`, `lipY`,
  `paintVein`, `paintFlora`, `paintEyeSocket`, `resolveAccent`, `BIOME_FLORA` and the colour helpers.
  They take explicit coordinates, so the gutters call them at x < 0 / x > WIDTH.
- **One source of truth.** The bake reads `getAssimilationDebug()` — the exact assimilation the board
  just drew (stage, tier colour, tower hotspots) — so board and periphery deepen together; tower
  blooms near an edge bleed across the seam, and a creep keyed to the Assimilation Index spreads the
  infestation outward from the board edges.
- **Static.** Re-baked only on a key change (4 Hz poll: biome, Mega, stage, creep step, tower layout)
  or a frame resize; crossfaded like the board's terraform. No entity is ever painted there.

## Organisms — the entity life layer (`src/render/organism.ts`)

The terrain above evolves; this layer makes the ENTITIES on it live. "The battlefield
should never appear motionless": every tower is a continuously reacting organism, every
enemy visibly attends to what threatens it — all render-side, all module-local state,
ZERO sim writes (the golden contract stays byte-identical by construction; the suite
proves it with an untouched `src/core/`).

### Towers — anticipation, recovery, tremor, emissions

- **Approach-ANTICIPATION** bridges TOWER-IDLE.md's PREPARATION and COMBAT: an `alert`
  scalar eases up while enemies close within `(range, range × 1.8]` — outside range, so
  the sim's engagement posture is untouched — and exhales fast once combat or passage
  resolves it. Staggered proximity scans (each tower ~1/6 frames, 1/12 past the enemy
  LOD line) keep the O(towers × enemies) pass a rounding error.
- **Pose** (`organismPose`, amplitude-capped at the source): threat-bearing lean + a
  capped turn toward the approaching lane (`orient`), aperture gape + pressure swell
  (`gape`/`swell`), an always-on idle micro-twitch (`twitch` — an organism is never
  motionless, enforced by the validator), a damped post-shot RECOVERY settle armed on
  cooldown fire-edges, and an environmental TREMOR jitter. One composed transform wraps
  the whole body draw (beam rays and ground shadows stay world-anchored outside it).
- **Environmental reactions**: heavy deaths (`DeathEvent.overkill ≥ 0.55` or fat
  bounties) slam a radial shock into towers within 140 px; hero ULTIMATE casts pulse the
  neighbourhood; a mega boss telegraph/phase-turn braces the whole garrison (`megaRumble`
  floor); `hiveHitPulse` shudders it. All decay exponentially — flinches, not seizures.
- **Ambient EMISSIONS** (world-anchored, outside the pose; LOD-gated): per-family
  particle language — `spores` lift and disperse, `drips` bead and rope off the
  aperture, `sparks` glint, `drones` peek from brood-holes and duck back, `crawlers`
  skitter the rooted base, `wisps` spiral the body. Deterministic trig of `(now, id)` —
  zero allocation, zero retained state. Amplitude = max(alert, deep-idle prep × 0.5), so
  between waves the garrison still breathes and combat exhales the air life.

### Profiles — data, not code (the scale contract)

`OrganismProfile { orient, gape, swell, twitch, tremor, emission, voice }` resolves as:
**body-form persona** (FORM_PERSONA — how that anatomy behaves) → **combat-class
voice** (Caustic hisses acid, Viral breathes spores, Vital beats a heart) → optional
**per-kind override** (the identity sharpeners: the Maw's chattering gape + saliva, the
Needle's lane-tracking spindle, the Roost's peeking drakelings, the Lung's deep inhale).
A NEW tower inherits a complete living body from its form + class with zero organism
code; `organismProblems()` bounds every field (and rejects `twitch = 0`).

### Enemies — reactive bodies

- **Gaze**: each body eases a gaze bearing toward the nearest tower ahead (staggered
  ~1/8-frame scans), overridden by a looming mega boss — drawn as a bright eye-glint at
  the leading edge. Detail-gated; bosses excluded (the chassis owns their theater).
- **Hit flinch**: already owned by `enemyForms` (`flinch` from the sim hitFlash) — kept.
- **Fear/stun trembling**: already owned by `statusFx`'s control-state body transform — kept.
- **Shield-shatter STAGGER** (new): the moment a shield breaks, the body reels with a
  brief rotation wobble riding the sim's `shieldFlash` window.

### Audio — the ambience director

`pollAmbientCue()` (polled by GameView each frame, `bioStage`/`graftPulse` precedent):
at most ONE quiet cue per ~2.6 s, rotating across alert towers' `voice` families
(`org_heart/breath/bone/acid/spore/chirp/hum` — peaks ≤ ~0.035, far under combat cues);
calm deep-idle breaths run 2.5× rarer; silent entirely past ~26 enemies (combat din owns
the mix). Layered one-shots by construction — the throttle makes loops impossible.

### Performance (measured)

`updateOrganisms` alone: **2–13 µs/frame** at 15 towers × 3–72 enemies (stub-ctx probe;
whole drawGame 1.6–3.2 ms there). Staggered scans halve cadence past `PERF.lodEnemyCount`;
emissions ride the same LOD flag; shocks cap at 24/frame. Tunables live in the `ORGANISM`
const (render-side pacing, deliberately NOT in core config — nothing here is balance).

### Invariants

- No function in `organism.ts` writes to `RenderState`, the sim, or the save.
- Pose amplitudes are capped inside `organismPose` — call sites cannot make it lurch.
- The alert band starts strictly OUTSIDE effective range: in-range prey belongs to the
  combat/idle systems, so anticipation can never double-animate an engaged tower.
