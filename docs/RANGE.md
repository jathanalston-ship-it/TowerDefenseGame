# RANGE.md — Tower Range Philosophy & The Final Defense Zone

Status: **design adopted** (this pass). The numbers here are the source of intent;
the live tunables are in `src/core/config.ts` (`TOWER_DEFS`, `FINAL_DEFENSE`). When a
value below and the config disagree, the config is what ships — update both together.

---

## 1. The problem we are fixing

The battlefield is **vertical**: enemies spawn along the TOP edge (`y ≈ 20`) and flow
~920px DOWN to the line at the bottom (`y = 940`), where the **Hive Core / Nucleus**
sits (`map.ts`). Towers may only be built in the bottom defensive region — slot rows at
`y ≈ 780 / 860 / 940`.

Historically **every tower had a similar ~120–175px circular range**. On a 960px-tall
map that means *every* tower could only ever engage the bottom ~1/5th of the approach,
and they all engaged the **same** sliver. Consequences:

- **Range upgrades felt pointless** — a slightly bigger circle in a zone enemies cross
  in two seconds changes nothing.
- **Tower identity collapsed** — five towers with different damage types but the *same*
  spatial footprint play almost identically; placement is interchangeable.
- **The vertical map went unused** — 80% of the lane was a no-man's-land no tower could
  touch.

## 2. The new philosophy: range **is** identity

> Each tower class owns a **distinct vertical engagement band** of the approach. Where a
> tower can fight is as defining as what damage it deals. Range is a primary design axis,
> traded against DPS, cadence and cost — never a free stat.

This turns the long vertical lane into a layered gauntlet: artillery and marksmen open
fire near the spawn, a control field blankets the mid-lane, skirmishers bite the
mid-field, and a support core anchors the back. An enemy runs a *spectrum* of threats on
its way down instead of one wall at the bottom.

### The range ↔ power trade (why this is balanced, not just "bigger circles")

Total damage a single tower deals to one enemy ≈ **DPS × time-in-range**. Long range
multiplies time-in-range several-fold, so long-range classes **must** pay it back with
lower DPS, slower cadence, or higher cost. The design law:

| Reach | Pays with |
|---|---|
| Full-map / very long | low sustained DPS **and** slow cadence **and** higher cost |
| Medium | moderate DPS; must be placed forward to use its band (positional risk) |
| Very short (support) | deals no direct damage — buys the band back as utility |

The result: a long-range tower is a **continuous chipper / softener / tagger**, not a
burst-killer. Burst still exists, but you earn it with forward placement (medium range)
or by stacking the long-range taggers into the kill zone.

## 3. Per-class specification

All five classes are now spatially distinct. Coverage is measured from the **forward**
slot row (`y ≈ 780`); from the back row subtract ~160px of reach.

| Tower | Class | Role | Range | Reaches (from front) | Cadence | Dmg | Real value | Cost |
|---|---|---|---:|---|---:|---:|---|---:|
| **Bone Mortar** | Caustic | Artillery | **960** (full map) | the entire lane, incl. the spawn | 2.1s (very slow) | 8 AoE (r60) | area denial — AoE softening + Corrosion pools | 170 |
| **Needle Spitter** | Kinetic | Marksman | **700** (very long) | `y≈80` → line (almost the whole lane) | 0.40s (fast) | 3 | continuous chip + Fracture (armor shred) on the whole lane | 100 |
| **Neural Obelisk** | Neural | Control field | **360** (very large radius) | a wide control bubble over the mid/low lane | 1.1s pulse | 5 | Disruption (slow + Vulnerability) — amplifies ALL your damage | 165 |
| **Parasite Nest** | Viral | Skirmisher | **280** (medium) | `y≈500` → line (the mid-field) | 0.85s | 6 | Infection — ramping armor-ignoring DoT, blooms over the long walk | 130 |
| **Flesh Reactor** | Vital | Support | **~90** (very short) | adjacent slots only | — | — | overcharges adjacent towers (+dmg, +rate) | 120 |

> Damage is deliberately *low* on the long-range classes — they **soften and tag the
> whole lane, they do not solo it**. The kill happens down-lane where Obelisk
> Vulnerability, Parasite Infection and the hero converge. Verified with the `simharness`
> sweep: each tower is independently functional in its band (Needle ~29% Fracture uptime
> solo; Obelisk ~36% Disruption + Parasite ~16% Infection in a control build), the run
> stays winnable, and tower choice now meaningfully changes outcomes.

### Bone Mortar — *Artillery (full-map)*
Essentially unlimited coverage: it lobs a shell at the enemy nearest the line **anywhere
on the map**, so it begins suppressing from the moment a wave spawns. The **slow 2.1s
cadence** is the balance — low shells-per-minute, but each is an AoE thump that leaves a
Corrosion pool, making it the lane's area-denial / softening layer. Highest cost.

### Needle Spitter — *Marksman (very long)*
Nearly full-map reach, so from a forward slot it **opens fire shortly after enemies
spawn** and peppers them the whole way down. Per-shot damage is deliberately low; its
value is **continuous Fracture stacking** over the long approach — armored enemies arrive
pre-shredded for everything else. Fast cadence = fast Fracture. Cheapest, because it
chips rather than kills.

### Neural Obelisk — *Control field (very large radius)*
The **largest support footprint** in the game — a wide Disruption bubble that slows and
applies Vulnerability (amplifying ALL your damage) across a big swath of the lower/mid
lane. It does not need to kill; it makes everything else hit harder and buys time. Priced
as the premium control anchor.

### Parasite Nest — *Skirmisher (medium)*
A medium band that only reaches the **mid-field when placed forward** — so it **rewards
forward placement** (and the exposure that comes with it). Seeds Infection that ramps as
the enemy continues its long walk, so a mid-field tag blooms into heavy armor-ignoring
DoT by the time it reaches the line.

### Flesh Reactor — *Support (very short)*
**Very short range by design** — it deals no direct damage; it overcharges neighbouring
towers (+damage, +fire-rate). Its "range" is realized as **slot adjacency** (the shortest
band possible; the renderer shows a small ~90px support radius that matches the adjacent
slots). Anchored to the backline cluster it buffs.

> Distinct bands, smallest → largest: **Reactor 90 < Parasite 280 < Obelisk 360 < Needle
> 700 < Mortar 960.** No two towers share a footprint, so placement and range upgrades now
> carry real, legible meaning.

## 4. The Final Defense Zone & Emergency Defense Mode

A long-range meta has a failure mode: if a tower covers the whole lane, what makes the
*last* metres special? Answer — an explicit **last-stand** band with its own rules.

### 4.1 The zone
The **Final Defense Zone** is the red band of the arena nearest the Hive Core — the
bottom `FINAL_DEFENSE.fraction` of the map (config; default **0.14** → `y ≥ 800`, the
bottom ~4 rows, full width). It is the inner portion of the defensive region: the point
past which a leak is about to breach the core.

### 4.2 Emergency Defense Mode (the targeting override)
**Whenever any enemy is inside the Final Defense Zone, the Hive enters Emergency Defense
Mode.** While active:

- **Every offensive tower gains unlimited targeting range against enemies inside the
  zone** — range is ignored for in-zone targets, so even back-row towers can fire on a
  breacher anywhere in the band.
- **Target priority** becomes:
  1. **Enemies inside the Final Defense Zone** (absolute priority — every offensive tower
     redirects to the breach).
  2. **Nearest enemy to the Hive Core** (among in-zone enemies — kill the deepest threat
     first).
  3. **Existing per-tower targeting behavior** (the normal, non-emergency path).
- **Only in-zone enemies receive the override.** Enemies outside the zone keep using each
  tower's normal targeting/range. When the zone clears, towers instantly resume normal
  behavior.

"Offensive tower" = a tower that fires at a chosen target (Needle / Mortar / Parasite).
The Obelisk (a control *field*, no single target) and Reactor (support) are unaffected —
the override is about target *selection*, which only those three perform.

This represents the Hive throwing everything at a core breach: a brief, intense focus-fire
that swats the leaker, then releases.

### 4.3 Efficiency & scalability
The in-zone enemy set and the "nearest to core" ordering are computed **once per tick**
(`O(enemies)`), then **shared by every tower** — towers do not each re-scan the field.
Acquisition stays gated by each tower's fire cadence (target picking only runs when a
tower is off cooldown), so emergency mode adds no per-tower scan cost. It scales to the
600-enemy budget unchanged.

### 4.4 Visual feedback (Emergency Defense Mode) — *restraint is the rule*
Players must recognise the emergency **instantly**, without the screen turning to noise.
The full feedback set, each gated behind a smooth fade-in (`emergencyRamp`) so it eases in
and out rather than popping:

- **Subtle red warning pulse** washing the Final Defense Zone (low alpha, slow pulse).
- **The Hive Core glows brighter** (its existing glow intensifies — the heart of the
  alarm).
- **Targeting beams briefly redirect** — short, fading lock-on lines from offensive towers
  converging on the deepest in-zone threat (the "everything swings to the breach" read).
- **Towers rapidly acquire new targets** (a natural consequence of the override; the beams
  make it legible).
- **An emergency UI indicator** in the HUD (a compact pulsing "⚠ EMERGENCY DEFENSE" badge).
- **A slight battlefield warning animation** at the zone's top edge (the "HOLD THE LINE"
  line escalates to an alert).

Explicitly avoided: particle bursts, full-screen flashes, or per-enemy beam spam — these
would bury the signal. Convergence-to-one-focus + a soft red wash + a brighter core + one
badge is enough to read "the Hive is making its final stand" at a glance.

## 5. Risks & follow-ups

- **Balance is verified, not assumed.** The rebalance is checked with the `simharness`
  sweep (win-rate / kill-rate / leaks / status uptime) before and after; numbers above are
  tuned to keep a baseline strategy winning while raising status uptime (towers now engage
  far longer). See `docs/BALANCE-NOTES` in the sweep or re-run the harness.
- **Reactor range is nominal.** Its mechanic stays slot-adjacency (no change to the
  overcharge system); the ~90px radius is a faithful *visual* of that adjacency, not a new
  query. Promoting it to a true radius query is a clean future option.
- **Emergency overkill.** Every offensive tower focusing one breach can "waste" damage
  while new enemies advance unblocked; in practice the breacher dies fast and the zone
  clears. Tuned via the zone fraction (smaller = rarer, more dramatic; larger = more
  frequent).
- **Obelisk reach during emergency** is intentionally *not* overridden (it has no single
  target). If a future design wants the control field to also snap to a breach, the seam is
  the same per-tick in-zone list.
