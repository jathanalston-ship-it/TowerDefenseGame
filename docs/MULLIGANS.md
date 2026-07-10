# MULLIGANS.md — the Mulligan System

A permanent **endgame progression pillar**, the tower twin of Hero Equipment — but deliberately
**not** a copy. A **Mulligan** is a *biomechanical secondary organism* grafted onto a tower, which
the player **assembles from genetic modifiers**. The resulting organism grows a **procedurally
generated** appearance, animation, and projectile from the modifiers it holds. The design bet:
**modularity** — a future modifier is one registry row and needs *zero* new gameplay or draw code.

> Status: **SHIPPED end-to-end**, then **OVERHAULED (v29)**: piece exclusivity (one tower per
> piece; the catalog is pinned at **3× the tower roster** — currently 45 pieces / 15 towers), a
> **progress gate** (3 distinct Mega Boss kills), duplicate pulls dissolving to Gene Essence,
> a split Collection (pieces AND complete organisms), and the **Reforge wheel** (§reforge) —
> an ichor-fueled bio-horror spinner that permanently BINDS an organism to its host.

---

## 1. Fantasy & rules

- Heroes equip weapons. Towers grow organs. **A Mulligan is an organism grafted onto a tower.**
- **Every tower kind permanently owns ONE Mulligan.** It is account-permanent and persists between
  runs (like Stars / Adaptation), keyed per `TowerKind`.
- Each Mulligan has **three modifier slots** (A / B / C).
- **§exclusivity — a PIECE lives on ONE tower at a time.** Pieces are unique physical items:
  equipping one on a second tower MOVES it (the first organism deactivates); the same piece can
  never fill two slots. The catalog is pinned at **exactly 3 pieces per tower**
  (`mulliganRegistry.size === 3 × TOWER_ORDER.length`, content-integrity tested), so every tower
  can host a full organism with zero sharing — adding a tower forces three new pieces.
- **§gate — the pillar unlocks after slaying 3 distinct Mega Bosses** (`MULLIGAN_GATE_MEGAS`;
  `meta.mulligansUnlocked`). The Lab shows a progress briefing until then; containers hold their
  piece drops. Accounts already holding pieces are grandfathered. Dailies still field loaner
  organisms pre-gate — the system teaches itself there.
- **No selling, no duplicates:** when the whole catalog is owned, a container's piece pull
  **dissolves into Gene Essence on the spot** (rarity-scaled), surfaced on the reveal ceremony.
- **No partial activation.** The organism does **nothing** until *all three* slots are filled. This
  single rule is also the **golden-safety gate** (below).
- **Mixing and stacking both matter.** `Bone Spike + Acid Gland + Rapid Synapse` produces a
  different organism — stats, profile, visuals, projectile — than `Rapid Synapse ×3`. There is no
  single "best" triple; every modifier supports multiple archetypes.

---

## 2. Architecture (`src/core/mulligan.ts`)

Pure data + pure helpers (no Game/DOM/save imports). The **single source of truth** for the system.

| Concept | Shape |
|---|---|
| **Rarity** | `MulliganRarity` — `common → uncommon → rare → epic → legendary → ascendant` (6). `MULLIGAN_RARITY[r]` carries `{ statMult, powerMult, visualIntensity, animComplexity, levelCap }`. Rarity is a **per-slot** property (a modifier can be Common on one tower, Legendary on another). |
| **Axes** | `MulliganAxis` — the 10 procedural archetypes: `damage, attackSpeed, debuff, poison, splash, pierce, support, crit, slow, healing`. Each drives a visual/animation/projectile trait. |
| **`StatProfile`** | `Record<MulliganAxis, number>` — the aggregated archetype vector; the **only** input the generators need (beyond the seeds). |
| **`MulliganModifier`** | `{ id, name, category, desc, flavor, baseRarity, stats, influence, powerWeight }`. `stats` are Common/L1 sim deltas; `influence` are archetype weights; registered in `mulliganRegistry`. |
| **Sim kit** | `stats` only ever touches **existing** `TowerMods` channels: `damageMult, fireRateMult, rangeMult, splashMult, extraProjectiles, projectileMutators`. **No new sim branch.** |
| **Save shapes** | `MulliganSlot { id, rarity, level }`; `MulliganState { slots: (Slot\|null)[3], visualSeed, animSeed }`. |

### Public API (entry points)

```ts
resolveMulligan(state) → ResolvedMulligan   // the ONE resolver: sim mults + profile + power
isMulliganActive(state) → boolean           // all three slots filled with known modifiers
mulliganPower(state) / accountMulliganPower(states) → number   // Power (≥1)
effectiveStats(slot) → MulliganStats         // base deltas × rarity × level
statScale(rarity, level) / upgradeCost(rarity, level) / ascendCost(rarity) / levelCap(rarity)
rollRarity(roll, luck) / makeSlot(id, rarity, level) / assembleMulligan(ids, rarity, level, kind)
seedFor(kind, slots) → { visualSeed, animSeed }   // deterministic, composition-stable
```

`ResolvedMulligan = { active, damageMult, fireRateMult, rangeMult, splashMult, extraProjectiles,
projectileMutators, profile, power }`. When inactive it is the **identity** (all mults 1, zero
profile, power 1).

### Extension points

- **A new modifier is one `MulliganModifier` row** in `OFFENSIVE / UTILITY / BIOLOGICAL` (or a mod
  registering into `mulliganRegistry`). It automatically flows into the resolver, Power, the
  generators, save sanitization, loot, and collections — no other file changes.
- **A new archetype axis** is one entry in `MULLIGAN_AXES` + a generator trait. Additive.

---

## 3. Golden-safety (the non-negotiable invariant)

A fresh account has every Mulligan **empty** ⇒ `resolveMulligan` returns the **identity** ⇒
`towerProgress` (meta.ts) folds a neutral kit ⇒ the sim is **byte-identical** and the Power index
reads exactly `POWER_BASE`. The activation gate (`isMulliganActive`) is the *only* place this is
enforced, and it requires **all three** slots to hold known modifiers. Modifiers are earned from
loot, so autoplay (which equips nothing) can never perturb the pinned golden run.

`src/state/mulligan.test.ts` pins this: `towerProgress(fresh) deepEquals towerProgress(fresh, false)`
and `accountPowerParts(fresh).mulligans === 1`.

---

## 4. Sim integration (`src/state/meta.ts` → `towerProgress`)

The resolved Mulligan folds into the per-kind `TowerMods` **beside Stars / Mastery / Adaptation** —
the same channels the sim already reads, so there is **zero** new sim code. `towerProgress(save,
includeMulligan = true)`; the sim path folds it, and the Power **towers** bucket calls
`towerProgress(save, false)` so the Mulligan's Power is credited **only** to its own bucket (no
double count).

---

## 5. Power Score (a dedicated, separately-inspectable bucket)

`PowerParts` gains a **`mulligans`** bucket (`core/power.ts`, folded in `composePower`). It is scored
by a **flat heuristic** — `∏ over slots (1 + powerWeight · rarity.powerMult · levelFactor)` — like
equipment rarity / branch tiers, **not** a `FIELD_WEIGHT` field, so it never touches Power coverage.
It is **1** until an organism is fully assembled. The Power Breakdown (`state/profile.ts` →
PlayerProfile) shows **"Mulligans"** as its own slice — the required *separate display*.

---

## 6. Save (schema v26)

`save.mulligans: Record<TowerKind, MulliganState>` (v29: + `locked`, `reforges`) ·
`save.mulliganDex: Record<string, MulliganRarity>` (owned pieces → best rarity, the equip
ceiling + collection source). The v29 sanitizer also enforces §exclusivity: cross-tower or
within-tower duplicate piece ids null out deterministically (first host in TOWER_ORDER wins).
Modifier upgrades spend **`save.geneEssence`** — the SAME unified currency Gene Cards level with
(the short-lived `geneOverflow` wallet was retired; a legacy balance folds into `geneEssence` 1:1
on load, so nothing banked is lost). All **additive**: pre-v26 saves migrate to empty organisms +
empty dex. `saveStore.sanitizeMulligans` drops unknown modifier ids, clamps levels to the rarity
ceiling, and coerces seeds — a malformed slot simply becomes `null` (the organism stays inactive),
never a crash.

### Pipeline (`meta` store methods)

`discoverModifier(id, rarity)` (loot) · `grantGeneEssence(amt)` · `equipMulligan(kind, slot, id,
rarity?)` (rarity capped at the discovered ceiling) · `unequipMulligan` · `upgradeMulligan` (spends
Gene Essence, +1 level within the rarity cap) · `ascendMulligan` (a **maxed** slot → next rarity,
Ascension-ready) · reads `mulligan(kind)` / `mulliganResolved(kind)`.

---

## 7. Upgrade economy (Gene Essence — the unified gene currency)

- Mulligans and Gene Cards spend the **same wallet** (`save.geneEssence`): one currency, two sinks
  (Gene Archive card levels · Mulligan Lab modifier levels/ascensions) — a deliberate tension.
- **Level** rises with Gene Essence up to the rarity's `levelCap` (Common 5 … Ascendant 20;
  `MULLIGAN_MAX_LEVEL = 20`, future-proofed).
- **Ascend** a maxed slot to the next rarity (`ascendCost`) — the **Ascension seam**: higher rarity
  raises stat scaling, Power, upgrade ceiling, and the generator's visual/animation intensity.
- Costs are monotonic (`upgradeCost` rises with level; `ascendCost` rises with rarity).

---

## 8. Procedural generators (stat-profile → organism / animation / projectile)

**Do not hand-author organisms.** The generators derive everything from the `StatProfile` + the two
saved seeds, so a new modifier's look/behaviour falls out for free:

| Axis | Visual | Animation |
|---|---|---|
| damage | large offensive spikes | heavy pulse |
| attackSpeed | many thin tendrils | twitch |
| debuff | parasite sacs | — |
| poison | green veins | ooze |
| splash | swollen glands | — |
| pierce | bone lances | — |
| support | symbiotic pods | breathe |
| crit | crystalline growth | — |
| slow | sticky membranes | — |
| healing | vascular tissue | — |
| burst (damage+crit) | — | contract → release |

The projectile is likewise assembled from the profile: shape, size, colour, trail, particles,
impact, sound — no hardcoded projectile per modifier. (Hooks live in the render layer, added in the
generators pass that layers on this core.)

---

## 9. The launch catalog — 30 modifiers

Authored at Common/L1; rarity + level scale the deltas. Each supports multiple archetypes.

**Offensive (10):** Bone Spike · Acid Gland · Rapid Synapse · Rupture Node · Venom Barb ·
Crystalline Core · Overload Ganglion · Siege Carapace · Shatter Lance · Apex Predator Gland.

**Utility (10):** Sensory Cilia · Sticky Membrane · Symbiotic Pod · Disruptor Sac · Frost Vesicle ·
Hunter Ocelli · Web Filament · Resonance Antenna · Warp Anchor · Oracle Nexus.

**Biological (10):** Green Vein · Vascular Tissue · Parasite Sac · Spore Bladder · Regenerative Node
· Toxin Reservoir · Symbiont Cluster · Necrotic Bloom · Living Hive · Genesis Organ.

---

## 10. Scale & known limitations

- Built for **100 / 250 / 500+** modifiers: adding one never touches the generators or the resolver.
- The resolver, Power, save sanitization, and generators are all `O(slots)` = `O(1)` per tower.
- **BUILT (the whole pillar):** framework + resolver + save + Power + sim fold; the procedural
  organism/animation/projectile generators (`src/render/mulliganOrganism.ts`) drawn on the
  battlefield via the renderer's per-kind Mulligan channel (`drawGame` → `drawTower`); the **earn
  loop** (every Bio-Container bleeds Gene Essence, epic+ containers discover a modifier —
  `meta.openContainer`); the **Mulligan Lab** player screen (`ui/MulliganLab.tsx` over
  `state/mulliganLabModel.ts`, wired into the Hub Progression nav) with a live grafted-organism
  preview + equip/upgrade/ascend/unequip; **dev tools** (`meta.debugGrantOverflow` /
  `debugDiscoverAllMulligans` / `debugAutoAssembleMulligans` + DebugPanel buttons); and three
  **achievements** (`mulligan_grafted` / `mulligan_splicer` / `mulligan_transcendent`).

## 11. Loot, UI & dev tooling

- **Loot (`meta.openContainer`):** every container grants a rarity-scaled Gene Essence bleed; epic+
  containers additionally DISCOVER a random modifier at a rolled rarity (best rarity kept in
  `mulliganDex`). Additive — a fresh account is unaffected.
- **Mulligan Lab (Hub → Progression → Mulligans):** a master–detail bench in the Tower Lab's
  visual language (`.mgl-*`, token-driven — passes `uiStandards`). The HOST RAIL (one row per
  tower: portrait, awake/dormant status, ×Power) selects a specimen for the SHOWCASE: a breathing
  GRAFT CHAMBER (the live procedurally-generated organism on its turret — DPR-crisp, static frame
  under reduced motion), the organism's dominant-axis identity + resolved package chips, three
  GRAFT SITES (rarity-railed cards; level bar; level-up / ascend / clear — every spend shows a
  `PowerPreview`), and the category-filterable sequenced-modifier library. The first empty site
  auto-arms, so tapping a library modifier grafts immediately. Reads `mulliganLabView` (which
  carries `filled` / `dominant` / `packageLines` per tower); writes only via the meta pipeline.
- **Visual identity:** `MULLIGAN_RARITY` colors mirror the global rarity tokens (`--r-*`;
  ascendant = the mythic register) so rarity reads identically across equipment, genes and
  mulligans; `GENE_OVERFLOW` (core/mulligan.ts) is the currency's single name/glyph/color source
  (⊛, gene-green) shared by the Lab wallet, the reveal pulls, and profile copy.
- **Dev tools:** grant Overflow, discover-all, and auto-assemble a varied organism on every tower —
  exercise the entire pipeline without grinding loot.
- **Container reveal (§reveal):** the Overflow bleed and every dex discovery surface ON the reveal
  ceremony as event pulls — `Gene Essence +N` and `Modifier Sequenced/Ascended — <name> (<rarity>)`
  (ascendant reads at exotic emphasis) — so the spoils are never invisible. Both pulls wear the
  system's ⊛ glyph: the bleed in `GENE_OVERFLOW.color`, a discovery in its sequenced rarity's color.

## Daily Run (§daily)

`dailyMulliganAssignment(daySeed, TOWER_ORDER, mulliganDex)` pre-assembles the day's towers with
organisms drawn ONLY from the player's **own sequenced modifiers** (at each modifier's dex rarity,
level 1; stacking legal — the design supports ×3). A dex too thin for three slots borrows the
loaner **tutorial trio** (`TUTORIAL_MULLIGAN_IDS`: Bone Spike / Rapid Synapse / Sensory Cilia at
common, `tutorial: true`) — dailies always field AWAKE organisms, so the system teaches itself
there. Own PRNG over the day seed ⇒ a rerun fields identical organisms. Wired as a
`towerProgress(save, true, override)` substitution in `App.startDaily` (fold + battlefield visuals
+ Inspect all read the override); the account's own organisms are untouched. The Daily screen
carries a briefing line.

## Collection (§collection)

TWO codex categories — pieces and complete organisms are **separate collection items**:

- **`mulligans` (Mulligan Pieces)**, dex-driven: tier 1 `Discovered — <rarity>` on first
  sequencing, tier 2 `Transcendent` at legendary-or-better. Set bonus **+5% tower fire rate**.
- **`mulliganOrganisms` (Mulligans)**, one entry per tower kind: tier 1 `Grafted — Awake`
  (all three sites filled), tier 2 `Reforged — Bound` (§reforge). Set bonus **+5% tower damage**.

Both wear the standard 0.03 Power weight and surface their own % completion in the Collection
panel; the Hub's Mulligans nav item carries a progress ring (pieces sequenced / catalog).

## Reforge (§reforge) — the permanent gamble

Once an organism is AWAKE, the Lab's **Reforge Bay** offers **1–3 wheel slots** by the combined
rarity of its three grafts (`reforgeSlotCount`: tier-sum ≤4 → 1, 5–9 → 2, ≥10 → 3). A spin costs
**Ichor** (`REFORGE_COSTS = [40, 90, 160]` by slot) and plays the bio-horror **wheel ceremony**
(`render/reforgeWheel.ts` — a fleshy iris of rarity wedges spun under a bone pointer; reduced
motion lands instantly). The roll (`core/mulliganReforge.ts`, weighted Common 44 → Legendary 3)
lands on a mod: Commons are flat % rides, Epics reach ability territory (extra projectile, deep
pierce), **Legendaries are GLOBAL passives** (+4% all-tower damage / fire rate, +6% biomass —
folded into runs via `meta.mulliganGlobalEffects`, beside the collection/trophy/infestation lanes).
Tower-local mods fold through `resolveMulligan`'s existing channels — zero new sim branches.

**THE PRICE IS PERMANENCE:** the first spin sets `locked` — the organism is bound to its host
forever. No unequip, no re-slotting, and its pieces can never move to another tower (leveling
and ascension stay available). Re-spinning an occupied slot replaces that slot's mod.

## Inspect (§inspect)

Selecting a placed tower with an ACTIVE organism shows its **Mulligan block**: the three modifier
chips (rarity-colored, with level), the dominant-axis identity, the resolved package
(damage/fire-rate/range/splash/projectiles), and its ×Power. Daily runs show the day's assignment
(GameView threads `mulliganOverride` → Inspector `mulliganStates`).

## Battlefield projectiles (§projectile)

`deriveMulliganProjectile` skins are now WIRED: GameView derives one per active kind into
`MulliganRender.projectile`; `drawProjectile` fires it in place of the base comet (branch skins
still take precedence — a branch IS an identity).

## Audio (§audio)

Three quiet organic cues (`sound.ts`): `graftSquelch` (socketing a modifier), `graftCrack`
(an upgrade takes), and `graftPulse` — a soft wet heartbeat every ~5.5s of sim time while ANY
active organism stands on the field (pause holds it; silent on graft-less boards).

## Help + statistics

Help-wiki mechanic `mulligans` (unlocks with the first sequenced modifier; nav → the Mulligan
Lab). Profile → Economy carries `Modifiers Sequenced` (dex/registry); upgrades spend the unified Gene Essence wallet;
the Power Breakdown's dedicated *Mulligans* slice was already live. Four achievement additions:
`mulligan_dex` (complete sequence), `mulligan_perfected` (a rarity level-cap), `mulligan_ascendant`
(an ascendant slot, hidden), `mulligan_overlord` (×1.5 organism Power). The Mulligan Lab screen
joined the mobile enforcement lane (`scripts/mobilecheck.ts` NAVS).

## §classes — biological modifier classes (v33)

Every modifier carries exactly ONE `cls: CombatClass` — the SAME six-class taxonomy towers use
(`Kinetic ✦ · Caustic ☣ · Viral ⬡ · Neural ◉ · Vital ✚ · Resonant ◈`, display metadata in
`src/core/combatClass.ts` — the ONE table every surface reads; raw `hex` mirrors for canvas).
The registry REJECTS a classless modifier (**the future-modifier contract**: class, adaptation
interaction, visual identity, Power weight, dex registration and docs all come from the one
row — an incomplete row fails `mulliganRegistry.validate()` and the content test).
`modifiersByClass(cls)` powers the Lab filter, collections views and the recommender. Every
class fields ≥ 3 modifiers so every tower can complete its match (content test).

## §adaptations — host-class set bonuses (v33)

A completed organism compares its three modifiers' classes to the HOST tower's class
(`adaptationOf(state, hostClass)`):

| Matches | Tier | Bonus |
|---|---|---|
| 3/3 | **Complete Class Adaptation** (`full`) | The class's CAPABILITY + numbers (below) |
| 2/3 | Minor Adaptation (`minor`) | Numbers only |
| ≤1 | none | Hybrids resolve exactly as before — no tax |

`CLASS_ADAPTATIONS` (DATA): Kinetic *Ossified Momentum* (+pierce, +10% dmg) · Caustic
*Runaway Dissolution* (+22% splash, +4% dmg) · Viral *Epidemic Cadence* (+10% rate, +6% dmg) ·
Neural *Synaptic Overreach* (+10% range, +8% rate) · Vital *Perpetual Bloom* (+6/6/4%) ·
Resonant *Harmonic Chorus* (+1 echo target, +5% range). Bonuses speak the EXISTING
`MulliganStats` vocabulary and fold inside `resolveMulligan(state, hostClass?)` — zero new sim
branches; inactive ⇒ identity (golden-safe). Capability grants (pierce, echo) are FULL-only.
Power: full ×1.06, minor ×1.025 (`ADAPTATION_POWER`) through the same mulligans bucket —
`accountMulliganPower` now takes `[state, hostClass]` pairs.

**Presentation:** class chrome on every card (left accent + corner glyph + class label), the
host-synergy panel (match pips + tier badge + running bonus / chase copy), 8 library sort
modes, the per-host recommender (`recommendModifiers` — completing an adaptation ranks first),
the ⟡ crown on adapted rail rows, the class-hued orbiting-thorn crown on the organism itself
(`mulliganOrganism.ts` — the battlefield "this one is complete" mark), the in-run Inspector
readout, and the COMPLETE CLASS ADAPTATION ceremony (dedicated `adapt` cue) on the equip that
synchronizes. Genome Rank's mulligan measure now blends assembly + full adaptations
(`(assembled + adapted) / (towers × 2)`).
