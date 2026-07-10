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
into tower reach on fleshy stalks (validator: `y ≥ MEGA.minWeakPointY`). **Destruction is
never just damage** — each kind maps a consequence:

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

**Targeting:** towers automatically prioritize an open weak point in range (`towerMegaFire`;
the Coil channels it — lock encodes as `beamTarget = -1000 - spec`); with an empty field they
chip the armored body (`bodyChipMult`); heroes strike organs when the line is clear. No manual
targeting.

## Encounters (registry-CYCLING — no hardcoded count)

| Mode | Cadence | Notes |
|---|---|---|
| Campaign | every `MEGA.campaignEvery` (10) stages, forever | arrives wave 1, persists all stage; the finale holds (overtime reinforcements) until it falls |
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

## The two authored organisms

- **VORAXIS, The Buried Maw** — the AGGRESSION mega: haste/armor/shield auras, broods, elite
  surges; desperation-phase self-knitting. Teaches eye-interrupts and the Gullet-Heart burst
  window. Palette: blood/bone.
- **MERIDIA, The Hollow Choir** — the SUPPRESSION mega: dampened guns, shortened range, jammed
  heroes, leeched economy, mender organisms, corrupted emplacements, slowed shots. Teaches
  infrastructure triage (nerve bundles / shield generator) and economy reclamation (spore
  clusters). Palette: pale teal/violet.

## Authoring a new Mega Boss

One `MegaBossDef` in `MEGA_BOSS_DEFS`: identity/lore/codex + palette + stats + an ability list
(from the pool) + phases + weak-point choreography + `reward.ichor` + a theme cue. The
validator enforces telegraphs, reachable organs, ≥2 weak points, and a real reward. Rotation
slots, collection entry, achievements ceiling, daily-roll pool, renderer (palette/kind-driven),
raid bar, and audio all pick it up automatically. Add a bespoke theme sting in `sound.ts` if
`themeCue` is new.

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
