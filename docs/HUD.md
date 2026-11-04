# HUD.md — HUD Analysis & Redesign (desktop-first)

Layout + visual specs for the in-run HUD. Derives all colors/type/spacing from
`STYLE-GUIDE.md`. Grounded in the current build (`src/ui/Hud.tsx`,
`Toolbar.tsx`, `DraftModal.tsx`, `GameView.tsx`; data model = `HudSnapshot` in
`src/core/types.ts`). No code — layout specifications and visual recommendations.

---

## 0. SHIPPED — the premium phase-reactive HUD (2026-07)

The redesign below has been implemented and extended. The live combat HUD is now:

- **Phase-reactive skin** (`data-hphase` on `.hud` + the `.game` shell): BUILD = calm green,
  Biomass primary, Start Wave focal; COMBAT = heated accents, glowing wave module, Pressure
  emphasized, Biomass softened; DANGER rides the committed emergency state (docs/CAMERA.md).
  The board frame tints with the phase.
- **Three aligned zones** (`.hz-l/.hz-c/.hz-r`): LEFT survival (Hive integrity + slim loot
  progress) · CENTER the WAVE MODULE (eyebrow phase label, the big wave number + pips, status
  line, biome/boss/modifier chips, emergency/biome/run-event banners) · RIGHT power → biomass →
  pressure → hero. On the phone profiles the zones dissolve (`display: contents`) into the
  profile's HUD grid (§layout).
- **Power cell** = the progression number: magnitude-tier accents (K/M/B/T hues), ambient conic
  border sweep, and a GAIN CELEBRATION (+Δ fly-up, scale pulse, 6-dot burst, throttled `power`
  chime) on every live increase.
- **Glass depth system**: every cell is layered gradient + inner highlight + hover lift/glow;
  cells stagger-ease in on mount.
- **Tower cards**: hover lift + sheen sweep, mastery ring (conic, capped 99), star-tier pips,
  DPS + deployed-count chips, affordable-pulse edge.
- **Start Wave focal** + full-board energy sweep on launch; the briefing header carries the
  encounter forecast (Σ bounty Biomass + ELITES/BOSS INBOUND warnings).
- **HERO OPS** right-panel default: breathing portrait, conic ability wheel, HP + shield,
  rarity-lit equipment slots, evolution chip, compact run stats.
- **Left panel**: collapsible Gene Cards / Active Effects + an OBJECTIVES section.

### §0b — the 2026-07 HUD OVERHAUL (triple-A pass: organs, belt, vessel)

A second full pass on the modules that still read flat. Everything is CSS-layer motion
(background-position / transform / opacity — no reflow, reduced-motion collapses all loops);
every class name, `data-tut` anchor, and the portrait grid contract are unchanged.

- **Carved bio-glass cells**: accent-tinged corner light + top facet + deep floor; the accent
  is a breathing gradient VEIN along the cell floor with a glowing label dot; value numerals
  carry depth shadows. The bar itself wears a phase-lit top FILAMENT.
- **Hive Core = the Heart organ**: membrane-walled vessel, plasma drift inside the fill, a lit
  meniscus at the leading edge, membrane-rib segments — on top of the existing siege ghost /
  critical heartbeat states.
- **Bio-Container meter = the Incubation vessel**: 11px glass tube, rarity-colored culture
  fluid with drifting bubbles + charge shimmer, organic blob SOCKET that idle-floats and pops
  on completion, fill-% on the shoulder, near-full agitation; the cell's chrome inherits the
  incubating rarity (`--hud-acc`).
- **Biomorph Conveyor = a real belt**: recessed machine channel with a scrolling TREAD and a
  breathing feed-mouth; pods are vat-lit specimen glass (tower-color from below, lid line that
  lights at ready) that SLIDE IN from the feed side and settle (the same animation replays at
  grow→ready — a completion pop for free); growth is amniotic fluid with a floating countdown;
  pod controls are real keys (tower-color DEPLOY, gold gift-key with rolling sheen, gold
  STRAIN splice, ghost recycler) with press-scale and coarse-pointer 32px floors. The old
  Strain-era `.cv-deploy.is-free` gold-TEXT rule was removed — gold-on-gold was the historical
  unreadable-label bug.
- **Wave module**: 34px wave numeral with phase glow; capsule pips (lit cores, breathing
  current); faceted chips.
- **Toolbar deck**: same glass family; tower cards get class-colored corner bloom, hover lift,
  press, and an affordable-BREATHING class edge (`.tcard.is-ready`); the hero disc breathes;
  the ability key wears a live conic COOLDOWN RING (`--cd`, set by the Toolbar from
  `hero.abilityCd / def.ability.cooldown`) that yields to a ready-glow.
- **Start Wave = the command key**: layered energy core + rolling charge-sheen + halo ring +
  landing press — desktop briefing bar and the portrait dock share it.

### §layout — RUN LAYOUT v2: the board is the game (2026-11)

The run screen now sizes every piece of chrome AROUND a maximal 3:4 battlefield, per layout
profile (`src/index.css` §RUN LAYOUT v2; profiles in docs/RESPONSIVE-DESIGN.md §run):

- **Desktop**: ONE fixed-height HUD row (62px — the wave module is a 2-column grid: big number
  left, phase · status line · chips stacked beside it; the Hive Core siege readout and the
  Biomass income ride their cell's label/value rows; the emergency alarm takes the status line)
  and a FIXED-height tower deck (88px; 116px with card blurbs above 1000px of height). Fixed
  heights mean nothing that arrives mid-run (pods, siege, emergency) can resize the board.
  Measured board: 1440×900 440×587 → 543×724 · 1366×768 374×499 → 444×592 · 1920×1080
  575×767 → 657×876 · 1024×768 368×490 → 444×592.
- **§run-controls strip**: speed (1×/2×/5×) · ◈ HIVE INTELLIGENCE · Pause live in ONE flex row
  (`.run-ctl`) reserved at the top of the board; the Hive ticker and the speed note ride its
  free left end as a two-line log. The wave briefing and the boss/mega bars start BELOW the
  strip (`--strip`), so they can never collide again (the pill used to sit on Start Wave and
  the boss bar; the ticker covered the briefing). A burrowed Mega waits mid-board during prep.
  Mid-wave the strip also carries **⏩ Call early +N** (docs/EARLY-CALL.md) — the Start Wave
  control's in-fight form, Biomass-green, at the LEFT of the right-anchored cluster so its
  arrival never shifts speed/Hive/Pause; Space triggers it too. The wave briefing gains a
  `▲ ADAPTED ×N` / `▲ SQUEEZED ×N` chip when the next wave launches tougher (docs/DIFFICULTY_DIRECTOR.md
  §6a, docs/ENDLESS-SCALING.md §squeeze) — on phones it rides the briefing's scrollable row with
  the forecast and ELITES chips.
- **Phones** (portrait + landscape): the side panels are overlay DRAWERS (tap-to-close veil;
  the Inspector also opens itself for a tapped tower and for a tutorial cue that points at
  it), the run keys go compact (◈ HIVE · speed · ❚❚, ≥40px), and the draft, pause card and
  Hero Console go full-screen. See docs/RESPONSIVE-DESIGN.md §run for the two phone grids.

The sections below are the original analysis/spec that led here — kept as design rationale.

---

## 1. Current HUD — analysis

**What exists today:**
- **Top bar:** one flat strip — `BIOMASS · INTEGRITY · WAVE · KILLS · ENEMIES · HERO · PHASE`. All stats the same size/weight; no hierarchy.
- **Bottom toolbar:** 3 tower buttons + Apex Leap + Start Wave.
- **Draft modal:** centered overlay (1-of-3).
- The **portrait arena** is centered with **empty letterbox gutters left & right** (from `index.css` `max-height:74vh`).

**Problems:**
1. **No visual hierarchy** — Integrity (life-or-death) reads the same as Kills (vanity).
2. **Wasted space** — the side gutters are empty; all info is crammed top/bottom.
3. **Nowhere for the systems we've designed** — cards (`CARDS.md`), mutations/strains, active buffs, tower/hero detail, and the prestige currencies (`ECONOMY.md`) have no home.
4. **Flat styling** — uniform panels, no grouping, no state language (affordable/selected/cooldown read weakly).
5. **`PHASE` as raw text** is programmer-facing, not player-facing.

**Opportunity:** the centered portrait arena *wants* a 4-region frame — top/bottom
bars full-width, **left/right panels in the gutters**. This is the desktop layout.

---

## 2. Layout system

Desktop-first, 16-col frame around the centered canvas. Target 1920×1080; scales to
≥1280 wide.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TOP BAR  (full width, h 56px)                                              │
│  [HIVE CORE ▓▓▓▓▓░ 78/100] [WAVE 6/12 ▮▮▮] [◇Biomass ◆Genome ✦Essence] [Ω…]│
├───────────────┬──────────────────────────────────┬─────────────────────────┤
│ LEFT PANEL    │                                  │ RIGHT PANEL             │
│ (gutter,      │                                  │ (gutter, w 300px)       │
│  w 280px)     │        BATTLEFIELD CANVAS        │                         │
│               │        (portrait, centered,      │  ▸ contextual:          │
│ ▸ CARDS       │         max-height ~74vh)        │    Tower / Hero /       │
│ ▸ MUTATIONS   │                                  │    Upgrade details      │
│ ▸ ACTIVE BUFFS│                                  │                         │
│               │                                  │                         │
├───────────────┴──────────────────────────────────┴─────────────────────────┤
│ BOTTOM BAR (full width, h 96px)                                            │
│  [Tower cards ▭▭▭▭▭] ……… [HERO portrait+HP+cooldowns] ……… [active effects]  │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Grid:** 12px base unit; panel padding 16px; gaps 12px; radius 12px (panels) / 8px (controls), per STYLE-GUIDE.
- **Z-order:** canvas (0) < panels (10) < draft/modals (100) < tooltips (200).
- **Panel surface:** `--panel` fill, `--line` 1px border, subtle top inner-highlight (1px `rgba(255,255,255,0.04)`) for a "machined glass" edge. 8px outer drop-shadow on raised panels.
- **Responsive:** <1500px → right/left panels narrow to 240px; <1280px → panels collapse to icon-rail + hover-expand; the canvas never shrinks below readable.
- **Idle collapse:** Left/Right panels fade to 60% opacity when not hovered/relevant, so the battlefield stays the star (toggleable; respects reduce-motion).

---

## 3. TOP BAR — survival & economy (h 56px)

Three weight tiers: **vital (largest) → progress → economy**.

| Slot | Widget | Spec |
|---|---|---|
| Far-left | **HIVE CORE (Integrity)** | The most important readout. Label "HIVE CORE" 11px muted; a **segmented health bar** (12 segments) 200px wide + numeric `78/100` 24px/800 tabular. Bar fills `--danger` ramp: green→amber→red by %. Pulses + a soft red bloom on the whole bar when hit. |
| Left-center | **WAVE** | "WAVE 6/12" 18px; a **mini pip track** of the 12 waves (cleared = filled, current = pulsing, boss wave = ★). Doubles as run progress. |
| Center | **Run timer / phase** | Subtle. "PREP" / "WAVE" / "DRAFT" as a small state chip, not raw text; countdown to next wave during prep. |
| Right | **Resources** | Currency chips, each = colored glyph + tabular value (colors per STYLE-GUIDE §5): ◆ Biomass (lime, in-run, biggest), then earned-this-run meta (Genome ◇ cyan, Essence ✦ gold). "+N" floats on gain. |
| Far-right | **Prestige currencies** | A compact **Ω cluster** (collapsed by default to a single Ω chip; hover/expand shows Cells/Threads/Cores… per `ECONOMY.md`). Present even at 0 (greyed) so the progression ceiling is visible from day one. |

**Hierarchy:** Integrity bar is ~2× the visual weight of anything else. Economy
chips are small and right-aligned (glanceable, not dominant).

---

## 4. BOTTOM BAR — actions (h 96px)

Three groups, left→right: **build · hero · effects**.

| Group | Widget | Spec |
|---|---|---|
| **Tower selection** (left) | **Tower cards** | One card per available tower (currently 3; designed for the 3-of-5 loadout). Each: class-tinted left edge (STYLE-GUIDE class hue), tower glyph (matches its battlefield silhouette — see `PLACEHOLDER-ART.md`), name, **cost chip** that turns `--success` when affordable / `--danger` when not, and a hotkey (1–5). Selected = gold border + raised. Hover → RIGHT PANEL shows full stats. |
| **Hero** (center) | **Hero pod** | Portrait disc in the hero's class hue + gold ring; **HP arc** around it; **ability buttons** with radial cooldown sweeps (Apex Leap now, more later); a downed state shows the respawn countdown over a desaturated portrait. Built to hold **hero slots 2 & 3** as additional pods. |
| **Active effects** (right) | **Buff strip** | Row of small icons for run-wide active effects (overcharge active, current Mutation Strain, temporary corruptions). Distinct from the LEFT-panel card *list* — this is the *currently-pulsing* status rail. |

---

## 5. RIGHT PANEL — inspector (w 300px, contextual)

One panel, three contexts (whichever is selected/hovered):

- **Tower info** (hover a tower card or a placed tower): name + class badge, live DPS/range/fire-rate, **★ star track (1–10)**, mastery rank ring, class-keystone chips, and the in-run upgrade path with costs. Range previews on the battlefield in sync (already drawn by `drawPointer`).
- **Hero info** (select the hero pod): kit (abilities + cooldowns), **★ stars**, mastery, class, and **equipment slots (Weapon/Armor/Relic)** — present as empty sockets now so `EQUIPMENT.md` drops in later.
- **Upgrade details** (select an upgrade/star node): before→after stat deltas (green ↑), cost in the correct currency color, and a one-line flavor blurb.

**Empty state:** when nothing is selected, show a compact **"Hive Status"** digest
(towers built, kills, biomass/sec, swarm pressure) so the panel is never dead space.

---

## 6. LEFT PANEL — run build (w 280px)

The *temporary* run identity (everything here resets each run — mirrors
`CARDS.md`/`DESIGN.md`):

- **Current cards:** the drafted deck this run, grouped by category (Poison/Crits/…) with category-colored chips and **stack counts**. Scrollable; newest pulses briefly.
- **Mutations:** the active **Mutation Strain(s)** with their evolution tier, and any voluntary **Corruptions** taken (red-tinted, with their reward multiplier).
- **Active buffs:** persistent run multipliers in plain language ("+38% tower damage", "biomass ×1.5") — the readable rollup of the cards above, so the player sees *what their build actually does*.

**Why left vs right:** LEFT = *what I've built this run* (cards/mutations/buffs,
persistent, browseable). RIGHT = *what I'm inspecting right now* (contextual,
transient). Stable spatial memory.

---

## 7. Visual hierarchy & density rules

1. **Three type tiers only** on the HUD: vital values (24px/800), labels (11px/600 muted), body (13px). (STYLE-GUIDE §9.)
2. **Color = meaning, sparingly.** Panels are neutral; the only saturated color in the chrome is **state** (affordable/selected/danger) and **currency/class identity**. No decorative color.
3. **Group by spatial law:** survival top, actions bottom, build left, inspect right — learned once, never relearned.
4. **Density:** top/bottom bars are glance-level (≤7 elements each, per Miller's law); deep detail lives in the side panels on demand.
5. **Motion is feedback only:** pulses on damage/gain/affordability change; otherwise still. Respects reduce-motion.
6. **Tooltips** (200ms hover) carry the long tail so primary widgets stay terse.

---

## 8. Built for future progression

| Future system | Where it lands (no relayout) |
|---|---|
| Prestige currencies (6 layers) | TOP-right Ω cluster (already reserved) |
| Hero slots 2 & 3 | BOTTOM-center: +2 hero pods |
| 3-of-5 tower loadout (+ more towers) | BOTTOM-left: card row already a list |
| Stars / Mastery / Class / Paragon | RIGHT panel inspector tracks |
| Equipment (W/A/R) | RIGHT panel hero sockets (stubbed now) |
| Hive Tree / meta shop | a TOP-bar "HIVE" button → full-screen overlay (out-of-run) |
| Endless/Omega depth | WAVE widget extends past 12 → "∞ / depth N" |

The four-region frame is the contract: every system designed in the corpus has a
predetermined home, so live-service additions slot in without a HUD rewrite.

---

## 9. Draft modal (refresh, not redesign)

Keep the centered 1-of-3 (it's good), but: dim+blur the battlefield behind it,
rarity-frame each card per STYLE-GUIDE §5 (Exotic prismatic), show category color +
stack-if-owned, and add reroll/banish affordances (per `CARDS.md`) as the card pool
grows.


## §speed — the Gameplay Speed system (2026-07)

1×/2×/5× chips beside Pause in the run-controls strip (§layout; F cycles; 44px-tall, 40px-wide
targets under coarse pointers). Speed scales the
SIMULATION, not animations: `game.timeScale` runs MORE fixed `SIM_DT` steps per real frame,
so enemies/towers/heroes/projectiles/status/waves/timers all advance together and the sim is
**byte-identical at any speed** (same step sequence, faster wall clock) — no desync class of
bug exists by construction; Power/Mastery accrue identically.

AUTO-SLOW (once per run each): the FINAL Campaign/Stage wave beginning, or reaching ~95% of
your Infinite record (best ≥ 12), pulls the throttle back to 1× and posts an explanatory
notice ("Final wave — speed returned to 1×…"). Acknowledge with OK; the chips stay free to
re-raise immediately. Controller support rides the same button group (documented seam).
