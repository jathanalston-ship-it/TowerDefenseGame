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

**Adding a `MEGA_BOSS_DEFS` entry REQUIRES adding its defeat cutscene** (`kind: 'mega'`,
id `mega:<megaId>`) in `core/cutscenes.ts`. `cutscenes.test.ts` fails the build otherwise —
this is a content contract, not a convention. The DIL records the same edge
(`system:mega-bosses` → `system:cutscenes`).

A new mega's film is usually **pure data**: 2–3 scenes over the existing painter library,
themed by the mega's palette, with copy + `cin_*` beats. Budget ~30 minutes of authoring.

## §data — a cutscene is data

`CutsceneDef`: id (`mega:*` / `story:*`), title, subtitle, palette `{body, glow, accent}`
(themes every painter), `unlock` (data — see §unlocks), `unlockHint` (the Archive's locked
card), `boost` (§boosts), and `scenes[]` — each `{painter, durMs, lines[{at, text, em}],
beats[{at, cue}]}`. Beats speak only the cinematic cue set (`cin_ping/alarm/rumble/shriek/
creep/snap/heart/bloom/title/cut/dive`); the quality gates (≥2 scenes, ≥4 lines, timings
inside the hold, painters registered) are test-enforced.

## §painters — the reusable tableau library

`render/cutsceneScenes.ts` exports `CUTSCENE_PAINTERS`: **behemoth, maw, choir, herd, tide,
tithe, lab, countdown, molt, deep, veinsplit, root** — full-screen procedural set-pieces
`(ctx, w, h, t, theme)`, deterministic in `t`, drawn under per-painter camera drift with the
intro's cross-dissolve (`drawCutsceneFrame`). `CUTSCENE_REDUCED_T` holds each painter's
hand-picked still (reduced motion + the Archive's card art via `drawCutsceneStill`).
Prefer re-theming an existing painter for new content; add a painter only for a genuinely
new visual idea (then give it a DRIFT row + a reduced still — the test checks coverage).

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
lands even on a skip. Reduced motion: one still per scene, CSS fades only. The caller owns
what the music does after (`music.play('menu')`).
