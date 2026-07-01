# GENE-EVOLUTION.md — permanent Gene Card progression

Gene Cards are becoming a permanent progression pillar (alongside Towers, Heroes, Equipment, Campaign,
Prestige): every card is a **permanent collectible** that can be leveled, rarity-upgraded, skinned, and
(eventually) ascended. This doc is the architecture of record. **Status: architecture landed (Task 1);
upgrade CONTENT + currency + UI land in Tasks 2–12.**

## Audit of the pre-existing system (what we built on)
- **Definition** — `CardDef { id, name, rarity, category, description, effects: CardEffect[] }` in
  `CARD_POOL` (45 cards) in `core/cards.ts`, registered in `cardRegistry`. `CardEffect` is a
  declarative union (`mul/add/flag/set/grant/hook/biomass/integrity/heroHp`). Fully data-driven.
- **Selection** — `draftCards(rng, count, wave)` rolls rarity (`rollCardRarity`) then picks from
  `cardRegistry.active()`; offered between waves; chosen via `Game.chooseCard(id)`.
- **Application** — `applyCard(def, ctx)` folds effects into the run's `RunModifiers` (run-only,
  reset each run). The only card interpreter.
- **Storage** — none per-card; only aggregate collection: `stats.uniqueCards` (distinct ids ever
  drafted) + `cardsSeen`/`cardsDrafted` counts.
- **Power** — a drafted card's effects feed the `temporary` Power bucket via `effectsPower`. Permanent
  cards contributed **nothing** (no permanent state existed).
- **UI** — `DraftModal` (draft), `BuildPanel` (this run's chosen cards). No collection/archive.

## New architecture

### Definition vs. permanent state (the split)
- **`CardDef`** stays the static, in-code, data-driven DEFINITION. It gains **optional** scaffolding —
  `maxLevel`, `upgrades: GeneUpgradeLevel[]`, `ascension: GeneAscension`, `skins`, `art`. All optional
  ⇒ a card with none behaves exactly as before (base-only). The `id` is the **permanent unique key**:
  never reuse or rename it.
- **`core/geneCards.ts`** owns the PERMANENT per-card player STATE and the pure seams:
  - `GeneCardSave { level, rarityTier?, ascension?, skin?, acquiredAt? }`, `GeneSave = Record<id, …>`
    — **sparse** (only non-default cards stored). Ownership stays in `stats.uniqueCards`.
  - `effectiveGeneEffects(def, level)` — base effects + authored upgrades up to `level`. **The seam
    the run reads.** No upgrades authored ⇒ returns base (golden-safe).
  - `genePermanentPowerMult(def, level)` — one card's PERMANENT power (upgrade deltas only; base is
    temporary). `geneCollectionPowerMult(genes)` — the whole library's contribution, **LINEAR**
    (`1 + scale·Σ(mult−1)`) so it can't explode at 500+ cards.
  - `sanitizeGeneSave(raw)` — drops unknown/renamed ids, clamps levels to each card's ceiling, keeps
    the map sparse. Anti-corruption + anti-manipulation.

### Save (v18, additive & migration-safe)
`SaveData.genes: GeneSave` (`CURRENT_VERSION = 18`). `withDefaults` fills `{}` for pre-v18 saves and
runs `sanitizeGeneSave`, so **old saves upgrade cleanly** and future field additions are additive.
Balance changes never corrupt saves: state is keyed by permanent id + clamped on load.

### Run integration (the seam)
`RunOptions.geneLevels` (from `meta.geneLevels()`) flows into the `Game`. `chooseCard` applies each
card via `effectiveGeneEffects(card, level)` — so once Task 4 authors upgrades, drafted cards
automatically apply at the player's level, with **zero** further plumbing. Empty levels ⇒ base ⇒ the
golden run is byte-identical.

### Power integration
Permanent gene upgrades are account strength → folded into the account `meta` Power bucket via
`geneCollectionPowerMult(save.genes)` (=1 today). Drafted cards' live effects still feed the run's
`temporary` bucket (now surfaced in the HUD via `game.powerEffects()`).

## Extension points (filled by later tasks)
- **Task 2/3** — Gene Essence currency (duplicate-shard conversion + container drops).
- **Task 4** — author `def.upgrades` (3–5 levels each) + `def.maxLevel`. Pure content; seams already read it.
- **Task 5/8** — Gene Archive UI + sorting/search over `cardRegistry` + `save.genes`.
- **Task 6** — campaign-gated level ceilings.
- **Task 7** — Starting Gene Loadouts (a `RunOptions.startingGenes` apply-at-boot seam).
- **Task 9** — tune `GENE_POWER_SCALE`; add a build-time coverage guard (no gene bypasses Power).
- **Task 10** — populate `def.ascension` (backend only).

## Economy — Gene Essence (Task 2)
`geneEssence` is the permanent Gene Card upgrade currency (`core/currencies.ts`, save field
`geneEssence`, teal droplet icon + tooltip, Help mechanic `gene-essence`).

**Duplicate conversion (primary source).** When a Bio-Container is opened (`meta.openContainer`), the
shards it grants are diffed against the pre-open save. For any **max-Star** tower (`STAR.maxTowerStars`
= 10) or **unlocked max-Star** hero (`STAR.maxStars` = 5), those excess shards can't buy more stars, so
they are **reverted from the shard total and converted to Gene Essence** instead — shown immediately on
the reveal as a `geneEssence` event pull with the reason (e.g. *"Duplicate Legendary Hero"*).

Formula: `essence = flooredShards × ESSENCE_PER_SHARD[containerRarity]` (`core/geneEssence.ts`):

| Rarity | common | uncommon | rare | epic | legendary | mythic |
|---|--:|--:|--:|--:|--:|--:|
| Essence / shard | 1 | 2 | 3 | 6 | 9 | 15 |

So 5 duplicate common shards → **+5** (matches spec); 5 duplicate legendary → **+45**. Locked heroes
never convert (their shards still go toward unlocking). The conversion (and the drop below) reads the
container's **true** rarity: a loot box IS its box rarity, a run cache reads its best pull, and the
cache ladder's `exotic` pays its own tier (12/shard — between legendary and mythic).

**Anti-exploit.** Conversion is driven by shards actually **granted at open time** (the pre/post diff),
not by re-reading star counts — so it can't be farmed by re-opening. Resets grant no shards ⇒ mint no
Essence. `sanitizeGeneSave` + a numeric clamp on load neutralize save manipulation.

### Container drop (Task 3) — the secondary source

Opening any Bio-Container also makes one small **bonus** Essence roll (`rollEssenceDrop`,
tunables in `ESSENCE_DROP`). Purely **additive** — it never replaces a guaranteed reward — and
revealed as an *"Essence Trace"* event pull. Stateless (no pity): it should surprise, not be
counted on.

**Drop table** (chance capped at 22%, amount at 9):

| Term | Chance | Amount |
|---|---|---|
| Base | 8% | 1–2 |
| + per container-rarity tier (common 0 … mythic/exotic 5) | +2%/tier | +0.6/tier (rounded) |
| + Campaign progress (slight) | +stage/500 | +stage/60 |
| + Power Score (slight) | +power/60,000 | +power/8,000 |

### Upgrade costs (the sink)

One canonical curve (`essenceUpgradeCost`, tunables in `ESSENCE_COST`): `base(cardRarity) ×
5^(level−1)` with bases common 25 / rare 45 / epic 80 / legendary 130. L1s are quick wins a fresh
account funds from drops alone; L4s are long-horizon chases (legendary L4 ≈ 16,250 — ~13 hours of
endgame income). Full-library sink (45 cards × ~4 levels) ≈ **351k Essence**.

### Long-horizon simulation (the audit)

Monte-Carlo over the real roll functions (`rollLoot`/`rollChest`/`essenceForDuplicates`/
`rollEssenceDrop`), seeded, at four account profiles. **Assumptions:** ~5 runs/hour banking ~4
containers each (3 loot boxes + 1 run cache) ⇒ ~20 containers/hour; box rarities from the loot-queue
weights; `maxedFrac` = the fraction of granted shards hitting max-Star (converting) units (0 → 1.0
as stars complete).

| Horizon | Essence/hr (duplicates) | Essence/hr (drop) | duplicate share | cumulative |
|---|--:|--:|--:|--:|
| 10 h (power 1.5k · C8 · nothing maxed) | 0 | ~7 | 0% | ~70 |
| 50 h (4k · C25 · ~⅓ maxed) | ~280 | ~13 | 96% | ~12k |
| 200 h (9k · C60 · ~85% maxed) | ~1,020 | ~19 | 98% | ~167k |
| 1,000 h (20k · C120 · all maxed) | ~1,210 | ~30 | 98% | ~1.16M |

**Reading:** early on the drop is the only trickle (first upgrade ≈ hour 3–4 — exciting, not
primary); once units max, duplicate conversion dominates (96–98%) exactly as specced. Against the
351k sink: at 50h you afford every L1 + a spread of L2s; at 200h ≈ half the library; the library
fully maxes around hour ~400, with the last legendary levels each a double-digit-hour chase — and
**Ascension (Task 10) is the designed sink beyond that**. Sim source: the Task 3 scratch script
(`essenceSim.ts`), re-runnable against these tunables.

## Invariants
- **Gameplay preserved / golden byte-identical** — every seam is a no-op with no authored upgrades.
- **Permanent id is sacred** — the save key. Renames = new card.
- **Data-driven** — a new card is one `CARD_POOL` row; new upgrades are data on the def; the UI/power/
  save all derive generically. Scales to hundreds of cards with no redesign.
