# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-11-10 20:23 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** codex/hive-autoplay · **HEAD:** 5bc81994

## Summary of work completed

LOCAL unsealed v2026.11.10.12 Upgrade Guidance has one generated website note. ItemDetails disabled upgrades preserve their normal description and add exact material shortfalls or affix-lock/tier/rarity/no-affix reasons, based on existing opAvailable/canAfford/reforgeCost. Dashed border replaces faded text for readable disabled cards. ../upgrade-reasons-check.cjs PASS shortage, live funding, actual Enhance toT2, tier cap, locked affix, rarity cap, no-affix and320/844 layouts; screenshot inspected.27crafting/UI/site tests PASS4.59s; docs3686 PASS; build31876 PASS17.56s (SWmwb52fxx), upgrade-guidance-build.log. No simulation/save/cost/availability changes. Final release mobile pending.

LIVE v2026.11.10.11 Clearer Gear and Motion, SEVEN notes. SHA fdd8131f40aaed078f0c7e3932e8192accf95127. Actions42893701543/job130101131626 SUCCESS including exact-commit production guard. Normal custom-domain game/home/news/all7notes and entry asset verified20:20UTC by ../verify-current-release.ps1; asset/assets/play-CSQGqZlk.js. Final original mobile27718 passed27nav+nine gameplay profiles. Build19916 PASS11.17s,23focused tests and docs passed. Goal remains active; next approximate deployment21:20UTC.

## Files modified

- Source (3): `src/changelog/releases.gen.ts`, `src/ui/EquipmentPanel.css`, `src/ui/ItemDetails.tsx`
- Tests (0): —
- Docs (5): `docs/EQUIPMENT.md`, `docs/HISTORY.md`, `docs/PROJECT_MANIFEST.md`, `docs/devlog/DRAFT-2026-11-09.md`, `docs/devlog/DRAFT-2026-11-10.md`

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts`
- **equipment** — `src/ui/ItemDetails.tsx`
- Consumer ring (verify, unchanged): crafting

## Power Score changes

None. UI/render-only changes; equipment stats, preview derivation, simulation and save schema unchanged.

## UI changes

LOCAL unsealed v2026.11.10.12 Upgrade Guidance has one generated website note. ItemDetails disabled upgrades preserve their normal description and add exact material shortfalls or affix-lock/tier/rarity/no-affix reasons, based on existing opAvailable/canAfford/reforgeCost. Dashed border replaces faded text for readable disabled cards. ../upgrade-reasons-check.cjs PASS shortage, live funding, actual Enhance toT2, tier cap, locked affix, rarity cap, no-affix and320/844 layouts; screenshot inspected.27crafting/UI/site tests PASS4.59s; docs3686 PASS; build31876 PASS17.56s (SWmwb52fxx), upgrade-guidance-build.log. No simulation/save/cost/availability changes. Final release mobile pending.

Favorite/item salvage lock/affix lock now have stable accessible names and aria-pressed; randomize names its affix. Isolated ../item-toggle-check.cjs PASS real keyboard toggles and preserved salvage protection. Sealed .11 Clearer Gear and Motion with SEVEN generated notes. Final23 UI/artwork/site/back tests PASS4.59s; docs77844 PASS; build19916 PASS11.17s (SWmwb4izai), clearer-gear-release-build.log, asset/assets/play-CSQGqZlk.js. ORIGINAL final mobile27718 terminalPASS27nav+nine gameplay profiles, clearer-gear-release-mobile.log. Production advanced to fdd8131f40aaed078f0c7e3932e8192accf95127 and public URLs verified.

Salvage confirmation baseline at320x568: dialog top=-550.77,bottom=-341.23 after scroll730, entirely offscreen. ItemDetails now portals nested confirmation to viewport, uses alertdialog with linked warning, focuses Cancel, makes underlying box inert, traps Tab and restores invoking focus; Escape/backdrop/Cancel only cancel prompt.44px action targets and bounded scroll use shared --app-h. ../salvage-confirm-check.cjs final normal26417 and stronger-gear19618b probes PASS320/390/844: visible dialog, focus/trap, inert release, safe cancellation and actual isolated salvage. Warning screenshots inspected. Initial23test run82308 failed UI viewport-token rule; changed100dvh tovar(--app-h), replacement75347 passed23tests5.99s and build13.48s (SWmwb4exfh), salvage-confirm-build.log. Docs25457 PASS. Final full mobile27718 passed; gameplay/salvage rules unchanged.

Infestation motion/selection: browser probes passed live prefs, resize, pins, hidden lifecycle and keyboard region/sector selection. ItemArt: baseline30frames/500ms under reduced motion; fixed probe passed0frames, nonblank still, override/revoke, offscreen/hidden pause-resume and cleanup. HeroGearPreview: baseline29frames/500ms; fixed motion probe passed still drag with real equipment pixel change, motion prefs, visibility and cleanup. Idle rotation now uses elapsed time at prior60Hz speed. Native Left/Right44px buttons rotate by PI/8; focus pauses animation, blur out resumes. Real ItemDetails controls probe passed320/390/844, Enter/Space, Tab, stable focus image, opposite rotation restoring angle, target bounds/hit tests and reduced keyboard rotation. Expanded final probe also proved blur resumes; screenshots320/844 inspected. Final motion rerun passed. Fifteen artwork/UI/site tests PASS2.26s; docs32157 PASS; build47084 PASS15.52s, SWmwb47opn, gear-controls-build.log. Full original mobile64256 passed27nav+nine gameplay profiles BEFORE keyboard controls; final original mobile27718 subsequently passed.

## Documentation changes

Current .12: EQUIPMENT.md and manifest describe upgrade feedback; one UI note generated.

INFESTATION.md, EQUIPMENT.md and manifest updated. Seven curated UI notes generated for game and website. No new mechanic/reward/save field: no help registry, audio or migration change needed.

## Save changes

None. Browser probes used isolated profiles; ItemDetails fixture seeded a real equipment definition only in that profile.

## Known edge cases

Custom domain continued serving prior .10 for several minutes after successful Actions, including a diagnostic cache-bypassed request, then normal URLs verified .11 at20:20UTC without any redeploy/config change. Do not claim simple browser caching as proven cause. Connector job-log endpoint unsupported; local gh unavailable; read-only wrangler deployment list45063 failed missing auth (terminal). No further infrastructure action required after normal verification succeeded.

Full mobile64256 covers four-change build before native rotation controls; focused real ItemDetails browser covers those controls, final original mobile27718 subsequently passed. Simulated document.hidden validates lifecycle, not every browser throttling policy. Initial ItemArt fixed probe saw one settling frame at100ms;500ms settling passed. Earlier infestation probes corrected drawing-counter API and fixed-delay assumptions. Windows validate wrapper npx shell:false failure remains; direct gates are recorded. Prior .9 drawer timeout retained in history; unchanged-build diagnostic and final original passed, root cause unproven.

## Remaining technical debt

No new debt intended. Existing Windows validation launcher issue. Two untracked devlog drafts remain unpublished/unstaged. Native rotation controls address the previously recorded keyboard inspection gap.

## Recommended next tasks

All processes terminal. Continue evidence-led improvements in local unsealed .12 Upgrade Guidance; next approximate deploy21:20UTC. Before release, seal notes/generate website, final build and original full mobile, then verify deployment exact SHA and public URLs. Live .11 SHA fdd8131f40aaed078f0c7e3932e8192accf95127. Two devlog drafts remain unpublished/unstaged. Vite5174 may remain available; verify process command lines before cleanup.

## Future expansion hooks

Follow shared motion preference resolution; preserve procedural art and deterministic gameplay. Production push: git push origin HEAD:refs/heads/claude/zen-hawking-rh1gxl from codex/hive-autoplay. Verify ../verify-current-release.ps1 against normal public URLs after Actions success. Mobile command uses ../chrome-probe-compat.cjs with Chrome headless=new. Goal remains active; no PR unless asked.
