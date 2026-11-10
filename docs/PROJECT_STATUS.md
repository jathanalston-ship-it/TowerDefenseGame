# PROJECT_STATUS.md — the live state board

> **LIVE 2026-11-10 ~04:30 UTC:** v2026.11.09.4 Progress You Can Follow, commit bfa87c50. Actions 42756081493 succeeded. Normal public game/home/news URLs verified: play-CtxVJXHT.js and all expected release content. 3150 tests and full mobile gate passed. Ongoing improvement goal continues; prior prepared/pending notices below are historical.

> **v2026.11.09.4 release prepared:** all source through 4e62318d passes production build, all 3150 tests, and the full 27-screen/nine-viewport mobile gate. Seven curated website notes included. Publishing Progress You Can Follow; verify Actions and live game/home/news before claiming deployed. Ongoing experience-improvement goal remains active.

> **2026-11-10 04:06 UTC verified local checkpoint:** `0bdad42e` production build, all 3150 tests in 353 files, and the full 27-screen/nine-viewport mobile gate PASS. v2026.11.09.4 notes prepared; production remains 33676de6 (remote verified). Next investigate the selected hero's recovery/ability readout, which currently uses primary-hero fields. Goal remains active; this batch has not deployed yet.

> **2026-11-09 next local batch:** production 33676de6 and website release v2026.11.09.3 verified live. Local v2026.11.09.4 improves progress accessibility and draft/pause keyboard ownership. Chrome interaction probes, strict build, 63 card/draft/Hive tests and 43 tutorial/Hive tests pass. Next batch not yet deployed; ongoing goal remains active.

> **2026-11-09 clarity release prepared:** reward audio/interaction fixes, complete Help search and related navigation, calmer portrait/count-up animation, continuous wallet totals, keyboard-friendly currency popovers, canonical hero class glyphs. Full 3150-test checkpoint and nine-viewport mobile gate pass; final glyph/site/docs checks and build pass. Website v2026.11.09.3 included. Broader experience goal remains active.

> **2026-11-09 experience batch — verified for release:** manual cinematic reading and keyboard navigation, resize-safe stills, live device-motion updates, clear hero timers and Hive-managed controls. Production build, 3148 tests (full run plus generated-doc freshness reruns), doc/site audits and nine-viewport mobile gate pass. Website release v2026.11.09.2 prepared. Ongoing broader experience goal remains active.

> Maintained at the END of every session (paired with `docs/AI_HANDOFF.md` — the constitution's
> workflow step 4). This is the "where are we?" answer; `docs/GAME-STATE.md` remains the deeper
> per-system built-vs-planned index, `docs/PROJECT_MANIFEST.md` the system map.
> **Last updated:** 2026-11-06b (**CLASS BONDS — validated, awaiting the owner's release go-ahead.**
> CLASS-BONDS.md: the class set bonus on the EXISTING six-class taxonomy — every deployed tower + fielded hero
> counts toward its class; 2/4/6 wake Bond I/II/III while deployed (Impact · Dissolution · Contagion · Lattice ·
> Sustain · Chorus), folded only in towerAttackMods / heroDamageMult + the Vital mend; bond levels 0–10 per class
> (Genome Cores, Evolution Hub → Class Bonds; ×1.8 at 10; meta Power) — save v58. Reveals at stage 13 (the hour-one
> screen cap of 18 forbade earlier); the same gate turns bonds on in runs; Daily = base strength. Taught by What's
> New + a guided walkthrough, a CLASS BOND field note, Run Build's Class Bonds strip, conveyor class marks, Help.
> Live-checked (screen, level-up, in-run strip). VALIDATION: validate PASS over a0b332d..HEAD (3140/3140, mobile
> gate clean); first-session probe all budgets ok (boot JS 500.8 KB). Website: release v2026.11.06.2, devlog
> `class-bonds`, Tower Guide §Class Bonds, roadmap entry.)
>
> **2026-11-06a** (**DEPLOYED — FIRST STEPS, WALKED WITH YOU** (`a0b332d`, run #237; owner approved "release the batch").**
> Owner playtest fixes + asks: (1) EARLY CALL §owed — a called-over wave's draft is dealt the moment ITS last unit falls
> (mid-fight; the pick resumes the fight), not 2–4 in a row at the clear; (2) the SEAL RULE now binds the Power Atlas /
> Advisor (BEST MOVE could level Adaptations before stage 24) and `spendAdaptation` refuses a sealed Chamber; (3) THE FIRST
> LOOP (TUTORIAL.md §first-loop) — a hands-on coach for a new account's first three hub visits (deploy · grow · collect),
> each step the player's own click on the real control; the Command Center grows with it; the first-session probe plays
> it end to end (also walked at 844×390); (4) frame-rate pass (RENDER-PIPELINE.md §6) — memoized colour strings, one HUD
> render per snapshot, cheaper tower clicks: −8–14% game-loop JS on a ×4-throttled CPU, −32% per-frame allocation, no
> visual change. Unpulled levers (owner decisions): a load-triggered detail tier (−42% JS, flatter bodies) and rendering
> the board at its displayed size (−33% raster; a layout change across profiles). VALIDATION: validate PASS over
> 429e7db..HEAD (3130/3130, mobile gate clean); probe all budgets ok. Website: release v2026.11.06, devlog
> `first-steps-walked`, beginner/features copy.)
>
> **2026-11-05g** (**DEPLOYED — A LIGHTER FIRST DOWNLOAD** (`429e7db`, run #236; owner approved the release).**
> DEPLOYMENT.md §boot-budget · §boot-css: the first download before any screen fell from 552 KB JS + 115 KB CSS to
> 497 + 51 KB gzip (−18 %). Patch-note history + the mechanics' Help/What's New copy (`state/mechanicsText.ts`)
> load with their screens; Store/Front helpers in their own files (both screens lazy); every class only one lazy
> module renders lives in that module's own sheet (59 sheets) — the split kept 321 rules whose move could flip
> the cascade, and a computed-style diff over 65 screens × viewports matched the old build exactly. lazyNamed
> re-requests a screen sheet that failed to load (else unstyled). Fix: Help's Towers/Heroes/Infinite cross-links.
> Probe budgets: boot JS ≤ 515, boot CSS ≤ 58 KB gzip (both pass). Not changed: `meta.ts` (all of it is boot —
> splitting it would not shrink the download); the service worker still precaches every chunk after the first
> visit (offline play). VALIDATION: validate PASS over 0b91f44..HEAD (3115/3115, mobile gate clean; first-session probe all budgets ok). Website:
> release v2026.11.05.7, devlog `a-lighter-first-download`.)
>
> **2026-11-05f** (**DEPLOYED — MADE FOR YOUR PHONE'S BROWSER** (`0b91f44`, run #235; owner
> approved the release).** RESPONSIVE-DESIGN.md §browser: every full-screen height uses `--app-h` (100dvh, measured
> fallback; uiStandards forbids bare 100vh) so the address bar never hides the game's foot; Android/iPad
> browsers go full screen on the first tap (Settings toggle, top-bar ⛶); iPhone Safari gets a one-time Add to
> Home Screen card; manifest installs landscape (was portrait); short portrait (390×664) keeps the run board
> ≥40% (27.8 → 40.5%); the phone-landscape top bar fits 667–926px. mobilecheck walks browser-visible sizes.
> Known: a full-screen 320×568 portrait run (4-inch phone) still crushes the board (31%, --full only).
> VALIDATION: validate PASS over 0f7d1d2..HEAD (3110/3110, mobile gate clean). Website: release
> v2026.11.05.6, devlog `playing-in-your-phones-browser`, features + FAQ copy.)
>
> **2026-11-05e** (**DEPLOYED — A CALMER FIRST HOUR + THE SOUND PASS** (`0f7d1d2`, run #234;
> owner approved "release as is").** First hour (lead): What's New paced to 2 cards per finished run (was 11 after
> run 1), the SEAL RULE (no mechanic before its screen), in-run FIELD NOTES for Early Call / speed / the
> defense zone / hero evolution, and every screen — incl. the Tower Lab / Hero Hall / Infinite — briefs and
> guides on arrival (save v57 archives those lessons for players who had met the screens). Sound (track S1):
> a measured, mastered SFX mix as data (`audio/sfxMix.ts`; loudness error vs design 10.3 → 0.2 dB RMS), 19
> truncated cues fixed, layered top cues, music level 0.8 → 0.7, Effects + Music volume sliders, `npm run
> audio:audit`. The owner should audition the A/B pack before release (effects are 8–10 dB louder relative to
> the music by design). VALIDATION: validate PASS over 2d0c694..HEAD (3109/3109, mobile gate clean);
> first-session probe PASS (2 modals after run 1: Towers + Daily Bio-Cache). Website: release
> v2026.11.05.5 "A Calmer First Hour", devlog `the-first-hour-and-a-sound-pass`, features + guides copy.)
>
> **2026-11-05d** (**DEPLOYED — THE OPENING FILM, REBUILT** (`2d0c694`, run #233; owner
> approved the release).** The first-boot cinematic gains a TURN: a new "the Hive answers" scene where the game's
> real towers erupt along the line and the game's real swarm breaks on it and streams home as biomass; the
> swarm scene casts the real creatures (enemyForms) with the apex rising past the lens; the veins take a truss
> whole; the title resolves glyph by glyph over the looming organism with the triad scored word by word and a
> film-styled call to action. Phone-portrait title clip fixed (BUGFIX 113). The film is now its own lazy chunk
> (`ui/IntroMount`) — boot JS 552.6 → 546.1 KB. Frame cost on a par (0.8–1.5 ms avg/scene). VALIDATION: validate PASS
> over 2b14f67..HEAD (3084/3084, mobile gate clean; one earlier drawer-timing flake re-ran clean). Website:
> release v2026.11.05.4 "The Opening Film", devlog `the-opening-film`, features copy.)
>
> **2026-11-05c** (**DEPLOYED — "A BATTLEFIELD YOU CAN READ"** (`2b14f67`, run #232 green; owner approved
> the release).** Full-game VFX pass in four tracks: V1 combat damage language (`render/combatFx.ts`), V2 one
> telegraph language for bosses/Mega/hero casts (`render/telegraphs.ts`), V3 biome ground + tower moments + the
> Hive Core integrity arc (`render/biomeGround.ts`, `render/towerMoments.ts`; fixed a per-frame floor re-bake,
> the biggest render cost), V4 one rarity language (`ui/components/RarityFx.tsx`) + vault rarity truth +
> promotion ceremony. Also: frontier v4 coverage model (`core/coverage.ts`; flawless 69 → 63 % / 73 → 62 %),
> Depth XP (account level-ups ~1/h at depth; deep rewards re-weighted), the Hive splices, honest veteran ETAs,
> within-reach stage ETAs, draft-card rarity VFX, reaction-label crowd budget, boss verb hold, media script
> closes drafts. Owner decisions with the release: the L100 milestone stays smaller (~328 Cores); weekly/monthly XP
> boards stay pure activity (period ledgers fold pre-depth-multiplier XP). VALIDATION: validate PASS over
> eb83070..HEAD (3084/3084, mobile gate clean). Website: release v2026.11.05.3, devlog `a-battlefield-you-can-read`, features,
> guides, media re-shot.)
>
> **2026-11-05b** (**DEPLOYED — FRONTIER CHALLENGE v3** (`eb83070`, run #231 green; owner
> approved the release).** GR1 (DIFFICULTY_DIRECTOR §6a v3): drafted cards leave the live ratio (base × invested Power ×
> board), w 0.6; live waves swap 0.3 × (1 − 1/m) of chaff for a PROBE kind — the first `LIVE_PROBE_ROLES`
> role the board covers least (data predicates), previewed in the briefing; elite share measured, ships 0.
> Measured: 8 h draft-pick spread ≈ 0 → +16 win pts; 8 h F+1..3 58 %; frontier 70 | 59 %; run time ×0.99 |
> ×1.78 of pre-G; flawless still 69 | 73 % (open). Readiness 0.7 re-checked. VALIDATION: validate PASS over
> 4a7426a..HEAD (3028/3028, mobile gate clean); GR1's probe PASS; live check clean. Website: release
> v2026.11.05.2 "The Hive Probes", devlog `the-hive-probes`, campaign guide.)
>
> **2026-11-05a** (**DEPLOYED — FRONTIER CHALLENGE v2** (`4a7426a`, run #230 green; owner approved
> the release).** GR1 follow-up to Batch G (DIFFICULTY_DIRECTOR §6a/§7): the
> live ratio counts towers fielded ÷ the opening build; the live multiplier splits HP^0.3 × pace^0.2 ×
> speed^0.5 (speed ≤ the 1.85 readability ceiling); w 0.3, caps 8/4, from wave 4 and Stage 4;
> `READINESS.warnBelow` 0.9 → 0.7. Measured: frontier win 8 h 87 → 73 %, 100 h 82 → 59 %; run time no
> longer than live; wave-1 losses 0; losses after wave 3 90 % / 83 %. Still open: flawless 73 / 67 %,
> draft picks barely move Campaign outcomes (next: cards-excluded ratio, threat by composition). Lead:
> owed-draft eyebrow ("+N more owed"), probe outcome label. VALIDATION: validate PASS over 2524c2d..HEAD
> (3022/3022, mobile gate clean); GR1's first-session probe PASS; live check clean. Website: release
> v2026.11.05 "Frontiers Bite Again", devlog `frontiers-bite-again`, campaign guide; PIL R 2026-11-05.)
>
> **2026-11-04f** (**DEPLOYED — BATCH G "THE GRIND"** (`2524c2d`, run #229 green; owner approved
> the release with live-threat caps 3/4).** Four tracks from the G1/G2 grind audits: GR1 the run (Campaign
> opening rules + answering gift, the LIVE adaptive threat on waves ≥ 4 / bosses, Early Call, the Infinite
> squeeze), GR2 in-run decisions (draft fit, ◆PICK = fit × Power, the opening draft, Splice, the Hive
> opening, debrief Board/Anti-air reads, mission-card wave 1), GM1 goals + recognition (save v56: income
> ledger → honest goal ETAs, farm-first Home CTA, permanent Gear Codex, Genome Rank peak Power, 11
> achievement ladders, income-scaled Bio-Cache, Specimen claim-all, one-tap post-Molt rebuild), GM2 chases
> + walls (uncapped depth item level + rarity bands, Mega premium ×1.15 + the Mega Hunt, the Boss Rush
> wall). Owner decision: the Boss Rush RECORD EPOCH (v56 archives a pre-wall `rushBestBoss` to
> `rushLegacyBestBoss`; the board re-keys under `RUSH_BOARD_EPOCH` — server functions change too). Lead
> fixes: owed drafts deal through `dealDraft`; ladder rungs fold on Results; no far-off ladder goals / 3-digit
> ETAs on an early goal board; **the DraftModal froze after an Early Call** (owed drafts back to back on a
> locked mount — keyed per deal; found by the probe); mobilecheck enters via the farm-first CTA. GR1
> follow-up: a matched-pair decomposition put ~¾ of the run-length growth on the live threat's HP → caps
> 16/16 → 3/4 (100 h winning runs ×1.6–1.7 the old length instead of ×2.7; frontier win rates up to
> ~82–87 % — the owner picks 3/4 vs 16/16 with the release). VALIDATION: validate PASS over e447108..HEAD
> (3019/3019, mobile gate clean, doc anchors clean); first-session probe PASS (0 errors, first tower
> 8.4 s, boot JS 548.5 KB); pil audit CLEAN; live checks desktop + 844×390. Website: release v2026.11.04.4
> "The Grind" (16 curated entries; v2026.11.04.3 sealed), devlog `the-grind`, features/roadmap/guides,
> media re-shot. NEXT: §7 — a board-size term in the live ratio + a stage-curve re-anchor (restores frontier
> challenge without padding runs).)
>
> **2026-11-04e** (**DEPLOYED — Batch 3 "Moments That Land" + a hotfix**. Hotfix first
> (`51d4fb7`, run #227, owner OK): a boss dying on a slow frame no longer crashes the run (impactFx age
> clamp); menu ceremonies/toasts can no longer cover a live Arena match (`menuIdle`). Then Batch 3
> (`e447108`, run #228 green, owner approved the frame sheets): the four signature moments — last-kill
> beat (`render/lastKill.ts`), victory wash / defeat cracks → Results on the final frame
> (`render/runOutro.ts`, `RunBackdrop`), living gutters (`render/gutters.ts`), films that move + Mega
> premieres that show their monster (`render/filmDirection.ts`, `drawMegaPose`). QA found + fixed: feed /
> vault-history duplicate keys, AutoClaimSummary claiming during render, the news-page sync test's
> sampler. VALIDATION: validate PASS (2930/2930, mobile gate clean), first-session probe in budget, a
> 26-screen × 3-depth error sweep and a 166-button press sweep clean, every mode smoke-run. NEXT: Batch G
> ("the grind") — grind audits G1 (the run) + G2 (the meta loop) are in; tracks GR1/GR2/GM1/GM2 running.)
>
> **2026-11-04d** (**DEPLOYED** — the batch below + its follow-ups are LIVE: the deploy
> branch `claude/zen-hawking-rh1gxl` was fast-forwarded to `136330f` with the owner's go-ahead; deploy run
> #226 green (CI polls production until it serves that SHA). Follow-ups shipped with it: Infection has
> an owner (`Enemy.infectedBy`, Miasma Lung's spread picks work); area grants take `at: 'victim'` (34
> star/branch effects now land on the struck enemy; Siphon grants get their target); Results offers
> Stage N+1's boon; the MOLT IMPRINT (a Molt keeps round(level × min(0.7, 0.0125 × Molts done)) of every
> Genome upgrade — late Molt drop ×33–40 → ~×3, BALANCE_ARCHITECTURE §9.6). VALIDATION: validate PASS
> over f73e8fb..HEAD — 2866/2866, mobile gate clean; first-session probe: 0 errors, 1 modal, first
> tower 8.6 s, boot JS 534.7 KB; pil audit CLEAN. Release notes v2026.11.04.2 "Feel and Flow" (33
> curated entries) + the devlog post.)
>
> **2026-11-04c** (**POLISH, CONTENT & ECONOMY-HEALTH BATCH** — merged + verified on
> `claude/beautiful-feynman-qdyilo`; deployed in 2026-11-04d above. Six tracks: F1 battle feel (FEEL
> table + centre-stage Announcer, boss kills land, Motion settings), F2 post-run (Stage N+1 from
> Results, one ClaimAll, phones keep the run layout through Results), N1 hub shell (Back/Escape walk
> the game, per-screen error boundary + chunk retry, advice links, decision badges, Home CTA above the
> fold), N2 screens (one name per screen, SectionNav / LoadoutStrip / ChipPopover, 4.5:1 text), C3
> content (Gristle Warren, Tick Battery, Keening Quill, the Myceliarch, six puzzle enemies), E2
> economy health (17 → 3 matrix signals; gene Power floor; shard surplus → Essence). Lead fixes:
> Season Pass claim-all in one press, Bio-Dex tyrant count, replays never credit the viewer's save
> (`Game.isolateEvents`), older replays play (neutral missing kinds), a splitter falls once
> (`bossKilled.final`), theater fall cards, Gene Archive Escape, mobilecheck server leak. Website:
> features copy, devlog "Feel and Flow", release v2026.11.04.2 curated (v2026.11.04 sealed as
> shipped), media re-shot. VALIDATION: validate PASS over f73e8fb..HEAD — typecheck clean, 2847/2847 tests, mobile gate clean, doc anchors/refs clean; first-session probe: 0 errors, 1 modal after run 1, first tower 8.2 s, boot JS 534 KB / 560; pil audit CLEAN; media re-shot (2 stills re-taken after review).)
>
> **2026-11-04b** (**DEPLOYED + WEBSITE REFRESH** — the batch below is LIVE (deploy
> branch fast-forwarded with the owner's OK; workflow SHA-verified). BE/NL store rule:
> `offerReachesChance` — no real money reaches a random outcome there. Website: copy, guides, Terms,
> devlog "The First Hour", live counts (battlefields / rule genes / Threat rungs), new stills + 36 s
> frame-stepped trailer via the new `npm run media`; CLAUDE.md gains the standing "Website freshness"
> rule; PIL review stamp → 2026-11-04, audit clean.)
>
> **2026-11-04** (**FIRST-HOUR, RUN, META & PLATFORM PASS** — the 2026-11
> player-experience review executed as seven tracks, merged + verified on
> `claude/beautiful-feynman-qdyilo`). FIRST HOUR: one graduation reward
> (`meta.grantOnboardingRewards`), a lane-safe 2-wave tutorial, one guest choice, ONE unlock
> summary after run 1 (probe: 10 modals → 1), held/collapsed toasts, `unlocks.isOpenNav` as the
> single guidance gate, calm readiness (`READINESS.warnBelow` 0.9), defeat debrief + real boss
> names. RUN: run layout v2 (board-first on every device, portrait + landscape phones), 13
> data-driven arena layouts (`core/mapLayouts.ts`, Game-owned `NavField`), rising Stage 1–3
> curve (`CAMPAIGN_ONBOARDING`), 25 Rule Genes + guaranteed rule slot, automation only on solved
> content (`automationGate`), Threat ladder (10 rungs, cosmetic rewards, save v55). META: reveals
> S4→S30 (≤2/beat, grandfathered), `rewardVisibility.ts` + Materials chip, 26 nav rows (host
> tabs), auto-claim into Results, decision-only badges, Molt cadence pinned. PLATFORM: lazy hub
> screens (boot JS 820 → ~517 KB gzip, offline precache), BE/NL rule: no real money reaches a random outcome
> (BE/NL), `npm run probe:first-session` (all budgets pass). Integration fixes: Field Guide
> buttons clickable, contracts/Boss Rush previews honest, phone Hive lock, probes find the
> preinstalled Chromium. VALIDATION: typecheck clean, 2730/2730 tests, mobilecheck CLEAN,
> validate PASS. Handoff: docs/AI_HANDOFF.md; map: GAME-STATE "First-hour, run, meta & platform
> pass".)
>
> **2026-07-20a** (**HIVE INTELLIGENCE — UNIVERSAL IN-RUN
> BEST-UPGRADE EXECUTIVE** (user-queued task #401). One HUD button, every Biomass sink,
> power-first ranking, full manual control retained. ENGINE: `src/core/hivemind.ts` — pure
> planner over a structural `HiveGame` interface (public Game members only; zero runtime
> Game import). FOUNDATION RULE: `registerHiveProvider({ id, enumerate })` — a future
> Biomass sink ships one provider and is ranked/executed/announced/validated forever;
> never edit the planner per-system. Five built-ins: branch tiers (exact ratio-based power
> delta via `effectsPower` product decomposition — `powerDelta` = base×(newVar/oldVar−1)),
> heroEvo (same exactness), autocast unlock, conveyor deploy (honest authored-stat
> heuristic — deployments deliberately never enter the temp-Power bucket; support kinds
> score lattice adjacency ≤ `HIVE_MIND.adjacencyPx` 90 px — slot col/row are FINE-grid, a
> |Δ|===1 test never matches; combat kinds most-forward + centered + monoculture penalty),
> strain merge (mirrors strainFromConveyor's tier>strain>id target rule). Context layer in
> ONE `applyContext()`: sparse board ⇒ deploy/merge ×1.6; heavy next wave (authored-HP
> threshold — ENEMY_TIER lives in render) ⇒ ×1.15; every multiplier writes
> `HiveAction.detail`. `Game.hivePulse()` execute-best/re-plan loop —
> **PINNED-RESERVE CONTRACT (DIL edge): reserveFloor computed ONCE from the starting
> wallet**; per-iteration recomputation asymptotically spends to 0 (first sim draft: 87
> violations/cohort → pin → 0). Exec ONLY through public buy APIs (Power audit + ceremonies
> ride normally; `branchTierCost()` made public so planner + buyBranchTier share pricing).
> UI (GameView + index.css): `◈ HIVE INTELLIGENCE` pill left of speed ctl, LED breathes on
> `hud.hiveReady` (~0.5 s sim-time cache, invalidated post-pulse); `.hive-ticker` action
> report at right:10 (right:218 covered the Start Wave popup — caught by smoke screenshot);
> per-action battlefield floats + splice cue. GOLDEN-SAFE BY CONSTRUCTION: only the
> player's button calls hivePulse. VALIDATION: hivemind.test.ts 7/7 (reserve law, rank
> monotonic, multi-buy audit-clean, determinism, free-starter at 0 biomass, placement
> geometry, full pulse); `npm run sim:hive` (scripts/sim-hive.ts — 6 endless seeds, 900 s,
> identical funded 4-tower openings, drafts driven — the draft-pause trap): manual depth
> 12.3/power 1.87 · **hive 19.3/37.9 (+57 %)** · mixed-cadence 20.8/35.6, 0 reserve
> violations, mixed ≥ hive ⇒ no dominant pulse spam. Headless dist smoke (hive-probe.mjs):
> click spent 1146/3220 across 11 actions, ticker + floats live, zero page errors.
> ALSO FIXED (exposed when UTC rolled to 2026-07-20 mid-session): battlePassMeta.test —
> deep meta chains default now=Date.now() (evaluateAchievements→grantPassXp) so the T0
> window-0 pin broke at the 07-20 window-1 boundary: season rolled over MID-TEST wiping
> claims; suite now pins `vi.useFakeTimers({ now: T0, toFake: ['Date'] })`. liveEventsMeta
> .test — great_hunt rotated out; today's trio has NO single-run-completable challenge, so
> the minting assertion now drives ceil(target/perRunCredit) heavy runs (bound ≤ 64)
> derived from authored data. systemRegistry files glob: scripts/ paths unsupported —
> hive-mind entry lists src/core/hivemind.ts only. Suite 306/2597 green, build, validate
> PASS. docs/HIVE-MIND.md NEW (naming: vs docs/HIVE-INTEL.md, the HUB feed). NEXT: modes
> UI seam (`hivePulse({maxActions})`), Help/teach row for the button. Previous below.)
>
> **2026-07-19ai** (**DORMANT IDENTITY LAYER — SEVEN SLEEPING
> SILHOUETTES** (user: "do that identity layer."). `drawDormantMotif`
> (render/megaboss.ts, inside drawBurrowMound's save block — inherits the burrow fade)
> gives every mega a per-motif buried pose echoing its awake drawMotif anatomy: maw
> tusk-tips slowly grinding through the soil · choir spire-tips with tolling bell-glints ·
> shepherd crook + hanging bone chimes · tide medusa-bell riding low + a breathing
> tide-ring · tithe gilded scales + one bead forever sinking into a seam · gorge
> half-buried gullet still swallowing beside pale teeth · myriad heavy-lidded eyes, one
> drifting open to study the field. Render-only (no sim/save/power surface moved; goldens
> untouched by construction); a new motif earns a case beside its drawMotif case or falls
> back to the plain mound. Gotcha caught: drawBurrowMound now computes `acc` (first draft
> passed it uncomputed — typecheck). VERIFIED: full suite 305/2590 green, build; headless
> canvas-bitmap sweep (burrow-motifs.mjs — spawn each def in PREP where megaDormancySystem
> buries it with no wave; capture canvas.toDataURL top band, bypassing HUD DOM):
> all 7 dormant=true, zero page errors, burrow-m-<defId>.png ×7 visually distinct.
> MEGA-BOSS.md §dormancy +identity paragraph. NEXT (user-queued): HIVE INTELLIGENCE —
> universal in-run best-upgrade system (task #401; foundation: bestPurchase advisor +
> conveyor placement heuristics; must never touch golden runs). Previous below.)
>
> **2026-07-19ah** (**MEGA DORMANCY — BETWEEN-WAVE BURROW POSE +
> GREYED RAID BAR** (user: burrow/in-between phase during build phase and between waves;
> health bar greys/fades). The between-wave freeze is by design (megaBossSystem/towerSystem
> run only in step's 'wave' branch) but a frozen full-color boss read as "invincibility" —
> now the freeze has body language. SIM (presentation-only state): `MegaRuntime.burrow`
> 0→1 + factory init; `MEGA.burrowInSec` 1.4/`burrowOutSec` 0.9; `megaDormancySystem`
> (game.ts) ticks burrow IN from step's settle + prep branches (one-shot `megaBurrow` cue
> + descent particles; skips dying megas); megaBossSystem's first live ticks ease it OUT
> (one-shot cue at the burrow≥1 edge). No combat number reads burrow — probe numbers
> byte-stable, goldens 12/12 (every path gated on `mega !== null`). VIEWS:
> `MegaBossView.burrow`; `MegaBannerSnapshot.dormant` (burrow ≥ 0.5) with `regenActive`
> gated off while dormant (grey bar never claims healing). RENDER (render/megaboss.ts):
> `burrowOf` smoothstep (death overrides → 0); body RECEDES up into the ridge
> (translate + fade) over a new `drawBurrowMound` — low breathing ridge-line, soil seams
> leaking palette glow, periodic ground tremor; organs + siege arm retract via wrapper
> (fully buried draws nothing); vignette fades ×(1−0.8·bur), frozen telegraphs/stagger
> frame suppressed at bur ≥ 0.5, heartbeat slows/fades. AUDIO: `sMegaBurrow` soil rumble
> (sound.ts) + 'megaBurrow' case. HUD (GameView + index.css): `.mega-banner.is-dormant`
> (desaturate/dim, `--dur-3` transitions — uiStandards gate rejects non-token durations;
> first draft failed it), grey hp fill, ALL combat chips + open-organ list yield to
> `⛰ BURROWED — RESURFACES WITH THE WAVE`. Tests: megaboss.test §dormancy (mid-wave never
> dormant; buried through prep — via chooseCard, the draft PAUSES advance; hp frozen both
> ways; resurfaces ≤ burrowOutSec) — 33/33; suite 305/2590, build, validate PASS (mobile
> gate incl.). Headless dist smoke (scratchpad burrow-probe.mjs, game entry
> /play/index.html): fight → dormant:false; prep → is-dormant class + BURROWED chip;
> resurfaced → false; zero page errors; screenshots burrow-1/2/3. MEGA-BOSS.md +§dormancy.
> Next: live play-validate the cadence + optional per-motif dormant silhouettes
> (drawBurrowMound seam). Previous below.)
>
> **2026-07-19ag** (**MEGA FIGHT-TIMELINE PROBE + ORGAN DROUGHT
> VALVE — REBUILD VERDICT: NOT WARRANTED** (user: "fight timeline probe please." — the
> instrument the af-handoff promised, grounding the "may have to rebuild" question in
> numbers). PROBE: `npm run sim:mega` (scripts/sim-mega-feel.ts) runs 5 REAL fights
> (10-tower forward board, ravager, live wave plans; voraxis campaign/infinite/rush t1,
> meridia infinite t1, voraxis infinite t3) and measures hp-bar uptime, longest flat
> stretch (+regen attribution), organ open/burst/expire cadence, telegraphs/interrupts/
> staggers, per-phase seconds, kill vs `megaExpectedKillSec`, death-seq, waves held; exit
> 1 outside THRESH (continuous flat ≤12s/uptime ≥50%; campaign ≤26s/≥30% — chunky by
> design). MEASURED (all PASS): kills 34–61s fight-time vs 75–97s reward bars, uptime
> 69–80%, flat ≤2.7s, organ gap 4–10.5s, death 3.5s, campaign holds 2 waves ⇒ **no
> functionality rebuild**. THE TRAP THE FIRST DRAFT HIT (now a DIL edge + MEGA-BOSS.md
> §feel): campaign's between-wave DRAFT pauses advance() entirely and megaBossSystem/
> towerSystem run only in step's 'wave' branch — the un-driven harness measured a phantom
> "585s stall" that was the draft picker; any campaign instrument must chooseCard +
> startWave and count fight-time only. VALVE (real pathology kept from the analysis):
> destroyed organs never return ⇒ cast/timer triggers no-op on scars ⇒ a persisting mega
> with all destructibles spent + hp above the next hpBelow trigger has ZERO windows.
> `MEGA.organDroughtSec` 22s + `megaOrganDrought` (game.ts, called in megaBossSystem's wp
> lifecycle): nothing open for 22s ⇒ REGROW one spent organ round-robin (`droughtRotor`,
> fresh hp/window, "IT REGROWS" float + wpOpen cue); `rt.lastOrganOpenAt` stamped by every
> opening (openWeakPoint fresh-push + regrow paths). Healthy fights never reach it.
> Golden-safe (inside megaBossSystem — never runs megaless; 12/12 pins green). Tests:
> megaboss.test §organ drought valve (all-specs-destroyed ⇒ reopen ≤ window, fresh hp,
> rotor advanced; permanently-open organ ⇒ valve silent, rotor 0) — 32/32, full suite
> 305 files/2589, build, validate PASS. MEGA-BOSS.md +§feel; knowledge.ts +1 edge (DIL
> regen 899 nodes/1691 edges). Next: play-validate campaign-10 live; if the between-wave
> freeze still reads as "invincibility", fix is PRESENTATION (dormant pose during prep),
> not sim. Previous below.)
>
> **2026-07-19af** (**MEGA-BOSS FOLLOW-UP — RAID HIT AUDIO + WAVE-BLOCKING
> MEGAS OUTSIDE CAMPAIGN** (user-queued: silent weak-point strikes; megas must count as
> wave enemies everywhere but campaign). AUDIO: raid strikes bypass projectiles ⇒ no
> impact cue ever fired — `megaHitSfx()` plays one throttled `hit` (≥0.15s across the
> whole raid; sim-time throttle `megaHitSfxT`, deterministic; beams can never
> machine-gun) at both `megaHitWeakPoint` and `megaHitBody`. MODES: `checkWaveEnd` gate
> now `mega !== null && (daily || mode !== 'campaign' || finale)` — Infinite/Boss Rush
> waves HOLD until the organism falls (previously only daily/campaign-finales held; a
> wave could slip past a live mega in the reinforcement-pulse gap — part of the reported
> jank); lone siege supplies pressure while held; CAMPAIGN remains the one mode where a
> mega persists across waves (finale still holds). Golden-safe by construction (gate
> keys on a live mega; megas absent from golden runs — 12/12 pins untouched). Tests:
> megaboss.test §modes (endless holds + releases on death; campaign mid-stage completes
> past it) — suite 30/30, full 305 files/2587 green, build, validate PASS. MEGA-BOSS.md
> +§modes + raid-audio note. Feel-rebuild decision deferred until play-validation
> (handoff names the timeline-probe next step). Previous below.)
>
> **2026-07-19ae** (**BOSS RUSH FREE-ENTRY BADGE — VOLATILE DAILY
> WATERMARKS** (user: "add a notification on boss rush mission tab when you have a free
> one"). The source + every badge surface already existed; the bug was the watermark
> model — count is 1 today AND 1 tomorrow (fresh free entry each reset), so ONE un-acted
> visit stamped seen=1 and went dark FOREVER. Fix: `NotificationSource.volatile: 'daily'`
> (notifications.ts): the seen-mark counts only on its stamp day (`<id>@d` numeric-ISO
> sidecar in the same persisted record — no migration; stale-day stamp ⇒ "never seen" ⇒
> badge re-lights at reset while the count stands; markSeen stamps today; sync untouched
> — @d keys are not source ids). Applied to `rush.freeEntry` ONLY (persistent watermarks
> remain correct for drop-on-action counts; login/idle.ripe flagged in handoff for
> per-UX review). Test: notifications.test rollover law (badge → seen → day rolls →
> badge again) via `__setNotifDayForTests`. Docs: NOTIFICATIONS.md +§volatile. Verified:
> typecheck 0, suite 305/2585 green, validate PASS. NEXT (user-queued): mega weak-point
> hit sounds + wave-blocking megas outside campaign + fight-feel pass. Previous below.)
>
> **2026-07-19ad** (**MEGA-BOSS STALL FIX + WEBSITE FRESHNESS PIPELINE +
> LAB ADAPTATION LINKS** (user reports: Voraxis fight "boss just stops"/projectiles ignore
> the body once weak points are down; site not updating with new patch notes; labs need
> Adaptation links). **MEGA FIX** (engine, golden-safe — megas absent from golden runs,
> pins untouched): the stall was towerMegaFire's body-chip gate `enemies.length === 0` —
> one add alive ANYWHERE froze every out-of-reach tower while the boss's own summons kept
> the field populated (the "invincibility phase" feel; progress only flowed in post-wave
> quiet = "killable on the last wave"). Rule now mirrors heroes: a tower with NO prey in
> ITS OWN reach chips the armored body (`towerHasTarget` — the idle batch's helper is now
> the shared gate), applied to projectile towers + Coil + Siphon; weak-point priority,
> megaRaidYield (Hive outranks raid), wave duty all UNCHANGED; mobile units keep the
> bare-field rule (they pursue). COMMUNICATION: MegaBannerSnapshot +regenActive/+armored;
> raid-bar chips `CARAPACE SEALED · CHIPPING` (no organ open, !exposed/!staggered) /
> `▲ REGENERATING` / `◆ ARMORED` with counter-naming tooltips (MEGA-BOSS.md §damage-gate
> honesty + §targeting stall note). Pinned: megaboss.test §stall audit (red before fix —
> back-row maw + sealed organs + one pinned add ⇒ dmgByKind.maw > 0, hp bleeds) — suite
> 28/28. **WEBSITE**: deploys were healthy (CI SHA-verify green, secrets set — checked
> live run e67e372); staleness was EDITORIAL: one open release absorbed 10 days
> ("The Living World Update" v2026.07.09, 332 entries) while the site advertised July 9.
> Chronicle gen-notes now **AUTO-SEALS BY DATE** (first commit of a newer day seals +
> opens a fresh date-keyed release — v2026.07.19 opened itself live; `--seal` remains for
> mid-day cuts); deploy.yml re-runs `npm run site` at HEAD (ephemeral, fetch-depth: 0 —
> deployed /news/ always includes the deploying commit; committed artifacts stay the
> reviewable record, one batch behind); secrets-missing soft-skip → HARD FAIL (a push
> that cannot change production is red); `src/changelog/siteSync.test.ts` = the regen
> drift gate (ledger ↔ releases.gen ↔ patchnotes.json ↔ rendered /news/, the DIL
> pattern) + auto-seal-lag law. Revert: DEPLOYMENT.md §rollback (CDN-level rollback +
> one-commit git revert). CHANGELOG-PIPELINE.md §releases updated. **LABS**: TowerLab
> (.tl-adapt-go) + HeroLab (.hsec-golink) real "☣ Open Adaptation Chamber ▸" buttons via
> navBus.go('adaptation'). Verified: typecheck 0, suite 305 files/2584 green (one DIL
> regen), build, mobilecheck CLEAN (31), cogload in budget, validate PASS. Previous
> below.)
>
> **2026-07-19ac** (**LIVING BATTLEFIELD — ANTICIPATION, IDLE LIFE &
> BIOLOGICAL REACTIVITY** (user brief: full battlefield animation/immersion pass, "the
> battlefield should never appear motionless"; anticipation state bridging idle↔combat;
> per-tower personality; environmental reactions; enemy reactions; layered ambient
> audio; throttled performance; reusable Living Organism framework; must NOT affect
> balance). **ZERO `src/core/` edits — goldens byte-identical by construction.** NEW
> `src/render/organism.ts` (claimed under living-battlefield): per-kind
> `OrganismProfile` {orient, gape, swell, twitch, tremor, emission, voice} resolved
> FORM_PERSONA (12 body-form personas) → CLASS_VOICE (Caustic=acid/Viral=spore/
> Vital=heart) → per-kind OVERRIDES (22 identity rows: maw chatters+drips, needle
> tracks the lane, roost peeks drakelings, lung deep-inhales…); `organismProblems()`
> validator (bounds + twitch>0 — "never motionless" is law). Runtime per tower id
> (module cache, frame-stamp reaped): approach-ALERT eased from STAGGERED proximity
> scans (~1/6 frames, 1/12 past PERF.lodEnemyCount; band = (range, range×1.8] —
> strictly OUTSIDE range so combat never double-animates), threat BEARING (shortest-arc
> ease, rest = up-field), RECOVERY settle armed on cooldown fire-edges, TREMOR fed by
> deathEvents (overkill ≥0.55 → 140px radial shock), ult castEvents, mega telegraph/
> phase (global megaRumble), hiveHitPulse — all exponential decay. `organismPose()`
> (amplitude-capped AT THE SOURCE: rot ≤0.09 rad, scales ~±5%) wraps the body draw in
> renderer drawTower AFTER the siphon beam/shadow (world-anchored things never swing);
> `drawOrganismEmissions()` world-anchored per-family air life (spores lift, drips
> rope, sparks glint, drones peek, crawlers skitter, wisps spiral — deterministic trig,
> zero alloc, life = max(alert, prep×0.5) so between-waves still breathes), LOD-gated
> via drawTower's new `fxDetail` param. ENEMIES (renderer motion tracker): GAZE
> bearing eased toward nearest tower ahead (staggered ~1/8 frames; mega boss overrides
> — everything watches the raid organism) drawn as an eye-glint; SHIELD-SHATTER
> stagger wobble riding sim shieldFlash; fear trembling + hit flinch already owned by
> statusFx/enemyForms (kept). AUDIO: 7 quiet `org_*` synths (heart/breath/bone/acid/
> spore/chirp/hum, peaks ≤0.035) + `pollAmbientCue()` director (GameView RAF poll,
> bioStage precedent): ≥2.6s gap, silent past 26 enemies, calm breaths 2.5× rarer —
> layered one-shots, loops impossible. MEASURED: updateOrganisms 2–13µs/frame @ 15
> towers × 3–72 enemies (whole stub-ctx drawGame 1.6–3.2ms) — a rounding error. Tests:
> organism.test.ts (8: profile laws, alert rise/exhale, in-range zeroing, shock
> radius, recovery decay, director gap/din). Verified: typecheck 0, suite 303 files/
> 2579 green (2 batch-hygiene fixes: AI_HANDOFF dead path, DIL regen), build,
> mobilecheck CLEAN (31), cogload in budget, validate PASS, live probe zero pageerrors
> + org-prep/anticipation/combat shots. Docs: LIVING-BATTLEFIELD.md +§Organisms
> (canonical), TOWER-IDLE.md §7 cross-ref, GAME-STATE towers row. Previous below.)
>
> **2026-07-19ab** (**TOWER IDLE POSTURES — COMPLETE FUNCTIONALITY &
> IDLE BEHAVIOR OVERHAUL** (user brief: "a tower should never feel asleep" — three
> states COMBAT/TRANSITION/PREPARATION, every tower ≥1 identity secondary behavior,
> no two alike, reduce long-range practical dominance WITHOUT nerfing range, animated
> transitions, data-driven, balance-simulated). NO save bump — Tower fields are
> run-temporary. Canonical doc **docs/TOWER-IDLE.md**. ENGINE: `prep` scalar 0..1 per
> tower (rises 1/1.2s unengaged, falls 1/0.35s engaged — the renderer eases ALL
> transition motion from it; engagement = living enemy in effective range outside
> deadzone via `towerHasTarget`; field towers no longer pulse empty air —
> deliberate); 7 sim verbs in data (`core/towerIdle.ts` IDLE_BEHAVIORS, 22 rows,
> `towerIdleProblems()` validator-bounded): windup (banked opener via cast globals
> incl. new `castStatusAmountBonus`), reserve (gestated volleys), ranging (parasite
> Spore Drift: weak 2×-reach shots through the NORMAL cast pipeline), preheat (coil
> 0.35 heat floor), tending (sower cap+1/rate×1.3; roost hatch×1.5 + perch regen×2),
> trickle (reactor +0.55 integrity/s; siphon +0.8 biomass/s), choir (ossuary +5% dmg
> aura, decaying `choirDmg` folded in towerAttackMods). Long-range corrective:
> payoffs scale INVERSELY with range band, charge times scale WITH it (maw 3.5s ×2
> vs mortar 8s ×1.35). Tunables `TOWER_IDLE` (config.ts; plain IDLE = Idle Harvest);
> hook `RunModifiers.towerIdleChargeMult` (FIELD_VOCAB registered).
> **`RunOptions.disableIdle` reproduces the pre-idle sim BYTE-EXACTLY** — pinned
> forever as golden.test.ts GOLDEN_LEGACY; live GOLDEN deliberately re-pinned
> (wave/kills/won identical ALL six seeds; integrity only improved/held). Mechanism
> suites (strainVerbs/strains/sower/finaldefense/expansion) pin their own
> choreography with `{ disableIdle: true }` + rationale comments. PRESENTATION:
> posture breathing, filling preparation ring + ready halo, work-motes, ossuary
> choir filaments, `tprep_ready` quiet cue; Inspector `mut-idle` chip
> (state+behavior name, phase-aware: build phase reads PREPARATION) + Host-vitals
> blurb; TowerCodex `.codex-idle` identity line. Public counters idleOpeners/
> idleRangingShots/idleBiomass/idleMended + `getMasteryAccrual()`. MEASURED (`npm
> run sim:idle`, new instrument, A/B vs disableIdle, mixed 6-kind board × seeds
> 1/7/42/777): 4/4 wins both arms, Σintegrity 725 vs 701, short-range damage share
> HELD/ROSE, mortar share flat 70.7% vs 70.6% — no range amplification (findings in
> TOWER-IDLE.md §9). Tests: towerIdle.test.ts (8) + goldens incl. isolation block;
> suite 303 files/2571 green, typecheck 0, build, mobilecheck CLEAN (31), cogload in
> budget, validate PASS, live headless probe (chip PREPARATION→COMBAT→PREPARATION
> across a real wave, zero pageerrors). Power: NO change (in-run flavor; untouched
> power suite pins it). Previous below.)
>
> **2026-07-19aa** (**COSMETIC PROVENANCE, ITEM HISTORY & COLLECTOR
> PRESTIGE** (user brief: "a cosmetic should become more interesting the longer it
> exists" — permanent per-item history, museum presentation, organic rarity prestige,
> legacy badges, AH-ready census, fully data-driven at tens-of-thousands scale). NO
> save bump — everything DERIVES from v53 state. CORE (`core/wardrobe.ts`):
> `CosmeticEra`/`COSMETIC_ERAS` (launch = genesis "The Founding Catalog" v2026.07; a
> future wave = ONE era row + `ERA_OVERRIDES`); `cosmeticAvailability` (reissued >
> retired > limited(time-boxed sources) > available; curated `RETIRED_ITEMS`/
> `REISSUED_ITEMS` disjoint sets — retirement is data); `COSMETIC_BADGES` (13 rows:
> Founder ◈ / First Edition ① / Event Exclusive ☄ / Season Vault ❁ / Contract Seal ✪ /
> Limited Distribution ◇ / Retired ⌛ / Reissued ↻ / Legacy ☗ / Anniversary ✦ /
> Community Challenge ⚑ / Tournament Exclusive ⚔ / Developer Reward ⌬) with TRUTHFUL
> derivations (Legacy emerges only with age; membership badges ONLY via
> `BADGE_OVERRIDES` — pinned: no derivation can mint them); `HIVE_ARCHIVES` lore (17
> entries, ≤400-char law, EVERY event item must carry one); census/market
> NULL-PROVIDER seams (`setCosmeticCensusProvider`/`setCosmeticMarketProvider` — the
> client NEVER fabricates network numbers; TRADING-PREP.md §7 documents the endpoint
> contract, census source of truth = the new durable `cos_claim` analytics row emitted
> ONLY in SpecimenVault's claim handler). `wardrobeProblems` +5 provenance laws.
> META: `meta.collectorView(id)` → `CollectorView` (def+era+availability+badges+lore+
> family completion+claimed/copiesHeld+your stamp (bound `cos:<id>` else newest
> instance `cos:<uid>`)+census/market) — pure read, no state mutation. UI
> (SpecimenVault): **Collector Panel** museum overlay on card tap — static rarity-lit
> plate, badge chips, HIVE ARCHIVES shelf, 9 provenance ledger rows (honest "awaiting
> network census/market data" placeholders pre-AH), bonus line, your-copy history,
> claim CTA (same claim() handler), family completion meter; attn 0 holds, `svCereIn`
> the one finite entrance. **FIX: both vault overlays now Popup-portaled** — the
> screen-transition transform made `.screen` the fixed containing block (panel
> measured off-center/clipped headlessly; components/Popup.tsx is the law for every
> screen dialog). Tests: wardrobe.test +5 provenance laws (20), wardrobeMeta +3
> collectorView (18). Verified: typecheck 0, suite 302 files/2557 green, build,
> mobilecheck CLEAN (31), cogload in budget, validate PASS, headless probe
> (tap→museum→claim from panel→bound flip: family 0/9→1/9, eligible Yes→No — bound).
> Previous below.)
>
> **2026-07-19z** (**TWO-STATE COSMETIC OWNERSHIP — INVENTORY, CLAIMING,
> COLLECTION & ACCOUNT BINDING** (user brief: receiving a cosmetic must NOT unlock it;
> UNCLAIMED = tradable/auctionable/no bonus, CLAIMED = irreversible bind + equip +
> collections + permanent passive; AH backend prep; data-driven for decades). Save
> v52→**v53**. CORE (`core/wardrobe.ts`): `CosmeticInstance` {uid,item,at,src} +
> `newCosmeticUid` (ci_ prefix); 7 saturating bonus lanes (towerDamage/heroDamage/
> biomass/fireRate via run CardEffect mults · masteryXp/bossLoot/runReward via
> CollectionEconomyBonuses — ZERO new consumption sites) with rarity magnitudes
> 0.2–0.8%/claim, per-lane `eff = 0.06·(1−e^(−raw/0.06))` (first claim ~full value,
> complete collection ≈ +4.4%/lane, future content can never compound past the cap);
> `cosmeticFamily` (11 source-derived AH shelves) + BONUS/FAMILY override maps;
> `wardrobeProblems()` laws — **starters carry NO bonus** (pre-owned on fresh saves:
> POWER_BASE/golden safety). SAVE/META: `wardrobe.inventory` (sanitized, capped 999) +
> `wardrobe.granted` (once-per-source gate; migration seeds from owned — **pre-v53
> `owned` stays CLAIMED, nothing taken away**); ONE delivery chokepoint
> `receiveCosmetic` feeds applyRewardList/poll/boutique/milestones/quest-finales/
> login-drop (substitution RETIRED for cosmetics — repeat tracks mint tradable DUPES,
> the AH supply trickle; jackpots never wasted); `meta.claimCosmetic(uid)` (guard
> `cosmetic.claim` + GUARDED_META_METHODS row) consumes the instance, binds provenance
> (`cos:wd_*` bound forever, origin carried; `cos:ci_*` instance stamps pruned by the
> extended reconcile), activates the bonus (`wardrobeEffectsOf` beside
> battlePassEffectsOf in App boot + Power `meta` bucket as `wardrobeMult`;
> `accountEconomyBonuses` composes econ lanes). UI: **Specimen Vault** screen (nav
> `specimens`, Trade wing, ⧉; reveal-on-NEED via new `cosmeticInventory` condition +
> stage-8 backstop — a vault you cannot open would strand every cosmetic): search/
> ownership chips/group+sort filters/dupe counts/TRADABLE vs BOUND chips/bonus lines/
> favorites/240-card window, finite assimilation ceremony ("+X% lane — forever");
> WardrobeReveal arrival copy retuned ("SPECIMEN ACQUIRED — claim it in the Vault");
> `cosmetic.unclaimed` notification channel; teach row + i18n ×3. Tests: wardrobe.test
> +6 laws, wardrobeMeta rewritten (15), login/quests assertions → Vault. Verified:
> typecheck 0, suite 302/2549 green, build, mobilecheck CLEAN (31 screens — Vault
> auto-joined), cogload 72/72 in budget, validate PASS, live headless claim probe
> (ceremony + achievements/Account-XP cascade). Previous below.)
>
> **2026-07-19y** (**EVENT EXCHANGE SHOPS & LIMITED-TIME EVENT ECONOMIES**
> (user brief: themed per-event storefronts as the PRIMARY event-currency sink; purchase
> limits; "almost have enough for one more thing"; repeats never worthless; data-only
> future shops). Save v51→**v52**. SCHEMA (`core/liveEvents.ts`): `EventStorefront`
> {name, keeper, blurb} required on every shop (co-active-name-distinct across the
> super-cycle — validator law, like accents/ceremonies); `ShopLimit = window | daily |
> weekly | lifetime` on `EventShopRow` (+`bpXp` rider). **Limits live in the LEDGER KEY
> shape:** window rows = plain rowId in window-pruned `shopBought`; daily/weekly =
> composite `rowId@isoDay` / `rowId@W<week from BP.epochMs>` (expiry is structural — the
> window prune retires them, no cron); lifetime = `liveEvents.lifetimeBought[eventId:rowId]`,
> the ONE ledger sanitizeLiveEvents NEVER prunes, so signature exclusives stay sold when
> an event returns. `shopRowView()` = the single arbiter (bought/left/soldOut/restocks/
> onceEver/affordable + `almost` ≥70% banked — the "one more thing" hook);
> `meta.buyEventShopRow` rewritten through it (guard event.buy, applyRewardList
> substitution, bpXp → grantPassXp('event-shop') post-persist + receipt + toast,
> storefront-named toasts). CONTENT: all 8 events got storefronts (Slag Exchange / Pollen
> Bazaar / Dead Channel / Trophy Row / Silt Market / Ration Board / Memory Vault /
> Seedhouse) + 8 event-exclusive wardrobe pieces behind once-EVER rows; mint budgets now
> count restocked limit rows + bpXp×0.5 (all 8 validator-CLEAN under horizon budgets).
> UI (LiveEventsPanel): storefront header + keeper quote, limit chips, OWNED ✓ /
> RESTOCKS states, static almost-ring + "N MORE ⟨glyph⟩", one-shot evcBurst purchase
> flash (finite — cogload-neutral); live headless probe confirmed a real purchase fires
> burst + OWNED + the wardrobe ceremony via the normal reward bus. LAWS (`npm run
> sim:eventshops`, greedy persona day-walks): NO persona clears a shop in one window
> (whale included — tokens are engagement-only), new ≥1 / F2P ≥2 buys per event (ember/
> spore cheap rows split 2-stock to grant casual granularity, same mint), repeat windows
> absorb ≥70% veteran income + non-lifetime inventory out-costs the full pool (no
> worthless return), hook coverage 20/32 ≥ 20% floor. Also: coarse-pointer checkboxes
> 24→26px (exactly-at-floor rects measured fractionally under on the 926×428 sweep).
> Tests: liveEventsMeta 10→14 (lifetime forever-ledger, composite keys, bpXp lane,
> sanitizer keeps lifetimeBought). Docs: LIVE-EVENTS §6b, GAME-STATE v52 anchor +
> summary, DIL edge + regen. Verified: typecheck 0, suite 302 files/2539 green, build,
> mobilecheck CLEAN, cogload 70/70 in budget, validate PASS. Previous below.)
>
> **2026-07-19x** (**MENU UX / VISUAL HIERARCHY / NAVIGATION OVERHAUL** (user
> brief: "less clutter, better direction, faster navigation, more visual satisfaction").
> AUDIT-FIRST: every registry screen captured headlessly (desktop 1366 + landscape 844,
> developed profile) and reviewed against premium-mobile principles — findings + fixes
> recorded in **docs/UX-AUDIT-2026-07.md**. THE WAYFINDING FRAME (the batch's core):
> `ui/components/ScreenHeader.tsx`, rendered ONCE by the Hub on every non-home screen
> (above FeatureLocked — even locked screens carry location/back; portrait keeps
> MobilePageHead): back ‹ over a REAL 32-stop nav history (`Hub.goBack`; dry stack falls
> back screen → its landing → home), breadcrumb `group ▸ screen` (parent opens the
> landing), revealed-SIBLING chips with unseen dots (one-tap moves inside a wing — hub
> round-trips dead; glyph-only ≤900px), iOS edge swipe-back on touch (start ≤28px, >70px
> travel — never fights scrollers), and a finite 220ms `hub-screen-in` page transition
> (reduced-motion-safe, attention-budget-neutral). CHOKEPOINT FIXES from the audit:
> Quest Board/Premium Store/Daily Run display titles → standard `screen-h` (~110px of
> chrome reclaimed; the gradient `.title` now belongs to the unlock briefing alone);
> hub-landing "All quiet" now consults the LIVE lane (no more "quiet" above glowing
> claim cards — new `stillReady` line, i18n ×3); wardrobe unlock BACKLOGS (6+) collapse
> to one summary card instead of a 21-tap "Next" chain (per-card theater stays ≤5);
> triple-zero Materials chip hides. Honest deferrals in UX-AUDIT §4 (lab pre-content
> stacks, deploy-CTA reframe, ready-state chips). Verified: typecheck 0, suite 2535
> green, build, mobilecheck CLEAN (30 screens × 6 viewports), cogload 70/70, live probes
> (sibling jump, double-back, fresh-boot tutorial funnel), validate PASS. Previous below.)
>
> **2026-07-19w** (**METABOLISM — the recursive progression system** (user
> brief: "the game should reward players for interacting with reward systems"; Claude's
> lore name: Metabolism, screen 'Milestones'). NEW `src/state/metabolism.ts` — 22 infinite
> milestone tracks over LIFETIME ledgers in 4 categories (Conquest ⚔ / Assimilation ❈ /
> Evolution ⇧ / Rituals ✹). **Derive-first:** value(save) reads ledgers the game already
> keeps, so veterans back-fill instantly; only FOUR ritual counters (containersOpened /
> sporesAbsorbed / questsClaimed / passClaimed — the recursive heart: claiming rewards IS
> a tracked verb) needed single chokepoint writes via `bumpCounter`. **Curves:** 1/2/5
> nice-number thresholds forced strictly past prev (×2–2.5/step), rewards ceil(×1.35^tier)
> — rewardGrowth < thresholdGrowth is THE anti-inflation invariant (per-tier EV decay
> pinned by 19 tests). **Rewards speak applyRewardList BY CONSTRUCTION** (MetaRewardType ⊂
> PassReward kinds; new kind `mulliganTissue`; bpXp rides grantPassXp post-persist);
> `meta.claimMetabolism` batch-claims a track under guard `metabolism.claim` (registry +
> GUARDED_META_METHODS row). Save v50→v51 (`metabolism` shape OWNED BY saveStore —
> state/metabolism reads the type; core/ was wrong, boundaries.test forbids core→save).
> SURFACES: MetabolismScreen in the Rewards hub (nav ✹ 'Milestones', stage-8 FEATURES
> reveal — the back-fill bundle IS the reveal gift; mechanics teach row; notification
> channel `metabolism` + CHANNEL_CLASS claim 85 → auto Ready-Chain). NEW GATE `npm run
> sim:metabolism`: 5 personas × 120 days — no flooding (steady ≤10 tiers/day; veteran
> day-1 jackpot 128 ≤ 200), no dead 30-day window for ANY persona (the zero-prebank
> ritual counters keep veterans alive post-backfill — deliberate), window income decays,
> steady-state ≤95 core-eq/day (minor share). A future system = ONE TrackDef row.
> Verified: typecheck 0, suite 2535 green (302 files), build, mobilecheck CLEAN (30
> screens), cogload 70/70 (metabolism: attn 1 = the hero Digest CTA), validate PASS.
> docs/METABOLISM.md is the standard. Previous below.)
>
> **2026-07-18v** (**INFO HIERARCHY + THE COGNITIVE-LOAD BUDGET** (user
> brief: three information layers; "players should only think about the next 30 seconds").
> NEW INSTRUMENT `npm run cogload` (scripts/cogload.ts): walks every registry screen
> (developed profile, desktop + landscape phone) measuring Layer-1 reality — attention-band
> animators (≤3.6s infinite pulse/breathe, visible), digit-runs, text chars, hero-CTA and
> badge counts → docs/COGLOAD_REPORT.md; **attn ≤ 2 is a HARD exit-1 budget**. Baseline
> run: **32/68 measurements OVER** (nav badges pulsing forever on every screen, 15 Boss-
> Rush skulls, 9 Hero-Lab HP auras, topbar chips). THE RE-BANDING (10 CSS rules): badges
> announce-then-rest (×6 finite), ready-states + decorative auras to the ambient band
> (>3.6s), the recommendation keeps the ONLY fast breathe — now **68/68 pass** and the
> single breather on nearly every screen IS the answer to "what's the one most valuable
> thing" (bbs/sale). NEW `components/Detail.tsx` — the sanctioned Layer-2/3 fold (native
> details, quiet ◆ chip); adopted: Gene Archive tier ratios fold (%+bar stay at L1), gene
> tile's exact Power % demoted to a quiet ⚙ (figure lives in inspect — demote, never
> delete). docs/INFO-HIERARCHY.md is the permanent standard (three layers, the bands,
> outcomes-before-digits, persona findings, future-screen rules); DIL conflictsWith edge
> makes a new always-on fast pulse a build-breaking decision. Verified: suite 2518 green,
> mobilecheck CLEAN (caught + fixed a tier-chip spill at 1024w — Detail body now wraps),
> validate PASS, cogload PASS. Previous below.)
>
> **2026-07-18u** (**ICON LANGUAGE — the universal visual language** (user
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
- Store compliance (decided 2026-11-04): in BE/NL real money never reaches a random outcome —
  every SKU granting a container or a currency spendable on one is refused/hidden
  (`offerReachesChance`), so nothing is sold for money there today. Counsel should confirm before
  live payments; residual risk: Ichor bought abroad isn't segregated (`docs/PREMIUM-STORE.md`
  §paid-loot-boxes).
- Full-spender accounts still clear Campaign Stages 1–3 at 98–100 % integrity (the 60–90 % band
  holds for the playtest persona — `src/state/campaignCurve.test.ts`).
- Dead width-based in-run CSS remains in `src/index.css` under run layout v2.

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


## 2026-11-09 — Hive Intelligence continuous play (local branch)

Implemented on `codex/hive-autoplay`, not deployed: Stage 5 completion unlocks continuous purchases, wave starts, gene picks and lead-hero ability/rally control in Campaign and Infinite. See `docs/AI_HANDOFF.md` and `docs/HIVE-MIND.md`. No save migration.

Next local batch follow-up: pause dialog focus containment/restoration and safe confirmation focus verified in Chrome. Mobile pause now overlays open Status drawers; 390x844 visual and click checks pass. These changes remain local for the next release.

Evolution follow-up local: keyboard purchasing fixed in shared hold-to-buy hook; hero purchase focus and multi-buy level feedback corrected; console layering fixed. Browser purchase/affordability checks, 19 evolution tests and production build pass.

Selected-hero readout follow-up: corrected hero-specific recovery, shield and ability countdown; accessible roster tabs; removed Infinity attack rate for non-attackers. Three-hero desktop/phone probe and 19 focused tests pass.

Audio follow-up local: purchase cues now drain during pause without advancing sim or adding shake; duplicate hero/conveyor sounds removed. Dispatcher browser check and 68 gameplay/upgrade regression tests pass.

Field-note local improvement: readable hover/focus hold, keyboard Dismiss and polite announcement. Chrome expiry/interaction/phone checks and 8 first-hour tests pass.

Next local batch v2026.11.09.5: readable static upgrade/Power/Mastery feedback under reduced motion, verified by CSS and actual purchase browser probes. .4 remains the live release.

Portrait preview local improvement: offscreen/hidden symbiote drawing stops, live motion changes work for hero/tower canvases, and hero CSS decorations still under reduced motion. Browser lifecycle checks and 15 rendering/motion tests pass.

Cosmetic ceremony local improvement: keyboard focus/Tab/Escape behavior verified across single, sequence and backlog reveals; final cabinet action unchanged. Browser checks and 38 wardrobe tests pass.

Local .5 follow-up: tower star ceremony keyboard focus/dismissal verified in Chrome; included in the ceremony website note. Full release suite running.

Local .5 now includes full Vault ceremony keyboard flow; browser single/legendary/batch checks and 16 model tests PASS. Prior full suite passed 3150 tests; final build pending. Four curated website notes.

Vault final build and styled phone keyboard flow PASS; mobile release gate running against the completed build.

Vault motion follow-up locally verified: live heartbeat prefs, flash suppression and zero shake; phone keyboard checks still pass. Mobile gate continues on preceding build; final motion build pending.

.5 release checkpoint05:03UTC: final build, mobile gate, website sync and focused follow-up checks passed. No processes left running. Still local; next approximate deployment05:30UTC. Website verifier updated to .5 markers.

Local .5 adds stable reward/Vault total accessibility text while retaining visual count-up. Chrome AX-tree and47 model checks PASS; fifth website note prepared.

Reward announcement production build and website-sync checks PASS; local .5 now five notes. All local processes stopped.

Reward card reading holds now verified across hover, focus, expanded summary and incoming bursts. Original merge timing preserved; accessible-count probe re-passed. Full release regression running. Fifth website note expanded.

Reward reading production build PASS. Final full suite34772 and mobile37446 continue; same handles/logs recorded in handoff.

Final suite3150 PASS. Mobile gate identified a drawer-transition sampling race; focused landscape diagnostic and controlled settling check passed. Gate now waits for actual closed visibility; full rerun83603 active. Deployment waits for this result.

Same-destination drawer close fixed and browser-verified with no extra Back stop. Build and19 navigation tests PASS. Final mobile72291 running; six website notes.

.5 final mobile gate PASS at05:36UTC; deploying verified six-note release. Full3150 suite plus focused19 nav/back and4 site checks passed; final build and focused browser checks passed.

LIVE ~05:38UTC Nov10: v2026.11.09.5 Feedback That Stays Readable, commitfa4f78bc, six website notes. Actions42763247079 success; normal game/home/news verified against built hashplay-DZzequMq.js. Next approximate deployment06:38UTC; continuous improvement goal remains active.

New local batch .6 Sound That Responds Smoothly; .5 sealed/live. First change:20ms SFX volume/mute ramps verified by real offline audio samples, including rapid changes and fallback. One Audio website note prepared.

.6 SFX smoothing final build and website synchronization PASS; local checkpoint ready. .5 remains live, next deployment around06:38UTC.

.6 music slider now supersedes older duck/duress recovery. Real audio rendering reproduces/fixes zero-volume rebound; rapid settings and fallback PASS,42 audio tests PASS. Second Audio website note prepared.

.6 music slider final build and website checks PASS; two audio improvements saved locally. .5 remains live; next deployment around06:38UTC.

Local .6 follow-up: music re-enable now restores latest looping scene (including muted scene changes/boss binding), without stale ceremony replay.46 audio tests,4 site-sync tests, actual Chrome toggle checks and earlier volume probes PASS; production build PASS. Three Audio website notes prepared, still local. Next approximate deployment06:38UTC.

Local .6 shared mute now silences scheduled musical flourishes via100ms master fade. Actual reward-stinger offline output after mute changed fromRMS0.017549 to0; muted volume/duress remain silent.47 audio+4 site tests PASS, scene/volume browser regressions PASS. Four local website notes; awaiting final build result.

Final shared-mute production build28873 PASS (music-mute-build.log); all task processes terminal. Four notes prepared for .6; next approximate deployment06:38UTC. Live remains .5.

Audio .6 checkpoint:353 files/3155 tests PASS; actual shared keyboard audio controls and compact persistence PASS; docs checks PASS. Full mobile gate29287 remains running; poll same handle. Game/website still live .5, .6 four notes local; deployment target approximately06:38UTC.

Audio .6 mobile gate CLEAN all9 viewports (29287 terminal0). All batch gates completed; no processes remain. Four website notes local, next approximate release06:38UTC.

Local .6 accessibility follow-up: hero auto-cast exposes pressed state after unlock or under Hive management; locked purchase remains a normal button. Actual Chrome AX tree and keyboard actions PASS;41 focused tests PASS. Five website notes prepared; final build pending.

Final auto-cast accessibility build19427 PASS (autocast-accessibility-build.log), all processes terminal. Five notes local for .6; live remains .5.

Local .6 placement controls now expose armed state; conveyor Deploy names the organism and free/live cost. Real Game keyboard/AX checks PASS for selection/clearing/switching and free/paid labels; auto-cast AX re-PASS,4 site tests PASS, production build23561 PASS. All processes terminal. Five notes prepared, still local.

Release .6 sealed and verified:5 curated website notes, final production build/site sync PASS. Publishing now under ongoing deployment authorization; live verification pending.

LIVE .6 Sound That Responds Smoothly:4545bff2ed18e243009ba5ce8e283a454141c1c9, Actions42767736604 SUCCESS. Normal custom-domain play assetplay-BAy15d18.js matches build and returns200; home/news and all5 notes verified06:22UTC. .6 sealed. Next approximate deployment07:22UTC, with a new release batch. No processes running.

New LOCAL .7 Clearer Battlefield Choices: correct zero starting-gift refund, retained keyboard focus after recycle/merge, named transaction buttons. Actual browser matrix and20 tests PASS; build65033 PASS. One UI website note prepared. Live .6 remains, next approximate deployment07:22UTC. No processes running.

Local .7 recycle confirmation now plays once via sim queue. ActualGameView direct+queued trace reproduced2 ->1; stale retry0.35 focused tests PASS; build40516 PASS. Two website notes, local only. All processes terminal.

Local .7 tower sale/first-branch prompts now have safe Cancel focus, named modal semantics, Tab containment, Escape/restoration and cancel on Pause. Actual keyboard matrix, styled 3viewport measurements and fullGameView Back/Pause/Resume PASS;29 tests and build96060 PASS. Three local notes. Nextapprox deployment07:22UTC, live .6 unchanged. No running processes.

Local .7 branch focus retained at final/unaffordable upgrade, with unrelated focus preserved. Browser and20 tests PASS; build/docs PASS. Full3155 batch suite PASS; mobile63403 stillRUNNING. Four local notes. Nextapprox deployment07:22UTC, live .6 unchanged.

Local .7 final follow-up: Hive-aware confirmations keep sale quotes live and reject stale requested branch tiers. Actual Chrome race reproduced unintended tier2/2800 spend, fixed to tier1/0; fresh tier2 still succeeds. Changed prompts disable Commit and focus Cancel. Live sale quote tracks75->525. Confirmation keyboard and actual Pause/Resume probes PASS. Final build/docs PASS. Full mobile gate PASS27screens/nine run viewports before this no-layout follow-up. Core/economy/save data unchanged. Final suite running; release not yet deployed.


Release .7 final verification: all353 test files/3155 tests PASS (155.11s), final build and docs anchors/references/freshness PASS. Prior mobile gate PASS27 screens plus9 gameplay viewports. Actual Chrome Hive race, changed-state Cancel, live sale quote, keyboard matrix and full GameView Pause/Resume PASS. Five player-facing website notes sealed for Clearer Battlefield Choices. Windows validate wrapper limitation remains as documented; direct gates used. No core/economy/save changes.

Release v2026.11.09.7 Clearer Battlefield Choices is LIVE. SHA4ae0d15ecca52bda8a03a14b0ee34e1170f54050; Actions42773576301 SUCCESS with exact-SHA production verification. Normal custom-domain play/home/news verified07:14UTC Nov10: play-DxebhRO7.js matches local build and returns200; all five website notes present. Final353files/3155tests, sealed build, four site-sync tests and docs check PASS; mobile27screens/nine run viewports PASS before final no-layout Hive-confirmation follow-up; targeted browser probes PASS after follow-up. Continuous improvement goal remains active; next approximate release08:14UTC. No servers or test sessions running. Untracked devlog draft remains unpublished.

Local v2026.11.10.1 Clearer Run Controls: speed aria-pressed and descriptive live Early Call/Splice names; presentation only. Actual GameView Chrome/AX probe PASS for mouse/F cycling1->2->5->1, matching timeScale, live wave2 overlap/reward and800 Biomass Splice price. Build PASS,12 browserBack/siteSync tests PASS, docs anchors/references/freshness PASS. No CSS/core/save/cost changes. One website note prepared; not deployed yet. Full suite/mobile remain last release results, not rerun for these three accessibility attributes. No running sessions.

Local v2026.11.10.1 now has two notes: Hero Ops uses effective abilityCdMax and reports recovery/armed state accurately, plus run controls. Actual Chrome probe reproduced half-progress .75/.25 with cooldown modifiers; now .5 for1/.5/1.5 multipliers. Recovery7s, armed, fully ready and AX image name plus ability description PASS.24 heroes/equipment/evolution and4 site tests PASS. Docs check PASS. No core/CSS/save/cost changes; not deployed. Both generated devlog drafts remain unpublished.

Hero readiness final build65590 PASS (Vite7.59s); all processes terminal. Next release remains roughly08:14UTC with matching website notes; live .7 unchanged.

Local selected-hero readout follow-up: ability and unlocked skill totals now match the cooldowns used by casts. Effective ability text rounds to one decimal; downed gauges show Unavailable and zero fill. New heroSelect regression PASS5tests includes actual cast timer/readout agreement and read-only snapshot check. Chrome selected-hero-check and styled label-fit checks at1366x768/844x340/390x664 PASS. Build44563 PASS8.59s, docs98411 PASS. Full regression68135 running. Third website note generated. No combat timers/effects, cost, save or CSS changes.

Selected-hero final full regression68135 PASS:353files/3156tests,156.14s. Build/docs/browser checks all passed; no active processes. Local v2026.11.10.1 has three unsealed player-facing website notes. Last live .7 unchanged; next deployment roughly08:14UTC.

Local v2026.11.10.1 fourth note: hero attack/pulse gauges capture the actual interval after each timer starts in private WeakMaps. No timer math changed; maps are not serialized or consulted by combat. Selected attack speed follows that interval (behavior baseline before first action).18 heroSelect regressions PASS: every hero with haste and Vitriol mega-raid-to-siege transition. Chrome real hasted attack shows3.64/s and50% halfway. Build77223 PASS8.01s, docs97323 PASS; full87589 pending. No UI/CSS/save/economy changes.

Hero cadence final full suite87589 PASS:353files/3169tests191.64s. Build, docs and real browser checks PASS; all processes terminal. Local v2026.11.10.1 remains unsealed with four website notes. LIVE .7 unchanged; next deployment roughly08:14UTC.

Local fifth release note: recovery countdowns use remaining simulation seconds after reviveSpeedMult across HUD, Inspector, Toolbar, selected-hero panel, Combat Console and canvas. Raw recovery timer unchanged.20heroSelect tests PASS including elapsed revival1x/2x; actual Chrome panels and drawGame canvas all show3s for6raw/2x. Build96717 PASS7.24s, docs57891 PASS. Full75923 still running; no failures observed. No simulation/save/economy changes.

Recovery final full75923 PASS353files/3171tests166.75s. Build, docs, browser UI and real canvas verification PASS. All processes terminal. Local v2026.11.10.1 has five unsealed website notes; latest live .7 unchanged. Next approximate deployment08:14UTC.

Local sixth note: active ability gauges retain the duration recorded at cast time through Overdrive purchases, then show the shorter next-cast duration once ready. Browser baseline25%->0 with unchanged6s reproduced; fixed25%->25%.21 focused tests PASS including actual next cast. Full14798 PASS353files/3172tests187.38s. Mobile57569 PASS27navscreens/nine gameplay viewports on recovery build before this readout-only follow-up; no subsequent UI/CSS changes. Docs28636 PASS. Final build57126 pending. Live .7 unchanged. ../verify-current-release.ps1 prepared for exact asset/home/news/all release-note verification.

Final cycle build57126 PASS; all processes terminal. Six notes prepared, next approximate deployment08:14UTC.

Release .10.1 final UI follow-up: Hero Ops ability explanation was clipped above/right of its scrolling panel. Replaced with44px button+inline disclosure using aria-expanded/controls; Escape contained, no ability/wave action. Actual GameView Space/Escape PASS; standalone Enter/Space/click/Escape and three viewport bounds PASS; all12 hero descriptions fit168px sidebar at340px height. Screenshot ../hero-details-panel.png visually reviewed. Readiness AX and confirmation matrix re-PASS.40focused tests PASS; final sealed build54139 PASS5.47s; four sealed site-sync tests PASS; docs53698 PASS. Full3172 suite preceded this UI/CSS-only follow-up. Final mobile46835 RUNNING(run-controls-final-mobile.log), do not overwrite dist. Seven notes sealed; deployment verifier ../verify-current-release.ps1 prepared.

Release v2026.11.10.1 Clearer Run Controls: final sealed-build mobile46835 PASS27navscreens/nine gameplay viewports, drawer/rotate/run-chrome contracts clean, no overflow/clipped text/sub24px targets. Sealed build and site sync PASS; full3172 suite PASS before final UI-only disclosure, which passed40 focused tests plus actual full GameView keyboard, all12 narrow-sidebar descriptions, screenshot and readiness/confirmation probes. Seven notes sealed; all processes terminal; ready for authorized deployment.

LIVE v2026.11.10.1 Clearer Run Controls, seven sealed website notes. SHAa6249d385614942cfe6d902b987330b4ecb1c2d9; Actions42779296326 SUCCESS including exact-SHA production check. Normal custom-domain game/home/news/all7notes and entry asset verified08:03UTC Nov10; play-Tn7MFVuY.js matches local and returns200. Initial custom-domain request served prior .7, then propagated normally after20s. Verifier local reserved-variable error corrected before successful verification. Full3172 suite PASS before final UI-only disclosure;40focused tests, final sealed build/four site-sync tests, docs and mobile27screens/nine gameplay viewports PASS after it. All processes terminal; continuous goal active, next approximate release09:03UTC.

Local v2026.11.10.2 Rewards You Can Read: AccountLevelToast pauses while hovered/focused, supports explicit keyboard dismissal and queue/final focus restoration, preserves unrelated focus, and resumes after unlock holds without replaying sound. Timer removes only its own front item. Browser controlled-clock lifecycle probe PASS (normal/milestone expiry, hover/focus, Enter/Space queue, held/resume, audio); styled long reward text fits1366/390/320 widths with24px dismiss target; screenshot visually reviewed. Build77587 PASS5.21s,61 accountLevel/rewardVisibility/rewardToast/siteSync tests PASS, docs43827 PASS. No grant/XP/economy/save changes. All sessions terminal; one website note prepared, not deployed.

Local .10.2 reward-stack follow-up: dismissal captures focused stack controls and restores only after the node is removed and focus falls to body. Next card receives focus; final/Dismiss All restores prior external control; disappearing footer covered. Navigation opts out. Actual Chrome baseline card remains but BODY focused; fixed next/final/clear/footer/outside/nav cases PASS. Existing reading-hold/burst-pinning/merge-window probe re-PASS. Build40357 PASS5.35s,40 rewardToast/rewardVisibility/siteSync tests PASS, docs59978 PASS. No queue/grant/CSS/save changes. All processes terminal; two unsealed website notes, not deployed.

## 2026-11-10 — readable container notifications (local .10.2)

LootToaster now holds expiry while hovered/focused, provides a labeled 24px dismiss button, transfers focus through its queue and restores prior focus afterward. Independent cue effect prevents replay during reading. Removed the fixed CSS exit timer so held notices stay visible; entry/glow and reduced-motion rules remain. No loot grants, economy, saves or simulation changes.

Validation: production build PASS (Vite 5.74s); 45 loot/queue/progression/vault/site tests PASS, regenerated site-sync 4 tests PASS. Actual Chrome probes ../loot-toast-check.cjs and ../loot-toast-game-check.cjs PASS reading holds, expiry, queue/final/unrelated focus, single cues, Enter/Space safety in GameView, and desktop/390px/320px fit. Dev server stopped. Website note generated as the third unsealed .10.2 entry; not deployed yet.

## 2026-11-10 — update prompt timing (local .10.2)

UpdateToast holds outside idle hub, retaining events across run/tutorial/results/roulette/Arena transitions. hasWaitingUpdate exposes the existing pending worker for late prompt mounts. Dismiss restores prior connected focus only when its focused control disappeared; label localized EN/ES/PT. No automatic refresh or service-worker activation policy changes.

Validation: production build84638 PASS6.50s; subsequent typecheck87169 PASS with new tests. 24 locale/navigation tests,3 new worker lifecycle tests,9 registry tests and4 regenerated site-sync tests PASS. ../update-toast-check.cjs actual Chrome PASS early worker event, held/resumed event, keyboard dismiss/focus, no dismissal activation, explicit SKIP_WAITING, EN/ES/PT layout at1366/390/320. App wiring uses existing menuIdle (excludes live Arena); full App transition browser check not run separately. Four unsealed website notes; next deploy roughly09:03UTC. Docs8157 terminal PASS.

## 2026-11-10 — achievement clarity (local .10.2)

AchievementPanel labels earned/in-progress/undiscovered states explicitly, names Genome Core rewards below goal text, and shows existing next-rung ladder rewards. Removed whole-card opacity from unfinished cards; secret names/descriptions/rewards remain concealed. No checks, thresholds, grants or saves changed. Manifest's obsolete Shard reward description corrected to Genome Cores.

Validation: production build82292 PASS6.16s;17achievement tests+4site-sync tests PASS; docs87144 PASS. ../achievement-panel-check.cjs actual Chrome PASS earned status, concealed secret names/rewards, matching ladder previews, normal unfinished opacity and all-card overflow checks at1366/390/320. ../achievement-panel.png visually reviewed. Five website notes generated for .10.2, not deployed. All processes terminal; next approximate deploy09:03UTC.

## 2026-11-10 — Trophy Rack instructions (local .10.2)

Profile trophy cards expose mounted state with aria-pressed, visible mount/unmount/full-rack instructions, and locked source requirements. Next-slot hint derives from TROPHY_SLOT_THRESHOLDS; disabled cards remain readable. Real equipTrophy logic, ownership, slot limits and effects unchanged.

Validation: build61662 PASS (before final article wording correction);13Nemesis tests and4site-sync tests PASS. Actual Chrome ../trophy-rack-check.cjs PASS twice, including final wording: real boss ownership, Space mount/Enter unmount, pressed state/full-rack handling,5/12 thresholds and all-card fit1366/390/320. ../trophy-rack.png reviewed. Final typecheck69908 and docs35776 terminal PASS. Six unsealed .10.2 website notes; next approximate release09:03UTC.

## 2026-11-10 — achievement search (local .10.2)

AchievementPanel uses shared ListControls for trimmed/case-insensitive visible name/description search and All/Not earned/Earned chips. Live result count and empty guidance; concealed milestones match only public placeholder text until earned. Lifetime ladders stay separate; no save writes or progression changes.

Validation: production build66372 terminal PASS;21achievement/site-sync tests PASS. ../achievement-search-check.cjs actual Chrome PASS keyboard filters, pressed state, case/trim search, no secret leak, earned secret becomes searchable, empty recovery, and card/control fit1366/390/320. Screenshot reviewed. Docs65310 terminal PASS. Seven unsealed .10.2 website notes; next work is full release regression and final mobile checks before approximate09:03UTC deployment.

## 2026-11-10 — v2026.11.10.2 release validation

Rewards You Can Read sealed with seven website notes: readable account/container notices, reward-dismiss focus, hub-only update prompts, clearer achievement/trophy information, and milestone search. No simulation, balance, reward grants or save schema changes.

Full run43607:3174/3175 tests passed across354files in184.59s; the sole failure was DIL_GRAPH missing the new swRegister test node. Regenerated graph (998nodes1943edges);all7DIL tests then PASS. No product code changed after this full run. Final sealed build16310 PASS5.97s and4site-sync tests PASS. Mobile74803 terminal PASS:27navigation screens and9gameplay viewports, drawers/rotate/touch/overlap contracts clean. Wrapper validate --base a6249d38 still exits1 due known Windows spawn handling; direct gates above provide evidence. All focused browser checks are recorded in preceding entries. All processes terminal. Deployment pending.

## Deployment verified — 2026-11-10 08:52 UTC

LIVE v2026.11.10.2 Rewards You Can Read, seven sealed website notes. SHA e176563d06bd43881dabd1a579bea51d21f0521e; Actions42785759629 SUCCESS including exact-SHA production guard. Normal custom-domain game/home/news/all7notes verified08:52UTC Nov10; asset /assets/play-Bj9XiPk2.js matches local build and returns200. Full run3174/3175PASS;sole stale generated DIL graph corrected and7DIL tests re-PASS. Final sealed build5.97s,4site-sync tests and mobile27screens/9gameplay viewports PASS. All processes terminal; continuous goal remains active. Next approximate deployment09:52UTC.

## 2026-11-10 — Power explanations (local .10.3)

Profile Power rows use native details/summary with44px minimum targets, inline descriptions and persistent open state. Pointer/Enter/Space supported. Multiplier display uses2–4decimals to preserve small positive bonuses; score/share/bar calculations unchanged. First unsealed website note prepared for .10.3 Progress Explained.

Validation: build13806 PASS6.02s before final precision formatting; final ../power-details-check.cjs actual Chrome PASS all6disclosures, keyboard/pointer controls, unchanged values, small positive multiplier visible and1366/390/320 fit with44px targets. Screenshot reviewed.24profile/power/site tests PASS;docs66410 PASS. Final typecheck24831 terminal PASS. Live stays .10.2, next approximate deployment09:52UTC.

## 2026-11-10 — Career detail controls (local .10.3)

StatCell hints now use explicit44px Details buttons with expanded state and controlled inline text; ordinary cells remain static. Open hints survive parent Fold close/reopen. Removed two internal documentation references from player-facing hints. No statistic calculations or saves changed.

Validation: build89016 PASS7.28s before final wording-only cleanup;10profile tests PASS again after cleanup,4site-sync tests PASS,docs52147 PASS. ../career-details-check.cjs actual Chrome PASS42hints,Enter/Space/click,controlledregions,parentfoldpersistence,unchangedvalues and1366/390/320fit/44px. First probe failed because its dynamic closed-section selector shrank during iteration; corrected probe passed, no product defect there. Screenshot reviewed. All processes terminal. Two unsealed website notes prepared for .10.3;live .10.2 remains,next deploy roughly09:52UTC.

## 2026-11-10 — leaderboard feedback (local .10.3)

LeaderboardBlock now has retry/refresh, disabled loading controls, status feedback and named table/column headers. Mode effects clear old results and cleanup ignores stale requests; rendering also requires matching response mode. Submission/ranking/API logic unchanged.

Validation: build93517 terminal PASS before final table-header markup; final ../leaderboard-feedback-check.cjs Chrome PASS loading/offline/keyboardretry/focus/recovery/refresh, mode reset, late-response race, empty response and1366/390/320fit. Mock transport only; no live leaderboard submitted by probe.5epoch/site-sync tests PASS. Docs40902 terminal PASS. Three unsealed .10.3 website notes;next approximate deploy09:52UTC.

## 2026-11-10 — replay copy recovery (local .10.3)

ShareReplayButton adds localized pending/success/failure feedback, disabled pending button and selectable read-only fallback for missing/denied clipboard. Request generation and timer cleanup prevent stale UI after blob changes/unmount. Existing code/link encoding and cutoff unchanged; no network share or live clipboard used by probe.

Validation: build90718 PASS5.99s;11codec/i18n tests+4site-sync tests PASS. ../replay-copy-check.cjs actual Chrome PASS denied/missingclipboard, selected fallback roundtrip, retry success,pending lock, old-result rejection,longrawcode and3locales x desktop/390/320fit,zero page errors. Initial probe needed a DOM lookup for intentionally hidden empty status; corrected probe PASS. Docs16894 terminal PASS. Four unsealed .10.3 notes;next deploy roughly09:52UTC.

## 2026-11-10 — Replay Theater controls (local .10.3)

Replay viewer now owns initial/contained/restored focus, consumes Escape locally, focuses/describes the outcome and hides covered controls from accessibility tree. Pressed playback state and localized progressbar added. Skip clears pause before advancing to outcome. Simulation stepping/private events/verification unchanged.

Validation: build12778 PASS12.22s before final outcome-copy spacing/covered-header Tab adjustment; final browser ../replay-controls-check.cjs PASS modalTab/Escape/restore,pause/speed/progress,skipfrompause,verifiedactualrecord,unchangedsave and1366x768/390x844/320x568/844x390fit. Initial save assertion included scheduled startup powerLog; probe now waits for that documented0ms snapshot before baseline, then save equalityPASS.20replay/codec/i18n tests PASS. Final typecheck/site/docs2159 terminal PASS (4site tests). Five unsealed .10.3 notes;next approximate deploy09:52UTC.

## 2026-11-10 — quiet replay skipping (local .10.3)

SpectateView always drains sim SFX but only plays them during normal playback. Pending LastKill ticks still advance while skipping, consuming fanfare timing silently. No global mute/music, simulation pacing or outcome changes.

Evidence: ../replay-skip-audio-check.cjs baseline failed with a compressed batch(kill3,edie_squelch3,assimilate3); after fix skip audio[] and full viewer/verified-outcome/save-isolation checks PASS. ../replay-normal-audio-check.cjs PASS normal x16 playback retains4audio batches and identical outcome/save. Build25769 PASS17.31s;30replay/lastKill/cues/site tests PASS;docs45666 terminal PASS. Six unsealed .10.3 website notes;next approximate deploy09:52UTC.

## 2026-11-10 — replay paste compatibility (local .10.3)

Added local-only decodeReplayInput adapter for HTTP(S) share links/raw codes; existing codec validation unchanged. Daily input is an Enter-submit form with localized checking, invalid feedback association, duplicate-submit lock and request-generation cancellation on edit/unmount. No pasted URL is fetched.

Validation: build71068 PASS22.64s;13codec/i18n tests PASS including2new link/malformed-link regressions. ../replay-input-check.cjs actual Daily browser PASS real link/rawdecode,Enter,error clear/association,pending lock,late edit/unmount rejection and3locale1366/390/320fit. Initial unmount test resolved before React committed unmount; corrected test waits for removal and PASS. Final site/docs83285 terminal PASS (4site tests). Seven unsealed .10.3 notes; next work full release regression/mobile gates toward roughly09:52UTC deploy.

## 2026-11-10 — Progress Explained release gates

v2026.11.10.3 has seven sealed player-facing notes, generated for the game, homepage and news page. Full regression suite: 354 files / 3177 tests PASS (478.92s). Final production build including app/functions TypeScript checks PASS; Vite 20.45s. Four sealed site synchronization tests PASS. Documentation check PASS, no stale systems. Required validation wrapper exited 1 on the known Windows npx/spawnSync launcher issue; direct gates provide the validation evidence. Final sealed mobile sweep is running in session90178; do not rebuild dist until it completes. No gameplay, balance, Power formula or save changes.

## 2026-11-10 — tablet update briefing gate correction

Initial sealed mobile gate session90178 failed only three tablet-landscape1024x768 target measurements: Full patch notes, Dev blog and Never show again (24px tall). Increased their module CSS minimum height to44px; added eighth release note and updated canonical pipeline/manifest docs. No behavior change. Rebuilt final artifacts: app/functions TypeScript plus Vite PASS11.63s; four site-sync tests and documentation check PASS. Full3177-test result remains applicable to unchanged behavior. Final mobile rerun session66791 uses progress-explained-mobile-final.log; wait for its terminal result before publishing.

Final sealed mobile rerun session66791 terminal PASS: 27 navigation screens and nine gameplay viewports, landscape drawers, portrait rotation/run contracts, overlap, clipping and target checks all clean. Ready to deploy eight sealed notes with the game and website.

## 2026-11-10 13:33 UTC — Progress Explained live

v2026.11.10.3 Progress Explained deployed at SHA8bca53e653f88178fe17a6f189133024a1e0760b. Actions42794604361 completed SUCCESS including the exact-SHA production guard. Normal custom-domain game/home/news/all8notes verified by ../verify-current-release.ps1; asset /assets/play-Ctdm4tfv.js matches the final local build and returns200. Initial immediate asset request returned404 during propagation; the same normal URL succeeded on retry. No outstanding release checks. Next approximate deployment14:33UTC; continuous improvement goal remains active.

## 2026-11-10 — keyboard-readable update briefings (local .10.4)

UpdateBriefing now claims focus on Continue only while visible, contains Tab across its actions and named scrolling note regions, consumes Escape as normal acknowledgement, and restores the connected opener on hide/unmount. Fresh baselines and mechanic-intro precedence remain unchanged. No balance, simulation, reward, Power or save-shape changes.

Verification: ../briefing-keyboard-check.cjs terminal PASS for initial/contained/restored focus, Escape/Continue/opt-out, keyboard note scrolling, intro/fresh precedence, unmount and action layouts at1366x768/1024x768/844x390/320x568. Screenshot ../briefing-keyboard.png reviewed: scrolling region focus visible, actions remain in view with large note backlog. Final app/functions TypeScript + build PASS10.26s;8patchNotes/site tests PASS;docs PASS. Required validation wrapper again exited1 with empty child-command output on its known Windows launcher path; detailed report preserved in briefing-keyboard-wrapper-report.log. Direct checks supply evidence; browser assertions do not prove every screen reader. One unsealed note in v2026.11.10.4 Clearer Briefings. Not deployed yet; next approximate deployment14:33UTC. All processes terminal; goal active.

## 2026-11-10 — keyboard-accessible unlock queues (local .10.4)

WhatsNew owns one focus session across sequential and batch introductions. Each single card has mechanic-specific dialog naming and identity, receives Got it focus, traps Tab and exposes its explanation to keyboard focus. Summary lists are focusable for native scrolling; Escape clicks the same acknowledgement action. Queue closure/unmount restores a connected original opener. Archive, navigation, guide dispatch, fanfare and specimen settlement logic unchanged.

Verification: ../unlock-keyboard-check.cjs terminal PASS on real components with fixture action boundaries: single/queued/batch focus, next-card focus, original-opener restoration, local Escape, guide dispatch order, one fanfare per card, batch specimen settlement, summary arrow scrolling, empty/unmount behavior. Settled screenshot ../unlock-keyboard.png reviewed (first capture was during entrance fade; recaptured after700ms). Final app/functions TypeScript and build PASS16.80s;42real mechanics/unlocks/guided/text/site tests PASS;docs PASS. Required audit wrapper exited1 on known Windows child-command launcher path; report preserved in unlock-keyboard-wrapper-report.log. Browser behavior checks do not prove all screen readers. Two unsealed .10.4 Clearer Briefings notes; not deployed. Next approximate deployment14:33UTC. All processes terminal; continuous goal active.

## 2026-11-10 — Field Manual reading navigation (local .10.4)

Help index selection now focuses its article, including the already-selected topic. Enter from search reads the current result; typing and empty-result Enter keep search focus. Back to topics focuses the current index entry, with search fallback. Related links keep clearing the query and focus their destination. Visible search guidance and44px Back control added. No ranking, unlocked-filter, game navigation or progression changes.

Validation: ../help-reading-check.cjs terminal PASS with real mechanics/search data: typing focus, Enter, index selection/current selection, Back, related-filter clearing, empty results, navigation dispatch and1366x768/844x390/390x844/320x568 article visibility/no overflow. Screenshot ../help-reading.png reviewed. App/functions typechecks + build PASS11.91s;18search/mechanics/text/site tests PASS;docs PASS;diff check clean. Three unsealed .10.4 notes. No release deployment yet; next approximate14:33UTC. Full release/mobile gates remain before publication. Known Windows validation-wrapper launcher limitation remains recorded in the preceding batch checks. All processes terminal, goal active.

## 2026-11-10 — readable tutorial transmissions (local .10.4)

Typewriter now uses live resolved OS/device motion preferences, including Allow motion. Reduced motion exposes the full sentence immediately; turning motion back on preserves completed text. The complete sentence is a stable visually clipped accessibility node; the animated copy is aria-hidden. Existing final-size reservation, click completion and28ms/capped reveal pacing remain. Listeners/timers clean up on unmount; lesson steps/rewards unchanged.

Validation: ../tutorial-text-check.cjs terminal PASS for one complete accessible sentence in Chrome AX tree, stable final layout, normal/same-text animation, live OS and preference changes/override, click completion and timer/unmount cleanup. Initial fixture advanced to a new lesson before the OS media-change event settled; waiting two animation frames before that independent scenario fixed the fixture. App/functions typechecks + build PASS8.29s;45motion/tutorial/gate/anchor/DIL/site tests PASS;docs PASS. DIL regeneration998nodes/1943edges. Screen-reader application behavior remains outside AX-tree verification. Four unsealed .10.4 notes; next approximate deployment14:33UTC after full release/mobile gates. All processes terminal; continuous goal active.

## 2026-11-10 — field-guide completion focus (local .10.4)

GuidedUnlock completion recovers lost/owned keyboard focus onto Stay here, describes the completion/reward from both actions, and handles Escape locally. Connected opener restoration is conditional on guide-owned/lost focus, preserving focus in separate real-action ceremonies. Completion width is viewport-capped; actions wrap and have44px minimum heights. No practice-click, grant, replay or navigation behavior changed.

Evidence: ../guide-completion-check.cjs baseline FAILED with focus falling to body after keyboard completion. Fixed browser run PASS completion focus/description, Escape/restore, repeated-guide reward display, Command Center navigation, real practice click once, separate ceremony focus preserved and1024x768/390x844/320x568/844x390fit. Screenshot ../guide-completion.png reviewed. App/functions TypeScript + build PASS10.71s;18guided/reward/anchor/site tests PASS;docs PASS. Five unsealed .10.4 Clearer Briefings notes. All processes terminal. Next work full release regression then sealed mobile/build/site checks for approximate14:33UTC deployment. Continuous goal active; prior live8bca53e6 unchanged.

## 2026-11-10 — Clearer Briefings release gates

v2026.11.10.4 Clearer Briefings: five sealed notes generated for game/home/news. Full regression suite session91942 terminal PASS354files/3177tests (323.86s). Final app/functions TypeScript and production build PASS16.25s;4sealed site-sync tests PASS;docs PASS. Mobile session35980 terminal CLEAN:27nav screens/nine gameplay viewports, landscape drawer, rotate/portrait run contracts, overlap/clipping/target gates. Required validation wrapper exited1 on its known Windows child-command launcher path; separate report clearer-briefings-wrapper-report.log retained and direct gate evidence recorded. Five focused browser probes passed earlier. No combat/balance/progression/save-shape changes. All processes terminal; ready to publish.

## 2026-11-10 14:20 UTC — Clearer Briefings live

v2026.11.10.4 Clearer Briefings deployed at SHAd1642e26c1bc1459e536c94c1beb6cdd97e4d1c6. Actions42832653336 SUCCESS including exact-SHA production guard. Normal custom-domain game/home/news/all5notes verified by ../verify-current-release.ps1; asset /assets/play-hhnWgeY7.js matches sealed local build and returns200. Initial check saw cached prior asset; same URLs passed after propagation. Full3177tests, final build16.25s,4site tests,docs and mobile27screens/9gameplay viewports PASS. No remaining release checks. Next approximate deployment15:20UTC. Continuous goal active.

## 2026-11-10 — live cutscene motion preferences (local .10.5)

CutscenePlayer now subscribes to resolved OS/device motion and flash preferences. Projector changes preserve scene/copy/reading clocks; resuming animation silently consumes elapsed reduced-mode sound beats and plays only future beats. Reduced mode remains a single still per scene/resize/coda change; coda dimming now applies in both modes. Preference subscriptions and animation frames clean up on unmount. Rewards, unlocks, scene durations and reading-mode controls unchanged.

Verification: ../cutscene-motion-check.cjs uses the real painter with traced frame specs and silent audio callbacks. PASS live OS/override/flash changes, stationary reduced mode, unchanged scene/copy, no elapsed sound burst, future cues once, next scene, resized painted still, coda, one finish and projector cleanup/focus restore. Initial fixture used an incomplete exact Next scene label (omitted arrow); corrected selector then PASS. Screenshot ../cutscene-motion.png reviewed. App/functions typechecks + build PASS8.84s;41cutscene/premiere/film/feel/site tests PASS;docs PASS;diff check clean. One unsealed note in v2026.11.10.5 Films That Follow You. Not deployed; next approximate15:20UTC. All processes terminal; continuous goal active.

## 2026-11-10 — live opening-cinematic preferences (local .10.5)

InitCutscene resolves OS/device motion/flashes live across pre-roll, film and dive. Animation resume consumes elapsed silent-mode beats without replay; scene/reading clocks stay intact. A reduced-motion request during the active descent completes once without the dive afterglow flag rather than freezing. Existing mark-seen and intro-playing lifecycle retained; subscriptions/projector clean up.

Evidence: ../intro-motion-check.cjs actual-renderer PASS live gate/film preferences, still resize, preserved scene/audio timing, reduced exit, reduction during dive, normal1.5s dive once despite repeated Escape, gate skip, focus return and cleanup. First fixture timed out waiting for the intentionally pulsing gate button to become stable; changed its activation to native keyboard Enter, then all scenarios PASS. App/functions TypeScript + build PASS13.69s;44intro/film/feel/cutscene/site tests PASS;docs PASS;diff check clean. Two unsealed .10.5 Films That Follow You notes; not deployed. Next approximate15:20UTC with full release/mobile gates. All processes terminal; continuous goal active.

## 2026-11-10 — preserve story films across hidden tabs (local .10.5)

CutscenePlayer pauses remaining scene/coda timeout while hidden, offsets current/previous film clocks on return, stops projector frames/SFX, and pauses caption CSS animations. Resume keeps the visible-time position and future beats; manual reading retains its existing timer behavior. Initially hidden mounts wait for visibility. Global music ownership/settings unchanged. Visibility listeners/timers/projector clean up.

Validation: ../cutscene-visibility-check.cjs terminal PASS with synthetic document.visibilitychange/hidden fixtures and the actual renderer: remaining scene hold, coda held beyond6.2s hidden, caption/projector freeze, no hidden or catch-up SFX, future cue, initial hidden mount and finish/cleanup. This verifies event-handler behavior, not OS-level tab switching. ../cutscene-motion-check.cjs re-PASS all live preference/scene/resize/coda checks after integration. App/functions typechecks + build PASS10.18s;41cutscene/premiere/film/feel/site tests PASS;docs PASS. Required wrapper exited1 on known Windows launcher path; report cutscene-visibility-wrapper-report.log preserved. Three unsealed .10.5 notes; next approximate15:20UTC deployment after full release/mobile gates. All processes terminal; goal active.

## 2026-11-10 — opening-film hidden-tab continuity (local .10.5)

InitCutscene pauses gate/film/dive projector and caption animations while hidden. Scene holds retain remaining time; resume offsets scene/previous/dive clocks rather than skipping ahead. Initially hidden gate does not render. A live reduced-motion request still safely completes a hidden dive with no afterglow. Global music and seen/once-only completion semantics unchanged.

Validation: ../intro-visibility-check.cjs actual renderer with synthetic visibility events PASS hidden initial gate, scene/caption/beat clock pause, remaining scene hold, paused dive resumes in place, completion/seen once, cleanup and reduced-motion exit during hidden dive. ../intro-motion-check.cjs re-PASS all live preference and normal/reduced exit scenarios. Tests cover visibility handlers rather than OS-level window switching. App/functions TypeScript + build PASS10.76s;44intro/film/feel/cutscene/site tests PASS;docs PASS;diff check clean. Four unsealed .10.5 Films That Follow You notes. All processes terminal; next full release regression/seal/build/mobile/site gates toward approximate15:20UTC deployment. Continuous goal active.

## 2026-11-10 — Films That Follow You release gates

v2026.11.10.5 Films That Follow You: four sealed notes generated for game/home/news. Full suite39809 terminal PASS354files/3177tests (324.57s). Final app/functions TypeScript + production build PASS8.17s;4sealed site tests PASS;docs PASS. Mobile94048 terminal CLEAN27nav screens/nine gameplay viewports, drawers, rotate/portrait run contracts, overlap/clipping/tap-target gates. Four focused browser probes passed, with real painters and synthetic visibility events. Required validation wrapper exited1 on documented Windows launcher path; separate films-release-wrapper-report.log retained. Direct gates provide evidence. No gameplay/balance/save-shape changes. All processes terminal; ready to publish.

## 2026-11-10 15:04 UTC — Films That Follow You live

v2026.11.10.5 deployed at SHA82998411c90caf74ec77d5c847e6bc1645b708a0. Actions42840127306 SUCCESS including exact-SHA production guard. ../verify-current-release.ps1 confirmed normal custom-domain game/home/news/all4notes; asset /assets/play-CXZtdME2.js matches final build and returns200. Initial cached prior entry resolved on same URLs after propagation. Full3177tests, build8.17s,4site tests,docs and mobile27screens/9gameplay viewports PASS. All release checks complete; next approximate deployment16:04UTC. Continuous goal active.

## 2026-11-10 — Memory Archive discovery (local .10.6)

Added revealed-copy search, All/Recovered/Unrecovered filters with pressed state and live count, explicit locked headings, automatic-passive explanation and 44px replay controls. Empty reset restores search focus. Replay/unlock/effects unchanged. Actual Chrome probe ../memory-archive-check.cjs PASS: hidden title concealment, trim/case, unlock hints, keyboard filters, empty reset/focus, replay returns focus/filter/music, desktop/390/320 fit and touch targets. Screenshot inspected. Build/app+functions TS PASS;21 cutscene/collection tests PASS;docs anchors/references/staleness PASS. New unsealed website note in .10.6. Full release/mobile gates remain before next approximate16:04UTC deploy.

## 2026-11-10 — accessible collection rank-up celebration (local .10.6)

Named modal, initial Continue focus, contained Tab/Shift+Tab, Escape dismissal and opener restoration; focusable scrollable promotion region keeps Continue visible on phone/landscape. Live OS/override motion preferences suppress scale/rotation without replaying the fanfare. No reward/power/save semantics changed. ../collection-rankup-check.cjs PASS actual component/renderer:24 promotions at1366x900/320x568/568x320, scroll by keyboard, modal focus/Escape/restore, live motion, single cue; screenshot inspected. Probe now explicitly focuses opener and waits resize frames. Initial release note category corrected to UX after compiler rejection. Initial UI gate caught raw100dvh; changed to var(--app-h), browser and34 collection/feel/UI/site tests re-PASS. App/functions TS+build PASS16.02s before final CSS-only app-height correction; final sealed build remains required. Docs PASS. Validation wrapper exit1 on known Windows launcher; rankup-wrapper-report.log preserved, direct checks used. Two unsealed website notes generated. No active processes; next release about16:04UTC.

## 2026-11-10 — collection keyboard navigation (local .10.6)

Linked tabs/panels with roving tab stop and ArrowLeft/Right/Home/End activation. Opening category focuses its heading; back restores the exact category tile. Switching wings clears detail without stale focus restoration. Back control44px minimum. ../collection-navigation-check.cjs PASS all keyboard/association/focus behaviors, 1366/390/320 fit and back target. Archive and rank-up probes re-PASS after panel integration. App/functions TS+production build PASS20.80s;34 collection/feel/UI/site tests PASS;docs anchors/references/staleness PASS;diff clean. Three unsealed website notes generated. No gameplay/save/balance changes. Full release/mobile gates pending next approximate16:04UTC deploy. All processes terminal; continuous goal active.

## 2026-11-10 — readable undiscovered collection entries (local .10.6)

EntryGrid now conceals tier-zero names in tooltips as well as visible copy, labels them Undiscovered entry, removes whole-card dimming, uses readable status text and wraps long names. Named list/listitems support assistive navigation. Discovered names/status/mastery and progression unchanged. ../collection-entry-check.cjs PASS all29categories:1162hidden/24revealed entries, exact status/mastery retention, no name leaks, no overflow at390/320. Production build/app+functions TS PASS16.95s;21collection/UI/site tests PASS. Fourth unsealed website note generated. Full release regression is RUNNING session45035 in collection-release-tests.log; poll existing handle. Mobile/final sealed build/live release gates remain. Continuous goal active.

## 2026-11-10 — collection release regression checkpoint

v2026.11.10.6 Memories Within Reach now has four sealed notes generated for game/home/news. Full suite45035 terminal PASS354files/3177tests (430.11s). Final app/functions TS+build PASS24.20s;4sealed site tests PASS. Four focused browser probes PASS archive/rank-up/navigation/all29category entry states. Required validation wrapper still exits1 on known Windows launcher path; collection-release-wrapper-report.log preserved, direct gates used. MOBILE98307 RUNNING on final dist in collection-release-mobile.log; no rebuild until terminal. Docs12576 finishing. No deployment yet; exact-SHA workflow/live checks follow mobile. Continuous goal active.

## 2026-11-10 — release mobile finding and console target fix

Mobile98307 terminal exit1: only violation Settings tablet1024x768 input119x24. Inspected optional MusicDebug: both boss-name input and slider helper had inline minHeight24; raised both to44. No audio/control logic changed. ../music-console-target-check.cjs actual component PASS at1024/844/568 widths, all input heights44, widths120, no page overflow, boss name editing and keyboard range endpoints. Fifth sealed website note generated. Final build/tests/docs RUNNING session75574, collection-final-build.log. Full3177suite passed before this two-style-value change; full mobile rerun required after rebuilt dist is ready. No deployment yet. Goal remains active.

## 2026-11-10 — Memories Within Reach final release gates

Five sealed notes. Full354files/3177tests PASS430.11s before two inline MusicDebug height values changed24→44. Actual console browser probe PASS sizes/edit/keyboard across3widths. Final app/functions TS+build26.02s PASS;11UI/site tests anddocs PASS. Mobile80163 terminal CLEAN27navigation screens and9gameplay viewports, drawers, rotation, portrait/landscape contracts, no clipping/overflow/sub24targets. Prior mobile98307 failed one optional debug input; final run verifies correction. Four collection browser probes previously PASS. Required wrapper failure documented with preserved report; direct release gates PASS. Final asset /assets/play-CEgN7IqO.js. Ready to publish; exact-SHA Actions/live verification next. All local processes terminal.

## 2026-11-10 15:53 UTC — Memories Within Reach live

LIVE v2026.11.10.6 Memories Within Reach, five sealed notes. SHA7f18a4f7fe74450f26650da823b789ce5bb4468d; Actions42848792447 SUCCESS including exact-SHA production guard. Normal public game/home/news/all5notes verified 2026-11-10 15:53 UTC; asset /assets/play-CEgN7IqO.js matches final build and returns200. Full3177tests PASS before two inline console target heights; final build26.02s,11UI/site tests,docs and mobile27screens/9gameplay viewports PASS. All processes terminal. Continuous goal active. Next approximate deployment16:53 UTC.

## 2026-11-10 — truthful backup feedback and failure safety (local .10.7)

SaveStore.set now returns write success privately; ordinary save callers retain prior behavior. backup rejects absent/corrupt current blobs, returns null on snapshot/index write failure, publishes the new index before pruning, and cleans an unlisted new snapshot on index failure. Older snapshots remain unchanged. SaveManager reports success only for a backup result, offers Export JSON after failure, and uses a persistent status region. No schema/checksum/cap/gameplay changes; migration not needed. Three new fault/corruption tests FAILED on baseline and PASS after fix, covering ring preservation, restoreability and retries. All50save/site tests PASS, production app/functions TS+build13.84s PASS, docs PASS, ../backup-feedback-check.cjs actual UI PASS keyboard/success/failure/export/preserved list/1024-390-320 fit. Required wrapper exit1 known Windows launcher; backup-wrapper-report.log preserved, direct checks used. One unsealed .10.7 website note generated. All processes terminal; next approximate16:53UTC release. Goal active.

## 2026-11-10 — recoverable, confirmed backup restoration (local .10.7)

SaveManager uses a dated native confirmation before restore, uniquely labels each Restore button, refreshes the backup list and announces truthful results. SaveStore preloads selected data, preserves readable current progress via backup, protects the selected source from pruning even in a full ring, and reports success only after main write succeeds. Safety-backup failure stops restore; corrupt/absent main data can still be repaired. Schema/cap/gameplay unchanged. Three restore assertions failed on baseline;29saveStore tests now PASS including undo snapshot, failure preservation, full-ring oldest-target retry and corrupt-main repair. All53save/site tests, app/functions TS+build16.56s anddocs PASS. ../restore-feedback-check.cjs actual UI PASS dated labels/native keyboard confirmation/cancel-no-mutation/accept-once/error/success/list/focus/phone fit; ../backup-feedback-check.cjs re-PASS. Initial probe selected the newly inserted first row for focus; corrected to original dated button. Required wrapper exit1 known Windows launcher; restore-wrapper-report.log preserved. Two unsealed website notes generated. All processes terminal; next approximate16:53UTC release; goal active.

## 2026-11-10 — review before importing save files (local .10.7)

SaveManager reads/validates with existing file helper/parser into a cancellable review showing filename and sanitized currency/wave/run totals. Explicit Replace progress applies via existing importText; Cancel/Escape leave progress untouched. Heading focus, return focus,44px actions, long-name wrapping, reading status and epoch-based late-read rejection added. Invalid/unreadable files never invoke import. Failed apply retains preview for retry. Corrected misleading no-account copy. ../import-preview-check.cjs PASS real FileReader/parser plus controlled out-of-order callbacks, invalid/read errors, same-file reselect, heading/Escape/cancel/focus, explicit apply/retry,320px long filename/targets. Phone screenshot inspected. Backup and restore UI probes re-PASS. App/functions TS+build14.44s,60save/UI/site tests anddocs PASS. Third unsealed website note generated. Confirmed import still uses prior persistence method; durable failure handling remains next. All processes terminal; goal active.

## 2026-11-10 — commit confirmed imports before session replacement (local .10.7)

Baseline actual-browser fault probe showed snapshot/index failures still applied imports and main-write failure changed session while disk stayed old, all claiming success. SaveStore.importSave now snapshots supplied live current state via shared private writeBackup, then commits incoming data. meta.importText retains strict guard/parser, rejects stale tabs, enriches gear discovery, and only after storage success cancels pending flush, notes clock/stamps writer and publishes store.set. Ordinary persist unchanged. Added4storage cases plus3meta integration tests. ../import-storage-check.cjs PASS real meta/Storage failures at3stages, same memory/disk on failure, stale-tab no-write, durable-before-subscriber, live pending-state recovery and canceled old300ms flush. Build app/functions TS+Vite23.79s PASS;104save/meta/discovery/site tests PASS;docs PASS. Required wrapper exit1 known Windows launcher; import-storage-wrapper-report.log preserved. Fourth unsealed website note generated. All processes terminal; next approximate16:53UTC release, full goal active.

## 2026-11-10 — live-state and tab-safe restore integration (local .10.7)

Two baseline tests reproduced stale-tab restore and recovery snapshot missing pending live progress. meta.restoreBackup now rejects stale tabs before storage, passes store.get() into SaveStore.restoreBackup, and uses shared publishSaveReplacement with imports. Successful committed replacements clear old flush/note clock/stamp writer before notifying; failed paths preserve session/flush. Headless restore callers keep readable disk fallback. Both tests PASS;78targeted tests then102save/meta/site tests PASS; app/functions TS+build20.09s PASS. ../restore-storage-check.cjs actual browser PASS3write failure stages, stale-tab no mutations, durable-before-notify, writer stamp, live recovery and old-flush cancellation; ../import-storage-check.cjs re-PASS shared helper. Required wrapper exit1 known Windows launcher; restore-live-wrapper-report.log retained. Fifth unsealed note generated. FULL REGRESSION26406 RUNNING in save-release-tests.log; docs15424 finishing. Do not restart running handles. Release seal/final build/mobile/live gates next; goal active.

## 2026-11-10 — Progress You Can Trust release checkpoint

Five sealed notes generated for game/home/news. Full suite26406 terminal PASS354files/3192tests454.39s. Final app/functions TS+build22.72s,4sealed site tests anddocs PASS (26535 terminal). Actual browser probes cover save UI previews/confirmations/focus/phone fit plus storage failure stages, tab ownership, live recovery and pending flush handling. Required wrapper exit1 known Windows launcher; save-release-wrapper-report.log preserved; direct gates supply evidence. MOBILE34331 RUNNING on final dist in save-release-mobile.log; do not rebuild until it completes. Source batch complete, no deployment yet. All other processes terminal. Goal remains active.

## 2026-11-10 — Progress You Can Trust ready to publish

Five sealed notes. Full354files/3192tests PASS454.39s; final app/functions TS+build22.72s,4site tests anddocs PASS. Mobile34331 terminal CLEAN27nav screens and9gameplay viewports, drawers/rotation/portrait+landscape/run-chrome contracts, no clipping/overflow/sub24targets. Focused save UI and real-storage browser probes PASS fault injection, confirmation/cancel, preview races, focus, tab ownership, latest-state recovery and flush cancellation. Required wrapper limitation documented with save-release-wrapper-report.log; direct gates PASS. Final asset /assets/play-D1KgKJPZ.js. Source/schema/gameplay unchanged since final gates. All local processes terminal; publishing next.

## 2026-11-10 16:41 UTC — Progress You Can Trust live

LIVE v2026.11.10.7 Progress You Can Trust with five sealed website notes. SHAb441f62cf0512d7da5c8d0692d53d3927fead962; Actions42856634182 SUCCESS including exact-SHA production guard. Normal custom-domain game/home/news/all5notes verified 2026-11-10 16:41 UTC; asset /assets/play-D1KgKJPZ.js matches final build and returns200. Initial cached prior entry resolved on same URLs after20s. Full3192tests/354files PASS454.39s; final build22.72s,4site tests,docs and mobile27screens/9gameplay viewports PASS. All processes terminal. Continuous goal active. Next approximate deployment17:41 UTC.


## 2026-11-10 16:57 UTC — wave briefing checkpoint

LIVE remains v2026.11.10.7, SHA b441f62cf0512d7da5c8d0692d53d3927fead962, verified normal game/home/news with five notes. LOCAL .8 Know What Is Coming has one generated website note. Incoming-wave reward/enemy/adaptation chips now open a readable detail region outside the mobile scroller. Base Biomass/HP/armor and inclusive elite counts are explicit. Keyboard opening, Escape/Close restoration, preview-change dismissal, reading-key isolation, phone/landscape geometry and real-game launch/inert behavior pass the isolated Chrome probe. No core, balance or save changes. Continuous goal remains active.

Poll existing handles, never restart on observation timeout: final production build21016 (wave-briefing-release-build.log); full regression suite77517 (wave-briefing-full-tests.log); browser probe60232 printed PASS but Chrome shutdown was still live at last poll. Earlier builds90994 and19517 succeeded; latter predates final reading-key isolation.13 registry/site tests and docs check PASS. After final build completes, run mobilecheck against its dist, then continue improvements toward approximate17:41 UTC deployment. .8 remains unsealed; regenerate/build if further changes. Existing Windows validate wrapper launcher failure reproduced (wave-briefing-wrapper-report.log); direct gates required. Do not stage the two untracked devlog drafts.

Canonical HUD.md and manifest updated. READABILITY and REWARD-PRESENTATION require no changes: no reward flow, thresholds, mechanics or tutorial step changed. Chronicle pipeline unchanged; curated note generated. Baseline mobile bubble extended above its scrollport (top -194.75 vs scrollport top131); replacement region fits 320/390 portrait and844x390 landscape. Screenshot ../wave-briefing-phone.png inspected. No new src files.


## 2026-11-10 17:06 UTC — integrated wave details

Full3192tests/354files PASS321.95s (77517 terminal). Build21016 PASS10.40s. Mobile94526 CLEAN27nav/9gameplay viewports (terminal), predating last CSS-only constraint. Actual GameView probe found 320x568 clipping: detail bottom509 exceeded canvas bottom440. BuildControls max-height now subtracts controls strip, bar does not shrink, details shrink/scroll. Full-game campaign probe passes 390x844,320x568,844x390,1280x800 geometry, End scrolling, Escape focus restoration and Space isolation; latest10106 terminalPASS. Two original fixture failures were from endless mode intentionally lacking previews; campaign uses actual preview. Screenshot ../wave-briefing-game-phone.png inspected: final sticky44px close header remains visible but leaves only about20px of reading height at320x568. This is a remaining usability issue: refine details presentation before release, preserving full-text scrolling, accessible Close/Escape and existing Start Wave behavior. No core changes; website note remains unsealed .8.

Next: improve 320x568 detail reading area (sticky header currently consumes most of83px region). Consider using more of the existing briefing area while details are open, rather than squeezing text below all launch controls; verify in actual GameView with ../wave-briefing-game-check.cjs. Final CSS build22763 terminal PASS11.88s (wave-briefing-constrained-build.log). Local Vite95476 stopped intentionally; browser10106 terminal. All earlier handles terminal. After any final layout change run the real-game probe, build and mobile gate on final dist. Fullsuite3192 and13registry/site tests already pass; repeat only when justified by later code changes. Next approx deployment17:41UTC; live .7 remains verified. Do not stage two untracked devlog drafts.


## 2026-11-10 17:12 UTC — readable compact wave details

LIVE .7 remains SHA b441f62cf0512d7da5c8d0692d53d3927fead962 with five verified notes. LOCAL unsealed .8 Know What Is Coming has one generated website note for readable wave intel and explicit base stats/rewards. Final phone refinement now hides only the compact intel row while details are open, preserves launch controls, and restores focus after the row reappears. Short/long elite-probe explanations pass actual GameView at390x844,320x568,844x390,1280x800; no clipping, keyboard End reaches text, Close stays44px/visible, reading does not dispatch Space, Escape restores chip focus. Screenshots inspected: ../wave-briefing-game-phone.png and ../wave-briefing-long-phone.png. The prior20px reading-area issue is RESOLVED. Build38551 PASS12.07s. No core/balance/save changes.

Current live handle: final mobile99756 (wave-briefing-reading-mobile.log), run against final reading-layout dist; poll same handle. Docs96417 terminal PASS (anchors/references/staleness). All browser probes and devserver76491 terminal. Fullsuite3192/354files passed321.95s before final UI-only focus/layout refinements; targeted browser checks cover these refinements. Previous mobile94526 passed27nav/9gameplay but predates refinement; final99756 is authoritative.13site/registry tests passed earlier; website artifacts unchanged this turn. Continue useful improvements while respecting active mobilecheck dist (do not overwrite dist). Approx next deployment17:41UTC; seal/regenerate/build/test finalrelease when due. One next read-only investigation: Hud.tsx doctrine/vow/threat chips are title-only and mention docs/*.md, so phone explanation/accessibility may be improvable; do not assume a functional defect without probing. Do not stage untracked devlog drafts.


## 2026-11-10 17:21 UTC — run conditions checkpoint

LIVE remains .7 SHA b441f62cf0512d7da5c8d0692d53d3927fead962. LOCAL .8 Know What Is Coming now has two generated website notes: readable/base-value wave intel and accessible Run conditions. BuildPanel native44px disclosure lists existing selected doctrine, run-captured vows, active Threat rungs, biome/hazard, run identity and current event. GameView passes doctrine and vow blurb alongside existing name/icon (same Daily/tutorial exclusions); no simulation/state/schema changes. Empty conditions are omitted and obsolete event/hazard text disappears while expanded state survives refresh. Summary/reading keys cannot trigger battlefield shortcuts; Escape retains normal propagation. HUD titles no longer display internal docs paths. Existing Active Effects empty message no longer claims there are no run modifiers.

Actual GameView ../run-conditions-check.cjs PASS on1280x800,390x844,320x568,844x390: real Glass Doctrine, Vows of Flesh/Haste, only Threat1–3; Space disclosure does not launch wave;44px target; drawer scroll/width. ../run-conditions-state-check.cjs PASS neutral omission, live biome/hazard/event descriptions, stale removal and expanded-state preservation. Screenshot ../run-conditions-phone.png inspected. Earlier final wave-only mobile99756 CLEAN27nav/9gameplay, terminal. Combined build39830 PASS11.67s; docs21518 PASS; validation wrapper known Windows launch failure recorded in run-conditions-wrapper-report.log. All Chrome/dev sessions terminal.

Poll fullsuite45403 (run-conditions-full-tests.log) and combined-release mobile59105 (run-conditions-mobile.log). Do not overwrite dist while mobilecheck runs. After gates pass, prepare hourly release around17:35–17:41UTC: seal .8, regenerate site, finalbuild and site-sync test, preserve generated handoff judgments, commit/push authorized production ref and verify Actions exactSHA plus normal custom-domain game/home/news/all2notes. No further source changes required for the two current notes unless validation finds a defect. Do not stage two untracked devlog drafts.

HUD.md/manifest updated. No mechanic/tutorial/reward changes: READABILITY, REWARD-PRESENTATION, help, save and Power documentation need no revision. Chronicle mechanics unchanged; two curated notes generated.


## 2026-11-10 17:33 UTC — sealed intel release gates

Preparing sealed v2026.11.10.8 Know What Is Coming with two website notes (wave intel and Run conditions). Live remains .7 SHA b441f62cf0512d7da5c8d0692d53d3927fead962; remote production branch rechecked unchanged. Full regression45403 terminal PASS3192tests/354files332.80s.4sealed site-sync tests PASS; docs21518PASS; combined pre-seal build39830PASS11.67s. Final sealed build86377 is running (intel-release-final-build.log).

Combined mobile59105 terminated with waitForDrawerClosed timeout5000ms in landscapeRailWalk; no passing claim for that run. No gate or production-code changes were made to bypass it. Diagnostic52251 on the SAME unchanged dist passed all27nav screens across844x390,926x428,844x340,915x356 and gameplay/tutorial checks (intel-drawer-diagnostic.log). Failure did not reproduce; root cause remains unproven. Final original full mobile gate must be rerun after sealed build completes. Earlier99756 mobile PASS covers final wave-reading layout before Run conditions. All focused wave/conditions probes pass and screenshots inspected.

Poll final build86377, then run original full mobilecheck --no-build on final dist (with Chrome compatibility shim); do not overwrite dist while it runs. Only after PASS: record all final evidence, branch-check/add-u/chore(release)commit; push origin HEAD:refs/heads/claude/zen-hawking-rh1gxl (remote expected b441f62c), monitor Actions exactSHA production guard, run ../verify-current-release.ps1 against normal URLs, record liveSHA/asset/job/time. Do not stage two devlog drafts. Deployment remains authorized; no user confirmation needed. Continuous goal remains active.

## 2026-11-10 17:34 UTC — final sealed build

Final sealed build86377 terminal PASS11.83s (intel-release-final-build.log). Original full mobile retry20386 is live against that exact dist (intel-release-mobile-final.log). Poll same handle; do not rebuild or overwrite dist. After success, record result and deploy sealed .8 through the authorized production branch, then verify workflow exactSHA and normal custom-domain game/home/news/all2notes. No other processes active.

## 2026-11-10 17:40 UTC — final intel release gates passed

Release .8 Know What Is Coming is ready to deploy with two sealed notes. Full3192tests/354files PASS332.80s; final sealed build86377 PASS11.83s;4site tests and docsPASS. Final ORIGINAL full mobile20386 PASS27nav/9gameplay viewports, including landscape drawer, rotation, tutorial, phone run and run-chrome contracts. Earlier mobile59105 drawer-close timeout did not reproduce in unchanged-build focused diagnostic52251 or final full retry20386; no gate weakened and no code changed to bypass it. All local task processes terminal. Deploy authorized production ref and verify exactSHA workflow + normal custom-domain game/home/news/all2notes.

## 2026-11-10 17:42 UTC — verified live intel release

LIVE v2026.11.10.8 Know What Is Coming with two sealed website notes. SHA8950ec0d44d7f3959d988c4e6460b42f0a468ca0; Actions42867374482/job130009207291 SUCCESS, including exact-commit production verification. Normal custom-domain game/home/news/all2notes verified2026-11-10 17:42UTC; asset /assets/play-jTgwUWdh.js matches final build and returns200. Initial cached .7 entry resolved after20s on the same URLs. Full3192tests/354files PASS332.80s; finalbuild11.83s;4site tests/docsPASS; final original mobile27nav/9gameplay PASS. Earlier drawer timeout was not reproduced by focused four-landscape diagnostic or final full retry; recorded in validation history. All task processes terminal.

Continue active playability/clarity/accessibility/presentation goal with a new unsealed release; next approximate deployment18:42UTC. No live process handles. Read-only next candidate: BuildPanel BondsSection uses non-focusable span.tt chips for bond effects; investigate keyboard/touch access and scroll clipping before changing it. The new Run conditions disclosure is separate and verified. Do not stage two untracked devlog drafts; keep production pushes explicit to claude/zen-hawking-rh1gxl. Current liveSHA8950ec0d,assetplay-jTgwUWdh.js.


## 2026-11-10 17:55 UTC — readable and accurate bond effects

LIVE .8 Know What Is Coming remains SHA8950ec0d44d7f3959d988c4e6460b42f0a468ca0, verified17:42UTC. LOCAL unsealed .9 Read Your Build has two generated website notes. BuildPanel class-bond chips are now native44px disclosures with keyboard/touch access, current tier/unit accessible names, in-flow explanations and reading-key isolation. Baseline Tab skipped old span.tt chips (tabIndex-1); new disclosures pass. Daily display bug proven in actual GameView: account Kinetic4 showed+13% while run used level0/+10%. HUD bond snapshot now carries resolved level, and BuildPanel reads it instead of meta.bondLevels. Normal run remains+13%, Daily now+10%; no bond fold, combat, reward or save changes.

25 classBonds/site/registry tests PASS, including2new checks comparing displayed run level/effect with actual simulation bond factor. ../bond-details-check.cjs PASS keyboard/tap, live tier/threshold updates, max tier, empty prompt,4viewport widths; ../bond-details-game-check.cjs PASS actual320px game, hero+paid tower placement, tier1 atlevel4, retained reading and keyboard isolation; ../bond-daily-value-check.cjs failed baseline on wrong effect and nowPASS normalized Daily. Screenshot ../bond-details-game-phone.png inspected. Initial full-game fixture race from late orientation change corrected by mounting portrait and stepping simulation after placement; first Daily fixture used invalid boolean, corrected to actual modifierIds/towerPool object. All probes and devserver5885 terminal. Earlier accessibility-only build90330 PASS11.14s predates snapshot fix; not final. Wrapper audit82524 terminal reproduced known Windows npx launcher failure; report saved bond-daily-wrapper-report.log.

Poll existing handles: final current build24359 (bond-daily-build.log); fullsuite30801 (bond-daily-full-tests.log); docs23726 (bond-daily-docs.log). Do not restart on observation timeout. After build completes, run final mobile layout gate against dist; fullsuite expected3194tests/354files if allpass. Resolve failures, then continue next batch toward approx18:42UTC deployment. .9 remains unsealed with2notes. Canonical CLASS-BONDS.md/HUD.md and manifest updated. No mechanic/tutorial change; no save migration needed. Do not stage two untracked devlog drafts. Possible next read-only candidate: Gene Card chips in BuildPanel remain tt-bubble explanations in the scrollable drawer; test touch/keyboard clipping before changing.

Final bond build checkpoint: Build24359 terminal PASS18.69s; docs23726 terminalPASS. Fullsuite30801 remains live (bond-daily-full-tests.log). Poll it first, then run mobilecheck against current dist; avoid overlapping the heavy checks where possible. All other task processes terminal. Two .9 notes remain unsealed; live .8 unchanged.


## 2026-11-10 18:03 UTC — readable drafted genes

Live: v2026.11.10.8 Know What Is Coming, SHA8950ec0d44d7f3959d988c4e6460b42f0a468ca0, Actions42867374482 SUCCESS, asset /assets/play-jTgwUWdh.js; normal game/home/news verified17:42UTC. Local: unsealed .9 Read Your Build with three generated website notes. Bond and drafted-Gene Card chips are native44px disclosures with in-flow explanations, keyboard/touch access and safe reading keys. HUD bond snapshots carry the run-resolved level so Daily descriptions show actual base strength. Gameplay/balance/save behavior is unchanged. Continuous goal active; next approximate deployment18:42UTC.

Full regression30801 terminal PASS3194tests/354files356.10s. Final current build53780 PASS8.93s (gene-details-build.log); docs2263 PASS;11site/UI-standard tests PASS. Earlier25bond/site/registry tests PASS including2new simulation-vs-display checks. Focused browser probes all terminalPASS: ../bond-details-check.cjs, ../bond-details-game-check.cjs, ../bond-daily-value-check.cjs, ../gene-details-check.cjs, ../gene-details-game-check.cjs. Actual phone screenshots inspected. Baselines: Tab skipped bond span.tt chips; Daily accountlevel4 displayed+13% while the run applied+10%; gene tooltip outside overflow:hidden chip (bubble103..155 vs chip158..181). These are fixed. Native disclosures preserve expanded state during live count/tier changes; repeated genes label descriptions Per copy. Real GameView probe drafted actual cards and confirmed descriptions/counts and phone portrait/landscape bounds.

Only active handle: mobile99507, read-build-mobile.log, running original full mobilecheck --no-build against current dist. Poll SAME handle; never restart because observation timed out. Do not overwrite dist while it runs. After PASS, continue scoped improvements until the approximate18:42UTC release, or prepare deployment if due. Seal/regenerate/build/site-sync-test final release, record gates, then push authorized ref and verify Actions exactSHA plus normal URLs. Do not claim pending mobile passed.


## 2026-11-10 18:16 UTC — HUD explanation placement (local)

Unsealed Read Your Build now has four website notes. CSS-only HUD explanations open below readouts with inward edge alignment and active stacking above run controls. Baseline negative top coordinates and an intermediate toolbar occlusion were reproduced; final keyboard GameView probe39136 passed four viewport sizes, and the phone screenshot was inspected. Eleven site/UI-standard tests38320 and docs check passed. Prior three-note mobile99507 completed CLEAN (27 nav +9 gameplay profiles); final build39671 passed10.42s; original updated mobile30430 is running, hud-tooltip-mobile.log. No balance/save changes. Live remains .8; next approximate deployment18:42UTC.


## 2026-11-10 18:20 UTC — HUD reading keys (local)

Reproduced Space on focused Core explanation starting a wave. GameView now consumes that key for HUD cells; real browser probe1764 passed Core/Power/Biomass reading, Hero Console activation and normal board Space wave start. Added fifth website note and canonical HUD documentation. Eleven site/UI tests78230 and docs38229 passed. Typecheck96986 and prior-build mobile30430 are still running; no dist overwrite while mobile owns it. Gameplay simulation unchanged.


## 2026-11-10 18:23 UTC — Release sealed; mobile failure under investigation

Sealed v2026.11.10.9 Read Your Build with five website notes; regenerated site, four siteSync tests passed552ms. Latest typecheck96986 terminalPASS. Original mobile30430 terminalFAIL at waitForDrawerClosed (5000ms) in landscapeRailWalk, repeating prior .8 failure signature; root cause unproven. Unchanged-build diagnostic81740 is active, preserves original assertions/timeouts and captures drawer state on failure. Do not overwrite dist while it runs. Final five-note release build and original full mobile gate remain pending. Remote production branch checked and remains8950ec0d.


## 2026-11-10 18:29 UTC — Final release build; full mobile gate active

Unchanged-build drawer diagnostic81740 terminalPASS:27nav screens and gameplay checks across four landscape profiles. Earlier original mobile30430 drawer timeout remains an unexplained failure, not erased by this result. Final sealed five-note build20300 terminalPASS21.92s (read-build-final-build.log, SWmwb0wbmg). Original complete mobile72320 now running against final dist (read-build-final-mobile.log); do not overwrite dist or start competing heavy checks. Live remains .8, next approximate deploy18:42UTC.


## 2026-11-10 18:35 UTC — Read Your Build ready for deployment

Final ORIGINAL mobile72320 terminalPASS:27nav screens and nine gameplay profiles, no overflow/clipping/target/run-chrome violations. Final build20300 PASS21.92s, prior full suite3194tests/354files PASS, typecheck/docs/focused browser and sealed siteSync checks PASS. Earlier mobile30430 drawer timeout remains documented; unchanged-build diagnostic81740 passed and no gate was weakened. Sealed .9 contains five website notes and is ready for authorized deployment; production verification still pending.


## 2026-11-10 18:38 UTC — Read Your Build LIVE

Deployed SHA48b2f2a81ac463b53708ffcc2aab5b11f7f7cfdc. Actions42876793393/job130042106520 SUCCESS including exact-commit production guard. Normal custom-domain game, homepage, news, all five notes and asset verified by verify-current-release.ps1; asset /assets/play-7JbVGzDZ.js. Final original mobile72320 PASS27nav+nine gameplay layouts. Release v2026.11.10.9 Read Your Build is live. Goal remains active; next approximate deployment19:38UTC.


## 2026-11-10 18:47 UTC — Automation help (local .10)

Added44px help beside Auto Wave/Auto Gene using existing bounded briefing reader. It exposes waiting, gate reason, Hive management and manual draft override without changing settings. Live state updates and safe reading/focus behavior verified. Initial compact label overflow fixed with wrapping; final real GameView unlocked85873 and locked32996 passed four viewport sizes, screenshots inspected. Standalone state probe passed; eleven site/UI tests1292 and docs70306 passed. Final build78237 is running; original full mobile check remains pending. One generated website note in unsealed v2026.11.10.10 Know Your Controls. Live remains .9; next approximate deploy19:38UTC.


## 2026-11-10 18:49 UTC — Automation help build passed; mobile running

Final build78237 terminalPASS16.19s (automation-help-final-build.log, SWmwb1m0tw). Original full mobile53228 started against that exact dist, automation-help-mobile.log; do not overwrite dist or run competing heavy checks while pending. Worktree source unchanged this turn. Next possible inspection: Pause seemed partly cut off in320x568 locked-profile screenshot, but no runtime bounds evidence yet; do not infer a confirmed bug. Live remains .9, local .10 has one note.


## 2026-11-10 18:57 UTC — Automation mobile passed; narrow Pause reviewed

Original full mobile53228 terminalPASS27nav+nine gameplay profiles. Focused run-controls probe88649 PASS320x568/390x844/844x390: all controls inside viewport and hit-testable, Pause opens and documented P resumes. Screenshots inspected. No Pause clipping reproduced; no source change justified. Earlier39716 probe wrongly assumed Escape resumes; corrected to documented P. Fixed landscape controls are not clipped by board ancestor despite naive geometry flags. Local .10 automation help now has passing build/docs/tests/browser/mobile checks; live .9 unchanged. Next approximate deployment19:38UTC.


## 2026-11-10 19:02 UTC — Early Call reachable on narrow phones

Real mid-wave baseline47721: Early Call at320x568 spanned x=-43.45..18.70, offscreen and not hit-testable. CSS-only portrait<=380px second-row layout reserves canvas padding; current probe14282 PASS three viewports, all control hit tests/Pause and actual wave1->2 plus displayed23Biomass reward. Screenshot inspected; no battlefield overlap. Initial probe17322 incorrectly advanced3.2s in one clamped call, corrected to normal-sized steps. Eleven site/UI tests2738 and docs72656 PASS. Build11357 running, early-call-layout-build.log; updated full mobile pending. Second note generated in local unsealed .10 Know Your Controls. No balance/save/action changes.


## 2026-11-10 19:16 UTC — World Status live motion preferences

Early Call build11357 PASS23.95s and original full mobile10866 terminalPASS27nav+nine profiles. New WorldStatus baseline confirmed57frames/second after OS reduced motion enabled. Fixed media/pref subscriptions, still account/resize redraw, pixel-stable spores, visibility/cleanup. Final browser18462 terminalPASS all cases; still screenshot inspected. Eleven site/UI tests62654 and docs PASS. Initial build82064 failed unsupported Accessibility note category; corrected to existing UI/regenerated. Final build93090 RUNNING, world-status-motion-final-build.log. Local .10 now three notes, unsealed; updated mobile pending. No simulation/save changes.


## 2026-11-10 19:20 UTC — Know Your Controls sealed; final mobile running

Corrected-category build93090 PASS16.32s. Sealed .10 three notes and generated website; four siteSync tests PASS657ms. Final build63376 PASS17.35s, SWmwb2p9ip. Final review corrected automation close label; focused2045 PASS and built GameView-C8pzR7tP.js explicitly contains Close automation help. Original full mobile51961 is RUNNING, controls-release-mobile.log; keep dist fixed/no competing heavy checks. Remote production checked, still48b2f2a8. Live unchanged; deploy after final gate near19:38UTC.


## 2026-11-10 19:27 UTC — Know Your Controls ready to publish

Final ORIGINAL mobile51961 terminalPASS27nav+nine gameplay profiles on sealed build63376 (17.35s, SWmwb2p9ip). Focused automation/early-call/motion checks, docs, eleven UI-site and four sealed siteSync tests passed. All handles terminal. Three notes ready; production verification pending authorized push. No balance/save changes.


## 2026-11-10 19:30 UTC — Know Your Controls LIVE

Deployed SHA2400521c2dbf87dda58e5e9f5d161fb4800e6cd2. Actions42885435823/job130072400258 SUCCESS including exact-commit production guard. verify-current-release.ps1 passed NORMAL custom-domain game/home/news/all THREE notes/entry asset; /assets/play-DLqe10Zs.js. Final original mobile51961 passed27nav+nine gameplay profiles. Live v2026.11.10.10 Know Your Controls. Goal remains active; next approximate deployment20:30UTC.


## 2026-11-10 19:37 UTC — Infestation live motion controls (local .11)

Baseline20669 measured57frames/sec after reduced motion enabled. InfestationBoard now subscribes to OS/shared preferences, resizes still canvas via ResizeObserver and cancels RAF while hidden. Expanded browser68906 PASS motion/override, backing dimensions,16sector targets, pin action, hidden-document lifecycle, collapse/reopen and cleanup; still screenshot inspected. Initial fixture counted wrong drawing API; another used a too-short fixed resume delay; corrected before final pass. Eleven UI/site tests10221 and docs28515 PASS. Build84198 PASS12.89s (SWmwb3bmh4). Original full mobile93548 RUNNING, infestation-motion-mobile.log; no dist writes/competing heavy checks. One note generated in unsealed .11 Map Motion Controls. No simulation/save changes.


## 2026-11-10 19:46 UTC — Infestation feed selection accessibility

Original motion mobile93548 terminalPASS27nav+nine gameplay profiles. Feed buttons now expose actual selected state and full region names; region-resolved sector markers are identified as next feed rather than direct pins. Real browser keyboard/click probe passed region selection, direct pin, toggle off and Spread. Docs check and eleven UI/site tests PASS6.02s. Build63586 PASS (Vite8.87s, SWmwb3o18o), infestation-selection-build.log. Mobile coverage predates the ARIA/label-only follow-up; final release gate pending. Two notes generated in unsealed .11 Map Motion Controls. No simulation/save changes. Live remains .10; next approximate deployment20:30UTC.


## 2026-11-10 19:50 UTC — Equipment card motion

Premium ItemArt now follows live OS/shared motion preferences, renders a nonblank still, pauses offscreen/hidden and resumes without a hidden-time jump. Baseline browser drew30frames/500ms while reduced. Fixed ../item-art-motion-check.cjs PASS0frames plus override/revoke, viewport/visibility pause-resume and cleanup. Initial fixed probe saw one settling frame with100ms media wait;500ms settling interval passed. Fifteen artwork/UI/site tests PASS2.51s; docs7282 PASS; build21859 PASS9.54s (SWmwb3sfoa), item-art-motion-build.log. No gameplay/save changes. Final release mobile remains pending. Local unsealed .11 has three generated website notes; live remains .10. Next approximate deployment20:30UTC.


## 2026-11-10 19:54 UTC — Hero gear preview motion

HeroGearPreview now honors live motion preferences, pauses offscreen/hidden and redraws on drag in still mode. Idle spin uses elapsed time at prior60Hz speed. Pointer cancel/lost capture ends dragging. Baseline browser29frames/500ms under reduce; fixed final6195 PASS0frames, visible pixel change on drag with real WEAPONS[0] equipment, no loop restart, override/revoke, offscreen/hidden pause-resume and cleanup. Fifteen artwork/UI/site tests PASS2.58s, docs16411 PASS. Build88220 PASS16.66s (SWmwb3x5eo), gear-preview-motion-build.log. Original full mobile64256 RUNNING against this dist, motion-controls-mobile.log. Four generated notes in unsealed .11 Motion and Map Controls. No gameplay/save changes. Live remains .10; next approximate deployment20:30UTC. Keyboard rotation remains a follow-up.


## 2026-11-10 19:58 UTC — Gear preview keyboard controls pending verification

UNCOMMITTED follow-up: HeroGearPreview wraps its canvas with two labeled native Left/Right44px buttons. Focus on controls pauses animation; blur out resumes by motion/visibility policy. Buttons rotate by PI/8 and repaint in either still/focused mode; canvas has named image role. EQUIPMENT.md and manifest updated. Prepared ../gear-preview-controls-check.cjs (NOT RUN) mounts real ItemDetails with isolated WEAPONS[0] exotic item, checks320/390/844, focus pause, Enter/Space, Tab order, target bounds/hit tests, reduced-motion keyboard rotation, screenshots. Original mobile64256 still confirmedrunning against PRE-keyboard dist. Do not run competing browser/heavy checks or overwrite dist. After terminal, run prepared controls probe, inspect screenshots, rerun motion probe, add fifth curated note, generate site, tests/docs/build, final mobile before release. Current keyboard changes are unvalidated, uncommitted and not yet in ledger; preserve them.


## 2026-11-10 20:02 UTC — Keyboard gear inspection verified

Original mobile64256 terminalPASS27nav+nine gameplay profiles on pre-keyboard build. New native Left/Right44px buttons verified in real ItemDetails at320/390/844: keyboard rotation, Tab order, focus pause/blur resume, target hit testing and reduced motion. Screenshots inspected; motion lifecycle rerun passed. Fifteen tests PASS2.26s, docs32157 PASS, build47084 PASS15.52s (SWmwb47opn). Five generated notes in local unsealed .11 Motion and Map Controls. Final release mobile remains pending. All handles terminal. Live .10 unchanged; next approximate deployment20:30UTC.


## 2026-11-10 20:07 UTC — Salvage confirmation stays visible

Salvage confirmation baseline at320x568: dialog top=-550.77,bottom=-341.23 after scroll730, entirely offscreen. ItemDetails now portals nested confirmation to viewport, uses alertdialog with linked warning, focuses Cancel, makes underlying box inert, traps Tab and restores invoking focus; Escape/backdrop/Cancel only cancel prompt.44px action targets and bounded scroll use shared --app-h. ../salvage-confirm-check.cjs final normal26417 and stronger-gear19618b probes PASS320/390/844: visible dialog, focus/trap, inert release, safe cancellation and actual isolated salvage. Warning screenshots inspected. Initial23test run82308 failed UI viewport-token rule; changed100dvh tovar(--app-h), replacement75347 passed23tests5.99s and build13.48s (SWmwb4exfh), salvage-confirm-build.log. Docs25457 PASS. Final full mobile pending; gameplay/salvage rules unchanged. Six generated notes in local unsealed .11 Motion and Map Controls. All handles terminal. Live .10 unchanged; next approximate deployment20:30UTC.


## 2026-11-10 20:11 UTC — Clearer Gear and Motion sealed

Favorite/item salvage lock/affix lock now have stable accessible names and aria-pressed; randomize names its affix. Isolated ../item-toggle-check.cjs PASS real keyboard toggles and preserved salvage protection. Sealed .11 Clearer Gear and Motion with SEVEN generated notes. Final23 UI/artwork/site/back tests PASS4.59s; docs77844 PASS; build19916 PASS11.17s (SWmwb4izai), clearer-gear-release-build.log, asset/assets/play-CSQGqZlk.js. ORIGINAL final mobile27718 RUNNING, clearer-gear-release-mobile.log. Production ref checked still2400521c2dbf87dda58e5e9f5d161fb4800e6cd2. No simulation/save changes. Deployment pending final mobile; live .10 unchanged.
