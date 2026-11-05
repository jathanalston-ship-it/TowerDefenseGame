# AUDIO — the SFX mix, its mastering, and the audit that measures it

The game's sound effects are **synthesized** (`src/audio/sound.ts` — ~130 cue functions over a few
voice primitives, dispatched by `audio.cue(tag)` / `audio.cueBatch(counts)`). The score is a separate
engine with its own mastering (`src/audio/music.ts`, docs/MUSIC.md). This doc owns everything between
"a cue fires" and "the speakers": the **mix table**, the **SFX bus**, **variation**, **space**, the
**volume settings**, and the **offline audit** that measures it all (`npm run audio:audit` →
docs/AUDIO_REPORT.md). Cue *semantics* (what each moment should feel like) stay in docs/GAME-FEEL.md.

Nobody can listen inside CI or an agent container, so the rule is: **levels are measured, never
guessed.** Edit a synth → run the audit → paste its suggested trims.

## 1. Architecture

```
voice (tone / noise / thump / unison)
  → category bus ─┬─→ SFX bus → glue compressor → limiter → soft clip → master (volume) → speakers
                  └─→ send (per category) → ONE shared convolver (generated IR) → SFX bus
            a −120 dBFS keep-alive constant ──→ SFX bus (keeps the dynamics processing — §defects)
```

Built **once** per AudioContext (`buildGraph`, ~20 nodes). A cue only ever adds its own short-lived
voices (oscillator + gain, or buffer source + filter + gain).

- **`src/audio/sfxMix.ts`** — pure data + helpers, no AudioContext: `SFX_CATEGORIES`, `CUE_MIX`,
  `SFX_MASTER`, `drawVariation`, `mixOf`, `dbToGain`. The tests and the audit read the same rows.
- **`src/audio/sound.ts`** — the dispatcher sets the cue's mix around one dispatch (category bus,
  measured trim × variation level, variation pitch, start jitter — module scalars like the Wardrobe's
  `wdPitch`, so the hot path allocates nothing) and every primitive reads it.
- **`scripts/audio-audit.ts`** — the offline renderer + meter (§audit).

## 2. The mix table (`CUE_MIX`, `SFX_CATEGORIES`)

Every dispatcher `case` has exactly one row: `{ cat, rel, trimDb, pitch? }`.

- **Category** — owns the loudness target, reverb send, variation bounds and voice budget.
- **`rel`** — DESIGN intent: dB from the category target (tiers: `toast0` −8 < `toast1` −5 < `toast2` −2;
  the boss sting +1 over the wave horn −2; `hover` −9 under a click).
- **`trimDb`** — the MEASURED correction the audit derives: `trimDb = (target + rel) − rendered loudness`.
  Never hand-tune a literal inside a cue function; re-run the audit.

Category targets — momentary-max LUFS (400 ms, K-weighted) of ONE cue at the default volume:
combat-frequent **-35** · impact **-28** · reward **-21** · alert **-21** · UI **-35** · cinematic **-27** · ambient **-47** LUFS-M.

| category | what | send | variation (pitch / level / jitter) | voices |
|---|---|---|---|---|
| combatFrequent | per shot / hit / death (tfire_*, br_*, hit, kill, edie_*) | 0 (dry) | ±3 % / ±1.5 dB / 0–6 ms | 22 |
| combatImpact | player actions + heavy hits (place, splice, ability, mega phases) | 0.08 | ±2 % / ±1 dB / 0–3 ms | 12 |
| alert | threat arrivals, the Hive in danger (wave, boss, breach, mega themes) | 0.14 | exact | 12 |
| reward | the dopamine layer (clear, chest, reveal, levelup, unlock, draftPick…) | 0.2 | exact | 14 |
| ui | clicks, hover, launch, tutorial steps | 0.025 | ±1.2 % / ±0.5 dB / — | 6 |
| cinematic | the opening film's `cin_*` beats, biome transitions | 0.32 | exact | 14 |
| ambient | the living battlefield's murmurs (org_*), idle-ready, graft pulse | 0.18 | ±2 % / ±1 dB / — | 4 |

Musical categories (reward, alert, cinematic) never vary: their pitches are intervals and the film's
beats are timed to the picture. The kill-streak ping keeps ±0.6 % (its ladder climbs in semitones).

**Balance against the score** (measured in the audit's montage): the score's designed level is
`MUSIC_LEVEL` in music.ts; steady combat SFX sit level with the bed, the swarm wipe and the reward
chain land ~2–3 dB over it. Prominent rewards/alerts (`rel > −4`) without a FEEL duck row also dip the
score by their category's `duck` (reward 16 % / 0.7 s, alert 20 % / 0.9 s). FEEL rows still win; a
REPEATING cue opts out with `duck: false` (the critical-integrity heartbeat, the draft/equip confirm).

## 3. Mastering (`SFX_MASTER`)

- **Glue** — `DynamicsCompressorNode` 2:1 above −16 dB (4 ms / 200 ms): stacked voices sit together.
- **Limiter** — 20:1 above −4 dB, 1 ms attack: a swarm wipe lands loud, never clipped.
- **Soft clip** — a `WaveShaper`, linear to 0.9 of full scale then a tanh shoulder: the last-resort
  ceiling for whatever a limiter attack lets through.
- **Output** — the master is `SFX_MASTER.output` (0.75, the pre-pass default volume) × the player's
  Effects volume.
- Note: Web Audio's compressor applies automatic make-up gain (~+6 dB here on quiet material). The
  trims absorb it — another reason levels must be measured.

## 4. Variation (`drawVariation`)

One draw per dispatch (per tag per `cueBatch` frame), three values in a fixed order — pitch, level,
start jitter — applied to every voice of the cue, so a cue varies as a whole and its layers stay in
tune with each other. Stacked instances inside one dispatch keep their old `i` detune. On top, every
noise voice reads the shared looped noise buffer from a random offset, so no two hits are
sample-identical. The RNG is injectable (`sfxDev.setRng`, tests pin it; `null` = no variation).

## 5. Space

One `ConvolverNode`, created once, with a generated IR: decorrelated stereo noise under a 1.5 s RT60
decay that darkens as it fades, 14 ms pre-delay, 1.4 s long, scaled to **unit energy** (the browser's
own normalisation sits ~58 dB down, so `normalize` is off). Per-category send gains feed it; a
category with send 0 has no send node at all, so ordinary combat never keeps the convolver awake.
Measured tails (dB under the cue's loudest 50 ms): frequent combat dry, UI ≈ −35, impacts and alerts ≈ −26…−29,
rewards ≈ −27…−29, cinematic ≈ −17…−22.

## 6. Voice primitives and the layered cues

- `tone(freq, dur, type, peak, slideTo?, at?)` — one oscillator; `at` delays it inside the cue
  (arpeggios, layers).
- `noise(dur, peak, filterFreq, slideTo?, at?, type?)` — filtered looped noise; `type` 'highpass' /
  'bandpass' makes transients.
- `thump(freq, dur, peak, at?)` — the IMPACT weight: a sine kick, 2.2× → 1× in ≤ 35 ms then sinking,
  3 ms attack.
- `unison(freq, dur, type, peak, cents, slideTo?, at?)` — two voices ±cents: a wider, chorused note.

The most-heard first-hour cues are built as **transient + body + weight/tail** with their identity
(pitches, timbres, slides) unchanged: the five tower-fire families, the five enemy-death families,
the kill ping, hit, UI click, tower place, wave horn, wave clear, draft deal + pick, chest, reveal,
level-up, unlock, boss fall, tutorial graduation, achievement. Sequences their comments always
described ("rising triad", "two-step into a held bloom", "thunk, then a riser") now actually play as
sequences (`at` offsets) instead of one chord.

## 7. Voice budgets

A global cap (40) plus a per-category budget (table above). A voice that doesn't fit is refused and
counted (`sfxDev.stats().dropped`). The swarm-wipe stress render refuses ~200 combat voices and still
lands every reward and alert in full — frequent combat can only ever fill its own budget.

## 8. Settings (`AudioToggles` — Settings + the in-run pause menu)

Sound effects On/Off + **Effects volume**, Music On/Off + **Music volume** (0–100 % of each engine's
designed level; the effects slider previews itself with a UI click; a muted engine's slider disables).
Device prefs `assimilate.sfxVolume` / `assimilate.musicVolume` (state/prefs.ts, in
`DEVICE_PREF_KEYS`); App applies them on boot (`audio.setVolume` / `music.setVolume`). Both
`setVolume`s take the player's 0..1 level — 1 plays the mix exactly as measured.

## 9. §audit — `npm run audio:audit`

Renders the real `src/audio` code in headless Chromium (esbuild bundle, `OfflineAudioContext` 48 kHz
stereo), through the public API only — every render loads a fresh copy of the modules, with
`Math.random` seeded and the throttle clocks pinned to the render clock — so the same tool measures
any revision (`--src <checkout>` for a baseline from `git archive <rev> src/audio src/render/feel.ts`).

Per cue: peak dBFS, momentary-max / short-term / integrated LUFS (BS.1770 K-weighting), duration,
clipping, hard stops, **truncated voices** (a non-looping buffer that runs out before its own stop —
measured differentially: a second render lets the buffer loop; the difference is the cut-off tail).
Scenes: the swarm-wipe **stress** mix (×1, ×2) with voice counts, nodes created and offline render
time; a ~21 s **combat montage** over the combat score; the opening **film** over the cinema score;
eight-in-a-row **repeats**; the score alone; and the **balance** table (montage SFX alone vs score
alone per section). Writes WAVs (`--mp3` adds the audition set) and docs/AUDIO_REPORT.md
(`--baseline <results.json>` adds before/after columns). `--suggest` prints the trim table;
`--only a,b` renders a few cues fast.

## 10. Defects this pass fixed (measured)

- **Truncated noise layers** — the shared noise buffer was 0.5 s and non-looping, so every noise layer
  asked to last longer (cin_rumble/title/dive, every mega sting, boss, hiveGroan, megaDeath — 19 cues)
  stopped dead mid-envelope. Now a 2 s looped buffer read from a random offset.
- **Frozen dynamics** — Chromium skips processing a node whose inputs are all silent, freezing a
  compressor's detector wherever the last sound left it (and a fresh one starts fully attenuated): the
  first cue after any quiet spell came out squashed (the audit measured up to −20 dB on short cues).
  The −120 dBFS keep-alive keeps the dynamics processing and releasing through silence. The very first
  ~0.2 s after the AudioContext is created still meets the start-up state (a browser behaviour).
- **Unmeasured levels** — loudness inside a category spread 9–18 dB around the design intent; rewards
  sat ~10 dB under the score. Now ≤ 1 dB around the goals, rewards/alerts over the bed.

## 11. Known limitations / future hooks

- SFX and music are **two AudioContexts** summed by the OS: each is limited on its own, the sum is not
  (the montage peaks at −4 dBFS — headroom, not a guarantee). Routing music into the SFX context would
  allow one master limiter.
- Offline render time (the audit's CPU proxy) is ~3× the pre-pass figure in the stress mix (~200 ms per 3.8 s
  rendered — ~5 % of one core; the convolver + the always-on dynamics); real-time Chromium runs the convolver's long stages on a
  background thread, so this is an upper bound. A mobile "lite" path could drop the room.
- Voice stealing is first-come: a full budget refuses the newest voice (a partially admitted layered
  cue can lose its tail layer). Priority stealing is the hook if it's ever audible.
- Trims are measured at the default volume with a seeded room; each session's IR is freshly random
  (±0.5 dB on wet cues).
