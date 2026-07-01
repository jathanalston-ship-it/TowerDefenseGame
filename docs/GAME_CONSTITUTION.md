# GAME_CONSTITUTION.md — the permanent development ruleset

> **MANDATORY.** These rules are non-negotiable for every contributor and every Claude session.
> They are not aspirations: most are machine-enforced (the ENFORCED BY column names the tool that
> turns violations red). Where enforcement is human, `npm run validate` flags the surface and the
> validation report records the decision. Amending this document is itself a reviewed change.

## The rules

| # | Rule | Enforced by |
|---|---|---|
| 1 | **Every progression system updates the Power Score.** Permanent player power invisible to Power is a defect. | `cardProblems` Power-visibility validator; `POWER_RELEVANT_FIELDS` coverage; power/preview tests |
| 2 | **Every collectible updates the Collection.** New content types get a codex category or entry path. | registry-driven `collectionView` (content registries feed it); human pass flagged by `npm run validate` |
| 3 | **Every permanent feature updates Tutorials/onboarding.** New players must be able to learn it in-game. | registry `tutorial`/`help` fields + validate ⚑ flags; mechanics registry is one data row |
| 4 | **Every new mechanic updates HUD Help.** A `MechanicDef` row (what/why/where/next) — wiki + What's New ride free. | `systemRegistry.test.ts` resolves help ids against `MECHANICS`; validate ⚑ |
| 5 | **Every new UI screen follows the UI standards.** Tokens, shared components, motion language — no bespoke styling. | `docs/UI-STANDARDS.md` + shared `ui/components/*`; UI-drift checks in the standards doc |
| 6 | **Every new reward has audio feedback.** A reveal without a cue is unfinished. | `audio.cue(tag)` — validate checklist (Audio area) on reward-surface changes |
| 7 | **Every new progression system has campaign gating** (or an explicit, documented reason it does not). | gates are data (`GENE_LEVEL_GATES` pattern); registry `dependsOn: ['campaign']` makes it visible |
| 8 | **Every new content type has localization support registered.** No i18n layer exists yet — so every system's string surface is declared (`localization: 'inline-en'`) for the day it lands. | `systemRegistry` field is required by the type; orphan test forces registration |
| 9 | **Every new feature has documentation.** A canonical doc, listed in the registry, referenced from `PROJECT_MANIFEST.md`. | registry `docs` existence test; doc ANCHORS pin stated values to live code; `npm run docs:check` staleness |
| 10 | **Every save modification has migration support.** Additive `withDefaults` + per-field sanitizer + a migration test. | `saveStore.test.ts` patterns; registry `save` fields resolve against `defaultSave()` |
| 11 | **Every implementation includes regression testing.** New behavior = new tests; run `npm run validate` and commit the report after major work. | the suite + `docs/VALIDATION_REPORT.md` |
| 12 | **The sim stays deterministic and headless.** `src/core/` never imports React/DOM/state/ui/render; a fresh save simulates byte-identical. | golden characterization tests; the core/UI split |
| 13 | **Content is data, never code paths.** New towers/heroes/cards/items/bosses are registry rows + effect DSL — no per-item `switch` ladders. | `Registry<T>` + dev-boot `validateContent` |
| 14 | **Every new system registers in the dependency registry.** Files, deps, surfaces, docs — before it merges. | the ORPHAN-FILE test (`src/dev/systemRegistry.test.ts`) fails the build otherwise |
| 15 | **Balance numbers live in config/data**, tunable and reviewable in one place — never scattered through logic. | convention + review; `core/config.ts` and per-system data tables |
| 16 | **Destructive player actions are guarded and reversible** (tiered confirms, undo windows, backups). | equipment safeguards + save backups as the precedent; validate ⚑ on new destructive flows |
| 17 | **Minimal diffs, no drive-by rewrites.** A rewrite that could have been a three-line edit is a defect. | CLAUDE.md discipline; review |

## The workflow every feature follows

1. **Before coding:** read `docs/PROJECT_MANIFEST.md` (the system map) and
   `docs/DEPENDENCY_GRAPH.md` (the blast radius of what you're touching). Check
   `docs/PROJECT_STATUS.md` + `docs/AI_HANDOFF.md` for live context.
2. **While coding:** obey rules 1–17. New files must be claimed in
   `src/dev/systemRegistry.ts`; new doc-stated numbers get an ANCHOR in `src/dev/docSync.ts`.
3. **After coding:** `npm run validate` (typecheck + full suite + doc sync + blast radius →
   `docs/VALIDATION_REPORT.md`). Resolve every ⚑ flag — update the doc/UI/Help surface or record
   "no change needed". Regenerate the graph if the registry changed (`npm run docs:graph`).
4. **Before ending the session:** `npm run handoff` scaffolds `docs/AI_HANDOFF.md` from the real
   diff — fill the judgment sections; update `docs/PROJECT_STATUS.md`. Commit both.

## Amendment process

A rule changes only by editing this file in a dedicated commit that explains WHY, updates the
enforcement column, and adjusts the tooling in the same change. Silent exceptions don't exist —
if a rule blocks something legitimate, amend the rule, don't dodge it.
