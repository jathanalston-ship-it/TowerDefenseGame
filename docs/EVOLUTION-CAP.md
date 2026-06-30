# EVOLUTION-CAP.md — Campaign-gated Tower Star evolution (progression philosophy)

How high a tower may **evolve** (its Star tier) is gated by **Campaign progress**, not by
Tower Shards alone. Shards are still the *fuel*; the Campaign is the *permission*. This is
the spec; it is written before the implementation, per the brief.

Companion to `SHARD-ECONOMY.md` (the shard cost curve), `TOWER-STARS.md` (what each star
*does*), `CAMPAIGN.md` (the procedural stage ladder), and `PROGRESSION-PHILOSOPHY.md`
(the master pillars). Authoritative over the code: `src/core/config.ts` (`EVOLUTION_CAPS`,
`campaignStarCap`) implements these numbers; `src/state/meta.ts` enforces them.

---

## 1. The problem it fixes

Before this change a tower's Star cap was **only** the Shard wall (`STAR.maxTowerStars = 10`,
gated by `towerStarCost`). Shards rain from Infinite mode and loot boxes, so a player could
max a carry to ★10 **without ever touching Campaign**. That makes the Campaign — the
authored, scaling, *intended* spine of the game — **optional**. Optional content is dead
content.

## 2. The pillar

> **Campaign is the permission slip for power. Shards are the fuel.**

You may **collect** Tower Shards anytime, from anywhere (Infinite, loot, caches). But a Star
**cannot be purchased beyond the current Evolution Cap** until the matching **Campaign
milestone** is cleared. The two currencies of progress — *fuel* (Shards) and *permission*
(Campaign stages) — must **both** be satisfied. This makes Campaign **mandatory for
long-term progression** while leaving Infinite fully playable as the grind/fuel loop:
Infinite naturally becomes **progression-limited** the moment a player out-runs their
Campaign clears, which is exactly the pull back into Campaign we want.

## 3. The Evolution Cap curve

Clearing a Campaign milestone permanently raises the **maximum Star** any tower may reach.
A new cap is **a new generation of biological mutation** — it should feel like the species
itself just became capable of evolving further, not like a number ticked up.

| Highest Campaign stage cleared | Evolution Cap | Generation feel |
|---:|:---:|---|
| 1 (start) | **★2** | first viable mutations |
| 10 | **★3** | specialization opens (the ★3 fork) |
| 25 | **★4** | — |
| 50 | **★5** | fully-evolved base form (★5 capstone) |
| 80 | **★6** | ascension begins |
| 120 | **★7** | — |
| 170 | **★8** | — |
| 230 | **★9** | — |
| 300+ | **★10** | apex organism (absolute cap) |

`campaignStarCap(highest) = maxStar of the last EVOLUTION_CAPS row with stage ≤ highest`
(defaults to the first row, ★2, for a fresh account so new players can still evolve to ★2
immediately). The curve is **data** (`EVOLUTION_CAPS`) — rebalanceable in one place, and the
last row is the only place the absolute cap (★10) is defined.

**Why these breakpoints.** Early caps come fast (★2→★3→★4 by stage 25) so new players feel
the system within a few sessions; late caps stretch hard (★8 at 170, ★10 at 300) so the
top of the ladder is a genuine long-horizon, Campaign-driven trophy — matching the steep
Shard curve from `SHARD-ECONOMY.md` (★10 ≈ 10,230 Shards) so neither gate is the sole wall.
The values are tunables; this table is the starting balance.

**Cross-difficulty.** The cap reads the **highest stage cleared on *any* difficulty track**
(`max` over `save.campaign.cleared`). A stage number is a stage number; clearing stage 50 on
any variant proves the mastery the cap is rewarding. Adding a difficulty just adds another
track to the `max` — zero cap-code changes (scalability).

## 4. What the player sees (UI contract)

A Star above the current cap is **never just greyed out**. The Tower Lab always shows what
you are working toward, so the cap reads as *aspiration*, not *denial*:

- **Required Campaign Stage** — "Reach Campaign Stage 50".
- **Current progress** — your highest clear vs. that stage (a progress bar).
- **Unlock preview** — the next Star's name + what it grants (the evolution).
- **Upcoming ability** — the next star that grants a new attack/ability (may be further up).
- **Upcoming visual mutation** — the generation the tower is about to enter
  (`STAR_MUTATION_TIERS`: Minor ★3 / Large ★5 / Advanced ★7 / Ultimate ★9), so the *look*
  of the reward is previewed too (ties into `TOWER-VISUAL-EVOLUTION.md`).

Shards-affordable-but-cap-locked is a distinct state from can't-afford: the button reads
"🔒 Campaign Stage N", not "too poor".

## 5. Excitement: unlocking a new generation

Raising the cap is a **headline moment**, not a silent threshold. When a Campaign clear
crosses an `EVOLUTION_CAPS` breakpoint the player should be told a **new Evolution Tier** is
available account-wide ("Towers can now evolve to ★5 — Fully Evolved"). The towers that were
parked at the old cap now have a live "Mutate" button again — the pull straight back into the
Lab. (Hook: surfaced via the existing notification/anticipation systems; see implementation.)

## 6. Invariants & compatibility

- **Golden-safe.** A fresh account has 0 stars ⇒ empty kit ⇒ byte-identical runs. The cap
  only ever *blocks a purchase*; it changes no sim math.
- **Never strands owned power.** The cap blocks **buying past** it; it never **removes** stars
  already owned (e.g. from a save predating this rule, or a future cap re-tune). `buyStar`
  refuses at the cap; it never refunds or downgrades.
- **Additive save.** No new save fields — the cap is *derived* from `save.campaign.cleared`
  (already persisted, `CAMPAIGN.md §7`) and `save.towerStars`. Nothing to migrate.
- **One source of truth.** `EVOLUTION_CAPS` (config) is the only table; `meta.evolutionStarCap`
  is the only reader the UI and the buy-path share, so they can never disagree.
