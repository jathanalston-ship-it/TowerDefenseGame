# BALANCE_REPORT — automated progression health

> Generated 2026-07-02 14:16 UTC by `npm run sim:report` (docs/SIMULATION-FRAMEWORK.md).
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
| Fresh Account | 10 | 33918 | 60 | 51 | 5 | 147 | 0 |
| Average Player | 400 | 4518529 | 158 | 132 | 50 | 537 | 0 |
| Efficient Player | 400 | 10179883 | 159 | 141 | 50 | 606 | 0 |
| Unlucky Player | 400 | 5101005 | 157 | 135 | 50 | 555 | 0 |
| Lucky Player | 400 | 11124725 | 161 | 140 | 51 | 611 | 0 |
| Completionist | 400 | 9726683 | 158 | 137 | 50 | 604 | 0 |
| Infinite-Focused | 400 | 7610104 | 151 | 132 | 48 | 569 | 0 |
| Campaign-Focused | 400 | 11504060 | 193 | 141 | 62 | 663 | 265 |
| Hero-Focused | 400 | 9373882 | 158 | 135 | 50 | 604 | 0 |
| Tower-Focused | 400 | 9913860 | 159 | 138 | 50 | 605 | 0 |
| Equipment-Focused | 400 | 4092479 | 157 | 135 | 50 | 532 | 0 |

## Top progression bottlenecks

### 1. Futile frontier pushes — Campaign-Focused, 10h→50h

- **Severity:** MAJOR (score 1.5) · **Confidence:** High (100% of seeds)
- **Estimated player frustration:** High for this persona — repeated failed attempts feel like a rigged door.
- **Root cause:** Under-ready frontier attempts carry near-zero win chance with full time cost — impatient players pay a heavy invisible tax.
- **Affected systems:** Campaign difficulty at the frontier · failure feedback
- **Supporting data:** 25 failed frontier attempts in the band
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
- **Supporting data:** 70 failed frontier attempts in the band
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
- **Supporting data:** 191 failed frontier attempts in the band
- **Suggested solutions (candidates for human review):**
  - Surface the readiness estimate harder at mission start (UI, zero balance risk).
  - Grant partial consolation rewards on failed frontier attempts.
  - Slightly widen the winnable readiness window at low stages only.
- **Estimated implementation difficulty:** Low

### 4. Unlock-cadence gap — Equipment-Focused, 150h→400h

- **Severity:** CRITICAL (score 0.9) · **Confidence:** High (75% of seeds)
- **Estimated player frustration:** Moderate-high — nothing new to click on for hours erodes the return habit.
- **Root cause:** Acquisition cadence collapses: everything cheap is owned and the next unlock is a long single goal with no intermediate beats.
- **Affected systems:** Unlock pacing · achievements · next-goal engine · container cadence
- **Supporting data:** 107 acquisitions in 250h (0.43/h)
- **Suggested solutions (candidates for human review):**
  - Author micro-milestones (achievements/timeline beats) across the gap band.
  - Split one large unlock into staged partial unlocks (visible progress).
  - Tilt container cadence slightly richer in the band (LOOT_EARN; simulate first).
- **Estimated implementation difficulty:** Low

### 5. Power spike — Tower-Focused, 150h→400h

- **Severity:** MAJOR (score 0.7) · **Confidence:** High (100% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×10.0 inside one band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 6. Unlock-cadence gap — Unlucky Player, 150h→400h

- **Severity:** MAJOR (score 0.6) · **Confidence:** Medium (50% of seeds)
- **Estimated player frustration:** Moderate-high — nothing new to click on for hours erodes the return habit.
- **Root cause:** Acquisition cadence collapses: everything cheap is owned and the next unlock is a long single goal with no intermediate beats.
- **Affected systems:** Unlock pacing · achievements · next-goal engine · container cadence
- **Supporting data:** 105 acquisitions in 250h (0.42/h)
- **Suggested solutions (candidates for human review):**
  - Author micro-milestones (achievements/timeline beats) across the gap band.
  - Split one large unlock into staged partial unlocks (visible progress).
  - Tilt container cadence slightly richer in the band (LOOT_EARN; simulate first).
- **Estimated implementation difficulty:** Low

### 7. Power spike — Efficient Player, 150h→400h

- **Severity:** MAJOR (score 0.525) · **Confidence:** High (75% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×28.1 inside one band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 8. Power spike — Lucky Player, 10h→50h

- **Severity:** MAJOR (score 0.525) · **Confidence:** Medium (50% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×8.2 inside one band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 9. Power spike — Completionist, 150h→400h

- **Severity:** MAJOR (score 0.525) · **Confidence:** High (75% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×9.2 inside one band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 10. Power spike — Hero-Focused, 150h→400h

- **Severity:** MAJOR (score 0.525) · **Confidence:** High (75% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×12.9 inside one band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 11. Dead progression zone — Campaign-Focused, 150h→400h

- **Severity:** MINOR (score 0.375) · **Confidence:** Low (25% of seeds)
- **Estimated player frustration:** High — sessions end with the same numbers they started with.
- **Root cause:** Per-run permanent gains saturate: mastery is logarithmic, star/upgrade sinks are already bought out at this depth, so farm runs stop moving Power.
- **Affected systems:** Mastery curve · star/upgrade sinks · loot→power conversion
- **Supporting data:** power 1134768→1094844 across 226 farm runs (seed 17838)
- **Suggested solutions (candidates for human review):**
  - Add a repeatable late-band Power sink (prestige layers 2+ are the reserved seam).
  - Raise deep-band loot yield via the ECONOMY_ADAPTIVE seams (weight-0 today; simulate first).
  - Extend star caps / gene levels for the affected band (content, not systems).
- **Estimated implementation difficulty:** Medium

### 12. Power spike — Lucky Player, 150h→400h

- **Severity:** MAJOR (score 0.35) · **Confidence:** Medium (50% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×15.2 inside one band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 13. Power spike — Infinite-Focused, 150h→400h

- **Severity:** MAJOR (score 0.35) · **Confidence:** Medium (50% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×10.0 inside one band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 14. Unlock-cadence gap — Average Player, 150h→400h

- **Severity:** MINOR (score 0.3) · **Confidence:** Low (25% of seeds)
- **Estimated player frustration:** Moderate-high — nothing new to click on for hours erodes the return habit.
- **Root cause:** Acquisition cadence collapses: everything cheap is owned and the next unlock is a long single goal with no intermediate beats.
- **Affected systems:** Unlock pacing · achievements · next-goal engine · container cadence
- **Supporting data:** 82 acquisitions in 250h (0.33/h)
- **Suggested solutions (candidates for human review):**
  - Author micro-milestones (achievements/timeline beats) across the gap band.
  - Split one large unlock into staged partial unlocks (visible progress).
  - Tilt container cadence slightly richer in the band (LOOT_EARN; simulate first).
- **Estimated implementation difficulty:** Low

### 15. Unlock-cadence gap — Infinite-Focused, 150h→400h

- **Severity:** MINOR (score 0.3) · **Confidence:** Low (25% of seeds)
- **Estimated player frustration:** Moderate-high — nothing new to click on for hours erodes the return habit.
- **Root cause:** Acquisition cadence collapses: everything cheap is owned and the next unlock is a long single goal with no intermediate beats.
- **Affected systems:** Unlock pacing · achievements · next-goal engine · container cadence
- **Supporting data:** 119 acquisitions in 250h (0.48/h)
- **Suggested solutions (candidates for human review):**
  - Author micro-milestones (achievements/timeline beats) across the gap band.
  - Split one large unlock into staged partial unlocks (visible progress).
  - Tilt container cadence slightly richer in the band (LOOT_EARN; simulate first).
- **Estimated implementation difficulty:** Low

### 16. Unlock-cadence gap — Campaign-Focused, 150h→400h

- **Severity:** MINOR (score 0.3) · **Confidence:** Low (25% of seeds)
- **Estimated player frustration:** Moderate-high — nothing new to click on for hours erodes the return habit.
- **Root cause:** Acquisition cadence collapses: everything cheap is owned and the next unlock is a long single goal with no intermediate beats.
- **Affected systems:** Unlock pacing · achievements · next-goal engine · container cadence
- **Supporting data:** 79 acquisitions in 250h (0.32/h)
- **Suggested solutions (candidates for human review):**
  - Author micro-milestones (achievements/timeline beats) across the gap band.
  - Split one large unlock into staged partial unlocks (visible progress).
  - Tilt container cadence slightly richer in the band (LOOT_EARN; simulate first).
- **Estimated implementation difficulty:** Low

### 17. Power spike — Completionist, 10h→50h

- **Severity:** MINOR (score 0.262) · **Confidence:** Low (25% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×11.2 inside one band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 18. Power spike — Hero-Focused, 10h→50h

- **Severity:** MINOR (score 0.262) · **Confidence:** Low (25% of seeds)
- **Estimated player frustration:** Low-moderate — thrilling once, but it flattens the ramp that follows.
- **Root cause:** A single payout (usually the first Molt chain) multiplies Power far beyond the loop texture, flattening the following hours.
- **Affected systems:** Prestige payout curve · Ascendant node pricing
- **Supporting data:** power ×10.0 inside one band
- **Suggested solutions (candidates for human review):**
  - Smooth the payout (smaller first Molt, faster subsequent ramps).
  - Stage the Ascendant node unlocks across several molts.
- **Estimated implementation difficulty:** Medium

### 19. Grind saturation — Average Player, 50h→150h

- **Severity:** MINOR (score 0.225) · **Confidence:** Low (25% of seeds)
- **Estimated player frustration:** Moderate — the loop reads as "farm forever", not "farm to return".
- **Root cause:** The farm share of the loop approaches 100% for the band — Campaign returns are too rare to feel like the destination.
- **Affected systems:** Progression loop tuning (readiness curve) · farm yield
- **Supporting data:** 138/153 runs were farm runs
- **Suggested solutions (candidates for human review):**
  - Tighten the farm→return interval (lower the readiness bar or raise farm yield slightly).
  - Add band-scoped farm variety (doctrine/objective rotations) so the farm reads as choice.
- **Estimated implementation difficulty:** Medium

### 20. Grind saturation — Lucky Player, 150h→400h

- **Severity:** MINOR (score 0.225) · **Confidence:** Low (25% of seeds)
- **Estimated player frustration:** Moderate — the loop reads as "farm forever", not "farm to return".
- **Root cause:** The farm share of the loop approaches 100% for the band — Campaign returns are too rare to feel like the destination.
- **Affected systems:** Progression loop tuning (readiness curve) · farm yield
- **Supporting data:** 257/285 runs were farm runs
- **Suggested solutions (candidates for human review):**
  - Tighten the farm→return interval (lower the readiness bar or raise farm yield slightly).
  - Add band-scoped farm variety (doctrine/objective rotations) so the farm reads as choice.
- **Estimated implementation difficulty:** Medium

## Methodology & caveats

- Virtual accounts drive the REAL meta layer (finishRun/openContainer/spend APIs); only the run itself is modeled (`WORLD`).
- Personas are policy modulations (luck, spend discipline, loop deviation) — never balance changes.
- A frictionless bot underestimates real-player friction; treat absolute hours as lower bounds.
- Detector thresholds live in `src/dev/balanceReport.ts`; they are part of the instrument and version with it.
