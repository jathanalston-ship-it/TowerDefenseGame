# BOSSES.md — Boss Framework (canonical spec)

Bosses are **build-checks, not bigger health bars.** Each is an ordinary composed
`EnemyDef` (see `ENEMIES.md`) flagged `isBoss`, plus a **`BossProfile`** that makes it a
phased, arena-shaping set-piece. The whole system is **data-driven**: adding a boss is a
roster entry — no new engine code. Source: `src/core/bosses.ts` (content + pure helpers),
`src/core/game.ts` (`bossSystem` runtime), `src/core/config.ts` (`BOSS` safety caps).

> **Status:** ✅ implemented. 12-boss launch roster across the five faction-biomes; the
> renderer draws each from a parametric silhouette; selection + procedural modifiers are
> wired for Stage/Endless. The runtime is unit-tested (`bosses.test.ts`) and the render
> path is headless-verified.

---

## 1. Anatomy of a boss

A `BossProfile` (attached to the `EnemyDef` via `boss`) carries:

- **`silhouette`** — a parametric shape the renderer draws (`form` + `accent` + `spikes` +
  `eyes`), so every boss reads as a distinct shape with no bespoke draw routine. Forms:
  `sac · titan · serpent · mech · crown · walker · aberration`.
- **`weakness`** — a per-source-class damage bias (`Kinetic` = Needle/Ravager · `Caustic` =
  Mortar/Corrosion · `Vital` = Bulwark). `>1` weak, `<1` resistant. This is the
  *"test the build, not the DPS"* lever: a boss that resists your one damage type forces
  you to bring another. Applied in `applyDamage` via `bossDamageMult`.
- **`phases`** — HP-gated stages (`phases[0].at === 1`, descending). On entry a phase can
  re-stat the boss (`speedMult` / `damageMult` / `armorBonus`), grant a `shield`,
  burst-summon (`onEnterSummon`), and swap the `weakness`; while active it runs its
  `abilities`. The phase name is the on-screen tell.

## 2. Ability verbs (composable)

Each ability is one `kind` whose handler composes existing sim primitives — so the sim
reads them all through one generic hook (`bossSystem` → `runBossAbility`):

| Verb | Tests the player to… | Key fields |
|---|---|---|
| `summon` | bring AoE/clear (board pressure) | `enemy`, `count` |
| `volley` | position/dodge (fan of shots at the hero) | `count`, `damage` |
| `shield` | burst/Shred through a fresh shield | `amount` |
| `heal` | apply DoT/pressure (Corrosion negates it) | `amount` (≤1 = %maxHP) |
| `enrage` | keep slows/CC + burst windows ready | `speedMult`, `duration` |
| `hazard` | mind hero footing (hostile ground pool) | `damage`, `radius`, `duration` |
| `suppress` | not over-cluster towers (EMP/jam) | `radius`, `duration` |
| `surge` | hold the chokepoint (lunge at the line) | `dist` |
| `cloak` | sustain DPS, not gappy burst (untargetable window) | `duration` |

Each ability has a `cooldown` and a `firstAt` (delay after phase entry). Global safety
caps live in `config.ts BOSS` (add cap, volley speed/spread, surge clamp, summon scatter).

## 3. Runtime (`bossSystem`)

One system steps every live boss each tick: initialize on first sight, cross HP
thresholds to advance phases (re-stat + burst-summon + phase tell), tick per-ability
cooldowns and cast, and expire timed states (`enrageUntil` / `invulnUntil`). A cloaked
boss is **untargetable** (towers/hero skip it) for its window. All runtime state lives on
`Enemy.boss` (`BossRuntime`); abilities reuse the pools/grid/float systems, so nothing
here is boss-specific engine code beyond the dispatch.

## 4. Procedural modifiers

`BOSS_MODIFIERS` layer enhancements on top of any profile (`Colossal`, `Frenzied`,
`Unstable`, `Vampiric`, `Warded`, `Adaptive`). A wave's `BossInjection.mutators` folds via
`applyBossModifiers` into one effect at spawn: stat scales + extra always-on abilities +
the `adaptive` flag (rotate the resisted class each phase). This is the seam Stage/Endless
escalation and event mutators ride on. Adding a modifier is one entry.

## 5. Roster & selection

12 launch bosses, each a distinct build-check, grouped by faction-biome:

| Biome | Mini-boss(es) | Flagship (deep / Endless) |
|---|---|---|
| wasteland (Parasites) | Brood Tyrant | The Progenitor |
| machine (Machine Cult) | Aegis Frame · The Reclaimer | The Forgemind |
| corporate (Corp. Security) | Field Commander · Breacher Prime | "Golden Parachute" |
| bone (Hive Organisms) | Lumberer King | The Apex Rival |
| marsh (Neural Aberrations) | The Phantom Choir | The Dreaming God |

`bossForBiome(biome, stageNumber)` picks deterministically (deep stages ⇒ flagship; no RNG
draw, so wiring boss selection never perturbs the wave RNG stream → stage determinism
preserved). `flagshipBoss(biome)` is the Endless surge target.

## 6. Adding a boss

1. Add a `BossKind` + a `BOSS_ENEMY_DEFS` entry: a composed `EnemyDef` (`isBoss`) + a
   `BossProfile` (silhouette, weakness, ≥2 phases of abilities).
2. Slot it into `BIOME_BOSSES` (shallow pool or flagship).
3. That's it — selection, runtime, modifiers, and rendering pick it up from data. Pick an
   existing `form` (or add one `case` to `drawBossForm`). Keep numbers tuned around Stage
   progression; bosses appear on a stage's final wave.
