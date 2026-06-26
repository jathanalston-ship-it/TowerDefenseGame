# COLLECTION.md — Codex, Achievements & Titles (the motivation layer)

The long-term-goals layer that motivates **without granting power**. Where
upgrades (`ECONOMY.md` / `BALANCE-LOG.md`) are the *power* economy, this is the
*completion* economy: discover everything, finish the achievement chains, and
wear the title you earned. None of it touches balance — it is pure
self-directed motivation, so it can grow forever without inflation risk.

> **Status:** ⭐ IMPLEMENTED (v1). Codebase: `src/core/achievements.ts` (data),
> save fields in `src/save/saveStore.ts`, folding in `src/state/meta.ts`, UI in
> `src/ui/Codex.tsx` (+ Results unlock callouts).

---

## 1. Three pillars

| Pillar | What it tracks | Source of truth | Completion |
|---|---|---|---|
| **Codex (Collection)** | Discovered enemy strains, biomes, Gene Cards | `save.codex.{enemies,biomes,cards}` (deduped id sets) | counts vs live content totals |
| **Achievements** | Milestone + chain accomplishments | `save.achievements` (unlocked ids) | 16 across 5 groups |
| **Titles** | A wearable flex earned from capstones | `save.title` (rarest unlocked) | shown on main menu + Results |

All three are **derived, never spent** — they only ever accumulate, so there is
no dead currency and no grind wall.

---

## 2. The Codex (discovery)

Discoveries are recorded **during a run** by the deterministic core as
write-only sets (they never read back into the sim, so determinism is
untouched), then **unioned into the permanent codex** by `meta.recordRun`:

- **Enemies** — `Game.makeEnemyAt` is the single choke point every spawn passes
  through (top spawns *and* splits), so `seenEnemies.add(kind)` captures the full
  bestiary you actually faced.
- **Biomes** — the run's biome (`stage`/`endless` have one; `classic` is null and
  contributes nothing).
- **Cards** — `Game.openDraft` records every card **offered** in a draft (seeing
  it in the 1-of-3 counts as discovery, not just picking it).

`getResult()` surfaces `{ biome, enemiesSeen[], cardsSeen[] }`; the meta layer
unions them in and keeps the legacy `cardsSeen` count in sync with
`codex.cards.length`.

**Completion targets are data-derived** (`TOTAL_ENEMIES`, `TOTAL_BIOMES`,
`TOTAL_CARDS` = `Object.keys(...).length` / `CARD_POOL.length`), so when Task-4
content is added the "discover them all" goals update automatically — no magic
numbers to maintain.

---

## 3. Achievements (`src/core/achievements.ts`)

Each achievement is pure data — `{ id, name, description, group, title?, check }`
— where `check(stats)` reads a small save-derived `AchievementStats` view. Adding
one is a single array entry; **nothing grants stats**, so the layer is
inflation-proof by construction.

Re-evaluated after every run against the **post-run** save (`evaluateUnlocked`),
so newly-crossed thresholds unlock immediately. `recordRun` diffs against the
prior set and returns only the **newly** unlocked ones for a Results celebration.

### The 16 v1 achievements (5 chains)

| Group | Chain (easy → hard) |
|---|---|
| **Initiation** | First Assimilation (1 run) · Persistent Strain (25) · Relentless (100) → *the Relentless* |
| **Defense** | Hold the Line (wave 6 any mode) · Extraction (clear 12 classic) → *Defender* |
| **Stage** | Stage Breaker (3) · Pathfinder (8) · Deep Strain (15) → *Stagebreaker* |
| **Endless** | Tide Holder (15) · Unbroken (30) · Apex Endless (50) → *the Endless* |
| **Collection** | Naturalist (8 strains) · Apex Naturalist (all) → *the Curator* · Cartographer (all biomes) · Archivist (20 cards) · Geneticist (all) → *the Geneticist* |

Thresholds are deliberately spread across **all three modes** so whatever you
play, a chain is advancing — reinforcing the per-mode pacing in `BALANCE-LOG.md`.

---

## 4. Titles

Capstone achievements carry an optional `title`. The worn title is the **rarest
unlocked** one (`titleFor` scans the ordered list, last titled-and-unlocked
wins), stored in `save.title` and shown:

- on the **main-menu header** (`⟡ <title>`), and
- as a **Results callout** the run it is first earned (`reward.newTitle`).

Titles are unique and purely cosmetic — the endgame flex, not a stat.

---

## 5. Adding content (workflow)

- **New achievement:** append one `AchievementDef` to `ACHIEVEMENTS`. If it needs
  a stat not yet in `AchievementStats`, add the field there and map it in
  `statsFromSave` (meta.ts). Add a title only for a genuine capstone.
- **New collectible category:** add a set to `CodexData` + `normalizeCodex`
  (saveStore), record it on `RunResult`, union it in `recordRun`, and add a
  `CollectionStat` row + (optionally) a Collection achievement.
- **No UI change needed** for new achievements — `Codex.tsx` renders whatever
  `meta.achievementDefs` contains, grouped by `meta.achievementGroups`.

---

## 6. Save & compatibility

`codex`, `achievements`, and `title` are **not** in the `isSaveData` type gate, so
pre-codex saves still load and are backfilled empty by `normalizeSave`
(`normalizeIdList` dedupes and drops junk; unknown ids are kept forward-compat).
Wiping or importing a save carries the codex with it like any other progress.
