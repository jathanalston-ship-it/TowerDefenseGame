# HIVE-SIEGE.md — The Hive Core as a Combat Target

Enemies do not cross a finish line. They **attack the Hive**: pathfind to the Core, lock onto
a crust ring around its body, and run a real attack loop — windup, damage event, recovery —
until they are killed, detonate, or the Hive falls. The objective read shifts from "don't let
them cross" to **"save the Hive before it's overwhelmed."**

**Files:** sim in `src/core/game.ts` (`siegeCrustTick` / `siegeAttackTick` / `hiveStrike` /
`detonate`, the converge/arrival block in `enemyMoveSystem`), tunables in `src/core/config.ts`
(`HIVE`, per-enemy `attack`, `DIRECTOR.ehp*`), presentation in `src/render/renderer.ts`
(`drawBase`, the lunge in `drawEnemy`), `src/ui/Hud.tsx` (siege readouts), `src/ui/GameView.tsx`
(shake/groans/heartbeat), `src/audio/sound.ts`. Tests: `src/core/hiveSiege.test.ts`.
**Owner systems:** engine + campaign + rendering.

---

## 1. Movement (§movement)

Enemies path normally down the lanes. Below `HIVE.convergeY` (the Final Defense line, y=800)
**every** enemy — walker, flyer, burrower — abandons the flow field and seeks the Core itself
(`nucleusPoint`), so the final approach converges on the organism, not on a bottom edge.

**Arrival:** within `coreRadius + radius + contactPad + ring·ringGap` of the Core the enemy
sets `sieging = true` and stops advancing. Its **ring** is chosen by live attacker pressure —
capacities grow outward (`ringCapacity + ring·ringGrowth`, up to `maxRings`) because outer
arcs are longer — so late arrivals surround the crowd instead of clipping into it. A
deterministic id-hash stagger (`(id % 7) · 0.09s`) keeps a simultaneous wave from attacking in
lockstep. `y` is clamped to `REACH_Y`; there is nothing past the Core.

## 2. Positioning — the crust (§positioning)

A sieging enemy holds its ring under `siegeCrustTick`: neighbor separation still pushes it
(same grid scratch as the move loop, zero allocation), then it re-projects onto its ring — so
the crust **slides apart along its arc** instead of stacking, with no slot bookkeeping and no
deadlocks. Verified at 100 simultaneous attackers (`hiveSiege.test.ts`): everyone engages,
spreads across rings, nobody freezes, sustained crowd DPS lands within 5% of the sum of
`damage/interval`.

## 3. The attack loop (§attack-loop)

Per-enemy authored profile (`EnemyDef.attack`, REQUIRED — reviewed for every enemy):

```
attackCd ── counts down (recovery) ──► windup starts (def.attack.windup seconds)
   ▲                                        │ windup reaches 0 = DAMAGE EVENT
   └── attackCd = interval − windup ◄───────┘ integrity −= e.damage (folded: elite ×1.5, variant)
```

`interval` is the **full start-to-start cycle**, so sustained DPS is exactly
`damage / interval` — the same number the HUD estimates and the balance table below designs.
Bosses ride the identical loop with their **chassis cadence** (`CHASSIS[..].attack` — a
juggernaut swings every 3.2s, a swarmlord every 2.0s); splitter children inherit it ×0.8.

## 4. Status effects (§status)

The status fold happens **once at the top of the enemy tick** and gates everything —
movement, the melee loop, and artillery alike:

- **Stun / Freeze** (`disablesAttack`) → the current windup is **lost** (interrupted swing,
  not banked), and no timers advance.
- **Slows** (corrosion / disruption / framework slows, capped 0.85) stretch both `attackCd`
  and the windup by `1 − slow`.
- DoTs, vulnerability, armor shred, Fracture/Shred reactions — unchanged: a sieging enemy is
  a normal target in the grid, towers/heroes/pools hit it exactly like any other.

## 5. Ranged enemies (§ranged)

Artillery (`def.siege`) keeps its standoff bombardment — that IS its attack loop from range —
but runs on the **same combat gating**: hard control pauses the battery, slows stretch its
cadence. No special-case rules; in-flight shells still land (combat residue, like
projectiles). Verified under permanent stun in `hiveSiege.test.ts`.

## 6. Suicide enemies (§suicide)

Exploders (`explodeDamage` set) run the same loop once: arrival → the windup is their **fuse**
→ `detonate`: one integrity burst (`e.damage`), the hero-catching blast (`explodeRadius`),
death. They never linger. Exploders still never roll elite (campaign rule).

## 7. Wave end & targeting

`checkWaveEnd` is unchanged — all enemies dead — which now *means* the crust was cleared. No
stall is possible: the **Emergency Defense override** (docs/RANGE.md §4) already lets every
offensive tower ignore range against Final-Defense-Zone enemies (the crust is always in the
zone), heroes engage freely, and if nothing can kill the attackers the Hive's finite integrity
ends the run. Minion body-blocks chew at the enemy's true sustained DPS
(`damage / attackInterval`).

## 8. Presentation (§feedback, §states, §audio, §UI)

- **Impact (§feedback):** every landed bite kicks `hiveHitPulse` (sim-owned render
  accumulator, decays 2.4/s): the Core **shudders** (core-local translate ONLY — never the
  view, per docs/CAMERA.md §8), an impact ring flashes, breach particles spray at the bite
  point, a wet `hiveHit` thud plays (audio-capped 2/tick), and a small screen-shake trauma
  (0.055/hit) makes a sustained siege read as a low rumble. Damage floats are AGGREGATED (one
  total per 0.6s beat) so 100 attackers read as pressure, not confetti. Attackers **rear back
  and lunge** into the Core through their windup (`drawEnemy`, driven by the sim's windup
  timer — deterministic, no state).
- **Damage states (§states, `drawBase`):** deterministic golden-angle cracks deepen from 98%
  health down; open wounds + ichor seep below 50%; below 25% emergency red under-flicker +
  pounding heartbeat scale; below 10% the whole body flickers (losing coherence). The
  heartbeat pulse rate rides `1 − integrity` continuously.
- **Integrity crown (§states, `drawIntegrityCrown`, 2026-11):** the HUD integrity bar wrapped
  over the Core as a flat ground-plane arc (rx 56 · ry 26 — it clears the build pad above) — the
  SAME segment size (`maxIntegrity / 25`), the SAME bands (> 50 % green · > 25 % amber · red) and
  the SAME recent-damage ghost draining behind the live fill, so the Core reads its own health at a
  glance on any device. The track tints red while enemies are biting (`hiveAttackers`); ≤ 25 % the
  lit arc breathes (steady under reduced motion). The **hearth fails** with it: the Core's light
  shrinks (145 → 105 reach) and reddens toward arterial red as integrity falls. Reduced motion also
  drops the impact shudder (the ring + ghost still read the hit). Tunables: `CORE_CROWN`.
- **Audio (§audio):** `hiveHit` (bite thud) · `hiveGroan` (one-shot when a damage state
  falls: 75/50/25/10%) · `heartbeat` (looped by GameView while ≤25%, faster ≤10%) · existing
  danger-camera music swell covers the score (the crust pins the threat fold at core weight).
- **HUD (§UI, `Hud.tsx`):** the Hive Core cell reacts — an UNDER ATTACK flag, a
  recent-damage **ghost segment** draining behind the live bar (`hud.hiveRecentDamage`, a
  ~3s leaky window), an attacker count `⚔ N`, the **incoming DPS estimate** `−N/s`
  (`Σ damage/interval`), and a **survival clock** `~Ns` (`integrity / dps`, pounding when
  ≤10s). Critical (≤25%) pulses the cell. All states ride two snapshot fields + CSS.

## 9. Balance (§balance) — sustained pressure, not burst

Threat now equals **DPS × time-alive-at-the-Core**, so danger comes from attacker count,
survivability, and composition — not one unavoidable burst. Consequences enforced elsewhere:

- Per-hit damage is a UNIT property (campaign `dmgGrowth` stays 0 — docs/DIFFICULTY.md
  §contract); role table below. Windup means a briefly-slipping enemy often deals **zero**.
- A unit the current board *cannot* kill no longer leaks once and vanishes — it chews
  forever. So the **endless Director** gained the same graduality the campaign has: wave
  shapes unlock by depth (`SHAPE_DEPTH`), rosters are EHP-gated
  (`DIRECTOR.ehpBase + ehpPerDepth·depth` vs `effectiveHp`), swarm events wait for
  `swarmMinDepth`. A depth-3 knitter (regen > a fresh board's DPS) was a scripted loss.

### Attack profiles (damage / interval / windup → DPS)

| Role | Kind | Hit | Cycle | Windup | DPS |
|---|---|---|---|---|---|
| Swarm | runner · mite · larva | 3 · 2 · 3 | 0.9 · 0.9 · 1.1 | 0.35 · 0.3 · 0.4 | 3.3 · 2.2 · 2.7 |
| Fast | rusher · darter · lasher | 3 · 3 · 5 | 0.8 · 0.75 · 0.9 | 0.3 | 3.8 · 4.0 · 5.6 |
| Flying/special | wisp · flyer | 5 · 6 | 1.0 · 1.1 | 0.4 | 5.0 · 5.5 |
| Burrow | burrower · molerat | 6 · 6 | 1.2 · 1.0 | 0.45 · 0.4 | 5.0 · 6.0 |
| Support | mender · cantor | 4 | 1.6 | 0.5 | 2.5 (aura is the threat) |
| Heavy | brute · bulwark · tank | 12 · 11 · 19 | 1.8 · 1.7 · 2.2 | 0.6–0.8 | 6.7 · 6.5 · 8.6 |
| Heavy+ | golem · warden · gargoyle | 24 · 21 · 13 | 2.4 · 2.2 · 1.6 | 0.55–0.8 | 10 · 9.5 · 8.1 |
| Regen | knitter · revenant | 9 · 16 | 1.4 · 1.8 | 0.5 · 0.6 | 6.4 · 8.9 |
| Summoner | broodmother · hivecaller | 13 · 12 | 2.0 | 0.7 | 6.5 · 6.0 (adds are the threat) |
| Elite heavy | dreadnought · colossus · apex | 36 · 60 · 15 | 2.6 · 3.0 · 1.3 | 0.45–1.0 | 13.8 · 20 · 11.5 |
| Suicide | bomber · popper | 28 · 36 burst | fuse 0.5 · 0.65 | — | one-shot |
| Boss-tier | tyrant / chassis | 42–64 | 2.0–3.2 (chassis) | 0.7–1.1 | ~15–25 |

### Report (probe-verified, 2026-07)

Campaign contract sweep (avg integrity lost, 5 seeds; all wins unless noted):

| Stage | ×0.75 | ×1.0 | ×1.25 | ×1.7 |
|---|---|---|---|---|
| 1 | 1 | 1 | 0 | 0 |
| 5 | 29 | 12 | 8 | 8 |
| 8 | 63 (4/5) | 25 | 10 | 0 |
| 12 | 30 | 19 | 13 | 13 |
| 16 | 58 | 14 | 1 | 0 |
| 24 | 3 | 0 | 0 | 0 |

Siege dynamics at stage 8: ×1.0 ≈ 4 attackers reach the Core per run (peak 3 simultaneous,
~7 attacker-seconds); ×0.75 ≈ 6 (peak 4, ~17 s); ×1.7 ≈ none. Stages 1–3: no attacker
reaches the Core at any ratio (the grace window holds). Endless at fresh power: falls at
waves 16–32 across seeds (the designed wall band; the progression-loop tests still pass).
Goldens re-pinned deliberately: every seed records kills = 196 (former leakers now die
credited), all still win at wave 12.

**Recommended watch items:** the DIRECTOR endless `cost` table still prices raw HP (its EHP
gate compensates at low depth; retune the table if deep-endless compositions skew); minion
block durability now scales with attacker DPS (blocker balance rides the same table).

## 10. Extending

- **New enemy** → author `attack` (role table above is the guide: chaff bites fast/small,
  heavies chunk slow/big); everything else — arrival, rings, statuses, feedback — is free.
- **New control/status** → set `disablesAttack`/`slowPct` in status defs; the fold gates the
  loop automatically.
- **New "reaches the Core" mechanic** (e.g. a burrower that tunnels INTO the Hive) → branch
  at the arrival block in `enemyMoveSystem`; keep `hiveStrike` as the single damage event.
- **Tuning** → `HIVE` (geometry/rings/feedback windows), per-def `attack`, chassis cadences,
  `DIRECTOR.ehp*`/`SHAPE_DEPTH`/`swarmMinDepth` (endless pacing). Re-run the probe sweep
  (DIFFICULTY.md §contract) after ANY of these.
