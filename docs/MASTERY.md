# MASTERY.md — Infinite Mastery as Experience (redesign)

Mastery stops being a hidden stat and becomes a **veteran trophy you display**. It is the
record of how much you have *lived with* a unit — expressed as titles, badges, visual
mutations, lore, and milestone perks — that scales **forever** without ever inflating
power. Aligns with `PROGRESSION.md §2.3` (log-infinite + milestone perks) and the
philosophy in `PROGRESSION-PHILOSOPHY.md §2.3–2.4`.

> **Status: PARTIAL.** The mastery track itself is built (per-tower/per-hero XP from use → levels +
> ranks + the flat `1 + MASTERY.damagePerLevel·level` multiplier, plus rank perks). The **spendable
> layer this doc's "experience, not a stat" thesis wants is now shipped as ADAPTATION** (`core/
> adaptation.ts`, **docs/ADAPTATION.md**): mastery Ranks (plus capped campaign/container/achievement
> sources) mint Antigen spent into PER-TOWER four-branch trees with exclusive forks, campaign-gated
> depth and battlefield FORM stages — the infinite grind buys *decisions*, not just a bigger number.
> The title/badge/visual-mutation trophy surface described below remains largely PLANNED.

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
- **Visual mutations (in-game)** — both towers (`drawTower`) and the fielded hero
  (`drawHero`) render a veteran **mastery-rank halo** (rings + orbiting rank pips), fed by
  `GameView` from each kind's `masteryRank` (one tier map covers tower + hero kinds). Pure
  cosmetic, tier 0 renders identically. Tower=craft / hero=bond reward split is in the data.
- **Deferred:** dedicated skin/cosmetic *items* (distinct silhouettes/foils) — additional
  `cosmeticRegistry` data on the same seam, not new architecture.


---

## 9. The LIVE mastery experience (2026-07 overhaul — implemented)

Mastery stopped being a run-end surprise: the player now WATCHES the craft grow. Everything
below is presentation over the unchanged economy — the XP formula and banking are identical.

### 9.1 One formula, two consumers (zero drift by construction)

- `masteryXpRaw(counts)` (src/state/meta.ts) — kills·xpPerKill + damage·xpPerDamage +
  activeTime·xpPerActiveSecond. THE signal formula.
- `masteryXpMults(save, mode, difficulty)` — the run-constant multiplier product
  (mode reward × difficulty XP × ascendant × collection codex).
- `meta.finishRun` banks `round(raw × mult)`; GameView's run loop projects the SAME
  expression from `game.getMasteryAccrual()` every HUD tick. The number the player watches
  is byte-equal to the number that banks.

### 9.2 In-run surfaces

- **Inspector craft bar** (select any placed tower): projected level, smoothly-filling
  progress bar, "+N XP this run", floating `+N XP` ticks as the organism earns, permanent
  bonus, lifetime kills/damage, next unlock, and the tower's Power contribution.
- **Level-up celebration** (never pauses): MasteryToaster (state/masteryEvents.ts bus →
  ui/components/MasteryToaster.tsx) shows tower · new level · permanent bonus · the Power
  the level banks (real preview model); the `mastery` craft chime plays (`rankup` fanfare
  on rank boundaries); a ring blooms from every deployed unit of the kind on the
  battlefield (GameView presentation layer — never sim state); a small trauma pulse lands
  the moment. Reduced-motion & tutorial-safe.

### 9.3 Account surfaces

- **Tower Lab ledger** (towerLabModel.masteryPanelModel): rank, level, XP bar, lifetime
  kills / damage / deployments / best wave (LifetimeStats per-tower ledgers, schema v20),
  permanent bonus, Power contribution, next unlock (`nextMasteryUnlock` — reward, perk, or
  the always-present next procedural rank), milestone chips.
- **End of Run**: the Progression category's mastery ledger — per-tower kills/damage,
  +XP, level movement, bonus + Power earned on level-ups, lifetime standing; the run's
  top contributor wears the ✦ crown.
- **Evolution Codex** shows level + rank; **Mastery Profile** holds titles + lore;
  **Help → Tower Mastery** (mechanics registry `tower-mastery`) teaches the loop.

### 9.4 Future-support seams (already load-bearing)

- **Prestige interactions**: `masteryXpMults` already folds ascendant bonuses; new prestige
  effects join there and every surface follows automatically.
- **Achievements / milestones / badges / titles / cosmetics / seasonal bonuses**: the
  mastery track registry (rewards + perks) + `masteryRewardsBetween` (run-end unlock set) +
  `onMasteryLevelUp` (live bus) are the three hook points — a seasonal system can subscribe
  to the bus or append track rewards without touching the loop.
- Hero mastery ("bond") rides the same engine; the live projection currently surfaces
  towers (the craft loop); wiring heroes into the same bus is a data change, not a design.

### 9.5 Validation

- Save: v19→v20 zero-fill migration + accumulation tests (state/stats.test.ts).
- Power: mastery XP scores through the permanent bucket (state/powerIntegration.test.ts);
  the level-up toast derives its Power line from `meta.previewPower` — preview === outcome.
- Suite: golden sim untouched (projection reads accrual; celebrations are DOM/canvas
  presentation).

---

## 10. EVOLUTION TRACKS (2026-07 — the claimable second layer; shipped)

Every tower and hero owns a **100-level reward helix** that renews forever through prestige —
"a second Battle Pass dedicated to each unit," except it is NOT a pass: no season, no timer,
no premium lane, and visually a DNA genome, not a card row. Mastery LEVELS are untouched — the
same accrual (§9.1), the same log power hum, the same rank titles and Antigen minting. The
track is a parallel CLAIMABLE layer keyed off the XP the player was already earning.

### 10.1 Architecture (all pure, all procedural)

- `core/masteryEvolution.ts` — THE generator. `masteryEvolutionTrack(subject, unit, prestige)`
  returns the loop's node list from a djb2-seeded xorshift stream: nodes every 2–5 levels
  (per-decade authored shapes, never a metronome), majors exactly on the 10s, containers every
  3rd major (tier 1→2→3), the level-100 crown always carries a container. **Zero authoring per
  unit** — a future tower/hero gets a full track from its def alone (`unlockShards` sets its
  scarcity band). `masteryEvolutionProblems` is the content guardrail, swept across every unit
  × prestiges 0..3 in tests.
- **Prestige 1 pays the unit's OWN shards**: `p1ShardBudget` = 3.5–5 star-upgrades' worth on
  the REAL ladder (towerStarCost/heroStarCost), banded by scarcity — starters get the fat end
  in bigger piles, deep unlocks the lean end in richer chunks. Majors carry 70%
  (`majorShardShare`), ascending weights 1..10 — the climb pays deeper by design (the sim's
  value-vs-reachability table below; `majorShardShare` is the softening lever if ever needed).
- **Prestige 2+ NEVER pays unit shards again** (no infinite shard farm — validator-enforced):
  the pool swaps to alternate progression (Genome Cores, Gene Essence, scrap/mutagen/catalyst,
  Bio Containers, rare small Ichor — never in P1, ≤4/loop) and grows +12%/loop (capped ×2).
- `state/meta.ts` — `claimMasteryEvolution` (claim-all through the REAL lanes in one atomic
  persist; guarded `mastery.claim`), `prestigeMasteryEvolution` (auto-claims first, stamps the
  XP watermark; guarded `mastery.prestige`). Save: `masteryEvolution` sparse map (v44) +
  `xpAt` watermark (v45); `{}` default — nothing retroactive.
- UI: `ui/EvolutionTrack.tsx` (the helix panel in both labs — SVG double helix in the unit's
  color, minors as vertebrae on the strands, majors as crossover ganglia on the 10s, the
  assimilated span recolored, a pulsing read-head, claim-on-node-tap, EVOLVE at the crown) +
  `ui/evolutionTrackModel.ts` (pure view model + roster badges/sort signal).
- Integration: Power (`masteryEvolutionPowerMult` — +0.5%/loop into the meta bucket, cap
  +60%), collection codex `masteryEvolution` (chronicle-only, powerWeight 0 — no double lane),
  achievements (first loop / 5 loops / hidden P4), notification channels
  `evolution.towers`/`evolution.heroes`, Mission Control standings card, Profile loops row,
  help mechanic `mastery-evolution`, own audio voice (`evoClaim`/`evoMilestone`/`evoPrestige`).

### 10.2 §pacing — XP-metered loops (the sims' verdict)

The mastery requirement curve is geometric (×1.12/level), so LEVEL-windowed loops would cost
×83,522 more XP per loop — prestige would die at its first turn. Loops are therefore
**XP-metered** (v45): loop 1 is EXACTLY mastery levels 1..100 (`BASE_LOOP_XP` ≈ 69.6M XP —
helix and mastery bar agree level-for-level, pinned by a 100-step parity test); every later
loop meters the same ladder × `loopEffortGrowth` (+25%/loop) from the `xpAt` watermark stamped
on EVOLVE. Mastery level itself never re-windows.

From `scripts/sim-mastery-evolution.ts` (re-run after any MASTERY/MASTERY_EVOLUTION change):

| Loop | XP | Casual 12k/h | Regular 40k/h | Grinder 150k/h | Whale 500k/h |
|---|---|---|---|---|---|
| 1 | 69.6M | 5.8k h | 1.7k h | 464 h | 139 h |
| 2 | 87.0M | 7.3k h | 2.2k h | 580 h | 174 h |
| 4 | 135.9M | 11.3k h | 3.4k h | 906 h | 272 h |
| 7 | 265.5M | 22.1k h | 6.6k h | 1.8k h | 531 h |

- P1 value spread (needle): 34% of the shard budget lands by level 50 (~20 casual hours on a
  favorite unit); the deep tail is the grinder's horizon — authored ascent, not an accident.
- Alt income at grinder pace: ≤1.5 Genome Cores/h, ≤0.6 Essence/h, Ichor ≈0.005/h — every
  lane far below its direct faucet. The loop enriches; it never replaces.
- Power hum: 26 total loops → ×1.13 meta; the ×1.6 cap needs 200 (deliberately distant).

### 10.3 Extensibility contract

No future gameplay content requires new Mastery code: a new unit inherits accrual (§9),
a full Evolution Track (10.1), labs UI, badges, codex entries, and the Power hum purely from
its def + the shared tunables in `MASTERY_EVOLUTION`. New GRANT kinds extend the
`EvolutionGrant` union + `meta.applyEvolutionGrant` — every profile and validator keeps
working. Track shape/economy changes are config edits (`DECADE_SHAPES`, shares, growths).
