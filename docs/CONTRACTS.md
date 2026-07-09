# Champion Contracts — weekly constraint runs

Three contracts are live each week, rotating **deterministically** from one authored pool
on the same UTC `weekIndex` the LiveOps spotlights use (`core/liveops.ts`) — every player
sees the same board, no server. The board renders on the Command Center home
(`ContractsCard`); completions land as their own Results category.

## Model (`src/core/contracts.ts`)

- `CONTRACT_POOL` — authored rows: `{ id, name, blurb, mode, constraints[], reward }`.
- **Constraint vocabulary** (data, one case per verb): `win`, `minWave`, `minKills`,
  `noLeaks` (zero integrity lost), `banTower`, `maxTowerKinds`, `maxTowersBuilt`,
  `requireHero`. Evaluated against a `ContractRunFacts` snapshot (mode, won, wave, kills,
  integrityLost, towerBuilds, heroId).
- `activeContracts(d)` — a 3-wide window striding the pool by week; a full cycle visits
  every row (pinned by test). `contractWeekKey(d)` = `w<weekIndex>`.

## Completion & rewards (meta.finishRun)

Every finished run is checked against the current board. An uncompleted, satisfied
contract:
- pays `reward.cores` **into the run's Genome Core total** (visible in Resources),
- writes `w<week>:<id>` into `save.contracts.completed` (v26; never double-pays in-week —
  a NEW week re-arms the same contract ids),
- marquee rows grant their **Gilded phenotype** (`reward.cosmetic`, docs/COSMETICS.md)
  exactly once,
- lands a `❖ Contract honoured` timeline event + a Results "Champion Contracts" category.

## Extending

Add a pool row (keep marquee rows at rotation stride so each week carries one), or add a
constraint verb (one union member + one switch case + tests). Reward-id hygiene is pinned:
every cosmetic payout must resolve to a real `source: 'contract'` phenotype.
