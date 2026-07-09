# MULLIGANS.md — the Mulligan System

A permanent **endgame progression pillar**, the tower twin of Hero Equipment — but deliberately
**not** a copy. A **Mulligan** is a *biomechanical secondary organism* grafted onto a tower, which
the player **assembles from genetic modifiers**. The resulting organism grows a **procedurally
generated** appearance, animation, and projectile from the modifiers it holds. The design bet:
**modularity** — a future modifier is one registry row and needs *zero* new gameplay or draw code.

> Status: **framework + 30 modifiers + save + Power + sim fold shipped and tested.** Procedural
> appearance/animation/projectile generators and the player/dev surfaces layer on top of this core.

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
MulliganRarity>` (discovered modifiers → best rarity, the equip ceiling + collection source) ·
`save.geneOverflow: number` (the modifier upgrade currency). All **additive**: pre-v26 saves migrate
to empty organisms + empty dex + 0 overflow. `saveStore.sanitizeMulligans` drops unknown modifier
ids, clamps levels to the rarity ceiling, and coerces seeds — a malformed slot simply becomes `null`
(the organism stays inactive), never a crash.

### Pipeline (`meta` store methods)

`discoverModifier(id, rarity)` (loot) · `grantGeneOverflow(amt)` · `equipMulligan(kind, slot, id,
rarity?)` (rarity capped at the discovered ceiling) · `unequipMulligan` · `upgradeMulligan` (spends
Gene Overflow, +1 level within the rarity cap) · `ascendMulligan` (a **maxed** slot → next rarity,
Ascension-ready) · reads `mulligan(kind)` / `mulliganResolved(kind)`.

---

## 7. Upgrade economy (Gene Overflow)

- **Level** rises with Gene Overflow up to the rarity's `levelCap` (Common 5 … Ascendant 20;
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
- **BUILT:** framework + resolver + save + Power + sim fold + the procedural organism/animation/
  projectile generators (`src/render/mulliganOrganism.ts`), drawn on the battlefield through the
  renderer's per-kind Mulligan channel (`drawGame` → `drawTower`). Empty/inactive ⇒ nothing draws.
- **Deferred (layering on this core):** the player equip UI, the dev Mulligan Lab, loot-table
  wiring, collections/achievements entries, and the tutorial nod. The framework they plug into is
  complete and tested.
