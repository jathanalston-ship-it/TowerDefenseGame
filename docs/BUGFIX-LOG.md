# BUGFIX-LOG.md — Bugs found & fixed

One row per fix: **symptom → root cause → fix**. Plus a record of the comprehensive
bug-hunt pass (scope, method, verdict) so "we looked" is auditable.

---

## Fixes

| # | Symptom | Root cause | Fix |
|---|---|---|---|
| 1 | A wave could never end — enemies that breached the line lingered and the run hung. | `deathSystem` only evicted hp-deaths; enemies set `alive=false` by `hitNucleus` (breach) were never removed from `this.enemies`, so `checkWaveEnd` (which needs `enemies.length === 0`) never fired. | Evict **all** non-alive enemies each tick (swap-remove on `!e.alive`), not just hp-deaths. |
| 2 | Damage-number floats / hit-flash could strobe every tick on enemies standing in Corrosion pools. | The aggregated-damage + hit-flash hooks fired on *all* `applyDamage`, including continuous DoT. | `applyDamage(..., flash=false)` for DoT (corrosion tick, pools); the white flash only pops on discrete hits. |
| 3 | Green artillery (Acid Spitter / Siege Maw) sniped the Nucleus from the spawn edge, far outside any defensible range (seen ~endless waves 2–4). | The siege gate compared `goalDistanceAt` — a **cell-unit** path cost (max ~23 on the grid) — against `siege.range` in **pixels** (180–220), so the condition was ~always true: they shelled from the moment they spawned and never advanced. | Replace the gate with a Y-position **standoff**: artillery advances to at least 2/3 down the lane (`max(HEIGHT·2/3, DEFENSE_TOP_Y − siege.range)`) before halting to bombard, so it commits into tower range. Regression test: `artillery.test.ts`. |
| 4 | Tower placement felt off — clicking the **left half of a build pad** missed, and the click target sat half a cell right of where each pad was drawn (placement grid not aligned to the Hive-Core-centred visuals). | `slotAt` floored the click to a grid **cell** (`colOf`/`rowOf`), but pads are drawn on the symmetric 80px lattice **on grid lines** (`x = 40,120,…,680`). Cell-flooring biased every hit +20px right (cell centre vs pad centre) and dropped each pad's left half; the hit lattice centred on x=380, not the core's x=360. | `slotAt` now snaps to the **nearest pad within `SLOT_HIT_RADIUS`** (≈28px) instead of cell-flooring — the clickable target is centred on each pad and mirror-symmetric about the core. Visuals/geometry unchanged (already symmetric; verified by pixel analysis). Regression tests in `slots.test.ts` (centre/edge hits, mirror symmetry, no over-snap). |
| 5 | The loot-box **reward summary flashed up and vanished instantly** — the player had no time to read what they pulled, and there was no way to dismiss it on their own terms. | Control-flow bug, not a timing one. `LootReveal` fired its single `onDone` callback the moment the reveal cascade completed (`done === true`), and `GeneticVault` wired `onDone` straight to `setOpening(null)`, which **unmounts the whole ceremony**. So "animation finished" was bound directly to "close the modal" — the summary was destroyed on the same frame it finished animating in. No tunable duration could fix it. | Dismissal is now **explicit & player-driven**: dropped the auto-fire effect (`done` only unlocks an action footer), replaced `onDone` with `onClose` (**Return** / **Continue**), added `onOpenMore` (**Open More (N left)** — cracks the next container in place) and a pre-reveal **Review Rewards** skip-to-list. `GeneticVault` keys the reveal per crack so "Open More" remounts & replays. The summary persists until the player acts. |
| 6 | The in-run branch-commit confirmation ("Splice the … strain?") rendered **warped + half cut-off, confined to the sidebar** instead of as a centered screen pop-up. | The overlay is `position: fixed; inset: 0`, but it was rendered **inside** the `.inspector` sidebar. The in-game layout has transformed/animated ancestors (`.side-panel.inspector` slide animation; `.canvas-wrap` transform), and a transformed/filtered ancestor becomes the **containing block** for `position: fixed` — so the overlay sized/positioned against the narrow sidebar, not the viewport. | Render the overlay through a React **portal to `document.body`** (`createPortal`), escaping the transformed ancestors so `fixed` resolves against the viewport — a true full-screen, centered modal. Verified live: overlay spans the full viewport (1280/1280px); card centered (cx 640 of 1280). |
| 7 | The Pause overlay's giant `PAUSED` title **overlapped the buttons beneath it** (Resume, and the new Abandon Run warning), garbling the menu. | `.pause-title` had no `line-height`, so its single-line box was shorter than the 76px glyphs — the descending glyphs overflowed past the box bottom and the flex `gap` measured from the (too-short) box, letting the next item ride up into the letters. | Give `.pause-title` `line-height: 1.1` + `margin: 0` and cap the size (`clamp(40px, 8vw, 60px)`) so the glyphs sit inside the box and the flex gap clears them. Verified live: Resume / Abandon / confirm-warning all sit cleanly below the title. |
| 8 | The Genetic Vault **advertised "5 pulls" but the reward summary showed only 3 rows** — the header count and the visible rewards disagreed, so a container felt like it ate drops. | Display bug, not a generation one. `rollChest` correctly produced one reward per roll, but `LootReveal.summarize()` **merged duplicate pulls before rendering** while the header still printed the raw roll count — so N pulls collapsed to <N rows against an "N pulls" label. Merging is right for a *summary*, but it was applied to the *whole* reveal. | Split the two concerns in a pure read-model (`state/vaultReveal.buildReveal`): a **`pulls[]`** list that is one-per-raw-roll (never collapsed — drives the cinematic "Pull 2/5" one-by-one reveal, so the shown count *always* equals the rolled count) and a **`sections[]`** summary that is the *only* place duplicates merge (into a "×N" row with the summed total). Redesigned reveal (`ui/VaultReveal`, portaled fullscreen so nothing clips) renders both. Read-model pinned by `vaultReveal.test.ts`; both modes verified headless. |
| 9 | The container reveal showed **backwards/mirrored text** and the per-pull reward **never appeared** when a card was clicked/flipped — the player only learned the drops from the end summary. | The 3D flip card relied on `backface-visibility: hidden` to cull the back face, but on faces that are **clipped** (`overflow: hidden` + `border-radius`) that culling is unreliable in Chromium: the back rendered **mirrored on top of** the front, so the reward face was never visible ("INERT" → "ТЯƎИI"). | Drive which face shows by the flip **STATE (opacity)**, not GPU backface-culling: `.vreveal-card.is-flipped` fades the back to 0 / front to 1, swapped at the flip's edge-on midpoint (delay ≈0.29s of the 0.7s rotation; instant under reduced-motion). Removed the `backface-visibility` reliance. Also `key={i}` the card so each pull **deals in fresh face-down** (clean forward flip, no reverse-flip). Verified headless: auto-flip, click-to-reveal, and all 5 pulls render readable fronts, zero console errors. |
| 10 | The HUD **Loot meter stayed pinned at 100%** once a bio-container completed — it never visibly reset and the fill animation looked wrong, while the backend kept working (toasts fired, the Vault banked containers). | A completion set `popping=true` and armed a 620 ms un-pop timeout **inside a `[frontId, progress]` effect** — but the HUD banks progress every 80 ms, so the very next tick re-ran the effect and its **cleanup cancelled the timeout**: `popping` latched true and the bar rendered a **faked full width** (`popping ? 100% : pct`) indefinitely. Even when it did release, the CSS width transition animated 100% → the new value as a slow *backward drain*, not a reset. | The width now ALWAYS renders the backend fraction — completions celebrate via **overlays only** (rarity flash, container flight from the toast rail, delayed chest pop + 8-ray burst + subtle cell shake), and the fill element **remounts on completion** (`key=cycle`) so the next box starts at its true small width with no backward transition. The celebration clear-timer lives in a **ref** (progress re-runs can't cancel it). Backend self-heal: an OWED front (progress ≥ cost — legacy/tampered saves) awards even with 0 new points. Invariant stress-pinned (5 000 fills) in `lootQueue.test.ts`; contract in `LOOTBOX.md` §meter. |
| 11 | Campaign stage 1 unclearable even at 1700/1000 recommended power (user report); mid stages wiped at ×1.0 of recommended. | Threat cost was linear in raw HP (a slow 280-hp regenerating apex ≈ 12 mites — but vs a 2-tower opening build one apex = a guaranteed −22 leak); wave-1 budgets crept with stage while the in-run economy resets each stage; mini-bosses (incl. summoners) could spawn at wave 3 of stage 1; elites rolled on 2-tower opening waves; leak damage scaled 1.05^stage against never-growing integrity; hpGrowth (0.07) outpaced the √(hp×dmg) recommended-power index (~1%/stage TTK drift). | EHP-based speed-aware threat cost (hp + 12·regen + 6·armor + shield); per-wave unit/leak-damage caps + elite-frequency ramp on wave progress; wave-1 anchored at a constant ~11 budget; mini-bosses gated to stage ≥ 4; dmgGrowth → 0 (leaks are unit properties); recommendedPower = hpMult × biome ratchet (TTK stage-invariant at ×1.0 by construction). Probe-verified stages 1–24 (DIFFICULTY.md §contract). |
| 12 | Mobile tutorial was incompletable — the battlefield rendered as a ~140px clipped strip, so the scripted “place your tower” slot was invisible/untappable; the run screen also read as a wall of stacked panels. | On ≤640px the run column promotes `.stage`’s children (`display: contents`), but `.canvas-wrap` kept the desktop stage rule `flex: 1 1 auto` — the over-tall fixed-height (`100dvh`) column flex-SHRANK the wrap to the leftover ~140px and its `overflow: hidden` clipped the 501px board to a strip. | Phone block: `.stage .canvas-wrap { flex: none }` — the board keeps its intrinsic (≤56vh-capped) footprint and the column scrolls as designed. Tutorial declutter on phones: hide `.wb-tutlock` + `.wm-chips` under `.tut-runner` (the lesson callout carries the message). Verified end-to-end headlessly at 390×844 touch: all 10 combat-tutorial checkpoints completed → hub, `tutorial.completed=['combat']`. |
| 13 | Mega-boss raids stalled (user report, seen on Voraxis but system-wide): most towers never hit weak points, NOTHING attacked the boss once the field was clear, Siphons idled all fight, and heroes stood at their anchors. | Four defects, one root: **the raid geometry was authored for a board that doesn't exist.** Organs descended to y 430–550 and the body-chip band sat at y 300, but tower pads start at y 740 — the band was unreachable by every tower in the game (nearest pad 440px away vs 430px max range) and organs only by the two longest-range guns, while the validator's `minWeakPointY: 380` floor codified the miscalibration. On top: beam towers branch before `towerMegaFire`, so the Siphon had NO mega path at all and the Coil lacked the body-chip leg; and heroes required already standing within ~140px of an organ (they never moved toward one). | Geometry recalibrated to the real slot grid: organ descent band `minWeakPointY 560 / maxWeakPointY 700` (validator enforces both bounds), `bodyBandY 580` (160px above the front row — even the 170-range maul connects), all 7 megas' organs shifted +130 into the band. Siphon beam gains organ-tether + body-drain legs; Coil gains the body-chip leg; both feed the ADAPT `dmgByKind` ledger. New `heroMegaRaid` duty: with the line clear, heroes MARCH on the nearest open organ, strike it, and fall to the body when every window is spent. Regression: megaboss.test.ts 'EVERY damage source joins the raid'. |
| 14 | Campaign stage 10 (the first mega stage) was unwinnable even at ×3 the recommended power — the Hive died in ~40s of wave 1 while towers had a raid boss on the field (found by the extended difficulty-contract probe, 2026-07). | Weak-point priority is ABSOLUTE in the raid-fire seams, and long guns (needle 700 / mortar 960) reach the descended organs from any pad — so a sparse early board TUNNELED the mega's phase-entry organ while the wave walked into an undefended Core. The organ-priority design assumed a full mid-raid board. | Hive-guardian override (`game.ts megaRaidYield`, derived once per tick): while the Core is threatened — attackers locked on, or any enemy inside the final-defense zone (y ≥ FINAL_DEFENSE_TOP_Y) — `towerMegaFire` and both beam raid legs yield to normal enemy targeting; organ focus resumes when the threat clears. Stage 10 flipped 0/3 → 3/3 at ×1.5; regression pinned in megaboss.test.ts ('the Hive outranks the raid'). Campaign mega stages also display an honest raid-premium bar (`C.megaStagePremium`). |

| 15 | A live Parasite Nest "animates and becomes larger and larger until it fills the whole screen" (user report; reproduced once headlessly — the arena flooded solid `#e24dff`). | Pixel forensics (colorkey shape-match on the flood frame) proved the paint was `towerForms.nest` running at ~75× its base radius from `drawTower`'s body-radius product. Five of the six factors are hard-clamped; the two data-driven ones (`starEvolutionGrowth`, `evolutionGrowth`) were **linear in unclamped inputs** (raw `save.towerStars`, branch tier) with their documented maxima (★10, T5) enforced nowhere — and the composed product had no ceiling at all. The precise in-field trigger is context-gated (did not recur across ~20 instrumented parasite runs) and remains under watch. | Defense in depth at the render boundary: `starEvolutionGrowth` clamps stars to the ★10 contract, `evolutionGrowth` clamps tier to T5, and `drawTower` hard-ceilings the composed body radius at 2.2× base (`!(r <= cap)` form also catches NaN) — every designed look is below 2×, so nothing legitimate changes and a screen-filling body is now impossible by construction. A DEV-only canary logs every factor whenever the raw product ever escapes again, so the root trigger names itself on next occurrence. Regressions pinned in starEvolution.test.ts + towerEvolution.test.ts. |
| 16 | Row 15's flood RECURRED (user report + repro): a placed Parasite Nest enlarges at wave begin and grows until it covers the screen; Needle towers briefly swell ~2-3× at wave start and snap back on their first shot. | Row 15's ceiling guarded the wrong door. The projectile fire path ticks `t.cooldown -= dt` EVERY tick and resets it only `if (acted)` (game.ts ~4059/4138) — a tower that CANNOT act (a nest during a raid lull / STUNNED boss with an empty lane; any tower between spawn clusters) drifts its cooldown arbitrarily far below zero. The renderer's ATTACK-ANTICIPATION wind-up fed that raw cooldown into `(1 - cd/(0.3·fi))²` and applied it as a WHOLE-BODY `ctx.scale` — which sits OUTSIDE drawTower's 2.2× body-radius ceiling, so neither the clamp nor its canary ever saw it. Measured on the real towerSystem: 60s of no-prey drift → cd −59.9 → nest scale ≈ ×2,785 (needle ≈ ×12,516, reset by its first shot — the reported "brief 2-3×" is frames of that ramp). | `attackAnticipation(cooldown, fireInterval)` (render/towerForms.ts, beside FORM_ANTICIPATION) is [0..1] BY CONSTRUCTION — a past-due cooldown means exactly "fully wound up" (1), never more; NaN/support intervals → 0. The renderer consumes it instead of the inline ratio; the only other cooldown consumer (`fresh`) was already clamped. The sim is deliberately UNTOUCHED (cooldown drift is sim-harmless, and any tick change would break golden pins + arena lockstep replay). Regressions pinned in renderer.test.ts (negative/huge-negative/NaN cooldowns). |
| 17 | Hero HP read 359/248 after a Hive Intelligence Vitality buy. | `heroHp` cards (Battle Stims, Thick Hide) add flat max HP, but `buyHeroEvolution` recomputed max as base × gear × Vitality and dropped it; current HP was never capped. | `heroMaxHpFor` adds a per-hero `heroFlatMaxHp` filled by the card path; the recompute caps current HP. Test: `heroEvoGame.test.ts`. |
| 18 | A full-health hero read "249/248". | Snapshot HP rounded up, max rounded to nearest. | `Hud.tsx` + `Inspector.tsx` round the max up too. |
| 19 | Speed pill sat on ▶ Start Wave / the boss bar; the Hive ticker covered the wave briefing. | Each control had its own fixed absolute offset. | One `.run-ctl` flex row (speed · Hive · Pause · ticker) at the top of the board; briefing and boss bars start below it (docs/HUD.md). |
| 20 | 844×390 landscape: a 164×218 board in a scrolling page; portrait phones were gated behind "turn your device". | The stacked desktop layout was reused on phones. | Run layout v2: dedicated portrait + landscape grids with drawers; the rotate gate stands down during a run (docs/RESPONSIVE-DESIGN.md). |
| 21 | The board resized whenever towers arrived on or left the deck. | The tower bar grew with its contents. | Fixed chrome heights on desktop (62px HUD row, fixed-height deck). |
| 22 | A second identical reward card appeared after the HUD tour, and skipping the tour silently forfeited it. | The tour paid its own `hudtour` ledger. | `meta.grantOnboardingRewards()` pays both ledgers as ONE graduation; the tour pays nothing (docs/TUTORIAL.md §graduation). |
| 23 | Tutorial callouts covered the lane mid-wave, the middle draft card, and the build slots they asked you to tap. | Bubbles were centred or anchored with no knowledge of the board. | `callout.avoid` cue re-seats the bubble beside `canvas.board` (measured + clamped); the draft lesson anchors below the cards. |
| 24 | The ability arrow pointed at the tutorial's Pause; clicking Apex Leap at 1366×768 paused the tutorial. | Arrow targeted the ability pod centre; Pause/Skip were pinned bottom-right on top of it. | Arrow targets `.ability-btn`; Pause/Skip take a measured seat clear of ability, board, bubble and arrow. |
| 25 | The tutorial HUD showed "/12", a Brood Tyrant boss and a Mutagen Vault objective; the wave counter went 2→1. | HUD read the stage snapshot; the draft opened from the build phase after the counter advanced. | Read-model-only `game.tutorialWaves`; the draft deals during wave 1's settle beat. |
| 26 | Commissioning's SAFEGUARD step offered two guest buttons. | Session-only Guest Mode was duplicated there. | One "Continue as Guest" + a one-line hint; session guest stays on the WelcomeGate. |
| 27 | The marketing wordmark clipped at 320–390px; `site/gen.test` failed every week. | 46px font floor; the weekly featured rotation changed the generated page. | `clamp(30px, 9vw, 92px)`; the home page stamps `data-week` and the test rebuilds at that week. |
| 28 | An achievement toast covered the Results Farm Phase card. | The achievement strip shrank to its 4px min-height and painted over its neighbour. | Results blocks never shrink; collapsed categories go two-column at ≥1000px. |
| 29 | Results named every stage boss "Brood Tyrant". | Framework bosses spawn as the tyrant type as a visual stand-in, so the tyrant count included every boss. | Name from a read-only bosses-slain ledger; achievement copy reads "Apex Slayer". |
| 30 | Recommendations and the Mission Hub pointed at locked screens (the gauntlet at Stage 1). | Unread counts and advice weren't checked against unlocks. | One `unlocks.isOpenNav` gate on every guidance surface. |
| 31 | "Under-Powered" warning right after a flawless clear (1,027 vs 1,050 Power). | Strict `power < rec`. | `READINESS.warnBelow = 0.9` + no warning on the stage after a flawless clear. |
| 32 | The Vault Collect button sat below the fold at 1366×768. | The whole panel scrolled. | Pinned action row. |
| 33 | Hero gene cards drafted mid-run did nothing for heroes wearing gear. | Each geared hero reads its own stat bundle copied at boot, which mid-run cards never updated. | `foldIntoHeroBundles` applies hero stats, stances and on-hit grants to those bundles. |
| 34 | Stages 1–4 occasionally wiped by 8 colossi. | Campaign invasions drew from every enemy kind. | Campaign passes the stage's own enemy list as the invasion pool. |
| 35 | Fresh accounts cleared Stages 1–2 flawlessly, then hit a wall at 3. | Over-generous grace window plus an all-or-nothing finale boss with sustain. | Grace 80%/×1.15/+50; onboarding bosses scale ×0.5→×1 by Stage 5 and swap sustain for a telegraphed core-shot (docs/CAMPAIGN.md §curve). |
| 36 | Enemies were shoved through obstacle walls. | The "head straight down" fallback. | Solid walls on authored layouts (`NavField({solidWalls})`, docs/MAP-LAYOUTS.md). |
| 37 | Old service-worker caches were never swept. | `stamp-sw` replaced only the comment's `__SW_VERSION__`; the cache name stayed `asm-__SW_VERSION__`. | `replaceAll`. |
| 38 | A brand-new player was reloaded mid-intro. | `controllerchange` fires on the first-ever install too. | Reload only when a previous worker controlled the page. |
| 39 | Portrait tab badges counted screens the player couldn't see yet. | `MobileTabBar` summed every `tab.navs`. | Channel gate in notifications; unrevealed screens never badge. |
| 40 | The Front map widget appeared at Stage 3. | Gated on 'infinite'. | Gated on 'infestation'. |
| 41 | The specimen card's "To the Specimen Vault" did nothing. | No `navBus` call. | Navigates to the specimens tab. |
| 42 | Field Guide Skip / "Got it" could not be clicked. | `.tut-callout` is `pointer-events: none` and only `.tut-continue` re-enabled it, so clicks fell through to the dim. | `.guide-btns button { pointer-events: auto }`. |
| 43 | The Champion Contracts What's New card fired at run 1, four stages before its board appeared. | Mechanic unlock was `totalRuns >= 1`; the Home widget reveals with Daily. | Mechanic unlocks with `featureRevealed('daily')`. |
| 44 | The locked Boss Rush tile previewed "Ichor / records" before Ichor existed for the player. | Static preview chips. | The chip shows only once `rewardVisible('ichor')`. |
| 45 | The Home Command strip showed "Infinite · Wave 6" and "Collection 4%" at Stage 1, before either screen existed for the player. | The vitals cells were static. | Cells filter through `unlocks.isOpenNav` like every other guidance surface. |
| 46 | The Bio-Dex "Brood Tyrant" entry ranked up on every boss kill. | Framework bosses spawn with the `'tyrant'` kind as a render proxy, and the lifetime fold added the run's raw per-kind kills. | `accumulateStats` books `tyrant − bossKills` (never negative); Apex Slayer reads the run's own `bossKills`. Tests: stats.test, achievements.framework.test, runDebrief.test. |
| 47 | Season Pass "Claim all" on a 100-level backlog stopped part-way (100 → 42 left) and needed a second press. | `claimAllPass` looped the guarded `claimPassLevel`, so every level spent one `pass.claim` rate-limit slot and the per-minute cap tripped mid-loop. | `claimAllPass` is ONE guarded action (`pass.claimAll`, its own policy) over an unguarded per-level core; `battlePassMeta.test.ts` clears a full 2×100 backlog with guards live. |
| 48 | The replay theater stopped showing a boss or Mega kill (no "FELL" / "FALLS" text). | The feel pass moved the sim's canvas floats into GameView's centre-stage announcer, which the theater doesn't mount. | The card markup moved to `components/CentreStage.tsx`; SpectateView runs its own announcer from `bossKilled` / `megaKilled` (silent while skipping). Verified live on a recorded Boss Rush replay. |
| 49 | Pressing Escape in the Gene Archive while equipping cancelled equip mode AND left the screen. | The grid's Escape handler didn't mark the key handled, so the Hub's new Escape-to-back fired on the same press. | The handler calls `preventDefault()` when it actually cancels equip mode. |
| 50 | `npm run mobilecheck` left its `vite preview` server running after it finished. | `process.exit()` inside the `try` skipped the `finally` that stops the server, and killing `npx vite` orphans its `vite` child. | The server is stopped before each exit, and mobilecheck/cogload spawn `node node_modules/vite/bin/vite.js` directly (as first-session-probe does), so the kill reaches it. |
| 51 | The Mitotic Horror showed a FALLEN card for every split piece, and a Mitotic nemesis paid its revenge when the first body died while its pieces still lived. | Each split copy is a full boss, so every piece fired `bossKilled` the same way. | `bossKilled` carries `final` (the last piece of that boss, read-only scan, built only for listeners — goldens untouched); the FALLEN card (run + theater) and nemesis revenge wait for it. The shock ring and the sim's boss-kill count are unchanged. |
| 52 | Watching a replay credited the viewer's save with that run's kills: Bestiary chassis + Bio-Spore, nemesis revenge, the Mega ledger (slain / perfect / fastest / kill count, a queued premiere) and weak-point telemetry. The Arena's opponent mirror did the same. | Every Game emitted on the one app-wide `gameEvents` bus, where meta.ts records boss and Mega kills for the player. | `Game.events` defaults to the app-wide bus (the player's run is unchanged); the replay theater, the Arena opponent mirror and `replayRun` call `isolateEvents()`. Tests: replay.test (verifier silent on the app bus; isolated vs default game). |
| 53 | A replay link or Daily entry recorded before a new tower shipped crashed the replay theater into the app error screen (and an Arena peer on an older build could not boot). | The Game constructor read `towerProgress[kind]` for every CURRENT kind; an older record has no entry for newer ones. | Missing tower/hero kinds read neutral (the same object is kept when nothing is missing — golden-safe). Test: replay.test (an older-build record replays identically). |
| 54 | The assimilation tier banner overprinted the WAVE and boss cards. | Each centre-screen card drew on its own timer. | One priority announcer (`render/feel.ts` `Announcer` + `ANNOUNCE`) owns centre stage. |
| 55 | Under reduced motion, centre-stage cards never appeared. | A 0.01 s animation with fill `both` ended at opacity 0. | Reduced motion renders the cards static (`animation: none`). |
| 56 | Arena victory/defeat and the Maw's shot made no sound. | No `sound.ts` case for those cues. | Cases added; `cues.test.ts` fails on any cue without a voice. |
| 57 | A stage boss's death played the Hive-breach alarm. | The death reused the breach cue. | A dedicated `bossFall` cue with its own FEEL row. |
| 58 | The draft's exact-values sheet popped over a card the moment it was dealt. | `pointerenter` fires under a cursor that never moved. | The sheet arms only after a real pointer move. |
| 59 | The Results title bounced as reward categories expanded. | It was centred on the column axis. | Anchored to the top. |
| 60 | The rotate prompt covered portrait Results. | Only the battlefield held the in-run layout. | Named holds keep the run layout from deploy through Results (and the Boss Rush roulette). |
| 61 | On phones, Results scrolled sideways. | The background haze extended 6% past the edge. | Clipped. |
| 62 | The level-up toast covered the unlock summary. | It wasn't held like reward toasts. | The same hold. |
| 63 | The tutorial banner timed out while the intro film played. | Its timer ran under the film. | It waits for the film to land. |
| 64 | The Specimen arrival card's "Claim it in the Vault" only closed the card. | It called `next()`. | It opens the Specimen Cabinet tab. |
| 65 | The Materials popover was cut off on narrow screens. | The top bar scrolls sideways and clipped it. | Popovers position against the window (`ChipPopover`). |
| 66 | Hero Hall pointed to an Armory "below ↓" that isn't there. | Stale copy. | It links to the Armory. |
| 67 | Browser/Android Back left the game mid-run. | Navigation history lived only in memory. | A same-URL guard history entry: Back closes the top layer, steps the hub back, or pauses a live run (`ui/browserBack.ts`). |
| 68 | One failed screen chunk crashed the whole app. | The only error boundary was app-level, and Chromium caches a failed import for the page's life. | A per-screen `ScreenBoundary` (Retry + Back) and a cache-busted retry in `lazyNamed`. |
| 69 | Hub badges sat at "9+". | They summed item counts. | A door badge counts member screens that need a decision (`doorBadge`). |
| 70 | The Home deploy button sat below the fold. | World Status rendered above it. | Reordered; `mobilecheck` asserts the CTA is on screen. |
| 71 | The balance report flagged dead zones on healthy accounts. | Its detector ignored Molts (Power drops ×3–18 after each). | It shares `isDeadProgression` with the progression report. |
| 72 | The balance report showed Power spikes up to ×48. | It compared two arbitrary points in the post-Molt cycle. | It compares band peaks (`peakPower`). |
| 73 | The simulated player never unlocked expansion towers or used Transcendence. | Missing steps in the bot's spending. | The bot calls `unlockTower` and transcends cards. |
| 74 | Engorged Reactor L1 (and 51 other gene levels) left displayed Power unchanged. | The gain rounded away on a young account. | `GENE_LEVEL_POWER_FLOOR` guarantees each level moves Power. |
| 75 | Balance-matrix reruns disagreed. | Loot used unseeded `Math.random`. | `withSeededLoot` seeds it. |
| 76 | The new Screen shake slider in Settings was a 16 px-tall touch target on phones and tablets (mobilecheck `tiny-target`). | The shared coarse-pointer floor covered buttons, selects, text inputs, checkboxes and radios, but not range sliders. | `input[type='range']` joins the 44 px coarse-pointer floor (the track stays thin). |
| 77 | Star and branch upgrades that promise an effect "around the victim" (Acid Lancet, Basilisk, Chrysalis, Siphon, Coil, Spire, Spitfang — 34 components) fired around the TOWER instead, so most did nothing. | Area components (`debuff` / `explosion` / `aura`) always centred on the cast origin; only `status`/`crit`/`chain` used the struck target, and the Siphon's grants got no target at all. | Area components take `at: 'victim'` (centre on the cast's primary victim; none ⇒ no effect), set on every grant whose text says so, and the Siphon passes its drained target. `branches.test.ts` fails any victim-worded grant without the anchor; `ability.test.ts` pins the executor. |
| 78 | Miasma Lung's "+infection spread" Adaptation picks did nothing. | Infection stacks carry no owner, and the death-spread radius read only the Parasite Nest's `infectionSpreadMult`. | Each infected enemy records the tower kind that last infected it (`Enemy.infectedBy`, set from the casting tower; heroes and reactions add stacks without claiming); the spread uses that kind's multiplier and the plague keeps its owner as it walks. Unclaimed plague uses the Nest's, as before. Tests: reactionTrio (Lung vs Nest reach; a real Lung breath claims its plague). |
| 79 | "Stage N+1 ▸" on Results always took the next stage's default Mutation boon — the choice the Campaign panel offers was skipped. | Results launched the next stage without a boon id. | Results shows the next stage's boons above the action row (first pre-selected) and the pick rides the launch (`RewardReveal next.choices`, `App.nextBoons`). Verified live on desktop and a portrait phone: picking Alacrity starts Stage 22 at ×1.25 fire rate, damage untouched. |
| 80 | Power crashed ×33–40 after a late Molt and readiness fell to ~0.05, so most of each late cycle was spent unable to play the frontier. | Every Molt re-bought the whole Genome engine from zero while the new Ascendant cells added only ~1–2%. | The MOLT IMPRINT keeps round(level × min(0.7, 0.0125 × Molts done)) of every upgrade (first Molt unchanged); the Molt Chamber shows what is kept and the Power after. Seeded 400h matrix: late drop ~×3, readiness ~0.5, a late Molt costs ~11–13h instead of 20–21h (BALANCE_ARCHITECTURE §9.6). |
| 81 | Home's Hive Intel feed (and the Vault history) could drop or double a row; React warned about duplicate keys on every mid/late-game boot. | Rows were keyed by timestamp alone, and one action can stamp several timeline milestones or container opens in the same millisecond. | Keys/ids carry the row's position too (`intel:tl:<at>:<i>`, vault history `<at>:<i>`). Found by a 26-screen × 3-depth error sweep (no crashes or boundary fallbacks anywhere); test in hiveIntel.test. |
| 82 | A boss dying on a slow frame (more than ~25 ms of work before the draw — common on phones) crashed the run with "radius is negative". | The boss-fall impact ring was stamped with `performance.now()` mid-frame but drawn with the frame's earlier rAF time, so its age — and its eased radius — went negative and `arc()` threw. | `render/impactFx.ts` clamps the age at 0; `impactFx.test.ts` reproduces the throw without the clamp. Found by the S1 track. |
| 83 | The last kill's gore froze mid-burst through the settle and the draft. | Gore animated on `rs.time`, which stops during the settle. | Gore uses `RenderState.fxTime` (stepCount × SIM_DT), a presentation clock that keeps running. |
| 84 | The run-end veil hid the Hive Core and the board's edges at the moment of victory or defeat. | A viewport-centred radial veil darkened everything outside a central circle. | The veil is a spotlight on the board's own rect (`--outro-*` set from the canvas rect at outro start). Found by the S2 track. |
| 85 | Results' "Also earned" row updated the achievement toaster while Results was still rendering (React "Cannot update a component while rendering a different component"); the toaster's update could be lost or land out of order. | `AutoClaimSummary` settled the auto-claims (store writes) inside a `useState` initializer, i.e. during render. | The settle runs in a `useLayoutEffect` (still before the first paint; idempotent per settle key). Found by a live end-to-end run with the merged Batch 3 moments — 0 errors on desktop and phone after the fix. |
| 86 | A Genome Rank promotion (or any menu ceremony — level-up toasts, What's New, the Update Briefing) could pop up over a LIVE Arena match, covering the real-time PvP field. | The Arena match renders over the hub while App's screen stays `menu`, and every ceremony was gated on `screen === 'menu'` only. | One `menuIdle = screen === 'menu' && !arenaSetup` gate holds them until the match ends (their queues persist). Found by an Arena-vs-AI smoke run; re-run shows no overlay during the match. |
| 87 | On short phone-landscape screens the opening film's Hive Core sat under its caption. | The core scene centred the core regardless of stage height. | The core (and the Mega premiere framing) lift on short stages so captions stay on the quiet region (`copyAt`). Found by the S4 track. |
| 88 | An honest Daily run that used the draft reroll failed replay verification. | `rerollDraft` re-deals from the sim rng and spends Biomass, but was not in `REPLAY_METHODS`, so the replay never re-dealt and diverged. | `rerollDraft` (and the new `splice`) are recorded inputs (core/replay.ts); a test proves the divergence is gone. Found by the GR2 track. |
| 89 | The Mega Boss bar covered the draft's header. | The Mega bar sits at z 41 and the draft overlay had no stacking of its own. | The Mega bar and centre-stage cards hide while a draft is open. Found by the GR2 track. |
| 90 | The Boss Rush conveyor tray clipped its last pod at 1440×900. | The rail wrapped four 240 px pods into a fixed 88 px deck. | No wrap; pods shrink to no less than 180 px without clipping labels. Found by the GR2 track. |
| 91 | Hive Intelligence spent ~90 % of the opening on Hero Evolution, so its runs died by wave 3 with 2 towers. | It had no favorite-placement option and no thin-board rule, so hero stats always scored highest. | A `favorite` placement while the board is thin and a Hero Evolution/auto-cast hold below `HIVE_MIND.thinBoardTowers`; towers at wave 2: 2 → 5–7. Found by the G1 audit, fixed by GR2. |
| 92 | Gear stopped improving after about 3 hours. | Item level was linear in Power and capped at 30, so T6 affixes were unreachable and every container rolled the same band. | `ITEM_LEVEL_CURVE` (uncapped log curve on depth) + `GEAR_RARITY_BANDS`; `gearRarityOdds` is the single source for the roll and the Armory line (a 20k-roll test pins them equal). Found by the G2 audit, fixed by GM2. |
| 93 | Each Mega stage walled players for about a day (8–29 h). | `C.megaStagePremium` ×1.8 came from a probe taken before raid targeting existed. | Re-measured with real runs (mega vs suppressed mega: 9/18 vs 9/18) and set to ×1.15; Mega kill Ichor kept equal by raising `MEGA.expectedKill*`. Found by the G2 audit, fixed by GM2. |
| 94 | Built accounts never reached the end of Boss Rush; runs sat at the 30-minute cap. | Boss strength capped at ×2.6 and each wave waited for the last boss. | Geometric growth past wave 10, HP sized to the account's Power, and the next column marches in `RUSH.columnGraceSec` after the last boss arrives. Found by the G1 audit, fixed by GM2. |
| 95 | Gear Codex entries un-discovered when the last copy was salvaged. | "Discovered" meant "in the current inventory". | A permanent `equipment.discovered` ledger (save v56) folded at the single `persist` chokepoint; Codex, collection %, Power and the NEW badge read it. Found by the G2 audit, fixed by GM1. |
| 96 | Genome Rank demoted after every Molt. | The rank read live Power, which a Molt resets. | It reads persisted peak Power (`genomeRank.peakPower`, raised at settle, on promotion polls and before a Molt). Found by the G2 audit, fixed by GM1. |
| 97 | The Results cliffhanger promised "one more run" for goals ~48 h away. | Goals were sorted by raw progress %, not by time. | A per-run income ledger (state/income.ts) gives every goal an ETA in runs; goals sort by ETA and "one more run" needs ETA ≤ `INCOME.honestRuns`. Found by the G2 audit, fixed by GM1. |
| 98 | The Daily Bio-Cache showed "≈6◆". | The value was in Infinite-value units but drawn with the Genome Core glyph. | The cache has a guaranteed Cores line scaled to live income and shows its value in Cores. Found by the G2 audit, fixed by GM1. |
| 99 | A veteran's first run after achievement ladders shipped played ~17 achievement spotlights one by one. | Every ladder rung crossed in one settle was its own Results line. | `collapseLadderRungs` folds each family into its top rung with "· N rungs" and the summed reward (4 lines instead of 17 on the stage-80 seed save). Found in the Batch G integration live run. |
| 100 | A Stage-2 account's Home goal list showed "Abyssal Record I — 151 more Infinite Depth · ~235 runs" (Infinite still sealed) and "Twin Avatar · ~161 runs". | The achievement-ladder goal was always added (its nearest rung, however far), and ETAs printed up to 999 runs. | A ladder goal joins only within `INCOME.ladderGoalRuns` (40) runs; ETAs past `INCOME.etaCap` (60) read "a long road". Found by the Batch G website media pass. |
| 101 | After calling a wave early, the run froze on a gene draft: picks did nothing (the first-session probe sat on Stage 1's wave-4 draft for 420 s). | Owed drafts are dealt back to back while the phase stays `draft`, so the DraftModal never unmounted — and it locks itself after its one pick (anti double-pick), ignoring every later pick. The sim tests passed because they call `chooseCard` directly. | GameView keys the DraftModal by a pick counter: every deal after a pick gets a fresh mount. Live: two early calls → three back-to-back drafts after the clear, each picked. Found by the Batch G first-session probe. |
| 102 | A fresh account at 91 % of Stage 3's recommended Power read "Unlock the Infinite — 1 to go · ~7 runs" on Home. | `runsToStage` fell back to the slow observed stage pace whenever Power was below the recommendation — including the readiness band where runs are usually won (67–78 % after the re-anchor). | Within the band (≥ `READINESS.warnBelow` × recommended) a stage costs `INCOME.closeAttempts` (1.5) attempts; the wall pace answers only below it. Test mutation-checked. Found in the Batch G media stills. |
| 103 | A run abandoned before wave 1 (in the opening draft) reported "Fell on wave 0 of 14". | The defeat headline printed the raw wave index. | Wave 0 reads "Ended before wave 1". |
| 104 | A veteran's goal ETAs after the v56 update ran ~2× short for their first ~10 runs (e.g. Trinity Avatar "~25 runs" vs ~55 actual), and the Results cliffhanger could promise "one more run" on them. | The income ledger seeds a migrated save with LIFETIME averages, which run fast at depth (early stages cleared one per run). | `estimatesFirm`: until the ledger has observed `INCOME.trustRuns` (8) of the account's own runs (and only for accounts with a long pre-ledger history), ETAs read as lower bounds ("25+ runs") and "one more run" is never said. Flagged by GM1. |
| 105 | The battlefield floor re-baked on EVERY frame (9–17 ms/frame headless — the single biggest render cost). | The floor cache was keyed on the live transform scale, which the assimilation camera breath, wave push-in and last-kill nudge change every frame. | Static bakes keep their scale within ±20 % of the live one (`bakeScale`) and re-bake only on a real DPR/zoom change; drawGame mean 24–26 → 11–15 ms headless. Found by the V3 VFX track while measuring. |
| 106 | A boss under focus fire rendered as a white disc — chassis, phase anatomy and states disappeared. | The full-body white hit pop and the reaction flash re-triggered every few frames. | Bosses get a rim glint (`drawBossHitRim`); other bodies keep V1's striker-tinted additive flash. Found by the V2 VFX track. |
| 107 | Hero cast telegraphs vanished under reduced motion, and ignored Settings → Motion. | The cast layer read only the OS media query and gated the telegraph with the theater. | It follows `viewFeel.motion` and keeps the telegraph (information) while dropping the motion. Found by V2. |
| 108 | Every enemy's spawn ('birth') effect drew in whatever stroke colour the previous draw left. | enemyForms built `rgba(rgb(r,g,b),a)` — invalid CSS, silently ignored by the canvas. | An `r,g,b` token (`shadeTok`). Found by the V1 VFX track. |
| 109 | The Vault showed rarity in the reward TYPE's colour — "8× INERT" in blue, a Legendary in pink — on every container open. | Tally chips, the face's rarity word, the prize banner and the legendary interrupt used `PullView.color` (the reward type). | They use `rarityColor(pull.rarity)`. Found by the V4 VFX track. |
| 110 | Exotic was three different colours (gear magenta, gear art teal, draft/gene pink; the toaster used an undefined token). | Three separate colour maps. | One `--r-exotic` / `--r-exotic-2` token pair used everywhere (uiStandards test guards it). Found by V4. |
| 111 | "Open One" in the Vault gave no feedback for ~0.6 s, and the Genome Rank promotion's Continue sat below the fold at 844×390. | The open ran synchronously before any paint; the promotion card was too tall for short viewports. | An `is-cracking` press state + a deferred open (first feedback in ~13 ms); short-viewport compaction for the promotion. Found by V4. |
| 112 | A boss's fired verb (MEND, SUPPRESS…) flashed on its banner for one frame. | The sim names the verb on the tick it fires and clears it the next. | GameView holds the latest verb `BOSS_VERB_HOLD_MS` (1.2 s). Flagged by V2. |
| 113 | The opening film's title clipped to "ASSIMILAT…" on a 390px-wide phone — the first frame of the game a phone player sees. | A fixed 58px wordmark with 0.14em tracking is ~475px wide. | `clamp(26px, 9.6vw, 58px)` + `white-space: nowrap`; captured at 390×844 and 844×390. Found in the intro overhaul audit. |
| 114 | With the OS asking for reduced motion but Settings → Motion allowing motion, the opening film's canvas animated while its new title stayed frozen (and the `.is-still` class the title rules expected was never set). | The title's reduced-motion rules keyed on the OS media query, not on the film's resolved motion; the class was never applied. | InitCutscene sets `.intro.is-still` from `resolveMotion` and the title follows only that — canvas and title now agree. Caught in the post-release self-review. |
| 115 | A fresh account got "11 new systems unlocked" after its very first run (the first-session probe's one modal). | What's New had no budget — eleven mechanics were gated on "played one run". | Announcements are paced at 2 per finished run (a revealed screen's own lesson first); in-run controls teach mid-fight as field notes instead. Measured: 2 cards after run 1, queue drained by ~2 h. |
| 116 | The Help wiki listed the Nucleus (a stage-25 screen) from minute 0, and Gene Essence announced the stage-4 Gene Archive after run 1. | Their unlock predicates ignored their screen's gate (`() => true`; "has any drafted card"). | The SEAL RULE: a mechanic whose `nav` is a gated screen never unlocks before that screen reveals (`isMechanicUnlocked`), test-pinned for every row. |
| 117 | The Tower Lab, Hero Hall and Infinite never got their briefing or guided walkthrough on arrival. | Their lessons were `core` (always-known), so they never announced — and a guide is armed from the announcement. | The three lessons announce as their screen opens; v57 archives them for players who had already met the screen (latched reveal); a test fails if any post-minute-0 screen teaches a core lesson. |
| 118 | Long sound layers (the opening film's rumble, title swell and dive, boss and Mega stings — 19 cues) cut off dead at 0.5 s. | Every noise layer played one 0.5 s non-looping buffer. | A 2 s looped noise buffer read from a random offset; the audio audit's hard-stop detector now finds 0. Found by S1. |
| 119 | The first sound after a quiet spell came out squashed (up to −20 dB on short cues). | Chromium stops processing nodes whose inputs are silent, freezing a compressor wherever the last sound left it. | A −120 dBFS keep-alive keeps the SFX dynamics processing through silence. Found by S1. |
| 120 | Kills, rewards and the wave horn were hard to hear over the music (8–10 dB under it). | Levels were hand-set cue by cue and never measured. | A measured mix: 7 categories with loudness targets, audit-derived trims (`audio/sfxMix.ts`), music level 0.8 → 0.7; Effects and Music volume sliders. Found by S1. |

---

## Comprehensive bug-hunt pass (this session)

**Method.** Static scans for the bug classes that matter in a deterministic
sim + the merged multi-session codebase, plus headless runtime exercise of every
major path (errors captured from `console` + `pageerror`), plus the golden
characterization suite (6 seeds) gating gameplay drift.

**Checked — and clean:**

- **Determinism leak** (`Math.random` in `core/`): none. Both the gameplay RNG and
  cosmetic FX RNG are seeded; the new Director/Boss take an `rng`. *Now guarded by a
  test:* `core/boundaries.test.ts`.
- **Type holes** (`as any` / `@ts-ignore` / `@ts-nocheck` in app code): none (one
  intentional `as unknown as` in `validate.ts`'s reflection helper).
- **Missing-key crashes**: all per-kind lookups are `Record<Kind, …>` (towers,
  enemies, heroes, shapes, tiers, mastery, stats). `strict` typecheck enforces
  exhaustiveness, so a new tower/enemy/hero can't ship a half-filled map.
- **Save migration / loss**: `withDefaults` deep-merges *every* per-key record
  (tower/hero shards·stars·mastery, stats sub-records, equipment, mats) and guards
  `selectedHero`/`achievements`/`uniqueCards`; `isSaveData` stays lenient so old
  saves upgrade instead of being discarded. v1→v3 saves gain new blocks zeroed.
- **Mode plumbing**: `endless` flows App → GameView → `new Game(…, { mode })` (a
  silent fallback to stage would have been an invisible bug). Verified live.
- **`hitNucleus` idempotency**: guarded by `if (!e.alive) return`, so an enemy can't
  breach twice or be double-evicted across the two reach checks in the move system.
- **Feature wiring**: Infection (on-hit · ramp/DoT · spread-on-death), Disruption
  vulnerability, boss shields, and the Director are all reachable and exercised — no
  defined-but-dead handlers.
- **Non-null assertions**: the only one in core (`this.director!`) is reached solely
  from `startEndlessWave`, which runs only when `mode === 'endless'` (where the
  Director is constructed). Safe.

**Runtime matrix (headless Chromium, zero console/page errors):**

| Path | Result |
|---|---|
| Stage: all 5 towers placed, every boss type (`Boss`/`FW`/`Proc`) + full enemy variety, ability spam | clean |
| Stage: **natural loss** — no towers, swarm floods the line → integrity 0 → `NUCLEUS LOST` → results → `Runs failed` +1 | clean |
| Stage: debug **Win** → results (loot + mastery + achievement toasts + Shard reward) → back to menu | clean |
| Endless: 12 Director-composed waves at ×4 (elites, swarm events, minibosses) | clean |
| Menu: MetaShop · TowerLab · Statistics · Achievements · SaveManager render together | clean |

**Verdict.** No crash, determinism, save-loss, or correctness defects surfaced. The
codebase's invariants (deterministic core + golden tests, type-enforced exhaustive
maps, guarded save migration) are actively preventing the hunted bug classes.

**Documented latent edge-case (deliberately NOT changed — would alter gameplay,
which the brief says to preserve):** an enemy reduced to **exactly ≤0 HP by towers**
that crosses the line **in the same tick** deals Integrity damage and is *not*
credited as a kill (no bounty/mastery/stat) — a 1-tick artifact of the system order
(damage → move → death). "Fixing" it (skip-if-dead before the breach check) changes
Integrity/kill/biomass outcomes → golden drift. Recorded here; revisit only if the
system order is ever reworked.

---

## 13 · Mobile tutorial — the lesson bubble sat on the very slots it asked you to tap

**Symptom (user report).** On phones, step 3 ("Place a Needle Spitter") could not be
completed: the tutorial dialogue floated mid-screen, directly over the glowing build
slots. A per-step geometry audit showed it was systemic — the floating callout covered
ALL 15 build slots on steps 3/4/7/8 (10/15 on 6/10), and the Pause/Skip pills sat ~30%
over the hero ability button for the whole trial.

**Root cause.** The `Callout` primitive positions a measured bubble beside its ANCHOR
(the tower card / HUD cell) with viewport clamping — on a 390×844 phone "beside the
toolbar anchor, clamped" IS the lower board, and centered fallbacks land mid-board. The
bubble is pointer-transparent, so automated force-taps passed while a human sees the
slot band hidden. Controls were fixed to the bottom-right corner, which on phones is
the toolbar itself.

**Fix.** Phone dock contract (docs/TUTORIAL.md §phone): ≤700px the lesson docks to the
edge OPPOSITE its anchor (never over the action), controls move to a translucent
top-right row that ducks below top-band spotlights, the banner collapses to its eyebrow
strip while the draft is open, side sheets stand down under the draft, `cue.focus`
joins the auto-scroll chain (late-mounting draft), and a missing spotlight target no
longer blacks out the screen. Gated by a headless per-step no-overlap audit + full
10-checkpoint completion at 390×844.

## Vitriol & Revenant shipped effectively ungated (starter mis-classification + a dead gate)

**Symptom.** Both milestone heroes appeared owned from minute zero on the home army board,
Splice Market roster, expeditions bench and Bio-Roulette — and Vitriol was fieldable in runs
after the very first campaign stage.

**Root cause.** Two independent holes. (1) `starterHeroes()` classified "no `unlockShards`"
as a starter; the milestone heroes carry `unlock` gates and NO shard cost, so every fresh
save (and every load, via `sanitizeHeroUnlocked`) seeded them into `save.heroUnlocked`, and
every surface reading that array raw treated them as owned — only the run picker went through
the gate-aware `isHeroUnlocked`. (2) Vitriol's gate ("slay a Framework Boss",
`bossesSlain.length > 0`) rotted when Campaign gave EVERY stage a framework stage boss: the
stage-1 boss met it minutes in.

**Fix.** Milestone-hero ownership now derives ONLY from the live feat: `starterHeroes()`
excludes `HeroDef.unlock` heroes, the sanitizer strips them from persisted lists (self-healing
bugged saves), and every raw `heroUnlocked` reader (home army, market stock ×2, expeditions
bench + start, Bio-Roulette, Genome heroRatio) now calls `isHeroUnlocked`. Vitriol's gate
escalated to breadth — `{ kind: 'bossSlain', count: 3 }` distinct chassis — with live progress
in the Hero Hall; Revenant's Depth-40 gate was already sound once the seeding hole closed.
Pinned by meta.test gating cases + a live Hero Hall smoke across both gate boundaries.

## Vault multi-open silently opened ONE container (guard cooldown ate the loop)

**Symptom.** "Open Five" / "Open Ten" in the Genetic Vault opened exactly one container —
the ceremony played, but the stockpile only shrank by 1 (user report: "open multiple
bio-containers at once is broken").

**Root cause.** `'container.open'` carries a 250 ms guard cooldown (reveal-ceremony pacing).
The vault's `crack(count)` looped `meta.openContainer()` synchronously, so calls 2..N landed
inside the cooldown, `guardOk` refused them, and the loop's `if (!award) break` treated the
refusal as an empty stockpile. The test suite never caught it because the guard layer is
deliberately inert outside the browser (`enabled = typeof window !== 'undefined'`) — the
`while (meta.openContainer())` loops in meta.test.ts pass with guards off.

**Fix.** A multi-open is ONE gesture: new `meta.openContainers(count)` guards
`container.open` once per press (the same batch-is-one-action reasoning as `quest.claim`'s
board clear) and drains up to `count` via the internal unguarded path — each open still
persists before the next, so isNew/pity/duplicate-conversion semantics are unchanged. The
vault's One/Five/Ten buttons route through it, plus the new **Open All (N)** button (shown
at ≥2 banked). Pinned by a regression test that runs with guards LIVE on a fixed clock:
per-call opens refuse on call 2 (the bug shape), the batch drains everything.

## Chained power purchases lost their feedback (stinger gate + silent toast merges)

**Symptom.** Buying power-raising upgrades back-to-back only celebrated the FIRST one in a
~3–5s window — later purchases felt muted, and a repeated same-source gain could update an
existing toast invisibly (or not appear at all if the toast had already played its baked-in
2.2s exit animation while still mounted).

**Root cause.** Two independent dampers. (1) The 'power' cue rides a musical stinger gated by
`STING_COOLDOWN_MS = 6000` — correct as anti-spam for the fanfare, but the remaining per-gain
chime was identical and quiet, so chained buys read as silence. (2) `PowerToaster` merged
same-source gains within 400 ms by editing the toast's number in place: no animation, no
lifetime extension — and the CSS exit (`ptoast-out … 2.2s both`) had often already hidden the
node the merge was editing.

**Fix.** Chains now ESCALATE instead of muting: `sPower(chain)` steps its pitch up per gain
inside a 4 s window (combo-counter style; the stinger still crowns only the first). The
toaster tracks `hits + expireAt` per toast (250 ms sweeper, merge window 1200 ms) and keys the
node on `hits`, so every merge REMOUNTS the toast — the pop-in replays, the exit clock
restarts, and the label shows the ×N chain. Verified with a headless probe: four chained
Evolution HQ buys each produced audio + a live toast.

## Hero select panel rendered as overlapping text soup (inherited line-height: 0)

**Symptom.** Clicking a hero in-run opened its status panel with "insane clipping/duplication":
the name drawn over the class line, TEMPORARY/PERMANENT labels interleaved with their content,
gear rows collapsed onto each other — only elements with explicit heights (health bar, cooldown
tracks, portrait) rendered correctly.

**Root cause.** `.canvas-wrap { line-height: 0 }` (the canvas whitespace kill) is INHERITED by
every overlay floated over the board. Any text line without an explicit line-height collapses to
a zero-height line box — glyphs still paint, boxes don't grow, so blocks stack at the same y.
`.gene-splash` had already been patched for exactly this ("undo canvas-wrap's line-height:0")
but the hero panel never was, and each new overlay re-discovers the trap. The panel's bounds
were also dishonest: fixed 250px width and a `100vh`-based max-height measured against the
VIEWPORT while positioned inside the (shorter, overflow-hidden) board wrap.

**Fix.** Systemic: `.canvas-wrap > *:not(canvas) { line-height: 1.45 }` (and the same guard on
`.spectate-stage`) — overlays get sane text by default; the per-overlay patches become
redundant instead of mandatory. The panel itself: `line-height: 1.45`, `width: min(260px,
calc(100% - 24px))`, `max-height: calc(100% - 24px)` (bounded to the BOARD, not the viewport),
and the hero name ellipsizes. Verified with a live probe (panel 260×477, inside every clipping
ancestor, one instance) + before/after screenshots.

## Polish sweep: briefing CTA below the fold · 21-step wardrobe chain · dev-text leak

**Symptoms (screenshot sweep, developed profile).** (1) The Update Briefing's highlight list
grows with the release backlog — at 13 releases the Continue button rendered BELOW a 768px
viewport (nothing visibly dismissed the modal). (2) A progression burst queued 15–21 wardrobe
unlock ceremonies, each demanding its own click, re-interrupting on every screen until
exhausted. (3) The Armory's empty state told players to "grant some from the debug panel".

**Fixes.** Briefing: `.ub-card` caps at `100vh − 48px` and the highlight list scrolls inside
(`max-height: 34vh`) — actions stay pinned in view (verified: card 720px of 768px, CTA
visible). Wardrobe: a "Wear all N — skip the ceremony" escape appears whenever more than two
reveals remain; one tap banks the rest (verified live: cleared a 15-deep chain). Armory: the
empty state now points at runs + Bio-Containers.

## 2026-07-12 — Desktop run HUD: gore streams aimed at nothing + crushed conveyor pods

**Symptom.** On desktop, biomass motes and assimilation chunks flew to two arbitrary points
along the top of the board ("mobile-layout destinations") while tower-bound shards were fine;
conveyor pods rendered their three actions as "D… S… ⚙…".

**Root cause.** (1) The gore coalescing destinations were FIXED board-space fractions
(`0.8·WIDTH / 0.52·WIDTH, y=14`) tuned for the portrait layout, where the full-width canvas
sits directly beneath the top meters. Desktop letterboxes the 720×960 board into a centered
strip (~380px at 768p), so those fractions align with no HUD cell. (2) The ready-reflow fix
pinned conveyor pods at a constant 132px (`.cv-actions { width: 0; min-width: 100% }`), too
narrow for three labeled buttons.

**Fixes.** (1) `setGoreAnchors` (render/gore.ts): GameView projects the REAL `[data-tut=
"biomass"]` and `.hud-loot` cells into board coordinates (clamped to the arena's top band) on
mount/resize — streams now land at the arena edge nearest each actual readout on every layout,
portrait defaults preserved as fallback. (2) Pods stay width-constant but desktop widens them
(`[data-layout='desktop'] .cv-slot { min-width: 240px }` + label-weighted button flex) —
"Deploy FREE / Strain N / ♻ N" verified fully legible in a live 1366×768 run.

## 2026-07-15 — Stage-10 Mega Boss "does not work": inert overtime + broken-looking raid fire

**Symptom.** With the wave plan spent and the mega the only thing left, the fight went dead:
the boss "just sits there and soaks" (probe: ONE 16-integrity cataclysm across a 184s
overtime), most towers looked broken — no projectiles at all in lone stretches (raid fire is
hitscan tracers), short-range/back-row kinds never fired (the body band at y 580 was
front-row-only by design), and the Effigy visibly "fired" zero-damage tracers.

**Root cause.** No lone-state behavior existed: the rotation's verbs are horde-buffs/summons
(no horde ⇒ no-ops), overtime pressure was a 3-add trickle every 18s, `towerMegaFire` aimed
every chip at the fixed high band and never skipped `damage: 0` kinds, and the 0.14s hairline
tracers read as nothing at all.

**Fixes** (docs/MEGA-BOSS.md §lone siege). (1) LONE SIEGE state: after 8 quiet seconds the
organism turns on the Hive — telegraphed, interruptible HIVE LASHES on a self-tightening
cadence (tier-scaled integrity damage; eye interrupts/staggers defuse a windup), escalating
reinforcement surges, mass descent (`megaBodyY`: every emplacement connects, each striking the
highest point its range reaches) with a deeper exposure chip (`siegeChipMult`). (2) `damage: 0`
kinds skip raid fire. (3) Presentation: reaching lash arm + nucleus warning + strike afterimage,
sieging drapes the tracers visibly bite, and sheath+core artillery tracers with impact ticks.
Probe after: ~60 integrity of drumbeat pressure, 16/16 towers firing, same ~3min median kill —
now a race, not a wait.
