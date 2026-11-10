# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-11-10 22:08 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** codex/hive-autoplay · **HEAD:** 71100c63

## Summary of work completed

LOCAL unsealed v2026.11.10.14 Clearer Help and Previews now has FOUR notes. Reforge baseline at 320x568 in a transformed lab placed the card at y=-3320 and left focus on the spin button. Shared Popup portal, responsive scrollable card and modal focus lifecycle now pass real-browser checks at 320x568, 844x340 and 390x844. Both normal (1000 Ichor) and last-affordable (40 Ichor) fixtures pass focus entry/result/Tab/Shift+Tab/Escape/return, and verify no second charge or roll alteration. Phone screenshot inspected. 22 model/UI/site tests passed in 2.58s; build58938 passed (5.59s Vite, SWmwb8rjat); docs and handoff62070 passed. All processes terminal. Website note generated; not deployed. LIVE remains .13 at da7800db61388e86c9a7a987b6bb823a6bd48e20, verified21:48UTC. Next approximate deployment22:50UTC; goal active.

## Files modified

- Source (3): `src/changelog/releases.gen.ts`, `src/ui/MulliganLab.css`, `src/ui/MulliganLab.tsx`
- Tests (0): —
- Docs (5): `docs/HISTORY.md`, `docs/MULLIGANS.md`, `docs/PROJECT_MANIFEST.md`, `docs/devlog/DRAFT-2026-11-09.md`, `docs/devlog/DRAFT-2026-11-10.md`

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts`
- **mulligans** — `src/ui/MulliganLab.tsx`
- Consumer ring (verify, unchanged): hero-symbiotes, nucleus

## Power Score changes

None. Search presentation only; progression, rewards and simulation unchanged.

## UI changes

Reforge baseline at 320x568 in a transformed lab placed the card at y=-3320 and left focus on the spin button. Shared Popup portal, responsive scrollable card and modal focus lifecycle now pass real-browser checks at 320x568, 844x340 and 390x844. Both normal (1000 Ichor) and last-affordable (40 Ichor) fixtures pass focus entry/result/Tab/Shift+Tab/Escape/return, and verify no second charge or roll alteration. Phone screenshot inspected. 22 model/UI/site tests passed in 2.58s; build58938 passed (5.59s Vite, SWmwb8rjat); docs and handoff62070 passed. All processes terminal. Website note generated; not deployed.

## Documentation changes

HELP.md, MULLIGANS.md, NUCLEUS.md and manifest updated. Four curated UI notes generated into game and website artifacts. No simulation, graft costs, Power or save changes; no new mechanic/help/audio registration needed.

## Save changes

None — save layer untouched.

## Known edge cases

Final release mobile required before .14 deployment. Existing Windows validate wrapper spawnSync npx with shell:false cannot launch its children; direct gates are recorded. Prior .13 release passed all 3,194 tests across354files and original27nav/nine gameplay viewport profiles. Normal public-domain verification is required after Actions; propagation can lag.

## Remaining technical debt

No new debt. Existing Windows validation launcher issue. Two untracked devlog drafts remain unpublished/unstaged.

## Recommended next tasks

Continue evidence-led improvements, then seal/generate/final build/full suite and original mobile for .14 before the approximate22:50UTC deployment. Verify exact-SHA workflow and normal public game/home/news. Do not use web search cached crawl as current deployment evidence. Leave both untracked devlog drafts unpublished.

## Future expansion hooks

Production push from codex/hive-autoplay: git push origin HEAD:refs/heads/claude/zen-hawking-rh1gxl. Verify ../verify-current-release.ps1. Original mobile uses MOBILECHECK_CHROMIUM and node -r ../chrome-probe-compat.cjs node_modules/vite-node/vite-node.mjs scripts/mobilecheck.ts --no-build. Avoid dist writes or competing heavy/browser tasks during mobile. Every deployment includes website notes.
