# MEGA-BOSS.md — battlefield-scale raid organisms

Mega Bosses are **not** larger bosses. A framework boss (`boss.ts`) is an enemy that walks and
fights; a Mega Boss (`src/core/megaboss.ts`) is a **persistent battlefield presence** — a
living organism anchored across the top of the field, its body extending beyond the screen,
that (almost) never touches the Hive directly. It manipulates *everything else* while the
player defeats it through its **weak points** and survives the waves beneath it. Think raid
encounter: anticipation (telegraph) → execution (burst the organ) → payoff (the consequence
lands) → relief (the window before the next cast).

## Architecture

| Piece | File | Owns |
|---|---|---|
| Data + registries + scheduling + rewards | `src/core/megaboss.ts` | `MegaBossDef`, ability module pool, `WEAK_POINT_DEFS`, `megaBossRegistry`, `weakPointRegistry`, encounter cadence, the efficiency formula |
| Execution | `src/core/game.ts` (`megaBossSystem`) | rotation, `MegaFieldFx` folding, weak-point lifecycle, raid targeting, death/rewards, the Daily loop |
| Presentation | `src/render/megaboss.ts`, GameView (raid bar / intro / callouts), `sound.ts` (`mega*`/`wp*` cues) | everything the player sees/hears |
| Progression | `save.megaProgress`, `megaBosses` collection category, `mega_*`/`wp_*` achievements | lifetime ledger → passives + Power |

**Golden invariant:** every sim hook is gated on `mega !== null` and every `MegaFieldFx` field
defaults to ×1 / +0 (IEEE-exact identity), so any run without a Mega Boss — including the golden
baseline — is byte-identical.

## Ability modules (`MegaAbilityKind`)

Reusable battlefield-manipulation verbs — a Mega Boss is assembled from this pool, never
hardcoded: `haste` · `chitinize` · `eliteSurge` · `brood` · `menders` · `shieldWeave` ·
`dampen` · `suppressRange` · `slowShots` · `leech` · `jam` · `corrupt`. Every cast is
**telegraphed** (validator-enforced `telegraph > 0`) — the counterplay window. Aura verbs fold
into `MegaFieldFx` (read at the sim's existing chokepoints); instants (summons / weave /
corrupt) fire at the end of the windup. Phase `passive`s are always-on pressure severed by
nerve bundles. Adding a verb = one union member + one switch arm in `castMegaAbility` /
`foldMegaFx`.

## Weak points (`WEAK_POINT_DEFS`) — the signature mechanic

Independent gameplay objects with their own HP / armor / windows / regeneration, descending
into tower reach on fleshy stalks (validator: `MEGA.minWeakPointY ≤ y ≤ MEGA.maxWeakPointY` —
the descent band is calibrated to the REAL slot grid: pads sit at y 740–900, so organs drop to
y 560–700 where even the shortest combat reach connects, and never into the build rows).
**Destruction is never just damage** — each kind maps a consequence:

| Kind | Consequence |
|---|---|
| `eye` | interrupt the telegraph + stun the rotation |
| `heart` | EXPOSE the boss (+50% damage taken) |
| `parasite_sac` | halt summons + weaken living adds |
| `armored_growth` | strip boss armor |
| `shield_generator` | purge enemy shields + disable the weave |
| `nerve_bundle` | sever the passive aura |
| `regen_organ` | cancel self-regeneration |
| `spore_cluster` | biomass burst + disable leech |
| `energy_core` | overload → temporary tower fire-rate buff |
| `mutation_node` | the next phase enters WEAKENED (no entry surge) |

Spawn triggers per def: `phaseEntry` / `hpBelow` / `timer` / `abilityCast` — each Mega Boss
choreographs its own openings; phases change the choreography. Destroyed organs never return
(scars persist); un-burst windows close and regrow.

**Targeting — every damage source joins the raid, no manual control:**

- **Projectile towers** (`towerMegaFire`): prioritize an open weak point in range; a tower
  with **no prey in its own reach** chips the armored body (`bodyChipMult`), each striking
  the **highest point of the mass its range reaches** (`megaBodyY` — long guns hit the high
  band at `MEGA.bodyBandY`, short guns need the §lone siege descent). *(2026-07-19 stall
  fix: the gate was a bare-FIELD check — one add alive anywhere froze every out-of-reach
  tower, the reported "boss just stops" dead-time. The rule now mirrors the heroes': a gun
  that was going to do nothing turns on the mountain; a gun with live prey in range still
  fights the wave first, and `megaRaidYield` still parks the whole raid when the Hive is
  threatened. Pinned by megaboss.test.ts §stall audit.)* Pure-tempo kinds with
  `damage: 0` (the Effigy) are **skipped** — they keep their field kit instead of burning
  casts on zero-damage tracers.
- **Beam towers** get the same two legs at their own seams (beams branch before
  `towerMegaFire`): the **Coil** channels an organ (lock encodes as `beamTarget = -1000 -
  spec`) and falls to the body chip when no window is open and no prey is in its reach; the **Siphon** tethers an organ
  (`beamX/beamY` ride the stalk) and drains the body between windows — a one-way leech, it
  banks no biomass from the organism.
- **Heroes** (`heroMegaRaid`): when the line is clear they MARCH on the organism — seek the
  nearest open organ, strike it, and fall to the body when every window is spent. Raid duty
  owns the hero tick (behaviors resume the moment enemies return).
- **Units** (`unitMegaRaid`): a friendly unit with no enemy in its own reach joins the raid —
  the roost's drakes UNLEASH (the perch leash yields to the carcass when their territory is
  bare) and dive the nearest open organ; classic motes (wisps/thralls/broodlings) walk on it;
  all fall to the body when windows are spent and the field is empty (chip-scaled). Drake
  damage is roost-credited (mastery + the ADAPT ledger); hero summons stay ledger-free,
  exactly like their normal strikes.
- All four seams feed `rt.dmgByKind`, so ADAPT (Myriad) reads the true per-kind ledger.
- **THE HIVE OUTRANKS THE RAID** (`megaRaidYield`, derived once per tick): while the Core is
  threatened — attackers locked onto it, or any enemy inside the final-defense zone — every
  tower and beam yields raid duty back to normal enemy targeting. Without this a sparse early
  board tunneled an open organ (long guns reach organs from anywhere) while wave enemies chewed
  the undefended Hive — the stage-10 difficulty-contract wipe (docs/DIFFICULTY.md §curve).
  Campaign mega stages also display a raid-premium power bar (`C.megaStagePremium`) so the
  encounter's true cost is never understated.

## Encounters (registry-CYCLING — no hardcoded count)

| Mode | Cadence | Notes |
|---|---|---|
| Campaign | every `MEGA.campaignEvery` (10) stages, forever | arrives wave 1, persists all stage; the finale holds — the organism enters the **§lone siege** — until it falls |
| Infinite | every 20 waves | skipped while one lives (never two) |
| Boss Rush | every 5 waves | oversees the siege column |
| Daily | ~1-in-`dailyMegaOdds` (7) days | the **Mega variant**: no wave plan — the boss evolves (`dailyEvolveSec` stacks: haste + regen), reinforcements pulse, the run ends only when the Hive **or** the boss dies |

`campaignMegaFor` / `infiniteMegaFor` / `rushMegaFor` cycle `megaBossRegistry.active()` while
the **tier** keeps scaling (`megaStatsFor`: linear HP, sub-linear armor) — a new registered def
joins every rotation automatically.

## Rewards (`§rewards`)

Every kill guarantees **Ichor**: `megaBossIchor = base × tier growth × encounter mult ×
efficiency`. Efficiency = `(expected / actual)^0.6` clamped to [0.5, 2.0], where
`megaExpectedKillSec` scales with `√(recommendedPower / playerPower)` — **raw Power lowers the
expected time**, so it raises the bar instead of buying the payout; only outperforming your own
expectation pays, and stalling is floored (never optimal). Paid at `meta.finishRun` from
`RunStats.megaKills`; a mega also counts toward boss-kill ledgers.

## Progression

`save.megaProgress` (additive, sanitized): slain / perfect (zero integrity lost) / speed
(beat the expectation) / kills / weakPoints / wpKinds / interrupts / abilitiesSurvived /
fastestSec. Recorded live from `megaKilled` + `megaWeakPointDown` events (mirrors
`bossKilled`). The **Mega Bosses** collection category tiers each def Slain → Mastered →
Dominated and pays permanent passives (+tower damage, +boss loot) + the largest single-category
Power weight (0.04). Achievements: `mega_first/perfect/speed/all/10`, `wp_first/100/all_kinds`,
`interrupt_50`, `mega_attrition` (hidden), `mega_survivor` — roster/kind goals are
registry-driven.

## The seven authored organisms

- **VORAXIS, The Buried Maw** — the AGGRESSION mega: haste/armor/shield auras, broods, elite
  surges; desperation-phase self-knitting. Teaches eye-interrupts and the Gullet-Heart burst
  window. Palette: blood/bone. Motif: `maw`.
- **MERIDIA, The Hollow Choir** — the SUPPRESSION mega: dampened guns, shortened range, jammed
  heroes, leeched economy, mender organisms, corrupted emplacements, slowed shots. Teaches
  infrastructure triage (nerve bundles / shield generator) and economy reclamation (spore
  clusters). Palette: pale teal/violet. Motif: `choir`.
- **OSSIRA, The Pale Shepherd** — the FORTIFICATION mega: armors/shields/mends the horde.
  Teaches answer priority (armored growths, shield generator, the deep-phase regen organ).
  Palette: bone/gold. Motif: `shepherd`.
- **VESPERINE, The Tidebinder** — the TEMPO mega: alternating slow-shots / haste / jam tides.
  Teaches interrupt rhythm (its eyes open on every major telegraph). Palette: abyssal
  teal/violet. Motif: `tide`.
- **MOLOCH-AMA, The Tithe** — the ECONOMY predator: deep leech, corrupted emplacements, elite
  collectors; spore clusters pay the tithe BACK. Palette: gilded umber. Motif: `tithe`.
- **SARCOPHAGE, The Self-Devourer** *(§overhaul)* — the GLUTTONY mega: plants broods, then
  **GORGES** on them to heal. Teaches DENIAL (kill the food, or interrupt the Gorge-Eyes
  mid-meal). Palette: bile green. Motif: `gorge`.
- **MYRIAD, The Thousand Answers** *(§overhaul)* — the ADAPTATION mega: each **ADAPT** cast
  armors it against the tower kind that has damaged it most (that kind hits for ×0.45).
  Teaches diversification + interrupting the lesson; heroes bypass the answer entirely.
  Palette: iridescent violet/silver. Motif: `myriad`.

## §functional overhaul (2026-07) — stagger, the finale, and the two new verbs

- **STAGGER** (`MEGA.stagger*`): every destroyed weak point adds 0.4 to a posture meter that
  decays between pushes; filling it **TOPPLES** the organism for 6s — rotation stunned, the
  live telegraph dropped (a cataclysm defused this way is the clutch play), **organ windows
  frozen**, and the body takes ×1.4 damage. The raid-mechanic payoff for focus-fire
  choreography, surfaced as a meter under the raid bar and a gold-flooded, slumped body.
- **CATACLYSM** (mandatory finale — the validator enforces one per def, castable in the last
  phase): a ≥4s interruptible windup that, if it RESOLVES, strikes Hive integrity directly
  (14–20 by def). The HUD cast bar burns red (`⚠ CATACLYSM — INTERRUPT IT`), the maw charges
  a white-hot core, and the vignette warning band doubles. Interrupt it (eye or stagger) and
  nothing lands.
- **GORGE** (Sarcophage): devours up to `count` living non-boss enemies nearest the maw
  (deterministic y-then-id order), healing tier-scaled HP each — no bounty, no kill credit.
  Counterplay is denial: an empty field means a STARVED cast.
- **ADAPT** (Myriad): studies the per-tower-kind damage ledger (`rt.dmgByKind`, tracked at the
  raid-fire seams) and armors against the argmax kind for its duration (`×magnitude` damage
  from that kind only; heroes bypass it). The HUD chips it as `ADAPTED·<KIND>`.

## §modes (2026-07-19) — the mega is part of its wave everywhere but campaign

`checkWaveEnd` holds a wave OPEN while a mega stands in every mode except campaign: in
Infinite and Boss Rush the organism counts as a wave enemy — the wave cannot complete
until it falls (previously only daily/campaign-finales held, so a wave could slip past a
live mega in the gap before its reinforcement pulse). The lone-siege loop supplies
pressure while it stands. **Campaign is the one mode where a mega persists across
waves**; only the stage's FINAL wave holds for the kill. Pinned by megaboss.test §modes
(endless holds + release-on-death; campaign mid-stage completes past it).

**Raid audio:** raid strikes bypass projectiles, so they never fired the impact cue —
`megaHitSfx()` now plays one throttled `hit` (≥0.15 s apart across the whole raid: beam
per-frame ticks and full volleys read as steady combat, never a cue machine-gun).

## §damage-gate honesty (2026-07-19) — the bar never freezes silently

The raid bar states WHY hp moves slowly instead of looking stuck:

- `CARAPACE SEALED · CHIPPING` — no organ is open; idle guns are in armored-chip mode
  (`bodyChipMult`), never frozen. Shown only when neither exposed nor staggered.
- `▲ REGENERATING` — phase regen (or daily evolution stacks) is actively healing and no
  Regen Gland rupture is suppressing it.
- `◆ ARMORED` — body armor is up, blunting chips until an Armor Node rupture.

Each chip's tooltip names the weak-point counter that removes it (`MegaBannerSnapshot.
regenActive/armored`; sealed derives from the open-organ list being empty).

## §feel (2026-07-19) — the fight-timeline probe + the organ drought valve

**"The fight feels janky" is now a number.** `npm run sim:mega` (`scripts/sim-mega-feel.ts`)
runs REAL fights (10-tower forward board, ravager hero, live wave plans) across
campaign/infinite/boss-rush × voraxis/meridia × t1/t3 and measures what the player's HP bar
actually does — the rebuild-decision instrument:

- **uptime** — % of fight time the boss hp is visibly falling;
- **longest flat** — worst continuous stretch with no net hp loss, split by cause (regen
  outpacing chip vs nothing landing);
- **organ cadence** — windows opened/burst/expired + mean gap between openings;
- **rotation & pacing** — telegraphs/interrupts/staggers, per-phase seconds, kill time vs
  the reward model's expected bar, death-sequence seconds, waves held.

It measures **fight time only**: campaign's draft pauses the whole sim (`paused` includes
`'draft'`) and prep/settle freeze the mega (`megaBossSystem`/`towerSystem` only run in the
`'wave'` branch of `step`) — the harness plays those beats like an impatient player
(`chooseCard` first option, `startWave` immediately) and excludes them from the timeline.
**The first probe draft missed this and read a "585 s campaign stall" that was actually the
draft picker sitting open** — a harness bug worth remembering: any campaign instrument must
drive the between-wave beats or it measures the menu, not the game.

Enforced thresholds (exit 1): continuous modes flat ≤ 12 s / uptime ≥ 50 %; campaign
(chunky by design — guns split between defense duty and the raid) flat ≤ 26 s / uptime ≥ 30 %.
Measured 2026-07-19 (all PASS): kills 34–61 s of fight time vs 75–97 s reward bars, uptime
69–80 %, longest flat 1.2–2.7 s, organ mean gap 4–10.5 s, death sequence 3.5 s, campaign
holding 2 waves. **Verdict: no functionality rebuild warranted** — the earlier jank reports
trace to the fixed targeting stall (§targeting), silent raid strikes (§modes), and waves
slipping past live megas (§modes).

**Organ drought valve** (`MEGA.organDroughtSec`, `megaOrganDrought` in game.ts): destroyed
organs never return, so cast/timer triggers no-op on their scars — a persisting campaign
mega that spends every destructible while hp still sits above the next `hpBelow` trigger
would have zero windows left. When NOTHING has been open for `organDroughtSec` (22 s), the
organism REGROWS one spent organ round-robin (`droughtRotor`; fresh hp, fresh window,
"IT REGROWS —" float + `wpOpen` cue). Healthy fights never reach it (mean gap 4–10.5 s);
`rt.lastOrganOpenAt` is stamped by every opening. Pinned by megaboss.test §organ drought
valve (all-specs-destroyed ⇒ reopen within the window; a permanently-open organ ⇒ the valve
stays silent and the rotor never moves). Golden-safe: the valve lives inside
`megaBossSystem`, which never runs without a mega.

## §lone siege (2026-07) — the last thing standing turns on the Hive

Before this pass, a mega whose wave plan was spent just **sat there soaking** — its aura verbs
had no horde to buff, broods melted on arrival, half the board couldn't even reach it, and the
only real threat was the last-phase cataclysm (~16 integrity across a 3-minute overtime). Now
the encounter can never stall (all state in `MegaRuntime.siegeT/lashT/lashWindup/lashes`, all
tunables in `MEGA.siege*`, everything gated on a live mega ⇒ golden-safe):

- **Engage**: once the wave plan is spent (`spawnedAll`, empty queues) and the field has been
  bare for `siegeGraceSec` (8s), the organism **turns on the Hive** (`IT TURNS ON THE HIVE`,
  the HUD chips `HIVE SIEGE`). Its own broods/reinforcements never break the siege — only a
  resumed wave plan (the next wave) stands it down. Applies to EVERY encounter: the campaign
  finale hold, infinite/rush mid-run gaps, and the Daily variant.
- **HIVE LASH** — the pressure clock: on a cadence that opens at `siegeLashEvery` (13s) and
  **tightens with every landed blow** (`× siegeLashRamp` per lash, floored at
  `siegeLashEveryMin`), it winds up a `siegeLashTelegraph` (3.2s) reaching arm and strikes the
  Core for `siegeLashDamage + siegeLashPerTier·(tier−1)` integrity. A committed windup resolves
  through stragglers, but a **new** one only begins over a bare field. Counterplay is the
  rotation's own: an **eye interrupt or a stagger drops the windup** (counts as an interrupt,
  forces a re-approach) — stalling is a losing race, interrupting buys a full beat.
- **The descent**: while sieging, the mass hangs to the front build row — `megaBodyY` lets
  every emplacement (down to the shortest reach) chip the body, and the chip bites deeper
  (`siegeChipMult` 0.45 vs `bodyChipMult` 0.3): reaching for the Hive **exposes** it.
- **Escalation**: the quiet-field reinforcement pulse surges with siege time
  (`max(evolveStacks, ⌊siegeT/siegeReinforceEvery⌋ capped at siegeReinforceCap)` extra adds +
  meaner mixes) — the Daily's own evolution ladder is unchanged by construction (`max`).
- **Presentation** (`render/megaboss.ts`): the arm coils under the maw between lashes, extends
  toward the Nucleus across the windup (charge bulb + a nucleus warning ring past 70%), snaps
  through as a strike afterimage on completion (interrupted windups just retract), and the
  sieging mass **drapes** — feeler curtains sink to the chip band so body tracers visibly bite
  hanging flesh. Raid tracers themselves upgraded from hairlines to sheath+core artillery
  lines with impact ticks. Audio rides existing cues (`megaAbility` windup, `megaCataclysm`
  strike, `megaPhase` on the turn).

Verified against the report that motivated it (campaign stage 10, 16-tower median board):
overtime went from **16 integrity lost in 184s of nothing** to **~60 integrity of drumbeat
pressure with every tower firing** — a real DPS race at the reward model's expected pace.

## Authoring a new Mega Boss

One `MegaBossDef` in `MEGA_BOSS_DEFS`: identity/lore/codex + palette + **motif** (the
renderer's per-def anatomy suite — pick an existing `MegaMotif` or add a `drawMotif` case) +
stats + an ability list (from the pool) + phases + weak-point choreography + `reward.ichor` +
a theme cue. The validator enforces telegraphs, reachable organs, ≥2 weak points, a real
reward, and the **cataclysm finale** (present + castable in the final phase). Rotation
slots, collection entry, achievements ceiling, daily-roll pool, renderer (palette/motif-
driven), raid bar, and audio all pick it up automatically. Add a bespoke theme sting in
`sound.ts` if `themeCue` is new — and **THE RULE**: ship its defeat cutscene in
`core/cutscenes.ts` or `cutscenes.test.ts` fails the build.

## Visuals v2 (2026-07) — `render/megaboss.ts`

The presentation pass on top of the original layered body: a **carapace edge-light** (underglow +
lit chitin rim riding the exact breathing lobe line) so the mass reads as armored anatomy;
telegraphs **GATHER** — motes stream into the gaping maw across the windup while the vignette
adds a top-edge warning band; the frame a telegraph resolves, a **CAST shock ring** slams out of
the maw (module-scoped edge detect on `telegraph` — suppressed when the edge came from an eye
INTERRUPT, i.e. `stunned > 0`, so the player's win never reads as a landed hit). Weak-point
organs draw at **×1.25** through a transform (every per-kind painter inherits the scale), die
with a one-shot **RUPTURE** burst (ring + ichor chunks, keyed on the open→destroyed transition
per `spec`), and leave a torn, twitching, weeping scar. The same resolved-cast edge drives the
`mega_cast` audio cue from GameView's banner snapshot-diff (`telegraph` present→gone while alive
and not stunned); `megaAbility` remains the windup riser. All module state is render-side
one-shot bookkeeping — the sim is never read back, golden-safe by layer.

**Visuals v3 (§overhaul):** per-def **anatomy motifs** (`drawMotif`, keyed by `MegaBossDef.motif`)
— tusk-ranked jaw (maw), swinging bell-organs (choir), bone crooks + chimes (shepherd), a
translucent medusa bell + streamers (tide), gilded scales + coin-drips (tithe), a stacked second
jaw + swallowing gullet bulge (gorge), a blinking field of lesser tracking eyes over mirror
facets (myriad) — so seven megas never read as palette swaps. **STAGGER presentation:** the mass
slumps 26px on a smoothed ease, the eye rolls back and half-lids, the maw hangs slack with drool
strands, the body floods gold, every open organ wears a gold urgency ring, and the frame gets a
thin gold edge-light while the HUD meter (under the raid HP bar) flips to `STAGGERED — POUR IT
ON`. **CATACLYSM presentation:** the gather doubles and burns hot, a white core swells in the
throat with the windup, the warning band turns red at double depth, and a resolved cast slams a
×1.7 shock ring (the edge-detect remembers the winding kind via `lastTeleKind`).

## Performance

One anchored runtime + O(weakPoints) per tick; `megaFx` folds are multiplications at existing
chokepoints; rendering is layered procedural Canvas 2D. Hundreds of enemies + dozens of towers
+ multiple heroes run unchanged (the system is a no-op when absent and O(small) when present).

## Known limitations / future hooks

- "Slow-motion" weak-point kills are presentation-side (shake/flash/hitstop cues), never
  sim-time — determinism is non-negotiable.
- Mega abilities pause between waves (rotation runs in the wave phase); windows lapsing across
  the settle is accepted.
- Tutorial: the arrival card + HUD callouts carry the teaching load; a scripted tutorial beat is
  a future hook.
- Weak-point *accuracy* stats (misses) aren't tracked — no miss concept exists for raid fire.
