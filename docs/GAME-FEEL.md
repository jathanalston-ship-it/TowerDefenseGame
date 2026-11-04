# GAME-FEEL.md — Juice Audit & Feedback Systems

A full audit of game-feel opportunities, prioritized by **dopamine ROI**
(frequency × intensity). Builds on `STYLE-GUIDE.md`, `READABILITY.md`,
`PLACEHOLDER-ART.md`; grounded in the current renderer (`pulse()`, pooled
particles, `PARTICLE`/`PERF`, base heartbeat, hive tendrils, pressure vignette,
floating texts). No code — why / visual / audio per item.

> **Two facts that shape everything below:**
> 1. **There is no audio system yet** — every "Audio" rec is greenfield. The
>    recommended foundation is a **procedural Web Audio layer** (synthesized SFX),
>    which fits the asset-free ethos (STYLE-GUIDE §13) and is live-service
>    re-themeable. Tiny samples can be swapped in later per channel.
> 2. **Juice serves readability, never fights it** (READABILITY): every effect is
>    capped, pooled, aggregated, and respects reduce-motion. Spectacle that buries
>    a 200-enemy swarm is a bug, not juice.

---

## 0. SHIPPED — the 2026-07 feel pass (this doc's top recs, live)

- **Power gains celebrate** at the HUD cell: +Δ fly-up, pulse, burst, throttled chime (Hud.tsx).
- **Placement roots**: towers grow in (existing `bornAt` ease) + bio tendrils crawl outward and
  sink in over 0.8s + a rooting particle burst (fxRng — golden-safe).
- **Crits read as events**: `FloatingText.kind: 'crit'` → pop-in overshoot scale, heavier type,
  a burst ring (renderer float pass).
- **Wave launch spectacle**: every `waveStarted` (button/hotkey/auto/director) sweeps a WAVE N
  banner across the board, fires the console energy sweep, and pushes the camera in ~1.2%
  (eased decay, composed under the danger zoom).
- **Boss arrival**: bossBanner flipping live triggers the APEX THREAT intro (eyebrow → name
  slam → subtitle over a red iris), the `boss` sting (falling tritone + sub thump), and an
  arrival shake (`FEEL.bossArrive`, render/feel.ts).
- **Draft feel**: staggered card arrival, hover lift+tilt, animated conic rarity borders for
  epic/legendary, floating motes over legendaries.
- All spectacle respects `prefers-reduced-motion` (heavy animations collapse).

## 0b. SHIPPED — the 2026-11 battle-feel pass

### §feel table — one source for shake / hit-stop / duck / stinger
`src/render/feel.ts` `FEEL` holds every per-event feel row (`shake` trauma impulse, view-only
`hitstop` seconds, score `duck` [depth, recovery], musical `stinger`), keyed by cue id or named
view moment (`bossArrive`, `bossFall`, `abilityImpact`, `masteryUp`). GameView applies shake +
hit-stop for every drained sim cue and its own moments; `audio/sound.ts` reads the duck + stinger
halves of the same rows. Key rows: boss fall **0.4 / 0.12 s**, ult impact **0.22 / 0.06 s**, mega
death 0.6 / 0.12 s. Hit-stop never stacks (the longest pending wins) and is capped at the
branch-purchase beat (0.12 s — the one hit-stop the sim still sets itself, `BRANCH_HITSTOP`).
**Cue coverage is test-enforced:** `src/audio/cues.test.ts` statically scans src/ for every
`cue('…')` / `pushSfx('…')` / `stinger('…')` literal (ternary branches included) plus the
data-driven cue tables (tower fire, enemy death, branch kits, mega themes, film beats) and fails
on any id that resolves to neither a sound.ts case nor a FEEL row. It caught arena
`victory`/`defeat` and the maw reflux `shot` — all three now sound. Runs open on the `launch`
swell; hero crits play a soft `crit` ching (rate-limited to one per 90 ms).

### §centre-stage — one announcer owns the middle of the board
WAVE N, the boss APEX THREAT card, the mega intro, the assimilation tier banner ("▲
COLONIZATION", canvas-drawn), weak-point callouts and the boss/mega FALL cards all go through
ONE priority queue (`Announcer` + the `ANNOUNCE` table: priority, slot ms, staleness budget).
A higher-priority card preempts (the preempted card re-queues only if it had barely begun); a
lower one waits its turn; a waiter older than its budget is dropped — old news never plays late.
Ladder: mega fall 100 › mega intro 90 › boss fall 80 › boss intro 70 › weak point 50 › wave 40 ›
tier 20. Each card keeps its look; the slot length reaches the CSS timeline as `--stage-ms`.
The card markup lives in `ui/components/CentreStage.tsx`, shared by the live run (GameView) and
the replay theater (SpectateView), which runs its own announcer for the boss/mega FALL cards from
its replay sim's own `bossKilled` / `megaKilled` events (silent while skipping ahead). The replay
sim speaks on a private bus (`Game.isolateEvents`), never the app-wide one.

### §boss kills — the kill LANDS
A stage boss death pushes the `bossFall` cue (it used to borrow the Hive-*breach* alarm):
trauma 0.4 + a 0.12 s view-only hit-stop + a duck + the `bossDown` stinger, its own crunch-boom
voice, a gold shock ring at the body (`render/impactFx.ts`) and the FALLEN card through the
announcer (the old 14 px "FELL" float is gone). A raid organism's death announces "<NAME>
FALLS" as the top-priority card (title + organs ruptured · kill time · FLAWLESS); its centre
callouts and organ labels fade within 0.3 s instead of lingering under it.

### §draft — the pick moment
Picking a gene card COMMITS for 350 ms (`PICK_COMMIT_MS`) before the draft resolves: the chosen
card flares and lifts in its rarity colour, the others dissolve, and a `draftPick@tier` cue (a
thunk + a riser that grows with rarity) replaces the generic click. Hover plays the faint
`hover` tick, and both it and the EXACT VALUES dwell arm only after a REAL pointer move — a
modal that opens under a still cursor no longer drops the opaque sheet over the card being
revealed. Keyboard picks, Auto-Gene and the tutorial (`forceManual`) ride the same commit.

---

## 1. Philosophy

Game feel is **compounding micro-feedback**: every action gets an
*anticipation → impact → reward → escalation* response across **motion, color,
sound, and time**. Dopamine comes from (a) **high-frequency** small hits
(every kill, every coin) and (b) **variable-ratio spikes** (crits, legendaries).
Design for both: a constant satisfying hum + occasional fireworks.

**Build these four foundational systems first — they power most of the list:**

| System | What it is | Powers |
|---|---|---|
| **Trauma-based screen shake** | a 0–1 "trauma" accumulator; shake = trauma²·max, decays ~1.5/s | hits, crits, breaches, boss, prestige |
| **Procedural Web Audio SFX layer** | synthesized, pooled, voice-stolen, ducked | *every* item below |
| **Floating-number pool + aggregation** | one rising number per target per ~120ms | damage numbers, crits, resources |
| **Hit-stop / freeze-frame** | 30–90ms global pause on big impacts | crits, boss hits, kills, legendary |

---

## 2. The audit (prioritized by dopamine ROI)

### ⭐ P0 — Resource collection feedback *(highest ROI: fires every kill)*
- **Why:** the economy loop is the game's heartbeat; *seeing and hearing* biomass flow to you is the single most reliable dopamine source (Vampire Survivors / Diablo gold). Currently a silent number tick — a huge missed opportunity.
- **Visual:** on kill, emit **biomass motes** that **arc to the HUD biomass counter** (or hive core), counter does a **scale-pop + count-up** with a brief glow; kill-streaks spawn more motes; elite/boss = a shower. (Ties into Death §below — the death dissolve *becomes* the motes = assimilation.)
- **Audio:** a bright "blip" per pickup with **ascending pitch on streaks** (the peggle/VS escalation — *the* dopamine lever); when many land at once, collapse into one "shimmer" voice to avoid noise.

### ⭐ P0 — Hit effects *(fires every projectile)*
- **Why:** confirms every hit *connected* — closes the action→feedback loop and makes combat feel physical instead of "numbers quietly dropping."
- **Visual:** **impact spark** at contact (small class-tinted starburst), **target flinch** (2-frame squash + 60ms white flash), a micro-knockback nudge against the flow; AoE/pierce show a thin shock ring. Gate flinch/spark behind the LOD `detail` flag.
- **Audio:** a short percussive per class (Kinetic sharp *tick*, Caustic wet *splat*, Viral *squelch*), pitch-varied ±10%, **voice-pooled** (cap ~8 concurrent; aggregate beyond).

### ⭐ P0 — Screen shake
- **Why:** the brain reads camera motion as force — it makes impacts *felt*. Scaled by event size, it's the connective tissue of weight across the whole game.
- **Visual:** trauma per event (small hit 0.08, crit 0.25, mortar impact 0.2, breach 0.4, boss stomp 0.6, prestige 1.0); shake translates the **camera/canvas**, optional directional kick toward impact; **hard cap** + a user "Screen Shake %" slider; **off under reduce-motion**.
- **Audio:** pair shake with **low-end** — bigger trauma → deeper sub-boom; this is what makes shake feel like impact, not jitter.

### ⭐ P1 — Critical hit effects *(the variable-ratio spike)*
- **Why:** crits are combat's jackpot; they must feel *disproportionately* good to drive the "one more wave" pull.
- **Visual:** **bigger, brighter gold (or pair-colored) number** with an over-pop; a burst spark; **hit-stop 40–80ms** on the crit; extra trauma; big crits add a quick **zoom-punch**. Reactions (Shred/Plague…) are "super-crits" — already have the SHRED flash+float; extend with hit-stop + stinger.
- **Audio:** a distinct rising **"ching"** with body + sub; rarer mega-crits layer a short stinger.

### ⭐ P1 — Death animations *(the kill payoff)*
- **Why:** the kill is the reward; it must *confirm* and *satisfy*, and on-theme it's **assimilation** (you consume the dead).
- **Visual:** quick **scale-pop → implode**, **faction-tinted dissolve** into motes (`PARTICLE.death` exists) that are **drawn toward the hive core/HUD** = biomass (unifies Death + Resource feedback). Boss death = **slow-mo + big burst + shockwave ring + screen flash**.
- **Audio:** wet organic **"pop/squelch"** scaled by enemy size; boss death = layered crunch + boom + brief riser.

### ⭐ P1 — Damage numbers
- **Why:** "numbers go up" is foundational dopamine *and* information — but uncontrolled, it's clutter that violates readability.
- **Visual:** pooled floats; **aggregate per target over ~120ms** (one growing number, not 30 from a fast tower); **size scales with magnitude**; color by type (normal off-white, **crit gold**, reaction pair-color, DoT small/dim, Shred yellow — already used); arc up + fade. **Number-LOD:** in a huge swarm, show only crits/reactions. Player toggle (off / crits-only / all).
- **Audio:** numbers ride the hit SFX (no extra voice); a giant number can tick a soft count-up.

### ⭐ P1 — Card selection feedback
- **Why:** drafting is a *decision* dopamine beat (anticipation → choice → commitment); juice makes the build feel authored, not clicked.
- **Visual:** cards **deal in** with a staggered slide/flip; **rarity shimmer/foil** (Exotic prismatic, STYLE-GUIDE §5); hover = lift + tilt + glow; **select = chosen card pulls forward and flares its category color while the others dissolve**, then a confirm burst + a 0.5s **preview of the effect on the battlefield**.
- **Audio:** per-card deal *whoosh*, hover *tick*, **select = a satisfying *thunk* + a rarity riser** (higher rarity = bigger riser), confirm chord.

### ⭐ P1 — Loot opening feedback
- **Why:** the **meta dopamine engine** — must stay thrilling after hundreds of opens.
- See the dedicated deep design: **`LOOTBOX.md`** (camera, reveal sequence, rarity ceremony, dupes, legendary moments).

### ⭐ P2 — Star upgrade feedback
- **Why:** the progression "ding" — a milestone that must feel earned and celebratory.
- **Visual:** the star **fills with a burst** (pop + radial flare in class color); the card flashes; on the battlefield the unit **pulses and emits an evolution ring** (ties to the "grown" theme — `LIVING-HIVE.md` — and STYLE-GUIDE §11 progression glow). Milestone stars (★5/★8/★10) trigger a **silhouette-change flourish**.
- **Audio:** ascending **power-up chime**, pitch climbing with the star number; **★10 = a triumphant stinger**.

### ⭐ P2 — Prestige feedback *(the biggest single moment)*
- **Why:** prestige is the apex payoff (reset → permanent power); it must feel **monumental** — an ascension — or players won't want to do it.
- **Visual:** a full-screen **ascension sequence** — the hive core swells, a wave of assimilation-light washes outward, the **palette shifts toward the prestige/prismatic treatment** (STYLE-GUIDE §11), currency rains, and the **new-mechanic reveal** presents as a hero card. Trauma builds then releases. **Skippable after first view.**
- **Audio:** a long **riser → boom → choir/synth pad**, a "transcended" stinger, and a **new music layer** added for that prestige tier (so the soundtrack itself escalates with progression).

### ⭐ P2 — Projectile trails *(polish + legibility)*
- **Why:** speed sensation + readability (READABILITY tier 6) — trails make fast shots trackable and satisfying.
- **Visual:** short **class-tinted fading trail** (segment streak or gradient); Kinetic = thin sharp, Caustic = thick wobbly glob trail; **muzzle flash** at origin + **impact puff** at end; obey the size floor/cap. Skip trails under LOD.
- **Audio:** keep mostly silent (every shot = noise); optional very-quiet pooled *fwip*, or only on the first shot of a burst.

---

## 3. Priority matrix

| Item | Frequency | Intensity | Effort | Build order |
|---|---|---|---|---|
| Resource motes + audio | every kill | med | M | **1** |
| Hit effects + SFX | every shot | low-med | M | **2** |
| Screen shake | many events | med-high | S | **3** |
| Crit + hit-stop | frequent | **high** | S | **4** |
| Death dissolve→assimilation | every kill | med | S | **5** |
| Damage numbers (aggregated) | constant | med | M | 6 |
| Card selection juice | per draft | med | M | 7 |
| Star upgrade | per session | high | S | 8 |
| Prestige | per layer | **very high** | M | 9 |
| Loot opening | per session | **very high** | L | see LOOTBOX |
| Projectile trails | every shot | low | S | 10 |

Items 1–5 (all S/M) deliver the **constant combat hum**; 8–9 + loot are the
**rare fireworks**. Ship the hum first.

---

## 4. Discipline — juice without chaos

- **Caps & pooling everywhere:** shake cap, hit-stop cap (never chain), particle/voice pools (reuse the existing `PERF`/`PARTICLE` budgets); audio voice-stealing mirrors particle recycling.
- **Aggregate, don't spam:** damage numbers and resource pickups *merge* under load.
- **LOD juice:** the same `detail` flag that culls embellishments culls sparks/flinch/trails first; crits/reactions/boss FX are LOD-immune.
- **Settings (live-service + accessibility) — SHIPPED 2026-11** (`ui/components/MotionSettings.tsx`,
  in Settings and the in-run pause menu; device prefs `assimilate.motion` in `state/prefs.ts`):
  **Screen shake** 0–100%, **Damage numbers** on/off, **Flashes** on/off. ONE `motionScale`
  (`resolveMotion`) is 0 when the OS asks for reduced motion — unless the player flips the
  **Allow motion** override shown only then — and it zeroes shake, the wave/boss push-in, the
  assimilation camera breath, hit-stop and full-screen flashes (ascension bloom, biome and
  mega-death flashes, the wave-breach and mutation flashes via `.game[data-motion|data-flashes]`).
  Reduced motion also renders centre-stage cards static (they used to collapse to an invisible
  0.01 s animation). Still open: master/SFX volume sliders, "fast feedback" ceremony trim.
- **Hit-stop is global but tiny** (≤120 ms — the boss-fall / branch beat; ≤60 ms for ult
  impacts) and never stacks — it punctuates, it doesn't lag.

---

## 4b. Input responsiveness & accidental-click guards

Snappy input is its own kind of juice — every control reacts on contact and no action fires by accident.

- **Tactile press:** every `button` scales+sinks on `:active` (`scale(0.98)`, 0.12s) so a tap *feels* registered before its effect lands. Mutation-buy nodes share the same press timing.
- **Click-vs-drag (battlefield):** `GameView` records the press origin; a pointer that travels > `CLICK_SLOP` (8 screen px) before release is treated as a drag and the click is swallowed — a stray drag never places a tower, casts an ability, or moves the rally. Verified live (drag over empty slots = no placement; tap = placement).
- **Draft input-arm:** `DraftModal` ignores picks for `DRAFT_ARM_MS` (260ms) after it opens, covering the card entry animation so a click/keypress in flight as a wave clears can't blow through the draft. The Auto-Gene countdown (10s) is unaffected.
- **Tooltip hover-intent:** `.tt-bubble` waits 140ms before showing (instant to hide), so sweeping the tower rail doesn't strobe tooltips.
- **No layout shift on phase change:** Build-Phase controls are an overlay, not a toolbar row (see CARDS/HUD) — entering/leaving prep never moves the battlefield.

---

## 5. Audio system foundation (since none exists)

- **Approach:** a small **Web Audio** module — synthesized SFX (oscillators + noise + envelopes) for an **asset-free, instantly re-themeable** layer; categories: *bio* (wet, organic — hive/death/growth), *kinetic* (sharp — hits/crits), *glitch* (enemies/Aberrations), *UI* (clean — cards/menus), *event* (risers/stingers — stars/prestige/loot).
- **Mix discipline:** a master bus + SFX/music/UI sub-buses; **duck** SFX under stingers (crit/legendary); **voice cap** per category with stealing; pitch-randomize repeats to avoid machine-gun fatigue.
- **Music:** an adaptive bio-industrial bed that **intensifies with pressure** (reuse the renderer's `pressure` value) and **gains a layer per prestige tier** — the soundtrack escalates with progression.
- **The dopamine lever to nail first:** the **ascending-pitch resource/loot riser**. More than any visual, rising pitch = "good things are happening." It's cheap to synthesize and it's the backbone of the satisfying loop.


## §music — the soundtrack engine (src/audio/music.ts)

An actual composition system, not ambience (the explicit design bar: melody · harmonic
progression · rhythm · percussion · bass · evolving structure — all TEST-PINNED in
`src/audio/music.test.ts` against the pure bar renderer):

- **Tracks are data** (`TRACKS`): tempo, key/scale, chord progression, authored lead motif, and
  per-layer intensity gain ranges. Six categories: **menu** (the 92 BPM E-minor "Hive theme":
  16-bar i–VI–III–VII / i–VI–iv–V loop, 4-bar breathing intro, 8th-note bass with chromatic
  approaches, mechanical kick/snare/hat kit with phrase-end fills, A/B re-voiced 16th arps,
  a long haunting lead that sits out half of every cycle, organic pad UNDER the mix) ·
  **combat** · **boss** (phrygian, 126 BPM) · **victory** / **defeat** (one-shot cadences) ·
  **events**.
- **The manager** (`music`): lookahead scheduler (bars render ~150 ms ahead — a handful of
  short-lived nodes per note, no per-frame work), intro → loop-region playback, ~2 s crossfades
  between categories, per-layer gain buses.
- **Adaptive seams (no hardcoded playback):** callers only request a CATEGORY
  (`music.play('boss')`); `setIntensity(0..1)` maps onto each layer's authored gain range
  (boss → 1 today; low-health percussion swaps ride the same lever) and `setLayerGain` targets
  one layer (future: prestige melody layer). Wired: App plays `menu` across the Command Center
  (first-gesture autoplay unlock); GameView drives combat/boss (live boss banner) and the
  victory/defeat cadences; the Hub audio toggle governs it.

## Music addendum — the Colossus Hymn + mix glue

Mega raids own a dedicated composed piece (`TRACKS.mega`, "the Colossus Hymn"):
84bpm half-time processional in C harmonic minor (i→bVI→bII→V twice, darkening),
a long cantus motif, and intensity swelling the choir layers — burning a weak point
audibly angers it. GameView hands off mega→boss→combat per banner state. The cue
layer now sidechain-DUCKS the score under heavyweight stings (mega arrival/death,
phase cracks, weak-point ruptures, splices) via `music.duck(depth, seconds)` — one
soundtrack, not two layers.

## §intro — the opening cinematic (the cold open)

The first boot opens on a fully SCORED procedural film (`ui/InitCutscene.tsx` — the projector;
`render/introScenes.ts` — the five set-piece painters + the dive), replayable from Settings → Help:

- **Pre-roll gate.** "INCOMING TRANSMISSION — TAP TO RECEIVE": the one tap the browser's autoplay
  policy demands, staged diegetically. The tap unlocks the AudioContext, rolls the `cinema` score
  (`TRACKS.cinema` — a 62bpm D-minor processional, percussion nearly absent), and starts the film
  at t=0, fully scored.
- **A film, not a slideshow.** One master timeline; scenes are DATA (`SCENES`): staged copy LINES
  with per-line reveal times, and sound-design BEATS — scene-relative times firing `cin_*` cues in
  sync with the visuals (radar pings ride the sweep, the heartbeat rides the core's 1.9s
  double-thump, the title swell lands with the wordmark). The score's intensity seam walks 0→1
  scene-by-scene. Letterboxed; each set-piece runs under a slow camera drift (Ken Burns push/pan);
  tap = next scene, Skip = out; the title card waits for the player.
- **THE DESCENT.** Leaving the title never hard-cuts: `drawDiveTransition` dives from the looming
  nucleus down a living tunnel and blooms white-gold into the next screen — the tutorial on first
  boot (whose letterboxed cold-open banner picks the film's voice straight up), the menu on a
  replay. App hands the music baton on landing (`combat`/`menu`).
- **Accessibility.** prefers-reduced-motion swaps the animation for a hand-picked still per scene
  (gentle CSS fades), skips the dive, and shows typewriter text whole.
