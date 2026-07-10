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
