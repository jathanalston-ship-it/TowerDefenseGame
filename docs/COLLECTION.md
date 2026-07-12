# COLLECTION.md — the Codex as permanent progression

The Collection layer is a **registry-driven codex** *and* a **permanent progression system**: every
discovery permanently improves the account. It adds **no save fields** — every category derives from
data the game already tracks — so it can't desync from progression and a fresh account is byte-
identical (golden-safe).

## Architecture

`src/core/collection.ts` (pure; no DOM/sim). `meta.ts` builds the context + folds the bonuses; the
UI (`src/ui/CollectionPanel.tsx`) renders. Each category enumerates straight from a content registry
(`enemyRegistry.ids()`, `ALL_ITEMS`, `BIOMES`, …), so **adding content auto-adds codex entries**.

## §screen — masthead + three wings + tile drill-in (2026-07 overhaul)

The screen no longer stacks ~28 expanded category cards. A **masthead** (overall rank badge,
Power ×mult, discovered/mastery line + bar) sits over a `wing-tabs` sub-nav (shared with the
Profile; `--wingc: var(--viral)`): **Codex** — a compact category **tile grid** (rank-colored
accent, mini completion bar, counts) that **drills into** a per-category detail page (back
button, reward track with milestone pips, next-rank line, live bonuses, full entry grid);
**Memories** — the cutscene Memory Archive as its own wing; **Rewards** — earned identity
items. The rank-up celebration (session-diffed `pollCollectionRankUps`) is unchanged. Same
drill-in pattern on desktop and portrait — no per-profile special casing.

**Completion score** (per category) = `Σ entry.tier / Σ entry.maxTier` — tier-weighted, so both
*discovery* and *mastery* raise it (0..1). Multi-tier categories (enemies/towers/heroes) reward
mastery; single-tier ones (bosses/cards/equipment/biomes/chests) are pure discovery.

**Rank** (from completion): `Unranked → Bronze → Silver → Gold → Platinum → Diamond → Ascendant`,
thresholds `[0, 0.001, 0.2, 0.4, 0.6, 0.8, 1.0]`. Bronze = first discovery; Ascendant = 100%
(fully discovered *and* mastered).

## The bonus model — one spec table, three channels

`CATEGORY_BONUS_SPECS` (the tunable) declares each category's bonuses; the live value scales linearly
with completion (0 at fresh → the listed max at 100%):

| Category | Run effect (→ `collectionBonusEffects`) | Economy (→ `collectionEconomyBonuses`) | Power wt |
|---|---|---|:--:|
| **Bestiary** (enemies) | +12% Biomass (`biomassMult`) | — | 0.03 |
| **Bosses** | — | +15% Boss Loot (loot points) | 0.03 |
| **Towers** | +8% Tower Damage (`towerDamageMult`) | +25% Tower XP | 0.03 |
| **Heroes** | — | +25% Hero XP | 0.03 |
| **Mutations** (cards) | — | — | 0.03 |
| **Armory** (equipment) | — | +1.0 Loot Quality tier | 0.03 |
| **Biomes** | — | +20% Campaign Rewards | 0.03 |
| **Caches** (chests) | — | — | 0 (cosmetic) |
| **Devotion** (logins) | — | — | 0 (identity — see DAILY-LOGIN.md; entries are lifetime-login milestones + the best-streak watermark, so the codex never regresses) |

- **Run effects** are `CardEffect[]` folded into a run like gear (`App.tsx` appends
  `meta.collectionRunEffects()`); Power-relevant fields also count toward Power via `effectsPower`.
- **Economy** levers are read in `meta.finishRun` (tower/hero mastery XP, loot points, campaign
  first-clear) and `lootBias` (loot quality). Neutral (`×1` / `+0`) on a fresh save.
- **Power** — a new `collection` `PowerPart`: `Π (1 + weight × completion)` over categories
  (exactly `1` on a fresh account → `POWER_BASE` preserved). Full completion ≈ **+23% Power**.

## Public API

- `collectionView(ctx): CollectionView` — categories (each with `completion`, `rank`, `bonuses`),
  overall `pct`/`completion`/`rank`/`power`.
- `collectionBonusEffects(v)` / `collectionEconomyBonuses(v)` / (view`.power`) — the three channels.
- `rankOf(c)`, `rankMilestones()` (track pips), `categoryBonusLines(id, c)` (UI chips).
- `collectionRankUps(v, prev)` / `rankSnapshot(v)` — celebration diffing.
- meta: `collection()`, `collectionRewards()`, `collectionRunEffects()`, `pollCollectionRankUps()`
  → `{ rankUps, powerGain }` (session-diffed; drives the Codex celebration + Power popup).

## Extension points

- **New content** → 0 files (entries auto-derive from the registry).
- **New category** → add to `CollectionCategoryId`, build its entries in `collectionView`, add a
  `CATEGORY_BONUS_SPECS` row (+ the context signal it derives from). Test asserts the id list.
- **Tune a bonus** → edit the one `CATEGORY_BONUS_SPECS` row (max value / power weight).
- **New rank** → extend `COLLECTION_RANKS` + `RANK_THRESHOLDS` + `RANK_COLORS` (kept index-aligned).
- New offense field in a bonus ⇒ add its Power weight (`power-coverage` validator enforces).

## Invariants & assumptions

- **Golden-safe**: every bonus-bearing category reads 0 on a fresh save → effects `[]`, economy
  neutral, Power `1`. (Only the wave-0 starter cache is auto-discovered; Caches carry no bonus, so
  they can't perturb runs or Power.)
- Biome discovery derives from campaign depth (`biomeForStage` bands); boss discovery from
  `save.bossesSlain` (chassis). No new tracking.

## Known limitations

- Rank-up celebration is **session-scoped** (baseline captured at load; not persisted) — deliberate,
  so it needs no save field and never retroactively fires for already-earned ranks.
- The Power-gain popup is hidden when the gain rounds to 0 (e.g. discovering 1 of 159 items) — it
  surfaces on meaningful jumps (category milestones).
- `accountPowerParts` recomputes `collectionView` per call; fine at menu/run-end cadence, not a
  per-frame path.
