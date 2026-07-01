# Content Authoring — the "add content fast" reference

ASSIMILATE is in **content-production mode**. This is the canonical, audited answer to *"to add one
X, which file(s) do I touch and what do I paste?"* The engine is registry-driven, so **almost every
content type is a single-file edit** — this doc removes the discovery cost (which, in a ~100-file /
~55-doc repo, is the real friction) and pins the exceptions.

**Golden rule:** add one entry to one registry's source array/map. `content-integrity.test.ts`
(registry⇄source drift, dangling refs, census) + each registry's `validate` + `npm run typecheck`
catch mistakes. If you can compile and the tests pass, the content is wired everywhere (lookups,
save records, collection codex, validators) — because those all *derive* from the registry.

## Audit — files-to-touch per category

| Category | File | # files | How it propagates |
|---|---|:--:|---|
| **Meta Upgrade** | `core/config.ts` → `META_UPGRADES[]` | **1** | `metaModifiers` folds `effect.stat`; shop UI + Power auto-read |
| **Gene Card** | `core/cards.ts` → `CARD_POOL[]` | **1** | draft/weights/collection derive; `cardProblems` validates |
| **Equipment item** | `core/equipment.ts` → `WEAPONS`/`ARMOR`/`RELICS[]` | **1** | compose into `ALL_ITEMS`; drops/armory/collection/Power derive |
| **Equipment Set** | `core/equipment.ts` → `SETS{}` | **1** | set bonuses fold via `loadoutEffects` |
| **Authored Boss** | `core/boss.ts` → `BOSS_DEFS{}` | **1** | `bossRegistry` + Bestiary derive (procedural bosses need 0) |
| **Biome** | `core/biomes.ts` → `BIOMES[]` | **1** | campaign regions, roster bias, ambient, hazards derive |
| **Achievement** | `state/achievements.ts` → `ACHIEVEMENTS[]` | **1** | persistence, toasts, rewards, progress derive |
| **Difficulty** | `core/difficulty.ts` → `DIFFICULTIES{}` | **1** | all 12 levers consumed by sim + `finishRun` |
| **Doctrine** | `core/doctrines.ts` → `DOCTRINES[]` | **1** | run-effect fold |
| **Status / Rarity / Ascendant node / Mutator / Branch / Star path / Mastery track** | that system's file | **1** | own registry |
| **Collection entry** | — | **0** | *auto-derived* from the content registries |
| **Campaign stage** | — | **0** | *procedurally generated* (`generateStage`) — no authoring |
| **Tower** | `core/types.ts` (union) **+** `core/config.ts` (`TOWER_DEFS`) | **2** | order/save/validators derive; **TS enforces** union⇄def |
| **Enemy** | `core/types.ts` (union) **+** `core/config.ts` (`ENEMY_DEFS`) | **2** | same |
| **Hero** | `core/types.ts` (union) **+** `core/config.ts` (`HERO_DEFS`) | **2** | same |
| **Audio cue** | `audio/sound.ts` (`cue` switch + synth fn) | **1** | switch ladder (see gaps) |
| **VFX** | renderer / visual system | **1** | not registry-backed (see gaps) |
| **Localization** | — | **n/a** | **no layer yet** (see gaps) |

**Verdict:** 10 of 13 requested categories are already **1 file (or 0)**. The only multi-file case
is the three *kinded* content types (tower/enemy/hero), and it's a **second tiny edit the compiler
forces** — not an error-prone one.

## The one 2-file case — and its fix

`TowerKind`/`EnemyKind`/`HeroKind` are literal unions in `types.ts` while the defs live in
`config.ts`. Both stay in sync because `TOWER_DEFS: Record<TowerKind, TowerDef>` — omit either side
and **it won't compile**. So today's workflow is: add the id to the union, add the def; done, safe.

**Planned single-file fix (SCALABILITY.md "B1 de-union"):** derive the union from the def map so a
new tower is *one* `config.ts` edit:

```ts
// config.ts
export const TOWER_DEFS = { needle: { … }, /* new: */ railgun: { … } } satisfies Record<string, TowerDef>;
export type TowerKind = keyof typeof TOWER_DEFS;
// types.ts  (type-only re-export — erased, no runtime cycle)
export type { TowerKind } from './config';
```

This is a **structural change touching the union every file imports**, so it wants a quiet window
(not mid-content-batch) — it is deliberately deferred, and until it lands the 2-file path above is
compiler-safe. **Do not** hand-maintain `TOWER_ORDER`/`ENEMY_KINDS`/save records — they already
derive from the registry.

## Templates (paste, tweak the values)

```ts
// Meta Upgrade — core/config.ts META_UPGRADES[]
{ id: 'reinforced_carapace', name: 'Reinforced Carapace', description: '+N max Integrity.',
  baseCost: 60, costMult: 1.6, maxLevel: 10, effect: { stat: 'integrityBonus', perLevel: 8 } },

// Gene Card — core/cards.ts CARD_POOL[]
{ id: 'venom_glands', name: 'Venom Glands', rarity: 'rare', category: 'tower',
  description: '+18% Caustic tower damage.', effects: [{ op: 'mul', field: 'towerDamageMult', value: 1.18 }] },

// Equipment item — core/equipment.ts, into WEAPONS / ARMOR / RELICS (they compose into ALL_ITEMS)
{ id: 'w_spine_lash', name: 'Spine Lash', slot: 'weapon', weaponType: 'melee', setId: 'apex',
  base: [{ op: 'add', field: 'heroThornsFrac', value: 0.15 }], desc: '…' },

// Achievement — state/achievements.ts ACHIEVEMENTS[]
{ id: 'boss_slayer', name: 'Apex Predator', desc: 'Slay 10 bosses.', reward: 60,
  test: (c) => c.save.bossesSlain.length >= 10, progress: (c) => ({ cur: c.save.bossesSlain.length, max: 10 }) },

// Biome — core/biomes.ts BIOMES[]  (see the file's BiomeDef for the full mods shape)
// Authored Boss — core/boss.ts BOSS_DEFS{}  (chassis + modules + phases + modifiers)
```

Any `effects: CardEffect[]` that touches a **strength** field must also appear in
`POWER_RELEVANT_FIELDS` (core/power.ts) — the `power-coverage` validator errors otherwise, so
strength content can't ship without a Power weighting. New offense knob ⇒ add its weight to
`FIELD_WEIGHT`/`ADD_POWER`.

## Verify (every content edit)

```
npm run typecheck   # union⇄def, effect fields, exhaustive Records
npm test            # content-integrity (drift/census), per-def validators, power-coverage, golden
```

Raise the census minimums in `content-integrity.test.ts` as batches land (it guards accidental loss).

## Known pipeline gaps (recommendations, not built here)

1. **Localization** — strings are inline. *Recommendation:* a `core/strings.ts` id→text registry +
   a `t(id)` hook that defaults to English; content already carries ids, so this is additive. A
   framework, so scope it deliberately (not during a content batch).
2. **VFX registry** — visual effects are hand-coded in the renderer. *Recommendation:* an
   `effectRegistry` keyed by id (spawn/hit/death/ability) so a def references `vfx: 'id'` — turns
   new effects into data. Medium effort.
3. **Audio `cue` switch** — `sound.ts` dispatches ~32 tags via a switch. Single-file, but a
   registry (`{ tag: synthFn }`) would remove the ladder and let content self-register cues.
4. **B1 de-union** (above) — the only remaining multi-file authoring case.

These are the highest-leverage *pipeline* investments; the roadmap sequences them against content.
