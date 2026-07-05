# BALANCE_REPORT — automated progression health

> Generated 2026-07-03 00:40 UTC by `npm run sim:report` (docs/SIMULATION-FRAMEWORK.md).
> **Report-only:** nothing here was auto-applied. Every bottleneck below awaits human review;
> the change protocol remains docs/BALANCE_ARCHITECTURE.md §4 (propose → simulate → record).

> **AMENDMENT 2026-07-04 — HIVE SIEGE contact rebalance (player-directed, docs/HIVE-SIEGE.md §9).**
> Enemies now attack the Core (damage/interval DPS until killed) instead of one breach burst.
> Every enemy received a role-derived attack profile (the full DPS-by-archetype table, boss
> chassis cadences, attackers-reaching-Core metrics, campaign-contract sweep and endless
> survivability band live in HIVE-SIEGE.md §9); the ×0.75/×1.0/×1.25/×1.7 contract was
> re-verified by the stage probe after tuning (melee per-hit ×1.5 pass; endless SHAPE_DEPTH /
> EHP-gate / swarmMinDepth guards). Watch items: the endless DIRECTOR.cost table still prices
> raw HP; minion-blocker durability now rides attacker DPS. Goldens re-pinned deliberately
> (kills 196/196 — former leakers die credited).

> **AMENDMENT 2026-07-04 — STRAIN + BIOMORPH CONVEYOR economy (player-directed, docs/STRAIN.md §9).**
> Deployment moved to ONE universal compounding curve (`100·1.11ⁿ`) — the favorite always
> available, every other organism arriving on the 3-slot belt; strain merges price on a
> decoupled gentler escalator (`100·1.05ⁿ × [3,4,5,6]`) after probes showed "current deploy
> cost × mult" bought ZERO campaign merges. Final probes: campaign 0.2–2.4 merges/run (max
> Strain III–IV by s8) with the difficulty contract intact at ×0.75/×1.0/×1.7; endless
> mid-accounts saturate all-Strain-V at waves 39–50 and still fall at 51–57 (≈ +20 waves vs
> never merging); mono-favorite boards lose 0/5 at recommended power (favorite ≠ dominant).
> Overflow/discard recycler pays FLAT 50 — never compounds. Watch item: deep-endless (60+)
> strain saturation — the lever is belt throughput (`growMin`), not `strainGrowth`. Goldens
> re-pinned deliberately (recycler drip ≈ +900 biomass over the 12-wave autoplay).

> **AMENDMENT 2026-07-04 — TOWER EXPANSION (player-directed, docs/TOWERS.md §expansion).**
> Three towers joined the roster (Carrion Maw crust brawler · Amber Chrysalis elite warden ·
> Wailing Effigy dread totem) with full progression (branches/stars/adaptation/strains/cards/
> affixes). Engine additions: Freeze/Fear statuses with a REFRACTORY window (perma-CC
> impossible by construction) and the `flees` semantic (feared siegers scatter, then
> re-converge). Probes: the difficulty contract held unchanged at 8 kinds; mono-boards of the
> new kinds win 2–3/5 at s5 ×1.0 (vs mixed 5/5) — niches, not clones, not dead. Goldens
> re-pinned deliberately (the larger gene-card pool shifts autoplay drafts; every seed still
> wins wave 12 at 196 kills). Watch item: the belt now rolls 8 kinds — early boards see any
> given kind ~20% less often; conveyor bias weights are the lever if variety starves openings.

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
| Fresh Account | 10 | 124525 | 68 | 16 | 6 | 242 | 0 |
| Average Player | 400 | 12445393 | 169 | 142 | 54 | 691 | 0 |
| Efficient Player | 400 | 21056519 | 172 | 144 | 55 | 753 | 0 |
| Unlucky Player | 400 | 9372863 | 172 | 141 | 55 | 682 | 0 |
| Lucky Player | 400 | 24807993 | 174 | 154 | 55 | 757 | 0 |
| Completionist | 400 | 24766753 | 174 | 151 | 55 | 755 | 0 |
| Infinite-Focused | 400 | 10605511 | 163 | 138 | 52 | 678 | 0 |
| Campaign-Focused | 400 | 29146269 | 206 | 154 | 66 | 815 | 238 |
| Hero-Focused | 400 | 24322621 | 174 | 146 | 55 | 755 | 0 |
| Tower-Focused | 400 | 24248836 | 174 | 152 | 55 | 755 | 0 |
| Equipment-Focused | 400 | 10235100 | 172 | 139 | 55 | 692 | 0 |

## Top progression bottlenecks

### 1. Futile frontier pushes — Campaign-Focused, 10h→50h

- **Severity:** MAJOR (score 1.5) · **Confidence:** High (100% of seeds)
- **Estimated player frustration:** High for this persona — repeated failed attempts feel like a rigged door.
- **Root cause:** Under-ready frontier attempts risk the run's time on a low win chance. (Amendment №1 shipped the mitigations: failed frontier attempts now pay depth-scaled field-data consolation, and readiness is surfaced on the deploy button + interstitial — the residual frequency is the persona's own risk appetite on an informed, partially-paid gamble.)
- **Affected systems:** Campaign difficulty at the frontier · failure feedback
- **Supporting data:** 18 failed frontier attempts in the band
- **Suggested solutions (candidates for human review):**
  - Slightly widen the winnable readiness window at low stages only (deferred — reshapes campaign gating).
  - Raise attemptFrac if campaign-persona pacing still lags the cohort (simulate first).
- **Estimated implementation difficulty:** Low

### 2. Futile frontier pushes — Campaign-Focused, 50h→150h

- **Severity:** MAJOR (score 1) · **Confidence:** High (100% of seeds)
- **Estimated player frustration:** High for this persona — repeated failed attempts feel like a rigged door.
- **Root cause:** Under-ready frontier attempts risk the run's time on a low win chance. (Amendment №1 shipped the mitigations: failed frontier attempts now pay depth-scaled field-data consolation, and readiness is surfaced on the deploy button + interstitial — the residual frequency is the persona's own risk appetite on an informed, partially-paid gamble.)
- **Affected systems:** Campaign difficulty at the frontier · failure feedback
- **Supporting data:** 53 failed frontier attempts in the band
- **Suggested solutions (candidates for human review):**
  - Slightly widen the winnable readiness window at low stages only (deferred — reshapes campaign gating).
  - Raise attemptFrac if campaign-persona pacing still lags the cohort (simulate first).
- **Estimated implementation difficulty:** Low

### 3. Futile frontier pushes — Campaign-Focused, 150h→400h

- **Severity:** MAJOR (score 1) · **Confidence:** High (100% of seeds)
- **Estimated player frustration:** High for this persona — repeated failed attempts feel like a rigged door.
- **Root cause:** Under-ready frontier attempts risk the run's time on a low win chance. (Amendment №1 shipped the mitigations: failed frontier attempts now pay depth-scaled field-data consolation, and readiness is surfaced on the deploy button + interstitial — the residual frequency is the persona's own risk appetite on an informed, partially-paid gamble.)
- **Affected systems:** Campaign difficulty at the frontier · failure feedback
- **Supporting data:** 174 failed frontier attempts in the band
- **Suggested solutions (candidates for human review):**
  - Slightly widen the winnable readiness window at low stages only (deferred — reshapes campaign gating).
  - Raise attemptFrac if campaign-persona pacing still lags the cohort (simulate first).
- **Estimated implementation difficulty:** Low

### 4. Unlock-cadence gap — Efficient Player, 150h→400h

- **Severity:** MAJOR (score 0.6) · **Confidence:** Medium (50% of seeds)
- **Estimated player frustration:** Moderate-high — nothing new to click on for hours erodes the return habit.
- **Root cause:** Acquisition cadence collapses: everything cheap is owned and the next unlock is a long single goal with no intermediate beats. (Amendment №1 shipped the deep-band achievement ladder + Antigen spending in the meter; residual gaps are what remains after those beats.)
- **Affected systems:** Unlock pacing · achievements · next-goal engine · container cadence
- **Supporting data:** 90 acquisitions in 250h (0.36/h)
- **Suggested solutions (candidates for human review):**
  - Tilt container cadence slightly richer in the band (LOOT_EARN; simulate first).
  - Split one large unlock into staged partial unlocks (visible progress).
  - Reserve the deepest beats for prestige layers 2+ content (the planned seam).
- **Estimated implementation difficulty:** Low

### 5. Unlock-cadence gap — Unlucky Player, 150h→400h

- **Severity:** MAJOR (score 0.6) · **Confidence:** Medium (50% of seeds)
- **Estimated player frustration:** Moderate-high — nothing new to click on for hours erodes the return habit.
- **Root cause:** Acquisition cadence collapses: everything cheap is owned and the next unlock is a long single goal with no intermediate beats. (Amendment №1 shipped the deep-band achievement ladder + Antigen spending in the meter; residual gaps are what remains after those beats.)
- **Affected systems:** Unlock pacing · achievements · next-goal engine · container cadence
- **Supporting data:** 98 acquisitions in 250h (0.39/h)
- **Suggested solutions (candidates for human review):**
  - Tilt container cadence slightly richer in the band (LOOT_EARN; simulate first).
  - Split one large unlock into staged partial unlocks (visible progress).
  - Reserve the deepest beats for prestige layers 2+ content (the planned seam).
- **Estimated implementation difficulty:** Low

### 6. Dead progression zone — Efficient Player, 150h→400h

- **Severity:** MINOR (score 0.375) · **Confidence:** Low (25% of seeds)
- **Estimated player frustration:** High — sessions end with the same numbers they started with.
- **Root cause:** Per-run permanent gains saturate: mastery is logarithmic, star/upgrade sinks are already bought out at this depth, so farm runs stop moving Power.
- **Affected systems:** Mastery curve · star/upgrade sinks · loot→power conversion
- **Supporting data:** power 3144412→2789980 across 236 farm runs (seed 25757)
- **Suggested solutions (candidates for human review):**
  - Add a repeatable late-band Power sink (prestige layers 2+ are the reserved seam).
  - Raise deep-band loot yield via the ECONOMY_ADAPTIVE seams (weight-0 today; simulate first).
  - Extend star caps / gene levels for the affected band (content, not systems).
- **Estimated implementation difficulty:** Medium

### 7. Dead progression zone — Campaign-Focused, 150h→400h

- **Severity:** MINOR (score 0.375) · **Confidence:** Low (25% of seeds)
- **Estimated player frustration:** High — sessions end with the same numbers they started with.
- **Root cause:** Per-run permanent gains saturate: mastery is logarithmic, star/upgrade sinks are already bought out at this depth, so farm runs stop moving Power.
- **Affected systems:** Mastery curve · star/upgrade sinks · loot→power conversion
- **Supporting data:** power 6485620→1795281 across 199 farm runs (seed 2000)
- **Suggested solutions (candidates for human review):**
  - Add a repeatable late-band Power sink (prestige layers 2+ are the reserved seam).
  - Raise deep-band loot yield via the ECONOMY_ADAPTIVE seams (weight-0 today; simulate first).
  - Extend star caps / gene levels for the affected band (content, not systems).
- **Estimated implementation difficulty:** Medium

### 8. Unlock-cadence gap — Campaign-Focused, 150h→400h

- **Severity:** MINOR (score 0.3) · **Confidence:** Low (25% of seeds)
- **Estimated player frustration:** Moderate-high — nothing new to click on for hours erodes the return habit.
- **Root cause:** Acquisition cadence collapses: everything cheap is owned and the next unlock is a long single goal with no intermediate beats. (Amendment №1 shipped the deep-band achievement ladder + Antigen spending in the meter; residual gaps are what remains after those beats.)
- **Affected systems:** Unlock pacing · achievements · next-goal engine · container cadence
- **Supporting data:** 73 acquisitions in 250h (0.29/h)
- **Suggested solutions (candidates for human review):**
  - Tilt container cadence slightly richer in the band (LOOT_EARN; simulate first).
  - Split one large unlock into staged partial unlocks (visible progress).
  - Reserve the deepest beats for prestige layers 2+ content (the planned seam).
- **Estimated implementation difficulty:** Low

### 9. Unlock-cadence gap — Equipment-Focused, 150h→400h

- **Severity:** MINOR (score 0.3) · **Confidence:** Low (25% of seeds)
- **Estimated player frustration:** Moderate-high — nothing new to click on for hours erodes the return habit.
- **Root cause:** Acquisition cadence collapses: everything cheap is owned and the next unlock is a long single goal with no intermediate beats. (Amendment №1 shipped the deep-band achievement ladder + Antigen spending in the meter; residual gaps are what remains after those beats.)
- **Affected systems:** Unlock pacing · achievements · next-goal engine · container cadence
- **Supporting data:** 96 acquisitions in 250h (0.38/h)
- **Suggested solutions (candidates for human review):**
  - Tilt container cadence slightly richer in the band (LOOT_EARN; simulate first).
  - Split one large unlock into staged partial unlocks (visible progress).
  - Reserve the deepest beats for prestige layers 2+ content (the planned seam).
- **Estimated implementation difficulty:** Low

## Methodology & caveats

- Virtual accounts drive the REAL meta layer (finishRun/openContainer/spend APIs); only the run itself is modeled (`WORLD`).
- Personas are policy modulations (luck, spend discipline, loop deviation) — never balance changes.
- A frictionless bot underestimates real-player friction; treat absolute hours as lower bounds.
- Detector thresholds live in `src/dev/balanceReport.ts`; they are part of the instrument and version with it.

---

## Amendment — Splice Market & Ichor (2026-07)

**What shipped (docs/MARKET.md):** a refreshing 8-slot store (deterministic 5-minute windows;
4 small core-priced bundles + a premium shelf + 1–2 rotating Bio-Containers) and ICHOR, the
premium currency (achievements 3/5/8 · collection ranks 5 · every 5th campaign first-clear 12
· new Infinite 5-wave record bands 2 · a 30 starter vial · a pity-less container bleed).

**Simulated economy contracts (state/marketEconomy.test.ts, seeded):**
- Gamble EV per opened container = 0.22 × 16.9 ≈ **3.7 Ichor ≈ 12%** of the cheapest
  container (30) — pinned ≤ 15% (premium boxes ≤ 18%).
- 100k-trial Monte Carlo from a 3-container bank: **median 3 boxes · P(≥6) < 3% ·
  P(≥9) < 0.1% · max observed < 14** — lucky chains stretch to 6–8 openings and always die.
- Early-account front-load: starter + 2 campaign milestones + 4 ranks ≈ **74+ Ichor ≥ 2
  containers** before the tap tightens to depth records + the gamble.
- Cores flow one way (no market slot grants Genome Cores); Ichor never moves the Power Score.

**Sink note:** the market's core-priced shelf is a small perpetual Genome Core outlet on top
of the Runaway tier (EVOLUTION-HQ.md §runaway) — complementary sinks, one steady-drip, one deep.
