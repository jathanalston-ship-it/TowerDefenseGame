# STRAIN.md — In-Run Tower Evolution (Strain I → V)

The late-game optimization layer: once the board is full, play shifts from *placing* towers to
*evolving* them. Every tower starts each run at **Strain I** and can reach **Strain V**. Strain
is **run-only** (never persisted on the tower), acquired by consuming conveyor duplicates
(§conveyor), and every level grants a **mechanic that exists nowhere else** — not a stat line.

> Strain does NOT replace Stars, Mastery, Branches, Gene Cards, Equipment, or Hero buffs.
> It stacks with all of them. Branches are never removed by straining; Mastery never resets.

**Files:** framework `src/core/strains.ts`; belt data + economy `src/core/conveyor.ts`; sim
hooks in `src/core/game.ts` (cast path, `raiseStrain`, belt tick); UI `src/ui/Toolbar.tsx`
(conveyor rail), `src/ui/Inspector.tsx` (strain display); visuals `src/render/renderer.ts`
(§visuals). Tests: `src/core/strains.test.ts`, `src/core/conveyor.test.ts`.
**Owner:** towers + engine + run-ui.

---

## 1. The identity rule (§identity)

Every Strain level must introduce gameplay **not obtainable** through Gene Cards, Branch
tiers, Stars, Mastery, Equipment, Hero or Global upgrades. The framework enforces the
vocabulary: `StrainHooks` fields are NEW verbs the executor implements only for strains.
Multipliers are forbidden in hooks (power comes as a side effect of the mechanic).

The authored ladders (all 32 in `strains.ts` — every tower II–V; each verb implemented ONCE in the sim):

| Tower | II | III | IV | V |
|---|---|---|---|---|
| Needle Spitter | **Secondary Spinneret** — casts TWIN-FIRE on a proc | **Hungering Barbs** — killing shots LEAP to a new victim | **Venom Ducts** — marks DETONATE at 3 stacks | **Apex Spinneret** — rhythmic FRENZY windows (twin-fire guaranteed) |
| Bone Mortar | **Concussive Marrow** — blasts STAGGER enemies up-lane (even off the Hive crust) | **Calcified Clusters** — shells FRAGMENT into sub-munitions | **Shockbone Lattice** — the fragments stagger too | **Echoing Howitzer** — every shell chased by a slower ECHO |
| Flesh Reactor | **Adrenal Glands** — overcharged towers open waves with reset cooldowns | **Glut Sacs** — biomass SURGE at each wave start | **Synaptic Weave** — chained reactors project a WIDER overcharge ring | **Womb of the Colony** — BIRTHS a harvester organism |
| Parasite Nest | **Spore Bloat** — infected deaths burst a SLOWING cloud | **Leaping Broodworm** — the plague LEAPS to a distant host on death | **Neural Infestation** — full infection SEIZES the host (stun, once) | **Brood Nest** — BIRTHS broodling swarms |
| Neural Obelisk | **Static Ganglia** — the field CHARGES enemies stack by stack | **Arc Synapse** — at 6 stacks the host DISCHARGES into neighbors | **Overload Cortex** — discharges STUN their arc victims | **Storm Crown** — every discharge FORKS to 2 extra victims |
| Carrion Maw | **Gorging Gullet** — kills FEED it (glut widens the jaws) | **Bone Vice** — the bite GRIPS everything it catches | **Acid Reflux** — every 4th bite REGURGITATES a bone volley | **Apex Devourer** — glut never fades; full-glut bites sweep TWICE |
| Amber Chrysalis | **Setting Resin** — broken casings leave a SLOWING slick | **Splinter Shards** — casings SHATTER into shard damage | **Twin Cocoon** — refuses preserved prey (locks a SECOND victim) | **Living Amber** — encased victims are SIPHONED; the casing bursts |
| Wailing Effigy | **Creeping Dread** — fading panic leaves the body CHILLED | **Contagious Panic** — a feared death SPREADS its panic | **Nightmare Feast** — the pulse WOUNDS feared minds | **Death Knell** — fading panic detonates a psychic BACKLASH |

## 2. Framework (§framework)

```ts
interface StrainDef { tower: TowerKind; level: 2|3|4|5; name: string; desc: string; hooks: StrainHooks }
interface StrainHooks {           // the UNIQUE-verb vocabulary (grows per PROMPT-2 ladder)
  twinCastChance?: number;        // proc: repeat this cast once (rng — deterministic sim roll)
  fragmentOnImpact?: { count: number; damageFrac: number; radius: number }; // splash splits
  // …new verbs land here; the executor implements each ONCE, data drives the rest
}
```

- Registry keyed `tower:level`; `strainsFor(kind)` lists the ladder; `resolveStrain(kind, level)`
  folds hooks **cumulatively** (Strain IV includes II+III hooks — evolutions build on the body).
- `Tower.strain` (1–5, default 1) — plain field, run-transient like `tier`/`branchId`.
- `Game.raiseStrain(towerId)` — the single mutation point (validates < 5, fires the ceremony
  spectacle + power audit). Acquisition (§conveyor) is the only caller in-game.
- **Golden safety:** autoplay never raises strain → Strain I resolves to the empty kit → the
  cast path is byte-identical. Proc rolls consume gameplay rng ONLY when hooks exist.
- **Power (§power):** each level above I contributes `STRAIN_POWER[level]` to the run's temp
  power (audited by the runtime Power validator; surfaced in run summary + HUD power).

## 3. Visuals (§visuals)

Every level visibly mutates the tower (renderer reads `t.strain`; deterministic geometry, class-
tinted): II = budding eye cluster · III = chitin plates + spines · IV = tentacle fringe
(animated) · V = crowned apex organ + slow aura. A Strain V tower must be recognizable at a
glance across the arena. Per-tower signature organs land with their PROMPT-2 ladders.

## 4. Biomorph Conveyor (§conveyor — PROMPT 3/4 scope)

Replaces "all towers always available": ONE permanent **favorite** (chosen in the Tower Lab,
saved on the account) is always deployable; every other tower arrives on a living conveyor.

- Queue max 3; each slot shows portrait, rarity, strain-level offer, animated growth, and the
  remaining arrival timer. One organism grows at a time (`CONVEYOR.growSeconds` 14 s,
  ×`growWaveFactor` 0.94 per wave, floored at `growMin` 7 s from wave ~12).
- **The run-start GIFT:** the very first organism is instantly ready and deploys FREE (no
  biomass, no advance on the universal curve) — it also recycles for 0, so it can never feed
  the economy. The belt opens with a decision, not a wait.
- **The gift ANSWERS the opening (§opening — Batch G):** on a Campaign stage ≥
  `CONVEYOR.openingAnswerFromStage` (4) the gift is rolled — same weights, same single draw on the
  dedicated rng — from the owned kinds (favorite excluded) of the BEST answer class for the stage's
  OPENING threats, instead of the whole roster. Both sides are derived from data
  (`core/conveyor.ts` `openingThreats` / `OPENING_ANSWER_TIERS` / `OPENING_THREAT_RULES` — never a
  per-tower list). Threats: `pack` (a group of ≥ `packGroup` 4 in the first `openingWaves` 3
  waves) and `air` (fliers there — summoners never answer it). Classes, best first: **denial**
  (a pulling aura, or a Fear pulse reaching `areaRadius` 200 — today Effigy, Polyp, Rift), then
  **area** (any splash, or an aura/debuff/explosion/pool reaching 200 — Mortar, Obelisk, Effigy,
  Sower, Lung, Bell, Ossuary). No owned answer ⇒ the plain roll. Fitted on the G1 harness's
  forced-gift sweep (every owned kind × 7 stages × 2 seeds): at 100 h denial gifts lost 3/42 runs
  in waves 1–3 vs 5/14 for the natural roll; at 8 h area gifts lost 10/48 vs 7/12. Why it matters:
  on that 100 h account the belt seed alone decided deep stages (seed 2 won 17/17, seed 1 0/17).
  Stages 1–3 keep the plain gift (their chip-damage curve is calibrated on it — `campaignCurve.test`).
- **Anti-farm rule:** new growth STARTS only during waves. An organism already in flight
  finishes its remaining seconds in the build phase, but nothing new is born there — with
  auto-wave off, idling between waves yields zero belt income (the flat recycler payout plus
  wave-gated growth closes the infinite-biomass loop; contract-tested).
- Choices per organism: **Deploy** (place it) · **Strain** (consume it to raise a deployed
  tower of the same kind one level — §merge) · **Discard** (instant recycle).
- Overflow: when the queue is full the newest organism auto-enters the **Biomass Recycler** —
  the player receives the current base deployment value. Nothing is wasted.
- The belt rolls only kinds the ACCOUNT OWNS (docs/TOWERS.md §expansion — dormant expansion
  towers join the pool the moment they're synthesized in the Tower Lab).
- Weights: kinds not currently deployed get a mild boost (`CONVEYOR.undeployedBias` 1.6); the
  favorite is down-weighted ×0.4 (always deployable anyway — on the belt it is mostly strain
  fuel); never deterministic-only — every run reads differently. Rolls ride a DEDICATED rng
  stream (`seed ^ 0xb10c0de5`): an untouched belt never perturbs gameplay rng (golden safety,
  contract-tested).

## 5. Merging (§merge — PROMPT 4 scope)

Conveyor duplicate + **Strain** → consumes the organism, target tower `strain +1` (to V max).
The **highest-Power eligible tower is auto-selected**. Branches, Mastery, Gene Cards, and
Equipment interactions are untouched — everything stacks.

## 6. Economy (§economy — PROMPT 5 scope)

ONE universal deployment curve — no per-tower prices:
`deployCost(n) = 100 · 1.11ⁿ` (n = deployments this run — smooth compounding). Strain cost =
`100 · 1.05ⁿ × [3, 4, 5, 6]` (I→II ×3 · II→III ×4 · III→IV ×5 · IV→V ×6): the design brief's
ladder on its OWN gentler escalator — pricing merges off the live deploy compound bought ZERO
campaign merges in probes (§9 adjustments). Discard/overflow payout: FLAT 50 (a compounding
refund would be an idle money printer). Strain V stays a run trophy in campaign (max III–IV by
stage 8); deep endless completes the ladder (§9). Numbers were simulated before finalizing —
probe data, probability tables, and the DIFFICULTY.md §contract re-verification live in §9.

## 7. Integration map (§integration — PROMPT 7 scope)

Power Score (run temp power + prediction) · Collection · Tutorial (conveyor + strain lessons)
· Help/mechanics registry · Tower Lab (favorite picker) · Mastery (strain-reached tracking) ·
HUD · Run Summary (max strain per tower) · Campaign/Infinite balance · Achievements · Stats ·
Save (favorite + collection ledgers; strain itself never saved) · import/export/reset · docs.
The audit rule: any surface that renders a tower's identity must render its strain.

## 8. Status

- ✅ Framework (this doc §2–§3): types, registry, resolution, power, cast-path hooks, renderer
  organ ladder, Inspector display, tests.
- ✅ PROMPT 2 ladders: all 20 defs, 16 unique verbs live in the executor (cast path, impacts,
  wave-start, tower caches topology, infection paths, obelisk field), contract-tested.
  Per-tower SIGNATURE organs (beyond the shared II–V ladder) remain a polish hook (§visuals).
- ✅ §conveyor: sim-owned belt (dedicated rng — golden-safe), growth → 3-slot ready queue,
  overflow → FLAT recycler payout (never compounds — the exploit rule), Deploy (arrival strain)
  / Strain / Discard intents, undeployed-kind bias, favorite on the account save (Tower Lab
  picker), Toolbar conveyor rail, click-router arming; tutorial keeps the classic rail.
- ✅ §merge: `strainFromConveyor` — consumes the duplicate, auto-targets the highest-Power
  same-kind tower (tier → strain → seniority), branches/mastery untouched.
- ✅ §economy: universal `deployCost = 100·1.11ⁿ` (favorite + conveyor deploys), strain cost
  `100·1.05ⁿ × [3,4,5,6]`, flat recycler 50 — simulated + retuned in the PROMPT-8 pass (§9).
- ✅ Ceremony + polish (PROMPT 6 core): the strain moment rides the mutation spectacle
  (hitstop, burst, absorption, splice + shake, banner with the mutation's name); conveyor slots
  arrive with a pop, pulse while ready, show live costs + merge-target tooltips.
- ✅ §integration (first wave): Results shows the run's Deepest Strain (celebrates at V);
  RunStats.maxStrain (additive); Help wiki entries; favorite rides save import/export/reset
  automatically. Remaining: achievements, collection/stat ledgers, a tutorial lesson.
- ✅ simulation & validation report (PROMPT 8): §9 — campaign/endless/mono-favorite probes,
  the economy retune, and the verdict checklist.
- ✅ integration long-tail: lifetime ledgers (`stats.bestStrain` / `strainsEvolved` /
  `towerBestStrain` — additive save schema, statistics rows, Tower Lab + Results per-kind
  display), strain achievements (Mutagenesis · Apex Strain · lifetime-evolution ladder), the
  tutorial graduation step now points at the conveyor/strain loop.
- ✅ three new towers (docs/TOWERS.md §expansion): Carrion Maw / Amber Chrysalis / Wailing
  Effigy inherited the conveyor + Strain for free (registry-driven) and shipped full II–V
  ladders (12 new unique verbs — the identity table above covers all eight towers).

## 9. Simulation & validation report (§report — PROMPT 8)

Probes (vite-node instruments, scratchpad): a conveyor-aware campaign probe playing REAL stages
the way a player must (favorite opening + belt deploys/merges/discards, branch buys, 5 seeds ×
stages 1/5/8 × power ratios ×0.75/×1.0/×1.7); an endless mid-account probe (damage ×3, +4
slots, +100 integrity) with merge-on/merge-off arms; a mono-favorite degenerate probe; and the
autoplay goldens.

### Cost curves (final)

| deployments n | deployCost | I→II | II→III | III→IV | IV→V |
|---|---|---|---|---|---|
| 0 | 100 | 300 | 400 | 500 | 600 |
| 5 | 169 | 383 | 511 | 638 | 766 |
| 9 | 256 | 465 | 621 | 776 | 931 |
| 14 | 431 | 594 | 792 | 990 | 1188 |

`deployCost(n) = 100·1.11ⁿ` · `strainCost(n, from) = 100·1.05ⁿ·[3,4,5,6]` · recycler flat 50.
A full 9-deploy board totals ≈ 1 416 biomass; one tower's full I→V ladder at that board ≈ 2 793;
saturating a 10-tower endless board ≈ 30–36 k (deep-endless income covers it by ~wave 40).

### Conveyor probabilities

- **Kind** (dedicated rng stream): deployed 1.0 · undeployed 1.6 · favorite ×0.4. Opening board
  (favorite + one other kind down): each undeployed kind 25.8%, the deployed non-favorite 16.1%,
  favorite 6.5%. All five kinds deployed: non-favorites 22.7% each, favorite 9.1%.
- **Rarity** (wave-drifted; the drift weights sum to zero, so totals stay 100): wave 1 ≈
  69.4 / 24.2 / 5.3 / 1.1 (common/uncommon/rare/epic) → wave 12 ≈ 62.8 / 26.4 / 8.6 / 2.2 →
  wave 20 ≈ 58 / 28 / 11 / 3. Rare arrives at Strain II, epic at Strain III.
- **Throughput:** one organism at a time; 14 s base, ×0.94 per wave, 7 s floor from ~wave 12.

### Biomass economy assumptions

- Wave income is untouched by the belt; the only new inflow is the FLAT recycler drip (≤ 50 per
  maturity). Autoplay measures ≈ +900 over a 12-wave run (the golden re-pin delta, ~10% of run
  income) — bounded, and flat-vs-compounding means overflow can never be farmed (test-enforced).
- The universal curve replaces per-tower prices; the calibration assumption is contract-level,
  not list-level: total board spend must keep the DIFFICULTY.md §contract bands without
  recalibration — re-verified below.
- Merges compete with branch tiers for the same biomass; the probe policy banks for strains once
  the board is developed, which is the intended late-run decision shape.

### Campaign contract re-verification (5 seeds each; merges active)

| Stage | ×0.75 | ×1.0 | ×1.7 |
|---|---|---|---|
| s1 | 5/5 wins · lost 4 · strains 0.4 | 5/5 · lost 1 · strains 0.2 | 5/5 · lost 0 · strains 0.2 |
| s5 | 5/5 · lost 22 · strains 1.2 | 5/5 · lost 20 · strains 1.6 | 5/5 · lost 20 · strains 0.6 |
| s8 | 4/5 · lost 45 · strains 2.2 | 5/5 · lost 19 · strains 2.4 | 5/5 · lost 0 · strains 2.2 |

Contract shape intact (≥rec ≈ no/chip damage; ×0.75 ≈ bad time at depth). Merge pacing ramps
0.2 → 2.4 per run across the campaign; max Strain III–IV by stage 8 — the run-trophy target.

### Endless (mid-account, seeds 5/13)

| Arm | Fell wave | Merges | Board | All-V at wave |
|---|---|---|---|---|
| merging | 57 / 51 | 40 / 40 | 10× Strain V | 50 / 39 |
| never merging | 36 / 32 | 0 | 10× Strain I | — |

Strain merging extends endless depth ≈ +20 waves (~58%) — a proportionate ceiling lift for THE
designated late-game layer, and depth pressure still ends the run (no immortal board). The
all-V board completes only in the final quarter; the binding limiter deep is belt throughput
(7 s floor + kind roll), not price.

### Favorite dominance check

Mono-favorite boards (deploy ONLY needle, merge only needle duplicates, recycle the rest):
**0/5 wins at s5 AND s8 ×1.0** (lost 128 / 114 vs the mixed board's 20 / 19). Siege role
coverage punishes single-kind boards — the favorite is a convenience anchor, not a strategy.

### Balance adjustments made during testing

1. `costGrowth` 1.16 → **1.11** — at 1.16 the deploy compound crowded out every other sink;
   probes recorded 0.0 merges at every stage/ratio.
2. Strain cost DECOUPLED from the live deploy cost — the design brief's "current deployment
   cost × multiplier" still bought 0.0 campaign merges even at 1.11 (IV→V ≈ 6×deployCost(9) ≈
   1.5 k+ mid-stage). Shipped `100·1.05ⁿ·mult`: the ×3/4/5/6 ladder preserved on a gentler
   escalator (the PROMPT-8 rebalance mandate).
3. Endless saturation ASSESSED and ACCEPTED at `strainGrowth` 1.05 (evidence above). Watch
   item: if deep-endless (wave 60+) ever trivializes, the lever is belt throughput
   (`growMin`), NOT `strainGrowth` — campaign merge pacing is the fragile side.

### Verdict checklist (the PROMPT-8 list)

Pacing bands ✓ (0.2→2.4 merges s1→s8; V completes only deep endless) · economy supports strain
decisions without starving deploys ✓ (boards reach 7.4–9.0 towers AND merge on top) · favorite
impactful-not-dominant ✓ (mono check) · kind frequency healthy ✓ (bias contract test; discards
0.0–2.2/run — the belt output is usable, not spam) · overflow not exploitable ✓ (flat payout,
test-enforced) · no duplicate mechanics ✓ (identity test rejects multiplier hooks; 16 unique
verbs, each implemented once) · power scaling audited ✓ (0.05/level temp-power bucket, zero
audit warnings across probes/tests) · loop intact ✓ (goldens byte-stable — autoplay never
merges; untouched-belt rng trace test).
