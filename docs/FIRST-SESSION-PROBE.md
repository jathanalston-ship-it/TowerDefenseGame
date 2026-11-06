# FIRST-SESSION-PROBE.md — the repeatable new-player playthrough

`npm run probe:first-session` (script: `scripts/first-session-probe.ts`) is the headless regression
probe for the **first session**: how fast it feels, how noisy the first return to the hub is, whether
anything throws, and what the browser has to download. It replaces the one-off manual playtest.

## What it does

Fresh Chromium context (new save) at 1440×900 against `vite preview` of a production build:

1. Opens `/play/`, **skips the intro cutscene**.
2. Plays the **combat tutorial** (reactive player: advances narrated beats, places the favourite tower,
   uses the conveyor, picks the draft card).
3. **Commissioning** (designation → identity → safeguard → continue as guest) → hub.
4. **The first loop — DEPLOY** (docs/TUTORIAL.md §first-loop): popups drained, then the coach is played
   like a player (Next on an explanation, otherwise a real click on the spotlit control) — it starts Stage 1.
5. **Campaign Stage 1 at 5×**: places towers, starts waves, picks drafts, reaches **Results**, back to the hub.
6. **GROW** (Evolution Hub → Tower Lab → a star → Power → home → the ledger → Stage 2), **Campaign Stage 2**,
   then **COLLECT** (Rewards Hub → Vault → crack → home → BEST MOVE → the Daily Bio-Cache). The log lists
   every coach step walked; a step that cannot complete fails the run naming the steps seen.
7. Optional `--offline`: reloads `/play/` with the network off (service worker only) and starts a run again.

The driver reacts to what is on screen (`data-tut` / `data-nav` / role / visible text, with fallbacks).
When a step cannot proceed it fails **naming the step** and dumps the visible text + a `blocked`
screenshot (with `--shots`) — it never hangs (every wait has a timeout).

## What it records

| Metric | How |
|---|---|
| Time to first tower / first wave / first reward | seconds since `/play/` was opened (cutscene skipped) |
| Modals after the first run | distinct `[role=dialog]` views between the first Results and a quiet hub (a "What's New" queue counts each card) |
| Toasts, nav badges | passive in-page `MutationObserver` (reward / loot / power / update toasts); `.nav-badge` count on the hub |
| Page errors, console errors | `pageerror` + `console.error`; `/api/*` failures are ignored (expected without Pages Functions) |
| Emitted JS/CSS | raw + gzip per chunk from the dist; **boot JS gzip** = scripts the page fetched before the first screen |

## Budgets (single config object at the top of the script)

| Budget | Limit |
|---|---|
| Page/console errors | 0 |
| Modals after the first run | ≤ 3 |
| Time to first tower (cutscene skipped) | ≤ 15 s |
| Boot JS gzip (static entry closure of play/index.html: entry + vendor + their static imports) | ≤ 515 KB (2026-11-05 boot pass: ~499 KB at the time of writing — docs/DEPLOYMENT.md §boot-budget) |
| Boot CSS gzip (the stylesheet play/index.html links — render-blocking) | ≤ 58 KB (~51 KB — §boot-css) |
| Session completed | every step reached |

Exit code 1 when any budget is violated. Time budgets are wall-clock on a headless browser — on a
loaded machine expect ±3 s of noise; re-run before chasing a 1–2 s miss.

## Usage

```
npm run probe:first-session                      # builds into a temp dir, writes docs/FIRST_SESSION_REPORT.md
npm run probe:first-session -- --dist dist       # reuse a build (must contain play/index.html)
npm run probe:first-session -- --offline         # + offline reload & run start (service-worker proof)
npm run probe:first-session -- --shots /tmp/s    # step screenshots (incl. the blocked step)
npm run probe:first-session -- --no-report --port 4400
```

Browser: `MOBILECHECK_CHROMIUM` if set, else the newest preinstalled headless shell under
`/opt/pw-browsers`, else Playwright's default (same `playwright-core` approach as `mobilecheck` / `cogload`).
The report `docs/FIRST_SESSION_REPORT.md` is **generated** — never hand-edit it.

## Maintaining it

- A tutorial/onboarding UI change that breaks a step shows up as `BLOCKED at <step>`. Fix the selector in
  `playRun` / `session` (prefer `data-tut`, `data-nav`, roles) — do not loosen a budget to hide it.
- A new always-on popup after the first run raises the modal count; that is the point of the budget.
- New screens must be `lazyNamed` (see docs/DEPLOYMENT.md §code-splitting) or the boot-JS budget trips.
