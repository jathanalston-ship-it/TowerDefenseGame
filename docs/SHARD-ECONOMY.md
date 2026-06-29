# Shard Economy — Tower Shards & Hero Shards

Canonical spec for the two **star** currencies. Authoritative over the code: the numbers
here are the design intent; `src/core/config.ts` (`STAR`) and `src/state/meta.ts`
(`towerStarCost` / `heroStarCost`) implement them. Account currency (**Genome Cores**) and
crafting materials are out of scope — see `ECONOMY.md` / `currencies.ts`.

> Status: **active**. Supersedes the earlier shared `starCost` (base 8 × 1.8 for *both*
> towers and heroes), which made tower stars too cheap — a maxed carry inside a few sessions.

---

## 1. Philosophy

1. **Two independent ladders.** Tower Shards drive a long **★10** ladder (the primary
   long-haul grind); Hero Shards drive a short **★5** ladder fed by rarer drops. They get
   **separate cost curves** so each tunes without dragging the other.

2. **Smooth exponential, never spiky.** Cost is a pure function of the star you're leaving:
   `cost(s) = round(base × mult^s)`. A constant ratio means there is no sudden wall — every
   step is `mult×` the last. Three readable bands fall out of the single curve:

   | Band | Stars | Feel | Audience |
   |---|---|---|---|
   | **Early** | ★1–★3 | cheap, fast | new players — reach ★3 in a handful of runs |
   | **Mid** | ★4–★7 | a real, felt investment | the core mid-game chase |
   | **High** | ★8–★10 | prestige milestones | long-horizon / endgame trophies |

3. **Tower is the staple, Hero is the spice.** A loot roll is ~90% Tower / 10–55% Hero (by
   box rarity). Tower Shards are the bulk you always make progress on; Hero Shards are the
   rarer, brighter pull. Both scale up with rarity (rarer box → more rolls, bigger amounts,
   higher Hero chance) so opening a Mythic *feels* different from a Common.

4. **Roster-invariant by construction (scalability).** The cost curve is a pure function of
   star level — **identical for every tower and every hero**, today's 5/3 or tomorrow's
   60/40. Adding content needs **zero** economy edits: the random-pick drop just includes the
   new id. Roster growth scales **breadth** (more entities progress in parallel, each a touch
   slower), never the curve. This is the whole point of §1.2 being a formula, not a table.

5. **Instant recognition.** Earning a shard fires its full identity — unique icon (Tower
   **crystal** / Hero **star**), per-tower / per-hero color, rarity-framed reveal, pickup
   burst, **and a distinct reward sound** (crystalline *ting* vs bright *sparkle*). You never
   read text to know which shard landed.

---

## 2. Tower Shard cost table — `base 10 × 2.0`, ★0…★10

`towerStarCost(s) = round(10 × 2^s)`. Clean doubling: the steepest *smooth* curve, and the
most legible escalation of prestige.

| Buy ★ | Cost | Cumulative | Band |
|---:|---:|---:|---|
| ★1 | 10 | 10 | Early |
| ★2 | 20 | 30 | Early |
| ★3 | 40 | 70 | Early |
| ★4 | 80 | 150 | Mid |
| ★5 | 160 | 310 | Mid |
| ★6 | 320 | 630 | Mid |
| ★7 | 640 | 1,270 | Mid |
| ★8 | 1,280 | 2,550 | High |
| ★9 | 2,560 | 5,110 | High |
| ★10 | 5,120 | **10,230** | High |

**Maxing one tower to ★10 = 10,230 Tower Shards** (~2.9× the old 3,561). Maxing a launch
roster of 5 ≈ 51k — a genuine thousand-hour goal; 30+ towers stretches breadth, not the curve.

---

## 3. Hero Shard cost table — `base 8 × 1.8`, ★0…★5  (unchanged)

`heroStarCost(s) = round(8 × 1.8^s)`. Kept gentle: the Hero ladder is short (★5) and fed by
the *rarer* Hero-Shard drops, so its long horizon comes from scarce income, not steep cost.

| Buy ★ | Cost | Cumulative |
|---:|---:|---:|
| ★1 | 8 | 8 |
| ★2 | 14 | 22 |
| ★3 | 26 | 48 |
| ★4 | 47 | 95 |
| ★5 | 84 | **179** |

**Maxing one hero to ★5 = 179 Hero Shards.** Because Hero Shards are the minority pull, this
is still a multi-hundred-run commitment per hero at launch rates.

---

## 4. Drop-table balance (loot-queue boxes, `core/loot.ts`)

Each box opens `rolls` slots; each slot is a Hero Shard with `heroChance`, else Tower Shards.
The curve is deliberately **Tower-primary, Hero scales with rarity**:

| Rarity | rolls | Tower/roll | Hero chance | Hero/roll | ≈ Tower / box | ≈ Hero / box |
|---|---:|---:|---:|---:|---:|---:|
| Common | 3 | 2–5 | 10% | 1 | ~9 | ~0.3 |
| Uncommon | 3 | 3–6 | 14% | 1 | ~12 | ~0.4 |
| Rare | 4 | 4–8 | 20% | 1–2 | ~19 | ~0.9 |
| Epic | 5 | 6–11 | 28% | 1–2 | ~31 | ~1.7 |
| Legendary | 6 | 9–15 | 40% | 1–3 | ~43 | ~3.6 |
| Mythic | 7 | 13–20 | 55% | 2–3 | ~52 | ~7 |

Run-end **caches** (`config.CHESTS`, rolled via `rollChest`) mirror this with weighted pools
that already include a `hero` pool at every tier. **No drop-amount change is made in this
pass:** the Tower-cost increase (§2) is meant to slow tower progression on its own; inflating
drops to match would cancel the intent. Hero generosity is left as-is — exciting at high
rarity, never zero at low.

**Verdict:** balanced. Tower Shards remain the primary, ever-flowing currency; Hero Shards are
the rarer celebratory pull that ramps hard with box rarity; Equipment rides the cache/epic+
pools. Account currency is a *separate* run-end stream (`ECON.shardsPerWave/Kill`), so the
three economies never compete inside one roll.

---

## 5. Hero-Shard pipeline audit

Confirmed Hero Shards are wired into **every reward source that exists today**, and the seams
for future sources are already typed:

| Source | Status | Mechanism |
|---|---|---|
| **Bio-Containers** (loot-queue boxes) | ✅ integrated | `rollLoot` → `heroShardChance` per roll |
| **End-of-run** (run cache) | ✅ integrated | `rollChest` over `CHESTS`; every tier has a `pool: 'hero'` |
| **Future Stage rewards** | 🔌 seam ready | add a `ChestDef` with a `hero` pool, or emit a `RewardItem` `{type:'hero'}` |
| **Future events** | 🔌 seam ready | `eventOnly` rarity tier with Hero in its table, or the `event` RewardItem currency |
| **Future achievements** | 🔌 hook | achievements grant Genome Cores today (`reward?: number`); a typed reward would let them grant shards — noted, not built |

`RewardItem` (`state/lootbox.ts`) already carries a first-class `{ type: 'hero'; id; amount }`
variant and the `accrue`/save-fold path handles it, so **no source needs new plumbing** — only
a pool/grant that emits it. Nothing is missing from current sources.

---

## 6. Scalability — 5→30+ towers, 3→30+ heroes, no re-balance

- **The curve never changes.** §2/§3 are pure functions of star level; a 6th or 60th tower
  inherits the exact same ladder. There is no per-entity constant to author.
- **Income is per-rarity, not per-entity.** Drop tables (§4) key off box rarity, never roster
  size, so they don't need re-tuning when content lands.
- **Breadth, not depth, absorbs growth.** With N towers a random roll lands on a given tower
  1/N of the time, so a bigger roster progresses *more towers in parallel, each slower* — the
  intended "specialize over a long horizon," not a wall.
- **Future lever, curve untouched.** If per-entity dilution at 30+ ever feels too slow, the fix
  lives entirely on the **earn** side — directed shards (income for the entities you *field*),
  a duplicate→shard converter, or roster-scaled roll counts — none of which require touching
  the §2/§3 cost curves. That separation is what lets this survive to 30+ without a redo.
