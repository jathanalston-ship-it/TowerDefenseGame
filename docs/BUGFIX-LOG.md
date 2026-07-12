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
