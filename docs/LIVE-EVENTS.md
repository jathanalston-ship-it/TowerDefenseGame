# LIVE-EVENTS.md — the foundational Live Event framework

> **The transformation layer.** `core/liveops.ts` remains the multiplier CALENDAR;
> `core/liveEvents.ts` is the rotating IDENTITY engine: three independent horizons, each
> carrying a full modular package, so the whole Hive visibly reacts to what is live.
> A future event = ONE registry row (`LIVE_EVENTS_V2`) — no architectural work, ever.
> Validation: `npm run sim:events` (3 years walked) + `core/liveEvents.test.ts` (build gate).

## 1. Rotation — three simultaneous horizons

| Horizon | Duration | Ring | Cycle |
|---|---|---|---|
| SHORT (Surge) | 3 days | 3 events | 9 days |
| MEDIUM (Season) | 14 days | 3 events | 6 weeks |
| MAJOR (Epoch) | 91 days | 2 events | ~6 months |

All windows derive from the shared Monday epoch (`BP.epochMs`) — the same math as the
Battle Pass/weekly rings, deterministic worldwide, wrapping forever. `activeLiveEvents(now)`
always returns exactly three (major-first); `themeOwner(now)` names the ONE identity that
dresses the hub (major > medium > short) while the others surface as chips — the
readability contract, validated for every rotation alignment (accent-distinct triples).

## 2. The package vocabulary (every field optional ⇒ modular)

`LiveEventDefV2`: name/tagline/horizon/priority · **theme** (accent/glow/bg/logo) ·
**visuals** (bgEffect, hubMutation CSS token, loadingLine, menuTransition, rewardVfx,
notificationStyle) · **audio** (SeasonDef.music re-voicing + playlist + stinger) ·
**mods** (LiveEventMods — reward lanes through the EXISTING liveops fold) · **currency**
(window-scoped tokens, hard cap) · **track** (milestones over tokens, PassReward[] — the
one grant language) · **challenges** (quest `MissionCond` + targets — the one judge) ·
**gameplayModifiers** (DAILY MODIFIER ids — the proven sim-safe boot-time seam; the
deterministic core is never branched mid-run) · **variants** (renderer tint/title overlays,
never sim stats) · **shop** (token sinks, finite stock) · questSet/collections/
achievements/lore · **unlockReq** · **future** (namespaced hook bag).

Composing existing vocabularies is the whole trick: rewards, challenges, gameplay and
reward-lane boosts all reuse contracts the game already enforces, so an event touches
gameplay + rewards + currencies + UI + music + hub + enemies + notifications + ceremonies
+ shop + quests + collections through seams that already exist.

## 3. Anti-inflation (validated, forever)

1. Tokens are **window-scoped** (`eventId:window` keys) — stale keys prune on load;
   use-it-or-lose-it, with the ending-soon notification as the warning.
2. **Wallet caps** per currency; track milestones must be reachable from challenge totals.
3. **Per-day mint budgets** decrease with duration (short 220 > medium 180 > major 120
   core-eq/day) so a surge never out-pays an epoch pro-rata; `windowMintBudget()` prices
   track+shop in coarse core-equivalents and the validator caps every window.
4. The 3-year sim proves yearly mint is FLAT within 5% (identical windows ⇒ supply linear
   in time, never compounding) and averages 236 core-eq/day against a 520 ceiling.

## 4. Integration seams (the consumer map)

| Package | Consumer seam | Status |
|---|---|---|
| mods | `liveopsMods()` fold (finishRun lanes) | ✅ wired — `liveEventLaneModsNow()` multiplies in at meta's two fold sites (test-neutral, the liveops FIXED_TEST_NOW convention) |
| theme/visuals/hubMutation | hub root `data-event` + `--event-*` vars via `applyWardrobeDressing` (re-dressed when the trio flips); `loadingLine` on the DeployScreen | ✅ wired |
| audio.music | the SeasonDef.music re-voicing seam — the owner's transform composes with equipped Wardrobe packs (shifts add, tempo multiplies, brightness averages) | ✅ wired |
| currency/track/challenges/shop | save module `liveEvents` (v50) + meta claim actions + applyRewardList | ✅ wired (2026-07-18) |
| gameplayModifiers | the daily `modifierIds` boot path (App → GameView options) | next batch (opt-in toggle) |
| variants | renderer tint/name overlay seam | declared; renderer wiring future |
| notifications | `registerNotification` — `event.claimable` + `event.endingSoon` on channel `home` (the console's address; the Ready Chain reads the live() lane) | ✅ wired |
| collections/achievements/lore | codex + achievements registries | declared; rows land with UI batch |

The framework is COMPLETE and wired end-to-end at the meta/UI layer (2026-07-18): the
Command Center's `LiveEventsPanel` is the banner + claim console (challenges → track →
shop). Remaining seams (gameplayModifiers opt-in toggle, renderer variants/ceremonies,
codex/achievement rows) attach to declared packages without touching the registry — that
is the "no architectural changes" guarantee.

## 5. Authored launch calendar

SHORT: Ember Tide 🜂 (heat/loot) · Spore Bloom ❁ (growth/essence) · Static Night ⌁
(signal/mega-ichor). MEDIUM: The Great Hunt ◎ (bounties/rush) · Deep Current ≋
(depth/infinite) · Red Famine ✕ (scarcity/materials). MAJOR: Epoch of Assimilation ◈
(memory/purple) · Epoch of Overgrowth ⬢ (growth/green). Every event ships theme, visuals,
audio re-voicing, lane boost, currency, challenges, track, gameplay modifier, variants and
lore; mediums/majors add shops.

## 6. Event economies & limited reward tracks (2026-07)

**Currencies** — each event's `currency` is its thematic token (Ember Spores 🜂, Bloom
Pollen ❁, Static Charge ⌁, Hunt Marks ◎, Current Shells ≋, Famine Tithes ✕, Epoch
Strands ◈, Growth Rings ⬢), earned ONLY from that event's challenges, wallet-capped, and
window-scoped: `eventId:window` keys mean the currency literally stops existing when the
event rotates (stale keys prune on load — the disappearance IS the anti-inflation).

**Tracks** — `eventTrack(def)` builds the miniature battle pass: authored milestones are
the SPINE (signature rewards at their thresholds) and deterministic consumable filler
completes the ladder to `TRACK_LEVELS` (short 5 · medium 10 · major 18 — length scales
with duration, and per-window mint budgets make longer events strictly richer). Every
level pays, every level is reachable from the challenge pool, all validated.

**Repeats** — tracks pay through meta `applyRewardList`, so permanent kinds (cosmetics,
passives, phenotypes) substitute into the compensation bundle when already owned: no
duplicate permanent unlock is possible, ever, by construction. Generated filler is
consumable-only (test-pinned), so a veteran's repeat window retains ≥70% of fresh value
(permanent-unlock share capped at 30% of track rewards, sim-enforced).

**Persona validation** (`npm run sim:events`) — completion rates new-player 0.45 /
f2p-regular 0.70 / veteran 0.85 / whale 1.00 of each pool: new players reach ≥40% of every
track, the full pool completes each track exactly (no dead tail, no overshoot — tokens are
engagement-only, unpurchasable, so whales cannot skip), and repeat value holds. Long-term
engagement is the only lever that moves an event track.

## 6b. Event Exchange Shops (§shops, v52, 2026-07)

**Storefront identity** — every event's shop is a THEMED counter, not a menu: `storefront`
{name, keeper, blurb} (The Slag Exchange, The Pollen Bazaar, The Dead Channel, The Trophy
Row, The Silt Market, The Ration Board, The Memory Vault, The Seedhouse). Names must be
distinct across every co-active triple of the rotation super-cycle (validator law, like
accents/ceremonies). A future event ships a complete storefront purely in data — zero
engineering.

**Purchase limits** — `EventShopRow.limit`: `window` (default — stock for the whole
window), `daily` / `weekly` (restocking), `lifetime` (once EVER, across every return of the
event). The limit lives in the LEDGER KEY shape: window rows count under plain `rowId`,
daily/weekly under composite `rowId@isoDay` / `rowId@W<week>` (window pruning retires them
for free), lifetime under `liveEvents.lifetimeBought[eventId:rowId]` — the ONE ledger the
sanitizer never prunes, so a retired event's signature stays sold when it returns.
`shopRowView(a,row,ledgers,now)` (core) is the single arbiter of bought/left/soldOut/
restocks/affordable — plus `almost` (banked ≥70% of the price), the UI's "one more thing"
hook. `meta.buyEventShopRow` enforces it (guard `event.buy`), pays through
`applyRewardList` (owned permanents substitute), and routes a `bpXp` rider through
`grantPassXp('event-shop')` post-persist with a receipt line + toast (bpXp is not a
PassReward kind). Signature purchases toast under the storefront's name and fire the
wardrobe unlock ceremony via the normal reward bus.

**Balancing laws (machine-enforced)** — `liveEventProblems()`: every shop ≥4 rows +
storefront required; window clear-cost ≥1.3× the earnable pool (no persona clears a shop
in one window — "significant investment" means MORE WINDOWS, tokens are unpurchasable);
cheapest row ≤0.35× the pool (new players always buy something); lifetime rows contain
permanent kinds only; the per-window mint budget counts restocked limit rows AND bpXp
riders (×0.5 core-eq). `npm run sim:eventshops` walks greedy personas day-by-day: whales
still end wanting, F2P regulars afford ≥2 buys, new players ≥1, repeat windows (signatures
owned) absorb ≥70% of a veteran's income and the non-lifetime inventory alone out-costs a
full pool — no event is ever worthless on return. Hook coverage ≥20% of persona-windows
end ≥50% banked toward the next purchase.

## 7. Gameplay mutations & reward ceremonies (2026-07)

**Gameplay** — every event carries an `EventGameplayPackage` beside its daily-modifier ids:
hero/tower buffs (named, ride the boot-time `runEffects` seam), unique hazards and pickups
(declared ids for the renderer/engine seams), temporary Mega Bosses (the daily plan's
`megaBoss` vocabulary), event-only containers, and a battlefield `biomeTint`. All axes are
boot-time and declarative — the deterministic sim is never branched mid-run.

**Ceremonies** — `CEREMONIES` is the machine registry: mutation-chamber, dna-sequencer,
organic-slots, incubation-pod, hive-excavation, evolution-chamber, bio-reactor,
living-wheel. Each carries its own pacing (`paceMs` 300–1400), anticipation (charge/crank/
heartbeat/dig/sequence/pressure), reveal style (burst/hatch/unearth/printout/spin-stop/
boil-over) and sound-set family — contracts the ceremony renderer implements PER machine,
not reskins. Every event names one; a new validator law guarantees co-active triples never
share a ceremony (checked across the full rotation super-cycle, like accents), so the
presentation IS the event's signature. Assignments: Ember Tide→bio-reactor, Spore Bloom→
incubation-pod, Static Night→dna-sequencer, Great Hunt→hive-excavation, Deep Current→
organic-slots, Red Famine→mutation-chamber, Epoch of Assimilation→evolution-chamber,
Epoch of Overgrowth→living-wheel.

**Hub mutation** — the visuals package already carries hubMutation/bgEffect/menuTransition/
notificationStyle per event; §4's `data-event` seam applies them at the hub root, and the
gameplay package's biomeTint extends the identity onto the battlefield. The renderer batch
implements the machines and ambience; the contracts (and their recognition laws) are final.

## 8. Live operations platform (2026-07)

**Architecture** — the deterministic calendar IS the baseline service: standard rotations
ship in data and need no server, ever (the "no client update" guarantee, absolute).
`core/eventOps.ts` layers the REMOTE contract on top: a single `EventOpsConfig` JSON
document (served by the accounts backend's config channel — same origin as save sync,
cached client-side, `rev`-monotonic) that `resolveEvents(now, config, debug)` applies over
`activeLiveEvents`. Absent/offline/invalid config ⇒ the pure calendar unchanged.

**Scheduler** — `schedule[]` entries place any registry event into its horizon slot for an
exact UTC window (future scheduling, holidays, anniversaries, crossovers, manual
activation); recurrence is the rings themselves; `kill[]` is the emergency shutdown (the
ring's next member fills the slot — a horizon can never go dark, and the publish gate
rejects a document that would empty a ring); `preview[]` gates events to ?debug clients
(developer previews / testing events); `tuning{}` is the hotfix lane — track/token/shop/
mods scales, hard-clamped to safe bands (0.5–1.5×) so no config typo can inflate the
economy past the validated budgets. `eventOpsProblems()` is the publish gate: the ops
dashboard runs the SAME validator the client trusts.

**Remote-adjustable** — reward values (trackScale), currencies (tokenScale), duration
(schedule windows), drop-lane boosts (modsScale), store inventory (shopStockDelta),
challenges/music/visual packages (registry data — a scheduled placement swaps the whole
identity package). Structural changes beyond the clamps ship as data updates by design:
the clamps ARE the no-3am-disaster guarantee.

**Analytics & reports** — event participation rides the existing analytics platform
(AN_EVENTS rows with the event id as a bounded dim); `EventWindowReport` is the post-event
report contract (participation, completion %, claims, tokens minted/expired, realized
core-eq vs budget, D1 retention, satisfaction + difficulty proxies, average depth) filed
per `eventId:window` by the functions/ report job after each window closes.

**Future categories** — holiday/crossover/anniversary events are ordinary registry rows
placed by the scheduler; community challenges, global boss fights, faction wars and
limited PvP seasons ship through the namespaced `future` bags (config + event def) that
old clients ignore — new categories are data + one consumer, never a redesign.
