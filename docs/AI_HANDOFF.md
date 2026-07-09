# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-09 08:55 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** fcb893f

## Summary of work completed

Full visual overhaul of the Mulligan system's presentation. The Mulligan Lab was rebuilt from
inline-styled scaffolding into the design language (token-driven `.mgl-*` CSS, Tower-Lab
master–detail: host rail → graft-chamber showcase → graft sites → modifier library), with
Power-previewed spends, an auto-armed first empty site, DPR-crisp reduced-motion-aware canvas
preview, and category filtering. Rarity colors in `MULLIGAN_RARITY` now mirror the global `--r-*`
ladder (ascendant = mythic register), and a new `GENE_OVERFLOW` metadata export gives the currency
one name/glyph/color (⊛, gene-green) shared by the Lab wallet, the container-reveal pulls, and the
Inspector/Daily surfaces (whose phantom `--ink`/`--ink-dim` vars were fixed to real tokens). The
one thing to know: the Lab's display data now comes from `mulliganLabView` (`filled`, `dominant`,
`packageLines` per tower) — keep the React layer dumb and extend the model, not the component.

## Files modified

- Source (5): `src/core/mulligan.ts`, `src/index.css`, `src/state/mulliganLabModel.ts`, `src/state/vaultReveal.ts`, `src/ui/MulliganLab.tsx`
- Tests (1): `src/state/mulliganLabModel.test.ts`
- Docs (3): `docs/GAME-STATE.md`, `docs/MULLIGANS.md`, `docs/VALIDATION_REPORT.md`

## Systems affected (from the dependency registry)

- **loot** — `src/state/vaultReveal.ts`
- **mulligans** — `src/core/mulligan.ts`, `src/state/mulliganLabModel.ts`, `src/ui/MulliganLab.tsx`
- Consumer ring (verify, unchanged): boss-rush, crafting, equipment, infinite, shards-economy, splice-market

## Power Score changes

No scoring change — only rarity `color` strings moved in `MULLIGAN_RARITY` (statMult/powerMult/
levelCap untouched; pinned by `core/mulligan.test.ts` + `state/mulligan.test.ts` golden gate).
NEW preview surfaces: the Lab's graft-site level-up and ascend buttons now render `PowerPreview`
(current → next via `meta.previewPower` on the slot transform), computed only for awake organisms.

## UI changes

Surfaces in the blast radius: `GeneticVault`, `VaultReveal`, `LootMeter`, `LootToaster`, `GameView (organism overlay + emitter shots + graft ambience)`, `MulliganLab`, `Inspector (organism block)`, `DailyScreen (assignment briefing)`, `Vault reveal (Overflow + discovery pulls)`, `PlayerProfile (dex + Overflow rows)`

- **MulliganLab** — complete rebuild (see Summary). Verified live in headless Chromium: empty
  dex, dormant→awake equip flow (3 library clicks), level-ups deducting Overflow with Power
  previews, ascend affordances, category filter counts, partial-state dormancy copy, 1440px +
  390px (no horizontal overflow; `flex: none` fix keeps rail rows from compressing).
- **Vault reveal** — `geneOverflow` / `mulliganModifier` event pulls now carry the ⊛ glyph and
  the currency green / sequenced-rarity color instead of the generic ✦ + viral fallback.
- **Inspector organism block + Daily briefing** — phantom `var(--ink)`/`var(--ink-dim)`/raw-hex
  fallbacks replaced with real tokens (`--muted`/`--text`/`--success`/`color-mix` on `--viral`).
- **GameView / battlefield + emitter shots** — untouched (procedural generators unchanged).
- `npm run mobilecheck` CLEAN (20 screens × 390/320px); `npm run validate` PASS.

## Documentation changes

- `docs/MULLIGANS.md` — §UI rewritten for the new Lab; §reveal notes the ⊛ pull identity; new
  visual-identity bullet (rarity ladder alignment + `GENE_OVERFLOW`). **Updated.**
- `docs/GAME-STATE.md` — Mulligans entry's Lab sentence refreshed. **Updated.**
- Registry-listed loot/economy docs (`LOOTBOX.md`, `REWARD-PRESENTATION.md`, `EQUIPMENT*.md`,
  `SHARD-ECONOMY.md`, `ECONOMY.md`, `MARKET.md`, …): **no change needed** — reveal-pull visuals
  only; no economy/loot numbers or flows moved.

## Save changes

None — save layer untouched.

## Known edge cases

- `MULLIGAN_RARITY[*].color` is consumed as raw hex by canvas + inline styles — keep them raw
  (no `var()`), and keep them mirroring `:root --r-*` when the palette ever changes.
- The Lab's first-empty-site auto-arm means a library click equips immediately; an explicit
  armed pick (`setArmed`) always wins. Clearing a site resets the explicit pick.
- `OrganismPreview` reads `meta.get()` inside its rAF loop (always-live organism), draws one
  static frame under `prefers-reduced-motion`, and relies on rAF's tab-hidden throttling.
- The reveal special-case keys off the literal strings `'geneOverflow'` / `'mulliganModifier'`
  pushed by `meta.openContainer` — if a new mulligan event kind is added, extend that branch.

## Remaining technical debt

- The host rail runs one `TowerPortrait` rAF per tower (same pattern/cost as the Tower Lab rail);
  fine at the current roster, worth a shared ticker if rails reach ~50+ rows.
- Gene Overflow still isn't a wallet `CurrencyId` (deliberate — no icon silhouette yet);
  `GENE_OVERFLOW` in core/mulligan.ts is the single seam to upgrade it later.

## Recommended next tasks

1. A dedicated Gene Overflow SVG silhouette in `ui/components/Icon.tsx` + promote it through
   `GENE_OVERFLOW` so the reveal can render an animated icon instead of the glyph.
2. Slot-hover organ highlighting: `deriveOrganism` already returns per-organ data — the chamber
   could pulse the organs a hovered modifier contributes (entry: `OrganismPreview`).
3. An equip ceremony beat (chamber flash on awakening, like `tl2-flash-a`) when the third site
   fills — the Power announce already fires; the chamber could react too.

## Future expansion hooks

- `state/mulliganLabModel.ts` `TowerMulliganView.packageLines` / `dominant` — any future surface
  (tooltips, codex) can reuse the same display-ready package without touching the resolver.
- `core/mulligan.ts` `GENE_OVERFLOW` — the one place to evolve the currency's identity.
- `.mgl-*` CSS keys off `--tw` (host) / `--mg` (rarity) custom props — new rarities or hosts
  restyle without new rules.
