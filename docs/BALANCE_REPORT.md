# BALANCE_REPORT — automated progression health

> Generated 2026-07-03 00:29 UTC by `npm run sim:report` (docs/SIMULATION-FRAMEWORK.md).
> **Report-only:** nothing here was auto-applied. Every bottleneck below awaits human review;
> the change protocol remains docs/BALANCE_ARCHITECTURE.md §4 (propose → simulate → record).

Matrix: 11 personas × 4 seeds · bands 10 / 50 / 150 / 400 hours · world model + policy in `src/dev/progressionSim.ts`.

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
| Fresh Account | 10 | 86739 | 69 | 60 | 8 | 244 | 0 |
| Average Player | 400 | 10048594 | 173 | 141 | 55 | 676 | 0 |
| Efficient Player | 400 | 24500767 | 174 | 152 | 55 | 755 | 0 |
| Unlucky Player | 400 | 5870544 | 172 | 147 | 55 | 657 | 0 |
| Lucky Player | 400 | 27108939 | 176 | 154 | 56 | 761 | 0 |
| Completionist | 400 | 23883447 | 174 | 147 | 55 | 754 | 0 |
| Infinite-Focused | 400 | 8236909 | 163 | 140 | 52 | 662 | 0 |
| Campaign-Focused | 400 | 10707987 | 211 | 157 | 68 | 744 | 233 |
| Hero-Focused | 400 | 24402924 | 175 | 146 | 56 | 756 | 0 |
| Tower-Focused | 400 | 24187508 | 174 | 149 | 55 | 754 | 0 |
| Equipment-Focused | 400 | 12101225 | 172 | 152 | 55 | 694 | 0 |

## Top progression bottlenecks

### 1. Futile frontier pushes — Campaign-Focused, 10h→50h

- **Severity:** MAJOR (score 1.5) · **Confidence:** High (100% of seeds)
- **Estimated player frustration:** High for this persona — repeated failed attempts feel like a rigged door.
- **Root cause:** Under-ready frontier attempts carry near-zero win chance with full time cost — impatient players pay a heavy invisible tax.
- **Affected systems:** Campaign difficulty at the frontier · failure feedback
- **Supporting data:** 13 failed frontier attempts in the band
- **Suggested solutions (candidates for human review):**
  - Surface the readiness estimate harder at mission start (UI, zero balance risk).
  - Grant partial consolation rewards on failed frontier attempts.
  - Slightly widen the winnable readiness window at low stages only.
- **Estimated implementation difficulty:** Low

### 2. Futile frontier pushes — Campaign-Focused, 50h→150h

- **Severity:** MAJOR (score 1) · **Confidence:** High (100% of seeds)
- **Estimated player frustration:** High for this persona — repeated failed attempts feel like a rigged door.
- **Root cause:** Under-ready frontier attempts carry near-zero win chance with full time cost — impatient players pay a heavy invisible tax.
- **Affected systems:** Campaign difficulty at the frontier · failure feedback
- **Supporting data:** 49 failed frontier attempts in the band
- **Suggested solutions (candidates for human review):**
  - Surface the readiness estimate harder at mission start (UI, zero balance risk).
  - Grant partial consolation rewards on failed frontier attempts.
  - Slightly widen the winnable readiness window at low stages only.
- **Estimated implementation difficulty:** Low

### 3. Futile frontier pushes — Campaign-Focused, 150h→400h

- **Severity:** MAJOR (score 1) · **Confidence:** High (100% of seeds)
- **Estimated player frustration:** High for this persona — repeated failed attempts feel like a rigged door.
- **Root cause:** Under-ready frontier attempts carry near-zero win chance with full time cost — impatient players pay a heavy invisible tax.
- **Affected systems:** Campaign difficulty at the frontier · failure feedback
- **Supporting data:** 167 failed frontier attempts in the band
- **Suggested solutions (candidates for human review):**
  - Surface the readiness estimate harder at mission start (UI, zero balance risk).
  - Grant partial consolation rewards on failed frontier attempts.
  - Slightly widen the winnable readiness window at low stages only.
- **Estimated implementation difficulty:** Low

### 4. Unlock-cadence gap — Unlucky Player, 150h→400h

- **Severity:** CRITICAL (score 0.9) · **Confidence:** High (75% of seeds)
- **Estimated player frustration:** Moderate-high — nothing new to click on for hours erodes the return habit.
- **Root cause:** Acquisition cadence collapses: everything cheap is owned and the next unlock is a long single goal with no intermediate beats.
- **Affected systems:** Unlock pacing · achievements · next-goal engine · container cadence
- **Supporting data:** 108 acquisitions in 250h (0.43/h)
- **Suggested solutions (candidates for human review):**
  - Author micro-milestones (achievements/timeline beats) across the gap band.
  - Split one large unlock into staged partial unlocks (visible progress).
  - Tilt container cadence slightly richer in the band (LOOT_EARN; simulate first).
- **Estimated implementation difficulty:** Low

### 5. Unlock-cadence gap — Campaign-Focused, 150h→400h

- **Severity:** CRITICAL (score 0.9) · **Confidence:** High (75% of seeds)
- **Estimated player frustration:** Moderate-high — nothing new to click on for hours erodes the return habit.
- **Root cause:** Acquisition cadence collapses: everything cheap is owned and the next unlock is a long single goal with no intermediate beats.
- **Affected systems:** Unlock pacing · achievements · next-goal engine · container cadence
- **Supporting data:** 101 acquisitions in 250h (0.40/h)
- **Suggested solutions (candidates for human review):**
  - Author micro-milestones (achievements/timeline beats) across the gap band.
  - Split one large unlock into staged partial unlocks (visible progress).
  - Tilt container cadence slightly richer in the band (LOOT_EARN; simulate first).
- **Estimated implementation difficulty:** Low

### 6. Unlock-cadence gap — Equipment-Focused, 150h→400h

- **Severity:** CRITICAL (score 0.9) · **Confidence:** High (75% of seeds)
- **Estimated player frustration:** Moderate-high — nothing new to click on for hours erodes the return habit.
- **Root cause:** Acquisition cadence collapses: everything cheap is owned and the next unlock is a long single goal with no intermediate beats.
- **Affected systems:** Unlock pacing · achievements · next-goal engine · container cadence
- **Supporting data:** 119 acquisitions in 250h (0.48/h)
- **Suggested solutions (candidates for human review):**
  - Author micro-milestones (achievements/timeline beats) across the gap band.
  - Split one large unlock into staged partial unlocks (visible progress).
  - Tilt container cadence slightly richer in the band (LOOT_EARN; simulate first).
- **Estimated implementation difficulty:** Low

### 7. Dead progression zone — Campaign-Focused, 150h→400h

- **Severity:** MAJOR (score 0.75) · **Confidence:** Medium (50% of seeds)
- **Estimated player frustration:** High — sessions end with the same numbers they started with.
- **Root cause:** Per-run permanent gains saturate: mastery is logarithmic, star/upgrade sinks are already bought out at this depth, so farm runs stop moving Power.
- **Affected systems:** Mastery curve · star/upgrade sinks · loot→power conversion
- **Supporting data:** power 5388222→3233334 across 205 farm runs (seed 2000)
- **Suggested solutions (candidates for human review):**
  - Add a repeatable late-band Power sink (prestige layers 2+ are the reserved seam).
  - Raise deep-band loot yield via the ECONOMY_ADAPTIVE seams (weight-0 today; simulate first).
  - Extend star caps / gene levels for the affected band (content, not systems).
- **Estimated implementation difficulty:** Medium

### 8. Unlock-cadence gap — Infinite-Focused, 150h→400h

- **Severity:** MAJOR (score 0.6) · **Confidence:** Medium (50% of seeds)
- **Estimated player frustration:** Moderate-high — nothing new to click on for hours erodes the return habit.
- **Root cause:** Acquisition cadence collapses: everything cheap is owned and the next unlock is a long single goal with no intermediate beats.
- **Affected systems:** Unlock pacing · achievements · next-goal engine · container cadence
- **Supporting data:** 117 acquisitions in 250h (0.47/h)
- **Suggested solutions (candidates for human review):**
  - Author micro-milestones (achievements/timeline beats) across the gap band.
  - Split one large unlock into staged partial unlocks (visible progress).
  - Tilt container cadence slightly richer in the band (LOOT_EARN; simulate first).
- **Estimated implementation difficulty:** Low

### 9. Dead progression zone — Tower-Focused, 50h→150h

- **Severity:** MINOR (score 0.375) · **Confidence:** Low (25% of seeds)
- **Estimated player frustration:** High — sessions end with the same numbers they started with.
- **Root cause:** Per-run permanent gains saturate: mastery is logarithmic, star/upgrade sinks are already bought out at this depth, so farm runs stop moving Power.
- **Affected systems:** Mastery curve · star/upgrade sinks · loot→power conversion
- **Supporting data:** power 472235→430572 across 117 farm runs (seed 9919)
- **Suggested solutions (candidates for human review):**
  - Add a repeatable late-band Power sink (prestige layers 2+ are the reserved seam).
  - Raise deep-band loot yield via the ECONOMY_ADAPTIVE seams (weight-0 today; simulate first).
  - Extend star caps / gene levels for the affected band (content, not systems).
- **Estimated implementation difficulty:** Medium

### 10. Dead progression zone — Tower-Focused, 150h→400h

- **Severity:** MINOR (score 0.375) · **Confidence:** Low (25% of seeds)
- **Estimated player frustration:** High — sessions end with the same numbers they started with.
- **Root cause:** Per-run permanent gains saturate: mastery is logarithmic, star/upgrade sinks are already bought out at this depth, so farm runs stop moving Power.
- **Affected systems:** Mastery curve · star/upgrade sinks · loot→power conversion
- **Supporting data:** power 2412972→1594497 across 236 farm runs (seed 25757)
- **Suggested solutions (candidates for human review):**
  - Add a repeatable late-band Power sink (prestige layers 2+ are the reserved seam).
  - Raise deep-band loot yield via the ECONOMY_ADAPTIVE seams (weight-0 today; simulate first).
  - Extend star caps / gene levels for the affected band (content, not systems).
- **Estimated implementation difficulty:** Medium

### 11. Dead progression zone — Equipment-Focused, 150h→400h

- **Severity:** MINOR (score 0.375) · **Confidence:** Low (25% of seeds)
- **Estimated player frustration:** High — sessions end with the same numbers they started with.
- **Root cause:** Per-run permanent gains saturate: mastery is logarithmic, star/upgrade sinks are already bought out at this depth, so farm runs stop moving Power.
- **Affected systems:** Mastery curve · star/upgrade sinks · loot→power conversion
- **Supporting data:** power 3039356→1942166 across 235 farm runs (seed 17838)
- **Suggested solutions (candidates for human review):**
  - Add a repeatable late-band Power sink (prestige layers 2+ are the reserved seam).
  - Raise deep-band loot yield via the ECONOMY_ADAPTIVE seams (weight-0 today; simulate first).
  - Extend star caps / gene levels for the affected band (content, not systems).
- **Estimated implementation difficulty:** Medium

### 12. Unlock-cadence gap — Tower-Focused, 150h→400h

- **Severity:** MINOR (score 0.3) · **Confidence:** Low (25% of seeds)
- **Estimated player frustration:** Moderate-high — nothing new to click on for hours erodes the return habit.
- **Root cause:** Acquisition cadence collapses: everything cheap is owned and the next unlock is a long single goal with no intermediate beats.
- **Affected systems:** Unlock pacing · achievements · next-goal engine · container cadence
- **Supporting data:** 78 acquisitions in 250h (0.31/h)
- **Suggested solutions (candidates for human review):**
  - Author micro-milestones (achievements/timeline beats) across the gap band.
  - Split one large unlock into staged partial unlocks (visible progress).
  - Tilt container cadence slightly richer in the band (LOOT_EARN; simulate first).
- **Estimated implementation difficulty:** Low

### 13. Power spike — Lucky Player, 150h→400h

- **Severity:** MINOR (score 0.175) · **Confidence:** Low (25% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×28.3 vs cohort median ×7.4 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 14. Power spike — Campaign-Focused, 150h→400h

- **Severity:** MINOR (score 0.175) · **Confidence:** Low (25% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×27.8 vs cohort median ×1.0 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 15. Power spike — Equipment-Focused, 150h→400h

- **Severity:** MINOR (score 0.175) · **Confidence:** Low (25% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×16.1 vs cohort median ×2.6 for the band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

## Methodology & caveats

- Virtual accounts drive the REAL meta layer (finishRun/openContainer/spend APIs); only the run itself is modeled (`WORLD`).
- Personas are policy modulations (luck, spend discipline, loop deviation) — never balance changes.
- A frictionless bot underestimates real-player friction; treat absolute hours as lower bounds.
- Detector thresholds live in `src/dev/balanceReport.ts`; they are part of the instrument and version with it.
