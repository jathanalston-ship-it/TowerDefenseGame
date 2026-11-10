# HERO-SELECTION.md — click a hero, read it, act on it

Heroes are now interactive during a run. Clicking an active hero **selects** it: a bright selection
ring marks it on the field and a non-modal panel reads out its live state. **Selection never pauses
gameplay** — the sim keeps ticking while the panel is open. This is also the seam future hero
abilities target through.

---

## What a click shows

Tapping a living hero opens the **Hero Selection Panel** (bottom-left of the board), showing:

- **Selection ring + highlight** — a pulsing warm-gold ring drawn under the hero (renderer).
- **Portrait + identity** — the procedural `HeroPortrait` (class-tinted, mastery-rank flourish), name,
  combat class, and **Level** (hero mastery level).
- **Health** — HP / max, with a shield overlay when the hero has an absorb pool.
- **Effective combat stats** — live **Damage**, **Attack Speed** (/s), **Move Speed** (px/s), and the
  effective **Ability Cooldown**. Damage/attack read `—` for a non-attacker (support/controller). These fold
  gear + stars + mastery + biome, matching what combat actually uses.
- **Cooldowns** — a gauge per relevant timer: the signature Ability (always), Attack (attackers),
  role Pulse (support/control).
- **Movement state** — Holding / Moving / Attacking / Retreating / Downed.
- **Current target** — the enemy the hero is engaging (by name), or —.
- **Temporary buffs / debuffs** — chips derived from live state (Shielded, Bloodthirst, Killchain ×N).
  The debuff section is wired for when hero statuses land.
- **Permanent buffs** — Evolution stars, mastery multiplier folds (+DMG% / −Ability CD%), and earned
  mastery perks; a clear "none yet" when the hero is fresh.
- **Power Score contribution** — the hero's power rating (stars × mastery × gear), from `heroDetail`.
- **Active equipment** — the hero's equipped Weapon / Armor / Relic (from the run's locked loadout).
- **Ability readout** — the signature ability's name, cooldown, and **description**; the block is the
  seam future abilities extend.

---

## Architecture (future-proof)

The **selection is authoritative in the sim** (`Game`), not just a UI flag — so upcoming hero
abilities can act on "the selected hero" directly.

- **Selection state** — `Game.selectedHeroKind: HeroKind | null`.
  - `selectHeroAt(px, py): boolean` — hit-tests the roster (nearest living hero within a tap radius);
    integrated into `Game.click` (checked before towers, since heroes roam the open field).
  - `selectHero(kind | null)` — set/clear directly.
  - `getSelectedHero(): Hero | null` — **the seam future abilities act through.**
  - Cleared by clicking empty space or `cancelInteractions()` (Escape).
- **Observational hero AI state** — `Hero.targetId` (current `Enemy.id`, or −1) and `Hero.moveState`
  are refreshed each tick inside `updateHero` + the per-behavior updates. They are **read-only signals**
  — never fed back into sim math — so they power the panel and future ability targeting without
  changing outcomes.
- **Render** — `RenderState.selectedHero: HeroKind | null` → `drawHero` draws the ring for the
  matching hero. Purely presentational.
- **Snapshot** — `HudSnapshot.selectedHero: SelectedHeroView | null` (built by `Game.selectedHeroView()`):
  hp/maxHp, shield, **live effective damage/attackSpeed/moveSpeed**, cooldowns (remaining/total), state,
  target name, buffs/debuffs. The **permanent** profile (level, stars, perks, Power rating) and equipment
  are read separately at the UI layer from `meta` (`heroDetail(save, kind)` + `meta.loadoutOf(kind)`) —
  they're locked at run start, so the panel memoizes them by kind.
- **UI** — `HeroSelectPanel.tsx`, rendered by `GameView` when `hud.selectedHero` is set. Non-modal
  overlay; the ✕ (or clicking away) deselects.

### Adding hero abilities on top (the intended next step)
An ability UI reads `getSelectedHero()` for the actor and issues an intent (e.g. `castSelectedAbility(x, y)`),
mirroring the existing `armAbility` / `triggerAbility` flow. The panel already surfaces the ability
cooldown gauge, so wiring a cast button is additive. New buff/debuff chips are one entry each in
`selectedHeroView()`.

---

## Determinism & golden-safety

- Selection + the observational fields are **inputs/among-outputs, not sim math** — `selectedHeroKind`
  defaults to null, `targetId`/`moveState` never influence movement, damage, or RNG. The **golden
  autoplay never selects a hero**, so every pinned outcome is byte-identical (verified: `golden.test.ts`
  unchanged; `heroSelect.test.ts` pins the behavior + the "no selection in autoplay" contract).
- The panel is a read-model over the snapshot; opening/closing it does not touch the run.

Selected-hero ability cooldown totals use the existing heroAbilityCooldownFor calculation; star-skill totals use the same progression multiplier as skill casts. HeroSelectPanel displays the live ability total to one decimal place and suppresses Ready/fill while downed. This is observational only: no cast timers, combat effects, saves or balance changed. Attack/pulse gauges use the observed cadence described below.

Observed attack/pulse cadence: Game keeps presentation-only WeakMaps keyed by hero, recording the unchanged timer immediately after each attack/pulse starts. Selected-hero gauges and attack-speed text read that interval, including siege/mega-raid transitions; before the first action they use the behavior baseline. These maps are never read by combat or serialized. Regression probes cover all12 heroes with haste and a Vitriol raid-to-siege transition.

Recovery display: Game.heroRecoverySeconds converts the internal recovery work by the same reviveSpeedMult used in updateHero. HUD/selected-hero snapshots, Combat Console and battlefield label use that simulation-second estimate. RenderState supplies an optional per-kind map only while a hero is down. Internal timers, revival behavior and saves are unchanged. Tests compare displayed time to actual revival at1x/2x.

Active ability cycle: presentation-only heroAbilityPeriods records each cast duration. HUD abilityCdMax and selected-hero ability total retain that duration while recharging, then show the resolved next-cast duration when ready. Overdrive purchases never rescale the combat timer; the gauge now preserves that existing rule without jumping backward.
