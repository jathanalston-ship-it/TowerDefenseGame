# RESPONSIVE-DESIGN.md — the multi-platform UI framework

> One codebase, one UI system: every screen adapts to desktop, ultrawide, 4K, Steam Deck,
> tablets, and phones through the primitives here — never through per-platform forks. This is
> a PERMANENT foundational capability: a new screen built with these patterns needs **zero
> additional responsive work**. Companion to `docs/UI_STYLE_GUIDE.md` (values) and
> `docs/DESIGN_LANGUAGE.md` (application; its new-screen checklist references this guide).

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

- **Hub** (menus): grid `216px 1fr`. Under 860px the rail becomes an off-canvas drawer
  (`.hub > .hub-nav` fixed + translate; veil closes it; the ☰ burger lives in the topbar;
  picking a destination closes it). Specificity note: shell overrides must match
  `.hub > .hub-nav` — a bare class loses to the base rule.
- **Run** (GameView): desktop = hud / [build | board | inspector] / tower rail. ≤900px the
  stage stacks (board first, panels become full-width strips — capped + scrollable, NEVER
  `display:none`: hiding functionality is a defect). ≤640px `.stage { display: contents }`
  promotes the pieces into one column so the order is hud → board → tower rail (snap chips)
  → build strip → inspector: building never needs a scroll. The Deck band drops the rail
  card blurbs to one row (board grew 268×357 → 452×603 on Deck).

## 4. Touch (every hover has a touch equivalent)

- **Tooltips**: `.tt` bubbles open on hover/focus AND on `.tt-open` — a single delegated
  App-level tap toggler (hover-less pointers only) serves every existing/future tooltip.
- **Tap targets**: `@media (pointer: coarse)` floors `button, select, [role=button], inputs`
  at 44px min-height with `touch-action: manipulation`. Non-button interactive elements MUST
  carry `role="button"` to inherit the floor.
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
