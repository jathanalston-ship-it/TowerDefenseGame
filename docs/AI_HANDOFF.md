# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-11-10 18:22 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** codex/hive-autoplay · **HEAD:** d1b0132a

## Summary of work completed

Live remains v2026.11.10.8 Know What Is Coming, SHA8950ec0d44d7f3959d988c4e6460b42f0a468ca0, Actions42867374482 SUCCESS; normal game/home/news verified17:42UTC. Local SEALED .9 Read Your Build now has FIVE generated website notes: accessible Bond details, Daily run-accurate bond values, readable drafted Gene Cards, HUD explanations below readouts, and safe Space while reading HUD help. Continuous goal active; next approximate deployment18:42UTC.

## Files modified

- Source (1): `src/changelog/releases.gen.ts`
- Tests (0): —
- Docs (3): `docs/HISTORY.md`, `docs/devlog/DRAFT-2026-11-09.md`, `docs/devlog/DRAFT-2026-11-10.md`

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts`

## Power Score changes

None. Prior added HUD bond level is read-only; no gameplay, balance or save changes.

## UI changes

Latest: GameView consumes Space on focused .hud-cell.tt before wave shortcuts. Real GameView baseline95814 terminalPASS reproduced phase=wave while reading Core. Fixed probe1764 terminalPASS confirmed Core/Power/Biomass remain prep, Hero Space opens Console, and unfocused-board Space starts wave. Eleven site/UI tests78230 and docs38229 terminalPASS. Typecheck96986 terminalPASS. Four sealed siteSync tests PASS552ms.

New CSS-only HUD tooltip placement opens downward, anchors Core/Hero/portrait Biomass inward, and raises active HUD above run controls (49 vs48, below pause50). Initial browser geometry exposed negative top coordinates. First implementation still covered by toolbar; screenshot inspection caught and fixed stacking. Final keyboard-only real GameView probe39136 terminalPASS across320x568,390x844,844x390,1280x800; all visible tooltip bounds inside viewport. Final phone screenshot inspected. Hover geometry also passed before final stacking change. Probe ../hud-tooltip-bounds-check.cjs waits2500ms for initial layout before focus; an earlier keyboard check lost focus during initialization, so its hidden-tooltip result was a fixture issue. Current eleven site/UI-standard tests38320 PASS; docs check PASS. Final production build39671 terminalPASS10.42s, hud-tooltip-final-build.log. Earlier build40313 PASS20.97s predates final z-index line.

## Documentation changes

HUD.md and PROJECT_MANIFEST.md updated; fourth curated ledger note generated into site/game release data. No new mechanic/reward/save field, so no help, audio or migration change needed.

## Save changes

None.

## Known edge cases

Prior four-note build passed; mobile30430 terminalFAIL: waitForDrawerClosed timeout5000ms in landscapeRailWalk. This repeats the prior .8 failure mode; root cause remains unproven. Original previous three-note mobile99507 terminalPASS27nav+9gameplay profiles; do not represent it as covering the new HUD CSS. Prior full suite30801 PASS3194tests354files356.10s includes two bond snapshot accuracy tests. Prior gene/bond browser probes allPASS. Windows validate wrapper has known npx shell:false launch failure; direct checks and retained bond-daily-wrapper-report.log document it. Screenshot and keyboard tests do not prove every screen reader speech output.

## Remaining technical debt

Existing Windows validate launcher issue only. Two untracked docs/devlog/DRAFT-2026-11-09.md and DRAFT-2026-11-10.md remain unpublished: do not stage.

## Recommended next tasks

ONLY active handle:81740, unchanged-build diagnostic ../read-build-drawer-diagnostic.ts --no-build, log read-build-drawer-diagnostic.log. Poll SAME handle; do not overwrite dist while it runs. It retains original assertions and5second timeout, limits to four landscape profiles, logs each screen, and on failure captures nav outerHTML/visibility/profile/focus plus read-build-drawer-failure.png. Prior original mobile30430 FAILED; do not call passed. Once diagnostic terminal, inspect evidence; then build the sealed five-note release (current dist predates newest HUD keyboard guard) and run full ORIGINAL mobilecheck. No gate weakening/restarting on observation timeout. Typecheck96986, docs38229, tests78230, baseline95814 and focusedbrowser1764 all terminalPASS. Seal42057 PASS (five entries), four siteSync tests PASS. Production ref rechecked18:21 and still8950ec0d44d7f3959d988c4e6460b42f0a468ca0. Next approximate deploy18:42; follow build/mobile/Actions exactSHA/customdomain verification. Vite5174 remains PID30948 with parent32932; verify exact command lines if cleanup needed.

## Future expansion hooks

BuildPanel native disclosures remain the in-flow reading pattern; HudSnapshot.bonds.level is authoritative run strength. Production command: git push origin HEAD:refs/heads/claude/zen-hawking-rh1gxl from codex/hive-autoplay. Current remote expected8950ec0d44d7f3959d988c4e6460b42f0a468ca0. No PR unless asked.
