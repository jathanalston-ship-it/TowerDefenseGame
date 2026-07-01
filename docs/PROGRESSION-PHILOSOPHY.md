# PROGRESSION-PHILOSOPHY.md — Why each layer exists

The lens for every progression decision. `PROGRESSION.md` specifies the **power math**
(buckets, curves, anti-inflation); this doc specifies the **player psychology** —
*what each layer is FOR* — and the **engine adjustments** needed before we add more
content on top of it. Companion redesigns: `TOWER-STARS.md`, `MASTERY.md`,
`EQUIPMENT-PHILOSOPHY.md`. Implementation status: `PROGRESSION-SYSTEMS.md`.

> The design + architecture gate for progression. Its principles are now **realized in code**
> (stars, branches, mastery→Adaptation, equipment, prestige) — this doc is the *why* every new
> tower/hero/card/equipment should still satisfy. Shipped-vs-planned: `GAME-STATE.md`.

---

## 0. The problem we are fixing

The **design** (`PROGRESSION.md`) already describes mechanics-first, differentiated
systems. The **implementation** does not — it collapsed the permanent layers into one
shape: *spend a currency → multiply a stat.*

| System | What the code actually does today | File |
|---|---|---|
| Core Upgrades | `effect.stat += perLevel·level` (towerDamageMult, biomassMult, …) | `config.ts: META_UPGRADES` |
| Tower Stars | `(1 + damagePerStar·stars)·(1 + fireRatePerStar·stars)` | `config.ts: STAR`, `meta.towerProgress` |
| Tower Mastery | `1 + damagePerLevel·level` | `config.ts: MASTERY`, `meta.masteryLevel` |
| Hero Mastery | same formula as tower mastery | `meta.heroProgress` |
| Equipment | mostly `{op:'mul', field:'…DamageMult'}` affixes | `equipment.ts: AFFIXES` |

Swap the currencies and a player could not tell these apart — they create the **same
decision** ("buy the next +%") and the **same feeling** ("number went up"). That is the
defect. **Five systems, one motivation, is one system wearing five hats.**

The fix is not "add more numbers." It is to give every layer a **distinct job** and
build the **engine seams** that let a layer reward something other than a stat.

---

## 1. The differentiation test

> **Two progression systems are "the same" if you could swap their currencies and the
> player's *decisions* and *emotions* would not change.**

Every system below must FAIL this test against every other system. We enforce it by
placing each layer at a **unique point** on five orthogonal axes. If two systems share
all five, one of them should not exist.

| Axis | The question it answers | Range |
|---|---|---|
| **Time horizon** | How long until it pays off / resets? | per-run → session → weeks → months → forever |
| **Agency source** | How is it earned? | choice (spend) · play (use) · luck (drop) · sacrifice (reset) |
| **Decision type** | What does the player *decide*? | tune · branch (exclusive) · combine (synergy) · time (when) · collect |
| **Power shape** | What does it change? | vertical (numbers) · horizontal (options) · structural (rules) · identity (status) |
| **Emotional beat** | What does it make the player feel? | anticipation · triumph · pride · expression · optimization · thrill · nostalgia |

**The cardinal rule that falls out of this:** *renewable excitement is temporary;
permanent progression is the slow legible floor.* Only **one** system is allowed to
deliver big vertical spikes — **Cards** — because it resets every run. Everything
permanent trades raw power for **options, identity, or structure**. This is also why the
game can run forever without inflating: the only infinite *power* curve is mastery's
logarithm, and its real rewards are non-power (see `MASTERY.md`).

---

## 2. The nine systems, each given one job

For each: **Emotion · Why engage · Unique decisions · Differentiation.**

### 2.1 Core Upgrades — *the legible floor (and the tutorial economy)*
- **Emotion:** early competence + safety. "I reliably got stronger; I understand why."
- **Why engage:** the first, simplest spend; guarantees forward motion while you're still
  learning the game. It is the on-ramp to the spend→power loop.
- **Unique decisions:** budget allocation under *early* scarcity (damage vs. economy vs.
  survivability) — and then, deliberately, *nothing*: it **completes** and graduates you
  to the richer systems.
- **Differentiation:** the **only** layer allowed to be a pure stat dial — because its job
  is to be the legible baseline, then **cap out and fade.** Redesign note: make it
  explicitly *finite and completable* (a short "Hive Foundations" tech baseline), not an
  infinite stat pump that shadows Stars. Bounded · account-wide · choice-spent · vertical ·
  competence.

### 2.2 Tower Stars — *evolution: "what this tower can DO"*
- **Emotion:** discovery / a new toy. "I can't wait to see this in action."
- **Why engage:** permanent trophy that unlocks **mechanics and build forks** — it changes
  how the tower plays, not how big its number is.
- **Unique decisions:** which towers to invest in (roster identity); at fork stars, *which
  build* (exclusive, re-selectable per run → multiple configs from one maxed tower).
- **Differentiation:** permanent · choice-spent · **horizontal/structural** · discovery.
  The "new abilities" axis. Full redesign in `TOWER-STARS.md`.

### 2.3 Tower Mastery — *craft: "how much I've USED this tool"*
- **Emotion:** pride / veteran status + the gentle forever-hum.
- **Why engage:** proof-of-investment earned by *playing*, not spending; guarantees every
  run advances *something* even when stars are maxed.
- **Unique decisions:** almost none moment-to-moment (it is ambient) — the only real choice
  is meta: *which tower do I main?* Mastery rewards loyalty. Its visible rewards (titles,
  badges, visual mutations) are **display** choices, not power choices.
- **Differentiation:** infinite · play-earned · **identity + tiny-vertical** · pride.
  Contrast with Stars (choice-spent, big mechanics, decision-heavy): mastery is the slow,
  decision-light loyalty trophy. Full redesign in `MASTERY.md`.

### 2.4 Hero Mastery — *bond: "my history with this character"*
- **Emotion:** attachment / relationship. A different register from tower mastery's *craft*.
- **Why engage:** heroes are characters; mastering one deepens a **bond** — it unlocks
  **lore, character cosmetics/skins, and player-worn titles tied to that character.**
- **Unique decisions:** who is your *main* (only one hero is fielded per run, so hero
  mastery concentrates — it is the "main character" track); which character identity you
  wear.
- **Differentiation:** shares the XP *engine* with tower mastery (DRY) but a **distinct
  reward vocabulary** — narrative/character, not craft/tool. Craft (tower) vs. relationship
  (hero) is the felt difference that keeps them from being one system. See `MASTERY.md §4`.

### 2.5 Hero Equipment — *build authorship: "how my hero PLAYS"*
- **Emotion:** creativity / theorycrafting + drop anticipation.
- **Why engage:** changes attacks, survivability, AI behavior, and battlefield rules → a
  hero plays differently per loadout. The horizontal-infinite combinatorial chase.
- **Unique decisions:** loadout combos (weapon attack × armor behavior × relic rule), set
  thresholds, and *crafting toward a target build*. Three slots force **exclusion** → an
  identity, not "equip everything."
- **Differentiation:** drop+craft-earned · **loadout-swappable** · combinatorial/structural
  · expression. Kept distinct from Stars by *subject* (hero vs. tower), *acquisition*
  (drops/craft vs. choice-spend), and *swappability* (gear swaps freely; stars are
  permanent unlocks with per-run fork picks). Full redesign in `EQUIPMENT-PHILOSOPHY.md`.

### 2.6 Loot Boxes — *anticipation: "what will I get?"*
- **Emotion:** anticipation / variable-ratio thrill — the dopamine of the reveal.
- **Why engage:** the renewable surprise; the meter you fill across runs (the loot queue);
  it **feeds the other systems' currencies** (shards), so it is the faucet, not a sink.
- **Unique decisions:** almost none *inside* the system by design — it is the *receiving*
  experience. Its decisions are downstream (what to spend the shards on); future pity adds
  a "chase a guarantee" sub-beat.
- **Differentiation:** luck-earned · **a delivery system, not a power system** · anticipation.
  The only layer whose *product is other systems' inputs*. **Rule: loot must never itself be
  "spend→stat."** Built: `core/loot.ts`, `core/lootQueue.ts` (see `PROGRESSION-SYSTEMS.md`).

### 2.7 Cards — *the renewable ceiling: "who is THIS run?"*
- **Emotion:** the roguelite high — creative spikes and on-the-fly adaptation.
- **Why engage:** big, exciting, **temporary** power; it resets every run, so excitement is
  renewable *without* permanent inflation.
- **Unique decisions:** draft picks under uncertainty; building synergies *this run*;
  adapting to the offered options and the run's enemies.
- **Differentiation:** **temporary · run-scoped · the ONLY big-vertical-spike layer ·
  drafted under RNG** · thrill. The deliberate counterweight to every permanent system:
  permanence is the floor, cards are the ceiling. This contrast is load-bearing for the
  whole economy.

### 2.8 Prestige — *sacrifice & rebirth: "was it worth resetting?"*
- **Emotion:** the bittersweet thrill of trading power for a multiplier; fresh-start dopamine.
- **Why engage:** converts a "finished" account into a **new growth axis** (a new
  multiplicative bucket) and a timing meta-game.
- **Unique decisions:** **WHEN to prestige** (sqrt currency → diminishing *within* a cycle
  creates the timing tension); which layer/path; what to keep vs. reset.
- **Differentiation:** sacrifice-earned · **timing-decision** · adds a NEW bucket while
  *resetting others* · reinvention. It is the only system that *removes* progress to create
  progress.
- **Status:** **Layer 1 (MOLT) is built**, both halves: (1) `core/prestige.ts` + `meta.molt`
  — sqrt-minted Ascendant Cells → a log global damage multiplier (the P bucket folded in
  `metaModifiers`); molting resets banked Shards + core upgrades, keeps every trophy; and
  (2) `core/ascendant.ts` + `meta.buyAscendantNode` — the **Ascendant Tree**, where Cells buy
  permanent, capped economy nodes (shard / biomass / loot / cell gain) that persist across
  every Molt and compound the climb. Both surfaced in `PrestigePanel`; golden-safe (0 cells +
  no nodes ⇒ ×1). Deeper layers (Speciation…Ω) remain designed-only (`PROGRESSION.md §5.2`) —
  they extend this same template.

### 2.9 Future Prestige Layers — *endless reinvention: "a new game on top"*
- **Emotion:** the meta-meta thrill — each layer reframes everything beneath it.
- **Why engage:** infinite **structural** novelty (Speciation = class fusion/hybrids;
  Hivemind = tradeoff resets; Apex = paragon-infinite; … ; Ω = clean countable steps).
- **Unique decisions:** which new axis to climb; cross-layer routing of resets and keeps.
- **Differentiation:** each layer must introduce a **new verb**, not a new currency for an
  old verb. **The gate: a new prestige layer earns its place only if it adds a new *kind of
  decision*.** If it would just be "another global ×, bought with another currency," it is
  rejected — that is the exact failure this whole document exists to prevent.

### 2.10 Master differentiation matrix

| System | Horizon | Agency | Decision | Power shape | Emotion |
|---|---|---|---|---|---|
| Core Upgrades | session (caps) | choice | tune→done | vertical | competence |
| Tower Stars | weeks | choice | branch | horizontal/structural | discovery |
| Tower Mastery | months→∞ | play | (ambient) | identity + tiny-vert | pride/craft |
| Hero Mastery | months→∞ | play | (ambient) | identity (narrative) | bond |
| Equipment | ongoing | luck+craft | combine | structural/horizontal | expression |
| Loot Boxes | per-run meter | luck | (none; faucet) | — (delivery) | anticipation |
| Cards | per-run | luck+choice | combine (temp) | **vertical spike** | thrill |
| Prestige | weeks/cycle | sacrifice | **timing** | new bucket | rebirth |
| Future Prestige | forever | sacrifice | route/new-verb | structural | reinvention |

No two rows share a profile. That is the bar.

---

## 3. Architectural adjustments required before adding content

The systems above can't be *expressed* by today's engine, because progression is folded
as flat multipliers (`meta.towerProgress` → `{damageMult, fireRateMult}`). Adding content
now would just add more stat-sticks. These adjustments come **first**, in order. They are
additive and preserve the golden invariant (a fresh account resolves to identity).

> **Status:** §A–E are **implemented**. The `CardEffect` language now carries
> `set`/`grant`/`hook` (cards.ts) folded at boot (game.ts `bootRunEffect`); capabilities
> reach the sim via the star kit (towers), projectile mutators (`mutators.ts`), granted
> tower mutators / hero-attack statuses, and run-scoped relic hooks; the per-run config is
> the frozen `towerProgress`/`heroProgress` snapshot + `RunModifiers` behavior knobs.
> Identity registries (D) ship as `cosmetic`/title/lore via `mastery.ts`. **Power Score (F)
> is built** (`meta.powerScore()` — one legible account-power index, shown on the menu). A
> formal bucket *resolver* and the currency-role *lint* (G) remain the standing guardrails.

### A. One progression-effect language (not many stat folds)
Today three vocabularies coexist: `UpgradeDef.effect` (meta), `TowerMods` (stars/mastery),
`CardEffect[]` (cards/equipment). **Unify on `CardEffect[]`-style effects as the single
progression language**, and extend its vocabulary beyond stats:

```ts
// proposed — NOT wired
type Effect =
  | { op: 'add' | 'mul'; field: StatField; value: number }      // stats (today)
  | { op: 'grant'; capability: CapabilityRef }                  // NEW: unlock a behavior
  | { op: 'set'; field: BehaviorField; value: number | string } // NEW: behavior knobs (AI, targeting)
  | { op: 'hook'; on: GameEvent; action: ActionRef };           // NEW: conditional/triggered
```

`grant`/`set`/`hook` are what let Stars give *mechanics*, Mastery give *cosmetics*,
Equipment change *AI* — through one interpreter instead of five bespoke folds.

### B. A Capability/Grant layer distinct from the stat layer
Stars, mastery milestones, and equipment must be able to grant **named capabilities** the
sim reads from a resolved set — not numbers. Capabilities reference *existing seams*:

- **Targeting** → a `TargetingProfile` (already exists, `targeting.ts`).
- **Abilities** → an ability-component id + trigger (already exists, `ability.ts`).
- **Projectile mutators** → a new composable `ProjectileMutator` list applied at spawn.
- **Reactions** → a reaction id (existing reaction system).
- **Cosmetics / titles / lore** → ids in new cosmetic registries (see D).

```ts
// proposed
type CapabilityRef =
  | { kind: 'targeting'; profile: string }
  | { kind: 'ability'; id: string; trigger: GameEvent | 'passive' }
  | { kind: 'projectile'; mutator: string }
  | { kind: 'reaction'; id: string }
  | { kind: 'cosmetic'; id: string };
```

### C. A RunConfig assembly step (permanent + per-run → frozen)
Generalize today's "snapshot `towerProgress` at construction" into a single resolver that
composes **permanent grants** (stars, mastery, upgrades) + **per-run choices** (fork picks,
equipment loadout, drafted cards) into one immutable `RunConfig` the deterministic sim
consumes. This is where the golden invariant lives: *fresh account ⇒ empty grants ⇒
byte-identical run.* It also cleanly separates **permanent** state (saved) from **per-run
loadout** state (fork picks, gear loadout) — which Stars and Equipment both need.

```ts
// proposed
interface RunConfig {
  towerKits: Record<TowerKind, ResolvedKit>;   // base stats + granted capabilities + fork picks
  heroKit: ResolvedHeroKit;                     // stats + equipment grants + behavior profile
  buckets: BucketSet;                           // PROGRESSION §1.1 multiplicative buckets
  cosmetics: ResolvedCosmetics;                 // titles/badges/visuals for display
}
```

### D. Identity infrastructure (what Mastery rewards instead of stats)
Mastery-as-experience needs a home for non-power rewards. Add registries + save fields:
`cosmeticRegistry`, `titleRegistry`, `loreRegistry`, `masteryPerkRegistry`; and save
additions `unlockedCosmetics / unlockedTitles / equippedTitle / unlockedLore` (additive,
migration-safe like the v4 loot queue). Detailed in `MASTERY.md`.

### E. A hero behavior-profile seam (what Armor/Relics change)
Heroes are autonomous AI. Introduce a `HeroBehaviorProfile` (stance, aggro radius,
reposition rule, retreat threshold, target priority) in `RunConfig`; armor/relic effects
write it; the hero AI reads it. This is the concrete "armor changes how the hero plays"
mechanism. Detailed in `EQUIPMENT-PHILOSOPHY.md`.

### F. The bucket resolver + Power Score as the single inflation control
Implement `PROGRESSION.md §1.1`'s bucket model as actual structure: each system declares
which **named bucket** it feeds and which **curve type** it uses (`§1.2`). One resolver
multiplies buckets; one `Power Score` summarizes them. New content slots into a bucket with
a declared curve — making "is this inflationary?" a question the architecture answers, not
a vibe.

> **Status:** **Power Score is built** — `meta.powerScore()` aggregates the permanent damage
> buckets (meta upgrades × prestige × stars × mastery, roster-averaged) into one ×N index,
> ×1.0 on a fresh account, shown on the main menu. A *formal* bucket resolver (systems
> declaring a named bucket + curve, so the inflation check is structural) is the remaining
> guardrail; today each system folds into the existing multiplier fields by hand.

### G. Currency-role discipline (a content rule, enforced in review)
Document each currency's role so new content can't quietly add a sixth stat currency:

- **Faucets:** Loot boxes (produce shards/currency).
- **Sinks (choice):** Stars (Genome Samples), Equipment (mats), Core Upgrades (shards).
- **Play-earned (no currency):** Mastery, Class XP.
- **Sacrifice:** Prestige currencies (sqrt-gained).

> **Rule:** no new system may introduce a currency whose only sink is a flat stat
> multiplier. If the sink isn't a *mechanic, option, identity, or structural change*, the
> system fails §1 and is redesigned.

### Sequencing
`A → B` (effect language + capabilities) unblock **Stars** and **Equipment**. `C` (RunConfig)
unblocks per-run forks/loadouts. `D` unblocks **Mastery**. `E` unblocks **Armor/Relic AI**.
`F/G` are the standing guardrails. None changes a fresh-account run, so each can land behind
the golden tests incrementally.

---

## 4. Definition of done (for the content that comes next)

Before any new tower/hero/card/equipment is merged, it must answer:
1. **Which system does it belong to, and what is that system's job (§2)?**
2. **What new *decision* or *feeling* does it add** — not what number?
3. **Does it route through the unified effect/capability language (§3A/B)** rather than a
   bespoke stat fold?
4. **Which bucket + curve does its power use (§3F)**, and does a fresh account still resolve
   to identity (golden)?

If a feature's honest answer to #2 is "a bigger number," it belongs in Cards (temporary) or
nowhere.
