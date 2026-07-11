# DAILY-LOGIN.md — the Daily Bio-Cache (infinite compounding login streak)

> Files: `src/core/loginStreak.ts` (curve + valuation + bundle generator) ·
> `src/state/meta.ts` (`loginView` / `claimLogin`, the `login` save record v38) ·
> `src/ui/BioCache.tsx` (home widget + rupture ceremony) · codex in `src/core/collection.ts`
> ('logins'), rank source in `src/core/genomeRank.ts` ('login'), wardrobe lanes 'login' /
> 'login-drop' in `src/core/wardrobe.ts`. Tests: `core/loginStreak.test.ts`,
> `state/loginMeta.test.ts`.

Once per UTC day the hive grows a **Bio-Cache** for the commander. It is not a Day-1/Day-2
calendar: every day's reward is **procedurally generated against an internal Ichor-Value
budget**, so the *contents* vary forever while the *value* follows one auditable curve.

---

## The Ichor-Value economy (IV)

All balance lives in ONE table, `LANE_VALUE` — the IV price of one unit of everything the
cache may pay, anchored to the live economy rather than invented:

| Lane | IV / unit | Anchor |
|---|---|---|
| Genome Cores | 0.1 | Ichor Exchange pocket rate (1◆ ≈ 10 cores) |
| Gene Essence | 0.2 | between exchange (6/◆) and market bulk (4/◆) |
| Strain Sample (each) | 1/6 | Splice Market premium lot |
| Apex Genome (each) | 1/1.5 | Splice Market premium lot |
| Mutagen / Scrap / Catalyst | 0.8 / 1.2 / 2.0 | exchange scrap parity + market/hive spreads |
| Bio-Container c/r/e/l | 30 / 48 / 75 / 115 | Splice Market retail |
| Run Cache | 12 | between common and rare containers |
| Rush Stamina | 0.4 | market pack (8◆ / 20) |
| Season XP | 0.02 | ~half the level-buy retail (a faucet undercuts the store, never embarrasses it) |
| Ichor | 1 | by definition |

Cosmetics are **never** IV-priced — the jackpot is a gift on top.

## The curve — infinite, compounding, never explosive

```
target(day) = base(lifetime) × streakMult(streak)
base(L)     = 6 + 2.2·ln(1 + L/30)          — lifetime logins grow the base forever, slowly
streakMult(S) = 1 + 0.045·√(S−1)            — strictly rises EVERY consecutive day, uncapped
```

| streak | ×mult | | lifetime | base IV |
|---|---|---|---|---|
| 1 | 1.00 | | 0 | 6.0 |
| 7 | 1.11 | | 30 | 7.5 |
| 30 | 1.24 | | 100 | 9.2 |
| 365 | 1.86 | | 365 | 11.6 |
| 1000 | 2.42 | | 1000 | 13.9 |
| 3650 | 3.72 | | 3650 | 16.7 |

Pinned contracts (`loginStreak.test.ts`): mult is ×1 on day 1, strictly increasing on every
consecutive day, still growing past a decade, and a decade stays under ×4. **Missing a day
resets ONLY the streak multiplier** — lifetime count, best-streak watermark, collections,
titles and Genome Rank credit are permanent by construction (they read `lifetime`/`best`).

## The procedural bundle

`rollLoginBundle(dayKey, lifetime, streak)` is a **pure function** — preview, claim and any
reload agree, and tomorrow is previewable by rolling tomorrow's inputs. Composition:

1. **Streak-milestone container** (rides ON TOP of the budget — those days feel oversized):
   7 → rare, 30 → epic, 100 → legendary, and **every full year** (streak % 365 = 0) → legendary.
2. **2–3 weighted lanes** split the IV budget (cores 30 · essence 16 · mats 13 · strain 9 ·
   season XP 9 · apex 8 · run cache 8 · stamina 4 · ichor 3). A lane needs `minIV` headroom, so
   day-one caches never waste their budget on a Run-Cache floor; quantities are priced by
   `LANE_VALUE` with sane floors and a Genome-Core top-up absorbs rounding (Σ within ~±35% of
   target per day, mean pinned to ~1.0 across a 400-day sweep).
3. **Jackpot** (~1 in 220): one login-exclusive wardrobe drop (`login-drop` source lane —
   `Ichor Wake` trail / `Caul Filigree` frame). Already owned ⇒ the shared interpreter pays
   the replacement bundle (6◆ + 120 cores). Season XP is capped at 300/day (pace-safe).

Rewards **speak `PassReward` exactly** and are granted by the same `applyRewardList`
interpreter Battle Pass and Quests use — no new grant paths, dup conversion and repeat
safety come free. The bundle never authors `passive`/`stack`/`phenotype` (pinned).

## The day gate & clock honesty

`save.login = { last, streak, best, lifetime }` (v38, additive; sanitizer accepts only REAL
calendar keys and keeps `best`/`lifetime ≥ streak`). `claimLogin`:

- refuses while `last >= todayKey` (lexical ISO compare) — **once per UTC day**, and a forged
  FUTURE key blocks only itself and self-heals by waiting (the rushStamina convention);
- `isPrevDayKey(last, today)` ⇒ streak+1, else streak = 1;
- grants via `applyRewardList` + the Season-XP faucet (`grantPassXp('login', …)`), stamps the
  timeline, persists ONCE, then polls wardrobe unlocks (devotion titles land immediately);
- is a guarded meta action (`login.claim`, economy/strict) — the guard blunts spam, the save
  key IS the authority.

## Identity surfaces (the permanent side)

- **Devotion codex** (`logins`): 6 lifetime milestones (1/7/30/100/365/1000) + the
  `Unbroken Vigil` streak-watermark entry (7/30/100). **Zero-power** (wardrobe-codex
  precedent — attendance never buys strength); its rank-ups bleed Ichor through the shared
  collection-rank faucet, and rank 4 unlocks the `Devoted Fret` border.
- **Genome Rank**: `login` journey source (weight 40, `depth(lifetime, 0.7, 1.6)`).
- **Wardrobe**: `login` auto-lane — The Devoted (7) · Vein-Grown Plaque (30) · Standard of
  the Vigil (100) · Year-Bound (365) · Thousandth Dawn (1000).

## Presentation

Home-board widget (`bio-cache`, main zone, appears after the first run so the minute-0
funnel stays clean; `home` nav badge re-lights each UTC midnight):

- **Sealed**: pulsing organic pod + `DAY N · STREAK S · ×M` + estimated value (◆) + milestone
  tease + lapsed-streak warning. Opening plays the **rupture ceremony** — the pod grows over
  the veil (squelch), pulses until tapped (heartbeat), ruptures (crack + power), rewards
  erupt line-by-line, the unlock stinger seals the summary (jackpot adds the bell).
  Reduced-motion jumps straight to the summary.
- **Opened**: the streak presentation — current streak, best, lifetime, multiplier, today's
  paid lines, tomorrow's ×mult/value/milestone tease, and the reset countdown.

## Balance posture & known tensions

- Day-one cache ≈ 6 IV (~60 cores-equivalent) — a pleasant trickle beside run income, not a
  primary faucet; a decade-long unbroken veteran approaches ~61 IV/day, mostly in spread
  currencies. The Ichor lane itself is rare (weight 3) and clamped 2–6◆/day, far below the
  never-farmable premium posture's meaningful thresholds.
- Season XP from logins is capped (≤300/day ≈ half a level) so the pass pace stays owned by
  play, not attendance.
- The login jackpot grants boutique-grade cosmetics for free — deliberately login-EXCLUSIVE
  items so the Ichor boutique's inventory is never devalued (recorded as a DIL edge).
