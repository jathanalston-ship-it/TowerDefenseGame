# UI-STANDARDS.md — the design system every screen inherits

> The single UI rulebook (constitution rule 5). **Enforced:** `src/dev/uiStandards.test.ts`
> fails the build on off-scale type, radii, or motion in the stylesheet — future screens inherit
> these standards automatically. Companions: `UI-MOTION.md` (the motion language in depth),
> `STYLE-GUIDE.md` (voice/lexicon), `READABILITY.md` (battlefield legibility),
> `LEXICON.md` (names/glyphs). Measured drift that motivated this pass: 191 raw radii,
> ~40 raw durations, 90 half-pixel font sizes — all normalized onto the tokens below.

## 1. UI design standards (the ground rules)

- **Tokens over literals.** Colors, radii, durations, easings come from `:root` in
  `src/index.css`. A raw value in a new rule is a defect unless annotated (see §Animation).
- **Compose, don't recreate.** Check §11's component kit before writing new markup for a
  concept that already exists (icons, bars, power readouts, currency chips, art frames…).
- **One accent system.** Rarity colors come ONLY from the canonical map
  (`rarityColorOf`, `src/core/equipment.ts`) or `rarityRegistry` (loot tiers) — never inline
  hexes. Faction/element accents: `--kinetic` `--caustic` `--viral` `--vital` `--gold`.
- **Dark, layered surfaces:** page → `var(--panel)` → `var(--panel-2)`; separation by
  `1px solid var(--line)` (strong: `--line-strong`), not by heavy shadows.
- **Every interactive element**: a `title` tooltip or `aria-label`, a hover state, a focus
  state, and press feedback (`--dur-1`).

## 2. Typography standards

- **Whole-pixel scale only** (enforced): 9 · 10 · 11 · 12 · 13 · 14 · 15 · 16 · 18 · 20 · 24+.
  Body default 13px; secondary 11–12px; micro-labels 9–10px.
- **Eyebrows/section labels:** 10–11px, `letter-spacing: 0.08–0.14em`, `text-transform:
  uppercase`, muted color, weight 600–700.
- **Numbers the player watches** (currencies, Power, counts): weight 700–800, `toLocaleString()`
  formatting, `formatPower` for Power.
- One font stack (system UI stack set on `body`); weights 400/600/700/800 only.

## 3. Spacing standards

- **The 2/4 grid:** paddings and gaps in 2px steps, preferring 4 · 6 · 8 · 10 · 12 · 14 · 16 ·
  20 · 24. No odd one-off values in new rules.
- Panel padding: 14–18px. Chip/pill padding: `4px 10px` (small) / `6px 12px` (default).
  Grid/list gaps: 8–12px. Section separation: 16–24px.
- Alignment: flex rows use `align-items: center` (or `baseline` for text+number pairs) — never
  eyeball with margins.

## 4. Animation standards

- **Durations are tokens** (enforced): `--dur-1` 90ms press/micro · `--dur-2` 150ms hover/toggle
  · `--dur-3` 220ms screen/panel enter · `--dur-4` 300ms overlays/reveals.
- **Easings are tokens:** `--ease-out` (default), `--ease-in` (exits), `--ease-in-out` (moves),
  `--ease-spring` (celebration moments only).
- **Bespoke ceremony motion** (vault flip, meter sweep) is allowed ONLY with an inline
  `/* bespoke: reason */` annotation — the enforcement test reads it.
- Honor `prefers-reduced-motion` (existing pattern: animation overrides to 0.01ms).
- Animate `transform`/`opacity`; never layout properties in hot paths.

## 5. Button standards

- **Variants:** default (panel button), `.primary` (the one dominant action per view — filled
  accent), destructive (red-accented, behind a confirm per the safeguards pattern), chip/pill
  toggles (`border-radius: 999px`). **Organic blobs** — eggs, sacs, membranes (the
Bio-Container hatching) — use the eight-value elliptical form `A% B% C% D% / E% F% G% H%`
with every radius in **30–70%** (near-elliptical, sculpted; enforced by uiStandards).
- Heights: default controls ~28–32px; hero CTAs (Deploy/Continue) may be larger but consistent
  within their bar. Disabled: reduced opacity + `cursor: default` + a `title` explaining WHY
  (see the Gene Archive's gated Upgrade button).
- Press feedback at `--dur-1`; hover at `--dur-2`; never remove the focus outline without
  replacing it.

## 6. Tooltip standards

- **Native `title` attributes** are the standard tooltip (zero-dependency, screen-reader
  friendly). Every icon-only control MUST carry one.
- Content: one sentence, sentence case; state WHY when explaining a disabled control
  (`"Requires Campaign Stage 15"`), not just that it is.
- Rich hover panels (equipment compare, hero profiles) are POPOVERS, not tooltips — they follow
  §9 panel rules and never trap the pointer.

## 7. Toast / notification standards

- In-run + hub toasts: `LootToaster` / `AchievementToaster` patterns — enter with `--dur-3`
  `--ease-out`, auto-dismiss, NEVER cover the action bar or modal buttons; queue, don't stack
  unbounded.
- Menu badges come ONLY from the notifications registry (`state/notifications.ts`) — a new
  badge is a registered `count(save)` source, never a hand-rolled dot.

## 8. Modal / overlay standards

- One scrim: `.cmp-overlay` (fixed, darkened, blurred backdrop) — click-outside closes,
  `✕` button top-right (`.id-close`), content stops propagation. Enter at `--dur-4`.
- One modal visible at a time; modals never spawn modals (ceremonies sequence instead —
  vault reveal pattern).
- Fullscreen ceremonies (Vault, Star Ceremony) are centered by construction and clip nothing at
  any viewport ≥ 1280×720.

## 9. Panel standards

- `.panel` + `.panel-title` (+ optional `.panel-sub` explainer) is the screen scaffold; sections
  inside use eyebrow labels (§2). Radius: `--r-md` (panels), `--r-sm` (cards/tiles), `--r-lg`
  (hero surfaces), `--r-xs` (micro chips), `999px` (pills), `50%` (dots) — enforced.
- Cards/tiles: 1px `--line` border, `--panel-2` surface, accent via a `--rc`/`--acc` custom
  property set inline (the rarity/subject pattern) — not per-card CSS.

## 10. Scrollbar standards

- Scrolling containers: `overflow-y: auto` on the CONTENT region (never the whole screen shell);
  reserve gutter (`scrollbar-gutter: stable`) where jitter matters.
- Style via the shared thin-scrollbar rules in `index.css` (WebKit + Firefox `scrollbar-width:
  thin`); never hide scrollbars on scrollable content.

## 11. The component kit (`src/ui/components/`) — reuse before you build

| Component | Use for | Never |
|---|---|---|
| `Icon.tsx` (Play/Upload/Tower…) | inline SVG glyphs | new emoji-as-icon in chrome |
| `CurrencyIcon` | EVERY currency mention | hand-drawn currency glyphs |
| `ProgressBar` | any value/max meter | bespoke div-pair bars |
| `PowerScore` / `PowerDelta` | power readouts & compares | re-formatting power by hand |
| `ItemArt` / `GeneCardArt` / `HeroPortrait` | procedural art frames | `<img>` placeholders |
| `BranchTree` / `AdaptationTree` | tiered decision trees | one-off tree layouts |
| `useCountUp` | number reveal animation | copy-pasting rAF counters |
| `PowerPreview` / `PowerToaster` | upgrade previews (current→new +impact) · gain toasts | bespoke power text or ad-hoc toasts |
| `rarityColorOf` (core/equipment) | rarity → color, everywhere | inline rarity hexes |

Adding a component: put it in `src/ui/components/`, register it in the `ui-kit` system
(`src/dev/systemRegistry.ts`), document the row above.

## Known limitations / follow-ups

- Enforcement covers the stylesheet; inline `style={{…}}` props rely on review + this doc.
- Spacing (§3) is a convention, not yet machine-enforced (padding values are too contextual for
  a blunt regex — revisit with a real CSS parser if drift returns).
- The large decorative arcs (vault card tops) are sanctioned shapes, allow-listed in the test.

## §lists (2026-07) — long-list organization standards

Every list that grows with content (the targets: 100 towers, 30 heroes, 1000 upgrades,
500 cards) must ship ORGANIZED, not flat. The framework is `state/listOrg.ts`:

- **Declare, don't implement**: a surface describes its spec as data — `searchText`,
  `sorts` (first = default), `filters` (AND chips), optional `groups`, and a `lead` weight
  (favorites/pins always float first — curation beats sorting). `organizeList` applies
  query → chips → stable sort → lead → grouping; screens never hand-roll list logic.
- **Persist choices per surface** with `prefs.listOrgPrefs(surface)` — sort/filters/group/
  collapsed only. The QUERY is never persisted (a stale search silently hiding everything
  on return is a trap). Unknown persisted ids must fall back to defaults (a removed sort
  mode can never wedge a screen).
- **The shared control row** is `ui/components/ListControls` (`.lc-*` — search, chips,
  sort select, view toggle, N/M shown counter), styled on the Gene Archive's control
  language. Compact rails (the Tower Lab bench) may keep their own markup but ride the
  same organizer + prefs.
- **Grouping is the scale answer**, not longer scrollbars: collapsible folds
  (`.lc-group`) with per-fold counts and signal badges (▲ upgradeables), fold state
  persisted. Only the sections/pages in view should mount when a list can exceed ~50 rows.
- Shipped surfaces: Tower Lab (class folds + 8 sorts), Hero Lab (search/sorts/chips,
  locked-last), Evolution HQ (board search + Affordable now / Hide maxed, empty categories
  vanish), Gene Archive (persisted + Highest Rarity sort), Armory (persisted sort).
