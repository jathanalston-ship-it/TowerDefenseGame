# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-11-10 19:01 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** codex/hive-autoplay · **HEAD:** ed1c8e8f

## Summary of work completed

LIVE .9 Read Your Build, SHA48b2f2a81ac463b53708ffcc2aab5b11f7f7cfdc, Actions42876793393/job130042106520 SUCCESS; public game/home/news/five notes verified18:38UTC, asset /assets/play-7JbVGzDZ.js. LOCAL unsealed .10 Know Your Controls with TWO generated website notes: automation help and reachable Early Call on narrow portrait phones. Goal active; next approximate deployment19:38UTC.

## Files modified

- Source (2): `src/changelog/releases.gen.ts`, `src/ui/GameView.css`
- Tests (0): —
- Docs (6): `docs/EARLY-CALL.md`, `docs/HISTORY.md`, `docs/HUD.md`, `docs/PROJECT_MANIFEST.md`, `docs/devlog/DRAFT-2026-11-09.md`, `docs/devlog/DRAFT-2026-11-10.md`

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts`

## Power Score changes

None. Prior added HUD bond level is read-only; no gameplay, balance or save changes.

## UI changes

Latest CSS-only fix: portrait<=380px available Early Call uses second control row (absolute top ctl-h+4,left0), canvas padding reserves strip+ctl-h+4; label shown. No simulation/action change. Real mid-wave baseline47721 reproduced Early Call x=-43.45..18.70 at320x568, offscreen and not hit-testable. Fixed80272 and final14282 PASS320x568/390x844/844x390, all controls in viewport/hit-testable, Pause/P resume. Final probe clicked Early Call at320: wave advanced1->2 and biomass increased by displayed23; button above canvas, screenshot inspected. Initial17322 fixture mistakenly used advance(3.2), clamped by engine; corrected40 steps of0.1, not a game bug. Eleven site/UI tests2738 and docs72656 terminalPASS. Build11357 running, early-call-layout-build.log.

Additional review: ../run-controls-narrow-check.cjs final88649 terminalPASS at320x568,390x844,844x390. Every control is in viewport and receives center hit-testing; Pause opens and documented P resumes. Screenshots inspected. No Pause clipping defect reproduced, so no source change made. Earlier probe39716 failed because it incorrectly expected Escape to resume; corrected to documented P. Ancestor-overflow geometry falsely flagged fixed landscape controls; actual hit testing and screenshots prove visible.

BuildControls adds44px help button to existing automation row and reuses bounded briefing reader. Explanations derive current WAIT, autoGeneLock reason and hiveActive, update live, describe countdown/manual card override. Existing toggles/prefs/gates unchanged. Reader keeps Space isolated, Escape restores opener. Compact labels wrap inside buttons (no font-size reduction); initial narrower-grid clipping was caught and fixed. Final real GameView checks85873 unlocked +32996 locked PASS320x568/390x844/844x390/1280x800, reader/label bounds and keyboard behavior; locked/unlocked phone screenshots inspected. Standalone state probe PASS waiting/locked/liveHiveupdate/disabledbuttons/keys. Initial fixture resizing before profile settlement produced width20px; fixed initial portrait and explicit profile wait. Loot meter unlocked geometry probe5639 also PASS, no source change needed there. Eleven site/UI tests1292 PASS10.51s; docs70306 PASS. Initial build68516 PASS23.05s predates last wrapping fix. Final build78237 terminalPASS16.19s, automation-help-final-build.log, SWmwb1m0tw. Original full mobile53228 terminalPASS27nav+nine gameplay profiles, automation-help-mobile.log.

## Documentation changes

EARLY-CALL.md, HUD.md and manifest describe reserved narrow portrait row. Second curated .10 website note generated.

HUD.md/PROJECT_MANIFEST.md updated; one curated .10 note generated in ledger/game/site. No mechanic/reward/save changes, so no help registry/audio/migration changes needed. Prior .9 evidence remains in chronological status/validation reports and Git.

## Save changes

None.

## Known edge cases

Earlier automation-help build/mobile passed; current Early Call build11357 and updated full mobile pending. Wider state labels required flex wrapping, verified in focused real game probes. Native disclosure/keyboard checks do not prove every screen reader speech output. Prior .9 original mobile30430 failed drawer-close timeout; unchanged-build diagnostic81740 and final original72320 passed, root cause unproven. Do not weaken original gate; preserve failure history. Existing Windows validate wrapper npx shell:false launch issue remains documented.

## Remaining technical debt

Existing Windows validate launcher issue only. Two untracked docs/devlog/DRAFT-2026-11-09.md and DRAFT-2026-11-10.md remain unpublished: do not stage.

## Recommended next tasks

ONLY active validation handle11357: build, early-call-layout-build.log. Poll SAME handle until terminal, then run original full mobilecheck --no-build (Chrome headless=new preload ../chrome-probe-compat.cjs), with no competing heavy checks/dist writes. Prior mobile53228 PASS covers automation-help build BEFORE newest Early Call CSS. Current focused action/geometry probe14282 PASS; docs72656 and eleven site/UI tests2738 PASS. No other active probes/tests. Source latest change only GameView.css13lines; .10 has two notes, still unsealed. Next approximate deploy19:38UTC. Live .9 SHA48b2f2a81ac463b53708ffcc2aab5b11f7f7cfdc. Vite5174 remains PID30948,parent32932. Two untracked devlog drafts remain unpublished.

## Future expansion hooks

BuildPanel native disclosures remain the in-flow reading pattern; HudSnapshot.bonds.level is authoritative run strength. Production command: git push origin HEAD:refs/heads/claude/zen-hawking-rh1gxl. Verify Actions exactSHA guard plus ../verify-current-release.ps1 NORMAL public URLs each deployment. No PR unless asked. Next read-only review can explore other help/accessibility surfaces; reproduce any issue before editing.
