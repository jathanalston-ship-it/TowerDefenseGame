# STORY CUTSCENES — the Memory Archive

> Fully animated story films, unlocked by play and collected forever. A mega boss's FIRST
> defeat premieres its own cutscene after the run's reward summary; four story beats unlock
> from account milestones. Every recovered memory replays from the **Memory Archive**
> (Collection screen) and grants a **small permanent passive** — a collectible with teeth.

Files: `src/core/cutscenes.ts` (defs + lookups) · `src/render/cutsceneScenes.ts` (the
tableau painters) · `src/ui/CutscenePlayer.tsx` (the film engine) · unlock resolution in
`src/save/derive.ts` · premiere lane + Archive view in `src/state/meta.ts` · Archive UI in
`src/ui/CollectionPanel.tsx`. Tests: `src/core/cutscenes.test.ts` (content contract + THE
RULE) · `src/state/cutscenePremiere.test.ts` (the premiere lane).

---

## §rule — ENFORCED: every mega boss ships a cutscene

### Reading and keyboard access

The story player and opening cinematic offer **Read at my pace**: all text in the current scene is revealed,
and scenes and the final memory card wait for explicit advancement. Auto-play restores
the normal hold from its beginning. **Next scene** is a native keyboard/touch button;
Escape skips to the memory card, then closes it; in the opening film it exits through the existing descent (immediately under reduced motion). Focus stays within the film and returns
to the launching control when it closes. Controls have 44px minimum height. Reduced-motion
stills redraw after viewport changes so rotating a phone cannot clear the artwork.

**Adding a `MEGA_BOSS_DEFS` entry REQUIRES adding its defeat cutscene** (`kind: 'mega'`,
id `mega:<megaId>`) in `core/cutscenes.ts`. `cutscenes.test.ts` fails the build otherwise —
this is a content contract, not a convention. The DIL records the same edge
(`system:mega-bosses` → `system:cutscenes`).

A new mega's film is usually **pure data**: 2–3 scenes over the existing painter library,
themed by the mega's palette, with copy + `cin_*` beats. Its FIRST scene paints the mega
itself (painter `'mega'` + a `mega` arc — §premieres; test-enforced). Budget ~30 minutes.

## §data — a cutscene is data

`CutsceneDef`: id (`mega:*` / `story:*`), title, subtitle, palette `{body, glow, accent}`
(themes every painter), `unlock` (data — see §unlocks), `unlockHint` (the Archive's locked
card), `boost` (§boosts), and `scenes[]` — each `{painter, durMs, lines[{at, text, em}],
beats[{at, cue, impact?}]}` plus the optional direction rows `copyAt`, `camera`, `punch`,
`mega` (§direction). Beats speak only the cinematic cue set (`cin_ping/alarm/rumble/shriek/
creep/snap/heart/bloom/title/cut/dive/erupt/feed` — `erupt` a defender bursting from the ground, `feed`
the swarm breaking and its biomass going home; both added with the opening film's answer scene); the quality gates (≥2 scenes, ≥4 lines, timings
inside the hold, beats in clock order, painters registered, ≥1 impact beat per film) are
test-enforced.

## §painters — the reusable tableau library

`render/cutsceneScenes.ts` exports `CUTSCENE_PAINTERS`: **behemoth, maw, choir, herd, tide,
tithe, lab, countdown, molt, deep, veinsplit, root, mega** — full-screen procedural set-pieces
`(ctx, w, h, t, theme, fx)`, deterministic in `t`, drawn under the film direction layers
(§direction) with the intro's cross-dissolve (`drawCutsceneFrame`). Each painter's mid layer
reads `fx.beat` (a decaying kick from the latest beat) / `fx.surge` (one eased step per beat)
so its subject moves ON the score. `CUTSCENE_REDUCED_T` holds each painter's hand-picked still
(reduced motion + the Archive's card art via `drawCutsceneStill`; `cutsceneStillT(scene)`
picks a Mega scene's still from its arc). Prefer re-theming an existing painter for new
content; add a painter only for a genuinely new visual idea (then give it a DRIFT row + a
reduced still — the test checks coverage). `behemoth` and `tide` (the old stand-ins for a
falling mega) no longer open a shipped film but stay in the library.

## §direction — films that move (docs/SIGNATURE-MOMENTS.md §3)

`render/filmDirection.ts` gives every scene of every film — the opening film
(`render/introScenes.ts`) and every cutscene — three motion layers, deterministic in the
scene clock and allocation-free per frame:

1. **Camera** — a slow drift across the scene's hold (the scene's `camera {zoom, dx, dy}`, else
   its painter's DRIFT row; subtle by the owner's call: **2–3 %**) plus a **punch** on every beat
   marked `impact: true` (`punch` per scene,
   default `FILM.punch.zoom` = 4.5 %, hard ceiling 6 %; 25 ms rise, ~120 ms total).
2. **Mid layer** — the painter's subject animates on the score's beats (`fx.beat`, `fx.surge`):
   the radar throws a contact ring per ping, the crust lurches and the swarm surges per rumble,
   the veins lunge and the steel shudders per snap, the core throws a shockwave per heart, the
   countdown rings step inward per count, the strata drop a step per beat…
3. **Foreground** — out-of-focus particulate in the scene's light, drawn over the tableau under
   a parallaxed copy of the camera (`FILM.foreground`).

**Copy placement:** a scene's `copyAt` (`'center' | 'upper' | 'lower'`, default centre) puts its
copy on the tableau's measured quiet band (`.intro-stage.is-copy-*` in index.css) — the intro's
core scene sits its copy BELOW the Hive Core, Mega scenes under the organism.

**Reduced motion** (the OS request unless Settings → Motion overrides it — `resolveMotion`,
resolved live throughout the showing): one still per scene, no drift, no punches, no flashes; the same copy
on the same timing; Skip / tap-to-advance unchanged. Tunables: `FILM` (filmDirection.ts) and
`MEGA_SCENE` (cutsceneScenes.ts) — the owner's dials.

## §premieres — the mega, in full

A mega film's first scene uses painter **`'mega'`**: the film's OWN organism, painted by the
raid's painter through `render/megaboss.ts` **`drawMegaPose(ctx, defId, pose, now)`** — the
same `drawMegaBody` + `drawMegaOrgans` on a cached pose rig (its final, most-mutated form),
with the raid's render one-shots parked around the call so a pose never disturbs a raid. The
scene's `mega: {reveal, ignite, fall?}` arc (scene seconds) poses it: a **silhouette** resolving
out of its own backlight by `reveal` → the **weak points ignite** one by one from `ignite`
(the maw gathering, organs flaring on every beat) → **the fall** from `fall` (organs rupture with
a light bloom off the mass, the body collapses, drains and sinks, embers rise). The fall lands on
an `impact` beat. Reduced motion shows the organism in full: just after its last organ lit,
before any fall (`cutsceneStillT`). Framing (`MEGA_SCENE.fit`): the mass along the top, organs
hanging into frame, copy `lower`; phone portrait crops the sides, strips (the Archive card) fill
their width.

## §unlocks — derived, never stored

`save/derive.isCutsceneUnlocked(save, def)` resolves the unlock DATA against the save — no
new save fields, nothing to migrate or sync:

| unlock | satisfied by |
|---|---|
| `{kind:'mega', megaId}` | `save.megaProgress.slain` includes the def |
| `{kind:'stage', stage}` | `highestCampaignStage(save) ≥ stage` |
| `{kind:'molt'}` | first Ascension molt performed |
| `{kind:'wave', wave}` | `save.bestWave ≥ wave` |

Launch content: 5 mega films (voraxis/meridia/ossira/vesperine/moloch_ama) + 4 story beats
(Stage 3 · Stage 12 · first molt · Infinite wave 40), each from a DISTINCT door
(test-pinned).

## §autoplay — the premiere after the reward summary

The `megaKilled` ledger lane already knows a FIRST defeat (`!slain.includes(defId)`); it
queues the film into a module buffer that `finishRun` drains into
`RunOutcome.megaCutscenes`. The App plays the queue **when Results is dismissed** — reward
summary first, story second — chaining multiple premieres in kill order, then hands the
score back to the menu theme. Repeat defeats premiere nothing (the Archive replays forever).
Story-milestone films do NOT autoplay — they light the Collection badge and wait in the
Archive, like cosmetics.

## §archive — the collectible shelf

The Collection screen's **Memory Archive**: one card per cutscene — painted thumbnail (its
own opening tableau), MEGA/STORY kind tag, title + subtitle when recovered (locked cards
show `· · ·` + the unlock hint), the passive it grants, and **▶ Watch** (the same
CutscenePlayer, fullscreen). A `collection.memories` notification source badges new
recoveries on the Collection nav.

## §boosts — small, permanent, test-capped

Each memory grants one `CardEffect`, folded beside the other permanent lanes
(`meta.cutsceneRunEffects()` in the App's run-effects assembly). **Smallness is enforced**:
`mul` values must sit in `[0.98, 1.02]`, flat adds only on whitelisted fields with tiny caps
(`startBiomassBonus ≤ 20`). A fresh save unlocks nothing ⇒ zero effects ⇒ baseline sims and
the golden test never move. All nine boosts together are worth roughly one common gene card
— flavor-weight, deliberately.

## §player — the film engine

`CutscenePlayer` reuses the intro's film chrome (letterbox, grade, timed copy, beat-synced
cues, the `cinema` score with an intensity walk) over `drawCutsceneFrame`. Tap advances,
Skip jumps to the **coda** — "MEMORY ARCHIVED · title · boost" — so the collectible moment
lands even on a skip. Reduced motion: one still per scene, CSS fades only (§direction). The
frame spec is one object per showing, mutated per frame (no per-frame allocation). The caller
owns what the music does after (`music.play('menu')`).

Live film preferences: CutscenePlayer subscribes to device settings and OS motion changes without resetting scene/copy/reading clocks. Returning from reduced to animated playback consumes elapsed sound beats silently; only future beats play. Flash changes update the projector. Reduced stills repaint on scene/coda/resize changes, including the ending-card dim, and listeners/projector frames clean up on unmount.

Hidden-tab story playback: CutscenePlayer pauses the remaining scene/coda timeout, projector, and caption CSS animations on visibilitychange. Resume offsets current/previous visual clocks by hidden duration, preserving beat timing without catch-up. Manual reading retains its existing timer behavior; a film mounted hidden waits to begin visible playback. Visibility listeners, timers and frames are removed on cleanup. Background music preference/ownership is unchanged.
