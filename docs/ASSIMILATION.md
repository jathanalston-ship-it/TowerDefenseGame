# ASSIMILATION.md — the Assimilation Index framework

> **The invisible heartbeat of ASSIMILATE.** One hidden per-run master state that measures how
> thoroughly the player has assimilated the battlefield *this run*, and the single driver every
> dynamic presentation system keys on — so the whole game evolves together instead of each system
> inventing its own thresholds.

- **Code:** `src/core/assimilation.ts` (pure framework), `src/render/assimilationFx.ts` (screen
  veil), `src/ui/AssimilationDebug.tsx` (developer panel). Consumed by `src/ui/GameView.tsx` (the run
  loop) and `src/core/game.ts` (`assimilationSignals()`).
- **System registry:** `assimilation` (see `docs/DEPENDENCY_GRAPH.md`).
- **Status:** BUILT — framework + music/camera/screen/HUD channels wired; tower/hero/nucleus/enemy
  channels are documented extension points (see §Extension).

---

## What it is (and is not)

The Assimilation Index is **not** a currency, **not** a progression system, and **not** something
the player upgrades. It is **derived** — a continuously re-folded weighted mean of contributions
from every active system, normalized to `0..1`. It exists so that visuals, music, camera, screen FX
and (future) tower/hero/nucleus richness all rise **together**, continuously, with no hard "flip on"
moments. The battlefield transitions from *contained infestation → growing infection → regional
takeover → planetary organism* as one coherent mood.

It follows the **danger-camera pattern** (`src/core/dangerCamera.ts`): a pure, geometry-free,
zero-allocation state machine the caller owns and steps. It is **render-only by contract** — nothing
in the sim reads the index back, and `src/core/assimilation.ts` imports no React/DOM/state/render —
so a fixed seed's simulation is byte-identical with or without it (`docs/GAME_CONSTITUTION.md`
rule 12). It is never saved; a fresh run starts at `0` (Contained).

---

## Architecture

```
run state ──assimilationSignals()──▶ AssimilationSignals (flat bag)
                                          │
                       computeAssimilation │  (weighted fold of ContributionProfiles)
                                          ▼
                                   target 0..1  ──stepAssimilation(dt)──▶ AssimilationState.index
                                                                              │
                                                     assimilationPresentation │
                                                                              ▼
                              AssimilationPresentation { musicIntensity, vignette, glow,
                                                         spore, cameraAmp/Hz, hudGlow, color, tier }
                                                                              │
              ┌───────────────────────┬───────────────────┬─────────────────┴───────────────┐
              ▼                       ▼                   ▼                                   ▼
        music.setIntensity      camera heartbeat      drawAssimilationFx                --assim-* CSS
        (src/audio/music.ts)    (GameView transform)  (src/render/assimilationFx.ts)    (HUD frame glow)
```

- **State lives on the Game** as `game.assimilation` (`AssimilationState`, render-only, like
  `game.dangerCam`), but is **stepped in the view loop** (`src/ui/GameView.tsx`) — guaranteeing zero
  sim impact. The debug panel reads it via the active-game store.

---

## Calculation

`computeAssimilation(signals)` folds a flat `AssimilationSignals` bag through the
`ContributionProfile` registry:

- Each profile reads one raw signal `≥ 0` and normalizes it with **soft saturation**
  `score = raw / (raw + half)` — smooth, monotonic, asymptotic to `1`, and never a step. `half` is
  the raw value that reads `0.5`.
- The index is the **weight-normalized mean** of the sub-scores: `Σ(weight·score) / Σweight`, so it
  is inherently bounded to `[0, 1]` no matter how many contributors are added.
- `stepAssimilation(state, target, dt)` eases the smoothed `index` toward the target — **asymmetric**
  (`ASSIM.riseRate > ASSIM.fallRate`): the organism grows briskly and relaxes slowly, so a combat
  lull never collapses the mood. It settles exactly at rest and is safe at any `dt`.
- The view recomputes the **target at ~8 Hz** (it folds run aggregates — event-ish, not per-frame)
  and **smooths every frame**, honoring the "avoid unnecessary per-frame calculation" guidance.

### Contribution profiles

The canonical contributors (`CONTRIBUTIONS` in `src/core/assimilation.ts`) — all tunable data, in
one place (`docs/GAME_CONSTITUTION.md` rule 15):

| Group | Contributor | Weight | Reads |
|---|---|---:|---|
| **strength** | Assimilated Power | 3.0 | live run **Power Score** (`src/core/power.ts`) |
| tempo | Wave Depth | 2.2 | current wave / Infinite / Rush depth |
| tempo | Live Biomass | 0.9 | biomass banked now |
| tempo | Active Adaptations | 0.5 | run-wide buffs live |
| conquest | Assimilated Enemies | 1.4 | kills this run |
| conquest | Total Biomass Reclaimed | 1.0 | biomass earned this run |
| conquest | Bosses Broken | 1.6 | bosses defeated this run |
| conquest | Mega Bosses Consumed | 2.0 | Mega Bosses defeated this run |
| battlefield | Fielded Organisms | 1.0 | tower count |
| battlefield | Champions Present | 0.6 | hero count |
| battlefield | Strain Mutation | 1.0 | Σ (tower strain − 1) |
| battlefield | Branch Specialization | 0.8 | Σ tower branch tier |

> **The Power Score is the universal contributor.** Per `docs/GAME_CONSTITUTION.md` rule 1, *every*
> progression system already folds into the Power Score (`docs/POWER-SCORE.md`) — prestige, gene
> cards, equipment, mastery, stars, branches, mulligans, collection… So the single **Assimilated
> Power** row makes every present and future strength system raise the Assimilation Index **with no
> extra wiring.** The tempo/conquest/battlefield rows add the moment-to-moment climb *within* a run.

---

## Evolution tiers

There are **6 evolution tiers** (`ASSIMILATION_TIERS`), each a lower bound on the index. Adjacent
tiers **blend continuously** (`tierColorAt` interpolates the accent by progress) — never a hard flip.

| Tier | Name | Index ≥ | Feel |
|---|---|---:|---|
| 0 | Contained | 0.00 | contained infestation — the battlefield is still theirs |
| 1 | Colonization | 0.12 | the infection takes root; tendrils spread |
| 2 | Expansion | 0.28 | growing infection; the terrain begins to answer |
| 3 | Dominance | 0.46 | regional takeover; the field becomes an organ |
| 4 | Ascension | 0.64 | the world convulses around your growth |
| 5 | Planetary Assimilation | 0.82 | a planetary organism, fully awake |

`tierAt(index)` returns the owning tier and the `0..1` progress toward the next.

---

## Presentation channels

`assimilationPresentation(state)` derives **one bundle** all consumers read (never re-deriving
thresholds), so the game evolves in lockstep. Every channel is readability-preserving by
construction.

- **Music** (`src/audio/music.ts` `setIntensity`) — the index raises the **floor** of the music
  intensity (`0.18 + 0.82·index`), while live combat pressure still spikes it. A deeply-assimilated
  run keeps the score grand even in a lull; the boss/mega tracks own their own category.
- **Camera heartbeat** (GameView transform) — a barely-perceptible view "breath" (`cameraAmp` ≤ 0.42%
  scale, at `cameraHz` ~ 33→60 bpm) that deepens with the index. Composes under the danger/wave zoom;
  capped so it reads as a pulse, never a zoom (`docs/CAMERA.md`).
- **Screen FX veil** (`src/render/assimilationFx.ts`, `drawAssimilationFx`) — a post-process drawn
  over the finished frame: organic vignette that tightens, tier-tinted rim glow, drifting spores,
  and a faint biome tint, all modulated by a slow cardiac envelope. A true no-op at the Contained
  baseline (`index ≈ 0`), so early game is untouched.
- **HUD glow** — the run loop publishes `--assim-glow` (0..1) and `--assim-color` (r,g,b) onto
  `.canvas-wrap`; `src/index.css` reads them for a subtle living aura around the battlefield frame.
  It rings the frame only (never overlaps HUD text), so readability is untouched.

---

## Extension — plugging in future systems

Two paths, **neither of which changes gameplay code**:

1. **Implicit (free):** if the new system feeds the Power Score (it must, per rule 1), its strength
   automatically raises the **Assimilated Power** contribution. Nothing else to do.
2. **Explicit (a data row):** register a contribution profile that reads a **custom signal**:

   ```ts
   import { registerAssimilationContribution } from './assimilation';
   registerAssimilationContribution({
     id: 'nucleus-evolution', label: 'Nucleus Evolution', group: 'battlefield',
     weight: 1.2, half: 8, read: (s) => s.custom?.nucleusEvolution ?? 0,
   });
   ```

   The owning system injects its value into `AssimilationSignals.custom` (an open map, so the core
   interface never changes), and `computeAssimilation` consumes it automatically.

New **presentation** consumers (tower idle richness, hero implant glow, the Nucleus, enemy fear
tells, Mega Boss escalation, run cinematics) should read `assimilationPresentation(game.assimilation)`
and scale their intensity from it — never invent a private threshold. These are the documented
extension seams left open; the framework, and the music/camera/screen/HUD channels, are live today.

---

## Developer workflow

Open the **Debug panel** (`src/ui/DebugPanel.tsx` → 🧬 Assimilation Index section). It shows the live
index and tier, the grouped contribution breakdown (score + share), the derived presentation
readout, a live FX-veil preview, the tier ladder with thresholds and **instant tier-preview
buttons**, and a **manual override** slider. Engaging the override snaps every consumer
(music/camera/screen/HUD) to the previewed value in real time — with no gameplay effect — so you can
audit the whole mood at any depth without playing to it. "Release" resumes the run's own index.

---

## Known limitations / future hooks

- The `custom` signal seam and `registerAssimilationContribution` exist and are tested, but no
  content system registers a custom profile yet — everything routes through Power + run aggregates.
- Elite-kill and campaign-stage contributors are intentionally omitted for now (no cheap run counter
  exists); add them as profiles when the counters land.
- Tower/hero/nucleus/enemy/Mega-Boss/run-cinematic presentation consumers are specified here but not
  yet wired — they are the next content pass and plug into `assimilationPresentation` with no
  framework change.
