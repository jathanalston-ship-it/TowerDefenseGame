# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-11-10 20:10 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** codex/hive-autoplay · **HEAD:** f605db7e

## Summary of work completed

LIVE .10 Know Your Controls, SHA2400521c2dbf87dda58e5e9f5d161fb4800e6cd2, Actions42885435823 success including exact-SHA guard; game/home/news verified19:30UTC. LOCAL sealed .11 Clearer Gear and Motion now has seven generated notes: infestation live motion, truthful feed selection, equipment art motion, gear preview motion, keyboard rotation, and visible salvage confirmation. Goal active; next approximate deployment20:30UTC.

## Files modified

- Source (2): `src/changelog/releases.gen.ts`, `src/ui/ItemDetails.tsx`
- Tests (0): —
- Docs (5): `docs/EQUIPMENT.md`, `docs/HISTORY.md`, `docs/PROJECT_MANIFEST.md`, `docs/devlog/DRAFT-2026-11-09.md`, `docs/devlog/DRAFT-2026-11-10.md`

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts`
- **equipment** — `src/ui/ItemDetails.tsx`
- Consumer ring (verify, unchanged): crafting

## Power Score changes

None. UI/render-only changes; equipment stats, preview derivation, simulation and save schema unchanged.

## UI changes

Favorite/item salvage lock/affix lock now have stable accessible names and aria-pressed; randomize names its affix. Isolated ../item-toggle-check.cjs PASS real keyboard toggles and preserved salvage protection. Sealed .11 Clearer Gear and Motion with SEVEN generated notes. Final23 UI/artwork/site/back tests PASS4.59s; docs77844 PASS; build19916 PASS11.17s (SWmwb4izai), clearer-gear-release-build.log, asset/assets/play-CSQGqZlk.js. ORIGINAL final mobile27718 terminalPASS27nav+nine gameplay profiles, clearer-gear-release-mobile.log. Production ref checked still2400521c2dbf87dda58e5e9f5d161fb4800e6cd2.

Salvage confirmation baseline at320x568: dialog top=-550.77,bottom=-341.23 after scroll730, entirely offscreen. ItemDetails now portals nested confirmation to viewport, uses alertdialog with linked warning, focuses Cancel, makes underlying box inert, traps Tab and restores invoking focus; Escape/backdrop/Cancel only cancel prompt.44px action targets and bounded scroll use shared --app-h. ../salvage-confirm-check.cjs final normal26417 and stronger-gear19618b probes PASS320/390/844: visible dialog, focus/trap, inert release, safe cancellation and actual isolated salvage. Warning screenshots inspected. Initial23test run82308 failed UI viewport-token rule; changed100dvh tovar(--app-h), replacement75347 passed23tests5.99s and build13.48s (SWmwb4exfh), salvage-confirm-build.log. Docs25457 PASS. Final full mobile27718 passed; gameplay/salvage rules unchanged.

Infestation motion/selection: browser probes passed live prefs, resize, pins, hidden lifecycle and keyboard region/sector selection. ItemArt: baseline30frames/500ms under reduced motion; fixed probe passed0frames, nonblank still, override/revoke, offscreen/hidden pause-resume and cleanup. HeroGearPreview: baseline29frames/500ms; fixed motion probe passed still drag with real equipment pixel change, motion prefs, visibility and cleanup. Idle rotation now uses elapsed time at prior60Hz speed. Native Left/Right44px buttons rotate by PI/8; focus pauses animation, blur out resumes. Real ItemDetails controls probe passed320/390/844, Enter/Space, Tab, stable focus image, opposite rotation restoring angle, target bounds/hit tests and reduced keyboard rotation. Expanded final probe also proved blur resumes; screenshots320/844 inspected. Final motion rerun passed. Fifteen artwork/UI/site tests PASS2.26s; docs32157 PASS; build47084 PASS15.52s, SWmwb47opn, gear-controls-build.log. Full original mobile64256 passed27nav+nine gameplay profiles BEFORE keyboard controls; final release mobile remains pending.

## Documentation changes

INFESTATION.md, EQUIPMENT.md and manifest updated. Seven curated UI notes generated for game and website. No new mechanic/reward/save field: no help registry, audio or migration change needed.

## Save changes

None. Browser probes used isolated profiles; ItemDetails fixture seeded a real equipment definition only in that profile.

## Known edge cases

Full mobile64256 covers four-change build before native rotation controls; focused real ItemDetails browser covers those controls, final release mobile still pending. Simulated document.hidden validates lifecycle, not every browser throttling policy. Initial ItemArt fixed probe saw one settling frame at100ms;500ms settling passed. Earlier infestation probes corrected drawing-counter API and fixed-delay assumptions. Windows validate wrapper npx shell:false failure remains; direct gates are recorded. Prior .9 drawer timeout retained in history; unchanged-build diagnostic and final original passed, root cause unproven.

## Remaining technical debt

No new debt intended. Existing Windows validation launcher issue. Two untracked devlog drafts remain unpublished/unstaged. Native rotation controls address the previously recorded keyboard inspection gap.

## Recommended next tasks

Final ORIGINAL mobile27718 terminalPASS27nav+nine gameplay profiles on sealed build19916 (11.17s, SWmwb4izai, asset/assets/play-CSQGqZlk.js). All focused browser,23 UI/artwork/site/back tests and docs checks passed. Seven release notes sealed/generated. All handles terminal. Authorized production push pending; live remains2400521c2dbf87dda58e5e9f5d161fb4800e6cd2. Push authorized production ref, watch Actions exact-SHA guard, then run ../verify-current-release.ps1 against normal public URLs. Keep two devlog drafts unstaged. Goal remains active.

## Future expansion hooks

Follow shared motion preference resolution; preserve procedural art and deterministic gameplay. Production push: git push origin HEAD:refs/heads/claude/zen-hawking-rh1gxl from codex/hive-autoplay. Verify ../verify-current-release.ps1 against normal public URLs after Actions success. Mobile command uses ../chrome-probe-compat.cjs with Chrome headless=new. Goal remains active; no PR unless asked.
