# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-18 17:40 UTC · **Diff scope:** batch commit 399935b + rituals
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 399935b

## Summary of work completed

**The ICON LANGUAGE batch** (user brief: icon-first UX — "text is confirmation, visuals
are communication"). `src/ui/iconLanguage.tsx` federates every existing identity axis
(effect categories, currency silhouettes, reward art, status colors, nav/feature glyphs,
rarity tokens) and adds the missing one: **ACTIONS** — 19 verb/state identities that
codify glyphs the UI already spoke (⚡ Best-Value, ◈ Ready Chain, 🔒 teasers, ⛨ equip).
The one thing to know: **`src/dev/iconLanguage.test.ts` is the inheritance contract** —
a new currency/reward/status/screen without a visual identity fails CI (it caught the
glyph-less `haste` status on its very first run). The `.act-<verb>` CSS block MIRRORS the
ACTIONS table — change them together, and never add an act-* class to a button whose text
already contains the glyph.

## Files modified

- Source (6): `src/ui/iconLanguage.tsx` (NEW), `src/ui/HubLanding.tsx`, `src/ui/TowerLab.tsx`,
  `src/ui/DraftModal.tsx`, `src/index.css` (.ico + .act-* + density marks), CTA class adds in
  QuestBoard/DirectivesCard/BattlePassScreen/LiveEventsPanel/HarvestScreen/GeneticVault/
  EquipmentPanel/GeneArchive; `src/dev/systemRegistry.ts` (ui-kit claims the library)
- Tests (1): `src/dev/iconLanguage.test.ts` (NEW — the inheritance contract)
- Docs (4): `docs/ICON-LANGUAGE.md` (NEW standard), `docs/UI-STANDARDS.md` §5 pointer,
  `docs/GAME-STATE.md` compressed summary, DIL knowledge edge + regens

## Systems affected (from the dependency registry)

- **ui-kit** — the library + primitive + button-verb convention
- **chronicle** — releases.gen.ts (notes run)

## Power Score changes

None — presentation only; zero sim/meta logic touched.

## UI changes

Verb glyphs on every major primary CTA (claims ✹, collect ⤓, opens ◉, upgrades ⇧,
equip ⛨); draft keywords carry category glyphs inline; Tower Lab stat chips carry stat
glyphs; landing attention rows lead with the target screen's glyph; rec kind chips lead
with the verb glyph. mobilecheck CLEAN (29 screens × 6 viewports); uiStandards green;
live screenshots verified (Tower Lab + Mission Hub landing at 1440×900).

## Documentation changes

- `docs/ICON-LANGUAGE.md` — NEW: axes, the action table, rules, inheritance contract,
  density map, honest deferrals.
- `docs/UI-STANDARDS.md` §5 — verb-icon rule for buttons.
- `docs/GAME-STATE.md` — compressed system summary added.
- `docs/CHANGELOG-PIPELINE.md` — no change needed.

## Save changes

None.

## Known edge cases

- **Never double a glyph**: a button whose TEXT already contains the concept glyph
  (Auction "Buy now — ◆ 200") must not take the act-* class (tried, reverted in-batch).
- STATS deliberately aliases effect-category glyphs (dps/damage ▲) — do not "fix" that
  as a duplicate; uniqueness is enforced per axis, not globally.
- `Ico stat={label.toLowerCase()}` returns null for unmapped labels (Splash/Targets/
  Overcharge/Aura) — silent degradation is intended; add STATS rows only for universal
  concepts.
- Filled `.primary` buttons force `::before { color: inherit }` — tinted verb colors are
  for quiet/outline buttons only (contrast).

## Remaining technical debt

- The `.act-*` CSS mirrors ACTIONS by hand (documented pairing); a build-time generator
  would remove the drift risk if the table starts churning.
- Long-tail secondary buttons adopt act-* opportunistically; the 3-tier tooltip primitive
  and bestiary/inspector status-glyph adoption are named deferrals (ICON-LANGUAGE.md §6).

## Recommended next tasks

1. Adopt `<Ico status=…>` in the Bestiary/Inspector status readouts (the map exists,
   those screens just haven't been touched since).
2. The shared layered-tooltip primitive (icon → short → expanded → exact) in ui-kit,
   replacing per-screen dwell/long-press implementations.

## Future expansion hooks

- `iconLanguage.ACTIONS` — add a row + mirrored `.act-*` rule for any new verb.
- `iconLanguage.STATS` — extend for new universal display stats.
- `<Ico>` `title` mode — the sanctioned icon-only pattern (aria-labeled) for dense chips.
