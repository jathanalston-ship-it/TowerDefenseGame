# CONTENT-GUIDE.md — Adding Content (towers, heroes, enemies, bosses, cards, equipment, biomes, waves)

How to add each kind of content to ASSIMILATE. The project is built so that
**content is data, not code**: almost every addition is a single entry in a
config table, and the engine picks it up with no further changes. This guide is
the source of truth for the "add a new X" workflow.

> **The one principle.** A new piece of content that *reuses an existing
> behavior* is **pure data** (one table entry). A piece with a *genuinely novel
> mechanic* needs exactly three steps — (1) a data field, (2) a read at the
> relevant engine hook, (3) the content entry — and never touches existing
> content. That is the same shape everywhere below, so the pattern transfers.

All balance numbers live in `src/core/config.ts` (CLAUDE.md: centralize tunables).
Content is **deterministic** — no `Math.random` (use the seeded `Rng`), no
wall-clock, no DOM in `src/core/`. Run `npm run typecheck && npm test` after any
addition; the determinism + structural tests guard the contracts.

---

## Quick reference

| Content | File | Effort | Hook needed? |
|---|---|---|---|
| **Tower** | `config.ts` `TOWER_DEFS` | data entry | only for a novel firing behavior |
| **Hero** | `config.ts` `HEROES` | data entry | only for a novel ability type |
| **Enemy** | `config.ts` `ENEMY_DEFS` | data entry | reuse an archetype hook (shield/regen/split/ranged) |
| **Boss** | `ENEMY_DEFS` + `isBoss: true` | data entry | — |
| **Gene Card** | `cards.ts` `CARD_POOL` | data entry | only for a novel run effect |
| **Equipment node** | `config.ts` `*_UPGRADES` | data entry | — |
| **Biome** | `biomes.ts` `BIOMES` + `BiomeId` | data entry | — |
| **Wave** | `config.ts` `WAVES` | data entry | — |
| **Stage objective / modifier** | `stage.ts` `OBJECTIVES` / `ENV_MODIFIERS` | data entry | — |
| **Achievement** | `achievements.ts` `ACHIEVEMENTS` | data entry | see `COLLECTION.md` |

---

## Towers — `TOWER_DEFS` (`config.ts`)

A tower is a `TowerDef`: `{ kind, name, combatClass, cost, range, fireInterval,
damage, projectileSpeed, splash, color, blurb }`.

**Stat-variant tower (pure data):**
1. Add the `kind` to `TowerKind` in `types.ts`.
2. Add a `TOWER_DEFS[kind]` entry and list it in `TOWER_ORDER`.

That alone gives a working tower using the generic fire/projectile/splash path.

**Novel firing behavior** (e.g. a chain-lightning tower): the per-kind specials
(needle focus-fire, mortar lobbing, reactor aura) are dispatched on `t.kind` in
`game.ts`. Add your branch at the same tower hook points (`towerFireSystem` /
projectile resolution). Keep the *numbers* in `config.ts`; only the *mechanic*
lives in code.

---

## Heroes — `HEROES` (`config.ts`)

Heroes are now a data-driven record (`HEROES: Record<HeroId, HeroDef>`). The
active hero is read through `HERO` (aliased to `HEROES[DEFAULT_HERO_ID]`), so the
engine never references a specific hero.

**Stat-variant hero (pure data):**
1. Add the id to `HeroId` in `types.ts`.
2. Add a `HEROES[id]` entry: movement/attack tunables + an `ability`
   (`{ name, cooldown, radius, damage, fracture }`).

The hero plays immediately if made the default (`DEFAULT_HERO_ID`). **Hero
*selection*** (choosing among the roster at run start) is the only remaining
wiring — a future menu that sets which `HeroId` the `Game` constructs with; the
data layer is already roster-ready.

**Novel ability type** (e.g. a dash instead of an AoE leap): the ability
resolves at the hero-ability hook in `game.ts`. Add the new ability behavior
there, keyed off `ability.name`/`id`; numbers stay in the `HeroDef`.

---

## Enemies — `ENEMY_DEFS` (`config.ts`)

The richest data-driven system. An `EnemyDef` carries stats, a **steering
`behavior`** (how it *thinks* — `seek` / `avoidTowers` / `avoidHero` /
`separation` / `jitter`, plus `flying` / `burrowing`), and optional **archetype
hooks**, each a single data field handled generically by the engine:

| Hook | Field | Effect |
|---|---|---|
| Shielded | `shield: number` | soaks damage before HP |
| Regenerating | `regen: { perSec, delay }` | heals after `delay`s unhurt |
| Splitter | `split: { kind, count }` | bursts into others on death |
| Ranged | `ranged: { range, damage, interval, speed }` | shoots the hero |

**To add an enemy (pure data):**
1. Add the `kind` to `EnemyKind` in `types.ts`.
2. Add an `ENEMY_DEFS[kind]` entry — pick a `behavior` profile and (optionally)
   one or more archetype hooks. No new code: spawns, steering, splitting,
   shields, regen, and ranged fire all read these fields.
3. Reference it in a `WAVES` group (or it's spawnable via the debug panel).

A *new* archetype mechanic follows the three-step pattern: add an optional field
to `EnemyDef`, read it at the matching enemy hook, then author enemies that use
it — existing enemies (which omit the field) are unaffected.

---

## Bosses — `ENEMY_DEFS` + `isBoss`

A boss is just an enemy flagged `isBoss: true` (e.g. the Brood Tyrant). The flag
is the data hook that future boss-bar UI, codex highlighting, and boss-reward
logic key off. To add a boss: author a strong `ENEMY_DEFS` entry, set
`isBoss: true`, and place it as the finale group of a wave. Bespoke boss
*phases* (if ever wanted) follow the standard hook pattern.

---

## Gene Cards — `CARD_POOL` (`cards.ts`)

Cards are the temporary run bucket (reset every run). A `CardDef` is
`{ id, name, rarity, category, description, apply }`, where `apply(ctx)` mutates
one shared `RunModifiers` bag the sim reads at fixed hook points.

**Card reusing an existing knob (pure data):** append one `CARD_POOL` entry whose
`apply` tweaks an existing `RunModifiers` field (e.g. `towerDamageMult`). Rarity
weighting and distinct-draft logic scale automatically.

**Card with a novel effect (the three-step move, documented in `cards.ts`):**
1. add a field to `RunModifiers` (+ its default in `defaultRunModifiers`),
2. read it at the relevant hook in `game.ts`,
3. append the `CardDef`.

Tunable constants for behavioral cards live in `CARD_FX` (`config.ts`).

---

## Equipment — `*_UPGRADES` (`config.ts`)

Permanent meta upgrades are data-driven `UpgradeDef`s across four tracks
(`META_/MASTERY_/EQUIPMENT_/PRESTIGE_UPGRADES`), each with a buy-`currency` and an
`apply(mods, level)` that folds into the permanent `MetaModifiers` bucket. **To
add a node:** append one entry to the right track array — `meta.ts` derives the
modifiers and the shop renders it automatically (no UI change). See
`BALANCE-LOG.md` for cost-curve conventions.

> The richer **hero gear** system (weapons/armor/relics, the `E` bucket in
> `PROGRESSION.md`) is *designed but not yet implemented*; when built it will
> follow this same def+apply pattern.

---

## Biomes — `BIOMES` (`biomes.ts`)

A `BiomeDef` is pure theming + generation weighting: palette, lighting, ambient,
obstacle style/density, and spawn bias. **To add a biome:**
1. Add the id to `BiomeId` in `biomes.ts`.
2. Add a `BIOMES[id]` entry (and it joins `BIOME_IDS`).

The procedural stage generator and renderer read biomes by data, so a new biome
immediately appears in stage generation and theming — and the Codex's "visit all
biomes" goal updates its total automatically (`COLLECTION.md`).

---

## Waves — `WAVES` (`config.ts`)

A wave is a `WaveDef` = array of `SpawnGroup`s `{ kind, count, spacing, delay }`.
Append a `WAVES` entry (or edit one) to script enemy composition; `TOTAL_WAVES`
derives from the array length. Per-wave HP/bounty growth is `WAVE_HP_GROWTH` /
`WAVE_BOUNTY_GROWTH`. Endless waves are generated procedurally
(`generateEndlessWave`) and need no authoring.

---

## Stage objectives & environment modifiers — `stage.ts`

Procedural stages assemble from data: `OBJECTIVES` (win conditions like "survive
without leaks") and `ENV_MODIFIERS` (run-wide twists). Each is a def with an
`apply`/`check`; add an entry and the generator can roll it. The arena layout is
data too (`map.ts` `loadArena`), so new maps are layouts, not code.

---

## Checklist for any addition

1. **Type** — add the id to the relevant union in `types.ts`/`biomes.ts` (TS then
   forces you to complete the record — your safety net).
2. **Data** — add the config entry; keep all numbers in `config.ts`.
3. **Hook** — only if the mechanic is genuinely new (data field → engine read).
4. **Verify** — `npm run typecheck && npm test` (determinism + structural tests),
   then `npm run dev` and watch it in-game for anything gameplay-facing.
5. **Document** — note the design intent (role/cost/counter) per CLAUDE.md;
   update the relevant content doc (`TOWERS.md`, `ENEMIES.md`, `HEROES.md`, …).
