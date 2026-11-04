# INFO-HIERARCHY.md — information layers & the cognitive-load budget

> **"Players should only need to think about what matters in the next 30 seconds."**
> This is the permanent standard for WHAT information appears WHERE, and the measured
> budget that keeps every screen honest. Instrument: `npm run cogload` →
> `docs/COGLOAD_REPORT.md` (attention animators are a HARD budget; numeric/text density
> are pressure gauges). Companion standards: docs/ICON-LANGUAGE.md (how concepts look),
> docs/UI-STANDARDS.md (how surfaces are built), docs/PROGRESSION-GATING.md (when systems
> appear at all — the account-level cognitive bands live there).

---

## 1. The three layers

| Layer | Contents | Presentation |
|---|---|---|
| **1 — Immediate** | Where to tap · what's ready/new/recommended · what to do next · costs & affordability (the NEXT decision's inputs) | Icons, progress, color states, ONE dominant action. Numbers only when the decision needs them. |
| **2 — Supporting** | Short descriptions, previews, comparisons, requirements | AFTER interaction: select, hover, open, inspect. |
| **3 — Expert** | Exact %, multipliers, Power math, proc data, per-tier collection ratios, optimization data | Behind INTENT: the `<Detail>` expander, inspect screens, dwell/long-press "exact values". |

The test for any element: **does the next decision depend on it?** Yes → Layer 1.
Explains a choice being considered → Layer 2. Optimizes across choices → Layer 3.
Demote, never delete — depth stays fully reachable.

## 2. The attention budget (HARD, machine-enforced)

At most **2** attention animators visible per screen — and the ONE that breathes should be
the screen's answer to "what's the most valuable thing right now" (the Best-Value strip,
the hero recommendation row, a sale). Everything else expresses state without motion, or
in the **ambient band**:

- **Attention band** (≤ 3.6s, infinite): reserved for THE priority. `bbs-breathe`,
  the landing hero row, `ps-sale-pulse`, in-run alarms (`hive-critical-pulse`).
- **Ambient band** (> 3.6s, infinite): state presence — ready-door glyphs, currency
  shimmer, decorative auras/sheens (chamber rings, HP glow, pass mascot, rush skulls).
- **Announce-then-rest** (finite iterations): arrival moments — nav badges pulse ~6 beats
  on appearing, then the static badge IS the mark (`nav-badge-pulse 1.6s ×6`).

`npm run cogload` walks every registry screen (developed profile, desktop + landscape
phone) and **exits 1** if any screen shows more than 2 attention-band animators. The
2026-07 baseline run found **32 of 68** screen measurements over budget (rail badges
pulsing forever on every screen, 15 Boss-Rush skulls, 9 Hero-Lab HP auras); after the
re-banding all 68 pass with the single breather being the recommendation on nearly every
screen.

The same walk REPORTS a readability gauge per screen (2026-11, never fails): `<12px` = visible
text leaves under the 12px floor, `<4.5:1` = leaves under AA contrast against their nearest
opaque background (docs/UI-STANDARDS.md §readability). The token floor itself is a unit test
(`src/dev/tokenContrast.test.ts`); the gauge catches per-screen drift (opacity stacks, bespoke
colors, 10px labels). The 2026-11 audit's worst case was the Season Pass (494 of 510 leaves at
10px, 186 under 4.5:1) — after the token + 12px-floor pass it measures 1 under 4.5:1 and 400 of
510 at 12px (the remaining 10px leaves are decorative glyph badges and lane eyebrows).

## 3. Numbers: outcomes before digits

- The **impact scale** (`core/effectLanguage.IMPACT_SCALE` — "Slightly … Overwhelmingly")
  is THE vocabulary for effect magnitudes at Layers 1–2; exact figures live in Layer 3
  ("exact values" expansions, `<Detail>`).
- **Costs and affordability stay at Layer 1** — they gate the next decision. Lifetime
  totals, contribution percentages, per-tier ratios do not.
- `digits` in COGLOAD_REPORT is the gauge: a lab legitimately runs denser than a landing,
  but a rising count on a screen that didn't gain decisions is drift.

## 4. The `<Detail>` primitive (components/Detail.tsx)

The sanctioned Layer-2/3 fold: a quiet `◆ details` chip expanding a native `<details>`
(keyboard/screen-reader accessible, zero JS state). Adopted at: Gene Archive tier
breakdown (the five per-rarity ratios fold; % + bar stay), and the Gene tile's Power
contribution (now a quiet ⚙ mark; the exact % lives in the inspect screen it always
duplicated). Use it wherever Layer-3 data currently confronts Layer 1.

## 5. What already answers this brief (don't rebuild)

- **One primary goal**: Ready Chain + recommendations + NextUp ("no dead ends") +
  the Best-Value strip, made first-eye-catch in the prominence pass.
- **Progression discovery**: the unlock framework's reveal/teaser/silhouette system —
  locked systems show as mystery cards with honest unlock hints, never fifteen at once;
  `cognitiveLoad()` bands (calm/learning/full) are pinned by persona pacing tests.
- **Menu structure**: behavior-centered hubs (5 doors + landings) from the nav overhaul —
  the menu-collapse pass happened there; landings already consolidate attention + recs +
  member cards.
- **Layered card details**: draft cards speak generated language first, exact values on
  dwell/long-press.

## 6. Persona findings (the simulated-user pass, 2026-07)

- **New / casual** (fresh profile): calm band holds (≤6 screens); the tutorial +
  reveal ceremonies pace the rest. No change needed.
- **Core / optimizer** (developed profile): the pre-fix state was the failure — every
  screen pulsed 4–7 competing elements, so NOTHING read as priority. The attention
  budget is the fix, and the report is the regression tripwire.
- **Completionist**: collection ratios remain, one tap deeper (tier breakdown folds).
- **Spender**: the store keeps exactly one attention bid (the sale), matching its one
  recommendation.

## 7. Rules for future screens

1. Ship a new screen → run `npm run cogload`; stay inside the budget.
2. New always-on animation → pick a band deliberately (attention = the ONE priority only).
3. New stat display → decide its layer FIRST; Layer 3 goes behind `<Detail>` or inspect.
4. Never take information away to pass a gauge — move it a layer deeper.
