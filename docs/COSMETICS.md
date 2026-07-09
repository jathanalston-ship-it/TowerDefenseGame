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
