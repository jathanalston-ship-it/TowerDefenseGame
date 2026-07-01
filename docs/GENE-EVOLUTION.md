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

### Power integration (audited + calibrated, Task 9)
Permanent gene upgrades are account strength → folded into the account `meta` Power bucket via
`geneCollectionPowerMult(save.genes)`. **Calibration:** `GENE_POWER_SCALE = 0.15` — the library's
per-card deltas sum to ≈8.4 fully maxed, so a completed library reads ≈**×2.26** on the meta bucket
(a major pillar, comparable to stars/prestige; a mid-game third ≈×1.4). Linear aggregation keeps it
sane at 500+ cards; re-measure the sum when the library grows (the test pins the ×2–2.6 band).

**Every improvement moves Power immediately** — `meta.upgradeGene` persists → the account score
recomputes; the Archive's upgrade preview ("Power N → M, +Δ") is computed with the REAL model
(`meta.previewPower`), so preview and outcome are identical (test-pinned). Surfaces audited: the
Archive (per-card contribution + upgrade preview), run boot (starting genes land in the temporary
bucket at once), the live HUD Power (`game.powerEffects()`), and saves (sanitized levels only).

**Bypass prevention:** `cardProblems` validates — at dev boot, for every card — that EVERY authored
level is Power-visible (`effectsPower(level.effects) > 1`); an unscored level (pure grant/hook/
instant with no weighted rider) is a validation ERROR, so future gene content cannot ship outside
the Power model. This stacks on the engine-wide `POWER_RELEVANT_FIELDS` coverage guarantee.

### Ascension backend (Task 10 — architecture only, NO gameplay)
Card Ascension is **not implemented as gameplay**: no tiers are authored, no grant path exists, and
`sanitizeGeneSave` clamps a save's `ascension` to the card's authored ceiling (0 today) — so no
player state can reach tier > 0. What IS in place is the complete backend, so shipping Ascension
later is content + one gameplay wire, not a refactor:

- **Data** — `CardDef.ascension: GeneAscension { maxTier, tiers[{ rarity?, art?, effects?, note? }] }`
  (future rarity + ascended artwork/stats/effects per tier) and `CardDef.skins` (cosmetics).
  Player state: `GeneCardSave.ascension` / `.rarityTier` / `.skin` — saved, sanitized, sparse.
- **Effects seam** — `effectiveGeneEffects(def, level, ascension)`: authored tier effects fold in
  after upgrade levels, clamped to the authored count. Third argument defaults to 0 ⇒ every current
  caller is untouched (golden-safe).
- **Power** — `geneAscensionPowerMult(def, tier)`; `geneCollectionPowerMult` already folds it into
  the SAME linear sum as levels, so the moment a tier becomes reachable it moves the account Power
  Score with **no extra wiring** (Ascension can never silently bypass Power).
- **Rarity / artwork resolution (future UI)** — `geneEffectiveRarity(def, state)` (base →
  `rarityTier` steps up `CARD_RARITY_LADDER` → ascended-rarity override, clamped at legendary) and
  `geneArtKey(def, state)` (equipped skin → deepest ascended art at the tier → base art →
  procedural fallback).
- **Save compatibility** — the sanitizer clamps `ascension`/`rarityTier` to what content authors
  (like `level`), so balance changes and save manipulation can't fabricate progression.
- **Validation (future balancing)** — `cardProblems` validates any authored ascension block at dev
  boot: `tiers.length === maxTier`, every tier has valid, Power-visible, non-boot-only effects, and
  never downgrades rarity. Bad future content fails loud before it ships.
- **The one gameplay wire left** (deliberately unwired): pass the saved tier as the third argument
  of `effectiveGeneEffects` at the run seams (`chooseCard`, starting-gene boot) when Ascension
  ships. Leaving it unwired keeps "no gameplay yet" true by construction — and the omission is
  loud (testers see no in-run effect), whereas a missed Power wire would be silent, which is why
  Power is wired now. Test-pinned in `core/geneAscension.test.ts`.

## Extension points (filled by later tasks)
- **Task 2/3** — Gene Essence currency (duplicate-shard conversion + container drops).
- **Task 4** — author `def.upgrades` (3–5 levels each) + `def.maxLevel`. Pure content; seams already read it.
- **Task 5/8** — Gene Archive UI + sorting/search over `cardRegistry` + `save.genes`.
- **Task 6** — campaign-gated level ceilings.
- **Task 7** — Starting Gene Loadouts (a `RunOptions.startingGenes` apply-at-boot seam).
- **Task 9** — tune `GENE_POWER_SCALE`; add a build-time coverage guard (no gene bypasses Power).
- **Task 10** — ✅ backend complete (see §Ascension backend); authoring `def.ascension` tiers is the
  future content step.
- **Task 12** — ✅ final audit + 100/250/500-card stress test + closing report:
  **`GENE-AUDIT-REPORT.md`** (the system is a permanent core progression pillar).

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

## Starting Gene Loadouts (Task 7)

Players equip Gene Cards that **auto-activate when every run begins** — applied at boot through the
exact same path as a mid-run draft (base + permanent levels, live verb collection, the run's card
list), so they appear in the Build panel and the **live run Power immediately**. A brief cinematic
splash ("⌬ STARTING GENES ACTIVE") names the activated genes at run start.

- **Slots:** one free; up to five. Each further slot is **dual-gated** — Campaign progression AND
  Genome Cores (`GENE_LOADOUT_SLOTS`): slot 2 = Stage 10 + 300 ⬢ · slot 3 = Stage 25 + 900 ·
  slot 4 = Stage 45 + 2,000 · slot 5 = Stage 70 + 4,500. Locked slots always DISPLAY both
  requirements; an Unlock button appears once both are met.
- **Rules:** only OWNED (drafted-at-least-once) cards equip; a card occupies at most ONE slot (no
  duplicates — enforced in `meta.setGeneSlot` and by `sanitizeGeneLoadout` on load); slots
  rearrange via click-to-swap.
- **Save (v19):** `geneSlots` (1–5) + `geneLoadout` (five entries, sparse). Sanitizers drop junk
  ids/duplicates; pre-v19 saves default to one empty slot.
- **Run seam:** `RunOptions.startingGenes` (from `meta.startingGenes()` — equipped ∧ owned ∧
  unlocked-slot). Empty ⇒ nothing applied ⇒ the golden run is byte-identical.

## Upgrade content (Task 4) — every card, 3–5 levels

Authored in `core/geneUpgrades.ts` and folded onto each `CardDef` (`upgrades` + `maxLevel`) before
registration, so every seam reads them generically. **Authoring rules** (enforced by `cardProblems`
+ `geneUpgrades.test`): every card has 3–5 levels (commons 3, rares 4, epics 4–5, legendaries 5 —
matching the cost-curve depth); every level is **Power-visible** (permanent power strictly rises per
level); levels **evolve** the card — capstones add a rule (pierce grants, on-kill hooks, keystones,
hero verbs), mid levels sharpen identity, and every track touches ≥2 distinct knobs; **no boot-only
fields** (`startBiomassBonus`/`integrityMult`/`heroMaxHpMult`) — a card can be drafted mid-run, where
those are already consumed. "Total cost" = Essence to max; "Max power" = the card's permanent
Power-multiplier contribution fully maxed (linear-aggregated across the library, so a full maxed
collection stays sane). This table is GENERATED from the data (the `note` strings are the canonical
per-level documentation).

| Card | Rarity | Lvls | Total cost | Max power | Per-level notes |
|---|---|--:|--:|--:|---|
| Sharpened Needles | common | 3 | 775 | +24% | L1: Honed edges — +6% tower damage. · L2: Needles punch THROUGH — all tower shots pierce +1 enemy. · L3: Splintering tips — +2 max Fracture stacks, +5% damage. |
| Rapid Glands | common | 3 | 775 | +26% | L1: Quickened glands — +6% tower fire rate. · L2: The hero metabolizes it too — +10% hero attack speed. · L3: Overdrive secretion — +8% tower fire rate. |
| Fertile Decay | common | 3 | 775 | +7% | L1: Richer rot — +8% biomass from kills. · L2: Corpses drip — +1 biomass on EVERY kill. · L3: Total decomposition — +10% biomass from kills. |
| Biomass Surge | common | 3 | 775 | +3% | L1: +60 more biomass now; the surge lingers (+3% income). · L2: The surge feeds the walls too — +60 biomass, +15 Integrity, +3% sell refund. · L3: A flood — +120 more biomass now, +4% income. |
| Thick Marrow | common | 3 | 775 | +2% | L1: +20 more Integrity; marrow feeds the economy (+3% biomass). · L2: Marrow knits — +4 Integrity regrown every cleared wave. · L3: Dense cores — +30 more Integrity. |
| Twin Fang | common | 3 | 775 | +17% | L1: Serrated fangs — +1 max Fracture stack. · L2: Fangs bite THROUGH — shots pierce +1 enemy. · L3: TRIPLE fang — the Needle Spitter fires yet another needle. |
| Battle Stims | common | 3 | 775 | +5% | L1: +30 more hero HP; stims aid recovery (+5% healing received). · L2: Regenerative cocktail — +15% healing received. · L3: Battle-hardened — +60 hero HP and 3% contact damage shrugged off. |
| Toxic Coating | common | 3 | 775 | +16% | L1: Thicker venom — +8% Infection damage. · L2: The hero's claws drip — hero hits apply Corrosion. · L3: Compound toxins — +12% Corrosion and +8% Infection damage. |
| Caustic Edge | common | 3 | 775 | +9% | L1: Sharper acid — Corrosion slows +4% more and ticks +5% harder. · L2: The acid clings — pools last +15% longer. · L3: Deep burn — Corrosion slows +6% more. |
| Numbing Field | common | 3 | 775 | +3% | L1: Wider numbness — Disruption slows +4% more. · L2: Numbed flesh splits — Disrupted enemies take +5% more damage. · L3: Paralytic field — Disruption slows +6% more. |
| Disorient | common | 3 | 775 | +4% | L1: Deeper confusion — +4% damage taken while Disrupted. · L2: Staggered gait — Disruption also slows +5% more. · L3: Total disorientation — +6% damage taken while Disrupted. |
| Thick Hide | common | 3 | 775 | +5% | L1: +40 more hero HP; the hide toughens (2% damage shrugged). · L2: Hardened hide — 6% of contact damage shrugged off. · L3: Barbed hide — +80 HP and attackers take 5% of their damage back. |
| Combat Stims | common | 3 | 775 | +7% | L1: Refined dose — a further −4% ability cooldown. · L2: Abilities bloom wider — +8% ability radius. · L3: Constant drip — a further −6% ability cooldown. |
| Fleet Step | common | 3 | 775 | +5% | L1: Lighter stride — +6% hero move speed. · L2: Hunts wider — +15% hero engagement range. · L3: Momentum kills — +8% speed and +3% crit chance. |
| Fracture Point | common | 3 | 775 | +17% | L1: Finer cracks — +1 max Fracture stack. · L2: The hero's blows crack chitin — hero hits apply Fracture. · L3: Structural failure — +2 max Fracture stacks. |
| Bonemeal | common | 3 | 775 | +3% | L1: +50 more biomass now, +3% income. · L2: Waste not — +5% tower sell refund. · L3: Ground to dust — +100 more biomass now. |
| Hardened Carapace | common | 3 | 775 | +3% | L1: +30 more Integrity; chitin reclaimed from every demolition (+3% sell refund). · L2: Living armor — +4 Integrity regrown every cleared wave. · L3: Fortress plating — +40 more Integrity. |
| Engorged Reactor | common | 3 | 775 | +5% | L1: Swollen chambers — +0.05 reactor overcharge. · L2: Reactors seep — +15% reactor biomass. · L3: Critical mass — +0.10 reactor overcharge. |
| Caustic Catalyst | rare | 4 | 7,020 | +32% | L1: Hotter reagent — Corrosion pools tick +15% harder. · L2: Cracks run deeper — +2 max Fracture stacks. · L3: Stabilized catalyst — pools last +20% longer. · L4: SHRED echoes — status reactions re-fire once more. |
| Volatile Marrow | rare | 4 | 7,020 | +29% | L1: Wider burst — +10% splash radius. · L2: Denser marrow — +6% tower damage. · L3: Shrapnel carries THROUGH — shots pierce +1 enemy. · L4: Chain detonation — +15% splash radius, +6% damage. |
| Fracture Cascade | rare | 4 | 7,020 | +28% | L1: Deeper fault lines — +1 max Fracture stack. · L2: The hero joins the cascade — hero hits apply Fracture. · L3: Compounding fractures — +2 max Fracture stacks. · L4: The cascade CHAINS — status reactions re-fire once more. |
| Apex Adrenaline | rare | 4 | 7,020 | +47% | L1: Purer strain — +10% hero damage. · L2: Adrenaline sharpens — +5% hero crit chance. · L3: Endless rush — a further −8% ability cooldown. · L4: Killing instinct — crits hit +50% harder, +10% damage. |
| Lingering Acid | rare | 4 | 7,020 | +21% | L1: Concentrated — pools tick +10% harder. · L2: Never dries — pools last +20% longer. · L3: Acid clings to legs — Corrosion slows +8% more. · L4: A permanent swamp — pools tick +20% harder and last +20% longer. |
| Overcharged Veins | rare | 4 | 7,020 | +12% | L1: Wider veins — +0.08 reactor overcharge. · L2: Richer flow — +15% reactor biomass. · L3: Veins vent a gout — +25 biomass every cleared wave. · L4: Arterial overcharge — +0.12 overcharge and +15% reactor biomass. |
| Swarm Bounty | rare | 4 | 7,020 | +9% | L1: Fatter prey — +8% biomass from kills. · L2: The swarm tithes — +1 biomass on EVERY kill. · L3: Glutted harvest — +10% biomass from kills. · L4: The hive pays forward — +150 biomass now and +8% income. |
| Plague Vector | rare | 4 | 7,020 | +16% | L1: Virulent strain — +10% Infection damage. · L2: The hero carries the plague — hero hits apply Infection. · L3: Mutation drift — +15% Infection damage. · L4: A second, wider bloom — kills spread Infection to a larger radius. |
| Vulnerability Field | rare | 4 | 7,020 | +6% | L1: Deeper exposure — +5% damage taken while Disrupted. · L2: The field drags — Disruption also slows +8% more. · L3: Flayed defenses — +7% damage taken while Disrupted. · L4: The hero's presence disrupts — hero hits apply Disruption. |
| Pierce Protocol | rare | 4 | 7,020 | +24% | L1: Denser rounds — +6% tower damage. · L2: Protocol v2 — shots pierce +1 FURTHER enemy (3 total). · L3: Hardened penetrators — +8% tower damage. · L4: Protocol final — shots pierce +1 FURTHER enemy (4 total). |
| Heavy Caliber | rare | 4 | 7,020 | +33% | L1: Heavier loads — +8% tower damage. · L2: Rounds burst wider — +10% splash radius. · L3: Recoil tamed — the fire-rate penalty erased. · L4: Siege caliber — +12% tower damage. |
| Rapid Cycling | rare | 4 | 7,020 | +36% | L1: Faster cycling — +6% tower fire rate. · L2: The rhythm spreads — +10% hero attack speed. · L3: Red-line cycling — +8% tower fire rate. · L4: Cycling so hot the Needle Spitter grows a barrel — +1 needle. |
| Reclaimed Node | rare | 4 | 7,020 | +19% | L1: The node comes stocked — +100 biomass on draft. · L2: Reclaiming reinforces the Hive — +40 Integrity. · L3: Unbuilt ground focuses the network — +3% tower damage per EMPTY slot. · L4: A SECOND emplacement reclaimed — +1 more tower slot this run. |
| Warlord's Presence | rare | 4 | 7,020 | +8% | L1: The presence carries — +20 aura radius. · L2: Rallying roar — aura grants a further +5% tower damage. · L3: The aura QUICKENS — nearby towers also gain +8% fire rate. · L4: Warlord ascendant — +30 radius, +7% aura damage. |
| Lifelink | rare | 4 | 7,020 | +9% | L1: Deeper link — heal a further 3% of damage dealt. · L2: Drink deeper — +15% healing received. · L3: Vampiric strain — heal a further 4% of damage dealt. · L4: The link cuts BOTH ways — attackers take 10% of their damage back. |
| Adaptive Arsenal | rare | 4 | 7,020 | +6% | L1: Broader adaptation — +2% damage per distinct tower class. · L2: Resonates with the hero — +5% damage for towers matching the hero's class. · L3: Cross-pollination — +3% damage per distinct tower class. · L4: The arsenal EXPANDS — +1 tower slot this run. |
| Caustic Detonation | epic | 4 | 12,480 | +37% | L1: Volatile mix — pools tick +15% harder. · L2: Blast-fractured chitin — +3 max Fracture stacks. · L3: The burn never stops — pools last +25% longer and slow +8% more. · L4: Detonations ECHO — status reactions re-fire once more. |
| Shatterpoint | epic | 5 | 62,480 | +51% | L1: Finer shatter lines — +2 max Fracture stacks. · L2: Force multiplied — +8% tower damage. · L3: Total structural failure — +3 max Fracture stacks. · L4: The hero IS a shatterpoint — hero hits apply 2 Fracture. · L5: Reactions re-fire TWICE — the cascade never ends. |
| Cull the Weak | epic | 4 | 12,480 | +24% | L1: Sharper cull — execute below 14% HP. · L2: Culled meat feeds the Hive — +1 biomass on every kill. · L3: No stragglers — execute below 18% HP. · L4: The law of the Hive — execute below 20% HP, +10% damage. |
| Avatar of War | epic | 5 | 62,480 | +30% | L1: The avatar looms — +25 aura radius. · L2: War incarnate — +10% hero damage. · L3: Banner of ruin — aura grants a further +8% tower damage. · L4: Drums of war — aura grants a further +10% fire rate. · L5: EXALTATION — towers sharing the avatar's class gain +12% damage. |
| Catalyst Engine | epic | 4 | 12,480 | +36% | L1: Hotter engine — +6% tower damage. · L2: Catalytic stress — +2 max Fracture stacks. · L3: Perpetual reaction — +8% tower damage. · L4: The engine DOUBLES again — reactions re-fire once more. |
| Overcharged Grid | epic | 4 | 12,480 | +19% | L1: Grid expansion — +0.10 reactor overcharge. · L2: High-voltage veins — +20% reactor biomass. · L3: The grid SURGES as each wave breaks — +30 biomass per wave. · L4: Total overcharge — +0.15 overcharge, +8% tower damage. |
| Gravity Well | epic | 4 | 12,480 | +9% | L1: Heavier pull — Disruption slows +6% more. · L2: Crushing weight — +8% damage taken while Disrupted. · L3: The well warps the hero's reach — +12% ability radius. · L4: Event horizon — Disruption slows +10% and exposes +8% more. |
| Glass Genome | legendary | 5 | 101,530 | +47% | L1: Purer glass — +10% tower damage. · L2: The bargain softens — enemies gain 4% LESS bonus HP. · L3: Crystalline focus — +12% tower damage. · L4: The genome perfects — enemies gain 5% LESS bonus HP. · L5: GLASS SHARDS — +15% damage and every shot pierces +1 enemy. |
| Executioner's Law | legendary | 5 | 101,530 | +27% | L1: A broader writ — execute below 22% HP. · L2: Executions pay a bounty — +2 biomass on every kill. · L3: Summary judgment — execute below 26% HP. · L4: The law is absolute — +10% tower damage. · L5: FINAL VERDICT — execute non-elite enemies below 30% HP. |
| Last Bastion | legendary | 5 | 101,530 | +12% | L1: Every wall counts — a further +1% damage per tower fielded. · L2: The bastion thickens — +60 Integrity. · L3: Desperation sharpens — Last Stand deals ×1.1 more. · L4: The line moves up — Last Stand triggers at 55% Nucleus. · L5: The bastion REGROWS — +10 Integrity every cleared wave. |
| Apex Predator | legendary | 5 | 101,530 | +50% | L1: Sharper instincts — +15% hero damage. · L2: Predator bulk — +75 hero HP, +10% healing received. · L3: Feeds on the kill — heal 8% of damage dealt. · L4: Prey weakens — enemies gain 5% LESS bonus HP. · L5: THE APEX STRIKES TRUE — +10% crit chance, crits hit +50% harder. |
