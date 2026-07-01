# BACKLOG.md — honestly-deferred work

> The single home for work that is **genuinely deferred**, not silently dropped (CLAUDE.md "Finish
> what you start" — the backlog is a last resort, for niche edge cases + out-of-scope follow-ups,
> never the core of a task). Each entry says WHY it's here. Current state of what IS built:
> `GAME-STATE.md`.

## Boss layer (Milestone 1 shipped; the rest is roadmap)
- **Milestone 2–4 bosses** (biome / prestige / ∞ + the elite-variant overlay system) and their
  module primitives (`shield-linked`, `zone-denial`, `adaptive-resist`, `mutate-phase`,
  `burrow-reposition`). Deferred on purpose: the primitives land *with* the bosses that use them so
  nothing ships as dead data (BOSS-DESIGN §2/§6).
- **Per-boss Bestiary entries.** The collection codex currently keys bosses by *chassis*, so the six
  authored Milestone-1 bosses share chassis rows. A per-id codex is a follow-up.
- **First-kill capability rewards.** A boss kill feeds the chassis Bestiary + collection reward
  tracks today (a real reward), but not yet the bespoke "unlock the answer-capability" celebration
  BOSS-DESIGN §6 describes.
- **Splitter tuning.** `mitotic_horror` splits 2 generations; magnitudes are a first pass and may
  want a balance pass once real players reach C25.

## Economy (the top open P0 from EA-DESIGN-AUDIT)
- **Mid/late-game currency sink.** Star/currency sinks cap in tens of hours; overflow Strain Samples /
  Apex Genome then have nowhere to go. ECONOMY.md's "every phase opens a new sink" is designed, not
  built. This is the highest-leverage retention gap.

## Architecture / cleanup
- **Decompose `meta.ts`** (~1,500-line god-object) by domain behind the same public object
  (EA-DESIGN-AUDIT §1, P1). Works today; it's the merge-conflict / reasoning bottleneck at scale.
- **Dead CSS sweep.** The Reforge/Compare overlays were replaced by `ui/ItemDetails.tsx`; their
  `.rf-*` and non-shared `.cmp-*` classes in `index.css` are now unused (kept `.cmp-overlay`, still
  the shared backdrop). Low-risk to delete.
- **Doc consolidation.** ~75 design docs is itself a maintenance surface (EA-DESIGN-AUDIT §12).
  `GAME-STATE.md` is now the status tiebreaker; several overlapping design docs could merge.

## Structural (platform decisions, not features)
- **Backend** (accounts / cloud save / dailies / analytics / remote config). Everything live-service
  in the docs is blocked here until it's a platform decision (EA-DESIGN-AUDIT §9). Until then the
  honest shape is a premium finite-with-prestige roguelite; `SaveManager` export/import is the
  interim backup.
