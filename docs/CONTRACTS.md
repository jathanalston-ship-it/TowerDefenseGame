# Champion Contracts — weekly constraint runs

Three contracts are live each week, rotating **deterministically** from one authored pool
on the same UTC `weekIndex` the LiveOps spotlights use (`core/liveops.ts`) — every player
sees the same board, no server. The board renders on the Command Center home
(`ContractsCard`, with a live rotation countdown via `contractRotationEnd`); completions,
near-misses, and the Perfect Week land as their own Results category.

## Model (`src/core/contracts.ts`)

- `CONTRACT_POOL` — authored rows: `{ id, name, blurb, mode, difficulty (1–3, display
  only), constraints[], reward }`. 24 rows = an **8-week cycle**.
- **Constraint vocabulary** (data, one case per verb in `checkConstraint` + one label in
  `constraintLabel`): `win`, `minWave`, `minKills`, `minBossKills`, `noLeaks` (zero
  integrity lost), `banTower`, `requireTower`, `banClass` / `onlyClass` (biological
  CombatClass, read from `TOWER_DEFS[k].combatClass`), `maxTowerKinds`, `minTowerKinds`,
  `maxTowersBuilt` (moves count as builds), `maxCards` (gene-draft discipline),
  `requireHero`. Evaluated against a `ContractRunFacts` snapshot (mode, won, wave, kills,
  bossKills, cardsDrafted, integrityLost, towerBuilds, heroId).
- `contractReport(c, f)` — per-constraint `{ label, ok }` verdicts + `modeOk`;
  `contractSatisfied` derives from it, so payout and display can never disagree.
- `activeContracts(d)` — a 3-wide window striding the pool by week; a full cycle visits
  every row (pinned by test). `contractWeekKey(d)` = `w<weekIndex>`.

### Pool invariants (pinned by `contracts.test.ts`)

- Pool length divisible by `CONTRACTS_PER_WEEK`; ids unique and ledger-safe (`[a-z_]+`).
- **Marquee rows (cosmetic ≠ null) sit exactly at indices ≡ 0 (mod 3)** — every weekly
  board carries exactly one marquee + two core rows. (The pre-overhaul pool violated
  this: a 4th marquee at index 8 gave one week two marquees and later weeks none.)
- Every verb appears in the pool ≥ once (no dead vocabulary), and every cosmetic payout
  resolves to a real `source: 'contract'` Gilded phenotype.

## Completion & rewards (meta.finishRun)

Every finished run is checked against the current board. An uncompleted, satisfied
contract:

- pays `reward.cores` **into the run's Genome Core total** (visible in Resources) and
  `ACCOUNT_XP.contract` Account XP into the run fold,
- writes `w<week>:<id>` into `save.contracts.completed` (never double-pays in-week —
  a NEW week re-arms the same contract ids),
- marquee rows grant their **Gilded phenotype** (`reward.cosmetic`, docs/COSMETICS.md)
  exactly once,
- lands a `❖ Contract honoured` timeline event + a Results "Champion Contracts" category.

### Perfect Week (§perfect-week)

Completing **all three** of a week's board (the run that lands the last one) pays
`PERFECT_WEEK.cores` + `ACCOUNT_XP.perfectWeek`, increments the lifetime
`save.contracts.perfectWeeks`, stamps `lastPerfect` with the week key (the double-pay
watermark), lands its own timeline event, and celebrates in Results. The home card shows
the 0–3 sweep pips + the lifetime count.

### Near-misses (§near-miss)

Open, mode-matched rows the run failed by **exactly one** constraint surface in the
outcome (`contractNears: { id, name, missed }`) and render as "Missed by one: <label>"
in the Results category — the labels come from the same `contractReport` that pays, so
the chase feedback is always honest.

## Integration

- **Genome Rank**: lifetime completions are a `journey` source row
  (`GENOME_SOURCES.contracts`, snapshot field `contractsHonoured`).
- **Achievements**: `contract_first`, `contract_12`, `perfect_week`.
- **Help wiki**: mechanics row `contracts` (unlocks after the first settled run).
- **Battle Pass**: honoured contracts already feed pass XP (`contractHits × 150`).

## Extending

Add a pool row (keep the pool a multiple of 3 with marquee rows exactly at stride
positions so each week carries one), or add a constraint verb (one union member + one
`checkConstraint` case + one `constraintLabel` case + tests). Requirement-shaped verbs
(`requireTower`/`requireHero`) must reference content every account owns early — a
contract no new player can complete is a dead row. Reward-id hygiene is pinned: every
cosmetic payout must resolve to a real `source: 'contract'` phenotype.

ContractsCard owns a minute refresh while visible and refreshes immediately on visibility return. One liveopsNow timestamp supplies activeContracts, contractWeekKey and contractRotationEnd, so roster/completion keys/countdown cannot use different weeks in one render. Hidden ticks skip state updates; unmount clears the interval and visibility listener. Contract evaluation, rewards and completion persistence are unchanged.
