# SCALABILITY.md — Engine Review at Target Content Scale

**Lead Engine Programmer review.** Target the game must reach without a rewrite:

| Content | Target | Today | Multiplier |
|---|---|---|---|
| Towers | 100 | 5 | 20× |
| Heroes | 30 | 3 | 10× |
| Cards | 500 | ~30 | ~17× |
| Equipment | 300 | seam | — |
| Enemies | 100 | 7 | 14× |
| Bosses | 50 | framework | — |
| Biomes | 25 | 1 | 25× |
| Prestige systems | 20 | 0 | — |

Scope: **scalability, maintainability, tooling, extensibility only — no gameplay,
behavior preserved (golden stays byte-identical).** What the recent frameworks
(`registry`, `modifiers`, `events`, `targeting`) already solve is credited; this
focuses on what *still* bites at scale.

---

## Severity-ranked bottlenecks

### 🔴 B1. Union-typed content + exhaustive `Record<Kind, X>` — the #1 scale tax
`TowerKind`/`EnemyKind`/`HeroKind` are hand-maintained string **unions**, and the
codebase keys ~dozen maps off them as **exhaustive `Record<Kind, …>`**: `TOWER_DEFS`,
`ENEMY_DEFS`, `HERO_DEFS`, `TOWER_SHAPE`/`ENEMY_SHAPE`/`ENEMY_TIER` (render),
`towerStars`/`towerMasteryXp`/`towerShards`/`heroStars`/`heroMasteryXp` (save),
`towerUsage`/`killsByEnemy` (stats), `masteryAccrual`/`statTowerBuilds`/`TowerProgress`
(sim). **Adding 1 of 100 towers forces edits to ~12 maps or the build breaks** — the
exact "systems grow with content" failure the architecture forbids.
**Fix (finish the migration the `registry` started):** content keyed by **stable
string id**; the maps become `Record<string, …>` / `Map` that are **sparse +
defaulted** (lookup returns a default when absent), so a new entry touches *only its
own def*. Keep a thin `branded string` id type for safety, not a 100-arm union. The
save layer already references by id (`registry.resolve/has`); push that everywhere.

### 🔴 B2. `game.ts` god-class — 1,721 LoC and climbing
Every new system/content path inflates one file (was 1,202 at the last audit; +500 for
bosses/heroes/infection/director). It mixes orchestration + ~13 systems + combat math
+ hero AI + boss control + read-models + commands + debug. At 100 towers / 50 bosses
the per-archetype logic *must* live in data + handlers, not here.
**Fix:** the staged **systems → `World` extraction** (`ARCHITECTURE-AUDIT §A`): a
shared sim context, one file per system in `core/systems/*`, `Game` becomes a façade.
The pure-math extraction (`combat.ts`) and the new `targeting.ts` are the first slices.

### 🟠 B3. Behavior wiring for 500 cards / 300 equipment / star unlocks
Declarative stat effects (`CardEffect` = mul/add/flag) scale fine. **Triggered/
conditional behaviors do not** if expressed as `switch`/`if` chains (synergy cards,
on-kill procs, star keystones, relic auras, boss modules). That's hundreds of bespoke
branches.
**Fix:** route them through the **effect-handler registry** pattern (`ARCH §12.1`) on
top of the new `events` + `modifiers` frameworks — `effectId → handler(hooks)`. The
substrate exists; finish migrating card/equipment/star effects onto it so new content =
*data + a registered handler*, never a systems edit.

### 🟠 B4. Single RNG stream → replay/golden fragility as generators multiply
One gameplay `rng` feeds spawns, the Director, boss assembly, and `targeting:'random'`;
**meta loot uses `Math.random`** (non-reproducible). With procgen biomes (25), bosses
(50), and loot tables added, *any* new draw from the shared stream reorders every
downstream draw → silent replay/golden desync.
**Fix:** **named stream splitting** (`ARCH §5`): `rng.fork('combat'|'spawn'|'boss'|
'biome'|'loot')` so a system consuming its stream can't desync another. Move meta loot
onto a seeded stream if reproducible drops are ever wanted (leaderboards/dailies).

### 🟠 B5. Save migrations have no historical-fixture pipeline
`withDefaults` deep-merge is a robust *forward-fill*, but there's no
`migrate v(n)→v(n+1)` ladder with **fixtures of every shipped schema** (the CI gate
the design demands so a trophy is never lost across 20 prestige systems × years of
patches). Unknown ids on load aren't yet dropped via `registry.has()`.
**Fix:** an append-only migration pipeline + a fixtures test; on load, prune ids the
registry no longer knows (it already supports `resolve`/aliases).

### 🟡 B6. UI does not scale past a handful of towers/cards
`Toolbar` renders **every** tower; at 100 it's an unusable wall. Draft samples a small
pool; at 500 cards it needs weighted-by-rarity/category sampling. No codex/collection
screen for 100 enemies / 50 bosses / 500 cards.
**Fix (mostly gameplay-adjacent — flagged, not done here):** a **loadout** (equip K of
N towers/heroes) so the hotbar shows the chosen K; draft via `registry.active()` +
weighted pick; a data-driven codex that iterates registries. *The gameplay-screen
redesign (separate task) makes the hotbar/loadout-ready and panels collapsible.*

### 🟡 B7. Rendering is placeholder-shaped and union-keyed
`drawShape` primitives + union-`Record` shape/tier maps are fine for 7 enemies, not
100 with production art.
**Fix:** a **sprite/atlas registry keyed by string id** (same B1 de-union), batched
draws; pooled multi-part entities for 50 bosses. Perf core (grid, pooling, LOD,
budgets) is already sound and needs no change.

### 🟡 B8. Tooling gaps for content-scale authoring & balance
`autoplay` exists but there's **no batch balance-sweep runner**, no **content census /
integrity CI gate** beyond `registry.test`, and no **schema (Zod) validation** of defs
at load (`ARCH §6.3`). At 500 cards a typo'd field or dangling id should fail in CI,
not in the field.
**Fix:** (a) a `content-integrity` test (added now) that runs every registry's
`validate()`, asserts id uniqueness + that referenced ids resolve, and pins a content
census; (b) a headless `sim:sweep` harness over loadouts × depth; (c) adopt Zod (or a
hand validator) per def shape.

### 🟢 B9. Config monolith (651 LoC) & determinism-guard coverage
`config.ts` holds every tunable; reviewable now, unwieldy at scale → split into
`config/<domain>.ts` re-exported (deferred — pure churn until it hurts). Golden locks
*current* play; generators (director/boss/loot) need **property tests** (same seed →
same blueprint; invariants hold) as they grow.

---

## Prioritized roadmap (engine, no gameplay)

1. **De-union content (B1)** — finish registry adoption; maps become sparse+defaulted
   `Record<string,…>`. Unblocks every other content-scale item. *Highest leverage.*
2. **Effect-handler registry on events+modifiers (B3)** — so 500 cards / 300 gear /
   star keystones are data + handlers.
3. **Systems→World extraction (B2)** — de-god-class once the branch is quiet.
4. **RNG stream splitting (B4)** + **migration fixtures (B5)** — protect replays/saves
   before the content flood.
5. **Tooling (B8)** — integrity gate (now), balance sweep, Zod schemas.
6. **Render atlas (B7)**, **config split (B9)**, **generator property tests**.

> Coordination note: items B1–B3 are the parallel-session's active lane (registry/
> modifiers/events). To avoid stranding shared-branch work, this pass ships the
> **review + the conflict-free tooling gate (B8)**; the structural refactors are
> sequenced for when that lane lands, not raced against it.

## Manual backup write safety

SaveStore.backup validates the current blob, writes a new snapshot, then publishes its index before pruning old snapshots. Failed snapshot/index writes return null; an index failure removes the new unlisted snapshot and leaves the old ring intact. SaveManager reports success only for a returned backup, otherwise offers Export JSON, using a persistent status region. Save schema, checksum envelope, cap and main-save write behavior remain unchanged. Fault-injected storage tests cover both failure points, prior-backup restorability, retry success and corrupt/absent current data.

Manual restore safety: SaveManager confirms the dated snapshot before calling restore and refreshes the backup list afterward. SaveStore loads the target first, backs up valid current data (protecting the chosen target from ring pruning), and returns success only when the main-save write succeeds. If the safety backup fails, restoration stops. Corrupt/absent main saves can still be repaired without copying invalid data. The backup cap and schema are unchanged; tests cover recovery of replaced progress, backup/main-write failures, retry of the oldest snapshot in a full ring and corrupt-main repair.

File-import review: SaveManager reads and validates a selected file with the existing readTextFile/parseImport functions before any import mutation. A named review shows filename and sanitized currency/wave/run totals, focuses its heading, and offers Cancel/Replace progress. Cancel/Escape and successful apply restore focus to Import JSON. Read failures and validation errors never call importText; failed apply retains the preview for retry. Read epochs discard superseded/unmounted file reads. Apply uses meta.importText, which commits imported data before publishing it to the session.

Durable confirmed imports: SaveStore.importSave snapshots the supplied live current state through the shared backup writer, then writes incoming data. meta.importText keeps its strict action guard, validates, rejects stale tabs, applies gear-discovery enrichment, and commits before store.set. Only successful imports cancel a pending coalesced flush, note the clock and stamp the writer. Ordinary persist remains unchanged; explicit imports use their own action pacing rather than the best-effort coalescer. Fault tests cover all three write stages, session identity, stale-tab rejection, subscriber ordering, live recovery state and delayed-flush cancellation.

Restore/session integration: meta.restoreBackup rejects stale tabs before touching storage and supplies the live current save to SaveStore.restoreBackup for recovery. Headless callers may omit live state and recover the readable disk state as before. Successful imports and restores share publishSaveReplacement: clear the old pending flush, note clock, stamp writer, then notify the session. Failed replacements keep the existing session/flush. Browser probes cover real Storage failure injection, tab ownership, durable-before-notify ordering and latest-state recovery.

Cross-platform regression launcher (2026-11-10): scripts/validate.ts invokes the installed TypeScript, Vitest and vite-node JavaScript CLIs through process.execPath, avoiding Windows npm/npx executable-shim failures without invoking a shell. The full suite uses two workers (one minimum) to bound memory; test selection and assertions are unchanged. Child failures report exit status, launch errors or terminating signals with the last twelve output lines. Mobile validation still runs the original build-and-probe path; MOBILECHECK_CHROMIUM selects the installed browser as before.

Validation environment isolation (2026-11-10): the validator explicitly launches Vitest with NODE_ENV=test, and mobilecheck explicitly builds with NODE_ENV=production. This overrides vite-node’s inherited development default only at the child boundary, preserving browser paths, compatibility preloads and other caller environment settings. Standalone mobilecheck and the nested validator now target the same production React runtime as deployment; --no-build requires a caller-provided production build.
