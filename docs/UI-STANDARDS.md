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
- **Where a rule lives.** A class only ONE lazy screen renders goes in that screen's own sheet
  (`src/ui/<Screen>.css`, imported by the screen); `index.css` keeps tokens, the shell and anything a
  boot screen or several screens render. Lazy sheets load after `index.css`, so at equal specificity
  a screen rule wins — docs/DEPLOYMENT.md §boot-css. The audits below read every sheet.
- **Compose, don't recreate.** Check §11's component kit before writing new markup for a
  concept that already exists (icons, bars, power readouts, currency chips, art frames…).
- **One accent system.** Rarity colors come ONLY from the canonical map
  (`rarityColorOf`, `src/core/equipment.ts`) or `rarityRegistry` (loot tiers) — never inline
  hexes, never a screen-local map. Faction/element accents: `--kinetic` `--caustic` `--viral`
  `--vital` `--gold`. Rarity PRESENTATION (glow, sweep, edge, motes, crown) is §rarity.
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
- **§measure — ONE desktop content width for hub screens:** every screen in the hub content
  area caps at `--screen-max` (1120px), centered, via `.hub-screen > *` — never author a
  per-screen `max-width`/`width` cap (the Store at 820, landings at 980, and fluid Home once
  made every wing a different column width; `.hub { width: 100% }` pins the shell against
  `.app`'s shrink-to-fit centering). A screen needing an internal narrower column does it on
  an INNER element, and any screen-root width that must exist points at `var(--screen-max)`.
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
- **Verb icons (docs/ICON-LANGUAGE.md):** a primary CTA speaks its verb visually — add the
  matching `act-<verb>` class (claim ✹ · collect ⤓ · open ◉ · upgrade ⇧ · equip ⛨ · play ▶ …)
  or render `<Ico a="…">` from `ui/iconLanguage.tsx`. Never double a glyph the button's text
  already contains; never drop the text label (the icon confirms, text remains).

## 6. Tooltip standards

- **Native `title` attributes** are the standard tooltip (zero-dependency, screen-reader
  friendly). Every icon-only control MUST carry one.
- Content: one sentence, sentence case; state WHY when explaining a disabled control
  (`"Requires Campaign Stage 15"`), not just that it is.
- A tooltip is hover-only — it may REPEAT what the screen shows, never be the only place an
  essential explanation lives (touch has no hover): see §touch-info (`ChipPopover`).
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
| `RarityFx` + `rfxClass` | any surface that shows an item's rarity (§rarity) | per-screen glows/sheens/borders |
| `ChipPopover` | a chip that explains itself on TAP (wallet, level, materials) | title-only essentials |
| `SectionNav` | any screen taller than ~3 viewports (§long-screens) | per-screen jump rails / fold logic |
| `LoadoutStrip` | beside every run launch (§loadout) | re-listing loadout bits by hand |
| `ClaimAll` | every batch claim — "✹ Claim all (N)" (Quest Board, Season Pass, Milestones) | per-screen "Digest all" / bespoke claim-all buttons |

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

## §naming (2026-11) — one name per screen

Every hub screen has exactly ONE player-facing name, and it lives in ONE place: the feature
registry (`state/unlocks.ts` `FEATURES[].name`, with its `glyph`). The rail, breadcrumb and
sibling chips DERIVE from it (`ui/navModel.ts` `row()` / `navLabel()`), as do hub cards, advice
("Open the …"), unlock ceremonies and page titles — so a screen can no longer be "Equipment" in
the chips and "Armory" on its card. Other locales translate the name by screen id in
`i18n` `SCREEN_NAMES` (a missing row falls back to English). `navModel.test.ts` pins it: every
nav label equals its registry name, every mono equals its glyph, no two screens share a name,
no screen icon is a bare letter, and "Vault" names exactly one place (the Genetic Vault — the
cosmetics stock screen is the **Specimen Cabinet**). The rail's Home door (`nav.home`) is chrome,
not a screen name. Rule for a new screen: add its `FEATURES` row (name + glyph) and its
`SCREEN_NAMES` translations; never type a label into navModel.

## §readability (2026-11) — contrast + size floors

- **Text tokens are AA on every surface**: `--text`, `--muted` and `--dim` each read ≥ 4.5:1 on
  `--bg`, `--panel`, `--panel-2`, `--panel-3` and `--panel-deep` (`src/dev/tokenContrast.test.ts`),
  and keep their order (text > muted > dim). `--dim` moved #5b6677 (3.1:1) → #808d9f.
- **12px floor** for anything a player reads to decide (tier labels, reward names, body copy,
  control labels). Smaller is allowed only for DECORATIVE eyebrows/glyph badges, and only at
  ≥ 4.5:1. The Season Pass track is the reference fix (10px → 12px, cells 84 → 100px).
- `scripts/cogload.ts` reports, per screen, visible text under 12px and under 4.5:1 against its
  nearest opaque background (`<12px` / `<4.5:1` columns) — a pressure gauge, never a failure.

## §touch-info (2026-11) — essentials answer on tap

A `title=` tooltip is hover-only: on touch it says nothing. Anything a player needs to UNDERSTAND
the game (what a currency is, what the level chip means) must be reachable by a tap. The top-bar
essentials are buttons that open a popover (`ui/components/ChipPopover.tsx` — fixed-positioned
so a horizontally-scrolling top bar never clips it; closes on outside tap, Escape, scroll,
resize): every wallet chip says what the currency is, where it is earned and links to where it
is spent (only once that screen is open); the Materials and Account Level chips use the same
popover. `ui/components/topbarTouch.test.ts` renders each essential and fails if one is
title-only, and guards the Hub top bar against raw title-only chips. `title=` stays fine for
redundant hints (an icon whose meaning is also in visible text).

## §long-screens (2026-11) — SectionNav

A screen taller than ~3 viewports uses `ui/components/SectionNav.tsx` — never its own jump rail
or fold logic. Sections are DATA (`{ id, title, icon?, hint?, count?, meta?, defaultOpen?,
render }`): a sticky row of anchor chips (one row, scrolls sideways; static on portrait, where
the back header owns the edge) over collapsible sections. A chip opens its section and scrolls
to it; a folded section shows its one-line hint and count, so the page reads as a table of
contents; bodies render only while open. Open/folded state is a DEVICE pref per screen
(`prefs.sectionPrefs` / `setSectionPrefs`, key `assimilate.sections`); unset ids use the
section's default — prefer a data-driven default ("open when there is something to do here").
`forceOpen` opens everything (an active search must never hide its hits in a fold). Shipped:
Hero Hall (primary role/Stars open, deep panels folded), Evolution HQ (a category opens when it
holds something affordable; Ascension when a Molt or Cells wait), Gene Archive (Starting Genes
open while a slot is empty; the level gates + guide folded).

## §loadout (2026-11) — show what the launch fields

Every run launch shows `ui/components/LoadoutStrip.tsx` beside its button: fielded hero
portraits, gear filled across the fielded heroes, starting genes slotted, and the doctrine —
each segment a deep link to where it is changed (Hero Hall, Armory, Gene Archive, Home), shown
only once that system has revealed and linked only when `isOpenNav`. It READS existing state
(`loadoutSummary(save, doctrineId)`); empty slots read amber (a free upgrade). Mounted on the
Campaign stage panel footer, the Infinite terminal and the Boss Rush terminal (doctrine-less).

## §rarity (2026-11) — one rarity language everywhere

A Legendary reads the same in a draft, the Armory, the Vault, the Archive and the market. Two halves:

- **Colour:** the `--r-*` tokens in `:root` — common · uncommon · rare · epic · legendary · **exotic
  (`--r-exotic` pink + `--r-exotic-2` cyan shimmer — docs/STYLE-GUIDE.md §5's prismatic apex)** · mythic —
  reached ONLY through `rarityColorOf` / `rarityRegistry` (the wardrobe map, Hero Lab and Auction tints
  now delegate). Exotic used to be three colours (gear `--viral`, gear art teal, draft pink); the canvas
  art mirror (`render/equipmentArt.ts` RARITY_HEX) carries the same hexes.
- **Presentation:** a surface that shows a rarity is a HOST — `className={rfxClass(rarity, lite?)}`
  (`rfx rfx-<tier>`, must be positioned) — with `<RarityFx rarity … />` as its first child. The CSS
  table (index.css "RARITY FX") holds every strength; `RARITY_FX` in `ui/components/RarityFx.tsx` decides
  which layers a tier mounts (rare+ edge · epic+ motes · legendary+ crown). Profiles:

| profile | used by | what moves |
|---|---|---|
| full (default) | draft cards, Vault clutch faces, prize banner, apex interrupt, shelf containers, wardrobe unlock, Genome Rank promotion | breathing glow, looping sweep, edge, motes, crown; `flash` = a one-shot land |
| `lite` | Armory cards, Gear Codex frames, Gene Archive tiles, Specimen Cabinet, Wardrobe, market containers, Results container rows | nothing at rest except the legendary+ edge (slow, a compositor transform); static halo + inner wash; the sweep plays once on hover/focus; no motes/crown |

Rules: layers are decorative (`aria-hidden`), transform/opacity only; a `rfx-chip` speaks the tier's
name in its colour; an isolated host that carries a `.tt` tooltip lifts itself on hover. Reduced motion
(OS · `:root`/`.game[data-motion]`) keeps every colour and drops the motion (static glow, solid edge, crown
at rest); Flashes off (`data-flashes`) drops `rfx-flash`. A new rarity = a row in each table; a new item
surface = a host class + `<RarityFx>` — never bespoke glow CSS.

### Currency explanation focus
ChipPopover is a non-modal dialog: opening focuses its container without scrolling, Tab can reach its action and leave naturally, focus leaving closes it, and Escape/resize/scroll dismissal restores the chip only if focus was inside the popup. Outside clicks preserve the new target. Triggers expose aria-haspopup and aria-controls.

ProgressBar uses the same clamped, fractional value for fill width and aria-valuenow. A missing/invalid maximum produces an empty valid 0–1 range. Conveyor growth labels identify the organism and expose percent plus a readable time-until-ready value.
