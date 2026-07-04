# STRAIN.md — In-Run Tower Evolution (Strain I → V)

The late-game optimization layer: once the board is full, play shifts from *placing* towers to
*evolving* them. Every tower starts each run at **Strain I** and can reach **Strain V**. Strain
is **run-only** (never persisted on the tower), acquired by consuming conveyor duplicates
(§conveyor), and every level grants a **mechanic that exists nowhere else** — not a stat line.

> Strain does NOT replace Stars, Mastery, Branches, Gene Cards, Equipment, or Hero buffs.
> It stacks with all of them. Branches are never removed by straining; Mastery never resets.

**Files:** framework `src/core/strains.ts`; sim hooks in `src/core/game.ts` (cast path,
`raiseStrain`); conveyor (its own core module when §conveyor lands); UI `src/ui/Toolbar.tsx` (conveyor
rail), `src/ui/Inspector.tsx` (strain display); visuals `src/render/renderer.ts` (§visuals).
Tests: `src/core/strains.test.ts`. **Owner:** towers + engine + run-ui.

---

## 1. The identity rule (§identity)

Every Strain level must introduce gameplay **not obtainable** through Gene Cards, Branch
tiers, Stars, Mastery, Equipment, Hero or Global upgrades. The framework enforces the
vocabulary: `StrainHooks` fields are NEW verbs the executor implements only for strains.
Multipliers are forbidden in hooks (power comes as a side effect of the mechanic).

The authored ladders (all 20 in `strains.ts`; each verb implemented ONCE in the sim):

| Tower | II | III | IV | V |
|---|---|---|---|---|
| Needle Spitter | **Secondary Spinneret** — casts TWIN-FIRE on a proc | **Hungering Barbs** — killing shots LEAP to a new victim | **Venom Ducts** — marks DETONATE at 3 stacks | **Apex Spinneret** — rhythmic FRENZY windows (twin-fire guaranteed) |
| Bone Mortar | **Concussive Marrow** — blasts STAGGER enemies up-lane (even off the Hive crust) | **Calcified Clusters** — shells FRAGMENT into sub-munitions | **Shockbone Lattice** — the fragments stagger too | **Echoing Howitzer** — every shell chased by a slower ECHO |
| Flesh Reactor | **Adrenal Glands** — overcharged towers open waves with reset cooldowns | **Glut Sacs** — biomass SURGE at each wave start | **Synaptic Weave** — chained reactors project a WIDER overcharge ring | **Womb of the Colony** — BIRTHS a harvester organism |
| Parasite Nest | **Spore Bloat** — infected deaths burst a SLOWING cloud | **Leaping Broodworm** — the plague LEAPS to a distant host on death | **Neural Infestation** — full infection SEIZES the host (stun, once) | **Brood Nest** — BIRTHS broodling swarms |
| Neural Obelisk | **Static Ganglia** — the field CHARGES enemies stack by stack | **Arc Synapse** — at 6 stacks the host DISCHARGES into neighbors | **Overload Cortex** — discharges STUN their arc victims | **Storm Crown** — every discharge FORKS to 2 extra victims |

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
  remaining arrival timer. New organisms grow on a cadence (`CONVEYOR.arriveEvery`, wave-scaled).
- Choices per organism: **Deploy** (place it) · **Strain** (consume it to raise a deployed
  tower of the same kind one level — §merge) · **Discard** (instant recycle).
- Overflow: when the queue is full the newest organism auto-enters the **Biomass Recycler** —
  the player receives the current base deployment value. Nothing is wasted.
- Weights: kinds not currently deployed get a mild boost (`CONVEYOR.undeployedBias`); never
  deterministic-only — every run reads differently. Rolls ride the gameplay rng.

## 5. Merging (§merge — PROMPT 4 scope)

Conveyor duplicate + **Strain** → consumes the organism, target tower `strain +1` (to V max).
The **highest-Power eligible tower is auto-selected**. Branches, Mastery, Gene Cards, and
Equipment interactions are untouched — everything stacks.

## 6. Economy (§economy — PROMPT 5 scope)

ONE universal deployment curve — no per-tower prices:
`deployCost(n) = CONVEYOR.baseCost · CONVEYOR.costGrowth^n` (n = deployments this run;
base 100, growth ~1.18 — smooth compounding). Strain cost = **current deployment cost ×
strain multiplier**: I→II ×3 · II→III ×4 · III→IV ×5 · IV→V ×6 (the late-game biomass sink;
Strain V is a run achievement, not a routine). Campaign/Infinite scaling must be re-probed
(DIFFICULTY.md §contract) after the economy lands; simulate before finalizing numbers.

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
- ✅ §economy (core): universal `deployCost = 100·1.16ⁿ` (favorite + conveyor deploys),
  strain cost = current deploy cost × [3,4,5,6]. Pacing simulation + probe re-run = PROMPT 8.
- ⏳ §integration (PROMPT 7) · ⏳ simulation report (PROMPT 8) · ⏳ three new towers
  (separate expansion — must inherit Strain for free).
