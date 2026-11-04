# HUB-FLOW.md — the living hub (momentum design)

> The hub-redesign brief: "the game should live here" — every visit flows through multiple
> rewarding interactions; players frequently discover something they forgot they'd earned;
> everything pulses and reacts. This doc is the audit + the model; the systems it specifies
> live in `state/readyChain.ts` and the surfaces listed in §surfaces. Companion docs:
> REWARD-ARCHITECTURE.md (the five-loop registry this builds on), NOTIFICATIONS.md
> (badges/reasons), COMMAND-CENTER.md (the home board).

## §lessons — why live-service hubs hold attention

Studied archetypes (Warframe's orbiter, AFK-class idle hubs, Survivor.io/Archero dailies,
Clash Royale's chest rack, Snap's season home). None are copied; five shared mechanics are:

1. **Something is always mature or visibly maturing.** Timers and hoppers are on the home
   screen, not behind doors (chest slots, foundry, idle chest). Silence is meaningful:
   nothing pulses unless something is genuinely ready.
2. **Claims are one tap from home.** The ripest fruit is the centerpiece, not a directory
   entry. Browsing is optional; harvesting is frictionless.
3. **Ceremonies chain.** A claim ends by pointing at the next glowing thing — the loop is
   ridden, not re-derived by the player after every stop.
4. **The play button never loses primacy.** The hub feeds the battlefield; every chain
   ends at a deploy.
5. **Readiness ≠ novelty.** "You have X waiting" persists until taken. "New since you
   looked" is a separate, dismissible layer.

## §audit — what Assimilate already has, and the one structural gap

Already built (do not rebuild): the five-loop registry + machine-enforced no-dead-end laws
(`core/rewardLoops.ts`); loop rotation + the ranked next-action engine
(`state/recommendations.ts`, `state/loopFlow.ts`); post-claim `NextUp` handoffs on the
Vault / Harvest / Quest Board / Season Pass; the Harvest arrival ceremony; the widget-
registry home board (`ui/homeModel.ts`); per-door badges + reason tooltips + teasers; the
reward-toast bus.

**The structural gap (lesson 5 violated): every attention surface is watermark-gated.**
`notifications.badges()/reasons()` count UNSEEN things, and `Hub.go` calls `markSeen` on
every visit — so a player who OPENS the Quest Board, gets distracted, and leaves without
claiming sees the badge, the door tooltip, the landing row, and the Recommended-Now entry
all go dark. The hub then actively hides earned-but-unclaimed value: the exact "forgot
what they earned" failure the brief targets. The unseen layer is right for novelty
("new codex entries"); it is wrong as the ONLY lane for actionables.

## §model — the Ready Chain

One derived, live queue of everything the player can HARVEST right now:

- `notifications.live(save)` — new read API: per-channel live counts + reason lines with
  **no watermark** (the sources' `count()` is already the live truth).
- `readyChain(save)` (`state/readyChain.ts`) — the channels whose recommendation class is
  `claim` or `open` (quests, season, expeditions, harvest, vault — the CHANNEL_CLASS
  vocabulary, so a future claim surface joins by registering a notification source, same
  as today), ordered by the same urgency scores, each node `{nav, label, why, loop}`.
- The chain is **presentation-pure** (derived per render like recommendations; nothing
  saved, nothing simulated) and **never includes spends/browsing** — it is "collect what
  you've earned", not "go shopping"; the Recommended-Now strip keeps covering the rest.

### Chain UX rules
- **Ride, don't hunt:** every chain surface shows the count and the next stop; one tap
  moves along it. The chain ends at the deploy CTA (lesson 4) — the last handoff is play.
- **No new modals.** The Harvest arrival stays the single entry ceremony; the chain lives
  in persistent surfaces (centerpiece, doors, ribbons) that never block.
- **Readiness pulses, novelty badges.** A door with a chain node breathes (slow glow);
  the numeric badge stays the unseen count. Both can be present; either can be alone.

## §surfaces

1. **Command Center centerpiece** — the `recommend` widget leads with the chain when it
   has nodes: "◈ READY CHAIN — N stops", the stops as one-tap rows, then the regular
   rotated recommendations below (spends/unlocks/play).
2. **Hub doors + landing rows** — `is-ready` pulse class whenever a member screen hosts a
   chain node (independent of the unseen badge). Landing "needs attention" rows show the
   live line for chain navs even when seen.
3. **Chain-aware `NextUp`** — the existing handoff component reads the chain first: while
   stops remain it says "Next stop: X — N more after that"; when the chain is empty it
   falls back to the rotated recommendation (today's behavior), and its final fallback is
   the deploy. Claim surfaces keep rendering it exactly where they do today.
4. **Motion vocabulary** — `.is-ready` breathing glow (opacity/shadow only — no layout
   shift), claim-row shimmer on the centerpiece, all gated by `prefers-reduced-motion`
   and the existing motion tokens. Quiet hub ⇒ zero animation (lesson 1's silence).

## §consolidation — navigation reduced by flow, not deletion

Every hub screen is contract-bound (unlock-gate defs, navModel groups + portrait tabs,
mobilecheck's registry-derived coverage, reward-loop nav vocabulary, mechanics/help rows,
HudTour anchors). Deleting/merging screens re-litigates those contracts for marginal win,
and the compressed-rail batch already collapsed the shell to 7 doors. The redesign instead
removes the *hunting*: the chain makes every claim one tap from home and each claim hands
to the next, so the practical navigation per visit drops even though the screen census is
unchanged. (Recorded decision; revisit only with evidence a specific page pair still
causes real back-and-forth.)

## §back — Back and Escape walk the game, never out of it (2026-11)

`src/ui/browserBack.ts` — the browser/Android Back button and Escape share one model:

| Where | Back | Escape |
|---|---|---|
| A layer is open (any `<Popup>` or a modal calling `useDismiss`) | closes the TOPMOST layer | same |
| Another modal on screen (a ceremony, What's New, the HUD tour, the replay theater) | held — the hub never moves underneath | ignored by the hub (the modal owns it) |
| Hub screen / landing | the Hub's `goBack` (same walk as the ScreenHeader ‹ and edge swipe-back) | same (never from inside a text field) |
| Hub root (Home, empty history) | the browser's own Back (previous page / close the PWA) | nothing |
| Live run (the tutorial included) | opens the **Pause sheet** — never exits (`runBus.pause` → GameView) | the run's own hotkeys |
| Deploy / Results / roulette / arena match | held | — |

**Mechanism:** ONE guard history entry with the SAME URL sits above the app's entry while Back
has an in-game meaning (`wantsGuard`); Back consumes it → `popstate` → act (`backStep`) →
re-arm. Same URL ⇒ `?replay`/`?daily`/`?checkout`/`?session_id` deep links, the PWA
`start_url` (/play) and the marketing site at the domain root are untouched; a stale guard at
the root is consumed so Back never dead-ends (a URL cleanup made on the guard — ?replay stripped
on theater exit — is carried onto the entry it lands on). A `beforeunload` "leave site?" prompt is armed
only while a run is live. **Popups:** `<Popup onClose>` wires Escape + a backdrop tap; without
`onClose`, Escape is the keyboard twin of a backdrop tap (it clicks the overlay), so every
existing popup whose backdrop dismisses closes for free. × buttons answer a 44px hit area.
Pure decisions are pinned in `browserBack.test.ts`; the live walk (hub ← landing ← screen →
leave, run → pause, item details/gene card Escape + Back, deep-link query kept, no hub
prompt) was verified in headless Chromium.

## §validation

- Unit: chain derivation (live vs unseen — a seen-but-unclaimed quest STAYS in the chain),
  ordering, loop tags, the REVEAL GATE (below), chain-aware NextUp fallbacks.
- Headless usability pass: developed profile with ≥3 ready surfaces → enter hub, assert
  the centerpiece lists them, ride the chain node→node via the UI only, assert each stop
  renders its claim surface and the ribbon count decrements, ending at the deploy CTA.
- mobilecheck (all viewports) + uiStandards + reduced-motion audit on the new classes.

### Pass-2 results (multi-stop ride, measured headlessly)

Seeded stops: Season (14 unclaimed tiers) + Harvest (ripe) + Vault (3 containers + sealed
cache). Entered once from the centerpiece, then rode **NextUp only** — home never revisited:

| Metric | Result |
|---|---|
| Path | Season → Quests → Vault → Quests → Harvest → Quests → Season → *(empty)* |
| Stops cleared / rewards | 7 surfaces · ~20 rewards (level-ups, cosmetics, achievements riding along) |
| Total taps | **17** (10 were claim clicks; 1 tap per hop; 0 home returns) |
| Cross-feeding | The chain GREW mid-ride (pass claims completed quest missions; quest claims earned pass XP) and **converged** — the loops' no-dead-end law, visible |
| Exit | Chain empty ⇒ NextUp switched to rotated recommendations (UPGRADE: "6 tower Stars affordable") — the harvest hands to the upgrade loop, then play |
| End state | Zero chain rows, zero breathing doors |
| Fresh account | No chain block, no chain pulses anywhere (silence held) |

### Pass-3 results (the PORTRAIT ride, 390×844)

Same seed through the phone shell: only the Rewards tab breathed; its index rows carried
the live chain lines + pulse; the ride (index row → claims → NextUp hops) cleared
Season → Vault → Quests → Season(cross-fed) in **7 claims / 11 taps**, converged, and no
tab breathed afterward. The NextUp exit again handed to the upgrade loop.

### The reveal gate (pass-2 fix)

A source can ripen before its wing unlocks (the Hive ripens before the Harvest screen
reveals) — an ungated stop would ride into the sealed-feature briefing, a dead end.
`readyChain` therefore filters stops by `featureRevealed(save, nav)`; progression gating
owns the reveal, the chain waits (pinned in readyChain.test). Note: `.is-ready` is a
game-wide CSS modifier other components already use (cache card, harvest collect…) — the
chain's selectors stay compound-scoped (`.hub-door.is-ready` etc.), never bare.
