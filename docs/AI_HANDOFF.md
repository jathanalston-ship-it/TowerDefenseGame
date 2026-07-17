# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-17 16:09 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** c9e01d9

## Summary of work completed

Shipped the IN-RUN GENE CARD DRAFT READABILITY overhaul (commit c9e01d9): a universal
effect-language core (`src/core/effectLanguage.ts` — 8-band impact scale, 12-category
color/glyph palette, TOTAL per-RunModifiers-field vocabulary) that auto-generates
digit-free primary card text from the same leveled effects a pick applies, plus the
DraftModal rebuild around it (hierarchy, colored bold keywords, hover/Shift/long-press
exact-values expansion, live gene-stack before→after + Power diff, meaningful-only
synergy chips). Also audited the auction-house buy-now request: **already implemented**
(optional seller input, ×1.25 recommended prefill; engine-enforced) — no change needed.
The one thing to know: `FIELD_VOCAB` is a total `Record<keyof RunModifiers, …>`, so a
new run-modifier field is a TYPE ERROR until its vocabulary is authored — that is the
future-proofing contract, not an accident.

## Files modified

- Source (1): `src/changelog/releases.gen.ts` (this rituals commit; the feature landed
  in c9e01d9: effectLanguage.ts, cards.ts, types.ts, game.ts, DraftModal.tsx,
  GameView.tsx, index.css, knowledge.ts, systemRegistry.ts)
- Tests (0): — (c9e01d9 added `src/core/effectLanguage.test.ts`, 16 tests)
- Docs (1): `docs/HISTORY.md` (c9e01d9: CARDS.md §language, DIL/DEP graphs)

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts`
- (c9e01d9) **gene-cards** — effect language + draft surface; **hub-shell** — DraftModal.

## Power Score changes

None — the language layer only DESCRIBES effects. `CardOption` now carries `effects`
so the UI computes `effectsPower` diffs for display; the sim's own accounting is
untouched (chooseCard's audit path unchanged).

## UI changes

DraftModal: name → procedural art + subject badge → generated effect lines (first line
primary; drawbacks "But …" in danger color, sorted last) → synergy chip (only when ≥2
drafted cards share the category) → DRAFT. Detail expansion (hover 550ms / hold Shift /
long-press 450ms): exact numeric rows with category glyphs, "YOUR GENE STACK"
before→after, Gene-stack Power diff, technical line. Keyword bloom one-shot glow
(reduced-motion gated); art hidden under 600px height; uncommon rarity chrome added
(was missing from RARITY_RANK and card CSS). Verified live headlessly (scratchpad
draft-probe: 2 waves cleared, both drafts asserted digit-free + expansion + comparison,
screenshots eyeballed) and by mobilecheck (CLEAN, all 4 viewports).

## Documentation changes

`docs/CARDS.md` §language written (contract, scale, palette, vocab totality, draft
surface, adoption path). `docs/CHANGELOG-PIPELINE.md`: no change needed (notes ritual
only ran). DIL edge added (gene-cards → hub-shell, the "new content speaks through
effectLanguage" rule); DEPENDENCY_GRAPH + DIL_GRAPH regenerated.

## Save changes

None — CardOption is a runtime DTO; CardDef.simple is optional authoring data.

## Known edge cases

- Instant-only cards (biomass/integrity/heroHp) legitimately have NO comparison rows
  and read "No Power Score impact — instant value" — by design, not a bug.
- Two instant cards of the same op can share identical primary text (amount differs
  only in the expansion); the collision test allows same-shape duplicates only.
- Touch long-press suppresses the release click AND the next tap closes the inspect
  before a pick can fire — do not "simplify" that ordering; it guards accidental drafts.
- Count words cover 1–20 (`COUNT_WORDS`); a future folded count > 20 would leak digits
  and FAIL the no-digit test — extend the word list, don't weaken the test.
- The draft DTO describes LEVELED effects, so snapshot text can differ per account
  (gene levels); goldens are unaffected (autoplay path has level 0 everywhere).

## Remaining technical debt

- Older surfaces (Gene Archive, equipment cards, mulligan/organ/symbiote inspections,
  in-run buff chips) still speak their own stat dialect — the CARDS.md §language
  adoption path lists them; each is a rendering swap to `describeEffects`.
- `hero`/`critical` palette colors are both warm (yellow/gold); the glyph + label carry
  the distinction, but a future palette pass could separate them further.

## Recommended next tasks

1. Migrate the Gene Archive card inspection to `describeCard` (entry:
   `src/ui/GeneArchive.tsx`, the description render; the leveled effects already come
   from `effectiveGeneEffects`).
2. Migrate equipment card text (entry: `src/core/equipment.ts` affix descriptions →
   `describeEffects` over `CardEffect[]` affix payloads).
3. Consider a settings toggle "always show exact numbers" for veterans (DraftModal
   `detailAll` is already the mechanism — persist a pref).

## Future expansion hooks

- `CardDef.simple` (cards.ts) — hand-written digit-free override; nothing uses it yet.
- `AUTHORITY_ELIGIBLE_OVERRIDES` (marketCatalog.ts) — buyback band widening, still empty.
- `EFFECT_CATEGORIES.genomeCore` / `.essence` — reserved for meta reward surfaces.
- `FIELD_VOCAB[...].up/down` shape overrides — per-field phrasing without new code.
