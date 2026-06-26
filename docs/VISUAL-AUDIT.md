# VISUAL-AUDIT.md — Ruthless Visual Review (Steam-demo lens)

Reviewed as if playing an unknown indie's Steam demo for the first two minutes.
Grounded in the **current live build** (desktop + mobile headless captures, post
UI refactor). Severity-ranked; highest-impact-fastest fixes called out. Fixes
that are already designed point to the relevant spec so this is an execution
priority, not new theory.

**One-line verdict:** *The frame around the game now looks shippable (HUD, menus,
atmosphere). The game **inside** the frame still looks like a prototype — enemies
are featureless dots, combat is silent and weightless. Fix feel + the things you
stare at, and this crosses the "looks commercial" line fast.*

> **Resolution status (updated):** Sprints 1–2 + most of Sprint 3 are **done**.
> ✅ C1 audio · ✅ C2 enemy faction shapes + boss/elite tiers · ✅ C3 screen-shake +
> hit-flash + aggregated damage numbers · ✅ M1 hero signature · ✅ M2 tower
> grow/breathe/recoil · ✅ M3 de-emoji (canvas padlock/chevron + SVG UI icons) ·
> ✅ M4 resource feedback (count-up, ascending blip, kill motes) · ✅ M5 projectile
> trails. Full HUD build/inspector panels added (HUD.md §5–6). Remaining: P-tier
> polish (onboarding, results juice, in-run settings, crit identity, slot pulse).

---

## What already works (keep, don't touch)
- **HUD & menus**: hierarchy, tokens, progress bars, rarity, hover/selection,
  responsive (post-refactor). Reads professional.
- **Environment atmosphere**: depth gradient, spawn membrane, glowing defensive
  line, pressure vignette, hive-core heartbeat, hive tendrils. Genuinely moody.
- **Performance scaffolding**: LOD, particle/enemy budgets, spatial grid.

Everything below is what a reviewer would screenshot to mock.

---

## Severity-ranked issues

Tags: `[amateur]` `[ux]` `[confusing]` `[feedback]` `[anim]` `[fx]` `[readability]`.
Each: **what I see → why it's a problem → fix (spec) → impact/effort.**

### 🔴 CRITICAL — demo-killers (a reviewer bounces or mocks these)

**C1. The game is completely silent.** `[fx][feedback]`
No SFX, no music, no UI clicks. Nothing says "unfinished" faster than silence —
players assume the build is broken or pre-alpha. → Stand up the procedural Web
Audio layer (`GAME-FEEL.md §5`): hit/kill/resource blips, UI clicks, a pressure-
reactive music bed. **Impact: enormous · Effort: M.** *The single highest
polish-per-hour fix in the whole project.*

**C2. Enemies are identical colored circles; the boss is just a bigger dot.** `[amateur][readability]`
The thing you stare at for the entire match is the least-finished asset on screen.
No faction identity, no shape language, no "oh no, a boss" moment — a Brood Tyrant
reads the same as a runner. → Faction **shape families** + **boss/elite tiers**
(`READABILITY.md §3,§6`, `PLACEHOLDER-ART.md §5`). **Impact: enormous · Effort: M.**

**C3. Combat has no impact — no shake, no hit effect, no damage numbers, no death
feel.** `[feedback][anim][fx]`
Towers emit dots that silently delete enemies. There is no moment of contact. It
feels like a screensaver, not a battle. → `GAME-FEEL.md` P0–P1: trauma screen-
shake, hit spark + target flash, aggregated damage numbers, death dissolve→
assimilation, hit-stop on crits. **Impact: enormous · Effort: M.**

### 🟠 MAJOR — clearly amateur, hurts the sell

**M1. The hero looks like a tiny gold diamond, not a hero.** `[amateur][readability]`
Your headline mobile unit is a 13px rhombus indistinguishable in importance from a
tower. → Hero signature (gold core + class rim + ground halo + motion trail +
locator ring), larger size (`READABILITY.md` tier 2, `PLACEHOLDER-ART.md §4`).
**Impact: high · Effort: S.**

**M2. Towers are bare primitives (triangle / square / circle), fully static.** `[amateur][anim]`
They read as engine placeholders. Nothing breathes, recoils, or grows. → Per-tower
silhouettes + idle breathing + fire recoil + grow-on-place (`PLACEHOLDER-ART.md §3`,
`LIVING-HIVE.md`). **Impact: high · Effort: M.**

**M3. OS emoji in the UI and on the battlefield (🔒 ▼ ＋ ◆ ⚡).** `[amateur]`
Emoji render differently per OS and clash with a stylized art game — a textbook
amateur tell. The lock on slots and ▼/＋/◆/⚡ glyphs should be **drawn shapes/SVG**,
not system emoji. **Impact: medium-high · Effort: S.**

**M4. Killing things gives no reward feedback.** `[feedback]`
Biomass silently increments; there's no juice on the kill or the income — the core
loop's payoff is invisible. → Biomass motes flying to the counter + count-up + an
ascending-pitch blip (`GAME-FEEL.md` P0). **Impact: high · Effort: S–M.**

**M5. Projectiles are near-invisible dots with no trails.** `[readability][fx]`
You can't tell what's firing or tell shots apart; the battlefield looks static even
mid-fight. → Class-tinted projectiles + short trails + muzzle/impact puffs
(`GAME-FEEL.md` P2, `READABILITY.md` tier 6). **Impact: medium · Effort: S.**

### 🟡 MINOR — polish & UX gaps (post-viability)

**P1. Onboarding is a paragraph of text in the menu.** `[ux]` No in-context first-
run guidance ("select a tower, tap a glowing slot to grow it, then Start Wave"). A
10-second guided first placement would massively cut first-session confusion.

**P2. Tower stats only appear on hover — invisible on touch.** `[ux][confusing]`
Mobile players can't see range/DPS (hover doesn't exist; tap selects). Show stats
on **select** and/or build the RIGHT inspector panel (`HUD.md §5`); add a long-press
/ (i) affordance on mobile.

**P3. Empty build slots are subtle.** `[ux][readability]` First-timers may not
realize the bracket nodes are buildable. When a tower is selected, **pulse the valid
slots** ("grow here") — ties into `LIVING-HIVE.md` (slots reach toward the cursor).

**P4. On-canvas labels are literal** ("ENEMY SPAWN", "HOLD THE LINE", "HIVE CORE").
`[minor]` Fine as scaffolding; later make them more diegetic / better-typeset, or
fade them after the first wave.

**P5. Results screen is sparse.** `[feedback]` No run-summary juice (cards drafted,
best wave celebration, shard count-up). A satisfying outro reinforces the loop.

**P6. No in-run pause / settings.** `[ux]` Once audio + shake exist you need volume,
screen-shake %, and reduce-motion toggles reachable in-run.

**P7. No critical-hit identity yet.** `[feedback]` Crits are the variable-ratio
dopamine spike; currently nothing distinguishes a big hit (`GAME-FEEL.md` P1).

---

## Highest-impact improvements, in order (fastest path to "looks commercial")

The ordering optimizes **perceived polish per hour**. Most fixes are *already
designed* — this is a build sequence.

### Sprint 1 (~1 week) — "make it feel alive" (biggest perceived jump)
1. **Audio layer** (C1) — hits, kills, resource blips, UI, music bed. *Do this
   first; silence is the loudest problem.*
2. **Core combat juice** (C3) — screen shake + hit spark/flash + aggregated damage
   numbers + hit-stop on crits.
3. **Resource-collection feedback** (M4) — biomass motes + count-up + ascending blip.

> After Sprint 1 the game will *feel* 3× more finished with zero new "art."

### Sprint 2 (~1 week) — "fix what you stare at"
4. **Enemy faction shapes + boss/elite tiers** (C2) — the biggest *visual* amateur
   fix; bosses finally feel like bosses.
5. **Hero signature** (M1) — make the star unit read as the star.
6. **De-emoji the UI** (M3) — swap 🔒▼＋◆⚡ for drawn glyphs.

### Sprint 3 (~1 week) — "polish the motion"
7. **Tower silhouettes + idle/fire animation + grow-on-place** (M2, ties to the
   living-hive theme).
8. **Projectile trails + muzzle/impact** (M5).
9. **Crit identity** (P7) + **slot pulse on select** (P3).

### Later — onboarding, mobile inspector, results juice, settings (P1, P2, P5, P6).

---

## The one-paragraph pitch to the team

You've already built the expensive, hard-to-see scaffolding (deterministic sim,
perf budgets, atmospheric environment, a clean HUD). What's missing is the cheap,
highly-visible top layer: **sound, juice, and non-placeholder units.** A reviewer
judges a demo on *feel in the first 60 seconds*, and right now those 60 seconds are
silent dots deleting silent dots. Spend two weeks on Sprints 1–2 — audio, combat
juice, resource feedback, real enemy/boss shapes, a real hero — and the same game
will read as a commercial product. None of it requires an external artist; it's all
procedural and already specified.
