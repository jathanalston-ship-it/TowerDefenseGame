# ENGINEERING-AUDIT.md — repository-wide engineering audit

A complete engineering-quality audit of ASSIMILATE (structure → modules → refactors → outlook),
run at the transition from feature-sprint development to architecture-first development. **No
functionality was removed and no gameplay was altered**: the full suite (707 tests, including the
byte-exact golden sim runs) passed unchanged after every refactor in this pass.

Companion documents: `PROJECT_MANIFEST.md` (the per-system map — read that first),
`CODEMAP.md` (file-level orientation), `GAME-STATE.md` (what's built).

---

## 1. What the audit found

### Step 1 — folders, files, assets

| Check | Result |
|---|---|
| Folder naming | ✅ Consistent (`core / state / ui / render / save / audio / debug`, `ui/components`, `ui/tutorial`) |
| Duplicate / dead folders | ✅ None |
| Abandoned prototypes | ✅ None in-repo (experiments live in the session scratchpad, never committed) |
| Temporary files | ✅ None (`*.tmp/ований~/bak/log/DS_Store` sweep clean; `dist/`, `node_modules/` gitignored) |
| Duplicate assets | ✅ None (art is procedural — SVG/Canvas generated from ids; `public/` holds only Pages config) |
| Obsolete configs | ✅ None (one `tsconfig`, one `vite.config`, one `package.json`; lockfile committed) |
| Duplicate utilities / constants | ⚠️ **7 findings — fixed this pass** (see §2) |
| Duplicate interfaces | ✅ None problematic (domain-distinct rarity types are intentional; see §3.3) |

### Step 2 — modules

| Check | Result |
|---|---|
| Circular dependencies | ✅ **Zero at runtime.** madge reports 9 cycles, every back-edge is `import type` (erased at compile). Deliberate, documented pattern (e.g. `power → cards` types while `cards → power` runtime). |
| Giant files | ⚠️ 4 known: `index.css` (5.3k), `core/game.ts` (3.8k), `state/meta.ts` (2.0k), `render/renderer.ts` (1.1k) — see §4 |
| God classes | ⚠️ `Game` and the `meta` store are the two wide modules — by design (sim façade / progression façade), but both are past the comfort line (§4) |
| Duplicated logic | ⚠️ 7 concrete duplications found — **all fixed** (§2) |
| Poor abstractions / tight coupling | ✅ Strong overall: registry-driven content, effect DSL, pure read-models, one-way `sim → snapshot → UI` data flow |
| Unnecessary inheritance | ✅ None — the codebase is composition/data-driven throughout (one class hierarchy: none; `Game`, `Rng`, `Registry`, `SaveStore` are standalone) |
| Hidden side effects | ⚠️ Two module-load side effects, both documented and intentional: content self-registration (config/cards) and `notificationSources` registration-on-import |
| Repeated calculations | ✅ Hot paths memoize (spatial grid, folded kits); UI read-models are cheap (≤3 ms at 500-card stress) |
| Dead code | ✅ Near-zero: ts-prune found 10 unused exports; 2 were genuinely dead (removed), the rest are deliberate API surface (accessors like `currency(id)`, `rewardDef`) |

## 2. Refactors applied (this pass — all behavior-identical)

1. **`save/derive.ts` — canonical `highestCampaignStage`.** The single most-duplicated
   computation in the repo (2 named copies + 5 inlines across meta, mechanics, geneArchive,
   nextGoal, GeneArchive, ProgressDashboard) now has one cycle-free home; `meta` re-exports it so
   no caller broke. Future save-derivations that multiple layers need go here.
2. **`core/math.ts` is the one math-helper home.** `clamp` (3 local copies deleted), new
   `clamp01` (2 copies deleted), new `sumValues` (2 copies deleted).
3. **`core/lootQueue.ts` PRNG dedupe.** Its copy-pasted mulberry32 closure replaced with the
   shared `core/rng.Rng` — bit-identical algorithm, proven by the seeded-queue round-trip tests.
4. **`ui/components/useCountUp.ts`.** The reward count-up hook existed twice (RewardReveal,
   VaultReveal); now one hook with `{ ms, instant }` options.
5. **`state/prefs.ts` → `DEVICE_PREF_KEYS` registry + `AUTOSTART_KEY`.** Fixes a latent bug the
   audit surfaced: `devReset('everything')` ("factory reset") never wiped `assimilate.diff.*` or
   `assimilate.notif.seen` because its key list was a hand-maintained copy. The registry is now
   the single list a new pref must join; the autostart key literal (2 copies) is one const.
6. **Dead code removed:** `CheckIcon` / `CrossIcon` (unreferenced).
7. Everything re-verified: typecheck, 707 tests (goldens byte-identical), production build,
   madge re-run (no new cycles).

## 3. Audited and deliberately NOT changed

These are the judgment calls; recorded so future sessions don't re-litigate them.

1. **Type-only import cycles (9).** Erased at compile; making them structurally impossible means
   hoisting shared types into more files for zero runtime benefit. Revisit only if a runtime
   cycle ever appears (madge in CI would catch it — see §6).
2. **Three `rarityColor` implementations** (`ui/components/ItemArt` equipment-CSS-vars,
   `state/vaultReveal` reveal-hexes, `ui/components/GeneCardArt` card rarities, plus the
   data-driven `rarityRegistry.color`). They intentionally return *different values per surface*
   (e.g. exotic is `var(--viral)` on gear cards but `#5ffbf1` in the vault ceremony). Merging
   them would silently recolor surfaces — a visual change this audit is forbidden to make.
   Correct fix later: route all four through `rarityRegistry` + CSS vars in one deliberate
   visual-consistency pass.
3. **FNV-1a hash in `core/campaign.ts` vs `ui/components/GeneCardArt.tsx`.** Same core constants,
   different shapes (hash vs stream). campaign.ts feeds seeded procgen — touching it risks the
   golden invariant for a 4-line dedupe. Left alone.
4. **`formatReport` ×2, `labelAt` ×2** — same names, different domains (content-validation report
   vs sim-harness report; canvas label draw vs tier-label lookup). Not duplicates.
5. **The giant files** — splitting them is a real project, not a drive-by (see §4/§6).

## 4. Current strengths / weaknesses / debt / bottlenecks

### Strengths
- **The core/UI split is real and enforced by habit:** `src/core/` has no React/DOM imports, runs
  headless, and is pinned byte-exact by golden tests. This is the single most valuable property
  of the codebase — every risky change is caught by `npm test`.
- **Data-driven content at every layer:** one `Registry<T>` for towers/heroes/enemies/cards/
  bosses/chests/equipment/rarities; one declarative `CardEffect` DSL shared by cards, equipment,
  collection bonuses, and gene upgrades; adding content is a data row + validator pass.
- **Dev-boot content validation** (`validateContent`, `cardProblems`, Power-visibility rules)
  makes bad content fail loud before it ships — including future content (gene levels, ascension
  tiers).
- **Pure read-models** (`geneArchive`, `nextGoal`, `hubProgress`, `collection`, `vaultReveal`…)
  keep the UI logic-free and testable; the 500-card stress test proves they scale.
- **Save discipline:** versioned, checksummed, additive migrations, per-field sanitizers,
  backups; migration behavior is test-pinned.
- **Test culture:** 707 tests / 113 files, including golden sim characterization, economy
  simulations, and scale stress tests.

### Weaknesses
- **`core/game.ts` (≈3.8k lines) is the sim monolith.** All systems (spawning, towers,
  projectiles, statuses, hero AI, bosses, particles, run events) live in one class. It works and
  is golden-pinned, but every gameplay task pays a navigation tax, and parallel sessions editing
  it collide.
- **`state/meta.ts` (≈2.0k lines) is the progression God-module:** store + ~15 subsystem APIs
  (stars, heroes, equipment, loot, containers, genes, prestige, power, resets…). Well-organized
  internally, but its size makes every progression change touch the same file.
- **`index.css` (≈5.3k lines) is one global stylesheet.** Sections are commented, but there is no
  enforced ownership; dead selectors can accumulate undetected.
- **Module-load side effects** (self-registration) mean import ORDER subtly matters in tests;
  documented, but a known trap for new contributors.

### Technical debt (ranked)
1. `game.ts` monolith (navigation + merge-conflict tax; blocked on golden-preserving extraction).
2. `meta.ts` God-module (same shape, lower risk — pure TS, no determinism constraint).
3. `index.css` monolith (no per-feature ownership; hard to prune).
4. Rarity color mapping ×4 (visual-consistency pass needed — §3.2).
5. `GENE_POWER_SCALE` and similar library-size-coupled constants (recalibrate as content grows;
   test bands fail loudly by design).
6. No lint-enforced import-direction rule (`core` must never import `ui/state/render` — true
   today by convention only).

### Future bottlenecks (at the 100-tower/500-card/1000-upgrade target scale)
- **Content volume vs. one-file registries:** `config.ts` (1.3k) and `geneUpgrades.ts` grow
  linearly with content; fine at 10×, but they'll want per-domain content files folded through
  the same registries (the Registry API already supports it — it's a file split, not a redesign).
- **Archive/Collection DOM** at several hundred *visible* tiles will want list virtualization
  (read-models already proven fast; it's purely a rendering concern).
- **The sim's entity arrays** are pooled and fine at current wave sizes; the AI-Director endless
  cap bounds entity counts, so no O(n²) walls are near.
- **Save-blob growth** is bounded by content counts (sparse maps everywhere); nothing unbounded
  found.

## 5. Suggested architecture improvements (priority order)

1. **Freeze the import-direction rule in tooling** (eslint `no-restricted-imports` or
   dependency-cruiser: `core/**` may not import `state|ui|render|save`; `save` may not import
   `state|ui`). One config file; makes today's discipline permanent. *(Small)*
2. **Split `meta.ts` by subsystem** into `state/meta/` modules (stars, containers, genes,
   equipment, prestige…) composed behind the existing `meta` façade — public API unchanged,
   file-per-subsystem ownership. *(Medium; no determinism risk)*
3. **Extract sim systems from `game.ts` incrementally** — one system at a time (statuses,
   projectiles, hero AI) into `core/systems/*` with the golden test as the safety net after each
   move. Never as one big-bang rewrite. *(Large; highest payoff)*
4. **Split `index.css` per feature** (`styles/archive.css`, `styles/hub.css`, …) with Vite
   imports; enables dead-style pruning per feature. *(Medium, mechanical)*
5. **Unify rarity colors through `rarityRegistry` + CSS vars** in one deliberate visual pass
   (screenshot-diffed). *(Small-medium; visual review required)*
6. **Add `madge --circular` and `ts-prune` to CI** so cycles/dead exports are caught at PR time.
   *(Small)*

## 6. Estimated maintenance savings

Qualified estimates (this codebase, single-developer-plus-Claude cadence), from this pass:

- **Dedupe pass (done):** every future change to campaign-stage logic, clamping, count-up
  behavior, or pref keys now edits ONE site instead of 2–7. Prevents the classic
  drift bug (one copy updated, six stale) — the `devReset` wipe bug found in this audit is
  exactly that class, and it existed in shipped code.
- **PROJECT_MANIFEST.md (done):** new-session orientation drops from "grep + read 3–5 docs"
  to one document; conservatively **10–20 minutes saved at the start of every session**, and
  fewer wrong-file edits (the expensive kind).
- **If §5.2–5.4 are executed:** merge-conflict surface on the two hottest files (`meta.ts`,
  `game.ts`) drops roughly in proportion to the split (10–15 subsystem files instead of 2
  monoliths) — the main enabler for running parallel feature sessions safely, which is the
  actual velocity multiplier at this stage.
- **CI guards (§5.1, §5.6):** near-zero cost, converts three "by convention" invariants
  (import direction, no cycles, no dead exports) into machine-checked ones.

---

*Verification for this audit's changes: `npm run typecheck` clean · `npm test` 707/707 (golden
runs byte-identical) · `npm run build` clean · madge re-run (no new cycles).*
