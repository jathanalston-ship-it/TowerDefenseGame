# PLAYTEST-CHECKLIST.md — Pre-Deployment Checklist

Run this **before every Cloudflare Pages deployment**. It verifies the build, the
save system, performance, cross-device behavior, and gameplay soundness. Copy the
checklist into your PR/notes and tick each box; **do not deploy with an unchecked
"Blocker."**

> **Testing aids built into the app:**
> - **Debug panel** — append `?debug` to the URL (or run `npm run dev`) to enable it;
>   use it to add currencies, spawn enemies/bosses, force cards, fast-forward time,
>   toggle god mode, and reset/seed saves. See `docs/` / the Debug section below.
> - **Save export/import** — Main Menu → **Saves** → Export/Import JSON, to snapshot a
>   state before destructive tests and restore it after.

Legend: **[B]** = Blocker (must pass to deploy) · **[M]** = Major · **[m]** = Minor/polish.

---

## A. Build & release sanity  *(automated — run locally or in CI)*

- [ ] **[B]** `npm ci` succeeds from a clean checkout (no `node_modules`).
- [ ] **[B]** `npm run typecheck` passes (tsc strict, 0 errors).
- [ ] **[B]** `npm test` passes (all Vitest suites green).
- [ ] **[B]** `npm run build` succeeds and writes `dist/`.
- [ ] **[B]** `dist/` contains `index.html`, `assets/`, **`_redirects`**, **`_headers`**.
- [ ] **[M]** `npm run preview` serves the build and the game loads at the preview URL.
- [ ] **[m]** Bundle size sanity: main JS gzip is in the expected range (~50–70 kB now);
      investigate large jumps.

---

## B. Save / load functionality

- [ ] **[B]** First-ever load (clear site data first) starts at a clean default save
      (0 shards, 0 runs, no errors in console).
- [ ] **[B]** Earning shards in a run and returning to the menu shows the updated total.
- [ ] **[B]** Reload the page (F5) → shards, best wave, run count, and upgrade levels
      **persist** exactly.
- [ ] **[B]** Buying a permanent upgrade persists across reload and applies to the next run.
- [ ] **[M]** Close the tab entirely and reopen the URL → save still present.
- [ ] **[M]** **Export** a save to JSON, **Reset** the save, then **Import** the JSON →
      state is fully restored.
- [ ] **[M]** Import a **hand-edited** JSON (e.g., change `shards`) → values load and the
      checksum is recomputed (no corruption error).
- [ ] **[M]** Import an **invalid/garbage** file → friendly error, **existing save is NOT
      destroyed**.
- [ ] **[M]** Corruption recovery: in DevTools, set the `assimilate.save` localStorage
      value to junk, reload → app recovers (restores newest valid backup, else clean
      default) **without crashing**.
- [ ] **[m]** Backups: trigger a backup, confirm it appears in the backup list and can be
      restored.

---

## C. Progression persistence

- [ ] **[B]** In-run state (towers, biomass, drafted cards) does **not** leak into the
      save (start a fresh run → no leftover towers/cards/biomass).
- [ ] **[B]** Meta upgrades visibly strengthen the next run (e.g., +Nucleus integrity
      shows a higher starting Integrity; +tower damage kills faster).
- [ ] **[M]** Best Wave only increases (never regresses) across runs.
- [ ] **[M]** Upgrade costs scale and "MAX" appears at the level cap; shards can't go
      negative.
- [ ] **[m]** "Lifetime Shards" and "Runs" counters increase monotonically.

---

## D. Error handling & resilience

- [ ] **[B]** Play a full run with the **Console open** → **zero** uncaught errors or
      red logs.
- [ ] **[B]** Lose a run (let the Nucleus fall) → Results screen shows, shards bank,
      Continue returns to menu cleanly.
- [ ] **[B]** Win a run (survive all 12 waves) → "EXTRACTION COMPLETE", rewards bank.
- [ ] **[M]** `localStorage` disabled / private mode: app still runs the session
      (saves fall back to in-memory; no crash). Test in a private window.
- [ ] **[M]** Rapidly spam tower placement / ability / Start Wave → no crash, no stuck
      state, biomass never goes negative.
- [ ] **[M]** Tab backgrounded for 30 s then refocused → sim resumes sanely (no huge
      time-jump; accumulator is clamped).
- [ ] **[m]** Resize the window mid-run → canvas/UI reflow without breaking input
      coordinates.

---

## E. Performance

- [ ] **[B]** Sustained **≥ 55 FPS** on a mid-range laptop during the heaviest wave
      (wave 11–12, many runners + brutes + pools + projectiles). Measure with DevTools
      → **Rendering → Frame Rendering Stats** or the Performance panel.
- [ ] **[M]** Use the debug panel **Time ×4** on a dense wave → no runaway slowdown or
      stutter spiral (fixed-timestep stays stable).
- [ ] **[M]** Spawn 100+ enemies via the debug panel → frame time degrades gracefully,
      no freeze.
- [ ] **[M]** No input lag: tower placement and the Apex Leap respond within a frame or
      two under load.
- [ ] **[m]** No layout thrash: HUD updates are throttled (numbers tick ~10×/s, not
      every frame).

---

## F. Memory usage

- [ ] **[B]** Play **5+ consecutive runs** without reloading → no unbounded memory
      growth. DevTools → **Memory → take heap snapshots** between runs; the trend
      should be flat (entities/projectiles/pools are pooled-or-released, not leaked).
- [ ] **[M]** After a run ends, returning to menu releases the Game (no retained
      detached canvas/Game instances across several runs — compare snapshots).
- [ ] **[M]** No listener leaks: the rAF loop is cancelled on unmount (navigate
      menu→run→menu repeatedly; CPU returns to idle in the menu).
- [ ] **[m]** Long idle on the menu does not grow memory.

---

## G. Desktop compatibility

Test the deployed **preview** URL (not just localhost):

- [ ] **[B]** **Chrome / Edge** (Chromium) — loads, plays, saves.
- [ ] **[M]** **Firefox** — loads, plays, saves; canvas + localStorage OK.
- [ ] **[M]** **Safari (macOS)** — loads, plays, saves; check canvas crispness and
      localStorage in this engine specifically.
- [ ] **[m]** Different zoom levels (90%/100%/125%) — UI and canvas remain usable.

---

## H. Mobile compatibility

- [ ] **[M]** **iOS Safari** — game loads; tap to place towers / start waves; the canvas
      fits the viewport; no horizontal scroll.
- [ ] **[M]** **Android Chrome** — same.
- [ ] **[M]** Touch input maps to the correct canvas coordinates (place a tower on a
      specific cell and confirm it lands there).
- [ ] **[M]** Right-click-equivalent (hero move) has a touch path, **or** is documented
      as desktop-only for the slice. *(Known slice limitation: hero re-anchor uses
      right-click — verify the game is still completable on touch without it, or flag
      it.)*
- [ ] **[m]** `localStorage` persists on mobile (note: iOS private mode and aggressive
      storage eviction can clear it).
- [ ] **[m]** Performance acceptable on a mid-range phone (≥ 30 FPS on heavy waves).

---

## I. UI scaling / responsive layout

- [ ] **[B]** Canvas scales to container width and stays 960×600 aspect (no stretch);
      internal click coordinates remain correct at any display size.
- [ ] **[M]** Narrow viewport (~375 px): HUD, toolbar, and draft cards wrap/stack without
      overlap or clipping; buttons remain tappable.
- [ ] **[M]** Wide viewport (≥ 1440 px): layout centers, max-width respected, no giant
      stretched canvas.
- [ ] **[M]** Draft modal: card text never overlaps (regression guard — this bit us once
      via inherited `line-height`).
- [ ] **[m]** Text remains legible; no clipped labels in HUD/toolbar at small sizes.

---

## J. Gameplay correctness smoke

- [ ] **[B]** Place each of the **3 towers**; each fires/behaves per its role (Needle
      single-target; Mortar arcs + leaves a pool; Reactor generates biomass + overcharges
      an adjacent tower).
- [ ] **[B]** **SHRED** reaction triggers when an enemy has both Fracture (Needle/Hero)
      and Corrosion (Mortar) — the "SHRED" popup appears.
- [ ] **[M]** Hero auto-engages, can be re-anchored, dies + respawns on a timer, and Apex
      Leap deals AoE on the targeted point.
- [ ] **[M]** Card draft appears after each wave; the chosen card's effect is visible in
      the run; cards are gone on the next run.
- [ ] **[M]** Reaching wave 12 spawns the Brood Tyrant; defeating the wave wins.
- [ ] **[m]** Determinism spot-check (optional): the sim test seed reproduces identical
      outcomes (already covered by `npm test`).

---

## K. Debug panel hygiene  *(must be safe for a public deploy)*

- [ ] **[B]** On the **production** deploy with a **normal** URL (no `?debug`), the debug
      panel is **NOT** visible.
- [ ] **[M]** `?debug` enables it on the preview for balancing; clearing the
      `assimilate.debug` flag (or the panel's "Disable debug") hides it again.
- [ ] **[m]** Debug actions never persist into a normal player's save unless explicitly
      used (e.g., adding shards writes to save by design — don't ship a save touched by
      debug as the default).

---

## Sign-off

- [ ] All **[B]** blockers checked.
- [ ] Tester / browser / device matrix noted: ______________________
- [ ] Build commit: ____________  ·  Date: ____________  ·  Tester: ____________

> Deploy = push to the production branch (`main`/your branch) → Cloudflare Pages builds
> and serves `dist/` automatically (`docs/DEPLOYMENT.md`).
