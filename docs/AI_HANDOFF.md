# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-02 · **Diff scope:** identity-unification session block (identity 7b588ce · Tower Lab f9ea67e · live Mastery HEAD)
- **Branch:** claude/zen-hawking-rh1gxl

## Summary of work completed

Identity-unification session (three prompts in one): (1) full visual/audio/animation audit
(15 findings → docs/UI_STYLE_GUIDE.md Appendix A) + unification pass (type/tracking scales
enforced by uiStandards, phantom webfonts removed, --panel-deep + glow geometry tokens,
themed scrollbars, toast rails, legacy drone RETIRED → music.setIntensity now live from
battlefield pressure) + the permanent identity trilogy (VISUAL_IDENTITY / UI_STYLE_GUIDE /
DESIGN_LANGUAGE, doc-sync anchored to :root); (2) Tower Lab v2 — specimen rail
(search/sort/filter/favorites/badges, device prefs) + mutation-chamber showcase (animated
portrait + future form, Power contribution, future path, full Mastery ledger); (3) live
Mastery — masteryXpRaw/masteryXpMults shared with finishRun (zero drift), GameView projects
per-tick, MasteryToaster + craft chime + battlefield rings + trauma pulse on level-ups,
Inspector craft bar with floating XP, Results per-tower ledger with ✦ top contributor,
LifetimeStats per-tower damage/bestWave (schema v19→v20), Help wiki entry, MASTERY.md §9.
Know: the run loop's 80ms block now drives loot + mastery projection — keep additions there
throttled; toast rails are fixed bands (loot 64 / power 128 / mastery 192, achievements
top-center).

## Files modified

- Source: `src/index.css` (unification + tl2 + toasts), `src/ui/TowerLab.tsx` (v2 rewrite),
  `src/ui/towerLabModel.ts` (+roster/mastery-panel/future-path), `src/ui/Inspector.tsx`
  (+craft bar), `src/ui/GameView.tsx` (projection watcher + rings + intensity), `src/ui/Results.tsx`
  (ledger), `src/state/masteryEvents.ts` (new), `src/ui/components/MasteryToaster.tsx` (new),
  `src/state/prefs.ts` (+lab prefs), `src/state/meta.ts` (masteryXpRaw/masteryXpMults),
  `src/state/stats.ts` + `src/core/types.ts` + `src/save/saveStore.ts` (v20 ledgers),
  `src/core/mastery.ts` (+nextMasteryUnlock), `src/state/mechanics.ts` (+tower-mastery),
  `src/audio/sound.ts` (drone removed; +mastery chime), `src/dev/docSync.ts` (+CSS anchors),
  `src/dev/uiStandards.test.ts` (+type/tracking scales)
- Tests: `src/state/stats.test.ts` (+ledger/migration)
- Docs: `docs/VISUAL_IDENTITY.md` + `docs/UI_STYLE_GUIDE.md` + `docs/DESIGN_LANGUAGE.md` (new),
  `docs/MASTERY.md` §9, `docs/STYLE-GUIDE.md` + `docs/BIOMES.md` repointed, boards refreshed

## Systems affected (from the dependency registry)

- Power (core/power.ts scoring + state/powerEvents.ts announce bus + UI feel surfaces)
- Audio (music engine sits beside sound.ts; registry claims both under audio)
- HUD / Command Center / menu shell (ui system)

## Power Score changes

- `BRANCH_TIER_POWER = 0.05` — branch tiers now score via `branchPowerEffects` folded into
  `game.powerEffects()` (temporary bucket). **This closed the user-reported bypass.**
- `HERO_SLOT_POWER = 0.1` — meta bucket multiplies per unlocked slot beyond the first.
- Any new temp-power source must keep `game.powerAuditWarnings` empty (tripwire warns on
  no-gain purchases); meta-side sources must `announcePower` (tripwire in powerEvents.ts).

## UI changes

PowerToaster (menu + in-run), PowerPreview on TowerLab/EvolutionHQ/HeroLab/HeroEvolutionPanel,
rolling PowerBadge, HUD hierarchy restyle, Command Center atmosphere + cc-vitals. All pass
`uiStandards.test.ts` (tokens, radii, durations).

## Documentation changes

docs/POWER-AUDIT.md registered under the power system (anchors enforced); GAME-FEEL/
POWER-SCORE/UI-STANDARDS sections appended; PROJECT_STATUS block refreshed. No change needed
elsewhere — doc-sync anchors green in `npm test`.

## Save changes

Schema v19→v20: `LifetimeStats.towerDamage` + `towerBestWave` (zero-fill merge for older
saves, pinned by stats.test.ts; goldens byte-identical).

## Known edge cases

- GameView hooks: gene-splash effect ends right before the run-soundtrack effect — do not
  anchor code insertions on the first `return (` in that file.
- Music can't be *heard* in this environment; correctness is pinned by the 8 pure-composition
  tests (progression/percussion/bass/melody/structure/determinism/scale membership).
- HUD "text-clip" sweep hits on `.hud-cell`/`.tt` are false positives from hidden absolute
  `.tt-bubble` tooltips inflating scrollWidth — verify with screenshots, not scrollWidth alone.
- `chooseCard` only audits temp power when `effectsPower(effects) > 1` (utility cards may
  legitimately score 0).

## Remaining technical debt

- ~~music intensity coarse split~~ CLOSED: intensity now tracks live battlefield pressure.
- Giant-file ranking unchanged (`game.ts`, `meta.ts`, `index.css`) — see ENGINEERING-AUDIT §4.

## Recommended next tasks

1. Card Ascension gameplay wire + ceremony (backend shipped in Gene Task 10).
2. Content wave through the validators (towers/heroes/cards).
3. Hero mastery live projection (towers wired; heroes ride the same bus — data change).

## Future expansion hooks

- `music.setLayerGain(id, gain)` — per-layer ducking (e.g. mute lead under dialogue).
- `TRACKS.events` — authored but unused; wire to limited-time events when they exist.
- `powerEvents.onPowerGain` — any future surface (results screen, animations) can subscribe.
