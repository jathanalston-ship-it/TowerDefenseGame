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
| Depth XP: ×1 through depth 30, smooth/monotonic/uncapped after; contract XP stays flat | §depth (`accountLevel.test.ts`) |
| Weekly/monthly XP boards count pure activity (pre-depth-multiplier XP); lifetime XP carries it | §depth (`accountLevel.test.ts`) |
| Levels 1–42 pay the pre-depth ladder exactly; deep beats are smaller but bounded and creep back up | §rewards (pinned sums + deep-window guard) |
| Every level pays something (guaranteed core floor) | §rewards (levels 1–400 swept) |
| Rewards deterministic per level (shared previewable ladder, no save RNG) | §rewards |
| Milestones infinite (named tiers, then every 500 past 1000), always one ahead | §milestones |
| The lane moves every persona band, decelerates out of onboarding, never runs away | `progressionSim.test.ts` |
| Save-compat: `accountXp` sanitized, level always **derived** from XP | `saveStore.ts` `sanitizeAccountXp` |

## The curve

`xpForLevel(n) = round(80 + 40·n^1.25)` — per-level requirement, strictly rising, ratio → 1
(progressively slower, never a wall). `levelFromXp` / `levelProgress` derive level and bar
fill from lifetime XP; **XP is the stored truth, level is never persisted**.

## XP sources — `ACCOUNT_XP` (one table, the only tuning surface)

kill 1 · bossKill 40 · megaKill 250 · wave 12 · win 150 · campaignClearPerStage 6 ·
campaignFirstClear 120 · dailyComplete 300 · bossRushWavePremium 10 (on top of `wave`) ·
acquisition 15 (star/upgrade/gene buys) · molt 500 · achievement 100 · tutorialComplete 200.
The run fold's **play** XP (everything above except `contract`/`perfectWeek`) is multiplied by
Depth XP — see §depth.

Where it folds (all in `state/meta.ts`): `finishRun` computes the run's XP and settles it via
`foldAccountXp`; `evaluateAchievements`, `buyUpgrade`/`buyStar`/`buyHeroStar`/`upgradeGene`
(acquisition), `molt`, and `grantTutorialRewards` wrap their persists the same way. **A new
XP source = one `ACCOUNT_XP` row + one `foldAccountXp(...)` wrap around its persist.**

## Depth XP — the late-game cadence (§depth)

**Problem (grind audit G2, 2026-11):** kills and waves per minute plateau at depth (the Infinite
headcount caps ~depth 18; campaign stages cap at 14 waves) while `xpForLevel` keeps rising, so
play paid a flat ~3.3k XP/hour forever and the lane slowed to **0.3 level-ups/hour by hour 100**
(0.2/h past 150 h).

**Lever — XP income, not the curve.** Re-shaping the curve would retroactively jump veterans'
levels (a reward burst for every level crossed on first load + leaderboard jumps). Instead the
run's play XP scales with the account's **depth** — `accountDepth(stage, bestWave)` in
`core/equipment.ts`, the SAME depth the gear chase reads (deepest cleared Campaign stage, or the
Infinite record × `ITEM_LEVEL_CURVE.infiniteWeight`), read at run start:

`depthXpMult(d) = 1` for d ≤ 30, else `1 + ((d − 30) / 25)^1.6` (`ACCOUNT_XP_DEPTH`) —
stage 55 ×2 · 80 ×4.0 · 105 ×6.8 · 130 ×10.2 · 165 ×15.9.

Why account depth (not the run's own depth): one multiplier for every mode keeps XP/minute
mode-neutral (no mode becomes the XP grind) and camp-neutral (Infinite depth-camping is already
tapered for loot/mastery — `ENDLESS_TAPER`; a per-wave depth ramp would undo that). Contract and
Perfect-Week XP stay flat because `ContractsCard` quotes them (previews == outcomes). Results
names the multiplier (`RunOutcome.accountXp.depthMult` → "DEPTH ×N.N").

**Payouts re-weighted, so the faster beat is not a faucet** (`ACCOUNT_REWARD_DEPTH`):
- levels ≤ 42 pay exactly what they always did (pinned); past 42 the value budget divides by
  `1 + 3·ln(n / 42)` — ~45–50 at L80–L250 (vs 147–305 before), then creeping back up
  (∝ n^0.7 / ln n: 74 at L1000) so deep levels never shrink to nothing;
- the periodic Bio-Container interval widens by 5 every 50 levels (`isContainerLevel`: every 5th
  to L50, 10th to L100, 15th to L150 … always round levels); milestones keep their package.

**Measured** (cadence harness on the progression-sim personas, average / efficient, 400 h):

| Band | min per level-up before → after | level-reward value/hour Δ |
|---|---|---|
| 0–3 h | 8 → 8 / 8 → 8 | 0 % / 0 % |
| 3–10 h | 40 → 40 / 37 → 35 | 0 % / +4 % |
| 10–30 h | 65 → 51 / 69 → 52 | 0 % / 0 % |
| 30–60 h | 112 → 55 / 106 → 56 | −9 % / −14 % |
| 60–100 h | 159 → 63 / 159 → 61 | +16 % / +18 % (L100 milestone lands here now) |
| 100–150 h | 198 → 71 / 200 → 66 | −10 % / −3 % |
| 150–400 h | 305 → 73 / 306 → 71 | −1 % / +2 % |

Value = core-equivalents at the ladder's own budget rates + ichor at the Exchange anchor +
containers at their expected roll. Over 30–150 h: −1 % / 0 %. Levels at 150 h: 96 → 167; at
400 h: 145 → ~375. **Leaderboards:** the `weeklyXp`/`monthlyXp` boards stay **pure activity** —
the period ledgers fold each run's XP *before* the depth multiplier (`finishRun` passes `periodXp`
to `foldAccountXp`; owner decision 2026-11-05), so a fresh account and a stage-160 veteran race
on time played. Lifetime XP — the level and the all-time `accountLevel` board — carries the
multiplier and grows faster for deep accounts from now on (existing totals untouched;
`MODE_BOUNDS` — 5·10⁸ per period — keeps ample headroom).

## Procedural rewards

`accountLevelReward(level)` — deterministic (seeded `account-level:${level}`), weighted pool
(`ACCOUNT_REWARD_POOL`: cores 30, towerShards 20, essence 16 ≥L3, heroShards 12 ≥L4, mats 10
≥L5, ichor 3 ≥L12), magnitudes scale on `valueBudget(n) = 18 + 6·n^0.7` (re-weighted past L42 —
§depth). Periodic levels (`isContainerLevel`, every 5th, widening at depth)
bank a Bio-Container (`kind: 'cache'`, tier via the shared `chestForWave` ladder). Milestones
roll twice, multiply cores, add ichor + a rich/prime container, and carry `ACCOUNT_TITLES`
identity (Taking Root L10 → Millennial Hive L1000). **A future currency = one pool row + one
apply line in `foldAccountXp`.**

## The settle pipeline

`foldAccountXp(draft, gained, now, periodGained = gained)` (meta-internal): adds `gained` to
lifetime XP and `periodGained` (pre-depth-multiplier) to the weekly/monthly ledgers (`weekKey`/`monthKey` UTC buckets, rolled on key change), grants every crossed level's
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

## Balance calibration (2026-11, pinned persona sim)

30h guard trace (`progressionSim.test.ts`, 0xbeef): levels [26 @5h, 38 @15h, 53 @30h]
(pre-depth [26, 38, 50]); level-reward cores = **5.6 %** of lifetime cores (pre-depth 5.9 %;
guard trips at 15 %). Deep cadence: §depth table. Recalibrate after touching `ACCOUNT_XP`,
`ACCOUNT_XP_DEPTH`, `ACCOUNT_REWARD_DEPTH`, the curve, or `valueBudget` — the multiplier and the
payout re-weighting are a PAIR (faster levels × smaller beats); retune them together against the
cadence harness (level-ups/hour + level-reward value/hour by band) and `npm run sim:report`.

## Known limitations / future hooks

- Leaderboard entries are client claims (same honesty model as daily/bossRush —
  docs/SECURITY-AUDIT.md); bounds + keep-best are the friction.
- `levelFromXp` is an O(level) walk — fine for real saves (μs at L100k); switch to closed
  form only if a profiler ever says so.
- Depth XP is calibrated on the sim's world model (12 kills + 1 wave per 30 s, flat at depth).
  Real boards that kill faster level proportionally faster at every depth; the multiplier keys
  on depth, not kill rate, so the SHAPE (a steady beat at depth) carries over.
- The cadence still drifts slowly longer past ~400 h (~75 min/level at stage 165); the formula
  is uncapped, so a later retune is one `ACCOUNT_XP_DEPTH` row.
- Battle-pass-style seasonal tracks can ride the weekly/monthly ledgers as-is.

Account-level notices: hover (non-touch) and focus pause expiry, then grant the original full3400ms/5200ms reading window on leave. A24px dismiss button supports Enter/Space; queued notices retain focus, final dismissal restores the prior connected control without stealing unrelated focus. Unlock-held notices clear reading flags and resume without replaying their cue. Timer callbacks verify the same front item before removing it. Reward grants, queue order and milestone duration are unchanged.
