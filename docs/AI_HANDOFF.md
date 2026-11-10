# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-11-10 19:19 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** codex/hive-autoplay · **HEAD:** 27819687

## Summary of work completed

LIVE .9 Read Your Build, SHA48b2f2a81ac463b53708ffcc2aab5b11f7f7cfdc, Actions42876793393/job130042106520 SUCCESS; public game/home/news/five notes verified18:38UTC, asset /assets/play-7JbVGzDZ.js. LOCAL SEALED .10 Know Your Controls now has THREE notes: automation help, reachable narrow-phone Early Call, live World Status motion preferences. Goal active; next approximate deploy19:38UTC.

## Files modified

- Source (2): `src/changelog/releases.gen.ts`, `src/ui/BuildControls.tsx`
- Tests (0): —
- Docs (3): `docs/HISTORY.md`, `docs/devlog/DRAFT-2026-11-09.md`, `docs/devlog/DRAFT-2026-11-10.md`

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts`
- **run-ui** — `src/ui/BuildControls.tsx`

## Power Score changes

None. All .10 changes are UI/presentation; no core simulation or balance changes.

## UI changes

Final release preparation: corrected automation reader close button name to Close automation help (wave readers retain Close wave details); focused state/keyboard probe2045 terminalPASS. Corrected-category build93090 terminalPASS16.32s. Sealed THREE notes, regenerated site, four siteSync tests PASS657ms. SEALED final build63376 terminalPASS17.35s, controls-release-build.log, SWmwb2p9ip. Explicit bundle check found final close label in dist/assets/GameView-C8pzR7tP.js. Original full mobile51961 is running against this exact build.

Automation help uses existing bounded briefing reader; locked/waiting/Hive explanations and manual override, safe keys/focus. Real locked/unlocked four-viewport probes passed; original mobile53228 passed. Early Call at320 previously x=-43..19 and unclickable; CSS<=380px reserves second row above canvas. Action probe14282 passed three viewports, hit tests/Pause and real next wave+displayed23Biomass. Its build11357 PASS23.95s and ORIGINAL mobile10866 now terminalPASS27nav+nine profiles.

WorldStatus now subscribes to OS media and existing motion prefs, uses resolved mode cached on changes, stops RAF for still mode, repaints account/resize changes, avoids spore drift on unchanged still redraws, and cleans listeners/RAF on unmount. Baseline after settled mount counted57frames in1s while reduced=true. Final ../world-status-motion-check.cjs probe18462 terminalPASS: normal motion, live OS stop/nonblank still, pixel-identical unchanged-account redraw, changed-account repaint, resize, simulated hidden-document stop/resume, allowMotion override/revoke, restored OS motion and unmount cleanup. Screenshot ../world-status-still.png inspected. Earlier copied fixture mistakenly scoped frame counter to hero-portrait, then initial unsettled sample saw0frames; corrected to cc-world and2s settle before valid baseline. Eleven site/UI tests62654 PASS4.50s, docs PASS.

## Documentation changes

HUD.md, EARLY-CALL.md, COMMAND-CENTER.md and manifest updated across .10. Three curated notes generated into ledger/game/site. Existing UI category used for motion note. No new mechanic/reward/save fields require help registry/audio/migration changes.

## Save changes

None. Existing device-local motion preferences are read/subscribed; no new persistence fields.

## Known edge cases

Initial WorldStatus build82064 FAILED because new note used unsupported Accessibility category. Corrected to existing UI and regenerated; replacement93090 and final sealed63376 builds both passed. Final mobile51961 pending. Prior .9 mobile30430 drawer timeout remains documented; unchanged-build diagnostic81740 and final original72320 passed, cause unproven. Existing Windows validate wrapper npx shell:false launch issue remains. Native browser checks do not prove all screen readers.

## Remaining technical debt

No new debt intended. Existing Windows validation launcher issue. Two untracked docs/devlog/DRAFT-2026-11-09.md and DRAFT-2026-11-10.md remain unpublished and must not be staged.

## Recommended next tasks

ONLY active handle51961: ORIGINAL full mobilecheck --no-build on sealed final .10 artifact, controls-release-mobile.log. Poll SAME handle; do not overwrite dist or run competing heavy/browser checks. All other handles terminal. Final build63376 PASS17.35s, four sealed siteSync tests PASS, eleven UI/site checks and docs PASS, relevant focused browser/action/motion tests PASS. Three sealed notes, .10 Know Your Controls. Once mobile terminalPASS, record final gates and prepare authorized deployment near19:38UTC (last live18:38). Verify branch codex/hive-autoplay, git add -u (exclude two untracked drafts), commit/push HEAD:refs/heads/claude/zen-hawking-rh1gxl; remote checked19:20 and still48b2f2a81ac463b53708ffcc2aab5b11f7f7cfdc. Verify GitHub Actions head_sha/run/jobs including exactSHA production guard, then ../verify-current-release.ps1 NORMAL custom-domain URLs; sameURLretry20s for cache if needed. Keep goal active, record actual live result. Vite5174 still PID30948,parent32932; no active browser probes.

## Future expansion hooks

WorldStatus follows shared state/prefs motion resolution like HeroPortrait; no new abstraction. Production push git push origin HEAD:refs/heads/claude/zen-hawking-rh1gxl from codex/hive-autoplay. Verify Actions exactSHA and ../verify-current-release.ps1 normal URLs every deployment. No PR unless asked. Keep goal active.
