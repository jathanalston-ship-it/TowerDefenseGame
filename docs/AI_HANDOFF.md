# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-01 23:23 UTC · **Diff scope:** session block (5 commits, scaffolder ran post-commit)
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 145839e

## Summary of work completed

Five-part premium polish block: (1) Command Center living-lab redesign (`628ebdc`) — fog/vein/
parallax atmosphere, cc-vitals dashboard strip, deploy CTA breathe/sheen; (2) real music engine
(`83e8565`) — pure composition core (`src/audio/music.ts` TRACKS + `barNotes`) under a WebAudio
manager (lookahead scheduler, layers, crossfades, intensity seam), six categories, App/GameView
drive `music.play(category)` only; (3) gameplay HUD redesign (`145839e`) — vital hierarchy with
per-cell `--hud-acc` accents, Power promoted to primary, glass cells, heartbeat danger pulse,
responsive `clamp()` scale, four-viewport no-clip sweep; (4) Power full-coverage audit
(`5ffd439`) — fixed the tower-branch bypass (`branchPowerEffects`) + the hero-slot miss
(`HERO_SLOT_POWER`), runtime tripwires (`game.powerAuditWarnings`, `powerAnnounceWarnings`),
21-source table in docs/POWER-AUDIT.md; (5) Power feel (`4d278c5`) — `announcePower` bus →
PowerToaster + `audio.cue('power')`, rolling PowerBadge, PowerPreview (current/new/diff/impact)
on every upgrade surface. The one thing to know: **the run-soundtrack `useEffect` in
GameView.tsx must stay a top-level hook** — a nested insertion crashed every run mount (React
#321) and was caught only by the headless HUD sweep.

## Files modified

- Source: `src/audio/music.ts` (new), `src/audio/sound.ts`, `src/core/power.ts`,
  `src/core/game.ts`, `src/state/meta.ts`, `src/state/powerEvents.ts` (new),
  `src/ui/components/PowerToaster.tsx` (new), `src/ui/components/PowerScore.tsx`,
  `src/ui/App.tsx`, `src/ui/GameView.tsx`, `src/ui/Hud.tsx`, `src/ui/PlayScreen.tsx`,
  `src/ui/LabAtmosphere.tsx`, `src/ui/HeroLab.tsx`, `src/ui/TowerLab.tsx`,
  `src/ui/EvolutionHQ.tsx`, `src/ui/HeroEvolutionPanel.tsx`, `src/index.css`
- Tests: `src/audio/music.test.ts` (new), `src/core/runPower.test.ts` (new),
  `src/state/powerEvents.test.ts` (new), `src/state/powerIntegration.test.ts`
- Docs: `docs/POWER-AUDIT.md` (new), `docs/GAME-FEEL.md` §music, `docs/POWER-SCORE.md` §feel,
  `docs/UI-STANDARDS.md`, `docs/PROJECT_STATUS.md`, `docs/VALIDATION_REPORT.md`

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

None — save layer untouched (v19; goldens byte-identical all five commits).

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

- `music.setIntensity` is wired to a coarse boss/combat split (0.5/1.0) — the per-wave threat
  mapping is the open seam.
- Giant-file ranking unchanged (`game.ts`, `meta.ts`, `index.css`) — see ENGINEERING-AUDIT §4.

## Recommended next tasks

1. Dynamic music intensity: map live threat (wave pressure, core damage) → `music.setIntensity`
   in GameView's soundtrack effect.
2. Card Ascension gameplay wire + ceremony (backend shipped in Gene Task 10).
3. Content wave through the validators (towers/heroes/cards).

## Future expansion hooks

- `music.setLayerGain(id, gain)` — per-layer ducking (e.g. mute lead under dialogue).
- `TRACKS.events` — authored but unused; wire to limited-time events when they exist.
- `powerEvents.onPowerGain` — any future surface (results screen, animations) can subscribe.
