# CAMPAIGN EVENTS — the authoring seam

> **Status: implemented (first tranche).** The procedural campaign (`generateStage`) was pure
> stat-scaling — every stage the same board with bigger numbers, **zero** authored encounters. This
> adds the seam the roadmap flagged (`docs/CONTENT-ROADMAP.md` Wave 0): a small **`CampaignEventDef`
> registry** that `generateStage` samples deterministically, so specific stages carry an authored
> identity. **A data registry, not a mode** — a new archetype is one row in `CAMPAIGN_EVENTS`.

---

## The four archetypes

| Kind | Name(s) | What it does | Lever it rides |
|---|---|---|---|
| `eliteRush` | Elite Rush · Apex Pack | Most composed packs arrive **elite** (fewer-but-stronger); richer pay | promotes group `elite` flags + raises the displayed `eliteFrequency` (clamped to the 0.45 cap) |
| `gauntlet` | Boss Gauntlet · The Triad | 2–3 **extra champions** anchor mid-stage waves — a run of bosses, not just the finale | `StageConfig.bossWaves` (the same per-wave-boss lever the Daily Run uses) |
| `cache` | Genome Cache · Mother Lode | A **reward stage**: a fat opening economy + a rich end-of-run haul | `startBiomassBonus` (opening) + an `event.rewardMult` stamp folded at payout |
| `mutation` | Adaptive Strain · Symbiotic Bloom · Volatile Mutagen | An authored **A/B choice** — pick one run-scoped boon before deploying | resolved to `CardEffect[]`, folded into the run's global run-effects |

---

## Architecture

`src/core/campaignEvents.ts` (pure — `Rng` + `hash` + types only, no sim/DOM):

- **`CampaignEventDef`** — one archetype: `id`, `kind`, telegraph (`name`/`desc`/`icon`/`accent`),
  `weight`, `minStage`, and optional **lever knobs** (`eliteMult`/`elitePromote`, `gauntletBosses`/
  `gauntletTierFrac`, `rewardMult`/`startBiomassBonus`, `boons`).
- **`CAMPAIGN_EVENTS`** — the registry (9 defs across the 4 kinds today).
- **`campaignEventForStage(stage, difficulty)`** — the sampler. Pure, deterministic, from a
  **dedicated seed stream** (`0x43455654` salt) independent of the stage's own rng.
- **`campaignEventStamp(def)`** / **`resolveCampaignBoon(boons, id?)`** — display stamp + boon pick.
- **`CampaignEventStamp`** — the resolved, display-ready stamp placed on `StageConfig.event` and
  `CampaignMapNode.event`; carries only what the renderer / payout / mission-card choice still need.

`generateStage` (`src/core/campaign.ts`) builds the base `StageConfig` **exactly as before**, then:
`const ev = campaignEventForStage(st, diff); if (ev) applyCampaignEvent(cfg, ev, dedicatedRng)`.
`applyCampaignEvent` (local to campaign.ts, where `assembleBoss`/`ENEMY_DEFS`/`C` live) folds the
levers and sets `cfg.event`.

### The layering discipline — base curve is sacred

Mirroring `runEvents.ts`, **events layer on**. `applyCampaignEvent` writes ONLY to separate
`event` fields and to levers the sim already consumes (group `elite` flags, `bossWaves`,
`startBiomassBonus`). It **never** touches `scaling`, `enemySpeedMult`, or the base `rewardMult` —
so `campaign.test.ts`'s smooth-progression + `eliteFrequency ≤ 0.45` invariants hold unchanged.
Cache/Gauntlet reward bonuses ride `event.rewardMult` (a **separate** field) folded at payout, not
the base reward curve.

### Eligibility & cadence

`campaignEventForStage` returns `null` for **most** stages. A stage is eligible only when: `stage ≥ 4`
(onboarding stays clean), **not** a milestone stage (`stage % milestoneEvery`), and **not** an
authored-boss stage (`campaignBossFor(stage)`) — so events never clash with existing hand-crafted
set-pieces. Eligible stages carry an event ~34% of the time (`EVENT_CHANCE`): punctuation, not noise.

---

## Consumption (who reads what)

- **Sim** (`game.ts`): `bossWaves` → per-wave boss spawns; `startBiomassBonus` → opening Biomass;
  elite group flags → elite spawns. All **pre-existing** consumption — no new sim code.
- **Payout** (`App.handleEnd`): `result.rewardMult = base × (event.rewardMult ?? 1)`.
- **Boon** (`App.startCampaign(stage, boonId?)`): the chosen mutation boon's `CardEffect[]` fold into
  `effectsRef` (the run's global run-effects) via `begin(mode, stage, extraRunEffects)`.
- **UI** (`CampaignScreen`): the descent-map node shows an event **badge** (`CampaignMapNode.event`);
  the mission card shows the **telegraph** (name/desc/reward), and for `mutation` a compact **A/B
  picker** (`boonPick` state) threaded into `onStart(stage, boonId)`.

## Golden-safety

`generateStage` is only called by campaign/daily. The golden autoplay is `new Game(seed, NO_META)`
with **no** `opts.stage`, so `this.stage` is null and none of the consumption fires. A no-event stage
is byte-identical to before (dedicated event rng; base stream untouched). Verified: `golden.test.ts`
+ `campaign.test.ts` stay green; `campaignEvents.test.ts` pins the seam.

## Extension points

- **New archetype / variant:** one `CAMPAIGN_EVENTS` row. New mechanical lever → add an optional
  knob to `CampaignEventDef` + a branch in `applyCampaignEvent`.
- **New boon:** add to a mutation def's `boons` (any `CardEffect`). Power-relevant fields must extend
  `POWER_RELEVANT_FIELDS` if they should count toward the index.

## Known limitations / future hooks

- Mutation choice is pre-stage (mission card), not an in-run modal — deliberate (reuses the existing
  run-effect seam; no new sim modal).
- Events are single-archetype per stage (no stacking) and don't yet feed the collection/codex or
  achievements — natural next hooks.
- Rewards for Gauntlet's added difficulty are a flat `rewardMult` stamp, not power-indexed.
