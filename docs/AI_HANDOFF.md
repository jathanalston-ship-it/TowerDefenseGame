# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-11-10 19:51 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** codex/hive-autoplay · **HEAD:** 75c147ed

## Summary of work completed

LIVE .10 Know Your Controls, SHA2400521c2dbf87dda58e5e9f5d161fb4800e6cd2, Actions42885435823/job130072400258 SUCCESS including exactSHA guard; normal custom-domain game/home/news/three notes verified19:30UTC, asset /assets/play-DLqe10Zs.js. LOCAL unsealed .11 Motion and Map Controls, four generated notes: infestation map follows live motion settings, resizes still canvas correctly and stops hidden animation. Goal active; next approximate deploy20:30UTC.

## Files modified

- Source (2): `src/changelog/releases.gen.ts`, `src/ui/components/HeroGearPreview.tsx`
- Tests (0): —
- Docs (5): `docs/EQUIPMENT.md`, `docs/HISTORY.md`, `docs/PROJECT_MANIFEST.md`, `docs/devlog/DRAFT-2026-11-09.md`, `docs/devlog/DRAFT-2026-11-10.md`

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts`
- **equipment** — `src/ui/components/HeroGearPreview.tsx`
- Consumer ring (verify, unchanged): crafting

## Power Score changes

None. All current changes are UI/presentation; no core simulation or balance changes.

## UI changes

HeroGearPreview now honors live motion preferences, pauses offscreen/hidden and redraws on drag in still mode. Idle spin uses elapsed time at prior60Hz speed. Pointer cancel/lost capture ends dragging. Baseline browser29frames/500ms under reduce; fixed final6195 PASS0frames, visible pixel change on drag with real WEAPONS[0] equipment, no loop restart, override/revoke, offscreen/hidden pause-resume and cleanup. Fifteen artwork/UI/site tests PASS2.58s, docs16411 PASS. Build88220 PASS16.66s (SWmwb3x5eo), gear-preview-motion-build.log. Original full mobile64256 RUNNING against this dist, motion-controls-mobile.log.

Premium ItemArt now follows live OS/shared motion preferences, renders a nonblank still, pauses offscreen/hidden and resumes without a hidden-time jump. Baseline browser drew30frames/500ms while reduced. Fixed ../item-art-motion-check.cjs PASS0frames plus override/revoke, viewport/visibility pause-resume and cleanup. Initial fixed probe saw one settling frame with100ms media wait;500ms settling interval passed. Fifteen artwork/UI/site tests PASS2.51s; docs7282 PASS; build21859 PASS9.54s (SWmwb3sfoa), item-art-motion-build.log. No gameplay/save changes. Final release mobile remains pending.

InfestationBoard removes module-level OS motion constant. Component subscribes to shared prefs and media changes; projector re-arms on showMap/reducedMotion, ResizeObserver sizes canvas in both modes, visibility cancels/restarts RAF, reduced data redraw skips hidden documents. Input/pin state and simulation untouched. Feed controls now expose actual selection via aria-pressed, full region names, and distinguish direct sector pins from region-resolved feed markers. Baseline20669 terminalPASS measured57frames in1s after reduce=true; fixed basic probe passed0frames and override behavior. Expanded ../infestation-motion-check.cjs final68906 terminalPASS: live OS change, nonblank still, canvas backing dimensions after resize,16sector controls, real pin click, no restarted still loop, simulated hidden document stop/resume, override/revoke, collapse/reopen, restored OS motion and unmount cleanup. Screenshot ../infestation-motion-still.png inspected. Initial fixture79410 counted clearRect while map uses fillRect; corrected to setTransform. Expanded94370 timed out on fixed200ms resume assertion; corrected to wait for actual frame within5s, final passed. Eleven UI/site tests10221 PASS6.63s; docs28515 PASS. Build84198 PASS12.89s, infestation-motion-build.log, SWmwb3bmh4. Original full mobile93548 terminalPASS: 27 nav screens and nine gameplay profiles. Subsequent selection-only update passed ../infestation-selection-check.cjs: keyboard region/sector selection, truthful resolved-feed marker, toggle off and Spread. Eleven UI/site tests PASS6.02s; docs PASS; build63586 PASS (Vite8.87s, SWmwb3o18o), infestation-selection-build.log.

## Documentation changes

INFESTATION.md, EQUIPMENT.md and manifest updated with projector lifecycle and equipment card motion. Four curated UI notes generated in ledger/game/site; existing category vocabulary preserved. No new mechanic/reward/save field, so no help registry/audio/migration change needed.

## Save changes

None. Uses existing motion preferences and existing infestation pin actions. Browser probes use isolated profiles.

## Known edge cases

Hero gear preview remains pointer-only for manual rotation; keyboard control design is an open follow-up. Browser visibility checks simulate document.hidden; actual background-throttling differences remain outside that probe.

Full mobile93548 passed the motion-fix build before the subsequent ARIA/label-only selection change. Final release mobile check remains pending. Simulated document.hidden covers event lifecycle, not every browser background-throttling policy. Existing Windows validate wrapper npx shell:false issue remains. Prior .9 mobile30430 drawer timeout retained; diagnostic81740 and original72320 passed, root cause unproven. Latest live .10 final mobile51961 passed.

## Remaining technical debt

No new debt intended. Existing Windows validation launcher issue. Two untracked docs/devlog/DRAFT-2026-11-09.md and DRAFT-2026-11-10.md remain unpublished and must not be staged.

## Recommended next tasks

Original full mobile64256 is the only active validation handle. Poll SAME handle; do not overwrite dist or run competing heavy/browser checks until terminal. Local unsealed .11 Motion and Map Controls has four generated website notes. Continue evidence-led improvements; next approximate deployment20:30UTC. Before deploying, seal notes, regenerate website, build and run final original mobile gate, then verify Actions and normal public game/news URLs. Live production remains2400521c2dbf87dda58e5e9f5d161fb4800e6cd2. Two untracked devlog drafts remain unpublished.

## Future expansion hooks

InfestationBoard follows shared state/prefs resolution, reuses existing sector overlay/layout, and preserves game rules. Production push git push origin HEAD:refs/heads/claude/zen-hawking-rh1gxl from codex/hive-autoplay; verify Actions exactSHA and ../verify-current-release.ps1 NORMAL URLs every deployment. Original mobile gate uses Chrome headless=new preload ../chrome-probe-compat.cjs. No PR unless asked. Keep goal active.
