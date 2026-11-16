# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-11-16 00:49 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** codex/hive-autoplay · **HEAD:** bc1b006c

## Summary of work completed

The sealed v2026.11.16 Clearer Affix Controls release combines named randomize costs and shortages with shared effect descriptions for rolled affixes. Both notes are generated for the website and the in-game briefing. Production branch was verified at 59b261e56d48bc93e2f36006bae516be9bcc4f8b before release.

## Files modified

- Source (4): `src/changelog/releases.gen.ts`, `src/core/effectLanguage.ts`, `src/core/equipment.ts`, `src/ui/ItemDetails.tsx`
- Tests (1): `src/core/equipment.test.ts`
- Docs (5): `docs/EQUIPMENT.md`, `docs/HISTORY.md`, `docs/PROJECT_MANIFEST.md`, `docs/devlog/DRAFT-2026-11-09.md`, `docs/devlog/DRAFT-2026-11-10.md`

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts`
- **equipment** — `src/core/equipment.ts`, `src/ui/ItemDetails.tsx`
- **gene-cards** — `src/core/effectLanguage.ts`
- Consumer ring (verify, unchanged): crafting, doctrines, engine

## Power Score changes

Equipment retains its existing scaling and aggregation. Focused equipment, combat behavior and shared effect-language tests passed (33).

## UI changes

Item Details describes rolled affix effects through the shared vocabulary, with up to two decimal places for percentages and scaled counts. The previous checkpoint verified named randomize costs, lock and shortage guidance, and the exact purchase debit in a 320px browser.

## Documentation changes

EQUIPMENT and PROJECT_MANIFEST explain affix descriptions. Website notes and in-game notes come from the same sealed ledger. Other registry docs, Help and tutorials need no changes for this wording update.

## Save changes

None — save layer untouched.

## Known edge cases

Use the exact transformed ItemDetails meta import in browser fixtures to share save state with the screen. Preserve the two untracked devlog drafts.

## Remaining technical debt

Local Chrome needs MOBILECHECK_CHROMIUM and the parent chrome-probe-compat.cjs preload for the mobile gate.

## Recommended next tasks

The sealed v2026.11.16 Clearer Affix Controls release passed release validation. The initial audit passed production build, mobile layout and documentation. The Threat assertion was corrected to compare the complete Power outcomes of matched runs. Final-tree typecheck passed and all 3,194 tests across 354 files passed in the full rerun. Production source and assets match the mobile-tested build /assets/play-BC-EWbxo.js. Both website and in-game notes are generated. Clearer Affix Controls v2026.11.16 is live. Commit f89a9f889783e867a4a8c0c829071a5666356235 passed GitHub Actions run 43785632332 and production job 133032503684, including the exact commit check. The normal public play URL serves the tested asset /assets/play-BC-EWbxo.js. Public homepage and both news notes verified. The initial public asset lag cleared on recheck. Next work is manual cutscene caption announcements. The browser fixture cutscene-caption-announcement-check.cjs is prepared.

## Future expansion hooks

Production push uses git push origin HEAD:refs/heads/claude/zen-hawking-rh1gxl. Public game, homepage, news and asset verifier is ../verify-current-release.ps1. Keep a website note with each release.
