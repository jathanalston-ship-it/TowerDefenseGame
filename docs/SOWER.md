# SOWER.md — the Blight Sower (firing `'trap'`)

The roster's **pre-placed damage** tower and the third firing invented since launch (after the
Coil's ramp-beam and the Siphon's drain-beam): the Blight Sower never attacks. It **seeds armed
spore mines up-lane** on its cadence, and the wave walks into them. The player buys area DENIAL —
a decision made *before* the threat arrives — where every other tower reacts.

## Mechanic

- `TOWER_DEFS.sower` — `firing: 'trap'`, Caustic. `range` = **planting reach**, `fireInterval` =
  seeding cadence, `damage`/`splash` = the per-mine detonation payload (baked at PLANT time with
  that moment's damage/splash folds — a burst is a pure proximity event).
- **Loop** (`game.trapTowerSystem` → `game.mineSystem` → `game.detonateMine`): while below its cap
  (`MINES.maxPerTower` + stars/branches `extraProjectiles` + the `sowerExtraMines` run knob) it
  plants one mine per cadence at a spread point up-lane (min spacing `MINES.minSpacing`); a mine
  arms after `MINES.armSec`, triggers on enemy proximity (`MINES.triggerRadius`), and detonates:
  full damage + `MINES.corrosionSec` of **Corrosion** (feeds Shred) to everything in the blast.
- Star/branch **`ability` grants fire AT the crater** — auras, debuffs and novas bloom where the
  mine bursts, so upgrade organs read on the battlefield.
- A **sold or relocated** Sower withers its whole field (`witherMines`) — no orphaned mines.
- Burrowed bosses pass beneath the garden; a submerged organism cannot trip a surface mine.

## Gating (docs/TOWERS.md §expansion — the Coil/Siphon pattern)

DOUBLE-gated: shards only drop after **Campaign Stage 20** (`unlockStage`), then **360** must bank
(`unlockShards`) before the Tower Lab claim. Its signature gene cards (`mycelial_carpet`,
`seed_hoard`) gate on OWNING it; its deep Genome upgrades (`garden_doctrine`, `seedbank`) ride the
upgrade gate seam.

## Knobs

`RunModifiers.sowerBlastRadiusMult` (mul, Power 0.35) and `.sowerExtraMines` (add, Power 0.06) —
subject `'sower'` (draft badges), scored in `POWER_RELEVANT_FIELDS`, neutral by default
(golden-safe: no Sower is ever fielded on the golden path).

## Kit

7-step star path (`SOWER_PATH`: bud-cap climbs, blast widening, Cultivar fork at 3, Apex Cultivar
at 5, the Hundred-Year Garden capstone) · two branches (**Corrosive Bloom** — fewer, monstrous
detonations; **Choking Thicket** — saturation seeding) · mastery track (Cultivator title) ·
Adaptation `TOWER_THEMES.sower` (Virulent Payload / Swelling Bloom / Rapid Germination /
Rootweave) · renderer: pod silhouette + planted mines (grow-in fuse, pulse, trigger ring) + the
`mine` burst cue.

## Tests

`core/sower.test.ts` — the double gate, the plant→arm→detonate→Corrosion loop, the field cap,
sold-tower wither, determinism. Golden byte-identity is pinned by the usual invariant (nothing
trap-related executes without a fielded Sower).
