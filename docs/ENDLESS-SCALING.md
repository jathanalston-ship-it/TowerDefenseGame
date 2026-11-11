# Infinite (Endless) Scaling & Density

Canonical spec for how **Endless/Infinite** mode escalates. Authoritative over the code:
`DIRECTOR` + `ENDLESS` in `src/core/config.ts` implement these; `director.ts` (composition)
and `game.ts` (per-spawn intensity) apply them. **Stage mode is untouched** — the authored
`WAVES` + the linear `hpMultFor`/`bountyMultFor` curve remain byte-identical (golden-safe).

> Status: **active**. Replaces the old model where the threat budget grew *exponentially*
> (`12 × 1.16^(depth−1)`, unbounded) → enemy **count** exploded → biomass snowballed → fresh
> accounts rode the horde to Wave 50+. Empirically a no-upgrade board hoarded 60k–475k Biomass
> by depth ~25 (the snowball). Now: **count caps, HP becomes the wall.**

---

## 1. Philosophy — the intended loop

> Improve → reach a new personal best → hit a wall → return to Campaign → earn permanent
> progression → attempt Infinite again → push the best deeper → repeat.

For that loop to work, **a run must terminate because the account isn't strong enough yet —
not because the player got bored.** Two levers make that true:

1. **A continuous, smooth wall (HP).** Enemy Health rises *geometrically* — a constant ratio
   per depth, so it never spikes, but it eventually outpaces *any fixed* DPS. The depth where
   your DPS can no longer out-damage the incoming HP **is** your wall; permanent progression
   (stars, branches, prestige) pushes that depth out a little each time.
2. **A capped battlefield (count).** Enemy *quantity* ramps early then plateaus at a maximum
   population. Past the cap, more depth means **tankier**, not **more** — so Biomass income
   stops snowballing and the run can't be brute-forced by farming an ever-bigger horde.

Speed and Damage rise *gradually* on top, adding steady pressure without ever spiking.

---

## 2. Enemy density curve (count) — ramp, then cap

The AI Director spends a **threat budget** on a wave's roster (cheaper archetypes ⇒ more of
them). The budget — and therefore the population — now **saturates**:

```
budget(depth) = min(DIRECTOR.budgetCap, DIRECTOR.baseBudget × (1 + DIRECTOR.budgetGrowth)^(depth−1))
              = min(150, 12 × 1.16^(depth−1))
```

| depth | budget | ≈ population | phase |
|---:|---:|---:|---|
| 1 | 12 | ~5 | ramp |
| 5 | 22 | ~9 | ramp |
| 10 | 46 | ~18 | ramp |
| 15 | 99 | ~40 | ramp |
| 18 | **150 (cap)** | **~60** | **capped** |
| 25 | 150 | ~60 | capped |
| 50 | 150 | ~60 | capped |

Population climbs over the first ~18 depths to a **max battlefield of ~60 enemies/wave**, then
holds flat forever. After the cap, the Director keeps the same headcount but promotes **more
elites** (ability scaling, below). Biomass/wave plateaus instead of exploding — and because the
enemies are increasingly tanky, Biomass *income rate* (per real-time) falls as clears slow.

### Deep composition — pace, not sponge (§deep-tilt)

**ENDLESS ONLY** (Director `deepTilt` flag; Boss Rush + shallow endless untouched). Deep armored/elite
waves used to concentrate the whole budget into a few giant, elite-promoted bodies (tank/golem/colossus
at ×83 geometric HP × ×3 elite), so a wave devolved into 2–3 damage sponges chewed for a minute apiece —
a boring slog, not a threat. Past `DIRECTOR.heavyCapMinDepth` (20) the Director **caps the HEAVY class's
share of the threat budget** and decays it with depth:
```
heavyFrac(depth) = clamp(heavyBudgetFracBase − heavyBudgetDecayPerDepth × (depth − heavyCapMinDepth),
                         heavyBudgetFracMin, heavyBudgetFracBase)
                 = clamp(0.5 − 0.02 × (depth − 20), 0.20, 0.5)
```
Once a wave's heavy spend hits `heavyFrac × budget`, the remainder buys the shape's non-heavy kinds — or,
when the shape is all-heavy, the **`deepFastPool`** (rusher/darter/lasher/**apex**/molerat/flyer/bomber):
SPEEDIER, high-HP / high-damage bodies **in numbers**. The wave still fields *some* heavies — the boss is
the intended durable centerpiece (§boss) — but never a wall of them. Measured (autoplay probe, deep
non-boss waves ≥ 26): heavy-HP share **47% → 30%**, heavy count **7.7 → 4.4**, and the worst armored
wave's clear time **≈47 s → ≈30 s**, with the rest of the budget now fast pressure.

---

## 3. Intensity curves — continuous, smooth, never spiky

All keyed on `depth` (1-based), applied only in Endless (Stage uses its own linear curve).

### Health — the PRIMARY wall (geometric)
```
endlessHpMult(depth) = ENDLESS.hpGrowth^(depth−1) × diff.enemyHealthMult × mods.enemyHpRunMult
                     = 1.12^(depth−1) × …
```
| depth | 1 | 10 | 20 | 30 | 40 | 50 |
|---|---|---|---|---|---|---|
| ×HP | 1.0 | 2.8 | 8.6 | 26.7 | 83 | 257 |

A constant 12%/depth ratio: no spikes, but it compounds past any fixed DPS. This is the knob
that turns "more account power" into "a few more depths." Tuned against an autoplay probe so a
maxed-branch board on a fresh account walls in the low 20s–30s and only genuinely developed
accounts press past 50 (was: any board rode the horde to 60–69).

### Damage — gradual (linear), STEEPENED for deep pressure
```
endlessDamageMult(depth) = 1 + ENDLESS.damageGrowth × (depth−1) = 1 + 0.07 × (depth−1)
```
+7%/depth (×2.4 by depth 21, **×3.7 by depth 40**). Deep LEAKS genuinely threaten integrity, so a
slipping board bleeds out instead of stalling forever — the pressure-through-pace lever (was 0.05).

### Speed — gradual, capped (linear → clamp), STEEPENED + later cap
```
endlessSpeedMult(depth) = min(ENDLESS.speedCap, 1 + ENDLESS.speedGrowth × (depth−1))
                        = min(1.85, 1 + 0.014 × (depth−1))
```
+1.4%/depth to a **+85% ceiling** (was +0.4%/depth, +50%). Speed keeps climbing *meaningfully* into
deep waves — **≈+55% by depth 40**, the cap not biting until ≈ depth 61 — so late game presses
through PACE, not sponge, while the ceiling still keeps pathing/animation readable.

### Abilities — rising elites
Elite-promotion chance keeps climbing with depth (`DIRECTOR.eliteChanceBase +
eliteChancePerDepth × depth`, capped). Past the population cap this is where "more dangerous"
goes: a capped headcount with an ever-larger elite fraction (×HP/×dmg/×bounty per elite).

### Bounty — deliberately lags HP
```
endlessBountyMult(depth) = (1 + ENDLESS.bountyGrowth × (depth−1)) × diff.rewardMult = (1 + 0.03 × (depth−1)) × …
```
Per-enemy Biomass rises only +3%/depth — far slower than HP's geometric climb. So deep enemies
are **Biomass-inefficient** (a lot of HP for a little income); combined with the count cap, this
is what bleeds long-run income down rather than up.

### Procedural boss durability — the deep centerpiece (§boss)
```
endlessBossStrength(depth) = min(ENDLESS.bossStrengthCap, 1 + ENDLESS.bossStrengthPerDepth × max(0, depth − bossFirstDepth))
                           = min(6, 1 + 0.14 × max(0, depth − 5))
```
| depth | 5 | 10 | 20 | 30 | 40 |
|---|---|---|---|---|---|
| ×boss strength | 1.0 | 1.7 | 3.1 | 4.5 | **6.0 (cap)** |

Fed to `spawnProceduralBoss(depth, strengthScale)` (game.ts, endless call site only) — it multiplies
the boss's `def.hpMult` and, capped, its contact damage. **Why it exists:** a procedural boss's own
HP scales only **+5%/TL** (`assembleBoss`: ×3 at depth 40), while the trash wall is *geometric* (×83).
So a deep boss used to be out-tanked by its own elite escort and die almost instantly — no fight. This
curve restores it to a **durable centerpiece** (≈1 at the first boss, growing to ×6): a near-wall board
now spends a real ~25–45 s on a depth-40 boss instead of melting it. Boss Rush is **untouched** — its
call site passes its own `RUSH.strength*` ramp.

---

## 4. Why runs now terminate on progression, not boredom

- Count caps ⇒ no horde to farm ⇒ Biomass stops snowballing ⇒ you can't simply out-economy depth.
- HP compounds geometrically ⇒ there is always a depth where your current DPS falls behind ⇒
  enemies start leaking ⇒ rising Damage finishes the core. That depth is the wall.
- Permanent progression (Tower/Hero stars, branches mid-run, prestige multipliers) raises your
  DPS/EHP, which **shifts the wall a few depths deeper each attempt** — the core loop.

---

## 5. Scalability & safety

- **Stage/golden untouched.** Endless intensity is computed separately and applied only when
  `mode === 'endless'` (HP/bounty at wave start; speed/damage in `spawnOne`, gated on mode).
  The scripted-wave scheduler and `hpMultFor`/`bountyMultFor` are byte-identical, so the 6-seed
  characterization goldens don't move.
- **Determinism preserved.** Every curve is a pure function of `depth`; no new RNG draws, so
  Endless stays deterministic from the seed.
- **All knobs are data** (`DIRECTOR.budgetCap`, `ENDLESS.*`). Re-tuning the wall or the cap is a
  config edit — no new content or logic. New enemies/roles inherit the curves automatically.

*Constants in §2–§3 are the shipped values, tuned against an autoplay probe (a board build's
reachable depth + Biomass before/after). They are illustrative-but-real: adjust in config, not
in formula.*

---

## 5b. The squeeze — attrition, not a cliff (§squeeze — Batch G)

**Evidence (G1 grind audit):** Infinite ran FLAWLESS for ~48 waves, then one wave wiped the Core
(303 integrity in the last wave); decision density ~3/min, 76–85 % of wave time idle. A geometric HP
wall meets a board that either holds a whole wave or loses it — besiegers that reach the Core keep
biting until killed, so the first failing wave is total.

`ENDLESS_SQUEEZE` (config.ts), Infinite only via `RunOptions.squeeze` (GameView passes it for
`mode === 'endless'`; the Arena — also `endless` — forces it off; headless probes that omit it
are unchanged):

- **Pressure band** (`Game.updateSqueeze`, at each clear): a flawless wave past `fromDepth` (10)
  raises enemy-HP pressure ×(1 + `rise`) up to `cap`; a wave that drained ≥ `easeAt` of max
  integrity eases it ×(1 − `ease`) down to `floor` (0.85 — a little mercy). The pressure multiplies
  the scheduled endless HP and the procedural boss strength. A comfortable board meets the wall
  sooner; a bleeding one limps on for a few waves instead of being kicked while down — the band
  holds the board in chip damage, so the run ends through attrition. Shown on the wave briefing as `▲ SQUEEZED ×N` (`HudSnapshot.squeezePressure`).
- **Breach ceiling** (`Game.braceHiveDamage`, every enemy hit / detonation / siege shell): once one
  wave has drained `waveLossCap` of max integrity, the rest of each hit lands at ×`overflowMult` —
  the Core braces, so the end takes several waves. Mega lashes/cataclysms are untouched (their
  telegraphs are the counterplay).

Shipped: `fromDepth` 10 · `rise` 0.04 · `cap` 1.4 · `easeAt` 0.1 · `ease` 0.2 · `floor` 0.85 ·
`waveLossCap` 0.34 · `overflowMult` 0.1.

**Measured (G1 harness, Infinite × 3 seeds, 2400 s cap, 8 h + 100 h accounts, isolated processes):**

| | before | after |
|---|---|---|
| waves that cost integrity before the run ended (mean, deaths only) | 3.0 | 4.8 |
| share of all integrity lost in the FATAL wave (mean) | 73 % | 38 % |
| depth reached (8 h: s1/s2/s3) | 64† / 46 / 52 | 57† / 46 / 57 |
| depth reached (100 h: s1/s2/s3) | 80 / 96 / 73 | 79 / 96 / 56 |

† still alive at the 2400 s cap. The first fit (cap 2, no floor, overflow ×0.2) cost up to ~20 depths
of record on the 100 h account and one collapse still wiped 303 integrity in a wave; the shipped band
keeps records within a few depths (one seed −17) while the end is a squeeze over several waves.

---

## 5c. The wall — Campaign progress sets it (§wall — owner playtest 2026-11-11)

**Evidence:** the curves above are static, so an account that out-gears its Campaign stage rode them
forever. The owner, at Campaign Stage 12 after opening every cache and taking every quick-buy, reached
depth 60 "with no end in sight" and ~250 caches; target ≈ depth 20, a handful of caches. Reproduced
with `npm run sim:infinite` (a real save, the client's own run setup — App.begin → GameView options —
one Hive pulse per prep + every 4 s mid-wave, Auto Wave + Hive Call, the ◆ PICK draft card; the REAL
settle counts the run's meter containers + run cache): the test save set to Stage 12 (Power ~25 k,
≈6× the Stage-13 recommendation) was still standing at depth 56–57 after 90 sim-minutes.

**The wall** (`config.ENDLESS_WALL`, Infinite only via `RunOptions.endlessWall`, set by GameView from
`meta.endlessWallFor(save)`): `wallDepth = baseDepth (4) + perStage (1) × highest cleared Campaign
stage`. Past it enemy HP × `hpGrowth` (2.0) per depth on top of `ENDLESS.hpGrowth`, uncapped, and enemy
damage +`damageGrowth` (15 %) per depth. Gear buys a few depths past the wall; Campaign progress moves
it — the §1 loop ("hit a wall → return to Campaign → push deeper") made literal. The Arena and headless
probes never pass it; an account that falls before its wall is untouched.

| `sim:infinite`, 3 seeds, 90-min cap | before | after |
|---|---|---|
| Stage 12, Power ~25 k (6× over-geared) | 56–57+ (time cap) | **19–24** (mean 21), 5–18 min |
| …containers banked per run (meter + run cache) | 5–6 (with the 1/5 meter pace) | **3** |
| Same save at Stage 30 (wall 34) | 56+ | 37–41 |

**Everything that reads a depth knows the wall:** the qualify gate is `½ × min(best, wall)` (a record
set before the wall never locks a walled run out of rewards — the Boss Rush capped-gate lesson);
`predictInfinite(…, wall)` never estimates past `wall + predictPast` (5) — the prediction panel and
the loop's "Farm Infinite (~Depth N)" advice; the Infinite screen's descent forecast adds a ▮ wall row
and prices deeper rows with it, plus a one-line note. Tests: `core/endlessWall.test.ts`,
`rewardEligibility.test.ts` (capped gate), `progressionLoop.test.ts` (farm depth ≤ wall + 5).

## 6. Anti-grind reward taper (§taper)

**ENDLESS ONLY.** With a strong enough board a player can camp arbitrarily deep and grind the Loot Box
meter + Mastery XP forever. To stop deep-camping from *out-earning re-running*, both reward streams
diminish past a depth. One central curve (`config.ENDLESS_TAPER`) drives it:
```
endlessTaper(wave) = wave ≤ startWave ? 1
                                      : floor + (1 − floor) × 0.5^((wave − startWave) / halfLife)
                   with { startWave: 30, floor: 0.25, halfLife: 15 }
```
Full value (×1) through wave 30, then a smooth exponential decay toward a 0.25 floor (halving the
above-floor part every 15 waves). Identity ≤ startWave ⇒ shallow endless and **every other mode** are
byte-unchanged.

| wave | 30 | 40 | 50 | 60 | 70 |
|---|---|---|---|---|---|
| per-wave taper | 1.00 | 0.72 | 0.55 | 0.44 | 0.37 |

- **Loot meter** (live `meta.syncRunLoot` + run-end `lootPointIncome`): scaled by the *average* per-wave
  taper `endlessLootTaper(wave) = Σ endlessTaper(1..wave) / wave` — a single clean multiplier that keeps
  the live meter monotonic (its per-wave *increment* still ∝ `endlessTaper(wave)`, so deep waves visibly
  bank less). A wave-50 run banks ≈ 89 % of a linear extrapolation of a wave-20 run — and the *marginal*
  wave-50 bank is ≈ 55 % of an early wave.
- **Mastery XP** (run-end fold in `meta.finishRun`): the endless XP multiplier is scaled by
  `endlessTaper(result.wave)` — a run ending at wave 50 keeps only ~55 % of its Mastery multiplier, so
  deep camps stop multiplying XP linearly.

Boss Rush reward lanes and `INFINITE_REWARD_QUALIFY_FRAC` are untouched.
