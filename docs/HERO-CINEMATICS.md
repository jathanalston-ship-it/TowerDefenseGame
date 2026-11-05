# Hero Ability Cinematics — every cast is a set piece

> The Cinderwyrm's breath is a **dragon sweeping the lane**. The Fovea's stare is an eye
> opening and lancing. The Vitriol's cataclysm is a shell salvo arcing in. Every hero ability
> in the game — 10 heroes × (ult + 2 kit skills) — stages a procedural performance, and the
> payload **lands the moment the performance strikes**. No sprites, no video: the same
> parameterized Canvas 2D language as the rest of the game.

---

## 1. Architecture — two halves, one landing

**Sim half (`src/core/game.ts`)**

- `HeroAbilityDef.cinematic: { actor, motion, impactDelay }` (config.ts) is pure data.
- On cast, the compiled component list SPLITS:
  - **Instant at cast** — everything supportive: `heal`, `shield`, `buff`, `summon`
    (+ any other non-zone component). Support must never feel laggy; the Knell's amp
    rings the moment the bell is struck.
  - **Lands at `impactDelay`** — the ZONE payload: `explosion`, `debuff`, `pool`
    (`IMPACT_COMP_TYPES`). Queued on `pendingImpacts`, fired by `pendingImpactSystem()`
    (step-gated on a non-empty queue).
- **Determinism:** crit and damage multipliers are locked at cast (no rng at impact); the
  ability radius mult is captured with them. Enemies are **re-queried at landing** — the
  blow hits whatever stands in the zone when it lands (dodging the telegraph is real).
- The cast also publishes a one-shot **`CastEvent`** to `RenderState.castEvents`
  (monotonic `seq` — the `DeathEvent` ingest pattern): resolved name/color (forks recolor),
  zone center + radius, the caster's pre-cast stance (`fromX/fromY` — beams/lobs launch
  there), actor, motion, delay, and the cast's sim time.
- The settle wind-down clears `pendingImpacts` (the field is clear — nothing left to strike);
  the deferred landing burst (`particle`) fires at impact instead of cast.

**Render half (`src/render/abilityCinematics.ts`)**

- `ingestCasts(rs)` seq-ingests each cast exactly once and resets itself when a new run
  restarts the sequence (mirrors `render/gore.ts`).
- Each performance runs on **sim time** (`rs.time`): pause freezes it, game speed keeps it
  in sync with its own impact. A ~0.9s wall-clock sim-stall (settle/pause) releases live
  performances so nothing hangs mid-air.
- Timeline per cast: **anticipation** (the zone + a friendly lock closing onto it the instant the
  payload lands; a landing shadow gathers under anything arriving from the air — §telegraph) →
  **travel** (the actor rides its motion; lands exactly at `impactDelay`) → **contact frame** (a rim
  snap + a Flashes-gated hot core inside the zone, then a brief afterglow) → **linger**
  (exit/dissolve; fly-throughs keep flying). `impactDelay: 0` plays a fixed 0.55s **flourish** instead.

## 2. The vocabulary — actors × motions

An **actor** is the hero's manifestation (one puppet per identity, painted in
`ACTOR_PAINTERS`); a **motion** is the shared trajectory (`computePose`). A new hero picks
existing vocabulary in its data row — or adds ONE painter entry.

| Hero | Actor | Ult motion | Notes |
|---|---|---|---|
| Ravager | `beast` | lunge | pouncing apex predator, claw rakes, speed streaks |
| Shepherd | `bloomheart` | expand | unfurling flesh-flower; skills are self flourishes |
| Overseer | `psion` | expand | rotating synapse rings + firing nodes |
| Vitriol | `barrage` | lob | 3 staggered shells on jittered ballistic arcs |
| Revenant | `wraith` | blink | shroud silhouette + departing afterimage, trailing tatters |
| Knell | `bellwave` | expand | the bell descends to the slam; resonance arcs widen |
| Cinderwyrm | `serpent` | swoop | **the dragon**: 7-segment undulating chain, flapping membranes, ember wake; enters off-field, skims the zone at landing, exits through the linger |
| Riptide | `tide` | expand / rise | cresting brine wall with curling crest + foam |
| Carrion | `murder` | converge | 12 carrion flies spiral in, buzz the zone after landing |
| Fovea | `gaze` | beam | the vesica eye opens (35% of travel), then the lance head travels |

Motions: `lunge · swoop · dive · lob · rise · expand · converge · beam · blink · self`.
Degenerate casts (from == to) fall back to a down-lane heading — every motion poses finitely.

## 3. Response budget & guardrails (test-enforced)

- `impactDelay ∈ [0, 0.6]` — long enough to read, never long enough to feel unresponsive.
- **Zone strikes** (damage / disrupt / pool) must have `impactDelay > 0`; **pure support**
  must have `0`. Pinned for every ability in `heroCinematics.test.ts`.
- Calm covenant (renderer.ts): **casting never shakes the screen and nothing flashes the full
  field**; actor bodies alpha ≤ ~0.9, rings ≤ ~0.4. Draw order: over entities/heroes, under
  floats + HUD. (`FEEL.ability` carries no shake — skills, phase-ins and casts stay calm.) The
  telegraph is the one deliberate relaxation — it is information: an ult's lock/contact frame runs at
  `CAST_TELL.ultCalm` (0.62 of the hostile strength), an auto-cast skill's at `skillCalm` (0.45), so a
  friendly read never shouts over a boss tell.
- **The one exception — an ULT's landing (§impact).** The payload striking earns ONE light
  camera kick (`FEEL.abilityImpact`: trauma 0.22) and a 60 ms view-only hit-stop, both scaled
  by Settings → Motion (Screen shake %, and zeroed by reduced motion). The bloom stays inside
  the zone — never a full-field flash.
- Reduced motion (`viewFeel.motion` — Settings → Motion or the OS, the same resolved switch the
  camera uses; it used to read the raw media query only): the travel theater is skipped, but the
  TELEGRAPH stays — the zone + a progress sweep say where and when, a still contact ring says it
  landed.
- **Golden safety:** a cast-less run (the golden autoplay) never touches any of this —
  `pendingImpactSystem` is length-gated, `castEvents` only written on cast. The golden
  seeds are byte-identical (verified).

## §impact — the ultimate's impact frame

When an ULT's queued payload lands (`pendingImpactSystem`), the sim measures the damage the
landing dealt (`statDamageDealt` before/after — observation only) and emits the presentation
event `abilityImpact { hero, x, y, radius, color, damage }`, gated on a listener (a headless or
golden run never builds it). GameView answers with:

- a **~60 ms view-only hit-stop** (`game.hitstop`, never stacked) + one light kick
  (`FEEL.abilityImpact`) + a short sub thump (`abilityImpact` cue);
- a **bloom inside the ability zone** — hot core → rim, peaking on the frozen frame, then the
  rim snaps once (`render/impactFx.ts`; the bloom obeys Settings → Flashes);
- **ONE grouped damage total** above the zone centre (the hero stands on the centre) — the sum
  of the landing, on the damage-number scale, popping in and rising (hidden by Settings → Damage
  numbers). The ability's name float now rides above the zone instead of on the hero.

Skills keep their calm ring (no impact frame); support casts (delay 0) never land one.

## §telegraph — where, when, land (2026-11)

The cast read speaks the shared telegraph language (`render/telegraphs.ts`, the same one boss
wind-ups and the Mega's cataclysm use — docs/BOSS-DESIGN.md §telegraphs): **where** is the zone rim,
**when** is a lock closing onto it that touches the rim the instant the payload lands, **land** is one
contact frame. Friendly locks carry no reticle notches (those mean "aimed at YOU"). Airborne motions
(`lunge · swoop · dive · lob` — `AIRBORNE`) also grow a **landing shadow** under the zone as the blow
falls. The ult's contact frame is the heavy one (`ultRim`, big core); skills land lighter
(`skillRim`). The audit that motivated it: the old anticipation ring peaked at alpha 0.26 and the
impact rim at 0.38 — on a stage-80 field (acid pools, beams, reaction floats) neither read at all, so
casts had no visible hit frame. Tunables: `CAST_TELL` (abilityCinematics.ts). The expiry pass compacts
the performance list in place (it allocated a filtered copy every frame).

## §presence — hero idle life (2026-11)

A hero body used to be a still polygon under a pulsing locator ring. Now it **breathes** (±
`HERO_LIFE.breath` scale), **bobs** on its stride while moving/retreating, and **punches** on every
strike (the `attackCd` jump edge — render-local, beside the ability-edge tracker) — one transform over
body, gear, wings, evolution dress and symbiote grafts, per-hero phase so a roster never breathes in
lockstep. Reduced motion holds it still. Tunables: `HERO_LIFE` (renderer.ts). Keyed by move state,
never by hero id — a new hero inherits it.

## 4. Extending

1. New hero → add `cinematic: { actor, motion, impactDelay }` to its ult + both skills
   (the registry tests fail the build if a row is missing or names an unknown actor).
2. New puppet → one painter in `ACTOR_PAINTERS` (paint at `p.pose`, tint `p.ev.color`,
   respect `landedFade(p)` unless the actor exits like the serpent).
3. New trajectory → one case in `computePose` + the `CinematicMotion` union.
4. Forks recolor automatically (`fxColor` rides the resolved def); a fork can also retime
   by overriding `cinematic` in an upgrade if a transformation warrants it (none do yet).

## 5. Known limitations / deliberate calls

- Skill-cast timing shifted by design: tests asserting cast RESULTS must step past
  `def.cinematic.impactDelay` (see `riptide.test.ts` / `vitriol.test.ts` for the pattern).
- Daily-run replays recorded on a pre-cinematics build diverge on re-verification — the
  established, accepted skew window for deliberate sim changes (same as every golden re-pin).
- The Symbiote echo re-cast stays instant (slot `'echo'`, delay 0) — it's an aftershock,
  and delaying it would double-queue payloads for one player action.
- Performances are presentation beyond payload timing: no gameplay reads `castEvents`.

**Files:** `src/core/config.ts` (types + 30 data rows) · `src/core/game.ts` (feed + queue)
· `src/render/abilityCinematics.ts` (runtime + painters) · tests
`src/core/heroCinematics.test.ts`, `src/render/abilityCinematics.test.ts`.
