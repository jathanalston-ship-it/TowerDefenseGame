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
  level, re-derives `evo`, and grows/heals live maxHp on a Vitality buy. `heroMaxHpFor` also adds the
  run's flat card max-HP (`heroHp` ops — Battle Stims, Thick Hide…, tracked per kind in
  `heroFlatMaxHp`), so a Vitality recompute never drops it (fixed: 359/248 HP after an auto-buy).
  `fieldHero(kind)` is the
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

## §visuals — heroes MUTATE with investment (like towers)

`src/render/heroEvolution.ts` mirrors `towerEvolution.ts`/`starEvolution.ts`: a THIRD consumer of
the shared organ vocabulary (`PART_DRAWERS`), so a hero is one data row and needs no new draw code.
Two independent signals drive the look, both no-ops at zero (★0/evo-0 heroes render byte-identically
to before — golden/fresh-account safe; the sim is untouched, this is pure presentation):

- **Permanent stars** (`save.heroStars`, ★0..★5) set the baseline **anatomy tier**: the body swells
  (`heroEvolutionGrowth`) and identity organs grow in at ★1/2/3/4/5 — Ravager = predatory
  blades/fangs→crown, Shepherd = a living heart + vital sacs + halo-crown, Overseer = psionic
  glyphs→arcs→crown→nova. Per-hero organ sets keep each silhouette distinct (never homogenized).
- **In-run Hero Evolution levels** (`heroEvoLevels` total, the Hero Console) add **battle-dress**: a
  brightening aura ring + orbiting weapon-organs whose size/intensity scale with the run's spend
  (saturating so a maxed console isn't a supernova).

Threaded to the renderer the same way tower stars are: `GameView` passes `heroStarTiers` (per-kind,
from the save) and a live `heroEvo` (from `hud.heroEvo.totalOwned`) into `drawGame`. Data contract
pinned by `src/render/heroEvolution.test.ts`.


---

## §console — the Hero Combat Console (2026-07 overhaul, implemented)

The in-run menu became a command surface (src/ui/HeroEvolutionPanel.tsx — the component name
stays for continuity; the UI is the CONSOLE). The battlefield AUTO-PAUSES while the console
is open (GameView holds the sim — a "❚❚ SIM HELD" chip says so — and restores the player's
own pause state on close): upgrading is a decision moment, not a dexterity test. E or the
HUD hero chip opens; E / ✕ / Escape closes.

**Audit that drove it** (pre-overhaul problems): no hero identity (you strengthened champions
you couldn't see), label-only comparisons (no Power/DPS/survivability deltas), invisible
economy (no invested total), single-click buys, a flat 7-card grid with no hierarchy, no
ability context, and a bare open button.

**Layout** — three regions over the evo-menu shell (responsive: 3 → 2 → 1 columns at
900/640px; bounded to the safe viewport):
- **VITALS**: the selected champion's live numbers — HP bar (live entity), damage / atk-per-s
  / move / crit / armor / cooldown reduction (base × live evolution mods), kills + damage
  this run (hero mastery accrual), Biomass invested + average per upgrade (`game.heroEvoSpent`
  ledger).
- **SHOWCASE**: the living HeroPortrait in a class-hue chamber (floating "+5% Swiftness ·
  Lv N" numbers rise on buys), the ability card (name, READY/cooldown, damage/radius/heal/
  fracture folded through live mods), and the active-effects chips: owned evolution axes,
  hero-subject gene cards drafted this run, equipped gear count.
- **UPGRADES**: all ten axes as compact expandable rows (icon · name · level pips · current
  effect · cost). Expanding shows current → next, the exact Power gain, and ≈ hero-DPS /
  ≈ survivability estimates; cooldown/radius/damage/healing axes explain their ability impact.

**Purchases** (sim held, so browsing is safe): click · HOLD to repeat (usePressRepeat ramp; a failed buy halts the hold —
the overspend guard) · shift-click buys 5. Every buy: splice cue + row flash + floating gain
+ the Power toast, and **preview === outcome** — the row's Power delta composes the exact
marginal effect over the run's FULL effect set (an isolated composition under-reported by
missing multiplicative interaction; fixed and smoke-verified +13 === +13).

**Roster**: tabs switch champions instantly (1–3 fielded; upgrades are run-global — every
champion benefits, and the tabs bar says so). Downed heroes show dimmed with respawn.

**Summary bar** (closed state): the HUD hero cell is the console chip — portrait-colored
vitals + ▲ evolution-level count + ability cooldown + a breathing ◈ when any axis is
affordable + banked Biomass in its tooltip. Click/tap or **E** opens; ✕ or E closes.

**Future hooks**: the axes array is the extension point (a new axis = one entry, zero UI
work); hero skills/trees/mutations/ascension slot in as new row groups under the upgrades
region; cosmetics ride the showcase chamber; controller navigation maps to the tab/row
structure (documented seam).
