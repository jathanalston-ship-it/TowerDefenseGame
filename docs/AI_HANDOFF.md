# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-07-17 03:16 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** claude/zen-hawking-rh1gxl · **HEAD:** f91363a

## Summary of work completed

Two features shipped. (1) **Human matchmaking is on by default** wherever a relay resolves,
with an OPPONENTS toggle (HUMANS + AI / AI ONLY) on the Arena console: opting out runs the
short `ARENA.aiOnlySearchSec` beat but generates the construct at `aiFallbackPower`
×`ARENA.aiOptOutPowerPremium` (1.25) with UNCHANGED Elo stakes; the involuntary fallback
stays ×1, and `arenaRelayUrl()` now honors the device-local `assimilate.relayUrl` override
before the baked `VITE_ARENA_RELAY_URL` (enable PvP without a rebuild — ARENA.md §toggle).
(2) **The desktop rail is compressed to front doors only** — HOME + one `.hub-door` per hub
(+ the Store's direct door); screens are picked from the hub landings (NOTIFICATIONS.md
§hubs). The one thing to know: rail anchors moved — anything targeting per-screen
`[data-nav]` rows on desktop must go door (`[data-hub]`) → landing card instead; mobilecheck
and the HUD tour were moved with it.

## Files modified

- Source (1): `src/changelog/releases.gen.ts`
- Tests (0): —
- Docs (3): `docs/HISTORY.md`, `docs/VALIDATION_REPORT.md`, `docs/devlog/DRAFT-2026-07-17.md`

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts`

## Power Score changes

None — no Power-relevant system touched.

## UI changes

Surfaces in the blast radius: `App (UpdateBriefing popup)`

- Arena console: OPPONENTS toggle row (relay-gated, locked mid-search), "ENGAGING
  CONSTRUCT…" searching copy on the AI-only lane. Live headless probe: relay override +
  AI-only queue → match (scratchpad toggle-probe).
- Hub shell: rail = 7 quiet doors (glyph square + title + corner badge + chevron; active
  door opens toward the content panel); per-screen rows/rings/teasers now render ONLY on
  landings. Headless probe shots (rail-probe) + mobilecheck CLEAN at all 4 gate viewports
  (landings audited once per hub during the desktop walk).

## Documentation changes

Registry says these move with the touched systems: `docs/CHANGELOG-PIPELINE.md`

`docs/CHANGELOG-PIPELINE.md` — no change needed (pipeline untouched; notes/site regens ran).
Updated this batch: ARENA.md (§toggle + limitations), ONLINE-FOUNDATION.md (§relay override),
DEPLOYMENT.md (VITE_ARENA_RELAY_URL env row), NOTIFICATIONS.md (§hubs compressed rail),
RESPONSIVE-DESIGN.md (§4d desktop sweep), DIL knowledge rows + regen.

## Save changes

None — save layer untouched.

## Known edge cases

- The matchmaking pref is read at queue ENTRY only — a mid-search flip is deliberately
  ignored (`toggleHumanMM` no-ops while searching). Don't "fix" that.
- The AI-only pref is device-local; the ×1.25 construct is the deterrent, not a server lock
  (ARENA.md limitations records the revisit trigger).
- `headerless` on a NavGroup now means "direct door, no landing hop" — a second screen added
  to the Store group must DROP the flag or it will be unreachable on desktop.
- HudTour wing stops MUST carry `nav` (reveal gate) when anchored at `[data-hub]`; the
  tutorialAnchors guard now covers data-hub values (they resolve via navModel id literals).
- The Update Briefing modal's "Continue ▸" button is NOT matched by mobilecheck's dismiss()
  pattern (`^continue$`); the gate passes because clicks are programmatic — a future
  audit-tightening pass should extend the pattern.

## Remaining technical debt

None new. Observed: mobilecheck's dismiss() pattern gap above; the arena opponent header
shows the construct's RATING while power hardening is invisible in the HUD (cosmetic — the
hardened power is applied at generation and covered by arena.test §toggle).

## Recommended next tasks

1. Deploy a real relay (Durable Object port of `functions/lib/arenaRelayRoom.ts` — the
   broker is DO-portable by construction) and bake `VITE_ARENA_RELAY_URL`.
2. Auction House phase 2 (explicitly deferred by the user — do not start without their word).
3. Standing user-decision flags: arena `noMega` reversal; server-side-sim architecture
   change (ONLINE-FOUNDATION.md §0 / ARENA.md §brief-coverage conflict flags).

## Future expansion hooks

- `aiFallbackPower(power, optedOut)` (`core/arena.ts`) — the one knob for future
  opt-out shaping (e.g. rating-scaled premiums).
- `RelayTransport.setRoom` + `assimilate.relayUrl` (`net/arenaTransport.ts`) — any future
  relay host lands as config, not code.
- `.hub-door` + `data-hub` (`ui/Hub.tsx`) — group-level nav hooks for tours/onboarding;
  landings remain the only per-screen surface, so new screens stay one navModel row.
