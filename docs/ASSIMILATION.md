# ASSIMILATION.md — the Assimilation Index framework

> **The invisible heartbeat of ASSIMILATION.** One hidden per-run master state that measures how
> thoroughly the player has assimilated the battlefield *this run*, and the single driver every
> dynamic presentation system keys on — so the whole game evolves together instead of each system
> inventing its own thresholds.

- **Code:** `src/core/assimilation.ts` (pure framework), `src/render/assimilationFx.ts` (screen
  veil), `src/ui/AssimilationDebug.tsx` (developer panel). Consumed by `src/ui/GameView.tsx` (the run
  loop) and `src/core/game.ts` (`assimilationSignals()`).
- **System registry:** `assimilation` (see `docs/DEPENDENCY_GRAPH.md`).
- **Status:** BUILT — group-normalized fold with an allocation-free hot path; music/camera/screen/HUD
  channels wired; the **Ascension Moment** (tier-crossing flourish) is live. Tower/hero/nucleus/enemy
  channels remain documented extension points (see §Extension).

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
                 computeAssimilationTarget │  (allocation-free, group-normalized fold — the 8Hz hot path)
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

The fold has **two entry points**, one number in common:

- **`computeAssimilationTarget(signals): number`** — the **allocation-free hot path** the run loop
  calls at ~8 Hz. It iterates the contributor arrays directly and accumulates into **reused scratch
  scalars** (no arrays, no objects, no per-frame GC). Returns just the target index.
- **`computeAssimilation(signals): AssimilationBreakdown`** — the cold path (the debug panel). Same
  `raw`, plus a full per-contributor and **per-pillar** breakdown. Pinned to agree with the hot path.

Both fold the same way:

- Each profile reads one raw signal `≥ 0` and normalizes it with **soft saturation**
  `score = raw / (raw + half)` — smooth, monotonic, asymptotic to `1`, and never a step. `half` is
  the raw value that reads `0.5`.
- **Mode-calibrated.** `half` is calibrated for stage runs; a profile may carry `halfByMode`
  overrides keyed by `AssimilationSignals.mode` (the Game supplies its `RunMode`). Boss Rush is
  calibrated today (`wave` 16→6 — a rush wave is N simultaneous bosses; `bosses` 3.5→12 — boss kills
  are that mode's volume stat). **A future mode tunes its own feel with data rows, zero code**;
  unknown modes fall back to the defaults.
- **Group-normalized (the pillars).** Each group — declared in the single `ASSIMILATION_GROUPS`
  table (id, label, weight) — yields its OWN weighted-mean sub-score, then the group scores combine
  by their table weights: `Σ(groupWeight · groupScore) / Σ groupWeight`. This keeps the pillars
  **balanced at any content scale** — adding a battlefield contributor rebalances only *within*
  battlefield and can never swamp conquest (100 towers won't drown the boss-kill signal). Inherently
  bounded to `[0, 1]`. Strength stays the dominant single pillar because the Power Score is the
  universal contributor. Order, dense indices, scratch sizes and the debug panel's group list all
  derive from the table — **adding a pillar is one row** (plus its `ContributionGroup` union member).
- `stepAssimilation(state, target, dt)` eases the smoothed `index` toward the target — **asymmetric**
  (`ASSIM.riseRate > ASSIM.fallRate`): the organism grows briskly and relaxes slowly, so a combat
  lull never collapses the mood. It settles exactly at rest and is safe at any `dt`. It also detects
  **tier crossings** and fires the Ascension pulse (see §Presentation).
- The view recomputes the **target at ~8 Hz** (it folds run aggregates — event-ish, not per-frame)
  and **smooths every frame**, honoring the "avoid unnecessary per-frame calculation" guidance.

### Contribution profiles

The canonical contributors (`CONTRIBUTIONS` in `src/core/assimilation.ts`) — all tunable data, in
one place (`docs/GAME_CONSTITUTION.md` rule 15):

| Group | Contributor | Weight | Reads |
|---|---|---:|---|
| **strength** | Assimilated Power | 3.0 | live run **Power Score** (`src/core/power.ts`) |
| tempo | Wave Depth | 2.2 | current wave / Infinite / Rush depth (half 16; bossRush 6) |
| tempo | Live Biomass | 0.9 | biomass banked now |
| tempo | Active Adaptations | 0.5 | run-wide buffs live |
| conquest | Assimilated Enemies | 1.4 | kills this run |
| conquest | Total Biomass Reclaimed | 1.0 | biomass earned this run |
| conquest | Bosses Broken | 1.6 | bosses defeated this run |
| conquest | Mega Bosses Consumed | 2.0 | Mega Bosses defeated this run |
| conquest | Weak Points Ruptured | 1.2 | weak points destroyed this run |
| battlefield | Fielded Organisms | 1.0 | tower count |
| battlefield | Champions Present | 0.6 | hero count |
| battlefield | Strain Mutation | 1.0 | Σ (tower strain − 1) |
| battlefield | Branch Specialization | 0.8 | Σ tower branch tier |

The four pillars combine by **group weight** (`GROUP_WEIGHTS`): strength **3.0**, conquest **2.6**,
tempo **2.0**, battlefield **2.0**. A row's `Weight` above is its pull *within its own pillar*; the
pillar's share of the final index is fixed by its group weight, so contributors never inflate a
pillar by sheer count — the scalability guarantee.

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

- **The scalar channels are data** (`ASSIM_CHANNELS`): each is a `{ base, span, shape, from? }`
  curve row (`eased` = smootherstep; `from` delays the channel's onset — e.g. veins begin past
  ~Dominance). Tuning or adding a scalar channel is a row + a bundle field; the established values
  are pinned by tests so retunes are deliberate.
- **The hot path allocates nothing:** the run loop reuses ONE bundle via
  `assimilationPresentationInto(state, out)` (overwritten wholesale each frame — consume
  synchronously, never retain). `assimilationPresentation(state)` is the allocating convenience
  wrapper for cold paths (debug panel, tests).

- **Music** (`src/audio/music.ts` `setIntensity`) — the index raises the **floor** of the music
  intensity (`0.18 + 0.82·index`), while live combat pressure still spikes it. A deeply-assimilated
  run keeps the score grand even in a lull; the boss/mega tracks own their own category.
- **Camera heartbeat** (GameView transform) — a barely-perceptible view "breath" (`cameraAmp` ≤ 0.42%
  scale, at `cameraHz` ~ 33→60 bpm) that deepens with the index. Composes under the danger/wave zoom;
  capped so it reads as a pulse, never a zoom (`docs/CAMERA.md`).
- **Screen FX veil** (`src/render/assimilationFx.ts`, `drawAssimilationFx`) — a post-process drawn
  over the finished frame: organic vignette that tightens, tier-tinted rim glow, drifting spores
  (a minority blooming into brighter cells at high tiers), **membrane veins** that surface past
  Dominance (the `vein` channel — the world becoming tissue), and a faint biome tint, all modulated
  by a slow cardiac envelope. A true no-op at the Contained baseline (`index ≈ 0`), so early game is
  untouched.
- **The Ascension Moment** (`ascensionPulse`) — the payoff for the hidden heartbeat. The **first**
  time a run crosses into a higher tier, `stepAssimilation` fires a decaying pulse (gated on a
  strictly-increasing peak, so the slow relax never re-triggers it). The veil blooms in the new
  tier's color, a shock ring expands from center, and the tier's **name rises and fades**
  ("▲ DOMINANCE"). Brief, earned, unmistakable — the invisible system made momentarily visible at
  the seam, with **no persistent HUD number** to grind.
- **HUD glow** — the run loop publishes `--assim-glow` (0..1), `--assim-color` (r,g,b) and
  `--assim-ascend` (0..1) onto `.canvas-wrap`; `src/index.css` reads them for a subtle living aura
  around the battlefield frame that brightens on an Ascension crossing. It rings the frame only
  (never overlaps HUD text), so readability is untouched.

---

## Extension — plugging in future systems

Every likely addition is a **data row**, not a code change:

| You are adding… | Do this |
|---|---|
| A new **strength/progression system** | Nothing — it feeds the Power Score (rule 1), which already contributes. |
| A new **run signal** | Register a `ContributionProfile` reading a `custom` signal (below). |
| A new **game mode** | `halfByMode: { yourMode: … }` rows on whichever profiles need recalibrating. |
| A new **pillar** | One row in `ASSIMILATION_GROUPS` + its `ContributionGroup` union member. |
| A new **scalar presentation channel** | One `ASSIM_CHANNELS` row + a bundle field + its assignment. |
| A new **presentation consumer** | Read `assimilationPresentation(game.assimilation)` (or the bundle GameView already derives) — never invent a private threshold. |

The registration path in detail — **neither branch changes gameplay code**:

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
   interface never changes), and both fold paths consume it automatically. Registration **validates
   loudly** (non-empty id, known group, finite positive weight/half, no canonical-id collision) so a
   malformed row fails at module init instead of silently skewing the fold;
   `unregisterAssimilationContribution(id)` removes a runtime row (tests/HMR).

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
- **Weak Points Ruptured** (elite/boss dismantling) is now a live conquest contributor. A
  campaign-stage contributor is still omitted (no cheap in-run counter); add it as a profile when the
  counter lands.
- Tower/hero/nucleus/enemy/Mega-Boss/run-cinematic presentation consumers are specified here but not
  yet wired — they are the next content pass and plug into `assimilationPresentation` with no
  framework change.
- The hot fold is allocation-free via reused module-scope scratch scalars (`_num`/`_den`) — safe
  because the fold is synchronous and single-threaded (filled and read within one call). If the fold
  ever becomes re-entrant, give it local accumulators.
