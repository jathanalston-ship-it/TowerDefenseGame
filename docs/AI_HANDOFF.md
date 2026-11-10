# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-11-10 17:54 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** codex/hive-autoplay · **HEAD:** 6754688b

## Summary of work completed

LIVE .8 Know What Is Coming remains SHA8950ec0d44d7f3959d988c4e6460b42f0a468ca0, verified17:42UTC. LOCAL unsealed .9 Read Your Build has two generated website notes. BuildPanel class-bond chips are now native44px disclosures with keyboard/touch access, current tier/unit accessible names, in-flow explanations and reading-key isolation. Baseline Tab skipped old span.tt chips (tabIndex-1); new disclosures pass. Daily display bug proven in actual GameView: account Kinetic4 showed+13% while run used level0/+10%. HUD bond snapshot now carries resolved level, and BuildPanel reads it instead of meta.bondLevels. Normal run remains+13%, Daily now+10%; no bond fold, combat, reward or save changes.

## Files modified

- Source (5): `src/changelog/releases.gen.ts`, `src/core/game.ts`, `src/core/types.ts`, `src/ui/BuildPanel.tsx`, `src/ui/GameView.css`
- Tests (1): `src/core/classBonds.test.ts`
- Docs (6): `docs/CLASS-BONDS.md`, `docs/HISTORY.md`, `docs/HUD.md`, `docs/PROJECT_MANIFEST.md`, `docs/devlog/DRAFT-2026-11-09.md`, `docs/devlog/DRAFT-2026-11-10.md`

## Systems affected (from the dependency registry)

- **chronicle** — `src/changelog/releases.gen.ts`
- **content-infra** — `src/core/types.ts`
- **engine** — `src/core/game.ts`
- **run-ui** — `src/ui/BuildPanel.tsx`
- Consumer ring (verify, unchanged): arena, audio, biomes, boss-rush, bosses, campaign, class-bonds, collection, currencies, daily, difficulty, doctrines, equipment, evolution-hq, gene-cards, hero-cinematics, hero-symbiotes, heroes, hive-mind, infinite, living-battlefield, loot, map-layouts, mastery, mega-bosses, meta-store, mulligans, nemesis, nucleus, onboarding, online-foundation, power, premium, rendering, threat, towers, website

## Power Score changes

None. Combat, economy, progression, Power formulas and saves unchanged.


None — no Power-relevant system touched.


TODO: a Power-relevant system changed — state what moved (scale, buckets, preview surfaces) and which tests pin it.

## UI changes

Live .5: readable reduced-motion gain/Power/Mastery notices; hero/tower portrait visibility and live motion lifecycle; keyboard focus/Tab/Escape for wardrobe and tower star ceremonies; complete Vault keyboard flow and live heartbeat/flash/shake settings; stable accessible reward totals alongside visual count-ups; reward placards held while hovered/focused/expanded and pinned through incoming bursts. Reading deadlines are separate from original merge timing.


Surfaces in the blast radius: `App (UpdateBriefing popup)`

TODO: what visually/behaviorally changed; note headless-smoke coverage.


Surfaces in the blast radius: `App (UpdateBriefing popup)`, `GameView`, `Hud`, `Toolbar`, `BuildControls`, `Inspector`, `BuildPanel`, `Results`, `ALL`

TODO: what visually/behaviorally changed; note headless-smoke coverage.

## Documentation changes

Canonical UI-MOTION, HERO-SYMBIOTES, COSMETICS, TOWER-LAB, LOOTBOX, NOTIFICATIONS plus release ledger/generated website and validation/status updated. No mechanic/tutorial/save changes required. DIL/PIL latest regeneration: zero structural findings,34 existing stale pairs.


Registry says these move with the touched systems: `docs/CHANGELOG-PIPELINE.md`

TODO: confirm each was updated or record "no change needed".


Registry says these move with the touched systems: `docs/CHANGELOG-PIPELINE.md`, `docs/CODEMAP.md`, `docs/CORE-FRAMEWORKS.md`, `docs/AUTHORING.md`, `docs/HIVE-MIND.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/EARLY-CALL.md`, `docs/POWER-SCORE.md`, `docs/POWER-AUDIT.md`, `docs/POWER-ADVISOR.md`, `docs/MISSION-CONTROL.md`, `docs/EVOLUTION-ROADMAP.md`, `docs/MULLIGANS.md`, `docs/PREMIUM-STORE.md`, `docs/PREMIUM-ECONOMY-REPORT.md`, `docs/ONLINE-FOUNDATION.md`, `docs/TRADING-PREP.md`, `docs/TOWER-STARS.md`, `docs/TOWER-BRANCHES.md`, `docs/TOWER-LAB.md`, `docs/TOWER-CODEX.md`, `docs/TOWERS.md`, `docs/STRAIN.md`, `docs/MASTERY.md`, `docs/ADAPTATION.md`, `docs/HEROES.md`, `docs/HERO-FRAMEWORK.md`, `docs/HERO-EVOLUTION.md`, `docs/HERO-SELECTION.md`, `docs/SLOTS.md`, `docs/EQUIPMENT.md`, `docs/EQUIPMENT-PHILOSOPHY.md`, `docs/LOOTBOX.md`, `docs/LOOT-PROGRESSION.md`, `docs/REWARD-PRESENTATION.md`, `docs/GENE-EVOLUTION.md`, `docs/CARDS.md`, `docs/GENE-AUDIT-REPORT.md`, `docs/NUCLEUS.md`, `docs/HERO-SYMBIOTES.md`, `docs/COLLECTION.md`, `docs/EVOLUTION-HQ.md`, `docs/GENOME-CORE.md`, `docs/EVOLUTION-CAP.md`, `docs/ECONOMY.md`, `docs/LEXICON.md`, `docs/ECONOMY_FORMULAS.md`, `docs/DEV-RESET.md`, `docs/SCALABILITY.md`, `docs/PROJECT_MANIFEST.md`, `docs/BOSS-DESIGN.md`, `docs/MEGA-BOSS.md`, `docs/BIOMES.md`, `docs/MAP-LAYOUTS.md`, `docs/DOCTRINES.md`, `docs/MODE-IDENTITY.md`, `docs/THREAT.md`, `docs/DIFFICULTY.md`, `docs/DIFFICULTY_DIRECTOR.md`, `docs/WEBSITE.md`, `docs/DEPLOYMENT.md`, `docs/CAMPAIGN.md`, `docs/CAMPAIGN-EVENTS.md`, `docs/STAGES.md`, `docs/ENDLESS-SCALING.md`, `docs/BOSS-RUSH.md`, `docs/DAILY-RUN.md`, `docs/ARENA.md`, `docs/ARENA_MATCH_REPORT.md`, `docs/HERO-CINEMATICS.md`, `docs/CLASS-BONDS.md`, `docs/NEMESIS.md`, `docs/TUTORIAL.md`, `docs/HELP.md`, `docs/TUTORIAL-AUDIT.md`, `docs/GUIDED-UNLOCKS.md`, `docs/HUD.md`, `docs/READABILITY.md`, `docs/RENDER-PIPELINE.md`, `docs/TOWER-VISUAL-EVOLUTION.md`, `docs/GAME-FEEL.md`, `docs/CAMERA.md`, `docs/COMBAT-VISUAL-STANDARDS.md`, `docs/LIVING-BATTLEFIELD.md`, `docs/MUSIC.md`, `docs/AUDIO.md`

TODO: confirm each was updated or record "no change needed".

## Save changes

None. Presentation only; reward queue model and persistence untouched.


None — save layer untouched.


None — save layer untouched.

## Known edge cases

Windows validate wrapper fails spawning npx shell:false; direct gates supplement. Chrome probes use headless=new compatibility shim. AX-tree checks do not prove speech output of every screen reader. Generated docs/devlog/DRAFT-2026-11-09.md is untracked/unpublished; do not stage. Custom-domain version.json is404: verify hashed game entry and matching website notes instead.


TODO: the sharp corners the next session should not rediscover.


TODO: the sharp corners the next session should not rediscover.

## Remaining technical debt

Windows validate wrapper cannot launch npx/npm with shell:false; use direct gates and record results honestly. Browser accessibility-tree checks do not establish speech output in every screen reader.


TODO: new debt introduced or observed (cross-reference docs/ENGINEERING-AUDIT.md §debt).


TODO: new debt introduced or observed (cross-reference docs/ENGINEERING-AUDIT.md §debt).

## Recommended next tasks

Build24359 terminal PASS18.69s; docs23726 terminalPASS. Fullsuite30801 remains live (bond-daily-full-tests.log). Poll it first, then run mobilecheck against current dist; avoid overlapping the heavy checks where possible. All other task processes terminal. Two .9 notes remain unsealed; live .8 unchanged. Continue toward18:42UTC hourly deployment. Next read-only candidate: BuildPanel Gene Card tooltip access/clipping. Do not stage untracked devlog drafts.

## Future expansion hooks

Existing RewardToaster presentation seams and resolveMotion remain the extension points. No new systems/files under src. Scratch browser probes in parent workspace: reward-reading-check.cjs (hover/focus/expanded hold, grace expiry, burst stability, unchanged merge windows); reward-announcement-check.cjs (AX stable totals); vault-focus-check.cjs and vault-focus-phone-check.cjs (keyboard flow); vault-motion-check.cjs; star-focus-check.cjs; wardrobe-focus-check.cjs; portrait and feedback motion probes. All focused probes passed. Reward reading change re-passed accessible totals probe. Earlier47 rewardToast/Vault tests and4 site tests passed. Validation history has full detail.

LOCAL .6 SFX control change: existing master fades20ms for volume/mute, latest ramp cancels old one, explicit current-time anchor, fallback supported; no context creation or synth/mix changes. ../volume-transition-check.cjs baseline single-step0.187501 ->0.000195 and silence. ../volume-sequence-check.cjs native/fallback rapid/interrupted volume/mute/unmute PASS max step0.000156, muted0, expected final0.112501.42 sound/music/cues tests PASS. Initial ramp without timed anchor failed offline sample check and was corrected; initial build found test Array.at lib mismatch, corrected. Final build87703 PASS; sound/site15 tests re-passed after compatibility correction. No browser/dev servers running.

LOCAL .6 music volume fix: old duck recovery restored0.296109 output after volume0 in real offline renderer. setVolume now cancels/holds prior automation, anchors current gain and keeps original100ms ramp. ../music-volume-check.cjs and ../music-volume-sequence-check.cjs native/fallback PASS for zero/rapid20->80% and duress multiplier (expected0.658559989,observed0.658559978).42 audio tests and4 site-sync tests PASS. Build45854 PASS (music-volume-build.log,Vite8.57s); all processes terminal. No dev/browser processes. Two Audio notes generated. No compositions/synths/mix levels changed.

Latest local .6: music toggle restores latest looping scene, including muted boss changes; skips stale one-shots and honors explicit stop. Baseline/after actual Chrome probe confirms fix.46 audio tests+4 site tests PASS; existing zero-volume and SFX sequence browser probes re-PASS. Build87156 terminal PASS (music-toggle-build.log,Vite9.06s). Three website Audio notes prepared. No running processes. Next deploy approximately06:38UTC. Live remains .5.

Latest local .6 shared mute: updateMasterVolume applies enabled state to100ms fade, used by toggle/volume; duress skips master updates while muted. Actual legendary-stinger offline probe baseline after-mute RMS0.017549 ->0; volume/duress while muted stay silent.47 audio+4 site tests PASS; toggle and rapid-volume/duress probes re-PASS. Four website notes prepared. Build28873 pending at this entry; next result supersedes it.

Final shared-mute production build28873 PASS (music-mute-build.log); all task processes terminal. Four notes prepared for .6; next approximate deployment06:38UTC. Live remains .5.

LATEST checkpoint06:04UTC:353 files/3155 full tests PASS (audio-batch-tests.log,150.14s,25991 terminal0). Shared AudioToggles keyboard/persistence/compact/mute independence/current-boss restoration browser PASS (../audio-controls-check.cjs production React bundle,no page errors). Initial Vite-only HMR socket error isolated by standalone bundle; dev93300 intentionally stopped. docs check23386 PASS anchors/references/freshness. FULL MOBILE29287 RUNNING against existing production dist, log audio-batch-mobile.log; poll same handle, never restart on observation timeout. No source edits this turn. ../verify-audio-release.ps1 now targets .6 title/notes and exact built asset; use after deployment. Next deployment approximately06:38UTC. Live remains .5; four local .6 notes.

LATEST: mobile29287 terminal PASS,CLEAN27navscreens+live runs across9viewports (audio-batch-mobile.log). All processes terminal. All current audio .6 gates complete:3155tests/build/47audio/4site/browsercontrol/offlineaudio/docs/mobile. No source changes since checks. Next audit candidate: src/ui/Toolbar.tsx hero auto-cast control visually ON/OFF but lacks aria-pressed (unlike other automation controls); inspect actual accessibility tree and fix if confirmed. Do not alter purchase semantics: before unlock it is a purchase button, after unlock a toggle; Hive-managed is disabled+on. Next approximate deploy06:38UTC; ../verify-audio-release.ps1 prepared. Live .5 remains unchanged.

LATEST .6 hero auto-cast fix: one aria-pressed expression in Toolbar, no gameplay/layout change. Actual Chrome AX baseline lacked pressed state; after fix purchase:none,on:true,off:false,Hive:true+disabled. Real Game buy/toggle/Hive APIs, Enter/Space exercised by ../autocast-accessibility-check.cjs. Initial fixture needed full build-env object; corrected then baseline/after worked.41 Hive/heroEvolution/site tests PASS. Full3155 and full mobile passed before this single attribute. Build19427 pending at this entry. Five website notes prepared. Next deploy~06:38UTC, live .5.

Final auto-cast accessibility build19427 PASS (autocast-accessibility-build.log), all processes terminal. Five notes local for .6; live remains .5.

LATEST .6 placement ARIA followup: Toolbar favorite and conveyor Deploy aria-pressed; conveyor aria-label includes organism/current Biomass cost or free. ../placement-accessibility-check.cjs baseline no states; after keyboard select/clear/switch AXstates PASS; free/paid labels PASS via normal wave-grown pod. Fixture first sim tick seeds gift; prep time does not grow paid pod, so probe starts wave. Auto-cast AX re-PASS.4 site-sync tests PASS; build23561 terminal0 (placement-accessibility-build.log). Full3155/mobile completed before four ARIA attributes across these followups; no visual/layout/gameplay changes. All processes terminal. Five local notes (combined UI note); next approx deploy06:38UTC. Live .5 remains. ../verify-audio-release.ps1 targets .6 game/home/news.

RELEASE .6 CHECKPOINT: sealed5notes, final build35451 PASS (audio-release-build.log), sealed siteSync4 PASS. All local processes terminal. Full3155/mobile9viewport before ARIA-only followups; actualGame/AXkeyboard probes cover latest attributes. Remote deploy branch remainsfa4f78bc. Publishing now; exact-SHA workflow and ../verify-audio-release.ps1 livechecks pending. Active continuous goal remains active.

LATEST DEPLOYMENT VERIFIED:4545bff2,Actions42767736604 SUCCESS; normal /play/ assetplay-BAy15d18.js HTTP200 + home/news title + all5 notes PASS06:22UTC. Initial custom-domain propagation checks saw .5, then normal URL reached .6; no intervention needed. All processes terminal. New batch next, .6 sealed. Next approx deployment07:22UTC. This docs-only checkpoint need not trigger another deploy.

LATEST LOCAL .7 Clearer Battlefield Choices,oneUI note: Toolbar corrects free starting gift recycle50shown/0paid mismatch to0; focus after consumed merge/recycle ->remaining enabledDeploy,favorite,namedconveyor group; only when consumed button hadfocus and noothercontrol nowfocused. Merge/recycle names includeorganism+amount. ../conveyor-recycle-check.cjs baseline/bodyfocus andafterPASS; ../conveyor-focus-check.cjs paidrefund/nextdeploy/favorite/merge/poor-group/unrelatedfocusPASS. Initial long-wave fixturelost beforeaction; validhighintegritymeta fixture thenPASS.20 conveyor/site testsPASS; build65033terminal0 (conveyor-focus-build.log). No processes. Live .6 unchanged; .7 unsealed. Next approxdeploy07:22UTC. Potential next targeted audit: Toolbar discard still calls audio.cue(dissolve), while Game.discardConveyor also queues dissolve; verify actual delivery before changing.

LATEST LOCAL .7: recycle duplicate confirmed/fixed. ../recycle-audio-check.cjs mounts actual GameView: baseline directdissolve1+queued1; now queued1only, staleconsumedidfalse and0cues. Removedone Toolbar audio.cue; sim/mix unchanged. Known fixtureViteHMRsocket warning excluded from producterrorlist.35 conveyor/sound/cues/site tests5415PASS; build40516PASS (recycle-audio-build.log,Vite6.17s). Dev4900 intentionallystopped. All processes terminal. Two .7notes prepared. Live .6 unchanged; nextapprox07:22UTC.

LATEST .7 Inspector confirmations: local TowerConfirmation+Popup adds namedmodal, safeCancel, Tabtrap, allkeyisolation, Escape+focusrestore; fallbackfocusnamedInspector ifopenergone/disabled. Pause subscription closespendingprompt. No globalBackpolicychange: runBackstillPause. Baseline no role/focus/Escape; actualGameView Back originallyleft2dialogs (confirmoverPause,focusbehind), now1Pause andresumefocusmut-buy. ../inspector-confirm-matrix.cjs PASS realGame keyboard/transaction/Back; ../inspector-pause-check.cjs fullGameView PASS Back/Pause/Resume; ../inspector-confirm-layout.cjs actualCSS/fonts2dialogsx3viewportsPASS.29testsPASS; build96060PASS. All processes terminal. Three .7 notes local, live .6 unchanged,nextapprox07:22UTC. Fullbatchgates stillneededbefore .7publish.

LATEST .7 BranchTree focus: baselineTier5 purchase->BODY; now focusselectedtierpreview ifbuyremoved/disabled, retainnextbuyifavailable, donotstealunrelatedfocus. ../branch-final-focus-check.cjs --assert / --poor / --outside PASS; confirmationmatrixrePASS. Fixture100k lacked160kfinalprice; corrected1mfixtureverifiedcompletionandkeptpoorcase.20testsPASS; build28850PASS Vite6.20s. Full3155batchsuite19178PASS164.59s (startedbeforefollowup); docs34520PASS. MOBILE63403RUNNING onfinaldist, logbattlefield-batch-mobile.log, pollsameworker. Four noteslocal. Live.6unchanged,nextdeploy~07:22UTC.

Local v2026.11.10.1 now has two notes: Hero Ops uses effective abilityCdMax and reports recovery/armed state accurately, plus run controls. Actual Chrome probe reproduced half-progress .75/.25 with cooldown modifiers; now .5 for1/.5/1.5 multipliers. Recovery7s, armed, fully ready and AX image name plus ability description PASS.24 heroes/equipment/evolution and4 site tests PASS. Docs check PASS. No core/CSS/save/cost changes; not deployed. Both generated devlog drafts remain unpublished.

Hero readiness final build65590 PASS (Vite7.59s); all processes terminal. Next release remains roughly08:14UTC with matching website notes; live .7 unchanged.





TODO: seams deliberately left open (name the file + symbol).


TODO: seams deliberately left open (name the file + symbol).

## 2026-11-10 16:57 UTC — wave briefing checkpoint

LIVE remains v2026.11.10.7, SHA b441f62cf0512d7da5c8d0692d53d3927fead962, verified normal game/home/news with five notes. LOCAL .8 Know What Is Coming has one generated website note. Incoming-wave reward/enemy/adaptation chips now open a readable detail region outside the mobile scroller. Base Biomass/HP/armor and inclusive elite counts are explicit. Keyboard opening, Escape/Close restoration, preview-change dismissal, reading-key isolation, phone/landscape geometry and real-game launch/inert behavior pass the isolated Chrome probe. No core, balance or save changes. Continuous goal remains active.

Poll existing handles, never restart on observation timeout: final production build21016 (wave-briefing-release-build.log); full regression suite77517 (wave-briefing-full-tests.log); browser probe60232 printed PASS but Chrome shutdown was still live at last poll. Earlier builds90994 and19517 succeeded; latter predates final reading-key isolation.13 registry/site tests and docs check PASS. After final build completes, run mobilecheck against its dist, then continue improvements toward approximate17:41 UTC deployment. .8 remains unsealed; regenerate/build if further changes. Existing Windows validate wrapper launcher failure reproduced (wave-briefing-wrapper-report.log); direct gates required. Do not stage the two untracked devlog drafts.





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
