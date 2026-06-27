# EQUIPMENT-PHILOSOPHY.md — Gear changes HOW heroes play

Equipment's job is to **author a playstyle**, not pad a stat. A weapon changes the hero's
attack; armor changes survivability *and the hero's autonomous AI*; a relic changes a rule
of the battlefield. Two heroes with the same base and different gear should play like
different characters. Sharpens `EQUIPMENT.md §9–13` (already "alter attack / survivability
/ rules") and the philosophy in `PROGRESSION-PHILOSOPHY.md §2.5`.

> Document the philosophy before implementation. No gameplay code yet.

---

## 1. The problem

`EQUIPMENT.md §13` already says "depth without stat-sticks," but the **implemented affixes
are stat-sticks** (`equipment.ts: AFFIXES`): `keen +5% dmg`, `rapid +5% fire rate`,
`savage +8% hero dmg`, `warded +8% HP`. The *bases* are behavioral; the *affixes and most
set bonuses* are flat %. A drop today asks "is this % bigger?", not "does this change my
build?". This doc closes that gap.

## 2. Principles

1. **Behavior-first at every rarity.** Even a Common's *base* is a mechanic; numbers are
   garnish, never the dish.
2. **Three distinct layers of change** — and they must stay distinct:
   - **Weapons re-author the ATTACK** (what the hero's hits *do*).
   - **Armor re-authors SURVIVABILITY + AI BEHAVIOR** (how the hero *fights and moves*).
   - **Relics re-author a RULE of the run** (a unique battlefield interaction).
3. **No "+10% damage" items.** A flat-stat-only piece is a content bug. Stats exist only to
   *flavor* a behavior (a bounded knob), never as the whole item.
4. **Every piece encourages a different build.** The test for a new item: *does it make a
   new loadout viable, or just make an old one numerically better?* Only the former ships.
5. **Exclusion creates identity.** Three slots + set thresholds force a choice — you become
   a *kind* of hero, you don't equip everything.
6. **Bounded vertical, infinite horizontal** (`PROGRESSION §1.2`): capped magnitudes keep
   power legible; weapon × armor × relic × set × affix combinations make builds endless.

## 3. The three layers, concretely

### 3.1 Weapons — change the attack
Weapon types already exist (`melee` / `ranged` / `conduit`). Each weapon's *base* defines an
attack behavior; affixes flavor it.

- *melee:* cleave arc, lunge-on-kill, lifesteal→shield, execute-low-HP.
- *ranged:* piercing line, multi-shot fan, charge-shot, mark-and-detonate.
- *conduit:* chain-lightning (N targets), tether-drain, beam that ramps, AoE pulses.
- Affix examples (behavioral): `+1 chain target`, `+1 projectile fork`, `on-hit apply
  Corrosion`, `every 4th hit stuns`. Magnitudes bounded (`AFFIX_TIER_SCALE`).

### 3.2 Armor — change survivability **and AI behavior**
Armor types already exist (`carapace` / `hide` / `weave`). The new idea: armor writes the
hero's **behavior profile** (heroes are autonomous AI per `HEROES.md`), so different armor =
a different *personality*, not just a different HP bar.

- **carapace** → **Guardian**: high HP, holds position, taunts/pulls aggro, body-blocks the
  line. AI: low reposition, high retreat threshold, protects the nucleus.
- **hide** → **Skirmisher**: evasive, kites, repositions often, avoids being surrounded.
  AI: high reposition, dodges clusters, strikes flanks.
- **weave** → **Support**: lower HP, repositions toward *towers* to project an aura, avoids
  the frontline. AI: anchors near tower clusters, prioritizes uptime over kills.
- Affix examples (behavior knobs): `+aggro radius`, `lower retreat threshold`, `reposition
  toward wounded towers`, `shield burst on reposition`. Stats (HP/armor) are the garnish.

### 3.3 Relics — change a rule
Relics are global, unique interactions that subscribe to the **event bus** (`events.ts`):

- "enemies that die near the hero spread Corrosion" (`enemyKilled` hook).
- "the first tower built each wave starts Overcharged" (`towerPlaced`/`waveStarted`).
- "the hero revives once per run" (death hook).
- "boss damage is shared to nearby enemies" (`projectileHit` vs boss).
Relics are the run's rule-benders — the most build-defining, lowest-count slot.

## 4. Build archetypes (the decision space the gear creates)

Equipment exists to make these *distinct ways to play one hero* viable:

| Archetype | Weapon | Armor (AI) | Relic | Feel |
|---|---|---|---|---|
| **Frontline Anchor** | melee cleave | carapace / Guardian | aggro-pull | hold the line, body-block |
| **Skirmisher** | ranged pierce | hide / Skirmisher | mobility/dodge | dart, flank, never surrounded |
| **Support Conduit** | conduit chain | weave / Support | tower-overcharge | buff towers, control |
| **Bruiser** | melee lifesteal | carapace | revive | sustain through damage |
| **Summoner/Spread** | conduit tether | weave | death-spreads-status | turn kills into chain damage |

A drop is exciting when it *enables or sharpens an archetype* — "this lets me finally run
Support Conduit" — not when it's "+3% to what I already do."

## 5. Architecture (extends the existing equipment system)

`equipment.ts` is already the right shape: data items, `CardEffect[]` effects, `Registry`,
folded into the run's `RunModifiers` at construction (gear-less run stays byte-identical —
the golden invariant). Three adjustments make the philosophy real:

### A. Extend the effect vocabulary with behavioral ops
Same extension as stars (`PROGRESSION-PHILOSOPHY.md §3A`): beyond `add`/`mul` stats, allow
`grant` (attack mutator / ability), `set` (behavior-profile field), and `hook` (relic event
rule). Weapons emit attack mutators (shared `ProjectileMutator`/ability seam with stars);
relics emit `hook`s on the bus.

### B. A `HeroBehaviorProfile` in the run config (what armor writes)
```ts
// proposed — NOT wired
interface HeroBehaviorProfile {
  stance: 'guard' | 'skirmish' | 'support';
  aggroRadius: number;
  repositionBias: number;     // 0 = holds ground … 1 = constantly relocates
  retreatThreshold: number;   // HP fraction at which it disengages
  targetPriority: string;     // a TargetingProfile id (reuse targeting.ts)
  anchor: 'line' | 'towers' | 'enemies';
}
```
Armor (and some relics) write fields here; the **hero AI update loop reads it** — the seam
that turns "armor" into "how the hero plays." A default profile per hero ⇒ no-gear runs
unchanged.

### C. De-stat-stick the affix/set pools
Re-author `AFFIXES` and `SETS` so the majority are **behavioral** (chain/fork/on-hit/AI-knob/
rule) with a *small* bounded stat pool kept only for rounding out a build. Item `base` and
`signature` remain behavioral (already true). The interpreter already applies `CardEffect[]`;
behavioral ops extend it rather than replacing it.

### Determinism & scale
- Gear folds into the frozen `RunConfig` at start; a no-gear run is byte-identical (golden).
- Any in-sim randomness (e.g. dodge) uses the seeded sim rng, never `Math.random`.
- Scales to hundreds: each item/affix/relic is one data entry; behaviors are composed from
  shared primitives (mutators, behavior-profile fields, bus hooks) — no per-item sim code.

## 6. Differentiation guardrails (so gear ≠ stars ≠ cards)

- **vs. Tower Stars:** gear is *heroes*, swappable, drop/craft-earned, combinatorial; stars
  are *towers*, permanent unlocks with per-run forks, choice-spent. Different subject,
  acquisition, and permanence.
- **vs. Cards:** cards are *temporary* run spikes (mostly vertical); gear is *persistent*
  build authorship (horizontal/structural). Cards reset; loadouts don't.
- The **review rule** (`PROGRESSION-PHILOSOPHY.md §3G`): an equipment piece whose honest
  one-line description is "+X%" does not ship — it must change an attack, a behavior, or a
  rule.

## 7. Build order (when implementation starts)
1. Behavioral effect ops + shared attack-mutator/ability seam (with stars).
2. `HeroBehaviorProfile` in `RunConfig`; default per hero; hero AI reads it (golden-safe).
3. Re-author affixes/sets behavioral; keep a small bounded stat pool.
4. Relic event-bus hooks; author launch relics.
5. Loadout UX surfacing archetypes; verify golden byte-identical throughout.
