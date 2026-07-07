# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-07 14:36 UTC · **Diff scope:** batch-3 session (commits `f77ef66`, `c69a005`, `3129638` + this doc pass)
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 3129638

## Summary of work completed

Batch 3 shipped in full: two biomes (Ossuary, Umbral Reach), the Act-3 campaign boss line
(Hollow Matriarch / Null Tyrant / Worldbreaker at stages 50/55/60), two Mega Bosses (Vesperine
the tempo predator, Moloch-Ama the economy predator), two towers with complete kits (Synapse
Spire — chain-arc, the first kit composed purely via `TowerDef.abilities`; Undertow Polyp —
pull-field displacement via `AuraAbility.pull`), the Expansion III gene pool (10 gated cards +
upgrade tracks), and a boss visual distinction overhaul (`render/bossChassis.ts` — five chassis
body plans, authored palettes, per-def markings). The one thing to know: **the chain executor
now tags its first victim as `cast.target` and honors `ctx.rangeMult`** — status/crit pairings
and arc-reach rungs compose with chains everywhere (no chain executes on the golden path, so
goldens were untouched). Everything verified: 1137/1137 tests, `npm run validate` PASS, and a
live headless playtest (all five chassis, both new megas, both new towers engaging a pack, zero
console errors).

## Files modified

- Source: `core/{biomes,boss,megaboss,config,stars,branches,adaptation,mastery,cards,geneUpgrades,power,ability,game,types}.ts`, `render/{bossChassis,renderer,theme,starEvolution,towerEvolution}.ts`, `state/meta.ts`, `audio/sound.ts`, `index.css`
- Tests: `core/{spire,polyp}.test.ts` (new), `core/{boss,branches,registry,conveyor,cards,biomesNew}.test.ts`, `state/{stats,geneStress}.test.ts` re-pins
- Docs: `SPIRE.md`, `POLYP.md` (new), `BOSS-DESIGN.md` §visual identity, `CARDS.md` Expansion III, `GAME-STATE.md`, `DEPENDENCY_GRAPH.md`, `VALIDATION_REPORT.md`

## Systems affected (from the dependency registry)

Bosses · Mega Bosses · Towers (roster 13) · Gene cards (102) · Biomes (10) · Rendering.

## Power Score changes

`spireChainJumps` (add 0.07) and `polypFieldMult` (mul 0.3) were already scored with the
towers; Expansion III cards ride existing scored fields. Maxed gene library stays inside the
(2, 2.9) band — no `GENE_POWER_SCALE` recalibration was needed this batch (0.081).

## UI changes

Render-only boss overhaul (`render/bossChassis.ts` + `renderer.ts` hookups). No HUD/menu changes.

## Documentation changes

All synced this session: GAME-STATE counts (13 towers · 13 bosses · 5 megas · 102 cards/44
gated · 40 enemies), SPIRE/POLYP docs, CARDS.md Expansion III table, BOSS-DESIGN §visual
identity, DEPENDENCY_GRAPH regenerated.

## Save changes

None — save schema untouched (v22). All new content is inert-by-default / progression-gated.

## Known edge cases

- `execChain` sets `cast.target` only when it was null (`??=`) — a projectile's tag always wins.
- The polyp's pull skips bosses (`e.boss` guard) and floors at y=24; branch/star pull grants
  STACK as separate aura components, not one summed magnitude.
- Boss chassis resolution falls back to `bruiser` for unknown ids; procedural ids must keep the
  `proc_<chassis>_<tl>` encoding or their family palette degrades to bruiser red.
- The gene stress test's first rung rides `CARD_POOL.length + 25` — never re-pin it to a constant.
- `obeliskSlowBonus`, `integrityRegenPerWave`, `killFractureSplash` are deliberately unscored;
  any upgrade level using them must ride a scored rider or `cardProblems` rejects it.

## Remaining technical debt

- The spire/polyp signature cards' knobs are sim-tested via the tower suites, but no test drives
  a DRAFTED signature card end-to-end (draft → fold → cast delta).
- `towers_live` playtest confirms engagement but a still can't prove the per-hop spark visual;
  fine while `spire.test.ts` pins multi-victim damage.

## Recommended next tasks

1. Campaign content past stage 60 (the Act-3 line ends at Worldbreaker; `CAMPAIGN_BOSSES` and
   the mega cadence both extend by data).
2. A second wave of Adaptation capstones for the five newest towers once mastery telemetry
   exists (entry: `core/adaptation.ts` `TOWER_THEMES`).
3. Boss-rush-specific mega tiers (entry: `megaEncounterFor` cycling in `core/megaboss.ts`).

## Future expansion hooks

- `TowerDef.abilities` (config.ts) — any future tower can be pure data; `deriveTowerAbilities`
  honors the override.
- `WEAK_POINT_DEFS` / `MEGA_ABILITIES` registries (core/megaboss.ts) — new megas are one def.
- `render/bossChassis.ts` `lookOf` — new chassis = one CHASSIS row + one silhouette case.
- `UpgradeDef.unlock` / `CardUnlock` — shared progression-gate vocabulary for future content.
