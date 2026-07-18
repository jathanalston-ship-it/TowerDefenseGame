# ICON-LANGUAGE.md — the universal visual language

> **The philosophy: text is confirmation; visuals are communication.** If a player must read
> first to understand what to do next, the surface is wrong — fix the surface. This document
> is the permanent standard for how every concept in ASSIMILATE gets a face, and how future
> systems inherit one automatically.
>
> Library: `src/ui/iconLanguage.tsx`. Enforcement: `src/dev/iconLanguage.test.ts` — a new
> currency, reward type, status effect, or screen **without a visual identity fails CI**.

---

## 1. The axes — where each identity lives

One concept, one source of truth. The library FEDERATES these axes; it never duplicates them:

| Axis | Source of truth | Identity carried |
|---|---|---|
| **Actions / states** | `iconLanguage.ACTIONS` (THE new axis) | glyph + color token + verb label |
| **Effect categories** | `core/effectLanguage.EFFECT_CATEGORIES` | glyph + color + label (damage ▲, healing ✚, control ◇, …) |
| **Currencies** | `core/currencies.CURRENCIES` (+ `<CurrencyIcon>`) | unique SVG silhouette + color + glow + pickup anim |
| **Reward types** | `state/rewardToast.REWARD_TYPES` `.art` | currency ref, glyph+color, or bespoke art (container/gene) |
| **Status effects** | `core/status.statusRegistry` (color/fx) + `iconLanguage.STATUS_GLYPHS` (player glyph) | glyph + sim color + fx contract |
| **Screens / features** | `ui/navModel` mono + `state/unlocks.FEATURES` glyph | glyph per destination |
| **Rarity** | `--r-*` tokens (`--r-common` … `--r-mythic`) + per-system maps | color ladder, never color-only (labels/pips accompany) |
| **Display stats** | `iconLanguage.STATS` | DPS/Range/Cadence/Power/HP chips (aliases effect glyphs where the concept is identical) |

## 2. The ACTION language (verbs + states)

Every button and badge conjugates from `ACTIONS` — same verb, same face, everywhere:

| Verb | Glyph | Color | Verb | Glyph | Color |
|---|---|---|---|---|---|
| Claim | ✹ | gold | Recommended | ⚡ | gold |
| Collect | ⤓ | gold | Locked | 🔒 | muted |
| Open | ◉ | cache | New | ✧ | caustic |
| Upgrade | ⇧ | viral | Completed | ✓ | vital |
| Equip | ⛨ | vital | Unavailable | ⊘ | muted |
| Merge | ⧓ | caustic | Ready | ◈ | caustic |
| Replace | ⇄ | caustic | Browse | ⌕ | muted |
| Spend | ◆ | gold | Unlock | 🔓 | gold |
| Play/Deploy | ▶ | vital | Accept / Cancel | ✔ / ✕ | vital / muted |

These CODIFY precedents the UI already spoke (⚡ Best-Value, ◈ Ready Chain, 🔒 teasers,
⛨ equipment, ◆ Ichor) — the language was extracted from the game, not imposed on it.

**Buttons**: add `act-<verb>` beside the button's own class (CSS `::before` injects the glyph,
decorative for screen readers) — or render `<Ico a="claim" />` in JSX. The `.act-*` CSS block
in `index.css` MIRRORS the ACTIONS table; change them together. A button whose text already
contains the concept's glyph (e.g. the Auction "Buy now — ◆ 200") must NOT add the class —
never double a glyph.

## 3. Rules

1. **One face per concept, one concept per face** — glyphs are unique within an axis
   (test-enforced). Cross-axis reuse is allowed ONLY for the same concept family
   (⛨ equip↔equipment, ✚ healing↔regen, ⇣/⇡ slow/haste as a direction pair).
2. **Color is never the only channel** — every identity is glyph + color + label; the glyph
   and label carry it for colorblind players (the effect-category palette was designed this
   way from day one). Never strip the text label from a primary CTA.
3. **Text is confirmation** — the icon leads, the label confirms. Icon-only elements must
   carry `title`/`aria-label` (the `<Ico>` primitive handles both modes).
4. **Tokens over hexes** for action colors (test-enforced) — themes and hue shifts inherit.
5. **Recognizable at every scale** — glyphs are single grapheme marks that hold up at 11px
   on a 390px-wide phone (mobilecheck walks every screen at that floor).

## 4. How a future system inherits (the contract)

Adding content? You get an identity by construction, or CI stops you:

- **New currency** → a `CURRENCIES` row demands color/glow/silhouette (`currencyProblems`).
- **New reward type** → a `REWARD_TYPES` row demands `.art`.
- **New status effect** → registering it without a `STATUS_GLYPHS` entry fails
  `iconLanguage.test.ts`.
- **New screen** → `navModel`/`FEATURES` rows demand glyphs (same test).
- **New action verb** → add an `ACTIONS` row + the mirrored `.act-*` CSS rule; the uniqueness
  test guards collisions.
- **New effect vocabulary** → `FIELD_VOCAB` maps it to an existing category; the category
  brings the glyph+color for free.

## 5. Where the language is spoken today (the density map)

- **CTAs**: quest/directive/pass/event claims (✹), harvest collect (⤓), vault opens (◉ ×5
  buttons), tower Mutate + gene Upgrade (⇧), hero-gear Equip (⛨), deploy (▶ via PlayIcon),
  Best-Value quick-buy (⚡ + gold pill).
- **Info surfaces**: draft-card keywords carry their category glyph inline (`FxLine`); the
  exact-values expansion always did; Tower Lab stat chips carry stat glyphs; hub landing
  attention rows lead with the target screen's glyph; recommendation kind chips lead with
  the verb glyph.
- **Rewards**: every placard renders `REWARD_TYPES` art with tiered presentation (0–3 +
  rarity override); currencies fly as their silhouettes (ceremony primitives).
- **States**: 🔒 locked/teasers, ✓ claimed rows, ◈ ready chain, NEW badges — pre-existing,
  now canonized.

## 6. Known limitations / deferred

- Long-tail secondary buttons adopt `act-*` classes opportunistically as screens are next
  touched — the convention and enforcement exist; the sweep prioritized every PRIMARY CTA.
- Layered tooltips (icon → short → expanded → exact) exist today on draft cards (dwell/
  long-press detail) and equipment details; a shared three-tier tooltip primitive for ALL
  surfaces is future work and slots into `ui-kit` beside `<Ico>`.
- Status glyphs surface in UI text contexts (bestiary/inspector adoption rides the next
  touch of those screens; the map itself is complete and enforced).
