# LIVEOPS.md — the deterministic event calendar

Client-side, UTC-deterministic (every player sees the same calendar, no server):
`src/core/liveops.ts` is a registry of `{window predicate, reward multipliers}` rows.
`liveopsMods()` folds every live window into ×1-baseline multipliers that
`meta.finishRun` applies to the mode-matched reward lane; the hub's LIVE OPERATIONS
strip (`LiveEventsStrip`) shows what's live and the next weekend surge.

## The launch calendar

| Event | Window (UTC) | Effect |
|---|---|---|
| Weekend Surge | Sat + Sun | Daily Run clear cores ×1.5 |
| Gauntlet Week | week rotation ⅓ | Boss Rush cores ×1.25 |
| Depth Week | week rotation ⅓ | Infinite cores ×1.25 |
| Campaign Offensive | week rotation ⅓ | Campaign stage cores ×1.15 |

Exactly one weekly spotlight is always live (`spotlightOf` rotates on a stable
week index), so the strip never sits empty.

## Discipline

- **Adding an event = one registry row** (pure predicate + mods bag). Seasonal
  date-range events use the same shape (`active: (d) => inRange(d, …)`).
- **×1 baseline everywhere**: an empty calendar is byte-identical to no framework.
- **Tests never ride the wall clock**: the module clock pins to a fixed Tuesday
  under vitest; liveops' own tests pass explicit dates into the pure functions.
- Display is data-driven from the same defs — new events appear in the strip with
  zero UI work.
