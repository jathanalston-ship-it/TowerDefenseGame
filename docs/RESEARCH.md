# RESEARCH.md — Field Research (optional rewarded ads)

The OPTIONAL rewarded-ad lane, themed inside the fiction: the hive reviews surveillance
footage of corporate specimens ("conducts field studies") and is paid in samples. It is a
**small daily accelerator that always supplements and never gates** — the game is balanced
around play first, and every rule below exists to keep it that way.

## Design law (enforced by `state/research.test.ts`)

- **Never mandatory, never punished:** nothing in the game references unclaimed studies;
  no system's baseline assumes them; ignoring the lane forfeits nothing you were owed.
- **Never optimal:** a fully-claimed day is a small fraction of one normal run's take.
  Boost multipliers are capped ≤ ×1.25 by the registry validator.
- **Never a store substitute:** Ichor is a FLAT trickle (1/claim, 2/day + the once-daily
  emergency 3) — ≤ 5/day ≈ $0.20 at the base rate; it never scales with progression.
- **Never in combat, never auto-played:** surfaces exist only in menus (Market, Daily,
  Boss Rush, end-of-run Results) and every study is player-initiated.
- **Money safeguards inherited:** grants flow through the Premium Store's
  `interpretGrants` pipeline, so its caps (epic-max equipment, no prestige minting, no
  campaign skips) apply automatically.

## The catalog (core/research.ts — a registry; new rewards are data rows)

| Category | Pool/day | Rewards | Notes |
|---|---|---|---|
| A · Samples | 5 | Core Sample · Tissue Harvest · Essence Extraction · Ichor Trace | amounts ×scale; ichor flat, own cap 2 |
| B · Boosts | 2 | Mastery Focus +10% tower XP · Apex Observation +15% hero XP · Specimen Bounty +10% run cores · Nutrient Wash +5% biomass | one-run, armed → consumed by the next FINISHED run |
| C · Specimen | 1 | Sealed Specimen (Bio-Container) | rarity = deterministic per-day roll (common, ~1-in-5 rare; NEVER epic+) |
| D · Stamina | 1 | Stamina Infusion (+10 Rush Stamina) | gated on Boss Rush; capped grant pipeline |
| E · Emergency | 1 | player CHOOSES: 3 Ichor · container · doubled cores · a boost | the daily "what I need today" valve |

**Scaling** (`researchScale`): sample amounts ×(1 + 0.05·stage + 0.25·molts +
1.5·collection), clamped [1, 8] — payouts stay USEFUL at endgame without outpacing play.
Ichor is excluded by design.

**Rollover:** all counters key on the UTC day (same identity as the Daily Run); a stale
day reads as zero and resets on the next claim.

## Boost mechanics (golden-safe)

Armed boosts live in `save.research.pendingBoosts` (ids). They fold meta-side only:
`masteryXpMults`-adjacent folds in `finishRun` (tower/hero XP, run cores) and
`metaModifiers` (biomass ×1.05) — the deterministic sim never reads them, and a fresh
save is byte-identical (golden suite proves it). `finishRun` clears the arms, so exactly
one finished run benefits; abandoning consumes them too (no banking exploits).

## Providers (src/ads/provider.ts)

The game only ever talks to `RewardedAdProvider` (`ready()` / `show() → completed |
aborted | unavailable`). `VITE_ADS_PROVIDER` selects the adapter:

- `none` (launch default) — every Field Research surface is hidden; the game carries
  zero ad code paths for players.
- `simulated` — a themed in-page observation timer for dev/preview: exercises caps,
  claims, reveals and analytics end-to-end with zero network.
- `google` — Google H5 Games Ads (Ad Placement API), fully wired
  (`src/ads/googleAdapter.ts`): rewarded `adBreak` flow, defensive against blockers /
  no-fill / caps (all resolve 'unavailable' and grant nothing). Enable with
  `npm run set-ads -- google --client ca-pub-…` (swaps CSP, writes ads.txt, configures
  the site slots) + the two `VITE_ADS_*` env vars. Requires an APPROVED AdSense account
  — until approval, studies quietly report unavailable. End-to-end network verification
  can only happen on the approved domain; `simulated` remains the loop's test path.
- Other networks (Applixir, AdinPlay, …): one adapter class + a provider branch +
  set-ads CSP hosts. No game-code changes beyond the adapter (registry + seam).

An aborted or failed study grants nothing. Claims happen strictly AFTER `completed`.

## Surfaces

Market → **Research Samples** section (`FieldResearchPanel`): remaining claims per pool,
UTC reset countdown, scale badge, armed-boost row, the emergency choice, and the reveal
ceremony (staggered lines + chest audio — the store's celebration language). Compact
`FieldResearchCard` entries: Daily screen (boost), Boss Rush screen (stamina), Results
(sample). Command Center reach-through: the Market nav badge.

## Analytics (docs/WEBSITE.md §analytics)

Local: `save.research.lifetime` (views + per-reward claims). Aggregate: `research_view`,
`research_abort`, `research_claim`, `research_claim:<id>` counters via `/api/events` —
enough to see usage, most-chosen rewards, completion rate and day-over-day retention
impact with zero identifiers. Balancing decisions ride these counters.

## Expandability

A holiday/event/creator reward = one `ResearchRewardDef` row, optionally with
`window: { from, to }` (auto-appears/disappears), optionally gated (`requires`). New
currencies ride the existing `PremiumGrant` vocabulary. No code changes.
