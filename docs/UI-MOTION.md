# UI-MOTION.md — The Motion Language

How the menus and chrome **feel** to use. This is a feel overhaul, not a layout
redesign: nothing here changes where things sit — it changes how they appear,
respond, and transition. One consistent motion vocabulary across the whole game
(Play · Tower Lab · Hero Lab · Genetic Vault · Collection · Profile · Settings,
and the in-run HUD), so every screen reads as one polished, commercial-quality
product.

> **Single source of truth:** the tokens live in `:root` (`src/index.css`).
> Every duration and curve below is a CSS variable — never hardcode a `ms` or a
> `cubic-bezier` in a component. Re-tuning the whole game's feel is a token edit.

---

## 1. Principles

1. **Nothing appears instantly.** Menus, panels, and overlays always animate
   *into place* (Rise / Pop / Slide). A hard cut reads as a bug, not a UI.
2. **Snappy, never sluggish.** Transitions live in **150–300ms**; press feedback
   is faster (~90ms). Anything slower makes navigation feel heavy — avoid it.
3. **Every input is acknowledged.** Hover *invites* (lift), press *confirms*
   (scale-down) — within a frame, so clicks feel tactile and responsive.
4. **One vocabulary.** The same six patterns and four durations everywhere. A
   tab switch in the Vault feels like a tab switch in the Profile.
5. **Decelerate in, accelerate out.** Things entering ease *out* (fast→settle);
   things leaving ease *in*. Movement between points eases *in-out*.
6. **Respect the user.** `prefers-reduced-motion` collapses every animation to a
   near-instant cross-fade (already enforced globally in `:root`'s media query).

---

## 2. Tokens

### Durations
| Token | Value | Use |
|---|---|---|
| `--dur-1` | **90ms** | press / micro state flips (the tactile "click") |
| `--dur-2` | **150ms** | hover, toggles, taps — quick acknowledgement |
| `--dur-3` | **220ms** | the **base**: screen/tab/panel enter, most transitions |
| `--dur-4` | **300ms** | emphasis ceiling: overlays, large reveals. Never exceed. |

`--t-fast` / `--t-med` are kept as back-compat aliases, **re-pointed** at the new
curves so existing transitions inherit the premium feel for free.

### Easing curves
| Token | Curve | Feel · Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | decelerate (quint). **Default** — enters, hovers, most everything. |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | accelerate. Exits / things leaving. |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | symmetric. Slides / moves between points. |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | slight overshoot. Reserved for *moments* (press-release pop, badges). Used sparingly — overshoot everywhere reads as wobble. |

---

## 3. Patterns (the named motions)

| Pattern | Motion | Tokens | Applied to |
|---|---|---|---|
| **Rise** | fade + `translateY(8px→0)` + `scale(.985→1)` | `--dur-3` · `--ease-out` | menu/tab content entering (`.hub-screen > *`), panels |
| **Pop** | fade + `scale(.96→1)` | `--dur-3` · `--ease-out` | overlays / modals (draft, confirm, results) |
| **Slide** | fade + `translateX(±12px→0)` | `--dur-3` · `--ease-in-out` | side panels / drawers (Inspector, Build) |
| **Press** | `scale(.96)` (+1px) | `--dur-1` | any button/`:active` — the tactile confirm |
| **Lift** | `translateY(-2px)` + soft glow | `--dur-2` · `--ease-out` | buttons/cards/nav `:hover` — the invitation |
| **Stagger** | children Rise with +40–60ms steps | `--dur-3` · `--ease-out` | card rows, list reveals (draft cards already do this) |

**Composition rule:** animate *one* level per transition. A tab switch Rises the
**screen content** (`.hub-screen > *`); the panels inside ride along rather than
each Rising separately — nested Rises double the motion and read as jank.

---

## 4. Where it lands

- **Navigation / tab switching** — the `.hub-screen` remounts on every nav change
  (`key={nav}`), so its content **Rises** in each time. The active `.hub-navitem`
  transitions its highlight; nav items **Lift** on hover, **Press** on click.
- **Menu open** (entering the hub, opening a screen) — Rise.
- **Menu close / overlays** — Pop in; the backdrop fades (`--dur-3`).
- **Buttons** — Lift on hover (−2px + shadow), Press on `:active` (`scale .96–.97`
  at `--dur-1`). The primary CTA gets a touch more glow.
- **Side panels** (in-run Inspector / Build) — Slide in from their edge.
- **Toggles** (`.set-switch`, Auto Wave/Gene) — color transition + Press.
- **Camera / battlefield** — the run already owns its motion (screen-shake trauma,
  the combat→build **Settle** beat in `config.SETTLE`); this overhaul leaves the
  sim's own feel intact and only governs the **chrome** around it.

---

## 5. Doing it right (gotchas)

- **Transform-only motion.** Animate `transform` + `opacity` (compositor-cheap);
  never animate layout props (width/height/top/left) — that janks *and* would be a
  layout change, which this overhaul forbids.
- **Enters, not exits.** React unmounts are instant; we invest in *enter*
  animations (the explicit ask — "menus never instantly appear"). A few exits
  that matter (the Settle before the draft) are handled in the sim, not here.
- **Input is never blocked.** Press feedback is immediate and transitions don't
  gate `pointer-events`; the click registers on `:active`, the animation is just
  the acknowledgement.
- **Reduced motion** is honored by the existing global media query — new keyframes
  and transitions collapse automatically; no per-rule opt-out needed.

Hero symbiote and tower preview canvases resolve device reduced motion plus the player override through resolveMotion and subscribe to changes. Hero CSS aura/pulse/orbit decorations have explicit still states. Offscreen/hidden preview loops stop; artwork and progression remain unchanged.

Tutorial Typewriter (ui/tutorial/primitives.tsx) now resolves state/prefs motion live, including Allow motion, and exposes a stable complete sentence separately from the aria-hidden visual reveal. Reduced motion finishes the current reveal; restoring motion preserves already-read content.

CutscenePlayer resolves motion/flashes live. Changing preferences preserves film timing; elapsed beats under reduced motion are not replayed when animation resumes. Reduced stills retain coda dimming and repaint on resize/scene/coda changes.

InitCutscene applies live resolved motion/flashes at the pre-roll gate and during playback. Reduced motion during an active dive ends the transition cleanly; normal dive duration and single completion remain unchanged. Restoring animation consumes past film beats without sound catch-up.

Story cutscenes suspend their visual clock and caption animations while hidden; auto scene/coda holds retain remaining visible time. On return the projector resumes without hidden-time sound catch-up. This does not alter global music settings.

Opening-cinematic visibility suspends gate/film/dive motion and caption CSS animations. Resume preserves scene hold and dive progress. Reduced motion requested during a hidden dive completes safely rather than waiting in a frozen transition.
