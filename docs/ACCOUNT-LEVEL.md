# ACCOUNT-LEVEL.md — the infinite meta-progression lane

> System: `account-level` · Code: `src/core/accountLevel.ts` (pure) + `src/state/meta.ts` (fold)
> · UI: `src/ui/components/AccountXpBar.tsx` · Tests: `src/core/accountLevel.test.ts`,
> `src/dev/progressionSim.test.ts` (economy guards), `functions/backend.test.ts` (boards).

One number that measures **long-term play itself** — not strength (Power Score), not depth
(Campaign), not a reset loop (Prestige): dedication. Nearly every meaningful activity pays
Account XP; every level pays a procedurally generated reward; milestone levels celebrate big.
It **never caps**.

## Design contracts (all machine-enforced)

| Contract | Enforced by |
|---|---|
| No cap; smooth spike-free power-law curve; overflow-safe ≥ L100 000 | `accountLevel.test.ts` §curve |
| Reward value grows **slower** than XP requirement (n^0.7 vs n^1.25) | §rewards + sim guard (≤ 15 % of lifetime cores) |
| Every level pays something (guaranteed core floor) | §rewards (levels 1–400 swept) |
| Rewards deterministic per level (shared previewable ladder, no save RNG) | §rewards |
| Milestones infinite (named tiers, then every 500 past 1000), always one ahead | §milestones |
| The lane moves every persona band and decelerates per hour | `progressionSim.test.ts` |
| Save-compat: `accountXp` sanitized, level always **derived** from XP | `saveStore.ts` `sanitizeAccountXp` |

## The curve

`xpForLevel(n) = round(80 + 40·n^1.25)` — per-level requirement, strictly rising, ratio → 1
(progressively slower, never a wall). `levelFromXp` / `levelProgress` derive level and bar
fill from lifetime XP; **XP is the stored truth, level is never persisted**.

## XP sources — `ACCOUNT_XP` (one table, the only tuning surface)

kill 1 · bossKill 40 · megaKill 250 · wave 12 · win 150 · campaignClearPerStage 6 ·
campaignFirstClear 120 · dailyComplete 300 · bossRushWavePremium 10 (on top of `wave`) ·
acquisition 15 (star/upgrade/gene buys) · molt 500 · achievement 100 · tutorialComplete 200.

Where it folds (all in `state/meta.ts`): `finishRun` computes the run's XP and settles it via
`foldAccountXp`; `evaluateAchievements`, `buyUpgrade`/`buyStar`/`buyHeroStar`/`upgradeGene`
(acquisition), `molt`, and `grantTutorialRewards` wrap their persists the same way. **A new
XP source = one `ACCOUNT_XP` row + one `foldAccountXp(...)` wrap around its persist.**

## Procedural rewards

`accountLevelReward(level)` — deterministic (seeded `account-level:${level}`), weighted pool
(`ACCOUNT_REWARD_POOL`: cores 30, towerShards 20, essence 16 ≥L3, heroShards 12 ≥L4, mats 10
≥L5, ichor 3 ≥L12), magnitudes scale on `valueBudget(n) = 18 + 6·n^0.7`. Every 5th level
banks a Bio-Container (`kind: 'cache'`, tier via the shared `chestForWave` ladder). Milestones
roll twice, multiply cores, add ichor + a rich/prime container, and carry `ACCOUNT_TITLES`
identity (Taking Root L10 → Millennial Hive L1000). **A future currency = one pool row + one
apply line in `foldAccountXp`.**

## The settle pipeline

`foldAccountXp(draft, gained, now)` (meta-internal): adds XP to lifetime + weekly/monthly
ledgers (`weekKey`/`monthKey` UTC buckets, rolled on key change), grants every crossed level's
reward into the same draft (shards/essence/ichor/mats/pendingContainers/titles + a milestone
timeline beat), queues `AccountLevelUp`s. Two celebration paths, no double-fire:

- **Run settles** — `finishRun` drains the queue into `RunOutcome.accountXp`
  (`{gained, from, to, levelUps}`) → the Results "Account Level" category (bar fill + crossed
  levels + the `levelup` audio cue).
- **Menu grants** (star buys, molts, achievements off-run) — `AccountLevelToast` (mounted in
  `App.tsx`, menu only) drains `meta.drainAccountLevelUps()` and celebrates one at a time.

## Presentation surfaces

`AccountXpBar` compact chip (Hub top bar), full block (Profile: bar + next-level payout
preview + milestone track + standings tabs), `Vitals` LV row (Command Center), Results
category, `AccountLevelToast`. Titles resolve through `titleName()` (`state/profile.ts`) —
mastery rewards and account titles share the equipped-title slot. Teach row `account-level`
in `state/mechanics.ts` announces the system after the first run.

## Leaderboards

Modes `accountLevel` (all-time, `score` = lifetime XP, `wave` = level), `weeklyXp`,
`monthlyXp` (period ledgers; the **server** derives the bucket key — clients cannot submit
into past periods; no tickets needed since period XP only grows). Client claims in
`net/leaderboard.ts §currentClaim`; boards render via `LeaderboardBlock` on the Profile.
Bounds per mode in `functions/api/leaderboard/submit.ts §MODE_BOUNDS`.

## Balance calibration (2026-07, pinned persona sim)

30h trace: levels [29 @5h, 48 @15h, 60 @30h] — rate falls 5.8 → 1.9 → 0.8 levels/hour;
level-reward cores = **2.3 %** of lifetime cores (guard trips at 15 %). Recalibrate via
`npm run sim:report` after touching `ACCOUNT_XP`, the curve, or `valueBudget`.

## Known limitations / future hooks

- Leaderboard entries are client claims (same honesty model as daily/bossRush —
  docs/SECURITY-AUDIT.md); bounds + keep-best are the friction.
- `levelFromXp` is an O(level) walk — fine for real saves (μs at L100k); switch to closed
  form only if a profiler ever says so.
- Battle-pass-style seasonal tracks can ride the weekly/monthly ledgers as-is.
