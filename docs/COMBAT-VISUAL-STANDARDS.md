# COMBAT-VISUAL-STANDARDS.md — the in-run gameplay feel contract

The standards every combat visual must meet, and the frameworks that enforce them. Written with
the 2026-07 In-Run Gameplay Feel Pass; extends `GAME-FEEL.md` (the juice audit), `READABILITY.md`
(the clarity rules) and `RENDER-PIPELINE.md` (the draw order). **The guiding philosophy: every
important gameplay event immediately communicates itself visually** — the player should read the
battlefield by watching it, never by cross-referencing numbers.

> **The one architectural rule under all of this:** feel work is RENDER-SIDE. The renderer reads
> `RenderState` snapshots and never mutates the sim; all animation is time/id-keyed (no rng, no
> hidden sim reads), so every effect below is golden-safe by construction. Sim-side additions are
> limited to DATA (`fx` trait blocks) and `hasListeners`-gated events.

---

## §status — the Status Effect Visualization System

**Files:** trait data + validator in `core/status.ts` (`StatusFxTraits` on every
`StatusEffectDef`); the merge + painters in `render/statusFx.ts`; integration in
`render/renderer.ts` `drawEnemy`.

- **Traits, not scenes.** A status contributes: `hue`, `glow`, `pulseSpeed` (its animation
  tempo — slow effects genuinely pulse slower), one `overlay` kind (`veins · rim · casing ·
  cracks · halo`), 0–2 `particles` emitters (`spores · droplets · flames · arcs · crystals ·
  smoke · motes`), optional `distortion` (heat shimmer) and `jitter` (trembling).
- **Merging, never stacking.** `mergeStatusFx` folds every live status on a body into ONE
  presentation: hues blend intensity-weighted (poison + burn = a sick biological combustion,
  freeze + shock = frozen arcs — no combination is hand-authored); overlays dedupe by kind
  (strongest contributor keeps its identity hue, union intensity); emitters share one budget.
- **Intensity scales.** Stacking effects weight by `stacks/maxStacks`; timed ones fade with
  remaining duration — a heavy application visibly IS heavier, an expiring one visibly wanes.
- **Legacy statuses unified.** The four fast-field statuses (fracture/corrosion/infection/
  disruption) render through the same registry traits — one vocabulary everywhere. The
  Mark/Resonance charge rings stay bespoke (reaction fuel, test-pinned colors).
- **Control states animate the BODY.** Fear/stun tremble (`statusBodyTransform`), burn shimmers,
  freeze encases (casing overlay + crystal orbit at a glacial tempo).
- **Deaths react to statuses.** The dominant affliction at death flavors the death echo
  (`deathFlavorOf`): frozen bodies SHATTER into shards, burning ones collapse under rising
  embers, infested ones burst spores, corroded ones melt flat. Renderer-side, via the motion
  tracker's per-frame flavor snapshot.
- **VALIDATOR CONTRACT:** a `StatusEffectDef` without a complete `fx` block is REJECTED at dev
  boot (`statusRegistry.validate`) — future statuses cannot ship invisible.

## §effect-management — battlefield clarity under load

Quality tiers, decided once per frame in `drawGame` and passed down:

| Tier | When | What renders |
|---|---|---|
| 2 (full) | < `PERF.statusFullDetail` (120) enemies | all overlays, ≤3 emitters × 3 particles |
| 1 (reduced) | < `PERF.lodEnemyCount` (220) | all overlays, 1 emitter × 2 particles |
| 0 (suppressed) | ≥ 220 (LOD floor) | nothing (flat-shape LOD is already active) |

**Bosses and elites are LOD-immune** — they always render tier 2. Impact sparks are pool-capped
(90) and per-body throttled (120 ms). This is the "important effects always visible, minor
effects gracefully simplify" policy; extend it, don't bypass it.

## §hit-confirmation — every landed hit reads

Layered, no single element overpowering (GAME-FEEL P0):
- **Spark burst** at contact, tinted by the striking tower's class — render-local pool fed by
  the motion tracker's `hitFlash` rising-edge detection (the sim spawns no hit particles).
- **Flinch** — recoil squash + up-lane knock (`enemyForms` `flinch`, from the same 0.09 s flash).
- **White pop** on the body; **aggregated damage floats** (sim-side, pre-existing); **crit**
  floats pop with a burst ring + a soft rate-limited `crit` ching; audio rides the per-class fire cues.
- **Damage numbers read over anything** (2026-11): every float carries a dark outline (legible
  over acid pools and gore); a digit-led float is a DAMAGE NUMBER whose size scales with its
  magnitude on a bounded log curve (`DAMAGE_NUMBERS` in `render/feel.ts`: 17 px for a tick →
  28 px cap) with a ~90 ms pop-in. Fonts are pre-built (no per-frame string building). Settings →
  Motion → *Damage numbers* hides them (crit + ult totals included); callout text stays.

## §towers — anticipation → release, personality by form

`FORM_ANTICIPATION` (in `render/towerForms.ts`) keys a wind-up personality by **body form, not
tower kind** — every future tower inherits one the moment it picks a form (zero authoring at the
100-tower target). Across the last ~30% of the cooldown (combat only, prey on the field) the
silhouette scales toward `sx/sy` (mortar compresses, needler flexes taller, monoliths draw up)
and the muzzle gathers a charge glow; the existing recoil + flash then lands as the release.
Idle towers breathe (`breathe`), grow in on placement, and root with tendrils — unchanged.

## §projectiles — identity + power

- Every behavior has a distinct read (comet / lobbed shell / wobbling spore / returning blade);
  branch skins evolve with tier; mulligan organisms and hero weapons re-skin shots. Never a
  bare circle.
- **Power scaling:** the base comet's head/trail scale with the shot's damage on a log ramp
  hard-capped at ×1.4 (12 dmg = ×1, ~10× = ×1.25) — stronger accounts visibly hit harder
  without bloating the field.

## §heroes — ability feedback loop

Render-local cooldown-edge tracker (`heroAbilityFx` in renderer.ts): a cooldown JUMP draws the
**activation burst** (class-tinted double shockwave + flash); the fall to 0 draws the
**ready flare** (rising spark + ring) and a quiet **standing ready-glint** above the head while
the ability waits. Behavior-keyed identity (swoop wings, phase blink arcs, siege ranging rings)
lives beside it — a new hero inherits by behavior, never by id.

## §audio — status cues

`applyEffect` emits `statusApplied` (hasListeners-gated ⇒ byte-identical goldens); GameView
plays a throttled (160 ms) CATEGORY cue: `status_dot` (wet corruption squelch) for dots/debuffs,
`status_control` (crystalline arrest chime) for control; enemy-side buffs stay silent. New
statuses inherit audio by category — no per-status wiring.

## §future-content checklist — what new combat content MUST define

Machine-enforced where possible; review the rest at authoring time:

- [ ] **Status effect** → a complete `fx` trait block (VALIDATOR-ENFORCED; build fails without).
- [ ] **Tower** → a `TOWER_FORM` body (idle/recoil/anticipation ride free), a projectile
      identity (behavior, or a branch skin), muzzle color.
- [ ] **Enemy** → an `ENEMY_BODY` form (idle gait/flinch/emerge ride free), role-trait visuals
      if it has an aura/summon/siege/explode trait.
- [ ] **Hero** → a behavior-keyed brain (movement identity rides free), ability components
      (activation/ready cues ride free), a `HERO_SHAPE` silhouette.
- [ ] **Boss/Mega** → chassis/motif identity + telegraphs (validator-enforced for megas).
- [ ] **Performance:** every new effect must state its LOD tier (what disappears at quality
      1/0) and stay within the deterministic time/id-keyed idiom — no per-frame allocations in
      per-enemy loops, no rng in the renderer.

## §performance guidelines

- Budget per afflicted enemy at full quality: ~1 glow + ≤3 overlays (~12 ops each) + ≤9
  particles (~2–4 ops each). Merge cost is allocation-light and only paid by afflicted bodies.
- All render-side pools are capped (sparks 90, death echoes 48) and reaped in the draw pass.
- Quality scaling is automatic (enemy count); low-end devices degrade along the same curve.
- The sim's particle budget (`PERF.maxParticles`) is untouched — status particles are painted,
  not simulated.
