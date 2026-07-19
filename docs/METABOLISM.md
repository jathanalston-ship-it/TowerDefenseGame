# METABOLISM.md — the recursive progression system (Milestones)

> **"The organism digests everything."** Every lifetime quantity the account accumulates —
> kills, victories, discoveries, evolutions, and even the ACT of claiming other rewards —
> climbs an infinite milestone ladder that pays on every reached tier. Nothing here is a
> grind target; it is a gratitude ledger over normal play ("I wasn't even trying to do
> that… nice"). Core: `src/state/metabolism.ts` · Screen: `src/ui/MetabolismScreen.tsx`
> (nav `metabolism`, Rewards hub) · Save: `save.metabolism` (v51).

---

## 1. Architecture — derive-first, four counters

Every track declares `value(save) → number` over a **lifetime ledger the game already
keeps** (`stats.lifetimeKills`, `genesDiscovered.length`, `prestige.molts`, `lifetimeShards`,
`login.lifetime`, …). Derived tracks need **zero writes**: a veteran's history back-fills the
moment the screen loads, and any future ledger joins by referencing it.

Only four verbs had no lifetime ledger — the **ritual counters**, the recursive heart
(rewarding the act of collecting rewards). Each is fed by exactly ONE chokepoint in
`state/meta.ts` via `bumpCounter`:

| Counter | Chokepoint | Track |
|---|---|---|
| `containersOpened` | `openContainer` | Hatchery Habit |
| `sporesAbsorbed` | `grantRouletteRewards` (per spore) | Roulette Communion |
| `questsClaimed` | `claimQuestMission` | Directive Devotion |
| `passClaimed` | `claimPassLevel` | Season Communion |

`MetabolismSave = { counters, claimed }` — `claimed[trackId]` is the count of tiers paid
out, claimed strictly in order. Sanitizer floors counters to ints ≥ 0; `trackView` clamps
`claimed ≤ reached`, so tampered or shrunk saves clamp instead of crashing.
`claimMetabolism` itself deliberately feeds **no** counter — the recursion terminates.

## 2. The infinite ladder (curves)

Tuning lives in one const (`METABOLISM`): `thresholdGrowth 1.8`, `rewardGrowth 1.35`,
`maxTiersScanned 64` (1.8⁶⁴ ≈ 2e16 — beyond any reachable value; the scan is bounded).

- **Thresholds**: tier N's requirement is `base × 1.8^N` rounded UP onto the 1/2/5
  nice-number ladder (`nice()`), with each step FORCED past the previous (`nice(prev × 1.8)`)
  so rounding can never flatten a step. Effective per-step growth on the ladder is ×2–×2.5.
  Example (`containers`, base 5): **5 → 10 → 20 → 50 → 100 → 200 → 500 …** forever.
- **Rewards**: tier N pays `ceil(base × 1.35^N)` of each authored row. Absolute payouts
  grow every tier (claiming deeper always pays more)…
- **…but the anti-inflation invariant**: `rewardGrowth < thresholdGrowth` means reward
  **per unit of progress strictly decays** every tier (pinned by `metabolism.test.ts`:
  strict per-tier EV decrease, and EV(tier 30) < EV(tier 0)/100). Farming a track is
  always worth less than playing normally; the system engages without inflating.

## 3. Rewards — the shared interpreter, by construction

`MetaRewardType` is deliberately restricted to what `applyRewardList` (THE reward
interpreter in meta.ts) speaks: `cores · ichor · geneEssence · hiveMats · bioSpores ·
mulliganTissue · towerShardsAll · heroShardsAll · container · runCache` — plus `bpXp`,
which the claim action routes through `grantPassXp` post-persist (the claimQuestMission
pattern). `toPassRewards()` converts rows; a reward that can't be expressed can't be
authored (the dev test walks every track through the converter). `mulliganTissue` was
added to `PassReward` for this system and is now available to seasons/quests too.

**No Power.** Milestones pay currencies, containers, and season XP — never stats. The
powerScore row in the system registry is 'none' by design.

## 4. Claim flow

`meta.claimMetabolism(trackId)` — guarded (`metabolism.claim`, batch-limit 30/min):
claims **every** reached-but-unclaimed tier in one gesture (a veteran's ten-tier
back-fill is one press, not ten), pays tier by tier through `applyRewardList` (each
tier's grown qty honored), persists `claimed[trackId] = reached`, then fires the
reward-toast ceremony (identical rewards MERGE — batch claims never spam the stack).

## 5. Surfaces & discovery

- **Screen** (`MetabolismScreen`): four auto-grouped category sections
  (`META_CATS`: Conquest ⚔ · Assimilation ❈ · Evolution ⇧ · Rituals ✹), each track a
  progress-bar-dominant row (`value / nextAt unit`) with next-tier reward chips and a
  Digest CTA when ready. The hero row's CTA is the screen's ONE attention-band animator
  (`mtb-hero-breathe`, docs/INFO-HIERARCHY.md §2); curve math sits behind a `<Detail>`.
- **Nav**: `metabolism` in the **Rewards** group ('Milestones', ✹). Reveals at
  **campaign stage 8** (unlocks.ts) — after the claim rhythm exists, so the reveal hands
  a real back-fill bundle. Teach row: mechanics `metabolism`.
- **Notifications**: `metabolism.claimable` source counts reached-but-unclaimed tiers on
  the `metabolism` channel; recommendations rank it as a **claim** (score 85, between
  expeditions and harvest), so it joins the Ready Chain automatically.

## 6. Extension contract — a future system is ONE row

Add one `TrackDef` to `META_TRACKS`: `{ id, name, glyph, cat, unit, base, value(save),
rewards }`. That's the whole integration — curves, claims, guard, screen row, badge,
recommendation, and toasts are generic. `metabolismProblems()` + the dev test enforce id
uniqueness, glyph presence, reward validity, and the inflation guard; `value()` must be
monotonic non-decreasing (derive from lifetime ledgers, never spendable balances —
`lifetimeShards`, not `shards`).

## 7. Persona sim — `npm run sim:metabolism` (the curve gate)

Five personas (new ×0.45 / mid ×1 / veteran ×1.6 + 400d history / whale ×2.5 + 150d /
f2p ×0.25) accrue every track linearly for 120 days and claim daily. The four ritual
counters never prebank (no ledger existed before v51) — that is what keeps a veteran's
ladder alive after the back-fill jackpot. Gates (exit 1): day-1 back-fill ≤ 200 tiers
(veteran ~128 — one bundle, ≤22 gestures, toasts merge); steady-state ≤ 10 tiers/day;
≥1 new tier in EVERY 30-day window for every persona (2026-07 run: veteran 150/3/2/3);
window-4 core-eq < window-1 (decay); steady-state ≤ 700 core-eq/day (observed ≤ 95 —
a minor share; milestones season the economy, never carry it). Re-run after ANY change
to `METABOLISM` tuning, track bases, or reward rows.

## 8. Invariants (pinned by tests)

1. Thresholds strictly increase for every track across ≥48 tiers (rounding never flattens).
2. `tierAt` agrees with `threshold` at exact boundaries; the scan is bounded at 64 tiers.
3. Absolute reward qty is non-decreasing per tier; reward-per-threshold-unit strictly decays.
4. Every reward row converts through `toPassRewards` (or is `bpXp`).
5. v50→v51 deep-fill: an old export without `metabolism` imports clean; junk sanitizes.
6. `claimMetabolism` pays exact interpreter amounts once, refuses repeats and unknown ids.
