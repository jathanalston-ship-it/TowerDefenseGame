# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-11 22:06 UTC · **Diff scope:** session (draconic follow-up → 9127c88 + chronicle/site regen)
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 9127c88

## Summary of work completed

Shipped the **HERO SYMBIOTE SYSTEM** (9127c88, docs/HERO-SYMBIOTES.md) — the champion wing of
the Mulligan pillar: every hero hosts 3 gated slots × 3 organ seats from a 36-species catalog;
the kit is BEHAVIOR VERBS only (structurally unable to duplicate Hero Equipment stats), with
per-slot Complete Hero Adaptations, category-census Resonance, per-hero identity trials (Ichor),
staged visual mutation, and full Power/Genome/Collections/achievements recognition. The one thing
the next session must know: **hero KILLING-BLOW credit now exists** (`Enemy.lastHitHero` →
`heroMasteryAccrual[].kills` → lifetime `save.heroKills`) — it was previously never incremented,
the symbiote gates read it, and the kill verbs trigger from it. Save schema bumped to **v41**
(`heroSymbiotes`). Rebased over upstream legal/contact commits before pushing; suite re-verified.

## Files modified

- New core/render/UI: `src/core/heroSymbiote.ts`(+test), `src/render/heroSymbiotes.ts`(+test),
  `src/ui/SymbioteChamber.tsx`, `docs/HERO-SYMBIOTES.md`
- Seams: `src/core/types.ts` (HeroSymbioteKit, HeroMods.symbiote, Enemy.lastHitHero, Hero.echo*),
  `src/core/game.ts` (foldHeroSymbiotes + 10 presence-gated reads + castHeroEcho + kill credit),
  `src/core/config.ts` (SYMBIOTE tunables), `src/state/meta.ts` (fold + 7 actions/selectors +
  power + genome + collection ctx), `src/save/saveStore.ts` (v41) + envelope/devReset,
  `src/core/genomeRank.ts`, `src/core/collection.ts`, `src/state/achievements.ts`,
  `src/security/registry.ts`, `src/state/heroView.ts`, `src/ui/HeroLab.tsx`,
  `src/ui/components/HeroPortrait.tsx`, `src/ui/GameView.tsx`, `src/render/renderer.ts`
- Governance: systemRegistry (`hero-symbiotes`), DIL knowledge edges, DEPENDENCY_GRAPH/DIL_GRAPH
  regen, GAME-STATE/HEROES/PROJECT_MANIFEST sections, chronicle + site regen

## Systems affected (from the dependency registry)

- **hero-symbiotes** (new) — depends on mulligans/heroes/content-infra/power/meta-store/genome-rank
- **heroes**, **engine**, **power**, **collection**, **genome-rank**, **achievements**,
  **meta-store** (save v41), **chronicle**

## Power Score changes

`accountSymbiotePower` multiplies the **mulligans** PowerParts bucket (pillar precedent:
`nucleusPower`); exactly ×1 while no slot is complete ⇒ POWER_BASE preserved. Organ powerWeights
mirror Mulligan magnitudes; adaptations +6%/+2.5%, resonance +6%. announcePower fires on
upgrade/seat actions.

## UI changes

Hero Lab gains the **Symbiote Chamber** section (slot cards with trial checklists + two-step
Ichor confirm, organ conservatory, recommendation line — reuses the Nucleus `ncl-*` console
primitives), a Symbiosis chip in the stat strip, and the portrait now overlays the LIVE in-run
graft layer (`drawHeroSymbiotes` on a canvas). mobilecheck: CLEAN across all four viewports.

## Documentation changes

`docs/HERO-SYMBIOTES.md` (new, canonical) · HEROES.md §symbiotes pointer · GAME-STATE.md system
block + `CURRENT_VERSION = 41` anchor · PROJECT_MANIFEST.md §Hero Symbiotes + index ·
DEPENDENCY_GRAPH/DIL_GRAPH regenerated · docs/CHANGELOG-PIPELINE.md: no change needed (chronicle
ran normally; 1 pre-existing upstream commit remains ⚑-flagged in HISTORY.md, not this session's).

## Save changes

**v40 → v41**: `heroSymbiotes: Partial<Record<HeroKind, HeroSymbioteState>>` (sparse; per-host
`unlocked/slots/grown/adapted/resonated/evolved`). Additive: `withDefaults` seeds `{}`,
`sanitizeHeroSymbiotes` drops unknown kinds/ids, clamps levels, enforces per-host seat
exclusivity. Envelope `heroes` module + devReset `heroes` scope carry it; conflict merge keeps
the primary side (nucleus parity).

## Known edge cases

- Hero kill credit lands on KILLING BLOWS from the strike/ability paths only — deferred
  projectiles (Vitriol siege shells, symbiote splinters) carry no hero source, matching the
  pre-existing damage-credit semantics. Gate kill thresholds were tuned to that reality.
- `foldHeroEquip` early-returns on gear-less rosters — symbiote strike verbs therefore fold in
  their OWN pass (`foldHeroSymbiotes`, called after it). Do not move that call before pass 2:
  the gear clones would clobber the lists.
- The echo re-cast (`castHeroEcho`) deliberately skips the crit roll, relic hooks, tutorial
  events, and repositioning — keep it that way or the golden rng/count contracts drift.
- `heroStatuses`/`heroKits` maps are cloned-from-globals on first symbiote/gear touch; a hero
  with BOTH gear and symbiotes appends symbiote verbs onto its gear clone (ordering matters).

## Remaining technical debt

- Slot II/III gate thresholds (kills/mastery/stage) are first-pass calibrations — run the
  persona simulator over them next balance pass (heroKills accrual is brand-new, so no
  historical data existed to calibrate against).
- The Symbiote Chamber reuses `ncl-*` CSS wholesale; if the Nucleus console is ever reskinned,
  split the shared classes into a named console primitive first.
- Mechanics/help has no dedicated symbiote teach row yet (the chamber is self-describing; add a
  row when the next teach-coverage pass runs).

## Recommended next tasks

1. Persona-simulator pass over `HERO_SYMBIOTE_GATES` thresholds (entry: scripts/ + core/heroSymbiote.ts gate book).
2. Mechanics registry teach row + Help wiki entry for symbiotes (entry: state/mechanics.ts).
3. Consider surfacing symbiote next-steps in the Next-Goal engine (entry: state/nextGoal read of
   `meta.heroSymbioteGate` rows).

## Future expansion hooks

- New organ = one `symbioteRegistry` row (`core/heroSymbiote.ts` — validator enforces the cell
  coverage + no-stat-dupe contract).
- New verb = one optional `HeroSymbioteKit` field (`core/types.ts`) + one presence-gated seam
  read in `core/game.ts` (see the DIL edge `hero-symbiotes modifies engine` for the seam map).
- New hero = its `HERO_SYMBIOTE_GATES` pair (compiler-enforced) + `HERO_SYMBIOTE_VISUALS` stages
  (test-enforced).
- Fourth slot / new resonances = data (`SYMBIOTE_SLOTS`, `SYMBIOTE_RESONANCES` census table).
