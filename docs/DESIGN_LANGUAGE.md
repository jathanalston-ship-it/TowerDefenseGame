# DESIGN_LANGUAGE.md — how to build inside the identity

> The **how**: the decision rules that keep every future screen, reward, and sound feeling
> like the same studio shipped it. Vision: `docs/VISUAL_IDENTITY.md`. Numbers:
> `docs/UI_STYLE_GUIDE.md`. Components & enforcement: `docs/UI-STANDARDS.md`. Words:
> `docs/LEXICON.md`. This document is the checklist you design against *before* writing code.

## 1. Window hierarchy — pick the lightest container that works

1. **Screen** — a nav destination (Tower Lab, Archive). Full panel, title + sub, owns its
   atmosphere layer. New top-level screens are rare and need a nav section decision.
2. **Panel section** — a region inside a screen. Header eyebrow, grouped cards. Default choice.
3. **Drawer / expandable** — progressive disclosure inside a card (forks, adaptation trees).
   Prefer this over modals for detail-on-demand.
4. **Modal** — interrupts one flow, one decision (confirm, details). Veil + glass, ESC/veil
   dismiss.
5. **Ceremony** — full-screen theatrical takeover reserved for *permanent* account moments
   (star-up, unlocks, vault openings). Never for routine feedback.

Rule: information travels DOWN this ladder as it matures — a new mechanic may launch with a
ceremony, but its steady-state lives in panels and toasts.

## 2. Notification philosophy — one event, one channel

| channel | use for | never for |
|---|---|---|
| **Badge** (count chip) | actionable-when-you-get-there (points to spend, upgrade affordable) | lore, praise |
| **Toast** (shared stack) | earned-while-doing-something-else (power gain, loot fill, achievement, mastery level) | blocking choices |
| **Banner** (in-HUD strip) | run-context changes (wave, biome, boss) | account progression |
| **Ceremony** | permanent account transformations | anything repeatable-in-seconds |
| **What's New queue** | newly unlocked *mechanics* (menu only) | numbers going up |

Rules: toasts queue and coalesce (never stack past 3 visible); a single event fires ONE
channel (the Results screen may summarize it again — that's the ledger, not a second alert);
every toast names its **source** ("+18 Power · Tower Branch Upgrade") — unexplained numbers
are forbidden.

## 3. Reward presentation philosophy

- **Escalate by permanence, not size**: routine biomass → numbers tick; run loot → meter +
  toast; account currency → reveal flare; permanent transformation (star, evolution, slot) →
  ceremony with before/after.
- **Preview before purchase**: every spend shows current → new → difference (and combat
  impact where the model exists — `PowerPreview`). No blind buys.
- **Announce after gain**: the gain animates (roll, fill, flare), sounds (family cue by
  rarity/permanence), and names its source.
- **Rarity discipline**: gold means Legendary-tier moments; `--cache` teal means routine
  caches; mythic pink is never decoration. If everything glows gold, nothing is Legendary.

## 4. Card design language

Cards are **specimens**: identity row (portrait/icon + name in class hue + eyebrow class/rank)
→ scannable facts (label/value pairs, tabular) → progress (one bar language) → ONE primary
action + quiet secondary disclosures. Rarity/class is worn as border-mix + icon-chip glow,
not as a full background wash. Grid-responsive; hover lifts -2px with `--halo` in the owning
hue; never more than one breathing element per card.

## 5. Terminology & iconography

Words come from `docs/LEXICON.md` (◈ evolution stars, Strain Samples, Bio-Containers,
Mutate…); glyphs from the canonical set (VISUAL_IDENTITY §4). New systems add their nouns to
the lexicon FIRST, then reuse everywhere — UI copy, toasts, docs, sounds named alike.

## 6. Sound design rules

Every new sound joins a family: UI (whisper/tap/rise), weapon voice (class register,
tier-deepened), reward ladder (richer = rarer), music (composed categories only —
`music.play(category)`, never ad-hoc loops). Build from the shared `tone()` palette; if a
moment needs a new family, add it to `src/audio/sound.ts` beside its relatives and document
it in GAME-FEEL.md. Two generative systems must never sing at once (the drone lesson).

## 7. Ambience & performance budget

Each screen gets: 1 atmosphere layer (fog/veins/parallax), ≤ 1 breathing CTA, reactive
accents on live data. Ambience is `transform`/`opacity`-only, GPU-friendly, and fully
disabled under `prefers-reduced-motion` (information never lives *only* in motion). Lists
animate their container, not N children; canvases pause when hidden; no per-frame React
state outside the HUD tick.

## 8. The new-screen checklist

Before shipping any new UI:

1. Words from the lexicon; numbers tabular; eyebrow labels tracked uppercase.
2. Tokens only — palette, spacing, radii, durations (uiStandards will check some of it).
3. Container chosen from the window hierarchy (§1), channel from the notification table (§2).
4. One primary action per view; previews before spends; sources on gains.
5. One atmosphere element + one reactive element; reduced-motion covered.
6. Sounds from existing families; music via categories.
7. Passes the screenshot test (VISUAL_IDENTITY §8).
8. Component kit first (`src/ui/components/`) — extend it rather than fork it.
   Responsive by construction: follow `docs/RESPONSIVE-DESIGN.md` §6 (container-sized
   panels, reflow grids, safe areas, touch equivalents) — new screens inherit every
   platform for free.
9. Docs: register the surface in `src/dev/systemRegistry.ts`; update the owning system doc.

## 9. Future UI standards (reserved seams)

- **Dynamic music intensity** (threat → `music.setIntensity`) is the sanctioned place for
  per-biome/per-pressure audio flavor.
- **Cosmetics/titles/badges** (mastery, seasons) render through the existing chip + eyebrow
  patterns — no new chrome tier.
- **i18n**: copy stays in registries/config (never concatenated in JSX) so the string surface
  stays extractable.
- New rarity/class hues require a VISUAL_IDENTITY palette amendment — they are identity
  decisions, not feature decisions.
