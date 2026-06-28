# BUGFIX-LOG.md — Bugs found & fixed

One row per fix: **symptom → root cause → fix**. Plus a record of the comprehensive
bug-hunt pass (scope, method, verdict) so "we looked" is auditable.

---

## Fixes

| # | Symptom | Root cause | Fix |
|---|---|---|---|
| 1 | A wave could never end — enemies that breached the line lingered and the run hung. | `deathSystem` only evicted hp-deaths; enemies set `alive=false` by `hitNucleus` (breach) were never removed from `this.enemies`, so `checkWaveEnd` (which needs `enemies.length === 0`) never fired. | Evict **all** non-alive enemies each tick (swap-remove on `!e.alive`), not just hp-deaths. |
| 2 | Damage-number floats / hit-flash could strobe every tick on enemies standing in Corrosion pools. | The aggregated-damage + hit-flash hooks fired on *all* `applyDamage`, including continuous DoT. | `applyDamage(..., flash=false)` for DoT (corrosion tick, pools); the white flash only pops on discrete hits. |
| 3 | Green artillery (Acid Spitter / Siege Maw) sniped the Nucleus from the spawn edge, far outside any defensible range (seen ~endless waves 2–4). | The siege gate compared `goalDistanceAt` — a **cell-unit** path cost (max ~23 on the grid) — against `siege.range` in **pixels** (180–220), so the condition was ~always true: they shelled from the moment they spawned and never advanced. | Replace the gate with a Y-position **standoff**: artillery advances to at least 2/3 down the lane (`max(HEIGHT·2/3, DEFENSE_TOP_Y − siege.range)`) before halting to bombard, so it commits into tower range. Regression test: `artillery.test.ts`. |
| 4 | Tower placement felt off — clicking the **left half of a build pad** missed, and the click target sat half a cell right of where each pad was drawn (placement grid not aligned to the Hive-Core-centred visuals). | `slotAt` floored the click to a grid **cell** (`colOf`/`rowOf`), but pads are drawn on the symmetric 80px lattice **on grid lines** (`x = 40,120,…,680`). Cell-flooring biased every hit +20px right (cell centre vs pad centre) and dropped each pad's left half; the hit lattice centred on x=380, not the core's x=360. | `slotAt` now snaps to the **nearest pad within `SLOT_HIT_RADIUS`** (≈28px) instead of cell-flooring — the clickable target is centred on each pad and mirror-symmetric about the core. Visuals/geometry unchanged (already symmetric; verified by pixel analysis). Regression tests in `slots.test.ts` (centre/edge hits, mirror symmetry, no over-snap). |

---

## Comprehensive bug-hunt pass (this session)

**Method.** Static scans for the bug classes that matter in a deterministic
sim + the merged multi-session codebase, plus headless runtime exercise of every
major path (errors captured from `console` + `pageerror`), plus the golden
characterization suite (6 seeds) gating gameplay drift.

**Checked — and clean:**

- **Determinism leak** (`Math.random` in `core/`): none. Both the gameplay RNG and
  cosmetic FX RNG are seeded; the new Director/Boss take an `rng`. *Now guarded by a
  test:* `core/boundaries.test.ts`.
- **Type holes** (`as any` / `@ts-ignore` / `@ts-nocheck` in app code): none (one
  intentional `as unknown as` in `validate.ts`'s reflection helper).
- **Missing-key crashes**: all per-kind lookups are `Record<Kind, …>` (towers,
  enemies, heroes, shapes, tiers, mastery, stats). `strict` typecheck enforces
  exhaustiveness, so a new tower/enemy/hero can't ship a half-filled map.
- **Save migration / loss**: `withDefaults` deep-merges *every* per-key record
  (tower/hero shards·stars·mastery, stats sub-records, equipment, mats) and guards
  `selectedHero`/`achievements`/`uniqueCards`; `isSaveData` stays lenient so old
  saves upgrade instead of being discarded. v1→v3 saves gain new blocks zeroed.
- **Mode plumbing**: `endless` flows App → GameView → `new Game(…, { mode })` (a
  silent fallback to stage would have been an invisible bug). Verified live.
- **`hitNucleus` idempotency**: guarded by `if (!e.alive) return`, so an enemy can't
  breach twice or be double-evicted across the two reach checks in the move system.
- **Feature wiring**: Infection (on-hit · ramp/DoT · spread-on-death), Disruption
  vulnerability, boss shields, and the Director are all reachable and exercised — no
  defined-but-dead handlers.
- **Non-null assertions**: the only one in core (`this.director!`) is reached solely
  from `startEndlessWave`, which runs only when `mode === 'endless'` (where the
  Director is constructed). Safe.

**Runtime matrix (headless Chromium, zero console/page errors):**

| Path | Result |
|---|---|
| Stage: all 5 towers placed, every boss type (`Boss`/`FW`/`Proc`) + full enemy variety, ability spam | clean |
| Stage: **natural loss** — no towers, swarm floods the line → integrity 0 → `NUCLEUS LOST` → results → `Runs failed` +1 | clean |
| Stage: debug **Win** → results (loot + mastery + achievement toasts + Shard reward) → back to menu | clean |
| Endless: 12 Director-composed waves at ×4 (elites, swarm events, minibosses) | clean |
| Menu: MetaShop · TowerLab · Statistics · Achievements · SaveManager render together | clean |

**Verdict.** No crash, determinism, save-loss, or correctness defects surfaced. The
codebase's invariants (deterministic core + golden tests, type-enforced exhaustive
maps, guarded save migration) are actively preventing the hunted bug classes.

**Documented latent edge-case (deliberately NOT changed — would alter gameplay,
which the brief says to preserve):** an enemy reduced to **exactly ≤0 HP by towers**
that crosses the line **in the same tick** deals Integrity damage and is *not*
credited as a kill (no bounty/mastery/stat) — a 1-tick artifact of the system order
(damage → move → death). "Fixing" it (skip-if-dead before the breach check) changes
Integrity/kill/biomass outcomes → golden drift. Recorded here; revisit only if the
system order is ever reworked.
