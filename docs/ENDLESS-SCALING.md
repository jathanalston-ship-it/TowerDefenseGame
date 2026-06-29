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

### Damage — gradual (linear)
```
endlessDamageMult(depth) = 1 + ENDLESS.damageGrowth × (depth−1) = 1 + 0.05 × (depth−1)
```
+5%/depth (×2.0 by depth 21, ×3.0 by depth 41). Leaks hurt steadily more, so a slipping board
bleeds out instead of stalling forever.

### Speed — gradual, capped (linear → clamp)
```
endlessSpeedMult(depth) = min(ENDLESS.speedCap, 1 + ENDLESS.speedGrowth × (depth−1))
                        = min(1.5, 1 + 0.004 × (depth−1))
```
+0.4%/depth to a **+50% ceiling** — enemies get pushier but never so fast the field becomes
unreadable.

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
