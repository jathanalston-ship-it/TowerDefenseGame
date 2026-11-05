# MUSIC — the Adaptive Soundtrack

> Engine: `src/audio/music.ts` · Tests: `src/audio/music.test.ts` · Dev console: `src/ui/MusicDebug.tsx`
> (Settings → Music Console, dev/debug builds). SFX + the cue→stinger bridge: `src/audio/sound.ts`.

ASSIMILATION's score is **actual music, never ambience**: every track is a composition with a
recognizable melody, a countermelody, bass motion, drum grammar, a harmonic progression, and
evolving structure — synthesized live in WebAudio (asset-free, ships no files). The whole
soundtrack is **data**: tracks, motifs, and stingers are rows in tables; the engine never grows a
special case for new content.

---

## 1. Architecture — two halves

### The pure composition core (exported, unit-tested)

- `MOTIFS` — the motif library (see §3).
- `TRACK_LIBRARY: TrackDef[]` — every track as data: `bpm`, `root` (MIDI key), `scale`,
  `progression` (one chord degree per bar), `introBars`, `motif` / `counterMotif` (references
  into `MOTIFS`), `scenes` (hub nav keys it serves), `lateWeight` (progression bias),
  `rotateAfterLoops`, `oneShot`, and 8 per-layer `[min, max]` gain ranges.
- `barNotes(track, bar)` — deterministically renders ONE bar of notes for every layer
  (same bar → identical notes; provable musicality with no AudioContext).
- Selection is pure too: `pickTrack(category, { exclude, scene, tier, roll })` and
  `bossTrackFor(bossKey)` take explicit inputs, so tests pin their behavior.

### The WebAudio player (`music` — the manager singleton)

- **Lookahead scheduler** (150 ms lookahead, 40 ms tick): bars are rendered slightly ahead of
  the clock — sample-accurate, no pops, seamless loops.
- **Per-layer gain buses + fixed stereo stage** (`LAYER_PAN`): bass/kick centred, arp left,
  lead right-of-centre, texture wide left, choir right — a wide professional image.
- **Mastering chain**: track buses → master gain → duress low-pass (transparent at 18 kHz) →
  `DynamicsCompressorNode` glue (−18 dB threshold, 3:1) → destination. Stacked layers +
  stingers can't clip; loudness stays consistent.
- **Level + volume**: the master's designed level is `MUSIC_LEVEL` **0.7** — set in the 2026-11
  sound pass against the MEASURED SFX mix (steady combat sits level with the bed; rewards and alerts
  land over it — docs/AUDIO.md §2, docs/AUDIO_REPORT.md §balance). `music.setVolume(v)` takes the
  player's Settings → Music volume (0..1) and scales that level; ducks and duress ride on top.
- **Bar-aligned equal-power crossfades**: a category switch lands on the outgoing track's next
  bar boundary (capped at 0.35 s for urgent arrivals — boss/mega/victory/defeat — 2.2 s
  otherwise) and crossfades on cos/sin curves, so the pulse never stumbles and there is no
  mid-fade loudness dip.
- **Rotation**: after `rotateAfterLoops` full loops the same category re-picks (current track
  excluded) on a bar boundary — menus and long runs never fossilize.

Callers only ever request a **category** (`music.play('combat')`); track choice, transitions,
and playback are entirely the manager's business.

## 2. The 8 adaptive layers

| Layer | Voice | Role |
|---|---|---|
| `bass` | sawtooth, low-passed | driving 8ths rooted on the harmony; chromatic approach into the next bar; B halves pivot to the chord fifth |
| `drums` | synthesized kit | kick 1&3 (+B-half syncopation), snare 2&4, 8th hats, phrase-end fills, phrase-open crash (MIDI 49) |
| `arp` | square, filter sweep | 16th arpeggio over the chord; pattern A rises, pattern B rocks |
| `lead` | sawtooth + vibrato | **the authored motif** — 2-bar phrases with rests; sits out half of each 16-bar cycle; +octave shimmer in B halves |
| `pad` | triangle, dark | one chord swell per bar — the harmonic bed, never a drone lead |
| `texture` | sine blips | sparse bio-clicks (organic technology), seeded off-grid |
| `choir` | detuned triangle twins + slow vibrato | **the countermelody** (`counterMotif`), long tones an octave up; hums chord colour if none authored |
| `hits` | sub-drop + metallic band slam | industrial impacts opening B-half bars + doubling phrase ends — sparse by design |

**The intensity seam** (`music.setIntensity(0..1)`): each layer's gain maps across its authored
`[min, max]`. Combat/boss tracks author `choir`/`hits` as `[0, x]`, so rising intensity
**literally adds instruments** — the battlefield awakens. The Assimilation Index raises the
intensity *floor* (`assimilation.ts → musicIntensity`); live combat pressure spikes it
(GameView run loop). Intensity can only ADD (gain max ≥ min — test-enforced).

**Duress** (`music.setDuress(0..1)`): the near-death treatment. Under 35 % Nucleus integrity
(GameView) the master low-pass sweeps 18 kHz → ~700 Hz with slight make-up gain — the mix
drowns, fully reversibly. Reset to 0 on run end and on returning to the menu.

## 3. The MOTIF system — themes players remember

Melodies live in ONE table (`MOTIFS`, scale-degree arrays; `-1` = rest) and tracks *reference*
them (`motif` = the lead voice, `counterMotif` = what the choir sings against it). The same
theme recurs across menus, combat, and bosses in different keys/tempos/registers:

| Motif | Identity | Heard in |
|---|---|---|
| `hive` | the main theme — the organism itself | menu_hive lead; combat_strain lead; victory counter; bloom/command counters |
| `assimilation` | the rising takeover figure | menu_command lead; combat_overrun lead; boss_neural lead; mega + apex-swarm counters |
| `hero` | the defiant counter-voice | menu_vault + event lead; menu_hive + combat_strain counters |
| `nucleus` | the rocking lullaby of the core | menu_bloom lead; vault + defeat counters |
| `swarm` | hammering repeated-note aggression | combat_apexswarm lead |
| `apex` | the boss challenge figure (phrygian snarl) | boss_apex lead; boss counters |
| `colossus` | the Mega Boss processional hymn | mega_colossus + boss_marrow leads |
| `triumph` | the victory cadence | sting_victory lead |
| `lament` | the defeat elegy | sting_defeat lead |

## 4. Track categories & selection

- **menu ×4** — each hub wing has an identity (`scenes` tags on nav keys): Command Center
  (`hive`), Peaceful Evolution (labs), Overmind Ascendant (prestige/store — `lateWeight` 2.2,
  so veterans hear it more), The Living Archive (collection wings). `Hub` calls
  `music.setScene(nav)`; the scene **biases the next pick** (rotation actually switches tracks,
  so browsing never stutters the score).
- **combat ×3** — a run's musical arc: Opening Strain → Overrun → Apex Swarm (`lateWeight`
  surfaces the harder tracks for veterans; rotation walks the arc on long runs).
- **boss ×3** — three theme families (Apex Challenge / Marrow Tyrant / Neural Cathedral).
  `GameView` passes the banner name: `music.play('boss', { boss: name })`.
- **mega ×1** — The Colossus Hymn: slowest tempo, deepest root, 16-bar harmonic-minor
  processional; choir present from the start.
- **victory / defeat** — one-shot cadences (play once over the fading bed, end silent).
- **events ×3** — the special-mode voice (The Daily Pulse / Worldwide Relay / Mutation
  Protocol). `GameView` routes DAILY runs here between bosses — the seeded worldwide
  gauntlet has its own identity instead of borrowing plain combat; the three identities
  rotate across a run (Boss Rush keeps the combat→boss arc: its identity IS the boss themes).
- **cinema ×1** — The Cold Open: the opening cinematic's 62 bpm processional; percussion nearly
  silent (the film's SFX beats carry the pulse), intensity driven scene-by-scene by
  `InitCutscene` (0 at the listening post → 1 at the title, where the choir sings the `hive`
  theme under the wordmark).

`pickTrack` weighting: scene-tagged pool (if any match) → exclude the just-played id → weight
`1 + lateWeight × progressionTier` (`music.setProgression(0..1)`; App sets it from campaign
depth + molts, saturating ~stage 30).

**Per-boss identity**: `bossTrackFor(bossKey)` — explicit `BOSS_THEME_OVERRIDES[key] = trackId`
first, else a stable FNV-1a hash into the boss slice. The same boss always brings the same
music, forever, with zero code.

## 5. Stingers — reward payoffs

`STINGERS: Record<StingerId, StingerNote[]>` — short melodic gestures in the score's E-minor
home-key family (test-enforced), played by the lead voice over the score without stopping it:
`legendary · achievement · unlock · prestige · bossDown · chapter · mastery · power`.
Legendary + prestige also duck the score (they own their moment).

**Wiring** (`sound.ts`): the ONE feel table (`render/feel.ts` `FEEL`, docs/GAME-FEEL.md
§feel table) carries each cue's `stinger` + `duck` beside its shake/hit-stop — `jackpot→legendary`,
`achieve→achievement`, `mastery→mastery`, `rankup→unlock`, `power→power`, `strandFound→discovery`,
`megaDeath→bossDown`, `bossFall→bossDown` (the sim's stage-boss death cue) — with a 6 s
per-stinger throttle, so every existing and future `audio.cue(...)` call site pays off musically
with no per-site wiring. Direct calls: PrestigePanel molt → `prestige`; Results first-clear →
`chapter`. `src/audio/cues.test.ts` fails the build on any cue/stinger id that resolves nowhere.

## 6. Debug tools — the Music Console

Settings → **Music Console** (dev builds / debug opt-in; `src/ui/MusicDebug.tsx`):
now-playing readout · force any category transition (hear the crossfade) · audition any exact
track · boss-name → assigned-theme preview (type any name, see + play its hash assignment) ·
intensity / duress / progression sliders · scene bias selector · per-layer gain pushes + mix
reset · all stingers · **pin** (manual override: rotation and app category requests are ignored
until unpinned — console force-plays still work).

## 7. Adding content = data (the workflows)

- **New track**: one `TRACK_LIBRARY` row (pick category, key, tempo, progression, motif refs,
  scenes, layer gains). Nothing else.
- **New boss**: nothing — it hash-assigns a stable theme. To author it instead:
  `BOSS_THEME_OVERRIDES['Boss Name'] = 'boss_track_id'`. For a new *theme family*: add a
  `category: 'boss'` track row (+ optionally an override pinning the boss to it).
- **New motif**: one `MOTIFS` row + reference it from tracks (`motif`/`counterMotif`).
- **New stinger**: one `STINGERS` row (+ a `stinger` field on the cue's `FEEL` row in
  `render/feel.ts` if it should ride an existing cue).
- **New menu scene**: tag the nav key in a menu track's `scenes` (Hub already publishes every
  nav change).
- **New adaptive input**: call `setIntensity` / `setDuress` / `setScene` / `setProgression` —
  the manager owns how they land in the mix.

## 8. Invariants (test-enforced — `music.test.ts`)

- Every category covered; menu ≥ 4, combat ≥ 3, boss ≥ 3 tracks; unique ids; 8 layers each.
- Gain ranges: `0 ≤ min ≤ max ≤ 1` (intensity only ADDS); combat/boss choir+hits start at 0.
- Victory/defeat are the only one-shots. `rotateAfterLoops ≥ 2` where present.
- Every motif has notes AND rests; ≥ 3 motifs recur across ≥ 2 categories.
- `barNotes` deterministic; every pitched note in-scale (bass may approach chromatically).
- Menu default is a real composition: ≥ 4 distinct chords, kick/snare/hat grammar + fills +
  crashes, rooted 8th bass, motif present but breathing, choir countermelody, hits in B halves,
  intro ≠ loop, A/B halves differ.
- `pickTrack` deterministic under a fixed roll; scene routing; exclude never empties the pool;
  `lateWeight` bias grows with tier. `bossTrackFor` stable + override-respecting.
- Stingers: every id authored, sane velocities, home-key family.

## 9. Known limitations / future hooks

- Synth voices are oscillator-based (asset-free by design) — swapping a voice for samples would
  be a `voice()`/`drum()`/`hit()` change only; the composition core wouldn't move.
- `setLayerGain` overrides last only until the next `setIntensity` or track switch (dev tool).
- Scene bias affects the NEXT pick by design (no hard switch on nav click); a future
  "scene stinger" could acknowledge navigation musically without switching tracks.
- The events category (×3, daily-wired) grows with future event MODES (one row each);
  LiveOps calendar weeks color the HUB (menu scene bias), not run playback — by design.
