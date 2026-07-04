# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-04 05:23 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** 1927331

## Summary of work completed

**HIVE SIEGE** — the core combat model changed: enemies no longer despawn at a finish line;
they converge on the Hive Core, lock onto crust rings, and run real windup/cycle attack loops
(all statuses gate them; artillery unified onto the same gating; suicide kinds fuse-and-burst;
bosses swing on chassis cadence) until killed. Includes the complete contact-damage rebalance
(role-derived per-hit profiles on every enemy, probe-held to the DIFFICULTY.md §contract),
endless-director depth gates (shapes, EHP roster cap, swarm events — an unkillable camper is a
scripted loss under siege rules), and the full under-attack presentation (Core damage states,
impact shudder + rings, attacker lunges, groans/heartbeat audio, reactive HUD integrity cell
with UNDER ATTACK flag / ghost bar / ⚔ count / −DPS/s / survival clock). Goldens were
**deliberately re-pinned** (every seed now kills 196/196 — former leakers die credited; all
still win at wave 12). The one thing to know: `docs/HIVE-SIEGE.md` is the canonical reference —
its §9 balance table + probe protocol must be re-run after ANY touch to enemy stats, attack
profiles, campaign scaling, or endless gating.

## Files modified

- Source (12): `src/audio/sound.ts`, `src/core/boss.ts`, `src/core/campaign.ts`, `src/core/config.ts`, `src/core/director.ts`, `src/core/game.ts`, `src/core/types.ts`, `src/index.css`, `src/render/renderer.ts`, `src/state/mechanics.ts`, `src/ui/GameView.tsx`, `src/ui/Hud.tsx`
- Tests (6): `src/core/ability.test.ts`, `src/core/director.test.ts`, `src/core/golden.test.ts`, `src/core/summon.test.ts`, `src/core/validate.test.ts`, `src/core/hiveSiege.test.ts`
- Docs (6): `docs/BALANCE_REPORT.md`, `docs/DIFFICULTY.md`, `docs/GAME-STATE.md`, `docs/PROJECT_STATUS.md`, `docs/HIVE-SIEGE.md`, `docs/AI_HANDOFF.md`

## Systems affected (from the dependency registry)

- **audio** — `src/audio/sound.ts`
- **bosses** — `src/core/boss.ts`
- **campaign** — `src/core/campaign.ts`
- **content-infra** — `src/core/config.ts`, `src/core/types.ts`
- **engine** — `src/core/director.ts`, `src/core/game.ts`
- **onboarding** — `src/state/mechanics.ts`
- **rendering** — `src/render/renderer.ts`
- **run-ui** — `src/ui/GameView.tsx`, `src/ui/Hud.tsx`
- Consumer ring (verify, unchanged): biomes, collection, currencies, difficulty, equipment, evolution-hq, gene-cards, heroes, infinite, loot, mastery, meta-store, power, prestige, towers

## Power Score changes

None — the Power scale, buckets, and recommendedPower index are untouched this session (the
index changes shipped in the previous commit). `progressionLoop.test.ts` still pins the
strictly-rising invariant; the full suite passes.

## UI changes

- `Hud.tsx`: the Hive Core cell is now siege-reactive (UNDER ATTACK flag, recent-damage ghost
  segment behind the bar, `⚔ N · −DPS/s · ~Ns` readout row, critical pulse ≤25%). Two new
  snapshot fields drive it (`hiveAttackers`, `hiveDps`, `hiveRecentDamage`).
- `GameView.tsx`: per-bite screen-shake trauma (`hiveHit: 0.055` — sustained siege = low
  rumble), groan cues on damage-state falls (75/50/25/10%), heartbeat loop while critical.
- Battlefield (`renderer.ts`): Core damage states (cracks → wounds/ichor → emergency flicker →
  collapse strobe), impact shudder + flash ring (core-local translate only — CAMERA.md §8
  honored), attacker rear-back/lunge through the windup.
- Headless smoke: full-suite green incl. `uiStandards` and `tutorialAnchors`; live-browser
  campaign run verified (see Known edge cases for coverage note).

## Documentation changes

- NEW `docs/HIVE-SIEGE.md` — the system doc (movement/crust/attack-loop/status/ranged/suicide/
  feedback/states/audio/UI/balance + the full report tables). All code § references land here.
- `docs/DIFFICULTY.md` §contract — siege semantics note (integrity lost = DPS × survival).
- `docs/BALANCE_REPORT.md` — dated amendment (player-directed rebalance; watch items).
- `docs/GAME-STATE.md`, `docs/PROJECT_STATUS.md` — status lines.
- `docs/ENDLESS-SCALING.md`: **no change needed** (budget/hp curves untouched; the new depth
  gates are documented in HIVE-SIEGE.md §9 and referenced from director.ts).
- Registry ring (towers/heroes/genes/etc.): no change needed — their systems are consumers of
  the enemy loop, not definers of it.

## Save changes

None — save layer untouched (siege state is run-transient; enemies are never serialized).

## Known edge cases

- `golden.test.ts` deliberately re-pinned for the SECOND time this branch (mortar lead, then
  siege). Kills are now a constant 196 across seeds — if a future change makes kills drift
  below that, an enemy is escaping uncredited again.
- Stun/freeze INTERRUPTS a windup (the swing is lost). A permanently-stunned attacker deals
  zero forever — control effects are now strictly stronger at the Core than they were.
- Suicide detonation bypasses hp-death: `detonate` mirrors the old breach bookkeeping
  (bossCount, armorBreak cleanup). Any future "remove enemy without hp-death" path must do
  the same or leak bookkeeping.
- The renderer's damage-state branches (<50%, <25%, <10%) only render when a run is actually
  bleeding — the live smoke exercised the healthy path; wounded-state visuals were reviewed
  at the code level and in the sim only. First real playtest at low integrity should eyeball
  them.
- The endless autopilot probe is high-variance (fresh fall band waves 16–32); the
  progression-loop tests remain the real endless gate.

## Remaining technical debt

- `DIRECTOR.cost` (endless unit pricing) still prices raw HP; the EHP depth gate compensates
  early but deep-endless composition would benefit from an EHP-based retune (watch item in
  BALANCE_REPORT).
- The difficulty probe still lives in the session scratchpad; it should graduate into a
  maintained dev probe module (same note as last session — now doubly earned).
- `Enemy` gained six plain fields; if the roster ever hits the 600-cap regularly, a
  struct-of-arrays layout is the known escape hatch (ENGINEERING-AUDIT §perf).

## Recommended next tasks

1. **STRAIN system** (user-directed, queued): in-run tower evolution framework (Strain I–V),
   per-tower unique mechanics, Biomorph Conveyor acquisition, merging, economy, UI, full
   integration + simulation. Start at the framework (sim-side, `src/core/`), design doc first.
2. Endless `DIRECTOR.cost` EHP retune (small, report-flagged).
3. Eyeball the wounded Core states in a real low-power run and tune crack/ichor amplitudes.

## Future expansion hooks

- `EnemyDef.attack` + `CHASSIS[..].attack` — the authored cadence surface for all future
  enemies/bosses.
- `hiveStrike` (game.ts) — the single Core damage event; "tunnel into the Hive" or
  "corrosive latch" mechanics branch at the arrival block in `enemyMoveSystem`.
- `HIVE` config block — geometry/rings/feedback windows, all in one place.
- `SHAPE_DEPTH` / `DIRECTOR.ehpBase/ehpPerDepth` / `swarmMinDepth` — endless pacing dials.
- `hud.hiveAttackers/hiveDps/hiveRecentDamage` + `rs.hiveHitPulse` — presentation channels
  any future "hive under attack" UI (e.g. Command Center world status) can read.
