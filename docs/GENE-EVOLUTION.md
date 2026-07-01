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

## Invariants
- **Gameplay preserved / golden byte-identical** — every seam is a no-op with no authored upgrades.
- **Permanent id is sacred** — the save key. Renames = new card.
- **Data-driven** — a new card is one `CARD_POOL` row; new upgrades are data on the def; the UI/power/
  save all derive generically. Scales to hundreds of cards with no redesign.
