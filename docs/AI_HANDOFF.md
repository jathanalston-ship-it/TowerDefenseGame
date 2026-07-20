# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-20 02:05 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 3902e9f

## Summary of work completed

Shipped **HIVE INTELLIGENCE** (user brief, task #401): a player-triggered in-run
best-upgrade executive. `src/core/hivemind.ts` is a pure planner over a structural
`HiveGame` interface with a provider registry (`registerHiveProvider`) — five built-in
providers (branch tiers, hero evolution, autocast, conveyor deploy with slot scoring,
strain merge) enumerate every legal Biomass purchase; exact power-ratio deltas rank them
(heuristics only where Power is silent), and `Game.hivePulse()` multi-buys best-first down
to a reserve floor **pinned once from the starting wallet** (per-iteration recomputation
provably drains to zero — the sim caught 87 violations before the pin). HUD: a glowing
`◈ HIVE INTELLIGENCE` button (`hiveReady` snapshot flag, ~0.5 s cache) + an action ticker.
`scripts/sim-hive.ts` (`npm run sim:hive`) gates the design: manual mean depth 12.3 vs
hive 19.3 (+57 %) vs mixed-cadence 20.8, 0 reserve violations, no dominant pulse cadence.
The one thing to know: **new Biomass sinks join by registering a provider — never by
editing the planner** (the foundation rule, docs/HIVE-MIND.md).
Also fixed two latent calendar-hermeticity test bugs exposed by the UTC date rolling to
2026-07-20 (battle-pass window-1 boundary + live-event ring rotation) — see edge cases.

## Files modified

- Source (9): `src/changelog/releases.gen.ts`, `src/core/config.ts`, `src/core/game.ts`, `src/core/types.ts`, `src/dev/dil/knowledge.ts`, `src/dev/systemRegistry.ts`, `src/index.css`, `src/ui/GameView.tsx`, `src/core/hivemind.ts`
- Tests (3): `src/state/battlePassMeta.test.ts`, `src/state/liveEventsMeta.test.ts`, `src/core/hivemind.test.ts`
- Docs (5): `docs/DEPENDENCY_GRAPH.md`, `docs/DIL_GRAPH.md`, `docs/HISTORY.md`, `docs/VALIDATION_REPORT.md`, `docs/HIVE-MIND.md`

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts`
- **content-infra** — `src/core/config.ts`, `src/core/types.ts`
- **dev-registry** — `src/dev/dil/knowledge.ts`, `src/dev/systemRegistry.ts`
- **engine** — `src/core/game.ts`
- **hive-mind** — `src/core/hivemind.ts`
- **run-ui** — `src/ui/GameView.tsx`
- Consumer ring (verify, unchanged): arena, audio, biomes, boss-rush, bosses, campaign, collection, currencies, daily, difficulty, doctrines, equipment, evolution-hq, gene-cards, hero-cinematics, hero-symbiotes, heroes, infinite, living-battlefield, loot, mastery, mega-bosses, meta-store, mulligans, nemesis, nucleus, onboarding, online-foundation, pil, power, premium, rendering, towers, website

## Power Score changes

No scale/bucket/fold changes. The hive mind READS the temporary bucket for exact purchase
deltas (`powerDelta` in hivemind.ts recomposes the variable part — heroEvo × branch tiers ×
strains — as a ratio against `effectsPower(g.powerEffects())`) and executes only through the
same public buy APIs a manual click uses, so the Power audit sees every purchase normally
(`hivemind.test.ts` pins `powerAuditWarnings` empty after a full pulse). `branchTierCost()`
became a public Game helper so planner and `buyBranchTier` share one pricing source.

## UI changes

Surfaces in the blast radius: `App (UpdateBriefing popup)`, `GameView`, `Hud`, `Toolbar`, `BuildControls`, `Inspector`, `BuildPanel`, `GameView (◈ HIVE INTELLIGENCE button + pulse ticker)`, `Results`, `ALL`

New in GameView only: the `◈ HIVE INTELLIGENCE` pill (top-right, left of the speed
control; LED breathes only while `hud.hiveReady`) and the transient `.hive-ticker` action
report (right edge, `pointer-events: none`, auto-fades ~3.4 s; moved from right:218 to
right:10 after the smoke screenshot showed it covering the Start Wave popup). Gated off
during the tutorial; visible in prep + wave. Headless smoke (scratchpad `hive-probe.mjs`
against the built bundle): button present + `is-ready`, click spent 1146 of 3220 Biomass
across 11 actions (deploy + hero evos), ticker rendered, zero page errors.

## Documentation changes

Registry says these move with the touched systems: `docs/CHANGELOG-PIPELINE.md`, `docs/CODEMAP.md`, `docs/CORE-FRAMEWORKS.md`, `docs/AUTHORING.md`, `docs/HIVE-MIND.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/POWER-SCORE.md`, `docs/POWER-AUDIT.md`, `docs/POWER-ADVISOR.md`, `docs/MISSION-CONTROL.md`, `docs/EVOLUTION-ROADMAP.md`, `docs/MULLIGANS.md`, `docs/PREMIUM-STORE.md`, `docs/PREMIUM-ECONOMY-REPORT.md`, `docs/ONLINE-FOUNDATION.md`, `docs/TRADING-PREP.md`, `docs/TOWER-STARS.md`, `docs/TOWER-BRANCHES.md`, `docs/TOWER-LAB.md`, `docs/TOWER-CODEX.md`, `docs/TOWERS.md`, `docs/STRAIN.md`, `docs/MASTERY.md`, `docs/ADAPTATION.md`, `docs/HEROES.md`, `docs/HERO-FRAMEWORK.md`, `docs/HERO-EVOLUTION.md`, `docs/HERO-SELECTION.md`, `docs/SLOTS.md`, `docs/EQUIPMENT.md`, `docs/EQUIPMENT-PHILOSOPHY.md`, `docs/LOOTBOX.md`, `docs/LOOT-PROGRESSION.md`, `docs/REWARD-PRESENTATION.md`, `docs/GENE-EVOLUTION.md`, `docs/CARDS.md`, `docs/GENE-AUDIT-REPORT.md`, `docs/NUCLEUS.md`, `docs/HERO-SYMBIOTES.md`, `docs/COLLECTION.md`, `docs/EVOLUTION-HQ.md`, `docs/GENOME-CORE.md`, `docs/EVOLUTION-CAP.md`, `docs/ECONOMY.md`, `docs/LEXICON.md`, `docs/ECONOMY_FORMULAS.md`, `docs/DEV-RESET.md`, `docs/SCALABILITY.md`, `docs/PROJECT_MANIFEST.md`, `docs/BOSS-DESIGN.md`, `docs/MEGA-BOSS.md`, `docs/BIOMES.md`, `docs/DOCTRINES.md`, `docs/MODE-IDENTITY.md`, `docs/DIFFICULTY.md`, `docs/DIFFICULTY_DIRECTOR.md`, `docs/WEBSITE.md`, `docs/DEPLOYMENT.md`, `docs/DIL.md`, `docs/DEPENDENCY_GRAPH.md`, `docs/ENGINEERING-AUDIT.md`, `docs/GAME_CONSTITUTION.md`, `docs/PROJECT_STATUS.md`, `docs/AI_HANDOFF.md`, `docs/PIL.md`, `docs/CAMPAIGN.md`, `docs/CAMPAIGN-EVENTS.md`, `docs/STAGES.md`, `docs/ENDLESS-SCALING.md`, `docs/BOSS-RUSH.md`, `docs/DAILY-RUN.md`, `docs/ARENA.md`, `docs/ARENA_MATCH_REPORT.md`, `docs/HERO-CINEMATICS.md`, `docs/NEMESIS.md`, `docs/TUTORIAL.md`, `docs/HELP.md`, `docs/TUTORIAL-AUDIT.md`, `docs/GUIDED-UNLOCKS.md`, `docs/HUD.md`, `docs/READABILITY.md`, `docs/RENDER-PIPELINE.md`, `docs/TOWER-VISUAL-EVOLUTION.md`, `docs/GAME-FEEL.md`, `docs/CAMERA.md`, `docs/COMBAT-VISUAL-STANDARDS.md`, `docs/LIVING-BATTLEFIELD.md`, `docs/MUSIC.md`

`docs/HIVE-MIND.md` is NEW and canonical for this system (architecture, scoring,
placement, §modes seam, sim results table). `docs/DEPENDENCY_GRAPH.md` + `docs/DIL_GRAPH.md`
regenerated (hive-mind node; PINNED-RESERVE contract edge in `src/dev/dil/knowledge.ts`).
`docs/HISTORY.md` moved with the Chronicle regen. All other listed docs: no change needed —
no existing system's behavior, data, or API moved (the planner only consumes public seams).

## Save changes

None — save layer untouched.

## Known edge cases

- **Calendar hermeticity (fixed this session, remember the pattern):** deep meta chains
  (`grantPassXp('run'|'achievement', …)`, reached via `evaluateAchievements` inside claim
  paths) default `now = Date.now()`. `battlePassMeta.test.ts` pinned T0 in window 0 but let
  those defaults read the wall clock — the moment real time crossed the 2026-07-20 window-1
  boundary, the season rolled over MID-TEST and wiped the claim record. Fix: the suite pins
  `vi.useFakeTimers({ now: T0, toFake: ['Date'] })`. Any future suite that pins a logical
  `now` must pin Date itself or thread `now` everywhere.
- **Live-event rotation alignments:** `liveEventsMeta.test.ts`'s minting assertion assumed
  every trio has a single-run-completable challenge; alignments exist where all challenges
  are multi-run counters (today's `deep_current`). The test now derives the number of heavy
  runs from the authored targets (bounded ≤ 64) before asserting tokens minted.
- **Pinned-reserve pulse contract:** `hivePulse` computes `reserveFloor` ONCE from the
  starting wallet and threads it through every re-plan. Recomputing per iteration on the
  shrinking wallet asymptotically spends to zero — do not "simplify" it back.
- **Deploy gains are honest heuristics** (`HIVE_MIND.deployGainScale` / `supportDeployGain`)
  because fresh deployments deliberately don't enter the temp-Power bucket; branch-lane
  choice for an uncommitted tower is the first authored lane (deterministic, not scored).
- **`HIVE` vs `HIVE_MIND` in config.ts:** `HIVE` is the pre-existing Hive-Core siege table;
  the planner's tunables are `HIVE_MIND`. game.ts imports BOTH — a rename sweep that touches
  the siege import breaks the build (it did once this session).

## Remaining technical debt

- The hive button has no mechanics-registry Help row / teach entry yet (players learn it
  from the tooltip); add a row when the next Help sweep runs.
- `hiveBestSlot` scores placement per-slot per-candidate each plan (fine at 22 towers /
  ~40 slots; revisit only if provider counts grow ~10×).
- Other T0-pinned suites may share the unpinned-Date pattern battlePassMeta had; none fail
  today, but the next calendar-boundary failure should reach for the same fake-timers fix.

## Recommended next tasks

1. Optional modes UI (one-purchase / boss-prep profiles): `hivePulse(opts)` already takes
   `{ maxActions }`; profiles are tunable overlays passed through `hivePlan` —
   docs/HIVE-MIND.md §modes names the seam. UI would be a long-press or split-button on the
   existing pill in GameView.
2. Help/teach coverage for the button (mechanics registry row + HUD tour stop).
3. Deeper context multipliers (enemy damage types, lane pressure) — additive inside
   `applyContext()` in hivemind.ts; every multiplier must set `HiveAction.detail`.

## Future expansion hooks

- `registerHiveProvider` (src/core/hivemind.ts) — THE seam: any future Biomass sink ships
  a `HiveProvider { id, enumerate }` next to its system and is ranked/executed/validated
  with zero planner edits.
- `hivePulse(opts?: { maxActions })` (src/core/game.ts) — the modes/profiles door.
- `applyContext()` (src/core/hivemind.ts) — the single place situational intelligence
  accumulates; `HIVE_MIND` in config.ts is its reviewable tunable table.
- `scripts/sim-hive.ts` cohort harness — extend cohorts/cadences when tuning; the gate
  (hive ≥ manual depth, 0 reserve violations) must keep passing.
