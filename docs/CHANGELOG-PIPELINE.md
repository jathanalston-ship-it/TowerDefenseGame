# CHANGELOG-PIPELINE.md — Chronicle: git history → patch notes, automatically

One command turns development history into player communication:

```
npm run notes            # process new commits since the last run
npm run notes -- --seal  # close the open release (next commits start a new one)
```

Every artifact it writes is **committed** — deploys stay deterministic, everything is
reviewable/editable before players see it, and no CI hook or daemon is required.

## The flow

```
git commits ──▶ classifier ──▶ changelog/ledger.json (machine state + releases)
                     │
                     ├─▶ src/changelog/releases.gen.ts  in-game Update Briefing data
                     ├─▶ site/patchnotes.json            website /news/ data (npm run site renders it)
                     ├─▶ docs/HISTORY.md                 internal chronological history
                     └─▶ docs/devlog/DRAFT-*.md          dev-blog draft (every ≥10 commits or merge)
```

## Pieces

| Piece | File | Role |
|---|---|---|
| Classifier | `src/changelog/classify.ts` | PURE: commit subject+body+files → standard category, player text, internal/review flags. Unit-tested. |
| Vocabulary | `src/changelog/types.ts` | `NOTE_CATEGORIES` — the only categories notes may use (Gameplay, Balance, Heroes, … Bug Fixes). |
| Generator | `scripts/gen-notes.ts` | Reads git since `ledger.lastSha`, classifies, detects content, writes every artifact. |
| Ledger | `changelog/ledger.json` | Committed machine state: lastSha, content-id inventory, releases, full history. **The editing surface.** |
| Game data | `src/changelog/releases.gen.ts` | Generated. Player-facing releases, newest first. |
| Briefing | `src/ui/UpdateBriefing.tsx` | Menu popup when `save.patchNotes.seen` ≠ newest release (v28). Highlights + category groups + Continue / Full notes / Dev blog / Never again. |
| Website | `site/patchnotes.json` → `/news/` | `npm run site` renders it (search + categories + Home "latest patch" card — docs/WEBSITE.md §patch-notes). |

## How commits become notes

1. **Conventional type first**: `fix:` → Bug Fixes, `perf:` → Performance, `balance:` →
   Balance; `docs:`/`test:`/`chore:`/`refactor:` are internal (HISTORY.md only).
2. **Scope + keywords**: `feat(expeditions):` → Heroes; "mega boss" → Mega Bosses; etc.
3. **Changed paths** as fallback: `public/welcome/` → Website, `functions/` → Backend,
   `src/render/` → Visuals, …
4. **Content detection**: the generator diffs the live registries (towers, heroes,
   enemies, bosses, mega bosses, biomes, achievements, systemRegistry systems) against
   the ledger's inventory — new ids become ★ major highlights ("New tower: X") with no
   commit-message cooperation needed.
5. **Quality control**: vague subjects (`wip`, `update`, <8 chars) are **flagged ⚑**,
   recorded internally, and NEVER auto-published. Rewrite them in the ledger.

## Releases & versions

- Releases are date-keyed: `v2026.07.09` (a `.2` suffix when a sealed release shares a
  date). The **open** (unsealed) release absorbs new commits; `--seal` freezes it.
- **AUTO-SEAL BY DATE** (the "site never updates" fix): an open release only absorbs
  commits from its own calendar day — the first processed commit of a NEWER day seals it
  and opens a fresh date-keyed release automatically. The site's "latest patch" header
  therefore rolls forward daily with zero human involvement; `--seal` remains for
  deliberate mid-day cuts. (Before this, one open release absorbed 10 days of work while
  the site kept advertising its original date.)
- **CI freshness**: `.github/workflows/deploy.yml` re-runs `npm run site` at HEAD before
  building (ephemeral — never committed back), so the DEPLOYED /news/ includes every
  commit up to and including the deploying one. The committed artifacts stay the
  reviewable record and inherently lag exactly one batch.
- **Drift gate**: `src/changelog/siteSync.test.ts` fails the suite when releases.gen.ts,
  site/patchnotes.json or public/news/index.html lag the ledger — same contract as the
  DIL graph regen test. Fix is always `npm run site`.
- **Revert**: everything is committed data — `git revert <sha>` + push redeploys the
  previous notes atomically (docs/DEPLOYMENT.md §rollback for the instant CDN-level path).
- Player tracking: `save.patchNotes.seen` holds the last release id seen (save v28).
  The briefing shows everything newer, once, on the menu. Fresh accounts baseline
  silently. `optOut` is the permanent "never show again" (reversible).

## Editing before release (the human pass)

Edit `changelog/ledger.json` — the UNSEALED release's `title` and `entries` (text,
category, `major`) — then re-run `npm run notes` to regenerate every artifact.
Never hand-edit the generated files (`releases.gen.ts`, `site/patchnotes.json`,
`HISTORY.md`); they are overwritten on the next run. Historical pre-Chronicle notes
were imported as SEALED releases (v2026.06.* … v2026.07.08).

## Devlog drafts (§devlog)

Every ≥10 processed commits (or a merge into main) writes
`docs/devlog/DRAFT-<date>.md`: feature overview, developer summary, engineering
notes, screenshots placeholder, balance commentary, known issues (⚑ flags), future
plans. **Drafts are never auto-published**: edit, publish as a post in `site/blog.ts`
(`npm run site` regenerates /blog/), then delete the draft.

## Session discipline

Run `npm run notes` at the end of a work batch (alongside `npm run handoff`), commit
the regenerated artifacts with your changes. Commit messages ARE the patch notes —
write player-meaningful subjects (`feat(towers): …`), and the pipeline does the rest.

Update briefing secondary actions (patch notes, blog, and Never show again) have a 44px minimum height in UpdateBriefing.css, including tablet layouts.
