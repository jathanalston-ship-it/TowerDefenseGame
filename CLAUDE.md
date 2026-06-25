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

_Optional:_ for large or parallelizable work, delegate implementation to
sub-agents (`model: "opus"` for engine/systems, `model: "sonnet"` for
content/routine) and keep planning + verification + all git ops in the main
session. Only spawn sub-agents when the user asks or the task clearly warrants
the fan-out.

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
