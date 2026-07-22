# BALANCE_REPORT — automated progression health

> Generated 2026-07-22 01:42 UTC by `npm run sim:report` (docs/SIMULATION-FRAMEWORK.md).
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

## Persona pacing (median seed, final band)

| Persona | Hours | Power | Stage | Best wave | Molts | Acquisitions | Failed pushes |
|---|---|---|---|---|---|---|---|
| Fresh Account | 10 | 72243 | 29 | 63 | 1 | 257 | 0 |
| Average Player | 400 | 2636360 | 131 | 141 | 41 | 852 | 0 |
| Efficient Player | 400 | 3336128 | 136 | 142 | 43 | 879 | 0 |
| Unlucky Player | 400 | 4509268 | 133 | 144 | 42 | 862 | 0 |
| Lucky Player | 400 | 14817474 | 139 | 144 | 44 | 1025 | 0 |
| Completionist | 400 | 6154524 | 133 | 136 | 42 | 905 | 0 |
| Infinite-Focused | 400 | 4085966 | 127 | 134 | 40 | 862 | 0 |
| Campaign-Focused | 400 | 17083731 | 187 | 150 | 60 | 1108 | 275 |
| Hero-Focused | 400 | 7724120 | 136 | 137 | 43 | 935 | 0 |
| Tower-Focused | 400 | 6370506 | 133 | 143 | 42 | 906 | 0 |
| Equipment-Focused | 400 | 3536100 | 130 | 140 | 41 | 861 | 0 |

## Top progression bottlenecks

### 1. Futile frontier pushes — Campaign-Focused, 10h→50h

- **Severity:** MAJOR (score 1.5) · **Confidence:** High (100% of seeds)
- **Estimated player frustration:** High for this persona — repeated failed attempts feel like a rigged door.
- **Root cause:** Under-ready frontier attempts risk the run's time on a low win chance. (Amendment №1 shipped the mitigations: failed frontier attempts now pay depth-scaled field-data consolation, and readiness is surfaced on the deploy button + interstitial — the residual frequency is the persona's own risk appetite on an informed, partially-paid gamble.)
- **Affected systems:** Campaign difficulty at the frontier · failure feedback
- **Supporting data:** 30 failed frontier attempts in the band
- **Suggested solutions (candidates for human review):**
  - Slightly widen the winnable readiness window at low stages only (deferred — reshapes campaign gating).
  - Raise attemptFrac if campaign-persona pacing still lags the cohort (simulate first).
- **Estimated implementation difficulty:** Low

### 2. Dead progression zone — Unlucky Player, 10h→50h

- **Severity:** MAJOR (score 1.35) · **Confidence:** Medium (60% of seeds)
- **Estimated player frustration:** High — sessions end with the same numbers they started with.
- **Root cause:** Per-run permanent gains saturate: mastery is logarithmic, star/upgrade sinks are already bought out at this depth, so farm runs stop moving Power.
- **Affected systems:** Mastery curve · star/upgrade sinks · loot→power conversion
- **Supporting data:** power 107042→97672 across 65 farm runs (seed 9919)
- **Suggested solutions (candidates for human review):**
  - Add a repeatable late-band Power sink (prestige layers 2+ are the reserved seam).
  - Raise deep-band loot yield via the ECONOMY_ADAPTIVE seams (weight-0 today; simulate first).
  - Extend star caps / gene levels for the affected band (content, not systems).
- **Estimated implementation difficulty:** Medium

### 3. Futile frontier pushes — Campaign-Focused, 50h→150h

- **Severity:** MAJOR (score 1) · **Confidence:** High (100% of seeds)
- **Estimated player frustration:** High for this persona — repeated failed attempts feel like a rigged door.
- **Root cause:** Under-ready frontier attempts risk the run's time on a low win chance. (Amendment №1 shipped the mitigations: failed frontier attempts now pay depth-scaled field-data consolation, and readiness is surfaced on the deploy button + interstitial — the residual frequency is the persona's own risk appetite on an informed, partially-paid gamble.)
- **Affected systems:** Campaign difficulty at the frontier · failure feedback
- **Supporting data:** 63 failed frontier attempts in the band
- **Suggested solutions (candidates for human review):**
  - Slightly widen the winnable readiness window at low stages only (deferred — reshapes campaign gating).
  - Raise attemptFrac if campaign-persona pacing still lags the cohort (simulate first).
- **Estimated implementation difficulty:** Low

### 4. Futile frontier pushes — Campaign-Focused, 150h→400h

- **Severity:** MAJOR (score 1) · **Confidence:** High (100% of seeds)
- **Estimated player frustration:** High for this persona — repeated failed attempts feel like a rigged door.
- **Root cause:** Under-ready frontier attempts risk the run's time on a low win chance. (Amendment №1 shipped the mitigations: failed frontier attempts now pay depth-scaled field-data consolation, and readiness is surfaced on the deploy button + interstitial — the residual frequency is the persona's own risk appetite on an informed, partially-paid gamble.)
- **Affected systems:** Campaign difficulty at the frontier · failure feedback
- **Supporting data:** 174 failed frontier attempts in the band
- **Suggested solutions (candidates for human review):**
  - Slightly widen the winnable readiness window at low stages only (deferred — reshapes campaign gating).
  - Raise attemptFrac if campaign-persona pacing still lags the cohort (simulate first).
- **Estimated implementation difficulty:** Low

### 5. Dead progression zone — Campaign-Focused, 10h→50h

- **Severity:** MINOR (score 0.45) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** High — sessions end with the same numbers they started with.
- **Root cause:** Per-run permanent gains saturate: mastery is logarithmic, star/upgrade sinks are already bought out at this depth, so farm runs stop moving Power.
- **Affected systems:** Mastery curve · star/upgrade sinks · loot→power conversion
- **Supporting data:** power 79556→71202 across 57 farm runs (seed 2000)
- **Suggested solutions (candidates for human review):**
  - Add a repeatable late-band Power sink (prestige layers 2+ are the reserved seam).
  - Raise deep-band loot yield via the ECONOMY_ADAPTIVE seams (weight-0 today; simulate first).
  - Extend star caps / gene levels for the affected band (content, not systems).
- **Estimated implementation difficulty:** Medium

### 6. Dead progression zone — Lucky Player, 50h→150h

- **Severity:** MINOR (score 0.3) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** High — sessions end with the same numbers they started with.
- **Root cause:** Per-run permanent gains saturate: mastery is logarithmic, star/upgrade sinks are already bought out at this depth, so farm runs stop moving Power.
- **Affected systems:** Mastery curve · star/upgrade sinks · loot→power conversion
- **Supporting data:** power 180616→181780 across 131 farm runs (seed 25757)
- **Suggested solutions (candidates for human review):**
  - Add a repeatable late-band Power sink (prestige layers 2+ are the reserved seam).
  - Raise deep-band loot yield via the ECONOMY_ADAPTIVE seams (weight-0 today; simulate first).
  - Extend star caps / gene levels for the affected band (content, not systems).
- **Estimated implementation difficulty:** Medium

### 7. Dead progression zone — Campaign-Focused, 150h→400h

- **Severity:** MINOR (score 0.3) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** High — sessions end with the same numbers they started with.
- **Root cause:** Per-run permanent gains saturate: mastery is logarithmic, star/upgrade sinks are already bought out at this depth, so farm runs stop moving Power.
- **Affected systems:** Mastery curve · star/upgrade sinks · loot→power conversion
- **Supporting data:** power 7151205→1264725 across 211 farm runs (seed 17838)
- **Suggested solutions (candidates for human review):**
  - Add a repeatable late-band Power sink (prestige layers 2+ are the reserved seam).
  - Raise deep-band loot yield via the ECONOMY_ADAPTIVE seams (weight-0 today; simulate first).
  - Extend star caps / gene levels for the affected band (content, not systems).
- **Estimated implementation difficulty:** Medium

### 8. Power spike — Completionist, 50h→150h

- **Severity:** MAJOR (score 0.28) · **Confidence:** Medium (40% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×9.3 vs cohort median ×2.4 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 9. Unlock-cadence gap — Campaign-Focused, 150h→400h

- **Severity:** MINOR (score 0.24) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** Moderate-high — nothing new to click on for hours erodes the return habit.
- **Root cause:** Acquisition cadence collapses: everything cheap is owned and the next unlock is a long single goal with no intermediate beats. (Amendment №1 shipped the deep-band achievement ladder + Antigen spending in the meter; residual gaps are what remains after those beats.)
- **Affected systems:** Unlock pacing · achievements · next-goal engine · container cadence
- **Supporting data:** 103 acquisitions in 250h (0.41/h)
- **Suggested solutions (candidates for human review):**
  - Tilt container cadence slightly richer in the band (LOOT_EARN; simulate first).
  - Split one large unlock into staged partial unlocks (visible progress).
  - Reserve the deepest beats for prestige layers 2+ content (the planned seam).
- **Estimated implementation difficulty:** Low

### 10. Power spike — Average Player, 10h→50h

- **Severity:** MINOR (score 0.21) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×6.8 vs cohort median ×2.0 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 11. Power spike — Unlucky Player, 10h→50h

- **Severity:** MINOR (score 0.21) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×3.5 vs cohort median ×0.9 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 12. Power spike — Infinite-Focused, 10h→50h

- **Severity:** MINOR (score 0.21) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×18.8 vs cohort median ×2.8 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 13. Power spike — Equipment-Focused, 10h→50h

- **Severity:** MINOR (score 0.21) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×10.2 vs cohort median ×2.5 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 14. Power spike — Average Player, 50h→150h

- **Severity:** MINOR (score 0.14) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×16.1 vs cohort median ×3.4 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 15. Power spike — Average Player, 150h→400h

- **Severity:** MINOR (score 0.14) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×19.7 vs cohort median ×5.1 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 16. Power spike — Lucky Player, 50h→150h

- **Severity:** MINOR (score 0.14) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×9.5 vs cohort median ×2.9 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 17. Power spike — Equipment-Focused, 50h→150h

- **Severity:** MINOR (score 0.14) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×21.3 vs cohort median ×2.5 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

## Methodology & caveats

- Virtual accounts drive the REAL meta layer (finishRun/openContainer/spend APIs); only the run itself is modeled (`WORLD`).
- Personas are policy modulations (luck, spend discipline, loop deviation) — never balance changes.
- A frictionless bot underestimates real-player friction; treat absolute hours as lower bounds.
- Detector thresholds live in `src/dev/balanceReport.ts`; they are part of the instrument and version with it.
