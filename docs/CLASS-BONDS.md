# CLASS BONDS — the class set bonus

> Owner request (2026-11-06): "add a set bonus mechanic… establish classes for each tower and hero, then
> when a certain number of them are fielded it provides the bonus as long as they are deployed — and it
> would be cool if the bonus could be improved." Code: `src/core/classBonds.ts` (tables + math),
> `src/core/game.ts` (the fold), `src/ui/BondsScreen.tsx` (the wing), `src/ui/BuildPanel.tsx` (in-run).

## The classes (already in the game)

Every tower and hero has one of six combat classes (`TowerDef/HeroDef.combatClass`; the display table
is `core/combatClass.ts` — glyph, colour, role). The bonds READ that taxonomy; they add none.

| Class | Role | Towers | Heroes |
|---|---|---|---|
| ✦ Kinetic | impact | Needle Spitter, Carrion Maw, Undertow Polyp, Spitfang Turret, Wyrmwing Glaive | Ravager, Riptide |
| ☣ Caustic | dissolution | Bone Mortar, Amber Chrysalis, Blight Sower, Acid Lancet | Vitriol, Cinderwyrm |
| ⬡ Viral | infection | Parasite Nest, Miasma Lung, Tick Battery | Revenant, Chimera, Myceliarch |
| ◉ Neural | control | Neural Obelisk, Wailing Effigy, Synapse Spire, Rift Anchor, Basilisk Maw | Overseer, Fovea |
| ✚ Vital | sustain | Flesh Reactor, Marrow Siphon, Drake Roost, Gristle Warren | Shepherd, Carrion |
| ◈ Resonant | amplification | Resonance Coil, Chitin Bell, Ossuary Choir, Keening Quill | Knell |

(The live membership is derived from the defs — the Class Bonds screen lists it; this table is a snapshot.)

## The rule

- **Counting:** every DEPLOYED tower counts once toward its class (two Needle Spitters are two Kinetic
  units) and every FIELDED hero counts once (a downed hero still counts — it respawns).
- **Tiers:** `BOND.thresholds` = **2 / 4 / 6** units wake **Bond I / II / III**.
- **Lifetime:** the bond follows the board live — selling, losing or relocating changes the count the
  same step (`Game.refreshBonds`, a packed composition signature; the fold reruns only on a change).
- A tier that RISES is announced on the board ("◆ IMPACT BOND II" in the class colour + the splice cue).

## What each bond gives (`CLASS_BONDS`, base = level 0)

| Bond | I | II | III |
|---|---|---|---|
| Impact (Kinetic) | +10% damage | +20% | +32% |
| Dissolution (Caustic) | +7% damage, +4% fire rate | +14%, +8% | +22%, +12% |
| Contagion (Viral) | +10% fire rate | +20% | +32% |
| Lattice (Neural) | +7% fire rate, +4% damage | +14%, +8% | +22%, +12% |
| Sustain (Vital) | Core +2 per wave clear, +5% damage | +4, +10% | +7, +15% |
| Chorus (Resonant) | **every** tower +3% fire rate, +5% damage | +6%, +10% | +10%, +15% |

"Damage" reaches towers AND heroes of the class (`heroDamageMult`); "fire rate" reaches towers of the
class; Chorus's fire rate reaches every tower. All of it folds in `Game.towerAttackMods` — the one
damage/rate fold the projectile, beam, trap and summon paths share — so every firing path agrees.
The Sustain mend lands after the wave's flawless read (a mend never turns a breach into a clean wave)
and also at an Early Call (the called-over wave's per-wave beat).

## Improving a bond (the meta lever)

Each class has a **bond level** 0..`BOND.maxLevel` (10), bought with **Genome Cores** on the Class Bonds
screen (Evolution Hub). A level adds `BOND.levelStep` (8%) of the base to EVERY tier of that bond
(level 10 ⇒ ×1.8). Price: `baseCost × costMult^level` (150 × 1.5^L). Levels are account strength:
`classBondsPowerMult` folds `BOND.powerPerLevel` per level into the `meta` Power bucket (×1 with none).
`meta.upgradeBond(cls)` is guarded (`progress.upgrade`) and refused while the wing is sealed.

## Gating, fairness, golden safety

- **Reveal:** FEATURES `bonds` at Campaign stage `BOND.revealStage` (13 — the first wing past the first
  hour; the hour-one screen cap of 18 holds). The SAME gate turns bonds on in runs (`RunOptions.classBonds`,
  passed by GameView once revealed): a run never shows a bond the screen has not introduced.
- **Daily Run:** bonds run at BASE strength (no account levels) — the shared board stays fair, the same
  rule as Mulligans and the nemesis. Never in the tutorial; the Arena boots its own games without them.
- **Golden-safe:** absent `classBonds` ⇒ `bond` stays null, no fold runs, the snapshot has no `bonds`.
- **Save:** `classBonds` (schema **v58**), sparse, sanitized to known classes and 0..max.

## Teaching (the onboarding contract)

| Moment | Surface |
|---|---|
| Stage 13 reveal | What's New card **Class Bonds** (`class-bonds`, teaches the wing) with **Show me ▸** → the guided walkthrough (`GUIDES`: the six bonds → level one up, interactive) |
| First bond in a fight | Field note **CLASS BOND** anchored to Run Build → Class Bonds (`bonds-in-battle`) |
| Every run | Run Build panel → Class Bonds: each fielded class, count / next threshold, tier pips, tap/Enter/Space expands the exact effect and next threshold; conveyor pods carry their class mark |
| Any time | Help wiki: **Class Bonds** + **Bonds in Battle** |

## Extending

- A new class = one `CLASS_BONDS` row (the screen, HUD and tests iterate `COMBAT_CLASS_ORDER`).
- A new effect channel = a `BondTierFx` field + its fold in `bondFx` + its application in the sim.
- Tuning lives in `BOND` + `CLASS_BONDS` only.

## Known limitations

- Bonds are not part of the live adaptive-threat Power ratio (§6a) — they are a composition reward, not
  invested Power; the magnitudes are kept moderate for that reason.
- The Power Advisor does not rank bond levels yet (a bond's value depends on what you field).
- Range is not a bond channel (tower range is frozen per kind for the range previews).

Run bond summaries are native disclosures with 44px targets. Their explanations stay inside the
scrolling drawer, remain expanded during tier/count refreshes, and expose the current tier and
unit count to assistive technology. Reading keys do not dispatch battlefield shortcuts.

Bond effect descriptions read the resolved level from each HUD bond snapshot, not the live
account store. Daily runs therefore display their actual base-strength effects even when the
account owns upgrades. This snapshot field does not change the bond fold or combat values.
