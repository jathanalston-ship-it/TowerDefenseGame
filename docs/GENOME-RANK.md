# GENOME-RANK.md — the ultimate account mastery ladder

> System: `genome-rank` · Code: `src/core/genomeRank.ts` (pure) + `src/state/meta.ts`
> (snapshot/promotions) · UI: `src/ui/components/GenomeRankPanel.tsx` · Tests:
> `src/core/genomeRank.test.ts`, `src/dev/progressionSim.test.ts` (pacing/dominance guards).

**Not another XP bar.** A hidden **Genome Rating** is procedurally computed from weighted
contributions of *every major system*; the player sees prestigious **Ranks**: ten named tiers
(I Dormant, II Emergent, III Adaptive, IV Mutating, V Parasitic, VI Hiveborn, VII Dominant,
VIII Genome Ascendant, IX Perfect Organism, X Living Catastrophe), then **XI+ forever**
(Roman numerals + deterministic procedural names). The Account Level measures *dedication*;
the Genome Rank measures **breadth** — how much of the whole organism the player has grown.

## Design contracts (machine-enforced)

| Contract | Enforced by |
|---|---|
| Rating is a PURE function of a plain-number snapshot; never stored | `genomeRank.test.ts` + derived-only meta view |
| Monotonic in every axis — progress can never lower the rank | §rating tests |
| No source dominates: static weight cap 12% + live-account share ≤ 35% | §rating tests + sim guard |
| Ladder infinite; boundaries exact; names deterministic beyond X | §ladder tests |
| Ratio axes ride LIVE content registries (new content deepens the ladder) | `meta.genomeSnapshot` |
| Promotions celebrated + paid exactly once (crash-safe watermark) | meta test §promotions |
| 30h optimal persona lands mid-ladder (IV–VI); ladder climbs every band | `progressionSim.test.ts` |

## Architecture

- **`GENOME_SOURCES`** (core, DATA): 20 rows — id, category (`journey/strength/arsenal/
  identity`), weight, nav, `score(snapshot)`, advisor hint. Completion axes score
  `ratio × 10` (clamped); depth axes decelerate forever (`v^exp / div`).
  `genomeRating = Σ weight·score / 10`.
- **`GenomeSnapshot`** (plain numbers) is built by `meta.genomeSnapshot()`: depth axes from the
  save (account level, stage, wave, rush, dailies, molts, power, mastery levels, ichor, titles);
  ratio axes against live registries (TOWER/HERO_ORDER, cardRegistry, ALL_ITEMS,
  cosmeticRegistry + WARDROBE_ITEMS, ACHIEVEMENTS, PASS_PASSIVES, collectionView completion).
- **Ranks**: `GENOME_RANKS` thresholds (0/90/260/520/880/1340/1950/2750/3800/5200), then
  `BEYOND_STEP = 1600` per rank forever. `rankFromRating` → {index, name, numeral, into, need}.
- **Promotions**: `save.genomeRank.celebrated` is the only stored piece.
  `meta.pollGenomePromotions()` (called in `finishRun` + by the drain) grants each crossed
  rank's one-time reward — `genomeRankReward(i)`: cores `120·i^1.3`, ichor from IV, rich/prime
  container from III/V, always the rank **title** (`grank_<i>`, resolves via `titleName()`)
  — persists the watermark WITH the rewards, queues the cinematic.
- **Advisor**: `genomeAdvice` derives "easiest remaining rating" from the same table —
  completion axes offer everything they're missing; depth axes offer a 5-step marginal chunk.

## Presentation

Profile: `GenomeRankPanel` — emblem (numeral + name), rating bar to next rank, top-6
contribution bars (category-colored), Advisor buttons routing to each source's nav.
Promotion: `GenomePromotionCinematic` (App, menu only) — full-screen ceremony on the
evo-unlock frame, dedicated `promotion` audio cue, one rank at a time. Leaderboard mode
`genomeRating` (score = rating, wave = rank index) on the Profile standings tabs.

## Future systems auto-integrate

One `GENOME_SOURCES` row (weight/category/measure/hint) + one `GenomeSnapshot` field in
`meta.genomeSnapshot()`. Nothing else: the rating, breakdown, advisor, dominance guards and
UI bars all derive from the table.

## Calibration (2026-07, pinned persona sim)

30h optimal account → rating ≈ 1036 → **Rank V Parasitic**; top source (campaign) 17 % share;
bands rise 5h/15h/30h. First session reaches II; X is a completionist's long horizon; XI+ is
endless-depth territory. Recalibrate thresholds/weights via `npm run sim:report` — they are
data, one table + one array.

## Known limitations

- Rewards are prestige-leaning by design (cores/ichor/containers/titles) — **no gameplay
  passives**, so the ladder can never be pay-to-win or golden-unsafe.
- `meta.genomeSnapshot()` recomputes collection + power on demand (~ms); it runs on profile
  render, settles, and promotion polls — not per frame.
- Rank-gated profile FRAMES are a deferred nicety; titles carry the identity today.
