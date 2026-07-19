# TOWER-IDLE.md — Idle Postures & Secondary Behaviors (canonical)

> **"A tower should never feel asleep."** Every tower always exists in one of three
> states — **COMBAT** (targets in reach, primary attack pattern), **PREPARATION**
> (nothing in reach, secondary behavior running), **TRANSITION** (smoothly easing
> between the two — never snapping, never frozen). This doc is canonical for the
> state contract, the verb vocabulary, and the per-tower behavior table.
> Implementation: `src/core/towerIdle.ts` (data + laws) + `game.towerSystem`
> (execution) + `render/towerForms.ts` (posture presentation). Companion to
> `TOWERS.md` (roster identity) and `RANGE.md` (range-as-identity).

---

## 1. The three-state contract

The sim maintains one scalar per tower: **`prep` (0..1)** — the preparation
posture. It is the single source of truth for state, for the renderer's motion,
and for the secondary-behavior magnitudes.

- **Engagement test** (per tick, all firing modes): *is any living enemy inside
  the tower's effective range, outside its deadzone?* Field/aura towers use the
  same test (their empty pulses previously cycled anyway — now an empty-handed
  tower banks preparation instead of pulsing air).
- `prep` **rises** while unengaged (`1 / TOWER_IDLE.riseTime` per second — towers wind
  up over a few seconds) and **falls fast** while engaged (`1 / TOWER_IDLE.fallTime`,
  ~0.35 s — combat snaps the body taut, the easing IS the transition animation).
- Discrete state for UI copy: `prep < 0.2` → COMBAT · `> 0.65` → PREPARATION ·
  else TRANSITION. The renderer never uses the discrete state — it eases from the
  scalar, so motion is continuous by construction.
- The build/draft phase does not tick the sim's towers (unchanged); the renderer
  treats build phase as full preparation (`prep → 1` presentation-side), so the
  battlefield breathes between waves too.

## 2. Secondary-behavior vocabulary (7 sim verbs, data-driven)

Every tower carries exactly one `IdleBehaviorDef` row (`core/towerIdle.ts` —
`IDLE_BEHAVIORS`, validator-enforced total coverage). A future tower ships a row
or the validator fails the build. The verbs:

| Verb | While PREPARING | On re-engagement |
|---|---|---|
| **windup** | banks `charge` 0..1 over `chargeTime` | the FIRST act consumes it: `open` bundle (dmg ×, range ×, +status amount, +pierce, +projectiles/jumps/blades) scaled by charge |
| **reserve** | gestates up to `volleys` stored casts | opening casts fire back-to-back at `burstInterval` until the reserve is spent |
| **ranging** | fires weak suppression shots (`dmgFrac`, `splashFrac`) every `cadence` at anything on the field it can legally reach | none — ranging is the idle contribution itself |
| **preheat** | beam heat drifts toward `floor` instead of bleeding to 0 | the beam opens pre-ramped |
| **tending** | minion/trap husbandry: hatch/plant faster (`rateMult`), perch-regen harder (`regenMult`), +`capBonus` | none — the brood/minefield IS the payoff |
| **trickle** | pays `biomassPerSec` / mends `integrityPerSec` (clamped, only while hurt) | none |
| **choir** | grants towers within `radius` a damage/rate bonus while THIS tower is unengaged | the buff exhales when combat takes the choir |

All payouts flow through the EXISTING folds — windup bundles ride the cast
globals (`castScratch.damageMult`, `castRangeMult`, `castExtraProjectiles`,
`castScratch.pierce`, the new `castStatusAmountBonus`), ranging shells run the
tower's own ability kit (mastery credit, fire cues, reactions — all inherited),
trickles use the biomass/integrity chokepoints. Gene cards, equipment, strains,
branches and hero auras therefore compose with idle behaviors BY CONSTRUCTION
(they multiply the same numbers). One future-proof knob:
`RunModifiers.towerIdleChargeMult` (default 1) scales charge/gestation speed —
the seam future gene cards / equipment affixes hook without new sim code.

## 3. The per-tower table (22 rows — identity-reinforcing, no two alike)

Payoff axes deliberately never repeat exactly: damage, reach, pierce, status
kind, status depth, extra arcs/blades/volleys, burst rhythm, heat, husbandry,
economy, repair, and neighborly song are all different levers.

| Tower | Range | Behavior | Verb | Preparation → payoff |
|---|---|---|---|---|
| Needle Spitter | 700 | **Spindle Tension** | windup | slow 7 s wind; opening volley ×1.6 dmg, +1 pierce — a single rail-crack, then back to chip |
| Bone Mortar | 960 | **Ranged Solution** | windup | slow 8 s plot; opening shell ×1.35 dmg, ×1.25 splash — the pre-computed firing solution lands heavier (its reach is the map, so its idle is rare and its opener token by design) |
| Flesh Reactor | 90 | **Systolic Reserve** | trickle | while the neighborhood is calm the heart knits the Hive: +0.55 integrity/s (only while hurt) |
| Parasite Nest | 280 | **Spore Drift** | ranging | while nothing is in nesting reach, exhales a slow drifting spore at up to ×2 range every 3.5 s — 30% damage but a full Infection seed. The epidemic starts before the wave arrives |
| Neural Obelisk | 360 | **Stored Scream** | windup | opening pulse +0.6 Disruption and ×1.2 reach — the held scream lands harder |
| Carrion Maw | 170 | **Salivating Gape** | windup | fast 3.5 s wind; opening bite ×2.0 dmg, ×1.25 reach — the lunge. The shortest range earns the biggest opener |
| Amber Chrysalis | 430 | **Resin Winding** | windup | opening encase +0.5 s Freeze — the warden's patience thickens the amber |
| Wailing Effigy | 300 | **Gathering Dread** | windup | opening wail +0.5 s Fear, ×1.15 reach — dread pools while the field is quiet |
| Resonance Coil | 340 | **Harmonic Reserve** | preheat | idle heat drifts to a 0.35 floor — the beam opens a third pre-ramped, its cold-start weakness paid down by patience |
| Marrow Siphon | 300 | **Root Draw** | trickle | +0.8 biomass/s while unengaged — the roots drink the soil between meals |
| Blight Sower | 300 | **Fallow Tilling** | tending | unengaged: mine cap +1 and planting ×1.3 — the gardener works hardest before the wave |
| Synapse Spire | 210 | **Static Accumulation** | windup | opening arc +2 extra jumps — banked static rides the first lightning |
| Undertow Polyp | 165 | **Deepening Current** | windup | opening pulse ×1.5 dmg, ×1.2 reach — the undertow SNAPS on first contact |
| Spitfang Turret | 380 | **Belt Feed** | reserve | loads a 3-round belt; re-engage dumps it at 0.16 s per round — the autocannon says hello |
| Rift Anchor | 190 | **Horizon Collapse** | windup | opening pulse ×1.6 dmg, ×1.25 reach — the starved void closes its fist |
| Wyrmwing Glaive | 470 | **Whetstone Orbit** | windup | opening throw +1 blade — the spare wing joins the first cut |
| Drake Roost | 380 | **Brood Tending** | tending | calm leash: hatch ×1.5, perch-regen ×2 — the roost mothers hardest between hunts |
| Miasma Lung | 250 | **Deep Inhale** | windup | opening exhale ×1.4 reach, +1 Infection — the sac inflates while the field is clean |
| Chitin Bell | 230 | **Sustained Toll** | windup | opening toll +1 Resonance, ×1.2 reach — the hum never quite dies |
| Acid Lancet | 620 | **Pressure Draw** | windup | opening harpoon ×1.45 dmg, +1 pierce — pressure past the stops |
| Basilisk Maw | 560 | **Lidless Vigil** | windup | opening stare +0.4 s Freeze — it was already watching you |
| Ossuary Choir | 250 | **Sepulchral Chorus** | choir | while unengaged, towers within 250 px sing +5% damage — the bone choir tunes the guns |

## 4. Long-range balance — contribution, not nerfs

The range-based advantage is corrected by **giving idle time value where idle
time actually exists** (docs/RANGE.md still owns range-as-identity; no range or
DPS was reduced):

- **Payoff scales inversely with range band.** Brawlers (≤250 px — maw, polyp,
  rift, bell, lung, ossuary, reactor) idle most, so they carry the largest
  openers/auras; marksman kinds (≥470 px — needle, glaive, lancet, basilisk,
  mortar) get token openers or pure-engagement behaviors (ranging salvos are
  ~15% of mortar DPS by design — presence, not power).
- **Charge times scale WITH range.** Short-range towers wind in 3.5–4.5 s (their
  idle windows are short and frequent); long-range towers wind in 6–8 s (their
  idle windows are rare, so the bank fills slowly).
- Verified by `scripts/sim-tower-idle.ts` (§7): per-kind uptime, idle share,
  damage + support contribution, and the short-vs-long value ratio, before/after.

## 5. Determinism & the golden contract

- All idle math is fixed-timestep, rng-free (charge/trickle/posture are pure
  `dt` accumulation; ranging targets via the existing deterministic profile
  pick). The rng stream is only touched where the EXISTING pipeline already
  rolls (ranging reuses the normal cast path).
- Idle behaviors change gameplay for every fielded tower — the golden seeds were
  **re-pinned deliberately** (autoplay fields needle/mortar/reactor: windup
  openers, ranging salvos, and systolic mending all move integrity/biomass).
  The re-pin rationale lives in `golden.test.ts` with the invariants that held.
- `RunOptions.disableIdle` (dev/instrument-only) turns the layer off for A/B
  measurement; shipping UI never sets it.

## 6. Presentation language (render/audio)

The posture scalar drives everything; nothing snaps:

- **PREPARATION**: breathing amplitude ×(1 + prep·0.6) and slower breath period;
  the class-colored core dims to an ember; verb-specific organ motion — charge
  ring filling (windup), sac inflation (reserve — parasite/spitfang belt), heat
  shimmer (preheat), tending glow toward brood/mines, trickle motes drifting to
  the Nucleus/bank, choir link-threads to buffed towers, ranging reticle sweep.
- **TRANSITION**: the same properties eased by `prep` in motion (0.35 s in,
  ~riseTime out) — roots flex, apparatus re-aims, glow crossfades.
- **COMBAT**: existing fire/recoil/anticipation language (unchanged) + a one-shot
  **charged-opener flash** when a windup/reserve payload releases.
- **Audio**: event cues only, no loops — a quiet `tprep_ready` chime when a bank
  fills (once per idle cycle, throttled), the existing fire cue carries the
  opener (it lands louder by being a bigger hit), ranging shells reuse the lob
  thud at reduced gain. Wardrobe tower-family pitch variants apply (same tags).

> **Extended by the LIVING ORGANISM layer** (LIVING-BATTLEFIELD.md §organisms,
> `render/organism.ts`): approach-ANTICIPATION (enemies closing in but not yet in
> range) bridges PREPARATION→COMBAT presentation-side, plus per-kind emissions,
> environmental tremor, recovery settles and the org_* ambience director. Render-only —
> the sim contract in this doc is unchanged.

## 7. Integration map

- **Inspector / Tower Codex / Lab**: state chip (COMBAT/TRANSITION/PREPARATION)
  + the behavior name/blurb, auto-derived from `IDLE_BEHAVIORS` (zero per-tower
  UI code).
- **Mastery**: ranging shells and opener damage credit the firing kind through
  the normal damage path (`abilitySourceKind`); `activeTime` already accrues.
- **Power Score**: NO change — idle behavior is in-run flavor of towers the
  account already owns; account power stands still (validated by the untouched
  power suite).
- **Gene cards / equipment / strains / branches**: compose via the shared folds
  (§2); `towerIdleChargeMult` is the dedicated future hook.
- **Statistics**: run-level `idleStats` counters (openers released, ranging
  shells, biomass trickled, integrity mended) exposed to the sim harness.
- **Instrument**: `scripts/sim-tower-idle.ts` → uptime/idle/contribution report
  (npm run sim:idle), A/B vs `disableIdle`.

## 8. Tunables

Global pacing in `config.ts` (`TOWER_IDLE` — plain `IDLE` belongs to Idle Harvest): riseTime, fallTime, readyAt, and the
mods knob default. Per-tower magnitudes in `core/towerIdle.ts` rows — one place
to tune, validator-bounded (openers ≤ ×2.5 dmg, ≤ ×1.5 reach, charge times
2–10 s, trickles ≤ 1/s) so a typo can never ship a runaway idle economy.

## 9. Balance findings (measured, `npm run sim:idle`)

Mixed 6-kind board (needle/mortar/reactor/maw/parasite/spitfang), seeds
1/7/42/777, idle layer vs `disableIdle` legacy:

- **Outcome**: 4/4 wins both arms; Σintegrity **725 vs 701** — the layer is a
  net defensive gain (24 integrity mended by Root Draw across the four runs).
- **Layer output**: 231 charged openers released, 115 Spore Drift shells.
- **Short-range value**: ≤300 px damage share **held/rose** (0.2% vs 0.0% —
  parasite now contributes between engagements instead of nothing).
- **No long-range amplification**: mortar's share flat (70.7% vs 70.6%),
  needle's dipped (27.5% vs 28.5%) — the inverse payoff scaling (§4) works;
  range buys no extra idle dividend.
- **Engagement shares** confirm the design premise: mortar sits in COMBAT ~98%
  of deployed ticks while short kinds sit ≤10% — exactly the idle time the
  verbs now monetize.

Verdict: ship at current magnitudes; tune only in `IDLE_BEHAVIORS` rows.
