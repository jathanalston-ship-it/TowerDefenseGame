# BALANCE_REPORT — automated progression health

> Generated 2026-11-04 05:37 UTC by `npm run sim:report` (docs/SIMULATION-FRAMEWORK.md).
> **Report-only:** nothing here was auto-applied. Every bottleneck below awaits human review;
> the change protocol remains docs/BALANCE_ARCHITECTURE.md §4 (propose → simulate → record).

Matrix: 11 personas × 5 seeds · bands 10 / 50 / 150 / 400 hours · world model + policy in `src/dev/progressionSim.ts`.

## Personas

| Persona | Behavior |
|---|---|
| **Fresh Account** | First hours; spends late, fiddles long. |
| **Average Player** | Mostly loop-faithful; banks now and then. |
| **Efficient Player** | Loop-faithful optimum; spends everything immediately. |
| **Unlucky Player** | Bottom-quartile loot luck. |
| **Lucky Player** | Top-quartile loot luck. |
| **Completionist** | Buys every track including gene depth; heavier menus. |
| **Infinite-Focused** | Farms Infinite even when the campaign is ready. |
| **Campaign-Focused** | Pushes the frontier early; under-ready attempts can fail. |
| **Hero-Focused** | Champion tracks first when funds are tight. |
| **Tower-Focused** | Strain tracks first when funds are tight. |
| **Equipment-Focused** | Chases containers (extra Infinite) for gear. |

## Persona pacing (median seed by band-peak Power, final band)

| Persona | Hours | Band-peak power | Power at checkpoint | Stage | Best wave | Molts | Acquisitions | Failed pushes |
|---|---|---|---|---|---|---|---|---|
| Fresh Account | 10 | 79067 | 79067 | 29 | 62 | 1 | 316 | 0 |
| Average Player | 400 | 29100352 | 9312984 | 148 | 145 | 47 | 1439 | 0 |
| Efficient Player | 400 | 33619326 | 8264396 | 154 | 155 | 49 | 1465 | 0 |
| Unlucky Player | 400 | 29249977 | 29249977 | 149 | 153 | 47 | 1480 | 0 |
| Lucky Player | 400 | 36252783 | 14522897 | 157 | 153 | 50 | 1499 | 0 |
| Completionist | 400 | 34771626 | 3067909 | 154 | 156 | 49 | 1403 | 0 |
| Infinite-Focused | 400 | 24094860 | 2127964 | 136 | 146 | 43 | 1317 | 0 |
| Campaign-Focused | 400 | 68104679 | 31684658 | 203 | 165 | 65 | 1772 | 215 |
| Hero-Focused | 400 | 34725120 | 12136166 | 151 | 152 | 48 | 1436 | 0 |
| Tower-Focused | 400 | 34661963 | 20664752 | 151 | 154 | 48 | 1516 | 0 |
| Equipment-Focused | 400 | 29442636 | 7882552 | 148 | 142 | 47 | 1393 | 0 |

## Top progression bottlenecks

### 1. Futile frontier pushes — Campaign-Focused, 10h→50h

- **Severity:** MAJOR (score 1.5) · **Confidence:** High (100% of seeds)
- **Estimated player frustration:** High for this persona — repeated failed attempts feel like a rigged door.
- **Root cause:** Under-ready frontier attempts risk the run's time on a low win chance. (Amendment №1 shipped the mitigations: failed frontier attempts now pay depth-scaled field-data consolation, and readiness is surfaced on the deploy button + interstitial — the residual frequency is the persona's own risk appetite on an informed, partially-paid gamble.)
- **Affected systems:** Campaign difficulty at the frontier · failure feedback
- **Supporting data:** 32 failed frontier attempts in the band (of 60 under-ready attempts, 53% failed)
- **Suggested solutions (candidates for human review):**
  - Slightly widen the winnable readiness window at low stages only (deferred — reshapes campaign gating).
  - Raise attemptFrac if campaign-persona pacing still lags the cohort (simulate first).
- **Estimated implementation difficulty:** Low

### 2. Futile frontier pushes — Campaign-Focused, 50h→150h

- **Severity:** MAJOR (score 1) · **Confidence:** High (100% of seeds)
- **Estimated player frustration:** High for this persona — repeated failed attempts feel like a rigged door.
- **Root cause:** Under-ready frontier attempts risk the run's time on a low win chance. (Amendment №1 shipped the mitigations: failed frontier attempts now pay depth-scaled field-data consolation, and readiness is surfaced on the deploy button + interstitial — the residual frequency is the persona's own risk appetite on an informed, partially-paid gamble.)
- **Affected systems:** Campaign difficulty at the frontier · failure feedback
- **Supporting data:** 47 failed frontier attempts in the band (of 91 under-ready attempts, 52% failed)
- **Suggested solutions (candidates for human review):**
  - Slightly widen the winnable readiness window at low stages only (deferred — reshapes campaign gating).
  - Raise attemptFrac if campaign-persona pacing still lags the cohort (simulate first).
- **Estimated implementation difficulty:** Low

### 3. Futile frontier pushes — Campaign-Focused, 150h→400h

- **Severity:** MAJOR (score 1) · **Confidence:** High (100% of seeds)
- **Estimated player frustration:** High for this persona — repeated failed attempts feel like a rigged door.
- **Root cause:** Under-ready frontier attempts risk the run's time on a low win chance. (Amendment №1 shipped the mitigations: failed frontier attempts now pay depth-scaled field-data consolation, and readiness is surfaced on the deploy button + interstitial — the residual frequency is the persona's own risk appetite on an informed, partially-paid gamble.)
- **Affected systems:** Campaign difficulty at the frontier · failure feedback
- **Supporting data:** 142 failed frontier attempts in the band (of 200 under-ready attempts, 71% failed)
- **Suggested solutions (candidates for human review):**
  - Slightly widen the winnable readiness window at low stages only (deferred — reshapes campaign gating).
  - Raise attemptFrac if campaign-persona pacing still lags the cohort (simulate first).
- **Estimated implementation difficulty:** Low

## Methodology & caveats

- Virtual accounts drive the REAL meta layer (finishRun/openContainer/spend APIs); only the run itself is modeled (`WORLD`).
- Personas are policy modulations (luck, spend discipline, loop deviation) — never balance changes.
- Loot RNG is seeded per (seed, persona): the same code renders the same report, so a regenerated diff is a balance diff, not luck.
- Power is a sawtooth across Molts (each one resets the upgrade engine); growth and spikes are read band-peak to band-peak, and a band with a Molt is never a dead zone.
- A frictionless bot underestimates real-player friction; treat absolute hours as lower bounds.
- Detector thresholds live in `src/dev/balanceReport.ts`; they are part of the instrument and version with it.
