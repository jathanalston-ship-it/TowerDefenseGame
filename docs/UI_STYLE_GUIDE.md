# UI_STYLE_GUIDE.md — the concrete standards

> The **what**: every number a screen is allowed to use. Vision lives in
> `docs/VISUAL_IDENTITY.md`, application rules in `docs/DESIGN_LANGUAGE.md`, the component kit
> and enforcement detail in `docs/UI-STANDARDS.md`, motion depth in `docs/UI-MOTION.md`.
> Tokens are defined once in `:root` (src/index.css). Several rules here are machine-enforced
> by `src/dev/uiStandards.test.ts` — breaking them fails `npm test`.

## 1. Typography

- **Family**: the system UI stack (already global). No display webfonts; identity comes from
  weight + tracking + color, not typefaces.
- **Type scale (px)** — the only sizes allowed (enforced; `clamp()` display sizes also allowed):

  | px | role |
  |---|---|
  | 10 | micro / eyebrow / specimen tag |
  | 11 | label, secondary meta |
  | 12 | body-small, chips |
  | 13 | body (default) |
  | 14 | emphasized body, toast titles |
  | 16 | subheading, key values |
  | 18 | heading |
  | 20 | panel title, large value |
  | 26 | display value |
  | 34 / 40 / 58 / `clamp(...)` | hero numerals, glyph badges & screen titles only |

- **Weights**: 400 lore/body-prose · 600 sub-labels · 700 strong body · 800 headings (default
  emphasis) · 900 display/celebration. Nothing else.
- **Tracking scale (em)**: 0.02 · 0.04 · 0.06 · 0.08 · 0.10 · 0.12 · 0.14 · 0.16 · 0.20 ·
  0.24 · 0.28, plus the ceremonial display tier 0.34 / 0.42 (huge dramatic titles only).
  Wide tracking (≥0.10) is for uppercase eyebrows/titles only.
- **No webfonts**: the system stack is the voice (weight + tracking + color carry identity).
  The phantom `Chakra Petch`/`Rajdhani`/`Inter` declarations (never loaded) were removed.
- **Numbers**: anything that changes uses `font-variant-numeric: tabular-nums`.
- Eyebrow pattern: `10–11px / 800 / uppercase / tracking ≥ 0.10em / --muted`.

## 2. Spacing

Scale: `--s1 4px · --s2 8px · --s3 12px · --s4 16px · --s5 24px`. Gaps and paddings come from
the scale (raw px multiples of 2 are tolerated in legacy code; new code uses the ramp).
Panel padding default: 12–16px; card padding: 10–14px; chip padding: 2–4px × 8–10px.

## 3. Color tokens (the only palette)

| group | tokens |
|---|---|
| Neutrals | `--void #070a0f` · `--bg` · `--bg-arena` · `--panel #11161f` · `--panel-2 #161d28` · `--panel-3 #1c2533` · `--panel-deep #0a0e15` (gradient floors) |
| Lines / text | `--line #232c3a` · `--line-strong #3a4a63` · `--text #d7e0ec` · `--muted #8a97a8` · `--dim #5b6677` |
| Class hues | `--kinetic #5ad1ff` · `--caustic #b6e84a` · `--viral #e24dff` · `--neural #6e7bff` · `--vital #ff7a59` |
| State | `--gold #ffd24d` · `--success #3fe08a` · `--warn #ffb24d` · `--danger #ff5d73` |
| Rarity | `--r-common #9aa7b8` · `--r-uncommon #5fe08a` · `--r-rare #5ad1ff` · `--r-epic #c98bff` · `--r-legendary #ffd24d` · `--r-mythic #ff6b8b` · `--cache #36e0c4` |

Rules: no raw hex outside `:root` except `#fff`/`#000` inside alpha mixes; tints/edges via
`color-mix(in srgb, var(--token) N%, transparent)`; white inset highlights ≤ 0.06 alpha.

## 4. Panels, borders, radii

- **Materials**: opaque panel ramp (`--panel/-2/-3`) for chrome; **glass** for floating layers:
  `rgba` panel + `backdrop-filter: blur(6px)` + `--bevel` + 1px `--line`/`--line-strong` edge.
- **Radii**: `--r-xs 4px · --r-sm 8px · --r-md 12px · --r-lg 16px`, `999px` capsules, `50%`
  circles. (Enforced — anything else fails uiStandards.)
- **Borders**: 1px always; emphasis via color (`--line → --line-strong → class/state hue at
  35–60% mix), never via thickness. Accent edges: 2px inset rail or underline (`--hud-acc`
  pattern).

## 5. Elevation & glow recipes

Depth (black) and glow (meaning) are separate systems:

- Depth: `--shadow-sm` (chips/buttons) · `--shadow` (cards/panels) · `--shadow-lg`
  (modals/ceremonies).
- Glow geometry tokens — color is appended at use-site so any hue can glow the same way:
  - `--ring-in: inset 0 0 0 1px` → `box-shadow: var(--ring-in) var(--gold);` (selection ring)
  - `--halo: 0 0 22px -6px` → soft outer presence (hover, live accents)
  - `--bloom: 0 0 34px -8px` → celebration-tier radiance
- Focus: `var(--ring)` via `:focus-visible` (global). Never `outline: none` without it.

## 6. Buttons

Hierarchy: **primary** (filled, class/state accent, the one action per view) · **secondary**
(outlined panel) · **ghost/pill** (nav chips, capsule toggles). States, uniformly:
hover = `-1px` lift + `--halo` in the accent (cards may use `-2px`; nothing lifts more) ·
press = global `translateY(1px) scale(0.99)` (one rule owns it) · disabled = 45% opacity, no
lift · focus = `--ring`. CTAs may breathe (5–8s halo loop, e.g. `.mc-deploy`); at most one
breathing CTA per screen.

## 7. Progress bars

One language for every meter: track `rgba(255,255,255,0.08)` on dark (or `--panel-2` in
opaque chrome), radius `--r-xs` (or capsule at ≥12px height), fill in the owning hue
(gradient toward 40% mix tail allowed), `width` transitions `--dur-2 linear`. Heights: 4px
(inline/mini) · 6px (standard) · 8px (prominent) · 16px (HP with inline numeral). Segmented
variants keep 2px notches. Use `src/ui/components/ProgressBar.tsx` — bespoke bars need a
reason.

## 8. Toasts & floating layers

- **Anchor**: one shared stack region — `top: 64px; right: 16px`, column, newest on top,
  8px gap. All toast families (achievement, loot, power, mastery) share it and never overlap
  (single band of the z-scale).
- **Shape**: glass card, `--r-md`, 1px accent-mix border, icon chip left (38–40px, `--r-md`
  or circle), eyebrow + title + sub body; enter `--dur-3 --ease-out` (rise+fade), exit
  `--dur-3 --ease-in`; ~2.2–2.6s dwell, queued, coalesce bursts.
- **Z-scale** (documented tiers — stay inside your band): 0–9 in-panel · 10–49 screen chrome ·
  50–99 HUD overlays · 100–199 dropdowns/tooltips · 480–520 toasts · 900+ modals & ceremonies.

## 9. Tooltips, modals, scrollbars

- **Tooltip**: `.tt` + `.tt-bubble` — dark glass, 1px `--line-strong`, `--r-sm`, 11–12px body,
  140–260px width, fade+2px rise in `--dur-2`. One implementation.
- **Modal/ceremony**: dim veil `rgba(0,0,0,0.6+)` + blur, panel `--r-lg`, `--shadow-lg`,
  enter `--dur-4`; dismiss = veil click + explicit button (ceremonies may require the button).
- **Scrollbar** (global, themed): thin; thumb `--line-strong` → hover `--dim`; track
  transparent; `scrollbar-width: thin` + `::-webkit-scrollbar` 10px, thumb `--r-sm` with
  2px inset margin.

## 10. Motion timing (summary — depth in UI-MOTION.md)

`--dur-1 90ms` press · `--dur-2 150ms` hover/toggle/bar-fill · `--dur-3 220ms`
panel/tab/toast · `--dur-4 300ms` overlay/reveal · ambience 5–8s ease-in-out loops ·
number rolls ~600ms ease-out. Eases: `--ease-out` default, `--ease-in` exits,
`--ease-in-out` slides, `--ease-spring` rewards only. Transition durations MUST come from
tokens (enforced); keyframe ambience declares its own seconds.

## 11. Responsive & platforms

The multi-platform framework lives in `docs/RESPONSIVE-DESIGN.md`: breakpoints (860 shell /
900 run-stack / 640 phone / Deck short-band), container-sized panels `min(Xpx, 100%)`,
reflow grids, `--safe-t/r/b/l` tokens on fixed chrome, the modal safety net, coarse-pointer
44px floors, tooltip tap-toggling, and `usePressRepeat` hold-to-buy. New screens follow its
§6 checklist and need no additional responsive work.

## 12. Enforcement

`src/dev/uiStandards.test.ts` fails the suite on: fractional font px, off-token radii,
off-token transition durations (un-annotated), and off-scale font sizes. Doc-sync anchors
pin this guide to the live tokens (`npm test` → docSync). When a standard here and code
disagree, the standard wins — fix the code or amend the guide in the same PR.

---

## Appendix A — identity audit findings (2026-07, pre-unification)

The full-presentation audit that seeded this guide. Every finding was either **fixed** in the
unification pass or **codified** as the standard above.

| # | axis | finding | resolution |
|---|---|---|---|
| 1 | typography | 17 flat font sizes incl. off-scale 9/15/17/19/22/24px | type scale §1; off-scale snapped; enforced |
| 2 | typography | 15 distinct letter-spacings (0.02–0.28em, odd steps) | tracking scale §1; odd values snapped |
| 3 | typography | weights 400–900 all present incl. stray 500 | weight set §1; 500→600 |
| 4 | color | 8 near-identical bespoke panel darks (#0a0e14…#11161f) | `--panel-deep` token; snapped |
| 5 | color | phantom `var(--good, #57d98a)` + raw semantic hexes (#57d98a, #ff7a7a, #7ad1ff…) | mapped to `--success`/`--danger`/`--kinetic`/rarity tokens |
| 6 | shadows | ~25 bespoke glow geometries (22px/-2, 24px/-4, 20px/-8…) | glow recipes §5 (`--ring-in/--halo/--bloom`) |
| 7 | toasts | 3 toast families: right 16/22px, z 60/480/500, 3 bespoke curves, icon 38px-circle vs 40px-r-md | unified anchor/shape/z-band §8 |
| 8 | bars | ~14 bar implementations; tracks 0.07/0.08/panel-2/black-.5; heights 4/5/6/8/16; mixed radii | one bar language §7 |
| 9 | scrollbars | browser-default scrollbars (one `scrollbar-width` only) | global themed scrollbar §9 |
| 10 | interaction | hover lifts -1/-2/-3px; TWO global `button:active` rules (dup) | -1/-2 standard §6; duplicate removed |
| 11 | motion | legacy `--t-fast/--t-med` aliases coexisting with `--dur-*` (13 uses) | migrated + aliases removed |
| 12 | focus | only 4 `:focus-visible` rules — keyboard nav mostly unstyled | global `--ring` focus §5/§6 |
| 13 | audio | legacy ambient drone + biome voicing + run-end `resolve()` playing UNDER the music engine | drone retired; music engine is the single soundtrack authority |
| 14 | terminology | ★ glyph survived the ◈ lexicon pass in 5 files (incl. user-facing "Ascension ★N") | swept to ◈ |
| 15 | layering | toast z-indexes scattered (60/480/500) with no documented scale | z-tier table §8 |
