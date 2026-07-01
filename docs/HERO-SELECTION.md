# HERO-SELECTION.md — click a hero, read it, act on it

Heroes are now interactive during a run. Clicking an active hero **selects** it: a bright selection
ring marks it on the field and a non-modal panel reads out its live state. **Selection never pauses
gameplay** — the sim keeps ticking while the panel is open. This is also the seam future hero
abilities target through.

---

## What a click shows

Tapping a living hero opens the **Hero Selection Panel** (bottom-left of the board), showing:

- **Selection ring + highlight** — a pulsing warm-gold ring drawn under the hero (renderer).
- **Health** — HP / max, with a shield overlay when the hero has an absorb pool.
- **Cooldowns** — a gauge per relevant timer: the signature Ability (always), Attack (attackers),
  role Pulse (support/control).
- **Movement state** — Holding / Moving / Attacking / Retreating / Downed.
- **Current target** — the enemy the hero is engaging (by name), or —.
- **Active equipment** — the hero's equipped Weapon / Armor / Relic (from the run's locked loadout).
- **Buffs / debuffs** — chips derived from live state (Shielded, Bloodthirst, Killchain ×N). The
  debuff section is wired for when hero statuses land.

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
  hp/maxHp, shield, cooldowns (remaining/total), state, target name, buffs/debuffs. Equipment is read
  separately at the UI layer from `meta.loadoutOf(kind)` (gear is locked at run start).
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
