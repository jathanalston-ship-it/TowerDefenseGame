# HERO-EVOLUTION.md — the in-run Biomass sink

Permanent-**for-the-run** hero upgrades bought with **Biomass** during a run. One purchase upgrades
**every active hero at once**, and any hero fielded later **inherits** all of them. Reset when the run
ends — nothing is saved. A second strategic layer (which axes to deepen with your Biomass) that never
interrupts gameplay.

## Player-facing
- **Access:** a **Hero Evolution** button in the Run Build panel (beside Gene Cards) opens a
  **non-modal** menu — the sim keeps running while it's open.
- **10 axes × 10 levels:** Vitality (HP), Lethality (damage), Frenzy (attack + pulse speed),
  Swiftness (move speed), Overdrive (ability cooldown ↓), Amplitude (ability radius), Precision
  (crit chance), Savagery (crit damage), Regeneration (healing received), Carapace (armor).
- **Cost = LINEAR, no spikes:** `baseCost × (1 + 0.6·levelInCategory) × (1 + 0.05·totalOwned)`.
  Every purchase anywhere nudges ALL future costs up → specialize a few axes, but nothing is locked
  out. Buying plays the *splice* cue + a floating notification; the stat, hero HUD, and Power Score
  update instantly.

## Architecture
- **`core/heroEvolution.ts`** (pure, data-driven): `HERO_EVO_CATEGORIES` (one row per axis),
  `HeroEvoMods` (the concrete sim bundle), `deriveHeroEvoMods(levels)`, `heroEvoCost(...)`,
  `heroEvoEffects(levels): CardEffect[]`, `heroEvoEffectLabel(...)`, `HERO_EVO` tunables,
  `HERO_CRIT_BASE`. **A new axis = one array row + (if a brand-new stat) one RunModifiers field.**
- **Sim (`core/game.ts`):** run-only state `heroEvoLevels` + derived `evo: HeroEvoMods` (neutral by
  default). Every hero stat is centralized in a helper that folds gear × Evolution on the SAME field:
  `heroMaxHpFor` · `heroDamageMult` · `heroSpeed` · `heroHaste` (attack + pulse cadence) ·
  `heroAbilityCooldownFor` · `heroAbilityRadiusFor` · `healHeroBy` (healing received) ·
  `rollHeroCrit` · armor in `heroContactDamage`. `buyHeroEvolution(id)` spends Biomass, bumps the
  level, re-derives `evo`, and grows/heals live maxHp on a Vitality buy. `fieldHero(kind)` is the
  forward hero-unlock seam — a mid-run hero inherits `evo` because `makeHero` reads it live.
- **Power (`core/power.ts`):** the 5 new fields (`heroAttackSpeedMult`, `heroCritChance`,
  `heroCritDamageBonus`, `heroHealingMult`, `heroArmor`) are real `RunModifiers` fields, scored by
  `FIELD_WEIGHT`/`ADD_POWER` and listed in `POWER_RELEVANT_FIELDS`. `heroEvoEffects()` folds through
  the shared `effectsPower` bridge into the `temporary` Power bucket, so **every** purchase raises the
  global Power Score (menu shows `meta.powerWith(game.heroEvoEffects())`).
- **UI:** `HeroEvolutionPanel.tsx` renders generically from `HERO_EVO_CATEGORIES` (a new axis needs no
  UI change); `HudSnapshot.heroEvo = { levels, totalOwned }` feeds it; live Biomass/affordability from
  the snapshot.

## Invariants & extension
- **Golden-safe:** neutral `evo` ⇒ every helper is identity, and the crit roll is **gated on chance
  > 0** so a no-Precision run spends **no RNG** — the pinned autoplay stays byte-identical.
- **Run-only:** state lives on `Game`, constructed empty, never serialized → run end resets it;
  permanent progression is untouched.
- **Future stats/heroes/abilities:** add a field + a category row; `fieldHero` already inherits.
- **Known limits:** a mid-run `fieldHero` gets no per-hero *gear* fold (gear is roster-time);
  Precision/Savagery apply to auto-attacks + signature abilities (role pulses take Lethality, not
  crit). Menu Power shows account × Evolution (gene-card temporary power isn't separately exposed).
