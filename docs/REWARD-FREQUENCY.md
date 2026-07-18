# REWARD-FREQUENCY.md — Reward Frequency Engineering (permanent design philosophy)

> **The law: maximize meaningful positive interactions per hour — never by raising values.**
> Value belongs to the economy instruments (`sim:economy`, `sim:rewards` value-flat laws);
> this framework owns the RHYTHM of a session. Every future content addition inherits it
> automatically: the instrument derives its beat rates from the live registries, and the
> bands are a build gate (`core/rewardFrequency.test.ts`).

## 1. The interaction vocabulary

Ten verbs, closed: **open · unlock · rankUp · complete · collect · claim · discover ·
evolve · prestige · progress**. Every `REWARD_SOURCES` row must classify itself in
`SOURCE_VERB` (core/rewardFrequency.ts) — `verbTotalityProblems()` fails the build on an
unclassified pathway, which is the inheritance contract at the source level: a new system
registers its reward row (already mandatory) and names its verb, and it is thereby measured.

## 2. The instrument — `npm run sim:frequency`

A minute-resolution walk of each persona's typical session (six personas: playstyle ×
spend × account band; run shapes mirror the Battle-Pass economy archetypes so both
instruments describe the same players). Beat rates are DERIVED, not authored:

- **Quest missions** — judged by the REAL weekly ring (`missionCredit` over every
  `WEEKLY_QUESTS` def with the persona's run facts; mid-week progress assumption).
- **Pass levels** — the REAL XP curve (`xpToReach`/`BP.levels`) against the mirrored
  `finishRun` XP formula (a drift breaks this test too).
- **Hub beats** — the Ready-Chain claim pass at its MEASURED tap economy
  (docs/HUB-FLOW.md §validation: chain claims ≈1.2 taps; un-chained ≈2.5).
- **In-run beats** — draft picks (~2.6 min), wave banners, boss spectacles from the
  persona's real boss counts, mid-run loot-meter fills (live `syncRunLoot`).

### The fatigue vocabulary (what "without feeling overwhelmed" means, measurably)

| Metric | Meaning | Ceiling/floor |
|---|---|---|
| interactions/hour | meaningful beats, all verbs | **25 floor · 110 ceiling** |
| max gap | longest stretch with zero beats | **≤ 6 min** (dead time) |
| taps/interaction | menu fatigue (nav cost of a beat) | **≤ 2.4** |
| choices/hour | decision fatigue (drafts, wheels, purchases) | **4 floor · 60 ceiling** |
| peak/minute | reward fatigue (flooding; toasts merge ≥4) | **≤ 10** |
| verb spread | variety — distinct verbs in the hour | **≥ 6 of 10** |

## 3. The measured baseline (2026-07)

All six personas pass every band: **53.9–64.0 interactions/hour**, max gap ≤ 6 min,
taps/interaction 0.85–0.95, choices 15–20/h, peak 4–5/min, verb spread 6–7/10. The hour
splits roughly: progress ~30 (in-run beats), collect 6–14, open ~6, complete 4–8 (runs +
quest missions ~4/h), claim ~3 (pass levels), evolve 1.5–4, discover 1–2, rankUp/unlock/
prestige sparse. Session tails and openings are the densest claim clusters — by design
(the Ready Chain front-loads banked value; Results hands the next claim onward).

## 4. Findings → redesigns (all value-neutral)

**FINDING (the one real drought):** long-run personas (grinder, 21+ min runs) settle their
last run with a 6–9 minute tail — every claim already consumed, another full run doesn't
fit, and nothing surfaced the short-form modes. The classic "what do I do now?" moment,
measured: a 7–9 minute dead window in ~0.9 of grinder sessions.

**REDESIGN — the QUICK FINISHER (wind-down handoff):**
- `rush.freeEntry` notification source (state/notificationSources.ts): today's FREE
  gauntlet entry still unused → lights the bossrush badge.
- `bossrush` CHANNEL_CLASS row (state/recommendations.ts): kind `'play'`, score 34 —
  deliberately below every claim/open/upgrade, so it surfaces exactly when the chain is
  spent: the session tail. NextUp/Recommended-Now then hand the tail a ~6-minute gauntlet
  (which banks Bio-Spores → the next session's Roulette open — the loop feeds forward).
- **Value analysis: zero new value.** The free daily entry has existed since Boss Rush
  P3 (`spendRushEntry.freeAvailable`); this only SURFACES it. No grant, no rate, no total
  changed anywhere in this initiative — the diff is one notification row, one
  recommendation row, and instrumentation.

Post-fix: every persona ≤ 6 min max gap; the band pins it forever.

## 5. The per-surface review (the brief's checklist, structural answers)

- **Every notification** — one registry (`registerNotification` sources): truth lane
  (`live()`) feeds the Ready Chain, watermark lane feeds badges; adding a source joins
  badges + recommendations + chain at once. Reviewed: all claim surfaces covered; the one
  missing PLAY-lane surface (free gauntlet entry) added above.
- **Every reward** — `REWARD_TYPES` placards + CeremonyLayer physicality: every grant
  announces and lands physically; merge windows cap flooding (peak band watches this).
- **Every currency** — `CurrencyDef` registry with machine-enforced spend domains
  (ECONOMY.md §8): each wallet has ONE home and ≥2 faucets, so income always has a
  nearby next interaction (the evolve verb's supply line).
- **Every menu** — the compressed rail + landings + Ready Chain measured at 17 taps /
  ~20 rewards desktop, 11/7 portrait (HUB-FLOW.md); the taps/interaction band keeps any
  future screen from regressing claiming into navigation.
- **Every progression pathway** — `REWARD_SOURCES` no-dead-end laws (feeds ≠ own loop,
  multi-cadence loops, 5-loop chain) + the verb taxonomy + the frequency bands: a pathway
  is connected, classified, and rhythm-measured or the build fails.

## 6. Balancing decisions log

| Decision | Rationale | Value delta |
|---|---|---|
| Quick-finisher rec at score 34 ('play') | Surfaces ONLY after claims/opens/upgrades are spent — answers the tail, never competes with the chain | 0 |
| No new mid-mission quest beats | Mission pacing measured healthy (~4 completes/hour mid-week) — splitting targets would add claims the hour doesn't need (choices/hour already 15–20) | 0 |
| Bands pinned at measured +margin | 53.9–64/h measured → 25 floor (catches starvation), 110 ceiling (catches flooding ~2× current peak persona) | 0 |
| Wind-down modeled at ≥5.5 min tails | A clipped gauntlet still fits; shorter tails cannot breach the 6-min gap ceiling arithmetically | 0 |

## 7. How future content inherits this (the contract)

1. Register the reward pathway in `REWARD_SOURCES` (already mandatory — loop laws).
2. Name its verb in `SOURCE_VERB` — totality is build-enforced.
3. If it's claimable, register a notification source — it joins badges, recommendations,
   the Ready Chain, and the measured hour with zero extra wiring.
4. `npm test` runs the bands; `npm run sim:frequency` shows the full diagnostic hour.
   A change that starves an hour (floor), floods it (ceilings), or opens a dead window
   fails the build — the philosophy holds without anyone remembering it.
