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

## §damage-language — WHO hits WHAT with WHICH damage type (2026-11 combat VFX pass)

**Files:** `render/combatFx.ts` (the `DAMAGE_STYLE` table, the painters, the burst pool, the muzzle
hook); integration in `render/renderer.ts` (`drawProjectile`, `updateEnemyMotion` → hit bursts,
`drawImpactSparks` → the pool pass, `drawEnemy` hit flash, ONE `drawMuzzleFlash` hook in `drawTower`).

The game's six **combat classes** (`core/combatClass.ts`) are its damage types. Every attack read is
built from two data fields and nothing else: the striker's **class picks the FORM**, the striker's own
**color tints it** (tower def color · equipped Phenotype glow · hero weapon/hero color). Form says
*what kind of damage*; color says *who*. Towers, heroes and their shots share one table — a new tower
or hero inherits its whole combat read from `combatClass`, zero authoring, no per-kind branches.

| Class | Shot (projectile) | Burst (muzzle · hit · splash · kill pop) | Field pulse |
|---|---|---|---|
| Kinetic | **dart** — a hard slug on a tight streak, white-hot tip | **star** — sharp radial streaks | solid ring |
| Caustic | **glob** — a wobbling glob shedding sagging drips | **splat** — a wet ring + thrown droplets | solid ring |
| Viral | **spore** — a nucleus with orbiting motes on a weaving tendril | **puff** — a drifting spore cloud | dotted ring |
| Neural | **bolt** — a faceted diamond on a zig-zag crackle | **crackle** — a jagged, flickering arc ring | dashed ring |
| Vital | **orb** — a soft pulsing orb trailing beads | **bloom** — a soft disc opening | solid ring |
| Resonant | **pulse** — a ringed packet leaving wavefronts | **ripple** — twin concentric rings | ring + echo |

Distinct shot and burst forms per class are test-pinned (`combatFx.test.ts`): two damage types can
never read alike again (before this pass six homing towers across four classes, and every hero, fired
the same pale-cyan bolt).

Where the language appears (one painter each, all in `combatFx.ts`):
- **Shots** — the base projectile path. Authored identities still win: branch skins
  (`drawSkinnedProjectile`), Mulligan organism shots, the Glaive's returning blade. An equipped
  wardrobe trail keeps its cosmetic streak; the class head rides on it. Power scaling is unchanged
  (log ramp, cap ×1.4).
- **Muzzle** — on a fire edge (the cooldown jumps), shooters flash their class burst at the muzzle for
  `COMBAT_FX.muzzleSec`, aimed along the organism layer's threat bearing; branch tier grows it.
- **Field pulse** — field towers (auras/pulses, no projectile) send ONE faint class wavefront from the
  body out to their **true effective reach** (`rs.effectiveRanges`) over `COMBAT_FX.fieldSec` — the
  AoE you were just hit by is visible. Supports/summoners/traps/beams keep the soft recoil glow.
- **Hit** — the struck body's hit-flash rising edge (throttled `COMBAT_FX.hitGap` per body) bursts
  the striker's class form, reaching past the silhouette (class reach + 0.75 × body radius).
- **Hit flash** — the body lights up ADDITIVELY in its striker's hue + a hot rim (it used to be a
  flat white disc painted over the creature — the anatomy now stays readable under the hit).
- **Splash blast** — a splash shell that leaves the projectile list without fizzling detonated at its
  target: a hot fill inside its **true splash radius** (Flashes) + the rim snapping out to it + the
  class burst. Render-side detection — no sim event needed.
- **Kill pop** — every `DeathEvent` (seq-ingested once) pops the killer's class burst, bigger on
  overkill; hero kills pop in the body's own color.

**Budgets & settings.** One fixed pool of `COMBAT_FX.pool` (128) bursts — hits never evict anything;
blasts/kill pops recycle the oldest hit when full. Kill pops and hit bursts are LOD-gated (`detail`).
Zero allocation on the steady path: fixed strings + `globalAlpha`, glows are cached sprites (one per
color, ever). Reduced motion (`viewFeel.motion` 0): bursts hold a static size and fade, field pulses
appear at full reach and fade, control grips stop turning. Flashes off: no additive hot cores, white
pops or blast fills — rims and forms still carry the information.

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
- **Control reads as a GRIP, damage-over-time as a GLOW** (2026-11). The `rim` overlay is shared by
  dots (corrosion, burn) and control (disruption, slow, charge); a rim whose strongest contributor is
  a `control` status draws as three bracket arcs clamping the body (slowly turning; still under
  reduced motion) instead of a breathing ring — a disrupted body is told apart from a corroding one
  at a glance, whatever the hues.
- **Busy fields hold still** (quality tier 1, 120+ bodies): rims stop breathing and thin out, so a
  field where most bodies are afflicted no longer shimmers — the information stays.
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

**Bosses and elites are LOD-immune** — they always render tier 2. Hit bursts / splash blasts / kill
pops share one fixed pool (`COMBAT_FX.pool`, 128) and hits are per-body throttled (`hitGap`, 120 ms);
hit bursts and kill pops drop at the LOD line (§damage-language). This is the "important effects always visible, minor
effects gracefully simplify" policy; extend it, don't bypass it.

## §hit-confirmation — every landed hit reads

Layered, no single element overpowering (GAME-FEEL P0):
- **Hit burst** at contact in the striker's damage-type form + color (§damage-language) — the
  render-local pool fed by the motion tracker's `hitFlash` rising-edge detection (the sim spawns no
  hit particles).
- **Flinch** — recoil squash + up-lane knock (`enemyForms` `flinch`, from the same 0.09 s flash).
- **Hit flash** on the body — additive, in the striker's hue, with a hot rim (no longer a flat white
  disc over the creature); **aggregated damage floats** (sim-side, pre-existing); **crit**
  floats pop with a burst ring + a soft rate-limited `crit` ching; audio rides the per-class fire cues.
- **Damage numbers read over anything** (2026-11): every float carries a dark outline (legible
  over acid pools and gore); a digit-led float is a DAMAGE NUMBER whose size scales with its
  magnitude on a bounded log curve (`DAMAGE_NUMBERS` in `render/feel.ts`: 17 px for a tick →
  28 px cap) with a ~90 ms pop-in. Fonts are pre-built (no per-frame string building). Settings →
  Motion → *Damage numbers* hides them (crit + ult totals included); callout text stays.
- **Crowd budget** (2026-11): past `DAMAGE_NUMBERS.crowdAt` live numbers, the ones under
  `crowdFrac` × the biggest on screen recede to `crowdAlpha` — crowd budget **24 numbers / 0.4 / 0.3** —
  so at 150 bodies the chip damage stops papering the field and the heavy hits stay legible. Crits
  never recede. One allocation-free pre-pass over the floats.

## §towers — anticipation → release, personality by form

`FORM_ANTICIPATION` (in `render/towerForms.ts`) keys a wind-up personality by **body form, not
tower kind** — every future tower inherits one the moment it picks a form (zero authoring at the
100-tower target). Across the last ~30% of the cooldown (combat only, prey on the field) the
silhouette scales toward `sx/sy` (mortar compresses, needler flexes taller, monoliths draw up)
and the muzzle gathers a charge glow; the existing recoil + flash then lands as the release.
Idle towers breathe (`breathe`), grow in on placement, and root with tendrils — unchanged.
The release itself is the class **muzzle burst** (shooters) or **field pulse** (field towers) —
§damage-language; one hook in `drawTower`.

## §projectiles — identity + power

- Every shot speaks its damage type: the base projectile is drawn in its class form + the striker's
  color (§damage-language — dart / glob / spore / bolt / orb / pulse); the returning blade keeps its
  own read; branch skins evolve with tier; mulligan organisms re-skin shots; hero weapons and
  Phenotypes re-tint them. Never a bare circle, never one bolt for every tower.
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
- [ ] **Tower** → a `TOWER_FORM` body (idle/recoil/anticipation ride free) and a `combatClass`
      — its shot form, muzzle burst, field pulse, hit burst, hit flash and kill pop ride free
      (§damage-language); a branch skin only if a branch needs an authored identity.
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
- All render-side pools are capped (combat bursts 128, tracked splash shells 48, death echoes 48)
  and reaped in the draw pass.
- The §damage-language pass measured **≈ +0.1 ms/frame** at ~130–150 bodies (headless 1440×900,
  272–275 frames per build, before/after builds run concurrently; trimmed means of the touched
  segments 0.31 → 0.41 ms).
- Quality scaling is automatic (enemy count); low-end devices degrade along the same curve.
- The sim's particle budget (`PERF.maxParticles`) is untouched — status particles are painted,
  not simulated.

### Reaction-label budget (integration follow-up to the V1 damage language)
The word callouts ("DETONATE", "SHRED", "DISSOLVE", "VIRULENCE"…) say a reaction FIRED; on a crowded
field the tenth copy of the same word says nothing new and papered the 150-body stress frames. Past
`REACTION_LABELS.crowdAt` (10) live labels (render/feel.ts), each word draws its first `repeat` (2)
copies in full and the rest recede to `crowdAlpha` (0.15) — the field still reads busy, the words stop
burying it. One reused map per frame (no allocation). Pinned in render/combatFx.test.ts.

