# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-13 13:22 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** a38c36f

## Summary of work completed

**The REACTION TRIO shipped — the tower roster is 20** (TOWERS.md §reactionTrio): **Miasma
Lung** (second Viral — a `field` plague fog that coats the WHOLE pack with Infection, vs the
Nest's one-host drill; 145 ¢ · 18/240 gate), **Chitin Bell** (second Resonant — a slow toll
slam that primes the crowd with Resonance for the shatter reactions; 160 ¢ · 24/380) and
**Acid Lancet** (the Caustic EXECUTIONER — one 130-dmg `highestHealth` harpoon per 4.5 s with
a Corrosion wound and a 120 px deadzone; 185 ¢ · 34/560). The one thing to know: this was the
first roster growth with **ZERO new sim verbs** — every mechanic is composed from
`TowerDef.abilities` — and the load-bearing caveat is that a `firing: 'field'` def **without**
explicit `abilities` inherits the derived Disruption pulse kit, so a field tower with its own
identity MUST author its kit. Both class gaps (1-tower Viral / 1-tower Resonant) are closed.

## Files modified

- Source (13): `src/changelog/releases.gen.ts`, `src/core/adaptation.ts`, `src/core/branches.ts`, `src/core/config.ts`, `src/core/mastery.ts`, `src/core/mulligan.ts`, `src/core/stars.ts`, `src/core/types.ts`, `src/dev/dil/knowledge.ts`, `src/render/starEvolution.ts`, `src/render/theme.ts`, `src/render/towerEvolution.ts`, `src/render/towerForms.ts`
- Tests (3): `src/core/registry.test.ts` (pin 17→20), `src/state/stats.test.ts` (fixtures), `src/core/reactionTrio.test.ts` (NEW — 10 tests)
- Docs (5): `docs/DIL_GRAPH.md`, `docs/GAME-STATE.md`, `docs/HISTORY.md`, `docs/TOWERS.md`, `docs/VALIDATION_REPORT.md`

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts`
- **content-infra** — `src/core/config.ts`, `src/core/types.ts`
- **dev-registry** — `src/dev/dil/knowledge.ts`
- **mastery** — `src/core/adaptation.ts`, `src/core/mastery.ts`
- **mulligans** — `src/core/mulligan.ts`
- **rendering** — `src/render/starEvolution.ts`, `src/render/theme.ts`, `src/render/towerEvolution.ts`, `src/render/towerForms.ts`
- **towers** — `src/core/branches.ts`, `src/core/stars.ts`
- Consumer ring (verify, unchanged): biomes, bosses, collection, contracts, currencies, daily, difficulty, doctrines, engine, equipment, evolution-hq, gene-cards, hero-symbiotes, heroes, living-battlefield, loot, mega-bosses, meta-store, nucleus, pil, power, premium, website

## Power Score changes

None in effect: all three towers are double-gated (locked + stage-gated), so a fresh account's
Power and every pinned seed are byte-identical (golden suite green, no re-pin). The Mulligan
catalog grew by 18 pieces (the `CATALOG_PER_TOWER = 6` ratio contract — 2 per category per
tower); piece `powerWeight`s follow the established rarity bands, pinned by
`mulligan.test.ts` / `mulliganOverhaul.test.ts`.

## UI changes

No component code changed — every surface in the blast radius (Tower Lab, Codex, tower rail,
conveyor, Inspector, StarCeremony, Adaptation Chamber, website tower guide) is registry-driven
and picked the three kinds up automatically. Live headless smoke: a seeded Campaign run
fielded the trio off the real rail/conveyor with zero page errors (see PROJECT_STATUS).

## Documentation changes

`docs/TOWERS.md` (roster intro → twenty; NEW §reactionTrio with per-tower specs),
`docs/GAME-STATE.md` (Towers row 17→20 + reaction-trio summary — the docSync anchor),
`docs/DIL_GRAPH.md` + `docs/DEPENDENCY_GRAPH.md` (regenerated), `src/dev/dil/knowledge.ts`
(reaction-trio edge incl. the derived-Disruption caveat + the Mulligan ratio contract).
All other registry-listed docs: no change needed (no system behavior moved).

## Save changes

None — save layer untouched. `towerUnlocked`/shards/stars/forks/mastery records are
`TOWER_ORDER`-derived and deep-filled by `withDefaults`, so existing saves gain the three
kinds' zero-rows automatically.

## Known edge cases

- A `firing: 'field'` TowerDef with NO explicit `abilities` gets the DERIVED aura kit
  (damage + Disruption — the obelisk pulse). The Lung/Bell author explicit kits for this
  reason; a future field tower must too (recorded as a DIL edge).
- Corrosion is SECONDS (expires); test assertions must sample while live (the trio suite's
  `sawWound` latch), and damage-isolation tests must `parkHero` — the default Ravager dives
  pinned targets and contaminates "never damaged" assertions.
- The Bell's aura applies its status BEFORE damage+react in the same pulse, so a toll can
  combust its own freshly-applied Resonance against a pre-existing partner status — that's
  the designed primer behavior, pinned in `reactionTrio.test.ts`.

## Remaining technical debt

- Strain II–V ladders unauthored for the trio (same shipping state as
  coil/siphon/sower/spire/polyp/spitfang/rift — the named levels climb with empty hooks).
- Balance numbers are tuning clay: no full `sim:report` persona pass ran for this batch (all
  three towers are locked, so fresh-persona curves are unaffected; a deep-account pass is the
  meaningful one when wanted).
- `complete_arsenal` achievement desc still says "the launch five, the expansion three, and
  both beam towers" — the TEST is roster-proof (`>= TOWER_ORDER.length`) but the copy is
  stale (pre-existing).

## Recommended next tasks

1. ~~Four weak enemy variations~~ — **SHIPPED in this same session** (the EARLY BROOD,
   ENEMIES.md §early-brood: husk/flea/mold/skulker). Key learnings recorded as a DIL edge:
   the campaign enemy gate is fully DERIVED (`unlockStage` = hp tier × mech gate; tier 1 =
   effectiveHp < 92 + zero role traits; wave-1 needs threat ≤ 3, dmg ≤ 8, speed ≤ 100), and
   the pinned golden only runs the SCRIPTED `WAVES` table — generation re-rolls freely with
   no re-pin. Stage 1 wave 1 now opens with the brood (live-probe verified).
2. **Early-game / new-player-experience overhaul** (user-queued, task #168) — playtesters
   were overwhelmed, skipped the wordy/janky tutorial, and reported it inaccurate to current
   gameplay. Entry: `docs/TUTORIAL.md`, `src/ui` tutorial/onboarding surfaces, help system.
   HARD EVIDENCE from this session's live probes: a fresh account stacks, before first
   combat — title gate → 5-scene transmission film → hub → rank-promotion popup UNDER a
   12-step "Field Orientation" tour + the login-cache ceremony → then the run tutorial
   (which keeps the classic full tower rail while real runs use the conveyor — a mechanics
   MISMATCH that matches the "tutorial not accurate to gameplay" report).

## Future expansion hooks

- The reaction-primer pattern (aura + status + `react: true`) generalizes: any future class
  can ship a "primer" tower with zero sim code — the matrix (`reactions.ts`) already prices
  every pairing.
- `lancet`'s deadzone + `highestHealth` + slow-heavy-hit template is the general "executioner"
  archetype shape (config-only) if a second one is ever wanted (e.g. a Neural sniper).
