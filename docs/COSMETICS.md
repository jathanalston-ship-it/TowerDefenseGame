# Phenotypes — the cosmetics system

A **phenotype** is a purely visual expression of a tower or hero: a palette re-expression,
an idle **aura** flourish, themed projectile/beam light, and a **firing-sound variant**.
Strictly presentation — no def stat is read or written, the sim never sees an equip, and a
fresh save renders and sounds exactly like the pre-cosmetics build (golden-safe by
construction).

## Content model (`src/core/cosmetics.ts`)

**Generated, not hand-authored**: six theme FAMILIES × every tower and hero in the
registries. New towers/heroes grow their full phenotype line automatically (the generator
loops `TOWER_ORDER`/`HERO_ORDER`) — the scale story for 100 towers is 600 rows for free.
`cosmetics.test.ts` pins full coverage, so a parallel-session tower landing without its
phenotypes is a red test, not a gap.

| Family | Rarity | Source | Feel |
|---|---|---|---|
| Ember / Frost / Verdant | rare | **cultivate** | the common pool |
| Void | epic | **cultivate** | the chase roll |
| Gilded | legendary | **contract** | Champion Contract exclusive |
| Abyssal | legendary | **nemesis** | revenge-kill exclusive |

## Acquisition

- **Cultivate** (Phenotype Lab): `CULTIVATE_COST` Gene Essence → ONE random unowned
  cultivate-pool phenotype (`meta.cultivateCosmetic()`; meta-side roll, never the sim rng).
- **Exclusives**: `meta.grantCosmetic(id)` is the single grant door — Champion Contracts
  pay Gilded ids, Nemesis revenge kills pay Abyssal ids.

## Save (v26)

`save.cosmetics = { owned: string[], towers: {kind→id}, heroes: {kind→id} }`. The
sanitizer keeps only real registry ids; an equip must be owned AND target its exact kind.
Pre-v26 saves fill the bare default (identity dress).

## Rendering + audio

- `GameView` snapshots `equippedCosmeticThemes(save)` at run start and threads
  `towerSkins`/`heroSkins` into `drawGame`. `drawTower` swaps its def color for
  `theme.primary` across the body/organs/evolution layers, adds the family aura
  (`drawCosmeticAura`), and the muzzle glow uses `theme.glow`. Base projectiles re-tint via
  `p.sourceKind`; the coil beam and sower mines resolve their themed color; heroes re-tint +
  aura. Branch-skinned shots keep their authored identity (a branch IS an identity).
- **Sound**: the sim tags base firing cues `tfire_X:kind` (presentation-only). GameView
  re-keys themed kinds to `tfire_X~variant`; `sound.ts` maps variants to pitch factors on
  the same synth (`deep 0.72 · crisp 1.32 · wet 0.86 · aetheric 1.16`). Untranslated tags
  (e.g. the Replay Theater) strip to the base cue.
- The Replay Theater renders default dress deliberately — the outcome is identical, the
  wardrobe is the player's own.

## Collection

The **Phenotypes codex** (`cosmetics` category, `core/collection.ts`): each owned
phenotype = one Expressed entry; completion pays a hive-wide **Biomass ×1.06 at 100%** +
0.03 Power weight — exactly like every other collection set, 0 on a fresh save.

## UI

Hub → Collection → **Phenotypes** (`ui/PhenotypeLab.tsx`): per-kind rows with a LIVE
themed render of the actual turret body, Default + owned equip chips, locked chips
labelled by source, the Cultivate roll, and the codex bonus strip.

---

## §wardrobe — the account cosmetics ecosystem (2026-07)

The Wardrobe (`src/core/wardrobe.ts`) generalizes cosmetics beyond unit skins into **34
global cosmetic KINDS** across four groups, each with ONE equipped slot:

- **Arena & Combat FX** — nucleus skins, battlefield themes, projectile trails, tower
  particle/placement FX, hero ability/selection FX, enemy/boss/mega reskins, wave
  transitions, stage intros.
- **Audio & Music** — menu/combat music packs (root/tempo/brightness re-voicings of the
  authored tracks), tower/enemy audio packs, hero voice packs (framework), notification
  sounds — all through the existing `VARIANT_PITCH` cue vocabulary.
- **Interface & Ceremony** — UI/HUD themes, card frames, container/roulette ceremony
  themes, cursor themes, victory/defeat screens.
- **Commander Identity** — titles, name colors, nameplates, profile backgrounds, banners,
  emblems, prestige/collection borders (worn by the Player Profile card).

**Foundational contract:** an item is ONE `WardrobeItemDef` row — kind + rarity + a typed
unlock `source` + a flat validated `payload` (palette hexes, FX/trail preset ids, cue
variants, music transforms, CSS handles, identity text). Consumers never know item ids:
the **dressing layer** (`src/ui/wardrobeDressing.ts`) resolves equipped payloads into root
data-attributes (index.css variants), audio cue families, music transforms and the
renderer kit (`src/render/wardrobeFx.ts` — precomputed enemy/boss/mega palettes, nucleus/
battlefield/trail/FX params; zero per-frame allocation). A fresh save is the exact classic
dress (golden-safe).

**Sources are a CLOSED vocabulary** — `starter`, `campaign stage`, `infinite depth`,
`daily clears`, `rush boss kills`, `roulette spores`, `achievement`, `collection rank`,
`shop` (the Ichor **Boutique** — never rotates out), `battlepass` (season/level/track),
`milestone`, `event` (LiveOps drops). Auto lanes grant via `meta.pollWardrobeUnlocks()`
(achievement-style poll at run end + Wardrobe open); every grant queues the persisted
**unlock ceremony** (`WardrobeReveal` — rarity burst, kind icon, story, source).

**Collections:** Phenotypes split into `towerSkins` + `heroSkins` codices; the Wardrobe
adds `wardrobeArena/Audio/Interface/Identity`. Cosmetic codices stay **cosmetic-first**:
tiny Power identity weights, no run effects — their payout is `WARDROBE_MILESTONES`
(claimable Ichor / containers / cores / shards / exclusive cosmetics / titles via
`meta.claimWardrobeMilestone`).

**UI:** the Wardrobe screen (nav `phenotypes`, relabeled) — Phenotype lab tab + four group
tabs + Boutique + Milestones; search, owned/locked/new/favorite filters, audition ▶ for
audio kinds, Randomize, NEW badges (persisted `seen`), collection % chips.

**Extension guide (a future cosmetic is a CONTENT task):** add one `ROWS` entry with a
source + payload → the registry validates the payload against its kind's `NEEDS`, the
codex/milestones/boutique/battle-pass tables pick it up, the dressing layer needs nothing
new unless you invent a NEW preset id (then: one CSS class or one renderer branch).

## §claiming — two-state ownership & the Specimen Vault (v53, 2026-07)

**The two states.** A cosmetic ARRIVES as an **UNCLAIMED instance** in the Specimen Vault
(`save.wardrobe.inventory` — `{uid, item, at, src}`, uid `ci_`-prefixed): tradable,
auction-eligible, **no bonus, not equippable, not in collections**. **CLAIMING**
(`meta.claimCosmetic(uid)`, guard `cosmetic.claim`) is the irreversible account-bind: the
instance is consumed, the id joins `save.wardrobe.owned` — the CLAIMED set that every
pre-v53 consumer already reads (equip gates, the four wardrobe codices, achievements,
dressing) — the provenance stamp binds (`cos:wd_*`, origin carried from the instance,
`bound: true`, no unbind exists), and the piece's permanent bonus activates. Claiming a
duplicate of a claimed id is REFUSED — dupes stay in the Vault as pure trade stock.

**Delivery is ONE chokepoint** (`receiveCosmetic` in state/meta): applyRewardList's
`cosmetic` case, the auto-unlock poll, the Boutique, milestone exclusives, quest finales,
the login-drop jackpot and direct grants all land instances. The old owned-substitution is
RETIRED for cosmetics: repeatable reward tracks now mint **tradable duplicates** (the
Auction House's supply trickle); once-ever gates (quest `once`, event lifetime rows, the
`granted` ledger for auto/boutique/direct lanes) keep non-repeatable lanes single-copy.
`wardrobe.granted` records every id ever delivered — the once-per-source gate that
replaced owned-gating. **Migration (v52→v53):** existing `owned` stays claimed unchanged
— nothing is taken away; `granted` seeds from it; `inventory` starts empty.

**Provenance / Auction House readiness** (docs/TRADING-PREP.md): instances stamp
`cos:<uid>` (source, time, arena season, transfers, owner history) and the reconcile pass
prunes instance stamps whose uid is gone; claimed stamps (`cos:wd_*`) are permanent and
bound. Tradable status = an unclaimed instance; auction eligibility = unclaimed (bound
never trades again); unique identity = the instance uid (`globalItemId` namespaces it at
the trade boundary); rarity/family metadata ride the registry.

**UI:** the **Specimen Vault** screen (nav `specimens`, Market hub — reveal-on-need: the
`cosmeticInventory` condition opens it the moment the first specimen lands, stage-8
backstop). Search, ownership chips (Awaiting/Bound/All), group + sort (recent/rarity/
name/duplicates) filters, dupe counts, tradable/bound chips, per-item bonus line, favorite
stars on bound pieces, bounded 240-card render window (thousands-scale: narrow, don't
virtualize). Claiming plays the finite **assimilation ceremony** (rarity-tinted card,
bonus reveal, "Woven in"). Arrival reveals (`WardrobeReveal`) now read "SPECIMEN ACQUIRED
— claim it in the Vault". Notification source `cosmetic.unclaimed` (channel `specimens`)
counts distinct items awaiting the decision.

## §bonuses — permanent claim bonuses (v53)

Every claimed **non-starter** cosmetic feeds ONE bonus lane; starters are bonus-less BY
LAW (`wardrobeProblems`) — they are pre-owned on a fresh save, and any weight would move a
fresh account off POWER_BASE and break golden runs. Lanes speak the two PROVEN account
vocabularies only, so consumption needed zero new sites:

| Lane | Vocabulary | Kinds (default mapping) |
|---|---|---|
| towerDamage | run `towerDamageMult` | towerFx, projectileTrail, towerAudio, cardFrame |
| heroDamage | run `heroDamageMult` | heroFx, heroSelectFx, heroVoice, banner |
| biomass | run `biomassMult` | placementFx, battlefieldTheme, uiTheme, profileBg |
| fireRate | run `towerFireRateMult` | waveTheme, stageIntro, cursorTheme, hudTheme |
| masteryXp | econ `towerXpMult`+`heroXpMult` | musicPack, combatMusic, notifSound, emblem, title |
| bossLoot | econ `bossLootMult` | enemyTheme, bossTheme, megaTheme, enemyAudio, defeatScreen |
| runReward | econ `campaignRewardMult` | nucleusSkin, lootTheme, rouletteTheme, victoryScreen, nameColor, nameplate, prestigeBorder, collectionBorder |

Magnitude by rarity (`WARDROBE_BONUS_BY_RARITY`): common +0.2%, rare +0.35%, epic +0.55%,
legendary +0.8%. Per-item overrides via `BONUS_OVERRIDES` (bounded ≤ legendary). **Lanes
SATURATE** — `effective = CAP·(1−e^(−raw/CAP))`, `WARDROBE_LANE_CAP = 0.06`: the first
claim in a lane pays ~full value, a complete collection approaches +6%/lane (~4.4% at
launch content), and future catalog growth can never compound past the cap — worthwhile
forever, mandatory never. Consumption: `wardrobeEffectsOf` folds run lanes beside the
Battle Pass permanents (App boot effects + the Power `meta` bucket via `wardrobeMult`);
`accountEconomyBonuses` composes the econ lanes. Fresh save ⇒ all lanes 0 ⇒ golden-safe,
POWER_BASE-safe (pinned by wardrobe.test + wardrobeMeta.test).

## §families — collection families (v53)

`cosmeticFamily(def)` derives the browse/AH taxonomy from the acquisition lane (override
per item via `FAMILY_OVERRIDES`): Origin Growth (starter), Campaign Relics, Abyssal
Salvage (infinite), Devotion (daily/login), Trophies of the Rush (rush/roulette),
Commendations (achievements), Archivist Court (collection/milestone), Boutique Line,
Season Vault (battlepass), Event Exclusives, Contract Seals (quests). A future cosmetic
inherits its family from its source with zero authoring.
