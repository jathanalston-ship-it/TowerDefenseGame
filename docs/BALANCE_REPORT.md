# BALANCE_REPORT — automated progression health

> Generated 2026-07-11 16:31 UTC by `npm run sim:report` (docs/SIMULATION-FRAMEWORK.md).
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
| Fresh Account | 10 | 43292 | 69 | 45 | 7 | 315 | 0 |
| Average Player | 400 | 2142946 | 187 | 136 | 60 | 956 | 0 |
| Efficient Player | 400 | 5674291 | 193 | 136 | 62 | 996 | 0 |
| Unlucky Player | 400 | 6444464 | 193 | 134 | 62 | 991 | 0 |
| Lucky Player | 400 | 4008318 | 199 | 137 | 64 | 997 | 0 |
| Completionist | 400 | 7036456 | 193 | 138 | 62 | 1010 | 0 |
| Infinite-Focused | 400 | 6534733 | 178 | 139 | 57 | 963 | 0 |
| Campaign-Focused | 400 | 22640366 | 234 | 152 | 75 | 1188 | 267 |
| Hero-Focused | 400 | 5136422 | 193 | 136 | 62 | 986 | 0 |
| Tower-Focused | 400 | 8856389 | 193 | 139 | 62 | 1026 | 0 |
| Equipment-Focused | 400 | 1662561 | 190 | 144 | 61 | 954 | 0 |

## Top progression bottlenecks

### 1. Futile frontier pushes — Campaign-Focused, 10h→50h

- **Severity:** MAJOR (score 1.5) · **Confidence:** High (100% of seeds)
- **Estimated player frustration:** High for this persona — repeated failed attempts feel like a rigged door.
- **Root cause:** Under-ready frontier attempts risk the run's time on a low win chance. (Amendment №1 shipped the mitigations: failed frontier attempts now pay depth-scaled field-data consolation, and readiness is surfaced on the deploy button + interstitial — the residual frequency is the persona's own risk appetite on an informed, partially-paid gamble.)
- **Affected systems:** Campaign difficulty at the frontier · failure feedback
- **Supporting data:** 15 failed frontier attempts in the band
- **Suggested solutions (candidates for human review):**
  - Slightly widen the winnable readiness window at low stages only (deferred — reshapes campaign gating).
  - Raise attemptFrac if campaign-persona pacing still lags the cohort (simulate first).
- **Estimated implementation difficulty:** Low

### 2. Futile frontier pushes — Campaign-Focused, 50h→150h

- **Severity:** MAJOR (score 1) · **Confidence:** High (100% of seeds)
- **Estimated player frustration:** High for this persona — repeated failed attempts feel like a rigged door.
- **Root cause:** Under-ready frontier attempts risk the run's time on a low win chance. (Amendment №1 shipped the mitigations: failed frontier attempts now pay depth-scaled field-data consolation, and readiness is surfaced on the deploy button + interstitial — the residual frequency is the persona's own risk appetite on an informed, partially-paid gamble.)
- **Affected systems:** Campaign difficulty at the frontier · failure feedback
- **Supporting data:** 51 failed frontier attempts in the band
- **Suggested solutions (candidates for human review):**
  - Slightly widen the winnable readiness window at low stages only (deferred — reshapes campaign gating).
  - Raise attemptFrac if campaign-persona pacing still lags the cohort (simulate first).
- **Estimated implementation difficulty:** Low

### 3. Futile frontier pushes — Campaign-Focused, 150h→400h

- **Severity:** MAJOR (score 1) · **Confidence:** High (100% of seeds)
- **Estimated player frustration:** High for this persona — repeated failed attempts feel like a rigged door.
- **Root cause:** Under-ready frontier attempts risk the run's time on a low win chance. (Amendment №1 shipped the mitigations: failed frontier attempts now pay depth-scaled field-data consolation, and readiness is surfaced on the deploy button + interstitial — the residual frequency is the persona's own risk appetite on an informed, partially-paid gamble.)
- **Affected systems:** Campaign difficulty at the frontier · failure feedback
- **Supporting data:** 124 failed frontier attempts in the band
- **Suggested solutions (candidates for human review):**
  - Slightly widen the winnable readiness window at low stages only (deferred — reshapes campaign gating).
  - Raise attemptFrac if campaign-persona pacing still lags the cohort (simulate first).
- **Estimated implementation difficulty:** Low

### 4. Dead progression zone — Average Player, 150h→400h

- **Severity:** MINOR (score 0.3) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** High — sessions end with the same numbers they started with.
- **Root cause:** Per-run permanent gains saturate: mastery is logarithmic, star/upgrade sinks are already bought out at this depth, so farm runs stop moving Power.
- **Affected systems:** Mastery curve · star/upgrade sinks · loot→power conversion
- **Supporting data:** power 1729444→1299614 across 257 farm runs (seed 2000)
- **Suggested solutions (candidates for human review):**
  - Add a repeatable late-band Power sink (prestige layers 2+ are the reserved seam).
  - Raise deep-band loot yield via the ECONOMY_ADAPTIVE seams (weight-0 today; simulate first).
  - Extend star caps / gene levels for the affected band (content, not systems).
- **Estimated implementation difficulty:** Medium

### 5. Dead progression zone — Lucky Player, 50h→150h

- **Severity:** MINOR (score 0.3) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** High — sessions end with the same numbers they started with.
- **Root cause:** Per-run permanent gains saturate: mastery is logarithmic, star/upgrade sinks are already bought out at this depth, so farm runs stop moving Power.
- **Affected systems:** Mastery curve · star/upgrade sinks · loot→power conversion
- **Supporting data:** power 336724→318590 across 119 farm runs (seed 33676)
- **Suggested solutions (candidates for human review):**
  - Add a repeatable late-band Power sink (prestige layers 2+ are the reserved seam).
  - Raise deep-band loot yield via the ECONOMY_ADAPTIVE seams (weight-0 today; simulate first).
  - Extend star caps / gene levels for the affected band (content, not systems).
- **Estimated implementation difficulty:** Medium

### 6. Dead progression zone — Lucky Player, 150h→400h

- **Severity:** MINOR (score 0.3) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** High — sessions end with the same numbers they started with.
- **Root cause:** Per-run permanent gains saturate: mastery is logarithmic, star/upgrade sinks are already bought out at this depth, so farm runs stop moving Power.
- **Affected systems:** Mastery curve · star/upgrade sinks · loot→power conversion
- **Supporting data:** power 1227345→1102401 across 244 farm runs (seed 2000)
- **Suggested solutions (candidates for human review):**
  - Add a repeatable late-band Power sink (prestige layers 2+ are the reserved seam).
  - Raise deep-band loot yield via the ECONOMY_ADAPTIVE seams (weight-0 today; simulate first).
  - Extend star caps / gene levels for the affected band (content, not systems).
- **Estimated implementation difficulty:** Medium

### 7. Dead progression zone — Hero-Focused, 150h→400h

- **Severity:** MINOR (score 0.3) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** High — sessions end with the same numbers they started with.
- **Root cause:** Per-run permanent gains saturate: mastery is logarithmic, star/upgrade sinks are already bought out at this depth, so farm runs stop moving Power.
- **Affected systems:** Mastery curve · star/upgrade sinks · loot→power conversion
- **Supporting data:** power 1900178→1547633 across 248 farm runs (seed 25757)
- **Suggested solutions (candidates for human review):**
  - Add a repeatable late-band Power sink (prestige layers 2+ are the reserved seam).
  - Raise deep-band loot yield via the ECONOMY_ADAPTIVE seams (weight-0 today; simulate first).
  - Extend star caps / gene levels for the affected band (content, not systems).
- **Estimated implementation difficulty:** Medium

### 8. Power spike — Efficient Player, 50h→150h

- **Severity:** MAJOR (score 0.28) · **Confidence:** Medium (40% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×15.0 vs cohort median ×1.9 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 9. Power spike — Campaign-Focused, 50h→150h

- **Severity:** MAJOR (score 0.28) · **Confidence:** Medium (40% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×14.1 vs cohort median ×3.4 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 10. Power spike — Hero-Focused, 150h→400h

- **Severity:** MAJOR (score 0.28) · **Confidence:** Medium (40% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×18.5 vs cohort median ×3.1 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 11. Power spike — Equipment-Focused, 10h→50h

- **Severity:** MINOR (score 0.21) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×13.2 vs cohort median ×3.3 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 12. Power spike — Efficient Player, 150h→400h

- **Severity:** MINOR (score 0.14) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×24.0 vs cohort median ×6.7 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 13. Power spike — Lucky Player, 50h→150h

- **Severity:** MINOR (score 0.14) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×10.6 vs cohort median ×3.4 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 14. Power spike — Lucky Player, 150h→400h

- **Severity:** MINOR (score 0.14) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×32.4 vs cohort median ×2.7 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 15. Power spike — Completionist, 150h→400h

- **Severity:** MINOR (score 0.14) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×16.8 vs cohort median ×4.5 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 16. Power spike — Infinite-Focused, 50h→150h

- **Severity:** MINOR (score 0.14) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×19.8 vs cohort median ×5.7 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

## Methodology & caveats

- Virtual accounts drive the REAL meta layer (finishRun/openContainer/spend APIs); only the run itself is modeled (`WORLD`).
- Personas are policy modulations (luck, spend discipline, loop deviation) — never balance changes.
- A frictionless bot underestimates real-player friction; treat absolute hours as lower bounds.
- Detector thresholds live in `src/dev/balanceReport.ts`; they are part of the instrument and version with it.
