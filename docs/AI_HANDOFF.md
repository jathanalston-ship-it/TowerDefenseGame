# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-19 19:14 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 63ebc02

## Summary of work completed

BOSS RUSH FREE-ENTRY BADGE (user report: no notification on the Boss Rush tab when a free
run is available). The source (`rush.freeEntry`, channel `bossrush`) already existed and
every surface renders channel badges — the bug was the WATERMARK MODEL: the count is 1
today and 1 again tomorrow (a fresh free entry each reset), so one un-acted visit stamped
seen=1 and suppressed the badge FOREVER. Fix: `NotificationSource.volatile: 'daily'` — the
seen-mark only counts on the day it was stamped (numeric-ISO `<id>@d` sidecar key in the
same watermark record; no migration; stale-day stamps read as "never seen"). Applied to
`rush.freeEntry` only (deliberate — persistent watermarks stay correct for counts that
drop on action). The one thing to know: `__setNotifDayForTests` pins "today" for rollover
tests; the badge now re-lights every reset on the hub door, landing card, and mobile nav.

## Files modified

- Source (3): `src/changelog/releases.gen.ts`, `src/state/notificationSources.ts`, `src/state/notifications.ts`
- Tests (1): `src/state/notifications.test.ts`
- Docs (3): `docs/HISTORY.md`, `docs/NOTIFICATIONS.md`, `docs/VALIDATION_REPORT.md`

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts`
- **notifications** — `src/state/notificationSources.ts`, `src/state/notifications.ts`
- Consumer ring (verify, unchanged): hub-shell, metabolism

## Power Score changes

None — no Power-relevant system touched.

## UI changes

Surfaces in the blast radius: `App (UpdateBriefing popup)`, `Hub (badges)`, `RewardToaster (claim popups)`, `nav badges`

No component/CSS change — the fix is model-level, so the existing badge renderings (hub
door aggregate, HubLanding card, mobile nav row, reason tooltips) light up via the same
`notifications.badges()` read. Coverage: notifications.test rollover case (badge → seen →
day rollover → badge again); validate's mobile gate green.

## Documentation changes

Registry says these move with the touched systems: `docs/CHANGELOG-PIPELINE.md`, `docs/NOTIFICATIONS.md`, `docs/HIVE-INTEL.md`, `docs/METABOLISM.md`, `docs/COMMAND-CENTER.md`, `docs/HOME-BASE.md`, `docs/ONE-MORE-RUN.md`, `docs/HUD.md`, `docs/PROGRESSION-LOOP.md`, `docs/UX-CONSOLIDATION.md`

- Updated: `docs/NOTIFICATIONS.md` (+§volatile). The rest: no change needed — no channel
  taxonomy, toast, or hub-flow contract moved.

## Save changes

None — save layer untouched.

## Known edge cases

- Volatile watermarks key off `dailyKey()` (the same day authority as the free entry
  itself), so badge day-rollover and stamina reset can never disagree.
- The `@d` sidecar lives in the SAME localStorage record as watermarks — `sync()` never
  clamps it (it iterates sources by id, and `@d` keys are not source ids).
- Old persisted watermarks lack `@d` → read as stale → the badge shows once post-update,
  then stamps normally. Deliberate (fail toward visibility).

## Remaining technical debt

- Other daily-shaped 0|1 sources (`daily` login cache, `idle.ripe`) share the latent
  suppress-forever pattern but their screens' single action drops the count on visit in
  practice; apply `volatile: 'daily'` per-source only after checking each screen's UX.

## Recommended next tasks

1. **Mega boss follow-up (user-queued)**: weak-point hits play no impact sound
   (megaHitWeakPoint/megaHitBody push no sfx — entry: `src/core/game.ts` + a throttled
   cue); ALL modes except campaign must treat a live mega as wave-blocking (entry: the
   wave-completion gate at the `spawnedAll && … && enemies.length === 0` check, keyed on
   `rt.encounter`); campaign keeps multi-wave persistence; general fight-feel audit.
2. Consider `volatile: 'daily'` for the login-cache source after UX review.

## Future expansion hooks

- `NotificationSource.volatile` — extend the union (e.g. `'weekly'`) with one case in
  `dayStamp()`-adjacent logic when a weekly-cadence offer needs the same treatment.
