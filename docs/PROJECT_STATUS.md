# PROJECT_STATUS.md — the live state board

> Maintained at the END of every session (paired with `docs/AI_HANDOFF.md` — the constitution's
> workflow step 4). This is the "where are we?" answer; `docs/GAME-STATE.md` remains the deeper
> per-system built-vs-planned index, `docs/PROJECT_MANIFEST.md` the system map.
> **Last updated:** 2026-07-18u (**ICON LANGUAGE — the universal visual language** (user
> brief: icon-first UX overhaul; "text is confirmation, visuals are communication").
> NEW `src/ui/iconLanguage.tsx` federates every identity axis the game already carried
> (EFFECT_CATEGORIES glyph/color, CURRENCIES silhouettes, REWARD_TYPES art, statusRegistry
> colors, nav/FEATURES glyphs, --r-* rarity tokens) and adds the missing one: **ACTIONS** —
> 19 verbs/states (claim ✹ collect ⤓ open ◉ upgrade ⇧ equip ⛨ merge ⧓ replace ⇄ spend ◆
> play ▶ accept ✔ cancel ✕ recommended ⚡ locked 🔒 new ✧ completed ✓ unavailable ⊘ ready ◈
> browse ⌕ unlock 🔓), codifying the precedents the UI already spoke. STATUS_GLYPHS gives
> all 16 statuses player glyphs (slow ⇣ / haste ⇡ direction pair). **THE INHERITANCE
> CONTRACT: dev/iconLanguage.test.ts** — a new currency/reward/status/screen without a face
> fails CI (it caught 'haste' on its first run); glyphs unique per axis; action colors must
> be tokens. `<Ico>` primitive + `.act-<verb>` button classes (CSS mirrors the table; never
> double a glyph the text already carries; label never dropped — a11y). SPOKEN TODAY: verb
> icons on every major primary CTA (quest/directive/pass/event claims, harvest collect,
> vault opens ×5, tower Mutate, gene Upgrade, hero-gear Equip); draft-card keywords carry
> their category glyph inline (FxLine chokepoint); Tower Lab stat chips (▲ DPS ◎ RANGE
> ≫ CADENCE ⟁ POWER); landing attention rows lead with the target screen's glyph; rec kind
> chips lead with the verb glyph. docs/ICON-LANGUAGE.md is the permanent standard
> (+ UI-STANDARDS §5 pointer). Verified: suite 2518 green (301 files, +iconLanguage
> drift test), typecheck 0, build, mobilecheck CLEAN, validate PASS, live screenshots
> (Tower Lab + Mission Hub landing). Deferred honestly (doc §6): long-tail secondary
> buttons adopt act-* as screens are touched; shared 3-tier tooltip primitive is future
> ui-kit work. Previous below.)
>
> **2026-07-18t** (**RECOMMENDED-DECISIONS PROMINENCE PASS** (queue #350):
> the ranked next-step is now the FIRST EYE-CATCH on every screen that surfaces one.
> `.bbs` (Best-Value strip — EvolutionHQ/TowerLab/HeroLab/GeneArchive) redesigned from a
> quiet one-liner into a gold-washed banner: left accent bar, pill kicker, 13px pick,
> breathing edge (`bbs-breathe`, `--breathe-c` parameterized). GeneArchive's strip moved
> ABOVE the completion bar (first read under the title). Hub landings + Command Center:
> the TOP `.hubl-rec` row (full-size strips only, never compact NextUp) gets the hero
> treatment — hub-accent wash, 3px left bar, 14px label, lit arrow, same breathing edge —
> so the eye lands on "do this next" before the grid. MulliganLab reco tiles + the CC
> ready chain already had prominence (left as-is). CSS-led, zero logic; verified live
> (Mission Hub landing + Tower Lab + Gene Archive screenshots), mobilecheck CLEAN,
> uiStandards green, validate PASS. Queue is now EMPTY — #350/#351/#352 all shipped.
> Previous below.)
>
> **2026-07-18s** (**WEBSITE DEPLOY FIXED + THE PRODUCTION-VERIFY CONTRACT**
> (queue #352, user brief: "update the website. make sure it's actually updated … implement
> something that ensures that never happens again"). ROOT CAUSE found and fixed: wrangler's
> `--production-branch` flag only applies on FIRST-ever project creation — the Pages project
> `assimilate` was born under an earlier branch, so every deploy from zen-hawking landed as
> a hash-URL **preview** while https://assimilate-69x.pages.dev kept serving the frozen old
> build, with CI green the whole time. deploy.yml now (1) PATCHes the project's
> `production_branch` to the deploying branch on EVERY run, (2) stamps `dist/version.json`
> with GITHUB_SHA, (3) post-deploy resolves the canonical production host from the API and
> polls `/version.json` until it serves that exact SHA — mismatch after 5 min exits 1, so
> **a deploy that doesn't change production can never be green again** (the never-again
> guard). PROVEN LIVE on run #201 (b32121c): poll 1 hit 404 (the stale build had no
> version.json — the incident caught in the act), poll 2 `Verified: assimilate-69x.pages.dev
> serves b32121c…`. Production now carries the full current build: auction house (mulligan
> organs + overhaul), Landscape Mandate, Live Events, The Front, regenerated marketing pages
> + v2026.07.09 patch notes. Human check: `GET /version.json` on production =
> pushed SHA (DEPLOYMENT.md §5 + checklist row). Queue next: #350 recommendations
> prominence. Previous below.)
>
> **2026-07-18r** (**AUCTION HOUSE — MULLIGAN ORGANS + FULL AUDIT + VISUAL
> OVERHAUL** (queue #351, user brief: "add mulligan organs into the auction house … make
> sure the auction house is fully functional and integrated … do a visual overhaul").
> **mulliganPiece is the FOURTH tradable category**, landed by the AUCTION-HOUSE §10
> checklist: `mul:<pieceId>` trades the DEX UNLOCK (`save.mulliganDex`); families
> `mul.<piece>.<rarity>` per SEQUENCED rarity (equipment precedent); baseline + buyback
> bands common/uncommon only (epic+ player-exclusive). Custody law: grafted ⇒ `slotted`
> block (unslot first), reforge-LOCKED host ⇒ `bound` (permanent), escrow-out deletes the
> dex entry server-first, delivery sequences an unowned piece at the listing rarity or
> **dissolves an owned one to Tissue via `DUP_TISSUE`** (now exported from core/mulligan —
> the pillar's own duplicate law, shared with container opens). Server needed only two
> authority-grant lines (shared-catalog inheritance proven); `listItem` gates on client
> blocks BEFORE the wire since the server can't see slot state. Pinned by NEW
> `src/state/auctionCustody.test.ts` (8 custody tests) + a byte-intact wire round-trip in
> functions/auction.test.ts (22/22). VISUAL OVERHAUL of ui/AuctionHouse.tsx + the `ah-`
> CSS block: mastheaded exchange floor (kicker/display title/membrane wallet with market
> balance as hero), segmented pill tabs, `--rc` rarity-washed specimen cards with category
> glyphs ⌬ ⛨ ❖ ⊛ + `⚕ stock` chip, tinted sheets with area-filled sparkline, boxed
> My-Market sections, breathing hot banner; `ascendant` joins RARITY_TINT (--r-mythic).
> Verified: suite 2512 green (300 files), typecheck 0, build, **sim-market 10/10
> healthy**, **mobilecheck CLEAN**, uiStandards green, live screenshots desktop+844×390.
> Docs: AUCTION-HOUSE/TRADING-PREP/GAME-STATE + DIL edge (`system:mulligans extends
> system:online-foundation`) + stale provenance note fixed. Queue next: **#352 website
> deploy-verify with the permanent production-URL guard** (user: "make sure it's actually
> updated … implement something that ensures that never happens again"), then #350
> recommendations prominence. Previous below.)
>
> **2026-07-18q** (**THE LANDSCAPE MANDATE** (user brief: "the entire
> vertical mobile layout … standardized for horizontal play ONLY … upgrade interfaces are
> far too intensive") — RESPONSIVE-DESIGN.md §0b. Phones play horizontal only:
> `RotateGate.tsx` full-screen hold on touch+portrait (phones AND portrait tablets;
> live-event tinted; z 100000; clears the frame the device rotates via useLayoutProfile —
> never raw width); touch+landscape IS the phone game (☰ drawer shell + stacked run — the
> `.game` bands now fire on `(max-width:900px),(max-height:520px)` so 926×428-class phones
> stack instead of getting the crushed desktop grid, the one real layout fix the flip
> surfaced); mouse windows never gated (desktop untouched). **mobilecheck v3**: gate
> viewports desktop-1366 · landscape-844×390 · landscape-926×428 · tablet-land-1024×768 ·
> portrait-390×844(gate) · tablet-768×1024(gate); door→landing→card walk through the
> drawer; landscape run contract (≥44px ▶ Start Wave on-screen, board ≥40% height, tray);
> tutorial walk moved to 844×390 (passes); rotate-gate coverage + gate-leak-absence
> asserted; v2 portrait tab-shell walk retired (MobileShell legacy, mouse-narrow only).
> Platform split: browser=gate, store app shell locks orientation natively (no change
> needed there). CLEAN first full pass; suite 2503 green; validate PASS. Queue: Auction
> House brief (#351) then website deploy-verify (#352 — CI deploys are landing as PREVIEW
> URLs, production branch pin needed) then recommendations prominence (#350). Previous below.)
>
> **2026-07-18p** (**LIVE EVENTS WIRED END-TO-END** (queue #347) — the
> identity engine's consumer batch, docs/LIVE-EVENTS.md §4 seam map now ✅ across the
> meta/UI layer. Save **v50** (`liveEvents` {tokens, claimed, shopBought, progress},
> `eventId:window` keys; sanitizer prunes dead windows + clamps cap/target/stock — the
> twin's 18o note honored: v49 stayed The Front's). `creditQuests` front-runs
> `creditEventChallenges` ⇒ all five judged credit seams pay event tokens for free
> (target-cross banks tokens, wallet-capped, toasts `eventTokens` ✦). `claimEventMilestone`
> (THRESHOLD claim — tokens are the ladder, never spent) + `buyEventShopRow` (the finite
> -stock sink), both via applyRewardList (repeat-safe) and guarded (`event.claim`/
> `event.buy`). Lane fold: `liveEventLaneModsNow()` × liveopsMods at both meta sites —
> NEUTRAL under tests (the liveops FIXED_TEST_NOW convention; the trio is ALWAYS live, no
> lane-quiet date exists — pinned by test). Hub dress: `applyWardrobeDressing` sets
> `data-event` + `--event-*` vars and composes the owner's menu-music re-voicing with
> Wardrobe packs; Hub re-dresses when the trio key flips. UI: **LiveEventsPanel** — the
> Command Center's first read (owner headline + sibling chips + "N TO CLAIM") unfolding
> into the claim console (challenges → track → shop, per-event accents); DeployScreen
> `loadingLine`; `event.claimable`/`event.endingSoon` on channel `home` (CHANNEL_CLASS
> claim 87 → Ready Chain). Verified: suite 2503 green (liveEventsMeta.test 10/10),
> mobilecheck CLEAN, live headless probe (real trio renders: Epoch of Assimilation ◈
> owner + Great Hunt ◎ + Spore Bloom ❁; 18/10/5 track cells; hub tinted purple).
> GAME-STATE gained the ✅ BUILT compressed summary. Remaining declared-not-wired:
> gameplayModifiers opt-in toggle, renderer ceremonies/variants, codex/achievement rows.
> Previous below.)
>
> **2026-07-18o** (**THE FRONT — Infestation map war overhaul** (user brief:
> "flat and irrelevant… taking up a lot of space and clutter for not much") —
> docs/INFESTATION.md §front, save **v49** (`infestation.tierClaims/tributeWeeks/defenses/
> lastIncursionDay` — additive; NOTE for the live-events consumer batch: v49 is now TAKEN,
> event tokens land as v50). The map pays, attacks back, and deploys: one-time TIER SPOILS
> per sector (high-watermark ledger — never re-pays; region-themed localized wallets via
> applyRewardList, new PassReward kind `hiveMats`; Saturated adds a rare container), weekly
> REGIONAL TRIBUTE (ISO-week watermark × held tiers/16, min 2), daily HOTSPOT (feeds ×1.5),
> daily INCURSION (win a run that feeds it to defend; undefended bites −12 on LAZY BOUNDED
> resolution — ≤ ONE bite per return), DEPLOY (session warp → RunOptions.sectorWarp at the
> one director fold; absent ⇒ byte-identical; dailies/tutorial/Arena excluded), entrenchment
> +1 expedition slot (capped). Screen: PLAY hub (stage-8 reveal — the timeline's one open
> beat), Command Center collapsed to the one-line FrontStrip (the clutter fix), front.war
> notifications. SATURATED_AT=99.5 (exact-100 transiently unreachable under lazy decay).
> Laws: `npm run sim:front` — spoils ≤15k core-eq (14,720), tribute ≤15% weekly income
> (14.3%), no-death-spiral, rotation, hazard↔payoff pairing. front.test.ts 12/12; suite
> 2493 green; validate PASS; live smoke 14/14 (strip, reveal, claim +130 Chitin, deploy
> pin). Cross-batch: `front_claims` classified 'claim' in the frequency instrument;
> PIL report regen'd. Previous below.)
>
> **2026-07-18n** (**EVENT ECONOMIES & LIMITED REWARD TRACKS** (user brief) —
> LIVE-EVENTS.md §6. Every event now carries a full temporary ecosystem: thematic
> window-scoped currencies (exist ONLY while live; stale keys prune = the anti-inflation),
> `eventTrack()` miniature battle passes — authored SPINE + deterministic consumable filler
> to duration-scaled ladders (TRACK_LEVELS short 5 · medium 10 · major 18; longer = richer
> under the per-day budgets), every level pays and is reachable (validated). REPEATS:
> tracks pay via applyRewardList so owned permanents substitute into compensation — no
> duplicate unlock possible; filler is consumable-only (test-pinned) ⇒ veteran repeat value
> ≥70%. Persona sims (new 0.45/f2p 0.70/vet 0.85/whale 1.0 pool completion): new players
> reach ≥40% of every track, full pool completes exactly (tokens engagement-only,
> unpurchasable — whales cannot skip). Suite green. Previous below.)
>
> **2026-07-18m** (**LIVE EVENT FRAMEWORK** (user brief) — docs/LIVE-EVENTS.md,
> the foundational rotating-identity engine. `core/liveEvents.ts`: three independent horizons
> from the shared Monday epoch (SHORT 3d ring-of-3 · MEDIUM 14d ring-of-3 · MAJOR 91d
> ring-of-2), ALWAYS simultaneously live; `themeOwner()` (major>medium>short) dresses the hub
> while the others chip — the overlap-readability law, validated accent-distinct across every
> rotation alignment. Every package COMPOSES an existing vocabulary (PassReward tracks,
> MissionCond challenges, daily-modifier gameplay ids = the sim-safe boot seam, LiveEventMods
> lane boosts, SeasonDef.music re-voicing), so a future event is ONE LIVE_EVENTS_V2 row.
> Anti-inflation: window-scoped tokens + wallet caps + per-day mint budgets that DECREASE
> with duration (220/180/120 core-eq), enforced per window. 8 launch events authored with
> full identity packages. `npm run sim:events`: 3 years walked — 3 live/day, accents distinct
> every day, rings even, ownership flips only on epoch bounds, yearly mint flat within 5%.
> Suite 2470 green. NEXT: the consumer wiring batch (LIVE-EVENTS.md §4 seam map — save v49
> tokens, meta claims, hub data-event theming, notifications, liveopsMods fold). Previous below.)
>
> **2026-07-18l** (**REWARD FREQUENCY ENGINEERING** (user brief) —
> docs/REWARD-FREQUENCY.md, the permanent MACHINE-ENFORCED philosophy: maximize meaningful
> interactions/hour, never by raising values. `core/rewardFrequency.ts`: a 10-verb
> interaction taxonomy TOTAL over REWARD_SOURCES (`SOURCE_VERB` — a new pathway fails the
> build until classified), six personas (playstyle × spend × band; run shapes mirror the
> BP-economy archetypes) walked minute-by-minute with beat rates DERIVED live (real weekly
> quests via missionCredit, the real BP curve, the measured Ready-Chain tap economy), and
> FREQUENCY_BANDS as a suite gate: 25–110/hour, gaps ≤6min, taps/interaction ≤2.4, choices
> 4–60/h, peak ≤10/min, verb spread ≥6. Baseline measured 53.9–64.0/h, taps/i 0.85–0.95.
> The instrument found ONE drought — long-run personas' 7–9min session tails ("what do I
> do now?", measured) — fixed VALUE-NEUTRALLY: the QUICK FINISHER wind-down surfaces the
> already-existing free daily gauntlet entry (`rush.freeEntry` notification + `bossrush`
> 'play' CHANNEL_CLASS at score 34 — recommends exactly when the chain is spent; zero new
> grants, §6 decisions log pins every delta at 0). `npm run sim:frequency` prints the
> diagnostic hour maps. Suite 2463 green. Previous below.)
>
> **2026-07-17k** (**BIO-ROULETTE GAME-WIDE** (user brief: "integrate the
> roulette wheel into as many logical areas as possible") — BOSS-RUSH.md §roulette. The
> wheel graduates from rush-exclusive to the game's SPORE ENGINE via one banked economy:
> `save.bioSpores` (v48; sanitizer floors junk, caps 999). Sources: Boss Rush (App.handleEnd
> banks FIRST, then the ceremony plays the whole bank — carried spores ride along), **+1 for
> the first kill of every boss chassis in ANY mode** (the idempotent `bossesSlain`
> registrar), every quest finale (weeklies +1, main chapters 1/2/3), and Battle Pass
> milestone lanes (free %25 = 4/season, premium %20 = 5/season — pushed ADDITIVELY after the
> filler fallback, nothing displaced). `PassReward` gained the `bioSpores` kind → banked by
> `applyRewardList`, placarded by the `REWARD_TYPES` row (nav "Spin the Bio-Roulette").
> The **Vault Roulette bay** (beside the Daily Bio-Cache) shows the bank, breathes when
> loaded, and fires `rouletteBus.open()` (navBus-co-located) → App opens `min(bank, 40)`
> menu-only and the exit returns TO the Vault; `vault.spores` lights badges + the Ready
> Chain. `grantRouletteRewards` debits the bank by the session spend. Verified: suite 2439
> green (bank cap/consume/clamp, the pass-claim interpreter path, per-season + per-finale
> source coverage, sanitizer, toast mapping), mobilecheck CLEAN, and the wheel's FIRST full
> headless run (seed bank → bay → spin → collect → bank 0 · ledger 12 · bay disarmed) —
> closing the 17i "roulette only mounts post-rush" verification gap. Previous below.)
>
> **2026-07-17j** (**LOCALIZED ECONOMY REDESIGN** — save v48, ECONOMY.md §8:
> the currency registry became the machine-enforced economy contract (`CurrencyDef.domain`
> = the ONE system a wallet upgrades, `'account'` reserved for Genome Cores + Ichor;
> `earnedFrom` ≥2 sources with prestige the sanctioned single-faucet; `currencyProblems()`
> fails the build on name/color/domain collisions — a new currency is ONE row and the icon
> map is compiler-forced). Two localized wallets shipped, every faucet value-SHIFTED never
> added: **Chitin** (`hiveMaterials`) prices Hive-Production organs — guaranteed hopper
> top-slice (`IDLE.hiveMatsShare` 0.3 carved BEFORE the weighted roll, lane pushed last so
> BLOOM rares still lead) + expedition lanes swapped 1:1 out of cores (patrol 15+15,
> harvest 80+30, graveyard 250+90) + the Chitin Lode find; **Mulligan Tissue**
> (`mulliganTissue`) prices tower graft upgrades/ascends — dupe dissolves at the old
> essence numbers, the premium bleed SPLIT EVENLY once Mulligans unlock (the mid-catalog
> faucet), hopper trickle carved from essence 16→13. Migration seeds on ABSENT fields only
> (60+20×Σ organ levels / 25+8×Σ graft levels). Deliberately NOT converted: Ichor reforge,
> Hive-Construction composite recipes, Nucleus/Symbiote organs (flagged future candidates).
> `npm run sim:economy`: organ pace parity 0.75–1.13 across 4 personas × 3 bands, no
> migration stalls, gene-wallet relief ≥95%, tissue ≥1.5 upgrades/week mid. Live smoke:
> seeded 500 Chitin → organ bought at 60 → wallet 440; Lab shows 300 Tissue. Suite 2440
> green, validate PASS. Previous below.)
>
> **2026-07-17i** (**THE REWARD CEREMONY OVERHAUL** (user brief) —
> REWARD-PRESENTATION.md §ceremony/§roulette. Audit: the reward BUS already announces every
> grant (18 meta push points; tiered merge placards) — the silent layer was the WALLET.
> Shipped: **CeremonyLayer** (rides `rewardToast.tap()` — a particle burst at the claim
> point, a currency-icon FLIGHT arcing into its `data-cur` top-bar chip, the chip BUMPS on
> arrival; tier-scaled, fold/concurrency-limited, reduced-motion disables wholesale) +
> **WalletChip** (counters ROLL prev→next and lift gold while gaining) — every current AND
> future bus-announced reward inherits the physical moment with zero wiring. **Bio-Roulette
> signature pass** (presentation-only, model untouched): orifice pre-launch CONTRACTION +
> overshoot eject with a spit cue (spores are spat, not spawned), deceleration-lap PASS-OVER
> blips + rate-limited ticks whose spacing widens as the ease-out slows (the roulette
> tension read), jackpot double-gold SHOCKWAVE, tally rows POP per absorb. Verified: the
> ceremony probe on the live pass-claim path (5 flights · 9 bursts · 5 bumps · cores chip
> rolled 0→149); suite 2434 green; mobilecheck CLEAN. Honest gap: the roulette pass is
> build+review-verified (it only mounts after a real Boss Rush) — flag for live playtest.
> Previous below.)
>
> **2026-07-17h** (**READY CHAIN — USABILITY PASS 2** (user-directed): the
> multi-stop ride, measured. One REAL fix: chain stops now filter by `featureRevealed`
> (a source can ripen before its wing unlocks — the Hive ripens pre-Harvest-reveal — and
> an ungated stop dead-ended on the sealed-feature briefing; pinned in readyChain.test).
> The measured ride (HUB-FLOW.md §validation pass-2): Season(14 tiers)+Harvest+Vault
> seeded → entered once from the centerpiece, then NextUp-only — **7 surfaces, ~20
> rewards, 17 taps, zero home returns**; the chain GREW mid-ride via cross-feeding (pass
> claims completed quest missions, quest claims earned pass XP) and CONVERGED to empty,
> whereupon NextUp handed to the UPGRADE loop ("6 tower Stars affordable") — the reward
> architecture's full cycle, visible in the UI. Fresh-account silence held (no chain
> block, no chain pulses; note: `.is-ready` is a game-wide modifier — chain selectors
> stay compound-scoped). Suite 2434 green. Previous below.)
>
> **2026-07-17g** (**THE HUB READY CHAIN** — the hub-redesign brief's
> momentum layer (docs/HUB-FLOW.md; builds ON the twin's Reward Loop Architecture, never
> beside it). The structural audit finding: EVERY attention surface (badges/reasons/
> recommendations) was seen-watermark-gated and Hub.go marks-seen per visit — a visited-
> but-unclaimed reward went dark hub-wide (the "forgot what I earned" failure). Fix:
> `notifications.live()` (the watermark-FREE truth lane) + `state/readyChain.ts` — every
> live claim/open stop, classified by the now-exported CHANNEL_CLASS vocabulary (a future
> claim surface joins chain+badges+recommendations with ONE registerNotification), urgency-
> ordered, presentation-pure. Surfaces: the Command Center recommend widget leads with
> "◈ READY CHAIN — N STOPS" (one-tap gold rows) above Recommended-Now; hub doors, landing
> cards, portrait tabs + index rows breathe `.is-ready` (readiness pulses, novelty stays
> the numeric badge; reduced-motion → static glow); NextUp hands claims node→node with the
> remaining count before the rotated-recommendation fallback. Consolidation decision
> recorded: navigation reduced by FLOW, screens stay (contract-bound). Verified: 6 chain
> units (incl. the watermark-independence law), headless chain-ride probe (centerpiece →
> vault → back home with the stop still live; landing + portrait pulses), suite 2433
> green, mobilecheck CLEAN. Previous below.)
>
> **2026-07-17f** (**THE GENE-DRAFT EFFECT LANGUAGE** — the in-run draft
> readability overhaul (user brief; CARDS.md §language). `src/core/effectLanguage.ts` is the
> game-wide descriptor system: an 8-band impact scale (Very Slightly → Overwhelmingly,
> configurable thresholds), a 12-category color/glyph palette (Damage deep red ▲ … Tower
> Effects light blue ⌂; glyphs carry the colorblind channel), and a **TOTAL** per-
> RunModifiers-field vocabulary (`FIELD_VOCAB` — a new sim field is a TYPE ERROR until its
> phrasing is authored). `describeCard` folds effects (muls compound, adds sum, flags dedupe)
> and emits digit-free `EffectLine`s — drawbacks phrase as "But …" and sort last; the precise
> numbers live only in the per-line `exact`. The DTO (`CardOption.lines/effects`) is built
> from the LEVELED effects a pick will actually apply (`effectiveGeneEffects` at the seams in
> game.ts). DraftModal rebuilt on it: name → procedural art + subject badge → colored bold
> keywords → meaningful-only synergy chip; exact values behind hover-dwell 550ms / hold Shift
> / long-press 450ms (release-click suppressed) with the live "YOUR GENE STACK" before→after
> + Gene-stack Power diff; keyword bloom reduced-motion-gated; uncommon rarity chrome fixed.
> `CardDef.simple` is the lone hand-text override (unused). Buy-now audit: the auction house
> already ships the optional, ichor-intensive seller buy-now — no change needed. Coverage:
> 16 effectLanguage units (no digits at L0 AND max level for all 111 cards; vocab totality;
> collision guard), headless 2-wave draft probe with screenshots, suite 2388 green, validate
> PASS, mobilecheck CLEAN. Adoption path for older surfaces recorded in CARDS.md §language.
> Previous below.)
>
> **2026-07-17e** (**THE MARKET LIQUIDITY ENGINE** — the Market Authority's
> BUY side (AUCTION-HOUSE.md §5b, user brief executed): the authority may quietly purchase a
> stale, fairly-priced FOUNDATIONAL listing (commons/uncommons + entry-band cosmetics;
> catalog exclusives/neverTrade an absolute veto; `AUTHORITY_ELIGIBLE_OVERRIDES` the
> hand-curated widening hook). Structurally unfarmable: sink-funded budget
> `min(2000, max(40, prevBurns × 0.5))` (injections ≪ burns in every scenario), crypto-rng
> shuffle + 0.55 accept roll (never guaranteed), caps 3/window · 1/family/window ·
> 1/seller/UTC-day + 6h cooldown, valuation corridor ×0.2–×1.05 of the player-only family
> estimate, dupe walls + transfer caps, unreviewed-flag sellers invisible, bid-carrying
> listings untouchable (the sold-gate itself requires `bid IS NULL`). Purchases settle with
> the normal sale discipline (seller paid at live tax; item ABSORBED, never resold; trade
> `authority = 2`), are EXCLUDED from price history + demand metrics (no self-referential
> price support), and fade out on BOTH population and sales velocity (players ARE the
> liquidity). Conservation identity extended with the explicit injection term. Coverage:
> 8 planner units + 4 FakeD1 e2e + sim-market all 10 scenarios green with new gates
> (buybacks ≤ 25% of trade, never flagged personas, never exclusive). Suite 2372 green,
> validate PASS. Previous below.)
>
> **2026-07-17d** (**TWO USER-REPORTED FIXES.** (1) **THE PARASITE-NEST FLOOD,
> ROOT-CAUSED** (BUGFIX-LOG #16 — closes #15's "under watch"): the projectile fire path ticks
> `cooldown -= dt` every tick and resets only `if (acted)`, so a tower that CANNOT act (raid
> lull / STUNNED boss / empty lane) drifts its cooldown to -∞; the renderer's attack-
> anticipation wind-up fed that raw value into a WHOLE-BODY ctx.scale OUTSIDE the 2.2× body
> ceiling (measured on the real towerSystem: 60s no-prey → cd -59.9 → nest ×2,785, needle
> ×12,516 until its first shot — the reported "brief 2-3×" ramp). Fix at the render boundary
> only (sim untouched — goldens + arena lockstep): `attackAnticipation()` (towerForms.ts) is
> [0..1] by construction, pinned in renderer.test.ts; the sim's drift contract is now a DIL
> row. (2) **ONE STANDARD SCREEN WIDTH** (UI-STANDARDS.md §measure): .app's shrink-to-fit
> centering let the whole hub shell resize per screen (store 820 / landings 980 / home fluid);
> `.hub{width:100%}` + `--screen-max` (1120px) + one `.hub-screen > *` rule; per-screen caps
> tokenized; probe: all 27 screens + 6 landings = exactly 1120px @1920. Suite 2311 green,
> validate PASS, mobilecheck CLEAN, live wave probe clean. Previous below.)
>
> **2026-07-17c** (**HUMAN MATCHMAKING ON + THE COMPRESSED RAIL** — two
> user-directed features. (1) The Arena queue hunts HUMANS BY DEFAULT wherever a relay
> resolves; the console's OPPONENTS toggle (HUMANS + AI / AI ONLY, device-local
> `assimilate.humanMM`, read at queue entry only) lets players opt out — but the opt-out
> construct generates at `aiFallbackPower` ×`ARENA.aiOptOutPowerPremium` (1.25) with
> UNCHANGED Elo stakes on a short `aiOnlySearchSec` (3s) beat, while the INVOLUNTARY
> fallback stays ×1 (never punish an empty pool) — ARENA.md §toggle. `arenaRelayUrl()`
> now honors the device-local `assimilate.relayUrl` override before the baked
> `VITE_ARENA_RELAY_URL` (enable PvP on a production build without a rebuild; the relay
> stays a dumb pipe). Verified LIVE headlessly: override + toggle + AI-only queue → match.
> (2) The desktop rail COMPRESSED to front doors only (less visual clutter, user-directed):
> HOME + one `.hub-door` per behavior hub (+ the Store's direct door; `compact` flag
> removed, `headerless` now means "direct door") — per-screen rows/rings/teasers live ONLY
> on the hub landings (whose cards already carry `data-nav`). The three anchor consumers
> moved together: mobilecheck's desktop sweep walks door → landing (audited once per hub)
> → card; HudTour wing stops spotlight `[data-hub]` with a new `nav` reveal-gate field;
> tutorialAnchors guards data-hub. NOTIFICATIONS.md §hubs + RESPONSIVE-DESIGN.md §4d
> updated. Suite 2308 green, validate PASS, mobilecheck CLEAN, rail probe shots clean.
> Standing user-decision flags unchanged (arena `noMega`; server-side sim). Previous below.)
>
> **2026-07-17b** (**THE LIVE-PvP BRIEF: AUDIT + DELTAS** — the brief mapped to
> evidence in ARENA.md §brief-coverage (nearly all landed by the saga + the relay batch; the
> two recorded-decision conflicts — arena `noMega`, "server simulates everything" — are
> FLAGGED for the user, not re-litigated). The genuine deltas shipped: (1) **PRIVATE BOUTS**
> (§private) — friendly, unrated sparring by shared room code over the relay's DIRECT rooms
> (broker fills them with the same `paired` handshake; the gate drops the bracket, keeps
> proto/season/boot/fingerprint; `ArenaMatchSetup.friendly` never settles ⇒ nothing to
> win-trade; Quick Match deliberately unshipped — pool-splitting); (2) **THE SEASON LADDER**
> (§ladder) — `GET /api/arena/ladder` over arena_ratings (migration 0006 adds the sanitized
> display name at report; tags derive from stored player ids) + the Proving Grounds ladder
> tab, fail-soft offline; (3) **THE SWEEP** (§sweep) — `npm run arena:sweep`: bulk AI-vs-AI
> full matches across 6 Power brackets × 4 divisions; the shipped 240-match run is STABLE
> (every match terminated, 100% server-valid claims, sign-correct rating deltas) →
> docs/ARENA_MATCH_REPORT.md. Suite 2307 green (+ private-bout live-socket e2e pairing a
> ×50 power gap by code), validate PASS, mobilecheck CLEAN. Previous below.)
>
> **2026-07-17** (**ARENA RECOGNITION + THE RELAY BRING-UP** — the saga's first
> two follow-ups (Auction House phase 2 explicitly deferred). RECOGNITION (docs/ARENA.md
> §recognition): 11 `arena_*` achievement rows (first match/win · placements · 5-streak ·
> Larval/Chrysalis/Apex watermarks riding `peak` · 25/100 win ladder · Season Crown ·
> Perennial — zero new triggers, settle/claim already evaluate) + the Profile's Proving
> Grounds career fold (division/rating/records/pass/crowns/best season; hidden until first
> arena touch). THE RELAY (docs/ONLINE-FOUNDATION.md §relay): live human-vs-human matches —
> pure `RelayBroker` room server (functions/lib/arenaRelayRoom.ts, `npm run relay`, ws devDep;
> mm:-key pairing → `paired{room,role}`, verbatim forwarding, rooms HELD for reconnect;
> DO-portable, no node imports) + `findArenaOpponent` (net/arenaMatchmaker.ts) racing the 20s
> AI window (hello/loadout/boot → `peerProblem` gate → ready-echo accept; `boot`/`paired`
> joined the ArenaMessage envelope; `RelayTransport.setRoom` re-targets reconnects at the
> match room) + ArenaSession wired into ArenaView (live RTT/quality chip, lifecycle cleanup).
> Suite 2302 green (broker unit + REAL-socket e2e: two RelayTransports pair through a live ws
> server and run a session exchange in CI), validate PASS, mobilecheck CLEAN, and a LIVE
> dual-client headless probe on a relay-baked build: two browsers queued, paired, and fought
> in live ArenaViews naming each other (`⇄ 2ms · excellent`). NEXT (user-queued): the Live-PvP
> brief — mostly landed by the saga; audit + genuine deltas; `noMega` and "server simulates
> everything" conflict with recorded decisions and need the user's call. Previous below.)
>
> **2026-07-16** (**THE ONLINE FOUNDATION SAGA — live PvP architecture, the
> Arena pillar, Auction House backend prep.** Four batches, save **v47**. (1) ONLINE
> FOUNDATION (docs/ONLINE-FOUNDATION.md): the replicated command vocabulary — ONE
> `applyArenaCommand` path onto the Game intents (anti-cheat by construction: commands are
> intents, the deterministic sim rejects forgeries) — under a versioned lockstep wire protocol
> (only commands cross the wire); FRONTIER-BOUNDED mirrors apply commands on exact stamped
> ticks so a live mirror is byte-identical to a command-log replay — rollback and reconnect
> are ONE primitive (`replayRemoteFromLog`), digest beacons SELF-HEAL through resyncReq, and
> the CI netcode battery proves high-latency convergence, lossy-wire healing and
> disconnect→reconnect byte-exact recovery over a seeded loopback network model; the dormant
> `RelayTransport` makes real infra a config value. `PROGRESSION_AUTHORITY` is the policy
> table every future online feature adds one row to. (2) AUCTION HOUSE PREP
> (docs/TRADING-PREP.md — deliberately NO gameplay/UI): `save.provenance` per-item stamps
> (source/time/season/bound/ownership history) with SELF-HEALING load-time coverage;
> eligibility, Ichor fees/taxes/bounds, listing/bid/history types, REAL fraud heuristics,
> the `item_events` D1 ledger. (3) ARENA (docs/ARENA.md): the mirror SIEGE RACE (two sims,
> one seed, `noMega`), 20s Power-bracket matchmaking → seamless procedural AI ACCOUNTS
> (5 personalities, bracket-scaled, same boot validation as humans) playing the real sim
> through commands; Spore→Apex divisions (K96 placements/K32, streaks, 7-day decay, 30-day
> soft resets); wins pay division-banded containers + a Run Cache and are the ONLY fuel for
> the 100-level ARENA PASS (procedurally rotated seasonal tables, HARD Ichor cap by
> construction, premium 200◆, ~145 wins/season) whose level-100 crown alternates the three
> ARENA EXCLUSIVES forever; server settlement (functions/api/arena) runs the SAME shared
> validators exactly-once by matchId; rank pays capped diminishing Idle-Harvest dividends
> (×1 identity ungated); the Proving Grounds screen + ArenaView dual battlefield (the
> opponent's GENUINE live sim mirrored above the membrane; scroll/ease-home camera; §10 HUD).
> (4) THE EXCLUSIVES as full validator-complete content: **Basilisk Maw** (Neural petrifier),
> **Ossuary Choir** (3rd Resonant chord organ), **Chimera** (Viral dive duelist) — 22 towers /
> 11 heroes now. Suite **2275 green**, goldens byte-identical, validate PASS, mobilecheck
> CLEAN, live headless arena probe PASS (9 screenshots reviewed). Previous session below.)
>
> **2026-07-16, earlier** (**REWARD PLACARD FRAMEWORK** — the reward-toast overhaul's
> final form (docs/NOTIFICATIONS.md §reward-toasts/§reward-registry): every reward announces
> through ONE registry-driven placard stack — `state/rewardToast.ts` `REWARD_TYPES` (26 rows;
> **a future reward type is one row**), per-reward miniature reveals (large art · big `+qty` ·
> unit · source · rarity · Power/collection lines), 4s merge window (+100/+250/+75 → one
> pulsing +425 card), tiers t0–t3 (t3 legendary takeover + screen accent + `jackpot` stinger),
> X/click/swipe/Dismiss-All, `toast0/1/2` tier audio, and a bounded hold buffer so run-end
> grants placard on hub return. Pushes live at meta.ts grant seams ONLY (applyRewardList
> returns events; quests/BP/login/directives/wardrobe/expeditions/idle/mastery/tutorial/
> market/exchange/collection-rank wired; achievements via a headless save-diff watcher).
> This SUPERSEDED the same-day parallel-session vocabulary layer (`rewardVocab.ts`,
> receipt-line coalescing — removed in the convergence; its Splice-Market coverage carried
> over as grant-seam placards). Suite 2167 green, validate PASS, live smokes: merged +647
> exchange card, harvest + achievement stack with "+5 more" queue, mobile 390 top band.
> Previous session below.)
>
> **2026-07-14** (**IN-RUN GAMEPLAY FEEL PASS** — combat presentation overhaul,
> canonical doc `docs/COMBAT-VISUAL-STANDARDS.md`: the Status Effect Visualization System
> (mandatory `fx` traits on every StatusEffectDef, validator-enforced; `render/statusFx.ts`
> procedurally MERGES all live statuses per body — blended hue, deduped overlays, budgeted
> emitters, intensity scaling, synergy combos free); hit-confirmation sparks + status-flavored
> deaths (frozen shatter/embers/spores/dissolve); form-keyed tower attack ANTICIPATION
> (`FORM_ANTICIPATION`); hero ability activation/ready cues; log-capped projectile power
> scaling; `statusApplied` → throttled category audio cues. All render-side/data ⇒ goldens
> byte-identical. Suite 2072 green post-merge with the 07-13 roster batch, validate PASS, mobilecheck CLEAN, headless live-combat smoke
> verified. Previous session below.)
>
> **2026-07-13** (**HERO ROSTER → 10 + THE REACTION TRIO → 20 TOWERS** —
> three batches (3ac46c2/a38c36f/this). Heroes: **RIPTIDE** (Kinetic water-form zone
> controller, megaSlain-2 gate), **CARRION** (Vital charnel necromancer — GRAVEBIND raises
> corpses near it as corpse-scaled Risen Thralls off the death seam; lifetimeKills-20k gate;
> the pair's ONE new sim verb) and **FOVEA** (Neural executioner lance on the siege brain,
> Shard-160) — every typed-complete hero seam extended, roster-proof login-lane fix
> (`minIV` derives from roster size). Towers (TOWERS.md §reactionTrio): **MIASMA LUNG**
> (second Viral — a `field` plague fog coating the WHOLE pack with Infection; 18/240),
> **CHITIN BELL** (second Resonant — a toll slam priming the crowd with Resonance for the
> shatter reactions; 24/380) and **ACID LANCET** (Caustic EXECUTIONER — one 130-dmg
> `highestHealth` harpoon per 4.5 s, Corrosion wound, 120 px deadzone; 34/560) — the first
> roster growth with ZERO new sim verbs (all composed from `TowerDef.abilities`; the
> derived-Disruption field-kit caveat is a DIL edge). Both 1-tower class gaps closed. Full
> stacks: star paths, 2 branches each, 4-branch Adaptation rows, mastery lore, star/branch
> visual evolutions, +18 Mulligan pieces (the CATALOG_PER_TOWER ratio). All double-gated ⇒
> goldens byte-identical, zero golden re-pins. Suite 2017 green, validate PASS, live
> headless probes fielded the new content with no page errors. Balance = tuning clay
> (locked content; deep-account persona pass when wanted). **+ the EARLY BROOD** (third
> batch, ENEMIES.md §early-brood): four WEAK trait-less enemy variations — Hollow Husk
> (armor 1, the first armor read) · Itch Flea (speed 98) · Creeping Mold (62 hp @ 26 —
> the soft wall) · Pale Skulker (avoidTowers 0.85, the gap prober) — that the DERIVED
> campaign gate admits from stage 1 (tier-1 EHP, zero mech traits). Stage 1 wave 1 now
> opens mold×8+skulker×2+larva×1 (live-probe verified in the real Incoming preview, zero
> page errors); scripted WAVES untouched ⇒ pinned autoplay golden byte-identical.
> earlyBrood.test pins the weak-band contract + real spawn frequency. NEXT (user-queued):
> the early-game/NPE + tutorial overhaul from playtest feedback (#168) — the probe work
> surfaced the evidence: a fresh account stacks title→transmission film→rank-promotion
> popup→12-step Field Orientation tour→login cache ceremony→run tutorial before first
> combat. Previous session below.)
>
> **2026-07-12** (**MEGA-TARGETING FIX + CAMPAIGN DIFFICULTY RESCALE** —
> two arcs, four batches (0fd3d2d/3844852/933e80b/0edce9a). (1) Mega raids were untargetable
> by most of the arsenal: organ descent band recalibrated to the REAL slot grid
> (MEGA.minWeakPointY..maxWeakPointY 560–700, bodyBandY 580, validator-enforced ± both
> bounds), Siphon organ-tether/body legs + Coil body chip (both feed the ADAPT ledger), hero
> `heroMegaRaid` seek duty. (2) The economy-vs-curve rescale (docs/DIFFICULTY.md §curve):
> Bio-Container meter DORMANT until the first mega kill (`hasSlainMega`; run/stage caches
> unaffected; sim world-model mirrors the cadence via the real megaKilled event); piecewise
> EHP curve (5% 1–8 · 20% 9–25 · 5% after, `hpMultFor`); honest ×1.8 raid-premium bar on
> mega stages (sawtooth ladder pinned by progressionLoop invariant 1); probe-discovered
> HIVE-GUARDIAN OVERRIDE (`megaRaidYield` — raid duty yields while the Core is threatened;
> stage 10 was unwinnable at ×3 without it, BUGFIX-LOG #14); Boss Rush gate 10→9; gene/hero/
> nucleus stage gates reviewed + kept (decisions in §curve). Evidence: baseline/post-gate/
> final BALANCE_REPORT runs, fair-pilot contract probe 1–30 (table holds vs displayed bars),
> acceptance probe (Average first-walls ~25 at 0.90×, Efficient 0.96×, fresh-bot 10h stage
> 62→29), live headless probe (dormant/awakened meter, on-screen premium bar == derivation).
> Suite 1991 green ×4 batches, goldens byte-identical throughout, validate PASS, mobilecheck
> CLEAN. Watch items: stage-28 band heat; possible dormant-meter teaser copy. Previous
> session below.)
>
> **2026-07-12** (**CLAIM-POPUP NOTIFICATION LAYER + MUTATION PANEL
> DE-SCROLL** — docs/NOTIFICATIONS.md §claim-popups: ONE bold itemized receipt popup
> (`state/rewardToast.ts` bus + `RewardToaster`, menu-only in App) now presents every hub
> claim — quest missions/finales (+`+N Season XP` line teaching the quests→pass loop),
> season-pass levels/claim-all/premium unlock, weekly directives (previously SILENT, now
> also cued), wardrobe milestones — with icon-derived "view it →" jumps (containers→Vault,
> cosmetics→Wardrobe, essence→Gene Archive) via navBus; per-screen `bp-receipt` strips
> removed; ceremonies (BioCache/Vault/WardrobeReveal/Store/Spoils/Genome) deliberately stay
> bespoke. And the in-run Tower Mutation panel de-scrolled (docs/TOWER-BRANCHES.md §3):
> BranchTree = five-pip tier track + ONE selected-tier detail card (tap any pip → cost,
> mutation text, projected stat deltas via `statDeltas`/`branchStatsView`), pre-lock
> lane-focus compare (CHOOSE/COMPARE), tree directly under the title, one-line stat strip,
> Host-vitals `<details>` fold, Move/Sell/Done one row, mobile 304px cap — the buy/splice
> is above the fold everywhere. No sim/save/Power changes (goldens byte-identical). Suite
> 1986 (+5 rewardToast), validate PASS, live headless smoke: toast small/big/queue/nav,
> pre-lock compare, pip preview, splice→T2 evolve, 620px band — 15 screenshots reviewed.
> Previous session below.)
>
> **2026-07-11** (**HERO SYMBIOTE SYSTEM** — the champion wing of the
> Mulligan pillar, docs/HERO-SYMBIOTES.md: every hero hosts 3 gated slots × 3 organ seats
> from a 36-species catalog (behavior-verb kit, structurally unable to duplicate Hero
> Equipment stats); per-slot Complete Hero Adaptations; category-census Resonance; per-hero
> identity trials + Ichor (`HERO_SYMBIOTE_GATES`, typed complete over HeroKind); staged
> visual mutation (`render/heroSymbiotes.ts`) + Hero Lab Symbiote Chamber console + live
> portrait preview; save **v41** `heroSymbiotes`; NEW hero killing-blow credit
> (`Enemy.lastHitHero` → lifetime `heroKills` — previously never accrued); Power via the
> mulligans bucket ×`accountSymbiotePower`; genome source, 4 collection codices, 4
> achievements. Suite 1943, validate PASS, mobilecheck CLEAN, live combat probe PASS
> (all 11 verbs), goldens byte-identical. Earlier same-day: DRACONIC content (Cinderwyrm
> swoop hero + Wyrmwing Glaive 'arc' + Drake Roost 'summon', pushed 7f2c837).
> Previous session below.)
>
> **2026-07-09** (**MULLIGAN PRESENTATION OVERHAUL** — the Mulligan Lab
> rebuilt to the design language (token-driven `.mgl-*`; host rail → live graft-chamber
> showcase → Power-previewed graft sites → category-filterable modifier library; auto-armed
> first empty site; DPR/reduced-motion-aware preview canvas); `MULLIGAN_RARITY` colors now
> mirror the global `--r-*` ladder; new `GENE_OVERFLOW` ⊛ identity shared by the Lab wallet
> + reveal pulls; Inspector/Daily phantom CSS vars fixed. Suite 1328, validate PASS,
> mobilecheck CLEAN, live headless equip/level/ascend loop verified. docs/MULLIGANS.md §UI
> updated. Previous session below.)
>
> **2026-07-08** · session 2 (**PUBLIC-RELEASE PACKAGE complete** —
> marketing site (`/welcome/`: hero/trailer/screenshots/features/modes/newsletter/legal
> skeletons + hidden modular ad slots, docs/WEBSITE.md), full branding/PWA (manifest,
> icons, OG card, boot splash, SEO/social meta), privacy-friendly analytics (D1
> aggregate counters + server-truth purchase funnel + CF Web Analytics readiness), and
> **FIELD RESEARCH** — the optional rewarded-ad lane, in-fiction and registry-driven
> (docs/RESEARCH.md): 5 sample/2 boost/1 specimen/1 stamina/1 emergency daily caps,
> progression-scaled payouts, flat Ichor trickle ≤5/day, one-run boosts consumed at
> finishRun, provider-agnostic (`VITE_ADS_PROVIDER`, ships hidden), Market panel +
> Daily/Rush/Results entries, reveal ceremony; save v24; suite 1187; live headless
> claim-loop verified. Release docs: docs/RELEASE-GUIDE.md (novice manual) +
> docs/PRODUCTION-READINESS.md (scorecard: launch blockers = legal pages, live-Stripe
> smoke, domain strings). Previous session below.)
>
> **2026-07-08** (**PRODUCTION DEPLOYMENT complete** — the game is
> launch-ready on Cloudflare Pages + Pages Functions + D1 + Stripe Checkout +
> Turnstile (docs/DEPLOYMENT.md: architecture/diagram/env-vars/checklists;
> docs/STRIPE-SETUP.md: operator checklist). Thin fail-soft backend only where a
> client must never decide alone: server-verified purchases (webhook HMAC +
> event dedupe + catalog-priced sessions + exactly-once fulfillments + refunds),
> cloud saves (sync-code TOFU), daily day-tickets, leaderboards (Turnstile +
> bounds + keep-best), health check. Sim stays 100% client-side/offline. Save
> v23 (claimedReceipts + pendingCheckout). 29 new failure-mode tests (dup
> webhooks, forged signatures, refunds, power-loss claims…); suite 1173.
> docs/SECURITY-AUDIT.md: cleared for release, no criticals; independent diff
> review clean at the reporting bar. Previous sessions below.)
>
> **2026-07-07** (**MEGA BOSS SAGA + three content batches complete**:
> the MEGA BOSS raid framework (battlefield-scale anchored organisms, 12-verb ability registry,
> 10-kind consequence-mapped Weak Point framework, campaign /10 · infinite /20 · rush /5
> cadence + the rare Daily Mega, Power-vs-kill-time efficiency rewards, collection category,
> `docs/MEGA-BOSS.md`) with FIVE authored megas (Voraxis / Meridia / Ossira / Vesperine /
> Moloch-Ama); SIX new campaign bosses — the Act-2 siege line (35/40/45) and the Act-3
> graduation line (50/55/60); THREE new towers, each a new firing verb (Blight Sower `'trap'`
> mine gardener — `docs/SOWER.md`; Synapse Spire chain-arc, first pure `TowerDef.abilities`
> composition — `docs/SPIRE.md`; Undertow Polyp pull-field displacement — `docs/POLYP.md`);
> 15 gene cards (pool 102, 44 gated) + 30 meta upgrades (87) + 9 Ascendant nodes (19) + 8
> enemies + 2 biomes (10) + the boss visual distinction overhaul
> (`render/bossChassis.ts` — five chassis body plans, authored palettes). Goldens
> byte-identical throughout; suite 1137; validate PASS. Previous sessions below.)
>
> **2026-07-05** (**BOSS RUSH SAGA complete — all four prompts shipped**:
> P1 boss siege behaviors + multi-phase AI (16-kind module library, canonical 100/70/40/15
> phase arc, desperation finales — `docs/BOSS-DESIGN.md` §siege); P2 **Boss Rush mode**, the
> third pillar (wave N = N procedural bosses, staggered column + thinned escort, draft every
> 2nd wave, per-boss Core/loot payout, own records + prediction + qualify gate, gauntlet
> terminal, probe-tuned fresh w7 / mid w8 / late w10); P3 **stamina** (100 cap, 20/entry,
> +1/3min lazy, first-of-day FREE, market packs) + the **primary Ichor lane** (2 per NEW
> 5-boss record band, container per 10-band); P4 **Bio-Roulette** second reward ceremony
> (Bio-Spores, fresh 12-pod weighted board, momentum physics, one-click Absorb) — all in
> `docs/BOSS-RUSH.md`; goldens byte-identical throughout; suite 952. Previous session below.)
>
> **2026-07-04** (evening session — **STRAIN + BIOMORPH CONVEYOR complete**:
> all 8 prompts shipped incl. the PROMPT-8 simulation report + economy retune (deploy
> 100·1.11ⁿ, strain 100·1.05ⁿ×[3,4,5,6]) and the integration long-tail (lifetime ledgers,
> achievements, tutorial nod) — `docs/STRAIN.md` §9; and the **TOWER EXPANSION**: Carrion Maw
> / Amber Chrysalis / Wailing Effigy with every progression layer (branches, stars,
> adaptation, organs, Strain II–V ×12 verbs, cards, affixes, sounds), Freeze/Fear statuses
> with the engine refractory window + flees semantics, contract probes green at 8 kinds,
> goldens re-pinned twice deliberately — `docs/TOWERS.md` §expansion. Earlier the same day:
> HIVE SIEGE combat model + contact rebalance + presentation — `docs/HIVE-SIEGE.md`).

## Completed systems (shipped + tested + documented)

Core sim (deterministic, golden-pinned) · Towers/Stars/Branches/Codex · Mastery/Adaptation ·
Heroes (slots, evolution, selection) · Hero + general Equipment (~180 items, reforge,
safeguards) · Loot (meter/queue/vault/pity/catch-up) · **Gene Card Evolution (all 12 tasks —
pillar status, `docs/GENE-AUDIT-REPORT.md`)** · Collections · Evolution HQ (Genome Cores) ·
Prestige layer 1 (Molt/Ascendant) · Campaign (world map, gates) · Infinite (AI Director) ·
Power Score (+ mandatory-coverage validation) · Currencies · Achievements · Onboarding (Combat
Tutorial, HUD Tour, Help wiki, What's New, loading tips) · Notifications · Progress Prediction ·
Save (v20, migrations, backups, dev reset) · **Engineering automation (dependency registry,
doc-sync anchors, `npm run validate`, handoff scaffolder)** · UI standards + component library
(`docs/UI-STANDARDS.md`, style tests) · **Music engine (composition core + WebAudio manager,
`docs/GAME-FEEL.md` §music)** · Command Center living-lab redesign · Gameplay HUD redesign
(vital hierarchy, glass cells, responsive) · Power Score full-coverage audit + gain feel
(`docs/POWER-AUDIT.md`, toasts/previews) · **Visual identity trilogy + unification
(`docs/VISUAL_IDENTITY.md` / `docs/UI_STYLE_GUIDE.md` / `docs/DESIGN_LANGUAGE.md`; type/tracking
scales enforced, drone retired → live music intensity)** · Tower Lab v2 (specimen rail +
mutation-chamber showcase, bench prefs) · Live Mastery (in-run projection, level-up
celebrations, per-tower lifetime ledgers v20, Results ledger, Help entry) · **Multi-platform
responsive framework (`docs/RESPONSIVE-DESIGN.md`: drawer shell, container-sized panels, safe
areas, touch layer, probe-validated 13-viewport matrix)** · Hero Combat Console (three-region
in-run command surface, roster tabs, hold-to-buy, preview===outcome comparisons, HUD summary) ·
Campaign ROADMAP (gate jumps, goal rail, mission cards, fastest-clear ledger v21) · Doctrine
PROTOCOLS (six enemy-world warps, golden-safe) + Infinite experiment terminal · Gameplay Speed
(fixed-step 1×/2×/5×, auto-slow) · Genetic Vault v2 (objects/rates/multi-open/ledger) ·
staged Bio-Container openings (build-up, fast mode, legendary lighting, first-discovery NEW
badges) · Loot-meter rebuild (truthful-fill contract, earn ceremony + container flight,
self-heal, 5000-fill stress pin — `docs/BUGFIX-LOG.md` #10) · **Balance architecture
(`docs/BALANCE_ARCHITECTURE.md`): Universal Difficulty Director (one scaling-policy layer,
bit-exact parity) · Adaptive Economy Framework (factor-traced income chains + health guards) ·
Progression Loop Engine (8 enforced invariants, LoopDirective on Results/Campaign/Infinite) ·
Progression Simulator (virtual accounts over the real meta layer, hour-band report +
detectors, `npm run sim:progression`)** · Player Profile dashboard (registry-driven sections,
power attribution, frames/timeline/milestones, save v22 ledgers — `docs/PROFILE.md`) ·
**Tower Adaptation / Antigen (per-tower generated 4-branch trees, exclusive forks, capped
multi-source Antigen, campaign gates 15/30/50, battlefield FORM stages, priced stage-gated
respec, lab UI + inspector — `docs/ADAPTATION.md`)** · **Command Center home (registry-driven
widget zones over pure read-models; living World Status canvas organism, command strip, feed,
unlock roadmap, forecast, live army — `docs/COMMAND-CENTER.md`)** · **Permanent simulation
framework (11 personas over the real meta layer, dopamine-cadence ledger, 8 bottleneck
detectors with diagnosis, `npm run sim:report` → report-only `docs/BALANCE_REPORT.md` —
`docs/SIMULATION-FRAMEWORK.md`)** · Enemy/boss battlefield language (trait-on-body visuals,
artillery shells, boss runtime tells — `docs/ENEMIES.md` §8–9) · Deployment interstitial +
Wave Briefing threat console · **Danger Camera (hysteresis state machine → ONE smoothed
intensity for every tension effect; render-only, golden-safe — `docs/CAMERA.md`)** ·
**Onboarding overhaul (gated Combat Tutorial via `game.tutorialMode` + director-scripted
beats, milestone-reward ledger, anchored what/why/when/later Field Orientation, Help
"Watch out" rows + 5 new mechanic entries — audit record `docs/TUTORIAL-AUDIT.md`)** ·
Combat HUD v3 (phase-state skins, clustered zones, power celebration, HERO OPS, focal Start
Wave — `docs/HUD.md` §0) + game-feel pass (wave banner/camera push, boss arrival, crit pops,
placement tendrils — `docs/GAME-FEEL.md` §0) · **Early-campaign difficulty contract
(`docs/DIFFICULTY.md` §contract: >rec ≈ no damage · =rec ≈ chip/boss · ≤0.75 ≈ bad time;
EHP-priced waves, granularity ramps, §grace window, stage-flat leak damage, biome-ratchet
recommendedPower, mortar lead — goldens deliberately re-pinned, biomass-only drift)** ·
**Hive Siege (docs/HIVE-SIEGE.md): the Core is a COMBAT TARGET — converge/crust/attack-loop
enemy AI (statuses gate everything, artillery unified, suicide fuses, chassis boss cadence),
role-derived per-hit rebalance probe-held to the §contract, endless shape/EHP/swarm depth
gates, and the under-siege presentation (damage states, impact shudder, groans + heartbeat,
reactive integrity cell: UNDER ATTACK flag, ghost bar, ⚔ count, −DPS/s, survival clock)**.

## Systems in progress

- _(none — between milestones)_

## Known issues

- Economy: mid/late currency sinks thin out (star sink exhausts in tens of hours) — top design
  P0 from `docs/EA-DESIGN-AUDIT.md` §4; Gene Essence sink helps (≈hour-400) but doesn't close it.
- `GENE_POWER_SCALE` and similar constants are library-size-coupled (test bands fail loudly as
  the reminder — intentional).
- Hero abilities largely one-verb; roster of 3 caps team-comp depth (content, not systems).
- Giant files: `src/core/game.ts`, `src/state/meta.ts`, `src/index.css` (ranked debt —
  `docs/ENGINEERING-AUDIT.md` §4).

## Upcoming milestones

1. **Prestige layers 2–6 + content waves** — the deep band (stage ~165+, hours 500+) is the
   measured flattening zone reserved for them; `docs/PROGRESSION_REPORT.md` is the yardstick
   (watch items in `docs/BALANCE_ARCHITECTURE.md` §5).
2. **Card Ascension** — backend done; author tiers + one gameplay wire + ceremony.
3. **Content wave** — toward 10 towers / 6 heroes / 100 cards through the validators.
4. **meta.ts façade split + CI guards** (madge, ts-prune, import-direction lint).
5. **Hero mastery live projection** — towers wired; heroes ride the same bus (data change).

_Done 2026-07: **balance tuning pass** — molt milestone gate (minCells 12, linear +3
stages/molt), first-clear trim; molt spiral ended (31→8 @10h), deep freeze eliminated
(molts cycle past 3000h), sink exhaustion −75%; pacing envelope CI-pinned._

## Future roadmap (design-corpus scale)

Milestone bosses 2–4 · prestige layers 2–6 (Speciation…) · custom challenge/training modes
(FEATURES-flagged) · real art behind the procedural fallbacks · i18n layer (string surfaces
already registered per system) · platform decision on backend (cloud saves, dailies) — see
`docs/ROADMAP.md`, `docs/CONTENT-ROADMAP.md`.

## Documentation status

- **Self-enforcing:** doc ANCHORS + dead-path scan run in every `npm test`;
  `docs/DEPENDENCY_GRAPH.md` freshness is test-pinned; staleness advisory via `npm run docs:check`.
- First-read chain: `PROJECT_MANIFEST.md` → `GAME-STATE.md` → `CODEMAP.md` →
  `GAME_CONSTITUTION.md` (rules) → this board + `AI_HANDOFF.md` (live context).
- All 80+ docs reconciled as of the docs-audit + gene program; generated docs are marked as such.

## Architecture health

- 1223 tests / 172 files green; golden sim byte-identical; typecheck strict; build clean.
- Zero runtime import cycles (type-only back-edges by design); RC sweep verified ZERO orphan modules (209 files, all imported) and zero TODO/FIXME in shipping code.
- Registry-enforced: no orphan source files, no unresolvable system references.
- Debt ranked and bounded (`docs/ENGINEERING-AUDIT.md` §4–5); no unbounded growth surfaces known.
