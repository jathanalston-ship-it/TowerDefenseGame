# MASTERY.md — Infinite Mastery as Experience (redesign)

Mastery stops being a hidden stat and becomes a **veteran trophy you display**. It is the
record of how much you have *lived with* a unit — expressed as titles, badges, visual
mutations, lore, and milestone perks — that scales **forever** without ever inflating
power. Aligns with `PROGRESSION.md §2.3` (log-infinite + milestone perks) and the
philosophy in `PROGRESSION-PHILOSOPHY.md §2.3–2.4`.

> Design + architecture only. No gameplay code yet.

---

## 1. The problem

Today mastery is `1 + 0.004·level` damage (`config.ts: MASTERY`, `meta.masteryLevel`),
banked from kills/damage/active-time. It is invisible, undisplayable, and — over thousands
of levels — a slow power-creep with nothing to *show*. Hero mastery is the same formula
again. Two systems, one stat-stick.

## 2. Principles

1. **Mastery represents experience, not power.** Its rewards are mostly **identity**:
   things you wear, show, read, and look at.
2. **Power stays gentle and logarithmic.** Keep `PROGRESSION §2.3`'s
   `M = 1 + 0.5·ln(1 + L/10)` — infinite but ever-slowing (+231% at L1,000 vs +311% at
   L5,000). The number is the background hum, never the reason to grind.
3. **Display over accumulate.** A maxed-mastery player should be able to *flex* — a title,
   a badge/border, an evolved unit look — not just hold a big private number.
4. **Infinite without runaway.** Authored rewards are sparse; beyond them, mastery falls
   back to **procedural ranks/titles** so it is endless without endless authoring, and the
   only thing that truly scales forever (the log power) is the thing least able to inflate.
5. **One engine, two vocabularies.** Tower and hero mastery share the XP curve (DRY) but
   reward **different identities** (craft vs. bond) so they never feel the same (§4).

## 3. The mastery reward stack

Four bands, escalating in rarity and prestige:

| Band | Cadence | Reward kind | Decision? |
|---|---|---|---|
| **Per level** | every level | tiny log power (the hum) + XP toward the next milestone | none |
| **Milestone** | every 25 | a **mechanic perk** *or* a **cosmetic** *or* a **lore page** (authored) | none (auto-unlock) |
| **Rank** | every 100 | a **Title + Badge/Border** + a **visual mutation** of the unit | display choice (equip it) |
| **Procedural** | beyond authored | generated rank titles ("Ascendant XII") + the continuing log hum | none |

Key rules:
- **Milestone perks are *mechanics*, not stats** (e.g. "ignore 10% armor", "+1 chain on
  overkill") — sparse, individually capped, so they cannot stack into inflation.
- **Most milestones are non-power** (cosmetic/lore) — power milestones are the minority.
- **Ranks are pure identity** — titles, badges, and the unit's evolving art. This is the
  flex layer, the reason to push a *main* to absurd mastery.
- **Visual mutations** reuse the cosmetic seam shared with star cosmetics (`TOWER-STARS.md
  §3`): the unit's carapace/glow evolves at rank thresholds — wholly cosmetic.

## 4. Tower mastery = craft · Hero mastery = bond

Same XP engine; deliberately different reward *vocabulary*, because they answer different
motivations (`PROGRESSION-PHILOSOPHY.md §2.3–2.4`):

| | **Tower Mastery** (craft / expertise) | **Hero Mastery** (bond / relationship) |
|---|---|---|
| Fantasy | "I have mastered this *tool*." | "I have a history with this *character*." |
| Titles | class-flex: "Kinetic Virtuoso", "Plaguelord" | character-tied: "Shepherd's Chosen", "Overseer's Hand" |
| Cosmetics | tower visual mutations (carapace/glow) | hero **skins / voice flavor / portraits** |
| Lore | tactical codex: the tower's biology & role | **character backstory** unlocked chapter by chapter |
| Perks | tactical (armor pen, reaction tweaks) | hero-identity-themed (Shepherd: guard radius; Overseer: control) |
| Worn where | on the unit + roster screen | on the **player profile** (it's your main) |

Because only one hero is fielded per run, hero mastery **concentrates on your main** — it
is the "main character" track, which is why its rewards are the most personal/narrative.
Tower mastery spreads across the roster as craft.

## 5. Architecture

### 5.1 Data: a mastery track + reward table

```ts
// proposed — NOT wired
type MasteryRewardKind = 'perk' | 'title' | 'badge' | 'visual' | 'lore' | 'cosmetic';

interface MasteryReward {
  at: number;                 // level threshold (e.g. 25, 50, 100)
  kind: MasteryRewardKind;
  id: string;                 // → cosmeticRegistry / titleRegistry / loreRegistry / masteryPerkRegistry
}
interface MasteryTrack {
  subject: 'tower' | 'hero';
  unit?: string;              // per-unit rewards (omit for shared/class-wide)
  rewards: MasteryReward[];   // sparse, authored
  // power stays the shared log curve; tracks don't redefine it
}
export const masteryTrackRegistry = new Registry<MasteryTrack>('masteryTrack', { idOf: t => `${t.subject}:${t.unit ?? '*'}` });
```

### 5.2 New identity registries (the homes for non-power rewards)

`cosmeticRegistry` (visual mutations / skins), `titleRegistry` (worn titles),
`loreRegistry` (codex pages), `masteryPerkRegistry` (the sparse mechanic perks). These are
the `PROGRESSION-PHILOSOPHY.md §3D` infrastructure; star cosmetics share `cosmeticRegistry`.

### 5.3 Save additions (additive, migration-safe like the v4 loot queue)

```ts
// proposed additions to SaveData
unlockedCosmetics: string[];
unlockedTitles: string[];
equippedTitle: string | null;
unlockedLore: string[];
// (existing) towerMasteryXp / heroMasteryXp stay as the source of truth
```

`withDefaults` fills them for old saves (empty); no behavior change. Bump schema like v4→v5.

### 5.4 Pure resolution (testable, deterministic)

```ts
// proposed
function masteryRewardsUpTo(track: MasteryTrack, level: number): MasteryReward[];  // authored unlocks ≤ level
function masteryRankTitle(level: number): string;                                  // procedural fallback ("Ascendant XII")
```

`meta.finishRun` already computes the level delta per unit; on a milestone/rank crossing it
unlocks the corresponding rewards into the save (one persist) and surfaces them in
`RunOutcome` for a celebratory Results beat (reuse the reveal/toast pattern).

### 5.5 Display surfaces

- **Profile header:** equipped Title + highest Mastery Rank badge (the flex).
- **Roster / unit cards:** per-unit mastery rank, badge, and the evolved visual.
- **Codex screen:** unlocked lore pages (tower biology, hero backstory).
- **Results:** "Mastery Rank up! — *Plaguelord*" milestone moment.

## 6. Preserving infinity without power creep

- **Authored content is finite; mastery is not.** Past the last authored milestone, ranks
  keep coming via `masteryRankTitle` (procedural) + the log hum. Endless, cheap to author.
- **The only forever-scaling *power* is the log M** — mathematically incapable of bloating
  (`PROGRESSION §1.3`). Everything else mastery grants is identity (zero power) or sparse
  capped perks.
- **Prestige interaction (future):** mastery *levels* may reset under Hivemind prestige, but
  **unlocked titles/badges/lore/visuals persist** — the trophy survives, the grind
  re-ramps fast under multipliers (`PROGRESSION §2.3`). This makes mastery the permanent
  identity record even across rebirths.

## 7. Why this still differs from Stars

Stars: *choice-spent, big mechanics, decision-heavy, finite-ish path.* Mastery: *play-earned,
ambient, decision-light, infinite, identity-first.* A star is "I bought a new ability"; a
mastery rank is "I have earned the right to wear this." Different verbs, different feelings —
they pass the §1 differentiation test in `PROGRESSION-PHILOSOPHY.md`.

## 8. Build order (when implementation starts)
1. Identity registries (`cosmetic/title/lore/masteryPerk`) + save fields + migration.
2. `MasteryTrack` data + `masteryRewardsUpTo` / `masteryRankTitle` (pure, unit-tested).
3. Wire unlock-on-milestone into `meta.finishRun`; surface in `RunOutcome`/Results.
4. Display surfaces (profile title/badge, codex, unit visuals).
5. Author launch units' sparse milestone tables; keep power on the shared log curve.
   Verify golden byte-identical (mastery rewards are meta/identity, never sim power beyond
   the existing log).

## 9. Implementation status (shipped)

- **Titles + lore + procedural ranks** — `mastery.ts` (data + queries), unlocked in
  `meta.finishRun`, worn/read via the Mastery Profile + Codex, celebrated on Results.
- **Milestone PERKS (mechanics)** — `MasteryPerk` folds a sparse mechanic into the tower's
  run kit at a level (Mastery 50: Needle/Parasite pierce, Mortar +splash) via
  `meta.towerProgress`. Golden-safe (fresh unit crosses none).
- **Visual mutations (in-game)** — towers render a veteran **mastery-rank halo**
  (`renderer.ts drawTower`, fed by `GameView` from each kind's `masteryRank`); pure
  cosmetic, tier 0 renders identically. Tower=craft / hero=bond reward split is in the data.
- **Deferred:** dedicated skin/cosmetic *items* and hero-side visual skins (the halo covers
  towers); those are additional `cosmeticRegistry` data on the same seam.
