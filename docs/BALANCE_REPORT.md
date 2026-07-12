# BALANCE_REPORT — automated progression health

> Generated 2026-07-12 23:08 UTC by `npm run sim:report` (docs/SIMULATION-FRAMEWORK.md).
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
| Fresh Account | 10 | 74577 | 29 | 65 | 1 | 211 | 0 |
| Average Player | 400 | 14520200 | 139 | 142 | 44 | 1016 | 0 |
| Efficient Player | 400 | 13970424 | 142 | 146 | 45 | 989 | 0 |
| Unlucky Player | 400 | 14425608 | 139 | 138 | 44 | 997 | 0 |
| Lucky Player | 400 | 6016269 | 145 | 145 | 46 | 947 | 0 |
| Completionist | 400 | 16187314 | 139 | 145 | 44 | 1055 | 0 |
| Infinite-Focused | 400 | 6140189 | 127 | 136 | 40 | 895 | 0 |
| Campaign-Focused | 400 | 28068471 | 188 | 153 | 60 | 1190 | 258 |
| Hero-Focused | 400 | 16949392 | 139 | 143 | 44 | 1038 | 0 |
| Tower-Focused | 400 | 16573658 | 139 | 142 | 44 | 1057 | 0 |
| Equipment-Focused | 400 | 6240125 | 139 | 137 | 44 | 927 | 0 |

## Top progression bottlenecks

### 1. Futile frontier pushes — Campaign-Focused, 10h→50h

- **Severity:** MAJOR (score 1.5) · **Confidence:** High (100% of seeds)
- **Estimated player frustration:** High for this persona — repeated failed attempts feel like a rigged door.
- **Root cause:** Under-ready frontier attempts risk the run's time on a low win chance. (Amendment №1 shipped the mitigations: failed frontier attempts now pay depth-scaled field-data consolation, and readiness is surfaced on the deploy button + interstitial — the residual frequency is the persona's own risk appetite on an informed, partially-paid gamble.)
- **Affected systems:** Campaign difficulty at the frontier · failure feedback
- **Supporting data:** 28 failed frontier attempts in the band
- **Suggested solutions (candidates for human review):**
  - Slightly widen the winnable readiness window at low stages only (deferred — reshapes campaign gating).
  - Raise attemptFrac if campaign-persona pacing still lags the cohort (simulate first).
- **Estimated implementation difficulty:** Low

### 2. Dead progression zone — Infinite-Focused, 10h→50h

- **Severity:** MAJOR (score 1.35) · **Confidence:** Medium (60% of seeds)
- **Estimated player frustration:** High — sessions end with the same numbers they started with.
- **Root cause:** Per-run permanent gains saturate: mastery is logarithmic, star/upgrade sinks are already bought out at this depth, so farm runs stop moving Power.
- **Affected systems:** Mastery curve · star/upgrade sinks · loot→power conversion
- **Supporting data:** power 96320→82232 across 61 farm runs (seed 2000)
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
- **Supporting data:** 158 failed frontier attempts in the band
- **Suggested solutions (candidates for human review):**
  - Slightly widen the winnable readiness window at low stages only (deferred — reshapes campaign gating).
  - Raise attemptFrac if campaign-persona pacing still lags the cohort (simulate first).
- **Estimated implementation difficulty:** Low

### 5. Dead progression zone — Equipment-Focused, 10h→50h

- **Severity:** MINOR (score 0.45) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** High — sessions end with the same numbers they started with.
- **Root cause:** Per-run permanent gains saturate: mastery is logarithmic, star/upgrade sinks are already bought out at this depth, so farm runs stop moving Power.
- **Affected systems:** Mastery curve · star/upgrade sinks · loot→power conversion
- **Supporting data:** power 69355→63131 across 63 farm runs (seed 25757)
- **Suggested solutions (candidates for human review):**
  - Add a repeatable late-band Power sink (prestige layers 2+ are the reserved seam).
  - Raise deep-band loot yield via the ECONOMY_ADAPTIVE seams (weight-0 today; simulate first).
  - Extend star caps / gene levels for the affected band (content, not systems).
- **Estimated implementation difficulty:** Medium

### 6. Dead progression zone — Efficient Player, 150h→400h

- **Severity:** MINOR (score 0.3) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** High — sessions end with the same numbers they started with.
- **Root cause:** Per-run permanent gains saturate: mastery is logarithmic, star/upgrade sinks are already bought out at this depth, so farm runs stop moving Power.
- **Affected systems:** Mastery curve · star/upgrade sinks · loot→power conversion
- **Supporting data:** power 1647706→892190 across 248 farm runs (seed 2000)
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
- **Supporting data:** power 4490644→1971776 across 211 farm runs (seed 33676)
- **Suggested solutions (candidates for human review):**
  - Add a repeatable late-band Power sink (prestige layers 2+ are the reserved seam).
  - Raise deep-band loot yield via the ECONOMY_ADAPTIVE seams (weight-0 today; simulate first).
  - Extend star caps / gene levels for the affected band (content, not systems).
- **Estimated implementation difficulty:** Medium

### 8. Power spike — Efficient Player, 150h→400h

- **Severity:** MAJOR (score 0.28) · **Confidence:** Medium (40% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×82.4 vs cohort median ×9.8 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 9. Power spike — Lucky Player, 10h→50h

- **Severity:** MINOR (score 0.21) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×19.3 vs cohort median ×4.5 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 10. Power spike — Infinite-Focused, 10h→50h

- **Severity:** MINOR (score 0.21) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×2.7 vs cohort median ×0.9 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 11. Power spike — Tower-Focused, 10h→50h

- **Severity:** MINOR (score 0.21) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×15.3 vs cohort median ×4.8 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 12. Power spike — Average Player, 50h→150h

- **Severity:** MINOR (score 0.14) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×15.6 vs cohort median ×2.5 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 13. Power spike — Lucky Player, 50h→150h

- **Severity:** MINOR (score 0.14) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×21.2 vs cohort median ×6.8 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 14. Power spike — Completionist, 50h→150h

- **Severity:** MINOR (score 0.14) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×10.9 vs cohort median ×1.2 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 15. Power spike — Campaign-Focused, 50h→150h

- **Severity:** MINOR (score 0.14) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×34.3 vs cohort median ×3.9 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 16. Power spike — Tower-Focused, 50h→150h

- **Severity:** MINOR (score 0.14) · **Confidence:** Low (20% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×12.5 vs cohort median ×3.9 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

## Methodology & caveats

- Virtual accounts drive the REAL meta layer (finishRun/openContainer/spend APIs); only the run itself is modeled (`WORLD`).
- Personas are policy modulations (luck, spend discipline, loop deviation) — never balance changes.
- A frictionless bot underestimates real-player friction; treat absolute hours as lower bounds.
- Detector thresholds live in `src/dev/balanceReport.ts`; they are part of the instrument and version with it.
