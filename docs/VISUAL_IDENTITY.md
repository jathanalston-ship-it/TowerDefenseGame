# VISUAL_IDENTITY.md — what makes it ASSIMILATION

> The artistic vision. One game, one studio, one identity: if a screenshot has no title on it,
> it should still be unmistakably ASSIMILATION. This document is the **why**; the concrete numbers
> live in `docs/UI_STYLE_GUIDE.md` (the **what**) and the application rules in
> `docs/DESIGN_LANGUAGE.md` (the **how**). Battlefield/art-direction depth (enemies, arenas,
> luminance zones, render specs) stays in `docs/STYLE-GUIDE.md` — the art bible this identity
> layer sits on. All are permanent references — every future screen, system, sound, and
> animation is built inside them.

## 1. The seven pillars

Every surface communicates all of these at once, in different doses:

1. **Living biotechnology** — the UI is grown, not manufactured. Panels are membranes and
   chitin, not brushed aluminum. Things breathe (slow 5–8s ambient pulses), never blink.
2. **Genetic experimentation** — progression reads as *mutation*: stars are transformations
   (◈), upgrades are gene splices, branches are specializations of an organism.
3. **Alien biomass** — the caustic/viral hues glow like bioluminescence out of a dark body;
   color is *emitted* by living things, not painted on chrome.
4. **Cybernetic evolution** — hairline light edges (`--bevel`, `--frame-edge`) and tabular
   numerals give the organics an engineered exoskeleton. Organic shapes, machined data.
5. **Dark scientific research** — the world sits in the void (`--void #070a0f`); text is a
   readout (`--text #d7e0ec` on near-black); eyebrow labels are specimen tags
   (uppercase, tracked wide, 10–11px).
6. **Controlled chaos** — combat is loud (particles, shreds, gore families); *menus are calm*.
   Energy leaks into the chrome only as slow fog, drifting veins, and soft halos.
7. **Organic intelligence** — the game reacts: numbers roll, bars ease, the lab grows with
   your progression (Home Base tiers), Power announces its sources. Nothing is inert.

**Never:** generic sci-fi (blue holograms, hexagons for their own sake), fantasy (parchment,
runes, gold filigree), or sterile laboratory (white, clinical, flat). If a treatment would look
at home in a space-marine or elf game, it does not ship.

## 2. Color identity

The palette is small and semantic — color always *means* something. Values are pinned in
`:root` (src/index.css) and tabled in UI_STYLE_GUIDE §3.

- **The void** (`--void`, `--bg-arena`, panel ramp `--panel → --panel-2 → --panel-3`): the
  dark body everything glows out of. Depth = darker, never lighter.
- **Class hues** — the five biological weapon doctrines: kinetic `--kinetic` (piercing cyan),
  caustic `--caustic` (acid green), viral `--viral` (plague magenta), neural `--neural`
  (synapse indigo), vital `--vital` (blood-warm coral). A tower, its projectiles, its branch
  sounds, its lab card, and its codex all wear the same hue.
- **State colors**: `--gold` (premium/Power/legendary moments), `--success` (gains),
  `--warn` (caution), `--danger` (integrity, loss).
- **Rarity ladder** `--r-common → --r-mythic`: the universal value scale for items, cards,
  and reveals. Legendary is gold; **mythic is its own blood-pink** (`--r-mythic`) — reserved,
  never reused for danger.
- **`--cache`** (teal): run-cache rewards — deliberately NOT gold so a routine reward never
  cosplay as a Legendary.

Rule of emission: saturated color appears as **glow from within** (halos, inset rings,
gradient cores) on dark bodies — not as flat fills or bright backgrounds.

## 3. Surface & texture language

- **Organic**: radial fog (`.lab-fog-*`), drifting vein networks (`.lab-veins`), spore motes,
  irregular bezier paths. Used for *atmosphere layers* behind content.
- **Cybernetic**: 1px hairlines (`--line`, `--line-strong`), glass panels
  (translucent + `backdrop-filter` blur + `--bevel` highlight), tracked uppercase eyebrows,
  tabular numbers. Used for *content chrome*.
- The mix is roughly **organic behind, cybernetic in front** — a machined membrane over a
  living body. Corner radii are soft but engineered (4/8/12/16px scale; capsules `999px` for
  pills) — never fully round blobs, never sharp 0px slabs.

## 4. Iconography

- **Glyph set, not emoji**: ◈ (evolution star — never plain ★), ★ (favorite marker only),
  ✦ (highlight/sparkle accent), procedural canvas portraits (towers/heroes), authored
  `CurrencyIcon` set (per-currency shape+color), ▸/▾ (disclosure), 🧬/🔒/📌 only as
  established gate/pin markers. New icons come from the same 1.5px-stroke, glow-capable
  family; no mixed icon packs, no photographic or flat-color emoji as UI chrome.
- Rarity, class, and currency each have exactly one canonical color+glyph pairing —
  `rarityColorOf` (core/equipment.ts) and `CURRENCIES` are the single sources.

## 5. Motion identity

Motion is biology: things **grow, breathe, and settle** — they do not bounce, spin, or strobe.

- Interactions acknowledge in 90–150ms (`--dur-1/2`); structure moves in 220–300ms
  (`--dur-3/4`); *ambience* breathes in 5–8s loops at low amplitude.
- `--ease-out` is the default (decelerate into place, like settling tissue); `--ease-spring`
  is reserved for reward moments only.
- Celebrations escalate by permanence (see DESIGN_LANGUAGE §4): toast < reveal < ceremony.
- Everything honors `prefers-reduced-motion` — ambience stops, information remains.

## 6. Particle philosophy

- **Combat particles are simulation entities** (deterministic, golden-pinned) — muzzle sprays,
  branch impacts, gore families escalate with tier so *power is visible*.
- **UI particles are DOM/canvas presentation** (never sim): ceremony bursts, reveal flares,
  toast glints. Small counts, gravity-light drift, class/rarity hue, ≤ 1.2s life.
- Particles always *mean* something (a kill, a tier, a rarity); never ambient confetti.

## 7. Audio identity

One synthesized organism — every sound is built from the same `tone()` palette
(src/audio/sound.ts) and the composed music engine (src/audio/music.ts):

- **UI cues**: short (≤ 250ms), soft-attack sine/triangle families. Hover is a whisper,
  select a tap, confirm a two-note rise.
- **Weapon families**: each branch has a per-tier synth voice (`br_*` cues) in its class hue's
  "register" — deeper and richer as tiers rise.
- **Reward ladder**: chest → reveal ramp → jackpot; shard cues split tower/hero; `power` is a
  bright triad stinger; `achieve`/`rankup` are short fanfares. Louder ≠ rarer — *harmonically
  richer* = rarer.
- **Music**: six composed categories (menu/combat/boss/victory/defeat/events) with intros,
  loops, layers, and crossfades — the single soundtrack authority. The legacy ambient drone
  is retired; per-biome flavor returns through the music engine's intensity/layer seam.
- Nothing plays raw sawtooth alarm-style; even danger (breach) is a bodily thud, not a klaxon.

## 8. The screenshot test (definition of done)

Any new screen must pass all five:

1. **Palette**: only tokens — the five class hues, state colors, rarity ladder, void neutrals.
2. **Chrome**: glass-membrane panels with hairline edges on the void; no flat gray slabs.
3. **Type**: readout hierarchy — tracked uppercase eyebrow, strong title, tabular numbers.
4. **Life**: at least one slow ambient element and one reactive element; zero static walls.
5. **Meaning**: every glow/color/particle traceable to a class, state, rarity, or currency.

If it could be screenshotted into another game's UI without looking alien there, it fails.
