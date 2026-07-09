# MULLIGANS.md — the Mulligan System

A permanent **endgame progression pillar**, the tower twin of Hero Equipment — but deliberately
**not** a copy. A **Mulligan** is a *biomechanical secondary organism* grafted onto a tower, which
the player **assembles from genetic modifiers**. The resulting organism grows a **procedurally
generated** appearance, animation, and projectile from the modifiers it holds. The design bet:
**modularity** — a future modifier is one registry row and needs *zero* new gameplay or draw code.

> Status: **SHIPPED end-to-end.** Framework + 30 modifiers + save v26 + Power + sim fold + the
> procedural organism/animation/projectile generators (drawn on the battlefield) + the earn loop
> (Bio-Container loot) + the **Mulligan Lab** player screen + dev tools + achievements — all tested.

---

## 1. Fantasy & rules

- Heroes equip weapons. Towers grow organs. **A Mulligan is an organism grafted onto a tower.**
- **Every tower kind permanently owns ONE Mulligan.** It is account-permanent and persists between
  runs (like Stars / Adaptation), keyed per `TowerKind`.
- Each Mulligan has **three modifier slots** (A / B / C).
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

`save.mulligans: Record<TowerKind, MulliganState>` · `save.mulliganDex: Record<string,
MulliganRarity>` (discovered modifiers → best rarity, the equip ceiling + collection source).
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

Codex category **`mulligans` (Modifiers)**, dex-driven: tier 1 `Discovered — <rarity>` on first
sequencing, tier 2 `Transcendent` at legendary-or-better. Set bonus at completion = **+5% tower
fire rate** + the standard 0.03 Power weight (`CATEGORY_BONUS_SPECS`). Registry-driven — a future
modifier joins the codex by itself.

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
