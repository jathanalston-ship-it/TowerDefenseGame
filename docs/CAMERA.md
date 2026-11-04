# CAMERA.md — Danger Camera Framework

The state machine + threat model behind combat "Danger Mode": how the game decides the Home
Base is genuinely threatened, and how that decision drives every tension effect (vignette,
saturation, heartbeat, HUD banner, music — never view scaling) through ONE smooth signal.

**Files:** `src/core/dangerCamera.ts` (pure state machine + tunables), `game.dangerCameraSystem`
(threat fold), consumers in `src/render/renderer.ts`, `src/ui/GameView.tsx`, `src/index.css`,
`src/ui/Hud*`. **Owner system:** Rendering & VFX (registry id `rendering`).

---

## 1. The bug this replaced ("camera throbbing")

Pre-redesign, danger visuals keyed **directly on instantaneous enemy state**:

- The renderer re-counted enemies near the zone line every frame (`pressure`), so one enemy
  crossing/dying at the boundary flipped the vignette, zone glow, and line width per frame.
- `emergencyActive` (a raw boolean) drove the zone-wash ramp target and the HUD banner, so a
  kill at the line strobed both, and a `sin(t·6)` throb amplified every flip.

Result: constant zoom-in/zoom-out "throbbing" whenever fights happened at the threshold.
The fix is architectural, not a tweak: **no effect may read raw enemy state**. Everything
keys on one hysteresis-gated, eased intensity.

## 2. Architecture — three layers

```
┌──────────────────────────── sim tick (game.step, EVERY phase incl. settle) ───────────────┐
│ 1. THREAT FOLD (game.dangerCameraSystem)      one pass over enemies → rawScore (number)   │
│ 2. STATE MACHINE (core/dangerCamera.ts)       rawScore → phase + smoothed intensity 0..1  │
└────────────────────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────── render/UI (per frame, read-only) ─────────────────────────────┐
│ 3. EFFECT CHANNELS                             all key on dangerCurve(intensity) / phase   │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

The machine is **pure and geometry-free**: `game.ts` owns world knowledge (zone lines, enemy
tiers), `dangerCamera.ts` only smooths and gates, effects only read. State lives in
`game.dangerCam` (`DangerCameraState`), mutated in place — **zero allocation per tick**.

## 3. Threat model (the fold)

Battlefield geometry (`src/core/map.ts`): approach band top `DEFENSE_TOP_Y` (720) → Final
Defense Zone top `FINAL_DEFENSE_TOP_Y` (800) → Hive Core (`HEIGHT`, 960).

Per alive enemy with `y > 720`:

```
weight  = y < 800 ? wApproach · (y−720)/80            // ramps 0 → 0.35 across the approach band
                  : wZone + (wCore−wZone) · (y−800)/160   // 1.2 inside the zone → 1.5 at the core
tier    = boss 6 · elite 2.5 · normal 1
health  = hpFloor + (1−hpFloor) · hp/maxHp            // a dying enemy still counts half
rawScore += weight · tier · health
```

This encodes the spec's factors without extra passes: **count** (sum), **elites/bosses**
(tier), **proximity** (weight ramp — depth IS threat), **health** (dying enemies fade out of
the score instead of vanishing), **speed** (a fast runner crosses the ramp quickly, so its
contribution accelerates — no explicit velocity term needed).

## 4. State machine (`stepDangerCamera`)

```
        score ≥ enter                confirmT full (raw threat persisted confirmSec)
 CALM ───────────────► RISING ─────────────────────────────────────────► DANGER
  ▲                      │  score < exit AND confirmT drained → back to CALM   │ holdT: minHoldSec
  │                      ▼                                                     │ then all-clear
  │   intensity ≤ 0.02 (exhale finished — natural decay, NEVER snapped)        │ (score ≤ exit)
  └──────────────────── EASING ◄───────────────────────────────────────────────┘ persisting
                          │  score ≥ enter → straight back to DANGER             releaseSec
                          └─ (re-arm without re-confirmation — glide, no flash)
```

Anti-thrash mechanisms (all in `DANGER_CAM`, `src/core/dangerCamera.ts`):

| Mechanism | Tunable | Kills |
|---|---|---|
| Input smoothing (EMA on rawScore) | `scoreSmooth: 5/s` | square waves from spawn/death at the line |
| Hysteresis dead band | `enter: 0.9` / `exit: 0.35` | boundary oscillation (between them: no change) |
| Entry confirmation charge (tracks **RAW** score; accrues ≥ exit, drains at `confirmDecay` when absent) | `confirmSec: 0.35` | one-frame blips; a flickering swarm still charges |
| Minimum hold | `minHoldSec: 2.5` | enemy-dies-right-after-trigger flicker |
| Release confirmation (all-clear must persist) | `releaseSec: 0.5` | trough dips between two pushes bouncing danger↔easing |
| Asymmetric ease on intensity | `attackRate: 2.0/s`, `releaseRate: 0.6/s` | snapping; gives the slow cinematic exhale |
| `dangerCurve` (smootherstep) applied by effects | — | first-derivative pop at entry/exit of the fade |

The confirmation charge deliberately reads the **raw** score, not the smoothed one — the
smoother's own decay tail must never count as "the threat persisted."

**Intensity** (the one output): in `danger`, eases toward
`baseIntensity + (1−baseIntensity)·min(1, score/scaleScore)` (0.55 → 1 as genuine threat
scales); everywhere else toward 0. It settles to exactly 0 only once < 0.001 (sub-perceptual
step) and is **never assigned across a phase flip** — by construction it cannot jump.

## 5. Effect channels (all read `rs.dangerIntensity` / `dangerCam.phase`)

| Channel | Where | Shape (d = `dangerCurve(intensity)`) |
|---|---|---|
| Vignette + heartbeat | `renderer.drawPressureVignette` | alpha ≤ 0.5; lub-dub pulse ±4 %, gated d > 0.5 |
| Red edge glow | same | radial `rgba(255,62,76)` · 0.12·d |
| Saturation dip | same | one `saturation` composite rect, 0.14·d |
| Zone wash + beams | `game.emergencyRamp` | target 1 only while `phase === 'danger'` (rates 5 in / 0.9 out) |
| HUD banner | `HudSnapshot.emergency` | `phase === 'danger'` — rides the committed state, cannot strobe |
| Banner CSS | `.phase-emergency` | `emergency-in` fade, then slow 1.4 s flash |
| Music swell | `GameView` music pressure | `max(legacy pressure, intensity·0.9)` |

**Gameplay is exempt:** the Final Defense targeting override (`emergencySystem`'s in-zone
list) stays instantaneous — towers must react the frame an enemy leaks; only the *camera*
is deliberate. This split is the framework's core contract.

## 6. Invariants (tested in `src/core/dangerCamera.test.ts`)

- **Render-only:** nothing in the sim reads `dangerCam` — golden seeds are byte-identical.
- Ticks in **every** phase (first line of `game.step`, including the settle early-return),
  so the exhale continues through prep/victory/defeat instead of freezing mid-vignette.
- Pause = `step` not called = frozen (correct: no decay while the world is stopped).
  Game-speed multipliers ride `dt`, so danger timing tracks sim time, not wall time.
- Per-frame |Δintensity| ≤ `attackRate·dt` rising, ≤ `releaseRate·dt` falling — **no snap
  is possible**, enforced by test.
- Zero per-frame allocation: one enemy pass, in-place state mutation, no arrays/closures.

## 7. Edge-case map

| Case | Mechanism |
|---|---|
| Fast enemy enters/dies instantly | confirmation charge never fills → camera never acknowledges |
| Swarm flickering at the line | EMA rides the mean; charge accrues → ONE deliberate commit |
| Boss lingering at the edge | dead band: committed danger stays until score ≤ exit persists |
| Dies right after trigger | min-hold + slow exhale — one clean episode, no flicker |
| Threat returns mid-exhale | easing → danger directly (no re-confirmation flash) |
| Pause / speed change | dt-driven; frozen on pause, scales with sim speed |
| Wave end / victory / loss | machine still ticks (settle path) → smooth fade-out |
| Tutorial / auto-wave | same signal; no special casing needed — effects are subtle by design |

## 8. Extending the framework

- **NO VIEW SCALING in danger mode** (retired 2026-07 on player feedback): any zoom keyed to
  the zone boundary — however smooth — reads as "the screen changes size when enemies get
  close" and disorients. The same applies to LAYOUT: the HUD's emergency banner is an
  absolutely-positioned overlay because the bar's height sizes the battlefield (100 vh
  column) — an in-flow banner literally shrank the board on every commit. Danger channels
  must be non-geometric and layout-stable.
- **Event-keyed eased pulses are fine** — the wave/boss push-in (1.2 %) and the LAST-KILL nudge
  (≤ 4 %, scaled about the final kill; render/lastKill.ts, docs/SIGNATURE-MOMENTS.md §1) are
  one-shot, eased in and home within ~1 s, keyed to an EVENT, never to the zone boundary or to
  enemy proximity, and both are zeroed by reduced motion. Keep any new zoom inside those rules.
- **New camera/tension effect** (screen tint, DOF, ambience layer…): read
  `rs.dangerIntensity` (renderer) or `game.dangerCam.intensity` (UI), shape with
  `dangerCurve`, keep amplitudes subtle (this is tension, not a mechanic). Never read enemy
  positions/counts directly — that reintroduces the throb.
- **New threat input** (e.g. a channeling boss ability): add a term inside the existing fold
  in `game.dangerCameraSystem` — keep it one pass, no allocation.
- **New committed-state consumer** (UI that must not flicker): key on
  `dangerCam.phase === 'danger'` like the HUD banner, never on raw score.
- **Tuning:** everything lives in `DANGER_CAM`; the test suite pins the contracts
  (blip rejection, single-commit under oscillation, monotone smooth exhale, rate bounds),
  so retunes that break "deliberate in, brief hold, smooth out" fail loudly.
