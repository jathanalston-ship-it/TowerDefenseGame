# DEV-FRAMEWORKS.md — Sim Harness · Difficulty · Spawn Director · Content Validation

Four infrastructure frameworks that make future content cheap to build, tune, and trust.
All four are **golden-safe**: each is additive and identity-by-default, so the golden
characterization tests stay **byte-identical** (verified) and shipping gameplay is unchanged.

---

## 1. Combat simulation framework (`src/core/simharness.ts`) — developer-only

Runs whole battles with **no player** (an autopilot builds towers, drafts, and fights) and
reports the metrics you need to balance content. Pure observation: it constructs its own
`Game` instances and only **reads public state** (never subscribes to events or mutates the
sim), so it can't perturb a deterministic run and is **not in the app bundle** (imported only
by tests/dev tooling).

- `simulateBattle(cfg) → SimReport` — one run. Measures **tower DPS** (per kind + team),
  **hero DPS**, **enemy survival** (kill-rate, avg lifetime, leaks), **economy generation**
  (biomass/sec), **wave duration** (per-wave), and **status-effect uptime**
  (Fracture/Corrosion/Infection/Disruption, as affected-enemy-seconds ÷ alive-enemy-seconds).
- `sweepSeeds(seeds, base) → SimAggregate` — averages the metrics across a seed sweep (the
  "rapid balancing" entry point: change one knob, sweep, compare aggregates).
- `formatReport(report)` — a one-screen console/CI summary.

Deterministic: same config → identical report.

```ts
import { simulateBattle, sweepSeeds, formatReport } from './core/simharness';
console.log(formatReport(simulateBattle({ seed: 1 })));
const agg = sweepSeeds([1, 7, 42, 777], { difficulty: 'hardened' });
```

## 2. Universal difficulty framework (`src/core/difficulty.ts`)

ONE place that expresses how hard a run is, so every mode references the **same knobs**
instead of hardcoding difficulty math. A `DifficultyDef` is six global scalars layered **on
top of** the base balance curves (never editing them):

| lever | scales |
|---|---|
| `enemyHealthMult` | enemy HP |
| `enemyDamageMult` | enemy integrity/contact damage |
| `spawnRateMult` | spawn cadence (>1 = tighter spacing) |
| `eliteChanceMult` | elite-promotion chance (Director) |
| `rewardMult` | bounty + biomass income |
| `bossFrequencyMult` | how often (mini)bosses appear |

- **`standard` is identity** (every scalar 1) ⇒ the shipping game + golden tests are
  byte-identical (×1 / no clamp-change is an IEEE-754 no-op).
- A run picks one via `RunOptions.difficulty` (id; defaults to `'standard'`). **Every mode
  inherits it for free** — Stage and Endless already thread it; a future mode just passes an id.
- Presets ship for future modes: `relaxed`, `hardened`, `brutal`, `nightmare`.
- **Boundary:** difficulty scales the *normal enemy stream* + the Director's cadence/elite/
  reward levers. **Bosses scale by Threat Level** (their own axis), not the global damage knob.

> The framework + wiring are complete; surfacing a difficulty *picker* in the menu is a
> follow-up UI task (intentionally deferred — it's gameplay-facing and not needed by any
> current mode, which all default to Standard).

## 3. Spawn Director (`src/core/spawndirector.ts`)

Owns the **mechanics of emitting spawns** — spacing, timing, composition layout, pacing,
elite timing, boss timing, and special events — and nothing else. Deliberately decoupled
from **what** spawns (composition: authored `WAVES` or the AI `Director`) and from **enemy
AI** (movement lives in the sim's move system). Pure + deterministic (no rng, no sim state).

- `scheduleScripted(def, now, hpMult, bountyMult, rateMult)` — Stage/golden path.
- `scheduleDirected(wave, now, hpMult, bountyMult, rateMult)` — Endless; lays the Director's
  groups on the endless cadence and appends special events.
- `eventsFor(wave, now, rateMult)` — the special-event list (swarm flood today; the seam for
  future ambush/eruption events — each compiles to `QueuedSpawn`s, so the Game needs no new code).

The cadence tunables moved out of inline magic numbers into `SPAWN` (config.ts); the defaults
**equal the former literals**, so the scripted/endless queues are byte-identical (a test pins
this). Difficulty's `spawnRateMult` is applied here (÷ spacing); at ×1 it's a no-op.

## 4. Automated content validation (`src/core/validate.ts`)

`validateAllContentReport() → ValidationReport` classifies every authoring failure into the
seven canonical categories, so a content mistake is obvious the moment it's introduced (dev
boot logs it; CI/tests assert it). **Pure analysis — never affects gameplay.**

| category | catches |
|---|---|
| `duplicate-id` | two defs sharing a stable id (per catalog) |
| `missing-asset` | absent/invalid name or color (placeholder-art slot) |
| `invalid-reference` | wave→enemy, boss→add/module, item→set, effect/upgrade→field |
| `invalid-stat` | out-of-range / non-finite values (the registries' own validators) |
| `missing-localization` | empty user-facing name/description strings |
| `broken-upgrade-chain` | non-monotonic star/mastery/affix-tier/boss-phase curves |
| `invalid-loot-table` | malformed chest ranges/odds, empty drop pools |

Each `ValidationIssue` carries `{ category, target, message, severity }`; `formatReport`
renders them. `validateEffects(effects, target)` is exported to check a **new** def's effects
before it's registered. The legacy `validateAllContent()` (string[]) is unchanged.
