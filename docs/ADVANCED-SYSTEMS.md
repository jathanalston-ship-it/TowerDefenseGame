# ADVANCED-SYSTEMS.md — Boss framework · Hero equipment · AI Director

Implementation companion to `EQUIPMENT.md` and `STAGES.md` (the canonical specs).
Covers the three systems added this pass, **how they stay deterministic**, what is
wired vs. reserved, and where to extend. All three are **additive and off in the
scripted Stage run**, so the golden tests stay byte-identical.

---

## The determinism contract (why golden still passes)

The sim is deterministic from `(seed, meta, towerProgress, opts)`. These systems hold
the line three ways:

1. **Equipment folds in at construction.** A run's loadout resolves to `CardEffect[]`
   that mutate the `RunModifiers` bucket once, at boot — never the hot combat path. A
   **gear-less run is identity** (every new field defaults neutral), so the golden
   autoplay (no equipment) is unchanged.
2. **Bosses are additive.** A framework boss only exists when spawned (Director /
   Endless / debug); the authored Stage waves never spawn one. `bossSystem` is skipped
   entirely when `bossCount === 0`, so a normal run pays nothing and stays identical.
3. **The Director is Endless-only.** `RunOptions.mode` defaults to `'stage'` (the
   authored `WAVES`); `'endless'` swaps the spawn source to the Director. The golden
   path is `stage`, so it never touches the Director.

> Verified: all 6 golden seeds byte-identical; 16 new unit tests incl. an
> **Endless-mode determinism** check (same seed → identical run).

---

## 1. Modular boss framework (`src/core/boss.ts`)

A boss is a **composition**, not a big enemy: `BossDef = chassis + modules[] +
phases[] + modifiers`.

- **Chassis** — body plan (bruiser/artillery/swarmlord/controller/juggernaut) → base
  stat profile.
- **Mechanic modules** — telegraphed, counterable abilities from a shared pool:
  `spawner` (summons), `enrager` (ramp), `shieldphase` (invuln window), `channeler`
  (a Nucleus cast — the arena mechanic). `charger`/`suppressor` are defined and
  **reserved** (assembler draws from the wired set).
- **Phases** — HP-gated transitions; later phases activate more modules. Advancing
  resets shield/telegraph so add-pressure can't snowball into an unwinnable state.
- **Modifiers** — elite-style affixes scaled with TL.

The sim owns execution: `Game.spawnBoss(def)` plants a boss enemy carrying a
`BossRuntime`; `bossSystem(dt)` drives phases + module cooldowns + telegraphs; a React
**boss banner** (name / HP / phase / telegraph) renders from `HudSnapshot.bossBanner`.

**New boss = one `BossDef`** (see `BOSS_DEFS.progenitor`). `assembleBoss(rng, tl)`
rolls them **procedurally** for infinite depth (module/phase count rise with TL,
fairness-constrained) — the future-proofing the spec asks for.

## 2. Hero equipment (`src/core/equipment.ts`)

Three slots — **Weapon · Armor · Relic** — behavior-first per `EQUIPMENT.md`:

- **Rarity** (common→exotic) sets rolled **affix count**; affixes roll a **tier**
  (T1–T6, bounded) — the reroll chase, never unbounded.
- **Catalog**: ~20 weapons + ~20 armor + ~20 relics, each with an always-on `base`
  behavior + a design-intent `desc`. **Sets** (2/4-piece) and **legendary/exotic
  signatures** layer on.
- **Application**: `loadoutEffects(inventory, loadout)` → `CardEffect[]` (base +
  tier-scaled affixes + set bonuses), folded into the run at construction. Composes
  with cards/meta in the one R-bucket.
- **Economy**: items drop at run end (rarity scales with depth) and from the debug
  panel; **reroll** (Mutagen), **transmute** (Catalyst → +rarity/affix), and
  **salvage** (→ materials) are the crafting/reroll hooks. UI: the menu **Hero
  Equipment** panel (equip/filter/craft).

**What's wired vs. reserved (honest scope):** effects that map to existing sim levers
(extra projectiles, mortar-applies-Fracture, +Fracture cap, splash/pool tuning,
overcharge, corrosion slow, hero dmg/cooldown, biomass, and the new construction-time
`integrityMult`/`heroMaxHpMult`/`startBiomassBonus`) **apply now**. The richer
catalogued behaviors (cleave, chain, summon-on-death, auras, lifesteal, execute,
revive) are carried as `desc` + mapped to the nearest lever — the **architecture +
catalog + pipeline are complete**, and each unique behavior wires into the combat loop
incrementally. Item-level (Catalyst +5%/lvl) is deferred; reroll/transmute/sets ship.

## 3. AI Director + Endless mode (`src/core/director.ts`)

The Director generates **Endless** waves dynamically to prevent repetition while
staying fair (STAGES §6/§9/§13):

- **Threat budget** scales with depth; spent on a **wave shape** (swarm / armored /
  mixed / rush / elite / boss) — and a shape **never repeats** twice running.
- **Elite frequency** rises with depth (promoted enemies are buffed in place).
- **Pacing / miniboss timing** — a procedural (mini)boss caps every `bossEvery`
  depths (ties in the boss framework); **swarm events** burst every `swarmEvery`.
- **Modes** — `stage` runs authored `WAVES` (golden path); `endless` runs the
  Director forever (no victory; ends on Nucleus loss). HUD shows **Depth**; the menu
  has an **∞ Endless** button. Same enemy/boss data feeds both modes.

Tunables live in `config.ts` (`BOSS`, `DIRECTOR`); the Director is deterministic from
the run seed.

---

## Extension points

- **New boss:** add a `BossDef` (or rely on `assembleBoss`); wire a reserved module by
  adding a `case` in `bossSystem`.
- **New item / affix / set:** add an `EquipDef` / `AffixDef` / `SetDef` (data). A new
  behavioral lever = one `RunModifiers` field + its sim read.
- **New wave shape / director rule:** add to `ROSTER` + `SHAPE_ROTATION`, or tune
  `DIRECTOR`.
- **Stage→Endless seam, biomes, node graph, corruptions** (STAGES §3–5, §8) remain
  designed-not-built — the Director is the generation core they'd plug into.
