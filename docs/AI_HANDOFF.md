# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-01 22:09 UTC · **Diff scope:** the engineering-infrastructure block (commits `18599af` → `6bdc478` + this one)
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD at scaffold:** 6bdc478

## Summary of work completed

This session closed the 12-task **Gene Card Evolution** program (permanent collectible cards:
Essence economy, 168 authored upgrade levels, the Gene Archive, campaign gates, starting
loadouts, Power integration, Ascension backend, onboarding, final audit + 500-card stress test —
see `docs/GENE-AUDIT-REPORT.md`), then executed the **engineering pivot**: repo-wide audit +
dedupe refactors (`docs/ENGINEERING-AUDIT.md`), the first-read system map
(`docs/PROJECT_MANIFEST.md`), and the **automation core** — a dependency registry with orphan
enforcement, generated `docs/DEPENDENCY_GRAPH.md`, doc↔code ANCHOR checks that fail the suite on
drift, and `npm run validate` (the 19-area regression audit that writes
`docs/VALIDATION_REPORT.md`). The one thing to know: **the tooling is load-bearing now** — new
files must be registered, doc-stated numbers must match code, and the graph must be regenerated,
or `npm test` goes red with instructions.

## Files modified

- Source: `src/dev/systemRegistry.ts` + graph builder/doc-sync/enforcement tests, `src/save/derive.ts`,
  `src/core/math.ts` + dedupe touch-ups across 21 files (commit `18599af`), the gene system
  (~25 files, commits `9f88594`…`0cce54b`).
- Scripts: `scripts/gen-depgraph.ts`, `scripts/doc-sync.ts`, `scripts/validate.ts`, `scripts/handoff.ts`.
- Docs: `docs/PROJECT_MANIFEST.md`, `docs/ENGINEERING-AUDIT.md`, `docs/DEPENDENCY_GRAPH.md` (generated),
  `docs/VALIDATION_REPORT.md` (generated), `docs/GAME_CONSTITUTION.md`, `docs/PROJECT_STATUS.md`, this file,
  plus reconciliations (GENE-EVOLUTION, GAME-STATE, CARDS, ECONOMY, CODEMAP, HELP, TUTORIAL).

## Systems affected (from the dependency registry)

- **gene-cards** — the entire permanent-progression pillar (complete, audited).
- **dev-registry** — new: the registry + doc tooling itself.
- **meta-store / ui-kit / hub-shell / run-ui / loot** — dedupe refactors (behavior-identical).
- Consumer ring at the time: every Power consumer (previews verified equal to outcomes by test).

## Power Score changes

`GENE_POWER_SCALE = 0.15` calibration (maxed 45-card library ≈ ×2.26 on the meta bucket,
test-pinned ×2–2.6); gene collection folds linearly incl. the Ascension seam; bypass validation
in `cardProblems` (every authored level/tier must be Power-visible). No other Power math moved.

## UI changes

Gene Archive (grid/inspect/loadout bar/search/sort/help collapsible), Play screen loading tips,
HUD Tour 13th stop, Help wiki gene mechanics, Collection gene-level labels, gene run-start
splash. All headless-smoke verified against built dists.

## Documentation changes

Everything above plus: the manifest is now the FIRST READ (CLAUDE.md/README/CODEMAP/GAME-STATE
point to it), and doc ANCHORS pin: save version, content counts, gene gates, conversion rates,
cost base, loadout slots, GENE_POWER_SCALE.

## Save changes

Schema `CURRENT_VERSION = 19` (`geneSlots`, `geneLoadout`; v18 added `genes`, `geneEssence`).
Additive migrations + sanitizers test-pinned (`src/save/saveStore.test.ts`), including
manipulated-state clamps. `src/save/derive.ts` is the new cycle-free home for shared derivations.

## Known edge cases

- The gene-cards test band (×2–2.6 maxed) FAILS BY DESIGN when the card library grows — that is
  the recalibration reminder for `GENE_POWER_SCALE`, not a bug.
- vitest runs node-side: registry tests read the real fs; the graph freshness test requires
  regenerating `docs/DEPENDENCY_GRAPH.md` in the same commit as registry edits.
- Type-only import cycles are INTENTIONAL (erased at compile) — don\'t "fix" them; see
  `docs/ENGINEERING-AUDIT.md` §3.
- Ascension is backend-only ON PURPOSE: one deliberately-unwired gameplay seam
  (`effectiveGeneEffects` third arg at the run seams).

## Remaining technical debt

Ranked in `docs/ENGINEERING-AUDIT.md` §4: game.ts monolith → meta.ts God-module → index.css
monolith → rarity-color ×4 (a deliberate visual pass) → scale-coupled constants → no
lint-enforced import direction.

## Recommended next tasks

1. UI standards + component-library pass (in progress as this handoff is written — see
   `docs/PROJECT_STATUS.md`).
2. Ship Card Ascension (backend complete; content + one wire + ceremony).
3. `src/state/meta.ts` split behind its façade (ENGINEERING-AUDIT §5.2).
4. CI guards: madge --circular + ts-prune (§5.6).

## Future expansion hooks

- `src/core/geneCards.ts`: `geneAscensionPowerMult` / `geneEffectiveRarity` / `geneArtKey` (+
  `def.ascension.tiers` authoring).
- `src/save/derive.ts`: add shared derivations here, never re-inline.
- `src/dev/docSync.ts` `docAnchors()`: add an anchor whenever a doc states a code-owned number.
- `scripts/validate.ts` AREAS: add a row when a new always-verify area emerges.
