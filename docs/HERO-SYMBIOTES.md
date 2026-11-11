# HERO-SYMBIOTES.md — the champion wing of the Mulligan pillar

> **Status: live.** Core: `src/core/heroSymbiote.ts` · sim seams: `src/core/game.ts` · visuals:
> `src/render/heroSymbiotes.ts` · fold: `state/meta.ts heroProgress` · save: `heroSymbiotes` (v41).
> The grafted-organism trilogy is complete: towers wear **Mulligans** (docs/MULLIGANS.md), the
> Hive wears **Nucleus organs** (docs/NUCLEUS.md), and every **champion** hosts SYMBIOTES.

## §identity — biological, never equipment

Equipment is EXTERNAL gear: account-wide `CardEffect`s that ride RunModifiers (docs/EQUIPMENT.md).
A **symbiote is a permanently grafted living organism** that changes HOW its host fights. The kit
vocabulary (`types.HeroSymbioteKit`) is **behavior verbs only** — by construction it has no
damage/cooldown-style stat fields, so a symbiote can never be a stat-stick duplicate of gear
(**the no-duplication contract**; mastery = experience, shards = unlocking, symbiotes = late-game
bio-augmentation).

| verb | what the host does differently |
|---|---|
| `strikeStatuses` | strikes inject statuses (rides the per-hero on-hit list) |
| `strikeComponents` | on-hit AbilityComponents — splinters, pools, plague arcs |
| `killPlague` | kills burst a share of the victim's Corrosion/Infection outward |
| `killHaste` | kills surge move + attack cadence (Bloodthirst machinery) |
| `abilityEchoFrac` | the signature ability re-casts a weaker echo (~0.45s later) |
| `abilityRadiusMult` | per-hero ability footprint |
| `auraMult` | passive presence deepens — aura strength AND reach |
| `overhealShieldFrac` | overflow healing condenses into a decaying shield |
| `reviveSpeedMult` | a downed host reknits faster |
| `summonMult` | the host's summoned organisms harden |
| `survival` | adaptive AI — rewires the identity's survival profile |

Every seam in `game.ts` is presence-gated: a fresh save attaches **no kit** ⇒ the sim is
**byte-identical** (the golden invariant; `resolveHeroSymbiote` is the identity while nothing is
active, Power reads exactly `POWER_BASE`).

## §slots — three per hero, gated by identity trials

- **Slot I** is born open for every champion.
- **Slot II** opens through a per-hero mid-game IDENTITY TRIAL + a moderate Ichor price (35).
- **Slot III** is the endgame crown — a much harder trial + a steep price (180). Across the roster
  this is the deepest per-champion Ichor sink in the game.

Gates are DATA rows (`HERO_SYMBIOTE_GATES`, nucleus-gate pattern) over a per-hero snapshot:
lifetime kills **leading that champion** (`save.heroKills` — killing-blow credit), its mastery
level and ★stars, plus account axes (campaign, Genome Rank, Power, megas, Boss Rush, molts,
Bio-Dex). Every requirement always displays with live progress (the anticipation rule). The record
is **typed complete over `HeroKind`** — a future hero fails the compiler until it declares its two
trials (the future-hero contract, half one; visuals are half two).

## §organs — a species catalog, grafted per host

54 species: **nine per class, exactly three per class×category cell**
(offensive/utility/biological × the six CombatClasses — the coverage test), so one hero can run
a mono-class triple in every slot. Species are
host-agnostic: any hero may graft any species, each graft is **that hero's own organism**
(grown with Gene Essence, per-host level ladder on the shared Mulligan rarity caps), and within a
host a species occupies at most ONE seat (§exclusivity per host). The catalog **never grows with
the roster** — 30 heroes need zero new organs.

Each slot seats **three organs — one complete Mulligan triple**; a slot does NOTHING until all
three seats are grafted (no partial activation). A fully evolved hero carries **nine organs**.

## §adaptation — Complete Hero Adaptation (per slot)

Three organs of ONE class in an active slot ⇒ the **FULL** adaptation — a CAPABILITY, never a
number tweak (Kinetic shockwave blows · Caustic melting strikes · Viral pandemic kills · Neural
ability echo · Vital overheal carapace · Resonant chorus body). Exactly two ⇒ the MINOR verb.
Completed classes chronicle into the host's lifetime `adapted` ledger (re-seating never
confiscates credit).

## §resonance — the crown of a fully evolved hero

When ALL THREE slots are active, the nine organs' **category census** picks a resonance:
≥6 of one category ⇒ its pure apex (**Apex Predator** / **Overmind Symbiont** / **Living
Bastion**); a perfect 3/3/3 ⇒ **Trinity Organism**; anything else ⇒ the leading pair
(**Stormfront Organism** / **Red Harvest** / **Deep Symbiosis**). Every complete hero resonates —
the crown guarantee. Witnessed resonances chronicle into `resonated`; the first 9/9 sets `evolved`.

## §visuals — the graft made visible

`render/heroSymbiotes.ts` (the FOURTH consumer of towerEvolution's `PART_DRAWERS` vocabulary):
each active slot mutates the host another STAGE (per-hero authored rows — armor scutes, feeler
whips, egg-pods… chosen to stay distinct from the hero's star anatomy), every active organ's motif
shimmers as living in-combat FX, and a resonant hero wears the pulsing crown ring. Stage 0 draws
nothing — the fresh look is unchanged.

## §economy & recognition

- **Graft** `180×2^tier` Essence (per host) · **level** `32×(tier+1)×1.35^(lv−1)` up to the rarity
  cap — the same unified gene currency Mulligans/Nucleus spend; slot unlocks spend **Ichor**.
- **Power**: `accountSymbiotePower` multiplies the `mulligans` PowerParts bucket (the grafted-
  organism pillar bucket, precedent: `nucleusPower`); exactly ×1 while nothing is complete.
- **Genome Rank**: the `hero-symbiotes` arsenal source reads `symbioteRatio` =
  Σ(active slots + evolved)/(roster×4).
- **Kill credit**: the strike/ability paths stamp `Enemy.lastHitHero` on killing blows —
  `heroMasteryAccrual[].kills` and lifetime `heroKills` finally accrue (they also feed the gates).

## §save — v41

`heroSymbiotes: Partial<Record<HeroKind, HeroSymbioteState>>` — sparse per-host states
`{ unlocked, slots[3][3], grown, adapted?, resonated?, evolved? }`. `sanitizeHeroSymbiotes` drops
unknown kinds/ids, clamps levels to rarity caps, enforces per-host seat exclusivity, clamps
`unlocked` — a garbage blob collapses to `{}`. Rides the `heroes` save-envelope module; conflict
merges keep the primary side (nucleus parity).

## §validation

`core/heroSymbiote.test.ts` (catalog coverage, golden identity, kit scaling/merging, adaptations,
the resonance census, per-hero gates, sanitizer, Power monotonicity, the guarded meta pipeline) ·
`render/heroSymbiotes.test.ts` (per-hero stage rows — the visual future-hero contract) · the live
combat probe asserts every verb empirically (strike toxins, splinters, carapace, kill credit,
surge, plague, echo, adaptive retreat, cocoon, brood nurture) · goldens stay byte-identical.

## Future hooks

- New ORGAN = one registry row (validator enforces class/category/rarity/motif/kit/power).
- New HERO = two gate rows + one visual stage row (compiler + tests refuse anything less).
- New VERB = one optional kit field + one presence-gated seam read.
- A fourth slot / new resonance rows are data changes (`SYMBIOTE_SLOTS`, the census table).

Portrait preview lifecycle: SymbioteOverlay suspends its canvas RAF while off-screen/document-hidden, follows live OS and player motion preferences, and paints a complete still when reduced. Visible animation resumes from accumulated visible time rather than jumping through hidden time. Observers, preference subscriptions and RAF are released on unmount. Battlefield rendering is unchanged.

Recovery display: Game.heroRecoverySeconds converts the internal recovery work by the same reviveSpeedMult used in updateHero. HUD/selected-hero snapshots, Combat Console and battlefield label use that simulation-second estimate. RenderState supplies an optional per-kind map only while a hero is down. Internal timers, revival behavior and saves are unchanged. Tests compare displayed time to actual revival at1x/2x.
