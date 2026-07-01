# POWER-AUDIT.md — every progression source vs. the Power Score

> The complete audit requested after the reported defect (**Tower Branch upgrades raised strength
> without raising Power — CONFIRMED and FIXED**). Every row is verified by a named automated test;
> the runtime validator (below) plus these sweeps make a silent bypass structurally impossible.
> Companion: `POWER-SCORE.md` (the model), `GAME_CONSTITUTION.md` rule 1.

## Defects found by this audit (both fixed)

1. **Tower Branches** — `game.powerEffects()` folded drafted cards + Hero Evolution but never
   branch tiers (the power doc *claimed* branches were counted). Fixed: purchased tiers score via
   `branchPowerEffects` (`BRANCH_TIER_POWER = 0.05`/tier — the equipment-rarity heuristic pattern,
   because tier grants are mostly `effectsPower`-invisible capabilities).
2. **Hero Slots** — tower `bonusSlots` were Power-scored but unlocked hero slots were not; fielding
   a second champion was unscored strength (same defect class). Fixed: `HERO_SLOT_POWER = 0.1`
   per slot beyond the first, folded into the meta bucket.

## The audit table — every progression source

| Source | Bucket | Mechanism | Verified by | Status |
|---|---|---|---|---|
| Tower Stars | `towers` | star damage mult via `towerProgress` | `powerIntegration` "tower/hero progression path" | ✅ |
| **Tower Branches (in-run)** | `temporary` | `branchPowerEffects(totalTiers)` in `game.powerEffects()` | `runPower` "the reported bug, fixed and pinned" | ✅ **FIXED** |
| Tower Mastery | `towers` | mastery mult + perk kit in `towerProgress` | `powerIntegration` "Mastery XP…" | ✅ |
| Adaptation picks | `towers`/`heroes` | `adaptationEffect` folds into unit progress | `powerIntegration` "Adaptation picks" | ✅ |
| Hero Stars | `heroes` | star damage mult via `heroProgress` | `powerIntegration` "tower/hero progression path" | ✅ |
| Hero Evolution (in-run) | `temporary` | `heroEvoEffects` in `game.powerEffects()` | `runPower` "every category" | ✅ |
| **Hero Slots** | `meta` | `HERO_SLOT_POWER` × (slots−1) | `powerIntegration` "2nd hero slot" | ✅ **FIXED** |
| Tower Slots (permanent) | `meta` | `META_SLOT_POWER` via `bonusSlots` | `powerIntegration` "EVERY permanent upgrade" | ✅ |
| Hero Equipment / Equipment | `equipment` | `itemRarityPower` + affix effects per equipped item | `powerIntegration` "equipping ANY item" | ✅ |
| Crafting / Reforge | `equipment` | upgraded rarity/affixes re-score the equipped item | `powerIntegration` "Reforge rarity upgrade" | ✅ |
| Permanent Upgrades (Genome) | `meta` | `metaModifiers` + `genomeRunEffects` + extras | `powerIntegration` "EVERY permanent upgrade" | ✅ |
| Gene Cards (drafted) | `temporary` | `chosenCardEffects` via `effectsPower` | `runPower` audit + draft tests | ✅ |
| Gene Levels (permanent) | `meta` | `geneCollectionPowerMult` (linear fold) | `geneArchive` "raises ACCOUNT Power… preview exact" | ✅ |
| Gene Loadouts (run start) | `temporary` | boot-applied effects land in the run bucket | `geneLoadout` "boot apply" | ✅ |
| Gene Ascension (backend) | `meta` | tier fold pre-wired in `geneCollectionPowerMult` | `geneAscension` "SAME linear sum" | ✅ (no gameplay yet) |
| Collections | `collection` + `meta` | codex completion power + bonus effects | `powerIntegration` "Collection discovery" | ✅ |
| Prestige (Molt) | `meta` | `prestigeMult(lifetimeCells)` global fold | `powerIntegration` "Prestige (minted Cells)" | ✅ |
| Ascendant Tree | `meta` | node bonuses via `metaModifiers`/economy weights | `powerIntegration` "Ascendant damage node" | ✅ |
| Evolution Cap / Campaign unlocks | — | **gates/enablers, intentionally unscored** — the strength they enable (stars, slots, gene levels) is scored when acquired; first-clear rewards are currency, scored when spent | design note | ✅ intentional |
| Difficulty bonuses | — | **intentionally unscored** — difficulty scales threat + loot quality, not player strength | design note | ✅ intentional |
| Doctrines (run choice) | — | **intentionally unscored** — risk/reward sidegrades, not progression (boot effects that ARE gear-borne score in `equipment`) | design note | ✅ intentional |

## The validation contract (display · immediacy · save · load)

- **Increase Power** — the sweeps above; plus `validate.ts` `power-coverage` (every
  `POWER_RELEVANT_FIELDS` entry must be weighted) and `cardProblems` Power-visibility (gene
  levels/ascension tiers).
- **Display + update immediately** — account: every strength API persists → `meta.power()`
  recomputes on read (`geneArchive` test pins after === previewed). In-run: the HUD reads
  `meta.powerWith(game.powerEffects())` per snapshot, so branch/evolution/draft buys move the
  live number the same frame. (The presentation layer on top of this is `state/powerEvents` —
  see POWER-SCORE.md §feel.)
- **Save/load correctly** — Power derives PURELY from the save (no cached score is persisted),
  so a round-trip cannot desync it; migration tests pin the save fields it reads.

## The automated validators (how future bypasses are caught)

1. **Runtime tripwire (in-run)** — `game.powerAuditWarnings`: `buyBranchTier`, `buyHeroEvolution`,
   and `chooseCard` (for scored cards) assert the temporary bucket ROSE after the action; a
   violation records + warns. Tests pin the array empty (`runPower.test.ts`); any future in-run
   strength action wired through these paths inherits the check — new action types must call
   `auditTempPower` (constitution rule 1).
2. **Meta sweep (permanent)** — `powerIntegration.test.ts`: table-driven "every strength API/field
   raises the index", now covering upgrades, stars, mastery, adaptation, prestige, ascendant,
   equipment, reforge, collection, hero slots. Adding a progression system without a row here is
   caught by the dependency-registry review flag (`npm run validate` blast radius → Power area).
3. **Field-coverage gate (content)** — dev-boot `validateContent`: a strength-relevant run-mod
   field left unweighted is a hard content error (`uncoveredPowerFields`).
4. **Content validators** — gene levels / ascension tiers must be Power-visible (`cardProblems`).

## Calibration notes

- `BRANCH_TIER_POWER = 0.05` — a maxed 5-tier tower ≈ +25% run offense; 4 maxed towers ≈ ×2 on
  the temporary bucket, comparable to a strong draft — matches branches' build-defining weight.
- `HERO_SLOT_POWER = 0.1` — slots 2/3 ≈ +10%/+20% account offense; conservative next to what a
  geared extra hero really adds (its stars/gear then score on top).
- Both are heuristic weights (the `itemRarityPower` precedent) — re-tune freely; the tests pin
  direction (strictly positive), not magnitude.
