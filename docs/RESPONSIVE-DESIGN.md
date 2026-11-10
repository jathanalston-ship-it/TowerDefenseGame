# RESPONSIVE-DESIGN.md — the multi-platform UI framework

> One codebase, one UI system: every screen adapts to desktop, ultrawide, 4K, Steam Deck,
> tablets, and phones through the primitives here — never through per-platform forks. This is
> a PERMANENT foundational capability: a new screen built with these patterns needs **zero
> additional responsive work**. Companion to `docs/UI_STYLE_GUIDE.md` (values) and
> `docs/DESIGN_LANGUAGE.md` (application; its new-screen checklist references this guide).

## 0. Layout profiles (the three intentional interfaces)

The UI is not "one layout resized" — it is THREE interfaces sharing one identity, chosen by
`src/ui/layoutProfile.ts` and stamped on `<html>` as `data-layout` (+ `data-coarse` for touch):

| profile | rule | intent |
|---|---|---|
| `desktop` | everything else (incl. landscape tablets / Deck / ultrawide) | information-rich, pointer-first |
| `landscape` | wider than tall AND height ≤ 520px | **the phone game** (§landscape): drawer nav + stacked run — phones play horizontal ONLY |
| `portrait` | taller than wide AND width ≤ 900px | touch hub ⇒ the **ROTATE GATE** (`RotateGate.tsx` — the full-screen hold); a LIVE RUN plays portrait (§run); mouse-narrow windows keep the compact shell |

Components branch via `useLayoutProfile()`; new CSS keys on `html[data-layout="…"]` /
`html[data-coarse="1"]`. The legacy width bands below (860/900/640/Deck) remain the underlying
implementation of the existing rules — new work should reach for the profile attributes first.
One rAF-debounced resize listener feeds the store; profile reads are cached (free at frame rate).

**The zero-list (hard contract, machine-enforced):** no UI beyond the viewport, no hidden or
unreachable controls, no tutorial cues pointing at off-screen targets, no horizontal scrolling,
no clipped text, no off-screen popups — at ANY supported size. `npm run mobilecheck` (in
`npm run validate`) fails the build on each of these.

## 0a. §run — the in-run layouts (2026-11): the board is the game

The battlefield is 720×960 logical (portrait 3:4), so the run screen is laid out per profile
around the BIGGEST board the viewport allows (`src/index.css` §RUN LAYOUT v2 — keyed on
`html[data-layout]`, placed last so it wins over the legacy width bands):

| profile | grid | board measured (before → after) |
|---|---|---|
| desktop | slim fixed HUD row · stage [Run Build │ board │ Hero Ops] · fixed tower deck | 1440×900 440×587 → 543×724 · 1366×768 374×499 → 444×592 · 1920×1080 575×767 → 657×876 · 1024×768 368×490 → 444×592 |
| landscape (phones) | HUD column + wave-briefing dock │ board at full viewport height │ run keys + tower column + hero pod | 844×390 164×218 (scrolled off-screen) → 285×379 · 926×428 → 313×417 |
| portrait (phones, portrait tablets) | HUD strip · run-keys strip · full-width board · [» Run Build │ hero pod │ Status «] · tower rail | 390×844 rotate gate → 380×507 · 360×740 → 332×442 |

- **Desktop gutters are periphery, not black** (2026-11): the frame around the board carries the
  Living Gutters bake (docs/SIGNATURE-MOMENTS.md §4) — absolutely positioned behind the board and every
  overlay, aligned to the board's layout box at every width (ResizeObserver), desktop profile only; the
  phone layouts (no gutters) never mount it.
- **No page scroll, ever, during a run** — every profile is a fixed `100dvh` grid; panels are
  in-place (desktop) or overlay DRAWERS (phones: closed by default, tap-to-close veil, reset
  when the profile flips; the Inspector opens itself for a tapped tower and for a tutorial cue
  that points at it). The draft, pause card and Hero Console go full-screen on phones.
- **Nothing overlaps**: the run keys (speed · Hive · Pause) share one strip row; the briefing,
  boss and mega bars start below it (docs/HUD.md §layout). Fixed chrome heights mean nothing
  that appears mid-run (pods, siege, emergency) resizes the board.
- **The rotate gate stands down for a live run** (`layoutProfile.setInRun`, set by GameView):
  hub screens stay landscape-only on touch (§0b), the run plays in either orientation.
  **The whole run FLOW** (2026-11): holds are named — GameView holds `'battlefield'`, App holds
  `'run-flow'` while the screen is `deploying` / `playing` / `results` / `roulette` (the Bio-Roulette that
  closes a Boss Rush run — verified at 390×844) — so a portrait run's deploy
  breath and its Results (+ the milestone cinematics over it) are never covered by "TURN YOUR
  DEVICE"; the gate returns the moment Continue lands on the hub. Results at 390×844: no page
  scroll either way (the capsule takes `100dvh − padding`, the haze is clipped), the action row
  wraps/stretches ≤480px and stays pinned at the capsule's bottom edge.
- **Canvas input** maps through `getBoundingClientRect` (any CSS size); `npm run mobilecheck`
  proves the phone layouts (§4d) and a headless probe placed towers by tap on slots at every
  size above.

## 0b. The LANDSCAPE MANDATE (2026-07-18) — phone HUB screens are horizontal only

> Amended 2026-11 (§run): the RUN screen is exempt — it has real portrait and landscape phone
> layouts. Everything below still holds for the hub/menus.

The vertical phone game was retired by decision: the upgrade consoles are widescreen
organisms and portrait could not carry them. The contract now:

- **Touch + portrait ⇒ the ROTATE GATE** (`src/ui/components/RotateGate.tsx`): a full-screen
  hold above every overlay (z 100000), live-event tinted, cleared the same frame the device
  rotates (it reads `useLayoutProfile()`, never raw width). Phones AND portrait tablets.
- **Touch + landscape ⇒ the phone game**: the narrow-shell drawer (☰ opens the off-canvas
  rail; ≤900px width band) + the stacked run layout. The run/`.game` bands fire on
  `(max-width: 900px), (max-height: 520px)` — 926×428-class phones are WIDER than 900 but
  must stack like phones; the height clause is the landscape-phone catch.
- **Mouse windows are never gated** — desktop is unchanged at any window shape; a narrow
  desktop window keeps the compact drawer shell it always had.
- **The platform split**: this gate is the mobile-BROWSER half (the browser's toolbar: §browser). The store APP SHELL
  (iOS/Android, future Capacitor wrap) locks orientation natively, so the gate simply never
  fires there — shipping needs no change on this side.
- **`npm run mobilecheck` v3 enforces all of it**: the door→landing→card walk runs at
  844×390 and 926×428 (through the drawer) + tablet-landscape 1024×768 + desktop; the
  in-run landscape contract (≥44px on-screen ▶ Start Wave, board ≥40% of the viewport
  height, tray present); the tutorial walk completes at 844×390; portrait touch viewports
  must show the gate full-coverage (and it must NEVER leak into a playable orientation).
- The v2 portrait tab shell (`MobileShell.tsx`, §mobile-shell below) remains in the code for
  mouse-narrow windows only — it is no longer a supported PHONE surface and is no longer
  CI-walked; treat §mobile-shell as legacy reference.

## 0c. §browser — the MOBILE BROWSER (2026-11): the address bar takes height

The store app (future Capacitor wrap) and an installed web app run without browser UI; a phone's WEB
BROWSER does not — its toolbar (the address bar, on top in landscape) takes part of the screen, and the
two must both work:

- **`--app-h` — the app height.** A browser's `100vh` is the height with the toolbar HIDDEN, so a 100vh
  shell runs under the address bar (the hub's foot, Results, dialogs). Every full-screen height now uses
  `var(--app-h)` = `100dvh` (the live visible height), falling back to `100vh` and — on engines without
  dynamic viewport units — to the measured `innerHeight` (`layoutProfile.ts` stamps it on every resize;
  a toolbar showing or hiding fires one). `uiStandards.test` fails CI on any bare `100vh`/`100dvh`.
- **Full screen where the browser allows it** (`ui/mobileBrowser.ts`): Android Chrome and iPad Safari —
  the session's FIRST TAP asks for full screen (Settings → "Full screen in mobile browsers", default on,
  device pref `assimilate.immersive`); leaving it is respected until the next load, and the top bar's
  **⛶** (`ui/components/BrowserShell.tsx`) goes back. Orientation is NOT locked (runs play portrait too).
- **iPhone Safari has no page full-screen API**, so the way to lose the toolbar is **Add to Home Screen**:
  a one-time hub card (after the first run; "Got it" persists `assimilate.installHint`) shows the Share
  glyph and the two taps. The installed app runs standalone (`manifest.json` `display: standalone`,
  `orientation: landscape` — it said `portrait`, a leftover from the retired vertical-phone era that
  would have held an installed hub behind the rotate gate; `apple-mobile-web-app-*` meta in play/index.html).
- **Short portrait** (an iPhone browser in portrait leaves ≈390×664): the loot meter folds to a thin strip
  along the HUD's foot and the control strip / rails / tray tighten (`@media (max-height: 760px)`), so the
  board keeps ≥40% of the screen. The phone-landscape top bar tightens (gap, padding, ☰ without its word;
  the level chip hides ≤700px wide) so the wallet + ⛶ fit from 667 to 926px.
- **Verified:** `mobilecheck` walks the VISIBLE sizes with the toolbar showing — `browser-ios-844x340`,
  `browser-android-915x356`, `browser-ios-portrait-390x664` in the gate, `browser-ios-promax-926x378` and
  `browser-ios-se-667x325` in `--full` (headless has no toolbar, so 100vh equals these heights there —
  the bare-vh bug itself is guarded statically). A live check with Android / iPhone user agents confirms
  the first tap enters full screen, ⛶ sits on-screen, the iPhone card fits and stays dismissed, and
  neither renders on desktop.

## 1. The platform matrix (what we design for and test at)

| class | representative logical sizes |
|---|---|
| 4K / ultrawide | 3840×2160 · 2560×1080/1440 |
| Desktop / laptop | 1920×1080 · 1600×900 · 1366×768 · 1280×720 |
| Steam Deck | 1280×800 (short-viewport band) |
| Tablets | 1366×1024 · 1024×1366 · 800×1280 |
| Phones | 430×932 · 390×844 · 360×740 |

Breakpoints (max-width unless noted): **860px** — the shell breakpoint (nav rail → drawer);
**900px** — the run stacks vertically; **640px** — phone band (compact rail, reordered run
stack); **max-height 880px + min-width 641px** — the "Deck band" (short landscape: compact
chrome so the battlefield dominates). Prefer these four; don't invent new ones casually.

## 2. Layout primitives (use these, not fixed positioning)

- **Container-sized panels**: `width: min(<ideal>px, 100%)` — never `Nvw` (screens render
  beside the nav rail; viewport units overflow their container. The 2026-07 audit's only
  reachability bug — the Tower Lab buy button clipped at 1280w — was exactly this).
- **Reflow grids**: `grid-template-columns: repeat(auto-fill|auto-fit, minmax(<card>px, 1fr))`
  for every card list/inventory. Cards make MORE ROWS, never overflow.
- **Wrap rows**: flex + `flex-wrap: wrap` for chip/action rows; horizontal `overflow-x: auto`
  + `scroll-snap-type: x proximity` for deliberate rails (the in-run tower rail on phones).
- **Fluid type**: the px type scale for body/UI; `clamp()` for display numerals/titles only.
- **Safe areas**: tokens `--safe-t/r/b/l` (`env(safe-area-inset-*)`, viewport-fit=cover is
  set in index.html). EVERY `position: fixed` overlay adds them to its edge offsets — the
  toast rails, achievement stack, drawer, and run chrome already do; copy that pattern.
- **Modal safety net**: every dialog panel joins the bounded-modal rule (index.css §"Modal
  safety net"): `max-width/max-height` inside the safe viewport + `overflow-y: auto` +
  `overscroll-behavior: contain`. Buttons stay reachable at every size by construction.

## 3. The shell

- **Hub** (menus): grid `216px 1fr`. Under 860px (non-portrait — narrow desktop windows,
  landscape tablets) the rail becomes an off-canvas drawer showing the FULL labelled rail
  (`.hub > .hub-nav` fixed + translate; veil closes it; the ☰ burger lives in the topbar;
  picking a destination closes it). Specificity note: shell overrides must match
  `.hub > .hub-nav` — a bare class loses to the base rule.
- **Run** (GameView): see §run — per-profile grids replaced the old ≤900/≤640 stacking (which
  scrolled the page and crushed the board on phones). The compact deck (no card blurbs) now
  applies to every desktop below 1000px of height.

## 3b. The portrait shell (§mobile-shell) — the phone game

On the `portrait` profile the hub is a DIFFERENT machine, built for a first-time user whose
only tools are eyes, tooltips, and a thumb. `src/ui/navModel.ts` is the single source of
truth (the desktop rail derives from the same rows); `src/ui/MobileShell.tsx` renders it.

- **Bottom tab bar** (`.mtab-bar`, fixed, safe-area padded, five ≥52px tabs): Home / Battle /
  Rewards / Evolve / More — reward-loop order, mirroring the desktop behavior hubs
  (docs/NOTIFICATIONS.md §hubs). Tabs derive from the nav groups via `TAB_OF_GROUP` — a new
  nav group is one mapping row. Badges aggregate per tab; the active tab tracks the open screen.
- **Index pages** (`MobileTabIndex`): tapping a tab (except Home, which IS the Command
  Center) opens a page of self-describing rows — unlock-registry glyph + name + **blurb**
  (the first-timer explanation), notification badge, completion %, and teaser locks that
  print their requirement inline (`Sealed — Reach Stage 12`). Rows with news swap the blurb
  for their smart-notification REASON, and a compact recommendation strip leads the page
  (§reasons/§recommendations) — the index doubles as the hub's landing on phones. Gating
  rules match the rail: revealed screens + the next-reveal teasers, nothing deeper.
- **Drill-down** (`MobilePageHead`): every opened screen gets a sticky back header
  (`‹ TabName · Screen Title`); back returns to the tab index. Deep links (What's New,
  Command Center CTAs) land with the right tab lit because the owning tab derives from
  `tabOf(nav)`.
- **Screen linearization**: the master-detail labs (Tower Lab, Mulligan Lab, Hero Hall) turn
  their roster columns into horizontal specimen strips above the showcase; huge secondary
  consoles wrap in **`MobileSection`** (`src/ui/components/MobileSection.tsx`) — a native
  `<details>` collapsible with a fat self-describing summary (title + hint + live count)
  that renders children untouched on desktop. Grid columns that host strips must be
  `minmax(0, 1fr)` (intrinsic strip width otherwise widens the page).
- **Portrait combat**: compact 3-column HUD grid (vitals/loot/wave rows span; the wave
  module is pinned whole — the ≤900px `.hz{display:contents}` would scatter it), board
  capped at 42vh, and the wave-prep briefing as a **fixed bottom dock** — threat strip +
  full-width ≥48px ▶ Start Wave + auto toggles — that slides away during combat. Prep copy
  says "tap ▶ Start Wave below" (no space bar on phones).
- **The automation contract**: `navModel.test.ts` proves every `NavKey` sits in exactly one
  tab and owns an unlock-registry blurb; `mobilecheck` walks the tab shell BY DISCOVERY.
  Net effect: a future screen only compiles once it's in `navModel.ts` + the unlock
  registry, and from that moment it is automatically grouped, indexed, explained, gated,
  swept, and drilled on phones. There is no separate mobile checklist to remember.

## 4. Touch (every hover has a touch equivalent)

- **Tooltips**: `.tt` bubbles open on hover/focus AND on `.tt-open` — a single delegated
  App-level tap toggler (hover-less pointers only) serves every existing/future tooltip.
- **Tap targets**: `@media (pointer: coarse)` floors `button, select, [role=button], inputs`
  at 44px min-height with `touch-action: manipulation`. Non-button interactive elements MUST
  carry `role="button"` to inherit the floor.

## 4b. The run shell scrolls on portrait (the tutorial-blocker fix) — SUPERSEDED by §run

> 2026-11: the run never scrolls on any profile now (§run grids fit the viewport); kept as
> history.

The desktop run shell is a fixed 100vh "never scroll" RTS frame. On the ≤640px portrait band the
stage promotes every panel into ONE column that is taller than a phone screen — so the shell there
is `height:100dvh; overflow-y:auto` (2026-07: the old clipped shell made everything below the
board UNREACHABLE, which blocked the tutorial). The board keeps `touch-action:none` for game
gestures; scrolling rides the hud/panels/toolbar surfaces.

## 4c. Tutorial reachability (adaptive, machine-enforced)

Every checkpoint AUTO-SCROLLS its cue target into view (`TutorialOverlay` §reachability,
re-asserted after transitions), arrows never render at off-viewport anchors, and callouts flip
sides + clamp so the lesson text can never leave the screen (small viewports get an internal
scroll instead of a clipped bubble). The gate's TUTORIAL WALK steps every checkpoint at
375×812 and 844×390 on a fresh profile and fails the build if any cue target, callout, or
control is off-screen — the "portrait couldn't finish the tutorial" class of bug is a CI failure now.

## 4d. The responsive gate (`npm run mobilecheck`)

Default (runs in `npm run validate`): EVERY nav screen (derived from `navModel.ts`, never a
hand list) + a live board at one honest representative of each supported profile class —
1366×768 desktop, 390×844 + 320×568 portrait, 768×1024 tablet-portrait — plus the portrait
tutorial walk. Desktop sweeps the COMPRESSED rail: hub door (`[data-hub]`) → landing (audited once per hub) → screen card (`[data-nav]`), with direct doors (Home/Store) short-circuiting; portrait sweeps via the REAL tab
shell: tab bar present with ≥44px labelled tabs, every index row named + blurbed + ≥44px,
every row drills in (back header, titled) and returns, and the live run passes the combat-dock
contract (fixed dock, ≥44px on-screen ▶ Start Wave, board ≥25% of the viewport, tray present).
**2026-11 (v4):** portrait touch viewports assert the rotate gate on the HUB, then enter a live
run and pass the PHONE RUN CONTRACT (`phoneRunContract`, also used for landscape): no gate in
the run, no page scroll, board ≥90% of the height (landscape) / ≥40% of the screen (portrait),
≥44px on-screen ▶ Start Wave, tray and both drawer toggles on-screen — plus the RUN-CHROME
contract (`runChromeContract`, every profile incl. desktop): no two in-run HUD pieces overlap.
Detectors on every audited surface: horizontal overflow, clipped text, sub-24px targets,
off-screen interactives, **off-screen/oversize popups** (`[role="dialog"]` must fit or scroll),
and tutorial reachability. Landscape phones are OUT of the default gate (vertical-only play;
`--full` still sweeps them plus desktop 1920/2560/3440-ultrawide, portrait 360/375/412/430,
tablets 820/1024). Debug tools: DebugPanel → 📐 Responsive (live profile/viewport/
safe-area readout + the layout visualizer: tap-target outlines, safe-area bands, profile chip).
- **Hold-to-repeat**: `src/ui/components/usePressRepeat.ts` — the shared primitive for buy
  buttons (click once; hold to repeat with a ramp; a failed buy halts the run = overspend
  guard; context-menu suppressed for long-press). Desktop modifiers (shift-multi) stay at
  call sites.
- **Canvas**: pointer events already unify mouse/touch (tap select, drag relocate). Pinch
  zoom is future-reserved (the board fits every viewport; no zoom needed today).
- **Text**: `html { text-size-adjust: 100% }` — mobile font inflation is forbidden (it
  paints scaled glyphs over unscaled layout). Inside `line-height: 0` canvas wrappers,
  overlaid text blocks must restore their own line-height (the gene-splash lesson).

## 5. Performance rules

Responsiveness is CSS-first: media queries + intrinsic layout, zero resize listeners, zero
per-frame measurement. The one JS piece (tooltip tap toggler) is a single delegated listener.
Ambient layers stay transform/opacity; the run loop's 80ms throttle owns all live UI state.
No layout thrash, no extra renders on rotation — the browser does the work.

## 6. New-screen checklist (inherit everything)

1. Panel: `width: min(Xpx, 100%)`; content in reflow grids / wrap rows.
2. Fixed overlays add safe-area terms; dialogs join the modal safety net.
3. Interactive = real `button`/`select` or `role="button"`; hovers also work by tap
   (`.tt` for tooltips); buys go through `usePressRepeat`.
4. Type from the scale; display numerals clamp(); labels may ellipsize, never clip.
5. Verify with the probe (`scratchpad respprobe/runprobe pattern`) at 360/430/800/1280×800/
   1366/1920/3840 — zero overflow, zero unreachable controls.

## 7. 2026-07 audit findings & resolutions (Phase 1 record)

| finding | resolution |
|---|---|
| Panels sized `96vw` beside a 216px rail → Tower Lab buy button unreachable ≤1450w | container-sized `min(Xpx, 100%)` primitive (10 panels) |
| No narrow-shell nav — 216px rail at 360px phones | drawer + burger + veil (§3) |
| Run build panel `display:none` <640px (functionality loss) | scrollable strip; nothing hides |
| Tower rail overflowed offscreen at phones; two fat rows on Deck | snap-scroll chip rail (phones); blurb-less compact band (Deck) — board +69% on Deck |
| No viewport-fit / safe-area support | meta + `--safe-*` tokens on all fixed chrome |
| Hover-only tooltips dead on touch | `.tt-open` tap toggler (global) |
| `[role=button]` spans / selects dodge the 44px floor | coarse-pointer floor extended |
| Prep-bar controls collided with Pause at ≤640; gene splash under chrome | wrap + clearance; splash repositioned |
| Gene splash text collapsed (inherited `line-height: 0` from canvas-wrap) | explicit line-height (latent on ALL platforms) |
| Fixed-column stat/loadout/slot grids squeezed at phones | auto-fit minmax reflow |
| Mobile font boosting unguarded | `text-size-adjust: 100%` |
| Campaign-map band labels / hero pips flagged as clipped | verified false positives (absolute map labels render correctly — see m-campaign eyeball) |

Validation state: probe matrix (12 screens × 13 viewports) — **0 horizontal overflow,
0 unreachable controls** (closed-drawer nav items are intentionally off-canvas); run surfaces
verified at 4K/Deck/720p/iPad/phones with the board dominant and all chrome reachable.

## 7b. 2026-07 portrait rebuild record (the "mobile is a separate game" pass)

| finding (audit of the drawer-era phone UI) | resolution |
|---|---|
| Nav drawer rendered ~20 ICON-ONLY glyphs (a stale ≤860px "icon strip" block stripped every label) — unnavigable for a first-timer | block deleted; portrait replaced the drawer with the tab shell (§3b); the non-portrait drawer shows the full labelled rail |
| Tower Lab list rows overlapped their own portraits on phones | flex children compressed inside the height-capped list — `.tl2-item { flex: none }`; portrait turns the list into a specimen strip |
| Master-detail labs stranded the showcase below a 24-row column | horizontal roster strips above the showcase (§3b) |
| Strip columns widened the page past the viewport | grid columns hosting strips are `minmax(0, 1fr)` |
| In-run: top HUD consumed ~70% of the screen before the board; “press SPACE” copy; Start Wave floated mid-canvas; tray clipped off-screen | compact HUD grid + 42vh board + fixed bottom wave dock + touch copy (§3b) |
| Mulligan Lab was one console-length scroll before its primary job | `MobileSection` collapsible around the Nucleus console |
| Gate’s hand-written NAVS list had drifted (quests/season/hive/gearcodex never swept) | nav universe derived from `navModel.ts`; the first derived sweep caught a sub-24px Season checkbox |

## Machine enforcement (added with the mobile pass)

- **`npm run mobilecheck`** (also a `npm run validate` stage): §4d — registry-derived
  screen sweep, portrait tab-shell walk, combat-dock contract, plus the layout detectors
  (overflow / clipped text / sub-24px targets / unreachable interactives / popup fit).
  Drawer/tooltip "parked geometry" is exempt via the visibility pattern; scroll rails
  count as reachable.
- **`src/ui/navModel.test.ts`**: every `NavKey` lives in exactly one portrait tab; the
  bar stays five short-labelled tabs; every screen has an unlock-registry name/glyph/blurb
  (the index rows can never render mute).
- **Global floors** (`index.css` tail): ≤520px every interactive control gets
  `min-height: 24px` (WCAG 2.5.8); `body{overflow-x:hidden}`; tooltips clamp to the
  viewport; the wave banner clamps to `100vw` and every section shrinks/wraps.
- **Content caps** (`src/dev/mobileContent.test.ts`): names ≤26 chars, descriptions
  ≤240 across towers/heroes/enemies/cards/upgrades/biomes/megas — new content that
  would break a phone layout fails `npm test` the moment it's added.

Purchase accessibility: usePressRepeat handles non-pointer click activation once (keyboard/assistive detail=0); pointer activation already fires on pointerdown and must not be charged again on click. Call sites composing onClick must forward the hook callback. Hero upgrades retain their DOM button through purchase feedback.

Mobile gate drawer settling: the landscape walk waits for a closed drawer to lose its is-open class and reach computed visibility:hidden before auditing. Existing panel waits remain; all overflow/clipping/target assertions are unchanged. This avoids sampling a closing transition under browser load, and an unclosed drawer still times out.
