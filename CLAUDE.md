# CLAUDE.md — Tower Defense Game

Greenfield tower-defense game. This file is the operating guide for any Claude
session working in this repo. It captures the practices worth keeping; expand
the stack-specific sections (build/test/run) as the project takes shape.

> Status: **bootstrap** — no tech stack committed yet. Sections marked _(grows
> with the project)_ are conventions to fill in, not commands that exist today.
> Don't invent commands; if a script isn't real, it isn't an instruction.

---

## ⚠️ Git & branch discipline — read before any git operation

- **Never commit or push to `main`/`master`.** Work only on the feature branch
  assigned to your session/task.
- **Verify the branch before committing:** `git branch` must show a `*` on your
  assigned branch, not `main`.
- If the branch is missing locally:
  `git fetch origin && git checkout -b <branch> origin/<branch>`.
- **Push with** `git push -u origin <branch>`. On network failure, retry up to 4×
  with exponential backoff (2s, 4s, 8s, 16s) — never force-push to recover.
- **No pull requests unless the user explicitly asks.**
- Small, focused commits with clear messages. Commit/push only when work is at a
  coherent checkpoint or the user asks.

> Multiple sessions may share a branch. Pushing to the wrong branch strands work
> and forces manual recovery — confirm `git branch` first, every time.

---

## 🗣 House style — every reply

- **Lead with the result or action.** Be concise.
- **Prefer tool calls over narration.** Don't pre-announce ("I'll now…") and
  don't over-explain.
- **Skip options you won't pursue.** Give a recommendation, not a survey.
- Expand only when the user asks for depth (a comparison, a design rationale).

---

## 📜 Project constitution — the lens for every change

Every implementation should improve at least one of: **scalability,
maintainability, performance, readability, extensibility, player experience,
developer velocity** — and sacrifice none of them for short-term convenience.

- **Boring, maintainable, obvious code wins.** Avoid clever abstractions and
  overengineering; production code beats impressive code. Optimize for the next
  developer who reads it.
- **Treat every new system as permanent infrastructure**, not a temporary
  feature.
- **When uncertain, choose the version that still makes sense after three years**
  of active development.

These values are the lens; the sections below are how we apply them.

---

## 🔁 Rigor loop — plan → implement → verify → self-critique

Apply to every non-trivial change:

1. **Plan first.** For multi-step work, write a short numbered plan before
   editing. Use the best available model for planning (Opus → Sonnet).
2. **Implement** in focused edits that read like the surrounding code.
3. **Verify.** Run the project's checks (build/tests/lint) and, for gameplay,
   actually run the game and watch the behavior — not just the tests.
4. **Self-critique before reporting done.** Name at least one limitation, gap, or
   risk and fix it or flag it. A green check proves it _runs_, not that it is
   _correct and complete_.

Before finalizing, review the diff for: **duplicate logic, dead code, performance
regressions, unnecessary allocations, future bottlenecks, save compatibility, and
API consistency.**

_Optional:_ for large or parallelizable work, delegate implementation to
sub-agents (`model: "opus"` for engine/systems, `model: "sonnet"` for
content/routine) and keep planning + verification + all git ops in the main
session. Only spawn sub-agents when the user asks or the task clearly warrants
the fan-out.

---

## 🧩 Discipline decomposition — split a task by responsibility

For multi-faceted work, decompose the task into independent engineering
disciplines, give each a single clear responsibility, solve each in isolation,
then integrate at the seams. This keeps concerns from bleeding into each other
and makes the plan reviewable before any code is written.

- **Pick only the disciplines the task actually touches** — e.g. Gameplay,
  Systems, Rendering, UI, AI, Performance _Engineers_; Economy, Progression,
  Balance _Designers_. Don't manufacture roles the task doesn't need.
- **One responsibility per discipline, stated explicitly.** No cross-
  contamination — a UI change doesn't reach into balance numbers; a balance
  tweak doesn't restructure rendering.
- **Solve each responsibility independently, then integrate** through shared
  config and public APIs — not by interleaving unrelated edits.
- **Present a short plan before coding** that names each discipline and its
  responsibility. This maps onto the optional sub-agent split above
  (engine/systems → `opus`, content/routine → `sonnet`).
- **Classify the split for parallelism:** _safe-parallel_ (no shared state),
  _dependent_ (needs another task first), and _integration_ (wires the pieces
  together). Sequence accordingly, and favor independent tasks to minimize future
  merge conflicts.

---

## ✂️ Minimal-diff discipline — surgical edits only

**Never rewrite an entire system unless absolutely necessary.** Treat every edit
as if it lands in a large production repo with active contributors: the smaller
and more localized the diff, the lower the merge-conflict and regression risk.

- **Find the smallest implementation** that satisfies the task; modify only the
  components actually affected.
- **Preserve surrounding code.** Don't touch lines you don't need to change.
- **No cosmetic refactors, no formatting-only churn.** Don't reflow, rename, or
  reorder code that the task doesn't require.
- **Prefer localized edits over file rewrites.** Rewrite a whole file only when a
  surgical edit genuinely can't express the change.
- **Preserve public APIs** and call sites whenever possible; avoid moving files
  unless absolutely necessary.
- **Minimize diff size** as a first-class goal — it's the unit reviewers read and
  the surface where conflicts happen.

> A "rewrite" that could have been a three-line edit is a defect, not a cleanup.

---

## 🤝 Trust existing architecture — don't re-analyze by default

**Assume previous architectural decisions remain valid.** Treat existing
implementations as trusted and infer what you need about the architecture from
the current task rather than re-deriving it from scratch.

- **Don't re-analyze a working system** unless it's (a) explicitly requested,
  (b) required for correctness, or (c) required for compatibility (save format,
  public API). Otherwise build on it as-is.
- **Read only what the task requires.** No full-project sweeps.
- **Don't repeat prior conclusions** — settled decisions stay settled unless
  explicitly changed.
- **Revisit a system only on evidence** it's actually wrong: a failing test, a
  reproduced bug, or a direct contradiction with the task.
- **Extend, don't redesign.** The architecture is stable; change its shape only
  on a _measurable_ scalability or performance problem, or a correctness issue —
  otherwise extend the existing systems.

---

## 🔎 Targeted reading — inspect the minimum

Before opening files, decide what's actually relevant and read only that. The
repo is the cost surface for tokens and attention alike; traversing it wholesale
is the waste this rule prevents.

- **Name the likely-relevant files first**, then open only those.
- **Don't recursively explore directories** or skim unrelated code "for
  context."
- **Read incrementally.** If a file turns out to be necessary, open it then — not
  preemptively.
- **Minimize traversal.** Prefer a targeted search (symbol, path) over walking
  the tree; widen scope only when the task demonstrably needs it.

---

## 🚫 Finish what you start — the backlog is a last resort

**Default: execute the task in full. Do not defer.** Complete the design,
implementation, _and_ verification before reporting done. Starting something and
leaving the rest "for later" is exactly how a codebase rots into pointless
spaghetti — half-wired features, dead branches, TODOs nobody returns to.

- **Do not use `docs/BACKLOG.md` to dodge finishing.** Parking the remainder of
  the work you just started is the failure mode this rule exists to prevent.
- **The backlog is for niche edge cases only**, e.g.:
  - You are about to run out of usage/context and need to push a coherent,
    **working** "finished" checkpoint, and all that remains is non-essential
    polish.
  - A genuinely out-of-scope follow-up that was never part of the current task.
- **Never shunt the core of a task to the backlog.** If you truly can't finish,
  say so plainly and name the blocker — don't quietly defer it.
- Polish-only remnants are the only thing acceptable to defer, and only when
  finishing now is genuinely not possible.

---

## 🧹 Background task & monitor hygiene

A machine bricked by runaway background processes is why these rules exist:

1. **At most one background monitor at a time.** Stop the previous before arming
   a new one. Never stack monitors per push/CI retry.
2. **Don't arm a monitor for a one-time check** — use a foreground command
   (`git rev-parse`, `tail`) instead.
3. **Never use a foreground `sleep`/`until` loop** to wait on an external event.
4. **Leave nothing running at end of turn.** Confirm pushes in the foreground; no
   monitor should outlive the work.

---

## ✅ Verify before push _(grows with the project)_

**All green before pushing.** Canonical checks:

```
npm run typecheck   # tsc --noEmit (strict)
npm test            # vitest run (sim/save/rng)
npm run build       # tsc --noEmit && vite build → dist/
```

For gameplay changes, also launch the game and confirm the behavior live
(`npm run dev`, or `npm run preview` against a build). The vertical slice was
verified additionally with a headless-Chromium smoke run.

---

## 🎮 Game design & content conventions _(grows with the project)_

Tower-defense systems are interconnected — a balance tweak ripples across waves,
economy, and towers. Keep design decisions written down so changes stay coherent:

- **Design before content.** New towers, enemies, waves, or maps should trace to
  a design decision, not appear ad hoc. Capture intent (cost, role, counter)
  alongside the implementation.
- **Centralize tunables.** Keep balance values (damage, range, costs, wave
  composition) in data/config, not scattered through logic, so they're tunable
  and reviewable in one place.
- **Document as you build.** As the project grows, keep a `docs/` with:
  - `DESIGN.md` — core mechanics, balance philosophy, the numbers and why.
  - `GAME-STATE.md` — what systems/content exist and their status.
  - `BACKLOG.md` — deferred work (last resort only — see "Finish what you
    start").
  - `BUGFIX-LOG.md` — one row per fix (symptom → root cause → fix).

---

## 📈 Build for scale — generalize, don't hardcode

Design every system for the **target content scale**, not today's handful of
items:

| Content | Target | Content | Target |
|---|---|---|---|
| Towers | 100 | Enemy types | 100 |
| Heroes | 30 | Bosses | 50 |
| Cards | 500 | Prestige systems | 20 |
| Upgrades | 1000 | Equipment items | 500 |

- **Refuse approaches that obviously break at this scale** — per-item `switch`
  ladders, O(n²) per-frame scans, hand-authored UI per item. Favor scalable
  implementations even at slightly higher upfront cost.
- **Generalize before you specialize.** When a feature could be one instance of a
  general pattern, build the small reusable framework first, then express the
  feature through it.
- **Prefer a data-driven entry** (in `src/core/config.ts` or sibling data) over a
  feature-specific implementation whenever practical.

---

## 🗜 Compressed system summaries — write once, reuse across sessions

When a **major system** is completed, write a compressed developer summary so
future sessions can build on it without re-reading the implementation. Record it
in `docs/GAME-STATE.md` alongside that system's status; it becomes the canonical
reference — prefer it over re-reading the code (see "Trust existing
architecture").

**≤ 500 words**, covering only:

- **Architecture** — shape and key components.
- **Public APIs** — entry points and signatures callers use.
- **Extension points** — where new content/behavior plugs in.
- **Important assumptions** — invariants the system relies on.
- **Future hooks** — planned seams left open.
- **Known limitations** — gaps, risks, deferred edge cases.

---

## 🛠 Tech stack & commands

> **Stack: confirmed.** React + TypeScript + Vite, built as a **static SPA for
> Cloudflare Pages** (no backend, no SSR; browser-local saves). This supersedes the
> earlier provisional "not HTML / Python" lean. Architecture: `docs/ARCHITECTURE.md`.
> Deployment: `docs/DEPLOYMENT.md`. The deterministic simulation core lives in
> `src/core/` (no React/DOM imports); React is HUD/menus only.

| Concern | Command / notes |
|---|---|
| Language / engine | TypeScript (strict) + React 18; Canvas 2D rendering |
| Install deps | `npm install` |
| Run the game | `npm run dev` (Vite dev server) |
| Build | `npm run build` → static `dist/` (Cloudflare output dir) |
| Preview a build | `npm run preview` |
| Test | `npm test` (Vitest) |
| Typecheck | `npm run typecheck` |

Balance lives in `src/core/config.ts` (centralized tunables). `node_modules/` and
`dist/` are gitignored; `package-lock.json` is committed for reproducible builds.
