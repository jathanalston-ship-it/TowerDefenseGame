# IDLE-HARVEST.md — the permanent passive lane

> **Wallet note (2026-07, ECONOMY.md §8):** this doc predates the localized-economy split in
> a few paragraphs. Canonical: Hive-Production organs price in **Chitin** (`hiveMaterials`)
> and tower Mulligan grafts in **Mulligan Tissue** (`mulliganTissue`) — the currency
> registry and ECONOMY.md §8 are the tiebreakers wherever older prose says Cores/Essence.


> **MERGED (2026-07):** the harvest is now the OUTPUT of the Hive organism — read
> **docs/HIVE-PRODUCTION.md** first (couplings, synergies, the shared living diagram).
> Everything below (accrual, tree, drops, guardrail) still holds as the production model.

> **Philosophy (the law every number below serves):** playing is ALWAYS more rewarding than
> idling. Idle progression exists to reduce friction — a returning player finds something
> banked, never a reason to stop playing. The guardrail suite (`src/core/idleHarvest.test.ts`
> §THE guardrail) enforces this against the LIVE economy at every progression band.

## Architecture

| Layer | File | Owns |
|---|---|---|
| Pure model | `src/core/idleHarvest.ts` | accrual closed forms, the cap ladder, the 10-node evolution tree, the gated drop registry, the seeded harvest roll, value pricing |
| Tunables | `src/core/config.ts` → `IDLE` | base rate, stage growth, cap ladder, offline efficiency, collect minimums, bloom, freeze window, `valuePerUnit` |
| Application | `src/state/meta.ts` | `idleView` / `collectIdleHarvest` / `buyIdleNode`; wallet writes, the lifetime ledger, guards, Account XP, achievements |
| Save | `src/save/saveStore.ts` → `save.idle` (v40) | `lastCollect` (the accrual anchor), `nodes`, lifetime ledger (`lifetimeHours`/`harvests`/`lifetimeValue`/`bestHours`/`blooms`) |
| Presentation | `src/ui/HarvestScreen.tsx` | the hub screen (hopper + tree + drops + ledger), the return-arrival strip, the pods-burst collect ceremony |

The core is pure (no DOM, no state, no `Math.random`) — the roll takes a seeded rng
(`meta` seeds it from the collect timestamps), so receipts are deterministic and testable.

## Closed forms

```
soft(L)      = 1 + per·L₀·ln(1 + L/L₀)         L₀ = 50; exactly 1 at L 0 (golden-safe)
rate(stage, rank) = 5 × (1 + 0.02·(stage−1)) × (1 + 0.04·(rank−1)) × soft(speed)
                                                core-equivalents / effective hour
capHours(L)  = [8,10,12,16,24,36,48,72][L] … then 72 + 12·(L−7)      (infinite)
effHours     = min(raw, cap) + overflowFrac·min(max(raw−cap,0), cap)  (≤ raw, always)
offlineEff   = min(1, 0.7 + 0.03·offline)       idle may APPROACH play, never pass it
budget       = rate × effHours × offlineEff × (bloom ? 2 : 1)
```

The budget is the collect's total core-equivalent value; the roll splits it into 3–6 weighted
slices and shapes each through the drop registry. `IDLE.valuePerUnit` prices every grant kind,
so `idleGrantValue` can price a whole harvest — that pricing IS the guardrail's ruler and the
ceremony's "efficiency" stat.

## §rank — the Genome Rank dividend (2026-07)

The mastery ladder feeds the harvest: every Genome Rank past I adds `IDLE.rankGrowth` (+4%)
to the rate — "the Hive harvests smarter as the organism masters more." Rank I (or an omitted
index) is exactly ×1, so fresh accounts and historical call sites are byte-stable; ranks XI+
keep paying forever (the ladder is infinite, so is the dividend). The rate already rode stage;
now the game's TWO long-arc breadth meters (campaign depth + genome mastery) both express here,
which gives deep accounts a visible reason to touch every system the rating weighs. The screen
shows the dividend as its own chip (`IdleHarvestView.rankIndex/rankBonus`), and the §guardrail
prices it (its context carries the band's realistic rank), so idle < active holds dividend-in.

## The evolution tree — infinite, soft-scaled, six-lens gated

Ten nodes (`IDLE_NODES`), every one infinite with geometric costs (×1.35–×1.6/level) and the
shared log-soft multiplier. Deeper tiers demand progression through all six gate lenses —
**Campaign, Genome Rank, Molts (prestige), Boss Rush, Collections, Power Score** — via
`IdleGateReq`/`idleGateMet`, so idle capability grows WITH the account, never around it. The
UI renders a gate as a "work toward it" label (🔒 Campaign Stage 25 unlocks L10), never a
silent grey-out.

Harvest Speed · Harvest Capacity · Rare Drop Chance · Container Chance · Crafting Yield ·
Shard Yield · Idle XP · Offline Efficiency · Overflow Storage · Special Events (BLOOM: capped
25% chance to double a collect's budget and lead with a guaranteed rare).

## The drop registry — the future-proofing contract

A future resource becomes an idle drop by adding **one row** to `IDLE_DROPS` and one
apply-case in `meta.applyIdleGrant`:

```
{ id, name, icon,
  weight,          // relative roll weight among eligible rows
  minCampaign?,    // eligibility gate: campaign stage
  minGenomeRank?,  // eligibility gate: 1-based genome rank index
  rare?,           // rides the Rare Drop node + BLOOM's guaranteed pick
  minValue?,       // affordability floor — see §guardrail (anti-dust-farm)
  grant(value, rng) → IdleGrant }   // shape a value slice into a concrete grant
```

Launch rows: Genome Cores (always) · Crafting Materials (st 4) · Gene Essence (st 3) · Strain
Samples (st 2) · Apex Genome (st 5) · Mulligan Modifiers (st 12 + rank 3, rare) ·
Bio-Containers (st 8, rare) · Run Caches (st 10, rare) · Ichor (st 20 + rank 5, extremely
rare — 1–3 per hit). Tower shards bank via the pool even on maxed lanes (Prime fuel);
duplicate-preferring mulligan rolls fall back to essence.

**Deliberately absent: Bio-Roulette spores.** Spores are minted from Boss Rush run results —
a record-chase identity currency that is never banked — so idling must not dilute them. A
future banked spore wallet would be one registry row.

## §guardrail — the numbers

The active ruler is deliberately the WEAKEST honest lane: campaign **replay** cores only
(mode ×0.3), a modest run priced by the live `coreShardIncome` × the stage's real
`rewardMult`, a lazy 2 runs/hour, and none of active play's other faucets. Idle (measured by
Monte-Carlo over the real roll, at node depths generous for each band, collected at the
optimal cadence) must stay under **25% of that floor** — so under a few percent of real
active play:

- Idle grows +2%/stage; active rewards grow +5%/stage → at fixed node depth the share decays.
- Node soft-scaling is log-bounded: the structural crossover sits near L≈100,000
  (cost ≈ 60×1.35^100000 cores — unreachable by construction).
- **Anti-dust-farm:** fixed-price grants (containers, caches, mulligans) and batch grants
  (shards × roster) ignore slice size, so each such row carries a `minValue` floor ≈ half its
  real value. Without it, spam-collecting 5-minute dust would mint full-priced containers;
  with it, dust collects pay only proportional trickle (the test pins both the spam bound and
  that spamming never beats the honest cadence).

## §integrity — the clock model

Client-only idle games cannot fully trust the device clock; this is the bounded-trust design:

- **The anchor (`idle.lastCollect`) is monotone** — it only ever moves forward, by a real
  collect. A rolled-back clock pays nothing and does NOT rewind the anchor (rewinding would
  let the same wall-clock span be farmed in a loop); accrual resumes when real time passes it.
- **A future anchor freezes accrual** — that freeze IS the price of a forward-forged clock,
  and it survives reloads. On load (and live) an anchor stranded more than
  `IDLE.tamperFreezeMaxHours` (48h) ahead clamps to now + 48h, so a legitimately wrong device
  clock (dead CMOS, timezone chaos) costs at most two frozen days instead of bricking the lane.
- Junk/absent anchors seed to NOW (migration starts the clock at the update — no
  retroactive grant); node levels and the lifetime ledger sanitize to whole non-negatives.
- Residual risk, accepted: pure forward-faking mints cap-bounded idle value — a deliberately
  weak lane (§guardrail), throttled by the freeze window, and cheatable only against oneself.
  The cloud-save backend can add server-time validation later without a schema change.

## §presentation — never a boring popup

- **The hopper** (`HarvestScreen`): living veins fill toward the cap, live rate / offline
  efficiency / full-ETA, HARVEST disabled until the 5-minute warm-up.
- **The arrival** (`HarvestArrival`, mounted by the Hub once the screen is revealed): a
  once-per-session strip when ≥30 banked minutes await — Harvest or Later.
- **The ceremony** (`HarvestCeremony`): pods hatch with glow rings, LABELLED stat blocks
  (away / banked / efficiency, BRIMMED as a badge with grow-storage tooltip), then the haul.
  Receipt rows are MERGED before display (`mergeIdleReceiptLines`, core/idleHarvest.ts): one
  row per thing — repeat rolls of the same lane sum ("28 Genome Cores", never two "14"s),
  materials combine into named chips with zero components DROPPED (no "0 Catalyst" noise,
  an all-zero roll vanishes), currencies render their real `CurrencyIcon` with the amount as
  the loudest element, discrete finds (containers, modifiers, caches) stay individual with
  rare framing, and Account XP sits as a quiet dashed footer. Order: currencies → shards →
  materials → specials — a haul, never a log. BLOOM variant goes gold with a one-line
  explanation; the "GROW NEXT" chip is a labelled call-to-action (kicker / node / cost).
- **The grow ceremony** (NodeCard): a successful node buy must FEEL like biology taking —
  the `graftCrack` cue (the house upgrade sound; the old `'upgrade'` id was unregistered and
  silent), a caustic ring bursting off the card, the glyph swelling, and the new level flaring
  white→gold (card remounts per buy so re-buys re-trigger). Affordable Grow buttons breathe;
  a BRIMMED hopper pulses the HARVEST button until pressed. All of it stills under
  prefers-reduced-motion; feedback is in-place (never a toast — the single-owner rule).
- Reveal: hub screen `harvest` at campaign stage 6 (one beat after the stage-5 retention
  screens), teach row `idle-harvest`, badge `idle.ripe` on the harvest channel (cheap
  timestamp math only).

## §identity — collections, achievements, genome rank, cosmetics

- **Idle codex** (`collection.ts` 'idle'): 4 harvest-count milestones + 3 watermarks (lifetime
  hours, best single harvest, blooms). STRICTLY identity — zero Power, zero run bonuses (the
  logins precedent: the harvest itself is the economy payout; anything else would pay idling
  twice). Completion badge "Keeper of the Hopper", mastery title "The Perpetual".
- **Achievements:** `idle_first`, `idle_hours24/240/2400`, `idle_brimmed`, hidden
  `idle_bloom`, `idle_tree25`.
- **Genome Rank:** journey source `idle` (weight 35, heavily decelerated —
  `depth(hours, 0.55, 3)`) reads lifetime banked hours; advisor step ≈ a week of base caps.
- **Cosmetic:** the "Sleepless Hive" emblem at Gold rank in the idle codex (wardrobe
  `collection` source).
- **Profile:** an "Idle Hours Banked" ledger row beside the collection stats.

## §invariants (pinned by tests)

- Fresh save: zero everywhere — no idle Power, no codex bonuses, soft(0)=1, the clock starts
  at first load (`idleMeta.test.ts` §golden-safe).
- `effHours ≤ rawHours` always; `offlineEff ≤ 1`; overflow ≤ half a cap-width.
- The collect is ONE atomic persist: wallets + ledger + anchor + timeline move together.
- Container-class lines ≤ 2 per collect; rolls deterministic from the seed.
- Idle < 25% of the weakest active lane at every band (`idleHarvest.test.ts`).
